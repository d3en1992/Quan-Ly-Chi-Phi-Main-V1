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
  const list = (tyTrongRecords || []).filter(r => r && !r.deletedAt && r.kind !== 'dinhmuc' && r.projectId === pid);
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
function tytCostLines(p) {
  if (!p) return [];
  const c = (typeof _ctGetCosts === 'function') ? _ctGetCosts(p) : { invs: [] };
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
    });
  });

  const _topLoai = ncc => {
    const m = nccLoai[ncc];
    if (!m) return '';
    return Object.keys(m).sort((a, b) => m[b] - m[a])[0] || '';
  };
  ungAll.forEach(r => {
    if (r.loai !== 'thauphu' && r.loai !== 'nhacungcap') return;   // ứng công nhân không phải chi phí CT
    if (!inActiveYear(r.ngay)) return;
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
// Trả về { g, h, src, ref } — src: 'tay' | 'hdtp' | 'luat' | 'ngay' | '' (chưa phân bổ)
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
function tytTongHop(p) {
  const st    = tytStructOf(p.id);
  const lines = tytCostLines(p);
  const ctx   = { hdtp: tytHdtpOf(p) };
  lines.forEach(l => { l.pb = tytResolve(l, st, ctx); });

  const tongChi = lines.reduce((s, l) => s + l.tien, 0);
  let tongKhop = true;
  if (typeof _ctTongChi === 'function' && typeof _ctGetCosts === 'function') {
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

  return { st, ctx, lines, tongChi, tongKhop, tongSan, cpM2, daPhanBo: tongChi - chuaPB, chuaPB, theoLoai, theoGD };
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
  return nodes;
}

// Tên hạng mục có giống TÊN LOẠI CHI PHÍ không (VD "Nhân công thô", "Sắt thép móng")
// → cảnh báo nhẹ ở tab Thiết lập: hạng mục nên là VỊ TRÍ, loại chi phí đã có trên hóa đơn.
const _TYT_TU_LOAI = ['sat thep', 'nhan cong', 'be tong', 'thau phu', 'vat lieu', 'vat tu', 'dien nuoc', 'copha', 'xi mang', 'gach', 'cat da'];
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

// ══ GỢI Ý CẤU TRÚC MẪU (nút "Dùng mẫu gợi ý") ═══════════════════════
// 4 giai đoạn phổ biến của nhà phố; hạng mục của "Thi công thô" lấy từ tên các dòng bảng M2
// (Trệt, Lầu 1, Mái...) → người dùng sửa lại cho đúng công trình.
function tytMauGoiY(p) {
  const gd = [
    { id: tytNewId('g'), ten: 'Chuẩn bị & Móng', tu: '', den: '' },
    { id: tytNewId('g'), ten: 'Thi công thô',    tu: '', den: '' },
    { id: tytNewId('g'), ten: 'Hoàn thiện',      tu: '', den: '' },
    { id: tytNewId('g'), ten: 'Nội thất',        tu: '', den: '' },
  ];
  // Hạng mục = VỊ TRÍ (không đặt theo loại chi phí — loại chi phí đã có trên hóa đơn)
  const hm = [{ id: tytNewId('h'), gdId: gd[0].id, ten: 'Móng & Đà kiềng' }];
  const tenSan = (p && Array.isArray(p.khoiLuong) ? p.khoiLuong : [])
    .map(r => (r.ten || '').trim()).filter(Boolean);
  (tenSan.length ? tenSan : ['Sàn Trệt', 'Sàn Lầu 1', 'Mái'])
    .forEach(t => hm.push({ id: tytNewId('h'), gdId: gd[1].id, ten: t }));
  return { giaiDoan: gd, hangMuc: hm };
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

// Tạo định mức từ kết quả tytTongHop(p) của công trình nguồn. Trả về bản ghi vừa tạo.
function tytTaoDinhMuc(p, r, ten) {
  const san = r.tongSan;
  const dgLoai = {};
  r.theoLoai.forEach(o => { dgLoai[o.loai] = Math.round(o.tien / san); });
  const dgGd = {};
  r.theoGD.forEach(o => { if (o.tien) dgGd[o.gd.ten] = Math.round(o.tien / san); });
  if (r.chuaPB) dgGd['Chưa phân bổ'] = Math.round(r.chuaPB / san);
  const rec = mkRecord({
    kind: 'dinhmuc', ten: (ten || '').trim() || ('Định mức ' + p.name),
    loaiCT: p.loaiCongTrinh || '', nguonPid: p.id, nguonTen: p.name, nam: tytNhanNam(),
    tongSan: Math.round(san * 100) / 100, tongChi: r.tongChi, dgTong: Math.round(r.tongChi / san), dgLoai, dgGd,
  });
  tyTrongRecords.unshift(rec);
  save('tytrong_v1', tyTrongRecords);
  return rec;
}

// Đổi tên / xóa mềm định mức
function tytSuaDinhMuc(id, changes) {
  const i = tyTrongRecords.findIndex(r => r && r.id === id);
  if (i < 0) return;
  tyTrongRecords[i] = mkUpdate(tyTrongRecords[i], changes);
  save('tytrong_v1', tyTrongRecords);
}
function tytXoaDinhMuc(id) { tytSuaDinhMuc(id, { deletedAt: Date.now() }); }

// DỰ TOÁN = diện tích × đơn giá định mức, so với THỰC TẾ (r = tytTongHop của CT đang theo dõi, có thể null)
// Trả về { rows: [{ loai, dg, duToan, thucTe, conLai, pct }], tong: {...} } — loại có ở định mức HOẶC thực tế
function tytDuToan(dm, dienTich, r) {
  const thucTe = new Map(r ? r.theoLoai.map(o => [o.loai, o.tien]) : []);
  const loais = [...new Set([...Object.keys(dm.dgLoai || {}), ...thucTe.keys()])];
  const rows = loais.map(loai => {
    const dg = (dm.dgLoai || {})[loai] || 0;
    const duToan = Math.round(dg * dienTich);
    const tt = thucTe.get(loai) || 0;
    return { loai, dg, duToan, thucTe: tt, conLai: duToan - tt, pct: duToan ? tt / duToan * 100 : (tt ? Infinity : 0) };
  }).sort((a, b) => (b.duToan - a.duToan) || (b.thucTe - a.thucTe));
  const duToan = rows.reduce((s, x) => s + x.duToan, 0);
  const tt = rows.reduce((s, x) => s + x.thucTe, 0);
  return { rows, tong: { dg: dm.dgTong || 0, duToan, thucTe: tt, conLai: duToan - tt, pct: duToan ? tt / duToan * 100 : 0 } };
}

// ══ SO SÁNH NHIỀU CÔNG TRÌNH (05/10/2026 — Lần 2) ══════════════════════
// cots: mảng project. Trả về { cots: [{ p, r }], loais: [tên loại — sắp theo tổng tiền giảm dần] }
function tytSoSanh(projs) {
  const cots = projs.map(p => ({ p, r: tytTongHop(p) }));
  const tong = new Map();
  cots.forEach(c => c.r.theoLoai.forEach(o => tong.set(o.loai, (tong.get(o.loai) || 0) + o.tien)));
  const loais = [...tong.keys()].sort((a, b) => tong.get(b) - tong.get(a));
  return { cots, loais };
}
