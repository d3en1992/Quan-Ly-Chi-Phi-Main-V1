// sync.js — Sync Engine (bản gọn, 1 document/năm + 1 document danh_muc)
// Load order: sau doanhthu.js, trước main.js
// ─────────────────────────────────────────────────────────────────────────────
// KIẾN TRÚC MỚI (đã gỡ bỏ engine V2 subcollection):
//   • Mỗi NĂM dữ liệu nghiệp vụ = 1 document trên Firestore:  cpct_data/y{NĂM}
//       (chứa hóa đơn, tiền ứng, chấm công, thiết bị, doanh thu của năm đó — đã nén)
//   • Toàn bộ DANH MỤC dùng chung = 1 document:  cpct_data/danh_muc
//       (loại CP, NCC, người TH, thầu phụ, công trình/projects, hợp đồng, users, ...)
//   → Không còn hàng nghìn document con (subcollection). Cloud gọn, dễ đọc.
//
//   • IndexedDB vẫn là nơi đọc nhanh (qua _mem) khi app chạy.
//   • Cloud là nguồn dữ liệu chính: pull = tải cloud về, push = đẩy local lên.
//   • Bước này VẪN merge (gộp) khi pull để KHÔNG mất dữ liệu trong giai đoạn chuyển đổi.
//     (Việc "chặn offline + ghi cloud tức thì" sẽ làm ở bước kế tiếp.)
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

// ══════════════════════════════════════════════════════════════
// [1] DEVICE IDENTITY — mã thiết bị, sinh 1 lần, lưu mãi
// ══════════════════════════════════════════════════════════════
const DEVICE_ID = (() => {
  let id = localStorage.getItem('deviceId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('deviceId', id);
    console.log('[Sync] 🆕 Device mới đăng ký:', id);
  }
  return id;
})();

// Key lưu thời điểm sync thành công cuối cùng (đặt ở core.storage.js: LAST_SYNC_KEY)

// ══════════════════════════════════════════════════════════════
// [2] SOFT DELETE — không xóa khỏi mảng, chỉ đánh dấu deletedAt
// (nhiều module gọi: thietbi.js, projects, chấm công...)
// ══════════════════════════════════════════════════════════════
function softDeleteRecord(arr, id) {
  const now = Date.now();
  return arr.map(r =>
    String(r.id) === String(id)
      ? { ...r, deletedAt: now, updatedAt: now, deviceId: DEVICE_ID }
      : r
  );
}

// ══════════════════════════════════════════════════════════════
// [3] CONFLICT RESOLUTION — bản nào mới hơn thì thắng (tombstone ưu tiên)
// ══════════════════════════════════════════════════════════════
function resolveConflict(local, cloud) {
  // Ưu tiên tombstone: nếu 1 bên đã xóa, bên kia chưa → bên xóa thắng
  // (tránh record "sống lại" khi thiết bị khác chưa nhận được lệnh xóa)
  if (local.deletedAt && !cloud.deletedAt) return local;
  if (!local.deletedAt && cloud.deletedAt) return cloud;

  // Cùng trạng thái → bản có updatedAt mới hơn thắng
  const lt = local.updatedAt || local.createdAt || local._ts || 0;
  const ct = cloud.updatedAt || cloud.createdAt || 0;
  return lt >= ct ? local : cloud;
}

// ══════════════════════════════════════════════════════════════
// [4] MERGE — gộp 2 mảng theo id, mỗi id giữ bản mới nhất
// ══════════════════════════════════════════════════════════════
function mergeDatasets(local, cloud) {
  const map = new Map();
  (local || []).forEach(r => map.set(String(r.id), r));
  (cloud || []).forEach(cloudR => {
    const key    = String(cloudR.id);
    const localR = map.get(key);
    map.set(key, localR ? resolveConflict(localR, cloudR) : cloudR);
  });
  return [...map.values()];
}

// Gộp users an toàn (mật khẩu chỉ có ở local — không bị cloud ghi đè mất)
function _mergeUsersSafe(localUsers, cloudUsers) {
  if (typeof mergeUsers === 'function') return mergeUsers(localUsers, cloudUsers);
  const local = Array.isArray(localUsers) ? localUsers : [];
  const cloud = Array.isArray(cloudUsers) ? cloudUsers : [];
  const byId = new Map();
  [...local, ...cloud].forEach((u, idx) => {
    if (!u) return;
    const id = u.id || u.username || `legacy_${idx}`;
    const prev = byId.get(id);
    if (!prev || (Number(u.updatedAt) || 0) >= (Number(prev.updatedAt) || 0)) byId.set(id, u);
  });
  return [...byId.values()];
}

// ══════════════════════════════════════════════════════════════
// [5] MULTI-YEAR HELPER — lấy tất cả năm có trong dữ liệu local
// ══════════════════════════════════════════════════════════════
function _getAllLocalYears() {
  const yrs = new Set();
  const addYr = (arr, field) =>
    (arr || []).forEach(r => { const d = r[field]; if (d && d.length >= 4) yrs.add(d.slice(0, 4)); });
  addYr(load('inv_v3', []), 'ngay');
  addYr(load('ung_v1', []), 'ngay');
  addYr(load('cc_v2',  []), 'fromDate');
  addYr(load('tb_v1',  []), 'ngay');
  addYr(load('thu_v1', []), 'ngay');
  yrs.add(String(activeYear || new Date().getFullYear())); // luôn gồm năm hiện tại
  return [...yrs].filter(Boolean).sort();
}

// ══════════════════════════════════════════════════════════════
// [6] NORMALIZE CC — 1 tuần + 1 công trình = 1 record duy nhất
// (chamcong.core.js gọi qua _dedupCC; giữ nguyên logic dedup theo logical key)
// ══════════════════════════════════════════════════════════════

// Mốc thời gian hợp lệ tối thiểu: 2020-01-01 (ms). Trước mốc này = chưa set / lỗi.
const _TS_EPOCH = 1577836800000;

// Làm sạch timestamp trước khi so sánh (chống lệch giờ máy / giá trị 0)
function _safeTs(ts) {
  const n = typeof ts === 'number' ? ts : parseInt(ts) || 0;
  if (n < _TS_EPOCH)             return 0;           // quá cũ / chưa set → thua
  if (n > Date.now() + 86400000) return Date.now();  // lệch giờ tương lai → kẹp về now
  return n;
}

// Điền projectId cho record CC thiếu (có tên CT nhưng chưa có projectId)
function _fillCCProjectId(records) {
  if (!records || !records.length) return records;
  if (typeof projects === 'undefined' || !projects.length) return records;
  const nameMap = new Map();
  projects.forEach(p => { if (p.id && p.name && !p.deletedAt) nameMap.set(p.name, p.id); });
  if (!nameMap.size) return records;
  let changed = false;
  const result = records.map(r => {
    if (r.projectId || !r.ct) return r;
    const pid = nameMap.get(r.ct);
    if (!pid) return r;
    changed = true;
    return { ...r, projectId: pid };
  });
  return changed ? result : records;
}

// Gom CC theo (tuần + công trình), giữ bản mới nhất
function normalizeCC(records) {
  const filled = _fillCCProjectId(records || []);
  const byKey = new Map();
  filled.forEach(r => {
    const date = r.fromDate || r.from || '';
    const proj = r.projectId || r.ct  || '';
    const key  = `${date}__${proj}`;
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, r); return; }
    const prevTs = _safeTs(prev.updatedAt || prev.createdAt || 0);
    const rTs    = _safeTs(r.updatedAt   || r.createdAt   || 0);
    if (rTs > prevTs) {
      byKey.set(key, r);
    } else if (rTs === prevTs && r.deletedAt && !prev.deletedAt) {
      byKey.set(key, r); // hòa + có tombstone → bản xóa thắng
    }
  });
  return [...byKey.values()];
}

// ══════════════════════════════════════════════════════════════
// [7] CỜ TRẠNG THÁI SYNC
// ══════════════════════════════════════════════════════════════
let _syncPushing = false;
let _syncPulling = false;
function isSyncing() { return _syncPushing || _syncPulling; }

// ══════════════════════════════════════════════════════════════
// [8] MERGE CLOUD → LOCAL — ghi vào _mem + IDB (không trigger sync)
// ══════════════════════════════════════════════════════════════
function _mergeKey(key, cloudExpanded) {
  if (!cloudExpanded || !cloudExpanded.length) return 0;
  const local  = load(key, []);
  const merged = mergeDatasets(local, cloudExpanded);
  _memSet(key, merged);
  return merged.length - local.length;
}

// Gộp danh mục dạng object {tên: dữ liệu} theo LWW (max của updatedAt & deletedAt)
function _mergeHopDong(localHd, cloudHd) {
  const merged = { ...cloudHd };
  Object.entries(localHd || {}).forEach(([ct, local]) => {
    const cloud = merged[ct];
    if (!cloud) { merged[ct] = local; return; }
    const localTs = Math.max(Number(local.updatedAt) || 0, Number(local.deletedAt) || 0);
    const cloudTs = Math.max(Number(cloud.updatedAt) || 0, Number(cloud.deletedAt) || 0);
    if (localTs >= cloudTs) merged[ct] = local;
  });
  return merged;
}

// Gộp cat_items_v1 (per-item theo updatedAt) + dedup theo tên + canonical hóa tên
function _mergeCatItems(localItems, cloudItems) {
  const _normKey = s => (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[đĐ]/g,'d').toLowerCase().replace(/\s+/g,' ').trim();
  const nowMs = Date.now();
  const merged   = {};
  const allTypes = new Set([...Object.keys(localItems || {}), ...Object.keys(cloudItems || {})]);
  allTypes.forEach(type => {
    const byId = new Map();
    (localItems[type] || []).forEach(item => byId.set(item.id, item));
    (cloudItems[type] || []).forEach(ci => {
      const li = byId.get(ci.id);
      if (!li || (ci.updatedAt || 0) >= (li.updatedAt || 0)) byId.set(ci.id, ci);
    });
    const byNorm = new Map();
    [...byId.values()]
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .forEach(item => {
        if (item.isDeleted) return;
        const norm = _normKey(item.name);
        if (byNorm.has(norm)) byId.set(item.id, { ...item, isDeleted: true, updatedAt: nowMs });
        else byNorm.set(norm, item.id);
      });
    merged[type] = [...byId.values()];
  });
  if (typeof normalizeCatDisplayName === 'function') {
    Object.keys(merged).forEach(type => {
      (merged[type] || []).forEach(item => {
        if (item.isDeleted) return;
        const canonical = normalizeCatDisplayName(type, item.name);
        if (canonical !== item.name) { item.name = canonical; item.updatedAt = nowMs; }
      });
    });
  }
  return merged;
}

// Từ cat_items_v1 đã merge → dựng lại các mảng tên (cat_loai, cat_ncc, ...)
function _applyCatItemArrays(merged) {
  const _normKey = s => (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[đĐ]/g,'d').toLowerCase().replace(/\s+/g,' ').trim();
  const nameArr = (items, type) => {
    const seen = new Set();
    return (items || []).filter(i => !i.isDeleted)
      .map(i => typeof normalizeCatDisplayName === 'function'
        ? normalizeCatDisplayName(type, i.name) : i.name)
      .filter(n => { const k = _normKey(n); return seen.has(k) ? false : (seen.add(k), true); });
  };
  if (merged.loai)  _memSet('cat_loai',  nameArr(merged.loai,  'loai'));
  if (merged.ncc)   _memSet('cat_ncc',   nameArr(merged.ncc,   'ncc'));
  if (merged.nguoi) _memSet('cat_nguoi', nameArr(merged.nguoi, 'nguoi'));
  if (merged.tp)    _memSet('cat_tp',    nameArr(merged.tp,    'tp'));
  if (merged.cn)    _memSet('cat_cn',    nameArr(merged.cn,    'cn'));
  if (merged.tbteb) _memSet('cat_tbteb', nameArr(merged.tbteb, 'tbteb'));
}

// ══════════════════════════════════════════════════════════════
// [9] PUSH — đẩy dữ liệu local lên cloud (đọc-gộp-ghi từng năm + danh_muc)
// ══════════════════════════════════════════════════════════════
// opts.silent   = true  → chạy ngầm, chỉ hiện banner khi lỗi
// opts.skipPull = true  → bỏ bước đọc-gộp cloud trước khi ghi (dùng sau import)
async function pushChanges(opts = {}) {
  const silent   = opts?.silent   ?? false;
  const skipPull = opts?.skipPull ?? false;
  if (!fbReady()) { console.log('[Sync] Push bỏ qua — Firebase chưa cấu hình'); return; }
  if (_syncPushing) { console.log('[Sync] Push bỏ qua — đang sync'); return; }

  _syncPushing = true;
  _ensureSyncDot(); _setSyncDot('syncing');
  _setSyncState('syncing');
  if (!silent) showSyncBanner('⏳ Đang đẩy (push)...');

  // Push ngầm: chỉ năm hiện tại (nhẹ). Push thủ công: tất cả năm.
  const _curYr = String(activeYear || new Date().getFullYear());
  const years  = silent ? [_curYr] : _getAllLocalYears();
  console.log('[Sync] ▲ Push bắt đầu — năm:', years.join(', '), '| device:', DEVICE_ID.slice(0, 8));

  try {
    let ok = 0, fail = 0;

    for (const yr of years) {
      const yrInt = parseInt(yr);
      try {
        // ── B1: đọc cloud năm này, gộp vào local (tránh ghi đè dữ liệu thiết bị khác) ──
        if (!skipPull) {
          const cloudDoc  = await fsGet(fbDocYear(yrInt));
          const cloudData = fsUnwrap(cloudDoc);
          if (cloudData) {
            if (cloudData.i)   _mergeKey('inv_v3', expandInv(cloudData.i));
            if (cloudData.u)   _mergeKey('ung_v1', expandUng(cloudData.u));
            if (cloudData.c)   { const norm = normalizeCC([...load('cc_v2',[]), ...expandCC(cloudData.c)]); _memSet('cc_v2', norm); }
            if (cloudData.t)   _mergeKey('tb_v1',  expandTb(cloudData.t));
            if (cloudData.thu) { _mergeKey('thu_v1', cloudData.thu); thuRecords = load('thu_v1', []); }
          }
        }

        // ── B2: ghi (overwrite) document năm bằng dữ liệu local đã gộp ──
        const payload = fbYearPayload(yrInt);
        const res     = await fsSet(fbDocYear(yrInt), payload);
        if (res && res.fields) { ok++; console.log(`[Sync] ▲ Year ${yr} OK`); }
        else { fail++; console.warn(`[Sync] ✗ Year ${yr} ghi lỗi`); }
      } catch (e) {
        console.warn(`[Sync] ✗ Year ${yr} exception:`, e.message || e);
        fail++;
      }
    }

    // ── Danh mục dùng chung: đọc-gộp-ghi document danh_muc ──
    try {
      if (!skipPull) await _pullDanhMuc();   // gộp cloud → local trước
      const res = await fsSet(fbDocCats(), fbCatsPayload());
      if (!(res && res.fields)) console.warn('[Sync] ✗ danh_muc ghi lỗi');
    } catch (e) {
      console.warn('[Sync] danh_muc push lỗi:', e.message || e);
    }

    if (fail === 0) {
      localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
      _setSyncDot('');
      if (typeof _resetPending === 'function') _resetPending();
      if (!silent) {
        _setSyncState('success');
        const hhmm = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        showSyncBanner(`✅ Đã đồng bộ lúc ${hhmm}`, 3000);
      } else if (typeof updateJbBtn === 'function') {
        updateJbBtn();
      }
      console.log(`[Sync] ▲ Push xong — ${ok} năm | device: ${DEVICE_ID.slice(0, 8)}`);
    } else {
      _setSyncDot('error'); _setSyncState('error');
      showSyncBanner('⚠️ Sync lỗi', 4000);
    }
  } catch (e) {
    console.warn('[Sync] ▲ Push lỗi toàn bộ:', e);
    _setSyncDot('offline'); _setSyncState('error');
    showSyncBanner('⚠️ Mất kết nối internet', 3000);
  } finally {
    _syncPushing = false;
  }
}

// ══════════════════════════════════════════════════════════════
// [10] PULL DANH MỤC — đọc document danh_muc, gộp vào local
// ══════════════════════════════════════════════════════════════
async function _pullDanhMuc() {
  const doc  = await fsGet(fbDocCats());
  const data = fsUnwrap(doc);
  if (!data) { console.log('[Sync] ▼ danh_muc chưa có trên cloud'); return false; }

  // còn pending → giữ nguyên các mảng tên danh mục local (tránh xóa nhầm)
  const hasPending = typeof _pendingChanges !== 'undefined' && _pendingChanges > 0;

  // projects (công trình) — nguồn gốc của cat_ct
  if (Array.isArray(data.projects)) {
    const merged = mergeDatasets(load('projects_v1', []), data.projects);
    _memSet('projects_v1', merged);
    if (typeof projects !== 'undefined') projects = merged;
    if (typeof rebuildCatCTFromProjects === 'function') rebuildCatCTFromProjects();
  }

  // users — gộp an toàn (giữ mật khẩu local)
  if (Array.isArray(data.users)) {
    const merger = typeof _mergeUsersV2 === 'function' ? _mergeUsersV2 : _mergeUsersSafe;
    _memSet('users_v1', merger(load('users_v1', []), data.users));
  }

  // cat_items_v1 — per-item, source of truth cho các mảng tên danh mục
  if (data.catItems && typeof data.catItems === 'object') {
    const merged = _mergeCatItems(load('cat_items_v1', {}), data.catItems);
    _memSet('cat_items_v1', merged);
    _applyCatItemArrays(merged);
  }

  // hợp đồng (object map theo tên CT)
  if (data.hopDong && typeof data.hopDong === 'object') {
    const merged = _mergeHopDong(load('hopdong_v1', {}), data.hopDong);
    _memSet('hopdong_v1', merged);
    if (typeof hopDongData !== 'undefined') hopDongData = merged;
  }

  // thầu phụ (mảng)
  if (Array.isArray(data.thauPhu)) {
    const merged = mergeDatasets(load('thauphu_v1', []), data.thauPhu);
    _memSet('thauphu_v1', merged);
    if (typeof thauPhuContracts !== 'undefined') thauPhuContracts = merged;
  }

  // vai trò công nhân — chỉ áp khi không còn pending
  if (data.cnRoles && typeof data.cnRoles === 'object' && !hasPending) {
    const localRoles  = load('cat_cn_roles', {});
    const mergedRoles  = { ...data.cnRoles, ...localRoles };
    _memSet('cat_cn_roles', mergedRoles);
    if (typeof cnRoles !== 'undefined') cnRoles = mergedRoles;
  }

  // năm theo công trình — union
  if (data.ctYears && typeof data.ctYears === 'object') {
    const mergedYears = { ...load('cat_ct_years', {}) };
    Object.entries(data.ctYears).forEach(([ct, yr]) => { if (!(ct in mergedYears)) mergedYears[ct] = yr; });
    _memSet('cat_ct_years', mergedYears);
    if (typeof cats !== 'undefined') cats.congTrinhYears = mergedYears;
  }

  console.log('[Sync] ▼ danh_muc đã gộp');
  return true;
}

// ══════════════════════════════════════════════════════════════
// [11] PULL — tải cloud về, gộp vào local (danh_muc + từng năm)
// ══════════════════════════════════════════════════════════════
// yr=null → pull tất cả năm local; yr=số → pull đúng năm đó
async function pullChanges(yr, callback, opts = {}) {
  const silent = opts?.silent ?? false;
  if (!fbReady()) {
    console.log('[Sync] Pull bỏ qua — Firebase chưa cấu hình');
    if (callback) callback(null);
    return;
  }
  if (_syncPulling) {
    console.log('[Sync] Pull bỏ qua — đang pull');
    if (callback) callback(null);
    return;
  }
  _syncPulling = true;

  // Chặn pull sau reset (giữ tương thích với import/reset — dùng cờ localStorage)
  {
    const _lsBlock = parseInt(localStorage.getItem('_blockPullUntil') || '0');
    const _memBlock = (typeof _blockPullUntil !== 'undefined') ? _blockPullUntil : 0;
    const _blockEnd = Math.max(_lsBlock, _memBlock);
    if (Date.now() < _blockEnd) {
      console.log(`[Sync] Pull bị chặn sau reset — còn ${Math.round((_blockEnd - Date.now())/1000)}s`);
      _syncPulling = false;
      if (callback) callback(null);
      return;
    }
    if (_lsBlock && Date.now() >= _lsBlock) localStorage.removeItem('_blockPullUntil');
  }

  const years = yr ? [String(yr)] : _getAllLocalYears();
  console.log('[Sync] ▼ Pull bắt đầu — năm:', years.join(', '), '| device:', DEVICE_ID.slice(0, 8));
  if (!silent) showSyncBanner('⬇ Đang tải (pull)...');

  try {
    // ── Danh mục dùng chung ──
    let _catsChanged = false;
    try { _catsChanged = await _pullDanhMuc(); }
    catch (e) { console.warn('[Sync] danh_muc pull lỗi:', e.message || e); }

    // ── Dữ liệu từng năm ──
    let totalNew = 0, totalConflicts = 0;

    const mergeAndCount = (key, cloudArr, yrStr) => {
      const local     = load(key, []);
      const merged    = mergeDatasets(local, cloudArr);
      const newRecs   = merged.filter(m => !local.find(l => String(l.id) === String(m.id))).length;
      const conflicts = cloudArr.filter(cr => {
        const lr = local.find(l => String(l.id) === String(cr.id));
        return lr && (lr.updatedAt || lr._ts || 0) !== (cr.updatedAt || 0);
      }).length;
      totalNew += newRecs; totalConflicts += conflicts;
      _memSet(key, merged);
      if (newRecs || conflicts) console.log(`[Sync] ▼ ${key} năm ${yrStr}: +${newRecs} mới, ${conflicts} đổi`);
    };

    const mergeCCAndCount = (cloudCC, yrStr) => {
      const localCC    = load('cc_v2', []);
      const normalized = normalizeCC([...localCC, ...cloudCC]);
      const newRecs    = normalized.filter(n => !localCC.find(l => String(l.id) === String(n.id))).length;
      totalNew += newRecs;
      _memSet('cc_v2', normalized);
      if (typeof ccData !== 'undefined') ccData = normalized;
    };

    for (const yrStr of years) {
      try {
        const doc  = await fsGet(fbDocYear(parseInt(yrStr)));
        const data = fsUnwrap(doc);
        if (!data) { console.log(`[Sync] ▼ Năm ${yrStr} chưa có trên cloud`); continue; }
        if (data.i)   mergeAndCount('inv_v3', expandInv(data.i), yrStr);
        if (data.u)   mergeAndCount('ung_v1', expandUng(data.u), yrStr);
        if (data.c)   mergeCCAndCount(expandCC(data.c), yrStr);
        if (data.t)   mergeAndCount('tb_v1',  expandTb(data.t), yrStr);
        if (data.thu) { mergeAndCount('thu_v1', data.thu, yrStr); thuRecords = load('thu_v1', []); }
        console.log(`[Sync] ▼ Năm ${yrStr} đã gộp`);
      } catch (e) {
        console.warn(`[Sync] Pull năm ${yrStr} lỗi:`, e.message || e);
      }
    }

    if (!silent) hideSyncBanner();
    console.log(`[Sync] ▼ Pull xong — ${totalNew} record mới, ${totalConflicts} đổi${_catsChanged ? ', danh mục cập nhật' : ''}`);
    if (callback) callback({ newRecords: totalNew, conflicts: totalConflicts, catsChanged: _catsChanged });
    if (typeof afterSync === 'function') afterSync();

  } catch (e) {
    console.warn('[Sync] ▼ Pull lỗi toàn bộ:', e);
    if (!silent) hideSyncBanner();
    if (callback) callback(null);
  } finally {
    _syncPulling = false;
  }
}

// ══════════════════════════════════════════════════════════════
// [12] SCHEDULE PUSH — đẩy ngầm sau khi save() (debounce 5 phút)
// (sẽ được thay bằng "ghi cloud tức thì" ở bước kế tiếp)
// ══════════════════════════════════════════════════════════════
let _pushTimer = null;

function cancelScheduledPush() {
  clearTimeout(_pushTimer);
  _pushTimer = null;
}

function schedulePush() {
  if (!fbReady()) return;
  if (typeof _pendingChanges !== 'undefined' && _pendingChanges <= 0) return;
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(async () => {
    _pushTimer = null;
    if (isSyncing()) { _pushTimer = setTimeout(schedulePush, 15_000); return; }
    if (typeof _pendingChanges !== 'undefined' && _pendingChanges > 0) {
      await pushChanges({ silent: true, skipPull: true });
    }
  }, 300_000); // 5 phút — flush-on-hide đảm bảo đẩy nốt khi đóng tab
}

// ══════════════════════════════════════════════════════════════
// [13] MANUAL SYNC — nút 🔄 Sync: pull → reload globals → push → render
// ══════════════════════════════════════════════════════════════
async function manualSync() {
  if (!navigator.onLine) {
    if (typeof toast === 'function') toast('🔴 Không có mạng — không thể sync', 'error');
    return;
  }
  if (!fbReady()) {
    if (typeof toast === 'function') toast('Chưa kết nối Firebase', 'error');
    return;
  }
  if (isSyncing()) {
    if (typeof toast === 'function') toast('Đang sync, vui lòng chờ...', 'info');
    return;
  }

  const _sBtns = ['sync-btn', 'jb-btn'].map(id => document.getElementById(id)).filter(Boolean);
  _sBtns.forEach(b => { b.disabled = true; b.style.opacity = '.6'; });

  try {
    // B1: Pull — chỉ pull năm đang xem
    const _syncYr = (typeof activeYears !== 'undefined' && activeYears.size === 1)
      ? [...activeYears][0]
      : (typeof activeYear !== 'undefined' && activeYear ? activeYear : new Date().getFullYear());
    await new Promise(resolve => pullChanges(_syncYr, resolve));

    // B2: Reload globals + clear cache
    if (typeof _reloadGlobals === 'function') _reloadGlobals();
    else if (typeof clearAllCache === 'function') clearAllCache();

    // B3: Push (đẩy lên cả year doc + danh_muc)
    await pushChanges({ silent: false });

    if (typeof resetCatNamesMigrated === 'function') resetCatNamesMigrated();

    // B4: Render
    if (typeof afterDataChange === 'function') afterDataChange();
    else if (typeof renderActiveTab === 'function') renderActiveTab();
    else if (typeof _refreshAllTabs === 'function') _refreshAllTabs();
  } finally {
    _sBtns.forEach(b => { b.disabled = false; b.style.opacity = ''; });
  }
}

// ══════════════════════════════════════════════════════════════
// [14] PROCESS QUEUE — giữ stub để code cũ gọi không lỗi
// ══════════════════════════════════════════════════════════════
function processQueue() { /* no-op: sync theo batch qua manualSync / schedulePush */ }

// ══════════════════════════════════════════════════════════════
// [15] FLUSH ON HIDE — đẩy nốt dữ liệu khi tab bị ẩn/đóng
// (chống mất dữ liệu trên mobile khi khóa màn hình / tắt trình duyệt)
// ══════════════════════════════════════════════════════════════
let _lastFlushTs = 0; // giới hạn: tối đa 1 lần / 10s
(function() {
  function _flushOnHide() {
    if (!fbReady()) return;
    if (typeof _pendingChanges === 'undefined' || _pendingChanges <= 0) return;
    if (isSyncing()) return;
    if (Date.now() - _lastFlushTs < 10_000) return;
    _lastFlushTs = Date.now();
    console.log('[Sync] ⚡ Flush on hide — có', _pendingChanges, 'thay đổi chưa sync');
    pushChanges({ silent: true, skipPull: true });
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) _flushOnHide(); });
  window.addEventListener('pagehide', _flushOnHide);
})();
