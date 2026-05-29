// core.normalize.js — Module chuẩn hóa record về 6 field tiêu chuẩn
// Load order: sau core.storage.js, trước sync.js (xem index.html)
//
// MỤC ĐÍCH:
//   Dùng cho import / restore snapshot. Dữ liệu cũ (từ Excel, snapshot đời đầu)
//   thường thiếu các field hệ thống một cách không đồng đều. Module này gom toàn
//   bộ logic chuẩn hóa về MỘT chỗ, đảm bảo mọi record giao dịch có đủ 6 field:
//
//     id        — định danh duy nhất (UUID hoặc số timestamp dạng chuỗi)
//     createdAt — thời điểm tạo (ms)
//     updatedAt — thời điểm sửa gần nhất (ms) — dùng cho LWW khi merge
//     deletedAt — tombstone xóa mềm (null = chưa xóa)
//     deviceId  — thiết bị tạo/sửa record
//     projectId — liên kết tới công trình (suy từ tên nếu thiếu)
//
//   KHÔNG đổi id nếu đã hợp lệ (tránh phá vỡ reference giữa các record).
//   KHÔNG đụng tới mảng không phải record giao dịch (projects_v1, users_v1...).

// Map loại data → field chứa TÊN công trình (để suy ra projectId)
const _NORM_CT_FIELD = {
  inv_v3: 'congtrinh',
  cc_v2:  'ct',
  tb_v1:  'ct',
  ung_v1: 'congtrinh',
  thu_v1: 'congtrinh',
};

// Regex kiểm tra UUID hợp lệ
const _NORM_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function _normIsUUID(v) { return typeof v === 'string' && _NORM_UUID_RE.test(v); }

// Lấy deviceId hiện tại — guard vì DEVICE_ID khai báo ở sync.js (load sau file này),
// nhưng normalize chỉ chạy lúc import (rất lâu sau khi mọi script đã load) nên an toàn.
function _normDeviceId() {
  return (typeof DEVICE_ID !== 'undefined') ? DEVICE_ID : '';
}

/**
 * normalizeRecord(rec, key, ctByName)
 * Chuẩn hóa 1 record về 6 field tiêu chuẩn. Trả về bản COPY (không sửa rec gốc).
 * @param {Object} rec      record gốc
 * @param {string} key      loại data (inv_v3, cc_v2, tb_v1, ung_v1, thu_v1)
 * @param {Object} [ctByName] map { 'tên CT': projectId } để suy projectId (tùy chọn)
 * @returns {{rec:Object, stats:{fixedId:number, filledPid:number, filledMeta:number}}}
 */
function normalizeRecord(rec, key, ctByName) {
  const now = Date.now();
  const r = { ...rec };
  const stats = { fixedId: 0, filledPid: 0, filledMeta: 0 };

  // 1) id — number (float từ Excel) → chuỗi; thiếu → UUID mới.
  //    Giữ nguyên số timestamp dạng chuỗi để không phá reference cũ.
  if (typeof r.id === 'number') {
    r.id = String(Math.round(r.id));
    stats.fixedId++;
  } else if (!r.id) {
    r.id = crypto.randomUUID();
    stats.fixedId++;
  }

  // 2) createdAt — thiếu → lấy _ts cũ hoặc now
  if (!r.createdAt) { r.createdAt = r._ts || now; stats.filledMeta++; }

  // 3) updatedAt — thiếu → lấy _ts / createdAt / now
  if (!r.updatedAt) { r.updatedAt = r._ts || r.createdAt || now; stats.filledMeta++; }

  // 4) deletedAt — thiếu (undefined) → null. Giữ nguyên nếu đã là tombstone.
  if (r.deletedAt === undefined) { r.deletedAt = null; stats.filledMeta++; }

  // 5) deviceId — thiếu → deviceId thiết bị hiện tại
  if (!r.deviceId) { r.deviceId = _normDeviceId(); stats.filledMeta++; }

  // 6) projectId — thiếu → suy từ tên công trình
  if (!r.projectId) {
    const ctField = _NORM_CT_FIELD[key];
    const ctName  = ctField ? r[ctField] : null;
    if (ctName) {
      const trimmed = String(ctName).trim();
      let pid = null;
      if (ctByName && ctByName[trimmed]) {
        pid = ctByName[trimmed];                          // ưu tiên map từ chính snapshot
      } else if (typeof findProjectIdByName === 'function') {
        pid = findProjectIdByName(ctName);                // fallback: state hiện tại
      }
      if (pid) { r.projectId = pid; stats.filledPid++; }
    }
  }

  return { rec: r, stats };
}

/**
 * normalizeDataset(key, arr, ctByName)
 * Chuẩn hóa cả mảng record cùng loại. Trả về mảng mới + thống kê gộp.
 * @returns {{records:Array, stats:{fixedId:number, filledPid:number, filledMeta:number}}}
 */
function normalizeDataset(key, arr, ctByName) {
  const total = { fixedId: 0, filledPid: 0, filledMeta: 0 };
  if (!Array.isArray(arr)) return { records: arr, stats: total };
  const records = arr.map(rec => {
    const { rec: r, stats } = normalizeRecord(rec, key, ctByName);
    total.fixedId    += stats.fixedId;
    total.filledPid  += stats.filledPid;
    total.filledMeta += stats.filledMeta;
    return r;
  });
  return { records, stats: total };
}

/**
 * normalizeImportStore(data)
 * Chuẩn hóa toàn bộ store {key: array|value} của 1 snapshot.
 * Chỉ chuẩn hóa 5 loại record giao dịch (theo _NORM_CT_FIELD); các key khác
 * (projects_v1, users_v1, cat_items_v1...) giữ nguyên.
 * Tự xây map tên CT → projectId từ chính data.projects_v1 (độc lập state hiện tại).
 * @param {Object} data store gốc
 * @returns {Object} store đã chuẩn hóa (bản copy theo từng key record)
 */
function normalizeImportStore(data) {
  const ctByName = {};
  (data.projects_v1 || []).forEach(p => {
    if (p && p.name && p.id && !p.deletedAt) ctByName[p.name.trim()] = p.id;
  });

  const result = {};
  const grand = { fixedId: 0, filledPid: 0, filledMeta: 0 };

  for (const [key, val] of Object.entries(data)) {
    if (!Array.isArray(val) || !_NORM_CT_FIELD[key]) {
      result[key] = val;                                  // không phải record giao dịch → giữ nguyên
      continue;
    }
    const { records, stats } = normalizeDataset(key, val, ctByName);
    result[key] = records;
    grand.fixedId    += stats.fixedId;
    grand.filledPid  += stats.filledPid;
    grand.filledMeta += stats.filledMeta;
  }

  const msgs = [];
  if (grand.fixedId)    msgs.push(`sửa ${grand.fixedId} id`);
  if (grand.filledPid)  msgs.push(`điền ${grand.filledPid} projectId`);
  if (grand.filledMeta) msgs.push(`bổ sung ${grand.filledMeta} field meta`);
  console.log(msgs.length
    ? `[Normalize] ✓ ${msgs.join(', ')}`
    : '[Normalize] ✓ Dữ liệu đã chuẩn — không cần normalize');

  return result;
}
