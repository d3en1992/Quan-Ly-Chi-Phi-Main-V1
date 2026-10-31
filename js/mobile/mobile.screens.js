// ══════════════════════════════════════════════════════════════
// mobile.screens.js — Hàm render từng màn hình của giao diện điện thoại
// Load order: sau mobile.core.js, trước mobile.actions.js
//
// QUY TẮC:
//   - File này CHỈ ĐỌC dữ liệu, không ghi. Mọi hành động ghi nằm ở mobile.actions.js.
//   - Số liệu phải trùng khít với bản desktop → luôn dùng lại helper sẵn có:
//       getInvoicesCached() · inActiveYear() · _buildInvoiceMap() ·
//       _ctGetCostsFromMap() · _ctTongChi() · _hdLookup() · ttBuildRows() ·
//       allocateCompanyCost() · ccSundayISO() / ccSaturdayISO() ...
//   - Mỗi hàm trả về chuỗi HTML.
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════
//  HELPER DỮ LIỆU DÙNG CHUNG
// ══════════════════════════════

/** Toàn bộ hóa đơn còn hiệu lực trong năm đang chọn (gồm cả HĐ sinh từ chấm công) */
function mbInvoices() {
  if (typeof getInvoicesCached !== 'function') return [];
  return getInvoicesCached().filter(i => !i.deletedAt && inActiveYear(i.ngay));
}

/** Tiền của một hóa đơn */
function mbInvAmount(i) { return i.thanhtien || i.tien || 0; }

/** Bản đồ hóa đơn theo công trình — build 1 lần cho mỗi lần render danh sách */
function mbInvMap() {
  return (typeof _buildInvoiceMap === 'function') ? _buildInvoiceMap() : { byId: {}, byName: {}, all: [] };
}

/**
 * Chỉ số tài chính của một công trình — DÙNG ĐÚNG công thức của bản desktop.
 * @returns {{ hd, dt, qt, conThu, chi, thu, invs, hoaDon, ungTp, ungNcc }}
 *   hd     — tổng giá trị hợp đồng chính (giaTri + giaTriphu + phatSinh)
 *   dt     — DOANH THU SAU QUYẾT TOÁN (năm đang chọn) — calcTongDoanhThu() của desktop
 *   qt     — tổng ảnh hưởng quyết toán (±) · conThu — còn phải thu = dt − đã thu
 *   chi    — TỔNG CHI công trình (_ctTongChi: HĐ + ứng TP + ứng NCC − công nợ NCC)
 *   thu    — tổng tiền đã thu trong năm
 *   hoaDon — tổng tiền hóa đơn thuần (c.total)
 */
function mbProjStats(p, invMap) {
  const c = (typeof _ctGetCostsFromMap === 'function')
    ? _ctGetCostsFromMap(p, invMap || mbInvMap())
    : { total: 0, count: 0, invs: [] };

  const tc = (typeof _ctTongChi === 'function')
    ? _ctTongChi(p, c)
    : { tongChi: c.total, ungTp: 0, ungNcc: 0 };

  const hdct = (typeof _hdLookup === 'function') ? (_hdLookup(p.id) || _hdLookup(p.name)) : null;
  const hd   = hdct ? (hdct.giaTri || 0) + (hdct.giaTriphu || 0) + (hdct.phatSinh || 0) : 0;

  const thu = (typeof thuRecords !== 'undefined') ? thuRecords.filter(r => {
    if (r.deletedAt || !inActiveYear(r.ngay)) return false;
    return r.projectId ? r.projectId === p.id : r.congtrinh === p.name;
  }).reduce((s, r) => s + (r.tien || 0), 0) : 0;

  // Doanh thu sau quyết toán — cùng công thức với tab Doanh Thu / Quyết Toán bản desktop
  const d = (typeof calcTongDoanhThu === 'function') ? calcTongDoanhThu(p) : { tongDT: hd, qt: 0 };

  return { hd, dt: d.tongDT, qt: d.qt, conThu: d.tongDT - thu,
           chi: tc.tongChi, thu, invs: c.invs, hoaDon: c.total, ungTp: tc.ungTp, ungNcc: tc.ungNcc };
}

/** Bản ghi (hóa đơn/ứng/thu...) có thuộc công trình p không */
function mbBelongs(rec, p) {
  return rec.projectId ? rec.projectId === p.id : (rec.congtrinh || '') === p.name;
}

/** Nhãn + màu trạng thái công trình */
const MB_STATUS = {
  planning:  ['Kế hoạch',      'gray'],
  active:    ['Đang thi công', 'green'],
  completed: ['Hoàn thành',    'blue'],
  closed:    ['Đã quyết toán', 'red'],
};

const MB_UNG_LABEL   = { thauphu: 'Thầu phụ', nhacungcap: 'Nhà cung cấp', congnhan: 'Công nhân' };

// ══════════════════════════════
//  BỘ ĐỊNH TUYẾN MÀN HÌNH
// ══════════════════════════════
function mbScreen(tab) {
  switch (tab) {
    case 'dashboard': return mbScrDashboard();
    case 'congtrinh': return mbScrProjects();
    case 'detail':    return mbScrProjectDetail();
    case 'nhap':      return mbScrNhap();
    case 'chamcong':  return mbScrChamCong();
    case 'tienung':   return mbScrTienUng();
    case 'doanhthu':  return mbScrDoanhThu();
    case 'congno':    return mbScrCongNo();
    case 'thietbi':   return mbScrThietBi();
    case 'thongke':   return mbScrThongKe();
    case 'tytrong':   return mbScrTyTrong();
    case 'quyettoan': return mbScrQuyetToan();
    case 'danhmuc':   return mbScrDanhMuc();
    case 'more':      return mbScrMore();
    default:          return `<div class="mb-pad"><div class="mb-empty">Màn hình chưa có</div></div>`;
  }
}

// ══════════════════════════════════════════════════════════════
//  1 · TỔNG QUAN (dashboard)
// ══════════════════════════════════════════════════════════════
function mbScrDashboard() {
  const invs   = mbInvoices();
  const invMap = mbInvMap();
  const P      = mbProjects();

  const totChi = invs.reduce((s, i) => s + mbInvAmount(i), 0);

  let totHd = 0, totThu = 0;   // totHd = tổng DOANH THU sau quyết toán
  const rows = P.map(p => {
    const st = mbProjStats(p, invMap);
    totHd  += st.dt;
    totThu += st.thu;
    return { p, st };
  });

  // ── Biểu đồ 6 tuần gần nhất (theo ngày hóa đơn) ──
  const weeks = [];
  for (let k = 5; k >= 0; k--) {
    const sun = (typeof ccSundayISO === 'function') ? ccSundayISO(-k) : '';
    const sat = (typeof ccSaturdayISO === 'function') ? ccSaturdayISO(sun) : '';
    const tien = invs.filter(i => i.ngay && i.ngay >= sun && i.ngay <= sat)
                     .reduce((s, i) => s + mbInvAmount(i), 0);
    weeks.push({ sun, sat, tien, label: (typeof viShort === 'function') ? viShort(sun) : sun });
  }
  const maxWeek = Math.max(1, ...weeks.map(w => w.tien));

  const top = rows.filter(r => r.st.chi > 0).sort((a, b) => b.st.chi - a.st.chi).slice(0, 5);
  const maxChi = top.length ? top[0].st.chi : 1;

  const kpis = [
    { cls: '',      label: 'Tổng chi phí',       value: mbFmt(totChi),          hint: invs.length + ' hóa đơn' },
    { cls: '',      label: 'Giá trị HĐ (sau QT)', value: mbFmt(totHd),           hint: P.length + ' công trình' },
    { cls: 'green', label: 'Đã thu',             value: mbFmt(totThu),          hint: mbPct(totThu, totHd) + '% doanh thu' },
    { cls: 'blue',  label: 'Lợi nhuận tạm tính', value: mbFmtSigned(totThu - totChi), hint: 'Đã thu − chi phí' },
  ];

  // ── ⚡ Việc cần chú ý (chỉ hiện mục có số lượng > 0; bấm → nhảy tới màn tương ứng) ──
  const nOver  = rows.filter(r => r.st.hd > 0 && r.st.chi / r.st.hd > 0.85).length;
  const nDone  = P.filter(p => p.status === 'completed').length;
  const cnRows = (typeof ttBuildRows === 'function') ? ttBuildRows() : [];
  const cnDebt = cnRows.reduce((s, r) => s + (r.con || 0), 0);
  const nTb    = (typeof tbData !== 'undefined' ? tbData : [])
    .filter(t => !t.deletedAt && (t.tinhtrang === 'Cần bảo trì' || t.tinhtrang === 'Cần sửa chữa')).length;
  const alerts = [
    [nOver,       '🔴', `${nOver} công trình vượt 85% ngân sách hợp đồng`,                     'over'],
    [nDone,       '🟠', `${nDone} công trình đã hoàn thành nhưng chưa quyết toán`,             'completed'],
    [cnDebt > 0,  '💳', `Nợ thầu phụ & nhà cung cấp chưa tất toán: ${mbFmt(cnDebt)} (${cnRows.length} đối tác)`, 'congno'],
    [nTb,         '🔧', `${nTb} dòng thiết bị đang báo Cần bảo trì / Cần sửa chữa`,           'thietbi'],
  ].filter(a => a[0]);

  return `<div class="mb-pad" style="gap:14px">
    <div class="mb-grid2">
      ${kpis.map(k => `<div class="mb-kpi ${k.cls}">
        <div class="mb-kpi-label">${k.label}</div>
        <div class="mb-kpi-value">${mbX(k.value)}</div>
        <div class="mb-kpi-hint">${mbX(k.hint)}</div>
      </div>`).join('')}
    </div>

    ${alerts.length ? `<div class="mb-card" style="border-color:var(--mb-amber-b);background:var(--mb-amber-l)">
      <div class="mb-sec-title" style="margin-bottom:8px;color:#92400E">⚡ Việc cần chú ý</div>
      <div class="mb-col" style="gap:6px">
        ${alerts.map(([, icon, text, arg]) => `<div class="mb-row-between" style="align-items:center;background:#fff;border-radius:10px;padding:9px 11px;cursor:pointer" data-act="alertGo" data-arg="${arg}">
          <span style="font-size:12.5px;font-weight:600">${icon} ${mbX(text)}</span>
          <svg width="7" height="12" viewBox="0 0 8 13" style="flex-shrink:0"><path d="M1 1l6 5.5L1 12" stroke="#D1D5DB" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
        </div>`).join('')}
      </div>
    </div>` : ''}

    <div class="mb-card">
      <div class="mb-sec-head" style="margin-bottom:12px">
        <div class="mb-sec-title">Chi phí 6 tuần gần nhất</div>
        <div style="font-size:11px;color:var(--mb-muted-2)">triệu đ</div>
      </div>
      <div class="mb-bars">
        ${weeks.map((w, i) => `<div class="${i === weeks.length - 1 ? 'last' : ''}" data-act="weekTip" data-arg="${i}">
          <b>${Math.round(w.tien / 1e6) || 0}</b>
          <s style="height:${Math.round((w.tien / maxWeek) * 68)}px"></s>
          <span>${mbX(w.label)}</span>
        </div>`).join('')}
      </div>
    </div>

    <div>
      <div class="mb-sec-head">
        <div class="mb-sec-title">Top công trình theo chi phí</div>
        <div class="mb-link" data-act="go" data-arg="congtrinh">Tất cả</div>
      </div>
      <div class="mb-col">
        ${top.length ? top.map(({ p, st }) => `
          <div class="mb-card mb-card-sm tap" data-act="openProject" data-arg="${mbX(p.id)}">
            <div class="mb-row-between" style="margin-bottom:7px">
              <div style="font-size:13px;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${mbX(p.name)}</div>
              <div style="font-size:13px;font-weight:800;flex-shrink:0">${mbFmt(st.chi)}</div>
            </div>
            <div class="mb-bar thin"><i style="width:${mbBarW(st.chi, maxChi)};background:${st.hd > 0 && st.chi > st.hd ? 'var(--mb-red)' : 'var(--mb-primary)'}"></i></div>
          </div>`).join('')
        : '<div class="mb-empty">Chưa có chi phí trong năm này</div>'}
      </div>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  2 · CÔNG TRÌNH
// ══════════════════════════════════════════════════════════════
function mbScrProjects() {
  const invMap = mbInvMap();
  const q = (MB.search || '').toLowerCase();

  // 'over' = lọc đặc biệt từ khối "Việc cần chú ý": chi phí vượt 85% giá trị hợp đồng
  const all = mbProjects().map(p => ({ p, st: mbProjStats(p, invMap) }));
  const isOver = r => r.st.hd > 0 && r.st.chi / r.st.hd > 0.85;
  const list = all
    .filter(r => MB.statusFilter === 'all' || (MB.statusFilter === 'over' ? isOver(r) : r.p.status === MB.statusFilter))
    .filter(r => ((r.p.name || '') + ' ' + (r.p.chuDauTu || '')).toLowerCase().includes(q));

  const chips = [['all', 'Tất cả'], ['active', 'Đang thi công'], ['completed', 'Hoàn thành'],
                 ['planning', 'Kế hoạch'], ['closed', 'Đã quyết toán']];
  if (MB.statusFilter === 'over') chips.push(['over', 'Vượt 85% ngân sách']);
  const showNewForm = MB.projFormOpen && !MB.projForm.id;

  return `<div class="mb-pad">
    <div class="mb-search">
      ${mbSearchIcon()}
      <input id="mb-in-search" data-in="search" data-live="1" value="${mbX(MB.search)}" placeholder="Tìm công trình, chủ đầu tư..."/>
    </div>

    <div class="mb-chips">
      ${chips.map(([k, l]) => `<div class="mb-chip${MB.statusFilter === k ? ' on' : ''}" data-act="setFilter" data-arg="statusFilter|${k}">${l}</div>`).join('')}
    </div>

    ${showNewForm ? mbProjFormHtml() : `<button class="mb-btn dashed" data-act="toggleProjForm">+ Tạo công trình mới</button>`}

    <div class="mb-col" style="gap:10px">
      ${list.length ? list.map(({ p, st }) => {
        const lai = st.thu - st.chi;
        const pct = mbPct(st.chi, st.hd);
        const [stLabel, stCls] = MB_STATUS[p.status] || ['—', 'gray'];
        const days = (typeof getProjectDays === 'function') ? getProjectDays(p) : 0;
        const type = p.type === 'CT' ? 'Công trình mới' : p.type === 'SC' ? 'Sửa chữa' : 'Khác';
        return `<div class="mb-card tap" data-act="openProject" data-arg="${mbX(p.id)}">
          <div class="mb-row-between" style="margin-bottom:5px">
            <div style="font-size:14.5px;font-weight:700;line-height:1.25">${mbX(p.name)}</div>
            <span class="mb-tag ${stCls}">${stLabel}</span>
          </div>
          <div style="font-size:11.5px;color:var(--mb-muted);margin-bottom:11px">${mbX(p.chuDauTu || 'Chưa có Chủ đầu tư')} · ${type} · ${days} ngày</div>
          <div class="mb-grid3" style="margin-bottom:10px">
            <div><div style="font-size:10px;color:var(--mb-muted-2);margin-bottom:2px">Hợp đồng</div><div style="font-size:12px;font-weight:700">${mbFmt(st.hd)}</div></div>
            <div><div style="font-size:10px;color:var(--mb-muted-2);margin-bottom:2px">Đã chi</div><div style="font-size:12px;font-weight:700">${mbFmt(st.chi)}</div></div>
            <div><div style="font-size:10px;color:var(--mb-muted-2);margin-bottom:2px">Lãi / Lỗ</div><div style="font-size:12px;font-weight:800;color:${lai >= 0 ? 'var(--mb-green)' : 'var(--mb-red)'}">${mbFmtSigned(lai)}</div></div>
          </div>
          <div class="mb-bar"><i style="width:${mbBarW(st.chi, st.hd)};background:${pct > 100 ? 'var(--mb-red)' : pct > 85 ? 'var(--mb-amber)' : 'var(--mb-primary)'}"></i></div>
          <div class="mb-row-between" style="margin-top:5px;font-size:10.5px;color:var(--mb-muted-2)">
            <span>Tỷ lệ Chi / Hợp đồng</span><span style="font-weight:700;color:var(--mb-text-2)">${pct}%</span>
          </div>
        </div>`;
      }).join('') : '<div class="mb-empty">Không có công trình phù hợp</div>'}
    </div>
  </div>`;
}

/**
 * Form tạo mới / sửa công trình (V2). Lưu qua createProject() / updateProject() của
 * projects.model.js + getOrCreateCustomerByName() — đồng bộ 100% với bản máy tính.
 * Địa chỉ công trình lưu ở `note` (giống form desktop).
 */
function mbProjFormHtml() {
  const f = MB.projForm;
  const canPhone = (typeof khCanSeePhone === 'function') ? khCanSeePhone() : mbRole() !== 'ketoan';
  const custs = (typeof getAllCustomers === 'function') ? getAllCustomers() : [];
  const maxLen = (typeof CT_NAME_MAX !== 'undefined') ? CT_NAME_MAX : 45;
  const LOAI = [['CT', 'Công trình mới'], ['SC', 'Sửa chữa'], ['OTHER', 'Khác']];

  return `<div class="mb-card" style="display:flex;flex-direction:column;gap:10px;border-color:#BFDBFE">
    <div class="mb-sec-title">${f.id ? 'Sửa thông tin công trình' : 'Tạo công trình mới'}</div>

    <div><div class="mb-label">Phân loại</div>
      <div class="mb-chips even">
        ${LOAI.map(([k, l]) => `<div class="mb-chip${f.loai === k ? ' on' : ''}" data-act="setPath" data-arg="projForm.loai|${k}">${l}</div>`).join('')}
      </div></div>

    <div><div class="mb-label">Tên chủ đầu tư</div>
      <input id="mb-pf-kh" class="mb-input" list="mb-dl-kh" data-in="projForm.kh" data-onchange="projKhPicked" value="${mbX(f.kh)}" placeholder="Nhập hoặc chọn khách hàng"/>
      <datalist id="mb-dl-kh">${custs.map(c => `<option value="${mbX(c.name)}">`).join('')}</datalist></div>

    ${canPhone ? `<div><div class="mb-label">Số điện thoại Chủ đầu tư</div>
      <input id="mb-pf-phone" class="mb-input" type="tel" inputmode="tel" data-in="projForm.phone" value="${mbX(f.phone)}" placeholder="VD: 0909 123 456"/></div>` : ''}

    <div>
      <div class="mb-label-row">
        <div class="mb-label">Tên công trình (tối đa ${maxLen} ký tự)</div>
        <span class="mb-link" style="font-size:11.5px" data-act="projSuggestName">Gợi ý tên</span>
      </div>
      <input id="mb-pf-name" class="mb-input" maxlength="${maxLen}" data-in="projForm.name" value="${mbX(f.name)}" placeholder="Để trống → tự đặt theo tên Chủ đầu tư"/></div>

    <div><div class="mb-label">Địa chỉ thi công</div>
      <input id="mb-pf-diachi" class="mb-input" data-in="projForm.diachi" value="${mbX(f.diachi)}" placeholder="Số nhà, đường, phường / xã..."/></div>

    <div class="mb-row">
      <div class="mb-field"><div class="mb-label">Ngày bắt đầu</div>
        <input id="mb-pf-ngay" class="mb-input" type="date" data-in="projForm.ngay" value="${mbX(f.ngay)}"/></div>
      <div class="mb-field"><div class="mb-label">Hệ số phân bổ</div>
        <input id="mb-pf-heso" class="mb-input" inputmode="decimal" data-in="projForm.heSo" value="${mbX(f.heSo)}" placeholder="1"/></div>
    </div>

    <div style="display:flex;gap:9px">
      <button class="mb-btn gray" style="flex:1" data-act="closeProjForm">Hủy</button>
      <button class="mb-btn green" style="flex:2" data-act="saveProjMb">💾 Lưu công trình</button>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  3 · CHI TIẾT CÔNG TRÌNH
// ══════════════════════════════════════════════════════════════
/** Khách hàng (Chủ đầu tư) của công trình: theo customerId, công trình cũ thì dò theo tên */
function mbProjCustomer(p) {
  if (!p) return null;
  return (p.customerId && typeof getCustomerById === 'function' ? getCustomerById(p.customerId) : null)
    || (p.chuDauTu && typeof findCustomerByName === 'function' ? findCustomerByName(p.chuDauTu) : null);
}

function mbScrProjectDetail() {
  const p = mbProject(MB.projectId);
  if (!p) return `<div class="mb-pad"><div class="mb-empty">Không tìm thấy công trình</div></div>`;

  const seg = MB.seg.detail;
  const st  = mbProjStats(p, mbInvMap());

  if (seg === 'chi')  return mbPdChiPhi(p, st);
  if (seg === 'cc')   return mbPdChamCong(p);
  if (seg === 'ung')  return mbPdTienUng(p);

  // ── Tổng quan ──
  // Kế toán: ẩn doanh thu / lãi lỗ + không đổi trạng thái (khớp phân quyền bản desktop); đơn giá đ/m² vẫn xem được
  const isKt = mbRole() === 'ketoan';
  const lai  = st.thu - st.chi;
  const days = (typeof getProjectDays === 'function') ? getProjectDays(p) : 0;
  const k    = (typeof getProjectK === 'function') ? getProjectK(p) : 1;
  const pct  = mbPct(st.chi, st.hd);

  // Chỉ số Tỉ trọng 3.0 (diện tích sàn + 4 nhóm chi phí) — trọn vòng đời công trình.
  // (31/10/2026) Mở cho cả Kế toán — khớp desktop (tab Tỉ trọng mở mọi vai trò từ 09/10/2026).
  let tyt = null;
  if (typeof tytTongHop === 'function') {
    try { tyt = tytTongHop(p, { allYears: true }); } catch (e) { console.warn('[mobile] tytTongHop', e); }
  }
  const m2 = v => (typeof tytFmtM2 === 'function') ? tytFmtM2(v) : String(Math.round(v * 100) / 100);

  // [nhãn, giá trị, màu, nhạy cảm (ẩn với Kế toán)]
  const rows = [
    ['Giá trị hợp đồng',  mbFull(st.hd),           '', true],
    ['Quyết toán (±)',    st.qt ? (st.qt > 0 ? '+' : '-') + mbFull(Math.abs(st.qt)) : '0 đ', st.qt < 0 ? 'var(--mb-red)' : (st.qt > 0 ? 'var(--mb-green)' : 'var(--mb-muted)'), true],
    ['Hợp đồng sau quyết toán', mbFull(st.dt),     'var(--mb-primary)', true],
    ['Tổng chi phí',      mbFull(st.chi),          '', false],
    ['— trong đó hóa đơn', mbFull(st.hoaDon),      'var(--mb-muted)', false],
    ['— ứng thầu phụ',    mbFull(st.ungTp),        'var(--mb-muted)', false],
    ['Đã thu',            mbFull(st.thu),          'var(--mb-green)', true],
    ['Còn phải thu',      mbFull(st.conThu),       st.conThu < 0 ? 'var(--mb-red)' : 'var(--mb-amber)', true],
    ['Lãi / lỗ tạm tính', mbFull(lai),             lai >= 0 ? 'var(--mb-green)' : 'var(--mb-red)', true],
    ['Số ngày thi công',  days + ' ngày (Hệ số ' + k + ')', '', false],
  ];
  if (tyt && tyt.tongSan > 0) rows.push(
    ['Tổng diện tích sàn quy đổi',          m2(tyt.tongSan) + ' m²',         'var(--mb-purple)', false],
    ['Đơn giá Phần thô & Nhân công / m²',   mbFull(tyt.cpM2N1 || 0) + '/m²', 'var(--mb-purple)', false],
    ['Đơn giá Toàn bộ công trình / m²',     mbFull(tyt.cpM2 || 0) + '/m²',   'var(--mb-purple)', false],
  );
  const shownRows = rows.filter(r => !(isKt && r[3]));

  // 4 nút thao tác nhanh — chuyển sang form tương ứng, chọn sẵn công trình này
  const quick = [
    ['nhap',     'add_circle',     'Nhập chi phí'],
    ['chamcong', 'calendar_month', 'Chấm công'],
    ['tienung',  'payments',       'Ứng tiền'],
    ['thu',      'savings',        'Thu tiền'],
  ].filter(q => q[0] !== 'thu' || mbCanSee('doanhthu'));

  const [stLabel, stCls] = MB_STATUS[p.status] || ['—', 'gray'];

  // Thanh Chủ đầu tư: tên · địa chỉ · Gọi điện 1 chạm · Sửa công trình
  const c     = mbProjCustomer(p);
  const canPh = (typeof khCanSeePhone === 'function') ? khCanSeePhone() : !isKt;
  const phone = (c && c.phone && canPh) ? c.phone : '';
  const addr  = p.note || (c && c.address) || '';
  const editing = MB.projFormOpen && MB.projForm.id === p.id;

  // Cơ cấu 4 nhóm chi phí
  const NHOM = (typeof TYT_NHOM !== 'undefined') ? TYT_NHOM : {};
  const nhomRows = tyt ? [1, 2, 3, 4, 0]
    .map(n => [n, (tyt.theoNhom && tyt.theoNhom[n]) || 0])
    .filter(([n, v]) => n !== 0 || v > 0) : [];
  const NHOM_COLOR = MB_NHOM_COLOR;

  return `<div class="mb-pad">
    ${editing ? mbProjFormHtml() : `<div class="mb-card mb-card-sm" style="display:flex;align-items:center;gap:10px">
      <div style="width:36px;height:36px;border-radius:18px;background:var(--mb-primary-l);color:var(--mb-primary);display:flex;align-items:center;justify-content:center;flex-shrink:0">${mbIcon('person', 20)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${mbX((c && c.name) || p.chuDauTu || 'Chưa có Chủ đầu tư')}</div>
        <div style="font-size:11px;color:var(--mb-muted-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${mbX(addr || 'Chưa có địa chỉ thi công')}</div>
      </div>
      ${phone ? `<a class="mb-btn-outline green" style="text-decoration:none" href="tel:${mbX(phone.replace(/[^\d+]/g, ''))}">📞 Gọi điện</a>` : ''}
    </div>
    <button class="mb-btn-outline blue" style="align-self:flex-start" data-act="editProjMb">✏️ Sửa thông tin công trình</button>`}

    <div class="mb-qa" style="grid-template-columns:repeat(${quick.length},1fr)">
      ${quick.map(([arg, icon, label]) => `<div data-act="shortcut" data-arg="${arg}">${mbIcon(icon, 22)}${label}</div>`).join('')}
    </div>

    ${isKt
      ? `<div class="mb-row-between" style="align-items:center"><span style="font-size:12px;color:var(--mb-muted)">Trạng thái</span><span class="mb-tag ${stCls}">${stLabel}</span></div>`
      : `<div>
          <div class="mb-label">Trạng thái công trình</div>
          <div class="mb-chips">
            ${['active', 'completed', 'planning', 'closed'].map(s => `<div class="mb-chip${p.status === s ? ' on' : ''}" data-act="changeProjStatus" data-arg="${s}">${MB_STATUS[s][0]}</div>`).join('')}
          </div>
        </div>`}

    <div class="mb-list">
      ${shownRows.map(([l, v, col]) => `<div class="mb-list-row" style="justify-content:space-between">
        <span style="font-size:12.5px;color:var(--mb-muted)">${mbX(l)}</span>
        <span style="font-size:13px;font-weight:700;text-align:right;color:${col || 'var(--mb-text)'}">${mbX(v)}</span>
      </div>`).join('')}
    </div>

    ${isKt ? '' : `<div class="mb-kpi blue" style="border-radius:14px;padding:14px">
      <div class="mb-row-between" style="margin-bottom:9px">
        <span style="font-size:12.5px;font-weight:600;color:var(--mb-primary-d)">Tỷ lệ chi phí / hợp đồng</span>
        <span style="font-size:13px;font-weight:800;color:var(--mb-primary-d)">${pct}%</span>
      </div>
      <div class="mb-bar" style="height:8px;background:#DBEAFE"><i style="width:${mbBarW(st.chi, st.hd)};background:var(--mb-primary)"></i></div>
    </div>`}

    ${tyt && tyt.tongChi > 0 ? `<div class="mb-card">
      <div class="mb-sec-head" style="margin-bottom:11px">
        <div class="mb-sec-title">Cơ cấu 4 Nhóm Chi Phí</div>
        <div style="font-size:11px;color:var(--mb-muted-2)">trọn vòng đời · ${mbFmt(tyt.tongChi)}</div>
      </div>
      <div class="mb-col" style="gap:10px">
        ${nhomRows.map(([n, v]) => `<div>
          <div class="mb-row-between" style="margin-bottom:4px">
            <span style="font-size:12px;color:var(--mb-text-2);font-weight:600">${n ? 'Nhóm ' + n + ': ' : ''}${mbX((NHOM[n] && NHOM[n].ten) || '')}</span>
            <span style="font-size:12.5px;font-weight:800;flex-shrink:0">${mbFmt(v)} <span style="font-weight:600;color:var(--mb-muted-2)">· ${mbPct(v, tyt.tongChi)}%</span></span>
          </div>
          <div class="mb-bar"><i style="width:${mbBarW(v, tyt.tongChi)};background:${NHOM_COLOR[n]}"></i></div>
        </div>`).join('')}
      </div>
    </div>` : ''}

    <div class="mb-btn-row">
      ${mbCanSee('quyettoan') ? `<button class="mb-btn-outline green" data-act="openQtFor" data-arg="${mbX(p.id)}">${mbIcon('fact_check', 16)} Quyết toán</button>` : ''}
      <button class="mb-btn-outline blue" data-act="openTyTrong" data-arg="${mbX(p.id)}">${mbIcon('stacked_bar_chart', 16)} Tỉ trọng & định mức</button>
    </div>
  </div>`;
}

/** Chi phí của công trình: thẻ tổng ở ĐẦU + ô tìm + chip lọc theo loại chi phí */
function mbPdChiPhi(p, st) {
  const NO_LOAI = '(Không phân loại)';
  const byLoai = {};
  st.invs.forEach(i => { const k = i.loai || NO_LOAI; byLoai[k] = (byLoai[k] || 0) + mbInvAmount(i); });
  const loaiRows = Object.entries(byLoai).sort((a, b) => b[1] - a[1]);
  const loai = (MB.pdLoai && byLoai[MB.pdLoai] !== undefined) ? MB.pdLoai : '';
  const q = (MB.pdSearch || '').toLowerCase();

  const list = st.invs
    .filter(i => !loai || (i.loai || NO_LOAI) === loai)
    .filter(i => !q || ((i.nd || '') + ' ' + (i.ncc || '')).toLowerCase().includes(q))
    .sort((a, b) => (b.ngay || '').localeCompare(a.ngay || ''));
  const filtered = !!(loai || q);
  const shown = list.reduce((s, i) => s + mbInvAmount(i), 0);

  return `<div class="mb-pad">
    <div class="mb-card mb-card-sm" style="background:#F9FAFB">
      <div class="mb-row-between" style="align-items:baseline">
        <span style="font-size:12.5px;font-weight:700;color:#374151">Tổng chi phí hóa đơn</span>
        <span style="font-size:15px;font-weight:800">${mbFull(st.hoaDon)}</span>
      </div>
      ${filtered ? `<div class="mb-row-between" style="margin-top:4px;font-size:11.5px;color:var(--mb-muted)">
        <span>Đang lọc: ${list.length} hóa đơn</span><span style="font-weight:700;color:var(--mb-primary)">${mbFull(shown)}</span>
      </div>` : ''}
    </div>

    <div class="mb-search">
      ${mbSearchIcon()}
      <input id="mb-in-pdsearch" data-in="pdSearch" data-live="1" value="${mbX(MB.pdSearch)}" placeholder="Tìm nội dung, nhà cung cấp..."/>
    </div>

    <div class="mb-chips">
      <div class="mb-chip${loai ? '' : ' on'}" data-act="setFilter" data-arg="pdLoai|">Tất cả (${mbFmt(st.hoaDon)})</div>
      ${loaiRows.map(([l, v]) => `<div class="mb-chip${loai === l ? ' on' : ''}" data-act="setFilter" data-arg="pdLoai|${mbX(l)}">${mbX(l)} (${mbFmt(v)})</div>`).join('')}
    </div>

    ${list.length ? list.map(i => `<div class="mb-card mb-card-sm">
      <div class="mb-row-between" style="margin-bottom:4px">
        <span style="font-size:13px;font-weight:700">${mbX(i.nd || '(không có nội dung)')}</span>
        <span style="font-size:13px;font-weight:800;flex-shrink:0">${mbFmt(mbInvAmount(i))}</span>
      </div>
      <div style="font-size:11px;color:var(--mb-muted-2)">${mbX(i.loai || '—')} · ${mbX(i.ncc || '—')} · ${mbDate(i.ngay)}</div>
    </div>`).join('') : `<div class="mb-empty">${filtered ? 'Không có hóa đơn phù hợp' : 'Chưa có hóa đơn trong năm này'}</div>`}
  </div>`;
}

/**
 * Chấm công của một công trình — liệt kê THEO TUẦN (không gộp theo công nhân).
 * Bấm vào một tuần sẽ mở tab Chấm công đúng tuần + công trình đó để sửa.
 */
function mbPdChamCong(p) {
  const weeks = (typeof ccData !== 'undefined' ? ccData : [])
    .filter(w => !w.deletedAt && inActiveYear(w.fromDate) && (w.projectId ? w.projectId === p.id : w.ct === p.name))
    .sort((a, b) => (b.fromDate || '').localeCompare(a.fromDate || ''));

  // Tổng công + tổng lương của một tuần
  const sumWeek = w => (w.workers || []).reduce((acc, k) => {
    const congs = (k.d || []).reduce((s, v) => s + (v || 0), 0);
    acc.congs += congs;
    acc.tong  += mbCcWorkerGross(k);
    return acc;
  }, { congs: 0, tong: 0 });

  const total = weeks.reduce((s, w) => s + sumWeek(w).tong, 0);

  return `<div class="mb-pad">
    ${weeks.length ? weeks.map(w => {
      const { congs, tong } = sumWeek(w);
      const n = (w.workers || []).length;
      return `<div class="mb-card mb-card-sm tap" data-act="ccOpenWeek" data-arg="${mbX(w.fromDate)}|${mbX(w.ct || p.name)}">
        <div class="mb-row-between" style="margin-bottom:4px">
          <span style="font-size:13px;font-weight:700">${(typeof weekLabel === 'function') ? weekLabel(w.fromDate) : mbDate(w.fromDate)}</span>
          <span style="font-size:13px;font-weight:800;flex-shrink:0">${mbFmt(tong)}</span>
        </div>
        <div class="mb-row-between" style="align-items:center">
          <span style="font-size:11px;color:var(--mb-muted-2)">${n} công nhân · ${Math.round(congs * 10) / 10} công</span>
          <span style="font-size:11px;font-weight:700;color:var(--mb-primary)">Sửa →</span>
        </div>
      </div>`;
    }).join('') : '<div class="mb-empty">Chưa chấm công cho công trình này</div>'}
    <div class="mb-card mb-card-sm" style="background:#F9FAFB;display:flex;justify-content:space-between">
      <span style="font-size:12.5px;font-weight:700;color:#374151">Tổng lương ${weeks.length} tuần</span>
      <span style="font-size:13.5px;font-weight:800">${mbFull(total)}</span>
    </div>
  </div>`;
}

/**
 * Thẻ phiếu ứng thầu phụ / nhà cung cấp dùng chung (V2): Sửa / Xóa ngay trên thẻ.
 * Phiếu tự sinh khi tất toán (autoSettle) CHỈ XEM — hủy qua "Tất toán gần đây" ở Công nợ.
 * @param {Object} u        bản ghi ung_v1
 * @param {boolean} showTp  hiện tên đối tác ở dòng đầu (false khi đang xem trong nhóm của chính đối tác đó)
 */
function mbUngCard(u, showTp) {
  const title = showTp === false ? (u.congtrinh || '—') : (u.tp || '—');
  const meta  = [showTp === false ? '' : (u.congtrinh || '—'), MB_UNG_LABEL[u.loai] || '', u.nd || '', mbDate(u.ngay)].filter(Boolean).join(' · ');
  return `<div class="mb-card mb-card-sm">
    <div class="mb-row-between" style="margin-bottom:4px">
      <span style="font-size:13px;font-weight:700">${mbX(title)}</span>
      <span style="font-size:13px;font-weight:800;color:var(--mb-amber);flex-shrink:0">${mbFmt(u.tien)}</span>
    </div>
    <div style="font-size:11px;color:var(--mb-muted-2)">${mbX(meta)}</div>
    <div class="mb-btn-row" style="margin-top:7px">
      ${u.autoSettle
        ? '<span class="mb-tag green">Phiếu tất toán (chỉ xem)</span>'
        : `<button class="mb-btn-outline blue" data-act="editUngMb" data-arg="${mbX(u.id)}">Sửa</button>
           <button class="mb-btn-outline red" data-act="delUngMb" data-arg="${mbX(u.id)}">Xóa</button>`}
    </div>
  </div>`;
}

/**
 * Tiền ứng của một công trình — CHỈ thầu phụ và nhà cung cấp.
 * Phiếu ứng công nhân là sổ nợ riêng theo người (không gắn với chi phí công
 * trình), xem tại tab Chấm công → "Ứng công nhân".
 */
function mbPdTienUng(p) {
  const list = (typeof ungRecords !== 'undefined' ? ungRecords : [])
    .filter(u => !u.deletedAt && u.loai !== 'congnhan' && inActiveYear(u.ngay) && mbBelongs(u, p))
    .sort((a, b) => (b.ngay || '').localeCompare(a.ngay || ''));
  const total = list.reduce((s, u) => s + (u.tien || 0), 0);

  return `<div class="mb-pad">
    <div class="mb-card mb-card-sm" style="background:#F9FAFB;display:flex;justify-content:space-between">
      <span style="font-size:12.5px;font-weight:700;color:#374151">Tổng đã ứng (${list.length} phiếu)</span>
      <span style="font-size:13.5px;font-weight:800">${mbFull(total)}</span>
    </div>
    ${list.length ? list.map(u => mbUngCard(u)).join('') : '<div class="mb-empty">Chưa có phiếu ứng</div>'}
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  4 · NHẬP HÓA ĐƠN
// ══════════════════════════════════════════════════════════════
function mbScrNhap() {
  if (MB.seg.nhap === 'tatca') return mbNhapTatCa();
  return mbNhapNhanh();
}

/** Tập id hóa đơn GỐC còn hiệu lực (không gồm HĐ sinh từ chấm công) — sửa/xóa được trên điện thoại */
function mbInvEditableIds() {
  return new Set((typeof invoices !== 'undefined' ? invoices : [])
    .filter(i => !i.deletedAt && !i.ccKey && i.source !== 'cc')
    .map(i => String(i.id)));
}

/** Thẻ hóa đơn dùng chung cho "Đã nhập trong ngày" và "Lịch sử HĐ" */
function mbInvCard(i, editable) {
  const hasItems = Array.isArray(i.items) && i.items.length > 0;
  const src = (i.source === 'cc' || i.ccKey) ? 'Từ chấm công' : (i.source === 'detail' || hasItems) ? 'Hóa đơn chi tiết' : 'Nhập nhanh';
  return `<div class="mb-card mb-card-sm">
    <div class="mb-row-between" style="margin-bottom:4px">
      <span style="font-size:13px;font-weight:700">${mbX(i.nd || '(không có nội dung)')}</span>
      <span style="font-size:13px;font-weight:800;flex-shrink:0">${mbFmt(mbInvAmount(i))}</span>
    </div>
    <div style="font-size:11px;color:var(--mb-muted-2)">${mbX(i.congtrinh || '—')}${i.ncc ? ' · ' + mbX(i.ncc) : ''} · ${mbDate(i.ngay)}</div>
    <div class="mb-row-between" style="align-items:center;margin-top:7px">
      <div style="display:flex;gap:6px;min-width:0;flex-wrap:wrap">
        <span class="mb-tag blue" style="background:var(--mb-primary-l);color:var(--mb-primary)">${mbX(i.loai || '—')}</span>
        <span class="mb-tag gray">${src}</span>
      </div>
      ${editable ? `<div class="mb-btn-row" style="flex-shrink:0">
        ${hasItems ? '' : `<button class="mb-btn-outline blue" data-act="editQuickInv" data-arg="${mbX(i.id)}">Sửa</button>`}
        <button class="mb-btn-outline red" data-act="delQuickInv" data-arg="${mbX(i.id)}">Xóa</button>
      </div>` : ''}
    </div>
  </div>`;
}

/**
 * Nhập hóa đơn — LƯU 1 CHẠM (27/10/2026).
 * Mặc định nhập thẳng tổng tiền; bật "Tính theo SL × Đơn giá" khi cần.
 * Lưu xong giữ ngày / CT / loại / NCC / người chi để nhập tờ kế tiếp thật nhanh.
 */
function mbNhapNhanh() {
  const f  = MB.form;
  const tt = f.calcMode ? Math.round(mbNum(f.sl) * mbMoney(f.dg)) : mbMoney(f.tien);
  const editing = !!f.editId;

  // Hóa đơn gốc đã nhập trong ngày đang chọn (mới nhất trước)
  const day = (typeof invoices !== 'undefined' ? invoices : [])
    .filter(i => !i.deletedAt && !i.ccKey && i.source !== 'cc' && i.ngay === f.ngay)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const dayTotal = day.reduce((s, i) => s + mbInvAmount(i), 0);

  const addBtn = cat => `<button class="mb-mini-add" data-act="quickAddCat" data-arg="${cat}" title="Thêm mới">+</button>`;

  const moneyBlock = f.calcMode
    ? `<div>
        <div class="mb-label-row">
          <div class="mb-label">Số lượng × Đơn giá (đồng)</div>
          <span class="mb-link" style="font-size:11.5px" data-act="toggleCalcMode">Nhập thẳng tổng tiền</span>
        </div>
        <div class="mb-row">
          <div class="mb-field"><input id="mb-f-sl" class="mb-input" inputmode="decimal" data-in="form.sl" data-live="1" value="${mbX(f.sl)}" placeholder="Số lượng"/></div>
          <div class="mb-field" style="flex:1.5"><input id="mb-f-dg" class="mb-input" inputmode="numeric" data-money="1" data-in="form.dg" data-live="1" value="${mbX(f.dg)}" placeholder="Đơn giá"/></div>
        </div>
        ${mbQuickMoney('form.dg', f.dg)}
        <div style="background:#F9FAFB;border-radius:10px;padding:10px 12px;margin-top:8px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12.5px;color:var(--mb-muted)">Thành tiền</span>
          <span style="font-size:16px;font-weight:800">${mbFull(tt)}</span>
        </div>
      </div>`
    : `<div>
        <div class="mb-label-row">
          <div class="mb-label">Số tiền thanh toán (đ)</div>
          <span class="mb-link" style="font-size:11.5px" data-act="toggleCalcMode">🔢 Tính theo Số lượng × Đơn giá</span>
        </div>
        <input id="mb-f-tien" class="mb-input money-lg" inputmode="numeric" data-money="1" data-in="form.tien" data-live="1" value="${mbX(f.tien)}" placeholder="0"/>
        ${mbQuickMoney('form.tien', f.tien)}
      </div>`;

  return `<div class="mb-pad">
    <div class="mb-card" style="display:flex;flex-direction:column;gap:11px">
      <div class="mb-row-between" style="align-items:center">
        <div class="mb-sec-title">${editing ? 'Sửa hóa đơn' : 'Hóa đơn mới'}</div>
        ${editing ? '<span class="mb-tag amber">Đang sửa</span>' : ''}
      </div>

      <div><div class="mb-label">Công trình</div>
        <select id="mb-f-ct" class="mb-select" data-in="form.ct">${mbCtOptions(f.ct, true)}</select></div>

      <div class="mb-row">
        <div class="mb-field"><div class="mb-label">Ngày</div>
          <input id="mb-f-ngay" class="mb-input" type="date" data-in="form.ngay" value="${mbX(f.ngay)}"/></div>
        <div class="mb-field">
          <div class="mb-label-row"><div class="mb-label">Loại chi phí</div>${addBtn('loaiChiPhi')}</div>
          <select id="mb-f-loai" class="mb-select" data-in="form.loai">${mbOptionsKeep(cats.loaiChiPhi, f.loai, '-- Chọn --')}</select></div>
      </div>

      <div><div class="mb-label">Nội dung chi phí</div>
        <input id="mb-f-nd" class="mb-input" data-in="form.nd" value="${mbX(f.nd)}" placeholder="VD: Mua xi măng, đổ xăng, sắt hộp..."/></div>

      ${moneyBlock}

      <div class="mb-row">
        <div class="mb-field">
          <div class="mb-label-row"><div class="mb-label">Nhà cung cấp</div>${addBtn('nhaCungCap')}</div>
          <select id="mb-f-ncc" class="mb-select" data-in="form.ncc">${mbOptionsKeep(cats.nhaCungCap, f.ncc, '-- Chọn Nhà cung cấp --')}</select></div>
        <div class="mb-field">
          <div class="mb-label-row"><div class="mb-label">Người chi</div>${addBtn('nguoiTH')}</div>
          <select id="mb-f-nguoi" class="mb-select" data-in="form.nguoi">${mbOptionsKeep(cats.nguoiTH, f.nguoi, '-- Chọn --')}</select></div>
      </div>

      ${editing
        ? `<div style="display:flex;gap:9px">
            <button class="mb-btn gray" style="flex:1" data-act="cancelEditInv">Hủy sửa</button>
            <button class="mb-btn lg" style="flex:2" data-act="saveQuickInv">💾 Cập nhật hóa đơn</button>
          </div>`
        : `<button class="mb-btn lg green" data-act="saveQuickInv">💾 Lưu hóa đơn ngay</button>`}
    </div>

    <div>
      <div class="mb-sec-head">
        <div class="mb-sec-title">Đã nhập ngày ${mbDate(f.ngay)} (${day.length})</div>
        <div style="font-size:12.5px;font-weight:800">${mbFull(dayTotal)}</div>
      </div>
      <div class="mb-col">
        ${day.length ? day.slice(0, 30).map(i => mbInvCard(i, true)).join('')
          : '<div style="text-align:center;color:var(--mb-muted-2);font-size:12.5px;padding:22px 0;background:#fff;border:1px dashed var(--mb-line);border-radius:12px">Chưa có hóa đơn nào trong ngày này</div>'}
      </div>
    </div>
  </div>`;
}

/** Lịch sử hóa đơn: tìm + lọc CT / loại + "Xem thêm" từng 50 dòng + Sửa / Xóa trên thẻ */
function mbNhapTatCa() {
  const q   = (MB.invSearch || '').toLowerCase();
  const all = mbInvoices();
  const list = all
    .filter(i => !MB.invCt   || (i.congtrinh || '') === MB.invCt)
    .filter(i => !MB.invLoai || (i.loai || '') === MB.invLoai)
    .filter(i => !q || ((i.nd || '') + ' ' + (i.ncc || '') + ' ' + (i.congtrinh || '')).toLowerCase().includes(q))
    .sort((a, b) => (b.ngay || '').localeCompare(a.ngay || '') || ((b.createdAt || 0) - (a.createdAt || 0)));
  const total = list.reduce((s, i) => s + mbInvAmount(i), 0);
  const shown = list.slice(0, MB.invLimit || 50);
  const editable = mbInvEditableIds();

  return `<div class="mb-pad">
    <div class="mb-search">
      ${mbSearchIcon()}
      <input id="mb-in-invsearch" data-in="invSearch" data-live="1" value="${mbX(MB.invSearch)}" placeholder="Tìm nội dung, NCC, công trình..."/>
    </div>
    <div class="mb-row" style="gap:8px">
      <div class="mb-field"><select id="mb-inv-ct" class="mb-select" data-in="invCt">${mbFilterOptions(all.map(i => i.congtrinh), MB.invCt, 'Tất cả công trình')}</select></div>
      <div class="mb-field"><select id="mb-inv-loai" class="mb-select" data-in="invLoai">${mbFilterOptions(all.map(i => i.loai), MB.invLoai, 'Tất cả loại chi phí')}</select></div>
    </div>
    <div class="mb-row-between" style="align-items:baseline">
      <div style="font-size:12.5px;color:var(--mb-muted)">${list.length} hóa đơn${list.length > shown.length ? ' · đang hiện ' + shown.length : ''}</div>
      <div style="font-size:13px;font-weight:800">${mbFull(total)}</div>
    </div>
    <div class="mb-col">
      ${shown.length ? shown.map(i => mbInvCard(i, editable.has(String(i.id)))).join('') : '<div class="mb-empty">Không có hóa đơn phù hợp</div>'}
    </div>
    ${list.length > shown.length ? `<button class="mb-btn gray" data-act="moreInvs">Xem thêm (+50 hóa đơn) · còn ${list.length - shown.length}</button>` : ''}
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  5 · CHẤM CÔNG
// ══════════════════════════════════════════════════════════════

/** Khóa nhận diện bản nháp tuần đang mở: "chủ nhật|tên CT" */
function mbCcKey() { return mbCcSunday() + '|' + (MB.ccCt || ''); }
function mbCcSunday()   { return (typeof ccSundayISO === 'function') ? ccSundayISO(MB.ccOffset) : mbToday(); }
function mbCcSaturday() { return (typeof ccSaturdayISO === 'function') ? ccSaturdayISO(mbCcSunday()) : mbToday(); }

/** Tìm bản ghi tuần đã lưu cho (tuần, công trình) hiện tại */
function mbCcFindWeek() {
  const from = mbCcSunday();
  const ct   = MB.ccCt;
  if (!ct) return null;
  const arr = (typeof ccData !== 'undefined') ? ccData : [];
  return arr.find(w => !w.deletedAt && w.fromDate === from && w.ct === ct) || null;
}

/** Nạp bản nháp công nhân cho tuần đang xem (chỉ nạp lại khi đổi tuần/công trình) */
function mbCcEnsureDraft() {
  // Mặc định chọn công trình đầu tiên
  if (!MB.ccCt) {
    const P = mbProjects();
    MB.ccCt = P.length ? P[0].name : '';
  }
  const key = mbCcKey();
  if (MB.ccWorkers && MB.ccLoadedKey === key) return;
  const week = mbCcFindWeek();
  MB.ccWorkers = week
    ? (week.workers || []).map(w => ({
        name: w.name || '', d: (w.d || [0, 0, 0, 0, 0, 0, 0]).slice(0, 7),
        luong: w.luong || 0, phucap: w.phucap || 0, hdmuale: w.hdmuale || 0, nd: w.nd || '',
      }))
    : [];
  MB.ccLoadedKey = key;
  MB.ccOpenSalary = {};
}

function mbScrChamCong() {
  if (MB.seg.chamcong === 'baocao') return mbCcBaoCao();
  if (MB.seg.chamcong === 'ung')    return mbCcUng();
  return mbCcSo();
}

/** Tuần chấm công gần nhất TRƯỚC tuần đang mở của cùng công trình (để chép danh sách công nhân) */
function mbCcPrevWeek() {
  const ct = MB.ccCt;
  if (!ct) return null;
  const from = mbCcSunday();
  return (typeof ccData !== 'undefined' ? ccData : [])
    .filter(w => !w.deletedAt && w.ct === ct && (w.fromDate || '') < from && (w.workers || []).length)
    .sort((a, b) => (b.fromDate || '').localeCompare(a.fromDate || ''))[0] || null;
}

/** Lương/công của công nhân ở tuần chấm công gần nhất (mọi công trình) — 0 nếu chưa có */
function mbCcLastLuong(name) {
  const n = (name || '').trim().toLowerCase();
  if (!n) return 0;
  let luong = 0, at = '';
  (typeof ccData !== 'undefined' ? ccData : []).forEach(w => {
    if (w.deletedAt || (w.fromDate || '') <= at) return;
    const k = (w.workers || []).find(x => (x.name || '').trim().toLowerCase() === n && (x.luong || 0) > 0);
    if (k) { luong = k.luong; at = w.fromDate || ''; }
  });
  return luong;
}

/**
 * Sổ chấm công tuần (27/10/2026): thẻ công nhân thu gọn — dòng Lương/Phụ cấp chỉ
 * hiện khi bấm "⚙ Lương" hoặc công nhân chưa có lương; thanh Lưu dính đáy màn hình.
 */
function mbCcSo() {
  mbCcEnsureDraft();
  const from = mbCcSunday(), to = mbCcSaturday();
  const dayLabels = (typeof CC_DAY_LABELS !== 'undefined') ? CC_DAY_LABELS : ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const workers = MB.ccWorkers || [];
  const prev    = mbCcPrevWeek();

  const congsOf = w => (w.d || []).reduce((s, v) => s + (v || 0), 0);
  const grossOf = w => congsOf(w) * mbMoney(w.luong) + mbMoney(w.phucap) + mbMoney(w.hdmuale);
  const adjOf   = w => (typeof ccThucLanhLedgerAdj === 'function') ? ccThucLanhLedgerAdj(w.name, from, to) : 0;

  const totCongs = workers.reduce((s, w) => s + congsOf(w), 0);
  const totGross = workers.reduce((s, w) => s + grossOf(w), 0);
  const totAdj   = workers.reduce((s, w) => s + adjOf(w), 0);
  const round1   = v => Math.round(v * 10) / 10;

  return `<div class="mb-pad">
    <div class="mb-card" style="padding:13px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:11px">
        <div class="mb-back" style="border-radius:9px;width:30px;height:30px" data-act="ccWeek" data-arg="-1">
          <svg width="7" height="12" viewBox="0 0 8 13"><path d="M7 1L1 6.5L7 12" stroke="#374151" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
        </div>
        <div style="text-align:center;flex:1">
          <div style="font-size:13px;font-weight:700">Tuần ${MB.ccOffset === 0 ? 'này' : (MB.ccOffset > 0 ? '+' + MB.ccOffset : MB.ccOffset)}</div>
          <div style="font-size:11px;color:var(--mb-muted-2)">${(typeof weekLabel === 'function') ? weekLabel(from) : from}</div>
        </div>
        <div class="mb-back" style="border-radius:9px;width:30px;height:30px" data-act="ccWeek" data-arg="1">
          <svg width="7" height="12" viewBox="0 0 8 13"><path d="M1 1l6 5.5L1 12" stroke="#374151" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
        </div>
      </div>
      <select id="mb-cc-ct" class="mb-select" data-in="ccCt">${mbCtOptions(MB.ccCt, false)}</select>
    </div>

    <div class="mb-col" style="gap:8px">
      ${workers.map((w, wi) => {
        const congs = congsOf(w);
        const net   = grossOf(w) + adjOf(w);
        const role  = (typeof cnRoles !== 'undefined' && cnRoles[w.name]) || 'Công nhân';
        const luong = mbMoney(w.luong), pc = mbMoney(w.phucap);
        // Chưa có lương → mở sẵn dòng lương và GIỮ mở trong lúc gõ (không tự đóng khi vừa gõ chữ số đầu)
        if (!luong) MB.ccOpenSalary[wi] = true;
        const open = !!MB.ccOpenSalary[wi];
        return `<div class="mb-card" style="padding:10px 11px">
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px">
            <div style="flex:1;min-width:0">
              <input id="mb-cc-name-${wi}" class="mb-input" list="mb-dl-cn" style="padding:5px 8px;font-size:13.5px;font-weight:700;border-color:transparent;background:#F9FAFB"
                     data-in="ccWorkers.${wi}.name" data-onchange="ccNamePicked" data-arg="${wi}" value="${mbX(w.name)}" placeholder="Tên công nhân"/>
              <div style="font-size:10.5px;color:var(--mb-muted-2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${mbX(role)} · ${mbFmt(luong)}/công${pc ? ' + Phụ cấp ' + mbFmt(pc) : ''}${mbMoney(w.hdmuale) ? ' + Mua lẻ ' + mbFmt(mbMoney(w.hdmuale)) : ''}</div>
            </div>
            <button class="mb-btn-outline${open ? ' blue' : ''}" style="padding:5px 7px" data-act="ccToggleSalary" data-arg="${wi}">⚙️ Lương</button>
            <div style="text-align:right;flex-shrink:0;min-width:50px">
              <div style="font-size:13.5px;font-weight:800">${mbFmt(net)}</div>
              <div style="font-size:10.5px;color:var(--mb-muted-2)">${round1(congs)} công</div>
            </div>
            <button class="mb-del" data-act="ccDelWorker" data-arg="${wi}">×</button>
          </div>
          ${open ? `<div class="mb-row" style="margin-bottom:8px">
            <div class="mb-field"><div class="mb-label">Lương/công</div>
              <input id="mb-cc-luong-${wi}" class="mb-input" inputmode="numeric" data-money="1" data-in="ccWorkers.${wi}.luong" data-live="1" value="${mbX(mbMoneyStr(w.luong))}" placeholder="0"/></div>
            <div class="mb-field"><div class="mb-label">Phụ cấp</div>
              <input id="mb-cc-pc-${wi}" class="mb-input" inputmode="numeric" data-money="1" data-in="ccWorkers.${wi}.phucap" data-live="1" value="${mbX(mbMoneyStr(w.phucap))}" placeholder="0"/></div>
          </div>
          <div class="mb-row" style="margin-bottom:8px">
            <div class="mb-field"><div class="mb-label">Tiền mua vật tư lẻ (đ)</div>
              <input id="mb-cc-hd-${wi}" class="mb-input" inputmode="numeric" data-money="1" data-in="ccWorkers.${wi}.hdmuale" data-live="1" value="${mbX(mbMoneyStr(w.hdmuale))}" placeholder="0"/></div>
            <div class="mb-field"><div class="mb-label">Ghi chú công nhân</div>
              <input id="mb-cc-nd-${wi}" class="mb-input" data-in="ccWorkers.${wi}.nd" value="${mbX(w.nd || '')}" placeholder="VD: mua đinh, dây kẽm"/></div>
          </div>` : ''}
          <div class="mb-days">
            ${(w.d || []).map((v, di) => `<div class="mb-day${v > 0 ? ' on' : ''}" data-act="ccCycle" data-arg="${wi}|${di}">
              <div class="mb-day-lb">${dayLabels[di]}</div>
              <div class="mb-day-va">${v === 0 ? '·' : v}</div>
            </div>`).join('')}
          </div>
        </div>`;
      }).join('')}
      <datalist id="mb-dl-cn">${((typeof ccAllNames === 'function') ? ccAllNames() : []).map(n => `<option value="${mbX(n)}">`).join('')}</datalist>
    </div>

    ${!workers.length && prev
      ? `<button class="mb-btn soft-blue" data-act="ccCopyPrevWeek">📋 Chép công nhân từ tuần trước (${(prev.workers || []).length} người)</button>
         <button class="mb-btn dashed" data-act="ccAddWorker">+ Thêm công nhân</button>`
      : `<div style="display:flex;gap:8px">
          <button class="mb-btn dashed" style="flex:1" data-act="ccAddWorker">+ Thêm công nhân</button>
          ${prev ? `<button class="mb-btn dashed" style="flex:1" data-act="ccCopyPrevWeek">📋 Chép tuần trước</button>` : ''}
        </div>`}

    ${totAdj ? `<div class="mb-card mb-card-sm" style="display:flex;flex-direction:column;gap:6px">
      <div class="mb-row-between"><span style="font-size:12px;color:var(--mb-muted)">Tổng lương</span><span style="font-size:12.5px;font-weight:700">${mbFull(totGross)}</span></div>
      <div class="mb-row-between"><span style="font-size:12px;color:var(--mb-muted)">Cấn trừ ứng công nhân</span><span style="font-size:12.5px;font-weight:700;color:var(--mb-amber)">${(totAdj >= 0 ? '+ ' : '− ') + mbFull(Math.abs(totAdj))}</span></div>
    </div>` : ''}

    <div class="mb-sticky-bar">
      <div style="min-width:0">
        <div style="font-size:11px;color:var(--mb-muted)">Tổng: ${round1(totCongs)} công</div>
        <div style="font-size:13.5px;font-weight:800;color:var(--mb-green);white-space:nowrap">Thực lãnh: ${mbFull(totGross + totAdj)}</div>
      </div>
      <button class="mb-btn" data-act="ccSaveWeek">💾 Lưu chấm công</button>
    </div>
  </div>`;
}

/** Tiền của 1 công nhân trong 1 tuần: công × lương + phụ cấp + mua vật tư lẻ (khớp chamcong.core.js) */
function mbCcWorkerGross(k) {
  const c = (k.d || []).reduce((s, v) => s + (v || 0), 0);
  return c * (k.luong || 0) + (k.phucap || 0) + (k.hdmuale || 0);
}

/**
 * Bảng lương từng công nhân của tuần đang chọn (MB.ccOffset), gộp mọi công trình.
 * @returns {{ from, to, rows: [{ name, congs, luong, pc, hdml, adj, gross, net, debt, cts: [{ ct, congs, luong }] }] }}
 */
function mbCcPayroll() {
  const from = mbCcSunday(), to = mbCcSaturday();
  const map = {};
  (typeof ccData !== 'undefined' ? ccData : [])
    .filter(w => !w.deletedAt && w.fromDate === from)
    .forEach(w => (w.workers || []).forEach(k => {
      const name = (k.name || '').trim();
      if (!name) return;
      const m = map[name] || (map[name] = { name, congs: 0, luong: 0, pc: 0, hdml: 0, cts: [] });
      const c = (k.d || []).reduce((s, v) => s + (v || 0), 0);
      m.congs += c;
      m.luong += c * (k.luong || 0);
      m.pc    += (k.phucap || 0);
      m.hdml  += (k.hdmuale || 0);
      m.cts.push({ ct: w.ct || '—', congs: c, luong: k.luong || 0 });
    }));
  const rows = Object.values(map).map(m => {
    const adj   = (typeof ccThucLanhLedgerAdj === 'function') ? ccThucLanhLedgerAdj(m.name, from, to) : 0;
    const gross = m.luong + m.pc + m.hdml;
    const debt  = (typeof ccWorkerDebtUpTo === 'function') ? ccWorkerDebtUpTo(m.name, to) : 0;
    return { ...m, ...mbCcLedgerSplit(m.name, from, to), adj, gross, net: gross + adj, debt };
  }).sort((a, b) => b.net - a.net);
  return { from, to, rows };
}

/**
 * Tách khoản điều chỉnh Thực lãnh của tuần thành 2 phần để ghi rõ trên phiếu lương:
 *   ung — tổng phiếu ỨNG TIỀN (cộng vào thực lãnh) · tra — tổng phiếu TRẢ NỢ (trừ khỏi thực lãnh)
 * Cùng điều kiện với ccThucLanhLedgerAdj() desktop (tick "tính vào Thực Lãnh", ngày trong tuần)
 * → ung − tra luôn bằng adj.
 */
function mbCcLedgerSplit(name, from, to) {
  const recs = (typeof _ccUngRecs === 'function') ? _ccUngRecs(name)
    : (typeof ungRecords !== 'undefined' ? ungRecords : []).filter(r => !r.deletedAt && r.loai === 'congnhan' && (r.tp || '') === name);
  let ung = 0, tra = 0;
  recs.forEach(r => {
    if (!r.tinhVaoThucLanh || !r.ngay || r.ngay < from || r.ngay > to) return;
    if (r.cnKind === 'tra') tra += Number(r.tien) || 0;
    else ung += Number(r.tien) || 0;
  });
  return { ung, tra };
}

/**
 * Đoạn văn bản phiếu lương 1 người lao động — dán thẳng vào Zalo.
 * (30/10/2026) Dùng chung hàm của bản máy tính (chamcong.history-reports.js) để 2 giao diện
 * luôn ra CÙNG 1 mẫu phiếu; phần dưới chỉ là dự phòng khi module chấm công chưa nạp.
 */
function mbCcPayslipText(r, from, to) {
  if (typeof ccPayslipData === 'function' && typeof ccPayslipText === 'function') {
    return ccPayslipText(ccPayslipData(r.name, from, to));
  }
  const wl  = (typeof weekLabel === 'function') ? weekLabel(from) : (mbDate(from) + ' – ' + mbDate(to));
  const r1  = v => Math.round(v * 10) / 10;
  const L   = [
    'PHIẾU LƯƠNG TUẦN ' + wl,
    'Người lao động: ' + r.name,
    '────────────',
    ...r.cts.map(c => '• ' + c.ct + ': ' + r1(c.congs) + ' công × ' + mbFull(c.luong)),
    'Lương chính: ' + mbFull(r.luong),
  ];
  if (r.pc)   L.push('Phụ cấp: ' + mbFull(r.pc));
  if (r.hdml) L.push('Mua vật tư lẻ: ' + mbFull(r.hdml));
  if (r.tra)  L.push('Trừ trả nợ: −' + mbFull(r.tra));
  if (r.ung)  L.push('Cộng tiền ứng: ' + mbFull(r.ung));
  L.push('────────────', 'THỰC LÃNH: ' + mbFull(r.net));
  if (Math.round(r.debt)) L.push('Nợ còn lại: ' + mbFull(r.debt));
  L.push('— CTY NGUYỄN HỮU');
  return L.join('\n');
}

function mbCcBaoCao() {
  const view = MB.ccBcView === 'cn' ? 'cn' : 'tuan';
  const toggle = `<div class="mb-chips even">
    ${[['tuan', 'Theo tuần & công trình'], ['cn', 'Lương từng công nhân']].map(([k, l]) =>
      `<div class="mb-chip${view === k ? ' on' : ''}" data-act="setFilter" data-arg="ccBcView|${k}">${l}</div>`).join('')}
  </div>`;
  if (view === 'cn') return mbCcBangLuong(toggle);

  const weeks = (typeof ccData !== 'undefined' ? ccData : [])
    .filter(w => !w.deletedAt && inActiveYear(w.fromDate))
    .sort((a, b) => (b.fromDate || '').localeCompare(a.fromDate || ''));

  let totLuong = 0, totCongs = 0;
  const names = new Set();
  weeks.forEach(w => (w.workers || []).forEach(wk => {
    totCongs += (wk.d || []).reduce((s, v) => s + (v || 0), 0);
    totLuong += mbCcWorkerGross(wk);
    if (wk.name) names.add(wk.name);
  }));

  // Công nợ công nhân còn lại tới hôm nay
  const today = mbToday();
  let debt = 0;
  names.forEach(n => { debt += (typeof ccWorkerDebtUpTo === 'function') ? ccWorkerDebtUpTo(n, today) : 0; });

  const kpis = [
    ['Tổng lương năm',          mbFmt(totLuong),                        ''],
    ['Số tuần đã chấm',         weeks.length + ' tuần',                 ''],
    ['Tổng công',               (Math.round(totCongs * 10) / 10) + '',  ''],
    ['Ứng công nhân chưa trừ',  mbFmt(debt),                            'var(--mb-amber)'],
  ];

  return `<div class="mb-pad">
    ${toggle}
    <div class="mb-grid2">
      ${kpis.map(([l, v, c]) => `<div class="mb-kpi" style="border-radius:13px">
        <div class="mb-kpi-label">${l}</div>
        <div class="mb-kpi-value" style="font-size:15px;color:${c || 'var(--mb-text)'}">${mbX(v)}</div>
      </div>`).join('')}
    </div>
    <div class="mb-sec-title" style="margin-top:2px">Lịch sử tuần đã lưu</div>
    <div class="mb-col">
      ${weeks.length ? weeks.slice(0, 60).map(w => {
        const wk = w.workers || [];
        const congs = wk.reduce((s, k) => s + (k.d || []).reduce((a, v) => a + (v || 0), 0), 0);
        const tong  = wk.reduce((s, k) => s + mbCcWorkerGross(k), 0);
        return `<div class="mb-card mb-card-sm tap" data-act="ccOpenWeek" data-arg="${mbX(w.fromDate)}|${mbX(w.ct || '')}">
          <div class="mb-row-between" style="margin-bottom:4px">
            <span style="font-size:13px;font-weight:700">${(typeof weekLabel === 'function') ? weekLabel(w.fromDate) : w.fromDate}</span>
            <span style="font-size:13px;font-weight:800;flex-shrink:0">${mbFmt(tong)}</span>
          </div>
          <div style="font-size:11px;color:var(--mb-muted-2)">${mbX(w.ct || '—')} · ${wk.length} công nhân · ${Math.round(congs * 10) / 10} công</div>
        </div>`;
      }).join('') : '<div class="mb-empty">Chưa có tuần chấm công nào</div>'}
    </div>
  </div>`;
}

/** Góc nhìn "Bảng lương từng công nhân" của tuần đang chọn + nút sao chép phiếu lương gửi Zalo */
function mbCcBangLuong(toggle) {
  const { from, rows } = mbCcPayroll();
  const r1 = v => Math.round(v * 10) / 10;
  const totNet   = rows.reduce((s, r) => s + r.net, 0);
  const totCongs = rows.reduce((s, r) => s + r.congs, 0);
  const line = (l, v, col) => `<div class="mb-row-between" style="font-size:11.5px"><span style="color:var(--mb-muted)">${l}</span><span style="font-weight:700;color:${col || 'var(--mb-text-2)'}">${v}</span></div>`;

  return `<div class="mb-pad">
    ${toggle}
    <div class="mb-card" style="padding:12px 13px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div class="mb-back" style="border-radius:9px;width:30px;height:30px" data-act="ccWeek" data-arg="-1">
          <svg width="7" height="12" viewBox="0 0 8 13"><path d="M7 1L1 6.5L7 12" stroke="#374151" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
        </div>
        <div style="text-align:center;flex:1">
          <div style="font-size:13px;font-weight:700">Tuần ${MB.ccOffset === 0 ? 'này' : (MB.ccOffset > 0 ? '+' + MB.ccOffset : MB.ccOffset)}</div>
          <div style="font-size:11px;color:var(--mb-muted-2)">${(typeof weekLabel === 'function') ? weekLabel(from) : from}</div>
        </div>
        <div class="mb-back" style="border-radius:9px;width:30px;height:30px" data-act="ccWeek" data-arg="1">
          <svg width="7" height="12" viewBox="0 0 8 13"><path d="M1 1l6 5.5L1 12" stroke="#374151" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
        </div>
      </div>
    </div>

    <div class="mb-kpi green">
      <div class="mb-kpi-label">Tổng thực lãnh tuần · ${rows.length} công nhân</div>
      <div class="mb-kpi-value">${mbFull(totNet)}</div>
      <div class="mb-kpi-hint">${r1(totCongs)} công · gộp mọi công trình</div>
    </div>

    <div class="mb-col">
      ${rows.length ? rows.map(r => `<div class="mb-card" style="padding:12px 13px;display:flex;flex-direction:column;gap:5px">
        <div class="mb-row-between" style="align-items:baseline">
          <span style="font-size:13.5px;font-weight:700">${mbX(r.name)}</span>
          <span style="font-size:14px;font-weight:800;color:var(--mb-green);flex-shrink:0">${mbFull(r.net)}</span>
        </div>
        <div style="font-size:11px;color:var(--mb-muted-2)">${r.cts.map(c => mbX(c.ct) + ' (' + r1(c.congs) + ' công)').join(' · ')}</div>
        ${line('Số công · Lương chính', r1(r.congs) + ' công · ' + mbFull(r.luong))}
        ${r.pc || r.hdml ? line('Phụ cấp / Mua vật tư lẻ', mbFull(r.pc) + ' / ' + mbFull(r.hdml)) : ''}
        ${r.tra ? line('Trừ trả nợ', '− ' + mbFull(r.tra), 'var(--mb-red)') : ''}
        ${r.ung ? line('Cộng tiền ứng', '+ ' + mbFull(r.ung), 'var(--mb-amber)') : ''}
        ${line('Nợ còn lại', mbFull(r.debt), Math.round(r.debt) > 0 ? 'var(--mb-red)' : 'var(--mb-green)')}
        <div class="mb-btn-row" style="margin-top:3px">
          <button class="mb-btn-outline blue" data-act="ccCopyPayslip" data-arg="${mbX(r.name)}">📋 Sao chép phiếu lương (gửi Zalo)</button>
        </div>
      </div>`).join('') : '<div class="mb-empty">Tuần này chưa chấm công</div>'}
    </div>
  </div>`;
}

/** Lịch sử phiếu ứng / trả nợ của 1 công nhân (bung dưới thẻ ở tab Ứng công nhân), có nút Xóa */
function mbCcUngHistory(name) {
  const recs = (typeof ungRecords !== 'undefined' ? ungRecords : [])
    .filter(r => !r.deletedAt && r.loai === 'congnhan' && (r.tp || '') === name)
    .sort((a, b) => (b.ngay || '').localeCompare(a.ngay || '') || ((b.createdAt || 0) - (a.createdAt || 0)));
  return `<div class="mb-col" style="padding-left:10px;border-left:2px solid #BFDBFE;gap:6px">
    ${recs.length ? recs.map(r => {
      const tra = r.cnKind === 'tra';
      return `<div class="mb-card mb-card-sm" style="display:flex;align-items:center;gap:9px;padding:9px 11px">
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;font-weight:700;color:${tra ? 'var(--mb-green)' : 'var(--mb-amber)'}">${tra ? 'Trả nợ' : 'Ứng tiền'} ${mbFull(r.tien || 0)}</div>
          <div style="font-size:11px;color:var(--mb-muted-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${mbDate(r.ngay)} · ${mbX(r.congtrinh || '—')} · ${mbX(r.nd || '')}</div>
        </div>
        <button class="mb-btn-outline red" data-act="delUngCnMb" data-arg="${mbX(r.id)}">Xóa</button>
      </div>`;
    }).join('') : '<div style="font-size:12px;color:var(--mb-muted-2);padding:6px 0">Chưa có phiếu ứng / trả nào</div>'}
  </div>`;
}

function mbCcUng() {
  const today = mbToday();
  const names = (typeof ccAllNames === 'function') ? ccAllNames() : [];
  const all = names.map(n => {
    const ung = (typeof ungRecords !== 'undefined' ? ungRecords : [])
      .filter(r => !r.deletedAt && r.loai === 'congnhan' && (r.tp || '') === n);
    const daUng = ung.filter(r => r.cnKind !== 'tra').reduce((s, r) => s + (r.tien || 0), 0);
    const daTra = ung.filter(r => r.cnKind === 'tra').reduce((s, r) => s + (r.tien || 0), 0);
    const remain = (typeof ccWorkerDebtUpTo === 'function') ? ccWorkerDebtUpTo(n, today) : daUng - daTra;
    return { name: n, daUng, daTra, remain };
  }).filter(r => r.daUng || r.daTra || r.remain);

  // Mặc định chỉ hiện công nhân CÒN NỢ; bấm chip để hiện cả người đã hết nợ
  const showAll = MB.ccUngShowAll === '1';
  const owing   = all.filter(r => Math.round(r.remain) !== 0);
  const rows    = (showAll ? all : owing).sort((a, b) => b.remain - a.remain);

  const total = all.reduce((s, r) => s + r.remain, 0);
  const f = MB.ccUngForm;

  return `<div class="mb-pad">
    <div class="mb-kpi amber" style="border-radius:13px">
      <div class="mb-kpi-label">Công nợ công nhân còn lại</div>
      <div class="mb-kpi-value" style="font-size:17px">${mbFmt(total)}</div>
      <div class="mb-kpi-hint">${owing.length} công nhân còn nợ</div>
    </div>

    <div class="mb-card" style="display:flex;flex-direction:column;gap:11px">
      <div class="mb-sec-title">Ghi phiếu ứng / trả</div>

      <div class="mb-chips even">
        ${[['ung', 'Ứng tiền'], ['tra', 'Trả nợ']].map(([k, l]) =>
          `<div class="mb-chip${f.kind === k ? ' on' : ''}" data-act="ccUngKind" data-arg="${k}">${l}</div>`).join('')}
      </div>

      <div><div class="mb-label">Công nhân</div>
        <input id="mb-cu-tp" class="mb-input" list="mb-dl-cnung" data-in="ccUngForm.tp" value="${mbX(f.tp)}" placeholder="Nhập, chọn tên hoặc bấm thẻ bên dưới"/>
        <datalist id="mb-dl-cnung">${names.map(n => `<option value="${mbX(n)}">`).join('')}</datalist></div>

      <div><div class="mb-label">Công trình</div>
        <select id="mb-cu-ct" class="mb-select" data-in="ccUngForm.ct">${mbCtOptions(f.ct, false)}</select></div>

      <div class="mb-row">
        <div class="mb-field"><div class="mb-label">Ngày</div>
          <input id="mb-cu-ngay" class="mb-input" type="date" data-in="ccUngForm.ngay" value="${mbX(f.ngay)}"/></div>
        <div class="mb-field" style="flex:1.3"><div class="mb-label">Số tiền (đ)</div>
          <input id="mb-cu-tien" class="mb-input" inputmode="numeric" data-money="1" data-in="ccUngForm.tien" data-live="1" value="${mbX(f.tien)}" placeholder="0"/></div>
      </div>
      ${mbQuickMoney('ccUngForm.tien', f.tien)}

      <div><div class="mb-label">Nội dung</div>
        <input id="mb-cu-nd" class="mb-input" data-in="ccUngForm.nd" value="${mbX(f.nd)}" placeholder="${f.kind === 'tra' ? 'VD: Trả nợ đợt 1' : 'VD: Ứng sinh hoạt'}"/></div>

      <button class="mb-btn ${f.kind === 'tra' ? 'green' : 'amber'}" data-act="saveUngCN">
        ${f.kind === 'tra' ? 'Lưu phiếu trả nợ' : 'Lưu phiếu ứng'}
      </button>
    </div>

    <div class="mb-row-between" style="align-items:center">
      <div class="mb-sec-title">${showAll ? 'Tất cả công nhân có phát sinh' : 'Công nhân còn nợ'}</div>
      <div class="mb-chip${showAll ? ' on' : ''}" data-act="setFilter" data-arg="ccUngShowAll|${showAll ? '0' : '1'}">Hiện cả đã hết nợ</div>
    </div>
    <div class="mb-col">
      ${rows.length ? rows.map(r => `<div class="mb-card mb-card-sm tap" data-act="ccPickWorker" data-arg="${mbX(r.name)}"${f.tp === r.name ? ' style="border-color:var(--mb-primary)"' : ''}>
        <div class="mb-row-between" style="margin-bottom:6px">
          <span style="font-size:13px;font-weight:700">${mbX(r.name)}</span>
          <span style="font-size:13px;font-weight:800;color:${r.remain > 0 ? 'var(--mb-amber)' : 'var(--mb-green)'};flex-shrink:0">${mbFmtSigned(r.remain)}</span>
        </div>
        <div class="mb-row-between" style="font-size:11px;color:var(--mb-muted-2)">
          <span>Đã ứng ${mbFmt(r.daUng)}</span><span>Đã trả ${mbFmt(r.daTra)}</span>
        </div>
      </div>
      ${MB.ccUngOpen === r.name ? mbCcUngHistory(r.name) : ''}`).join('') : `<div class="mb-empty">${showAll ? 'Chưa có công nợ công nhân' : '🎉 Không còn công nhân nào nợ'}</div>`}
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  6 · TIỀN ỨNG
// ══════════════════════════════════════════════════════════════
function mbScrTienUng() {
  return MB.seg.tienung === 'thongke' ? mbUngThongKe() : mbUngNhap();
}

function mbUngNhap() {
  const f = MB.ungForm;
  // Chỉ 2 loại — ứng công nhân nằm ở tab Chấm công (xem chú thích MB.ungKind)
  const kinds = [['thauphu', 'Thầu phụ'], ['nhacungcap', 'Nhà cung cấp']];
  const isTp  = MB.ungKind === 'thauphu';
  const partyLabel = isTp ? 'Thầu phụ' : 'Nhà cung cấp';
  const partyList  = isTp ? (cats.thauPhu || []) : (cats.nhaCungCap || []);
  const editing = !!f.editId;

  const recent = (typeof ungRecords !== 'undefined' ? ungRecords : [])
    .filter(u => !u.deletedAt && u.loai !== 'congnhan' && inActiveYear(u.ngay))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 10);

  return `<div class="mb-pad">
    <div class="mb-card" style="display:flex;flex-direction:column;gap:11px">
      <div class="mb-row-between" style="align-items:center">
        <div class="mb-sec-title">${editing ? 'Sửa phiếu ứng' : 'Phiếu ứng mới'}</div>
        ${editing ? '<span class="mb-tag amber">Đang sửa</span>' : ''}
      </div>

      <div><div class="mb-label">Loại ứng</div>
        <div class="mb-chips even">
          ${kinds.map(([k, l]) => `<div class="mb-chip${MB.ungKind === k ? ' on' : ''}" data-act="setFilter" data-arg="ungKind|${k}">${l}</div>`).join('')}
        </div>
      </div>

      <div>
        <div class="mb-label-row"><div class="mb-label">${partyLabel}</div>
          <button class="mb-mini-add" data-act="quickAddUngParty" title="Thêm ${partyLabel.toLowerCase()} mới">+</button></div>
        <input id="mb-u-tp" class="mb-input" list="mb-dl-tp" data-in="ungForm.tp" value="${mbX(f.tp)}" placeholder="Nhập hoặc chọn tên"/>
        <datalist id="mb-dl-tp">${partyList.map(v => `<option value="${mbX(v)}">`).join('')}</datalist></div>

      <div><div class="mb-label">Công trình</div>
        <select id="mb-u-ct" class="mb-select" data-in="ungForm.ct">${mbCtOptions(f.ct, false)}</select></div>

      <div class="mb-row">
        <div class="mb-field"><div class="mb-label">Ngày</div>
          <input id="mb-u-ngay" class="mb-input" type="date" data-in="ungForm.ngay" value="${mbX(f.ngay)}"/></div>
        <div class="mb-field" style="flex:1.3"><div class="mb-label">Số tiền (đ)</div>
          <input id="mb-u-tien" class="mb-input" inputmode="numeric" data-money="1" data-in="ungForm.tien" data-live="1" value="${mbX(f.tien)}" placeholder="0"/></div>
      </div>
      ${mbQuickMoney('ungForm.tien', f.tien)}

      <div><div class="mb-label">Nội dung</div>
        <input id="mb-u-nd" class="mb-input" data-in="ungForm.nd" value="${mbX(f.nd)}" placeholder="VD: Ứng đợt 1"/></div>

      ${editing
        ? `<div style="display:flex;gap:9px">
            <button class="mb-btn gray" style="flex:1" data-act="cancelEditUng">Hủy sửa</button>
            <button class="mb-btn" style="flex:2" data-act="saveUng">💾 Cập nhật phiếu ứng</button>
          </div>`
        : `<button class="mb-btn" data-act="saveUng">💾 Lưu phiếu ứng</button>`}
    </div>

    <div class="mb-sec-title">Phiếu ứng gần đây</div>
    <div class="mb-col">
      ${recent.length ? recent.map(u => mbUngCard(u)).join('') : '<div class="mb-empty">Chưa có phiếu ứng</div>'}
    </div>
  </div>`;
}

function mbUngThongKe() {
  // Bỏ phiếu công nhân — trang này chỉ theo dõi ứng thầu phụ / nhà cung cấp
  const all = (typeof ungRecords !== 'undefined' ? ungRecords : [])
    .filter(u => !u.deletedAt && u.loai !== 'congnhan' && inActiveYear(u.ngay));
  const q = (MB.ungSearch || '').toLowerCase();
  const list = all
    .filter(u => !MB.ungCtFilter || (u.congtrinh || '') === MB.ungCtFilter)
    .filter(u => !q || (u.tp || '').toLowerCase().includes(q));

  const tot = { thauphu: 0, nhacungcap: 0 };
  const byParty = {};
  list.forEach(u => {
    if (tot[u.loai] !== undefined) tot[u.loai] += (u.tien || 0);
    const k = u.tp || '(Không rõ)';
    (byParty[k] = byParty[k] || { total: 0, recs: [] });
    byParty[k].total += (u.tien || 0);
    byParty[k].recs.push(u);
  });
  const parties = Object.entries(byParty).sort((a, b) => b[1].total - a[1].total);
  const maxParty = parties.length ? parties[0][1].total : 1;

  const kpis = [
    ['Ứng thầu phụ',     mbFmt(tot.thauphu)],
    ['Ứng nhà cung cấp', mbFmt(tot.nhacungcap)],
  ];

  return `<div class="mb-pad">
    <div class="mb-search">
      ${mbSearchIcon()}
      <input id="mb-in-ungsearch" data-in="ungSearch" data-live="1" value="${mbX(MB.ungSearch)}" placeholder="Tìm tên đối tác..."/>
    </div>
    <select id="mb-ung-ct" class="mb-select" data-in="ungCtFilter">${mbFilterOptions(all.map(u => u.congtrinh), MB.ungCtFilter, 'Tất cả công trình')}</select>

    <div class="mb-grid2">
      ${kpis.map(([l, v]) => `<div class="mb-kpi" style="border-radius:13px">
        <div class="mb-kpi-label">${l}</div>
        <div class="mb-kpi-value" style="font-size:15px">${v}</div>
      </div>`).join('')}
    </div>
    <div style="text-align:center;font-size:11.5px;color:var(--mb-muted-2);margin-top:-4px">
      ${list.length} phiếu ứng · ${mbYearLabel()} · bấm vào đối tác để xem từng lần ứng
    </div>
    <div class="mb-sec-title">Ứng theo đối tác</div>
    <div class="mb-col">
      ${parties.length ? parties.map(([name, g]) => {
        const open = MB.ungOpen === name;
        return `<div class="mb-card mb-card-sm tap" data-act="toggleUngParty" data-arg="${mbX(name)}"${open ? ' style="border-color:var(--mb-primary)"' : ''}>
          <div class="mb-row-between" style="margin-bottom:6px">
            <span style="font-size:13px;font-weight:700">${mbX(name)} <span style="font-weight:600;color:var(--mb-muted-2);font-size:11px">· ${g.recs.length} phiếu</span></span>
            <span style="font-size:13px;font-weight:800;flex-shrink:0">${mbFmt(g.total)}</span>
          </div>
          <div class="mb-bar thin"><i style="width:${mbBarW(g.total, maxParty)};background:var(--mb-amber)"></i></div>
        </div>
        ${open ? `<div class="mb-col" style="padding-left:10px;border-left:2px solid #BFDBFE">
          ${g.recs.sort((a, b) => (b.ngay || '').localeCompare(a.ngay || '')).map(u => mbUngCard(u, false)).join('')}
        </div>` : ''}`;
      }).join('') : '<div class="mb-empty">Chưa có dữ liệu ứng</div>'}
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  7 · DOANH THU
// ══════════════════════════════════════════════════════════════
function mbScrDoanhThu() {
  if (MB.seg.doanhthu === 'thongke')  return mbDtThongKe();
  if (MB.seg.doanhthu === 'loinhuan') return mbDtLoiNhuan();
  return mbDtThu();
}

// (27/10/2026) Điện thoại chỉ còn ghi nhận THU TIỀN của chủ đầu tư.
// Khai báo HĐ chính / HĐ thầu phụ làm trên máy tính.
function mbDtThu() {
  const f = MB.dtForm;
  const year = (typeof thuRecords !== 'undefined' ? thuRecords : [])
    .filter(r => !r.deletedAt && inActiveYear(r.ngay))
    .sort((a, b) => (b.ngay || '').localeCompare(a.ngay || '') || ((b.createdAt || 0) - (a.createdAt || 0)));
  const total = year.reduce((s, r) => s + (r.tien || 0), 0);

  return `<div class="mb-pad">
    <div class="mb-card" style="display:flex;flex-direction:column;gap:11px">
      <div class="mb-sec-title">Ghi nhận thu tiền</div>

      <div><div class="mb-label">Công trình</div>
        <select id="mb-dt-ct" class="mb-select" data-in="dtForm.ct">${mbCtOptions(f.ct, false)}</select></div>

      <div><div class="mb-label">Số tiền thu (đ)</div>
        <input id="mb-dt-tien" class="mb-input money-lg" inputmode="numeric" data-money="1" data-in="dtForm.tien" data-live="1" value="${mbX(f.tien)}" placeholder="0"/>
        ${mbQuickMoney('dtForm.tien', f.tien)}</div>

      <div class="mb-row">
        <div class="mb-field"><div class="mb-label">Ngày thu</div>
          <input id="mb-dt-ngay" class="mb-input" type="date" data-in="dtForm.ngay" value="${mbX(f.ngay)}"/></div>
        <div class="mb-field" style="flex:1.3"><div class="mb-label">Nội dung / Đợt thu</div>
          <input id="mb-dt-nd" class="mb-input" data-in="dtForm.nd" value="${mbX(f.nd)}" placeholder="VD: Thu đợt 2"/></div>
      </div>

      <button class="mb-btn green" data-act="saveDt">💾 Lưu phiếu thu</button>
    </div>

    <div class="mb-sec-head">
      <div class="mb-sec-title">Phiếu thu gần đây</div>
      <div style="font-size:12.5px;font-weight:800;color:var(--mb-green)">${mbFull(total)}</div>
    </div>
    <div class="mb-col">
      ${year.length ? year.slice(0, 30).map(r => `<div class="mb-card mb-card-sm" style="display:flex;gap:10px;align-items:center">
        <div style="flex:1;min-width:0">
          <div class="mb-row-between" style="margin-bottom:4px">
            <span style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${mbX(r.congtrinh || '—')}</span>
            <span style="font-size:13px;font-weight:800;color:var(--mb-green);flex-shrink:0">${mbFmt(r.tien)}</span>
          </div>
          <div style="font-size:11px;color:var(--mb-muted-2)">${mbX(r.nd || 'Thu tiền')} · ${mbDate(r.ngay)}</div>
        </div>
        <button class="mb-del" data-act="delThu" data-arg="${mbX(r.id)}" title="Xóa phiếu thu">×</button>
      </div>`).join('') : '<div class="mb-empty">Chưa có phiếu thu trong năm này</div>'}
    </div>
  </div>`;
}

function mbDtThongKe() {
  const invMap = mbInvMap();
  // Doanh thu = sau quyết toán (st.dt) — khớp tab Doanh Thu bản desktop
  const rows = mbProjects().map(p => ({ p, st: mbProjStats(p, invMap) })).filter(r => r.st.dt > 0 || r.st.thu > 0);
  const totDt  = rows.reduce((s, r) => s + r.st.dt, 0);
  const totThu = rows.reduce((s, r) => s + r.st.thu, 0);
  const totQt  = rows.reduce((s, r) => s + r.st.qt, 0);

  const kpis = [
    ['Tổng doanh thu', mbFmt(totDt),          ''],
    ['Đã thu',         mbFmt(totThu),         'green'],
    ['Còn phải thu',   mbFmt(totDt - totThu), 'red'],
    ['Quyết toán (±)', mbFmtSigned(totQt),    ''],
  ];

  return `<div class="mb-pad">
    <div class="mb-grid2">
      ${kpis.map(([l, v, c]) => `<div class="mb-kpi ${c}" style="border-radius:13px">
        <div class="mb-kpi-label">${l}</div>
        <div class="mb-kpi-value" style="font-size:15px">${v}</div>
      </div>`).join('')}
    </div>
    <div class="mb-sec-title">Thu tiền theo công trình</div>
    <div class="mb-col">
      ${rows.length ? rows.sort((a, b) => b.st.dt - a.st.dt).map(({ p, st }) => `
        <div class="mb-card mb-card-sm">
          <div class="mb-row-between" style="margin-bottom:6px">
            <span style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${mbX(p.name)}</span>
            <span style="font-size:12.5px;font-weight:800;flex-shrink:0">${mbFmt(st.thu)} / ${mbFmt(st.dt)}</span>
          </div>
          <div class="mb-bar thin"><i style="width:${mbBarW(st.thu, st.dt)};background:var(--mb-green)"></i></div>
          <div style="font-size:10.5px;color:var(--mb-muted-2);margin-top:5px">Đã thu ${mbPct(st.thu, st.dt)}% · còn ${mbFmt(Math.max(0, st.dt - st.thu))}${st.qt ? ' · Quyết toán ' + mbFmtSigned(st.qt) : ''}</div>
        </div>`).join('') : '<div class="mb-empty">Chưa khai báo hợp đồng</div>'}
    </div>
  </div>`;
}

function mbDtLoiNhuan() {
  const invMap = mbInvMap();
  const rows = mbProjects().map(p => ({ p, st: mbProjStats(p, invMap) })).filter(r => r.st.thu > 0 || r.st.chi > 0);

  // totHd = tổng DOANH THU = tiền đã thu thực tế (cash-basis, 04/10/2026)
  const totHd  = rows.reduce((s, r) => s + r.st.thu, 0);
  const totInv = mbInvoices().filter(i => i.projectId !== 'COMPANY').reduce((s, i) => s + mbInvAmount(i), 0);
  const totTp  = (typeof thauPhuContracts !== 'undefined' ? thauPhuContracts : [])
    .filter(r => !r.deletedAt && inActiveYear(r.ngay))
    .reduce((s, r) => s + (r.giaTri || 0) + (r.phatSinh || 0), 0);
  const chung  = (typeof getCompanyCost === 'function') ? getCompanyCost() : 0;
  const loi    = totHd - totInv - totTp - chung;

  const breakdown = [
    ['X · Doanh thu (đã thu)', totHd, 'var(--mb-primary)'],
    ['A · Chi phí hóa đơn',         totInv, 'var(--mb-red)'],
    ['B · Chi phí thầu phụ',        totTp,  'var(--mb-amber)'],
    ['C · Phân bổ chi phí chung',   chung,  'var(--mb-purple)'],
    ['Lợi nhuận gộp',               loi,    loi >= 0 ? 'var(--mb-green)' : 'var(--mb-red)'],
  ];

  return `<div class="mb-pad">
    <div class="mb-card">
      <div class="mb-sec-title" style="margin-bottom:12px">Cơ cấu lợi nhuận</div>
      <div class="mb-col" style="gap:10px">
        ${breakdown.map(([l, v, c]) => `<div>
          <div class="mb-row-between" style="margin-bottom:4px">
            <span style="font-size:12px;color:var(--mb-text-2);font-weight:600">${l}</span>
            <span style="font-size:12.5px;font-weight:800;color:${c}">${mbFmtSigned(v)}</span>
          </div>
          <div class="mb-bar"><i style="width:${mbBarW(Math.abs(v), totHd || 1)};background:${c}"></i></div>
        </div>`).join('')}
      </div>
    </div>

    <div class="mb-sec-title">Lãi/lỗ theo công trình</div>
    <div class="mb-col">
      ${rows.length ? rows.map(({ p, st }) => {
        const lai = st.thu - st.chi;
        const pct = mbPct(Math.abs(lai), st.thu);
        return `<div class="mb-card mb-card-sm tap" data-act="openProject" data-arg="${mbX(p.id)}">
          <div class="mb-row-between" style="margin-bottom:5px">
            <span style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${mbX(p.name)}</span>
            ${st.thu === 0 && st.chi > 0
              ? '<span class="mb-tag amber">Chưa thu</span>'   // chưa thu đồng nào → không chia cho 0 ra "Lỗ 0%"
              : `<span class="mb-tag ${lai >= 0 ? 'green' : 'red'}">${lai >= 0 ? 'Lãi' : 'Lỗ'} ${pct}%</span>`}
          </div>
          <div class="mb-row-between" style="font-size:11.5px;color:var(--mb-muted)">
            <span>Đã thu ${mbFmt(st.thu)} · Đã chi ${mbFmt(st.chi)}</span>
            <span style="font-weight:800;color:${lai >= 0 ? 'var(--mb-green)' : 'var(--mb-red)'}">${mbFmtSigned(lai)}</span>
          </div>
        </div>`;
      }).join('') : '<div class="mb-empty">Chưa có hợp đồng</div>'}
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  8 · CÔNG NỢ (03/10/2026) — = màn Tất toán TP/NCC cũ (mbCnCongNo), thay bảng công nợ cũ.
//      Dùng lại lõi desktop congno.tattoan.js: ttBuildRows() · ttBatches()
// ══════════════════════════════════════════════════════════════
function mbScrCongNo() {
  // (27/10/2026) Không còn tab con "HĐ thầu phụ" trên điện thoại — vào thẳng công nợ & tất toán
  return mbCnCongNo();
}

// ══════════════════════════════════════════════════════════════
//  9 · THIẾT BỊ
// ══════════════════════════════════════════════════════════════
// Tình trạng thiết bị — dùng đúng danh sách của thietbi.js (TB_TINH_TRANG)
const MB_TB_TT   = (typeof TB_TINH_TRANG !== 'undefined') ? TB_TINH_TRANG : ['Đang hoạt động', 'Cần bảo trì', 'Cần sửa chữa'];
const MB_TB_WARN = ['Cần bảo trì', 'Cần sửa chữa'];

/** Tên nơi đặt của 1 dòng thiết bị (kho → tên kho chuẩn, công trình → tên theo projectId) */
function mbTbLoc(t) { return (typeof _tbLocName === 'function' ? _tbLocName(t) : '') || t.ct || t.congtrinh || ''; }

/** <option> nơi đặt: 2 kho + các công trình chưa quyết toán (value = tên, giống dropdown desktop) */
function mbTbNoiOptions(selected, exceptName) {
  const kho = (typeof TB_KHO !== 'undefined' && typeof TB_KHO_CODES !== 'undefined')
    ? TB_KHO_CODES.map(c => TB_KHO[c].name) : [];
  const cts = mbProjects().filter(p => p.status !== 'closed').map(p => p.name);
  return '<option value="">-- Chọn công trình / kho --</option>' +
    [...kho, ...cts].filter(n => n !== exceptName).map(n =>
      `<option value="${mbX(n)}"${n === selected ? ' selected' : ''}>${mbX(n)}</option>`).join('');
}

/** Form "+ Thêm thiết bị" (giống tbSave desktop: tên phải có trong danh mục, gộp dòng trùng) */
function mbTbFormHtml() {
  const f = MB.tbForm;
  const names = (typeof tbGetNames === 'function') ? tbGetNames() : (cats.tbTen || []);
  return `<div class="mb-card" style="display:flex;flex-direction:column;gap:10px;border-color:#BFDBFE">
    <div class="mb-sec-title">Thêm thiết bị</div>
    <div><div class="mb-label">Nơi đặt</div>
      <select id="mb-tb-noi" class="mb-select" data-in="tbForm.noi">${mbTbNoiOptions(f.noi)}</select></div>
    <div>
      <div class="mb-label-row"><div class="mb-label">Tên thiết bị</div>
        <button class="mb-mini-add" data-act="quickAddTbTen" title="Thêm tên thiết bị mới">+</button></div>
      <input id="mb-tb-ten" class="mb-input" list="mb-dl-tbten" data-in="tbForm.ten" value="${mbX(f.ten)}" placeholder="Chọn tên trong danh mục"/>
      <datalist id="mb-dl-tbten">${names.map(n => `<option value="${mbX(n)}">`).join('')}</datalist></div>
    <div><div class="mb-label">Số lượng</div>
      <input id="mb-tb-sl" class="mb-input" inputmode="decimal" data-in="tbForm.sl" value="${mbX(f.sl)}" placeholder="1"/></div>
    <div><div class="mb-label">Tình trạng</div>
      <div class="mb-chips even">
        ${MB_TB_TT.map(s => `<div class="mb-chip${f.tt === s ? ' on' : ''}" data-act="setPath" data-arg="tbForm.tt|${s}">${s}</div>`).join('')}
      </div></div>
    <div><div class="mb-label">Thông tin máy (ghi chú)</div>
      <input id="mb-tb-ghichu" class="mb-input" data-in="tbForm.ghichu" value="${mbX(f.ghichu)}" placeholder="VD: Mới thay nhớt"/></div>
    <div style="display:flex;gap:9px">
      <button class="mb-btn gray" style="flex:1" data-act="toggleTbForm">Hủy</button>
      <button class="mb-btn green" style="flex:2" data-act="saveTbMb">💾 Lưu thiết bị</button>
    </div>
  </div>`;
}

function mbScrThietBi() {
  const all = (typeof tbData !== 'undefined' ? tbData : []).filter(t => !t.deletedAt && inActiveYear(t.ngay));
  // Record projectId = COMPANY (2 kho: Kho Thiết Bị Công Ty / Kho Vật Tư Giàn Giáo), không có CT hoặc tên chứa "kho" → ở kho.
  const isKho = t => t.projectId === 'COMPANY' || !mbTbLoc(t) || mbTbLoc(t).toLowerCase().includes('kho');
  // "Chỉ thiết bị cần bảo trì / sửa chữa" (mở từ khối Việc cần chú ý) → xem cả kho lẫn công trình
  const warnOnly = MB.tbWarn === '1';
  const base  = warnOnly ? all.filter(t => MB_TB_WARN.includes(t.tinhtrang)) : all.filter(t => MB.tbView === 'kho' ? isKho(t) : !isKho(t));
  const q     = (MB.tbSearch || '').toLowerCase();
  const rows  = base
    .filter(t => !MB.tbCt || mbTbLoc(t) === MB.tbCt)
    .filter(t => !q || ((t.ten || '') + ' ' + mbTbLoc(t) + ' ' + (t.ghichu || '')).toLowerCase().includes(q));
  const totSl = rows.reduce((s, t) => s + (Number(t.soluong) || 0), 0);

  const stCls = s => {
    const v = (s || '').toLowerCase();
    if (v.includes('hoạt động') || v.includes('tốt')) return 'green';
    if (v.includes('bảo trì')) return 'amber';
    if (v.includes('sửa') || v.includes('hỏng') || v.includes('mất')) return 'red';
    return 'gray';
  };

  return `<div class="mb-pad">
    ${MB.tbFormOpen ? mbTbFormHtml() : `<button class="mb-btn dashed" data-act="toggleTbForm">+ Thêm thiết bị</button>`}

    ${warnOnly ? '' : `<div class="mb-chips even">
      ${[['ct', 'Tại công trình'], ['kho', 'Kho']].map(([k, l]) =>
        `<div class="mb-chip${MB.tbView === k ? ' on' : ''}" data-act="setFilter" data-arg="tbView|${k}">${l}</div>`).join('')}
    </div>`}
    <div class="mb-search">
      ${mbSearchIcon()}
      <input id="mb-in-tbsearch" data-in="tbSearch" data-live="1" value="${mbX(MB.tbSearch)}" placeholder="Tìm tên thiết bị, thông tin máy..."/>
    </div>
    <select id="mb-tb-ct" class="mb-select" data-in="tbCt">${mbFilterOptions(base.map(mbTbLoc), MB.tbCt, warnOnly ? 'Tất cả nơi đặt' : MB.tbView === 'kho' ? 'Tất cả kho' : 'Tất cả công trình')}</select>
    <div class="mb-row-between" style="align-items:center">
      <div style="font-size:12px;color:var(--mb-muted)">${rows.length} dòng thiết bị · Tổng số lượng: ${totSl}</div>
      <div class="mb-chip${warnOnly ? ' on' : ''}" data-act="setFilter" data-arg="tbWarn|${warnOnly ? '0' : '1'}">Cần bảo trì / sửa chữa</div>
    </div>
    <div class="mb-col">
      ${rows.length ? rows.map(t => {
        const moving = MB.tbMoveId === t.id;
        const loc = mbTbLoc(t);
        return `<div class="mb-card mb-card-sm"${moving ? ' style="border-color:var(--mb-primary)"' : ''}>
        <div class="mb-row-between" style="margin-bottom:4px">
          <span style="font-size:13px;font-weight:700">${mbX(t.ten || '—')}</span>
          <span style="font-size:12.5px;font-weight:800;flex-shrink:0">Số lượng: ${t.soluong || 0}</span>
        </div>
        <div class="mb-row-between" style="align-items:center">
          <span style="font-size:11px;color:var(--mb-muted-2);min-width:0">${mbX(loc || 'Kho')}${t.ghichu ? ' · ' + mbX(t.ghichu) : ''}</span>
          <span class="mb-tag ${stCls(t.tinhtrang)}">${mbX(t.tinhtrang || '—')}</span>
        </div>
        <div class="mb-btn-row" style="margin-top:8px">
          <button class="mb-btn-outline blue" data-act="openTbMove" data-arg="${mbX(t.id)}">🔄 Điều chuyển</button>
          <button class="mb-btn-outline" data-act="cycleTbStatus" data-arg="${mbX(t.id)}">🔧 Đổi tình trạng</button>
          ${t.projectId === 'COMPANY' ? `<button class="mb-btn-outline red" data-act="delTbMb" data-arg="${mbX(t.id)}">🗑️ Xóa</button>` : ''}
        </div>
        ${moving ? `<div style="margin-top:10px;padding-top:9px;border-top:1px dashed var(--mb-line);display:flex;flex-direction:column;gap:8px">
          <div><div class="mb-label">Nơi nhận mới</div>
            <select id="mb-tbm-noi" class="mb-select" data-in="tbMove.noi">${mbTbNoiOptions(MB.tbMove.noi, loc)}</select></div>
          <div><div class="mb-label">Số lượng chuyển (tối đa ${t.soluong || 0})</div>
            <input id="mb-tbm-sl" class="mb-input" inputmode="decimal" data-in="tbMove.sl" value="${mbX(MB.tbMove.sl)}"/></div>
          <div style="display:flex;gap:8px">
            <button class="mb-btn gray sm" style="flex:1" data-act="openTbMove" data-arg="">Hủy</button>
            <button class="mb-btn sm" style="flex:2" data-act="saveTbMove" data-arg="${mbX(t.id)}">↩ Xác nhận điều chuyển</button>
          </div>
        </div>` : ''}
      </div>`;
      }).join('') : '<div class="mb-empty">Không có thiết bị phù hợp</div>'}
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  10 · CƠ CẤU CHI PHÍ (27/10/2026) — chi phí theo loại của Toàn công ty
//       hoặc của từng công trình (MB.tkCt). Khối "Chi phí chung phân bổ"
//       đã bỏ khỏi điện thoại (xem trên máy tính → Thống Kê CPHĐ).
// ══════════════════════════════════════════════════════════════
function mbScrThongKe() {
  const all  = mbInvoices();
  const ct   = MB.tkCt;
  const invs = ct ? all.filter(i => (i.congtrinh || '') === ct) : all;
  const total = invs.reduce((s, i) => s + mbInvAmount(i), 0);

  const byLoai = {};
  invs.forEach(i => { const k = i.loai || '(Không phân loại)'; byLoai[k] = (byLoai[k] || 0) + mbInvAmount(i); });
  const loaiRows = Object.entries(byLoai).sort((a, b) => b[1] - a[1]);
  const maxLoai  = loaiRows.length ? loaiRows[0][1] : 1;
  const COLORS   = ['var(--mb-primary)', 'var(--mb-green)', 'var(--mb-amber)', 'var(--mb-purple)', 'var(--mb-red)'];

  return `<div class="mb-pad">
    <select id="mb-tk-ct" class="mb-select" data-in="tkCt">${mbFilterOptions(all.map(i => i.congtrinh), ct, 'Toàn công ty')}</select>

    <div class="mb-kpi blue">
      <div class="mb-kpi-label">Tổng chi phí · ${mbX(ct || 'Toàn công ty')}</div>
      <div class="mb-kpi-value">${mbFull(total)}</div>
      <div class="mb-kpi-hint">${invs.length} hóa đơn · ${mbYearLabel()}</div>
    </div>

    <div class="mb-card">
      <div class="mb-sec-title" style="margin-bottom:11px">Chi phí theo loại</div>
      <div class="mb-col" style="gap:10px">
        ${loaiRows.length ? loaiRows.map(([label, v], idx) => `<div>
          <div class="mb-row-between" style="margin-bottom:4px">
            <span style="font-size:12px;color:var(--mb-text-2);font-weight:600">${mbX(label)}</span>
            <span style="font-size:12.5px;font-weight:800">${mbFmt(v)} <span style="font-weight:600;color:var(--mb-muted-2)">· ${mbPct(v, total)}%</span></span>
          </div>
          <div class="mb-bar"><i style="width:${mbBarW(v, maxLoai)};background:${COLORS[idx % COLORS.length]}"></i></div>
        </div>`).join('') : '<div class="mb-empty">Chưa có chi phí</div>'}
      </div>
    </div>
  </div>`;
}

// ── CÔNG NỢ ĐỐI TÁC = Tất toán TP/NCC (03/10/2026: chuyển từ tab Quyết toán; mọi vai trò được tất toán) ──
// (27/10/2026) Ô tìm + lọc công trình; nút nhỏ ở chân thẻ (chống bấm nhầm khi cuộn).
// (V2) Bấm thẻ → bung chi tiết nguồn công nợ (HĐ thầu phụ / hóa đơn NCC + từng phiếu đã ứng);
//      nút "+ Thêm hợp đồng thầu phụ" mở form thu gọn ở đầu màn.

/** Chi tiết 1 dòng công nợ: khớp đúng cách _ttBuildRows gom (nhóm + tên đối tác + công trình) */
function mbCnDetail(r) {
  const pn  = (r.partner || '').trim().toLowerCase();
  const nm  = (rec, kind, which, field) => ((typeof recCatName === 'function' ? recCatName(rec, kind, which) : '') || rec[field] || '').trim().toLowerCase();
  const ctN = rec => ((typeof _resolveCtName === 'function' ? _resolveCtName(rec) : '') || rec.congtrinh || '').trim();
  const sameCt = rec => (rec.projectId && r.pid) ? rec.projectId === r.pid : ctN(rec) === r.ctName;
  const byDate = (a, b) => (b.ngay || '').localeCompare(a.ngay || '');

  const ungs = (typeof ungRecords !== 'undefined' ? ungRecords : [])
    .filter(u => !u.deletedAt && u.loai === r.group && nm(u, 'ung', 'tp', 'tp') === pn && sameCt(u))
    .sort(byDate);

  let srcTitle, srcRows;
  if (r.group === 'thauphu') {
    const hds = (typeof thauPhuContracts !== 'undefined' ? thauPhuContracts : [])
      .filter(h => !h.deletedAt && nm(h, 'thauphu', 'thauphu', 'thauphu') === pn && sameCt(h))
      .sort(byDate);
    srcTitle = `Hợp đồng thầu phụ (${hds.length})`;
    srcRows = hds.map(h => [h.nd || 'Hợp đồng thầu phụ', mbDate(h.ngay) + (h.phatSinh ? ' · phát sinh ' + mbFmt(h.phatSinh) : ''), (h.giaTri || 0) + (h.phatSinh || 0)]);
  } else {
    const invs = (typeof getInvoicesCached === 'function' ? getInvoicesCached() : [])
      .filter(i => !i.deletedAt && nm(i, 'inv', 'ncc', 'ncc') === pn && sameCt(i))
      .sort(byDate);
    srcTitle = `Hóa đơn nhà cung cấp (${invs.length})`;
    srcRows = invs.slice(0, 15).map(i => [i.nd || '(không có nội dung)', mbDate(i.ngay) + (i.loai ? ' · ' + i.loai : ''), i.thanhtien || i.tien || 0]);
    if (invs.length > 15) srcRows.push(['… và ' + (invs.length - 15) + ' hóa đơn khác', '', null]);
  }

  const rowHtml = ([a, b, v], col) => `<div class="mb-row-between" style="align-items:center;padding:5px 0;border-bottom:1px solid var(--mb-line-soft)">
      <div style="min-width:0"><div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${mbX(a)}</div>
        ${b ? `<div style="font-size:10.5px;color:var(--mb-muted-2)">${mbX(b)}</div>` : ''}</div>
      ${v == null ? '' : `<span style="font-size:12px;font-weight:800;flex-shrink:0;color:${col || 'var(--mb-text)'}">${mbFmt(v)}</span>`}
    </div>`;

  return `<div style="margin-top:10px;padding-top:9px;border-top:1px dashed var(--mb-line)">
    <div style="font-size:11.5px;font-weight:700;color:var(--mb-text-2);margin-bottom:3px">${srcTitle} · ${mbFull(r.value)}</div>
    ${srcRows.length ? srcRows.map(x => rowHtml(x)).join('') : '<div style="font-size:11.5px;color:var(--mb-muted-2)">Chưa có</div>'}
    <div style="font-size:11.5px;font-weight:700;color:var(--mb-text-2);margin:9px 0 3px">Phiếu đã ứng (${ungs.length}) · ${mbFull(r.daUng)}</div>
    ${ungs.length ? ungs.map(u => rowHtml([u.nd || 'Tạm ứng', mbDate(u.ngay) + (u.autoSettle ? ' · phiếu tất toán' : ''), u.tien || 0], 'var(--mb-amber)')).join('') : '<div style="font-size:11.5px;color:var(--mb-muted-2)">Chưa ứng lần nào</div>'}
  </div>`;
}

/** Form thu gọn "Thêm hợp đồng thầu phụ" ở đầu màn Công nợ */
function mbHdtpFormHtml() {
  const f = MB.hdtpForm;
  return `<div class="mb-card" style="display:flex;flex-direction:column;gap:10px;border-color:#BFDBFE">
    <div class="mb-sec-title">Thêm hợp đồng thầu phụ</div>
    <div><div class="mb-label">Công trình</div>
      <select id="mb-hd-ct" class="mb-select" data-in="hdtpForm.ct">${mbCtOptions(f.ct, false)}</select></div>
    <div>
      <div class="mb-label-row"><div class="mb-label">Tên thầu phụ</div>
        <button class="mb-mini-add" data-act="quickAddHdtpTp" title="Thêm thầu phụ mới">+</button></div>
      <input id="mb-hd-tp" class="mb-input" list="mb-dl-hdtp" data-in="hdtpForm.tp" value="${mbX(f.tp)}" placeholder="Nhập hoặc chọn thầu phụ"/>
      <datalist id="mb-dl-hdtp">${(cats.thauPhu || []).map(v => `<option value="${mbX(v)}">`).join('')}</datalist></div>
    <div class="mb-row">
      <div class="mb-field" style="flex:1.4"><div class="mb-label">Giá trị hợp đồng (đ)</div>
        <input id="mb-hd-gt" class="mb-input" inputmode="numeric" data-money="1" data-in="hdtpForm.giaTri" data-live="1" value="${mbX(f.giaTri)}" placeholder="0"/></div>
      <div class="mb-field"><div class="mb-label">Phát sinh (đ)</div>
        <input id="mb-hd-ps" class="mb-input" inputmode="numeric" data-money="1" data-in="hdtpForm.phatSinh" value="${mbX(f.phatSinh)}" placeholder="0"/></div>
    </div>
    ${mbQuickMoney('hdtpForm.giaTri', f.giaTri)}
    <div class="mb-row">
      <div class="mb-field"><div class="mb-label">Ngày ký</div>
        <input id="mb-hd-ngay" class="mb-input" type="date" data-in="hdtpForm.ngay" value="${mbX(f.ngay)}"/></div>
      <div class="mb-field" style="flex:1.4"><div class="mb-label">Nội dung</div>
        <input id="mb-hd-nd" class="mb-input" data-in="hdtpForm.nd" value="${mbX(f.nd)}" placeholder="VD: Thi công điện nước"/></div>
    </div>
    <div style="display:flex;gap:9px">
      <button class="mb-btn gray" style="flex:1" data-act="toggleHdtpForm">Hủy</button>
      <button class="mb-btn green" style="flex:2" data-act="saveHdtpMb">💾 Lưu hợp đồng thầu phụ</button>
    </div>
  </div>`;
}

function mbCnCongNo() {
  const canEdit = true;    // Admin + Giám đốc + Kế toán đều được tất toán (giống desktop _ttCanEdit)
  const tol  = (typeof CN_DONE_TOLERANCE !== 'undefined') ? CN_DONE_TOLERANCE : 100000;
  const showDone = MB.cnShowDone === '1';
  const all  = (typeof ttBuildRows === 'function') ? ttBuildRows({ includeDone: showDone }) : [];
  const debt = all.filter(r => r.con > tol);     // thẻ tổng quan chỉ tính dòng còn nợ
  const q    = (MB.cnSearch || '').toLowerCase();
  const rows = all.filter(r => MB.cnGroup === 'all' || r.group === MB.cnGroup)
                  .filter(r => !MB.cnCt || (r.ctName || '') === MB.cnCt)
                  .filter(r => !q || ((r.partner || '') + ' ' + (r.ctName || '')).toLowerCase().includes(q))
                  .sort((a, b) => b.con - a.con);
  const sum = (g) => debt.filter(r => r.group === g).reduce((s, r) => s + r.con, 0);
  const batches = (typeof ttBatches === 'function') ? ttBatches().slice(0, 5) : [];
  const chips = [['all', 'Tất cả'], ['thauphu', 'Thầu phụ'], ['nhacungcap', 'Nhà cung cấp']];

  return `<div class="mb-pad">
    ${MB.ttLast ? `<div class="mb-card mb-card-sm mb-row-between" style="background:#F0FDF4">
        <span style="font-size:12.5px;font-weight:600;color:var(--mb-green)">${mbX(MB.ttLast.msg)}</span>
        <span class="mb-link" data-act="ttUndoMb">Hoàn tác</span>
      </div>` : ''}
    <div class="mb-grid2">
      <div class="mb-kpi red" style="border-radius:13px"><div class="mb-kpi-label">Nợ thầu phụ</div><div class="mb-kpi-value" style="font-size:15px">${mbFmt(sum('thauphu'))}</div></div>
      <div class="mb-kpi" style="border-radius:13px"><div class="mb-kpi-label">Nợ nhà cung cấp</div><div class="mb-kpi-value" style="font-size:15px">${mbFmt(sum('nhacungcap'))}</div></div>
    </div>

    ${MB.hdtpOpen ? mbHdtpFormHtml() : `<button class="mb-btn dashed" data-act="toggleHdtpForm">+ Thêm hợp đồng thầu phụ</button>`}

    <div class="mb-search">
      ${mbSearchIcon()}
      <input id="mb-in-cnsearch" data-in="cnSearch" data-live="1" value="${mbX(MB.cnSearch)}" placeholder="Tìm tên thầu phụ, nhà cung cấp..."/>
    </div>
    <select id="mb-cn-ct" class="mb-select" data-in="cnCt">${mbFilterOptions(all.map(r => r.ctName), MB.cnCt, 'Tất cả công trình')}</select>
    <div class="mb-chips">
      ${chips.map(([k, l]) => `<div class="mb-chip${MB.cnGroup === k ? ' on' : ''}" data-act="setFilter" data-arg="cnGroup|${k}">${l}</div>`).join('')}
      <div class="mb-chip${showDone ? ' on' : ''}" data-act="setFilter" data-arg="cnShowDone|${showDone ? '0' : '1'}">Hiện cả đã xong</div>
    </div>
    <div style="font-size:11px;color:var(--mb-muted-2)">Bấm vào thẻ đối tác để xem công nợ được tính từ những hợp đồng / hóa đơn và phiếu ứng nào.</div>

    <div class="mb-col" style="gap:9px">
      ${rows.length ? rows.map(r => {
        const isDebt = r.con > tol;
        const open   = MB.cnOpen === r.key;
        // Còn nợ → số đỏ · |còn nợ| ≤ ngưỡng → "Đã xong" · âm → "Ứng dư"
        const right = isDebt
          ? `<span style="font-size:13.5px;font-weight:800;color:var(--mb-red);flex-shrink:0">${mbFmt(r.con)}</span>`
          : (r.con < -tol ? `<span class="mb-tag blue">Ứng dư ${mbFmt(-r.con)}</span>` : '<span class="mb-tag green">Đã xong</span>');
        return `<div class="mb-card tap" style="padding:12px 13px${isDebt ? '' : ';opacity:.8'}${open ? ';border-color:var(--mb-primary)' : ''}" data-act="toggleCnDetail" data-arg="${mbX(r.key)}">
          <div class="mb-row-between" style="margin-bottom:4px">
            <span style="font-size:13.5px;font-weight:700">${mbX(r.partner)}</span>
            ${right}
          </div>
          <div style="font-size:11px;color:var(--mb-muted-2);margin-bottom:9px">${mbX(MB_UNG_LABEL[r.group] || r.group)} · ${mbX(r.ctName || '—')} · Giá trị ${mbFmt(r.value)} · Đã ứng ${mbFmt(r.daUng)}</div>
          <div class="mb-btn-row">
            <span class="mb-link" style="font-size:11.5px;margin-right:auto;align-self:center">${open ? 'Thu gọn ▲' : 'Xem chi tiết ▼'}</span>
            <button class="mb-btn-outline" data-act="cnQuickUng" data-arg="${mbX(r.key)}">+ Ghi phiếu ứng</button>
            ${canEdit && isDebt ? `<button class="mb-btn-outline green" data-act="ttSettleMb" data-arg="${mbX(r.key)}">✓ Tất toán hết nợ</button>` : ''}
          </div>
          ${open ? mbCnDetail(r) : ''}
        </div>`;
      }).join('')
        : (showDone || q || MB.cnCt ? '<div class="mb-empty">Không có đối tác phù hợp</div>' : '<div class="mb-empty">🎉 Không còn đối tác nào nợ</div>')}
    </div>

    ${batches.length ? `<div class="mb-sec-title">Tất toán gần đây</div>
    <div class="mb-col">
      ${batches.map(b => `<div class="mb-card mb-card-sm mb-row-between">
        <div style="min-width:0">
          <div style="font-size:12.5px;font-weight:700">${mbFull(b.total)} · ${b.recs.length} phiếu</div>
          <div style="font-size:11px;color:var(--mb-muted-2)">${mbDate(b.ngay)} · ${mbX(b.by || '—')}</div>
        </div>
        ${canEdit ? `<span class="mb-link" style="color:var(--mb-red)" data-act="ttCancelMb" data-arg="${mbX(b.id)}">Hủy</span>` : ''}
      </div>`).join('')}
    </div>` : ''}
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  16 · DANH MỤC (31/10/2026) — xem · thêm · sửa tên · xóa mục chưa dùng · vai trò công nhân.
//       Ghi qua đúng hàm desktop: addItem (mbAddCat) · dmDoiTen · delItem · updateCNRole.
//       Khối Tools (sao lưu, import / export, reset, xóa theo công trình) KHÔNG đưa lên điện thoại.
// ══════════════════════════════════════════════════════════════
const MB_DM_TYPES = [
  ['loaiChiPhi', 'Loại chi phí'], ['nhaCungCap', 'Nhà cung cấp'], ['nguoiTH', 'Người thực hiện'],
  ['thauPhu', 'Thầu phụ'], ['congNhan', 'Công nhân'], ['tbTen', 'Máy / thiết bị'],
];

/** Các mục của 1 danh mục, gộp trùng theo normalizeKey (ưu tiên bản đúng chuẩn) — giống renderSettings.
 *  Trả về [{ item, idx }] với idx = chỉ số GỐC trong cats[catId] (dùng cho sửa / xóa). */
function mbDmItems(catId) {
  const map = new Map();
  (cats[catId] || []).forEach((item, idx) => {
    const k = normalizeKey(item);
    if (!k) return;
    const ex = map.get(k);
    if (!ex) { map.set(k, { item, idx }); return; }
    const canon = normalizeName(catId, item);
    if (item === canon && ex.item !== canon) map.set(k, { item, idx });
  });
  return [...map.values()];
}

function mbScrDanhMuc() {
  const catId = MB_DM_TYPES.some(t => t[0] === MB.dmType) ? MB.dmType : 'loaiChiPhi';
  const label = (MB_DM_TYPES.find(t => t[0] === catId) || [])[1] || '';
  const all = mbDmItems(catId);
  // Lọc theo năm (giống desktop): thiết bị luôn hiện đủ; mục khác ẩn nếu CHỈ dùng ở năm khác
  const inYear = catId === 'tbTen' ? all : all.filter(({ item }) =>
    _isDmItemUsedInYear(catId, item) || !_isDmItemUsedAnytime(catId, item));
  const hidden = all.length - inYear.length;
  const q = (MB.dmSearch || '').trim().toLowerCase();
  const list = (MB.dmAllYears ? all : inYear)
    .filter(({ item }) => !q || String(item).toLowerCase().includes(q))
    .sort((a, b) => String(a.item || '').localeCompare(String(b.item || ''), 'vi'));
  const shown = list.slice(0, MB.dmLimit);
  MB._dmRowNames = {};                       // idx → tên lúc vẽ (chống sửa / xóa nhầm khi vừa đồng bộ)
  shown.forEach(({ item, idx }) => { MB._dmRowNames[idx] = item; });

  const row = ({ item, idx }) => {
    if (MB.dmEditIdx === idx) {
      return `<div class="mb-dm-row" style="display:block;background:var(--mb-primary-l)">
        <input id="mb-dm-edit" class="mb-input" data-in="dmEditVal" value="${mbX(MB.dmEditVal)}"/>
        <div style="font-size:11px;color:var(--mb-primary-d);margin:6px 0 8px">ⓘ Đổi tên sẽ cập nhật vào mọi hóa đơn / phiếu ứng / chấm công đã lưu.</div>
        <div class="mb-btn-row">
          <button class="mb-btn-outline" data-act="cancelDmEdit">Hủy</button>
          <button class="mb-btn-outline blue" data-act="saveDmNameMb">💾 Lưu tên</button>
        </div>
      </div>`;
    }
    const inUse = isItemInUse(catId, item);
    const role  = catId === 'congNhan' ? ((typeof cnRoles !== 'undefined' && cnRoles[item]) || '') : null;
    return `<div class="mb-dm-row">
      <span class="mb-dm-name">${mbX(item)}</span>
      ${role !== null ? `<span class="mb-role">${['C', 'T', 'P'].map(r =>
        `<b class="${role === r ? 'on' : ''}" data-act="setCnRoleMb" data-arg="${idx}|${role === r ? '' : r}" title="${r === 'C' ? 'Cái' : r === 'T' ? 'Thợ' : 'Phụ'}">${r}</b>`).join('')}</span>` : ''}
      <button class="mb-icon-btn" data-act="editDmMb" data-arg="${idx}" title="Sửa tên">${mbIcon('edit', 17)}</button>
      ${inUse
        ? `<span class="mb-icon-btn lock" title="Đang được sử dụng — không thể xóa">${mbIcon('lock', 17)}</span>`
        : `<button class="mb-icon-btn red" data-act="delDmMb" data-arg="${idx}" title="Xóa (chưa được sử dụng)">${mbIcon('close', 17)}</button>`}
    </div>`;
  };

  return `<div class="mb-pad">
    <div class="mb-chips">
      ${MB_DM_TYPES.map(([k, l]) => `<div class="mb-chip${catId === k ? ' on' : ''}" data-act="dmPickType" data-arg="${k}">${l} (${mbDmItems(k).length})</div>`).join('')}
    </div>
    <div class="mb-search">
      ${mbSearchIcon()}
      <input id="mb-in-dmsearch" data-in="dmSearch" data-live="1" value="${mbX(MB.dmSearch)}" placeholder="Tìm trong ${mbX(label.toLowerCase())}..."/>
    </div>
    <div style="display:flex;gap:8px">
      <input id="mb-dm-new" class="mb-input" data-in="dmNew" value="${mbX(MB.dmNew)}" placeholder="Thêm ${mbX(label.toLowerCase())} mới..."/>
      <button class="mb-btn amber" style="width:auto;padding:10px 15px;font-size:13px;flex-shrink:0" data-act="addDmMb">+ Thêm</button>
    </div>
    <div class="mb-row-between" style="font-size:11px;color:var(--mb-muted-2);align-items:center">
      <span>${list.length} mục${q ? ' khớp tìm kiếm' : ''} · 🔒 = đang dùng, không xóa được</span>
      ${hidden > 0 ? `<span class="mb-link" style="font-size:11px" data-act="toggleDmAllYears">${MB.dmAllYears ? 'Ẩn ' + hidden + ' mục năm khác' : '+' + hidden + ' mục năm khác'}</span>` : ''}
    </div>
    <div class="mb-list">
      ${shown.length ? shown.map(row).join('') : `<div class="mb-empty" style="padding:24px 0">${q ? 'Không có mục phù hợp' : 'Danh mục trống'}</div>`}
    </div>
    ${list.length > shown.length ? `<button class="mb-btn gray" data-act="moreDm">Xem thêm (còn ${list.length - shown.length})</button>` : ''}
    <div style="font-size:11px;color:var(--mb-muted-2);text-align:center">Sao lưu & công cụ dữ liệu (xuất / nhập, khôi phục, xóa theo công trình): dùng bản máy tính.</div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  15 · QUYẾT TOÁN CÔNG TRÌNH (31/10/2026) — xem + nhập / sửa / xóa (Admin, Giám đốc).
//       THEO NĂM ĐANG LỌC như bản máy tính (qtCtInYear / _dtInYear).
//       Xem trước số "sau quyết toán" = _qtFin(qtTaoNhap(...)); lưu = qtLuuQuyetToan() — cùng
//       đúng 1 logic với tab Quyết Toán desktop (kể cả phiếu thu tự động + chốt sổ).
// ══════════════════════════════════════════════════════════════
const MB_QT_TAG = { tang: ['Tăng', 'green'], giam: ['Giảm', 'red'], thaythe: ['Thay thế', 'blue'] };

function mbQtCanEdit() { return (typeof _qtCanEdit === 'function') ? _qtCanEdit() : mbRole() !== 'ketoan'; }

/** Nhãn loại quyết toán (+ 🔒 nếu chốt sổ) */
function mbQtTag(r) {
  const [lb, cls] = MB_QT_TAG[qtLoaiOf(r)] || ['—', 'gray'];
  return `<span class="mb-tag ${cls}">${lb}${r.chot ? ' 🔒' : ''}</span>`;
}

function mbScrQuyetToan() {
  if (MB.qtCt) return mbQtForm();
  return MB.seg.quyettoan === 'lichsu' ? mbQtLichSu() : mbQtDanhSach();
}

// ── Tab con 1: danh sách công trình ──
function mbQtDanhSach() {
  const invMap = mbInvMap();
  const all = mbProjects()
    .filter(p => typeof qtCtInYear !== 'function' || qtCtInYear(p.name))
    .map(p => {
      const rec = (typeof _qtRecordOfCt === 'function') ? _qtRecordOfCt(p.id).rec : null;
      return { p, rec, da: !!rec || p.status === 'closed' };
    });
  const cnt = { chua: all.filter(x => !x.da).length, da: all.filter(x => x.da).length, all: all.length };
  const q = (MB.qtSearch || '').toLowerCase();
  const rank = s => (s === 'completed' ? 0 : s === 'active' ? 1 : 2);
  const rows = all
    .filter(x => MB.qtFilter === 'all' || (MB.qtFilter === 'da' ? x.da : !x.da))
    .filter(x => !q || (x.p.name || '').toLowerCase().includes(q))
    .map(x => Object.assign(x, { d: calcTongDoanhThu(x.p), st: mbProjStats(x.p, invMap) }))
    .sort((a, b) => (a.da === b.da ? 0 : a.da ? 1 : -1) || rank(a.p.status) - rank(b.p.status) || b.d.conPhaiThu - a.d.conPhaiThu);
  const chips = [['chua', 'Chưa quyết toán'], ['da', 'Đã quyết toán'], ['all', 'Tất cả']];

  return `<div class="mb-pad">
    <div class="mb-search">
      ${mbSearchIcon()}
      <input id="mb-in-qtsearch" data-in="qtSearch" data-live="1" value="${mbX(MB.qtSearch)}" placeholder="Tìm công trình..."/>
    </div>
    <div class="mb-chips">
      ${chips.map(([k, l]) => `<div class="mb-chip${MB.qtFilter === k ? ' on' : ''}" data-act="setFilter" data-arg="qtFilter|${k}">${l} (${cnt[k]})</div>`).join('')}
    </div>
    <div style="font-size:11px;color:var(--mb-muted-2)">Số liệu theo năm đang chọn (${mbX(mbYearLabel())}). Bấm vào công trình để nhập / xem quyết toán.</div>

    <div class="mb-col" style="gap:9px">
      ${rows.length ? rows.map(({ p, rec, da, d, st }) => {
        const [stLabel, stCls] = MB_STATUS[p.status] || ['—', 'gray'];
        const lai = st.thu - st.chi;
        return `<div class="mb-card tap" style="padding:13px" data-act="openQtForm" data-arg="${mbX(p.id)}">
          <div style="font-size:13.5px;font-weight:700;margin-bottom:6px">${mbX(p.name)}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:9px">
            <span class="mb-tag ${stCls}">${stLabel}</span>
            ${rec ? mbQtTag(rec) : (da ? '' : `<span class="mb-tag amber">Chưa quyết toán</span>`)}
          </div>
          <div class="mb-grid3" style="margin-bottom:9px">
            <div><div style="font-size:10px;color:var(--mb-muted-2)">HĐ gốc</div><div style="font-size:12px;font-weight:700">${mbFmt(d.hdGoc)}</div></div>
            <div><div style="font-size:10px;color:var(--mb-muted-2)">Quyết toán</div><div style="font-size:12px;font-weight:700;color:${d.qt < 0 ? 'var(--mb-red)' : d.qt > 0 ? 'var(--mb-green)' : 'var(--mb-muted)'}">${d.qt ? (d.qt > 0 ? '+' : '') + mbFmtSigned(d.qt) : '0'}</div></div>
            <div><div style="font-size:10px;color:var(--mb-muted-2)">HĐ sau quyết toán</div><div style="font-size:12px;font-weight:800;color:var(--mb-primary)">${mbFmt(d.tongDT)}</div></div>
          </div>
          <div class="mb-bar"><i style="width:${mbBarW(d.daThu, d.tongDT)};background:var(--mb-green)"></i></div>
          <div class="mb-row-between" style="margin-top:5px;font-size:11px;color:var(--mb-muted-2)">
            <span>Đã thu ${mbFmt(d.daThu)} (${mbPct(d.daThu, d.tongDT)}%)</span>
            <span style="font-weight:700;color:${d.conPhaiThu < 0 ? 'var(--mb-red)' : 'var(--mb-text-2)'}">Còn ${mbFmtSigned(d.conPhaiThu)}</span>
          </div>
          <div class="mb-row-between" style="margin-top:8px;align-items:center">
            <span style="font-size:11.5px;color:var(--mb-muted)">Lãi tạm tính <b style="color:${lai >= 0 ? 'var(--mb-green)' : 'var(--mb-red)'}">${mbFmtSigned(lai)}</b></span>
            <span class="mb-btn-outline ${rec ? 'blue' : 'green'}">${rec ? 'Xem quyết toán ›' : 'Quyết toán ›'}</span>
          </div>
        </div>`;
      }).join('') : `<div class="mb-empty">${q ? 'Không có công trình phù hợp' : (MB.qtFilter === 'chua' ? '🎉 Mọi công trình trong năm đã quyết toán' : 'Chưa có công trình')}</div>`}
    </div>
  </div>`;
}

/** Dòng gợi ý dưới công tắc "Ghi nhận phiếu thu tiền còn lại" (giống _qtUpdateThuConLaiHint) */
function mbQtThuHint(f, p) {
  const cu = f.editId && typeof _qtAutoThuOf === 'function' ? _qtAutoThuOf(f.editId) : null;
  if (!MB.qtForm.thuConLai) {
    return cu ? `<span style="color:var(--mb-red)">⚠ Đang tắt: phiếu thu tự động ${mbFull(cu.tien)} sẽ bị xóa khi lưu.</span>` : '';
  }
  if (typeof _qtTinhConLai !== 'function') return '';
  const opts = f.soTien > 0 ? { excludeId: f.editId || undefined, extra: f.fake } : {};
  const con  = _qtTinhConLai(p, f.editId, opts);
  if (con <= 0) {
    return `<span style="color:var(--mb-green)">Công trình đã thu đủ${con < 0 ? ` (đang thu vượt ${mbFull(-con)})` : ''} — sẽ không tạo phiếu thu.</span>` +
      (cu ? ` <span style="color:var(--mb-red)">Phiếu tự động cũ ${mbFull(cu.tien)} sẽ bị gỡ.</span>` : '');
  }
  return cu && cu.tien !== con
    ? `→ Phiếu tự động ${mbFull(cu.tien)} sẽ cập nhật thành <b style="color:var(--mb-green)">${mbFull(con)}</b> (ngày ${mbDate(f.ngay)}).`
    : `→ ${cu ? 'Giữ' : 'Sẽ tạo'} phiếu thu <b style="color:var(--mb-green)">${mbFull(con)}</b> ngày ${mbDate(f.ngay)} — còn phải thu sau quyết toán, tính trên toàn bộ các năm.`;
}

// ── Form quyết toán của 1 công trình ──
function mbQtForm() {
  const p = mbProject(MB.qtCt);
  if (!p) return `<div class="mb-pad"><div class="mb-empty">Không tìm thấy công trình</div></div>`;
  const F       = MB.qtForm;
  const canEdit = mbQtCanEdit();
  const locked  = MB.qtLocked || !canEdit;
  const soTien  = mbMoney(F.soTien);
  const f       = qtTaoNhap(p.id, F.editId, F.loai, soTien, F.ngay);
  const { truoc, sau } = _qtFin(f);
  const { rec, count } = _qtRecordOfCt(p.id, F.editId || undefined);

  const dtSau = sau ? sau.giaTriHD : truoc.giaTriHD;
  const lnSau = dtSau - truoc.chiThucTe;
  const chenh = dtSau - truoc.giaTriHD;
  const sgn   = v => (v < 0 ? '−' : '') + mbFull(Math.abs(v));
  const colOf = v => (v >= 0 ? 'var(--mb-green)' : 'var(--mb-red)');
  const cell  = (cls, lb, val, hint, col) => `<div class="mb-kpi ${cls}" style="padding:11px">
      <div class="mb-kpi-label">${lb}</div>
      <div class="mb-kpi-value" style="font-size:14px${col ? ';color:' + col : ''}">${val}</div>
      ${hint ? `<div class="mb-kpi-hint">${hint}</div>` : ''}</div>`;

  const summary = `<div class="mb-grid2">
      ${cell('', 'Giá trị HĐ gốc', mbFull(truoc.X), '')}
      ${cell('', 'Chi phí thực tế đã chi', mbFull(truoc.chiThucTe), truoc.chiChung > 0 ? 'gồm ' + mbFmt(truoc.chiChung) + ' chi phí chia tỉ trọng' : '', 'var(--mb-red)')}
      ${cell('', 'Doanh thu hiện tại', mbFull(truoc.tongThu), 'Đã thu' + (truoc.soDotThu ? ' · ' + truoc.soDotThu + ' đợt' : ''), 'var(--mb-green)')}
      ${cell('', 'Lợi nhuận hiện tại', sgn(truoc.hieuQua), truoc.isActive ? 'Đang thi công — đã thu − chi thực tế' : 'Lãi / lỗ cuối', colOf(truoc.hieuQua))}
      ${cell('blue', 'Doanh thu sau quyết toán', mbFull(dtSau), sau ? (chenh ? (chenh > 0 ? '▲ +' : '▼ −') + mbFmt(Math.abs(chenh)) : 'không đổi') + ' so với hiện hành' : 'Chưa nhập số tiền — bằng HĐ + QT hiện hành')}
      ${cell('blue', 'Lợi nhuận sau quyết toán', sgn(lnSau), 'DT sau QT − chi phí đã chi', colOf(lnSau))}
    </div>`;

  // ── Chế độ CHỈ XEM: công trình đã có quyết toán ──
  if (locked && rec) {
    const thuAuto = (typeof _qtAutoThuOf === 'function') ? _qtAutoThuOf(rec.id) : null;
    return `<div class="mb-pad">
      ${p.status === 'closed' ? '<div><span class="mb-tag red">🔒 Đã quyết toán</span></div>' : ''}
      ${summary}
      ${count > 1 ? `<div class="mb-card mb-card-sm" style="background:var(--mb-amber-l);border-color:var(--mb-amber-b);font-size:12px">⚠ Công trình đang có ${count} bản quyết toán (dữ liệu cũ) — mỗi công trình chỉ 01 bản; xóa bản thừa ở tab Lịch sử.</div>` : ''}
      <div class="mb-card">
        <div class="mb-row-between" style="margin-bottom:8px;align-items:center">
          <div class="mb-sec-title">Quyết toán đã lưu</div>${mbQtTag(rec)}
        </div>
        <div style="font-size:18px;font-weight:800;margin-bottom:6px">${mbX(qtSoTienTxt(rec, mbFull))}</div>
        <div style="font-size:12px;color:var(--mb-text-2);line-height:1.6">
          Ngày ${mbDate(rec.ngay)} · ${mbX(rec.nguoi || 'Chưa ghi người thực hiện')}<br>
          ${mbX(rec.nd || '')}
          ${rec.chot ? '<br>🔒 Quyết toán cuối cùng (đã chốt sổ)' : ''}
          ${thuAuto ? `<br>🧾 Phiếu thu tự động ${mbFull(thuAuto.tien)} (ngày ${mbDate(thuAuto.ngay)})` : ''}
        </div>
      </div>
      ${canEdit
        ? `<button class="mb-btn" data-act="qtUnlock">✏️ Sửa quyết toán</button>`
        : '<div style="font-size:11.5px;color:var(--mb-muted-2);text-align:center">Chỉ Quản trị viên hoặc Giám đốc được sửa quyết toán.</div>'}
    </div>`;
  }

  // ── Chế độ NHẬP / SỬA ──
  const loais = [['tang', '+ Tăng', 'green'], ['giam', '− Giảm', 'red'], ['thaythe', '= Thay thế', 'blue']];
  const warns = [];
  if (sau) {
    if (sau.giaTriHD < 0) warns.push(['red', 'Doanh thu sau quyết toán bị ÂM — kiểm tra lại số tiền giảm trừ.']);
    else if (sau.conPhaiThu < 0) warns.push(['amber', `Đã thu VƯỢT doanh thu sau quyết toán ${mbFull(-sau.conPhaiThu)} — có thể phải hoàn trả Chủ đầu tư.`]);
    if (F.loai === 'thaythe' && F.ngay) {
      const others = quyetToanRecords.filter(r => !r.deletedAt && r.id !== F.editId && _qtMatchProj(r, p) && (r.ngay || '') > F.ngay);
      const tt = others.filter(r => qtLoaiOf(r) === 'thaythe');
      if (tt.length) warns.push(['amber', `Đã có bản THAY THẾ ngày ${mbDate(tt[tt.length - 1].ngay)} mới hơn → bản mới hơn quyết định doanh thu, bản này không còn tác dụng.`]);
      else if (others.length) warns.push(['blue', `Có ${others.length} phát sinh tăng / giảm sau ngày này — vẫn được cộng / trừ tiếp sau giá trị thay thế.`]);
    }
    if (F.ngay && typeof _dtInYear === 'function' && !_dtInYear(F.ngay)) warns.push(['blue', 'Ngày quyết toán nằm ngoài năm đang lọc — số "sau quyết toán" ở trên chưa tính bản này.']);
  }
  const WARN_STY = { red: 'background:var(--mb-red-l);color:var(--mb-red)', amber: 'background:var(--mb-amber-l);color:#92400E', blue: 'background:var(--mb-primary-l);color:var(--mb-primary-d)' };
  const sw = (key, on, title, sub) => `<div class="mb-switch-row" data-act="qtToggle" data-arg="${key}">
      <span class="mb-switch${on ? ' on' : ''}"><i></i></span>
      <div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:700">${title}</div>${sub ? `<div style="font-size:11px;color:var(--mb-muted);margin-top:2px">${sub}</div>` : ''}</div>
    </div>`;
  const thuHint = mbQtThuHint(f, p);

  return `<div class="mb-pad">
    ${summary}
    <div class="mb-card" style="display:flex;flex-direction:column;gap:11px">
      <div class="mb-sec-title">${F.editId ? 'Sửa quyết toán' : 'Thêm quyết toán'}</div>
      <div>
        <div class="mb-label">Loại quyết toán *</div>
        <div class="mb-seg3">
          ${loais.map(([k, l, c]) => `<div class="${F.loai === k ? 'on ' + c : ''}" data-act="qtSetLoai" data-arg="${k}">${l}</div>`).join('')}
        </div>
        <div style="font-size:11px;color:var(--mb-muted);margin-top:5px;font-style:italic">${mbX((typeof _QT_HINT !== 'undefined' && _QT_HINT[F.loai]) || '')}</div>
      </div>
      <div>
        <div class="mb-label">${mbX((typeof _QT_SOTIEN_LABEL !== 'undefined' && _QT_SOTIEN_LABEL[F.loai]) || 'Số tiền (đ)')}</div>
        <input id="mb-qt-sotien" class="mb-input money-lg" inputmode="numeric" data-money="1" data-in="qtForm.soTien" data-live="1" value="${mbX(F.soTien)}" placeholder="VD: 50.000.000"/>
        ${mbQuickMoney('qtForm.soTien', F.soTien)}
        <div style="font-size:12px;margin-top:6px;${sau ? 'font-weight:700;color:' + (chenh < 0 ? 'var(--mb-red)' : 'var(--mb-green)') : 'color:var(--mb-muted)'}">${sau
          ? `💡 Doanh thu mới: ${mbFull(sau.giaTriHD)} <span style="font-weight:500">(${chenh ? (chenh > 0 ? '▲ +' : '▼ −') + mbFmt(Math.abs(chenh)) : 'không đổi'} · còn phải thu ${sgn(sau.conPhaiThu)})</span>`
          : (F.loai === 'tang' ? 'Để trống / 0 = quyết toán ĐÚNG HĐ GỐC (không phát sinh). Gõ số tiền để xem doanh thu mới.' : 'Gõ số tiền để xem doanh thu mới.')}</div>
        ${warns.map(([t, m]) => `<div style="font-size:11.5px;border-radius:8px;padding:7px 9px;margin-top:6px;${WARN_STY[t]}">${t === 'blue' ? 'ℹ' : '⚠'} ${mbX(m)}</div>`).join('')}
      </div>
      <div class="mb-row">
        <div class="mb-field"><div class="mb-label">Ngày thực hiện *</div>
          <input id="mb-qt-ngay" class="mb-input" type="date" data-in="qtForm.ngay" value="${mbX(F.ngay)}"/></div>
        <div class="mb-field"><div class="mb-label">Người thực hiện</div>
          <select id="mb-qt-nguoi" class="mb-select" data-in="qtForm.nguoi">${mbOptionsKeep(cats.nguoiTH, F.nguoi, '-- Chọn --')}</select></div>
      </div>
      <div><div class="mb-label">Nội dung / Lý do *</div>
        <textarea id="mb-qt-nd" class="mb-input" rows="2" data-in="qtForm.nd" placeholder="VD: Phát sinh ốp lát tầng 2 / Quyết toán cuối theo biên bản ngày...">${mbX(F.nd)}</textarea></div>
      ${sw('chot', F.chot, 'Quyết toán cuối cùng (Chốt sổ)', 'Chuyển công trình sang "Đã quyết toán" — không nhập thêm chi phí')}
      ${sw('thuConLai', F.thuConLai, 'Ghi nhận phiếu thu tiền còn lại', thuHint || 'Tự tạo phiếu thu cho số tiền còn phải thu (khóa, không sửa / xóa ở tab Thu tiền)')}
    </div>
    <div class="mb-sticky-bar">
      <button class="mb-btn gray" style="flex:1" data-act="qtCancel">${F.editId ? 'Hủy thay đổi' : 'Hủy'}</button>
      <button class="mb-btn amber" style="flex:2" data-act="saveQtMb">💾 ${F.editId ? 'Cập nhật quyết toán' : 'Lưu quyết toán'}</button>
    </div>
  </div>`;
}

// ── Tab con 2: lịch sử quyết toán (năm đang lọc) ──
function mbQtLichSu() {
  const q = (MB.qtHisSearch || '').toLowerCase();
  const nameOf = r => (typeof _resolveCtName === 'function' ? _resolveCtName(r) : '') || r.congtrinh || '—';
  let list = (typeof quyetToanRecords !== 'undefined' ? quyetToanRecords : [])
    .filter(r => !r.deletedAt && (typeof _dtInYear !== 'function' || _dtInYear(r.ngay)));
  if (q) list = list.filter(r => (nameOf(r) + ' ' + (r.nd || '') + ' ' + (r.nguoi || '')).toLowerCase().includes(q));
  list.sort((a, b) => _qtSortAsc(b, a));     // mới nhất lên đầu

  // Ảnh hưởng doanh thu + DT sau QT cộng dồn theo từng công trình (giống qtRenderHistory)
  const cache = new Map();
  const calcFor = r => {
    const p = _qtResolveProj(r.projectId) || _qtResolveProj(r.congtrinh);
    if (!p) return null;
    if (!cache.has(p.id)) {
      const { recs, deltas } = qtTinhDelta(p);
      let run = qtHdGocCuaCT(p);
      const runDT = new Map();
      recs.forEach(x2 => { run += deltas.get(x2.id) || 0; runDT.set(x2.id, run); });
      cache.set(p.id, { deltas, runDT });
    }
    return cache.get(p.id);
  };
  const canEdit = mbQtCanEdit();
  const shown = list.slice(0, MB.qtHisLimit);

  return `<div class="mb-pad">
    <div class="mb-search">
      ${mbSearchIcon()}
      <input id="mb-in-qthis" data-in="qtHisSearch" data-live="1" value="${mbX(MB.qtHisSearch)}" placeholder="Tìm công trình, nội dung, người..."/>
    </div>
    <div style="font-size:11px;color:var(--mb-muted-2)">${list.length} bản quyết toán · năm ${mbX(mbYearLabel())} · mỗi công trình 01 bản.</div>
    <div class="mb-col" style="gap:9px">
      ${shown.length ? shown.map(r => {
        const c = calcFor(r);
        const d = c ? (c.deltas.get(r.id) || 0) : 0;
        return `<div class="mb-card mb-card-sm">
          <div class="mb-row-between" style="margin-bottom:5px">
            <span style="font-size:13px;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${mbX(nameOf(r))}</span>
            <span style="font-size:13px;font-weight:800;flex-shrink:0">${mbX(qtSoTienTxt(r, mbFmt))}</span>
          </div>
          <div style="font-size:11px;color:var(--mb-muted-2);margin-bottom:4px">${mbQtTag(r)} · ${mbDate(r.ngay)} · ${mbX(r.nguoi || '—')}</div>
          <div style="font-size:11.5px;color:var(--mb-text-2)">Ảnh hưởng DT <b style="color:${d < 0 ? 'var(--mb-red)' : d > 0 ? 'var(--mb-green)' : 'var(--mb-muted)'}">${d ? (d > 0 ? '+' : '-') + mbFmt(Math.abs(d)) : '0'}</b> · DT sau QT <b>${c ? mbFmt(c.runDT.get(r.id) || 0) : '—'}</b></div>
          ${r.nd ? `<div style="font-size:11.5px;color:var(--mb-muted);margin-top:3px">${mbX(r.nd)}</div>` : ''}
          ${canEdit ? `<div class="mb-btn-row" style="margin-top:8px">
            <button class="mb-btn-outline blue" data-act="editQtMb" data-arg="${mbX(r.id)}">Sửa</button>
            <button class="mb-btn-outline red" data-act="delQtMb" data-arg="${mbX(r.id)}">Xóa</button>
          </div>` : ''}
        </div>`;
      }).join('') : `<div class="mb-empty">Chưa có quyết toán nào${q ? ' khớp tìm kiếm' : ''}</div>`}
    </div>
    ${list.length > shown.length ? `<button class="mb-btn gray" data-act="moreQtHis">Xem thêm (còn ${list.length - shown.length})</button>` : ''}
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  14 · TỈ TRỌNG & ĐỊNH MỨC (31/10/2026) — chủ yếu XEM.
//       Số liệu 100% từ tytrong.core.js (tytTongHop / tytCayNhom / tytKiemSoat / tytXuHuongM2)
//       → khớp từng đồng với tab Tỉ Trọng bản máy tính.
//       Cấu hình phân nhóm, gán hàng loạt, tạo / sửa bộ định mức… vẫn làm trên máy tính.
// ══════════════════════════════════════════════════════════════
const MB_NHOM_COLOR = { 1: 'var(--mb-primary)', 2: 'var(--mb-green)', 3: 'var(--mb-amber)', 4: 'var(--mb-purple)', 0: 'var(--mb-muted-2)' };

function mbTytOpts() { return { allYears: !!MB.tytAllYears }; }

/** tytTongHop của 1 công trình — nhớ trong 1 lần vẽ (MB._tytCache xóa đầu mỗi mbRender) */
function mbTyt(p) {
  if (!p || typeof tytTongHop !== 'function') return null;
  const k = p.id + '|' + (MB.tytAllYears ? 1 : 0);
  if (!MB._tytCache[k]) {
    try { MB._tytCache[k] = tytTongHop(p, mbTytOpts()); }
    catch (e) { console.warn('[mobile] tytTongHop', e); return null; }
  }
  return MB._tytCache[k];
}

/** Trọn vòng đời: tải các năm còn thiếu (dùng lại _tytEnsureYears của desktop — tải xong tự mbRender) */
function mbTytEnsureYears(years) {
  if (!MB.tytAllYears || typeof _tytEnsureYears !== 'function' || !years || !years.length) return;
  try { _tytEnsureYears(years); } catch (e) { console.warn('[mobile] _tytEnsureYears', e); }
}

/** % một chữ số thập phân kiểu Việt Nam ("27,4%") */
function mbTytPct(v, tong) { return tong ? (Math.round(v / tong * 1000) / 10).toString().replace('.', ',') + '%' : '—'; }

/** Dòng trạng thái phạm vi dưới 2 chip (giống _tytRenderScope desktop) */
function mbTytScopeTxt(p) {
  if (!MB.tytAllYears) return `Đang tính theo năm đang lọc (${mbYearLabel()}).`;
  const ys = tytNamVongDoi(p);
  const range = ys.length > 1 ? ys[0] + '–' + ys[ys.length - 1] : ys[0];
  if (typeof _tytLoading !== 'undefined' && _tytLoading) return `⏳ Đang tải dữ liệu năm ${(_tytLoadingYrs || []).join(', ')}…`;
  const thieu = (typeof _tytMissingYears === 'function') ? _tytMissingYears(ys) : [];
  if (thieu.length && typeof fbReady === 'function' && fbReady()) {
    return `Vòng đời ${range} · <span style="color:var(--mb-amber)">⚠ chưa tải được năm ${thieu.join(', ')} — số liệu có thể thiếu</span> <span class="mb-link" style="font-size:11px" data-act="tytRetry">Thử lại</span>`;
  }
  return `Vòng đời ${range} · đã đủ dữ liệu các năm.`;
}

/** Dropdown công trình: vòng đời → mọi CT; theo năm → CT thuộc năm đang lọc (giữ CT đang chọn) */
function mbTytCtOptions() {
  let list = mbProjects();
  if (!MB.tytAllYears) list = list.filter(p => p.id === MB.tytCt || typeof qtCtInYear !== 'function' || qtCtInYear(p.name));
  list = list.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
  return '<option value="">-- Chọn công trình --</option>' + list.map(p =>
    `<option value="${mbX(p.id)}"${p.id === MB.tytCt ? ' selected' : ''}>${mbX(p.name)}${tytTongSan(p) > 0 ? '' : ' · chưa có M2'}</option>`).join('');
}

/** Phần đầu màn (mọi tab con): chọn công trình + phạm vi */
function mbTytHead(p) {
  return `<select id="mb-tyt-ct" class="mb-select" data-in="tytCt" data-onchange="tytPickCt">${mbTytCtOptions()}</select>
    <div class="mb-chips even">
      <div class="mb-chip${MB.tytAllYears ? ' on' : ''}" data-act="tytScope" data-arg="1">Trọn vòng đời</div>
      <div class="mb-chip${MB.tytAllYears ? '' : ' on'}" data-act="tytScope" data-arg="0">Năm đang lọc</div>
    </div>
    ${p ? `<div style="font-size:11px;color:var(--mb-muted-2);margin-top:-4px">${mbTytScopeTxt(p)}</div>` : ''}`;
}

function mbScrTyTrong() {
  const p   = mbProject(MB.tytCt);
  const seg = MB.seg.tytrong;
  if (seg === 'sosanh') {
    const body = mbTytSoSanh(p);          // tính trước để dòng trạng thái thấy lượt tải năm vừa bắt đầu
    return `<div class="mb-pad">${mbTytHead(p)}${body}</div>`;
  }
  if (!p) {
    return `<div class="mb-pad">${mbTytHead(null)}
      <div class="mb-card" style="text-align:center;color:var(--mb-muted);font-size:13px;padding:28px 14px">
        ${mbIcon('touch_app', 30)}<div style="margin-top:6px">Chọn công trình để xem tỉ trọng chi phí.</div>
      </div></div>`;
  }
  mbTytEnsureYears(tytNamVongDoi(p));
  const r = mbTyt(p);
  if (!r) return `<div class="mb-pad">${mbTytHead(p)}<div class="mb-empty">Không tính được tỉ trọng cho công trình này.</div></div>`;
  return `<div class="mb-pad">${mbTytHead(p)}${seg === 'dinhmuc' ? mbTytDinhMuc(p, r) : mbTytTongQuan(p, r)}</div>`;
}

// ── Tab con 1: TỔNG QUAN ──
function mbTytTongQuan(p, r) {
  const coSan = r.tongSan > 0;
  const kpi = (cls, label, value, hint) => `<div class="mb-kpi ${cls}">
      <div class="mb-kpi-label">${label}</div><div class="mb-kpi-value" style="font-size:15px">${value}</div>
      <div class="mb-kpi-hint">${hint}</div></div>`;

  // Nhóm chính của từng loại chi phí (để gắn nhãn N1..N4 ở bảng theo loại)
  const nhomLoai = {};
  r.lines.forEach(l => l.parts.forEach(pt => {
    const m = nhomLoai[l.loai] || (nhomLoai[l.loai] = {});
    m[pt.nhom] = (m[pt.nhom] || 0) + pt.tien;
  }));
  const nhomOf = loai => { const m = nhomLoai[loai] || {}; return +(Object.keys(m).sort((a, b) => m[b] - m[a])[0] || 0); };
  const loaiAll  = !!MB.tytOpen.loai;
  const loaiRows = loaiAll ? r.theoLoai : r.theoLoai.slice(0, 10);
  const maxLoai  = r.theoLoai.length ? r.theoLoai[0].tien : 1;

  return `<div class="mb-grid2">
      ${kpi('red', 'Tổng chi phí thực tế', mbFmt(r.tongChi), r.lines.length + ' khoản chi')}
      ${kpi('', 'Tổng diện tích sàn', coSan ? tytFmtM2(r.tongSan) + ' m²' : 'Chưa nhập', coSan ? 'Bảng M2 bên dưới' : 'Nhập ở bảng M2 bên dưới')}
      ${kpi('blue', 'Đơn giá Thô & NC / m²', coSan ? mbFull(Math.round(r.cpM2N1)) : '—', 'Nhóm 1 ÷ tổng sàn')}
      ${kpi('', 'Đơn giá toàn bộ / m²', coSan ? mbFull(Math.round(r.cpM2)) : '—', 'Tổng chi ÷ tổng sàn')}
    </div>

    ${mbTytChuaNhom(r)}

    <div class="mb-sec-head" style="margin:4px 0 -2px">
      <div class="mb-sec-title">Tỷ trọng theo 4 nhóm chi phí</div>
      <div style="font-size:11px;color:var(--mb-muted-2)">bấm để xem chi tiết</div>
    </div>
    ${r.lines.length ? tytCayNhom(r).map(n => mbTytNhomCard(n, r)).join('') : '<div class="mb-empty">Chưa có khoản chi nào</div>'}

    ${mbTytM2Card(p, r)}

    ${r.theoLoai.length ? `<div class="mb-card">
      <div class="mb-sec-head" style="margin-bottom:11px">
        <div class="mb-sec-title">Theo loại chi phí</div>
        <div style="font-size:11px;color:var(--mb-muted-2)">${r.theoLoai.length} loại</div>
      </div>
      <div class="mb-col" style="gap:10px">
        ${loaiRows.map(o => {
          const n = nhomOf(o.loai);
          return `<div>
            <div class="mb-row-between" style="margin-bottom:4px;align-items:center">
              <span style="font-size:12px;color:var(--mb-text-2);font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${mbX(o.loai)} <span class="mb-nh-tag n${n}">${n ? 'N' + n : '?'}</span></span>
              <span style="font-size:12.5px;font-weight:800;flex-shrink:0">${mbFmt(o.tien)} <span style="font-weight:600;color:var(--mb-muted-2)">· ${mbTytPct(o.tien, r.tongChi)}</span></span>
            </div>
            <div class="mb-bar"><i style="width:${mbBarW(o.tien, maxLoai)};background:${MB_NHOM_COLOR[n]}"></i></div>
            ${coSan ? `<div style="font-size:10.5px;color:var(--mb-muted-2);margin-top:2px">${mbFull(Math.round(o.tien / r.tongSan))}/m²</div>` : ''}
          </div>`;
        }).join('')}
      </div>
      ${r.theoLoai.length > 10 ? `<div class="mb-link" style="text-align:center;margin-top:10px" data-act="tytToggle" data-arg="loai">${loaiAll ? 'Thu gọn ▲' : 'Xem tất cả ' + r.theoLoai.length + ' loại ▼'}</div>` : ''}
    </div>` : ''}

    <div style="font-size:11px;color:var(--mb-muted-2);text-align:center">Gán nhóm theo HĐ thầu phụ, gán hàng loạt và cấu hình phân nhóm: dùng bản máy tính.</div>`;
}

/** Thẻ 1 nhóm chi phí (bấm → bung trụ cột / loại chi phí / khoản chi) */
function mbTytNhomCard(n, r) {
  const open = !!MB.tytOpen[n.key];
  const col  = MB_NHOM_COLOR[n.nhom];
  const ten  = n.nhom ? `Nhóm ${n.nhom} · ${(TYT_NHOM[n.nhom] || {}).ten || ''}` : 'Chưa xếp nhóm';
  const m2   = r.tongSan > 0 ? ' · ' + mbFull(Math.round(n.tien / r.tongSan)) + '/m²' : '';
  return `<div class="mb-card" style="padding:12px 13px${n.nhom ? '' : ';border-color:var(--mb-red-b)'}">
    <div class="mb-acc-head" data-act="tytToggle" data-arg="${mbX(n.key)}">
      <span class="mb-nh-dot" style="background:${col}"></span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700">${mbX(ten)}</div>
        <div style="font-size:11px;color:var(--mb-muted-2)">${mbFmt(n.tien)} · ${mbTytPct(n.tien, r.tongChi)}${m2}</div>
      </div>
      <span class="mb-acc-caret">${open ? '▲' : '▼'}</span>
    </div>
    <div class="mb-bar" style="margin-top:8px"><i style="width:${mbBarW(n.tien, r.tongChi)};background:${col}"></i></div>
    ${open ? `<div class="mb-acc-body">${n.children.map(c => mbTytNode(c, r, 0)).join('') || '<div class="mb-tyt-note" style="padding:6px 0">Chưa có khoản chi</div>'}</div>` : ''}
  </div>`;
}

/** 1 dòng trụ cột / loại chi phí trong thẻ nhóm (đệ quy) */
function mbTytNode(n, r, depth) {
  const has  = n.children.length > 0;
  const open = has && !!MB.tytOpen[n.key];
  const pad  = depth * 12;
  const ten  = n.kind === 'tru'
    ? `<b>${mbX(n.ten)}</b>`
    : `${mbX(n.ten)} <span class="mb-tyt-note">(${n.soDong} khoản)</span>`;
  let body = '';
  if (open) {
    if (n.kind === 'loai') {
      const lim  = MB.tytLim[n.key] || 20;
      const more = n.children.length - lim;
      body = n.children.slice(0, lim).map(c => mbTytLine(c, depth + 1)).join('') +
        (more > 0 ? `<div class="mb-link" style="padding:6px 0 4px ${pad + 30}px;font-size:11.5px" data-act="tytMore" data-arg="${mbX(n.key)}">Xem thêm ${Math.min(20, more)} khoản (còn ${more}) ›</div>` : '');
    } else {
      body = n.children.map(c => mbTytNode(c, r, depth + 1)).join('');
    }
  }
  return `<div class="mb-tyt-row${has ? ' tap' : ''}" style="padding-left:${pad}px"${has ? ` data-act="tytToggle" data-arg="${mbX(n.key)}"` : ''}>
      <span class="mb-tyt-tg">${has ? (open ? '▾' : '▸') : ''}</span>
      <span class="mb-tyt-name">${ten}</span>
      <span class="mb-tyt-val">${mbFmt(n.tien)} <span class="mb-tyt-note">· ${mbTytPct(n.tien, r.tongChi)}</span></span>
    </div>${body}`;
}

/** 1 khoản chi (cấp cuối của cây) */
function mbTytLine(c, depth) {
  const l = c.line, pt = c.part;
  const ten = pt.mon ? pt.ten : (l.nd || '—');
  return `<div class="mb-tyt-line" style="padding-left:${depth * 12 + 16}px">
      <div style="flex:1;min-width:0">
        <div class="mb-tyt-ln-t">${mbX(ten)}</div>
        <div class="mb-tyt-note">${mbDate(l.ngay)}${l.doiTuong ? ' · ' + mbX(l.doiTuong) : ''}${pt.mon ? ' · món của hóa đơn' : ''}${pt.nhomSrc === 'tay' ? ' · gán tay' : ''}</div>
      </div>
      <span class="mb-tyt-val">${mbFmt(pt.tien)}</span>
    </div>`;
}

/** Cảnh báo "Chưa xếp nhóm" — bấm để xem các khoản */
function mbTytChuaNhom(r) {
  if (!r.chuaNhom.length) return '';
  const open = !!MB.tytOpen.chua;
  const tien = r.theoNhom[0] || 0;
  const ls = r.chuaNhom.map(l => ({ l, tien: l.parts.filter(pt => pt.nhom === 0).reduce((s, pt) => s + pt.tien, 0) }));
  return `<div class="mb-card mb-card-sm" style="border-color:var(--mb-red-b);background:var(--mb-red-l)">
    <div class="mb-acc-head" data-act="tytToggle" data-arg="chua">
      <span style="flex:1;font-size:12.5px;font-weight:700;color:var(--mb-red)">⚠ Chưa xếp nhóm: ${r.chuaNhom.length} khoản · ${mbFmt(tien)}</span>
      <span class="mb-acc-caret" style="color:var(--mb-red)">${open ? '▲' : '▼'}</span>
    </div>
    ${open ? `<div class="mb-acc-body" style="border-top-color:var(--mb-red-b)">
      <div class="mb-tyt-note" style="padding-bottom:4px">Bấm 1 · 2 · 3 · 4 để xếp khoản vào nhóm (gán tay — chỉ công trình này).</div>
      ${ls.slice(0, 40).map(({ l, tien: t }) => `<div class="mb-tyt-line" style="padding-left:0;flex-wrap:wrap">
        <div style="flex:1;min-width:0">
          <div class="mb-tyt-ln-t">${mbX(l.nd || '—')}</div>
          <div class="mb-tyt-note">${mbDate(l.ngay)} · ${mbX(l.loai)}${l.doiTuong ? ' · ' + mbX(l.doiTuong) : ''}</div>
        </div>
        <span class="mb-tyt-val">${mbFmt(t)}</span>
        <div class="mb-nh-pick">${[1, 2, 3, 4].map(n =>
          `<b class="n${n}" data-act="tytGanNhom" data-arg="${n}|${mbX(l.key)}" title="Nhóm ${n}: ${mbX((TYT_NHOM[n] || {}).ten || '')}">${n}</b>`).join('')}</div>
      </div>`).join('')}
      ${ls.length > 40 ? `<div class="mb-tyt-note" style="padding-top:6px">… và ${ls.length - 40} khoản nữa — xếp xong 40 khoản đầu sẽ hiện tiếp.</div>` : ''}
      <div class="mb-tyt-note" style="padding-top:6px">Xếp cả một loại chi phí (áp cho mọi công trình): dùng bản máy tính.</div>
    </div>` : ''}
  </div>`;
}

/** Bảng diện tích sàn (field khoiLuong của công trình) — xem + sửa (ghi qua updateProject như tytKlSave) */
function mbTytM2Card(p, r) {
  if (MB.tytKlEdit) return mbTytM2Edit();
  const rows = (Array.isArray(p.khoiLuong) ? p.khoiLuong : []).filter(x => x && (x.ten || tytKlNum(x.kl)));
  const open = !!MB.tytOpen.m2;
  return `<div class="mb-card mb-card-sm">
    <div class="mb-acc-head" data-act="tytToggle" data-arg="m2">
      ${mbIcon('square_foot', 20)}
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700">Bảng diện tích sàn</div>
        <div style="font-size:11px;color:var(--mb-muted-2)">${rows.length ? rows.length + ' dòng · tổng ' + tytFmtM2(r.tongSan) + ' m²' : 'Chưa nhập'}</div>
      </div>
      <span class="mb-acc-caret">${open ? '▲' : '▼'}</span>
    </div>
    ${open ? `<div class="mb-acc-body">
      ${rows.length ? rows.map(x => {
        const tinh = tytKlTinh(x), hs = tytKlHeSo(x);
        return `<div class="mb-tyt-line" style="padding-left:0${tinh ? '' : ';opacity:.55'}">
          <div style="flex:1;min-width:0">
            <div class="mb-tyt-ln-t">${mbX(x.ten || '(không tên)')}</div>
            <div class="mb-tyt-note">${tytFmtM2(tytKlNum(x.kl))} ${mbX(x.dvt || 'm2')}${hs !== 1 ? ' × hệ số ' + tytFmtM2(hs) : ''}${tinh ? '' : ' · không tính vào tổng'}</div>
          </div>
          <span class="mb-tyt-val">${tinh ? tytFmtM2(tytKlNum(x.kl) * hs) + ' m²' : '—'}</span>
        </div>`;
      }).join('') : '<div class="mb-tyt-note" style="padding:4px 0">Chưa có bảng M2 — chưa tính được đơn giá đ/m².</div>'}
      <button class="mb-btn-outline blue" style="margin-top:8px" data-act="tytKlStart">✏️ ${rows.length ? 'Sửa bảng M2' : 'Nhập bảng M2'}</button>
    </div>` : ''}
  </div>`;
}

/** Form sửa bảng M2: mỗi dòng = tên · khối lượng · hệ số · có tính vào tổng không */
function mbTytM2Edit() {
  const rows = MB.tytKlEdit;
  const tong = tytTongSanRows(rows.map(x => ({ kl: tytKlNum(x.kl), heSo: x.heSo === '' ? 1 : tytKlNum(x.heSo), tinh: x.tinh })));
  return `<div class="mb-card" style="display:flex;flex-direction:column;gap:9px;border-color:#BFDBFE">
    <div class="mb-row-between" style="align-items:center">
      <div class="mb-sec-title">Sửa bảng diện tích sàn</div>
      <span style="font-size:12.5px;font-weight:800;color:var(--mb-primary)">${tytFmtM2(tong)} m²</span>
    </div>
    <div style="font-size:11px;color:var(--mb-muted)">Hệ số quy đổi: mái, sân thường 0,5 (mặc định 1). Tắt "Tính" = không cộng vào tổng sàn.</div>
    ${rows.map((x, i) => `<div class="mb-kl-row">
      <div class="mb-row" style="gap:6px;align-items:center">
        <input id="mb-kl-ten-${i}" class="mb-input" style="flex:1" data-in="tytKlEdit.${i}.ten" value="${mbX(x.ten)}" placeholder="Tên: Trệt, Lầu 1, Mái..."/>
        <button class="mb-icon-btn red" data-act="tytKlDel" data-arg="${i}" title="Xóa dòng">${mbIcon('close', 17)}</button>
      </div>
      <div class="mb-row" style="gap:6px;align-items:flex-end;margin-top:6px">
        <div class="mb-field"><div class="mb-label">Khối lượng (${mbX(x.dvt || 'm2')})</div>
          <input id="mb-kl-kl-${i}" class="mb-input" inputmode="decimal" data-in="tytKlEdit.${i}.kl" data-onchange="rerender" value="${mbX(x.kl)}" placeholder="0"/></div>
        <div class="mb-field" style="flex:.7"><div class="mb-label">Hệ số</div>
          <input id="mb-kl-hs-${i}" class="mb-input" inputmode="decimal" data-in="tytKlEdit.${i}.heSo" data-onchange="rerender" value="${mbX(x.heSo)}" placeholder="1"/></div>
        <div class="mb-chip${x.tinh ? ' on' : ''}" style="padding:10px 12px;border-radius:9px" data-act="tytKlTinh" data-arg="${i}">${x.tinh ? '✓ Tính' : 'Không tính'}</div>
      </div>
    </div>`).join('')}
    <button class="mb-btn dashed" data-act="tytKlAdd">+ Thêm 1 dòng</button>
    <div style="display:flex;gap:9px">
      <button class="mb-btn gray" style="flex:1" data-act="tytKlCancel">Hủy</button>
      <button class="mb-btn" style="flex:2" data-act="tytKlSaveMb">💾 Lưu bảng M2</button>
    </div>
  </div>`;
}

// ── Tab con 2: ĐỊNH MỨC (kiểm soát Nhóm 1) ──
/** Bộ định mức có số 4 trụ cột (dùng được để kiểm soát) */
function mbTytDmList() {
  return (typeof tytDinhMucList === 'function' ? tytDinhMucList() : [])
    .filter(d => typeof tytDmCoRo1 !== 'function' || tytDmCoRo1(d));
}
function mbTytDmCur() {
  const ds = mbTytDmList();
  return ds.find(d => d.id === MB.tytDm) || ds[0] || null;
}
/** { dm, dt, ks } của công trình đang xem — ks = null khi chưa có diện tích */
function mbTytKs(r) {
  const dm = mbTytDmCur();
  if (!dm || typeof tytKiemSoat !== 'function') return null;
  const dt = MB.tytDt === '' ? r.tongSan : tytKlNum(MB.tytDt);
  return { dm, dt, ks: dt > 0 ? tytKiemSoat(dm, dt, r) : null };
}
/** Nhãn tab con "Định mức" — kèm số trụ cột đang vượt */
function mbTytDmTabLabel() {
  const p = mbProject(MB.tytCt);
  const r = p ? mbTyt(p) : null;
  const o = r ? mbTytKs(r) : null;
  const n = (o && o.ks) ? o.ks.soVuot : 0;
  return 'Định mức' + (n ? ` (${n} vượt)` : '');
}

function mbTytDinhMuc(p, r) {
  const ds = mbTytDmList();
  if (!ds.length) {
    return `<div class="mb-card" style="font-size:12.5px;color:var(--mb-text-2);line-height:1.55">
      Chưa có bộ định mức nào có số 4 trụ cột.<br>Tạo trên máy tính: tab <b>Tỉ trọng</b> → <b>Kiểm soát định mức</b> → "Lưu từ CT này" (công trình đã quyết toán) hoặc "Nhập tay".
    </div>`;
  }
  const o  = mbTytKs(r);
  const dm = o.dm;
  const dtShow = MB.tytDt === '' ? (r.tongSan > 0 ? tytFmtM2(r.tongSan) : '') : MB.tytDt;
  const form = `<div class="mb-card" style="display:flex;flex-direction:column;gap:10px">
    <div><div class="mb-label">Bộ định mức</div>
      <select id="mb-tyt-dm" class="mb-select" data-in="tytDm" data-onchange="tytPickDm">${ds.map(d =>
        `<option value="${mbX(d.id)}"${d.id === dm.id ? ' selected' : ''}>${mbX(d.ten)} · Nhóm 1 ${mbFmt(d.dgRo1 || 0)}/m²</option>`).join('')}</select></div>
    <div class="mb-row" style="align-items:flex-end">
      <div class="mb-field"><div class="mb-label">Diện tích kiểm soát (m²)</div>
        <input id="mb-tyt-dt" class="mb-input" inputmode="decimal" data-in="tytDt" data-onchange="rerender" value="${mbX(dtShow)}" placeholder="Nhập diện tích"/></div>
      <button class="mb-btn-outline" style="height:40px;flex-shrink:0" data-act="tytDtReset" title="Lấy tổng sàn của công trình">↺ Sàn công trình</button>
    </div>
  </div>`;
  if (!o.ks) return form + '<div class="mb-empty" style="padding:24px 0">Nhập diện tích để tính ngân sách Nhóm 1.</div>';

  const ks = o.ks, t = ks.tong;
  const cell = (cls, lb, val, hint) => `<div class="mb-kpi ${cls}" style="padding:10px">
      <div class="mb-kpi-label">${lb}</div><div class="mb-kpi-value" style="font-size:13.5px">${val}</div>
      ${hint ? `<div class="mb-kpi-hint">${hint}</div>` : ''}</div>`;
  const pctTxt = v => v === Infinity ? 'ngoài ĐM' : (Math.round(v * 10) / 10).toString().replace('.', ',') + '%';

  return form + `<div class="mb-grid3">
      ${cell('blue', 'Ngân sách Nhóm 1', mbFmt(t.ns), tytFmtM2(o.dt) + ' m²')}
      ${cell('', 'Thực tế Nhóm 1', mbFmt(t.tt), pctTxt(t.pct))}
      ${cell(t.vuot ? 'red' : 'green', t.vuot ? 'Đã vượt' : 'Còn dư', mbFmt(Math.abs(t.conLai)), ks.soVuot ? ks.soVuot + ' dòng vượt' : 'Chưa vượt')}
    </div>

    ${ks.rows.map(x => {
      const kk   = x.k || 'x';
      const open = !!MB.tytKsOpen[kk];
      const col  = x.vuot ? 'var(--mb-red)' : 'var(--mb-primary)';
      const barW = x.pct === Infinity ? 100 : Math.max(0, Math.min(100, x.pct));
      const con  = Math.abs(x.conLai) < 1000 ? '≈ 0' : (x.vuot ? 'Vượt ' + mbFmt(-x.conLai) : 'Dư ' + mbFmt(x.conLai));
      return `<div class="mb-card mb-card-sm${x.vuot ? ' mb-over' : ''}">
        <div class="mb-acc-head" data-act="tytKsToggle" data-arg="${kk}">
          <div style="flex:1;min-width:0;font-size:13px;font-weight:700">${mbX(x.ten)}${x.k === 'quy' ? ' <span class="mb-tyt-note">mức trần chung</span>' : ''}${x.vuot ? ' <span class="mb-tag red">VƯỢT</span>' : ''}</div>
          <span style="font-size:13px;font-weight:800;color:${col};flex-shrink:0">${pctTxt(x.pct)}</span>
          ${x.loais.length ? `<span class="mb-acc-caret">${open ? '▲' : '▼'}</span>` : ''}
        </div>
        <div class="mb-bar" style="margin:7px 0 6px"><i style="width:${barW}%;background:${col}"></i></div>
        <div style="font-size:11.5px;color:var(--mb-text-2)">Thực tế ${mbFmt(x.tt)} / Ngân sách ${mbFmt(x.ns)} · <b style="color:${x.vuot ? 'var(--mb-red)' : 'inherit'}">${con}</b></div>
        <div class="mb-tyt-note">${r.tongSan > 0 ? mbFull(Math.round(x.tt / r.tongSan)) + '/m² thực tế' : 'Chưa có tổng sàn'} · định mức ${x.dg ? mbFull(x.dg) + '/m²' : '—'}</div>
        ${open ? `<div class="mb-acc-body">${x.loais.map(z => `<div class="mb-tyt-line" style="padding-left:0">
            <div style="flex:1;min-width:0"><div class="mb-tyt-ln-t">${mbX(z.loai)}</div></div>
            <span class="mb-tyt-val">${mbFmt(z.tien)} <span class="mb-tyt-note">· ${mbTytPct(z.tien, x.tt)}</span></span>
          </div>`).join('')}</div>` : ''}
      </div>`;
    }).join('')}

    <div style="font-size:11px;color:var(--mb-muted-2);text-align:center">Tạo / sửa bộ định mức và mức trần Quỹ phụ phí: dùng bản máy tính.</div>`;
}

// ── Tab con 3: SO SÁNH (đ/m² các công trình xây mới có bảng M2) + XU HƯỚNG theo năm ──
function mbTytSoSanh(pCur) {
  const laCT = p => (typeof ctLoaiOf === 'function' ? ctLoaiOf(p) : 'CT') === 'CT';
  const xong = p => p.status === 'closed' || p.status === 'completed';
  let base = mbProjects().filter(laCT);
  if (!MB.tytAllYears) base = base.filter(p => typeof qtCtInYear !== 'function' || qtCtInYear(p.name));
  const coM2 = base.filter(p => tytTongSan(p) > 0);
  mbTytEnsureYears([...new Set(coM2.flatMap(p => tytNamVongDoi(p)))]);
  const list = coM2.filter(p => MB.tytSsXong !== '1' || xong(p));
  const n1   = MB.tytSsChe !== 'all';
  const rows = list.map(p => {
    const r = mbTyt(p);
    return r ? { p, r, v: n1 ? r.cpM2N1 : r.cpM2 } : null;
  }).filter(Boolean).sort((a, b) => b.v - a.v);
  const max = rows.length ? rows[0].v : 1;
  const thieu = base.length - coM2.length;

  // Xu hướng đ/m² Nhóm 1 theo năm công trình (năm hoàn thành; CT đang làm tính năm nay)
  let xhHtml = '';
  if (typeof tytXuHuongM2 === 'function' && list.length) {
    const xh = tytXuHuongM2(list, mbTytOpts());
    const hq = (typeof tytHoiQuy === 'function') ? tytHoiQuy(xh.nams.map(n => ({ x: +n.nam, y: n.m2.n1 }))) : null;
    const namSau = xh.nams.length ? String(+xh.nams[xh.nams.length - 1].nam + 1) : '';
    xhHtml = `<div class="mb-card">
      <div class="mb-sec-head" style="margin-bottom:8px">
        <div class="mb-sec-title">Xu hướng Thô & NC / m² theo năm</div>
      </div>
      <div class="mb-col" style="gap:0">
        ${xh.nams.map((n, i) => {
          const prev = i ? xh.nams[i - 1].m2.n1 : 0;
          const d = prev ? (n.m2.n1 - prev) / prev * 100 : null;
          return `<div class="mb-tyt-line" style="padding-left:0">
            <div style="flex:1;min-width:0"><div class="mb-tyt-ln-t"><b>${n.nam}</b></div>
              <div class="mb-tyt-note">${n.soCT} công trình${n.dangLam ? ' (' + n.dangLam + ' đang làm)' : ''} · ${tytFmtM2(n.san)} m²</div></div>
            <span class="mb-tyt-val">${mbFull(Math.round(n.m2.n1))}${d == null ? '' : `<div style="font-size:10.5px;font-weight:700;color:${d > 0 ? 'var(--mb-red)' : 'var(--mb-green)'}">${d > 0 ? '▲' : '▼'} ${Math.abs(Math.round(d * 10) / 10).toString().replace('.', ',')}%</div>`}</span>
          </div>`;
        }).join('')}
        ${hq ? `<div class="mb-tyt-line" style="padding-left:0;background:var(--mb-amber-l);border-radius:8px;padding:8px">
          <div style="flex:1;min-width:0"><div class="mb-tyt-ln-t"><b>${namSau}</b> <span class="mb-tag amber">ước tính</span></div>
            <div class="mb-tyt-note">Dự báo theo ${hq.n} năm dữ liệu</div></div>
          <span class="mb-tyt-val">≈ ${mbFull(Math.round(hq.du(+namSau)))}</span>
        </div>` : `<div class="mb-tyt-note" style="padding-top:6px">Cần ≥ ${typeof TYT_DB_MIN !== 'undefined' ? TYT_DB_MIN : 3} năm dữ liệu mới dự báo được năm tới.</div>`}
      </div>
    </div>`;
  }

  return `<div class="mb-chips even">
      <div class="mb-chip${n1 ? ' on' : ''}" data-act="setFilter" data-arg="tytSsChe|n1">Thô & NC / m²</div>
      <div class="mb-chip${n1 ? '' : ' on'}" data-act="setFilter" data-arg="tytSsChe|all">Toàn bộ / m²</div>
    </div>
    <div class="mb-chips">
      <div class="mb-chip${MB.tytSsXong === '1' ? ' on' : ''}" data-act="setFilter" data-arg="tytSsXong|${MB.tytSsXong === '1' ? '0' : '1'}">Chỉ công trình đã xong</div>
    </div>
    ${rows.length ? `<div class="mb-list">
      ${rows.map(({ p, r, v }) => {
        const cur = pCur && p.id === pCur.id;
        const [stLabel] = MB_STATUS[p.status] || ['—'];
        return `<div class="mb-list-row tap" style="display:block;cursor:pointer${cur ? ';background:var(--mb-amber-l)' : ''}" data-act="tytOpenCt" data-arg="${mbX(p.id)}">
          <div class="mb-row-between" style="margin-bottom:5px">
            <span style="font-size:13px;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${mbX(p.name)}${cur ? ' <span class="mb-tag amber">đang xem</span>' : ''}</span>
            <span style="font-size:13px;font-weight:800;flex-shrink:0">${mbFull(Math.round(v))}</span>
          </div>
          <div class="mb-bar thin"><i style="width:${mbBarW(v, max)};background:${n1 ? 'var(--mb-primary)' : 'var(--mb-purple)'}"></i></div>
          <div class="mb-tyt-note" style="margin-top:4px">${tytFmtM2(r.tongSan)} m² · tổng ${mbFmt(n1 ? r.theoNhom[1] : r.tongChi)} · ${mbX(stLabel)}</div>
        </div>`;
      }).join('')}
    </div>` : '<div class="mb-empty">Chưa có công trình xây mới nào có bảng M2' + (MB.tytSsXong === '1' ? ' (đã xong)' : '') + '.</div>'}
    ${thieu > 0 ? `<div style="font-size:11px;color:var(--mb-muted-2)">${thieu} công trình xây mới chưa có bảng M2 nên chưa so sánh được.</div>` : ''}
    ${xhHtml}
    <div style="font-size:11px;color:var(--mb-muted-2);text-align:center">Bảng so sánh theo từng loại chi phí, xuất Excel và biến động giá vật tư: dùng bản máy tính.</div>`;
}

// ══════════════════════════════════════════════════════════════
//  13 · THÊM (menu)
// ══════════════════════════════════════════════════════════════
function mbScrMore() {
  const u    = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const name = u ? (u.username || 'Người dùng') : 'Khách';
  const role = mbRole();
  const roleLabel = role === 'admin' ? 'Quản trị viên' : role === 'giamdoc' ? 'Giám đốc' : role === 'ketoan' ? 'Kế toán' : '—';
  const pending = mbPending();

  // (27/10/2026) Rút gọn: bỏ Quyết toán / Danh mục / Thùng rác (làm trên máy tính).
  // (31/10/2026) Quyết toán / Tỉ trọng / Danh mục quay lại ở nhóm "Quản lý & Phân tích" bên dưới.
  // [màn hình, nhãn, gợi ý, icon Material Symbols, nền, màu icon]
  const rows = [
    ['dashboard', 'Tổng Quan',            'Dashboard chi phí ' + mbYearLabel(), 'analytics',              '#EFF6FF', '#2563EB'],
    ['doanhthu',  'Thu Tiền & Lợi Nhuận', 'Thu tiền · Tiến độ thu · Lợi nhuận', 'account_balance_wallet', '#F0FDF4', '#16A34A'],
    ['congno',    'Công Nợ Đối Tác',      'Thầu phụ & Nhà cung cấp · Tất toán', 'request_quote',          '#FEF2F2', '#DC2626'],
    ['thietbi',   'Thiết Bị & Kho',       'Kho tổng & tại công trình',          'handyman',               '#FFFBEB', '#D97706'],
    ['thongke',   'Cơ Cấu Chi Phí',       'Chi phí theo loại · từng công trình', 'pie_chart',             '#F5F3FF', '#7C3AED'],
  ].filter(r => mbCanSee(r[0]));

  // (31/10/2026) Nhóm "Quản lý & Phân tích": Quyết toán (ẩn với Kế toán) · Tỉ trọng · Danh mục
  const nChuaQt = mbCanSee('quyettoan') && typeof _qtRecordOfCt === 'function'
    ? mbProjects().filter(p => p.status === 'completed' && !_qtRecordOfCt(p.id).rec).length : 0;
  const mgmt = [
    ['quyettoan', 'Quyết Toán Công Trình', nChuaQt ? nChuaQt + ' công trình đã xong chưa quyết toán' : 'Chốt doanh thu với Chủ đầu tư', 'fact_check',        '#ECFDF5', '#059669'],
    ['tytrong',   'Tỉ Trọng & Định Mức',   'Đơn giá đ/m² · 4 nhóm chi phí · định mức',                                            'stacked_bar_chart', '#F5F3FF', '#7C3AED'],
    ['danhmuc',   'Danh Mục',              'Loại chi phí · Nhà cung cấp · Thầu phụ · Công nhân',                                    'folder_managed',    '#F3F4F6', '#4B5563'],
  ].filter(r => mbCanSee(r[0]));

  const sys = [
    ['sync',       'Đồng bộ Firebase', pending > 0 ? pending + ' thay đổi chờ đẩy lên' : 'Đã đồng bộ', 'sync',            '#EFF6FF', '#2563EB'],
    ['useDesktop', 'Mở bản máy tính',  'Dùng giao diện đầy đủ trên máy này',                          'desktop_windows', '#F3F4F6', '#4B5563'],
  ];

  const rowHtml = ([act, label, hint, icon, bg, fg], isNav) =>
    `<div class="mb-list-row" style="cursor:pointer" data-act="${isNav ? 'go' : act}" ${isNav ? `data-arg="${act}"` : ''}>
       <div style="width:34px;height:34px;border-radius:10px;background:${bg};color:${fg};display:flex;align-items:center;justify-content:center;flex-shrink:0">${mbIcon(icon, 20)}</div>
       <div style="flex:1;min-width:0">
         <div style="font-size:13.5px;font-weight:600">${mbX(label)}</div>
         <div style="font-size:11px;color:var(--mb-muted-2)">${mbX(hint)}</div>
       </div>
       <svg width="7" height="12" viewBox="0 0 8 13" style="flex-shrink:0"><path d="M1 1l6 5.5L1 12" stroke="#D1D5DB" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
     </div>`;

  return `<div class="mb-pad" style="gap:14px">
    <div class="mb-card" style="display:flex;align-items:center;gap:12px">
      <div style="width:44px;height:44px;border-radius:22px;background:var(--mb-primary);color:#fff;font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0">${mbX(name.slice(0, 2).toUpperCase())}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:700">${mbX(name)}</div>
        <div style="font-size:11.5px;color:var(--mb-muted)">${roleLabel} · ${pending > 0 ? 'còn ' + pending + ' thay đổi' : 'đã đồng bộ'}</div>
      </div>
      <div style="font-size:12px;font-weight:700;color:var(--mb-red);cursor:pointer;flex-shrink:0" data-act="logout">Đăng xuất</div>
    </div>

    <div>
      <div style="font-size:12px;font-weight:700;color:var(--mb-muted);margin-bottom:9px;letter-spacing:0.3px">NGHIỆP VỤ</div>
      <div class="mb-list">${rows.map(r => rowHtml(r, true)).join('')}</div>
    </div>

    <div>
      <div style="font-size:12px;font-weight:700;color:var(--mb-muted);margin-bottom:9px;letter-spacing:0.3px">QUẢN LÝ & PHÂN TÍCH</div>
      <div class="mb-list">${mgmt.map(r => rowHtml(r, true)).join('')}</div>
    </div>

    <div>
      <div style="font-size:12px;font-weight:700;color:var(--mb-muted);margin-bottom:9px;letter-spacing:0.3px">HỆ THỐNG</div>
      <div class="mb-list">${sys.map(r => rowHtml(r, false)).join('')}</div>
    </div>
  </div>`;
}

// ── Icon kính lúp dùng chung cho ô tìm kiếm ──
function mbSearchIcon() {
  return `<svg width="15" height="15" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5.2" fill="none" stroke="#9CA3AF" stroke-width="1.6"/><line x1="10.8" y1="10.8" x2="14.5" y2="14.5" stroke="#9CA3AF" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}
