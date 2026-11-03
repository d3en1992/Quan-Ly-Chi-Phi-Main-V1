// lonhap.js — NHẬP "GÓI CÔNG TRÌNH" (JSON) THEO LÔ NHÁP, CÓ GỠ HOÀN TOÀN (03/11/2026)
// Load order: sau thungrac.js, trước sync.js (chỉ định nghĩa hàm — mọi thứ chạy lúc dùng)
// Kiến trúc: classic script, global scope — KHÔNG dùng import/export
// ─────────────────────────────────────────────────────────────────────────────
// • Gói = file JSON { format:'cpct-ct-pack', version:1, lot, project, hopDong, deleteFirst,
//   cats, records:{ inv_v3, ung_v1, cc_v2, thu_v1, thauphu_v1 }, boRa, canhBao, check }.
// • Mỗi lần nhập 1 gói = 1 LÔ, lưu ở key local 'import_lots_v1' → doc cloud 'meta_lo_nhap'.
// • Record của lô mang importLot / importKey; khi lô còn nháp thêm draft:true → chỉ admin thấy
//   (lớp lọc loadView ở core.storage.js). Record mà lô sẽ xóa (deleteFirst) mang draftHide
//   cho tới khi "Đưa vào dữ liệu chung".
// • Mọi thay đổi đi qua save() → outbox → pushChanges (không ghi thẳng Firestore).
// ─────────────────────────────────────────────────────────────────────────────

const LO_KEY = 'import_lots_v1';
const LO_STORES = ['inv_v3', 'ung_v1', 'cc_v2', 'thu_v1', 'thauphu_v1'];
const LO_STORE_LABEL = { inv_v3: 'Hóa đơn', ung_v1: 'Tiền ứng', cc_v2: 'Chấm công (tuần)', thu_v1: 'Thu tiền', thauphu_v1: 'HĐ thầu phụ', hopdong_v1: 'HĐ chính' };
const LO_PURGE_DAYS = 30;
// Field của lô phải giữ nguyên khi sửa record (form dựng lại object mới)
const LO_KEEP_FIELDS = ['importLot', 'importKey', 'draft', 'mau', 'canXem', 'draftHide'];
// Loại danh mục trong gói → id danh mục của app
const LO_CAT_MAP = { ncc: 'nhaCungCap', loai: 'loaiChiPhi', tp: 'thauPhu', cn: 'congNhan', nguoi: 'nguoiTH' };
const LO_STATUS_LABEL = { draft: 'Nháp', published: 'Đã đưa vào chung', removed: 'Đã gỡ', purged: 'Đã xóa hẳn' };

let _loBypass = false;      // đang chạy thao tác của lô → loOnSave không can thiệp
const _loAsk = {};          // lotId → true/false: câu hỏi "Thêm vào lô nháp?" chỉ hỏi 1 lần / phiên
let _loPending = null;      // gói đang ở màn xem trước
let _loRulesBlocked = false;

// ══════════════════════════════════════════════════════════════
//  TIỆN ÍCH
// ══════════════════════════════════════════════════════════════
function loLots() { const a = load(LO_KEY, []); return Array.isArray(a) ? a : []; }
function loGetLot(id) { return loLots().find(l => l && l.id === id) || null; }
function _loUpdateLot(id, changes) {
  const now = Date.now();
  _loSaveLots(loLots().map(l => (l && l.id === id) ? { ...l, ...changes, updatedAt: now } : l));
  return loGetLot(id);
}
function _loSaveLots(arr) { save(LO_KEY, arr); _loCountCache = null; }
function loIsAdminView() { return typeof isAdmin === 'function' && isAdmin() && !draftViewIsGD(); }
function loIsViewAsGD() { try { return localStorage.getItem(DRAFT_VIEW_GD_KEY) === '1'; } catch (e) { return false; } }
const _loAlive = r => !!(r && !r.deletedAt && !r.purgedAt);
const _loNum = n => (typeof numFmt === 'function' ? numFmt(Math.round(n || 0)) : String(Math.round(n || 0)));
const _loDev = () => (typeof DEVICE_ID !== 'undefined' ? DEVICE_ID : '');
const _loUser = () => { try { return (getCurrentUser() || {}).username || ''; } catch (e) { return ''; } };
const _loSleep = ms => new Promise(r => setTimeout(r, ms));
const _loNorm = s => (typeof _normStr === 'function') ? _normStr(s)
  : String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const _loDate = d => (typeof fmtISODate === 'function' ? fmtISODate(d, d || '—') : (d || '—'));
const _loTs = ts => ts ? new Date(ts).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

function _loPid(store, r) { return r ? (r.projectId || (store === 'cc_v2' ? r.ctPid : null) || null) : null; }
function _loProj(pid) {
  if (pid === 'COMPANY') return (typeof PROJECT_COMPANY !== 'undefined') ? PROJECT_COMPANY : { id: 'COMPANY', name: 'CÔNG TY' };
  return load('projects_v1', []).find(p => p && p.id === pid) || null;
}
// Số tiền 1 record (hiển thị / tổng)
function _loAmount(store, r) {
  if (!r) return 0;
  if (store === 'inv_v3') return Number(r.thanhtien || r.tien) || 0;
  if (store === 'thauphu_v1') return (Number(r.giaTri) || 0) + (Number(r.phatSinh) || 0);
  if (store === 'cc_v2') return (r.workers || []).reduce((s, w) =>
    s + (w.d || []).reduce((a, v) => a + (Number(v) || 0), 0) * (Number(w.luong) || 0) + (Number(w.phucap) || 0) + (Number(w.hdmuale) || 0), 0);
  return Number(r.tien) || 0;
}
function _loRecLabel(store, r) {
  if (store === 'cc_v2') return `Tuần ${_loDate(r.fromDate)} – ${(r.workers || []).length} CN`;
  if (store === 'thauphu_v1') return `${r.thauphu || ''} · ${r.nd || ''}`;
  if (store === 'ung_v1') return `${r.tp || ''} · ${r.nd || ''}`;
  return r.nd || '';
}
function _loCsvCell(v) { const s = String(v == null ? '' : v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function _loDownload(name, text, type) {
  const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Tổng chi của 1 công trình — đúng công thức _ctTongChi (cash-basis) nhưng MỌI NĂM.
// _ctTongChi lọc ứng theo năm đang chọn qua inActiveYear() → tạm thay bằng "luôn đúng".
function loTongChiCT(pid) {
  if (typeof _ctTongChi !== 'function' || typeof getInvoicesCached !== 'function') return null;
  const p = pid === 'COMPANY' ? _loProj('COMPANY') : (projects || []).find(x => x && x.id === pid);
  if (!p) return null;
  const orig = window.inActiveYear;
  try {
    window.inActiveYear = () => true;
    const invs = getInvoicesCached().filter(i => i.projectId ? i.projectId === p.id : i.congtrinh === p.name);
    const total = invs.reduce((s, i) => s + (i.thanhtien || i.tien || 0), 0);
    return _ctTongChi(p, { total, invs, count: invs.length }).tongChi;
  } catch (e) {
    console.warn('[Lô nhập] Tính tổng chi lỗi:', e);
    return null;
  } finally {
    window.inActiveYear = orig;
  }
}

// Đẩy cloud ngay và chờ xong (đang có sync khác → chờ trước)
async function _loPushNow() {
  if (typeof fbReady !== 'function' || !fbReady() || typeof pushChanges !== 'function') return null;
  if (typeof cancelScheduledPush === 'function') cancelScheduledPush();
  for (let i = 0; i < 60 && typeof isSyncing === 'function' && isSyncing(); i++) await _loSleep(500);
  try { return await pushChanges({ silent: true }); }
  catch (e) { console.warn('[Lô nhập] Đẩy cloud lỗi:', e); return false; }
}

// Sao lưu trước thao tác lớn: tải file snapshot JSON (exportJSON) + bản sao lưu nội bộ
async function _loBackup(label) {
  try { if (typeof exportJSON === 'function') exportJSON(); } catch (e) { console.warn('[Lô nhập] exportJSON lỗi:', e); }
  try { if (typeof _snapshotNow === 'function') await _snapshotNow(label); } catch (e) {}
}

function _loAfterChange() {
  _loCountCache = null;
  if (typeof _reloadGlobals === 'function') _reloadGlobals();
  if (typeof rebuildCatCTFromProjects === 'function') rebuildCatCTFromProjects();
  if (typeof renderActiveTab === 'function') renderActiveTab();
  loRenderSection();
}

// Firestore Rules chưa mở doc meta_lo_nhap → báo rõ (1 lần / phiên), chỉ với admin
function loRulesWarn(e) {
  const msg = String((e && e.message) || e || '');
  const denied = (e && (e.status === 403 || e.status === 401)) || /403|PERMISSION/i.test(msg);
  if (!denied) return;
  _loRulesBlocked = true;
  if (typeof isAdmin === 'function' && !isAdmin()) return;
  if (loRulesWarn._shown) return;
  loRulesWarn._shown = true;
  const t = '⛔ Firestore chưa cho phép doc "meta_lo_nhap" (Lô nhập) — cần cập nhật Firestore Rules. Dữ liệu lô vẫn giữ trong máy, sẽ đẩy lại khi Rules đã mở.';
  if (typeof showSyncBanner === 'function') showSyncBanner(t, 12000);
  if (typeof toast === 'function') toast(t, 'error');
  loRenderSection();
}

// Lô thay đổi từ máy khác (pull) → vẽ lại màn Lô nhập nếu đang mở
function loAfterLotsChanged() {
  _loCountCache = null; _loTrashCache = null;
  clearTimeout(loAfterLotsChanged._t);
  loAfterLotsChanged._t = setTimeout(() => { try { loRenderSection(); } catch (e) {} }, 50);
}

// ══════════════════════════════════════════════════════════════
//  NHÃN "NHÁP" + HUY HIỆU CÔNG TRÌNH
// ══════════════════════════════════════════════════════════════
function loDraftTag(r) {
  if (!r || !r.importLot || !loIsAdminView()) return '';
  let h = '';
  if (r.draft === true) h += '<span class="lo-draft-tag" title="Dòng nháp của lô nhập — chỉ admin thấy">NHÁP</span>';
  if (r.canXem) h += `<span class="lo-canxem-tag" title="${x(String(r.canXem))}">CẦN XEM</span>`;
  if (r.mau === 'vang') h += '<span class="lo-vang-dot" title="Ước tính / ngày giả định (mau = vàng)">●</span>';
  return h;
}

let _loCountCache = null;   // { ts, byPid: Map(pid → số dòng nháp) }
function _loDraftCounts() {
  if (_loCountCache && Date.now() - _loCountCache.ts < 800) return _loCountCache.byPid;
  const byPid = new Map();
  LO_STORES.forEach(st => (load(st, []) || []).forEach(r => {
    if (!r || r.draft !== true || !_loAlive(r)) return;
    const pid = _loPid(st, r);
    if (pid) byPid.set(pid, (byPid.get(pid) || 0) + 1);
  }));
  _loCountCache = { ts: Date.now(), byPid };
  return byPid;
}
function loDraftLotsOf(pid) { return loLots().filter(l => l && l.projectId === pid && l.status === 'draft' && !l.deletedAt); }

// Huy hiệu "Có N dòng nháp" trên thẻ / popup CT (chỉ admin, không ở chế độ Xem như giám đốc)
function loCtDraftBadge(pid, withBtn) {
  if (!pid || !loIsAdminView()) return '';
  const n = _loDraftCounts().get(pid) || 0;
  const p = _loProj(pid);
  const ctDraft = !!(p && p.draft === true);
  const hd = load('hopdong_v1', {})[pid];
  const hdDraft = !!(hd && hd.draft === true && _loAlive(hd));
  if (!n && !ctDraft && !hdDraft) return '';
  const parts = [];
  if (ctDraft) parts.push('CT nháp');
  if (n) parts.push(`Có ${n} dòng nháp`);
  if (hdDraft) parts.push('HĐ chính nháp');
  let h = ` <span class="lo-draft-badge" title="Dữ liệu của lô nhập chưa đưa vào dữ liệu chung — chỉ admin thấy">${parts.join(' · ')}</span>`;
  if (withBtn) {
    loDraftLotsOf(pid).forEach(l => {
      h += ` <button class="btn btn-sm btn-warning lo-pub-btn" onclick="event.stopPropagation();loPublish('${l.id}')" title="Lô ${x(l.key || '')}">Đưa vào dữ liệu chung</button>`;
    });
  }
  return h;
}

// ══════════════════════════════════════════════════════════════
//  HOOK save() — giữ dấu lô khi sửa + hỏi gắn lô nháp khi thêm mới
// ══════════════════════════════════════════════════════════════
// Gọi từ save() (core.storage.js) TRƯỚC khi ghi. old = giá trị thô đang có trong _mem.
function loOnSave(k, v, old) {
  if (_loBypass || !v || typeof v !== 'object' || !old || typeof old !== 'object') return v;
  if (Array.isArray(v)) {
    if (!Array.isArray(old)) return v;
    // 1) Giữ field của lô cho record đã có (form sửa hay dựng lại object mới → mất field)
    const marked = old.filter(r => r && (r.importLot || r.draftHide));
    if (marked.length) {
      const byId = new Map(marked.map(r => [String(r.id), r]));
      v.forEach(r => {
        if (!r || typeof r !== 'object') return;
        const o = byId.get(String(r.id));
        if (!o || o === r) return;
        if (o.importLot && !r.importLot) LO_KEEP_FIELDS.forEach(f => { if (f in o && !(f in r)) r[f] = o[f]; });
        else if (o.draftHide && !('draftHide' in r)) r.draftHide = o.draftHide;
      });
    }
    // 2) Record MỚI vào công trình đang có lô nháp → hỏi gắn vào lô (chỉ admin, 1 lần / lô / phiên)
    if (k !== 'projects_v1' && k !== 'tb_v1' && loIsAdminView()) {
      const draftLots = loLots().filter(l => l && l.status === 'draft' && !l.deletedAt);
      if (draftLots.length) {
        const oldIds = new Set(old.map(r => r && String(r.id)));
        const add = {};
        v.forEach(r => {
          if (!r || typeof r !== 'object' || r.id == null || r.importLot || oldIds.has(String(r.id))) return;
          const pid = _loPid(k, r);
          const lot = pid && draftLots.filter(l => l.projectId === pid).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
          if (!lot) return;
          if (!(lot.id in _loAsk)) {
            _loAsk[lot.id] = window.confirm(
              `Công trình "${lot.projectName}" đang có lô nháp "${lot.key}".\n\n` +
              'Thêm dòng mới vào lô nháp này? (chỉ admin thấy cho tới khi bấm "Đưa vào dữ liệu chung")\n\n' +
              'OK = Có (mặc định) · Hủy = Không, dòng mới hiện cho mọi người');
          }
          if (!_loAsk[lot.id]) return;
          r.importLot = lot.id;
          r.draft = true;
          (add[lot.id] = add[lot.id] || []).push(String(r.id));
        });
        Object.entries(add).forEach(([lotId, ids]) => {
          const lot = loGetLot(lotId);
          if (!lot) return;
          const all = { ...(lot.ids || {}) };
          all[k] = [...new Set([...(all[k] || []), ...ids])];
          _loUpdateLot(lotId, { ids: all, counts: { ...(lot.counts || {}), [k]: all[k].length } });
        });
      }
    }
    return v;
  }
  // HĐ chính (object map theo projectId): giữ dấu lô khi form sửa dựng lại object
  if (k === 'hopdong_v1' && !Array.isArray(old)) {
    Object.keys(v).forEach(key => {
      const o = old[key], r = v[key];
      if (!o || !r || o === r || !o.importLot || r.importLot || typeof r !== 'object') return;
      ['importLot', 'draft', 'draftBefore', 'mau'].forEach(f => { if (f in o && !(f in r)) r[f] = o[f]; });
    });
  }
  return v;
}

// ══════════════════════════════════════════════════════════════
//  THÙNG RÁC — record bị gỡ theo lô chỉ quản lý ở màn Lô nhập
// ══════════════════════════════════════════════════════════════
let _loTrashCache = null; // { sig, lots:Set, ids:Set }
function loHiddenFromTrash(r) {
  if (!r) return false;
  const lots = loLots();
  const sig = lots.length + ':' + lots.reduce((m, l) => Math.max(m, (l && l.updatedAt) || 0), 0);
  if (!_loTrashCache || _loTrashCache.sig !== sig) {
    const lotSet = new Set(), ids = new Set();
    lots.forEach(l => {
      if (!l || (l.status !== 'removed' && l.status !== 'purged')) return;
      lotSet.add(l.id);
      Object.values(l.removedIds || {}).forEach(a => (a || []).forEach(id => ids.add(String(id))));
      if (l.projectRemoved && l.projectId) ids.add(String(l.projectId));
    });
    _loTrashCache = { sig, lots: lotSet, ids };
  }
  return (r.importLot && _loTrashCache.lots.has(r.importLot)) || _loTrashCache.ids.has(String(r.id));
}

// ══════════════════════════════════════════════════════════════
//  "XEM NHƯ GIÁM ĐỐC" (chỉ admin)
// ══════════════════════════════════════════════════════════════
function loToggleViewAsGD(on) {
  if (typeof isAdmin !== 'function' || !isAdmin()) return;
  const next = (on === undefined) ? !loIsViewAsGD() : !!on;
  try { localStorage.setItem(DRAFT_VIEW_GD_KEY, next ? '1' : '0'); } catch (e) {}
  if (typeof _draftViewReset === 'function') _draftViewReset();
  if (typeof clearInvoiceCache === 'function') clearInvoiceCache();
  _loAfterChange();
  loUpdateGDUi();
  if (typeof toast === 'function') toast(next ? '👁 Đang xem như giám đốc — dữ liệu nháp bị ẩn' : 'Đã tắt "Xem như giám đốc"', 'info');
}
function loUpdateGDUi() {
  const admin = typeof isAdmin === 'function' && isAdmin();
  const on = admin && loIsViewAsGD();
  let btn = document.getElementById('lo-gd-btn');
  const sync = document.getElementById('sync-btn');
  if (!btn && sync && sync.parentNode) {
    btn = document.createElement('button');
    btn.id = 'lo-gd-btn';
    btn.className = 'tb-btn';
    btn.onclick = () => loToggleViewAsGD();
    sync.parentNode.insertBefore(btn, sync);
  }
  if (btn) {
    btn.style.display = admin ? '' : 'none';
    btn.innerHTML = `<span class="material-symbols-outlined msi-gap">${on ? 'visibility_off' : 'visibility'}</span><span class="lo-gd-lbl">${on ? 'Đang xem như GĐ' : 'Xem như GĐ'}</span>`;
    btn.title = on ? 'Đang ẩn dữ liệu nháp như máy giám đốc — bấm để tắt' : 'Xem app như máy giám đốc (ẩn dữ liệu nháp)';
    btn.classList.toggle('lo-gd-on', on);
  }
  let bar = document.getElementById('lo-gd-banner');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'lo-gd-banner';
    bar.innerHTML = '👁 Đang xem như giám đốc — dữ liệu nháp đang bị ẩn <button type="button" onclick="loToggleViewAsGD(false)">Tắt</button>';
    document.body.appendChild(bar);
  }
  bar.style.display = on ? '' : 'none';
}

// ══════════════════════════════════════════════════════════════
//  5.1 — NHẬP GÓI: đọc file, kiểm tra, màn xem trước
// ══════════════════════════════════════════════════════════════
function loOpenImport() {
  if (typeof isAdmin !== 'function' || !isAdmin()) { toast('Chỉ Quản trị viên được nhập gói công trình', 'error'); return; }
  if (loIsViewAsGD()) { toast('Hãy tắt "Xem như giám đốc" trước khi nhập gói', 'error'); return; }
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json,application/json';
  inp.onchange = () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      let pack;
      try { pack = JSON.parse(String(rd.result || '')); }
      catch (e) { _loAlert('File không phải JSON hợp lệ:\n' + (e.message || e)); return; }
      try { loPreviewPack(pack, f.name); }
      catch (e) { console.error(e); _loAlert(e.message || String(e)); }
    };
    rd.readAsText(f, 'utf-8');
  };
  inp.click();
}
function _loAlert(msg) { window.alert(msg); }

// Kiểm tra định dạng gói — trả về mảng lỗi
function loValidatePack(pack) {
  const err = [];
  if (!pack || typeof pack !== 'object') return ['File rỗng hoặc không phải object JSON'];
  if (pack.format !== 'cpct-ct-pack') err.push(`Sai định dạng: format = "${pack.format}" (cần "cpct-ct-pack")`);
  if (pack.version !== 1) err.push(`Phiên bản gói không hỗ trợ: version = ${pack.version} (cần 1)`);
  if (!pack.project || !String(pack.project.name || '').trim()) err.push('Thiếu project.name');
  if (pack.records && typeof pack.records !== 'object') err.push('records phải là object');
  Object.keys(pack.records || {}).forEach(k => {
    if (!LO_STORES.includes(k)) err.push(`records.${k}: loại dữ liệu không hỗ trợ`);
    else if (!Array.isArray(pack.records[k])) err.push(`records.${k} phải là mảng`);
  });
  (pack.deleteFirst || []).forEach((d, i) => {
    if (!d || !LO_STORES.includes(d.store) || !d.id) err.push(`deleteFirst[${i}] thiếu store/id hợp lệ`);
  });
  return err;
}

// Tìm công trình đích: matchId → tên (giống _normStr) → tạo mới (create:true)
function _loResolveProject(pj) {
  const name = String(pj.name || '').trim();
  const raw = load('projects_v1', []);
  if (pj.matchId === 'COMPANY' || name === 'CÔNG TY') return { pid: 'COMPANY', name: _loProj('COMPANY').name, how: 'CÔNG TY' };
  if (pj.matchId) {
    const p = raw.find(x => x && x.id === pj.matchId && _loAlive(x));
    if (p) return { pid: p.id, name: p.name, how: 'matchId', proj: p };
  }
  const n = _loNorm(name);
  const byName = raw.find(x => x && _loAlive(x) && _loNorm(x.name) === n)
    || (typeof findProjectByAlias === 'function' ? findProjectByAlias(name) : null);
  if (byName && _loAlive(byName)) return { pid: byName.id, name: byName.name, how: 'tên', proj: byName };
  if (pj.create) return { pid: null, name, how: 'tạo mới' };
  throw new Error(`Không tìm thấy công trình "${name}"${pj.matchId ? ` (matchId ${pj.matchId})` : ''} trong app và gói không cho tạo mới (create:false).`);
}

// Dựng kế hoạch nhập (chưa ghi gì)
function loBuildPlan(pack, fileName) {
  const errs = loValidatePack(pack);
  if (errs.length) throw new Error('Gói không hợp lệ:\n• ' + errs.join('\n• '));
  const proj = _loResolveProject(pack.project);
  const pid = proj.pid;
  const plan = { pack, file: fileName || '', proj, rows: {}, skipped: [], totals: {}, counts: {}, vang: 0, canXem: 0,
                 deleteFirst: [], catsNew: {}, hdBefore: null };

  // Khóa đã có ở record SỐNG (importKey hoặc id trùng) → bỏ qua
  LO_STORES.forEach(st => {
    const recs = (pack.records && pack.records[st]) || [];
    if (!recs.length) return;
    const live = new Set();
    const liveWeek = new Set();
    load(st, []).forEach(r => {
      if (!_loAlive(r)) return;
      if (r.importKey) live.add(String(r.importKey));
      live.add(String(r.id));
      if (st === 'cc_v2' && pid) liveWeek.add(`${r.fromDate || r.from || ''}|${r.projectId || r.ctPid || ''}`);
    });
    const seen = new Set();
    plan.rows[st] = [];
    recs.forEach(r => {
      const key = r && r.importKey != null ? String(r.importKey) : '';
      let reason = '';
      if (!r || typeof r !== 'object') reason = 'Dòng không hợp lệ';
      else if (!key) reason = 'Thiếu importKey';
      else if (seen.has(key)) reason = 'Trùng importKey trong gói';
      else if (live.has(key)) reason = 'Đã có trong app';
      else if (st === 'cc_v2' && !r.fromDate) reason = 'Tuần chấm công thiếu fromDate';
      else if (st === 'cc_v2' && pid && liveWeek.has(`${r.fromDate}|${pid}`)) reason = 'Tuần này của CT đã có chấm công (không gộp vào tuần đã có)';
      else if (st !== 'cc_v2' && !r.ngay) reason = 'Thiếu ngày';
      if (key) seen.add(key);
      if (reason) { plan.skipped.push({ store: st, reason, label: `${_loDate(r && (r.ngay || r.fromDate))} · ${_loRecLabel(st, r || {})}`, amount: _loAmount(st, r) }); return; }
      plan.rows[st].push(r);
      plan.totals[st] = (plan.totals[st] || 0) + _loAmount(st, r);
      if (r.mau === 'vang') plan.vang++;
      if (r.canXem) plan.canXem++;
    });
    plan.counts[st] = plan.rows[st].length;
  });

  // deleteFirst — record app có sẵn sẽ bị xóa khi lô được đưa vào dữ liệu chung
  (pack.deleteFirst || []).forEach(d => {
    const r = load(d.store, []).find(x => x && String(x.id) === String(d.id));
    plan.deleteFirst.push({ ...d, found: !!(r && _loAlive(r)), rec: r || null });
  });

  // Danh mục mới (chưa có / đang bị xóa trong app)
  const items = load('cat_items_v1', {});
  Object.entries(pack.cats || {}).forEach(([type, names]) => {
    if (!LO_CAT_MAP[type] || !Array.isArray(names)) return;
    const alive = new Set((items[type] || []).filter(i => i && !i.isDeleted).map(i => _catNormKey(i.name)));
    const fresh = names.filter(n => n && !alive.has(_catNormKey(n)));
    if (fresh.length) plan.catsNew[type] = fresh;
  });

  if (pack.hopDong && pid) {
    plan.hdBefore = load('hopdong_v1', {})[pid] || null;
    // HĐ hiện tại đã do 1 lô CÙNG MÃ (còn sống) ghi → coi như "đã có", không ghi đè lại
    const hb = plan.hdBefore;
    const owner = hb && _loAlive(hb) && hb.importLot ? loGetLot(hb.importLot) : null;
    if (owner && owner.key === (pack.lot || {}).key && (owner.status === 'draft' || owner.status === 'published')) {
      plan.hdSkip = true;
      plan.skipped.push({ store: 'hopdong_v1', reason: 'HĐ chính đã nhập ở lô trước (cùng mã lô)', label: 'HĐ chính', amount: Number(hb.giaTri) || 0 });
    }
  }
  // CT tạo mới đã xong (closed/completed) mà gói không ghi ngày kết thúc → lấy ngày của dòng cuối cùng.
  // Không có ngày kết thúc thì app coi CT kéo dài tới hôm nay → gánh chi phí chung CÔNG TY các năm sau.
  if (!pid) {
    const pj = pack.project;
    let end = pj.endDate || pj.closedDate || null;
    if (!end && (pj.status === 'closed' || pj.status === 'completed')) {
      LO_STORES.forEach(st => (plan.rows[st] || []).forEach(r => {
        const d = String(r.toDate || r.ngay || r.fromDate || '').slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(d) && (!end || d > end)) end = d;
      }));
      plan.endDateGuess = !!end;
    }
    plan.endDate = end;
  }
  plan.tongChiApp = pid ? loTongChiCT(pid) : 0;
  return plan;
}

function loPreviewPack(pack, fileName) {
  const plan = loBuildPlan(pack, fileName);
  _loPending = plan;
  const pk = plan.pack, chk = pk.check || {};
  const pj = plan.proj;
  const total = Object.values(plan.counts).reduce((s, n) => s + n, 0);
  const hd = plan.hdSkip ? null : pk.hopDong;
  const sameLot = loLots().filter(l => l && l.key === (pk.lot || {}).key && (l.status === 'draft' || l.status === 'published'));
  const tcApp = plan.tongChiApp;
  const tcLech = (tcApp != null && chk.tongChiTruoc != null) ? tcApp - Number(chk.tongChiTruoc) : 0;

  const rowsHtml = LO_STORES.filter(st => plan.counts[st] || (pk.records && pk.records[st] && pk.records[st].length)).map(st =>
    `<tr><td>${LO_STORE_LABEL[st]}</td><td class="text-end">${plan.counts[st] || 0}</td>
     <td class="text-end">${((pk.records[st] || []).length - (plan.counts[st] || 0)) || ''}</td>
     <td class="text-end font-monospace">${_loNum(plan.totals[st] || 0)}</td></tr>`).join('');

  const html = `
    <div class="lo-pv-grid">
      <div><b>Công trình:</b> ${x(pj.name)} ${pj.pid ? `<span class="lo-chip ok">Khớp theo ${x(pj.how)}</span>` : '<span class="lo-chip warn">TẠO MỚI (chỉ admin thấy)</span>'}</div>
      ${!pj.pid ? `<div class="text-secondary" style="font-size:12px">Bắt đầu ${_loDate((pk.project || {}).startDate)}${plan.endDate ? ` · kết thúc ${_loDate(plan.endDate)}${plan.endDateGuess ? ' (tự lấy theo dòng cuối của gói — sửa lại trong form Sửa CT nếu cần)' : ''}` : ''} · trạng thái ${x((pk.project || {}).status || '')}</div>` : ''}
      <div><b>Lô:</b> ${x((pk.lot || {}).key || '—')} <span class="text-secondary">· ${x(plan.file)}</span></div>
      ${(pk.lot || {}).note ? `<div class="text-secondary" style="font-size:12px">${x(pk.lot.note)}</div>` : ''}
    </div>
    ${sameLot.length ? `<div class="lo-warn">⚠️ Gói có cùng mã lô đã được nhập ${sameLot.length} lần và đang còn (${sameLot.map(l => LO_STATUS_LABEL[l.status]).join(', ')}). Các dòng đã có sẽ được bỏ qua.</div>` : ''}
    <table class="table table-sm lo-pv-table"><thead><tr><th>Loại</th><th class="text-end">Sẽ nhập</th><th class="text-end">Bỏ qua</th><th class="text-end">Tổng tiền</th></tr></thead>
      <tbody>${rowsHtml || '<tr><td colspan="4" class="text-secondary">Không có dòng dữ liệu</td></tr>'}</tbody></table>
    ${hd ? `<div class="lo-box"><b>HĐ chính:</b> giá trị ${_loNum(hd.giaTri)}${hd.phatSinh ? ` · phát sinh ${_loNum(hd.phatSinh)}` : ''} · ngày ${_loDate(hd.ngay)}
       <div class="text-secondary" style="font-size:12px">${plan.hdBefore ? `Thay HĐ đang có (giá trị ${_loNum(plan.hdBefore.giaTri)}${plan.hdBefore.deletedAt ? ', đang ở thùng rác' : ''}) — gỡ lô sẽ trả lại HĐ cũ` : 'Chưa có HĐ chính — gỡ lô sẽ xóa HĐ này'}</div></div>` : ''}
    <div class="lo-box">
      <b>Đối chiếu tổng chi (mọi năm, chưa gồm chi phí chung):</b>
      <div>Gói ghi "trước khi nhập": <b>${_loNum(chk.tongChiTruoc)}</b> → "sau khi nhập": <b>${_loNum(chk.tongChiSauImport)}</b></div>
      <div>App đang tính cho CT: <b>${tcApp == null ? '—' : _loNum(tcApp)}</b>
        ${tcApp != null && Math.abs(tcLech) > 1000 ? `<span class="lo-chip warn">lệch ${tcLech > 0 ? '+' : ''}${_loNum(tcLech)} so với gói</span>` : (tcApp != null ? '<span class="lo-chip ok">khớp</span>' : '')}</div>
    </div>
    ${plan.vang || plan.canXem ? `<div class="lo-box"><span class="lo-vang-dot">●</span> ${plan.vang} dòng màu vàng (ước tính / ngày giả định) · <span class="lo-canxem-tag">CẦN XEM</span> ${plan.canXem} dòng nghi trùng</div>` : ''}
    ${(pk.canhBao || []).length ? `<div class="lo-warn"><b>Cảnh báo trong gói:</b><ul>${[...new Set(pk.canhBao)].map(c => `<li>${x(c)}</li>`).join('')}</ul></div>` : ''}
    ${plan.deleteFirst.length ? `<div class="lo-box"><b>Sẽ xóa ${plan.deleteFirst.length} dòng đang có trong app</b> (người khác vẫn thấy cho tới khi "Đưa vào dữ liệu chung"):
       <ul>${plan.deleteFirst.map(d => `<li>${LO_STORE_LABEL[d.store]} ${_loDate(d.ngay)} · ${_loNum(d.tien)} — ${x(d.lyDo || '')}
         ${d.found ? '' : ' <span class="lo-chip warn">không tìm thấy / đã xóa — bỏ qua</span>'}</li>`).join('')}</ul></div>` : ''}
    ${Object.keys(plan.catsNew).length ? `<div class="lo-box"><b>Danh mục mới:</b> ${Object.entries(plan.catsNew).map(([t, n]) => `${x(t)}: ${n.map(x).join(', ')}`).join(' · ')}</div>` : ''}
    ${(pk.boRa || []).length ? `<div class="text-secondary" style="font-size:12px">Gói đã cố ý bỏ ra ${(pk.boRa || []).length} dòng (chỉ để xem).</div>` : ''}
    ${plan.skipped.length ? `<details class="lo-box"><summary><b>${plan.skipped.length} dòng sẽ bị bỏ qua</b></summary>
       <ul style="max-height:200px;overflow:auto">${plan.skipped.map(s => `<li>${LO_STORE_LABEL[s.store]} · ${x(s.label)} · ${_loNum(s.amount)} — <i>${x(s.reason)}</i></li>`).join('')}</ul></details>` : ''}
    <div class="text-secondary" style="font-size:12px;margin-top:6px">Bấm Nhập: app tự tải 1 file sao lưu JSON trước, rồi ghi ${total} dòng vào <b>lô nháp</b> — chỉ admin thấy cho tới khi bấm "Đưa vào dữ liệu chung".</div>`;

  _loModal('Nhập gói công trình — xem trước', html, [
    { label: 'Hủy', cls: 'btn-outline-secondary', fn: '_loCloseModal()' },
    { label: `Nhập ${total} dòng vào lô nháp`, cls: 'btn-primary', fn: 'loDoImport()', id: 'lo-import-go',
      disabled: !total && !hd && !plan.deleteFirst.some(d => d.found) },
  ]);
  if (!total && !hd && !plan.deleteFirst.some(d => d.found)) {
    const body = document.querySelector('#lo-modal .lo-modal-body');
    if (body) body.insertAdjacentHTML('afterbegin', '<div class="lo-warn"><b>Gói này đã có đủ trong app</b> — mọi dòng đều "đã có", không có gì mới để nhập.</div>');
  }
}

// ══════════════════════════════════════════════════════════════
//  5.1 — NHẬP: ghi dữ liệu vào lô nháp
// ══════════════════════════════════════════════════════════════
async function loDoImport() {
  const plan = _loPending;
  if (!plan) return;
  const btn = document.getElementById('lo-import-go');
  if (btn) { btn.disabled = true; btn.textContent = 'Đang nhập...'; }
  const pk = plan.pack, pj = pk.project || {};
  await _loBackup('Trước nhập lô ' + ((pk.lot || {}).key || ''));

  const now = Date.now(), dev = _loDev();
  const lotId = crypto.randomUUID();
  let pid = plan.proj.pid, pname = plan.proj.name, created = false;
  const lot = {
    id: lotId, key: (pk.lot || {}).key || '', file: plan.file, source: (pk.lot || {}).source || '',
    note: (pk.lot || {}).note || '', projectId: null, projectName: pname, projectCreated: false,
    status: 'draft', createdAt: now, createdBy: _loUser(), deviceId: dev,
    publishedAt: null, removedAt: null, purgeAfter: null,
    counts: {}, ids: {}, catsAdded: {}, hopDongBefore: null, deletedFirst: [],
    check: pk.check || {}, checkBefore: plan.tongChiApp, checkActual: null,
    vang: plan.vang, canXem: plan.canXem, updatedAt: now, deletedAt: null,
  };

  _loBypass = true;
  try {
    // 1) Công trình (tạo mới → draft)
    if (!pid) {
      const yr = Number(pj.createdYear) || (pj.startDate ? Number(String(pj.startDate).slice(0, 4)) : undefined);
      const p = createProject({
        name: pname, type: pj.type || 'OTHER', status: pj.status || 'active',
        startDate: pj.startDate || undefined, year: yr,
        endDate: plan.endDate || undefined, closedDate: (pj.status === 'closed' ? (pj.closedDate || plan.endDate) : null) || undefined,
        chuDauTu: (pk.hopDong && pk.hopDong.khachHang) || '',
        loaiCongTrinh: (typeof ctDetectLoai === 'function') ? ctDetectLoai(pname) : '',
      });
      const raw = load('projects_v1', []).map(x2 => x2 && x2.id === p.id
        ? { ...x2, draft: true, importLot: lotId, updatedAt: Date.now() } : x2);
      save('projects_v1', raw);
      pid = p.id; pname = p.name; created = true;
    }
    lot.projectId = pid; lot.projectName = pname; lot.projectCreated = created;

    // 2) Danh mục mới
    Object.entries(pk.cats || {}).forEach(([type, names]) => {
      const catId = LO_CAT_MAP[type];
      if (!catId || !Array.isArray(names) || !names.length) return;
      _syncCatItems(catId, names, { revive: true });
      if (plan.catsNew[type]) lot.catsAdded[type] = plan.catsNew[type].slice();
    });
    if (typeof _rebuildCatArrsFromItems === 'function') _rebuildCatArrsFromItems();

    // 3) deleteFirst — đánh dấu ẩn (draftHide); xóa mềm thật khi "Đưa vào dữ liệu chung"
    const dfByStore = {};
    plan.deleteFirst.filter(d => d.found).forEach(d => { (dfByStore[d.store] = dfByStore[d.store] || new Set()).add(String(d.id)); });
    Object.entries(dfByStore).forEach(([st, ids]) => {
      save(st, load(st, []).map(r => (r && ids.has(String(r.id)) && _loAlive(r))
        ? (lot.deletedFirst.push({ store: st, id: String(r.id) }), { ...r, draftHide: lotId, updatedAt: now, deviceId: dev })
        : r));
    });

    // 4) HĐ chính — khóa theo projectId; lưu bản cũ vào hopDongBefore
    if (pk.hopDong && !plan.hdSkip) {
      const all = { ...load('hopdong_v1', {}) };
      const cur = all[pid] || null;
      lot.hopDongBefore = cur ? JSON.parse(JSON.stringify(cur)) : 'none';
      const alive = (cur && _loAlive(cur)) ? cur : null;
      const { draft: _d, draftBefore: _db, importLot: _il, ...aliveClean } = alive || {};
      const h = pk.hopDong;
      all[pid] = {
        ...aliveClean,
        projectId: pid,
        ngay: h.ngay || aliveClean.ngay || '', nguoi: h.nguoi || '',
        giaTri: Number(h.giaTri) || 0, giaTriphu: Number(h.giaTriphu) || 0, phatSinh: Number(h.phatSinh) || 0,
        ghichu: h.ghichu || '', khachHang: h.khachHang || aliveClean.khachHang || '',
        mau: h.mau || '',
        createdAt: aliveClean.createdAt || now, updatedAt: now, deletedAt: null, deviceId: dev,
        importLot: lotId, draft: true, draftBefore: alive ? aliveClean : null,
      };
      delete all[pid].purgedAt;
      save('hopdong_v1', all);
    }

    // 5) Records — id mới, gắn công trình + dấu lô
    const ccName = pname;
    LO_STORES.forEach(st => {
      const src = plan.rows[st] || [];
      if (!src.length) return;
      const recs = src.map(r => {
        const base = { ...r, id: crypto.randomUUID(), createdAt: now, updatedAt: now, deletedAt: null, deviceId: dev,
                       projectId: pid, importLot: lotId, importKey: String(r.importKey), draft: true };
        delete base.purgedAt; delete base.draftHide;
        if (st === 'cc_v2') {
          base.ct = ccName; base.ctPid = pid;
          if (!base.toDate && typeof ccSaturdayISO === 'function') base.toDate = ccSaturdayISO(base.fromDate);
        } else {
          base.congtrinh = ccName;
        }
        return base;
      });
      save(st, mergeUnique(load(st, []), recs));
      lot.ids[st] = recs.map(r => r.id);
      lot.counts[st] = recs.length;
    });

    // 6) Bản ghi lô
    _loSaveLots([...loLots(), lot]);
  } catch (e) {
    console.error('[Lô nhập] Nhập lỗi:', e);
    _loAlert('Nhập lỗi giữa chừng: ' + (e.message || e) + '\n\nDữ liệu đã ghi một phần (nếu có) vẫn mang dấu lô nháp — có thể gỡ ở màn Lô nhập. File sao lưu JSON đã được tải về trước khi nhập.');
    if (lot.projectId || Object.keys(lot.ids).length) {
      lot.note = (lot.note ? lot.note + ' · ' : '') + 'NHẬP LỖI GIỮA CHỪNG: ' + (e.message || e);
      if (!loGetLot(lotId)) _loSaveLots([...loLots(), lot]);
    }
  } finally {
    _loBypass = false;
    _loPending = null;
  }

  _loCloseModal();
  _loAfterChange();
  // 7) Chờ đẩy cloud xong rồi mới đối chiếu
  if (typeof showSyncBanner === 'function') showSyncBanner('⏳ Đang đẩy lô nhập lên cloud...');
  const ok = await _loPushNow();
  if (typeof hideSyncBanner === 'function') hideSyncBanner();
  const actual = loTongChiCT(lot.projectId);
  _loUpdateLot(lotId, { checkActual: actual });
  loRenderSection();
  const exp = Number((lot.check || {}).tongChiSauImport);
  const lech = (actual != null && isFinite(exp)) ? actual - exp : 0;
  const n = Object.values(lot.counts).reduce((s, v) => s + v, 0);
  let msg = `Đã nhập ${n} dòng vào lô nháp "${lot.key}" (${lot.projectName}).`;
  msg += ok === false ? '\n⚠️ Đẩy cloud chưa xong — app sẽ tự thử lại (dữ liệu vẫn an toàn trong máy).' : '';
  if (actual != null && Math.abs(lech) > 1000) msg += `\n⚠️ Tổng chi app tính: ${_loNum(actual)} — lệch ${lech > 0 ? '+' : ''}${_loNum(lech)} so với gói (${_loNum(exp)}).`;
  else if (actual != null) msg += `\n✔ Tổng chi = ${_loNum(actual)} (khớp gói).`;
  toast(msg.split('\n')[0], 'success');
  if (msg.includes('\n')) setTimeout(() => _loAlert(msg), 50);
}

// ══════════════════════════════════════════════════════════════
//  5.4 — ĐƯA VÀO DỮ LIỆU CHUNG
// ══════════════════════════════════════════════════════════════
function _loLotRecs(lot, st) {
  const ids = new Set(((lot.ids || {})[st] || []).map(String));
  return load(st, []).filter(r => r && (r.importLot === lot.id || ids.has(String(r.id))));
}

async function loPublish(lotId) {
  const lot = loGetLot(lotId);
  if (!lot || lot.status !== 'draft') { toast('Lô không ở trạng thái nháp', 'error'); return; }
  if (typeof isAdmin !== 'function' || !isAdmin()) return;
  const n = LO_STORES.reduce((s, st) => s + _loLotRecs(lot, st).filter(r => r.draft === true && _loAlive(r)).length, 0);
  const df = (lot.deletedFirst || []).length;
  if (!window.confirm(`Giám đốc và kế toán sẽ thấy ${n} dòng của CT "${lot.projectName}"` +
      `${lot.projectCreated ? ' (công trình mới)' : ''}${df ? `, và ${df} dòng cũ sẽ bị xóa` : ''}.\n\nĐưa lô "${lot.key}" vào dữ liệu chung?`)) return;
  const now = Date.now(), dev = _loDev();
  const strip = r => { const o = { ...r, updatedAt: now, deviceId: dev }; delete o.draft; return o; };
  _loBypass = true;
  try {
    LO_STORES.forEach(st => {
      let ch = false;
      const arr = load(st, []).map(r => {
        if (r && r.importLot === lotId && r.draft === true) { ch = true; return strip(r); }
        if (r && r.draftHide === lotId) {
          ch = true;
          const o = { ...r, deletedAt: now, updatedAt: now, deviceId: dev }; delete o.draftHide; return o;
        }
        return r;
      });
      if (ch) save(st, arr);
    });
    const pr = load('projects_v1', []);
    if (pr.some(p => p && p.importLot === lotId && p.draft === true)) {
      save('projects_v1', pr.map(p => (p && p.importLot === lotId && p.draft === true) ? strip(p) : p));
    }
    const hd = load('hopdong_v1', {});
    const h = hd[lot.projectId];
    if (h && h.importLot === lotId && h.draft === true) {
      const nh = strip(h); delete nh.draftBefore;
      save('hopdong_v1', { ...hd, [lot.projectId]: nh });
    }
    _loUpdateLot(lotId, { status: 'published', publishedAt: now });
  } finally { _loBypass = false; }
  _loAfterChange();
  toast(`Đã đưa lô "${lot.key}" vào dữ liệu chung`, 'success');
  await _loPushNow();
  loRenderSection();
}

// ══════════════════════════════════════════════════════════════
//  5.5 — GỠ TOÀN BỘ LÔ / KHÔI PHỤC / XÓA HẲN
// ══════════════════════════════════════════════════════════════
let _loRemoveCtx = null;

function loRemovePrompt(lotId) {
  const lot = loGetLot(lotId);
  if (!lot || (lot.status !== 'draft' && lot.status !== 'published')) { toast('Lô này không gỡ được', 'error'); return; }
  const pub = lot.status === 'published' && lot.publishedAt;
  const mine = [], edited = [], others = [];
  LO_STORES.forEach(st => {
    const lotRecs = _loLotRecs(lot, st);
    const lotIds = new Set(lotRecs.map(r => String(r.id)));
    lotRecs.filter(_loAlive).forEach(r => {
      mine.push({ st, r });
      if (pub && (r.updatedAt || 0) > lot.publishedAt && r.deviceId && r.deviceId !== lot.deviceId) edited.push({ st, r });
    });
    if (pub) {
      load(st, []).forEach(r => {
        if (!_loAlive(r) || lotIds.has(String(r.id)) || _loPid(st, r) !== lot.projectId) return;
        if ((r.createdAt || 0) > lot.publishedAt || (r.updatedAt || 0) > lot.publishedAt) others.push({ st, r });
      });
    }
  });
  _loRemoveCtx = { lotId, mine, edited, others };
  const li = (it, i, grp, checked) => `<label class="lo-chk"><input type="checkbox" data-grp="${grp}" data-i="${i}" ${checked ? 'checked' : ''}/>
      ${LO_STORE_LABEL[it.st]} · ${_loDate(it.r.ngay || it.r.fromDate)} · ${x(_loRecLabel(it.st, it.r))} · <b>${_loNum(_loAmount(it.st, it.r))}</b>
      <span class="text-secondary">(sửa ${_loTs(it.r.updatedAt)})</span></label>`;
  const html = `
    <div>Lô <b>${x(lot.key)}</b> · CT <b>${x(lot.projectName)}</b> · ${LO_STATUS_LABEL[lot.status]}</div>
    <ul>
      <li>Xóa mềm <b>${mine.length}</b> dòng của lô (không hiện trong Thùng rác — quản lý ở màn Lô nhập, khôi phục được trong ${LO_PURGE_DAYS} ngày).</li>
      ${(lot.deletedFirst || []).length ? `<li>Trả lại ${(lot.deletedFirst || []).length} dòng cũ mà lô đã xóa (deleteFirst).</li>` : ''}
      ${lot.hopDongBefore ? `<li>${lot.hopDongBefore === 'none' ? 'Xóa HĐ chính do lô tạo.' : 'Trả HĐ chính về bản trước khi nhập.'}</li>` : ''}
      ${lot.projectCreated ? '<li>Công trình do lô tạo sẽ bị xóa mềm nếu không còn dòng nào khác.</li>' : ''}
      ${Object.keys(lot.catsAdded || {}).length ? '<li>Danh mục do lô thêm sẽ bị xóa nếu không còn dòng nào dùng.</li>' : ''}
    </ul>
    ${edited.length ? `<div class="lo-box"><b>${edited.length} dòng của lô đã bị người khác sửa sau khi đưa vào chung</b> — đánh dấu = gỡ (mặc định):
      <div class="lo-chk-list">${edited.map((it, i) => li(it, i, 'edited', true)).join('')}</div></div>` : ''}
    ${others.length ? `<div class="lo-box"><b>${others.length} dòng KHÔNG thuộc lô</b>, được thêm / sửa ở CT này sau khi đưa vào chung (có thể do giám đốc / kế toán) — đánh dấu = gỡ luôn, bỏ trống = giữ:
      <div class="lo-chk-list">${others.map((it, i) => li(it, i, 'others', false)).join('')}</div></div>` : ''}
    <div class="text-secondary" style="font-size:12px">App sẽ tự tải 1 file sao lưu JSON trước khi gỡ.</div>`;
  _loModal('Gỡ toàn bộ lô', html, [
    { label: 'Hủy', cls: 'btn-outline-secondary', fn: '_loCloseModal()' },
    { label: 'Gỡ toàn bộ lô', cls: 'btn-danger', fn: '_loRemoveConfirm()' },
  ]);
}

async function _loRemoveConfirm() {
  const ctx = _loRemoveCtx;
  if (!ctx) return;
  const box = document.getElementById('lo-modal');
  const pick = grp => [...(box ? box.querySelectorAll(`input[data-grp="${grp}"]`) : [])];
  const keepLot = new Set(pick('edited').filter(c => !c.checked).map(c => {
    const it = ctx.edited[+c.dataset.i]; return `${it.st}|${it.r.id}`;
  }));
  const extra = pick('others').filter(c => c.checked).map(c => ctx.others[+c.dataset.i]).map(it => ({ store: it.st, id: String(it.r.id) }));
  const lot = loGetLot(ctx.lotId);
  if (!lot) return;
  if (!window.confirm(`XÁC NHẬN LẦN 2: gỡ toàn bộ lô "${lot.key}" (${lot.projectName})?\n\n` +
      `${ctx.mine.length - keepLot.size} dòng của lô${extra.length ? ` + ${extra.length} dòng khác` : ''} sẽ bị gỡ.`)) return;
  _loCloseModal();
  await loDoRemove(ctx.lotId, { keepLot, extra });
  _loRemoveCtx = null;
}

async function loDoRemove(lotId, opts) {
  const lot = loGetLot(lotId);
  if (!lot || (lot.status !== 'draft' && lot.status !== 'published')) return false;
  const keepLot = (opts && opts.keepLot) || new Set();
  const extra = (opts && opts.extra) || [];
  if (!(opts && opts.noBackup)) await _loBackup('Trước gỡ lô ' + lot.key);
  const T = Date.now(), dev = _loDev();
  const removedIds = {};
  const extraSet = new Set(extra.map(e => `${e.store}|${e.id}`));
  _loBypass = true;
  try {
    // 1) Xóa mềm record của lô (+ record khác được chọn)
    LO_STORES.forEach(st => {
      const lotIds = new Set(((lot.ids || {})[st] || []).map(String));
      const out = [];
      const arr = load(st, []).map(r => {
        if (!_loAlive(r)) return r;
        const isLot = r.importLot === lotId || lotIds.has(String(r.id));
        const take = (isLot && !keepLot.has(`${st}|${r.id}`)) || extraSet.has(`${st}|${r.id}`);
        if (!take) return r;
        out.push(String(r.id));
        return { ...r, deletedAt: T, updatedAt: T, deviceId: dev };
      });
      if (out.length) { removedIds[st] = out; save(st, arr); }
    });
    // 2) Trả lại deleteFirst
    const dfBy = {};
    (lot.deletedFirst || []).forEach(d => { (dfBy[d.store] = dfBy[d.store] || new Set()).add(String(d.id)); });
    Object.entries(dfBy).forEach(([st, ids]) => {
      save(st, load(st, []).map(r => {
        if (!r || !ids.has(String(r.id)) || r.purgedAt) return r;
        if (r.draftHide === lotId) { const o = { ...r, updatedAt: T, deviceId: dev }; delete o.draftHide; return o; }
        if (r.deletedAt) return { ...r, deletedAt: null, updatedAt: T, deviceId: dev };
        return r;
      }));
    });
    // 3) HĐ chính về bản cũ (chỉ khi HĐ hiện tại vẫn là của lô này)
    let hopDongAfter = null;
    if (lot.hopDongBefore) {
      const hd = { ...load('hopdong_v1', {}) };
      const cur = hd[lot.projectId];
      if (cur && cur.importLot === lotId) {
        hopDongAfter = JSON.parse(JSON.stringify(cur));
        if (lot.hopDongBefore === 'none') {
          const o = { ...cur, deletedAt: T, updatedAt: T, deviceId: dev }; delete o.draft; delete o.draftBefore;
          hd[lot.projectId] = o;
        } else {
          hd[lot.projectId] = { ...lot.hopDongBefore, updatedAt: T, deviceId: dev };
        }
        save('hopdong_v1', hd);
      }
    }
    // 4) Công trình do lô tạo — xóa mềm nếu không còn record sống nào trỏ tới
    let projectRemoved = false;
    if (lot.projectCreated && lot.projectId) {
      const stillUsed = ['inv_v3', 'ung_v1', 'cc_v2', 'thu_v1', 'thauphu_v1', 'tb_v1', 'quyettoan_v1']
        .some(st => load(st, []).some(r => _loAlive(r) && _loPid(st, r) === lot.projectId));
      const hdLive = _loAlive(load('hopdong_v1', {})[lot.projectId]);
      if (!stillUsed && !hdLive) {
        save('projects_v1', load('projects_v1', []).map(p => (p && p.id === lot.projectId && _loAlive(p))
          ? (projectRemoved = true, { ...p, deletedAt: T, updatedAt: T, deviceId: dev }) : p));
      }
    }
    // 5) Danh mục do lô thêm — xóa nếu không còn record sống nào dùng
    if (typeof clearInvoiceCache === 'function') clearInvoiceCache();
    const catsRemoved = {};
    Object.entries(lot.catsAdded || {}).forEach(([type, names]) => {
      const catId = LO_CAT_MAP[type];
      const unused = (names || []).filter(n => !(typeof isItemInUse === 'function' && isItemInUse(catId, n)));
      if (unused.length && _loCatSetDeleted(type, unused, true)) catsRemoved[type] = unused;
    });
    _loUpdateLot(lotId, {
      status: 'removed', prevStatus: lot.status, removedAt: T, purgeAfter: T + LO_PURGE_DAYS * 86400000,
      removedIds, hopDongAfter, projectRemoved, catsRemoved,
    });
  } finally { _loBypass = false; }
  _loAfterChange();
  toast(`Đã gỡ lô "${lot.key}" — khôi phục được trong ${LO_PURGE_DAYS} ngày`, 'success');
  await _loPushNow();
  loRenderSection();
  return true;
}

// Đặt isDeleted cho tên danh mục (khớp không dấu). Trả true nếu có đổi.
function _loCatSetDeleted(type, names, deleted) {
  const all = load('cat_items_v1', {});
  const want = new Set((names || []).map(n => _catNormKey(n)));
  let ch = false;
  const now = Date.now();
  (all[type] || []).forEach(it => {
    if (it && want.has(_catNormKey(it.name)) && !!it.isDeleted !== deleted) { it.isDeleted = deleted; it.updatedAt = now; ch = true; }
  });
  if (!ch) return false;
  save('cat_items_v1', all);
  if (typeof _rebuildCatArrsFromItems === 'function') _rebuildCatArrsFromItems();
  if (typeof rebuildCatIdMaps === 'function') rebuildCatIdMaps();
  return true;
}

async function loRestore(lotId) {
  const lot = loGetLot(lotId);
  if (!lot || lot.status !== 'removed') { toast('Lô không ở trạng thái đã gỡ', 'error'); return; }
  if (lot.purgeAfter && Date.now() > lot.purgeAfter) { toast('Đã quá hạn khôi phục', 'error'); return; }
  if (!window.confirm(`Khôi phục lô "${lot.key}" (${lot.projectName}) về trạng thái "${LO_STATUS_LABEL[lot.prevStatus] || 'Nháp'}"?`)) return;
  const now = Date.now(), dev = _loDev();
  const prev = lot.prevStatus === 'published' ? 'published' : 'draft';
  let skipped = 0;
  _loBypass = true;
  try {
    Object.entries(lot.removedIds || {}).forEach(([st, ids]) => {
      const set = new Set((ids || []).map(String));
      // importKey đã có ở record SỐNG khác (vd đã nhập lại gói) → không khôi phục bản cũ (tránh trùng)
      const liveKeys = new Set(load(st, []).filter(r => _loAlive(r) && r.importKey && !set.has(String(r.id))).map(r => String(r.importKey)));
      save(st, load(st, []).map(r => {
        if (!r || !set.has(String(r.id)) || r.purgedAt || r.deletedAt !== lot.removedAt) return r;
        if (r.importKey && liveKeys.has(String(r.importKey))) { skipped++; return r; }
        return { ...r, deletedAt: null, updatedAt: now, deviceId: dev };
      }));
    });
    const dfBy = {};
    (lot.deletedFirst || []).forEach(d => { (dfBy[d.store] = dfBy[d.store] || new Set()).add(String(d.id)); });
    Object.entries(dfBy).forEach(([st, ids]) => {
      save(st, load(st, []).map(r => {
        if (!r || !ids.has(String(r.id)) || !_loAlive(r)) return r;
        return prev === 'draft' ? { ...r, draftHide: lotId, updatedAt: now, deviceId: dev }
                                : { ...r, deletedAt: now, updatedAt: now, deviceId: dev };
      }));
    });
    if (lot.hopDongAfter && typeof lot.hopDongAfter === 'object') {
      const hd = load('hopdong_v1', {});
      save('hopdong_v1', { ...hd, [lot.projectId]: { ...lot.hopDongAfter, deletedAt: null, updatedAt: now, deviceId: dev } });
    }
    if (lot.projectRemoved) {
      save('projects_v1', load('projects_v1', []).map(p => (p && p.id === lot.projectId && !p.purgedAt)
        ? { ...p, deletedAt: null, updatedAt: now, deviceId: dev } : p));
    }
    Object.entries(lot.catsRemoved || {}).forEach(([type, names]) => _loCatSetDeleted(type, names, false));
    _loUpdateLot(lotId, { status: prev, removedAt: null, purgeAfter: null, removedIds: {}, hopDongAfter: null,
                          projectRemoved: false, catsRemoved: {}, restoredAt: now });
  } finally { _loBypass = false; }
  _loAfterChange();
  toast(`Đã khôi phục lô "${lot.key}"${skipped ? ` (bỏ qua ${skipped} dòng đã có bản sống khác)` : ''}`, 'success');
  await _loPushNow();
  loRenderSection();
}

// Xóa hẳn: đặt bia mộ purgedAt (cùng cơ chế Thùng rác) → máy khác không làm sống lại được.
// HĐ chính KHÔNG đặt bia mộ (bia mộ HĐ luôn thắng → nhập lại gói sẽ không ghi được HĐ mới).
async function loPurge(lotId, auto) {
  const lot = loGetLot(lotId);
  if (!lot || lot.status !== 'removed') { if (!auto) toast('Chỉ xóa hẳn được lô đã gỡ', 'error'); return false; }
  if (!auto) {
    if (!window.confirm(`Xóa hẳn lô "${lot.key}"? Không khôi phục được nữa.`)) return false;
    if (!window.confirm('XÁC NHẬN LẦN 2: xóa hẳn (vĩnh viễn) các dòng của lô này?')) return false;
  }
  const now = Date.now();
  const tomb = r => (typeof _trashTomb === 'function') ? _trashTomb(r, now)
    : { ...r, deletedAt: r.deletedAt || now, purgedAt: now, updatedAt: now, deviceId: _loDev() };
  _loBypass = true;
  try {
    Object.entries(lot.removedIds || {}).forEach(([st, ids]) => {
      const set = new Set((ids || []).map(String));
      let n = 0;
      const arr = load(st, []).map(r => (r && set.has(String(r.id)) && r.deletedAt && !r.purgedAt) ? (n++, tomb(r)) : r);
      if (n) save(st, arr);
    });
    if (lot.projectRemoved) {
      save('projects_v1', load('projects_v1', []).map(p => (p && p.id === lot.projectId && p.deletedAt && !p.purgedAt) ? tomb(p) : p));
    }
    _loUpdateLot(lotId, { status: 'purged', purgedAt: now });
  } finally { _loBypass = false; }
  _loAfterChange();
  if (!auto) toast(`Đã xóa hẳn lô "${lot.key}"`, 'success');
  await _loPushNow();
  loRenderSection();
  return true;
}

// Mở app: lô đã gỡ quá hạn purgeAfter → tự xóa hẳn (chỉ máy admin chạy)
async function loAutoPurge() {
  if (typeof isAdmin !== 'function' || !isAdmin()) return;
  const due = loLots().filter(l => l && l.status === 'removed' && l.purgeAfter && Date.now() > l.purgeAfter);
  for (const l of due) {
    console.log('[Lô nhập] Tự xóa hẳn lô quá hạn:', l.key);
    await loPurge(l.id, true);
  }
}

// ══════════════════════════════════════════════════════════════
//  XEM LÔ + TẢI DANH SÁCH ID
// ══════════════════════════════════════════════════════════════
function loView(lotId) {
  const lot = loGetLot(lotId);
  if (!lot) return;
  const sections = LO_STORES.map(st => {
    const recs = _loLotRecs(lot, st).sort((a, b) => String(a.ngay || a.fromDate || '').localeCompare(String(b.ngay || b.fromDate || '')));
    if (!recs.length) return '';
    const sum = recs.filter(_loAlive).reduce((s, r) => s + _loAmount(st, r), 0);
    return `<div class="lo-view-sec"><div class="lo-view-h">${LO_STORE_LABEL[st]} — ${recs.length} dòng · ${_loNum(sum)}</div>
      ${recs.map(r => `<div class="lo-view-row lo-mau-${x(r.mau || '')}${_loAlive(r) ? '' : ' lo-dead'}">
        <span class="font-monospace">${_loDate(r.ngay || r.fromDate)}</span>
        <span class="lo-view-nd">${r.draft === true ? '<span class="lo-draft-tag">NHÁP</span>' : ''}${r.canXem ? `<span class="lo-canxem-tag" title="${x(r.canXem)}">CẦN XEM</span>` : ''}${x(_loRecLabel(st, r))}${r.purgedAt ? ' <i>(đã xóa hẳn)</i>' : r.deletedAt ? ' <i>(đã xóa)</i>' : ''}</span>
        <b class="font-monospace">${_loNum(_loAmount(st, r))}</b></div>`).join('')}</div>`;
  }).join('');
  const isMb = typeof MB !== 'undefined' && MB.on;
  _loModal(`Lô ${x(lot.key)} — ${x(lot.projectName)}`, sections || '<div class="text-secondary">Lô không có dòng dữ liệu</div>', [
    { label: 'Đóng', cls: 'btn-outline-secondary', fn: '_loCloseModal()' },
    ...((lot.status === 'draft' || lot.status === 'published') && lot.projectId ? [{ label: 'Mở công trình', cls: 'btn-primary',
      fn: isMb ? `_loCloseModal();mbOpenProject('${lot.projectId}')` : `_loCloseModal();openCTDetail('${lot.projectId}')` }] : []),
  ]);
}

function loDownloadIds(lotId) {
  const lot = loGetLot(lotId);
  if (!lot) return;
  const rows = [['store', 'id', 'importKey', 'ngay', 'so_tien', 'trang_thai', 'mau', 'canXem']];
  LO_STORES.forEach(st => _loLotRecs(lot, st).forEach(r => rows.push([
    st, r.id, r.importKey || '', r.ngay || r.fromDate || '', Math.round(_loAmount(st, r)),
    r.purgedAt ? 'xoa_han' : r.deletedAt ? 'da_xoa' : (r.draft ? 'nhap' : 'song'), r.mau || '', r.canXem || ''])));
  (lot.deletedFirst || []).forEach(d => rows.push([d.store, d.id, '', '', '', 'deleteFirst', '', '']));
  if (lot.projectCreated) rows.push(['projects_v1', lot.projectId, '', '', '', 'cong_trinh_do_lo_tao', '', '']);
  _loDownload(`lo_${(lot.key || lot.id).replace(/[^\w.-]+/g, '_')}_ids.csv`, '﻿' + rows.map(r => r.map(_loCsvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
}

// ══════════════════════════════════════════════════════════════
//  5.6 — MÀN "LÔ NHẬP" (tab Danh Mục, chỉ admin)
// ══════════════════════════════════════════════════════════════
function _loStatusHtml(l) {
  if (l.status === 'removed') {
    const days = l.purgeAfter ? Math.max(0, Math.ceil((l.purgeAfter - Date.now()) / 86400000)) : 0;
    return `<span class="lo-st lo-st-removed">Đã gỡ, còn ${days} ngày</span>`;
  }
  return `<span class="lo-st lo-st-${l.status}">${LO_STATUS_LABEL[l.status] || l.status}</span>`;
}
function _loCheckHtml(l) {
  const exp = Number((l.check || {}).tongChiSauImport);
  const act = l.checkActual;
  const lech = (act != null && isFinite(exp)) ? act - exp : 0;
  const warn = act != null && isFinite(exp) && Math.abs(lech) > 1000;
  return `<span title="Dự kiến (gói) / Thực tế (app tính sau khi nhập)">${isFinite(exp) ? _loNum(exp) : '—'} / <span class="${warn ? 'lo-lech' : ''}">${act == null ? '—' : _loNum(act)}</span></span>${warn ? `<div class="lo-lech" style="font-size:11px">lệch ${lech > 0 ? '+' : ''}${_loNum(lech)}</div>` : ''}`;
}
function _loBtns(l) {
  const b = [`<button class="btn btn-sm btn-outline-secondary" onclick="loView('${l.id}')">Xem</button>`];
  if (l.status === 'draft') b.push(`<button class="btn btn-sm btn-warning" onclick="loPublish('${l.id}')">Đưa vào dữ liệu chung</button>`);
  if (l.status === 'draft' || l.status === 'published') b.push(`<button class="btn btn-sm btn-outline-danger" onclick="loRemovePrompt('${l.id}')">Gỡ toàn bộ lô</button>`);
  if (l.status === 'removed') {
    b.push(`<button class="btn btn-sm btn-outline-primary" onclick="loRestore('${l.id}')">Khôi phục lô</button>`);
    b.push(`<button class="btn btn-sm btn-outline-danger" onclick="loPurge('${l.id}')">Xóa hẳn</button>`);
  }
  b.push(`<button class="btn btn-sm btn-outline-secondary" onclick="loDownloadIds('${l.id}')" title="Tải danh sách ID (CSV)">ID (CSV)</button>`);
  return b.join(' ');
}
function _loGroups() {
  const groups = new Map();
  loLots().filter(l => l && !l.deletedAt).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).forEach(l => {
    const k = l.projectId || l.projectName;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(l);
  });
  return groups;
}

function loRenderSection() {
  const el = document.getElementById('lo-section');
  if (!el) return;
  const admin = typeof isAdmin === 'function' && isAdmin();
  el.style.display = admin ? '' : 'none';
  if (!admin) { el.innerHTML = ''; return; }
  const groups = _loGroups();
  const rows = [...groups.values()].map(list => {
    const head = `<tr class="lo-grp"><td colspan="7"><b>${x(list[0].projectName || '—')}</b> <span class="text-secondary">· ${list.length} lô</span></td></tr>`;
    return head + list.map(l => {
      const n = Object.values(l.counts || {}).reduce((s, v) => s + (v || 0), 0);
      return `<tr>
        <td class="text-secondary" style="font-size:12px">${x(l.key || '—')}<div style="font-size:11px">${x(l.file || '')}</div>${l.note && /LỖI/.test(l.note) ? `<div class="lo-lech" style="font-size:11px">${x(l.note)}</div>` : ''}</td>
        <td style="font-size:12px;white-space:nowrap">${_loTs(l.createdAt)}<div class="text-secondary">${x(l.createdBy || '')}</div></td>
        <td>${_loStatusHtml(l)}</td>
        <td class="text-end">${n}${l.hopDongBefore ? '<div class="text-secondary" style="font-size:11px">+ HĐ chính</div>' : ''}${(l.deletedFirst || []).length ? `<div class="text-secondary" style="font-size:11px">xóa ${(l.deletedFirst || []).length}</div>` : ''}</td>
        <td class="text-end font-monospace" style="font-size:12px">${_loCheckHtml(l)}</td>
        <td class="text-end">${l.canXem ? `<span class="lo-canxem-tag">${l.canXem}</span>` : ''}</td>
        <td style="white-space:normal">${_loBtns(l)}</td></tr>`;
    }).join('');
  }).join('');
  el.innerHTML = `
    <div class="section-header d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
      <div class="section-title fw-bold mb-0 d-flex align-items-center gap-2"><span class="dot"></span><span class="material-symbols-outlined msi-gap">inventory</span>Lô nhập (gói công trình)</div>
      <div class="d-flex gap-2 flex-wrap">
        <button class="btn btn-outline-secondary btn-sm" onclick="loToggleViewAsGD()"><span class="material-symbols-outlined msi-gap">${loIsViewAsGD() ? 'visibility_off' : 'visibility'}</span>${loIsViewAsGD() ? 'Tắt "Xem như giám đốc"' : 'Xem như giám đốc'}</button>
        <button class="btn btn-primary btn-sm" onclick="loOpenImport()"><span class="material-symbols-outlined msi-gap">upload_file</span>Nhập gói công trình (.json)</button>
      </div>
    </div>
    ${_loRulesBlocked ? '<div class="lo-warn">⛔ Firestore chưa cho phép doc <b>meta_lo_nhap</b> — danh sách lô chưa lên cloud được. Cần cập nhật Firestore Rules.</div>' : ''}
    <div class="records-wrap card shadow-sm overflow-hidden"><div class="table-responsive">
      <table class="table table-sm align-middle mb-0 lo-table">
        <thead><tr><th>Lô</th><th>Ngày nhập · người</th><th>Trạng thái</th><th class="text-end">Số dòng</th><th class="text-end">Tổng chi dự kiến / thực tế</th><th class="text-end">Cần xem</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" class="text-secondary text-center" style="padding:16px">Chưa có lô nhập nào. Bấm "Nhập gói công trình (.json)".</td></tr>'}</tbody>
      </table></div></div>
    <div class="text-secondary" style="font-size:12px;margin-top:6px">Dòng của lô <b>Nháp</b> chỉ admin thấy (nhãn <span class="lo-draft-tag">NHÁP</span>). Gỡ lô dùng được cả khi đã đưa vào chung; khôi phục trong ${LO_PURGE_DAYS} ngày, sau đó tự xóa hẳn.</div>`;
}

// Mobile — mục Lô nhập cuối màn Danh mục (chỉ admin)
function loMbSection() {
  if (typeof isAdmin !== 'function' || !isAdmin()) return '';
  const groups = _loGroups();
  const cards = [...groups.values()].map(list => `<div class="mb-card mb-card-sm">
      <div style="font-size:13px;font-weight:700;margin-bottom:6px">${x(list[0].projectName || '—')}</div>
      ${list.map(l => {
        const n = Object.values(l.counts || {}).reduce((s, v) => s + (v || 0), 0);
        return `<div class="lo-mb-lot">
          <div class="mb-row-between" style="font-size:11.5px"><span>${_loTs(l.createdAt)} · ${n} dòng${l.hopDongBefore ? ' + HĐ chính' : ''}</span>${_loStatusHtml(l)}</div>
          <div style="font-size:11px;color:var(--mb-muted-2);margin:3px 0">Tổng chi: ${_loCheckHtml(l)}${l.canXem ? ` · <span class="lo-canxem-tag">${l.canXem} cần xem</span>` : ''}</div>
          <div class="lo-mb-btns">${_loBtns(l)}</div></div>`;
      }).join('')}</div>`).join('');
  return `<div style="margin-top:14px">
    <div class="mb-row-between" style="align-items:center;margin-bottom:8px">
      <div style="font-size:14px;font-weight:800">Lô nhập (gói công trình)</div>
      <button class="mb-btn-outline blue" onclick="loToggleViewAsGD()">${loIsViewAsGD() ? 'Tắt xem như GĐ' : 'Xem như GĐ'}</button>
    </div>
    <button class="mb-btn-outline blue" style="width:100%;margin-bottom:8px" onclick="loOpenImport()">Nhập gói công trình (.json)</button>
    ${_loRulesBlocked ? '<div class="lo-warn">⛔ Firestore chưa cho phép doc meta_lo_nhap — cần cập nhật Rules.</div>' : ''}
    ${cards || '<div class="mb-empty" style="padding:12px 0">Chưa có lô nhập nào</div>'}
  </div>`;
}

// Mobile — thẻ trên đầu Chi tiết công trình khi CT có lô nháp
function loMbProjectCard(pid) {
  if (!loIsAdminView()) return '';
  const n = _loDraftCounts().get(pid) || 0;
  const lots = loDraftLotsOf(pid);
  if (!n && !lots.length) return '';
  return `<div class="mb-card mb-card-sm lo-mb-draftcard">
    <div>${loCtDraftBadge(pid) || '<span class="lo-draft-badge">Lô nháp</span>'} <span style="font-size:11px;color:var(--mb-muted-2)">chỉ admin thấy</span></div>
    ${lots.map(l => `<button class="mb-btn-outline" style="margin-top:6px;border-color:#d97706;color:#92400e" onclick="loPublish('${l.id}')">Đưa vào dữ liệu chung (${x(l.key)})</button>`).join('')}
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  MODAL DÙNG CHUNG
// ══════════════════════════════════════════════════════════════
function _loModal(title, bodyHtml, buttons) {
  let m = document.getElementById('lo-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'lo-modal';
    document.body.appendChild(m);
  }
  m.innerHTML = `<div class="lo-modal-box" onclick="event.stopPropagation()">
    <div class="lo-modal-head"><b>${title}</b><button type="button" class="lo-modal-x" onclick="_loCloseModal()">×</button></div>
    <div class="lo-modal-body">${bodyHtml}</div>
    <div class="lo-modal-foot">${(buttons || []).map(b =>
      `<button type="button" class="btn ${b.cls || 'btn-secondary'}"${b.id ? ` id="${b.id}"` : ''}${b.disabled ? ' disabled' : ''} onclick="${b.fn}">${x(b.label)}</button>`).join('')}</div>
  </div>`;
  m.style.display = 'flex';
  document.body.classList.add('lo-modal-open');
}
function _loCloseModal() {
  const m = document.getElementById('lo-modal');
  if (m) { m.style.display = 'none'; m.innerHTML = ''; }
  document.body.classList.remove('lo-modal-open');
}

// ══════════════════════════════════════════════════════════════
//  GẮN VÀO APP
// ══════════════════════════════════════════════════════════════
// renderSettings (tab Danh Mục) → vẽ thêm mục Lô nhập
if (typeof renderSettings === 'function' && !renderSettings.__loWrapped) {
  const _loOrigRenderSettings = renderSettings;
  renderSettings = function (...args) {
    const r = _loOrigRenderSettings.apply(this, args);
    try { loRenderSection(); } catch (e) { console.warn('[Lô nhập] vẽ mục Lô nhập lỗi:', e); }
    return r;
  };
  renderSettings.__loWrapped = true;
}
// Nút "Xem như GĐ" trên thanh trên + dải nhắc — vẽ lại mỗi lần áp quyền.
// auth.js (applyRoleUI) nạp SAU file này → gói hàm khi trang đã nạp xong mọi script.
document.addEventListener('DOMContentLoaded', () => {
  if (typeof applyRoleUI === 'function' && !applyRoleUI.__loWrapped) {
    const _loOrigApplyRoleUI = applyRoleUI;
    applyRoleUI = function (...args) {
      const r = _loOrigApplyRoleUI.apply(this, args);
      try { loUpdateGDUi(); } catch (e) {}
      return r;
    };
    applyRoleUI.__loWrapped = true;
  }
  try { loUpdateGDUi(); } catch (e) {}
});
