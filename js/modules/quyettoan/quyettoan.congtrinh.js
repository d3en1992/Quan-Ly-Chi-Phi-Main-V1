// quyettoan.congtrinh.js — Tab QUYẾT TOÁN · Phân hệ 2A: Quyết Toán Công Trình (với Chủ Đầu Tư)
// Load order: sau quyettoan.core.js, trước quyettoan.thauphu.js
//
// Giao diện: pages/quyettoan.html — 2 CỘT trên Laptop/PC (≥1200px), tự xếp dọc trên tablet (02/10/2026):
//   CỘT TRÁI  Block 1 #qtf-ct          : chọn công trình — LUÔN hiện
//             Block 2 #qt-blk-summary  : chi tiết CT lưới 2x2 [HĐ gốc | QT đã có] / [Đã thu | DOANH THU HIỆN TẠI]
//                                        — LUÔN hiện ("—" khi chưa chọn, _qtClearSummary)
//   CỘT PHẢI  Block 3 #qt-blk-form     : form 3 loại + dòng kết quả tức thì dưới ô số tiền (#qtf-sotien-hint)
//                     #qt-blk-empty    : thẻ hướng dẫn khi chưa chọn CT
//   DƯỚI CÙNG Block 4 #qt-blk-history  : lịch sử quyết toán CỦA RIÊNG công trình đang chọn (trải rộng 2 cột)
//   Form + lịch sử chỉ hiện khi đã chọn công trình (_qtToggleBlocks).
// Dữ liệu  : ghi vào quyetToanRecords / kho 'quyettoan_v1' (khai báo ở doanhthu.core.js)
// Công thức: MỌI con số doanh thu đều lấy từ calcTongDoanhThu() (quyettoan.core.js)
//            → tab Doanh Thu / Lợi Nhuận / chi tiết Công Trình tự nhảy số, KHÔNG ghi 2 nơi.
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
// KHÔNG lọc theo năm: quyết toán là việc của TOÀN vòng đời công trình.
function _qtProjList() {
  return ((typeof getAllProjects === 'function') ? getAllProjects() : [])
    .filter(p => p && p.id !== 'COMPANY' && !p.deletedAt)
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
// Đã chọn → hiện form (cột phải) + lịch sử; chưa chọn → hiện thẻ hướng dẫn #qt-blk-empty.
function _qtToggleBlocks(show) {
  ['qt-blk-form', 'qt-blk-history'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? '' : 'none';
  });
  const empty = document.getElementById('qt-blk-empty');
  if (empty) empty.style.display = show ? 'none' : '';
}

// ── Chi tiết công trình về trạng thái trống ("—") khi chưa chọn công trình ──
function _qtClearSummary() {
  ['qt-sum-hd', 'qt-sum-qt', 'qt-sum-thu', 'qt-sum-dt'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  });
  const qtEl = document.getElementById('qt-sum-qt');
  if (qtEl) qtEl.className = 'qt-sum-val';
  ['qt-sum-con', 'qt-sum-note', 'qt-sum-status'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
  const nm = document.getElementById('qt-sum-name');
  if (nm) { nm.textContent = 'Chưa chọn công trình'; nm.classList.add('text-secondary'); }
  const load = document.getElementById('qt-sum-loading');
  if (load) load.style.display = 'none';
}

// ══ KHỞI TẠO TAB ═════════════════════════════════════════════════
// Gọi khi vào tab (goPage) — về trạng thái ban đầu (chưa chọn công trình).
function initQuyetToan() {
  qtPopulateSels();
  qtResetForm(false);
  if (typeof initTatToan === 'function') initTatToan();
  // Tải bù mọi năm còn thiếu (số liệu quyết toán/tất toán tính toàn vòng đời) → vẽ lại
  qtEnsureAllYears(() => qtRefresh());
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
      _qtProjList().map(p => `<option value="${x(p.id)}">${x(p.name)}${p.status === 'closed' ? ' (đã QT)' : ''}</option>`).join('');
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

// ── Reset form ──
// keepCt = true : giữ công trình đang chọn (sau khi Lưu / Hủy sửa) → chỉ xóa các ô nhập
// keepCt = false: về trạng thái ban đầu, bỏ chọn công trình → ẩn form + lịch sử
function qtResetForm(keepCt) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('qtf-ngay', today());
  set('qtf-nguoi', '');
  set('qtf-nd', '');
  set('qtf-edit-id', '');
  if (!keepCt) set('qtf-ct', '');
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

// ── Block 1 đổi công trình → hiện/ẩn form + lịch sử, vẽ chi tiết, preview, lịch sử ──
function qtOnCtChange() {
  const pid = document.getElementById('qtf-ct')?.value || '';
  _qtToggleBlocks(!!pid);
  _qthCtFilter = pid;
  _qthSearch = '';
  const s = document.getElementById('qth-search');
  if (s) s.value = '';
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

// ══ BLOCK 2 (tóm tắt) + BLOCK 3 (kết quả tức thì) ═══════════════════
function qtUpdatePreview() {
  const f = _qtReadForm();
  if (!f.proj) { _qtClearSummary(); return; }
  document.getElementById('qt-sum-name')?.classList.remove('text-secondary');

  // Trạng thái hiện tại (toàn vòng đời)
  const truoc = calcTongDoanhThu(f.proj, { allYears: true });

  // ── Block 2 (lưới 2x2): [HĐ gốc | QT đã có] / [Đã thu | DOANH THU HIỆN TẠI] ──
  const setTxt = (id, t, cls) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = t;
    if (cls !== undefined) el.className = cls;
  };
  setTxt('qt-sum-name', f.proj.name);
  const stEl = document.getElementById('qt-sum-status');
  if (stEl) stEl.innerHTML = f.proj.status === 'closed'
    ? '<span class="badge bg-danger-subtle text-danger-emphasis"><span class="material-symbols-outlined msi-gap">lock</span>Đã quyết toán</span>' : '';
  setTxt('qt-sum-hd', fmtM(truoc.hdGoc));
  setTxt('qt-sum-qt', truoc.qt ? (truoc.qt > 0 ? '+' : '-') + fmtM(Math.abs(truoc.qt)) : '0 đ',
    'qt-sum-val ' + (truoc.qt < 0 ? 'text-danger' : truoc.qt > 0 ? 'text-success' : ''));
  setTxt('qt-sum-thu', fmtM(truoc.daThu));
  setTxt('qt-sum-dt', fmtM(truoc.tongDT));
  setTxt('qt-sum-con', truoc.conPhaiThu >= 0
    ? 'Còn phải thu ' + fmtM(truoc.conPhaiThu)
    : 'Đã thu vượt ' + fmtM(-truoc.conPhaiThu),
    truoc.conPhaiThu < 0 ? 'text-danger' : 'text-secondary');
  const load = document.getElementById('qt-sum-loading');
  if (load) load.style.display = _qtAllYearsReady ? 'none' : '';
  // Doanh thu ≠ HĐ gốc + QT → đang áp quy tắc max(HĐ, Đã thu) — giải thích cho người xem
  setTxt('qt-sum-note', (truoc.tongDT !== truoc.hdGoc + truoc.qt)
    ? 'Đã thu lớn hơn HĐ gốc → doanh thu hiện tại lấy theo số đã thu (quy tắc cũ, áp dụng khi chưa có quyết toán thay thế).' : '');

  // ── Block 3: dòng kết quả tức thì ngay dưới ô số tiền ──
  const hint  = document.getElementById('qtf-sotien-hint');
  const warnB = document.getElementById('qtf-warns');
  if (!hint) return;
  if (!(f.soTien > 0)) {
    hint.className = 'mt-1 text-secondary';
    hint.style.fontSize = '12px';
    hint.textContent = 'Gõ số tiền để xem doanh thu mới ngay tại đây.';
    if (warnB) warnB.innerHTML = '';
    return;
  }
  // Bỏ bản đang sửa (nếu có) + thêm bản giả định với giá trị MỚI
  const sau = calcTongDoanhThu(f.proj, { allYears: true, excludeId: f.editId || undefined, extra: f.fake });
  const chenh = sau.tongDT - truoc.tongDT;
  hint.className = 'mt-1 fw-semibold ' + (chenh < 0 ? 'text-danger' : 'text-success');
  hint.style.fontSize = '12.5px';
  hint.innerHTML = `💡 Doanh thu mới sẽ cập nhật thành: <span class="font-monospace">${fmtM(sau.tongDT)}</span>` +
    ` <span style="font-weight:400">(${chenh ? (chenh > 0 ? '▲ +' : '▼ -') + fmtM(Math.abs(chenh)) : 'không đổi'}` +
    ` · còn phải thu ${sau.conPhaiThu >= 0 ? fmtM(sau.conPhaiThu) : '−' + fmtM(-sau.conPhaiThu)})</span>`;

  // ── Cảnh báo chống sai sót ──
  const warns = [];
  if (sau.tongDT < 0) {
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
  if (warnB) warnB.innerHTML = warns.map(([t, m]) =>
    `<div class="alert alert-${t} py-1 px-2 mt-2 mb-0" style="font-size:12px">${t === 'info' ? 'ℹ' : '⚠'} ${m}</div>`).join('');
}

// ══ LƯU / SỬA / XÓA ══════════════════════════════════════════════
function qtSave() {
  if (!_qtCanEdit()) { toast('Chỉ Quản trị viên hoặc Giám đốc được lưu quyết toán', 'error'); return; }
  // Chưa tải đủ dữ liệu các năm → số "Đã thu" có thể thiếu → chưa cho lưu
  if (!_qtAllYearsReady) {
    toast('Đang tải dữ liệu các năm để tính chính xác — vui lòng đợi vài giây rồi bấm lại', 'info');
    qtEnsureAllYears(() => qtRefresh());
    return;
  }
  const f = _qtReadForm();
  if (!f.proj)    { toast('Vui lòng chọn Công Trình!', 'error'); return; }
  if (!f.ngay)    { toast('Vui lòng chọn Ngày thực hiện!', 'error'); return; }
  if (!(f.soTien > 0)) { toast('Vui lòng nhập Số tiền lớn hơn 0!', 'error'); return; }
  const nd = (document.getElementById('qtf-nd')?.value || '').trim();
  if (!nd) { toast('Vui lòng nhập Nội dung / lý do quyết toán!', 'error'); return; }
  const nguoi = (document.getElementById('qtf-nguoi')?.value || '').trim();
  const chot  = !!document.getElementById('qtf-chot')?.checked;

  // Kiểm tra kết quả trước khi ghi (cùng công thức với preview)
  const sau = calcTongDoanhThu(f.proj, { allYears: true, excludeId: f.editId || undefined, extra: f.fake });
  if (sau.tongDT < 0) { toast('Doanh thu sau quyết toán bị âm — kiểm tra lại số tiền!', 'error'); return; }
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

  qtPopulateSels();          // cập nhật nhãn "(đã QT)" nếu vừa đóng CT (giữ CT đang chọn)
  qtResetForm(true);         // xóa các ô nhập, GIỮ công trình → Block 2 + 4 cập nhật số mới
  _qtRefreshOtherTabs();
}

// ── Sửa: nạp bản ghi lên form (gọi khi ĐANG ở tab Quyết Toán) ──
function qtEdit(id) {
  const r = quyetToanRecords.find(r => String(r.id) === String(id));
  if (!r) return;
  qtPopulateSels();

  // Công trình: ưu tiên projectId, bản ghi cũ thì tìm theo tên → chọn ở Block 1
  const p = _qtResolveProj(r.projectId) || _qtResolveProj(r.congtrinh);
  const ctSel = document.getElementById('qtf-ct');
  if (ctSel) ctSel.value = p ? p.id : '';
  qtOnCtChange();

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
  if (saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined msi-gap">edit</span>Cập nhật';
  const cancelBtn = document.getElementById('qtf-cancel-btn');
  if (cancelBtn) cancelBtn.style.display = '';
  const card = document.getElementById('qt-blk-form');
  if (card) {
    card.style.outline = '2px solid var(--bs-warning)';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  qtUpdatePreview();
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

  // Đang sửa đúng bản vừa xóa → reset form (giữ công trình)
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

// ══ BLOCK 4: LỊCH SỬ QUYẾT TOÁN CỦA CÔNG TRÌNH ĐANG CHỌN ══════════
// Dòng thời gian TOÀN VÒNG ĐỜI: mới nhất ở trên, dòng cuối là HĐ gốc;
// mỗi dòng có "Ảnh hưởng DT" và "DT sau QT" cộng dồn.
function qtSetHistoryCt(pid) {
  _qthCtFilter = pid || '';
  qtRenderHistory(0);
}
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
  const hint   = document.getElementById('qth-hint');
  if (!tbody) return;

  const proj = _qthCtFilter ? _qtResolveProj(_qthCtFilter) : null;
  if (!proj) {               // chưa chọn công trình → Block 4 đang ẩn, dọn sạch
    tbody.innerHTML = '';
    if (badge) badge.textContent = '';
    if (pgWrap) pgWrap.innerHTML = '';
    return;
  }

  // Delta + doanh thu cộng dồn của công trình
  const { recs, deltas } = qtTinhDelta(proj);
  const hdGoc = qtHdGocCuaCT(proj);
  let run = hdGoc;
  const runDT = new Map();
  recs.forEach(r => { run += deltas.get(r.id) || 0; runDT.set(r.id, run); });

  let list = recs.slice();
  if (_qthSearch) {
    const q = _qthSearch;
    list = list.filter(r => (r.nd || '').toLowerCase().includes(q) || (r.nguoi || '').toLowerCase().includes(q));
  }
  list.sort((a, b) => _qtSortAsc(b, a));   // mới nhất lên đầu

  if (badge) badge.textContent = `(${list.length} mục)`;
  if (hint) hint.textContent = `Toàn bộ quyết toán của "${proj.name}" (mọi năm). Dòng cuối bảng là HĐ gốc.`;

  const total = list.length;
  const slice = list.slice(page * DT_PG, (page + 1) * DT_PG);
  const canEdit = _qtCanEdit();

  let html = slice.map(r => {
    const d = deltas.get(r.id) || 0;
    const dCls = d < 0 ? 'text-danger' : (d > 0 ? 'text-success' : 'text-secondary');
    return `<tr>
      <td class="text-secondary" style="white-space:nowrap;font-size:12px">${fmtISODate(r.ngay)}</td>
      <td style="white-space:nowrap">${qtLoaiBadge(r)}</td>
      <td class="text-end font-monospace fw-semibold ${qtSoTienCls(r)}" style="white-space:nowrap">${qtSoTienTxt(r, fmtS)}</td>
      <td class="text-end font-monospace ${dCls}" style="white-space:nowrap">${d ? (d > 0 ? '+' : '-') + fmtS(Math.abs(d)) : '0'}</td>
      <td class="text-end font-monospace fw-bold" style="white-space:nowrap">${fmtS(runDT.get(r.id) || 0)}</td>
      <td class="text-body-secondary" style="font-size:12px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(r.nd || '')}">${x(r.nd || '—')}</td>
      <td class="text-secondary" style="white-space:nowrap">${x(r.nguoi || '—')}</td>
      <td class="action-col">
        ${canEdit ? `<div class="d-flex gap-1 justify-content-center">
          <button class="btn btn-outline-primary btn-sm" title="Sửa" onclick="qtEdit('${r.id}')"><i class="bi bi-pencil-fill"></i></button>
          <button class="btn btn-outline-danger btn-sm" title="Xóa" onclick="qtDelete('${r.id}')"><i class="bi bi-trash-fill"></i></button>
        </div>` : ''}
      </td>
    </tr>`;
  }).join('');

  // Trang cuối → thêm dòng "HĐ gốc" làm điểm xuất phát của dòng thời gian
  if ((page + 1) * DT_PG >= total) {
    html += `<tr style="background:var(--bs-tertiary-bg)">
      <td class="text-secondary" style="font-size:12px">—</td>
      <td><span class="badge bg-secondary" style="font-size:10px"><span class="material-symbols-outlined msi-gap">list_alt</span>HĐ gốc</span></td>
      <td class="text-end font-monospace" style="white-space:nowrap">${fmtS(hdGoc)}</td>
      <td class="text-end text-secondary">—</td>
      <td class="text-end font-monospace fw-bold" style="white-space:nowrap">${fmtS(hdGoc)}</td>
      <td class="text-body-secondary" style="font-size:12px">${hdGoc ? 'Giá trị hợp đồng chính ban đầu' : 'Chưa khai báo HĐ chính'}</td>
      <td></td><td class="action-col"></td>
    </tr>`;
  }

  tbody.innerHTML = html;
  if (pgWrap) pgWrap.innerHTML = _dtPaginationHtml(total, page, 'qtRenderHistory');
}

// Cấp ra global (gọi từ onclick trong HTML + main.js)
window.initQuyetToan = initQuyetToan;
window.qtRefresh     = qtRefresh;
window.qtGoSub       = qtGoSub;
window.qtOpenEdit    = qtOpenEdit;
window.qtDelete      = qtDelete;
