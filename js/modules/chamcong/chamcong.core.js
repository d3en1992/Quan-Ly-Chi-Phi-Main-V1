// chamcong.core.js — ccData, constants, date/week helpers, normalize, category & project selector helpers
// Load order: sau datatools.js, trước chamcong.week-form.js


// ══════════════════════════════════════════════════════════════════
//  SỔ CHẤM CÔNG v3
//  worker: { name, luong, d:[CN,T2,T3,T4,T5,T6,T7], phucap, hdmuale, nd }
// ══════════════════════════════════════════════════════════════════
// Dedup cc_v2 theo logical key (fromDate + projectId): giữ bản updatedAt mới nhất.
// Hard rule: 1 tuần + 1 công trình = 1 record duy nhất.
// Bản standalone — chạy ở parse-time (trước sync.js). Sau khi sync.js load,
// normalizeCC() là canonical; _dedupCC gọi qua nó.
// Fix 1: gọi _fillCCProjectId nếu có (sync.js đã load)
// Fix 2: inline safeTs — _safeTs từ sync.js có thể chưa load ở parse-time
function _dedupCC(arr) {
  // Nếu sync.js đã load → dùng normalizeCC (canonical, có đủ fix 1+2)
  if (typeof normalizeCC === 'function') return normalizeCC(arr);

  // Standalone fallback cho parse-time (sync.js chưa load)
  // Áp dụng fix 1 nếu _fillCCProjectId có sẵn, fix 2 inline
  const _TS_MIN = 1577836800000; // 2020-01-01
  const safeTs  = ts => {
    const n = typeof ts === 'number' ? ts : 0;
    if (n < _TS_MIN) return 0;
    if (n > Date.now() + 86400000) return Date.now();
    return n;
  };
  const records = (typeof _fillCCProjectId === 'function') ? _fillCCProjectId(arr || []) : (arr || []);
  const byKey   = new Map();
  records.forEach(r => {
    const key  = (r.fromDate || r.from || '') + '__' + (r.projectId || r.ct || '');
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, r); return; }
    const prevTs = safeTs(prev.updatedAt || prev.createdAt || 0);
    const rTs    = safeTs(r.updatedAt   || r.createdAt   || 0);
    if (rTs > prevTs) {
      byKey.set(key, r);
    } else if (rTs === prevTs && r.deletedAt && !prev.deletedAt) {
      byKey.set(key, r);
    }
  });
  return [...byKey.values()];
}

let ccData = _dedupCC(load('cc_v2', [])).filter(x=>{
  if(!x||!x.fromDate||typeof x.fromDate!=='string'){ console.warn('Invalid CC record (no fromDate):', x); return false; }
  return true;
});
let ccOffset = 0;
let ccHistPage = 1, ccTltPage = 1;
const CC_PG_HIST = 30;
const CC_PG_TLT = 20;
const CC_DAY_LABELS   = ['CN','T2','T3','T4','T5','T6','T7'];
const CC_DATE_OFFSETS = [0,1,2,3,4,5,6]; // offset from Sunday (week starts Sunday)

function round1(n){ return Math.round(n * 10) / 10; }

// ── Collapsible debt columns (Nợ Cũ / Vay Mới / Trừ Nợ) ─────────
// Mặc định: ẩn. Bấm toggle để mở/đóng.
let _ccDebtColsHidden = true;

function toggleCCDebtCols() {
  _ccDebtColsHidden = !_ccDebtColsHidden;
  _applyCCDebtColsVisibility();
}

function _applyCCDebtColsVisibility() {
  const table = document.getElementById('cc-thead-row')?.closest('table');
  if (!table) return;
  table.classList.toggle('debt-cols-hidden', _ccDebtColsHidden);
  // Cập nhật icon trên toggle header
  document.querySelectorAll('.cc-debt-toggle-th').forEach(th => {
    th.textContent = _ccDebtColsHidden ? '▶' : '◀';
    th.title = _ccDebtColsHidden ? 'Mở rộng: HĐ Mua Lẻ / Nội Dung / Nợ Cũ / Vay Mới / Trừ Nợ' : 'Thu gọn';
  });
}

// Tính tổng nợ lũy kế của công nhân trước tuần fromDate
// debt = sum(loanAmount - tru) cho mọi tuần đã lưu có fromDate < ngày truyền vào
//
// [SYNC-SAFE] NỢ CŨ là giá trị tính lũy kế từ toàn bộ lịch sử local. Nếu thiết bị
// chưa tải đủ các năm trước (pull chỉ lấy các năm đã có ở local), số tính tại chỗ sẽ
// thiếu → lệch giữa thiết bị. Khắc phục: khi lưu tuần, ta đóng băng (snapshot) giá trị
// này vào từng công nhân (wk.debtBefore) — snapshot đi theo record cc_v2 lên cloud.
// Khi hiển thị, ưu tiên snapshot đã đồng bộ; chỉ tính lũy kế tại chỗ khi:
//   - forceLive = true (lúc lưu, cần tính lại số mới nhất để đóng băng), hoặc
//   - record cũ chưa có snapshot (tương thích ngược).
function _calcDebtBefore(workerName, fromDate, forceLive) {
  if (!workerName || !fromDate) return 0;

  // (a) Ưu tiên snapshot đã lưu & đồng bộ — giữ NỢ CŨ giống nhau trên mọi thiết bị
  if (!forceLive) {
    let snap = null, snapTs = -1;
    const safeTs = (typeof _safeTs === 'function')
      ? _safeTs
      : (ts => (typeof ts === 'number' ? ts : parseInt(ts) || 0));
    ccData.forEach(w => {
      if (w.deletedAt) return;
      if ((w.fromDate || '') !== fromDate) return;
      (w.workers || []).forEach(wk => {
        if (wk.name !== workerName) return;
        if (typeof wk.debtBefore !== 'number') return;
        const ts = safeTs(w.updatedAt || w.createdAt || 0);
        if (ts >= snapTs) { snapTs = ts; snap = wk.debtBefore; }
      });
    });
    if (snap !== null) return snap;
  }

  // (b) Fallback: tính lũy kế từ dữ liệu local (lúc lưu, hoặc record cũ chưa có snapshot)
  let debt = 0;
  ccData.forEach(w => {
    if (w.deletedAt) return;
    if (w.fromDate >= fromDate) return;
    (w.workers || []).forEach(wk => {
      if (wk.name !== workerName) return;
      debt += (wk.loanAmount || 0) - (wk.tru || 0);
    });
  });
  return debt;
}

// ─── date helpers ───────────────────────────────────────────────
// Tuần: CN (Sun) → T7 (Sat). iso date string là YYYY-MM-DD.
// Tránh timezone bug: dùng local date parts, không dùng toISOString cho date-only

function isoFromParts(y,m,d){ return y+'-'+(m<10?'0':'')+m+'-'+(d<10?'0':'')+d; }

// Trả về iso string của CN (Sunday) cho tuần cách tuần hiện tại offset tuần
function ccSundayISO(offset=0){
  const now = new Date();
  const y=now.getFullYear(), mo=now.getMonth(), d=now.getDate();
  const jsDay=now.getDay(); // 0=Sun,1=Mon,...,6=Sat
  // Tìm Sunday của tuần hiện tại
  const sunD = new Date(y, mo, d - jsDay + offset*7);
  return isoFromParts(sunD.getFullYear(), sunD.getMonth()+1, sunD.getDate());
}

// Trả về iso string của T7 (Saturday) = CN + 6
function ccSaturdayISO(sundayISO){
  const [y,m,d]=sundayISO.split('-').map(Number);
  const sat=new Date(y,m-1,d+6);
  return isoFromParts(sat.getFullYear(),sat.getMonth()+1,sat.getDate());
}

// Snap bất kỳ ngày → CN của tuần chứa ngày đó
function snapToSunday(dateISO){
  const [y,m,d]=dateISO.split('-').map(Number);
  const dt=new Date(y,m-1,d);
  const jsDay=dt.getDay(); // 0=Sun
  const sun=new Date(y,m-1,d-jsDay);
  return isoFromParts(sun.getFullYear(),sun.getMonth()+1,sun.getDate());
}

function viShort(ds){
  if(!ds||typeof ds!=='string') return '—';
  const parts=ds.split('-');
  if(parts.length!==3) return '—';
  const [y,m,d]=parts.map(Number);
  if(!y||!m||!d) return '—';
  return (d<10?'0':'')+d+'/'+(m<10?'0':'')+m;
}
function weekLabel(sundayISO){
  if(!sundayISO||typeof sundayISO!=='string') return '—';
  const satISO=ccSaturdayISO(sundayISO);
  const y=sundayISO.split('-')[0];
  return viShort(sundayISO)+'–'+viShort(satISO)+'/'+y;
}

// iso() vẫn giữ để dùng chỗ khác nếu cần
function iso(d){ return d.toISOString().split('T')[0]; }

// ─── all worker names for autocomplete (Chấm Công: chỉ dùng cats.congNhan) ────
function ccAllNames(){
  const s=new Set();
  ccData.filter(w=>!w.deletedAt).forEach(w=>w.workers.forEach(wk=>{ if(wk.name) s.add(wk.name); }));
  // Tab Chấm Công chỉ gợi ý tên từ danh mục Công Nhân
  (cats.congNhan||[]).forEach(n=>s.add(n));
  return [...s].sort((a,b)=>a.localeCompare(b,'vi'));
}

// build/update the shared datalist for name autocomplete
function rebuildCCNameList(){
  let dl=document.getElementById('cc-name-dl');
  if(!dl){ dl=document.createElement('datalist'); dl.id='cc-name-dl'; document.body.appendChild(dl); }
  dl.innerHTML=ccAllNames().map(n=>`<option value="${x(n)}">`).join('');
}

// ── Cập nhật danh mục từ toàn bộ ccData (không tạo HĐ nữa) ──────────
// Gọi sau khi import/sync để cập nhật danh mục CT, CN, TP
// [MODIFIED] — Normalize dữ liệu cũ: gán projectId + ctPid cho record chưa có
// ALSO: sync .ct name from project when project was renamed
// Idempotent — gọi nhiều lần không gây hại
function normalizeAllChamCong() {
  let changed = false;
  ccData.forEach(r => {
    if (r.deletedAt) return;
    // Step 1: resolve projectId from ct name if missing
    if (!r.projectId && r.ct) {
      const pid = (typeof findProjectIdByName === 'function') ? findProjectIdByName(r.ct) : null;
      if (pid) { r.projectId = pid; changed = true; }
    }
    // Keep ctPid in sync with projectId
    if (r.projectId && r.ctPid !== r.projectId) {
      r.ctPid = r.projectId; changed = true;
    }
    // Step 2: sync .ct from project name (handles renames)
    if (r.projectId) {
      const currentName = _getProjectNameById(r.projectId);
      if (currentName && currentName !== r.ct) {
        r.ct = currentName; changed = true;
      }
    }
  });
  if (changed) save('cc_v2', ccData);
}

function rebuildCCCategories() {
  // cats.congTrinh chỉ được ghi bởi rebuildCatCTFromProjects() — không tự thêm từ ccData
  const addedCTs = 0;

  // Không tự động thêm danh mục từ dữ liệu chấm công
  const cnAdded = 0;

  // Không tự động thêm danh mục từ dữ liệu tiền ứng
  const addedTPs = 0;

  return { cts: addedCTs, names: cnAdded, tps: addedTPs };
}

// Cập nhật topbar sau khi save CC — không dùng cache, không rebuild toàn hệ thống
function updateTopFromCC(){
  // CC portion: tính trực tiếp từ ccData theo năm đang chọn
  let ccTotal=0;
  ccData.forEach(w=>{
    if(w.deletedAt) return;
    if(!inActiveYear(w.fromDate)) return;
    (w.workers||[]).forEach(wk=>{
      const tc=(wk.d||[]).reduce((s,v)=>s+(Number(v)||0),0);
      ccTotal+=tc*(wk.luong||0)+(wk.phucap||0)+(wk.hdmuale||0);
    });
  });
  // Manual invoices portion: đọc thẳng từ mảng invoices (không qua cache)
  const manualTotal=(typeof invoices!=='undefined'?invoices:[])
    .filter(i=>!i.deletedAt&&inActiveYear(i.ngay))
    .reduce((s,i)=>s+(i.thanhtien||i.tien||0),0);
  const total=ccTotal+manualTotal;
  document.getElementById('top-total').textContent=fmtS(total);
  const m=document.getElementById('top-total-mobile');
  if(m) m.textContent=fmtS(total);
  const h=document.getElementById('top-total-header');
  if(h) h.textContent=fmtS(total);
}

// ─── CT selector ──────────────────────────────────────────────────
function populateCCCtSel(){
  const sel = document.getElementById('cc-ct-sel');
  const cur = sel.value;
  // Tab nhập liệu Sổ Chấm Công → ẩn CT đã quyết toán
  sel.innerHTML = _buildProjOpts(cur, '-- Chọn công trình --', { excludeClosed: true });
  updateCCSaveBtn();
}

/** Cập nhật text nút lưu tuần: "Lưu tuần này" nếu mới, "Cập nhật tuần này" nếu đã có. */
function updateCCSaveBtn() {
  const btn = document.getElementById('cc-save-btn');
  if (!btn) return;
  const fromDate  = document.getElementById('cc-from')?.value;
  const ccCtSel   = document.getElementById('cc-ct-sel');
  const ct        = (ccCtSel?.value||'').trim();
  const ctPid     = _readPidFromSel(ccCtSel);
  const isEdit    = !!(fromDate && ct && ccData.some(r => !r.deletedAt && r.fromDate === fromDate && (r.ctPid === ctPid || r.ct === ct)));
  btn.textContent = isEdit ? '💾 Cập nhật tuần này' : '💾 Lưu tuần này';
}

function onCCCtSelChange(){
  loadCCWeekForm();
}

// _fmtDate — alias của fmtISODate() (tienich.js) với dấu '/' để dùng trong phiếu lương.
const _fmtDate = (iso) => fmtISODate(iso, '', '/');
