// doanhthu.forms.js — Form lưu/sửa/xóa + vẽ bảng cho tab DOANH THU
// Load order: sau doanhthu.core.js, trước doanhthu.reports-export.js
//
// (03/10/2026) BỐ CỤC MỚI — 2 subtab, form nằm thẳng trên màn hình (không còn popup):
//   SUBTAB HỢP ĐỒNG CHÍNH (#dt-sub-hdc)
//     [1] Form khai báo HĐ ............ saveHopDongChinh / editHopDongChinh / _hdcResetForm
//     [2] Khai Báo Gần Đây ............ renderHdcRecent()   — HĐ vừa tạo/sửa gần nhất
//     [3] Danh Sách HĐ + bộ lọc ....... renderHdcTableTk()  — lọc CT / người TH / tìm kiếm
//   SUBTAB THU TIỀN (#dt-sub-thu)
//     [1] Form ghi nhận thu ........... saveThuRecord / editThuRecord / _thuResetForm
//     [2] Lịch Sử Thu Tiền (sổ quỹ) ... renderThuTableTk()  — tìm theo số tiền, ngày, CT...
//     [3] Tiến Độ Thu Theo Công Trình . renderThuTienDo()   — bấm dòng để xổ chi tiết các đợt thu

// ── Định dạng thời điểm tạo/sửa (timestamp) → "dd-mm-yyyy hh:mm" (VD "01-10-2026 16:29") ──
// (03/10/2026) Đồng bộ dấu gạch ngang với các cột ngày khác (fmtISODate mặc định "dd-mm-yyyy");
// bỏ cách ghi "Hôm nay / Hôm qua" — dòng vừa lưu đã có nhãn "Vừa lưu" riêng.
function _dtFmtTs(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  const p2 = n => String(n).padStart(2, '0');
  return p2(d.getDate()) + '-' + p2(d.getMonth() + 1) + '-' + d.getFullYear() + ' ' +
         p2(d.getHours()) + ':' + p2(d.getMinutes());
}

// ── Tên công trình từ key của hopDongData (key = projectId, đời cũ = tên CT) ──
function _dtHdcCtName(keyId) {
  const p = (typeof projects !== 'undefined' ? projects : []).find(pr => pr.id === keyId);
  return p ? p.name : keyId;
}

// ── Chủ đầu tư của HĐ: ưu tiên project.chuDauTu, fallback hd.khachHang (đời cũ) ──
function _dtHdcCdt(keyId, hd) {
  const ctName = _dtHdcCtName(keyId);
  const proj = (typeof projects !== 'undefined' ? projects : [])
    .find(pr => !pr.deletedAt && (pr.id === keyId || pr.name === ctName));
  return (proj && proj.chuDauTu) ? proj.chuDauTu : (hd.khachHang || '');
}

// ── Tổng giá trị 1 HĐ chính = HĐ chính + HĐ phụ + phát sinh (đời cũ) ──
function _dtHdcTong(hd) {
  return (hd.giaTri || 0) + (hd.giaTriphu || 0) + (hd.phatSinh || 0);
}

// ── 2 nút Sửa / Xóa HĐ chính (key truyền qua data-ct để an toàn với tên có dấu nháy) ──
function _dtHdcActions(keyId) {
  return `<div class="d-flex gap-1 justify-content-center">
    <button class="btn btn-outline-primary btn-sm" title="Sửa" onclick="editHopDongChinh(this.dataset.ct)" data-ct="${x(keyId)}"><i class="bi bi-pencil-fill"></i></button>
    <button class="btn btn-outline-danger btn-sm" title="Xóa" onclick="delHopDongChinh(this.dataset.ct)" data-ct="${x(keyId)}"><i class="bi bi-trash-fill"></i></button>
  </div>`;
}

// ── 2 nút Sửa / Xóa phiếu thu (truyền cả bản ghi) ──
// Phiếu TỰ ĐỘNG từ quyết toán → KHÔNG có nút, chỉ hiện biểu tượng khóa (03/10/2026).
function _dtThuActions(r) {
  if (_dtIsAutoThu(r)) {
    return `<div class="text-center text-secondary" title="Phiếu thu tự động từ quyết toán — không sửa/xóa được.&#10;Muốn thay đổi: sửa bản quyết toán ở tab QUYẾT TOÁN (bỏ tick &quot;Ghi nhận phiếu thu tiền còn lại&quot; để gỡ phiếu).">
      <span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle">lock</span>
    </div>`;
  }
  const id = r.id;
  return `<div class="d-flex gap-1 justify-content-center">
    <button class="btn btn-outline-primary btn-sm" title="Sửa" onclick="editThuRecord('${x(id)}')"><i class="bi bi-pencil-fill"></i></button>
    <button class="btn btn-outline-danger btn-sm" title="Xóa" onclick="delThuRecord('${x(id)}')"><i class="bi bi-trash-fill"></i></button>
  </div>`;
}

// ── Badge Loại khoản thu (Tạm ứng / Giai đoạn / Quyết toán / Khác) ──
// r: bản ghi thu (hoặc chuỗi mã loaiThu — tương thích cách gọi cũ). Phiếu tự động → thêm nhãn "Tự động".
function _dtLoaiThuBadge(r, fontSize) {
  const rec = (r && typeof r === 'object') ? r : { loaiThu: r };
  const fs = fontSize || 11;
  const lb = DT_LOAI_THU[rec.loaiThu];
  const auto = _dtIsAutoThu(rec)
    ? ` <span class="badge bg-secondary-subtle text-secondary-emphasis border" style="font-size:${fs - 1}px" title="Hệ thống tự sinh khi lưu quyết toán (tiền còn phải thu)"><span class="material-symbols-outlined" style="font-size:${fs + 1}px;vertical-align:-2px">bolt</span>Tự động</span>` : '';
  if (!lb) return auto || '<span class="text-body-secondary">—</span>';
  return `<span class="${lb[1]}" style="font-size:${fs}px">${lb[0]}</span>${auto}`;
}

// ── Đặt giá trị dropdown "Loại khoản thu" — giữ được mã KHÔNG còn trong danh sách ──
// (03/10/2026) "Quyết toán" đã gỡ khỏi dropdown; sửa 1 phiếu cũ nhập tay loại này thì thêm TẠM
// 1 option "(loại cũ)" để lưu lại không bị mất loại. Option tạm bị gỡ ở lần đặt giá trị kế tiếp.
function _thuSetLoaiThu(val) {
  const sel = document.getElementById('thu-loaithu');
  if (!sel) return;
  sel.querySelectorAll('option[data-legacy]').forEach(o => o.remove());
  if (val && ![...sel.options].some(o => o.value === val)) {
    const o = document.createElement('option');
    o.value = val;
    o.dataset.legacy = '1';
    o.textContent = (DT_LOAI_THU[val] ? DT_LOAI_THU[val][0] : val) + ' (loại cũ)';
    sel.appendChild(o);
  }
  sel.value = val || '';
}

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
  if (el) el.textContent = tong ? 'Tổng HĐ: ' + fmtM(tong) : '';
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

  // [CHỐNG GHI ĐÈ NHẦM] Mỗi công trình chỉ có 1 HĐ chính (key = projectId).
  // Form nay luôn nằm trên màn hình → dễ khai báo trùng; hỏi lại trước khi đè HĐ đang có.
  const _hdDangCo = hopDongData[_hdSaveKey];
  if (_hdSaveKey !== editId && _hdDangCo && !_hdDangCo.deletedAt) {
    if (!confirm('Công trình "' + ct + '" đã có Hợp đồng chính (' + fmtM(_dtHdcTong(_hdDangCo)) + ').\n' +
                 'Lưu sẽ GHI ĐÈ hợp đồng cũ. Tiếp tục?')) return;
  }

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
  _dtHdcLastKey = _hdSaveKey;   // tô sáng dòng vừa lưu ở 2 bảng bên dưới
  _hdcResetForm();
  dtRenderAll();                // 3 thẻ + bảng HĐ + bảng Tiến Độ Thu (giá trị HĐ đổi)
  renderDashboard();
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
  const tong = document.getElementById('hdc-tong-label');
  if (tong) tong.textContent = '';
  _dtSetEditing('hdc', false);  // bỏ viền vàng / nhãn "Đang sửa", nút về "Lưu"
}

// ── Hủy chỉnh sửa HĐ chính (nút "Hủy sửa" trên form) ─────────
function _hdcCancelEdit() {
  _hdcResetForm();
  toast('Đã hủy chỉnh sửa', '');
}

// ── Sửa Hợp Đồng Chính → nạp vào form ngay trên màn hình ─────
function editHopDongChinh(keyId) {
  const hd = hopDongData[keyId];
  if (!hd) return;

  // Rebuild options từ danh mục hiện hành trước khi set giá trị (tránh dropdown trắng khi đổi tên)
  _dtFillSelects();

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
  if (khEl) khEl.value = _dtHdcCdt(keyId, hd);
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

  hdcUpdateTotal();
  _dtSetEditing('hdc', true);
  dtShowSub('dt-sub-hdc');                  // đang ở subtab khác → chuyển về HỢP ĐỒNG CHÍNH
  _dtFocusForm('hdc-form-card', 'hdc-giatri');
}

// ── Xóa mềm Hợp Đồng Chính ───────────────────────────────────
function delHopDongChinh(keyId) {
  const ctName = _dtHdcCtName(keyId);
  if (!confirm('Xóa hợp đồng của ' + ctName + '?')) return;
  const now = Date.now();
  hopDongData[keyId] = { ...(hopDongData[keyId] || {}), deletedAt: now, updatedAt: now, deletedBy: getCurrentUser()?.username || 'Không rõ' };
  save('hopdong_v1', hopDongData);
  // Đang sửa đúng HĐ vừa xóa → đưa form về trạng thái nhập mới
  if (document.getElementById('hdc-edit-id')?.value === keyId) _hdcResetForm();
  if (_dtHdcLastKey === keyId) _dtHdcLastKey = '';
  dtRenderAll();
  renderDashboard();
  toast('Đã xóa hợp đồng: ' + ctName, 'success');
}

// ── Vẽ 2 bảng của subtab HỢP ĐỒNG CHÍNH ──────────────────────
// (Tên hàm giữ nguyên để các nơi gọi sẵn — main.js, đổi năm, sync — vẫn chạy.)
function renderHdcTable() {
  dtPopulateCtFilter();         // bộ lọc CT / Người TH luôn có option mới nhất
  renderHdcRecent();
  renderHdcTableTk(_hdcTkPage);
}

// ── [KHU VỰC 2] KHAI BÁO GẦN ĐÂY — DT_HDC_RECENT hợp đồng vừa tạo/sửa gần nhất ──
// Sắp theo thời điểm cập nhật (updatedAt), KHÔNG lọc năm: mục đích là đối chiếu
// ngay cái vừa nhập, kể cả khi ngày HĐ thuộc năm khác năm đang xem.
function renderHdcRecent() {
  const tbody = document.getElementById('hdc-recent-tbody');
  const empty = document.getElementById('hdc-recent-empty');
  if (!tbody) return;

  const list = Object.entries(hopDongData)
    .filter(([, hd]) => hd && !hd.deletedAt)
    .sort((a, b) => (b[1].updatedAt || b[1].createdAt || 0) - (a[1].updatedAt || a[1].createdAt || 0))
    .slice(0, DT_HDC_RECENT);

  if (!list.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  tbody.innerHTML = list.map(([keyId, hd]) => {
    const tong = _dtHdcTong(hd);
    const isNew = keyId === _dtHdcLastKey;
    return `<tr class="${isNew ? 'dt-row-new' : ''}">
      <td class="text-body-secondary" style="white-space:nowrap;font-size:12px">${_dtFmtTs(hd.updatedAt || hd.createdAt)}${isNew ? ' <span class="badge bg-warning text-dark" style="font-size:9px">Vừa lưu</span>' : ''}</td>
      <td class="text-body-secondary" style="white-space:nowrap;font-size:12px">${fmtISODate(hd.ngay)}</td>
      <td style="font-weight:600;white-space:nowrap">${x(_dtHdcCtName(keyId))}</td>
      <td class="text-secondary" style="white-space:nowrap">${x(recCatName(hd, 'hopdong', 'nguoi') || '—')}</td>
      <td class="text-end font-monospace fw-semibold text-warning" style="white-space:nowrap">${tong ? fmtM(tong) : '—'}</td>
      <td class="text-body-secondary" style="font-size:12px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(hd.nd || '')}">${x(hd.nd || '—')}</td>
      <td class="action-col">${_dtHdcActions(keyId)}</td>
    </tr>`;
  }).join('');
}

// ── [KHU VỰC 3] DANH SÁCH & THỐNG KÊ HỢP ĐỒNG CHÍNH (năm đang lọc) ──
// Bộ lọc: Công trình (_dtTkCtFilter) · Người TH (_dtHdcNguoiFilter) · Tìm kiếm (_dtTkSearch)
function renderHdcTableTk(page) {
  page = page || 0;
  _hdcTkPage = page;
  const tbody  = document.getElementById('hdctk-tbody');
  const empty  = document.getElementById('hdctk-empty');
  const pgWrap = document.getElementById('hdctk-pagination');
  const badge  = document.getElementById('hdctk-count-badge');
  const sumEl  = document.getElementById('hdctk-sum');
  if (!tbody) return;

  // Sắp xếp: ngày mới nhất lên đầu (DESC), tie-break theo thời điểm cập nhật/tạo
  let entries = Object.entries(hopDongData)
    .filter(([keyId, v]) => !v.deletedAt && _dtInYear(v.ngay) && _dtMatchTkHDCFilter(keyId, v))
    .sort((a, b) => (b[1].ngay || '').localeCompare(a[1].ngay || '')
      || ((b[1].updatedAt || b[1].createdAt || 0) - (a[1].updatedAt || a[1].createdAt || 0)));

  if (_dtHdcNguoiFilter) {
    entries = entries.filter(([, v]) => recCatName(v, 'hopdong', 'nguoi') === _dtHdcNguoiFilter);
  }

  if (_dtTkSearch) {
    const q = _dtTkSearch;
    entries = entries.filter(([keyId, v]) =>
      (_dtHdcCtName(keyId) || '').toLowerCase().includes(q) ||
      (_dtHdcCdt(keyId, v) || '').toLowerCase().includes(q) ||
      (recCatName(v, 'hopdong', 'nguoi') || '').toLowerCase().includes(q) ||
      (v.nd || '').toLowerCase().includes(q)
    );
  }

  // Thống kê nhanh theo bộ lọc hiện tại: số HĐ + tổng giá trị
  const tongAll = entries.reduce((s, [, v]) => s + _dtHdcTong(v), 0);
  if (badge) badge.textContent = entries.length ? `(${entries.length} hợp đồng)` : '';
  if (sumEl) sumEl.innerHTML = entries.length
    ? `Tổng giá trị: <b class="text-warning font-monospace">${fmtM(tongAll)}</b>` : '';

  if (!entries.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    if (pgWrap) pgWrap.innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  // Trang hiện tại vượt quá số trang (VD: vừa xóa dòng cuối) → lùi về trang cuối
  const maxPage = Math.max(0, Math.ceil(entries.length / DT_PG) - 1);
  if (page > maxPage) { page = maxPage; _hdcTkPage = page; }
  const slice = entries.slice(page * DT_PG, (page + 1) * DT_PG);

  tbody.innerHTML = slice.map(([keyId, hd]) => {
    const tong = _dtHdcTong(hd);
    const cdt  = _dtHdcCdt(keyId, hd);
    return `<tr class="${keyId === _dtHdcLastKey ? 'dt-row-new' : ''}">
      <td style="text-align:center;padding:4px 6px"><input type="checkbox" class="hdc-row-chk" data-id="${x(keyId)}"></td>
      <td class="text-body-secondary" style="white-space:nowrap;font-size:12px">${fmtISODate(hd.ngay)}</td>
      <td style="font-weight:600;white-space:nowrap">${x(_dtHdcCtName(keyId))}</td>
      <td class="text-body-secondary" style="font-size:12px;white-space:nowrap">${x(cdt || '—')}</td>
      <td class="text-secondary" style="font-size:12px;white-space:nowrap">${x(recCatName(hd, 'hopdong', 'nguoi') || '—')}</td>
      <td class="text-end font-monospace" style="white-space:nowrap">${hd.giaTri ? fmtS(hd.giaTri) : '<span class="text-body-secondary">—</span>'}</td>
      <td class="text-end font-monospace" style="white-space:nowrap">${hd.giaTriphu ? fmtS(hd.giaTriphu) : '<span class="text-body-secondary">—</span>'}</td>
      <td class="text-end font-monospace fw-bold text-warning" style="white-space:nowrap" title="${tong ? fmtM(tong) : ''}">${tong ? fmtS(tong) : '—'}</td>
      <td class="text-body-secondary" style="font-size:12px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(hd.nd || '')}">${x(hd.nd || '—')}</td>
      <td class="action-col">${_dtHdcActions(keyId)}</td>
    </tr>`;
  }).join('');

  if (pgWrap) pgWrap.innerHTML = _dtPaginationHtml(entries.length, page, 'renderHdcTableTk');
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

  // Chỉ cho phép CT đã tồn tại (hoặc hạng mục CÔNG TY — thu không thuộc dự án nào)
  const _thuProjExists = (typeof getAllProjects === 'function') &&
    (ct === 'CÔNG TY' || getAllProjects().some(p => p.id !== 'COMPANY' && p.name === ct));
  if (!_thuProjExists) {
    toast('Chỉ được tạo công trình tại tab Công Trình', 'error');
    return;
  }

  _dtAddCT(ct);
  const _thuProj = projects.find(p => p.name === ct) || null;
  const _thuPid  = ct === 'CÔNG TY' ? 'COMPANY' : (_thuProj ? _thuProj.id : null);

  if (editId) {
    // Cập nhật record hiện có
    const idx = thuRecords.findIndex(r => String(r.id) === String(editId));
    // Chặn cứng: phiếu tự động từ quyết toán không được sửa (phòng trường hợp form bị nạp nhầm)
    if (idx >= 0 && _dtIsAutoThu(thuRecords[idx])) {
      toast('Phiếu thu tự động từ quyết toán — không sửa được. Hãy sửa ở tab Quyết Toán.', 'error');
      return;
    }
    if (idx >= 0) {
      thuRecords[idx] = mkUpdate(thuRecords[idx], { ngay, congtrinh: ct, projectId: _thuPid, tien, nguoi, nd, loaiThu });
    }
    save('thu_v1', thuRecords);
    _dtThuLastId = editId;
    _thuResetForm();
    dtRenderAll();
    renderDashboard();
    toast('✅ Đã cập nhật thu tiền: ' + fmtM(tien) + ' — ' + ct, 'success');
  } else {
    // Tạo mới
    const rec = mkRecord({ ngay, congtrinh: ct, projectId: _thuPid, tien, nguoi, nd, loaiThu });
    thuRecords.unshift(rec);
    save('thu_v1', thuRecords);
    _dtThuLastId = rec.id;
    _thuTkPage = 0;   // về trang đầu sổ quỹ để thấy khoản vừa thu

    // Reset form nhẹ: chỉ xóa tiền, người, nội dung, loại — GIỮ công trình và ngày
    // (thường nhập liên tiếp nhiều đợt cho cùng 1 công trình)
    const tienEl = document.getElementById('thu-tien');
    if (tienEl) { tienEl.value = ''; tienEl.dataset.raw = ''; }
    const nguoiEl = document.getElementById('thu-nguoi');
    if (nguoiEl) nguoiEl.value = '';
    const ndEl = document.getElementById('thu-nd');
    if (ndEl) ndEl.value = '';
    _thuSetLoaiThu('');

    dtRenderAll();
    _thuOnCtChange(ct);   // dải "Đã thu / Còn lại" của CT đang chọn nhảy số mới
    renderDashboard();
    toast('✅ Đã ghi nhận thu ' + fmtM(tien) + ' từ ' + ct, 'success');
  }
}

// ── Sửa bản ghi thu tiền → nạp vào form ngay trên màn hình ───
function editThuRecord(id) {
  const r = thuRecords.find(r => String(r.id) === String(id));
  if (!r) return;
  if (_dtIsAutoThu(r)) {
    toast('Phiếu thu tự động từ quyết toán — không sửa được. Hãy sửa ở tab Quyết Toán.', 'error');
    return;
  }

  // Rebuild options từ danh mục hiện hành trước khi set giá trị (tránh dropdown trắng khi đổi tên)
  _dtFillSelects();

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
  _thuSetLoaiThu(r.loaiThu || '');   // phiếu cũ loại "Quyết toán" → giữ bằng option tạm

  // Điền tiền
  const tienEl = document.getElementById('thu-tien');
  if (tienEl) {
    tienEl.dataset.raw = r.tien || 0;
    tienEl.value = r.tien ? parseInt(r.tien).toLocaleString('vi-VN') : '';
  }

  const editEl = document.getElementById('thu-edit-id');
  if (editEl) editEl.value = id;

  _thuOnCtChange(ctName);
  _dtSetEditing('thu', true);
  dtShowSub('dt-sub-thu');
  _dtFocusForm('thu-form-card', 'thu-tien');
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
  _thuSetLoaiThu('');
  const progInfo = document.getElementById('thu-progress-info');
  if (progInfo) progInfo.style.display = 'none';
  const editEl = document.getElementById('thu-edit-id');
  if (editEl) editEl.value = '';
  _dtSetEditing('thu', false);
}

// ── Xóa mềm bản ghi thu tiền ─────────────────────────────────
function delThuRecord(id) {
  const idx = thuRecords.findIndex(r => String(r.id) === String(id));
  if (idx < 0) return;
  if (_dtIsAutoThu(thuRecords[idx])) {
    toast('Phiếu thu tự động từ quyết toán — không xóa được ở đây. Bỏ tick "Ghi nhận phiếu thu tiền còn lại" ở tab Quyết Toán để gỡ.', 'error');
    return;
  }
  if (!confirm('Xóa bản ghi thu tiền này?')) return;
  const now = Date.now();
  thuRecords[idx] = { ...thuRecords[idx], deletedAt: now, updatedAt: now, deviceId: DEVICE_ID, deletedBy: getCurrentUser()?.username || 'Không rõ' };
  save('thu_v1', thuRecords);
  // Đang sửa đúng phiếu vừa xóa → đưa form về trạng thái nhập mới
  if (document.getElementById('thu-edit-id')?.value === String(id)) _thuResetForm();
  if (_dtThuLastId === String(id)) _dtThuLastId = '';
  dtRenderAll();
  renderDashboard();
  toast('Đã xóa bản ghi thu tiền', 'success');
}

// ── Vẽ 2 bảng của subtab THU TIỀN ────────────────────────────
// (Tên hàm giữ nguyên để main.js gọi sẵn vẫn chạy.)
function renderThuTable() {
  dtPopulateThuCtFilter();      // dropdown "Chọn công trình" của Lịch Sử Thu Tiền luôn mới nhất
  renderThuTableTk(_thuTkPage);
  renderThuTienDo(_thuTdPage);
}

// ── Tìm kiếm trong sổ quỹ: CT, người, ghi chú, loại, NGÀY, SỐ TIỀN ──
// • Ngày: gõ "15/09", "15-09-2026" hoặc "2026-09-15" đều khớp
// • Số tiền: gõ "50.000.000" hoặc "50000000" → bỏ dấu chấm/phẩy rồi so chuỗi số
function _dtThuMatchSearch(r, q) {
  if (!q) return true;
  const texts = [
    _resolveCtName(r),
    recCatName(r, 'thu', 'nguoi'),
    r.nd,
    DT_LOAI_THU[r.loaiThu] ? DT_LOAI_THU[r.loaiThu][0] : '',
    fmtISODate(r.ngay, '', '/'),
    fmtISODate(r.ngay, '', '-'),
    r.ngay,
  ];
  if (texts.some(s => (s || '').toLowerCase().includes(q))) return true;
  const digits = q.replace(/[.,\s]/g, '');
  return /^\d+$/.test(digits) && String(r.tien || 0).includes(digits);
}

// ── [KHU VỰC 2] LỊCH SỬ THU TIỀN — "sổ quỹ" mới nhất → cũ nhất (năm đang lọc) ──
function renderThuTableTk(page) {
  if (page === undefined) page = _thuTkPage;
  _thuTkPage = page;
  const tbody  = document.getElementById('thutk-tbody');
  const empty  = document.getElementById('thutk-empty');
  const badge  = document.getElementById('thutk-count-badge');
  const sumEl  = document.getElementById('thutk-sum');
  const pgWrap = document.getElementById('thutk-pagination');
  if (!tbody) return;

  // Lọc: năm đang xem + công trình đang chọn (dropdown) + ô tìm kiếm
  const filtered = thuRecords
    .filter(r => !r.deletedAt && inActiveYear(r.ngay) && _dtThuMatchCt(r) && _dtThuMatchSearch(r, _dtThuSearch))
    .sort((a, b) => (b.ngay || '').localeCompare(a.ngay || '')
      || ((b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)));

  const dangLoc = !!(_dtThuSearch || _dtThuCtFilter);
  const tong = filtered.reduce((s, r) => s + (r.tien || 0), 0);
  if (badge) badge.textContent = filtered.length ? `(${filtered.length} khoản)` : '';
  if (sumEl) sumEl.innerHTML = filtered.length
    ? `${_dtThuSearch ? 'Tổng khớp tìm kiếm' : (_dtThuCtFilter ? 'Tổng đã thu của CT' : 'Tổng đã thu')}: <b class="text-success font-monospace">${fmtM(tong)}</b>` : '';

  if (!filtered.length) {
    tbody.innerHTML = '';
    if (empty) {
      empty.textContent = dangLoc ? 'Không có khoản thu nào khớp bộ lọc' : 'Chưa có khoản thu nào';
      empty.style.display = '';
    }
    if (pgWrap) pgWrap.innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  const maxPage = Math.max(0, Math.ceil(filtered.length / DT_PG) - 1);
  if (page > maxPage) { page = maxPage; _thuTkPage = page; }
  const slice = filtered.slice(page * DT_PG, (page + 1) * DT_PG);

  tbody.innerHTML = slice.map(r => {
    const isNew = String(r.id) === String(_dtThuLastId);
    return `<tr class="${isNew ? 'dt-row-new' : ''}">
      <td style="text-align:center;padding:4px 6px"><input type="checkbox" class="thu-row-chk" data-id="${x(r.id)}"></td>
      <td class="text-secondary" style="white-space:nowrap;font-size:12px">${fmtISODate(r.ngay)}${isNew ? ' <span class="badge bg-warning text-dark" style="font-size:9px">Vừa lưu</span>' : ''}</td>
      <td style="font-weight:600;white-space:nowrap">${x(_resolveCtName(r))}</td>
      <td style="white-space:nowrap">${_dtLoaiThuBadge(r)}</td>
      <td class="text-end font-monospace fw-semibold text-success" style="white-space:nowrap">${fmtM(r.tien)}</td>
      <td class="text-secondary" style="white-space:nowrap">${x(recCatName(r,'thu','nguoi') || '—')}</td>
      <td class="text-body-secondary" style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(r.nd || '')}">${x(r.nd || '—')}</td>
      <td class="action-col">${_dtThuActions(r)}</td>
    </tr>`;
  }).join('');

  if (pgWrap) pgWrap.innerHTML = _dtPaginationHtml(filtered.length, page, 'renderThuTableTk');
}

// ══ PHẦN 3: TIẾN ĐỘ THU TIỀN THEO CÔNG TRÌNH ══════════════════
// Gom phiếu thu theo công trình. Số liệu lấy từ calcTongDoanhThu() (quyettoan.core.js)
// — CÙNG công thức với 3 thẻ trên cùng → dòng TỔNG CỘNG luôn khớp các thẻ.
//   Tổng giá trị HĐ = doanh thu của CT (HĐ gốc + quyết toán, quy tắc max(HĐ, Đã thu))
//   Còn phải thu    = Tổng giá trị HĐ − Đã thu
// Phạm vi: năm đang lọc (chọn "Tất cả năm" để xem toàn vòng đời công trình).

// ── Dựng danh sách nhóm theo công trình ──
// Trả về [{ key, name, cdt, coHD, tongDT, daThu, con, recs }]
function _dtTienDoGroups() {
  const thuYear = thuRecords.filter(r => !r.deletedAt && _dtInYear(r.ngay));
  const daGom = new Set();   // phiếu đã gom vào 1 công trình
  const groups = [];

  (typeof getAllProjects === 'function' ? getAllProjects() : [])
    .filter(p => p && p.id !== 'COMPANY')
    .forEach(p => {
      const d    = calcTongDoanhThu(p);
      const recs = thuYear.filter(r => _qtMatchProj(r, p));
      if (!d.tongDT && !recs.length) return;     // CT không có HĐ lẫn khoản thu → bỏ
      recs.forEach(r => daGom.add(r));
      groups.push({
        key: p.id, name: p.name, cdt: p.chuDauTu || '',
        coHD: !!(d.hdGoc || d.qt),
        tongDT: d.tongDT, daThu: d.daThu, con: d.conPhaiThu, recs,
      });
    });

  // Phiếu thu không gắn được công trình nào (dữ liệu cũ / CT đã xóa) → gom 1 dòng riêng
  // để cột Đã Thu cộng lại vẫn khớp thẻ TỔNG ĐÃ THU.
  const leLe = thuYear.filter(r => !daGom.has(r));
  if (leLe.length) {
    const s = leLe.reduce((t, r) => t + (r.tien || 0), 0);
    groups.push({ key: '__none__', name: '(CÔNG TY / Chưa gắn công trình)', cdt: '', coHD: false,
                  tongDT: 0, daThu: s, con: 0, recs: leLe, orphan: true });
  }
  return groups;
}

// ── Thanh tiến độ % (progress bar) — xanh lá đủ 100%, xanh dương ≥ 50%, vàng < 50% ──
function _dtProgressBar(pct) {
  const w   = Math.max(0, Math.min(pct, 100));
  const cls = pct > 100 ? 'bg-danger' : pct >= 100 ? 'bg-success' : pct >= 50 ? 'bg-primary' : 'bg-warning';
  // Chưa đủ 100% thì làm tròn XUỐNG (99,6% hiện 99% — tránh hiểu nhầm đã thu đủ)
  const txt = pct >= 100 ? Math.round(pct) + '%' : Math.floor(pct) + '%';
  return `<div class="d-flex align-items-center gap-2">
    <div class="progress flex-grow-1" style="height:8px" role="progressbar" aria-valuenow="${Math.round(w)}" aria-valuemin="0" aria-valuemax="100">
      <div class="progress-bar ${cls}" style="width:${w}%"></div>
    </div>
    <span class="fw-semibold font-monospace" style="font-size:12px;min-width:42px;text-align:right">${txt}</span>
  </div>`;
}

// ── Ô "Còn phải thu": dương = vàng · 0 = "Đã thu đủ" · âm (thu vượt HĐ thay thế) = đỏ ──
function _dtConPhaiThuCell(con, tongDT) {
  if (!tongDT) return '<span class="text-body-secondary">—</span>';
  if (con > 0) return `<span class="text-warning fw-semibold font-monospace">${fmtM(con)}</span>`;
  if (con < 0) return `<span class="text-danger fw-semibold" title="Đã thu nhiều hơn giá trị HĐ">Thu vượt <span class="font-monospace">${fmtM(-con)}</span></span>`;
  return '<span class="text-success fw-semibold">Đã thu đủ</span>';
}

// ── [KHU VỰC 3] Vẽ bảng Tiến Độ Thu Theo Công Trình (accordion) ──
function renderThuTienDo(page) {
  if (page === undefined) page = _thuTdPage;
  _thuTdPage = page;
  const tbody  = document.getElementById('thutd-tbody');
  const tfoot  = document.getElementById('thutd-tfoot');
  const empty  = document.getElementById('thutd-empty');
  const badge  = document.getElementById('thutd-count-badge');
  const pgWrap = document.getElementById('thutd-pagination');
  if (!tbody) return;

  let groups = _dtTienDoGroups();
  if (_dtTdSearch) {
    const q = _dtTdSearch;
    groups = groups.filter(g => g.name.toLowerCase().includes(q) || g.cdt.toLowerCase().includes(q));
  }
  // Còn phải thu nhiều nhất lên đầu; dòng "Chưa gắn công trình" luôn ở cuối
  groups.sort((a, b) => (a.orphan ? 1 : 0) - (b.orphan ? 1 : 0)
    || (b.con - a.con) || a.name.localeCompare(b.name, 'vi'));

  if (badge) badge.textContent = groups.length ? `(${groups.length} công trình)` : '';

  if (!groups.length) {
    tbody.innerHTML = '';
    if (tfoot) tfoot.innerHTML = '';
    if (empty) {
      empty.textContent = _dtTdSearch ? 'Không có công trình nào khớp tìm kiếm' : 'Chưa có công trình nào có hợp đồng hoặc khoản thu';
      empty.style.display = '';
    }
    if (pgWrap) pgWrap.innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  const maxPage = Math.max(0, Math.ceil(groups.length / DT_TD_PG) - 1);
  if (page > maxPage) { page = maxPage; _thuTdPage = page; }
  const slice = groups.slice(page * DT_TD_PG, (page + 1) * DT_TD_PG);

  tbody.innerHTML = slice.map(g => {
    const open = _dtTdOpen.has(g.key);
    // % hoàn thành: chưa có giá trị HĐ mà đã thu → coi như 100%
    const pct = g.tongDT > 0 ? (g.daThu / g.tongDT) * 100 : (g.daThu > 0 ? 100 : 0);
    const noHdBadge = (!g.coHD && !g.orphan)
      ? ' <span class="badge bg-secondary-subtle text-secondary-emphasis" style="font-size:9px" title="Công trình chưa khai báo Hợp đồng chính">Chưa có HĐ</span>' : '';
    const mainRow = `<tr class="dt-td-row${open ? ' is-open' : ''}" data-key="${x(g.key)}" onclick="dtToggleTienDo(this.dataset.key)" title="Bấm để ${open ? 'thu gọn' : 'xem các đợt thu'}">
      <td class="text-center"><span class="material-symbols-outlined dt-td-chev">chevron_right</span></td>
      <td>
        <div class="fw-semibold">${x(g.name)}${noHdBadge}</div>
        ${g.cdt ? `<div class="text-secondary" style="font-size:11px">${x(g.cdt)}</div>` : ''}
      </td>
      <td class="text-end font-monospace" style="white-space:nowrap">${g.tongDT ? fmtM(g.tongDT) : '<span class="text-body-secondary">—</span>'}</td>
      <td class="text-end font-monospace text-success fw-semibold" style="white-space:nowrap">${g.daThu ? fmtM(g.daThu) : '<span class="text-body-secondary">—</span>'}</td>
      <td class="text-end" style="white-space:nowrap">${g.orphan ? '<span class="text-body-secondary">—</span>' : _dtConPhaiThuCell(g.con, g.tongDT)}</td>
      <td>${g.orphan ? '<span class="text-body-secondary" style="font-size:12px">—</span>' : _dtProgressBar(pct)}</td>
      <td class="text-center"><span class="badge rounded-pill bg-body-secondary text-body">${g.recs.length}</span></td>
    </tr>`;
    return mainRow + (open ? _dtTienDoDetailRow(g) : '');
  }).join('');

  // Dòng TỔNG CỘNG (theo bộ lọc tìm kiếm, mọi trang) — Còn phải thu = Σ HĐ − Σ đã thu (khớp thẻ)
  if (tfoot) {
    const tDT  = groups.reduce((s, g) => s + g.tongDT, 0);
    const tThu = groups.reduce((s, g) => s + g.daThu, 0);
    const tCon = tDT - tThu;
    const tPct = tDT > 0 ? (tThu / tDT) * 100 : 0;
    tfoot.innerHTML = `<tr style="border-top:2px solid var(--bs-border-color);font-weight:700">
      <td></td>
      <td>TỔNG CỘNG</td>
      <td class="text-end font-monospace" style="white-space:nowrap">${fmtM(tDT)}</td>
      <td class="text-end font-monospace text-success" style="white-space:nowrap">${fmtM(tThu)}</td>
      <td class="text-end font-monospace ${tCon > 0 ? 'text-warning' : tCon < 0 ? 'text-danger' : 'text-success'}" style="white-space:nowrap">${fmtM(tCon)}</td>
      <td>${tDT > 0 ? _dtProgressBar(tPct) : ''}</td>
      <td class="text-center">${groups.reduce((s, g) => s + g.recs.length, 0)}</td>
    </tr>`;
  }

  if (pgWrap) pgWrap.innerHTML = _dtPaginationHtml(groups.length, page, 'renderThuTienDo', DT_TD_PG);
}

// ── Dòng xổ xuống: các đợt thu của 1 công trình (cũ → mới, có cột Lũy kế) ──
function _dtTienDoDetailRow(g) {
  const recs = [...g.recs].sort((a, b) => (a.ngay || '').localeCompare(b.ngay || '')
    || ((a.createdAt || 0) - (b.createdAt || 0)));
  const btnThu = g.orphan ? '' :
    `<button class="btn btn-sm btn-success fw-semibold" onclick="dtThuChoCT(this.dataset.ct)" data-ct="${x(g.name)}">
      <span class="material-symbols-outlined msi-gap" style="font-size:16px;vertical-align:-3px">add</span>Ghi nhận thu cho CT này
    </button>`;

  let body;
  if (!recs.length) {
    body = '<div class="text-secondary text-center py-2" style="font-size:12px">Chưa có đợt thu nào trong năm đang lọc</div>';
  } else {
    let luyKe = 0;
    const rows = recs.map((r, i) => {
      luyKe += (r.tien || 0);
      const pctLk = g.tongDT > 0 ? Math.floor((luyKe / g.tongDT) * 100) + '%' : '—';
      return `<tr class="${String(r.id) === String(_dtThuLastId) ? 'dt-row-new' : ''}">
        <td class="text-center text-secondary">${i + 1}</td>
        <td style="white-space:nowrap;font-size:12px">${fmtISODate(r.ngay)}</td>
        <td style="white-space:nowrap">${_dtLoaiThuBadge(r, 10)}</td>
        <td class="text-end font-monospace fw-semibold text-success" style="white-space:nowrap">${fmtM(r.tien)}</td>
        <td class="text-end font-monospace" style="white-space:nowrap">${fmtM(luyKe)}</td>
        <td class="text-end font-monospace text-secondary" style="white-space:nowrap">${pctLk}</td>
        <td class="text-secondary" style="white-space:nowrap">${x(recCatName(r, 'thu', 'nguoi') || '—')}</td>
        <td class="text-body-secondary" style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(r.nd || '')}">${x(r.nd || '—')}</td>
        <td class="action-col">${_dtThuActions(r)}</td>
      </tr>`;
    }).join('');
    body = `<table class="table table-sm align-middle mb-0 dt-td-sub" style="font-size:12.5px">
      <thead><tr style="font-size:10.5px;color:var(--bs-secondary-color)">
        <th class="text-center" style="width:40px">Đợt</th>
        <th>Ngày</th><th>Loại</th>
        <th class="text-end">Số Tiền</th>
        <th class="text-end">Lũy Kế</th>
        <th class="text-end" title="Lũy kế so với Tổng giá trị HĐ">% HĐ</th>
        <th>Người TH</th><th>Ghi Chú</th><th class="action-col"></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  return `<tr class="dt-td-detail"><td colspan="7">
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <span class="fw-semibold" style="font-size:12px">
        <span class="material-symbols-outlined msi-gap" style="font-size:16px;vertical-align:-3px">timeline</span>Các đợt thu của ${x(g.name)} (${recs.length} đợt)
      </span>
      ${btnThu}
    </div>
    ${body}
  </td></tr>`;
}

// ── Bấm 1 dòng công trình → mở / thu gọn chi tiết các đợt thu ──
function dtToggleTienDo(key) {
  if (_dtTdOpen.has(key)) _dtTdOpen.delete(key);
  else _dtTdOpen.add(key);
  renderThuTienDo(_thuTdPage);
}

// ── Nút "Ghi nhận thu cho CT này" → điền sẵn công trình vào form + cuộn lên form ──
function dtThuChoCT(ctName) {
  _thuResetForm();
  const ctSel = document.getElementById('thu-ct-input');
  // _setSelectFlexible phát sự kiện change → _thuOnCtChange tự hiện dải Đã thu / Còn lại
  if (ctSel) _setSelectFlexible(ctSel, ctName);
  _dtFocusForm('thu-form-card', 'thu-tien');
}
