// doanhthu.reports-export.js — Công nợ, Lãi/Lỗ, initDoanhThu, copy/paste KLCT, xuất phiếu ảnh
// Load order: sau doanhthu.forms.js

// ══ BẢNG CÔNG NỢ (LEGACY — KHÔNG CÒN DÙNG) ═══════════════════
// [DEPRECATED 16/06/2026] Công Nợ đã tách thành tab chính độc lập
// (page-congno) với UI mới — xem js/modules/doanhthu/doanhthu.congno.js.
// Các hàm dưới trỏ tới #congno-tbody / #congno-ncc-tbody không còn tồn tại
// trong DOM nên tự early-return; giữ lại tạm để tham chiếu, sẽ dọn sau.

// ── Render bảng Công Nợ Thầu Phụ (legacy) ────────────────────
function renderCongNoThauPhu() {
  const tbody = document.getElementById('congno-tbody');
  const empty = document.getElementById('congno-empty');
  if (!tbody) return;

  // Gom nhóm theo key (thauphu ||| congtrinh)
  const map = {}; // key → { thauphu, congtrinh, tongUng, count, tongHD }

  // Nguồn 1: tiền ứng thầu phụ (ungRecords loai='thauphu')
  ungRecords
    .filter(r =>
      r.loai === 'thauphu' &&
      !r.deletedAt &&
      inActiveYear(r.ngay) &&
      _dtMatchCnProjFilter(r)
    )
    .forEach(r => {
      const ctDisplay = _resolveCtName(r);
      const tpName = recCatName(r, 'ung', 'tp');
      const key = tpName + '|||' + ctDisplay;
      if (!map[key]) map[key] = { thauphu: tpName, congtrinh: ctDisplay, tongUng: 0, count: 0, tongHD: 0 };
      map[key].tongUng += (r.tien || 0);
      map[key].count++;
    });

  // Nguồn 2: hợp đồng thầu phụ (thauPhuContracts)
  thauPhuContracts
    .filter(r => !r.deletedAt && _dtInYear(r.ngay) && _dtMatchCnProjFilter(r))
    .forEach(r => {
      const ctDisplay = _resolveCtName(r);
      const tpName = recCatName(r, 'thauphu', 'thauphu');
      const key = tpName + '|||' + ctDisplay;
      if (!map[key]) map[key] = { thauphu: tpName, congtrinh: ctDisplay, tongUng: 0, count: 0, tongHD: 0 };
      map[key].tongHD += (r.giaTri || 0) + (r.phatSinh || 0);
    });

  const rows = Object.values(map)
    .map(r => ({ ...r, name: r.thauphu }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi') || a.congtrinh.localeCompare(b.congtrinh, 'vi'));

  _renderCongNoTable(rows, tbody, empty);
}

function _renderCongNoTable(rows, tbody, empty) {
  if (!tbody) return;
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  let totUng = 0, totHD = 0, totConlai = 0;

  const dataRows = rows.map(row => {
    const conlai = (row.tongHD || 0) - (row.tongUng || 0);
    totUng    += row.tongUng || 0;
    totHD     += row.tongHD || 0;
    totConlai += conlai;
    const overdrawn    = (row.tongUng || 0) > (row.tongHD || 0) && (row.tongHD || 0) > 0;
    const conlaiClass  = overdrawn
      ? 'text-danger fw-bold'
      : (conlai === 0 ? 'text-secondary' : '');
    const countLabel   = row.count > 0
      ? `<span class="text-secondary" style="font-size:11px;margin-left:3px">(${row.count})</span>`
      : '';
    return `<tr>
      <td style="font-weight:600;white-space:nowrap">${x(row.name)}</td>
      <td style="white-space:nowrap">${x(row.congtrinh || '—')}</td>
      <td class="text-end font-monospace fw-semibold" style="white-space:nowrap;min-width:140px;font-size:14px">
        ${row.tongUng ? fmtS(row.tongUng) : '<span class="text-secondary">—</span>'}${countLabel}
      </td>
      <td class="text-end font-monospace fw-semibold" style="white-space:nowrap;min-width:140px;font-size:14px">
        ${row.tongHD ? fmtS(row.tongHD) : '<span class="text-secondary">—</span>'}
      </td>
      <td class="text-end font-monospace fw-semibold ${conlaiClass}" style="white-space:nowrap;min-width:140px;font-size:14px">
        ${fmtS(conlai)}
      </td>
    </tr>`;
  }).join('');

  const footerConlaiClass = totUng > totHD && totHD > 0 ? 'text-danger' : '';
  const footerRow = `<tr style="border-top:2px solid var(--bs-border-color);font-weight:700;background:var(--bs-tertiary-bg)">
    <td colspan="2" class="text-secondary" style="padding:8px 12px">Tổng cộng</td>
    <td class="text-end font-monospace" style="white-space:nowrap;padding:8px 10px;font-size:14px">${fmtS(totUng)}</td>
    <td class="text-end font-monospace" style="white-space:nowrap;padding:8px 10px;font-size:14px">${fmtS(totHD)}</td>
    <td class="text-end font-monospace ${footerConlaiClass}" style="white-space:nowrap;padding:8px 10px;font-size:14px">${fmtS(totConlai)}</td>
  </tr>`;

  tbody.innerHTML = dataRows + footerRow;
}

// ── Render bảng Công Nợ Nhà Cung Cấp ─────────────────────────
function renderCongNoNhaCungCap() {
  const tbody = document.getElementById('congno-ncc-tbody');
  const empty = document.getElementById('congno-ncc-empty');
  if (!tbody) return;

  const selProjId = (() => {
    if (!_dtCnCtFilter) return null;
    const p = getAllProjects().find(prj => prj.name === _dtCnCtFilter);
    return p ? p.id : null;
  })();

  const nccFromUng = new Set(
    ungRecords
      .filter(r =>
        r.loai === 'nhacungcap' &&
        !r.deletedAt &&
        inActiveYear(r.ngay)
      )
      .map(r => recCatName(r, 'ung', 'tp').trim())
      .filter(Boolean)
  );

  const nccList = (typeof cats !== 'undefined' && cats.nhaCungCap) ? cats.nhaCungCap : [];
  const rows = [];
  let totUng = 0, totTien = 0, totCon = 0;

  nccList
    .filter(ncc => nccFromUng.has(ncc))
    .forEach(ncc => {
    let tongUng = 0, tongTien = 0;
    const ctSet = new Set();

    ungRecords
      .filter(r =>
        r.loai === 'nhacungcap' &&
        recCatName(r, 'ung', 'tp') === ncc &&
        !r.deletedAt &&
        inActiveYear(r.ngay) &&
        (!selProjId || r.projectId === selProjId)
      )
      .forEach(r => { tongUng += (r.tien || 0); });

    getInvoicesCached()
      .filter(inv =>
        !inv.deletedAt &&
        inActiveYear(inv.ngay) &&
        recCatName(inv, 'inv', 'ncc') === ncc &&
        (!selProjId || inv.projectId === selProjId)
      )
      .forEach(inv => {
        const proj = inv.projectId ? getProjectById(inv.projectId) : null;
        if (proj && proj.status === 'closed') return;
        const amt = inv.thanhtien || inv.tien || 0;
        tongTien += amt;
      });

    ungRecords
      .filter(r =>
        r.loai === 'nhacungcap' &&
        recCatName(r, 'ung', 'tp') === ncc &&
        !r.deletedAt &&
        inActiveYear(r.ngay) &&
        (!selProjId || r.projectId === selProjId)
      )
      .forEach(r => {
        const proj = r.projectId ? getProjectById(r.projectId) : null;
        if (proj && proj.status === 'closed') return;
        const ctName = resolveProjectName(r) || ''; // [MODIFIED]
        if (ctName) ctSet.add(ctName);
      });

    if (tongUng === 0 && tongTien === 0 && ctSet.size === 0) return;

    const conPhaiTT = tongTien - tongUng;
    totUng += tongUng; totTien += tongTien; totCon += conPhaiTT;
    rows.push({
      name: ncc,
      congtrinh: Array.from(ctSet).join(', '),
      tongUng,
      tongHD: tongTien,
      conPhaiTT,
      count: 0
    });
    });

  rows.sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  _renderCongNoTable(rows, tbody, empty);
}

// ══ BẢNG LÃI/LỖ (Dashboard) ═══════════════════════════════════

// ── Render bảng Lãi/Lỗ trong Dashboard ───────────────────────
function renderLaiLo() {
  const wrap = document.getElementById('db-lailo-wrap');
  if (!wrap) return;

  // Tổng chi theo CT trong năm đang chọn
  const tongChi = {};
  getInvoicesCached().filter(i => inActiveYear(i.ngay)).forEach(i => {
    const ct = resolveProjectName(i) || '(Không rõ)';
    tongChi[ct] = (tongChi[ct] || 0) + (i.thanhtien || i.tien || 0);
  });

  // Tổng đã thu theo CT trong năm đang chọn
  const daThu = {};
  thuRecords.filter(r => !r.deletedAt && inActiveYear(r.ngay)).forEach(r => {
    const ct = resolveProjectName(r) || '';
    daThu[ct] = (daThu[ct] || 0) + (r.tien || 0);
  });

  // Hợp đồng theo CT (từ hopDongData — bỏ qua soft-deleted, lọc theo năm)
  // Key có thể là projectId (UUID) hoặc tên CT (legacy) → resolve sang tên cho hiển thị
  const hdByCT = {};
  const _llProjs = (typeof projects !== 'undefined') ? projects : [];
  Object.entries(hopDongData).filter(([, v]) => !v.deletedAt && _dtInYear(v.ngay)).forEach(([keyId, hd]) => {
    const p = _llProjs.find(proj => proj.id === keyId);
    const ctName = p ? p.name : keyId;
    hdByCT[ctName] = {
      giaTri:    hd.giaTri    || 0,
      giaTriphu: hd.giaTriphu || 0,
      phatSinh:  hd.phatSinh  || 0,
    };
  });

  // Gộp tất cả CT
  const allCts = [...new Set([
    ...Object.keys(tongChi),
    ...Object.keys(hdByCT)
  ])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi'));

  if (!allCts.length) {
    wrap.innerHTML = '<div class="db-empty">Chưa có dữ liệu</div>';
    return;
  }

  let tongHD = 0, tongHDPhu = 0, tongPS = 0, tongDT = 0, tongChi_ = 0, tongThu = 0;

  const rows = allCts.map(ct => {
    const hd       = hdByCT[ct] || {};
    const giaTri   = hd.giaTri    || 0;
    const giaTriphu= hd.giaTriphu || 0;
    const phatSinh = hd.phatSinh  || 0;
    const tongDTct = giaTri + giaTriphu + phatSinh;
    const chi      = tongChi[ct] || 0;
    const thu      = daThu[ct]   || 0;
    const conPhaiThu = tongDTct - thu;
    const laiLo    = tongDTct - chi;
    const llClass  = laiLo > 0 ? 'll-pos' : laiLo < 0 ? 'll-neg' : 'll-zero';
    const llPrefix = laiLo > 0 ? '+' : '';

    tongHD    += giaTri;
    tongHDPhu += giaTriphu;
    tongPS    += phatSinh;
    tongDT    += tongDTct;
    tongChi_  += chi;
    tongThu   += thu;

    return `<tr>
      <td>${x(ct)}</td>
      <td>${giaTri    ? fmtS(giaTri)    : '<span class="text-secondary">—</span>'}</td>
      <td>${giaTriphu ? fmtS(giaTriphu) : '<span class="text-secondary">—</span>'}</td>
      <td>${phatSinh  ? fmtS(phatSinh)  : '<span class="text-secondary">—</span>'}</td>
      <td style="font-weight:600">${tongDTct ? fmtS(tongDTct) : '—'}</td>
      <td class="text-danger">${fmtS(chi)}</td>
      <td class="text-success">${thu ? fmtS(thu) : '—'}</td>
      <td>${tongDTct ? fmtS(conPhaiThu) : '—'}</td>
      <td class="${llClass}">${tongDTct ? llPrefix + fmtS(laiLo) : '—'}</td>
    </tr>`;
  }).join('');

  const tongLaiLo  = tongDT - tongChi_;
  const tongLLClass = tongLaiLo > 0 ? 'll-pos' : tongLaiLo < 0 ? 'll-neg' : 'll-zero';

  wrap.innerHTML = `
    <div style="overflow-x:auto">
      <table class="table table-sm table-hover align-middle mb-0">
        <thead>
          <tr>
            <th style="text-align:left;min-width:140px">Công Trình</th>
            <th>HĐ Chính</th>
            <th>HĐ Phụ</th>
            <th>Phát Sinh</th>
            <th>Tổng DT</th>
            <th>Tổng Chi</th>
            <th>Đã Thu</th>
            <th>Còn Phải Thu</th>
            <th>Lãi / Lỗ</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td style="text-align:left">TỔNG CỘNG</td>
            <td>${fmtS(tongHD)}</td>
            <td>${fmtS(tongHDPhu)}</td>
            <td>${fmtS(tongPS)}</td>
            <td style="font-weight:700">${fmtS(tongDT)}</td>
            <td class="text-danger fw-bold">${fmtS(tongChi_)}</td>
            <td class="text-success fw-bold">${fmtS(tongThu)}</td>
            <td>${fmtS(tongDT - tongThu)}</td>
            <td class="${tongLLClass}">${tongDT ? (tongLaiLo >= 0 ? '+' : '') + fmtS(tongLaiLo) : '—'}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}

// ══ SUBTAB: TỔNG QUAN LỢI NHUẬN ══════════════════════════════
// Bức tranh Lời/Lỗ từng công trình:
//   [1] Tổng Chi Phí   = (A) Hóa đơn/vật tư + (B) Thầu phụ + (C) Chi phí chung phân bổ
//   [2] Doanh Thu Thực = (X) HĐ chính ban đầu + (Y) Quyết toán (cộng dồn dương/âm)
//   [3] Lợi Nhuận      = [2] − [1]   (xanh nếu lời, đỏ nếu lỗ)
// LƯU Ý: báo cáo theo NĂM ĐANG LỌC. Chọn "Tất cả năm" để xem toàn vòng đời công trình
// (vì hóa đơn 1 công trình có thể nằm rải ở nhiều năm).
// CẢNH BÁO trùng tính: nếu 1 khoản thầu phụ (B) cũng được nhập như hóa đơn (A) thì
// có thể bị cộng 2 lần — cần đối soát khi nhập liệu.
// Trạng thái toggle: ẩn/hiện các cột bóc tách (Hóa đơn/Thầu phụ/CP chung/HĐ gốc/Quyết toán)
let _lnShowDetail = false;

function toggleLoiNhuanDetail() {
  _lnShowDetail = !_lnShowDetail;
  const btn = document.getElementById('dt-ln-toggle-btn');
  if (btn) btn.innerHTML = _lnShowDetail
    ? '<i class="bi bi-chevron-bar-contract"></i> Thu gọn'
    : '<i class="bi bi-list-columns-reverse"></i> Hiện chi tiết';
  renderLoiNhuan();
}

// ── Badge nền màu cho con số lời/lỗ (xanh dương / đỏ âm) ──────
function _lnBadge(val, bold) {
  if (!val) return '<span class="text-secondary">—</span>';
  const pos = val > 0;
  const bg  = pos ? 'var(--bs-success-bg-subtle)' : 'var(--bs-danger-bg-subtle)';
  const fg  = pos ? 'var(--bs-success-text-emphasis)' : 'var(--bs-danger-text-emphasis)';
  return `<span style="display:inline-block;padding:2px 9px;border-radius:7px;font-weight:${bold ? 800 : 700};background:${bg};color:${fg}">${pos ? '+' : ''}${fmtS(Math.round(val))}</span>`;
}

// ── Ô Tổng Chi có thanh tỷ lệ nền (chi chiếm bao nhiêu % doanh thu) ──
function _lnChiCell(chi, dt, bold) {
  if (!chi) return '<td class="text-end">—</td>';
  const pct = dt > 0 ? Math.min((chi / dt) * 100, 100) : 100;
  const w   = bold ? 'fw-bold' : 'fw-semibold';
  return `<td class="text-end ${w}" style="background:linear-gradient(to right, var(--bs-danger-bg-subtle) ${pct}%, transparent ${pct}%)">
    <span class="text-danger">${fmtS(Math.round(chi))}</span>
    <span style="display:block;font-size:9px;color:var(--bs-secondary-color);font-weight:400">${Math.round(pct)}% DT</span>
  </td>`;
}

// ── Mini dashboard: donut Doanh thu vs Chi phí + Top 5 lãi / Top 5 lỗ ──
function _lnBuildDashboard(rowsData, tChi, tDt, tLN) {
  // Donut (conic-gradient): tỷ trọng Doanh thu (xanh) vs Chi phí (đỏ)
  const total   = tChi + tDt;
  const dtEnd   = total > 0 ? (tDt / total) * 100 : 0;
  const lnClass = tLN > 0 ? 'll-pos' : tLN < 0 ? 'll-neg' : 'll-zero';
  const _dot = (c) => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};margin-right:4px"></span>`;

  const donut = `
    <div class="card shadow-sm border-0 h-100"><div class="card-body d-flex flex-column align-items-center justify-content-center py-3">
      <div class="text-secondary mb-2" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Doanh Thu vs Chi Phí</div>
      <div style="position:relative;width:130px;height:130px;border-radius:50%;background:conic-gradient(var(--bs-success) 0 ${dtEnd}%, var(--bs-danger) ${dtEnd}% 100%)">
        <div style="position:absolute;inset:17px;background:var(--bs-body-bg);border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <span style="font-size:9px;color:var(--bs-secondary-color);text-transform:uppercase;letter-spacing:.3px">Lợi nhuận</span>
          <span class="${lnClass}" style="font-size:15px">${tLN >= 0 ? '+' : ''}${fmtS(Math.round(tLN))}</span>
        </div>
      </div>
      <div class="mt-3" style="font-size:11px;line-height:1.8">
        <div>${_dot('var(--bs-success)')}Doanh thu: <b>${fmtM(tDt)}</b></div>
        <div>${_dot('var(--bs-danger)')}Chi phí: <b>${fmtM(tChi)}</b></div>
      </div>
    </div></div>`;

  // Bar chart helper: danh sách {name, ln} → thanh ngang tỷ lệ
  const _bars = (list, color) => {
    if (!list.length) return '<div class="text-secondary text-center py-3" style="font-size:12px">Chưa có</div>';
    const maxAbs = Math.max(...list.map(r => Math.abs(r.ln))) || 1;
    return list.map(r => {
      const pct = Math.max((Math.abs(r.ln) / maxAbs) * 100, 4);
      return `<div style="margin-bottom:9px">
        <div style="display:flex;justify-content:space-between;gap:8px;font-size:11px;margin-bottom:3px">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(r.name)}">${x(r.name)}</span>
          <span class="fw-bold" style="color:${color};white-space:nowrap">${r.ln > 0 ? '+' : ''}${fmtS(Math.round(r.ln))}</span>
        </div>
        <div style="height:8px;background:var(--bs-tertiary-bg);border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:4px"></div>
        </div>
      </div>`;
    }).join('');
  };

  const topLai = rowsData.filter(r => r.ln > 0).sort((a, b) => b.ln - a.ln).slice(0, 5);
  const topLo  = rowsData.filter(r => r.ln < 0).sort((a, b) => a.ln - b.ln).slice(0, 5);

  const barLai = `
    <div class="card shadow-sm border-0 h-100"><div class="card-body py-3">
      <div class="text-secondary mb-3" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px"><span class="material-symbols-outlined msi-gap">trending_up</span>Top 5 Lãi Cao Nhất</div>
      ${_bars(topLai, 'var(--bs-success)')}
    </div></div>`;
  const barLo = `
    <div class="card shadow-sm border-0 h-100"><div class="card-body py-3">
      <div class="text-secondary mb-3" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px"><span class="material-symbols-outlined msi-gap">trending_down</span>Top 5 Đang Lỗ</div>
      ${_bars(topLo, 'var(--bs-danger)')}
    </div></div>`;

  return `<div class="row g-3">
    <div class="col-12 col-lg-4">${donut}</div>
    <div class="col-12 col-sm-6 col-lg-4">${barLai}</div>
    <div class="col-12 col-sm-6 col-lg-4">${barLo}</div>
  </div>`;
}

function renderLoiNhuan() {
  const wrap = document.getElementById('dt-loinhuan-wrap');
  const dash = document.getElementById('dt-ln-dashboard');
  if (!wrap) return;

  const _lnProjs = (typeof getAllProjects === 'function' ? getAllProjects() : [])
    .filter(p => p && p.id !== 'COMPANY');

  // Map phân bổ chi phí chung CÔNG TY theo projectId (tôn trọng năm đang lọc)
  const allocMap = {};
  if (typeof allocateCompanyCost === 'function') {
    allocateCompanyCost().forEach(a => { if (a && a.p) allocMap[a.p.id] = a.allocated || 0; });
  }

  // Helper: 1 bản ghi (hóa đơn / thầu phụ / quyết toán) có thuộc công trình p không
  const _matchProj = (rec, p) =>
    (rec.projectId && rec.projectId === p.id) ||
    (!rec.projectId && ((resolveProjectName(rec) === p.name) || (rec.congtrinh === p.name)));

  // (A) Hóa đơn/vật tư theo công trình (năm đang lọc)
  const invs = getInvoicesCached().filter(i => !i.deletedAt && _dtInYear(i.ngay));

  const rowsData = _lnProjs.map(p => {
    const A = invs.filter(i => _matchProj(i, p))
      .reduce((s, i) => s + (i.thanhtien || i.tien || 0), 0);   // (A) hóa đơn
    const B = _lnContractsB(p);                                  // (B) thầu phụ
    const C = allocMap[p.id] || 0;                              // (C) chi phí chung phân bổ
    const X = _lnRevenueX(p);                                    // (X) HĐ chính ban đầu
    const Y = quyetToanRecords                                   // (Y) quyết toán (có dấu)
      .filter(r => !r.deletedAt && _dtInYear(r.ngay) && _matchProj(r, p))
      .reduce((s, r) => s + (r.giaTri || 0), 0);
    const Thu = thuRecords                                       // (Đã thu) — dùng cho công thức max(X, Thu)
      .filter(r => !r.deletedAt && _dtInYear(r.ngay) && _matchProj(r, p))
      .reduce((s, r) => s + (r.tien || 0), 0);
    const chi = A + B + C;
    // Doanh thu = max(HĐ chính, Đã thu) + Quyết toán — xem _dtCalcRevenue() (doanhthu.core.js)
    const dt = (typeof _dtCalcRevenue === 'function') ? _dtCalcRevenue(X, Thu, Y) : X + Y;
    return { name: p.name, A, B, C, X, Y, chi, dt, ln: dt - chi };
  }).filter(r => r.A || r.B || r.C || r.X || r.Y); // bỏ công trình không có dữ liệu

  rowsData.sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  if (!rowsData.length) {
    if (dash) dash.innerHTML = '';
    wrap.innerHTML = '<div style="text-align:center;padding:32px;color:var(--bs-secondary-color);font-size:13px">Chưa có dữ liệu</div>';
    return;
  }

  // Tổng cộng
  const tA = rowsData.reduce((s, r) => s + r.A, 0);
  const tB = rowsData.reduce((s, r) => s + r.B, 0);
  const tC = rowsData.reduce((s, r) => s + r.C, 0);
  const tX = rowsData.reduce((s, r) => s + r.X, 0);
  const tY = rowsData.reduce((s, r) => s + r.Y, 0);
  const tChi = tA + tB + tC, tDt = tX + tY, tLN = tDt - tChi;

  // ── Mini dashboard (donut + bar) ──
  if (dash) dash.innerHTML = _lnBuildDashboard(rowsData, tChi, tDt, tLN);

  // ── Bảng chi tiết (toggle cột bóc tách) ──
  const det = _lnShowDetail;
  const _money = (v) => v ? fmtS(Math.round(v)) : '<span class="text-secondary">—</span>';
  const _moneyY = (v) => v ? (v > 0 ? '+' : '') + fmtS(Math.round(v)) : '<span class="text-secondary">—</span>';

  const rows = rowsData.map(r => `<tr>
      <td style="text-align:left;font-weight:600">${x(r.name)}</td>
      ${det ? `<td class="text-end text-danger">${_money(r.A)}</td><td class="text-end text-danger">${_money(r.B)}</td><td class="text-end text-danger">${_money(r.C)}</td>` : ''}
      ${_lnChiCell(r.chi, r.dt)}
      ${det ? `<td class="text-end">${_money(r.X)}</td><td class="text-end">${_moneyY(r.Y)}</td>` : ''}
      <td class="text-end fw-semibold">${r.dt ? fmtS(Math.round(r.dt)) : '—'}</td>
      <td class="text-end">${_lnBadge(r.ln)}</td>
    </tr>`).join('');

  wrap.innerHTML = `
    <div style="overflow-x:auto">
      <table class="table table-sm table-hover align-middle mb-0" style="min-width:${det ? 820 : 460}px">
        <thead class="table-light">
          <tr style="font-size:11px">
            <th style="text-align:left;min-width:130px">Công Trình</th>
            ${det ? '<th class="text-end">Hóa đơn</th><th class="text-end">Thầu phụ</th><th class="text-end">CP chung</th>' : ''}
            <th class="text-end">Tổng Chi</th>
            ${det ? '<th class="text-end">HĐ gốc</th><th class="text-end">Quyết toán</th>' : ''}
            <th class="text-end">Doanh Thu</th>
            <th class="text-end">Lợi Nhuận</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="border-top:2px solid var(--bs-border-color)">
            <td style="text-align:left;font-weight:700">TỔNG CỘNG</td>
            ${det ? `<td class="text-end text-danger fw-bold">${fmtS(tA)}</td><td class="text-end text-danger fw-bold">${fmtS(tB)}</td><td class="text-end text-danger fw-bold">${fmtS(Math.round(tC))}</td>` : ''}
            ${_lnChiCell(tChi, tDt, true)}
            ${det ? `<td class="text-end fw-bold">${fmtS(tX)}</td><td class="text-end fw-bold">${tY ? (tY > 0 ? '+' : '') + fmtS(tY) : '0'}</td>` : ''}
            <td class="text-end fw-bold">${fmtS(Math.round(tDt))}</td>
            <td class="text-end">${_lnBadge(tLN, true)}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}

// (B) Tổng giá trị thầu phụ thuộc công trình p (năm đang lọc)
function _lnContractsB(p) {
  return thauPhuContracts
    .filter(r => !r.deletedAt && _dtInYear(r.ngay) &&
      ((r.projectId && r.projectId === p.id) ||
       (!r.projectId && ((resolveProjectName(r) === p.name) || (r.congtrinh === p.name)))))
    .reduce((s, r) => s + (r.giaTri || 0) + (r.phatSinh || 0), 0);
}

// (X) Tổng giá trị HĐ chính ban đầu của công trình p (giaTri + giaTriphu + phatSinh legacy)
function _lnRevenueX(p) {
  let total = 0;
  Object.entries(hopDongData).forEach(([keyId, hd]) => {
    if (hd.deletedAt || !_dtInYear(hd.ngay)) return;
    const _p = (typeof projects !== 'undefined' ? projects : []).find(pr => pr.id === keyId);
    const ctName = _p ? _p.name : keyId;
    if (keyId === p.id || ctName === p.name) {
      total += (hd.giaTri || 0) + (hd.giaTriphu || 0) + (hd.phatSinh || 0);
    }
  });
  return total;
}

// ── Init tab Doanh Thu khi mở ─────────────────────────────────
function initDoanhThu() {
  // Reload dữ liệu mới nhất từ _mem (đã được dbInit() populate từ IDB)
  hopDongData      = load('hopdong_v1', {});
  thauPhuContracts = load('thauphu_v1', []);
  quyetToanRecords = load('quyettoan_v1', []);

  _dtRenderDashboardMini();

  dtPopulateSels();
  dtPopulateCtFilter();

  // Set ngày mặc định = hôm nay nếu chưa có
  const ngayEl = document.getElementById('thu-ngay');
  if (ngayEl && !ngayEl.value) ngayEl.value = today();
  const hdcNgayEl = document.getElementById('hdc-ngay');
  if (hdcNgayEl && !hdcNgayEl.value) hdcNgayEl.value = today();
  const hdtpNgayEl = document.getElementById('hdtp-ngay');
  if (hdtpNgayEl && !hdtpNgayEl.value) hdtpNgayEl.value = today();

  // Set KHAI BÁO là sub-tab active mặc định
  const kbBtn  = document.getElementById('dt-sub-khaibao-btn');
  const kbPage = document.getElementById('dt-sub-khaibao');
  document.querySelectorAll('#page-doanhthu .sub-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#page-doanhthu .nav-link').forEach(b => b.classList.remove('active'));
  if (kbBtn && kbPage) { kbPage.classList.add('active'); kbBtn.classList.add('active'); }

  // Render KHAI BÁO (bảng gộp 30 ngày) + THỐNG KÊ (các bảng toàn bộ)
  renderKhaiBaoTable(0);
  renderHdcTableTk(0);
  renderHdtpTableTk(0);
  renderThuTableTk(0);
  if (typeof renderQtTableTk === 'function') renderQtTableTk(0);

  // Reset edit state
  _hdcResetForm();
  _hdtpResetForm();
}

// Cấp ra global theo yêu cầu
window.initDoanhThu = initDoanhThu;
window.dtGoSub = dtGoSub;

// [ADDED COPY KLCT]
function copyKLCT(btn) {
  try {
    const container = btn.closest('.section, .card, .block') || btn.parentElement;
    const tbody = container.querySelector('tbody');
    if (!tbody) { toast('Không tìm thấy bảng dữ liệu', 'error'); return; }

    const rows = tbody.querySelectorAll('tr');
    const data = [];

    rows.forEach(tr => {
      const inputs = tr.querySelectorAll('input');
      if (inputs.length < 4) return;

      const row = {
        ten: inputs[0]?.value || '',
        donvi: inputs[1]?.value || '',
        khoiluong: inputs[2]?.value || '',
        dongia: (inputs[3]?.dataset?.raw || inputs[3]?.value || '').toString().replace(/[^0-9]/g, '')
      };

      if (row.ten || row.khoiluong || row.dongia) {
        data.push(row);
      }
    });

    if (!data.length) {
      toast('Không có dữ liệu để copy', 'error');
      return;
    }

    localStorage.setItem('klct_clipboard', JSON.stringify(data));

    // Highlight button
    const oldBg = btn.style.background;
    btn.style.background = '#e8f0fb';
    setTimeout(() => { btn.style.background = oldBg; }, 1000);

    toast('✅ Đã copy khối lượng chi tiết');
  } catch (e) {
    console.error(e);
    toast('❌ Copy thất bại', 'error');
  }
}

function pasteKLCT(btn) {
  try {
    const raw = localStorage.getItem('klct_clipboard');
    if (!raw) {
      toast('Chưa có dữ liệu copy', 'error');
      return;
    }
    const data = JSON.parse(raw);
    const container = btn.closest('.section, .card, .block') || btn.parentElement;
    const tbody = container.querySelector('tbody');
    if (!tbody) return;

    // Detect prefix from tbody ID
    const prefix = tbody.id.split('-')[0]; // hdc or hdtp
    const arr = prefix === 'hdc' ? _hdcItems : _hdtpItems;

    if (arr.length > 0 && !confirm('Bạn có muốn ghi đè dữ liệu chi tiết hiện có không?')) {
      return;
    }

    arr.length = 0;
    data.forEach(row => {
      arr.push({
        name: row.ten || '',
        donVi: row.donvi || '',
        sl: parseFloat(row.khoiluong) || 0,
        donGia: parseFloat(row.dongia) || 0
      });
    });

    if (window['render' + prefix + 'ChiTiet']) window['render' + prefix + 'ChiTiet']();
    if (window[prefix + 'CalcAuto'] ) window[prefix + 'CalcAuto']();

    // Auto scroll down to the table
    tbody.scrollIntoView({ behavior: 'smooth', block: 'end' });

    toast('📥 Đã dán khối lượng chi tiết');
  } catch (e) {
    console.error(e);
    toast('❌ Paste lỗi', 'error');
  }
}

function exportHdcToImage() {
  const checked = [...document.querySelectorAll('.hdc-row-chk:checked')];
  if (!checked.length) { toast('⚠️ Vui lòng tick chọn ít nhất 1 hợp đồng!', 'error'); return; }
  if (checked.length > 1) { toast('⚠️ Chỉ chọn 1 hợp đồng để xuất phiếu!', 'error'); return; }

  const keyId = checked[0].dataset.id;
  const hd = hopDongData[keyId];
  if (!hd) return;

  const ctName = projects.find(p => p.id === keyId)?.name || keyId;
  const total = (hd.giaTri || 0) + (hd.giaTriphu || 0) + (hd.phatSinh || 0);

  document.getElementById('phdc-ct-name').textContent = ctName;
  document.getElementById('phdc-ct-label').textContent = ctName;
  document.getElementById('phdc-date').textContent = hd.ngay || today();
  document.getElementById('phdc-nguoi').textContent = recCatName(hd, 'hopdong', 'nguoi') || '—';
  document.getElementById('phdc-giatri').textContent = numFmt(hd.giaTri || 0) + ' đ';
  document.getElementById('phdc-phatsinh').textContent = numFmt((hd.giaTriphu || 0) + (hd.phatSinh || 0)) + ' đ';
  document.getElementById('phdc-tong').textContent = numFmt(total) + ' đ';

  const items = Array.isArray(hd.items) ? hd.items : [];
  let totalDetail = 0;
  document.getElementById('phdc-tbody').innerHTML = items.map(it => {
    const st = (it.sl || 0) * (it.donGia || 0);
    totalDetail += st;
    return `<tr>
      <td style="padding:8px 10px; border:1px solid #1a1814;">${x(it.name)}</td>
      <td style="padding:8px 10px; border:1px solid #1a1814; text-align:center;">${x(it.donVi || '—')}</td>
      <td style="padding:8px 10px; border:1px solid #1a1814; text-align:center;">${it.sl || 0}</td>
      <td style="padding:8px 10px; border:1px solid #1a1814; text-align:right;">${numFmt(it.donGia || 0)}</td>
      <td style="padding:8px 10px; border:1px solid #1a1814; text-align:right; font-weight:700;">${numFmt(st)}</td>
    </tr>`;
  }).join('');
  document.getElementById('phdc-total-detail').textContent = numFmt(totalDetail) + ' đ';

  const tpl = document.getElementById('hdchinh-template');
  tpl.style.display = 'block';
  toast('⏳ Đang tạo phiếu HĐ Công ty...', 'info');

  html2canvas(tpl, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: 800 }).then(canvas => {
    tpl.style.display = 'none';
    const link = document.createElement('a');
    link.download = 'HDChinh_' + removeVietnameseTones(ctName) + '_' + today() + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('✅ Đã xuất phiếu HĐ Công ty!', 'success');
  }).catch(err => { tpl.style.display = 'none'; toast('❌ Lỗi: ' + err.message, 'error'); });
}

function exportHdtpToImage() {
  const checked = [...document.querySelectorAll('.hdtp-row-chk:checked')];
  if (!checked.length) { toast('⚠️ Vui lòng tick chọn ít nhất 1 HĐ thầu phụ!', 'error'); return; }
  if (checked.length > 1) { toast('⚠️ Chỉ chọn 1 HĐ thầu phụ để xuất phiếu!', 'error'); return; }

  const id = checked[0].dataset.id;
  const r = thauPhuContracts.find(c => c.id === id);
  if (!r) return;

  const ctName = _resolveCtName(r);
  const total = (r.giaTri || 0) + (r.phatSinh || 0);

  document.getElementById('phdtp-ct-name').textContent = ctName;
  document.getElementById('phdtp-ct-label').textContent = ctName;
  document.getElementById('phdtp-date').textContent = r.ngay || today();
  document.getElementById('phdtp-thauphu').textContent = recCatName(r, 'thauphu', 'thauphu') || '—';
  document.getElementById('phdtp-nd').textContent = r.nd || '—';
  document.getElementById('phdtp-giatri').textContent = numFmt(r.giaTri || 0) + ' đ';
  document.getElementById('phdtp-phatsinh').textContent = numFmt(r.phatSinh || 0) + ' đ';
  document.getElementById('phdtp-tong').textContent = numFmt(total) + ' đ';

  const items = Array.isArray(r.items) ? r.items : [];
  let totalDetail = 0;
  document.getElementById('phdtp-tbody').innerHTML = items.map(it => {
    const st = (it.sl || 0) * (it.donGia || 0);
    totalDetail += st;
    return `<tr>
      <td style="padding:8px 10px; border:1px solid #1a1814;">${x(it.name)}</td>
      <td style="padding:8px 10px; border:1px solid #1a1814; text-align:center;">${x(it.donVi || '—')}</td>
      <td style="padding:8px 10px; border:1px solid #1a1814; text-align:center;">${it.sl || 0}</td>
      <td style="padding:8px 10px; border:1px solid #1a1814; text-align:right;">${numFmt(it.donGia || 0)}</td>
      <td style="padding:8px 10px; border:1px solid #1a1814; text-align:right; font-weight:700;">${numFmt(st)}</td>
    </tr>`;
  }).join('');
  document.getElementById('phdtp-total-detail').textContent = numFmt(totalDetail) + ' đ';

  const tpl = document.getElementById('hdthauphu-template');
  tpl.style.display = 'block';
  toast('⏳ Đang tạo phiếu HĐ Thầu phụ...', 'info');

  html2canvas(tpl, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: 800 }).then(canvas => {
    tpl.style.display = 'none';
    const link = document.createElement('a');
    link.download = 'HDThauPhu_' + removeVietnameseTones(ctName) + '_' + removeVietnameseTones(recCatName(r, 'thauphu', 'thauphu')) + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('✅ Đã xuất phiếu HĐ Thầu phụ!', 'success');
  }).catch(err => { tpl.style.display = 'none'; toast('❌ Lỗi: ' + err.message, 'error'); });
}

function exportThuToImage() {
  const checked = [...document.querySelectorAll('.thu-row-chk:checked')];
  if (!checked.length) { toast('⚠️ Vui lòng tick chọn ít nhất 1 lần thu tiền!', 'error'); return; }
  if (checked.length > 1) { toast('⚠️ Hiện tại chỉ hỗ trợ xuất phiếu thu cho từng đợt lẻ!', 'error'); return; }

  const id = checked[0].dataset.id;
  const r = thuRecords.find(t => t.id === id);
  if (!r) return;

  const ctName = _resolveCtName(r);

  document.getElementById('ppt-ct-name').textContent = ctName;
  document.getElementById('ppt-ct-label').textContent = ctName;
  document.getElementById('ppt-date').textContent = r.ngay || today();
  document.getElementById('ppt-nguoi').textContent = recCatName(r, 'thu', 'nguoi') || '—';
  document.getElementById('ppt-tien').textContent = numFmt(r.tien || 0) + ' đ';
  document.getElementById('ppt-nd').textContent = r.nd || '—';

  const tpl = document.getElementById('phieuthu-template');
  tpl.style.display = 'block';
  toast('⏳ Đang tạo phiếu thu tiền...', 'info');

  html2canvas(tpl, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: 680 }).then(canvas => {
    tpl.style.display = 'none';
    const link = document.createElement('a');
    link.download = 'PhieuThu_' + removeVietnameseTones(ctName) + '_' + r.ngay + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('✅ Đã xuất phiếu thu tiền!', 'success');
  }).catch(err => { tpl.style.display = 'none'; toast('❌ Lỗi: ' + err.message, 'error'); });
}

// ── Per-row export helpers (không cần tick checkbox) ──────────
function exportHdcRowToImage(keyId) {
  const hd = hopDongData[keyId];
  if (!hd) return;
  const ctName = (typeof projects !== 'undefined' ? projects : []).find(p => p.id === keyId)?.name || keyId;
  const total = (hd.giaTri || 0) + (hd.giaTriphu || 0) + (hd.phatSinh || 0);

  document.getElementById('phdc-ct-name').textContent = ctName;
  document.getElementById('phdc-ct-label').textContent = ctName;
  document.getElementById('phdc-date').textContent = hd.ngay || today();
  document.getElementById('phdc-nguoi').textContent = recCatName(hd, 'hopdong', 'nguoi') || '—';
  document.getElementById('phdc-giatri').textContent = numFmt(hd.giaTri || 0) + ' đ';
  document.getElementById('phdc-phatsinh').textContent = numFmt((hd.giaTriphu || 0) + (hd.phatSinh || 0)) + ' đ';
  document.getElementById('phdc-tong').textContent = numFmt(total) + ' đ';

  const items = Array.isArray(hd.items) ? hd.items : [];
  let totalDetail = 0;
  document.getElementById('phdc-tbody').innerHTML = items.map(it => {
    const st = (it.sl || 0) * (it.donGia || 0);
    totalDetail += st;
    return `<tr>
      <td style="padding:8px 10px;border:1px solid #1a1814">${x(it.name)}</td>
      <td style="padding:8px 10px;border:1px solid #1a1814;text-align:center">${x(it.donVi || '—')}</td>
      <td style="padding:8px 10px;border:1px solid #1a1814;text-align:center">${it.sl || 0}</td>
      <td style="padding:8px 10px;border:1px solid #1a1814;text-align:right">${numFmt(it.donGia || 0)}</td>
      <td style="padding:8px 10px;border:1px solid #1a1814;text-align:right;font-weight:700">${numFmt(st)}</td>
    </tr>`;
  }).join('');
  document.getElementById('phdc-total-detail').textContent = numFmt(totalDetail) + ' đ';

  const tpl = document.getElementById('hdchinh-template');
  tpl.style.display = 'block';
  toast('⏳ Đang tạo phiếu...', 'info');
  html2canvas(tpl, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: 800 }).then(canvas => {
    tpl.style.display = 'none';
    const link = document.createElement('a');
    link.download = 'HDChinh_' + removeVietnameseTones(ctName) + '_' + today() + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('✅ Đã xuất phiếu HĐ Chính!', 'success');
  }).catch(err => { tpl.style.display = 'none'; toast('❌ Lỗi: ' + err.message, 'error'); });
}

function exportThuRowToImage(id) {
  const r = thuRecords.find(t => t.id === id);
  if (!r) return;
  const ctName = _resolveCtName(r);

  document.getElementById('ppt-ct-name').textContent = ctName;
  document.getElementById('ppt-ct-label').textContent = ctName;
  document.getElementById('ppt-date').textContent = r.ngay || today();
  document.getElementById('ppt-nguoi').textContent = recCatName(r, 'thu', 'nguoi') || '—';
  document.getElementById('ppt-tien').textContent = numFmt(r.tien || 0) + ' đ';
  document.getElementById('ppt-nd').textContent = r.nd || '—';

  const tpl = document.getElementById('phieuthu-template');
  tpl.style.display = 'block';
  toast('⏳ Đang tạo phiếu...', 'info');
  html2canvas(tpl, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: 680 }).then(canvas => {
    tpl.style.display = 'none';
    const link = document.createElement('a');
    link.download = 'PhieuThu_' + removeVietnameseTones(ctName) + '_' + (r.ngay || today()) + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('✅ Đã xuất phiếu thu tiền!', 'success');
  }).catch(err => { tpl.style.display = 'none'; toast('❌ Lỗi: ' + err.message, 'error'); });
}

function exportHdtpRowToImage(id) {
  const r = thauPhuContracts.find(c => c.id === id);
  if (!r) return;
  const ctName = _resolveCtName(r);
  const total = (r.giaTri || 0) + (r.phatSinh || 0);

  document.getElementById('phdtp-ct-name').textContent = ctName;
  document.getElementById('phdtp-ct-label').textContent = ctName;
  document.getElementById('phdtp-date').textContent = r.ngay || today();
  document.getElementById('phdtp-thauphu').textContent = recCatName(r, 'thauphu', 'thauphu') || '—';
  document.getElementById('phdtp-nd').textContent = r.nd || '—';
  document.getElementById('phdtp-giatri').textContent = numFmt(r.giaTri || 0) + ' đ';
  document.getElementById('phdtp-phatsinh').textContent = numFmt(r.phatSinh || 0) + ' đ';
  document.getElementById('phdtp-tong').textContent = numFmt(total) + ' đ';

  const items = Array.isArray(r.items) ? r.items : [];
  let totalDetail = 0;
  document.getElementById('phdtp-tbody').innerHTML = items.map(it => {
    const st = (it.sl || 0) * (it.donGia || 0);
    totalDetail += st;
    return `<tr>
      <td style="padding:8px 10px;border:1px solid #1a1814">${x(it.name)}</td>
      <td style="padding:8px 10px;border:1px solid #1a1814;text-align:center">${x(it.donVi || '—')}</td>
      <td style="padding:8px 10px;border:1px solid #1a1814;text-align:center">${it.sl || 0}</td>
      <td style="padding:8px 10px;border:1px solid #1a1814;text-align:right">${numFmt(it.donGia || 0)}</td>
      <td style="padding:8px 10px;border:1px solid #1a1814;text-align:right;font-weight:700">${numFmt(st)}</td>
    </tr>`;
  }).join('');
  document.getElementById('phdtp-total-detail').textContent = numFmt(totalDetail) + ' đ';

  const tpl = document.getElementById('hdthauphu-template');
  tpl.style.display = 'block';
  toast('⏳ Đang tạo phiếu...', 'info');
  html2canvas(tpl, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: 800 }).then(canvas => {
    tpl.style.display = 'none';
    const link = document.createElement('a');
    link.download = 'HDThauPhu_' + removeVietnameseTones(ctName) + '_' + removeVietnameseTones(recCatName(r, 'thauphu', 'thauphu')) + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('✅ Đã xuất phiếu HĐ Thầu Phụ!', 'success');
  }).catch(err => { tpl.style.display = 'none'; toast('❌ Lỗi: ' + err.message, 'error'); });
}
