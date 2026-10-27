// ══════════════════════════════════════════════════════════════
// mobile.core.js — Lõi giao diện điện thoại (state / shell / router / helper)
// Load order: sau js/app/main.js (nạp cuối cùng, xem index.html)
//
// TRIẾT LÝ (theo bản thiết kế "QLCP Mobile App"):
//   - Cùng dữ liệu Firebase, cùng logic nghiệp vụ — CHỈ đổi tầng hiển thị.
//   - KHÔNG viết lại logic: đọc thẳng các global (invoices/projects/ccData/...)
//     và các helper sẵn có (getInvoicesCached, _ctTongChi, _hdLookup, ttBuildRows...).
//   - Ghi dữ liệu đi qua đúng đường cũ: mkRecord() + save() → sync.js tự đẩy cloud.
//
// KIẾN TRÚC:
//   DOM desktop VẪN được nạp và init() vẫn chạy y như cũ. Mobile shell là một lớp
//   phủ (overlay) đặt trên cùng; CSS `body.mb-on` ẩn UI desktop đi. Nhờ vậy mọi
//   hàm render/sync cũ vẫn hoạt động bình thường, rủi ro thay đổi gần như bằng 0.
//
// Chia file:
//   mobile.core.js    — state, khung shell, header, nav, router, helper (file này)
//   mobile.screens.js — hàm render từng màn hình (thuần đọc dữ liệu)
//   mobile.actions.js — các hành động ghi dữ liệu (lưu HĐ, ứng, chấm công...)
// ══════════════════════════════════════════════════════════════

// ── Ngưỡng bật giao diện điện thoại ─────────────────────────────
const MB_BREAKPOINT = '(max-width: 768px)';

// Khóa localStorage cho phép người dùng ép dùng bản desktop trên điện thoại
const MB_FORCE_KEY = '_mbForceDesktop';

/** Có nên bật giao diện điện thoại không? */
function mbIsMobile() {
  if (localStorage.getItem(MB_FORCE_KEY) === '1') return false;
  return window.matchMedia(MB_BREAKPOINT).matches;
}

// ══════════════════════════════════════════════════════════════
//  STATE — toàn bộ trạng thái giao diện mobile nằm gọn trong đây
// ══════════════════════════════════════════════════════════════
const MB = {
  on: false,              // shell đã bật chưa
  ready: false,           // đã nạp partial + gắn sự kiện chưa

  tab: 'congtrinh',       // màn hình đang mở (Công trình là mục đầu bottom nav)
  projectId: null,        // công trình đang xem chi tiết (tab 'detail')
  yearOpen: false,        // dải chọn năm đang mở?

  // Tab con của từng màn hình
  seg: {
    detail:   'tong',     // tong | chi | cc | ung
    nhap:     'nhanh',    // nhanh | tatca  (27/10/2026: bỏ HĐ chi tiết nhiều dòng trên điện thoại)
    chamcong: 'so',       // so | baocao | ung
    tienung:  'nhap',     // nhap | thongke
    doanhthu: 'thu',      // thu | thongke | loinhuan  (27/10/2026: bỏ khai báo HĐ chính trên điện thoại)
  },

  // Bộ lọc / tìm kiếm
  search:       '',       // tìm công trình
  invSearch:    '',       // tìm hóa đơn
  statusFilter: 'all',    // trạng thái công trình
  cnGroup:      'all',    // nhóm đối tác công nợ
  cnShowDone:   '0',      // công nợ: '1' = hiện cả đối tác đã xong (03/10/2026)
  cnSearch:     '',       // công nợ: tìm tên đối tác
  cnCt:         '',       // công nợ: lọc theo tên công trình ('' = tất cả)
  tbView:       'ct',     // thiết bị: ct | kho
  tbSearch:     '',       // thiết bị: tìm tên
  tbCt:         '',       // thiết bị: lọc theo nơi đặt
  invCt:        '',       // lịch sử HĐ: lọc công trình
  invLoai:      '',       // lịch sử HĐ: lọc loại chi phí
  invLimit:     50,       // lịch sử HĐ: số dòng đang hiện (nút "Xem thêm" +50)
  pdSearch:     '',       // chi tiết CT → Chi phí: tìm nội dung
  pdLoai:       '',       // chi tiết CT → Chi phí: chip loại chi phí
  tkCt:         '',       // cơ cấu chi phí: '' = toàn công ty, hoặc tên công trình
  // (V2 — 27/10/2026)
  ungSearch:    '',       // thống kê ứng: tìm tên đối tác
  ungCtFilter:  '',       // thống kê ứng: lọc công trình
  ungOpen:      '',       // thống kê ứng: đối tác đang bung chi tiết
  cnOpen:       '',       // công nợ: khóa dòng đang bung chi tiết (r.key của ttBuildRows)
  hdtpOpen:     false,    // công nợ: đang mở form "Thêm hợp đồng thầu phụ"
  ccBcView:     'tuan',   // tổng lương: tuan (theo tuần & công trình) | cn (bảng lương từng công nhân)
  ccUngOpen:    '',       // ứng công nhân: tên công nhân đang bung lịch sử
  tbWarn:       '0',      // thiết bị: '1' = chỉ hiện thiết bị Cần bảo trì / Cần sửa chữa
  tbFormOpen:   false,    // thiết bị: đang mở form thêm mới
  tbMoveId:     '',       // thiết bị: id dòng đang mở khung điều chuyển
  tbMove:       { noi: '', sl: '' },
  tbForm:       { noi: '', ten: '', sl: '1', tt: 'Đang hoạt động', ghichu: '' },
  projFormOpen: false,    // công trình: đang mở form tạo / sửa
  projForm:     { id: null, loai: 'CT', kh: '', phone: '', name: '', diachi: '', ngay: '', heSo: '1' },
  hdtpForm:     { ct: '', tp: '', giaTri: '', phatSinh: '', nd: '', ngay: '' },
  ttLast:       null,     // { id, msg } lần tất toán vừa làm trên điện thoại (cho nút Hoàn tác)
  // Loại phiếu ứng — CHỈ thầu phụ / nhà cung cấp.
  // Ứng công nhân cố ý không nằm ở đây: nó là sổ nợ riêng (ung_v1 với
  // loai='congnhan' + cnKind), nhập tại tab Chấm công → "Ứng CN", đúng như
  // bản desktop (trang Tiền Ứng và Công Nợ đều lọc bỏ phiếu công nhân).
  ungKind:      'thauphu',

  // Chấm công
  ccOffset:  0,           // lệch tuần so với tuần hiện tại
  ccCt:      '',          // tên công trình đang chấm
  ccWorkers: null,        // bản nháp danh sách công nhân trong tuần (null = chưa nạp)
  ccLoadedKey: '',        // khóa "tuần|công trình" của bản nháp đang giữ
  ccOpenSalary: {},       // { chỉ số công nhân: true } — đang mở dòng sửa Lương & Phụ cấp
  ccUngShowAll: '0',      // Ứng CN: '1' = hiện cả công nhân đã hết nợ
  // Form ứng/trả cho công nhân (subtab "Ứng CN")
  ccUngForm: { tp: '', ct: '', ngay: '', tien: '', nd: '', kind: 'ung' },

  // Nhập hóa đơn — LƯU 1 CHẠM (27/10/2026: bỏ danh sách "Chờ lưu")
  form: {
    ngay: '', loai: '', ct: '', ncc: '', nguoi: '',
    nd: '', tien: '', sl: '', dg: '',
    calcMode: false,      // false = nhập thẳng Tổng tiền; true = tính theo SL × Đơn giá
    editId: null,         // id hóa đơn đang sửa nhanh
  },
  ungForm: { tp: '', ct: '', ngay: '', tien: '', nd: '', editId: null },
  dtForm:  { ct: '', tien: '', ngay: '', nd: '' },   // chỉ còn Thu tiền
};

// ══════════════════════════════════════════════════════════════
//  HELPER HIỂN THỊ
// ══════════════════════════════════════════════════════════════

/** Escape HTML — dùng lại x() của tienich.js */
function mbX(s) { return (typeof x === 'function') ? x(s) : String(s == null ? '' : s); }

/** Số tiền rút gọn (1.2 tỷ / 350 tr / 45k) — dùng lại fmtS() của desktop */
function mbFmt(n) { return (typeof fmtS === 'function') ? fmtS(Math.round(n || 0)) : String(n || 0); }

/** Số tiền đầy đủ (1.234.567 đ) — dùng lại fmtM() của desktop */
function mbFull(n) { return (typeof fmtM === 'function') ? fmtM(Math.round(n || 0)) : String(n || 0); }

/** Số tiền có dấu âm (fmtS không xử lý số âm) */
function mbFmtSigned(n) {
  const v = Math.round(n || 0);
  return (v < 0 ? '-' : '') + mbFmt(Math.abs(v));
}

/** Ngày ISO (2026-07-25) → hiển thị 25/07/2026 */
function mbDate(iso) {
  if (!iso || iso.length < 10) return iso || '—';
  return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
}

/** Ngày hôm nay dạng ISO */
function mbToday() { return new Date().toISOString().split('T')[0]; }

/** Phần trăm an toàn (mẫu = 0 → 0) */
function mbPct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; }

/** Chiều rộng thanh bar, chặn trong [0,100] */
function mbBarW(a, b) { return Math.max(0, Math.min(100, mbPct(a, b))) + '%'; }

/** Vai trò người dùng hiện tại ('admin' | 'giamdoc' | 'ketoan' | '') */
function mbRole() {
  const u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  return u ? (u.role || '') : '';
}

/** Kế toán không được xem Tổng quan / Doanh thu / Quyết toán (khớp applyRoleUI của desktop).
 *  (02/10/2026) Đã mở tab Công nợ TP/NCC cho Kế toán. */
function mbCanSee(tab) {
  if (mbRole() === 'ketoan' && ['dashboard', 'doanhthu', 'quyettoan'].includes(tab)) return false;
  return true;
}

/** Danh sách công trình (không lọc năm — projects là long-living entity) */
function mbProjects() {
  return (typeof getAllProjects === 'function')
    ? getAllProjects().filter(p => p.id !== 'COMPANY')
    : [];
}

/** Tra công trình theo id */
function mbProject(id) {
  if (!id) return null;
  return (typeof getProjectById === 'function') ? getProjectById(id) : null;
}

/** <option> công trình cho các form mobile (dùng chung helper desktop) */
function mbCtOptions(selected, includeCompany) {
  if (typeof getProjectOptions === 'function') {
    return getProjectOptions({ includeCompany: !!includeCompany, selected: selected || '' });
  }
  return '<option value="">-- Chọn công trình --</option>';
}

/** <option> từ mảng chuỗi danh mục */
function mbOptions(arr, selected) {
  return '<option value="">-- Chọn --</option>' + (arr || []).map(v =>
    `<option value="${mbX(v)}"${v === selected ? ' selected' : ''}>${mbX(v)}</option>`
  ).join('');
}

/**
 * <option> từ mảng chuỗi danh mục, có tùy biến dòng đầu (placeholder).
 * Khác mbOptions ở chỗ: nếu `selected` là giá trị cũ KHÔNG còn trong danh mục
 * (vd hóa đơn cũ nhập tay, hoặc danh mục đã bị xóa) thì vẫn chèn thêm 1 option
 * cho giá trị đó để dropdown không âm thầm làm mất dữ liệu đang có.
 */
function mbOptionsKeep(arr, selected, placeholder) {
  const list = [...new Set((arr || []).filter(v => v != null && String(v).trim() !== ''))];
  const sel  = selected || '';
  if (sel && !list.includes(sel)) list.unshift(sel);   // giữ lại giá trị cũ
  return `<option value="">${mbX(placeholder || '-- Chọn --')}</option>` + list.map(v =>
    `<option value="${mbX(v)}"${v === sel ? ' selected' : ''}>${mbX(v)}</option>`
  ).join('');
}

/**
 * Nhãn bộ lọc năm. `activeYears` là một Set:
 *   rỗng   → "Tất cả" (không lọc năm)
 *   n phần tử → liệt kê tăng dần, vd "2024, 2025, 2026"
 * Dùng chung cho nút năm trên header và phụ đề màn Tổng quan.
 */
function mbYearLabel() {
  if (typeof activeYears === 'undefined' || activeYears.size === 0) return 'Tất cả';
  return [...activeYears].sort((a, b) => a - b).join(', ');
}

/** Số thay đổi đang chờ đẩy lên cloud */
function mbPending() {
  return (typeof _pendingChanges !== 'undefined') ? _pendingChanges : 0;
}

/** Gán giá trị vào MB theo đường dẫn có dấu chấm, vd 'form.ncc' */
function mbSetPath(path, value) {
  const parts = path.split('.');
  let obj = MB;
  for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
  obj[parts[parts.length - 1]] = value;
}

/** Đọc giá trị trong MB theo đường dẫn có dấu chấm */
function mbGetPath(path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), MB);
}

/** Chuỗi chữ số → phân cách hàng nghìn bằng dấu chấm ("1500000" → "1.500.000") */
function mbGroup(digits) {
  return String(digits || '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Giá trị hiển thị trong ô tiền: số → "1.500.000", chuỗi giữ nguyên, 0/rỗng → '' */
function mbMoneyStr(v) {
  if (v == null || v === '' || v === 0) return '';
  return typeof v === 'number' ? mbGroup(Math.round(v)) : String(v);
}

/**
 * Định dạng lại ô <input data-money="1"> ngay khi gõ, giữ con trỏ đúng chỗ
 * (đếm số chữ số nằm bên phải con trỏ trước và sau khi chèn dấu chấm).
 */
function mbFormatMoneyInput(el) {
  const raw    = el.value;
  const caret  = (el.selectionStart == null) ? raw.length : el.selectionStart;
  const right  = raw.slice(caret).replace(/\D/g, '').length;
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  const out    = mbGroup(digits);
  el.value = out;
  let pos = out.length, seen = 0;
  while (pos > 0 && seen < right) { pos--; if (/\d/.test(out[pos])) seen++; }
  try { el.setSelectionRange(pos, pos); } catch (e) { /* input type không hỗ trợ */ }
}

/**
 * Dải chip gợi ý số tiền 1 chạm dưới ô tiền. Gõ số nhỏ (vd 500) → hiện
 * 500.000 · 5.000.000 · 50.000.000 · 500.000.000 và nút "+000".
 * @param {string} targetPath  đường dẫn state của ô tiền (vd 'form.tien')
 * @param {*}      currentVal  giá trị hiện tại của ô
 */
function mbQuickMoney(targetPath, currentVal) {
  const digits = String(currentVal == null ? '' : currentVal).replace(/\D/g, '');
  const n = parseInt(digits, 10) || 0;
  if (!n || digits.length > 4) return '';
  const opts = [1e3, 1e4, 1e5, 1e6].map(m => n * m).filter(v => v >= 1000 && v <= 1e11);
  return `<div class="mb-money-chips">
    ${opts.map(v => `<span data-act="setMoney" data-arg="${targetPath}|${v}">${mbGroup(v)}</span>`).join('')}
    <span data-act="setMoney" data-arg="${targetPath}|${n * 1000}" style="background:var(--mb-line-soft);color:#374151">+000</span>
  </div>`;
}

/** Icon Material Symbols (font đã nạp sẵn trong index.html) */
function mbIcon(name, size) {
  return `<span class="material-symbols-outlined" style="font-size:${size || 20}px">${name}</span>`;
}

/** <option> lọc "Tất cả" + danh sách tên (dùng cho các dropdown bộ lọc) */
function mbFilterOptions(list, selected, allLabel) {
  const arr = [...new Set((list || []).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'vi'));
  if (selected && !arr.includes(selected)) arr.unshift(selected);
  return `<option value="">${mbX(allLabel || 'Tất cả')}</option>` + arr.map(v =>
    `<option value="${mbX(v)}"${v === selected ? ' selected' : ''}>${mbX(v)}</option>`).join('');
}

// ══════════════════════════════════════════════════════════════
//  ĐIỀU HƯỚNG
// ══════════════════════════════════════════════════════════════

// Nhãn tiêu đề của từng màn hình: [tiêu đề, phụ đề]
function mbTitles() {
  const P    = mbProjects();
  const act  = P.filter(p => p.status === 'active').length;
  const sel  = MB.projectId ? mbProject(MB.projectId) : null;
  const year = mbYearLabel();
  return {
    dashboard: ['Tổng Quan',      'Dashboard chi phí ' + year],
    congtrinh: ['Công Trình',     P.length + ' công trình · ' + act + ' đang thi công'],
    detail:    [sel ? sel.name : '—', sel ? (sel.chuDauTu || 'Chưa có chủ đầu tư') : ''],
    nhap:      ['Nhập Hóa Đơn',   'Chi phí công trình'],
    chamcong:  ['Chấm Công',      'Sổ công & lương tuần'],
    tienung:   ['Tiền Ứng',       'Thầu phụ · NCC · Công nhân'],
    doanhthu:  ['Thu Tiền & Lợi Nhuận', 'Thu tiền · Tiến độ thu · Lợi nhuận'],
    congno:    ['Công Nợ Đối Tác', 'Thầu phụ & Nhà cung cấp'],
    thietbi:   ['Thiết Bị & Kho', 'Kho tổng & tại công trình'],
    thongke:   ['Cơ Cấu Chi Phí', 'Chi phí theo loại'],
    more:      ['Thêm',           'Tất cả chức năng'],
  };
}

// Các màn hình nằm trong tab "Thêm" (có nút Back về 'more').
// Tiền ứng đã lên bottom nav nên KHÔNG còn ở đây; đổi lại Tổng quan rời nav
// xuống đây để vẫn xem được.
// (27/10/2026) Bỏ Quyết toán / Danh mục / Thùng rác khỏi điện thoại — làm trên máy tính.
const MB_MORE_TABS = ['dashboard', 'doanhthu', 'congno', 'thietbi', 'thongke'];

// Bottom nav: [id, nhãn, icon Material Symbols] — 5 mục, "Nhập chi phí" đặt giữa cho dễ bấm
const MB_NAV = [
  ['congtrinh', 'Công trình', 'home_work'],
  ['chamcong',  'Chấm công', 'calendar_month'],
  ['nhap',      'Nhập chi phí', 'add_circle'],
  ['tienung',   'Tiền ứng',  'payments'],
  ['more',      'Thêm',      'menu'],
];

// Tab con của từng màn hình: [khóa state, [[id, nhãn], ...]]
// (27/10/2026) Công nợ không còn tab con — vào thẳng danh sách công nợ & tất toán.
const MB_SEGS = {
  detail:   ['detail',   [['tong', 'Tổng quan'], ['chi', 'Chi phí'], ['cc', 'Chấm công'], ['ung', 'Tiền ứng']]],
  nhap:     ['nhap',     [['nhanh', 'Nhập hóa đơn'], ['tatca', 'Lịch sử hóa đơn']]],
  chamcong: ['chamcong', [['so', 'Sổ chấm công'], ['baocao', 'Tổng lương'], ['ung', 'Ứng công nhân']]],
  tienung:  ['tienung',  [['nhap', 'Nhập ứng'], ['thongke', 'Thống kê ứng']]],
  doanhthu: ['doanhthu', [['thu', 'Thu tiền'], ['thongke', 'Tiến độ thu'], ['loinhuan', 'Lợi nhuận']]],
};

/** Chuyển màn hình */
function mbGo(tab, extra) {
  if (!mbCanSee(tab)) { mbToast('Vai trò của bạn không xem được mục này', 'error'); return; }
  MB.tab = tab;
  MB.yearOpen = false;
  if (extra) Object.assign(MB, extra);
  // Rời khỏi màn chi tiết → bỏ công trình đang chọn
  if (tab !== 'detail' && !(extra && extra.projectId)) MB.projectId = null;
  mbSyncHash();
  mbRender();
  const body = document.getElementById('mb-body');
  if (body) body.scrollTop = 0;
}

/** Mở màn chi tiết một công trình */
function mbOpenProject(pid) {
  mbGo('detail', { projectId: pid, pdSearch: '', pdLoai: '', seg: Object.assign({}, MB.seg, { detail: 'tong' }) });
}

/** Đổi tab con */
function mbSeg(screen, id) {
  MB.seg[screen] = id;
  mbRender();
  const body = document.getElementById('mb-body');
  if (body) body.scrollTop = 0;
}

// ── Hash router — dùng namespace riêng #/m/<tab> để không đụng router desktop ──
function mbSyncHash() {
  const want = '#/m/' + MB.tab + (MB.tab === 'detail' && MB.projectId ? '/' + MB.projectId : '');
  if (location.hash !== want) location.hash = want;
}

function mbRouteFromHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  if (!raw.startsWith('m/')) return;                 // không phải hash mobile → bỏ qua
  const parts = raw.slice(2).split('/');
  const tab   = parts[0];
  if (!mbTitles()[tab] || !mbCanSee(tab)) return;
  if (MB.tab === tab && (tab !== 'detail' || MB.projectId === (parts[1] || null))) return;
  MB.tab = tab;
  MB.projectId = (tab === 'detail') ? (parts[1] || null) : null;
  mbRender();
}

// ══════════════════════════════════════════════════════════════
//  RENDER SHELL
// ══════════════════════════════════════════════════════════════

/** Render lại toàn bộ shell (header + năm + tab con + nội dung + nav) */
function mbRender() {
  if (!MB.on || !MB.ready) return;

  // Giữ nguyên ô đang gõ: nhớ id + vị trí con trỏ trước khi thay HTML
  const act    = document.activeElement;
  const focusId = (act && act.id && act.closest && act.closest('#mb-shell')) ? act.id : null;
  const selStart = focusId && 'selectionStart' in act ? act.selectionStart : null;

  mbRenderHeader();
  mbRenderYears();
  mbRenderSubtabs();
  mbRenderBody();
  mbRenderNav();

  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus();
      if (selStart != null && 'setSelectionRange' in el) {
        try { el.setSelectionRange(selStart, selStart); } catch (e) { /* input type không hỗ trợ */ }
      }
    }
  }
}

function mbRenderHeader() {
  const el = document.getElementById('mb-header');
  if (!el) return;
  const t        = mbTitles()[MB.tab] || ['', ''];
  const showBack = MB.tab === 'detail' || MB_MORE_TABS.includes(MB.tab);
  const pending  = mbPending();
  // Chọn nhiều năm → liệt kê hết ("2024, 2025, 2026"), giống nút năm của desktop
  const yearLbl  = mbYearLabel();

  el.innerHTML =
    (showBack
      ? `<div class="mb-back" data-act="back">
           <svg width="8" height="13" viewBox="0 0 8 13"><path d="M7 1L1 6.5L7 12" stroke="#374151" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
         </div>`
      : '') +
    `<div class="mb-head-txt">
       <div class="mb-head-title">${mbX(t[0])}</div>
       <div class="mb-head-sub">${mbX(t[1])}</div>
     </div>
     <button class="mb-year-btn" data-act="toggleYear">
       <span>${mbX(yearLbl)}</span>
       <svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" stroke="#6B7280" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>
     </button>
     <button class="mb-sync-btn${pending > 0 ? ' has-pending' : ''}" data-act="sync" title="Đồng bộ">
       <svg width="15" height="15" viewBox="0 0 16 16"><path d="M14 8a6 6 0 1 1-1.8-4.3M14 1v3h-3" stroke="${pending > 0 ? '#B45309' : '#16A34A'}" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
       ${pending > 0 ? `<span class="mb-sync-badge">${pending}</span>` : ''}
     </button>`;
}

function mbRenderYears() {
  const el = document.getElementById('mb-years');
  if (!el) return;
  if (!MB.yearOpen) { el.style.display = 'none'; return; }
  el.style.display = 'flex';

  // Gom các năm có dữ liệu (giống buildYearSelect của desktop) + năm hiện tại
  const years = new Set([new Date().getFullYear()]);
  const addY = (arr, f) => (arr || []).forEach(r => { if (r && r[f]) years.add(parseInt(String(r[f]).slice(0, 4))); });
  if (typeof invoices   !== 'undefined') addY(invoices,   'ngay');
  if (typeof ungRecords !== 'undefined') addY(ungRecords, 'ngay');
  if (typeof ccData     !== 'undefined') addY(ccData,     'fromDate');
  if (typeof thuRecords !== 'undefined') addY(thuRecords, 'ngay');
  const list = [...years].filter(y => y > 1990).sort((a, b) => b - a);

  // Chọn NHIỀU năm: mỗi chip là một công tắc bật/tắt độc lập, dữ liệu các năm
  // đang bật được gộp lại. Chip "Tất cả" = bỏ lọc năm (activeYears rỗng).
  const isAll = (typeof activeYears !== 'undefined') && activeYears.size === 0;
  el.innerHTML =
    `<div class="mb-year-chip${isAll ? ' on' : ''}" data-act="pickYear" data-arg="0">Tất cả</div>` +
    list.map(y => {
      const on = (typeof activeYears !== 'undefined') && activeYears.has(y);
      return `<div class="mb-year-chip${on ? ' on' : ''}" data-act="pickYear" data-arg="${y}">${y}</div>`;
    }).join('');
}

function mbRenderSubtabs() {
  const el = document.getElementById('mb-subtabs');
  if (!el) return;
  const def = MB_SEGS[MB.tab];
  if (!def) { el.style.display = 'none'; return; }
  const [key, items] = def;
  el.style.display = 'flex';
  el.innerHTML = items.map(([id, label]) =>
    `<div class="mb-subtab${MB.seg[key] === id ? ' on' : ''}" data-act="seg" data-arg="${key}|${id}">${mbX(label)}</div>`
  ).join('');
}

function mbRenderBody() {
  const el = document.getElementById('mb-body');
  if (!el) return;
  let html = '';
  try {
    html = mbScreen(MB.tab);            // định nghĩa trong mobile.screens.js
  } catch (err) {
    console.error('[mobile] Lỗi render màn hình', MB.tab, err);
    html = `<div class="mb-pad"><div class="mb-empty">Không hiển thị được màn hình này.<br><span style="font-size:11px">${mbX(err && err.message)}</span></div></div>`;
  }
  el.innerHTML = html;
}

function mbRenderNav() {
  const el = document.getElementById('mb-nav');
  if (!el) return;
  const active = MB.tab === 'detail' ? 'congtrinh'
    : (MB_MORE_TABS.includes(MB.tab) ? 'more' : MB.tab);
  el.innerHTML = MB_NAV.filter(([id]) => mbCanSee(id)).map(([id, label, icon]) =>
    `<div class="mb-nav-item${active === id ? ' on' : ''}" data-act="go" data-arg="${id}">
       <div class="mb-nav-icon"><span class="material-symbols-outlined" style="font-size:20px">${icon}</span></div>
       <div class="mb-nav-label">${mbX(label)}</div>
     </div>`
  ).join('');
}

/** Toast — dùng lại #toast của desktop để thống nhất trải nghiệm */
function mbToast(msg, type) {
  if (typeof toast === 'function') toast(msg, type || '');
  else alert(msg);
}

// ══════════════════════════════════════════════════════════════
//  SỰ KIỆN — ủy quyền (event delegation) trên toàn shell
//  Mọi phần tử tương tác chỉ cần data-act="tên" data-arg="tham số"
//  Mọi ô nhập chỉ cần data-in="đường.dẫn.trong.MB"
// ══════════════════════════════════════════════════════════════
function mbBindEvents() {
  const shell = document.getElementById('mb-shell');
  if (!shell || shell.dataset.bound === '1') return;
  shell.dataset.bound = '1';

  shell.addEventListener('click', ev => {
    const el = ev.target.closest('[data-act]');
    if (!el || !shell.contains(el)) return;
    const act = el.dataset.act;
    const arg = el.dataset.arg;
    const fn  = MB_ACTS[act];
    if (!fn) { console.warn('[mobile] Không có hành động:', act); return; }
    ev.preventDefault();
    fn(arg, el, ev);
  });

  // Ô nhập text/number → cập nhật state, KHÔNG render lại (tránh giật khi gõ)
  // Ô tiền (data-money="1") → tự phân cách hàng nghìn "1.500.000" ngay khi gõ
  shell.addEventListener('input', ev => {
    const el = ev.target.closest('[data-in]');
    if (!el) return;
    if (el.dataset.money === '1') mbFormatMoneyInput(el);
    mbSetPath(el.dataset.in, el.value);
    if (el.dataset.live === '1') mbRender();   // ô cần tính lại ngay (vd: thành tiền)
  });

  // Select / date → cập nhật rồi render lại
  // data-onchange="tên hành động" → gọi thêm MB_ACTS[tên](data-arg) sau khi ghi state
  shell.addEventListener('change', ev => {
    const el = ev.target.closest('[data-in]');
    if (!el) return;
    mbSetPath(el.dataset.in, el.value);
    const hook = el.dataset.onchange && MB_ACTS[el.dataset.onchange];
    if (hook) { hook(el.dataset.arg, el); return; }
    if (el.tagName === 'SELECT' || el.type === 'date') mbRender();
  });
}

// Bảng hành động — mobile.actions.js sẽ bổ sung thêm các hành động ghi dữ liệu
const MB_ACTS = {
  go:   (arg) => mbGo(arg),
  seg:  (arg) => { const [k, v] = arg.split('|'); mbSeg(k, v); },
  back: () => {
    if (MB.tab === 'detail') mbGo('congtrinh');
    else mbGo('more');
  },
  toggleYear: () => { MB.yearOpen = !MB.yearOpen; mbRender(); },
  // Bật/tắt một năm. Dùng lại đúng hàm multi-select của desktop:
  //   onYearToggle(y) — thêm/bớt y khỏi activeYears rồi gọi onYearChange()
  //   yearQuickAll()  — xóa hết bộ lọc ("Tất cả")
  // onYearChange() tự lo kéo dữ liệu năm còn thiếu từ Firebase rồi
  // renderActiveTab() → ở mobile nhánh này chỉ gọi mbRender().
  // Dải chọn năm CỐ Ý không đóng lại, để bấm chọn tiếp năm khác.
  pickYear: (arg) => {
    const y = parseInt(arg, 10);
    MB.ccWorkers = null;                       // đổi năm → bỏ nháp chấm công
    if (y === 0) {
      if (typeof yearQuickAll === 'function') yearQuickAll();
    } else if (typeof onYearToggle === 'function') {
      onYearToggle(y);
    }
    if (typeof buildYearSelect === 'function') buildYearSelect();
    mbRender();
  },
  sync: async () => {
    if (typeof manualSync !== 'function') { mbToast('Chưa sẵn sàng đồng bộ', 'error'); return; }
    await manualSync();
    if (typeof _reloadGlobals === 'function') _reloadGlobals();
    MB.ccWorkers = null;
    mbRender();
  },
  openProject: (arg) => mbOpenProject(arg),
  logout: () => { if (typeof logout === 'function') logout(); },
  useDesktop: () => {
    localStorage.setItem(MB_FORCE_KEY, '1');
    location.hash = '';
    location.reload();
  },
  noop: () => {},
};

// ══════════════════════════════════════════════════════════════
//  KHỞI ĐỘNG
// ══════════════════════════════════════════════════════════════

/** Nạp khung shell từ pages/mobile/mobile.html vào #mb-shell */
async function loadMobilePartials() {
  const shell = document.getElementById('mb-shell');
  if (!shell) { console.error('[mobile] Thiếu #mb-shell trong index.html'); return false; }
  if (shell.dataset.loaded === '1') return true;
  try {
    const res = await fetch('pages/mobile/mobile.html', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    shell.innerHTML = await res.text();
    shell.dataset.loaded = '1';
    return true;
  } catch (e) {
    console.error('[mobile] Không nạp được khung mobile', e);
    return false;
  }
}

// Các listener chỉ được gắn MỘT lần cho cả vòng đời trang, kể cả khi
// người dùng chuyển qua lại giữa hai giao diện nhiều lần.
let _mbHashWired = false;

/**
 * Bật giao diện điện thoại. Gọi từ main.js SAU init() để chắc chắn
 * dữ liệu, migration và phân quyền đã sẵn sàng.
 * Gọi lại được nhiều lần (khi người dùng thu nhỏ cửa sổ trở lại).
 */
async function initMobile() {
  if (MB.on) return;
  if (!(await loadMobilePartials())) return;

  MB.on = true;
  MB.ready = true;
  document.body.classList.add('mb-on');

  // Giá trị mặc định cho các form (chỉ đặt lần đầu — lần bật lại giữ nguyên
  // những gì người dùng đang nhập dở)
  const today = mbToday();
  if (!MB.form.ngay)       MB.form.ngay       = today;
  if (!MB.ungForm.ngay)    MB.ungForm.ngay    = today;
  if (!MB.dtForm.ngay)     MB.dtForm.ngay     = today;
  if (!MB.hdtpForm.ngay)   MB.hdtpForm.ngay   = today;
  if (!MB.ccUngForm.ngay)  MB.ccUngForm.ngay  = today;

  // Kế toán không vào được Tổng quan → mở thẳng Công trình
  if (!mbCanSee(MB.tab)) MB.tab = 'congtrinh';

  mbBindEvents();
  if (!_mbHashWired) {
    _mbHashWired = true;
    window.addEventListener('hashchange', mbRouteFromHash);
  }
  mbRouteFromHash();
  mbSyncHash();
  mbRender();
}

// Màn hình mobile ↔ tab desktop tương ứng (dùng khi rời giao diện điện thoại)
const MB_TO_DESKTOP = {
  dashboard: 'dashboard', congtrinh: 'congtrinh', detail: 'congtrinh',
  nhap: 'nhap', chamcong: 'chamcong', tienung: 'nhapung',
  doanhthu: 'doanhthu', congno: 'congno', thietbi: 'thietbi', thongke: 'thongkecphd',
  more: 'congtrinh',
};

/**
 * Tắt lớp phủ mobile, trả quyền hiển thị cho giao diện desktop — KHÔNG reload.
 * Làm được vì DOM desktop luôn tồn tại song song, chỉ bị CSS `body.mb-on` ẩn đi.
 * Giữ nguyên state MB nên thu nhỏ cửa sổ lại là quay về đúng chỗ đang xem.
 */
function mbExitMobile() {
  if (!MB.on) return;
  MB.on = false;
  MB.yearOpen = false;
  document.body.classList.remove('mb-on');

  // Mở tab desktop tương ứng. Nếu vai trò hiện tại không được xem tab đó
  // (nút nav bị applyRoleUI ẩn) thì lùi về Công Trình.
  let id  = MB_TO_DESKTOP[MB.tab] || 'congtrinh';
  const btn = document.querySelector('.nav-btn[data-page="' + id + '"]');
  if (!btn || btn.style.display === 'none') id = 'congtrinh';

  if (typeof goPage === 'function') goPage(null, id);
  location.hash = '#/' + id;     // đổi hash SAU khi đã mở tab → _routeFromHash() không làm lại
}

/**
 * Theo dõi bề rộng màn hình để tự chuyển giữa hai giao diện.
 * - Điện thoại thật: gần như không bao giờ kích hoạt (viewport cố định).
 * - Trên máy tính: kéo hẹp/rộng cửa sổ Chrome là đổi ngay, không cần F5.
 * Gọi một lần từ main.js sau init().
 */
function mbWatchViewport() {
  const mq = window.matchMedia(MB_BREAKPOINT);
  const onChange = () => {
    // Người dùng đã chủ động chọn "Mở bản máy tính" → tôn trọng, không tự ép lại
    if (localStorage.getItem(MB_FORCE_KEY) === '1') return;
    if (typeof getCurrentUser === 'function' && !getCurrentUser()) return;
    if (mq.matches && !MB.on)      initMobile();
    else if (!mq.matches && MB.on) mbExitMobile();
  };
  // addListener: bản Safari/iOS cũ chưa hỗ trợ addEventListener trên MediaQueryList
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);
}

/** Cho phép quay lại giao diện mobile sau khi đã ép desktop */
function mbEnableMobile() {
  localStorage.removeItem(MB_FORCE_KEY);
  location.reload();
}
