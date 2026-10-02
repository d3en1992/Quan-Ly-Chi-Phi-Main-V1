// sync.backup.js — Sao lưu tự động HẰNG NGÀY lên cloud + đọc/tải bản sao lưu để khôi phục
// Load order: NGAY SAU sync.js, TRƯỚC auth.js
// Kiến trúc: classic script, global scope — KHÔNG dùng import/export
// ─────────────────────────────────────────────────────────────────────────────
// MỤC ĐÍCH: lưới an toàn cuối cùng. Nếu có lỗi đồng bộ nào đó làm cloud mất dữ liệu,
// vẫn còn 30 bản chụp theo ngày để quay lại.
//
// NƠI LƯU: collection RIÊNG `cpct_backup` (KHÔNG nằm trong cpct_data → không bị
// _wipeOrphanCloudDocs() dọn nhầm, không lẫn vào pull/push hằng ngày).
//   cpct_backup/b{YYYY-MM-DD}_p0  ← phần 0 + thông tin chung (parts, createdAt, deviceId, bytesRaw, enc...)
//   cpct_backup/b{YYYY-MM-DD}_p1  ← phần 1 (nếu dữ liệu lớn hơn 900KB sau nén)
//   ...
// Firestore giới hạn ~1MB/field → nội dung được NÉN gzip rồi mã hóa base64, sau đó
// CẮT thành các phần ≤ 900KB. Ghi các phần phụ trước, phần _p0 ghi SAU CÙNG: có _p0
// nghĩa là cả bộ đã ghi xong (nếu rớt mạng giữa chừng thì hôm sau/lần sau ghi lại).
//
// NGUỒN DỮ LIỆU: đọc thẳng TOÀN BỘ collection cpct_data trên cloud (1 lượt list),
// KHÔNG lấy từ local. Lý do: lúc khởi động app chỉ pull NĂM ĐANG XEM, các năm khác
// trong máy có thể đã cũ nhiều tuần — chụp từ local sẽ ra bản sao lưu lệch cloud,
// khôi phục bản đó sẽ kéo lùi dữ liệu các năm khác. Chụp từ cloud = đúng "sự thật".
// Dữ liệu được chuyển về đúng dạng key local (inv_v3, cc_v2, projects_v1...) giống
// file export JSON → khôi phục đi qua importJSONFull() sẵn có.
//
// MỌI LỖI chỉ console.warn — không làm phiền người dùng, không chặn app.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const _BK_COLL      = 'cpct_backup';     // tên collection sao lưu
const _BK_KEEP_DAYS = 30;                // giữ 30 ngày gần nhất
const _BK_PART_MAX  = 900 * 1024;        // mỗi phần tối đa 900KB ký tự base64
const _BK_LS_FLAG   = 'lastCloudBackupDate'; // localStorage: ngày đã sao lưu xong (YYYY-MM-DD)
let   _bkRunning    = false;             // chặn chạy chồng 2 lần

// ── Đường dẫn REST của collection sao lưu ──────────────────────────────────
function _bkBase() {
  return `https://firestore.googleapis.com/v1/projects/${FB_CONFIG.projectId}/databases/(default)/documents/${_BK_COLL}`;
}
// Tạo URL cho 1 doc (docId rỗng = cả collection), kèm query phụ (mảng 'a=b')
function _bkUrl(docId, extra) {
  const q = [`key=${FB_CONFIG.apiKey}`].concat(extra || []).join('&');
  return `${_bkBase()}${docId ? '/' + docId : ''}?${q}`;
}
// Query "mask" — chỉ lấy vài field nhỏ (không tải cả khối dữ liệu nặng)
function _bkMask(fields) {
  return fields.map(f => `mask.fieldPaths=${encodeURIComponent(f)}`);
}

// Ngày LOCAL (giờ Việt Nam trên máy) dạng YYYY-MM-DD — không dùng toISOString (lệch UTC)
function _bkDateStr(d) {
  d = d || new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function _bkDocId(dateStr, part) { return `b${dateStr}_p${part}`; }

// ── Firestore typed-field helpers (doc sao lưu dùng field có kiểu, dễ đọc trên Console) ──
function _bkStr(v) { return { stringValue: String(v) }; }
function _bkInt(v) { return { integerValue: String(Math.round(Number(v) || 0)) }; }
function _bkField(doc, name) {
  const f = doc && doc.fields && doc.fields[name];
  if (!f) return null;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('stringValue'  in f) return f.stringValue;
  return null;
}

// ── REST thô cho collection sao lưu (kiểm tra r.ok cẩn thận) ──────────────
// GET 1 doc. 404 → null (chưa có). Lỗi khác → throw.
async function _bkGet(docId, maskFields) {
  if (typeof _fsCountRead === 'function') _fsCountRead();
  const r = await fetch(_bkUrl(docId, maskFields ? _bkMask(maskFields) : []));
  if (r.status === 404) return null;
  if (!r.ok) { const e = new Error(`[Backup] GET ${docId} HTTP ${r.status}`); e.status = r.status; throw e; }
  return r.json();
}
// Ghi (upsert) 1 doc với các field có kiểu. Lỗi → throw.
async function _bkPut(docId, fields) {
  if (typeof _fsCountWrite === 'function') _fsCountWrite();
  const r = await fetch(_bkUrl(docId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) { const e = new Error(`[Backup] PATCH ${docId} HTTP ${r.status}`); e.status = r.status; throw e; }
  return r.json();
}
// Xóa 1 doc sao lưu (404 coi như đã xóa). Trả true/false, không throw.
async function _bkDelete(docId) {
  if (typeof _fsCountWrite === 'function') _fsCountWrite();
  try {
    const r = await fetch(_bkUrl(docId), { method: 'DELETE' });
    return r.ok || r.status === 404;
  } catch { return false; }
}
// Liệt kê TOÀN BỘ doc của 1 collection (tự lật trang). baseUrlFn(extraQuery) → URL.
// Mỗi request tính 1 lượt đọc vào bộ đếm (giống cách _wipeOrphanCloudDocs đang đếm).
async function _bkListAll(baseUrlFn, extra) {
  const out = [];
  let pageToken = '';
  for (let guard = 0; guard < 50; guard++) {           // tối đa 50 trang — chống lặp vô hạn
    const q = ['pageSize=300'].concat(extra || []);
    if (pageToken) q.push(`pageToken=${encodeURIComponent(pageToken)}`);
    if (typeof _fsCountRead === 'function') _fsCountRead();
    const r = await fetch(baseUrlFn(q));
    if (!r.ok) { const e = new Error(`[Backup] LIST HTTP ${r.status}`); e.status = r.status; throw e; }
    const j = await r.json();
    (j.documents || []).forEach(d => out.push(d));
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  return out;
}

// ── Mã hóa: Uint8Array ⇄ base64 (cắt khúc 32KB để không tràn stack) ──────
function _bkB64FromBytes(u8) {
  let s = '';
  const STEP = 0x8000;
  for (let i = 0; i < u8.length; i += STEP) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + STEP));
  }
  return btoa(s);
}
function _bkBytesFromB64(b64) {
  const s  = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

// JSON string → { enc, b64 }. Có CompressionStream → nén gzip (enc:'gzip').
// Không có (trình duyệt cũ) → giữ nguyên bytes UTF-8 (enc:'raw').
// Cả 2 trường hợp đều base64 để cắt phần an toàn (không bao giờ cắt đôi 1 ký tự tiếng Việt).
async function _bkEncode(jsonStr) {
  const bytes = new TextEncoder().encode(jsonStr);
  if (typeof CompressionStream === 'function') {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
      const gz = new Uint8Array(await new Response(stream).arrayBuffer());
      return { enc: 'gzip', b64: _bkB64FromBytes(gz) };
    } catch (e) {
      console.warn('[Backup] Nén gzip lỗi — ghi không nén:', e);
    }
  }
  return { enc: 'raw', b64: _bkB64FromBytes(bytes) };
}
// Ngược lại: { enc, b64 } → JSON string
async function _bkDecode(enc, b64) {
  const bytes = _bkBytesFromB64(b64);
  if (enc === 'gzip') {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('Trình duyệt này không giải nén được bản sao lưu (thiếu DecompressionStream) — hãy dùng Chrome/Edge mới');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  }
  return new TextDecoder().decode(bytes);
}

// ── Chụp toàn bộ dữ liệu từ CLOUD (cpct_data) → object dạng key local ────
// Trả về { data, docCount }. Cloud trống / không đọc được → throw (không sao lưu rỗng).
async function _bkCollectCloudData() {
  const docs = await _bkListAll(q => `${FS_BASE()}?key=${FB_CONFIG.apiKey}&${q.join('&')}`);
  const data = { inv_v3: [], ung_v1: [], cc_v2: [], tb_v1: [], thu_v1: [] };
  const byCat = {};
  _YEAR_CATS.forEach(c => { byCat[c.cat] = c.key; });
  let legacyCustomers = null, legacyQuyetToan = null, yearDocs = 0, metaDocs = 0;

  for (const doc of docs) {
    const id = String(doc.name || '').split('/').pop();
    const d  = fsUnwrap(doc);
    if (!d) continue;
    const m = id.match(/^y(\d{4})_(.+)$/);
    if (m && byCat[m[2]]) {
      if (Array.isArray(d.records)) { data[byCat[m[2]]].push(...d.records); yearDocs++; }
      continue;
    }
    switch (id) {
      case 'meta_cong_trinh':
        if (Array.isArray(d.projects)) data.projects_v1 = d.projects;
        if (Array.isArray(d.customers)) legacyCustomers = d.customers; // customers đời cũ (trước 19/06/2026)
        metaDocs++; break;
      case 'meta_khach_hang':
        if (Array.isArray(d.customers)) data.customers_v1 = d.customers;
        metaDocs++; break;
      case 'meta_danh_muc':
        // Chỉ lấy cat_items_v1 (NGUỒN MASTER danh mục). Các mảng tên cat_loai/cat_ncc...
        // là dữ liệu SUY RA — _reloadGlobals() tự dựng lại từ cat_items_v1 sau khi khôi phục.
        // (Không đưa mảng chuỗi vào vì importJSONFull() coi mọi mảng là mảng record.)
        if (d.catItems && typeof d.catItems === 'object') data.cat_items_v1 = d.catItems;
        if (d.cnRoles  && typeof d.cnRoles  === 'object') data.cat_cn_roles = d.cnRoles;
        if (d.ctYears  && typeof d.ctYears  === 'object') data.cat_ct_years = d.ctYears;
        metaDocs++; break;
      case 'meta_tai_khoan':
        // Tài khoản: BỎ passwordHash (và password cũ nếu còn) — không lưu mật khẩu vào bản sao lưu.
        // Lưu ý: khi khôi phục, importJSONFull() vẫn BỎ QUA users_v1 (giữ tài khoản đang dùng).
        if (Array.isArray(d.users)) {
          data.users_v1 = d.users.map(u => {
            if (!u || typeof u !== 'object') return u;
            const { passwordHash, password, ...rest } = u;
            return rest;
          });
        }
        metaDocs++; break;
      case 'meta_hop_dong':
        if (d.hopDong && typeof d.hopDong === 'object') data.hopdong_v1 = d.hopDong;
        if (Array.isArray(d.thauPhu))   data.thauphu_v1   = d.thauPhu;
        // quyetToan đời cũ (trước 03/10/2026) — chỉ dùng khi chưa có doc meta_quyet_toan
        if (Array.isArray(d.quyetToan)) legacyQuyetToan = d.quyetToan;
        metaDocs++; break;
      case 'meta_quyet_toan':
        // (03/10/2026) Quyết toán công trình — doc riêng
        if (Array.isArray(d.quyetToan)) data.quyettoan_v1 = d.quyetToan;
        metaDocs++; break;
    }
  }
  if (!data.customers_v1 && legacyCustomers) data.customers_v1 = legacyCustomers;
  if (!data.quyettoan_v1 && legacyQuyetToan) data.quyettoan_v1 = legacyQuyetToan;
  if (!yearDocs && !metaDocs) throw new Error('Cloud trống — bỏ qua sao lưu (không lưu bản rỗng)');
  return { data, docCount: yearDocs + metaDocs };
}

// ══════════════════════════════════════════════════════════════
// [1] SAO LƯU HẰNG NGÀY — gọi ngầm sau khi app khởi động + pull xong
// ══════════════════════════════════════════════════════════════
// opts.force = true → bỏ qua cờ "hôm nay đã sao lưu" (dùng để test trong Console:
//   cloudDailyBackup({ force: true }) )
async function cloudDailyBackup(opts) {
  const force = !!(opts && opts.force);
  if (typeof fbReady !== 'function' || !fbReady()) return;
  if (!navigator.onLine) return;
  if (_bkRunning) return;
  const today = _bkDateStr();
  if (!force && localStorage.getItem(_BK_LS_FLAG) === today) return; // hôm nay máy này đã làm

  _bkRunning = true;
  try {
    // 1 lượt đọc nhỏ: hôm nay đã có máy khác sao lưu chưa? (chỉ lấy field 'parts')
    if (!force) {
      const p0 = await _bkGet(_bkDocId(today, 0), ['parts']);
      if (p0) {
        localStorage.setItem(_BK_LS_FLAG, today);
        console.log('[Backup] Hôm nay đã có bản sao lưu cloud — bỏ qua');
        return;
      }
    }

    // Chụp dữ liệu cloud → JSON → nén → base64 → cắt phần
    const { data, docCount } = await _bkCollectCloudData();
    const snapshot = {
      meta: {
        version:    (typeof DATA_VERSION !== 'undefined') ? DATA_VERSION : 0,
        exportedAt: Date.now(),
        kind:       'cloud-daily',
        source:     'cloud',
        deviceId:   (typeof DEVICE_ID !== 'undefined') ? DEVICE_ID : '',
      },
      data,
    };
    const json = JSON.stringify(snapshot);
    const { enc, b64 } = await _bkEncode(json);
    const chunks = [];
    for (let i = 0; i < b64.length; i += _BK_PART_MAX) chunks.push(b64.slice(i, i + _BK_PART_MAX));
    if (!chunks.length) chunks.push('');

    // Ghi phần phụ _p1.._pN TRƯỚC, phần _p0 (có thông tin chung) SAU CÙNG
    for (let i = chunks.length - 1; i >= 0; i--) {
      const fields = { part: _bkInt(i), date: _bkStr(today), chunk: _bkStr(chunks[i]) };
      if (i === 0) {
        Object.assign(fields, {
          app:         _bkStr('cpct'),
          parts:       _bkInt(chunks.length),
          createdAt:   _bkInt(Date.now()),
          deviceId:    _bkStr(snapshot.meta.deviceId),
          bytesRaw:    _bkInt(json.length),
          bytesStored: _bkInt(b64.length),
          enc:         _bkStr(enc),
          docCount:    _bkInt(docCount),
        });
      }
      await _bkPut(_bkDocId(today, i), fields);
    }
    localStorage.setItem(_BK_LS_FLAG, today);
    console.log(`[Backup] ✅ Đã sao lưu cloud ${today}: ${chunks.length} phần, `
      + `${Math.round(json.length / 1024)}KB gốc → ${Math.round(b64.length / 1024)}KB (${enc})`);

    // Dọn bản cũ hơn 30 ngày (lỗi ở bước này không ảnh hưởng bản vừa ghi)
    await _bkCleanupOld();
  } catch (e) {
    console.warn('[Backup] Sao lưu cloud hằng ngày lỗi (bỏ qua, không ảnh hưởng app):', e && (e.message || e));
  } finally {
    _bkRunning = false;
  }
}

// Xóa các doc sao lưu có ngày cũ hơn _BK_KEEP_DAYS ngày (xóa mọi phần _p*)
async function _bkCleanupOld() {
  try {
    const cut = new Date();
    cut.setDate(cut.getDate() - _BK_KEEP_DAYS);
    const cutStr = _bkDateStr(cut);
    // Chỉ cần tên doc → mask 'part' cho nhẹ
    const docs = await _bkListAll(q => _bkUrl('', q), _bkMask(['part']));
    let n = 0;
    for (const doc of docs) {
      const id = String(doc.name || '').split('/').pop();
      const m  = id.match(/^b(\d{4}-\d{2}-\d{2})_p\d+$/);
      if (m && m[1] < cutStr) { if (await _bkDelete(id)) n++; }  // so sánh chuỗi YYYY-MM-DD = so ngày
    }
    if (n) console.log(`[Backup] Đã dọn ${n} doc sao lưu cũ hơn ${_BK_KEEP_DAYS} ngày`);
  } catch (e) {
    console.warn('[Backup] Dọn bản sao lưu cũ lỗi (bỏ qua):', e && (e.message || e));
  }
}

// ══════════════════════════════════════════════════════════════
// [2] ĐỌC DANH SÁCH + TẢI 1 BẢN SAO LƯU (dùng cho nút khôi phục ở tab Danh Mục)
// ══════════════════════════════════════════════════════════════
// Trả về [{ date, parts, createdAt, deviceId, bytesRaw, bytesStored, enc }] — mới nhất trước.
// Chỉ đọc field thông tin (mask), KHÔNG tải khối dữ liệu.
async function cloudBackupList() {
  const docs = await _bkListAll(q => _bkUrl('', q),
    _bkMask(['parts', 'createdAt', 'deviceId', 'bytesRaw', 'bytesStored', 'enc', 'date']));
  const out = [];
  for (const doc of docs) {
    const id = String(doc.name || '').split('/').pop();
    const m  = id.match(/^b(\d{4}-\d{2}-\d{2})_p0$/);
    if (!m) continue;                          // chỉ phần _p0 mới mang thông tin chung
    const parts = _bkField(doc, 'parts');
    if (!parts) continue;                      // _p0 chưa đủ thông tin → bộ chưa ghi xong
    out.push({
      date:        m[1],
      parts,
      createdAt:   _bkField(doc, 'createdAt') || 0,
      deviceId:    _bkField(doc, 'deviceId') || '',
      bytesRaw:    _bkField(doc, 'bytesRaw') || 0,
      bytesStored: _bkField(doc, 'bytesStored') || 0,
      enc:         _bkField(doc, 'enc') || 'raw',
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// Tải đủ các phần của ngày dateStr, ghép + giải nén → object snapshot { meta, data }
async function cloudBackupDownload(dateStr) {
  const p0 = await _bkGet(_bkDocId(dateStr, 0));
  if (!p0) throw new Error('Không tìm thấy bản sao lưu ngày ' + dateStr);
  const parts = _bkField(p0, 'parts') || 1;
  const enc   = _bkField(p0, 'enc') || 'raw';
  const chunks = [_bkField(p0, 'chunk') || ''];
  for (let i = 1; i < parts; i++) {
    const pi = await _bkGet(_bkDocId(dateStr, i));
    if (!pi) throw new Error(`Bản sao lưu ${dateStr} bị thiếu phần ${i}/${parts - 1}`);
    chunks.push(_bkField(pi, 'chunk') || '');
  }
  const json = await _bkDecode(enc, chunks.join(''));
  const snap = JSON.parse(json);
  if (!snap || !snap.data || typeof snap.data !== 'object') {
    throw new Error('Bản sao lưu không đúng định dạng');
  }
  return snap;
}
