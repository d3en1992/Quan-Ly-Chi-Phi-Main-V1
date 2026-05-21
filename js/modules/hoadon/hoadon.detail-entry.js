// hoadon.detail-entry.js — Hóa đơn chi tiết nhiều dòng vật tư/nội dung
// Load order: sau hoadon.quick-entry.js, trước hoadon.list-trash.js

// ══════════════════════════════
// INVOICE DETAIL
// ══════════════════════════════

function goInnerSub(btn, id) {
  document.querySelectorAll('#sub-nhap-hd .inner-sub-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#sub-nhap-hd .nav-link').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
  if(id === 'inr-hd-chitiet') {
    _initDetailFormSelects();
    const tbody = document.getElementById('detail-tbody');
    if(tbody && tbody.children.length === 0) {
      document.getElementById('detail-ngay').value = document.getElementById('entry-date')?.value || today();
      for(let i=0; i<5; i++) addDetailRow();
    }
    _initDetailSheetGrid();
  }
  renderTodayInvoices(); // cập nhật bảng theo ngày của subtab vừa chuyển
}

function _initDetailSheetGrid() {
  if (typeof initSheetGrid !== 'function') return;
  initSheetGrid({
    name: 'detail',
    tbody: '#detail-tbody',
    rowSelector: 'tr',
    cellSelector: 'input',
    addRow: () => addDetailRow(),
    afterChange: () => {
      getDetailRows().forEach(tr => calcDetailRow(tr));
      calcDetailTotals();
      generateDetailNd();
    },
    columns: [
      { field: 'ten',    type: 'text',   suggestFromAbove: true },
      { field: 'dv',     type: 'text',   copyFromAbove: true },
      { field: 'sl',     type: 'number' },
      { field: 'dongia', type: 'money' },
      { field: 'ck',     type: 'discount' }
    ]
  });
}

function _initDetailFormSelects() {
  const loaiSel = document.getElementById('detail-loai');
  if(!loaiSel) return;
  const loaiV = loaiSel.value;
  loaiSel.innerHTML = '<option value="">-- Chọn Loại --</option>' +
    [...cats.loaiChiPhi].sort((a,b)=>a.localeCompare(b,'vi')).map(v => `<option value="${x(v)}" ${v===loaiV?'selected':''}>${x(v)}</option>`).join('');

  const ctSel = document.getElementById('detail-ct');
  ctSel.innerHTML = _buildProjOpts(ctSel.value || '', '-- Chọn Công Trình --');

  const nccSel = document.getElementById('detail-ncc');
  if(nccSel) {
    const nccV = nccSel.value;
    nccSel.innerHTML = '<option value="">-- Chọn NCC --</option>' +
      [...cats.nhaCungCap].sort((a,b)=>a.localeCompare(b,'vi')).map(v => `<option value="${x(v)}" ${v===nccV?'selected':''}>${x(v)}</option>`).join('');
  }

  // Rebuild dropdown Người TH cố định (phía trên bảng)
  const detNguoiSel = document.getElementById('detail-nguoi');
  if(detNguoiSel) {
    const detNguoiV = detNguoiSel.value;
    detNguoiSel.innerHTML = '<option value="">-- Chọn Người TH --</option>' +
      ([...cats.nguoiTH]||[]).sort((a,b)=>a.localeCompare(b,'vi')).map(v=>`<option value="${x(v)}" ${v===detNguoiV?'selected':''}>${x(v)}</option>`).join('');
  }

  // PHẦN 3: Format #detail-footer-ck (số tiền → hàng nghìn, % → giữ nguyên)
  const footerCk = document.getElementById('detail-footer-ck');
  if(footerCk && !footerCk.dataset.fmtInit) {
    footerCk.dataset.fmtInit = '1';
    footerCk.addEventListener('focus', function() {
      const v = this.value.trim();
      if(v && !v.endsWith('%')) { const n = parseMoney(v); if(n) this.value = String(n); }
    });
    footerCk.addEventListener('blur', function() {
      const v = this.value.trim();
      if(v && !v.endsWith('%')) { const n = parseMoney(v); this.value = n ? numFmt(n) : v; }
    });
  }
}

function renderDetailRowHTML(d, num) {
  // Format CK for display: nếu là số (không có %) thì hiển thị hàng nghìn
  const ckRaw = d.ck || '';
  const ckFmt = (ckRaw && !ckRaw.endsWith('%'))
    ? (() => { const n = parseMoney(ckRaw); return n ? numFmt(n) : ckRaw; })()
    : ckRaw;
  return `
    <td class="row-num">${num}</td>
    <td><input class="cell-input" data-f="ten" value="${x(d.ten||'')}" placeholder="Tên hàng hóa, vật tư..."></td>
    <td style="padding:0"><input class="cell-input center" data-f="dv" value="${x(d.dv||'')}" placeholder="cái"
      style="width:100%;text-align:center;padding:7px 4px"></td>
    <td style="padding:0"><input data-f="sl" type="number" step="0.01" min="0"
      value="${d.sl||''}" placeholder="1"
      style="width:100%;text-align:center;border:none;background:transparent;padding:7px 4px;font-family:'IBM Plex Mono',monospace;font-size:13px;outline:none;-moz-appearance:textfield;-webkit-appearance:textfield;appearance:textfield"
      inputmode="decimal"></td>
    <td><input class="cell-input right" data-f="dongia" data-raw="${d.dongia||''}"
      value="${d.dongia?numFmt(d.dongia):''}" placeholder="0" inputmode="decimal"></td>
    <td><input class="cell-input" data-f="ck" value="${x(ckFmt)}" placeholder="vd: 5% hoặc 50000"></td>
    <td class="tt-cell" data-f="thtien"></td>
    <td><button class="del-btn" onclick="delDetailRow(this)">✕</button></td>
  `;
}

function addDetailRow(d={}) {
  const tbody = document.getElementById('detail-tbody');
  const num = tbody.children.length + 1;
  const tr = document.createElement('tr');
  tr.innerHTML = renderDetailRowHTML(d, num);

  const dongiaInp = tr.querySelector('[data-f="dongia"]');
  dongiaInp.addEventListener('focus', function() { this.value = this.dataset.raw || ''; });
  dongiaInp.addEventListener('blur', function() {
    const raw = parseInt(this.dataset.raw||'0',10)||0;
    this.value = raw ? numFmt(raw) : '';
  });
  dongiaInp.addEventListener('input', function() {
    const raw = this.value.replace(/[.,\s]/g,'');
    this.dataset.raw = raw;
    if(raw) this.value = numFmt(parseInt(raw,10)||0);
    calcDetailRow(tr); calcDetailTotals();
  });
  tr.querySelector('[data-f="sl"]').addEventListener('input', function() {
    calcDetailRow(tr); calcDetailTotals();
  });
  const ckInp = tr.querySelector('[data-f="ck"]');
  ckInp.addEventListener('focus', function() {
    const v = this.value.trim();
    if (v && !v.endsWith('%')) {
      const n = parseMoney(v);
      if (n) this.value = String(n);
    }
  });
  ckInp.addEventListener('blur', function() {
    const v = this.value.trim();
    if (v && !v.endsWith('%')) {
      const n = parseMoney(v);
      this.value = n ? numFmt(n) : v;
    }
  });
  ckInp.addEventListener('input', function() {
    calcDetailRow(tr); calcDetailTotals();
  });
  tr.querySelector('[data-f="ten"]').addEventListener('input', generateDetailNd);

  tbody.appendChild(tr);
  if(d.dongia || d.sl || d.ck) calcDetailRow(tr);
}

function delDetailRow(btn) {
  btn.closest('tr').remove();
  document.querySelectorAll('#detail-tbody tr').forEach((tr,i) => {
    tr.querySelector('.row-num').textContent = i+1;
  });
  calcDetailTotals();
  generateDetailNd();
}

function calcDetailRow(tr) {
  const {sl, dongia, ck} = getRowData(tr);
  const tt = calcRowMoney(sl, dongia, ck);
  tr.dataset.tt = tt;
  const ttEl = tr.querySelector('[data-f="thtien"]');
  if(ttEl) {
    ttEl.textContent = tt ? numFmt(tt) : '';
    ttEl.className = 'tt-cell' + (!tt ? ' empty' : '');
  }
}

function calcDetailTotals() {
  let tc = 0;
  getDetailRows().forEach(tr => {
    tc += parseInt(tr.dataset.tt||'0', 10) || 0;
  });
  const tcEl = document.getElementById('detail-tc');
  if(tcEl) tcEl.textContent = numFmt(tc);

  // Dùng calcRowMoney(sl=1, dongia=tc, ck) để tái dùng logic CK
  const ckStr = (document.getElementById('detail-footer-ck')?.value||'').trim();
  const tong = calcRowMoney(1, tc, ckStr);

  const tongEl = document.getElementById('detail-tong');
  if(tongEl) { tongEl.textContent = numFmt(tong); tongEl.dataset.raw = tong; }
  const saveEl = document.getElementById('detail-tong-save');
  if(saveEl) saveEl.textContent = fmtM(tong);
}

function generateDetailNd() {
  const items = [];
  document.querySelectorAll('#detail-tbody tr [data-f="ten"]').forEach(inp => {
    const v = inp.value.trim();
    if(v) items.push({ ten: v });
  });
  const ndEl = document.getElementById('detail-nd');
  if(ndEl) ndEl.value = buildNDFromItems(items);
}

// Validate các ô danh mục trong form hóa đơn chi tiết.
// Trả về { ok, count, msgs }.
function validateDetailHeaderCategories() {
  if (typeof validateCategoryCell !== 'function') return { ok: true, count: 0, msgs: [] };

  const dedupArr = typeof _dedupCatArr === 'function' ? _dedupCatArr : a => [...new Set(a.filter(Boolean))];
  const loaiOpts  = dedupArr(cats.loaiChiPhi  || []);
  const nguoiOpts = dedupArr(cats.nguoiTH     || []);
  const nccOpts   = dedupArr(cats.nhaCungCap  || []);
  const projOpts  = (() => {
    const projs = typeof getAllProjects === 'function' ? getAllProjects() : (window.projects || []);
    return projs.filter(p => !p.deletedAt && p.id).map(p => ({ name: p.name, id: p.id }));
  })();

  let invalidCount = 0;
  const msgs = [];

  const loaiEl  = document.getElementById('detail-loai');
  const ctEl    = document.getElementById('detail-ct');
  const nccEl   = document.getElementById('detail-ncc');
  const nguoiEl = document.getElementById('detail-nguoi');

  const loaiRes = validateCategoryCell(loaiEl, loaiOpts, { required: true, label: 'Loại chi phí' });
  if (!loaiRes.ok) { invalidCount++; msgs.push('Loại chi phí'); }

  const ctRes = validateCategoryCell(ctEl, projOpts, { required: true, label: 'Công trình' });
  if (!ctRes.ok) { invalidCount++; msgs.push('Công trình'); }

  if ((nccEl?.value || '').trim()) {
    const nccRes = validateCategoryCell(nccEl, nccOpts, { required: false, label: 'NCC' });
    if (!nccRes.ok) { invalidCount++; msgs.push('NCC'); }
  } else if (nccEl && typeof clearCellInvalid === 'function') {
    clearCellInvalid(nccEl);
  }

  if ((nguoiEl?.value || '').trim()) {
    const nguoiRes = validateCategoryCell(nguoiEl, nguoiOpts, { required: false, label: 'Người TH' });
    if (!nguoiRes.ok) { invalidCount++; msgs.push('Người TH'); }
  } else if (nguoiEl && typeof clearCellInvalid === 'function') {
    clearCellInvalid(nguoiEl);
  }

  return { ok: invalidCount === 0, count: invalidCount, msgs };
}

function saveDetailInvoice() {
  const ngay = document.getElementById('detail-ngay').value;
  if(!ngay) { toast('Vui lòng chọn ngày!','error'); return; }
  const loai = document.getElementById('detail-loai').value;
  if(!loai) { toast('Vui lòng chọn loại chi phí!','error'); return; }
  const _detCtSel = document.getElementById('detail-ct');
  const ct = _detCtSel.value;
  const _detCtPid = _detCtSel.selectedOptions[0]?.dataset?.pid || null;
  if(!ct) { toast('Vui lòng chọn công trình!','error'); return; }

  // Validate danh mục — đánh dấu ô đỏ và chặn lưu nếu có ô sai
  const _hdCatVal = validateDetailHeaderCategories();
  if (!_hdCatVal.ok) {
    toast('Thông tin không hợp lệ: ' + _hdCatVal.msgs.join(', ') + '. Vui lòng chọn từ danh mục.', 'error');
    return;
  }

  const detailNguoi = (document.getElementById('detail-nguoi')?.value||'').trim();
  const items = [];
  document.querySelectorAll('#detail-tbody tr').forEach(tr => {
    const {ten, dv, sl, dongia, ck} = getRowData(tr);
    const thanhtien = parseInt(tr.dataset.tt||'0', 10) || 0;
    if(!ten && !dongia) return;
    items.push({ten, dv, sl, dongia, ck, thanhtien});
  });
  if(!items.length) { toast('Chưa có dòng hàng hóa nào!','error'); return; }

  const tong = parseInt(document.getElementById('detail-tong').dataset.raw||'0') || 0;
  const nd = document.getElementById('detail-nd').value.trim();
  const ncc = document.getElementById('detail-ncc')?.value || '';
  const footerCkStr = (document.getElementById('detail-footer-ck')?.value||'').trim();
  const container = document.getElementById('inr-hd-chitiet');
  const editId = container.dataset.editId;

  const invFields = _ensureInvRef({ ngay, congtrinh: ct, loai, nguoi: detailNguoi, ncc, nd, tien: tong, thanhtien: tong, footerCkStr, items, source: 'detail', projectId: _detCtPid || null });

  if(editId) {
    const idx = invoices.findIndex(i => String(i.id) === String(editId));
    if(idx >= 0) {
      invoices[idx] = mkUpdate(invoices[idx], invFields);
      toast('✅ Đã cập nhật hóa đơn chi tiết!','success');
    } else {
      invoices.unshift(mkRecord(invFields));
      toast('✅ Đã lưu hóa đơn chi tiết!','success');
    }
    container.dataset.editId = '';
  } else {
    invoices.unshift(mkRecord(invFields));
    toast('✅ Đã lưu hóa đơn chi tiết!','success');
  }
  const saveBtn = document.getElementById('detail-save-btn');
  if(saveBtn) saveBtn.textContent = '💾 Lưu Hóa Đơn';

  clearInvoiceCache(); save('inv_v3', invoices);
  buildYearSelect(); updateTop();
  renderTodayInvoices();
  buildFilters(); filterAndRender();
  clearDetailForm();
}

function clearDetailForm() {
  document.getElementById('detail-tbody').innerHTML = '';
  for(let i=0; i<5; i++) addDetailRow();
  _initDetailSheetGrid();
  const ckEl = document.getElementById('detail-footer-ck');
  if(ckEl) ckEl.value = '';
  const ndEl = document.getElementById('detail-nd');
  if(ndEl) ndEl.value = '';
  const nccEl = document.getElementById('detail-ncc');
  if(nccEl) nccEl.value = '';
  const nguoiEl = document.getElementById('detail-nguoi');
  if(nguoiEl) nguoiEl.value = '';
  const container = document.getElementById('inr-hd-chitiet');
  if(container) container.dataset.editId = '';
  const saveBtn = document.getElementById('detail-save-btn');
  if(saveBtn) saveBtn.textContent = '💾 Lưu Hóa Đơn';
  calcDetailTotals();
}

// Helper: gán value cho <select> một cách linh hoạt
//   • So khớp trim + case-insensitive với options hiện có
//   • Nếu không khớp (orphaned): thêm option tạm "value (*)" để vẫn hiển thị
//   • Phát sự kiện 'change' để các listener cập nhật giao diện
function _setSelectFlexible(sel, val) {
  if (!sel) return;
  const target = (val == null ? '' : String(val)).trim();

  // Input (autocomplete): set value trực tiếp
  if (sel.tagName === 'INPUT') {
    sel.value = target;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  if (!target) { sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true })); return; }
  const targetLower = target.toLowerCase();
  let matched = null;
  for (const opt of sel.options) {
    if ((opt.value || '').trim().toLowerCase() === targetLower) { matched = opt; break; }
  }
  if (matched) {
    sel.value = matched.value;
  } else {
    const orphan = document.createElement('option');
    orphan.value = target;
    orphan.textContent = target + ' (*)';
    sel.appendChild(orphan);
    sel.value = target;
  }
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

function openDetailEdit(inv) {
  // Guard: tránh silent-fail khi items bị mất (vd: Firebase sync cũ chưa preserve items)
  if (!Array.isArray(inv.items) || !inv.items.length) {
    toast('⚠️ Hóa đơn này không có dữ liệu chi tiết (items bị thiếu). Vui lòng kiểm tra lại.', 'error');
    return;
  }
  // 1. Chuyển sang tab NHẬP CHI PHÍ (trước đây thiếu — user kẹt ở tab Thống kê)
  const navBtn = document.querySelector('.nav-btn[data-page="nhap"]');
  if (navBtn) goPage(navBtn, 'nhap');
  window.scrollTo({top:0, behavior:'smooth'});
  // Dùng một setTimeout duy nhất — loại bỏ double-timeout gây race condition trên mobile
  setTimeout(() => {
    const innerBtn = document.querySelector('.nav-link[onclick*="inr-hd-chitiet"]');
    if(innerBtn) goInnerSub(innerBtn, 'inr-hd-chitiet');

    // Set ngày TRƯỚC renderTodayInvoices (goInnerSub gọi renderTodayInvoices nên ngày phải có sẵn)
    document.getElementById('detail-ngay').value = inv.ngay || today();

    // Rebuild selects với giá trị cụ thể của HĐ đang sửa
    const loaiSel = document.getElementById('detail-loai');
    if(loaiSel) {
      loaiSel.innerHTML = '<option value="">-- Chọn Loại --</option>' +
        cats.loaiChiPhi.map(v => `<option value="${x(v)}" ${v===(inv.loai||'')?'selected':''}>${x(v)}</option>`).join('');
    }

    const _dCtSel = document.getElementById('detail-ct');
    if (_dCtSel) {
      _dCtSel.innerHTML = _buildProjOpts(inv.congtrinh || '', '-- Chọn Công Trình --');
      _dCtSel.value = inv.congtrinh || '';
      // Orphaned CT: project đã xóa nhưng HĐ vẫn còn tham chiếu → thêm option tạm
      if (inv.congtrinh && !_dCtSel.value) {
        const orphan = document.createElement('option');
        orphan.value = inv.congtrinh;
        orphan.textContent = inv.congtrinh + ' (*)';
        if (inv.projectId) orphan.dataset.pid = inv.projectId;
        _dCtSel.appendChild(orphan);
        _dCtSel.value = inv.congtrinh;
      }
    }

    // FIX: NCC/Người TH so khớp linh hoạt (trim + case-insensitive + orphan fallback)
    _setSelectFlexible(document.getElementById('detail-ncc'),   inv.ncc);
    _setSelectFlexible(document.getElementById('detail-nguoi'), inv.nguoi);

    // Load items — xóa sạch rồi render lại toàn bộ
    const tbody = document.getElementById('detail-tbody');
    tbody.innerHTML = '';
    const itemList = Array.isArray(inv.items) ? inv.items : [];
    itemList.forEach(item => addDetailRow(item));
    const needed = Math.max(0, 5 - itemList.length);
    for(let i=0; i<needed; i++) addDetailRow();

    document.getElementById('detail-nd').value = inv.nd || '';

    const ckEl2 = document.getElementById('detail-footer-ck');
    if(ckEl2) {
      const ckRaw = inv.footerCkStr || '';
      ckEl2.value = (ckRaw && !ckRaw.endsWith('%'))
        ? (() => { const n = parseMoney(ckRaw); return n ? numFmt(n) : ckRaw; })()
        : ckRaw;
    }
    calcDetailTotals();
    document.getElementById('inr-hd-chitiet').dataset.editId = String(inv.id);
    const saveBtn2 = document.getElementById('detail-save-btn');
    if(saveBtn2) saveBtn2.textContent = '💾 Cập Nhật';
    toast('✏️ Chỉnh sửa hóa đơn chi tiết rồi nhấn 💾 Cập Nhật','success');
  }, 120);
}

// Trả về tất cả <tr> trong bảng hóa đơn chi tiết
function getDetailRows() {
  return [...document.querySelectorAll('#detail-tbody tr')];
}
