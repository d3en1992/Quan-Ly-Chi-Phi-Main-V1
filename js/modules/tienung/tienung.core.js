// tienung.core.js — Tiền Ứng: global state & data migrations
// Load order: sau danhmuc.categories.js, projects.model.js

// ══════════════════════════════
//  GLOBAL STATE
// ══════════════════════════════
// ungRecords là global shared — nhapxuat.js, projects.js, doanhthu.js đọc/gán lại
let ungRecords = load('ung_v1', []);
let filteredUng = [];
let filteredUngTp = [];
let filteredUngNcc = [];
let ungPage = 1;
const UNG_TP_PG = 10;
let ungTpPage = 1;
let ungNccPage = 1;
let _editingUngId = null;

// ══════════════════════════════
//  MIGRATIONS (chạy khi file nạp)
// ══════════════════════════════

// Chuẩn hóa dữ liệu cũ: cancelled=true -> deletedAt
function _normalizeUngDeletedAt() {
  if (!(ungRecords || []).some(r => r && Object.prototype.hasOwnProperty.call(r, 'cancelled'))) return;
  let changed = false;
  ungRecords = ungRecords.map(r => {
    if (!r) return r;
    if (r.cancelled === true && !r.deletedAt) {
      changed = true;
      return { ...r, deletedAt: r.updatedAt || Date.now() };
    }
    if (Object.prototype.hasOwnProperty.call(r, 'cancelled')) {
      changed = true;
      const rec = { ...r };
      delete rec.cancelled;
      return rec;
    }
    return r;
  });
  if (changed) save('ung_v1', ungRecords);
}
_normalizeUngDeletedAt();

function _normalizeUngProjectIds() {
  if (!(ungRecords || []).some(r => !r.deletedAt && !r.projectId && r.congtrinh)) return;
  let changed = false;
  ungRecords.forEach(r => {
    if (r.deletedAt) return;
    if (!r.projectId && r.congtrinh) {
      const pid = _getProjectIdByName(r.congtrinh);
      if (pid) { r.projectId = pid; changed = true; }
    }
    if (r.projectId) {
      const pName = _getProjectNameById(r.projectId);
      if (pName && pName !== r.congtrinh) {
        r.congtrinh = pName;
        changed = true;
      }
    }
  });
  if (changed) save('ung_v1', ungRecords);
}
_normalizeUngProjectIds();

// Cleanup dữ liệu sai: loại tên NCC/CN nằm nhầm trong danh mục thầu phụ
cats.thauPhu = (cats.thauPhu || []).filter(name =>
  ungRecords.some(r => r.loai === 'thauphu' && r.tp === name)
  || !ungRecords.some(r => r.tp === name)
);

// ── Sub-tab navigation trong page-nhapung (giống ccGoSub của tab Chấm Công) ──
function ungGoSub(btn, id) {
  document.querySelectorAll('#page-nhapung .sub-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#page-nhapung .nav-link').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
  if (id === 'ung-sub-baocao') {
    // Refresh báo cáo khi vào subtab 2 — filterAndRenderUng tự build filter + render 2 bảng
    filterAndRenderUng();
  } else if (id === 'ung-sub-nhap') {
    // Refresh bảng phiếu ứng gần đây khi quay lại subtab 1 (dữ liệu có thể đã đổi)
    if (typeof renderUngMini === 'function') renderUngMini();
  }
}

// Chuyển về subtab Nhập (dùng cho nút Sửa ✏️ ở bảng báo cáo)
function ungShowSubNhap() {
  const b = document.getElementById('ung-sub-nhap-btn');
  if (b && !b.classList.contains('active')) ungGoSub(b, 'ung-sub-nhap');
}

// Chuyển sang subtab Báo Cáo (dùng cho _goTabWithCT từ tab Công Trình)
function ungShowSubBaoCao() {
  const b = document.getElementById('ung-sub-baocao-btn');
  if (b && !b.classList.contains('active')) ungGoSub(b, 'ung-sub-baocao');
}
