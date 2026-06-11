// projects.model.js — Domain / Model / Data (Công Trình)
// Load order: sau core.*.js (3 files), trước projects.migration-selects.js và projects.ui.js
//
// Công trình là thực thể lõi (core entity) của toàn bộ ứng dụng.
// Tất cả dữ liệu nghiệp vụ (hóa đơn, chấm công, ung, ...) đều thuộc về một công trình.
//
// QUAN TRỌNG — Quy tắc năm:
//   - Projects KHÔNG bị lọc theo activeYear (long-living entities)
//   - Chỉ dữ liệu giao dịch (invoices, chamcong, ung, ...) mới bị lọc theo năm
//
// Liên kết dữ liệu cũ (backward compat):
//   - Mỗi record có thể có trường `projectId` (optional)
//   - Nếu có projectId → dùng để tra cứu tên công trình
//   - Nếu không có    → fallback sang trường `congtrinh` (text cũ)
//   - KHÔNG xóa trường `congtrinh` khỏi data cũ

// ══════════════════════════════
//  CONSTANTS
// ══════════════════════════════

// Nhãn trạng thái công trình (hiển thị UI)
const PROJECT_STATUS = {
  planning:  'Chuẩn bị thi công',
  active:    'Đang thi công',
  completed: 'Đã hoàn thành (chưa quyết toán)',
  closed:    'Đã quyết toán'
};

// ── Validation helpers ─────────────────────────────────────────────
// Pattern nhận ra chuỗi ngày tháng (YYYY-MM-DD, DD/MM/YYYY, v.v.)
const _PROJ_DATE_RE    = /^\d{4}-\d{2}-\d{2}$|^\d{2}\/\d{2}\/\d{4}$|^\d{2}-\d{2}-\d{4}$/;
const _VALID_STATUSES  = new Set(['planning', 'active', 'completed', 'closed']);
const _PROJ_VALID_TYPES = new Set(['CT', 'SC', 'OTHER']);

// Xác định loại công trình theo tên (không dùng field type)
// CT: tên bắt đầu bằng "CT", SC: bắt đầu bằng "SC", còn lại: OTHER
function _projTypeByName(name) {
  if (!name) return 'OTHER';
  const n = name.trim().toUpperCase();
  if (n.startsWith('CT')) return 'CT';
  if (n.startsWith('SC')) return 'SC';
  return 'OTHER';
}

/**
 * Kiểm tra một object có phải là project hợp lệ không.
 * Loại bỏ: ngày tháng, tên danh mục, và bất kỳ record thiếu cấu trúc bắt buộc.
 */
function _isValidProject(p) {
  if (!p || typeof p !== 'object') return false;
  if (p.deletedAt) return false; // soft-deleted
  if (!p.id || typeof p.id !== 'string' || !p.id.trim()) return false;
  if (!p.name || typeof p.name !== 'string' || !p.name.trim()) return false;
  if (_PROJ_DATE_RE.test(p.name.trim())) return false; // tên là ngày tháng → không hợp lệ
  if (!_VALID_STATUSES.has(p.status)) return false;
  return true;
}

/**
 * Xóa các project không hợp lệ khỏi mảng projects và lưu lại.
 * Gọi từ main.js với danh sách tên danh mục (loaiChiPhi, v.v.) để loại thêm.
 * Không tham chiếu trực tiếp tới `cats` để giữ module độc lập.
 *
 * @param {string[]} badNames Danh sách tên không phải project (VD: cats.loaiChiPhi)
 */
function cleanupInvalidProjects(badNames) {
  const badSet = new Set((badNames || []).map(n => (n || '').trim()));
  const before = projects.length;
  // Giữ lại: soft-deleted (không xóa hard) + valid project không nằm trong badNames
  projects = projects.filter(p =>
    p.deletedAt || (_isValidProject(p) && !badSet.has((p.name || '').trim()))
  );
  if (projects.length < before) {
    _saveProjects();
    console.log(`[cleanupProjects] Đã xóa ${before - projects.length} project không hợp lệ khỏi projects_v1`);
  }
}

// Công trình đặc biệt "CÔNG TY" — không lưu vào storage, luôn tồn tại
// Dùng cho chi phí chung: thiết bị, văn phòng, lương cán bộ cố định, dụng cụ chung
const PROJECT_COMPANY = Object.freeze({
  id:        'COMPANY',
  name:      'CÔNG TY',
  status:    'active',
  startDate: null,
  endDate:   null,
  note:      'Chi phí chung của công ty',
  createdAt: 0,
  updatedAt: 0
});

// ══════════════════════════════
//  GLOBAL STATE
// ══════════════════════════════
// Được main.js gán lại sau khi dbInit() + load() chạy xong:
//   projects = load('projects_v1', [])

let projects = [];

// ══════════════════════════════
//  INTERNAL
// ══════════════════════════════

function _saveProjects() {
  save('projects_v1', projects);
  // Realtime: refresh dropdowns nhập liệu
  if (typeof refreshEntryDropdowns === 'function') refreshEntryDropdowns();
}

/**
 * Rebuild cats.congTrinh (và congTrinhYears) từ projects — single source of truth.
 * Gọi sau mọi thay đổi đến projects để giữ danh mục luôn đồng bộ.
 *
 * Ưu tiên: tên từ projects[]
 * Backward compat: tên đã có dữ liệu thực tế (invoice/cc/ung/thu) nhưng chưa migrate
 * sang projects cũng được bảo toàn — đảm bảo không mất CT cũ.
 * Lọc: loại bỏ tên thuộc danh mục loaiChiPhi / nhaCungCap / v.v.
 */
function rebuildCatCTFromProjects() {
  if (typeof cats === 'undefined') return;

  // Chỉ build từ projects[] — single source of truth, không union từ invoices/cc/ung/thu
  const projNames = projects.filter(_isValidProject).map(p => p.name);
  const deduped = [...new Set(projNames)];

  // Rebuild congTrinhYears — lấy year từ project.startDate (ưu tiên), giữ year cũ cho phần còn lại
  const newYears = { ...(cats.congTrinhYears || {}) };
  projects.filter(_isValidProject).forEach(p => {
    if (p.startDate) {
      const yr = parseInt(p.startDate.split('-')[0]);
      if (yr > 2000 && yr < 2100) newYears[p.name] = yr;
    }
  });

  cats.congTrinh      = deduped;
  cats.congTrinhYears = newYears;
  // Dùng _memSet thay vì save() — cat_ct là derived data, KHÔNG phải user action
  // → không tăng _pendingChanges → tránh counter sai khi chuyển tab / đổi năm / sau pull
  _memSet('cat_ct',       cats.congTrinh);
  _memSet('cat_ct_years', cats.congTrinhYears);
}

/**
 * Chuyển đổi trường year → startDate cho các project cũ (migration một lần, idempotent).
 * Gọi sau khi projects được load từ storage.
 */
function _migrateProjectDates() {
  let changed = false;
  projects.forEach(p => {
    if (!p.startDate && p.year) {
      p.startDate = `${p.year}-01-01`;
      changed = true;
    }
    if (!('endDate' in p)) { p.endDate = null; }
  });
  if (changed) _saveProjects();
}

/**
 * Backfill project.chuDauTu từ hopdong_v1.khachHang (legacy data).
 * Chạy 1 lần lúc khởi động — idempotent. Nếu project chưa có chuDauTu nhưng
 * có HĐ Chính khớp với khachHang → copy giá trị về project.
 */
function _migrateChuDauTuFromHopDong() {
  if (typeof hopDongData === 'undefined') return;
  let changed = false;
  projects.forEach(p => {
    if (p.deletedAt || p.chuDauTu) return;
    // Tìm hd khớp theo projectId hoặc tên
    const hd = hopDongData[p.id] || hopDongData[p.name];
    if (hd && !hd.deletedAt && hd.khachHang) {
      p.chuDauTu = (hd.khachHang || '').trim();
      changed = true;
    }
  });
  if (changed) _saveProjects();
}

// ══════════════════════════════
//  PUBLIC API
// ══════════════════════════════

// [PATCH] Helper: lấy startDate tự động từ chamcong record sớm nhất của project.
// Chỉ dùng để HIỂN THỊ — không ghi đè project.startDate.
// Trả về YYYY-MM-DD (thứ Hai của tuần sớm nhất), hoặc null nếu không có cc data.
function getProjectAutoStartDate(projectId) {
  if (!projectId || typeof ccData === 'undefined') return null;
  const records = ccData.filter(r =>
    !r.deletedAt && r.fromDate &&
    (r.projectId ? r.projectId === projectId : false)
  );
  if (!records.length) return null;

  // Tìm fromDate nhỏ nhất (so sánh chuỗi ISO an toàn)
  const earliest = records.reduce((min, r) =>
    r.fromDate < min ? r.fromDate : min
  , records[0].fromDate);

  // fromDate trong cc_v2 là Chủ Nhật — snap về thứ Hai của tuần đó
  const d = new Date(earliest + 'T00:00:00');
  const day = d.getDay(); // 0=CN, 1=T2, ..., 6=T7
  const diffToMonday = day === 0 ? 1 : day === 1 ? 0 : -(day - 1);
  d.setDate(d.getDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

/**
 * Tạo mới một công trình.
 * @param {Object} opts
 * @param {string} opts.name        Tên công trình (bắt buộc)
 * @param {string} [opts.status]    Trạng thái: planning|active|completed|closed (mặc định: 'active')
 * @param {string} [opts.startDate] Ngày bắt đầu dạng YYYY-MM-DD (mặc định: đầu năm hiện tại)
 * @param {string} [opts.endDate]   Ngày kết thúc (tùy chọn)
 * @param {number} [opts.year]      Backward compat — nếu có sẽ chuyển thành startDate = YYYY-01-01
 * @param {string} [opts.note]      Ghi chú
 * @returns {Object} Công trình vừa tạo
 */
function createProject({ name, type = 'OTHER', status = 'active', startDate, endDate, closedDate, year, note = '', chuDauTu = '', customerId = null, heSoTiTrong = 1 } = {}) {
  if (!name || !name.trim()) throw new Error('Tên công trình không được để trống');
  if (!PROJECT_STATUS[status]) throw new Error('Trạng thái không hợp lệ: ' + status);
  const nowMs  = Date.now();
  const todayS = new Date().toISOString().slice(0, 10);
  const curYear = new Date().getFullYear();
  const _activeYear = typeof activeYear !== 'undefined' ? activeYear : 0;
  // Tính năm tạo: ưu tiên activeYear (>0), fallback curYear
  const _year = year || (_activeYear > 0 ? _activeYear : curYear);
  // startDate: activeYear=0 (Tất cả) → hôm nay; năm cũ → 01-01; năm hiện tại → hôm nay
  const sd = startDate || (
    _activeYear === 0   ? todayS :
    _year < curYear     ? `${_year}-01-01` :
                          todayS
  );
  const project = {
    id:          crypto.randomUUID(),
    name:        name.trim(),
    type:        _PROJ_VALID_TYPES.has(type) ? type : 'OTHER',
    status,
    startDate:   sd,
    endDate:     endDate    || null,
    closedDate:  closedDate || null,
    note:        note || '',
    chuDauTu:    (chuDauTu || '').trim(),
    // FK liên kết tới bản ghi khách hàng (CRM). Vẫn giữ chuDauTu = tên để tương thích ngược.
    customerId:  customerId || null,
    // Hệ số tỉ trọng phân bổ chi phí chung (mặc định 1, k=0 → không gánh)
    heSoTiTrong: (typeof heSoTiTrong === 'number' && isFinite(heSoTiTrong) && heSoTiTrong >= 0) ? heSoTiTrong : 1,
    createdYear: _year,
    createdAt:   nowMs,
    updatedAt:   nowMs
  };
  projects.push(project);
  _saveProjects();
  rebuildCatCTFromProjects();
  return project;
}

/**
 * Cập nhật thông tin công trình.
 * PROJECT_COMPANY ('COMPANY') không thể sửa — trả về PROJECT_COMPANY ngay.
 * @param {string} id       ID công trình cần cập nhật
 * @param {Object} changes  Các field cần thay đổi (id, createdAt, updatedAt bị bỏ qua)
 * @returns {Object|null}   Công trình sau khi cập nhật, hoặc null nếu không tìm thấy
 */
function updateProject(id, changes = {}) {
  if (id === 'COMPANY') return PROJECT_COMPANY;
  const idx = projects.findIndex(p => p.id === id);
  if (idx < 0) return null;
  const { createdAt } = projects[idx]; // bảo toàn thời điểm tạo gốc
  // Loại bỏ các trường không được phép ghi đè qua changes
  const { id: _id, createdAt: _ca, updatedAt: _ua, ...safeChanges } = changes;
  if (typeof safeChanges.chuDauTu === 'string') safeChanges.chuDauTu = safeChanges.chuDauTu.trim();
  // Ép kiểu hệ số tỉ trọng về số hợp lệ (>= 0); không hợp lệ → 1
  if ('heSoTiTrong' in safeChanges) {
    const _k = Number(safeChanges.heSoTiTrong);
    safeChanges.heSoTiTrong = (isFinite(_k) && _k >= 0) ? _k : 1;
  }
  projects[idx] = {
    ...projects[idx],
    ...safeChanges,
    id,
    createdAt,
    updatedAt: Date.now()
  };
  _saveProjects();
  rebuildCatCTFromProjects();
  // Đồng bộ chuDauTu → hopdong_v1.khachHang (đảm bảo HĐ Chính hiển thị đúng tên CĐT mới)
  if ('chuDauTu' in safeChanges) _syncChuDauTuToHopDong(id);
  return projects[idx];
}

/**
 * Đồng bộ project.chuDauTu → hopdong_v1[projectId].khachHang.
 * Gọi sau khi updateProject() đổi chuDauTu để HĐ Chính reflect ngay.
 */
function _syncChuDauTuToHopDong(projectId) {
  if (typeof hopDongData === 'undefined' || !projectId) return;
  const p = getProjectById(projectId);
  if (!p) return;
  // Tìm key trong hopDongData: ưu tiên projectId, fallback tên CT (legacy)
  const keys = [projectId, p.name].filter(k => hopDongData[k] && !hopDongData[k].deletedAt);
  let changed = false;
  keys.forEach(k => {
    if (hopDongData[k].khachHang !== p.chuDauTu) {
      hopDongData[k].khachHang = p.chuDauTu || '';
      hopDongData[k].updatedAt = Date.now();
      changed = true;
    }
  });
  if (changed) save('hopdong_v1', hopDongData);
}

/**
 * Tìm công trình theo ID.
 * - id = 'COMPANY' → trả về PROJECT_COMPANY
 * - Không tìm thấy → null
 */
function getProjectById(id) {
  if (id === 'COMPANY') return PROJECT_COMPANY;
  return projects.find(p => p.id === id && !p.deletedAt) || null;
}

/**
 * Tìm projectId từ tên công trình.
 * Ưu tiên: exact match → accent-insensitive match → special constants.
 * Dùng khi gán projectId cho records cũ hoặc resolve từ text name.
 * @param {string} name
 * @returns {string|null} projectId hoặc null nếu không tìm thấy
 */
function findProjectIdByName(name) {
  if (!name) return null;
  const n = name.trim();
  if (!n) return null;
  // Special constants
  if (n === 'CÔNG TY' || n === 'KHO TỔNG') return 'COMPANY';
  if (PROJECT_COMPANY && n === PROJECT_COMPANY.name) return 'COMPANY';
  // Exact match
  const exact = projects.find(p => !p.deletedAt && p.name === n);
  if (exact) return exact.id;
  // Accent-insensitive fallback (normalize NFD, bỏ dấu, lowercase, collapse spaces)
  const _norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const nNorm = _norm(n);
  const fuzzy = projects.find(p => !p.deletedAt && _norm(p.name) === nNorm);
  return fuzzy ? fuzzy.id : null;
}

/**
 * Lấy danh sách project đã được sắp xếp theo quy tắc Master View:
 * 1. Theo trạng thái (Trạng thái Order: planning -> active -> completed -> closed)
 * 2. Theo tiền tố tên (CT -> SC -> Khác)
 * 3. Theo bảng chữ cái (localeCompare 'vi')
 */
function getSortedProjects() {
  const statusOrder = { planning: 1, active: 2, completed: 3, closed: 4 };
  const getPrefixOrder = (name) => {
    const n = (name || '').trim().toUpperCase();
    if (n.startsWith('CT')) return 1;
    if (n.startsWith('SC')) return 2;
    return 3;
  };

  return projects.filter(_isValidProject).sort((a, b) => {
    const s1 = statusOrder[a.status] || 99;
    const s2 = statusOrder[b.status] || 99;
    if (s1 !== s2) return s1 - s2;

    const p1 = getPrefixOrder(a.name);
    const p2 = getPrefixOrder(b.name);
    if (p1 !== p2) return p1 - p2;

    return (a.name || '').localeCompare(b.name || '', 'vi');
  });
}

/**
 * Lấy tất cả công trình thực (không bao gồm COMPANY).
 * COMPANY là cost center riêng — không phải project.
 * KHÔNG lọc theo năm — đây là long-living entities.
 */
function getAllProjects() {
  return getSortedProjects();
}

/**
 * Tạo <option> HTML cho dropdown công trình — unified helper.
 * @param {Object} opts
 * @param {boolean} [opts.includeCompany=false] Thêm CÔNG TY vào đầu
 * @param {boolean} [opts.includeAll=false]     First option = "Tất cả công trình" (dùng cho filter)
 * @param {string}  [opts.selected='']          Tên đang chọn (giữ khi edit)
 * Lọc theo năm: dùng _ctInActiveYear (name-based + data-based, giống filter cũ)
 */
function getProjectOptions({ includeCompany = false, includeAll = false, selected = '' } = {}) {
  const placeholder = includeAll ? '-- Tất cả công trình --' : '-- Chọn công trình --';
  const projs = getAllProjects();
  const base  = includeCompany ? [PROJECT_COMPANY, ...projs] : projs;
  const filtered = (typeof activeYear === 'undefined' || activeYear === 0)
    ? base
    : base.filter(p => {
        if (p.id === 'COMPANY') return includeCompany;
        if (p.name === selected) return true;
        return _ctInActiveYear(p.name);
      });
  return `<option value="">${placeholder}</option>` +
    filtered.map(p => {
      const sel = p.name === selected ? ' selected' : '';
      const pid = p.id ? ` data-pid="${p.id}"` : '';
      return `<option value="${x(p.name)}"${pid}${sel}>${x(p.name)}</option>`;
    }).join('');
}

// ── Phân bổ chi phí chung CÔNG TY ───────────────────────────────────

/** Số ngày thi công của project TRONG NĂM được chọn (activeYear). Không có startDate → 1 ngày. */
function getProjectDays(p) {
  if (!p || !p.startDate) return 1;
  const _year = (typeof activeYear !== 'undefined' && activeYear > 0) ? activeYear : 0;
  if (_year === 0) {
    // No year filter: full duration
    const endMs = p.endDate ? new Date(p.endDate).getTime() : Date.now();
    const days  = Math.ceil((endMs - new Date(p.startDate).getTime()) / 86400000);
    return days <= 0 ? 1 : days;
  }
  // Clamp project duration to selected year
  const yearStart = new Date(_year + '-01-01T00:00:00').getTime();
  const yearEnd   = new Date(_year + '-12-31T23:59:59').getTime();
  const projStart = new Date(p.startDate + 'T00:00:00').getTime();
  const projEnd   = p.endDate ? new Date(p.endDate + 'T23:59:59').getTime() : Date.now();
  // No overlap
  if (projEnd < yearStart || projStart > yearEnd) return 0;
  const overlapStart = Math.max(projStart, yearStart);
  const overlapEnd   = Math.min(projEnd,   yearEnd);
  const days = Math.ceil((overlapEnd - overlapStart) / 86400000);
  return days <= 0 ? 1 : days;
}

/**
 * Hệ số tỉ trọng (k) do người dùng nhập — dùng để phân bổ chi phí chung CÔNG TY.
 * Mặc định = 1 (nếu chưa nhập hoặc giá trị không hợp lệ).
 * k = 0 → công trình KHÔNG gánh chi phí chung (trọng số = 0).
 */
function getProjectK(p) {
  const k = p && p.heSoTiTrong;
  return (typeof k === 'number' && isFinite(k) && k >= 0) ? k : 1;
}
// Alias giữ tương thích tên cũ — "factor" giờ chính là hệ số k người dùng nhập.
function getProjectFactor(p) { return getProjectK(p); }

/** Trọng số phân bổ = số ngày thi công (trong năm) × hệ số tỉ trọng k. */
function getProjectWeight(p) {
  return getProjectDays(p) * getProjectK(p);
}

/** Tổng chi phí chung CÔNG TY trong năm đang chọn. */
function getCompanyCost() {
  return getInvoicesCached()
    .filter(i => !i.deletedAt && inActiveYear(i.ngay) && i.projectId === 'COMPANY')
    .reduce((s, i) => s + (i.thanhtien || i.tien || 0), 0);
}

/**
 * Phân bổ chi phí chung theo trọng số (days × factor).
 * Tính realtime — KHÔNG lưu DB.
 * @returns {Array<{p, weight, pct, allocated}>}
 */
function allocateCompanyCost() {
  const projs       = getAllProjects().filter(p => p.startDate && getProjectDays(p) > 0);
  const totalCost   = getCompanyCost();
  const totalWeight = projs.reduce((s, p) => s + getProjectWeight(p), 0);
  return projs.map(p => {
    const weight = getProjectWeight(p);
    const pct    = totalWeight > 0 ? weight / totalWeight : 0;
    return { p, weight: Math.round(weight), pct, allocated: totalCost * pct };
  });
}

/**
 * Kiểm tra có thể xóa project không.
 * Chỉ cho xóa nếu không còn bất kỳ dữ liệu nào liên kết.
 */
function canDeleteProject(projectId) {
  if (!projectId) return true;
  const hasInv = getInvoicesCached().some(i => !i.deletedAt && i.projectId === projectId);
  const hasCC  = typeof ccData     !== 'undefined' && ccData.some(c     => !c.deletedAt && c.projectId === projectId);
  const hasTB  = typeof tbData     !== 'undefined' && tbData.some(t     => !t.deletedAt && t.projectId === projectId);
  const hasUng = typeof ungRecords !== 'undefined' && ungRecords.some(r => !r.deletedAt && r.projectId === projectId);
  return !(hasInv || hasCC || hasTB || hasUng);
}

/**
 * Resolve tên công trình từ một record bất kỳ.
 *
 * Quy tắc ưu tiên:
 *   1. record.projectId → tra getProjectById() → lấy name
 *   2. Fallback: record.congtrinh (text field cũ — tương thích ngược)
 *
 * @param {Object} record  Bất kỳ record nào có thể có projectId và/hoặc congtrinh
 * @returns {string}       Tên công trình, hoặc '' nếu không xác định được
 */
function resolveProjectName(record) {
  if (record && record.projectId) {
    const p = getProjectById(record.projectId);
    if (p) return p.name;
  }
  return (record && record.congtrinh) || '';
}
