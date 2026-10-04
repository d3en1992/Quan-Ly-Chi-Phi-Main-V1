// doanhthu.core.js — Global data, state, and shared helpers for Doanh Thu
// Load order: sau thietbi.js, trước doanhthu.forms.js

// ─── Biến toàn cục (main.js sẽ gán lại sau dbInit) ─────────────
let hopDongData      = load('hopdong_v1', {});
let thuRecords       = load('thu_v1', []);
let thauPhuContracts = load('thauphu_v1', []);
let quyetToanRecords = load('quyettoan_v1', []); // Quyết toán chi phí (phát sinh tăng/giảm, cho phép âm)

// [ADDED] — Normalize thuRecords to projectId at runtime
function _normalizeThuProjectIds() {
  let changed = false;
  thuRecords.forEach(r => {
    if (r.deletedAt) return;
    if (!r.projectId && r.congtrinh) {
      const pid = _getProjectIdByName(r.congtrinh);
      if (pid) { r.projectId = pid; changed = true; }
    }
    if (r.projectId) {
      const pName = _getProjectNameById(r.projectId);
      if (pName && pName !== r.congtrinh) {
        r.congtrinh = pName; changed = true;
      }
    }
  });
  if (changed) save('thu_v1', thuRecords);
}
_normalizeThuProjectIds();

// Globals cho tính năng Khối lượng chi tiết HĐ Thầu Phụ
let _hdcItems = []; // kept for reset compat; hdc no longer uses chi tiết
let _hdtpItems = [];

function calcHopDongValue(hd) {
  if (hd.items && hd.items.length) {
    return hd.items.reduce((sum, i) => sum + (parseFloat(i.sl) || 0) * (parseFloat(i.donGia) || 0), 0);
  }
  return (parseFloat(hd.sl) || 1) * (parseFloat(hd.donGia) || 0);
}

// Xóa dữ liệu khối lượng chi tiết cũ khỏi HĐ Chính (giữ nguyên giaTri/giaTriphu/phatSinh)
function _migrateHopDongData() {
  let changed = false;
  Object.values(hopDongData).forEach(hd => {
    if (hd.items !== undefined || hd.sl !== undefined || hd.donGia !== undefined) {
      delete hd.items;
      delete hd.sl;
      delete hd.donGia;
      changed = true;
    }
  });
  if (changed) save('hopdong_v1', hopDongData);
}
_migrateHopDongData();

// Đảm bảo trường khachHang tồn tại trong mọi HĐ Chính
(function _migrateKhachHang() {
  let changed = false;
  Object.values(hopDongData).forEach(hd => {
    if (hd.khachHang === undefined) { hd.khachHang = ''; changed = true; }
  });
  if (changed) save('hopdong_v1', hopDongData);
})();


function updateGlobalTotals(prefix, arr) {
  const grandTotal = calcHopDongValue({ items: arr });
  const tongEl = document.getElementById(`${prefix}-chitiet-tong`);
  if (tongEl) tongEl.textContent = grandTotal ? grandTotal.toLocaleString('vi-VN') : '0';

  const wrap = document.getElementById(`${prefix}-chitiet-wrap`);
  if (arr.length === 0) {
    if(wrap) wrap.style.display = 'none';
  } else {
    if(wrap) wrap.style.display = 'block';
  }
  if (prefix === 'hdc' && typeof hdcCalcAuto === 'function') hdcCalcAuto();
  else if (prefix === 'hdtp' && typeof hdtpCalcAuto === 'function') hdtpCalcAuto();
}

// Logic events cho bảng chi tiết
window.updateItem = function(prefix, idx, field, val) {
  const arr = prefix === 'hdc' ? _hdcItems : _hdtpItems;
  if (!arr[idx]) return;
  if (field === 'sl' || field === 'donGia') {
    arr[idx][field] = parseFloat(val) || 0;
    const row = document.querySelector(`#${prefix}-chitiet-tbody tr[data-idx="${idx}"]`);
    if (row) {
      const total = (arr[idx].sl || 0) * (arr[idx].donGia || 0);
      const totalTd = row.querySelector('.row-total');
      if (totalTd) totalTd.textContent = total ? total.toLocaleString('vi-VN') : '0';
    }
    updateGlobalTotals(prefix, arr);
  } else {
    arr[idx][field] = val;
  }
};

window.removeItem = function(prefix, idx) {
  const arr = prefix === 'hdc' ? _hdcItems : _hdtpItems;
  arr.splice(idx, 1);
  if (prefix === 'hdc') window.renderhdcChiTiet(); else window.renderhdtpChiTiet();
};

function bindItemsToTable(prefix, getItemsArr) {
  window[`render${prefix}ChiTiet`] = function() {
    const tbody = document.getElementById(`${prefix}-chitiet-tbody`);
    const arr = getItemsArr();
    if (!tbody) return;
    tbody.innerHTML = arr.map((it, i) => {
      const total = (it.sl || 0) * (it.donGia || 0);
      return `<tr data-idx="${i}">
        <td><input type="text" class="bare-input" style="width:100%" value="${x(it.name || '')}" oninput="updateItem('${prefix}', ${i}, 'name', this.value)"></td>
        <td><input type="text" class="bare-input" style="width:100%;text-align:center" placeholder="m2, m3, cái..." value="${x(it.donVi || '')}" oninput="updateItem('${prefix}', ${i}, 'donVi', this.value)"></td> <!-- [ADDED] column donVi -->
        <td><input type="number" class="bare-input" style="width:100%;text-align:center;-moz-appearance:textfield" value="${it.sl!=null ? it.sl : 1}" oninput="updateItem('${prefix}', ${i}, 'sl', this.value)"></td>
        <td><input type="text" class="bare-input" style="width:100%;text-align:right" value="${it.donGia ? parseInt(it.donGia).toLocaleString('vi-VN') : ''}" oninput="fmtInputMoney(this); updateItem('${prefix}', ${i}, 'donGia', this.dataset.raw||0)" data-raw="${it.donGia||0}"></td>
        <td class="row-total text-end fw-bold text-warning">${total ? total.toLocaleString('vi-VN') : '0'}</td>
        <td style="text-align:center"><button type="button" class="btn btn-outline-secondary btn-sm text-danger" style="border:none;padding:2px 6px" onclick="removeItem('${prefix}', ${i})"><span class="material-symbols-outlined">close</span></button></td>
      </tr>`;
    }).join('');
    updateGlobalTotals(prefix, arr);
  };

  window[`add${prefix}ChiTietRow`] = function() {
    const arr = getItemsArr();
    arr.push({ name: '', donVi: '', sl: 1, donGia: 0 }); // [ADDED] column donVi
    window[`render${prefix}ChiTiet`]();
  };

  window[`toggle${prefix}ChiTiet`] = function() {
    const wrap = document.getElementById(`${prefix}-chitiet-wrap`);
    if (!wrap) return;
    const arr = getItemsArr();
    if (wrap.style.display === 'none') {
      wrap.style.display = 'block';
      if (arr.length === 0) arr.push({ name: '', donVi: '', sl: 1, donGia: 0 });
      window[`render${prefix}ChiTiet`]();
    } else {
      if (arr.length > 0 && confirm('Bạn có chắc muốn ẩn và xóa bảng chi tiết?')) {
         arr.length = 0;
         wrap.style.display = 'none';
         window[`render${prefix}ChiTiet`]();
      } else if (arr.length === 0) {
         wrap.style.display = 'none';
      }
    }
    if (typeof window[`${prefix}CalcAuto`] === 'function') window[`${prefix}CalcAuto`]();
  };

  window[`${prefix}CalcAuto`] = function() {
    const arr = getItemsArr();
    const isDetailed = arr && arr.length > 0;
    const giaTriInput = document.getElementById(`${prefix}-giatri`);
    if (!giaTriInput) return;

    if (isDetailed) {
      const val = calcHopDongValue({ items: arr });
      giaTriInput.dataset.raw = val || 0;
      giaTriInput.value = val ? val.toLocaleString('vi-VN') : '';
      giaTriInput.readOnly = true;
      giaTriInput.style.background = 'var(--bs-tertiary-bg)';
      giaTriInput.style.pointerEvents = 'none';
    } else {
      giaTriInput.readOnly = false;
      giaTriInput.style.background = '';
      giaTriInput.style.pointerEvents = '';
    }
    if (prefix === 'hdtp') {
      if (typeof hdtpUpdateTotal === 'function') hdtpUpdateTotal();
    }
  };
}

bindItemsToTable('hdtp', () => _hdtpItems);

// ── Phân trang tab Doanh Thu (03/10/2026 — bố cục 2 subtab HỢP ĐỒNG CHÍNH / THU TIỀN) ──
// _hdcTkPage : bảng Danh Sách HĐ Chính        (subtab HỢP ĐỒNG CHÍNH, khu vực 3)
// _thuTkPage : bảng Lịch Sử Thu Tiền (sổ quỹ) (subtab THU TIỀN, khu vực 2)
// _thuTdPage : bảng Tiến Độ Thu Theo Công Trình (subtab THU TIỀN, khu vực 3)
// _hdtpPage / _hdtpTkPage : HĐ Thầu Phụ — thuộc tab Công Nợ (congno.hdtp.js dùng)
// (Đã gỡ _hdcPage/_thuPage/_kbPage của subtab KHAI BÁO cũ)
let _hdtpPage   = 0;
let _hdcTkPage  = 0;
let _hdtpTkPage = 0;
let _thuTkPage  = 0;
let _thuTdPage  = 0;
const DT_PG         = 7;   // số dòng / trang cho bảng HĐ Chính + Lịch sử thu
const DT_TD_PG      = 10;  // số công trình / trang ở bảng Tiến Độ Thu

// ── Nhãn + màu badge cho Loại khoản thu (dùng chung form, sổ quỹ, bảng tiến độ) ──
// (03/10/2026) "Quyết toán" ĐÃ GỠ khỏi dropdown form Thu tiền — nay chỉ do hệ thống tự sinh
// (phiếu thu tiền còn lại khi lưu quyết toán, xem quyettoan.congtrinh.js → _qtSyncAutoThu).
// Vẫn giữ mã 'quyettoan' ở đây để HIỂN THỊ phiếu tự động + phiếu cũ nhập tay trước đây.
// Thêm "Khác" cho dòng tiền vặt / ngoại lệ.
const DT_LOAI_THU = {
  tamung:    ['Tạm ứng',    'badge bg-warning text-dark'],
  giaidoan:  ['Giai đoạn',  'badge bg-info text-dark'],
  quyettoan: ['Quyết toán', 'badge bg-success'],
  khac:      ['Khác',       'badge bg-secondary'],
};

// ── Phiếu thu TỰ ĐỘNG (sinh từ quyết toán) → khóa cứng, không Sửa/Xóa ở tab Thu tiền ──
// Dấu hiệu: r.auto === true, r.qtId = id bản quyết toán sinh ra nó.
function _dtIsAutoThu(r) {
  return !!(r && r.auto);
}

// Bộ lọc bảng Danh Sách HĐ Chính (subtab HỢP ĐỒNG CHÍNH)
let _dtTkCtFilter     = '';  // tên công trình ('' = tất cả)
// Bộ lọc bảng Lịch Sử Thu Tiền (subtab THU TIỀN) — tên công trình ('' = tất cả) (03/10/2026)
let _dtThuCtFilter = '';
// CT filter riêng cho sub-tab THẦU PHỤ (tab Công Nợ)
let _dtTpCtFilter = '';

// Bảng Tiến Độ: tập các công trình đang MỞ chi tiết (key = projectId, '__none__' = chưa gắn CT)
const _dtTdOpen = new Set();

// Bản ghi VỪA LƯU → tô sáng ở bảng để người dùng đối chiếu ngay sau khi bấm Lưu
let _dtHdcLastKey = '';  // key hopDongData của HĐ vừa lưu
let _dtThuLastId  = '';  // id phiếu thu vừa lưu

// ── Match hopDongData entry với CT filter của bảng Danh Sách HĐ ─────────────
function _dtMatchTkHDCFilter(keyId, hd) {
  if (!_dtTkCtFilter) return true;
  if (keyId === _dtTkCtFilter) return true;
  const filterProj = getAllProjects().find(p => p.name === _dtTkCtFilter);
  if (filterProj) {
    if (keyId === filterProj.id) return true;
    if (hd.projectId && hd.projectId === filterProj.id) return true;
  }
  const keyProj = getAllProjects().find(p => p.id === keyId);
  if (keyProj && keyProj.name === _dtTkCtFilter) return true;
  return false;
}

// ── Match record với CT filter THẦU PHỤ ───────────────────────────────────
function _dtMatchTpProjFilter(record) {
  if (!_dtTpCtFilter) return true;
  if (record.projectId) {
    const proj = getAllProjects().find(p => p.name === _dtTpCtFilter);
    if (proj) return record.projectId === proj.id;
  }
  return (record.congtrinh || '') === _dtTpCtFilter;
}

// ── Nạp bộ lọc Công trình trên đầu bảng Danh Sách HĐ Chính ──
function dtPopulateCtFilter() {
  const ctSel = document.getElementById('dt-hdc-ct-filter');
  if (ctSel) ctSel.innerHTML = _buildProjFilterOpts(_dtTkCtFilter, { includeCompany: false, placeholder: '-- Tất cả công trình --' });

  // (04/10/2026) Đã bỏ bộ lọc Người TH của Danh Sách HĐ Chính
}

// ── Nạp dropdown "Chọn công trình" trên đầu bảng Lịch Sử Thu Tiền (03/10/2026) ──
// Chỉ liệt kê công trình ĐANG CÓ phiếu thu trong năm đang lọc (chọn là thấy ngay dòng thời gian
// thanh toán, không bị toàn công trình rỗng). Luôn giữ lựa chọn hiện tại dù không còn phiếu.
function dtPopulateThuCtFilter() {
  const sel = document.getElementById('dt-thu-ct-filter');
  if (!sel) return;
  const names = new Set();
  thuRecords.forEach(r => {
    if (!r || r.deletedAt || !inActiveYear(r.ngay)) return;
    const n = _resolveCtName(r);
    if (n) names.add(n);
  });
  if (_dtThuCtFilter) names.add(_dtThuCtFilter);
  const opts = [...names].sort((a, b) => a.localeCompare(b, 'vi'));
  sel.innerHTML = '<option value="">-- Tất cả công trình --</option>' +
    opts.map(n => `<option value="${x(n)}"${n === _dtThuCtFilter ? ' selected' : ''}>${x(n)}</option>`).join('');
}

// ── Phiếu thu có thuộc công trình đang lọc ở Lịch Sử Thu Tiền không ──
function _dtThuMatchCt(r) {
  if (!_dtThuCtFilter) return true;
  return _resolveCtName(r) === _dtThuCtFilter;
}

function dtSetThuCtFilter(val) {
  _dtThuCtFilter = val || '';
  renderThuTableTk(0);
}

// ── Populate CT filter select cho sub-tab THẦU PHỤ ───────────────────────
function dtPopulateTpCtFilter() {
  const tpSel = document.getElementById('dt-tp-ct-filter-sel');
  if (tpSel) tpSel.innerHTML = _buildProjFilterOpts(_dtTpCtFilter, { includeCompany: false, placeholder: '-- Tất cả công trình --' });
}

// ── Bộ lọc bảng Danh Sách HĐ Chính → vẽ lại từ trang đầu ─────────────────
function dtSetHdcCtFilter(val) {
  _dtTkCtFilter = val || '';
  renderHdcTableTk(0);
}

// ── Mở subtab HỢP ĐỒNG CHÍNH + lọc sẵn danh sách theo 1 công trình ──────────
// Gọi từ tab Công Trình (nút "Doanh thu" của 1 công trình — projects.ui.js)
function dtFilterHdcByCt(ctName) {
  _dtTkCtFilter = ctName || '';
  _hdcTkPage = 0;
  dtGoSub(document.getElementById('dt-sub-hdc-btn'), 'dt-sub-hdc'); // luôn vẽ lại (kể cả bộ lọc)
}

// ── Áp dụng CT filter → CHỈ re-render bảng THẦU PHỤ ───────────────────────
function dtSetTpCtFilter(val) {
  _dtTpCtFilter = val || '';
  _hdtpTkPage = 0;
  renderHdtpTableTk(0);
}

// ══════════════════════════════════════════════════════════════
// [MODULE: DOANH THU — Khai Báo · Thống Kê]
// Ctrl+F → "MODULE: DOANH THU"
// ══════════════════════════════════════════════════════════════

// ── Helper: format input tiền tệ khi gõ ──────────────────────
function fmtInputMoney(el) {
  const raw = el.value.replace(/[^0-9]/g, '');
  el.dataset.raw = raw;
  el.value = raw ? parseInt(raw).toLocaleString('vi-VN') : '';
}

function _readMoneyInput(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  const raw = el.dataset.raw || el.value.replace(/[^0-9]/g, '');
  return parseInt(raw) || 0;
}

// ── Biến thể CHO PHÉP SỐ ÂM (dùng cho Quyết Toán: phát sinh giảm) ──
// Giữ dấu trừ ở đầu nếu có, phần còn lại format nghìn như bình thường.
function fmtInputMoneySigned(el) {
  const neg = /^\s*-/.test(el.value) || el.dataset.raw && el.dataset.raw.startsWith('-');
  const digits = el.value.replace(/[^0-9]/g, '');
  el.dataset.raw = (neg && digits ? '-' : '') + digits;
  el.value = digits ? (neg ? '-' : '') + parseInt(digits).toLocaleString('vi-VN') : (neg ? '-' : '');
}

function _readMoneySigned(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  const raw = el.dataset.raw || el.value.replace(/[^0-9-]/g, '');
  return parseInt(raw) || 0;
}

// ── Helper: kiểm tra record có thuộc năm đang chọn không ──────
function _dtInYear(ngay) {
  if (!activeYears || activeYears.size === 0) return true;
  if (!ngay) return true; // record cũ không có ngày → hiển thị trong mọi năm
  return inActiveYear(ngay);
}

// ── Công thức Doanh Thu Thực Tế của công trình ─────────────────
// Doanh thu = max(Giá trị HĐ chính, Tổng đã thu) + Quyết toán chi phí (±)
// Lấy max thay vì luôn dùng giá trị HĐ chính: nếu khách đã trả nhiều hơn HĐ gốc
// (phát sinh thêm ngoài hợp đồng), doanh thu phải phản ánh đúng số tiền thực nhận.
// boQuyTacMax = true khi công trình ĐÃ CÓ QUYẾT TOÁN (bất kỳ loại — từ 03/10/2026; trước đó
// chỉ khi có bản THAY THẾ): quyết toán là số chốt chuẩn với Chủ Đầu Tư → KHÔNG dùng max nữa,
// doanh thu = HĐ gốc + quyết toán (đã quy đổi delta). Nơi truyền: calcTongDoanhThu()
// (quyettoan.core.js) và ctTaiChinh() (projects.ui.js) — đều truyền coThayThe || coQT.
function _dtCalcRevenue(giaTriHDChinh, tongThuTien, chiPhiQuyetToan, boQuyTacMax) {
  if (boQuyTacMax) return (giaTriHDChinh || 0) + (chiPhiQuyetToan || 0);
  const base = (giaTriHDChinh || 0) > (tongThuTien || 0) ? (giaTriHDChinh || 0) : (tongThuTien || 0);
  return base + (chiPhiQuyetToan || 0);
}

// ── Helper: render HTML phân trang ────────────────────────────
// pageSize: số dòng / trang (bỏ trống = DT_PG). Bảng Tiến Độ truyền DT_TD_PG.
function _dtPaginationHtml(total, curPage, onClickFn, pageSize) {
  const pages = Math.ceil(total / (pageSize || DT_PG));
  if (pages <= 1) return '';
  const items = [];
  if (curPage > 0)
    items.push(`<li class="page-item"><button class="page-link" onclick="${onClickFn}(${curPage - 1})">‹</button></li>`);
  for (let i = 0; i < pages; i++) {
    items.push(`<li class="page-item ${i === curPage ? 'active' : ''}"><button class="page-link" onclick="${onClickFn}(${i})">${i + 1}</button></li>`);
  }
  if (curPage < pages - 1)
    items.push(`<li class="page-item"><button class="page-link" onclick="${onClickFn}(${curPage + 1})">›</button></li>`);
  return `<ul class="pagination pagination-sm mb-0">${items.join('')}</ul>`;
}

// ── Ô tìm kiếm của từng bảng (chữ thường, đã bỏ khoảng trắng 2 đầu) ──────
let _dtTkSearch  = '';  // bảng Danh Sách HĐ Chính
let _dtThuSearch = '';  // bảng Lịch Sử Thu Tiền
let _dtTdSearch  = '';  // bảng Tiến Độ Thu Theo Công Trình

function dtSetHdcSearch(val) {
  _dtTkSearch = (val || '').trim().toLowerCase();
  renderHdcTableTk(0);
}

function dtSetThuSearch(val) {
  _dtThuSearch = (val || '').trim().toLowerCase();
  renderThuTableTk(0);
}

function dtSetTdSearch(val) {
  _dtTdSearch = (val || '').trim().toLowerCase();
  renderThuTienDo(0);
}

// ── Text search state (THẦU PHỤ) ─────────────────────────────
let _dtTpSearch = '';

function dtSetTpSearch(val) {
  _dtTpSearch = (val || '').trim().toLowerCase();
  _hdtpTkPage = 0;
  renderHdtpTableTk(0);
}

// ── Dashboard mini: 3 stat cards trên sub-tab TỔNG QUAN ──────
function _dtRenderDashboardMini() {
  const hdEl  = document.getElementById('dt-mini-tonghd');
  const thuEl = document.getElementById('dt-mini-dathu');
  const conEl = document.getElementById('dt-mini-con');
  if (!hdEl) return;

  // Tổng Doanh Thu = Σ doanh thu SAU QUYẾT TOÁN của từng công trình (năm đang lọc)
  //   = HĐ gốc + quyết toán tăng − giảm (hoặc giá trị thay thế) — calcTongDoanhThu()
  // (Trước 02/10/2026 thẻ này chỉ cộng HĐ gốc, chưa tính quyết toán.)
  let tongDT = 0;
  (typeof getAllProjects === 'function' ? getAllProjects() : [])
    .filter(p => p && p.id !== 'COMPANY')
    .forEach(p => {
      const d = calcTongDoanhThu(p);
      tongDT += d.tongDT;
    });
  // Đã thu: cộng MỌI phiếu thu trong năm (kể cả phiếu cũ chưa gắn được công trình)
  let tongThu = 0;
  thuRecords.forEach(r => { if (!r.deletedAt && inActiveYear(r.ngay)) tongThu += (r.tien||0); });
  const conPhaiThu = tongDT - tongThu;

  hdEl.textContent  = tongDT  ? fmtM(tongDT)  : '—';
  thuEl.textContent = tongThu  ? fmtM(tongThu)  : '—';
  conEl.textContent = tongDT  ? fmtM(conPhaiThu) : '—';
  // (02/10/2026) Đã gỡ dòng phụ "HĐ gốc · Quyết toán ±" — Quyết toán không còn hiển thị ở tab Doanh Thu
  conEl.className = 'fw-bold ' + (conPhaiThu > 0 ? 'text-warning' : conPhaiThu < 0 ? 'text-danger' : 'text-success');
  conEl.style.fontSize = '20px';
}

// ── Modal open/close helpers ──────────────────────────────────
// (03/10/2026) HĐ Chính, Thu Tiền và cả HĐ Thầu Phụ đều KHÔNG còn popup (form nằm thẳng trên màn hình).
// 2 hàm này không còn nơi nào gọi — giữ lại cho an toàn (overlay không tồn tại thì tự bỏ qua).
function openDtModal(type) {
  ['hdc','thu','hdtp'].forEach(t => {
    const ov = document.getElementById('dt-modal-' + t + '-ov');
    if (ov) ov.classList.remove('open');
  });
  const ov = document.getElementById('dt-modal-' + type + '-ov');
  if (ov) {
    ov.classList.add('open');
    document.body.classList.add('modal-open');
    setTimeout(() => {
      const first = ov.querySelector('select:not([id$="-edit-id"]), input[type="date"]');
      if (first) first.focus();
    }, 150);
  }
}

function closeDtModal(type) {
  const ids = type ? ['dt-modal-' + type + '-ov'] : ['dt-modal-hdc-ov','dt-modal-thu-ov','dt-modal-hdtp-ov'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('open'); });
  // Mở khóa cuộn trang nền nếu không còn modal nào đang open
  const anyOpen = ['hdc','thu','hdtp'].some(t => {
    const el = document.getElementById('dt-modal-' + t + '-ov');
    return el && el.classList.contains('open');
  });
  if (!anyOpen) document.body.classList.remove('modal-open');
}

// ── Dải "Tổng HĐ · Đã thu · Còn lại" khi chọn CT ở form Ghi Nhận Thu Tiền ──
// (03/10/2026) Dùng calcTongDoanhThu() — CÙNG công thức với bảng Tiến Độ Thu và 3 thẻ
// thống kê (HĐ gốc + quyết toán, theo năm đang lọc) → các con số luôn khớp nhau.
function _thuOnCtChange(ctName) {
  const infoEl = document.getElementById('thu-progress-info');
  if (!infoEl) return;
  if (!ctName || ctName === 'CÔNG TY') { infoEl.style.display = 'none'; return; }   // CÔNG TY: không có HĐ

  const proj = (typeof getAllProjects === 'function' ? getAllProjects() : []).find(p => p.name === ctName) || null;
  if (!proj || typeof calcTongDoanhThu !== 'function') { infoEl.style.display = 'none'; return; }

  const d       = calcTongDoanhThu(proj);
  const coHD    = !!(d.hdGoc || d.qt);   // chưa khai báo HĐ & chưa quyết toán → "Chưa có HĐ"
  const tongHD  = d.tongDT;
  const tongThu = d.daThu;
  const conLai  = d.conPhaiThu;

  const hdSpan  = document.getElementById('thu-prog-hd');
  const thuSpan = document.getElementById('thu-prog-dathu');
  const conSpan = document.getElementById('thu-prog-con');
  if (hdSpan)  hdSpan.textContent  = coHD ? fmtM(tongHD) : 'Chưa có HĐ';
  if (thuSpan) thuSpan.textContent = fmtM(tongThu);
  if (conSpan) {
    conSpan.textContent = fmtM(conLai);
    conSpan.className = 'fw-bold ' + (conLai > 0 ? 'text-warning' : conLai < 0 ? 'text-danger' : 'text-success');
  }
  infoEl.style.display = 'flex';
}

// (Đã gỡ _qtOnCtChange — form Quyết Toán chuyển sang tab QUYẾT TOÁN riêng,
//  xem js/modules/quyettoan/quyettoan.congtrinh.js → qtOnCtChange / Live Preview.)

// ── Populate hdtp-hdcid khi chọn CT trong modal HĐ Thầu Phụ ──
function _hdtpOnCtChange(ctName) {
  const sel = document.getElementById('hdtp-hdcid');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Chọn HĐ Ch\xednh (tuỳ chọn) --</option>';
  if (!ctName) return;

  const proj = (typeof getAllProjects === 'function' ? getAllProjects() : []).find(p => p.name === ctName) || null;
  const pid  = proj ? proj.id : null;

  // Tìm HĐ Chính của CT này
  Object.entries(hopDongData).forEach(([key, hd]) => {
    if (hd.deletedAt) return;
    const p = (typeof projects !== 'undefined' ? projects : []).find(pr => pr.id === key);
    const hdCtName = p ? p.name : key;
    if (hdCtName !== ctName) return;
    const tong = (hd.giaTri||0) + (hd.giaTriphu||0) + (hd.phatSinh||0);
    const label = (hd.ngay || '') + ' — ' + (tong ? fmtM(tong) : 'Chưa có giá trị');
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = label;
    sel.appendChild(opt);
  });
}

// ── Sub-tab navigation trong page-doanhthu ────────────────────
// 2 subtab: 'dt-sub-hdc' (HỢP ĐỒNG CHÍNH) · 'dt-sub-thu' (THU TIỀN).
// 3 thẻ thống kê nằm NGOÀI subtab nên luôn hiện; vẫn tính lại mỗi lần chuyển cho chắc.
function dtGoSub(btn, id) {
  document.querySelectorAll('#page-doanhthu .sub-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#dt-sub-nav .nav-link').forEach(b => b.classList.remove('active'));
  const pg = document.getElementById(id);
  if (pg) pg.classList.add('active');
  if (btn) btn.classList.add('active');
  _dtRenderDashboardMini();
  if (id === 'dt-sub-hdc')      renderHdcTable();
  else if (id === 'dt-sub-thu') renderThuTable();
  // (02/10/2026) Sub-tab LỢI NHUẬN đã tách thành tab chính → initLoiNhuan() (doanhthu.reports-export.js)
}

// ── Chuyển sang 1 subtab (nếu chưa mở) — dùng khi bấm Sửa ở bảng khác subtab ──
// Quy ước: nút subtab có ID = ID subtab + "-btn".
function dtShowSub(id) {
  const pg = document.getElementById(id);
  if (!pg || pg.classList.contains('active')) return;
  dtGoSub(document.getElementById(id + '-btn'), id);
}

// ── Bật/tắt trạng thái "Đang sửa" của form (prefix: 'hdc' | 'thu' | 'hdtp') ──
// Viền vàng quanh form + nhãn "Đang sửa" + nút Hủy sửa + đổi tiêu đề/nút Lưu.
function _dtSetEditing(prefix, on) {
  const card   = document.getElementById(prefix + '-form-card');
  const badge  = document.getElementById(prefix + '-editing-badge');
  const cancel = document.getElementById(prefix + '-cancel-btn');
  const title  = document.getElementById(prefix + '-form-title');
  const save   = document.getElementById(prefix + '-save-btn');
  if (card)   card.classList.toggle('dt-editing', !!on);
  if (badge)  badge.style.display  = on ? '' : 'none';
  if (cancel) cancel.style.display = on ? '' : 'none';
  if (prefix === 'hdc' || prefix === 'hdtp') {
    // (03/10/2026) 'hdtp' = form HĐ Thầu Phụ ở tab Công Nợ (cũng đã bỏ popup)
    const ten = prefix === 'hdc' ? 'Hợp Đồng Chính' : 'Hợp Đồng Thầu Phụ';
    if (title) title.textContent = on ? 'Sửa ' + ten : 'Khai Báo ' + ten;
    if (save)  save.innerHTML = on
      ? '<span class="material-symbols-outlined msi-gap">edit</span>Cập nhật'
      : '<span class="material-symbols-outlined msi-gap">save</span>Lưu';
  } else {
    if (title) title.textContent = on ? 'Sửa Khoản Thu' : 'Ghi Nhận Thu Tiền';
    if (save)  save.innerHTML = on
      ? '<span class="material-symbols-outlined msi-gap">edit</span>Cập nhật'
      : '<span class="material-symbols-outlined msi-gap">save</span>Ghi nhận Thu';
  }
}

// ── Cuộn tới form + đặt con trỏ vào 1 ô (thay cho việc mở popup trước đây) ──
function _dtFocusForm(cardId, focusId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const el = focusId ? document.getElementById(focusId) : null;
  if (el) setTimeout(() => el.focus({ preventScroll: true }), 300);
}

// ── Vẽ lại TOÀN BỘ tab Doanh Thu (3 thẻ + bảng của cả 2 subtab) ──
// Gọi sau khi lưu/sửa/xóa HĐ hoặc phiếu thu, và từ tab Quyết Toán (số quyết toán
// làm thay đổi Tổng giá trị HĐ ở bảng Tiến Độ). An toàn khi tab chưa mở (tự bỏ qua).
function dtRenderAll() {
  _dtRenderDashboardMini();
  renderHdcTable();
  renderThuTable();
}

// ── Danh sách tên đối tượng cho dropdown THU TIỀN ──
// = "CÔNG TY" (thu không thuộc dự án nào) + các công trình CHƯA quyết toán
//   (Chuẩn bị / Đang thi công / Hoàn thành chưa chốt sổ — loại bỏ status 'closed').
function _dtThuProjectOptions(projs) {
  const open = (projs || []).filter(p => p && p.id !== 'COMPANY' && p.status !== 'closed').map(p => p.name);
  return ['CÔNG TY', ...open];
}

// ── Chỉ nạp lại các dropdown trong 2 form (Công trình, Người TH, Thầu phụ) ──
// Tách riêng để nút Sửa nạp option mới nhất mà KHÔNG phải vẽ lại mọi bảng.
function _dtFillSelects() {
  // CT select: lấy từ projects lọc theo năm — không dùng cats.congTrinh, không có COMPANY
  // Cả 3 form khai báo (HĐ Chính, Ghi nhận thu, HĐ Thầu phụ) đều CHO PHÉP
  // chọn công trình đã "Đã quyết toán" — vì sau khi quyết toán vẫn có thể phát sinh thêm
  // chi phí chậm trễ, thu nốt tiền nợ, hoặc cập nhật lại HĐ chính.
  // (Form Quyết Toán đã chuyển sang tab QUYẾT TOÁN — tự nạp dropdown riêng.)
  const projForYear = (typeof getAllProjects === 'function' ? getAllProjects() : [])
    .filter(p => activeYear === 0 || _ctInActiveYear(p.name));
  ['hdc-ct-input','hdtp-ct-input'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel || sel.tagName !== 'SELECT') return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">-- Chọn công trình --</option>' +
      projForYear.map(p => `<option value="${x(p.name)}">${x(p.name)}</option>`).join('');
    if (cur) sel.value = cur;
  });

  // (04/10/2026) Form THU TIỀN: có hạng mục CÔNG TY, ẩn công trình "Đã quyết toán",
  // và là ô chọn có GÕ ĐỂ TÌM (dùng chung _ssEnhance của form Hóa Đơn Chi Phí).
  const thuSel = document.getElementById('thu-ct-input');
  if (thuSel && thuSel.tagName === 'SELECT') {
    const cur = thuSel.value;
    thuSel.innerHTML = '<option value="">-- Chọn công trình --</option>' +
      _dtThuProjectOptions(projForYear).map(n => `<option value="${x(n)}">${x(n)}</option>`).join('');
    if (cur) _setSelectFlexible(thuSel, cur);   // đang sửa phiếu của CT đã QT → vẫn giữ được giá trị
    if (typeof _ssEnhance === 'function') _ssEnhance(thuSel);
  }

  // Thầu phụ select
  const allTp = [...new Set([...cats.thauPhu].filter(Boolean))].sort((a,b) => a.localeCompare(b,'vi'));
  const tpSel = document.getElementById('hdtp-thauphu');
  if (tpSel && tpSel.tagName === 'SELECT') {
    const cur = tpSel.value;
    tpSel.innerHTML = '<option value="">-- Chọn thầu phụ --</option>' +
      allTp.map(v => `<option value="${x(v)}">${x(v)}</option>`).join('');
    if (cur) tpSel.value = cur;
  }

  // Người TH select (thu form + hdc form)
  const allNguoi = [...new Set([...cats.nguoiTH].filter(Boolean))].sort((a,b) => a.localeCompare(b,'vi'));
  const nguoiOpts = '<option value="">-- Chọn --</option>' +
    allNguoi.map(v => `<option value="${x(v)}">${x(v)}</option>`).join('');
  ['thu-nguoi','hdc-nguoi'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel || sel.tagName !== 'SELECT') return;
    const cur = sel.value;
    sel.innerHTML = nguoiOpts;
    if (cur) sel.value = cur;
  });
}

// ── Nạp dropdown + vẽ lại toàn bộ tab Doanh Thu (mở tab / đổi năm / sync xong) ──
function dtPopulateSels() {
  _dtFillSelects();
  dtRenderAll();
  // HĐ Thầu Phụ (tab Công Nợ) — giữ lời gọi cũ để đổi năm vẫn refresh bảng đó
  if (typeof renderHdtpTableTk === 'function') renderHdtpTableTk(_hdtpTkPage);
}

// ── Tab Doanh Thu KHÔNG tạo công trình — chỉ tab CÔNG TRÌNH mới được quản lý ──
// _dtAddCT đã bị vô hiệu hóa; nếu user cần thêm CT, phải qua tab CÔNG TRÌNH.
function _dtAddCT(_name) { /* no-op intentional */ }

// ── Thêm thầu phụ mới vào danh mục nếu chưa có ───────────────
function _dtAddTP(_name) { /* no-op intentional */ }
