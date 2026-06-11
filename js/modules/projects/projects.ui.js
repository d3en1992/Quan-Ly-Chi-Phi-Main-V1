// projects.ui.js — Full UI tab Công Trình
// Load order: sau projects.migration-selects.js

// _fmtProjDate — alias của fmtISODate() (tienich.js); giữ tên để không
// phải sửa các call-site bên trong file này.
const _fmtProjDate = (iso) => fmtISODate(iso);

// Metadata hiển thị cho từng trạng thái
const _PT_STATUS_META = {
  planning:  { label: 'Chuẩn bị thi công', color: 'var(--bs-primary)',   bg: 'rgba(var(--bs-primary-rgb),.1)' },
  active:    { label: 'Đang thi công',      color: 'var(--bs-success)',   bg: 'rgba(var(--bs-success-rgb),.1)' },
  completed: { label: 'Hoàn thành',         color: 'var(--bs-warning)',   bg: 'rgba(var(--bs-warning-rgb),.1)' },
  closed:    { label: 'Đã quyết toán',      color: 'var(--bs-secondary)', bg: 'rgba(var(--bs-secondary-rgb),.1)' }
};

const _PT_GROUP_LABELS = {
  planning:  '📋 Chuẩn Bị Thi Công',
  active:    '🏗️ Đang Thi Công',
  completed: '✅ Hoàn Thành (Chưa QT)',
  closed:    '🔒 Đã Quyết Toán'
};

const _PT_ORDER = ['planning','active','completed','closed'];

// ── Điều hướng sang tab khác và auto-set CT filter ─────────────────
function _goTabWithCT(tabId, ctName) {
  // Map alias IDs → actual data-page IDs (nav buttons dùng tên thật)
  const _pageId = { hoadon: 'nhap', ung: 'nhapung', thongke: 'thongkecphd' }[tabId] || tabId;

  const navBtn = document.querySelector(`[data-page="${_pageId}"]`);
  if (navBtn) goPage(navBtn, _pageId);
  closeModal();

  setTimeout(() => {
    if (tabId === 'hoadon') {
      // Đảm bảo sub-tab "Tất cả CP/HĐ" đang active rồi mới set filter
      const subBtn = document.querySelector('#page-nhap .nav-link[onclick*="sub-tat-ca"]');
      if (subBtn) goSubPage(subBtn, 'sub-tat-ca');
      const sel = document.getElementById('f-ct');
      if (sel) { sel.value = ctName; filterAndRender(); }

    } else if (tabId === 'ung') {
      // nhapung đã gọi buildUngFilters() trong goPage — giờ chỉ cần set CT filter
      const sel = document.getElementById('uf-ct');
      if (sel) { sel.value = ctName; filterAndRenderUng(); }

    } else if (tabId === 'doanhthu') {
      _dtCtFilter = ctName;
      const subBtn = document.getElementById('dt-sub-thongke-btn');
      if (subBtn) dtGoSub(subBtn, 'dt-sub-thongke');

    } else if (tabId === 'thietbi') {
      const sel = document.getElementById('tb-filter-ct');
      if (sel) { sel.value = ctName; tbPage = 1; tbRenderList(); }

    } else if (tabId === 'thongke') {
      const sel = document.getElementById('f-ct');
      if (sel) { sel.value = ctName; filterAndRender(); }
    }
  }, 150);
}

// ── Entry point (gọi bởi goPage + _refreshAllTabs) ─────────────────
function renderProjectsPage() {
  renderCTOverview();
}

// ── Tính chi phí cho một công trình (theo activeYear) ──────────────
// Dùng cho detail modal (single project) — gọi getInvoicesCached() một lần.
function _ctGetCosts(project) {
  const matched = getInvoicesCached().filter(inv => {
    if (!inActiveYear(inv.ngay)) return false;
    if (inv.projectId) return inv.projectId === project.id;
    return inv.congtrinh === project.name;
  });
  return {
    total: matched.reduce((s, i) => s + (i.thanhtien || i.tien || 0), 0),
    count: matched.length,
    invs:  matched
  };
}

// ── Xây dựng invoice map một lần cho toàn bộ danh sách ─────────────
// Gọi một lần trước khi render N project cards để tránh lặp filter.
// Trả về { byId, byName, all }:
//   byId   — projectId  → [inv]  (cho records đã có projectId)
//   byName — congtrinh  → [inv]  (backward compat: records chưa có projectId)
//   all    — toàn bộ invoices đã lọc theo activeYear
function _buildInvoiceMap() {
  const all   = getInvoicesCached().filter(inv => inActiveYear(inv.ngay));
  const byId   = {};
  const byName = {};
  for (const inv of all) {
    if (inv.projectId) {
      if (!byId[inv.projectId])     byId[inv.projectId]     = [];
      byId[inv.projectId].push(inv);
    } else if (inv.congtrinh) {
      if (!byName[inv.congtrinh])   byName[inv.congtrinh]   = [];
      byName[inv.congtrinh].push(inv);
    }
  }
  return { byId, byName, all };
}

// ── Lookup chi phí từ map đã build sẵn (O(1) per project) ──────────
function _ctGetCostsFromMap(project, invMap) {
  const matched = (invMap.byId[project.id] || []).concat(invMap.byName[project.name] || []);
  return {
    total: matched.reduce((s, i) => s + (i.thanhtien || i.tien || 0), 0),
    count: matched.length,
    invs:  matched
  };
}

// ── Tính TỔNG CHI thực tế của một công trình (single source of truth) ──
// Trả về cùng giá trị "Tổng Chi Công Trình" như trong modal chi tiết, để
// thẻ ngoài Dashboard và modal luôn khớp nhau. KHÔNG bao gồm chi phí chung
// CÔNG TY phân bổ (đó là số phụ hiển thị riêng "/X").
//
// Công thức: tổng HĐ + ứng thầu phụ + ứng NCC − công nợ NCC (đã nằm trong HĐ)
//   - ungTp  : ứng thầu phụ (loai='thauphu') của CT, theo năm đang chọn
//   - ungNcc : ứng nhà cung cấp (loai='nhacungcap') của CT, theo năm đang chọn
//   - tongHopDongNcc: phần HĐ thuộc các NCC mà CT này đã ứng → trừ ra để tránh
//     double-count (vì các HĐ đó đã được cộng trong c.total)
//
// @param {Object} p  Project (cần p.id, p.name)
// @param {Object} c  Cost object từ _ctGetCosts / _ctGetCostsFromMap ({ total, invs })
// @returns {{ tongChi, ungTp, ungNcc, tongHopDongNcc }}
function _ctTongChi(p, c) {
  const _hasUng = typeof ungRecords !== 'undefined';

  // Ứng thầu phụ của CT theo năm
  const ungTp = _hasUng ? ungRecords.filter(r => {
    if (r.deletedAt || r.loai !== 'thauphu' || !inActiveYear(r.ngay)) return false;
    return r.projectId ? r.projectId === p.id : r.congtrinh === p.name;
  }).reduce((s, r) => s + (r.tien || 0), 0) : 0;

  // Ứng nhà cung cấp của CT theo năm
  const ungNcc = _hasUng ? ungRecords.filter(r => {
    if (r.deletedAt || r.loai !== 'nhacungcap' || !inActiveYear(r.ngay)) return false;
    return r.projectId ? r.projectId === p.id : r.congtrinh === p.name;
  }).reduce((s, r) => s + (r.tien || 0), 0) : 0;

  // Tên các NCC mà CT này đã ứng (toàn bộ lịch sử, không lọc năm)
  const nccNamesInUng = new Set(
    _hasUng ? ungRecords.filter(r => {
      if (r.deletedAt || r.loai !== 'nhacungcap') return false;
      return r.projectId ? r.projectId === p.id : r.congtrinh === p.name;
    }).map(r => (r.tp || '').trim()).filter(Boolean) : []
  );

  // Công nợ NCC: tổng HĐ thuộc NCC đã ứng (đã có trong c.total → trừ để khỏi đếm 2 lần)
  const tongHopDongNcc = (c.invs || [])
    .filter(i => i.ncc && nccNamesInUng.has(i.ncc.trim()))
    .reduce((s, i) => s + (i.thanhtien || i.tien || 0), 0);

  const tongChi = (c.total || 0) + ungTp + ungNcc - tongHopDongNcc;
  return { tongChi, ungTp, ungNcc, tongHopDongNcc };
}

// ── Tính thời gian thi công ─────────────────────────────────────────
function _ptDuration(p) {
  if (!p.startDate) return '';
  const start = new Date(p.startDate);
  const end   = (p.endDate && p.status === 'closed') ? new Date(p.endDate) : new Date();
  const weeks = Math.floor((end - start) / (7 * 24 * 3600 * 1000));
  if (weeks <= 0) return '';
  if (weeks < 9) return `${weeks} tuần`;
  return `${Math.round(weeks / 4.33)} tháng`;
}

// ── Badge trạng thái ───────────────────────────────────────────────
function _ptStatusBadge(status) {
  const m = _PT_STATUS_META[status] || { label: status, color: 'var(--bs-secondary)', bg: 'rgba(var(--bs-secondary-rgb),.1)' };
  return `<span style="font-size:10px;font-weight:700;padding:2px 9px;border-radius:10px;background:${m.bg};color:${m.color};white-space:nowrap">${m.label}</span>`;
}

// ── Stat box nhỏ ───────────────────────────────────────────────────
function _ptStatBox(label, value, color, bg) {
  return `<div style="background:${bg};border-radius:10px;padding:14px 16px">
    <div style="font-size:10px;color:var(--bs-secondary-color);margin-bottom:6px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">${label}</div>
    <div style="font-size:26px;font-weight:700;color:${color};font-family:'IBM Plex Mono',monospace">${value}</div>
  </div>`;
}

// ── Tính số ngày thi công (trả về số) ──────────────────────────────
// Priority: p.startDate → first "Nhân Công" invoice → 0
function _ptDurationDays(p, invList) {
  const sd = p.startDate || (() => {
    const first = (invList || [])
      .filter(i => i.source === 'cc' && i.ngay)
      .sort((a, b) => a.ngay.localeCompare(b.ngay))[0];
    return first ? first.ngay : null;
  })();
  if (!sd) return 0;
  const endMs = (p.endDate && p.status === 'closed')
    ? new Date(p.endDate).getTime() : Date.now();
  return Math.max(0, Math.floor((endMs - new Date(sd).getTime()) / 86400000));
}

// ── State filter của grid công trình (giữ giữa các lần render) ─────
let _ctSearch  = '';
let _ctFStatus = '';
let _ctFType   = '';
let _ctFLaiLo  = '';

// ══════════════════════════════════════════════════════════════════
//  TỔNG QUAN — Dashboard + Filter Grid
// ══════════════════════════════════════════════════════════════════
function renderCTOverview() {
  const wrap = document.getElementById('ct-overview-wrap');
  if (!wrap) return;

  const validProjects = projects.filter(_isValidProject);
  // Filter by selected year for status counts: a project is "in year" if its duration overlaps the year
  const _projInYear = (p) => {
    if (!activeYear || activeYear === 0) return true;
    const yearStart = activeYear + '-01-01';
    const yearEnd   = activeYear + '-12-31';
    const sd = p.startDate || '';
    const ed = p.endDate   || '';
    if (!sd) return false;
    // Project must have started on or before year end, and either not ended or ended on/after year start
    if (sd > yearEnd) return false;
    if (ed && ed < yearStart) return false;
    return true;
  };
  const yearProjects = validProjects.filter(_projInYear);
  const counts = { planning: 0, active: 0, completed: 0, closed: 0 };
  yearProjects.forEach(p => { if (counts[p.status] !== undefined) counts[p.status]++; });
  const _ctCount    = yearProjects.filter(p => _projTypeByName(p.name) === 'CT').length;

  const yearLabel = activeYear === 0 ? 'Tất cả năm' : `Năm ${activeYear}`;
  const invMap    = _buildInvoiceMap();

  // Tổng chi phí (trừ COMPANY — chi phí chung không tính vào CT)
  const totalCost = invMap.all
    .filter(i => i.projectId !== 'COMPANY' && i.congtrinh !== PROJECT_COMPANY.name)
    .reduce((s, i) => s + (i.thanhtien || i.tien || 0), 0);

  // Tổng thu (theo năm)
  const totalThu = (typeof thuRecords !== 'undefined') ? thuRecords.filter(r => {
    if (r.deletedAt) return false;
    return inActiveYear(r.ngay);
  }).reduce((s, r) => s + (r.tien || 0), 0) : 0;

  const totalLL = totalThu - totalCost;
  const llClr   = totalLL > 0 ? 'var(--bs-success)' : totalLL < 0 ? 'var(--bs-danger)' : 'var(--bs-secondary-color)';
  const llPfx   = totalLL > 0 ? '+' : '';

  // ── Helpers nội bộ ─────────────────────────────────────────────────
  const kpiCount = (lbl, val, color, bg) =>
    `<div style="background:${bg};border-radius:10px;padding:12px 14px;flex:1;min-width:90px;text-align:center">
       <div style="font-size:10px;color:${color};font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;opacity:.8">${lbl}</div>
       <div style="font-size:26px;font-weight:700;color:${color};font-family:'IBM Plex Mono',monospace">${val}</div>
     </div>`;

  const kpiMoney = (lbl, val, color, bg) =>
    `<div style="background:${bg};border-radius:10px;padding:12px 16px;flex:1;min-width:130px">
       <div style="font-size:10px;color:var(--bs-secondary-color);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">${lbl}</div>
       <div style="font-size:18px;font-weight:700;color:${color};font-family:'IBM Plex Mono',monospace;line-height:1.2">${val}</div>
       <div style="font-size:10px;color:var(--bs-secondary-color);margin-top:2px">${x(yearLabel)}</div>
     </div>`;

  const selS = 'padding:7px 10px;border:1.5px solid var(--bs-border-color);border-radius:7px;font-family:inherit;font-size:12px;background:var(--bs-body-bg);color:var(--bs-body-color);outline:none';
  const inpS = 'flex:1;min-width:160px;padding:8px 12px;border:1.5px solid var(--bs-border-color);border-radius:7px;font-family:inherit;font-size:13px;background:var(--bs-body-bg);color:var(--bs-body-color);outline:none';

  wrap.innerHTML = `
    <div class="section-header d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3" style="margin-top:8px">
      <div class="section-title fw-bold mb-0 d-flex align-items-center gap-2"><span class="dot"></span>Tổng Quan Công Trình</div>
      <button class="btn btn-primary btn-sm" onclick="openCTCreateModal()">+ Thêm Công Trình</button>
    </div>

    <!-- KPI 1: Số lượng theo trạng thái -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <div style="background:var(--bs-tertiary-bg);border-radius:10px;padding:12px 14px;flex:1;min-width:90px;text-align:center">
        <div style="font-size:10px;color:var(--bs-body-color);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;opacity:.8">Tổng</div>
        <div style="font-family:'IBM Plex Mono',monospace;white-space:nowrap">
          <span id="ct-kpi-total" style="font-size:26px;font-weight:700;color:var(--bs-body-color)">${yearProjects.length}</span>
          <span id="ct-kpi-split" class="text-secondary" style="font-size:13px;font-weight:500;margin-left:5px">(${_ctCount}/${yearProjects.length - _ctCount})</span>
        </div>
      </div>
      ${kpiCount('Chuẩn bị',  counts.planning,  'var(--bs-primary)',   'rgba(var(--bs-primary-rgb),.1)')}
      ${kpiCount('Thi công',  counts.active,    'var(--bs-success)',   'rgba(var(--bs-success-rgb),.1)')}
      ${kpiCount('Hoàn thành',counts.completed, 'var(--bs-warning)',   'rgba(var(--bs-warning-rgb),.1)')}
      ${kpiCount('Quyết toán',counts.closed,    'var(--bs-secondary)', 'rgba(var(--bs-secondary-rgb),.1)')}
    </div>

    <!-- KPI 2: Tài chính tổng -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
      ${kpiMoney('Tổng Chi Phí',  fmtM(totalCost), 'var(--bs-danger)',   'rgba(var(--bs-danger-rgb),.07)')}
      ${!isKetoan() ? kpiMoney('Tổng Đã Thu',   fmtM(totalThu),  'var(--bs-success)', 'rgba(var(--bs-success-rgb),.07)') : ''} <!-- [ROLE KETOAN HIDE] -->
      ${!isKetoan() ? kpiMoney('Lãi / Lỗ',
          (totalThu || totalCost) ? llPfx + fmtM(totalLL) : '—',
          llClr, 'rgba(0,0,0,.03)') : ''}
    </div>

    <!-- Filter bar -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <input id="ct-search" type="search" placeholder="🔍  Tìm công trình..." style="${inpS}"
        oninput="_ctApply()" value="${x(_ctSearch)}">
      <select id="ct-f-status" style="${selS}" onchange="_ctApply()">
        <option value="">Tất cả trạng thái</option>
        <option value="planning">Chuẩn bị thi công</option>
        <option value="active">Đang thi công</option>
        <option value="completed">Hoàn thành</option>
        <option value="closed">Đã quyết toán</option>
        <!-- [ADDED] Filter công trình không có hóa đơn -->
        <option value="no_cost">Không có chi phí</option>
      </select>
      <select id="ct-f-type" style="${selS}" onchange="_ctApply()">
        <option value="">Tất cả loại</option>
        <option value="CT">Công trình (CT)</option>
        <option value="SC">Sửa chữa (SC)</option>
        <option value="OTHER">Khác</option>
      </select>
      <select id="ct-f-lailo" style="${selS}; display: ${isKetoan() ? 'none' : ''};" onchange="_ctApply()"> <!-- [ROLE KETOAN HIDE] -->
        <option value="">Tất cả</option>
        <option value="lai">Có lãi</option>
        <option value="lo">Đang lỗ</option>
        <option value="khongdu">Chưa đủ dữ liệu</option>
      </select>
    </div>

    <!-- Grid placeholder -->
    <div class="section-title fw-bold mb-0 d-flex align-items-center gap-2" style="margin-bottom:10px">
      <span class="dot"></span>Công trình (<span id="ct-grid-count">…</span>)
    </div>
    <div id="ct-grid-wrap"></div>
  `;

  // Restore filter state to selects
  const elStatus = document.getElementById('ct-f-status');
  const elType   = document.getElementById('ct-f-type');
  const elLaiLo  = document.getElementById('ct-f-lailo');
  if (elStatus) elStatus.value = _ctFStatus;
  if (elType)   elType.value   = _ctFType;
  if (elLaiLo)  elLaiLo.value  = _ctFLaiLo;

  _ctRenderGrid();
}

// ── Đọc filter controls → cập nhật state → re-render grid ──────────
function _ctApply() {
  _ctSearch  = document.getElementById('ct-search')?.value    || '';
  _ctFStatus = document.getElementById('ct-f-status')?.value  || '';
  _ctFType   = document.getElementById('ct-f-type')?.value    || '';
  _ctFLaiLo  = document.getElementById('ct-f-lailo')?.value   || '';
  _ctRenderGrid();
}

// ── Render grid cards (không rebuild KPI / filter toolbar) ──────────
function _ctRenderGrid() {
  const gridWrap = document.getElementById('ct-grid-wrap');
  if (!gridWrap) return;

  const q        = _ctSearch.toLowerCase().trim();
  const invMap   = _buildInvoiceMap();

  // [ADDED] Xử lý filter "Không có chi phí" riêng biệt
  if (_ctFStatus === 'no_cost') {
    // Tập hợp tên công trình đã có invoice (dùng resolveProjectName để compat cả old/new records)
    const invSet = new Set(
      getInvoicesCached().map(i => resolveProjectName(i)).filter(Boolean)
    );
    // Lấy toàn bộ projects không có invoice nào
    let noCostList = getAllProjects().filter(p => !invSet.has(p.name));

    // Apply search + type filter (giữ nguyên hành vi các filter khác)
    if (q)       noCostList = noCostList.filter(p => p.name.toLowerCase().includes(q));
    if (_ctFType) noCostList = noCostList.filter(p => _projTypeByName(p.name) === _ctFType);

    const countEl = document.getElementById('ct-grid-count');
    if (countEl) countEl.textContent = noCostList.length;
    const kpiTotalEl = document.getElementById('ct-kpi-total');
    if (kpiTotalEl) kpiTotalEl.textContent = noCostList.length;
    const ctCount = noCostList.filter(p => _projTypeByName(p.name) === 'CT').length;
    const kpiSplitEl = document.getElementById('ct-kpi-split');
    if (kpiSplitEl) kpiSplitEl.textContent = `(${ctCount}/${noCostList.length - ctCount})`;

    if (!noCostList.length) {
      gridWrap.innerHTML = `<div class="text-secondary" style="text-align:center;padding:48px 0;font-size:14px">
        Không có công trình nào thiếu chi phí.
      </div>`;
      return;
    }

    // [ADDED] Render card cho công trình không có chi phí (total=0, count=0)
    gridWrap.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">
      ${noCostList.map(p => {
        const dim     = p.status === 'closed' ? 'opacity:.72;' : '';
        const _pt     = _projTypeByName(p.name);
        const typeTag = (_pt !== 'OTHER') ? `<span class="text-secondary" style="font-size:10px;margin-left:4px">[${_pt}]</span>` : '';
        return `<div class="ct-card card shadow-sm overflow-hidden" onclick="openCTDetail('${p.id}')" style="cursor:pointer;${dim}">
          <div class="ct-card-head" style="align-items:flex-start">
            <div style="flex:1;min-width:0">
              <div class="ct-card-name" style="margin-bottom:5px">${x(p.name)}${typeTag}</div>
              <div style="margin-bottom:4px">${_ptStatusBadge(p.status)}</div>
              <div class="ct-card-count">
                <span class="ghost">Chưa phát sinh</span>
              </div>
            </div>
            <div class="ct-card-total text-secondary" style="margin-left:8px">—</div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
    return;
  }
  // [END ADDED] no_cost block

  let withData = projects.filter(_isValidProject).map(p => {
    const c     = _ctGetCostsFromMap(p, invMap);
    const thu   = (typeof thuRecords !== 'undefined') ? thuRecords.filter(r => {
      if (r.deletedAt || !inActiveYear(r.ngay)) return false;
      return r.projectId ? r.projectId === p.id : r.congtrinh === p.name;
    }).reduce((s, r) => s + (r.tien || 0), 0) : 0;
    // Tổng chi thực tế (HĐ + ứng thầu phụ + ứng NCC − công nợ NCC) — dùng chung với modal
    const { tongChi, ungTp } = _ctTongChi(p, c);
    const laiLo = thu - tongChi;
    const days  = _ptDurationDays(p, c.invs);
    return { p, c, tongChi, laiLo, days, thu, ungTp };
  });

  // Chỉ giữ CT có hóa đơn hợp lệ theo năm đang chọn:
  // - thuộc activeYears (qua inActiveYear trong _buildInvoiceMap)
  // - chưa bị xóa (buildInvoices/getInvoicesCached đã loại deletedAt)
  withData = withData.filter(({ c }) => c.count > 0);

  // Sort: 2-level
  withData.sort((a, b) => {
    const statusOrder = { planning: 1, active: 2, completed: 3, closed: 4 };
    const getPrefixOrder = (name) => {
      const n = (name || '').trim().toUpperCase();
      if (n.startsWith('CT')) return 1;
      if (n.startsWith('SC')) return 2;
      return 3;
    };
    const s1 = statusOrder[a.p.status] || 99;
    const s2 = statusOrder[b.p.status] || 99;
    if (s1 !== s2) return s1 - s2;

    const p1 = getPrefixOrder(a.p.name);
    const p2 = getPrefixOrder(b.p.name);
    if (p1 !== p2) return p1 - p2;

    return (a.p.name || '').localeCompare(b.p.name || '', 'vi');
  });

  // Apply filters
  if (q)           withData = withData.filter(({ p }) => p.name.toLowerCase().includes(q));
  if (_ctFStatus)  withData = withData.filter(({ p }) => p.status === _ctFStatus);
  if (_ctFType) withData = withData.filter(({ p }) => _projTypeByName(p.name) === _ctFType);
  if (_ctFLaiLo === 'lai')     withData = withData.filter(({ laiLo, c, thu }) => (c.total || thu) && laiLo > 0);
  if (_ctFLaiLo === 'lo')      withData = withData.filter(({ laiLo, c, thu }) => (c.total || thu) && laiLo < 0);
  if (_ctFLaiLo === 'khongdu') withData = withData.filter(({ c, thu }) => !c.total && !thu);

  const countEl = document.getElementById('ct-grid-count');
  if (countEl) countEl.textContent = withData.length;
  // Cập nhật KPI "Tổng" và "(CT/SC)" theo năm đang chọn
  const kpiTotalEl = document.getElementById('ct-kpi-total');
  if (kpiTotalEl) kpiTotalEl.textContent = withData.length;
  const ctCount = withData.filter(({ p }) => _projTypeByName(p.name) === 'CT').length;
  const kpiSplitEl = document.getElementById('ct-kpi-split');
  if (kpiSplitEl) kpiSplitEl.textContent = `(${ctCount}/${withData.length - ctCount})`;

  if (!withData.length) {
    gridWrap.innerHTML = `<div class="text-secondary" style="text-align:center;padding:48px 0;font-size:14px">
      Không tìm thấy công trình nào.
      ${!_ctSearch && !_ctFStatus && !_ctFType
        ? `<button class="btn btn-outline-secondary btn-sm" onclick="openCTCreateModal()" style="margin-left:8px">+ Thêm ngay</button>`
        : ''}
    </div>`;
    return;
  }

  // COMPANY card — luôn đứng đầu, không có nút xóa/sửa
  const companyCosts = _ctGetCostsFromMap(PROJECT_COMPANY, invMap);
  const companyCard = `<div class="ct-card card shadow-sm overflow-hidden" onclick="openCTDetail('COMPANY')" style="cursor:pointer;border:2px solid var(--bs-border-color)">
    <div class="ct-card-head" style="align-items:flex-start">
      <div style="flex:1;min-width:0">
        <div class="ct-card-name" style="margin-bottom:5px">🏢 ${x(PROJECT_COMPANY.name)}</div>
        <div style="margin-bottom:4px"><span class="text-primary fw-bold" style="font-size:10px;padding:2px 9px;border-radius:10px;background:rgba(var(--bs-primary-rgb),.1);white-space:nowrap">Chi phí chung</span></div>
        <div class="ct-card-count">${companyCosts.count} hóa đơn</div>
      </div>
      <div class="ct-card-total" style="margin-left:8px">${fmtS(companyCosts.total)}</div>
    </div>
  </div>`;

  gridWrap.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">
    ${companyCard}
    ${withData.map(({ p, c, tongChi, days }) => {
      const dim      = p.status === 'closed' ? 'opacity:.72;' : '';
      const durLabel = days > 0 ? `${days} ngày` : '';
      const _pt = _projTypeByName(p.name);
      const typeTag  = (_pt !== 'OTHER') ? `<span class="text-secondary" style="font-size:10px;margin-left:4px">[${_pt}]</span>` : '';
      // [MODIFIED] Hiển thị placeholder nếu count = 0 để card không bị lệch
      const countLine = c.count > 0
        ? `<span>${c.count} hóa đơn</span>${durLabel ? `<span class="text-secondary">·</span><span>${durLabel}</span>` : ''}`
        : `<span class="ghost">Chưa phát sinh</span>`;
      // [FIX] Hiển thị TỔNG CHI thực tế (gồm ứng thầu phụ / NCC) thay vì chỉ tổng hóa đơn
      return `<div class="ct-card card shadow-sm overflow-hidden" onclick="openCTDetail('${p.id}')" style="cursor:pointer;${dim}">
        <div class="ct-card-head" style="align-items:flex-start">
          <div style="flex:1;min-width:0">
            <div class="ct-card-name" style="margin-bottom:5px">${x(p.name)}${typeTag}</div>
            <div style="margin-bottom:4px">${_ptStatusBadge(p.status)}</div>
            <div class="ct-card-count" style="display:flex;gap:6px;flex-wrap:wrap">
              ${countLine}
            </div>
          </div>
          <div class="ct-card-total" style="margin-left:8px">${fmtS(tongChi)}</div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

// ══════════════════════════════════════════════════════════════════
//  DETAIL VIEW (mở modal)
// ══════════════════════════════════════════════════════════════════
function openCTDetail(id) {
  const p = getProjectById(id);
  if (!p) return;
  const c = _ctGetCosts(p);
  const yearLabel = activeYear === 0 ? 'Tất cả năm' : `Năm ${activeYear}`;
  const isCompany = id === 'COMPANY';
  const isClosed  = p.status === 'closed';

  // Nhóm hóa đơn theo loại, sắp xếp theo tổng giảm dần
  const byLoai = {};
  c.invs.forEach(inv => { (byLoai[inv.loai] = byLoai[inv.loai] || []).push(inv); });
  const loaiRows = Object.entries(byLoai)
    .sort((a, b) => b[1].reduce((s,i)=>s+(i.thanhtien||i.tien||0),0) - a[1].reduce((s,i)=>s+(i.thanhtien||i.tien||0),0));

  document.getElementById('modal-title').innerHTML = `🏗️ ${x(p.name)} ${_ptStatusBadge(p.status)}`;

  let html = `
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:90px;background:var(--bs-tertiary-bg);border-radius:8px;padding:12px">
        <div class="text-secondary" style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Tổng HĐ</div>
        <div style="font-size:22px;font-weight:700;font-family:'IBM Plex Mono',monospace">${c.count}</div>
      </div>
      <div style="flex:2;min-width:150px;background:rgba(var(--bs-success-rgb),.1);border-radius:8px;padding:12px">
        <div class="text-secondary" style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Tổng Chi Phí · ${x(yearLabel)}</div>
        <div style="font-size:20px;font-weight:700;font-family:'IBM Plex Mono',monospace;color:var(--bs-success)">${fmtM(c.total)}</div>
      </div>
    </div>`;

  if (!isCompany) {
    const sd = p.startDate || (p.year ? `${p.year}-01-01` : null);
    const ed = p.endDate ? _fmtProjDate(p.endDate) : null;
    const dur = _ptDuration(p);
    html += `
    <div class="text-secondary" style="background:var(--bs-tertiary-bg);border-radius:8px;padding:11px 14px;margin-bottom:12px;font-size:13px">
      ${sd  ? `<div style="margin-bottom:4px"><span class="text-secondary">Bắt đầu: </span>${sd}${ed ? ` → <span class="text-secondary">Hoàn thành:</span> ${ed}` : ''}${dur ? `<span class="text-secondary" style="margin-left:8px;font-size:11px">(${dur})</span>` : ''}</div>` : ''}
      ${p.closedDate ? `<div style="margin-bottom:4px"><span class="text-secondary">Ngày quyết toán: </span><strong>${_fmtProjDate(p.closedDate)}</strong></div>` : ''}
      ${p.note ? `<div><span class="text-secondary">Ghi chú: </span>${x(p.note)}</div>` : ''}
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
      <button class="btn btn-outline-secondary btn-sm" onclick="_goTabWithCT('hoadon','${x(p.name)}')">📋 Hóa Đơn</button>
      ${!isKetoan() ? `<button class="btn btn-outline-secondary btn-sm" onclick="_goTabWithCT('doanhthu','${x(p.name)}')">💰 Doanh Thu</button>` : ''} <!-- [ROLE KETOAN HIDE] -->
      <button class="btn btn-outline-secondary btn-sm" onclick="_goTabWithCT('thietbi','${x(p.name)}')">🔧 Thiết Bị</button>
    </div>`;
  }

  // ── Phân bổ chi phí theo nguồn ────────────────────────────────────
  const matCost  = c.invs.filter(i => i.source !== 'cc').reduce((s,i) => s+(i.thanhtien||i.tien||0), 0);
  const labCost  = c.invs.filter(i => i.source === 'cc').reduce((s,i) => s+(i.thanhtien||i.tien||0), 0);

  // Tổng chi thực tế — dùng chung helper _ctTongChi (single source of truth với thẻ Dashboard)
  // Trả về: tongChi, ungTp (ứng thầu phụ), ungNcc (ứng NCC), tongHopDongNcc (công nợ NCC)
  const _tc = _ctTongChi(p, c);
  const ungTpCost            = _tc.ungTp;
  const ungNccCost           = _tc.ungNcc;
  const tongHopDongNhaCungCap = _tc.tongHopDongNcc;
  const tongChiCongTrinh      = _tc.tongChi;

  // Doanh thu / hợp đồng
  const hdct         = (typeof _hdLookup === 'function')
                       ? _hdLookup(p.id) || _hdLookup(p.name)
                       : ((typeof hopDongData !== 'undefined' && hopDongData[p.name] && !hopDongData[p.name].deletedAt) ? hopDongData[p.name] : null);
  const tongGiaTriHD = hdct ? (hdct.giaTri||0) + (hdct.giaTriphu||0) + (hdct.phatSinh||0) : 0;

  const tongThu = (typeof thuRecords !== 'undefined') ? thuRecords.filter(r => {
    if (r.deletedAt) return false;
    if (!inActiveYear(r.ngay)) return false;
    return r.projectId ? r.projectId === p.id : r.congtrinh === p.name;
  }).reduce((s,r) => s+(r.tien||0), 0) : 0;

  const tongHDTP = (typeof thauPhuContracts !== 'undefined') ? thauPhuContracts.filter(r => {
    if (r.deletedAt) return false;
    return r.projectId ? r.projectId === p.id : r.congtrinh === p.name;
  }).reduce((s,r) => s+(r.giaTri||0)+(r.phatSinh||0), 0) : 0;

  const laiLo = tongThu - tongChiCongTrinh;

  // ── Bổ sung data nhỏ ─────────────────────────────────────────────────
  const soDotThu = (typeof thuRecords !== 'undefined') ? thuRecords.filter(r => {
    if (r.deletedAt) return false;
    if (!inActiveYear(r.ngay)) return false;
    return r.projectId ? r.projectId === p.id : r.congtrinh === p.name;
  }).length : 0;

  // ── Chi phí chung phân bổ theo trọng số CT ───────────────────────────
  // Fix: chỉ lấy chi phí của project CÔNG TY, KHÔNG dùng tổng tất cả project
  const chiPhiCongTy = getInvoicesCached().filter(inv => {
    if (!inActiveYear(inv.ngay)) return false;
    return inv.projectId === 'COMPANY' || inv.congtrinh === PROJECT_COMPANY.name;
  }).reduce((s, i) => s + (i.thanhtien || i.tien || 0), 0);

  // ── Màu lãi/lỗ ───────────────────────────────────────────────────────
  const llColor    = laiLo > 0 ? 'var(--bs-success)' : laiLo < 0 ? 'var(--bs-danger)' : 'var(--bs-secondary-color)';
  const llPrefix   = laiLo > 0 ? '+' : '';
  const conPhaiThu = tongGiaTriHD - tongThu;

  // ── Fix 4: Ngày bắt đầu chính xác — priority: startDate → first CC inv → null
  const _ctStartDate = p.startDate || (() => {
    const firstCC = c.invs.filter(i => i.source === 'cc' && i.ngay)
                          .sort((a, b) => a.ngay.localeCompare(b.ngay))[0];
    return firstCC ? firstCC.ngay : null;
  })();
  const _ctEndMs     = (p.endDate && p.status === 'closed')
                       ? new Date(p.endDate).getTime() : Date.now();
  const durationDays = _ctStartDate
    ? Math.max(0, Math.floor((_ctEndMs - new Date(_ctStartDate).getTime()) / 86400000))
    : 0;
  const _durLabel    = durationDays > 0 ? `${durationDays} ngày` : '';
  const _sd          = _ctStartDate;

  // Phân bổ chi phí chung: dùng allocateCompanyCost() (weight = days × factor theo tên)
  const _allocEntry = (!isCompany && p.startDate) ? allocateCompanyCost().find(a => a.p.id === p.id) : null;
  const _chiPhiChungFixed = _allocEntry ? _allocEntry.allocated : 0;

  // ── Semantic color palette ────────────────────────────────────────────
  const CG = 'var(--bs-success)', CR = 'var(--bs-danger)', CA = 'var(--bs-warning)', CB = 'var(--bs-primary)';
  const BG = 'rgba(var(--bs-success-rgb),.09)', BR = 'rgba(var(--bs-danger-rgb),.09)';
  const BA = 'rgba(var(--bs-warning-rgb),.09)', BB = 'rgba(var(--bs-primary-rgb),.07)';

  // ── Layout helpers ────────────────────────────────────────────────────
  const _bxBase = 'border-radius:8px;padding:11px 14px';
  const _bx  = `border:1.5px solid var(--bs-border-color);${_bxBase};background:var(--bs-body-bg)`;
  const _bxG = `border:1.5px solid ${CG};${_bxBase};background:${BG}`;   // thu → xanh
  const _bxR = `border:1.5px solid ${CR};${_bxBase};background:${BR}`;   // chi → đỏ
  const _bxA = `border:1.5px solid ${CA};${_bxBase};background:${BA}`;   // HĐ → vàng
  const _bxB = `border:1.5px solid ${CB};${_bxBase};background:${BB}`;   // TB → xanh dương

  const _lb  = t =>
    `<div style="font-size:10px;font-weight:700;color:var(--bs-secondary-color);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">${t}</div>`;
  const _vl  = (v, color = 'var(--bs-body-color)') =>
    `<div style="font-size:17px;font-weight:700;font-family:'IBM Plex Mono',monospace;color:${color};line-height:1.3">${v}</div>`;
  // Fix 5: tab param tường minh, không default sang doanhthu
  const _xct = tab =>
    `<button class="btn btn-outline-secondary btn-sm" style="font-size:10px;padding:2px 8px;flex-shrink:0;align-self:flex-end"
       onclick="_goTabWithCT('${tab}','${x(p.name)}')">Xem chi tiết</button>`;
  const _box = (bxStyle, label, valHtml, color = 'var(--bs-body-color)', btn = '') =>
    `<div style="${bxStyle}">
       ${_lb(label)}
       <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:8px">
         ${_vl(valHtml, color)}${btn}
       </div>
     </div>`;
  const _tag = t =>
    `<span style="border:1.5px solid var(--bs-border-color);border-radius:6px;padding:4px 10px;font-size:11px;white-space:nowrap">${t}</span>`;

  // ═══ XÂY DỰNG HTML ═══════════════════════════════════════════════════
  // Fix 8: CSS mobile (scoped vào modal, không ảnh hưởng UI ngoài)
  html = `<style>
    @media(max-width:640px){
      .ctd-grid{grid-template-columns:1fr!important}
      .ctd-hdr{grid-template-columns:1fr!important}
      .ctd-note-blk{display:none!important}
      .ctd-note-inline{display:inline!important}
      .ctd-btns .btn{flex:1;justify-content:center}
    }
  </style>`;

  // ── Row 0: Header compact — Chủ đầu tư | Địa chỉ / Ghi chú ───────────
  // Tên công trình đã có ở header modal → thay ô tên bằng ô CHỦ ĐẦU TƯ
  html += `
  <div class="ctd-hdr" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    <div style="${_bx};padding:10px 14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="font-size:10px;font-weight:700;color:var(--bs-secondary-color);text-transform:uppercase;letter-spacing:.6px">Chủ Đầu Tư</div>
        <button class="btn btn-outline-secondary btn-sm" style="font-size:10px;padding:1px 7px;line-height:1.5" onclick="openKhachHangModal()">👥 +KH</button>
      </div>
      ${(() => {
        // Ưu tiên bản ghi khách hàng (CRM) nếu công trình đã liên kết customerId
        const _cust = (p.customerId && typeof getCustomerById === 'function') ? getCustomerById(p.customerId) : null;
        const _ten  = _cust ? _cust.name : (p.chuDauTu || '');
        if (!_ten) return '<div style="font-size:14px;font-weight:700;line-height:1.4"><span class="text-secondary" style="font-weight:400;font-size:12px">— Chưa nhập —</span></div>';
        return `<div style="font-size:14px;font-weight:700;color:var(--bs-body-color);line-height:1.4">${x(_ten)}</div>`;
      })()}
    </div>
    <div class="ctd-note-blk" style="${_bx};padding:10px 14px">
      ${_lb('Địa chỉ công trình / Ghi chú')}
      <div class="text-secondary" style="font-size:12px;line-height:1.5">${p.note ? x(p.note) : ''}</div>
    </div>
  </div>`;

  // ── Row 1: Tổng chi CT (đỏ) + Lãi/Lỗ (xanh/đỏ theo dấu) ───────────
  html += `
  <div class="ctd-grid" style="display:grid;grid-template-columns:${!isCompany && isKetoan() ? '1fr' : '1fr 1fr'};gap:10px;margin-bottom:10px">
    ${_box(_bxR, 'Tổng Chi Công Trình', _chiPhiChungFixed > 0
        ? fmtS(tongChiCongTrinh) + `<span class="text-secondary" style="font-size:12px;font-weight:400"> / ${fmtS(tongChiCongTrinh + _chiPhiChungFixed)}</span>`
        : fmtS(tongChiCongTrinh), CR)}
    ${!isCompany
      ? (isKetoan() ? '' : _box(
          laiLo >= 0 ? _bxG : _bxR,
          'Lãi / Lỗ Hiện Tại',
          (tongThu || tongGiaTriHD) ? llPrefix + fmtS(laiLo) : '—',
          laiLo >= 0 ? CG : CR
        )) // [ROLE KETOAN HIDE]
      : `<div style="${_bx}">${_lb('Tổng Hóa Đơn')}${_vl(c.count + ' HĐ')}</div>`}
  </div>`;

  // ── Row 2: Date tags + Action buttons (Fix 2: emoji icons) ──────────
  if (!isCompany) {
    html += `
  <div class="ctd-btns" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
    ${_sd       ? _tag('Ngày bắt đầu: <strong>' + (_sd ? (() => { const [y,m,d]=_sd.split('-'); return `${d}-${m}-${y}`; })() : '') + '</strong>') : ''}
    ${_durLabel ? _tag('⏱ <strong>' + _durLabel + '</strong>') : ''}
    <button class="btn btn-outline-secondary btn-sm" onclick="openCTEditModal('${p.id}')">✏️ Sửa</button>
    ${p.status !== 'completed' && !isClosed
      ? `<button class="btn btn-outline-secondary btn-sm" onclick="quickCompleteCT('${p.id}')">✅ Hoàn Thành</button>`
      : ''}
    ${!isClosed
      ? `<button class="btn btn-outline-secondary btn-sm" onclick="quickCloseCT('${p.id}')">📊 Quyết Toán</button>`
      : ''}
    <button class="btn btn-danger btn-sm" style="margin-left:auto"
      onclick="confirmDeleteCT('${p.id}')">🗑 Xóa</button>
  </div>`;
  }

  // ── Row 3: HĐ chính (vàng) + Đã thu (xanh) ──────────────────────────
  if (!isCompany && !isKetoan()) { // [ROLE KETOAN HIDE]
    const thuLabel = 'Tổng Tiền Đã Thu' + (soDotThu ? ` (${soDotThu} Đợt)` : '');
    html += `
  <div class="ctd-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${_box(_bxA, 'Tổng Giá Trị Hợp Đồng Chính',
        tongGiaTriHD ? fmtS(tongGiaTriHD) : '—', CA, _xct('doanhthu'))}
    ${_box(_bxG, thuLabel,
        tongThu ? fmtS(tongThu) : '—', CG, _xct('doanhthu'))}
  </div>`;
  }

  // ── Row 4: HĐ thầu phụ (vàng) + Ứng thầu phụ (vàng) ────────────────
  // Fix 5: Ứng thầu phụ → tab 'ung', KHÔNG phải 'doanhthu'
  if (!isCompany) {
    html += `
  <div class="ctd-grid" style="display:grid;grid-template-columns:${isKetoan() ? '1fr' : '1fr 1fr'};gap:10px;margin-bottom:10px">
    ${isKetoan() ? '' : _box(_bxA, 'Tổng Giá Trị Hợp Đồng Thầu Phụ',
        tongHDTP   ? fmtS(tongHDTP)   : '—', CA, _xct('doanhthu'))} <!-- [ROLE KETOAN HIDE] -->
    ${_box(_bxA, 'Tổng Giá Trị Thầu Phụ Ứng',
        ungTpCost  ? fmtS(ungTpCost)  : '—', CA, _xct('ung'))}
  </div>`;
  }

  // ── Row 5: Chi phí chung + Nhà cung cấp ứng ──────────────────────────
  if (!isCompany) {
    const cpChungHtml = (chiPhiCongTy > 0)
      ? fmtS(chiPhiCongTy) + (_allocEntry ? `<span class="text-secondary" style="font-size:11px;font-weight:400"> / ${fmtS(_chiPhiChungFixed)}</span>` : '')
      : '—';
    html += `
  <div class="ctd-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    ${_box(_bx,  `Chi Phí Chung / Chia Tỉ Trọng (k=${getProjectK(p)})`, cpChungHtml)}
    ${_box(_bxA, 'Tổng Giá Trị Nhà Cung Cấp Ứng',
        ungNccCost ? fmtS(ungNccCost) : '—', CA, _xct('ung'))}
  </div>`;
  }

  // ── Row 6: Tổng chi phí (đỏ, full width) + breakdown ────────────────
  html += `
  <div style="${_bxR};margin-bottom:10px">
    ${_lb('Tổng Chi Phí Công Trình')}
    <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:8px;margin-bottom:10px">
      ${_vl(fmtS(c.total), CR)}
      ${_xct('thongke')}
    </div>`;

  if (!c.invs.length) {
    html += `<div class="text-secondary" style="font-size:12px;padding:2px 0">
               Không có hóa đơn nào trong ${x(yearLabel.toLowerCase())}
             </div>`;
  } else {
    loaiRows.forEach(([loai, invList]) => {
      const lt = invList.reduce((s, i) => s + (i.thanhtien || i.tien || 0), 0);
      html += `
    <div style="display:flex;justify-content:space-between;align-items:baseline;
                padding:5px 0;border-top:1px solid rgba(220,38,38,.15);font-size:12px">
      <span class="text-secondary">${x(loai)}<span class="text-body-secondary"> (${invList.length} hóa đơn)</span></span>
      <span style="font-family:'IBM Plex Mono',monospace;font-weight:600;color:${CR}">${fmtS(lt)}</span>
    </div>`;
    });
  }
  html += `</div>`; // end row 5

  // ── Footer: Ngày hoàn thành + Ngày quyết toán (Fix 7: chỉ show nếu có)
  if (!isCompany && (p.endDate || p.closedDate)) {
    html += `
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">
    ${p.endDate    ? _tag('📅 Ngày hoàn thành: <strong>' + _fmtProjDate(p.endDate)    + '</strong>') : ''}
    ${p.closedDate ? _tag('📊 Ngày quyết toán: <strong>' + _fmtProjDate(p.closedDate) + '</strong>') : ''}
  </div>`;
  }

  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('ct-modal').classList.add('open');
}

// ══════════════════════════════════════════════════════════════════
//  PICKER CHỦ ĐẦU TƯ (KHÁCH HÀNG) — dùng chung modal Tạo & Sửa
// ══════════════════════════════════════════════════════════════════
/**
 * Render khối chọn/thêm khách hàng cho modal công trình.
 * @param {string} prefix      'new' (tạo) hoặc 'edit' (sửa) — để tạo id duy nhất
 * @param {string|null} selectedId  customerId đang gán cho công trình (nếu có)
 * @param {string} inpStyle    style ô input dùng chung của modal
 * @param {string} lblStyle    style nhãn dùng chung của modal
 * @returns {string} HTML
 */
function _renderCustomerSelect(prefix, selectedId, inpStyle, lblStyle) {
  // Danh sách option khách hàng + 1 option đặc biệt để thêm mới
  const hasModel = typeof getCustomerOptions === 'function';
  const opts = hasModel ? getCustomerOptions(selectedId) : '<option value="">— Chọn khách hàng —</option>';
  const selStyle = `${inpStyle};background:var(--bs-body-bg);color:var(--bs-body-color)`;
  return `
    <div>
      <label style="${lblStyle}">Chủ Đầu Tư</label>
      <select id="ct-${prefix}-customer" style="${selStyle}"
        onchange="_onCustPickerChange('${prefix}')">
        ${opts}
        <option value="__new__">➕ Thêm khách hàng mới...</option>
      </select>
    </div>`;
}

/**
 * Khối nhập thông tin KH mới (ẩn mặc định, full-width) — hiện khi chọn "➕ Thêm mới".
 * Đặt NGOÀI grid 2 cột để không phá bố cục.
 */
function _renderNewCustPane(prefix, inpStyle, lblStyle) {
  return `
    <div id="ct-${prefix}-newcust" style="display:none;flex-direction:column;gap:8px;border:1.5px dashed var(--bs-border-color);border-radius:8px;padding:10px">
      <div>
        <label style="${lblStyle}">Tên Khách Hàng *</label>
        <input id="ct-${prefix}-cust-name" type="text" placeholder="Tên cá nhân / công ty..." autocomplete="off" style="${inpStyle}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div>
          <label style="${lblStyle}">Điện Thoại</label>
          <input id="ct-${prefix}-cust-phone" type="text" placeholder="SĐT..." autocomplete="off" style="${inpStyle}">
        </div>
        <div>
          <label style="${lblStyle}">Email</label>
          <input id="ct-${prefix}-cust-email" type="text" placeholder="Email..." autocomplete="off" style="${inpStyle}">
        </div>
      </div>
      <div>
        <label style="${lblStyle}">Địa Chỉ</label>
        <input id="ct-${prefix}-cust-address" type="text" placeholder="Địa chỉ..." autocomplete="off" style="${inpStyle}">
      </div>
    </div>`;
}

/**
 * Toggle hiện/ẩn khối nhập KH mới khi đổi lựa chọn dropdown.
 * @param {string} prefix 'new' | 'edit'
 */
function _onCustPickerChange(prefix) {
  const sel  = document.getElementById(`ct-${prefix}-customer`);
  const pane = document.getElementById(`ct-${prefix}-newcust`);
  if (!sel || !pane) return;
  const isNew = sel.value === '__new__';
  pane.style.display = isNew ? 'flex' : 'none';
  if (isNew) setTimeout(() => document.getElementById(`ct-${prefix}-cust-name`)?.focus(), 50);
}

/**
 * Đọc lựa chọn khách hàng từ modal → trả về { customerId, chuDauTu }.
 * - Chọn KH có sẵn → lấy id + tên.
 * - Chọn "➕ Thêm mới" + có nhập tên → tạo KH mới, trả id + tên.
 * - Để trống → customerId null, chuDauTu ''.
 * @param {string} prefix 'new' | 'edit'
 * @returns {{customerId: string|null, chuDauTu: string}}
 */
function _resolveCustomerFromPicker(prefix) {
  const val = document.getElementById(`ct-${prefix}-customer`)?.value || '';
  if (val === '__new__') {
    const cname = (document.getElementById(`ct-${prefix}-cust-name`)?.value || '').trim();
    if (!cname || typeof createCustomer !== 'function') return { customerId: null, chuDauTu: '' };
    const c = createCustomer({
      name:    cname,
      phone:   (document.getElementById(`ct-${prefix}-cust-phone`)?.value   || '').trim(),
      email:   (document.getElementById(`ct-${prefix}-cust-email`)?.value   || '').trim(),
      address: (document.getElementById(`ct-${prefix}-cust-address`)?.value || '').trim()
    });
    return { customerId: c.id, chuDauTu: c.name };
  }
  if (val && typeof getCustomerById === 'function') {
    const c = getCustomerById(val);
    if (c) return { customerId: c.id, chuDauTu: c.name };
  }
  return { customerId: null, chuDauTu: '' };
}

// ══════════════════════════════════════════════════════════════════
//  MODAL TẠO MỚI
// ══════════════════════════════════════════════════════════════════
function openCTCreateModal() {
  const today   = new Date().toISOString().slice(0, 10);
  const _curY   = new Date().getFullYear();
  const _defSD  = (typeof activeYear !== 'undefined' && activeYear > 0 && activeYear < _curY)
                  ? `${activeYear}-01-01`
                  : today;
  const inpStyle = 'width:100%;box-sizing:border-box;padding:9px 12px;border:1.5px solid var(--bs-border-color);border-radius:8px;font-family:inherit;font-size:13px;outline:none';
  const lblStyle = 'font-size:11px;font-weight:700;color:var(--bs-secondary-color);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px';
  document.getElementById('modal-title').textContent = '+ Thêm Công Trình Mới';
  document.getElementById('modal-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <!-- Hàng 1: Tên công trình -->
      <div>
        <label style="${lblStyle}">Tên Công Trình *</label>
        <input id="ct-new-name" type="text" placeholder="VD: CT Anh Bình - 123 Lê Lai..." autocomplete="off"
          style="${inpStyle};font-size:14px">
      </div>
      <!-- Hàng 2: Chủ đầu tư (dropdown chọn/thêm KH) | Trạng thái -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        ${_renderCustomerSelect('new', null, inpStyle, lblStyle)}
        <div>
          <label style="${lblStyle}">Trạng Thái</label>
          <select id="ct-new-status" style="${inpStyle};background:var(--bs-body-bg);color:var(--bs-body-color)"
            onchange="document.getElementById('ct-new-closeddate-wrap').style.display=this.value==='closed'?'':'none'">
            <option value="planning">Chuẩn bị thi công</option>
            <option value="active" selected>Đang thi công</option>
            <option value="completed">Hoàn thành (chưa QT)</option>
            <option value="closed">Đã quyết toán</option>
          </select>
        </div>
      </div>
      <!-- Pane nhập KH mới (ẩn — hiện khi chọn "➕ Thêm mới") -->
      ${_renderNewCustPane('new', inpStyle, lblStyle)}
      <!-- Hàng 3: Ngày bắt đầu | Ngày kết thúc -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label style="${lblStyle}">Ngày Bắt Đầu</label>
          <input id="ct-new-startdate" type="date" value="${_defSD}"
            style="${inpStyle};font-family:'IBM Plex Mono',monospace">
        </div>
        <div>
          <label style="${lblStyle}">Ngày Kết Thúc <span style="font-weight:400;text-transform:none">(tùy chọn)</span></label>
          <input id="ct-new-enddate" type="date"
            style="${inpStyle};font-family:'IBM Plex Mono',monospace">
        </div>
      </div>
      <div id="ct-new-closeddate-wrap" style="display:none">
        <label style="${lblStyle}">Ngày Quyết Toán</label>
        <input id="ct-new-closeddate" type="date"
          style="${inpStyle};font-family:'IBM Plex Mono',monospace">
      </div>
      <!-- Hàng 4: Ghi chú -->
      <div>
        <label style="${lblStyle}">Ghi Chú</label>
        <input id="ct-new-note" type="text" placeholder="Địa chỉ, mô tả..." autocomplete="off"
          style="${inpStyle}">
      </div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button class="btn btn-primary" style="flex:1" onclick="saveCTCreate()">💾 Lưu Công Trình</button>
        <button class="btn btn-outline-secondary" onclick="closeModal()">Hủy</button>
      </div>
    </div>
  `;
  document.getElementById('ct-modal').classList.add('open');
  setTimeout(() => document.getElementById('ct-new-name')?.focus(), 80);
}

function saveCTCreate() {
  const name       = (document.getElementById('ct-new-name')?.value || '').trim();
  const status     = document.getElementById('ct-new-status')?.value || 'active';
  const startDate  = document.getElementById('ct-new-startdate')?.value || '';
  const endDate    = document.getElementById('ct-new-enddate')?.value || '';
  const closedDate = document.getElementById('ct-new-closeddate')?.value || '';
  const note       = (document.getElementById('ct-new-note')?.value || '').trim();
  // Lấy customerId + tên CĐT từ picker (chọn có sẵn / tạo KH mới / để trống)
  const { customerId, chuDauTu } = _resolveCustomerFromPicker('new');
  if (!name) { toast('Vui lòng nhập tên công trình!', 'error'); document.getElementById('ct-new-name')?.focus(); return; }
  try {
    createProject({ name, status, startDate, endDate: endDate || null, closedDate: closedDate || null, note, chuDauTu, customerId });
    closeModal();
    toast('✅ Đã thêm: ' + name, 'success');
    renderProjectsPage();
    // Cập nhật dropdown CT ở các tab khác ngay lập tức
    if (typeof refreshHoadonCtDropdowns === 'function') refreshHoadonCtDropdowns();
    if (typeof rebuildUngSelects       === 'function') rebuildUngSelects();
    if (typeof populateCCCtSel         === 'function') populateCCCtSel();
  } catch(e) {
    toast('❌ ' + e.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════════════
//  MODAL CHỈNH SỬA
// ══════════════════════════════════════════════════════════════════
function openCTEditModal(id) {
  const p = getProjectById(id);
  if (!p || id === 'COMPANY') return;
  // [PATCH] Lấy startDate: ưu tiên user-edited → stored; nếu chưa edit → auto từ chamcong
  const _autoSd = getProjectAutoStartDate(p.id);
  const sd = p.startDateUserEdited
    ? (p.startDate || new Date().toISOString().slice(0, 10))
    : (_autoSd || p.startDate || (p.year ? `${p.year}-01-01` : new Date().toISOString().slice(0, 10)));
  // [PATCH] Hint label nếu đang hiển thị auto date
  const sdHint = !p.startDateUserEdited && _autoSd
    ? ' <span class="text-secondary" style="font-size:10px;font-weight:400">(tự động từ chấm công)</span>'
    : '';
  const ed  = p.endDate    || '';
  const cld = p.closedDate || '';
  const inpStyle = 'width:100%;box-sizing:border-box;padding:9px 12px;border:1.5px solid var(--bs-border-color);border-radius:8px;font-family:inherit;font-size:13px;outline:none';
  const lblStyle = 'font-size:11px;font-weight:700;color:var(--bs-secondary-color);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px';
  document.getElementById('modal-title').textContent = '✏️ Sửa Công Trình';
  document.getElementById('modal-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <!-- Hàng 1: Tên công trình -->
      <div>
        <label style="${lblStyle}">Tên Công Trình *</label>
        <input id="ct-edit-name" type="text" value="${x(p.name)}" autocomplete="off"
          style="${inpStyle};font-size:14px">
      </div>
      <!-- Hàng 2: Chủ đầu tư (dropdown chọn/thêm KH) | Trạng thái -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        ${_renderCustomerSelect('edit', p.customerId || null, inpStyle, lblStyle)}
        <div>
          <label style="${lblStyle}">Trạng Thái</label>
          <select id="ct-edit-status" style="${inpStyle};background:var(--bs-body-bg);color:var(--bs-body-color)"
            onchange="document.getElementById('ct-edit-closeddate-wrap').style.display=this.value==='closed'?'':'none'">
            ${Object.entries(PROJECT_STATUS).map(([v,l]) => `<option value="${v}"${p.status===v?' selected':''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <!-- Pane nhập KH mới (ẩn — hiện khi chọn "➕ Thêm mới") -->
      ${_renderNewCustPane('edit', inpStyle, lblStyle)}
      <!-- Hàng 3: Ngày bắt đầu | Ngày kết thúc -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label style="${lblStyle}">Ngày Bắt Đầu${sdHint}</label>
          <input id="ct-edit-startdate" type="date" value="${sd}"
            style="${inpStyle};font-family:'IBM Plex Mono',monospace">
        </div>
        <div>
          <label style="${lblStyle}">Ngày Kết Thúc <span style="font-weight:400;text-transform:none">(tùy chọn)</span></label>
          <input id="ct-edit-enddate" type="date" value="${ed}"
            style="${inpStyle};font-family:'IBM Plex Mono',monospace">
        </div>
      </div>
      <div id="ct-edit-closeddate-wrap" style="${p.status==='closed'?'':'display:none'}">
        <label style="${lblStyle}">Ngày Quyết Toán</label>
        <input id="ct-edit-closeddate" type="date" value="${cld}"
          style="${inpStyle};font-family:'IBM Plex Mono',monospace">
      </div>
      <!-- Hàng 3.5: Hệ số tỉ trọng phân bổ chi phí chung -->
      <div>
        <label style="${lblStyle}">Hệ Số Tỉ Trọng <span style="font-weight:400;text-transform:none">(chia chi phí chung — mặc định 1, nhập 0 để không gánh)</span></label>
        <input id="ct-edit-hesotitrong" type="number" min="0" step="0.1" value="${getProjectK(p)}"
          style="${inpStyle};font-family:'IBM Plex Mono',monospace">
      </div>
      <!-- Hàng 4: Ghi chú -->
      <div>
        <label style="${lblStyle}">Ghi Chú</label>
        <input id="ct-edit-note" type="text" value="${x(p.note||'')}" autocomplete="off"
          style="${inpStyle}">
      </div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button class="btn btn-primary" style="flex:1" onclick="saveCTEdit('${p.id}')">💾 Lưu Thay Đổi</button>
        <button class="btn btn-outline-secondary" onclick="openCTDetail('${p.id}')">Hủy</button>
      </div>
    </div>
  `;
  document.getElementById('ct-modal').classList.add('open');
}

function saveCTEdit(id) {
  const name       = (document.getElementById('ct-edit-name')?.value || '').trim();
  const status     = document.getElementById('ct-edit-status')?.value;
  const startDate  = document.getElementById('ct-edit-startdate')?.value || '';
  const endDate    = document.getElementById('ct-edit-enddate')?.value || '';
  const closedDate = document.getElementById('ct-edit-closeddate')?.value || '';
  const note       = (document.getElementById('ct-edit-note')?.value || '').trim();
  // Lấy customerId + tên CĐT từ picker (chọn có sẵn / tạo KH mới / để trống)
  const { customerId, chuDauTu } = _resolveCustomerFromPicker('edit');
  // Hệ số tỉ trọng: parse số, không hợp lệ → 1
  const _kRaw      = parseFloat(document.getElementById('ct-edit-hesotitrong')?.value);
  const heSoTiTrong = (isFinite(_kRaw) && _kRaw >= 0) ? _kRaw : 1;
  if (!name) { toast('Vui lòng nhập tên công trình!', 'error'); document.getElementById('ct-edit-name')?.focus(); return; }

  // [PATCH] Validation: block nếu status=completed mà thiếu endDate
  if (status === 'completed' && !endDate) {
    toast('❌ Vui lòng nhập Ngày Kết Thúc khi đánh dấu Đã Hoàn Thành!', 'error');
    document.getElementById('ct-edit-enddate')?.focus();
    return;
  }
  // [PATCH] Validation: block nếu status=closed mà thiếu closedDate
  if (status === 'closed' && !closedDate) {
    toast('❌ Vui lòng nhập Ngày Quyết Toán!', 'error');
    document.getElementById('ct-edit-closeddate')?.focus();
    return;
  }

  // [PATCH] Set startDateUserEdited=true nếu user đã thay đổi startDate so với giá trị auto/stored
  const p = getProjectById(id);
  const _autoSd = getProjectAutoStartDate(id);
  const expectedSd = p?.startDateUserEdited
    ? p.startDate
    : (_autoSd || p?.startDate);
  const startDateUserEdited = startDate !== expectedSd
    ? true
    : (p?.startDateUserEdited || false);

  updateProject(id, { name, status, startDate, startDateUserEdited, endDate: endDate || null, closedDate: closedDate || null, note, chuDauTu, customerId, heSoTiTrong });
  closeModal();
  toast('✅ Đã cập nhật công trình', 'success');
  renderProjectsPage();
  // Cập nhật dropdown CT ở các tab khác ngay lập tức
  if (typeof refreshHoadonCtDropdowns === 'function') refreshHoadonCtDropdowns();
  if (typeof rebuildUngSelects       === 'function') rebuildUngSelects();
  if (typeof populateCCCtSel         === 'function') populateCCCtSel();
}

// ── Quyết toán nhanh — mở modal nhập ngày quyết toán ──────────────
function quickCloseCT(id) {
  const p = getProjectById(id);
  if (!p) return;
  const inpStyle = 'width:100%;box-sizing:border-box;padding:9px 12px;border:1.5px solid var(--bs-border-color);border-radius:8px;font-family:inherit;font-size:13px;outline:none';
  const lblStyle = 'font-size:11px;font-weight:700;color:var(--bs-secondary-color);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px';
  const todayStr = new Date().toISOString().slice(0, 10);
  document.getElementById('modal-title').textContent = '🔒 Quyết Toán Công Trình';
  document.getElementById('modal-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="text-secondary" style="font-size:13px">Đánh dấu <strong>${x(p.name)}</strong> là <strong>Đã Quyết Toán</strong>?</div>
      <div>
        <label style="${lblStyle}">Ngày Quyết Toán</label>
        <input id="ct-close-date" type="date" value="${todayStr}"
          style="${inpStyle};font-family:'IBM Plex Mono',monospace">
      </div>
      <div class="text-secondary" style="font-size:12px;background:var(--bs-tertiary-bg);border-radius:6px;padding:8px 10px">
        ⚠️ Sau khi quyết toán, không thể thêm mới dữ liệu vào công trình này.
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="flex:1" onclick="confirmQuickClose('${p.id}')">🔒 Xác Nhận</button>
        <button class="btn btn-outline-secondary" onclick="openCTDetail('${p.id}')">Hủy</button>
      </div>
    </div>
  `;
  document.getElementById('ct-modal').classList.add('open');
}

function confirmQuickClose(id) {
  const closedDate = document.getElementById('ct-close-date')?.value || new Date().toISOString().slice(0, 10);
  updateProject(id, { status: 'closed', closedDate });
  closeModal();
  const p = getProjectById(id);
  toast('🔒 Đã quyết toán: ' + (p?.name || ''), 'success');
  renderProjectsPage();
}

// ── Hoàn thành — mở modal nhập ngày hoàn thành ───────────────────
function quickCompleteCT(id) {
  const p = getProjectById(id);
  if (!p) return;
  const inpStyle = 'width:100%;box-sizing:border-box;padding:9px 12px;border:1.5px solid var(--bs-border-color);border-radius:8px;font-family:inherit;font-size:13px;outline:none';
  const lblStyle = 'font-size:11px;font-weight:700;color:var(--bs-secondary-color);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px';
  const todayStr = new Date().toISOString().slice(0, 10);
  document.getElementById('modal-title').textContent = '✅ Hoàn Thành Công Trình';
  document.getElementById('modal-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="text-secondary" style="font-size:13px">Đánh dấu <strong>${x(p.name)}</strong> là <strong>Đã Hoàn Thành</strong>?</div>
      <div>
        <label style="${lblStyle}">Ngày Hoàn Thành</label>
        <input id="ct-complete-date" type="date" value="${todayStr}"
          style="${inpStyle};font-family:'IBM Plex Mono',monospace">
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="flex:1" onclick="confirmQuickComplete('${p.id}')">✅ Xác Nhận</button>
        <button class="btn btn-outline-secondary" onclick="openCTDetail('${p.id}')">Hủy</button>
      </div>
    </div>
  `;
  document.getElementById('ct-modal').classList.add('open');
}

function confirmQuickComplete(id) {
  const completedDate = document.getElementById('ct-complete-date')?.value || new Date().toISOString().slice(0, 10);
  updateProject(id, { status: 'completed', endDate: completedDate, completedDate });
  closeModal();
  const p = getProjectById(id);
  toast('✅ Đã hoàn thành: ' + (p?.name || ''), 'success');
  renderProjectsPage();
}

// ── Xóa công trình ────────────────────────────────────────────────
function confirmDeleteCT(id) {
  const p = getProjectById(id);
  if (!p) return;
  if (!canDeleteProject(id)) {
    toast('❌ Công trình còn dữ liệu. Vui lòng xóa dữ liệu trước!', 'error');
    return;
  }
  if (!confirm(`Xóa công trình "${p.name}"?`)) return;
  const idx = projects.findIndex(pr => pr.id === id);
  if (idx < 0) return;
  // Soft-delete: giữ record trong mảng để tránh zombie sau sync
  projects[idx] = { ...projects[idx], deletedAt: Date.now(), updatedAt: Date.now() };
  _saveProjects();
  rebuildCatCTFromProjects(); // đồng bộ cats.congTrinh — tránh project đã xóa còn trong danh mục
  closeModal();
  toast('🗑 Đã xóa: ' + p.name);
  renderProjectsPage();
}
