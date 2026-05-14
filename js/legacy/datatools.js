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

// ══════════════════════════════════════════════════════════════
// [MODULE: DASHBOARD] — KPI · Bar chart · Pie · Top5 · By CT
// Tìm nhanh: Ctrl+F → "MODULE: DASHBOARD"
// ══════════════════════════════════════════════════════════════

function renderDashboard() {
  const ay = typeof activeYears !== 'undefined' ? activeYears : new Set();
  const yr = ay.size === 0 ? 0 : (ay.size === 1 ? [...ay][0] : 0);
  const yrLabel = ay.size === 0 ? 'Tất cả năm'
                : ay.size === 1 ? `Năm ${[...ay][0]}`
                : 'Năm ' + [...ay].sort((a,b)=>a-b).join(', ');
  _dbPopulateCTFilter();

  // Tầng 1: tổng quan năm (không filter CT)
  const dataYear = getInvoicesCached().filter(i => inActiveYear(i.ngay));

  // Tầng 2: chi tiết theo CT (có filter)
  const dataDetail = getInvoicesCached().filter(i =>
    inActiveYear(i.ngay) &&
    (!selectedCT || resolveProjectName(i) === selectedCT)
  );

  if (!dataYear.length) {
    ['db-kpi-row','db-bar-chart','db-pie-chart','db-top5','db-ung-ct','db-tb-ct'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<div class="db-empty">Chưa có dữ liệu cho ' + yrLabel + '</div>';
    });
    return;
  }

  // Tổng quan năm — không bị filter CT
  _dbKPI(dataYear, yr);
  _dbBarChart(dataYear);
  _dbPieChart(dataYear);

  // Chi tiết theo CT — bị filter khi chọn CT
  _dbTop5(dataDetail);
  _dbUngByCT();
  _dbTBByCT();

  renderCtPage();   // Chi tiết từng CT (gộp từ tab cũ)
}

// ── Populate CT filter dropdown (Dashboard) ────────────────────
function _dbPopulateCTFilter() {
  const sel = document.getElementById('db-filter-ct');
  if (!sel) return;
  sel.innerHTML = _buildProjFilterOpts(selectedCT, { includeCompany: false, placeholder: '-- Tất cả công trình --' });
}

// ── KPI Cards ─────────────────────────────────────────────────
function _dbKPI(data, yr) {
  const total   = data.reduce((s, i) => s + (i.thanhtien || i.tien || 0), 0);
  const months  = new Set(data.map(i => i.ngay?.slice(0,7))).size;
  const avgMonth= months ? Math.round(total / months) : 0;
  const maxInv  = data.reduce((mx, i) => (i.thanhtien||i.tien||0) > (mx.thanhtien||mx.tien||0) ? i : mx, data[0]);
  const ctSet   = new Set(data.map(i => resolveProjectName(i)).filter(Boolean));

  const cards = [
    { label:'Tổng Chi Phí ' + yr,  val: fmtM(total),      sub: data.length + ' hóa đơn',         cls:'accent-gold'  },
    { label:'TB / Tháng',           val: fmtM(avgMonth),   sub: months + ' tháng có phát sinh',    cls:'accent-blue'  },
    { label:'HĐ Lớn Nhất',          val: fmtM(maxInv.thanhtien||maxInv.tien||0),
                                    sub: (maxInv.nd||maxInv.loai||'').slice(0,30),                  cls:'accent-red'   },
    { label:'Công Trình',           val: ctSet.size,       sub: 'đang theo dõi năm ' + yr,         cls:'accent-green' },
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

