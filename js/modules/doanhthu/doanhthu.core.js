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

// Pagination state cho tab Doanh Thu
// _hdcPage/_hdtpPage/_thuPage  → subtab KHAI BÁO (30 ngày gần nhất)
// _hdcTkPage/_hdtpTkPage/_thuTkPage → subtab THỐNG KÊ (toàn bộ)
let _hdcPage  = 0;
let _hdtpPage = 0;
let _thuPage  = 0;
let _hdcTkPage  = 0;
let _hdtpTkPage = 0;
let _thuTkPage  = 0;
const DT_PG   = 7;

// Số ngày coi là "gần nhất" cho subtab KHAI BÁO
const DT_RECENT_DAYS = 30;

// CT filter cho sub-tab KHAI BÁO ('' = tất cả)
let _dtCtFilter = '';
// CT filter riêng cho sub-tab THỐNG KÊ — cô lập với Khai Báo
let _dtTkCtFilter = '';
// (Giữ lại cho tương thích — sub-tab CÔNG NỢ cũ đã tách sang page riêng)
let _dtCnCtFilter = '';

// ── Helper: record có nằm trong DT_RECENT_DAYS ngày gần nhất không ──
function _dtWithinRecent(ngay) {
  if (!ngay) return false;
  const d = new Date(ngay);
  if (isNaN(d.getTime())) return false;
  const diffDays = (Date.now() - d.getTime()) / 86400000;
  return diffDays <= DT_RECENT_DAYS;
}

// ── Match record với CT filter Thống Kê ────────────────────────────────────
function _dtMatchProjFilter(record) {
  if (!_dtCtFilter) return true;
  if (record.projectId) {
    const proj = getAllProjects().find(p => p.name === _dtCtFilter);
    if (proj) return record.projectId === proj.id;
  }
  return (record.congtrinh || '') === _dtCtFilter;
}

// ── Match record với CT filter Công Nợ ─────────────────────────────────────
function _dtMatchCnProjFilter(record) {
  if (!_dtCnCtFilter) return true;
  if (record.projectId) {
    const proj = getAllProjects().find(p => p.name === _dtCnCtFilter);
    if (proj) return record.projectId === proj.id;
  }
  return (record.congtrinh || '') === _dtCnCtFilter;
}

// ── Match hopDongData entry (keyed by projectId or ct name) ────────────────
function _dtMatchHDCFilter(keyId, hd) {
  if (!_dtCtFilter) return true;
  // keyId có thể là projectId (UUID) hoặc tên CT (legacy)
  if (keyId === _dtCtFilter) return true;
  // Tìm project tương ứng với filter
  const filterProj = getAllProjects().find(p => p.name === _dtCtFilter);
  if (filterProj) {
    // keyId là projectId → so trực tiếp
    if (keyId === filterProj.id) return true;
    // hd.projectId fallback
    if (hd.projectId && hd.projectId === filterProj.id) return true;
  }
  // keyId là tên CT (chưa migrate) → so tên
  const keyProj = getAllProjects().find(p => p.id === keyId);
  if (keyProj && keyProj.name === _dtCtFilter) return true;
  return false;
}

// ── Match record với CT filter THỐNG KÊ ───────────────────────────────────
function _dtMatchTkProjFilter(record) {
  if (!_dtTkCtFilter) return true;
  if (record.projectId) {
    const proj = getAllProjects().find(p => p.name === _dtTkCtFilter);
    if (proj) return record.projectId === proj.id;
  }
  return (record.congtrinh || '') === _dtTkCtFilter;
}

// ── Match hopDongData entry với CT filter THỐNG KÊ ─────────────────────────
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

// ── Populate CT filter select cho sub-tab THỐNG KÊ ───────────────────────
// (KHAI BÁO không còn bộ lọc CT — đã gộp thành 1 bảng tổng hợp.)
function dtPopulateCtFilter() {
  const tkSel = document.getElementById('dt-tk-ct-filter-sel');
  if (tkSel) tkSel.innerHTML = _buildProjFilterOpts(_dtTkCtFilter, { includeCompany: false, placeholder: '-- Tất cả công trình --' });
}

// ── Áp dụng CT filter → CHỈ re-render bảng KHAI BÁO (30 ngày) ─────────────
function dtSetCtFilter(val) {
  _dtCtFilter = val || '';
  _hdcPage = 0; _hdtpPage = 0; _thuPage = 0;
  renderHdcTable(0);
  renderHdtpTable(0);
  renderThuTable(0);
}

// ── Áp dụng CT filter → CHỈ re-render bảng THỐNG KÊ (toàn bộ) ─────────────
function dtSetTkCtFilter(val) {
  _dtTkCtFilter = val || '';
  _hdcTkPage = 0; _hdtpTkPage = 0; _thuTkPage = 0;
  renderHdcTableTk(0);
  renderHdtpTableTk(0);
  renderThuTableTk(0);
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

// ── Helper: render HTML phân trang ────────────────────────────
function _dtPaginationHtml(total, curPage, onClickFn) {
  const pages = Math.ceil(total / DT_PG);
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

// ── Text search state (KHAI BÁO) ─────────────────────────────
let _dtSearch = '';

function dtSetSearch(val) {
  _dtSearch = (val || '').trim().toLowerCase();
  _hdcPage = 0; _hdtpPage = 0; _thuPage = 0;
  renderHdcTable(0);
  renderHdtpTable(0);
  renderThuTable(0);
}

// ── Text search state (THỐNG KÊ) ─────────────────────────────
let _dtTkSearch = '';

function dtSetTkSearch(val) {
  _dtTkSearch = (val || '').trim().toLowerCase();
  _hdcTkPage = 0; _hdtpTkPage = 0; _thuTkPage = 0;
  renderHdcTableTk(0);
  renderHdtpTableTk(0);
  renderThuTableTk(0);
}

// ── Dashboard mini: 3 stat cards trên sub-tab TỔNG QUAN ──────
function _dtRenderDashboardMini() {
  const hdEl  = document.getElementById('dt-mini-tonghd');
  const thuEl = document.getElementById('dt-mini-dathu');
  const conEl = document.getElementById('dt-mini-con');
  if (!hdEl) return;

  let tongHD = 0;
  Object.values(hopDongData).forEach(hd => {
    if (!hd.deletedAt && _dtInYear(hd.ngay)) tongHD += (hd.giaTri||0) + (hd.giaTriphu||0) + (hd.phatSinh||0);
  });
  let tongThu = 0;
  thuRecords.forEach(r => { if (!r.deletedAt && inActiveYear(r.ngay)) tongThu += (r.tien||0); });
  const conPhaiThu = tongHD - tongThu;

  hdEl.textContent  = tongHD  ? fmtM(tongHD)  : '—';
  thuEl.textContent = tongThu  ? fmtM(tongThu)  : '—';
  conEl.textContent = tongHD  ? fmtM(conPhaiThu) : '—';
  conEl.className = 'fw-bold ' + (conPhaiThu > 0 ? 'text-warning' : conPhaiThu < 0 ? 'text-danger' : 'text-success');
  conEl.style.fontSize = '20px';
}

// ── Modal open/close helpers ──────────────────────────────────
function openDtModal(type) {
  ['hdc','thu','hdtp','qt'].forEach(t => {
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
  const ids = type ? ['dt-modal-' + type + '-ov'] : ['dt-modal-hdc-ov','dt-modal-thu-ov','dt-modal-hdtp-ov','dt-modal-qt-ov'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('open'); });
  // Mở khóa cuộn trang nền nếu không còn modal nào đang open
  const anyOpen = ['hdc','thu','hdtp','qt'].some(t => {
    const el = document.getElementById('dt-modal-' + t + '-ov');
    return el && el.classList.contains('open');
  });
  if (!anyOpen) document.body.classList.remove('modal-open');
}

// ── Progress info khi chọn CT trong modal Thu Tiền ────────────
function _thuOnCtChange(ctName) {
  const infoEl = document.getElementById('thu-progress-info');
  if (!infoEl) return;
  if (!ctName) { infoEl.style.display = 'none'; return; }

  const proj  = (typeof getAllProjects === 'function' ? getAllProjects() : []).find(p => p.name === ctName) || null;
  const pid   = proj ? proj.id : null;

  // Tìm HĐ chính của CT
  let hdKey = null;
  if (pid && hopDongData[pid] && !hopDongData[pid].deletedAt) {
    hdKey = pid;
  } else {
    hdKey = Object.keys(hopDongData).find(k => {
      const hd = hopDongData[k];
      if (hd.deletedAt) return false;
      const p2 = (typeof projects !== 'undefined' ? projects : []).find(pr => pr.id === k);
      return p2 ? p2.name === ctName : k === ctName;
    }) || null;
  }

  const hd     = hdKey ? hopDongData[hdKey] : null;
  const tongHD = hd ? (hd.giaTri||0) + (hd.giaTriphu||0) + (hd.phatSinh||0) : 0;

  let tongThu = 0;
  thuRecords.forEach(r => {
    if (r.deletedAt) return;
    if ((pid && r.projectId === pid) || (!pid && (r.congtrinh||'') === ctName)) tongThu += (r.tien||0);
  });
  const conLai = tongHD - tongThu;

  const hdSpan  = document.getElementById('thu-prog-hd');
  const thuSpan = document.getElementById('thu-prog-dathu');
  const conSpan = document.getElementById('thu-prog-con');
  if (hdSpan)  hdSpan.textContent  = tongHD ? fmtM(tongHD) : 'Chưa có HĐ';
  if (thuSpan) thuSpan.textContent = fmtM(tongThu);
  if (conSpan) {
    conSpan.textContent = fmtM(conLai);
    conSpan.className = 'fw-bold ' + (conLai > 0 ? 'text-warning' : conLai < 0 ? 'text-danger' : 'text-success');
  }
  infoEl.style.display = 'flex';
}

// ── Progress info khi chọn CT trong modal Quyết Toán ──────────
// Kế thừa logic _thuOnCtChange(): hiện Tổng giá trị HĐ ban đầu + Đã thu.
function _qtOnCtChange(ctName) {
  const infoEl = document.getElementById('qt-progress-info');
  if (!infoEl) return;
  if (!ctName) { infoEl.style.display = 'none'; return; }

  const proj = (typeof getAllProjects === 'function' ? getAllProjects() : []).find(p => p.name === ctName) || null;
  const pid  = proj ? proj.id : null;

  // Tìm HĐ chính của CT (ưu tiên theo projectId, fallback theo tên)
  let hdKey = null;
  if (pid && hopDongData[pid] && !hopDongData[pid].deletedAt) {
    hdKey = pid;
  } else {
    hdKey = Object.keys(hopDongData).find(k => {
      const hd = hopDongData[k];
      if (hd.deletedAt) return false;
      const p2 = (typeof projects !== 'undefined' ? projects : []).find(pr => pr.id === k);
      return p2 ? p2.name === ctName : k === ctName;
    }) || null;
  }

  const hd     = hdKey ? hopDongData[hdKey] : null;
  const tongHD = hd ? (hd.giaTri||0) + (hd.giaTriphu||0) + (hd.phatSinh||0) : 0;

  let tongThu = 0;
  thuRecords.forEach(r => {
    if (r.deletedAt) return;
    if ((pid && r.projectId === pid) || (!pid && (r.congtrinh||'') === ctName)) tongThu += (r.tien||0);
  });

  const hdSpan  = document.getElementById('qt-prog-hd');
  const thuSpan = document.getElementById('qt-prog-dathu');
  if (hdSpan)  hdSpan.textContent  = tongHD ? fmtM(tongHD) : 'Chưa có HĐ';
  if (thuSpan) thuSpan.textContent = fmtM(tongThu);
  infoEl.style.display = 'flex';
}

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
function dtGoSub(btn, id) {
  document.querySelectorAll('#page-doanhthu .sub-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#page-doanhthu .nav-link').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
  if (id === 'dt-sub-khaibao') {
    _dtRenderDashboardMini();
    renderKhaiBaoTable(_kbPage);
  } else if (id === 'dt-sub-thongke') {
    dtPopulateCtFilter();
    renderHdcTableTk(_hdcTkPage);
    renderHdtpTableTk(_hdtpTkPage);
    renderThuTableTk(_thuTkPage);
    if (typeof renderQtTableTk === 'function') renderQtTableTk(_qtTkPage);
  } else if (id === 'dt-sub-loinhuan') {
    if (typeof renderLoiNhuan === 'function') renderLoiNhuan();
  }
}

// ── Populate selects trong tab Doanh Thu ─────────────────────
function dtPopulateSels() {
  // CT select: lấy từ projects lọc theo năm — không dùng cats.congTrinh, không có COMPANY
  // 3 tab nhập liệu (HĐ Chính, Ghi nhận thu, HĐ Thầu phụ) → ẩn CT đã quyết toán,
  // nhưng vẫn giữ giá trị đang chọn (cur) để edit dữ liệu cũ không mất.
  const projForYear = (typeof getAllProjects === 'function' ? getAllProjects() : [])
    .filter(p => activeYear === 0 || _ctInActiveYear(p.name));
  ['hdc-ct-input','thu-ct-input','hdtp-ct-input','qt-ct-input'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel || sel.tagName !== 'SELECT') return;
    const cur = sel.value;
    // Quyết toán thường làm sau khi đóng công trình → vẫn cho chọn CT đã đóng
    const visible = id === 'qt-ct-input'
      ? projForYear
      : projForYear.filter(p => p.status !== 'closed' || p.name === cur);
    sel.innerHTML = '<option value="">-- Chọn công trình --</option>' +
      visible.map(p => `<option value="${x(p.name)}">${x(p.name)}</option>`).join('');
    if (cur) sel.value = cur;
  });

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
  ['thu-nguoi','hdc-nguoi','qt-nguoi'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel || sel.tagName !== 'SELECT') return;
    const cur = sel.value;
    sel.innerHTML = nguoiOpts;
    if (cur) sel.value = cur;
  });

  // Refresh bảng KHAI BÁO (gộp) + các bảng THỐNG KÊ khi năm thay đổi
  renderKhaiBaoTable(0);
  renderHdcTableTk(_hdcTkPage);
  renderHdtpTableTk(_hdtpTkPage);
  renderThuTableTk(_thuTkPage);
  if (typeof renderQtTableTk === 'function') renderQtTableTk(_qtTkPage);
}

// ── Tab Doanh Thu KHÔNG tạo công trình — chỉ tab CÔNG TRÌNH mới được quản lý ──
// _dtAddCT đã bị vô hiệu hóa; nếu user cần thêm CT, phải qua tab CÔNG TRÌNH.
function _dtAddCT(_name) { /* no-op intentional */ }

// ── Thêm thầu phụ mới vào danh mục nếu chưa có ───────────────
function _dtAddTP(_name) { /* no-op intentional */ }
