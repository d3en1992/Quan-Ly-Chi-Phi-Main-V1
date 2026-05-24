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
// Trả về { status, records } từ _v2PullSubcoll (PHASE 1 — guarded)

async function _v2PullProjects() {
  return _v2PullSubcoll('meta_cong_trinh', _V2_FIELD_MAPS.cong_trinh);
}


// ══════════════════════════════════════════════════════════════
// [2] PULL META_TAI_KHOAN → users_v1 (KHÔNG có password)
// ══════════════════════════════════════════════════════════════
// V2 không lưu password (không có trong field map) — dùng _mergeUsersV2 để restore

async function _v2PullUsers() {
  return _v2PullSubcoll('meta_tai_khoan', _V2_FIELD_MAPS.tai_khoan);
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
  // PHASE 1 — Dùng _v2PullSubcoll (đã có guard) để vừa đọc parent vừa kiểm tra unchanged
  // TOMBSTONE FIX: thêm isDeleted (da_xoa) vào field map để pull về trạng thái xóa của item
  const res = await _v2PullSubcoll('meta_danh_muc', {
    id:        'id',
    name:      'ten',
    loai:      'loai_danh_muc',
    isDeleted: 'da_xoa',          // TOMBSTONE: đọc trạng thái xóa từ cloud
    updatedAt: 'cap_nhat_luc',
  });

  // Trả về cấu trúc đặc biệt — _v2PullMetaFull sẽ extract
  if (res.status === 'absent') return { status: 'absent' };
  if (res.status === 'unchanged') return { status: 'unchanged' };

  // 'fresh' hoặc 'empty' → rebuild catItems từ subcoll, cnRoles/ctYears từ parentFields
  const catItems = {};
  (res.records || []).forEach(rec => {
    // Sau reverse map: id (UUID), name, loai, isDeleted, updatedAt
    const loai = rec.loai;
    if (!loai) return;
    if (!catItems[loai]) catItems[loai] = [];
    catItems[loai].push({
      id:        rec.id,
      name:      rec.name,
      isDeleted: rec.isDeleted || false,  // TOMBSTONE: truyền trạng thái xóa về local
      updatedAt: rec.updatedAt,
    });
  });

  // cnRoles + ctYears nằm trên parent doc (lưu khi push danh_muc)
  let cnRoles = null, ctYears = null;
  if (res.parentFields) {
    const pf = res.parentFields;
    if (pf.cn_roles && typeof pf.cn_roles === 'object' && !Array.isArray(pf.cn_roles))
      cnRoles = pf.cn_roles;
    if (pf.ct_years && typeof pf.ct_years === 'object' && !Array.isArray(pf.ct_years))
      ctYears = pf.ct_years;
  }

  const hasCatItems = Object.keys(catItems).length > 0;
  return {
    status:    'fresh',
    catItems:  hasCatItems ? catItems : null,
    cnRoles,
    ctYears,
  };
}


// ══════════════════════════════════════════════════════════════
// [4] PULL META_HOP_DONG → hopdong_v1 (object map) + thauphu_v1 (array)
// ══════════════════════════════════════════════════════════════
// Mỗi document trong subcollection có field phan_loai:
//   'hop_dong_chinh'   → thêm vào hopdong_v1 object, key = projectId || congtrinh
//   'hop_dong_thau_phu' → thêm vào thauphu_v1 array

async function _v2PullHopDong() {
  // PHASE 1 — Dùng guard. _v2PullSubcoll trả về fields đã reverse map qua fieldMap rỗng?
  // Ta cần raw fields vì cần tách phan_loai. Dùng guard riêng + _v2FsGetSubcollDocs raw.
  const guard = await _v2CheckLastModified('meta_hop_dong');

  if (!guard.exists)   return { status: 'absent' };
  if (guard.unchanged) {
    console.log('[V2Format] ⏭ meta_hop_dong unchanged — skip subcoll read');
    return { status: 'unchanged' };
  }

  const docs = await _v2FsGetSubcollDocs('meta_hop_dong', _V2_SUBCOLL_NAME);
  if (guard.cloudLastMod) _v2SetLastPull('meta_hop_dong', guard.cloudLastMod);

  if (!docs.length) return { status: 'empty' };

  const hopDong = {};
  const thauPhu = [];

  docs.forEach(doc => {
    const raw      = _v2FromFsFields(doc.fields || {});
    const phanLoai = raw.phan_loai;

    if (phanLoai === 'hop_dong_chinh') {
      const key = raw.project_id || raw.cong_trinh || '';
      if (!key) return;
      hopDong[key] = {
        projectId:  raw.project_id   || null,
        congtrinh:  raw.cong_trinh   || null,
        ngay:       raw.ngay         || null,
        giaTri:     raw.gia_tri      || 0,
        giaTriphu:  raw.gia_tri_phu  || 0,
        phatSinh:   raw.phat_sinh    || 0,
        nguoi:      raw.nguoi_ky     || null,
        nd:         raw.noi_dung     || null,
        updatedAt:  raw.cap_nhat_luc || null,
        deletedAt:  raw.da_xoa_luc   || null,  // TOMBSTONE: đọc trạng thái xóa từ cloud
      };
    } else if (phanLoai === 'hop_dong_thau_phu') {
      thauPhu.push({
        id:        raw.id,
        thauphu:   raw.ten_thau_phu  || null,
        ngay:      raw.ngay          || null,
        projectId: raw.project_id    || null,
        congtrinh: raw.cong_trinh    || null,
        giaTri:    raw.gia_tri       || 0,
        phatSinh:  raw.phat_sinh     || 0,
        nguoi:     raw.nguoi_ky      || null,
        nd:        raw.noi_dung      || null,
        updatedAt: raw.cap_nhat_luc  || null,
        deletedAt: raw.da_xoa_luc    || null,  // TOMBSTONE: đọc trạng thái xóa từ cloud
      });
    }
  });

  return { status: 'fresh', hopDong, thauPhu };
}


// ══════════════════════════════════════════════════════════════
// [5] PULL META FULL — đọc tất cả 4 loại song song
// ══════════════════════════════════════════════════════════════
// Trả về object chứa các keys có data:
//   { projects, users, catItems, cnRoles, ctYears, hopDong, thauPhu }
// Key vắng mặt = V2 chưa có data cho loại đó → caller dùng V1 fallback

async function _v2PullMetaFull() {
  // result chứa các key data + _v2Initialized flag
  //   _v2Initialized: true nếu ÍT NHẤT 1 meta doc tồn tại trên cloud (parent exists)
  //   projects/users/catItems/cnRoles/ctYears/hopDong/thauPhu: chỉ set khi 'fresh'
  const result = { _v2Initialized: false };

  const [projRes, usersRes, dmRes, hdRes] = await Promise.allSettled([
    _v2PullProjects(),
    _v2PullUsers(),
    _v2PullDanhMuc(),
    _v2PullHopDong(),
  ]);

  // projects — return từ _v2PullSubcoll: { status, records, parentFields }
  if (projRes.status === 'fulfilled' && projRes.value) {
    const r = projRes.value;
    if (r.status !== 'absent') result._v2Initialized = true;
    if (r.status === 'fresh') result.projects = r.records;
  } else if (projRes.status === 'rejected')
    console.warn('[V2Meta] projects lỗi:', projRes.reason?.message || projRes.reason);

  // users — return từ _v2PullSubcoll
  if (usersRes.status === 'fulfilled' && usersRes.value) {
    const r = usersRes.value;
    if (r.status !== 'absent') result._v2Initialized = true;
    if (r.status === 'fresh') result.users = r.records;
  } else if (usersRes.status === 'rejected')
    console.warn('[V2Meta] users lỗi:', usersRes.reason?.message || usersRes.reason);

  // danhMuc — custom return: { status, catItems?, cnRoles?, ctYears? }
  if (dmRes.status === 'fulfilled' && dmRes.value) {
    const dm = dmRes.value;
    if (dm.status !== 'absent') result._v2Initialized = true;
    if (dm.status === 'fresh') {
      if (dm.catItems) result.catItems = dm.catItems;
      if (dm.cnRoles)  result.cnRoles  = dm.cnRoles;
      if (dm.ctYears)  result.ctYears  = dm.ctYears;
    }
  } else if (dmRes.status === 'rejected')
    console.warn('[V2Meta] danhMuc lỗi:', dmRes.reason?.message || dmRes.reason);

  // hopDong — custom return: { status, hopDong?, thauPhu? }
  if (hdRes.status === 'fulfilled' && hdRes.value) {
    const hd = hdRes.value;
    if (hd.status !== 'absent') result._v2Initialized = true;
    if (hd.status === 'fresh') {
      if (hd.hopDong) result.hopDong = hd.hopDong;
      if (hd.thauPhu) result.thauPhu = hd.thauPhu;
    }
  } else if (hdRes.status === 'rejected')
    console.warn('[V2Meta] hopDong lỗi:', hdRes.reason?.message || hdRes.reason);

  // Lưu flag cho lần sync sau (sync.js đọc localStorage trước khi gọi pull)
  if (result._v2Initialized) {
    try { localStorage.setItem('_v2Initialized', '1'); } catch {}
  }

  return result;
}
