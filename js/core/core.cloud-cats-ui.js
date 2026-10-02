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
// ── CẤU TRÚC MỚI (B): mỗi hạng mục theo năm = 1 document, + 5 doc danh mục dùng chung ──
// Tên field bên trong viết ĐẦY ĐỦ (không nén) cho dễ đọc trên Firebase Console.
//   cpct_data/meta_cong_trinh  → { projects }
//   cpct_data/meta_khach_hang  → { customers }   (CRM/Chủ đầu tư — tách riêng từ 19/06/2026)
//   cpct_data/meta_danh_muc    → { cats, catItems, cnRoles, ctYears }
//   cpct_data/meta_tai_khoan   → { users }
//   cpct_data/meta_hop_dong    → { hopDong, thauPhu }
//   cpct_data/meta_quyet_toan  → { quyetToan }   (tách riêng từ 03/10/2026 — trước nằm trong meta_hop_dong)
//        mỗi bản ghi quyết toán luôn có createdAt / updatedAt / deletedAt (null = chưa xóa)
//   cpct_data/y2025_hoa_don / _tien_ung / _cham_cong / _thiet_bi / _thu_tien → { records }
function fbDocYearCat(yr, cat) { return `y${yr}_${cat}`; }
function fbDocMetaCT() { return 'meta_cong_trinh'; }
function fbDocMetaKH() { return 'meta_khach_hang'; }
function fbDocMetaDM() { return 'meta_danh_muc'; }
function fbDocMetaTK() { return 'meta_tai_khoan'; }
function fbDocMetaHD() { return 'meta_hop_dong'; }
function fbDocMetaQT() { return 'meta_quyet_toan'; }

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
  // (01/10/2026) Chấm công đời cũ có thể chỉ có 'from' (không có fromDate) → dùng cùng
  // quy tắc với _recYearDoc() trong core.storage.js, để record (và lệnh xóa của nó)
  // được đẩy vào ĐÚNG doc năm thay vì bị bỏ sót.
  const records = load(key, []).filter(x => {
    const d = x && (x[dateField] || (key === 'cc_v2' ? x.from : null));
    return d && String(d).startsWith(ys);
  });
  return { v: 4, yr: Number(yr), cat: key, records };
}

// Payload 4 doc danh mục dùng chung
function fbMetaCTPayload() {
  // Chỉ còn projects — customers đã tách sang doc riêng meta_khach_hang (19/06/2026)
  return { v: 4, projects: load('projects_v1', []) };
}
function fbMetaKHPayload() {
  // Khách hàng (Chủ đầu tư/CRM) — doc riêng meta_khach_hang
  return { v: 4, customers: load('customers_v1', []) };
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
  // (03/10/2026) KHÔNG còn quyetToan — đã tách sang doc riêng meta_quyet_toan.
  // Ghi doc này sẽ xóa luôn field quyetToan đời cũ trên cloud (doc được ghi nguyên khối).
  return { v: 4, hopDong: load('hopdong_v1', {}), thauPhu: load('thauphu_v1', []) };
}
function fbMetaQTPayload() {
  // Quyết toán công trình — doc riêng meta_quyet_toan. Đảm bảo đủ 3 trường lưu vết thời gian.
  return { v: 4, quyetToan: _qtAuditFields(load('quyettoan_v1', [])) };
}
// Bổ sung createdAt / updatedAt / deletedAt cho bản ghi quyết toán đời cũ còn thiếu
// (bản ghi mới đã có sẵn nhờ mkRecord / mkUpdate / xóa mềm). Không đổi giá trị đã có.
function _qtAuditFields(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(r => {
    if (!r || typeof r !== 'object') return r;
    if (r.createdAt && r.updatedAt && r.deletedAt !== undefined) return r;
    const c = r.createdAt || r.updatedAt || 0;
    return { ...r, createdAt: c, updatedAt: r.updatedAt || c, deletedAt: r.deletedAt ?? null };
  });
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
// Tạo Error có kèm mã HTTP (status) + body lỗi Firestore (nếu đọc được)
async function _fsHttpError(r, what) {
  let body = null;
  try { body = await r.json(); } catch {}
  const st  = body && body.error && body.error.status ? ` ${body.error.status}` : '';
  const err = new Error(`[Firestore] ${what} lỗi HTTP ${r.status}${st}`);
  err.status = r.status;
  err.body   = body;
  return err;
}

// ĐỌC 1 doc.
//   • HTTP 200  → trả raw doc (như cũ, caller dùng fsUnwrap())
//   • HTTP 404  → trả null  (doc chưa tồn tại — hợp lệ)
//   • Lỗi mạng / HTTP khác (403, 429, 500...) → THROW Error có .status
// ⚠️ Trước đây hàm này KHÔNG kiểm tra r.ok → lỗi 500/429 bị coi như "doc trống" →
//    push tưởng cloud rỗng rồi GHI ĐÈ mất toàn bộ dữ liệu cloud. Caller giờ phải
//    xử lý throw: trong push → doc đó FAIL, không ghi; trong pull → giữ nguyên local.
async function fsGet(docId) {
  _fsCountRead();
  let r;
  try {
    r = await fetch(fsUrl(docId));
  } catch (e) {
    const err = new Error(`[Firestore] Mất kết nối khi đọc ${docId}`);
    err.status = 0; err.cause = e;
    throw err;
  }
  if (r.status === 404) return null;
  if (!r.ok) throw await _fsHttpError(r, `đọc ${docId}`);
  return r.json();
}

// GHI (upsert) 1 doc KHÔNG điều kiện. HTTP ≠ 2xx hoặc lỗi mạng → THROW (caller coi doc đó FAIL).
// ⚠️ Từ GĐ2 chỉ dùng cho các chỗ CỐ Ý ghi đè: reset toàn bộ (_doResetAll), khôi phục
// (doc có cờ overwrite trong outbox). Mọi chỗ ghi dữ liệu thường dùng fsSetIf().
async function fsSet(docId, payload) {
  _fsCountWrite();
  let r;
  try {
    // PATCH = upsert (tạo hoặc cập nhật)
    r = await fetch(`${FS_BASE()}/${docId}?key=${FB_CONFIG.apiKey}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fsWrap(payload))
    });
  } catch (e) {
    const err = new Error(`[Firestore] Mất kết nối khi ghi ${docId}`);
    err.status = 0; err.cause = e;
    throw err;
  }
  if (!r.ok) throw await _fsHttpError(r, `ghi ${docId}`);
  return r.json();
}

// ══ KHÓA LẠC QUAN (GĐ2) — chống 2 máy ghi đè nhau ══════════════════════
// Ý tưởng: mỗi doc Firestore có "dấu thời gian cập nhật" updateTime (do server cấp,
// đổi mỗi lần doc bị ghi). Khi push: ĐỌC doc (nhớ updateTime) → GỘP → GHI KÈM ĐIỀU
// KIỆN "chỉ ghi nếu updateTime trên server VẪN y như lúc tôi đọc". Nếu máy khác đã
// ghi chen vào giữa → server TỪ CHỐI (xung đột) → đọc lại, gộp lại, ghi lại.
// Nhờ vậy không bao giờ có chuyện máy ghi sau xóa mất record của máy ghi trước.

// Đọc 1 doc kèm updateTime → { data, updateTime, exists, raw }.
//   data   : nội dung đã fsUnwrap (null nếu doc chưa có / không đúng định dạng)
//   exists : doc có tồn tại trên server không (404 → false)
// Lỗi mạng / HTTP ≠ 2xx,404 → THROW (giống fsGet).
async function fsGetWithTime(docId) {
  const raw = await fsGet(docId);
  if (!raw) return { data: null, updateTime: null, exists: false, raw: null };
  return { data: fsUnwrap(raw), updateTime: raw.updateTime || null, exists: true, raw };
}

// Phản hồi lỗi này có phải "xung đột điều kiện" (máy khác vừa ghi chen) không?
// Firestore REST trả về tùy trường hợp: 400 FAILED_PRECONDITION (updateTime lệch),
// 409 ALREADY_EXISTS (đòi "chưa tồn tại" nhưng doc đã có), 412, hoặc 404 khi đòi
// updateTime cũ mà doc đã bị xóa. Xét cả mã HTTP lẫn body error.status.
function _fsIsConflict(status, body, hadUpdateTime) {
  const st = body && body.error && body.error.status;
  if (status === 409 || status === 412) return true;
  if (st === 'FAILED_PRECONDITION' || st === 'ALREADY_EXISTS' || st === 'ABORTED') return true;
  if (status === 404 && hadUpdateTime) return true;
  return false;
}

// GHI CÓ ĐIỀU KIỆN.
//   updateTime có giá trị → chỉ ghi nếu doc trên server vẫn đúng updateTime đó
//   updateTime = null     → chỉ ghi nếu doc CHƯA tồn tại (currentDocument.exists=false)
// Xung đột → THROW Error có .conflict = true (caller đọc-gộp-ghi lại).
// Lỗi khác (mạng, 403, 500...) → THROW Error có .status (caller coi doc đó FAIL).
async function fsSetIf(docId, payload, updateTime) {
  _fsCountWrite();
  const cond = updateTime
    ? `currentDocument.updateTime=${encodeURIComponent(updateTime)}`
    : 'currentDocument.exists=false';
  let r;
  try {
    r = await fetch(`${FS_BASE()}/${docId}?key=${FB_CONFIG.apiKey}&${cond}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fsWrap(payload))
    });
  } catch (e) {
    const err = new Error(`[Firestore] Mất kết nối khi ghi ${docId}`);
    err.status = 0; err.cause = e;
    throw err;
  }
  if (r.ok) return r.json();
  const err = await _fsHttpError(r, `ghi có điều kiện ${docId}`);
  if (_fsIsConflict(r.status, err.body, !!updateTime)) err.conflict = true;
  throw err;
}

// Xóa hẳn 1 doc khỏi Firestore (dùng khi dọn doc rác cấu trúc cũ).
// Giữ kiểu trả về cũ: true/false (không throw). 404 = đã không còn → coi là thành công.
function fsDelete(docId) {
  _fsCountWrite();
  return fetch(`${FS_BASE()}/${docId}?key=${FB_CONFIG.apiKey}`, { method: 'DELETE' })
    .then(r => r.ok || r.status === 404)
    .catch(() => false);
}

// Liệt kê TÊN mọi doc trong cpct_data (chỉ lấy tên — mask 1 field không tồn tại để
// không tải nội dung nặng). Dùng khi khôi phục cần biết cloud đang có những doc năm nào.
// Lỗi → throw.
async function fsListDocIds() {
  const ids = [];
  let pageToken = '';
  for (let guard = 0; guard < 50; guard++) {
    _fsCountRead();
    const q = [`key=${FB_CONFIG.apiKey}`, 'pageSize=300', 'mask.fieldPaths=khongco'];
    if (pageToken) q.push(`pageToken=${encodeURIComponent(pageToken)}`);
    const r = await fetch(`${FS_BASE()}?${q.join('&')}`);
    if (!r.ok) throw await _fsHttpError(r, 'liệt kê cpct_data');
    const j = await r.json();
    (j.documents || []).forEach(d => ids.push(String(d.name || '').split('/').pop()));
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  return ids;
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
      btn.innerHTML = '<span class="material-symbols-outlined msi-gap">check_circle</span>Cloud';
      btn.style.background = 'rgba(26,122,69,0.4)';
      btn.style.borderColor = 'rgba(26,200,100,0.5)';
      _ensureSyncDot();
    } else {
      btn.innerHTML = '<span class="material-symbols-outlined msi-gap">cloud</span>Cloud';
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
  const statusLabel = yearKb < 200 ? '<span class="material-symbols-outlined msi-gap">check_circle</span>OK'    : yearKb < 500 ? '<span class="material-symbols-outlined msi-gap">warning</span>Khá lớn' : '<span class="material-symbols-outlined msi-gap">circle</span>Lớn';

  ov.innerHTML = `<div onclick="event.stopPropagation()" style="max-width:460px;width:95vw;background:#fff;border-radius:16px;padding:24px;font-family:'IBM Plex Sans',sans-serif;box-shadow:0 12px 48px rgba(0,0,0,.18)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-size:17px;font-weight:800;margin:0"><span class="material-symbols-outlined msi-gap">local_fire_department</span>Kết Nối Firebase</h3>
      <button onclick="closeBinModal()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#888;line-height:1"><span class="material-symbols-outlined">close</span></button>
    </div>

    ${isConnected ? `
    <div style="background:#f0fff4;border:1px solid #b2dfdb;border-radius:8px;padding:10px 14px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:var(--bs-success);margin-bottom:4px"><span class="material-symbols-outlined msi-gap">check_circle</span>ĐÃ KẾT NỐI</div>
      <div style="font-size:11px;color:#555">Project: <strong>${FB_CONFIG.projectId}</strong></div>
      <div style="font-size:11px;color:#888;margin-top:2px">API Key: ${FB_CONFIG.apiKey.substring(0,8)}••••••••</div>
    </div>
    <div style="background:var(--bs-tertiary-bg);border-radius:8px;padding:8px 12px;margin-bottom:14px;font-size:12px">
      <span class="material-symbols-outlined msi-gap">bar_chart</span>Dữ liệu năm ${yr}: <strong style="color:${statusColor}">${yearKb}kb</strong>
      <span style="margin-left:6px;background:${statusBg};color:${statusColor};border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700">${statusLabel}</span>
      <div style="font-size:10px;color:#aaa;margin-top:2px">Firebase free: 1GB storage · 50K reads/ngày · 20K writes/ngày</div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px">
      <button onclick="manualSync();closeBinModal();" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #1565c0;background:transparent;color:#1565c0;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer"><span class="material-symbols-outlined msi-gap">sync</span>Sync</button>
      <button onclick="fbDisconnect()" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid var(--bs-danger);background:transparent;color:var(--bs-danger);font-family:inherit;font-size:13px;cursor:pointer"><span class="material-symbols-outlined msi-gap">block</span>Ngắt</button>
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
      <span class="material-symbols-outlined msi-gap">save</span>${isConnected ? 'Cập Nhật Kết Nối' : 'Kết Nối Firebase'}
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
    buildFilters(); filterAndRender();
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

// Lưu 1 danh mục.
// ⚠️ (01/10/2026) Đổi cách làm: cat_items_v1 là NGUỒN GỐC DUY NHẤT. Trước đây hàm này
// so mảng tên cats[catId] với cat_items_v1 rồi tự suy ra "thêm/xóa/hồi sinh" → nếu mảng
// cats[catId] bị CŨ (vd vừa kéo cloud về mà biến global chưa nạp lại) thì tên đã xóa
// trên máy khác bị HỒI SINH, tên mới thêm ở máy khác bị XÓA. Nay:
//   • Thêm / xóa / đổi tên phải gọi rõ ràng catItemUpsert / catItemDelete / renameCatItemInPlace
//   • saveCats chỉ DỰNG LẠI cats[catId] từ master rồi lưu mảng tên (dữ liệu suy ra)
function saveCats(catId) {
  const cfg = CATS.find(c=>c.id===catId);
  if (cfg) {
    if (catId === 'congTrinh') {
      save(cfg.sk, cats[catId]); // congTrinh quản lý bởi projects_v1, không có master item
      save('cat_ct_years', cats.congTrinhYears || {});
    } else if (_CATITEM_TYPE_MAP[catId]) {
      const type = _CATITEM_TYPE_MAP[catId];
      const all  = load('cat_items_v1', {});
      // Máy chưa từng có master cho loại này → khởi tạo từ mảng hiện có (chỉ THÊM)
      if (!Array.isArray(all[type])) _syncCatItems(catId, cats[catId]);
      cats[catId] = _catActiveNames(type);
      save(cfg.sk, cats[catId]); // ghi _mem + IDB + trigger sync
    } else {
      save(cfg.sk, cats[catId]);
    }
  }
  // Realtime: refresh tất cả dropdowns nhập liệu
  if (typeof refreshEntryDropdowns === 'function') refreshEntryDropdowns();
}

// Danh sách tên đang dùng (chưa xóa) của 1 loại trong master — đã canonical + dedup
function _catActiveNames(type) {
  const allItems = load('cat_items_v1', {});
  const seen = new Set();
  return (allItems[type] || []).filter(i => i && !i.isDeleted)
    .map(i => normalizeCatDisplayName(type, i.name))
    .filter(n => { const k = _catNormKey(n); return k && !seen.has(k) ? (seen.add(k), true) : false; });
}

/**
 * THÊM 1 tên vào danh mục (hoặc HỒI SINH nếu tên đó từng bị xóa) — thao tác của người dùng.
 * Đóng dấu updatedAt = bây giờ → thắng mọi bản cũ hơn khi gộp với cloud.
 * Lưu bằng save() → đánh dấu doc meta_danh_muc cần đẩy lên cloud.
 */
function catItemUpsert(catId, name) {
  const type = _catType(catId);
  name = normalizeCatDisplayName(type, name);
  if (!type || !name) return false;
  const allItems = load('cat_items_v1', {});
  const arr = allItems[type] || (allItems[type] = []);
  const norm = _catNormKey(name);
  const now = Date.now();
  // Đã có bản đang dùng → không làm gì
  if (arr.some(it => it && !it.isDeleted && _catNormKey(it.name) === norm)) return false;
  // Có bản đã xóa → hồi sinh chính id đó (giữ liên kết *Id của record cũ)
  const dead = arr.filter(it => it && it.isDeleted && _catNormKey(it.name) === norm)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  if (dead) {
    dead.name = name; dead.isDeleted = false; dead.updatedAt = now; delete dead.seed;
  } else {
    arr.push({ id: crypto.randomUUID(), name, isDeleted: false, updatedAt: now });
  }
  save('cat_items_v1', allItems);
  rebuildCatIdMaps();
  return true;
}

/**
 * XÓA MỀM 1 tên khỏi danh mục — thao tác của người dùng.
 * Đánh dấu isDeleted + updatedAt = bây giờ (bia mộ) để máy khác gộp cũng thấy đã xóa.
 */
function catItemDelete(catId, name) {
  const type = _catType(catId);
  if (!type || !name) return false;
  const allItems = load('cat_items_v1', {});
  const norm = _catNormKey(name);
  const now = Date.now();
  let hit = false;
  (allItems[type] || []).forEach(it => {
    if (it && !it.isDeleted && _catNormKey(it.name) === norm) {
      it.isDeleted = true; it.updatedAt = now; delete it.seed; hit = true;
    }
  });
  if (hit) { save('cat_items_v1', allItems); rebuildCatIdMaps(); }
  return hit;
}

/**
 * Thu thập các tên danh mục ĐANG ĐƯỢC DÙNG trong dữ liệu đã nhập (bỏ record đã xóa).
 * Nguồn dùng chung cho: kiểm tra "đang dùng" (không cho xóa) + tự bổ sung danh mục thiếu.
 * Tên lấy qua recCatName (id ưu tiên) → nếu record trỏ id item đã đổi tên/đã xóa vẫn ra đúng tên.
 * @param {string} type  'loai' | 'ncc' | 'nguoi' | 'tp' | 'cn' | 'tbteb'
 * @returns {Map<normKey, name>}
 */
// Cache ngắn (2 giây) — tab Danh Mục gọi isItemInUse cho TỪNG dòng → tránh quét lại
// toàn bộ dữ liệu hàng trăm lần trong 1 lần vẽ. Dữ liệu đổi (thêm/xóa record) → độ dài
// mảng đổi → tự tính lại ngay.
const _catUsageCache = {};
function _catUsageSig() {
  return ['inv_v3', 'ung_v1', 'cc_v2', 'tb_v1', 'thu_v1', 'thauphu_v1']
    .map(k => { const a = load(k, []); return Array.isArray(a) ? a.length : 0; }).join('|');
}
function _catUsageNames(type) {
  const sig = _catUsageSig();
  const c = _catUsageCache[type];
  if (c && c.sig === sig && Date.now() - c.ts < 2000) return c.map;
  const out = _catUsageScan(type);
  _catUsageCache[type] = { sig, ts: Date.now(), map: out };
  return out;
}
function _catUsageScan(type) {
  const out = new Map();
  const add = (n) => {
    const name = String(n || '').trim().replace(/\s+/g, ' ');
    const k = _catNormKey(name);
    if (k && !out.has(k)) out.set(k, name);
  };
  const alive = arr => (Array.isArray(arr) ? arr : []).filter(r => r && !r.deletedAt);
  const invs  = alive(load('inv_v3', []));
  const ungs  = alive(load('ung_v1', []));
  const rn = (r, kind, which, fb) => (typeof recCatName === 'function' ? recCatName(r, kind, which) : '') || fb;

  if (type === 'loai') {
    invs.forEach(i => add(rn(i, 'inv', 'loai', i.loai)));
    // HĐ suy ra từ chấm công (Nhân Công / Hóa Đơn Lẻ) cũng hiện ở Thống kê → cần có trong danh mục
    if (typeof getInvoicesCached === 'function') {
      getInvoicesCached().forEach(i => { if (i && i.source === 'cc') add(i.loai); });
    }
  } else if (type === 'ncc') {
    invs.forEach(i => add(rn(i, 'inv', 'ncc', i.ncc)));
    ungs.forEach(r => { if (r.loai === 'nhacungcap') add(rn(r, 'ung', 'tp', r.tp)); });
    // HĐ chấm công có NCC mặc định "CÔNG TY NGUYỄN HỮU" (CC_DEFAULT_NCC, tienich.js)
    if (typeof getInvoicesCached === 'function') {
      getInvoicesCached().forEach(i => { if (i && i.source === 'cc') add(i.ncc); });
    }
  } else if (type === 'nguoi') {
    // CHỈ HĐ nhập tay — HĐ chấm công có "người" là tên công nhân, không phải Người TH
    invs.forEach(i => add(rn(i, 'inv', 'nguoi', i.nguoi)));
    alive(load('thu_v1', [])).forEach(r => add(rn(r, 'thu', 'nguoi', r.nguoi)));
    Object.values(load('hopdong_v1', {}) || {}).forEach(r => {
      if (r && !r.deletedAt && !r.purgedAt) add(rn(r, 'hopdong', 'nguoi', r.nguoi));
    });
  } else if (type === 'tp') {
    ungs.forEach(r => { if ((r.loai || 'thauphu') === 'thauphu') add(rn(r, 'ung', 'tp', r.tp)); });
    alive(load('thauphu_v1', [])).forEach(r => add(rn(r, 'thauphu', 'thauphu', r.thauphu)));
  } else if (type === 'cn') {
    alive(load('cc_v2', [])).forEach(w => (w.workers || []).forEach(wk => add(wk && wk.name)));
    ungs.forEach(r => { if (r.loai === 'congnhan') add(rn(r, 'ung', 'tp', r.tp)); });
  } else if (type === 'tbteb') {
    alive(load('tb_v1', [])).forEach(t => add(rn(t, 'tb', 'ten', t.ten)));
  }
  return out;
}

/**
 * TỰ BỔ SUNG danh mục còn thiếu từ dữ liệu đã nhập — (01/10/2026)
 * Lý do: trước bản sửa 9.31, khi đồng bộ giữa các máy, danh mục mới thêm ở máy này có thể
 * bị máy khác (đang giữ danh sách cũ) đánh dấu XÓA → hóa đơn vẫn mang tên đó nhưng danh mục
 * không còn → sửa HĐ cũ bị báo "không hợp lệ". Hàm này quét mọi record đang dùng, tên nào
 * không có trong danh mục (hoặc đang là bia mộ) → thêm/hồi sinh lại.
 * An toàn chạy nhiều lần: chỉ ghi khi THỰC SỰ thiếu. Trả về số tên đã bổ sung.
 */
function catBackfillFromRecords() {
  if (typeof load !== 'function' || typeof cats === 'undefined') return 0;
  let added = 0;
  const changedCats = [];
  Object.entries(_CATITEM_TYPE_MAP).forEach(([catId, type]) => {
    const active = new Set(_catActiveNames(type).map(_catNormKey));
    let hit = false;
    _catUsageNames(type).forEach((name, k) => {
      if (active.has(k)) return;
      if (catItemUpsert(catId, name)) { added++; hit = true; active.add(k); }
    });
    if (hit) changedCats.push(catId);
  });
  if (changedCats.length) {
    changedCats.forEach(catId => { cats[catId] = _catActiveNames(_CATITEM_TYPE_MAP[catId]); save(CATS.find(c => c.id === catId).sk, cats[catId]); });
    console.log('[Cats] catBackfillFromRecords: bổ sung', added, 'tên thiếu vào', changedCats.join(', '));
  }
  return added;
}

/**
 * Giải quyết TRÙNG TÊN trong 1 loại danh mục (dùng chung cho dedup local + gộp cloud).
 * Quy tắc "bản mới nhất theo TÊN thắng" (kể cả bản đã xóa):
 *   - Nhóm các item cùng tên (normalized). Bản có updatedAt lớn nhất là bản thắng;
 *     hòa thì ưu tiên bản đang dùng.
 *   - Bản thắng là BIA MỘ (đã xóa) → mọi bản đang dùng cùng tên mà CŨ HƠN cũng bị xóa
 *     → tên đã xóa không thể bị một bản cũ/bản mặc định (id khác) "hồi sinh".
 *   - Bản thắng đang dùng → các bản đang dùng khác cùng tên là bản trùng → đánh dấu xóa.
 * KHÔNG đổi updatedAt của bản bị đánh dấu (đây là chuẩn hóa, không phải thao tác người dùng
 * — nếu đóng dấu "bây giờ" thì bia mộ trùng lặp sẽ đè mất tên đang dùng).
 * @returns {boolean} true nếu có thay đổi
 */
function _catResolveNameConflicts(items) {
  let changed = false;
  const groups = new Map();
  (items || []).forEach(it => {
    if (!it) return;
    const k = _catNormKey(it.name);
    if (!k) return;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  });
  groups.forEach(list => {
    if (list.length < 2) return;
    const winner = list.slice().sort((a, b) =>
      ((b.updatedAt || 0) - (a.updatedAt || 0)) || ((a.isDeleted ? 1 : 0) - (b.isDeleted ? 1 : 0))
    )[0];
    list.forEach(it => {
      if (it === winner || it.isDeleted) return;
      it.isDeleted = true; // bản cũ hơn bia mộ, hoặc bản trùng của bản thắng đang dùng
      changed = true;
    });
  });
  return changed;
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

// Dọn dẹp trùng tên trong cat_items_v1 (gọi lúc startup & sau pull)
// Quy tắc xem _catResolveNameConflicts (bản mới nhất theo tên thắng, kể cả bia mộ)
function _dedupCatItemsNow() {
  const allItems = load('cat_items_v1', {});
  if (!allItems || !Object.keys(allItems).length) return false;
  let changed = false;
  Object.keys(allItems).forEach(type => {
    if (_catResolveNameConflicts(allItems[type])) changed = true;
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
 * Bổ sung các tên trong nameArr vào cat_items_v1 — CHỈ THÊM, không bao giờ tự xóa.
 * (01/10/2026) Trước đây hàm này còn tự XÓA tên không có trong nameArr và tự HỒI SINH
 * tên đã xóa có trong nameArr → nameArr cũ (biến global chưa nạp lại sau khi kéo cloud,
 * hoặc mảng mặc định DEFAULTS trên máy mới) làm danh mục đã xóa sống lại. Nay:
 *   - Tên chưa từng có → thêm mới.
 *   - Tên đã bị xóa (bia mộ) → GIỮ NGUYÊN đã xóa, trừ khi opts.revive = true
 *     (dùng cho import: file nhập có dùng tên đó thì hồi sinh có chủ đích).
 * Dùng cho: khởi tạo master lần đầu (saveCats) và nhập dữ liệu (nhapxuat.import.js).
 */
function _syncCatItems(catId, nameArr, opts) {
  const type = _CATITEM_TYPE_MAP[catId];
  if (!type) return; // congTrinh → bỏ qua
  const allItems = load('cat_items_v1', {});
  const typeItems = (allItems[type] || []).slice();
  const now = Date.now();
  const revive = !!(opts && opts.revive);

  // Canonicalize tên (sửa "COPHA" → "Copha") — KHÔNG đổi updatedAt: mọi máy đều tự
  // canonical giống nhau, nếu đóng dấu "bây giờ" thì bản này sẽ đè cả bia mộ trên cloud.
  typeItems.forEach(item => {
    if (item.isDeleted) return;
    const canonical = normalizeCatDisplayName(type, item.name);
    if (canonical !== item.name) item.name = canonical;
  });

  const byNorm = new Map();
  typeItems.forEach(i => {
    const k = _catNormKey(i.name);
    // Ưu tiên giữ tham chiếu bản đang dùng nếu có cả bản xóa lẫn bản dùng
    if (!byNorm.has(k) || !i.isDeleted) byNorm.set(k, i);
  });
  (nameArr || []).filter(Boolean).forEach(raw => {
    const name = normalizeCatDisplayName(type, raw);
    const k = _catNormKey(name);
    if (!k) return;
    const ex = byNorm.get(k);
    if (!ex) {
      const it = { id: crypto.randomUUID(), name, isDeleted: false, updatedAt: now };
      typeItems.push(it);
      byNorm.set(k, it);
    } else if (ex.isDeleted && revive) {
      ex.isDeleted = false; ex.name = name; ex.updatedAt = now; delete ex.seed;
    }
  });

  allItems[type] = typeItems;
  save('cat_items_v1', allItems); // đánh dấu meta_danh_muc cần đẩy (nếu có thay đổi thật)
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
  delete item.seed;
  allItems[type] = arr;
  // save() (thay _memSet) → đổi tên là thao tác người dùng, phải đánh dấu đẩy cloud
  save('cat_items_v1', allItems);
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
  // KHÔNG đổi updatedAt (xem _syncCatItems) — tránh bản mặc định/bản cũ đè bia mộ cloud
  let itemsChanged = false;
  Object.keys(allItems).forEach(type => {
    (allItems[type] || []).forEach(item => {
      if (item.isDeleted) return;
      const canonical = normalizeCatDisplayName(type, item.name);
      if (canonical !== item.name) {
        item.name = canonical;
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
  // (01/10/2026) Item tạo ra ở đây chỉ là BẢN TẠM (máy mới / web ẩn danh: mảng tên
  // thường là DEFAULTS trong code) → đánh dấu seed + updatedAt = 0 để KHÔNG BAO GIỜ
  // thắng dữ liệu thật trên cloud. Trước đây dùng updatedAt = bây giờ → khi gộp với
  // cloud, các tên mặc định (vd "Chi Phí Khác", "Bàn Uốn Sắt") mới hơn bia mộ trên
  // cloud → bị hồi sinh rồi đẩy ngược lên cloud cho mọi máy.
  const toItems = (arr) => (arr || []).map(name => ({
    id: crypto.randomUUID(), name, isDeleted: false, updatedAt: 0, seed: true
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
      jbBtn.innerHTML = '<span class="material-symbols-outlined msi-gap">hourglass_top</span>Đang sync...';
    } else if (state === 'success') {
      const hhmm = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      jbBtn.textContent = `✅ Đã sync ${hhmm}`;
      setTimeout(() => { if (jbBtn.textContent.includes('Đã sync')) updateJbBtn(); }, 10000);
    } else if (state === 'error') {
      jbBtn.innerHTML = '<span class="material-symbols-outlined msi-gap">warning</span>Sync lỗi';
      setTimeout(() => updateJbBtn(), 8000);
    }
  }
  // ── sync-btn (compact status badge) ─────────────────────────
  const syncBtn = document.getElementById('sync-btn');
  if (syncBtn) {
    if (state === 'syncing') {
      syncBtn.innerHTML = '<span class="material-symbols-outlined msi-gap">hourglass_top</span>';
      syncBtn.title = 'Đang đồng bộ...';
      syncBtn.dataset.state = 'syncing';
    } else if (state === 'success') {
      // Badge suy ra từ outbox (_pendingChanges = số doc chưa đẩy) → vẽ lại
      _updateSyncBtnBadge();
    } else if (state === 'error') {
      syncBtn.innerHTML = '<span class="material-symbols-outlined msi-gap">warning</span>';
      syncBtn.title = 'Sync lỗi — nhấn để thử lại';
      syncBtn.dataset.state = 'error';
      setTimeout(() => _updateSyncBtnBadge(), 8000);
    }
  }
}
