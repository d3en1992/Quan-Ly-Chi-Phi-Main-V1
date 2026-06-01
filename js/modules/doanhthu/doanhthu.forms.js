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
  if (btn) btn.textContent = '💾 Lưu';
  const tong = document.getElementById('hdc-tong-label');
  if (tong) tong.textContent = '';
}

// ── Sửa Hợp Đồng Chính ───────────────────────────────────────
function editHopDongChinh(keyId) {
  const hd = hopDongData[keyId];
  if (!hd) return;

  // Resolve keyId → tên CT để hiển thị trên form
  const projs = (typeof projects !== 'undefined') ? projects : [];
  const p = projs.find(proj => proj.id === keyId);
  const ctName = p ? p.name : keyId;

  const ctSel = document.getElementById('hdc-ct-input');
  if (ctSel) ctSel.value = ctName;
  const ngayEl = document.getElementById('hdc-ngay');
  if (ngayEl) ngayEl.value = hd.ngay || '';
  const nguoiSel = document.getElementById('hdc-nguoi');
  if (nguoiSel) nguoiSel.value = recCatName(hd,'hopdong','nguoi') || '';
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
  if (btn) btn.textContent = '✏️ Cập nhật';

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
  hopDongData[keyId] = { ...(hopDongData[keyId] || {}), deletedAt: now, updatedAt: now };
  save('hopdong_v1', hopDongData);
  renderHdcTable(_hdcPage);
  renderDashboard();
  toast('Đã xóa hợp đồng: ' + ctName, 'success');
}

// ── Render bảng Hợp Đồng Chính ────────────────────────────────
function renderHdcTable(page) {
  page = page || 0;
  _hdcPage = page;
  const tbody  = document.getElementById('hdc-tbody');
  const empty  = document.getElementById('hdc-empty');
  const pgWrap = document.getElementById('hdc-pagination');
  if (!tbody) return;

  // Resolve keyId → tên CT cho sắp xếp và hiển thị
  const _allProjs = (typeof projects !== 'undefined') ? projects : [];
  const _resolveCtName = (keyId) => {
    const p = _allProjs.find(proj => proj.id === keyId);
    return p ? p.name : keyId;
  };
  let entries = Object.entries(hopDongData)
    .filter(([keyId, v]) => !v.deletedAt && _dtInYear(v.ngay) && _dtMatchHDCFilter(keyId, v))
    .sort((a, b) => _resolveCtName(a[0]).localeCompare(_resolveCtName(b[0]), 'vi'));

  if (_dtSearch) {
    const q = _dtSearch;
    entries = entries.filter(([keyId, v]) =>
      (_resolveCtName(keyId) || '').toLowerCase().includes(q) ||
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
    const ctName = _resolveCtName(keyId);
    // CĐT hiển thị: ưu tiên project.chuDauTu (đồng bộ realtime), fallback hd.khachHang (legacy)
    const _hdcProjRow = _allProjs.find(pr => !pr.deletedAt && (pr.id === keyId || pr.name === ctName));
    const _cdt = (_hdcProjRow && _hdcProjRow.chuDauTu) ? _hdcProjRow.chuDauTu : (hd.khachHang || '');
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

  if (pgWrap) pgWrap.innerHTML = _dtPaginationHtml(total, page, 'renderHdcTable');
}

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
    renderDashboard();
    _dtRenderDashboardMini();
    toast('✅ Đã ghi nhận thu ' + fmtM(tien) + ' từ ' + ct, 'success');
  }
}

// ── Sửa bản ghi thu tiền (mở modal Thu Tiền) ─────────────────
function editThuRecord(id) {
  const r = thuRecords.find(r => String(r.id) === String(id));
  if (!r) return;

  const ctName = resolveProjectName(r) || r.congtrinh || '';

  // Điền dữ liệu vào form
  const ctSel = document.getElementById('thu-ct-input');
  if (ctSel) ctSel.value = ctName;
  const ngayEl = document.getElementById('thu-ngay');
  if (ngayEl) ngayEl.value = r.ngay || '';
  const nguoiSel = document.getElementById('thu-nguoi');
  if (nguoiSel) nguoiSel.value = recCatName(r,'thu','nguoi') || '';
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
  if (saveBtn) saveBtn.textContent = '✏️ Cập nhật';
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
  if (saveBtn) saveBtn.textContent = '💾 Ghi nhận Thu';
  const cancelBtn = document.getElementById('thu-cancel-btn');
  if (cancelBtn) cancelBtn.style.display = 'none';
}

// ── Xóa mềm bản ghi thu tiền ─────────────────────────────────
function delThuRecord(id) {
  if (!confirm('Xóa bản ghi thu tiền này?')) return;
  const idx = thuRecords.findIndex(r => String(r.id) === String(id));
  if (idx < 0) return;
  const now = Date.now();
  thuRecords[idx] = { ...thuRecords[idx], deletedAt: now, updatedAt: now, deviceId: DEVICE_ID };
  save('thu_v1', thuRecords);
  renderThuTable(_thuPage);
  renderDashboard();
  toast('Đã xóa bản ghi thu tiền', 'success');
}

// ── Render bảng lịch sử thu ───────────────────────────────────
function renderThuTable(page) {
  if (page === undefined) page = _thuPage;
  _thuPage = page;
  const tbody  = document.getElementById('thu-tbody');
  const empty  = document.getElementById('thu-empty');
  const badge  = document.getElementById('thu-count-badge');
  const pgWrap = document.getElementById('thu-pagination');
  if (!tbody) return;

  const _LOAI_BADGE = { tamung: ['Tạm ứng','badge bg-warning text-dark'], giaidoan: ['Giai đoạn','badge bg-info text-dark'], quyettoan: ['Quyết toán','badge bg-success'] };

  let filtered = thuRecords
    .filter(r => !r.deletedAt && inActiveYear(r.ngay) && _dtMatchProjFilter(r))
    .sort((a, b) => b.ngay.localeCompare(a.ngay));

  if (_dtSearch) {
    const q = _dtSearch;
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

  if (pgWrap) pgWrap.innerHTML = _dtPaginationHtml(total, page, 'renderThuTable');
}

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
  if (btn) btn.textContent = '💾 Lưu';
  const tong = document.getElementById('hdtp-tong-label');
  if (tong) tong.textContent = '';
}

// ── Sửa Hợp Đồng Thầu Phụ (mở modal) ────────────────────────
function editHopDongThauPhu(id) {
  const r = thauPhuContracts.find(r => r.id === id);
  if (!r) return;

  const ctName = resolveProjectName(r) || r.congtrinh || '';
  const ctSel = document.getElementById('hdtp-ct-input');
  if (ctSel) ctSel.value = ctName;
  const tpSel = document.getElementById('hdtp-thauphu');
  if (tpSel) tpSel.value = recCatName(r,'thauphu','thauphu') || '';
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
  if (btn) btn.textContent = '✏️ Cập nhật';

  hdtpUpdateTotal();
  openDtModal('hdtp');
}

// ── Xóa mềm Hợp Đồng Thầu Phụ ────────────────────────────────
function delHopDongThauPhu(id) {
  if (!confirm('Xóa hợp đồng thầu phụ này?')) return;
  const idx = thauPhuContracts.findIndex(r => r.id === id);
  if (idx < 0) return;
  const now = Date.now();
  thauPhuContracts[idx] = { ...thauPhuContracts[idx], deletedAt: now, updatedAt: now };
  save('thauphu_v1', thauPhuContracts);
  renderHdtpTable(_hdtpPage);
  toast('Đã xóa hợp đồng thầu phụ', 'success');
}

// ── Render bảng Hợp Đồng Thầu Phụ ────────────────────────────
function renderHdtpTable(page) {
  page = page || 0;
  _hdtpPage = page;
  const tbody  = document.getElementById('hdtp-tbody');
  const empty  = document.getElementById('hdtp-empty');
  const pgWrap = document.getElementById('hdtp-pagination');
  if (!tbody) return;

  let filtered = thauPhuContracts
    .filter(r => !r.deletedAt && _dtInYear(r.ngay) && _dtMatchProjFilter(r))
    .sort((a, b) => b.createdAt - a.createdAt);

  if (_dtSearch) {
    const q = _dtSearch;
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

  if (pgWrap) pgWrap.innerHTML = _dtPaginationHtml(total, page, 'renderHdtpTable');
}
