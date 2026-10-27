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
  // Kế toán: ẩn doanh thu / lãi lỗ / đơn giá + không đổi trạng thái (khớp phân quyền bản desktop)
  const isKt = mbRole() === 'ketoan';
  const lai  = st.thu - st.chi;
  const days = (typeof getProjectDays === 'function') ? getProjectDays(p) : 0;
  const k    = (typeof getProjectK === 'function') ? getProjectK(p) : 1;
  const pct  = mbPct(st.chi, st.hd);

  // Chỉ số Tỉ trọng 3.0 (diện tích sàn + 4 nhóm chi phí) — trọn vòng đời công trình
  let tyt = null;
  if (!isKt && typeof tytTongHop === 'function') {
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
    ['Tổng diện tích sàn quy đổi',          m2(tyt.tongSan) + ' m²',         'var(--mb-purple)', true],
    ['Đơn giá Phần thô & Nhân công / m²',   mbFull(tyt.cpM2N1 || 0) + '/m²', 'var(--mb-purple)', true],
    ['Đơn giá Toàn bộ công trình / m²',     mbFull(tyt.cpM2 || 0) + '/m²',   'var(--mb-purple)', true],
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
  const NHOM_COLOR = { 1: 'var(--mb-primary)', 2: 'var(--mb-green)', 3: 'var(--mb-amber)', 4: 'var(--mb-purple)', 0: 'var(--mb-muted-2)' };

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
    return { ...m, adj, gross, net: gross + adj, debt };
  }).sort((a, b) => b.net - a.net);
  return { from, to, rows };
}

/** Đoạn văn bản phiếu lương 1 công nhân — dán thẳng vào Zalo */
function mbCcPayslipText(r, from, to) {
  const wl  = (typeof weekLabel === 'function') ? weekLabel(from) : (mbDate(from) + ' – ' + mbDate(to));
  const r1  = v => Math.round(v * 10) / 10;
  const L   = [
    'PHIẾU LƯƠNG TUẦN ' + wl,
    'Công nhân: ' + r.name,
    '────────────',
    ...r.cts.map(c => '• ' + c.ct + ': ' + r1(c.congs) + ' công × ' + mbFull(c.luong)),
    'Lương chính: ' + mbFull(r.luong),
  ];
  if (r.pc)   L.push('Phụ cấp: ' + mbFull(r.pc));
  if (r.hdml) L.push('Mua vật tư lẻ: ' + mbFull(r.hdml));
  if (r.adj)  L.push('Cấn trừ ứng công nhân: ' + (r.adj > 0 ? '+' : '−') + mbFull(Math.abs(r.adj)));
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
        ${r.adj ? line('Cấn trừ ứng công nhân', (r.adj > 0 ? '+ ' : '− ') + mbFull(Math.abs(r.adj)), 'var(--mb-amber)') : ''}
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
//  13 · THÊM (menu)
// ══════════════════════════════════════════════════════════════
function mbScrMore() {
  const u    = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const name = u ? (u.username || 'Người dùng') : 'Khách';
  const role = mbRole();
  const roleLabel = role === 'admin' ? 'Quản trị viên' : role === 'giamdoc' ? 'Giám đốc' : role === 'ketoan' ? 'Kế toán' : '—';
  const pending = mbPending();

  // (27/10/2026) Rút gọn: bỏ Quyết toán / Danh mục / Thùng rác (làm trên máy tính).
  // [màn hình, nhãn, gợi ý, icon Material Symbols, nền, màu icon]
  const rows = [
    ['dashboard', 'Tổng Quan',            'Dashboard chi phí ' + mbYearLabel(), 'analytics',              '#EFF6FF', '#2563EB'],
    ['doanhthu',  'Thu Tiền & Lợi Nhuận', 'Thu tiền · Tiến độ thu · Lợi nhuận', 'account_balance_wallet', '#F0FDF4', '#16A34A'],
    ['congno',    'Công Nợ Đối Tác',      'Thầu phụ & Nhà cung cấp · Tất toán', 'request_quote',          '#FEF2F2', '#DC2626'],
    ['thietbi',   'Thiết Bị & Kho',       'Kho tổng & tại công trình',          'handyman',               '#FFFBEB', '#D97706'],
    ['thongke',   'Cơ Cấu Chi Phí',       'Chi phí theo loại · từng công trình', 'pie_chart',             '#F5F3FF', '#7C3AED'],
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
      <div style="font-size:12px;font-weight:700;color:var(--mb-muted);margin-bottom:9px;letter-spacing:0.3px">HỆ THỐNG</div>
      <div class="mb-list">${sys.map(r => rowHtml(r, false)).join('')}</div>
    </div>
  </div>`;
}

// ── Icon kính lúp dùng chung cho ô tìm kiếm ──
function mbSearchIcon() {
  return `<svg width="15" height="15" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5.2" fill="none" stroke="#9CA3AF" stroke-width="1.6"/><line x1="10.8" y1="10.8" x2="14.5" y2="14.5" stroke="#9CA3AF" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}
