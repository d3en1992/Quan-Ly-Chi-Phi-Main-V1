// danhmuc.project-clear.js — Xóa dữ liệu theo công trình và hạng mục
// Load order: sau danhmuc.tools.js
// Kiến trúc: classic script, global scope — KHÔNG dùng import/export

// ══════════════════════════════════════════════════════════════
// [CẤU HÌNH] Danh sách hạng mục có thể xóa theo công trình
// Thêm hạng mục mới vào đây là đủ — không cần sửa code xử lý
// ══════════════════════════════════════════════════════════════

// Hàm xác định loại nguồn của hóa đơn (tái dùng logic list-trash, tự cung tự cấp)
function _prcInvSource(r) {
  // Ưu tiên kiểm tra CC trước (ccKey là dấu hiệu chắc chắn nhất)
  if (r.source === 'cc' || !!r.ccKey) return 'cc';
  if (r.source === 'detail')           return 'detail';
  if (r.source === 'quick' || r.source === 'manual') return 'quick';
  // Backward compat: data cũ không có source → suy từ items
  if (r.items && r.items.length > 0)   return 'detail';
  return 'quick'; // mặc định cho data rất cũ
}

// Kiểm tra record có thuộc công trình (theo projectId mới hoặc tên CT legacy) không
function _prcBelongs(r, projectId, projectName) {
  if (!r || r.deletedAt) return false; // bỏ qua record đã xóa mềm
  if (r.projectId) return r.projectId === projectId;
  // Legacy: không có projectId → so tên CT trong trường ct/congtrinh
  const rCt = (r.ct || r.congtrinh || '').trim();
  return !!(projectName && rCt === projectName);
}

// Định nghĩa từng hạng mục — mỗi entry gồm:
//   id       : mã định danh duy nhất (dùng làm value của checkbox)
//   key      : storage key (inv_v3, ung_v1, ...)
//   group    : nhóm hiển thị trên UI
//   label    : tên hiển thị
//   isObject : true nếu storage là object (hopdong_v1), false/undefined nếu là array
//   filter   : hàm lọc record thuộc nhóm này (chỉ dùng với array)
const PROJECT_CLEAR_DEFS = [
  // ── Nhóm Hóa đơn (inv_v3) ─────────────────────────────────
  {
    id: 'inv_quick',
    key: 'inv_v3',
    group: '<span class="material-symbols-outlined msi-gap">description</span>Hóa đơn',
    label: 'HĐ Nhập nhanh',
    // Khớp: thuộc CT này VÀ source là quick (không phải detail, không phải CC)
    filter: (r, pid, pname) =>
      _prcBelongs(r, pid, pname) && _prcInvSource(r) === 'quick',
  },
  {
    id: 'inv_detail',
    key: 'inv_v3',
    group: '<span class="material-symbols-outlined msi-gap">description</span>Hóa đơn',
    label: 'HĐ Chi tiết',
    filter: (r, pid, pname) =>
      _prcBelongs(r, pid, pname) && _prcInvSource(r) === 'detail',
  },
  {
    id: 'inv_cc',
    key: 'inv_v3',
    group: '<span class="material-symbols-outlined msi-gap">description</span>Hóa đơn',
    label: 'HĐ từ Chấm công',
    // Hóa đơn tự sinh từ module Chấm Công — xóa riêng, không ảnh hưởng bảng CC gốc
    filter: (r, pid, pname) =>
      _prcBelongs(r, pid, pname) && _prcInvSource(r) === 'cc',
  },

  // ── Nhóm Tiền ứng (ung_v1) ────────────────────────────────
  {
    id: 'ung_tp',
    key: 'ung_v1',
    group: '<span class="material-symbols-outlined msi-gap">payments</span>Tiền ứng',
    label: 'Ứng Thầu phụ',
    // loai='thauphu' hoặc không có loai (data cũ mặc định là thầu phụ)
    filter: (r, pid, pname) =>
      _prcBelongs(r, pid, pname) && (r.loai === 'thauphu' || !r.loai),
  },
  {
    id: 'ung_ncc',
    key: 'ung_v1',
    group: '<span class="material-symbols-outlined msi-gap">payments</span>Tiền ứng',
    label: 'Ứng Nhà cung cấp',
    filter: (r, pid, pname) =>
      _prcBelongs(r, pid, pname) && r.loai === 'nhacungcap',
  },

  // ── Nhóm Thiết bị (tb_v1) ─────────────────────────────────
  {
    id: 'tb',
    key: 'tb_v1',
    group: '<span class="material-symbols-outlined msi-gap">handyman</span>Thiết bị',
    label: 'Theo dõi thiết bị',
    filter: (r, pid, pname) => _prcBelongs(r, pid, pname),
  },

  // ── Nhóm Chấm công (cc_v2) ────────────────────────────────
  {
    id: 'cc',
    key: 'cc_v2',
    group: '<span class="material-symbols-outlined msi-gap">calendar_month</span>Chấm công',
    label: 'Bảng chấm công',
    filter: (r, pid, pname) => _prcBelongs(r, pid, pname),
  },

  // ── Nhóm Hợp đồng ─────────────────────────────────────────
  {
    id: 'hopdong',
    key: 'hopdong_v1',
    group: '<span class="material-symbols-outlined msi-gap">article</span>Hợp đồng',
    label: 'Hợp đồng chính',
    // hopdong_v1 là object { [projectId]: {...} } — cần xử lý đặc biệt
    isObject: true,
  },
  {
    id: 'thauphu',
    key: 'thauphu_v1',
    group: '<span class="material-symbols-outlined msi-gap">article</span>Hợp đồng',
    label: 'HĐ Thầu phụ',
    filter: (r, pid, pname) => _prcBelongs(r, pid, pname),
  },

  // ── Nhóm Thu tiền (thu_v1) ────────────────────────────────
  {
    id: 'thu',
    key: 'thu_v1',
    group: '<span class="material-symbols-outlined msi-gap">attach_money</span>Thu tiền',
    label: 'Phiếu thu tiền',
    filter: (r, pid, pname) => _prcBelongs(r, pid, pname),
  },
];


// ══════════════════════════════════════════════════════════════
// [HELPERS] Đếm & render
// ══════════════════════════════════════════════════════════════

// Đếm số record sẽ bị xóa cho một def cụ thể
function _prcCount(def, projectId, projectName) {
  if (def.isObject) {
    // hopdong_v1: kiểm tra có key này không (và chưa xóa mềm)
    const obj = load(def.key, {}) || {};
    const entry = obj[projectId] || obj[projectName]; // fallback tên CT (data cũ)
    return (entry && !entry.deletedAt) ? 1 : 0;
  }
  const arr = load(def.key, []) || [];
  if (!Array.isArray(arr)) return 0;
  return arr.filter(r => def.filter(r, projectId, projectName)).length;
}


// ══════════════════════════════════════════════════════════════
// [UI] Mở / đóng modal
// ══════════════════════════════════════════════════════════════

function openProjectClearModal() {
  // Tạo modal lần đầu nếu chưa có
  let modal = document.getElementById('project-clear-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'project-clear-modal';
    // Overlay nền mờ, căn giữa, cuộn được
    modal.style.cssText = [
      'display:none',
      'position:fixed;inset:0',
      'background:rgba(0,0,0,.55)',
      'z-index:99990',
      'align-items:flex-start;justify-content:center',
      'overflow-y:auto;padding:20px 0',
    ].join(';');
    modal.innerHTML = `
      <div onclick="event.stopPropagation()"
           style="max-width:500px;width:94vw;background:var(--bs-body-bg,#fff);
                  border-radius:14px;padding:24px;margin:auto;
                  box-shadow:0 16px 56px rgba(0,0,0,.25);font-family:inherit">

        <!-- Tiêu đề -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <h3 style="font-size:15px;font-weight:800;margin:0;color:var(--bs-danger)">
            🗑 Xóa dữ liệu theo công trình
          </h3>
          <button onclick="closeProjectClearModal()"
                  style="background:none;border:none;font-size:22px;cursor:pointer;
                         color:var(--bs-secondary-color);line-height:1">✕</button>
        </div>

        <!-- Bước 1: Chọn công trình -->
        <div style="margin-bottom:16px">
          <label style="font-size:11px;font-weight:700;color:var(--bs-secondary-color);
                        text-transform:uppercase;letter-spacing:.7px;margin-bottom:6px;display:block">
            Bước 1 — Chọn công trình
          </label>
          <select id="prc-project-select" class="form-select"
                  onchange="onPrcProjectChange(this.value)">
            <option value="">-- Chọn công trình --</option>
          </select>
        </div>

        <!-- Bước 2: Checkboxes hạng mục -->
        <div id="prc-categories-wrap" style="display:none;margin-bottom:16px">
          <label style="font-size:11px;font-weight:700;color:var(--bs-secondary-color);
                        text-transform:uppercase;letter-spacing:.7px;margin-bottom:10px;display:block">
            Bước 2 — Chọn hạng mục cần xóa
          </label>
          <div id="prc-categories-inner"></div>
        </div>

        <!-- Thống kê dự kiến xóa -->
        <div id="prc-stats" style="display:none;border-radius:8px;padding:10px 14px;
                                    font-size:12px;line-height:1.9;margin-bottom:14px;
                                    background:#f8d7da;border:1px solid #f5c6cb;color:#721c24"></div>

        <!-- Cảnh báo luôn hiện -->
        <div style="background:#fff3cd;border-radius:8px;padding:10px 14px;
                    font-size:12px;color:#664d03;line-height:1.7;margin-bottom:14px">
          <span class="material-symbols-outlined msi-gap">save</span>Hệ thống sẽ tạo bản sao lưu tự động trước khi xóa.<br>
          ☁️ Sau khi xóa sẽ đẩy lên cloud — mọi thiết bị đều bị ảnh hưởng.
        </div>

        <!-- Bước 3: Xác nhận bằng cách gõ tên công trình -->
        <div id="prc-confirm-wrap" style="display:none;margin-bottom:16px">
          <label style="font-size:11px;font-weight:700;color:var(--bs-danger);
                        text-transform:uppercase;letter-spacing:.7px;margin-bottom:6px;display:block">
            Bước 3 — Gõ chính xác tên công trình để xác nhận
          </label>
          <input id="prc-confirm-input" class="form-control"
                 placeholder="Nhập tên công trình..." oninput="onPrcConfirmInput()"
                 style="font-size:13px">
          <div id="prc-confirm-hint"
               style="font-size:11px;color:var(--bs-secondary-color);margin-top:4px"></div>
        </div>

        <!-- Nút hành động -->
        <div style="display:flex;gap:10px">
          <button onclick="closeProjectClearModal()"
                  class="btn btn-outline-secondary" style="flex:1;font-size:13px">
            Hủy
          </button>
          <button id="prc-delete-btn" onclick="doProjectClear()"
                  class="btn btn-danger" style="flex:2;font-weight:700;font-size:13px" disabled>
            🗑 Xóa dữ liệu đã chọn
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Reset toàn bộ trạng thái modal về ban đầu
  _prcReset();

  // Đổ danh sách công trình vào dropdown (chỉ CT chưa xóa)
  const sel = document.getElementById('prc-project-select');
  const projs = (typeof projects !== 'undefined' ? projects : [])
    .filter(p => !p.deletedAt && p.id)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));

  sel.innerHTML = '<option value="">-- Chọn công trình --</option>' +
    projs.map(p => `<option value="${p.id}">${x(p.name)}</option>`).join('');

  modal.style.display = 'flex';
}

function closeProjectClearModal() {
  const modal = document.getElementById('project-clear-modal');
  if (modal) modal.style.display = 'none';
}

// Reset UI về trạng thái ban đầu (ẩn bước 2, 3 và disable nút xóa)
function _prcReset() {
  const el = id => document.getElementById(id);
  if (el('prc-project-select')) el('prc-project-select').value = '';
  if (el('prc-categories-wrap')) el('prc-categories-wrap').style.display = 'none';
  if (el('prc-stats'))           el('prc-stats').style.display = 'none';
  if (el('prc-confirm-wrap'))    el('prc-confirm-wrap').style.display = 'none';
  if (el('prc-confirm-input'))   el('prc-confirm-input').value = '';
  if (el('prc-delete-btn'))      el('prc-delete-btn').disabled = true;
}


// ══════════════════════════════════════════════════════════════
// [EVENT] Khi chọn công trình → vẽ checkboxes + đếm record
// ══════════════════════════════════════════════════════════════

function onPrcProjectChange(projectId) {
  const cwrap = document.getElementById('prc-categories-wrap');
  const statsEl = document.getElementById('prc-stats');
  const confWrap = document.getElementById('prc-confirm-wrap');
  const btn = document.getElementById('prc-delete-btn');
  const confInp = document.getElementById('prc-confirm-input');

  if (!projectId) {
    // Ẩn bước 2, 3 khi bỏ chọn công trình
    if (cwrap) cwrap.style.display = 'none';
    if (statsEl) statsEl.style.display = 'none';
    if (confWrap) confWrap.style.display = 'none';
    if (btn) btn.disabled = true;
    return;
  }

  // Lấy tên công trình để filter legacy data (không có projectId)
  const project = (typeof projects !== 'undefined' ? projects : [])
    .find(p => p.id === projectId);
  const projectName = project ? project.name : '';

  // Nhóm các def theo nhãn group
  const groups = {};
  PROJECT_CLEAR_DEFS.forEach(def => {
    const cnt = _prcCount(def, projectId, projectName);
    if (!groups[def.group]) groups[def.group] = [];
    groups[def.group].push({ ...def, count: cnt });
  });

  // Render checkboxes — hạng mục có data thì nền đỏ nhạt, không có data thì xám
  const inner = document.getElementById('prc-categories-inner');
  inner.innerHTML = Object.entries(groups).map(([groupLabel, items]) => `
    <div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--bs-secondary-color);
                  text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">
        ${groupLabel}
      </div>
      ${items.map(def => {
        const hasData = def.count > 0;
        return `
          <label style="display:flex;align-items:center;gap:10px;padding:7px 12px;
                        border-radius:8px;cursor:${hasData ? 'pointer' : 'default'};
                        font-size:13px;margin-bottom:5px;user-select:none;
                        background:${hasData ? '#fde8e8' : 'var(--bs-tertiary-bg,#f8f9fa)'};
                        border:1px solid ${hasData ? '#f5c6cb' : 'transparent'}">
            <input type="checkbox" class="prc-checkbox form-check-input"
                   data-def-id="${def.id}" value="${def.id}"
                   ${!hasData ? 'disabled' : ''}
                   onchange="onPrcCheckboxChange()"
                   style="flex-shrink:0;width:16px;height:16px;margin:0">
            <span style="flex:1">${def.label}</span>
            <span style="font-size:11px;font-weight:700;
                         color:${hasData ? '#c0392b' : 'var(--bs-secondary-color)'}">
              ${hasData ? def.count + ' bản ghi' : '(trống)'}
            </span>
          </label>
        `;
      }).join('')}
    </div>
  `).join('');

  // Hiện bước 2, ẩn bước 3 (chờ tick checkbox)
  if (cwrap) cwrap.style.display = 'block';
  if (statsEl) statsEl.style.display = 'none';
  if (confWrap) confWrap.style.display = 'none';
  if (confInp) confInp.value = '';
  if (btn) btn.disabled = true;
}


// ══════════════════════════════════════════════════════════════
// [EVENT] Khi tick checkbox → cập nhật thống kê + hiện bước 3
// ══════════════════════════════════════════════════════════════

function onPrcCheckboxChange() {
  const projectId = (document.getElementById('prc-project-select') || {}).value || '';
  const project = (typeof projects !== 'undefined' ? projects : [])
    .find(p => p.id === projectId);
  const projectName = project ? project.name : '';

  const checked = [...document.querySelectorAll('.prc-checkbox:checked')]
    .map(el => el.value);

  const statsEl = document.getElementById('prc-stats');
  const confWrap = document.getElementById('prc-confirm-wrap');
  const confHint = document.getElementById('prc-confirm-hint');
  const confInp = document.getElementById('prc-confirm-input');
  const btn = document.getElementById('prc-delete-btn');

  if (!checked.length) {
    // Không có gì được chọn → ẩn thống kê và bước 3
    if (statsEl) statsEl.style.display = 'none';
    if (confWrap) confWrap.style.display = 'none';
    if (confInp) confInp.value = '';
    if (btn) btn.disabled = true;
    return;
  }

  // Tổng hợp danh sách sẽ xóa để hiển thị lên stats
  const lines = [];
  let totalCount = 0;
  checked.forEach(defId => {
    const def = PROJECT_CLEAR_DEFS.find(d => d.id === defId);
    if (!def) return;
    const cnt = _prcCount(def, projectId, projectName);
    lines.push(`• ${def.label}: <strong>${cnt} bản ghi</strong>`);
    totalCount += cnt;
  });

  if (statsEl) {
    statsEl.innerHTML = `<strong>Sẽ xóa vĩnh viễn ${totalCount} bản ghi:</strong><br>${lines.join('<br>')}`;
    statsEl.style.display = 'block';
  }

  // Hiện bước 3 xác nhận — yêu cầu gõ chính xác tên công trình
  if (confWrap) confWrap.style.display = 'block';
  if (confHint) confHint.textContent = `Tên cần gõ: "${projectName}"`;
  if (confInp) confInp.value = '';
  if (btn) btn.disabled = true; // chờ gõ đúng mới enable
}


// ══════════════════════════════════════════════════════════════
// [EVENT] Kiểm tra ô xác nhận — enable nút Xóa khi gõ đúng tên
// ══════════════════════════════════════════════════════════════

function onPrcConfirmInput() {
  const projectId = (document.getElementById('prc-project-select') || {}).value || '';
  const project = (typeof projects !== 'undefined' ? projects : [])
    .find(p => p.id === projectId);
  const projectName = project ? project.name : '';

  const confInp = document.getElementById('prc-confirm-input');
  const btn = document.getElementById('prc-delete-btn');
  const checked = [...document.querySelectorAll('.prc-checkbox:checked')];

  // Enable nút khi: gõ đúng tên VÀ có ít nhất 1 checkbox được tick
  const typed = (confInp ? confInp.value : '').trim();
  const isMatch = projectName && typed === projectName;
  if (btn) btn.disabled = !(isMatch && checked.length > 0);
}


// ══════════════════════════════════════════════════════════════
// [CORE] Thực hiện xóa sau khi xác nhận
// ══════════════════════════════════════════════════════════════

async function doProjectClear() {
  const projectId = (document.getElementById('prc-project-select') || {}).value || '';
  if (!projectId) return;

  const project = (typeof projects !== 'undefined' ? projects : [])
    .find(p => p.id === projectId);
  const projectName = project ? project.name : '';

  // Lấy danh sách def đã được tick
  const checkedIds = [...document.querySelectorAll('.prc-checkbox:checked')]
    .map(el => el.value);
  if (!checkedIds.length) return;

  // Vô hiệu hóa nút khi đang xử lý
  const btn = document.getElementById('prc-delete-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-symbols-outlined msi-gap">hourglass_top</span>Đang xóa...'; }

  try {
    // Bước 1: Tạo backup trước khi xóa (để khôi phục nếu nhỡ tay)
    await _snapshotNow('before-project-delete');

    // Bước 2: Gom các thay đổi theo storage key
    // Một key (ví dụ inv_v3) có thể bị nhiều def cùng sửa → gom lại để chỉ save() 1 lần
    const keyChanges = {}; // { storageKey → giá trị sau khi đã lọc/xóa }

    checkedIds.forEach(defId => {
      const def = PROJECT_CLEAR_DEFS.find(d => d.id === defId);
      if (!def) return;

      if (def.isObject) {
        // hopdong_v1: object keyed by projectId → xóa key tương ứng
        if (!keyChanges[def.key]) keyChanges[def.key] = { ...load(def.key, {}) };
        delete keyChanges[def.key][projectId];   // xóa key mới (UUID)
        if (projectName) delete keyChanges[def.key][projectName]; // xóa key cũ (tên CT)

      } else {
        // Array: lọc bỏ tất cả record khớp def.filter
        if (!keyChanges[def.key]) keyChanges[def.key] = [...(load(def.key, []) || [])];
        // Lọc ra: giữ lại record KHÔNG thuộc nhóm đang xóa
        keyChanges[def.key] = keyChanges[def.key].filter(
          r => !def.filter(r, projectId, projectName)
        );
      }
    });

    // Bước 3: Ghi toàn bộ thay đổi vào storage (IDB + _mem + pending sync)
    Object.entries(keyChanges).forEach(([key, val]) => {
      save(key, val);
    });

    // Bước 4: Reload globals và re-render tab hiện tại
    if (typeof _reloadGlobals === 'function') _reloadGlobals();
    if (typeof renderActiveTab === 'function') renderActiveTab();

    // Bước 5: Push lên cloud để đồng bộ sang mọi thiết bị
    if (typeof fbReady === 'function' && fbReady() && typeof pushChanges === 'function') {
      try {
        await pushChanges({ silent: false });
      } catch (e) {
        console.warn('[ProjectClear] Push cloud lỗi:', e);
        // Không block user — data đã xóa local, cloud sẽ sync khi có mạng
        toast('⚠️ Đã xóa local nhưng chưa đồng bộ cloud — nhấn Sync để thử lại', 'warning');
      }
    }

    closeProjectClearModal();
    toast(
      `✅ Đã xóa ${checkedIds.length} hạng mục của "${projectName}" và đồng bộ cloud`,
      'success'
    );

  } catch (e) {
    console.error('[ProjectClear] Lỗi:', e);
    toast('❌ Lỗi khi xóa: ' + (e.message || String(e)), 'error');
    // Phục hồi nút nếu lỗi
    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined msi-gap">delete</span>Xóa dữ liệu đã chọn'; }
  }
}
