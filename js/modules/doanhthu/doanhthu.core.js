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

// [ADDED] Migration & Globals cho tính năng Khối lượng + Đơn giá Hợp Đồng
let _hdcItems = [];
let _hdtpItems = [];

function calcHopDongValue(hd) {
  if (hd.items && hd.items.length) {
    return hd.items.reduce((sum, i) => sum + (parseFloat(i.sl) || 0) * (parseFloat(i.donGia) || 0), 0);
  }
  return (parseFloat(hd.sl) || 1) * (parseFloat(hd.donGia) || 0);
}

function _migrateHopDongSL() {
  let changed = false;
  Object.values(hopDongData).forEach(hd => {
    if (hd.sl === undefined) { hd.sl = 1; hd.donGia = hd.giaTri || 0; changed = true; }
  });
  if (changed) save('hopdong_v1', hopDongData);

  changed = false;
  thauPhuContracts.forEach(hd => {
    if (hd.sl === undefined) { hd.sl = 1; hd.donGia = hd.giaTri || 0; changed = true; }
  });
  if (changed) save('thauphu_v1', thauPhuContracts);
}
_migrateHopDongSL();

// [ADDED] Khởi tạo giao diện UI nhập chi tiết
function _initDoanhThuAddons() {
  ['hdc','hdtp'].forEach(prefix => {
    const giaTriInput = document.getElementById(`${prefix}-giatri`);
    if (!giaTriInput || document.getElementById(`${prefix}-sl`)) return;
    const giaTriField = giaTriInput.closest('.dt-field');
    if (!giaTriField) return;

    const uiHtml = `
      <div class="dt-field">
        <label>Khối Lượng</label>
        <input type="number" id="${prefix}-sl" value="1" placeholder="1" oninput="window.${prefix}CalcAuto()">
      </div>
      <div class="dt-field">
        <label>Đơn Giá (đ)</label>
        <input type="text" id="${prefix}-dongia" placeholder="0" oninput="fmtInputMoney(this); window.${prefix}CalcAuto()">
      </div>
    `;
    giaTriField.insertAdjacentHTML('beforebegin', uiHtml);

    const formGrid = giaTriField.parentElement;
    formGrid.insertAdjacentHTML('afterend', `
      <div style="margin-top: 10px; grid-column: 1 / -1;">
        <button type="button" class="btn btn-outline-secondary btn-sm" id="${prefix}-btn-chitiet" onclick="window.toggle${prefix}ChiTiet()">📊 Khối lượng chi tiết</button>
        <button type="button" class="btn btn-outline-secondary btn-sm" onclick="copyKLCT(this)">📋 Copy</button>
        <button type="button" class="btn btn-outline-secondary btn-sm" onclick="pasteKLCT(this)">📥 Paste</button>
        <div id="${prefix}-chitiet-wrap" style="display:none; margin-top: 10px; border: 1px solid var(--bs-border-color); padding: 10px; border-radius: 6px; background: var(--bs-tertiary-bg)">
          <div style="overflow-x:auto;">
            <table class="entry-table" style="width:100%; min-width: 500px;">
              <thead>
                <tr>
                  <th style="text-align:left">Tên hạng mục</th>
                  <th style="width:70px;text-align:center">Đơn vị</th> <!-- [ADDED] column donVi -->
                  <th style="width:80px;text-align:center">Khối lượng</th>
                  <th style="width:140px;text-align:right">Đơn giá (đ)</th>
                  <th style="width:150px;text-align:right">Thành tiền (đ)</th>
                  <th style="width:40px"></th>
                </tr>
              </thead>
              <tbody id="${prefix}-chitiet-tbody"></tbody>
            </table>
          </div>
          <div style="margin-top:8px; display:flex; justify-content:space-between; align-items:center">
            <button type="button" class="btn btn-outline-secondary btn-sm" onclick="window.add${prefix}ChiTietRow()">+ Thêm dòng</button>
            <div style="font-weight:bold; font-size:13px"><span class="text-body-secondary">Tổng chi tiết: </span><span id="${prefix}-chitiet-tong" class="text-warning">0</span></div>
          </div>
        </div>
      </div>
    `);

    giaTriInput.setAttribute('readonly', 'true');
    giaTriInput.style.background = 'var(--bs-tertiary-bg)';
    giaTriInput.style.pointerEvents = 'none';

    const label = giaTriField.querySelector('label');
    if (label) label.innerHTML += ' <i class="text-secondary" style="font-weight:normal">(Tự động)</i>';
  });
}

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
        <td><input type="number" class="bare-input" style="width:100%;text-align:center" value="${it.sl!=null ? it.sl : 1}" oninput="updateItem('${prefix}', ${i}, 'sl', this.value)"></td>
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
      if (arr.length === 0) arr.push({ name: '', donVi: '', sl: 1, donGia: 0 }); // [ADDED] column donVi
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
    if (prefix === 'hdc') window.hdcCalcAuto(); else window.hdtpCalcAuto();
  };

  window[`${prefix}CalcAuto`] = function() {
    const arr = getItemsArr();
    const isDetailed = arr && arr.length > 0;
    const slEl = document.getElementById(`${prefix}-sl`);
    const dgEl = document.getElementById(`${prefix}-dongia`);
    if (!slEl || !dgEl) return;

    if (isDetailed) {
      slEl.disabled = true;
      dgEl.disabled = true;
      slEl.style.opacity = '0.5';
      dgEl.style.opacity = '0.5';
    } else {
      slEl.disabled = false;
      dgEl.disabled = false;
      slEl.style.opacity = '1';
      dgEl.style.opacity = '1';
    }

    const hd = {
      sl: parseFloat(slEl.value) || 1,
      donGia: _readMoneyInput(`${prefix}-dongia`),
      items: arr
    };

    const val = calcHopDongValue(hd);
    const giaTriInput = document.getElementById(`${prefix}-giatri`);
    if (giaTriInput) {
      giaTriInput.dataset.raw = val || 0;
      giaTriInput.value = val ? val.toLocaleString('vi-VN') : '';
    }
    if (prefix === 'hdc') {
      if (typeof hdcUpdateTotal === 'function') hdcUpdateTotal();
    } else {
      if (typeof hdtpUpdateTotal === 'function') hdtpUpdateTotal();
    }
  };
}

bindItemsToTable('hdc', () => _hdcItems);
bindItemsToTable('hdtp', () => _hdtpItems);

// Pagination state cho tab Doanh Thu
let _hdcPage  = 0;
let _hdtpPage = 0;
let _thuPage  = 0;
const DT_PG   = 7;

// CT filter cho sub-tab THỐNG KÊ ('' = tất cả)
let _dtCtFilter = '';

// ── Match record với CT filter hiện tại (dùng projectId → fallback congtrinh) ─
function _dtMatchProjFilter(record) {
  if (!_dtCtFilter) return true;
  if (record.projectId) {
    const proj = getAllProjects().find(p => p.name === _dtCtFilter);
    if (proj) return record.projectId === proj.id;
  }
  return (record.congtrinh || '') === _dtCtFilter;
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

// ── Populate CT filter select trong THỐNG KÊ ──────────────────────────────
function dtPopulateCtFilter() {
  ['dt-ct-filter-sel', 'dt-cn-ct-filter-sel'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) sel.innerHTML = _buildProjFilterOpts(_dtCtFilter, { includeCompany: false, placeholder: '-- Tất cả công trình --' });
  });
}

// ── Áp dụng CT filter và re-render tất cả bảng THỐNG KÊ ───────────────────
function dtSetCtFilter(val) {
  _dtCtFilter = val || '';
  _hdcPage = 0; _hdtpPage = 0; _thuPage = 0;
  renderHdcTable(0);
  renderHdtpTable(0);
  renderThuTable(0);
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

// ── Sub-tab navigation trong page-doanhthu ────────────────────
function dtGoSub(btn, id) {
  document.querySelectorAll('#page-doanhthu .sub-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#page-doanhthu .nav-link').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
  if (id === 'dt-sub-thongke') {
    _hdcPage = 0; _hdtpPage = 0; _thuPage = 0;
    dtPopulateCtFilter();
    renderHdcTable(0);
    renderHdtpTable(0);
    renderThuTable(0);
    renderCongNoThauPhu();
    renderCongNoNhaCungCap();
  } else if (id === 'dt-sub-congno') {
    dtPopulateCtFilter();
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
    const tkBtn = document.getElementById('dt-sub-thongke-btn');
    if (tkBtn) tkBtn.insertAdjacentElement('afterend', btn);
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
        onchange="dtSetCtFilter(this.value)">
        <option value="">-- Tất cả công trình --</option>
      </select>`;
    cnPage.appendChild(filterRow);
  }

  // Di chuyển bảng Công Nợ Thầu Phụ từ sub-tab Thống Kê sang đây
  const congnoTbody = document.getElementById('congno-tbody');
  const congnoWrap = congnoTbody ? congnoTbody.closest('.records-wrap') : null;
  const congnoHeader = congnoWrap ? congnoWrap.previousElementSibling : null;
  if (congnoWrap && congnoHeader && congnoHeader.parentElement?.id === 'dt-sub-thongke') {
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
  const projForYear = (typeof getAllProjects === 'function' ? getAllProjects() : [])
    .filter(p => activeYear === 0 || _ctInActiveYear(p.name));
  const ctOpts = '<option value="">-- Chọn công trình --</option>' +
    projForYear.map(p => `<option value="${x(p.name)}">${x(p.name)}</option>`).join('');
  ['hdc-ct-input','thu-ct-input','hdtp-ct-input'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel || sel.tagName !== 'SELECT') return;
    const cur = sel.value;
    sel.innerHTML = ctOpts;
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
