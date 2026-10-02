// quyettoan.congtrinh.js — Tab QUYẾT TOÁN · Phân hệ 2A: Quyết Toán Công Trình (với Chủ Đầu Tư)
// Load order: sau quyettoan.core.js, trước quyettoan.thauphu.js
//
// Giao diện: pages/quyettoan.html — 2 CỘT trên Laptop/PC (≥992px), tự xếp dọc trên tablet (02/10/2026):
//   CỘT TRÁI  Block 1 #qtf-ct          : chọn công trình — LUÔN hiện
//             Block 2 #qt-blk-summary  : chi tiết CT 3 hàng — LUÔN hiện ("—" khi chưa chọn, _qtClearSummary)
//                 [HĐ gốc | Chi phí thực tế đã chi] / [Doanh thu hiện tại | Hiệu quả lãi/lỗ hiện tại]
//                 → lấy từ ctTaiChinh() (projects.ui.js) = CÙNG SỐ với modal chi tiết tab CÔNG TRÌNH
//                 [DOANH THU SAU QT | LỢI NHUẬN SAU QT] → tự nhảy số khi gõ số tiền ở form
//   CỘT PHẢI  Block 3 #qt-blk-form     : form 3 loại + dòng kết quả tức thì dưới ô số tiền (#qtf-sotien-hint)
//                     #qt-blk-empty    : thẻ hướng dẫn khi chưa chọn CT
//   DƯỚI CÙNG Block 4 #qt-blk-history  : lịch sử quyết toán của TẤT CẢ công trình (năm đang lọc),
//                                        7 dòng/trang — luôn hiện; dòng của CT đang chọn được tô sáng
//   Form chỉ hiện khi đã chọn công trình (_qtToggleBlocks).
// QUY TẮC 1-1 (02/10/2026): MỖI CÔNG TRÌNH CHỈ CÓ 01 BẢN QUYẾT TOÁN. Chọn CT đã có quyết toán →
//   form tự chuyển sang "Sửa Quyết Toán" (nạp sẵn bản hiện có); sai sót thì sửa trên bản đó,
//   KHÔNG tạo bản thứ hai (qtSave cũng tự chặn). Dữ liệu cũ lỡ có ≥ 2 bản → cảnh báo #qtf-dup.
// Dữ liệu  : ghi vào quyetToanRecords / kho 'quyettoan_v1' (khai báo ở doanhthu.core.js)
// Công thức: số tài chính lấy từ ctTaiChinh() (projects.ui.js) — THEO NĂM ĐANG LỌC, giống modal
//            chi tiết công trình; quyết toán quy đổi delta ở quyettoan.core.js. KHÔNG ghi 2 nơi.
// Năm      : tuân thủ bộ lọc năm — dropdown chỉ liệt kê CT thuộc năm đang chọn, KHÔNG tự tải mọi năm.
// Quyền    : chỉ Admin + Giám đốc được lưu / sửa / xóa (nút tab đã ẩn với Kế toán).

// ─── State ─────────────────────────────────────────────────────
let _qthPage     = 0;   // trang hiện tại của bảng lịch sử
let _qthCtFilter = '';  // projectId công trình đang chọn ở Block 1 ('' = chưa chọn)
let _qthSearch   = '';  // từ khóa tìm kiếm trong lịch sử (chữ thường)

// Chú thích từng loại hiển thị dưới nhóm nút chọn loại
const _QT_HINT = {
  tang:    'Cộng thêm vào doanh thu (VD: phát sinh hạng mục ngoài hợp đồng).',
  giam:    'Trừ bớt khỏi doanh thu (VD: cắt giảm hạng mục không thi công).',
  thaythe: 'Số nhập vào là TỔNG DOANH THU MỚI của công trình — thay cho HĐ gốc và mọi phát sinh trước ngày này.',
};
const _QT_SOTIEN_LABEL = {
  tang:    'Số tiền tăng thêm (đ) *',
  giam:    'Số tiền giảm trừ (đ) *',
  thaythe: 'Tổng giá trị mới thay thế HĐ (đ) *',
};

// ── Quyền: chỉ Admin + Giám đốc được ghi dữ liệu quyết toán ──
function _qtCanEdit() {
  return (typeof isAdmin === 'function' && isAdmin()) ||
         (typeof isGiamdoc === 'function' && isGiamdoc());
}

// ── Danh sách công trình cho dropdown (bỏ CÔNG TY + CT đã xóa) ──
// CHỈ công trình thuộc NĂM ĐANG LỌC (qtCtInYear — cùng quy tắc tab Doanh Thu).
// keepId: luôn giữ công trình đang chọn (tránh dropdown bị trắng khi đổi năm).
function _qtProjList(keepId) {
  return ((typeof getAllProjects === 'function') ? getAllProjects() : [])
    .filter(p => p && p.id !== 'COMPANY' && !p.deletedAt && (p.id === keepId || qtCtInYear(p.name)))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
}

// ── Đọc / đặt loại đang chọn ở nhóm nút radio ──
function _qtGetLoai() {
  const el = document.querySelector('input[name="qtf-loai"]:checked');
  return (el && QT_LOAI[el.value]) ? el.value : 'tang';
}
function _qtSetLoai(loai) {
  const el = document.getElementById('qtf-loai-' + loai);
  if (el) el.checked = true;
  _qtApplyLoaiText(loai);
}
// Đổi nhãn ô số tiền + dòng chú thích theo loại
function _qtApplyLoaiText(loai) {
  const lb = document.getElementById('qtf-sotien-label');
  if (lb) lb.textContent = _QT_SOTIEN_LABEL[loai];
  const hint = document.getElementById('qtf-loai-hint');
  if (hint) hint.textContent = _QT_HINT[loai];
}

// ── Ẩn/hiện theo việc đã chọn công trình chưa ──
// Khung "Chọn công trình" + "Chi tiết công trình" (cột trái) LUÔN hiện.
// Đã chọn → hiện form (cột phải); chưa chọn → hiện thẻ hướng dẫn #qt-blk-empty. Lịch sử LUÔN hiện.
function _qtToggleBlocks(show) {
  ['qt-blk-form'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? '' : 'none';
  });
  const empty = document.getElementById('qt-blk-empty');
  if (empty) empty.style.display = show ? 'none' : '';
}

// ── Chi tiết công trình về trạng thái trống ("—") khi chưa chọn công trình ──
function _qtClearSummary() {
  ['qt-sum-hd', 'qt-sum-chi', 'qt-sum-thu', 'qt-sum-hq', 'qt-sum-dtsau', 'qt-sum-lnsau'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = '—'; el.style.color = ''; }
  });
  ['qt-sum-chi-sub', 'qt-sum-thu-sub', 'qt-sum-hq-sub', 'qt-sum-dtsau-sub', 'qt-sum-lnsau-sub', 'qt-sum-note', 'qt-sum-status'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
  ['qt-sum-hq-cell', 'qt-sum-lnsau-cell'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.borderColor = '';
  });
  const nm = document.getElementById('qt-sum-name');
  if (nm) { nm.textContent = 'Chưa chọn công trình'; nm.classList.add('text-secondary'); }
}

// ── Số tài chính TRƯỚC / SAU quyết toán đang nhập (theo năm đang lọc) ──
// Dùng ctTaiChinh() của tab Công Trình; thiếu (chưa nạp) thì lùi về calcTongDoanhThu().
function _qtFin(f) {
  const opt = { qtExcludeId: f.editId || undefined, qtExtra: f.fake };
  if (typeof ctTaiChinh === 'function') {
    return { truoc: ctTaiChinh(f.proj), sau: f.soTien > 0 ? ctTaiChinh(f.proj, opt) : null };
  }
  const a = calcTongDoanhThu(f.proj);
  const b = f.soTien > 0 ? calcTongDoanhThu(f.proj, { excludeId: opt.qtExcludeId, extra: f.fake }) : null;
  const map = d => d && ({ X: d.hdGoc, Y: d.qt, tongThu: d.daThu, doanhThu: d.tongDT, conPhaiThu: d.conPhaiThu,
                           chiThucTe: 0, chiChung: 0, hieuQua: 0, laiHienTai: 0, isActive: true, soDotThu: 0, qtSum: d });
  return { truoc: map(a), sau: map(b) };
}

// ══ KHỞI TẠO TAB ═════════════════════════════════════════════════
// Gọi khi vào tab (goPage) — về trạng thái ban đầu (chưa chọn công trình).
function initQuyetToan() {
  qtPopulateSels();
  qtResetForm(false);
  if (typeof initTatToan === 'function') initTatToan();
}

// Gọi khi đổi năm / sync xong (renderActiveTab) — GIỮ NGUYÊN công trình + nội dung đang nhập.
function qtRefresh() {
  qtPopulateSels();
  qtUpdatePreview();
  qtRenderHistory(_qthPage);
  if (typeof ttRender === 'function') ttRender();
}

// ── Chuyển sub-tab: QUYẾT TOÁN CÔNG TRÌNH (2A) · TẤT TOÁN TP/NCC (2B) ──
function qtGoSub(btn, id) {
  document.querySelectorAll('#page-quyettoan .sub-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#qt-sub-nav .nav-link').forEach(b => b.classList.remove('active'));
  const page = document.getElementById(id);
  if (page) page.classList.add('active');
  if (btn) btn.classList.add('active');
  if (id === 'qt-sub-tattoan' && typeof ttRender === 'function') ttRender();
  else qtRefresh();
}

// ── Nạp dropdown: Công trình (Block 1) + Người thực hiện ──
function qtPopulateSels() {
  const ctSel = document.getElementById('qtf-ct');
  if (ctSel) {
    const cur = ctSel.value;
    ctSel.innerHTML = '<option value="">-- Chọn công trình --</option>' +
      _qtProjList(cur).map(p => `<option value="${x(p.id)}">${x(p.name)}${p.status === 'closed' ? ' (đã QT)' : ''}</option>`).join('');
    if (cur) ctSel.value = cur;
  }
  const nguoiSel = document.getElementById('qtf-nguoi');
  if (nguoiSel) {
    const cur = nguoiSel.value;
    const all = [...new Set([...(cats.nguoiTH || [])].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
    nguoiSel.innerHTML = '<option value="">-- Chọn --</option>' +
      all.map(v => `<option value="${x(v)}">${x(v)}</option>`).join('');
    if (cur) _setSelectFlexible(nguoiSel, cur);
  }
}

// ── Bản quyết toán (còn hiệu lực) của 1 công trình — QUY TẮC 1-1 ──
// preferId: ưu tiên đúng bản này (VD bấm Sửa ở bảng lịch sử khi dữ liệu cũ lỡ có nhiều bản).
// Không có preferId → lấy bản MỚI NHẤT. Trả về { rec, count } (count = số bản đang có).
function _qtRecordOfCt(pid, preferId) {
  const p = _qtResolveProj(pid);
  if (!p) return { rec: null, count: 0 };
  const list = (typeof quyetToanRecords !== 'undefined' ? quyetToanRecords : [])
    .filter(r => !r.deletedAt && _qtMatchProj(r, p))
    .sort(_qtSortAsc);
  const pref = preferId ? list.find(r => String(r.id) === String(preferId)) : null;
  return { rec: pref || list[list.length - 1] || null, count: list.length };
}

// ── Xóa trắng các ô nhập (KHÔNG đụng ô chọn công trình) → chế độ "Thêm Quyết Toán" ──
function _qtClearInputs() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('qtf-ngay', today());
  set('qtf-nguoi', '');
  set('qtf-nd', '');
  set('qtf-edit-id', '');
  const st = document.getElementById('qtf-sotien');
  if (st) { st.value = ''; st.dataset.raw = ''; }
  const chot = document.getElementById('qtf-chot');
  if (chot) chot.checked = false;
  _qtSetLoai('tang');
  const title = document.getElementById('qtf-title');
  if (title) title.textContent = 'Thêm Quyết Toán';
  const saveBtn = document.getElementById('qtf-save-btn');
  if (saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined msi-gap">save</span>Lưu Quyết Toán';
  const cancelBtn = document.getElementById('qtf-cancel-btn');
  if (cancelBtn) cancelBtn.style.display = 'none';
  const card = document.getElementById('qt-blk-form');
  if (card) card.style.outline = '';
  const dup = document.getElementById('qtf-dup');
  if (dup) dup.innerHTML = '';
}

// ── Nạp 1 bản quyết toán lên form → chế độ "Sửa Quyết Toán" ──
function _qtFillForm(r, count) {
  const set = (elId, v) => { const el = document.getElementById(elId); if (el) el.value = v; };
  set('qtf-ngay', r.ngay || today());
  set('qtf-nd', r.nd || '');
  set('qtf-edit-id', r.id);
  const nguoiSel = document.getElementById('qtf-nguoi');
  if (nguoiSel) _setSelectFlexible(nguoiSel, r.nguoi || '');
  const st = document.getElementById('qtf-sotien');
  if (st) {
    const v = qtSoTien(r);
    st.dataset.raw = String(v);
    st.value = v ? v.toLocaleString('vi-VN') : '';
  }
  _qtSetLoai(qtLoaiOf(r));
  const chot = document.getElementById('qtf-chot');
  if (chot) chot.checked = !!r.chot;

  const title = document.getElementById('qtf-title');
  if (title) title.textContent = 'Sửa Quyết Toán';
  const saveBtn = document.getElementById('qtf-save-btn');
  if (saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined msi-gap">edit</span>Cập nhật Quyết Toán';
  const cancelBtn = document.getElementById('qtf-cancel-btn');
  if (cancelBtn) cancelBtn.style.display = '';       // "Hủy thay đổi" → nạp lại bản đã lưu
  const card = document.getElementById('qt-blk-form');
  if (card) card.style.outline = '2px solid var(--bs-warning)';
  // Dữ liệu cũ lỡ có nhiều bản cho cùng 1 CT → nhắc dọn về 1 bản
  const dup = document.getElementById('qtf-dup');
  if (dup) dup.innerHTML = count > 1
    ? `<div class="alert alert-warning py-1 px-2 mb-2" style="font-size:12px">⚠ Công trình này đang có <strong>${count} bản quyết toán</strong> (dữ liệu cũ). Theo quy tắc mỗi công trình chỉ 01 bản — đang sửa bản ngày ${fmtISODate(r.ngay)}; hãy xóa các bản thừa ở bảng Lịch Sử Quyết Toán.</div>`
    : `<div class="text-secondary mb-2" style="font-size:11px">Công trình đã có quyết toán — mỗi công trình chỉ 01 bản, mọi điều chỉnh được cập nhật trên bản này.</div>`;
}

// ── Reset form ──
// keepCt = true : giữ công trình đang chọn (Hủy thay đổi / sau khi Xóa) → nạp lại bản quyết toán
//                 của CT nếu có (chế độ Sửa), không có thì về form trống (chế độ Thêm)
// keepCt = false: bỏ chọn công trình → ẩn form
function qtResetForm(keepCt) {
  if (!keepCt) { const ct = document.getElementById('qtf-ct'); if (ct) ct.value = ''; }
  qtOnCtChange();
}

// ── Đổi loại quyết toán ──
function qtOnLoaiChange() {
  const loai = _qtGetLoai();
  _qtApplyLoaiText(loai);
  // Gợi ý: "Thay thế" thường là bản chốt cuối → tự tick ô Chốt sổ (khi nhập MỚI).
  const editing = !!document.getElementById('qtf-edit-id')?.value;
  const chot = document.getElementById('qtf-chot');
  if (chot && !editing) chot.checked = (loai === 'thaythe');
  qtUpdatePreview();
}

// ── Block 1 đổi công trình → QUY TẮC 1-1: CT đã có quyết toán thì tự chuyển sang "Sửa" ──
// opts.preferId: ưu tiên nạp đúng bản này (bấm Sửa ở bảng lịch sử / từ tab Doanh Thu).
function qtOnCtChange(opts) {
  opts = opts || {};
  const pid = document.getElementById('qtf-ct')?.value || '';
  _qtToggleBlocks(!!pid);
  _qthCtFilter = pid;
  _qtClearInputs();
  if (pid) {
    const { rec, count } = _qtRecordOfCt(pid, opts.preferId);
    if (rec) _qtFillForm(rec, count);
  }
  qtUpdatePreview();
  qtRenderHistory(0);
}

// ── Gom dữ liệu form thành 1 bản ghi giả định (phục vụ preview + lưu) ──
function _qtReadForm() {
  const pid    = document.getElementById('qtf-ct')?.value || '';
  const editId = document.getElementById('qtf-edit-id')?.value || '';
  const loai   = _qtGetLoai();
  const soTien = _readMoneyInput('qtf-sotien');
  const ngay   = document.getElementById('qtf-ngay')?.value || '';
  const orig   = editId ? quyetToanRecords.find(r => r.id === editId) : null;
  return {
    pid, editId, loai, soTien, ngay, orig,
    proj: pid ? _qtResolveProj(pid) : null,
    // Bản ghi giả định — giữ createdAt gốc khi sửa để thứ tự trong ngày không đổi
    fake: {
      id: '__qt_preview__',
      ngay: ngay || today(),
      createdAt: orig ? orig.createdAt : Date.now(),
      loai,
      giaTri: qtGiaTriLuu(loai, soTien),
    },
  };
}

// ══ BLOCK 2 (chi tiết công trình) + BLOCK 3 (kết quả tức thì) ═════════
// Gọi mỗi khi đổi công trình / loại / số tiền / ngày → 2 ô "SAU QUYẾT TOÁN" nhảy số ngay.
function qtUpdatePreview() {
  const f = _qtReadForm();
  if (!f.proj) { _qtClearSummary(); return; }
  document.getElementById('qt-sum-name')?.classList.remove('text-secondary');

  const { truoc, sau } = _qtFin(f);
  const _set = (id, html, color) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = html;
    if (color !== undefined) el.style.color = color;
  };
  const _signed = v => (v < 0 ? '−' : '') + fmtM(Math.abs(v));
  const CG = 'var(--bs-success)', CR = 'var(--bs-danger)';

  // Badge trạng thái công trình
  const stEl = document.getElementById('qt-sum-status');
  if (stEl) stEl.innerHTML = f.proj.status === 'closed'
    ? '<span class="badge bg-danger-subtle text-danger-emphasis"><span class="material-symbols-outlined msi-gap">lock</span>Đã quyết toán</span>' : '';
  _set('qt-sum-name', x(f.proj.name));

  // ── Hàng 1: HĐ gốc | Chi phí thực tế đã chi (= modal Công Trình) ──
  _set('qt-sum-hd', fmtM(truoc.X));
  _set('qt-sum-chi', fmtM(truoc.chiThucTe));
  _set('qt-sum-chi-sub', truoc.chiChung > 0 ? `gồm ${fmtS(truoc.chiChung)} chi phí chia tỉ trọng` : '');

  // ── Hàng 2: Doanh thu hiện tại (tiền đã thu) | Lợi nhuận hiện tại (= "Hiệu quả" ở modal Công Trình) ──
  _set('qt-sum-thu', fmtM(truoc.tongThu));
  _set('qt-sum-thu-sub', `Đã thu${truoc.soDotThu ? ' · ' + truoc.soDotThu + ' đợt' : ''}`);
  _set('qt-sum-hq', _signed(truoc.hieuQua), truoc.hieuQua >= 0 ? CG : CR);
  _set('qt-sum-hq-sub', truoc.isActive
    ? 'Đang thi công — tính tới hiện tại (đã thu − chi thực tế)'
    : (f.proj.status === 'closed' ? 'Đã quyết toán — lãi/lỗ cuối' : 'Đã hoàn thành — lãi/lỗ cuối'));
  const hqCell = document.getElementById('qt-sum-hq-cell');
  if (hqCell) hqCell.style.borderColor = truoc.hieuQua >= 0 ? 'var(--bs-success-border-subtle)' : 'var(--bs-danger-border-subtle)';

  // ── Hàng 3 (REAL-TIME): DOANH THU SAU QT | LỢI NHUẬN SAU QT = DT sau QT − Chi phí thực tế đã chi ──
  const dtSau = sau ? sau.doanhThu : truoc.doanhThu;
  const lnSau = dtSau - truoc.chiThucTe;
  const chenh = dtSau - truoc.doanhThu;
  _set('qt-sum-dtsau', fmtM(dtSau));
  _set('qt-sum-dtsau-sub', sau
    ? `<span style="color:${chenh < 0 ? CR : CG};font-weight:600">${chenh ? (chenh > 0 ? '▲ +' : '▼ −') + fmtS(Math.abs(chenh)) : 'không đổi'}</span> so với DT hiện hành ${fmtS(truoc.doanhThu)}`
    : 'Chưa nhập số tiền — đang bằng doanh thu HĐ + QT hiện hành');
  _set('qt-sum-lnsau', _signed(lnSau), lnSau >= 0 ? CG : CR);
  _set('qt-sum-lnsau-sub', 'DT sau QT − Chi phí thực tế đã chi');
  const lnCell = document.getElementById('qt-sum-lnsau-cell');
  if (lnCell) lnCell.style.borderColor = lnSau >= 0 ? 'var(--bs-success-border-subtle)' : 'var(--bs-danger-border-subtle)';

  // Ghi chú quy tắc max(HĐ, Đã thu)
  _set('qt-sum-note', (!truoc.qtSum.coThayThe && truoc.tongThu > truoc.X && truoc.X > 0)
    ? 'Đã thu lớn hơn HĐ gốc → doanh thu đang lấy theo số đã thu (quy tắc cũ, áp dụng khi chưa có quyết toán thay thế).' : '');

  // ── Block 3: dòng kết quả tức thì ngay dưới ô số tiền ──
  const hint  = document.getElementById('qtf-sotien-hint');
  const warnB = document.getElementById('qtf-warns');
  if (!hint) return;
  if (!sau) {
    hint.className = 'mt-1 text-secondary';
    hint.style.fontSize = '12px';
    hint.textContent = 'Gõ số tiền để xem doanh thu mới ngay tại đây.';
    if (warnB) warnB.innerHTML = '';
    return;
  }
  hint.className = 'mt-1 fw-semibold ' + (chenh < 0 ? 'text-danger' : 'text-success');
  hint.style.fontSize = '12.5px';
  hint.innerHTML = `💡 Doanh thu mới sẽ cập nhật thành: <span class="font-monospace">${fmtM(sau.doanhThu)}</span>` +
    ` <span style="font-weight:400">(${chenh ? (chenh > 0 ? '▲ +' : '▼ −') + fmtM(Math.abs(chenh)) : 'không đổi'}` +
    ` · còn phải thu ${sau.conPhaiThu >= 0 ? fmtM(sau.conPhaiThu) : '−' + fmtM(-sau.conPhaiThu)})</span>`;

  // ── Cảnh báo chống sai sót ──
  const warns = [];
  if (sau.doanhThu < 0) {
    warns.push(['danger', 'Doanh thu sau quyết toán bị ÂM — kiểm tra lại số tiền giảm trừ.']);
  } else if (sau.conPhaiThu < 0) {
    warns.push(['warning', `Đã thu VƯỢT doanh thu sau quyết toán ${fmtM(-sau.conPhaiThu)} — công ty đang thu dư, có thể phải hoàn trả Chủ Đầu Tư.`]);
  }
  if (f.loai === 'thaythe' && f.ngay) {
    const others = (typeof quyetToanRecords !== 'undefined' ? quyetToanRecords : [])
      .filter(r => !r.deletedAt && r.id !== f.editId && _qtMatchProj(r, f.proj) && (r.ngay || '') > f.ngay);
    const tt = others.filter(r => qtLoaiOf(r) === 'thaythe');
    if (tt.length) warns.push(['warning', `Đã có bản THAY THẾ ngày ${fmtISODate(tt[tt.length - 1].ngay)} mới hơn → bản mới hơn sẽ quyết định doanh thu, bản này không còn tác dụng.`]);
    else if (others.length) warns.push(['info', `Có ${others.length} phát sinh tăng/giảm sau ngày này — vẫn được cộng/trừ tiếp sau giá trị thay thế.`]);
  }
  if (f.ngay && typeof _dtInYear === 'function' && !_dtInYear(f.ngay)) {
    warns.push(['info', 'Ngày quyết toán nằm ngoài năm đang lọc — số "sau quyết toán" ở trên chưa tính bản này (sẽ tính khi xem năm đó).']);
  }
  if (warnB) warnB.innerHTML = warns.map(([t, m]) =>
    `<div class="alert alert-${t} py-1 px-2 mt-2 mb-0" style="font-size:12px">${t === 'info' ? 'ℹ' : '⚠'} ${m}</div>`).join('');
}

// ══ LƯU / SỬA / XÓA ══════════════════════════════════════════════
function qtSave() {
  if (!_qtCanEdit()) { toast('Chỉ Quản trị viên hoặc Giám đốc được lưu quyết toán', 'error'); return; }
  const f = _qtReadForm();
  if (!f.proj)    { toast('Vui lòng chọn Công Trình!', 'error'); return; }
  // QUY TẮC 1-1: CT đã có quyết toán mà form đang ở chế độ Thêm → chuyển thành CẬP NHẬT bản hiện có
  if (!f.editId) {
    const { rec } = _qtRecordOfCt(f.proj.id);
    if (rec) {
      f.editId = rec.id; f.orig = rec; f.fake.createdAt = rec.createdAt;
      toast('Công trình đã có quyết toán — sẽ cập nhật trên bản hiện có (mỗi công trình chỉ 01 bản)', 'info');
    }
  }
  if (!f.ngay)    { toast('Vui lòng chọn Ngày thực hiện!', 'error'); return; }
  if (!(f.soTien > 0)) { toast('Vui lòng nhập Số tiền lớn hơn 0!', 'error'); return; }
  const nd = (document.getElementById('qtf-nd')?.value || '').trim();
  if (!nd) { toast('Vui lòng nhập Nội dung / lý do quyết toán!', 'error'); return; }
  const nguoi = (document.getElementById('qtf-nguoi')?.value || '').trim();
  const chot  = !!document.getElementById('qtf-chot')?.checked;

  // Kiểm tra kết quả trước khi ghi (cùng công thức với preview)
  const { sau } = _qtFin(f);
  if (sau.doanhThu < 0) { toast('Doanh thu sau quyết toán bị âm — kiểm tra lại số tiền!', 'error'); return; }
  if (sau.conPhaiThu < 0 &&
      !confirm(`Đã thu vượt doanh thu sau quyết toán ${fmtM(-sau.conPhaiThu)}.\nVẫn lưu quyết toán này?`)) return;
  if (chot && f.proj.status !== 'closed' &&
      !confirm(`Đánh dấu quyết toán cuối cùng → chuyển "${f.proj.name}" sang trạng thái "Đã quyết toán"?`)) return;

  const fields = {
    ngay: f.ngay,
    congtrinh: f.proj.name,
    projectId: f.proj.id,
    loai: f.loai,
    giaTri: qtGiaTriLuu(f.loai, f.soTien),  // giảm lưu số âm (tương thích dữ liệu cũ)
    nd, nguoi, chot,
  };

  if (f.editId && f.orig) {
    const idx = quyetToanRecords.findIndex(r => r.id === f.editId);
    if (idx >= 0) quyetToanRecords[idx] = mkUpdate(quyetToanRecords[idx], fields);
    toast('✅ Đã cập nhật quyết toán', 'success');
  } else {
    quyetToanRecords.unshift(mkRecord(fields));
    toast('✅ Đã lưu quyết toán: ' + f.proj.name, 'success');
  }
  save('quyettoan_v1', quyetToanRecords);

  // Quyết toán cuối cùng → đóng công trình (trạng thái "Đã quyết toán" + ngày quyết toán)
  if (chot && typeof updateProject === 'function') {
    updateProject(f.proj.id, { status: 'closed', closedDate: f.ngay });
    if (typeof renderProjectsPage === 'function') renderProjectsPage();
  }

  qtPopulateSels();          // cập nhật nhãn "(đã QT)" nếu vừa đóng CT
  // Lưu / Cập nhật xong → LÀM SẠCH toàn bộ form, ô công trình về "-- Chọn công trình --"
  // (tránh người dùng thao tác nhầm tiếp vào công trình cũ). Bảng lịch sử vẫn thấy bản vừa lưu.
  qtResetForm(false);
  _qtRefreshOtherTabs();
}

// ── Sửa: chọn công trình của bản ghi → qtOnCtChange tự nạp bản đó (chế độ Sửa) ──
function qtEdit(id) {
  const r = quyetToanRecords.find(r => String(r.id) === String(id));
  if (!r) return;
  qtPopulateSels();
  const p = _qtResolveProj(r.projectId) || _qtResolveProj(r.congtrinh);
  const ctSel = document.getElementById('qtf-ct');
  if (ctSel && p) {
    // CT ngoài năm đang lọc → thêm tạm vào dropdown để vẫn chọn được
    if (![...ctSel.options].some(o => o.value === p.id)) {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = p.name;
      ctSel.appendChild(o);
    }
    ctSel.value = p.id;
  }
  qtOnCtChange({ preferId: r.id });
  document.getElementById('qt-blk-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Sửa từ tab KHÁC (Doanh Thu...) → chuyển sang tab Quyết Toán rồi nạp form ──
function qtOpenEdit(id) {
  if (typeof goPage === 'function') goPage(null, 'quyettoan');
  // Đảm bảo đang ở sub-tab QUYẾT TOÁN CÔNG TRÌNH (có thể lần trước đang ở Tất Toán)
  qtGoSub(document.getElementById('qt-sub-congtrinh-btn'), 'qt-sub-congtrinh');
  qtEdit(id);
}

// ── Xóa mềm (vào thùng rác theo cơ chế deletedAt như các bản ghi khác) ──
function qtDelete(id) {
  if (!_qtCanEdit()) { toast('Chỉ Quản trị viên hoặc Giám đốc được xóa quyết toán', 'error'); return; }
  const idx = quyetToanRecords.findIndex(r => String(r.id) === String(id));
  if (idx < 0) return;
  const r = quyetToanRecords[idx];
  let msg = `Xóa quyết toán "${QT_LOAI[qtLoaiOf(r)].label}" ${qtSoTienTxt(r)} của ${_resolveCtName(r) || r.congtrinh || ''}?`;
  if (r.chot) msg += '\n\nLưu ý: công trình vẫn giữ trạng thái "Đã quyết toán". Muốn mở lại hãy sửa ở tab Công Trình.';
  if (!confirm(msg)) return;

  const now = Date.now();
  quyetToanRecords[idx] = {
    ...r, deletedAt: now, updatedAt: now,
    deviceId: (typeof DEVICE_ID !== 'undefined') ? DEVICE_ID : '',
    deletedBy: getCurrentUser()?.username || 'Không rõ',
  };
  save('quyettoan_v1', quyetToanRecords);

  // Đang sửa đúng bản vừa xóa → nạp lại theo quy tắc 1-1 (hết bản → về chế độ Thêm)
  if (document.getElementById('qtf-edit-id')?.value === String(id)) qtResetForm(true);
  else { qtUpdatePreview(); qtRenderHistory(_qthPage); }
  _qtRefreshOtherTabs();
  toast('Đã xóa quyết toán', 'success');
}

// ── Vẽ lại các bảng ở tab khác đang dùng số quyết toán (an toàn nếu tab chưa mở) ──
function _qtRefreshOtherTabs() {
  if (typeof renderKhaiBaoTable === 'function') renderKhaiBaoTable(0);
  if (typeof _dtRenderDashboardMini === 'function') _dtRenderDashboardMini();
  if (typeof renderLoiNhuan === 'function') renderLoiNhuan();
}

// ══ BLOCK 4: LỊCH SỬ QUYẾT TOÁN — TẤT CẢ CÔNG TRÌNH (năm đang lọc), 7 dòng/trang ══
// Mới nhất lên đầu. Cột "Ảnh hưởng DT" / "DT sau QT" tính theo dòng thời gian của từng CT.
// Dòng của công trình đang chọn được tô sáng; dòng đang sửa có viền trái màu vàng.
function qtSetHistorySearch(val) {
  _qthSearch = (val || '').trim().toLowerCase();
  qtRenderHistory(0);
}

function qtRenderHistory(page) {
  page = page || 0;
  _qthPage = page;
  const tbody  = document.getElementById('qth-tbody');
  const badge  = document.getElementById('qth-count-badge');
  const pgWrap = document.getElementById('qth-pagination');
  if (!tbody) return;

  // Delta + doanh thu cộng dồn theo từng công trình (tính 1 lần / CT)
  const cache = new Map();
  const calcFor = (r) => {
    const p = _qtResolveProj(r.projectId) || _qtResolveProj(r.congtrinh);
    if (!p) return null;
    if (!cache.has(p.id)) {
      const { recs, deltas } = qtTinhDelta(p);
      let run = qtHdGocCuaCT(p);
      const runDT = new Map();
      recs.forEach(x2 => { run += deltas.get(x2.id) || 0; runDT.set(x2.id, run); });
      cache.set(p.id, { p, deltas, runDT });
    }
    return cache.get(p.id);
  };

  let list = (typeof quyetToanRecords !== 'undefined' ? quyetToanRecords : [])
    .filter(r => !r.deletedAt && _dtInYear(r.ngay));
  if (_qthSearch) {
    const q = _qthSearch;
    list = list.filter(r =>
      (_resolveCtName(r) || r.congtrinh || '').toLowerCase().includes(q) ||
      (r.nd || '').toLowerCase().includes(q) ||
      (r.nguoi || '').toLowerCase().includes(q));
  }
  list.sort((a, b) => _qtSortAsc(b, a));   // mới nhất lên đầu

  if (badge) badge.textContent = list.length ? `(${list.length} bản)` : '';
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-secondary py-4">Chưa có quyết toán nào${_qthSearch ? ' khớp tìm kiếm' : ''}</td></tr>`;
    if (pgWrap) pgWrap.innerHTML = '';
    return;
  }

  // Giới hạn 7 dòng/trang (DT_PG) — dữ liệu cũ hơn sang trang sau
  const total = list.length;
  if (page * DT_PG >= total) { page = Math.max(0, Math.ceil(total / DT_PG) - 1); _qthPage = page; }
  const slice = list.slice(page * DT_PG, (page + 1) * DT_PG);
  const canEdit = _qtCanEdit();
  const editingId = document.getElementById('qtf-edit-id')?.value || '';

  tbody.innerHTML = slice.map(r => {
    const c = calcFor(r);
    const d = c ? (c.deltas.get(r.id) || 0) : 0;
    const dCls = d < 0 ? 'text-danger' : (d > 0 ? 'text-success' : 'text-secondary');
    const isSel  = c && _qthCtFilter && c.p.id === _qthCtFilter;
    const isEdit = editingId && String(r.id) === String(editingId);
    const rowSty = (isSel ? 'background:var(--bs-warning-bg-subtle);' : '') +
                   (isEdit ? 'box-shadow:inset 3px 0 0 var(--bs-warning);' : '');
    return `<tr style="${rowSty}">
      <td class="text-secondary" style="white-space:nowrap;font-size:12px">${fmtISODate(r.ngay)}</td>
      <td style="font-weight:600;white-space:nowrap;max-width:240px;overflow:hidden;text-overflow:ellipsis" title="${x(_resolveCtName(r) || r.congtrinh || '')}">${x(_resolveCtName(r) || r.congtrinh || '—')}</td>
      <td style="white-space:nowrap">${qtLoaiBadge(r)}</td>
      <td class="text-end font-monospace fw-semibold ${qtSoTienCls(r)}" style="white-space:nowrap">${qtSoTienTxt(r, fmtS)}</td>
      <td class="text-end font-monospace ${dCls}" style="white-space:nowrap">${d ? (d > 0 ? '+' : '-') + fmtS(Math.abs(d)) : '0'}</td>
      <td class="text-end font-monospace fw-bold" style="white-space:nowrap">${c ? fmtS(c.runDT.get(r.id) || 0) : '—'}</td>
      <td class="text-body-secondary" style="font-size:12px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(r.nd || '')}">${x(r.nd || '—')}</td>
      <td class="text-secondary" style="white-space:nowrap">${x(r.nguoi || '—')}</td>
      <td class="action-col">
        ${canEdit ? `<div class="d-flex gap-1 justify-content-center">
          <button class="btn btn-outline-primary btn-sm" title="Sửa" onclick="qtEdit('${r.id}')"><i class="bi bi-pencil-fill"></i></button>
          <button class="btn btn-outline-danger btn-sm" title="Xóa" onclick="qtDelete('${r.id}')"><i class="bi bi-trash-fill"></i></button>
        </div>` : ''}
      </td>
    </tr>`;
  }).join('');
  if (pgWrap) pgWrap.innerHTML = _dtPaginationHtml(total, page, 'qtRenderHistory');
}

// Cấp ra global (gọi từ onclick trong HTML + main.js)
window.initQuyetToan = initQuyetToan;
window.qtRefresh     = qtRefresh;
window.qtGoSub       = qtGoSub;
window.qtOpenEdit    = qtOpenEdit;
window.qtDelete      = qtDelete;
