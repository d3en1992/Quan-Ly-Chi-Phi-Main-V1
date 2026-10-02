// tienung.entry.js — Tiền Ứng: form nhập PHÂN BỔ ĐA CÔNG TRÌNH, lưu, sửa
// Load order: sau tienung.core.js (cần _ssEnhance của hoadon.detail-entry.js — nạp trước)
//
// (01/10/2026) Thiết kế lại form nhập:
//   Đầu phiếu : Ngày · Đối tượng (Thầu phụ / NCC) · Tên đối tác · Tổng số tiền ứng
//   Dòng nợ   : "Tổng nợ công ty đang nợ hợp lệ" của đối tác (ungPartnerDebt)
//   Phân bổ   : nhiều dòng Công trình · Số tiền (placeholder = số CT đó còn nợ) · Nội dung
//   Còn lại   : Tổng ứng − Đã phân bổ, cập nhật realtime (calcUngSummary)
// Lưu: MỖI dòng phân bổ = 1 bản ghi ung_v1 { ngay, loai, tp, congtrinh, projectId, tien, nd }
// như trước → báo cáo Tiền Ứng, Công Nợ, phiếu ứng... không phải đổi gì.
// Phần chưa phân bổ → 1 bản ghi KHÔNG gắn công trình, nội dung "Ứng chung chờ phân bổ".
//
// Giữ nguyên tên hàm/ID cũ (initUngTable, addUngRow(s), saveAllUngRows, editUngRecord,
// rebuildUngSelects, #ung-tbody, #ung-date...) vì main.js, tienich.js (phím tắt Ctrl/Shift+Enter,
// numpad), tienung.history.js (nút Sửa) đang gọi tới.

const UNG_CHUNG_ND = 'Ứng chung chờ phân bổ';
let _ungDebt = null; // kết quả ungPartnerDebt() của đối tác đang chọn

// ══════════════════════════════════════════════════════════════
//  TÍNH CÔNG NỢ HỢP LỆ CỦA 1 ĐỐI TÁC
// ══════════════════════════════════════════════════════════════

// Khóa công trình của 1 record: ưu tiên projectId (kể cả tra từ tên), không có thì theo tên.
// '' = record không gắn công trình (ứng chung).
function _ungCtKey(r) {
  const name = (r && (r.congtrinh || r.ct)) || '';
  const pid = (r && r.projectId) || (name && typeof _getProjectIdByName === 'function' ? _getProjectIdByName(name) : null);
  if (pid) return 'pid:' + pid;
  return name ? 'name:' + normalizeKey(name) : '';
}

/**
 * Công nợ của 1 Thầu phụ / NCC theo TỪNG công trình — tính trên TOÀN BỘ các năm
 * (nợ cộng dồn qua năm, khác bảng Công Nợ đang lọc theo năm đang chọn).
 *   Thầu phụ : giá trị = HĐ thầu phụ (giaTri + phatSinh) — chỉ CT ĐÃ CÓ HĐ thầu phụ
 *   NCC      : giá trị = tổng hóa đơn có NCC này        — chỉ CT ĐÃ CÓ chi phí
 *   Đã ứng   : tổng phiếu ứng cùng loại + cùng đối tác tại CT đó
 * CT chưa có HĐ / chi phí bị BỎ QUA hoàn toàn (kể cả nếu đã có tiền ứng ở đó).
 * @param {string} excludeId  id phiếu ứng đang sửa — không tính vào "đã ứng"
 * @returns {{valid: Array, total: number, over: number, unalloc: number}}
 *   valid  : [{key, name, pid, value, daUng, con}] CT hợp lệ, còn nợ nhiều xếp trước
 *   total  : tổng nợ hợp lệ (cộng các CT còn nợ > 0)
 *   over   : tổng ứng dư ở các CT đã ứng vượt giá trị
 *   unalloc: tổng phiếu "ứng chung" chưa gắn công trình
 */
function ungPartnerDebt(loai, tp, excludeId) {
  const out = { valid: [], total: 0, over: 0, unalloc: 0 };
  const nTp = normalizeKey(tp || '');
  if (!nTp) return out;
  const byCt = new Map();
  const ens = (r) => {
    const key = _ungCtKey(r);
    if (!key) return null;
    if (!byCt.has(key)) {
      const name = _resolveCtName(r) || r.congtrinh || '';
      const pid = r.projectId || (typeof _getProjectIdByName === 'function' ? _getProjectIdByName(name) : '') || '';
      byCt.set(key, { key, name, pid, value: 0, daUng: 0 });
    }
    return byCt.get(key);
  };

  if (loai === 'nhacungcap') {
    // NCC: chi phí hợp lệ = hóa đơn (kể cả HĐ suy ra từ chấm công) có NCC này
    (typeof getInvoicesCached === 'function' ? getInvoicesCached() : []).forEach(inv => {
      if (!inv || inv.deletedAt) return;
      if (normalizeKey(recCatName(inv, 'inv', 'ncc') || '') !== nTp) return;
      const c = ens(inv);
      if (c) c.value += (inv.thanhtien || inv.tien || 0);
    });
  } else {
    // Thầu phụ: giá trị hợp đồng thầu phụ
    const hdtp = (typeof thauPhuContracts !== 'undefined' && Array.isArray(thauPhuContracts))
      ? thauPhuContracts : load('thauphu_v1', []);
    hdtp.forEach(r => {
      if (!r || r.deletedAt) return;
      if (normalizeKey(recCatName(r, 'thauphu', 'thauphu') || r.thauphu || '') !== nTp) return;
      const c = ens(r);
      if (c) c.value += (r.giaTri || 0) + (r.phatSinh || 0);
    });
  }

  // Tiền đã ứng (cùng loại + cùng đối tác)
  (typeof ungRecords !== 'undefined' ? ungRecords : []).forEach(r => {
    if (!r || r.deletedAt) return;
    if ((r.loai || 'thauphu') !== loai) return;
    if (excludeId != null && String(r.id) === String(excludeId)) return;
    if (normalizeKey(recCatName(r, 'ung', 'tp') || '') !== nTp) return;
    const tien = r.tien || 0;
    const c = ens(r);
    if (c) c.daUng += tien;
    else out.unalloc += tien; // phiếu không gắn công trình = ứng chung
  });

  out.valid = [...byCt.values()]
    .filter(c => c.value > 0) // CHỈ CT đã có HĐ thầu phụ / chi phí
    .map(c => ({ ...c, con: c.value - c.daUng }))
    .sort((a, b) => b.con - a.con || a.name.localeCompare(b.name, 'vi'));
  out.valid.forEach(c => {
    if (c.con > 0) out.total += c.con;
    else if (c.con < 0) out.over += -c.con;
  });
  return out;
}

// Số còn nợ của 1 công trình (theo tên + pid của option đang chọn) trong _ungDebt
function _ungDebtOfCt(name, pid) {
  if (!_ungDebt || !name) return null;
  const key = _ungCtKey({ congtrinh: name, projectId: pid || null });
  return _ungDebt.valid.find(c => c.key === key) || null;
}

// Vẽ dòng tổng nợ dưới đầu phiếu — CHỈ 1 câu tĩnh, không icon/màu/giải thích phụ:
//   "Tổng nợ công ty đang nợ hợp lệ: 23.325.600 đ"
// Chưa chọn đối tác → để trống.
function _ungRenderDebt() {
  const box = document.getElementById('ung-debt-info');
  if (!box) return;
  const tp = document.getElementById('ung-tp')?.value || '';
  box.textContent = tp ? `Tổng nợ công ty đang nợ hợp lệ: ${numFmt((_ungDebt && _ungDebt.total) || 0) || 0} đ` : '';
}

// ══════════════════════════════════════════════════════════════
//  DROPDOWN: ĐỐI TÁC + CÔNG TRÌNH
// ══════════════════════════════════════════════════════════════

function _ungTpOptions(loai) {
  if (loai === 'nhacungcap') return cats.nhaCungCap;
  return cats.thauPhu;
}

// Dựng option Thầu phụ / NCC từ danh mục (giữ tên đang chọn, kể cả tên không còn trong danh mục)
function _ungBuildPartnerOpts(keepVal) {
  const sel = document.getElementById('ung-tp');
  if (!sel) return;
  const loai = document.getElementById('ung-loai')?.value || 'thauphu';
  const cur = keepVal !== undefined ? keepVal : sel.value;
  const list = [...(_ungTpOptions(loai) || [])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi'));
  const ph = loai === 'nhacungcap' ? '-- Chọn nhà cung cấp --' : '-- Chọn thầu phụ --';
  let html = `<option value="">${ph}</option>` + list.map(v => `<option value="${x(v)}">${x(v)}</option>`).join('');
  const hit = cur && list.find(v => normalizeKey(v) === normalizeKey(cur));
  if (cur && !hit) html += `<option value="${x(cur)}">${x(cur)} (*)</option>`;
  sel.innerHTML = html;
  sel.value = hit || cur || '';
  if (typeof _ssEnhance === 'function') _ssEnhance(sel);
}

// Option Công trình cho 1 dòng phân bổ:
//   1) CT còn nợ của đối tác xếp đầu (chỉ tên — số nợ hiện ở placeholder ô tiền)
//   2) các CT đang hoạt động khác
function _ungCtOptionsHtml(selName, selPid) {
  let html = '<option value="">-- Chọn công trình --</option>';
  const used = new Set();
  const add = (name, pid, label) => {
    const k = pid ? 'pid:' + pid : 'name:' + normalizeKey(name);
    if (!name || used.has(k)) return;
    used.add(k);
    html += `<option value="${x(name)}"${pid ? ` data-pid="${x(pid)}"` : ''}>${x(label || name)}</option>`;
  };
  (_ungDebt ? _ungDebt.valid : []).forEach(c => {
    if (c.con > 0) add(c.name, c.pid);
  });
  const projs = [
    ...(typeof PROJECT_COMPANY !== 'undefined' && PROJECT_COMPANY ? [PROJECT_COMPANY] : []),
    ...(typeof getAllProjects === 'function' ? getAllProjects() : []),
  ];
  projs
    .filter(p => p && !p.deletedAt && p.status !== 'closed'
      && (p.id === 'COMPANY' || typeof _ctInActiveYear !== 'function' || typeof activeYear === 'undefined' || activeYear === 0 || _ctInActiveYear(p.name)))
    .sort((a, b) => (a.id === 'COMPANY' ? -1 : b.id === 'COMPANY' ? 1 : a.name.localeCompare(b.name, 'vi')))
    .forEach(p => add(p.name, p.id));
  // Giá trị đang có nhưng không nằm trong danh sách (CT đã đóng/xóa khi sửa phiếu cũ)
  if (selName) {
    const k = selPid ? 'pid:' + selPid : 'name:' + normalizeKey(selName);
    if (!used.has(k)) add(selName, selPid, selName + ' (*)');
  }
  return html;
}

// Chọn option trong select CT theo tên/pid
function _ungSelectCt(sel, name, pid) {
  if (!sel) return;
  const opt = [...sel.options].find(o => o.value && (
    (pid && o.dataset.pid === String(pid)) || normalizeKey(o.value) === normalizeKey(name || '')));
  sel.value = opt ? opt.value : '';
}

// ══════════════════════════════════════════════════════════════
//  DÒNG PHÂN BỔ
// ══════════════════════════════════════════════════════════════

// Gắn định dạng nghìn cho ô tiền (giữ số thô ở data-raw)
function _ungBindMoney(inp, onChange) {
  inp.addEventListener('input', function () {
    const raw = this.value.replace(/[^\d]/g, '');
    this.dataset.raw = raw;
    if (raw) this.value = numFmt(parseInt(raw, 10) || 0);
    onChange();
  });
  inp.addEventListener('focus', function () { this.value = this.dataset.raw || ''; });
  inp.addEventListener('blur', function () {
    const raw = parseInt(this.dataset.raw || '0', 10) || 0;
    this.value = raw ? numFmt(raw) : '';
  });
}
const _ungRaw = el => parseInt(el?.dataset?.raw || '0', 10) || 0;

// d = { congtrinh, projectId, tien, nd }
function addUngRow(d = {}) {
  const tbody = document.getElementById('ung-tbody');
  if (!tbody) return;
  const num = tbody.children.length + 1;
  const tr = document.createElement('tr');
  // Cấu trúc ô giống hệt bảng Nhập nhanh: <td><input class="cell-input ..."></td>
  tr.innerHTML = `
    <td class="row-num">${num}</td>
    <td><select class="cell-input" data-f="ct">${_ungCtOptionsHtml(d.congtrinh, d.projectId)}</select></td>
    <td><input class="cell-input right tien-input" data-f="tien" data-raw="${d.tien || ''}" value="${d.tien ? numFmt(d.tien) : ''}"
      placeholder="0" inputmode="decimal" autocomplete="off"></td>
    <td><input class="cell-input" data-f="nd" value="${x(d.nd || '')}" placeholder="Nội dung..."></td>
    <td><button class="del-btn" onclick="delUngRow(this)" title="Xóa dòng"><span class="material-symbols-outlined">close</span></button></td>
  `;
  tbody.appendChild(tr);

  const ctSel = tr.querySelector('[data-f="ct"]');
  _ungSelectCt(ctSel, d.congtrinh, d.projectId);
  ctSel.addEventListener('change', () => { _ungUpdateRowPlaceholder(tr); calcUngSummary(); });
  if (typeof _ssEnhance === 'function') _ssEnhance(ctSel); // gõ để tìm công trình

  _ungBindMoney(tr.querySelector('[data-f="tien"]'), calcUngSummary);
  _ungUpdateRowPlaceholder(tr);
}

function addUngRows(n) { for (let i = 0; i < n; i++) addUngRow(); calcUngSummary(); }

// Chữ mờ (placeholder) ô Số tiền = số đối tác còn nợ tại công trình đang chọn (vd "6.000.000").
// CT không còn nợ / chưa chọn CT → "0" như bảng Nhập nhanh.
function _ungUpdateRowPlaceholder(tr) {
  const sel = tr.querySelector('[data-f="ct"]');
  const inp = tr.querySelector('[data-f="tien"]');
  if (!sel || !inp) return;
  const opt = sel.selectedOptions[0];
  const c = opt && opt.value ? _ungDebtOfCt(opt.value, opt.dataset.pid) : null;
  inp.placeholder = (c && c.con > 0) ? numFmt(c.con) : '0';
}

function delUngRow(btn) { btn.closest('tr').remove(); renumberUng(); calcUngSummary(); }

function renumberUng() { renumberRows('#ung-tbody'); }

function clearUngRows() {
  const tbody = document.getElementById('ung-tbody');
  if (tbody) tbody.innerHTML = '';
  calcUngSummary();
}

// ══════════════════════════════════════════════════════════════
//  TỔNG HỢP REALTIME: đã phân bổ / còn lại
// ══════════════════════════════════════════════════════════════
function calcUngSummary() {
  let alloc = 0;
  document.querySelectorAll('#ung-tbody tr').forEach(tr => {
    alloc += _ungRaw(tr.querySelector('[data-f="tien"]'));
    _ungUpdateRowPlaceholder(tr);
  });

  // Trừ lùi: Tổng tiền ứng − đã phân bổ. Bỏ trống Tổng → tổng = đã phân bổ.
  const totalRaw = _ungRaw(document.getElementById('ung-total'));
  const remEl = document.getElementById('ung-remain');
  if (remEl) {
    remEl.classList.remove('zero', 'pos', 'neg');
    if (!totalRaw) {
      remEl.textContent = alloc ? `Tổng ứng = đã phân bổ: ${numFmt(alloc)} đ` : 'Còn lại: 0 đ';
      remEl.classList.add('zero');
    } else {
      const rem = totalRaw - alloc;
      if (rem > 0) { remEl.textContent = `🟡 Còn lại: ${numFmt(rem)} đ`; remEl.classList.add('pos'); }
      else if (rem < 0) { remEl.textContent = `⚠ Phân bổ vượt tổng: ${numFmt(-rem)} đ`; remEl.classList.add('neg'); }
      else { remEl.textContent = '✅ Đã phân bổ hết'; remEl.classList.add('zero'); }
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  SỰ KIỆN ĐẦU PHIẾU
// ══════════════════════════════════════════════════════════════

// Đổi Đối tượng (Thầu phụ ↔ NCC) → đổi nhãn + danh sách đối tác, bỏ đối tác đang chọn
function onUngLoaiChange() {
  const loai = document.getElementById('ung-loai')?.value || 'thauphu';
  const lbl = document.getElementById('ung-tp-label');
  if (lbl) lbl.innerHTML = (loai === 'nhacungcap' ? 'Nhà cung cấp' : 'Thầu phụ') + ' <span class="text-danger">*</span>';
  _ungBuildPartnerOpts('');
  onUngPartnerChange();
}

// Đổi đối tác → tính lại công nợ, dựng lại option CT (CT còn nợ lên đầu), cập nhật gợi ý
function onUngPartnerChange() {
  const loai = document.getElementById('ung-loai')?.value || 'thauphu';
  const tp = document.getElementById('ung-tp')?.value || '';
  _ungDebt = tp ? ungPartnerDebt(loai, tp, _editingUngId) : null;
  _ungRenderDebt();
  rebuildUngSelects(true);
  calcUngSummary();
}

// ══════════════════════════════════════════════════════════════
//  KHỞI TẠO / RESET
// ══════════════════════════════════════════════════════════════

// Khởi tạo form (giữ tên cũ — main.js gọi initUngTable(4)). n = số dòng phân bổ trống.
function initUngTable(n = 2) {
  // Luôn dựng lại danh sách đối tác (giữ tên đang chọn) — lúc khởi động danh mục có thể
  // chưa nạp xong, main.js gọi lại initUngTable sau khi kéo cloud.
  _ungBuildPartnerOpts();
  const _tp = document.getElementById('ung-tp')?.value || '';
  _ungDebt = _tp ? ungPartnerDebt(document.getElementById('ung-loai')?.value || 'thauphu', _tp, _editingUngId) : null;
  const totalEl = document.getElementById('ung-total');
  if (totalEl && !totalEl.dataset.bound) {
    totalEl.dataset.bound = '1';
    _ungBindMoney(totalEl, calcUngSummary);
  }
  const dEl = document.getElementById('ung-date');
  if (dEl && !dEl.value) dEl.value = today();
  const tbody = document.getElementById('ung-tbody');
  if (tbody) tbody.innerHTML = '';
  for (let i = 0; i < Math.min(n, 2); i++) addUngRow();
  _ungRenderDebt();
  calcUngSummary();
}

function initUngTableIfEmpty() {
  const tbody = document.getElementById('ung-tbody');
  if (tbody && tbody.children.length === 0) initUngTable(2);
}

// Làm sạch toàn bộ phiếu (sau khi lưu / bấm Xóa form): ngày về hôm nay, bỏ đối tác, tổng, dòng
function resetUngForm() {
  _editingUngId = null;
  const dEl = document.getElementById('ung-date');
  if (dEl) dEl.value = today();
  const totalEl = document.getElementById('ung-total');
  if (totalEl) { totalEl.value = ''; totalEl.dataset.raw = ''; }
  _ungBuildPartnerOpts('');
  _ungDebt = null;
  initUngTable(2);
  const btn = document.getElementById('ung-save-btn');
  if (btn) btn.innerHTML = '<span class="material-symbols-outlined msi-gap">save</span>Lưu phiếu ứng';
  document.querySelectorAll('.editing-row').forEach(tr => tr.classList.remove('editing-row'));
}

function clearUngTable() {
  if (!confirm('Xóa toàn bộ phiếu ứng đang nhập?')) return;
  resetUngForm();
}

// ══════════════════════════════════════════════════════════════
//  LƯU PHIẾU
// ══════════════════════════════════════════════════════════════
function saveAllUngRows() {
  const date = document.getElementById('ung-date').value;
  if (!date) { toast('Vui lòng chọn ngày!', 'error'); return; }
  const loai = document.getElementById('ung-loai')?.value || 'thauphu';
  const tp = (document.getElementById('ung-tp')?.value || '').trim();
  if (!tp) { toast(`Vui lòng chọn ${loai === 'nhacungcap' ? 'nhà cung cấp' : 'thầu phụ'}!`, 'error'); return; }

  // Đọc các dòng phân bổ
  const rows = [];
  let errRow = 0, errMsg = '';
  document.querySelectorAll('#ung-tbody tr').forEach(tr => {
    const ctSel = tr.querySelector('[data-f="ct"]');
    const ct = (ctSel?.value || '').trim();
    const ctPid = _readPidFromSel(ctSel);
    const tien = _ungRaw(tr.querySelector('[data-f="tien"]'));
    const nd = (tr.querySelector('[data-f="nd"]')?.value || '').trim();
    if (!ct && !tien) { tr.style.background = ''; return; } // dòng trống
    let bad = '';
    if (!ct) bad = 'thiếu công trình';
    else if (!tien) bad = 'thiếu số tiền';
    else if (ctPid && ctPid !== 'COMPANY') {
      const proj = getProjectById(ctPid);
      if (proj && proj.status === 'closed') bad = 'công trình đã quyết toán';
    }
    if (bad) { errRow++; errMsg = errMsg || bad; tr.style.background = '#fdecea'; return; }
    tr.style.background = '';
    rows.push({ ngay: date, loai, tp, congtrinh: ct, projectId: ctPid || null, tien, nd });
  });
  if (errRow) { toast(`${errRow} dòng phân bổ có lỗi (${errMsg})!`, 'error'); return; }

  const alloc = rows.reduce((s, r) => s + r.tien, 0);
  const totalRaw = _ungRaw(document.getElementById('ung-total'));
  const total = totalRaw || alloc;
  if (total <= 0) { toast('Nhập Tổng số tiền ứng hoặc số tiền cho công trình!', 'error'); return; }
  if (alloc > total) { toast(`Đã phân bổ ${numFmt(alloc)} đ — vượt Tổng tiền ứng ${numFmt(total)} đ!`, 'error'); return; }

  // Phần chưa phân bổ → phiếu "ứng chung" không gắn công trình (hỏi trước)
  const remain = total - alloc;
  if (remain > 0) {
    const ok = confirm(`Còn ${numFmt(remain)} đ chưa phân bổ cho công trình nào.\n\nLưu phần này thành "${UNG_CHUNG_ND}" (không gắn công trình)?\n• OK: lưu\n• Hủy: quay lại phân bổ tiếp`);
    if (!ok) return;
    rows.push({ ngay: date, loai, tp, congtrinh: '', projectId: null, tien: remain, nd: UNG_CHUNG_ND });
  }

  let saved = 0, updated = 0;
  rows.forEach((rec, i) => {
    // Đang sửa phiếu cũ: dòng ĐẦU cập nhật đè phiếu cũ, các dòng sau tạo phiếu mới
    if (i === 0 && _editingUngId != null) {
      const idx = ungRecords.findIndex(r => String(r.id) === String(_editingUngId));
      if (idx >= 0) { ungRecords[idx] = mkUpdate(ungRecords[idx], rec); updated++; return; }
    }
    ungRecords.unshift(mkRecord(rec));
    saved++;
  });

  save('ung_v1', ungRecords);
  const parts = [];
  if (updated) parts.push(`cập nhật ${updated}`);
  if (saved) parts.push(`lưu ${saved}`);
  toast(`✅ Đã ${parts.join(', ')} phiếu ứng · ${tp} · tổng ${numFmt(total)} đ`, 'success');
  _editingUngId = null;
  resetUngForm();
  buildUngFilters();
  filterAndRenderUng();
  if (typeof renderUngMini === 'function') renderUngMini();
}

// ══════════════════════════════════════════════════════════════
//  SỬA PHIẾU CŨ (nút ✏️ ở bảng phiếu ứng)
// ══════════════════════════════════════════════════════════════
function editUngRecord(id) {
  const rec = ungRecords.find(r => String(r.id) === String(id) && !r.deletedAt);
  if (!rec) return;
  // Phiếu ứng công nhân sửa ở tab Chấm Công (popup Tiền ứng CN)
  if (rec.loai === 'congnhan') { toast('Phiếu ứng công nhân sửa ở tab Chấm Công → Ứng Công Nhân', 'info'); return; }
  // Phiếu tự sinh từ Tất toán → chỉ xem, không sửa
  if (rec.autoSettle) { toast('Phiếu tự sinh từ Tất toán — chỉ xem, không sửa được', 'error'); return; }

  _editingUngId = id;
  document.getElementById('ung-date').value = rec.ngay || '';
  const loaiSel = document.getElementById('ung-loai');
  if (loaiSel) loaiSel.value = rec.loai === 'nhacungcap' ? 'nhacungcap' : 'thauphu';
  const lbl = document.getElementById('ung-tp-label');
  if (lbl) lbl.innerHTML = (loaiSel?.value === 'nhacungcap' ? 'Nhà cung cấp' : 'Thầu phụ') + ' <span class="text-danger">*</span>';
  _ungBuildPartnerOpts(recCatName(rec, 'ung', 'tp') || rec.tp || '');
  const totalEl = document.getElementById('ung-total');
  if (totalEl) { totalEl.dataset.raw = rec.tien || ''; totalEl.value = rec.tien ? numFmt(rec.tien) : ''; }

  // Công nợ tính KHÔNG gồm chính phiếu đang sửa
  _ungDebt = ungPartnerDebt(loaiSel?.value || 'thauphu', document.getElementById('ung-tp').value, id);
  _ungRenderDebt();
  clearUngRows();
  const ctName = rec.projectId ? resolveProjectName(rec) : rec.congtrinh;
  if (ctName) addUngRow({ congtrinh: ctName, projectId: rec.projectId, tien: rec.tien, nd: rec.nd });
  addUngRow();
  calcUngSummary();

  // Nút Sửa có thể nằm ở bảng báo cáo (subtab 2) → về subtab Nhập để thấy form.
  if (typeof ungShowSubNhap === 'function') ungShowSubNhap();
  if (typeof renderUngMini === 'function') renderUngMini();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const btn = document.getElementById('ung-save-btn');
  if (btn) btn.innerHTML = '<span class="material-symbols-outlined msi-gap">save</span>Cập nhật phiếu ứng';

  document.querySelectorAll('.editing-row').forEach(tr => tr.classList.remove('editing-row'));
  const row = document.querySelector(`[data-ung-id="${id}"]`);
  if (row) row.classList.add('editing-row'), row.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Dựng lại dropdown (danh mục / công trình vừa đổi). keepPartner = true → không dựng lại đối tác.
function rebuildUngSelects(keepPartner) {
  if (keepPartner !== true) _ungBuildPartnerOpts();
  document.querySelectorAll('#ung-tbody [data-f="ct"]').forEach(sel => {
    if (sel.tagName !== 'SELECT') return;
    const opt = sel.selectedOptions[0];
    const cur = sel.value, pid = opt?.dataset?.pid || '';
    sel.innerHTML = _ungCtOptionsHtml(cur, pid);
    _ungSelectCt(sel, cur, pid);
  });
}

function exportUngEntryCSV() {
  const tp = document.getElementById('ung-tp')?.value || '';
  const rows = [['Thầu Phụ / Nhà CC', 'Công Trình', 'Số Tiền Ứng', 'Nội Dung']];
  document.querySelectorAll('#ung-tbody tr').forEach(tr => {
    const ct = tr.querySelector('[data-f="ct"]')?.value || '';
    const tien = _ungRaw(tr.querySelector('[data-f="tien"]'));
    if (!ct && !tien) return;
    rows.push([tp, ct, tien, tr.querySelector('[data-f="nd"]')?.value || '']);
  });
  dlCSV(rows, 'nhap_tien_ung_' + today() + '.csv');
}
