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
// [4] FIRESTORE DOCUMENT BUILDER V2
// ══════════════════════════════════════════════════════════════
//
// Kết quả trên Firestore console Panel view:
//   loai_du_lieu  → "Hóa Đơn / Chi Phí"          (stringValue)
//   nam           → 2026                           (integerValue)
//   cap_nhat      → "22/05/2026 14:35"             (stringValue)
//   so_ban_ghi    → 145                            (integerValue)
//   da_xoa        → 3                              (integerValue)
//   tong_tien     → "892,500,000 đ"                (stringValue)
//   cong_trinh    → "CT A · CT B · CT C"           (stringValue)
//   data          → "[{"id":"...","ngay":"2026..."...]" (stringValue — đọc được)

function fsWrapV2(dataPayload, summaryObj) {
  const fields = {};

  // Summary fields: dùng Firestore typed values để console hiện đúng kiểu dữ liệu
  for (const [k, v] of Object.entries(summaryObj || {})) {
    if (typeof v === 'number' && Number.isInteger(v)) {
      fields[k] = { integerValue: String(v) };
    } else {
      fields[k] = { stringValue: String(v == null ? '' : v) };
    }
  }

  // data field: JSON không nén, full field names → đọc được khi inspect chuỗi
  fields.data = { stringValue: JSON.stringify(dataPayload) };

  return { fields };
}

// Unwrap V2 document → trả về parsed data (Array | Object | null)
// Compatible với fsUnwrap — cùng đọc field "data"
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
// [7] PUSH HELPERS — dùng trong sync.js pushChanges()
// ══════════════════════════════════════════════════════════════

// fsSetRaw: gửi Firestore document đã được wrap sẵn (không qua fsWrap lại)
// Dùng khi payload đã là { fields: {...} } từ fsWrapV2()
// Dùng FS_BASE() + FB_CONFIG từ core.storage.js (load trước)
function _v2FsSetRaw(docId, wrappedDoc) {
  return fetch(`${FS_BASE()}/${docId}?key=${FB_CONFIG.apiKey}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(wrappedDoc),
  }).then(r => r.json());
}

// Push tất cả 5 loại year documents cho 1 năm
// Gọi trong sync.js: await _v2PushYear(yr)
async function _v2PushYear(yr) {
  const results = [];
  for (const type of _V2_YEAR_TYPES) {
    try {
      const { dataPayload, summaryObj } = _v2YearPayload(type, yr);
      const docId  = _v2DocYearId(type, yr);
      const docRaw = fsWrapV2(dataPayload, summaryObj);
      const res    = await _v2FsSetRaw(docId, docRaw);
      const ok     = res && res.fields;
      results.push({ type, ok });
      if (ok)
        console.log(`[V2Format] ▲ ${docId} OK (${dataPayload.length} records)`);
      else
        console.warn(`[V2Format] ✗ ${docId} lỗi:`, res?.error?.message || res);
    } catch (e) {
      console.warn(`[V2Format] ✗ ${_v2DocYearId(type, yr)} exception:`, e.message || e);
      results.push({ type, ok: false });
    }
  }
  return results;
}

// Push tất cả 4 meta documents
// Gọi trong sync.js: await _v2PushMeta()
async function _v2PushMeta() {
  const results = [];
  for (const type of _V2_META_TYPES) {
    try {
      const { dataPayload, summaryObj } = _v2MetaPayload(type);
      const docId  = _v2DocMetaId(type);
      const docRaw = fsWrapV2(dataPayload, summaryObj);
      const res    = await _v2FsSetRaw(docId, docRaw);
      const ok     = res && res.fields;
      results.push({ type, ok });
      if (ok)
        console.log(`[V2Format] ▲ ${docId} OK`);
      else
        console.warn(`[V2Format] ✗ ${docId} lỗi:`, res?.error?.message || res);
    } catch (e) {
      console.warn(`[V2Format] ✗ ${_v2DocMetaId(type)} exception:`, e.message || e);
      results.push({ type, ok: false });
    }
  }
  return results;
}


// ══════════════════════════════════════════════════════════════
// [8] PULL HELPERS — dùng trong sync.js pullChanges()
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
// [9] DEBUG HELPER — gọi từ browser console
// ══════════════════════════════════════════════════════════════
//
// Dùng khi muốn xem nhanh trạng thái data trên Firestore mà không cần
// mở Firestore console. Gọi từ DevTools:
//   debugV2()             → hiện tất cả documents V2
//   debugV2('y2026')      → hiện tất cả loại năm 2026
//   debugV2('meta')       → hiện tất cả meta documents
//   debugV2('hoa_don')    → hiện hoa_don tất cả năm có local data

async function debugV2(filter) {
  if (!fbReady()) { console.warn('[debugV2] Firebase chưa cấu hình'); return; }

  const yr     = activeYear || new Date().getFullYear();
  const years  = typeof _getAllLocalYears === 'function' ? _getAllLocalYears() : [String(yr)];
  const allIds = [];

  // Year documents
  for (const y of years) {
    for (const t of _V2_YEAR_TYPES) {
      allIds.push({ id: _v2DocYearId(t, y), group: 'year', type: t, yr: y });
    }
  }
  // Meta documents
  for (const t of _V2_META_TYPES) {
    allIds.push({ id: _v2DocMetaId(t), group: 'meta', type: t });
  }

  // Áp filter
  const toFetch = filter
    ? allIds.filter(d =>
        d.id.includes(filter) || d.type.includes(filter) ||
        (filter === 'meta' && d.group === 'meta') ||
        (filter === 'year' && d.group === 'year'))
    : allIds;

  console.log(`[debugV2] Fetching ${toFetch.length} documents...`);
  const rows = [];

  for (const { id, type } of toFetch) {
    try {
      const rawDoc = await fsGet(id);
      if (!rawDoc || rawDoc.error || !rawDoc.fields) {
        rows.push({ document: id, trang_thai: '⚠ Chưa tồn tại' });
        continue;
      }
      // Đọc summary fields (bỏ qua field "data")
      const row = { document: id };
      for (const [k, fv] of Object.entries(rawDoc.fields)) {
        if (k === 'data') {
          // Chỉ hiện length của data, không dump toàn bộ
          const len = (fv.stringValue || '').length;
          row['data_size'] = `${Math.round(len / 1024 * 10) / 10} KB`;
          // Đếm records
          try {
            const parsed = JSON.parse(fv.stringValue);
            row['so_records'] = Array.isArray(parsed)
              ? parsed.length
              : (parsed?.hopDong ? Object.keys(parsed.hopDong || {}).length + ' HĐ' : typeof parsed);
          } catch { row['so_records'] = '(parse lỗi)'; }
          continue;
        }
        row[k] = fv.integerValue !== undefined
          ? parseInt(fv.integerValue)
          : (fv.stringValue || '');
      }
      rows.push(row);
    } catch (e) {
      rows.push({ document: id, trang_thai: `✗ Lỗi: ${e.message}` });
    }
  }

  console.table(rows);
  console.log(`[debugV2] Xong. ${rows.filter(r => !r.trang_thai?.includes('⚠')).length}/${rows.length} documents tồn tại.`);
  return rows;
}
