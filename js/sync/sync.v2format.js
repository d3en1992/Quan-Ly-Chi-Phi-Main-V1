// sync.v2format.js — Firestore V2 Format Helpers
// Load order: 31 — sau toàn bộ domain modules, TRƯỚC sync.js
// Kiến trúc: classic script, global scope — KHÔNG dùng import/export
//
// MỤC ĐÍCH:
//   Tạo Firestore documents dễ đọc trên console với 2 lớp:
//   1. Summary fields (tên tiếng Việt, typed): hiện ngay trên Firestore Panel
//   2. data field (JSON không nén, full field names): đọc được khi inspect
//
// NGUYÊN TẮC TƯƠNG THÍCH:
//   - V2 documents có ID KHÁC V1 (y2026_hoa_don vs y2026)
//   - Push V2 THÊM documents mới, KHÔNG xóa V1
//   - Pull V2: thử V2 trước, không có → fallback V1
//   - Không import/export, không side effect khi file load
//
// CẤU TRÚC FIRESTORE SAU KHI ÁP DỤNG:
//   meta_cong_trinh  | meta_tai_khoan | meta_danh_muc | meta_hop_dong
//   y20xx_hoa_don    | y20xx_cham_cong | y20xx_tien_ung | y20xx_thiet_bi | y20xx_thu_tien
//   (legacy) cats, y20xx  — giữ nguyên, không xóa

'use strict';

// ══════════════════════════════════════════════════════════════
// [1] HẰNG SỐ — loại documents
// ══════════════════════════════════════════════════════════════

const _V2_YEAR_TYPES = ['hoa_don', 'cham_cong', 'tien_ung', 'thiet_bi', 'thu_tien'];
const _V2_META_TYPES = ['cong_trinh', 'tai_khoan', 'danh_muc', 'hop_dong'];

// Map: loại V2 → logical key trong _mem / Dexie
const _V2_YEAR_KEY_MAP = {
  hoa_don:   'inv_v3',
  cham_cong: 'cc_v2',
  tien_ung:  'ung_v1',
  thiet_bi:  'tb_v1',
  thu_tien:  'thu_v1',
};


// ══════════════════════════════════════════════════════════════
// [2] DOCUMENT ID HELPERS
// ══════════════════════════════════════════════════════════════

// "y2026_hoa_don", "y2025_cham_cong", ...
function _v2DocYearId(type, yr) { return `y${yr}_${type}`; }

// "meta_cong_trinh", "meta_tai_khoan", ...
function _v2DocMetaId(type)     { return `meta_${type}`; }


// ══════════════════════════════════════════════════════════════
// [3] FORMATTER HELPERS — hiển thị thân thiện
// ══════════════════════════════════════════════════════════════

// 892500000 → "892,500,000 đ"
function _v2FmtMoney(n) {
  if (!n || isNaN(n)) return '0 đ';
  return Math.round(n).toLocaleString('vi-VN') + ' đ';
}

// timestamp ms → "22/05/2026 14:35"
function _v2FmtDateTime(ts) {
  const d    = new Date(ts || Date.now());
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh   = String(d.getHours()).padStart(2, '0');
  const mi   = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

// Gom tên công trình từ mảng records → "CT A · CT B · CT C ... (+N)"
function _v2FmtCtList(records, ctField) {
  const field = ctField || 'congtrinh';
  const ctSet = new Set();
  (records || []).forEach(r => {
    let ct = '';
    // Ưu tiên resolveProjectName (đã load trước sync.v2format.js)
    if (typeof resolveProjectName === 'function') ct = resolveProjectName(r) || '';
    if (!ct) ct = r[field] || r.ct || r.congtrinh || '';
    ct = ct.trim();
    if (ct && ct !== '(Không rõ CT)') ctSet.add(ct);
  });
  const arr = [...ctSet].filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi'));
  if (!arr.length) return '(Chưa có dữ liệu)';
  if (arr.length <= 6) return arr.join(' · ');
  return arr.slice(0, 6).join(' · ') + ` ... (+${arr.length - 6} công trình)`;
}

// Label tiếng Việt cho từng loại document
function _v2TypeLabel(type) {
  const map = {
    hoa_don:    'Hóa Đơn / Chi Phí',
    cham_cong:  'Chấm Công',
    tien_ung:   'Tiền Ứng',
    thiet_bi:   'Thiết Bị',
    thu_tien:   'Thu Tiền',
    cong_trinh: 'Danh Sách Công Trình',
    tai_khoan:  'Tài Khoản Người Dùng',
    danh_muc:   'Danh Mục',
    hop_dong:   'Hợp Đồng',
  };
  return map[type] || type;
}

// Label vai trò người dùng
function _v2RoleLabel(role) {
  return { admin: 'Quản trị', giamdoc: 'Giám đốc', ketoan: 'Kế toán' }[role] || role || '?';
}


// ══════════════════════════════════════════════════════════════
// [4] FIRESTORE COMPAT HELPERS (legacy — dùng bởi section [8] pull)
// ══════════════════════════════════════════════════════════════
// fsWrapV2 và _v2FsSetRaw đã bị xóa (thay bởi subcollection approach).
// _v2Unwrap + _v2ReadSummary giữ lại cho _v2PullYearType / _v2PullMetaType
// và sẽ được cập nhật ở Prompt 3.

// Unwrap V2 document → trả về parsed data (Array | Object | null)
function _v2Unwrap(doc) {
  if (!doc || !doc.fields || !doc.fields.data) return null;
  try { return JSON.parse(doc.fields.data.stringValue); } catch { return null; }
}

// Đọc 1 summary field từ document đã unwrap raw (không qua fsUnwrap)
function _v2ReadSummary(doc, fieldName) {
  if (!doc || !doc.fields || !doc.fields[fieldName]) return null;
  const fv = doc.fields[fieldName];
  return fv.integerValue !== undefined
    ? parseInt(fv.integerValue)
    : (fv.stringValue !== undefined ? fv.stringValue : null);
}


// ══════════════════════════════════════════════════════════════
// [4b] FIRESTORE TYPED VALUE CONVERTER
// ══════════════════════════════════════════════════════════════
// Chuyển đổi JS value → Firestore REST typed field value
// Hỗ trợ: string, number (int/float), boolean, null, Array, Object (nested)

function _v2ToFsValue(v) {
  if (v === null || v === undefined) return { nullValue: 'NULL_VALUE' };
  if (typeof v === 'boolean')        return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v)
      ? { integerValue: String(v) }
      : { doubleValue: v };
  }
  if (typeof v === 'string')         return { stringValue: v };
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(_v2ToFsValue) } };
  }
  if (typeof v === 'object') {
    return { mapValue: { fields: _v2ToFsFields(v) } };
  }
  return { stringValue: String(v) };
}

// Chuyển toàn bộ JS object → Firestore fields map { key: fsTypedValue }
function _v2ToFsFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj || {})) {
    fields[k] = _v2ToFsValue(v);
  }
  return fields;
}

// Áp field map lên 1 record: đổi tên key + loại bỏ key không có trong map
// fieldMap = { localKey: 'firestore_ten_field', ... }
// excludeKeys = ['password', ...] — field nhạy cảm không ghi lên cloud
function _v2ApplyFieldMap(record, fieldMap, excludeKeys) {
  const exclude = new Set(excludeKeys || []);
  const result  = {};
  for (const [localKey, fsKey] of Object.entries(fieldMap)) {
    if (exclude.has(localKey)) continue;
    if (localKey in record) result[fsKey] = record[localKey];
  }
  return result;
}


// ══════════════════════════════════════════════════════════════
// [4c] FIELD MAPS — tên field tiếng Việt cho từng loại dữ liệu
// ══════════════════════════════════════════════════════════════
// Key   = tên field trong _mem (JS object)
// Value = tên field trên Firestore (snake_case tiếng Việt không dấu)
// Field không có trong map sẽ KHÔNG được ghi lên Firestore

const _V2_FIELD_MAPS = {

  // ── Hóa Đơn / Chi Phí ──────────────────────────────────────
  hoa_don: {
    id:         'id',
    ngay:       'ngay',
    congtrinh:  'cong_trinh',
    projectId:  'project_id',
    loai:       'loai_chi_phi',
    ncc:        'nha_cung_cap',
    nguoi:      'nguoi_thuc_hien',
    nd:         'noi_dung',
    tien:       'don_gia',
    sl:         'so_luong',
    thanhtien:  'thanh_tien',
    items:      'chi_tiet_vat_tu',
    source:     'nguon',
    deletedAt:  'da_xoa_luc',
    updatedAt:  'cap_nhat_luc',
    deviceId:   'thiet_bi_id',
  },

  // ── Chấm Công ──────────────────────────────────────────────
  cham_cong: {
    id:         'id',
    fromDate:   'tu_ngay',
    toDate:     'den_ngay',
    ct:         'cong_trinh',
    projectId:  'project_id',
    workers:    'cong_nhan',   // array of maps — ghi nguyên cấu trúc
    deletedAt:  'da_xoa_luc',
    updatedAt:  'cap_nhat_luc',
    deviceId:   'thiet_bi_id',
  },

  // ── Tiền Ứng ───────────────────────────────────────────────
  tien_ung: {
    id:         'id',
    ngay:       'ngay',
    loai:       'loai_ung',
    tp:         'ten_tp_hoac_ncc',
    congtrinh:  'cong_trinh',
    projectId:  'project_id',
    tien:       'so_tien',
    nd:         'noi_dung',
    deletedAt:  'da_xoa_luc',
    updatedAt:  'cap_nhat_luc',
    deviceId:   'thiet_bi_id',
  },

  // ── Thiết Bị ───────────────────────────────────────────────
  thiet_bi: {
    id:         'id',
    ngay:       'ngay',
    ten:        'ten_thiet_bi',
    ct:         'cong_trinh',
    projectId:  'project_id',
    soluong:    'so_luong',
    tinhtrang:  'tinh_trang',
    nguoi:      'nguoi_quan_ly',
    ghichu:     'ghi_chu',
    deletedAt:  'da_xoa_luc',
    updatedAt:  'cap_nhat_luc',
    deviceId:   'thiet_bi_id',
  },

  // ── Thu Tiền ───────────────────────────────────────────────
  thu_tien: {
    id:         'id',
    ngay:       'ngay',
    congtrinh:  'cong_trinh',
    projectId:  'project_id',
    tien:       'so_tien',
    nguoi:      'nguoi_thu',
    nd:         'noi_dung',
    deletedAt:  'da_xoa_luc',
    updatedAt:  'cap_nhat_luc',
    deviceId:   'thiet_bi_id',
  },

  // ── Công Trình ─────────────────────────────────────────────
  cong_trinh: {
    id:          'id',
    name:        'ten',
    type:        'loai',
    status:      'trang_thai',
    startDate:   'ngay_bat_dau',
    endDate:     'ngay_ket_thuc',
    closedDate:  'ngay_dong',
    note:        'ghi_chu',
    createdYear: 'nam_tao',
    deletedAt:   'da_xoa_luc',
    updatedAt:   'cap_nhat_luc',
  },

  // ── Tài Khoản ──────────────────────────────────────────────
  // password KHÔNG có trong map → sẽ không bao giờ ghi lên Firestore
  tai_khoan: {
    id:        'id',
    username:  'ten_dang_nhap',
    role:      'vai_tro',
    deletedAt: 'da_xoa_luc',
    updatedAt: 'cap_nhat_luc',
  },

};

// Tên subcollection chứa các record con (dùng thống nhất cho mọi document type)
const _V2_SUBCOLL_NAME = 'ban_ghi';


// ══════════════════════════════════════════════════════════════
// [4e] HUMAN-READABLE DOCUMENT ID HELPERS
// ══════════════════════════════════════════════════════════════

// Chuyển text tiếng Việt → slug ASCII ngắn (dùng trong document ID)
// VD: "Công Trình A-Huỳnh" → "cong-trinh-a-huynh"
function _v2Slug(s, maxLen) {
  if (!s) return 'x';
  const viMap = {
    'à':'a','á':'a','ạ':'a','ả':'a','ã':'a','â':'a','ầ':'a','ấ':'a','ậ':'a','ẩ':'a','ẫ':'a',
    'ă':'a','ằ':'a','ắ':'a','ặ':'a','ẳ':'a','ẵ':'a',
    'è':'e','é':'e','ẹ':'e','ẻ':'e','ẽ':'e','ê':'e','ề':'e','ế':'e','ệ':'e','ể':'e','ễ':'e',
    'ì':'i','í':'i','ị':'i','ỉ':'i','ĩ':'i',
    'ò':'o','ó':'o','ọ':'o','ỏ':'o','õ':'o','ô':'o','ồ':'o','ố':'o','ộ':'o','ổ':'o','ỗ':'o',
    'ơ':'o','ờ':'o','ớ':'o','ợ':'o','ở':'o','ỡ':'o',
    'ù':'u','ú':'u','ụ':'u','ủ':'u','ũ':'u','ư':'u','ừ':'u','ứ':'u','ự':'u','ử':'u','ữ':'u',
    'ỳ':'y','ý':'y','ỵ':'y','ỷ':'y','ỹ':'y','đ':'d',
  };
  return String(s).toLowerCase()
    .replace(/./g, c => viMap[c] || c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen || 20);
}

// Định dạng số tiền ngắn gọn cho document ID
// VD: 892500000 → "892tr", 1500000000 → "1ty5", 500000 → "500k", 0 → "0"
function _v2FmtMoneyShort(n) {
  const v = Math.round(Number(n) || 0);
  if (v === 0) return '0';
  if (v >= 1_000_000_000) {
    const ty = v / 1_000_000_000;
    return ty % 1 === 0 ? `${ty}ty` : `${ty.toFixed(1).replace('.', 'ty')}`;
  }
  if (v >= 1_000_000) {
    const tr = v / 1_000_000;
    return tr % 1 === 0 ? `${tr}tr` : `${Math.round(tr)}tr`;
  }
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(v);
}

// Tạo document ID dễ đọc cho từng loại record
// Định dạng: {ngay}_{slug}_{tien}_{uid6}  hoặc  {slug}_{uid6} (không có ngày/tiền)
// uid6 = 6 ký tự đầu của UUID (bỏ dấu -) → đảm bảo unique khi 2 records giống nhau
function _v2MakeDocId(type, rec) {
  const uid6 = ((rec.id || rec._key || '') + '').replace(/-/g, '').slice(0, 6) || 'xxxxxx';
  const ngay = (rec.ngay || rec.fromDate || rec.startDate || '').slice(0, 10); // YYYY-MM-DD

  let parts;
  switch (type) {
    case 'hoa_don':
      parts = [ngay, _v2Slug(rec.congtrinh || '', 14), _v2FmtMoneyShort(rec.thanhtien || rec.tien), uid6];
      break;
    case 'cham_cong':
      parts = [ngay, _v2Slug(rec.ct || '', 14), uid6];
      break;
    case 'tien_ung':
      parts = [ngay, _v2Slug(rec.tp || '', 14), _v2FmtMoneyShort(rec.tien), uid6];
      break;
    case 'thiet_bi':
      parts = [ngay, _v2Slug(rec.ten || '', 14), uid6];
      break;
    case 'thu_tien':
      parts = [ngay, _v2Slug(rec.congtrinh || '', 14), _v2FmtMoneyShort(rec.tien), uid6];
      break;
    case 'cong_trinh':
      parts = [_v2Slug(rec.name || '', 18), uid6];
      break;
    case 'tai_khoan':
      parts = [_v2Slug(rec.username || '', 18), uid6];
      break;
    default:
      parts = [type, uid6];
  }

  return parts.filter(p => p && p !== '0').join('_');
}


// ══════════════════════════════════════════════════════════════
// [4d] FIRESTORE REST HELPERS — Subcollection
// ══════════════════════════════════════════════════════════════
// Phụ thuộc: FS_BASE() và FB_CONFIG từ core.storage.js (load ở vị trí 4)
// Không gọi hàm nào ở top-level — chỉ định nghĩa

// Trích resource path từ FS_BASE() để dùng trong batchWrite document names
// FS_BASE() = "https://firestore.../v1/projects/xxx/databases/(default)/documents/cpct_data"
// Trả về: "projects/xxx/databases/(default)/documents/cpct_data"
function _v2ResourceBase() {
  const match = FS_BASE().match(/\/v1\/(.+)/);
  if (!match) throw new Error('[V2Format] Không parse được FS_BASE: ' + FS_BASE());
  return match[1];
}

// PATCH 1 document ở bất kỳ path nào trong cpct_data
// docPath = "y2025_hoa_don" hoặc "y2025_hoa_don/ban_ghi/uuid1"
function _v2FsPatchDoc(docPath, firestoreFields) {
  return fetch(`${FS_BASE()}/${docPath}?key=${FB_CONFIG.apiKey}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields: firestoreFields }),
  }).then(r => r.json());
}

// GET danh sách document IDs trong 1 subcollection (tối đa 500)
// Trả về string[] (chỉ phần id cuối path) — [] nếu rỗng / chưa tồn tại
async function _v2FsListIds(parentDocId, collName) {
  try {
    const url = `${FS_BASE()}/${parentDocId}/${collName}?key=${FB_CONFIG.apiKey}&pageSize=500`;
    const res = await fetch(url).then(r => r.json());
    if (!res || res.error || !res.documents) return [];
    return res.documents.map(d => d.name.split('/').pop());
  } catch (e) {
    console.warn(`[V2Format] _v2FsListIds lỗi (${parentDocId}/${collName}):`, e.message || e);
    return [];
  }
}

// Ghi/xóa nhiều documents bằng PATCH/DELETE song song (thay thế batchWrite)
// writes = Array of:
//   { op: 'update', path: 'y2025_hoa_don/ban_ghi/docId', fields: { fsField: fsValue } }
//   { op: 'delete', path: 'y2025_hoa_don/ban_ghi/docId' }
// Chạy tối đa CONCURRENCY requests đồng thời để tránh rate limit
// Trả về { totalOk, totalFail }
async function _v2FsBatchWrite(writes) {
  if (!writes || writes.length === 0) return { totalOk: 0, totalFail: 0 };

  const BASE        = FS_BASE();   // kết thúc bằng /cpct_data
  const KEY         = FB_CONFIG.apiKey;
  const CONCURRENCY = 20;          // số requests song song tối đa
  let totalOk = 0, totalFail = 0;

  for (let i = 0; i < writes.length; i += CONCURRENCY) {
    const chunk = writes.slice(i, i + CONCURRENCY);

    const results = await Promise.all(chunk.map(async w => {
      const url = `${BASE}/${w.path}?key=${KEY}`;
      try {
        if (w.op === 'delete') {
          const res = await fetch(url, { method: 'DELETE' }).then(r => r.json());
          if (res && res.error) return { ok: false, err: res.error.message };
          return { ok: true };
        } else {
          const res = await fetch(url, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ fields: w.fields }),
          }).then(r => r.json());
          if (res && res.error) return { ok: false, err: res.error.message };
          return { ok: true };
        }
      } catch (e) {
        return { ok: false, err: e.message || e };
      }
    }));

    results.forEach(r => {
      if (r.ok) totalOk++;
      else {
        totalFail++;
        console.warn('[V2Format] write lỗi:', r.err);
      }
    });
  }

  return { totalOk, totalFail };
}


// ══════════════════════════════════════════════════════════════
// [5] YEAR PAYLOAD BUILDERS
// ══════════════════════════════════════════════════════════════
// Trả về { dataPayload: Array, summaryObj: Object }
// dataPayload = mảng records KHÔNG NÉN (full field names = format của _mem)
// summaryObj  = các field tóm tắt hiện trên Firestore console

function _v2YearPayload(type, yr) {
  const ys  = String(yr);
  const now = Date.now();
  let records     = [];
  let summaryExtra = {};

  switch (type) {

    // ── Hóa Đơn / Chi Phí ──────────────────────────────────
    case 'hoa_don': {
      records = load('inv_v3', []).filter(r => r.ngay && r.ngay.startsWith(ys));
      const active = records.filter(r => !r.deletedAt);
      const total  = active.reduce((s, r) => s + (r.thanhtien || r.tien || 0), 0);
      summaryExtra = {
        so_ban_ghi : active.length,
        da_xoa     : records.length - active.length,
        tong_tien  : _v2FmtMoney(total),
        cong_trinh : _v2FmtCtList(active),
      };
      break;
    }

    // ── Chấm Công ──────────────────────────────────────────
    case 'cham_cong': {
      records = load('cc_v2', []).filter(r => r.fromDate && r.fromDate.startsWith(ys));
      const active = records.filter(r => !r.deletedAt);
      // Tổng lương sơ bộ = Σ(worker.luong × tổng ngày công trong tuần)
      const tongLuong = active.reduce((s, r) =>
        s + (r.workers || []).reduce((ws, w) => {
          const days = (w.d || []).reduce((a, b) => a + (b || 0), 0);
          return ws + (w.luong || 0) * days;
        }, 0)
      , 0);
      summaryExtra = {
        so_tuan    : active.length,
        da_xoa     : records.length - active.length,
        tong_luong : _v2FmtMoney(tongLuong),
        cong_trinh : _v2FmtCtList(active, 'ct'),
      };
      break;
    }

    // ── Tiền Ứng ───────────────────────────────────────────
    case 'tien_ung': {
      records = load('ung_v1', []).filter(r => r.ngay && r.ngay.startsWith(ys));
      const active  = records.filter(r => !r.deletedAt);
      const total   = active.reduce((s, r) => s + (r.tien || 0), 0);
      let ungTP = 0, ungNCC = 0;
      active.forEach(r => {
        if (r.loai === 'thauphu')    ungTP  += (r.tien || 0);
        if (r.loai === 'nhacungcap') ungNCC += (r.tien || 0);
      });
      summaryExtra = {
        so_ban_ghi   : active.length,
        da_xoa       : records.length - active.length,
        tong_tien    : _v2FmtMoney(total),
        ung_thau_phu : _v2FmtMoney(ungTP),
        ung_nha_cc   : _v2FmtMoney(ungNCC),
        cong_trinh   : _v2FmtCtList(active),
      };
      break;
    }

    // ── Thiết Bị ───────────────────────────────────────────
    case 'thiet_bi': {
      records = load('tb_v1', []).filter(r => r.ngay && r.ngay.startsWith(ys));
      const active = records.filter(r => !r.deletedAt);
      summaryExtra = {
        so_thiet_bi : active.length,
        da_xoa      : records.length - active.length,
        cong_trinh  : _v2FmtCtList(active, 'ct'),
      };
      break;
    }

    // ── Thu Tiền ───────────────────────────────────────────
    case 'thu_tien': {
      records = load('thu_v1', []).filter(r => r.ngay && r.ngay.startsWith(ys));
      const active = records.filter(r => !r.deletedAt);
      const total  = active.reduce((s, r) => s + (r.tien || 0), 0);
      summaryExtra = {
        so_dot     : active.length,
        da_xoa     : records.length - active.length,
        tong_thu   : _v2FmtMoney(total),
        cong_trinh : _v2FmtCtList(active),
      };
      break;
    }

    default:
      console.warn('[V2Format] _v2YearPayload — loại không xác định:', type);
  }

  const summaryObj = {
    loai_du_lieu : _v2TypeLabel(type),
    nam          : parseInt(yr),
    cap_nhat     : _v2FmtDateTime(now),
    ...summaryExtra,
  };

  return { dataPayload: records, summaryObj };
}


// ══════════════════════════════════════════════════════════════
// [6] META PAYLOAD BUILDERS
// ══════════════════════════════════════════════════════════════
// Trả về { dataPayload: Object|Array, summaryObj: Object }

function _v2MetaPayload(type) {
  const now = Date.now();
  let dataPayload  = null;
  let summaryExtra = {};

  switch (type) {

    // ── Công Trình ─────────────────────────────────────────
    case 'cong_trinh': {
      const allProj = load('projects_v1', []);
      const active  = allProj.filter(p => !p.deletedAt && p.id !== 'COMPANY');
      const byStatus = { active: 0, completed: 0, closed: 0, planning: 0 };
      active.forEach(p => {
        const s = p.status || 'planning';
        if (byStatus[s] !== undefined) byStatus[s]++;
        else byStatus.planning++;
      });
      const names = active
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'))
        .map(p => p.name)
        .filter(Boolean);
      dataPayload  = allProj;
      summaryExtra = {
        tong_so            : active.length,
        dang_thi_cong      : byStatus.active,
        da_hoan_thanh      : byStatus.completed,
        da_dong            : byStatus.closed,
        dang_lap_ke_hoach  : byStatus.planning,
        ten_cong_trinh     : names.length <= 8
          ? names.join(' · ')
          : names.slice(0, 8).join(' · ') + ` ... (+${names.length - 8})`,
      };
      break;
    }

    // ── Tài Khoản ──────────────────────────────────────────
    case 'tai_khoan': {
      const users  = load('users_v1', []);
      const active = users.filter(u => !u.deletedAt);
      // Không đưa password vào summary — chỉ list username + role
      const list = active.map(u => `${u.username} (${_v2RoleLabel(u.role)})`).join(' · ');
      dataPayload  = users;
      summaryExtra = {
        so_tai_khoan : active.length,
        danh_sach    : list || '(Chưa có tài khoản)',
      };
      break;
    }

    // ── Danh Mục ───────────────────────────────────────────
    case 'danh_muc': {
      const catItems = load('cat_items_v1', {});
      const cnRoles  = load('cat_cn_roles', {});
      const ctYears  = load('cat_ct_years', {});
      const labelMap = {
        loai:  'Loại Chi Phí',
        ncc:   'Nhà Cung Cấp',
        nguoi: 'Người Thực Hiện',
        tp:    'Thầu Phụ',
        cn:    'Công Nhân',
        tbteb: 'Thiết Bị',
      };
      let tongItem = 0;
      const parts  = [];
      for (const [t, items] of Object.entries(catItems)) {
        const cnt = (items || []).filter(i => !i.isDeleted).length;
        tongItem += cnt;
        parts.push(`${labelMap[t] || t}: ${cnt}`);
      }
      dataPayload  = { catItems, cnRoles, ctYears };
      summaryExtra = {
        tong_muc_danh_muc : tongItem,
        chi_tiet          : parts.join(' · ') || '(Chưa có)',
        vai_tro_cong_nhan : Object.keys(cnRoles).length + ' công nhân có vai trò',
        // cn_roles + ct_years lưu trên parent doc → _v2PullDanhMuc đọc lại được
        cn_roles          : cnRoles,
        ct_years          : ctYears,
      };
      break;
    }

    // ── Hợp Đồng ───────────────────────────────────────────
    case 'hop_dong': {
      const hopDong    = load('hopdong_v1', {});
      const thauPhu    = load('thauphu_v1', []);
      const hdcActive  = Object.values(hopDong).filter(h => !h.deletedAt);
      const hdtpActive = thauPhu.filter(h => !h.deletedAt);
      const totalHdc   = hdcActive.reduce((s, h) =>
        s + (h.giaTri || 0) + (h.giaTriphu || 0) + (h.phatSinh || 0), 0);
      const totalHdtp  = hdtpActive.reduce((s, h) =>
        s + (h.giaTri || 0) + (h.phatSinh || 0), 0);
      dataPayload  = { hopDong, thauPhu };
      summaryExtra = {
        hop_dong_chinh      : hdcActive.length,
        hop_dong_thau_phu   : hdtpActive.length,
        tong_gia_tri_hdc    : _v2FmtMoney(totalHdc),
        tong_gia_tri_hdtp   : _v2FmtMoney(totalHdtp),
        tong_gia_tri_tat_ca : _v2FmtMoney(totalHdc + totalHdtp),
      };
      break;
    }

    default:
      console.warn('[V2Format] _v2MetaPayload — loại không xác định:', type);
  }

  const summaryObj = {
    loai_du_lieu : _v2TypeLabel(type),
    cap_nhat     : _v2FmtDateTime(now),
    ...summaryExtra,
  };

  return { dataPayload, summaryObj };
}


// ══════════════════════════════════════════════════════════════
// [7] PUSH HELPERS — subcollection + incremental strategy
// ══════════════════════════════════════════════════════════════
//
// Chiến lược Incremental Push (bảo vệ free tier Spark 20K writes/day):
//   • Mỗi docId lưu timestamp lastPush trong localStorage
//   • Lần đầu (lastPush = 0): full write tất cả records không bị xóa
//   • Lần sau: chỉ ghi records có updatedAt > lastPush
//              chỉ xóa records có deletedAt > lastPush
//   → Giảm từ ~500 xuống ~20-50 writes/sync sau lần đầu
//
// Cấu trúc Firestore sau push:
//   cpct_data/
//   └── y2025_hoa_don  (document — summary fields)
//       └── ban_ghi/   (subcollection)
//           ├── 2026-01-25_ct-a-huynh_892tr_9a7744  →  { ngay, cong_trinh, ... }
//           └── 2026-02-10_vt-sat-thep_15tr_f3c211  →  { ... }

const _V2_LAST_PUSH_KEY    = '_v2SubcollLastPush';
const _V2_ID_SCHEMA_VER    = 2;          // Tăng số này khi đổi format document ID
const _V2_SCHEMA_VER_KEY   = '_v2IdSchemaVer';

// Kiểm tra & tự động reset lastPush nếu schema ID đã đổi version
// (Chạy 1 lần khi load file — reset buộc full rewrite để dọn UUID cũ)
(function _v2MigrateIdSchema() {
  try {
    const stored = Number(localStorage.getItem(_V2_SCHEMA_VER_KEY) || 0);
    if (stored < _V2_ID_SCHEMA_VER) {
      localStorage.removeItem(_V2_LAST_PUSH_KEY);
      localStorage.setItem(_V2_SCHEMA_VER_KEY, String(_V2_ID_SCHEMA_VER));
      console.log(`[V2Format] 🔄 ID schema nâng lên v${_V2_ID_SCHEMA_VER} — reset lastPush để dọn ID cũ`);
    }
  } catch {}
})();

// Đọc timestamp V2 push cuối cho 1 docId (0 = chưa push lần nào / full rewrite)
function _v2GetLastPush(docId) {
  try {
    const map = JSON.parse(localStorage.getItem(_V2_LAST_PUSH_KEY) || '{}');
    return Number(map[docId] || 0);
  } catch { return 0; }
}

// Lưu timestamp push thành công
function _v2SetLastPush(docId, ts) {
  try {
    const map = JSON.parse(localStorage.getItem(_V2_LAST_PUSH_KEY) || '{}');
    map[docId] = ts;
    localStorage.setItem(_V2_LAST_PUSH_KEY, JSON.stringify(map));
  } catch (e) { console.warn('[V2Format] _v2SetLastPush lỗi:', e.message); }
}

// Reset 1 docId → buộc full rewrite lần push tiếp theo
function _v2ResetLastPush(docId) { _v2SetLastPush(docId, 0); }

// Reset toàn bộ cache → dùng sau khi reset/xóa dữ liệu
function _v2ResetAllLastPush() {
  try { localStorage.removeItem(_V2_LAST_PUSH_KEY); } catch {}
}


// ──────────────────────────────────────────────────────────────
// Core: ghi summary + incremental subcollection records
// records có id + deletedAt/updatedAt chuẩn (năm data và cong_trinh, tai_khoan)
// idFn (tuỳ chọn): hàm rec → docId  (mặc định: rec => rec.id)
//   Truyền vào rec => _v2MakeDocId(type, rec) để tạo ID dễ đọc
// ──────────────────────────────────────────────────────────────
async function _v2PushSubcoll(parentDocId, records, fieldMap, summaryObj, idFn) {
  const getId   = typeof idFn === 'function' ? idFn : rec => rec.id;
  const lastPush = _v2GetLastPush(parentDocId);
  const now      = Date.now();
  const coll     = _V2_SUBCOLL_NAME;

  // 1. Ghi summary lên parent document
  try {
    const res = await _v2FsPatchDoc(parentDocId, _v2ToFsFields(summaryObj));
    if (res && res.error) {
      console.warn(`[V2Format] ✗ ${parentDocId} summary lỗi:`, res.error.message);
      return { ok: false };
    }
  } catch (e) {
    console.warn(`[V2Format] ✗ ${parentDocId} summary exception:`, e.message || e);
    return { ok: false };
  }

  // 2. Build batch writes
  const writes = [];

  if (lastPush === 0) {
    // Full write: lấy IDs cũ → xóa orphan (dọn UUID cũ khi đổi schema ID) → ghi mới
    const existingIds = await _v2FsListIds(parentDocId, coll);
    const activeRecs  = records.filter(r => !r.deletedAt);
    const newIds      = new Set(activeRecs.map(getId).filter(Boolean));
    existingIds.forEach(oldId => {
      if (!newIds.has(oldId))
        writes.push({ op: 'delete', path: `${parentDocId}/${coll}/${oldId}` });
    });
    activeRecs.forEach(rec => {
      const docId = getId(rec);
      if (!docId) return;
      writes.push({
        op:     'update',
        path:   `${parentDocId}/${coll}/${docId}`,
        fields: _v2ToFsFields(_v2ApplyFieldMap(rec, fieldMap)),
      });
    });
  } else {
    // Incremental: chỉ records thay đổi sau lastPush
    records.forEach(rec => {
      const tUpdated = rec.updatedAt || rec.createdAt || 0;
      const tDeleted = rec.deletedAt || 0;
      if (tDeleted && tDeleted > lastPush) {
        // Bị xóa sau lần push cuối → xóa document con
        writes.push({ op: 'delete', path: `${parentDocId}/${coll}/${getId(rec)}` });
      } else if (!tDeleted && tUpdated > lastPush) {
        // Mới tạo hoặc đã sửa → ghi/overwrite
        const docId = getId(rec);
        if (!docId) return;
        writes.push({
          op:     'update',
          path:   `${parentDocId}/${coll}/${docId}`,
          fields: _v2ToFsFields(_v2ApplyFieldMap(rec, fieldMap)),
        });
      }
    });
  }

  // 3. Thực hiện batch write
  if (writes.length === 0) {
    const nActive = records.filter(r => !r.deletedAt).length;
    console.log(`[V2Format] ▲ ${parentDocId} — không đổi (${nActive} records hiện có)`);
    _v2SetLastPush(parentDocId, now);
    return { ok: true, written: 0, deleted: 0 };
  }

  const nWrite  = writes.filter(w => w.op === 'update').length;
  const nDelete = writes.filter(w => w.op === 'delete').length;
  const { totalOk, totalFail } = await _v2FsBatchWrite(writes);
  const ok = totalFail === 0;

  if (ok) {
    _v2SetLastPush(parentDocId, now);
    console.log(`[V2Format] ▲ ${parentDocId} OK — ✏${nWrite} ghi, 🗑${nDelete} xóa`);
  } else {
    console.warn(`[V2Format] ✗ ${parentDocId} — ${totalFail}/${writes.length} ops thất bại`);
  }
  return { ok, written: nWrite, deleted: nDelete, totalOk, totalFail };
}


// ──────────────────────────────────────────────────────────────
// Full-rewrite: xóa docs cũ không còn tồn tại + ghi lại toàn bộ
// Dùng cho danh_muc (isDeleted boolean) và hop_dong (object map)
// idField: tên field chứa document ID (mặc định 'id')
// ──────────────────────────────────────────────────────────────
async function _v2PushSubcollFull(parentDocId, activeRecords, fieldMap, summaryObj, idField) {
  const now    = Date.now();
  const coll   = _V2_SUBCOLL_NAME;
  const getId  = r => r[idField || 'id'];

  // 1. Ghi summary lên parent document
  try {
    const res = await _v2FsPatchDoc(parentDocId, _v2ToFsFields(summaryObj));
    if (res && res.error) {
      console.warn(`[V2Format] ✗ ${parentDocId} summary lỗi:`, res.error.message);
      return { ok: false };
    }
  } catch (e) {
    console.warn(`[V2Format] ✗ ${parentDocId} summary exception:`, e.message || e);
    return { ok: false };
  }

  // 2. Lấy IDs hiện có trong subcollection
  const existingIds = await _v2FsListIds(parentDocId, coll);
  const newIds      = new Set(activeRecords.map(getId).filter(Boolean));
  const writes      = [];

  // Xóa IDs cũ không còn trong danh sách active
  existingIds.forEach(oldId => {
    if (!newIds.has(oldId))
      writes.push({ op: 'delete', path: `${parentDocId}/${coll}/${oldId}` });
  });

  // Ghi tất cả active records (overwrite)
  activeRecords.forEach(rec => {
    const docId = getId(rec);
    if (!docId) return;
    writes.push({
      op:     'update',
      path:   `${parentDocId}/${coll}/${docId}`,
      fields: _v2ToFsFields(_v2ApplyFieldMap(rec, fieldMap)),
    });
  });

  if (writes.length === 0) {
    console.log(`[V2Format] ▲ ${parentDocId} (full) — không có records`);
    _v2SetLastPush(parentDocId, now);
    return { ok: true, written: 0, deleted: 0 };
  }

  const nDelete = writes.filter(w => w.op === 'delete').length;
  const nWrite  = writes.filter(w => w.op === 'update').length;
  const { totalOk, totalFail } = await _v2FsBatchWrite(writes);
  const ok = totalFail === 0;

  if (ok) {
    _v2SetLastPush(parentDocId, now);
    console.log(`[V2Format] ▲ ${parentDocId} (full) OK — ✏${nWrite} ghi, 🗑${nDelete} dọn cũ`);
  } else {
    console.warn(`[V2Format] ✗ ${parentDocId} (full) — ${totalFail}/${writes.length} ops thất bại`);
  }
  return { ok, written: nWrite, deleted: nDelete, totalOk, totalFail };
}


// ──────────────────────────────────────────────────────────────
// _v2PushYear(yr): push 5 loại year documents dùng subcollection
// ──────────────────────────────────────────────────────────────
async function _v2PushYear(yr) {
  const results = [];
  for (const type of _V2_YEAR_TYPES) {
    try {
      const { dataPayload: records, summaryObj } = _v2YearPayload(type, yr);
      const docId    = _v2DocYearId(type, yr);
      const fieldMap = _V2_FIELD_MAPS[type];
      if (!fieldMap) {
        console.warn(`[V2Format] _v2PushYear — không có field map cho "${type}"`);
        continue;
      }
      const res = await _v2PushSubcoll(docId, records, fieldMap, summaryObj, rec => _v2MakeDocId(type, rec));
      results.push({ type, ...res });
    } catch (e) {
      console.warn(`[V2Format] ✗ _v2PushYear ${type} ${yr}:`, e.message || e);
      results.push({ type, ok: false });
    }
  }
  return results;
}


// ──────────────────────────────────────────────────────────────
// _v2PushMeta(): push 4 loại meta document dùng subcollection
// ──────────────────────────────────────────────────────────────
async function _v2PushMeta() {
  const results = [];

  for (const type of _V2_META_TYPES) {
    try {
      const { dataPayload, summaryObj } = _v2MetaPayload(type);
      const docId = _v2DocMetaId(type);

      switch (type) {

        // cong_trinh + tai_khoan: id + deletedAt chuẩn → incremental
        case 'cong_trinh': {
          const res = await _v2PushSubcoll(
            docId, dataPayload, _V2_FIELD_MAPS.cong_trinh, summaryObj,
            rec => _v2MakeDocId('cong_trinh', rec)
          );
          results.push({ type, ...res });
          break;
        }
        case 'tai_khoan': {
          const res = await _v2PushSubcoll(
            docId, dataPayload, _V2_FIELD_MAPS.tai_khoan, summaryObj,
            rec => _v2MakeDocId('tai_khoan', rec)
          );
          results.push({ type, ...res });
          break;
        }

        // danh_muc: flatten cat_items_v1 (boolean isDeleted) → full rewrite
        case 'danh_muc': {
          const catItems  = (dataPayload && dataPayload.catItems) || {};
          const activeItems = [];
          const dmFieldMap  = {
            _dmKey:    'id',
            name:      'ten',
            loai:      'loai_danh_muc',
            updatedAt: 'cap_nhat_luc',
          };
          for (const [catType, items] of Object.entries(catItems)) {
            (items || []).filter(i => !i.isDeleted).forEach(item => {
              // ID dễ đọc: {loai_danh_muc}_{slug_ten}_{uid4}
              const uid4 = ((item.id || '') + '').replace(/-/g, '').slice(0, 4) || 'xxxx';
              const _dmKey = `${_v2Slug(catType, 10)}_${_v2Slug(item.name || '', 14)}_${uid4}`;
              activeItems.push({ ...item, loai: catType, _dmKey });
            });
          }
          const res = await _v2PushSubcollFull(docId, activeItems, dmFieldMap, summaryObj, '_dmKey');
          results.push({ type, ...res });
          break;
        }

        // hop_dong: merge hopdong_v1 (object) + thauphu_v1 (array) → full rewrite
        case 'hop_dong': {
          const { hopDong = {}, thauPhu = [] } = dataPayload || {};
          const activeRecs = [];
          const hdFieldMap = {
            _key:      'id',
            phan_loai: 'phan_loai',
            ngay:      'ngay',
            projectId: 'project_id',
            congtrinh: 'cong_trinh',
            giaTri:    'gia_tri',
            giaTriphu: 'gia_tri_phu',
            phatSinh:  'phat_sinh',
            nguoi:     'nguoi_ky',
            thauphu:   'ten_thau_phu',
            nd:        'noi_dung',
            updatedAt: 'cap_nhat_luc',
          };
          // Hợp đồng chính (hopdong_v1 là object map)
          Object.entries(hopDong).forEach(([key, hd]) => {
            if (hd.deletedAt) return;
            // _key: "chinh_{projectId}" — prefix phân biệt với thầu phụ
            const pid = hd.projectId || key || '';
            activeRecs.push({
              ...hd,
              _key:      `chinh_${_v2Slug(pid, 20)}`,
              phan_loai: 'hop_dong_chinh',
              congtrinh: hd.congtrinh || key,
            });
          });
          // Hợp đồng thầu phụ (thauphu_v1 là array)
          thauPhu.filter(h => !h.deletedAt).forEach(h => {
            // _key: "phu_{slug_ten_thau_phu}_{uid6}"
            const uid6 = ((h.id || '') + '').replace(/-/g, '').slice(0, 6) || 'xxxxxx';
            const tenPhu = _v2Slug(h.thauphu || h.ten_thau_phu || '', 14);
            activeRecs.push({ ...h, _key: `phu_${tenPhu}_${uid6}`, phan_loai: 'hop_dong_thau_phu' });
          });
          const res = await _v2PushSubcollFull(
            docId, activeRecs, hdFieldMap, summaryObj, '_key'
          );
          results.push({ type, ...res });
          break;
        }

        default:
          console.warn('[V2Format] _v2PushMeta — loại không xác định:', type);
      }
    } catch (e) {
      console.warn(`[V2Format] ✗ _v2PushMeta ${type}:`, e.message || e);
      results.push({ type, ok: false });
    }
  }
  return results;
}


// ══════════════════════════════════════════════════════════════
// [8] LEGACY PULL HELPERS (đọc data field cũ) — deprecated
// ══════════════════════════════════════════════════════════════

// Pull 1 year type từ V2 document
// Trả về Array (records) hoặc null nếu document chưa tồn tại / lỗi
// Dùng fsGet() global từ core.cloud-cats-ui.js
async function _v2PullYearType(type, yr) {
  try {
    const docId  = _v2DocYearId(type, yr);
    const rawDoc = await fsGet(docId);
    // Firestore trả 404 dạng { error: { code: 404 } } — không có fields
    if (!rawDoc || rawDoc.error || !rawDoc.fields) return null;
    const records = _v2Unwrap(rawDoc);
    if (!Array.isArray(records)) return null;
    console.log(`[V2Format] ▼ ${docId} (${records.length} records)`);
    return records;
  } catch (e) {
    console.warn(`[V2Format] Pull ${_v2DocYearId(type, yr)} lỗi:`, e.message || e);
    return null;
  }
}

// Pull 1 meta type từ V2 document
// Trả về data (Object|Array) hoặc null
// Dùng fsGet() global từ core.cloud-cats-ui.js
async function _v2PullMetaType(type) {
  try {
    const docId  = _v2DocMetaId(type);
    const rawDoc = await fsGet(docId);
    if (!rawDoc || rawDoc.error || !rawDoc.fields) return null;
    const data = _v2Unwrap(rawDoc);
    if (!data) return null;
    console.log(`[V2Format] ▼ ${docId} OK`);
    return data;
  } catch (e) {
    console.warn(`[V2Format] Pull ${_v2DocMetaId(type)} lỗi:`, e.message || e);
    return null;
  }
}


// ══════════════════════════════════════════════════════════════
// [10] REVERSE CONVERTERS — Firestore typed value → JS native
// ══════════════════════════════════════════════════════════════

// Chuyển 1 Firestore typed value → JS
// VD: { integerValue: "490000" } → 490000
//     { arrayValue: { values: [...] } } → [...]
function _v2FromFsValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue'    in v) return v.stringValue;
  if ('integerValue'   in v) return Number(v.integerValue);
  if ('doubleValue'    in v) return v.doubleValue;
  if ('booleanValue'   in v) return v.booleanValue;
  if ('nullValue'      in v) return null;
  if ('timestampValue' in v) return new Date(v.timestampValue).getTime();
  if ('arrayValue'     in v) return (v.arrayValue.values || []).map(_v2FromFsValue);
  if ('mapValue'       in v) return _v2FromFsFields(v.mapValue.fields || {});
  return null;
}

// Chuyển tất cả fields của 1 Firestore document → JS object
function _v2FromFsFields(fields) {
  const obj = {};
  for (const [k, v] of Object.entries(fields || {})) {
    obj[k] = _v2FromFsValue(v);
  }
  return obj;
}

// Áp dụng reverse field map: Firestore field name → JS field name
// VD: fieldMap = { congtrinh: 'cong_trinh', projectId: 'project_id', ... }
//     → reverseMap = { cong_trinh: 'congtrinh', project_id: 'projectId', ... }
function _v2ReverseApplyFieldMap(fsObj, fieldMap) {
  const reverseMap = {};
  for (const [jsKey, fsKey] of Object.entries(fieldMap)) {
    if (!(fsKey in reverseMap)) reverseMap[fsKey] = jsKey; // first mapping wins
  }
  const result = {};
  for (const [fsKey, val] of Object.entries(fsObj)) {
    result[reverseMap[fsKey] || fsKey] = val;
  }
  return result;
}

// Lấy tất cả documents trong subcollection — hỗ trợ phân trang (>500 docs)
// Trả về mảng Firestore document objects (có .name, .fields)
async function _v2FsGetSubcollDocs(parentDocId, collName) {
  const docs = [];
  let pageToken = null;
  try {
    do {
      let url = `${FS_BASE()}/${parentDocId}/${collName}?key=${FB_CONFIG.apiKey}&pageSize=500`;
      if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
      const res = await fetch(url).then(r => r.json());
      if (!res || res.error || !res.documents) break;
      docs.push(...res.documents);
      pageToken = res.nextPageToken || null;
    } while (pageToken);
  } catch (e) {
    console.warn(`[V2Format] _v2FsGetSubcollDocs lỗi (${parentDocId}/${collName}):`, e.message || e);
  }
  return docs;
}

// Pull subcollection → array records JS (áp dụng reverse field map)
// Trả về records[] hoặc null nếu subcollection chưa tồn tại / rỗng
async function _v2PullSubcoll(parentDocId, fieldMap) {
  const docs = await _v2FsGetSubcollDocs(parentDocId, _V2_SUBCOLL_NAME);
  if (!docs.length) return null;
  return docs.map(doc =>
    _v2ReverseApplyFieldMap(_v2FromFsFields(doc.fields || {}), fieldMap)
  );
}


// ══════════════════════════════════════════════════════════════
// [11] PULL YEAR FULL — đọc toàn bộ data 1 năm từ V2 subcollections
// ══════════════════════════════════════════════════════════════
// Mapping type V2 → local storage key
const _V2_TYPE_TO_LOCAL_KEY = {
  hoa_don:   'inv_v3',
  cham_cong: 'cc_v2',
  tien_ung:  'ung_v1',
  thiet_bi:  'tb_v1',
  thu_tien:  'thu_v1',
};

// Pull tất cả 5 loại data của 1 năm từ V2 subcollections
// Trả về { inv_v3: [...], cc_v2: [...], ... } — key vắng mặt = V2 chưa có data
async function _v2PullYearFull(yr) {
  const result = {};
  for (const [type, localKey] of Object.entries(_V2_TYPE_TO_LOCAL_KEY)) {
    try {
      const docId    = _v2DocYearId(type, yr);
      const fieldMap = _V2_FIELD_MAPS[type];
      if (!fieldMap) continue;
      const records = await _v2PullSubcoll(docId, fieldMap);
      if (records !== null) {
        result[localKey] = records;
        console.log(`[V2Format] ▼ ${docId}: ${records.length} records`);
      }
    } catch (e) {
      console.warn(`[V2Format] ✗ _v2PullYearFull ${type} yr=${yr}:`, e.message || e);
    }
  }
  return result;
}


// ══════════════════════════════════════════════════════════════
// [9] DEBUG HELPER — gọi từ browser console
// ══════════════════════════════════════════════════════════════
//
// Đọc summary + đếm records trong subcollection của mỗi V2 document.
// Gọi từ DevTools:
//   debugV2()             → tất cả documents V2
//   debugV2('y2026')      → tất cả loại năm 2026
//   debugV2('meta')       → chỉ meta documents
//   debugV2('hoa_don')    → hoa_don tất cả năm

async function debugV2(filter) {
  if (!fbReady()) { console.warn('[debugV2] Firebase chưa cấu hình'); return; }

  const years  = typeof _getAllLocalYears === 'function'
    ? _getAllLocalYears()
    : [String(activeYear || new Date().getFullYear())];
  const allDocs = [];

  for (const y of years) {
    for (const t of _V2_YEAR_TYPES) {
      allDocs.push({ id: _v2DocYearId(t, y), group: 'year', type: t });
    }
  }
  for (const t of _V2_META_TYPES) {
    allDocs.push({ id: _v2DocMetaId(t), group: 'meta', type: t });
  }

  const toFetch = filter
    ? allDocs.filter(d =>
        d.id.includes(filter) || d.type.includes(filter) ||
        (filter === 'meta' && d.group === 'meta') ||
        (filter === 'year' && d.group === 'year'))
    : allDocs;

  console.log(`[debugV2] Đang đọc ${toFetch.length} documents + subcollections...`);
  const rows = [];

  for (const { id } of toFetch) {
    try {
      // Đọc parent document (summary fields)
      const rawDoc = await fetch(
        `${FS_BASE()}/${id}?key=${FB_CONFIG.apiKey}`
      ).then(r => r.json());

      if (!rawDoc || rawDoc.error || !rawDoc.fields) {
        rows.push({ document: id, trang_thai: '⚠ Chưa tồn tại' });
        continue;
      }

      // Đọc số records trong subcollection ban_ghi
      const subcollIds = await _v2FsListIds(id, _V2_SUBCOLL_NAME);

      // Build row từ summary fields
      const row = { document: id, so_records_subcoll: subcollIds.length };
      for (const [k, fv] of Object.entries(rawDoc.fields)) {
        row[k] = fv.integerValue !== undefined
          ? parseInt(fv.integerValue)
          : (fv.stringValue !== undefined ? fv.stringValue
          : (fv.booleanValue !== undefined ? fv.booleanValue : ''));
      }

      // Trạng thái push từ localStorage
      const lp = _v2GetLastPush(id);
      row['last_push'] = lp ? _v2FmtDateTime(lp) : '(chưa push)';

      rows.push(row);
    } catch (e) {
      rows.push({ document: id, trang_thai: `✗ Lỗi: ${e.message}` });
    }
  }

  console.table(rows);
  const ok = rows.filter(r => !String(r.trang_thai || '').startsWith('⚠') &&
                               !String(r.trang_thai || '').startsWith('✗')).length;
  console.log(`[debugV2] Xong. ${ok}/${rows.length} documents tồn tại trên Firestore.`);
  return rows;
}
