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
const TB_KHO_TONG = 'KHO TỔNG';
const TB_STATUS_STYLE = {
  'Đang hoạt động': 'background:var(--bs-success-subtle);color:var(--bs-success);',
  'Cần bảo trì':  'background:var(--bs-warning-subtle);color:var(--bs-warning);',
  'Cần sửa chữa':   'background:var(--bs-danger-subtle);color:var(--bs-danger);'
};

let tbData = load('tb_v1', []);

// ── Helper: kiểm tra record thuộc KHO TỔNG ────────────────────────
function isKhoTong(r) {
  return r.projectId === 'COMPANY';
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
// - ct === "KHO TỔNG" mà thiếu projectId → set projectId = "COMPANY"
// - projectId === "COMPANY" mà ct !== "KHO TỔNG" → set ct = "KHO TỔNG"
// - Gộp record trùng (projectId + ten + tinhtrang) → cộng dồn số lượng
// - KHÔNG xóa record, KHÔNG thay đổi lịch sử
// ══════════════════════════════════════════════════════════════════
function migrateTbData() {
  let changed = false;

  // Phase 1: Fix projectId / ct cho KHO TỔNG
  tbData.forEach(r => {
    if (r.deletedAt) return;
    // Case 1: ct là KHO TỔNG nhưng thiếu hoặc sai projectId
    if (r.ct === TB_KHO_TONG && r.projectId !== 'COMPANY') {
      r.projectId = 'COMPANY';
      changed = true;
    }
    // Case 2: projectId là COMPANY nhưng ct không phải KHO TỔNG (bị normalize sai thành "CÔNG TY")
    if (r.projectId === 'COMPANY' && r.ct !== TB_KHO_TONG) {
      r.ct = TB_KHO_TONG;
      changed = true;
    }
  });

  // Phase 2 (Bonus): Gộp record trùng (projectId + ten + tinhtrang + Thông Tin Máy)
  // Chỉ gộp record chưa bị xóa. Khác Thông Tin Máy → giữ 2 dòng riêng.
  const dedup = new Map();
  const toRemove = new Set();
  tbData.forEach((r, idx) => {
    if (r.deletedAt) return;
    const key = (r.projectId || r.ct || '') + '||' + (r.ten || '') + '||' + (r.tinhtrang || '') + '||' + _tbGhiKey(r.ghichu);
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
    console.log('[TB Migration] Đã chuẩn hóa dữ liệu thiết bị (KHO TỔNG projectId + dedup)');
  }
}

// Auto chạy migration ngay sau khi load data
migrateTbData();

// [ADDED] — Normalize thietbi to projectId at runtime
function _normalizeTbProjectIds() {
  let changed = false;
  tbData.forEach(r => {
    if (r.deletedAt) return;
    // KHO TỔNG: đảm bảo projectId = "COMPANY" và ct = TB_KHO_TONG
    if (r.ct === TB_KHO_TONG || r.projectId === 'COMPANY') {
      if (r.projectId !== 'COMPANY') { r.projectId = 'COMPANY'; changed = true; }
      if (r.ct !== TB_KHO_TONG) { r.ct = TB_KHO_TONG; changed = true; }
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
  // Entry select: KHO TỔNG (= COMPANY) + projects thuộc năm đang chọn
  // Tab nhập liệu → ẩn CT đã quyết toán (giống tab Hóa Đơn Chi Tiết); CT đang chọn thì vẫn giữ
  const _entryProjs = (typeof getAllProjects === 'function' ? getAllProjects() : [])
    .filter(p => p.name === cur || p.status !== 'closed')
    .filter(p => activeYear === 0 || p.name === cur || _ctInActiveYear(p.name));
  sel.innerHTML = '<option value="">-- Chọn công trình --</option>' +
    `<option value="${TB_KHO_TONG}" data-pid="COMPANY"${cur===TB_KHO_TONG?' selected':''}>${TB_KHO_TONG}</option>` +
    _entryProjs.map(p=>`<option value="${x(p.name)}" data-pid="${p.id}"${p.name===cur?' selected':''}>${x(p.name)}</option>`).join('');
  // Biến <select> CT thành ô chọn có GÕ ĐỂ TÌM — dùng chung _ssEnhance của tab Hóa Đơn Chi Tiết
  // (idempotent: gọi lại nhiều lần không tạo trùng; option dựng lại vẫn tự cập nhật)
  if (typeof _ssEnhance === 'function') _ssEnhance(sel);

  // Ô "Ngày Luân Chuyển" của form nhập: trống thì mặc định hôm nay
  const ngayInp = document.getElementById('tb-ngay');
  if (ngayInp && !ngayInp.value) ngayInp.value = today();

  // Filter select: KHO TỔNG + projects thuộc năm đang chọn
  const fSel = document.getElementById('tb-filter-ct');
  const fCur = fSel.value;
  const _filterProjs = (typeof getAllProjects === 'function' ? getAllProjects() : [])
    .filter(p => activeYear === 0 || _ctInActiveYear(p.name));
  fSel.innerHTML = `<option value="">Tất cả công trình</option>` +
    `<option value="${TB_KHO_TONG}"${fCur===TB_KHO_TONG?' selected':''}>${TB_KHO_TONG}</option>` +
    _filterProjs.map(p=>`<option value="${x(p.name)}"${p.name===fCur?' selected':''}>${x(p.name)}</option>`).join('');

  // Bộ lọc tên KHO: chỉ lấy tên thiết bị có trong cats.tbTen
  const validNames = new Set((cats.tbTen || []).map(n => n.toLowerCase()));
  const khoFSel = document.getElementById('kho-filter-ten');
  if (khoFSel) {
    const khoNames = [...new Set(
      tbData.filter(r => !r.deletedAt && isKhoTong(r) && recCatName(r,'tb','ten') && validNames.has(recCatName(r,'tb','ten').toLowerCase()))
            .map(r => recCatName(r,'tb','ten'))
    )].sort((a,b) => a.localeCompare(b,'vi'));
    const khoFCur = khoFSel.value;
    khoFSel.innerHTML = '<option value="">Tất cả thiết bị</option>' +
      khoNames.map(v=>`<option value="${x(v)}" ${v===khoFCur?'selected':''}>${x(v)}</option>`).join('');
  }

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
function tbBuildRows(n=5) {
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
    cellSelector: 'input',
    addRow: () => tbAddRow(),
    columns: [
      // Tên thiết bị: bắt buộc chọn trong danh mục (gõ sai → ô đỏ)
      { field: 'ten',       type: 'autocomplete', source: () => tbGetNames() },
      { field: 'soluong',   type: 'number' },
      // Tình trạng: chỉ 3 giá trị cố định
      { field: 'tinhtrang', type: 'autocomplete', source: () => [...TB_TINH_TRANG], copyFromAbove: true },
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
    <td><input class="cell-input" data-f="tinhtrang" autocomplete="off" placeholder="Tình trạng..." value="${x(tt)}"></td>
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

  // Chuẩn hóa: cộng dồn nếu đã tồn tại record cùng (projectId + ten + tinhtrang + Thông Tin Máy)
  // Khác Thông Tin Máy → tạo dòng riêng (vd: 2 "Máy Hơi Nhỏ" ghi chú khác nhau = 2 dòng)
  // QUAN TRỌNG: chỉ tìm record CHƯA bị xóa — tránh update deleted record
  // KHO TỔNG luôn có projectId = "COMPANY", KHÔNG BAO GIỜ null
  const savePid = ct === TB_KHO_TONG ? 'COMPANY' : (ctPid || null);
  rows.forEach(row => {
    const exist = tbData.find(rec => !rec.deletedAt && rec.ten === row.ten && rec.tinhtrang === row.tinhtrang &&
      _tbGhiKey(rec.ghichu) === _tbGhiKey(row.ghichu) &&
      (savePid ? (rec.projectId === savePid) : rec.ct === ct));
    if (exist) {
      exist.soluong = (exist.soluong || 0) + row.soluong;
      exist.ngay = ngay;
      exist.updatedAt = Date.now();
      exist.deviceId  = DEVICE_ID;
      if (savePid) { exist.projectId = savePid; }
      if (savePid === 'COMPANY') { exist.ct = TB_KHO_TONG; }
      else { const n = _getProjectNameById(savePid); if (n) exist.ct = n; }
    } else {
      tbData.push(mkRecord({ ct, projectId: savePid, ...row, ngay }));
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
  toast(`✅ Đã lưu ${rows.length} thiết bị vào ${ct}`, 'success');
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

function tbRenderList() {
  const fCt = document.getElementById('tb-filter-ct')?.value || '';
  const fTt = document.getElementById('tb-filter-tt')?.value || '';
  const fQ  = _tbNormQ(document.getElementById('tb-search')?.value);
  let filtered = tbData.filter(r => {
    // Bảng này chỉ hiển thị thiết bị tại công trình, không gồm KHO TỔNG
    if (r.deletedAt) return false;
    if (isKhoTong(r) || r.ct === TB_KHO_TONG) return false;
    // [MODIFIED] — filter by projectId or ct
    if (fCt && !(r.projectId === fCt || r.ct === fCt)) return false;
    if (fTt && r.tinhtrang !== fTt) return false;
    if (fQ && !_tbMatchQ(r, fQ)) return false;
    if (typeof activeYears !== 'undefined' ? activeYears.size > 0 : activeYear !== 0) {
      const ctActive = _entityInYear(r.ct, 'ct') || inActiveYear(r.ngay);
      const isRunning = r.tinhtrang === 'Đang hoạt động';
      if (!ctActive && !isRunning) return false;
    }
    return true;
  });

  // Nhóm theo CT khớp với thứ tự Master: resolve display name cho từng record
  const projOrder = getAllProjects().map(p => p.name);
  const getProjIdx = (name) => {
    const idx = projOrder.indexOf(name);
    return idx === -1 ? 999 : idx;
  };

  filtered.sort((a,b) => {
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
        <select onchange="tbUpdateField('${r.id}','tinhtrang',this.value)"
          class="tb-status" style="cursor:pointer;border:1px solid var(--bs-border-color);${ttStyle}">
          ${ttOpts}
        </select>
      </td>
      <td class="text-secondary tb-ghichu-cell" style="font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
        title="${x(r.ghichu ? r.ghichu + ' — bấm để sửa' : 'Bấm để nhập thông tin máy')}" onclick="tbEditGhichu(this,'${r.id}')">${x(r.ghichu||'—')}</td>
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

// ── Cập nhật tình trạng inline ────────────────────────────────────
function tbUpdateField(id, field, val) {
  const idx = tbData.findIndex(r=>r.id===id);
  if (idx<0) return;
  tbData[idx][field] = val;
  tbData[idx].updatedAt = Date.now();
  tbData[idx].deviceId  = DEVICE_ID;
  save('tb_v1', tbData);
  tbRenderList();
  tbRenderThongKeVon();
  renderKhoTong();
  toast('✅ Đã cập nhật tình trạng', 'success');
}

// ── Sửa trực tiếp ô "Thông Tin Máy" (bảng Danh Sách tại CT + Kho Tổng) ──
// Bấm vào ô → hiện ô nhập. Enter hoặc bấm ra ngoài (blur) → lưu + khóa lại. Esc → hủy.
// Lưu bằng save('tb_v1') → tự đồng bộ lên Firebase như các thao tác khác.
function tbEditGhichu(td, id) {
  if (td.querySelector('input')) return; // đang sửa rồi → bỏ qua
  const r = tbData.find(rec => rec.id === id && !rec.deletedAt);
  if (!r) return;

  const oldVal = r.ghichu || '';
  td.innerHTML = '';
  td.style.padding = '2px 4px';
  // Ô hiển thị bị giới hạn 140px + overflow:hidden → mở rộng khi sửa để ô nhập không bị cắt
  td.style.maxWidth = 'none';
  td.style.overflow = 'visible';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = oldVal;
  inp.placeholder = 'Thông tin máy...';
  inp.className = 'form-control form-control-sm';
  inp.style.cssText = 'font-size:12px;min-width:160px';
  inp.onclick = e => e.stopPropagation(); // bấm trong ô nhập không mở lại ô sửa
  td.appendChild(inp);
  inp.focus();
  inp.select();

  let done = false; // chặn lưu 2 lần (Enter rồi blur do bảng vẽ lại)
  const finish = (doSave) => {
    if (done) return;
    done = true;
    if (doSave) _tbSaveGhichu(id, inp.value);
    else { tbRenderList(); renderKhoTong(); } // hủy → vẽ lại như cũ
  };
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  inp.addEventListener('blur', () => finish(true));
}

function _tbSaveGhichu(id, val) {
  const r = tbData.find(rec => rec.id === id && !rec.deletedAt);
  const newVal = String(val || '').trim().replace(/\s+/g, ' ');
  // Không đổi gì → chỉ khóa ô lại, không ghi dữ liệu / không đồng bộ thừa
  if (!r || newVal === (r.ghichu || '')) {
    tbRenderList(); renderKhoTong();
    return;
  }

  // Theo quy tắc gộp nhóm: nếu ở CÙNG NƠI đã có dòng trùng Tên + Tình trạng + Thông Tin Máy mới
  // → cộng số lượng vào dòng đó và xóa mềm dòng đang sửa (tránh 2 dòng giống hệt nhau)
  const twin = tbData.find(rec => rec !== r && !rec.deletedAt && rec.ten === r.ten && rec.tinhtrang === r.tinhtrang &&
    _tbGhiKey(rec.ghichu) === _tbGhiKey(newVal) &&
    (r.projectId ? rec.projectId === r.projectId : rec.ct === r.ct));

  if (twin) {
    twin.soluong   = (twin.soluong || 0) + (r.soluong || 0);
    twin.updatedAt = Date.now();
    twin.deviceId  = DEVICE_ID;
    tbData = softDeleteRecord(tbData, id);
  } else {
    r.ghichu    = newVal;
    r.updatedAt = Date.now();
    r.deviceId  = DEVICE_ID;
  }

  save('tb_v1', tbData);
  tbRenderList();
  renderKhoTong();
  toast(twin ? '✅ Đã cập nhật — gộp vào dòng có cùng Thông Tin Máy' : '✅ Đã cập nhật thông tin máy', 'success');
}

// ── Xóa thiết bị (chỉ áp dụng cho KHO TỔNG) ─────────────────────
function tbDeleteRow(id) {
  const r = tbData.find(rec=>rec.id===id);
  if (!r) return;
  if (!isKhoTong(r)) { toast('Không thể xóa thiết bị ở công trình!', 'error'); return; }
  if (!confirm('Xóa thiết bị này khỏi Kho Tổng?')) return;
  tbData = softDeleteRecord(tbData, id, { deletedBy: getCurrentUser()?.username || 'Không rõ' });
  save('tb_v1', tbData);
  tbRenderList();
  tbRenderThongKeVon();
  renderKhoTong();
  toast('Đã xóa thiết bị khỏi Kho Tổng');
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
  // CT dropdown: từ KHO → chỉ CT thực; từ CT → có KHO + CT khác
  const _editProjs = (typeof getAllProjects === 'function' ? getAllProjects() : [])
    .filter(p => p.id !== 'COMPANY');
  const ctOpts = (isKho ? [] : [`<option value="${TB_KHO_TONG}">${TB_KHO_TONG}</option>`])
    .concat(_editProjs.map(p=>`<option value="${x(p.name)}" data-pid="${p.id}"${p.name===r.ct&&!isKho?' selected':''}>${x(p.name)}</option>`))
    .join('');
  const ttOpts = TB_TINH_TRANG.map(v=>`<option value="${v}" ${r.tinhtrang===v?'selected':''}>${v}</option>`).join('');
  const srcLabel = isKho ? 'KHO TỔNG' : x(r.ct);
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
      <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px">Chuyển đến Công Trình</label>
        <select id="tb-ei-ct" style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:7px;font-family:inherit;font-size:13px;outline:none">
          <option value="">-- Chọn --</option>${ctOpts}</select></div>
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

  if (!newCT) { toast('Vui lòng chọn công trình!', 'error'); return; }
  if (newSL <= 0 || newSL > oldSL) {
    toast(`Số lượng không hợp lý (phải từ 1 đến ${oldSL})!`, 'error');
    return;
  }

  const remaining = oldSL - newSL;
  const srcCt = r.ct; // lưu lại nguồn trước khi soft-delete

  // Soft-delete record gốc (không xóa cứng để sync hoạt động đúng)
  tbData = softDeleteRecord(tbData, id);

  // Thêm/cộng dồn số lượng chuyển đi vào newCT
  // Chỉ cộng dồn khi trùng cả Thông Tin Máy; khác → tạo dòng riêng tại nơi nhận
  const destExist = tbData.find(rec => !rec.deletedAt && rec.ten === r.ten && rec.tinhtrang === newTT &&
    _tbGhiKey(rec.ghichu) === _tbGhiKey(newGhichu) &&
    (newCtPid ? (rec.projectId === newCtPid) : rec.ct === newCT)); // [MODIFIED] match by projectId
  if (destExist) {
    destExist.soluong  = (destExist.soluong || 0) + newSL;
    destExist.updatedAt = Date.now();
    destExist.deviceId  = DEVICE_ID;
    destExist.ngay = ngay;
  } else {
    tbData.push(mkRecord({
      ct: newCT, projectId: newCT === TB_KHO_TONG ? 'COMPANY' : (newCtPid || null),
      ten: r.ten, soluong: newSL, tinhtrang: newTT,
      ghichu: newGhichu, ngay
    }));
  }

  // Phần còn lại → giữ lại tại nguồn (r.ct)
  if (remaining > 0) {
    const srcExist = tbData.find(rec => !rec.deletedAt && rec.ten === r.ten && rec.tinhtrang === r.tinhtrang &&
      _tbGhiKey(rec.ghichu) === _tbGhiKey(r.ghichu) &&
      (r.projectId ? (rec.projectId === r.projectId) : rec.ct === srcCt)); // [MODIFIED] match by projectId
    if (srcExist) {
      srcExist.soluong   = (srcExist.soluong || 0) + remaining;
      srcExist.updatedAt = Date.now();
      srcExist.deviceId  = DEVICE_ID;
    } else {
      // Phần còn lại không bị chuyển đi → giữ nguyên ngày luân chuyển cũ của record nguồn
      tbData.push(mkRecord({
        ct: srcCt, projectId: srcCt === TB_KHO_TONG ? 'COMPANY' : (r.projectId || null),
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
    if(fCt && r.ct!==fCt) return false;
    if(fTt && r.tinhtrang!==fTt) return false;
    return true;
  });
  const rows = [['Công Trình','Tên Thiết Bị','Số Lượng','Tình Trạng','Người TH','Thông Tin Máy','Ngày Luân Chuyển']];
  data.forEach(r=>rows.push([_resolveCtName(r),recCatName(r,'tb','ten'),r.soluong||0,r.tinhtrang||'',r.nguoi||'',r.ghichu||'',fmtISODate(r.ngay, '')])); // ngày dạng DD-MM-YYYY thống nhất toàn app
  dlCSV(rows, 'thiet_bi_'+today()+'.csv');
}


// ── Bảng Kho Tổng Thiết Bị ───────────────────────────────────────
const KHO_PG = 7;
let khoPage = 1;

function renderKhoTong() {
  const tbody = document.getElementById('kho-list-tbody');
  if (!tbody) return;

  const fTen = document.getElementById('kho-filter-ten')?.value || '';
  const fTt = document.getElementById('kho-filter-tt')?.value || '';
  // [FIX 02/10/2026] Ô tìm kiếm trước đây chỉ ẩn/hiện dòng của TRANG ĐANG XEM (7 dòng)
  // → thiết bị nằm ở trang khác không tìm ra, số đếm & phân trang sai.
  // Nay lọc thẳng trên toàn bộ dữ liệu rồi mới phân trang.
  const fQ  = _tbNormQ(document.getElementById('kho-search')?.value);
  let filtered = tbData.filter(r => {
    if (r.deletedAt) return false;
    if (!isKhoTong(r)) return false;
    if (fTen && recCatName(r,'tb','ten') !== fTen) return false;
    if (fTt && r.tinhtrang !== fTt) return false;
    if (fQ && !_tbMatchQ(r, fQ)) return false;
    return true;
  });

  filtered.sort((a,b) => recCatName(a,'tb','ten').localeCompare(recCatName(b,'tb','ten'),'vi'));

  // Trang hiện tại vượt quá số trang (vd: sau khi lọc / xóa) → về trang cuối hợp lệ
  const _khoTp = Math.max(1, Math.ceil(filtered.length/KHO_PG));
  if (khoPage > _khoTp) khoPage = _khoTp;
  const start = (khoPage-1)*KHO_PG;
  const paged = filtered.slice(start, start+KHO_PG);

  if (!paged.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">${fQ || fTen || fTt ? 'Không tìm thấy thiết bị phù hợp' : 'Kho tổng trống'}</td></tr>`;
    document.getElementById('kho-pagination').innerHTML = '';
    return;
  }

  tbody.innerHTML = paged.map(r => {
    const ttStyle = TB_STATUS_STYLE[r.tinhtrang] || '';
    return `<tr data-tbid="${r.id}">
      <td class="tb-name-col"><span class="tb-name-cell" style="font-weight:600;font-size:13px">${x(recCatName(r,'tb','ten'))}</span></td>
      <td class="text-warning text-center font-monospace fw-bold" style="font-size:14px">${r.soluong||0}</td>
      <td><span class="tb-status" style="${ttStyle}">${x(r.tinhtrang||'')}</span></td>
      <td class="text-secondary tb-ghichu-cell" style="font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
        title="${x(r.ghichu ? r.ghichu + ' — bấm để sửa' : 'Bấm để nhập thông tin máy')}" onclick="tbEditGhichu(this,'${r.id}')">${x(r.ghichu||'—')}</td>
      <td class="text-secondary" style="font-size:11px;white-space:nowrap">${x(fmtISODate(r.ngay))}</td>
      <td style="padding:6px 4px">
        <div class="d-flex justify-content-start align-items-center gap-2">
          <button class="btn btn-outline-primary btn-sm" onclick="tbLuanChuyen('${r.id}')" style="white-space:nowrap"><i class="bi bi-arrow-left-right"></i> Luân chuyển</button>
          <button class="btn btn-outline-danger btn-sm" onclick="tbDeleteRow('${r.id}')" title="Xóa"><i class="bi bi-trash-fill"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const tp = Math.ceil(filtered.length/KHO_PG);
  let pag = `<span>${filtered.length} thiết bị</span>`;
  if (tp>1) {
    pag += '<ul class="pagination pagination-sm mb-0">';
    for(let p=1;p<=Math.min(tp,10);p++) pag+=`<li class="page-item ${p===khoPage?'active':''}"><button class="page-link" onclick="khoGoTo(${p})">${p}</button></li>`;
    pag += '</ul>';
  }
  document.getElementById('kho-pagination').innerHTML = pag;
}

function khoGoTo(p) { khoPage=p; renderKhoTong(); }

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

// Ô tìm kiếm Kho Tổng: lọc trên toàn bộ dữ liệu (xem renderKhoTong).
// Giữ tên hàm cũ để HTML/bản cache cũ gọi tới vẫn chạy đúng.
function filterKhoTable() {
  khoPage = 1;
  renderKhoTong();
}
