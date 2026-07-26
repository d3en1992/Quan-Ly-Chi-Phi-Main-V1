// ══════════════════════════════════════════════════════════════
// mobile.screens.js — Hàm render từng màn hình của giao diện điện thoại
// Load order: sau mobile.core.js, trước mobile.actions.js
//
// QUY TẮC:
//   - File này CHỈ ĐỌC dữ liệu, không ghi. Mọi hành động ghi nằm ở mobile.actions.js.
//   - Số liệu phải trùng khít với bản desktop → luôn dùng lại helper sẵn có:
//       getInvoicesCached() · inActiveYear() · _buildInvoiceMap() ·
//       _ctGetCostsFromMap() · _ctTongChi() · _hdLookup() · _cnBuildRows() ·
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
 * @returns {{ hd, chi, thu, invs, hoaDon, ungTp, ungNcc }}
 *   hd     — tổng giá trị hợp đồng chính (giaTri + giaTriphu + phatSinh)
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

  return { hd, chi: tc.tongChi, thu, invs: c.invs, hoaDon: c.total, ungTp: tc.ungTp, ungNcc: tc.ungNcc };
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
// Các danh mục sửa được trên mobile. Khóa PHẢI trùng `catId` của bản desktop
// (xem CATS trong core.cloud-cats-ui.js) vì mobile gọi thẳng addItem()/delItem().
// `congTrinh` cố ý không có ở đây — công trình chỉ tạo/sửa ở tab Công Trình.
const MB_DM_LABELS   = { loaiChiPhi: 'Loại chi phí', nhaCungCap: 'Nhà cung cấp', nguoiTH: 'Người chi', thauPhu: 'Thầu phụ', congNhan: 'Công nhân', tbTen: 'Tên thiết bị' };

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
    case 'danhmuc':   return mbScrDanhMuc();
    case 'thongke':   return mbScrThongKe();
    case 'thungrac':  return mbScrThungRac();
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

  let totHd = 0, totThu = 0;
  const rows = P.map(p => {
    const st = mbProjStats(p, invMap);
    totHd  += st.hd;
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
    { cls: '',      label: 'Giá trị hợp đồng',   value: mbFmt(totHd),           hint: P.length + ' công trình' },
    { cls: 'green', label: 'Đã thu',             value: mbFmt(totThu),          hint: mbPct(totThu, totHd) + '% hợp đồng' },
    { cls: 'blue',  label: 'Lợi nhuận tạm tính', value: mbFmtSigned(totThu - totChi), hint: 'Đã thu − chi phí' },
  ];

  return `<div class="mb-pad" style="gap:14px">
    <div class="mb-grid2">
      ${kpis.map(k => `<div class="mb-kpi ${k.cls}">
        <div class="mb-kpi-label">${k.label}</div>
        <div class="mb-kpi-value">${mbX(k.value)}</div>
        <div class="mb-kpi-hint">${mbX(k.hint)}</div>
      </div>`).join('')}
    </div>

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

  const list = mbProjects()
    .filter(p => MB.statusFilter === 'all' || p.status === MB.statusFilter)
    .filter(p => ((p.name || '') + ' ' + (p.chuDauTu || '')).toLowerCase().includes(q));

  const chips = [['all', 'Tất cả'], ['active', 'Đang thi công'], ['completed', 'Hoàn thành'],
                 ['planning', 'Kế hoạch'], ['closed', 'Đã quyết toán']];

  return `<div class="mb-pad">
    <div class="mb-search">
      ${mbSearchIcon()}
      <input id="mb-in-search" data-in="search" data-live="1" value="${mbX(MB.search)}" placeholder="Tìm công trình, chủ đầu tư..."/>
    </div>

    <div class="mb-chips">
      ${chips.map(([k, l]) => `<div class="mb-chip${MB.statusFilter === k ? ' on' : ''}" data-act="setFilter" data-arg="statusFilter|${k}">${l}</div>`).join('')}
    </div>

    <div class="mb-col" style="gap:10px">
      ${list.length ? list.map(p => {
        const st  = mbProjStats(p, invMap);
        const lai = st.thu - st.chi;
        const pct = mbPct(st.chi, st.hd);
        const [stLabel, stCls] = MB_STATUS[p.status] || ['—', 'gray'];
        const days = (typeof getProjectDays === 'function') ? getProjectDays(p) : 0;
        const type = p.type === 'CT' ? 'Công trình' : p.type === 'SC' ? 'Sửa chữa' : 'Khác';
        return `<div class="mb-card tap" data-act="openProject" data-arg="${mbX(p.id)}">
          <div class="mb-row-between" style="margin-bottom:5px">
            <div style="font-size:14.5px;font-weight:700;line-height:1.25">${mbX(p.name)}</div>
            <span class="mb-tag ${stCls}">${stLabel}</span>
          </div>
          <div style="font-size:11.5px;color:var(--mb-muted);margin-bottom:11px">${mbX(p.chuDauTu || 'Chưa có CĐT')} · ${type} · ${days} ngày</div>
          <div class="mb-grid3" style="margin-bottom:10px">
            <div><div style="font-size:10px;color:var(--mb-muted-2);margin-bottom:2px">HĐ</div><div style="font-size:12px;font-weight:700">${mbFmt(st.hd)}</div></div>
            <div><div style="font-size:10px;color:var(--mb-muted-2);margin-bottom:2px">Chi</div><div style="font-size:12px;font-weight:700">${mbFmt(st.chi)}</div></div>
            <div><div style="font-size:10px;color:var(--mb-muted-2);margin-bottom:2px">Lãi/Lỗ</div><div style="font-size:12px;font-weight:800;color:${lai >= 0 ? 'var(--mb-green)' : 'var(--mb-red)'}">${mbFmtSigned(lai)}</div></div>
          </div>
          <div class="mb-bar"><i style="width:${mbBarW(st.chi, st.hd)};background:${pct > 100 ? 'var(--mb-red)' : pct > 85 ? 'var(--mb-amber)' : 'var(--mb-primary)'}"></i></div>
          <div class="mb-row-between" style="margin-top:5px;font-size:10.5px;color:var(--mb-muted-2)">
            <span>Chi / HĐ</span><span style="font-weight:700;color:var(--mb-text-2)">${pct}%</span>
          </div>
        </div>`;
      }).join('') : '<div class="mb-empty">Không có công trình phù hợp</div>'}
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  3 · CHI TIẾT CÔNG TRÌNH
// ══════════════════════════════════════════════════════════════
function mbScrProjectDetail() {
  const p = mbProject(MB.projectId);
  if (!p) return `<div class="mb-pad"><div class="mb-empty">Không tìm thấy công trình</div></div>`;

  const seg = MB.seg.detail;
  const st  = mbProjStats(p, mbInvMap());

  if (seg === 'chi')  return mbPdChiPhi(p, st);
  if (seg === 'cc')   return mbPdChamCong(p);
  if (seg === 'ung')  return mbPdTienUng(p);

  // ── Tổng quan ──
  const lai  = st.thu - st.chi;
  const days = (typeof getProjectDays === 'function') ? getProjectDays(p) : 0;
  const k    = (typeof getProjectK === 'function') ? getProjectK(p) : 1;
  const [stLabel] = MB_STATUS[p.status] || ['—', 'gray'];
  const pct  = mbPct(st.chi, st.hd);

  const rows = [
    ['Trạng thái',        stLabel,                 ''],
    ['Giá trị hợp đồng',  mbFull(st.hd),           ''],
    ['Tổng chi phí',      mbFull(st.chi),          ''],
    ['— trong đó hóa đơn', mbFull(st.hoaDon),      'var(--mb-muted)'],
    ['— ứng thầu phụ',    mbFull(st.ungTp),        'var(--mb-muted)'],
    ['Đã thu',            mbFull(st.thu),          'var(--mb-green)'],
    ['Lãi/lỗ tạm tính',   mbFull(lai),             lai >= 0 ? 'var(--mb-green)' : 'var(--mb-red)'],
    ['Số ngày thi công',  days + ' ngày · k=' + k, ''],
  ];

  const shortcuts = [
    ['Nhập chi phí',   'Thêm hóa đơn cho CT này', 'shortcut', 'nhap'],
    ['Chấm công tuần', 'Sổ công nhân',            'shortcut', 'chamcong'],
    ['Tạm ứng',        'Thầu phụ / NCC / CN',     'shortcut', 'tienung'],
    ['Thu tiền',       'Ghi nhận thu HĐ',         'shortcut', 'thu'],
  ];

  return `<div class="mb-pad">
    <div class="mb-list">
      ${rows.map(([l, v, c]) => `<div class="mb-list-row" style="justify-content:space-between">
        <span style="font-size:12.5px;color:var(--mb-muted)">${mbX(l)}</span>
        <span style="font-size:13px;font-weight:700;text-align:right;color:${c || 'var(--mb-text)'}">${mbX(v)}</span>
      </div>`).join('')}
    </div>

    <div class="mb-kpi blue" style="border-radius:14px;padding:14px">
      <div class="mb-row-between" style="margin-bottom:9px">
        <span style="font-size:12.5px;font-weight:600;color:var(--mb-primary-d)">Tỉ lệ chi phí / hợp đồng</span>
        <span style="font-size:13px;font-weight:800;color:var(--mb-primary-d)">${pct}%</span>
      </div>
      <div class="mb-bar" style="height:8px;background:#DBEAFE"><i style="width:${mbBarW(st.chi, st.hd)};background:var(--mb-primary)"></i></div>
    </div>

    <div class="mb-grid2">
      ${shortcuts.map(([l, h, act, arg]) => `<div class="mb-card mb-card-sm tap" data-act="${act}" data-arg="${arg}">
        <div style="font-size:12.5px;font-weight:700;margin-bottom:3px">${mbX(l)}</div>
        <div style="font-size:11px;color:var(--mb-muted)">${mbX(h)}</div>
      </div>`).join('')}
    </div>
  </div>`;
}

function mbPdChiPhi(p, st) {
  const list = [...st.invs].sort((a, b) => (b.ngay || '').localeCompare(a.ngay || ''));
  return `<div class="mb-pad">
    ${list.length ? list.map(i => `<div class="mb-card mb-card-sm">
      <div class="mb-row-between" style="margin-bottom:4px">
        <span style="font-size:13px;font-weight:700">${mbX(i.nd || '(không có nội dung)')}</span>
        <span style="font-size:13px;font-weight:800;flex-shrink:0">${mbFmt(mbInvAmount(i))}</span>
      </div>
      <div style="font-size:11px;color:var(--mb-muted-2)">${mbX(i.loai || '—')} · ${mbX(i.ncc || '—')} · ${mbDate(i.ngay)}</div>
    </div>`).join('') : '<div class="mb-empty">Chưa có hóa đơn trong năm này</div>'}
    <div class="mb-card mb-card-sm" style="background:#F9FAFB;display:flex;justify-content:space-between">
      <span style="font-size:12.5px;font-weight:700;color:#374151">Tổng chi phí hóa đơn</span>
      <span style="font-size:13.5px;font-weight:800">${mbFull(st.hoaDon)}</span>
    </div>
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
    acc.tong  += congs * (k.luong || 0) + (k.phucap || 0);
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
 * Tiền ứng của một công trình — CHỈ thầu phụ và nhà cung cấp.
 * Phiếu ứng công nhân là sổ nợ riêng theo người (không gắn với chi phí công
 * trình), xem tại tab Chấm công → "Ứng CN".
 */
function mbPdTienUng(p) {
  const list = (typeof ungRecords !== 'undefined' ? ungRecords : [])
    .filter(u => !u.deletedAt && u.loai !== 'congnhan' && inActiveYear(u.ngay) && mbBelongs(u, p))
    .sort((a, b) => (b.ngay || '').localeCompare(a.ngay || ''));
  const total = list.reduce((s, u) => s + (u.tien || 0), 0);

  return `<div class="mb-pad">
    ${list.length ? list.map(u => `<div class="mb-card mb-card-sm">
      <div class="mb-row-between" style="margin-bottom:4px">
        <span style="font-size:13px;font-weight:700">${mbX(u.tp || '—')}</span>
        <span style="font-size:13px;font-weight:800;color:var(--mb-amber);flex-shrink:0">${mbFmt(u.tien)}</span>
      </div>
      <div style="font-size:11px;color:var(--mb-muted-2)">${mbX(MB_UNG_LABEL[u.loai] || u.loai || '—')} · ${mbX(u.nd || '—')} · ${mbDate(u.ngay)}</div>
    </div>`).join('') : '<div class="mb-empty">Chưa có phiếu ứng</div>'}
    <div class="mb-card mb-card-sm" style="background:#F9FAFB;display:flex;justify-content:space-between">
      <span style="font-size:12.5px;font-weight:700;color:#374151">Tổng đã ứng</span>
      <span style="font-size:13.5px;font-weight:800">${mbFull(total)}</span>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  4 · NHẬP HÓA ĐƠN
// ══════════════════════════════════════════════════════════════
function mbScrNhap() {
  if (MB.seg.nhap === 'chitiet') return mbNhapChiTiet();
  if (MB.seg.nhap === 'tatca')   return mbNhapTatCa();
  return mbNhapNhanh();
}

function mbNhapNhanh() {
  const f  = MB.form;
  const tt = (parseFloat(String(f.sl).replace(',', '.')) || 0) * (typeof parseMoney === 'function' ? parseMoney(f.tien) : 0);
  const draftTotal = MB.drafts.reduce((s, d) => s + d.sl * d.tien, 0);

  return `<div class="mb-pad">
    <div class="mb-card" style="display:flex;flex-direction:column;gap:11px">
      <div class="mb-sec-title">Dòng hóa đơn mới</div>

      <div class="mb-row">
        <div class="mb-field"><div class="mb-label">Ngày</div>
          <input id="mb-f-ngay" class="mb-input" type="date" data-in="form.ngay" value="${mbX(f.ngay)}"/></div>
        <div class="mb-field"><div class="mb-label">Loại chi phí</div>
          <select id="mb-f-loai" class="mb-select" data-in="form.loai">${mbOptions(cats.loaiChiPhi, f.loai)}</select></div>
      </div>

      <div><div class="mb-label">Công trình</div>
        <select id="mb-f-ct" class="mb-select" data-in="form.ct">${mbCtOptions(f.ct, true)}</select></div>

      <div class="mb-row">
        <div class="mb-field"><div class="mb-label">Nhà cung cấp</div>
          <input id="mb-f-ncc" class="mb-input" list="mb-dl-ncc" data-in="form.ncc" value="${mbX(f.ncc)}" placeholder="VD: Vật Tư Hòa Phát"/>
          <datalist id="mb-dl-ncc">${(cats.nhaCungCap || []).map(v => `<option value="${mbX(v)}">`).join('')}</datalist></div>
        <div class="mb-field"><div class="mb-label">Người chi</div>
          <input id="mb-f-nguoi" class="mb-input" list="mb-dl-nguoi" data-in="form.nguoi" value="${mbX(f.nguoi)}" placeholder="VD: A Long"/>
          <datalist id="mb-dl-nguoi">${(cats.nguoiTH || []).map(v => `<option value="${mbX(v)}">`).join('')}</datalist></div>
      </div>

      <div><div class="mb-label">Nội dung</div>
        <input id="mb-f-nd" class="mb-input" data-in="form.nd" value="${mbX(f.nd)}" placeholder="VD: Thép hộp 40x80"/></div>

      <div class="mb-row">
        <div class="mb-field"><div class="mb-label">Số lượng</div>
          <input id="mb-f-sl" class="mb-input" inputmode="decimal" data-in="form.sl" data-live="1" value="${mbX(f.sl)}" placeholder="0"/></div>
        <div class="mb-field" style="flex:1.4"><div class="mb-label">Đơn giá (đ)</div>
          <input id="mb-f-tien" class="mb-input" inputmode="numeric" data-in="form.tien" data-live="1" value="${mbX(f.tien)}" placeholder="0"/></div>
      </div>

      <div style="background:#F9FAFB;border-radius:10px;padding:11px 12px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:12.5px;color:var(--mb-muted)">Thành tiền</span>
        <span style="font-size:15px;font-weight:800">${mbFull(tt)}</span>
      </div>

      <div style="display:flex;gap:9px">
        <button class="mb-btn gray" style="flex:1" data-act="clearForm">Xóa</button>
        <button class="mb-btn" style="flex:1.6" data-act="addDraft">+ Thêm vào danh sách</button>
      </div>
    </div>

    <div>
      <div class="mb-sec-head">
        <div class="mb-sec-title">Chờ lưu (${MB.drafts.length})</div>
        <div style="font-size:12px;font-weight:700">${mbFull(draftTotal)}</div>
      </div>
      <div class="mb-col">
        ${MB.drafts.length ? MB.drafts.map((d, idx) => `
          <div class="mb-card mb-card-sm" style="display:flex;gap:10px;align-items:center;padding:11px 12px">
            <div style="flex:1;min-width:0">
              <div style="font-size:12.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${mbX(d.nd)}</div>
              <div style="font-size:10.5px;color:var(--mb-muted-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${mbX(d.ct || '—')} · ${d.sl} × ${mbFmt(d.tien)}</div>
            </div>
            <div style="font-size:12.5px;font-weight:800;flex-shrink:0">${mbFmt(d.sl * d.tien)}</div>
            <button class="mb-del" data-act="delDraft" data-arg="${idx}">×</button>
          </div>`).join('')
        : '<div style="text-align:center;color:var(--mb-muted-2);font-size:12.5px;padding:22px 0;background:#fff;border:1px dashed var(--mb-line);border-radius:12px">Chưa có dòng nào chờ lưu</div>'}
      </div>
    </div>

    <button class="mb-btn lg ${MB.drafts.length ? 'green' : 'muted'}" data-act="saveDrafts">Lưu tất cả (${MB.drafts.length})</button>
  </div>`;
}

function mbNhapChiTiet() {
  const f     = MB.detailForm;
  const it    = MB.itemForm;
  const total = MB.detailItems.reduce((s, r) => s + r.sl * r.dg, 0);

  return `<div class="mb-pad">
    <div class="mb-card" style="display:flex;flex-direction:column;gap:11px">
      <div class="mb-sec-title">Hóa đơn chi tiết nhiều dòng</div>
      <div style="font-size:11.5px;color:var(--mb-muted);line-height:1.5">Nhập 1 hóa đơn gồm nhiều vật tư. Nội dung tổng hợp tự sinh từ tên các vật tư (giống bản web).</div>

      <div class="mb-row">
        <div class="mb-field"><div class="mb-label">Ngày</div>
          <input id="mb-d-ngay" class="mb-input" type="date" data-in="detailForm.ngay" value="${mbX(f.ngay)}"/></div>
        <div class="mb-field"><div class="mb-label">Loại chi phí</div>
          <select id="mb-d-loai" class="mb-select" data-in="detailForm.loai">${mbOptions(cats.loaiChiPhi, f.loai)}</select></div>
      </div>
      <div><div class="mb-label">Công trình</div>
        <select id="mb-d-ct" class="mb-select" data-in="detailForm.ct">${mbCtOptions(f.ct, true)}</select></div>
      <div class="mb-row">
        <div class="mb-field"><div class="mb-label">Nhà cung cấp</div>
          <input id="mb-d-ncc" class="mb-input" data-in="detailForm.ncc" value="${mbX(f.ncc)}" placeholder="VD: Vật Tư Hòa Phát"/></div>
        <div class="mb-field"><div class="mb-label">Người chi</div>
          <input id="mb-d-nguoi" class="mb-input" data-in="detailForm.nguoi" value="${mbX(f.nguoi)}" placeholder="VD: A Long"/></div>
      </div>
    </div>

    <div class="mb-card" style="display:flex;flex-direction:column;gap:11px">
      <div class="mb-sec-title">Dòng vật tư</div>
      <div class="mb-col">
        ${MB.detailItems.map((r, idx) => `
          <div style="border:1px solid var(--mb-line);border-radius:11px;padding:11px 12px;display:flex;gap:10px;align-items:center">
            <div style="width:22px;height:22px;border-radius:11px;background:var(--mb-primary-l);color:var(--mb-primary);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${idx + 1}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${mbX(r.ten)}</div>
              <div style="font-size:10.5px;color:var(--mb-muted-2)">${r.sl} ${mbX(r.dvt || '')} × ${mbFmt(r.dg)}</div>
            </div>
            <div style="font-size:12.5px;font-weight:800;flex-shrink:0">${mbFmt(r.sl * r.dg)}</div>
            <button class="mb-del" data-act="delItem" data-arg="${idx}">×</button>
          </div>`).join('')}
        ${MB.detailItems.length ? '' : '<div style="text-align:center;color:var(--mb-muted-2);font-size:12.5px;padding:18px 0;border:1px dashed var(--mb-line);border-radius:11px">Chưa có dòng vật tư</div>'}
      </div>

      <div class="mb-row">
        <div class="mb-field" style="flex:2"><div class="mb-label">Tên vật tư</div>
          <input id="mb-i-ten" class="mb-input" data-in="itemForm.ten" value="${mbX(it.ten)}" placeholder="VD: Thép hộp 40x80"/></div>
        <div class="mb-field" style="flex:1"><div class="mb-label">ĐVT</div>
          <input id="mb-i-dvt" class="mb-input" data-in="itemForm.dvt" value="${mbX(it.dvt)}" placeholder="kg"/></div>
      </div>
      <div class="mb-row">
        <div class="mb-field"><div class="mb-label">Số lượng</div>
          <input id="mb-i-sl" class="mb-input" inputmode="decimal" data-in="itemForm.sl" value="${mbX(it.sl)}" placeholder="0"/></div>
        <div class="mb-field" style="flex:1.4"><div class="mb-label">Đơn giá (đ)</div>
          <input id="mb-i-dg" class="mb-input" inputmode="numeric" data-in="itemForm.dg" value="${mbX(it.dg)}" placeholder="0"/></div>
      </div>
      <button class="mb-btn dashed" data-act="addItem">+ Thêm dòng vật tư</button>

      <div style="background:#F9FAFB;border-radius:10px;padding:11px 12px;display:flex;justify-content:space-between">
        <span style="font-size:12.5px;color:var(--mb-muted)">Tổng hóa đơn</span>
        <span style="font-size:15px;font-weight:800">${mbFull(total)}</span>
      </div>
      <button class="mb-btn" data-act="saveDetailInvoice">Lưu hóa đơn chi tiết</button>
    </div>
  </div>`;
}

function mbNhapTatCa() {
  const q = (MB.invSearch || '').toLowerCase();
  const list = mbInvoices()
    .filter(i => ((i.nd || '') + ' ' + (i.ncc || '') + ' ' + (i.congtrinh || '')).toLowerCase().includes(q))
    .sort((a, b) => (b.ngay || '').localeCompare(a.ngay || ''))
    .slice(0, 200);
  const total = list.reduce((s, i) => s + mbInvAmount(i), 0);
  const srcLabel = s => s === 'detail' ? 'HĐ chi tiết' : s === 'cc' ? 'Từ chấm công' : 'Nhập nhanh';

  return `<div class="mb-pad">
    <div class="mb-search">
      ${mbSearchIcon()}
      <input id="mb-in-invsearch" data-in="invSearch" data-live="1" value="${mbX(MB.invSearch)}" placeholder="Tìm nội dung, NCC, công trình..."/>
    </div>
    <div class="mb-row-between" style="align-items:baseline">
      <div style="font-size:12.5px;color:var(--mb-muted)">${list.length} hóa đơn${list.length >= 200 ? ' (200 mới nhất)' : ''}</div>
      <div style="font-size:13px;font-weight:800">${mbFull(total)}</div>
    </div>
    <div class="mb-col">
      ${list.length ? list.map(i => `<div class="mb-card mb-card-sm">
        <div class="mb-row-between" style="margin-bottom:4px">
          <span style="font-size:13px;font-weight:700">${mbX(i.nd || '(không có nội dung)')}</span>
          <span style="font-size:13px;font-weight:800;flex-shrink:0">${mbFmt(mbInvAmount(i))}</span>
        </div>
        <div style="font-size:11px;color:var(--mb-muted-2);margin-bottom:6px">${mbX(i.congtrinh || '—')} · ${mbDate(i.ngay)}</div>
        <div style="display:flex;gap:6px">
          <span class="mb-tag blue" style="background:var(--mb-primary-l);color:var(--mb-primary)">${mbX(i.loai || '—')}</span>
          <span class="mb-tag gray">${srcLabel(i.source)}</span>
        </div>
      </div>`).join('') : '<div class="mb-empty">Không có hóa đơn phù hợp</div>'}
    </div>
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
}

function mbScrChamCong() {
  if (MB.seg.chamcong === 'baocao') return mbCcBaoCao();
  if (MB.seg.chamcong === 'ung')    return mbCcUng();
  return mbCcSo();
}

function mbCcSo() {
  mbCcEnsureDraft();
  const from = mbCcSunday(), to = mbCcSaturday();
  const dayLabels = (typeof CC_DAY_LABELS !== 'undefined') ? CC_DAY_LABELS : ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const workers = MB.ccWorkers || [];

  const congsOf = w => (w.d || []).reduce((s, v) => s + (v || 0), 0);
  const grossOf = w => congsOf(w) * (w.luong || 0) + (w.phucap || 0);
  const adjOf   = w => (typeof ccThucLanhLedgerAdj === 'function') ? ccThucLanhLedgerAdj(w.name, from, to) : 0;

  const totCongs = workers.reduce((s, w) => s + congsOf(w), 0);
  const totGross = workers.reduce((s, w) => s + grossOf(w), 0);
  const totAdj   = workers.reduce((s, w) => s + adjOf(w), 0);

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

    <div class="mb-col" style="gap:10px">
      ${workers.map((w, wi) => {
        const congs = congsOf(w);
        const net   = grossOf(w) + adjOf(w);
        const role  = (typeof cnRoles !== 'undefined' && cnRoles[w.name]) || 'Công nhân';
        return `<div class="mb-card" style="padding:13px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px">
            <div style="flex:1;min-width:0">
              <input id="mb-cc-name-${wi}" class="mb-input" list="mb-dl-cn" style="padding:6px 8px;font-size:13.5px;font-weight:700;border-color:transparent;background:#F9FAFB"
                     data-in="ccWorkers.${wi}.name" value="${mbX(w.name)}" placeholder="Tên công nhân"/>
              <div style="font-size:10.5px;color:var(--mb-muted-2);margin-top:3px">${mbX(role)} · ${mbFmt(w.luong)}/công</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-size:14px;font-weight:800">${mbFmt(net)}</div>
              <div style="font-size:10.5px;color:var(--mb-muted-2)">${Math.round(congs * 10) / 10} công</div>
            </div>
          </div>
          <div class="mb-row" style="margin-bottom:10px">
            <div class="mb-field"><div class="mb-label">Lương/công</div>
              <input id="mb-cc-luong-${wi}" class="mb-input" inputmode="numeric" data-in="ccWorkers.${wi}.luong" data-live="1" value="${w.luong || ''}" placeholder="0"/></div>
            <div class="mb-field"><div class="mb-label">Phụ cấp</div>
              <input id="mb-cc-pc-${wi}" class="mb-input" inputmode="numeric" data-in="ccWorkers.${wi}.phucap" data-live="1" value="${w.phucap || ''}" placeholder="0"/></div>
            <button class="mb-del" style="align-self:flex-end;margin-bottom:6px" data-act="ccDelWorker" data-arg="${wi}">×</button>
          </div>
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

    <button class="mb-btn dashed" data-act="ccAddWorker">+ Thêm công nhân</button>

    <div class="mb-card" style="padding:13px;display:flex;flex-direction:column;gap:8px">
      ${[
        ['Tổng công',        (Math.round(totCongs * 10) / 10) + ' công', ''],
        ['Tổng lương',       mbFull(totGross),                           ''],
        ['Điều chỉnh ứng CN', (totAdj >= 0 ? '+ ' : '− ') + mbFull(Math.abs(totAdj)), 'var(--mb-amber)'],
        ['Thực lãnh',        mbFull(totGross + totAdj),                  'var(--mb-green)'],
      ].map(([l, v, c]) => `<div class="mb-row-between">
        <span style="font-size:12.5px;color:var(--mb-muted)">${l}</span>
        <span style="font-size:13px;font-weight:700;color:${c || 'var(--mb-text)'}">${mbX(v)}</span>
      </div>`).join('')}
    </div>

    <button class="mb-btn lg" data-act="ccSaveWeek">Lưu tuần chấm công</button>
  </div>`;
}

function mbCcBaoCao() {
  const weeks = (typeof ccData !== 'undefined' ? ccData : [])
    .filter(w => !w.deletedAt && inActiveYear(w.fromDate))
    .sort((a, b) => (b.fromDate || '').localeCompare(a.fromDate || ''));

  let totLuong = 0, totCongs = 0;
  const names = new Set();
  weeks.forEach(w => (w.workers || []).forEach(wk => {
    const c = (wk.d || []).reduce((s, v) => s + (v || 0), 0);
    totCongs += c;
    totLuong += c * (wk.luong || 0) + (wk.phucap || 0);
    if (wk.name) names.add(wk.name);
  }));

  // Công nợ công nhân còn lại tới hôm nay
  const today = mbToday();
  let debt = 0;
  names.forEach(n => { debt += (typeof ccWorkerDebtUpTo === 'function') ? ccWorkerDebtUpTo(n, today) : 0; });

  const kpis = [
    ['Tổng lương năm',   mbFmt(totLuong),                        ''],
    ['Số tuần đã chấm',  weeks.length + ' tuần',                 ''],
    ['Tổng công',        (Math.round(totCongs * 10) / 10) + '',  ''],
    ['Ứng CN chưa trừ',  mbFmt(debt),                            'var(--mb-amber)'],
  ];

  return `<div class="mb-pad">
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
        const tong  = wk.reduce((s, k) => s + (k.d || []).reduce((a, v) => a + (v || 0), 0) * (k.luong || 0) + (k.phucap || 0), 0);
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

function mbCcUng() {
  const today = mbToday();
  const names = (typeof ccAllNames === 'function') ? ccAllNames() : [];
  const rows = names.map(n => {
    const ung = (typeof ungRecords !== 'undefined' ? ungRecords : [])
      .filter(r => !r.deletedAt && r.loai === 'congnhan' && (r.tp || '') === n);
    const daUng = ung.filter(r => r.cnKind !== 'tra').reduce((s, r) => s + (r.tien || 0), 0);
    const daTra = ung.filter(r => r.cnKind === 'tra').reduce((s, r) => s + (r.tien || 0), 0);
    const remain = (typeof ccWorkerDebtUpTo === 'function') ? ccWorkerDebtUpTo(n, today) : daUng - daTra;
    return { name: n, daUng, daTra, remain };
  }).filter(r => r.daUng || r.daTra || r.remain);

  const total = rows.reduce((s, r) => s + r.remain, 0);
  const f = MB.ccUngForm;

  return `<div class="mb-pad">
    <div class="mb-kpi amber" style="border-radius:13px">
      <div class="mb-kpi-label">Công nợ công nhân còn lại</div>
      <div class="mb-kpi-value" style="font-size:17px">${mbFmt(total)}</div>
      <div class="mb-kpi-hint">${rows.length} công nhân có phát sinh</div>
    </div>

    <div class="mb-card" style="display:flex;flex-direction:column;gap:11px">
      <div class="mb-sec-title">Ghi phiếu ứng / trả</div>

      <div class="mb-chips even">
        ${[['ung', 'Ứng tiền'], ['tra', 'Trả nợ']].map(([k, l]) =>
          `<div class="mb-chip${f.kind === k ? ' on' : ''}" data-act="ccUngKind" data-arg="${k}">${l}</div>`).join('')}
      </div>

      <div><div class="mb-label">Công nhân</div>
        <input id="mb-cu-tp" class="mb-input" list="mb-dl-cnung" data-in="ccUngForm.tp" value="${mbX(f.tp)}" placeholder="Nhập hoặc chọn tên"/>
        <datalist id="mb-dl-cnung">${((typeof ccAllNames === 'function') ? ccAllNames() : []).map(n => `<option value="${mbX(n)}">`).join('')}</datalist></div>

      <div><div class="mb-label">Công trình</div>
        <select id="mb-cu-ct" class="mb-select" data-in="ccUngForm.ct">${mbCtOptions(f.ct, false)}</select></div>

      <div class="mb-row">
        <div class="mb-field"><div class="mb-label">Ngày</div>
          <input id="mb-cu-ngay" class="mb-input" type="date" data-in="ccUngForm.ngay" value="${mbX(f.ngay)}"/></div>
        <div class="mb-field" style="flex:1.3"><div class="mb-label">Số tiền (đ)</div>
          <input id="mb-cu-tien" class="mb-input" inputmode="numeric" data-in="ccUngForm.tien" value="${mbX(f.tien)}" placeholder="0"/></div>
      </div>

      <div><div class="mb-label">Nội dung</div>
        <input id="mb-cu-nd" class="mb-input" data-in="ccUngForm.nd" value="${mbX(f.nd)}" placeholder="${f.kind === 'tra' ? 'VD: Trả nợ đợt 1' : 'VD: Ứng sinh hoạt'}"/></div>

      <button class="mb-btn ${f.kind === 'tra' ? 'green' : 'amber'}" data-act="saveUngCN">
        ${f.kind === 'tra' ? 'Lưu phiếu trả nợ' : 'Lưu phiếu ứng'}
      </button>
    </div>

    <div class="mb-col">
      ${rows.length ? rows.map(r => `<div class="mb-card mb-card-sm">
        <div class="mb-row-between" style="margin-bottom:6px">
          <span style="font-size:13px;font-weight:700">${mbX(r.name)}</span>
          <span style="font-size:13px;font-weight:800;color:${r.remain > 0 ? 'var(--mb-amber)' : 'var(--mb-green)'};flex-shrink:0">${mbFmtSigned(r.remain)}</span>
        </div>
        <div class="mb-row-between" style="font-size:11px;color:var(--mb-muted-2)">
          <span>Đã ứng ${mbFmt(r.daUng)}</span><span>Đã trả ${mbFmt(r.daTra)}</span>
        </div>
      </div>`).join('') : '<div class="mb-empty">Chưa có công nợ công nhân</div>'}
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

  const recent = (typeof ungRecords !== 'undefined' ? ungRecords : [])
    .filter(u => !u.deletedAt && u.loai !== 'congnhan' && inActiveYear(u.ngay))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 8);

  return `<div class="mb-pad">
    <div class="mb-card" style="display:flex;flex-direction:column;gap:11px">
      <div class="mb-sec-title">Phiếu ứng mới</div>

      <div><div class="mb-label">Loại ứng</div>
        <div class="mb-chips even">
          ${kinds.map(([k, l]) => `<div class="mb-chip${MB.ungKind === k ? ' on' : ''}" data-act="setFilter" data-arg="ungKind|${k}">${l}</div>`).join('')}
        </div>
      </div>

      <div><div class="mb-label">${partyLabel}</div>
        <input id="mb-u-tp" class="mb-input" list="mb-dl-tp" data-in="ungForm.tp" value="${mbX(f.tp)}" placeholder="Nhập hoặc chọn tên"/>
        <datalist id="mb-dl-tp">${partyList.map(v => `<option value="${mbX(v)}">`).join('')}</datalist></div>

      <div><div class="mb-label">Công trình</div>
        <select id="mb-u-ct" class="mb-select" data-in="ungForm.ct">${mbCtOptions(f.ct, false)}</select></div>

      <div class="mb-row">
        <div class="mb-field"><div class="mb-label">Ngày</div>
          <input id="mb-u-ngay" class="mb-input" type="date" data-in="ungForm.ngay" value="${mbX(f.ngay)}"/></div>
        <div class="mb-field" style="flex:1.3"><div class="mb-label">Số tiền (đ)</div>
          <input id="mb-u-tien" class="mb-input" inputmode="numeric" data-in="ungForm.tien" value="${mbX(f.tien)}" placeholder="0"/></div>
      </div>

      <div><div class="mb-label">Nội dung</div>
        <input id="mb-u-nd" class="mb-input" data-in="ungForm.nd" value="${mbX(f.nd)}" placeholder="VD: Ứng đợt 1"/></div>

      <button class="mb-btn" data-act="saveUng">Lưu phiếu ứng</button>
    </div>

    <div class="mb-sec-title">Phiếu gần đây</div>
    <div class="mb-col">
      ${recent.length ? recent.map(u => `<div class="mb-card mb-card-sm">
        <div class="mb-row-between" style="margin-bottom:4px">
          <span style="font-size:13px;font-weight:700">${mbX(u.tp || '—')}</span>
          <span style="font-size:13px;font-weight:800;color:var(--mb-amber);flex-shrink:0">${mbFmt(u.tien)}</span>
        </div>
        <div style="font-size:11px;color:var(--mb-muted-2)">${mbX(MB_UNG_LABEL[u.loai] || '—')} · ${mbX(u.congtrinh || '—')} · ${mbDate(u.ngay)}</div>
      </div>`).join('') : '<div class="mb-empty">Chưa có phiếu ứng</div>'}
    </div>
  </div>`;
}

function mbUngThongKe() {
  // Bỏ phiếu công nhân — trang này chỉ theo dõi ứng thầu phụ / nhà cung cấp
  const list = (typeof ungRecords !== 'undefined' ? ungRecords : [])
    .filter(u => !u.deletedAt && u.loai !== 'congnhan' && inActiveYear(u.ngay));

  const tot = { thauphu: 0, nhacungcap: 0 };
  const byParty = {};
  list.forEach(u => {
    if (tot[u.loai] !== undefined) tot[u.loai] += (u.tien || 0);
    const k = u.tp || '(Không rõ)';
    byParty[k] = (byParty[k] || 0) + (u.tien || 0);
  });
  const parties = Object.entries(byParty).sort((a, b) => b[1] - a[1]).slice(0, 20);
  const maxParty = parties.length ? parties[0][1] : 1;

  const kpis = [
    ['Ứng thầu phụ',     mbFmt(tot.thauphu)],
    ['Ứng nhà cung cấp', mbFmt(tot.nhacungcap)],
  ];

  return `<div class="mb-pad">
    <div class="mb-grid2">
      ${kpis.map(([l, v]) => `<div class="mb-kpi" style="border-radius:13px">
        <div class="mb-kpi-label">${l}</div>
        <div class="mb-kpi-value" style="font-size:15px">${v}</div>
      </div>`).join('')}
    </div>
    <div style="text-align:center;font-size:11.5px;color:var(--mb-muted-2);margin-top:-4px">
      ${list.length} phiếu ứng · ${mbYearLabel()}
    </div>
    <div class="mb-sec-title">Ứng theo đối tác</div>
    <div class="mb-col">
      ${parties.length ? parties.map(([name, total]) => `<div class="mb-card mb-card-sm">
        <div class="mb-row-between" style="margin-bottom:6px">
          <span style="font-size:13px;font-weight:700">${mbX(name)}</span>
          <span style="font-size:13px;font-weight:800;flex-shrink:0">${mbFmt(total)}</span>
        </div>
        <div class="mb-bar thin"><i style="width:${mbBarW(total, maxParty)};background:var(--mb-amber)"></i></div>
      </div>`).join('') : '<div class="mb-empty">Chưa có dữ liệu ứng</div>'}
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  7 · DOANH THU
// ══════════════════════════════════════════════════════════════
function mbScrDoanhThu() {
  if (MB.seg.doanhthu === 'thongke')  return mbDtThongKe();
  if (MB.seg.doanhthu === 'loinhuan') return mbDtLoiNhuan();
  return mbDtKhaiBao();
}

const MB_DT_KINDS = [['hdc', 'HĐ chính'], ['hdtp', 'Thầu phụ'], ['thu', 'Thu tiền']];
const MB_DT_TITLE = { hdc: 'Hợp đồng chính', hdtp: 'Hợp đồng thầu phụ', thu: 'Thu tiền' };

function mbDtKhaiBao() {
  const f = MB.dtForm;
  const kind = MB.dtKind;

  // Danh sách khai báo gần đây theo loại
  let rows = [];
  if (kind === 'hdc') {
    rows = Object.entries(typeof hopDongData !== 'undefined' ? hopDongData : {})
      .filter(([, v]) => v && !v.deletedAt)
      .map(([k, v]) => {
        const p = mbProject(v.projectId || k);
        return { ct: p ? p.name : k, tien: (v.giaTri || 0) + (v.giaTriphu || 0) + (v.phatSinh || 0), ngay: v.ngay, label: 'Hợp đồng chính', color: '' };
      });
  } else if (kind === 'hdtp') {
    rows = (typeof thauPhuContracts !== 'undefined' ? thauPhuContracts : [])
      .filter(r => !r.deletedAt && inActiveYear(r.ngay))
      .map(r => ({ ct: r.congtrinh || '—', tien: (r.giaTri || 0) + (r.phatSinh || 0), ngay: r.ngay, label: 'Thầu phụ · ' + (r.thauphu || '—'), color: 'var(--mb-amber)' }));
  } else {
    rows = (typeof thuRecords !== 'undefined' ? thuRecords : [])
      .filter(r => !r.deletedAt && inActiveYear(r.ngay))
      .map(r => ({ ct: r.congtrinh || '—', tien: r.tien || 0, ngay: r.ngay, label: 'Thu tiền · ' + (r.nd || ''), color: 'var(--mb-green)' }));
  }
  rows = rows.sort((a, b) => (b.ngay || '').localeCompare(a.ngay || '')).slice(0, 20);

  return `<div class="mb-pad">
    <div class="mb-chips even">
      ${MB_DT_KINDS.map(([k, l]) => `<div class="mb-chip${kind === k ? ' on' : ''}" data-act="setFilter" data-arg="dtKind|${k}">${l}</div>`).join('')}
    </div>

    <div class="mb-card" style="display:flex;flex-direction:column;gap:11px">
      <div class="mb-sec-title">${MB_DT_TITLE[kind]}</div>

      <div><div class="mb-label">Công trình</div>
        <select id="mb-dt-ct" class="mb-select" data-in="dtForm.ct">${mbCtOptions(f.ct, false)}</select></div>

      ${kind === 'hdtp' ? `<div><div class="mb-label">Thầu phụ</div>
        <input id="mb-dt-tp" class="mb-input" list="mb-dl-dttp" data-in="dtForm.tp" value="${mbX(f.tp)}" placeholder="Tên thầu phụ"/>
        <datalist id="mb-dl-dttp">${(cats.thauPhu || []).map(v => `<option value="${mbX(v)}">`).join('')}</datalist></div>` : ''}

      <div class="mb-row">
        <div class="mb-field"><div class="mb-label">${kind === 'thu' ? 'Số tiền thu (đ)' : 'Giá trị (đ)'}</div>
          <input id="mb-dt-tien" class="mb-input" inputmode="numeric" data-in="dtForm.tien" value="${mbX(f.tien)}" placeholder="0"/></div>
        <div class="mb-field"><div class="mb-label">Ngày</div>
          <input id="mb-dt-ngay" class="mb-input" type="date" data-in="dtForm.ngay" value="${mbX(f.ngay)}"/></div>
      </div>

      <div><div class="mb-label">${kind === 'thu' ? 'Người thu / nội dung' : 'Nội dung'}</div>
        <input id="mb-dt-nd" class="mb-input" data-in="dtForm.nd" value="${mbX(f.nd)}" placeholder="Ghi chú"/></div>

      <button class="mb-btn" data-act="saveDt">Lưu ${MB_DT_TITLE[kind].toLowerCase()}</button>
    </div>

    <div class="mb-col">
      ${rows.length ? rows.map(r => `<div class="mb-card mb-card-sm">
        <div class="mb-row-between" style="margin-bottom:4px">
          <span style="font-size:13px;font-weight:700">${mbX(r.ct)}</span>
          <span style="font-size:13px;font-weight:800;color:${r.color || 'var(--mb-text)'};flex-shrink:0">${mbFmt(r.tien)}</span>
        </div>
        <div style="font-size:11px;color:var(--mb-muted-2)">${mbX(r.label)} · ${mbDate(r.ngay)}</div>
      </div>`).join('') : '<div class="mb-empty">Chưa có khai báo nào</div>'}
    </div>
  </div>`;
}

function mbDtThongKe() {
  const invMap = mbInvMap();
  const rows = mbProjects().map(p => ({ p, st: mbProjStats(p, invMap) })).filter(r => r.st.hd > 0);
  const totHd  = rows.reduce((s, r) => s + r.st.hd, 0);
  const totThu = rows.reduce((s, r) => s + r.st.thu, 0);
  const totTp  = (typeof thauPhuContracts !== 'undefined' ? thauPhuContracts : [])
    .filter(r => !r.deletedAt && inActiveYear(r.ngay))
    .reduce((s, r) => s + (r.giaTri || 0) + (r.phatSinh || 0), 0);

  const kpis = [
    ['Tổng giá trị HĐ', mbFmt(totHd),          ''],
    ['Đã thu',          mbFmt(totThu),         'green'],
    ['Còn phải thu',    mbFmt(totHd - totThu), 'red'],
    ['HĐ thầu phụ',     mbFmt(totTp),          ''],
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
      ${rows.length ? rows.sort((a, b) => b.st.hd - a.st.hd).map(({ p, st }) => `
        <div class="mb-card mb-card-sm">
          <div class="mb-row-between" style="margin-bottom:6px">
            <span style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${mbX(p.name)}</span>
            <span style="font-size:12.5px;font-weight:800;flex-shrink:0">${mbFmt(st.thu)} / ${mbFmt(st.hd)}</span>
          </div>
          <div class="mb-bar thin"><i style="width:${mbBarW(st.thu, st.hd)};background:var(--mb-green)"></i></div>
          <div style="font-size:10.5px;color:var(--mb-muted-2);margin-top:5px">Đã thu ${mbPct(st.thu, st.hd)}% · còn ${mbFmt(Math.max(0, st.hd - st.thu))}</div>
        </div>`).join('') : '<div class="mb-empty">Chưa khai báo hợp đồng</div>'}
    </div>
  </div>`;
}

function mbDtLoiNhuan() {
  const invMap = mbInvMap();
  const rows = mbProjects().map(p => ({ p, st: mbProjStats(p, invMap) })).filter(r => r.st.hd > 0);

  const totHd  = rows.reduce((s, r) => s + r.st.hd, 0);
  const totInv = mbInvoices().filter(i => i.projectId !== 'COMPANY').reduce((s, i) => s + mbInvAmount(i), 0);
  const totTp  = (typeof thauPhuContracts !== 'undefined' ? thauPhuContracts : [])
    .filter(r => !r.deletedAt && inActiveYear(r.ngay))
    .reduce((s, r) => s + (r.giaTri || 0) + (r.phatSinh || 0), 0);
  const chung  = (typeof getCompanyCost === 'function') ? getCompanyCost() : 0;
  const loi    = totHd - totInv - totTp - chung;

  const breakdown = [
    ['X · Doanh thu HĐ gốc',        totHd,  'var(--mb-primary)'],
    ['A · Chi phí hóa đơn',         totInv, 'var(--mb-red)'],
    ['B · Chi phí thầu phụ',        totTp,  'var(--mb-amber)'],
    ['C · Phân bổ chi phí chung',   chung,  'var(--mb-purple)'],
    ['Lợi nhuận gộp',               loi,    'var(--mb-green)'],
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
        const lai = st.hd - st.chi;
        const pct = mbPct(Math.abs(lai), st.hd);
        return `<div class="mb-card mb-card-sm tap" data-act="openProject" data-arg="${mbX(p.id)}">
          <div class="mb-row-between" style="margin-bottom:5px">
            <span style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${mbX(p.name)}</span>
            <span class="mb-tag ${lai >= 0 ? 'green' : 'red'}">${lai >= 0 ? 'Lãi' : 'Lỗ'} ${pct}%</span>
          </div>
          <div class="mb-row-between" style="font-size:11.5px;color:var(--mb-muted)">
            <span>HĐ ${mbFmt(st.hd)} · Chi ${mbFmt(st.chi)}</span>
            <span style="font-weight:800;color:${lai >= 0 ? 'var(--mb-green)' : 'var(--mb-red)'}">${mbFmtSigned(lai)}</span>
          </div>
        </div>`;
      }).join('') : '<div class="mb-empty">Chưa có hợp đồng</div>'}
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  8 · CÔNG NỢ — dùng lại _cnBuildRows() của bản desktop
// ══════════════════════════════════════════════════════════════
function mbScrCongNo() {
  const all = (typeof _cnBuildRows === 'function') ? _cnBuildRows() : [];
  const rows = all.filter(r => MB.cnGroup === 'all' || r.group === MB.cnGroup);

  const totNo   = all.reduce((s, r) => s + (r.conPhaiTT || 0), 0);
  const totUng  = all.reduce((s, r) => s + (r.daUng || 0), 0);
  const totVal  = all.reduce((s, r) => s + (r.value || 0), 0);
  const nDebtor = all.filter(r => (r.conPhaiTT || 0) > 0).length;

  const kpis = [
    ['Tổng còn nợ',       mbFmt(totNo),  'red'],
    ['Đã ứng',            mbFmt(totUng), 'green'],
    ['Đối tác còn nợ',    nDebtor + ' đối tác', ''],
    ['Giá trị phát sinh', mbFmt(totVal), ''],
  ];
  const chips = [['all', 'Tất cả'], ['thauphu', 'Thầu phụ'], ['nhacungcap', 'Nhà cung cấp']];

  return `<div class="mb-pad">
    <div class="mb-grid2">
      ${kpis.map(([l, v, c]) => `<div class="mb-kpi ${c}" style="border-radius:13px">
        <div class="mb-kpi-label">${l}</div>
        <div class="mb-kpi-value" style="font-size:15px">${v}</div>
      </div>`).join('')}
    </div>

    <div class="mb-chips">
      ${chips.map(([k, l]) => `<div class="mb-chip${MB.cnGroup === k ? ' on' : ''}" data-act="setFilter" data-arg="cnGroup|${k}">${l}</div>`).join('')}
    </div>

    <div class="mb-col" style="gap:9px">
      ${rows.length ? rows.sort((a, b) => b.conPhaiTT - a.conPhaiTT).map(r => {
        const pct = mbPct(r.daUng, r.value);
        const [label, cls] = r.conPhaiTT <= 0 ? ['Đã tất toán', 'green']
          : pct >= 50 ? ['Ứng ' + pct + '%', 'amber'] : ['Còn nợ nhiều', 'red'];
        return `<div class="mb-card" style="padding:13px">
          <div class="mb-row-between" style="margin-bottom:4px">
            <span style="font-size:13.5px;font-weight:700">${mbX(r.partner)}</span>
            <span class="mb-tag ${cls}">${label}</span>
          </div>
          <div style="font-size:11px;color:var(--mb-muted-2);margin-bottom:10px">${mbX(MB_UNG_LABEL[r.group] || r.group)} · ${mbX(r.congtrinh)}</div>
          <div class="mb-grid3" style="margin-bottom:9px">
            <div><div style="font-size:10px;color:var(--mb-muted-2)">Giá trị</div><div style="font-size:12px;font-weight:700">${mbFmt(r.value)}</div></div>
            <div><div style="font-size:10px;color:var(--mb-muted-2)">Đã ứng</div><div style="font-size:12px;font-weight:700;color:var(--mb-green)">${mbFmt(r.daUng)}</div></div>
            <div><div style="font-size:10px;color:var(--mb-muted-2)">Còn nợ</div><div style="font-size:12px;font-weight:800;color:var(--mb-red)">${mbFmtSigned(r.conPhaiTT)}</div></div>
          </div>
          <div class="mb-bar"><i style="width:${Math.min(100, pct)}%;background:var(--mb-green)"></i></div>
        </div>`;
      }).join('') : '<div class="mb-empty">Không có công nợ phù hợp</div>'}
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  9 · THIẾT BỊ
// ══════════════════════════════════════════════════════════════
function mbScrThietBi() {
  const all = (typeof tbData !== 'undefined' ? tbData : []).filter(t => !t.deletedAt && inActiveYear(t.ngay));
  // Thiết bị lưu tên công trình ở field `ct` (xem schema tb_v1). Không có CT hoặc
  // tên chứa chữ "kho" → coi là đang nằm ở Kho tổng.
  const tbCt  = t => t.ct || t.congtrinh || '';
  const isKho = t => !tbCt(t) || tbCt(t).toLowerCase().includes('kho');
  const rows = all.filter(t => MB.tbView === 'kho' ? isKho(t) : !isKho(t));

  const stCls = s => {
    const v = (s || '').toLowerCase();
    if (v.includes('tốt') || v.includes('tot')) return 'green';
    if (v.includes('sửa') || v.includes('sua')) return 'amber';
    if (v.includes('hỏng') || v.includes('hong') || v.includes('mất')) return 'red';
    return 'gray';
  };

  return `<div class="mb-pad">
    <div class="mb-chips even">
      ${[['ct', 'Tại công trình'], ['kho', 'Kho tổng']].map(([k, l]) =>
        `<div class="mb-chip${MB.tbView === k ? ' on' : ''}" data-act="setFilter" data-arg="tbView|${k}">${l}</div>`).join('')}
    </div>
    <div class="mb-col">
      ${rows.length ? rows.map(t => `<div class="mb-card mb-card-sm">
        <div class="mb-row-between" style="margin-bottom:4px">
          <span style="font-size:13px;font-weight:700">${mbX(t.ten || '—')}</span>
          <span style="font-size:12.5px;font-weight:800;flex-shrink:0">SL ${t.soluong || 0}</span>
        </div>
        <div class="mb-row-between" style="align-items:center">
          <span style="font-size:11px;color:var(--mb-muted-2)">${mbX(tbCt(t) || 'Kho tổng')} · ${mbX(t.nguoi || '—')}</span>
          <span class="mb-tag ${stCls(t.tinhtrang)}">${mbX(t.tinhtrang || '—')}</span>
        </div>
      </div>`).join('') : '<div class="mb-empty">Không có thiết bị</div>'}
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  10 · DANH MỤC
// ══════════════════════════════════════════════════════════════
function mbScrDanhMuc() {
  const list = (cats[MB.dmType] || []);
  return `<div class="mb-pad">
    <div class="mb-chips">
      ${Object.keys(MB_DM_LABELS).map(k =>
        `<div class="mb-chip${MB.dmType === k ? ' on' : ''}" data-act="setFilter" data-arg="dmType|${k}">${MB_DM_LABELS[k]}</div>`).join('')}
    </div>

    <div style="display:flex;gap:8px">
      <input id="mb-dm-new" class="mb-input" data-in="dmNew" value="${mbX(MB.dmNew)}" placeholder="Thêm mục mới..."/>
      <button class="mb-btn" style="width:auto;padding:10px 15px;font-size:13px" data-act="addDm">Thêm</button>
    </div>

    <div class="mb-list">
      ${list.length ? list.map((name, idx) => `<div class="mb-list-row">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600">${mbX(name)}</div>
          <div style="font-size:10.5px;color:var(--mb-muted-2)">${MB_DM_LABELS[MB.dmType]}</div>
        </div>
        <button class="mb-del" data-act="delDm" data-arg="${idx}">×</button>
      </div>`).join('') : '<div class="mb-empty">Danh mục trống</div>'}
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  11 · THỐNG KÊ CPHĐ
// ══════════════════════════════════════════════════════════════
function mbScrThongKe() {
  const invs = mbInvoices();

  // Chi phí theo loại
  const byLoai = {};
  invs.forEach(i => { const k = i.loai || '(Không phân loại)'; byLoai[k] = (byLoai[k] || 0) + mbInvAmount(i); });
  const loaiRows = Object.entries(byLoai).sort((a, b) => b[1] - a[1]);
  const maxLoai  = loaiRows.length ? loaiRows[0][1] : 1;
  const COLORS   = ['var(--mb-primary)', 'var(--mb-green)', 'var(--mb-amber)', 'var(--mb-purple)', 'var(--mb-red)'];

  // Phân bổ chi phí chung — dùng đúng allocateCompanyCost() của desktop
  const alloc = (typeof allocateCompanyCost === 'function') ? allocateCompanyCost() : [];
  const chung = (typeof getCompanyCost === 'function') ? getCompanyCost() : 0;

  return `<div class="mb-pad">
    <div class="mb-card">
      <div class="mb-sec-title" style="margin-bottom:11px">Chi phí theo loại</div>
      <div class="mb-col" style="gap:10px">
        ${loaiRows.length ? loaiRows.map(([label, v], idx) => `<div>
          <div class="mb-row-between" style="margin-bottom:4px">
            <span style="font-size:12px;color:var(--mb-text-2);font-weight:600">${mbX(label)}</span>
            <span style="font-size:12.5px;font-weight:800">${mbFmt(v)}</span>
          </div>
          <div class="mb-bar"><i style="width:${mbBarW(v, maxLoai)};background:${COLORS[idx % COLORS.length]}"></i></div>
        </div>`).join('') : '<div class="mb-empty">Chưa có chi phí</div>'}
      </div>
    </div>

    <div class="mb-card">
      <div class="mb-sec-head" style="margin-bottom:11px">
        <div class="mb-sec-title">Chi phí chung phân bổ</div>
        <div style="font-size:12px;font-weight:700">${mbFmt(chung)}</div>
      </div>
      <div class="mb-col" style="gap:9px">
        ${alloc.length ? alloc.filter(a => a.allocated > 0).map(a => `
          <div class="mb-row-between" style="align-items:center">
            <div style="min-width:0">
              <div style="font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${mbX(a.p.name)}</div>
              <div style="font-size:10.5px;color:var(--mb-muted-2)">${(typeof getProjectDays === 'function') ? getProjectDays(a.p) : 0} ngày × k=${(typeof getProjectK === 'function') ? getProjectK(a.p) : 1}</div>
            </div>
            <div style="font-size:12.5px;font-weight:800;flex-shrink:0">${mbFmt(a.allocated)}</div>
          </div>`).join('') : '<div class="mb-empty">Chưa có chi phí chung để phân bổ</div>'}
      </div>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  12 · THÙNG RÁC — dùng lại _trashGetRecords / _trashRestore / _trashHardDelete
// ══════════════════════════════════════════════════════════════
const MB_TRASH_TABS = [
  ['hoadon', 'Hóa đơn'], ['tienung', 'Tiền ứng'], ['chamcong', 'Chấm công'],
  ['thietbi', 'Thiết bị'], ['thutien', 'Thu tiền'],
];

function mbScrThungRac() {
  const recs = (typeof _trashGetRecords === 'function') ? _trashGetRecords(MB.trashType) : [];

  const title = r => {
    if (MB.trashType === 'hoadon')   return r.nd || '(Hóa đơn không tên)';
    if (MB.trashType === 'tienung')  return 'Ứng ' + (r.tp || '—');
    if (MB.trashType === 'chamcong') return 'Tuần ' + ((typeof weekLabel === 'function') ? weekLabel(r.fromDate) : r.fromDate);
    if (MB.trashType === 'thietbi')  return r.ten || '(Thiết bị)';
    if (MB.trashType === 'thutien')  return 'Thu ' + (r.nd || '');
    return '(Bản ghi)';
  };
  const amount = r => {
    if (MB.trashType === 'hoadon')   return mbInvAmount(r);
    if (MB.trashType === 'chamcong') return (r.workers || []).reduce((s, k) =>
      s + (k.d || []).reduce((a, v) => a + (v || 0), 0) * (k.luong || 0) + (k.phucap || 0), 0);
    if (MB.trashType === 'thietbi')  return 0;
    return r.tien || 0;
  };

  return `<div class="mb-pad">
    <div class="mb-chips">
      ${MB_TRASH_TABS.map(([k, l]) => {
        const n = (typeof _trashGetRecords === 'function') ? _trashGetRecords(k).length : 0;
        return `<div class="mb-chip${MB.trashType === k ? ' on' : ''}" data-act="setFilter" data-arg="trashType|${k}">${l}${n ? ' · ' + n : ''}</div>`;
      }).join('')}
    </div>

    <div class="mb-col" style="gap:9px">
      ${recs.length ? recs.map(r => `<div class="mb-card mb-card-sm">
        <div class="mb-row-between" style="margin-bottom:4px">
          <span style="font-size:13px;font-weight:700">${mbX(title(r))}</span>
          ${amount(r) ? `<span style="font-size:12.5px;font-weight:800;flex-shrink:0">${mbFmt(amount(r))}</span>` : ''}
        </div>
        <div style="font-size:11px;color:var(--mb-muted-2);margin-bottom:10px">Xóa ${mbDate(new Date(r.deletedAt || Date.now()).toISOString().slice(0, 10))} · ${mbX(r.congtrinh || r.ct || '—')}</div>
        <div style="display:flex;gap:8px">
          <button class="mb-btn sm soft-blue" style="flex:1" data-act="trashRestore" data-arg="${MB.trashType}||${mbX(r.id)}">Phục hồi</button>
          <button class="mb-btn sm soft-red"  style="flex:1" data-act="trashPurge"   data-arg="${MB.trashType}||${mbX(r.id)}">Xóa vĩnh viễn</button>
        </div>
      </div>`).join('') : '<div class="mb-empty">Thùng rác trống</div>'}
    </div>
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
  const trashN = (typeof _trashCountAll === 'function') ? _trashCountAll() : 0;

  // Tiền Ứng đã lên bottom nav nên không liệt kê ở đây nữa.
  // Tổng Quan rời bottom nav xuống đây.
  const rows = [
    ['dashboard', 'Tổng Quan',     'Dashboard chi phí ' + mbYearLabel(), 'T', '#EFF6FF', '#2563EB'],
    ['doanhthu', 'Doanh Thu',      'Hợp đồng · Thu tiền · Lợi nhuận', 'D', '#F0FDF4', '#16A34A'],
    ['congno',   'Công Nợ',        'Còn phải trả theo đối tác',      'N', '#FEF2F2', '#DC2626'],
    ['thietbi',  'Thiết Bị',       'Kho tổng & tại công trình',      'B', '#EFF6FF', '#2563EB'],
    ['thongke',  'Thống Kê CPHĐ',  'Cơ cấu & phân bổ chi phí',       'K', '#F5F3FF', '#7C3AED'],
    ['danhmuc',  'Danh Mục',       'Loại CP · NCC · Người · Thầu phụ', 'M', '#F3F4F6', '#4B5563'],
    ['thungrac', 'Thùng Rác',      trashN + ' bản ghi có thể phục hồi', 'R', '#F3F4F6', '#6B7280'],
  ].filter(r => mbCanSee(r[0]));

  const sys = [
    ['sync',       'Đồng bộ Firebase', pending > 0 ? pending + ' thay đổi chờ đẩy lên' : 'Đã đồng bộ', 'S', '#EFF6FF', '#2563EB'],
    ['useDesktop', 'Mở bản máy tính',  'Dùng giao diện đầy đủ trên máy này',                          'W', '#F3F4F6', '#4B5563'],
  ];

  const rowHtml = ([act, label, hint, letter, bg, fg], isNav) =>
    `<div class="mb-list-row" style="cursor:pointer" data-act="${isNav ? 'go' : act}" ${isNav ? `data-arg="${act}"` : ''}>
       <div style="width:32px;height:32px;border-radius:9px;background:${bg};color:${fg};font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">${letter}</div>
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
