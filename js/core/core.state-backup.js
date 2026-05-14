// core.state-backup.js — State management, migration, backup/restore, global state init
// Load order: 2 (sau core.storage.js, trước core.cloud-cats-ui.js)
// Kiến trúc: classic script, global scope — KHÔNG dùng import/export


// ══════════════════════════════════════════════════════════════
// [MODULE: STORAGE v2] — DATA_VERSION · Migration · Backup · JSON IO
// ══════════════════════════════════════════════════════════════

// ── Phiên bản schema hiện tại ─────────────────────────────────
// Tăng DATA_VERSION khi thay đổi cấu trúc data (thêm field bắt buộc,
// đổi tên key, v.v.). migrateData() sẽ tự nâng cấp data cũ lên mới.
const DATA_VERSION = 4;
const DATA_VERSION_KEY = 'app_data_version';

// ── Migration: nâng cấp data cũ lên version hiện tại ─────────
// Thêm case mới khi nâng DATA_VERSION lên
function migrateData() {
  const stored = parseInt(_loadLS(DATA_VERSION_KEY) || '0');
  if (stored >= DATA_VERSION) return; // Đã cập nhật, bỏ qua

  console.log('[Migration] Từ v' + stored + ' → v' + DATA_VERSION);

  // v0 → v1: inv không có field sl → set mặc định sl=1
  if (stored < 1) {
    const invs = _loadLS('inv_v3') || [];
    let changed = 0;
    invs.forEach(inv => {
      if (inv.sl === undefined || inv.sl === null) { inv.sl = 1; changed++; }
      if (inv.thanhtien === undefined) { inv.thanhtien = (inv.tien || 0) * (inv.sl || 1); changed++; }
    });
    if (changed) _saveLS('inv_v3', invs);
    console.log('[Migration v1] Chuẩn hoá sl/thanhtien:', changed, 'HĐ');
  }

  // v1 → v2: cc_v2 workers không có field phucap/hdmuale → set 0
  if (stored < 2) {
    const ccs = _loadLS('cc_v2') || [];
    let changed = 0;
    ccs.forEach(week => {
      (week.workers || []).forEach(wk => {
        if (wk.phucap === undefined) { wk.phucap = 0; changed++; }
        if (wk.hdmuale === undefined) { wk.hdmuale = 0; changed++; }
      });
    });
    if (changed) _saveLS('cc_v2', ccs);
    console.log('[Migration v2] Chuẩn hoá CC workers:', changed, 'worker');
  }

  // v2 → v3: đảm bảo mọi invoice có _ts (timestamp tạo)
  if (stored < 3) {
    const invs = _loadLS('inv_v3') || [];
    let changed = 0;
    invs.forEach(inv => {
      if (!inv._ts) { inv._ts = inv.id || Date.now(); changed++; }
    });
    if (changed) _saveLS('inv_v3', invs);
    console.log('[Migration v3] Thêm _ts cho', changed, 'HĐ');
  }

  // v3 → v4: hopdong_v1 key migration — handled in _migrateHopDongKeys()
  // (runs in _reloadGlobals after projects_v1 is loaded, not here)

  _saveLS(DATA_VERSION_KEY, DATA_VERSION);
  console.log('[Migration] Hoàn tất → v' + DATA_VERSION);
}


// ══════════════════════════════════════════════════════════════
// [MODULE: HOPDONG KEY MIGRATION] — tên CT → projectId
// ══════════════════════════════════════════════════════════════

/**
 * Chuyển hopdong_v1 key từ tên công trình (string) sang projectId (UUID).
 * - Chạy trong _reloadGlobals() SAU KHI projects_v1 đã load.
 * - Key đã là UUID → giữ nguyên.
 * - Key là tên CT → tìm project, chuyển sang project.id.
 * - Key không match project nào → giữ nguyên (fallback an toàn, không xóa data).
 * - Idempotent: chạy nhiều lần không gây trùng / mất data.
 */
function _migrateHopDongKeys() {
  if (typeof hopDongData === 'undefined' || !hopDongData) return;
  const projs = (typeof projects !== 'undefined') ? projects : load('projects_v1', []);
  if (!projs || !projs.length) return;

  // Build lookup: name → id (chỉ project chưa xóa)
  const nameToId = new Map();
  projs.forEach(p => { if (p.id && p.name && !p.deletedAt) nameToId.set(p.name, p.id); });
  if (!nameToId.size) return;

  let changed = false;
  const migrated = {};

  for (const [key, hd] of Object.entries(hopDongData)) {
    // Nếu key đã là UUID (36 ký tự, 5 phần ngăn gạch) → giữ nguyên
    if (key.length === 36 && key.split('-').length === 5) {
      migrated[key] = hd;
      continue;
    }
    // Key là tên CT → tìm projectId
    const pid = nameToId.get(key);
    if (pid) {
      // Nếu đích (pid) đã có record khác → merge: giữ bản updatedAt mới hơn
      if (migrated[pid]) {
        const existTs = migrated[pid].updatedAt || 0;
        const newTs   = hd.updatedAt || 0;
        if (newTs > existTs) migrated[pid] = { ...hd, projectId: pid };
      } else {
        migrated[pid] = { ...hd, projectId: pid };
      }
      changed = true;
    } else {
      // Không tìm thấy project → giữ key cũ (fallback, KHÔNG xóa data)
      migrated[key] = hd;
    }
  }

  if (changed) {
    hopDongData = migrated;
    _memSet('hopdong_v1', hopDongData); // ghi _mem + IDB, KHÔNG trigger sync
    console.log('[Migration v4] hopdong_v1: chuyển key tên CT → projectId');
  }
}

/**
 * Tra cứu hợp đồng backward-compat: tìm theo projectId trước, fallback tên CT.
 * Dùng ở mọi nơi cần đọc hopDongData[key] mà không biết key là UUID hay tên.
 * @param {string} projectIdOrName - projectId (UUID) hoặc tên CT
 * @returns {Object|null} hopDong entry hoặc null
 */
function _hdLookup(projectIdOrName) {
  if (!projectIdOrName || typeof hopDongData === 'undefined' || !hopDongData) return null;
  // 1. Tìm trực tiếp theo key
  const direct = hopDongData[projectIdOrName];
  if (direct && !direct.deletedAt) return direct;
  // 2. Nếu key là tên CT → tìm projectId → lookup
  const projs = (typeof projects !== 'undefined') ? projects : [];
  const p = projs.find(proj => proj.name === projectIdOrName && !proj.deletedAt);
  if (p && hopDongData[p.id] && !hopDongData[p.id].deletedAt) return hopDongData[p.id];
  // 3. Nếu key là projectId → tìm tên CT → lookup (trường hợp chưa migrate)
  const p2 = projs.find(proj => proj.id === projectIdOrName && !proj.deletedAt);
  if (p2 && hopDongData[p2.name] && !hopDongData[p2.name].deletedAt) return hopDongData[p2.name];
  return null;
}

/**
 * Trả về key chính xác trong hopDongData cho một project.
 * Ưu tiên projectId, fallback tên CT.
 * @param {Object} project - project object (cần .id và .name)
 * @returns {string|null} key tồn tại trong hopDongData hoặc null
 */
function _hdKeyOf(project) {
  if (!project || typeof hopDongData === 'undefined') return null;
  if (project.id && hopDongData[project.id]) return project.id;
  if (project.name && hopDongData[project.name]) return project.name;
  return null;
}


// ══════════════════════════════════════════════════════════════
// [GLOBAL HELPERS] — project lookup wrappers (safe pre-projects.js)
// ══════════════════════════════════════════════════════════════
function _getProjectById(id) {
  return typeof getProjectById === 'function' ? getProjectById(id) : null;
}
function _getProjectNameById(id) {
  if (!id) return '';
  if (id === 'COMPANY') return 'CÔNG TY';
  const p = _getProjectById(id);
  return p ? p.name : '';
}
function _getProjectIdByName(name) {
  return typeof findProjectIdByName === 'function' ? findProjectIdByName(name) : null;
}
// resolve display name from ANY record that may have projectId and/or ct/congtrinh
function _resolveCtName(record) {
  if (!record) return '';
  if (record.projectId) {
    const n = _getProjectNameById(record.projectId);
    if (n) return n;
  }
  return record.ct || record.congtrinh || '';
}


// ══════════════════════════════════════════════════════════════
// [MODULE: BACKUP v2] — store-envelope format
// Để thêm data mới vào backup: chỉ cần thêm key vào BACKUP_KEYS.
// Import/restore code không cần sửa thêm bao giờ.
// ══════════════════════════════════════════════════════════════

// ── Danh sách keys được backup — nguồn sự thật duy nhất ──────
// Thêm key mới vào đây là đủ, không cần sửa bất kỳ nơi nào khác
const BACKUP_KEYS = [
  // ── IDB-backed (sync cloud) ──────────────────────────────
  'inv_v3',    // Hóa đơn / chi phí
  'ung_v1',    // Tiền ứng
  'cc_v2',     // Chấm công
  'tb_v1',     // Thiết bị
  'thu_v1',    // Thu tiền
  'cat_ct',    // Danh mục: Công trình
  'cat_loai',  // Danh mục: Loại chi phí
  'cat_ncc',   // Danh mục: Nhà cung cấp
  'cat_nguoi', // Danh mục: Người thực hiện
  'cat_tp',    // Danh mục: Thầu phụ
  'cat_cn',    // Danh mục: Công nhân
  'projects_v1',  // Dự án / công trình
  // ── LS-only (không sync cloud) ──────────────────────────
  'hopdong_v1',   // Hợp đồng chính
  'thauphu_v1',   // Hợp đồng thầu phụ
  'cat_tbteb',    // Danh mục: Tên thiết bị
  'cat_ct_years', // Năm theo công trình
  'cat_cn_roles', // Vai trò công nhân
  'cat_items_v1', // Danh mục per-item (soft-delete, cross-device sync)
];

const BACKUP_KEY  = 'backup_auto';
let   _backupTimer = null;

// ── Backward-compat: chuyển file cũ {inv,ung,...} → store ────
function _legacySnapToStore(b) {
  const s = {};
  if (b.inv)  s['inv_v3']  = b.inv;
  if (b.ung)  s['ung_v1']  = b.ung;
  if (b.cc)   s['cc_v2']   = b.cc;
  if (b.tb)   s['tb_v1']   = b.tb;
  if (b.thu)  s['thu_v1']  = b.thu;
  if (b.cats) {
    if (b.cats.ct)    s['cat_ct']    = b.cats.ct;
    if (b.cats.loai)  s['cat_loai']  = b.cats.loai;
    if (b.cats.ncc)   s['cat_ncc']   = b.cats.ncc;
    if (b.cats.nguoi) s['cat_nguoi'] = b.cats.nguoi;
    if (b.cats.tp)    s['cat_tp']    = b.cats.tp;
    if (b.cats.cn)    s['cat_cn']    = b.cats.cn;
  }
  return s;
}

// ── Đếm số lượng record trong store để hiển thị ──────────────
function _countStore(store) {
  return {
    inv:   (store['inv_v3']     || []).length,
    ung:   (store['ung_v1']     || []).length,
    cc:    (store['cc_v2']      || []).length,
    tb:    (store['tb_v1']      || []).length,
    thu:   (store['thu_v1']     || []).length,
    hdong: Object.keys(store['hopdong_v1']  || {}).length,
    thphu: (store['thauphu_v1'] || []).length,
  };
}

// ── Ghi store vào _mem + IDB/LS, đảm bảo record array có id ──
function _restoreStore(store) {
  const now = Date.now();
  Object.entries(store).forEach(([k, v]) => {
    if (v == null) return;
    if (Array.isArray(v)) {
      v = v.map(r => (r && typeof r === 'object' && !r.id)
        ? { ...r, id: crypto.randomUUID(), updatedAt: r.updatedAt || now }
        : r);
    }
    _memSet(k, v);
  });
}

// ── Xóa toàn bộ cache runtime — gọi sau mỗi lần data thay đổi ─
// Thêm cache mới vào đây khi cần (không sửa nơi khác)
function clearAllCache() {
  if (typeof clearInvoiceCache === 'function') clearInvoiceCache();
  // Thêm cache khác tại đây khi cần
}

// ── Selector đơn nhất cho UI — đọc từ _mem (single source of truth) ──────
// Dùng thay cho truy cập trực tiếp globals trong render functions.
function getState(key, def) {
  return load(key, def !== undefined ? def : []);
}

// ── Hàm thống nhất sau mọi thay đổi data lớn (pull/import/delete/restore) ─
// Thứ tự bắt buộc: reload globals → clear cache → render
// Không gọi sau mỗi save() thông thường (save đã clear cache riêng).
function afterDataChange() {
  if (typeof _reloadGlobals === 'function') _reloadGlobals();
  // _reloadGlobals() đã gọi clearAllCache() → clearInvoiceCache()
  if (typeof renderActiveTab === 'function') renderActiveTab();
}

// ── Reload tất cả global vars sau restore ─────────────────────
function _reloadGlobals() {
  invoices   = load('inv_v3', []);
  ungRecords = load('ung_v1', []);
  // cc_v2: fill projectId + dedup theo logical key (fromDate+projectId)
  // Luôn persist kết quả — _fillCCProjectId có thể đã thêm projectId mới vào records
  {
    const raw = load('cc_v2', []);
    if (typeof _dedupCC === 'function') {
      const deduped = _dedupCC(raw); // gọi normalizeCC nếu sync.js đã load (có fill+safeTs)
      ccData = deduped;
      _memSet('cc_v2', deduped);     // không tăng pending — đây là normalization, không phải user action
    } else {
      ccData = raw;
    }
  }
  tbData     = load('tb_v1',  []);
  cats.congTrinh      = load('cat_ct',       DEFAULTS.congTrinh);
  cats.congTrinhYears = load('cat_ct_years', {});
  cats.loaiChiPhi     = load('cat_loai',     DEFAULTS.loaiChiPhi);
  cats.nhaCungCap     = load('cat_ncc',      DEFAULTS.nhaCungCap);
  cats.nguoiTH        = load('cat_nguoi',    DEFAULTS.nguoiTH);
  cats.thauPhu        = load('cat_tp',       []);
  cats.congNhan       = load('cat_cn',       []);
  cats.tbTen          = load('cat_tbteb',    DEFAULTS.tbTen);
  // Module doanhtu.js (load sau core.js)
  if (typeof hopDongData      !== 'undefined') hopDongData      = load('hopdong_v1', {});
  if (typeof thuRecords       !== 'undefined') thuRecords       = load('thu_v1',     []);
  if (typeof thauPhuContracts !== 'undefined') thauPhuContracts = load('thauphu_v1', []);
  // Migration hopdong_v1: chuyển key tên CT → projectId (chạy sau khi projects đã load)
  _migrateHopDongKeys();
  // Module chamcong.js — cnRoles
  if (typeof cnRoles !== 'undefined') cnRoles = load('cat_cn_roles', {});
  // Module projects.js
  if (typeof projects !== 'undefined') projects = load('projects_v1', []);
  // Migration one-time: tạo cat_items_v1 từ string arrays nếu chưa có
  _migrateCatItemsIfNeeded();
  // Rebuild string arrays từ items (áp dụng soft-delete từ cloud sau pull)
  _rebuildCatArrsFromItems();
  // Xóa toàn bộ cache runtime — bắt buộc để render thấy data mới sau pull
  clearAllCache();
  // Rebuild cats.congTrinh từ projects — derived data, không tăng pending counter
  if (typeof rebuildCatCTFromProjects === 'function') rebuildCatCTFromProjects();
  // Đảm bảo mọi tên công nhân trong ccData đều có trong danh mục — quan trọng sau import
  if (typeof rebuildCCCategories === 'function') rebuildCCCategories();
}


// ── IDB Backup Helpers — lưu backup vào IndexedDB thay vì localStorage ──
const _BACKUP_MAX = 5; // Giữ tối đa 5 bản backup gần nhất

async function _getBackupStore() {
  let list = [];
  try {
    const rec = await db.settings.get(BACKUP_KEY);
    if (rec && Array.isArray(rec.data)) list = rec.data;
  } catch(e) { console.warn('[Backup] IDB read lỗi:', e); }
  if (!list.length) {
    const lsList = _loadLS(BACKUP_KEY);
    if (lsList && lsList.length) {
      list = lsList;
      await _setBackupStore(list);
      console.log('[Backup] Migrated', list.length, 'bản backup: LS → IDB');
    }
  }
  return list;
}

async function _setBackupStore(list) {
  try {
    await db.settings.put({ id: BACKUP_KEY, data: list, updatedAt: Date.now() });
  } catch(e) {
    console.warn('[Backup] IDB write lỗi, fallback LS:', e);
    try { _saveLS(BACKUP_KEY, list); } catch(_) {}
  }
}

async function _snapshotNow(label) {
  try {
    const store = {};
    for (const k of BACKUP_KEYS) {
      const v = load(k, null);
      if (v !== null) store[k] = v;
    }
    const snap = {
      app: 'cpct', ver: DATA_VERSION,
      _time: new Date().toISOString(), _label: label || 'auto', store,
    };
    const list = await _getBackupStore();
    list.unshift(snap);
    await _setBackupStore(list.slice(0, _BACKUP_MAX));
    return snap;
  } catch(e) { console.warn('[Backup] Lỗi:', e); return null; }
}


async function getBackupList() {
  const list = await _getBackupStore();
  return list.map((b, i) => {
    const store  = b.store || _legacySnapToStore(b);
    const counts = _countStore(store);
    return { index: i, label: b._label || 'auto', time: b._time || '', ver: b.ver || b._ver || 0, counts };
  });
}

async function restoreFromBackup(index) {
  const list = await _getBackupStore();
  const b    = list[index];
  if (!b) { toast('❌ Không tìm thấy bản backup này', 'error'); return; }
  const store = b.store || _legacySnapToStore(b);
  const c     = _countStore(store);
  const time  = b._time ? new Date(b._time).toLocaleString('vi-VN') : '(không rõ)';
  const ok    = confirm(
    'Khôi phục bản backup: ' + time + '\n' +
    c.inv + ' HĐ · ' + c.ung + ' tiền ứng · ' + c.cc + ' tuần CC\n\n' +
    '⚠️ Data hiện tại sẽ bị thay thế. Tiếp tục?'
  );
  if (!ok) return;
  await _snapshotNow('before-restore');
  _restoreStore(store);
  migrateData();
  _reloadGlobals();
  buildYearSelect(); _refreshAllTabs();
  rebuildEntrySelects(); rebuildUngSelects();
  renderSettings(); updateTop();
  toast('✅ Đã khôi phục bản backup lúc ' + time + '. Bấm 🔄 Sync để đồng bộ lên cloud.', 'success');
}

async function renderBackupList() {
  const wrap = document.getElementById('backup-list-wrap');
  if (!wrap) return;
  const badge = document.getElementById('data-version-badge');
  if (badge) badge.textContent = 'v' + DATA_VERSION;
  const statusLabel = document.getElementById('backup-status-label');
  const list = await _getBackupStore();
  if (!list.length) {
    wrap.innerHTML = '<div style="color:var(--ink3);font-size:13px;padding:8px 0">Chưa có bản sao lưu nào. App sẽ tự động tạo sau 1 phút.</div>';
    if (statusLabel) statusLabel.textContent = '';
    return;
  }
  if (statusLabel && list[0]?._time) {
    statusLabel.textContent = 'Backup gần nhất: ' + new Date(list[0]._time).toLocaleString('vi-VN');
  }
  const rows = list.map((b, i) => {
    const store  = b.store || _legacySnapToStore(b);
    const c      = _countStore(store);
    const time   = b._time ? new Date(b._time).toLocaleString('vi-VN') : '(không rõ)';
    const label  = b._label === 'auto' ? '🔄 Tự động' : b._label === 'manual' ? '📸 Thủ công' :
                   b._label === 'manual-export' ? '📤 Trước khi xuất' :
                   b._label === 'before-json-import' ? '🛡 Trước khi nhập JSON' :
                   b._label === 'before-restore' ? '🛡 Trước khi khôi phục' : b._label;
    const counts = c.inv + ' HĐ · ' + c.ung + ' tiền ứng · ' + c.cc + ' tuần CC · ' + c.tb + ' TB';
    const isNewest = i === 0;
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;
              background:${isNewest ? 'var(--paper)' : 'transparent'};
              border-radius:8px;border:1px solid ${isNewest ? 'var(--line2)' : 'transparent'};
              margin-bottom:6px;flex-wrap:wrap">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--ink)">${label}</div>
        <div style="font-size:11px;color:var(--ink3);margin-top:2px">${time} &nbsp;·&nbsp; ${counts}</div>
      </div>
      <button class="btn btn-outline btn-sm" onclick="restoreFromBackup(${i})" title="Khôi phục bản này">
        ↩ Khôi phục
      </button>
    </div>`;
  }).join('');
  wrap.innerHTML = rows;
}

// ── Export toàn bộ data ra file JSON (snapshot từ _mem) ──────
function exportJSON() {
  const snap = {
    meta: { version: DATA_VERSION, exportedAt: Date.now() },
    data: { ..._mem },
  };
  const json = JSON.stringify(snap, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const ts   = new Date().toISOString().slice(0,16).replace('T','_').replace(':','-');
  a.href     = url;
  a.download = 'cpct_snapshot_' + ts + '.json';
  a.click();
  URL.revokeObjectURL(url);
  const c = _countStore(snap.data);
  toast('✅ Đã xuất snapshot (' + c.inv + ' HĐ, ' + c.ung + ' tiền ứng, ' + c.cc + ' tuần CC)', 'success');
}

// ── Import JSON — hard reset toàn hệ thống ───────────────────
function importJSON(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const json = JSON.parse(e.target.result);
      if (!json || typeof json !== 'object') {
        toast('❌ File JSON không hợp lệ', 'error'); return;
      }
      // Hỗ trợ format mới {meta, data} và format cũ {store, ...}
      const data = json.data || json.store || null;
      if (!data || !Object.keys(data).length) {
        toast('❌ File JSON không hợp lệ hoặc không phải snapshot của app này', 'error'); return;
      }
      const c    = _countStore(data);
      const ts   = json.meta?.exportedAt
        ? new Date(json.meta.exportedAt).toLocaleString('vi-VN')
        : (json._time ? new Date(json._time).toLocaleString('vi-VN') : '(không rõ)');

      // Modal xác nhận thay vì confirm() để UX tốt hơn
      _showImportJSONConfirm({ data, c, ts });
    } catch(err) {
      toast('❌ Lỗi đọc file JSON: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

// ── Hiển thị modal xác nhận import JSON ───────────────────────
function _showImportJSONConfirm({ data, c, ts }) {
  let ov = document.getElementById('import-json-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'import-json-overlay';
    ov.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;align-items:center;justify-content:center';
    document.body.appendChild(ov);
  }
  ov.innerHTML = `<div onclick="event.stopPropagation()" style="max-width:420px;width:94vw;background:#fff;border-radius:14px;padding:24px;font-family:'IBM Plex Sans',sans-serif;box-shadow:0 16px 56px rgba(0,0,0,.25)">
    <div style="font-size:28px;text-align:center;margin-bottom:10px">⚠️</div>
    <h3 style="font-size:16px;font-weight:800;margin:0 0 12px;text-align:center;color:#c0392b">KHÔI PHỤC TOÀN BỘ DỮ LIỆU</h3>
    <div style="background:#fff3cd;border-radius:8px;padding:12px 14px;font-size:13px;line-height:1.8;margin-bottom:16px">
      📅 Snapshot lúc: <b>${ts}</b><br>
      📊 Nội dung: ${c.inv} HĐ · ${c.ung} tiền ứng · ${c.cc} tuần CC · ${c.tb} thiết bị
    </div>
    <div style="background:#f8d7da;border-radius:8px;padding:12px 14px;font-size:13px;color:#721c24;line-height:1.8;margin-bottom:20px">
      • Xóa toàn bộ dữ liệu hiện tại<br>
      • Ghi đè tất cả thiết bị<br>
      • Không thể hoàn tác
    </div>
    <div style="display:flex;gap:10px">
      <button onclick="document.getElementById('import-json-overlay').style.display='none'" style="flex:1;padding:11px;border-radius:8px;border:1.5px solid #ccc;background:#fff;font-family:inherit;font-size:13px;cursor:pointer">Hủy</button>
      <button onclick="importJSONFull(window._pendingImportData)" style="flex:2;padding:11px;border-radius:8px;border:none;background:#c0392b;color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">Khôi phục</button>
    </div>
  </div>`;
  window._pendingImportData = data;
  ov.style.display = 'flex';
}

// ── Hard reset: xóa DB, ghi clean data, push cloud, reload ──
async function importJSONFull(data) {
  const ov = document.getElementById('import-json-overlay');
  if (ov) ov.style.display = 'none';

  if (!data || !Object.keys(data).length) { toast('❌ Dữ liệu không hợp lệ', 'error'); return; }

  // Block any concurrent sync
  try { _syncPulling = true; } catch(_) {}
  try { _syncPushing = true; } catch(_) {}

  try {
    if (typeof showSyncBanner === 'function') showSyncBanner('⏳ Đang khôi phục snapshot...');

    // Step 1: Clear ALL local data (IDB + _mem)
    await Promise.all(db.tables.map(t => t.clear()));
    Object.keys(_mem).forEach(k => delete _mem[k]);

    // Step 2: Sanitize — ensure every record has id + updatedAt, then dedup
    const now = Date.now();
    const clean = {};
    for (const key of Object.keys(data)) {
      let val = data[key];
      if (Array.isArray(val)) {
        // Fill missing id / updatedAt — preserve original values
        val = val.map(r => ({
          ...r,
          id:        r.id        || crypto.randomUUID(),
          updatedAt: r.updatedAt || now,
        }));
        // Remove duplicate ids — keep record with highest updatedAt
        val = dedupById(val);
        // cc_v2: also dedup by business key (fromDate+ct) — prevents week duplicates
        if (key === 'cc_v2' && typeof _dedupCC === 'function') val = _dedupCC(val);
      }
      clean[key] = val;
    }

    // Step 3: Write to _mem + IDB — await ALL writes before any further action
    const writes = [];
    for (const [key, val] of Object.entries(clean)) {
      _mem[key] = val;
      writes.push(_dbSave(key, val));
    }
    await Promise.all(writes);

    // Step 4: Block pull for 2 h after reload — prevent cloud from overwriting fresh import
    localStorage.setItem('_blockPullUntil', String(Date.now() + 2 * 60 * 60 * 1000));

    // Step 5: Push to cloud — skip inner pull so we overwrite cloud cleanly
    if (typeof fbReady === 'function' && fbReady()) {
      try {
        _syncPulling = false;
        _syncPushing = false;
        await pushChanges({ silent: true, skipPull: true });
      } catch(e) {
        console.warn('[Import] Push cloud lỗi (sẽ sync lại sau reload):', e);
      }
    }

    // Step 6: Reload — dbInit reads fresh IDB, _reloadGlobals rebuilds everything
    location.reload();

  } catch(e) {
    console.error('[Import] Lỗi:', e);
    toast('❌ Lỗi khôi phục: ' + (e.message || String(e)), 'error');
    try { _syncPulling = false; } catch(_) {}
    try { _syncPushing = false; } catch(_) {}
    if (typeof hideSyncBanner === 'function') hideSyncBanner();
  }
}


// ══════════════════════════════════════════════════════════════
//  GLOBAL STATE INIT — phải đứng sau tất cả hàm helper ở trên
// ══════════════════════════════════════════════════════════════

let cats = {
  congTrinh:      load('cat_ct',       DEFAULTS.congTrinh),
  congTrinhYears: load('cat_ct_years', {}),  // { "tên CT": năm tạo }
  loaiChiPhi:     load('cat_loai',     DEFAULTS.loaiChiPhi),
  nhaCungCap:     load('cat_ncc',      DEFAULTS.nhaCungCap),
  nguoiTH:        load('cat_nguoi',    DEFAULTS.nguoiTH),
  thauPhu:        load('cat_tp',       []),
  congNhan:       load('cat_cn',       []),
  tbTen:          load('cat_tbteb',    DEFAULTS.tbTen)  // Danh mục tên máy/thiết bị
};
let cnRoles = load('cat_cn_roles', {}); // { "Tên CN": "C/T/P" }

let invoices = load('inv_v3', []);
let filteredInvs = [];
let curPage = 1;
const PG = 20;
