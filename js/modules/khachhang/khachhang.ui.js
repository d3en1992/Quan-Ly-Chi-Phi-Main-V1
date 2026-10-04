/**
 * ════════════════════════════════════════════════════════════════════════
 *  KHÁCH HÀNG — UI "Hồ Sơ Khách Hàng" (danh sách + hồ sơ chi tiết + CRUD)
 * ════════════════════════════════════════════════════════════════════════
 *  Dùng custom overlay #kh-modal (cùng pattern với ct-modal),
 *  không dùng Bootstrap Modal để tránh xung đột z-index.
 *
 *  (04/10/2026) Nâng cấp từ "Quản Lý Khách Hàng":
 *   • Bỏ hẳn trường Email (bảng + form).
 *   • Phân quyền SĐT (khCanSeePhone — khachhang.model.js): admin/giám đốc xem + sửa;
 *     kế toán thấy "Chỉ admin được xem", ô SĐT bị khóa, lưu KHÔNG ghi đè SĐT cũ.
 *   • Bấm TÊN khách hàng → HỒ SƠ: thông tin liên hệ · Tổng giá trị khách hàng (doanh thu /
 *     chi phí / lợi nhuận cộng dồn mọi công trình — công thức tab Lợi Nhuận, theo năm đang lọc;
 *     ẩn với kế toán giống tab Lợi Nhuận) · Lịch sử công trình dạng dòng thời gian.
 *   • Mở hồ sơ trực tiếp từ nơi khác: openKhachHangProfile(id) (tab Công Trình: nhóm theo
 *     khách hàng, dòng "CĐT" trong chi tiết công trình).
 *
 *  Phụ thuộc: khachhang.model.js, toast()/showToast(), x() (escape HTML),
 *             lnTinhCongTrinh/_lnContext (doanhthu.reports-export.js), _ctCategoryInfo,
 *             _ptStatusBadge (projects.ui.js) — đều gọi lúc render nên an toàn thứ tự nạp.
 * ════════════════════════════════════════════════════════════════════════
 */

// Trạng thái màn hình đang mở: null (danh sách) | 'add' | 'edit' | 'profile'
let _khMode = null;
// ID khách hàng đang sửa
let _khEditId = null;
// ID khách hàng đang xem hồ sơ (giữ để Sửa xong quay lại đúng hồ sơ)
let _khProfileId = null;
// Ô tìm kiếm danh sách
let _khSearch = '';

// ─── Mở / Đóng overlay ───────────────────────────────────────────────────────

function openKhachHangModal() {
  _khMode      = null;
  _khEditId    = null;
  _khProfileId = null;
  _khRender();
  _khShowOverlay();
}

// Mở thẳng HỒ SƠ 1 khách hàng (gọi từ tab Công Trình)
function openKhachHangProfile(id) {
  if (typeof getCustomerById !== 'function' || !getCustomerById(id)) {
    toast('Không tìm thấy khách hàng', 'error');
    return;
  }
  _khMode      = 'profile';
  _khEditId    = null;
  _khProfileId = id;
  _khRender();
  _khShowOverlay();
}

function _khShowOverlay() {
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
    // ct-modal còn mở bên dưới (mở hồ sơ từ chi tiết công trình) → giữ khóa cuộn nền
    if (!document.getElementById('ct-modal')?.classList.contains('open')) {
      document.body.classList.remove('modal-open');
    }
  }
  _khMode      = null;
  _khEditId    = null;
  _khProfileId = null;
}

// ─── Helper hiển thị ─────────────────────────────────────────────────────────

const _KH_INP = 'width:100%;padding:6px 9px;border:1px solid var(--bs-border-color);border-radius:6px;font-size:13px;background:var(--bs-body-bg);color:var(--bs-body-color)';
const _KH_LB  = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--bs-secondary-color);margin-bottom:3px;display:block';

function _khEsc(s) { return (typeof x === 'function') ? x(s) : (s || ''); }

// Ô SĐT trong bảng / hồ sơ theo quyền
function _khPhoneText(c) {
  if (!c.phone) return '<span class="text-secondary">—</span>';
  if (!khCanSeePhone()) return '<span class="text-secondary fst-italic" style="font-size:11.5px" title="Chỉ Quản trị viên / Giám đốc được xem số điện thoại"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:-3px">lock</span> Chỉ admin được xem</span>';
  return _khEsc(c.phone);
}

// Ô nhập SĐT trong form theo quyền (kế toán: khóa, không lộ số cũ)
function _khPhoneInput(value) {
  if (!khCanSeePhone()) {
    return `<input id="kh-inp-phone" type="text" disabled placeholder="Chỉ admin được xem / sửa" style="${_KH_INP};background:var(--bs-tertiary-bg);cursor:not-allowed">`;
  }
  return `<input id="kh-inp-phone" type="text" value="${_khEsc(value || '')}" placeholder="Số điện thoại..." autocomplete="off" inputmode="tel" style="${_KH_INP}">`;
}

// Form Thêm / Sửa (dùng chung) — c = khách đang sửa (null khi thêm mới)
function _khFormHtml(c) {
  const isEdit = !!c;
  return `
    <div style="padding:14px 16px;border-bottom:1px solid var(--bs-border-color);background:${isEdit ? 'var(--bs-tertiary-bg)' : 'var(--bs-body-bg)'}">
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
        <div style="font-weight:700;font-size:13px"><span class="material-symbols-outlined msi-gap">${isEdit ? 'edit' : 'person_add'}</span>${isEdit ? 'Sửa Thông Tin Khách Hàng' : 'Thêm Khách Hàng Mới'}</div>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-secondary btn-sm" onclick="_khCancelForm()">Hủy</button>
          <button class="btn btn-primary btn-sm fw-bold" onclick="${isEdit ? '_khSaveEdit()' : '_khSaveAdd()'}"><span class="material-symbols-outlined msi-gap">save</span>${isEdit ? 'Lưu thay đổi' : 'Lưu'}</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px">
        <div>
          <label style="${_KH_LB}">Tên *</label>
          <input id="kh-inp-name" type="text" value="${isEdit ? _khEsc(c.name) : ''}" placeholder="Tên cá nhân / công ty..." autocomplete="off" style="${_KH_INP}">
        </div>
        <div>
          <label style="${_KH_LB}">SĐT</label>
          ${_khPhoneInput(isEdit ? c.phone : '')}
        </div>
        <div style="grid-column:1/-1">
          <label style="${_KH_LB}">Địa Chỉ</label>
          <input id="kh-inp-address" type="text" value="${isEdit ? _khEsc(c.address || '') : ''}" placeholder="Địa chỉ (tự điền vào công trình mới của khách này)..." autocomplete="off" style="${_KH_INP}">
        </div>
      </div>
    </div>`;
}

// ─── Render toàn bộ nội dung modal ───────────────────────────────────────────

function _khRender() {
  const body = document.getElementById('kh-modal-body');
  if (!body) return;

  if (_khMode === 'profile' && _khProfileId) {
    body.innerHTML = _khProfileHtml(_khProfileId);
    return;
  }

  const editCust = (_khMode === 'edit' && _khEditId) ? getCustomerById(_khEditId) : null;
  const formHtml = _khMode === 'add' ? _khFormHtml(null) : (editCust ? _khFormHtml(editCust) : '');

  // ── Danh sách (tìm theo tên / địa chỉ) ──
  const q = (_khSearch || '').trim().toLowerCase();
  const all = getAllCustomers();
  const custs = q
    ? all.filter(c => (c.name || '').toLowerCase().includes(q) || (c.address || '').toLowerCase().includes(q))
    : all;

  const searchBar = `
    <div style="padding:10px 16px;border-bottom:1px solid var(--bs-border-color)" class="d-flex align-items-center gap-2 flex-wrap">
      <input id="kh-search" type="search" class="form-control form-control-sm" style="max-width:280px" placeholder="🔍 Tìm khách hàng, địa chỉ..." value="${_khEsc(_khSearch)}" oninput="_khOnSearch(this.value)">
      <span class="text-secondary ms-auto" style="font-size:12px">${all.length} khách hàng · Bấm vào tên để xem hồ sơ</span>
    </div>`;

  const listHtml = custs.length === 0
    ? `<div class="text-secondary text-center p-4" style="font-size:13px">
        ${q ? 'Không có khách hàng nào khớp tìm kiếm.' : 'Chưa có khách hàng nào. Nhấn <strong>Thêm Khách Hàng</strong> bên dưới.'}
       </div>`
    : `<div style="overflow-x:auto">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead class="table-light">
            <tr style="font-size:11px">
              <th style="min-width:180px">Tên</th>
              <th style="min-width:130px">SĐT</th>
              <th style="min-width:180px">Địa Chỉ</th>
              <th class="text-center" style="width:90px">Công trình</th>
              <th style="width:80px"></th>
            </tr>
          </thead>
          <tbody>
            ${custs.map(c => {
              const n = getProjectsOfCustomer(c.id).length;
              return `
              <tr style="${_khEditId === c.id ? 'background:var(--bs-primary-bg-subtle)' : ''}">
                <td><a href="#" class="fw-bold text-decoration-none" onclick="event.preventDefault();_khOpenProfile('${_khEsc(c.id)}')" title="Xem hồ sơ khách hàng">${_khEsc(c.name)}</a></td>
                <td style="font-size:12px">${_khPhoneText(c)}</td>
                <td style="font-size:12px">${_khEsc(c.address || '—')}</td>
                <td class="text-center"><span class="badge rounded-pill ${n ? 'bg-primary-subtle text-primary-emphasis' : 'bg-body-secondary text-secondary'}">${n}</span></td>
                <td style="text-align:right;white-space:nowrap">
                  <button class="btn btn-outline-secondary btn-sm me-1" title="Sửa"
                    onclick="_khOpenEdit('${_khEsc(c.id)}')"><span class="material-symbols-outlined">edit</span></button>
                  <button class="btn btn-outline-danger btn-sm" title="Xóa"
                    onclick="_khDelete('${_khEsc(c.id)}')"><span class="material-symbols-outlined">delete</span></button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
       </div>`;

  body.innerHTML = formHtml + searchBar + listHtml;

  // Focus vào ô tên nếu đang mở form
  if (_khMode === 'add' || _khMode === 'edit') setTimeout(() => document.getElementById('kh-inp-name')?.focus(), 60);
}

function _khOnSearch(val) {
  _khSearch = val || '';
  _khRender();
  // Giữ con trỏ trong ô tìm kiếm sau khi vẽ lại
  const el = document.getElementById('kh-search');
  if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
}

// ─── HỒ SƠ KHÁCH HÀNG ────────────────────────────────────────────────────────

// Mã loại công trình từ tên (CT / SC / SN ...) — dùng chung quy ước tab Công Trình
function _khTypeCode(p) {
  if (typeof _ctCategoryInfo === 'function') return _ctCategoryInfo(p.name).code || '';
  return (p.name || '').slice(0, 2).toUpperCase();
}

function _khProfileHtml(id) {
  const c = getCustomerById(id);
  if (!c) return '<div class="text-secondary text-center p-4">Không tìm thấy khách hàng.</div>';
  const projs = getProjectsOfCustomer(id);
  const xemTien = !(typeof isKetoan === 'function' && isKetoan());   // kế toán không xem doanh thu/lợi nhuận (giống tab Lợi Nhuận)

  // ── Số liệu từng công trình (công thức tab Lợi Nhuận, theo năm đang lọc) ──
  const coTinh = xemTien && typeof lnTinhCongTrinh === 'function';
  const ctx = coTinh && typeof _lnContext === 'function' ? _lnContext() : null;
  const fig = new Map();
  if (coTinh) projs.forEach(p => fig.set(p.id, lnTinhCongTrinh(p, ctx)));
  const tDT  = [...fig.values()].reduce((s, r) => s + r.dt, 0);
  const tChi = [...fig.values()].reduce((s, r) => s + r.chi, 0);
  const tLN  = tDT - tChi;
  const namLabel = (typeof activeYear !== 'undefined' && activeYear > 0) ? `năm ${activeYear}` : 'tất cả các năm';

  const kpi = (lb, val, color, sub) => `
    <div style="flex:1;min-width:150px;background:var(--bs-tertiary-bg);border-radius:10px;padding:10px 12px">
      <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--bs-secondary-color)">${lb}</div>
      <div style="font-size:18px;font-weight:700;font-family:'IBM Plex Mono',monospace;color:${color}">${val}</div>
      ${sub ? `<div class="text-secondary" style="font-size:11px">${sub}</div>` : ''}
    </div>`;
  const ltvHtml = coTinh ? `
    <div class="d-flex gap-2 flex-wrap mb-1">
      ${kpi('Tổng doanh thu', fmtM(tDT), 'var(--bs-primary)', `${projs.length} công trình`)}
      ${kpi('Tổng chi phí', fmtM(tChi), 'var(--bs-danger)', '')}
      ${kpi('Tổng lợi nhuận', (tLN < 0 ? '−' : (tLN > 0 ? '+' : '')) + fmtM(Math.abs(tLN)), tLN >= 0 ? 'var(--bs-success)' : 'var(--bs-danger)', tDT > 0 ? `Biên lợi nhuận ${Math.round(tLN / tDT * 100)}%` : '')}
    </div>
    <div class="text-secondary mb-3" style="font-size:11px">Tổng giá trị khách hàng cộng dồn mọi công trình (CT + SC + SN) — cùng công thức tab Lợi Nhuận, theo <strong>${namLabel}</strong>. Chọn "Tất cả năm" để xem trọn đời.</div>`
    : '';

  // ── Lịch sử công trình (dòng thời gian, mới nhất lên đầu) ──
  const sorted = projs.slice().sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '') || (b.createdAt || 0) - (a.createdAt || 0));
  const _moc = (p) => {
    const sd = p.startDate || '';
    if (!/^\d{4}-\d{2}/.test(sd)) return p.createdYear ? `Năm ${p.createdYear}` : 'Chưa rõ ngày';
    return `Tháng ${parseInt(sd.slice(5, 7), 10)}/${sd.slice(0, 4)}`;
  };
  const timeline = sorted.length ? sorted.map(p => {
    const code = _khTypeCode(p);
    const disp = (typeof _ctCategoryInfo === 'function') ? _ctCategoryInfo(p.name).display : p.name;
    const f = fig.get(p.id);
    const money = f ? `<div class="text-end" style="font-size:11.5px;white-space:nowrap">
        <div class="text-secondary">DT <span class="font-monospace">${fmtS(f.dt)}</span></div>
        <div class="${f.ln >= 0 ? 'text-success' : 'text-danger'} fw-semibold">LN <span class="font-monospace">${f.ln < 0 ? '−' : '+'}${fmtS(Math.abs(f.ln))}</span></div>
      </div>` : '';
    return `
      <div class="kh-tl-item" onclick="_khOpenProject('${_khEsc(p.id)}')" title="Xem chi tiết công trình">
        <div class="kh-tl-dot"></div>
        <div style="flex:1;min-width:0">
          <div class="text-secondary" style="font-size:11px;font-weight:700">${_moc(p)}</div>
          <div style="font-weight:600;font-size:13px">
            ${code ? `<span class="badge bg-secondary-subtle text-secondary-emphasis me-1" style="font-size:10px">${_khEsc(code)}</span>` : ''}${_khEsc(disp)}
          </div>
          <div class="d-flex align-items-center gap-2 flex-wrap mt-1" style="font-size:11.5px">
            ${typeof _ptStatusBadge === 'function' ? _ptStatusBadge(p.status) : _khEsc(p.status)}
            ${p.note ? `<span class="text-secondary"><span class="material-symbols-outlined" style="font-size:13px;vertical-align:-2px">location_on</span>${_khEsc(p.note)}</span>` : ''}
          </div>
        </div>
        ${money}
      </div>`;
  }).join('') : `<div class="text-secondary text-center py-3" style="font-size:12px">Khách hàng chưa có công trình nào.
      <button class="btn btn-link btn-sm p-0 ms-1 align-baseline" onclick="_khAddProject('${_khEsc(c.id)}')">+ Thêm công trình đầu tiên</button></div>`;

  return `
    <style>
      .kh-tl{position:relative;padding-left:6px}
      .kh-tl-item{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border-radius:8px;cursor:pointer;position:relative}
      .kh-tl-item:hover{background:var(--bs-tertiary-bg)}
      .kh-tl-dot{width:10px;height:10px;border-radius:50%;background:var(--bs-primary);margin-top:5px;flex-shrink:0;box-shadow:0 0 0 3px var(--bs-primary-bg-subtle)}
    </style>
    <div style="padding:12px 16px;border-bottom:1px solid var(--bs-border-color)" class="d-flex align-items-start justify-content-between flex-wrap gap-2">
      <div>
        <button class="btn btn-link btn-sm p-0 mb-1 text-decoration-none" onclick="_khBackToList()"><span class="material-symbols-outlined msi-gap">arrow_back</span>Danh sách khách hàng</button>
        <div style="font-size:18px;font-weight:700">${_khEsc(c.name)}</div>
        <div class="text-secondary d-flex flex-wrap gap-3 mt-1" style="font-size:12.5px">
          <span><span class="material-symbols-outlined msi-gap">call</span>${_khPhoneText(c)}</span>
          <span><span class="material-symbols-outlined msi-gap">location_on</span>${_khEsc(c.address || 'Chưa có địa chỉ')}</span>
        </div>
      </div>
      <div class="d-flex gap-2 flex-wrap">
        <button class="btn btn-primary btn-sm fw-semibold" onclick="_khAddProject('${_khEsc(c.id)}')" title="Tạo công trình mới cho khách hàng này"><span class="material-symbols-outlined msi-gap">add</span>Thêm Công Trình</button>
        <button class="btn btn-outline-secondary btn-sm" onclick="_khOpenEdit('${_khEsc(c.id)}')"><span class="material-symbols-outlined msi-gap">edit</span>Sửa</button>
        <button class="btn btn-outline-danger btn-sm" onclick="_khDelete('${_khEsc(c.id)}')"><span class="material-symbols-outlined msi-gap">delete</span>Xóa</button>
      </div>
    </div>
    <div style="padding:12px 16px">
      ${ltvHtml}
      <div class="fw-bold mb-1" style="font-size:13px"><span class="material-symbols-outlined msi-gap">history</span>Lịch Sử Công Trình <span class="text-secondary fw-normal" style="font-size:12px">(${projs.length})</span></div>
      <div class="kh-tl">${timeline}</div>
    </div>`;
}

// Nút "+ Thêm Công Trình" trong hồ sơ (04/10/2026) → đóng hồ sơ, mở form "Thêm Công Trình Mới"
// với Chủ đầu tư CHỌN SẴN = khách này. Địa chỉ công trình tự điền từ địa chỉ khách CHỈ KHI ô đang
// trống (form đang nhập dở thì giữ nguyên, chỉ hiện gợi ý) — xem _ctApplyCustAddress (projects.ui.js).
function _khAddProject(id) {
  closeKhachHangModal();
  if (typeof openCTCreateModal === 'function') openCTCreateModal({ customerId: id });
}

// Bấm 1 công trình trong hồ sơ → đóng hồ sơ, mở chi tiết công trình
function _khOpenProject(pid) {
  closeKhachHangModal();
  if (typeof openCTDetail === 'function') openCTDetail(pid);
}

// ─── Actions ─────────────────────────────────────────────────────────────────

function _khShowAddForm() {
  _khMode      = 'add';
  _khEditId    = null;
  _khProfileId = null;
  _khRender();
}

function _khOpenEdit(id) {
  _khMode   = 'edit';
  _khEditId = id;
  _khRender();
}

function _khOpenProfile(id) {
  _khMode      = 'profile';
  _khEditId    = null;
  _khProfileId = id;
  _khRender();
}

function _khBackToList() {
  _khMode      = null;
  _khEditId    = null;
  _khProfileId = null;
  _khRender();
}

// Hủy / lưu xong: đang mở từ hồ sơ thì quay lại hồ sơ, không thì về danh sách
function _khCancelForm() {
  _khEditId = null;
  _khMode   = (_khProfileId && getCustomerById(_khProfileId)) ? 'profile' : null;
  _khRender();
}

function _khReadForm() {
  const out = {
    name:    (document.getElementById('kh-inp-name')?.value    || '').trim(),
    address: (document.getElementById('kh-inp-address')?.value || '').trim(),
  };
  // Kế toán: ô SĐT bị khóa → KHÔNG gửi phone (giữ nguyên số cũ)
  if (khCanSeePhone()) out.phone = (document.getElementById('kh-inp-phone')?.value || '').trim();
  return out;
}

function _khAfterChange(msg) {
  if (typeof showToast === 'function') showToast(msg);
  else if (typeof toast === 'function') toast(msg, 'success');
  if (typeof schedulePush === 'function') schedulePush();
  // Tab Công Trình đang nhóm theo khách hàng → vẽ lại tên nhóm
  if (typeof _ctRenderGrid === 'function') _ctRenderGrid();
}

function _khSaveAdd() {
  const f = _khReadForm();
  if (!f.name) { alert('Tên khách hàng không được để trống!'); return; }
  if (findCustomerByName(f.name) && !confirm(`Đã có khách hàng tên "${f.name}". Vẫn tạo thêm?`)) return;
  createCustomer(f);
  _khMode   = null;
  _khEditId = null;
  _khRender();
  _khAfterChange('Đã thêm khách hàng mới');
}

function _khSaveEdit() {
  if (!_khEditId) return;
  const f = _khReadForm();
  if (!f.name) { alert('Tên khách hàng không được để trống!'); return; }
  const old = getCustomerById(_khEditId);
  updateCustomer(_khEditId, f);
  // Đổi tên → cập nhật chuDauTu (tên hiển thị, tương thích ngược) trên các công trình liên kết
  if (old && old.name !== f.name && typeof projects !== 'undefined') {
    let changed = false;
    projects.forEach(p => {
      if (!p.deletedAt && p.customerId === _khEditId && p.chuDauTu !== f.name) {
        p.chuDauTu = f.name; p.updatedAt = Date.now(); changed = true;
      }
    });
    if (changed && typeof _saveProjects === 'function') _saveProjects();
  }
  _khCancelForm();
  _khAfterChange('Đã lưu thông tin khách hàng');
}

function _khDelete(id) {
  const c = getCustomerById(id);
  if (!c) return;
  const n = getProjectsOfCustomer(id).length;
  let msg = `Xóa khách hàng "${c.name}"?`;
  msg += n ? `\n\n${n} công trình đang gắn khách này sẽ chuyển thành "Chưa gán khách hàng" (dữ liệu công trình không mất). Khi sửa các công trình đó sẽ phải chọn lại Chủ đầu tư.`
           : '\nKhách hàng chưa có công trình nào.';
  if (!confirm(msg)) return;
  deleteCustomer(id);
  if (_khEditId === id) _khEditId = null;
  if (_khProfileId === id) _khProfileId = null;
  _khMode = null;
  _khRender();
  _khAfterChange('Đã xóa khách hàng');
}

// Alias để nút footer gọi (không cần tham số)
function _khHideAddForm()  { _khCancelForm(); }
function _khHideEditForm() { _khCancelForm(); }
