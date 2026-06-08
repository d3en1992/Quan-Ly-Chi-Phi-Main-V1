// core.cloud-cats-ui.js — Cloud helpers, Firestore format, category item sync, sync UI
// Load order: 3 (sau core.state-backup.js, trước projects.js và các module nghiệp vụ)
// Kiến trúc: classic script, global scope — KHÔNG dùng import/export


function fbReady() { return FB_CONFIG.apiKey && FB_CONFIG.projectId; }


// ══ FIRESTORE DOCUMENT FORMAT ═════════════════════════════
// Firestore lưu dạng {fields: {key: {stringValue/integerValue/...}}}
// Ta dùng 1 field "data" chứa toàn bộ JSON nén dạng stringValue

function fsWrap(obj) {
  // Wrap object thành Firestore document format
  return { fields: { data: { stringValue: JSON.stringify(obj) } } };
}
function fsUnwrap(doc) {
  // Unwrap Firestore document về plain object
  if (!doc || !doc.fields || !doc.fields.data) return null;
  try { return JSON.parse(doc.fields.data.stringValue); } catch { return null; }
}

// ── Doc ID helpers ─────────────────────────────────────────
// ── CẤU TRÚC MỚI (B): mỗi hạng mục theo năm = 1 document, + 4 doc danh mục dùng chung ──
// Tên field bên trong viết ĐẦY ĐỦ (không nén) cho dễ đọc trên Firebase Console.
//   cpct_data/meta_cong_trinh  → { projects }
//   cpct_data/meta_danh_muc    → { cats, catItems, cnRoles, ctYears }
//   cpct_data/meta_tai_khoan   → { users }
//   cpct_data/meta_hop_dong    → { hopDong, thauPhu }
//   cpct_data/y2025_hoa_don / _tien_ung / _cham_cong / _thiet_bi / _thu_tien → { records }
function fbDocYearCat(yr, cat) { return `y${yr}_${cat}`; }
function fbDocMetaCT() { return 'meta_cong_trinh'; }
function fbDocMetaDM() { return 'meta_danh_muc'; }
function fbDocMetaTK() { return 'meta_tai_khoan'; }
function fbDocMetaHD() { return 'meta_hop_dong'; }

// Bảng ánh xạ: hạng mục theo năm → key local + trường ngày để lọc theo năm
const _YEAR_CATS = [
  { cat: 'hoa_don',   key: 'inv_v3', dateField: 'ngay'     },
  { cat: 'tien_ung',  key: 'ung_v1', dateField: 'ngay'     },
  { cat: 'cham_cong', key: 'cc_v2',  dateField: 'fromDate' },
  { cat: 'thiet_bi',  key: 'tb_v1',  dateField: 'ngay'     },
  { cat: 'thu_tien',  key: 'thu_v1', dateField: 'ngay'     },
];

// Payload 1 hạng mục theo năm — lưu record nguyên dạng (tên field đầy đủ)
function fbYearCatPayload(yr, key, dateField) {
  const ys = String(yr);
  const records = load(key, []).filter(x => x[dateField] && x[dateField].startsWith(ys));
  return { v: 4, yr: Number(yr), cat: key, records };
}

// Payload 4 doc danh mục dùng chung
function fbMetaCTPayload() {
  return { v: 4, projects: load('projects_v1', []) };
}
function fbMetaDMPayload() {
  return { v: 4,
    cats: { loai:  load('cat_loai',  DEFAULTS.loaiChiPhi),
            ncc:   load('cat_ncc',   DEFAULTS.nhaCungCap),
            nguoi: load('cat_nguoi', DEFAULTS.nguoiTH) },
    catItems: load('cat_items_v1', {}),
    cnRoles:  load('cat_cn_roles', {}),
    ctYears:  load('cat_ct_years', {}),
  };
}
function fbMetaTKPayload() {
  return { v: 4, users: load('users_v1', []) };
}
function fbMetaHDPayload() {
  return { v: 4, hopDong: load('hopdong_v1', {}), thauPhu: load('thauphu_v1', []) };
}

// ── Firestore quota counter ──────────────────────────────────
let _fsReads = 0, _fsWrites = 0;
function _fsCountRead()  { _fsReads++;  console.log(`[FS Counter] reads: ${_fsReads}, writes: ${_fsWrites}`); }
function _fsCountWrite() { _fsWrites++; console.log(`[FS Counter] reads: ${_fsReads}, writes: ${_fsWrites}`); }
function getFsCounter()  { return { reads: _fsReads, writes: _fsWrites }; }

// ── Firebase REST helpers ──────────────────────────────────
function fsUrl(docId) {
  return `${FS_BASE()}/${docId}?key=${FB_CONFIG.apiKey}`;
}
function fsGet(docId) {
  _fsCountRead();
  return fetch(fsUrl(docId)).then(r=>r.json());
}
function fsSet(docId, payload) {
  _fsCountWrite();
  // PATCH = upsert (tạo hoặc cập nhật)
  return fetch(`${FS_BASE()}/${docId}?key=${FB_CONFIG.apiKey}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fsWrap(payload))
  }).then(r=>r.json());
}
// Xóa hẳn 1 doc khỏi Firestore (dùng khi dọn doc rác cấu trúc cũ)
function fsDelete(docId) {
  _fsCountWrite();
  return fetch(`${FS_BASE()}/${docId}?key=${FB_CONFIG.apiKey}`, { method: 'DELETE' })
    .then(r => r.ok)
    .catch(() => false);
}

// ── Dọn doc rác cấu trúc cũ ──────────────────────────────────
// Liệt kê toàn bộ collection cpct_data, xóa mọi doc KHÔNG thuộc cấu trúc B mới.
// Giữ lại: meta_*  và  y{YYYY}_{hoa_don|tien_ung|cham_cong|thiet_bi|thu_tien}.
// Xóa: y2025 / y2026 (doc gộp đời cũ), cats (doc gộp đời cũ), rác V2 lạc...
// Trả về số doc đã xóa.
async function _wipeOrphanCloudDocs() {
  if (!fbReady()) return 0;
  const validCat = new Set(['hoa_don', 'tien_ung', 'cham_cong', 'thiet_bi', 'thu_tien']);
  let deleted = 0;
  try {
    const res  = await fetch(`${FS_BASE()}?key=${FB_CONFIG.apiKey}&pageSize=300`).then(r => r.json());
    const docs = (res && res.documents) || [];
    for (const doc of docs) {
      const id = doc.name.split('/').pop();
      let keep = false;
      if (id.startsWith('meta_')) {
        keep = true;
      } else {
        const m = id.match(/^y(\d{4})_(.+)$/);
        if (m && validCat.has(m[2])) keep = true;
      }
      if (!keep) { await fsDelete(id); deleted++; }
    }
  } catch (e) {
    console.warn('[Cloud] Dọn doc rác lỗi (bỏ qua):', e);
  }
  return deleted;
}

// ── Estimate size ──────────────────────────────────────────
function estimateYearKb(yr) {
  const y = yr || activeYear || new Date().getFullYear();
  // Tổng dung lượng tất cả hạng mục của năm (tên field đầy đủ, không nén)
  let bytes = 0;
  _YEAR_CATS.forEach(({ key, dateField }) => {
    bytes += JSON.stringify(fbYearCatPayload(y, key, dateField).records).length;
  });
  return Math.round(bytes / 1024 * 10) / 10;
}


// ══ PUSH LÊN CLOUD ════════════════════════════════════════

function gsLoadAll(callback) {
  if (typeof pullChanges === 'function') {
    const yr = activeYear || new Date().getFullYear();
    pullChanges(yr, d => callback(d ? d : null));
    return;
  }
  console.warn('[gsLoadAll] sync.js chưa load — pull bị bỏ qua');
  if (callback) callback(null);
}

// ══ CẬP NHẬT NÚT CLOUD ════════════════════════════════════
function updateJbBtn() {
  const btn = document.getElementById('jb-btn');
  if (btn) {
    if (fbReady()) {
      btn.textContent = '✅ Cloud';
      btn.style.background = 'rgba(26,122,69,0.4)';
      btn.style.borderColor = 'rgba(26,200,100,0.5)';
      _ensureSyncDot();
    } else {
      btn.textContent = '☁️ Cloud';
      btn.style.background = 'rgba(255,255,255,0.12)';
      btn.style.borderColor = 'rgba(255,255,255,0.25)';
      const dot = document.getElementById('sync-dot');
      if (dot) dot.className = 'hidden';
    }
  }
  // Đồng bộ trạng thái Cloud trong user dropdown (cả guest + auth view)
  const statusText  = fbReady() ? '✅ Đã kết nối' : 'Chưa kết nối';
  const statusColor = fbReady() ? '#16a34a' : '#9ca3af';
  ['ud-cloud-status-guest', 'ud-cloud-status-auth'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = statusText; el.style.color = statusColor; }
  });
}

// VI: Sync status dot
function _ensureSyncDot() {
  const btn = document.getElementById('jb-btn');
  if (!btn || document.getElementById('sync-dot')) return;
  const dot = document.createElement('span');
  dot.id = 'sync-dot';
  btn.style.position = 'relative';
  btn.appendChild(dot);
}
function _setSyncDot(status) {
  const dot = document.getElementById('sync-dot');
  if (!dot) return;
  dot.className = status || '';
}


// ══ MODAL CẤU HÌNH ════════════════════════════════════════
function openBinModal() { renderBinModal(); }
function closeBinModal() {
  const ov = document.getElementById('bin-modal-overlay');
  if(ov) ov.style.display='none';
}

function renderBinModal() {
  const yr = activeYear || new Date().getFullYear();
  const ov = document.getElementById('bin-modal-overlay') || _createModalOverlay();
  const isConnected = fbReady();
  const yearKb = isConnected ? estimateYearKb(yr) : 0;

  const statusColor = yearKb < 200 ? 'var(--bs-success)' : yearKb < 500 ? '#e67e00' : 'var(--bs-danger)';
  const statusBg    = yearKb < 200 ? '#d4edda'  : yearKb < 500 ? '#fff3cd' : '#f8d7da';
  const statusLabel = yearKb < 200 ? '✅ OK'    : yearKb < 500 ? '⚠️ Khá lớn' : '🔴 Lớn';

  ov.innerHTML = `<div onclick="event.stopPropagation()" style="max-width:460px;width:95vw;background:#fff;border-radius:16px;padding:24px;font-family:'IBM Plex Sans',sans-serif;box-shadow:0 12px 48px rgba(0,0,0,.18)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-size:17px;font-weight:800;margin:0">🔥 Kết Nối Firebase</h3>
      <button onclick="closeBinModal()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#888;line-height:1">✕</button>
    </div>

    ${isConnected ? `
    <div style="background:#f0fff4;border:1px solid #b2dfdb;border-radius:8px;padding:10px 14px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:var(--bs-success);margin-bottom:4px">✅ ĐÃ KẾT NỐI</div>
      <div style="font-size:11px;color:#555">Project: <strong>${FB_CONFIG.projectId}</strong></div>
      <div style="font-size:11px;color:#888;margin-top:2px">API Key: ${FB_CONFIG.apiKey.substring(0,8)}••••••••</div>
    </div>
    <div style="background:var(--bs-tertiary-bg);border-radius:8px;padding:8px 12px;margin-bottom:14px;font-size:12px">
      📊 Dữ liệu năm ${yr}: <strong style="color:${statusColor}">${yearKb}kb</strong>
      <span style="margin-left:6px;background:${statusBg};color:${statusColor};border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700">${statusLabel}</span>
      <div style="font-size:10px;color:#aaa;margin-top:2px">Firebase free: 1GB storage · 50K reads/ngày · 20K writes/ngày</div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px">
      <button onclick="manualSync();closeBinModal();" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #1565c0;background:transparent;color:#1565c0;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">🔄 Sync</button>
      <button onclick="fbDisconnect()" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid var(--bs-danger);background:transparent;color:var(--bs-danger);font-family:inherit;font-size:13px;cursor:pointer">⛔ Ngắt</button>
    </div>
    ` : `
    <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;margin-bottom:14px;font-size:13px;color:#856404">
      Nhập <strong>Project ID</strong> và <strong>Web API Key</strong> từ Firebase Console để kết nối.
    </div>
    `}

    <div style="margin-bottom:10px">
      <label style="font-size:11px;font-weight:700;color:#555;display:block;margin-bottom:4px">PROJECT ID</label>
      <input id="fb-proj-input" type="text" value="${FB_CONFIG.projectId}"
        placeholder="your-project-id"
        style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid #ddd;border-radius:8px;font-family:'IBM Plex Mono',monospace;font-size:12px;outline:none">
    </div>
    <div style="margin-bottom:14px">
      <label style="font-size:11px;font-weight:700;color:#555;display:block;margin-bottom:4px">WEB API KEY</label>
      <input id="fb-key-input" type="text" value="${FB_CONFIG.apiKey}"
        placeholder="AIzaSy..."
        style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid #ddd;border-radius:8px;font-family:'IBM Plex Mono',monospace;font-size:12px;outline:none">
    </div>
    <button onclick="fbSaveConfig()" style="width:100%;padding:12px;border-radius:8px;border:none;background:#1a1814;color:#fff;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:10px">
      💾 ${isConnected ? 'Cập Nhật Kết Nối' : 'Kết Nối Firebase'}
    </button>
    <div style="font-size:11px;color:#aaa;text-align:center;line-height:1.6">
      Firebase free tier: 1GB · Không giới hạn size/file · Google hỗ trợ lâu dài
    </div>
  </div>`;
  ov.style.display = 'flex';
}

function _createModalOverlay() {
  let ov = document.getElementById('bin-modal-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'bin-modal-overlay';
    // [CHẶN ĐÓNG NHẦM] Đã bỏ đóng khi click nền — popup chỉ đóng bằng nút ✕ để tránh mất dữ liệu đang nhập
    ov.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;align-items:center;justify-content:center';
    document.body.appendChild(ov);
  }
  return ov;
}

function fbSaveConfig() {
  const proj = (document.getElementById('fb-proj-input')?.value||'').trim();
  const key  = (document.getElementById('fb-key-input')?.value||'').trim();
  if (!proj || !key) { toast('Vui lòng nhập đủ Project ID và API Key!', 'error'); return; }
  FB_CONFIG.projectId = proj;
  FB_CONFIG.apiKey    = key;
  _saveLS(FB_CFG_KEY, { projectId: proj, apiKey: key });
  closeBinModal();
  toast('✅ Đã lưu cấu hình Firebase! Đang tải dữ liệu...', 'success');
  updateJbBtn();
  reloadFromCloud();
}

function fbDisconnect() {
  if (!confirm('Ngắt kết nối Firebase? Dữ liệu local vẫn còn.')) return;
  FB_CONFIG.projectId = '';
  FB_CONFIG.apiKey    = '';
  localStorage.removeItem(FB_CFG_KEY);
  closeBinModal();
  updateJbBtn();
  toast('Đã ngắt kết nối Firebase');
}

function reloadFromCloud() {
  showSyncBanner('⏳ Đang tải dữ liệu...');
  gsLoadAll(function(data) {
    if (!data) { hideSyncBanner(); toast('⚠️ Không tải được dữ liệu từ cloud', 'error'); return; }
    // _reloadGlobals() đã cover toàn bộ: invoices, ungRecords, ccData (dedup), tbData,
    // cats (bao gồm thauPhu, congNhan), projects, hopDongData, thuRecords,
    // thauPhuContracts, cnRoles, migration hopdong, rebuildCatCT, rebuildCCCategories...
    _reloadGlobals();
    buildYearSelect();
    rebuildEntrySelects(); rebuildUngSelects();
    buildFilters(); filterAndRender(); renderTrash();
    renderCCHistory(); renderCCTLT();
    buildUngFilters(); filterAndRenderUng();
    renderCtPage(); updateTop(); renderSettings();
    toast('✅ Đã tải dữ liệu từ Firebase!', 'success');
  });
}

function syncNow() {
  closeBinModal();
  reloadFromCloud();
}

function buildYearSelect(skipCloud) {
  const years = new Set();
  years.add(new Date().getFullYear());
  invoices.forEach(i=>{ if(i.ngay) years.add(parseInt(i.ngay.slice(0,4))); });
  ungRecords.forEach(u=>{ if(u.ngay) years.add(parseInt(u.ngay.slice(0,4))); });
  ccData.forEach(w=>{ if(w.fromDate) years.add(parseInt(w.fromDate.slice(0,4))); });
  _renderYearSelect(years);

  // Nếu Firebase ready → fetch danh sách doc để biết có năm nào
  if(fbReady() && !skipCloud) {
    fetch(`${FS_BASE()}?key=${FB_CONFIG.apiKey}&pageSize=300`)
      .then(r=>r.json()).then(data=>{
        if(data.documents) {
          data.documents.forEach(doc=>{
            const seg = doc.name.split('/').pop();
            if(seg && seg.startsWith('y')) {
              const yr = parseInt(seg.slice(1));
              if(!isNaN(yr) && yr > 2000 && yr < 2100) years.add(yr);
            }
          });
          _renderYearSelect(years);
        }
      }).catch(()=>{});
  }
}

function _renderYearSelect(years) {
  const list = document.getElementById('year-list');
  if (!list) return;
  const sorted = [...years].sort((a,b)=>b-a);
  const ay = typeof activeYears !== 'undefined' ? activeYears : new Set();
  list.innerHTML = sorted.map(y =>
    `<label class="year-item">
      <input type="checkbox" value="${y}" ${ay.has(y)?'checked':''}
             onclick="event.stopPropagation();onYearToggle(${y})">
      <span>${y}</span>
    </label>`
  ).join('');
  _updateYearBtn();
}

// Cập nhật text trên nút toggle
function _updateYearBtn() {
  const btn = document.getElementById('year-select-btn');
  if (!btn) return;
  const ay = typeof activeYears !== 'undefined' ? activeYears : new Set();
  if (ay.size === 0) btn.textContent = 'Tất cả';
  else btn.textContent = [...ay].sort((a,b)=>a-b).join(', ');
}

function saveCats(catId) {
  const cfg = CATS.find(c=>c.id===catId);
  if (cfg) {
    save(cfg.sk, cats[catId]); // ghi _mem + IDB + trigger sync
    if (catId === 'congTrinh') {
      save('cat_ct_years', cats.congTrinhYears || {});
    }
    // Đồng bộ sang cat_items_v1 để track soft-delete per-item
    _syncCatItems(catId, cats[catId]);
  }
  // Realtime: refresh tất cả dropdowns nhập liệu
  if (typeof refreshEntryDropdowns === 'function') refreshEntryDropdowns();
}


// ══════════════════════════════════════════════════════════════════
// [MODULE: CAT ITEMS v1] — per-item tracking, soft-delete, cross-device sync
// Mục đích: thay thế string-array override bằng merge per-item có updatedAt
// Backward compat: cats.loaiChiPhi v.v. vẫn là string[] cho toàn bộ UI
// ══════════════════════════════════════════════════════════════════

// Helper: chuẩn hóa key để so sánh trùng trong cat_items_v1
// (bỏ dấu TV, lowercase, trim khoảng trắng thừa)
function _catNormKey(s) {
  return (s || '').normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Dọn dẹp duplicate trong cat_items_v1 (gọi lúc startup & sau pull)
// Giữ bản có updatedAt cao nhất, mark bản còn lại isDeleted=true
function _dedupCatItemsNow() {
  const allItems = load('cat_items_v1', {});
  if (!allItems || !Object.keys(allItems).length) return false;
  let changed = false;
  const now = Date.now();
  Object.keys(allItems).forEach(type => {
    const byNorm = new Map(); // normKey → item (winner)
    (allItems[type] || []).forEach(item => {
      if (item.isDeleted) return;
      const norm = _catNormKey(item.name);
      if (!byNorm.has(norm)) { byNorm.set(norm, item); return; }
      // Duplicate: giữ bản mới hơn, delete bản cũ hơn
      const winner = byNorm.get(norm);
      if ((item.updatedAt || 0) > (winner.updatedAt || 0)) {
        winner.isDeleted = true; winner.updatedAt = now;
        byNorm.set(norm, item);
      } else {
        item.isDeleted = true; item.updatedAt = now;
      }
      changed = true;
    });
  });
  if (changed) {
    _memSet('cat_items_v1', allItems);
    console.log('[Cats] _dedupCatItemsNow: cleaned up duplicate items');
  }
  return changed;
}

// Mapping: catId (dùng trong code) → type key trong cat_items_v1
const _CATITEM_TYPE_MAP = {
  loaiChiPhi: 'loai',
  nhaCungCap: 'ncc',
  nguoiTH:    'nguoi',
  thauPhu:    'tp',
  congNhan:   'cn',
  tbTen:      'tbteb',
  // congTrinh không có ở đây — được quản lý bởi projects_v1
};

// ── Canonical display format rules ────────────────────────────
// Nhận cả catId ('loaiChiPhi', 'tbTen', ...) lẫn type key ('loai', 'tbteb', ...)
const _CAT_FORMAT_RULES = {
  loaiChiPhi: 'title', tbTen:  'title',  // catId → Title Case
  loai:       'title', tbteb:  'title',  // type  → Title Case
  nhaCungCap: 'upper', nguoiTH: 'upper', thauPhu: 'upper', congNhan: 'upper',
  ncc:        'upper', nguoi:   'upper', tp:      'upper', cn:       'upper',
};

/**
 * Chuẩn hóa tên danh mục theo loại (nguồn chính thức duy nhất cho rule format).
 * loaiChiPhi / loai / tbTen / tbteb → Title Case (chữ đầu mỗi từ viết hoa).
 * Các loại còn lại → UPPERCASE.
 * Giữ dấu tiếng Việt. Trim + chuẩn hóa khoảng trắng.
 */
function normalizeCatDisplayName(catIdOrType, name) {
  name = (name || '').trim().replace(/\s+/g, ' ');
  if (!name) return name;
  if ((_CAT_FORMAT_RULES[catIdOrType] || 'upper') === 'title') {
    return name.toLowerCase().split(' ').filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return name.toUpperCase();
}

/**
 * Đồng bộ string array → cat_items_v1 sau mỗi lần user thay đổi danh mục.
 * Tự detect thêm mới (add) và xóa (isDeleted=true).
 * Gọi từ saveCats() — không tăng pending (saveCats đã tăng qua save(cfg.sk)).
 */
function _syncCatItems(catId, nameArr) {
  const type = _CATITEM_TYPE_MAP[catId];
  if (!type) return; // congTrinh → bỏ qua
  const allItems = load('cat_items_v1', {});
  const typeItems = (allItems[type] || []).slice();
  const now = Date.now();

  // Canonicalize tên các item đang tồn tại (sửa "COPHA" → "Copha", v.v.)
  typeItems.forEach(item => {
    if (item.isDeleted) return;
    const canonical = normalizeCatDisplayName(type, item.name);
    if (canonical !== item.name) {
      item.name = canonical;
      item.updatedAt = now;
    }
  });

  // Dedup nameArr trước (phòng khi array đã bị rác từ trước)
  const seenNorm = new Set();
  const dedupedNames = (nameArr || []).filter(Boolean).filter(name => {
    const k = _catNormKey(name);
    return seenNorm.has(k) ? false : (seenNorm.add(k), true);
  });
  // Dùng normalized key để so sánh — tránh tạo UUID mới khi chỉ khác case/dấu
  const nameSetNorm = new Set(dedupedNames.map(_catNormKey));

  // Soft-delete: item active nhưng không còn trong nameArr (normalized)
  typeItems.forEach(item => {
    const norm = _catNormKey(item.name);
    if (!item.isDeleted && !nameSetNorm.has(norm)) {
      item.isDeleted = true;
      item.updatedAt = now;
    }
    // Khôi phục nếu tên xuất hiện lại
    if (item.isDeleted && nameSetNorm.has(norm)) {
      item.isDeleted = false;
      item.updatedAt = now;
    }
  });

  // Thêm mới: tên chưa có trong items (normalized) — tránh tạo UUID trùng
  const existingNorm = new Set(typeItems.map(i => _catNormKey(i.name)));
  dedupedNames.forEach(name => {
    const k = _catNormKey(name);
    if (!existingNorm.has(k)) {
      typeItems.push({ id: crypto.randomUUID(), name, isDeleted: false, updatedAt: now });
      existingNorm.add(k); // tránh thêm 2 lần trong cùng 1 loop
    }
  });

  allItems[type] = typeItems;
  _memSet('cat_items_v1', allItems);
  rebuildCatIdMaps();
}

/**
 * Đổi tên item master TẠI CHỖ (giữ nguyên id) → mọi record trỏ tới id này tự
 * cập nhật tên qua recCatName()/catName(), không cần quét/sửa từng record.
 * oldName so khớp normalized (bắt cả trường hợp tên cũ sai hoa/thường/dấu).
 * @returns {boolean} true nếu đã đổi tên.
 */
function renameCatItemInPlace(catIdOrType, oldName, newName) {
  const type = _catType(catIdOrType);
  if (!type || !newName) return false;
  const allItems = load('cat_items_v1', {});
  const arr = allItems[type] || [];
  const normOld = _catNormKey(oldName);
  let item = arr.find(it => it && !it.isDeleted && _catNormKey(it.name) === normOld);
  if (!item) item = arr.find(it => it && _catNormKey(it.name) === normOld);
  if (!item) return false;
  item.name = newName;
  item.isDeleted = false;
  item.updatedAt = Date.now();
  allItems[type] = arr;
  _memSet('cat_items_v1', allItems);
  rebuildCatIdMaps();
  return true;
}

/**
 * Rebuild string arrays từ cat_items_v1 (filter !isDeleted).
 * Gọi sau pull (để áp dụng soft-delete từ cloud) và sau _reloadGlobals().
 */
function _rebuildCatArrsFromItems() {
  // Dọn rác duplicate trước khi rebuild (fix dữ liệu xấu đã tồn tại)
  _dedupCatItemsNow();
  const allItems = load('cat_items_v1', {});
  if (!allItems || !Object.keys(allItems).length) return;

  // Canonicalize item.name trong cat_items_v1 (sửa "COPHA" → "Copha", v.v.)
  const now = Date.now();
  let itemsChanged = false;
  Object.keys(allItems).forEach(type => {
    (allItems[type] || []).forEach(item => {
      if (item.isDeleted) return;
      const canonical = normalizeCatDisplayName(type, item.name);
      if (canonical !== item.name) {
        item.name = canonical;
        item.updatedAt = now;
        itemsChanged = true;
      }
    });
  });
  // Dùng save() thay _memSet() khi có thay đổi để push lên cloud
  if (itemsChanged) save('cat_items_v1', allItems);

  // Rebuild string arrays với tên đã canonical + dedup
  const nameArr = (items, type) => {
    const seen = new Set();
    return (items || []).filter(i => !i.isDeleted)
      .map(i => normalizeCatDisplayName(type, i.name))
      .filter(name => { const k = _catNormKey(name); return seen.has(k) ? false : (seen.add(k), true); });
  };
  if (allItems.loai)  { cats.loaiChiPhi = nameArr(allItems.loai,  'loai');  _memSet('cat_loai',  cats.loaiChiPhi); }
  if (allItems.ncc)   { cats.nhaCungCap = nameArr(allItems.ncc,   'ncc');   _memSet('cat_ncc',   cats.nhaCungCap); }
  if (allItems.nguoi) { cats.nguoiTH    = nameArr(allItems.nguoi, 'nguoi'); _memSet('cat_nguoi', cats.nguoiTH); }
  if (allItems.tp)    { cats.thauPhu    = nameArr(allItems.tp,    'tp');    _memSet('cat_tp',    cats.thauPhu); }
  if (allItems.cn)    { cats.congNhan   = nameArr(allItems.cn,    'cn');    _memSet('cat_cn',    cats.congNhan); }
  if (allItems.tbteb) { cats.tbTen      = nameArr(allItems.tbteb, 'tbteb'); _memSet('cat_tbteb', cats.tbTen); }
  rebuildCatIdMaps();
}

// ══════════════════════════════════════════════════════════════
//  CAT ID RESOLUTION LAYER — id là nguồn chân lý, tên là cache hiển thị
// ══════════════════════════════════════════════════════════════
// Record nghiệp vụ lưu *Id (loaiId, nccId, nguoiId, tpId, cnId, tenId) trỏ vào
// cat_items_v1[type][].id. Tên hiển thị luôn resolve từ master qua catName() —
// nên đổi tên trong Danh mục lan tức thì khắp app, KHÔNG cần quét record.
// Trường text cũ (loai, ncc, ...) chỉ còn là fallback khi id không resolve được.

// Per-type lookup: { [type]: { byId: Map<id,item>, byNorm: Map<normKey,id> } }
let _catIdMaps = {};

// Chuẩn hóa catId ('loaiChiPhi') hoặc type ('loai') → type key trong cat_items_v1
function _catType(catIdOrType) {
  return _CATITEM_TYPE_MAP[catIdOrType] || catIdOrType;
}

// Rebuild cache map id↔item từ cat_items_v1. Gọi sau mọi thay đổi items.
function rebuildCatIdMaps() {
  const allItems = load('cat_items_v1', {});
  const maps = {};
  Object.keys(allItems || {}).forEach(type => {
    const byId = new Map();
    const byNorm = new Map();
    (allItems[type] || []).forEach(item => {
      if (!item || !item.id) return;
      byId.set(item.id, item);
      // Ưu tiên item active khi 2 item cùng normKey (item xóa mềm không ghi đè active)
      const k = _catNormKey(item.name);
      if (k && (!byNorm.has(k) || !item.isDeleted)) byNorm.set(k, item.id);
    });
    maps[type] = { byId, byNorm };
  });
  _catIdMaps = maps;
}

// Resolve id → tên hiển thị (kể cả item đã xóa mềm — tên vẫn giữ trong master).
// Fallback về text cũ nếu id rỗng/không tìm thấy.
function catName(catIdOrType, id, fallback) {
  if (id) {
    const m = _catIdMaps[_catType(catIdOrType)];
    const item = m && m.byId.get(id);
    if (item) return item.name;
  }
  return fallback || '';
}

// Resolve tên → id (so khớp normalized). null nếu không có trong danh mục.
function catIdByName(catIdOrType, name) {
  if (!name) return null;
  const m = _catIdMaps[_catType(catIdOrType)];
  if (!m) return null;
  return m.byNorm.get(_catNormKey(name)) || null;
}

// Map field text → field id + type danh mục, theo từng loại record.
// ung dùng discriminator r.loai để chọn type cho field `tp`.
const _CAT_ID_FIELDS = {
  inv:     [['loai', 'loaiId', 'loai'], ['ncc', 'nccId', 'ncc'], ['nguoi', 'nguoiId', 'nguoi']],
  thu:     [['nguoi', 'nguoiId', 'nguoi']],
  hopdong: [['nguoi', 'nguoiId', 'nguoi']],
  thauphu: [['thauphu', 'thauphuId', 'tp']],
  tb:      [['ten', 'tenId', 'tbteb']],
};
const _UNG_LOAI_TYPE = { thauphu: 'tp', nhacungcap: 'ncc', congnhan: 'cn' };

/**
 * Gắn *Id vào record từ giá trị text, dùng cat_items_v1 làm nguồn chân lý.
 * Idempotent. id=null nếu text không khớp danh mục (vẫn giữ text làm fallback).
 * @param {Object} rec   Record cần stamp (mutate tại chỗ)
 * @param {string} kind  'inv' | 'thu' | 'hopdong' | 'thauphu' | 'tb' | 'ung' | 'cc'
 */
function stampCatIds(rec, kind) {
  if (!rec) return rec;
  if (kind === 'ung') {
    const type = _UNG_LOAI_TYPE[rec.loai || 'thauphu'] || 'tp';
    rec.tpId = catIdByName(type, rec.tp);
    return rec;
  }
  if (kind === 'cc') {
    (rec.workers || []).forEach(wk => { wk.cnId = catIdByName('cn', wk.name); });
    return rec;
  }
  const fields = _CAT_ID_FIELDS[kind];
  if (fields) fields.forEach(([tf, idf, type]) => { rec[idf] = catIdByName(type, rec[tf]); });
  return rec;
}

// Resolve tên hiển thị cho field danh mục của record (id ưu tiên, text fallback).
// Dùng ở mọi nơi render/export thay cho đọc rec[textField] trực tiếp.
function recCatName(rec, kind, which) {
  if (!rec) return '';
  if (kind === 'ung' && which === 'tp') {
    const type = _UNG_LOAI_TYPE[rec.loai || 'thauphu'] || 'tp';
    return catName(type, rec.tpId, rec.tp);
  }
  const map = {
    inv:     { loai: ['loaiId', 'loai', 'loai'], ncc: ['nccId', 'ncc', 'ncc'], nguoi: ['nguoiId', 'nguoi', 'nguoi'] },
    thu:     { nguoi: ['nguoiId', 'nguoi', 'nguoi'] },
    hopdong: { nguoi: ['nguoiId', 'nguoi', 'nguoi'] },
    thauphu: { thauphu: ['thauphuId', 'thauphu', 'tp'] },
    tb:      { ten: ['tenId', 'ten', 'tbteb'] },
  };
  const spec = map[kind] && map[kind][which];
  if (!spec) return '';
  const [idf, tf, type] = spec;
  return catName(type, rec[idf], rec[tf]);
}

/**
 * Migration một lần: tạo cat_items_v1 từ string arrays hiện có.
 * Idempotent — gọi bao nhiêu lần cũng an toàn.
 */
function _migrateCatItemsIfNeeded() {
  const existing = load('cat_items_v1', {});
  if (existing && Object.keys(existing).length) return; // đã migrate rồi
  const now = Date.now();
  const toItems = (arr) => (arr || []).map(name => ({
    id: crypto.randomUUID(), name, isDeleted: false, updatedAt: now
  }));
  const allItems = {
    loai:  toItems(cats.loaiChiPhi),
    ncc:   toItems(cats.nhaCungCap),
    nguoi: toItems(cats.nguoiTH),
    tp:    toItems(cats.thauPhu),
    cn:    toItems(cats.congNhan),
    tbteb: toItems(cats.tbTen),
  };
  _memSet('cat_items_v1', allItems); // ghi IDB, không tăng pending (reset ở startup)
  console.log('[Cats] Migrated string arrays → cat_items_v1');
}


// ══════════════════════════════════════════════════════════════
//  SYNC BANNER & STATE UI
// ══════════════════════════════════════════════════════════════

// Debounce: chống spam banner (mỗi 3s tối đa 1 lần, trừ lỗi luôn hiện)
let lastSyncUI = 0;
function showSyncBanner(msg, autohideMs=0) {
  const isError = msg.startsWith('⚠️');
  if (!isError && Date.now() - lastSyncUI < 3000) return;
  if (!isError) lastSyncUI = Date.now();
  let b = document.getElementById('sync-banner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'sync-banner';
    b.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:9999;background:#1a73e8;color:#fff;border-radius:20px;padding:6px 18px;font-size:12px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.2);pointer-events:none;transition:opacity .3s';
    document.body.appendChild(b);
  }
  b.textContent = msg; b.style.opacity='1'; b.style.display='block';
  if (autohideMs) setTimeout(hideSyncBanner, autohideMs);
}
function hideSyncBanner() {
  const b = document.getElementById('sync-banner');
  if (b) { b.style.opacity='0'; setTimeout(()=>b.style.display='none', 300); }
}

// Cập nhật trạng thái sync trên cả #jb-btn lẫn #sync-btn
// state: 'syncing' | 'success' | 'error' | ''
function _setSyncState(state) {
  // ── jb-btn (Cloud button) ────────────────────────────────────
  const jbBtn = document.getElementById('jb-btn');
  if (jbBtn) {
    if (state === 'syncing') {
      jbBtn.textContent = '⏳ Đang sync...';
    } else if (state === 'success') {
      const hhmm = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      jbBtn.textContent = `✅ Đã sync ${hhmm}`;
      setTimeout(() => { if (jbBtn.textContent.includes('Đã sync')) updateJbBtn(); }, 10000);
    } else if (state === 'error') {
      jbBtn.textContent = '⚠️ Sync lỗi';
      setTimeout(() => updateJbBtn(), 8000);
    }
  }
  // ── sync-btn (compact status badge) ─────────────────────────
  const syncBtn = document.getElementById('sync-btn');
  if (syncBtn) {
    if (state === 'syncing') {
      syncBtn.textContent = '⏳';
      syncBtn.title = 'Đang đồng bộ...';
      syncBtn.dataset.state = 'syncing';
    } else if (state === 'success') {
      // Badge sẽ tự cập nhật qua _resetPending() → _updateSyncBtnBadge()
      _updateSyncBtnBadge();
    } else if (state === 'error') {
      syncBtn.textContent = '⚠️';
      syncBtn.title = 'Sync lỗi — nhấn để thử lại';
      syncBtn.dataset.state = 'error';
      setTimeout(() => _updateSyncBtnBadge(), 8000);
    }
  }
}
