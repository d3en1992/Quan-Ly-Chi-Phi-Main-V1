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

  // Hiển thị dữ liệu local ngay lập tức
  initTable(5);
  initUngTable(4);
  initCC();
  updateTop();
  updateJbBtn();

  // ── Nâng cấp schema nếu cần (chạy trước khi dùng data) ──
  migrateData();

  buildYearSelect(true); // skipCloud=true: chỉ render local, chờ gsLoadAll fetch cloud
  renderTrash();
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
    if (!data) return;
    invoices    = load('inv_v3', []);
    ungRecords  = load('ung_v1', []);
    ccData      = load('cc_v2', []);
    tbData      = load('tb_v1', []);
    projects    = load('projects_v1', []);
    cats.congTrinh      = load('cat_ct',       DEFAULTS.congTrinh);
    cats.congTrinhYears = load('cat_ct_years', {});
    cats.loaiChiPhi     = load('cat_loai',     DEFAULTS.loaiChiPhi);
    cats.nhaCungCap     = load('cat_ncc',      DEFAULTS.nhaCungCap);
    cats.nguoiTH        = load('cat_nguoi',    DEFAULTS.nguoiTH);
    cats.tbTen          = load('cat_tbteb',    DEFAULTS.tbTen);
    buildYearSelect(); updateTop();
    rebuildEntrySelects(); rebuildCCNameList(); populateCCCtSel();
    initTable(5); initUngTable(4); initCC();
    const built2 = rebuildCCCategories();
    // Rebuild cats.congTrinh từ projects sau tất cả các rebuild khác
    // → đảm bảo projects là single source of truth, loại bỏ garbage
    rebuildCatCTFromProjects();
    updateTop();
    toast(`✅ Đồng bộ xong! ${built2.cts} CT mới`, 'success');
  });
}

function today() { return new Date().toISOString().split('T')[0]; }


// ══════════════════════════════
//  NAVIGATION
// ══════════════════════════════
function goPage(btn, id) {
  if (!getCurrentUser()) {
    toggleUserDropdown(true);
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  btn.classList.add('active');
  // Dynamic topbar title
  const _PAGE_LABELS = {
    congtrinh: '🏗️ Công Trình', nhap: '💰 Nhập Chi Phí',
    thongkecphd: '📊 Thống Kê CP/HĐ', chamcong: '📅 Chấm Công',
    nhapung: '💰 Tiền Ứng', thietbi: '🔧 Theo Dõi TB',
    danhmuc: '⚙ Danh Mục', doanhthu: '💵 Doanh Thu', dashboard: '📊 Dashboard'
  };
  _setTopbarTabTitle(_PAGE_LABELS[id] || '');
  // Reload globals từ _mem → đảm bảo tab switch luôn thấy data mới nhất (kể cả khi auto-sync chạy ngầm)
  if (typeof _reloadGlobals === 'function') _reloadGlobals();
  if (id==='nhap') { renderTodayInvoices(); }
  if (id==='thongkecphd') { buildFilters(); filterAndRender(); }
  if (id==='danhmuc') renderSettings();
  if (id==='dashboard') renderDashboard();
  if (id==='doanhthu') initDoanhThu();
  if (id==='nhapung') { initUngTableIfEmpty(); buildUngFilters(); filterAndRenderUng(); }
  if (id==='chamcong') { populateCCCtSel(); rebuildCCNameList(); renderCCHistory(); renderCCTLT(); }
  if (id==='thietbi') { tbPopulateSels(); tbBuildRows(5); tbRenderList(); renderKhoTong(); }
  if (id==='congtrinh') renderProjectsPage();
  queueApplyRoleUI();
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
  if (id === 'sub-da-xoa')  { renderTrash(); }
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
  renderTrash();
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
      else if (sub.id === 'sub-da-xoa')     renderTrash();
      else renderTodayInvoices();
      break;
    }
    case 'nhapung':
      rebuildUngSelects(); buildUngFilters(); filterAndRenderUng();
      break;
    case 'chamcong':
      populateCCCtSel(); rebuildCCNameList(); renderCCHistory(); renderCCTLT();
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
    case 'doanhthu':
      // dtPopulateSels() gọi renderHdcTable + renderHdtpTable + renderCongNoThauPhu bên trong
      dtPopulateSels(); renderThuTable();
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
  trash       = load('trash_v1', []);
  invoices    = load('inv_v3', []);
  ungRecords  = load('ung_v1', []);
  ccData      = load('cc_v2', []);
  tbData      = load('tb_v1', []);
  hopDongData      = load('hopdong_v1',  {});
  thuRecords       = load('thu_v1',      []);
  thauPhuContracts = load('thauphu_v1',  []);
  projects         = load('projects_v1', []);
  _migrateProjectDates(); // year → startDate/endDate migration (idempotent)
  if (typeof _migrateChuDauTuFromHopDong === 'function') _migrateChuDauTuFromHopDong(); // backfill chuDauTu từ hopdong_v1.khachHang
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

  await trySyncUsersBeforeAuth();

  if (!initAuth()) return;

  init();

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
