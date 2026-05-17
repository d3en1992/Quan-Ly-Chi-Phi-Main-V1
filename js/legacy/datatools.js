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
    <div style="background:#fff;border-radius:10px;padding:24px;max-width:420px;width:100%;
                box-shadow:0 8px 32px rgba(0,0,0,.28);font-family:inherit">
      <div style="font-size:15px;font-weight:700;color:#c0392b;margin-bottom:10px">${title}</div>
      <div style="font-size:13px;color:#333;line-height:1.65;margin-bottom:16px">${bodyHtml}</div>
      <div style="margin-bottom:16px">
        <label style="font-size:12px;color:#555;display:block;margin-bottom:6px">
          Gõ <strong>DELETE</strong> để xác nhận:
        </label>
        <input id="_del-inp" type="text" autocomplete="off" placeholder="DELETE"
          style="width:100%;box-sizing:border-box;padding:8px 12px;border:2px solid #e74c3c;
                 border-radius:6px;font-size:14px;font-family:monospace;letter-spacing:2px;outline:none">
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button id="_del-cancel" style="padding:8px 18px;border:1px solid #ccc;border-radius:6px;
          background:#f5f5f5;cursor:pointer;font-size:13px">Huỷ</button>
        <button id="_del-ok" style="padding:8px 18px;border:none;border-radius:6px;
          background:#e74c3c;color:#fff;cursor:pointer;font-size:13px;font-weight:700;opacity:.45" disabled>
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
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
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
    '⚠️ Reset toàn bộ dữ liệu',
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

    // 3. Ghi soft-deleted vào _mem (tạm) để fbYearPayload/load() đọc được
    // Không ghi IDB vì step 8 sẽ clear IDB; chỉ cần _mem cho fbYearPayload đọc
    ['inv_v3','ung_v1','cc_v2','tb_v1','thu_v1','thauphu_v1'].forEach(k => {
      _mem[k] = _softDelArr(k);
    });

    // hopDongData là object, xử lý riêng
    const existingHd = (typeof load === 'function') ? load('hopdong_v1', {}) : {};
    const softHd = {};
    Object.keys(existingHd).forEach(ct => {
      const hd = existingHd[ct];
      softHd[ct] = (hd && hd.deletedAt)
        ? hd
        : { ...(hd || {}), deletedAt: now, updatedAt: now, deviceId: devId };
    });
    _mem['hopdong_v1'] = softHd; // tạm trong _mem để fbYearPayload/fbCatsPayload đọc được

    // Chuẩn bị cats/settings rỗng trước khi push lên cloud
    const _emptyArrKeys = ['cat_ct','cat_loai','cat_ncc','cat_nguoi','cat_tp','cat_cn','cat_tbteb','projects_v1','thauphu_v1'];
    _emptyArrKeys.forEach(k => { _mem[k] = []; });
    _mem['hopdong_v1'] = softHd; // đã set ở trên
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

    // 4. Push soft-deleted lên Firebase TRƯỚC KHI xóa localStorage
    if (typeof fbReady === 'function' && fbReady() &&
        typeof fsSet === 'function' && typeof fbYearPayload === 'function') {
      if (typeof showSyncBanner === 'function') showSyncBanner('⏳ Đang xóa dữ liệu trên Cloud...');
      try {
        // fbYearPayload(yr) đọc từ _mem → trả về soft-deleted records
        for (const yr of yearsToWipe) {
          await fsSet(fbDocYear(parseInt(yr)), fbYearPayload(parseInt(yr)));
        }
        if (typeof fbCatsPayload === 'function' && typeof fbDocCats === 'function') {
          // Xóa cats + projects + contracts trong _mem TRƯỚC khi gọi fbCatsPayload()
          // Cat string-array không có soft-delete → phải push [] để cloud xóa sạch
          // (nếu giữ old cats trong _mem, cloud sẽ giữ nguyên danh mục → hồi về sau pull)
          ['cat_ct','cat_loai','cat_ncc','cat_nguoi',
           'cat_tp','cat_cn','cat_tbteb'].forEach(k => { _mem[k] = []; });
          _mem['projects_v1']  = [];
          _mem['thauphu_v1']   = [];
          _mem['hopdong_v1']   = {};

          // FIX: cat_items_v1 là nguồn gốc khiến danh mục hồi sinh sau reset+sync.
          // Phải soft-delete từng item (isDeleted:true) trước khi push lên Firebase,
          // để thiết bị khác pull về thấy isDeleted=true và không rebuild lại mảng.
          // Sau push, xóa local về {} — F5 + pull sẽ nhận tombstones và vẫn cho kết quả rỗng.
          const _existCatItems = load('cat_items_v1', {});
          if (Object.keys(_existCatItems).length) {
            const _softCatItems = {};
            Object.entries(_existCatItems).forEach(([type, arr]) => {
              _softCatItems[type] = (arr || []).map(item =>
                item.isDeleted ? item : { ...item, isDeleted: true, updatedAt: now }
              );
            });
            _mem['cat_items_v1'] = _softCatItems; // fbCatsPayload() đọc _mem này
          } else {
            _mem['cat_items_v1'] = {};
          }

          await fsSet(fbDocCats(), fbCatsPayload());
        }
        console.log('[ResetAll] ✅ Firebase soft-wiped — years:', yearsToWipe.join(', '));
      } catch (e) {
        console.warn('[ResetAll] Firebase wipe lỗi (bỏ qua):', e);
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
    if (barTitle) barTitle.textContent = isSingleYear ? 'Chi Phí Theo Tuần' : 'Chi Phí Theo Tháng';
    if (pieTitle) pieTitle.textContent = 'Tỷ Trọng Chi Phí';
    return;
  }

  if (isSingleYear) {
    // ── CHẾ ĐỘ 1 NĂM: biểu đồ theo tuần ──────────────────────
    if (barTitle) barTitle.textContent = 'Chi Phí Theo Tuần';
    if (pieTitle) pieTitle.textContent = 'Tỷ Trọng Chi Phí';

    // Cache data để filter/select tuần không cần chạy lại renderDashboard
    _dbLastWeeklyYr      = yr;
    _dbLastWeeklyInvData = dataYear;
    _dbLastWeeklyUngData = ungAllYear;

    _dbKPIWeekly(yr, dataYear, ungAllYear, thauPhuTotal);
    _dbBarChartWeekly(yr, dataYear, ungAllYear);
    _dbPieChartWeekly(dataYear, ungAllYear);
    _dbRenderHeatmap(yr, dataYear, ungAllYear);
  } else {
    // ── CHẾ ĐỘ NHIỀU NĂM / TẤT CẢ: biểu đồ theo tháng ───────
    if (barTitle) barTitle.textContent = 'Chi Phí Theo Tháng';
    if (pieTitle) pieTitle.textContent = 'Tỷ Trọng Chi Phí';
    _dbKPI(dataYear, yr, thauPhuTotal);
    _dbBarChart(dataYear);
    _dbPieChart(dataYear);
    // Ẩn heatmap ở chế độ nhiều năm
    const hmEl = document.getElementById('db-heatmap');
    if (hmEl) hmEl.innerHTML = '';
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
    `<div class="db-kpi-card ${k.cls}">
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
    // "Tất cả" hoặc multi-year → gộp theo số tháng (T1–T12)
    const byNum = {};
    Object.entries(byMonth).forEach(([m, v]) => {
      const num = m.slice(5);
      byNum[num] = (byNum[num] || 0) + v;
    });
    vals = months12.map((_, i) => byNum[String(i + 1).padStart(2, '0')] || 0);
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
              rx="3" fill="${v ? 'var(--gold)' : 'var(--line)'}" opacity="${v ? '.85' : '.35'}">
          <title>T${i+1}: ${fmtM(v)}</title>
        </rect>
        <text x="${cx + colW/2}" y="${y - 4}" text-anchor="middle"
              font-size="9" fill="var(--ink2)">${h > 14 ? amt : ''}</text>
        <text x="${cx + colW/2}" y="${H + 14}" text-anchor="middle"
              font-size="9" fill="var(--ink3)">T${i+1}</text>
      </g>`;
  }).join('');

  document.getElementById('db-bar-chart').innerHTML =
    `<svg viewBox="0 -10 ${svgW} ${H + 28}" width="100%" class="db-pie-svg"
          style="min-width:${Math.min(svgW,300)}px;max-width:100%">
       ${bars}
       <line x1="0" y1="${H}" x2="${svgW}" y2="${H}" stroke="var(--line)" stroke-width="1"/>
     </svg>`;
}

// ── Pie Chart tỷ trọng (SVG) ─────────────────────────────────
function _dbPieChart(data) {
  const COLORS = ['#f0b429','#1db954','#4a90d9','#e74c3c','#9b59b6','#e67e22','#aaa'];
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
       <span style="flex:1;color:var(--ink2)">${e.name}</span>
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
  const result = {};
  function ensure(k) {
    if (!result[k]) result[k] = { inv: 0, ungTP: 0, ungNCC: 0, total: 0, byCT: {} };
    return result[k];
  }
  invoiceData.forEach(i => {
    if (!i.ngay) return;
    const amt = i.thanhtien || i.tien || 0;
    if (!amt) return;
    const w = ensure(snapToSunday(i.ngay));
    w.inv += amt; w.total += amt;
    // Track per-CT cho tooltip & heatmap
    const ct = resolveProjectName(i) || '(Không rõ)';
    w.byCT[ct] = (w.byCT[ct] || 0) + amt;
  });
  ungData.forEach(r => {
    if (!r.ngay || (r.loai !== 'thauphu' && r.loai !== 'nhacungcap')) return;
    const amt = r.tien || 0;
    if (!amt) return;
    const w = ensure(snapToSunday(r.ngay));
    if (r.loai === 'thauphu') w.ungTP += amt; else w.ungNCC += amt;
    w.total += amt;
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
    { label: 'Tổng Chi Tuần',         val: fmtM(weekKPITotal), sub: weekKPISub,                 cls: 'accent-blue'  },
    { label: 'Tuần Chi Cao Nhất',     val: fmtM(maxWeekTotal), sub: maxWeekSub,                 cls: 'accent-red'   },
    { label: 'Công Trình',            val: ctSet.size,         sub: 'phát sinh năm ' + yr,      cls: 'accent-green' },
  ];

  document.getElementById('db-kpi-row').innerHTML = cards.map(k =>
    `<div class="db-kpi-card ${k.cls}">
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
  const C_INV = '#f0a500'; // amber — Hóa đơn / CP-HĐ
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
  const H    = 160;
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
    const lblColor   = isSel ? '#e67e22' : '#333';
    const lblWeight  = isSel ? '700' : '600';

    // Top-3 CT cho footer tooltip
    const top3Lines = Object.entries(v.byCT || {})
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([ct, amt]) => `  • ${ct.slice(0,22)}: ${amt>=1e6?Math.round(amt/1e6)+'tr':fmtM(amt)}`)
      .join('\n');

    if (!v.total) {
      return `<g onclick="_dbSelectWeek('${w.key}')" style="cursor:pointer">
        <rect x="${cx}" y="${H-2}" width="${colW}" height="2" rx="1" fill="var(--line)" opacity=".3">
          <title>Tuần ${wkNum} (CN ${viShort(w.sun)} – T7 ${viShort(w.sat)})\nKhông có phát sinh</title>
        </rect>
        <text x="${cx+colW/2}" y="${H+22}" text-anchor="middle" font-size="13" fill="${lblColor}" font-weight="${lblWeight}">${lbl}</text>
      </g>`;
    }

    // MIN_H = 4px: cột vài triệu vẫn thấy bên cạnh cột vài trăm triệu
    const MIN_H = 4;
    const hInv = v.inv    > 0 ? Math.max(MIN_H, Math.round((v.inv    / maxVal) * H)) : 0;
    const hTP  = v.ungTP  > 0 ? Math.max(MIN_H, Math.round((v.ungTP  / maxVal) * H)) : 0;
    const hNCC = v.ungNCC > 0 ? Math.max(MIN_H, Math.round((v.ungNCC / maxVal) * H)) : 0;
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

    const amt       = v.total>=1e9?(v.total/1e9).toFixed(1)+'tỷ':v.total>=1e6?Math.round(v.total/1e6)+'tr':'';
    const selStroke = isSel ? `stroke="#e67e22" stroke-width="2"` : 'stroke="none"';
    const selBg     = isSel ? `<rect x="${cx-1}" y="0" width="${colW+2}" height="${H}" fill="#e67e2215" rx="2"/>` : '';

    return `<g onclick="_dbSelectWeek('${w.key}')" style="cursor:pointer">
      ${selBg}
      ${hNCC>0 ? `<rect x="${cx}" y="${yNCC}" width="${colW}" height="${hNCC}" fill="${C_NCC}" opacity=".85"/>` : ''}
      ${hTP >0 ? `<rect x="${cx}" y="${yTP}"  width="${colW}" height="${hTP}"  fill="${C_TP}"  opacity=".85"/>` : ''}
      ${hInv>0 ? `<rect x="${cx}" y="${yInv}" width="${colW}" height="${hInv}" fill="${C_INV}" opacity=".85"/>` : ''}
      <rect x="${cx}" y="${yTop}" width="${colW}" height="${hTot}" fill="transparent" ${selStroke} rx="2">
        <title>${titleTxt}</title>
      </rect>
      ${amt && hTot>18 ? `<text x="${cx+colW/2}" y="${yTop-5}" text-anchor="middle" font-size="13" fill="#222" font-weight="700">${amt}</text>` : ''}
      <text x="${cx+colW/2}" y="${H+22}" text-anchor="middle" font-size="13" fill="${lblColor}" font-weight="${lblWeight}">${lbl}</text>
    </g>`;
  }).join('');

  // ── 4-tuần tóm tắt (cards lớn, chữ dễ đọc cho màn hình GĐ) ──
  const last4Start = Math.max(0, endIdx - 3);
  const last4Weeks = allWeeks.slice(last4Start, endIdx + 1);
  const summaryCards = last4Weeks.map((w, i) => {
    const absIdx = last4Start + i;
    const wkNum  = absIdx + 1;
    const v      = weeklyData[w.key] || { inv:0, ungTP:0, ungNCC:0, total:0 };
    const isCurr = w.key === currSunKey;
    const totalFmt = v.total >= 1e9
      ? (v.total/1e9).toFixed(2) + ' tỷ'
      : v.total >= 1e6
        ? Math.round(v.total/1e6) + ' tr'
        : fmtM(v.total);
    const border = isCurr ? '2px solid #f0a500' : '1px solid var(--line)';
    const headBg = isCurr ? '#fff8e7' : 'var(--bg2)';
    return `<div style="flex:1;min-width:140px;border:${border};border-radius:10px;overflow:hidden;box-shadow:0 1px 4px #0001">
      <div style="background:${headBg};padding:7px 12px 5px;border-bottom:1px solid var(--line)">
        <div style="font-size:13px;font-weight:700;color:#444">Tuần ${wkNum}${isCurr?' <span style="color:#f0a500;font-size:11px">▶ Hiện tại</span>':''}</div>
        <div style="font-size:11px;color:#666">CN ${viShort(w.sun)} – T7 ${viShort(w.sat)}</div>
      </div>
      <div style="padding:10px 12px">
        <div style="font-size:24px;font-weight:800;color:#222;line-height:1.1;margin-bottom:6px">${totalFmt}</div>
        <div style="font-size:11px;color:#555;line-height:1.8">
          ${v.inv    > 0 ? `<span style="display:inline-block;width:8px;height:8px;background:${C_INV};border-radius:2px;margin-right:3px;vertical-align:middle"></span>HĐ: ${Math.round(v.inv/1e6)}tr<br>` : ''}
          ${v.ungTP  > 0 ? `<span style="display:inline-block;width:8px;height:8px;background:${C_TP};border-radius:2px;margin-right:3px;vertical-align:middle"></span>TP: ${Math.round(v.ungTP/1e6)}tr<br>` : ''}
          ${v.ungNCC > 0 ? `<span style="display:inline-block;width:8px;height:8px;background:${C_NCC};border-radius:2px;margin-right:3px;vertical-align:middle"></span>NCC: ${Math.round(v.ungNCC/1e6)}tr` : ''}
          ${v.total === 0 ? '<span style="color:#aaa">Chưa có phát sinh</span>' : ''}
        </div>
      </div>
    </div>`;
  }).join('');

  // Filter buttons — trạng thái active highlight bằng màu gold
  const filterBtns = [
    { f:'all', label:'Toàn bộ năm'      },
    { f:'12',  label:'12 tuần gần nhất' },
    { f:'8',   label:'8 tuần gần nhất'  },
    { f:'4',   label:'4 tuần gần nhất'  },
  ].map(({ f, label }) => {
    const active = _dbWeekFilter === f;
    return `<button onclick="_dbSetWeekFilter('${f}')"
      style="padding:4px 13px;border-radius:12px;font-size:12px;cursor:pointer;
             border:1px solid ${active ? 'var(--gold)' : 'var(--line)'};
             background:${active ? 'var(--gold)' : 'transparent'};
             color:${active ? '#fff' : '#333'};font-weight:${active?'700':'400'}">${label}</button>`;
  }).join('');

  const selNote = selectedDashboardWeekKey
    ? `<span style="color:#e67e22;font-weight:700;font-size:12px;margin-left:auto">
         📌 T${allWeeks.findIndex(w=>w.key===selectedDashboardWeekKey)+1}
         (${weekLabel(selectedDashboardWeekKey)}) — click lại để bỏ
       </span>`
    : '';

  document.getElementById('db-bar-chart').innerHTML =
    `<div style="margin-bottom:16px">
       <div style="font-size:13px;font-weight:700;color:#444;margin-bottom:10px;letter-spacing:.3px">
         📋 Tóm tắt 4 tuần gần nhất
       </div>
       <div style="display:flex;gap:10px;flex-wrap:wrap">
         ${summaryCards}
       </div>
     </div>
     <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;flex-wrap:wrap">
       ${filterBtns}${selNote}
     </div>
     <div style="overflow-x:auto">
       <svg viewBox="0 -10 ${svgW} ${H+34}" width="${svgW}" style="min-height:${H+34}px;display:block">
         ${bars}
         <line x1="0" y1="${H}" x2="${svgW}" y2="${H}" stroke="var(--line)" stroke-width="1"/>
       </svg>
     </div>
     <div style="display:flex;gap:14px;font-size:12px;margin-top:10px;flex-wrap:wrap;color:#444">
       <span><span style="display:inline-block;width:11px;height:11px;background:${C_INV};border-radius:2px;margin-right:5px;vertical-align:middle"></span>Hóa đơn/CP-HĐ</span>
       <span><span style="display:inline-block;width:11px;height:11px;background:${C_TP};border-radius:2px;margin-right:5px;vertical-align:middle"></span>Ứng thầu phụ</span>
       <span><span style="display:inline-block;width:11px;height:11px;background:${C_NCC};border-radius:2px;margin-right:5px;vertical-align:middle"></span>Ứng NCC</span>
     </div>`;
}

// ── Handler bộ lọc thời gian (gọi từ onclick filter buttons) ──
function _dbSetWeekFilter(f) {
  _dbWeekFilter = f;
  selectedDashboardWeekKey = ''; // reset tuần đang chọn khi đổi filter
  if (_dbLastWeeklyInvData && _dbLastWeeklyYr) {
    _dbBarChartWeekly(_dbLastWeeklyYr, _dbLastWeeklyInvData, _dbLastWeeklyUngData);
    _dbRenderHeatmap(_dbLastWeeklyYr, _dbLastWeeklyInvData, _dbLastWeeklyUngData);
    _dbPieChartWeekly(_dbLastWeeklyInvData, _dbLastWeeklyUngData); // reset về tổng quan
  }
}

// ── Pie Chart tỷ trọng (chế độ tuần) ─────────────────────────
// Hiển thị tỷ trọng 3 nguồn: Hóa đơn, Ứng TP, Ứng NCC
// Nếu selectedDashboardWeekKey → lọc theo tuần đó; không thì tổng năm
function _dbPieChartWeekly(invoiceData, ungData) {
  const C_INV = '#f0a500';
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
       <span style="flex:1;color:var(--ink2)">${e.name}</span>
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
  // Dùng cached data — không cần chạy lại full renderDashboard
  if (!_dbLastWeeklyInvData || !_dbLastWeeklyYr) return;
  _dbBarChartWeekly(_dbLastWeeklyYr, _dbLastWeeklyInvData, _dbLastWeeklyUngData);
  _dbPieChartWeekly(_dbLastWeeklyInvData, _dbLastWeeklyUngData);
}

// ══════════════════════════════════════════════════════════════
// HEATMAP: Chi phí theo Công Trình × Tuần
// Rows = top-15 CT theo tổng chi, Cols = tuần theo filter hiện tại
// Màu ô: trắng (0) → vàng nhạt → cam → cam đậm (max)
// ══════════════════════════════════════════════════════════════
function _dbRenderHeatmap(yr, invoiceData, ungData) {
  const wrap = document.getElementById('db-heatmap');
  if (!wrap) return;

  const allWeeks   = _dbGetWeeksInYear(yr);
  const weeklyData = _dbCalcWeeklyData(invoiceData, ungData);

  // Lấy dải tuần theo filter hiện tại (đồng bộ với bar chart)
  const today      = new Date();
  const todayISO   = isoFromParts(today.getFullYear(), today.getMonth()+1, today.getDate());
  const currSunKey = snapToSunday(todayISO);
  const currWkIdx  = allWeeks.findIndex(w => w.key === currSunKey);
  const endIdx     = currWkIdx >= 0 ? currWkIdx : allWeeks.length - 1;
  let startIdx = 0;
  if (_dbWeekFilter === '4')  startIdx = Math.max(0, endIdx - 3);
  if (_dbWeekFilter === '12') startIdx = Math.max(0, endIdx - 11);

  const dispWeeks   = allWeeks.slice(startIdx, endIdx + 1);
  const dispIndices = dispWeeks.map((_, i) => startIdx + i);

  // Thu thập CT có phát sinh trong dải tuần hiển thị
  const ctTotals = {};
  dispWeeks.forEach(w => {
    Object.entries(weeklyData[w.key]?.byCT || {}).forEach(([ct, amt]) => {
      ctTotals[ct] = (ctTotals[ct] || 0) + amt;
    });
  });

  const topCT = Object.entries(ctTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([ct]) => ct);

  if (!topCT.length) { wrap.innerHTML = ''; return; }

  // Max value toàn bảng để scale màu
  let maxCell = 0;
  topCT.forEach(ct => {
    dispWeeks.forEach(w => {
      const v = weeklyData[w.key]?.byCT?.[ct] || 0;
      if (v > maxCell) maxCell = v;
    });
  });

  // Header tuần: T1, T2, ...
  const hdrCells = dispWeeks.map((w, i) => {
    const wkNum = dispIndices[i] + 1;
    return `<th title="CN ${viShort(w.sun)} – T7 ${viShort(w.sat)}">T${wkNum}</th>`;
  }).join('');

  // Rows CT
  const rows = topCT.map(ct => {
    const cells = dispWeeks.map((w, i) => {
      const wkNum = dispIndices[i] + 1;
      const val   = weeklyData[w.key]?.byCT?.[ct] || 0;
      const bg    = _dbHeatmapColor(val, maxCell);
      const txt   = val >= 1e6 ? Math.round(val/1e6)+'tr' : val > 0 ? fmtS(val) : '';
      return `<td style="background:${bg}" title="${x(ct)} – T${wkNum}: ${fmtM(val)}">${txt}</td>`;
    }).join('');
    const rowTotal = dispWeeks.reduce((s, w) => s + (weeklyData[w.key]?.byCT?.[ct] || 0), 0);
    return `<tr>
      <td class="db-hm-ct" title="${x(ct)}">${x(ct.length > 24 ? ct.slice(0,24)+'…' : ct)}</td>
      ${cells}
      <td class="db-hm-total">${fmtS(rowTotal)}</td>
    </tr>`;
  }).join('');

  // Footer tổng theo tuần
  const footCells = dispWeeks.map(w => {
    const total = topCT.reduce((s, ct) => s + (weeklyData[w.key]?.byCT?.[ct] || 0), 0);
    return `<td class="db-hm-foot">${total >= 1e6 ? Math.round(total/1e6)+'tr' : ''}</td>`;
  }).join('');

  wrap.innerHTML = `
    <div class="section-header" style="margin-bottom:12px">
      <div class="section-title"><span class="dot"></span>🗓️ Bảng Nhiệt Chi Phí: Công Trình × Tuần</div>
      <span style="font-size:11px;color:var(--ink3)">Top 15 CT · ${dispWeeks.length} tuần · hover để xem chi tiết</span>
    </div>
    <div class="records-wrap" style="padding:14px 16px">
      <div class="db-heatmap-wrap">
        <table class="db-heatmap-table">
          <thead>
            <tr>
              <th class="db-hm-ct" style="text-align:left;min-width:130px">Công Trình</th>
              ${hdrCells}
              <th style="min-width:52px">Tổng</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td class="db-hm-ct" style="color:var(--ink3);font-weight:700">Tổng tuần</td>
              ${footCells}
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`;
}

// Trả về màu CSS tương ứng giá trị: trắng → vàng nhạt → cam → cam đậm
function _dbHeatmapColor(val, maxVal) {
  if (!val || !maxVal) return 'transparent';
  const r = val / maxVal; // 0..1
  if (r < 0.10) return '#fffbf0';
  if (r < 0.25) return '#fff0b3';
  if (r < 0.45) return '#ffd154';
  if (r < 0.70) return '#f0a500';
  return '#c97000';
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
      <div class="db-rank-num ${i===0?'top1':''}">${i===0?'🥇':i+1}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${inv.nd || inv.loai || '—'}
        </div>
        <div style="font-size:10px;color:var(--ink3)">${inv.ngay} · ${resolveProjectName(inv)||'—'}</div>
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
        <div style="font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
             title="${ct}">${ct}</div>
        <div class="db-rank-bar-bg" style="margin-top:4px">
          <div class="db-rank-bar-fill" style="width:${pct}%;background:${i===0?'var(--green)':'var(--gold)'}"></div>
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
          <div style="font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
               title="${x(ct)}">${x(ct)}</div>
          <div class="db-rank-bar-bg" style="margin-top:4px">
            <div class="db-rank-bar-fill" style="width:${pct}%;background:#4a90d9"></div>
          </div>
        </div>
        <div class="db-rank-amt">${fmtM(amt)}</div>
      </div>`;
    }).join('');
  } else {
    const rows = [...filtered]
      .sort((a,b) => b.ngay.localeCompare(a.ngay))
      .map(r => `<tr style="border-bottom:1px solid var(--line)">
        <td style="padding:7px 8px;white-space:nowrap;color:var(--ink3);font-size:12px">${r.ngay}</td>
        <td style="padding:7px 8px;font-weight:600">${x(r.tp)||'—'}</td>
        <td style="padding:7px 8px;color:var(--ink2);font-size:12px">${x(r.nd)||'—'}</td>
        <td style="padding:7px 8px;text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:700;color:#4a90d9;white-space:nowrap">${fmtM(r.tien||0)}</td>
      </tr>`).join('');
    const total = sumBy(filtered, 'tien');
    wrap.innerHTML = `<div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="font-size:11px;color:var(--ink3);border-bottom:2px solid var(--line)">
            <th style="text-align:left;padding:6px 8px;font-weight:600">Ngày</th>
            <th style="text-align:left;padding:6px 8px;font-weight:600">Thầu Phụ / NCC</th>
            <th style="text-align:left;padding:6px 8px;font-weight:600">Nội Dung</th>
            <th style="text-align:right;padding:6px 8px;font-weight:600">Số Tiền</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="font-weight:700;border-top:2px solid var(--line)">
            <td colspan="3" style="padding:7px 8px;color:var(--ink3)">Tổng cộng (${filtered.length} lần)</td>
            <td style="padding:7px 8px;text-align:right;font-family:'IBM Plex Mono',monospace;color:#4a90d9">${fmtM(total)}</td>
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
      ? `<div style="padding:10px 0;border-bottom:2px solid var(--gold);margin-bottom:4px">
          <div style="font-weight:800;color:var(--gold);margin-bottom:6px;font-size:13px">🏪 KHO TỔNG</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px">
            <span style="color:var(--ink3)">Tổng: <b style="color:var(--ink);font-size:14px">${khoTotal}</b></span>
            <span style="color:var(--green)">Đang hoạt động: <b>${khoHd}</b></span>
            <span style="color:var(--gold)">Cần bảo trì: <b>${khoLau}</b></span>
            <span style="color:var(--red)">Cần sửa chữa: <b>${khoSC}</b></span>
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
      `<div style="padding:10px 0;border-bottom:1px solid var(--line)">
        <div style="font-weight:700;color:var(--ink);margin-bottom:6px">${x(ct)}</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px">
          <span style="color:var(--ink3)">Tổng: <b style="color:var(--ink)">${s.total}</b></span>
          <span style="color:var(--green)">Đang hoạt động: <b>${s.dangHD}</b></span>
          <span style="color:var(--gold)">Cần bảo trì: <b>${s.hdLau}</b></span>
          <span style="color:var(--red)">Cần sửa chữa: <b>${s.canSC}</b></span>
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
      const ttColor = t.tinhtrang === 'Đang hoạt động' ? 'var(--green)'
                    : t.tinhtrang === 'Cần bảo trì'  ? 'var(--gold)'
                    : t.tinhtrang === 'Cần sửa chữa'   ? 'var(--red)'
                    : 'var(--ink3)';
      return `<tr style="border-bottom:1px solid var(--line)">
        <td style="padding:7px 8px;font-weight:600">${x(t.ten)}</td>
        <td style="padding:7px 8px;text-align:center;font-family:'IBM Plex Mono',monospace;font-weight:700;color:var(--gold)">${t.soluong||0}</td>
        <td style="padding:7px 8px;color:${ttColor}">${x(t.tinhtrang)||'—'}</td>
        <td style="padding:7px 8px;color:var(--ink3);font-size:12px">${x(t.ct)||'—'}</td>
      </tr>`;
    }).join('');

    wrap.innerHTML = `<div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="font-size:11px;color:var(--ink3);border-bottom:2px solid var(--line)">
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

