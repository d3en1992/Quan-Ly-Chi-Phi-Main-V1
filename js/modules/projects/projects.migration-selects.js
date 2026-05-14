// projects.migration-selects.js — Migration linking + shared dropdown helpers
// Load order: sau projects.model.js, trước projects.ui.js

// ══════════════════════════════════════════════════════════════════
//  MIGRATION — projectId linking
// ══════════════════════════════════════════════════════════════════

/**
 * migrateProjectLinks()
 *
 * Chạy một lần lúc khởi động (sau khi tất cả data đã load).
 * Với mỗi record chưa có projectId:
 *   - Tìm project theo name === congtrinh (hoặc ct)
 *   - Nếu không tìm thấy → tạo project mới tự động
 *   - Gán projectId vào record, giữ nguyên congtrinh/ct cũ
 *
 * Idempotent: chạy nhiều lần vẫn an toàn — record đã có projectId sẽ bị bỏ qua.
 *
 * Field mapping theo module:
 *   invoices   → .congtrinh  (special: 'CÔNG TY' → 'COMPANY')
 *   ccData     → .ct         (không có congtrinh)
 *   ungRecords → .congtrinh
 *   tbData     → .ct         (special: 'KHO TỔNG' → 'COMPANY')
 *   thuRecords → .congtrinh
 */
function migrateProjectLinks() {
  const changes = { inv: 0, cc: 0, ung: 0, tb: 0, thu: 0 };

  // ── Pass 1: Gán projectId cho records chưa có ──────────────────
  // Dùng findProjectIdByName() global — hỗ trợ accent-insensitive
  invoices.forEach(rec => {
    if (rec.deletedAt || rec.projectId) return;
    const pid = findProjectIdByName(rec.congtrinh);
    if (pid) { rec.projectId = pid; changes.inv++; }
  });
  if (typeof ccData !== 'undefined') {
    ccData.forEach(rec => {
      if (rec.deletedAt || rec.projectId) return;
      const pid = findProjectIdByName(rec.ct);
      if (pid) { rec.projectId = pid; changes.cc++; }
    });
  }
  if (typeof ungRecords !== 'undefined') {
    ungRecords.forEach(rec => {
      if (rec.deletedAt || rec.projectId) return;
      const pid = findProjectIdByName(rec.congtrinh);
      if (pid) { rec.projectId = pid; changes.ung++; }
    });
  }
  if (typeof tbData !== 'undefined') {
    tbData.forEach(rec => {
      if (rec.deletedAt || rec.projectId) return;
      const pid = findProjectIdByName(rec.ct);
      if (pid) { rec.projectId = pid; changes.tb++; }
    });
  }
  if (typeof thuRecords !== 'undefined') {
    thuRecords.forEach(rec => {
      if (rec.deletedAt || rec.projectId) return;
      const pid = findProjectIdByName(rec.congtrinh);
      if (pid) { rec.projectId = pid; changes.thu++; }
    });
  }

  // ── Pass 2: Sync name fields from projectId (handles renames) ────
  // [MODIFIED] — sync ALL modules, not just invoices
  invoices.forEach(rec => {
    if (rec.deletedAt || !rec.projectId) return;
    const p = getProjectById(rec.projectId);
    if (p && p.name && p.name !== rec.congtrinh) {
      rec.congtrinh = p.name;
      changes.inv++;
    }
  });
  // [ADDED] — sync ccData .ct from projectId
  if (typeof ccData !== 'undefined') {
    ccData.forEach(rec => {
      if (rec.deletedAt || !rec.projectId) return;
      const p = getProjectById(rec.projectId);
      if (p && p.name && p.name !== rec.ct) {
        rec.ct = p.name; changes.cc++;
      }
    });
  }
  // [ADDED] — sync tbData .ct from projectId
  if (typeof tbData !== 'undefined') {
    tbData.forEach(rec => {
      if (rec.deletedAt || !rec.projectId) return;
      const p = getProjectById(rec.projectId);
      if (p && p.name && p.name !== rec.ct) {
        rec.ct = p.name; changes.tb++;
      }
    });
  }
  // [ADDED] — sync ungRecords .congtrinh from projectId
  if (typeof ungRecords !== 'undefined') {
    ungRecords.forEach(rec => {
      if (rec.deletedAt || !rec.projectId) return;
      const p = getProjectById(rec.projectId);
      if (p && p.name && p.name !== rec.congtrinh) {
        rec.congtrinh = p.name; changes.ung++;
      }
    });
  }
  // [ADDED] — sync thuRecords .congtrinh from projectId
  if (typeof thuRecords !== 'undefined') {
    thuRecords.forEach(rec => {
      if (rec.deletedAt || !rec.projectId) return;
      const p = getProjectById(rec.projectId);
      if (p && p.name && p.name !== rec.congtrinh) {
        rec.congtrinh = p.name; changes.thu++;
      }
    });
  }

  // ── Pass 3: Gán source cho invoices cũ chưa có ───────────────────
  invoices.forEach(rec => {
    if (rec.deletedAt || rec.source) return;
    rec.source = (rec.items && rec.items.length) ? 'detail' : 'quick';
    changes.inv++;
  });

  // Persist only what changed
  if (changes.inv || changes.cc) clearInvoiceCache();
  if (changes.inv) save('inv_v3', invoices);
  if (changes.cc)  save('cc_v2',  ccData);
  if (changes.ung) save('ung_v1', ungRecords);
  if (changes.tb)  save('tb_v1',  tbData);
  if (changes.thu) save('thu_v1', thuRecords);

  const total = Object.values(changes).reduce((a, b) => a + b, 0);
  if (total > 0) console.log(`[migrateProjectLinks] Normalized ${total} records`);

  rebuildCatCTFromProjects();
}

/**
 * Gộp projects có cùng tên (accent-insensitive).
 * Giữ project cũ nhất (createdAt nhỏ nhất). Đánh dấu bản sao với deletedAt.
 * Cập nhật projectId trong tất cả records trỏ đến bản sao → trỏ vào canonical.
 * Idempotent — an toàn khi gọi nhiều lần.
 */
function deduplicateProjects() {
  const _norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

  // Gom nhóm theo tên đã normalize
  const byNorm = {};
  projects.filter(p => !p.deletedAt).forEach(p => {
    const key = _norm(p.name);
    if (!byNorm[key]) byNorm[key] = [];
    byNorm[key].push(p);
  });

  // Build mergeMap: dupeId → keeperId
  const mergeMap = {};
  Object.values(byNorm).forEach(group => {
    if (group.length <= 1) return;
    // Giữ project cũ nhất
    group.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const keeper = group[0];
    group.slice(1).forEach(dupe => {
      mergeMap[dupe.id] = keeper.id;
      dupe.deletedAt    = Date.now();
      dupe._mergedInto  = keeper.id;
    });
  });

  if (!Object.keys(mergeMap).length) return; // không có dupe → thoát sớm

  // Remap projectId trong tất cả records
  const remap = id => mergeMap[id] || id;
  const saves = { inv: false, cc: false, ung: false, tb: false, thu: false };

  invoices.forEach(r => { if (r.projectId && mergeMap[r.projectId]) { r.projectId = remap(r.projectId); saves.inv = true; } });
  if (typeof ccData      !== 'undefined') ccData.forEach(r      => { if (r.projectId && mergeMap[r.projectId]) { r.projectId = remap(r.projectId); saves.cc  = true; } });
  if (typeof ungRecords  !== 'undefined') ungRecords.forEach(r  => { if (r.projectId && mergeMap[r.projectId]) { r.projectId = remap(r.projectId); saves.ung = true; } });
  if (typeof tbData      !== 'undefined') tbData.forEach(r      => { if (r.projectId && mergeMap[r.projectId]) { r.projectId = remap(r.projectId); saves.tb  = true; } });
  if (typeof thuRecords  !== 'undefined') thuRecords.forEach(r  => { if (r.projectId && mergeMap[r.projectId]) { r.projectId = remap(r.projectId); saves.thu = true; } });

  _saveProjects();
  if (saves.inv || saves.cc) clearInvoiceCache();
  if (saves.inv) save('inv_v3', invoices);
  if (saves.cc)  save('cc_v2',  ccData);
  if (saves.ung) save('ung_v1', ungRecords);
  if (saves.tb)  save('tb_v1',  tbData);
  if (saves.thu) save('thu_v1', thuRecords);

  console.log(`[deduplicateProjects] Merged ${Object.keys(mergeMap).length} duplicate projects`);
  rebuildCatCTFromProjects();
}

// ══════════════════════════════════════════════════════════════════
//  SHARED UI HELPERS — dùng bởi tất cả module
// ══════════════════════════════════════════════════════════════════

/**
 * Tạo <option> HTML cho **entry form** dropdown chọn công trình.
 * - includeCompany=true (mặc định): thêm CÔNG TY vào đầu (cho form nhập chi phí chung)
 * - activeYear = 0 → hiện tất cả; có năm → chỉ hiện project thuộc năm đó (_ctInActiveYear)
 * - selectedName luôn giữ để edit data cũ không bị mất
 * value = project.name | data-pid = project.id
 */
function _buildProjOpts(selectedName, placeholder = '-- Chọn công trình --', { includeCompany = true } = {}) {
  const projs = getAllProjects(); // không có COMPANY
  const base  = includeCompany ? [PROJECT_COMPANY, ...projs] : projs;
  const filtered = (typeof activeYear === 'undefined' || activeYear === 0)
    ? base
    : base.filter(p => {
        if (p.id === 'COMPANY') return true; // COMPANY luôn có nếu includeCompany
        if (p.name === selectedName) return true; // giữ giá trị hiện tại khi edit
        return _ctInActiveYear(p.name);
      });
  return `<option value="">${placeholder}</option>` +
    filtered.map(p => {
      const sel = p.name === selectedName ? ' selected' : '';
      return `<option value="${x(p.name)}" data-pid="${p.id}"${sel}>${x(p.name)}</option>`;
    }).join('');
}

/**
 * Tạo <option> HTML cho **filter dropdown** (không phải entry form).
 * - COMPANY không hiện mặc định (includeCompany=false)
 * - Lọc theo _ctInActiveYear (name-based + data-based)
 * - currentVal luôn giữ để không mất giá trị filter
 */
function _buildProjFilterOpts(currentVal = '', { includeCompany = false, placeholder = '-- Tất cả công trình --' } = {}) {
  const projs = getAllProjects();
  const base  = includeCompany ? [PROJECT_COMPANY, ...projs] : projs;
  const filtered = (typeof activeYear === 'undefined' || activeYear === 0)
    ? base
    : base.filter(p => {
        if (p.id === 'COMPANY') return includeCompany;
        if (p.name === currentVal) return true;
        return _ctInActiveYear(p.name);
      });
  return `<option value="">${placeholder}</option>` +
    filtered.map(p => `<option value="${x(p.name)}"${p.name === currentVal ? ' selected' : ''}>${x(p.name)}</option>`).join('');
}

/**
 * Đọc projectId từ <select> element đang được chọn.
 * Trả về null nếu không có (tương thích ngược).
 */
function _readPidFromSel(sel) {
  return sel?.selectedOptions?.[0]?.dataset?.pid || null;
}

/**
 * Kiểm tra closed và hiển thị toast nếu bị block.
 * Trả về true nếu bị block (caller nên return).
 */
function _checkProjectClosed(pid, ctName) {
  if (!pid || pid === 'COMPANY') return false;
  const proj = getProjectById(pid);
  if (proj && proj.status === 'closed') {
    toast(`🔒 Công trình "${ctName}" đã quyết toán — không thể thêm dữ liệu mới!`, 'error');
    return true;
  }
  return false;
}
