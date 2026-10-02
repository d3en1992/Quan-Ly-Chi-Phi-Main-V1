// quyettoan.thauphu.js — Tab QUYẾT TOÁN · Phân hệ 2B: TẤT TOÁN Thầu Phụ / Nhà Cung Cấp
// Load order: sau quyettoan.congtrinh.js, trước thungrac.js
//
// Mục tiêu: dọn nhanh các khoản nợ treo với đối tác mà KHÔNG cần sang tab Ứng TP/NCC gõ phiếu.
//
// CÁCH HOẠT ĐỘNG:
//   • Danh sách = các cặp (Đối tác × Công trình) còn nợ > CN_DONE_TOLERANCE (100.000đ),
//     số dư tính TOÀN VÒNG ĐỜI (không lọc năm) — cùng nguồn với tab Công Nợ:
//       Thầu phụ: Giá trị = Σ HĐ thầu phụ (giaTri + phatSinh) · Đã ứng = Σ phiếu ứng loai='thauphu'
//       NCC     : Giá trị = Σ hóa đơn có NCC đó             · Đã ứng = Σ phiếu ứng loai='nhacungcap'
//   • Bấm "Tất toán" → tạo 1 PHIẾU ỨNG thật (ung_v1) đúng bằng số còn phải trả.
//     → Đã ứng = Giá trị, Còn phải TT = 0 → dòng tự biến mất; tab Công Nợ / Ứng TP/NCC tự nhảy số.
//   • Phiếu tự sinh gắn cờ: autoSettle:true, settleId (mã của LẦN tất toán), settledBy.
//     → Hoàn tác / Hủy = xóa mềm mọi phiếu cùng settleId (vào thùng rác như phiếu thường).
//   • Quyền: chỉ Admin + Giám đốc (_qtCanEdit — quyettoan.congtrinh.js).

// ─── State ─────────────────────────────────────────────────────
let _ttGroup  = '';     // 'thauphu' | 'nhacungcap' | ''
let _ttCtKey  = '';     // khóa công trình đang lọc ('' = tất cả)
let _ttSearch = '';     // tìm theo tên đối tác (chữ thường)
let _ttRowsCache = [];  // các dòng đang hiển thị (để tra cứu khi bấm nút theo chỉ số)
let _ttLastSettleId = null;   // lần tất toán gần nhất (cho nút Hoàn tác)
let _ttUndoTimer = null;

// Ngưỡng "đã xong" dùng CHUNG với tab Công Nợ (doanh thu.congno.js) — fallback nếu chưa nạp
function _ttTolerance() {
  return (typeof CN_DONE_TOLERANCE !== 'undefined') ? CN_DONE_TOLERANCE : 100000;
}

// ── Dựng các dòng công nợ TOÀN VÒNG ĐỜI ──
// Trả về [{ key, group, partner, partnerId, ctName, pid, ctKey, value, daUng, con }]
function _ttBuildRows() {
  const map = {};
  // Khóa công trình: ưu tiên projectId; bản ghi cũ chỉ có tên → 'name:<tên>'
  const _ctOf = (rec) => {
    const name = (_resolveCtName(rec) || '').trim();
    const p = rec.projectId ? _qtResolveProj(rec.projectId) : (name ? _qtResolveProj(name) : null);
    if (p && p.id === 'COMPANY') return { pid: 'COMPANY', ctName: p.name, ctKey: 'COMPANY' };
    if (p) return { pid: p.id, ctName: p.name, ctKey: p.id };
    return { pid: null, ctName: name, ctKey: 'name:' + name };
  };
  const _ensure = (group, partner, ct) => {
    const k = group + '|||' + partner.toLowerCase() + '|||' + ct.ctKey;
    if (!map[k]) map[k] = { key: k, group, partner, partnerId: null, ...ct, value: 0, daUng: 0 };
    return map[k];
  };

  // THẦU PHỤ: giá trị HĐ
  (typeof thauPhuContracts !== 'undefined' ? thauPhuContracts : [])
    .filter(r => !r.deletedAt)
    .forEach(r => {
      const partner = (recCatName(r, 'thauphu', 'thauphu') || '').trim();
      if (!partner) return;
      const row = _ensure('thauphu', partner, _ctOf(r));
      row.value += (r.giaTri || 0) + (r.phatSinh || 0);
      if (!row.partnerId && r.thauphuId) row.partnerId = r.thauphuId;
    });

  // NHÀ CUNG CẤP: tổng hóa đơn
  getInvoicesCached()
    .filter(inv => !inv.deletedAt)
    .forEach(inv => {
      const partner = (recCatName(inv, 'inv', 'ncc') || '').trim();
      if (!partner) return;
      const row = _ensure('nhacungcap', partner, _ctOf(inv));
      row.value += (inv.thanhtien || inv.tien || 0);
      if (!row.partnerId && inv.nccId) row.partnerId = inv.nccId;
    });

  // ĐÃ ỨNG (cả 2 nhóm)
  (typeof ungRecords !== 'undefined' ? ungRecords : [])
    .filter(r => !r.deletedAt && (r.loai === 'thauphu' || r.loai === 'nhacungcap'))
    .forEach(r => {
      const partner = (recCatName(r, 'ung', 'tp') || '').trim();
      if (!partner) return;
      const row = _ensure(r.loai, partner, _ctOf(r));
      row.daUng += (r.tien || 0);
      if (!row.partnerId && r.tpId) row.partnerId = r.tpId;
    });

  const tol = _ttTolerance();
  return Object.values(map)
    .map(r => ({ ...r, con: (r.value || 0) - (r.daUng || 0) }))
    .filter(r => r.con > tol);    // chỉ giữ dòng còn nợ THẬT (bỏ dòng đã xong / ứng dư)
}

// ── Các phiếu ứng do tất toán sinh ra, gom theo từng LẦN tất toán (settleId) ──
function _ttBatches() {
  const by = {};
  (typeof ungRecords !== 'undefined' ? ungRecords : [])
    .filter(r => r.autoSettle && r.settleId && !r.deletedAt)
    .forEach(r => {
      const b = by[r.settleId] || (by[r.settleId] = { id: r.settleId, ngay: r.ngay, by: r.settledBy || '', ts: r.createdAt || 0, recs: [], total: 0 });
      b.recs.push(r);
      b.total += r.tien || 0;
      if ((r.createdAt || 0) > b.ts) b.ts = r.createdAt || 0;
    });
  return Object.values(by).sort((a, b) => b.ts - a.ts);
}

// ══ KHỞI TẠO / VẼ ════════════════════════════════════════════════
function initTatToan() {
  const ngayEl = document.getElementById('tt-ngay');
  if (ngayEl && !ngayEl.value) ngayEl.value = today();
  ttRender();
}

// Đọc bộ lọc từ giao diện rồi vẽ lại
function ttApplyFilters() {
  _ttGroup  = document.getElementById('tt-filter-group')?.value || '';
  _ttCtKey  = document.getElementById('tt-filter-ct')?.value || '';
  _ttSearch = (document.getElementById('tt-filter-search')?.value || '').trim().toLowerCase();
  ttRender();
}

function ttRender() {
  const tbody = document.getElementById('tt-tbody');
  if (!tbody) return;
  const all = _ttBuildRows();

  // ── Thẻ tổng quan (không phụ thuộc bộ lọc) ──
  const sum = (g) => all.filter(r => r.group === g).reduce((s, r) => s + r.con, 0);
  const cnt = (g) => all.filter(r => r.group === g).length;
  const setTxt = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  setTxt('tt-kpi-tp', fmtM(sum('thauphu')));
  setTxt('tt-kpi-tp-sub', cnt('thauphu') ? `${cnt('thauphu')} dòng còn nợ` : 'Không còn nợ');
  setTxt('tt-kpi-ncc', fmtM(sum('nhacungcap')));
  setTxt('tt-kpi-ncc-sub', cnt('nhacungcap') ? `${cnt('nhacungcap')} dòng còn nợ` : 'Không còn nợ');
  const batches = _ttBatches();
  const doneTotal = batches.reduce((s, b) => s + b.total, 0);
  setTxt('tt-kpi-done', fmtM(doneTotal));
  setTxt('tt-kpi-done-sub', batches.length ? `${batches.length} lần tất toán` : 'Chưa tất toán lần nào');

  // ── Dropdown công trình: chỉ CT đang có dòng nợ ──
  const ctSel = document.getElementById('tt-filter-ct');
  if (ctSel) {
    const cts = new Map();
    all.forEach(r => { if (!cts.has(r.ctKey)) cts.set(r.ctKey, r.ctName || '(Không gắn công trình)'); });
    if (_ttCtKey && !cts.has(_ttCtKey)) _ttCtKey = '';
    ctSel.innerHTML = '<option value="">-- Tất cả công trình --</option>' +
      [...cts.entries()].sort((a, b) => a[1].localeCompare(b[1], 'vi'))
        .map(([k, n]) => `<option value="${x(k)}"${k === _ttCtKey ? ' selected' : ''}>${x(n)}</option>`).join('');
  }

  // ── Áp bộ lọc ──
  let rows = all;
  if (_ttGroup)  rows = rows.filter(r => r.group === _ttGroup);
  if (_ttCtKey)  rows = rows.filter(r => r.ctKey === _ttCtKey);
  if (_ttSearch) rows = rows.filter(r => r.partner.toLowerCase().includes(_ttSearch));
  // Nợ nhiều nhất lên đầu
  rows.sort((a, b) => b.con - a.con || a.partner.localeCompare(b.partner, 'vi'));
  _ttRowsCache = rows;

  const badge = document.getElementById('tt-count-badge');
  if (badge) badge.textContent = rows.length ? `(${rows.length} dòng)` : '';
  const empty = document.getElementById('tt-empty');
  const chkAll = document.getElementById('tt-chk-all');
  if (chkAll) chkAll.checked = false;

  // Chưa tải đủ dữ liệu mọi năm → số dư có thể sai → KHÓA nút tất toán
  const ready = _qtAllYearsReady;

  if (!rows.length) {
    tbody.innerHTML = ready ? '' : `<tr><td colspan="8" class="text-center text-secondary py-4">⏳ Đang tải dữ liệu các năm để tính số dư...</td></tr>`;
    if (empty) empty.style.display = ready ? '' : 'none';
  } else {
    if (empty) empty.style.display = 'none';
    const canEdit = _qtCanEdit() && ready;
    let tot = 0;
    tbody.innerHTML = rows.map((r, i) => {
      tot += r.con;
      const pct = r.value > 0 ? Math.min(100, Math.round(r.daUng / r.value * 100)) : 0;
      return `<tr id="tt-row-${i}" style="transition:opacity .35s ease, background .35s ease">
        <td style="text-align:center"><input type="checkbox" class="tt-row-chk" data-i="${i}" onchange="ttUpdateBulkBtn()" ${canEdit ? '' : 'disabled'}></td>
        <td style="font-weight:600;white-space:nowrap">${x(r.partner)}</td>
        <td style="text-align:center">${_cnGroupBadge(r.group)}</td>
        <td style="white-space:nowrap">${x(r.ctName || '—')}</td>
        <td class="text-end font-monospace" style="white-space:nowrap">${r.value ? fmtS(r.value) : '<span class="text-secondary">—</span>'}</td>
        <td class="text-end font-monospace text-success" style="white-space:nowrap">${r.daUng ? fmtS(r.daUng) : '0'} <span class="text-secondary" style="font-size:10px">(${pct}%)</span></td>
        <td class="text-end font-monospace fw-bold text-danger" style="white-space:nowrap">${fmtM(r.con)}</td>
        <td style="text-align:center;white-space:nowrap">
          ${canEdit ? `<button class="btn btn-sm btn-outline-success fw-semibold" onclick="ttSettleOne(${i})"><span class="material-symbols-outlined msi-gap">task_alt</span>Tất toán toàn bộ</button>` : ''}
        </td>
      </tr>`;
    }).join('') + `<tr style="border-top:2px solid var(--bs-border-color);font-weight:700;background:var(--bs-tertiary-bg)">
        <td colspan="6" class="text-secondary" style="padding:8px 12px">Tổng còn phải trả (${rows.length} dòng)</td>
        <td class="text-end font-monospace text-danger" style="white-space:nowrap">${fmtM(tot)}</td><td></td>
      </tr>`;
  }
  ttUpdateBulkBtn();
  _ttRenderHistory(batches);
}

// ── Lịch sử các lần tất toán ──
function _ttRenderHistory(batches) {
  const tbody = document.getElementById('tt-hist-tbody');
  const empty = document.getElementById('tt-hist-empty');
  if (!tbody) return;
  const list = (batches || _ttBatches()).slice(0, 10);
  if (!list.length) { tbody.innerHTML = ''; if (empty) empty.style.display = ''; return; }
  if (empty) empty.style.display = 'none';
  const canEdit = _qtCanEdit();
  tbody.innerHTML = list.map(b => {
    // Chi tiết: tối đa 3 đối tác, còn lại ghi "+N"
    const names = b.recs.map(r => `${recCatName(r, 'ung', 'tp')} (${_resolveCtName(r) || '—'})`);
    const detail = names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '');
    return `<tr>
      <td style="white-space:nowrap;font-size:12px">${fmtISODate(b.ngay)}</td>
      <td style="white-space:nowrap">${x(b.by || '—')}</td>
      <td class="text-body-secondary" style="font-size:12px;max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(names.join('\n'))}">${x(detail)}</td>
      <td class="text-end font-monospace fw-semibold" style="white-space:nowrap">${fmtM(b.total)}</td>
      <td class="action-col">${canEdit ? `<button class="btn btn-sm btn-outline-danger" title="Hủy lần tất toán này (xóa các phiếu ứng tự sinh)" onclick="ttCancelBatch('${b.id}')"><span class="material-symbols-outlined" style="font-size:16px">undo</span></button>` : ''}</td>
    </tr>`;
  }).join('');
}

// ── Checkbox: chọn tất cả / cập nhật nút tất toán hàng loạt ──
function ttToggleAll(checked) {
  document.querySelectorAll('.tt-row-chk:not(:disabled)').forEach(c => { c.checked = checked; });
  ttUpdateBulkBtn();
}
function _ttSelectedRows() {
  return [...document.querySelectorAll('.tt-row-chk:checked')]
    .map(c => _ttRowsCache[+c.dataset.i]).filter(Boolean);
}
function ttUpdateBulkBtn() {
  const btn = document.getElementById('tt-bulk-btn');
  const lb  = document.getElementById('tt-bulk-label');
  const sel = _ttSelectedRows();
  if (btn) btn.disabled = !sel.length;
  if (lb) lb.textContent = sel.length
    ? `Tất toán ${sel.length} dòng đã chọn — ${fmtM(sel.reduce((s, r) => s + r.con, 0))}`
    : 'Tất toán các dòng đã chọn';
}

// ══ TẤT TOÁN ═════════════════════════════════════════════════════
function ttSettleOne(i) {
  const r = _ttRowsCache[i];
  if (!r) return;
  _ttSettle([r], [i]);
}
function ttSettleSelected() {
  const chks = [...document.querySelectorAll('.tt-row-chk:checked')];
  const rows = chks.map(c => _ttRowsCache[+c.dataset.i]).filter(Boolean);
  if (!rows.length) return;
  _ttSettle(rows, chks.map(c => +c.dataset.i));
}

// Tạo phiếu ứng cho các dòng + hiệu ứng "hoàn thành" + thanh Hoàn tác
function _ttSettle(rows, idxs) {
  if (!_qtCanEdit()) { toast('Chỉ Quản trị viên hoặc Giám đốc được tất toán', 'error'); return; }
  if (!_qtAllYearsReady) {
    toast('Chưa tải đủ dữ liệu các năm — chưa thể tất toán (tránh trả dư tiền)', 'error');
    qtEnsureAllYears(() => ttRender());
    return;
  }
  const ngay = document.getElementById('tt-ngay')?.value || '';
  if (!ngay) { toast('Vui lòng chọn Ngày tất toán!', 'error'); return; }

  const total = rows.reduce((s, r) => s + r.con, 0);
  const msg = rows.length === 1
    ? `Tất toán ${rows[0].partner} — ${rows[0].ctName || 'không gắn CT'}?\n\nTạo phiếu ứng ${fmtM(total)} ngày ${fmtISODate(ngay)}.`
    : `Tất toán ${rows.length} dòng, tổng ${fmtM(total)}?\n\nMỗi dòng tạo 1 phiếu ứng ngày ${fmtISODate(ngay)}.`;
  if (!confirm(msg)) return;

  const user = getCurrentUser()?.username || 'Không rõ';
  const settleId = 'tt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  rows.forEach(r => {
    const rec = {
      ngay,
      loai: r.group,                       // 'thauphu' | 'nhacungcap'
      tp: r.partner,
      tpId: r.partnerId || null,
      congtrinh: r.pid === 'COMPANY' ? r.ctName : (r.ctName || ''),
      projectId: r.pid || null,
      tien: r.con,                         // đúng bằng số còn phải trả → số dư về 0
      nd: `Tất toán công nợ (${user})`,
      autoSettle: true,                    // cờ nhận diện phiếu tự sinh
      settleId,                            // mã lần tất toán — để Hoàn tác / Hủy cả lô
      settledBy: user,
    };
    // Gắn lại id danh mục theo tên (phòng khi partnerId trống) — giữ liên kết khi đổi tên đối tác
    if (!rec.tpId && typeof stampCatIds === 'function') stampCatIds(rec, 'ung');
    ungRecords.unshift(mkRecord(rec));
  });
  save('ung_v1', ungRecords);

  // Hiệu ứng: dòng đã tất toán chuyển xanh rồi mờ dần trước khi biến mất
  idxs.forEach(i => {
    const tr = document.getElementById('tt-row-' + i);
    if (tr) { tr.style.background = 'var(--bs-success-bg-subtle)'; tr.style.opacity = '0'; }
  });
  setTimeout(() => { ttRender(); _ttRefreshOtherTabs(); }, 400);

  toast(`✅ Đã tất toán ${rows.length} dòng — ${fmtM(total)}`, 'success');
  _ttShowUndo(settleId, `✅ Đã tất toán ${rows.length} dòng · ${fmtM(total)}`);
}

// ── Thanh Hoàn tác (15 giây) ──
function _ttShowUndo(settleId, msg) {
  _ttLastSettleId = settleId;
  const bar = document.getElementById('tt-undo-bar');
  const m = document.getElementById('tt-undo-msg');
  if (m) m.textContent = msg;
  if (bar) bar.style.display = 'flex';
  clearTimeout(_ttUndoTimer);
  _ttUndoTimer = setTimeout(_ttHideUndo, 15000);
}
function _ttHideUndo() {
  const bar = document.getElementById('tt-undo-bar');
  if (bar) bar.style.display = 'none';
  _ttLastSettleId = null;
}
function ttUndoLast() {
  if (!_ttLastSettleId) return;
  _ttRemoveBatch(_ttLastSettleId);
  _ttHideUndo();
  toast('↩ Đã hoàn tác lần tất toán vừa rồi', 'success');
}

// ── Hủy 1 lần tất toán từ bảng lịch sử ──
function ttCancelBatch(settleId) {
  if (!_qtCanEdit()) { toast('Chỉ Quản trị viên hoặc Giám đốc được hủy tất toán', 'error'); return; }
  const b = _ttBatches().find(x => x.id === settleId);
  if (!b) return;
  if (!confirm(`Hủy lần tất toán ngày ${fmtISODate(b.ngay)} (${b.recs.length} phiếu, ${fmtM(b.total)})?\n\nCác phiếu ứng tự sinh sẽ bị xóa → công nợ quay lại như trước.`)) return;
  _ttRemoveBatch(settleId);
  if (_ttLastSettleId === settleId) _ttHideUndo();
  toast('Đã hủy lần tất toán', 'success');
}

// Xóa mềm mọi phiếu ứng thuộc 1 lần tất toán (vào thùng rác như phiếu thường)
function _ttRemoveBatch(settleId) {
  const now = Date.now();
  const user = getCurrentUser()?.username || 'Không rõ';
  const dev = (typeof DEVICE_ID !== 'undefined') ? DEVICE_ID : '';
  let n = 0;
  ungRecords.forEach((r, i) => {
    if (r.settleId !== settleId || r.deletedAt) return;
    n++;
    ungRecords[i] = { ...r, deletedAt: now, updatedAt: now, deviceId: dev, deletedBy: user };
  });
  if (n) save('ung_v1', ungRecords);
  ttRender();
  _ttRefreshOtherTabs();
}

// ── Vẽ lại tab Công Nợ (an toàn nếu tab chưa mở) ──
function _ttRefreshOtherTabs() {
  if (typeof cnRenderTable === 'function') cnRenderTable();
}

// Cấp ra global (gọi từ onclick trong HTML)
window.initTatToan       = initTatToan;
window.ttRender          = ttRender;
window.ttApplyFilters    = ttApplyFilters;
window.ttToggleAll       = ttToggleAll;
window.ttUpdateBulkBtn   = ttUpdateBulkBtn;
window.ttSettleOne       = ttSettleOne;
window.ttSettleSelected  = ttSettleSelected;
window.ttUndoLast        = ttUndoLast;
window.ttCancelBatch     = ttCancelBatch;
