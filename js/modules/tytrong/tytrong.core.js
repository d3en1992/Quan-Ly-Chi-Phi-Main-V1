// tytrong.core.js — Tab TỈ TRỌNG & ĐỊNH MỨC · phần TÍNH TOÁN THUẦN (không đụng giao diện)
// Load order: sau quyettoan.congtrinh.js (dùng _qtProjList), trước tytrong.ui.js
//
// (27/10/2026 — Tái cấu trúc 3.0, xem KE_HOACH_TAI_CAU_TRUC_TAB_TI_TRONG.md)
//   BỎ 100% khái niệm "Giai đoạn & Hạng mục" và "Rổ 1/2/3". Chi phí chỉ còn 1 chiều: 4 NHÓM CHI PHÍ
//     1 = Phần thô & Nhân công hoàn thiện (gói cốt lõi — chuẩn tính đ/m2 báo giá, chia 4 TRỤ CỘT + Quỹ phụ phí)
//     2 = Vật tư & Thi công hoàn thiện   (gạch ốp lát, TBVS, đèn, cửa, TP điện nước / thạch cao / sơn…)
//     3 = Nội thất & Tiện ích bổ sung    (đồ gỗ, thang máy, điện mặt trời, sân vườn, hồ bơi…)
//     4 = Chi phí khác ngoài gói chính   (thiết kế - xin phép, ép cọc, phát sinh chủ nhà, máy móc công ty…)
//     0 = Chưa xếp nhóm (nút cảnh báo đỏ — phải xử lý)
//
// ── DỮ LIỆU (store 'tytrong_v1' → doc cloud riêng 'meta_ty_trong') ──────────
//   • Mỗi công trình 01 bản ghi (mkRecord / mkUpdate): { id, projectId,
//       nhomTay:  { <khóa khoản chi>: 1|2|3|4 },   // gán TAY (đổi nhóm 1-click / gán hàng loạt)
//       theoHdtp: { <id HĐ thầu phụ>: { nhom } },  // mọi khoản của thầu phụ đó đi theo nhóm đã chọn
//       ...meta }
//     Bản ghi cũ còn giaiDoan / hangMuc / phanBo / luat / roTay — KHÔNG dùng nữa, để nguyên (không xóa dữ liệu).
//   • 1 bản ghi CẤU HÌNH dùng chung mọi công trình — kind:'cauhinh' (không projectId):
//       { nhomLoai: { <tên loại không dấu>: 0..4 }, nhomLuat: [{ id, loai, tuKhoa, nhom }],
//         truLoai: { <tên loại không dấu>: 'sat'|'bt'|'nc'|'tp'|'quy'|'' }, quyMuc }
//   • BỘ ĐỊNH MỨC — bản ghi kind:'dinhmuc' (không projectId): { ten, nguonPid, nguonTen, nam, tongSan, tongChi,
//       dgTong, dgLoai, dgNhom: {1..4: đ/m2}, dgRo1 (= Nhóm 1 ÷ sàn), ro1: { sat, bt, nc, tp, quy, khac }, nhapTay }
//     ⚠ Tên trường dgRo1 / ro1 giữ như cũ để định mức đã lưu vẫn dùng được (4 trụ cột không đổi) — nghĩa là NHÓM 1.
//   ⚠️ KHÔNG ghi gì vào hóa đơn / tiền ứng: mọi phân nhóm chỉ nằm trong store này (khóa = loại + id bản ghi gốc).
//
// ── CHUYỂN ĐỔI DỮ LIỆU RỔ CŨ (tự động khi đọc — _tytRoCuSangNhom) ──
//   Rổ 1 → Nhóm 1 · Rổ 3 (chi phí công ty) → Nhóm 4 · Rổ 2 (chủ nhà & ngoài gói) → đoán theo chữ
//   (gạch ốp / đèn… → 2, thang máy / nội thất… → 3, còn lại → 4). Ghi lại theo tên trường mới khi người dùng sửa.
//
// ── TỔNG CHI PHÍ = TIỀN CHI THỰC TẾ (khớp _ctTongChi ở projects.ui.js = số trên thẻ công trình) ──
//   = hóa đơn (kể cả nhân công từ chấm công) + ứng thầu phụ + ứng NCC
//     − hóa đơn của các NCC đã có ứng (vì đã tính bằng tiền ứng, tránh đếm 2 lần)
//   Mặc định TRỌN VÒNG ĐỜI công trình (bỏ qua bộ lọc năm); tắt công tắc → theo năm đang lọc.

// ─── Biến global (nạp lại ở _reloadGlobals / _refreshGlobal sau khi sync) ───
let tyTrongRecords = load('tytrong_v1', []);

const TYT_LOAI_UNG_TP   = 'Thầu Phụ';           // nhóm loại cho tiền ứng thầu phụ
const TYT_LOAI_UNG_NCC  = 'Ứng Nhà Cung Cấp';   // dự phòng khi không đoán được loại của NCC
const TYT_LOAI_KHAC     = 'Chi Phí Khác';       // hóa đơn thiếu loại

// Id ngắn (chỉ cần duy nhất trong danh sách chứa nó)
function tytNewId(prefix) {
  return (prefix || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Công trình có khớp bản ghi không — quy tắc chung toàn app: ưu tiên projectId, không có thì so tên
function _tytMatch(r, p) {
  return r.projectId ? r.projectId === p.id : r.congtrinh === p.name;
}

function _tytBoDau(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().trim();
}

// ══ BẢN GHI PHÂN NHÓM CỦA 1 CÔNG TRÌNH ═══════════════════════════════
// Lấy bản ghi còn hiệu lực MỚI NHẤT (2 máy lỡ cùng tạo → dùng bản sửa sau cùng)
function tytRecordOf(pid) {
  if (!pid) return null;
  const list = (tyTrongRecords || []).filter(r => r && !r.deletedAt && !r.kind && r.projectId === pid);
  if (!list.length) return null;
  return list.reduce((a, b) => ((b.updatedAt || 0) > (a.updatedAt || 0) ? b : a));
}

// Bản sao an toàn để sửa: { nhomTay, theoHdtp: { id: { nhom } } } — tự chuyển từ roTay / theoHdtp.ro cũ
function tytStructOf(pid) {
  const r = tytRecordOf(pid);
  let nhomTay = {};
  if (r && r.nhomTay && typeof r.nhomTay === 'object') nhomTay = { ...r.nhomTay };
  else if (r && r.roTay && typeof r.roTay === 'object') {
    Object.keys(r.roTay).forEach(k => { const n = _tytRoCuSangNhom(r.roTay[k], ''); if (n) nhomTay[k] = n; });
  }
  const theoHdtp = {};
  if (r && r.theoHdtp && typeof r.theoHdtp === 'object') {
    Object.keys(r.theoHdtp).forEach(id => {
      const v = r.theoHdtp[id] || {};
      const n = +v.nhom || _tytRoCuSangNhom(v.ro, _tytHdtpTxt(id));
      if (n) theoHdtp[id] = { nhom: n };
    });
  }
  return { nhomTay, theoHdtp };
}

// Ghi phân nhóm của 1 công trình (tạo mới nếu chưa có). changes: { nhomTay?, theoHdtp? }
function tytSaveStruct(pid, changes) {
  const cur = tytRecordOf(pid);
  if (cur) {
    const i = tyTrongRecords.findIndex(r => r.id === cur.id);
    tyTrongRecords[i] = mkUpdate(tyTrongRecords[i], changes);
  } else {
    tyTrongRecords.unshift(mkRecord({ projectId: pid, nhomTay: {}, theoHdtp: {}, ...changes }));
  }
  save('tytrong_v1', tyTrongRecords);
}

// ══ BẢNG M2 SÀN (field khoiLuong của công trình) ═════════════════════
// Mỗi dòng: { ten, dvt, kl, heSo, tinh }
//   heSo : hệ số quy đổi diện tích (VD mái/sân 0.5) — thiếu / sai → 1
//   tinh : có cộng vào "Tổng diện tích sàn" không — thiếu → có (dòng cũ vẫn tính như trước)
function tytKlNum(v) {
  const n = parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.'));
  return isFinite(n) ? n : 0;
}
function tytKlHeSo(r) {
  const n = parseFloat(r && r.heSo);
  return (isFinite(n) && n >= 0) ? n : 1;
}
function tytKlTinh(r) { return !(r && r.tinh === false); }

// Tổng diện tích sàn quy đổi = Σ (KL × hệ số) của các dòng được tính
function tytTongSanRows(rows) {
  return (rows || []).reduce((s, r) => s + (tytKlTinh(r) ? tytKlNum(r.kl) * tytKlHeSo(r) : 0), 0);
}
function tytTongSan(p) {
  return tytTongSanRows(p && Array.isArray(p.khoiLuong) ? p.khoiLuong : []);
}

// Định dạng số m2: tối đa 2 chữ số thập phân, kiểu Việt Nam
function tytFmtM2(n) {
  return (Math.round((n || 0) * 100) / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

// ══ CÁC DÒNG CHI PHÍ CẤU THÀNH TỔNG CHI THỰC TẾ ══════════════════════
// Trả về [{ key, kind, ngay, loai, nd, doiTuong, tien, items?, hdtpId? }]
//   kind: 'inv' (hóa đơn nhập tay) | 'cc' (nhân công / HĐ lẻ từ chấm công) | 'ungtp' | 'ungncc'
//   key : khóa ỔN ĐỊNH dùng cho nhomTay — 'inv:<id>' | 'ung:<id>' | 'cc|<từ ngày>|<projectId>|<đuôi>'
// Tổng các dòng = _ctTongChi(p).tongChi (xem tytTongHop → tongKhop để tự kiểm tra).
// opts.allYears = true → TRỌN VÒNG ĐỜI công trình: bỏ qua bộ lọc năm (06/10/2026 — Lần 3).
//   Dữ liệu năm khác phải đã có trong máy → tab tự tải năm còn thiếu (tytrong.ui.js _tytEnsureYears).
function tytCostLines(p, opts) {
  if (!p) return [];
  const all = !!(opts && opts.allYears);
  const _inYear = d => all || inActiveYear(d);
  // Hóa đơn của CT (gồm hóa đơn sinh từ chấm công) — cùng quy tắc _ctGetCosts, chỉ khác phần lọc năm
  const c = {
    invs: (typeof getInvoicesCached === 'function' ? getInvoicesCached() : []).filter(inv => {
      if (!inv.ngay || !_inYear(inv.ngay)) return false;
      return inv.projectId ? inv.projectId === p.id : inv.congtrinh === p.name;
    }),
  };
  const ungAll = (typeof ungRecords !== 'undefined' ? ungRecords : [])
    .filter(r => r && !r.deletedAt && _tytMatch(r, p));

  // NCC đã có tiền ứng (toàn bộ lịch sử — cùng quy tắc _ctTongChi) → hóa đơn của họ không tính
  const nccUng = new Set(ungAll.filter(r => r.loai === 'nhacungcap')
    .map(r => (r.tp || '').trim()).filter(Boolean));
  // Đếm loại chi phí của hóa đơn từng NCC → tiền ứng NCC xếp vào loại phổ biến nhất của NCC đó
  const nccLoai = {};

  const lines = [];
  (c.invs || []).forEach(inv => {
    const tien = inv.thanhtien || inv.tien || 0;
    const ncc  = (inv.ncc || '').trim();
    const loai = inv.loai || TYT_LOAI_KHAC;
    if (ncc && nccUng.has(ncc)) {
      nccLoai[ncc] = nccLoai[ncc] || {};
      nccLoai[ncc][loai] = (nccLoai[ncc][loai] || 0) + tien;
      return;
    }
    const isCC = inv.source === 'cc' || !!inv.ccKey;
    let key;
    if (isCC) {
      // id gốc 'cc|<từ ngày>|<tên CT>|<đuôi>' chứa TÊN công trình → đổi tên là đổi khóa.
      // Thay tên bằng projectId cho ổn định.
      const parts = String(inv.id).split('|');
      if (parts.length >= 4) parts[2] = inv.projectId || parts[2];
      key = parts.join('|');
    } else {
      key = 'inv:' + inv.id;
    }
    lines.push({
      key, kind: isCC ? 'cc' : 'inv', ngay: inv.ngay || '', loai,
      nd: inv.nd || '', doiTuong: ncc || inv.nguoi || '', tien,
      items: Array.isArray(inv.items) ? inv.items : null,   // món hàng — tách nhóm theo món
    });
  });

  const _topLoai = ncc => {
    const m = nccLoai[ncc];
    if (!m) return '';
    return Object.keys(m).sort((a, b) => m[b] - m[a])[0] || '';
  };
  ungAll.forEach(r => {
    if (r.loai !== 'thauphu' && r.loai !== 'nhacungcap') return;   // ứng công nhân không phải chi phí CT
    if (!r.ngay || !_inYear(r.ngay)) return;
    const isTP = r.loai === 'thauphu';
    const tp = (r.tp || '').trim();
    lines.push({
      key: 'ung:' + r.id, kind: isTP ? 'ungtp' : 'ungncc', ngay: r.ngay || '',
      loai: isTP ? TYT_LOAI_UNG_TP : (_topLoai(tp) || TYT_LOAI_UNG_NCC),
      nd: r.nd || (isTP ? 'Ứng thầu phụ' : 'Ứng nhà cung cấp'), doiTuong: tp, tien: r.tien || 0,
      hdtpId: r.hdtpId || '',   // phiếu ứng ghi từ HĐ thầu phụ (tab Công Nợ) → gắn thẳng HĐ
    });
  });

  // Mới nhất lên đầu
  lines.sort((a, b) => String(b.ngay).localeCompare(String(a.ngay)));
  return lines;
}

// ══ CÁC NĂM CỦA VÒNG ĐỜI CÔNG TRÌNH (06/10/2026 — Lần 3) ════════════════
// Từ năm sớm nhất đến năm muộn nhất xuất hiện ở: ngày bắt đầu / kết thúc / quyết toán, HĐ chính,
// HĐ thầu phụ, quyết toán, và mọi hóa đơn / tiền ứng / chấm công đang có trong máy.
// CT còn đang thi công / kế hoạch → kéo tới NĂM HIỆN TẠI. Trả về mảng năm dạng chuỗi tăng dần.
function tytNamVongDoi(p) {
  if (!p) return [];
  const ys = new Set();
  const add = d => { const y = parseInt(String(d || '').slice(0, 4)); if (y >= 2000 && y <= 2100) ys.add(y); };
  add(p.startDate); add(p.endDate); add(p.closedDate);
  if (p.createdYear) add(String(p.createdYear));
  const hd = (typeof _hdLookup === 'function') ? (_hdLookup(p.id) || _hdLookup(p.name)) : null;
  if (hd) add(hd.ngay);
  (typeof thauPhuContracts !== 'undefined' ? thauPhuContracts : []).forEach(r => { if (r && !r.deletedAt && _tytMatch(r, p)) add(r.ngay); });
  (typeof quyetToanRecords !== 'undefined' ? quyetToanRecords : []).forEach(r => { if (r && !r.deletedAt && _tytMatch(r, p)) add(r.ngay); });
  (typeof getInvoicesCached === 'function' ? getInvoicesCached() : []).forEach(r => { if (_tytMatch(r, p)) add(r.ngay); });
  (typeof ungRecords !== 'undefined' ? ungRecords : []).forEach(r => { if (r && !r.deletedAt && _tytMatch(r, p)) add(r.ngay); });
  const now = new Date().getFullYear();
  if (p.status === 'active' || p.status === 'planning' || !p.status) ys.add(now);
  if (!ys.size) ys.add(now);
  const min = Math.min(...ys), max = Math.min(Math.max(...ys), now);
  const out = [];
  for (let y = min; y <= max; y++) out.push(String(y));
  return out;
}

// ══ HỢP ĐỒNG THẦU PHỤ CỦA 1 CÔNG TRÌNH ═══════════════════════════════
// Trả về [{ id, ten, tenKey (không dấu, thường), giaTri, ngay, nd }] — bỏ HĐ đã xóa
function tytHdtpOf(p) {
  return (typeof thauPhuContracts !== 'undefined' ? thauPhuContracts : [])
    .filter(r => r && !r.deletedAt && _tytMatch(r, p))
    .map(r => ({
      id: r.id, ten: (r.thauphu || '').trim(), tenKey: _tytBoDau(r.thauphu),
      giaTri: (r.giaTri || 0) + (r.phatSinh || 0), ngay: r.ngay || '', nd: r.nd || '',
    }));
}
// Chữ của 1 HĐ thầu phụ (tên + nội dung) — chỉ dùng để đoán nhóm khi chuyển dữ liệu Rổ 2 cũ
function _tytHdtpTxt(id) {
  const r = (typeof thauPhuContracts !== 'undefined' ? thauPhuContracts : []).find(z => z && z.id === id);
  return r ? (r.thauphu || '') + ' ' + (r.nd || '') : '';
}

// HĐ thầu phụ của 1 khoản đã được chọn nhóm (ok(cấu hình HĐ) = true): phiếu gắn thẳng HĐ (hdtpId) → HĐ đó;
// còn lại khớp TÊN thầu phụ (1 TP có nhiều HĐ trong cùng CT → HĐ đầu tiên đã được chọn nhóm)
function _tytHdtpCo(line, st, ctx, ok) {
  const hdtps = (ctx && ctx.hdtp) || [];
  if (!hdtps.length) return null;
  if (line.hdtpId && hdtps.some(h => h.id === line.hdtpId) && ok(st.theoHdtp[line.hdtpId])) return line.hdtpId;
  const k = _tytBoDau(line.doiTuong);
  const hd = k ? hdtps.find(h => h.tenKey === k && ok(st.theoHdtp[h.id])) : null;
  return hd ? hd.id : null;
}
// HĐ thầu phụ mà 1 khoản THUỘC VỀ (không cần đã chọn nhóm) — để đếm "đã chi" của từng HĐ
function _tytHdtpCua(line, ctx) {
  const hdtps = (ctx && ctx.hdtp) || [];
  if (line.hdtpId && hdtps.some(h => h.id === line.hdtpId)) return line.hdtpId;
  const k = _tytBoDau(line.doiTuong);
  const hd = k ? hdtps.find(h => h.tenKey === k) : null;
  return hd ? hd.id : null;
}

// ══════════════════════════════════════════════════════════════════════════════
// ══ 4 NHÓM CHI PHÍ ═══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// THỨ TỰ XẾP NHÓM cho 1 khoản (hoặc 1 MÓN của hóa đơn chi tiết):
//   ① gán tay (st.nhomTay[khóa khoản]) → ② HĐ thầu phụ (theoHdtp[id].nhom) → ③ luật từ khóa (dùng chung)
//   → ④ bảng Loại chi phí → Nhóm (người dùng chỉnh, dùng chung) → ⑤ mặc định theo tên loại → Chưa xếp.
// HÓA ĐƠN CHI TIẾT có ≥ 2 món → tách từng MÓN (tiền chia theo thành tiền món, khớp đúng tổng hóa đơn)
//   để 1 bill điện nước có cả "ống" (Nhóm 1) lẫn "bóng đèn" (Nhóm 2) được xếp đúng.
const TYT_NHOM = {
  1: { ten: 'Phần thô & Nhân công hoàn thiện', ngan: 'Thô & NC',     mo: 'Vật tư thô, toàn bộ nhân công, thầu phụ thô, quỹ phụ phí công trường' },
  2: { ten: 'Vật tư & Thi công hoàn thiện',    ngan: 'Hoàn thiện',   mo: 'Gạch ốp lát, TBVS, đèn, cửa · TP điện nước, máy lạnh, chống sét, thạch cao, sơn…' },
  3: { ten: 'Nội thất & Tiện ích bổ sung',     ngan: 'Nội thất',     mo: 'Đồ gỗ rời & liền tường · thang máy, điện mặt trời, smarthome · sân vườn, hồ bơi…' },
  4: { ten: 'Chi phí khác ngoài gói chính',    ngan: 'Ngoài gói',    mo: 'Thiết kế - xin phép, ép cọc, phát sinh chủ nhà, khoản theo dõi riêng / máy móc công ty' },
  0: { ten: 'Chưa xếp nhóm',                   ngan: 'Chưa xếp',     mo: 'Cần chọn nhóm' },
};
const TYT_NHOM_DS = [1, 2, 3, 4];

// Khóa so sánh tên loại chi phí: không dấu, thường, gộp khoảng trắng
function tytLoaiKey(loai) { return _tytBoDau(loai).replace(/\s+/g, ' ').trim(); }

// Nhóm MẶC ĐỊNH của các loại chi phí trong danh mục thật của công ty (khóa = tytLoaiKey)
const _TYT_NHOM_LOAI_CHUAN = {
  'nhan cong': 1, 'hoa don le': 1, 'dao dat - san lap': 1, 'sat thep': 1, 'be tong tuoi': 1, 'vat lieu xay dung': 1,
  'van chuyen': 1, 'xa ban - do rac': 1, 'dien nuoc': 1, 'copha': 1, 'giai khat': 1, 'copha thue': 1,
  'vat tu dien nuoc': 1, 'do be tong': 1, 'be tong tay': 1, 'do thi': 1, 'bao hiem tai nan cn': 1, 'giu cong trinh': 1,
  'ngoai giao': 1, 'thue may moc - thiet bi': 1, 'phu cap an uong': 1, 'thi cong sat thep': 1, 'op lat gach': 1,
  'thau phu': 1,
  'gach op lat': 2, 'vat tu son nuoc': 2, 'thi cong tran thach cao': 2, 'tiep dia - chong set': 2, 'vat tu dien lanh': 2,
  'thi cong da hoa cuong': 2, 'thi cong dien nuoc': 2,
  'thiet bi gia dung': 3,
  'thiet ke - xin phep': 4, 'ep coc': 4, 'sua may': 4, 'van phong': 4, 'luong khoi van phong': 4, 'mua may - thiet bi': 4,
  'bao hiem xa hoi': 4, 'khao sat - do dat': 4, 'thue phi': 4,
};
// Loại lạ (không có trong bảng trên) → đoán theo TỪ trong tên. Xét Nhóm 4 → 3 → 2 → 1
// (VD "Mua Máy - Thiết Bị" là Nhóm 4 dù có chữ "thiết bị"). So theo TỪ NGUYÊN VẸN (không khớp nửa chữ).
const _TYT_NHOM_TU = [
  [4, ['ep coc', 'thiet ke', 'xin phep', 'hoan cong', 'khao sat', 'mua may', 'sua may', 'khau hao', 'van phong',
       'bao hiem xa hoi', 'thue phi', 'thao do', 'phat sinh']],
  [3, ['noi that', 'thang may', 'homelift', 'nang luong mat troi', 'dien mat troi', 'smarthome', 'nha thong minh',
       'may lanh trung tam', 'san vuon', 'tieu canh', 'ho ca', 'ho boi', 'rem cua', 'gian phoi', 'gia dung', 'do go', 'tu bep', 'sofa']],
  [2, ['gach op', 'op lat', 'gach lat', 'gach men', 'granite', 'da hoa cuong', 'marble', 'san go', 'thiet bi ve sinh', 'tbvs',
       'bon cau', 'lavabo', 'sen tam', 'voi sen', 'bon tam', 'bong den', 'den led', 'den trang tri', 'cong tac', 'o cam',
       'nhom kinh', 'xingfa', 'cua cuon', 'cua go', 'lan can', 'sat my thuat', 'son', 'thach cao', 'dien lanh', 'ong dong',
       'may lanh', 'dieu hoa', 'chong set', 'tiep dia', 'hoan thien']],
  [1, ['sat thep', 'be tong', 'dao dat', 'san lap', 'nhan cong', 'copha', 'vat lieu', 'vat tu', 'xi mang', 'gach xay', 'cat', 'da',
       'van chuyen', 'thue may', 'giai khat', 'xa ban', 'giu cong trinh', 'hoa don le', 'do thi', 'ngoai giao', 'phu cap',
       'bao hiem tai nan', 'chong tham', 'dien nuoc', 'thau phu', 'khoan coc', 'gian giao']],
];
// Đoán nhóm theo TỪ trong 1 đoạn chữ (không dấu, so nguyên từ). Không đoán được → 0
function tytNhomTheoChu(txt) {
  const s = ' ' + _tytBoDau(txt).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  if (!s.trim()) return 0;
  for (const [n, tus] of _TYT_NHOM_TU) if (tus.some(t => s.includes(' ' + t + ' '))) return n;
  return 0;
}
function tytNhomMacDinh(loai) {
  const k = tytLoaiKey(loai);
  if (!k) return 0;
  if (Object.prototype.hasOwnProperty.call(_TYT_NHOM_LOAI_CHUAN, k)) return _TYT_NHOM_LOAI_CHUAN[k];
  return tytNhomTheoChu(loai);
}

// Rổ cũ (bản trước 27/10/2026) → Nhóm mới. txt: chữ của khoản / loại / HĐ để đoán khi là Rổ 2.
function _tytRoCuSangNhom(ro, txt) {
  ro = +ro;
  if (ro === 1) return 1;
  if (ro === 3) return 4;
  if (ro === 2) { const n = tytNhomTheoChu(txt); return n >= 2 ? n : 4; }
  return 0;
}

// Luật từ khóa mặc định — loai: điều kiện loại chi phí (chứa, không dấu; '' = mọi loại)
const TYT_NHOM_LUAT_MAC_DINH = [
  { loai: 'Điện Nước',         tuKhoa: 'bóng đèn, đèn led, đèn trang trí, công tắc, ổ cắm, bồn cầu, vòi sen, sen tắm, lavabo, bồn tắm, máy bơm, máy nước nóng, quạt', nhom: 2 },
  { loai: 'Vật Liệu Xây Dựng', tuKhoa: 'gạch ốp, gạch lát, gạch men, gạch granite, đá hoa cương, granite, marble, sàn gỗ', nhom: 2 },
  { loai: '',                  tuKhoa: 'thang máy, năng lượng mặt trời, điện mặt trời, smarthome, hồ bơi, hồ cá, sân vườn, rèm cửa, giàn phơi, nội thất', nhom: 3 },
  { loai: '',                  tuKhoa: 'ép cọc, tháo dỡ', nhom: 4 },
  { loai: 'Khác',              tuKhoa: 'xà bần, giải khát, đô thị, giữ công trình', nhom: 1 },
];
const _tytLuatMacDinh = () => TYT_NHOM_LUAT_MAC_DINH.map((l, i) => ({ id: 'nd' + i, ...l }));

// Bản ghi cấu hình (mới nhất) — null nếu chưa có
function _tytCfgRec() {
  const list = (tyTrongRecords || []).filter(r => r && !r.deletedAt && r.kind === 'cauhinh');
  return list.length ? list.reduce((a, b) => ((b.updatedAt || 0) > (a.updatedAt || 0) ? b : a)) : null;
}
// Cấu hình đang dùng (bản sao an toàn): { nhomLoai, nhomLuat, truLoai, quyMuc, coBanGhi }
//   Bản ghi cũ chỉ có roLoai / roLuat → chuyển đổi (luật mặc định cũ thay bằng bộ mặc định mới).
function tytNhomCfg() {
  const r = _tytCfgRec();
  let nhomLoai = {}, nhomLuat;
  if (r && r.nhomLoai && typeof r.nhomLoai === 'object') nhomLoai = { ...r.nhomLoai };
  else if (r && r.roLoai && typeof r.roLoai === 'object') {
    Object.keys(r.roLoai).forEach(k => {
      const ro = +r.roLoai[k] || 0;
      const md = tytNhomMacDinh(k);
      // Rổ người dùng chọn trùng ý với mặc định mới → bỏ (để theo mặc định); khác → chuyển đổi
      const n = ro === 2 && md >= 2 ? md : _tytRoCuSangNhom(ro, k);
      if (n !== md) nhomLoai[k] = n;
    });
  }
  if (r && Array.isArray(r.nhomLuat)) nhomLuat = r.nhomLuat.map(l => ({ ...l }));
  else {
    nhomLuat = _tytLuatMacDinh();
    // Luật rổ người dùng TỰ THÊM (không phải bộ mặc định cũ — id 'rd…') → giữ lại, đổi rổ sang nhóm
    if (r && Array.isArray(r.roLuat)) r.roLuat.filter(l => l && !/^rd\d+$/.test(l.id || '')).forEach(l => {
      const n = _tytRoCuSangNhom(l.ro, l.tuKhoa);
      if (n) nhomLuat.push({ id: l.id || tytNewId('q'), loai: l.loai || '', tuKhoa: l.tuKhoa || '', nhom: n });
    });
  }
  return {
    nhomLoai, nhomLuat,
    truLoai: (r && r.truLoai && typeof r.truLoai === 'object') ? { ...r.truLoai } : {},
    quyMuc: (r && +r.quyMuc >= 0 && r.quyMuc !== '' && r.quyMuc !== null && r.quyMuc !== undefined) ? +r.quyMuc : TYT_QUY_MUC_MAC_DINH,
    coBanGhi: !!r,
  };
}
function tytSaveNhomCfg(changes) {
  const cur = _tytCfgRec();
  const base = tytNhomCfg();
  // Lần đầu ghi theo tên trường mới → ghi luôn cả bảng / luật đã chuyển đổi để không mất phần còn lại
  const full = { nhomLoai: base.nhomLoai, nhomLuat: base.nhomLuat, truLoai: base.truLoai, quyMuc: base.quyMuc, ...changes };
  if (cur) {
    const i = tyTrongRecords.findIndex(r => r.id === cur.id);
    tyTrongRecords[i] = mkUpdate(tyTrongRecords[i], (cur.nhomLoai && cur.nhomLuat) ? changes : full);
  } else {
    tyTrongRecords.unshift(mkRecord({ kind: 'cauhinh', ...full }));
  }
  save('tytrong_v1', tyTrongRecords);
}

// Nhóm của 1 LOẠI theo bảng ánh xạ: { nhom, src: 'loai' (người dùng chỉnh) | 'macdinh' }
function tytNhomCuaLoai(loai, cfg) {
  const k = tytLoaiKey(loai);
  if (cfg && Object.prototype.hasOwnProperty.call(cfg.nhomLoai, k)) return { nhom: +cfg.nhomLoai[k] || 0, src: 'loai' };
  return { nhom: tytNhomMacDinh(loai), src: 'macdinh' };
}

// Luật từ khóa có khớp 1 món không (từ khóa so KHÔNG DẤU, "chứa" — như luật cũ)
function tytNhomLuatKhop(lu, line, part) {
  if (lu.loai && !tytLoaiKey(line.loai).includes(tytLoaiKey(lu.loai))) return false;
  const tus = String(lu.tuKhoa || '').split(',').map(_tytBoDau).filter(Boolean);
  if (!tus.length) return false;
  const txt = _tytBoDau((part.ten || '') + ' ' + (line.doiTuong || '') + (part.mon ? '' : ' ' + (line.nd || '')));
  return tus.some(t => txt.includes(t));
}

const _tytNhomHopLe = v => (TYT_NHOM_DS.includes(+v) ? +v : 0);

// Nhóm của 1 MÓN: { nhom, src, ref } — src: 'tay' | 'hdtp' | 'luat' | 'loai' | 'macdinh'
function _tytNhomPart(line, part, st, ctx, cfg) {
  const tay = _tytNhomHopLe(st.nhomTay[line.key]);
  if (tay) return { nhom: tay, src: 'tay', ref: '' };
  const hd = _tytHdtpCo(line, st, ctx, v => v && _tytNhomHopLe(v.nhom));
  if (hd) return { nhom: +st.theoHdtp[hd].nhom, src: 'hdtp', ref: hd };
  for (const lu of cfg.nhomLuat) if (tytNhomLuatKhop(lu, line, part)) return { nhom: _tytNhomHopLe(lu.nhom), src: 'luat', ref: lu.id };
  const m = tytNhomCuaLoai(line.loai, cfg);
  return { nhom: m.nhom, src: m.src, ref: '' };
}

// Tách 1 khoản thành các MÓN để xếp nhóm. Hóa đơn chi tiết ≥ 2 món → chia tiền theo thành tiền món
// (món cuối nhận phần lẻ → tổng khớp đúng hóa đơn). Còn lại → 1 món = cả khoản.
function tytTachMon(line) {
  const its = (line.items || []).map(it => ({ ten: it.ten || '', v: +(it.thanhtien || (it.sl || 0) * (it.dongia || 0)) || 0 }))
    .filter(it => it.v > 0);
  const sum = its.reduce((s, it) => s + it.v, 0);
  if (its.length < 2 || !sum) return [{ ten: line.nd || '', tien: line.tien, mon: false }];
  let du = line.tien;
  return its.map((it, i) => {
    const t = i === its.length - 1 ? du : Math.round(line.tien * it.v / sum);
    du -= t;
    return { ten: it.ten, tien: t, mon: true };
  });
}

// ══ TỔNG HỢP CHO GIAO DIỆN ══════════════════════════════════════════
// Trả về {
//   st, ctx, cfg, allYears, lines (mỗi khoản có .parts[] = món đã xếp nhóm, .nhomChinh, .nhomNhieu),
//   tongChi, tongKhop (tổng các dòng khớp _ctTongChi — tự kiểm tra công thức), tongSan, cpM2,
//   theoLoai: [{ loai, tien, soDong }], theoNhom: { 0..4: tiền }, theoTru: { sat, bt, nc, tp, quy, '' } (Nhóm 1),
//   cpM2N1 (Nhóm 1 ÷ sàn), chuaNhom: [khoản có món chưa xếp nhóm]
// }
// opts.allYears: trọn vòng đời (xem tytCostLines). Khi đó KHÔNG so với _ctTongChi (hàm đó theo năm lọc).
function tytTongHop(p, opts) {
  const allYears = !!(opts && opts.allYears);
  const st    = tytStructOf(p.id);
  const lines = tytCostLines(p, { allYears });
  const ctx   = { hdtp: tytHdtpOf(p) };
  const cfg   = tytNhomCfg();

  const tongChi = lines.reduce((s, l) => s + l.tien, 0);
  let tongKhop = true;
  if (!allYears && typeof _ctTongChi === 'function' && typeof _ctGetCosts === 'function') {
    tongKhop = Math.round(_ctTongChi(p, _ctGetCosts(p)).tongChi) === Math.round(tongChi);
  }
  const tongSan = tytTongSan(p);

  // Theo loại chi phí
  const loaiMap = new Map();
  lines.forEach(l => {
    const o = loaiMap.get(l.loai) || { loai: l.loai, tien: 0, soDong: 0 };
    o.tien += l.tien; o.soDong++;
    loaiMap.set(l.loai, o);
  });
  const theoLoai = [...loaiMap.values()].sort((a, b) => b.tien - a.tien);

  // Xếp nhóm từng món + trụ cột (chỉ Nhóm 1)
  const theoNhom = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  const theoTru = { sat: 0, bt: 0, nc: 0, tp: 0, quy: 0, '': 0 };
  lines.forEach(l => {
    l.parts = tytTachMon(l).map(pt => {
      const x = _tytNhomPart(l, pt, st, ctx, cfg);
      theoNhom[x.nhom] += pt.tien;
      const o = { ...pt, nhom: x.nhom, nhomSrc: x.src, nhomRef: x.ref, tru: null, truSrc: '' };
      if (x.nhom === 1) {
        const t = _tytTruPart(l, pt, cfg);
        o.tru = t.tru; o.truSrc = t.src;
        theoTru[t.tru] += pt.tien;
      }
      return o;
    });
    const by = {};
    l.parts.forEach(pt => { by[pt.nhom] = (by[pt.nhom] || 0) + pt.tien; });
    l.nhomChinh = +Object.keys(by).sort((a, b) => by[b] - by[a])[0];
    l.nhomNhieu = Object.keys(by).length > 1;
  });

  return {
    st, ctx, cfg, allYears, lines, tongChi, tongKhop, tongSan,
    cpM2: tongSan > 0 ? tongChi / tongSan : 0,
    theoLoai, theoNhom, theoTru,
    cpM2N1: tongSan > 0 ? theoNhom[1] / tongSan : 0,
    chuaNhom: lines.filter(l => l.parts.some(pt => pt.nhom === 0)),
  };
}

// Thống kê theo HĐ thầu phụ: { soKhoan, tien } = các khoản của TP đó · { nhan, tienNhan } = phần đang
// được xếp nhóm THEO HĐ (không bị gán tay giành)
function tytHdtpThongKe(r) {
  const m = new Map();
  r.ctx.hdtp.forEach(h => m.set(h.id, { soKhoan: 0, tien: 0, nhan: 0, tienNhan: 0 }));
  r.lines.forEach(l => {
    const hd = _tytHdtpCua(l, r.ctx);
    if (hd && m.has(hd)) { const o = m.get(hd); o.soKhoan++; o.tien += l.tien; }
    l.parts.forEach(pt => {
      if (pt.nhomSrc === 'hdtp' && m.has(pt.nhomRef)) { const o = m.get(pt.nhomRef); o.nhan++; o.tienNhan += pt.tien; }
    });
  });
  return m;
}

// ── CÂY 4 NHÓM cho bảng TỔNG QUAN: Nhóm → Loại chi phí → từng khoản (hoặc món).
//   Nhóm 1 chèn thêm cấp TRỤ CỘT: Sắt thép / Bê tông & VL thô / Nhân công / Thầu phụ thô & phụ trợ /
//   Quỹ phụ phí (/ Chưa xếp trụ cột) → Loại → khoản. Nhóm 0 (Chưa xếp) chỉ hiện khi có tiền.
// Node: { key, kind: 'nhom'|'tru'|'loai'|'line', ten, tien, nhom, tru?, soDong?, line?, part?, children[] }
//   key ổn định (để nhớ trạng thái mở/đóng): 'N:<nhóm>' · '…|T:<trụ>' · '…|L:<loại>' · '…|K:<khóa khoản>#<món>'
function tytCayNhom(r) {
  // Nhóm các món theo loại chi phí → node 'loai' (con = từng khoản / món, mới nhất trước)
  const nhomLoai = (ks, prefix, nhom) => {
    const m = new Map();
    ks.forEach(k => {
      const o = m.get(k.l.loai) || { loai: k.l.loai, tien: 0, ks: [] };
      o.tien += k.pt.tien; o.ks.push(k);
      m.set(k.l.loai, o);
    });
    return [...m.values()].sort((a, b) => b.tien - a.tien).map(o => {
      const lk = prefix + '|L:' + o.loai;
      return {
        key: lk, kind: 'loai', ten: o.loai, tien: o.tien, soDong: o.ks.length, nhom,
        children: o.ks.sort((a, b) => String(b.l.ngay).localeCompare(String(a.l.ngay))).map(k => ({
          key: lk + '|K:' + k.l.key + '#' + k.i, kind: 'line', ten: k.pt.mon ? k.pt.ten : k.l.nd,
          tien: k.pt.tien, line: k.l, part: k.pt, nhom, children: [],
        })),
      };
    });
  };
  const out = [];
  [1, 2, 3, 4, 0].forEach(nhom => {
    const nk = 'N:' + nhom;
    const ks = [];
    r.lines.forEach(l => l.parts.forEach((pt, i) => { if (pt.nhom === nhom) ks.push({ l, pt, i }); }));
    const tien = r.theoNhom[nhom] || 0;
    if (nhom === 0 && !tien) return;
    let children;
    if (nhom === 1) {
      children = TYT_TRU_THU_TU.map(t => {
        const tk = nk + '|T:' + t;
        const kt = ks.filter(k => k.pt.tru === t);
        return { key: tk, kind: 'tru', tru: t, nhom, ten: TYT_TRU[t].ten, tien: kt.reduce((s, k) => s + k.pt.tien, 0), children: nhomLoai(kt, tk, nhom) };
      }).filter(n => n.tien || TYT_TRU_DS.includes(n.tru));   // 4 trụ cột luôn hiện; Quỹ / Chưa xếp chỉ khi có tiền
    } else children = nhomLoai(ks, nk, nhom);
    out.push({ key: nk, kind: 'nhom', nhom, ten: TYT_NHOM[nhom].ten, tien, children });
  });
  return out;
}

// ══ BỘ ĐƠN GIÁ ĐỊNH MỨC (05/10/2026 — Lần 2) ═══════════════════════════
// Lưu ngay trong store tytrong_v1 dưới dạng bản ghi kind:'dinhmuc' (xem đầu file).
// Đơn giá = tiền ÷ tổng diện tích sàn quy đổi của công trình nguồn, làm tròn đồng.
function tytDinhMucList() {
  return (tyTrongRecords || []).filter(r => r && r.kind === 'dinhmuc' && !r.deletedAt)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
function tytDinhMucById(id) { return tytDinhMucList().find(r => r.id === id) || null; }

// Nhãn năm đang lọc (ghi vào định mức để biết số liệu lấy theo năm nào)
function tytNhanNam() {
  if (typeof activeYears !== 'undefined' && activeYears && activeYears.size) return [...activeYears].sort().join(', ');
  return 'Tất cả năm';
}

// Các trường số liệu của 1 định mức lấy từ kết quả tytTongHop(p) của công trình nguồn
function _tytDmFields(p, r) {
  const san = r.tongSan;
  const dgLoai = {};
  r.theoLoai.forEach(o => { dgLoai[o.loai] = Math.round(o.tien / san); });
  const dgNhom = {};
  TYT_NHOM_DS.forEach(n => { dgNhom[n] = Math.round((r.theoNhom[n] || 0) / san); });
  const ro1 = {};   // đ/m2 từng trụ cột Nhóm 1 (tên trường cũ — xem đầu file)
  TYT_TRU_THU_TU.forEach(t => { ro1[t === '' ? 'khac' : t] = Math.round((r.theoTru[t] || 0) / san); });
  return {
    loaiCT: p.loaiCongTrinh || '', nguonPid: p.id, nguonTen: p.name, nam: r.allYears ? 'Trọn vòng đời' : tytNhanNam(),
    tongSan: Math.round(san * 100) / 100, tongChi: r.tongChi, dgTong: Math.round(r.tongChi / san), dgLoai, dgNhom,
    dgRo1: Math.round(r.theoNhom[1] / san), ro1, nhapTay: false,
  };
}

// Tạo định mức từ kết quả tytTongHop(p) của công trình nguồn. Trả về bản ghi vừa tạo.
function tytTaoDinhMuc(p, r, ten) {
  const rec = mkRecord({ kind: 'dinhmuc', ten: (ten || '').trim() || ('Định mức ' + p.name), ..._tytDmFields(p, r) });
  tyTrongRecords.unshift(rec);
  save('tytrong_v1', tyTrongRecords);
  return rec;
}

// Định mức NHẬP TAY (định mức an toàn): chỉ có 4 trụ cột Nhóm 1 (đ/m2). ro1 = { sat, bt, nc, tp }
function tytTaoDinhMucTay(ten, ro1) {
  const rec = mkRecord({
    kind: 'dinhmuc', ten: (ten || '').trim() || 'Định mức nhập tay', nhapTay: true, nam: 'Nhập tay',
    loaiCT: '', nguonPid: '', nguonTen: '', tongSan: 0, tongChi: 0, dgTong: 0, dgLoai: {}, dgNhom: {},
    ro1: { ...ro1 }, dgRo1: TYT_TRU_DS.reduce((s, t) => s + (+ro1[t] || 0), 0),
  });
  tyTrongRecords.unshift(rec);
  save('tytrong_v1', tyTrongRecords);
  return rec;
}

// Cập nhật lại số liệu định mức từ CT nguồn (giữ tên + id)
function tytCapNhatDinhMuc(id, p, r) { tytSuaDinhMuc(id, _tytDmFields(p, r)); }

// Đổi tên / xóa mềm định mức
function tytSuaDinhMuc(id, changes) {
  const i = tyTrongRecords.findIndex(r => r && r.id === id);
  if (i < 0) return;
  tyTrongRecords[i] = mkUpdate(tyTrongRecords[i], changes);
  save('tytrong_v1', tyTrongRecords);
}
function tytXoaDinhMuc(id) { tytSuaDinhMuc(id, { deletedAt: Date.now() }); }


// ══ SO SÁNH NHIỀU CÔNG TRÌNH (05/10/2026 — Lần 2) ══════════════════════
// cots: mảng project. Trả về { cots: [{ p, r }], loais: [tên loại — sắp theo tổng tiền giảm dần] }
function tytSoSanh(projs, opts) {
  const cots = projs.map(p => ({ p, r: tytTongHop(p, opts) }));
  const tong = new Map();
  cots.forEach(c => c.r.theoLoai.forEach(o => tong.set(o.loai, (tong.get(o.loai) || 0) + o.tien)));
  const loais = [...tong.keys()].sort((a, b) => tong.get(b) - tong.get(a));
  return { cots, loais };
}

// ══════════════════════════════════════════════════════════════════════════════
// ══ KIỂM SOÁT ĐỊNH MỨC NHÓM 1 (07/10/2026 — Phần B, đổi Rổ 1 → Nhóm 1 ngày 27/10/2026) ═══
// ══════════════════════════════════════════════════════════════════════════════
// Chỉ xét NHÓM 1 (phần thô & NC hoàn thiện). Nhóm 1 chia thành 4 TRỤ CỘT + 1 QUỸ PHỤ PHÍ:
//   sat = Sắt thép · bt = Bê tông & VL thô (cát, đá, xi măng, gạch xây, copha, đào đất, vận chuyển)
//   nc  = Nhân công · tp = Thầu phụ thô & phụ trợ (khoán TP + vật tư điện nước âm…)
//   quy = Quỹ phụ phí — CHỈ 6 loại lặt vặt: Giải Khát, Xà Bần - Đổ Rác, Giữ Công Trình, Hóa Đơn Lẻ,
//         Đô Thị, Ngoại Giao (người dùng chốt: vật tư phụ KHÔNG vào quỹ, phải thuộc 4 trụ cột)
//   ''  = Chưa xếp trụ cột (loại lạ) — chọn ở nút "⚙ Cấu hình phân nhóm mặc định"
// Trụ cột theo LOẠI CHI PHÍ: bảng người dùng chỉnh (cfg.truLoai) → mặc định theo tên loại.
// Quỹ phụ phí kiểm soát bằng 1 MỨC đ/m2 dùng chung (cfg.quyMuc, mặc định 50.000) — chỉ báo đỏ khi
// TỔNG các khoản lặt vặt vượt mức, không canh từng ly cà phê.
const TYT_TRU = {
  sat: { ten: 'Sắt thép',               mo: 'Sắt thép, thi công sắt thép' },
  bt:  { ten: 'Bê tông & VL thô',       mo: 'Bê tông, copha, VLXD thô (cát, đá, xi măng, gạch xây), đào đất, vận chuyển' },
  nc:  { ten: 'Nhân công',              mo: 'Toàn bộ công thợ thô + hoàn thiện, phụ cấp' },
  tp:  { ten: 'Thầu phụ thô & phụ trợ', mo: 'Khoán thầu phụ phần thô + vật tư hệ thống âm (điện nước…)' },
  quy: { ten: 'Quỹ phụ phí',            mo: 'Giải khát, xà bần, giữ CT, hóa đơn lẻ, đô thị, ngoại giao' },
  '':  { ten: 'Chưa xếp trụ cột',       mo: 'Chọn trụ cột ở nút ⚙ Cấu hình phân nhóm' },
};
const TYT_TRU_DS = ['sat', 'bt', 'nc', 'tp'];               // 4 trụ cột có định mức riêng
const TYT_TRU_THU_TU = ['sat', 'bt', 'nc', 'tp', 'quy', ''];  // thứ tự hiển thị
const TYT_QUY_MUC_MAC_DINH = 50000;

// Từ khóa (không dấu) trong TÊN LOẠI → trụ cột. Xét từ trên xuống (VD "Thi Công Sắt Thép" → Sắt thép
// trước khi gặp "thi cong" của Thầu phụ; "Đổ Bê Tông" → Bê tông).
const _TYT_QUY_TU = ['giai khat', 'xa ban', 'giu cong trinh', 'hoa don le', 'do thi', 'ngoai giao'];
const _TYT_TRU_TU = [
  ['quy', _TYT_QUY_TU],
  ['nc',  ['nhan cong', 'phu cap', 'bao hiem tai nan', 'op lat gach']],
  ['sat', ['sat thep']],
  ['bt',  ['be tong', 'copha', 'vat lieu', 'dao dat', 'san lap', 'van chuyen', 'thue may', 'xi mang']],
  ['tp',  ['thau phu', 'thi cong', 'dien nuoc', 'vat tu', 'tiep dia', 'dien lanh', 'chong tham']],
];
function tytTruMacDinh(loai) {
  const k = tytLoaiKey(loai);
  if (!k) return '';
  for (const [t, tus] of _TYT_TRU_TU) if (tus.some(w => k.includes(w))) return t;
  return '';
}
// Trụ cột của 1 LOẠI: { tru, src: 'loai' (người dùng chỉnh) | 'macdinh' }
function tytTruCuaLoai(loai, cfg) {
  const k = tytLoaiKey(loai);
  if (cfg && cfg.truLoai && Object.prototype.hasOwnProperty.call(cfg.truLoai, k)) {
    const t = cfg.truLoai[k];
    return { tru: Object.prototype.hasOwnProperty.call(TYT_TRU, t) ? t : '', src: 'loai' };
  }
  return { tru: tytTruMacDinh(loai), src: 'macdinh' };
}
// Trụ cột của 1 MÓN thuộc Nhóm 1. Loại chưa có trụ cột (VD "Khác" được luật kéo vào Nhóm 1 vì "xà bần")
// → nội dung có chữ lặt vặt của quỹ thì vào Quỹ phụ phí (src 'tukhoa').
function _tytTruPart(line, part, cfg) {
  const m = tytTruCuaLoai(line.loai, cfg);
  if (m.tru) return m;
  const txt = _tytBoDau((part.ten || '') + ' ' + (part.mon ? '' : (line.nd || '')));
  if (_TYT_QUY_TU.some(w => txt.includes(w))) return { tru: 'quy', src: 'tukhoa' };
  return m;
}

// Định mức có số liệu Nhóm 1 theo trụ cột chưa (định mức lưu trước Phần B thì chưa)
function tytDmCoRo1(dm) { return !!(dm && dm.ro1 && TYT_TRU_DS.some(t => +dm.ro1[t] > 0)); }

// KIỂM SOÁT NHÓM 1 của 1 công trình: ngân sách = diện tích × định mức đ/m2 từng trụ cột
//   (Quỹ phụ phí dùng mức chung cfg.quyMuc; "Chưa xếp trụ cột" dùng số của định mức nếu có).
// r = tytTongHop của CT đang theo dõi. Trả về {
//   rows: [{ k, ten, dg, ns, tt, conLai, pct, vuot, loais: [{ loai, tien }] }],
//   tong: { dg, ns, tt, conLai, pct, vuot }, soVuot }
function tytKiemSoat(dm, dienTich, r) {
  const ro1 = (dm && dm.ro1) || {};
  const quyMuc = r.cfg ? r.cfg.quyMuc : TYT_QUY_MUC_MAC_DINH;
  // Tiền Nhóm 1 của từng trụ cột tách theo loại (để bung xem trong bảng)
  const loaiTheoTru = {};
  r.lines.forEach(l => l.parts.forEach(pt => {
    if (pt.nhom !== 1) return;
    const m = loaiTheoTru[pt.tru] || (loaiTheoTru[pt.tru] = new Map());
    m.set(l.loai, (m.get(l.loai) || 0) + pt.tien);
  }));
  const mk = (k, dg) => {
    const ns = Math.round((+dg || 0) * dienTich);
    const tt = r.theoTru[k] || 0;
    const vuot = tt - ns >= 1000;   // lệch < 1.000 đ chỉ do làm tròn → không tính vượt
    return {
      k, ten: TYT_TRU[k].ten, dg: +dg || 0, ns, tt, conLai: ns - tt, vuot,
      pct: ns ? tt / ns * 100 : (tt ? Infinity : 0),
      loais: [...(loaiTheoTru[k] || new Map()).entries()].map(([loai, tien]) => ({ loai, tien })).sort((a, b) => b.tien - a.tien),
    };
  };
  const rows = TYT_TRU_DS.map(k => mk(k, ro1[k]));
  rows.push(mk('quy', quyMuc));
  const khac = mk('', ro1.khac);
  if (khac.tt || khac.dg) rows.push(khac);
  const ns = rows.reduce((s, x) => s + x.ns, 0), tt = rows.reduce((s, x) => s + x.tt, 0);
  return {
    rows, soVuot: rows.filter(x => x.vuot).length,
    tong: { dg: rows.reduce((s, x) => s + x.dg, 0), ns, tt, conLai: ns - tt, vuot: tt - ns >= 1000, pct: ns ? tt / ns * 100 : 0 },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ══ XU HƯỚNG & BIẾN ĐỘNG (07/10/2026 — Cải tiến Phần C) ══════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// 3 nguồn số liệu, đều CHỈ ĐỌC (không ghi gì):
//   1. đ/m2 Nhóm 1 theo NĂM CÔNG TRÌNH (tytXuHuongM2) — chỉ CT có bảng M2. Năm của CT = năm HOÀN THÀNH
//      (ngày quyết toán → hoàn thành → kết thúc); CT đang thi công lấy năm hiện tại.
//      Gộp các CT cùng năm theo Σ tiền ÷ Σ sàn (CT to nặng ký hơn CT nhỏ).
//   2. Đơn giá VẬT TƯ theo kỳ (tytGiaVatTu) — từ các MÓN của hóa đơn chi tiết (tên + ĐVT, bỏ dấu),
//      giá kỳ = Σ thành tiền ÷ Σ số lượng (bình quân gia quyền). Thước đo trượt giá chuẩn hơn đ/m2
//      vì không phụ thuộc thiết kế từng nhà.
//   3. Đơn giá CÔNG NHẬT theo kỳ (tytGiaCong) — từ chấm công: Σ(công × lương ngày) ÷ Σ công (không tính
//      phụ cấp / HĐ mua lẻ), bỏ CT "CÔNG TY".
// DỰ BÁO (tytHoiQuy): đường thẳng bình phương nhỏ nhất qua các điểm; CHỈ dự báo khi có ≥ 3 điểm,
//   luôn ghi là ƯỚC TÍNH.
const TYT_DB_MIN = 3;   // số điểm tối thiểu để dự báo

// Năm của 1 công trình (để xếp lên trục năm)
function tytNamCT(p) {
  const d = (p && (p.closedDate || p.completedDate || p.endDate)) || '';
  if (/^\d{4}/.test(d)) return d.slice(0, 4);
  return String(new Date().getFullYear());
}

// Xu hướng đ/m2 theo năm. projs: công trình (đã lọc sẵn: CT xây mới…); opts → tytTongHop.
// Trả về { cts: [{ p, nam, san, n1, tru, dongXong }], nams: [{ nam, soCT, dangLam, san, n1, tru: {sat..}, m2: { n1, sat, bt, nc, tp, quy } }] }
function tytXuHuongM2(projs, opts) {
  const cts = projs.filter(p => tytTongSan(p) > 0).map(p => {
    const r = tytTongHop(p, opts);
    return { p, nam: tytNamCT(p), san: r.tongSan, n1: r.theoNhom[1], tru: { ...r.theoTru }, dongXong: p.status === 'closed' || p.status === 'completed' };
  });
  const m = new Map();
  cts.forEach(c => {
    const o = m.get(c.nam) || { nam: c.nam, soCT: 0, dangLam: 0, san: 0, n1: 0, tru: { sat: 0, bt: 0, nc: 0, tp: 0, quy: 0 } };
    o.soCT++; if (!c.dongXong) o.dangLam++;
    o.san += c.san; o.n1 += c.n1;
    Object.keys(o.tru).forEach(t => { o.tru[t] += c.tru[t] || 0; });
    m.set(c.nam, o);
  });
  const nams = [...m.values()].sort((a, b) => a.nam.localeCompare(b.nam)).map(o => {
    const m2 = { n1: o.n1 / o.san };
    Object.keys(o.tru).forEach(t => { m2[t] = o.tru[t] / o.san; });
    return { ...o, m2 };
  });
  return { cts, nams };
}

// Hồi quy tuyến tính y = a + b·x. pts: [{ x, y }] (x là số: năm, hoặc chỉ số kỳ).
// Trả về null nếu < TYT_DB_MIN điểm; ngược lại { a, b, n, du: x => y, pctNam: % tăng mỗi bước so với điểm cuối }
function tytHoiQuy(pts) {
  const p = (pts || []).filter(z => isFinite(z.x) && isFinite(z.y) && z.y > 0);
  if (p.length < TYT_DB_MIN) return null;
  const n = p.length;
  const mx = p.reduce((s2, z) => s2 + z.x, 0) / n, my = p.reduce((s2, z) => s2 + z.y, 0) / n;
  const sxx = p.reduce((s2, z) => s2 + (z.x - mx) ** 2, 0);
  if (!sxx) return null;
  const b = p.reduce((s2, z) => s2 + (z.x - mx) * (z.y - my), 0) / sxx;
  const a = my - b * mx;
  const cuoi = p[p.length - 1];
  return { a, b, n, du: x => Math.max(0, a + b * x), pctNam: cuoi.y ? b / cuoi.y * 100 : 0 };
}

// Kỳ của 1 ngày: che 'm' → '2026-07' · 'q' → '2026-Q3' · 'y' → '2026'
function tytKy(ngay, che) {
  const d = String(ngay || '');
  if (!/^\d{4}-\d{2}/.test(d)) return '';
  if (che === 'y') return d.slice(0, 4);
  if (che === 'm') return d.slice(0, 7);
  return d.slice(0, 4) + '-Q' + Math.ceil(+d.slice(5, 7) / 3);
}
// Danh sách kỳ liên tục từ kỳ đầu tới kỳ cuối (để trục thời gian không bị nhảy)
function tytDayKy(dau, cuoi, che) {
  if (!dau || !cuoi) return [];
  const out = [];
  const tach = k => che === 'y' ? [+k, 0] : (che === 'm' ? [+k.slice(0, 4), +k.slice(5, 7)] : [+k.slice(0, 4), +k.slice(6)]);
  let [y, i] = tach(dau);
  const [y2, i2] = tach(cuoi);
  const max = che === 'm' ? 12 : 4;
  for (let n = 0; n < 400; n++) {
    out.push(che === 'y' ? String(y) : (che === 'm' ? y + '-' + String(i).padStart(2, '0') : y + '-Q' + i));
    if (y > y2 || (y === y2 && (che === 'y' || i >= i2))) break;
    if (che === 'y') y++; else if (++i > max) { i = 1; y++; }
  }
  return out;
}

// Kỳ kế tiếp của 1 kỳ (cho điểm dự báo): '2026-Q4' → '2027-Q1' · '2026-12' → '2027-01' · '2026' → '2027'
function tytKyKe(k, che) {
  if (che === 'y') return String(+k + 1);
  let y = +k.slice(0, 4), i = che === 'm' ? +k.slice(5, 7) : +k.slice(6);
  if (++i > (che === 'm' ? 12 : 4)) { i = 1; y++; }
  return che === 'm' ? y + '-' + String(i).padStart(2, '0') : y + '-Q' + i;
}

// Đơn giá VẬT TƯ theo kỳ từ các món hóa đơn chi tiết (mọi công trình, mọi năm ĐÃ TẢI vào máy).
// Trả về [{ key, ten, dv, loai, soLan, tien, ky: { <kỳ>: { sl, tien, gia } }, kys: [kỳ có mua] }] — nhiều lần mua nhất trước
function tytGiaVatTu(che) {
  const raw = (typeof load === 'function') ? load('inv_v3', []) : [];
  const m = new Map();
  raw.forEach(inv => {
    if (!inv || inv.deletedAt || !Array.isArray(inv.items) || !inv.items.length) return;
    const ky = tytKy(inv.ngay, che);
    if (!ky) return;
    inv.items.forEach(it => {
      const ten = String(it.ten || '').trim();
      const sl = +it.sl || 0;
      const tien = +(it.thanhtien || sl * (+it.dongia || 0)) || 0;
      if (!ten || !(sl > 0) || !(tien > 0)) return;
      const dv = String(it.dv || '').trim();
      const key = _tytBoDau(ten).replace(/\s+/g, ' ') + '|' + _tytBoDau(dv);
      const o = m.get(key) || { key, ten, dv, loai: inv.loai || '', soLan: 0, tien: 0, ky: {} };
      o.soLan++; o.tien += tien;
      const k = o.ky[ky] || (o.ky[ky] = { sl: 0, tien: 0, gia: 0 });
      k.sl += sl; k.tien += tien; k.gia = k.tien / k.sl;
      m.set(key, o);
    });
  });
  return [...m.values()].map(o => ({ ...o, kys: Object.keys(o.ky).sort() }))
    .sort((a, b) => (b.soLan - a.soLan) || (b.tien - a.tien));
}

// Đơn giá CÔNG NHẬT bình quân theo kỳ (chấm công, bỏ CT "CÔNG TY"): { <kỳ>: { cong, tien, gia } }
function tytGiaCong(che) {
  const raw = (typeof load === 'function') ? load('cc_v2', []) : [];
  const out = {};
  raw.forEach(w => {
    if (!w || w.deletedAt || !Array.isArray(w.workers) || w.projectId === 'COMPANY') return;
    const ky = tytKy(w.toDate || w.fromDate, che);
    if (!ky) return;
    w.workers.forEach(wk => {
      const cong = (wk.d || []).reduce((s2, v) => s2 + (+v || 0), 0);
      const luong = +wk.luong || 0;
      if (!(cong > 0) || !(luong > 0)) return;
      const o = out[ky] || (out[ky] = { cong: 0, tien: 0, gia: 0 });
      o.cong += cong; o.tien += cong * luong; o.gia = o.tien / o.cong;
    });
  });
  return out;
}

// Biến động 1 chuỗi giá theo kỳ: { dau, cuoi, kyDau, kyCuoi, pct (cuối so với đầu), db: giá dự báo kỳ kế tiếp | null }
//   kyMap: { <kỳ>: { gia } } · kys: các kỳ có số (đã sắp)
function tytBienDong(kyMap, kys) {
  if (!kys.length) return null;
  const dau = kyMap[kys[0]].gia, cuoi = kyMap[kys[kys.length - 1]].gia;
  // Trục x = vị trí kỳ trên dãy liên tục (kỳ không mua vẫn được tính khoảng cách)
  const che = /Q/.test(kys[0]) ? 'q' : (kys[0].length === 7 ? 'm' : 'y');
  const day = tytDayKy(kys[0], kys[kys.length - 1], che);
  const hq = tytHoiQuy(kys.map(k => ({ x: day.indexOf(k), y: kyMap[k].gia })));
  return { dau, cuoi, kyDau: kys[0], kyCuoi: kys[kys.length - 1], pct: dau ? (cuoi - dau) / dau * 100 : 0,
    db: hq ? hq.du(day.length) : null, hq, day };
}
