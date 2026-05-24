// sync.js — Sync Engine v2
// Load order: sau doanhthu.js, trước main.js
// Nguyên tắc: IndexedDB = source of truth | pull→merge→push | all years | soft delete

'use strict';

// ══════════════════════════════════════════════════════════════
// [1] DEVICE IDENTITY — sinh 1 lần, lưu mãi
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

// ══════════════════════════════════════════════════════════════
// [2] SOFT DELETE — không xóa khỏi array, chỉ đánh dấu
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
// [4] CONFLICT RESOLUTION — tombstone priority, rồi updatedAt mới hơn thắng
// ══════════════════════════════════════════════════════════════
function resolveConflict(local, cloud) {
  // Tombstone priority: nếu 1 bên đã xóa và bên kia chưa → bên xóa luôn thắng.
  // Ngăn record sống lại khi thiết bị khác chưa nhận tombstone và push lại version cũ.
  if (local.deletedAt && !cloud.deletedAt) return local;
  if (!local.deletedAt && cloud.deletedAt) return cloud;

  // Cả 2 cùng trạng thái xóa (hoặc cùng chưa xóa): latest updatedAt thắng
  // Fallback sang _ts nếu record cũ chưa có updatedAt
  const lt = local.updatedAt  || local.createdAt  || local._ts || 0;
  const ct = cloud.updatedAt  || cloud.createdAt  || 0;
  if (lt !== ct) {
    console.log('[Sync] ⚔ Conflict id:', String(local.id).slice(0, 8),
      '| local.updatedAt:', lt, '| cloud.updatedAt:', ct,
      '| winner:', lt >= ct ? 'LOCAL' : 'CLOUD');
  }
  return lt >= ct ? local : cloud;
}

// ══════════════════════════════════════════════════════════════
// [5] MERGE ALGORITHM — idempotent, safe
// ══════════════════════════════════════════════════════════════
// Khác mergeUnique (dùng object spread đơn giản):
//  - Dùng resolveConflict() có logging
//  - Local-only records được giữ (chưa push lên cloud)
//  - Cloud-only records được thêm vào local
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

// ══════════════════════════════════════════════════════════════
// [6] MULTI-YEAR HELPER — lấy tất cả năm có trong local data
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
  // Luôn bao gồm năm hiện tại
  yrs.add(String(activeYear || new Date().getFullYear()));
  return [...yrs].filter(Boolean).sort();
}

// ══════════════════════════════════════════════════════════════
// [7] MERGE KEY — merge cloud data vào _mem + IDB
// ══════════════════════════════════════════════════════════════
function _mergeKey(key, cloudExpanded) {
  if (!cloudExpanded || !cloudExpanded.length) return 0;
  const local  = load(key, []);
  const merged = mergeDatasets(local, cloudExpanded);
  _memSet(key, merged); // ghi _mem + IDB, không trigger sync
  return merged.length - local.length;
}

// [ADDED] users_v1 merge — safe fallback when auth helpers are not ready yet
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
// [7b] SYNC LOCK — block dangerous ops khi đang sync
// ══════════════════════════════════════════════════════════════
let _syncPulling = false;
function isSyncing() { return _syncPushing || _syncPulling; }

// ══════════════════════════════════════════════════════════════
// [8] SYNC QUEUE (lightweight tracking)
// ══════════════════════════════════════════════════════════════
const _PENDING_KEY = 'syncPending';

function enqueueChange(recordId, type) {
  const q   = _loadLS(_PENDING_KEY) || [];
  const idx = q.findIndex(c => String(c.id) === String(recordId));
  const entry = { id: String(recordId), type, ts: Date.now() };
  if (idx >= 0) q[idx] = entry; else q.push(entry);
  if (q.length > 500) q.splice(0, q.length - 500); // giới hạn 500 entries
  _saveLS(_PENDING_KEY, q);
}

function _clearQueue() { _saveLS(_PENDING_KEY, []); }

function getPendingCount() { return (_loadLS(_PENDING_KEY) || []).length; }

// ══════════════════════════════════════════════════════════════
// [8b] NORMALIZE CC — logical key dedup + safe timestamps
// ══════════════════════════════════════════════════════════════

// Timestamp hợp lệ tối thiểu: 2020-01-01 (ms). Trước ngày này = chưa set hoặc lỗi.
const _TS_EPOCH = 1577836800000;

/**
 * Fix 2 — Safe updatedAt: sanitize timestamp trước khi so sánh.
 * - < 2020: chưa set hoặc invalid → trả 0 (sẽ thua mọi record có ts hợp lệ)
 * - > now + 24h: clock skew trên thiết bị gửi → clamp về now()
 * - Còn lại: giữ nguyên
 */
function _safeTs(ts) {
  const n = typeof ts === 'number' ? ts : parseInt(ts) || 0;
  if (n < _TS_EPOCH)             return 0;           // too old / unset — loses
  if (n > Date.now() + 86400000) return Date.now();  // clock skew — clamp
  return n;
}

/**
 * Fix 1 — Enforce projectId: điền projectId cho cc records thiếu (có ct nhưng không có projectId).
 * Cần `projects[]` đã load. Nếu chưa có → trả nguyên (không thay đổi).
 * Immutable: chỉ tạo array mới khi thực sự có record nào được fill.
 */
function _fillCCProjectId(records) {
  if (!records || !records.length) return records;
  if (typeof projects === 'undefined' || !projects.length) return records;
  // Build name → id map (chỉ project chưa xóa)
  const nameMap = new Map();
  projects.forEach(p => { if (p.id && p.name && !p.deletedAt) nameMap.set(p.name, p.id); });
  if (!nameMap.size) return records;
  let changed = false;
  const result = records.map(r => {
    if (r.projectId || !r.ct) return r;   // đã có hoặc không có tên CT → bỏ qua
    const pid = nameMap.get(r.ct);
    if (!pid) return r;                    // CT không khớp project nào → bỏ qua
    changed = true;
    return { ...r, projectId: pid };
  });
  return changed ? result : records;
}

/**
 * HARD RULE: 1 tuần + 1 công trình = 1 record duy nhất.
 *
 * cc_v2 records được tạo độc lập trên nhiều thiết bị → khác id nhưng cùng tuần+CT.
 * normalizeCC nhóm theo logical key (fromDate + projectId), giữ record mới nhất.
 *
 * Gọi ở: pullChanges (union cloud+local), pushChanges (pre-merge), _reloadGlobals, import.
 */
function normalizeCC(records) {
  // Fill missing projectId trước — làm cho logical key ổn định
  const filled = _fillCCProjectId(records || []);

  const byKey = new Map();
  filled.forEach(r => {
    // Fix 1: dùng projectId làm key; ct chỉ là fallback khi map thất bại (record legacy)
    const date = r.fromDate || r.from || '';
    const proj = r.projectId || r.ct  || '';
    const key  = `${date}__${proj}`;

    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, r); return; }

    // Fix 2: _safeTs loại bỏ ảnh hưởng của clock skew và timestamp bị 0/invalid
    const prevTs = _safeTs(prev.updatedAt || prev.createdAt || 0);
    const rTs    = _safeTs(r.updatedAt   || r.createdAt   || 0);

    if (rTs > prevTs) {
      byKey.set(key, r);                             // mới hơn thắng
    } else if (rTs === prevTs && r.deletedAt && !prev.deletedAt) {
      byKey.set(key, r);                             // tie + tombstone: deleted wins
    }
    // rTs < prevTs → giữ prev
  });
  return [...byKey.values()];
}

// NOTE: _dedupCC được định nghĩa trong chamcong.js (load trước sync.js).
// normalizeCC là canonical implementation; chamcong.js/_dedupCC dùng cùng logic.

// ══════════════════════════════════════════════════════════════
// [9] PUSH — pull-then-merge-then-push, tất cả năm
// ══════════════════════════════════════════════════════════════
let _syncPushing = false;

// opts.silent   = true  → chạy ngầm, không banner, chỉ lỗi mới hiện
// opts.silent   = false → hiện đầy đủ UI (mặc định khi user bấm lưu)
// opts.skipPull = true  → bỏ qua bước fetch+merge cloud trước khi push (dùng sau import JSON)
async function pushChanges(opts = {}) {
  const silent   = opts?.silent   ?? false;
  const skipPull = opts?.skipPull ?? false;
  if (!fbReady()) {
    console.log('[Sync] Push bỏ qua — Firebase chưa cấu hình');
    return;
  }
  if (_syncPushing) {
    console.log('[Sync] Push bỏ qua — đang sync');
    return;
  }
  _syncPushing = true;
  _ensureSyncDot(); _setSyncDot('syncing');
  _setSyncState('syncing'); // luôn cập nhật nút, dù silent
  if (!silent) showSyncBanner('⏳ Đang đẩy (push)...');

  const years = _getAllLocalYears();
  console.log('[Sync] ▲ Push bắt đầu — năm:', years.join(', '), '| device:', DEVICE_ID.slice(0, 8));

  try {
    let ok = 0, fail = 0;

    // PHASE 4 OPTIMIZATION: tính 1 lần ở scope ngoài để dùng cho cả pre-push pull
    // (per-year) lẫn users pre-push merge (sau for loop)
    //   - manualSync luôn gọi pullChanges trước pushChanges → skip pre-push
    //   - schedulePush cũng gọi pullChanges trước pushChanges → skip pre-push
    const _lastPullTs = Number(localStorage.getItem('_lastPullTs') || 0);
    const _pullFresh = (Date.now() - _lastPullTs) < 60_000;

    for (const yr of years) {
      const yrInt = parseInt(yr);

      // ── Step 1: Pre-push merge — đọc V2 cloud trước khi ghi ─

      if (!skipPull && !_pullFresh && typeof _v2PullYearFull === 'function') try {
        const v2 = await _v2PullYearFull(yrInt);
        if (v2._v2Initialized) {
          // V2 đã init — chỉ merge khi 'fresh' (guard đã skip nếu unchanged)
          if (v2.inv_v3) _mergeKey('inv_v3', v2.inv_v3);
          if (v2.ung_v1) _mergeKey('ung_v1', v2.ung_v1);
          if (v2.cc_v2)  { const norm = normalizeCC([...load('cc_v2',[]), ...v2.cc_v2]); _memSet('cc_v2', norm); }
          if (v2.tb_v1)  _mergeKey('tb_v1', v2.tb_v1);
          if (v2.thu_v1) { _mergeKey('thu_v1', v2.thu_v1); thuRecords = load('thu_v1', []); }
          console.log(`[Sync] ↓ Year ${yr} pre-push merge (V2${v2._yearChanged ? ' fresh' : ' unchanged'})`);
        } else {
          // V2 chưa init → V1 fallback (transition period — hiếm)
          const cloudDoc  = await fsGet(fbDocYear(yrInt));
          const cloudData = fsUnwrap(cloudDoc);
          if (cloudData) {
            if (cloudData.i)   _mergeKey('inv_v3', expandInv(cloudData.i));
            if (cloudData.u)   _mergeKey('ung_v1', expandUng(cloudData.u));
            if (cloudData.c)   { const norm = normalizeCC([...load('cc_v2',[]), ...expandCC(cloudData.c)]); _memSet('cc_v2', norm); }
            if (cloudData.t)   _mergeKey('tb_v1',  expandTb(cloudData.t));
            if (cloudData.thu) _mergeKey('thu_v1', cloudData.thu);
            console.log(`[Sync] ↓ Year ${yr} V1 fallback`);
          }
        }
      } catch (e) {
        console.warn(`[Sync] Không fetch được cloud year ${yr}:`, e.message || e);
      }

      // ── Step 2: Push lên V2 subcollections (thay thế V1) ───
      try {
        if (typeof _v2PushYear === 'function') {
          const results = await _v2PushYear(yrInt);
          const allOk   = results.every(r => r.ok !== false);
          if (allOk) {
            console.log(`[Sync] ▲ Year ${yr} V2 OK`);
            ok++;
          } else {
            const failed = results.filter(r => r.ok === false).map(r => r.type).join(', ');
            console.warn(`[Sync] ✗ Year ${yr} V2 lỗi: ${failed}`);
            fail++;
          }
        } else {
          // Fallback V1 nếu V2 chưa load
          const payload = fbYearPayload(yrInt);
          const res     = await fsSet(fbDocYear(yrInt), payload);
          if (res && res.fields) { ok++; } else { fail++; }
        }
      } catch (e) {
        console.warn(`[Sync] ✗ Year ${yr} exception:`, e.message || e);
        fail++;
      }
    }

    // ── Users pre-push merge — V2 primary (cheap với guard) ────
    // PHASE 4: Xóa cats V1 push hoàn toàn. V2 meta đã thay thế.
    // Vẫn merge users từ V2 trước khi push để tránh device B ghi đè role/deletedAt từ device A
    if (!_pullFresh && typeof _v2PullUsers === 'function') try {
      const r = await _v2PullUsers();
      if (r && r.status === 'fresh' && r.records?.length) {
        const merger = typeof _mergeUsersV2 === 'function' ? _mergeUsersV2 : _mergeUsersSafe;
        const mergedUsers = merger(load('users_v1', []), r.records);
        _memSet('users_v1', mergedUsers);
      }
    } catch (e) {
      console.warn('[Sync] Users V2 pre-push merge lỗi:', e.message || e);
    }
    // (V1 cats push ĐÃ XÓA — không còn ai đọc nữa)

    if (fail === 0) {
      localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
      _clearQueue();
      _setSyncDot('');
      // Reset pending counter — data đã lên cloud
      if (typeof _resetPending === 'function') _resetPending();
      if (!silent) {
        // Push chủ động: hiện banner + cập nhật state đầy đủ
        _setSyncState('success');
        const hhmm = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        showSyncBanner(`✅ Đã đồng bộ lúc ${hhmm}`, 3000);
      } else {
        // Push ngầm: không banner nhưng phải reset jb-btn về trạng thái bình thường
        // (tránh jb-btn kẹt trên "⏳ Đang sync..." sau silent push)
        if (typeof updateJbBtn === 'function') updateJbBtn();
      }
      console.log(`[Sync] ▲ Push xong — ${ok} năm | device: ${DEVICE_ID.slice(0, 8)}`);
    } else {
      _setSyncDot('error');
      _setSyncState('error');
      // Lỗi luôn hiện dù silent — user cần biết
      showSyncBanner('⚠️ Sync lỗi', 4000);
    }
  } catch (e) {
    console.warn('[Sync] ▲ Push lỗi toàn bộ:', e);
    _setSyncDot('offline');
    _setSyncState('error');
    // Lỗi mạng luôn hiện
    showSyncBanner('⚠️ Mất kết nối internet', 3000);
  } finally {
    _syncPushing = false;
  }
}


// ══════════════════════════════════════════════════════════════
// [10] PULL — merge cloud vào local, tất cả năm
// ══════════════════════════════════════════════════════════════
// opts.silent = true  → chạy ngầm (auto-sync), không banner
// opts.silent = false → hiện banner đầy đủ (mặc định khi user chủ động pull)
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

  // Bảo vệ: chặn pull sau reset — kiểm tra cả biến _mem (in-page) và localStorage (sau F5)
  {
    const _lsBlock = parseInt(localStorage.getItem('_blockPullUntil') || '0');
    const _memBlock = (typeof _blockPullUntil !== 'undefined') ? _blockPullUntil : 0;
    const _blockEnd = Math.max(_lsBlock, _memBlock);
    if (Date.now() < _blockEnd) {
      const remain = Math.round((_blockEnd - Date.now()) / 1000);
      console.log(`[Sync] Pull bị chặn sau reset — còn ${remain}s`);
      _syncPulling = false;
      if (callback) callback(null);
      return;
    }
    // Hết hạn → xóa LS key để không cản pull lần sau
    if (_lsBlock && Date.now() >= _lsBlock) localStorage.removeItem('_blockPullUntil');
  }

  // yr=null → pull tất cả năm local; yr=number → pull năm cụ thể
  let _catsChanged = false;
  const years = yr ? [String(yr)] : _getAllLocalYears();
  console.log('[Sync] ▼ Pull bắt đầu — năm:', years.join(', '), '| device:', DEVICE_ID.slice(0, 8));
  if (!silent) showSyncBanner('⬇ Đang tải (pull)...');

  try {
    // ── Cats / Meta ──────────────────────────────────────────────
    // V2 primary: đọc từ meta_* subcollections (sync.v2meta.js)
    // V1 fallback: đọc từ "cats" document — dùng khi V2 chưa có data
    let _pulledMetaFromV2 = false;

    // V2 ready: kiểm tra localStorage flag (set sau lần push meta đầu tiên)
    // hoặc bất kỳ parent doc nào tồn tại trên cloud (_v2Initialized từ pull)
    const _v2InitFlag = localStorage.getItem('_v2Initialized') === '1';

    if (typeof _v2PullMetaFull === 'function') {
      try {
        const meta = await _v2PullMetaFull();
        // V2 sẵn sàng nếu: flag đã set HOẶC pull vừa rồi phát hiện parent docs tồn tại
        const v2Ready = _v2InitFlag || meta._v2Initialized;

        if (v2Ready) {
          _pulledMetaFromV2 = true;
          const _normKey = s => (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'')
            .replace(/[đĐ]/g,'d').toLowerCase().replace(/\s+/g,' ').trim();
          const nowMs = Date.now();

          // projects_v1
          if (meta.projects?.length) {
            const local  = load('projects_v1', []);
            const merged = mergeDatasets(local, meta.projects);
            _memSet('projects_v1', merged);
            if (typeof projects !== 'undefined') projects = merged;
            if (typeof rebuildCatCTFromProjects === 'function') rebuildCatCTFromProjects();
          }

          // users_v1 — password-safe merge (V2 không lưu password)
          if (meta.users?.length) {
            const localUsers  = load('users_v1', []);
            const mergedUsers = _mergeUsersV2(localUsers, meta.users);
            _memSet('users_v1', mergedUsers);
            console.log('[Sync] ▼ users (V2):', mergedUsers.length);
          }

          // cat_items_v1 — per-item merge theo updatedAt
          if (meta.catItems) {
            const localItems = load('cat_items_v1', {});
            const cloudItems = meta.catItems;
            const merged     = {};
            const allTypes   = new Set([...Object.keys(localItems), ...Object.keys(cloudItems)]);

            allTypes.forEach(type => {
              const byId = new Map();
              (localItems[type] || []).forEach(item => byId.set(item.id, item));
              (cloudItems[type] || []).forEach(ci => {
                const li = byId.get(ci.id);
                if (!li || (ci.updatedAt || 0) >= (li.updatedAt || 0)) byId.set(ci.id, ci);
              });
              // Dedup by name — mark bản trùng là isDeleted
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

            // Canonicalize tên
            if (typeof normalizeCatDisplayName === 'function') {
              Object.keys(merged).forEach(type => {
                (merged[type] || []).forEach(item => {
                  if (item.isDeleted) return;
                  const canonical = normalizeCatDisplayName(type, item.name);
                  if (canonical !== item.name) { item.name = canonical; item.updatedAt = nowMs; }
                });
              });
            }

            _memSet('cat_items_v1', merged);
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
            console.log('[Sync] ▼ catItems (V2) merged');
          }

          // cnRoles — pending guard
          if (meta.cnRoles && Object.keys(meta.cnRoles).length) {
            const hasPendingRoles = typeof _pendingChanges !== 'undefined' && _pendingChanges > 0;
            if (!hasPendingRoles) {
              const localRoles  = load('cat_cn_roles', {});
              const cloudRoles  = meta.cnRoles;
              const mergedRoles = { ...cloudRoles, ...localRoles };
              Object.keys(cloudRoles).forEach(k => { if (!(k in localRoles)) mergedRoles[k] = cloudRoles[k]; });
              _memSet('cat_cn_roles', mergedRoles);
              if (typeof cnRoles !== 'undefined') cnRoles = mergedRoles;
              _catsChanged = true;
              console.log('[Sync] ▼ cnRoles (V2) merged');
            }
          }

          // ctYears — union merge
          if (meta.ctYears && Object.keys(meta.ctYears).length) {
            const localYears  = load('cat_ct_years', {});
            const mergedYears = { ...localYears };
            Object.entries(meta.ctYears).forEach(([ct, yr]) => {
              if (!(ct in mergedYears)) mergedYears[ct] = yr;
            });
            _memSet('cat_ct_years', mergedYears);
            cats.congTrinhYears = mergedYears;
            _catsChanged = true;
            console.log('[Sync] ▼ ctYears (V2) merged');
          }

          // hopdong_v1
          if (meta.hopDong && Object.keys(meta.hopDong).length) {
            const localHd  = load('hopdong_v1', {});
            const mergedHd = { ...meta.hopDong };
            Object.entries(localHd).forEach(([ct, local]) => {
              const cloud = mergedHd[ct];
              if (!cloud || (local.updatedAt || 0) >= (cloud.updatedAt || 0)) mergedHd[ct] = local;
            });
            _memSet('hopdong_v1', mergedHd);
            hopDongData = mergedHd;
          }

          // thauphu_v1
          if (meta.thauPhu?.length) {
            const local  = load('thauphu_v1', []);
            const merged = mergeDatasets(local, meta.thauPhu);
            _memSet('thauphu_v1', merged);
            thauPhuContracts = merged;
          }

          console.log('[Sync] ▼ Meta — V2 ✓');
        }
      } catch (e) {
        console.warn('[Sync] Meta V2 pull lỗi:', e.message || e);
      }
    }

    // V1 fallback — chạy khi V2 chưa có data (thiết bị mới / chưa push lần nào)
    if (!_pulledMetaFromV2) {
      try {
        const catsDoc  = await fsGet(fbDocCats());
        const catsData = fsUnwrap(catsDoc);
        if (catsData?.cats) {
          const ct = catsData.cats;
          const hasPending = typeof _pendingChanges !== 'undefined' && _pendingChanges > 0;
          if (!hasPending) {
            const _overrideCatArr = (key, cloudArr) => {
              if (!cloudArr) return;
              _memSet(key, cloudArr.slice());
            };
            if (ct.loai)  _overrideCatArr('cat_loai',  ct.loai);
            if (ct.ncc)   _overrideCatArr('cat_ncc',   ct.ncc);
            if (ct.nguoi) _overrideCatArr('cat_nguoi', ct.nguoi);
          } else {
            console.log('[Sync] Cats pull bỏ qua — còn pending changes, giữ nguyên local');
          }
        }
        if (catsData?.hopDong && typeof catsData.hopDong === 'object') {
          const localHd  = load('hopdong_v1', {});
          const cloudHd  = catsData.hopDong;
          const mergedHd = { ...cloudHd };
          Object.entries(localHd).forEach(([ct, local]) => {
            const cloud = mergedHd[ct];
            if (!cloud || (local.updatedAt || 0) >= (cloud.updatedAt || 0)) mergedHd[ct] = local;
          });
          _memSet('hopdong_v1', mergedHd);
          hopDongData = mergedHd;
        }
        if (catsData?.thauPhu && Array.isArray(catsData.thauPhu)) {
          const local  = load('thauphu_v1', []);
          const merged = mergeDatasets(local, catsData.thauPhu);
          _memSet('thauphu_v1', merged);
          thauPhuContracts = merged;
        }
        if (catsData?.users && Array.isArray(catsData.users)) {
          const localUsers  = load('users_v1', []);
          const mergedUsers = _mergeUsersSafe(localUsers, catsData.users);
          _memSet('users_v1', mergedUsers);
          console.log('[Sync] ▼ users_v1 (V1) merged');
        }
        if (catsData?.catItems && typeof catsData.catItems === 'object') {
          const localItems = load('cat_items_v1', {});
          const cloudItems = catsData.catItems;
          const merged = {};
          const allTypes = new Set([...Object.keys(localItems), ...Object.keys(cloudItems)]);
          const _normKey = s => (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'')
            .replace(/[đĐ]/g,'d').toLowerCase().replace(/\s+/g,' ').trim();
          const nowMs = Date.now();
          allTypes.forEach(type => {
            const byId = new Map();
            (localItems[type] || []).forEach(item => byId.set(item.id, item));
            (cloudItems[type] || []).forEach(cloudItem => {
              const localItem = byId.get(cloudItem.id);
              if (!localItem || (cloudItem.updatedAt || 0) >= (localItem.updatedAt || 0))
                byId.set(cloudItem.id, cloudItem);
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
          _memSet('cat_items_v1', merged);
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
          console.log('[Sync] ▼ catItems (V1) merged — soft-deletes applied, names canonicalized');
        }
        if (catsData?.projects && Array.isArray(catsData.projects)) {
          const local  = load('projects_v1', []);
          const merged = mergeDatasets(local, catsData.projects);
          _memSet('projects_v1', merged);
          if (typeof projects !== 'undefined') projects = merged;
          if (typeof rebuildCatCTFromProjects === 'function') rebuildCatCTFromProjects();
        }
        if (catsData?.cnRoles && typeof catsData.cnRoles === 'object') {
          const hasPendingRoles = typeof _pendingChanges !== 'undefined' && _pendingChanges > 0;
          if (!hasPendingRoles) {
            const localRoles  = load('cat_cn_roles', {});
            const cloudRoles  = catsData.cnRoles;
            const mergedRoles = { ...cloudRoles, ...localRoles };
            Object.keys(cloudRoles).forEach(k => { if (!(k in localRoles)) mergedRoles[k] = cloudRoles[k]; });
            _memSet('cat_cn_roles', mergedRoles);
            if (typeof cnRoles !== 'undefined') cnRoles = mergedRoles;
            _catsChanged = true;
            console.log('[Sync] ▼ cnRoles (V1) merged');
          } else {
            console.log('[Sync] cnRoles pull bỏ qua — còn pending changes');
          }
        }
        if (catsData?.ctYears && typeof catsData.ctYears === 'object') {
          const localYears  = load('cat_ct_years', {});
          const cloudYears  = catsData.ctYears;
          const mergedYears = { ...localYears };
          Object.entries(cloudYears).forEach(([ct, yr]) => {
            if (!(ct in mergedYears)) mergedYears[ct] = yr;
          });
          _memSet('cat_ct_years', mergedYears);
          cats.congTrinhYears = mergedYears;
          _catsChanged = true;
          console.log('[Sync] ▼ ctYears (V1) merged');
        }
        console.log('[Sync] ▼ Meta — V1 cats fallback');
      } catch (e) {
        console.warn('[Sync] Cats pull lỗi:', e.message || e);
      }
    }

    // ── Year data ─────────────────────────────────────────────
    let totalNew = 0, totalConflicts = 0;

    // Helper: merge 1 key + đếm new/conflict
    const mergeAndCount = (key, cloudArr, yrStr) => {
      const local     = load(key, []);
      const merged    = mergeDatasets(local, cloudArr);
      const newRecs   = merged.filter(m => !local.find(l => String(l.id) === String(m.id))).length;
      const conflicts = cloudArr.filter(cr => {
        const lr = local.find(l => String(l.id) === String(cr.id));
        return lr && (lr.updatedAt || lr._ts || 0) !== (cr.updatedAt || 0);
      }).length;
      totalNew       += newRecs;
      totalConflicts += conflicts;
      _memSet(key, merged);
      if (newRecs || conflicts)
        console.log(`[Sync] ▼ ${key} year ${yrStr}: +${newRecs} mới, ${conflicts} conflict`);
    };

    // Helper: merge cc_v2 dùng normalizeCC (logical key dedup)
    const mergeCCAndCount = (cloudCC, yrStr, source) => {
      const localCC    = load('cc_v2', []);
      const normalized = normalizeCC([...localCC, ...cloudCC]);
      const newRecs    = normalized.filter(n => !localCC.find(l => String(l.id) === String(n.id))).length;
      const dupsRemoved = (localCC.length + cloudCC.length) - normalized.length;
      totalNew        += newRecs;
      _memSet('cc_v2', normalized);
      if (typeof ccData !== 'undefined') ccData = normalized;
      console.log(`[Sync] ▼ cc_v2 year ${yrStr} (${source}): +${newRecs} mới${dupsRemoved > 0 ? `, xóa ${dupsRemoved} bản trùng` : ''}`);
    };

    for (const yrStr of years) {
      try {
        // ── Thử V2 subcollection trước ───────────────────────
        let pulledFromV2 = false;
        if (typeof _v2PullYearFull === 'function') {
          const v2 = await _v2PullYearFull(parseInt(yrStr));
          // V2 path per-year: chỉ khi parent doc TỒN TẠI cho năm đó
          // (tránh case cloud có V2 meta nhưng chưa có V2 year → cần V1 fallback cho năm)
          if (v2._v2Initialized) {
            if (v2.inv_v3)  mergeAndCount('inv_v3', v2.inv_v3, yrStr);
            if (v2.ung_v1)  mergeAndCount('ung_v1', v2.ung_v1, yrStr);
            if (v2.cc_v2)   mergeCCAndCount(v2.cc_v2, yrStr, 'V2');
            if (v2.tb_v1)   mergeAndCount('tb_v1',  v2.tb_v1, yrStr);
            if (v2.thu_v1)  { mergeAndCount('thu_v1', v2.thu_v1, yrStr); thuRecords = load('thu_v1', []); }
            pulledFromV2 = true;
            console.log(`[Sync] ▼ Year ${yrStr} — V2 ${v2._yearChanged ? '✓ fresh' : '⏭ unchanged'}`);
          }
        }

        // ── Fallback V1 nếu V2 chưa có data ─────────────────
        if (!pulledFromV2) {
          const doc  = await fsGet(fbDocYear(parseInt(yrStr)));
          const data = fsUnwrap(doc);
          if (!data) {
            console.log(`[Sync] ▼ Year ${yrStr} chưa có trên cloud`);
            continue;
          }
          if (data.i)   mergeAndCount('inv_v3', expandInv(data.i), yrStr);
          if (data.u)   mergeAndCount('ung_v1', expandUng(data.u), yrStr);
          if (data.c)   mergeCCAndCount(expandCC(data.c), yrStr, 'V1');
          if (data.t)   mergeAndCount('tb_v1',  expandTb(data.t), yrStr);
          if (data.thu) { mergeAndCount('thu_v1', data.thu, yrStr); thuRecords = load('thu_v1', []); }
          console.log(`[Sync] ▼ Year ${yrStr} — V1 fallback`);
        }
      } catch (e) {
        console.warn(`[Sync] Pull year ${yrStr} lỗi:`, e.message || e);
      }
    }

    if (!silent) hideSyncBanner();
    // PHASE 4 — Lưu timestamp pull xong → pushChanges có thể skip pre-push pull nếu fresh
    try { localStorage.setItem('_lastPullTs', String(Date.now())); } catch {}
    console.log(`[Sync] ▼ Pull xong — ${totalNew} record mới, ${totalConflicts} conflicts${_catsChanged ? ', cats changed' : ''} | device: ${DEVICE_ID.slice(0, 8)}`);
    if (callback) callback({ newRecords: totalNew, conflicts: totalConflicts, catsChanged: _catsChanged });
    if (typeof afterSync === 'function') afterSync();
    // Push KHÔNG tự chạy sau pull — chỉ manualSync() mới push

  } catch (e) {
    console.warn('[Sync] ▼ Pull lỗi toàn bộ:', e);
    if (!silent) hideSyncBanner();
    if (callback) callback(null);
  } finally {
    _syncPulling = false;
  }
}

// ══════════════════════════════════════════════════════════════
// [12a] SCHEDULE PUSH — debounce 30s sau mỗi save()
// Gọi từ core.js/save() sau _incPending().
// Nếu tab bị ẩn trước khi timer chạy → visibilitychange flush ngay.
// ══════════════════════════════════════════════════════════════
let _pushTimer = null;

// Hủy debounce push đang chờ — gọi trước khi force push thủ công (e.g. sau import)
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
    if (isSyncing()) {
      _pushTimer = setTimeout(schedulePush, 15_000);
      return;
    }
    // Auto-sync: bỏ qua pull trước push — mỗi thiết bị ghi vào subcollection riêng,
    // không có nguy cơ ghi đè record của thiết bị khác.
    // Giúp tiết kiệm ~19 reads mỗi lần auto-sync ngầm.
    if (typeof _pendingChanges !== 'undefined' && _pendingChanges > 0) {
      await pushChanges({ silent: true, skipPull: true });
      // Đẩy meta (danh_muc, hop_dong, cong_trinh, tai_khoan) ngầm sau khi year push xong
      if (typeof _v2PushMeta === 'function') {
        _v2PushMeta().catch(e => console.warn('[Sync] V2 meta auto push lỗi:', e.message || e));
      }
    }
  }, 30_000); // Rút ngắn xuống 30s để flush nhanh trước khi user tắt máy
}

// ══════════════════════════════════════════════════════════════
// [12] MANUAL SYNC — nút 🔄 Sync: pull → push → reload globals → refresh UI
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

  // Disable cả 2 nút sync trong suốt quá trình — re-enable trong finally dù lỗi
  const _sBtns = ['sync-btn', 'jb-btn'].map(id => document.getElementById(id)).filter(Boolean);
  _sBtns.forEach(b => { b.disabled = true; b.style.opacity = '.6'; });

  try {
    // Bước 1: Pull — đợi xong mới tiếp tục
    await new Promise(resolve => pullChanges(null, resolve));

    // Bước 2: Reload globals + clear cache (không render trước khi push xong)
    if (typeof _reloadGlobals === 'function') _reloadGlobals();
    else if (typeof clearAllCache === 'function') clearAllCache();

    // Bước 3: Push — đợi xong mới refresh UI (tránh reload sớm trước khi push xong)
    // V2 year push được tích hợp trong pushChanges() — không cần gọi thêm ở đây
    await pushChanges({ silent: false });

    // Bước 3b: V2 meta push (danh_muc, hop_dong, cong_trinh, tai_khoan) — chỉ manual sync
    if (typeof _v2PushMeta === 'function') {
      _v2PushMeta().catch(e => console.warn('[Sync] V2 meta push lỗi:', e.message || e));
    }

    // Reset flag để _migrateCatNamesFormat chạy lại scan data ở lần renderSettings tiếp theo
    if (typeof resetCatNamesMigrated === 'function') resetCatNamesMigrated();

    // Bước 4: Render — dùng afterDataChange nếu có, fallback inline
    if (typeof afterDataChange === 'function') afterDataChange();
    else if (typeof renderActiveTab === 'function') renderActiveTab();
    else if (typeof _refreshAllTabs === 'function') _refreshAllTabs();
  } finally {
    _sBtns.forEach(b => { b.disabled = false; b.style.opacity = ''; });
  }
}

// ══════════════════════════════════════════════════════════════
// [11] PROCESS QUEUE — đã vô hiệu hoá (sync theo batch qua manualSync)
// Giữ lại stub để không break code cũ còn gọi processQueue()
// ══════════════════════════════════════════════════════════════
function processQueue() {
  // No-op: sync không còn tự động sau save
  // Dùng nút 🔄 Sync hoặc chờ auto timer 30s
}

// ══════════════════════════════════════════════════════════════
// [13] FLUSH ON HIDE — đẩy data ngay khi tab bị ẩn/đóng
// Giải quyết lỗi mất dữ liệu trên mobile: khi user khóa màn hình
// hoặc tắt trình duyệt, bộ đếm 30s bị hủy → data kẹt local.
// keepalive=true đảm bảo browser gửi xong request dù tab đã đóng.
// ══════════════════════════════════════════════════════════════

// Flag báo cho fetch calls trong sync.v2format.js dùng keepalive
let _syncKeepAlive = false;

(function() {
  function _flushOnHide() {
    if (!fbReady()) return;
    if (typeof _pendingChanges === 'undefined' || _pendingChanges <= 0) return;
    if (isSyncing()) return;
    console.log('[Sync] ⚡ Flush on hide — có', _pendingChanges, 'thay đổi chưa sync');
    _syncKeepAlive = true;
    const done = () => { _syncKeepAlive = false; };
    pushChanges({ silent: true, skipPull: true }).then(done, done);
  }

  // Tab bị ẩn (khóa màn hình, chuyển app, giảm thiểu)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) _flushOnHide();
  });

  // Tab hoặc cửa sổ bị đóng
  window.addEventListener('pagehide', _flushOnHide);
})();
