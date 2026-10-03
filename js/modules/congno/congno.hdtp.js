// congno.hdtp.js — HỢP ĐỒNG THẦU PHỤ (tab CÔNG NỢ → sub-tab HỢP ĐỒNG THẦU PHỤ)
// Load order: sau doanhthu.forms.js (chuyển nguyên từ doanhthu.forms.js — 02/10/2026)
//
// HĐ thầu phụ là CHI PHÍ phải trả → thuộc tab Công Nợ, tách khỏi tab Doanh Thu.
// Dữ liệu vẫn ở kho 'thauphu_v1' (biến thauPhuContracts khai báo trong doanhthu.core.js).
// State/bộ lọc dùng chung còn ở doanhthu.core.js: _hdtpItems, _hdtpPage, _hdtpTkPage,
// _dtTpCtFilter, _dtTpSearch, dtSetTpCtFilter, dtSetTpSearch, dtPopulateTpCtFilter,
// _hdtpOnCtChange, _dtSetEditing('hdtp'), _dtFocusForm. Tên hàm giữ nguyên để HTML cũ gọi được.
//
// (03/10/2026) BỐ CỤC MỚI (pages/congno.html → #cn-sub-thauphu):
//   [1] Form khai báo nằm THẲNG trên màn hình (card #hdtp-form-card) — đã gỡ popup #dt-modal-hdtp-ov.
//       Nút Lưu / Hủy sửa ở dòng tiêu đề. Bấm Sửa ở bảng → nạp form + viền vàng "Đang sửa".
//   [2] Bảng Master-Detail: mỗi HĐ có thêm cột ĐÃ ỨNG (progress bar) + CÒN PHẢI TRẢ.
//       Bấm 1 dòng → xổ "Lịch sử tạm ứng / chi tiền" của riêng HĐ đó + nút [+ Cập nhật tạm ứng]
//       mở dòng nhập nhanh → ghi 1 phiếu Ứng thầu phụ (kho ung_v1, loai 'thauphu', hdtpId = id HĐ).
//
// CÁCH TÍNH "ĐÃ ỨNG" CỦA TỪNG HĐ (_hdtpUngAlloc) — cùng nguồn với tab Công Nợ (_ttBuildRows):
//   • Phiếu Ứng thầu phụ (ungRecords, loai 'thauphu', chưa xóa), TOÀN VÒNG ĐỜI (mọi năm đã tải).
//   • Phiếu có hdtpId trỏ tới HĐ đang sống (ghi từ nút "Cập nhật tạm ứng") → tính THẲNG cho HĐ đó.
//   • Phiếu không gắn HĐ (nhập ở tab Tiền Ứng / tất toán) → thuộc cặp Thầu phụ × Công trình:
//       - cặp chỉ có 1 HĐ  → cộng hết cho HĐ đó (trường hợp phổ biến);
//       - cặp có nhiều HĐ  → phân bổ lần lượt (FIFO): HĐ cũ nhất được trả đủ trước rồi mới tới HĐ sau,
//                            phần dư dồn vào HĐ mới nhất (hiện "Ứng vượt").
//   • Phiếu "ứng chung" không gắn công trình → không tính (giống tab Công Nợ).
//   Tổng Đã Ứng các HĐ của 1 cặp = Đã Ứng của cặp đó ở tab Công Nợ → 2 nơi luôn khớp.

// ─── State ─────────────────────────────────────────────────────
const _hdtpOpen = new Set();   // các HĐ đang MỞ dòng chi tiết (id HĐ)
let _hdtpUngFormFor = '';      // id HĐ đang mở dòng nhập nhanh tạm ứng ('' = không mở)
let _hdtpLastId     = '';      // HĐ vừa lưu → tô sáng ở bảng

// ══ FORM HỢP ĐỒNG THẦU PHỤ (card #hdtp-form-card — nằm thẳng trên màn hình) ══

// ── Cập nhật hiển thị Tổng HĐ Thầu Phụ khi nhập ─────────────
function hdtpUpdateTotal() {
  const tong = _readMoneyInput('hdtp-giatri');
  const el = document.getElementById('hdtp-tong-label');
  if (el) el.textContent = tong ? 'Tổng HĐ: ' + fmtM(tong) : '';
}

// ── Lưu / Cập nhật Hợp Đồng Thầu Phụ ────────────────────────
function saveHopDongThauPhu() {
  const ct = document.getElementById('hdtp-ct-input')?.value.trim();
  const tp = (document.getElementById('hdtp-thauphu')?.value || '').trim();
  if (!ct) { toast('Vui lòng chọn Công Trình!', 'error'); return; }
  if (!tp) { toast('Vui lòng chọn Thầu Phụ!', 'error'); return; }

  // Chỉ cho phép CT đã tồn tại
  const _hdtpProjExists = (typeof getAllProjects === 'function') &&
    getAllProjects().some(p => p.id !== 'COMPANY' && p.name === ct);
  if (!_hdtpProjExists) {
    toast('Chỉ được tạo công trình tại tab Công Trình', 'error');
    return;
  }

  const ngay     = document.getElementById('hdtp-ngay')?.value || today();
  const nd       = document.getElementById('hdtp-nd')?.value.trim() || '';
  const giaTri   = _hdtpItems.length > 0
    ? calcHopDongValue({ items: _hdtpItems })
    : _readMoneyInput('hdtp-giatri');
  const editId   = document.getElementById('hdtp-edit-id')?.value || '';

  _dtAddCT(ct);
  _dtAddTP(tp);
  const _hdtpProj = projects.find(p => p.name === ct) || null;
  const _hdtpPid  = _hdtpProj ? _hdtpProj.id : null;

  if (editId) {
    const idx = thauPhuContracts.findIndex(r => r.id === editId);
    if (idx >= 0) {
      thauPhuContracts[idx] = mkUpdate(thauPhuContracts[idx], { ngay, congtrinh: ct, projectId: _hdtpPid, thauphu: tp, giaTri, nd, items: [..._hdtpItems] });
    }
    _hdtpLastId = editId;
    toast('✅ Đã cập nhật HĐ thầu phụ', 'success');
  } else {
    const rec = mkRecord({ ngay, congtrinh: ct, projectId: _hdtpPid, thauphu: tp, giaTri, nd, items: [..._hdtpItems] });
    thauPhuContracts.unshift(rec);
    _hdtpLastId = rec.id;
    _hdtpTkPage = 0;   // về trang đầu để thấy HĐ vừa tạo
    toast('✅ Đã lưu HĐ thầu phụ: ' + tp + ' — ' + ct, 'success');
  }

  save('thauphu_v1', thauPhuContracts);
  _hdtpResetForm();
  renderHdtpTable(0);
  renderHdtpTableTk(_hdtpTkPage);
}

function _hdtpResetForm() {
  _hdtpItems = [];
  if(typeof window.renderhdtpChiTiet === 'function') window.renderhdtpChiTiet();

  ['hdtp-giatri','hdtp-nd'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = '';
    if (el.dataset) el.dataset.raw = '';
  });
  const giaTriEl = document.getElementById('hdtp-giatri');
  if (giaTriEl) { giaTriEl.readOnly = false; giaTriEl.style.background = ''; giaTriEl.style.pointerEvents = ''; }
  const ctSel = document.getElementById('hdtp-ct-input');
  if (ctSel) ctSel.value = '';
  const tpSel = document.getElementById('hdtp-thauphu');
  if (tpSel) tpSel.value = '';
  const ngayEl = document.getElementById('hdtp-ngay');
  if (ngayEl) ngayEl.value = today();
  const editEl = document.getElementById('hdtp-edit-id');
  if (editEl) editEl.value = '';
  const tong = document.getElementById('hdtp-tong-label');
  if (tong) tong.textContent = '';
  _dtSetEditing('hdtp', false);   // bỏ viền vàng / nhãn "Đang sửa", nút về "Lưu"
}

// ── Hủy chỉnh sửa (nút "Hủy sửa" trên dòng tiêu đề form) ─────
function _hdtpCancelEdit() {
  _hdtpResetForm();
  toast('Đã hủy chỉnh sửa', '');
}

// ── Sửa Hợp Đồng Thầu Phụ → nạp vào form ngay trên màn hình ──
function editHopDongThauPhu(id) {
  const r = thauPhuContracts.find(r => r.id === id);
  if (!r) return;

  // Đang ở sub-tab khác → chuyển sang HỢP ĐỒNG THẦU PHỤ trước
  const sub = document.getElementById('cn-sub-thauphu');
  if (sub && !sub.classList.contains('active') && typeof cnGoSub === 'function') {
    cnGoSub(document.getElementById('cn-sub-thauphu-btn'), 'cn-sub-thauphu');
  }

  // Rebuild options từ danh mục hiện hành trước khi set giá trị (tránh dropdown trắng khi đổi tên)
  if (typeof _dtFillSelects === 'function') _dtFillSelects();

  const ctName = resolveProjectName(r) || r.congtrinh || '';
  const ctSel = document.getElementById('hdtp-ct-input');
  // _setSelectFlexible: tự thêm option nếu thiếu → không bao giờ trắng
  if (ctSel) _setSelectFlexible(ctSel, ctName);
  const tpSel = document.getElementById('hdtp-thauphu');
  // Tên Thầu Phụ resolve theo ID (mới nhất), fallback text cũ
  if (tpSel) _setSelectFlexible(tpSel, recCatName(r,'thauphu','thauphu'));
  const ngayEl = document.getElementById('hdtp-ngay');
  if (ngayEl) ngayEl.value = r.ngay || '';
  const ndInput = document.getElementById('hdtp-nd');
  if (ndInput) ndInput.value = r.nd || '';

  function _setMoney(elemId, val) {
    const el = document.getElementById(elemId);
    if (!el) return;
    el.dataset.raw = val || 0;
    el.value = val ? parseInt(val).toLocaleString('vi-VN') : '';
  }

  _hdtpItems = Array.isArray(r.items) ? [...r.items] : [];
  if(typeof window.renderhdtpChiTiet === 'function') window.renderhdtpChiTiet();
  if(typeof window.hdtpCalcAuto === 'function') window.hdtpCalcAuto();
  if (_hdtpItems.length === 0) _setMoney('hdtp-giatri', r.giaTri || 0);

  const editEl = document.getElementById('hdtp-edit-id');
  if (editEl) editEl.value = id;

  hdtpUpdateTotal();
  _dtSetEditing('hdtp', true);
  _dtFocusForm('hdtp-form-card', 'hdtp-giatri');
}

// ── Xóa mềm Hợp Đồng Thầu Phụ ────────────────────────────────
// Phiếu ứng KHÔNG bị xóa theo (tiền đã chi là có thật) — chỉ không còn gắn với HĐ này.
function delHopDongThauPhu(id) {
  const a = _hdtpUngAlloc().get(id);
  let msg = 'Xóa hợp đồng thầu phụ này?';
  if (a && a.daUng) msg += `\n\nHĐ đang có ${fmtM(a.daUng)} đã ứng — các phiếu ứng KHÔNG bị xóa (vẫn tính ở tab Tiền Ứng / Công Nợ).`;
  if (!confirm(msg)) return;
  const idx = thauPhuContracts.findIndex(r => r.id === id);
  if (idx < 0) return;
  const now = Date.now();
  thauPhuContracts[idx] = { ...thauPhuContracts[idx], deletedAt: now, updatedAt: now, deviceId: DEVICE_ID, deletedBy: getCurrentUser()?.username || 'Không rõ' };
  save('thauphu_v1', thauPhuContracts);
  // Đang sửa đúng HĐ vừa xóa → đưa form về trạng thái nhập mới
  if (document.getElementById('hdtp-edit-id')?.value === id) _hdtpResetForm();
  _hdtpOpen.delete(id);
  if (_hdtpUngFormFor === id) _hdtpUngFormFor = '';
  renderHdtpTable(_hdtpPage);
  renderHdtpTableTk(_hdtpTkPage);
  toast('Đã xóa hợp đồng thầu phụ', 'success');
}

// ── Hàm cũ (tên giữ nguyên để không vỡ lời gọi) → nay vẽ lại bảng CÔNG NỢ ──
// HĐ thầu phụ không còn hiện ở bảng Khai Báo tab Doanh Thu.
function renderHdtpTable(_page) { if (typeof ttRender === 'function') ttRender(); } // (03/10/2026) bảng Công Nợ = tất toán

// ══ ĐÃ ỨNG THEO TỪNG HỢP ĐỒNG ═════════════════════════════════

// Khóa công trình của 1 bản ghi: ưu tiên projectId; bản ghi cũ chỉ có tên → tra project theo tên
function _hdtpCtKey(r) {
  if (r.projectId) return r.projectId;
  const nm = (_resolveCtName(r) || r.congtrinh || '').trim();
  const p = nm && typeof getAllProjects === 'function' ? getAllProjects().find(pr => pr.name === nm) : null;
  return p ? p.id : 'name:' + nm;
}

// Sắp xếp theo thời gian tăng dần: ngày → thời điểm tạo
function _hdtpSortAsc(a, b) {
  return (a.ngay || '').localeCompare(b.ngay || '') || ((a.createdAt || 0) - (b.createdAt || 0));
}

// Giá trị 1 HĐ thầu phụ = giá trị + phát sinh (đời cũ)
function _hdtpTong(h) {
  return (h.giaTri || 0) + (h.phatSinh || 0);
}

// Phân bổ phiếu Ứng thầu phụ vào từng HĐ (xem quy tắc ở đầu file).
// Trả về Map(idHĐ → { daUng, items: [{ r, amt, shared }] })
//   amt    = số tiền của phiếu tính cho HĐ này (có thể chỉ là 1 phần nếu bị chia FIFO)
//   shared = phiếu không gắn HĐ, cặp TP × CT có nhiều HĐ (đã phân bổ tự động)
function _hdtpUngAlloc() {
  const res = new Map();
  const hds = (typeof thauPhuContracts !== 'undefined' ? thauPhuContracts : []).filter(r => r && !r.deletedAt);
  const byPair = new Map();
  const pairOfHd = new Map();   // id HĐ → khóa cặp TP × CT
  hds.forEach(h => {
    const tp = (recCatName(h, 'thauphu', 'thauphu') || '').trim().toLowerCase();
    const k = tp + '|' + _hdtpCtKey(h);
    if (!byPair.has(k)) byPair.set(k, []);
    byPair.get(k).push(h);
    pairOfHd.set(h.id, k);
    res.set(h.id, { daUng: 0, items: [] });
  });

  // 1) Phiếu gắn thẳng HĐ (hdtpId) → tính cho HĐ đó; 2) còn lại gom theo cặp TP × CT
  const pool = new Map();
  (typeof ungRecords !== 'undefined' ? ungRecords : [])
    .filter(u => u && !u.deletedAt && u.loai === 'thauphu')
    .forEach(u => {
      const tp = (recCatName(u, 'ung', 'tp') || '').trim().toLowerCase();
      const k = tp + '|' + _hdtpCtKey(u);
      // Gắn thẳng chỉ khi phiếu VẪN cùng cặp TP × CT với HĐ (phiếu bị sửa sang đối tác/CT khác
      // ở tab Tiền Ứng thì hdtpId cũ không còn đúng → coi như phiếu không gắn HĐ)
      if (u.hdtpId && res.has(u.hdtpId) && pairOfHd.get(u.hdtpId) === k) {
        const e = res.get(u.hdtpId);
        e.daUng += (u.tien || 0);
        e.items.push({ r: u, amt: u.tien || 0, shared: false });
        return;
      }
      if (!tp) return;
      if (!byPair.has(k)) return;              // đối tác/CT này không có HĐ → không thuộc bảng này
      if (!pool.has(k)) pool.set(k, []);
      pool.get(k).push(u);
    });

  // 3) Phân bổ FIFO các phiếu không gắn HĐ: HĐ cũ nhất được trả đủ trước, dư dồn HĐ mới nhất
  pool.forEach((list, k) => {
    const hs = byPair.get(k).slice().sort(_hdtpSortAsc);
    const multi = hs.length > 1;
    const room = (h) => _hdtpTong(h) - res.get(h.id).daUng;
    let i = 0;
    list.sort(_hdtpSortAsc).forEach(u => {
      let left = u.tien || 0;
      if (left <= 0) {                         // phiếu 0đ / âm (hiếm) → gán nguyên cho HĐ hiện tại
        const e = res.get(hs[i].id);
        e.daUng += left; e.items.push({ r: u, amt: left, shared: multi });
        return;
      }
      while (left > 0) {
        while (i < hs.length - 1 && room(hs[i]) <= 0) i++;   // HĐ hiện tại đã đủ → sang HĐ kế
        const h = hs[i];
        const amt = (i === hs.length - 1) ? left : Math.min(left, room(h));
        const e = res.get(h.id);
        e.daUng += amt;
        e.items.push({ r: u, amt, shared: multi });
        left -= amt;
      }
    });
  });
  return res;
}

// Ngưỡng coi như "đã trả đủ" (dùng chung với tab Công Nợ nếu đã nạp)
function _hdtpTol() {
  return (typeof _ttTolerance === 'function') ? _ttTolerance() : 0;
}

// ── Ô "Đã Ứng": số tiền + thanh tiến độ nhỏ bên dưới (% so với giá trị HĐ) ──
function _hdtpDaUngCell(daUng, tong) {
  const pct = tong > 0 ? (daUng / tong) * 100 : (daUng > 0 ? 100 : 0);
  const w   = Math.max(0, Math.min(pct, 100));
  const tol = _hdtpTol();
  const cls = (tong > 0 && daUng > tong + tol) ? 'bg-warning'
            : (tong > 0 && daUng >= tong - tol) ? 'bg-success' : 'bg-primary';
  const txt = pct >= 100 ? Math.round(pct) + '%' : Math.floor(pct) + '%';   // chưa đủ thì làm tròn XUỐNG
  return `<div class="font-monospace fw-semibold" style="white-space:nowrap">${daUng ? fmtM(daUng) : '<span class="text-body-secondary">—</span>'}</div>
    ${tong > 0 ? `<div class="d-flex align-items-center gap-1 justify-content-end mt-1">
      <div class="progress flex-grow-1" style="height:5px;max-width:110px" role="progressbar" aria-valuenow="${Math.round(w)}" aria-valuemin="0" aria-valuemax="100">
        <div class="progress-bar ${cls}" style="width:${w}%"></div>
      </div>
      <span class="text-secondary font-monospace" style="font-size:10.5px;min-width:32px;text-align:right">${txt}</span>
    </div>` : ''}`;
}

// ── Ô "Còn Phải Trả": còn nợ = đỏ · đã trả đủ = xanh lá · ứng vượt = cam ──
function _hdtpConCell(con, tong) {
  if (!tong) return '<span class="text-body-secondary">—</span>';
  const tol = _hdtpTol();
  if (con > tol)  return `<span class="text-danger fw-bold font-monospace">${fmtM(con)}</span>`;
  if (con < -tol) return `<span class="fw-semibold" style="color:#fd7e14" title="Đã ứng nhiều hơn giá trị HĐ">Ứng vượt <span class="font-monospace">${fmtM(-con)}</span></span>`;
  return '<span class="text-success fw-semibold"><span class="material-symbols-outlined" style="font-size:15px;vertical-align:-3px">check_circle</span> Đã trả đủ</span>';
}

// ══ BẢNG HỢP ĐỒNG THẦU PHỤ (Master-Detail) ════════════════════
function renderHdtpTableTk(page) {
  page = page || 0;
  _hdtpTkPage = page;
  const tbody  = document.getElementById('hdtptk-tbody');
  const tfoot  = document.getElementById('hdtptk-tfoot');
  const empty  = document.getElementById('hdtptk-empty');
  const pgWrap = document.getElementById('hdtptk-pagination');
  const badge  = document.getElementById('hdtptk-count-badge');
  const sumEl  = document.getElementById('hdtptk-sum');
  if (!tbody) return;

  // Sắp xếp: ngày mới nhất lên đầu (DESC), tie-break theo thời điểm tạo
  let filtered = thauPhuContracts
    .filter(r => !r.deletedAt && _dtInYear(r.ngay) && _dtMatchTpProjFilter(r))
    .sort((a, b) => (b.ngay || '').localeCompare(a.ngay || '')
      || ((b.createdAt || 0) - (a.createdAt || 0)));

  if (_dtTpSearch) {
    const q = _dtTpSearch;
    filtered = filtered.filter(r =>
      (_resolveCtName(r) || '').toLowerCase().includes(q) ||
      (recCatName(r,'thauphu','thauphu') || '').toLowerCase().includes(q) ||
      (r.nd || '').toLowerCase().includes(q)
    );
  }

  if (badge) badge.textContent = filtered.length ? `(${filtered.length} hợp đồng)` : '';
  if (!filtered.length) {
    tbody.innerHTML = '';
    if (tfoot) tfoot.innerHTML = '';
    if (sumEl) sumEl.innerHTML = '';
    if (empty) {
      empty.textContent = (_dtTpSearch || _dtTpCtFilter) ? 'Không có hợp đồng nào khớp bộ lọc' : 'Chưa có hợp đồng thầu phụ';
      empty.style.display = '';
    }
    if (pgWrap) pgWrap.innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  const alloc = _hdtpUngAlloc();
  const _a = (r) => alloc.get(r.id) || { daUng: 0, items: [] };

  // Tổng theo bộ lọc hiện tại (mọi trang)
  const tTong = filtered.reduce((s, r) => s + _hdtpTong(r), 0);
  const tUng  = filtered.reduce((s, r) => s + _a(r).daUng, 0);
  const tCon  = tTong - tUng;
  if (sumEl) sumEl.innerHTML = `Tổng HĐ: <b class="text-warning font-monospace">${fmtM(tTong)}</b> · Đã ứng: <b class="font-monospace">${fmtM(tUng)}</b> · Còn phải trả: <b class="${tCon > _hdtpTol() ? 'text-danger' : 'text-success'} font-monospace">${fmtM(tCon)}</b>`;

  const total = filtered.length;
  const maxPage = Math.max(0, Math.ceil(total / DT_PG) - 1);
  if (page > maxPage) { page = maxPage; _hdtpTkPage = page; }
  const slice = filtered.slice(page * DT_PG, (page + 1) * DT_PG);

  tbody.innerHTML = slice.map(r => {
    const tong = _hdtpTong(r);
    const a    = _a(r);
    const open = _hdtpOpen.has(r.id);
    const cls  = 'dt-td-row' + (open ? ' is-open' : '') + (r.id === _hdtpLastId ? ' dt-row-new' : '');
    const mainRow = `<tr class="${cls}" data-id="${x(r.id)}" onclick="hdtpToggleRow(event, this.dataset.id)" title="Bấm để ${open ? 'thu gọn' : 'xem lịch sử tạm ứng'}">
      <td style="text-align:center;padding:4px 6px"><input type="checkbox" class="hdtp-row-chk" data-id="${x(r.id)}"></td>
      <td class="text-secondary" style="white-space:nowrap;font-size:12px">${fmtISODate(r.ngay)}</td>
      <td style="font-weight:600;white-space:nowrap">${x(_resolveCtName(r))}</td>
      <td style="white-space:nowrap">${x(recCatName(r,'thauphu','thauphu'))}</td>
      <td class="text-secondary hdtp-nd-cell"><span class="hdtp-nd-clamp">${x(r.nd || '—')}</span></td>
      <td class="text-end font-monospace fw-bold text-warning" style="white-space:nowrap">${tong ? fmtM(tong) : '—'}</td>
      <td class="text-end">${_hdtpDaUngCell(a.daUng, tong)}</td>
      <td class="text-end" style="white-space:nowrap">${_hdtpConCell(tong - a.daUng, tong)}</td>
      <td class="action-col">
        <div class="d-flex gap-1 justify-content-center align-items-center">
          <button class="btn btn-outline-secondary btn-sm" title="${open ? 'Thu gọn' : 'Xem lịch sử tạm ứng'}" onclick="hdtpToggleRow(null, '${x(r.id)}')"><span class="material-symbols-outlined dt-td-chev" style="font-size:16px;vertical-align:-3px">chevron_right</span></button>
          <button class="btn btn-outline-primary btn-sm" title="S&#7917;a"
            onclick="editHopDongThauPhu('${x(r.id)}')"><i class="bi bi-pencil-fill"></i></button>
          <button class="btn btn-outline-danger btn-sm" title="X&#243;a"
            onclick="delHopDongThauPhu('${x(r.id)}')"><i class="bi bi-trash-fill"></i></button>
        </div>
      </td>
    </tr>`;
    return mainRow + (open ? _hdtpDetailRow(r, a) : '');
  }).join('');

  if (tfoot) tfoot.innerHTML = `<tr style="border-top:2px solid var(--bs-border-color);font-weight:700">
      <td></td>
      <td colspan="4">TỔNG CỘNG <span class="fw-normal text-secondary" style="font-size:11px">(${total} hợp đồng theo bộ lọc)</span></td>
      <td class="text-end font-monospace text-warning" style="white-space:nowrap">${fmtM(tTong)}</td>
      <td class="text-end">${_hdtpDaUngCell(tUng, tTong)}</td>
      <td class="text-end" style="white-space:nowrap">${_hdtpConCell(tCon, tTong)}</td>
      <td></td>
    </tr>`;

  if (pgWrap) pgWrap.innerHTML = _dtPaginationHtml(total, page, 'renderHdtpTableTk');
}

// ── Dòng xổ xuống: Lịch sử tạm ứng / chi tiền của 1 HĐ + nút [+ Cập nhật tạm ứng] ──
function _hdtpDetailRow(hd, a) {
  const tong = _hdtpTong(hd);
  const con  = tong - a.daUng;
  const items = a.items.slice().sort((p, q) => _hdtpSortAsc(p.r, q.r));
  const tpName = recCatName(hd, 'thauphu', 'thauphu');
  const formOpen = _hdtpUngFormFor === hd.id;

  // Dòng nhập nhanh tạm ứng (chỉ hiện khi bấm nút)
  let form = '';
  if (formOpen) {
    const nguoiOpts = [...new Set([...(cats.nguoiTH || [])].filter(Boolean))].sort((m, n) => m.localeCompare(n, 'vi'))
      .map(v => `<option value="${x(v)}">${x(v)}</option>`).join('');
    form = `<div class="border rounded p-2 mb-2" style="background:var(--bs-body-bg)" onclick="event.stopPropagation()">
      <div class="row g-2 align-items-end">
        <div class="col-6 col-md-2">
          <label class="qt-lb mb-1 d-block" for="hdtpu-ngay">Ngày chi *</label>
          <input type="date" id="hdtpu-ngay" class="form-control form-control-sm" value="${today()}">
        </div>
        <div class="col-6 col-md-3">
          <label class="qt-lb mb-1 d-block" for="hdtpu-tien">Số tiền chi (đ) *</label>
          <div class="input-group input-group-sm">
            <input type="text" id="hdtpu-tien" class="form-control form-control-sm font-monospace" inputmode="numeric" placeholder="0" oninput="fmtInputMoney(this)">
            ${con > 0 ? `<button class="btn btn-outline-secondary" type="button" title="Điền số còn phải trả" onclick="hdtpUngFillCon(${Math.round(con)})">= Còn lại</button>` : ''}
          </div>
        </div>
        <div class="col-6 col-md-2">
          <label class="qt-lb mb-1 d-block" for="hdtpu-nguoi">Người chi</label>
          <select id="hdtpu-nguoi" class="form-select form-select-sm"><option value="">-- Chọn --</option>${nguoiOpts}</select>
        </div>
        <div class="col-6 col-md-3">
          <label class="qt-lb mb-1 d-block" for="hdtpu-nd">Lý do</label>
          <input type="text" id="hdtpu-nd" class="form-control form-control-sm" placeholder="VD: Tạm ứng đợt 2, nghiệm thu móng...">
        </div>
        <div class="col-12 col-md-2 d-flex gap-1">
          <button class="btn btn-sm btn-success fw-bold flex-grow-1" onclick="hdtpSaveUng('${x(hd.id)}')"><span class="material-symbols-outlined msi-gap">save</span>Lưu</button>
          <button class="btn btn-sm btn-outline-secondary" title="Đóng" onclick="hdtpToggleUngForm('${x(hd.id)}')"><span class="material-symbols-outlined" style="font-size:16px;vertical-align:-3px">close</span></button>
        </div>
      </div>
    </div>`;
  }

  // Bảng nhỏ: Ngày chi | Số tiền chi | Người chi | Lý do
  let body;
  if (!items.length) {
    body = '<div class="text-secondary text-center py-2" style="font-size:12px">Chưa có lần tạm ứng / chi tiền nào cho hợp đồng này</div>';
  } else {
    const rows = items.map(({ r, amt, shared }) => {
      const tags = [];
      if (r.autoSettle) tags.push('<span class="badge bg-success-subtle text-success-emphasis" style="font-size:9.5px" title="Phiếu tự sinh khi tất toán ở tab Công Nợ">Tất toán</span>');
      if (shared) tags.push(`<span class="badge bg-secondary-subtle text-secondary-emphasis" style="font-size:9.5px" title="Phiếu ứng không gắn HĐ — thầu phụ có nhiều HĐ ở công trình này nên được phân bổ tự động (HĐ cũ trả đủ trước)">Phân bổ chung</span>`);
      const split = amt !== (r.tien || 0)
        ? `<div class="text-secondary" style="font-size:10.5px">phần tính cho HĐ này / phiếu ${fmtM(r.tien || 0)}</div>` : '';
      const nguoi = r.nguoi || (r.autoSettle ? r.settledBy : '') || '';
      return `<tr>
        <td style="white-space:nowrap;font-size:12px">${fmtISODate(r.ngay)}</td>
        <td class="text-end font-monospace fw-semibold" style="white-space:nowrap">${fmtM(amt)}${split}</td>
        <td class="text-secondary" style="white-space:nowrap">${x(nguoi || '—')}</td>
        <td class="text-body-secondary" style="font-size:12px">${x(r.nd || '—')} ${tags.join(' ')}</td>
      </tr>`;
    }).join('');
    body = `<table class="table table-sm align-middle mb-0 dt-td-sub" style="font-size:12.5px">
      <thead><tr style="font-size:10.5px;color:var(--bs-secondary-color)">
        <th style="width:110px">Ngày chi</th>
        <th class="text-end" style="width:170px">Số tiền chi</th>
        <th style="width:160px">Người chi</th>
        <th>Lý do</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr style="font-weight:700">
        <td>Tổng đã ứng</td>
        <td class="text-end font-monospace">${fmtM(a.daUng)}</td>
        <td colspan="2" class="fw-normal" style="font-size:12px">Còn phải trả: ${_hdtpConCell(con, tong)}</td>
      </tr></tfoot>
    </table>`;
  }

  return `<tr class="dt-td-detail"><td colspan="9">
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
      <span class="fw-semibold" style="font-size:12px">
        <span class="material-symbols-outlined msi-gap" style="font-size:16px;vertical-align:-3px">receipt_long</span>Lịch sử tạm ứng / chi tiền — ${x(tpName)} · ${x(_resolveCtName(hd))} (${items.length} phiếu)
      </span>
      ${formOpen ? '' : `<button class="btn btn-sm btn-success fw-semibold" onclick="hdtpToggleUngForm('${x(hd.id)}')">
        <span class="material-symbols-outlined msi-gap" style="font-size:16px;vertical-align:-3px">add</span>Cập nhật tạm ứng
      </button>`}
    </div>
    ${form}
    ${body}
  </td></tr>`;
}

// ── Bấm 1 dòng HĐ → mở / thu gọn chi tiết (bỏ qua khi bấm vào nút / ô tick trong dòng) ──
function hdtpToggleRow(ev, id) {
  if (ev && ev.target && ev.target.closest('button, input, select, a, label')) return;
  if (_hdtpOpen.has(id)) {
    _hdtpOpen.delete(id);
    if (_hdtpUngFormFor === id) _hdtpUngFormFor = '';
  } else {
    _hdtpOpen.add(id);
  }
  renderHdtpTableTk(_hdtpTkPage);
}

// ── Nút [+ Cập nhật tạm ứng] → mở / đóng dòng nhập nhanh cho HĐ đang xem ──
function hdtpToggleUngForm(id) {
  _hdtpUngFormFor = (_hdtpUngFormFor === id) ? '' : id;
  _hdtpOpen.add(id);
  renderHdtpTableTk(_hdtpTkPage);
  if (_hdtpUngFormFor) setTimeout(() => document.getElementById('hdtpu-tien')?.focus(), 50);
}

// ── Nút "= Còn lại": điền sẵn số còn phải trả vào ô Số tiền chi ──
function hdtpUngFillCon(v) {
  const el = document.getElementById('hdtpu-tien');
  if (!el) return;
  el.dataset.raw = String(v);
  el.value = v ? v.toLocaleString('vi-VN') : '';
  el.focus();
}

// ── Lưu khoản tạm ứng mới cho 1 HĐ → 1 phiếu Ứng thầu phụ trong kho ung_v1 ──
// Phiếu gắn hdtpId = id HĐ → tính THẲNG cho HĐ này; vẫn là phiếu ứng bình thường
// (hiện ở tab Tiền Ứng, tính công nợ ở tab Công Nợ, sửa/xóa ở tab Tiền Ứng như mọi phiếu khác).
function hdtpSaveUng(id) {
  const hd = thauPhuContracts.find(r => r.id === id && !r.deletedAt);
  if (!hd) { toast('Không tìm thấy hợp đồng', 'error'); return; }
  const ngay  = document.getElementById('hdtpu-ngay')?.value || '';
  const tien  = _readMoneyInput('hdtpu-tien');
  const nguoi = (document.getElementById('hdtpu-nguoi')?.value || '').trim();
  const nd    = (document.getElementById('hdtpu-nd')?.value || '').trim();
  if (!ngay)  { toast('Vui lòng chọn Ngày chi!', 'error'); return; }
  if (!tien)  { toast('Vui lòng nhập Số tiền chi!', 'error'); return; }

  const ctName = _resolveCtName(hd) || hd.congtrinh || '';
  const proj = hd.projectId
    ? getAllProjects().find(p => p.id === hd.projectId)
    : getAllProjects().find(p => p.name === ctName);
  // Cùng quy tắc tab Tiền Ứng: công trình đã quyết toán thì không ghi thêm phiếu ứng
  if (proj && proj.status === 'closed') {
    toast('Công trình "' + ctName + '" đã quyết toán — không ghi thêm tạm ứng', 'error');
    return;
  }
  const a = _hdtpUngAlloc().get(id) || { daUng: 0 };
  const con = _hdtpTong(hd) - a.daUng;
  if (_hdtpTong(hd) > 0 && tien > con + _hdtpTol() &&
      !confirm(`Số tiền ${fmtM(tien)} VƯỢT số còn phải trả của HĐ (${fmtM(Math.max(con, 0))}).\nVẫn ghi nhận?`)) return;

  const rec = {
    ngay,
    loai: 'thauphu',
    tp: recCatName(hd, 'thauphu', 'thauphu'),
    tpId: hd.thauphuId || null,
    congtrinh: proj ? proj.name : ctName,
    projectId: proj ? proj.id : (hd.projectId || null),
    tien,
    nd: nd || 'Tạm ứng HĐ thầu phụ',
    nguoi,                // Người chi
    hdtpId: hd.id,        // gắn thẳng HĐ thầu phụ này
  };
  if (!rec.tpId && typeof stampCatIds === 'function') stampCatIds(rec, 'ung');
  ungRecords.unshift(mkRecord(rec));
  save('ung_v1', ungRecords);

  _hdtpUngFormFor = '';
  _hdtpOpen.add(id);
  renderHdtpTableTk(_hdtpTkPage);
  renderHdtpTable(0);   // bảng Công Nợ (tất toán) nhảy số
  // Tab Tiền Ứng / mini bảng / dashboard — gọi an toàn (tab có thể chưa mở)
  try { if (typeof buildUngFilters === 'function') buildUngFilters(); } catch (e) {}
  try { if (typeof filterAndRenderUng === 'function') filterAndRenderUng(); } catch (e) {}
  try { if (typeof renderUngMini === 'function') renderUngMini(); } catch (e) {}
  try { if (typeof renderDashboard === 'function') renderDashboard(); } catch (e) {}
  toast(`✅ Đã ghi nhận tạm ứng ${fmtM(tien)} cho ${rec.tp} — ${rec.congtrinh}`, 'success');
}
