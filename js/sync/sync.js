// sync.js — Sync Engine (bản gọn, 1 document/năm + 1 document danh_muc)
// Load order: sau doanhthu.js, trước main.js
// ─────────────────────────────────────────────────────────────────────────────
// KIẾN TRÚC (B) — chia theo HẠNG MỤC cho dễ đọc trên Firebase Console:
//   • Mỗi HẠNG MỤC theo NĂM = 1 document (tên field đầy đủ, không nén):
//       cpct_data/y{NĂM}_hoa_don · _tien_ung · _cham_cong · _thiet_bi · _thu_tien
//   • 5 document DANH MỤC dùng chung:
//       meta_cong_trinh (projects) · meta_khach_hang (customers) · meta_danh_muc (cat/role/năm-CT)
//       meta_tai_khoan (users)     · meta_hop_dong (HĐ chính + thầu phụ + quyết toán)
//   → Đổi lại để dễ nhìn; cái giá là đọc/ghi nhiều hơn (mỗi hạng mục 1 lượt).
//
//   • CLOUD LÀ DUY NHẤT ĐÚNG (online 100%):
//       - PULL  = TẢI cloud về và THAY THẾ dữ liệu local của (các) năm được pull.
//                 → Hết cảnh 2 máy lệch số: máy nào pull xong cũng giống hệt cloud.
//       - SAVE  = ghi xuống IndexedDB (đọc nhanh) RỒI đẩy cloud gần như tức thì.
//   • IndexedDB chỉ còn là "bộ nhớ đệm để mở app cho nhanh", không phải nguồn chính.
//     Khi pull, slice năm đó trong IndexedDB bị cloud ghi đè hoàn toàn.
//   • 5 doc danh mục cũng được THAY THẾ theo cloud (riêng users giữ mật khẩu local).
//
//   • OUTBOX (từ GĐ1 gia cố đồng bộ — xem core.storage.js):
//       - save() so "bảng bóng" → ghi vào outbox (IDB, sống qua F5) đúng các doc bị đổi.
//       - Push ngầm chỉ đẩy doc trong outbox; doc đẩy xong mới gỡ khỏi outbox.
//       - Pull KHÔNG BAO GIỜ thay thế doc còn trong outbox → GỘP thay vì thay thế.
//       - Xóa cứng có chủ đích → save(k, v, { purge:[id] }) → purgeIds, để bước gộp
//         cloud không kéo record đã xóa "sống lại".
//       - Mở app mà outbox còn dữ liệu → đẩy TRƯỚC rồi mới pull (main.js init()).
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
function softDeleteRecord(arr, id, extra = {}) {
  const now = Date.now();
  return arr.map(r =>
    String(r.id) === String(id)
      ? { ...r, deletedAt: now, updatedAt: now, deviceId: DEVICE_ID, ...extra }
      : r
  );
}

// ══════════════════════════════════════════════════════════════
// [3] CONFLICT RESOLUTION — bản nào mới hơn thì thắng (tombstone ưu tiên)
// ══════════════════════════════════════════════════════════════
function resolveConflict(local, cloud) {
  // (01/10/2026) BIA MỘ XÓA VĨNH VIỄN (purgedAt) LUÔN THẮNG — bất kể updatedAt.
  // Lý do: máy khác còn giữ bản xóa mềm/bản cũ của record này, khi đẩy lên sẽ
  // gộp lại → nếu không có luật này, record đã xóa vĩnh viễn sẽ "sống lại".
  if (local.purgedAt || cloud.purgedAt) {
    if (local.purgedAt && cloud.purgedAt) return (local.purgedAt >= cloud.purgedAt) ? local : cloud;
    return local.purgedAt ? local : cloud;
  }
  // Một bên xóa mềm, bên kia còn sống → so THỜI ĐIỂM XÓA với lần sửa cuối của bản sống:
  //   • Xóa xảy ra SAU lần sửa cuối → bên xóa thắng (máy khác chưa nhận lệnh xóa)
  //   • Bản sống được sửa SAU lúc xóa (vd bấm "Khôi phục" từ thùng rác) → bản sống thắng
  // (Trước 01/10/2026: bên xóa LUÔN thắng → bấm Khôi phục xong, lần đẩy cloud kế tiếp
  //  gộp với bản xóa trên cloud và record lại bị xóa → khôi phục không có tác dụng.)
  if (local.deletedAt && !cloud.deletedAt) {
    return (Number(local.deletedAt) >= _safeTs(cloud.updatedAt || cloud.createdAt || 0)) ? local : cloud;
  }
  if (!local.deletedAt && cloud.deletedAt) {
    return (Number(cloud.deletedAt) >= _safeTs(local.updatedAt || local.createdAt || 0)) ? cloud : local;
  }

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
  // (01/10/2026) Tách BIA MỘ xóa vĩnh viễn (purgedAt) ra riêng:
  //   • Bia mộ KHÔNG tham gia tranh chấp "1 tuần + 1 công trình = 1 record" — nếu không,
  //     bia mộ (updatedAt mới) sẽ đè mất tuần ĐANG SỐNG cùng tuần + công trình.
  //   • Bia mộ giữ theo id (nhiều bia mộ trùng id → giữ bản purgedAt mới nhất).
  //   • Record khác cùng id với bia mộ → bỏ (bia mộ thắng tuyệt đối).
  //   • Bản XÓA MỀM khác id nhưng cùng tuần + công trình, xóa TRƯỚC lúc purge → bỏ luôn
  //     (đây là bản trùng đời cũ, nếu giữ sẽ hiện lại trong thùng rác). Bản đang sống
  //     thì không bao giờ bị bỏ.
  const tombs = new Map();
  filled.forEach(r => {
    if (!r || !r.purgedAt) return;
    const prev = tombs.get(String(r.id));
    if (!prev || r.purgedAt > prev.purgedAt) tombs.set(String(r.id), r);
  });
  const tombKeyTs = new Map(); // "tuần__công trình" → purgedAt lớn nhất
  tombs.forEach(t => {
    const k = `${t.fromDate || t.from || ''}__${t.projectId || t.ct || ''}`;
    tombKeyTs.set(k, Math.max(tombKeyTs.get(k) || 0, Number(t.purgedAt) || 0));
  });
  const byKey = new Map();
  filled.forEach(r => {
    if (!r || r.purgedAt || tombs.has(String(r.id))) return;
    if (r.deletedAt && tombKeyTs.size) {
      const tk = `${r.fromDate || r.from || ''}__${r.projectId || r.ct || ''}`;
      if (tombKeyTs.has(tk) && Number(r.deletedAt) <= tombKeyTs.get(tk)) return;
    }
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
  return [...byKey.values(), ...tombs.values()];
}

// ══════════════════════════════════════════════════════════════
// [7] CỜ TRẠNG THÁI SYNC
// ══════════════════════════════════════════════════════════════
let _syncPushing = false;
let _syncPulling = false;
// Các năm ĐÃ pull đầy đủ từ cloud trong phiên (lần mở app) này.
// onYearChange() dựa vào đây để biết năm nào cần tải (thay cho kiểu cũ "local có dữ liệu
// năm đó thì bỏ qua" — kiểu cũ sai khi local chỉ có 1 phần năm, vd vài tuần chấm công vắt năm,
// hoặc dữ liệu năm đó trong máy đã cũ).
const _pulledYearsThisSession = new Set();
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
    // (01/10/2026) Bia mộ xóa vĩnh viễn (purgedAt) luôn thắng — tránh HĐ "sống lại"
    if (local.purgedAt || cloud.purgedAt) {
      if ((Number(local.purgedAt) || 0) >= (Number(cloud.purgedAt) || 0)) merged[ct] = local;
      return;
    }
    const localTs = Math.max(Number(local.updatedAt) || 0, Number(local.deletedAt) || 0);
    const cloudTs = Math.max(Number(cloud.updatedAt) || 0, Number(cloud.deletedAt) || 0);
    if (localTs >= cloudTs) merged[ct] = local;
  });
  return merged;
}

// Gộp cat_items_v1 (per-item theo updatedAt) + dedup theo tên + canonical hóa tên
// (01/10/2026) Sửa lỗi danh mục đã xóa bị "hồi sinh":
//   1. Item BẢN TẠM (seed — tạo từ DEFAULTS trên máy mới/web ẩn danh) của local bị BỎ
//      nếu cloud đã có dữ liệu cho loại đó → mặc định trong code không lọt lên cloud.
//   2. Trùng tên giải quyết bằng _catResolveNameConflicts: bản mới nhất THEO TÊN thắng,
//      kể cả bia mộ → bia mộ "Chi Phí Khác" mới hơn sẽ xóa luôn bản cũ khác id.
//   3. Canonical hóa tên KHÔNG đóng dấu updatedAt = bây giờ (trước đây đóng dấu → bản
//      local chỉ đổi hoa/thường cũng thành "mới nhất" và đè thao tác xóa trên cloud).
function _mergeCatItems(localItems, cloudItems) {
  const merged   = {};
  localItems = localItems || {};
  cloudItems = cloudItems || {};
  const allTypes = new Set([...Object.keys(localItems), ...Object.keys(cloudItems)]);
  allTypes.forEach(type => {
    const cloudArr = Array.isArray(cloudItems[type]) ? cloudItems[type] : [];
    const cloudIds = new Set(cloudArr.map(ci => ci && ci.id));
    const byId = new Map();
    (localItems[type] || []).forEach(item => {
      if (!item) return;
      // Bản tạm chưa từng được người dùng đụng tới + cloud đã có dữ liệu → bỏ
      if (item.seed && cloudArr.length && !cloudIds.has(item.id)) return;
      byId.set(item.id, { ...item });
    });
    cloudArr.forEach(ci => {
      if (!ci) return;
      const li = byId.get(ci.id);
      if (!li || (ci.updatedAt || 0) >= (li.updatedAt || 0)) byId.set(ci.id, { ...ci });
    });
    const list = [...byId.values()];
    if (typeof _catResolveNameConflicts === 'function') _catResolveNameConflicts(list);
    merged[type] = list;
  });
  if (typeof normalizeCatDisplayName === 'function') {
    Object.keys(merged).forEach(type => {
      (merged[type] || []).forEach(item => {
        if (item.isDeleted) return;
        const canonical = normalizeCatDisplayName(type, item.name);
        if (canonical !== item.name) item.name = canonical;
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
  // (01/10/2026) Gán luôn vào biến global cats.* — trước đây chỉ ghi _mem nên cats.* vẫn
  // giữ danh sách CŨ (còn tên đã xóa ở máy khác) cho tới khi chuyển tab → thao tác danh
  // mục kế tiếp lưu ngược danh sách cũ lên cloud.
  const _set = (sk, catId, arr) => {
    _memSet(sk, arr);
    if (typeof cats !== 'undefined') cats[catId] = arr;
  };
  if (merged.loai)  _set('cat_loai',  'loaiChiPhi', nameArr(merged.loai,  'loai'));
  if (merged.ncc)   _set('cat_ncc',   'nhaCungCap', nameArr(merged.ncc,   'ncc'));
  if (merged.nguoi) _set('cat_nguoi', 'nguoiTH',    nameArr(merged.nguoi, 'nguoi'));
  if (merged.tp)    _set('cat_tp',    'thauPhu',    nameArr(merged.tp,    'tp'));
  if (merged.cn)    _set('cat_cn',    'congNhan',   nameArr(merged.cn,    'cn'));
  if (merged.tbteb) _set('cat_tbteb', 'tbTen',      nameArr(merged.tbteb, 'tbteb'));
  if (typeof rebuildCatIdMaps === 'function') rebuildCatIdMaps();
  _dmRerenderIfActive();
}

// Đang mở tab Danh Mục → vẽ lại để thấy ngay thay đổi từ máy khác, và để chỉ số dòng
// (idx trong nút Sửa/Xóa) khớp với mảng cats.* mới. Bỏ qua nếu người dùng đang gõ
// trong tab (ô sửa tên / ô thêm mới / ô tìm) để không làm mất chữ đang nhập.
function _dmRerenderIfActive() {
  const page = document.getElementById('page-danhmuc');
  if (!page || !page.classList.contains('active')) return;
  const ae = document.activeElement;
  if (ae && page.contains(ae) && ae.tagName === 'INPUT') return;
  if (typeof renderSettings === 'function') setTimeout(() => { try { renderSettings(); } catch (e) {} }, 0);
}

// ══════════════════════════════════════════════════════════════
// [8b] HELPERS DÙNG OUTBOX — gộp cloud vào local + loại purgeIds, nạp lại global
// ══════════════════════════════════════════════════════════════

// Nạp lại biến global của 1 key từ _mem, sau khi dữ liệu cloud được gộp/thay vào _mem.
// QUAN TRỌNG: nếu biến global (invoices, ccData...) còn trỏ vào mảng CŨ thì lần save()
// kế tiếp sẽ lưu lại mảng cũ → làm rơi mất record vừa gộp từ máy khác.
function _refreshGlobal(key) {
  switch (key) {
    case 'inv_v3':       if (typeof invoices         !== 'undefined') invoices         = load(key, []); break;
    case 'ung_v1':       if (typeof ungRecords       !== 'undefined') ungRecords       = load(key, []); break;
    case 'cc_v2':        if (typeof ccData           !== 'undefined') ccData           = load(key, []); break;
    case 'tb_v1':        if (typeof tbData           !== 'undefined') tbData           = load(key, []); break;
    case 'thu_v1':       if (typeof thuRecords       !== 'undefined') thuRecords       = load(key, []); break;
    case 'projects_v1':  if (typeof projects         !== 'undefined') projects         = load(key, []); break;
    case 'customers_v1': if (typeof customers        !== 'undefined') customers        = load(key, []); break;
    case 'hopdong_v1':   if (typeof hopDongData      !== 'undefined') hopDongData      = load(key, {}); break;
    case 'thauphu_v1':   if (typeof thauPhuContracts !== 'undefined') thauPhuContracts = load(key, []); break;
    case 'quyettoan_v1': if (typeof quyetToanRecords !== 'undefined') quyetToanRecords = load(key, []); break;
    case 'cat_cn_roles': if (typeof cnRoles          !== 'undefined') cnRoles          = load(key, {}); break;
  }
  if (_INV_CACHE_KEYS.has(key) && typeof clearInvoiceCache === 'function') clearInvoiceCache();
}

// Doc có cờ overwrite (do khôi phục đánh dấu, chưa đẩy xong) không?
function _outboxIsOverwrite(docId) {
  const row = _outboxGet(docId);
  return !!(row && row.overwrite);
}

// Tập purgeIds (id bị xóa cứng, chưa đẩy) của 1 doc trong outbox
function _purgeSetOf(docId) {
  const row = _outboxGet(docId);
  return new Set(row ? row.purgeIds : []);
}

// GỘP record cloud của 1 doc năm vào local (KHÔNG thay thế), rồi loại bỏ purgeIds.
// Dùng khi doc còn thay đổi local chưa đẩy (pull) và ở bước đọc-gộp trước khi ghi (push).
// Gộp theo id trên TOÀN mảng key: tombstone thắng, sau đó updatedAt mới hơn thắng.
function _mergeYearIntoLocal(key, cloudRecs, purge) {
  const local = load(key, []);
  let merged = (key === 'cc_v2')
    ? normalizeCC([...local, ...(cloudRecs || [])])
    : mergeDatasets(local, cloudRecs || []);
  if (purge && purge.size) merged = merged.filter(r => !(r && purge.has(String(r.id))));
  _memSet(key, merged);
  _refreshGlobal(key);
}

// Tách docId năm → { docId, yr, cat, key, dateField } (null nếu không phải doc năm hợp lệ)
function _parseYearDocId(docId) {
  const m = /^y(\d{4})_(.+)$/.exec(docId || '');
  if (!m) return null;
  const c = _YEAR_CATS.find(x => x.cat === m[2]);
  return c ? { docId, yr: m[1], cat: c.cat, key: c.key, dateField: c.dateField } : null;
}

// ── 5 doc meta dùng chung ──
const _META_DOCS = ['meta_cong_trinh', 'meta_khach_hang', 'meta_danh_muc', 'meta_tai_khoan', 'meta_hop_dong'];

function _metaPayload(docId) {
  switch (docId) {
    case 'meta_cong_trinh': return fbMetaCTPayload();
    case 'meta_khach_hang': return fbMetaKHPayload();
    case 'meta_danh_muc':   return fbMetaDMPayload();
    case 'meta_tai_khoan':  return fbMetaTKPayload();
    case 'meta_hop_dong':   return fbMetaHDPayload();
  }
  return null;
}

// Loại các record có purgeId dạng "key:id" khỏi 1 mảng meta
function _purgeArr(arr, key, purge) {
  if (!purge || !purge.size || !Array.isArray(arr)) return arr;
  return arr.filter(r => !(r && purge.has(`${key}:${r.id}`)));
}

// Áp dữ liệu 1 doc meta cloud (d) vào local.
//   mode 'replace' : doc KHÔNG còn thay đổi local chưa đẩy → THAY THẾ local bằng cloud (cloud là chuẩn)
//   mode 'merge'   : doc CÒN thay đổi local chưa đẩy (hoặc đang ở bước đọc-gộp trước khi ghi)
//                    → GỘP cloud + local, giữ cả 2, rồi loại purgeIds
// Kiểu gộp theo từng loại dữ liệu:
//   - projects, customers, thauPhu, quyetToan : mảng có id → mergeDatasets() (tombstone + LWW)
//   - hopDong   : object map theo key CT → _mergeHopDong() (LWW)
//   - catItems  : per-item theo updatedAt → _mergeCatItems() + dựng lại mảng tên
//   - cnRoles, ctYears : object không có timestamp → gộp nông, local đè cloud
//   - users     : giữ mật khẩu local → _mergeUsersSafe()
// Trả true nếu có áp dữ liệu.
function _metaApply(docId, d, mode, purge) {
  if (!d) return false;
  const merge = mode === 'merge';
  switch (docId) {
    case 'meta_cong_trinh': {
      if (!Array.isArray(d.projects)) return false;
      let v = merge ? _purgeArr(mergeDatasets(load('projects_v1', []), d.projects), 'projects_v1', purge) : d.projects;
      _memSet('projects_v1', v);
      _refreshGlobal('projects_v1');
      if (typeof rebuildCatCTFromProjects === 'function') rebuildCatCTFromProjects();
      return true;
    }
    case 'meta_khach_hang': {
      if (!Array.isArray(d.customers)) return false;
      let v = merge ? _purgeArr(mergeDatasets(load('customers_v1', []), d.customers), 'customers_v1', purge) : d.customers;
      _memSet('customers_v1', v);
      _refreshGlobal('customers_v1');
      return true;
    }
    case 'meta_danh_muc': {
      if (d.catItems && typeof d.catItems === 'object') {
        const v = merge ? _mergeCatItems(load('cat_items_v1', {}), d.catItems) : d.catItems;
        _memSet('cat_items_v1', v);
        _applyCatItemArrays(v); // dựng lại cat_loai, cat_ncc... từ bản đã gộp/thay
      }
      if (d.cnRoles && typeof d.cnRoles === 'object') {
        const v = merge ? { ...d.cnRoles, ...load('cat_cn_roles', {}) } : d.cnRoles;
        _memSet('cat_cn_roles', v);
        _refreshGlobal('cat_cn_roles');
      }
      if (d.ctYears && typeof d.ctYears === 'object') {
        const v = merge ? { ...d.ctYears, ...load('cat_ct_years', {}) } : d.ctYears;
        _memSet('cat_ct_years', v);
        if (typeof cats !== 'undefined') cats.congTrinhYears = v;
      }
      return true;
    }
    case 'meta_tai_khoan': {
      if (!Array.isArray(d.users)) return false;
      let v;
      if (merge) {
        v = _mergeUsersSafe(load('users_v1', []), d.users);
      } else {
        // Thay theo cloud nhưng vá lại mật khẩu local nếu cloud thiếu
        const pwById = new Map();
        load('users_v1', []).forEach(u => { if (u && u.password) pwById.set(u.id || u.username, u.password); });
        v = d.users.map(u => {
          if (u && !u.password) {
            const pw = pwById.get(u.id || u.username);
            if (pw) return { ...u, password: pw };
          }
          return u;
        });
      }
      _memSet('users_v1', v);
      return true;
    }
    case 'meta_hop_dong': {
      if (d.hopDong && typeof d.hopDong === 'object') {
        let v = d.hopDong;
        if (merge) {
          v = _mergeHopDong(load('hopdong_v1', {}), d.hopDong);
          if (purge && purge.size) Object.keys(v).forEach(k => { if (purge.has(`hopdong_v1:${k}`)) delete v[k]; });
        }
        _memSet('hopdong_v1', v);
        _refreshGlobal('hopdong_v1');
      }
      if (Array.isArray(d.thauPhu)) {
        const v = merge ? _purgeArr(mergeDatasets(load('thauphu_v1', []), d.thauPhu), 'thauphu_v1', purge) : d.thauPhu;
        _memSet('thauphu_v1', v);
        _refreshGlobal('thauphu_v1');
      }
      if (Array.isArray(d.quyetToan)) {
        const v = merge ? _purgeArr(mergeDatasets(load('quyettoan_v1', []), d.quyetToan), 'quyettoan_v1', purge) : d.quyetToan;
        _memSet('quyettoan_v1', v);
        _refreshGlobal('quyettoan_v1');
      }
      return true;
    }
  }
  return false;
}

// ══════════════════════════════════════════════════════════════
// [9] PUSH — đẩy local lên cloud DỰA TRÊN OUTBOX
// ══════════════════════════════════════════════════════════════
// Nguyên tắc an toàn (GĐ1 + GĐ2 — gia cố đồng bộ):
//   • Push ngầm (silent) chỉ đẩy ĐÚNG các doc đang nằm trong outbox (doc bẩn).
//     Push thủ công (nút 🔄) và opts.allYears = đẩy đủ mọi năm × hạng mục + 5 meta.
//   • Mỗi doc: ĐỌC cloud (kèm updateTime) → GỘP vào local (loại purgeIds) → GHI CÓ
//     ĐIỀU KIỆN (khóa lạc quan). Máy khác ghi chen → đọc-gộp-ghi lại (tối đa 3 lần).
//     Đọc cloud lỗi (mạng, 403, 429, 500...) → doc đó FAIL, TUYỆT ĐỐI KHÔNG ghi đè.
//   • Doc ghi thành công → gỡ khỏi outbox, TRỪ KHI bị sửa thêm trong lúc push
//     (lastTs > pushStartTs) → ở lại, lần sau đẩy tiếp.
//   • Chỉ báo "✅ Đã đồng bộ" khi outbox rỗng. Còn lỗi → tự thử lại với backoff
//     5s → 15s → 60s → 5 phút (không spam banner).
// opts.silent   = true  → chạy ngầm, chỉ hiện banner khi lỗi (lần đầu của chuỗi lỗi)
// opts.allYears = true  → đẩy đủ mọi năm (dù silent) — dùng khi khôi phục
// [GĐ2] ĐÃ BỎ opts.skipPull (ghi đè thẳng không gộp). Muốn cố ý ghi đè (chỉ khôi phục
//   snapshot/sao lưu) thì đánh dấu outbox _outboxMark(docId, null, { overwrite:true }).
//   Truyền skipPull vào sẽ bị bỏ qua (push vẫn đọc-gộp-ghi có điều kiện, an toàn).
// Trả về true nếu đẩy hết (không lỗi và outbox rỗng).

let _pushRetryIdx   = 0;     // đang ở nấc backoff thứ mấy
let _pushRetryTimer = null;  // hẹn giờ thử lại
const _PUSH_RETRY_DELAYS = [5_000, 15_000, 60_000, 300_000];

// Hẹn thử đẩy lại khi push lỗi (backoff tăng dần, tối đa 5 phút)
function _schedulePushRetry() {
  if (_outboxSize() === 0) { _pushRetryIdx = 0; return; }
  clearTimeout(_pushRetryTimer);
  const delay = _PUSH_RETRY_DELAYS[Math.min(_pushRetryIdx, _PUSH_RETRY_DELAYS.length - 1)];
  _pushRetryIdx++;
  console.log(`[Sync] ⏳ Sẽ tự thử đẩy lại sau ${delay / 1000}s (lần ${_pushRetryIdx})`);
  _pushRetryTimer = setTimeout(async () => {
    _pushRetryTimer = null;
    if (_outboxSize() === 0) { _pushRetryIdx = 0; return; }
    if (!fbReady()) return;
    if (!navigator.onLine || isSyncing()) { _schedulePushRetry(); return; }
    await pushChanges({ silent: true });
  }, delay);
}

// ── Vòng ĐỌC → GỘP → GHI CÓ ĐIỀU KIỆN (khóa lạc quan — GĐ2) ──────────────────
// Dùng chung cho doc năm và doc meta.
//   mergeFn(data)    : gộp dữ liệu cloud (đã fsUnwrap; null nếu doc chưa có) vào local.
//                      Được phép async. Throw nếu dữ liệu cloud sai định dạng.
//   payloadFn()      : dựng payload từ local SAU KHI gộp
//   skipIfNewEmpty() : (tùy chọn) doc chưa có trên cloud + local trống → khỏi tạo doc rỗng
// Máy khác ghi chen vào giữa (xung đột) → đọc lại, gộp lại, ghi lại; tối đa
// _PUSH_CONFLICT_RETRY lần, mỗi lần chờ ngẫu nhiên 300–1200ms (tránh 2 máy lại đụng nhau).
// Hết lượt → throw (doc FAIL, giữ outbox, thử lại theo backoff).
// Doc có cờ overwrite (do KHÔI PHỤC đánh dấu) → GHI ĐÈ KHÔNG ĐIỀU KIỆN, không gộp —
// chỗ duy nhất (cùng _doResetAll) được phép ghi đè thẳng vì cố ý thay toàn bộ.
const _PUSH_CONFLICT_RETRY = 3;
const _sleep = ms => new Promise(r => setTimeout(r, ms));

async function _pushDocWithLock(docId, mergeFn, payloadFn, skipIfNewEmpty) {
  if (_outboxIsOverwrite(docId)) {
    await fsSet(docId, payloadFn());                       // cố ý ghi đè (khôi phục)
    return;
  }
  for (let attempt = 0; ; attempt++) {
    // 1) ĐỌC kèm updateTime. Lỗi mạng/HTTP ≠ 404 → throw → doc FAIL, KHÔNG ghi đè
    const { data, updateTime, exists } = await fsGetWithTime(docId);
    if (exists && !data) {
      throw new Error(`doc ${docId} trên cloud không đúng định dạng — không dám ghi đè`);
    }
    // 2) GỘP cloud vào local (loại purgeIds)
    await mergeFn(exists ? data : null);
    if (!exists && skipIfNewEmpty && skipIfNewEmpty()) return;
    // 3) GHI CÓ ĐIỀU KIỆN: chỉ thành công nếu không ai ghi chen từ lúc đọc
    try {
      await fsSetIf(docId, payloadFn(), exists ? updateTime : null);
      return;
    } catch (e) {
      if (!e.conflict) throw e;                            // lỗi thường → doc FAIL
      if (attempt >= _PUSH_CONFLICT_RETRY) {
        throw new Error(`xung đột ${docId} quá ${_PUSH_CONFLICT_RETRY} lần — sẽ thử lại sau`);
      }
      console.log(`[Sync] ⚔ Xung đột ${docId} — gộp lại lần ${attempt + 1}/${_PUSH_CONFLICT_RETRY}`);
      await _sleep(300 + Math.floor(Math.random() * 900));
    }
  }
}

// Đẩy 1 doc năm. Lỗi → throw (doc FAIL).
// Trả về purgeIds đã đẩy (chụp TRƯỚC khi đẩy — purgeId phát sinh trong lúc đẩy vẫn giữ lại).
async function _pushYearDoc(t) {
  const { docId, yr, key, dateField } = t;
  const purge = _purgeSetOf(docId);
  await _pushDocWithLock(
    docId,
    cd => {
      if (!cd) return;                                     // 404: chưa có doc → không có gì để gộp
      if (!Array.isArray(cd.records)) {
        throw new Error(`doc ${docId} trên cloud không đúng định dạng — không dám ghi đè`);
      }
      _mergeYearIntoLocal(key, cd.records, purge);
    },
    () => fbYearCatPayload(yr, key, dateField),
    () => !fbYearCatPayload(yr, key, dateField).records.length
  );
  return [...purge];
}

// Đẩy 1 doc meta. Lỗi → throw. Trả về purgeIds đã đẩy.
async function _pushMetaDoc(docId) {
  const purge = _purgeSetOf(docId);
  await _pushDocWithLock(
    docId,
    async d => {
      if (d) { _metaApply(docId, d, 'merge', purge); return; }
      // meta_khach_hang chưa tồn tại → gộp với customers đời cũ nằm trong meta_cong_trinh
      if (docId === 'meta_khach_hang') {
        const ct = fsUnwrap(await fsGet(fbDocMetaCT()));
        if (ct && Array.isArray(ct.customers)) _metaApply(docId, { customers: ct.customers }, 'merge', purge);
      }
    },
    () => _metaPayload(docId)
  );
  return [...purge];
}

async function pushChanges(opts = {}) {
  const silent   = opts?.silent   ?? false;
  const allYears = opts?.allYears ?? false;
  if (opts?.skipPull) console.warn('[Sync] opts.skipPull đã bỏ từ GĐ2 — bỏ qua, push vẫn đọc-gộp an toàn');
  if (!fbReady()) { console.log('[Sync] Push bỏ qua — Firebase chưa cấu hình'); return false; }
  if (_syncPushing) { console.log('[Sync] Push bỏ qua — đang sync'); return false; }

  _syncPushing = true;
  // Mốc bắt đầu push (đồng hồ tăng nghiêm ngặt của outbox): doc nào bị sửa SAU mốc này
  // sẽ không bị gỡ khỏi outbox dù lần ghi này thành công.
  const pushStartTs = _outboxNow();
  _ensureSyncDot(); _setSyncDot('syncing');
  _setSyncState('syncing');
  if (!silent) showSyncBanner('⏳ Đang đẩy (push)...');

  // ── Chọn danh sách doc cần đẩy ──
  const full     = !silent || allYears;
  const dirtyIds = _outboxList().map(r => r.docId);
  const yearTargets = [];
  const metaTargets = [];
  const seen = new Set();
  const addYear = docId => {
    if (seen.has(docId)) return;
    const t = _parseYearDocId(docId);
    if (t) { seen.add(docId); yearTargets.push(t); }
  };
  // Doc lạ trong outbox (không thuộc cấu trúc B) → gỡ luôn để khỏi kẹt mãi
  dirtyIds.forEach(id => {
    if (!_META_DOCS.includes(id) && !_parseYearDocId(id)) {
      console.warn('[Sync] Outbox có doc lạ, gỡ bỏ:', id);
      _outboxClear(id, Infinity);
    }
  });
  if (full) {
    // Đẩy đủ: mọi năm local + năm của các doc bẩn (vd năm vừa trống sau khi xóa)
    const years = new Set(_getAllLocalYears());
    dirtyIds.forEach(id => { const t = _parseYearDocId(id); if (t) years.add(t.yr); });
    [...years].sort().forEach(yr => {
      _YEAR_CATS.forEach(({ cat, key, dateField }) => {
        const docId = fbDocYearCat(parseInt(yr), cat);
        const has = load(key, []).some(x => x && x[dateField] && String(x[dateField]).startsWith(String(yr)));
        if (has || _outboxHas(docId)) addYear(docId);
      });
    });
    metaTargets.push(..._META_DOCS);
  } else {
    dirtyIds.forEach(id => {
      if (_META_DOCS.includes(id)) metaTargets.push(id);
      else addYear(id);
    });
  }

  console.log('[Sync] ▲ Push bắt đầu —', full ? 'ĐẦY ĐỦ' : 'theo outbox',
    '| doc năm:', yearTargets.map(t => t.docId).join(',') || '(none)',
    '| meta:', metaTargets.join(',') || '(none)',
    '| device:', DEVICE_ID.slice(0, 8));

  let ok = 0, fail = 0;
  try {
    for (const t of yearTargets) {
      try {
        const pushed = await _pushYearDoc(t);
        _outboxClear(t.docId, pushStartTs, pushed);
        ok++;
      } catch (e) {
        fail++;
        console.warn(`[Sync] ✗ ${t.docId} lỗi — GIỮ trong outbox, KHÔNG ghi đè cloud:`, e.message || e);
      }
    }
    for (const docId of metaTargets) {
      try {
        const pushed = await _pushMetaDoc(docId);
        _outboxClear(docId, pushStartTs, pushed);
        ok++;
      } catch (e) {
        fail++;
        console.warn(`[Sync] ✗ ${docId} lỗi — GIỮ trong outbox, KHÔNG ghi đè cloud:`, e.message || e);
      }
    }
  } catch (e) {
    fail++;
    console.warn('[Sync] ▲ Push lỗi bất ngờ:', e);
  } finally {
    _syncPushing = false;
  }

  const remaining = _outboxSize();
  if (fail === 0) {
    _pushRetryIdx = 0;
    clearTimeout(_pushRetryTimer); _pushRetryTimer = null;
    localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
    _setSyncDot('');
    if (remaining === 0) {
      if (!silent) {
        _setSyncState('success');
        const hhmm = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        showSyncBanner(`✅ Đã đồng bộ lúc ${hhmm}`, 3000);
      } else {
        _updateSyncBtnBadge();
        if (typeof updateJbBtn === 'function') updateJbBtn();
      }
    } else {
      // Có thay đổi mới phát sinh TRONG lúc push → chưa báo ✅, hẹn đẩy tiếp ngay
      _updateSyncBtnBadge();
      if (typeof updateJbBtn === 'function') updateJbBtn();
      schedulePush();
    }
    console.log(`[Sync] ▲ Push xong — ${ok} doc | còn ${remaining} doc chờ | device: ${DEVICE_ID.slice(0, 8)}`);
  } else {
    _setSyncDot(navigator.onLine ? 'error' : 'offline'); _setSyncState('error');
    // Chỉ hiện banner khi người dùng tự bấm, hoặc lần lỗi ĐẦU của 1 chuỗi (không spam)
    if (!silent || _pushRetryIdx === 0) {
      showSyncBanner(navigator.onLine
        ? `⚠️ Sync lỗi ${fail} mục — dữ liệu vẫn giữ trong máy, app sẽ tự thử lại`
        : '⚠️ Mất kết nối internet — dữ liệu vẫn giữ trong máy, sẽ đẩy khi có mạng', 5000);
    }
    console.warn(`[Sync] ▲ Push xong nhưng LỖI ${fail} doc (OK ${ok}) — còn ${remaining} doc trong outbox`);
    _schedulePushRetry();
  }
  return fail === 0 && remaining === 0;
}

// ══════════════════════════════════════════════════════════════
// [10] PULL META — đọc 5 doc danh mục dùng chung
//   meta_cong_trinh · meta_khach_hang · meta_danh_muc · meta_tai_khoan · meta_hop_dong
//   • Doc KHÔNG bẩn  → THAY THẾ local bằng cloud (cloud là chuẩn)
//   • Doc CÒN bẩn    → GỘP (không thay thế) + loại purgeIds, GIỮ outbox để push sau
//   • Đọc lỗi (mạng/403/500...) → giữ nguyên local doc đó
// ══════════════════════════════════════════════════════════════
async function _pullMeta() {
  let changed = false;
  let ctDoc = null;
  for (const docId of _META_DOCS) {
    try {
      let d = fsUnwrap(await fsGet(docId));
      if (docId === 'meta_cong_trinh') ctDoc = d;
      // meta_khach_hang chưa tồn tại → fallback customers cũ trong meta_cong_trinh (trước 19/06/2026)
      if (!d && docId === 'meta_khach_hang' && ctDoc && Array.isArray(ctDoc.customers)) {
        d = { customers: ctDoc.customers };
      }
      if (!d) continue;
      if (_outboxIsOverwrite(docId)) {
        console.log(`[Sync] ▼ ${docId} đang chờ ghi đè sau khôi phục → giữ nguyên local`);
        continue;
      }
      const dirty = _outboxHas(docId);
      if (dirty) console.log(`[Sync] ▼ ${docId} còn thay đổi chưa đẩy → GỘP thay vì thay thế`);
      if (_metaApply(docId, d, dirty ? 'merge' : 'replace', dirty ? _purgeSetOf(docId) : null)) changed = true;
    } catch (e) {
      console.warn(`[Sync] ${docId} pull lỗi — giữ nguyên local:`, e.message || e);
    }
  }
  if (changed) console.log('[Sync] ▼ danh mục đã cập nhật theo cloud');
  return changed;
}

// ══════════════════════════════════════════════════════════════
// [11] PULL — tải cloud về (danh mục + từng năm)
//   • Doc năm KHÔNG bẩn → THAY THẾ slice năm đó bằng cloud (cloud là chuẩn)
//   • Doc năm CÒN bẩn   → GỘP + loại purgeIds (không bao giờ đè dữ liệu chưa đẩy)
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
    // ── Danh mục dùng chung (5 doc meta) ──
    let _catsChanged = false;
    try { _catsChanged = await _pullMeta(); }
    catch (e) { console.warn('[Sync] meta pull lỗi:', e.message || e); }

    // ── Dữ liệu từng năm ──
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
      _refreshGlobal('cc_v2');
    };

    // Danh sách doc cần đọc: mọi hạng mục của (các) năm được pull …
    const jobs = [];
    years.forEach(yrStr => _YEAR_CATS.forEach(c => jobs.push({ yrStr, cat: c.cat, key: c.key })));
    // … CỘNG THÊM doc chấm công của NĂM TRƯỚC (fix 29/09/2026).
    // Lý do: tuần chấm công được lưu theo NGÀY BẮT ĐẦU tuần (fromDate) — tuần 28/12/2025–03/01/2026
    // nằm trong doc y2025_cham_cong, nhưng hóa đơn lương sinh ra từ tuần đó lại mang ngày
    // 03/01/2026 và được tính vào tổng chi năm 2026. Nếu chỉ pull 2026 (máy mới / web ẩn danh)
    // thì thiếu các tuần vắt năm này → tổng CP 2026 thấp hơn máy khác.
    years.forEach(yrStr => {
      const prev = String(parseInt(yrStr) - 1);
      if (!years.includes(prev)) jobs.push({ yrStr: prev, cat: 'cham_cong', key: 'cc_v2' });
    });

    const _errYears = new Set();   // năm có doc đọc lỗi → chưa coi là "đã tải"
    let _lastYr = null;
    for (const { yrStr, cat, key } of jobs) {
      if (_lastYr !== null && _lastYr !== yrStr) console.log(`[Sync] ▼ Năm ${_lastYr} đã cập nhật theo cloud`);
      _lastYr = yrStr;
      {
        const docId = fbDocYearCat(parseInt(yrStr), cat);
        try {
          const d = fsUnwrap(await fsGet(docId)); // lỗi mạng/HTTP → throw → giữ nguyên local
          // doc chưa có / sai định dạng → giữ nguyên local hạng mục đó (an toàn)
          if (!d || !Array.isArray(d.records)) continue;
          if (_outboxIsOverwrite(docId)) {
            // Khôi phục chưa đẩy xong → local là chuẩn, KHÔNG gộp/thay bằng cloud cũ
            console.log(`[Sync] ▼ ${docId} đang chờ ghi đè sau khôi phục → giữ nguyên local`);
            continue;
          } else if (_outboxHas(docId)) {
            // Còn thay đổi local CHƯA đẩy → KHÔNG thay thế (sẽ mất) → GỘP, giữ outbox cho push sau
            console.log(`[Sync] ▼ ${docId} còn thay đổi chưa đẩy → GỘP thay vì thay thế`);
            _mergeYearIntoLocal(key, d.records, _purgeSetOf(docId));
          } else if (key === 'cc_v2') {
            replaceCC(d.records, yrStr);
          } else {
            _replaceYearData(key, d.records, yrStr);
            _refreshGlobal(key);
          }
          totalRecords += d.records.length;
        } catch (e) {
          console.warn(`[Sync] Pull ${docId} lỗi — giữ nguyên local:`, e.message || e);
          _errYears.add(String(yrStr));
        }
      }
    }
    if (_lastYr !== null) console.log(`[Sync] ▼ Năm ${_lastYr} đã cập nhật theo cloud`);
    years.forEach(y => { if (!_errYears.has(String(y))) _pulledYearsThisSession.add(String(y)); });

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
      // Push ngầm theo outbox, có đọc-gộp cloud trước khi ghi
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
    // B0: còn doc chưa đẩy → đẩy trước. (Kể cả khi đẩy lỗi, pull ở B1 cũng chỉ GỘP
    // các doc còn bẩn chứ không thay thế → không mất dữ liệu.)
    if (typeof _pendingChanges !== 'undefined' && _pendingChanges > 0) {
      cancelScheduledPush();
      await pushChanges({ silent: true });
    }

    // B1: Pull — pull TẤT CẢ các năm đang chọn trong bộ lọc (hỗ trợ multi-year)
    // [FIX Bug B] Trước đây chỉ suy ra 1 năm từ activeYear; khi chọn ≥2 năm, activeYear=0
    // bị coi là falsy nên rơi về năm hệ thống hiện tại → bỏ sót các năm khác đã chọn.
    const _syncYrs = (typeof activeYears !== 'undefined' && activeYears.size > 0)
      ? [...activeYears]
      : [(typeof activeYear !== 'undefined' && activeYear) || new Date().getFullYear()];
    for (const _yr of _syncYrs) {
      await new Promise(resolve => pullChanges(_yr, resolve));
    }

    // B2: Reload globals + clear cache
    if (typeof _reloadGlobals === 'function') _reloadGlobals();
    else if (typeof clearAllCache === 'function') clearAllCache();

    // B3: Push (đẩy đủ mọi năm × hạng mục + 5 meta, có đọc-gộp)
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
// [15] FLUSH ON HIDE — đẩy nốt dữ liệu khi tab bị ẩn/đóng (best-effort)
// (chống mất dữ liệu trên mobile khi khóa màn hình / tắt trình duyệt)
// Trước đây dùng skipPull:true (ghi đè thẳng cloud → xóa dữ liệu máy khác). Nay push
// THƯỜNG (có đọc-gộp). Nếu chưa kịp đẩy xong thì dữ liệu vẫn an toàn trong outbox
// (IDB) → lần mở app sau tự đẩy nốt trước khi pull.
// ══════════════════════════════════════════════════════════════
let _lastFlushTs = 0; // giới hạn: tối đa 1 lần / 10s
(function() {
  function _flushOnHide() {
    if (!fbReady()) return;
    if (typeof _pendingChanges === 'undefined' || _pendingChanges <= 0) return;
    if (isSyncing()) return;
    if (Date.now() - _lastFlushTs < 10_000) return;
    _lastFlushTs = Date.now();
    console.log('[Sync] ⚡ Flush on hide — còn', _pendingChanges, 'doc chưa đẩy');
    cancelScheduledPush();
    pushChanges({ silent: true });
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
    console.log('[Sync] 🟢 Có mạng lại — đẩy nốt', _pendingChanges, 'doc');
    if (typeof toast === 'function') toast('🟢 Có mạng lại — đang đồng bộ...', 'info');
    _pushRetryIdx = 0;
    schedulePush();
  }
});
