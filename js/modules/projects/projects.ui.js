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
      // Chuyển sang subtab Báo Cáo rồi set filter CT cho cả 2 bảng TP + NCC
      // (sửa lỗi cũ: #uf-ct không còn tồn tại từ khi tách 2 bảng riêng)
      if (typeof ungShowSubBaoCao === 'function') ungShowSubBaoCao();
      const selTp  = document.getElementById('uf-tp-ct');
      const selNcc = document.getElementById('uf-ncc-ct');
      if (selTp)  { selTp.value = ctName;  filterAndRenderUngTp(); }
      if (selNcc) { selNcc.value = ctName; filterAndRenderUngNcc(); }

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

// ── Đếm số ngày theo lịch (LOCAL), TÍNH CẢ ngày bắt đầu ────────────
// Sửa lỗi lệch múi giờ: new Date("YYYY-MM-DD") là nửa đêm UTC, trừ cho
// Date.now() (local) sẽ lệch tới 1 ngày ở VN (UTC+7). Ở đây ta parse cả
// 2 mốc về nửa đêm LOCAL rồi mới trừ → ra số ngày nguyên, không trôi giờ.
// Quy ước: ngày bắt đầu = Ngày 1 (bắt đầu hôm nay → trả về 1).
function _daysInclusiveLocal(startISO, endISO) {
  if (!startISO) return 0;
  const toLocalMidnight = s => {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, m - 1, d); // nửa đêm theo giờ địa phương
  };
  const start = toLocalMidnight(startISO);
  let end;
  if (endISO) {
    end = toLocalMidnight(endISO);
  } else {
    const n = new Date();
    end = new Date(n.getFullYear(), n.getMonth(), n.getDate()); // hôm nay, nửa đêm local
  }
  return Math.max(0, Math.floor((end - start) / 86400000) + 1);
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
  const endISO = (p.endDate && p.status === 'closed') ? p.endDate : null;
  return _daysInclusiveLocal(sd, endISO);
}

// ── Ngày bắt đầu công trình (ưu tiên startDate → hóa đơn Nhân Công sớm nhất) ──
function _ctResolveStartISO(p, invList) {
  return p.startDate || (() => {
    const first = (invList || [])
      .filter(i => i.source === 'cc' && i.ngay)
      .sort((a, b) => a.ngay.localeCompare(b.ngay))[0];
    return first ? first.ngay : null;
  })();
}

// ── Trích xuất mã phân loại + tên hiển thị từ tên công trình ────────
// Quy ước: mã = cụm 2–4 CHỮ IN HOA ở đầu tên (CT, SC, SN, NB…), theo sau là
// dấu phân cách (khoảng trắng, "-", ":", "."). Nếu có mã rõ ràng → cắt bỏ khỏi
// tên để badge + tên không bị lặp chữ. Nếu không có mã in hoa (VD "Nhà anh Tài")
// → vẫn lấy 2 ký tự đầu in hoa làm badge nhưng GIỮ NGUYÊN tên.
function _ctCategoryInfo(name) {
  const raw = (name || '').trim();
  if (!raw) return { code: '', display: '' };
  // Mã in hoa ở đầu + dấu phân cách (lookahead chặn trường hợp là chữ Hoa-thường như "Nhà")
  const m = raw.match(/^([A-ZĐ]{2,4})(?![a-zà-ỹ])[\s\-–:.]*/);
  if (m) {
    const display = raw.slice(m[0].length).trim();
    return { code: m[1], display: display || raw };
  }
  // Không có mã in hoa rõ ràng → badge = 2 ký tự đầu in hoa, giữ nguyên tên
  return { code: raw.slice(0, 2).toUpperCase(), display: raw };
}

// ── Badge phân loại (UI tối giản: nền nhạt, chữ xám đậm) ─────────────
function _ctCategoryBadge(name) {
  const { code } = _ctCategoryInfo(name);
  if (!code) return '';
  return `<span style="font-size:10px;font-weight:700;color:var(--bs-secondary-color);background:rgba(var(--bs-secondary-rgb),.14);border-radius:5px;padding:1px 6px;letter-spacing:.3px;white-space:nowrap">${code}</span>`;
}

// ── Nhận biết công trình "vắt năm" ──────────────────────────────────
// Vắt năm = thi công > 365 ngày HOẶC năm khởi công khác năm kết thúc
// (endISO: dùng endDate nếu đã đóng/hoàn thành, ngược lại lấy năm hiện tại).
function _ctCrossYearInfo(p, invList) {
  const startISO = _ctResolveStartISO(p, invList);
  if (!startISO) return { cross: false, startY: null, endY: null, days: 0 };
  const endISO = (p.endDate && p.status === 'closed') ? p.endDate : null;
  const days   = _daysInclusiveLocal(startISO, endISO);
  const yearOf = iso => Number(String(iso).slice(0, 4));
  const startY = yearOf(startISO);
  const endY   = endISO ? yearOf(endISO) : new Date().getFullYear();
  return { cross: days > 365 || startY !== endY, startY, endY, days };
}

// ── Badge "Vắt năm" nhỏ (cam/đỏ nhạt) — dùng ngoài card danh sách ───
function _ctCrossYearBadge(p, invList) {
  const info = _ctCrossYearInfo(p, invList);
  if (!info.cross) return '';
  return `<span style="font-size:10px;font-weight:700;color:#d9480f;background:rgba(253,126,20,.14);border-radius:5px;padding:1px 6px;white-space:nowrap">Vắt năm</span>`;
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
      <div class="d-flex align-items-center gap-2">
        <button class="btn btn-outline-secondary btn-sm" onclick="openKhachHangModal()"><span class="material-symbols-outlined msi-gap">group</span>Quản Lý Khách Hàng</button>
        <button class="btn btn-primary btn-sm" onclick="openCTCreateModal()">+ Thêm Công Trình</button>
      </div>
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
        const _cat    = _ctCategoryInfo(p.name);
        const _badges = `<span style="display:inline-flex;gap:4px;margin-left:5px;vertical-align:middle">${_ctCategoryBadge(p.name)}${_ctCrossYearBadge(p, [])}</span>`;
        return `<div class="ct-card card shadow-sm overflow-hidden" onclick="openCTDetail('${p.id}')" style="cursor:pointer;${dim}">
          <div class="ct-card-head" style="align-items:flex-start">
            <div style="flex:1;min-width:0">
              <div class="ct-card-name" style="margin-bottom:5px">${x(_cat.display)}${_badges}</div>
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
        <div class="ct-card-name" style="margin-bottom:5px"><span class="material-symbols-outlined msi-gap">apartment</span>${x(PROJECT_COMPANY.name)}</div>
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
      const _cat = _ctCategoryInfo(p.name);
      const _badges = `<span style="display:inline-flex;gap:4px;margin-left:5px;vertical-align:middle">${_ctCategoryBadge(p.name)}${_ctCrossYearBadge(p, c.invs)}</span>`;
      // [MODIFIED] Hiển thị placeholder nếu count = 0 để card không bị lệch
      const countLine = c.count > 0
        ? `<span>${c.count} hóa đơn</span>${durLabel ? `<span class="text-secondary">·</span><span>${durLabel}</span>` : ''}`
        : `<span class="ghost">Chưa phát sinh</span>`;
      // [FIX] Hiển thị TỔNG CHI thực tế (gồm ứng thầu phụ / NCC) thay vì chỉ tổng hóa đơn
      return `<div class="ct-card card shadow-sm overflow-hidden" onclick="openCTDetail('${p.id}')" style="cursor:pointer;${dim}">
        <div class="ct-card-head" style="align-items:flex-start">
          <div style="flex:1;min-width:0">
            <div class="ct-card-name" style="margin-bottom:5px">${x(_cat.display)}${_badges}</div>
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
// ══════════════════════════════════════════════════════════════════
//  MODAL CHI TIẾT CÔNG TRÌNH — helper dùng riêng cho openCTDetail
// ══════════════════════════════════════════════════════════════════

// Badge trạng thái (màu RIÊNG cho modal — KHÔNG đụng _PT_STATUS_META global
// để không đổi màu ở trang Tổng Quan). Theo yêu cầu: đang thi công = xanh dương,
// hoàn thành = cam, đã quyết toán = xanh lá đậm.
function _ctdStatusBadge(status) {
  const M = {
    planning:  { label: 'Chuẩn bị thi công', bg: '#6c757d' }, // xám
    active:    { label: 'Đang thi công',      bg: '#0d6efd' }, // xanh dương
    completed: { label: 'Hoàn thành',         bg: '#fd7e14' }, // cam
    closed:    { label: 'Đã quyết toán',      bg: '#157347' }, // xanh lá đậm
  };
  const m = M[status] || { label: status || '—', bg: '#6c757d' };
  return `<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:10px;background:${m.bg};color:#fff;white-space:nowrap;vertical-align:middle">${m.label}</span>`;
}

// Thanh tiến độ % (dùng cho cột Doanh Thu & Chi Phí). over=true → tô đỏ cảnh báo vượt.
function _ctdProgress(pct, opts) {
  const o = opts || {};
  const val = Math.max(0, Math.round(pct || 0));
  const barW = Math.min(100, val);
  const barColor = o.over ? 'var(--bs-danger)' : (o.color || 'var(--bs-success)');
  return `<div style="display:flex;align-items:center;gap:8px;margin-top:8px">
    <div style="flex:1;height:8px;background:var(--bs-tertiary-bg);border-radius:5px;overflow:hidden">
      <div style="height:100%;width:${barW}%;background:${barColor};border-radius:5px;transition:width .3s"></div>
    </div>
    <span style="font-size:12px;font-weight:700;font-family:'IBM Plex Mono',monospace;color:${barColor};min-width:38px;text-align:right">${val}%</span>
  </div>`;
}

// Chuyển tab trong modal (tự chứa — bật panel được chọn, ẩn các panel còn lại)
function _ctdSwitchTab(btn, name) {
  const body = document.getElementById('modal-body');
  if (!body) return;
  body.querySelectorAll('.ctd-tab-btn').forEach(b => b.classList.remove('active'));
  body.querySelectorAll('.ctd-panel').forEach(pnl => { pnl.style.display = 'none'; });
  btn.classList.add('active');
  const panel = body.querySelector('#ctd-panel-' + name);
  if (panel) panel.style.display = 'block';
}

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

  // ── Tiêu đề modal: mã phân loại + tên + trạng thái + badge vắt năm ──
  const _mCat  = isCompany ? { code: '', display: p.name } : _ctCategoryInfo(p.name);
  const _mCatBadge = isCompany ? '' : _ctCategoryBadge(p.name);
  const _mCross = isCompany ? { cross: false } : _ctCrossYearInfo(p, c.invs);
  const _mCrossBadge = _mCross.cross
    ? `<span style="font-size:10px;font-weight:700;color:#d9480f;background:rgba(253,126,20,.14);border-radius:6px;padding:2px 8px;white-space:nowrap">Vắt năm ${String(_mCross.startY).slice(-2)}-${String(_mCross.endY).slice(-2)}</span>`
    : '';
  document.getElementById('modal-title').innerHTML =
    `<span class="material-symbols-outlined msi-gap">construction</span>${x(_mCat.display)} ${_mCatBadge} ${_ctdStatusBadge(p.status)} ${_mCrossBadge}`;

  let html = '';

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

  // ── Tổng chi phí dự toán = Tổng chi phí hóa đơn của CT + Tổng giá trị HĐ thầu phụ ──
  // (Màn hình chi tiết giờ chỉ tập trung theo dõi chi phí, đã bỏ Lãi/Lỗ)
  const tongChiPhiDuToan = (c.total || 0) + tongHDTP;

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

  const conPhaiThu = tongGiaTriHD - tongThu;

  // ── Fix 4: Ngày bắt đầu chính xác — priority: startDate → first CC inv → null
  const _ctStartDate = p.startDate || (() => {
    const firstCC = c.invs.filter(i => i.source === 'cc' && i.ngay)
                          .sort((a, b) => a.ngay.localeCompare(b.ngay))[0];
    return firstCC ? firstCC.ngay : null;
  })();
  // Đếm ngày theo lịch local, tính cả ngày bắt đầu (tránh lệch múi giờ — xem _daysInclusiveLocal)
  const _ctEndISO    = (p.endDate && p.status === 'closed') ? p.endDate : null;
  const durationDays = _daysInclusiveLocal(_ctStartDate, _ctEndISO);
  const _durLabel    = durationDays > 0 ? `${durationDays} ngày` : '';
  const _sd          = _ctStartDate;

  // Phân bổ chi phí chung: dùng allocateCompanyCost() (weight = days × factor theo tên)
  const _allocEntry = (!isCompany && p.startDate) ? allocateCompanyCost().find(a => a.p.id === p.id) : null;
  const _chiPhiChungFixed = _allocEntry ? _allocEntry.allocated : 0;

  // ══ TÍNH TOÁN TÀI CHÍNH CỐT LÕI — dùng CÙNG công thức bảng "Lợi Nhuận" ══
  //   Chi phí   = A(hóa đơn/vật tư) + B(HĐ thầu phụ) + C(chi phí chung phân bổ)
  //   Doanh thu = X(HĐ chính)       + Y(quyết toán, có dấu ±)
  //   Lợi nhuận = Doanh thu − Chi phí  → khớp tuyệt đối với tab Doanh Thu → Lợi Nhuận
  const _A = c.total;            // (A) hóa đơn/vật tư của CT
  const _B = tongHDTP;           // (B) tổng giá trị HĐ thầu phụ
  const _C = _chiPhiChungFixed;  // (C) chi phí chung CÔNG TY phân bổ cho CT
  const _X = tongGiaTriHD;       // (X) HĐ chính (giaTri + giaTriphu + phatSinh)
  const _Y = (typeof quyetToanRecords !== 'undefined' ? quyetToanRecords : [])   // (Y) quyết toán
    .filter(r => !r.deletedAt && _dtInYear(r.ngay) &&
      (r.projectId ? r.projectId === p.id
                   : (resolveProjectName(r) === p.name || r.congtrinh === p.name)))
    .reduce((s, r) => s + (r.giaTri || 0), 0);

  const doanhThu    = _X + _Y;                  // tổng doanh thu công trình
  const chiPhiTong  = _A + _B + _C;             // tổng chi phí (dự toán/ước tính)
  const loiNhuan    = doanhThu - chiPhiTong;    // lãi (≥0) / lỗ (<0)
  const conPhaiThuCT = doanhThu - tongThu;      // còn phải thu từ chủ đầu tư
  const pctThu = doanhThu   > 0 ? Math.round(tongThu / doanhThu * 100) : 0;          // % đã thu
  const pctChi = chiPhiTong > 0 ? Math.round(tongChiCongTrinh / chiPhiTong * 100) : 0; // % đã chi / dự toán
  const isActiveCT = (p.status === 'active' || p.status === 'planning'); // đang thi công

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

  // ═══════════════════ DỰNG GIAO DIỆN MỚI ═══════════════════
  // CSS scoped trong modal: responsive + style thanh Tab
  html += `<style>
    .ctd-tabbar{display:flex;gap:2px;flex-wrap:wrap;border-bottom:1.5px solid var(--bs-border-color);margin:6px 0 12px}
    .ctd-tab-btn{border:none;background:transparent;padding:8px 14px;font-size:13px;font-weight:600;color:var(--bs-secondary-color);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1.5px}
    .ctd-tab-btn.active{color:var(--bs-primary);border-bottom-color:var(--bs-primary)}
    @media(max-width:640px){.ctd-core{grid-template-columns:1fr!important}.ctd-btns .btn{flex:1;justify-content:center}}
  </style>`;

  // ── Dải phụ dưới tiêu đề: khởi công · số ngày · chủ đầu tư · địa chỉ ──
  const _sdTxt = _sd ? (() => { const [y, m, d] = _sd.split('-'); return `${d}-${m}-${y}`; })() : '';
  const _custName = (() => {
    const _cust = (p.customerId && typeof getCustomerById === 'function') ? getCustomerById(p.customerId) : null;
    return _cust ? _cust.name : (p.chuDauTu || '');
  })();
  html += `
  <div class="text-secondary" style="display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;margin-bottom:12px">
    ${_sdTxt ? `<span><span class="material-symbols-outlined msi-gap">calendar_month</span>Khởi công: <strong style="color:var(--bs-body-color)">${_sdTxt}</strong></span>` : ''}
    ${_durLabel ? `<span><span class="material-symbols-outlined msi-gap">timer</span>Đã thực hiện: <strong style="color:${_mCross.cross ? '#d9480f' : 'var(--bs-body-color)'}">${_durLabel}${_mCross.cross ? ' (qua 2 năm)' : ''}</strong></span>` : ''}
    ${p.endDate ? `<span><span class="material-symbols-outlined msi-gap">check_circle</span>Hoàn thành: <strong style="color:var(--bs-body-color)">${_fmtProjDate(p.endDate)}</strong></span>` : ''}
    ${p.closedDate ? `<span><span class="material-symbols-outlined msi-gap">bar_chart</span>Quyết toán: <strong style="color:var(--bs-body-color)">${_fmtProjDate(p.closedDate)}</strong></span>` : ''}
    ${_custName ? `<span><span class="material-symbols-outlined msi-gap">person</span>CĐT: <strong style="color:var(--bs-body-color)">${x(_custName)}</strong></span>` : ''}
    ${p.note ? `<span><span class="material-symbols-outlined msi-gap">location_on</span>${x(p.note)}</span>` : ''}
  </div>`;

  // Helper cục bộ: danh sách phân rã chi phí theo loại (dùng cho tab 1 & view CÔNG TY)
  const _costBreakdownHtml = () => {
    if (!c.invs.length)
      return `<div class="text-secondary" style="font-size:12px;padding:6px 0">Không có hóa đơn nào trong ${x(yearLabel.toLowerCase())}</div>`;
    return loaiRows.map(([loai, invList]) => {
      const lt = invList.reduce((s, i) => s + (i.thanhtien || i.tien || 0), 0);
      return `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:6px 0;border-top:1px solid var(--bs-border-color);font-size:12.5px">
        <span>${x(loai)} <span class="text-secondary" style="font-size:11px">(${invList.length} hóa đơn)</span></span>
        <span style="font-family:'IBM Plex Mono',monospace;font-weight:600;color:${CR};white-space:nowrap">${fmtS(lt)}</span>
      </div>`;
    }).join('');
  };

  // ══ NHÁNH CÔNG TY: view đơn giản (chỉ tổng chi phí + phân rã) ══
  if (isCompany) {
    html += `
    <div style="${_bxR};margin-bottom:12px">
      ${_lb('Tổng Chi Phí Chung Công Ty · ' + x(yearLabel))}
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:8px">
        ${_vl(fmtS(c.total), CR)}
        <span class="text-secondary" style="font-size:12px">${c.count} hóa đơn</span>
      </div>
    </div>
    <div style="${_bx}">
      ${_lb('Phân Rã Chi Phí')}
      ${_costBreakdownHtml()}
    </div>`;
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('ct-modal').classList.add('open');
    return;
  }

  // ══ KHU TÀI CHÍNH CỐT LÕI (3 cột: Doanh thu · Chi phí · Lãi/Lỗ) ══
  const _cols = isKetoan() ? 1 : 3; // kế toán chỉ xem Chi phí

  // Cột 1 — DOANH THU: số CHÍNH là "Đã thu" (dòng tiền thực đã vào), kèm HĐ + còn phải thu
  const _colRevenue = `
    <div style="${_bxG}">
      ${_lb('<span class="material-symbols-outlined msi-gap">payments</span>Doanh Thu (HĐ + Quyết toán)')}
      ${_vl(tongThu ? fmtS(tongThu) : '—', CG)}
      <div class="text-secondary" style="font-size:11px;font-weight:600;margin-top:2px">Đã thu${soDotThu ? ` · ${soDotThu} đợt` : ''}</div>
      ${doanhThu > 0 ? _ctdProgress(pctThu, { color: CG }) : ''}
      <div class="text-secondary" style="font-size:11.5px;margin-top:6px">
        HĐ: <strong style="color:var(--bs-body-color)">${fmtS(doanhThu)}</strong>
        · Còn phải thu: <strong style="font-family:'IBM Plex Mono',monospace;color:${conPhaiThuCT > 0 ? CR : CG}">${conPhaiThuCT > 0 ? fmtS(conPhaiThuCT) : (conPhaiThuCT < 0 ? 'Thu dư ' + fmtS(-conPhaiThuCT) : '0')}</strong>
      </div>
    </div>`;

  // Cột 2 — CHI PHÍ THỰC TẾ ĐÃ CHI = chi trực tiếp + chi phí chia tỉ trọng (giá vốn thật của CT)
  const _over = pctChi > 100;
  // Tổng chi phí thực tế hiển thị = chi trực tiếp (tongChiCongTrinh) + chi phí chia tỉ trọng
  const _tongChiHienThi = tongChiCongTrinh + _chiPhiChungFixed;
  const _colCost = `
    <div style="${_bxR}">
      ${_lb('<span class="material-symbols-outlined msi-gap">foundation</span>Chi Phí Thực Tế Đã Chi')}
      ${_vl(_tongChiHienThi ? fmtS(_tongChiHienThi) : '—', CR)}
      ${_chiPhiChungFixed > 0 ? `<div class="text-secondary" style="font-size:11px;margin-top:2px">(${fmtS(_chiPhiChungFixed)} chi phí chia tỉ trọng)</div>` : ''}
      ${isActiveCT ? `
        ${_ctdProgress(pctChi, { color: CB, over: _over })}
        <div class="text-secondary" style="font-size:11.5px;margin-top:6px">
          Dự toán: <strong style="color:var(--bs-body-color)">${fmtS(chiPhiTong)}</strong>${_over ? ` <span style="color:${CR};font-weight:700">· <span class="material-symbols-outlined msi-gap">warning</span>Vượt dự toán</span>` : ''}
        </div>` : `
        <div class="text-secondary" style="font-size:11.5px;margin-top:6px">Tổng chi phí công trình (đã chốt)</div>`}
      ${_mCross.cross ? `<div style="font-size:10px;font-style:italic;color:#9ca3af;margin-top:6px">*(Dữ liệu chi phí trải dài từ năm ${_mCross.startY} - ${_mCross.endY})</div>` : ''}
    </div>`;

  // Cột 3 — HIỆU QUẢ: số CHÍNH = lãi/lỗ TỚI HIỆN TẠI = Đã thu − (chi thực tế + chi phí chia tỉ trọng).
  //   Đang thi công: câu giải thích nêu thêm "lãi dự kiến khi hoàn thành" (= doanh thu − tổng chi phí).
  //   Đã hoàn thành/quyết toán: dùng luôn lãi/lỗ cuối (loiNhuan).
  const laiHienTai = tongThu - (tongChiCongTrinh + _chiPhiChungFixed); // lãi/lỗ dòng tiền tới hiện tại
  const _hqNum   = isActiveCT ? laiHienTai : loiNhuan;
  const _hqPos   = _hqNum >= 0;
  const _hqColor = _hqPos ? CG : CR;
  const _hqBg    = _hqPos ? BG : BR;
  let _hqDesc;
  if (isActiveCT) {
    const _duKien = loiNhuan >= 0
      ? `Lãi <strong style="color:${CG}">dự kiến</strong> khi hoàn thành: <strong>${fmtS(loiNhuan)}</strong>.`
      : `Dự kiến <strong style="color:${CR}">lỗ ${fmtS(-loiNhuan)}</strong> khi hoàn thành.`;
    _hqDesc = `Đang thi công — đây là ${_hqPos ? 'lãi' : 'lỗ'} tính tới thời điểm hiện tại `
      + `(${_hqPos ? 'thu nhiều hơn chi' : 'chi nhiều hơn thu'}). ${_duKien}`;
  } else {
    const _tt = (p.status === 'closed') ? 'đã quyết toán' : 'đã hoàn thành';
    _hqDesc = _hqPos
      ? `Công trình ${_tt} — đạt lợi nhuận <strong style="color:${CG}">${fmtS(loiNhuan)}</strong>.`
      : `Công trình ${_tt} — <strong style="color:${CR}">lỗ ${fmtS(-loiNhuan)}</strong>.`;
  }
  const _colProfit = `
    <div style="border:1.5px solid ${_hqColor};border-radius:8px;padding:11px 14px;background:${_hqBg}">
      ${_lb((_hqPos ? '<span class="material-symbols-outlined msi-gap">trending_up</span>' : '<span class="material-symbols-outlined msi-gap">trending_down</span>') + 'Hiệu Quả (Lãi / Lỗ)')}
      <div style="font-size:24px;font-weight:800;font-family:'IBM Plex Mono',monospace;color:${_hqColor};line-height:1.2">${_hqPos ? '' : '−'}${fmtS(Math.abs(_hqNum))}</div>
      <div class="text-secondary" style="font-size:11.5px;margin-top:6px;line-height:1.5">${_hqDesc}</div>
    </div>`;

  html += `<div class="ctd-core" style="display:grid;grid-template-columns:repeat(${_cols},minmax(0,1fr));gap:10px;margin-bottom:14px">
    ${isKetoan() ? '' : _colRevenue}
    ${_colCost}
    ${isKetoan() ? '' : _colProfit}
  </div>`;

  // ── Hàng nút hành động ──
  html += `
  <div class="ctd-btns" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
    <button class="btn btn-outline-secondary btn-sm" onclick="openCTEditModal('${p.id}')"><span class="material-symbols-outlined msi-gap">edit</span>Sửa</button>
    ${p.status !== 'completed' && !isClosed ? `<button class="btn btn-outline-secondary btn-sm" onclick="quickCompleteCT('${p.id}')"><span class="material-symbols-outlined msi-gap">check_circle</span>Hoàn Thành</button>` : ''}
    ${!isClosed ? `<button class="btn btn-outline-secondary btn-sm" onclick="quickCloseCT('${p.id}')"><span class="material-symbols-outlined msi-gap">bar_chart</span>Quyết Toán</button>` : ''}
    <button class="btn btn-danger btn-sm" style="margin-left:auto" onclick="confirmDeleteCT('${p.id}')"><span class="material-symbols-outlined msi-gap">delete</span>Xóa</button>
  </div>`;

  // ══ 3 TAB CHI TIẾT ══
  // Tab 1 — Phân rã chi phí
  const _tab1 = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:4px">
      <span style="font-weight:700;font-size:13px">Tổng chi phí trực tiếp: <span style="color:${CR};font-family:'IBM Plex Mono',monospace">${fmtS(c.total)}</span></span>
      ${_xct('thongke')}
    </div>
    ${_costBreakdownHtml()}`;

  // Tab 2 — Thầu phụ & Đối tác: HĐ thầu phụ + đã ứng (thầu phụ, nhà cung cấp)
  const _tpContracts = (typeof thauPhuContracts !== 'undefined' ? thauPhuContracts : [])
    .filter(r => !r.deletedAt && (r.projectId ? r.projectId === p.id : r.congtrinh === p.name))
    .sort((a, b) => (b.ngay || '').localeCompare(a.ngay || ''));
  // Gom tiền đã ứng theo tên đối tác (thầu phụ & nhà cung cấp riêng)
  const _ungByName = (loaiUng) => {
    const map = {};
    (typeof ungRecords !== 'undefined' ? ungRecords : []).forEach(r => {
      if (r.deletedAt || r.loai !== loaiUng || !inActiveYear(r.ngay)) return;
      if (!(r.projectId ? r.projectId === p.id : r.congtrinh === p.name)) return;
      const nm = (recCatName(r, 'ung', 'tp') || r.tp || '—').trim() || '—';
      map[nm] = (map[nm] || 0) + (r.tien || 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  };
  const _tpUngRows = _ungByName('thauphu');
  const _nccUngRows = _ungByName('nhacungcap');
  const _ungBlock = (title, total, rows, color) => rows.length ? `
    <div style="margin-top:12px;font-weight:700;font-size:12.5px;color:var(--bs-secondary-color)">${title}: <span style="color:${color};font-family:'IBM Plex Mono',monospace">${fmtS(total)}</span></div>
    ${rows.map(([nm, tien]) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-top:1px dashed var(--bs-border-color);font-size:12.5px">
      <span>${x(nm)}</span><span style="font-family:'IBM Plex Mono',monospace;font-weight:600;color:${color}">${fmtS(tien)}</span>
    </div>`).join('')}` : '';
  let _tab2;
  if (!_tpContracts.length && !_tpUngRows.length && !_nccUngRows.length) {
    _tab2 = `<div class="text-secondary" style="font-size:12px;padding:6px 0">Chưa có hợp đồng / tạm ứng thầu phụ · nhà cung cấp cho công trình này.</div>`;
  } else {
    _tab2 = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:4px">
        <span style="font-weight:700;font-size:13px">Hợp đồng thầu phụ: <span style="color:${CA};font-family:'IBM Plex Mono',monospace">${fmtS(tongHDTP)}</span></span>
        ${_xct('ung')}
      </div>
      ${_tpContracts.length ? _tpContracts.map(r => {
        const gt = (r.giaTri || 0) + (r.phatSinh || 0);
        const nm = recCatName(r, 'thauphu', 'thauphu') || '—';
        return `<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid var(--bs-border-color);font-size:12.5px">
          <span><strong>${x(nm)}</strong>${r.nd ? ` <span class="text-secondary">· ${x(r.nd)}</span>` : ''}${r.ngay ? ` <span class="text-secondary" style="font-size:11px">(${_fmtProjDate(r.ngay)})</span>` : ''}</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-weight:600;color:${CA};white-space:nowrap">${fmtS(gt)}</span>
        </div>`;
      }).join('') : '<div class="text-secondary" style="font-size:12px;padding:6px 0">Chưa có hợp đồng thầu phụ.</div>'}
      ${_ungBlock('Đã ứng cho thầu phụ', ungTpCost, _tpUngRows, CR)}
      ${_ungBlock('Nhà cung cấp đã ứng', ungNccCost, _nccUngRows, CR)}`;
  }

  // Tab 3 — Lịch sử thu tiền từ chủ đầu tư
  const _LOAI_THU = { tamung: ['Tạm ứng', '#fd7e14'], giaidoan: ['Giai đoạn', '#0dcaf0'], quyettoan: ['Quyết toán', '#198754'] };
  const _thuList = (typeof thuRecords !== 'undefined' ? thuRecords : [])
    .filter(r => !r.deletedAt && inActiveYear(r.ngay) && (r.projectId ? r.projectId === p.id : r.congtrinh === p.name))
    .sort((a, b) => (b.ngay || '').localeCompare(a.ngay || ''));
  let _tab3;
  if (!_thuList.length) {
    _tab3 = `<div class="text-secondary" style="font-size:12px;padding:6px 0">Chưa có đợt thu tiền nào từ chủ đầu tư.</div>`;
  } else {
    _tab3 = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:4px">
        <span style="font-weight:700;font-size:13px">Tổng đã thu (${_thuList.length} đợt): <span style="color:${CG};font-family:'IBM Plex Mono',monospace">${fmtS(tongThu)}</span></span>
        ${_xct('doanhthu')}
      </div>
      ${_thuList.map(r => {
        const lb = _LOAI_THU[r.loaiThu];
        const badge = lb ? `<span style="font-size:10px;font-weight:700;color:${lb[1]};border:1px solid ${lb[1]};border-radius:5px;padding:1px 6px;margin-left:6px">${lb[0]}</span>` : '';
        return `<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid var(--bs-border-color);font-size:12.5px">
          <span>${r.ngay ? `<strong>${_fmtProjDate(r.ngay)}</strong>` : ''}${badge}${r.nd ? ` <span class="text-secondary">· ${x(r.nd)}</span>` : ''}</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-weight:600;color:${CG};white-space:nowrap">${fmtS(r.tien || 0)}</span>
        </div>`;
      }).join('')}`;
  }

  // Dựng thanh tab + panel (kế toán chỉ có tab Phân rã chi phí)
  const _tabs = [{ id: 'chiphi', label: '<span class="material-symbols-outlined msi-gap">foundation</span>Phân rã chi phí', body: _tab1 }];
  if (!isKetoan()) {
    _tabs.push({ id: 'thauphu', label: '<span class="material-symbols-outlined msi-gap">handshake</span>Thầu phụ & Đối tác', body: _tab2 });
    _tabs.push({ id: 'thutien', label: '<span class="material-symbols-outlined msi-gap">payments</span>Lịch sử thu tiền', body: _tab3 });
  }
  html += `<div class="ctd-tabbar">`
    + _tabs.map((t, i) => `<button class="ctd-tab-btn${i === 0 ? ' active' : ''}" onclick="_ctdSwitchTab(this,'${t.id}')">${t.label}</button>`).join('')
    + `</div>`;
  html += _tabs.map((t, i) => `<div class="ctd-panel" id="ctd-panel-${t.id}" style="display:${i === 0 ? 'block' : 'none'}">${t.body}</div>`).join('');

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
        <button class="btn btn-primary" style="flex:1" onclick="saveCTCreate()"><span class="material-symbols-outlined msi-gap">save</span>Lưu Công Trình</button>
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
  document.getElementById('modal-title').innerHTML = '<span class="material-symbols-outlined msi-gap">edit</span>Sửa Công Trình';
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
        <button class="btn btn-primary" style="flex:1" onclick="saveCTEdit('${p.id}')"><span class="material-symbols-outlined msi-gap">save</span>Lưu Thay Đổi</button>
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

  try {
    updateProject(id, { name, status, startDate, startDateUserEdited, endDate: endDate || null, closedDate: closedDate || null, note, chuDauTu, customerId, heSoTiTrong });
  } catch (e) {
    // updateProject throw khi tên trùng CT khác hoặc trùng tên Danh Mục
    toast('❌ ' + e.message, 'error');
    document.getElementById('ct-edit-name')?.focus();
    return;
  }
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
  document.getElementById('modal-title').innerHTML = '<span class="material-symbols-outlined msi-gap">lock</span>Quyết Toán Công Trình';
  document.getElementById('modal-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="text-secondary" style="font-size:13px">Đánh dấu <strong>${x(p.name)}</strong> là <strong>Đã Quyết Toán</strong>?</div>
      <div>
        <label style="${lblStyle}">Ngày Quyết Toán</label>
        <input id="ct-close-date" type="date" value="${todayStr}"
          style="${inpStyle};font-family:'IBM Plex Mono',monospace">
      </div>
      <div class="text-secondary" style="font-size:12px;background:var(--bs-tertiary-bg);border-radius:6px;padding:8px 10px">
        <span class="material-symbols-outlined msi-gap">warning</span>Sau khi quyết toán, không thể thêm mới dữ liệu vào công trình này.
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="flex:1" onclick="confirmQuickClose('${p.id}')"><span class="material-symbols-outlined msi-gap">lock</span>Xác Nhận</button>
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
  document.getElementById('modal-title').innerHTML = '<span class="material-symbols-outlined msi-gap">check_circle</span>Hoàn Thành Công Trình';
  document.getElementById('modal-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="text-secondary" style="font-size:13px">Đánh dấu <strong>${x(p.name)}</strong> là <strong>Đã Hoàn Thành</strong>?</div>
      <div>
        <label style="${lblStyle}">Ngày Hoàn Thành</label>
        <input id="ct-complete-date" type="date" value="${todayStr}"
          style="${inpStyle};font-family:'IBM Plex Mono',monospace">
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="flex:1" onclick="confirmQuickComplete('${p.id}')"><span class="material-symbols-outlined msi-gap">check_circle</span>Xác Nhận</button>
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
