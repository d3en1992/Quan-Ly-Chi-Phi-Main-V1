// tytrong.core.js — Tab TỈ TRỌNG CHI PHÍ · phần TÍNH TOÁN THUẦN (không đụng giao diện)
// Load order: sau quyettoan.congtrinh.js (dùng _qtProjList), trước tytrong.ui.js
//
// MỤC ĐÍCH: xem 1 công trình tốn bao nhiêu cho từng LOẠI CHI PHÍ / GIAI ĐOẠN / HẠNG MỤC,
//   tính theo % tổng chi và theo đ/m2 sàn → làm định mức cho công trình sau (Lần 2).
//
// ── DỮ LIỆU (store 'tytrong_v1' → doc cloud riêng 'meta_ty_trong') ──────────
//   Mỗi công trình 01 bản ghi (tạo bằng mkRecord, sửa bằng mkUpdate):
//   {
//     id, projectId,
//     giaiDoan: [{ id, ten, tu, den }],     // cấp 1 — tu/den (YYYY-MM-DD, tùy chọn) = MỐC NGÀY tự phân bổ
//     hangMuc:  [{ id, gdId, ten }],        // cấp 2 — thuộc 1 giai đoạn (gdId)
//     phanBo:   { <khóa dòng chi phí>: { g: gdId, h: hmId | '' } },   // gán TAY (ghi đè mọi thứ khác)
//     theoHdtp: { <id HĐ thầu phụ>: { g, h } },   // (Lần 2) gán theo HĐ thầu phụ → mọi khoản của TP đó
//     luat:     [{ id, truong: 'nd'|'dt'|'loai', giaTri, g, h }],    // (Lần 2) luật tự gán, xét theo thứ tự
//     createdAt, updatedAt, deletedAt, deviceId
//   }
//   ⚠️ KHÔNG ghi gì vào hóa đơn / tiền ứng: hóa đơn, ứng TP/NCC giữ nguyên 100%.
//      Việc phân bổ chỉ nằm trong store này (khóa = loại + id bản ghi gốc).
//
//   (Lần 2) Cùng store còn chứa BỘ ĐƠN GIÁ ĐỊNH MỨC — bản ghi kind:'dinhmuc' (KHÔNG có projectId,
//   nên tytRecordOf không bao giờ lẫn): { id, kind:'dinhmuc', ten, loaiCT, nguonPid, nguonTen, nam,
//   tongSan, tongChi, dgTong, dgLoai: { <loại CP>: đ/m2 }, dgGd: { <tên giai đoạn>: đ/m2 }, ...meta }
//   → không phải đăng ký thêm store / doc cloud mới.
//   (Phần B) định mức có thêm: dgRo1 (Rổ 1 ÷ sàn), ro1: { sat, bt, nc, tp, quy, khac } (đ/m2 từng TRỤ CỘT
//   của Rổ 1), dgGdR1 / dgHmR1 (đơn giá giai đoạn / hạng mục chỉ tính Rổ 1), nhapTay (định mức nhập tay).
//
// ── TỔNG CHI PHÍ = TIỀN CHI THỰC TẾ (khớp _ctTongChi ở projects.ui.js = số trên thẻ công trình) ──
//   = hóa đơn (kể cả nhân công từ chấm công) + ứng thầu phụ + ứng NCC
//     − hóa đơn của các NCC đã có ứng (vì đã tính bằng tiền ứng, tránh đếm 2 lần)
//   Theo NĂM ĐANG LỌC như mọi tab khác ("Tất cả năm" = trọn vòng đời công trình).
//
// ── CÁCH 1 DÒNG CHI PHÍ ĐƯỢC XẾP VÀO GIAI ĐOẠN / HẠNG MỤC (tytResolve) — ưu tiên từ trên xuống ──
//   1. Gán TAY trong phanBo (còn hợp lệ)                → src 'tay'
//   2. Thuộc HĐ thầu phụ đã gắn (theoHdtp)              → src 'hdtp'
//   3. Khớp LUẬT đầu tiên (luat — theo thứ tự danh sách) → src 'luat'
//   4. Ngày chi rơi vào MỐC NGÀY của giai đoạn          → src 'ngay' (chưa rõ hạng mục)
//   5. Không khớp gì                                     → "Chưa phân bổ"
//   Luật / HĐ TP / mốc ngày là lớp TỰ ĐỘNG: áp cho cả hóa đơn nhập sau này; xóa luật = tự hoàn tác.

// ─── Biến global (nạp lại ở _reloadGlobals / _refreshGlobal sau khi sync) ───
let tyTrongRecords = load('tytrong_v1', []);

const TYT_LOAI_UNG_TP   = 'Thầu Phụ';           // nhóm loại cho tiền ứng thầu phụ
const TYT_LOAI_UNG_NCC  = 'Ứng Nhà Cung Cấp';   // dự phòng khi không đoán được loại của NCC
const TYT_LOAI_KHAC     = 'Chi Phí Khác';       // hóa đơn thiếu loại

// Id ngắn cho giai đoạn / hạng mục (chỉ cần duy nhất trong 1 công trình)
function tytNewId(prefix) {
  return (prefix || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Công trình có khớp bản ghi không — quy tắc chung toàn app: ưu tiên projectId, không có thì so tên
function _tytMatch(r, p) {
  return r.projectId ? r.projectId === p.id : r.congtrinh === p.name;
}

// ══ BẢN GHI CẤU TRÚC CỦA 1 CÔNG TRÌNH ═══════════════════════════════
// Lấy bản ghi còn hiệu lực MỚI NHẤT (2 máy lỡ cùng tạo → dùng bản sửa sau cùng)
function tytRecordOf(pid) {
  if (!pid) return null;
  const list = (tyTrongRecords || []).filter(r => r && !r.deletedAt && !r.kind && r.projectId === pid);
  if (!list.length) return null;
  return list.reduce((a, b) => ((b.updatedAt || 0) > (a.updatedAt || 0) ? b : a));
}

// Cấu trúc (bản sao an toàn để sửa) — chưa có bản ghi thì trả cấu trúc rỗng
function tytStructOf(pid) {
  const r = tytRecordOf(pid);
  return {
    giaiDoan: (r && Array.isArray(r.giaiDoan)) ? r.giaiDoan.map(g => ({ ...g })) : [],
    hangMuc:  (r && Array.isArray(r.hangMuc))  ? r.hangMuc.map(h => ({ ...h }))  : [],
    phanBo:   (r && r.phanBo && typeof r.phanBo === 'object') ? { ...r.phanBo } : {},
    theoHdtp: (r && r.theoHdtp && typeof r.theoHdtp === 'object') ? { ...r.theoHdtp } : {},
    luat:     (r && Array.isArray(r.luat)) ? r.luat.map(l => ({ ...l })) : [],
    roTay:    (r && r.roTay && typeof r.roTay === 'object') ? { ...r.roTay } : {},   // (Phần A) { khóa khoản: 1|2|3 }
  };
}

// Đích gán {g, h} còn hợp lệ với cấu trúc hiện tại không → trả {g, h} chuẩn hóa hoặc null.
// Hạng mục còn sống → lấy giai đoạn theo hạng mục; chỉ giai đoạn → h = ''.
function _tytDich(v, st) {
  if (!v) return null;
  if (v.h) {
    const hm = st.hangMuc.find(h => h.id === v.h);
    if (hm && st.giaiDoan.some(g => g.id === hm.gdId)) return { g: hm.gdId, h: hm.id };
  }
  if (v.g && st.giaiDoan.some(g => g.id === v.g)) return { g: v.g, h: '' };
  return null;
}

// Ghi cấu trúc của 1 công trình (tạo mới nếu chưa có). changes: { giaiDoan?, hangMuc?, phanBo? }
function tytSaveStruct(pid, changes) {
  const cur = tytRecordOf(pid);
  if (cur) {
    const i = tyTrongRecords.findIndex(r => r.id === cur.id);
    tyTrongRecords[i] = mkUpdate(tyTrongRecords[i], changes);
  } else {
    tyTrongRecords.unshift(mkRecord({ projectId: pid, giaiDoan: [], hangMuc: [], phanBo: {}, ...changes }));
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
// Trả về [{ key, kind, ngay, loai, nd, doiTuong, tien }]
//   kind: 'inv' (hóa đơn nhập tay) | 'cc' (nhân công / HĐ lẻ từ chấm công) | 'ungtp' | 'ungncc'
//   key : khóa ỔN ĐỊNH dùng cho phanBo — 'inv:<id>' | 'ung:<id>' | 'cc|<từ ngày>|<projectId>|<đuôi>'
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
      items: Array.isArray(inv.items) ? inv.items : null,   // (Phần A) món hàng — tách rổ theo món
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

// ══ HỢP ĐỒNG THẦU PHỤ CỦA 1 CÔNG TRÌNH (để gắn theo HĐ) ═══════════════
// Trả về [{ id, ten, tenKey (không dấu, thường), giaTri, ngay, nd }] — bỏ HĐ đã xóa
function tytHdtpOf(p) {
  return (typeof thauPhuContracts !== 'undefined' ? thauPhuContracts : [])
    .filter(r => r && !r.deletedAt && _tytMatch(r, p))
    .map(r => ({
      id: r.id, ten: (r.thauphu || '').trim(), tenKey: _tytBoDau(r.thauphu),
      giaTri: (r.giaTri || 0) + (r.phatSinh || 0), ngay: r.ngay || '', nd: r.nd || '',
    }));
}

// ══ LUẬT TỰ GÁN ══════════════════════════════════════════════════
// truong: 'nd' = Nội dung chứa · 'dt' = NCC / Thầu phụ / Người chứa · 'loai' = Loại chi phí là
// giaTri: có thể nhiều từ, cách nhau bằng dấu phẩy → khớp 1 trong các từ. So KHÔNG DẤU, không phân biệt hoa thường.
const TYT_LUAT_TRUONG = { nd: 'Nội dung chứa', dt: 'NCC / Thầu phụ chứa', loai: 'Loại chi phí là' };
function tytLuatKhop(luat, line) {
  const tus = String(luat.giaTri || '').split(',').map(_tytBoDau).filter(Boolean);
  if (!tus.length) return false;
  if (luat.truong === 'loai') return tus.includes(_tytBoDau(line.loai));
  const nguon = _tytBoDau(luat.truong === 'dt' ? line.doiTuong : line.nd);
  return tus.some(t => nguon.includes(t));
}

// ══ XẾP 1 DÒNG CHI PHÍ VÀO GIAI ĐOẠN / HẠNG MỤC ═════════════════════
// ctx: { hdtp: tytHdtpOf(p) } — truyền sẵn để khỏi tính lại mỗi dòng
// Trả về { g, h, src, ref } — src: 'tay' | 'hdtp' | 'tiento' | 'luat' | 'ngay' | '' (chưa phân bổ)
//   ref: id HĐ thầu phụ (src 'hdtp') hoặc id luật (src 'luat')
function tytResolve(line, st, ctx) {
  // 1. Gán tay
  let d = _tytDich(st.phanBo[line.key], st);
  if (d) return { ...d, src: 'tay', ref: '' };

  // 2. Theo HĐ thầu phụ: phiếu gắn thẳng HĐ (hdtpId) → HĐ đó; còn lại khớp TÊN thầu phụ
  //    (1 TP có nhiều HĐ trong cùng CT → lấy HĐ đầu tiên đã được gắn)
  const hdtps = (ctx && ctx.hdtp) || [];
  if (hdtps.length && Object.keys(st.theoHdtp).length) {
    if (line.hdtpId && st.theoHdtp[line.hdtpId] && hdtps.some(h => h.id === line.hdtpId)) {
      d = _tytDich(st.theoHdtp[line.hdtpId], st);
      if (d) return { ...d, src: 'hdtp', ref: line.hdtpId };
    }
    const k = _tytBoDau(line.doiTuong);
    if (k) {
      const hd = hdtps.find(h => h.tenKey === k && _tytDich(st.theoHdtp[h.id], st));
      if (hd) return { ..._tytDich(st.theoHdtp[hd.id], st), src: 'hdtp', ref: hd.id };
    }
  }

  // 2b. (Phần A) Tiền tố [ ] đầu nội dung: "[Móng] Mua xi măng" → hạng mục / giai đoạn có tên trùng
  //     (hoặc BẮT ĐẦU bằng chữ trong ngoặc, VD [Móng] → "Móng & Nền trệt"). Không cần tạo luật.
  const tt = /^\s*\[([^\]]+)\]/.exec(line.nd || '');
  if (tt) {
    const t = _tytBoDau(tt[1]);
    const khop = arr => arr.find(z => _tytBoDau(z.ten) === t) || arr.find(z => _tytBoDau(z.ten).startsWith(t));
    const hm = khop(st.hangMuc.filter(h => st.giaiDoan.some(g => g.id === h.gdId)));
    if (hm) return { g: hm.gdId, h: hm.id, src: 'tiento', ref: '' };
    const gd = khop(st.giaiDoan);
    if (gd) return { g: gd.id, h: '', src: 'tiento', ref: '' };
  }

  // 3. Luật — luật đứng trước được ưu tiên
  for (const lu of st.luat) {
    if (!tytLuatKhop(lu, line)) continue;
    d = _tytDich(lu, st);
    if (d) return { ...d, src: 'luat', ref: lu.id };
  }

  // 4. Mốc ngày của giai đoạn
  const gd = tytGdTheoNgay(line.ngay, st);
  return gd ? { g: gd.id, h: '', src: 'ngay', ref: '' } : { g: '', h: '', src: '', ref: '' };
}

// Giai đoạn có mốc ngày chứa ngày này (giai đoạn đứng trước được ưu tiên nếu mốc chồng nhau)
function tytGdTheoNgay(ngay, st) {
  if (!ngay) return null;
  return st.giaiDoan.find(g => (g.tu || g.den) &&
    (!g.tu || ngay >= g.tu) && (!g.den || ngay <= g.den)) || null;
}

// ══ TỔNG HỢP CHO GIAO DIỆN ══════════════════════════════════════════
// Trả về {
//   lines (đã gắn .pb = kết quả tytResolve), tongChi, tongSan, cpM2,
//   tongKhop  : tổng các dòng có khớp _ctTongChi không (tự kiểm tra công thức),
//   daPhanBo  : số tiền đã vào giai đoạn, theoLoai: [{ loai, tien, soDong }],
//   theoGD    : [{ gd, tien, hms: [{ hm, tien }], chung }], chuaPB
// }
// (bảng Phân Tích dạng cây dùng tytCay(r) bên dưới)
// opts.allYears: trọn vòng đời (xem tytCostLines). Khi đó KHÔNG so với _ctTongChi (hàm đó theo năm lọc).
function tytTongHop(p, opts) {
  const allYears = !!(opts && opts.allYears);
  const st    = tytStructOf(p.id);
  const lines = tytCostLines(p, { allYears });
  const ctx   = { hdtp: tytHdtpOf(p) };
  lines.forEach(l => { l.pb = tytResolve(l, st, ctx); });

  const tongChi = lines.reduce((s, l) => s + l.tien, 0);
  let tongKhop = true;
  if (!allYears && typeof _ctTongChi === 'function' && typeof _ctGetCosts === 'function') {
    tongKhop = Math.round(_ctTongChi(p, _ctGetCosts(p)).tongChi) === Math.round(tongChi);
  }
  const tongSan = tytTongSan(p);
  const cpM2    = tongSan > 0 ? tongChi / tongSan : 0;

  // Theo loại chi phí
  const loaiMap = new Map();
  lines.forEach(l => {
    const o = loaiMap.get(l.loai) || { loai: l.loai, tien: 0, soDong: 0 };
    o.tien += l.tien; o.soDong++;
    loaiMap.set(l.loai, o);
  });
  const theoLoai = [...loaiMap.values()].sort((a, b) => b.tien - a.tien);

  // Theo giai đoạn → hạng mục ("chung" = đã vào giai đoạn nhưng chưa rõ hạng mục)
  const theoGD = st.giaiDoan.map(gd => ({
    gd, tien: 0, chung: 0,
    hms: st.hangMuc.filter(h => h.gdId === gd.id).map(hm => ({ hm, tien: 0 })),
  }));
  const gdIdx = new Map(theoGD.map((o, i) => [o.gd.id, i]));
  let chuaPB = 0;
  lines.forEach(l => {
    if (!l.pb.g || !gdIdx.has(l.pb.g)) { chuaPB += l.tien; return; }
    const o = theoGD[gdIdx.get(l.pb.g)];
    o.tien += l.tien;
    const hmo = l.pb.h ? o.hms.find(x => x.hm.id === l.pb.h) : null;
    if (hmo) hmo.tien += l.tien; else o.chung += l.tien;
  });

  const r = { st, ctx, allYears, lines, tongChi, tongKhop, tongSan, cpM2, daPhanBo: tongChi - chuaPB, chuaPB, theoLoai, theoGD };
  _tytGanRo(r);   // (Phần A) chiều RỔ — xem khối "RỔ CHI PHÍ"
  return r;
}

// Xem trước 1 luật (đang soạn hoặc đã có): khớp bao nhiêu khoản, bao nhiêu tiền.
//   tong     : mọi khoản khớp điều kiện
//   nhan     : số khoản luật này THỰC SỰ nhận (không bị gán tay / HĐ TP / luật đứng trước giành)
function tytLuatXemTruoc(r, luat) {
  let tong = 0, tien = 0, nhan = 0, tienNhan = 0;
  r.lines.forEach(l => {
    if (!tytLuatKhop(luat, l)) return;
    tong++; tien += l.tien;
    if (luat.id ? (l.pb.src === 'luat' && l.pb.ref === luat.id)
                : (!l.pb.g || l.pb.src === 'ngay')) { nhan++; tienNhan += l.tien; }
  });
  return { tong, tien, nhan, tienNhan };
}

// Tổng tiền / số khoản đang được xếp theo từng HĐ thầu phụ (src 'hdtp') + tổng khoản của TP đó
function tytHdtpThongKe(r) {
  const m = new Map();
  r.ctx.hdtp.forEach(h => m.set(h.id, { soKhoan: 0, tien: 0, nhan: 0, tienNhan: 0 }));
  r.lines.forEach(l => {
    if (l.pb.src === 'hdtp' && m.has(l.pb.ref)) { const o = m.get(l.pb.ref); o.nhan++; o.tienNhan += l.tien; }
    const hd = (l.hdtpId && m.has(l.hdtpId)) ? l.hdtpId
      : (r.ctx.hdtp.find(h => h.tenKey && h.tenKey === _tytBoDau(l.doiTuong)) || {}).id;
    if (hd && m.has(hd)) { const o = m.get(hd); o.soKhoan++; o.tien += l.tien; }
  });
  return m;
}

// ══════════════════════════════════════════════════════════════════════════════
// ══ RỔ CHI PHÍ — CHIỀU THỨ 2 "TAG KÉP" (07/10/2026 — Cải tiến Phần A) ═══════════
// ══════════════════════════════════════════════════════════════════════════════
// Mỗi khoản chi mang 2 nhãn ĐỘC LẬP:
//   • Giai đoạn / Hạng mục (ở đâu — bóc tách kỹ thuật)  → tytResolve (như cũ)
//   • RỔ (thuộc gói nào — lãi lỗ / giá khoán)           → _tytRoPart (dưới đây)
// 3 rổ:  1 = Gói thô & nhân công hoàn thiện (CHUẨN tính đ/m2 báo giá)
//        2 = Phần chủ nhà & ngoài gói chuẩn (ép cọc, tháo dỡ, gạch ốp lát, thiết kế...)
//        3 = Chi phí hoạt động công ty lỡ nhập vào công trình (mua / sửa máy, văn phòng...)
//        0 = Chưa xếp rổ (chấm đỏ — phải xử lý)
// Chi phí chung thật của công ty nằm ở công trình "CÔNG TY" — KHÔNG trộn vào đây.
//
// CẤU HÌNH RỔ DÙNG CHUNG MỌI CÔNG TRÌNH — 1 bản ghi kind:'cauhinh' trong tytrong_v1 (không projectId):
//   { kind:'cauhinh', roLoai: { <tên loại không dấu>: 0|1|2|3 },   // người dùng chỉnh (ghi đè mặc định)
//     roLuat: [{ id, loai, tuKhoa, ro }] }                          // luật rổ theo từ khóa, xét theo thứ tự
// Chưa có bản ghi → dùng mặc định (tytRoMacDinh + TYT_RO_LUAT_MAC_DINH).
//
// THỨ TỰ XẾP RỔ cho 1 khoản (hoặc 1 MÓN của hóa đơn chi tiết):
//   ① gán tay (st.roTay[khóa khoản]) → ② HĐ thầu phụ (theoHdtp[id].ro) → ③ luật rổ từ khóa
//   → ④ bảng Loại chi phí → Rổ (người dùng chỉnh) → ⑤ mặc định theo tên loại → Chưa xếp.
// HÓA ĐƠN CHI TIẾT có ≥ 2 món → tách từng MÓN (tiền chia theo thành tiền món, khớp đúng tổng hóa đơn)
//   để 1 bill điện nước có cả "ống" (Rổ 1) lẫn "bóng đèn" (Rổ 2) được xếp đúng. Giai đoạn vẫn tính
//   theo nguyên hóa đơn.

const TYT_RO = {
  1: { ten: 'Rổ 1 · Gói thô & NC hoàn thiện', ngan: 'Rổ 1', mo: 'Chuẩn tính đ/m2 báo giá' },
  2: { ten: 'Rổ 2 · Chủ nhà & ngoài gói',     ngan: 'Rổ 2', mo: 'Ép cọc, tháo dỡ, gạch ốp lát, thiết kế…' },
  3: { ten: 'Rổ 3 · Chi phí công ty',          ngan: 'Rổ 3', mo: 'Mua / sửa máy, văn phòng… lỡ nhập vào CT' },
  0: { ten: 'Chưa xếp rổ',                     ngan: 'Chưa xếp', mo: 'Cần chọn rổ' },
};

// Khóa so sánh tên loại chi phí: không dấu, thường, gộp khoảng trắng
function tytLoaiKey(loai) { return _tytBoDau(loai).replace(/\s+/g, ' ').trim(); }

// Rổ MẶC ĐỊNH theo tên loại (dựa trên danh mục thật của công ty). Không chắc → 0 (Chưa xếp).
// Xét Rổ 3 → Rổ 2 → Rổ 1 (VD "Mua Máy - Thiết Bị" là Rổ 3 dù có chữ "thiết bị").
const _TYT_RO_TU = [
  [3, ['mua may', 'sua may', 'khau hao', 'van phong', 'bao hiem xa hoi']],
  [2, ['ep coc', 'thao do', 'gach op', 'op lat', 'gia dung', 'thiet ke', 'xin phep', 'da hoa cuong']],
  [1, ['sat thep', 'be tong', 'dao dat', 'san lap', 'nhan cong', 'copha', 'vat lieu', 'vat tu', 'dien nuoc',
       'thau phu', 'van chuyen', 'thue may', 'giai khat', 'xa ban', 'giu cong trinh', 'hoa don le', 'do thi', 'ngoai giao']],
];
function tytRoMacDinh(loai) {
  const k = tytLoaiKey(loai);
  if (!k) return 0;
  for (const [ro, tus] of _TYT_RO_TU) if (tus.some(t => k.includes(t))) return ro;
  return 0;
}

// Luật rổ mặc định (theo file "Cải tiến tab tỉ trọng") — loai: điều kiện loại chi phí (chứa, không dấu; '' = mọi loại)
const TYT_RO_LUAT_MAC_DINH = [
  { loai: 'Điện Nước',          tuKhoa: 'bóng đèn, đèn led, công tắc, ổ cắm, bồn cầu, vòi sen, lavabo, máy bơm, máy nước nóng', ro: 2 },
  { loai: '',                   tuKhoa: 'ép cọc, tháo dỡ, thang máy', ro: 2 },   // (Phần B) + thang máy: thiết bị của chủ nhà
  { loai: 'Vật Liệu Xây Dựng',  tuKhoa: 'gạch ốp, gạch lát, gạch men, gạch granite, đá hoa cương, granite', ro: 2 },
  { loai: 'Khác',               tuKhoa: 'xà bần, giải khát, đô thị, giữ công trình', ro: 1 },
];

// Bản ghi cấu hình (mới nhất) — null nếu chưa có
function _tytRoCfgRec() {
  const list = (tyTrongRecords || []).filter(r => r && !r.deletedAt && r.kind === 'cauhinh');
  return list.length ? list.reduce((a, b) => ((b.updatedAt || 0) > (a.updatedAt || 0) ? b : a)) : null;
}
// Cấu hình đang dùng (bản sao an toàn): { roLoai, roLuat, truLoai, quyMuc, coBanGhi }
//   (Phần B) truLoai: { <tên loại không dấu>: 'sat'|'bt'|'nc'|'tp'|'quy'|'' } — trụ cột Rổ 1 người dùng chỉnh
//            quyMuc : mức Quỹ phụ phí đ/m2 dùng chung (mặc định 50.000)
function tytRoCfg() {
  const r = _tytRoCfgRec();
  return {
    roLoai: (r && r.roLoai && typeof r.roLoai === 'object') ? { ...r.roLoai } : {},
    roLuat: (r && Array.isArray(r.roLuat)) ? r.roLuat.map(l => ({ ...l }))
      : TYT_RO_LUAT_MAC_DINH.map((l, i) => ({ id: 'rd' + i, ...l })),
    truLoai: (r && r.truLoai && typeof r.truLoai === 'object') ? { ...r.truLoai } : {},
    quyMuc: (r && +r.quyMuc >= 0 && r.quyMuc !== '' && r.quyMuc !== null && r.quyMuc !== undefined) ? +r.quyMuc : TYT_QUY_MUC_MAC_DINH,
    coBanGhi: !!r,
  };
}
function tytSaveRoCfg(changes) {
  const cur = _tytRoCfgRec();
  if (cur) {
    const i = tyTrongRecords.findIndex(r => r.id === cur.id);
    tyTrongRecords[i] = mkUpdate(tyTrongRecords[i], changes);
  } else {
    const base = tytRoCfg();
    tyTrongRecords.unshift(mkRecord({ kind: 'cauhinh', roLoai: base.roLoai, roLuat: base.roLuat,
      truLoai: base.truLoai, quyMuc: base.quyMuc, ...changes }));
  }
  save('tytrong_v1', tyTrongRecords);
}

// Rổ của 1 LOẠI theo bảng ánh xạ: { ro, src: 'loai' (người dùng chỉnh) | 'macdinh' }
function tytRoCuaLoai(loai, cfg) {
  const k = tytLoaiKey(loai);
  if (cfg && Object.prototype.hasOwnProperty.call(cfg.roLoai, k)) return { ro: +cfg.roLoai[k] || 0, src: 'loai' };
  return { ro: tytRoMacDinh(loai), src: 'macdinh' };
}

// Luật rổ có khớp 1 món không
function tytRoLuatKhop(lu, line, part) {
  if (lu.loai && !tytLoaiKey(line.loai).includes(tytLoaiKey(lu.loai))) return false;
  const tus = String(lu.tuKhoa || '').split(',').map(_tytBoDau).filter(Boolean);
  if (!tus.length) return false;
  const txt = _tytBoDau((part.ten || '') + ' ' + (line.doiTuong || '') + (part.mon ? '' : ' ' + (line.nd || '')));
  return tus.some(t => txt.includes(t));
}

// HĐ thầu phụ của 1 khoản có cấu hình trường `field` ('ro') — dùng chung quy tắc khớp với giai đoạn
function _tytHdtpCo(line, st, ctx, ok) {
  const hdtps = (ctx && ctx.hdtp) || [];
  if (!hdtps.length) return null;
  if (line.hdtpId && hdtps.some(h => h.id === line.hdtpId) && ok(st.theoHdtp[line.hdtpId])) return line.hdtpId;
  const k = _tytBoDau(line.doiTuong);
  const hd = k ? hdtps.find(h => h.tenKey === k && ok(st.theoHdtp[h.id])) : null;
  return hd ? hd.id : null;
}

// Rổ của 1 MÓN: { ro, src, ref }
function _tytRoPart(line, part, st, ctx, cfg) {
  const tay = st.roTay[line.key];
  const c = v => ([1, 2, 3].includes(+v) ? +v : 0);
  if (tay) return { ro: c(tay), src: 'tay', ref: '' };
  const hd = _tytHdtpCo(line, st, ctx, v => v && v.ro);
  if (hd) return { ro: c(st.theoHdtp[hd].ro), src: 'hdtp', ref: hd };
  for (const lu of cfg.roLuat) if (tytRoLuatKhop(lu, line, part)) return { ro: c(lu.ro), src: 'luat', ref: lu.id };
  const m = tytRoCuaLoai(line.loai, cfg);
  return { ro: m.ro, src: m.src, ref: '' };
}

// Tách 1 khoản thành các MÓN để xếp rổ. Hóa đơn chi tiết ≥ 2 món → chia tiền theo thành tiền món
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

// Gắn rổ cho mọi khoản của kết quả tytTongHop + tổng theo rổ. Ghi vào r: r.cfg, r.theoRo, r.theoTru (Phần B),
//   r.cpM2Ro1, line.parts[] (mỗi món: { ten, tien, mon, ro, roSrc, roRef, tru, truSrc }), line.roChinh (rổ chiếm nhiều tiền nhất)
function _tytGanRo(r) {
  const cfg = tytRoCfg();
  const theoRo = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const theoTru = { sat: 0, bt: 0, nc: 0, tp: 0, quy: 0, '': 0 };   // (Phần B) tiền Rổ 1 theo trụ cột
  r.lines.forEach(l => {
    l.parts = tytTachMon(l).map(pt => {
      const x = _tytRoPart(l, pt, r.st, r.ctx, cfg);
      theoRo[x.ro] = (theoRo[x.ro] || 0) + pt.tien;
      const o = { ...pt, ro: x.ro, roSrc: x.src, roRef: x.ref, tru: null, truSrc: '' };
      if (x.ro === 1) {
        const t = _tytTruPart(l, pt, cfg);
        o.tru = t.tru; o.truSrc = t.src;
        theoTru[t.tru] += pt.tien;
      }
      return o;
    });
    const by = {};
    l.parts.forEach(pt => { by[pt.ro] = (by[pt.ro] || 0) + pt.tien; });
    l.roChinh = +Object.keys(by).sort((a, b) => by[b] - by[a])[0];
    l.roNhieu = Object.keys(by).length > 1;
  });
  r.cfg = cfg;
  r.theoRo = theoRo;
  r.theoTru = theoTru;
  r.cpM2Ro1 = r.tongSan > 0 ? theoRo[1] / r.tongSan : 0;
  r.chuaRo = r.lines.filter(l => l.parts.some(pt => pt.ro === 0));
}

// ── CẤU THÀNH: nhóm loại chi phí theo bản chất — dùng cho cột "Tách cấu thành" (góc nhìn Giai đoạn)
//   vt = Vật tư · nc = Nhân công · tp = Khoán thầu phụ · khac = Phụ phí / khác
function tytCauThanh(loai) {
  const k = tytLoaiKey(loai);
  if (k.includes('nhan cong')) return 'nc';
  if (k.includes('thau phu') || k.startsWith('thi cong')) return 'tp';
  if (['giai khat', 'xa ban', 'giu cong trinh', 'hoa don le', 'do thi', 'ngoai giao', 'thiet ke', 'xin phep',
       'khao sat', 'van phong', 'bao hiem', 'khac'].some(t => k.includes(t))) return 'khac';
  return 'vt';
}
const TYT_CT_TEN = { vt: 'Vật tư', nc: 'Nhân công', tp: 'Khoán TP', khac: 'Khác' };

// ── CÂY THEO RỔ (góc nhìn Lợi nhuận): Rổ → Loại chi phí → từng khoản (hoặc món).
//   (Phần B) Rổ 1 chèn thêm cấp TRỤ CỘT: Rổ 1 → Sắt thép / Bê tông / Nhân công / Thầu phụ phụ trợ /
//   Quỹ phụ phí (/ Chưa xếp trụ cột) → Loại → khoản.
// Node như tytCay; kind 'ro' có .ro, kind 'tru' có .tru. Rổ 0 (Chưa xếp) chỉ hiện khi có tiền.
function tytCayRo(r) {
  // Nhóm các món theo loại chi phí → node 'loai' (con = từng khoản / món, mới nhất trước)
  const nhomLoai = (ks, prefix, ro) => {
    const m = new Map();
    ks.forEach(k => {
      const o = m.get(k.l.loai) || { loai: k.l.loai, tien: 0, ks: [] };
      o.tien += k.pt.tien; o.ks.push(k);
      m.set(k.l.loai, o);
    });
    return [...m.values()].sort((a, b) => b.tien - a.tien).map(o => {
      const lk = prefix + '|L:' + o.loai;
      return {
        key: lk, kind: 'loai', ten: o.loai, tien: o.tien, soDong: o.ks.length, ro,
        children: o.ks.sort((a, b) => String(b.l.ngay).localeCompare(String(a.l.ngay))).map(k => ({
          key: lk + '|K:' + k.l.key + '#' + k.i, kind: 'line', ten: k.pt.mon ? k.pt.ten : k.l.nd,
          tien: k.pt.tien, line: k.l, part: k.pt, ro, children: [],
        })),
      };
    });
  };
  const out = [];
  [1, 2, 3, 0].forEach(ro => {
    const rk = 'R:' + ro;
    const ks = [];
    r.lines.forEach(l => l.parts.forEach((pt, i) => { if (pt.ro === ro) ks.push({ l, pt, i }); }));
    let children;
    if (ro === 1) {
      children = TYT_TRU_THU_TU.map(t => {
        const tk = rk + '|T:' + t;
        const kt = ks.filter(k => k.pt.tru === t);
        return { key: tk, kind: 'tru', tru: t, ro, ten: TYT_TRU[t].ten, tien: kt.reduce((s, k) => s + k.pt.tien, 0), children: nhomLoai(kt, tk, ro) };
      }).filter(n => n.tien || TYT_TRU_DS.includes(n.tru));   // 4 trụ cột luôn hiện; Quỹ / Chưa xếp chỉ khi có tiền
    } else children = nhomLoai(ks, rk, ro);
    const tien = r.theoRo[ro] || 0;
    if (ro === 0 && !tien) return;
    out.push({ key: rk, kind: 'ro', ro, ten: TYT_RO[ro].ten, tien, children });
  });
  return out;
}

// ══ CÂY MA TRẬN cho bảng PHÂN TÍCH (05/10/2026 — Lần 2) ════════════════════
// Tách bạch 2 chiều dữ liệu:
//   • "Ở ĐÂU"  = Giai đoạn → Hạng mục (người dùng gán)
//   • "LÀ GÌ"  = Loại chi phí (đã có sẵn trên hóa đơn — KHÔNG phải gán)
// Mỗi khoản chi chỉ nằm ở 01 nhánh → không bao giờ đếm trùng. Bấm [+] một hạng mục thì
// hệ thống tự chẻ nhỏ theo loại chi phí, bấm tiếp loại chi phí thì ra từng khoản chi.
// Node: { key, kind: 'gd'|'hm'|'chung'|'chua'|'loai'|'line', ten, tien, soDong?, line?, children[] }
//   key ổn định (để nhớ trạng thái mở/đóng): 'G:<gdId>' · '…|H:<hmId>' · '…|H:_' (chưa rõ hạng mục)
//                                           · 'G:_' (chưa phân bổ) · '…|L:<loại>' · '…|K:<khóa khoản chi>'
function _tytSum(lines) { return lines.reduce((s, l) => s + l.tien, 0); }

// Nhóm các khoản chi theo loại chi phí → node 'loai' (con = từng khoản chi, mới nhất trước)
function _tytNhomLoai(lines, prefix) {
  const m = new Map();
  lines.forEach(l => {
    const o = m.get(l.loai) || { loai: l.loai, tien: 0, lines: [] };
    o.tien += l.tien; o.lines.push(l);
    m.set(l.loai, o);
  });
  return [...m.values()].sort((a, b) => b.tien - a.tien).map(o => {
    const k = prefix + '|L:' + o.loai;
    return {
      key: k, kind: 'loai', ten: o.loai, tien: o.tien, soDong: o.lines.length,
      ct: { [tytCauThanh(o.loai)]: o.tien },   // (Phần A) cấu thành của loại này
      children: o.lines.slice().sort((a, b) => String(b.ngay).localeCompare(String(a.ngay)))
        .map(l => ({ key: k + '|K:' + l.key, kind: 'line', ten: l.nd, tien: l.tien, line: l, children: [] })),
    };
  });
}

// r = kết quả tytTongHop(p). Trả về mảng node cấp 1 (các giai đoạn + "Chưa phân bổ" cuối cùng)
function tytCay(r) {
  const st = r.st;
  const nodes = st.giaiDoan.map(gd => {
    const gk  = 'G:' + gd.id;
    const gl  = r.lines.filter(l => l.pb.g === gd.id);
    const hms = st.hangMuc.filter(h => h.gdId === gd.id);
    let children;
    if (hms.length) {
      children = hms.map(h => {
        const hk = gk + '|H:' + h.id;
        const hl = gl.filter(l => l.pb.h === h.id);
        return { key: hk, kind: 'hm', ten: h.ten, tien: _tytSum(hl), children: _tytNhomLoai(hl, hk) };
      });
      // Đã vào giai đoạn (VD theo mốc ngày) nhưng chưa gán hạng mục nào
      const chung = gl.filter(l => !l.pb.h);
      if (chung.length) children.push({ key: gk + '|H:_', kind: 'chung', ten: '(chưa rõ hạng mục)', tien: _tytSum(chung), children: _tytNhomLoai(chung, gk + '|H:_') });
    } else {
      children = _tytNhomLoai(gl, gk);   // giai đoạn không chia hạng mục → tách thẳng theo loại
    }
    return { key: gk, kind: 'gd', ten: gd.ten, tien: _tytSum(gl), children };
  });
  const chua = r.lines.filter(l => !l.pb.g);
  if (chua.length) nodes.push({ key: 'G:_', kind: 'chua', ten: 'Chưa phân bổ', tien: _tytSum(chua), children: _tytNhomLoai(chua, 'G:_') });
  // (Phần A) cộng dồn cấu thành từ cấp Loại lên Hạng mục / Giai đoạn
  const cong = n => {
    if (n.kind === 'loai' || n.kind === 'line') return n.ct || {};
    n.ct = {};
    n.children.forEach(c => { const x = cong(c); Object.keys(x).forEach(k => { n.ct[k] = (n.ct[k] || 0) + x[k]; }); });
    return n.ct;
  };
  nodes.forEach(cong);
  return nodes;
}

// Tên hạng mục có giống TÊN LOẠI CHI PHÍ không (VD "Nhân công thô", "Sắt thép móng")
// → cảnh báo nhẹ ở tab Thiết lập: hạng mục nên là VỊ TRÍ, loại chi phí đã có trên hóa đơn.
const _TYT_TU_LOAI = ['sat thep', 'nhan cong', 'be tong', 'thau phu', 'vat lieu', 'vat tu', 'dien nuoc', 'copha', 'xi mang'];
function _tytBoDau(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().trim();
}
function tytGiongLoaiCP(ten) {
  const t = _tytBoDau(ten);
  if (!t) return '';
  const tu = new Set(_TYT_TU_LOAI);
  const ds = (typeof cats !== 'undefined' && cats && Array.isArray(cats.loaiChiPhi)) ? cats.loaiChiPhi : [];
  ds.forEach(n => _tytBoDau(n).split(/\s*[-\/]\s*/).forEach(w => { if (w.length >= 4) tu.add(w); }));
  return [...tu].find(w => t.includes(w)) || '';
}

// ══ MẪU CHUẨN GIAI ĐOẠN & HẠNG MỤC (06/10/2026 — Lần 3, làm lại theo mẫu người dùng) ═══════
// Dùng cho nút "Dùng mẫu gợi ý" và là nguồn "Mẫu chuẩn" khi sao chép cấu trúc. Hạng mục = VỊ TRÍ / PHẦN VIỆC.
const TYT_MAU_CHUAN = [
  ['Tiền thi công', ['Tháo dỡ công trình cũ']],
  ['Thi công thô', ['Móng & Nền trệt', 'Thi công khung nhà', 'Mái: BTCT, ngói, tôn', 'Xây tô tường, trần, sàn', 'Hệ thống âm tường, sàn']],
  ['Thi công hoàn thiện', ['Ốp lát gạch & Đá hoa cương', 'Sơn nước, phào chỉ, trần', 'Cửa, lan can, khung bảo vệ', 'Lắp đặt TBVS & Thiết bị điện']],
  ['Hoàn thiện nội & ngoại thất', ['Nội thất liền tường & rời', 'Ngoại thất, sân vườn, tiểu cảnh']],
];
function tytMauGoiY() {
  const giaiDoan = [], hangMuc = [];
  TYT_MAU_CHUAN.forEach(([tenGd, hms]) => {
    const g = { id: tytNewId('g'), ten: tenGd, tu: '', den: '' };
    giaiDoan.push(g);
    hms.forEach(t => hangMuc.push({ id: tytNewId('h'), gdId: g.id, ten: t }));
  });
  return { giaiDoan, hangMuc, luat: [] };
}

// ══ SAO CHÉP CẤU TRÚC / LUẬT TỪ CÔNG TRÌNH KHÁC (06/10/2026 — Lần 3) ══════════
// GỘP theo TÊN (không phân biệt dấu / hoa thường) — KHÔNG xóa gì của công trình đích:
//   • cauTruc: giai đoạn / hạng mục nào đích chưa có (theo tên) thì thêm (id mới). opts.ngay → chép
//              cả mốc ngày cho giai đoạn mới thêm.
//   • luat   : mỗi luật nguồn → tìm giai đoạn / hạng mục CÙNG TÊN ở đích; không có → bỏ qua (boQua).
//              Trùng điều kiện (trường + giá trị) với luật đích đang có → bỏ qua (trung).
// src: { giaiDoan, hangMuc, luat } (tytStructOf(pid nguồn) hoặc tytMauGoiY()).
// dst: cấu trúc đích (tytStructOf(pid đích)) — bị SỬA TRỰC TIẾP; người gọi tự tytSaveStruct.
// Trả về { gdMoi, hmMoi, luatMoi, boQua, trung }.
function tytSaoChep(src, dst, opts) {
  opts = opts || {};
  const k = t => _tytBoDau(t);
  const res = { gdMoi: 0, hmMoi: 0, luatMoi: 0, boQua: 0, trung: 0 };
  const findGd = ten => dst.giaiDoan.find(g => k(g.ten) === k(ten));
  const findHm = (gdId, ten) => dst.hangMuc.find(h => h.gdId === gdId && k(h.ten) === k(ten));
  if (opts.cauTruc) {
    src.giaiDoan.forEach(sg => {
      let g = findGd(sg.ten);
      if (!g) {
        g = { id: tytNewId('g'), ten: sg.ten, tu: opts.ngay ? (sg.tu || '') : '', den: opts.ngay ? (sg.den || '') : '' };
        dst.giaiDoan.push(g); res.gdMoi++;
      }
      src.hangMuc.filter(h => h.gdId === sg.id).forEach(sh => {
        if (!findHm(g.id, sh.ten)) { dst.hangMuc.push({ id: tytNewId('h'), gdId: g.id, ten: sh.ten }); res.hmMoi++; }
      });
    });
    // Xếp giai đoạn theo ĐÚNG thứ tự của nguồn (giai đoạn chỉ có ở đích giữ nguyên, đứng sau)
    const thuTu = src.giaiDoan.map(g => k(g.ten));
    const viTri = g => { const i = thuTu.indexOf(k(g.ten)); return i < 0 ? thuTu.length : i; };
    dst.giaiDoan.sort((x1, x2) => viTri(x1) - viTri(x2));
  }
  if (opts.luat) {
    (src.luat || []).forEach(lu => {
      const sg = src.giaiDoan.find(g => g.id === lu.g);
      const sh = lu.h ? src.hangMuc.find(h => h.id === lu.h) : null;
      const g = sg ? findGd(sg.ten) : null;
      const h = (g && sh) ? findHm(g.id, sh.ten) : null;
      if (!g || (sh && !h)) { res.boQua++; return; }
      if (dst.luat.some(z => z.truong === lu.truong && k(z.giaTri) === k(lu.giaTri))) { res.trung++; return; }
      dst.luat.push({ id: tytNewId('r'), truong: lu.truong, giaTri: lu.giaTri, g: g.id, h: h ? h.id : '' });
      res.luatMoi++;
    });
  }
  return res;
}

// ══ NHÓM CÔNG TRÌNH CÙNG CẤU TRÚC (06/10/2026 — Lần 3) ════════════════════
// "Cùng mẫu" = cùng TẬP giai đoạn + cùng tập hạng mục trong mỗi giai đoạn — so theo tên không dấu,
// KHÔNG kể thứ tự (dán luật rồi dán cấu trúc có thể làm thứ tự giai đoạn khác nhau nhưng vẫn là 1 mẫu).
// CT chưa có giai đoạn → không vào nhóm nào.
function tytCauTrucKey(st) {
  if (!st || !st.giaiDoan.length) return '';
  return st.giaiDoan.map(g => _tytBoDau(g.ten) + ':' +
    st.hangMuc.filter(h => h.gdId === g.id).map(h => _tytBoDau(h.ten)).sort().join(',')).sort().join('|');
}
// projs → [{ key, st (cấu trúc của CT đầu tiên), projs: [...] }] — nhóm đông CT trước
function tytNhomCauTruc(projs) {
  const m = new Map();
  projs.forEach(p => {
    const st = tytStructOf(p.id);
    const key = tytCauTrucKey(st);
    if (!key) return;
    if (!m.has(key)) m.set(key, { key, st, projs: [] });
    m.get(key).projs.push(p);
  });
  return [...m.values()].sort((a, b) => b.projs.length - a.projs.length);
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

// Đơn giá đ/m2 theo giai đoạn + hạng mục từ 1 kết quả gom { theoGD, chuaPB } (xem tytGomGd)
//   dgGd: { <tên GĐ>: đ/m2, 'Chưa phân bổ': đ/m2 } · dgHm: { 'Tên GĐ › Tên HM': đ/m2 } — chỉ ghi ô có tiền
function _tytDgGdHm(g, san) {
  const dgGd = {}, dgHm = {};
  g.theoGD.forEach(o => { if (o.tien) dgGd[o.gd.ten] = Math.round(o.tien / san); });
  if (g.chuaPB) dgGd['Chưa phân bổ'] = Math.round(g.chuaPB / san);
  g.theoGD.forEach(o => o.hms.forEach(x => { if (x.tien) dgHm[o.gd.ten + ' › ' + x.hm.ten] = Math.round(x.tien / san); }));
  return { dgGd, dgHm };
}

// Các trường số liệu của 1 định mức lấy từ kết quả tytTongHop(p) của công trình nguồn
function _tytDmFields(p, r) {
  const san = r.tongSan;
  const dgLoai = {};
  r.theoLoai.forEach(o => { dgLoai[o.loai] = Math.round(o.tien / san); });
  // Toàn bộ chi phí (như cũ) — (Lần 3) đơn giá theo hạng mục khóa "Tên GĐ › Tên HM"
  const all = _tytDgGdHm(r, san);
  // (Phần B) chỉ Rổ 1: tổng, 4 trụ cột + quỹ phụ phí, giai đoạn / hạng mục
  const r1 = _tytDgGdHm(tytGomGd(r, pt => pt.ro === 1), san);
  const ro1 = {};
  TYT_TRU_THU_TU.forEach(t => { ro1[t === '' ? 'khac' : t] = Math.round((r.theoTru[t] || 0) / san); });
  return {
    loaiCT: p.loaiCongTrinh || '', nguonPid: p.id, nguonTen: p.name, nam: r.allYears ? 'Trọn vòng đời' : tytNhanNam(),
    tongSan: Math.round(san * 100) / 100, tongChi: r.tongChi, dgTong: Math.round(r.tongChi / san), dgLoai,
    dgGd: all.dgGd, dgHm: all.dgHm,
    dgRo1: Math.round(r.theoRo[1] / san), ro1, dgGdR1: r1.dgGd, dgHmR1: r1.dgHm, nhapTay: false,
  };
}

// Tạo định mức từ kết quả tytTongHop(p) của công trình nguồn. Trả về bản ghi vừa tạo.
function tytTaoDinhMuc(p, r, ten) {
  const rec = mkRecord({ kind: 'dinhmuc', ten: (ten || '').trim() || ('Định mức ' + p.name), ..._tytDmFields(p, r) });
  tyTrongRecords.unshift(rec);
  save('tytrong_v1', tyTrongRecords);
  return rec;
}

// (Phần B) Định mức NHẬP TAY (định mức an toàn): chỉ có 4 trụ cột Rổ 1 (đ/m2). ro1 = { sat, bt, nc, tp }
function tytTaoDinhMucTay(ten, ro1) {
  const rec = mkRecord({
    kind: 'dinhmuc', ten: (ten || '').trim() || 'Định mức nhập tay', nhapTay: true, nam: 'Nhập tay',
    loaiCT: '', nguonPid: '', nguonTen: '', tongSan: 0, tongChi: 0, dgTong: 0, dgLoai: {}, dgGd: {}, dgHm: {},
    ro1: { ...ro1 }, dgRo1: TYT_TRU_DS.reduce((s, t) => s + (+ro1[t] || 0), 0), dgGdR1: {}, dgHmR1: {},
  });
  tyTrongRecords.unshift(rec);
  save('tytrong_v1', tyTrongRecords);
  return rec;
}

// (Phần B) Cập nhật lại số liệu định mức từ CT nguồn (giữ tên + id) — dùng cho định mức lưu trước Phần B
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
// ══ KIỂM SOÁT ĐỊNH MỨC RỔ 1 (07/10/2026 — Cải tiến Phần B) ═══════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// Chỉ xét RỔ 1 (gói thô & NC hoàn thiện). Rổ 1 chia thành 4 TRỤ CỘT + 1 QUỸ PHỤ PHÍ:
//   sat = Sắt thép · bt = Bê tông (kèm VLXD thô: cát, đá, xi măng, gạch xây, copha, đào đất, vận chuyển)
//   nc  = Nhân công · tp = Thầu phụ phụ trợ (khoán TP + vật tư hệ thống: điện nước, sơn, điện lạnh…)
//   quy = Quỹ phụ phí — CHỈ 6 loại lặt vặt: Giải Khát, Xà Bần - Đổ Rác, Giữ Công Trình, Hóa Đơn Lẻ,
//         Đô Thị, Ngoại Giao (người dùng chốt: vật tư phụ KHÔNG vào quỹ, phải thuộc 4 trụ cột)
//   ''  = Chưa xếp trụ cột (loại lạ) — chọn ở bảng Loại chi phí → Rổ (tab Thiết lập)
// Trụ cột theo LOẠI CHI PHÍ: bảng người dùng chỉnh (cfg.truLoai) → mặc định theo tên loại.
// Quỹ phụ phí kiểm soát bằng 1 MỨC đ/m2 dùng chung (cfg.quyMuc, mặc định 50.000) — chỉ báo đỏ khi
// TỔNG các khoản lặt vặt vượt mức, không canh từng ly cà phê.
const TYT_TRU = {
  sat: { ten: 'Sắt thép',          mo: 'Sắt thép, thi công sắt thép' },
  bt:  { ten: 'Bê tông',           mo: 'Bê tông, copha, VLXD thô (cát, đá, xi măng, gạch xây), đào đất, vận chuyển' },
  nc:  { ten: 'Nhân công',         mo: 'Nhân công chấm công, phụ cấp' },
  tp:  { ten: 'Thầu phụ phụ trợ',  mo: 'Khoán thầu phụ + vật tư hệ thống (điện nước, sơn, điện lạnh…)' },
  quy: { ten: 'Quỹ phụ phí',       mo: 'Giải khát, xà bần, giữ CT, hóa đơn lẻ, đô thị, ngoại giao' },
  '':  { ten: 'Chưa xếp trụ cột',  mo: 'Chọn trụ cột ở tab Thiết lập' },
};
const TYT_TRU_DS = ['sat', 'bt', 'nc', 'tp'];               // 4 trụ cột có định mức riêng
const TYT_TRU_THU_TU = ['sat', 'bt', 'nc', 'tp', 'quy', ''];  // thứ tự hiển thị
const TYT_QUY_MUC_MAC_DINH = 50000;

// Từ khóa (không dấu) trong TÊN LOẠI → trụ cột. Xét từ trên xuống (VD "Thi Công Sắt Thép" → Sắt thép
// trước khi gặp "thi cong" của Thầu phụ; "Đổ Bê Tông" → Bê tông).
const _TYT_QUY_TU = ['giai khat', 'xa ban', 'giu cong trinh', 'hoa don le', 'do thi', 'ngoai giao'];
const _TYT_TRU_TU = [
  ['quy', _TYT_QUY_TU],
  ['nc',  ['nhan cong', 'phu cap', 'bao hiem tai nan']],
  ['sat', ['sat thep']],
  ['bt',  ['be tong', 'copha', 'vat lieu', 'dao dat', 'san lap', 'van chuyen', 'thue may', 'xi mang']],
  ['tp',  ['thau phu', 'thi cong', 'dien nuoc', 'vat tu', 'tiep dia', 'dien lanh']],
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
// Trụ cột của 1 MÓN thuộc Rổ 1. Loại chưa có trụ cột (VD "Khác" được luật rổ kéo vào Rổ 1 vì "xà bần")
// → nội dung có chữ lặt vặt của quỹ thì vào Quỹ phụ phí (src 'tukhoa').
function _tytTruPart(line, part, cfg) {
  const m = tytTruCuaLoai(line.loai, cfg);
  if (m.tru) return m;
  const txt = _tytBoDau((part.ten || '') + ' ' + (part.mon ? '' : (line.nd || '')));
  if (_TYT_QUY_TU.some(w => txt.includes(w))) return { tru: 'quy', src: 'tukhoa' };
  return m;
}

// Gom tiền theo Giai đoạn → Hạng mục nhưng CHỈ lấy các món thỏa loc(part, line) (VD chỉ Rổ 1).
// Trả về { theoGD: [{ gd, tien, chung, hms: [{ hm, tien }] }], chuaPB, tong } — cùng dạng r.theoGD.
function tytGomGd(r, loc) {
  const st = r.st;
  const theoGD = st.giaiDoan.map(gd => ({
    gd, tien: 0, chung: 0, hms: st.hangMuc.filter(h => h.gdId === gd.id).map(hm => ({ hm, tien: 0 })),
  }));
  const idx = new Map(theoGD.map((o, i) => [o.gd.id, i]));
  let chuaPB = 0, tong = 0;
  r.lines.forEach(l => {
    const t = (l.parts || []).reduce((s, pt) => s + (loc(pt, l) ? pt.tien : 0), 0);
    if (!t) return;
    tong += t;
    if (!l.pb.g || !idx.has(l.pb.g)) { chuaPB += t; return; }
    const o = theoGD[idx.get(l.pb.g)];
    o.tien += t;
    const h = l.pb.h ? o.hms.find(z => z.hm.id === l.pb.h) : null;
    if (h) h.tien += t; else o.chung += t;
  });
  return { theoGD, chuaPB, tong };
}

// Định mức có số liệu Rổ 1 theo trụ cột chưa (định mức lưu trước Phần B thì chưa)
function tytDmCoRo1(dm) { return !!(dm && dm.ro1 && TYT_TRU_DS.some(t => +dm.ro1[t] > 0)); }

// KIỂM SOÁT RỔ 1 của 1 công trình: ngân sách = diện tích × định mức đ/m2 từng trụ cột
//   (Quỹ phụ phí dùng mức chung cfg.quyMuc; "Chưa xếp trụ cột" dùng số của định mức nếu có).
// r = tytTongHop của CT đang theo dõi. Trả về {
//   rows: [{ k, ten, dg, ns, tt, conLai, pct, vuot, loais: [{ loai, tien }] }],
//   tong: { dg, ns, tt, conLai, pct, vuot }, soVuot }
function tytKiemSoat(dm, dienTich, r) {
  const ro1 = (dm && dm.ro1) || {};
  const quyMuc = r.cfg ? r.cfg.quyMuc : TYT_QUY_MUC_MAC_DINH;
  // Tiền Rổ 1 của từng trụ cột tách theo loại (để bung xem trong bảng)
  const loaiTheoTru = {};
  r.lines.forEach(l => l.parts.forEach(pt => {
    if (pt.ro !== 1) return;
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

// THƯ VIỆN ĐƠN GIÁ MODULE: danh sách module (giai đoạn / hạng mục) kèm đ/m2 từ 1 định mức.
//   phamVi 'all' = toàn bộ chi phí (dgGd/dgHm — có cả module ngoài gói như Ép cọc) · 'r1' = chỉ Rổ 1.
// Trả về [{ key, gd, ten, cap: 'gd'|'hm'|'chung'|'chua', dg }] — module 'gd' chỉ là dòng tiêu đề nhóm
// (dg = tổng giai đoạn), các dòng còn lại mới là module tick chọn. GĐ không có hạng mục → 1 module 'chung'.
function tytModules(dm, phamVi) {
  const dgGd = (phamVi === 'r1' ? dm.dgGdR1 : dm.dgGd) || {};
  const dgHm = (phamVi === 'r1' ? dm.dgHmR1 : dm.dgHm) || {};
  const out = [];
  Object.keys(dgGd).forEach(gd => {
    if (gd === 'Chưa phân bổ') return;
    out.push({ key: 'G:' + gd, gd, ten: gd, cap: 'gd', dg: dgGd[gd] || 0 });
    let conLai = dgGd[gd] || 0;
    Object.keys(dgHm).filter(k => k.startsWith(gd + ' › ')).forEach(k => {
      out.push({ key: 'H:' + k, gd, ten: k.slice(gd.length + 3), cap: 'hm', dg: dgHm[k] });
      conLai -= dgHm[k];
    });
    // Phần của giai đoạn chưa rõ hạng mục (hoặc GĐ không chia hạng mục) → 1 module "chung"
    if (conLai > 0) out.push({ key: 'C:' + gd, gd, ten: '(chung cả giai đoạn)', cap: 'chung', dg: conLai });
  });
  if (dgGd['Chưa phân bổ']) out.push({ key: 'U:', gd: '', ten: 'Dùng chung / Chưa phân bổ', cap: 'chua', dg: dgGd['Chưa phân bổ'] });
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// ══ XU HƯỚNG & BIẾN ĐỘNG (07/10/2026 — Cải tiến Phần C) ══════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// 3 nguồn số liệu, đều CHỈ ĐỌC (không ghi gì):
//   1. đ/m2 Rổ 1 theo NĂM CÔNG TRÌNH (tytXuHuongM2) — chỉ CT có bảng M2. Năm của CT = năm HOÀN THÀNH
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
// Trả về { cts: [{ p, nam, san, ro1, tru, dongXong }], nams: [{ nam, soCT, dangLam, san, ro1, tru: {sat..}, m2: { ro1, sat, bt, nc, tp, quy } }] }
function tytXuHuongM2(projs, opts) {
  const cts = projs.filter(p => tytTongSan(p) > 0).map(p => {
    const r = tytTongHop(p, opts);
    return { p, nam: tytNamCT(p), san: r.tongSan, ro1: r.theoRo[1], tru: { ...r.theoTru }, dongXong: p.status === 'closed' || p.status === 'completed' };
  });
  const m = new Map();
  cts.forEach(c => {
    const o = m.get(c.nam) || { nam: c.nam, soCT: 0, dangLam: 0, san: 0, ro1: 0, tru: { sat: 0, bt: 0, nc: 0, tp: 0, quy: 0 } };
    o.soCT++; if (!c.dongXong) o.dangLam++;
    o.san += c.san; o.ro1 += c.ro1;
    Object.keys(o.tru).forEach(t => { o.tru[t] += c.tru[t] || 0; });
    m.set(c.nam, o);
  });
  const nams = [...m.values()].sort((a, b) => a.nam.localeCompare(b.nam)).map(o => {
    const m2 = { ro1: o.ro1 / o.san };
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
