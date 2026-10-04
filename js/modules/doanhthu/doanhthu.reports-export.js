// doanhthu.reports-export.js — Lãi/Lỗ, Lợi Nhuận, initDoanhThu, copy/paste KLCT, xuất phiếu ảnh
// Load order: sau doanhthu.forms.js

// (03/10/2026) Đã xóa 3 hàm Công Nợ đời cũ (renderCongNoThauPhu / renderCongNoNhaCungCap /
// _renderCongNoTable) — Công nợ nay là tất toán ở js/modules/congno/congno.tattoan.js.

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

// ══ TAB CHÍNH: LỢI NHUẬN (pages/loinhuan.html) ═══════════════
// (02/10/2026) Trước là sub-tab "TỔNG QUAN LỢI NHUẬN" trong tab Doanh Thu, nay tách
// thành tab chính riêng (ngay dưới DOANH THU trên sidebar). Mở tab → initLoiNhuan().
// Bức tranh Lời/Lỗ từng công trình:
//   [1] Tổng Chi Phí   = (A) Hóa đơn/vật tư + (B) Thầu phụ + (C) Chi phí chung phân bổ
//   [2] Doanh Thu Thực = (X) HĐ chính ban đầu + (Y) Quyết toán (cộng dồn dương/âm)
//   [3] Lợi Nhuận      = [2] − [1]   (xanh nếu lời, đỏ nếu lỗ)
// LƯU Ý: báo cáo theo NĂM ĐANG LỌC. Chọn "Tất cả năm" để xem toàn vòng đời công trình
// (vì hóa đơn 1 công trình có thể nằm rải ở nhiều năm).
// CẢNH BÁO trùng tính: nếu 1 khoản thầu phụ (B) cũng được nhập như hóa đơn (A) thì
// có thể bị cộng 2 lần — cần đối soát khi nhập liệu.
// Trạng thái toggle: ẩn/hiện các cột bóc tách (Hóa đơn/Thầu phụ/CP chung/HĐ gốc/Quyết toán)
// (03/10/2026) Mặc định HIỆN ĐỦ chi tiết ngay khi mở tab; nút chuyển thành "Thu gọn"
// để khi cần (màn hình hẹp) vẫn rút về 4 cột: Công trình | Tổng thu | Tổng chi | Lợi nhuận.
let _lnShowDetail = true;

function toggleLoiNhuanDetail() {
  _lnShowDetail = !_lnShowDetail;
  const btn = document.getElementById('dt-ln-toggle-btn');
  if (btn) btn.innerHTML = _lnShowDetail
    ? '<i class="bi bi-chevron-bar-contract"></i> Thu gọn'
    : '<i class="bi bi-list-columns-reverse"></i> Hiện chi tiết';
  renderLoiNhuan();
}

// ── Định dạng số tiền ĐẦY ĐỦ cho bảng (vd 728.400.000) — KHÔNG kèm "đ" vì tiêu đề đã ghi (VNĐ) ──
// Giá trị 0 / không có → dấu "—" mờ. sign=true → luôn hiện dấu +/− (dùng cho Quyết toán, Lợi nhuận).
const _LN_DASH = '<span class="ln-dash">—</span>';
function _lnNum(v, sign) {
  const n = Math.round(v || 0);
  if (!n) return _LN_DASH;
  const s = Math.abs(n).toLocaleString('vi-VN');
  if (!sign) return n < 0 ? '−' + s : s;
  return (n > 0 ? '+' : '−') + ' ' + s;   // khoảng trắng mảnh giữa dấu và số cho dễ đọc
}

// ── Badge Lợi nhuận: nền xanh (lời) / đỏ (lỗ) — nơi DUY NHẤT trong bảng dùng màu xanh/đỏ ──
function _lnBadge(val) {
  const n = Math.round(val || 0);
  if (!n) return _LN_DASH;
  return `<span class="ln-badge ${n > 0 ? 'is-pos' : 'is-neg'}">${_lnNum(n, true)}</span>`;
}

// ── Ô Tổng Chi: số đậm + badge xám nhỏ "% doanh thu" đặt BÊN CẠNH (không ép xuống dòng dưới) ──
// Không tô nền đỏ cả ô nữa (03/10/2026) — tránh 1 cột đỏ chạy dọc hút mắt sai chỗ.
function _lnChiCell(chi, dt, sepCls) {
  if (!chi) return `<td class="text-end ln-total ${sepCls || ''}">${_LN_DASH}</td>`;
  const pct = dt > 0 ? `${Math.round((chi / dt) * 100)}%` : '—';
  const tip = dt > 0 ? 'Chi phí chiếm ' + pct + ' doanh thu' : 'Chưa có doanh thu';
  return `<td class="text-end ln-total ${sepCls || ''}">${_lnNum(chi)}<span class="ln-pct" title="${tip}">${pct}</span></td>`;
}

// ── Số lời/lỗ dạng RÚT GỌN có dấu cho dashboard (vd "+190 tr", "−128.2 tr") ──
// fmtS() chỉ rút gọn số DƯƠNG (số âm bị in đủ "-128168075") → rút gọn trị tuyệt đối rồi gắn dấu.
function _lnShort(v) {
  const n = Math.round(v || 0);
  if (!n) return '0';
  return (n > 0 ? '+' : '−') + fmtS(Math.abs(n));
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
          <span class="${lnClass}" style="font-size:15px">${_lnShort(tLN)}</span>
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
          <span class="fw-bold" style="color:${color};white-space:nowrap">${_lnShort(r.ln)}</span>
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

// ── Trạng thái tìm kiếm + sắp xếp của bảng Lợi Nhuận (04/10/2026) ──
let _lnSearch   = '';                    // từ khóa ĐÃ CHUẨN HÓA (không dấu, chữ thường) — '' = hiện tất cả
let _lnSort     = { key: '', dir: -1 };  // key: dt | X | A | B | C | chi | ln ; dir: -1 cao→thấp, 1 thấp→cao
let _lnRowsAll  = [];                    // số liệu mọi công trình của lần tính gần nhất (renderLoiNhuan)
                                         // → gõ tìm / sắp xếp chỉ VẼ LẠI BẢNG, không tính lại từ đầu

// ── Chuẩn hóa chuỗi tiếng Việt để so khớp KHÔNG DẤU ──
//   "Chùa Huyền Trang" → "chua huyen trang" ; "ĐẶNG" → "dang"
//   1) normalize('NFD') tách chữ có dấu thành chữ gốc + dấu rời (vd "ề" → "e" + ̂ + ̀)
//   2) xóa các dấu rời (khối Unicode U+0300–U+036F)
//   3) đ/Đ KHÔNG bị NFD tách → đổi tay thành d
//   4) chữ thường + gộp nhiều khoảng trắng thành 1
function _lnNorm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ── 1 dòng có khớp từ khóa không: quét TÊN CÔNG TRÌNH và TÊN CHỦ ĐẦU TƯ (khớp 1 trong 2 là giữ) ──
// Gõ nhiều từ (vd "a nhut thoai") → MỌI từ đều phải xuất hiện (thứ tự tùy ý) trong tên CT hoặc tên CĐT.
function _lnMatchSearch(r, q) {
  if (!q) return true;
  const words = q.split(' ');
  return [r._nName, r._nCdt].some(txt => txt && words.every(w => txt.includes(w)));
}

// ── Sự kiện "input" của ô tìm kiếm → lọc realtime (gõ tới đâu lọc tới đó) ──
function lnSetSearch(val) {
  _lnSearch = _lnNorm(val);
  _lnRenderTable();
}

// Bấm tiêu đề cột số tiền: lần 1 → Cao xuống Thấp, bấm lại → Thấp lên Cao (đảo chiều mỗi lần bấm)
function lnSortBy(key) {
  if (_lnSort.key === key) _lnSort.dir = -_lnSort.dir;
  else _lnSort = { key, dir: -1 };
  _lnRenderTable();
}

// ── DRILL-DOWN: bấm 1 con số trong bảng → mở tab tương ứng + lọc sẵn theo công trình ──
//   thu     → tab DOANH THU › subtab THU TIỀN, lọc Lịch Sử Thu Tiền theo CT
//   hdgoc   → tab DOANH THU › subtab HỢP ĐỒNG CHÍNH, lọc Danh Sách HĐ Chính theo CT
//   hoadon  → tab THỐNG KÊ CP/HĐ, lọc hóa đơn theo CT (dùng lại _goTabWithCT của tab Công Trình)
//   thauphu → tab CÔNG NỢ TP/NCC › subtab HỢP ĐỒNG THẦU PHỤ, lọc theo CT
function lnDrill(el) {
  const go = el && el.dataset ? el.dataset.go : '';
  const ct = el && el.dataset ? el.dataset.ct : '';
  if (!go || !ct) return;
  if (go === 'hoadon') { if (typeof _goTabWithCT === 'function') _goTabWithCT('thongke', ct); return; }
  // HĐ gốc: _goTabWithCT('doanhthu') → dtFilterHdcByCt() mở subtab HỢP ĐỒNG CHÍNH + lọc sẵn
  if (go === 'hdgoc')  { if (typeof _goTabWithCT === 'function') _goTabWithCT('doanhthu', ct); return; }

  const pageId = go === 'thu' ? 'doanhthu' : 'congno';
  const navBtn = document.querySelector(`[data-page="${pageId}"]`);
  if (navBtn && typeof goPage === 'function') goPage(navBtn, pageId);

  // Chờ tab nạp xong (giống _goTabWithCT) rồi mới đặt bộ lọc
  setTimeout(() => {
    let focusEl = null;
    if (go === 'thu') {
      if (typeof dtShowSub === 'function') dtShowSub('dt-sub-thu');
      _dtThuCtFilter = ct;
      if (typeof dtPopulateThuCtFilter === 'function') dtPopulateThuCtFilter();   // option được chọn sẵn
      if (typeof renderThuTableTk === 'function') renderThuTableTk(0);
      focusEl = document.getElementById('dt-thu-ct-filter');
    } else {
      const btn = document.getElementById('cn-sub-thauphu-btn');
      if (btn && typeof cnGoSub === 'function') cnGoSub(btn, 'cn-sub-thauphu');
      _dtTpCtFilter = ct;
      if (typeof dtPopulateTpCtFilter === 'function') dtPopulateTpCtFilter();      // option được chọn sẵn
      if (typeof dtSetTpCtFilter === 'function') dtSetTpCtFilter(ct);
      focusEl = document.getElementById('dt-tp-ct-filter-sel');
    }
    // Cuộn tới bảng đã lọc để thấy ngay kết quả
    if (focusEl) focusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 150);
}

// Con số bấm được để xem chi tiết (go: thu | hdgoc | hoadon | thauphu). Số 0 → không tạo link.
function _lnLink(html, v, go, ctName) {
  if (!Math.round(v || 0) || !ctName) return html;
  return `<a href="#" class="ln-link" data-go="${go}" data-ct="${x(ctName)}" onclick="event.preventDefault();lnDrill(this)" title="Xem chi tiết: ${x(ctName)}">${html}</a>`;
}

// Tiêu đề cột sắp xếp được (icon: ⇅ chưa sắp · ↓ cao→thấp · ↑ thấp→cao)
function _lnSortTh(key, label, cls, title) {
  const on   = _lnSort.key === key;
  const icon = !on ? 'unfold_more' : (_lnSort.dir < 0 ? 'arrow_downward' : 'arrow_upward');
  return `<th class="text-end ln-sortable ${cls || ''}${on ? ' is-sorted' : ''}" onclick="lnSortBy('${key}')" title="${title ? title + ' — ' : ''}Bấm để sắp xếp theo số tiền">${label}<span class="material-symbols-outlined ln-sort-ic">${icon}</span></th>`;
}

// Tên Chủ đầu tư của công trình: hồ sơ khách hàng (customerId) → trường chuDauTu cũ
function _lnCdtOf(p) {
  const c = (p && p.customerId && typeof getCustomerById === 'function') ? getCustomerById(p.customerId) : null;
  return c ? (c.name || '') : ((p && p.chuDauTu) || '');
}

// ── TÍNH số liệu mọi công trình + vẽ mini dashboard, rồi vẽ bảng ──
// Gọi khi mở tab / đổi năm / dữ liệu đổi. Gõ tìm & sắp xếp chỉ gọi _lnRenderTable().
function renderLoiNhuan() {
  const wrap = document.getElementById('dt-loinhuan-wrap');
  const dash = document.getElementById('dt-ln-dashboard');
  if (!wrap) return;

  const _lnProjs = (typeof getAllProjects === 'function' ? getAllProjects() : [])
    .filter(p => p && p.id !== 'COMPANY');

  // Số liệu từng công trình — hàm dùng chung lnTinhCongTrinh (Hồ sơ Khách hàng cũng gọi)
  // Gắn thêm tên CĐT + bản KHÔNG DẤU của tên CT / CĐT (chuẩn hóa 1 lần, dùng cho mọi lần gõ tìm)
  const ctx = _lnContext();
  _lnRowsAll = _lnProjs.map(p => {
    const r = lnTinhCongTrinh(p, ctx);
    r.cdt   = _lnCdtOf(p);
    r._nName = _lnNorm(r.name);
    r._nCdt  = _lnNorm(r.cdt);
    return r;
  }).filter(r => r.dt || r.A || r.B || r.C || r.X || r.Y); // bỏ công trình không có dữ liệu

  _lnRowsAll.sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  // Ô tìm kiếm giữ chữ đang gõ (đồng bộ lại state khi tab được vẽ lại)
  const sEl = document.getElementById('ln-search');
  if (sEl) _lnSearch = _lnNorm(sEl.value);

  if (!_lnRowsAll.length) {
    if (dash) dash.innerHTML = '';
    wrap.innerHTML = '<div style="text-align:center;padding:32px;color:var(--bs-secondary-color);font-size:13px">Chưa có dữ liệu</div>';
    return;
  }

  // ── Mini dashboard (donut + bar) — luôn tính trên TOÀN BỘ công trình, không theo ô tìm ──
  const aChi = _lnSum(_lnRowsAll, 'A') + _lnSum(_lnRowsAll, 'B') + _lnSum(_lnRowsAll, 'C');
  const aDt  = _lnSum(_lnRowsAll, 'dt');
  if (dash) dash.innerHTML = _lnBuildDashboard(_lnRowsAll, aChi, aDt, aDt - aChi);

  _lnRenderTable();
}

// Cộng 1 cột số của danh sách dòng
function _lnSum(list, k) {
  return list.reduce((s, r) => s + (r[k] || 0), 0);
}

// ── VẼ BẢNG từ _lnRowsAll: áp ô tìm kiếm + sắp xếp ──
function _lnRenderTable() {
  const wrap = document.getElementById('dt-loinhuan-wrap');
  if (!wrap || !_lnRowsAll.length) return;

  const rowsData = _lnRowsAll.filter(r => _lnMatchSearch(r, _lnSearch));
  if (_lnSort.key) {
    const k = _lnSort.key, d = _lnSort.dir;
    rowsData.sort((a, b) => ((a[k] || 0) - (b[k] || 0)) * d || a.name.localeCompare(b.name, 'vi'));
  }

  // Tổng cộng (theo các dòng đang hiển thị)
  const tA = _lnSum(rowsData, 'A'), tB = _lnSum(rowsData, 'B'), tC = _lnSum(rowsData, 'C');
  const tDt = _lnSum(rowsData, 'dt'), tX = _lnSum(rowsData, 'X');
  const tChi = tA + tB + tC, tLN = tDt - tChi;

  // ── Bảng chi tiết (03/10/2026 — thiết kế lại theo "phân cấp thị giác") ──
  // Bố cục 4 khu vực, ngăn bằng kẻ dọc nhẹ:
  //   CÔNG TRÌNH | DOANH THU:          TỔNG ĐÃ THU (cash-basis) · HĐ gốc (chỉ tham chiếu)
  //              | CHI TIẾT CHI PHÍ:   Hóa đơn · Thầu phụ · CP chung · TỔNG CHI (+ badge % DT)
  //              | HIỆU QUẢ:           LỢI NHUẬN (badge xanh/đỏ)
  // (04/10/2026) Chi phí cash-basis: Thầu phụ = đã ứng; Hóa đơn = HĐ của NCC chưa ứng + đã ứng NCC.
  // Cột "HĐ gốc" (r.X) CHỈ HIỂN THỊ — KHÔNG tham gia Tổng chi / Lợi nhuận.
  // Số Đã thu / HĐ gốc / Hóa đơn / Thầu phụ của từng dòng bấm được → lnDrill() mở tab chi tiết đã lọc sẵn.
  // det=false (bấm "Thu gọn") → chỉ còn Công trình | Tổng thu | Tổng chi | Lợi nhuận.
  const det = _lnShowDetail;
  const SEP = 'ln-sep';   // class kẻ dọc ở ô ĐẦU mỗi khu vực (khu Doanh thu đã có kẻ ở mép cột tên)

  // 1 dòng dữ liệu (dùng chung cho từng công trình và dòng TỔNG CỘNG — dòng tổng không có link)
  const _rowCells = (r, link) => {
    const L = (html, v, go) => link ? _lnLink(html, v, go, r.name) : html;
    return `
      <td class="text-end ln-total">${L(_lnNum(r.dt), r.dt, 'thu')}</td>
      ${det ? `<td class="text-end ln-sub">${L(_lnNum(r.X), r.X, 'hdgoc')}</td>
               <td class="text-end ln-sub ${SEP}">${L(_lnNum(r.A), r.A, 'hoadon')}</td>
               <td class="text-end ln-sub">${L(_lnNum(r.B), r.B, 'thauphu')}</td>
               <td class="text-end ln-sub">${_lnNum(r.C)}</td>` : ''}
      ${_lnChiCell(r.chi, r.dt, det ? '' : SEP)}
      <td class="text-end ${SEP}">${_lnBadge(r.ln)}</td>`;
  };

  // Tên CĐT hiện nhỏ dưới tên công trình (để thấy vì sao dòng khớp khi tìm theo CĐT)
  const rows = rowsData.map(r => `<tr>
      <td class="ln-name">${x(r.name)}${r.cdt ? `<div class="ln-cdt">${x(r.cdt)}</div>` : ''}</td>${_rowCells(r, true)}
    </tr>`).join('');

  const totalRow = { dt: tDt, X: tX, A: tA, B: tB, C: tC, chi: tChi, ln: tLN };
  const colCount = det ? 9 : 5;

  wrap.innerHTML = `
    <div style="overflow-x:auto">
      <table class="table table-sm table-striped table-hover align-middle mb-0 ln-table" style="min-width:${det ? 1000 : 560}px">
        <thead>
          <tr class="ln-grp">
            <th class="ln-name" rowspan="2" style="text-align:left;vertical-align:bottom">Công trình</th>
            <th colspan="${det ? 2 : 1}">Doanh thu (VNĐ)</th>
            <th colspan="${det ? 4 : 1}" class="${SEP}">${det ? 'Chi tiết chi phí' : 'Chi phí'} (VNĐ)</th>
            <th class="${SEP}">Hiệu quả</th>
          </tr>
          <tr class="ln-col">
            ${_lnSortTh('dt', 'TỔNG ĐÃ THU', 'ln-th-total')}
            ${det ? _lnSortTh('X', 'HĐ gốc', '', 'Giá trị hợp đồng gốc — chỉ để tham chiếu, KHÔNG tính vào lợi nhuận')
                  + _lnSortTh('A', 'Hóa đơn', SEP, 'NCC đã ứng tiền → chỉ tính số đã ứng; NCC chưa ứng → tính theo hóa đơn')
                  + _lnSortTh('B', 'Thầu phụ', '', 'Tổng tiền đã ứng cho thầu phụ')
                  + _lnSortTh('C', 'CP chung', '') : ''}
            ${_lnSortTh('chi', 'TỔNG CHI <span class="fw-normal">(% DT)</span>', 'ln-th-total ' + (det ? '' : SEP), 'Badge xám = chi phí chiếm bao nhiêu % doanh thu')}
            ${_lnSortTh('ln', 'LỢI NHUẬN', 'ln-th-total ' + SEP)}
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="${colCount}" class="text-center text-secondary py-4" style="font-size:13px">Không có công trình / chủ đầu tư nào khớp từ khóa</td></tr>`}</tbody>
        <tfoot>
          <tr>
            <td class="ln-name" style="font-weight:700">TỔNG CỘNG${_lnSearch ? ` <span class="fw-normal text-secondary" style="font-size:11px">(${rowsData.length}/${_lnRowsAll.length} công trình khớp tìm kiếm)</span>` : ''}</td>${_rowCells(totalRow, false)}
          </tr>
        </tfoot>
      </table>
    </div>`;
}

// ── Dữ liệu dùng chung khi tính nhiều công trình 1 lượt (tính 1 lần, tránh lặp) ──
// (04/10/2026) Tách từ renderLoiNhuan để Hồ sơ Khách hàng (khachhang.ui.js) tính "Tổng giá trị
// khách hàng" bằng ĐÚNG công thức tab Lợi Nhuận → 2 nơi luôn cùng số. Theo NĂM ĐANG LỌC.
function _lnContext() {
  // Map phân bổ chi phí chung CÔNG TY theo projectId (tôn trọng năm đang lọc)
  const allocMap = {};
  if (typeof allocateCompanyCost === 'function') {
    allocateCompanyCost().forEach(a => { if (a && a.p) allocMap[a.p.id] = a.allocated || 0; });
  }
  // (A) Hóa đơn/vật tư (năm đang lọc)
  const invs = getInvoicesCached().filter(i => !i.deletedAt && _dtInYear(i.ngay));
  return { allocMap, invs };
}

// ── Số liệu Lời/Lỗ của 1 công trình (công thức tab Lợi Nhuận) ──
// ctx: kết quả _lnContext() (bỏ trống → tự tạo). Trả về { name, A, B, C, X, Y, chi, dt, ln }
function lnTinhCongTrinh(p, ctx) {
  ctx = ctx || _lnContext();
  // Helper: 1 bản ghi (hóa đơn) có thuộc công trình p không
  const _matchProj = (rec) =>
    (rec.projectId && rec.projectId === p.id) ||
    (!rec.projectId && ((resolveProjectName(rec) === p.name) || (rec.congtrinh === p.name)));
  // (04/10/2026) CASH-BASIS — chi phí tính theo tiền THỰC CHI:
  //   (B) Thầu phụ = Σ tiền ĐÃ ỨNG cho thầu phụ của CT (không lấy giá trị HĐ thầu phụ)
  //   (A) Hóa đơn  = Σ hóa đơn của các NCC CHƯA có phiếu ứng ở CT này
  //                + Σ tiền ĐÃ ỨNG cho NCC (NCC đã có phiếu ứng → bỏ giá trị hóa đơn, chỉ lấy số đã ứng)
  //   VD: CT A Nhựt, NCC "VLXD Phương" xuất HĐ 88tr nhưng mới ứng 40tr → cột Hóa đơn chỉ cộng 40tr.
  //   Cùng quy tắc với _ctTongChi() (projects.ui.js) của popup Chi tiết công trình.
  const ung = _lnUngCT(p);
  const A = ctx.invs.filter(_matchProj)
    .filter(i => !_lnNccDaUng(i, ung.nccSet))                  // NCC đã ứng → bỏ giá trị hóa đơn
    .reduce((s, i) => s + (i.thanhtien || i.tien || 0), 0)
    + ung.ungNcc;                                              // … thay bằng số tiền đã ứng NCC
  const B = ung.ungTp;                                         // (B) thầu phụ = đã ứng
  const C = ctx.allocMap[p.id] || 0;                          // (C) chi phí chung phân bổ
  // (X) HĐ gốc · (Y) quyết toán (chỉ để tham khảo, không vào doanh thu) · Doanh thu = đã thu
  // → tất cả lấy từ calcTongDoanhThu() (quyettoan.core.js) — nguồn duy nhất của công thức
  const _dt = calcTongDoanhThu(p);
  const X = _dt.hdGoc;
  const Y = _dt.qt;
  const chi = A + B + C;
  // (04/10/2026) Doanh thu = TỔNG ĐÃ THU thực tế (cash-basis), không còn là HĐ gốc + quyết toán
  const dt = _dt.doanhThu;
  return { id: p.id, name: p.name, A, B, C, X, Y, chi, dt, ln: dt - chi };
}

// ── Tiền ứng (thực chi) của công trình p — dùng cho cột Hóa đơn / Thầu phụ tab Lợi Nhuận ──
// Trả về { ungTp, ungNcc, nccSet }
//   ungTp / ungNcc : tổng phiếu ứng thầu phụ / nhà cung cấp của CT (theo NĂM ĐANG LỌC)
//   nccSet         : tên NCC (đã chuẩn hóa) mà CT này ĐÃ TỪNG ứng (toàn bộ lịch sử — giống _ctTongChi)
function _lnUngCT(p) {
  const out = { ungTp: 0, ungNcc: 0, nccSet: new Set() };
  if (typeof ungRecords === 'undefined') return out;
  ungRecords.forEach(r => {
    if (!r || r.deletedAt) return;
    if (r.loai !== 'thauphu' && r.loai !== 'nhacungcap') return;
    if (!(r.projectId ? r.projectId === p.id : r.congtrinh === p.name)) return;
    if (r.loai === 'nhacungcap') {
      const nm = _lnNormNcc(recCatName(r, 'ung', 'tp') || r.tp);
      if (nm) out.nccSet.add(nm);
    }
    if (!_dtInYear(r.ngay)) return;
    if (r.loai === 'thauphu') out.ungTp += (r.tien || 0);
    else out.ungNcc += (r.tien || 0);
  });
  return out;
}

// Chuẩn hóa tên NCC để so khớp (bỏ khoảng trắng thừa, không phân biệt hoa/thường)
function _lnNormNcc(s) {
  return String(s || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

// Hóa đơn có thuộc NCC nằm trong danh sách "đã ứng tiền" của công trình không
function _lnNccDaUng(inv, nccSet) {
  if (!nccSet || !nccSet.size) return false;
  const nm = _lnNormNcc((typeof recCatName === 'function' ? recCatName(inv, 'inv', 'ncc') : '') || inv.ncc);
  return !!nm && nccSet.has(nm);
}

// (B) Tổng giá trị HĐ thầu phụ thuộc công trình p (năm đang lọc)
// (04/10/2026) Tab Lợi Nhuận KHÔNG còn dùng (cột Thầu phụ = đã ứng) — giữ lại để tham khảo.
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

  // Nạp dropdown 2 form + bộ lọc + vẽ 3 thẻ thống kê và mọi bảng của 2 subtab
  dtPopulateSels();

  // Set ngày mặc định = hôm nay nếu chưa có
  const ngayEl = document.getElementById('thu-ngay');
  if (ngayEl && !ngayEl.value) ngayEl.value = today();
  const hdcNgayEl = document.getElementById('hdc-ngay');
  if (hdcNgayEl && !hdcNgayEl.value) hdcNgayEl.value = today();
  const hdtpNgayEl = document.getElementById('hdtp-ngay');
  if (hdtpNgayEl && !hdtpNgayEl.value) hdtpNgayEl.value = today();

  // (03/10/2026) KHÔNG ép về subtab đầu và KHÔNG xóa form HĐ Chính / Thu Tiền khi mở lại tab:
  // form nay nằm thẳng trên màn hình → giữ nguyên subtab + nội dung đang nhập dở.
  // (03/10/2026) Form HĐ Thầu Phụ cũng đã ra ngoài màn hình (tab Công Nợ) → KHÔNG reset ở đây nữa,
  // tránh mất nội dung đang nhập dở bên tab Công Nợ khi ghé qua tab Doanh Thu.
}

// ── Init tab LỢI NHUẬN khi mở (02/10/2026 — tab chính riêng) ──
// Nạp lại dữ liệu HĐ chính / thầu phụ / quyết toán mới nhất rồi vẽ dashboard + bảng.
// (Trước đây phần nạp này nằm trong initDoanhThu vì Lợi nhuận là sub-tab của Doanh Thu.)
function initLoiNhuan() {
  hopDongData      = load('hopdong_v1', {});
  thauPhuContracts = load('thauphu_v1', []);
  quyetToanRecords = load('quyettoan_v1', []);
  renderLoiNhuan();
}

// Cấp ra global theo yêu cầu
window.initDoanhThu = initDoanhThu;
window.initLoiNhuan = initLoiNhuan;
window.lnDrill = lnDrill;
window.lnSortBy = lnSortBy;
window.lnSetSearch = lnSetSearch;
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
