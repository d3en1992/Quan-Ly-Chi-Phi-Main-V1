// sync.js — Sync Engine (bản gọn, 1 document/năm + 1 document danh_muc)
// Load order: sau doanhthu.js, trước main.js
// ─────────────────────────────────────────────────────────────────────────────
// KIẾN TRÚC (B) — chia theo HẠNG MỤC cho dễ đọc trên Firebase Console:
//   • Mỗi HẠNG MỤC theo NĂM = 1 document (tên field đầy đủ, không nén):
//       cpct_data/y{NĂM}_hoa_don · _tien_ung · _cham_cong · _thiet_bi · _thu_tien
//   • 4 document DANH MỤC dùng chung:
//       meta_cong_trinh (projects) · meta_danh_muc (cat/role/năm-CT)
//       meta_tai_khoan (users)     · meta_hop_dong (HĐ chính + thầu phụ)
//   → Đổi lại để dễ nhìn; cái giá là đọc/ghi nhiều hơn (mỗi hạng mục 1 lượt).
//
//   • CLOUD LÀ DUY NHẤT ĐÚNG (online 100%):
//       - PULL  = TẢI cloud về và THAY THẾ dữ liệu local của (các) năm được pull.
//                 → Hết cảnh 2 máy lệch số: máy nào pull xong cũng giống hệt cloud.
//       - SAVE  = ghi xuống IndexedDB (đọc nhanh) RỒI đẩy cloud gần như tức thì.
//   • IndexedDB chỉ còn là "bộ nhớ đệm để mở app cho nhanh", không phải nguồn chính.
//     Khi pull, slice năm đó trong IndexedDB bị cloud ghi đè hoàn toàn.
//   • 4 doc danh mục cũng được THAY THẾ theo cloud (riêng users giữ mật khẩu local).
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

// Trường chứa ngày (để biết record thuộc năm nào) của từng loại dữ liệu
const _YEAR_FIELD = { inv_v3: 'ngay', ung_v1: 'ngay', cc_v2: 'fromDate', tb_v1: 'ngay', thu_v1: 'ngay' };

// THAY THẾ slice 1 năm: giữ nguyên record các năm KHÁC, ghi đè record năm yrStr bằng cloud.
// → đây là cốt lõi của "cloud là chuẩn": local năm đó = đúng những gì cloud có.
function _replaceYearData(key, cloudArr, yrStr) {
  const field = _YEAR_FIELD[key] || 'ngay';
  const y     = String(yrStr);
  const local = load(key, []);
  // giữ lại record của các năm khác (không bị pull lần này)
  const kept  = local.filter(r => {
    const d = r[field];
    return !(d && d.length >= 4 && d.slice(0, 4) === y);
  });
  const result = [...kept, ...(cloudArr || [])];
  _memSet(key, result);
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
// [9] PUSH — đẩy local lên cloud (mỗi hạng mục/năm = 1 doc + 4 doc danh mục)
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

  // ── Lọc theo key đã đổi (chỉ áp dụng cho push ngầm) ──
  // Push thủ công (silent=false) luôn đẩy đủ. Push ngầm: nếu biết key nào đổi
  // thì chỉ đẩy đúng hạng mục + meta liên quan để tiết kiệm read/write.
  const _hasDirty   = (typeof _dirtyKeys !== 'undefined' && _dirtyKeys.size > 0);
  const _scoped     = silent && _hasDirty;            // có đủ thông tin để thu hẹp phạm vi
  const _catsToPush = _scoped
    ? _YEAR_CATS.filter(c => _dirtyKeys.has(c.key))
    : _YEAR_CATS;
  // Các key kích hoạt từng doc meta (gộp theo payload tương ứng)
  const _META_TRIGGER_KEYS = new Set([
    'projects_v1','cat_ct',                                   // → meta_cong_trinh
    'cat_loai','cat_ncc','cat_nguoi','cat_tp','cat_cn','cat_tbteb',
    'cat_items_v1','cat_cn_roles','cat_ct_years',             // → meta_danh_muc
    'users_v1',                                               // → meta_tai_khoan
    'hopdong_v1','thauphu_v1',                                // → meta_hop_dong
  ]);
  const _pushMeta = _scoped
    ? [..._dirtyKeys].some(k => _META_TRIGGER_KEYS.has(k))
    : true;

  console.log('[Sync] ▲ Push bắt đầu — năm:', years.join(', '),
    '| hạng mục:', _catsToPush.map(c => c.cat).join(',') || '(none)',
    '| meta:', _pushMeta ? 'có' : 'bỏ',
    '| device:', DEVICE_ID.slice(0, 8));

  try {
    let ok = 0, fail = 0;

    for (const yr of years) {
      const yrInt = parseInt(yr);
      // Ghi từng hạng mục theo năm (hoa_don, tien_ung, cham_cong, thiet_bi, thu_tien)
      for (const { cat, key, dateField } of _catsToPush) {
        const ys = String(yrInt);
        const localRecs = load(key, []).filter(x => x[dateField] && x[dateField].startsWith(ys));
        if (!localRecs.length) continue; // năm này không có dữ liệu hạng mục đó → bỏ qua
        try {
          // ── B1: đọc cloud hạng mục này, gộp vào local (tránh đè dữ liệu máy khác) ──
          if (!skipPull) {
            const cd = fsUnwrap(await fsGet(fbDocYearCat(yrInt, cat)));
            if (cd && Array.isArray(cd.records)) {
              if (key === 'cc_v2') {
                _memSet('cc_v2', normalizeCC([...load('cc_v2', []), ...cd.records]));
              } else {
                _mergeKey(key, cd.records);
                if (key === 'thu_v1') thuRecords = load('thu_v1', []);
              }
            }
          }
          // ── B2: ghi đè doc hạng mục bằng dữ liệu local đã gộp ──
          const res = await fsSet(fbDocYearCat(yrInt, cat), fbYearCatPayload(yrInt, key, dateField));
          if (res && res.fields) ok++;
          else { fail++; console.warn(`[Sync] ✗ ${cat} ${yr} ghi lỗi`); }
        } catch (e) {
          console.warn(`[Sync] ✗ ${cat} ${yr} exception:`, e.message || e);
          fail++;
        }
      }
      console.log(`[Sync] ▲ Year ${yr} OK`);
    }

    // ── 4 doc danh mục dùng chung: đọc-gộp-ghi (bỏ qua nếu meta không đổi) ──
    if (_pushMeta) {
      try {
        if (!skipPull) await _pullMeta();   // gộp cloud → local trước
        const metas = [
          [fbDocMetaCT(), fbMetaCTPayload()],
          [fbDocMetaDM(), fbMetaDMPayload()],
          [fbDocMetaTK(), fbMetaTKPayload()],
          [fbDocMetaHD(), fbMetaHDPayload()],
        ];
        for (const [docId, payload] of metas) {
          const res = await fsSet(docId, payload);
          if (!(res && res.fields)) console.warn(`[Sync] ✗ ${docId} ghi lỗi`);
        }
      } catch (e) {
        console.warn('[Sync] danh mục push lỗi:', e.message || e);
      }
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
// [10] PULL META — đọc 4 doc danh mục dùng chung, THAY THẾ local bằng cloud
//   meta_cong_trinh · meta_danh_muc · meta_tai_khoan · meta_hop_dong
//   (riêng users: lấy theo cloud nhưng vá lại mật khẩu local nếu cloud thiếu)
// ══════════════════════════════════════════════════════════════
async function _pullMeta() {
  let changed = false;

  // ── meta_cong_trinh: projects (công trình) — nguồn gốc của cat_ct ──
  try {
    const d = fsUnwrap(await fsGet(fbDocMetaCT()));
    if (d && Array.isArray(d.projects)) {
      _memSet('projects_v1', d.projects);
      if (typeof projects !== 'undefined') projects = d.projects;
      if (typeof rebuildCatCTFromProjects === 'function') rebuildCatCTFromProjects();
      changed = true;
    }
  } catch (e) { console.warn('[Sync] meta_cong_trinh pull lỗi:', e.message || e); }

  // ── meta_danh_muc: catItems (source of truth), vai trò CN, năm theo CT ──
  try {
    const d = fsUnwrap(await fsGet(fbDocMetaDM()));
    if (d) {
      if (d.catItems && typeof d.catItems === 'object') {
        _memSet('cat_items_v1', d.catItems);
        _applyCatItemArrays(d.catItems);
      }
      if (d.cnRoles && typeof d.cnRoles === 'object') {
        _memSet('cat_cn_roles', d.cnRoles);
        if (typeof cnRoles !== 'undefined') cnRoles = d.cnRoles;
      }
      if (d.ctYears && typeof d.ctYears === 'object') {
        _memSet('cat_ct_years', d.ctYears);
        if (typeof cats !== 'undefined') cats.congTrinhYears = d.ctYears;
      }
      changed = true;
    }
  } catch (e) { console.warn('[Sync] meta_danh_muc pull lỗi:', e.message || e); }

  // ── meta_tai_khoan: users (vá mật khẩu local nếu cloud thiếu) ──
  try {
    const d = fsUnwrap(await fsGet(fbDocMetaTK()));
    if (d && Array.isArray(d.users)) {
      const pwById = new Map();
      load('users_v1', []).forEach(u => {
        if (u && u.password) pwById.set(u.id || u.username, u.password);
      });
      const replaced = d.users.map(u => {
        if (u && !u.password) {
          const pw = pwById.get(u.id || u.username);
          if (pw) return { ...u, password: pw };
        }
        return u;
      });
      _memSet('users_v1', replaced);
      changed = true;
    }
  } catch (e) { console.warn('[Sync] meta_tai_khoan pull lỗi:', e.message || e); }

  // ── meta_hop_dong: hợp đồng chính + thầu phụ ──
  try {
    const d = fsUnwrap(await fsGet(fbDocMetaHD()));
    if (d) {
      if (d.hopDong && typeof d.hopDong === 'object') {
        _memSet('hopdong_v1', d.hopDong);
        if (typeof hopDongData !== 'undefined') hopDongData = d.hopDong;
      }
      if (Array.isArray(d.thauPhu)) {
        _memSet('thauphu_v1', d.thauPhu);
        if (typeof thauPhuContracts !== 'undefined') thauPhuContracts = d.thauPhu;
      }
      changed = true;
    }
  } catch (e) { console.warn('[Sync] meta_hop_dong pull lỗi:', e.message || e); }

  if (changed) console.log('[Sync] ▼ danh mục đã thay thế theo cloud');
  return changed;
}

// ══════════════════════════════════════════════════════════════
// [11] PULL — tải cloud về, THAY THẾ local (danh_muc + từng năm)
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
    // ── Danh mục dùng chung (4 doc meta) ──
    let _catsChanged = false;
    try { _catsChanged = await _pullMeta(); }
    catch (e) { console.warn('[Sync] meta pull lỗi:', e.message || e); }

    // ── Dữ liệu từng năm: đọc từng hạng mục, THAY THẾ slice năm đó bằng cloud ──
    let totalRecords = 0;

    // CC cần normalize (gom theo tuần+công trình) sau khi thay slice năm
    const replaceCC = (cloudCC, yrStr) => {
      const y     = String(yrStr);
      const local = load('cc_v2', []);
      const kept  = local.filter(r => {
        const d = r.fromDate || r.from || '';
        return !(d && d.length >= 4 && d.slice(0, 4) === y);
      });
      const normalized = normalizeCC([...kept, ...(cloudCC || [])]);
      _memSet('cc_v2', normalized);
      if (typeof ccData !== 'undefined') ccData = normalized;
      totalRecords += (cloudCC || []).length;
    };

    for (const yrStr of years) {
      for (const { cat, key } of _YEAR_CATS) {
        try {
          const d = fsUnwrap(await fsGet(fbDocYearCat(parseInt(yrStr), cat)));
          // doc chưa có / sai định dạng → giữ nguyên local hạng mục đó (an toàn)
          if (!d || !Array.isArray(d.records)) continue;
          if (key === 'cc_v2') {
            replaceCC(d.records, yrStr);
          } else {
            _replaceYearData(key, d.records, yrStr);
            if (key === 'thu_v1') thuRecords = load('thu_v1', []);
            totalRecords += d.records.length;
          }
        } catch (e) {
          console.warn(`[Sync] Pull ${cat} ${yrStr} lỗi:`, e.message || e);
        }
      }
      console.log(`[Sync] ▼ Năm ${yrStr} đã thay thế theo cloud`);
    }

    if (!silent) hideSyncBanner();
    console.log(`[Sync] ▼ Pull xong — ${totalRecords} record từ cloud${_catsChanged ? ', danh mục cập nhật' : ''}`);
    if (callback) callback({ newRecords: totalRecords, conflicts: 0, catsChanged: _catsChanged });
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
// [12] SCHEDULE PUSH — đẩy cloud gần như tức thì sau khi save()
// (debounce ngắn 800ms để gộp nhiều save liên tiếp thành 1 lần đẩy)
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
    if (isSyncing()) { _pushTimer = setTimeout(schedulePush, 3_000); return; }
    if (typeof _pendingChanges !== 'undefined' && _pendingChanges > 0) {
      // skipPull:false → đẩy có gộp cloud trước (an toàn khi nhiều máy cùng ghi 1 năm)
      await pushChanges({ silent: true });
    }
  }, 800); // ~tức thì — gộp các thao tác gõ liên tiếp
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
    // B0: nếu còn thay đổi chưa đẩy → đẩy trước (vì pull giờ THAY THẾ, sẽ ghi đè local)
    if (typeof _pendingChanges !== 'undefined' && _pendingChanges > 0) {
      cancelScheduledPush();
      await pushChanges({ silent: true });
    }

    // B1: Pull — chỉ pull năm đang xem (thay thế local bằng cloud)
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

// ══════════════════════════════════════════════════════════════
// [16] CÓ MẠNG LẠI — tự đẩy nốt thay đổi đã lưu khi offline
// ══════════════════════════════════════════════════════════════
window.addEventListener('online', () => {
  if (!fbReady()) return;
  if (typeof _pendingChanges !== 'undefined' && _pendingChanges > 0) {
    console.log('[Sync] 🟢 Có mạng lại — đẩy nốt', _pendingChanges, 'thay đổi');
    if (typeof toast === 'function') toast('🟢 Có mạng lại — đang đồng bộ...', 'info');
    schedulePush();
  }
});
