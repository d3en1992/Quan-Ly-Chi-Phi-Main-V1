/**
 * ════════════════════════════════════════════════════════════════════════
 *  KHÁCH HÀNG (CHỦ ĐẦU TƯ) — Model dữ liệu hướng CRM
 * ════════════════════════════════════════════════════════════════════════
 *  Tách "Chủ đầu tư" từ 1 ô text trên công trình thành 1 bảng dữ liệu độc lập.
 *  Mục tiêu: 1 khách hàng → nhiều công trình (quan hệ 1-N), chăm sóc/lịch sử.
 *
 *  - Lưu trữ: store 'customers_v1' (settings blob, rowId 'customers') trong IDB.
 *  - Đồng bộ cloud: piggyback trong meta_cong_trinh (cùng doc với projects).
 *  - Liên kết: project.customerId = customer.id (FK). Đồng thời vẫn ghi
 *    project.chuDauTu = customer.name để tương thích ngược (search/sort/HĐ).
 *
 *  Shape 1 khách hàng:
 *    { id, name, phone, email, address, taxCode, note,
 *      createdAt, updatedAt, deletedAt }
 *
 *  Phụ thuộc global: load/save (core.storage), crypto.randomUUID,
 *  x() (escape HTML — dùng khi render option).
 * ════════════════════════════════════════════════════════════════════════
 */

// Mảng khách hàng trong bộ nhớ — nguồn đọc runtime. Nạp từ IDB lúc khởi động.
let customers = [];

/**
 * Lưu mảng customers xuống store 'customers_v1' (qua save() → trigger sync).
 */
function _saveCustomers() {
  save('customers_v1', customers);
}

/**
 * Chuẩn hóa chuỗi để so khớp tên không phân biệt hoa/thường & dấu tiếng Việt.
 * VD: "Công Ty ABC" và "cong ty abc" coi như trùng nhau.
 * @param {string} s
 * @returns {string}
 */
function _normCustomerName(s) {
  return (s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')               // tách ký tự gốc + dấu
    .replace(/[̀-ͯ]/g, '') // bỏ dấu thanh/nguyên âm (combining marks)
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ');           // gộp khoảng trắng
}

/**
 * Lấy 1 khách hàng theo id (bỏ qua bản ghi đã xóa mềm).
 * @param {string} id
 * @returns {Object|null}
 */
function getCustomerById(id) {
  if (!id) return null;
  const c = customers.find(c => c.id === id && !c.deletedAt);
  return c || null;
}

/**
 * Tìm khách hàng theo tên (không phân biệt hoa/thường & dấu).
 * @param {string} name
 * @returns {Object|null}
 */
function findCustomerByName(name) {
  const key = _normCustomerName(name);
  if (!key) return null;
  return customers.find(c => !c.deletedAt && _normCustomerName(c.name) === key) || null;
}

/**
 * Trả về toàn bộ khách hàng còn sống, sắp theo tên (A→Z, locale vi).
 * @returns {Object[]}
 */
function getAllCustomers() {
  return customers
    .filter(c => !c.deletedAt)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
}

/**
 * Tạo khách hàng mới. Tên bắt buộc. Trả về bản ghi vừa tạo.
 * @param {Object} data { name, phone, email, address, taxCode, note }
 * @returns {Object}
 */
function createCustomer({ name, phone = '', email = '', address = '', taxCode = '', note = '' } = {}) {
  if (!name || !name.trim()) throw new Error('Tên khách hàng không được để trống');
  const now = Date.now();
  const customer = {
    id:        crypto.randomUUID(),
    name:      name.trim(),
    phone:     (phone || '').trim(),
    email:     (email || '').trim(),
    address:   (address || '').trim(),
    taxCode:   (taxCode || '').trim(),
    note:      (note || '').trim(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  };
  customers.push(customer);
  _saveCustomers();
  return customer;
}

/**
 * Cập nhật khách hàng. Bỏ qua id/createdAt; luôn cập nhật updatedAt.
 * @param {string} id
 * @param {Object} changes
 * @returns {Object|null}
 */
function updateCustomer(id, changes = {}) {
  const idx = customers.findIndex(c => c.id === id);
  if (idx < 0) return null;
  const { createdAt } = customers[idx];
  const { id: _id, createdAt: _ca, updatedAt: _ua, ...safe } = changes;
  // Trim các trường chuỗi nếu có
  ['name', 'phone', 'email', 'address', 'taxCode', 'note'].forEach(f => {
    if (typeof safe[f] === 'string') safe[f] = safe[f].trim();
  });
  customers[idx] = {
    ...customers[idx],
    ...safe,
    id,
    createdAt,
    updatedAt: Date.now()
  };
  _saveCustomers();
  return customers[idx];
}

/**
 * Xóa mềm khách hàng (đặt deletedAt). Không xóa liên kết trên project.
 * @param {string} id
 * @returns {boolean}
 */
function deleteCustomer(id) {
  const idx = customers.findIndex(c => c.id === id);
  if (idx < 0) return false;
  customers[idx].deletedAt = Date.now();
  customers[idx].updatedAt = Date.now();
  _saveCustomers();
  return true;
}

/**
 * Lấy KH theo tên, tạo mới nếu chưa có. Dùng khi user gõ tên CĐT tự do.
 * @param {string} name
 * @returns {Object|null}  null nếu name rỗng
 */
function getOrCreateCustomerByName(name) {
  const nm = (name || '').trim();
  if (!nm) return null;
  return findCustomerByName(nm) || createCustomer({ name: nm });
}

/**
 * Render danh sách <option> cho dropdown chọn khách hàng.
 * Có option rỗng đầu tiên + đánh dấu selected theo selectedId.
 * @param {string|null} selectedId
 * @returns {string} chuỗi HTML các <option>
 */
function getCustomerOptions(selectedId = null) {
  const esc = (typeof x === 'function') ? x : (s => s);
  let html = `<option value="">— Chọn khách hàng —</option>`;
  getAllCustomers().forEach(c => {
    const sel = c.id === selectedId ? ' selected' : '';
    const phone = c.phone ? ` (${esc(c.phone)})` : '';
    html += `<option value="${esc(c.id)}"${sel}>${esc(c.name)}${phone}</option>`;
  });
  return html;
}

/**
 * Backfill: với mỗi công trình có chuDauTu nhưng chưa có customerId,
 * tìm (hoặc tạo) khách hàng tương ứng rồi gán project.customerId.
 * Chạy 1 lần lúc khởi động — idempotent (đã có customerId thì bỏ qua).
 */
function _migrateCustomersFromProjects() {
  if (typeof projects === 'undefined' || !Array.isArray(projects)) return;
  let changedProjects = false;
  projects.forEach(p => {
    if (p.deletedAt) return;
    if (p.customerId) return;            // đã liên kết → bỏ qua
    const nm = (p.chuDauTu || '').trim();
    if (!nm) return;                     // không có tên CĐT → bỏ qua
    const cust = getOrCreateCustomerByName(nm);
    if (cust) {
      p.customerId = cust.id;
      p.updatedAt = Date.now();
      changedProjects = true;
    }
  });
  // Lưu projects nếu có gán customerId mới (dùng _memSet nếu có để tránh
  // nổ pending counter lúc khởi động; fallback save()).
  if (changedProjects) {
    if (typeof _memSet === 'function') _memSet('projects_v1', projects);
    else if (typeof save === 'function') save('projects_v1', projects);
  }
}
