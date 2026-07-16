// datatools.js — Quản lý dữ liệu: JSON backup/restore + Xóa năm + Reset toàn bộ
// Load order: sau nhapxuat.js

'use strict';

// ══════════════════════════════════════════════════════════════
// [1] MISC
// ══════════════════════════════════════════════════════════════

function openDeleteModal() {
  toast('Tính năng Xóa Dữ Liệu đã bị tắt.', 'error');
}

// ══════════════════════════════════════════════════════════════
// [2] DATA MANAGEMENT — Xóa theo năm / Reset toàn bộ
// ══════════════════════════════════════════════════════════════

// Confirm modal yêu cầu gõ "DELETE"
function _showDeleteConfirm(title, bodyHtml, onConfirm) {
  const existing = document.getElementById('_del-confirm-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = '_del-confirm-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998;'
    + 'display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML = `
    <div style="background:var(--bs-body-bg);border-radius:10px;padding:24px;max-width:420px;width:100%;
                box-shadow:0 8px 32px rgba(0,0,0,.28);font-family:inherit">
      <div style="font-size:15px;font-weight:700;color:var(--bs-danger);margin-bottom:10px">${title}</div>
      <div style="font-size:13px;color:var(--bs-body-color);line-height:1.65;margin-bottom:16px">${bodyHtml}</div>
      <div style="margin-bottom:16px">
        <label style="font-size:12px;color:var(--bs-secondary-color);display:block;margin-bottom:6px">
          Gõ <strong>DELETE</strong> để xác nhận:
        </label>
        <input id="_del-inp" type="text" autocomplete="off" placeholder="DELETE"
          style="width:100%;box-sizing:border-box;padding:8px 12px;border:2px solid var(--bs-danger);
                 border-radius:6px;font-size:14px;font-family:monospace;letter-spacing:2px;outline:none;background:var(--bs-body-bg);color:var(--bs-body-color)">
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button id="_del-cancel" style="padding:8px 18px;border:1px solid var(--bs-border-color);border-radius:6px;
          background:var(--bs-tertiary-bg);color:var(--bs-body-color);cursor:pointer;font-size:13px">Huỷ</button>
        <button id="_del-ok" style="padding:8px 18px;border:none;border-radius:6px;
          background:var(--bs-danger);color:#fff;cursor:pointer;font-size:13px;font-weight:700;opacity:.45" disabled>
          Xoá
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const inp    = overlay.querySelector('#_del-inp');
  const okBtn  = overlay.querySelector('#_del-ok');
  const canBtn = overlay.querySelector('#_del-cancel');

  inp.addEventListener('input', () => {
    const ok = inp.value.trim() === 'DELETE';
    okBtn.disabled = !ok;
    okBtn.style.opacity = ok ? '1' : '.45';
  });
  canBtn.addEventListener('click', () => overlay.remove());
  // [CHẶN ĐÓNG NHẦM] Đã bỏ đóng khi click nền — popup xác nhận chỉ đóng bằng nút Hủy để tránh thao tác nhầm
  okBtn.addEventListener('click', () => {
    if (inp.value.trim() !== 'DELETE') return;
    overlay.remove();
    onConfirm();
  });
  setTimeout(() => inp.focus(), 60);
}

// Helper: cập nhật cats global + _mem + IDB
function _saveCatKey(catsKey, lsKey, arr) {
  if (typeof cats !== 'undefined' && cats) cats[catsKey] = arr;
  if (typeof _memSet === 'function') _memSet(lsKey, arr); // ghi _mem + IDB (hoặc LS nếu LS-only)
  else if (typeof _dbSave === 'function') _dbSave(lsKey, arr).catch(() => {}); // fallback
}

// ── Reset toàn bộ dữ liệu ────────────────────────────────────

function toolResetAll() {
  // Bảo vệ offline — reset khi offline có thể mất cloud data vĩnh viễn
  if (!navigator.onLine) {
    toast('🔴 Không có mạng — không thể reset (cần online để xóa dữ liệu cloud)', 'error');
    return;
  }
  if (typeof isSyncing === 'function' && isSyncing()) {
    toast('⚠️ Đang đồng bộ dữ liệu, vui lòng chờ', 'error'); return;
  }
  _showDeleteConfirm(
    '<span class="material-symbols-outlined msi-gap">warning</span>Reset toàn bộ dữ liệu',
    `Thao tác sẽ <b>xóa TOÀN BỘ</b> dữ liệu:<br>
     hóa đơn, chấm công, tiền ứng, thu tiền, hợp đồng, danh mục, thiết bị...<br><br>
     • App tự động backup trước khi reset.<br>
     • <b>Không thể hoàn tác</b> sau khi xác nhận.<br>
     • Cloud sẽ được đồng bộ trạng thái trống.`,
    _doResetAll
  );
}

async function _doResetAll() {
  if (typeof showSyncBanner === 'function') showSyncBanner('⏳ Đang reset toàn bộ dữ liệu...');
  try {
    // 1. Auto-backup
    if (typeof _snapshotNow === 'function') _snapshotNow('pre-reset-all');

    // 2. Thu thập tất cả năm TRƯỚC KHI xóa
    const yearsToWipe = (typeof _getAllLocalYears === 'function')
      ? _getAllLocalYears()
      : [String(new Date().getFullYear())];

    // ── QUAN TRỌNG: soft-delete trước khi push Firebase ──────────
    // Vấn đề nếu push [] rỗng: mergeUnique(localData, []) = localData không đổi
    // → thiết bị khác (Chrome thường) F5 xong vẫn thấy đầy đủ dữ liệu
    // Fix: ghi soft-deleted records (deletedAt = now) lên Firebase trước
    // → mergeUnique thấy bản Firebase có updatedAt mới hơn → overwrite local deletedAt
    // → UI ẩn hết bản ghi → thiết bị khác thấy trống
    const now   = Date.now();
    const devId = (typeof DEVICE_ID !== 'undefined') ? DEVICE_ID : '';
    const _softDelArr = key => (typeof load === 'function' ? load(key, []) : []).map(r =>
      r.deletedAt ? r : { ...r, deletedAt: now, updatedAt: now, deviceId: devId }
    );

    // 3. Ghi soft-deleted records giao dịch vào _mem (tạm) để fbYearCatPayload() đọc được.
    //    Không ghi IDB vì step 8 sẽ clear IDB; chỉ cần _mem cho payload đọc.
    //    (hopDong / thauPhu / danh mục được xử lý ở phần META-prep bên dưới.)
    ['inv_v3','ung_v1','cc_v2','tb_v1','thu_v1'].forEach(k => {
      _mem[k] = _softDelArr(k);
    });

    // Reset các global trong bộ nhớ (UI đọc trực tiếp các biến này)
    if (typeof cats !== 'undefined' && cats) {
      cats.congTrinh  = [];
      cats.loaiChiPhi = [];
      cats.nhaCungCap = [];
      cats.nguoiTH    = [];
      cats.thauPhu    = [];
      cats.congNhan   = [];
      if ('tbTen' in cats) cats.tbTen = [];
    }
    if (typeof projects !== 'undefined') projects = [];
    if (typeof thauPhuContracts !== 'undefined') thauPhuContracts = [];

    // ── Chuẩn bị _mem rỗng/tombstone cho phần META trước khi push ──
    // Danh mục dạng mảng-chuỗi không có soft-delete → set [] để cloud xóa sạch.
    ['cat_ct','cat_loai','cat_ncc','cat_nguoi',
     'cat_tp','cat_cn','cat_tbteb'].forEach(k => { _mem[k] = []; });
    _mem['projects_v1'] = [];
    _mem['thauphu_v1']  = [];
    _mem['hopdong_v1']  = {};
    _mem['cat_ct_years'] = {};   // năm theo công trình
    _mem['cat_cn_roles'] = {};   // vai trò công nhân

    // cat_items_v1 là nguồn gốc khiến danh mục "hồi sinh" sau reset+sync.
    // Soft-delete từng item (isDeleted:true) để thiết bị khác pull về thấy đã xóa
    // và không rebuild lại mảng. Sau push sẽ xóa local về {}.
    const _existCatItems = load('cat_items_v1', {});
    if (Object.keys(_existCatItems).length) {
      const _softCatItems = {};
      Object.entries(_existCatItems).forEach(([type, arr]) => {
        _softCatItems[type] = (arr || []).map(item =>
          item.isDeleted ? item : { ...item, isDeleted: true, updatedAt: now }
        );
      });
      _mem['cat_items_v1'] = _softCatItems;
    } else {
      _mem['cat_items_v1'] = {};
    }

    // 4. Push tombstones lên Firebase theo CẤU TRÚC MỚI (B), TRƯỚC KHI xóa local.
    //    Vì pull đời mới = REPLACE local bằng cloud, nên ghi tombstone/rỗng lên cloud
    //    sẽ khiến mọi thiết bị khác pull về thành trống. Ghi THẲNG bằng fsSet
    //    (không qua pushChanges) để tránh merge kéo lại bản ghi cũ từ cloud.
    if (typeof fbReady === 'function' && fbReady() &&
        typeof fsSet === 'function' && typeof fbDocYearCat === 'function') {
      if (typeof showSyncBanner === 'function') showSyncBanner('⏳ Đang xóa dữ liệu trên Cloud...');
      try {
        // 4a. Mỗi năm × mỗi hạng mục — payload đọc soft-deleted records từ _mem
        for (const yr of yearsToWipe) {
          const yi = parseInt(yr);
          for (const { cat, key, dateField } of _YEAR_CATS) {
            await fsSet(fbDocYearCat(yi, cat), fbYearCatPayload(yi, key, dateField));
          }
        }
        // 4b. Meta công trình / danh mục / hợp đồng (đã set rỗng-tombstone trong _mem)
        //     meta_tai_khoan KHÔNG đụng tới — giữ nguyên tài khoản đăng nhập.
        await fsSet(fbDocMetaCT(), fbMetaCTPayload());
        await fsSet(fbDocMetaDM(), fbMetaDMPayload());
        await fsSet(fbDocMetaHD(), fbMetaHDPayload());

        // 4c. Dọn doc rác cấu trúc cũ (y2025/y2026 gộp, cats, V2 lạc...)
        const nDel = (typeof _wipeOrphanCloudDocs === 'function')
          ? await _wipeOrphanCloudDocs() : 0;
        console.log('[ResetAll] ✅ Cloud B-wiped, xóa', nDel, 'doc rác — years:', yearsToWipe.join(', '));
      } catch (e) {
        console.warn('[ResetAll] Cloud wipe lỗi (bỏ qua):', e);
      }
    }

    // Chặn pull trong 5 phút sau reset — lưu vào localStorage để sống qua F5
    // (biến _blockPullUntil trong bộ nhớ sẽ mất khi reload, cần persist LS)
    const _blockTs = Date.now() + 5 * 60 * 1000;
    _blockPullUntil = _blockTs;
    localStorage.setItem('_blockPullUntil', String(_blockTs));
    console.log('[ResetAll] Pull bị chặn 5 phút để tránh cloud ghi đè local trống');

    // 5. Xóa data globals
    if (typeof invoices          !== 'undefined') invoices          = [];
    if (typeof ungRecords        !== 'undefined') ungRecords        = [];
    if (typeof ccData            !== 'undefined') ccData            = [];
    if (typeof tbData            !== 'undefined') tbData            = [];
    if (typeof thuRecords        !== 'undefined') thuRecords        = [];
    if (typeof thauPhuContracts  !== 'undefined') thauPhuContracts  = [];
    if (typeof hopDongData       !== 'undefined') hopDongData       = {};
    if (typeof trash             !== 'undefined') trash             = [];

    // 6. Xóa cats
    if (typeof cats !== 'undefined' && cats) {
      cats.congTrinh  = [];
      cats.nhaCungCap = [];
      cats.nguoiTH    = [];
      cats.loaiChiPhi = [];
      cats.thauPhu    = [];
      cats.congNhan   = [];
      if ('tbTen' in cats) cats.tbTen = [];
    }

    // 7. Xóa _mem về trạng thái trống (IDB sẽ bị clear ở bước 8)
    ['inv_v3','ung_v1','cc_v2','tb_v1','thu_v1','thauphu_v1','trash_v1',
     'cat_ct','cat_loai','cat_ncc','cat_nguoi','cat_tp','cat_cn','cat_tbteb',
     'projects_v1']
      .forEach(k => { _mem[k] = []; });
    _mem['hopdong_v1']   = {};
    _mem['cat_items_v1'] = {}; // FIX: xóa local sau khi đã push tombstones lên cloud
    if (typeof projects !== 'undefined') projects = [];

    // Xóa LS-only keys — những key này không nằm trong IDB nên phải xóa tay
    // Nếu bỏ sót: danh mục công trình / role công nhân vẫn còn sau reset
    ['cat_ct_years', 'cat_cn_roles'].forEach(k => {
      localStorage.removeItem(k);
      delete _mem[k];
    });
    if (typeof cats !== 'undefined' && cats) {
      cats.congTrinhYears = {};
    }
    if (typeof cnRoles !== 'undefined') cnRoles = {};

    // 8. Xóa IDB tables
    if (typeof db !== 'undefined' && db) {
      try {
        await Promise.all([
          db.invoices   ? db.invoices.clear()   : Promise.resolve(),
          db.attendance ? db.attendance.clear() : Promise.resolve(),
          db.equipment  ? db.equipment.clear()  : Promise.resolve(),
          db.ung        ? db.ung.clear()        : Promise.resolve(),
          db.revenue    ? db.revenue.clear()    : Promise.resolve(),
          db.categories ? db.categories.clear() : Promise.resolve(),
          db.settings   ? db.settings.clear()   : Promise.resolve(),
        ]);
      } catch (e) { console.warn('[ResetAll] IDB clear lỗi:', e); }
    }

    // QUAN TRỌNG: Sau khi clear IDB, ghi lại [] cho tất cả cat keys.
    // Nếu không làm bước này, F5 sẽ thấy IDB rỗng → load() dùng DEFAULTS
    // → cat_tbteb hồi sinh TB_TEN_MAY, cat_ct hồi sinh DEFAULTS.congTrinh, v.v.
    if (typeof _dbSave === 'function') {
      try {
        await Promise.all([
          'cat_ct','cat_loai','cat_ncc','cat_nguoi','cat_tp','cat_cn','cat_tbteb',
          'projects_v1'
        ].map(k => _dbSave(k, [])));
        await _dbSave('hopdong_v1',   {});
        await _dbSave('cat_items_v1', {}); // FIX: ghi rỗng vào IDB; F5 load về {} không dùng defaults
      } catch (e) { console.warn('[ResetAll] Ghi IDB rỗng lỗi:', e); }
    }

    if (typeof hideSyncBanner === 'function') hideSyncBanner();
    if (typeof _resetPending === 'function') _resetPending(); // badge về 0 sau reset
    toast('✅ Đã reset toàn bộ dữ liệu', 'success');

    // 9. Refresh UI
    if (typeof _refreshAllTabs === 'function') _refreshAllTabs();
    else if (typeof renderDanhMuc === 'function') renderDanhMuc();

  } catch (e) {
    if (typeof hideSyncBanner === 'function') hideSyncBanner();
    console.error('[ResetAll] Lỗi:', e);
    toast('❌ Lỗi khi reset: ' + (e.message || String(e)), 'error');
  }
}

// ═════════════════════════════════════
// [4] DASHBOARD
// ═════════════════════════════════════

// Dashboard CT filter (dùng trong page-dashboard)
var selectedCT = '';

// Trạng thái tuần đang chọn trong chế độ 1 năm
// Key = Sunday ISO (YYYY-MM-DD), reset khi đổi năm/filter
var selectedDashboardWeekKey = '';
var _dashLastYr = -1; // theo dõi năm lần render trước để reset tuần

// ── Bộ lọc time-frame cho biểu đồ tuần ──────────────────────
// 'all' = toàn bộ năm | '12' = 12 tuần | '8' = 8 tuần | '4' = 4 tuần
// Mặc định '8': cột rộng, dễ nhìn cho màn hình thông thường
var _dbWeekFilter        = '8';

// Cache dữ liệu weekly để filter/select tuần không cần chạy lại full renderDashboard
var _dbLastWeeklyYr      = 0;
var _dbLastWeeklyInvData = null;
var _dbLastWeeklyUngData = null;
// Chế độ biểu đồ tuần hiện tại: 'single' (1 năm) | 'multi' (nhiều năm, gộp 52 tuần)
// + cache danh sách năm cho chế độ multi để nút filter tuần re-render đúng
var _dbChartMode         = 'single';
var _dbLastWeeklyYears   = [];

// ══════════════════════════════════════════════════════════════
// [MODULE: DASHBOARD] — KPI · Bar chart · Pie · Top5 · By CT
// Tìm nhanh: Ctrl+F → "MODULE: DASHBOARD"
// ══════════════════════════════════════════════════════════════

function renderDashboard() {
  const ay = typeof activeYears !== 'undefined' ? activeYears : new Set();
  const isSingleYear = ay.size === 1;
  const yr = isSingleYear ? [...ay][0] : 0;
  const yrLabel = ay.size === 0 ? 'Tất cả năm'
                : ay.size === 1 ? `Năm ${yr}`
                : 'Năm ' + [...ay].sort((a,b)=>a-b).join(', ');

  _dbPopulateCTFilter();

  // Reset trạng thái khi đổi chế độ năm hoặc đổi sang năm khác
  const modeKey = isSingleYear ? yr : 0;
  if (modeKey !== _dashLastYr) {
    selectedDashboardWeekKey = '';
    _dbWeekFilter = 'all'; // về "Toàn bộ năm" khi đổi năm
    _dashLastYr = modeKey;
  }

  const barTitle = document.getElementById('db-bar-title');
  const pieTitle = document.getElementById('db-pie-title');

  // Dữ liệu hóa đơn trong năm (không filter CT cho KPI tổng quan)
  const dataYear   = getInvoicesCached().filter(i => inActiveYear(i.ngay));
  // Dữ liệu hóa đơn đã filter CT (cho Top5, bảng chi tiết)
  const dataDetail = getInvoicesCached().filter(i =>
    inActiveYear(i.ngay) && (!selectedCT || resolveProjectName(i) === selectedCT)
  );

  // Tiền ứng trong năm (dùng cho cả 2 chế độ)
  const ungAllYear = (typeof ungRecords !== 'undefined' ? ungRecords : [])
    .filter(r => !r.deletedAt && inActiveYear(r.ngay));

  // Tổng hợp đồng thầu phụ trong năm: giaTri + phatSinh, bỏ deletedAt
  const thauPhuTotal = (typeof thauPhuContracts !== 'undefined' ? thauPhuContracts : [])
    .filter(c => !c.deletedAt && c.ngay && inActiveYear(c.ngay))
    .reduce((s, c) => s + (c.giaTri || 0) + (c.phatSinh || 0), 0);

  const hasData = dataYear.length > 0 || (isSingleYear && ungAllYear.length > 0);

  if (!hasData) {
    ['db-kpi-row','db-bar-chart','db-pie-chart','db-top5','db-ung-ct','db-tb-ct'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<div class="db-empty">Chưa có dữ liệu cho ' + yrLabel + '</div>';
    });
    if (barTitle) barTitle.textContent = isSingleYear ? 'Chi Phí Theo Tuần' : 'Chi Phí TB / Tháng';
    if (pieTitle) pieTitle.textContent = 'Tỷ Trọng Chi Phí';
    return;
  }

  if (isSingleYear) {
    // ── CHẾ ĐỘ 1 NĂM: biểu đồ theo tuần ──────────────────────
    if (barTitle) barTitle.textContent = 'Chi Phí Theo Tuần';
    if (pieTitle) pieTitle.textContent = 'Tỷ Trọng Chi Phí';

    // Cache data để filter/select tuần không cần chạy lại renderDashboard
    _dbChartMode         = 'single';
    _dbLastWeeklyYr      = yr;
    _dbLastWeeklyInvData = dataYear;
    _dbLastWeeklyUngData = ungAllYear;

    _dbKPIWeekly(yr, dataYear, ungAllYear, thauPhuTotal);
    _dbBarChartWeekly(yr, dataYear, ungAllYear);
    _dbPieChartWeekly(dataYear, ungAllYear);
  } else {
    // ── CHẾ ĐỘ NHIỀU NĂM / TẤT CẢ: biểu đồ theo tuần, gộp 52 tuần xuyên năm ──
    if (barTitle) barTitle.textContent = 'Chi Phí Theo Tuần';
    if (pieTitle) pieTitle.textContent = 'Tỷ Trọng Chi Phí';

    // Danh sách năm được chọn (rỗng = "Tất cả năm" → hàm chart tự suy từ dữ liệu)
    const selectedYears = [...ay].sort((a, b) => a - b);

    // Cache cho nút filter tuần re-render đúng chế độ multi
    _dbChartMode         = 'multi';
    _dbLastWeeklyYears   = selectedYears;
    _dbLastWeeklyInvData = dataYear;
    _dbLastWeeklyUngData = ungAllYear;

    _dbKPI(dataYear, yr, thauPhuTotal);
    _dbBarChartWeekly52(selectedYears, dataYear, ungAllYear);
    _dbPieChart(dataYear);
  }

  // Phần chi tiết theo CT — luôn hiển thị
  _dbTop5(dataDetail);
  _dbUngByCT();
  _dbTBByCT();
  renderCtPage();
}

// ── Populate CT filter dropdown (Dashboard) ────────────────────
function _dbPopulateCTFilter() {
  const sel = document.getElementById('db-filter-ct');
  if (!sel) return;
  sel.innerHTML = _buildProjFilterOpts(selectedCT, { includeCompany: false, placeholder: '-- Tất cả công trình --' });
}

// ── KPI Cards ─────────────────────────────────────────────────
function _dbKPI(data, yr, thauPhuTotal) {
  thauPhuTotal = thauPhuTotal || 0;
  const invTotal = data.reduce((s, i) => s + (i.thanhtien || i.tien || 0), 0);
  const total    = invTotal + thauPhuTotal;
  const months   = new Set(data.map(i => i.ngay?.slice(0,7))).size;
  const avgMonth = months ? Math.round(total / months) : 0;
  const maxInv   = data.reduce((mx, i) => (i.thanhtien||i.tien||0) > (mx.thanhtien||mx.tien||0) ? i : mx, data[0]);
  const ctSet    = new Set(data.map(i => resolveProjectName(i)).filter(Boolean));
  const tpSub    = thauPhuTotal > 0 ? ' + TP ' + fmtS(thauPhuTotal) : '';

  const cards = [
    { label:'Tổng Chi Phí ' + (yr||''), val: fmtM(total),   sub: data.length + ' HĐ' + tpSub,    cls:'accent-gold'  },
    { label:'TB / Tháng',               val: fmtM(avgMonth), sub: months + ' tháng có phát sinh', cls:'accent-blue'  },
    { label:'HĐ Lớn Nhất',              val: fmtM(maxInv.thanhtien||maxInv.tien||0),
                                         sub: (maxInv.nd||maxInv.loai||'').slice(0,30),            cls:'accent-red'   },
    { label:'Công Trình',               val: ctSet.size,     sub: 'đang theo dõi năm ' + (yr||''),cls:'accent-green' },
  ];

  document.getElementById('db-kpi-row').innerHTML = cards.map(k =>
    `<div class="db-kpi-card card shadow-sm ${k.cls}">
       <div class="db-kpi-label">${k.label}</div>
       <div class="db-kpi-val">${k.val}</div>
       <div class="db-kpi-sub">${k.sub}</div>
     </div>`
  ).join('');
}

// ── Bar Chart theo tháng (SVG) — luôn hiện đủ T1→T12 ─────────
function _dbBarChart(data) {
  const byMonth = {};
  data.forEach(i => {
    const m = i.ngay?.slice(0,7);
    if (!m) return;
    byMonth[m] = (byMonth[m] || 0) + (i.thanhtien || i.tien || 0);
  });

  const _ay = typeof activeYears !== 'undefined' ? activeYears : new Set();
  const _singleYr = _ay.size === 1 ? [..._ay][0] : 0;
  const yr = _singleYr || new Date().getFullYear();
  const months12 = Array.from({length: 12}, (_, k) =>
    `${yr}-${String(k + 1).padStart(2, '0')}`
  );

  let vals;
  if (_ay.size !== 1) {
    // Multi-year → tính trung bình theo tháng, chỉ chia cho năm đã qua tháng đó
    const todayD   = new Date();
    const todayYr  = todayD.getFullYear();
    const todayMon = todayD.getMonth() + 1;
    const sortedYears = [..._ay].sort((a, b) => a - b);
    vals = months12.map((_, i) => {
      const monthNum = i + 1;
      const monthStr = String(monthNum).padStart(2, '0');
      let total = 0;
      let denom = 0;
      sortedYears.forEach(yr => {
        // Bỏ qua tháng chưa xảy ra trong năm đang chọn
        if (yr > todayYr) return;
        if (yr === todayYr && monthNum > todayMon) return;
        total += byMonth[`${yr}-${monthStr}`] || 0;
        denom++;
      });
      return denom > 0 ? Math.round(total / denom) : 0;
    });
  } else {
    vals = months12.map(m => byMonth[m] || 0);
  }

  const maxVal = Math.max(...vals, 1);
  const H      = 160;
  const colW   = 40;
  const gap    = 5;
  const svgW   = 12 * (colW + gap);

  const bars = months12.map((m, i) => {
    const v   = vals[i];
    const h   = Math.round((v / maxVal) * H);
    const cx  = i * (colW + gap);
    const y   = H - h;
    const amt = v >= 1e9 ? (v/1e9).toFixed(1)+'tỷ'
              : v >= 1e6 ? Math.round(v/1e6)+'tr' : (v ? fmtS(v) : '');
    return `
      <g>
        <rect x="${cx}" y="${y}" width="${colW}" height="${Math.max(h, 2)}"
              rx="3" fill="${v ? 'var(--bs-warning)' : 'var(--bs-border-color)'}" opacity="${v ? '.85' : '.35'}">
          <title>T${i+1}: ${fmtM(v)}${_ay.size !== 1 ? ' (TB/năm)' : ''}</title>
        </rect>
        <text x="${cx + colW/2}" y="${y - 4}" text-anchor="middle"
              font-size="9" fill="var(--bs-secondary-color)">${h > 14 ? amt : ''}</text>
        <text x="${cx + colW/2}" y="${H + 14}" text-anchor="middle"
              font-size="9" fill="var(--bs-secondary-color)">T${i+1}</text>
      </g>`;
  }).join('');

  document.getElementById('db-bar-chart').innerHTML =
    `<svg viewBox="0 -10 ${svgW} ${H + 28}" width="100%" class="db-pie-svg"
          style="min-width:${Math.min(svgW,300)}px;max-width:100%">
       ${bars}
       <line x1="0" y1="${H}" x2="${svgW}" y2="${H}" stroke="var(--bs-border-color)" stroke-width="1"/>
     </svg>`;
}

// ── Pie Chart tỷ trọng (SVG) ─────────────────────────────────
function _dbPieChart(data) {
  // Bảng màu biểu đồ tròn — đã hạ tông sang tông trầm/đất, dịu mắt & chuyên nghiệp hơn
  const COLORS = ['#c8a14a','#5a9e78','#5b86b3','#c46a5e','#8a6fa8','#c2895a','#9aa0a6'];
  const KEY_TYPES = ['Nhân Công','Vật Liệu XD','Thầu Phụ','Sắt Thép','Đổ Bê Tông'];

  const byType = {};
  data.forEach(i => {
    const k = KEY_TYPES.includes(i.loai) ? i.loai : 'Khác';
    byType[k] = (byType[k] || 0) + (i.thanhtien || i.tien || 0);
  });

  const total   = Object.values(byType).reduce((s,v) => s+v, 0);
  const entries = Object.entries(byType)
    .sort((a,b) => b[1]-a[1])
    .map(([name, val], i) => ({ name, val, pct: val/total, color: COLORS[i % COLORS.length] }));

  const R = 70, CX = 80, CY = 80;
  let startAngle = -Math.PI / 2;
  const slices = entries.map(e => {
    const angle = e.pct * Math.PI * 2;
    const x1 = CX + R * Math.cos(startAngle);
    const y1 = CY + R * Math.sin(startAngle);
    startAngle += angle;
    const x2 = CX + R * Math.cos(startAngle);
    const y2 = CY + R * Math.sin(startAngle);
    const large = angle > Math.PI ? 1 : 0;
    return `<path d="M${CX},${CY} L${x1.toFixed(1)},${y1.toFixed(1)}
              A${R},${R} 0 ${large},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z"
              fill="${e.color}" stroke="#fff" stroke-width="2">
              <title>${e.name}: ${Math.round(e.pct*100)}%</title>
            </path>`;
  }).join('');

  const legend = entries.map(e =>
    `<div class="db-legend-row">
       <div class="db-legend-dot" style="background:${e.color}"></div>
       <span style="flex:1;color:var(--bs-secondary-color)">${e.name}</span>
       <span class="db-legend-pct" style="color:${e.color}">${Math.round(e.pct*100)}%</span>
     </div>`
  ).join('');

  document.getElementById('db-pie-chart').innerHTML =
    `<svg viewBox="0 0 160 160" width="140" height="140" class="db-pie-svg">${slices}</svg>
     <div class="db-legend">${legend}</div>`;
}

// ══════════════════════════════════════════════════════════════
// WEEKLY DASHBOARD (chế độ 1 năm)
// Dùng helpers từ chamcong.core.js: snapToSunday, ccSaturdayISO,
// weekLabel, viShort, isoFromParts — chỉ gọi tại runtime (an toàn)
// ══════════════════════════════════════════════════════════════

// Trả về mảng { sun, sat, key } cho TẤT CẢ tuần trong năm yr
// Tuần CN → T7, đúng chuẩn Chấm Công
function _dbGetWeeksInYear(yr) {
  const jan1    = new Date(yr, 0, 1);
  const firstSun = new Date(yr, 0, 1 - jan1.getDay()); // CN đầu tiên trước/bằng Jan 1
  const dec31   = new Date(yr, 11, 31);
  const weeks   = [];
  let sun = new Date(firstSun);
  while (sun <= dec31) {
    const sunISO = isoFromParts(sun.getFullYear(), sun.getMonth()+1, sun.getDate());
    const sat    = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + 6);
    const satISO = isoFromParts(sat.getFullYear(), sat.getMonth()+1, sat.getDate());
    weeks.push({ sun: sunISO, sat: satISO, key: sunISO });
    sun = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + 7);
  }
  return weeks;
}

// Tính chi phí theo tuần từ hóa đơn + tiền ứng
// Trả về { [sunISO]: { inv, ungTP, ungNCC, total, byCT:{[ctName]:number} } }
// byCT: breakdown theo công trình từ hóa đơn (dùng cho tooltip + heatmap)
function _dbCalcWeeklyData(invoiceData, ungData) {
  // Tập hợp tên NCC đã có ứng riêng → không tính lại trong HĐ để tránh cộng đúp
  const knownNCC = new Set(
    (typeof ungRecords !== 'undefined' ? ungRecords : [])
      .filter(r => !r.deletedAt && r.loai === 'nhacungcap' && r.tp)
      .map(r => (r.tp || '').trim().toUpperCase())
  );

  const result = {};
  function ensure(k) {
    if (!result[k]) result[k] = { inv: 0, ungTP: 0, ungNCC: 0, total: 0, byCT: {} };
    return result[k];
  }
  invoiceData.forEach(i => {
    if (!i.ngay) return;
    const amt = i.thanhtien || i.tien || 0;
    if (!amt) return;
    // Bỏ qua HĐ có NCC khớp với nhà cung cấp đang được theo dõi qua ứng NCC
    if (i.ncc && knownNCC.has((i.ncc || '').trim().toUpperCase())) return;
    const w = ensure(snapToSunday(i.ngay));
    w.inv += amt; w.total += amt;
    const ct = resolveProjectName(i) || '(Không rõ)';
    w.byCT[ct] = (w.byCT[ct] || 0) + amt;
  });
  ungData.forEach(r => {
    if (!r.ngay || (r.loai !== 'thauphu' && r.loai !== 'nhacungcap')) return;
    const amt = r.tien || 0;
    if (!amt) return;
    const w = ensure(snapToSunday(r.ngay));
    if (r.loai === 'thauphu') { w.ungTP += amt; w.total += amt; }
    else { w.ungNCC += amt; w.total += amt; } // NCC tính vào tổng, HĐ tương ứng đã bị loại
  });
  return result;
}

// ── KPI Cards (chế độ tuần) ───────────────────────────────────
function _dbKPIWeekly(yr, invoiceData, ungData, thauPhuTotal) {
  thauPhuTotal = thauPhuTotal || 0;
  const totalInv  = invoiceData.reduce((s, i) => s + (i.thanhtien || i.tien || 0), 0);
  const totalCost = totalInv + thauPhuTotal;

  const weeklyData = _dbCalcWeeklyData(invoiceData, ungData);

  // Tuần KPI:
  // - Nếu đang xem đúng năm hiện tại → LUÔN hiển thị tuần hiện tại (dù tổng = 0)
  //   vì tuần mới bắt đầu chưa có dữ liệu là bình thường
  // - Nếu xem năm khác (quá khứ/tương lai) → fallback sang tuần mới nhất có phát sinh
  const today    = new Date();
  const todayISO = isoFromParts(today.getFullYear(), today.getMonth()+1, today.getDate());
  const currKey  = snapToSunday(todayISO);
  const isCurrentYear = (today.getFullYear() === yr);
  let weekKPIKey, weekKPITotal;

  if (isCurrentYear) {
    // Luôn chỉ đến tuần đang chạy — kể cả khi = 0 đ
    weekKPIKey   = currKey;
    weekKPITotal = (weeklyData[currKey] || { total: 0 }).total;
  } else {
    // Năm khác → tuần mới nhất có phát sinh
    const keys = Object.keys(weeklyData).filter(k => weeklyData[k].total > 0).sort();
    weekKPIKey   = keys.length ? keys[keys.length - 1] : currKey;
    weekKPITotal = weekKPIKey && weeklyData[weekKPIKey] ? weeklyData[weekKPIKey].total : 0;
  }

  // Tuần chi cao nhất
  let maxWeekKey = '', maxWeekTotal = 0;
  Object.entries(weeklyData).forEach(([k, v]) => {
    if (v.total > maxWeekTotal) { maxWeekTotal = v.total; maxWeekKey = k; }
  });

  // Số công trình có phát sinh
  const ctSet = new Set();
  invoiceData.forEach(i => { const n = resolveProjectName(i); if (n) ctSet.add(n); });
  ungData.forEach(r => { const n = resolveProjectName(r); if (n) ctSet.add(n); });

  const weekKPISub = weekKPIKey ? 'Tuần ' + weekLabel(weekKPIKey) : 'Chưa có dữ liệu';
  const maxWeekSub = maxWeekKey ? weekLabel(maxWeekKey) : '—';

  const cards = [
    { label: 'Tổng Chi Phí ' + yr,   val: fmtM(totalCost),    sub: 'HĐ + HĐ Thầu Phụ',       cls: 'accent-gold'  },
    { label: 'Tuần Chi Cao Nhất',     val: fmtM(maxWeekTotal), sub: maxWeekSub,                 cls: 'accent-red'   },
    { label: 'Công Trình',            val: ctSet.size,         sub: 'phát sinh năm ' + yr,      cls: 'accent-green' },
  ];

  document.getElementById('db-kpi-row').innerHTML = cards.map(k =>
    `<div class="db-kpi-card card shadow-sm ${k.cls}">
       <div class="db-kpi-label">${k.label}</div>
       <div class="db-kpi-val">${k.val}</div>
       <div class="db-kpi-sub">${k.sub}</div>
     </div>`
  ).join('');
}

// ── Biểu đồ cột chồng theo tuần (SVG) ────────────────────────
// Hỗ trợ bộ lọc thời gian: 'all' | '12' | '8' | '4'
// Nhãn trục X: "Tuần N" thay vì ngày/tháng
// Tooltip: hiện top-3 CT chi nhiều nhất tuần đó
// Section tóm tắt 4 tuần gần nhất (card lớn, chữ 24px)
function _dbBarChartWeekly(yr, invoiceData, ungData) {
  const C_INV = '#c2913a'; // amber — Hóa đơn / CP-HĐ
  const C_TP  = '#8B4513'; // nâu   — Ứng thầu phụ
  const C_NCC = '#8e9ca6'; // xám   — Ứng nhà cung cấp

  const allWeeks   = _dbGetWeeksInYear(yr);
  const weeklyData = _dbCalcWeeklyData(invoiceData, ungData);

  // Tính index tuần hiện tại trong mảng allWeeks
  const today      = new Date();
  const todayISO   = isoFromParts(today.getFullYear(), today.getMonth()+1, today.getDate());
  const currSunKey = snapToSunday(todayISO);
  const currWkIdx  = allWeeks.findIndex(w => w.key === currSunKey);
  // endIdx = tuần hiện tại nếu có, fallback = cuối mảng
  const endIdx     = currWkIdx >= 0 ? currWkIdx : allWeeks.length - 1;

  // Áp dụng bộ lọc thời gian
  let startIdx = 0;
  if (_dbWeekFilter === '4')  startIdx = Math.max(0, endIdx - 3);
  if (_dbWeekFilter === '8')  startIdx = Math.max(0, endIdx - 7);
  if (_dbWeekFilter === '12') startIdx = Math.max(0, endIdx - 11);

  // Dải tuần sẽ hiển thị + index tuyệt đối (để tính số tuần trong năm)
  const dispWeeks   = allWeeks.slice(startIdx, endIdx + 1);
  const dispIndices = dispWeeks.map((_, i) => startIdx + i);
  const dispVals    = dispWeeks.map(w => weeklyData[w.key] || { inv:0, ungTP:0, ungNCC:0, total:0, byCT:{} });
  const maxVal      = Math.max(...dispVals.map(v => v.total), 1);
  const n           = dispWeeks.length;

  // colW/gap thích nghi theo số cột
  const colW = n <= 4 ? 52 : n <= 8 ? 46 : n <= 12 ? 34 : 22;
  const gap  = n <= 4 ? 8  : n <= 8 ? 6  : n <= 12 ? 5  : 3;
  const H    = 130;          // chiều cao vẽ cột (giảm từ 160 → 130 cho chart nhỏ gọn hơn)
  const H_SCALE = H - 18;   // chiều cao scale thực: dành 18px headroom trên đỉnh cho nhãn số
  const svgW = n * (colW + gap);

  // Nhãn: mỗi 1 tuần (<=8), mỗi 2 tuần (>8)
  const lblStep = n <= 8 ? 1 : 2;

  const bars = dispWeeks.map((w, i) => {
    const v      = dispVals[i];
    const absIdx = dispIndices[i];
    const wkNum  = absIdx + 1;          // số tuần 1-based trong năm
    const cx     = i * (colW + gap);
    const isSel  = w.key === selectedDashboardWeekKey;
    const lbl    = (i % lblStep === 0) ? `T${wkNum}` : '';
    const lblColor   = isSel ? '#c2895a' : '#333';
    const lblWeight  = isSel ? '700' : '600';

    // Top-3 CT cho footer tooltip
    const top3Lines = Object.entries(v.byCT || {})
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([ct, amt]) => `  • ${ct.slice(0,22)}: ${amt>=1e6?Math.round(amt/1e6)+'tr':fmtM(amt)}`)
      .join('\n');

    if (!v.total) {
      return `<g onclick="_dbSelectWeek('${w.key}')" style="cursor:pointer">
        <rect x="${cx}" y="${H-2}" width="${colW}" height="2" rx="1" fill="var(--bs-border-color)" opacity=".3">
          <title>Tuần ${wkNum} (CN ${viShort(w.sun)} – T7 ${viShort(w.sat)})\nKhông có phát sinh</title>
        </rect>
        <text x="${cx+colW/2}" y="${H+22}" text-anchor="middle" font-size="13" fill="${lblColor}" font-weight="${lblWeight}">${lbl}</text>
      </g>`;
    }

    // MIN_H = 4px: cột vài triệu vẫn thấy bên cạnh cột vài trăm triệu
    const MIN_H = 4;
    const hInv = v.inv    > 0 ? Math.max(MIN_H, Math.round((v.inv    / maxVal) * H_SCALE)) : 0;
    const hTP  = v.ungTP  > 0 ? Math.max(MIN_H, Math.round((v.ungTP  / maxVal) * H_SCALE)) : 0;
    const hNCC = v.ungNCC > 0 ? Math.max(MIN_H, Math.round((v.ungNCC / maxVal) * H_SCALE)) : 0;
    // Chồng từ dưới lên: NCC → TP → INV
    const yNCC = H - hNCC;
    const yTP  = yNCC - hTP;
    const yInv = yTP  - hInv;
    const hTot = hInv + hTP + hNCC || 2;
    const yTop = H - hTot;

    const titleTxt = [
      `Tuần ${wkNum}: CN ${viShort(w.sun)} – T7 ${viShort(w.sat)}`,
      `─────────────────────`,
      `Hóa đơn : ${fmtM(v.inv)}`,
      `Ứng TP  : ${fmtM(v.ungTP)}`,
      `Ứng NCC : ${fmtM(v.ungNCC)}`,
      `Tổng    : ${fmtM(v.total)}`,
      top3Lines ? `\nTop CT:\n${top3Lines}` : ''
    ].filter(Boolean).join('\n');

    // Bỏ hậu tố "tr" — chỉ hiển thị số; giảm font 20%: 13→10px
    const amt       = v.total>=1e9?(v.total/1e9).toFixed(1)+'tỷ':v.total>=1e6?String(Math.round(v.total/1e6)):'';
    const selStroke = isSel ? `stroke="#c2895a" stroke-width="2"` : 'stroke="none"';
    const selBg     = isSel ? `<rect x="${cx-1}" y="0" width="${colW+2}" height="${H}" fill="#c2895a15" rx="2"/>` : '';

    return `<g onclick="_dbSelectWeek('${w.key}')" style="cursor:pointer">
      ${selBg}
      ${hNCC>0 ? `<rect x="${cx}" y="${yNCC}" width="${colW}" height="${hNCC}" fill="${C_NCC}" opacity=".85"/>` : ''}
      ${hTP >0 ? `<rect x="${cx}" y="${yTP}"  width="${colW}" height="${hTP}"  fill="${C_TP}"  opacity=".85"/>` : ''}
      ${hInv>0 ? `<rect x="${cx}" y="${yInv}" width="${colW}" height="${hInv}" fill="${C_INV}" opacity=".85"/>` : ''}
      <rect x="${cx}" y="${yTop}" width="${colW}" height="${hTot}" fill="transparent" ${selStroke} rx="2">
        <title>${titleTxt}</title>
      </rect>
      ${amt && hTot>18 ? `<text x="${cx+colW/2}" y="${yTop < 16 ? yTop+13 : yTop-5}" text-anchor="middle" font-size="10" fill="${yTop < 16 ? '#fff' : '#222'}" font-weight="700">${amt}</text>` : ''}
      <text x="${cx+colW/2}" y="${H+22}" text-anchor="middle" font-size="13" fill="${lblColor}" font-weight="${lblWeight}">${lbl}</text>
    </g>`;
  }).join('');

  // ── Chi tiết tuần được chọn (hiển thị bên dưới biểu đồ khi click cột) ───
  const weekDetailHtml = (() => {
    if (!selectedDashboardWeekKey) {
      return `<div style="margin-top:14px;padding:14px 0;text-align:center;
                          color:var(--bs-secondary-color);font-size:11px;letter-spacing:.2px">
                ↑ Click vào một cột để xem chi tiết chi phí trong tuần đó
              </div>`;
    }

    const sun    = selectedDashboardWeekKey;
    const sat    = ccSaturdayISO(sun);
    const wkNum  = allWeeks.findIndex(w => w.key === sun) + 1;

    // Gom chi phí theo CT từ invoiceData + ungData trong [sun, sat]
    const ctMap = {};
    const ensure = nm => { if (!ctMap[nm]) ctMap[nm] = {inv:0, ungTP:0, ungNCC:0}; return ctMap[nm]; };

    // Build NCC exclusion set (same logic as _dbCalcWeeklyData)
    const _knownNCC = new Set(
      (typeof ungRecords !== 'undefined' ? ungRecords : [])
        .filter(r => !r.deletedAt && r.loai === 'nhacungcap' && r.tp)
        .map(r => (r.tp || '').trim().toUpperCase())
    );

    invoiceData
      .filter(i => i.ngay >= sun && i.ngay <= sat)
      .forEach(i => {
        if (i.ncc && _knownNCC.has((i.ncc || '').trim().toUpperCase())) return;
        ensure(resolveProjectName(i) || '(Không rõ CT)').inv += (i.thanhtien || i.tien || 0);
      });

    ungData
      .filter(r => r.ngay >= sun && r.ngay <= sat)
      .forEach(r => {
        const ct = resolveProjectName(r) || '(Không rõ CT)';
        if (r.loai === 'thauphu')    ensure(ct).ungTP  += (r.tien || 0);
        if (r.loai === 'nhacungcap') ensure(ct).ungNCC += (r.tien || 0);
      });

    const entries = Object.entries(ctMap)
      .map(([nm, v]) => ({ nm, ...v, total: v.inv + v.ungTP + v.ungNCC }))
      .filter(e => e.inv > 0 || e.ungTP > 0 || e.ungNCC > 0)
      .sort((a, b) => b.total - a.total);

    if (!entries.length) {
      return `<div style="margin-top:14px;border:1px solid var(--bs-border-color);border-radius:8px;
                          padding:16px;text-align:center;color:var(--bs-secondary-color);font-size:11px">
                Tuần ${wkNum} (CN ${viShort(sun)} – T7 ${viShort(sat)}) không có phát sinh
              </div>`;
    }

    const grandTotal = entries.reduce((s, e) => s + e.total, 0);
    const rowHtml = entries.map((e, idx) => `
      <tr style="border-bottom:1px solid var(--bs-border-color)"
          onmouseover="this.style.background='#fffcf3'"
          onmouseout="this.style.background=''">
        <td style="padding:5px 8px;color:var(--bs-secondary-color);font-size:11px;text-align:center;white-space:nowrap">${idx + 1}</td>
        <td style="padding:5px 10px;font-size:12px;font-weight:600;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x(e.nm)}</td>
        <td style="padding:5px 10px;text-align:right;font-family:'IBM Plex Mono',monospace;font-size:12px;color:${C_INV}">${e.inv    > 0 ? fmtM(e.inv)    : '<span style="color:var(--bs-border-color)">—</span>'}</td>
        <td style="padding:5px 10px;text-align:right;font-family:'IBM Plex Mono',monospace;font-size:12px;color:${C_TP}">${e.ungTP  > 0 ? fmtM(e.ungTP)  : '<span style="color:var(--bs-border-color)">—</span>'}</td>
        <td style="padding:5px 10px;text-align:right;font-family:'IBM Plex Mono',monospace;font-size:12px;color:${C_NCC}">${e.ungNCC > 0 ? fmtM(e.ungNCC) : '<span style="color:var(--bs-border-color)">—</span>'}</td>
        <td style="padding:5px 10px;text-align:right;font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:700;color:var(--bs-warning)">${fmtM(e.total)}</td>
      </tr>`).join('');

    return `
      <div style="margin-top:14px;border:1px solid var(--bs-border-color);border-radius:8px;overflow:hidden">
        <div style="background:var(--bs-tertiary-bg);padding:8px 14px;display:flex;align-items:center;
                    justify-content:space-between;border-bottom:1px solid var(--bs-border-color)">
          <span style="font-size:12px;font-weight:700;color:var(--bs-body-color)">
            <span class="material-symbols-outlined msi-gap">calendar_month</span>Chi tiết Tuần ${wkNum}
            <span style="font-size:10px;font-weight:400;color:var(--bs-secondary-color);margin-left:8px">
              CN ${viShort(sun)} – T7 ${viShort(sat)}
            </span>
          </span>
          <button onclick="_dbSelectWeek('${sun}')"
                  style="background:none;border:none;cursor:pointer;color:var(--bs-secondary-color);
                         font-size:15px;padding:2px 7px;border-radius:4px;line-height:1;
                         transition:background .15s"
                  onmouseover="this.style.background='var(--bs-border-color)'"
                  onmouseout="this.style.background='none'"
                  title="Đóng chi tiết"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;min-width:440px">
            <thead>
              <tr style="background:#f9f8f5;font-size:10px;font-weight:700;
                         color:var(--bs-secondary-color);text-transform:uppercase;letter-spacing:.5px">
                <th style="padding:5px 8px;text-align:center;width:32px">#</th>
                <th style="padding:5px 10px;text-align:left">Công trình</th>
                <th style="padding:5px 10px;text-align:right;color:${C_INV}">Hóa đơn</th>
                <th style="padding:5px 10px;text-align:right;color:${C_TP}">Ứng TP</th>
                <th style="padding:5px 10px;text-align:right;color:${C_NCC}">Ứng NCC</th>
                <th style="padding:5px 10px;text-align:right;color:var(--bs-warning)">Tổng</th>
              </tr>
            </thead>
            <tbody>${rowHtml}</tbody>
            <tfoot>
              <tr style="background:#fffbef;border-top:2px solid var(--bs-border-color)">
                <td colspan="5" style="padding:7px 10px;font-size:11px;font-weight:700;color:var(--bs-secondary-color)">
                  Tổng cộng — ${entries.length} công trình
                </td>
                <td style="padding:7px 10px;text-align:right;font-size:13px;font-weight:800;
                           color:var(--bs-warning);font-family:'IBM Plex Mono',monospace">
                  ${fmtM(grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>`;
  })();

  // ── Filter buttons ─────────────────────────────────────────────
  const filterBtns = [
    { f:'all', label:'Toàn bộ năm'      },
    { f:'12',  label:'12 tuần gần nhất' },
    { f:'8',   label:'8 tuần gần nhất'  },
    { f:'4',   label:'4 tuần gần nhất'  },
  ].map(({ f, label }) => {
    const active = _dbWeekFilter === f;
    return `<button onclick="_dbSetWeekFilter('${f}')"
      style="padding:3px 11px;border-radius:12px;font-size:10px;cursor:pointer;
             border:1px solid ${active ? 'var(--bs-warning)' : 'var(--bs-border-color)'};
             background:${active ? 'var(--bs-warning)' : 'transparent'};
             color:${active ? '#fff' : '#333'};font-weight:${active?'700':'400'}">${label}</button>`;
  }).join('');

  const selNote = selectedDashboardWeekKey
    ? `<span style="color:#c2895a;font-weight:700;font-size:10px;margin-left:auto">
         <span class="material-symbols-outlined msi-gap">push_pin</span>T${allWeeks.findIndex(w=>w.key===selectedDashboardWeekKey)+1}
         (${weekLabel(selectedDashboardWeekKey)}) — click lại để bỏ
       </span>`
    : '';

  // ── Render: filter + biểu đồ SVG (full-width) + legend + chi tiết tuần ──
  // viewBox y bắt đầu tại -22 để nhãn trên đỉnh cột không bị cắt
  document.getElementById('db-bar-chart').innerHTML =
    `<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap">
       ${filterBtns}${selNote}
     </div>
     <div style="overflow-x:auto">
       <svg viewBox="0 -22 ${svgW} ${H+44}" width="${svgW}" style="min-height:${H+44}px;display:block">
         ${bars}
         <line x1="0" y1="${H}" x2="${svgW}" y2="${H}" stroke="var(--bs-border-color)" stroke-width="1"/>
       </svg>
     </div>
     <div style="display:flex;gap:12px;font-size:10px;margin-top:8px;flex-wrap:wrap;color:#444">
       <span><span style="display:inline-block;width:10px;height:10px;background:${C_INV};border-radius:2px;margin-right:4px;vertical-align:middle"></span>Hóa đơn/CP-HĐ</span>
       <span><span style="display:inline-block;width:10px;height:10px;background:${C_TP};border-radius:2px;margin-right:4px;vertical-align:middle"></span>Ứng thầu phụ</span>
       <span><span style="display:inline-block;width:10px;height:10px;background:${C_NCC};border-radius:2px;margin-right:4px;vertical-align:middle"></span>Ứng NCC</span>
     </div>
     ${weekDetailHtml}`;
}

// ── Biểu đồ cột chồng theo tuần — CHẾ ĐỘ NHIỀU NĂM (52 cột cố định) ──
// Gộp dữ liệu theo SỐ TUẦN (1..52) xuyên TẤT CẢ năm được chọn:
//   cột [Tuần N] = Σ (Tuần N của từng năm).  VD chọn 2025+2026:
//   T23 = dữ liệu T23/2025 + T23/2026.  Tuần 53 (nếu có) gộp vào T52.
// Khác bản 1 năm (_dbBarChartWeekly): không click-chọn tuần (vì gộp nhiều năm),
// trục X cố định T1..T52, tooltip hiển thị tổng đã gộp + top CT.
function _dbBarChartWeekly52(years, invoiceData, ungData) {
  const el = document.getElementById('db-bar-chart');
  if (!el) return;

  const C_INV = '#c2913a'; // amber — Hóa đơn / CP-HĐ
  const C_TP  = '#8B4513'; // nâu   — Ứng thầu phụ
  const C_NCC = '#8e9ca6'; // xám   — Ứng nhà cung cấp

  // Danh sách năm cần gộp: dùng tham số, nếu rỗng ("Tất cả năm") thì suy từ dữ liệu
  let yrs = (years && years.length) ? years.slice() : [];
  if (!yrs.length) {
    const s = new Set();
    invoiceData.forEach(i => { if (i.ngay) s.add(+i.ngay.slice(0, 4)); });
    ungData.forEach(r => { if (r.ngay) s.add(+r.ngay.slice(0, 4)); });
    yrs = [...s].sort((a, b) => a - b);
  }

  const weeklyData = _dbCalcWeeklyData(invoiceData, ungData); // key = CN ISO đầy đủ (đã phân biệt năm)

  // 52 bucket cố định, cộng dồn theo số tuần xuyên các năm
  const buckets = Array.from({ length: 52 }, () => ({ inv: 0, ungTP: 0, ungNCC: 0, total: 0, byCT: {} }));
  yrs.forEach(yr => {
    const weeks = _dbGetWeeksInYear(yr);
    weeks.forEach((w, i) => {
      const wkNum = Math.min(i + 1, 52); // gộp tuần 53 (nếu có) vào tuần 52
      const v = weeklyData[w.key];
      if (!v) return;
      const b = buckets[wkNum - 1];
      b.inv += v.inv; b.ungTP += v.ungTP; b.ungNCC += v.ungNCC; b.total += v.total;
      Object.entries(v.byCT || {}).forEach(([ct, amt]) => { b.byCT[ct] = (b.byCT[ct] || 0) + amt; });
    });
  });

  // Bộ lọc range tuần: 'all' = đủ 52 cột; '12'/'8'/'4' = N tuần cuối (T... → T52)
  let startIdx = 0;
  if (_dbWeekFilter === '4')  startIdx = 48;
  if (_dbWeekFilter === '8')  startIdx = 44;
  if (_dbWeekFilter === '12') startIdx = 40;
  const dispNums = [];
  for (let i = startIdx; i < 52; i++) dispNums.push(i + 1);
  const dispVals = dispNums.map(num => buckets[num - 1]);
  const maxVal   = Math.max(...dispVals.map(v => v.total), 1);
  const n        = dispNums.length;

  // colW/gap thích nghi theo số cột (52 cột → cột mảnh, cuộn ngang)
  const colW = n <= 4 ? 52 : n <= 8 ? 46 : n <= 12 ? 34 : 22;
  const gap  = n <= 4 ? 8  : n <= 8 ? 6  : n <= 12 ? 5  : 3;
  const H    = 130;
  const H_SCALE = H - 18;
  const svgW = n * (colW + gap);
  const lblStep = n <= 8 ? 1 : 2; // nhãn mỗi 1 tuần (<=8) hoặc mỗi 2 tuần

  const bars = dispNums.map((wkNum, i) => {
    const v   = dispVals[i];
    const cx  = i * (colW + gap);
    const lbl = (i % lblStep === 0) ? `T${wkNum}` : '';

    const top3Lines = Object.entries(v.byCT || {})
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([ct, amt]) => `  • ${ct.slice(0, 22)}: ${amt >= 1e6 ? Math.round(amt / 1e6) + 'tr' : fmtM(amt)}`)
      .join('\n');

    if (!v.total) {
      return `<g>
        <rect x="${cx}" y="${H-2}" width="${colW}" height="2" rx="1" fill="var(--bs-border-color)" opacity=".3">
          <title>Tuần ${wkNum} (gộp ${yrs.join(', ')})\nKhông có phát sinh</title>
        </rect>
        <text x="${cx+colW/2}" y="${H+22}" text-anchor="middle" font-size="13" fill="#333" font-weight="600">${lbl}</text>
      </g>`;
    }

    const MIN_H = 4;
    const hInv = v.inv    > 0 ? Math.max(MIN_H, Math.round((v.inv    / maxVal) * H_SCALE)) : 0;
    const hTP  = v.ungTP  > 0 ? Math.max(MIN_H, Math.round((v.ungTP  / maxVal) * H_SCALE)) : 0;
    const hNCC = v.ungNCC > 0 ? Math.max(MIN_H, Math.round((v.ungNCC / maxVal) * H_SCALE)) : 0;
    const yNCC = H - hNCC;
    const yTP  = yNCC - hTP;
    const yInv = yTP  - hInv;
    const hTot = hInv + hTP + hNCC || 2;
    const yTop = H - hTot;

    const titleTxt = [
      `Tuần ${wkNum} — gộp các năm: ${yrs.join(', ')}`,
      `─────────────────────`,
      `Hóa đơn : ${fmtM(v.inv)}`,
      `Ứng TP  : ${fmtM(v.ungTP)}`,
      `Ứng NCC : ${fmtM(v.ungNCC)}`,
      `Tổng    : ${fmtM(v.total)}`,
      top3Lines ? `\nTop CT:\n${top3Lines}` : ''
    ].filter(Boolean).join('\n');

    const amt = v.total >= 1e9 ? (v.total/1e9).toFixed(1) + 'tỷ' : v.total >= 1e6 ? String(Math.round(v.total/1e6)) : '';

    return `<g>
      ${hNCC>0 ? `<rect x="${cx}" y="${yNCC}" width="${colW}" height="${hNCC}" fill="${C_NCC}" opacity=".85"/>` : ''}
      ${hTP >0 ? `<rect x="${cx}" y="${yTP}"  width="${colW}" height="${hTP}"  fill="${C_TP}"  opacity=".85"/>` : ''}
      ${hInv>0 ? `<rect x="${cx}" y="${yInv}" width="${colW}" height="${hInv}" fill="${C_INV}" opacity=".85"/>` : ''}
      <rect x="${cx}" y="${yTop}" width="${colW}" height="${hTot}" fill="transparent">
        <title>${titleTxt}</title>
      </rect>
      ${amt && hTot>18 ? `<text x="${cx+colW/2}" y="${yTop < 16 ? yTop+13 : yTop-5}" text-anchor="middle" font-size="10" fill="${yTop < 16 ? '#fff' : '#222'}" font-weight="700">${amt}</text>` : ''}
      <text x="${cx+colW/2}" y="${H+22}" text-anchor="middle" font-size="13" fill="#333" font-weight="600">${lbl}</text>
    </g>`;
  }).join('');

  // Filter buttons (giống chế độ 1 năm; nhãn "Toàn bộ" = đủ 52 tuần)
  const filterBtns = [
    { f:'all', label:'Toàn bộ (52 tuần)' },
    { f:'12',  label:'12 tuần cuối'      },
    { f:'8',   label:'8 tuần cuối'       },
    { f:'4',   label:'4 tuần cuối'       },
  ].map(({ f, label }) => {
    const active = _dbWeekFilter === f;
    return `<button onclick="_dbSetWeekFilter('${f}')"
      style="padding:3px 11px;border-radius:12px;font-size:10px;cursor:pointer;
             border:1px solid ${active ? 'var(--bs-warning)' : 'var(--bs-border-color)'};
             background:${active ? 'var(--bs-warning)' : 'transparent'};
             color:${active ? '#fff' : '#333'};font-weight:${active?'700':'400'}">${label}</button>`;
  }).join('');

  const yrNote = `<span style="font-size:10px;color:var(--bs-secondary-color);margin-left:auto">
                    Gộp ${yrs.length} năm: ${yrs.join(', ')} · cùng số tuần được cộng dồn
                  </span>`;

  el.innerHTML =
    `<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap">
       ${filterBtns}${yrNote}
     </div>
     <div style="overflow-x:auto">
       <svg viewBox="0 -22 ${svgW} ${H+44}" width="${svgW}" style="min-height:${H+44}px;display:block">
         ${bars}
         <line x1="0" y1="${H}" x2="${svgW}" y2="${H}" stroke="var(--bs-border-color)" stroke-width="1"/>
       </svg>
     </div>
     <div style="display:flex;gap:12px;font-size:10px;margin-top:8px;flex-wrap:wrap;color:#444">
       <span><span style="display:inline-block;width:10px;height:10px;background:${C_INV};border-radius:2px;margin-right:4px;vertical-align:middle"></span>Hóa đơn/CP-HĐ</span>
       <span><span style="display:inline-block;width:10px;height:10px;background:${C_TP};border-radius:2px;margin-right:4px;vertical-align:middle"></span>Ứng thầu phụ</span>
       <span><span style="display:inline-block;width:10px;height:10px;background:${C_NCC};border-radius:2px;margin-right:4px;vertical-align:middle"></span>Ứng NCC</span>
     </div>`;
}

// ── Handler bộ lọc thời gian (gọi từ onclick filter buttons) ──
function _dbSetWeekFilter(f) {
  _dbWeekFilter = f;
  selectedDashboardWeekKey = ''; // reset tuần đang chọn khi đổi filter
  if (_dbChartMode === 'multi') {
    // Chế độ nhiều năm: re-render biểu đồ 52 tuần gộp (không có pie theo tuần)
    if (_dbLastWeeklyInvData) {
      _dbBarChartWeekly52(_dbLastWeeklyYears, _dbLastWeeklyInvData, _dbLastWeeklyUngData);
    }
  } else if (_dbLastWeeklyInvData && _dbLastWeeklyYr) {
    _dbBarChartWeekly(_dbLastWeeklyYr, _dbLastWeeklyInvData, _dbLastWeeklyUngData);
    _dbPieChartWeekly(_dbLastWeeklyInvData, _dbLastWeeklyUngData); // reset về tổng quan
  }
}

// ── Pie Chart tỷ trọng (chế độ tuần) ─────────────────────────
// Hiển thị tỷ trọng 3 nguồn: Hóa đơn, Ứng TP, Ứng NCC
// Nếu selectedDashboardWeekKey → lọc theo tuần đó; không thì tổng năm
function _dbPieChartWeekly(invoiceData, ungData) {
  const C_INV = '#c2913a';
  const C_TP  = '#8B4513';
  const C_NCC = '#8e9ca6';

  let invTotal, ungTPTotal, ungNCCTotal, titleHtml;

  if (selectedDashboardWeekKey) {
    const sun = selectedDashboardWeekKey;
    const sat = ccSaturdayISO(sun);
    invTotal   = invoiceData.filter(i => i.ngay >= sun && i.ngay <= sat)
                            .reduce((s, i) => s + (i.thanhtien || i.tien || 0), 0);
    ungTPTotal  = ungData.filter(r => r.loai === 'thauphu'    && r.ngay >= sun && r.ngay <= sat)
                          .reduce((s, r) => s + (r.tien || 0), 0);
    ungNCCTotal = ungData.filter(r => r.loai === 'nhacungcap' && r.ngay >= sun && r.ngay <= sat)
                          .reduce((s, r) => s + (r.tien || 0), 0);
    titleHtml = `Tỷ Trọng Tuần<br><span style="font-size:11px;font-weight:400">CN ${viShort(sun)} – T7 ${viShort(sat)}</span>`;
  } else {
    invTotal    = invoiceData.reduce((s, i) => s + (i.thanhtien || i.tien || 0), 0);
    ungTPTotal  = ungData.filter(r => r.loai === 'thauphu')
                          .reduce((s, r) => s + (r.tien || 0), 0);
    ungNCCTotal = ungData.filter(r => r.loai === 'nhacungcap')
                          .reduce((s, r) => s + (r.tien || 0), 0);
    titleHtml = 'Tỷ Trọng Chi Phí';
  }

  const titleEl = document.getElementById('db-pie-title');
  if (titleEl) titleEl.innerHTML = titleHtml;

  const total = invTotal + ungTPTotal + ungNCCTotal;
  if (!total) {
    document.getElementById('db-pie-chart').innerHTML = '<div class="db-empty">Chưa có dữ liệu</div>';
    return;
  }

  const entries = [
    { name: 'Hóa đơn/CP-HĐ', val: invTotal,    color: C_INV },
    { name: 'Ứng thầu phụ',   val: ungTPTotal,  color: C_TP  },
    { name: 'Ứng NCC',        val: ungNCCTotal, color: C_NCC },
  ].filter(e => e.val > 0);

  const R = 70, CX = 80, CY = 80;
  let startAngle = -Math.PI / 2;
  const slices = entries.map(e => {
    const pct   = e.val / total;
    const angle = pct * Math.PI * 2;
    const x1 = CX + R * Math.cos(startAngle);
    const y1 = CY + R * Math.sin(startAngle);
    startAngle += angle;
    const x2    = CX + R * Math.cos(startAngle);
    const y2    = CY + R * Math.sin(startAngle);
    const large = angle > Math.PI ? 1 : 0;
    return `<path d="M${CX},${CY} L${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 ${large},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z"
              fill="${e.color}" stroke="#fff" stroke-width="2">
              <title>${e.name}: ${Math.round(pct*100)}% (${fmtM(e.val)})</title>
            </path>`;
  }).join('');

  const legend = entries.map(e =>
    `<div class="db-legend-row">
       <div class="db-legend-dot" style="background:${e.color}"></div>
       <span style="flex:1;color:var(--bs-secondary-color)">${e.name}</span>
       <span class="db-legend-pct" style="color:${e.color}">${Math.round(e.val/total*100)}%</span>
     </div>`
  ).join('');

  document.getElementById('db-pie-chart').innerHTML =
    `<svg viewBox="0 0 160 160" width="140" height="140" class="db-pie-svg">${slices}</svg>
     <div class="db-legend">${legend}</div>`;
}

// ── Chọn/bỏ chọn tuần (click cột tuần) ───────────────────────
function _dbSelectWeek(weekKey) {
  selectedDashboardWeekKey = (selectedDashboardWeekKey === weekKey) ? '' : weekKey;
  if (!_dbLastWeeklyInvData || !_dbLastWeeklyYr) return;

  // Preserve scroll positions trước khi re-render
  // (a) horizontal scroll của container chart — tránh "giật" về T1 khi click T20
  // (b) vertical scroll của window — tránh nhảy lên đầu trang
  const chartHost = document.getElementById('db-bar-chart');
  const innerScrollEl = chartHost?.querySelector('div[style*="overflow-x"]');
  const prevScrollLeft = innerScrollEl ? innerScrollEl.scrollLeft : 0;
  const prevWinScrollY = window.scrollY || window.pageYOffset;

  _dbBarChartWeekly(_dbLastWeeklyYr, _dbLastWeeklyInvData, _dbLastWeeklyUngData);
  _dbPieChartWeekly(_dbLastWeeklyInvData, _dbLastWeeklyUngData);

  // Khôi phục sau khi DOM mới đã render
  requestAnimationFrame(() => {
    const newInner = document.getElementById('db-bar-chart')?.querySelector('div[style*="overflow-x"]');
    if (newInner) newInner.scrollLeft = prevScrollLeft;
    // Reset window scroll nếu bị nhảy (browser đôi khi tự cuộn về focused element)
    if (Math.abs((window.scrollY || window.pageYOffset) - prevWinScrollY) > 4) {
      window.scrollTo({ top: prevWinScrollY, behavior: 'instant' });
    }
  });
}


// ── Top 5 hóa đơn lớn nhất ────────────────────────────────────
function _dbTop5(data) {
  const top5 = [...data]
    .sort((a,b) => (b.thanhtien||b.tien||0) - (a.thanhtien||a.tien||0))
    .slice(0, 5);
  const max  = top5[0] ? (top5[0].thanhtien||top5[0].tien||0) : 1;

  document.getElementById('db-top5').innerHTML = top5.map((inv, i) => {
    const amt = inv.thanhtien || inv.tien || 0;
    const pct = Math.round(amt / max * 100);
    return `<div class="db-rank-row">
      <div class="db-rank-num ${i===0?'top1':''}">${i===0?'<span class="material-symbols-outlined msi-gap">workspace_premium</span>':i+1}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;color:var(--bs-body-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${inv.nd || inv.loai || '—'}
        </div>
        <div style="font-size:10px;color:var(--bs-secondary-color)">${inv.ngay} · ${resolveProjectName(inv)||'—'}</div>
        <div class="db-rank-bar-bg" style="margin-top:4px">
          <div class="db-rank-bar-fill" style="width:${pct}%"></div>
        </div>
      </div>
      <div class="db-rank-amt">${fmtM(amt)}</div>
    </div>`;
  }).join('');
}

// ── Chi phí theo Công Trình ────────────────────────────────────
function _dbByCT(data) {
  const byCT = {};
  data.forEach(i => {
    const k = resolveProjectName(i) || '(Không rõ)';
    byCT[k] = (byCT[k] || 0) + (i.thanhtien || i.tien || 0);
  });
  const sorted = Object.entries(byCT).sort((a,b) => b[1]-a[1]);
  const max    = sorted[0]?.[1] || 1;

  document.getElementById('db-by-ct').innerHTML = sorted.map(([ct, amt], i) => {
    const pct = Math.round(amt / max * 100);
    return `<div class="db-rank-row">
      <div class="db-rank-num ${i===0?'top1':''}">${i+1}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;color:var(--bs-body-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
             title="${ct}">${ct}</div>
        <div class="db-rank-bar-bg" style="margin-top:4px">
          <div class="db-rank-bar-fill" style="width:${pct}%;background:${i===0?'var(--bs-success)':'var(--bs-warning)'}"></div>
        </div>
      </div>
      <div class="db-rank-amt">${fmtM(amt)}</div>
    </div>`;
  }).join('');
}

// ── Tổng Tiền Ứng theo Công Trình ─────────────────────────────
function _dbUngByCT() {
  const wrap = document.getElementById('db-ung-ct');
  if (!wrap) return;

  const filtered = ungRecords.filter(r =>
    !r.deletedAt &&
    inActiveYear(r.ngay) &&
    (!selectedCT || resolveProjectName(r) === selectedCT)
  );

  if (!filtered.length) {
    wrap.innerHTML = '<div class="db-empty">Chưa có tiền ứng</div>';
    return;
  }

  if (!selectedCT) {
    const byCT = {};
    filtered.forEach(r => {
      const k = resolveProjectName(r) || '(Không rõ)';
      byCT[k] = (byCT[k] || 0) + (r.tien || 0);
    });
    const sorted = Object.entries(byCT).sort((a,b) => b[1]-a[1]);
    const max = sorted[0][1] || 1;
    wrap.innerHTML = sorted.map(([ct, amt], i) => {
      const pct = Math.round(amt / max * 100);
      return `<div class="db-rank-row">
        <div class="db-rank-num ${i===0?'top1':''}">${i+1}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;color:var(--bs-body-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
               title="${x(ct)}">${x(ct)}</div>
          <div class="db-rank-bar-bg" style="margin-top:4px">
            <div class="db-rank-bar-fill" style="width:${pct}%;background:var(--bs-primary)"></div>
          </div>
        </div>
        <div class="db-rank-amt">${fmtM(amt)}</div>
      </div>`;
    }).join('');
  } else {
    const rows = [...filtered]
      .sort((a,b) => b.ngay.localeCompare(a.ngay))
      .map(r => `<tr style="border-bottom:1px solid var(--bs-border-color)">
        <td style="padding:7px 8px;white-space:nowrap;color:var(--bs-secondary-color);font-size:12px">${r.ngay}</td>
        <td style="padding:7px 8px;font-weight:600">${x(r.tp)||'—'}</td>
        <td style="padding:7px 8px;color:var(--bs-secondary-color);font-size:12px">${x(r.nd)||'—'}</td>
        <td style="padding:7px 8px;text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:700;color:var(--bs-primary);white-space:nowrap">${fmtM(r.tien||0)}</td>
      </tr>`).join('');
    const total = sumBy(filtered, 'tien');
    wrap.innerHTML = `<div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="font-size:11px;color:var(--bs-secondary-color);border-bottom:2px solid var(--bs-border-color)">
            <th style="text-align:left;padding:6px 8px;font-weight:600">Ngày</th>
            <th style="text-align:left;padding:6px 8px;font-weight:600">Thầu Phụ / NCC</th>
            <th style="text-align:left;padding:6px 8px;font-weight:600">Nội Dung</th>
            <th style="text-align:right;padding:6px 8px;font-weight:600">Số Tiền</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="font-weight:700;border-top:2px solid var(--bs-border-color)">
            <td colspan="3" style="padding:7px 8px;color:var(--bs-secondary-color)">Tổng cộng (${filtered.length} lần)</td>
            <td style="padding:7px 8px;text-align:right;font-family:'IBM Plex Mono',monospace;color:var(--bs-primary)">${fmtM(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;
  }
}

// ── Thiết Bị theo Công Trình ───────────────────────────────────
function _dbTBByCT() {
  const wrap = document.getElementById('db-tb-ct');
  if (!wrap) return;

  // Chỉ thiết bị chưa xóa, không phải KHO TỔNG
  const allTB = tbData.filter(t => !t.deletedAt && t.ct !== TB_KHO_TONG);
  // Thiết bị trong KHO TỔNG (chưa xóa)
  const khoTB = tbData.filter(t => !t.deletedAt && t.ct === TB_KHO_TONG);

  if (!allTB.length && !khoTB.length) {
    wrap.innerHTML = '<div class="db-empty">Chưa có thiết bị</div>';
    return;
  }

  if (!selectedCT) {
    // Tổng KHO TỔNG
    const khoTotal = khoTB.reduce((s, t) => s + (t.soluong||0), 0);
    const khoHd = khoTB.filter(t=>t.tinhtrang==='Đang hoạt động').reduce((s,t)=>s+(t.soluong||0),0);
    const khoLau = khoTB.filter(t=>t.tinhtrang==='Cần bảo trì').reduce((s,t)=>s+(t.soluong||0),0);
    const khoSC = khoTB.filter(t=>t.tinhtrang==='Cần sửa chữa').reduce((s,t)=>s+(t.soluong||0),0);

    const khoRow = khoTotal > 0
      ? `<div style="padding:10px 0;border-bottom:2px solid var(--bs-warning);margin-bottom:4px">
          <div style="font-weight:800;color:var(--bs-warning);margin-bottom:6px;font-size:13px"><span class="material-symbols-outlined msi-gap">storefront</span>KHO TỔNG</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px">
            <span style="color:var(--bs-secondary-color)">Tổng: <b style="color:var(--bs-body-color);font-size:14px">${khoTotal}</b></span>
            <span style="color:var(--bs-success)">Đang hoạt động: <b>${khoHd}</b></span>
            <span style="color:var(--bs-warning)">Cần bảo trì: <b>${khoLau}</b></span>
            <span style="color:var(--bs-danger)">Cần sửa chữa: <b>${khoSC}</b></span>
          </div>
        </div>`
      : '';

    const byCT = {};
    allTB.forEach(t => {
      const ct = _resolveCtName(t) || '(Không rõ)'; // [MODIFIED] resolve from projectId
      if (!byCT[ct]) byCT[ct] = { total: 0, dangHD: 0, hdLau: 0, canSC: 0 };
      const sl = t.soluong || 0;
      byCT[ct].total  += sl;
      if (t.tinhtrang === 'Đang hoạt động') byCT[ct].dangHD += sl;
      else if (t.tinhtrang === 'Cần bảo trì') byCT[ct].hdLau += sl;
      else if (t.tinhtrang === 'Cần sửa chữa') byCT[ct].canSC += sl;
    });

    const sorted = Object.entries(byCT).sort((a,b) => a[0].localeCompare(b[0],'vi'));
    const ctRows = sorted.map(([ct, s]) =>
      `<div style="padding:10px 0;border-bottom:1px solid var(--bs-border-color)">
        <div style="font-weight:700;color:var(--bs-body-color);margin-bottom:6px">${x(ct)}</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px">
          <span style="color:var(--bs-secondary-color)">Tổng: <b style="color:var(--bs-body-color)">${s.total}</b></span>
          <span style="color:var(--bs-success)">Đang hoạt động: <b>${s.dangHD}</b></span>
          <span style="color:var(--bs-warning)">Cần bảo trì: <b>${s.hdLau}</b></span>
          <span style="color:var(--bs-danger)">Cần sửa chữa: <b>${s.canSC}</b></span>
        </div>
      </div>`
    ).join('');

    wrap.innerHTML = khoRow + (ctRows || '<div class="db-empty">Chưa có thiết bị tại công trình</div>');
  } else {
    const filtered = allTB
      .filter(t => t.ct === selectedCT)
      .sort((a,b) => (a.ten||'').localeCompare(b.ten,'vi'));

    if (!filtered.length) {
      wrap.innerHTML = '<div class="db-empty">Chưa có thiết bị cho ' + x(selectedCT) + '</div>';
      return;
    }

    const rows = filtered.map(t => {
      const ttColor = t.tinhtrang === 'Đang hoạt động' ? 'var(--bs-success)'
                    : t.tinhtrang === 'Cần bảo trì'  ? 'var(--bs-warning)'
                    : t.tinhtrang === 'Cần sửa chữa'   ? 'var(--bs-danger)'
                    : 'var(--bs-secondary-color)';
      return `<tr style="border-bottom:1px solid var(--bs-border-color)">
        <td style="padding:7px 8px;font-weight:600">${x(t.ten)}</td>
        <td style="padding:7px 8px;text-align:center;font-family:'IBM Plex Mono',monospace;font-weight:700;color:var(--bs-warning)">${t.soluong||0}</td>
        <td style="padding:7px 8px;color:${ttColor}">${x(t.tinhtrang)||'—'}</td>
        <td style="padding:7px 8px;color:var(--bs-secondary-color);font-size:12px">${x(t.ct)||'—'}</td>
      </tr>`;
    }).join('');

    wrap.innerHTML = `<div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="font-size:11px;color:var(--bs-secondary-color);border-bottom:2px solid var(--bs-border-color)">
            <th style="text-align:left;padding:6px 8px;font-weight:600">Tên Thiết Bị</th>
            <th style="text-align:center;padding:6px 8px;font-weight:600">SL</th>
            <th style="text-align:left;padding:6px 8px;font-weight:600">Tình Trạng</th>
            <th style="text-align:left;padding:6px 8px;font-weight:600">Công Trình</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }
}

// ══════════════════════════════════════════════════════════════
// [3] PUBLIC WRAPPERS — JSON & backup (gọi từ HTML onclick)
// ══════════════════════════════════════════════════════════════

function toolExportJSON() { exportJSON(); }
function toolImportJSON() { document.getElementById('import-json-input').click(); }

