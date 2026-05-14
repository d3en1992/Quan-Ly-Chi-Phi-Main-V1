// core.cloud-cats-ui.js — Cloud helpers, Firestore format, category item sync, sync UI
// Load order: 3 (sau core.state-backup.js, trước projects.js và các module nghiệp vụ)
// Kiến trúc: classic script, global scope — KHÔNG dùng import/export


function fbReady() { return FB_CONFIG.apiKey && FB_CONFIG.projectId; }

// ══ NÉN / GIẢI NÉN ═══════════════════════════════════════
// inv: id→i ngay→d congtrinh→c loai→l nguoi→n ncc→s nd→t tien→p thanhtien→q sl→k ccKey→x source→so
//      updatedAt→m createdAt→ca deletedAt→da deviceId→dv projectId→pi
// cc:  id→i fromDate→f toDate→e ct→c updatedAt→a createdAt→ca deletedAt→da deviceId→dv projectId→pi
// ung: id→i updatedAt→a ngay→d tp→t congtrinh→c tien→p nd→n loai→k
//      createdAt→ca deletedAt→da deviceId→dv projectId→pi
// tb:  id→i ct→c ten→t soluong→s tinhtrang→r nguoi→n ghichu→g ngay→d
//      updatedAt→m createdAt→ca deletedAt→da deviceId→dv projectId→pi
function compressInv(arr) {
  return arr.map(o=>{const r={};
    if(o.id!==undefined)r.i=o.id; if(o.ngay)r.d=o.ngay; if(o.congtrinh)r.c=o.congtrinh;
    if(o.projectId)r.pi=o.projectId;
    if(o.source)r.so=o.source;
    if(o.loai)r.l=o.loai; if(o.nguoi)r.n=o.nguoi; if(o.ncc)r.s=o.ncc; if(o.nd)r.t=o.nd;
    if(o.tien)r.p=o.tien; if(o.thanhtien&&o.thanhtien!==o.tien)r.q=o.thanhtien;
    if(o.sl&&o.sl!==1)r.k=o.sl; if(o.ccKey)r.x=o.ccKey;
    if(o.items&&o.items.length)r.it=o.items;
    if(o.footerCkStr)r.fck=o.footerCkStr;
    // Metadata: dùng updatedAt, fallback sang _ts cho record cũ
    r.m=(o.updatedAt||o._ts)||undefined;
    if(o.createdAt)r.ca=o.createdAt; if(o.deletedAt)r.da=o.deletedAt;
    if(o.deviceId)r.dv=o.deviceId; return r;});
}
function expandInv(arr) {
  return (arr||[]).map(o=>({id:o.i,ngay:o.d,congtrinh:o.c,projectId:o.pi||null,loai:o.l,nguoi:o.n||'',ncc:o.s||'',
    nd:o.t||'',tien:o.p||0,thanhtien:o.q||(o.p||0),sl:o.k||undefined,ccKey:o.x||undefined,
    source:o.so||undefined,
    items:o.it||undefined,footerCkStr:o.fck||undefined,
    updatedAt:o.m||undefined,_ts:o.m||undefined,
    createdAt:o.ca||undefined,deletedAt:o.da||null,deviceId:o.dv||undefined}));
}
function compressCC(arr) {
  return (arr||[]).map(w=>({i:w.id,f:w.fromDate,e:w.toDate,c:w.ct,
    ...(w.projectId?{pi:w.projectId}:{}),
    a:w.updatedAt,ca:w.createdAt,da:w.deletedAt,dv:w.deviceId,
    w:w.workers.map(wk=>{const r={n:wk.name,d:wk.d,l:wk.luong};
      if(wk.phucap)r.p=wk.phucap; if(wk.hdmuale)r.h=wk.hdmuale; if(wk.nd)r.t=wk.nd;
      if(wk.tru)r.u=wk.tru; if(wk.loanAmount)r.lo=wk.loanAmount; return r;})}));
}
function expandCC(arr) {
  return (arr||[]).map(w=>({id:w.i,fromDate:w.f,toDate:w.e,ct:w.c,projectId:w.pi||null,updatedAt:w.a,
    createdAt:w.ca||undefined,deletedAt:w.da||null,deviceId:w.dv||undefined,
    workers:(w.w||[]).map(wk=>({name:wk.n,d:wk.d,luong:wk.l||0,phucap:wk.p||0,hdmuale:wk.h||0,nd:wk.t||'',tru:wk.u||0,loanAmount:wk.lo||0}))}));
}
function compressUng(arr) {
  return (arr||[]).map(o=>{const r={i:o.id,a:o.updatedAt,d:o.ngay,t:o.tp||o.ncc||'',c:o.congtrinh,p:o.tien||0,n:o.nd||''};
    if(o.projectId)r.pi=o.projectId;
    if(o.loai&&o.loai!=='thauphu')r.k=o.loai;
    if(o.createdAt)r.ca=o.createdAt; if(o.deletedAt)r.da=o.deletedAt;
    if(o.deviceId)r.dv=o.deviceId; return r;});
}
function expandUng(arr) {
  return (arr||[]).map(o=>({id:o.i,updatedAt:o.a,ngay:o.d,tp:o.t,loai:o.k||'thauphu',congtrinh:o.c,projectId:o.pi||null,tien:o.p||0,nd:o.n||'',
    createdAt:o.ca||undefined,deletedAt:o.da||(o.cl?(o.a||Date.now()):null)||null,deviceId:o.dv||undefined}));
}
function compressTb(arr) {
  return (arr||[]).map(o=>({i:o.id,c:o.ct,t:o.ten,s:o.soluong||0,r:o.tinhtrang,n:o.nguoi||'',g:o.ghichu||'',d:o.ngay||'',
    ...(o.projectId?{pi:o.projectId}:{}),
    m:o.updatedAt,ca:o.createdAt,da:o.deletedAt,dv:o.deviceId}));
}
function expandTb(arr) {
  return (arr||[]).map(o=>({id:o.i,ct:o.c,ten:o.t,soluong:o.s||0,tinhtrang:o.r||'Đang hoạt động',nguoi:o.n||'',ghichu:o.g||'',ngay:o.d||'',
    projectId:o.pi||null,
    updatedAt:o.m||undefined,createdAt:o.ca||undefined,deletedAt:o.da||null,deviceId:o.dv||undefined}));
}


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
function fbDocYear(yr)  { return `y${yr}`; }
function fbDocCats()    { return 'cats'; }

// ── Build payload cho từng loại ───────────────────────────
function fbYearPayload(yr) {
  const y = yr || activeYear || new Date().getFullYear();
  const ys = String(y);
  return { v:3, yr:y,
    i: compressInv(load('inv_v3',[]).filter(x=>x.ngay&&x.ngay.startsWith(ys))),
    u: compressUng(load('ung_v1',[]).filter(x=>x.ngay&&x.ngay.startsWith(ys))),
    c: compressCC(load('cc_v2',[]).filter(x=>x.fromDate&&x.fromDate.startsWith(ys))),
    t: compressTb(load('tb_v1',[]).filter(x=>x.ngay&&x.ngay.startsWith(ys))),
    thu: load('thu_v1',[]).filter(x=>x.ngay&&x.ngay.startsWith(ys)) };
}
function fbCatsPayload() {
  // cat_ct là derived data — rebuild từ projects_v1 — không push lên cloud
  return { v:3,
    cats:{loai:load('cat_loai',DEFAULTS.loaiChiPhi),
      ncc:load('cat_ncc',DEFAULTS.nhaCungCap),nguoi:load('cat_nguoi',DEFAULTS.nguoiTH)},
    users: load('users_v1', []),
    // catItems: per-item tracking với isDeleted/updatedAt — source of truth cho danh mục
    catItems: load('cat_items_v1', {}),
    cnRoles:  load('cat_cn_roles', {}),  // vai trò công nhân { name: 'C'|'T'|'P' }
    ctYears:  load('cat_ct_years', {}),  // năm theo công trình { ctName: year }
    hopDong:  load('hopdong_v1',  {}),  // hợp đồng xuyên suốt, không theo năm
    thauPhu:  load('thauphu_v1',  []),  // HĐ thầu phụ xuyên suốt, không theo năm
    projects: load('projects_v1', []),  // danh sách dự án — source of truth cho công trình
  };
}

// ── Firebase REST helpers ──────────────────────────────────
function fsUrl(docId) {
  return `${FS_BASE()}/${docId}?key=${FB_CONFIG.apiKey}`;
}
function fsGet(docId) {
  return fetch(fsUrl(docId)).then(r=>r.json());
}
function fsSet(docId, payload) {
  // PATCH = upsert (tạo hoặc cập nhật)
  return fetch(`${FS_BASE()}/${docId}?key=${FB_CONFIG.apiKey}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fsWrap(payload))
  }).then(r=>r.json());
}

// ── Estimate size ──────────────────────────────────────────
function estimateYearKb(yr) {
  const ys = String(yr || activeYear || new Date().getFullYear());
  const data = {
    i: compressInv(load('inv_v3',[]).filter(x=>x.ngay&&x.ngay.startsWith(ys))),
    u: compressUng(load('ung_v1',[]).filter(x=>x.ngay&&x.ngay.startsWith(ys))),
    c: compressCC(load('cc_v2',[]).filter(x=>x.fromDate&&x.fromDate.startsWith(ys))),
  };
  return Math.round(JSON.stringify(data).length/1024*10)/10;
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
  if (!btn) return;
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

  const statusColor = yearKb < 200 ? '#1a7a45' : yearKb < 500 ? '#e67e00' : '#c0392b';
  const statusBg    = yearKb < 200 ? '#d4edda'  : yearKb < 500 ? '#fff3cd' : '#f8d7da';
  const statusLabel = yearKb < 200 ? '✅ OK'    : yearKb < 500 ? '⚠️ Khá lớn' : '🔴 Lớn';

  ov.innerHTML = `<div onclick="event.stopPropagation()" style="max-width:460px;width:95vw;background:#fff;border-radius:16px;padding:24px;font-family:'IBM Plex Sans',sans-serif;box-shadow:0 12px 48px rgba(0,0,0,.18)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-size:17px;font-weight:800;margin:0">🔥 Kết Nối Firebase</h3>
      <button onclick="closeBinModal()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#888;line-height:1">✕</button>
    </div>

    ${isConnected ? `
    <div style="background:#f0fff4;border:1px solid #b2dfdb;border-radius:8px;padding:10px 14px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:#1a7a45;margin-bottom:4px">✅ ĐÃ KẾT NỐI</div>
      <div style="font-size:11px;color:#555">Project: <strong>${FB_CONFIG.projectId}</strong></div>
      <div style="font-size:11px;color:#888;margin-top:2px">API Key: ${FB_CONFIG.apiKey.substring(0,8)}••••••••</div>
    </div>
    <div style="background:#f5f4f0;border-radius:8px;padding:8px 12px;margin-bottom:14px;font-size:12px">
      📊 Dữ liệu năm ${yr}: <strong style="color:${statusColor}">${yearKb}kb</strong>
      <span style="margin-left:6px;background:${statusBg};color:${statusColor};border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700">${statusLabel}</span>
      <div style="font-size:10px;color:#aaa;margin-top:2px">Firebase free: 1GB storage · 50K reads/ngày · 20K writes/ngày</div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px">
      <button onclick="manualSync();closeBinModal();" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #1565c0;background:transparent;color:#1565c0;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">🔄 Sync</button>
      <button onclick="fbDisconnect()" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #c0392b;background:transparent;color:#c0392b;font-family:inherit;font-size:13px;cursor:pointer">⛔ Ngắt</button>
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
    ov.onclick = function(e) { if(e.target===this) closeBinModal(); };
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

function buildYearSelect() {
  const years = new Set();
  years.add(new Date().getFullYear());
  invoices.forEach(i=>{ if(i.ngay) years.add(parseInt(i.ngay.slice(0,4))); });
  ungRecords.forEach(u=>{ if(u.ngay) years.add(parseInt(u.ngay.slice(0,4))); });
  ccData.forEach(w=>{ if(w.fromDate) years.add(parseInt(w.fromDate.slice(0,4))); });
  _renderYearSelect(years);

  // Nếu Firebase ready → fetch danh sách doc để biết có năm nào
  if(fbReady()) {
    fetch(`${FS_BASE()}?key=${FB_CONFIG.apiKey}&pageSize=20`)
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
  // Dedup output: phòng trường hợp cat_items_v1 vẫn còn rác sau dedup
  const nameArr = (items) => {
    const seen = new Set();
    return (items || []).filter(i => !i.isDeleted).map(i => i.name)
      .filter(name => { const k = _catNormKey(name); return seen.has(k) ? false : (seen.add(k), true); });
  };
  if (allItems.loai)  { cats.loaiChiPhi = nameArr(allItems.loai);  _memSet('cat_loai',  cats.loaiChiPhi); }
  if (allItems.ncc)   { cats.nhaCungCap = nameArr(allItems.ncc);   _memSet('cat_ncc',   cats.nhaCungCap); }
  if (allItems.nguoi) { cats.nguoiTH    = nameArr(allItems.nguoi); _memSet('cat_nguoi', cats.nguoiTH); }
  if (allItems.tp)    { cats.thauPhu    = nameArr(allItems.tp);    _memSet('cat_tp',    cats.thauPhu); }
  if (allItems.cn)    { cats.congNhan   = nameArr(allItems.cn);    _memSet('cat_cn',    cats.congNhan); }
  if (allItems.tbteb) { cats.tbTen      = nameArr(allItems.tbteb); _memSet('cat_tbteb', cats.tbTen); }
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
