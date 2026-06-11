/**
 * ════════════════════════════════════════════════════════════════════════
 *  KHÁCH HÀNG — UI Quản Lý Danh Sách (CRUD)
 * ════════════════════════════════════════════════════════════════════════
 *  Dùng custom overlay #kh-modal (cùng pattern với ct-modal),
 *  không dùng Bootstrap Modal để tránh xung đột z-index.
 *
 *  Phụ thuộc: khachhang.model.js, showToast(), x() (escape HTML)
 * ════════════════════════════════════════════════════════════════════════
 */

// Trạng thái hiện tại của form đang mở: null | 'add' | 'edit'
let _khMode = null;
// ID đang sửa
let _khEditId = null;

// ─── Mở / Đóng overlay ───────────────────────────────────────────────────────

function openKhachHangModal() {
  _khMode   = null;
  _khEditId = null;
  _khRender();
  const ov = document.getElementById('kh-modal');
  if (ov) {
    ov.classList.add('open');
    document.body.classList.add('modal-open');
  }
}

function closeKhachHangModal() {
  const ov = document.getElementById('kh-modal');
  if (ov) {
    ov.classList.remove('open');
    document.body.classList.remove('modal-open');
  }
  _khMode   = null;
  _khEditId = null;
}

// ─── Render toàn bộ nội dung modal ───────────────────────────────────────────

function _khRender() {
  const body = document.getElementById('kh-modal-body');
  if (!body) return;

  const esc   = (typeof x === 'function') ? x : (s => (s || ''));
  const inpSt = 'width:100%;padding:5px 8px;border:1px solid var(--bs-border-color);border-radius:6px;font-size:13px;background:var(--bs-body-bg);color:var(--bs-body-color)';
  const lbSt  = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--bs-secondary-color);margin-bottom:3px;display:block';

  // ── Form thêm mới ──
  const addForm = (_khMode === 'add') ? `
    <div style="padding:14px 16px;border-bottom:1px solid var(--bs-border-color);background:var(--bs-body-bg)">
      <div style="font-weight:700;font-size:13px;margin-bottom:10px">➕ Thêm Khách Hàng Mới</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        <div>
          <label style="${lbSt}">Tên *</label>
          <input id="kh-inp-name" type="text" placeholder="Tên cá nhân / công ty..." autocomplete="off" style="${inpSt}">
        </div>
        <div>
          <label style="${lbSt}">SĐT</label>
          <input id="kh-inp-phone" type="text" placeholder="Số điện thoại..." autocomplete="off" style="${inpSt}">
        </div>
        <div>
          <label style="${lbSt}">Email</label>
          <input id="kh-inp-email" type="text" placeholder="Email..." autocomplete="off" style="${inpSt}">
        </div>
        <div>
          <label style="${lbSt}">Địa Chỉ</label>
          <input id="kh-inp-address" type="text" placeholder="Địa chỉ..." autocomplete="off" style="${inpSt}">
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" onclick="_khSaveAdd()">💾 Lưu</button>
        <button class="btn btn-outline-secondary btn-sm" onclick="_khCancelForm()">Hủy</button>
      </div>
    </div>` : '';

  // ── Form sửa ──
  const editCust = _khEditId ? (typeof getCustomerById === 'function' ? getCustomerById(_khEditId) : null) : null;
  const editForm = (_khMode === 'edit' && editCust) ? `
    <div style="padding:14px 16px;border-bottom:1px solid var(--bs-border-color);background:var(--bs-tertiary-bg)">
      <div style="font-weight:700;font-size:13px;margin-bottom:10px">✏️ Sửa Thông Tin Khách Hàng</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        <div>
          <label style="${lbSt}">Tên *</label>
          <input id="kh-inp-name" type="text" value="${esc(editCust.name)}" autocomplete="off" style="${inpSt}">
        </div>
        <div>
          <label style="${lbSt}">SĐT</label>
          <input id="kh-inp-phone" type="text" value="${esc(editCust.phone || '')}" autocomplete="off" style="${inpSt}">
        </div>
        <div>
          <label style="${lbSt}">Email</label>
          <input id="kh-inp-email" type="text" value="${esc(editCust.email || '')}" autocomplete="off" style="${inpSt}">
        </div>
        <div>
          <label style="${lbSt}">Địa Chỉ</label>
          <input id="kh-inp-address" type="text" value="${esc(editCust.address || '')}" autocomplete="off" style="${inpSt}">
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" onclick="_khSaveEdit()">💾 Lưu thay đổi</button>
        <button class="btn btn-outline-secondary btn-sm" onclick="_khCancelForm()">Hủy</button>
      </div>
    </div>` : '';

  // ── Danh sách ──
  const custs = (typeof getAllCustomers === 'function') ? getAllCustomers() : [];
  const listHtml = custs.length === 0
    ? `<div class="text-secondary text-center p-4" style="font-size:13px">
        Chưa có khách hàng nào. Nhấn <strong>➕ Thêm Khách Hàng</strong> bên dưới.
       </div>`
    : `<div style="overflow-x:auto">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th style="min-width:160px">Tên</th>
              <th style="min-width:110px">SĐT</th>
              <th style="min-width:150px">Email</th>
              <th style="min-width:130px">Địa Chỉ</th>
              <th style="width:76px"></th>
            </tr>
          </thead>
          <tbody>
            ${custs.map(c => `
              <tr style="${_khEditId === c.id ? 'background:var(--bs-primary-bg-subtle)' : ''}">
                <td><strong>${esc(c.name)}</strong></td>
                <td style="font-size:12px">${esc(c.phone || '—')}</td>
                <td style="font-size:12px">${esc(c.email || '—')}</td>
                <td style="font-size:12px">${esc(c.address || '—')}</td>
                <td style="text-align:right;white-space:nowrap">
                  <button class="btn btn-outline-secondary btn-sm me-1" title="Sửa"
                    onclick="_khOpenEdit('${esc(c.id)}')">✏️</button>
                  <button class="btn btn-outline-danger btn-sm" title="Xóa"
                    onclick="_khDelete('${esc(c.id)}')">🗑</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
       </div>`;

  body.innerHTML = addForm + editForm + listHtml;

  // Focus vào ô tên nếu đang mở form
  if (_khMode) setTimeout(() => document.getElementById('kh-inp-name')?.focus(), 60);
}

// ─── Actions ─────────────────────────────────────────────────────────────────

function _khShowAddForm() {
  _khMode   = 'add';
  _khEditId = null;
  _khRender();
}

function _khOpenEdit(id) {
  _khMode   = 'edit';
  _khEditId = id;
  _khRender();
}

function _khCancelForm() {
  _khMode   = null;
  _khEditId = null;
  _khRender();
}

function _khSaveAdd() {
  const name = (document.getElementById('kh-inp-name')?.value || '').trim();
  if (!name) { alert('Tên khách hàng không được để trống!'); return; }
  if (typeof createCustomer !== 'function') return;
  createCustomer({
    name,
    phone:   (document.getElementById('kh-inp-phone')?.value   || '').trim(),
    email:   (document.getElementById('kh-inp-email')?.value   || '').trim(),
    address: (document.getElementById('kh-inp-address')?.value || '').trim()
  });
  _khMode   = null;
  _khEditId = null;
  _khRender();
  if (typeof showToast   === 'function') showToast('Đã thêm khách hàng mới');
  if (typeof schedulePush === 'function') schedulePush();
}

function _khSaveEdit() {
  if (!_khEditId) return;
  const name = (document.getElementById('kh-inp-name')?.value || '').trim();
  if (!name) { alert('Tên khách hàng không được để trống!'); return; }
  if (typeof updateCustomer !== 'function') return;
  updateCustomer(_khEditId, {
    name,
    phone:   (document.getElementById('kh-inp-phone')?.value   || '').trim(),
    email:   (document.getElementById('kh-inp-email')?.value   || '').trim(),
    address: (document.getElementById('kh-inp-address')?.value || '').trim()
  });
  _khMode   = null;
  _khEditId = null;
  _khRender();
  if (typeof showToast   === 'function') showToast('Đã lưu thông tin khách hàng');
  if (typeof schedulePush === 'function') schedulePush();
}

function _khDelete(id) {
  const c = (typeof getCustomerById === 'function') ? getCustomerById(id) : null;
  if (!c) return;
  if (!confirm(`Xóa khách hàng "${c.name}"?\nCác công trình liên kết sẽ không bị ảnh hưởng.`)) return;
  if (typeof deleteCustomer === 'function') deleteCustomer(id);
  if (_khEditId === id) { _khMode = null; _khEditId = null; }
  _khRender();
  if (typeof showToast   === 'function') showToast('Đã xóa khách hàng');
  if (typeof schedulePush === 'function') schedulePush();
}

// Alias để nút footer gọi (không cần tham số)
function _khHideAddForm()  { _khCancelForm(); }
function _khHideEditForm() { _khCancelForm(); }
