// thietbi.js — Theo Doi Thiet Bi
// Load order: 5

//  THEO DÕI THIẾT BỊ (tb_v1)
// ══════════════════════════════════════════════════════════════════
const TB_TINH_TRANG = ['Đang hoạt động', 'Cần bảo trì', 'Cần sửa chữa'];
const TB_TEN_MAY = [
  'Máy cắt cầm tay', 'Máy cắt bàn', 'Máy uốn sắt lớn', 'Bàn uốn sắt',
  'Thước nhôm', 'Chân Dàn 1.7m', 'Chân Dàn 1.5m',
  'Chéo lớn', 'Chéo nhỏ', 'Kít tăng giàn giáo', 'Cây chống tăng'
];
// (02/10/2026) Tách "KHO TỔNG" thành 2 kho vật lý độc lập. Cả 2 kho vẫn có projectId = 'COMPANY'
// (để các module khác coi là "công ty", không phải công trình), phân biệt bằng trường riêng `kho`:
//   kho = 'TB' → KHO THIẾT BỊ CÔNG TY      kho = 'GG' → KHO VẬT TƯ GIÀN GIÁO
// Lý do dùng trường riêng: code dự án (đổi tên CT, đồng bộ theo projectId) có thể ghi đè `ct`
// của record COMPANY thành "CÔNG TY" → nếu chỉ dựa vào tên `ct` sẽ lẫn 2 kho. `kho` thì không ai đụng.
const TB_KHO_TONG = 'KHO TỔNG'; // tên CŨ — chỉ còn dùng để nhận diện dữ liệu cũ
const TB_KHO = {
  TB: { code: 'TB', name: 'KHO THIẾT BỊ CÔNG TY',  title: 'Kho Thiết Bị Công Ty',  icon: 'home_repair_service' },
  GG: { code: 'GG', name: 'KHO VẬT TƯ GIÀN GIÁO', title: 'Kho Vật Tư Giàn Giáo', icon: 'warehouse' },
};
const TB_KHO_CODES = ['TB', 'GG'];      // thứ tự hiển thị
const TB_KHO_DEFAULT = 'GG';            // dữ liệu "KHO TỔNG" cũ → Kho Vật Tư Giàn Giáo
const TB_STATUS_STYLE = {
  'Đang hoạt động': 'background:var(--bs-success-subtle);color:var(--bs-success);',
  'Cần bảo trì':  'background:var(--bs-warning-subtle);color:var(--bs-warning);',
  'Cần sửa chữa':   'background:var(--bs-danger-subtle);color:var(--bs-danger);'
};

let tbData = load('tb_v1', []);

// ── Helper: record thuộc 1 trong 2 KHO (không phải công trình) ────
function isKhoTong(r) {
  return r.projectId === 'COMPANY';
}
// Mã kho của record kho ('TB' | 'GG'); record thiếu `kho` (dữ liệu cũ) → kho mặc định
function _tbKhoCode(r) {
  return r && r.kho === 'TB' ? 'TB' : (r && r.kho === 'GG' ? 'GG' : TB_KHO_DEFAULT);
}
// Tên (value dropdown) → mã kho; "KHO TỔNG" cũ → kho mặc định; không phải kho → null
function _tbKhoByName(name) {
  if (name === TB_KHO_TONG) return TB_KHO_DEFAULT;
  return TB_KHO_CODES.find(c => TB_KHO[c].name === name) || null;
}
// Khóa "NƠI" của record: 2 kho tách riêng, công trình theo projectId (thiếu thì theo tên)
function _tbLocKey(r) {
  return isKhoTong(r) ? 'KHO:' + _tbKhoCode(r) : (r.projectId || r.ct || '');
}
// Tên hiển thị NƠI của record (kho → tên kho chuẩn, CT → tên theo projectId)
function _tbLocName(r) {
  return isKhoTong(r) ? TB_KHO[_tbKhoCode(r)].name : _resolveCtName(r);
}
// Đọc NƠI từ giá trị dropdown (value = tên, data-pid) → { ct, projectId, kho, key }
function _tbLocFromSel(name, pid) {
  const k = _tbKhoByName(name);
  if (k) return { ct: TB_KHO[k].name, projectId: 'COMPANY', kho: k, key: 'KHO:' + k };
  return { ct: name, projectId: pid || null, kho: null, key: pid || name };
}
// <option> cho 2 kho (bỏ qua kho `exceptCode` nếu có)
function _tbKhoOpts(cur, exceptCode) {
  return TB_KHO_CODES.filter(c => c !== exceptCode).map(c =>
    `<option value="${TB_KHO[c].name}" data-pid="COMPANY"${cur === TB_KHO[c].name ? ' selected' : ''}>${TB_KHO[c].name}</option>`).join('');
}

// ── Helper: khóa so khớp "Thông Tin Máy" (trường ghichu) khi gộp nhóm ──
// (02/10/2026) Thiết bị chỉ được gộp chung 1 dòng khi trùng: Nơi (CT/Kho) + Tên + Tình trạng + Thông Tin Máy.
// Bỏ khoảng trắng thừa + không phân biệt hoa/thường ("Mới thay nhớt" = "mới  thay nhớt"),
// nhưng VẪN phân biệt dấu để 2 ghi chú khác nghĩa không bị gộp nhầm.
// Để trống → khóa rỗng → mọi thiết bị trống Thông Tin Máy gộp chung với nhau.
function _tbGhiKey(s) {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// ══════════════════════════════════════════════════════════════════
// [MIGRATION] Chuẩn hóa dữ liệu cũ — chạy 1 lần khi load
// - ct là tên kho mà thiếu projectId → set projectId = "COMPANY"
// - record COMPANY thiếu `kho` → gán kho (dữ liệu "KHO TỔNG" cũ → Kho Vật Tư Giàn Giáo); ct = tên kho chuẩn
// - Gộp record trùng (Nơi + ten + tinhtrang + Thông Tin Máy) → cộng dồn số lượng
// - KHÔNG xóa record, KHÔNG thay đổi lịch sử
// ══════════════════════════════════════════════════════════════════
function migrateTbData() {
  let changed = false;

  // Phase 1: Fix projectId / kho / ct cho record KHO
  tbData.forEach(r => {
    if (r.deletedAt) return;
    const k = _tbKhoByName(r.ct);
    // Case 1: ct là tên kho (cũ hoặc mới) nhưng thiếu hoặc sai projectId
    if (k && r.projectId !== 'COMPANY') { r.projectId = 'COMPANY'; changed = true; }
    if (r.projectId === 'COMPANY') {
      // Case 2: record kho chưa có `kho` (dữ liệu "KHO TỔNG" cũ) → gán theo tên, mặc định Kho Vật Tư Giàn Giáo
      if (r.kho !== 'TB' && r.kho !== 'GG') { r.kho = k || TB_KHO_DEFAULT; changed = true; }
      // Case 3: ct bị normalize sai (vd thành "CÔNG TY") → trả về tên kho chuẩn theo `kho`
      const want = TB_KHO[r.kho].name;
      if (r.ct !== want) { r.ct = want; changed = true; }
    }
  });

  // Phase 2 (Bonus): Gộp record trùng (projectId + ten + tinhtrang + Thông Tin Máy)
  // Chỉ gộp record chưa bị xóa. Khác Thông Tin Máy → giữ 2 dòng riêng.
  const dedup = new Map();
  const toRemove = new Set();
  tbData.forEach((r, idx) => {
    if (r.deletedAt) return;
    const key = _tbLocKey(r) + '||' + (r.ten || '') + '||' + (r.tinhtrang || '') + '||' + _tbGhiKey(r.ghichu);
    if (dedup.has(key)) {
      const primary = dedup.get(key);
      // Cộng dồn số lượng vào record đầu tiên
      primary.soluong = (primary.soluong || 0) + (r.soluong || 0);
      // Giữ updatedAt / ngày mới nhất
      if ((r.updatedAt || 0) > (primary.updatedAt || 0)) {
        primary.updatedAt = r.updatedAt;
        primary.ngay = r.ngay || primary.ngay;
      }
      // Soft-delete record trùng
      r.deletedAt = Date.now();
      r.updatedAt = Date.now();
      changed = true;
    } else {
      dedup.set(key, r);
    }
  });

  if (changed) {
    save('tb_v1', tbData);
    console.log('[TB Migration] Đã chuẩn hóa dữ liệu thiết bị (2 kho + projectId + dedup)');
  }
}

// Auto chạy migration ngay sau khi load data
migrateTbData();

// [ADDED] — Normalize thietbi to projectId at runtime
function _normalizeTbProjectIds() {
  let changed = false;
  tbData.forEach(r => {
    if (r.deletedAt) return;
    // KHO: đảm bảo projectId = "COMPANY", có `kho`, ct = tên kho chuẩn
    const k = _tbKhoByName(r.ct);
    if (k || r.projectId === 'COMPANY') {
      if (r.projectId !== 'COMPANY') { r.projectId = 'COMPANY'; changed = true; }
      if (r.kho !== 'TB' && r.kho !== 'GG') { r.kho = k || TB_KHO_DEFAULT; changed = true; }
      if (r.ct !== TB_KHO[r.kho].name) { r.ct = TB_KHO[r.kho].name; changed = true; }
      return;
    }
    // Công trình thực: normalize projectId từ ct
    if (!r.projectId && r.ct) {
      const pid = _getProjectIdByName(r.ct);
      if (pid) { r.projectId = pid; changed = true; }
    }
    if (r.projectId) {
      const pName = _getProjectNameById(r.projectId);
      if (pName && pName !== r.ct) {
        r.ct = pName; changed = true;
      }
    }
  });
  if (changed) save('tb_v1', tbData);
}
_normalizeTbProjectIds();

// ── Chuẩn hóa tên thiết bị: viết hoa chữ cái đầu mỗi từ ─────────
function normalizeTbName(name) {
  return (name || '').trim().toLowerCase()
    .split(/\s+/).filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ── Dynamic name list: CHỈ lấy từ cats.tbTen ──────────────────────
function tbGetNames() {
  const catList = (cats && cats.tbTen && cats.tbTen.length) ? cats.tbTen : TB_TEN_MAY;
  return [...catList].sort((a,b) => a.localeCompare(b,'vi'));
}

function tbRefreshNameDl() {
  const dl = document.getElementById('tb-ten-dl');
  if (!dl) return;
  dl.innerHTML = tbGetNames().map(n=>`<option value="${x(n)}">`).join('');
}

// ── Populate selects ──────────────────────────────────────────────
function tbPopulateSels() {
  const sel = document.getElementById('tb-ct-sel');
  const cur = sel.value;
  // Entry select: 2 KHO (= COMPANY) + projects thuộc năm đang chọn
  // Tab nhập liệu → ẩn CT đã quyết toán (giống tab Hóa Đơn Chi Tiết); CT đang chọn thì vẫn giữ
  const _entryProjs = (typeof getAllProjects === 'function' ? getAllProjects() : [])
    .filter(p => p.name === cur || p.status !== 'closed')
    .filter(p => activeYear === 0 || p.name === cur || _ctInActiveYear(p.name));
  sel.innerHTML = '<option value="">-- Chọn công trình --</option>' +
    _tbKhoOpts(cur) +
    _entryProjs.map(p=>`<option value="${x(p.name)}" data-pid="${p.id}"${p.name===cur?' selected':''}>${x(p.name)}</option>`).join('');
  // Biến <select> CT thành ô chọn có GÕ ĐỂ TÌM — dùng chung _ssEnhance của tab Hóa Đơn Chi Tiết
  // (idempotent: gọi lại nhiều lần không tạo trùng; option dựng lại vẫn tự cập nhật)
  if (typeof _ssEnhance === 'function') _ssEnhance(sel);

  // Ô "Ngày Luân Chuyển" của form nhập: trống thì mặc định hôm nay
  const ngayInp = document.getElementById('tb-ngay');
  if (ngayInp && !ngayInp.value) ngayInp.value = today();

  // Bộ lọc Công trình (bảng Danh Sách tại CT): chỉ CT đang có thiết bị
  _tbRefreshCtFilter();

  // Bộ lọc tên của TỪNG KHO: chỉ lấy tên thiết bị đang có trong kho đó (và có trong cats.tbTen)
  const validNames = new Set((cats.tbTen || []).map(n => n.toLowerCase()));
  TB_KHO_CODES.forEach(code => {
    const khoFSel = document.getElementById(_khoId(code, 'filter-ten'));
    if (!khoFSel) return;
    const khoNames = [...new Set(
      tbData.filter(r => !r.deletedAt && isKhoTong(r) && _tbKhoCode(r) === code && recCatName(r,'tb','ten') && validNames.has(recCatName(r,'tb','ten').toLowerCase()))
            .map(r => recCatName(r,'tb','ten'))
    )].sort((a,b) => a.localeCompare(b,'vi'));
    const khoFCur = khoFSel.value;
    khoFSel.innerHTML = '<option value="">Tất cả thiết bị</option>' +
      khoNames.map(v=>`<option value="${x(v)}" ${v===khoFCur?'selected':''}>${x(v)}</option>`).join('');
  });

  // Bộ lọc tên Thống Kê: chỉ lấy từ cats.tbTen
  const tkFSel = document.getElementById('tk-filter-ten');
  if (tkFSel) {
    const tkNames = tbGetNames();
    const tkFCur = tkFSel.value;
    tkFSel.innerHTML = '<option value="">Tất cả thiết bị</option>' +
      tkNames.map(v=>`<option value="${x(v)}" ${v===tkFCur?'selected':''}>${x(v)}</option>`).join('');
  }
}

// ── Build nhập bảng ───────────────────────────────────────────────
function tbBuildRows(n=3) { // mặc định 3 dòng nhập
  const tbody = document.getElementById('tb-tbody');
  tbody.innerHTML = '';
  for (let i=0; i<n; i++) tbAddRow(null, i+1);
  _initTbSheetGrid();
}

// Gắn lưới kiểu Excel (dùng chung engine với tab Nhập Nhanh):
// Tab/Enter/mũi tên di chuyển ô, gõ để hiện gợi ý, dán nhiều ô từ Excel, Enter ở dòng cuối tự thêm dòng
function _initTbSheetGrid() {
  if (typeof initSheetGrid !== 'function') return;
  initSheetGrid({
    name: 'thietbi',
    tbody: '#tb-tbody',
    rowSelector: 'tr',
    // Có cả select (cột Tình trạng) → mũi tên trái/phải vẫn di chuyển qua được
    cellSelector: 'input, select',
    addRow: () => tbAddRow(),
    columns: [
      // Tên thiết bị: bắt buộc chọn trong danh mục (gõ sai → ô đỏ)
      { field: 'ten',       type: 'autocomplete', source: () => tbGetNames() },
      { field: 'soluong',   type: 'number' },
      // Tình trạng: dropdown 3 giá trị cố định (giống bảng Danh Sách tại CT)
      { field: 'tinhtrang' },
      { field: 'ghichu',    type: 'text' }
    ]
  });
}

function tbAddRows(n) {
  const tbody = document.getElementById('tb-tbody');
  const cur = tbody.querySelectorAll('tr').length;
  for (let i=0; i<n; i++) tbAddRow(null, cur+i+1);
}

// (02/10/2026) Bảng nhập đã đổi sang ô gõ có gợi ý (lấy danh mục mới nhất mỗi lần gõ)
// → không cần dựng lại option nữa. Giữ hàm rỗng để code cũ gọi tới không bị lỗi.
function tbRefreshTenSel() {}

function tbAddRow(data, num) {
  const tbody = document.getElementById('tb-tbody');
  const idx = num || (tbody.querySelectorAll('tr').length + 1);
  const tr = document.createElement('tr');
  // Tình trạng mặc định: Đang hoạt động
  const tt = (data && data.tinhtrang) || 'Đang hoạt động';

  // Các ô nhập dạng .cell-input giống tab Nhập Nhanh (data-f = tên trường cho sheet-grid đọc)
  tr.innerHTML = `
    <td class="row-num">${idx}</td>
    <td><input class="cell-input" data-f="ten" autocomplete="off" placeholder="Tên máy/thiết bị..." value="${x(data?.ten||'')}"></td>
    <td style="padding:0"><input data-f="soluong" type="number" class="np-num-input" min="0" step="1" inputmode="decimal"
      value="${data?.soluong||''}" placeholder="0"
      style="width:100%;text-align:center;border:none;background:transparent;padding:7px 4px;font-family:'IBM Plex Mono',monospace;font-size:13px;outline:none;color:var(--ink);-moz-appearance:textfield;-webkit-appearance:textfield;appearance:textfield"></td>
    <td><select class="cell-input" data-f="tinhtrang">${TB_TINH_TRANG.map(v => `<option value="${v}"${v === tt ? ' selected' : ''}>${v}</option>`).join('')}</select></td>
    <td><input class="cell-input" data-f="ghichu" placeholder="Thông tin máy..." value="${x(data?.ghichu||'')}"></td>
    <td><button class="del-btn" onclick="this.closest('tr').remove();tbRenum()" title="Xóa dòng"><span class="material-symbols-outlined">close</span></button></td>`;
  tbody.appendChild(tr);
}

function tbRenum() { renumberRows('#tb-tbody'); }

function tbClearRows() {
  if (!confirm('Xóa bảng nhập?')) return;
  tbBuildRows();
}

// ── Lưu thiết bị ─────────────────────────────────────────────────
function tbSave() {
  const saveBtn = document.getElementById('tb-save-btn');
  if (saveBtn && saveBtn.disabled) return;
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<span class="material-symbols-outlined msi-gap">hourglass_top</span>Đang lưu...'; }

  const tbCtSel = document.getElementById('tb-ct-sel');
  const ct    = tbCtSel.value.trim();
  const ctPid = _readPidFromSel(tbCtSel);
  if (!ct) {
    toast('Vui lòng chọn công trình!', 'error');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<span class="material-symbols-outlined msi-gap">save</span>Lưu thiết bị'; }
    return;
  }
  if (_checkProjectClosed(ctPid, ct)) {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<span class="material-symbols-outlined msi-gap">save</span>Lưu thiết bị'; }
    return;
  }

  const rows = [];
  // Ngày luân chuyển do người dùng chọn (trống → hôm nay)
  const ngay = document.getElementById('tb-ngay')?.value || today();
  const names = tbGetNames();
  // So khớp không phân biệt hoa thường / dấu → trả về tên chuẩn trong danh mục
  const _pick = (list, v) => list.find(n => _tbNormQ(n) === _tbNormQ(v)) || '';
  let invalid = 0;
  document.querySelectorAll('#tb-tbody tr').forEach((tr, i) => {
    const tenEl  = tr.querySelector('[data-f="ten"]');
    const ttEl   = tr.querySelector('[data-f="tinhtrang"]');
    const tenRaw = (tenEl?.value || '').trim();
    const sl     = parseFloat(tr.querySelector('[data-f="soluong"]')?.value) || 0;
    const ttRaw  = (ttEl?.value || '').trim();
    const ghichu = tr.querySelector('[data-f="ghichu"]')?.value?.trim() || '';
    // Dòng trống (chỉ có tình trạng mặc định) → bỏ qua
    if (!tenRaw && !sl && !ghichu) {
      if (typeof clearCellInvalid === 'function') { clearCellInvalid(tenEl); clearCellInvalid(ttEl); }
      return;
    }
    const ten = _pick(names, tenRaw);
    const tt  = ttRaw ? _pick(TB_TINH_TRANG, ttRaw) : 'Đang hoạt động';
    if (!ten) { invalid++; if (typeof markCellInvalid === 'function') markCellInvalid(tenEl, `Dòng ${i+1} — Tên thiết bị ${tenRaw ? 'không có trong danh mục' : 'là bắt buộc'}`); }
    else if (typeof clearCellInvalid === 'function') clearCellInvalid(tenEl);
    if (!tt) { invalid++; if (typeof markCellInvalid === 'function') markCellInvalid(ttEl, `Dòng ${i+1} — Tình trạng không hợp lệ`); }
    else if (typeof clearCellInvalid === 'function') clearCellInvalid(ttEl);
    if (ten && tt) rows.push({ ten, soluong: sl, tinhtrang: tt, ghichu });
  });

  if (invalid) {
    toast(`Có ${invalid} ô không hợp lệ (tô đỏ) — chọn đúng tên thiết bị / tình trạng trong danh sách gợi ý!`, 'error');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<span class="material-symbols-outlined msi-gap">save</span>Lưu thiết bị'; }
    return;
  }

  if (!rows.length) {
    toast('Không có dữ liệu để lưu!', 'error');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<span class="material-symbols-outlined msi-gap">save</span>Lưu thiết bị'; }
    return;
  }

  // Chuẩn hóa: cộng dồn nếu đã tồn tại record cùng (Nơi + ten + tinhtrang + Thông Tin Máy)
  // Khác Thông Tin Máy → tạo dòng riêng (vd: 2 "Máy Hơi Nhỏ" ghi chú khác nhau = 2 dòng)
  // QUAN TRỌNG: chỉ tìm record CHƯA bị xóa — tránh update deleted record
  // 2 KHO luôn có projectId = "COMPANY" + `kho` riêng, KHÔNG BAO GIỜ null
  const loc = _tbLocFromSel(ct, ctPid);
  rows.forEach(row => {
    const exist = tbData.find(rec => !rec.deletedAt && rec.ten === row.ten && rec.tinhtrang === row.tinhtrang &&
      _tbGhiKey(rec.ghichu) === _tbGhiKey(row.ghichu) && _tbLocKey(rec) === loc.key);
    if (exist) {
      exist.soluong = (exist.soluong || 0) + row.soluong;
      exist.ngay = ngay;
      exist.updatedAt = Date.now();
      exist.deviceId  = DEVICE_ID;
      if (loc.projectId) exist.projectId = loc.projectId;
      if (loc.kho) { exist.kho = loc.kho; exist.ct = loc.ct; }
      else { const n = _getProjectNameById(loc.projectId); if (n) exist.ct = n; }
    } else {
      tbData.push(mkRecord({ ct: loc.ct, projectId: loc.projectId, ...(loc.kho ? { kho: loc.kho } : {}), ...row, ngay }));
    }
  });

  save('tb_v1', tbData);
  // Reset về trang 1 + xóa filter để record vừa lưu luôn hiển thị
  tbPage = 1;
  const _fSel = document.getElementById('tb-filter-ct');
  if (_fSel) _fSel.value = '';
  tbPopulateSels();
  tbRenderList();
  tbRenderThongKeVon();
  renderKhoTong();
  tbBuildRows();
  toast(`✅ Đã lưu ${rows.length} thiết bị vào ${loc.ct}`, 'success');
  setTimeout(() => {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<span class="material-symbols-outlined msi-gap">save</span>Lưu thiết bị'; }
  }, 1500);
}

// ── Render bảng danh sách (Công Trình — không gồm KHO TỔNG) ──────
const TB_PG = 10;
let tbPage = 1;

// ── Tìm kiếm thiết bị: không phân biệt hoa thường / có dấu ("may cat" khớp "Máy Cắt")
function _tbNormQ(s) {
  return (typeof _normViStr === 'function' ? _normViStr(s || '') : String(s || '').toLowerCase()).trim();
}
// Khớp theo Tên thiết bị, Thông tin máy (ghichu), Người TH
function _tbMatchQ(r, q) {
  if (!q) return true;
  return [recCatName(r,'tb','ten'), r.ghichu, r.nguoi].some(v => _tbNormQ(v).includes(q));
}

// Record có thuộc bảng "Danh Sách Thiết Bị Tại Công Trình" không (chưa tính bộ lọc người dùng):
// chưa xóa, KHÔNG thuộc 2 kho, và (khi lọc theo năm) CT hoạt động trong năm hoặc máy đang hoạt động
// So sánh để sắp xếp: Ngày LC MỚI NHẤT lên đầu; thiếu ngày → cuối bảng.
// Ngày lưu dạng YYYY-MM-DD nên so chuỗi là đúng thứ tự thời gian.
function _tbCmpNgayDesc(a, b) {
  const na = a.ngay || '', nb = b.ngay || '';
  if (na === nb) return 0;
  if (!na) return 1;
  if (!nb) return -1;
  return na < nb ? 1 : -1;
}

function _tbListVisible(r) {
  if (r.deletedAt) return false;
  if (isKhoTong(r) || _tbKhoByName(r.ct)) return false;
  if (typeof activeYears !== 'undefined' ? activeYears.size > 0 : activeYear !== 0) {
    const ctActive = _entityInYear(r.ct, 'ct') || inActiveYear(r.ngay);
    const isRunning = r.tinhtrang === 'Đang hoạt động';
    if (!ctActive && !isRunning) return false;
  }
  return true;
}

// Bộ lọc Công trình ĐỘNG: chỉ liệt kê CT đang có thiết bị (SL > 0) trong bảng danh sách.
// CT không còn thiết bị nào → ẩn cho gọn. CT đang chọn vẫn giữ để không mất bộ lọc.
function _tbRefreshCtFilter() {
  const fSel = document.getElementById('tb-filter-ct');
  if (!fSel) return;
  const fCur = fSel.value;
  const has = new Set();
  tbData.forEach(r => { if (_tbListVisible(r) && (r.soluong || 0) > 0) has.add(_resolveCtName(r)); });
  if (fCur) has.add(fCur);
  // Sắp theo thứ tự Master (như bảng danh sách); CT không có trong danh mục → cuối, theo ABC
  const order = (typeof getAllProjects === 'function' ? getAllProjects() : []).map(p => p.name);
  const idx = n => { const i = order.indexOf(n); return i === -1 ? 9999 : i; };
  const names = [...has].filter(Boolean).sort((a, b) => (idx(a) - idx(b)) || a.localeCompare(b, 'vi'));
  fSel.innerHTML = `<option value="">Tất cả công trình</option>` +
    names.map(n => `<option value="${x(n)}"${n === fCur ? ' selected' : ''}>${x(n)}</option>`).join('');
}

function tbRenderList() {
  const fCt = document.getElementById('tb-filter-ct')?.value || '';
  const fTt = document.getElementById('tb-filter-tt')?.value || '';
  const fQ  = _tbNormQ(document.getElementById('tb-search')?.value);
  let filtered = tbData.filter(r => {
    // Bảng này chỉ hiển thị thiết bị tại công trình, không gồm 2 KHO
    if (!_tbListVisible(r)) return false;
    // [MODIFIED] — filter by projectId or ct
    if (fCt && !(r.projectId === fCt || r.ct === fCt || _resolveCtName(r) === fCt)) return false;
    if (fTt && r.tinhtrang !== fTt) return false;
    if (fQ && !_tbMatchQ(r, fQ)) return false;
    return true;
  });

  // Nhóm theo CT khớp với thứ tự Master: resolve display name cho từng record
  const projOrder = getAllProjects().map(p => p.name);
  const getProjIdx = (name) => {
    const idx = projOrder.indexOf(name);
    return idx === -1 ? 999 : idx;
  };

  // Mặc định: Ngày LC mới nhất lên đầu; cùng ngày → theo thứ tự CT (Master) rồi tên thiết bị
  filtered.sort((a,b) => {
    const byNgay = _tbCmpNgayDesc(a, b);
    if (byNgay) return byNgay;
    const ctA = _resolveCtName(a);
    const ctB = _resolveCtName(b);
    if (ctA !== ctB) return getProjIdx(ctA) - getProjIdx(ctB);
    return recCatName(a,'tb','ten').localeCompare(recCatName(b,'tb','ten'), 'vi');
  });

  const tbody = document.getElementById('tb-list-tbody');
  const start = (tbPage-1)*TB_PG;
  const paged = filtered.slice(start, start+TB_PG);

  if (!paged.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Chưa có thiết bị nào${fCt?' tại '+fCt:''}</td></tr>`;
    document.getElementById('tb-pagination').innerHTML = '';
    return;
  }

  tbody.innerHTML = paged.map(r => {
    const ttStyle = TB_STATUS_STYLE[r.tinhtrang] || '';
    const ttOpts = TB_TINH_TRANG.map(v =>
      `<option value="${v}" ${r.tinhtrang===v?'selected':''}>${v}</option>`
    ).join('');
    const ctDisplay = _resolveCtName(r); // [MODIFIED] resolve from projectId
    return `<tr data-tbid="${r.id}">
      <td class="tb-ct-col" title="${x(ctDisplay)}">${x(ctDisplay)}</td>
      <td class="tb-name-col"><span class="tb-name-cell" style="font-weight:600;font-size:13px">${x(recCatName(r,'tb','ten'))}</span></td>
      <td class="text-warning text-center font-monospace fw-bold" style="font-size:14px">${r.soluong||0}</td>
      <td>
        <select onchange="tbUpdateField('${r.id}','tinhtrang',this.value)" onclick="event.stopPropagation()"
          class="tb-status" style="cursor:pointer;border:1px solid var(--bs-border-color);${ttStyle}">
          ${ttOpts}
        </select>
      </td>
      <td class="text-secondary tb-ghichu-cell" style="font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
        title="${x(r.ghichu ? r.ghichu + ' — bấm để sửa' : 'Bấm để nhập thông tin máy')}" onclick="tbEditCell(this,'${r.id}','ghichu')">${x(r.ghichu||'—')}</td>
      <td class="text-secondary" style="font-size:11px;white-space:nowrap">${x(fmtISODate(r.ngay))}</td>
      <td style="padding:6px 4px">
        <div class="d-flex justify-content-start align-items-center gap-2">
          <button class="btn btn-outline-primary btn-sm" onclick="tbLuanChuyen('${r.id}')" style="white-space:nowrap"><i class="bi bi-arrow-left-right"></i> Luân chuyển</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const tp = Math.ceil(filtered.length/TB_PG);
  let pag = `<span>${filtered.length} thiết bị</span>`;
  if (tp>1) {
    pag += '<ul class="pagination pagination-sm mb-0">';
    for(let p=1;p<=Math.min(tp,10);p++) pag+=`<li class="page-item ${p===tbPage?'active':''}"><button class="page-link" onclick="tbGoTo(${p})">${p}</button></li>`;
    pag += '</ul>';
  }
  document.getElementById('tb-pagination').innerHTML = pag;
}

function tbGoTo(p) { tbPage=p; tbRenderList(); }

// ── Cập nhật tình trạng inline (select luôn hiện ở bảng Danh Sách tại CT) ──
function tbUpdateField(id, field, val) {
  _tbApplyEdit(id, field, val);
}

// Vẽ lại mọi bảng thiết bị + bộ lọc CT (dùng sau mỗi lần sửa)
function _tbRerenderAll() {
  _tbRefreshCtFilter();
  tbRenderList();
  tbRenderThongKeVon();
  renderKhoTong();
}

// ── Sửa trực tiếp 1 ô trên bảng (bấm vào ô → hiện ô nhập) ────────
// field = 'ghichu'    (Thông Tin Máy — cả bảng CT và 2 bảng Kho)
//       = 'soluong'   (Số lượng — 2 bảng Kho)
//       = 'tinhtrang' (Tình trạng — 2 bảng Kho)
// Enter / chọn xong / bấm ra ngoài (blur) → lưu + khóa lại. Esc → hủy.
// Lưu bằng save('tb_v1') → tự đồng bộ lên Firebase như các thao tác khác.
function tbEditCell(td, id, field) {
  if (td.querySelector('input,select')) return; // đang sửa rồi → bỏ qua
  const r = tbData.find(rec => rec.id === id && !rec.deletedAt);
  if (!r) return;

  td.innerHTML = '';
  td.style.padding = '2px 4px';
  // Ô hiển thị có thể bị giới hạn độ rộng + overflow:hidden → mở rộng khi sửa để ô nhập không bị cắt
  td.style.maxWidth = 'none';
  td.style.overflow = 'visible';

  let el;
  if (field === 'tinhtrang') {
    el = document.createElement('select');
    el.className = 'form-select form-select-sm';
    el.style.cssText = 'font-size:12px;min-width:140px';
    el.innerHTML = TB_TINH_TRANG.map(v => `<option value="${v}"${r.tinhtrang === v ? ' selected' : ''}>${v}</option>`).join('');
  } else {
    el = document.createElement('input');
    el.className = 'form-control form-control-sm';
    if (field === 'soluong') {
      el.type = 'number'; el.min = '1'; el.step = '1'; el.inputMode = 'decimal';
      el.value = r.soluong || 0;
      el.style.cssText = 'font-size:13px;width:80px;text-align:center;font-family:\'IBM Plex Mono\',monospace';
    } else {
      el.type = 'text';
      el.value = r.ghichu || '';
      el.placeholder = 'Thông tin máy...';
      el.style.cssText = 'font-size:12px;min-width:160px';
    }
  }
  el.onclick = e => e.stopPropagation(); // bấm trong ô nhập không mở lại ô sửa
  td.appendChild(el);
  el.focus();
  if (el.select) el.select();

  let done = false; // chặn lưu 2 lần (Enter rồi blur do bảng vẽ lại)
  const finish = (doSave) => {
    if (done) return;
    done = true;
    if (doSave) _tbApplyEdit(id, field, el.value);
    else _tbRerenderAll(); // hủy → vẽ lại như cũ
  };
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  if (field === 'tinhtrang') el.addEventListener('change', () => finish(true)); // chọn xong là lưu luôn
  el.addEventListener('blur', () => finish(true));
}
// Tên cũ — giữ để code/HTML cũ gọi tới vẫn chạy
function tbEditGhichu(td, id) { tbEditCell(td, id, 'ghichu'); }

// Ghi 1 thay đổi xuống dữ liệu (+ gộp dòng nếu trùng khóa nhóm) rồi vẽ lại
function _tbApplyEdit(id, field, rawVal) {
  const r = tbData.find(rec => rec.id === id && !rec.deletedAt);
  if (!r) { _tbRerenderAll(); return; }
  const LABEL = { ghichu: 'thông tin máy', soluong: 'số lượng', tinhtrang: 'tình trạng' };

  let newVal;
  if (field === 'soluong') {
    newVal = parseFloat(rawVal);
    if (!(newVal > 0)) {
      toast('Số lượng phải lớn hơn 0 — muốn bỏ thiết bị khỏi kho thì dùng nút xóa', 'error');
      _tbRerenderAll();
      return;
    }
  } else if (field === 'tinhtrang') {
    newVal = TB_TINH_TRANG.includes(rawVal) ? rawVal : r.tinhtrang;
  } else {
    newVal = String(rawVal || '').trim().replace(/\s+/g, ' ');
  }

  // Không đổi gì → chỉ khóa ô lại, không ghi dữ liệu / không đồng bộ thừa
  const curVal = field === 'soluong' ? (r.soluong || 0) : (r[field] || '');
  if (newVal === curVal) { _tbRerenderAll(); return; }

  // Đổi Tình trạng / Thông Tin Máy làm thay đổi khóa gộp nhóm → nếu CÙNG NƠI đã có dòng trùng
  // Tên + Tình trạng + Thông Tin Máy mới → cộng SL vào dòng đó, xóa mềm dòng đang sửa
  let twin = null;
  if (field !== 'soluong') {
    const next = { ...r, [field]: newVal };
    twin = tbData.find(rec => rec !== r && !rec.deletedAt && _tbLocKey(rec) === _tbLocKey(r) &&
      rec.ten === r.ten && rec.tinhtrang === next.tinhtrang && _tbGhiKey(rec.ghichu) === _tbGhiKey(next.ghichu));
  }

  if (twin) {
    twin.soluong   = (twin.soluong || 0) + (r.soluong || 0);
    twin.updatedAt = Date.now();
    twin.deviceId  = DEVICE_ID;
    tbData = softDeleteRecord(tbData, id);
  } else {
    r[field]    = newVal;
    r.updatedAt = Date.now();
    r.deviceId  = DEVICE_ID;
  }

  save('tb_v1', tbData);
  _tbRerenderAll();
  toast(twin ? '✅ Đã cập nhật — gộp vào dòng trùng thiết bị' : `✅ Đã cập nhật ${LABEL[field] || ''}`, 'success');
}

// ── Xóa thiết bị (chỉ áp dụng cho 2 KHO) ─────────────────────────
function tbDeleteRow(id) {
  const r = tbData.find(rec=>rec.id===id);
  if (!r) return;
  if (!isKhoTong(r)) { toast('Không thể xóa thiết bị ở công trình!', 'error'); return; }
  const khoTitle = TB_KHO[_tbKhoCode(r)].title;
  if (!confirm(`Xóa thiết bị này khỏi ${khoTitle}?`)) return;
  tbData = softDeleteRecord(tbData, id, { deletedBy: getCurrentUser()?.username || 'Không rõ' });
  save('tb_v1', tbData);
  tbRenderList();
  tbRenderThongKeVon();
  renderKhoTong();
  toast(`Đã xóa thiết bị khỏi ${khoTitle}`);
}

// ── Luân chuyển thiết bị (popup) ─────────────────────────────────
function tbLuanChuyen(id) {
  const r = tbData.find(rec=>rec.id===id);
  if (!r) return;
  let ov = document.getElementById('tb-edit-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'tb-edit-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px';
    // [CHẶN ĐÓNG NHẦM] Đã bỏ đóng khi click nền — popup chỉ đóng bằng nút ✕ để tránh mất dữ liệu đang nhập
    document.body.appendChild(ov);
  }

  const isKho = isKhoTong(r);
  // Dropdown nơi đến: 2 KHO (bỏ kho đang đứng nếu nguồn là kho) + các công trình CHƯA quyết toán
  const _editProjs = (typeof getAllProjects === 'function' ? getAllProjects() : [])
    .filter(p => p.id !== 'COMPANY' && p.status !== 'closed');
  const ctOpts = _tbKhoOpts('', isKho ? _tbKhoCode(r) : null) +
    _editProjs.map(p=>`<option value="${x(p.name)}" data-pid="${p.id}"${p.name===r.ct&&!isKho?' selected':''}>${x(p.name)}</option>`).join('');
  const ttOpts = TB_TINH_TRANG.map(v=>`<option value="${v}" ${r.tinhtrang===v?'selected':''}>${v}</option>`).join('');
  const srcLabel = x(_tbLocName(r));
  const hintText = `Phần còn lại (SL cũ − X) giữ lại tại <b>${srcLabel}</b>.`;

  ov.innerHTML = `
  <div style="background:#fff;border-radius:14px;padding:24px;width:min(480px,96vw);box-shadow:0 8px 32px rgba(0,0,0,.2);font-family:'IBM Plex Sans',sans-serif" onclick="event.stopPropagation()">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-size:16px;font-weight:700">↩ Luân Chuyển Thiết Bị</h3>
      <button onclick="document.getElementById('tb-edit-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#888"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div style="display:grid;gap:10px">
      <div style="background:#f8f8f5;border-radius:8px;padding:10px;font-size:12px">
        <span style="color:#888">Từ:</span> <b>${srcLabel}</b> &nbsp;·&nbsp;
        <span style="color:#888">Tên:</span> <b>${x(recCatName(r,'tb','ten'))}</b> &nbsp;·&nbsp;
        <span style="color:#888">SL hiện tại:</span> <b>${r.soluong||0}</b>
      </div>
      <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px">Chuyển đến Công Trình / Kho</label>
        <select id="tb-ei-ct" class="form-select form-select-sm" style="width:100%">
          <option value="">-- Chọn công trình / kho --</option>${ctOpts}</select></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px">Số Lượng chuyển <span class="text-secondary" style="font-weight:400">(tối đa ${r.soluong||0})</span></label>
          <input id="tb-ei-sl" type="number" class="np-num-input" min="1" max="${r.soluong||0}" value="${r.soluong||0}" inputmode="decimal"
            style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:7px;font-family:inherit;font-size:13px;outline:none"></div>
        <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px">Tình Trạng</label>
          <select id="tb-ei-tt" style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:7px;font-family:inherit;font-size:13px;outline:none">${ttOpts}</select></div>
      </div>
      <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px">Ngày Luân Chuyển</label>
        <input id="tb-ei-ngay" type="date" value="${today()}"
          style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:7px;font-family:inherit;font-size:13px;outline:none"></div>
      <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px">Thông Tin Máy</label>
        <input id="tb-ei-ghichu" type="text" value="${x(r.ghichu||'')}"
          style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:7px;font-family:inherit;font-size:13px;outline:none"></div>
      <div style="background:#f0f7ff;border-radius:8px;padding:10px;font-size:12px;color:#1565c0">
        ℹ️ SL nhập = số lượng chuyển đi. ${hintText}
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button onclick="document.getElementById('tb-edit-overlay').remove()"
        style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #ddd;background:#fff;font-family:inherit;font-size:13px;cursor:pointer">Hủy</button>
      <button onclick="tbSaveEdit('${r.id}')"
        style="flex:2;padding:10px;border-radius:8px;border:none;background:#1a1814;color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">↩ Xác Nhận Luân Chuyển</button>
    </div>
  </div>`;
  ov.style.display = 'flex';

  // Ô nơi đến → ô chọn có GÕ ĐỂ TÌM, dùng lại y hệt _ssEnhance của ô "Công Trình / Kho" form nhập.
  // Gọi SAU khi popup hiện để đo đúng độ rộng; ô chiếm hết chiều ngang popup.
  const ctSel = document.getElementById('tb-ei-ct');
  if (typeof _ssEnhance === 'function' && ctSel) {
    _ssEnhance(ctSel);
    if (ctSel._ss) { ctSel._ss.wrap.style.width = '100%'; ctSel._ss.wrap.style.display = 'block'; }
  }
}

function tbSaveEdit(id) {
  const idx = tbData.findIndex(rec=>rec.id===id);
  if (idx<0) return;
  const r = tbData[idx];

  const _tbEiCtSel = document.getElementById('tb-ei-ct');
  const newCT     = _tbEiCtSel.value.trim();
  const newCtPid  = _tbEiCtSel.options[_tbEiCtSel.selectedIndex]?.dataset?.pid || null;
  const newSL     = parseFloat(document.getElementById('tb-ei-sl').value) || 0;
  const newTT     = document.getElementById('tb-ei-tt').value;
  const newGhichu = document.getElementById('tb-ei-ghichu').value.trim();
  const oldSL     = r.soluong || 0;
  // Ngày luân chuyển người dùng chọn trong popup (trống → hôm nay)
  const ngay      = document.getElementById('tb-ei-ngay')?.value || today();

  if (!newCT) { toast('Vui lòng chọn công trình / kho!', 'error'); return; }
  if (newSL <= 0 || newSL > oldSL) {
    toast(`Số lượng không hợp lý (phải từ 1 đến ${oldSL})!`, 'error');
    return;
  }

  const remaining = oldSL - newSL;
  const dest   = _tbLocFromSel(newCT, newCtPid);   // nơi đến
  const srcKey = _tbLocKey(r);                     // nơi đi (lưu trước khi soft-delete)
  const srcCt  = isKhoTong(r) ? TB_KHO[_tbKhoCode(r)].name : r.ct;

  // Soft-delete record gốc (không xóa cứng để sync hoạt động đúng)
  tbData = softDeleteRecord(tbData, id);

  // Thêm/cộng dồn số lượng chuyển đi vào newCT
  // Chỉ cộng dồn khi trùng cả Thông Tin Máy; khác → tạo dòng riêng tại nơi nhận
  const destExist = tbData.find(rec => !rec.deletedAt && rec.ten === r.ten && rec.tinhtrang === newTT &&
    _tbGhiKey(rec.ghichu) === _tbGhiKey(newGhichu) && _tbLocKey(rec) === dest.key);
  if (destExist) {
    destExist.soluong  = (destExist.soluong || 0) + newSL;
    destExist.updatedAt = Date.now();
    destExist.deviceId  = DEVICE_ID;
    destExist.ngay = ngay;
  } else {
    tbData.push(mkRecord({
      ct: dest.ct, projectId: dest.projectId, ...(dest.kho ? { kho: dest.kho } : {}),
      ten: r.ten, soluong: newSL, tinhtrang: newTT,
      ghichu: newGhichu, ngay
    }));
  }

  // Phần còn lại → giữ lại tại nguồn (r.ct)
  if (remaining > 0) {
    const srcExist = tbData.find(rec => !rec.deletedAt && rec.ten === r.ten && rec.tinhtrang === r.tinhtrang &&
      _tbGhiKey(rec.ghichu) === _tbGhiKey(r.ghichu) && _tbLocKey(rec) === srcKey);
    if (srcExist) {
      srcExist.soluong   = (srcExist.soluong || 0) + remaining;
      srcExist.updatedAt = Date.now();
      srcExist.deviceId  = DEVICE_ID;
    } else {
      // Phần còn lại không bị chuyển đi → giữ nguyên ngày luân chuyển cũ của record nguồn
      tbData.push(mkRecord({
        ct: srcCt, projectId: r.projectId || null, ...(isKhoTong(r) ? { kho: _tbKhoCode(r) } : {}),
        ten: r.ten, soluong: remaining,
        tinhtrang: r.tinhtrang, ghichu: r.ghichu || '', ngay: r.ngay || ngay
      }));
    }
  }

  save('tb_v1', tbData);
  document.getElementById('tb-edit-overlay').remove();
  tbPopulateSels();
  tbRenderList();
  tbRenderThongKeVon();
  renderKhoTong();
  toast('✅ Đã cập nhật thiết bị!', 'success');
}

// ── Xuất CSV ─────────────────────────────────────────────────────
function tbExportCSV() {
  const fCt = document.getElementById('tb-filter-ct')?.value||'';
  const fTt = document.getElementById('tb-filter-tt')?.value||'';
  let data = tbData.filter(r=>{
    if(r.deletedAt) return false;
    if(fCt && _tbLocName(r)!==fCt) return false;
    if(fTt && r.tinhtrang!==fTt) return false;
    return true;
  });
  const rows = [['Công Trình','Tên Thiết Bị','Số Lượng','Tình Trạng','Người TH','Thông Tin Máy','Ngày Luân Chuyển']];
  data.forEach(r=>rows.push([_tbLocName(r),recCatName(r,'tb','ten'),r.soluong||0,r.tinhtrang||'',r.nguoi||'',r.ghichu||'',fmtISODate(r.ngay, '')])); // ngày dạng DD-MM-YYYY thống nhất toàn app
  dlCSV(rows, 'thiet_bi_'+today()+'.csv');
}


// ── 2 bảng KHO: Kho Thiết Bị Công Ty (TB) + Kho Vật Tư Giàn Giáo (GG) ──
// Cùng 1 hàm vẽ, khác mã kho. ID phần tử: kho-tb-* / kho-gg-* (xem pages/thietbi.html)
const KHO_PG = 7;
const _khoPage = { TB: 1, GG: 1 };   // trang hiện tại của từng kho

function _khoId(code, suffix) { return `kho-${code.toLowerCase()}-${suffix}`; }

// Vẽ cả 2 kho (tên cũ giữ nguyên vì nhiều nơi đang gọi renderKhoTong)
function renderKhoTong() {
  TB_KHO_CODES.forEach(_renderKho);
}

// Bộ lọc của 1 kho đổi → về trang 1 rồi vẽ lại kho đó
function khoReset(code) { _khoPage[code] = 1; _renderKho(code); }
function khoGoTo(code, p) { _khoPage[code] = p; _renderKho(code); }

function _renderKho(code) {
  const tbody = document.getElementById(_khoId(code, 'tbody'));
  if (!tbody) return;

  const fTen = document.getElementById(_khoId(code, 'filter-ten'))?.value || '';
  const fTt  = document.getElementById(_khoId(code, 'filter-tt'))?.value || '';
  // [FIX 02/10/2026] Lọc ô tìm kiếm trên TOÀN BỘ dữ liệu kho rồi mới phân trang
  const fQ   = _tbNormQ(document.getElementById(_khoId(code, 'search'))?.value);
  let filtered = tbData.filter(r => {
    if (r.deletedAt) return false;
    if (!isKhoTong(r) || _tbKhoCode(r) !== code) return false;
    if (fTen && recCatName(r,'tb','ten') !== fTen) return false;
    if (fTt && r.tinhtrang !== fTt) return false;
    if (fQ && !_tbMatchQ(r, fQ)) return false;
    return true;
  });

  // Mặc định: Ngày LC mới nhất lên đầu; cùng ngày → theo tên thiết bị
  filtered.sort((a,b) => _tbCmpNgayDesc(a, b) || recCatName(a,'tb','ten').localeCompare(recCatName(b,'tb','ten'),'vi'));

  // Trang hiện tại vượt quá số trang (vd: sau khi lọc / xóa) → về trang cuối hợp lệ
  const tp = Math.max(1, Math.ceil(filtered.length/KHO_PG));
  if (_khoPage[code] > tp) _khoPage[code] = tp;
  const page  = _khoPage[code];
  const start = (page-1)*KHO_PG;
  const paged = filtered.slice(start, start+KHO_PG);
  const pagEl = document.getElementById(_khoId(code, 'pagination'));

  if (!paged.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">${fQ || fTen || fTt ? 'Không tìm thấy thiết bị phù hợp' : TB_KHO[code].title + ' trống'}</td></tr>`;
    if (pagEl) pagEl.innerHTML = '';
    return;
  }

  tbody.innerHTML = paged.map(r => {
    const ttStyle = TB_STATUS_STYLE[r.tinhtrang] || '';
    // SL, Thông Tin Máy: bấm vào ô để sửa trực tiếp (tbEditCell); Tình trạng: dropdown đổi là lưu
    return `<tr data-tbid="${r.id}">
      <td class="tb-name-col"><span class="tb-name-cell" style="font-weight:600;font-size:13px">${x(recCatName(r,'tb','ten'))}</span></td>
      <td class="text-warning text-center font-monospace fw-bold tb-edit-cell" style="font-size:14px"
        title="Bấm để sửa số lượng" onclick="tbEditCell(this,'${r.id}','soluong')">${r.soluong||0}</td>
      <td>
        <select onchange="tbUpdateField('${r.id}','tinhtrang',this.value)"
          class="tb-status" style="cursor:pointer;border:1px solid var(--bs-border-color);${ttStyle}">
          ${TB_TINH_TRANG.map(v => `<option value="${v}" ${r.tinhtrang===v?'selected':''}>${v}</option>`).join('')}
        </select>
      </td>
      <td class="text-secondary tb-ghichu-cell" style="font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
        title="${x(r.ghichu ? r.ghichu + ' — bấm để sửa' : 'Bấm để nhập thông tin máy')}" onclick="tbEditCell(this,'${r.id}','ghichu')">${x(r.ghichu||'—')}</td>
      <td class="text-secondary" style="font-size:11px;white-space:nowrap">${x(fmtISODate(r.ngay))}</td>
      <td style="padding:6px 4px">
        <div class="d-flex justify-content-start align-items-center gap-2">
          <button class="btn btn-outline-primary btn-sm" onclick="tbLuanChuyen('${r.id}')" style="white-space:nowrap"><i class="bi bi-arrow-left-right"></i> Luân chuyển</button>
          <button class="btn btn-outline-danger btn-sm" onclick="tbDeleteRow('${r.id}')" title="Xóa"><i class="bi bi-trash-fill"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  let pag = `<span>${filtered.length} thiết bị</span>`;
  if (tp>1) {
    pag += '<ul class="pagination pagination-sm mb-0">';
    for(let p=1;p<=Math.min(tp,10);p++) pag+=`<li class="page-item ${p===page?'active':''}"><button class="page-link" onclick="khoGoTo('${code}',${p})">${p}</button></li>`;
    pag += '</ul>';
  }
  if (pagEl) pagEl.innerHTML = pag;
}

// ── Bảng Thống Kê Thiết Bị Theo Công Trình ───────────────────────
function tbRenderThongKeVon() {
  const tbody = document.getElementById('tb-vonke-tbody');
  if (!tbody) return;

  // Gom nhóm theo projectId (bỏ KHO TỔNG)
  const map = {};
  tbData.forEach(r => {
    if (r.deletedAt || !r.ct || isKhoTong(r)) return;
    // [MODIFIED] — group by projectId, resolve name for display
    const gKey = r.projectId || r.ct;
    const ctDisplay = _resolveCtName(r);
    if (!map[gKey]) map[gKey] = { ct: ctDisplay, total: 0, types: new Set() };
    map[gKey].total += (r.soluong || 0);
    const _tn = recCatName(r,'tb','ten'); if (_tn) map[gKey].types.add(_tn);
  });

  const items = Object.values(map).sort((a, b) => a.ct.localeCompare(b.ct, 'vi'));

  const pgEl = document.getElementById('tk-pagination');
  if (!items.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="3">Chưa có thiết bị tại công trình nào</td></tr>';
    if (pgEl) pgEl.innerHTML = '';
    return;
  }

  tbody.innerHTML = items.map(item => `<tr>
    <td style="font-weight:600">${x(item.ct)}</td>
    <td class="text-warning text-center font-monospace fw-bold" style="font-size:15px">${item.total}</td>
    <td class="text-secondary text-center" style="font-size:13px">${item.types.size} loại</td>
  </tr>`).join('');

  if (pgEl) pgEl.innerHTML = `<span>${items.length} công trình</span>`;
}

// ── Init TB khi load trang ────────────────────────────────────────
// (tbData đã load ở trên, tbBuildRows gọi khi goPage)

// Ô tìm kiếm Kho: lọc trên toàn bộ dữ liệu (xem _renderKho).
// Giữ tên hàm cũ để HTML/bản cache cũ gọi tới vẫn chạy đúng.
function filterKhoTable() {
  TB_KHO_CODES.forEach(c => { _khoPage[c] = 1; });
  renderKhoTong();
}
