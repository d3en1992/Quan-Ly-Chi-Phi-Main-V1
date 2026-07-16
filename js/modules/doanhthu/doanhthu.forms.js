// doanhthu.forms.js — Form save/edit/delete and render tables for HĐ Chính, Thu Tiền, HĐ Thầu Phụ
// Load order: sau doanhthu.core.js, trước doanhthu.reports-export.js

// ══ PHẦN 1: HỢP ĐỒNG CHÍNH ════════════════════════════════════

// ── Đồng bộ ô Chủ Đầu Tư (read-only) với project.chuDauTu khi chọn CT ──
// Tên CĐT chỉ được nhập/sửa ở tab CÔNG TRÌNH; form HĐ Chính chỉ HIỂN THỊ.
function hdcSyncChuDauTu() {
  const ctSel  = document.getElementById('hdc-ct-input');
  const khEl   = document.getElementById('hdc-khachhang');
  if (!ctSel || !khEl) return;
  const ctName = (ctSel.value || '').trim();
  if (!ctName) { khEl.value = ''; return; }
  const proj   = (typeof projects !== 'undefined') ? projects.find(p => !p.deletedAt && p.name === ctName) : null;
  khEl.value   = (proj && proj.chuDauTu) ? proj.chuDauTu : '';
}

// ── Cập nhật hiển thị Tổng HĐ Chính khi nhập ─────────────────
function hdcUpdateTotal() {
  const tong = _readMoneyInput('hdc-giatri') + _readMoneyInput('hdc-giatriphu');
  const el = document.getElementById('hdc-tong-label');
  if (el) el.textContent = tong ? 'Tổng: ' + fmtM(tong) : '';
}

// ── Lưu / Cập nhật Hợp Đồng Chính ────────────────────────────
function saveHopDongChinh() {
  const ctInput = document.getElementById('hdc-ct-input');
  const ct = ctInput?.value.trim();
  if (!ct) { toast('Vui lòng chọn Công Trình!', 'error'); return; }

  // Chỉ cho phép CT đã tồn tại trong danh sách
  const _projExists = (typeof getAllProjects === 'function') &&
    getAllProjects().some(p => p.id !== 'COMPANY' && p.name === ct);
  if (!_projExists) {
    toast('Chỉ được tạo công trình tại tab Công Trình', 'error');
    return;
  }

  const ngay      = document.getElementById('hdc-ngay')?.value || today();
  const nguoi     = document.getElementById('hdc-nguoi')?.value || '';
  // khachHang KHÔNG đọc từ input (ô read-only) — luôn lấy từ project.chuDauTu để tránh lệch
  const _hdcProjForKh = (typeof projects !== 'undefined') ? projects.find(p => !p.deletedAt && p.name === ct) : null;
  const khachHang = (_hdcProjForKh && _hdcProjForKh.chuDauTu) ? _hdcProjForKh.chuDauTu : '';
  const nd        = (document.getElementById('hdc-nd')?.value || '').trim();
  const giaTri    = _readMoneyInput('hdc-giatri');
  const giaTriphu = _readMoneyInput('hdc-giatriphu');
  const editId    = document.getElementById('hdc-edit-id')?.value || '';

  _dtAddCT(ct);
  const now = Date.now();
  const _hdcProj = projects.find(p => p.name === ct) || null;
  const _hdcPid  = _hdcProj ? _hdcProj.id : null;

  // Xác định key lưu: ưu tiên projectId, fallback tên CT
  const _hdSaveKey = _hdcPid || ct;

  if (editId) {
    const existing = hopDongData[editId] || {};
    if (editId !== _hdSaveKey) {
      // Đổi CT hoặc key cũ khác key mới: tạo mới + xóa mềm cũ
      hopDongData[_hdSaveKey] = {
        giaTri, giaTriphu, nd, nguoi, khachHang,
        projectId: _hdcPid,
        ngay:      ngay || existing.ngay || today(),
        createdAt: existing.createdAt || now,
        updatedAt: now,
        deletedAt: null
      };
      hopDongData[editId] = { ...existing, deletedAt: now, updatedAt: now };
    } else {
      hopDongData[editId] = { ...existing, giaTri, giaTriphu, nd, nguoi, khachHang, ngay, projectId: _hdcPid, updatedAt: now };
    }
    toast('✅ Đã cập nhật hợp đồng: ' + ct, 'success');
  } else {
    hopDongData[_hdSaveKey] = {
      giaTri, giaTriphu, nd, nguoi, khachHang,
      projectId: _hdcPid,
      ngay, createdAt: now, updatedAt: now, deletedAt: null
    };
    toast('✅ Đã lưu hợp đồng: ' + ct, 'success');
  }

  save('hopdong_v1', hopDongData);
  _hdcResetForm();
  closeDtModal('hdc');
  renderHdcTable(0);
  renderHdcTableTk(_hdcTkPage);
  renderDashboard();
  _dtRenderDashboardMini();
}

function _hdcResetForm() {
  _hdcItems = [];
  ['hdc-giatri','hdc-giatriphu'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = '';
    if (el.dataset) el.dataset.raw = '';
  });
  const ctSel = document.getElementById('hdc-ct-input');
  if (ctSel) ctSel.value = '';
  const nguoiSel = document.getElementById('hdc-nguoi');
  if (nguoiSel) nguoiSel.value = '';
  const khEl = document.getElementById('hdc-khachhang');
  if (khEl) khEl.value = ''; // read-only ô sẽ được hdcSyncChuDauTu() set lại khi user chọn CT
  const ndEl = document.getElementById('hdc-nd');
  if (ndEl) ndEl.value = '';
  const ngayEl = document.getElementById('hdc-ngay');
  if (ngayEl) ngayEl.value = today();
  const editEl = document.getElementById('hdc-edit-id');
  if (editEl) editEl.value = '';
  const btn = document.getElementById('hdc-save-btn');
  if (btn) btn.innerHTML = '<span class="material-symbols-outlined msi-gap">save</span>Lưu';
  const tong = document.getElementById('hdc-tong-label');
  if (tong) tong.textContent = '';
}

// ── Sửa Hợp Đồng Chính ───────────────────────────────────────
function editHopDongChinh(keyId) {
  const hd = hopDongData[keyId];
  if (!hd) return;

  // Rebuild options từ danh mục hiện hành trước khi set giá trị (tránh dropdown trắng khi đổi tên)
  if (typeof dtPopulateSels === 'function') dtPopulateSels();

  // Resolve keyId → tên CT để hiển thị trên form
  const projs = (typeof projects !== 'undefined') ? projects : [];
  const p = projs.find(proj => proj.id === keyId);
  const ctName = p ? p.name : keyId;

  const ctSel = document.getElementById('hdc-ct-input');
  // _setSelectFlexible: tự thêm option nếu thiếu → không bao giờ trắng
  if (ctSel) _setSelectFlexible(ctSel, ctName);
  const ngayEl = document.getElementById('hdc-ngay');
  if (ngayEl) ngayEl.value = hd.ngay || '';
  const nguoiSel = document.getElementById('hdc-nguoi');
  // Tên Người TH resolve theo ID (mới nhất), fallback text cũ
  if (nguoiSel) _setSelectFlexible(nguoiSel, recCatName(hd,'hopdong','nguoi'));
  // Hiển thị Chủ Đầu Tư (read-only) — ưu tiên project.chuDauTu, fallback hd.khachHang legacy
  const khEl = document.getElementById('hdc-khachhang');
  if (khEl) {
    const _editProj = p || (typeof projects !== 'undefined' ? projects.find(pr => !pr.deletedAt && pr.name === ctName) : null);
    khEl.value = (_editProj && _editProj.chuDauTu) ? _editProj.chuDauTu : (hd.khachHang || '');
  }
  const ndEl = document.getElementById('hdc-nd');
  if (ndEl) ndEl.value = hd.nd || '';

  function _setMoney(elemId, val) {
    const el = document.getElementById(elemId);
    if (!el) return;
    el.dataset.raw = val || 0;
    el.value = val ? parseInt(val).toLocaleString('vi-VN') : '';
  }

  _hdcItems = [];
  _setMoney('hdc-giatri',    hd.giaTri    || 0);
  _setMoney('hdc-giatriphu', hd.giaTriphu || 0);

  const editEl = document.getElementById('hdc-edit-id');
  if (editEl) editEl.value = keyId;
  const btn = document.getElementById('hdc-save-btn');
  if (btn) btn.innerHTML = '<span class="material-symbols-outlined msi-gap">edit</span>Cập nhật';

  hdcUpdateTotal();
  openDtModal('hdc');
}

// ── Xóa mềm Hợp Đồng Chính ───────────────────────────────────
function delHopDongChinh(keyId) {
  // Resolve tên CT để hiển thị
  const projs = (typeof projects !== 'undefined') ? projects : [];
  const p = projs.find(proj => proj.id === keyId);
  const ctName = p ? p.name : keyId;
  if (!confirm('Xóa hợp đồng của ' + ctName + '?')) return;
  const now = Date.now();
  hopDongData[keyId] = { ...(hopDongData[keyId] || {}), deletedAt: now, updatedAt: now, deletedBy: getCurrentUser()?.username || 'Không rõ' };
  save('hopdong_v1', hopDongData);
  renderHdcTable(_hdcPage);
  renderHdcTableTk(_hdcTkPage);
  renderDashboard();
  toast('Đã xóa hợp đồng: ' + ctName, 'success');
}

// ── [KHAI BÁO] 3 hàm render cũ → delegate sang bảng GỘP CHUNG ──
// Sub-tab KHAI BÁO nay dùng MỘT bảng tổng hợp duy nhất (renderKhaiBaoTable).
// Giữ nguyên tên 3 hàm này để mọi nơi gọi sẵn (save/edit/delete/init) tự refresh
// bảng gộp; mọi lần gọi đưa về trang 0 (bản ghi mới nhất lên đầu).
function renderHdcTable(_page)  { renderKhaiBaoTable(0); }

// ══ PHẦN 2: GHI NHẬN THU TIỀN ═════════════════════════════════

// ── Lưu / Cập nhật bản ghi thu tiền ─────────────────────────
function saveThuRecord() {
  const ct      = document.getElementById('thu-ct-input')?.value.trim();
  const ngay    = document.getElementById('thu-ngay')?.value;
  const tien    = _readMoneyInput('thu-tien');
  const nguoi   = (document.getElementById('thu-nguoi')?.value || '').trim().toUpperCase();
  const nd      = document.getElementById('thu-nd')?.value.trim() || '';
  const loaiThu = document.getElementById('thu-loaithu')?.value || '';
  const editId  = document.getElementById('thu-edit-id')?.value || '';

  if (!ct)   { toast('Vui lòng nhập Công Trình!', 'error'); return; }
  if (!ngay) { toast('Vui lòng chọn Ngày!', 'error'); return; }
  if (!tien) { toast('Vui lòng nhập Số Tiền!', 'error'); return; }

  // Chỉ cho phép CT đã tồn tại
  const _thuProjExists = (typeof getAllProjects === 'function') &&
    getAllProjects().some(p => p.id !== 'COMPANY' && p.name === ct);
  if (!_thuProjExists) {
    toast('Chỉ được tạo công trình tại tab Công Trình', 'error');
    return;
  }

  _dtAddCT(ct);
  const now = Date.now();
  const _thuProj = projects.find(p => p.name === ct) || null;
  const _thuPid  = _thuProj ? _thuProj.id : null;

  if (editId) {
    // Cập nhật record hiện có
    const idx = thuRecords.findIndex(r => String(r.id) === String(editId));
    if (idx >= 0) {
      thuRecords[idx] = mkUpdate(thuRecords[idx], { ngay, congtrinh: ct, projectId: _thuPid, tien, nguoi, nd, loaiThu });
    }
    save('thu_v1', thuRecords);
    _thuResetForm();
    closeDtModal('thu');
    renderThuTable(_thuPage);
    renderThuTableTk(_thuTkPage);
    renderDashboard();
    _dtRenderDashboardMini();
    toast('✅ Đã cập nhật thu tiền: ' + fmtM(tien) + ' — ' + ct, 'success');
  } else {
    // Tạo mới
    thuRecords.unshift(mkRecord({ ngay, congtrinh: ct, projectId: _thuPid, tien, nguoi, nd, loaiThu }));
    save('thu_v1', thuRecords);

    // Reset form nhẹ: chỉ xóa tiền, người, nội dung — giữ ct và ngày
    const tienEl = document.getElementById('thu-tien');
    if (tienEl) { tienEl.value = ''; tienEl.dataset.raw = ''; }
    const nguoiEl = document.getElementById('thu-nguoi');
    if (nguoiEl) nguoiEl.value = '';
    const ndEl = document.getElementById('thu-nd');
    if (ndEl) ndEl.value = '';
    const loaiThuEl = document.getElementById('thu-loaithu');
    if (loaiThuEl) loaiThuEl.value = '';

    renderThuTable(0);
    renderThuTableTk(_thuTkPage);
    renderDashboard();
    _dtRenderDashboardMini();
    toast('✅ Đã ghi nhận thu ' + fmtM(tien) + ' từ ' + ct, 'success');
  }
}

// ── Sửa bản ghi thu tiền (mở modal Thu Tiền) ─────────────────
function editThuRecord(id) {
  const r = thuRecords.find(r => String(r.id) === String(id));
  if (!r) return;

  // Rebuild options từ danh mục hiện hành trước khi set giá trị (tránh dropdown trắng khi đổi tên)
  if (typeof dtPopulateSels === 'function') dtPopulateSels();

  const ctName = resolveProjectName(r) || r.congtrinh || '';

  // Điền dữ liệu vào form — _setSelectFlexible: tự thêm option nếu thiếu → không bao giờ trắng
  const ctSel = document.getElementById('thu-ct-input');
  if (ctSel) _setSelectFlexible(ctSel, ctName);
  const ngayEl = document.getElementById('thu-ngay');
  if (ngayEl) ngayEl.value = r.ngay || '';
  const nguoiSel = document.getElementById('thu-nguoi');
  // Tên Người TH resolve theo ID (mới nhất), fallback text cũ
  if (nguoiSel) _setSelectFlexible(nguoiSel, recCatName(r,'thu','nguoi'));
  const ndEl = document.getElementById('thu-nd');
  if (ndEl) ndEl.value = r.nd || '';
  const loaiThuEl = document.getElementById('thu-loaithu');
  if (loaiThuEl) loaiThuEl.value = r.loaiThu || '';

  // Điền tiền
  const tienEl = document.getElementById('thu-tien');
  if (tienEl) {
    tienEl.dataset.raw = r.tien || 0;
    tienEl.value = r.tien ? parseInt(r.tien).toLocaleString('vi-VN') : '';
  }

  // Đặt edit id + đổi nút
  const editEl = document.getElementById('thu-edit-id');
  if (editEl) editEl.value = id;
  const saveBtn = document.getElementById('thu-save-btn');
  if (saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined msi-gap">edit</span>Cập nhật';
  const cancelBtn = document.getElementById('thu-cancel-btn');
  if (cancelBtn) cancelBtn.style.display = '';

  _thuOnCtChange(ctName);
  openDtModal('thu');
}

// ── Hủy chỉnh sửa thu tiền ───────────────────────────────────
function _thuCancelEdit() {
  _thuResetForm();
  toast('Đã hủy chỉnh sửa', '');
}

// ── Reset toàn bộ form thu tiền ───────────────────────────────
function _thuResetForm() {
  ['thu-tien','thu-nd'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = '';
    if (el.dataset) el.dataset.raw = '';
  });
  const ctSel = document.getElementById('thu-ct-input');
  if (ctSel) ctSel.value = '';
  const nguoiSel = document.getElementById('thu-nguoi');
  if (nguoiSel) nguoiSel.value = '';
  const ngayEl = document.getElementById('thu-ngay');
  if (ngayEl) ngayEl.value = today();
  const loaiThuEl = document.getElementById('thu-loaithu');
  if (loaiThuEl) loaiThuEl.value = '';
  const progInfo = document.getElementById('thu-progress-info');
  if (progInfo) progInfo.style.display = 'none';
  const editEl = document.getElementById('thu-edit-id');
  if (editEl) editEl.value = '';
  const saveBtn = document.getElementById('thu-save-btn');
  if (saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined msi-gap">save</span>Ghi nhận Thu';
  const cancelBtn = document.getElementById('thu-cancel-btn');
  if (cancelBtn) cancelBtn.style.display = 'none';
}

// ── Xóa mềm bản ghi thu tiền ─────────────────────────────────
function delThuRecord(id) {
  if (!confirm('Xóa bản ghi thu tiền này?')) return;
  const idx = thuRecords.findIndex(r => String(r.id) === String(id));
  if (idx < 0) return;
  const now = Date.now();
  thuRecords[idx] = { ...thuRecords[idx], deletedAt: now, updatedAt: now, deviceId: DEVICE_ID, deletedBy: getCurrentUser()?.username || 'Không rõ' };
  save('thu_v1', thuRecords);
  renderThuTable(_thuPage);
  renderThuTableTk(_thuTkPage);
  renderDashboard();
  toast('Đã xóa bản ghi thu tiền', 'success');
}

// ── [KHAI BÁO] render lịch sử thu cũ → delegate sang bảng GỘP CHUNG ──
function renderThuTable(_page) { renderKhaiBaoTable(0); }

// ══ PHẦN 3: HỢP ĐỒNG THẦU PHỤ ════════════════════════════════

// ── Cập nhật hiển thị Tổng HĐ Thầu Phụ khi nhập ─────────────
function hdtpUpdateTotal() {
  const tong = _readMoneyInput('hdtp-giatri');
  const el = document.getElementById('hdtp-tong-label');
  if (el) el.textContent = tong ? 'Tổng: ' + fmtM(tong) : '';
}

// ── Lưu / Cập nhật Hợp Đồng Thầu Phụ ────────────────────────
function saveHopDongThauPhu() {
  const ct = document.getElementById('hdtp-ct-input')?.value.trim();
  const tp = (document.getElementById('hdtp-thauphu')?.value || '').trim();
  if (!ct) { toast('Vui lòng chọn Công Trình!', 'error'); return; }
  if (!tp) { toast('Vui lòng chọn Thầu Phụ!', 'error'); return; }

  // Chỉ cho phép CT đã tồn tại
  const _hdtpProjExists = (typeof getAllProjects === 'function') &&
    getAllProjects().some(p => p.id !== 'COMPANY' && p.name === ct);
  if (!_hdtpProjExists) {
    toast('Chỉ được tạo công trình tại tab Công Trình', 'error');
    return;
  }

  const ngay     = document.getElementById('hdtp-ngay')?.value || today();
  const nd       = document.getElementById('hdtp-nd')?.value.trim() || '';
  const giaTri   = _hdtpItems.length > 0
    ? calcHopDongValue({ items: _hdtpItems })
    : _readMoneyInput('hdtp-giatri');
  const editId   = document.getElementById('hdtp-edit-id')?.value || '';

  _dtAddCT(ct);
  _dtAddTP(tp);
  const now = Date.now();
  const _hdtpProj = projects.find(p => p.name === ct) || null;
  const _hdtpPid  = _hdtpProj ? _hdtpProj.id : null;

  if (editId) {
    const idx = thauPhuContracts.findIndex(r => r.id === editId);
    if (idx >= 0) {
      thauPhuContracts[idx] = mkUpdate(thauPhuContracts[idx], { ngay, congtrinh: ct, projectId: _hdtpPid, thauphu: tp, giaTri, nd, items: [..._hdtpItems] });
    }
    toast('✅ Đã cập nhật HĐ thầu phụ', 'success');
  } else {
    thauPhuContracts.unshift(mkRecord({ ngay, congtrinh: ct, projectId: _hdtpPid, thauphu: tp, giaTri, nd, items: [..._hdtpItems] }));
    toast('✅ Đã lưu HĐ thầu phụ: ' + tp + ' — ' + ct, 'success');
  }

  save('thauphu_v1', thauPhuContracts);
  _hdtpResetForm();
  closeDtModal('hdtp');
  renderHdtpTable(0);
  renderHdtpTableTk(_hdtpTkPage);
  _dtRenderDashboardMini();
}

function _hdtpResetForm() {
  _hdtpItems = [];
  if(typeof window.renderhdtpChiTiet === 'function') window.renderhdtpChiTiet();

  ['hdtp-giatri','hdtp-nd'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = '';
    if (el.dataset) el.dataset.raw = '';
  });
  const giaTriEl = document.getElementById('hdtp-giatri');
  if (giaTriEl) { giaTriEl.readOnly = false; giaTriEl.style.background = ''; giaTriEl.style.pointerEvents = ''; }
  const ctSel = document.getElementById('hdtp-ct-input');
  if (ctSel) ctSel.value = '';
  const tpSel = document.getElementById('hdtp-thauphu');
  if (tpSel) tpSel.value = '';
  const ngayEl = document.getElementById('hdtp-ngay');
  if (ngayEl) ngayEl.value = today();
  const editEl = document.getElementById('hdtp-edit-id');
  if (editEl) editEl.value = '';
  const btn = document.getElementById('hdtp-save-btn');
  if (btn) btn.innerHTML = '<span class="material-symbols-outlined msi-gap">save</span>Lưu';
  const tong = document.getElementById('hdtp-tong-label');
  if (tong) tong.textContent = '';
}

// ── Sửa Hợp Đồng Thầu Phụ (mở modal) ────────────────────────
function editHopDongThauPhu(id) {
  const r = thauPhuContracts.find(r => r.id === id);
  if (!r) return;

  // Rebuild options từ danh mục hiện hành trước khi set giá trị (tránh dropdown trắng khi đổi tên)
  if (typeof dtPopulateSels === 'function') dtPopulateSels();

  const ctName = resolveProjectName(r) || r.congtrinh || '';
  const ctSel = document.getElementById('hdtp-ct-input');
  // _setSelectFlexible: tự thêm option nếu thiếu → không bao giờ trắng
  if (ctSel) _setSelectFlexible(ctSel, ctName);
  const tpSel = document.getElementById('hdtp-thauphu');
  // Tên Thầu Phụ resolve theo ID (mới nhất), fallback text cũ
  if (tpSel) _setSelectFlexible(tpSel, recCatName(r,'thauphu','thauphu'));
  const ngayEl = document.getElementById('hdtp-ngay');
  if (ngayEl) ngayEl.value = r.ngay || '';
  const ndInput = document.getElementById('hdtp-nd');
  if (ndInput) ndInput.value = r.nd || '';

  function _setMoney(elemId, val) {
    const el = document.getElementById(elemId);
    if (!el) return;
    el.dataset.raw = val || 0;
    el.value = val ? parseInt(val).toLocaleString('vi-VN') : '';
  }

  _hdtpItems = Array.isArray(r.items) ? [...r.items] : [];
  if(typeof window.renderhdtpChiTiet === 'function') window.renderhdtpChiTiet();
  if(typeof window.hdtpCalcAuto === 'function') window.hdtpCalcAuto();
  if (_hdtpItems.length === 0) _setMoney('hdtp-giatri', r.giaTri || 0);

  const editEl = document.getElementById('hdtp-edit-id');
  if (editEl) editEl.value = id;
  const btn = document.getElementById('hdtp-save-btn');
  if (btn) btn.innerHTML = '<span class="material-symbols-outlined msi-gap">edit</span>Cập nhật';

  hdtpUpdateTotal();
  openDtModal('hdtp');
}

// ── Xóa mềm Hợp Đồng Thầu Phụ ────────────────────────────────
function delHopDongThauPhu(id) {
  if (!confirm('Xóa hợp đồng thầu phụ này?')) return;
  const idx = thauPhuContracts.findIndex(r => r.id === id);
  if (idx < 0) return;
  const now = Date.now();
  thauPhuContracts[idx] = { ...thauPhuContracts[idx], deletedAt: now, updatedAt: now, deviceId: DEVICE_ID, deletedBy: getCurrentUser()?.username || 'Không rõ' };
  save('thauphu_v1', thauPhuContracts);
  renderHdtpTable(_hdtpPage);
  renderHdtpTableTk(_hdtpTkPage);
  toast('Đã xóa hợp đồng thầu phụ', 'success');
}

// ── [KHAI BÁO] render HĐ Thầu Phụ cũ → delegate sang bảng GỘP CHUNG ──
function renderHdtpTable(_page) { renderKhaiBaoTable(0); }

// ══ BẢNG GỘP CHUNG KHAI BÁO (30 ngày gần nhất) ═══════════════
// Gộp HĐ Chính + HĐ Thầu Phụ + Thu Tiền vào MỘT bảng, sắp theo ngày giảm dần.
// Mỗi dòng có nhãn Loại + nút Sửa/Xóa gọi đúng hàm theo loại bản ghi.
let _kbPage = 0;

function renderKhaiBaoTable(page) {
  page = page || 0;
  _kbPage = page;
  const tbody  = document.getElementById('kb-tbody');
  const empty  = document.getElementById('kb-empty');
  const badge  = document.getElementById('kb-count-badge');
  const pgWrap = document.getElementById('kb-pagination');
  if (!tbody) return;

  const _LOAI_BADGE = {
    tamung:   ['Tạm ứng',  'badge bg-warning text-dark'],
    giaidoan: ['Giai đoạn','badge bg-info text-dark'],
    quyettoan:['Quyết toán','badge bg-success'],
  };

  const items = []; // { type, ngay, sortTs, ct, doiTac, nd, tien, actions }

  // ── HĐ Chính ──
  const _kbProjs = (typeof projects !== 'undefined') ? projects : [];
  Object.entries(hopDongData)
    .filter(([keyId, v]) => !v.deletedAt && _dtInYear(v.ngay) && _dtWithinRecent(v.ngay))
    .forEach(([keyId, hd]) => {
      const _p = _kbProjs.find(p => p.id === keyId);
      const ctName = _p ? _p.name : keyId;
      const tong = (hd.giaTri || 0) + (hd.giaTriphu || 0) + (hd.phatSinh || 0);
      items.push({
        type: 'hdc',
        ngay: hd.ngay,
        sortTs: hd.updatedAt || hd.createdAt || 0,
        ct: ctName,
        doiTac: recCatName(hd, 'hopdong', 'nguoi') || '—',
        nd: hd.nd || '—',
        tien: tong,
        tienCls: 'text-warning',
        loaiBadge: '<span class="badge bg-primary" style="font-size:10px"><span class="material-symbols-outlined msi-gap">list_alt</span>HĐ Chính</span>',
        actions: `
          <button class="btn btn-outline-primary btn-sm" title="Sửa" onclick="editHopDongChinh(this.dataset.ct)" data-ct="${x(keyId)}"><i class="bi bi-pencil-fill"></i></button>
          <button class="btn btn-outline-danger btn-sm" title="Xóa" onclick="delHopDongChinh(this.dataset.ct)" data-ct="${x(keyId)}"><i class="bi bi-trash-fill"></i></button>`,
      });
    });

  // ── HĐ Thầu Phụ ──
  thauPhuContracts
    .filter(r => !r.deletedAt && _dtInYear(r.ngay) && _dtWithinRecent(r.ngay))
    .forEach(r => {
      const tong = (r.giaTri || 0) + (r.phatSinh || 0);
      items.push({
        type: 'hdtp',
        ngay: r.ngay,
        sortTs: r.updatedAt || r.createdAt || 0,
        ct: _resolveCtName(r) || '—',
        doiTac: recCatName(r, 'thauphu', 'thauphu') || '—',
        nd: r.nd || '—',
        tien: tong,
        tienCls: 'text-warning',
        loaiBadge: '<span class="badge bg-warning text-dark" style="font-size:10px"><span class="material-symbols-outlined msi-gap">handshake</span>HĐ Thầu Phụ</span>',
        actions: `
          <button class="btn btn-outline-primary btn-sm" title="Sửa" onclick="editHopDongThauPhu('${r.id}')"><i class="bi bi-pencil-fill"></i></button>
          <button class="btn btn-outline-danger btn-sm" title="Xóa" onclick="delHopDongThauPhu('${r.id}')"><i class="bi bi-trash-fill"></i></button>`,
      });
    });

  // ── Thu Tiền ──
  thuRecords
    .filter(r => !r.deletedAt && inActiveYear(r.ngay) && _dtWithinRecent(r.ngay))
    .forEach(r => {
      const [loaiLabel, loaiCls] = _LOAI_BADGE[r.loaiThu] || ['', ''];
      const loaiExtra = loaiLabel ? ` <span class="${loaiCls}" style="font-size:10px">${loaiLabel}</span>` : '';
      items.push({
        type: 'thu',
        ngay: r.ngay,
        sortTs: r.updatedAt || r.createdAt || 0,
        ct: _resolveCtName(r) || '—',
        doiTac: recCatName(r, 'thu', 'nguoi') || '—',
        nd: r.nd || '—',
        tien: r.tien || 0,
        tienCls: 'text-success',
        loaiBadge: '<span class="badge bg-success" style="font-size:10px"><span class="material-symbols-outlined msi-gap">payments</span>Thu Tiền</span>' + loaiExtra,
        actions: `
          <button class="btn btn-outline-primary btn-sm" title="Sửa" onclick="editThuRecord('${r.id}')"><i class="bi bi-pencil-fill"></i></button>
          <button class="btn btn-outline-danger btn-sm" title="Xóa" onclick="delThuRecord('${r.id}')"><i class="bi bi-trash-fill"></i></button>`,
      });
    });

  // ── Quyết Toán Chi Phí ──
  quyetToanRecords
    .filter(r => !r.deletedAt && _dtInYear(r.ngay) && _dtWithinRecent(r.ngay))
    .forEach(r => {
      const v = r.giaTri || 0;
      items.push({
        type: 'qt',
        ngay: r.ngay,
        sortTs: r.updatedAt || r.createdAt || 0,
        ct: _resolveCtName(r) || '—',
        doiTac: r.nguoi || '—',
        nd: r.nd || '—',
        tien: v,
        // Phát sinh giảm (âm) tô đỏ, tăng tô xanh
        tienCls: v < 0 ? 'text-danger' : 'text-success',
        tienTxt: v ? (v > 0 ? '+' : '') + fmtM(v) : '—',
        loaiBadge: '<span class="badge bg-dark" style="font-size:10px"><span class="material-symbols-outlined msi-gap">receipt_long</span>Quyết Toán</span>',
        actions: `
          <button class="btn btn-outline-primary btn-sm" title="Sửa" onclick="editQuyetToan('${r.id}')"><i class="bi bi-pencil-fill"></i></button>
          <button class="btn btn-outline-danger btn-sm" title="Xóa" onclick="delQuyetToan('${r.id}')"><i class="bi bi-trash-fill"></i></button>`,
      });
    });

  // Sắp xếp: ngày mới nhất lên đầu (tie-break theo thời điểm cập nhật)
  items.sort((a, b) => (b.ngay || '').localeCompare(a.ngay || '') || (b.sortTs - a.sortTs));

  if (badge) badge.textContent = items.length ? `(${items.length} mục)` : '';

  if (!items.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    if (pgWrap) pgWrap.innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  const total = items.length;
  const slice = items.slice(page * DT_PG, (page + 1) * DT_PG);

  tbody.innerHTML = slice.map(it => `<tr>
    <td class="text-body-secondary" style="white-space:nowrap;font-size:12px">${fmtISODate(it.ngay)}</td>
    <td style="white-space:nowrap">${it.loaiBadge}</td>
    <td style="font-weight:600;white-space:nowrap">${x(it.ct)}</td>
    <td class="text-secondary" style="white-space:nowrap">${x(it.doiTac)}</td>
    <td class="text-body-secondary" style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(it.nd)}">${x(it.nd)}</td>
    <td class="text-end font-monospace fw-semibold ${it.tienCls}" style="white-space:nowrap">${it.tienTxt !== undefined ? it.tienTxt : (it.tien ? fmtM(it.tien) : '—')}</td>
    <td class="action-col">
      <div class="d-flex gap-1 justify-content-center">${it.actions}</div>
    </td>
  </tr>`).join('');

  if (pgWrap) pgWrap.innerHTML = _dtPaginationHtml(total, page, 'renderKhaiBaoTable');
}

// ══ PHẦN 4: BẢNG THỐNG KÊ (toàn bộ — phục vụ đối soát) ════════
// Dùng chung hàm sửa/xóa với KHAI BÁO; chỉ khác: KHÔNG giới hạn 30 ngày,
// KHÔNG có cột checkbox, dùng state filter/search/pagination riêng (_dtTk*).

// ── Render bảng Hợp Đồng Chính (toàn bộ) ─────────────────────
function renderHdcTableTk(page) {
  page = page || 0;
  _hdcTkPage = page;
  const tbody  = document.getElementById('hdctk-tbody');
  const empty  = document.getElementById('hdctk-empty');
  const pgWrap = document.getElementById('hdctk-pagination');
  if (!tbody) return;

  const _allProjs = (typeof projects !== 'undefined') ? projects : [];
  const _resolveName = (keyId) => {
    const p = _allProjs.find(proj => proj.id === keyId);
    return p ? p.name : keyId;
  };
  // Sắp xếp: ngày mới nhất lên đầu (DESC), tie-break theo thời điểm cập nhật/tạo
  let entries = Object.entries(hopDongData)
    .filter(([keyId, v]) => !v.deletedAt && _dtInYear(v.ngay) && _dtMatchTkHDCFilter(keyId, v))
    .sort((a, b) => (b[1].ngay || '').localeCompare(a[1].ngay || '')
      || ((b[1].updatedAt || b[1].createdAt || 0) - (a[1].updatedAt || a[1].createdAt || 0)));

  if (_dtTkSearch) {
    const q = _dtTkSearch;
    entries = entries.filter(([keyId, v]) =>
      (_resolveName(keyId) || '').toLowerCase().includes(q) ||
      recCatName(v,'hopdong','nguoi').toLowerCase().includes(q)
    );
  }

  if (!entries.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    if (pgWrap) pgWrap.innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  const total = entries.length;
  const slice = entries.slice(page * DT_PG, (page + 1) * DT_PG);

  tbody.innerHTML = slice.map(([keyId, hd]) => {
    const ctName = _resolveName(keyId);
    const _proj = _allProjs.find(pr => !pr.deletedAt && (pr.id === keyId || pr.name === ctName));
    const _cdt = (_proj && _proj.chuDauTu) ? _proj.chuDauTu : (hd.khachHang || '');
    const tong = (hd.giaTri || 0) + (hd.giaTriphu || 0) + (hd.phatSinh || 0);
    return `<tr>
      <td style="text-align:center;padding:4px 6px"><input type="checkbox" class="hdc-row-chk" data-id="${x(keyId)}"></td>
      <td class="text-body-secondary" style="white-space:nowrap;font-size:12px">${fmtISODate(hd.ngay)}</td>
      <td style="font-weight:600;white-space:nowrap">${x(ctName)}</td>
      <td class="text-body-secondary" style="font-size:12px;white-space:nowrap">${x(_cdt || '—')}</td>
      <td class="text-end font-monospace" style="white-space:nowrap">${hd.giaTri ? fmtS(hd.giaTri) : '<span class="text-body-secondary">—</span>'}</td>
      <td class="text-end font-monospace" style="white-space:nowrap">${hd.giaTriphu ? fmtS(hd.giaTriphu) : '<span class="text-body-secondary">—</span>'}</td>
      <td class="text-end font-monospace fw-bold text-warning" style="white-space:nowrap">${tong ? fmtS(tong) : '—'}</td>
      <td class="action-col">
        <div class="d-flex gap-1 justify-content-center">
          <button class="btn btn-outline-primary btn-sm" title="S&#7917;a"
            onclick="editHopDongChinh(this.dataset.ct)" data-ct="${x(keyId)}"><i class="bi bi-pencil-fill"></i></button>
          <button class="btn btn-outline-danger btn-sm" title="X&#243;a"
            onclick="delHopDongChinh(this.dataset.ct)" data-ct="${x(keyId)}"><i class="bi bi-trash-fill"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  if (pgWrap) pgWrap.innerHTML = _dtPaginationHtml(total, page, 'renderHdcTableTk');
}

// ── Render bảng Hợp Đồng Thầu Phụ (toàn bộ) ──────────────────
function renderHdtpTableTk(page) {
  page = page || 0;
  _hdtpTkPage = page;
  const tbody  = document.getElementById('hdtptk-tbody');
  const empty  = document.getElementById('hdtptk-empty');
  const pgWrap = document.getElementById('hdtptk-pagination');
  if (!tbody) return;

  // Sắp xếp: ngày mới nhất lên đầu (DESC), tie-break theo thời điểm tạo
  let filtered = thauPhuContracts
    .filter(r => !r.deletedAt && _dtInYear(r.ngay) && _dtMatchTkProjFilter(r))
    .sort((a, b) => (b.ngay || '').localeCompare(a.ngay || '')
      || ((b.createdAt || 0) - (a.createdAt || 0)));

  if (_dtTkSearch) {
    const q = _dtTkSearch;
    filtered = filtered.filter(r =>
      (_resolveCtName(r) || '').toLowerCase().includes(q) ||
      (recCatName(r,'thauphu','thauphu') || '').toLowerCase().includes(q) ||
      (r.nd || '').toLowerCase().includes(q)
    );
  }

  if (!filtered.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    if (pgWrap) pgWrap.innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  const total = filtered.length;
  const slice = filtered.slice(page * DT_PG, (page + 1) * DT_PG);

  tbody.innerHTML = slice.map(r => {
    const tong = (r.giaTri || 0) + (r.phatSinh || 0);
    return `<tr>
      <td style="text-align:center;padding:4px 6px"><input type="checkbox" class="hdtp-row-chk" data-id="${r.id}"></td>
      <td class="text-secondary" style="white-space:nowrap;font-size:12px">${fmtISODate(r.ngay)}</td>
      <td style="font-weight:600;white-space:nowrap">${x(_resolveCtName(r))}</td>
      <td style="white-space:nowrap">${x(recCatName(r,'thauphu','thauphu'))}</td>
      <td class="text-secondary hdtp-nd-cell"><span class="hdtp-nd-clamp">${x(r.nd || '—')}</span></td>
      <td class="text-end font-monospace fw-bold text-warning" style="white-space:nowrap">${tong ? fmtS(tong) : '—'}</td>
      <td class="action-col">
        <div class="d-flex gap-1 justify-content-center">
          <button class="btn btn-outline-primary btn-sm" title="S&#7917;a"
            onclick="editHopDongThauPhu('${r.id}')"><i class="bi bi-pencil-fill"></i></button>
          <button class="btn btn-outline-danger btn-sm" title="X&#243;a"
            onclick="delHopDongThauPhu('${r.id}')"><i class="bi bi-trash-fill"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  if (pgWrap) pgWrap.innerHTML = _dtPaginationHtml(total, page, 'renderHdtpTableTk');
}

// ── Render bảng Lịch Sử Thu Tiền (toàn bộ) ───────────────────
function renderThuTableTk(page) {
  if (page === undefined) page = _thuTkPage;
  _thuTkPage = page;
  const tbody  = document.getElementById('thutk-tbody');
  const empty  = document.getElementById('thutk-empty');
  const badge  = document.getElementById('thutk-count-badge');
  const pgWrap = document.getElementById('thutk-pagination');
  if (!tbody) return;

  const _LOAI_BADGE = { tamung: ['Tạm ứng','badge bg-warning text-dark'], giaidoan: ['Giai đoạn','badge bg-info text-dark'], quyettoan: ['Quyết toán','badge bg-success'] };

  let filtered = thuRecords
    .filter(r => !r.deletedAt && inActiveYear(r.ngay) && _dtMatchTkProjFilter(r))
    .sort((a, b) => b.ngay.localeCompare(a.ngay));

  if (_dtTkSearch) {
    const q = _dtTkSearch;
    filtered = filtered.filter(r =>
      (_resolveCtName(r) || '').toLowerCase().includes(q) ||
      recCatName(r,'thu','nguoi').toLowerCase().includes(q) ||
      (r.nd || '').toLowerCase().includes(q) ||
      (r.loaiThu || '').toLowerCase().includes(q)
    );
  }

  if (badge) badge.textContent = filtered.length ? `(${filtered.length} đợt)` : '';

  if (!filtered.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    if (pgWrap) pgWrap.innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  const total = filtered.length;
  const slice = filtered.slice(page * DT_PG, (page + 1) * DT_PG);

  tbody.innerHTML = slice.map(r => {
    const [loaiLabel, loaiCls] = _LOAI_BADGE[r.loaiThu] || ['',''];
    const loaiBadge = loaiLabel ? `<span class="${loaiCls}" style="font-size:11px">${loaiLabel}</span>` : '<span class="text-body-secondary">—</span>';
    return `<tr>
      <td style="text-align:center;padding:4px 6px"><input type="checkbox" class="thu-row-chk" data-id="${r.id}"></td>
      <td class="text-secondary" style="white-space:nowrap;font-size:12px">${fmtISODate(r.ngay)}</td>
      <td style="font-weight:600;white-space:nowrap">${x(_resolveCtName(r))}</td>
      <td style="white-space:nowrap">${loaiBadge}</td>
      <td class="text-end font-monospace fw-semibold text-success" style="white-space:nowrap">${fmtM(r.tien)}</td>
      <td class="text-secondary" style="white-space:nowrap">${x(recCatName(r,'thu','nguoi') || '—')}</td>
      <td class="text-body-secondary" style="font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(r.nd || '')}">${x(r.nd || '—')}</td>
      <td class="action-col">
        <div class="d-flex gap-1 justify-content-center">
          <button class="btn btn-outline-primary btn-sm" title="S&#7917;a"
            onclick="editThuRecord('${r.id}')"><i class="bi bi-pencil-fill"></i></button>
          <button class="btn btn-outline-danger btn-sm" title="X&#243;a"
            onclick="delThuRecord('${r.id}')"><i class="bi bi-trash-fill"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  if (pgWrap) pgWrap.innerHTML = _dtPaginationHtml(total, page, 'renderThuTableTk');
}

// ══ PHẦN 5: QUYẾT TOÁN CHI PHÍ ═══════════════════════════════
// Mỗi bản ghi là 1 lần phát sinh (tăng hoặc GIẢM — cho phép giá trị âm) kèm lý do.
// Doanh thu thực tế = HĐ chính ban đầu + tổng cộng dồn các giá trị quyết toán.
let _qtTkPage = 0;

// ── Lưu / Cập nhật một bản ghi Quyết Toán ────────────────────
function saveQuyetToan() {
  const ct = document.getElementById('qt-ct-input')?.value.trim();
  if (!ct) { toast('Vui lòng chọn Công Trình!', 'error'); return; }

  // Chỉ cho phép CT đã tồn tại (tạo CT phải qua tab Công Trình)
  const _qtProj = (typeof getAllProjects === 'function')
    ? getAllProjects().find(p => p.id !== 'COMPANY' && p.name === ct)
    : null;
  if (!_qtProj) { toast('Chỉ được tạo công trình tại tab Công Trình', 'error'); return; }

  const giaTri = _readMoneySigned('qt-giatri');          // CHO PHÉP ÂM (giảm trừ)
  const nd     = document.getElementById('qt-nd')?.value.trim() || '';
  if (!giaTri) { toast('Vui lòng nhập Giá Trị Phát Sinh (dương hoặc âm)!', 'error'); return; }
  if (!nd)     { toast('Vui lòng nhập Nội Dung lý do phát sinh!', 'error'); return; }

  const ngay   = document.getElementById('qt-ngay')?.value || today();
  const nguoi  = (document.getElementById('qt-nguoi')?.value || '').trim();
  const editId = document.getElementById('qt-edit-id')?.value || '';
  const _qtPid = _qtProj.id;

  if (editId) {
    const idx = quyetToanRecords.findIndex(r => r.id === editId);
    if (idx >= 0) {
      quyetToanRecords[idx] = mkUpdate(quyetToanRecords[idx], { ngay, congtrinh: ct, projectId: _qtPid, giaTri, nd, nguoi });
    }
    toast('✅ Đã cập nhật quyết toán', 'success');
  } else {
    quyetToanRecords.unshift(mkRecord({ ngay, congtrinh: ct, projectId: _qtPid, giaTri, nd, nguoi }));
    toast('✅ Đã lưu quyết toán: ' + ct, 'success');
  }

  save('quyettoan_v1', quyetToanRecords);
  _qtResetForm();
  closeDtModal('qt');
  renderKhaiBaoTable(0);
  renderQtTableTk(_qtTkPage);
  _dtRenderDashboardMini();
  if (typeof renderLoiNhuan === 'function') renderLoiNhuan();
}

// ── Reset form Quyết Toán ────────────────────────────────────
function _qtResetForm() {
  ['qt-giatri','qt-nd'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = '';
    if (el.dataset) el.dataset.raw = '';
  });
  const ctSel = document.getElementById('qt-ct-input');
  if (ctSel) ctSel.value = '';
  const nguoiSel = document.getElementById('qt-nguoi');
  if (nguoiSel) nguoiSel.value = '';
  const ngayEl = document.getElementById('qt-ngay');
  if (ngayEl) ngayEl.value = today();
  const progInfo = document.getElementById('qt-progress-info');
  if (progInfo) progInfo.style.display = 'none';
  const editEl = document.getElementById('qt-edit-id');
  if (editEl) editEl.value = '';
  const saveBtn = document.getElementById('qt-save-btn');
  if (saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined msi-gap">save</span>Lưu';
  const cancelBtn = document.getElementById('qt-cancel-btn');
  if (cancelBtn) cancelBtn.style.display = 'none';
}

// ── Sửa Quyết Toán (mở modal) ────────────────────────────────
function editQuyetToan(id) {
  const r = quyetToanRecords.find(r => String(r.id) === String(id));
  if (!r) return;

  // Rebuild options từ danh mục hiện hành trước khi set giá trị (tránh dropdown trắng khi đổi tên)
  if (typeof dtPopulateSels === 'function') dtPopulateSels();

  const ctName = resolveProjectName(r) || r.congtrinh || '';
  const ctSel = document.getElementById('qt-ct-input');
  // _setSelectFlexible: tự thêm option nếu thiếu → không bao giờ trắng
  if (ctSel) _setSelectFlexible(ctSel, ctName);
  const ngayEl = document.getElementById('qt-ngay');
  if (ngayEl) ngayEl.value = r.ngay || today();
  const nguoiSel = document.getElementById('qt-nguoi');
  // QT lưu nguoi dạng text (không gắn id) — dùng _setSelectFlexible để không trắng dropdown
  if (nguoiSel) _setSelectFlexible(nguoiSel, r.nguoi);
  const ndEl = document.getElementById('qt-nd');
  if (ndEl) ndEl.value = r.nd || '';

  // Set giá trị có dấu (giữ dấu trừ nếu âm)
  const giaEl = document.getElementById('qt-giatri');
  if (giaEl) {
    const v = r.giaTri || 0;
    giaEl.dataset.raw = String(v);
    giaEl.value = v ? v.toLocaleString('vi-VN') : '';
  }

  const editEl = document.getElementById('qt-edit-id');
  if (editEl) editEl.value = id;
  const saveBtn = document.getElementById('qt-save-btn');
  if (saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined msi-gap">edit</span>Cập nhật';
  const cancelBtn = document.getElementById('qt-cancel-btn');
  if (cancelBtn) cancelBtn.style.display = '';

  _qtOnCtChange(ctName);
  openDtModal('qt');
}

// ── Xóa mềm Quyết Toán ───────────────────────────────────────
function delQuyetToan(id) {
  if (!confirm('Xóa bản ghi quyết toán này?')) return;
  const idx = quyetToanRecords.findIndex(r => String(r.id) === String(id));
  if (idx < 0) return;
  const now = Date.now();
  quyetToanRecords[idx] = { ...quyetToanRecords[idx], deletedAt: now, updatedAt: now, deviceId: DEVICE_ID, deletedBy: getCurrentUser()?.username || 'Không rõ' };
  save('quyettoan_v1', quyetToanRecords);
  renderKhaiBaoTable(0);
  renderQtTableTk(_qtTkPage);
  _dtRenderDashboardMini();
  if (typeof renderLoiNhuan === 'function') renderLoiNhuan();
  toast('Đã xóa quyết toán', 'success');
}

// ── Render bảng Quyết Toán (THỐNG KÊ — toàn bộ) ──────────────
function renderQtTableTk(page) {
  page = page || 0;
  _qtTkPage = page;
  const tbody  = document.getElementById('qttk-tbody');
  const empty  = document.getElementById('qttk-empty');
  const badge  = document.getElementById('qttk-count-badge');
  const pgWrap = document.getElementById('qttk-pagination');
  if (!tbody) return;

  let filtered = quyetToanRecords
    .filter(r => !r.deletedAt && _dtInYear(r.ngay) && _dtMatchTkProjFilter(r))
    .sort((a, b) => (b.ngay || '').localeCompare(a.ngay || '') || (b.createdAt - a.createdAt));

  if (_dtTkSearch) {
    const q = _dtTkSearch;
    filtered = filtered.filter(r =>
      (_resolveCtName(r) || '').toLowerCase().includes(q) ||
      (r.nguoi || '').toLowerCase().includes(q) ||
      (r.nd || '').toLowerCase().includes(q)
    );
  }

  if (badge) badge.textContent = filtered.length ? `(${filtered.length} mục)` : '';

  if (!filtered.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    if (pgWrap) pgWrap.innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  const total = filtered.length;
  const slice = filtered.slice(page * DT_PG, (page + 1) * DT_PG);

  tbody.innerHTML = slice.map(r => {
    const v = r.giaTri || 0;
    const cls = v < 0 ? 'text-danger' : 'text-success';
    const txt = (v > 0 ? '+' : '') + fmtS(v);
    return `<tr>
      <td class="text-secondary" style="white-space:nowrap;font-size:12px">${fmtISODate(r.ngay)}</td>
      <td style="font-weight:600;white-space:nowrap">${x(_resolveCtName(r))}</td>
      <td class="text-secondary" style="white-space:nowrap">${x(r.nguoi || '—')}</td>
      <td class="text-body-secondary" style="font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(r.nd || '')}">${x(r.nd || '—')}</td>
      <td class="text-end font-monospace fw-bold ${cls}" style="white-space:nowrap">${v ? txt : '—'}</td>
      <td class="action-col">
        <div class="d-flex gap-1 justify-content-center">
          <button class="btn btn-outline-primary btn-sm" title="S&#7917;a"
            onclick="editQuyetToan('${r.id}')"><i class="bi bi-pencil-fill"></i></button>
          <button class="btn btn-outline-danger btn-sm" title="X&#243;a"
            onclick="delQuyetToan('${r.id}')"><i class="bi bi-trash-fill"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  if (pgWrap) pgWrap.innerHTML = _dtPaginationHtml(total, page, 'renderQtTableTk');
}
