// quyettoan.core.js — Lõi tính toán Quyết Toán + Doanh Thu (nguồn DUY NHẤT của công thức)
// Load order: sau doanhthu.congno.js, trước quyettoan.congtrinh.js
//
// NGUYÊN TẮC: "tách code, KHÔNG tách dữ liệu"
//   • Dữ liệu vẫn nằm ở kho cũ `quyettoan_v1` (biến global quyetToanRecords khai báo
//     trong doanhthu.core.js) → đồng bộ cloud qua doc meta_hop_dong như trước.
//   • File này KHÔNG ghi dữ liệu, chỉ ĐỌC và TÍNH. Tab Doanh Thu, Lợi Nhuận, chi tiết
//     Công Trình và tab Quyết Toán đều gọi các hàm ở đây → không bao giờ lệch số.
//
// 3 LOẠI QUYẾT TOÁN (trường `loai` của bản ghi quyettoan_v1):
//   • 'tang'    — Phát sinh tăng : giaTri lưu SỐ DƯƠNG, cộng vào doanh thu
//   • 'giam'    — Phát sinh giảm : giaTri lưu SỐ ÂM,   trừ khỏi doanh thu
//   • 'thaythe' — Thay thế       : giaTri lưu SỐ DƯƠNG = tổng doanh thu MỚI của công trình
//                                  (vô hiệu hóa HĐ gốc + mọi phát sinh TRƯỚC nó)
//   Bản ghi cũ (chưa có `loai`) → tự hiểu theo dấu: âm = giảm, dương = tăng.
//
// QUY TẮC THAY THẾ (đã thống nhất với người dùng):
//   • Nhiều bản thay thế → bản MỚI NHẤT (theo ngày, rồi thời điểm tạo) thắng.
//   • Tăng/giảm có ngày SAU bản thay thế vẫn được cộng/trừ tiếp.
//
// CÁCH TÍNH "ẢNH HƯỞNG" (delta) CỦA TỪNG BẢN GHI:
//   Duyệt toàn bộ quyết toán của công trình theo thứ tự thời gian, bắt đầu từ HĐ gốc:
//     tăng    → delta = +số tiền
//     giảm    → delta = −số tiền
//     thay thế → delta = số tiền thay thế − doanh thu tích lũy ngay trước nó
//   Nhờ quy đổi ra delta, doanh thu theo TỪNG NĂM vẫn cộng dồn đúng: tổng các năm
//   = doanh thu toàn vòng đời (HĐ gốc + Σ delta).

// ── Danh mục loại quyết toán (nhãn + màu dùng chung cho mọi giao diện) ──
const QT_LOAI = {
  tang:    { label: 'Phát sinh tăng', short: 'Tăng',     icon: 'trending_up',   badge: 'bg-success', color: 'var(--bs-success)' },
  giam:    { label: 'Phát sinh giảm', short: 'Giảm',     icon: 'trending_down', badge: 'bg-danger',  color: 'var(--bs-danger)'  },
  thaythe: { label: 'Thay thế HĐ',    short: 'Thay thế', icon: 'swap_horiz',    badge: 'bg-primary', color: 'var(--bs-primary)' },
};

// ── Loại của 1 bản ghi (bản ghi cũ không có `loai` → suy theo dấu giaTri) ──
function qtLoaiOf(r) {
  if (r && QT_LOAI[r.loai]) return r.loai;
  return (r && (r.giaTri || 0) < 0) ? 'giam' : 'tang';
}

// ── Số tiền người dùng đã nhập (luôn dương, không dấu) ──
function qtSoTien(r) {
  return Math.abs((r && r.giaTri) || 0);
}

// ── Chuẩn hóa giaTri để LƯU theo loại (giảm → âm, còn lại → dương) ──
function qtGiaTriLuu(loai, soTien) {
  const v = Math.abs(soTien || 0);
  return loai === 'giam' ? -v : v;
}

// ── Badge HTML hiển thị loại (dùng ở bảng lịch sử, bảng Khai Báo, Thống Kê) ──
function qtLoaiBadge(r) {
  const L = QT_LOAI[qtLoaiOf(r)];
  const lock = r && r.chot ? ' <span class="material-symbols-outlined" style="font-size:12px;vertical-align:-2px" title="Quyết toán cuối cùng — đã đóng công trình">lock</span>' : '';
  return `<span class="badge ${L.badge}" style="font-size:10px"><span class="material-symbols-outlined msi-gap">${L.icon}</span>${L.short}${lock}</span>`;
}

// ── Chuỗi số tiền theo loại: tăng "+50.000.000 đ", giảm "-20.000.000 đ", thay thế "= 1.200.000.000 đ" ──
// fmt: hàm format số (mặc định fmtM — đầy đủ; truyền fmtS để rút gọn "1.2 tỷ")
function qtSoTienTxt(r, fmt) {
  fmt = fmt || fmtM;
  const loai = qtLoaiOf(r);
  const v = qtSoTien(r);
  if (loai === 'thaythe') return '= ' + fmt(v);
  return (loai === 'giam' ? '-' : '+') + fmt(v);
}

// ── Class màu chữ theo loại (tăng xanh lá / giảm đỏ / thay thế xanh dương) ──
function qtSoTienCls(r) {
  const loai = qtLoaiOf(r);
  return loai === 'giam' ? 'text-danger' : (loai === 'thaythe' ? 'text-primary' : 'text-success');
}

// ── Lấy object công trình từ id / tên / object ──
function _qtResolveProj(pOrId) {
  if (!pOrId) return null;
  if (typeof pOrId === 'object') return pOrId;
  const all = (typeof getAllProjects === 'function') ? getAllProjects() : [];
  return all.find(p => p.id === pOrId) || all.find(p => p.name === pOrId) || null;
}

// ── 1 bản ghi (quyết toán / thu tiền) có thuộc công trình p không ──
// Ưu tiên projectId; bản ghi cũ chưa có projectId thì so theo tên.
function _qtMatchProj(rec, p) {
  if (!rec || !p) return false;
  if (rec.projectId) return rec.projectId === p.id;
  const nm = (typeof resolveProjectName === 'function') ? resolveProjectName(rec) : '';
  return nm === p.name || rec.congtrinh === p.name;
}

// ── Sắp xếp theo thời gian: ngày tăng dần, cùng ngày thì bản tạo trước đứng trước ──
function _qtSortAsc(a, b) {
  return (a.ngay || '').localeCompare(b.ngay || '') || ((a.createdAt || 0) - (b.createdAt || 0));
}

// ── HĐ gốc của công trình = giaTri + giaTriphu + phatSinh (legacy) ──
// inScope(ngay) → true nếu tính HĐ đó (lọc theo năm); bỏ trống = toàn vòng đời.
function qtHdGocCuaCT(p, inScope) {
  p = _qtResolveProj(p);
  if (!p || typeof hopDongData === 'undefined') return 0;
  const allProjs = (typeof projects !== 'undefined') ? projects : [];
  let total = 0;
  Object.entries(hopDongData).forEach(([keyId, hd]) => {
    if (!hd || hd.deletedAt) return;
    if (inScope && !inScope(hd.ngay)) return;
    // Key có thể là projectId (chuẩn) hoặc tên CT (legacy)
    const _p = allProjs.find(pr => pr.id === keyId);
    const ctName = _p ? _p.name : keyId;
    if (keyId === p.id || ctName === p.name || (hd.projectId && hd.projectId === p.id)) {
      total += (hd.giaTri || 0) + (hd.giaTriphu || 0) + (hd.phatSinh || 0);
    }
  });
  return total;
}

// ── Danh sách quyết toán của công trình + delta từng bản ghi (toàn vòng đời) ──
// opts.excludeId : bỏ qua 1 bản ghi (dùng khi đang SỬA — xem trước giá trị mới)
// opts.extra     : thêm 1 bản ghi giả định (dùng cho Live Preview trước khi Lưu)
// Trả về: { recs (đã sắp xếp), deltas: Map(id → delta), coThayThe, dtCuoi }
function qtTinhDelta(p, opts) {
  opts = opts || {};
  p = _qtResolveProj(p);
  const list = (typeof quyetToanRecords !== 'undefined' ? quyetToanRecords : [])
    .filter(r => !r.deletedAt && _qtMatchProj(r, p) && r.id !== opts.excludeId);
  if (opts.extra) list.push(opts.extra);
  list.sort(_qtSortAsc);

  let dt = qtHdGocCuaCT(p);          // điểm xuất phát: HĐ gốc toàn vòng đời
  let coThayThe = false;
  const deltas = new Map();
  list.forEach(r => {
    const loai = qtLoaiOf(r);
    let d;
    if (loai === 'thaythe') { d = qtSoTien(r) - dt; coThayThe = true; }
    else if (loai === 'giam') d = -qtSoTien(r);
    else d = qtSoTien(r);
    dt += d;
    deltas.set(r.id, d);
  });
  return { recs: list, deltas, coThayThe, dtCuoi: dt };
}

// ── Tổng đã thu của công trình (inScope: lọc theo năm, bỏ trống = toàn vòng đời) ──
function qtDaThuCuaCT(p, inScope) {
  p = _qtResolveProj(p);
  if (!p || typeof thuRecords === 'undefined') return 0;
  return thuRecords
    .filter(r => !r.deletedAt && (!inScope || inScope(r.ngay)) && _qtMatchProj(r, p))
    .reduce((s, r) => s + (r.tien || 0), 0);
}

// ── Tổng hợp quyết toán của công trình trong phạm vi (năm đang lọc / toàn bộ) ──
// Trả về { qt (Σ delta), tang, giam (số âm), thayThe (Σ delta của bản thay thế), coThayThe, soBan }
// coThayThe tính trên TOÀN VÒNG ĐỜI (đã từng thay thế thì bỏ quy tắc max — xem _dtCalcRevenue).
function qtTongQuyetToan(p, inScope, opts) {
  const { recs, deltas, coThayThe } = qtTinhDelta(p, opts);
  const out = { qt: 0, tang: 0, giam: 0, thayThe: 0, coThayThe, soBan: 0 };
  recs.forEach(r => {
    if (inScope && !inScope(r.ngay)) return;
    const d = deltas.get(r.id) || 0;
    const loai = qtLoaiOf(r);
    out.qt += d;
    out.soBan++;
    if (loai === 'thaythe') out.thayThe += d;
    else if (loai === 'giam') out.giam += d;
    else out.tang += d;
  });
  return out;
}

// ══ HÀM CHÍNH: TỔNG DOANH THU CỦA 1 CÔNG TRÌNH ═══════════════════
// opts.allYears : true → tính toàn vòng đời; mặc định theo năm đang lọc (_dtInYear)
// opts.excludeId / opts.extra : xem qtTinhDelta (phục vụ Live Preview)
// Trả về: { hdGoc, daThu, qt, tang, giam, thayThe, coThayThe, tongDT, conPhaiThu }
function calcTongDoanhThu(pOrId, opts) {
  opts = opts || {};
  const p = _qtResolveProj(pOrId);
  const empty = { hdGoc: 0, daThu: 0, qt: 0, tang: 0, giam: 0, thayThe: 0, coThayThe: false, tongDT: 0, conPhaiThu: 0 };
  if (!p) return empty;

  const inScope = opts.allYears ? null
    : (ngay => (typeof _dtInYear === 'function') ? _dtInYear(ngay) : true);

  const hdGoc = qtHdGocCuaCT(p, inScope);
  const daThu = qtDaThuCuaCT(p, inScope);
  const q     = qtTongQuyetToan(p, inScope, opts);
  const tongDT = (typeof _dtCalcRevenue === 'function')
    ? _dtCalcRevenue(hdGoc, daThu, q.qt, q.coThayThe)
    : hdGoc + q.qt;

  return {
    hdGoc, daThu,
    qt: q.qt, tang: q.tang, giam: q.giam, thayThe: q.thayThe, coThayThe: q.coThayThe,
    tongDT,
    conPhaiThu: tongDT - daThu,
  };
}

// ══ THEO NĂM ĐANG LỌC (02/10/2026) ══════════════════════════════════
// Tab QUYẾT TOÁN tuân thủ bộ lọc năm như các tab khác: KHÔNG tự tải toàn bộ các năm.
// (Trước đây có qtEnsureAllYears() tự pull mọi năm khi mở tab — đã gỡ theo yêu cầu.)

// Công trình có thuộc năm đang lọc không (theo tên — cùng quy tắc dropdown tab Doanh Thu)
function qtCtInYear(name) {
  if (typeof activeYear !== 'undefined' && activeYear === 0) return true;          // "Tất cả năm"
  if (typeof activeYears !== 'undefined' && activeYears && activeYears.size === 0) return true;
  return (typeof _ctInActiveYear === 'function') ? _ctInActiveYear(name) : true;
}

// Các năm có thể đã phát sinh dữ liệu: từ năm sớm nhất trong dữ liệu "meta" (HĐ chính,
// HĐ thầu phụ, quyết toán, ngày công trình — luôn có đủ trong máy) tới năm hiện tại.
function _qtCandidateYears() {
  const ys = new Set();
  const add = (d) => { const y = parseInt(String(d || '').slice(0, 4)); if (y >= 2000 && y <= 2100) ys.add(y); };
  Object.values(typeof hopDongData !== 'undefined' ? hopDongData : {}).forEach(h => add(h && h.ngay));
  (typeof thauPhuContracts !== 'undefined' ? thauPhuContracts : []).forEach(r => add(r.ngay));
  (typeof quyetToanRecords !== 'undefined' ? quyetToanRecords : []).forEach(r => add(r.ngay));
  (typeof projects !== 'undefined' ? projects : []).forEach(p => { add(p.startDate); add(p.endDate); add(p.closedDate); });
  const now = new Date().getFullYear();
  ys.add(now);
  const min = Math.min(...ys), max = Math.max(...ys);
  const out = [];
  for (let y = min; y <= max; y++) out.push(String(y));
  return out;
}

// Năm CHƯA có dữ liệu trong máy (chưa tải trong phiên + không có sẵn trong bộ nhớ máy).
// Chỉ dùng để CẢNH BÁO ở popup tất toán — không tự tải.
function qtMissingYears() {
  const have = new Set();
  if (typeof _pulledYearsThisSession !== 'undefined') _pulledYearsThisSession.forEach(y => have.add(String(y)));
  if (typeof _getAllLocalYears === 'function') _getAllLocalYears().forEach(y => have.add(String(y)));
  return _qtCandidateYears().filter(y => !have.has(y));
}

// Cấp ra global (để file khác / mobile gọi được)
window.calcTongDoanhThu = calcTongDoanhThu;
window.qtCtInYear       = qtCtInYear;
window.qtTongQuyetToan  = qtTongQuyetToan;
