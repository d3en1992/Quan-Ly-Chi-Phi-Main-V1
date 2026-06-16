// doanhthu.congno.js — Page CÔNG NỢ (tab chính độc lập)
// Load order: sau doanhthu.reports-export.js
//
// Tổng hợp công nợ Thầu Phụ + Nhà Cung Cấp vào MỘT bảng trực quan:
//   - Thẻ KPI tổng quan (nợ TP, nợ NCC, đã ứng)
//   - Bộ lọc nâng cao: công trình, nhóm đối tác, tháng (chỉ tháng có dữ liệu), tìm kiếm
//   - Bảng chi tiết: thanh tiến độ % đã ứng + badge trạng thái màu
//   - CHỈ hiển thị đối tác đã có phát sinh tiền ứng (Đã Ứng > 0); thẻ KPI
//     tính trên cùng tập dòng này nên luôn đồng bộ với bảng.
//
// Nguồn dữ liệu (đều là biến global đã nạp trước):
//   - thauPhuContracts (thauphu_v1) : giá trị HĐ thầu phụ
//   - ungRecords       (ung_v1)     : tiền ứng (loai='thauphu' / 'nhacungcap')
//   - invoices/cache   (inv_v3)     : tổng tiền hóa đơn theo nhà cung cấp

// ─── State bộ lọc Công Nợ ─────────────────────────────────────
let _cnCt     = '';   // tên công trình ('' = tất cả)
let _cnGroup  = '';   // 'thauphu' | 'nhacungcap' | '' (tất cả)
let _cnMonth  = '';   // 'yyyy-mm' ('' = tất cả tháng)
let _cnSearch = '';   // tìm theo tên đối tác

// ─── Helpers lọc ──────────────────────────────────────────────

// Record có thuộc tháng đang lọc không (so khớp 'yyyy-mm')
function _cnInMonth(ngay) {
  if (!_cnMonth) return true;         // không lọc tháng → nhận tất cả
  if (!ngay) return false;            // có lọc tháng nhưng record không có ngày → loại
  return ngay.slice(0, 7) === _cnMonth;
}

// Record có khớp công trình đang lọc không
function _cnMatchCt(record) {
  if (!_cnCt) return true;
  if (record.projectId) {
    const proj = getAllProjects().find(p => p.name === _cnCt);
    if (proj) return record.projectId === proj.id;
  }
  return (record.congtrinh || '') === _cnCt;
}

// ─── Dựng danh sách dòng công nợ (đã áp CT + tháng) ───────────
// Trả về: [{ partner, group, congtrinh, value, daUng, conPhaiTT }]
// Chỉ gồm đối tác có tiền ứng > 0.
function _cnBuildRows() {
  const map = {}; // key = group|||partner|||ct
  const _key = (group, partner, ct) => group + '|||' + partner + '|||' + ct;
  const _ensure = (group, partner, ct) => {
    const k = _key(group, partner, ct);
    if (!map[k]) map[k] = { group, partner, congtrinh: ct, value: 0, daUng: 0 };
    return map[k];
  };

  // ── THẦU PHỤ: giá trị HĐ ──
  thauPhuContracts
    .filter(r => !r.deletedAt && inActiveYear(r.ngay) && _cnInMonth(r.ngay) && _cnMatchCt(r))
    .forEach(r => {
      const partner = recCatName(r, 'thauphu', 'thauphu') || '(Không rõ)';
      const ct = _resolveCtName(r) || '—';
      _ensure('thauphu', partner, ct).value += (r.giaTri || 0) + (r.phatSinh || 0);
    });

  // ── THẦU PHỤ: tiền đã ứng ──
  ungRecords
    .filter(r => r.loai === 'thauphu' && !r.deletedAt && inActiveYear(r.ngay) && _cnInMonth(r.ngay) && _cnMatchCt(r))
    .forEach(r => {
      const partner = recCatName(r, 'ung', 'tp') || '(Không rõ)';
      const ct = _resolveCtName(r) || '—';
      _ensure('thauphu', partner, ct).daUng += (r.tien || 0);
    });

  // ── NHÀ CUNG CẤP: tổng tiền hóa đơn ──
  getInvoicesCached()
    .filter(inv => !inv.deletedAt && inActiveYear(inv.ngay) && _cnInMonth(inv.ngay) && _cnMatchCt(inv))
    .forEach(inv => {
      const partner = (recCatName(inv, 'inv', 'ncc') || '').trim();
      if (!partner) return; // hóa đơn không có NCC → bỏ qua
      const ct = _resolveCtName(inv) || '—';
      _ensure('nhacungcap', partner, ct).value += (inv.thanhtien || inv.tien || 0);
    });

  // ── NHÀ CUNG CẤP: tiền đã ứng ──
  ungRecords
    .filter(r => r.loai === 'nhacungcap' && !r.deletedAt && inActiveYear(r.ngay) && _cnInMonth(r.ngay) && _cnMatchCt(r))
    .forEach(r => {
      const partner = recCatName(r, 'ung', 'tp') || '(Không rõ)';
      const ct = _resolveCtName(r) || '—';
      _ensure('nhacungcap', partner, ct).daUng += (r.tien || 0);
    });

  return Object.values(map)
    .map(row => ({ ...row, conPhaiTT: (row.value || 0) - (row.daUng || 0) }))
    // CHỈ giữ đối tác đã có phát sinh TIỀN ỨNG (cột Đã Ứng > 0).
    // → Bảng + thẻ KPI đều dựa trên tập này nên luôn đồng bộ số liệu.
    .filter(row => (row.daUng || 0) > 0);
}

// ─── Badge trạng thái theo số tiền còn phải TT ────────────────
function _cnStatusBadge(row) {
  const { value, daUng, conPhaiTT } = row;
  if (conPhaiTT < 0) return '<span class="badge bg-info text-dark" style="font-size:11px">↑ Ứng dư</span>';
  if (conPhaiTT === 0) return '<span class="badge bg-success" style="font-size:11px">✅ Đã xong</span>';
  // Còn nợ: đánh giá theo tỉ lệ đã thanh toán
  const paidPct = value > 0 ? daUng / value : 0;
  if (paidPct >= 0.5) return '<span class="badge bg-warning text-dark" style="font-size:11px">● Đang nợ</span>';
  return '<span class="badge bg-danger" style="font-size:11px">⚠ Nợ lớn</span>';
}

// ─── Thanh tiến độ % đã ứng ───────────────────────────────────
function _cnProgressBar(row) {
  const { value, daUng } = row;
  let pct = value > 0 ? Math.round((daUng / value) * 100) : (daUng > 0 ? 100 : 0);
  if (pct < 0) pct = 0;
  const barPct = Math.min(100, pct);
  const barColor = pct >= 100 ? '#198754' : (pct >= 50 ? '#0d6efd' : '#fd7e14');
  return `<div style="display:flex;align-items:center;gap:6px">
    <div style="flex:1;height:8px;background:var(--bs-tertiary-bg);border-radius:4px;overflow:hidden;min-width:60px">
      <div style="height:100%;width:${barPct}%;background:${barColor};border-radius:4px"></div>
    </div>
    <span style="font-size:11px;font-weight:600;white-space:nowrap;min-width:34px;text-align:right">${pct}%</span>
  </div>`;
}

// ─── Nhãn nhóm đối tác ────────────────────────────────────────
function _cnGroupBadge(group) {
  return group === 'thauphu'
    ? '<span class="badge bg-primary-subtle text-primary" style="font-size:10px">Thầu Phụ</span>'
    : '<span class="badge bg-warning-subtle text-warning-emphasis" style="font-size:10px">NCC</span>';
}

// ─── Cập nhật thẻ KPI tổng quan ───────────────────────────────
// KPI tính trên cùng tập dòng của bảng (chỉ đối tác có Tiền Ứng > 0),
// phản ánh bộ lọc Công Trình + Tháng. KHÔNG giới hạn theo nhóm đối tác /
// tìm kiếm để 3 thẻ luôn cho cái nhìn tổng quan.
function _cnRenderKpis(allRows) {
  let noTP = 0, noNCC = 0, daUng = 0;
  allRows.forEach(r => {
    daUng += r.daUng || 0;
    if (r.conPhaiTT > 0) {
      if (r.group === 'thauphu') noTP += r.conPhaiTT;
      else noNCC += r.conPhaiTT;
    }
  });

  const set = (id, val, cls) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set('cn-kpi-no-tp',  noTP  ? fmtM(noTP)  : '0 đ');
  set('cn-kpi-no-ncc', noNCC ? fmtM(noNCC) : '0 đ');
  set('cn-kpi-da-ung', daUng ? fmtM(daUng) : '0 đ');

  // Dòng phụ: đếm số đối tác còn nợ
  const cntTP  = allRows.filter(r => r.group === 'thauphu'    && r.conPhaiTT > 0).length;
  const cntNCC = allRows.filter(r => r.group === 'nhacungcap' && r.conPhaiTT > 0).length;
  const subTP  = document.getElementById('cn-kpi-no-tp-sub');
  if (subTP)  subTP.textContent  = cntTP  ? `${cntTP} đối tác còn nợ` : 'Không còn nợ';
  const subNCC = document.getElementById('cn-kpi-no-ncc-sub');
  if (subNCC) subNCC.textContent = cntNCC ? `${cntNCC} nhà CC còn nợ` : 'Không còn nợ';
  const subUng = document.getElementById('cn-kpi-da-ung-sub');
  if (subUng) subUng.textContent = `${allRows.length} dòng công nợ`;
}

// ─── Render bảng chi tiết công nợ ─────────────────────────────
function cnRenderTable() {
  const tbody = document.getElementById('cn-tbody');
  const empty = document.getElementById('cn-empty');
  if (!tbody) return;

  const allRows = _cnBuildRows();
  _cnRenderKpis(allRows);

  // Áp nhóm đối tác + tìm kiếm cho bảng
  let rows = allRows;
  if (_cnGroup) rows = rows.filter(r => r.group === _cnGroup);
  if (_cnSearch) {
    const q = _cnSearch;
    rows = rows.filter(r => (r.partner || '').toLowerCase().includes(q));
  }

  // Sắp xếp: còn nợ nhiều nhất lên đầu
  rows.sort((a, b) => (b.conPhaiTT || 0) - (a.conPhaiTT || 0) ||
    a.partner.localeCompare(b.partner, 'vi'));

  if (!rows.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  let totValue = 0, totUng = 0, totCon = 0;

  tbody.innerHTML = rows.map(r => {
    totValue += r.value || 0;
    totUng   += r.daUng || 0;
    totCon   += r.conPhaiTT || 0;
    const conCls = r.conPhaiTT > 0 ? 'text-danger fw-bold'
      : (r.conPhaiTT < 0 ? 'text-info' : 'text-secondary');
    return `<tr>
      <td style="font-weight:600;white-space:nowrap">${x(r.partner)}</td>
      <td style="text-align:center">${_cnGroupBadge(r.group)}</td>
      <td style="white-space:nowrap">${x(r.congtrinh || '—')}</td>
      <td class="text-end font-monospace" style="white-space:nowrap">${r.value ? fmtS(r.value) : '<span class="text-secondary">—</span>'}</td>
      <td class="text-end font-monospace text-success" style="white-space:nowrap">${r.daUng ? fmtS(r.daUng) : '<span class="text-secondary">—</span>'}</td>
      <td style="min-width:160px">${_cnProgressBar(r)}</td>
      <td class="text-end font-monospace ${conCls}" style="white-space:nowrap">${fmtS(r.conPhaiTT)}</td>
      <td style="text-align:center;white-space:nowrap">${_cnStatusBadge(r)}</td>
    </tr>`;
  }).join('');

  // Dòng tổng cộng
  tbody.innerHTML += `<tr style="border-top:2px solid var(--bs-border-color);font-weight:700;background:var(--bs-tertiary-bg)">
    <td colspan="3" class="text-secondary" style="padding:8px 12px">Tổng cộng (${rows.length} dòng)</td>
    <td class="text-end font-monospace" style="white-space:nowrap">${fmtS(totValue)}</td>
    <td class="text-end font-monospace text-success" style="white-space:nowrap">${fmtS(totUng)}</td>
    <td></td>
    <td class="text-end font-monospace ${totCon > 0 ? 'text-danger' : ''}" style="white-space:nowrap">${fmtS(totCon)}</td>
    <td></td>
  </tr>`;
}

// ─── Đọc bộ lọc từ UI rồi render lại ──────────────────────────
function cnApplyFilters() {
  _cnCt     = document.getElementById('cn-filter-ct')?.value || '';
  _cnGroup  = document.getElementById('cn-filter-group')?.value || '';
  _cnMonth  = document.getElementById('cn-filter-month')?.value || '';
  _cnSearch = (document.getElementById('cn-filter-search')?.value || '').trim().toLowerCase();
  cnRenderTable();
}

// ─── Đặt lại toàn bộ bộ lọc ───────────────────────────────────
function cnResetFilters() {
  _cnCt = ''; _cnGroup = ''; _cnMonth = ''; _cnSearch = '';
  const ids = ['cn-filter-group','cn-filter-month','cn-filter-search'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  cnPopulateCtFilter();
  cnPopulateMonthFilter();
  cnRenderTable();
}

// ─── Populate dropdown Công Trình ─────────────────────────────
function cnPopulateCtFilter() {
  const sel = document.getElementById('cn-filter-ct');
  if (sel) sel.innerHTML = _buildProjFilterOpts(_cnCt, { includeCompany: false, placeholder: '-- Tất cả công trình --' });
}

// ─── Populate dropdown Tháng — chỉ liệt kê tháng CÓ phát sinh tiền ứng ──
// Nguồn: ungRecords (loai thauphu/nhacungcap) trong năm đang chọn. Mỗi tháng
// trong danh sách đều đảm bảo có dữ liệu để hiển thị (bảng dựa trên tiền ứng).
function cnPopulateMonthFilter() {
  const sel = document.getElementById('cn-filter-month');
  if (!sel) return;

  const months = new Set();
  (typeof ungRecords !== 'undefined' ? ungRecords : []).forEach(r => {
    if (r.deletedAt) return;
    if (r.loai !== 'thauphu' && r.loai !== 'nhacungcap') return;
    if (!r.ngay || !inActiveYear(r.ngay)) return;
    months.add(r.ngay.slice(0, 7)); // 'yyyy-mm'
  });

  // Sắp xếp giảm dần (tháng mới nhất lên đầu)
  const sorted = Array.from(months).sort((a, b) => b.localeCompare(a));

  // Nếu tháng đang chọn không còn dữ liệu → bỏ chọn
  if (_cnMonth && !months.has(_cnMonth)) _cnMonth = '';

  const _label = (ym) => {
    const [y, m] = ym.split('-');
    return `Tháng ${parseInt(m, 10)}/${y}`;
  };
  sel.innerHTML = '<option value="">-- Tất cả tháng --</option>' +
    sorted.map(ym => `<option value="${ym}" ${ym === _cnMonth ? 'selected' : ''}>${_label(ym)}</option>`).join('');
}

// ─── Init page Công Nợ (gọi từ goPage / renderActiveTab) ──────
function initCongNo() {
  // goPage()/renderActiveTab() đã gọi _reloadGlobals() (refresh invoices, ungRecords,
  // hopDongData, thauPhuContracts...). Vẫn reload phòng trường hợp gọi trực tiếp.
  hopDongData      = load('hopdong_v1', {});
  thauPhuContracts = load('thauphu_v1', []);

  cnPopulateCtFilter();
  cnPopulateMonthFilter();
  cnRenderTable();
}

// Cấp ra global
window.initCongNo    = initCongNo;
window.cnApplyFilters = cnApplyFilters;
window.cnResetFilters = cnResetFilters;
