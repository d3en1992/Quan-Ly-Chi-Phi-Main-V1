// sync.v2meta.js — V2 Meta Pull Module
// Load order: sau sync.v2format.js, TRƯỚC sync.js
// Mục đích: Đọc meta data (projects, users, danh mục, hợp đồng) từ V2 subcollections
//           Thay thế đọc từ V1 "cats" document trong sync.js
//
// Phụ thuộc (từ sync.v2format.js):
//   _v2FsGetSubcollDocs, _v2FromFsFields, _v2ReverseApplyFieldMap
//   _V2_FIELD_MAPS, _V2_SUBCOLL_NAME, FS_BASE(), FB_CONFIG

'use strict';


// ══════════════════════════════════════════════════════════════
// [1] PULL META_CONG_TRINH → projects_v1
// ══════════════════════════════════════════════════════════════
// Trả về Array<project> hoặc null nếu subcollection chưa tồn tại

async function _v2PullProjects() {
  const docs = await _v2FsGetSubcollDocs('meta_cong_trinh', _V2_SUBCOLL_NAME);
  if (!docs.length) return null;
  return docs.map(doc =>
    _v2ReverseApplyFieldMap(_v2FromFsFields(doc.fields || {}), _V2_FIELD_MAPS.cong_trinh)
  );
}


// ══════════════════════════════════════════════════════════════
// [2] PULL META_TAI_KHOAN → users_v1 (KHÔNG có password)
// ══════════════════════════════════════════════════════════════
// V2 không lưu password (không có trong field map) — dùng _mergeUsersV2 để restore

async function _v2PullUsers() {
  const docs = await _v2FsGetSubcollDocs('meta_tai_khoan', _V2_SUBCOLL_NAME);
  if (!docs.length) return null;
  return docs.map(doc =>
    _v2ReverseApplyFieldMap(_v2FromFsFields(doc.fields || {}), _V2_FIELD_MAPS.tai_khoan)
  );
}

// Merge users từ V2 (không có password) với local (có password)
// Luôn restore password từ local — cloud không bao giờ lưu password
function _mergeUsersV2(localUsers, cloudUsers) {
  // Lưu password map từ local trước khi merge
  const pwMap = new Map();
  (localUsers || []).forEach(u => {
    const key = u.id || u.username;
    if (key && u.password) pwMap.set(key, u.password);
  });

  // Merge bình thường theo updatedAt (cloud có thể mới hơn về role/deletedAt)
  const merged = typeof _mergeUsersSafe === 'function'
    ? _mergeUsersSafe(localUsers, cloudUsers)
    : [...(localUsers || []), ...(cloudUsers || [])];

  // Restore password: record không có password → lấy từ local cache
  return merged.map(u => {
    const key   = u.id || u.username;
    const saved = key ? pwMap.get(key) : null;
    if (saved && !u.password) return { ...u, password: saved };
    return u;
  });
}


// ══════════════════════════════════════════════════════════════
// [3] PULL META_DANH_MUC → cat_items_v1 + cnRoles + ctYears
// ══════════════════════════════════════════════════════════════
// Đọc song song: subcollection (items) + parent doc (có cn_roles, ct_years)
// Trả về { catItems, cnRoles, ctYears } hoặc null nếu không có gì

async function _v2PullDanhMuc() {
  const [docs, parentRes] = await Promise.all([
    _v2FsGetSubcollDocs('meta_danh_muc', _V2_SUBCOLL_NAME),
    fetch(`${FS_BASE()}/meta_danh_muc?key=${FB_CONFIG.apiKey}`)
      .then(r => r.json())
      .catch(() => null),
  ]);

  if (!docs.length && (!parentRes || parentRes.error)) return null;

  // Rebuild cat_items_v1 từ subcollection
  const catItems = {};
  docs.forEach(doc => {
    const raw  = _v2FromFsFields(doc.fields || {});
    const loai = raw.loai_danh_muc;
    if (!loai) return;
    if (!catItems[loai]) catItems[loai] = [];
    catItems[loai].push({
      id:        raw.id,
      name:      raw.ten,
      updatedAt: raw.cap_nhat_luc,
    });
  });

  // Đọc cnRoles + ctYears từ parent document fields (được lưu lên khi push)
  let cnRoles = null, ctYears = null;
  if (parentRes && !parentRes.error && parentRes.fields) {
    const pf = _v2FromFsFields(parentRes.fields);
    if (pf.cn_roles && typeof pf.cn_roles === 'object' && !Array.isArray(pf.cn_roles))
      cnRoles = pf.cn_roles;
    if (pf.ct_years && typeof pf.ct_years === 'object' && !Array.isArray(pf.ct_years))
      ctYears = pf.ct_years;
  }

  const hasCatItems = Object.keys(catItems).length > 0;
  if (!hasCatItems && !cnRoles && !ctYears) return null;

  return { catItems: hasCatItems ? catItems : null, cnRoles, ctYears };
}


// ══════════════════════════════════════════════════════════════
// [4] PULL META_HOP_DONG → hopdong_v1 (object map) + thauphu_v1 (array)
// ══════════════════════════════════════════════════════════════
// Mỗi document trong subcollection có field phan_loai:
//   'hop_dong_chinh'   → thêm vào hopdong_v1 object, key = projectId || congtrinh
//   'hop_dong_thau_phu' → thêm vào thauphu_v1 array

async function _v2PullHopDong() {
  const docs = await _v2FsGetSubcollDocs('meta_hop_dong', _V2_SUBCOLL_NAME);
  if (!docs.length) return null;

  const hopDong = {};
  const thauPhu = [];

  docs.forEach(doc => {
    // Đọc Firestore field names trực tiếp (không dùng reverseApplyFieldMap vì cần tách loại)
    const raw      = _v2FromFsFields(doc.fields || {});
    const phanLoai = raw.phan_loai;

    if (phanLoai === 'hop_dong_chinh') {
      const key = raw.project_id || raw.cong_trinh || '';
      if (!key) return;
      hopDong[key] = {
        projectId:  raw.project_id  || null,
        congtrinh:  raw.cong_trinh  || null,
        ngay:       raw.ngay        || null,
        giaTri:     raw.gia_tri     || 0,
        giaTriphu:  raw.gia_tri_phu || 0,
        phatSinh:   raw.phat_sinh   || 0,
        nguoi:      raw.nguoi_ky    || null,
        nd:         raw.noi_dung    || null,
        updatedAt:  raw.cap_nhat_luc || null,
      };

    } else if (phanLoai === 'hop_dong_thau_phu') {
      thauPhu.push({
        id:        raw.id,              // synthetic key từ push
        thauphu:   raw.ten_thau_phu    || null,
        ngay:      raw.ngay            || null,
        projectId: raw.project_id      || null,
        congtrinh: raw.cong_trinh      || null,
        giaTri:    raw.gia_tri         || 0,
        phatSinh:  raw.phat_sinh       || 0,
        nguoi:     raw.nguoi_ky        || null,
        nd:        raw.noi_dung        || null,
        updatedAt: raw.cap_nhat_luc    || null,
      });
    }
  });

  const has = Object.keys(hopDong).length > 0 || thauPhu.length > 0;
  return has ? { hopDong, thauPhu } : null;
}


// ══════════════════════════════════════════════════════════════
// [5] PULL META FULL — đọc tất cả 4 loại song song
// ══════════════════════════════════════════════════════════════
// Trả về object chứa các keys có data:
//   { projects, users, catItems, cnRoles, ctYears, hopDong, thauPhu }
// Key vắng mặt = V2 chưa có data cho loại đó → caller dùng V1 fallback

async function _v2PullMetaFull() {
  const result = {};

  // Chạy song song 4 loại để giảm latency
  const [projRes, usersRes, dmRes, hdRes] = await Promise.allSettled([
    _v2PullProjects(),
    _v2PullUsers(),
    _v2PullDanhMuc(),
    _v2PullHopDong(),
  ]);

  if (projRes.status  === 'fulfilled' && projRes.value)
    result.projects = projRes.value;
  else if (projRes.status === 'rejected')
    console.warn('[V2Meta] projects lỗi:', projRes.reason?.message || projRes.reason);

  if (usersRes.status === 'fulfilled' && usersRes.value)
    result.users = usersRes.value;
  else if (usersRes.status === 'rejected')
    console.warn('[V2Meta] users lỗi:', usersRes.reason?.message || usersRes.reason);

  if (dmRes.status === 'fulfilled' && dmRes.value) {
    const dm = dmRes.value;
    if (dm.catItems) result.catItems = dm.catItems;
    if (dm.cnRoles)  result.cnRoles  = dm.cnRoles;
    if (dm.ctYears)  result.ctYears  = dm.ctYears;
  } else if (dmRes.status === 'rejected')
    console.warn('[V2Meta] danhMuc lỗi:', dmRes.reason?.message || dmRes.reason);

  if (hdRes.status === 'fulfilled' && hdRes.value) {
    const hd = hdRes.value;
    if (hd.hopDong) result.hopDong = hd.hopDong;
    if (hd.thauPhu) result.thauPhu = hd.thauPhu;
  } else if (hdRes.status === 'rejected')
    console.warn('[V2Meta] hopDong lỗi:', hdRes.reason?.message || hdRes.reason);

  return result;
}
