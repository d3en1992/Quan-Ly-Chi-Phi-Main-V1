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
      // Tên hàng hóa: gợi ý từ các vật tư đã nhập trong HĐ chi tiết trước đây (vẫn gõ tự do)
      { field: 'ten',    type: 'history-autocomplete', source: () => invHistorySuggest('ten'), suggestFromAbove: true },
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
  // Tab nhập Hóa Đơn Chi Tiết → ẩn CT đã quyết toán
  ctSel.innerHTML = _buildProjOpts(ctSel.value || '', '-- Chọn Công Trình --', { excludeClosed: true });

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

  // Biến 4 dropdown header thành ô chọn có GÕ ĐỂ TÌM (idempotent — gọi lại không tạo trùng)
  [loaiSel, ctSel, nccSel, detNguoiSel].forEach(s => _ssEnhance(s));
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
    <td><button class="del-btn" onclick="delDetailRow(this)"><span class="material-symbols-outlined">close</span></button></td>
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

// Tổng thành tiền = cộng cột Thành tiền của mọi dòng (CK đã tính riêng từng dòng).
// (01/10/2026) Bỏ "Tổng Cộng (TC)" + "Chiết Khấu Tổng" → không còn trừ CK cấp hóa đơn.
function calcDetailTotals() {
  let tong = 0;
  getDetailRows().forEach(tr => {
    tong += parseInt(tr.dataset.tt||'0', 10) || 0;
  });

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
    const list = projs.filter(p => !p.deletedAt && p.id).map(p => ({ name: p.name, id: p.id }));
    // getAllProjects() không trả về CÔNG TY (công trình đặc biệt) — thêm thủ công để không bị coi là "không hợp lệ"
    if (typeof PROJECT_COMPANY !== 'undefined') list.unshift({ name: PROJECT_COMPANY.name, id: PROJECT_COMPANY.id });
    return list;
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
  const container = document.getElementById('inr-hd-chitiet');
  const editId = container.dataset.editId;

  // footerCkStr: '' → xóa CK tổng cũ (nếu HĐ cũ có) để dữ liệu khớp tổng mới = tổng các dòng
  // (mkUpdate gộp đè lên record cũ nên phải ghi rõ '' thay vì bỏ field)
  const invFields = _ensureInvRef({ ngay, congtrinh: ct, loai, nguoi: detailNguoi, ncc, nd, tien: tong, thanhtien: tong, footerCkStr: '', items, source: 'detail', projectId: _detCtPid || null });

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
  if(saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined msi-gap">save</span>Lưu Hóa Đơn';

  clearInvoiceCache(); save('inv_v3', invoices);
  buildYearSelect(); updateTop();
  // (01/10/2026) Lưu xong → làm sạch TOÀN BỘ form + Ngày về hôm nay, chống bấm lưu 2 lần /
  // sửa form cũ rồi lưu tiếp tạo HĐ trùng. Muốn nhập HĐ tương tự → dùng Sao chép / Dán form.
  clearDetailForm(true);
  renderTodayInvoices();
  buildFilters(); filterAndRender();
}

// Xóa form Hóa đơn chi tiết.
//   full = false (nút "Xóa form"): xóa dòng hàng, nội dung, NCC, Người TH — giữ Ngày/Loại/CT
//   full = true  (sau khi Lưu/Cập nhật thành công): xóa SẠCH mọi ô + Ngày về hôm nay
function clearDetailForm(full) {
  document.getElementById('detail-tbody').innerHTML = '';
  for(let i=0; i<5; i++) addDetailRow();
  _initDetailSheetGrid();
  const ndEl = document.getElementById('detail-nd');
  if(ndEl) ndEl.value = '';
  const nccEl = document.getElementById('detail-ncc');
  if(nccEl) nccEl.value = '';
  const nguoiEl = document.getElementById('detail-nguoi');
  if(nguoiEl) nguoiEl.value = '';
  if (full === true) {
    const dEl = document.getElementById('detail-ngay');
    if (dEl) dEl.value = today();
    const lEl = document.getElementById('detail-loai');
    if (lEl) lEl.value = '';
    const cEl = document.getElementById('detail-ct');
    if (cEl) cEl.value = '';
  }
  // Bỏ "giá trị gốc" của HĐ cũ (nếu vừa sửa) + bỏ tô đỏ
  ['detail-loai', 'detail-ct', 'detail-ncc', 'detail-nguoi'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    delete el.dataset.orig;
    if (typeof clearCellInvalid === 'function') clearCellInvalid(el);
  });
  const container = document.getElementById('inr-hd-chitiet');
  if(container) container.dataset.editId = '';
  const saveBtn = document.getElementById('detail-save-btn');
  if(saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined msi-gap">save</span>Lưu Hóa Đơn';
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
  // Bổ sung danh mục còn thiếu trước khi nạp HĐ cũ (để dropdown/validate thấy đủ tên)
  if (typeof catBackfillFromRecords === 'function') { try { catBackfillFromRecords(); } catch (e) {} }
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
        [...cats.loaiChiPhi].sort((a,b)=>a.localeCompare(b,'vi')).map(v => `<option value="${x(v)}">${x(v)}</option>`).join('');
      // So khớp linh hoạt + option tạm "(*)" nếu loại không còn trong danh mục —
      // trước đây không khớp → ô trống → báo "Loại chi phí là bắt buộc" và chặn Cập Nhật
      _setSelectFlexible(loaiSel, recCatName(inv,'inv','loai') || inv.loai || '');
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
    _setSelectFlexible(document.getElementById('detail-ncc'),   recCatName(inv,'inv','ncc'));
    _setSelectFlexible(document.getElementById('detail-nguoi'), recCatName(inv,'inv','nguoi'));

    // (01/10/2026) Ghi nhớ GIÁ TRỊ GỐC của HĐ cũ → giữ nguyên thì validate cho qua dù danh
    // mục/công trình không còn trong danh sách (validateCategoryCell kiểm tra dataset.orig)
    ['detail-loai', 'detail-ct', 'detail-ncc', 'detail-nguoi'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.value) el.dataset.orig = el.value; else delete el.dataset.orig;
      if (typeof clearCellInvalid === 'function') clearCellInvalid(el);
    });

    // Load items — xóa sạch rồi render lại toàn bộ
    const tbody = document.getElementById('detail-tbody');
    tbody.innerHTML = '';
    const itemList = Array.isArray(inv.items) ? inv.items : [];
    itemList.forEach(item => addDetailRow(item));
    const needed = Math.max(0, 5 - itemList.length);
    for(let i=0; i<needed; i++) addDetailRow();

    document.getElementById('detail-nd').value = inv.nd || '';

    calcDetailTotals();
    document.getElementById('inr-hd-chitiet').dataset.editId = String(inv.id);
    const saveBtn2 = document.getElementById('detail-save-btn');
    if(saveBtn2) saveBtn2.innerHTML = '<span class="material-symbols-outlined msi-gap">save</span>Cập Nhật';
    // HĐ cũ có "Chiết khấu tổng" (tính năng đã bỏ) → cảnh báo tổng sẽ tính lại khi Cập Nhật
    if ((inv.footerCkStr || '').trim()) {
      toast(`⚠️ HĐ này có Chiết khấu tổng cũ "${inv.footerCkStr}" — tính năng đã bỏ. Nếu Cập Nhật, tổng = cộng các dòng (hãy nhập CK vào từng dòng nếu cần).`, 'error');
    } else {
      toast('✏️ Chỉnh sửa hóa đơn chi tiết rồi nhấn 💾 Cập Nhật','success');
    }
  }, 120);
}

// Trả về tất cả <tr> trong bảng hóa đơn chi tiết
function getDetailRows() {
  return [...document.querySelectorAll('#detail-tbody tr')];
}

// ══════════════════════════════════════════════════════════════
//  SAO CHÉP / DÁN FORM HÓA ĐƠN CHI TIẾT (01/10/2026)
//  Bộ nhớ tạm dùng chung _hdClipSet/_hdClipGet (hoadon.quick-entry.js), ngăn 'detail'.
// ══════════════════════════════════════════════════════════════

// Đọc các dòng hàng hóa CÓ dữ liệu
function _detailFormItems() {
  const items = [];
  getDetailRows().forEach(tr => {
    const d = getRowData(tr);
    if (d.ten || d.dongia) items.push({ ten: d.ten, dv: d.dv, sl: d.sl, dongia: d.dongia, ck: d.ck });
  });
  return items;
}

// Sao chép: Ngày + Loại + Công trình (kèm projectId) + NCC + Người TH + các dòng hàng + Nội dung
function copyDetailForm() {
  const v = id => (document.getElementById(id)?.value || '').trim();
  const items = _detailFormItems();
  const ctSel = document.getElementById('detail-ct');
  const clip = {
    ngay: v('detail-ngay'), loai: v('detail-loai'), ct: v('detail-ct'),
    ctPid: ctSel?.selectedOptions?.[0]?.dataset?.pid || '',
    ncc: v('detail-ncc'), nguoi: v('detail-nguoi'), nd: v('detail-nd'), items,
  };
  if (!clip.loai && !clip.ct && !clip.ncc && !clip.nguoi && !items.length) {
    toast('Form đang trống — chưa có gì để sao chép', 'error'); return;
  }
  _hdClipSet('detail', clip);
  toast(`📋 Đã sao chép form (${items.length} dòng hàng). Lưu xong bấm "Dán form" để nhập HĐ tương tự.`, 'success');
}

// Dán form đã sao chép (tạo HĐ MỚI — thoát chế độ sửa HĐ cũ nếu đang sửa)
function pasteDetailForm() {
  const clip = _hdClipGet('detail');
  if (!clip) { toast('Chưa có form nào được sao chép — bấm "Sao chép form" trước', 'error'); return; }
  const hasData = _detailFormItems().length
    || ['detail-loai', 'detail-ct', 'detail-ncc', 'detail-nguoi'].some(id => document.getElementById(id)?.value);
  if (hasData && !confirm('Form đang có dữ liệu. Thay bằng form đã sao chép?')) return;

  _initDetailFormSelects(); // đảm bảo dropdown có đủ danh mục mới nhất
  clearDetailForm(true);    // xóa sạch + thoát chế độ sửa (editId, giá trị gốc)
  if (clip.ngay) document.getElementById('detail-ngay').value = clip.ngay;
  _setSelectFlexible(document.getElementById('detail-loai'),  clip.loai);
  const ctSel = document.getElementById('detail-ct');
  _setSelectFlexible(ctSel, clip.ct);
  // CT không còn trong danh sách (option tạm "(*)") → gắn lại projectId đã sao chép
  const ctOpt = ctSel?.selectedOptions?.[0];
  if (ctOpt && !ctOpt.dataset.pid && clip.ctPid) ctOpt.dataset.pid = clip.ctPid;
  _setSelectFlexible(document.getElementById('detail-ncc'),   clip.ncc);
  _setSelectFlexible(document.getElementById('detail-nguoi'), clip.nguoi);

  const tbody = document.getElementById('detail-tbody');
  tbody.innerHTML = '';
  const items = Array.isArray(clip.items) ? clip.items : [];
  items.forEach(it => addDetailRow({ ...it }));
  for (let i = items.length; i < 5; i++) addDetailRow();
  getDetailRows().forEach(tr => calcDetailRow(tr));
  calcDetailTotals();
  document.getElementById('detail-nd').value = clip.nd || '';
  renderTodayInvoices();
  toast(`📥 Đã dán form sao chép lúc ${_hdClipTime(clip)} — sửa số tiền/nội dung rồi Lưu`, 'success');
}

// ══════════════════════════════════════════════════════════════════
//  Ô CHỌN CÓ GÕ ĐỂ TÌM (searchable select) — (01/10/2026)
// ══════════════════════════════════════════════════════════════════
// Cách làm: GIỮ NGUYÊN <select> gốc (ẩn đi) làm nơi lưu giá trị → mọi code cũ
// (đọc .value, selectedOptions[0].dataset.pid, dựng lại innerHTML, _setSelectFlexible,
// validateCategoryCell...) vẫn chạy y như trước. Phía trên đặt 1 ô <input> để gõ:
//   • Bấm vào ô → hiện toàn bộ danh sách; gõ chữ → lọc theo tên (không phân biệt dấu/hoa thường)
//   • ↑/↓ di chuyển, Enter chọn, Esc hủy; click chuột để chọn
//   • Rời ô mà chữ gõ không khớp mục nào → trả lại tên đang chọn (không cho nhập tên lạ)
// Đồng bộ ngược: khi code khác đổi option / gán .value cho <select> → ô input tự cập nhật.

// Chuẩn hóa để so khớp: bỏ dấu tiếng Việt, đ→d, chữ thường, gộp khoảng trắng
function _ssNorm(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Cập nhật chữ hiển thị trên ô input theo option đang chọn của <select>
function _ssRefresh(sel) {
  const st = sel && sel._ss;
  if (!st) return;
  const opt = sel.selectedOptions[0];
  const placeholderOpt = sel.options[0] && sel.options[0].value === '' ? sel.options[0] : null;
  st.input.placeholder = placeholderOpt ? placeholderOpt.textContent : '';
  // Đang mở danh sách để gõ thì không ghi đè chữ người dùng đang gõ
  if (!st.open) st.input.value = (opt && opt.value !== '') ? opt.textContent : '';
  st.input.title = st.input.value;
  // Đồng bộ trạng thái "ô sai" (validateCategoryCell gắn class lên <select>)
  st.input.classList.toggle('sheet-cell-invalid', sel.classList.contains('sheet-cell-invalid'));
  if (sel.title) st.input.title = sel.title;
}

// Vẽ danh sách gợi ý theo chữ đang gõ
function _ssRenderList(sel, query) {
  const st = sel._ss;
  const q = _ssNorm(query);
  const esc = typeof x === 'function' ? x : (s => String(s));
  st.items = [...sel.options].filter(o => !o.disabled && (!q || o.value === '' || _ssNorm(o.textContent).includes(q)));
  // Khi đang gõ tìm thì ẩn dòng "-- Chọn ... --" cho gọn
  if (q) st.items = st.items.filter(o => o.value !== '');
  if (!st.items.length) {
    st.list.innerHTML = '<div class="ss-empty">Không tìm thấy — kiểm tra lại tên hoặc thêm ở tab Danh Mục</div>';
    st.active = -1;
    return;
  }
  // Mặc định tô sáng mục đang chọn (nếu có trong danh sách), không thì mục đầu tiên
  const curIdx = st.items.findIndex(o => o.value === sel.value && o.value !== '');
  st.active = q ? 0 : Math.max(0, curIdx);
  st.list.innerHTML = st.items.map((o, i) => {
    const cls = ['ss-item', o.value === '' ? 'placeholder' : '', o.value === sel.value && o.value !== '' ? 'selected' : '', i === st.active ? 'active' : ''].join(' ');
    return `<div class="${cls}" data-i="${i}" title="${esc(o.textContent)}">${esc(o.textContent)}</div>`;
  }).join('');
  _ssScrollActive(sel);
}

function _ssScrollActive(sel) {
  const el = sel._ss.list.querySelector('.ss-item.active');
  if (el) el.scrollIntoView({ block: 'nearest' });
}

function _ssOpen(sel) {
  const st = sel._ss;
  st.open = true;
  st.list.classList.add('open');
  _ssRenderList(sel, '');
}

function _ssClose(sel) {
  const st = sel._ss;
  st.open = false;
  st.list.classList.remove('open');
  _ssRefresh(sel); // trả chữ hiển thị về mục đang chọn
}

// Chọn 1 option → gán vào <select> gốc + phát sự kiện change như người dùng chọn thật
function _ssPick(sel, opt) {
  if (!opt) return;
  sel.value = opt.value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  _ssClose(sel);
}

function _ssEnhance(sel) {
  if (!sel || sel._ss || sel.tagName !== 'SELECT') return;

  const wrap = document.createElement('div');
  wrap.className = 'ss-wrap';
  // Giữ độ rộng tối thiểu như <select> cũ để layout header không bị xô lệch
  wrap.style.minWidth = sel.style.minWidth || '160px';
  if (sel.style.maxWidth) wrap.style.maxWidth = sel.style.maxWidth;
  // <select> w-auto tự giãn theo tên dài nhất → lấy độ rộng thực tế lúc còn hiển thị
  const w = sel.offsetWidth;
  if (w > 0) wrap.style.width = w + 'px';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-select form-select-sm ss-input';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.id = sel.id ? sel.id + '-ss' : '';
  const list = document.createElement('div');
  list.className = 'ss-list';

  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(input);
  wrap.appendChild(list);
  wrap.appendChild(sel);
  sel._ss = { wrap, input, list, items: [], active: -1, open: false };

  // Bắt mọi lần code khác gán sel.value = ... (không phát sự kiện) → cập nhật ô hiển thị
  const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(sel, 'value', {
    configurable: true,
    get() { return desc.get.call(this); },
    set(v) { desc.set.call(this, v); _ssRefresh(this); },
  });
  // Option bị dựng lại (innerHTML) hoặc class "ô sai" thay đổi → cập nhật ô hiển thị
  new MutationObserver(() => _ssRefresh(sel))
    .observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'title'] });
  sel.addEventListener('change', () => _ssRefresh(sel));

  input.addEventListener('focus', () => { _ssOpen(sel); input.select(); });
  input.addEventListener('click', () => { if (!sel._ss.open) { _ssOpen(sel); input.select(); } });
  input.addEventListener('input', () => {
    if (!sel._ss.open) { sel._ss.open = true; list.classList.add('open'); }
    _ssRenderList(sel, input.value);
  });
  input.addEventListener('keydown', e => {
    const st = sel._ss;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!st.open) { _ssOpen(sel); return; }
      if (!st.items.length) return;
      st.active = (st.active + (e.key === 'ArrowDown' ? 1 : -1) + st.items.length) % st.items.length;
      list.querySelectorAll('.ss-item').forEach((el, i) => el.classList.toggle('active', i === st.active));
      _ssScrollActive(sel);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (st.open && st.active >= 0) _ssPick(sel, st.items[st.active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      _ssClose(sel);
      input.blur();
    } else if (e.key === 'Tab') {
      // Tab: nếu đang gõ dở và có đúng mục tô sáng → chọn luôn rồi sang ô kế
      if (st.open && input.value.trim() && st.active >= 0) _ssPick(sel, st.items[st.active]);
    }
  });
  input.addEventListener('blur', () => {
    const st = sel._ss;
    if (!st.open) return;
    // Chữ gõ khớp CHÍNH XÁC 1 mục (không phân biệt dấu) → chọn mục đó; không thì giữ mục cũ
    const typed = _ssNorm(input.value);
    if (typed) {
      const exact = [...sel.options].find(o => o.value !== '' && _ssNorm(o.textContent) === typed);
      if (exact && exact.value !== sel.value) { _ssPick(sel, exact); return; }
    }
    _ssClose(sel);
  });
  // mousedown + preventDefault: chọn được trước khi ô input mất focus (blur)
  list.addEventListener('mousedown', e => {
    e.preventDefault();
    const it = e.target.closest('.ss-item');
    if (it) _ssPick(sel, sel._ss.items[+it.dataset.i]);
  });

  _ssRefresh(sel);
}
