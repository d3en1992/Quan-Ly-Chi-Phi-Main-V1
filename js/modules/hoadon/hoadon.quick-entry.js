// hoadon.quick-entry.js — Nhập hóa đơn nhanh, duplicate check, row/money helpers
// Load order: sau js/legacy/tienich.js, trước hoadon.detail-entry.js

// ══════════════════════════════
//  ENTRY TABLE
// ══════════════════════════════
function initTable(n=10) {
  document.getElementById('entry-tbody').innerHTML='';
  for(let i=0;i<n;i++) addRow();
  calcSummary();
  _initQuickSheetGrid();
}

function _initQuickSheetGrid() {
  if (typeof initSheetGrid !== 'function') return;
  initSheetGrid({
    name: 'quick',
    tbody: '#entry-tbody',
    rowSelector: 'tr',
    cellSelector: 'input',
    addRow: () => addRow(),
    afterChange: () => calcSummary(),
    columns: [
      { field: 'loai',  type: 'autocomplete',
        source: () => { const d = typeof _dedupCatArr === 'function' ? _dedupCatArr : a => [...a].filter(Boolean); return d(cats.loaiChiPhi||[]); },
        required: true, copyFromAbove: true },
      { field: 'ct',    type: 'project-autocomplete',
        source: () => {
          // Nhập Nhanh là tab nhập liệu → ẩn CT đã quyết toán khỏi gợi ý
          const projs = typeof getAllProjects === 'function' ? getAllProjects() : (window.projects||[]);
          return projs.filter(p => !p.deletedAt && p.id && p.status !== 'closed').map(p => ({ name: p.name, id: p.id }));
        },
        required: true, copyFromAbove: true },
      { field: 'tien',  type: 'money' },
      { field: 'nd',    type: 'text', suggestFromAbove: true },
      { field: 'nguoi', type: 'autocomplete',
        source: () => { const d = typeof _dedupCatArr === 'function' ? _dedupCatArr : a => [...a].filter(Boolean); return d(cats.nguoiTH||[]); },
        copyFromAbove: true },
      { field: 'ncc',   type: 'autocomplete',
        source: () => { const d = typeof _dedupCatArr === 'function' ? _dedupCatArr : a => [...a].filter(Boolean); return d(cats.nhaCungCap||[]); },
        copyFromAbove: true }
    ]
  });
}

// Đọc projectId từ ô ct (input có data-pid, hoặc select dùng _readPidFromSel)
function _readCtPid(el) {
  if (!el) return null;
  if (el.tagName === 'INPUT') {
    if (el.dataset.pid) return el.dataset.pid;
    const name = (el.value||'').trim();
    if (name && typeof findProjectIdByName === 'function') return findProjectIdByName(name) || null;
    return null;
  }
  return typeof _readPidFromSel === 'function' ? _readPidFromSel(el) : null;
}

function addRows(n) { for(let i=0;i<n;i++) addRow(); }

// Validate tất cả ô danh mục trong bảng nhập nhanh trước khi lưu.
// Trả về { ok, count } — nếu ok=false thì các ô sai đã được đánh dấu đỏ.
function validateQuickEntryCategories() {
  if (typeof validateCategoryCell !== 'function') return { ok: true, count: 0 };

  const dedupArr = typeof _dedupCatArr === 'function' ? _dedupCatArr : a => [...new Set(a.filter(Boolean))];
  const loaiOpts  = dedupArr(cats.loaiChiPhi  || []);
  const nguoiOpts = dedupArr(cats.nguoiTH     || []);
  const nccOpts   = dedupArr(cats.nhaCungCap  || []);
  const projOpts  = (() => {
    const projs = typeof getAllProjects === 'function' ? getAllProjects() : (window.projects || []);
    return projs.filter(p => !p.deletedAt && p.id).map(p => ({ name: p.name, id: p.id }));
  })();

  let invalidCount = 0;

  document.querySelectorAll('#entry-tbody tr').forEach((tr, rowIdx) => {
    const loaiEl  = tr.querySelector('[data-f="loai"]');
    const ctEl    = tr.querySelector('[data-f="ct"]');
    const nguoiEl = tr.querySelector('[data-f="nguoi"]');
    const nccEl   = tr.querySelector('[data-f="ncc"]');
    const tien    = parseInt(tr.querySelector('[data-f="tien"]')?.dataset.raw || '0', 10) || 0;

    const loaiVal  = (loaiEl?.value  || '').trim();
    const ctVal    = (ctEl?.value    || '').trim();
    const nguoiVal = (nguoiEl?.value || '').trim();
    const nccVal   = (nccEl?.value   || '').trim();

    // Bỏ qua dòng hoàn toàn trống
    if (!loaiVal && !ctVal && !nguoiVal && !nccVal && !tien) return;

    const rowNum = rowIdx + 1;

    const loaiRes = validateCategoryCell(loaiEl, loaiOpts, { required: true, label: 'Dòng ' + rowNum + ' — Loại chi phí' });
    if (!loaiRes.ok) invalidCount++;

    const ctRes = validateCategoryCell(ctEl, projOpts, { required: true, label: 'Dòng ' + rowNum + ' — Công trình' });
    if (!ctRes.ok) invalidCount++;

    if (nguoiVal) {
      const nguoiRes = validateCategoryCell(nguoiEl, nguoiOpts, { required: false, label: 'Dòng ' + rowNum + ' — Người TH' });
      if (!nguoiRes.ok) invalidCount++;
    } else if (nguoiEl && typeof clearCellInvalid === 'function') {
      clearCellInvalid(nguoiEl);
    }

    if (nccVal) {
      const nccRes = validateCategoryCell(nccEl, nccOpts, { required: false, label: 'Dòng ' + rowNum + ' — NCC' });
      if (!nccRes.ok) invalidCount++;
    } else if (nccEl && typeof clearCellInvalid === 'function') {
      clearCellInvalid(nccEl);
    }
  });

  return { ok: invalidCount === 0, count: invalidCount };
}

// Gọi khi danh mục hoặc công trình thay đổi — với input autocomplete không cần rebuild
function refreshEntryDropdowns() {
  if(typeof _initDetailFormSelects === 'function') _initDetailFormSelects();
}

function addRow(d={}) {
  const tbody = document.getElementById('entry-tbody');
  // Copy loai/CT từ dòng trên nếu không có dữ liệu truyền vào
  if(!d.loai && !d.congtrinh) {
    const lastRow = tbody.querySelector('tr:last-child');
    if(lastRow) {
      const prevLoai = lastRow.querySelector('[data-f="loai"]')?.value || '';
      const prevCt   = lastRow.querySelector('[data-f="ct"]')?.value   || '';
      const prevPid  = lastRow.querySelector('[data-f="ct"]')?.dataset?.pid || '';
      if(prevLoai || prevCt) d = { ...d, loai: prevLoai, congtrinh: prevCt, projectId: prevPid || d.projectId };
    }
  }
  const num = tbody.children.length + 1;

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="row-num">${num}</td>
    <td><input class="cell-input" data-f="loai" autocomplete="off" placeholder="Loại chi phí..." value="${x(d.loai||'')}"></td>
    <td><input class="cell-input" data-f="ct" autocomplete="off" data-pid="${x(d.projectId||'')}" placeholder="Công trình..." value="${x(d.congtrinh||'')}"></td>
    <td><input class="cell-input right tien-input" data-f="tien" data-raw="${d.tien||''}" placeholder="0" value="${d.tien?numFmt(d.tien):''}" inputmode="decimal"></td>
    <td><input class="cell-input" data-f="nd" value="${x(d.nd||'')}" placeholder="Nội dung..."></td>
    <td><input class="cell-input" data-f="nguoi" autocomplete="off" placeholder="Người TH..." value="${x(d.nguoi||'')}"></td>
    <td><input class="cell-input" data-f="ncc" autocomplete="off" placeholder="NCC..." value="${x(d.ncc||'')}"></td>
    <td><button class="del-btn" onclick="delRow(this)">✕</button></td>
  `;

  // Thousand-separator logic for tien input
  const tienInput = tr.querySelector('[data-f="tien"]');
  tienInput.addEventListener('input', function() {
    const raw = this.value.replace(/[.,\s]/g,'');
    this.dataset.raw = raw;
    if(raw) this.value = numFmt(parseInt(raw,10)||0);
    calcSummary();
  });
  tienInput.addEventListener('focus', function() { this.value = this.dataset.raw || ''; });
  tienInput.addEventListener('blur', function() {
    const raw = parseInt(this.dataset.raw||'0',10)||0;
    this.value = raw ? numFmt(raw) : '';
  });

  tr.querySelectorAll('input').forEach(el => {
    if(el.dataset.f !== 'tien') {
      el.addEventListener('change', calcSummary);
    }
  });

  tbody.appendChild(tr);
}

function delRow(btn) { btn.closest('tr').remove(); renumber(); calcSummary(); }

function renumber() { renumberRows('#entry-tbody'); }

function calcSummary() {
  let cnt=0, total=0;
  document.querySelectorAll('#entry-tbody tr').forEach(tr => {
    const loai = tr.querySelector('[data-f="loai"]')?.value||'';
    const ct   = tr.querySelector('[data-f="ct"]')?.value||'';
    const tienRaw = parseInt(tr.querySelector('[data-f="tien"]')?.dataset.raw||'0',10)||0;
    if(loai||ct||tienRaw>0) { cnt++; total += tienRaw; }
  });
  document.getElementById('row-count').textContent = cnt;
  document.getElementById('entry-total').textContent = fmtM(total);
}

function clearTable() {
  if(!confirm('Xóa toàn bộ bảng nhập hiện tại?')) return;
  initTable(5);
}

function saveAllRows(skipDupCheck) {
  const date = document.getElementById('entry-date').value;
  if(!date) { toast('Vui lòng chọn ngày!','error'); return; }

  // Validate danh mục — đánh dấu ô đỏ và chặn lưu nếu có ô sai
  const _catVal = validateQuickEntryCategories();
  if (!_catVal.ok) {
    toast('Có ' + _catVal.count + ' ô danh mục không hợp lệ. Vui lòng chọn đúng từ gợi ý/Danh Mục.', 'error');
    return;
  }

  // Thu thập tất cả dòng hợp lệ
  const rows = [];
  let errRow = 0;
  document.querySelectorAll('#entry-tbody tr').forEach(tr => {
    const loai   = (tr.querySelector('[data-f="loai"]')?.value||'').trim();
    const ctEl   = tr.querySelector('[data-f="ct"]');
    const ct     = (ctEl?.value||'').trim();
    const ctPid  = _readCtPid(ctEl);
    const tien   = parseInt(tr.querySelector('[data-f="tien"]')?.dataset.raw||'0',10)||0;
    if(!loai&&!ct&&!tien) return;
    if(!ct||!loai) { errRow++; tr.style.background='#fdecea'; return; }
    // Kiểm tra công trình đã quyết toán
    if (ctPid && ctPid !== 'COMPANY') {
      const proj = getProjectById(ctPid);
      if (proj && proj.status === 'closed') { errRow++; tr.style.background='#fdecea'; return; }
    }
    tr.style.background='';
    rows.push({
      tr,
      editId: tr.dataset.editId || null,
      payload: {
        ngay: date,
        congtrinh: ct, loai,
        projectId: ctPid || null,
        nguoi: (tr.querySelector('[data-f="nguoi"]')?.value||'').trim(),
        ncc:   (tr.querySelector('[data-f="ncc"]')?.value||'').trim(),
        nd:    (tr.querySelector('[data-f="nd"]')?.value||'').trim(),
        tien
      }
    });
  });

  if(errRow>0) { toast(`${errRow} dòng có lỗi (thiếu thông tin hoặc công trình đã quyết toán)!`,'error'); return; }
  if(!rows.length) { toast('Không có dòng hợp lệ!','error'); return; }

  // Kiểm tra trùng — chỉ cho dòng MỚI (không phải edit)
  if(!skipDupCheck) {
    const newRows = rows.filter(r => !r.editId);
    const dupRows = [];
    newRows.forEach(r => {
      // Chỉ so sánh với HĐ nhập tay (không ccKey) trong cùng ngày+CT
      const candidates = invoices.filter(i =>
        !i.ccKey &&
        i.ngay === r.payload.ngay &&
        i.congtrinh === r.payload.congtrinh &&
        (i.thanhtien||i.tien||0) === r.payload.tien
      );
      if(!candidates.length) return;

      // Fuzzy match nội dung ≥ 70%
      const nd = r.payload.nd.toLowerCase().trim();
      candidates.forEach(inv => {
        const sim = _strSimilarity(nd, (inv.nd||'').toLowerCase().trim());
        if(sim >= 0.7 || (nd === '' && (inv.nd||'') === '')) {
          dupRows.push({
            newRow: r,
            existing: inv,
            similarity: sim,
            isExact: sim >= 0.99
          });
        }
      });
    });

    if(dupRows.length > 0) {
      _showDupModal(dupRows, rows);
      return; // Dừng lại — chờ user quyết định
    }
  }

  // ── Thực sự lưu ────────────────────────────────────────────
  _doSaveRows(rows);
}

// ══════════════════════════════
// DUPLICATE CHECK
// ══════════════════════════════

// ── Fuzzy string similarity (Dice coefficient) ───────────────
// Trả về 0.0 → 1.0. Không cần thư viện ngoài.

// ── Hiển thị modal cảnh báo trùng ────────────────────────────
function _showDupModal(dupRows, allRows) {
  const overlay = document.getElementById('dup-modal-overlay');
  const body    = document.getElementById('dup-modal-body');
  const sub     = document.getElementById('dup-modal-subtitle');

  // Lưu allRows để forceSave dùng lại
  overlay._allRows = allRows;

  sub.textContent = `Tìm thấy ${dupRows.length} hóa đơn có thể bị trùng`;

  const numFmtLocal = n => n ? n.toLocaleString('vi-VN') + 'đ' : '0đ';
  body.innerHTML = dupRows.map(d => {
    const pct     = Math.round(d.similarity * 100);
    const badge   = d.isExact
      ? '<span class="dup-badge dup-badge-exact">Trùng hoàn toàn</span>'
      : `<span class="dup-badge dup-badge-fuzzy">Giống ${pct}%</span>`;
    const existTime = d.existing._ts
      ? new Date(d.existing._ts).toLocaleString('vi-VN')
      : d.existing.ngay || '';
    return `<div class="dup-item">
      <div style="font-size:11px;font-weight:700;color:#f57f17;margin-bottom:6px">
        HĐ MỚI ${badge}
      </div>
      <div class="dup-item-row">
        <span class="dup-item-label">Ngày</span>
        <span class="dup-item-val">${d.newRow.payload.ngay}</span>
      </div>
      <div class="dup-item-row">
        <span class="dup-item-label">Công trình</span>
        <span class="dup-item-val">${d.newRow.payload.congtrinh}</span>
      </div>
      <div class="dup-item-row">
        <span class="dup-item-label">Số tiền</span>
        <span class="dup-item-val text-danger font-monospace">
          ${numFmtLocal(d.newRow.payload.tien)}
        </span>
      </div>
      <div class="dup-item-row">
        <span class="dup-item-label">Nội dung</span>
        <span class="dup-item-val">${d.newRow.payload.nd||'(trống)'}</span>
      </div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #ffe082;font-size:11px;color:#888">
        ↑ Trùng với HĐ đã lưu lúc ${existTime}:
        <span style="color:#555;font-weight:600">${d.existing.nd||'(trống)'}</span>
      </div>
    </div>`;
  }).join('');

  overlay.classList.add('open');
}

function closeDupModal() {
  document.getElementById('dup-modal-overlay').classList.remove('open');
}

function forceSaveAll() {
  closeDupModal();
  const overlay = document.getElementById('dup-modal-overlay');
  const allRows = overlay._allRows;
  if(allRows) _doSaveRows(allRows);
}

// ── Đảm bảo cả projectId lẫn congtrinh luôn nhất quán trước khi lưu ──
function _ensureInvRef(fields) {
  let { projectId, congtrinh } = fields;
  if (!projectId && congtrinh && typeof findProjectIdByName === 'function') {
    projectId = findProjectIdByName(congtrinh) || null;
    if (!projectId) console.warn('[invoice] Cannot resolve projectId for CT:', congtrinh);
  }
  if (projectId && typeof getProjectById === 'function') {
    const p = getProjectById(projectId);
    if (p && p.name) congtrinh = p.name;
  }
  return { ...fields, projectId: projectId || null, congtrinh: congtrinh || fields.congtrinh || '' };
}

// ── Hàm lưu thực sự (dùng chung cho cả normal và force) ──────
function _doSaveRows(rows) {
  let saved = 0, updated = 0;
  rows.forEach(({tr, editId, payload}) => {
    const p = _ensureInvRef({
      ngay: payload.ngay, congtrinh: payload.congtrinh, loai: payload.loai,
      nguoi: payload.nguoi, ncc: payload.ncc, nd: payload.nd,
      tien: payload.tien, thanhtien: payload.tien,
      projectId: payload.projectId || null,
      source: 'quick'
    });
    if(editId) {
      const idx = invoices.findIndex(i => String(i.id) === String(editId));
      if(idx >= 0) { invoices[idx] = mkUpdate(invoices[idx], p); updated++; }
    } else {
      invoices.unshift(mkRecord(p));
      saved++;
    }
    tr.style.background = '#f0fff4';
  });

  clearInvoiceCache(); save('inv_v3', invoices);
  buildYearSelect(); updateTop();

  if(updated > 0 && saved === 0) toast(`✅ Đã cập nhật ${updated} hóa đơn!`, 'success');
  else if(saved > 0 && updated === 0) toast(`✅ Đã lưu ${saved} hóa đơn!`, 'success');
  else toast(`✅ Đã lưu ${saved} mới, cập nhật ${updated} hóa đơn!`, 'success');
  const _eBtn = document.getElementById('entry-save-btn');
  if (_eBtn) _eBtn.textContent = '💾 Lưu Hóa Đơn';

  // Tự động refresh sub-tab "HĐ/CP nhập trong ngày"
  renderTodayInvoices();
  // Tự động refresh sub-tab "Tất cả CP/HĐ" (luôn sync sau mỗi lần lưu)
  buildFilters(); filterAndRender();
}

// ══════════════════════════════════════════════════════════════
// HELPERS (shared — dùng cho cả quick-entry và detail-entry)
// ══════════════════════════════════════════════════════════════

// Tính thành tiền một dòng: sl × dongia áp chiết khấu ck
// ck = "" → không CK | "5%" → giảm 5% | "50000" → giảm tiền cố định
function calcRowMoney(sl, dongia, ck) {
  const base = sl * dongia;
  if (!ck) return Math.round(base);
  if (ck.endsWith('%')) return Math.round(base * (1 - (parseFloat(ck) || 0) / 100));
  return Math.round(base - parseMoney(ck));
}

// Đọc dữ liệu một dòng trong #detail-tbody
function getRowData(tr) {
  return {
    ten:    (tr.querySelector('[data-f="ten"]')?.value    || '').trim(),
    dv:     (tr.querySelector('[data-f="dv"]')?.value     || '').trim(),
    sl:     parseFloat(tr.querySelector('[data-f="sl"]')?.value)  || 1,
    dongia: parseInt(tr.querySelector('[data-f="dongia"]')?.dataset.raw || '0', 10) || 0,
    ck:     (tr.querySelector('[data-f="ck"]')?.value     || '').trim(),
  };
}
