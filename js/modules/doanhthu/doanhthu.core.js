// doanhthu.core.js — Global data, state, and shared helpers for Doanh Thu
// Load order: sau thietbi.js, trước doanhthu.forms.js

// ─── Biến toàn cục (main.js sẽ gán lại sau dbInit) ─────────────
let hopDongData      = load('hopdong_v1', {});
let thuRecords       = load('thu_v1', []);
let thauPhuContracts = load('thauphu_v1', []);

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
        <td style="text-align:center"><button type="button" class="btn btn-outline-secondary btn-sm text-danger" style="border:none;padding:2px 6px" onclick="removeItem('${prefix}', ${i})">✕</button></td>
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
let _hdcPage  = 0;
let _hdtpPage = 0;
let _thuPage  = 0;
const DT_PG   = 7;

// CT filter cho sub-tab THỐNG KÊ ('' = tất cả)
let _dtCtFilter = '';
// CT filter riêng cho sub-tab CÔNG NỢ — cô lập hoàn toàn với Thống Kê
let _dtCnCtFilter = '';

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

// ── Populate CT filter select — mỗi sub-tab dùng state riêng ──────────────
function dtPopulateCtFilter() {
  const tkSel = document.getElementById('dt-ct-filter-sel');
  if (tkSel) tkSel.innerHTML = _buildProjFilterOpts(_dtCtFilter, { includeCompany: false, placeholder: '-- Tất cả công trình --' });
  const cnSel = document.getElementById('dt-cn-ct-filter-sel');
  if (cnSel) cnSel.innerHTML = _buildProjFilterOpts(_dtCnCtFilter, { includeCompany: false, placeholder: '-- Tất cả công trình --' });
}

// ── Áp dụng CT filter → CHỈ re-render bảng THỐNG KÊ ──────────────────────
function dtSetCtFilter(val) {
  _dtCtFilter = val || '';
  _hdcPage = 0; _hdtpPage = 0; _thuPage = 0;
  renderHdcTable(0);
  renderHdtpTable(0);
  renderThuTable(0);
}

// ── Áp dụng CT filter → CHỈ re-render bảng CÔNG NỢ ───────────────────────
function dtSetCnCtFilter(val) {
  _dtCnCtFilter = val || '';
  renderCongNoThauPhu();
  renderCongNoNhaCungCap();
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

// ── Text search state (THỐNG KÊ) ─────────────────────────────
let _dtSearch = '';

function dtSetSearch(val) {
  _dtSearch = (val || '').trim().toLowerCase();
  _hdcPage = 0; _hdtpPage = 0; _thuPage = 0;
  renderHdcTable(0);
  renderHdtpTable(0);
  renderThuTable(0);
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
    _hdcPage = 0; _hdtpPage = 0; _thuPage = 0;
    _dtSearch = '';
    const srch = document.getElementById('dt-search-input');
    if (srch) srch.value = '';
    const tkSel = document.getElementById('dt-ct-filter-sel');
    if (tkSel) tkSel.innerHTML = _buildProjFilterOpts(_dtCtFilter, { includeCompany: false, placeholder: '-- Tất cả công trình --' });
    renderHdcTable(0);
    renderHdtpTable(0);
    renderThuTable(0);
  } else if (id === 'dt-sub-congno') {
    const cnSel = document.getElementById('dt-cn-ct-filter-sel');
    if (cnSel) cnSel.innerHTML = _buildProjFilterOpts(_dtCnCtFilter, { includeCompany: false, placeholder: '-- Tất cả công trình --' });
    renderCongNoThauPhu();
    renderCongNoNhaCungCap();
  }
}

// Đảm bảo sub-tab Công Nợ tồn tại (button + page) và di chuyển bảng cũ sang đó
function dtEnsureCongNoSubtab() {
  const page = document.getElementById('page-doanhthu');
  const subNav = document.getElementById('dt-sub-nav');
  if (!page || !subNav) return;

  // Tạo nút sub-tab nếu chưa có
  if (!document.getElementById('dt-sub-congno-btn')) {
    const btn = document.createElement('button');
    btn.className = 'nav-link';
    btn.id = 'dt-sub-congno-btn';
    btn.innerHTML = '💳 CÔNG NỢ';
    btn.setAttribute('onclick', "dtGoSub(this,'dt-sub-congno')");
    const hopdongBtn = document.getElementById('dt-sub-khaibao-btn');
    if (hopdongBtn) hopdongBtn.insertAdjacentElement('afterend', btn);
    else subNav.appendChild(btn);
  }

  // Tạo trang sub-tab nếu chưa có
  let cnPage = document.getElementById('dt-sub-congno');
  if (!cnPage) {
    cnPage = document.createElement('div');
    cnPage.className = 'sub-page';
    cnPage.id = 'dt-sub-congno';
    page.appendChild(cnPage);
  }

  // Filter CT (re-use component)
  if (!document.getElementById('dt-cn-filter-row')) {
    const filterRow = document.createElement('div');
    filterRow.id = 'dt-cn-filter-row';
    filterRow.style = 'margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap';
    filterRow.innerHTML = `
      <label class="text-secondary" style="font-size:12px;font-weight:600">Lọc Công Trình:</label>
      <select id="dt-cn-ct-filter-sel" class="form-select form-select-sm w-auto" style="min-width:220px;max-width:340px"
        onchange="dtSetCnCtFilter(this.value)">
        <option value="">-- Tất cả công trình --</option>
      </select>`;
    cnPage.appendChild(filterRow);
  }

  // Di chuyển bảng Công Nợ Thầu Phụ từ sub-tab Thống Kê sang đây
  const congnoTbody = document.getElementById('congno-tbody');
  const congnoWrap = congnoTbody ? congnoTbody.closest('.records-wrap') : null;
  const congnoHeader = congnoWrap ? congnoWrap.previousElementSibling : null;
  if (congnoWrap && congnoHeader && cnPage && !cnPage.contains(congnoWrap)) {
    cnPage.appendChild(congnoHeader);
    cnPage.appendChild(congnoWrap);
  }

  // Thêm bảng Công Nợ Nhà Cung Cấp (nếu chưa có)
  if (!document.getElementById('congno-ncc-tbody')) {
    const header = document.createElement('div');
    header.className = 'section-header d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3';
    header.innerHTML = `<div class="section-title fw-bold mb-0 d-flex align-items-center gap-2"><span class="dot"></span>🟠 Công Nợ Nhà Cung Cấp</div>`;

    const wrap = document.createElement('div');
    wrap.className = 'records-wrap card shadow-sm overflow-hidden';
    wrap.style = 'margin-bottom:24px';
    wrap.innerHTML = `
      <div style="overflow-x:auto">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead>
            <tr class="text-secondary" style="font-size:11px;border-bottom:2px solid var(--bs-border-color)">
              <th style="text-align:left;padding:8px 12px;font-weight:700">Nhà Cung Cấp</th>
              <th style="text-align:left;padding:8px 10px;font-weight:700">Công Trình</th>
              <th style="text-align:right;padding:8px 10px;font-weight:700;min-width:140px;white-space:nowrap">Tổng Đã Ứng</th>
              <th style="text-align:right;padding:8px 10px;font-weight:700;min-width:140px;white-space:nowrap">Tổng Số Tiền</th>
              <th style="text-align:right;padding:8px 10px;font-weight:700;min-width:140px;white-space:nowrap">Còn Phải TT</th>
            </tr>
          </thead>
          <tbody id="congno-ncc-tbody"></tbody>
        </table>
      </div>
      <div id="congno-ncc-empty" class="text-secondary" style="text-align:center;padding:32px;font-size:13px;display:none">Chưa có dữ liệu công nợ nhà cung cấp</div>
    `;

    cnPage.appendChild(header);
    cnPage.appendChild(wrap);
  }
}

// ── Populate selects trong tab Doanh Thu ─────────────────────
function dtPopulateSels() {
  // CT select: lấy từ projects lọc theo năm — không dùng cats.congTrinh, không có COMPANY
  // 3 tab nhập liệu (HĐ Chính, Ghi nhận thu, HĐ Thầu phụ) → ẩn CT đã quyết toán,
  // nhưng vẫn giữ giá trị đang chọn (cur) để edit dữ liệu cũ không mất.
  const projForYear = (typeof getAllProjects === 'function' ? getAllProjects() : [])
    .filter(p => activeYear === 0 || _ctInActiveYear(p.name));
  ['hdc-ct-input','thu-ct-input','hdtp-ct-input'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel || sel.tagName !== 'SELECT') return;
    const cur = sel.value;
    const visible = projForYear.filter(p => p.status !== 'closed' || p.name === cur);
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
  ['thu-nguoi','hdc-nguoi'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel || sel.tagName !== 'SELECT') return;
    const cur = sel.value;
    sel.innerHTML = nguoiOpts;
    if (cur) sel.value = cur;
  });

  // Refresh bảng THỐNG KÊ khi năm thay đổi
  renderHdcTable(_hdcPage);
  renderHdtpTable(_hdtpPage);
  renderCongNoThauPhu();
  renderCongNoNhaCungCap();
}

// ── Tab Doanh Thu KHÔNG tạo công trình — chỉ tab CÔNG TRÌNH mới được quản lý ──
// _dtAddCT đã bị vô hiệu hóa; nếu user cần thêm CT, phải qua tab CÔNG TRÌNH.
function _dtAddCT(_name) { /* no-op intentional */ }

// ── Thêm thầu phụ mới vào danh mục nếu chưa có ───────────────
function _dtAddTP(_name) { /* no-op intentional */ }
