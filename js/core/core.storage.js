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
  { id:'congTrinh',  title:'🏗️ Công Trình',           sk:'cat_ct',     refField:'congtrinh' },
  { id:'loaiChiPhi', title:'📂 Loại Chi Phí',          sk:'cat_loai',   refField:'loai' },
  { id:'nhaCungCap', title:'🏪 Nhà Cung Cấp',          sk:'cat_ncc',    refField:'ncc' },
  { id:'nguoiTH',    title:'👷 Người Thực Hiện',       sk:'cat_nguoi',  refField:'nguoi' },
  { id:'thauPhu',    title:'🤝 Thầu Phụ / TP',         sk:'cat_tp',     refField:'tp' },
  { id:'congNhan',   title:'🪖 Công Nhân',              sk:'cat_cn',     refField:null },
  { id:'tbTen',      title:'🛠 Máy / Thiết Bị Thi Công', sk:'cat_tbteb', refField:null }
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

// Internal write: cập nhật _mem + IDB — KHÔNG trigger cloud sync
function _memSet(k, v) {
  _mem[k] = v;
  _dbSave(k, v).catch(e => console.warn('[IDB] _memSet lỗi:', k, e));
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
    console.log('[IDB] dbInit hoàn tất — IDB-primary mode');
  } catch(e) {
    console.warn('[IDB] dbInit lỗi:', e);
  }
}


// ══ PENDING CHANGES COUNTER ════════════════════════════════
// Đặt gần save() để tránh temporal dependency khi save() được gọi.
// Đếm số lần save() thực sự thay đổi data kể từ lần push cuối.
// Hiện trên nút 🔄 Sync để user biết còn bao nhiêu thay đổi chưa cloud.

let _pendingChanges = 0;

// Tập các key đã thay đổi kể từ lần push cuối — để push ngầm chỉ đẩy đúng
// doc bị ảnh hưởng (tiết kiệm read/write), thay vì đẩy lại toàn bộ.
const _dirtyKeys = new Set();

// Tập các năm thực sự bị sửa (dựa trên updatedAt của bản ghi vừa nhập).
// Dùng để push ngầm gộp thêm năm cũ ngoài activeYear, tránh bỏ sót dữ liệu năm khác.
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
  'thauphu_v1','hopdong_v1','projects_v1','customers_v1','trash_v1','users_v1',
  // Cat string-array keys: pending guard tránh pull ghi đè danh mục đã xóa local
  'cat_ct','cat_loai','cat_ncc','cat_nguoi','cat_tp','cat_cn','cat_tbteb',
  // Roles & years: cần pending guard giống cat arrays
  'cat_cn_roles',  // vai trò công nhân — save() từ updateCNRole() và rebuildCCCategories()
  'cat_ct_years',  // năm theo công trình — save() từ saveCats('congTrinh')
  // cat_items_v1: source of truth per-item — cần pending khi canonicalize tên để push cloud
  'cat_items_v1',
]);

function _incPending() {
  _pendingChanges++;
  _updateSyncBtnBadge();
}

// Gọi sau push thành công, hoặc sau startup để reset bộ đếm
function _resetPending() {
  _pendingChanges = 0;
  _dirtyKeys.clear();
  _dirtyYears.clear();
  _updateSyncBtnBadge();
}

function _updateSyncBtnBadge() {
  const btn = document.getElementById('sync-btn');
  if (!btn) return;
  if (_pendingChanges > 0) {
    btn.textContent = `☁️ ${_pendingChanges}`;
    btn.title = `${_pendingChanges} thay đổi chưa đồng bộ — nhấn để sync ngay`;
    btn.dataset.state = 'pending';
  } else {
    const lastTs = parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0');
    if (lastTs > 0) {
      const hhmm = new Date(lastTs).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      btn.textContent = `✅ ${hhmm}`;
      btn.title = `Đã đồng bộ lúc ${hhmm} — nhấn để sync ngay`;
      btn.dataset.state = 'synced';
    } else {
      btn.textContent = '☁️';
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

// opts.skipSync = true → ghi local (IDB + _mem) nhưng KHÔNG tăng pending và KHÔNG lên lịch push
// Dùng cho cập nhật nội bộ như heartbeat session (lastActive) — không phải thay đổi nghiệp vụ
function save(k, v, opts) {
  if (typeof stampCatIds === 'function' && _CAT_STAMP_KIND[k] && v) {
    const kind = _CAT_STAMP_KIND[k];
    if (Array.isArray(v)) v.forEach(r => r && typeof r === 'object' && stampCatIds(r, kind));
    else Object.values(v).forEach(r => r && typeof r === 'object' && stampCatIds(r, kind));
  }
  _mem[k] = v;
  _dbSave(k, v).catch(e => console.warn('[IDB] save lỗi:', k, e));
  if (_INV_CACHE_KEYS.has(k) && typeof clearInvoiceCache === 'function') clearInvoiceCache();
  if (!opts?.skipSync && _SYNC_DATA_KEYS.has(k)) {
    _incPending();
    _dirtyKeys.add(k); // ghi nhớ key này đã đổi → push ngầm chỉ đẩy doc liên quan

    // Ghi nhận các năm thực sự bị sửa (để push ngầm không bỏ sót dữ liệu năm cũ)
    // Chỉ quét record có updatedAt mới trong vài giây gần đây (vừa từ mkRecord/mkUpdate)
    const _yf = _YEAR_DATE_FIELD[k];
    if (_yf && Array.isArray(v)) {
      const now = Date.now();
      v.forEach(r => {
        const ts = (r && (r.updatedAt || r.createdAt)) || 0;
        if (now - ts <= 5000) {
          const d = r && r[_yf];
          if (d && String(d).length >= 4) _dirtyYears.add(String(d).slice(0, 4));
        }
      });
    }

    // Online 100%: cố đẩy cloud gần như tức thì. Nếu mất mạng → vẫn lưu local
    // nhưng nhắc user là chưa đẩy được (tránh ngộ nhận đã đồng bộ).
    if (!navigator.onLine) _warnOfflineSave();
    if (typeof schedulePush === 'function') schedulePush();
  }
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
