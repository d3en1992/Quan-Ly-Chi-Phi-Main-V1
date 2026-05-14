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

    for (const yr of years) {
      const yrInt = parseInt(yr);

      // ── Step 1: Fetch cloud để merge trước khi ghi ─────────
      // Tránh Device B ghi đè data của Device A
      // Bỏ qua nếu opts.skipPull = true (sau import JSON — local là nguồn sự thật)
      if (!skipPull) try {
        const cloudDoc  = await fsGet(fbDocYear(yrInt));
        const cloudData = fsUnwrap(cloudDoc);
        if (cloudData) {
          if (cloudData.i) _mergeKey('inv_v3', expandInv(cloudData.i));
          if (cloudData.u) _mergeKey('ung_v1', expandUng(cloudData.u));
          if (cloudData.c) {
            // cc_v2: dùng normalizeCC thay vì _mergeKey (id-based) để tránh duplicate tuần trước push
            const cloudCC    = expandCC(cloudData.c);
            const localCC    = load('cc_v2', []);
            const normalized = normalizeCC([...localCC, ...cloudCC]);
            _memSet('cc_v2', normalized);
          }
          if (cloudData.t) _mergeKey('tb_v1',  expandTb(cloudData.t));
          if (cloudData.thu) _mergeKey('thu_v1', cloudData.thu);
          console.log(`[Sync] ↓ Merged cloud year ${yr}`);
        }
      } catch (e) {
        console.warn(`[Sync] Không fetch được cloud year ${yr}:`, e.message || e);
        // Tiếp tục push — không để fetch lỗi block toàn bộ sync
      }

      // ── Step 2: Push merged local lên cloud ────────────────
      try {
        const payload = fbYearPayload(yrInt);
        const kb      = Math.round(JSON.stringify(payload).length / 1024 * 10) / 10;
        const res     = await fsSet(fbDocYear(yrInt), payload);
        if (res && res.fields) {
          console.log(`[Sync] ▲ Year ${yr} OK (~${kb}kb)`);
          ok++;
        } else {
          const err = res?.error?.message || JSON.stringify(res?.error) || '?';
          console.warn(`[Sync] ✗ Year ${yr} lỗi:`, err);
          fail++;
        }
      } catch (e) {
        console.warn(`[Sync] ✗ Year ${yr} exception:`, e.message || e);
        fail++;
      }
    }

    // ── Cats ───────────────────────────────────────────────────
    try {
      const catsDoc  = await fsGet(fbDocCats());
      const catsData = fsUnwrap(catsDoc);
      if (catsData?.users) {
        const mergedUsers = _mergeUsersSafe(load('users_v1', []), catsData.users);
        _memSet('users_v1', mergedUsers);
      }
    } catch (e) {
      console.warn('[Sync] Users pre-push merge lỗi:', e.message || e);
    }
    fsSet(fbDocCats(), fbCatsPayload()).catch(e =>
      console.warn('[Sync] Cats push lỗi:', e)
    );

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
    // ── Cats ─────────────────────────────────────────────────
    try {
      const catsDoc  = await fsGet(fbDocCats());
      const catsData = fsUnwrap(catsDoc);
      if (catsData?.cats) {
        const ct = catsData.cats;
        // Chiến lược merge cat string-array:
        //  • Nếu còn pending changes (local chưa push) → BỎ QUA, giữ nguyên local.
        //    Tránh cloud cũ ghi đè danh mục user vừa xóa nhưng chưa sync.
        //  • Nếu không có pending (local đã sync với cloud) → dùng cloud làm source of truth.
        //    Tránh resurrection: union additive sẽ làm sống lại danh mục đã xóa trên cloud.
        const hasPending = typeof _pendingChanges !== 'undefined' && _pendingChanges > 0;
        if (!hasPending) {
          const _overrideCatArr = (key, cloudArr) => {
            if (!cloudArr) return;
            _memSet(key, cloudArr.slice()); // cloud là source of truth, kể cả mảng rỗng
          };
          // cat_ct là derived data — KHÔNG pull từ cloud; được rebuild từ projects_v1 bên dưới
          if (ct.loai)  _overrideCatArr('cat_loai',  ct.loai);
          if (ct.ncc)   _overrideCatArr('cat_ncc',   ct.ncc);
          if (ct.nguoi) _overrideCatArr('cat_nguoi', ct.nguoi);
        } else {
          console.log('[Sync] Cats pull bỏ qua — còn pending changes, giữ nguyên local');
        }
      }
      if (catsData?.hopDong && typeof catsData.hopDong === 'object') {
        // Merge per-CT: giữ local nếu local.updatedAt >= cloud.updatedAt
        // Không ghi đè thô — tránh mất HĐ chính vừa nhập/import chưa push kịp
        const localHd  = load('hopdong_v1', {});
        const cloudHd  = catsData.hopDong;
        const mergedHd = { ...cloudHd };
        Object.entries(localHd).forEach(([ct, local]) => {
          const cloud = mergedHd[ct];
          if (!cloud || (local.updatedAt || 0) >= (cloud.updatedAt || 0)) {
            mergedHd[ct] = local; // local mới hơn hoặc không có trên cloud → giữ local
          }
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
        console.log('[Sync] ▼ users_v1 merged');
      }
      // Merge catItems: per-item soft-delete — luôn merge (không phụ thuộc pending)
      // Chiến lược: merge từng type theo id, updatedAt mới hơn thắng
      if (catsData?.catItems && typeof catsData.catItems === 'object') {
        const localItems = load('cat_items_v1', {});
        const cloudItems = catsData.catItems;
        const merged = {};
        const allTypes = new Set([...Object.keys(localItems), ...Object.keys(cloudItems)]);
        const _normKey = s => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
          .replace(/[đĐ]/g,'d').toLowerCase().replace(/\s+/g,' ').trim();
        const nowMs = Date.now();
        allTypes.forEach(type => {
          const byId = new Map();
          (localItems[type] || []).forEach(item => byId.set(item.id, item));
          (cloudItems[type] || []).forEach(cloudItem => {
            const localItem = byId.get(cloudItem.id);
            // Cloud thắng nếu mới hơn hoặc không có local
            if (!localItem || (cloudItem.updatedAt || 0) >= (localItem.updatedAt || 0)) {
              byId.set(cloudItem.id, cloudItem);
            }
          });
          // Dedup by name: 2 device tạo cùng tên khác UUID → mark bản cũ isDeleted
          // Giữ bản có updatedAt cao nhất, push tombstone cho bản còn lại lên cloud sau
          const byNorm = new Map();
          [...byId.values()]
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)) // mới nhất trước
            .forEach(item => {
              if (item.isDeleted) return;
              const norm = _normKey(item.name);
              if (byNorm.has(norm)) {
                // Duplicate tên — mark deleted (bản mới hơn đã được giữ trước)
                byId.set(item.id, { ...item, isDeleted: true, updatedAt: nowMs });
              } else {
                byNorm.set(norm, item.id);
              }
            });
          merged[type] = [...byId.values()];
        });

        // Canonicalize item.name trong merged (sửa "COPHA" → "Copha", v.v.)
        if (typeof normalizeCatDisplayName === 'function') {
          Object.keys(merged).forEach(type => {
            (merged[type] || []).forEach(item => {
              if (item.isDeleted) return;
              const canonical = normalizeCatDisplayName(type, item.name);
              if (canonical !== item.name) {
                item.name = canonical;
                item.updatedAt = nowMs;
              }
            });
          });
        }

        _memSet('cat_items_v1', merged);
        // Rebuild string arrays với tên canonical + dedup
        const nameArr = (items, type) => {
          const seen = new Set();
          return (items || []).filter(i => !i.isDeleted)
            .map(i => typeof normalizeCatDisplayName === 'function'
              ? normalizeCatDisplayName(type, i.name)
              : i.name)
            .filter(n => { const k = _normKey(n); return seen.has(k) ? false : (seen.add(k), true); });
        };
        if (merged.loai)  { _memSet('cat_loai',  nameArr(merged.loai,  'loai')); }
        if (merged.ncc)   { _memSet('cat_ncc',   nameArr(merged.ncc,   'ncc')); }
        if (merged.nguoi) { _memSet('cat_nguoi', nameArr(merged.nguoi, 'nguoi')); }
        if (merged.tp)    { _memSet('cat_tp',    nameArr(merged.tp,    'tp')); }
        if (merged.cn)    { _memSet('cat_cn',    nameArr(merged.cn,    'cn')); }
        if (merged.tbteb) { _memSet('cat_tbteb', nameArr(merged.tbteb, 'tbteb')); }
        console.log('[Sync] ▼ catItems merged — soft-deletes applied, names canonicalized');
      }
      if (catsData?.projects && Array.isArray(catsData.projects)) {
        const local  = load('projects_v1', []);
        const merged = mergeDatasets(local, catsData.projects);
        _memSet('projects_v1', merged);
        if (typeof projects !== 'undefined') projects = merged;
        // Rebuild cats.congTrinh to stay in sync with newly merged projects
        if (typeof rebuildCatCTFromProjects === 'function') rebuildCatCTFromProjects();
      }
      // cnRoles: merge với pending guard — tránh cloud ghi đè vai trò vừa xóa local
      if (catsData?.cnRoles && typeof catsData.cnRoles === 'object') {
        const hasPendingRoles = typeof _pendingChanges !== 'undefined' && _pendingChanges > 0;
        if (!hasPendingRoles) {
          const localRoles  = load('cat_cn_roles', {});
          const cloudRoles  = catsData.cnRoles;
          // Union merge: cloud thắng nếu có key, giữ local key nếu cloud thiếu
          const mergedRoles = { ...cloudRoles, ...localRoles };
          // Dùng cloud cho key nào local không có (device mới nhận vai trò từ device khác)
          Object.keys(cloudRoles).forEach(k => {
            if (!(k in localRoles)) mergedRoles[k] = cloudRoles[k];
          });
          _memSet('cat_cn_roles', mergedRoles);
          if (typeof cnRoles !== 'undefined') cnRoles = mergedRoles;
          _catsChanged = true;
          console.log('[Sync] ▼ cnRoles merged');
        } else {
          console.log('[Sync] cnRoles pull bỏ qua — còn pending changes');
        }
      }
      // ctYears: union merge — không ghi đè, thêm năm thiếu từ cloud vào local
      if (catsData?.ctYears && typeof catsData.ctYears === 'object') {
        const localYears  = load('cat_ct_years', {});
        const cloudYears  = catsData.ctYears;
        const mergedYears = { ...localYears };
        Object.entries(cloudYears).forEach(([ct, yr]) => {
          if (!(ct in mergedYears)) mergedYears[ct] = yr; // chỉ thêm key mới, không ghi đè local
        });
        _memSet('cat_ct_years', mergedYears);
        cats.congTrinhYears = mergedYears;
        _catsChanged = true;
        console.log('[Sync] ▼ ctYears merged');
      }
    } catch (e) {
      console.warn('[Sync] Cats pull lỗi:', e.message || e);
    }

    // ── Year data ─────────────────────────────────────────────
    let totalNew = 0, totalConflicts = 0;

    for (const yrStr of years) {
      try {
        const doc  = await fsGet(fbDocYear(parseInt(yrStr)));
        const data = fsUnwrap(doc);
        if (!data) {
          console.log(`[Sync] ▼ Year ${yrStr} chưa có trên cloud`);
          continue;
        }

        const mergeAndCount = (key, cloudExpanded) => {
          const local    = load(key, []);
          const merged   = mergeDatasets(local, cloudExpanded);
          const newRecs  = merged.filter(m => !local.find(l => String(l.id) === String(m.id))).length;
          const conflicts = cloudExpanded.filter(cr => {
            const lr = local.find(l => String(l.id) === String(cr.id));
            return lr && (lr.updatedAt || lr._ts || 0) !== (cr.updatedAt || 0);
          }).length;
          totalNew       += newRecs;
          totalConflicts += conflicts;
          _memSet(key, merged); // ghi _mem + IDB
          if (newRecs || conflicts)
            console.log(`[Sync] ▼ ${key} year ${yrStr}: +${newRecs} mới, ${conflicts} conflict`);
        };

        if (data.i)   mergeAndCount('inv_v3', expandInv(data.i));
        if (data.u)   mergeAndCount('ung_v1', expandUng(data.u));
        if (data.c) {
          // cc_v2: KHÔNG dùng mergeDatasets (id-based) — tránh duplicate tuần.
          // Logical key = fromDate + projectId/ct. Union cả 2 → normalizeCC.
          const cloudCC   = expandCC(data.c);
          const localCC   = load('cc_v2', []);
          const normalized = normalizeCC([...localCC, ...cloudCC]);
          const newRecs    = normalized.filter(n => !localCC.find(l => String(l.id) === String(n.id))).length;
          const dupsRemoved = (localCC.length + cloudCC.length) - normalized.length;
          totalNew         += newRecs;
          _memSet('cc_v2', normalized);
          if (typeof ccData !== 'undefined') ccData = normalized;
          console.log(`[Sync] ▼ cc_v2 year ${yrStr}: +${newRecs} mới${dupsRemoved > 0 ? `, xóa ${dupsRemoved} bản trùng` : ''}`);
        }
        if (data.t)   mergeAndCount('tb_v1',  expandTb(data.t));
        if (data.thu) {
          mergeAndCount('thu_v1', data.thu);
          thuRecords = load('thu_v1', []);
        }
      } catch (e) {
        console.warn(`[Sync] Pull year ${yrStr} lỗi:`, e.message || e);
      }
    }

    if (!silent) hideSyncBanner();
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
  // Guard: không lên lịch push nếu không có gì để gửi
  // (quan trọng cho retry path: 15s sau khi isSyncing, pending có thể đã về 0)
  if (typeof _pendingChanges !== 'undefined' && _pendingChanges <= 0) return;
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    if (isSyncing()) {
      // Đang sync → lùi thêm 15s
      _pushTimer = setTimeout(schedulePush, 15_000);
      return;
    }
    pullChanges(null, () => {
      if (typeof _pendingChanges !== 'undefined' && _pendingChanges > 0) {
        pushChanges({ silent: true });
      }
    }, { silent: true });
  }, 30_000);
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
    await pushChanges({ silent: false });

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
  // Dùng nút 🔄 Sync hoặc chờ auto timer 13 phút
}
