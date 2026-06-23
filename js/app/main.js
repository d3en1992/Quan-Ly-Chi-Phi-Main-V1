// main.js — Global State / init() / goPage() / Year Filter
// Load order: sau auth.js — LOAD CUOI CUNG
// Auth + Role logic đã chuyển sang js/app/auth.js

// Multi-year filter — empty Set = "Tất cả"
let activeYears = new Set([new Date().getFullYear()]);
// Backward compat shim — always kept in sync via _syncActiveYearCompat()
// Legacy code still reads `activeYear`; new filter logic uses activeYears + inActiveYear()
let activeYear = new Date().getFullYear();

function _syncActiveYearCompat() {
  if (activeYears.size === 0)      activeYear = 0;
  else if (activeYears.size === 1) activeYear = [...activeYears][0];
  else                             activeYear = 0; // multi → "all" for legacy
}

// Dùng cho backward compat (setActiveYear(0) = Tất cả, setActiveYear(2025) = 1 năm)
function setActiveYear(year) {
  if (year === 0) activeYears = new Set();
  else            activeYears = new Set([year]);
  _syncActiveYearCompat();
}

// ══════════════════════════════
//  INIT
// ══════════════════════════════
function init() {
  document.getElementById('entry-date').value = today();
  document.getElementById('ung-date').value = today();

  // ── [FIX Lỗi 2] Sau khi nhập file JSON xong, app tự reload lại ──────────
  // File JSON có thể chứa dữ liệu của NHIỀU năm. importJSONFull() đã đặt cờ
  // '_showAllYearsAfterReload' trước khi reload. Ở đây ta đọc cờ đó và set bộ
  // lọc năm = "Tất cả" (Set rỗng) → mọi năm vừa nhập đều hiển thị, không bị
  // giấu mất các năm khác ngoài năm hiện tại.
  if (localStorage.getItem('_showAllYearsAfterReload') === '1') {
    localStorage.removeItem('_showAllYearsAfterReload');
    activeYears = new Set();      // rỗng = "Tất cả"
    _syncActiveYearCompat();
  }

  // Hiển thị dữ liệu local ngay lập tức
  initTable(5);
  initUngTable(4);
  initCC();
  updateTop();
  updateJbBtn();

  // ── Nâng cấp schema nếu cần (chạy trước khi dùng data) ──
  migrateData();

  buildYearSelect(true); // skipCloud=true: chỉ render local, chờ gsLoadAll fetch cloud
  renderTodayInvoices();
  applyNavPermissions();
  syncAuthUI();
  startRoleObserver();
  queueApplyRoleUI();

  // Tự động đo chiều cao topbar và cập nhật padding cho body
  // Giải quyết vấn đề topbar sticky che khuất content trên mobile khi nút rớt dòng
  (function syncTopbarHeight() {
    const topbar = document.querySelector('.topbar');
    const body   = document.body;
    function update() {
      const h = topbar ? topbar.getBoundingClientRect().height : 0;
      // Thêm CSS variable để dùng ở bất cứ đâu nếu cần
      document.documentElement.style.setProperty('--topbar-h', h + 'px');
    }
    update();
    // Theo dõi khi topbar thay đổi chiều cao (wrap nút, resize cửa sổ)
    if (window.ResizeObserver) {
      new ResizeObserver(update).observe(topbar);
    }
    window.addEventListener('resize', update);
  })();

  // Topbar luôn cố định — không dùng compact effect khi cuộn

  // Tải dữ liệu mới nhất từ cloud (nếu đã có Bin ID)
  gsLoadAll(function(data) {
    // [FIX Lỗi 1] Reload dữ liệu từ local (IDB) — LUÔN chạy, kể cả khi cloud
    // pull trả về null (vd: bị chặn 2h sau khi nhập JSON, hoặc đang có pull khác
    // chạy song song). Trước đây dòng `if(!data) return` khiến app bỏ qua luôn
    // bước render khi pull null → màn hình trắng / chỉ thấy năm hiện tại.
    invoices    = load('inv_v3', []);
    ungRecords  = load('ung_v1', []);
    ccData      = load('cc_v2', []);
    tbData      = load('tb_v1', []);
    thuRecords  = load('thu_v1', []);
    projects    = load('projects_v1', []);
    customers   = load('customers_v1', []); // Chủ đầu tư (CRM) — nạp sau pull cloud
    cats.congTrinh      = load('cat_ct',       DEFAULTS.congTrinh);
    cats.congTrinhYears = load('cat_ct_years', {});
    cats.loaiChiPhi     = load('cat_loai',     DEFAULTS.loaiChiPhi);
    cats.nhaCungCap     = load('cat_ncc',      DEFAULTS.nhaCungCap);
    cats.nguoiTH        = load('cat_nguoi',    DEFAULTS.nguoiTH);
    cats.tbTen          = load('cat_tbteb',    DEFAULTS.tbTen);

    // [FIX Lỗi 1] Nếu năm đang chọn (mặc định = năm hiện tại) KHÔNG có dữ liệu
    // nào, nhưng các năm khác lại có → tự chuyển bộ lọc sang "Tất cả" để app
    // luôn hiển thị được dữ liệu, tránh màn hình trắng khi mở lên.
    _autoSelectYearsWithData();

    buildYearSelect(); updateTop();
    rebuildEntrySelects(); rebuildCCNameList(); populateCCCtSel();
    initTable(5); initUngTable(4); initCC();
    const built2 = rebuildCCCategories();
    // Rebuild cats.congTrinh từ projects sau tất cả các rebuild khác
    // → đảm bảo projects là single source of truth, loại bỏ garbage
    rebuildCatCTFromProjects();
    updateTop();
    // Render lại tab đang mở theo activeYears (có thể vừa được đổi sang "Tất cả")
    if (typeof renderActiveTab === 'function') renderActiveTab();
    // Chỉ báo "Đồng bộ xong" khi thực sự kéo được dữ liệu mới từ cloud
    if (data) toast(`✅ Đồng bộ xong! ${built2.cts} CT mới`, 'success');
  });
}

function today() { return new Date().toISOString().split('T')[0]; }

// ── [FIX Lỗi 1] Tự chọn năm có dữ liệu khi năm hiện tại trống ────────────
// Giải quyết tình huống: mở app lên, bộ lọc mặc định là năm hiện tại nhưng
// năm đó chưa có dữ liệu (dữ liệu nằm ở các năm khác) → màn hình trắng.
// Cách xử lý: nếu năm đang chọn trống mà năm khác có dữ liệu → chuyển sang
// "Tất cả" để hiển thị mọi thứ. Tôn trọng lựa chọn của user nếu họ đã chủ
// động chọn "Tất cả" hoặc nhiều năm (chỉ can thiệp khi đang chọn đúng 1 năm).
function _autoSelectYearsWithData() {
  if (activeYears.size !== 1) return;          // user đã chọn "Tất cả"/nhiều năm → giữ nguyên
  const cur = [...activeYears][0];

  // Gom tất cả các năm đang có dữ liệu trong local (đọc trực tiếp từ store)
  const yrs = new Set();
  const addYrs = (arr, field) => (arr || []).forEach(r => {
    const d = r[field];
    if (d && d.length >= 4) yrs.add(parseInt(d.slice(0, 4)));
  });
  addYrs(load('inv_v3', []), 'ngay');
  addYrs(load('ung_v1', []), 'ngay');
  addYrs(load('cc_v2',  []), 'fromDate');
  addYrs(load('tb_v1',  []), 'ngay');
  addYrs(load('thu_v1', []), 'ngay');

  if (yrs.has(cur)) return;     // năm hiện tại đã có dữ liệu → giữ nguyên
  if (yrs.size === 0) return;   // chưa có dữ liệu năm nào (sẽ chờ cloud pull) → giữ nguyên

  // Năm hiện tại trống nhưng năm khác có dữ liệu → hiển thị "Tất cả"
  activeYears = new Set();      // rỗng = "Tất cả"
  _syncActiveYearCompat();
}


// ══════════════════════════════
//  NAVIGATION
// ══════════════════════════════
function goPage(btn, id) {
  if (!getCurrentUser()) {
    toggleUserDropdown(true);
    return;
  }
  // Khi router (hashchange / lúc khởi động) gọi sẽ không truyền btn → tự tìm nút nav theo data-page
  if (!btn) btn = document.querySelector('.nav-btn[data-page="' + id + '"]');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  if (btn) btn.classList.add('active');
  // Dynamic topbar title
  const _PAGE_LABELS = {
    congtrinh: '🏗️ Công Trình', nhap: '💰 Nhập Chi Phí',
    thongkecphd: '📊 Thống Kê CP/HĐ', chamcong: '📅 Chấm Công',
    nhapung: '💰 Tiền Ứng', thietbi: '🔧 Theo Dõi TB',
    danhmuc: '⚙ Danh Mục', doanhthu: '💵 Doanh Thu', congno: '💳 Công Nợ', dashboard: '📊 Dashboard',
    thungrac: '🗑️ Thùng Rác'
  };
  _setTopbarTabTitle(_PAGE_LABELS[id] || '');
  // Reload globals từ _mem → đảm bảo tab switch luôn thấy data mới nhất (kể cả khi auto-sync chạy ngầm)
  if (typeof _reloadGlobals === 'function') _reloadGlobals();
  if (id==='nhap') { renderTodayInvoices(); }
  if (id==='thongkecphd') { buildFilters(); filterAndRender(); }
  if (id==='danhmuc') renderSettings();
  if (id==='dashboard') renderDashboard();
  if (id==='doanhthu') initDoanhThu();
  if (id==='congno') initCongNo();
  if (id==='nhapung') { initUngTableIfEmpty(); buildUngFilters(); filterAndRenderUng(); }
  if (id==='chamcong') { populateCCCtSel(); rebuildCCNameList(); renderCCHistory(); renderCCTLT(); renderCCTLTMini(); if (typeof renderCCUngLedger==='function') renderCCUngLedger(); }
  if (id==='thietbi') { tbPopulateSels(); tbBuildRows(5); tbRenderList(); renderKhoTong(); }
  if (id==='congtrinh') renderProjectsPage();
  if (id==='thungrac') renderThungRac();
  queueApplyRoleUI();

  // Cập nhật URL hash → refresh/Back/bookmark giữ đúng tab (KHÔNG tải lại trang).
  // Việc gán hash kích hoạt sự kiện 'hashchange', nhưng _routeFromHash() sẽ thấy
  // tab này đã active nên thoát ngay → không gây vòng lặp.
  if (location.hash !== '#/' + id) location.hash = '#/' + id;
}

// ══════════════════════════════
//  HASH ROUTER — URL đổi theo tab (vd index.html#/chamcong)
//  Mục tiêu: refresh giữ nguyên tab, nút Back/Forward hoạt động, bookmark được.
//  Dùng hash (#/) để chạy được cả khi mở bằng file:// lẫn qua web server.
// ══════════════════════════════
// Danh sách id tab hợp lệ — khớp với data-page trong index.html
const _VALID_PAGES = new Set([
  'congtrinh', 'nhap', 'thongkecphd', 'chamcong', 'nhapung',
  'thietbi', 'danhmuc', 'doanhthu', 'congno', 'dashboard', 'thungrac'
]);

// Đọc id tab từ location.hash, vd '#/chamcong' → 'chamcong' (trả '' nếu không hợp lệ)
function _pageIdFromHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '').trim();
  return _VALID_PAGES.has(raw) ? raw : '';
}

// Mở đúng tab theo hash hiện tại — gọi lúc khởi động và mỗi khi hash thay đổi
function _routeFromHash() {
  if (!getCurrentUser()) return;              // chưa đăng nhập → bỏ qua (sẽ route lại sau khi login)
  let id  = _pageIdFromHash() || 'congtrinh'; // hash trống/sai → tab mặc định
  let btn = document.querySelector('.nav-btn[data-page="' + id + '"]');
  // Vai trò hiện tại không được phép xem tab này (nút nav bị ẩn) → quay về mặc định
  if (!btn || btn.style.display === 'none') {
    id  = 'congtrinh';
    btn = document.querySelector('.nav-btn[data-page="congtrinh"]');
  }
  // Tab này đã đang hiển thị → không làm gì (tránh re-render thừa và vòng lặp với goPage)
  const cur = document.querySelector('.page.active');
  if (cur && cur.id === 'page-' + id) return;
  goPage(btn, id);
}

// Khởi tạo router: lắng nghe hashchange + mở tab theo hash ngay khi vào app
function initHashRouter() {
  window.addEventListener('hashchange', _routeFromHash);
  _routeFromHash();
}

// ══════════════════════════════
//  PAGE PARTIALS (Phase 2) — nạp markup từng tab từ pages/<id>.html
//  Mỗi <div class="page" data-partial="pages/x.html"></div> trong index.html là
//  placeholder rỗng; ở đây fetch nội dung và đổ vào innerHTML.
//  Nạp SẴN toàn bộ (song song) trước init() → không đổi timing render, rủi ro thấp.
//  Lưu ý: fetch() file cục bộ cần chạy qua web server (http/https), không phải file://.
// ══════════════════════════════
async function loadAllPartials() {
  const holders = document.querySelectorAll('.page[data-partial]');
  await Promise.all([...holders].map(async el => {
    if (el.dataset.loaded === '1') return;        // đã nạp rồi → bỏ qua
    try {
      const res = await fetch(el.dataset.partial, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      el.innerHTML = await res.text();
      el.dataset.loaded = '1';
    } catch (e) {
      console.error('[partials] Không nạp được', el.dataset.partial, e);
      el.innerHTML =
        '<div class="p-4 text-danger">Không tải được nội dung trang (' +
        el.dataset.partial + '). Cần mở app qua web server (http/https).</div>';
    }
  }));
}

function _setTopbarTabTitle(label) {
  const el = document.getElementById('topbar-tab-title');
  if (!el) return;
  el.textContent = label ? label.replace(/^[^\w\s]+\s*/, '') : '';
  if (label) el.classList.add('visible');
  else el.classList.remove('visible');
}

// Sub-tab navigation bên trong page-nhap
function goSubPage(btn, id) {
  document.querySelectorAll('#page-nhap .sub-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#page-nhap .nav-link').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
  if (id === 'sub-hom-nay') { renderTodayInvoices(); }
  if (id === 'sub-tat-ca')  { buildFilters(); filterAndRender(); }
}

// Toggle 1 năm trong activeYears (gọi từ checkbox trong dropdown)
function onYearToggle(year) {
  if (activeYears.has(year)) activeYears.delete(year);
  else                        activeYears.add(year);
  _syncActiveYearCompat();
  _updateYearBtn();
  onYearChange();
}

// Quick actions
function yearQuickAll() {
  activeYears = new Set();
  _syncActiveYearCompat();
  buildYearSelect();
  _closeYearDropdown();
  onYearChange();
}
function yearQuickRecent() {
  const years = new Set();
  invoices.forEach(i=>{ if(i.ngay) years.add(parseInt(i.ngay)); });
  ungRecords.forEach(u=>{ if(u.ngay) years.add(parseInt(u.ngay)); });
  ccData.forEach(w=>{ if(w.fromDate) years.add(parseInt(w.fromDate)); });
  years.add(new Date().getFullYear());
  const sorted = [...years].sort((a,b)=>b-a);
  activeYears = new Set(sorted.slice(0, 2));
  _syncActiveYearCompat();
  buildYearSelect();
  _closeYearDropdown();
  onYearChange();
}
function toggleYearDropdown(e) {
  e.stopPropagation();
  const dd = document.getElementById('year-dropdown');
  if (!dd) return;
  const open = dd.classList.toggle('open');
  if (open) {
    setTimeout(() => document.addEventListener('click', _closeYearDropdown, { once: true }), 0);
  }
}
function _closeYearDropdown() {
  const dd = document.getElementById('year-dropdown');
  if (dd) dd.classList.remove('open');
}

function onYearChange() {
  // activeYears đã được cập nhật trước khi gọi hàm này
  _syncActiveYearCompat();

  if (activeYears.size === 0) { renderActiveTab(); return; }

  if (!fbReady() || typeof pullChanges !== 'function') {
    renderActiveTab(); return;
  }

  // Push pending trước khi đổi năm
  if (typeof _pendingChanges !== 'undefined' && _pendingChanges > 0
      && !isSyncing() && typeof pushChanges === 'function') {
    pushChanges({ silent: true });
  }

  // Tìm các năm chưa có data local
  const missing = [...activeYears].filter(yr => {
    const ys = String(yr);
    return !invoices.some(i=>i.ngay&&i.ngay.startsWith(ys))
        && !ccData.some(w=>w.fromDate&&w.fromDate.startsWith(ys))
        && !ungRecords.some(u=>u.ngay&&u.ngay.startsWith(ys));
  });

  if (!missing.length) {
    renderActiveTab();
    if (typeof _pendingChanges !== 'undefined' && _pendingChanges > 0) {
      setTimeout(()=>toast('⚠️ Còn ' + _pendingChanges + ' thay đổi chưa đồng bộ — bấm 🔄 Sync', 'info'), 400);
    }
    return;
  }

  // Pull từng năm còn thiếu tuần tự
  const yrsStr = missing.join(', ');
  showSyncBanner('⏳ Đang tải dữ liệu năm ' + yrsStr + '...');
  let idx = 0;
  function pullNext() {
    if (idx >= missing.length) {
      _reloadGlobals();
      buildYearSelect();
      renderActiveTab();
      hideSyncBanner();
      if (typeof _pendingChanges !== 'undefined' && _pendingChanges > 0) {
        toast('✅ Đã tải năm ' + yrsStr + '. ⚠️ Còn ' + _pendingChanges + ' thay đổi chưa sync — bấm 🔄 Sync.', 'info');
      } else {
        toast('✅ Đã tải dữ liệu năm ' + yrsStr + ' từ Firebase', 'success');
      }
      return;
    }
    pullChanges(missing[idx++], pullNext, { silent: true });
  }
  pullNext();
}

function _refreshAllTabs() {
  // Full refresh — dùng cho import/restore khi cần cập nhật mọi tab ngay lập tức.
  // Sau sync hoặc đổi năm: dùng renderActiveTab() thay thế để tránh render tab ẩn.

  // Tầng 1: Rebuild filter dropdowns theo năm mới
  buildFilters();
  buildUngFilters();
  buildCCHistFilters();
  populateCCCtSel();        // dropdown CT trong Chấm Công
  tbPopulateSels();         // dropdown CT trong Thiết Bị
  rebuildEntrySelects();    // dropdown CT trong bảng nhập HĐ đang mở
  rebuildUngSelects();      // dropdown CT trong bảng nhập tiền ứng đang mở
  renderSettings();         // Tab Danh Mục — lọc CT theo năm mới

  // Tầng 2: Render lại nội dung TẤT CẢ các tab
  filterAndRender();        // Tất cả CP
  filterAndRenderUng();     // Tiền Ứng
  renderCtPage();           // Tổng CP CT
  renderCCHistory();        // Lịch sử CC
  renderCCTLT();            // Tổng lương tuần
  renderTodayInvoices();    // HĐ trong ngày (tab Nhập)
  tbRenderList();           // Thiết Bị
  renderDashboard();        // Dashboard (gọi renderLaiLo() bên trong)
  renderProjectsPage();     // Tab Công Trình — cập nhật chi phí theo năm

  dtPopulateSels();          // dropdowns tab Doanh Thu (gọi renderHdcTable/renderHdtpTable bên trong)
  renderThuTable();          // lịch sử thu tiền
  updateTop();
}

// ── Lấy ID tab đang active ─────────────────────────────────────────
function getCurrentTab() {
  const active = document.querySelector('.page.active');
  return active ? active.id.replace('page-', '') : 'dashboard';
}

// ── Render ONLY tab đang hiển thị — dùng sau sync và đổi năm ───────
// Không render tab ẩn → nhanh hơn _refreshAllTabs() nhiều lần.
// Tự gọi _reloadGlobals() để đảm bảo luôn dùng data mới nhất từ _mem.
function renderActiveTab() {
  // Reload globals từ _mem → bắt buộc sau sync hoặc tab switch khi auto-sync chạy ngầm
  if (typeof _reloadGlobals === 'function') _reloadGlobals();
  updateTop();

  const tab = getCurrentTab();
  if (!getCurrentUser()) {
    toggleUserDropdown(true);
    return;
  }
  switch (tab) {
    case 'nhap': {
      rebuildEntrySelects(); buildFilters(); refreshHoadonCtDropdowns();
      const sub = document.querySelector('#page-nhap .sub-page.active');
      if (!sub || sub.id === 'sub-hom-nay') renderTodayInvoices();
      else if (sub.id === 'sub-tat-ca')     { buildFilters(); filterAndRender(); }
      else renderTodayInvoices();
      break;
    }
    case 'nhapung':
      rebuildUngSelects(); buildUngFilters(); filterAndRenderUng();
      break;
    case 'chamcong':
      populateCCCtSel(); rebuildCCNameList(); renderCCHistory(); renderCCTLT(); renderCCTLTMini();
      if (typeof renderCCUngLedger==='function') renderCCUngLedger();
      break;
    case 'thietbi':
      tbPopulateSels(); tbRenderList(); renderKhoTong();
      break;
    case 'danhmuc':
      renderSettings();
      break;
    case 'congtrinh':
      renderProjectsPage();
      break;
    case 'thongkecphd':
      // Rebuild filter dropdowns + render lại bảng ngay khi đổi năm
      buildFilters(); filterAndRender();
      break;
    case 'doanhthu':
      // dtPopulateSels() gọi renderHdcTable + renderHdtpTable bên trong
      dtPopulateSels(); renderThuTable();
      break;
    case 'congno':
      // Render lại toàn bộ page Công Nợ khi đổi năm
      initCongNo();
      break;
    case 'dashboard':
    default:
      // renderDashboard() gọi renderCtPage() bên trong
      renderDashboard();
      break;
  }
  queueApplyRoleUI();
}

// ══════════════════════════════════════════════════════════════
// MÀN HÌNH CHẶN KHI MẤT MẠNG (app chạy online 100%)
// ══════════════════════════════════════════════════════════════
// Hiện overlay che toàn màn, tự tải lại app ngay khi có mạng trở lại.
function _showOfflineBlock() {
  if (document.getElementById('offline-block')) return;
  const el = document.createElement('div');
  el.id = 'offline-block';
  el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;color:#fff;'
    + 'display:flex;flex-direction:column;align-items:center;justify-content:center;'
    + 'text-align:center;font-family:system-ui,sans-serif;padding:24px;gap:14px';
  el.innerHTML =
    '<div style="font-size:52px">📡</div>'
    + '<div style="font-size:20px;font-weight:700">Mất kết nối internet</div>'
    + '<div style="font-size:15px;opacity:.8;max-width:320px;line-height:1.5">'
    + 'App cần có mạng để làm việc với dữ liệu trên cloud. '
    + 'Vui lòng bật mạng — app sẽ tự mở lại khi có kết nối.</div>'
    + '<button id="offline-retry" style="margin-top:8px;padding:10px 22px;border:0;border-radius:8px;'
    + 'background:#2563eb;color:#fff;font-size:15px;cursor:pointer">Thử lại</button>';
  document.body.appendChild(el);
  document.getElementById('offline-retry').onclick = () => location.reload();
  // Có mạng trở lại → tự tải lại để khởi động bình thường
  window.addEventListener('online', () => location.reload(), { once: true });
}

// Khoi dong app — IDB preflight truoc, sau do moi chay init()
// Flag bảo vệ: render sẽ bail-out nếu data chưa sẵn sàng
window._dataReady = false;
(async () => {
  // Online 100%: bắt buộc có mạng mới chạy. Mất mạng → chặn + tự thử lại.
  if (!navigator.onLine) { _showOfflineBlock(); return; }

  await dbInit();
  // Re-load globals từ _mem (đã được dbInit() populate từ IDB)
  invoices    = load('inv_v3', []);
  ungRecords  = load('ung_v1', []);
  ccData      = load('cc_v2', []);
  tbData      = load('tb_v1', []);
  hopDongData      = load('hopdong_v1',  {});
  thuRecords       = load('thu_v1',      []);
  thauPhuContracts = load('thauphu_v1',  []);
  projects         = load('projects_v1', []);
  customers        = load('customers_v1', []); // Chủ đầu tư (CRM)
  _migrateProjectDates(); // year → startDate/endDate migration (idempotent)
  if (typeof _migrateChuDauTuFromHopDong === 'function') _migrateChuDauTuFromHopDong(); // backfill chuDauTu từ hopdong_v1.khachHang
  if (typeof _migrateCustomersFromProjects === 'function') _migrateCustomersFromProjects(); // backfill customerId từ chuDauTu
  cats.congTrinh      = load('cat_ct',       DEFAULTS.congTrinh);
  cats.congTrinhYears = load('cat_ct_years', {});
  cats.loaiChiPhi     = load('cat_loai',     DEFAULTS.loaiChiPhi);
  cats.nhaCungCap     = load('cat_ncc',      DEFAULTS.nhaCungCap);
  cats.nguoiTH        = load('cat_nguoi',    DEFAULTS.nguoiTH);
  cats.thauPhu        = load('cat_tp',       []);
  cats.congNhan       = load('cat_cn',       []);
  cats.tbTen          = load('cat_tbteb',    DEFAULTS.tbTen);
  cnRoles             = load('cat_cn_roles', {});

  // Dọn sạch HĐ CC cũ còn sót trong inv_v3 (migration một lần)
  // Từ giờ CC invoices được tính động qua buildInvoices(), không lưu vào storage
  const legacyCCCount = invoices.filter(i => i.ccKey).length;
  if (legacyCCCount > 0) {
    invoices = invoices.filter(i => !i.ccKey);
    save('inv_v3', invoices);
    console.log(`[Migration] Đã xóa ${legacyCCCount} HĐ CC cũ khỏi inv_v3`);
  }

  // Xóa các project không hợp lệ khỏi projects_v1
  // (ví dụ: tên loại chi phí, ngày tháng bị tạo nhầm bởi migration)
  cleanupInvalidProjects([
    ...(cats.loaiChiPhi  || []),
    ...(cats.congNhan    || []),
    ...(cats.thauPhu     || []),
    ...(cats.nhaCungCap  || []),
    ...(cats.nguoiTH     || []),
  ]);

  // Gán projectId cho tất cả records chưa có (migration một lần, idempotent)
  migrateProjectLinks();

  // Normalize ctPid cho dữ liệu CC cũ chưa có ctPid (backward compat)
  if (typeof normalizeAllChamCong === 'function') normalizeAllChamCong();

  // Đánh dấu data đã sẵn sàng — các render sau đây mới được phép chạy
  window._dataReady = true;

  // Phương án A: với người dùng quay lại, hàm này TRẢ VỀ NGAY (không chờ cloud)
  await trySyncUsersBeforeAuth();

  if (!initAuth()) {
    // Khách (chưa đăng nhập): đồng bộ tài khoản từ cloud chạy NGẦM (không chặn),
    // để khi bấm đăng nhập là dùng đúng tài khoản mới nhất. App hiện form ngay tức thì.
    if (typeof _backgroundUsersSync === 'function') _backgroundUsersSync();
    return;
  }

  // Phase 2: nạp markup các page (pages/*.html) TRƯỚC init() để mọi render hook đủ DOM
  await loadAllPartials();

  init();

  // Khởi tạo hash router → mở đúng tab theo URL (#/...) và theo dõi Back/Forward
  initHashRouter();

  // Reset pending counter sau init (tránh migration/startup saves làm badge sai)
  if (typeof _resetPending === 'function') _resetPending();

  applyNavPermissions();
  renderProjectsPage();
  queueApplyRoleUI();

  // Cảnh báo khi đóng tab nếu còn thay đổi chưa sync
  window.addEventListener('beforeunload', function(e) {
    if (typeof _pendingChanges !== 'undefined' && _pendingChanges > 0) {
      e.preventDefault();
      e.returnValue = ''; // trình duyệt hiện cảnh báo mặc định
    }
  });

})();
