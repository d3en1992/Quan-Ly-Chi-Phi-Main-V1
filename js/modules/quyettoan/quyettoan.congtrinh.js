// quyettoan.congtrinh.js — Tab QUYẾT TOÁN · Phân hệ 2A: Quyết Toán Công Trình (với Chủ Đầu Tư)
// Load order: sau quyettoan.core.js, trước sync.js
//
// Giao diện: pages/quyettoan.html (ID tiền tố qtf- = form, qth- = bảng lịch sử)
// Dữ liệu  : ghi vào quyetToanRecords / kho 'quyettoan_v1' (khai báo ở doanhthu.core.js)
// Công thức: MỌI con số doanh thu đều lấy từ calcTongDoanhThu() (quyettoan.core.js)
//            → tab Doanh Thu / Lợi Nhuận / chi tiết Công Trình tự nhảy số, KHÔNG ghi 2 nơi.
// Quyền    : chỉ Admin + Giám đốc được lưu / sửa / xóa (nút tab đã ẩn với Kế toán).

// ─── State ─────────────────────────────────────────────────────
let _qthPage     = 0;   // trang hiện tại của bảng lịch sử
let _qthCtFilter = '';  // projectId đang lọc ở bảng lịch sử ('' = tất cả)
let _qthSearch   = '';  // từ khóa tìm kiếm (chữ thường)

// Chú thích từng loại hiển thị dưới 3 nút chọn loại
const _QT_HINT = {
  tang:    'Cộng thêm vào doanh thu (VD: phát sinh hạng mục ngoài hợp đồng).',
  giam:    'Trừ bớt khỏi doanh thu (VD: cắt giảm hạng mục không thi công).',
  thaythe: 'Số nhập vào là TỔNG DOANH THU MỚI của công trình — thay cho HĐ gốc và mọi phát sinh trước ngày này.',
};
const _QT_SOTIEN_LABEL = {
  tang:    'Số tiền tăng thêm (đ) *',
  giam:    'Số tiền giảm trừ (đ) *',
  thaythe: 'Tổng giá trị mới (đ) *',
};

// ── Quyền: chỉ Admin + Giám đốc được ghi dữ liệu quyết toán ──
function _qtCanEdit() {
  return (typeof isAdmin === 'function' && isAdmin()) ||
         (typeof isGiamdoc === 'function' && isGiamdoc());
}

// ── Danh sách công trình cho dropdown (bỏ CÔNG TY + CT đã xóa) ──
// KHÔNG lọc theo năm: quyết toán là việc của TOÀN vòng đời công trình
// (CT thi công năm trước có thể quyết toán năm nay).
function _qtProjList() {
  return ((typeof getAllProjects === 'function') ? getAllProjects() : [])
    .filter(p => p && p.id !== 'COMPANY' && !p.deletedAt)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
}

// ── Đọc loại đang chọn ở 3 nút radio ──
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

// ══ KHỞI TẠO TAB ═════════════════════════════════════════════════
// Gọi khi vào tab (goPage) — reset form về trạng thái nhập mới.
function initQuyetToan() {
  qtPopulateSels();
  qtResetForm();
  qtRenderHistory(0);
  if (typeof initTatToan === 'function') initTatToan();
  // Tải bù mọi năm còn thiếu (số liệu quyết toán/tất toán tính toàn vòng đời) → vẽ lại
  qtEnsureAllYears(() => qtRefresh());
}

// Gọi khi đổi năm / sync xong (renderActiveTab) — GIỮ NGUYÊN nội dung đang nhập.
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

// ── Nạp dropdown: Công trình (form + bộ lọc lịch sử) + Người TH ──
function qtPopulateSels() {
  const projs = _qtProjList();
  const ctOpts = projs.map(p => `<option value="${x(p.id)}">${x(p.name)}${p.status === 'closed' ? ' (đã QT)' : ''}</option>`).join('');

  const ctSel = document.getElementById('qtf-ct');
  if (ctSel) {
    const cur = ctSel.value;
    ctSel.innerHTML = '<option value="">-- Chọn công trình --</option>' + ctOpts;
    if (cur) ctSel.value = cur;
  }
  const fSel = document.getElementById('qth-ct-filter');
  if (fSel) {
    fSel.innerHTML = '<option value="">-- Tất cả công trình --</option>' + ctOpts;
    fSel.value = _qthCtFilter;
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

// ── Reset form về trạng thái nhập mới ──
function qtResetForm() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('qtf-ngay', today());
  set('qtf-ct', '');
  set('qtf-nguoi', '');
  set('qtf-nd', '');
  set('qtf-edit-id', '');
  const st = document.getElementById('qtf-sotien');
  if (st) { st.value = ''; st.dataset.raw = ''; }
  const chot = document.getElementById('qtf-chot');
  if (chot) chot.checked = false;
  _qtSetLoai('tang');

  const title = document.getElementById('qtf-title');
  if (title) title.textContent = 'Quyết Toán Công Trình';
  const saveBtn = document.getElementById('qtf-save-btn');
  if (saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined msi-gap">save</span>Lưu quyết toán';
  const cancelBtn = document.getElementById('qtf-cancel-btn');
  if (cancelBtn) cancelBtn.style.display = 'none';
  const card = document.getElementById('qtf-card');
  if (card) card.style.outline = '';

  qtUpdatePreview();
}

// ── Đổi loại quyết toán ──
function qtOnLoaiChange() {
  const loai = _qtGetLoai();
  _qtApplyLoaiText(loai);
  // Gợi ý: "Thay thế" thường là bản chốt cuối → tự tick ô đóng công trình (khi nhập MỚI).
  // Người dùng vẫn bỏ tick được nếu chưa muốn đóng.
  const editing = !!document.getElementById('qtf-edit-id')?.value;
  const chot = document.getElementById('qtf-chot');
  if (chot && !editing) chot.checked = (loai === 'thaythe');
  qtUpdatePreview();
}

// ── Đổi công trình ở form → bảng lịch sử tự lọc theo CT đó (xem dòng thời gian) ──
function qtOnCtChange() {
  const pid = document.getElementById('qtf-ct')?.value || '';
  qtSetHistoryCt(pid);
  qtUpdatePreview();
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

// ══ LIVE PREVIEW ═════════════════════════════════════════════════
// Hiện ngay: Doanh thu hiện tại → Doanh thu sau quyết toán, Còn phải thu trước/sau,
// kèm cảnh báo (thu vượt doanh thu, doanh thu âm, có bản thay thế khác...).
function qtUpdatePreview() {
  const box = document.getElementById('qtf-preview');
  if (!box) return;
  const f = _qtReadForm();
  if (!f.proj) {
    box.innerHTML = '<div class="text-secondary text-center" style="padding:40px 10px;font-size:13px">Chọn công trình để xem doanh thu trước và sau quyết toán</div>';
    return;
  }

  // Trước: trạng thái hiện tại (toàn vòng đời) — gồm cả bản đang sửa với giá trị CŨ
  const truoc = calcTongDoanhThu(f.proj, { allYears: true });
  // Sau: bỏ bản đang sửa (nếu có) + thêm bản giả định với giá trị MỚI
  const sau = f.soTien > 0
    ? calcTongDoanhThu(f.proj, { allYears: true, excludeId: f.editId || undefined, extra: f.fake })
    : null;

  const _row = (label, val, cls) =>
    `<div class="d-flex justify-content-between" style="font-size:12px;padding:3px 0">
       <span class="text-secondary">${label}</span><span class="font-monospace ${cls || ''}">${val}</span>
     </div>`;
  const _qtTxt = (v) => v ? (v > 0 ? '+' : '-') + fmtM(Math.abs(v)) : '0 đ';
  const _conCls = (v) => v > 0 ? 'text-warning' : (v < 0 ? 'text-danger' : 'text-success');

  let html = `<div class="fw-bold mb-2" style="font-size:14px">${x(f.proj.name)}</div>`;
  if (!_qtAllYearsReady) {
    html += `<div class="alert alert-secondary py-1 px-2 mb-2" style="font-size:11px">⏳ Đang tải dữ liệu các năm cũ — số liệu có thể chưa đầy đủ.</div>`;
  }
  html += _row('HĐ gốc', fmtM(truoc.hdGoc));
  html += _row('Quyết toán đã có', _qtTxt(truoc.qt), truoc.qt < 0 ? 'text-danger' : (truoc.qt > 0 ? 'text-success' : ''));
  html += _row('Đã thu', fmtM(truoc.daThu), 'text-success');
  if (!truoc.coThayThe && truoc.daThu > truoc.hdGoc && truoc.hdGoc > 0) {
    html += `<div class="text-secondary" style="font-size:10px;font-style:italic">Đã thu &gt; HĐ gốc → doanh thu hiện lấy theo số đã thu (quy tắc cũ).</div>`;
  }

  // Khối so sánh TRƯỚC → SAU
  const dtSau = sau ? sau.tongDT : null;
  const chenh = sau ? sau.tongDT - truoc.tongDT : 0;
  html += `
    <div style="margin-top:12px;padding:12px;border-radius:10px;background:var(--bs-body-bg);border:1.5px solid var(--bs-border-color)">
      <div class="text-secondary" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px">Tổng doanh thu</div>
      <div class="d-flex align-items-center flex-wrap gap-2 mt-1">
        <span class="font-monospace" style="font-size:16px">${fmtM(truoc.tongDT)}</span>
        <span class="material-symbols-outlined text-secondary">arrow_forward</span>
        <span class="font-monospace fw-bold ${sau ? (chenh < 0 ? 'text-danger' : 'text-success') : 'text-secondary'}" style="font-size:20px">${sau ? fmtM(dtSau) : '—'}</span>
      </div>
      ${sau ? `<div style="font-size:12px" class="${chenh < 0 ? 'text-danger' : (chenh > 0 ? 'text-success' : 'text-secondary')}">${chenh ? (chenh > 0 ? '▲ +' : '▼ -') + fmtM(Math.abs(chenh)) : 'Không đổi'}</div>`
            : '<div class="text-secondary" style="font-size:12px">Nhập số tiền để xem kết quả</div>'}
      <hr class="my-2">
      <div class="text-secondary" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px">Còn phải thu</div>
      <div class="d-flex align-items-center flex-wrap gap-2 mt-1">
        <span class="font-monospace ${_conCls(truoc.conPhaiThu)}">${fmtM(truoc.conPhaiThu)}</span>
        <span class="material-symbols-outlined text-secondary">arrow_forward</span>
        <span class="font-monospace fw-bold ${sau ? _conCls(sau.conPhaiThu) : 'text-secondary'}" style="font-size:16px">${sau ? fmtM(sau.conPhaiThu) : '—'}</span>
      </div>
    </div>`;

  // ── Cảnh báo chống sai sót ──
  const warns = [];
  if (sau && sau.tongDT < 0) {
    warns.push(['danger', 'Doanh thu sau quyết toán bị ÂM — kiểm tra lại số tiền giảm trừ.']);
  } else if (sau && sau.conPhaiThu < 0) {
    warns.push(['warning', `Đã thu VƯỢT doanh thu sau quyết toán ${fmtM(-sau.conPhaiThu)} — công ty đang thu dư, có thể phải hoàn trả Chủ Đầu Tư.`]);
  }
  if (f.loai === 'thaythe' && f.ngay) {
    // Các bản ghi khác của CT có ngày SAU bản thay thế này
    const others = (typeof quyetToanRecords !== 'undefined' ? quyetToanRecords : [])
      .filter(r => !r.deletedAt && r.id !== f.editId && _qtMatchProj(r, f.proj) && (r.ngay || '') > f.ngay);
    const tt = others.filter(r => qtLoaiOf(r) === 'thaythe');
    if (tt.length) warns.push(['warning', `Đã có bản THAY THẾ ngày ${fmtISODate(tt[tt.length - 1].ngay)} mới hơn → bản mới hơn sẽ quyết định doanh thu, bản này không còn tác dụng.`]);
    else if (others.length) warns.push(['info', `Có ${others.length} phát sinh tăng/giảm sau ngày này — vẫn được cộng/trừ tiếp sau giá trị thay thế.`]);
  }
  if (f.proj.status === 'closed') {
    warns.push(['info', 'Công trình này đã ở trạng thái "Đã quyết toán".']);
  }
  html += warns.map(([t, m]) =>
    `<div class="alert alert-${t} py-2 px-3 mt-2 mb-0" style="font-size:12px">${t === 'info' ? 'ℹ' : '⚠'} ${m}</div>`).join('');

  box.innerHTML = html;
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
  if (!f.ngay)    { toast('Vui lòng chọn Ngày quyết toán!', 'error'); return; }
  if (!(f.soTien > 0)) { toast('Vui lòng nhập Số tiền lớn hơn 0!', 'error'); return; }
  const nd = (document.getElementById('qtf-nd')?.value || '').trim();
  if (!nd) { toast('Vui lòng nhập Nội dung / lý do quyết toán!', 'error'); return; }
  const nguoi = (document.getElementById('qtf-nguoi')?.value || '').trim();
  const chot  = !!document.getElementById('qtf-chot')?.checked;

  // Kiểm tra kết quả trước khi ghi (cùng công thức với Live Preview)
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

  const keepCt = f.proj.id;
  qtResetForm();
  qtPopulateSels();                 // cập nhật nhãn "(đã QT)" nếu vừa đóng CT
  qtSetHistoryCt(keepCt);           // giữ bảng lịch sử ở CT vừa lưu để thấy dòng mới
  _qtRefreshOtherTabs();
}

// ── Sửa: nạp bản ghi lên form (gọi khi ĐANG ở tab Quyết Toán) ──
function qtEdit(id) {
  const r = quyetToanRecords.find(r => String(r.id) === String(id));
  if (!r) return;
  qtPopulateSels();

  // Công trình: ưu tiên projectId, bản ghi cũ thì tìm theo tên
  const p = _qtResolveProj(r.projectId) || _qtResolveProj(r.congtrinh);
  const ctSel = document.getElementById('qtf-ct');
  if (ctSel) ctSel.value = p ? p.id : '';

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
  const card = document.getElementById('qtf-card');
  if (card) {
    card.style.outline = '2px solid var(--bs-warning)';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (p) qtSetHistoryCt(p.id);
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

  // Đang sửa đúng bản vừa xóa → reset form
  if (document.getElementById('qtf-edit-id')?.value === String(id)) qtResetForm();
  else qtUpdatePreview();
  qtRenderHistory(_qthPage);
  _qtRefreshOtherTabs();
  toast('Đã xóa quyết toán', 'success');
}

// ── Vẽ lại các bảng ở tab khác đang dùng số quyết toán (an toàn nếu tab chưa mở) ──
function _qtRefreshOtherTabs() {
  if (typeof renderKhaiBaoTable === 'function') renderKhaiBaoTable(0);
  if (typeof _dtRenderDashboardMini === 'function') _dtRenderDashboardMini();
  if (typeof renderLoiNhuan === 'function') renderLoiNhuan();
}

// ══ BẢNG LỊCH SỬ QUYẾT TOÁN ═════════════════════════════════════
// • Không lọc CT  → mọi quyết toán trong NĂM đang lọc.
// • Có lọc 1 CT   → DÒNG THỜI GIAN toàn vòng đời của CT đó: dòng đầu là HĐ gốc,
//                   mỗi dòng sau có "Ảnh hưởng DT" và "DT sau QT" cộng dồn.
function qtSetHistoryCt(pid) {
  _qthCtFilter = pid || '';
  const fSel = document.getElementById('qth-ct-filter');
  if (fSel && fSel.value !== _qthCtFilter) fSel.value = _qthCtFilter;
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
  const empty  = document.getElementById('qth-empty');
  const badge  = document.getElementById('qth-count-badge');
  const pgWrap = document.getElementById('qth-pagination');
  const hint   = document.getElementById('qth-hint');
  if (!tbody) return;

  const filterProj = _qthCtFilter ? _qtResolveProj(_qthCtFilter) : null;

  // Tính delta + doanh thu cộng dồn theo từng công trình (cache để không tính lặp)
  const _cache = new Map();   // projectKey → { deltas, runDT: Map(id → DT sau) }
  const _calcFor = (r) => {
    const p = _qtResolveProj(r.projectId) || _qtResolveProj(r.congtrinh);
    if (!p) return null;
    if (!_cache.has(p.id)) {
      const { recs, deltas } = qtTinhDelta(p);
      let dt = qtHdGocCuaCT(p);
      const runDT = new Map();
      recs.forEach(rr => { dt += deltas.get(rr.id) || 0; runDT.set(rr.id, dt); });
      _cache.set(p.id, { deltas, runDT });
    }
    return _cache.get(p.id);
  };

  let list = (typeof quyetToanRecords !== 'undefined' ? quyetToanRecords : []).filter(r => !r.deletedAt);
  if (filterProj) list = list.filter(r => _qtMatchProj(r, filterProj));          // 1 CT: toàn vòng đời
  else list = list.filter(r => _dtInYear(r.ngay));                               // tất cả: theo năm
  if (_qthSearch) {
    const q = _qthSearch;
    list = list.filter(r =>
      (_resolveCtName(r) || r.congtrinh || '').toLowerCase().includes(q) ||
      (r.nd || '').toLowerCase().includes(q) ||
      (r.nguoi || '').toLowerCase().includes(q));
  }
  // Mới nhất lên đầu
  list.sort((a, b) => _qtSortAsc(b, a));

  if (badge) badge.textContent = list.length ? `(${list.length} mục)` : '';
  if (hint) {
    hint.textContent = filterProj
      ? `Đang xem toàn bộ dòng thời gian của "${filterProj.name}" (mọi năm). Dòng cuối bảng là HĐ gốc.`
      : 'Đang xem quyết toán trong năm đang lọc. Chọn 1 công trình để xem dòng thời gian đầy đủ.';
  }

  if (!list.length && !filterProj) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    if (pgWrap) pgWrap.innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  const total = list.length;
  const slice = list.slice(page * DT_PG, (page + 1) * DT_PG);
  const canEdit = _qtCanEdit();

  let html = slice.map(r => {
    const c = _calcFor(r);
    const d = c ? (c.deltas.get(r.id) || 0) : 0;
    const dtSau = c ? c.runDT.get(r.id) : null;
    const dCls = d < 0 ? 'text-danger' : (d > 0 ? 'text-success' : 'text-secondary');
    return `<tr>
      <td class="text-secondary" style="white-space:nowrap;font-size:12px">${fmtISODate(r.ngay)}</td>
      <td style="font-weight:600;white-space:nowrap">${x(_resolveCtName(r) || r.congtrinh || '—')}</td>
      <td style="white-space:nowrap">${qtLoaiBadge(r)}</td>
      <td class="text-end font-monospace fw-semibold ${qtSoTienCls(r)}" style="white-space:nowrap">${qtSoTienTxt(r, fmtS)}</td>
      <td class="text-end font-monospace ${dCls}" style="white-space:nowrap">${d ? (d > 0 ? '+' : '-') + fmtS(Math.abs(d)) : '0'}</td>
      <td class="text-end font-monospace fw-bold" style="white-space:nowrap">${dtSau != null ? fmtS(dtSau) : '—'}</td>
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

  // Đang xem 1 CT + ở trang cuối → thêm dòng "HĐ gốc" làm điểm xuất phát của dòng thời gian
  const isLastPage = (page + 1) * DT_PG >= total;
  if (filterProj && isLastPage) {
    const hd = qtHdGocCuaCT(filterProj);
    html += `<tr style="background:var(--bs-tertiary-bg)">
      <td class="text-secondary" style="font-size:12px">—</td>
      <td style="font-weight:600;white-space:nowrap">${x(filterProj.name)}</td>
      <td><span class="badge bg-secondary" style="font-size:10px"><span class="material-symbols-outlined msi-gap">list_alt</span>HĐ gốc</span></td>
      <td class="text-end font-monospace" style="white-space:nowrap">${fmtS(hd)}</td>
      <td class="text-end text-secondary">—</td>
      <td class="text-end font-monospace fw-bold" style="white-space:nowrap">${fmtS(hd)}</td>
      <td class="text-body-secondary" style="font-size:12px">${hd ? 'Giá trị hợp đồng chính ban đầu' : 'Chưa khai báo HĐ chính'}</td>
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
