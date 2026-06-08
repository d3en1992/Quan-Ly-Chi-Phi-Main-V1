// thietbi.js — Theo Doi Thiet Bi
// Load order: 5

//  THEO DÕI THIẾT BỊ (tb_v1)
// ══════════════════════════════════════════════════════════════════
const TB_TINH_TRANG = ['Đang hoạt động', 'Cần bảo trì', 'Cần sửa chữa'];
const TB_TEN_MAY = [
  'Máy cắt cầm tay', 'Máy cắt bàn', 'Máy uốn sắt lớn', 'Bàn uốn sắt',
  'Thước nhôm', 'Chân Dàn 1.7m', 'Chân Dàn 1.5m',
  'Chéo lớn', 'Chéo nhỏ', 'Kít tăng giàn giáo', 'Cây chống tăng'
];
const TB_KHO_TONG = 'KHO TỔNG';
const TB_STATUS_STYLE = {
  'Đang hoạt động': 'background:var(--bs-success-subtle);color:var(--bs-success);',
  'Cần bảo trì':  'background:var(--bs-warning-subtle);color:var(--bs-warning);',
  'Cần sửa chữa':   'background:var(--bs-danger-subtle);color:var(--bs-danger);'
};

let tbData = load('tb_v1', []);

// ── Helper: kiểm tra record thuộc KHO TỔNG ────────────────────────
function isKhoTong(r) {
  return r.projectId === 'COMPANY';
}

// ══════════════════════════════════════════════════════════════════
// [MIGRATION] Chuẩn hóa dữ liệu cũ — chạy 1 lần khi load
// - ct === "KHO TỔNG" mà thiếu projectId → set projectId = "COMPANY"
// - projectId === "COMPANY" mà ct !== "KHO TỔNG" → set ct = "KHO TỔNG"
// - Gộp record trùng (projectId + ten + tinhtrang) → cộng dồn số lượng
// - KHÔNG xóa record, KHÔNG thay đổi lịch sử
// ══════════════════════════════════════════════════════════════════
function migrateTbData() {
  let changed = false;

  // Phase 1: Fix projectId / ct cho KHO TỔNG
  tbData.forEach(r => {
    if (r.deletedAt) return;
    // Case 1: ct là KHO TỔNG nhưng thiếu hoặc sai projectId
    if (r.ct === TB_KHO_TONG && r.projectId !== 'COMPANY') {
      r.projectId = 'COMPANY';
      changed = true;
    }
    // Case 2: projectId là COMPANY nhưng ct không phải KHO TỔNG (bị normalize sai thành "CÔNG TY")
    if (r.projectId === 'COMPANY' && r.ct !== TB_KHO_TONG) {
      r.ct = TB_KHO_TONG;
      changed = true;
    }
  });

  // Phase 2 (Bonus): Gộp record trùng (projectId + ten + tinhtrang)
  // Chỉ gộp record chưa bị xóa
  const dedup = new Map();
  const toRemove = new Set();
  tbData.forEach((r, idx) => {
    if (r.deletedAt) return;
    const key = (r.projectId || r.ct || '') + '||' + (r.ten || '') + '||' + (r.tinhtrang || '');
    if (dedup.has(key)) {
      const primary = dedup.get(key);
      // Cộng dồn số lượng vào record đầu tiên
      primary.soluong = (primary.soluong || 0) + (r.soluong || 0);
      // Giữ updatedAt / ngày mới nhất
      if ((r.updatedAt || 0) > (primary.updatedAt || 0)) {
        primary.updatedAt = r.updatedAt;
        primary.ngay = r.ngay || primary.ngay;
      }
      if (r.ghichu && !primary.ghichu) primary.ghichu = r.ghichu;
      // Soft-delete record trùng
      r.deletedAt = Date.now();
      r.updatedAt = Date.now();
      changed = true;
    } else {
      dedup.set(key, r);
    }
  });

  if (changed) {
    save('tb_v1', tbData);
    console.log('[TB Migration] Đã chuẩn hóa dữ liệu thiết bị (KHO TỔNG projectId + dedup)');
  }
}

// Auto chạy migration ngay sau khi load data
migrateTbData();

// [ADDED] — Normalize thietbi to projectId at runtime
function _normalizeTbProjectIds() {
  let changed = false;
  tbData.forEach(r => {
    if (r.deletedAt) return;
    // KHO TỔNG: đảm bảo projectId = "COMPANY" và ct = TB_KHO_TONG
    if (r.ct === TB_KHO_TONG || r.projectId === 'COMPANY') {
      if (r.projectId !== 'COMPANY') { r.projectId = 'COMPANY'; changed = true; }
      if (r.ct !== TB_KHO_TONG) { r.ct = TB_KHO_TONG; changed = true; }
      return;
    }
    // Công trình thực: normalize projectId từ ct
    if (!r.projectId && r.ct) {
      const pid = _getProjectIdByName(r.ct);
      if (pid) { r.projectId = pid; changed = true; }
    }
    if (r.projectId) {
      const pName = _getProjectNameById(r.projectId);
      if (pName && pName !== r.ct) {
        r.ct = pName; changed = true;
      }
    }
  });
  if (changed) save('tb_v1', tbData);
}
_normalizeTbProjectIds();

// ── Chuẩn hóa tên thiết bị: viết hoa chữ cái đầu mỗi từ ─────────
function normalizeTbName(name) {
  return (name || '').trim().toLowerCase()
    .split(/\s+/).filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ── Dynamic name list: CHỈ lấy từ cats.tbTen ──────────────────────
function tbGetNames() {
  const catList = (cats && cats.tbTen && cats.tbTen.length) ? cats.tbTen : TB_TEN_MAY;
  return [...catList].sort((a,b) => a.localeCompare(b,'vi'));
}

function tbRefreshNameDl() {
  const dl = document.getElementById('tb-ten-dl');
  if (!dl) return;
  dl.innerHTML = tbGetNames().map(n=>`<option value="${x(n)}">`).join('');
}

// ── Populate selects ──────────────────────────────────────────────
function tbPopulateSels() {
  const sel = document.getElementById('tb-ct-sel');
  const cur = sel.value;
  // Entry select: KHO TỔNG (= COMPANY) + projects thuộc năm đang chọn
  const _entryProjs = (typeof getAllProjects === 'function' ? getAllProjects() : [])
    .filter(p => activeYear === 0 || p.name === cur || _ctInActiveYear(p.name));
  sel.innerHTML = '<option value="">-- Chọn công trình --</option>' +
    `<option value="${TB_KHO_TONG}" data-pid="COMPANY"${cur===TB_KHO_TONG?' selected':''}>${TB_KHO_TONG}</option>` +
    _entryProjs.map(p=>`<option value="${x(p.name)}" data-pid="${p.id}"${p.name===cur?' selected':''}>${x(p.name)}</option>`).join('');

  // Filter select: KHO TỔNG + projects thuộc năm đang chọn
  const fSel = document.getElementById('tb-filter-ct');
  const fCur = fSel.value;
  const _filterProjs = (typeof getAllProjects === 'function' ? getAllProjects() : [])
    .filter(p => activeYear === 0 || _ctInActiveYear(p.name));
  fSel.innerHTML = `<option value="">Tất cả công trình</option>` +
    `<option value="${TB_KHO_TONG}"${fCur===TB_KHO_TONG?' selected':''}>${TB_KHO_TONG}</option>` +
    _filterProjs.map(p=>`<option value="${x(p.name)}"${p.name===fCur?' selected':''}>${x(p.name)}</option>`).join('');

  // Bộ lọc tên KHO: chỉ lấy tên thiết bị có trong cats.tbTen
  const validNames = new Set((cats.tbTen || []).map(n => n.toLowerCase()));
  const khoFSel = document.getElementById('kho-filter-ten');
  if (khoFSel) {
    const khoNames = [...new Set(
      tbData.filter(r => !r.deletedAt && isKhoTong(r) && recCatName(r,'tb','ten') && validNames.has(recCatName(r,'tb','ten').toLowerCase()))
            .map(r => recCatName(r,'tb','ten'))
    )].sort((a,b) => a.localeCompare(b,'vi'));
    const khoFCur = khoFSel.value;
    khoFSel.innerHTML = '<option value="">Tất cả thiết bị</option>' +
      khoNames.map(v=>`<option value="${x(v)}" ${v===khoFCur?'selected':''}>${x(v)}</option>`).join('');
  }

  // Bộ lọc tên Thống Kê: chỉ lấy từ cats.tbTen
  const tkFSel = document.getElementById('tk-filter-ten');
  if (tkFSel) {
    const tkNames = tbGetNames();
    const tkFCur = tkFSel.value;
    tkFSel.innerHTML = '<option value="">Tất cả thiết bị</option>' +
      tkNames.map(v=>`<option value="${x(v)}" ${v===tkFCur?'selected':''}>${x(v)}</option>`).join('');
  }
}

// ── Build nhập bảng ───────────────────────────────────────────────
function tbBuildRows(n=5) {
  const tbody = document.getElementById('tb-tbody');
  tbody.innerHTML = '';
  for (let i=0; i<n; i++) tbAddRow(null, i+1);
}

function tbAddRows(n) {
  const tbody = document.getElementById('tb-tbody');
  const cur = tbody.querySelectorAll('tr').length;
  for (let i=0; i<n; i++) tbAddRow(null, cur+i+1);
}

// Rebuild options trong các select tên thiết bị đang hiển thị trong bảng nhập
function tbRefreshTenSel() {
  const names = tbGetNames();
  document.querySelectorAll('#tb-tbody [data-tb="ten"]').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = '<option value="">-- Chọn --</option>' +
      names.map(n => `<option value="${x(n)}" ${n===cur?'selected':''}>${x(n)}</option>`).join('');
    sel.value = cur;
  });
}

function tbAddRow(data, num) {
  const tbody = document.getElementById('tb-tbody');
  const idx = num || (tbody.querySelectorAll('tr').length + 1);
  const tr = document.createElement('tr');

  const ttOpts = TB_TINH_TRANG.map(v =>
    `<option value="${v}" ${data&&data.tinhtrang===v?'selected':v==='Đang hoạt động'&&!data?'selected':''}>${v}</option>`
  ).join('');

  // Tên thiết bị: CHỈ chọn từ cats.tbTen (không nhập tự do)
  const names = tbGetNames();
  const tenOpts = '<option value="">-- Chọn --</option>' +
    names.map(n => `<option value="${x(n)}" ${data&&data.ten===n?'selected':''}>${x(n)}</option>`).join('');

  tr.innerHTML = `
    <td class="row-num">${idx}</td>
    <td class="tb-name-col" style="padding:0">
      <select data-tb="ten"
        style="width:100%;border:none;background:transparent;padding:7px 10px;font-size:13px;font-family:'IBM Plex Sans',sans-serif;outline:none;color:var(--ink);cursor:pointer">
        ${tenOpts}
      </select>
    </td>
    <td style="padding:0">
      <input type="number" data-tb="soluong" class="np-num-input" min="0" step="1" inputmode="decimal"
        value="${data?.soluong||''}" placeholder="0"
        style="width:100%;border:none;background:transparent;padding:7px 8px;text-align:center;font-size:13px;font-family:'IBM Plex Mono',monospace;outline:none;color:var(--ink)">
    </td>
    <td style="padding:0">
      <select data-tb="tinhtrang"
        style="width:100%;border:none;background:transparent;padding:7px 8px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;outline:none;color:var(--ink);cursor:pointer">
        ${ttOpts}
      </select>
    </td>
    <td style="padding:0">
      <input class="cc-name-input" data-tb="ghichu"
        value="${x(data?.ghichu||'')}" placeholder="—"
        style="width:100%;border:none;background:transparent;padding:7px 8px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;outline:none;color:var(--ink)">
    </td>
    <td style="padding:3px 4px;text-align:center">
      <button class="btn btn-danger btn-sm" onclick="this.closest('tr').remove();tbRenum()" title="Xóa dòng">✕</button>
    </td>`;
  tbody.appendChild(tr);
}

function tbRenum() { renumberRows('#tb-tbody'); }

function tbClearRows() {
  if (!confirm('Xóa bảng nhập?')) return;
  tbBuildRows();
}

// ── Lưu thiết bị ─────────────────────────────────────────────────
function tbSave() {
  const saveBtn = document.getElementById('tb-save-btn');
  if (saveBtn && saveBtn.disabled) return;
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ Đang lưu...'; }

  const tbCtSel = document.getElementById('tb-ct-sel');
  const ct    = tbCtSel.value.trim();
  const ctPid = _readPidFromSel(tbCtSel);
  if (!ct) {
    toast('Vui lòng chọn công trình!', 'error');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Lưu thiết bị'; }
    return;
  }
  if (_checkProjectClosed(ctPid, ct)) {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Lưu thiết bị'; }
    return;
  }

  const rows = [];
  const ngay = today();
  document.querySelectorAll('#tb-tbody tr').forEach(tr => {
    const ten    = tr.querySelector('[data-tb="ten"]')?.value || '';
    const sl     = parseFloat(tr.querySelector('[data-tb="soluong"]')?.value) || 0;
    const tt     = tr.querySelector('[data-tb="tinhtrang"]')?.value || 'Đang hoạt động';
    const ghichu = tr.querySelector('[data-tb="ghichu"]')?.value?.trim() || '';
    if (ten) rows.push({ ten, soluong: sl, tinhtrang: tt, ghichu });
  });

  if (!rows.length) {
    toast('Không có dữ liệu để lưu!', 'error');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Lưu thiết bị'; }
    return;
  }

  // Chuẩn hóa: cộng dồn nếu đã tồn tại record cùng (projectId + ten + tinhtrang)
  // QUAN TRỌNG: chỉ tìm record CHƯA bị xóa — tránh update deleted record
  // KHO TỔNG luôn có projectId = "COMPANY", KHÔNG BAO GIỜ null
  const savePid = ct === TB_KHO_TONG ? 'COMPANY' : (ctPid || null);
  rows.forEach(row => {
    const exist = tbData.find(rec => !rec.deletedAt && rec.ten === row.ten && rec.tinhtrang === row.tinhtrang &&
      (savePid ? (rec.projectId === savePid) : rec.ct === ct));
    if (exist) {
      exist.soluong = (exist.soluong || 0) + row.soluong;
      exist.ngay = ngay;
      exist.updatedAt = Date.now();
      exist.deviceId  = DEVICE_ID;
      if (row.ghichu) exist.ghichu = row.ghichu;
      if (savePid) { exist.projectId = savePid; }
      if (savePid === 'COMPANY') { exist.ct = TB_KHO_TONG; }
      else { const n = _getProjectNameById(savePid); if (n) exist.ct = n; }
    } else {
      tbData.push(mkRecord({ ct, projectId: savePid, ...row, ngay }));
    }
  });

  save('tb_v1', tbData);
  // Reset về trang 1 + xóa filter để record vừa lưu luôn hiển thị
  tbPage = 1;
  const _fSel = document.getElementById('tb-filter-ct');
  if (_fSel) _fSel.value = '';
  tbRefreshTenSel();
  tbPopulateSels();
  tbRenderList();
  tbRenderThongKeVon();
  renderKhoTong();
  tbBuildRows();
  toast(`✅ Đã lưu ${rows.length} thiết bị vào ${ct}`, 'success');
  setTimeout(() => {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Lưu thiết bị'; }
  }, 1500);
}

// ── Render bảng danh sách (Công Trình — không gồm KHO TỔNG) ──────
const TB_PG = 10;
let tbPage = 1;

function tbRenderList() {
  const fCt = document.getElementById('tb-filter-ct')?.value || '';
  const fTt = document.getElementById('tb-filter-tt')?.value || '';
  const fQ  = (document.getElementById('tb-search')?.value || '').toLowerCase().trim();
  let filtered = tbData.filter(r => {
    // Bảng này chỉ hiển thị thiết bị tại công trình, không gồm KHO TỔNG
    if (r.deletedAt) return false;
    if (isKhoTong(r) || r.ct === TB_KHO_TONG) return false;
    // [MODIFIED] — filter by projectId or ct
    if (fCt && !(r.projectId === fCt || r.ct === fCt)) return false;
    if (fTt && r.tinhtrang !== fTt) return false;
    if (fQ && !recCatName(r,'tb','ten').toLowerCase().includes(fQ) && !(r.nguoi||'').toLowerCase().includes(fQ) && !(r.ghichu||'').toLowerCase().includes(fQ)) return false;
    if (typeof activeYears !== 'undefined' ? activeYears.size > 0 : activeYear !== 0) {
      const ctActive = _entityInYear(r.ct, 'ct') || inActiveYear(r.ngay);
      const isRunning = r.tinhtrang === 'Đang hoạt động';
      if (!ctActive && !isRunning) return false;
    }
    return true;
  });

  // Nhóm theo CT khớp với thứ tự Master: resolve display name cho từng record
  const projOrder = getAllProjects().map(p => p.name);
  const getProjIdx = (name) => {
    const idx = projOrder.indexOf(name);
    return idx === -1 ? 999 : idx;
  };

  filtered.sort((a,b) => {
    const ctA = _resolveCtName(a);
    const ctB = _resolveCtName(b);
    if (ctA !== ctB) return getProjIdx(ctA) - getProjIdx(ctB);
    return recCatName(a,'tb','ten').localeCompare(recCatName(b,'tb','ten'), 'vi');
  });

  const tbody = document.getElementById('tb-list-tbody');
  const start = (tbPage-1)*TB_PG;
  const paged = filtered.slice(start, start+TB_PG);

  if (!paged.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Chưa có thiết bị nào${fCt?' tại '+fCt:''}</td></tr>`;
    document.getElementById('tb-pagination').innerHTML = '';
    return;
  }

  tbody.innerHTML = paged.map(r => {
    const ttStyle = TB_STATUS_STYLE[r.tinhtrang] || '';
    const ttOpts = TB_TINH_TRANG.map(v =>
      `<option value="${v}" ${r.tinhtrang===v?'selected':''}>${v}</option>`
    ).join('');
    const ctDisplay = _resolveCtName(r); // [MODIFIED] resolve from projectId
    return `<tr data-tbid="${r.id}">
      <td class="tb-ct-col" title="${x(ctDisplay)}">${x(ctDisplay)}</td>
      <td class="tb-name-col"><span class="tb-name-cell" style="font-weight:600;font-size:13px">${x(recCatName(r,'tb','ten'))}</span></td>
      <td class="text-warning text-center font-monospace fw-bold" style="font-size:14px">${r.soluong||0}</td>
      <td>
        <select onchange="tbUpdateField('${r.id}','tinhtrang',this.value)"
          class="tb-status" style="cursor:pointer;border:1px solid var(--bs-border-color);${ttStyle}">
          ${ttOpts}
        </select>
      </td>
      <td class="text-secondary" style="font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(r.ghichu)}">${x(r.ghichu||'—')}</td>
      <td style="padding:6px 4px">
        <div class="d-flex justify-content-start align-items-center gap-2">
          <button class="btn btn-outline-primary btn-sm" onclick="tbLuanChuyen('${r.id}')" style="white-space:nowrap"><i class="bi bi-arrow-left-right"></i> Luân chuyển</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const tp = Math.ceil(filtered.length/TB_PG);
  let pag = `<span>${filtered.length} thiết bị</span>`;
  if (tp>1) {
    pag += '<ul class="pagination pagination-sm mb-0">';
    for(let p=1;p<=Math.min(tp,10);p++) pag+=`<li class="page-item ${p===tbPage?'active':''}"><button class="page-link" onclick="tbGoTo(${p})">${p}</button></li>`;
    pag += '</ul>';
  }
  document.getElementById('tb-pagination').innerHTML = pag;
}

function tbGoTo(p) { tbPage=p; tbRenderList(); }

// ── Cập nhật tình trạng inline ────────────────────────────────────
function tbUpdateField(id, field, val) {
  const idx = tbData.findIndex(r=>r.id===id);
  if (idx<0) return;
  tbData[idx][field] = val;
  tbData[idx].updatedAt = Date.now();
  tbData[idx].deviceId  = DEVICE_ID;
  save('tb_v1', tbData);
  tbRenderList();
  tbRenderThongKeVon();
  renderKhoTong();
  toast('✅ Đã cập nhật tình trạng', 'success');
}

// ── Xóa thiết bị (chỉ áp dụng cho KHO TỔNG) ─────────────────────
function tbDeleteRow(id) {
  const r = tbData.find(rec=>rec.id===id);
  if (!r) return;
  if (!isKhoTong(r)) { toast('Không thể xóa thiết bị ở công trình!', 'error'); return; }
  if (!confirm('Xóa thiết bị này khỏi Kho Tổng?')) return;
  tbData = softDeleteRecord(tbData, id);
  save('tb_v1', tbData);
  tbRenderList();
  tbRenderThongKeVon();
  renderKhoTong();
  toast('Đã xóa thiết bị khỏi Kho Tổng');
}

// ── Luân chuyển thiết bị (popup) ─────────────────────────────────
function tbLuanChuyen(id) {
  const r = tbData.find(rec=>rec.id===id);
  if (!r) return;
  let ov = document.getElementById('tb-edit-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'tb-edit-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px';
    // [CHẶN ĐÓNG NHẦM] Đã bỏ đóng khi click nền — popup chỉ đóng bằng nút ✕ để tránh mất dữ liệu đang nhập
    document.body.appendChild(ov);
  }

  const isKho = isKhoTong(r);
  // CT dropdown: từ KHO → chỉ CT thực; từ CT → có KHO + CT khác
  const _editProjs = (typeof getAllProjects === 'function' ? getAllProjects() : [])
    .filter(p => p.id !== 'COMPANY');
  const ctOpts = (isKho ? [] : [`<option value="${TB_KHO_TONG}">${TB_KHO_TONG}</option>`])
    .concat(_editProjs.map(p=>`<option value="${x(p.name)}" data-pid="${p.id}"${p.name===r.ct&&!isKho?' selected':''}>${x(p.name)}</option>`))
    .join('');
  const ttOpts = TB_TINH_TRANG.map(v=>`<option value="${v}" ${r.tinhtrang===v?'selected':''}>${v}</option>`).join('');
  const srcLabel = isKho ? 'KHO TỔNG' : x(r.ct);
  const hintText = `Phần còn lại (SL cũ − X) giữ lại tại <b>${srcLabel}</b>.`;

  ov.innerHTML = `
  <div style="background:#fff;border-radius:14px;padding:24px;width:min(480px,96vw);box-shadow:0 8px 32px rgba(0,0,0,.2);font-family:'IBM Plex Sans',sans-serif" onclick="event.stopPropagation()">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-size:16px;font-weight:700">↩ Luân Chuyển Thiết Bị</h3>
      <button onclick="document.getElementById('tb-edit-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#888">✕</button>
    </div>
    <div style="display:grid;gap:10px">
      <div style="background:#f8f8f5;border-radius:8px;padding:10px;font-size:12px">
        <span style="color:#888">Từ:</span> <b>${srcLabel}</b> &nbsp;·&nbsp;
        <span style="color:#888">Tên:</span> <b>${x(recCatName(r,'tb','ten'))}</b> &nbsp;·&nbsp;
        <span style="color:#888">SL hiện tại:</span> <b>${r.soluong||0}</b>
      </div>
      <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px">Chuyển đến Công Trình</label>
        <select id="tb-ei-ct" style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:7px;font-family:inherit;font-size:13px;outline:none">
          <option value="">-- Chọn --</option>${ctOpts}</select></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px">Số Lượng chuyển <span class="text-secondary" style="font-weight:400">(tối đa ${r.soluong||0})</span></label>
          <input id="tb-ei-sl" type="number" class="np-num-input" min="1" max="${r.soluong||0}" value="${r.soluong||0}" inputmode="decimal"
            style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:7px;font-family:inherit;font-size:13px;outline:none"></div>
        <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px">Tình Trạng</label>
          <select id="tb-ei-tt" style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:7px;font-family:inherit;font-size:13px;outline:none">${ttOpts}</select></div>
      </div>
      <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px">Ghi Chú</label>
        <input id="tb-ei-ghichu" type="text" value="${x(r.ghichu||'')}"
          style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:7px;font-family:inherit;font-size:13px;outline:none"></div>
      <div style="background:#f0f7ff;border-radius:8px;padding:10px;font-size:12px;color:#1565c0">
        ℹ️ SL nhập = số lượng chuyển đi. ${hintText}
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button onclick="document.getElementById('tb-edit-overlay').remove()"
        style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #ddd;background:#fff;font-family:inherit;font-size:13px;cursor:pointer">Hủy</button>
      <button onclick="tbSaveEdit('${r.id}')"
        style="flex:2;padding:10px;border-radius:8px;border:none;background:#1a1814;color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">↩ Xác Nhận Luân Chuyển</button>
    </div>
  </div>`;
  ov.style.display = 'flex';
}

function tbSaveEdit(id) {
  const idx = tbData.findIndex(rec=>rec.id===id);
  if (idx<0) return;
  const r = tbData[idx];

  const _tbEiCtSel = document.getElementById('tb-ei-ct');
  const newCT     = _tbEiCtSel.value.trim();
  const newCtPid  = _tbEiCtSel.options[_tbEiCtSel.selectedIndex]?.dataset?.pid || null;
  const newSL     = parseFloat(document.getElementById('tb-ei-sl').value) || 0;
  const newTT     = document.getElementById('tb-ei-tt').value;
  const newGhichu = document.getElementById('tb-ei-ghichu').value.trim();
  const oldSL     = r.soluong || 0;
  const ngay      = today();

  if (!newCT) { toast('Vui lòng chọn công trình!', 'error'); return; }
  if (newSL <= 0 || newSL > oldSL) {
    toast(`Số lượng không hợp lý (phải từ 1 đến ${oldSL})!`, 'error');
    return;
  }

  const remaining = oldSL - newSL;
  const srcCt = r.ct; // lưu lại nguồn trước khi soft-delete

  // Soft-delete record gốc (không xóa cứng để sync hoạt động đúng)
  tbData = softDeleteRecord(tbData, id);

  // Thêm/cộng dồn số lượng chuyển đi vào newCT
  const destExist = tbData.find(rec => !rec.deletedAt && rec.ten === r.ten && rec.tinhtrang === newTT &&
    (newCtPid ? (rec.projectId === newCtPid) : rec.ct === newCT)); // [MODIFIED] match by projectId
  if (destExist) {
    destExist.soluong  = (destExist.soluong || 0) + newSL;
    destExist.updatedAt = Date.now();
    destExist.deviceId  = DEVICE_ID;
    if (newGhichu) destExist.ghichu = newGhichu;
    destExist.ngay = ngay;
  } else {
    tbData.push(mkRecord({
      ct: newCT, projectId: newCT === TB_KHO_TONG ? 'COMPANY' : (newCtPid || null),
      ten: r.ten, soluong: newSL, tinhtrang: newTT,
      ghichu: newGhichu, ngay
    }));
  }

  // Phần còn lại → giữ lại tại nguồn (r.ct)
  if (remaining > 0) {
    const srcExist = tbData.find(rec => !rec.deletedAt && rec.ten === r.ten && rec.tinhtrang === r.tinhtrang &&
      (r.projectId ? (rec.projectId === r.projectId) : rec.ct === srcCt)); // [MODIFIED] match by projectId
    if (srcExist) {
      srcExist.soluong   = (srcExist.soluong || 0) + remaining;
      srcExist.updatedAt = Date.now();
      srcExist.deviceId  = DEVICE_ID;
      srcExist.ngay = ngay;
    } else {
      tbData.push(mkRecord({
        ct: srcCt, projectId: srcCt === TB_KHO_TONG ? 'COMPANY' : (r.projectId || null),
        ten: r.ten, soluong: remaining,
        tinhtrang: r.tinhtrang, ghichu: r.ghichu || '', ngay
      }));
    }
  }

  save('tb_v1', tbData);
  document.getElementById('tb-edit-overlay').remove();
  tbPopulateSels();
  tbRenderList();
  tbRenderThongKeVon();
  renderKhoTong();
  toast('✅ Đã cập nhật thiết bị!', 'success');
}

// ── Xuất CSV ─────────────────────────────────────────────────────
function tbExportCSV() {
  const fCt = document.getElementById('tb-filter-ct')?.value||'';
  const fTt = document.getElementById('tb-filter-tt')?.value||'';
  let data = tbData.filter(r=>{
    if(r.deletedAt) return false;
    if(fCt && r.ct!==fCt) return false;
    if(fTt && r.tinhtrang!==fTt) return false;
    return true;
  });
  const rows = [['Công Trình','Tên Thiết Bị','Số Lượng','Tình Trạng','Người TH','Ghi Chú','Cập Nhật']];
  data.forEach(r=>rows.push([_resolveCtName(r),recCatName(r,'tb','ten'),r.soluong||0,r.tinhtrang||'',r.nguoi||'',r.ghichu||'',r.ngay||''])); // [MODIFIED]
  dlCSV(rows, 'thiet_bi_'+today()+'.csv');
}


// ── Bảng Kho Tổng Thiết Bị ───────────────────────────────────────
const KHO_PG = 7;
let khoPage = 1;

function renderKhoTong() {
  const tbody = document.getElementById('kho-list-tbody');
  if (!tbody) return;

  const fTen = document.getElementById('kho-filter-ten')?.value || '';
  const fTt = document.getElementById('kho-filter-tt')?.value || '';
  let filtered = tbData.filter(r => {
    if (r.deletedAt) return false;
    if (!isKhoTong(r)) return false;
    if (fTen && recCatName(r,'tb','ten') !== fTen) return false;
    if (fTt && r.tinhtrang !== fTt) return false;
    return true;
  });

  filtered.sort((a,b) => recCatName(a,'tb','ten').localeCompare(recCatName(b,'tb','ten'),'vi'));

  const start = (khoPage-1)*KHO_PG;
  const paged = filtered.slice(start, start+KHO_PG);

  if (!paged.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Kho tổng trống</td></tr>';
    document.getElementById('kho-pagination').innerHTML = '';
    return;
  }

  tbody.innerHTML = paged.map(r => {
    const ttStyle = TB_STATUS_STYLE[r.tinhtrang] || '';
    return `<tr data-tbid="${r.id}">
      <td class="tb-name-col"><span class="tb-name-cell" style="font-weight:600;font-size:13px">${x(recCatName(r,'tb','ten'))}</span></td>
      <td class="text-warning text-center font-monospace fw-bold" style="font-size:14px">${r.soluong||0}</td>
      <td><span class="tb-status" style="${ttStyle}">${x(r.tinhtrang||'')}</span></td>
      <td class="text-secondary" style="font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(r.ghichu)}">${x(r.ghichu||'—')}</td>
      <td class="text-secondary" style="font-size:10px;white-space:nowrap">${r.ngay||''}</td>
      <td style="padding:6px 4px">
        <div class="d-flex justify-content-start align-items-center gap-2">
          <button class="btn btn-outline-primary btn-sm" onclick="tbLuanChuyen('${r.id}')" style="white-space:nowrap"><i class="bi bi-arrow-left-right"></i> Luân chuyển</button>
          <button class="btn btn-outline-danger btn-sm" onclick="tbDeleteRow('${r.id}')" title="Xóa"><i class="bi bi-trash-fill"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const tp = Math.ceil(filtered.length/KHO_PG);
  let pag = `<span>${filtered.length} thiết bị</span>`;
  if (tp>1) {
    pag += '<ul class="pagination pagination-sm mb-0">';
    for(let p=1;p<=Math.min(tp,10);p++) pag+=`<li class="page-item ${p===khoPage?'active':''}"><button class="page-link" onclick="khoGoTo(${p})">${p}</button></li>`;
    pag += '</ul>';
  }
  document.getElementById('kho-pagination').innerHTML = pag;
}

function khoGoTo(p) { khoPage=p; renderKhoTong(); }

// ── Bảng Thống Kê Thiết Bị Theo Công Trình ───────────────────────
function tbRenderThongKeVon() {
  const tbody = document.getElementById('tb-vonke-tbody');
  if (!tbody) return;

  // Gom nhóm theo projectId (bỏ KHO TỔNG)
  const map = {};
  tbData.forEach(r => {
    if (r.deletedAt || !r.ct || isKhoTong(r)) return;
    // [MODIFIED] — group by projectId, resolve name for display
    const gKey = r.projectId || r.ct;
    const ctDisplay = _resolveCtName(r);
    if (!map[gKey]) map[gKey] = { ct: ctDisplay, total: 0, types: new Set() };
    map[gKey].total += (r.soluong || 0);
    const _tn = recCatName(r,'tb','ten'); if (_tn) map[gKey].types.add(_tn);
  });

  const items = Object.values(map).sort((a, b) => a.ct.localeCompare(b.ct, 'vi'));

  const pgEl = document.getElementById('tk-pagination');
  if (!items.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="3">Chưa có thiết bị tại công trình nào</td></tr>';
    if (pgEl) pgEl.innerHTML = '';
    return;
  }

  tbody.innerHTML = items.map(item => `<tr>
    <td style="font-weight:600">${x(item.ct)}</td>
    <td class="text-warning text-center font-monospace fw-bold" style="font-size:15px">${item.total}</td>
    <td class="text-secondary text-center" style="font-size:13px">${item.types.size} loại</td>
  </tr>`).join('');

  if (pgEl) pgEl.innerHTML = `<span>${items.length} công trình</span>`;
}

// ── Init TB khi load trang ────────────────────────────────────────
// (tbData đã load ở trên, tbBuildRows gọi khi goPage)

// Filter realtime DOM cho bảng Kho Tổng Thiết Bị
function filterKhoTable() {
  const query = document.getElementById('kho-search').value.toLowerCase().trim();
  const rows = document.querySelectorAll('#kho-list-tbody tr');
  
  rows.forEach(row => {
    if (row.classList.contains('empty-row')) return;
    const nameCell = row.querySelector('.tb-name-col');
    if (!nameCell) return;
    
    const nameText = nameCell.textContent.toLowerCase();
    row.style.display = nameText.includes(query) ? '' : 'none';
  });
}
