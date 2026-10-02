// quyettoan.thauphu.js — Tab QUYẾT TOÁN · Phân hệ 2B: TẤT TOÁN Thầu Phụ / Nhà Cung Cấp
// Load order: sau quyettoan.congtrinh.js, trước thungrac.js
//
// Mục tiêu: dọn nhanh các khoản nợ treo với đối tác mà KHÔNG cần sang tab Ứng TP/NCC gõ phiếu.
//
// CÁCH HOẠT ĐỘNG:
//   • NGUỒN ĐỐI TÁC chỉ gồm 2 nhóm: (1) đã có ≥ 1 phiếu Ứng TP/NCC, (2) đã có HĐ thầu phụ
//     (dù chưa ứng lần nào). Đối tác vãng lai chỉ có hóa đơn → "tiền trao cháo múc",
//     coi như đã trả đứt lúc mua → không bao giờ hiện ở đây.
//   • THEO NĂM ĐANG LỌC: chỉ hiện các cặp (Đối tác × Công trình) có CÔNG TRÌNH thuộc năm đang chọn
//     (qtCtInYear) và còn nợ > CN_DONE_TOLERANCE (100.000đ). KHÔNG tự tải các năm khác.
//     Số dư của mỗi cặp cộng MỌI phát sinh đang có trong máy (không cắt theo năm) để tránh
//     tất toán TRẢ DƯ khi HĐ ký năm trước nhưng ứng năm nay; popup cảnh báo nếu máy thiếu năm nào.
//     Nguồn số liệu (giống tab Công Nợ):
//       Thầu phụ: Giá trị = Σ HĐ thầu phụ (giaTri + phatSinh) · Đã ứng = Σ phiếu ứng loai='thauphu'
//       NCC     : Giá trị = Σ hóa đơn có NCC đó             · Đã ứng = Σ phiếu ứng loai='nhacungcap'
//   • Bấm "Tất toán toàn bộ" (1 dòng) hoặc tick checkbox nhiều dòng → "Tất toán các dòng đã chọn"
//     → Bootstrap Modal xác nhận (chọn ngày phiếu) → OK → mỗi dòng tạo 1 PHIẾU ỨNG thật (ung_v1)
//     đúng bằng số còn phải trả → các dòng mờ dần rồi bị xóa khỏi DOM.
//     → Đã ứng = Giá trị, Còn phải TT = 0 → dòng tự biến mất; tab Công Nợ / Ứng TP/NCC tự nhảy số.
//   • Phiếu tự sinh gắn cờ: autoSettle:true, settleId (mã của LẦN tất toán), settledBy (tài khoản),
//     nguoi (Người TH chọn trong popup). Phiếu này CHỈ XEM ở tab Ứng TP/NCC (không sửa/xóa lẻ).
//     → Hoàn tác / Hủy = xóa mềm mọi phiếu cùng settleId (vào thùng rác như phiếu thường).
//   • Quyền: chỉ Admin + Giám đốc (_qtCanEdit — quyettoan.congtrinh.js).

// ─── State ─────────────────────────────────────────────────────
let _ttGroup  = '';     // 'thauphu' | 'nhacungcap' | ''
let _ttCtKey  = '';     // khóa công trình đang lọc ('' = tất cả)
let _ttSearch = '';     // tìm theo tên đối tác (chữ thường)
let _ttRowsCache = [];  // các dòng đang hiển thị (để tra cứu khi bấm nút theo chỉ số)
let _ttLastSettleId = null;   // lần tất toán gần nhất (cho nút Hoàn tác)
let _ttUndoTimer = null;
let _ttPending = null;        // các dòng đang chờ xác nhận trong modal: { keys: [...], idxs: [...] }

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

  // ── NGUỒN ĐỐI TÁC (02/10/2026) — chỉ 2 nhóm được theo dõi công nợ & tất toán:
  //   (1) Đối tác ĐÃ có ≥ 1 phiếu Ứng TP/NCC (bất kỳ công trình, bất kỳ năm)
  //   (2) Thầu phụ ĐÃ có HĐ thầu phụ (dù chưa ứng lần nào)
  // Đối tác còn lại (hóa đơn mua lẻ, xe ba gác, quang đá...) = "tiền trao cháo múc":
  // hóa đơn coi như đã trả đứt lúc mua → KHÔNG BAO GIỜ hiện ở đây.
  // Khóa so khớp = nhóm + tên đối tác (không phân biệt hoa/thường).
  const tracked = new Set();
  (typeof thauPhuContracts !== 'undefined' ? thauPhuContracts : [])
    .filter(r => !r.deletedAt)
    .forEach(r => {
      const partner = (recCatName(r, 'thauphu', 'thauphu') || '').trim().toLowerCase();
      if (partner) tracked.add('thauphu|||' + partner);
    });
  (typeof ungRecords !== 'undefined' ? ungRecords : [])
    .filter(r => !r.deletedAt && (r.loai === 'thauphu' || r.loai === 'nhacungcap'))
    .forEach(r => {
      const partner = (recCatName(r, 'ung', 'tp') || '').trim().toLowerCase();
      if (partner) tracked.add(r.loai + '|||' + partner);
    });

  const tol = _ttTolerance();
  return Object.values(map)
    .filter(r => tracked.has(r.group + '|||' + r.partner.toLowerCase()))
    // Chỉ công trình thuộc năm đang lọc (CÔNG TY luôn có mặt)
    .filter(r => r.pid === 'COMPANY' || qtCtInYear(r.ctName))
    .map(r => ({ ...r, con: (r.value || 0) - (r.daUng || 0) }))
    .filter(r => r.con > tol);    // chỉ giữ dòng còn nợ THẬT: Giá trị > Đã ứng (bỏ dòng đã xong / ứng dư)
}

// ── Các phiếu ứng do tất toán sinh ra, gom theo từng LẦN tất toán (settleId) ──
function _ttBatches() {
  const by = {};
  (typeof ungRecords !== 'undefined' ? ungRecords : [])
    .filter(r => r.autoSettle && r.settleId && !r.deletedAt)
    .forEach(r => {
      const b = by[r.settleId] || (by[r.settleId] = { id: r.settleId, ngay: r.ngay, by: r.nguoi || r.settledBy || '', ts: r.createdAt || 0, recs: [], total: 0 });
      b.recs.push(r);
      b.total += r.tien || 0;
      if ((r.createdAt || 0) > b.ts) b.ts = r.createdAt || 0;
    });
  return Object.values(by).sort((a, b) => b.ts - a.ts);
}

// ══ KHỞI TẠO / VẼ ════════════════════════════════════════════════
function initTatToan() {
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

  if (!rows.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
  } else {
    if (empty) empty.style.display = 'none';
    const canEdit = _qtCanEdit();
    let tot = 0;
    tbody.innerHTML = rows.map((r, i) => {
      tot += r.con;
      const pct = r.value > 0 ? Math.min(100, Math.round(r.daUng / r.value * 100)) : 0;
      return `<tr id="tt-row-${i}" style="transition:opacity .4s ease, background .4s ease">
        <td style="text-align:center"><input type="checkbox" class="form-check-input tt-row-chk" data-i="${i}" onchange="ttUpdateBulkBtn()" ${canEdit ? '' : 'disabled'}></td>
        <td style="white-space:nowrap"><div style="font-weight:600">${x(r.partner)}</div>${_cnGroupBadge(r.group)}</td>
        <td style="white-space:nowrap">${x(r.ctName || '—')}</td>
        <td class="text-end font-monospace" style="white-space:nowrap">${r.value ? fmtS(r.value) : '<span class="text-secondary">—</span>'}</td>
        <td class="text-end font-monospace text-success" style="white-space:nowrap">${r.daUng ? fmtS(r.daUng) : '0'} <span class="text-secondary" style="font-size:10px">(${pct}%)</span></td>
        <td class="text-end font-monospace fw-bold text-danger" style="white-space:nowrap">${fmtM(r.con)}</td>
        <td style="text-align:center;white-space:nowrap">
          ${canEdit ? `<button class="btn btn-sm btn-success fw-semibold" onclick="ttSettleOne(${i})">✔️ Tất toán toàn bộ</button>` : ''}
        </td>
      </tr>`;
    }).join('') + `<tr id="tt-total-row" style="border-top:2px solid var(--bs-border-color);font-weight:700;background:var(--bs-tertiary-bg)">
        <td colspan="5" class="text-secondary" style="padding:8px 12px">Tổng còn phải trả (${rows.length} dòng)</td>
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

// ══ TẤT TOÁN — 1 dòng (nút trên dòng) hoặc nhiều dòng (checkbox) + Bootstrap Modal ══

// ── Checkbox: chọn tất cả / đếm dòng đã chọn / cập nhật nút tất toán hàng loạt ──
function ttToggleAll(checked) {
  document.querySelectorAll('.tt-row-chk:not(:disabled)').forEach(c => { c.checked = checked; });
  ttUpdateBulkBtn();
}
function _ttCheckedIdx() {
  return [...document.querySelectorAll('.tt-row-chk:checked')].map(c => +c.dataset.i).filter(i => _ttRowsCache[i]);
}
function ttUpdateBulkBtn() {
  const btn = document.getElementById('tt-bulk-btn');
  const lb  = document.getElementById('tt-bulk-label');
  const idx = _ttCheckedIdx();
  const tot = idx.reduce((s, i) => s + _ttRowsCache[i].con, 0);
  if (btn) btn.disabled = !idx.length;
  if (lb) lb.textContent = idx.length ? `Tất toán ${idx.length} dòng đã chọn — ${fmtM(tot)}` : 'Tất toán các dòng đã chọn';
}

// Nút "✔️ Tất toán toàn bộ" trên 1 dòng
function ttSettleOne(i) { _ttOpenConfirm([i]); }
// Nút "Tất toán các dòng đã chọn" (hàng loạt)
function ttSettleSelected() {
  const idx = _ttCheckedIdx();
  if (idx.length) _ttOpenConfirm(idx);
}

// Mở modal xác nhận cho danh sách chỉ số dòng
function _ttOpenConfirm(idxs) {
  const rows = idxs.map(i => _ttRowsCache[i]).filter(Boolean);
  if (!rows.length) return;
  if (!_qtCanEdit()) { toast('Chỉ Quản trị viên hoặc Giám đốc được tất toán', 'error'); return; }
  _ttPending = { keys: rows.map(r => r.key), idxs };
  const total = rows.reduce((s, r) => s + r.con, 0);
  const m = _ttEnsureModal();
  if (rows.length === 1) {
    const r = rows[0];
    m.querySelector('#tt-cm-msg').innerHTML =
      `Xác nhận tạo phiếu chi thanh toán nốt <strong class="text-danger font-monospace">${fmtM(r.con)}</strong> cho <strong>${x(r.partner)}</strong>?`;
    m.querySelector('#tt-cm-detail').innerHTML =
      `Công trình: <strong>${x(r.ctName || 'không gắn công trình')}</strong><br>` +
      `Giá trị ${fmtM(r.value)} · Đã ứng ${fmtM(r.daUng)} → sau khi tất toán: Còn phải TT = 0`;
  } else {
    // Nhiều dòng: liệt kê tối đa 8 dòng, còn lại ghi "+N dòng khác"
    const list = rows.slice(0, 8).map(r =>
      `<li><strong>${x(r.partner)}</strong> — ${x(r.ctName || 'không gắn CT')}: <span class="font-monospace">${fmtM(r.con)}</span></li>`).join('');
    m.querySelector('#tt-cm-msg').innerHTML =
      `Xác nhận tạo <strong>${rows.length} phiếu chi</strong>, tổng <strong class="text-danger font-monospace">${fmtM(total)}</strong>?`;
    m.querySelector('#tt-cm-detail').innerHTML =
      `<ul class="mb-0 ps-3">${list}</ul>` + (rows.length > 8 ? `<div class="mt-1">+${rows.length - 8} dòng khác</div>` : '');
  }
  // Máy chưa có dữ liệu năm nào đó → số dư có thể thiếu (phiếu ứng / hóa đơn năm đó chưa tải)
  const miss = (typeof qtMissingYears === 'function') ? qtMissingYears() : [];
  m.querySelector('#tt-cm-warn').innerHTML = miss.length
    ? `<div class="alert alert-warning py-1 px-2 mb-2" style="font-size:12px">⚠ Máy chưa tải dữ liệu năm <strong>${miss.join(', ')}</strong>. Nếu đối tác có phát sinh ở năm đó, số còn phải trả có thể chưa đúng — hãy chọn năm đó (hoặc "Tất cả năm") ở thanh trên để tải trước khi tất toán.</div>`
    : '';
  m.querySelector('#tt-cm-ngay').value = today();
  // Người TH: lấy từ Danh mục "Người thực hiện"; chọn sẵn người đã chọn lần trước (nhớ trên máy này)
  const nguoiSel = m.querySelector('#tt-cm-nguoi');
  const allNguoi = [...new Set([...((typeof cats !== 'undefined' && cats.nguoiTH) || [])].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  nguoiSel.innerHTML = '<option value="">-- Chọn --</option>' + allNguoi.map(v => `<option value="${x(v)}">${x(v)}</option>`).join('');
  const last = ttLastNguoi();
  if (last && allNguoi.includes(last)) nguoiSel.value = last;
  bootstrap.Modal.getOrCreateInstance(m).show();
}

// Người TH đã chọn ở lần tất toán trước trên máy này ('' nếu chưa có / bộ nhớ bị chặn)
function ttLastNguoi() {
  try { return localStorage.getItem('tt_last_nguoi') || ''; } catch (e) { return ''; }
}

// Tạo modal 1 lần và gắn vào <body> — để không bị ẩn theo .page / .sub-page đang display:none
function _ttEnsureModal() {
  let m = document.getElementById('tt-confirm-modal');
  if (m) return m;
  m = document.createElement('div');
  m.className = 'modal fade';
  m.id = 'tt-confirm-modal';
  m.tabIndex = -1;
  m.setAttribute('aria-hidden', 'true');
  m.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header py-2">
          <h5 class="modal-title" style="font-size:16px">✔️ Xác nhận tất toán</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button>
        </div>
        <div class="modal-body">
          <p id="tt-cm-msg" class="mb-2" style="font-size:14px"></p>
          <div id="tt-cm-detail" class="text-secondary mb-3" style="font-size:12px"></div>
          <div id="tt-cm-warn"></div>
          <div class="row g-2">
            <div class="col-12 col-sm-5">
              <label for="tt-cm-ngay" class="form-label mb-1" style="font-size:12px;font-weight:600">Ngày phiếu chi</label>
              <input type="date" id="tt-cm-ngay" class="form-control form-control-sm">
            </div>
            <div class="col-12 col-sm-7">
              <label for="tt-cm-nguoi" class="form-label mb-1" style="font-size:12px;font-weight:600">Người TH *</label>
              <select id="tt-cm-nguoi" class="form-select form-select-sm"><option value="">-- Chọn --</option></select>
            </div>
          </div>
          <div class="text-secondary mt-2" style="font-size:11px">Phiếu tự sinh nằm ở tab Ứng TP/NCC. Có thể Hoàn tác ngay sau khi tạo.</div>
        </div>
        <div class="modal-footer py-2">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Hủy</button>
          <button type="button" class="btn btn-success fw-bold" id="tt-cm-ok">OK — Tạo phiếu chi</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.querySelector('#tt-cm-ok').addEventListener('click', _ttConfirmOk);
  m.addEventListener('hidden.bs.modal', () => { _ttPending = null; });
  return m;
}

// Bấm OK trong modal → tạo phiếu → các dòng mờ dần rồi bị xóa khỏi DOM → vẽ lại tổng/KPI
function _ttConfirmOk() {
  const pend = _ttPending;
  const m = document.getElementById('tt-confirm-modal');
  if (!pend) return;
  const ngay = m?.querySelector('#tt-cm-ngay')?.value || '';
  if (!ngay) { toast('Vui lòng chọn Ngày phiếu chi!', 'error'); return; }
  const nguoi = m?.querySelector('#tt-cm-nguoi')?.value || '';
  if (!nguoi) { toast('Vui lòng chọn Người TH!', 'error'); return; }
  try { localStorage.setItem('tt_last_nguoi', nguoi); } catch (e) {}
  // Tính lại số dư ngay lúc bấm OK (phòng dữ liệu vừa đổi do đồng bộ)
  const keySet = new Set(pend.keys);
  const fresh = _ttBuildRows().filter(r => keySet.has(r.key));
  bootstrap.Modal.getOrCreateInstance(m).hide();
  if (!fresh.length) { toast('Các dòng đã chọn đều đã hết nợ', 'info'); ttRender(); return; }

  const settleId = ttCreatePhieu(fresh, ngay, nguoi);
  const total = fresh.reduce((s, r) => s + r.con, 0);

  // Hiệu ứng: dòng chuyển xanh → mờ dần → xóa khỏi DOM, sau đó vẽ lại tổng + KPI
  const trs = pend.idxs.map(i => document.getElementById('tt-row-' + i)).filter(Boolean);
  trs.forEach(tr => { tr.style.background = 'var(--bs-success-bg-subtle)'; tr.style.opacity = '0'; });
  setTimeout(() => {
    trs.forEach(tr => { if (tr.parentNode) tr.parentNode.removeChild(tr); });
    ttRender();
    _ttRefreshOtherTabs();
  }, 450);

  const label = fresh.length === 1 ? fresh[0].partner : `${fresh.length} dòng`;
  toast(`✅ Đã tất toán ${label} — ${fmtM(total)}`, 'success');
  _ttShowUndo(settleId, `✅ Đã tất toán ${label} · ${fmtM(total)}`);
}

// ── LÕI: tạo phiếu ứng tất toán cho các dòng (KHÔNG hỏi, KHÔNG đụng giao diện) ──
// Dùng chung cho desktop (_ttConfirmOk) và điện thoại (mobile.actions.js → ttSettleMb).
// Trả về settleId của lần tất toán (để Hoàn tác).
// nguoi: Người TH (tên người thực tế chi tiền) — ghi vào nội dung phiếu; trống → dùng tên tài khoản.
function ttCreatePhieu(rows, ngay, nguoi) {
  const user = getCurrentUser()?.username || 'Không rõ';
  nguoi = (nguoi || '').trim();
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
      nd: `Tất toán công nợ (${nguoi || user})`,
      nguoi,                               // Người TH chọn trong popup
      autoSettle: true,                    // cờ nhận diện phiếu tự sinh
      settleId,                            // mã lần tất toán — để Hoàn tác / Hủy cả lô
      settledBy: user,                     // tài khoản đăng nhập thực hiện thao tác
    };
    // Gắn lại id danh mục theo tên (phòng khi partnerId trống) — giữ liên kết khi đổi tên đối tác
    if (!rec.tpId && typeof stampCatIds === 'function') stampCatIds(rec, 'ung');
    ungRecords.unshift(mkRecord(rec));
  });
  save('ung_v1', ungRecords);
  return settleId;
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
// (Điện thoại cũng gọi hàm này qua ttRemoveBatch.)
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
window.ttSettleOne       = ttSettleOne;
window.ttSettleSelected  = ttSettleSelected;
window.ttToggleAll       = ttToggleAll;
window.ttUpdateBulkBtn   = ttUpdateBulkBtn;
window.ttUndoLast        = ttUndoLast;
window.ttCancelBatch     = ttCancelBatch;
window.ttCreatePhieu     = ttCreatePhieu;
window.ttLastNguoi       = ttLastNguoi;
window.ttBuildRows       = _ttBuildRows;
window.ttBatches         = _ttBatches;
window.ttRemoveBatch     = _ttRemoveBatch;
