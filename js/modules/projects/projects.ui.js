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
// ── Chọn 1 công trình trong ô lọc <select> mà KHÔNG BAO GIỜ để ô bị trắng (04/10/2026) ──
// Nguyên nhân ô trắng: danh sách option của ô lọc chỉ gồm các CT CÓ dữ liệu trong năm đang lọc
// (VD f-ct của Thống Kê CP/HĐ dựng từ hóa đơn). CT không có hóa đơn nào → không có option →
// gán .value thất bại → ô trắng, bảng không lọc. Cách vá:
//   1) khớp đúng tên → chọn luôn
//   2) khớp KHÔNG phân biệt hoa/thường/khoảng trắng → chọn option đó (tên lệch nhẹ)
//   3) không có → THÊM option tạm "(tên) — không có dữ liệu" rồi chọn → ô hiện đúng tên, bảng lọc ra rỗng
// KHÔNG phát sự kiện change: onchange của f-ct gọi buildFilters() dựng lại option → sẽ xóa option tạm.
// Trả về true nếu CT có sẵn trong danh sách (có dữ liệu), false nếu phải thêm option tạm.
function _ctSelectForce(sel, ctName) {
  if (!sel) return false;
  const norm = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const opts = [...sel.options];
  let opt = opts.find(o => o.value === ctName) || opts.find(o => norm(o.value) === norm(ctName));
  const coSan = !!opt;
  if (!opt) {
    sel.querySelectorAll('option[data-tmp-ct]').forEach(o => o.remove());   // dọn option tạm lần trước
    opt = document.createElement('option');
    opt.value = ctName;
    opt.textContent = ctName + ' — không có dữ liệu';
    opt.dataset.tmpCt = '1';
    sel.appendChild(opt);
  }
  sel.value = opt.value;
  return coSan;
}

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
      if (sel) { _ctSelectForce(sel, ctName); filterAndRender(); }

    } else if (tabId === 'ung') {
      // Chuyển sang subtab Báo Cáo rồi set filter CT cho cả 2 bảng TP + NCC
      // (sửa lỗi cũ: #uf-ct không còn tồn tại từ khi tách 2 bảng riêng)
      if (typeof ungShowSubBaoCao === 'function') ungShowSubBaoCao();
      const selTp  = document.getElementById('uf-tp-ct');
      const selNcc = document.getElementById('uf-ncc-ct');
      if (selTp)  { _ctSelectForce(selTp, ctName);  filterAndRenderUngTp(); }
      if (selNcc) { _ctSelectForce(selNcc, ctName); filterAndRenderUngNcc(); }

    } else if (tabId === 'doanhthu') {
      // (03/10/2026) Mở subtab HỢP ĐỒNG CHÍNH + lọc sẵn Danh Sách HĐ theo công trình này
      // (trước đây gán nhầm _dtCtFilter của subtab KHAI BÁO cũ nên bộ lọc không ăn)
      if (typeof dtFilterHdcByCt === 'function') dtFilterHdcByCt(ctName);

    } else if (tabId === 'thietbi') {
      const sel = document.getElementById('tb-filter-ct');
      if (sel) { _ctSelectForce(sel, ctName); tbPage = 1; tbRenderList(); }

    } else if (tabId === 'thongke') {
      // Thống Kê CP/HĐ: dựng lại option theo dữ liệu mới nhất TRƯỚC, rồi mới chọn CT
      // (goPage đã gọi buildFilters, gọi lại cho chắc khi cache vừa đổi) → lọc bảng
      if (typeof buildFilters === 'function') buildFilters();
      const sel = document.getElementById('f-ct');
      if (sel) {
        const coSan = _ctSelectForce(sel, ctName);
        filterAndRender();
        if (!coSan) toast(`"${ctName}" không có hóa đơn nào trong năm đang lọc`, 'info');
      }
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

// ══ TÀI CHÍNH CỐT LÕI CỦA 1 CÔNG TRÌNH (single source of truth) ══════
// Dùng CHUNG cho modal chi tiết công trình (openCTDetail) và tab QUYẾT TOÁN
// (quyettoan.congtrinh.js) → 2 nơi luôn cùng số. Theo NĂM ĐANG LỌC như modal:
//   Doanh thu       = TỔNG ĐÃ THU thực tế (cash-basis, từ thuRecords) — đổi 04/10/2026
//   Giá trị HĐ      = max(HĐ chính, Đã thu) + Quyết toán (±)  — _dtCalcRevenue() — chỉ để tính % / còn phải thu
//   Chi phí dự toán = hóa đơn + HĐ thầu phụ + chi phí chung chia tỉ trọng
//   Chi thực tế     = tổng chi trực tiếp (_ctTongChi) + chi phí chung chia tỉ trọng
//   Lãi hiện tại    = Đã thu − Chi thực tế
//   Lợi nhuận       = Doanh thu (đã thu) − Chi phí (A+B+C, cùng tab Lợi Nhuận)
//   Hiệu quả        = đang thi công/kế hoạch → Lãi hiện tại; đã xong → Lợi nhuận
// opts.qtExcludeId / opts.qtExtra: bỏ 1 quyết toán / thêm 1 quyết toán giả định
//   → dùng để xem trước "doanh thu SAU quyết toán" khi đang nhập form.
// @returns {{ c, tc, X, Y, qtSum, tongThu, soDotThu, tongHDTP, chiChung, doanhThu, giaTriHD,
//             chiPhiTong, loiNhuan, chiThucTe, laiHienTai, hieuQua, isActive, conPhaiThu }}
function ctTaiChinh(p, opts) {
  opts = opts || {};
  const c  = _ctGetCosts(p);
  const tc = _ctTongChi(p, c);
  const _match = r => r.projectId ? r.projectId === p.id : r.congtrinh === p.name;

  // (X) HĐ chính (giaTri + giaTriphu + phatSinh) — như modal: không lọc năm
  const hdct = (typeof _hdLookup === 'function')
    ? _hdLookup(p.id) || _hdLookup(p.name)
    : ((typeof hopDongData !== 'undefined' && hopDongData[p.name] && !hopDongData[p.name].deletedAt) ? hopDongData[p.name] : null);
  const X = hdct ? (hdct.giaTri || 0) + (hdct.giaTriphu || 0) + (hdct.phatSinh || 0) : 0;

  // Đã thu (năm đang lọc) + số đợt
  const thuList = (typeof thuRecords !== 'undefined')
    ? thuRecords.filter(r => !r.deletedAt && inActiveYear(r.ngay) && _match(r)) : [];
  const tongThu = thuList.reduce((s, r) => s + (r.tien || 0), 0);

  // (B) tổng HĐ thầu phụ
  const tongHDTP = (typeof thauPhuContracts !== 'undefined')
    ? thauPhuContracts.filter(r => !r.deletedAt && _match(r)).reduce((s, r) => s + (r.giaTri || 0) + (r.phatSinh || 0), 0) : 0;

  // (C) chi phí chung CÔNG TY chia tỉ trọng
  const _alloc = (p.id !== 'COMPANY' && p.startDate && typeof allocateCompanyCost === 'function')
    ? allocateCompanyCost().find(a => a.p.id === p.id) : null;
  const chiChung = _alloc ? _alloc.allocated : 0;

  // (Y) quyết toán đã quy đổi delta (tăng/giảm/thay thế) trong năm đang lọc — quyettoan.core.js
  const qtSum = (typeof qtTongQuyetToan === 'function')
    ? qtTongQuyetToan(p, ngay => _dtInYear(ngay), { excludeId: opts.qtExcludeId, extra: opts.qtExtra })
    : { qt: 0, coThayThe: false };
  const Y = qtSum.qt;

  // Đã có quyết toán (bất kỳ loại) → bỏ quy tắc max(HĐ, Đã thu) — xem _dtCalcRevenue (03/10/2026)
  const giaTriHD   = (typeof _dtCalcRevenue === 'function') ? _dtCalcRevenue(X, tongThu, Y, qtSum.coThayThe || qtSum.coQT) : X + Y;
  const doanhThu   = tongThu;                       // doanh thu = tiền thực thu
  const chiPhiTong = (c.total || 0) + tongHDTP + chiChung;
  const loiNhuan   = doanhThu - chiPhiTong;
  const chiThucTe  = tc.tongChi + chiChung;
  const laiHienTai = tongThu - chiThucTe;
  const isActive   = (p.status === 'active' || p.status === 'planning');
  return {
    c, tc, X, Y, qtSum, tongThu, soDotThu: thuList.length, tongHDTP, chiChung,
    doanhThu, giaTriHD, chiPhiTong, loiNhuan, chiThucTe, laiHienTai, isActive,
    hieuQua: isActive ? laiHienTai : loiNhuan,
    conPhaiThu: giaTriHD - tongThu,
  };
}
window.ctTaiChinh = ctTaiChinh;

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
// (04/10/2026) Chế độ xem danh sách: 'type' (3 phân khu theo loại) | 'client' (gộp theo khách hàng)
let _ctView = (() => { try { return localStorage.getItem('ct_view_mode') === 'client' ? 'client' : 'type'; } catch (e) { return 'type'; } })();
// Các nhóm khách hàng đang MỞ ở chế độ "Theo khách hàng" (key = customerId | '__none__')
const _ctOpenClients = new Set();

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

  // ── Helpers nội bộ ─────────────────────────────────────────────────
  const kpiCount = (lbl, val, color, bg) =>
    `<div style="background:${bg};border-radius:10px;padding:12px 14px;flex:1;min-width:90px;text-align:center">
       <div style="font-size:10px;color:${color};font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;opacity:.8">${lbl}</div>
       <div style="font-size:26px;font-weight:700;color:${color};font-family:'IBM Plex Mono',monospace">${val}</div>
     </div>`;

  const selS = 'padding:7px 10px;border:1.5px solid var(--bs-border-color);border-radius:7px;font-family:inherit;font-size:12px;background:var(--bs-body-bg);color:var(--bs-body-color);outline:none';
  const inpS = 'flex:1;min-width:160px;padding:8px 12px;border:1.5px solid var(--bs-border-color);border-radius:7px;font-family:inherit;font-size:13px;background:var(--bs-body-bg);color:var(--bs-body-color);outline:none';

  wrap.innerHTML = `
    <div class="section-header d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3" style="margin-top:8px">
      <div class="section-title fw-bold mb-0 d-flex align-items-center gap-2"><span class="dot"></span>Tổng Quan Công Trình</div>
      <div class="d-flex align-items-center gap-2">
        <button class="btn btn-outline-secondary btn-sm" onclick="openKhachHangModal()"><span class="material-symbols-outlined msi-gap">contacts</span>Hồ Sơ Khách Hàng</button>
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

    <!-- Filter bar -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <input id="ct-search" type="search" placeholder="🔍  Tìm công trình, khách hàng..." style="${inpS}"
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
        <option value="OTHER">Sửa nhỏ (SN) / Khác</option>
      </select>
      <select id="ct-f-lailo" style="${selS}; display: ${isKetoan() ? 'none' : ''};" onchange="_ctApply()"> <!-- [ROLE KETOAN HIDE] -->
        <option value="">Tất cả</option>
        <option value="lai">Có lãi</option>
        <option value="lo">Đang lỗ</option>
        <option value="khongdu">Chưa đủ dữ liệu</option>
      </select>
    </div>

    <!-- Grid placeholder + công tắc chế độ xem (04/10/2026):
         "Theo loại"  = 3 phân khu CT / SC / SN-Khác
         "Theo khách hàng" = accordion: dòng cha = khách hàng, bấm (+) xổ các công trình -->
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2" style="margin-bottom:10px">
      <div class="section-title fw-bold mb-0 d-flex align-items-center gap-2">
        <span class="dot"></span>Công trình (<span id="ct-grid-count">…</span>)
      </div>
      <div class="btn-group btn-group-sm" role="group" aria-label="Chế độ xem">
        <button type="button" id="ct-view-type" class="btn ${_ctView === 'client' ? 'btn-outline-primary' : 'btn-primary'}" onclick="_ctSetView('type')"><span class="material-symbols-outlined msi-gap">category</span>Theo loại</button>
        <button type="button" id="ct-view-client" class="btn ${_ctView === 'client' ? 'btn-primary' : 'btn-outline-primary'}" onclick="_ctSetView('client')"><span class="material-symbols-outlined msi-gap">account_tree</span>Theo khách hàng</button>
      </div>
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

// ── Khách hàng của 1 công trình → { key, name } (key = customerId | '__none__') ──
// Ưu tiên customerId còn sống; công trình cũ chưa gắn id thì dò theo tên Chủ đầu tư.
function _ctClientOf(p) {
  const c = (p.customerId && typeof getCustomerById === 'function') ? getCustomerById(p.customerId)
          : (p.chuDauTu && typeof findCustomerByName === 'function' ? findCustomerByName(p.chuDauTu) : null);
  return c ? { key: c.id, name: c.name } : { key: '__none__', name: '' };
}

// ── Phân khu theo loại: CT (mới) · SC (sửa chữa) · còn lại (SN + khác) ──
const _CT_SECTIONS = [
  { key: 'CT',    title: 'Công Trình Mới',              icon: 'domain',        hint: 'Loại CT' },
  { key: 'SC',    title: 'Công Trình Sửa Chữa',         icon: 'construction',  hint: 'Loại SC' },
  { key: 'OTHER', title: 'Công Trình Sửa Nhỏ, Khác',    icon: 'handyman',      hint: 'Loại SN và các loại khác' },
];

// ── 1 thẻ công trình (dùng chung cho mọi chế độ xem) ──
// it = { p, c, tongChi, days, noCost }
// (04/10/2026) Bố cục 5 thông tin: [1] TÊN ĐẦY ĐỦ (không cắt mã CT/SC/SN ở đầu — trước đây
// _ctCategoryInfo().display bỏ mất mã và hiện badge riêng) · [2] ĐỊA CHỈ công trình (p.note) ngay
// dưới tên · [3] CHI PHÍ (góc phải, như cũ) · [4] TRẠNG THÁI (badge như cũ) · [5] SỐ NGÀY thi công.
// Đã bỏ dòng "N hóa đơn" cho gọn.
function _ctCardHtml(it) {
  const { p, c, tongChi, days, noCost } = it;
  const dim   = p.status === 'closed' ? 'opacity:.72;' : '';
  const cross = _ctCrossYearBadge(p, (c && c.invs) || []);
  // Số ngày thi công: thẻ "chưa phát sinh" chưa tính sẵn → tính theo ngày bắt đầu / kết thúc
  const d = days > 0 ? days : (noCost ? _ptDurationDays(p, []) : 0);
  const dayLine = d > 0
    ? `<span class="material-symbols-outlined" style="font-size:13px;vertical-align:-2px">schedule</span> ${d} ngày thi công`
    : '<span class="ghost">Chưa có ngày thi công</span>';
  const addr = (p.note || '').trim();
  // [FIX] Hiển thị TỔNG CHI thực tế (gồm ứng thầu phụ / NCC) thay vì chỉ tổng hóa đơn
  const total = noCost ? '<span class="text-secondary">—</span>' : fmtS(tongChi);
  return `<div class="ct-card card shadow-sm overflow-hidden" onclick="openCTDetail('${p.id}')" style="cursor:pointer;${dim}">
    <div class="ct-card-head" style="align-items:flex-start">
      <div style="flex:1;min-width:0">
        <div class="ct-card-name">${x(p.name)}${cross ? ` <span style="vertical-align:middle">${cross}</span>` : ''}</div>
        <div class="ct-card-addr" title="${x(addr || 'Chưa có địa chỉ công trình')}">
          <span class="material-symbols-outlined" style="font-size:13px;vertical-align:-2px">location_on</span>${addr ? x(addr) : '<span class="ghost">Chưa có địa chỉ</span>'}
        </div>
        <div style="margin:5px 0 3px">${_ptStatusBadge(p.status)}</div>
        <div class="ct-card-count">${dayLine}</div>
      </div>
      <div class="ct-card-total" style="margin-left:8px">${total}</div>
    </div>
  </div>`;
}

// ── Lưới thẻ ──
function _ctCardsGrid(items, lead) {
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">
    ${lead || ''}${items.map(_ctCardHtml).join('')}
  </div>`;
}

// ── Đổi chế độ xem (Theo loại / Theo khách hàng) — nhớ lựa chọn trên máy ──
function _ctSetView(v) {
  _ctView = v === 'client' ? 'client' : 'type';
  try { localStorage.setItem('ct_view_mode', _ctView); } catch (e) {}
  const bT = document.getElementById('ct-view-type'), bC = document.getElementById('ct-view-client');
  if (bT) bT.className = 'btn ' + (_ctView === 'type' ? 'btn-primary' : 'btn-outline-primary');
  if (bC) bC.className = 'btn ' + (_ctView === 'client' ? 'btn-primary' : 'btn-outline-primary');
  _ctRenderGrid();
}

// ── Mở / thu gọn 1 nhóm khách hàng; key '*' = mở tất cả, '-' = thu gọn tất cả ──
function _ctToggleClient(key) {
  if (key === '*') {
    document.querySelectorAll('[data-ct-client]').forEach(el => _ctOpenClients.add(el.dataset.ctClient));
  } else if (key === '-') {
    _ctOpenClients.clear();
  } else if (_ctOpenClients.has(key)) {
    _ctOpenClients.delete(key);
  } else {
    _ctOpenClients.add(key);
  }
  _ctRenderGrid();
}

// ── Vẽ phần thân theo chế độ xem ──
function _ctRenderBody(gridWrap, items, companyCard) {
  // ══ CHẾ ĐỘ 1: 3 PHÂN KHU THEO LOẠI ══
  if (_ctView !== 'client') {
    const sections = _CT_SECTIONS.map(sec => {
      const list = items.filter(it => _projTypeByName(it.p.name) === sec.key);
      if (!list.length) return '';
      const sum = list.reduce((s, it) => s + (it.noCost ? 0 : (it.tongChi || 0)), 0);
      return `<div class="ct-section mb-4">
        <div class="ct-section-head">
          <span class="material-symbols-outlined">${sec.icon}</span>
          <span class="ct-section-title">${sec.title}</span>
          <span class="badge rounded-pill bg-body-secondary text-body">${list.length}</span>
          <span class="text-secondary ms-auto" style="font-size:12px">${sec.hint} · Tổng chi <b class="font-monospace">${fmtS(sum)}</b></span>
        </div>
        ${_ctCardsGrid(list)}
      </div>`;
    }).join('');
    // (05/10/2026) Thẻ CÔNG TY (chi phí chung) xuống CUỐI — công trình thực tế ưu tiên lên trên
    gridWrap.innerHTML = sections + _ctCompanyBlock(companyCard);
    return;
  }

  // ══ CHẾ ĐỘ 2: GỘP THEO KHÁCH HÀNG (accordion) ══
  const groups = new Map();
  items.forEach(it => {
    const cl = _ctClientOf(it.p);
    if (!groups.has(cl.key)) groups.set(cl.key, { key: cl.key, name: cl.name, items: [] });
    groups.get(cl.key).items.push(it);
  });
  // (05/10/2026) Thêm cả khách hàng CHƯA có công trình trong danh sách đang xem (vd vừa tạo hàng loạt)
  // → có dòng để bấm "+" gán nhanh công trình cũ. Chỉ khi không lọc trạng thái / loại / lãi-lỗ;
  // đang tìm kiếm thì chỉ thêm khách khớp tên.
  if (!_ctFStatus && !_ctFType && !_ctFLaiLo && typeof getAllCustomers === 'function') {
    const q = (_ctSearch || '').toLowerCase().trim();
    getAllCustomers().forEach(c => {
      if (groups.has(c.id)) return;
      if (q && !(c.name || '').toLowerCase().includes(q)) return;
      groups.set(c.id, { key: c.id, name: c.name, items: [] });
    });
  }
  // Thứ tự: khách CÓ công trình (A→Z) → khách chưa có công trình (A→Z) → "(Chưa gán khách hàng)"
  const _rank = g => g.key === '__none__' ? 2 : (g.items.length ? 0 : 1);
  const list = [...groups.values()].sort((a, b) => _rank(a) - _rank(b) || a.name.localeCompare(b.name, 'vi'));

  const rows = list.map(g => {
    const open = _ctOpenClients.has(g.key);
    const sum  = g.items.reduce((s, it) => s + (it.noCost ? 0 : (it.tongChi || 0)), 0);
    // Đếm theo loại: CT 1 · SC 0 · SN/Khác 2
    const cnt = { CT: 0, SC: 0, OTHER: 0 };
    g.items.forEach(it => { cnt[_projTypeByName(it.p.name)]++; });
    const typeTags = [['CT', 'CT'], ['SC', 'SC'], ['OTHER', 'SN/Khác']]
      .filter(([k]) => cnt[k]).map(([k, lb]) => `<span class="badge bg-secondary-subtle text-secondary-emphasis" style="font-size:10px">${lb} ${cnt[k]}</span>`).join(' ');
    const none  = g.key === '__none__';
    const empty = !g.items.length;
    // Nút "Gán nhanh công trình" ngay cạnh tên khách (không có ở nhóm "Chưa gán")
    const assignBtn = none ? '' : `<button type="button" class="btn btn-outline-success btn-sm ct-assign-btn" onclick="event.stopPropagation();openCTQuickAssign('${x(g.key)}')" title="Gán nhanh công trình có sẵn cho ${x(g.name)}"><span class="material-symbols-outlined">add_link</span></button>`;
    return `<div class="ct-client ${open ? 'is-open' : ''} ${empty ? 'is-empty' : ''}" data-ct-client="${x(g.key)}">
      <div class="ct-client-head" onclick="${empty ? `openCTQuickAssign('${x(g.key)}')` : '_ctToggleClient(this.parentElement.dataset.ctClient)'}" title="${empty ? 'Chưa có công trình — bấm để gán' : `Bấm để ${open ? 'thu gọn' : 'xem các công trình'}`}">
        <span class="ct-client-toggle">${empty ? '·' : (open ? '−' : '+')}</span>
        <span class="material-symbols-outlined text-secondary" style="font-size:20px">${none ? 'help' : 'person'}</span>
        <span class="ct-client-name ${none ? 'text-secondary fst-italic' : ''}">${none ? '(Chưa gán khách hàng)' : x(g.name)}</span>
        ${assignBtn}
        <span class="badge rounded-pill ${empty ? 'bg-body-secondary text-secondary' : 'bg-primary-subtle text-primary-emphasis'}">${empty ? 'Chưa có công trình' : g.items.length + ' công trình'}</span>
        <span class="d-none d-md-inline">${typeTags}</span>
        <span class="ms-auto text-secondary" style="font-size:12px;white-space:nowrap">Tổng chi <b class="font-monospace" style="color:var(--bs-body-color)">${fmtS(sum)}</b></span>
        ${none ? '' : `<button class="btn btn-outline-secondary btn-sm" onclick="event.stopPropagation();openKhachHangProfile('${x(g.key)}')" title="Xem hồ sơ khách hàng"><span class="material-symbols-outlined msi-gap">contacts</span>Hồ sơ</button>`}
      </div>
      ${open ? `<div class="ct-client-body">${_ctCardsGrid(g.items)}</div>` : ''}
    </div>`;
  }).join('');

  gridWrap.innerHTML = `
    <div class="d-flex align-items-center gap-2 mb-2" style="font-size:12px">
      <span class="text-secondary">${list.length} khách hàng</span>
      <button class="btn btn-link btn-sm p-0 ms-auto text-decoration-none" onclick="_ctToggleClient('*')">Mở tất cả</button>
      <span class="text-secondary">·</span>
      <button class="btn btn-link btn-sm p-0 text-decoration-none" onclick="_ctToggleClient('-')">Thu gọn tất cả</button>
    </div>
    <div class="ct-client-list">${rows}</div>
    ${_ctCompanyBlock(companyCard)}`;
}

// ── Khối thẻ CÔNG TY (chi phí chung) — luôn đặt CUỐI danh sách (05/10/2026) ──
function _ctCompanyBlock(companyCard) {
  if (!companyCard) return '';
  return `<div class="ct-section mt-2">
    <div class="ct-section-head">
      <span class="material-symbols-outlined">apartment</span>
      <span class="ct-section-title">Chi Phí Chung Công Ty</span>
    </div>
    ${_ctCardsGrid([], companyCard)}
  </div>`;
}

// ══════════════════════════════════════════════════════════════════
//  GÁN NHANH CÔNG TRÌNH CŨ CHO KHÁCH HÀNG (05/10/2026)
// ══════════════════════════════════════════════════════════════════
// Bấm nút "+" (add_link) cạnh tên khách ở chế độ "Theo khách hàng" → popup liệt kê công trình
// (MỌI năm, không phụ thuộc bộ lọc năm): ưu tiên nhóm "Chưa gán khách hàng"; bật công tắc để xem
// cả công trình đang thuộc khách khác (chuyển sang khách này). Tick 1 hoặc nhiều → "Gán".
// Lưu: updateProject(id, { customerId, chuDauTu }) — chỉ ghi doc meta_cong_trinh (1 lượt đẩy
// cloud cho cả lô) + IndexedDB qua save(); chuDauTu đồng bộ sang HĐ chính (_syncChuDauTuToHopDong).
let _ctQaCust   = '';     // id khách đang gán
let _ctQaShowAll = false;  // hiện cả công trình đã có khách khác
let _ctQaSearch = '';

function openCTQuickAssign(custId) {
  const c = (typeof getCustomerById === 'function') ? getCustomerById(custId) : null;
  if (!c) { toast('Không tìm thấy khách hàng', 'error'); return; }
  _ctQaCust = custId; _ctQaShowAll = false; _ctQaSearch = '';
  document.getElementById('modal-title').innerHTML = `<span class="material-symbols-outlined msi-gap">add_link</span>Gán công trình cho: ${x(c.name)}`;
  document.getElementById('modal-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      <div class="text-secondary" style="font-size:12px">Chọn công trình có sẵn (mọi năm) để gắn vào khách hàng này — tick được nhiều công trình cùng lúc.</div>
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <input id="ct-qa-search" type="search" class="form-control form-control-sm" style="max-width:280px" placeholder="🔍 Tìm công trình, địa chỉ..." oninput="_ctQaSearch=this.value;_ctQaRenderList()">
        <div class="form-check form-switch mb-0 ms-auto">
          <input class="form-check-input" type="checkbox" role="switch" id="ct-qa-all" onchange="_ctQaShowAll=this.checked;_ctQaRenderList()">
          <label class="form-check-label" for="ct-qa-all" style="font-size:12px">Hiện cả công trình đã có khách khác</label>
        </div>
      </div>
      <div id="ct-qa-list" style="max-height:52vh;overflow-y:auto;border:1px solid var(--bs-border-color);border-radius:8px"></div>
      <div class="d-flex align-items-center gap-2">
        <span id="ct-qa-count" class="text-secondary" style="font-size:12px"></span>
        <button class="btn btn-outline-secondary btn-sm ms-auto" onclick="closeModal()">Hủy</button>
        <button id="ct-qa-ok" class="btn btn-success btn-sm fw-bold" onclick="_ctQaConfirm()" disabled><span class="material-symbols-outlined msi-gap">link</span>Gán</button>
      </div>
    </div>`;
  _ctQaRenderList();
  document.getElementById('ct-modal').classList.add('open');
  setTimeout(() => document.getElementById('ct-qa-search')?.focus(), 80);
}

function _ctQaRenderList() {
  const box = document.getElementById('ct-qa-list');
  if (!box) return;
  const keep = new Set([...box.querySelectorAll('.ct-qa-chk:checked')].map(e => e.value));   // giữ tick khi lọc
  const q = (_ctQaSearch || '').toLowerCase().trim();
  const rows = projects.filter(_isValidProject).filter(p => p.id !== 'COMPANY')
    .map(p => ({ p, cl: _ctClientOf(p) }))
    .filter(({ cl }) => cl.key !== _ctQaCust)                                   // đã thuộc khách này → bỏ
    .filter(({ cl }) => _ctQaShowAll || cl.key === '__none__')
    .filter(({ p, cl }) => !q || (p.name || '').toLowerCase().includes(q) || (p.note || '').toLowerCase().includes(q) || (cl.name || '').toLowerCase().includes(q))
    // Chưa gán lên đầu, rồi ngày bắt đầu mới → cũ
    .sort((a, b) => (a.cl.key !== '__none__') - (b.cl.key !== '__none__') || (b.p.startDate || '').localeCompare(a.p.startDate || ''));
  if (!rows.length) {
    box.innerHTML = `<div class="text-secondary text-center p-4" style="font-size:13px">${q ? 'Không có công trình nào khớp tìm kiếm.' : (_ctQaShowAll ? 'Không còn công trình nào để gán.' : 'Không còn công trình nào "Chưa gán khách hàng". Bật công tắc để xem công trình đang thuộc khách khác.')}</div>`;
  } else {
    box.innerHTML = rows.map(({ p, cl }) => {
      const yr = (p.startDate || '').slice(0, 4);
      const tag = cl.key === '__none__'
        ? `<span class="badge bg-warning-subtle text-warning-emphasis" style="font-size:10px">Chưa gán${p.chuDauTu ? ' · CĐT cũ: ' + x(p.chuDauTu) : ''}</span>`
        : `<span class="badge bg-secondary-subtle text-secondary-emphasis" style="font-size:10px">Đang thuộc: ${x(cl.name)}</span>`;
      return `<label class="ct-qa-row">
        <input type="checkbox" class="form-check-input ct-qa-chk" value="${x(p.id)}" ${keep.has(p.id) ? 'checked' : ''} onchange="_ctQaUpdateCount()">
        <span style="flex:1;min-width:0">
          <span class="fw-semibold">${x(p.name)}</span>
          <span class="d-block text-secondary" style="font-size:11.5px">${yr ? 'Năm ' + yr + ' · ' : ''}${typeof _ptStatusBadge === 'function' ? _ptStatusBadge(p.status) : ''} ${p.note ? '· ' + x(p.note) : ''}</span>
        </span>
        ${tag}
      </label>`;
    }).join('');
  }
  _ctQaUpdateCount();
}

function _ctQaUpdateCount() {
  const n = document.querySelectorAll('#ct-qa-list .ct-qa-chk:checked').length;
  const cnt = document.getElementById('ct-qa-count');
  if (cnt) cnt.textContent = n ? `Đã chọn ${n} công trình` : 'Chưa chọn công trình nào';
  const ok = document.getElementById('ct-qa-ok');
  if (ok) ok.disabled = !n;
}

function _ctQaConfirm() {
  const c = getCustomerById(_ctQaCust);
  if (!c) return;
  const ids = [...document.querySelectorAll('#ct-qa-list .ct-qa-chk:checked')].map(e => e.value);
  if (!ids.length) return;
  const moving = ids.map(id => getProjectById(id)).filter(p => p && _ctClientOf(p).key !== '__none__');
  if (moving.length && !confirm(`${moving.length} công trình đang thuộc khách khác sẽ CHUYỂN sang "${c.name}":\n• ` +
      moving.map(p => p.name).join('\n• ') + '\n\nTiếp tục?')) return;
  let ok = 0;
  ids.forEach(id => {
    try { if (updateProject(id, { customerId: c.id, chuDauTu: c.name })) ok++; }
    catch (e) { console.warn('[QuickAssign] lỗi', id, e); }
  });
  closeModal();
  _ctOpenClients.add(c.id);          // mở sẵn nhóm khách vừa gán
  renderProjectsPage();
  // Công trình không có chi phí trong năm đang xem thì không hiện trong danh sách → nhắc
  const hidden = ids.filter(id => !document.querySelector(`[data-ct-client="${CSS.escape(c.id)}"] .ct-card[onclick*="'${id}'"]`)).length;
  toast(`✅ Đã gán ${ok} công trình cho ${c.name}` + (hidden ? ` · ${hidden} công trình không có chi phí trong năm đang xem (chọn "Tất cả năm" để thấy)` : ''), 'success');
}

// ── Tìm kiếm: khớp tên công trình HOẶC tên khách hàng ──
function _ctMatchSearch(p, q) {
  if (!q) return true;
  if ((p.name || '').toLowerCase().includes(q)) return true;
  const cl = _ctClientOf(p);
  return !!(cl.name && cl.name.toLowerCase().includes(q));
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
    if (q)       noCostList = noCostList.filter(p => _ctMatchSearch(p, q));
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
    // Thẻ "Chưa phát sinh" (total=0, count=0), chia nhóm theo chế độ xem như bình thường
    _ctRenderBody(gridWrap, noCostList.map(p => ({ p, c: { count: 0, invs: [] }, tongChi: 0, days: 0, noCost: true })), '');
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

  // Sắp xếp trong mỗi nhóm: trạng thái (chuẩn bị → thi công → hoàn thành → quyết toán) rồi tên
  withData.sort((a, b) => {
    const statusOrder = { planning: 1, active: 2, completed: 3, closed: 4 };
    const s1 = statusOrder[a.p.status] || 99;
    const s2 = statusOrder[b.p.status] || 99;
    if (s1 !== s2) return s1 - s2;
    return (a.p.name || '').localeCompare(b.p.name || '', 'vi');
  });

  // Apply filters
  if (q)           withData = withData.filter(({ p }) => _ctMatchSearch(p, q));
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

  // COMPANY card — luôn đứng đầu (ngoài các phân khu), không có nút xóa/sửa
  const companyCosts = _ctGetCostsFromMap(PROJECT_COMPANY, invMap);
  const companyCard = `<div class="ct-card card shadow-sm overflow-hidden" onclick="openCTDetail('COMPANY')" style="cursor:pointer;border:2px solid var(--bs-border-color)">
    <div class="ct-card-head" style="align-items:flex-start">
      <div style="flex:1;min-width:0">
        <div class="ct-card-name" style="margin-bottom:5px"><span class="material-symbols-outlined msi-gap">apartment</span>${x(PROJECT_COMPANY.name)}</div>
        <div style="margin-bottom:4px"><span class="text-primary fw-bold" style="font-size:10px;padding:2px 9px;border-radius:10px;background:rgba(var(--bs-primary-rgb),.1);white-space:nowrap">Chi phí chung</span></div>
      </div>
      <div class="ct-card-total" style="margin-left:8px">${fmtS(companyCosts.total)}</div>
    </div>
  </div>`;

  _ctRenderBody(gridWrap, withData, companyCard);
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
  // Group theo tên loại chi phí resolve từ id (recCatName) — đổi tên trong Danh Mục lan tức thì tới đây
  c.invs.forEach(inv => { const _l = recCatName(inv,'inv','loai') || inv.loai; (byLoai[_l] = byLoai[_l] || []).push(inv); });
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
  //   Doanh thu = tổng đã thu thực tế (cash-basis)
  //   Lợi nhuận = Doanh thu − Chi phí  → khớp tuyệt đối với tab Doanh Thu → Lợi Nhuận
  // Số liệu cốt lõi lấy từ ctTaiChinh() — DÙNG CHUNG với tab QUYẾT TOÁN (cùng công thức, cùng số)
  const _fin = ctTaiChinh(p);
  const _A = c.total;            // (A) hóa đơn/vật tư của CT
  const _B = tongHDTP;           // (B) tổng giá trị HĐ thầu phụ
  const _C = _chiPhiChungFixed;  // (C) chi phí chung CÔNG TY phân bổ cho CT
  const _X = tongGiaTriHD;       // (X) HĐ chính (giaTri + giaTriphu + phatSinh)
  const _Y = _fin.Y;             // (Y) quyết toán đã quy đổi delta trong năm đang lọc

  // Doanh thu = tổng đã thu; giá trị HĐ sau QT (_fin.giaTriHD) chỉ làm mẫu số % / còn phải thu
  const doanhThu    = _fin.doanhThu;
  const giaTriHD    = _fin.giaTriHD;
  const chiPhiTong  = _fin.chiPhiTong;          // tổng chi phí (dự toán/ước tính)
  const loiNhuan    = _fin.loiNhuan;            // lãi (≥0) / lỗ (<0)
  const conPhaiThuCT = giaTriHD - tongThu;      // còn phải thu từ chủ đầu tư
  const pctThu = giaTriHD   > 0 ? Math.round(tongThu / giaTriHD * 100) : 0;          // % đã thu
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
  const _custObj = (p.customerId && typeof getCustomerById === 'function') ? getCustomerById(p.customerId) : null;
  const _custName = _custObj ? _custObj.name : (p.chuDauTu || '');
  html += `
  <div class="text-secondary" style="display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;margin-bottom:12px">
    ${_sdTxt ? `<span><span class="material-symbols-outlined msi-gap">calendar_month</span>Khởi công: <strong style="color:var(--bs-body-color)">${_sdTxt}</strong></span>` : ''}
    ${_durLabel ? `<span><span class="material-symbols-outlined msi-gap">timer</span>Đã thực hiện: <strong style="color:${_mCross.cross ? '#d9480f' : 'var(--bs-body-color)'}">${_durLabel}${_mCross.cross ? ' (qua 2 năm)' : ''}</strong></span>` : ''}
    ${p.endDate ? `<span><span class="material-symbols-outlined msi-gap">check_circle</span>Hoàn thành: <strong style="color:var(--bs-body-color)">${_fmtProjDate(p.endDate)}</strong></span>` : ''}
    ${p.closedDate ? `<span><span class="material-symbols-outlined msi-gap">bar_chart</span>Quyết toán: <strong style="color:var(--bs-body-color)">${_fmtProjDate(p.closedDate)}</strong></span>` : ''}
    ${_custName ? `<span><span class="material-symbols-outlined msi-gap">person</span>CĐT: ${_custObj
        ? `<a href="#" class="fw-bold text-decoration-none" onclick="event.preventDefault();openKhachHangProfile('${_custObj.id}')" title="Xem hồ sơ khách hàng">${x(_custName)}</a>`
        : `<strong style="color:var(--bs-body-color)">${x(_custName)}</strong>`}</span>` : ''}
    ${p.note ? `<span title="Địa chỉ công trình"><span class="material-symbols-outlined msi-gap">location_on</span>${x(p.note)}</span>` : ''}
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

  // Cột 1 — DOANH THU: số CHÍNH là Doanh Thu (= tổng đã thu),
  // dòng phụ kèm "đã thu" (dòng tiền thực đã vào) + còn phải thu.
  const _colRevenue = `
    <div style="${_bxG}">
      ${_lb('<span class="material-symbols-outlined msi-gap">payments</span>Doanh Thu')}
      ${_vl(doanhThu ? fmtS(doanhThu) : '—', CG)}
      <div class="text-secondary" style="font-size:11px;font-weight:600;margin-top:2px">Đã thu: <span style="color:var(--bs-body-color)">${fmtS(tongThu)}</span>${soDotThu ? ` · ${soDotThu} đợt` : ''}</div>
      ${giaTriHD > 0 ? _ctdProgress(pctThu, { color: CG }) : ''}
      <div class="text-secondary" style="font-size:11.5px;margin-top:6px">
        Còn phải thu: <strong style="font-family:'IBM Plex Mono',monospace;color:${conPhaiThuCT > 0 ? CR : CG}">${conPhaiThuCT > 0 ? fmtS(conPhaiThuCT) : (conPhaiThuCT < 0 ? 'Thu dư ' + fmtS(-conPhaiThuCT) : '0')}</strong>
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

  // Cột 3 — HIỆU QUẢ (LÃI / LỖ) — (04/10/2026) ĐỒNG BỘ với tab LỢI NHUẬN qua lnHieuQuaCT():
  //   • CT có năm chiếm ≥ 80% hóa đơn → lợi nhuận hạch toán vào năm đó (= số toàn vòng đời)
  //   • Không năm nào đạt 80%        → lợi nhuận toàn thời gian
  //   Lợi nhuận = Tổng đã thu − (Hóa đơn + Thầu phụ + CP chung) theo dòng tiền thực (cash-basis).
  //   KHÔNG phụ thuộc năm đang lọc → mở popup ở năm nào cũng ra cùng 1 số, khớp tab Lợi Nhuận.
  // Kèm: Tỷ suất lợi nhuận = Lợi nhuận / Tổng đã thu × 100 (chưa có doanh thu → "—") + huy hiệu đánh giá.
  // Fallback (tab Lợi Nhuận chưa nạp): lãi/lỗ dòng tiền theo năm đang lọc như trước.
  const _hq = (typeof lnHieuQuaCT === 'function') ? lnHieuQuaCT(p) : null;
  const _hqNum    = _hq ? _hq.ln : (tongThu - (tongChiCongTrinh + _chiPhiChungFixed));
  const _hqDt     = _hq ? _hq.dt : tongThu;
  const _hqMargin = _hq ? _hq.margin : (_hqDt > 0 ? _hqNum / _hqDt * 100 : null);   // chia cho 0 → null
  const _hqPos   = _hqNum >= 0;
  const _hqColor = _hqPos ? CG : CR;
  const _hqBg    = _hqPos ? BG : BR;
  // Huy hiệu: Tốt (> 15%) · Thấp (0–15%) · Báo Động Lỗ (< 0) · Chưa có doanh thu
  const _hqBadge = (typeof lnMarginBadge === 'function') ? lnMarginBadge(_hqNum, _hqMargin)
    : (_hqNum < 0 ? '<span class="badge bg-danger">Báo Động Lỗ</span>' : '');
  // Tỷ suất: 1 chữ số thập phân, giữ dấu âm khi lỗ
  const _hqMarginTxt = _hqMargin === null ? '—'
    : _hqMargin.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  // Dòng giải thích cách hạch toán (rê chuột xem tỷ trọng hóa đơn từng năm)
  const _hqEy = _hq && _hq.ey;
  const _hqEyTip = (_hqEy && typeof _lnEyBreakdown === 'function') ? _lnEyBreakdown(_hqEy) : '';
  const _hqBasis = !_hq ? `Dòng tiền theo ${x(yearLabel.toLowerCase())}`
    : _hqEy.year ? `Hạch toán năm <b>${_hqEy.year}</b> (${Math.round(_hqEy.share * 100)}% hóa đơn)`
    : (_hqEy.total ? 'Toàn thời gian (chi phí trải nhiều năm)' : 'Toàn thời gian');
  const _colProfit = `
    <div style="border:1.5px solid ${_hqColor};border-radius:8px;padding:11px 14px;background:${_hqBg}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">
        ${_lb((_hqPos ? '<span class="material-symbols-outlined msi-gap">trending_up</span>' : '<span class="material-symbols-outlined msi-gap">trending_down</span>') + 'Hiệu Quả (Lãi / Lỗ)')}
        <span style="flex-shrink:0">${_hqBadge}</span>
      </div>
      <div style="font-size:24px;font-weight:800;font-family:'IBM Plex Mono',monospace;color:${_hqColor};line-height:1.2">${_hqPos ? '' : '−'}${fmtS(Math.abs(_hqNum))}</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-top:6px;font-size:12px">
        <span class="text-secondary">Tỷ suất lợi nhuận</span>
        <strong style="font-family:'IBM Plex Mono',monospace;color:${_hqMargin === null ? 'var(--bs-secondary-color)' : _hqColor}"
          title="Lợi nhuận / Tổng đã thu × 100">${_hqMarginTxt}</strong>
      </div>
      ${_hq ? `<div class="text-secondary" style="display:flex;justify-content:space-between;gap:8px;font-size:11px;margin-top:2px">
        <span>Đã thu ${fmtS(_hq.dt)}</span><span>Chi ${fmtS(_hq.chi)}</span>
      </div>` : ''}
      <div class="text-secondary" style="font-size:11px;margin-top:6px;padding-top:6px;border-top:1px dashed var(--bs-border-color)"
        ${_hqEyTip ? `title="Tỷ trọng hóa đơn: ${x(_hqEyTip)}"` : ''}>
        <span class="material-symbols-outlined msi-gap" style="font-size:13px;vertical-align:-2px">event</span>${_hqBasis}
      </div>
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
  const _LOAI_THU = { tamung: ['Tạm ứng', '#fd7e14'], giaidoan: ['Giai đoạn', '#0dcaf0'], quyettoan: ['Quyết toán', '#198754'], khac: ['Khác', '#6c757d'] };
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
// (04/10/2026) CHUẨN HÓA để gộp nhóm theo khách hàng chính xác:
//   • Chủ Đầu Tư BẮT BUỘC, chỉ chọn từ dropdown (không gõ tên tự do). Thiếu → không cho lưu.
//   • Nút [+ Thêm nhanh] cạnh dropdown → khung tạo khách mới (Tên · SĐT theo quyền · Địa chỉ)
//     → tạo xong tự chọn luôn khách vừa tạo.
//   • Chọn khách → tự điền "Địa chỉ công trình" từ địa chỉ khách (nếu ô đang trống / đang là
//     địa chỉ tự điền trước đó — không đè địa chỉ người dùng đã gõ tay).
//   • Tự gợi ý Tên công trình = "<Loại> <Tên khách> (<Hạng mục>)" (05/10/2026: cả form Sửa; loại lấy từ tiền tố tên)
//     VD "SN Cô Sáu - Ốp gạch sân vườn - T10/26". KHÔNG dùng ngoặc "[SN]": loại công trình của app
//     được nhận theo CHỮ ĐẦU TÊN (_projTypeByName "CT…/SC…", badge _ctCategoryInfo) — có "[" ở đầu
//     thì công trình bị xếp sai loại và badge hiện "[S".
//   • Nhãn "Ghi chú" → "Địa chỉ công trình" (vẫn lưu vào field `note` như cũ).

// ══ LOẠI CÔNG TRÌNH — TỰ NHẬN DIỆN TỪ TÊN (05/10/2026) ═══════════════
// Đã BỎ dropdown "Loại công trình" ở 2 form Thêm/Sửa. Loại được tự đọc từ TIỀN TỐ của tên:
//   "SN Cô Sáu (Ốp gạch)"   → 'SN'        "[SN] Cô Sáu (Ốp gạch)" → 'SN'
//   "CT Nhà anh Tài"        → 'CT'        "SC 213 Quang Trung"    → 'SC'
//   "Nhà anh Tài" (không mã)→ 'Khác'
// Tiền tố phải đứng riêng: "CTY ABC", "Scan…" KHÔNG tính là CT/SC (chữ cái liền sau mã → bỏ qua).
const CT_LOAI_RE = /^\s*\[?\s*(CT|SC|SN)\s*\]?(?![a-zà-ỹ])/i;

// Trả về 'CT' | 'SC' | 'SN' | 'Khác'
function ctDetectLoai(name) {
  const m = String(name || '').match(CT_LOAI_RE);
  return m ? m[1].toUpperCase() : 'Khác';
}

// Loại của 1 công trình đã lưu: ưu tiên field loaiCongTrinh, CT cũ chưa có → đọc từ tên
function ctLoaiOf(p) {
  return (p && p.loaiCongTrinh) || ctDetectLoai(p && p.name);
}

// Chuẩn hóa tiền tố trước khi lưu: "[SN] Cô Sáu" → "SN Cô Sáu"
// Lý do: app xếp phân khu / badge theo CHỮ ĐẦU tên (_projTypeByName, _ctCategoryInfo) —
// để "[" ở đầu thì công trình bị xếp sai loại và badge hiện "[S".
function _ctNormalizeNamePrefix(name) {
  return String(name || '').trim().replace(/^\[\s*(CT|SC|SN)\s*\]\s*/i, (_, code) => code.toUpperCase() + ' ');
}

// Bỏ tiền tố loại khỏi tên (để so sánh 2 tên mà không tính phần mã)
function _ctStripPrefix(name) {
  return String(name || '').trim().replace(CT_LOAI_RE, '').replace(/^[\s\-–:.]+/, '').trim();
}

// Trạng thái tự điền của từng form ('new' | 'edit')
//   name: true = ô Tên đang do app tự điền theo Chủ đầu tư + Hạng mục
//   note: địa chỉ app đã tự điền (để biết người dùng đã sửa hay chưa)
const _ctFormAuto = { new: { name: true, note: '' }, edit: { name: false, note: '' } };

/**
 * Render khối chọn khách hàng (dropdown bắt buộc + nút Thêm nhanh).
 * @param {string} prefix      'new' (tạo) hoặc 'edit' (sửa) — để tạo id duy nhất
 * @param {string|null} selectedId  customerId đang gán cho công trình (nếu có)
 * @param {string} inpStyle    style ô input dùng chung của modal
 * @param {string} lblStyle    style nhãn dùng chung của modal
 * @returns {string} HTML
 */
function _renderCustomerSelect(prefix, selectedId, inpStyle, lblStyle) {
  const opts = (typeof getCustomerOptions === 'function') ? getCustomerOptions(selectedId) : '<option value="">— Chọn khách hàng —</option>';
  const selStyle = `${inpStyle};background:var(--bs-body-bg);color:var(--bs-body-color)`;
  return `
    <div>
      <label style="${lblStyle}">Chủ Đầu Tư *</label>
      <div style="display:flex;gap:6px">
        <select id="ct-${prefix}-customer" style="${selStyle};flex:1;min-width:0" onchange="_onCustPickerChange('${prefix}')">
          ${opts}
        </select>
        <button type="button" class="btn btn-outline-success btn-sm" style="white-space:nowrap" onclick="_ctToggleQuickCust('${prefix}')" title="Tạo nhanh khách hàng mới">+ Thêm nhanh</button>
      </div>
    </div>`;
}

/**
 * Khung "Thêm nhanh khách hàng" (ẩn mặc định, full-width) — hiện khi bấm [+ Thêm nhanh].
 */
function _renderNewCustPane(prefix, inpStyle, lblStyle) {
  const canPhone = (typeof khCanSeePhone === 'function') ? khCanSeePhone() : true;
  return `
    <div id="ct-${prefix}-newcust" style="display:none;flex-direction:column;gap:8px;border:1.5px dashed var(--bs-success);border-radius:8px;padding:10px;background:var(--bs-success-bg-subtle)">
      <div class="fw-bold" style="font-size:12px"><span class="material-symbols-outlined msi-gap">person_add</span>Thêm nhanh khách hàng</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div>
          <label style="${lblStyle}">Tên Khách Hàng *</label>
          <input id="ct-${prefix}-cust-name" type="text" placeholder="Tên cá nhân / công ty..." autocomplete="off" style="${inpStyle}">
        </div>
        <div>
          <label style="${lblStyle}">Điện Thoại</label>
          ${canPhone
            ? `<input id="ct-${prefix}-cust-phone" type="text" placeholder="SĐT..." autocomplete="off" inputmode="tel" style="${inpStyle}">`
            : `<input id="ct-${prefix}-cust-phone" type="text" disabled placeholder="Chỉ admin được nhập" style="${inpStyle};background:var(--bs-tertiary-bg)">`}
        </div>
      </div>
      <div>
        <label style="${lblStyle}">Địa Chỉ</label>
        <input id="ct-${prefix}-cust-address" type="text" placeholder="Địa chỉ khách hàng (tự điền vào Địa chỉ công trình)..." autocomplete="off" style="${inpStyle}">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="button" class="btn btn-outline-secondary btn-sm" onclick="_ctToggleQuickCust('${prefix}', false)">Hủy</button>
        <button type="button" class="btn btn-success btn-sm fw-bold" onclick="_ctQuickAddCust('${prefix}')"><span class="material-symbols-outlined msi-gap">check</span>Tạo & chọn</button>
      </div>
    </div>`;
}

// Bật/tắt khung Thêm nhanh khách hàng
function _ctToggleQuickCust(prefix, show) {
  const pane = document.getElementById(`ct-${prefix}-newcust`);
  if (!pane) return;
  const on = (show === undefined) ? pane.style.display === 'none' : !!show;
  pane.style.display = on ? 'flex' : 'none';
  if (on) setTimeout(() => document.getElementById(`ct-${prefix}-cust-name`)?.focus(), 50);
}

// Tạo khách hàng từ khung Thêm nhanh → nạp lại dropdown + chọn luôn khách mới
function _ctQuickAddCust(prefix) {
  const name = (document.getElementById(`ct-${prefix}-cust-name`)?.value || '').trim();
  if (!name) { toast('Vui lòng nhập Tên khách hàng!', 'error'); document.getElementById(`ct-${prefix}-cust-name`)?.focus(); return; }
  const dup = (typeof findCustomerByName === 'function') ? findCustomerByName(name) : null;
  if (dup && !confirm(`Đã có khách hàng "${dup.name}".\n• OK: vẫn tạo khách mới cùng tên\n• Hủy: dùng khách đã có`)) {
    _ctSelectCustomer(prefix, dup.id);
    _ctToggleQuickCust(prefix, false);
    return;
  }
  const data = { name, address: (document.getElementById(`ct-${prefix}-cust-address`)?.value || '').trim() };
  if (typeof khCanSeePhone !== 'function' || khCanSeePhone()) {
    data.phone = (document.getElementById(`ct-${prefix}-cust-phone`)?.value || '').trim();
  }
  const c = createCustomer(data);
  if (typeof schedulePush === 'function') schedulePush();
  _ctSelectCustomer(prefix, c.id);
  _ctToggleQuickCust(prefix, false);
  ['name', 'phone', 'address'].forEach(f => { const el = document.getElementById(`ct-${prefix}-cust-${f}`); if (el) el.value = ''; });
  toast('✅ Đã tạo khách hàng: ' + c.name, 'success');
}

// Nạp lại option dropdown khách hàng + chọn 1 id
function _ctSelectCustomer(prefix, id) {
  const sel = document.getElementById(`ct-${prefix}-customer`);
  if (!sel) return;
  sel.innerHTML = getCustomerOptions(id);
  sel.value = id;
  _onCustPickerChange(prefix);
}

/**
 * Đổi khách hàng → tự điền Địa chỉ công trình + gợi ý lại tên (form tạo).
 * @param {string} prefix 'new' | 'edit'
 */
function _onCustPickerChange(prefix) {
  const id = document.getElementById(`ct-${prefix}-customer`)?.value || '';
  const c  = id && typeof getCustomerById === 'function' ? getCustomerById(id) : null;
  _ctApplyCustAddress(prefix, c);
  _ctAutoName(false, prefix);   // form Sửa chỉ đổi tên khi tên đang khớp gợi ý (_ctFormAuto.edit.name)
}

// ── Tự điền ĐỊA CHỈ CÔNG TRÌNH từ địa chỉ khách hàng — "nhẹ tay" (04/10/2026) ──
//   • Ô trống, hoặc đang là địa chỉ APP tự điền trước đó (người dùng chưa sửa) → điền + nháy viền
//     + dòng nhắc "Đã tự điền từ địa chỉ khách hàng".
//   • Ô đã có địa chỉ NGƯỜI DÙNG gõ/sửa → TUYỆT ĐỐI không đè; chỉ hiện gợi ý nhỏ
//     "Địa chỉ khách: … [Dùng địa chỉ này]" để người dùng tự quyết.
//   • Khách không có địa chỉ: ô đang giữ địa chỉ tự điền của khách CŨ → trả về trống (khỏi nhầm).
function _ctApplyCustAddress(prefix, c) {
  const noteEl = document.getElementById(`ct-${prefix}-note`);
  const hint   = document.getElementById(`ct-${prefix}-note-hint`);
  if (!noteEl) return;
  const st   = _ctFormAuto[prefix];
  const cur  = noteEl.value.trim();
  const addr = c && c.address ? c.address.trim() : '';
  if (!addr) {
    if (cur && cur === st.note) { noteEl.value = ''; st.note = ''; }
    if (hint) hint.innerHTML = '';
    return;
  }
  if (!cur || cur === st.note) {
    noteEl.value = addr;
    st.note = addr;
    _ctFlash(noteEl);
    if (hint) hint.innerHTML = '<span class="text-success"><span class="material-symbols-outlined" style="font-size:13px;vertical-align:-2px">auto_awesome</span> Đã tự điền từ địa chỉ khách hàng — sửa lại nếu công trình ở chỗ khác.</span>';
    return;
  }
  if (cur === addr) { if (hint) hint.innerHTML = ''; return; }
  // Người dùng đã nhập địa chỉ khác → không đè, chỉ gợi ý
  if (hint) hint.innerHTML = `<span class="text-secondary">Địa chỉ khách: <b>${x(addr)}</b></span>
    <button type="button" class="btn btn-link btn-sm p-0 ms-1 align-baseline text-decoration-none" style="font-size:11.5px" onclick="_ctUseCustAddress('${prefix}')">Dùng địa chỉ này</button>`;
}

// Nút "Dùng địa chỉ này" — người dùng CHỦ ĐỘNG lấy địa chỉ khách
function _ctUseCustAddress(prefix) {
  const id = document.getElementById(`ct-${prefix}-customer`)?.value || '';
  const c  = id ? getCustomerById(id) : null;
  const noteEl = document.getElementById(`ct-${prefix}-note`);
  if (!c || !c.address || !noteEl) return;
  noteEl.value = c.address;
  _ctFormAuto[prefix].note = c.address;
  _ctFlash(noteEl);
  const hint = document.getElementById(`ct-${prefix}-note-hint`);
  if (hint) hint.innerHTML = '';
}

// Người dùng gõ vào ô địa chỉ → đó là địa chỉ "của người dùng" (không còn coi là tự điền)
function _ctNoteTyped(prefix) {
  const noteEl = document.getElementById(`ct-${prefix}-note`);
  if (noteEl && noteEl.value.trim() !== _ctFormAuto[prefix].note) {
    _ctFormAuto[prefix].note = '';
    const hint = document.getElementById(`ct-${prefix}-note-hint`);
    if (hint && hint.textContent.includes('Đã tự điền')) hint.innerHTML = '';
  }
}

// Nháy viền xanh ngắn để người dùng thấy ô vừa được tự điền
function _ctFlash(el) {
  el.style.transition = 'box-shadow .2s';
  el.style.boxShadow = '0 0 0 3px rgba(var(--bs-success-rgb),.35)';
  setTimeout(() => { el.style.boxShadow = ''; }, 900);
}

// Độ dài tối đa tên công trình (ô nhập có maxlength tương ứng)
const CT_NAME_MAX = 45;

// Gợi ý tên công trình: "<Loại> <Tên khách> (<Hạng mục>)"  — VD "SN Cô Sáu (Ốp gạch sân vườn, Mái che)"
// (04/10/2026) Bỏ phần "- T<tháng>/<năm>" — ngày thi công đã lưu riêng (Ngày bắt đầu).
// (05/10/2026) Hạng mục đặt trong NGOẶC ĐƠN thay cho dấu " - "; mã loại vẫn KHÔNG có ngoặc vuông.
// (05/10/2026) Bỏ dropdown Loại → mã loại lấy theo TIỀN TỐ đang có trong ô Tên (người dùng gõ "SN"
//   ở đầu tên là đổi loại); ô Tên còn trống → mặc định "CT"; ô Tên không có mã → không gắn mã (Khác).
// Dài quá CT_NAME_MAX → cắt bớt ở cuối (ô tên vẫn sửa tay được).
function _ctSuggestName(prefix) {
  const cur  = (document.getElementById(`ct-${prefix}-name`)?.value || '').trim();
  const loai = cur ? ctDetectLoai(cur) : 'CT';
  const cid  = document.getElementById(`ct-${prefix}-customer`)?.value || '';
  const c    = cid && typeof getCustomerById === 'function' ? getCustomerById(cid) : null;
  const hm   = (document.getElementById(`ct-${prefix}-hangmuc`)?.value || '').trim();
  if (!c) return '';                                   // chưa chọn khách → chưa gợi ý
  const head = (loai !== 'Khác' ? loai + ' ' : '') + c.name;
  if (!hm) return head.slice(0, CT_NAME_MAX).trim();
  let name = `${head} (${hm})`;
  // Quá dài → cắt bớt PHẦN HẠNG MỤC nhưng vẫn giữ dấu đóng ngoặc
  if (name.length > CT_NAME_MAX) {
    const room = CT_NAME_MAX - head.length - 3;              // 3 = " (" + ")"
    name = room > 0 ? `${head} (${hm.slice(0, room).trim()})` : head.slice(0, CT_NAME_MAX).trim();
  }
  return name;
}

// Bộ đếm ký tự dưới ô tên ("12/45") + nhãn loại tự nhận diện ("Loại: SN")
function _ctNameCounter(prefix) {
  const el = document.getElementById(`ct-${prefix}-name`);
  const ct = document.getElementById(`ct-${prefix}-name-count`);
  if (!el || !ct) return;
  const n = el.value.length;
  ct.textContent = `${n}/${CT_NAME_MAX}`;
  ct.className = n >= CT_NAME_MAX ? 'text-danger fw-semibold' : 'text-secondary';
  const lb = document.getElementById(`ct-${prefix}-loai-auto`);
  if (lb) lb.textContent = el.value.trim() ? ctDetectLoai(el.value) : '—';
}

// Tự điền tên nếu người dùng chưa sửa tay ô tên (dùng cho cả form Thêm và Sửa)
// force = true (nút "↺ Gợi ý lại") → bật lại chế độ tự điền
function _ctAutoName(force, prefix) {
  prefix = prefix || 'new';
  const el = document.getElementById(`ct-${prefix}-name`);
  if (!el) return;
  if (force) _ctFormAuto[prefix].name = true;
  if (!_ctFormAuto[prefix].name) { _ctNameCounter(prefix); return; }
  const sug = _ctSuggestName(prefix);
  if (sug) el.value = sug;
  _ctNameCounter(prefix);
}

// Người dùng gõ vào ô Tên:
//   • Chỉ đổi / thêm / bỏ MÃ LOẠI ở đầu (phần còn lại vẫn đúng gợi ý) → GIỮ chế độ tự điền,
//     để gõ "SN" rồi tiếp tục nhập Hạng mục vẫn tự cập nhật tên.
//   • Sửa phần khác của tên → app ngừng tự điền (tôn trọng tên người dùng tự đặt).
function _ctNameTyped(prefix) {
  const el  = document.getElementById(`ct-${prefix}-name`);
  const sug = _ctSuggestName(prefix);
  _ctFormAuto[prefix].name = !!(el && sug && _ctStripPrefix(el.value) === _ctStripPrefix(sug));
  _ctNameCounter(prefix);
}

// ══ BẢNG TÍNH M2 SÀN / KHỐI LƯỢNG (05/10/2026) ═════════════════════════
// Bảng động trong form Thêm/Sửa công trình: TÊN HẠNG MỤC | ĐVT | KL (+ nút xóa dòng).
//   • Form Thêm: sẵn 3 dòng trống. Form Sửa: nạp lại đúng các dòng đã lưu (chưa có → 3 dòng trống).
//   • Nút [+ 1 dòng] thêm dòng; gõ KL → "Tổng KL" (#tongKL) cập nhật ngay.
//   • Lưu vào record công trình ở field `khoiLuong`: [{ ten, dvt, kl }] (bỏ các dòng trống).
// Chỉ 1 form công trình mở tại 1 thời điểm (cùng modal #ct-modal) → dùng ID cố định ct-kl-tbody / tongKL.
const CT_KL_DEFAULT_ROWS = 3;
const CT_KL_DEFAULT_DVT  = 'm2';

// HTML 1 dòng của bảng (r: { ten, dvt, kl } — bỏ trống = dòng mới)
function _ctKlRowHtml(r) {
  r = r || {};
  const kl = (r.kl === 0 || r.kl) ? r.kl : '';
  return `<tr>
    <td><input type="text" class="form-control form-control-sm ct-kl-ten" value="${x(r.ten || '')}" placeholder="VD: Sàn tầng 1" autocomplete="off"></td>
    <td><input type="text" class="form-control form-control-sm ct-kl-dvt" value="${x(r.dvt === undefined ? CT_KL_DEFAULT_DVT : r.dvt)}" autocomplete="off"></td>
    <td><input type="number" step="any" min="0" inputmode="decimal" class="form-control form-control-sm text-end font-monospace ct-kl-kl" value="${kl}" oninput="ctKlUpdateTotal()"></td>
    <td class="text-center"><button type="button" class="btn btn-link btn-sm p-0 text-danger text-decoration-none" title="Xóa dòng" onclick="ctKlDelRow(this)"><span class="material-symbols-outlined" style="font-size:18px">close</span></button></td>
  </tr>`;
}

// HTML cả khối bảng (dùng trong template 2 form). rows: mảng đã lưu (bỏ trống → 3 dòng trống)
function _ctKlTableHtml(rows, lblStyle) {
  const list = (Array.isArray(rows) && rows.length) ? rows : Array.from({ length: CT_KL_DEFAULT_ROWS }, () => ({}));
  return `
    <label style="${lblStyle}">Bảng Tính M2 Sàn / Khối Lượng</label>
    <div class="table-responsive border rounded">
      <table class="table table-sm align-middle mb-0 ct-kl-table">
        <thead class="table-light">
          <tr style="font-size:11px">
            <th>TÊN HẠNG MỤC</th>
            <th style="width:110px">ĐVT</th>
            <th style="width:150px" class="text-end">KL</th>
            <th style="width:40px"></th>
          </tr>
        </thead>
        <tbody id="ct-kl-tbody">${list.map(_ctKlRowHtml).join('')}</tbody>
      </table>
    </div>
    <div class="d-flex justify-content-between align-items-center mt-2">
      <button type="button" class="btn btn-outline-secondary btn-sm" onclick="ctKlAddRow()">+ 1 dòng</button>
      <span style="font-size:13px">Tổng KL: <span id="tongKL" class="fw-bold font-monospace">${_ctKlFmt(_ctKlSum(list))}</span></span>
    </div>`;
}

// Thêm 1 dòng trống cuối bảng + đặt con trỏ vào ô Tên hạng mục
function ctKlAddRow() {
  const tb = document.getElementById('ct-kl-tbody');
  if (!tb) return;
  tb.insertAdjacentHTML('beforeend', _ctKlRowHtml({}));
  tb.lastElementChild?.querySelector('.ct-kl-ten')?.focus();
}

// Xóa 1 dòng → tính lại tổng
function ctKlDelRow(btn) {
  const tr = btn && btn.closest('tr');
  if (tr) tr.remove();
  ctKlUpdateTotal();
}

// Đọc số KL của 1 ô (rỗng / sai → 0)
function _ctKlNum(v) {
  const n = parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.'));
  return isFinite(n) ? n : 0;
}

// Tổng KL của mảng dòng
function _ctKlSum(rows) {
  return (rows || []).reduce((s, r) => s + _ctKlNum(r.kl), 0);
}

// Định dạng tổng: tối đa 2 chữ số thập phân, dấu phẩy thập phân kiểu Việt Nam
function _ctKlFmt(n) {
  return (Math.round(n * 100) / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

// Sự kiện oninput của ô KL → cập nhật "Tổng KL" ngay
function ctKlUpdateTotal() {
  const el = document.getElementById('tongKL');
  if (el) el.textContent = _ctKlFmt(_ctKlSum(ctKlSerialize({ keepEmpty: true })));
}

// Đọc bảng → mảng Object để lưu vào record công trình
//   [{ ten: 'Sàn tầng 1', dvt: 'm2', kl: 120.5 }, ...]
//   Bỏ dòng không có Tên hạng mục lẫn KL (dòng trống). opts.keepEmpty = true → giữ hết (để tính tổng).
function ctKlSerialize(opts) {
  opts = opts || {};
  const out = [];
  document.querySelectorAll('#ct-kl-tbody tr').forEach(tr => {
    const ten   = (tr.querySelector('.ct-kl-ten')?.value || '').trim();
    const dvt   = (tr.querySelector('.ct-kl-dvt')?.value || '').trim();
    const klRaw = (tr.querySelector('.ct-kl-kl')?.value || '').trim();
    if (!opts.keepEmpty && !ten && !klRaw) return;
    out.push({ ten, dvt, kl: _ctKlNum(klRaw) });
  });
  return out;
}

/**
 * Đọc khách hàng đang chọn trong modal → { customerId, chuDauTu }.
 * (Không còn kiểu "gõ tên tự do" — thêm khách mới đi qua khung Thêm nhanh.)
 * @param {string} prefix 'new' | 'edit'
 * @returns {{customerId: string|null, chuDauTu: string}}
 */
function _resolveCustomerFromPicker(prefix) {
  const val = document.getElementById(`ct-${prefix}-customer`)?.value || '';
  if (val && typeof getCustomerById === 'function') {
    const c = getCustomerById(val);
    if (c) return { customerId: c.id, chuDauTu: c.name };
  }
  return { customerId: null, chuDauTu: '' };
}

// ══ BỐ CỤC CHUNG CỦA FORM THÊM / SỬA (05/10/2026 — lưới Bootstrap) ══════
//   Dòng 1: Chủ đầu tư [+ Thêm nhanh] (7/12)        | Trạng thái (5/12)
//           (khung Thêm nhanh khách hàng — ẩn, hiện khi bấm nút)
//   Dòng 2: Hạng mục (~60% — gõ là tự điền Tên)      | Tên công trình (~40%) + loại tự nhận diện
//   Dòng 3: Bảng tính m2 sàn / khối lượng
//   Dòng 4: Ngày bắt đầu | Ngày kết thúc | Ngày quyết toán   (3 cột đều)
//   Dòng 5: Hệ số tỉ trọng (3/12)                    | Địa chỉ công trình (9/12)
// v: giá trị nạp sẵn (form Sửa) — { custId, status, hangMuc, name, khoiLuong, sd, sdHint, ed, cld, k, note }
function _ctFormHtml(prefix, v, inpStyle, lblStyle) {
  const mono = `${inpStyle};font-family:'IBM Plex Mono',monospace`;
  const selStyle = `${inpStyle};background:var(--bs-body-bg);color:var(--bs-body-color)`;
  const isNew = prefix === 'new';
  const statusOpts = Object.entries(PROJECT_STATUS)
    .map(([val, lb]) => `<option value="${val}"${v.status === val ? ' selected' : ''}>${lb}</option>`).join('');
  const nameMax = Math.max(CT_NAME_MAX, (v.name || '').length);
  const nameLen = (v.name || '').length;
  return `
    <div class="row g-3">
      <!-- Dòng 1: Chủ đầu tư | Trạng thái -->
      <div class="col-md-7">${_renderCustomerSelect(prefix, v.custId || null, inpStyle, lblStyle)}</div>
      <div class="col-md-5">
        <label style="${lblStyle}">Trạng Thái</label>
        <select id="ct-${prefix}-status" style="${selStyle}">${statusOpts}</select>
      </div>
      <!-- Khung Thêm nhanh khách hàng (ẩn — hiện khi bấm [+ Thêm nhanh]) -->
      <div class="col-12" style="margin-top:0">${_renderNewCustPane(prefix, inpStyle, lblStyle)}</div>

      <!-- Dòng 2: Hạng mục (~60%) | Tên công trình (~40%) -->
      <div class="col-md-7">
        <label style="${lblStyle}">Hạng Mục</label>
        <input id="ct-${prefix}-hangmuc" type="text" value="${x(v.hangMuc || '')}" placeholder="VD: Ốp gạch sân vườn, Làm mái che..." autocomplete="off"
          style="${inpStyle}" oninput="_ctAutoName(false,'${prefix}')">
        <div class="text-secondary" style="font-size:11px;margin-top:3px">Gõ hạng mục → tên công trình tự điền theo <b>Loại Tên khách (Hạng mục)</b>.</div>
      </div>
      <div class="col-md-5">
        <label style="${lblStyle}">Tên Công Trình *
          <button type="button" class="btn btn-link btn-sm p-0 ms-2 text-decoration-none" style="font-size:11px;text-transform:none;letter-spacing:0" onclick="_ctAutoName(true,'${prefix}')" title="Điền lại tên theo gợi ý">↺ Gợi ý lại</button>
        </label>
        <input id="ct-${prefix}-name" type="text" value="${x(v.name || '')}" maxlength="${nameMax}" placeholder="VD: SN Cô Sáu (Ốp gạch)" autocomplete="off"
          style="${inpStyle};font-size:14px" oninput="_ctNameTyped('${prefix}')">
        <div class="d-flex justify-content-between gap-2" style="font-size:11px;margin-top:3px">
          <span class="text-secondary" title="Gõ CT / SC / SN ở đầu tên để đổi loại; không có mã = Khác">Loại (tự nhận diện): <b id="ct-${prefix}-loai-auto">${v.name ? ctDetectLoai(v.name) : '—'}</b></span>
          <span id="ct-${prefix}-name-count" class="${nameLen >= CT_NAME_MAX ? 'text-danger fw-semibold' : 'text-secondary'}" style="white-space:nowrap">${nameLen}/${CT_NAME_MAX}</span>
        </div>
      </div>

      <!-- Dòng 3: Bảng tính m2 sàn -->
      <div class="col-12">${_ctKlTableHtml(v.khoiLuong, lblStyle)}</div>

      <!-- Dòng 4: Ngày bắt đầu | Ngày kết thúc | Ngày quyết toán -->
      <div class="col-md-4">
        <label style="${lblStyle}">Ngày Bắt Đầu${v.sdHint || ''}</label>
        <input id="ct-${prefix}-startdate" type="date" value="${v.sd || ''}" style="${mono}">
      </div>
      <div class="col-md-4">
        <label style="${lblStyle}">Ngày Kết Thúc <span style="font-weight:400;text-transform:none">(tùy chọn)</span></label>
        <input id="ct-${prefix}-enddate" type="date" value="${v.ed || ''}" style="${mono}">
      </div>
      <div class="col-md-4">
        <label style="${lblStyle}">Ngày Quyết Toán <span style="font-weight:400;text-transform:none">(khi đã QT)</span></label>
        <input id="ct-${prefix}-closeddate" type="date" value="${v.cld || ''}" style="${mono}">
      </div>

      <!-- Dòng 5: Hệ số tỉ trọng | Địa chỉ công trình -->
      <div class="col-md-3">
        <label style="${lblStyle}" title="Chia chi phí chung — mặc định 1, nhập 0 để không gánh">Hệ Số Tỉ Trọng</label>
        <input id="ct-${prefix}-hesotitrong" type="number" min="0" step="0.1" value="${v.k}" style="${mono}"
          title="Chia chi phí chung — mặc định 1, nhập 0 để không gánh">
      </div>
      <div class="col-md-9">
        <label style="${lblStyle}">Địa Chỉ Công Trình</label>
        <input id="ct-${prefix}-note" type="text" value="${x(v.note || '')}" placeholder="Địa chỉ công trình (tự điền từ địa chỉ khách hàng)..." autocomplete="off"
          style="${inpStyle}" oninput="_ctNoteTyped('${prefix}')">
        <div id="ct-${prefix}-note-hint" style="font-size:11.5px;margin-top:3px"></div>
      </div>

      <div class="col-12 d-flex gap-2" style="margin-top:16px">
        ${isNew
          ? `<button class="btn btn-primary" style="flex:1" onclick="saveCTCreate()"><span class="material-symbols-outlined msi-gap">save</span>Lưu Công Trình</button>
             <button class="btn btn-outline-secondary" onclick="closeModal()">Hủy</button>`
          : `<button class="btn btn-primary" style="flex:1" onclick="saveCTEdit('${v.id}')"><span class="material-symbols-outlined msi-gap">save</span>Lưu Thay Đổi</button>
             <button class="btn btn-outline-secondary" onclick="openCTDetail('${v.id}')">Hủy</button>`}
      </div>
    </div>`;
}

// Đọc Hệ số tỉ trọng: số ≥ 0 hợp lệ, sai → 1
function _ctReadK(prefix) {
  const raw = parseFloat(document.getElementById(`ct-${prefix}-hesotitrong`)?.value);
  return (isFinite(raw) && raw >= 0) ? raw : 1;
}

// Hạng mục của CT cũ chưa lưu field hangMuc → lấy phần trong ngoặc cuối tên "SN Cô Sáu (Ốp gạch)"
function _ctHangMucOf(p) {
  if (p && typeof p.hangMuc === 'string') return p.hangMuc;
  const m = String((p && p.name) || '').match(/\(([^()]*)\)\s*$/);
  return m ? m[1].trim() : '';
}

const _CT_INP_STYLE = 'width:100%;box-sizing:border-box;padding:9px 12px;border:1.5px solid var(--bs-border-color);border-radius:8px;font-family:inherit;font-size:13px;outline:none';
const _CT_LBL_STYLE = 'font-size:11px;font-weight:700;color:var(--bs-secondary-color);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px';

// ══════════════════════════════════════════════════════════════════
//  MODAL TẠO MỚI
// ══════════════════════════════════════════════════════════════════
// opts.customerId: chọn sẵn Chủ đầu tư (mở từ Hồ sơ Khách hàng — 04/10/2026)
function openCTCreateModal(opts) {
  opts = (opts && typeof opts === 'object' && !(opts instanceof Event)) ? opts : {};
  // Form tạo đang mở dở (người dùng đang nhập) → KHÔNG vẽ lại form (mất dữ liệu); chỉ chọn khách
  if (opts.customerId && document.getElementById('ct-modal')?.classList.contains('open') && document.getElementById('ct-new-name')) {
    _ctSelectCustomer('new', opts.customerId);
    return;
  }
  const today   = new Date().toISOString().slice(0, 10);
  const _curY   = new Date().getFullYear();
  const _defSD  = (typeof activeYear !== 'undefined' && activeYear > 0 && activeYear < _curY)
                  ? `${activeYear}-01-01`
                  : today;
  _ctFormAuto.new = { name: true, note: '' };
  document.getElementById('modal-title').textContent = '+ Thêm Công Trình Mới';
  document.getElementById('modal-body').innerHTML = _ctFormHtml('new', {
    status: 'active', sd: _defSD, k: 1, khoiLuong: [],
  }, _CT_INP_STYLE, _CT_LBL_STYLE);
  document.getElementById('ct-modal').classList.add('open');
  if (opts.customerId && typeof getCustomerById === 'function' && getCustomerById(opts.customerId)) {
    // Khách chọn sẵn → điền địa chỉ (ô đang trống) + gợi ý tên; con trỏ vào ô Hạng mục
    _ctSelectCustomer('new', opts.customerId);
    setTimeout(() => document.getElementById('ct-new-hangmuc')?.focus(), 80);
  } else {
    setTimeout(() => document.getElementById('ct-new-customer')?.focus(), 80);
  }
}

function saveCTCreate() {
  // Chuẩn hóa "[SN] Cô Sáu" → "SN Cô Sáu" rồi TỰ NHẬN DIỆN loại từ tiền tố tên
  const name       = _ctNormalizeNamePrefix(document.getElementById('ct-new-name')?.value || '');
  const loaiCongTrinh = ctDetectLoai(name);                 // 'CT' | 'SC' | 'SN' | 'Khác'
  const status     = document.getElementById('ct-new-status')?.value || 'active';
  const startDate  = document.getElementById('ct-new-startdate')?.value || '';
  const endDate    = document.getElementById('ct-new-enddate')?.value || '';
  const closedDate = document.getElementById('ct-new-closeddate')?.value || '';
  const note       = (document.getElementById('ct-new-note')?.value || '').trim();
  const hangMuc    = (document.getElementById('ct-new-hangmuc')?.value || '').trim();
  const khoiLuong  = ctKlSerialize();                       // bảng m2 sàn → [{ten, dvt, kl}]
  const heSoTiTrong = _ctReadK('new');
  const { customerId, chuDauTu } = _resolveCustomerFromPicker('new');
  // Chủ đầu tư bắt buộc (khóa ngoại customerId) — để gộp nhóm theo khách hàng chính xác
  if (!customerId) { toast('Vui lòng chọn Chủ Đầu Tư (hoặc bấm + Thêm nhanh)!', 'error'); document.getElementById('ct-new-customer')?.focus(); return; }
  if (!name) { toast('Vui lòng nhập tên công trình!', 'error'); document.getElementById('ct-new-name')?.focus(); return; }
  if (name.length > CT_NAME_MAX) { toast(`Tên công trình tối đa ${CT_NAME_MAX} ký tự (đang ${name.length})!`, 'error'); document.getElementById('ct-new-name')?.focus(); return; }
  try {
    createProject({
      name, type: (loaiCongTrinh === 'CT' || loaiCongTrinh === 'SC') ? loaiCongTrinh : 'OTHER',
      loaiCongTrinh, hangMuc, khoiLuong, heSoTiTrong,
      status, startDate, endDate: endDate || null, closedDate: closedDate || null, note, chuDauTu, customerId,
    });
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
  // Khách hàng đang gắn (customerId còn sống; CT cũ chưa có id → dò theo tên Chủ đầu tư)
  const _editCust = (p.customerId && typeof getCustomerById === 'function' ? getCustomerById(p.customerId) : null)
    || (p.chuDauTu && typeof findCustomerByName === 'function' ? findCustomerByName(p.chuDauTu) : null);
  _ctFormAuto.edit = { name: false, note: '' };
  document.getElementById('modal-title').innerHTML = '<span class="material-symbols-outlined msi-gap">edit</span>Sửa Công Trình';
  document.getElementById('modal-body').innerHTML =
    (!_editCust ? `<div class="alert alert-warning py-1 px-2 mb-3" style="font-size:12px">⚠ Công trình chưa gắn khách hàng${p.chuDauTu ? ` (tên cũ: <b>${x(p.chuDauTu)}</b>)` : ''} — chọn Chủ đầu tư để lưu được.</div>` : '') +
    _ctFormHtml('edit', {
      id: p.id, custId: _editCust ? _editCust.id : null, status: p.status,
      hangMuc: _ctHangMucOf(p), name: p.name,
      khoiLuong: Array.isArray(p.khoiLuong) ? p.khoiLuong : [],   // nạp lại đúng các dòng đã lưu
      sd, sdHint, ed: p.endDate || '', cld: p.closedDate || '',
      k: getProjectK(p), note: p.note || '',
    }, _CT_INP_STYLE, _CT_LBL_STYLE);
  // Tên hiện tại đúng bằng tên gợi ý (Khách + Hạng mục) → bật tự điền: sửa Hạng mục là tên đổi theo.
  // Tên người dùng đã tự đặt khác gợi ý → KHÔNG tự đè.
  const _sug = _ctSuggestName('edit');
  _ctFormAuto.edit.name = !!_sug && _ctStripPrefix(_sug) === _ctStripPrefix(p.name);
  document.getElementById('ct-modal').classList.add('open');
}

function saveCTEdit(id) {
  // Chuẩn hóa "[SN] Cô Sáu" → "SN Cô Sáu" rồi TỰ NHẬN DIỆN loại từ tiền tố tên
  const name       = _ctNormalizeNamePrefix(document.getElementById('ct-edit-name')?.value || '');
  const loaiCongTrinh = ctDetectLoai(name);
  const status     = document.getElementById('ct-edit-status')?.value;
  const startDate  = document.getElementById('ct-edit-startdate')?.value || '';
  const endDate    = document.getElementById('ct-edit-enddate')?.value || '';
  const closedDate = document.getElementById('ct-edit-closeddate')?.value || '';
  const note       = (document.getElementById('ct-edit-note')?.value || '').trim();
  const hangMuc    = (document.getElementById('ct-edit-hangmuc')?.value || '').trim();
  const khoiLuong  = ctKlSerialize();
  // Lấy customerId + tên CĐT từ picker (chọn có sẵn / tạo KH mới / để trống)
  const { customerId, chuDauTu } = _resolveCustomerFromPicker('edit');
  // Chủ đầu tư bắt buộc (04/10/2026)
  if (!customerId) { toast('Vui lòng chọn Chủ Đầu Tư (hoặc bấm + Thêm nhanh)!', 'error'); document.getElementById('ct-edit-customer')?.focus(); return; }
  // Hệ số tỉ trọng: parse số, không hợp lệ → 1
  const heSoTiTrong = _ctReadK('edit');
  if (!name) { toast('Vui lòng nhập tên công trình!', 'error'); document.getElementById('ct-edit-name')?.focus(); return; }
  // Giới hạn ký tự chỉ áp khi ĐỔI tên (CT cũ tên dài hơn vẫn lưu được các sửa đổi khác)
  if (name.length > CT_NAME_MAX && name !== (getProjectById(id)?.name || '')) {
    toast(`Tên công trình tối đa ${CT_NAME_MAX} ký tự (đang ${name.length})!`, 'error'); document.getElementById('ct-edit-name')?.focus(); return;
  }

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
    updateProject(id, {
      name, status, startDate, startDateUserEdited, endDate: endDate || null, closedDate: closedDate || null,
      note, chuDauTu, customerId, heSoTiTrong,
      // (05/10/2026) loại tự nhận diện từ tên + hạng mục + bảng m2 sàn
      loaiCongTrinh, type: (loaiCongTrinh === 'CT' || loaiCongTrinh === 'SC') ? loaiCongTrinh : 'OTHER',
      hangMuc, khoiLuong,
    });
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
