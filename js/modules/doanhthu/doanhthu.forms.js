// doanhthu.forms.js — Form save/edit/delete and render tables for HĐ Chính, Thu Tiền, HĐ Thầu Phụ
// Load order: sau doanhthu.core.js, trước doanhthu.reports-export.js

// ══ PHẦN 1: HỢP ĐỒNG CHÍNH ════════════════════════════════════

// ── Cập nhật hiển thị Tổng HĐ Chính khi nhập ─────────────────
function hdcUpdateTotal() {
  const tong = _readMoneyInput('hdc-giatri') + _readMoneyInput('hdc-giatriphu') + _readMoneyInput('hdc-phatsinh');
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
  const slEl      = document.getElementById('hdc-sl'); // [ADDED]
  const sl        = slEl && slEl.value !== '' ? parseFloat(slEl.value) : 1; // [ADDED]
  const donGia    = _readMoneyInput('hdc-dongia'); // [ADDED]
  const giaTri    = calcHopDongValue({ sl, donGia, items: _hdcItems }); // [UPDATED]
  const giaTriphu = _readMoneyInput('hdc-giatriphu');
  const phatSinh  = _readMoneyInput('hdc-phatsinh');
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
        giaTri, giaTriphu, phatSinh, nguoi,
        projectId: _hdcPid, sl, donGia, items: [..._hdcItems], // [UPDATED]
        ngay:      ngay || existing.ngay || today(),
        createdAt: existing.createdAt || now,
        updatedAt: now,
        deletedAt: null
      };
      hopDongData[editId] = { ...existing, deletedAt: now, updatedAt: now };
    } else {
      hopDongData[editId] = { ...existing, giaTri, giaTriphu, phatSinh, nguoi, ngay, projectId: _hdcPid, sl, donGia, items: [..._hdcItems], updatedAt: now }; // [UPDATED]
    }
    toast('✅ Đã cập nhật hợp đồng: ' + ct, 'success');
  } else {
    hopDongData[_hdSaveKey] = {
      giaTri, giaTriphu, phatSinh, nguoi,
      projectId: _hdcPid, sl, donGia, items: [..._hdcItems], // [UPDATED]
      ngay, createdAt: now, updatedAt: now, deletedAt: null
    };
    toast('✅ Đã lưu hợp đồng: ' + ct, 'success');
  }

  save('hopdong_v1', hopDongData);
  _hdcResetForm();
  renderHdcTable(0);
  renderDashboard();
}

function _hdcResetForm() {
  // [ADDED]
  _hdcItems = [];
  const slEl = document.getElementById('hdc-sl');
  const dgEl = document.getElementById('hdc-dongia');
  if(slEl) { slEl.value = '1'; slEl.disabled = false; slEl.style.opacity = '1'; }
  if(dgEl) { dgEl.value = ''; dgEl.dataset.raw = ''; dgEl.disabled = false; dgEl.style.opacity = '1'; }
  if(typeof window.renderhdcChiTiet === 'function') window.renderhdcChiTiet();

  ['hdc-giatri','hdc-giatriphu','hdc-phatsinh'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = '';
    if (el.dataset) el.dataset.raw = '';
  });
  const ctSel = document.getElementById('hdc-ct-input');
  if (ctSel) ctSel.value = '';
  const nguoiSel = document.getElementById('hdc-nguoi');
  if (nguoiSel) nguoiSel.value = '';
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

  // Chuyển sang sub KHAI BÁO
  const kbBtn = document.getElementById('dt-sub-khaibao-btn');
  if (kbBtn) dtGoSub(kbBtn, 'dt-sub-khaibao');

  const ctSel = document.getElementById('hdc-ct-input');
  if (ctSel) ctSel.value = ctName;
  const ngayEl = document.getElementById('hdc-ngay');
  if (ngayEl) ngayEl.value = hd.ngay || '';
  const nguoiSel = document.getElementById('hdc-nguoi');
  if (nguoiSel) nguoiSel.value = hd.nguoi || '';

  function _setMoney(elemId, val) {
    const el = document.getElementById(elemId);
    if (!el) return;
    el.dataset.raw = val || 0;
    el.value = val ? parseInt(val).toLocaleString('vi-VN') : '';
  }

  // [ADDED] Load sl, donGia, items
  _hdcItems = Array.isArray(hd.items) ? [...hd.items] : [];
  const slEl = document.getElementById('hdc-sl');
  if (slEl) slEl.value = hd.sl !== undefined ? hd.sl : 1;
  const dG = hd.donGia !== undefined ? hd.donGia : (hd.giaTri || 0);
  _setMoney('hdc-dongia', dG);
  if(typeof window.renderhdcChiTiet === 'function') window.renderhdcChiTiet();
  if(typeof window.hdcCalcAuto === 'function') window.hdcCalcAuto();

  _setMoney('hdc-giatri',    hd.giaTri    || 0);
  _setMoney('hdc-giatriphu', hd.giaTriphu || 0);
  _setMoney('hdc-phatsinh',  hd.phatSinh  || 0);

  const editEl = document.getElementById('hdc-edit-id');
  if (editEl) editEl.value = keyId;
  const btn = document.getElementById('hdc-save-btn');
  if (btn) btn.textContent = '✏️ Cập nhật';

  hdcUpdateTotal();
  document.getElementById('hdc-ct-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  const entries = Object.entries(hopDongData)
    .filter(([keyId, v]) => !v.deletedAt && _dtInYear(v.ngay) && _dtMatchHDCFilter(keyId, v))
    .sort((a, b) => _resolveCtName(a[0]).localeCompare(_resolveCtName(b[0]), 'vi'));

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
    const tong = (hd.giaTri || 0) + (hd.giaTriphu || 0) + (hd.phatSinh || 0);
    return `<tr>
      <td style="text-align:center;padding:4px 6px"><input type="checkbox" class="hdc-row-chk" data-id="${x(keyId)}"></td>
      <td class="text-body-secondary" style="white-space:nowrap;font-size:12px">${fmtISODate(hd.ngay)}</td>
      <td style="font-weight:600;white-space:nowrap">${x(ctName)}</td>
      <td class="text-end font-monospace" style="white-space:nowrap">${hd.giaTri ? fmtS(hd.giaTri) : '<span class="text-body-secondary">—</span>'}</td>
      <td class="text-end font-monospace" style="white-space:nowrap">${hd.giaTriphu ? fmtS(hd.giaTriphu) : '<span class="text-body-secondary">—</span>'}</td>
      <td class="text-end font-monospace" style="white-space:nowrap">${hd.phatSinh ? fmtS(hd.phatSinh) : '<span class="text-body-secondary">—</span>'}</td>
      <td class="text-end font-monospace fw-bold text-warning" style="white-space:nowrap">${tong ? fmtS(tong) : '—'}</td>
      <td style="padding:4px">
        <button class="btn btn-outline-primary btn-sm" title="Sửa"
          onclick="editHopDongChinh(this.dataset.ct)" data-ct="${x(keyId)}"><i class="bi bi-pencil-fill"></i></button>
      </td>
      <td style="padding:4px">
        <button class="btn btn-outline-danger btn-sm" title="Xóa"
          onclick="delHopDongChinh(this.dataset.ct)" data-ct="${x(keyId)}"><i class="bi bi-trash-fill"></i></button>
      </td>
    </tr>`;
  }).join('');

  if (pgWrap) pgWrap.innerHTML = _dtPaginationHtml(total, page, 'renderHdcTable');
}

// ══ PHẦN 2: GHI NHẬN THU TIỀN ═════════════════════════════════

// ── Lưu / Cập nhật bản ghi thu tiền ─────────────────────────
function saveThuRecord() {
  const ct    = document.getElementById('thu-ct-input')?.value.trim();
  const ngay  = document.getElementById('thu-ngay')?.value;
  const tien  = _readMoneyInput('thu-tien');
  const nguoi = (document.getElementById('thu-nguoi')?.value || '').trim().toUpperCase();
  const nd    = document.getElementById('thu-nd')?.value.trim() || '';
  const editId = document.getElementById('thu-edit-id')?.value || '';

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
      thuRecords[idx] = mkUpdate(thuRecords[idx], { ngay, congtrinh: ct, projectId: _thuPid, tien, nguoi, nd });
    }
    save('thu_v1', thuRecords);
    _thuResetForm();
    renderThuTable(_thuPage);
    renderDashboard();
    toast('✅ Đã cập nhật thu tiền: ' + fmtM(tien) + ' — ' + ct, 'success');
  } else {
    // Tạo mới
    thuRecords.unshift(mkRecord({ ngay, congtrinh: ct, projectId: _thuPid, tien, nguoi, nd }));
    save('thu_v1', thuRecords);

    // Reset form nhẹ: chỉ xóa tiền, người, nội dung — giữ ct và ngày
    const tienEl = document.getElementById('thu-tien');
    if (tienEl) { tienEl.value = ''; tienEl.dataset.raw = ''; }
    const nguoiEl = document.getElementById('thu-nguoi');
    if (nguoiEl) nguoiEl.value = '';
    const ndEl = document.getElementById('thu-nd');
    if (ndEl) ndEl.value = '';

    renderThuTable(0);
    renderDashboard();
    toast('✅ Đã ghi nhận thu ' + fmtM(tien) + ' từ ' + ct, 'success');
  }
}

// ── Sửa bản ghi thu tiền (tải vào form KHAI BÁO) ─────────────
function editThuRecord(id) {
  const r = thuRecords.find(r => String(r.id) === String(id));
  if (!r) return;

  // Chuyển sang sub KHAI BÁO
  const kbBtn = document.getElementById('dt-sub-khaibao-btn');
  if (kbBtn) dtGoSub(kbBtn, 'dt-sub-khaibao');

  // Điền dữ liệu vào form
  const ctSel = document.getElementById('thu-ct-input');
  if (ctSel) ctSel.value = resolveProjectName(r) || r.congtrinh || ''; // [MODIFIED]
  const ngayEl = document.getElementById('thu-ngay');
  if (ngayEl) ngayEl.value = r.ngay || '';
  const nguoiSel = document.getElementById('thu-nguoi');
  if (nguoiSel) nguoiSel.value = r.nguoi || '';
  const ndEl = document.getElementById('thu-nd');
  if (ndEl) ndEl.value = r.nd || '';

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

  document.getElementById('thu-ct-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  const editEl = document.getElementById('thu-edit-id');
  if (editEl) editEl.value = '';
  const saveBtn = document.getElementById('thu-save-btn');
  if (saveBtn) saveBtn.textContent = '+ Ghi nhận Thu';
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

  const filtered = thuRecords
    .filter(r => !r.deletedAt && inActiveYear(r.ngay) && _dtMatchProjFilter(r))
    .sort((a, b) => b.ngay.localeCompare(a.ngay));

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

  tbody.innerHTML = slice.map(r => `
    <tr>
      <td style="text-align:center;padding:4px 6px"><input type="checkbox" class="thu-row-chk" data-id="${r.id}"></td>
      <td class="text-secondary" style="white-space:nowrap;font-size:12px">${fmtISODate(r.ngay)}</td>
      <td style="font-weight:600;white-space:nowrap">${x(_resolveCtName(r))}</td>
      <td class="text-end font-monospace fw-semibold text-success" style="white-space:nowrap">${fmtM(r.tien)}</td>
      <td class="text-secondary">${x(r.nguoi || '—')}</td>
      <td class="text-body-secondary" style="font-size:12px">${x(r.nd || '—')}</td>
      <td style="padding:4px">
        <button class="btn btn-outline-primary btn-sm" title="Sửa"
          onclick="editThuRecord('${r.id}')"><i class="bi bi-pencil-fill"></i></button>
      </td>
      <td style="padding:4px">
        <button class="btn btn-outline-danger btn-sm" title="Xóa"
          onclick="delThuRecord('${r.id}')"><i class="bi bi-trash-fill"></i></button>
      </td>
    </tr>`).join('');

  if (pgWrap) pgWrap.innerHTML = _dtPaginationHtml(total, page, 'renderThuTable');
}

// ══ PHẦN 3: HỢP ĐỒNG THẦU PHỤ ════════════════════════════════

// ── Cập nhật hiển thị Tổng HĐ Thầu Phụ khi nhập ─────────────
function hdtpUpdateTotal() {
  const tong = _readMoneyInput('hdtp-giatri') + _readMoneyInput('hdtp-phatsinh');
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
  const slEl     = document.getElementById('hdtp-sl'); // [ADDED]
  const sl       = slEl && slEl.value !== '' ? parseFloat(slEl.value) : 1; // [ADDED]
  const donGia   = _readMoneyInput('hdtp-dongia'); // [ADDED]
  const giaTri   = calcHopDongValue({ sl, donGia, items: _hdtpItems }); // [UPDATED]
  const phatSinh = _readMoneyInput('hdtp-phatsinh');
  const nd       = document.getElementById('hdtp-nd')?.value.trim() || '';
  const editId   = document.getElementById('hdtp-edit-id')?.value || '';

  _dtAddCT(ct);
  _dtAddTP(tp);
  const now = Date.now();
  const _hdtpProj = projects.find(p => p.name === ct) || null;
  const _hdtpPid  = _hdtpProj ? _hdtpProj.id : null;

  if (editId) {
    const idx = thauPhuContracts.findIndex(r => r.id === editId);
    if (idx >= 0) {
      thauPhuContracts[idx] = mkUpdate(thauPhuContracts[idx], { ngay, congtrinh: ct, projectId: _hdtpPid, thauphu: tp, giaTri, phatSinh, nd, sl, donGia, items: [..._hdtpItems] }); // [UPDATED]
    }
    toast('✅ Đã cập nhật HĐ thầu phụ', 'success');
  } else {
    thauPhuContracts.unshift(mkRecord({ ngay, congtrinh: ct, projectId: _hdtpPid, thauphu: tp, giaTri, phatSinh, nd, sl, donGia, items: [..._hdtpItems] })); // [UPDATED]
    toast('✅ Đã lưu HĐ thầu phụ: ' + tp + ' — ' + ct, 'success');
  }

  save('thauphu_v1', thauPhuContracts);
  _hdtpResetForm();
  renderHdtpTable(0);
}

function _hdtpResetForm() {
  // [ADDED]
  _hdtpItems = [];
  const slEl = document.getElementById('hdtp-sl');
  const dgEl = document.getElementById('hdtp-dongia');
  if(slEl) { slEl.value = '1'; slEl.disabled = false; slEl.style.opacity = '1'; }
  if(dgEl) { dgEl.value = ''; dgEl.dataset.raw = ''; dgEl.disabled = false; dgEl.style.opacity = '1'; }
  if(typeof window.renderhdtpChiTiet === 'function') window.renderhdtpChiTiet();

  ['hdtp-giatri','hdtp-phatsinh','hdtp-nd'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = '';
    if (el.dataset) el.dataset.raw = '';
  });
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

// ── Sửa Hợp Đồng Thầu Phụ ────────────────────────────────────
function editHopDongThauPhu(id) {
  const r = thauPhuContracts.find(r => r.id === id);
  if (!r) return;

  // Chuyển sang sub KHAI BÁO
  const kbBtn = document.getElementById('dt-sub-khaibao-btn');
  if (kbBtn) dtGoSub(kbBtn, 'dt-sub-khaibao');

  const ctSel = document.getElementById('hdtp-ct-input');
  if (ctSel) ctSel.value = r.congtrinh || '';
  const tpSel = document.getElementById('hdtp-thauphu');
  if (tpSel) tpSel.value = r.thauphu || '';
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

  // [ADDED] Load sl, donGia, items
  _hdtpItems = Array.isArray(r.items) ? [...r.items] : [];
  const slEl = document.getElementById('hdtp-sl');
  if (slEl) slEl.value = r.sl !== undefined ? r.sl : 1;
  const dG = r.donGia !== undefined ? r.donGia : (r.giaTri || 0);
  _setMoney('hdtp-dongia', dG);
  if(typeof window.renderhdtpChiTiet === 'function') window.renderhdtpChiTiet();
  if(typeof window.hdtpCalcAuto === 'function') window.hdtpCalcAuto();

  _setMoney('hdtp-giatri',   r.giaTri   || 0);
  _setMoney('hdtp-phatsinh', r.phatSinh || 0);

  const editEl = document.getElementById('hdtp-edit-id');
  if (editEl) editEl.value = id;
  const btn = document.getElementById('hdtp-save-btn');
  if (btn) btn.textContent = '✏️ Cập nhật';

  hdtpUpdateTotal();
  document.getElementById('hdtp-ct-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  const filtered = thauPhuContracts
    .filter(r => !r.deletedAt && _dtInYear(r.ngay) && _dtMatchProjFilter(r))
    .sort((a, b) => b.createdAt - a.createdAt);

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
      <td style="white-space:nowrap">${x(r.thauphu)}</td>
      <td class="text-secondary" style="font-size:12px;min-width:90px">${x(r.nd || '—')}</td>
      <td class="text-end font-monospace" style="white-space:nowrap">${r.giaTri ? fmtS(r.giaTri) : '<span class="text-body-secondary">—</span>'}</td>
      <td class="text-end font-monospace" style="white-space:nowrap">${r.phatSinh ? fmtS(r.phatSinh) : '<span class="text-body-secondary">—</span>'}</td>
      <td class="text-end font-monospace fw-bold text-warning" style="white-space:nowrap">${tong ? fmtS(tong) : '—'}</td>
      <td style="padding:4px">
        <button class="btn btn-outline-primary btn-sm" title="Sửa"
          onclick="editHopDongThauPhu('${r.id}')"><i class="bi bi-pencil-fill"></i></button>
      </td>
      <td style="padding:4px">
        <button class="btn btn-outline-danger btn-sm" title="Xóa"
          onclick="delHopDongThauPhu('${r.id}')"><i class="bi bi-trash-fill"></i></button>
      </td>
    </tr>`;
  }).join('');

  if (pgWrap) pgWrap.innerHTML = _dtPaginationHtml(total, page, 'renderHdtpTable');
}
