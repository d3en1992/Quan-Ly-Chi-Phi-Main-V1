// core.storage.js — Storage layer: defaults, Dexie/IDB, load/save, pending sync counter, record helpers, autocomplete
// Load order: 1 (nạp trước TẤT CẢ file khác)
// Kiến trúc: classic script, global scope — KHÔNG dùng import/export


// ══════════════════════════════
//  DATA DEFAULTS & CATEGORIES
// ══════════════════════════════
const DEFAULTS = {
  congTrinh: ["CÔNG TY - NHÀ","SC CT CÔ NHUNG - 191 THÀNH CÔNG, Q TÂN PHÚ","CT BỬU AN - 85/5 LÊ LAI, P12, Q TÂN BÌNH","CT A DŨNG - SUỐI CÁT, ĐỒNG NAI","CT BÁC CHỮ - 23/51A NGUYỄN HỮU TIẾN, Q TÂN PHÚ","CT BÁC ĐỆ - MỸ HẠNH NAM, ĐỨC HÒA, LONG AN","SC QUẬN 9","SC MINH CHÍNH - Q GÒ VẤP","SC CT LONG HẢI - VŨNG TÀU"],
  loaiChiPhi: ["Nhân Công","Thầu Phụ","Vật Liệu XD","Sắt Thép","Vật Tư Điện Nước","Đổ Bê Tông","Copha - VTP - Máy","Hóa Đơn Lẻ","Quyết Toán - Phát Sinh","Thiết Kế / Xin Phép","Chi Phí Khác"],
  nhaCungCap: ["Công ty VLXD Minh Phát","Cửa Hàng Sắt Thép Hùng","Điện Nước Phú Thịnh","Hóa Đơn Điện Lực"],
  nguoiTH: ["A Long","A Toán","A Dũng","Duy Sáng","HD Lẻ","Tình"],
  tbTen: ['Máy cắt cầm tay','Máy cắt bàn','Máy uốn sắt lớn','Bàn uốn sắt',
          'Thước nhôm','Chân Dàn 1.7m','Chân Dàn 1.5m',
          'Chéo lớn','Chéo nhỏ','Kít tăng giàn giáo','Cây chống tăng']
};

const CATS = [
  { id:'congTrinh',  title:'<span class="material-symbols-outlined msi-gap">construction</span>Công Trình',           sk:'cat_ct',     refField:'congtrinh' },
  { id:'loaiChiPhi', title:'<span class="material-symbols-outlined msi-gap">folder_open</span>Loại Chi Phí',          sk:'cat_loai',   refField:'loai' },
  { id:'nhaCungCap', title:'<span class="material-symbols-outlined msi-gap">storefront</span>Nhà Cung Cấp',          sk:'cat_ncc',    refField:'ncc' },
  { id:'nguoiTH',    title:'<span class="material-symbols-outlined msi-gap">engineering</span>Người Thực Hiện',       sk:'cat_nguoi',  refField:'nguoi' },
  { id:'thauPhu',    title:'<span class="material-symbols-outlined msi-gap">handshake</span>Thầu Phụ / TP',         sk:'cat_tp',     refField:'tp' },
  { id:'congNhan',   title:'<span class="material-symbols-outlined msi-gap">engineering</span>Công Nhân',              sk:'cat_cn',     refField:null },
  { id:'tbTen',      title:'<span class="material-symbols-outlined msi-gap">handyman</span>Máy / Thiết Bị Thi Công', sk:'cat_tbteb', refField:null }
];


// ══════════════════════════════════════════════════════════
//  FIREBASE CONFIG
// ══════════════════════════════════════════════════════════

// ── Cấu hình Firebase (điền vào sau khi tạo project) ──────
const FB_CONFIG = {
  apiKey:    '',           // Web API Key từ Project Settings
  projectId: '',           // Project ID từ Project Settings
};
const FS_BASE = () =>
  `https://firestore.googleapis.com/v1/projects/${FB_CONFIG.projectId}/databases/(default)/documents/cpct_data`;

// ── Keys localStorage ──────────────────────────────────────
const FB_CFG_KEY = 'fb_config';    // lưu apiKey + projectId

function _loadLS(k) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; }
}
function _saveLS(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

// ── Load config từ localStorage ───────────────────────────
(function() {
  const saved = _loadLS(FB_CFG_KEY);
  if (saved) { FB_CONFIG.apiKey = saved.apiKey||''; FB_CONFIG.projectId = saved.projectId||''; }
})();


// ══════════════════════════════════════════════════════════════
// [MODULE: INDEXEDDB — Dexie offline-first layer]
// ══════════════════════════════════════════════════════════════

const db = new Dexie('qlct');
db.version(1).stores({
  invoices:   'id, updatedAt',
  attendance: 'id, updatedAt',
  equipment:  'id, updatedAt',
  ung:        'id, updatedAt',
  revenue:    'id, updatedAt',
  categories: 'id'
});
db.version(2).stores({
  settings: 'id'  // key-value store: projects, hopdong, thauphu, trash, cat_*, etc.
});
// Version 3 — thêm bảng OUTBOX (hàng chờ đẩy cloud, sống sót qua F5/tắt app).
// Dexie tự GIỮ NGUYÊN mọi bảng khai báo ở version 1–2 (invoices, attendance,
// equipment, ung, revenue, categories, settings) — chỉ cần khai báo bảng mới.
// Mỗi dòng outbox = 1 document cloud đang "bẩn" (có thay đổi local chưa đẩy lên):
//   { docId, firstTs, lastTs, count, purgeIds: string[] }
db.version(3).stores({
  outbox: 'docId'
});

// Mapping: storage key → IDB table config
// Tất cả data nghiệp vụ đều nằm trong IDB — localStorage CHỈ cho config/device identity
const DB_KEY_MAP = {
  // ── Array tables (cloud-synced) ──────────────────────────────
  'inv_v3':       { table: 'invoices',   isArr: true  },
  'cc_v2':        { table: 'attendance', isArr: true  },
  'tb_v1':        { table: 'equipment',  isArr: true  },
  'ung_v1':       { table: 'ung',        isArr: true  },
  'thu_v1':       { table: 'revenue',    isArr: true  },
  // ── Category objects (categories table) ──────────────────────
  'cat_ct':       { table: 'categories', isArr: false, rowId: 'congTrinh'  },
  'cat_loai':     { table: 'categories', isArr: false, rowId: 'loaiChiPhi' },
  'cat_ncc':      { table: 'categories', isArr: false, rowId: 'nhaCungCap' },
  'cat_nguoi':    { table: 'categories', isArr: false, rowId: 'nguoiTH'    },
  'cat_tp':       { table: 'categories', isArr: false, rowId: 'thauPhu'    },
  'cat_cn':       { table: 'categories', isArr: false, rowId: 'congNhan'   },
  'cat_tbteb':    { table: 'categories', isArr: false, rowId: 'tbTen'      },
  // ── Settings objects (settings table) ────────────────────────
  'projects_v1':  { table: 'settings',   isArr: false, rowId: 'projects'    },
  'customers_v1': { table: 'settings',   isArr: false, rowId: 'customers'   }, // Chủ đầu tư (CRM) — mảng khách hàng lưu blob trong settings
  'quyettoan_v1': { table: 'settings',   isArr: false, rowId: 'quyettoan'   }, // Quyết toán chi phí — mảng lưu blob trong settings (giống customers_v1)
  'hopdong_v1':   { table: 'settings',   isArr: false, rowId: 'hopdong'     },
  'thauphu_v1':   { table: 'settings',   isArr: false, rowId: 'thauphu'     },
  'trash_v1':     { table: 'settings',   isArr: false, rowId: 'trash'       },
  'users_v1':     { table: 'settings',   isArr: false, rowId: 'users'       },
  'cat_ct_years': { table: 'settings',   isArr: false, rowId: 'cat_ct_years'},
  'cat_cn_roles': { table: 'settings',   isArr: false, rowId: 'cat_cn_roles'},
  'cat_items_v1': { table: 'settings',   isArr: false, rowId: 'catItems'     },
};

// ── In-memory runtime cache — nguồn đọc duy nhất sau khi dbInit() chạy xong ──
const _mem = {};

// Internal write: cập nhật _mem + IDB — KHÔNG trigger cloud sync.
// Dùng cho dữ liệu đến từ cloud (pull/merge) và chuẩn hóa nội bộ (migration, dựng lại
// danh mục...) → KHÔNG phải thay đổi của người dùng → chỉ cập nhật "bảng bóng" (_shadow)
// cho khớp, KHÔNG đánh dấu outbox.
function _memSet(k, v) {
  _mem[k] = v;
  _dbSave(k, v).catch(e => console.warn('[IDB] _memSet lỗi:', k, e));
  if (typeof _shadowSet === 'function') _shadowSet(k, v);
}

// Dedup array by id — keep record with highest updatedAt per id.
// Used after import and after sync to prevent phantom duplicates.
function dedupById(arr) {
  if (!Array.isArray(arr) || !arr.length) return arr || [];
  const map = new Map();
  arr.forEach(r => {
    const k = String(r.id ?? '');
    if (!k) return;
    const ex = map.get(k);
    if (!ex || (r.updatedAt || 0) >= (ex.updatedAt || 0)) map.set(k, r);
  });
  return [...map.values()];
}

// Merge two arrays by id, keeping the record with the latest updatedAt
function mergeUnique(oldArr, newArr) {
  const map = new Map();
  (oldArr || []).forEach(r => map.set(r.id, r));
  (newArr || []).forEach(r => {
    const existing = map.get(r.id);
    if (!existing || (r.updatedAt || 0) > (existing.updatedAt || 0)) {
      map.set(r.id, r);
    }
  });
  return [...map.values()];
}

// Write one localStorage key to IndexedDB (background, no throw).
// IMPORTANT: also deletes IDB records that are no longer in the array —
// this is what propagates delete operations to IndexedDB.
async function _dbSave(k, v) {
  const cfg = DB_KEY_MAP[k];
  if (!cfg) return;
  const now = Date.now();
  if (cfg.isArr) {
    const records = (Array.isArray(v) ? v : []).map(r => {
      if (!r.id) r.id = crypto.randomUUID();
      if (!r.updatedAt) r.updatedAt = now;
      return r;
    });
    const newIdSet = new Set(records.map(r => r.id));
    // Find IDB records that were removed from the array and delete them
    const existing = await db[cfg.table].toArray();
    const toDelete = existing.filter(r => !newIdSet.has(r.id)).map(r => r.id);
    if (toDelete.length) await db[cfg.table].bulkDelete(toDelete);
    if (records.length) await db[cfg.table].bulkPut(records);
  } else {
    await db[cfg.table].put({ id: cfg.rowId, data: v, updatedAt: now });
  }
}

// Async preflight: đọc toàn bộ data từ IDB vào _mem.
// IDB là nguồn sự thật duy nhất — không đọc/ghi localStorage cho data nghiệp vụ.
async function dbInit() {
  try {
    for (const [key, cfg] of Object.entries(DB_KEY_MAP)) {
      if (cfg.isArr) {
        _mem[key] = await db[cfg.table].toArray();
      } else {
        const rec = await db[cfg.table].get(cfg.rowId);
        _mem[key] = rec ? rec.data : null;
      }
    }
    // Nạp hàng chờ outbox vào RAM (_outboxMem) để các hàm khác đọc ĐỒNG BỘ được
    await _outboxLoad();
    // Dựng "bảng bóng" từ dữ liệu vừa nạp — mốc để save() so sánh cái gì thật sự đổi
    _shadowRebuildAll();
    _outboxOnChange();
    console.log('[IDB] dbInit hoàn tất — IDB-primary mode');
  } catch(e) {
    console.warn('[IDB] dbInit lỗi:', e);
  }
}


// ══ PENDING CHANGES COUNTER ════════════════════════════════
// ⚠️ Từ GĐ1 (gia cố đồng bộ): 3 biến dưới đây KHÔNG còn tự đếm nữa mà được SUY RA
// từ outbox (lưu bền trong IDB) qua _outboxOnChange(). Giữ lại tên cũ để code cũ
// (badge, main.js, mobile.core.js...) không vỡ:
//   _pendingChanges = số document cloud đang chờ đẩy (số dòng outbox)
//   _dirtyKeys      = các key local thuộc những doc đó
//   _dirtyYears     = các năm có doc năm đang chờ đẩy

let _pendingChanges = 0;
const _dirtyKeys = new Set();
const _dirtyYears = new Set();

// Mapping key → field chứa ngày của từng loại dữ liệu (để trích năm)
const _YEAR_DATE_FIELD = {
  inv_v3: 'ngay',
  ung_v1: 'ngay',
  cc_v2: 'fromDate',
  tb_v1: 'ngay',
  thu_v1: 'ngay'
};

// Timestamp cho đến khi pull bị chặn (set sau reset để tránh cloud hồi dữ liệu)
let _blockPullUntil = 0;

// Key lưu thời điểm sync thành công cuối cùng (ms timestamp)
const LAST_SYNC_KEY = 'lastSyncAt';

// Keys kích hoạt pending counter — gồm cả cat để xóa danh mục không bị sống lại sau pull
const _SYNC_DATA_KEYS = new Set([
  'inv_v3','cc_v2','ung_v1','tb_v1','thu_v1',
  'thauphu_v1','hopdong_v1','quyettoan_v1','projects_v1','customers_v1','trash_v1','users_v1',
  // Cat string-array keys: pending guard tránh pull ghi đè danh mục đã xóa local
  'cat_ct','cat_loai','cat_ncc','cat_nguoi','cat_tp','cat_cn','cat_tbteb',
  // Roles & years: cần pending guard giống cat arrays
  'cat_cn_roles',  // vai trò công nhân — save() từ updateCNRole() và rebuildCCCategories()
  'cat_ct_years',  // năm theo công trình — save() từ saveCats('congTrinh')
  // cat_items_v1: source of truth per-item — cần pending khi canonicalize tên để push cloud
  'cat_items_v1',
]);

// ══ BẢNG ÁNH XẠ key local → document cloud (dùng chung toàn app) ══════════
// Key theo NĂM → hậu tố doc năm: doc thật = `y{YYYY}_{hậu tố}` (khớp _YEAR_CATS
// trong core.cloud-cats-ui.js). Trường ngày để biết record thuộc năm nào: _YEAR_DATE_FIELD.
const _YEAR_KEY_CAT = {
  inv_v3: 'hoa_don',
  ung_v1: 'tien_ung',
  cc_v2:  'cham_cong',
  tb_v1:  'thiet_bi',
  thu_v1: 'thu_tien',
};
// Key META → doc meta dùng chung (khớp các payload fbMeta*Payload()).
// ⚠️ 'trash_v1' CỐ Ý KHÔNG có ở đây: không payload cloud nào chứa trash_v1
// (thùng rác thật đọc từ deletedAt của các store chính) → trash_v1 chỉ là dữ liệu local.
const _META_KEY_DOC = {
  projects_v1:  'meta_cong_trinh',
  cat_ct:       'meta_cong_trinh',   // cat_ct suy ra từ projects → đẩy cùng doc công trình
  customers_v1: 'meta_khach_hang',
  cat_loai:     'meta_danh_muc',
  cat_ncc:      'meta_danh_muc',
  cat_nguoi:    'meta_danh_muc',
  cat_tp:       'meta_danh_muc',
  cat_cn:       'meta_danh_muc',
  cat_tbteb:    'meta_danh_muc',
  cat_items_v1: 'meta_danh_muc',
  cat_cn_roles: 'meta_danh_muc',
  cat_ct_years: 'meta_danh_muc',
  users_v1:     'meta_tai_khoan',
  hopdong_v1:   'meta_hop_dong',
  thauphu_v1:   'meta_hop_dong',
  quyettoan_v1: 'meta_hop_dong',
};
// Key có thuộc nhóm meta không (thay cho _META_TRIGGER_KEYS cục bộ cũ trong pushChanges)
function _isMetaKey(k) { return Object.prototype.hasOwnProperty.call(_META_KEY_DOC, k); }
// Tên doc năm của 1 key theo năm, vd ('inv_v3', 2025) → 'y2025_hoa_don' (null nếu không phải key năm)
function _yearDocId(k, yr) {
  const cat = _YEAR_KEY_CAT[k];
  return (cat && yr) ? `y${yr}_${cat}` : null;
}


// ══ OUTBOX — hàng chờ đẩy cloud LƯU BỀN trong IndexedDB ═══════════════════
// Vấn đề cũ: bộ đếm _pendingChanges/_dirtyKeys/_dirtyYears chỉ nằm trong RAM →
// lưu lúc mạng yếu rồi tắt app là mất dấu → mở lại pull REPLACE đè mất dữ liệu.
// Outbox ghi xuống IDB từng document cloud đang "bẩn", nên dù F5/tắt máy vẫn biết
// còn gì chưa đẩy. _outboxMem là bản sao trong RAM để đọc đồng bộ (nạp ở dbInit()).
let _outboxMem = new Map();          // docId → { docId, firstTs, lastTs, count, purgeIds }
let _outboxQueue = Promise.resolve(); // hàng đợi tuần tự cho MỌI lần ghi IDB outbox
let _outboxLastTs = 0;               // mốc thời gian lớn nhất đã cấp (đồng hồ tăng dần)

// Đồng hồ TĂNG NGHIÊM NGẶT: 2 lần gọi liên tiếp không bao giờ trả cùng giá trị,
// kể cả trong cùng 1 mili-giây. Nhờ vậy so sánh "sửa TRƯỚC hay SAU lúc bắt đầu push"
// (lastTs <= pushStartTs) luôn chính xác, không bị trùng mốc.
function _outboxNow() {
  _outboxLastTs = Math.max(Date.now(), _outboxLastTs + 1);
  return _outboxLastTs;
}

// Xếp 1 thao tác ghi IDB vào hàng đợi — các lần ghi chạy LẦN LƯỢT, không đua nhau
// (tránh trường hợp lệnh xóa chạy xong trước lệnh ghi cũ → dòng outbox sống lại).
function _outboxEnqueue(fn) {
  _outboxQueue = _outboxQueue
    .then(fn)
    .catch(e => console.warn('[Outbox] Ghi IDB lỗi:', e));
  return _outboxQueue;
}

// Ghi bản RAM hiện tại của 1 docId xuống IDB (có dòng → put, không có → delete)
function _outboxPersist(docId) {
  return _outboxEnqueue(() => {
    const row = _outboxMem.get(docId);
    if (!db.outbox) return;
    return row ? db.outbox.put({ ...row, purgeIds: [...(row.purgeIds || [])] })
               : db.outbox.delete(docId);
  });
}

// Đánh dấu 1 document cloud là "bẩn" (còn thay đổi local chưa đẩy).
// purgeIds (tùy chọn): các id bị XÓA CỨNG khỏi mảng local — khi push phải loại
// hẳn chúng khỏi bản gộp với cloud, nếu không bước gộp sẽ kéo chúng "hồi sinh".
// opts.overwrite = true: doc do KHÔI PHỤC (import JSON / sao lưu cloud) đánh dấu →
//   khi đẩy thì GHI ĐÈ (không gộp cloud cũ vào), khi pull thì giữ nguyên local.
//   Cờ này giữ đến khi doc được đẩy thành công.
function _outboxMark(docId, purgeIds, opts) {
  if (!docId) return;
  const now  = _outboxNow();
  const prev = _outboxMem.get(docId);
  const row  = prev
    ? { ...prev, purgeIds: [...(prev.purgeIds || [])] }
    : { docId, firstTs: now, lastTs: now, count: 0, purgeIds: [] };
  row.lastTs = now;
  row.count  = (row.count || 0) + 1;
  if (opts && opts.overwrite) row.overwrite = true;
  if (Array.isArray(purgeIds) && purgeIds.length) {
    const set = new Set(row.purgeIds);
    purgeIds.forEach(id => { if (id != null && id !== '') set.add(String(id)); });
    row.purgeIds = [...set];
  }
  _outboxMem.set(docId, row);
  _outboxPersist(docId);
  if (typeof _outboxOnChange === 'function') _outboxOnChange();
}

// Gỡ 1 doc khỏi outbox SAU KHI đã đẩy thành công.
//   beforeTs      : mốc bắt đầu push (lấy bằng _outboxNow()). Chỉ gỡ hẳn nếu doc
//                   KHÔNG bị sửa thêm sau mốc đó (lastTs <= beforeTs). Nếu bị sửa
//                   thêm trong lúc push → giữ lại để lần sau đẩy tiếp.
//   pushedPurgeIds: các purgeId ĐÃ được đẩy trong lần push này → bỏ khỏi dòng
//                   (purgeId mới phát sinh trong lúc push vẫn được giữ).
function _outboxClear(docId, beforeTs, pushedPurgeIds) {
  const row = _outboxMem.get(docId);
  if (!row) return;
  if (row.lastTs <= beforeTs) {
    _outboxMem.delete(docId);
  } else if (Array.isArray(pushedPurgeIds) && pushedPurgeIds.length) {
    const done = new Set(pushedPurgeIds.map(String));
    _outboxMem.set(docId, { ...row, purgeIds: (row.purgeIds || []).filter(id => !done.has(String(id))) });
  } else {
    return; // không có gì thay đổi
  }
  _outboxPersist(docId);
  if (typeof _outboxOnChange === 'function') _outboxOnChange();
}

// Xóa SẠCH outbox (dùng khi reset toàn bộ / khôi phục — cố ý ghi đè cloud)
function _outboxClearAll() {
  _outboxMem.clear();
  _outboxEnqueue(() => db.outbox ? db.outbox.clear() : null);
  if (typeof _outboxOnChange === 'function') _outboxOnChange();
}

// Danh sách doc đang bẩn (bản sao, sắp theo lúc bẩn đầu tiên)
function _outboxList() {
  return [..._outboxMem.values()]
    .map(r => ({ ...r, purgeIds: [...(r.purgeIds || [])] }))
    .sort((a, b) => (a.firstTs || 0) - (b.firstTs || 0));
}
function _outboxHas(docId) { return _outboxMem.has(docId); }
function _outboxGet(docId) {
  const r = _outboxMem.get(docId);
  return r ? { ...r, purgeIds: [...(r.purgeIds || [])] } : null;
}
function _outboxSize() { return _outboxMem.size; }

// Nạp outbox từ IDB vào RAM — gọi trong dbInit()
async function _outboxLoad() {
  try {
    const rows = db.outbox ? await db.outbox.toArray() : [];
    _outboxMem = new Map(rows.map(r => [r.docId, { ...r, purgeIds: r.purgeIds || [] }]));
    rows.forEach(r => { if ((r.lastTs || 0) > _outboxLastTs) _outboxLastTs = r.lastTs; });
    if (rows.length) console.log('[Outbox] Còn', rows.length, 'doc chưa đẩy từ phiên trước:', rows.map(r => r.docId).join(', '));
  } catch (e) {
    console.warn('[Outbox] Nạp lỗi:', e);
    _outboxMem = new Map();
  }
}

// Gọi mỗi khi outbox đổi → tính lại 3 biến tương thích + vẽ lại badge nút Sync
function _outboxOnChange() {
  _pendingChanges = _outboxMem.size;
  _dirtyKeys.clear();
  _dirtyYears.clear();
  for (const docId of _outboxMem.keys()) {
    const m = /^y(\d{4})_(.+)$/.exec(docId);
    if (m) {
      _dirtyYears.add(m[1]);
      for (const k in _YEAR_KEY_CAT) if (_YEAR_KEY_CAT[k] === m[2]) _dirtyKeys.add(k);
    } else {
      for (const k in _META_KEY_DOC) if (_META_KEY_DOC[k] === docId) _dirtyKeys.add(k);
    }
  }
  _updateSyncBtnBadge();
}

// [Tương thích] Trước đây tăng bộ đếm RAM. Nay bộ đếm suy ra từ outbox → chỉ vẽ lại.
function _incPending() { _outboxOnChange(); }

// [Tương thích — KHÔNG còn xóa gì] Trước đây xóa sạch bộ đếm RAM (sau push/lúc khởi
// động) — chính là nguyên nhân mất dấu dữ liệu chưa đẩy. Nay outbox chỉ được gỡ
// từng doc khi đẩy THÀNH CÔNG (_outboxClear) hoặc khi reset/khôi phục (_outboxClearAll).
function _resetPending() { _outboxOnChange(); }

function _updateSyncBtnBadge() {
  const btn = document.getElementById('sync-btn');
  if (!btn) return;
  if (_pendingChanges > 0) {
    btn.textContent = `☁️ ${_pendingChanges}`;
    btn.title = `${_pendingChanges} mục dữ liệu chưa đồng bộ lên cloud — nhấn để sync ngay`;
    btn.dataset.state = 'pending';
  } else {
    const lastTs = parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0');
    if (lastTs > 0) {
      const hhmm = new Date(lastTs).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      btn.textContent = `✅ ${hhmm}`;
      btn.title = `Đã đồng bộ lúc ${hhmm} — nhấn để sync ngay`;
      btn.dataset.state = 'synced';
    } else {
      btn.innerHTML = '<span class="material-symbols-outlined msi-gap">cloud</span>';
      btn.title = 'Đồng bộ dữ liệu';
      btn.dataset.state = '';
    }
  }
}


// ══════════════════════════════════════════════════════════════
//  LOAD / SAVE — write path chuẩn
// ══════════════════════════════════════════════════════════════

function load(k, def) {
  // Đọc từ _mem (đã được dbInit() populate từ IDB).
  // Trả về def nếu key chưa có (trước dbInit hoặc chưa lưu lần nào).
  const v = _mem[k];
  return (v !== undefined && v !== null) ? v : def;
}

// Keys khi thay đổi sẽ làm invoice cache (buildInvoices) stale
const _INV_CACHE_KEYS = new Set(['inv_v3','cc_v2','projects_v1','hopdong_v1','thauphu_v1','cat_items_v1']);

// Mỗi logical key → "kind" để stampCatIds gắn *Id (id danh mục) vào record trước khi lưu.
// id là nguồn sự thật; text chỉ là cache hiển thị/tự lành. Đổi tên danh mục → chỉ sửa master item.
const _CAT_STAMP_KIND = {
  inv_v3: 'inv', ung_v1: 'ung', cc_v2: 'cc', tb_v1: 'tb',
  thu_v1: 'thu', thauphu_v1: 'thauphu', hopdong_v1: 'hopdong',
};

// ══ BẢNG BÓNG (_shadow) — phát hiện CHÍNH XÁC cái gì vừa đổi ══════════════
// ⚠️ BẪY: code hay sửa mảng TẠI CHỖ rồi save cùng mảng đó (vd invoices.push(x);
// save('inv_v3', invoices)) → _mem[k] cũ và v mới là CÙNG 1 object, không so được.
// Nên giữ 1 bản "chữ ký" riêng của lần lưu trước:
//   • Key theo năm (inv_v3, cc_v2, ...): Map(id → { sig, doc })
//       sig = updatedAt|deletedAt  (record không có updatedAt → dùng JSON rút gọn)
//       doc = doc năm mà record thuộc về (theo trường ngay/fromDate), vd 'y2025_hoa_don'
//     ⇒ Mọi sửa đổi nghiệp vụ PHẢI cập nhật updatedAt (mkRecord/mkUpdate/softDeleteRecord)
//       — sửa tại chỗ không đổi updatedAt coi như "chuẩn hóa nội bộ", không đẩy cloud.
//   • Các key còn lại (meta, danh mục, hợp đồng...): chuỗi JSON của lần lưu trước.
// Bảng bóng được dựng ở dbInit() và cập nhật (không đánh dấu) mỗi khi _memSet chạy
// (dữ liệu từ cloud / chuẩn hóa nội bộ không phải thay đổi của người dùng).
const _shadow = {};

// Chữ ký 1 record theo năm
function _recSig(r) {
  if (r.updatedAt) return `${r.updatedAt}|${r.deletedAt || ''}`;
  let s = '';
  try { s = JSON.stringify(r); } catch { s = String(Math.random()); }
  return `j${s.length}|${s.slice(0, 200)}|${s.slice(-200)}`;
}
// Doc năm của 1 record (null nếu record chưa có ngày → không thuộc doc nào)
function _recYearDoc(k, r) {
  const f = _YEAR_DATE_FIELD[k];
  const d = r && (r[f] || (k === 'cc_v2' ? r.from : null));
  return (d && String(d).length >= 4) ? _yearDocId(k, String(d).slice(0, 4)) : null;
}
// Dựng bóng cho 1 key (không đánh dấu gì)
function _shadowBuild(k, v) {
  if (_YEAR_KEY_CAT[k]) {
    const m = new Map();
    (Array.isArray(v) ? v : []).forEach(r => {
      if (!r || r.id == null) return;
      m.set(String(r.id), { sig: _recSig(r), doc: _recYearDoc(k, r) });
    });
    return m;
  }
  // null / undefined / [] / {} đều coi là "rỗng" như nhau — tránh báo "có thay đổi"
  // khi key chưa từng lưu (null) được lưu lần đầu bằng giá trị mặc định rỗng.
  if (v == null) return '∅';
  if (Array.isArray(v) && !v.length) return '∅';
  if (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) return '∅';
  try { return JSON.stringify(v); } catch { return ''; }
}
function _shadowSet(k, v) {
  if (!_SYNC_DATA_KEYS.has(k)) return;
  _shadow[k] = _shadowBuild(k, v);
}
function _shadowRebuildAll() {
  _SYNC_DATA_KEYS.forEach(k => { _shadow[k] = _shadowBuild(k, _mem[k]); });
}

// So v (giá trị vừa lưu) với bảng bóng → đánh dấu outbox đúng các doc bị ảnh hưởng.
// purge (tùy chọn): danh sách id (hoặc key hợp đồng với hopdong_v1) mà người gọi
//   CỐ Ý XÓA CỨNG khỏi mảng → ghi vào purgeIds để lúc push/gộp cloud không hồi sinh.
//   ⚠️ Id biến mất khỏi mảng mà KHÔNG nằm trong purge → CHỈ đánh dấu doc bẩn, KHÔNG
//   purge. Lý do an toàn: mảng global có thể bị cũ (chưa nạp lại sau khi gộp cloud)
//   → nếu tự suy ra "xóa cứng" sẽ xóa nhầm dữ liệu máy khác trên cloud. Không purge
//   thì lần push sau bước gộp cloud tự trả record về (tự lành, như hành vi cũ).
// Trả về số doc vừa đánh dấu.
function _shadowDiffMark(k, v, purge) {
  const purgeSet = new Set((purge || []).map(String));
  const marks = new Map(); // docId → Set(purgeIds)
  const mark = (doc, pid) => {
    if (!doc) return;
    if (!marks.has(doc)) marks.set(doc, new Set());
    if (pid != null) marks.get(doc).add(pid);
  };

  if (_YEAR_KEY_CAT[k]) {
    const prev = _shadow[k] instanceof Map ? _shadow[k] : new Map();
    const next = _shadowBuild(k, v);
    next.forEach((cur, id) => {
      const p = prev.get(id);
      if (!p) { mark(cur.doc); return; }                    // record mới
      if (p.sig !== cur.sig || p.doc !== cur.doc) {
        mark(cur.doc);                                      // record bị sửa
        if (p.doc && p.doc !== cur.doc) mark(p.doc);        // đổi ngày sang năm khác → doc năm cũ cũng bẩn
      }
    });
    prev.forEach((p, id) => {
      if (next.has(id)) return;                             // id biến mất khỏi mảng
      mark(p.doc, purgeSet.has(id) ? id : null);
    });
    _shadow[k] = next;
  } else {
    const doc  = _META_KEY_DOC[k];
    const next = _shadowBuild(k, v);
    if (doc && next !== _shadow[k]) mark(doc);
    if (doc) purgeSet.forEach(id => mark(doc, `${k}:${id}`)); // meta: purgeId dạng "key:id"
    _shadow[k] = next;
  }

  marks.forEach((pids, doc) => _outboxMark(doc, [...pids]));
  return marks.size;
}

// opts.skipSync = true → ghi local (IDB + _mem) nhưng KHÔNG đánh dấu outbox, KHÔNG lên lịch push
//   Dùng cho cập nhật nội bộ như heartbeat session (lastActive) — không phải thay đổi nghiệp vụ
// opts.purge = [id...] → các id (hopdong_v1: key) người gọi CỐ Ý XÓA CỨNG khỏi mảng
//   (thùng rác xóa vĩnh viễn, xóa theo công trình...) — xem _shadowDiffMark()
function save(k, v, opts) {
  if (typeof stampCatIds === 'function' && _CAT_STAMP_KIND[k] && v) {
    const kind = _CAT_STAMP_KIND[k];
    if (Array.isArray(v)) v.forEach(r => r && typeof r === 'object' && stampCatIds(r, kind));
    else Object.values(v).forEach(r => r && typeof r === 'object' && stampCatIds(r, kind));
  }
  _mem[k] = v;
  // Lưu ý: phần đồng bộ của _dbSave (gán id/updatedAt cho record thiếu) chạy NGAY
  // tại đây, trước khi so bảng bóng bên dưới → record mới luôn có id để so.
  _dbSave(k, v).catch(e => console.warn('[IDB] save lỗi:', k, e));
  if (_INV_CACHE_KEYS.has(k) && typeof clearInvoiceCache === 'function') clearInvoiceCache();
  if (!_SYNC_DATA_KEYS.has(k)) return;
  if (opts?.skipSync) { _shadowSet(k, v); return; }

  // So với bảng bóng → đánh dấu outbox (lưu bền IDB) đúng các doc cloud bị ảnh hưởng.
  // Không có gì đổi thật (vd migration chạy lại) → không đánh dấu, badge không nhảy.
  const n = _shadowDiffMark(k, v, opts?.purge);
  if (!n) return;

  // Online 100%: cố đẩy cloud gần như tức thì. Nếu mất mạng → vẫn lưu local + outbox
  // (không mất), nhắc user là chưa đẩy được (tránh ngộ nhận đã đồng bộ).
  if (!navigator.onLine) _warnOfflineSave();
  if (typeof schedulePush === 'function') schedulePush();
}

// Nhắc "mất mạng" tối đa 1 lần / 10s để khỏi spam
let _lastOfflineWarnTs = 0;
function _warnOfflineSave() {
  if (Date.now() - _lastOfflineWarnTs < 10_000) return;
  _lastOfflineWarnTs = Date.now();
  if (typeof toast === 'function') toast('🔴 Mất mạng — thay đổi sẽ được đẩy lên khi có mạng lại', 'error');
}


// ══ RECORD FACTORY — chuẩn hóa đường ghi ══════════════════
// Dùng trong tất cả module khi tạo/cập nhật record nghiệp vụ.
// Đảm bảo id, createdAt, updatedAt, deletedAt, deviceId luôn đúng chuẩn.

/**
 * Tạo record mới với metadata đầy đủ.
 * @param {Object} fields  Các field nghiệp vụ (ngay, congtrinh, projectId, ...)
 * @returns {Object}       Record hoàn chỉnh sẵn sàng push vào mảng và save()
 */
function mkRecord(fields) {
  const now = Date.now();
  const devId = (typeof DEVICE_ID !== 'undefined') ? DEVICE_ID : '';
  return {
    id:        crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deviceId:  devId,
    ...fields,
  };
}

/**
 * Tạo bản cập nhật record hiện có — bảo toàn id + createdAt, ghi mới updatedAt + deviceId.
 * @param {Object} existing  Record gốc
 * @param {Object} changes   Các field cần thay đổi
 * @returns {Object}         Record đã cập nhật
 */
function mkUpdate(existing, changes) {
  const devId = (typeof DEVICE_ID !== 'undefined') ? DEVICE_ID : '';
  return {
    ...existing,
    ...changes,
    id:        existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
    deviceId:  devId,
  };
}

// Tạo nội dung (nd) từ items[] — dedup tên, dùng chung toàn app
function buildNDFromItems(items) {
  if (!items || !items.length) return '';
  const seen = new Set();
  const unique = [];
  items.forEach(it => {
    const t = (it.ten || '').trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (!seen.has(key)) { seen.add(key); unique.push(t); }
  });
  return unique.join(', ');
}

// softDeleteRecord() định nghĩa trong sync.js (load sau core.storage.js)


// ══ AUTOCOMPLETE DÙNG CHUNG ════════════════════════════════
/** Chuẩn hóa chuỗi tiếng Việt để so sánh contains.
 *  Dùng chung normalizeKey() từ danhmuc.js khi đã load; fallback nếu chưa. */
function _normViStr(s) {
  return typeof normalizeKey === 'function'
    ? normalizeKey(s)
    : (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

let _acCurrentInput = null;
/** Ẩn dropdown autocomplete đang mở. */
function _acHide() {
  const dd = document.getElementById('_global-ac');
  if (dd) dd.style.display = 'none';
  _acCurrentInput = null;
}
/**
 * Hiện dropdown autocomplete gần inp, lọc theo contains không dấu.
 * @param {HTMLInputElement} inp - input đang focus
 * @param {string[]} options - danh sách gợi ý
 * @param {function} onSelect - callback(value) khi chọn
 */
function _acShow(inp, options, onSelect) {
  let dd = document.getElementById('_global-ac');
  if (!dd) {
    dd = document.createElement('div');
    dd.id = '_global-ac';
    dd.style.cssText = [
      'position:fixed;z-index:9999',
      'background:var(--paper,#fff)',
      'border:1.5px solid var(--line2,#d1cfc9)',
      'border-radius:8px',
      'box-shadow:0 4px 16px rgba(0,0,0,.14)',
      'max-height:220px;overflow-y:auto;display:none'
    ].join(';');
    document.body.appendChild(dd);
    // Đóng dropdown khi click ra ngoài (dùng capture để bắt trước focus)
    document.addEventListener('mousedown', e => {
      if (!e.target.closest('#_global-ac')) _acHide();
    }, true);
  }
  const q = _normViStr(inp.value);
  const filtered = options.filter(o => _normViStr(o).includes(q)).slice(0, 40);
  if (!filtered.length) { _acHide(); return; }
  dd.innerHTML = filtered.map(o =>
    `<div class="_ac-item" style="padding:6px 12px;cursor:pointer;font-size:13px;white-space:nowrap;border-bottom:1px solid var(--line,#e8e6e0)">${x(o)}</div>`
  ).join('');
  dd.querySelectorAll('._ac-item').forEach((el, i) => {
    el.addEventListener('mousedown', e => { e.preventDefault(); onSelect(filtered[i]); _acHide(); });
  });
  const r = inp.getBoundingClientRect();
  dd.style.left = r.left + 'px';
  dd.style.top  = (r.bottom + 2) + 'px';
  dd.style.minWidth = Math.max(180, r.width) + 'px';
  dd.style.display = 'block';
  _acCurrentInput = inp;
}
