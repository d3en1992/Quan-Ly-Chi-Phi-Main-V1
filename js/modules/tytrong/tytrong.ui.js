// tytrong.ui.js — Tab TỈ TRỌNG CHI PHÍ · GIAO DIỆN + THAO TÁC (05/10/2026)
// Load order: sau tytrong.core.js. Giao diện: pages/tytrong.html (tiền tố ID tyt-).
//
// Các khối:
//   LUÔN HIỆN: Chọn công trình (#tytf-ct — cùng danh sách tab Quyết Toán, _qtProjList: năm đang lọc)
//              + KPI (#tyt-kpi-*): Tổng chi · Tổng sàn · Chi phí/m2 · Đã phân bổ
//   3 TAB CON (tytGoSub — nút có ID = ID tab con + "-btn"):
//   1. PHÂN TÍCH  #tyt-sub-pt — bảng CÂY MA TRẬN (#tyt-cay-tbody, tytRenderCay):
//        Giai đoạn → Hạng mục → Loại chi phí (tự tách từ hóa đơn) → từng khoản chi
//        cột: Tổng · % Toàn CT · % Cấp trên · đ/m2. Trạng thái mở/đóng: _tytOpen.
//      + bảng Theo loại chi phí toàn nhà (#tyt-loai-tbody)
//   2. PHÂN BỔ    #tyt-sub-pb — (Lần 2) Luật tự gán (#tyt-luat-*) + Gắn theo HĐ thầu phụ (#tyt-hdtp-tbody)
//        + gán tay hàng loạt: lọc, tick nhiều dòng, gán vào giai đoạn / hạng mục (#tyt-pb-*)
//   4. KIỂM SOÁT ĐỊNH MỨC #tyt-sub-dm — (Phần B) CHỈ RỔ 1: bảng kiểm soát 4 trụ cột + Quỹ phụ phí
//        (#tyt-dt-*, tytRenderKiemSoat), bộ định mức lưu từ CT / nhập tay / cập nhật (#tyt-dm-*, tytDmSua),
//        thư viện đơn giá module (#tyt-tv-*, tytRenderThuVien), đối chiếu nhóm (#tyt-nh-*, công tắc Chỉ Rổ 1)
//   5. XU HƯỚNG & SO SÁNH #tyt-sub-ss — (Lần 2) đ/m2 | % | tổng tiền nhiều CT cạnh nhau, tô cao/thấp nhất, xuất Excel
//        (Phần C) mặc định CHỈ RỔ 1 theo trụ cột (#tyt-ss-r1) + xu hướng đ/m2 Rổ 1 theo năm (#tyt-xh-*,
//        tytRenderXuHuong) + biến động đơn giá vật tư / công nhật (#tyt-gv-*, tytRenderGiaVt) — biểu đồ SVG tự vẽ
//   3. THIẾT LẬP  #tyt-sub-tl — Bảng M2 sàn (#tyt-kl-tbody → project.khoiLuong qua updateProject;
//        form Sửa công trình chỉ còn TỔNG read-only + nút dẫn sang đây)
//        + Giai đoạn & Hạng mục (#tyt-ct-body) sửa trên BẢN NHÁP (_tytDraft), "Lưu Cấu Trúc" mới ghi.
//        Hạng mục = VỊ TRÍ (Móng, Lầu 1...) — tên giống loại chi phí → cảnh báo (tytGiongLoaiCP).
// Quyền: tab ẩn với Kế toán (auth.js) — ai thấy tab thì được sửa.
// Không sửa hóa đơn / tiền ứng: mọi gán tay lưu ở store tytrong_v1 (xem tytrong.core.js).

// ─── State ─────────────────────────────────────────────────────
let _tytPid      = '';      // projectId đang chọn
let _tytDraft    = null;    // bản nháp cấu trúc { giaiDoan, hangMuc } — null = chưa sửa gì
let _tytKlDirty  = false;   // bảng M2 có thay đổi chưa lưu
let _tytPbPage   = 0;       // trang hiện tại của bảng phân bổ
const _tytPbSel  = new Set();   // khóa các dòng chi phí đang tick
let _tytLast     = null;    // kết quả tytTongHop lần vẽ gần nhất (dùng cho lọc / chọn tất cả)
const TYT_PB_PG  = 30;      // số dòng / trang bảng phân bổ
let _tytSub      = 'tyt-sub-pt';   // tab con đang mở (giữ khi đổi công trình / sync)
const _tytOpen   = new Set();      // key các node đang MỞ trong bảng cây Phân Tích
let _tytOpenPid  = '';             // công trình đã khởi tạo trạng thái mở mặc định

// ══ KHỞI TẠO ════════════════════════════════════════════════════
// Vào tab (goPage) → nạp dropdown, GIỮ công trình đang chọn (nếu còn), vẽ lại
function initTyTrong() {
  tytPopulateSels();
  tytRenderAll();
}
// Đổi năm / sync xong (renderActiveTab) → vẽ lại, giữ bản nháp + bảng M2 đang sửa
function tytRefresh() {
  tytPopulateSels();
  tytRenderAll({ keepKl: _tytKlDirty });
}

// Mở tab và chọn sẵn 1 công trình (gọi từ form Sửa công trình)
function tytOpenFor(pid) {
  if (typeof closeModal === 'function') closeModal();
  if (pid !== _tytPid) { _tytPid = pid; _tytResetEdits(); }
  goPage(null, 'tytrong');
}

function _tytResetEdits() {
  _tytDraft = null; _tytKlDirty = false; _tytPbPage = 0; _tytPbSel.clear();
}

function _tytProj() {
  return _tytPid && typeof getProjectById === 'function' ? getProjectById(_tytPid) : null;
}

// ── Dropdown công trình (dùng chung quy tắc tab Quyết Toán: bỏ CÔNG TY, theo năm đang lọc) ──
function tytPopulateSels() {
  const sel = document.getElementById('tytf-ct');
  if (!sel) return;
  const list = (typeof _qtProjList === 'function') ? _qtProjList(_tytPid)
    : (getAllProjects() || []).filter(p => p && p.id !== 'COMPANY' && !p.deletedAt);
  sel.innerHTML = '<option value="">-- Chọn công trình --</option>' +
    list.map(p => `<option value="${x(p.id)}">${x(p.name)}</option>`).join('');
  if (_tytPid && list.some(p => p.id === _tytPid)) sel.value = _tytPid;
  else { sel.value = ''; if (_tytPid && !_tytProj()) { _tytPid = ''; _tytResetEdits(); } }
  if (typeof _ssEnhance === 'function') _ssEnhance(sel);   // ô chọn gõ-để-tìm (idempotent)
}

// Có thay đổi chưa lưu không (để hỏi trước khi đổi công trình)
function _tytHasUnsaved() { return _tytKlDirty || !!_tytDraft; }

function tytOnCtChange() {
  const sel = document.getElementById('tytf-ct');
  const v = sel ? sel.value : '';
  if (v === _tytPid) return;
  if (_tytHasUnsaved() && !confirm('Bảng M2 / cấu trúc giai đoạn đang có thay đổi CHƯA LƯU.\nĐổi công trình sẽ bỏ các thay đổi đó. Tiếp tục?')) {
    if (sel) sel.value = _tytPid;
    return;
  }
  _tytPid = v;
  _tytResetEdits();
  tytRenderAll();
}

// ══ VẼ TOÀN BỘ ══════════════════════════════════════════════════
// opts.keepKl: không vẽ lại bảng M2 (đang sửa dở)
function tytRenderAll(opts) {
  opts = opts || {};
  const p = _tytProj();
  const empty = document.getElementById('tyt-empty');
  const main  = document.getElementById('tyt-main');
  if (empty) empty.style.display = p ? 'none' : '';
  if (main)  main.style.display  = p ? '' : 'none';
  if (!p) { _tytLast = null; _tytRenderKpi(null); return; }

  if (!opts.keepKl) _tytRenderKl(p);
  _tytRenderCauTruc();
  // Lần đầu xem 1 công trình → mặc định MỞ cấp Giai đoạn (thấy ngay các hạng mục)
  if (_tytOpenPid !== p.id) {
    _tytOpenPid = p.id;
    _tytOpen.clear();
    tytStructOf(p.id).giaiDoan.forEach(g => _tytOpen.add('G:' + g.id));
  }
  tytGoSub(_tytSub);
  _tytRecalc();
}

// Tính lại + vẽ các phần phụ thuộc số liệu (KPI, 2 bảng báo cáo, bảng phân bổ)
function _tytRecalc() {
  const p = _tytProj();
  if (!p) return;
  // (Lần 3) Trọn vòng đời: tải các năm còn thiếu của CT (tải xong tự gọi lại hàm này)
  if (_tytAllYears) _tytEnsureYears(tytNamVongDoi(p));
  _tytLast = tytTongHop(p, _tytOpts());
  // Bảng M2 đang sửa dở → KPI dùng tổng sàn trên màn hình cho người dùng thấy ngay
  if (_tytKlDirty) {
    _tytLast.tongSan = tytTongSanRows(_tytKlRead());
    _tytLast.cpM2 = _tytLast.tongSan > 0 ? _tytLast.tongChi / _tytLast.tongSan : 0;
    _tytLast.cpM2Ro1 = _tytLast.tongSan > 0 ? _tytLast.theoRo[1] / _tytLast.tongSan : 0;
  }
  _tytRenderKpi(_tytLast);
  _tytRenderLoai(_tytLast);
  tytRenderCay();
  _tytRenderPbDich(_tytLast);
  _tytRenderPbLoai(_tytLast);
  tytRenderPb(_tytPbPage);
  _tytRenderLuat(_tytLast);
  _tytRenderHdtp(_tytLast);
  _tytRenderRoCfg(_tytLast);   // (Phần A) bảng Loại → Rổ + luật rổ
  _tytRenderDm(_tytLast);
  if (_tytSub === 'tyt-sub-ss') _tytRenderTabSs();   // so sánh / xu hướng tính nhiều CT → chỉ vẽ khi đang mở
  if (_tytSub === 'tyt-sub-dm') tytRenderNhom();     // đối chiếu nhóm cũng tính nhiều CT
  _tytRenderSubBadges();
  _tytRenderScope();
  _tytRenderClipBtns();
}

// ══ TAB CON ═════════════════════════════════════════════════════
function tytGoSub(id) {
  if (!document.getElementById(id)) return;
  _tytSub = id;
  document.querySelectorAll('#tyt-main .sub-page').forEach(pg => pg.classList.toggle('active', pg.id === id));
  document.querySelectorAll('#tyt-sub-nav .nav-link').forEach(b => b.classList.toggle('active', b.id === id + '-btn'));
  if (id === 'tyt-sub-ss' && _tytLast) _tytRenderTabSs();
  if (id === 'tyt-sub-dm' && _tytLast) tytRenderNhom();
}

// Huy hiệu trên nút tab con: PHÂN BỔ = % còn chưa phân bổ · THIẾT LẬP = "!" khi thiếu M2 / giai đoạn
function _tytRenderSubBadges() {
  const r = _tytLast;
  const pb = document.getElementById('tyt-sub-pb-badge');
  if (pb) {
    if (!r || !r.tongChi) { pb.textContent = ''; pb.className = 'badge rounded-pill ms-1'; }
    else if (r.chuaPB > 0) { pb.textContent = 'chưa PB ' + _tytPctTxt(r.chuaPB, r.tongChi); pb.className = 'badge rounded-pill ms-1 text-bg-warning'; }
    else { pb.textContent = '✓'; pb.className = 'badge rounded-pill ms-1 text-bg-success'; }
  }
  const tl = document.getElementById('tyt-sub-tl-badge');
  if (tl) {
    const thieu = r && (!(r.tongSan > 0) || !r.st.giaiDoan.length);
    tl.textContent = thieu ? '!' : '';
    tl.className = 'badge rounded-pill ms-1' + (thieu ? ' text-bg-danger' : '');
    tl.title = !r ? '' : (!(r.tongSan > 0) ? 'Chưa nhập bảng M2 sàn' : (!r.st.giaiDoan.length ? 'Chưa tạo giai đoạn' : ''));
  }
}

// ── Định dạng dùng chung ──
function _tytPct(v, tong) { return tong ? (v / tong * 100) : 0; }
function _tytPctTxt(v, tong) { return tong ? _tytPct(v, tong).toFixed(1).replace('.', ',') + '%' : '—'; }
function _tytM2Txt(v, san) { return san > 0 ? fmtM(Math.round(v / san)) : '—'; }
// Ô tỉ trọng có thanh ngang nhỏ minh họa
function _tytPctCell(v, tong) {
  const w = Math.max(0, Math.min(100, _tytPct(v, tong)));
  return `<td class="text-end font-monospace" style="white-space:nowrap">
    <div>${_tytPctTxt(v, tong)}</div>
    <div class="tyt-bar"><span style="width:${w.toFixed(1)}%"></span></div>
  </td>`;
}

// ══ KPI ═════════════════════════════════════════════════════════
function _tytRenderKpi(r) {
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  if (!r) {
    ['tyt-kpi-chi', 'tyt-kpi-san', 'tyt-kpi-m2', 'tyt-kpi-pb'].forEach(id => set(id, '—'));
    set('tyt-kpi-m2-sub', '');
    ['tyt-kpi-chi-sub', 'tyt-kpi-san-sub', 'tyt-kpi-pb-sub', 'tyt-kpi-warn'].forEach(id => set(id, ''));
    return;
  }
  set('tyt-kpi-chi', fmtM(r.tongChi));
  set('tyt-kpi-chi-sub', `${r.lines.length} khoản chi · ${r.allYears ? 'trọn vòng đời' : 'năm ' + x(tytNhanNam())}`);
  set('tyt-kpi-san', r.tongSan > 0 ? `${tytFmtM2(r.tongSan)} m2` : '<span class="text-warning">Chưa nhập</span>');
  set('tyt-kpi-san-sub', _tytKlDirty ? 'Đang sửa — chưa lưu' : 'Quy đổi theo hệ số');
  // (Phần A) Góc nhìn Theo Rổ: đ/m2 CHỈ lấy Rổ 1 (gói thô) ÷ sàn; Theo Giai đoạn: toàn bộ ÷ sàn
  const roView = typeof _tytView === 'undefined' || _tytView === 'ro';
  set('tyt-kpi-m2-lb', roView ? 'Chi phí / m2 sàn · Rổ 1' : 'Chi phí / m2 sàn · toàn bộ');
  set('tyt-kpi-m2', r.tongSan > 0 ? fmtM(Math.round(roView ? r.cpM2Ro1 : r.cpM2)) : '—');
  set('tyt-kpi-m2-sub', r.tongSan > 0
    ? (roView ? `Rổ 1 ÷ sàn · toàn bộ: ${fmtM(Math.round(r.cpM2))}` : `Tổng chi ÷ sàn · Rổ 1: ${fmtM(Math.round(r.cpM2Ro1))}`)
    : 'Nhập bảng M2 ở tab Thiết lập');
  set('tyt-kpi-pb', _tytPctTxt(r.daPhanBo, r.tongChi));
  set('tyt-kpi-pb-sub', r.chuaPB > 0 ? `Còn ${fmtM(r.chuaPB)} chưa phân bổ` : (r.tongChi ? 'Đã phân bổ hết' : ''));
  // Tự kiểm tra: tổng các dòng phải khớp "Tổng chi" trên thẻ công trình
  set('tyt-kpi-warn', r.tongKhop ? '' :
    '<div class="text-danger mt-2" style="font-size:11.5px">⚠ Tổng các khoản chi chưa khớp "Tổng chi" ở thẻ công trình — báo lại cho người lập trình kiểm tra.</div>');
}

// ══ BẢNG M2 SÀN ═════════════════════════════════════════════════
function _tytKlRowHtml(r) {
  r = r || {};
  const kl = (r.kl === 0 || r.kl) ? r.kl : '';
  const heSo = (r.heSo === 0 || r.heSo) ? r.heSo : 1;
  return `<tr>
    <td><input type="text" class="form-control form-control-sm tyt-kl-ten" value="${x(r.ten || '')}" placeholder="VD: Sàn trệt" autocomplete="off" oninput="_tytKlChanged()"></td>
    <td><input type="text" class="form-control form-control-sm tyt-kl-dvt" value="${x(r.dvt === undefined ? 'm2' : r.dvt)}" autocomplete="off" oninput="_tytKlChanged()"></td>
    <td><input type="number" step="any" min="0" inputmode="decimal" class="form-control form-control-sm text-end font-monospace tyt-kl-kl" value="${kl}" oninput="_tytKlChanged()"></td>
    <td><input type="number" step="any" min="0" inputmode="decimal" class="form-control form-control-sm text-end font-monospace tyt-kl-hs" value="${heSo}" oninput="_tytKlChanged()"></td>
    <td class="text-center"><input type="checkbox" class="form-check-input tyt-kl-tinh" ${tytKlTinh(r) ? 'checked' : ''} onchange="_tytKlChanged()"></td>
    <td class="text-center"><button type="button" class="btn btn-link btn-sm p-0 text-danger text-decoration-none" title="Xóa dòng" onclick="tytKlDelRow(this)"><span class="material-symbols-outlined" style="font-size:18px">close</span></button></td>
  </tr>`;
}

function _tytRenderKl(p) {
  const tb = document.getElementById('tyt-kl-tbody');
  if (!tb) return;
  const rows = Array.isArray(p.khoiLuong) && p.khoiLuong.length ? p.khoiLuong : [{}, {}, {}];
  tb.innerHTML = rows.map(_tytKlRowHtml).join('');
  _tytKlDirty = false;
  _tytKlUpdateTotal();
}

// Đọc bảng M2 trên màn hình → [{ ten, dvt, kl, heSo, tinh }]. keepEmpty: giữ cả dòng trống
function _tytKlRead(keepEmpty) {
  const out = [];
  document.querySelectorAll('#tyt-kl-tbody tr').forEach(tr => {
    const ten   = (tr.querySelector('.tyt-kl-ten')?.value || '').trim();
    const dvt   = (tr.querySelector('.tyt-kl-dvt')?.value || '').trim();
    const klRaw = (tr.querySelector('.tyt-kl-kl')?.value || '').trim();
    const hsRaw = (tr.querySelector('.tyt-kl-hs')?.value || '').trim();
    const tinh  = !!tr.querySelector('.tyt-kl-tinh')?.checked;
    if (!keepEmpty && !ten && !klRaw) return;
    const heSo = hsRaw === '' ? 1 : tytKlNum(hsRaw);
    out.push({ ten, dvt, kl: tytKlNum(klRaw), heSo: heSo >= 0 ? heSo : 1, tinh });
  });
  return out;
}

function _tytKlUpdateTotal() {
  const el = document.getElementById('tyt-kl-tong');
  if (el) el.textContent = tytFmtM2(tytTongSanRows(_tytKlRead(true)));
  const b = document.getElementById('tyt-kl-dirty');
  if (b) b.style.display = _tytKlDirty ? '' : 'none';
}

// Gõ vào bảng M2 → đánh dấu chưa lưu + cập nhật tổng + KPI ngay
function _tytKlChanged() {
  _tytKlDirty = true;
  _tytKlUpdateTotal();
  if (_tytLast) {
    _tytLast.tongSan = tytTongSanRows(_tytKlRead());
    _tytLast.cpM2 = _tytLast.tongSan > 0 ? _tytLast.tongChi / _tytLast.tongSan : 0;
    _tytLast.cpM2Ro1 = _tytLast.tongSan > 0 ? _tytLast.theoRo[1] / _tytLast.tongSan : 0;
    _tytRenderKpi(_tytLast); _tytRenderLoai(_tytLast); tytRenderCay(); _tytRenderSubBadges();
  }
}

function tytKlAddRow() {
  const tb = document.getElementById('tyt-kl-tbody');
  if (!tb) return;
  tb.insertAdjacentHTML('beforeend', _tytKlRowHtml({}));
  tb.lastElementChild?.querySelector('.tyt-kl-ten')?.focus();
}
function tytKlDelRow(btn) {
  btn?.closest('tr')?.remove();
  _tytKlChanged();
}
function tytKlReset() {
  const p = _tytProj();
  if (!p) return;
  _tytRenderKl(p);
  _tytRecalc();
}
function tytKlSave() {
  const p = _tytProj();
  if (!p) return;
  const khoiLuong = _tytKlRead();
  try {
    updateProject(p.id, { khoiLuong });   // ghi vào record công trình (doc meta_cong_trinh)
  } catch (e) {
    toast('❌ ' + e.message, 'error');
    return;
  }
  _tytKlDirty = false;
  toast(`✅ Đã lưu bảng M2 — tổng sàn ${tytFmtM2(tytTongSanRows(khoiLuong))} m2`, 'success');
  tytRenderAll();
}

// ══ CẤU TRÚC GIAI ĐOẠN → HẠNG MỤC (sửa trên bản nháp) ══════════════
// Cấu trúc đang hiển thị: bản nháp nếu đang sửa, không thì bản đã lưu
function _tytCtCur() {
  if (_tytDraft) return _tytDraft;
  const st = tytStructOf(_tytPid);
  return { giaiDoan: st.giaiDoan, hangMuc: st.hangMuc };
}
// Bắt đầu sửa → tạo bản nháp từ bản đã lưu
function _tytCtEdit() {
  if (!_tytDraft) {
    const st = tytStructOf(_tytPid);
    _tytDraft = { giaiDoan: st.giaiDoan, hangMuc: st.hangMuc };
  }
  const b = document.getElementById('tyt-ct-dirty');
  if (b) b.style.display = '';
  return _tytDraft;
}

function _tytRenderCauTruc() {
  const box = document.getElementById('tyt-ct-body');
  if (!box) return;
  const cur = _tytCtCur();
  const b = document.getElementById('tyt-ct-dirty');
  if (b) b.style.display = _tytDraft ? '' : 'none';
  if (!cur.giaiDoan.length) {
    box.innerHTML = `<div class="text-secondary text-center border rounded py-3" style="font-size:12.5px">
      Chưa có giai đoạn nào. Bấm <b>+ Giai đoạn</b> hoặc <b>Dùng mẫu gợi ý</b>.</div>`;
    return;
  }
  box.innerHTML = cur.giaiDoan.map((g, i) => {
    const hms = cur.hangMuc.filter(h => h.gdId === g.id);
    return `<div class="tyt-gd-box">
      <div class="d-flex flex-wrap align-items-center gap-2">
        <span class="tyt-gd-no">${i + 1}</span>
        <input type="text" class="form-control form-control-sm fw-semibold" style="flex:1 1 160px" value="${x(g.ten)}" placeholder="Tên giai đoạn" oninput="tytGdSet('${g.id}','ten',this.value)">
        <span class="text-secondary" style="font-size:11px">Từ</span>
        <input type="date" class="form-control form-control-sm" style="width:140px" value="${x(g.tu || '')}" onchange="tytGdSet('${g.id}','tu',this.value)">
        <span class="text-secondary" style="font-size:11px">đến</span>
        <input type="date" class="form-control form-control-sm" style="width:140px" value="${x(g.den || '')}" onchange="tytGdSet('${g.id}','den',this.value)">
        <button type="button" class="btn btn-link btn-sm p-0 text-secondary" title="Lên trên" onclick="tytGdMove('${g.id}',-1)" ${i === 0 ? 'disabled' : ''}><span class="material-symbols-outlined" style="font-size:18px">arrow_upward</span></button>
        <button type="button" class="btn btn-link btn-sm p-0 text-danger" title="Xóa giai đoạn" onclick="tytGdDel('${g.id}')"><span class="material-symbols-outlined" style="font-size:18px">delete</span></button>
      </div>
      <div class="tyt-hm-list">
        ${hms.map(h => `<div class="d-flex align-items-center gap-1">
          <span class="text-secondary">└</span>
          <input type="text" class="form-control form-control-sm" value="${x(h.ten)}" placeholder="Vị trí: Móng, Sàn trệt, Lầu 1..." oninput="tytHmSet('${h.id}',this.value,this)">
          <button type="button" class="btn btn-link btn-sm p-0 text-danger" title="Xóa hạng mục" onclick="tytHmDel('${h.id}')"><span class="material-symbols-outlined" style="font-size:16px">close</span></button>
          ${_tytHmWarnHtml(h.ten)}
        </div>`).join('')}
        <button type="button" class="btn btn-link btn-sm p-0 text-decoration-none" style="font-size:12px" onclick="tytHmAdd('${g.id}')">+ Hạng mục</button>
      </div>
    </div>`;
  }).join('');
}

function tytGdAdd() {
  const d = _tytCtEdit();
  d.giaiDoan.push({ id: tytNewId('g'), ten: '', tu: '', den: '' });
  _tytRenderCauTruc();
  // con trỏ vào ô tên giai đoạn vừa thêm (ô text đầu tiên của khối cuối)
  document.querySelector('#tyt-ct-body .tyt-gd-box:last-child input[type="text"]')?.focus();
}
// Gõ / chọn ngày: chỉ cập nhật bản nháp (KHÔNG vẽ lại để khỏi mất con trỏ)
function tytGdSet(id, field, val) {
  const g = _tytCtEdit().giaiDoan.find(z => z.id === id);
  if (g) g[field] = field === 'ten' ? val : (val || '');
}
function tytGdMove(id, dir) {
  const arr = _tytCtEdit().giaiDoan;
  const i = arr.findIndex(z => z.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  _tytRenderCauTruc();
}
function tytGdDel(id) {
  const d = _tytCtEdit();
  const g = d.giaiDoan.find(z => z.id === id);
  const soHm = d.hangMuc.filter(h => h.gdId === id).length;
  if ((g && g.ten) || soHm) {
    if (!confirm(`Xóa giai đoạn "${(g && g.ten) || '(chưa đặt tên)'}"${soHm ? ` cùng ${soHm} hạng mục` : ''}?\nCác khoản chi đã gán vào đây sẽ quay về "Chưa phân bổ" (sau khi Lưu Cấu Trúc).`)) return;
  }
  d.giaiDoan = d.giaiDoan.filter(z => z.id !== id);
  d.hangMuc  = d.hangMuc.filter(h => h.gdId !== id);
  _tytRenderCauTruc();
}
function tytHmAdd(gdId) {
  _tytCtEdit().hangMuc.push({ id: tytNewId('h'), gdId, ten: '' });
  _tytRenderCauTruc();
  // con trỏ vào ô hạng mục vừa thêm
  const boxes = document.querySelectorAll('#tyt-ct-body .tyt-gd-box');
  const idx = _tytCtCur().giaiDoan.findIndex(g => g.id === gdId);
  const ins = boxes[idx]?.querySelectorAll('.tyt-hm-list input');
  if (ins && ins.length) ins[ins.length - 1].focus();
}
// el: ô input đang gõ → cập nhật cảnh báo "giống loại chi phí" ngay bên cạnh (không vẽ lại cả khung)
function tytHmSet(id, val, el) {
  const h = _tytCtEdit().hangMuc.find(z => z.id === id);
  if (h) h.ten = val;
  const row = el && el.parentElement;
  if (row) {
    row.querySelector('.tyt-hm-warn')?.remove();
    row.insertAdjacentHTML('beforeend', _tytHmWarnHtml(val));
  }
}
// Cảnh báo nhẹ khi tên hạng mục giống loại chi phí (VD "Nhân công thô") — không chặn lưu
function _tytHmWarnHtml(ten) {
  const w = tytGiongLoaiCP(ten);
  return w ? `<span class="tyt-hm-warn" title="Hạng mục nên là VỊ TRÍ (Móng, Lầu 1...). Loại chi phí như &quot;${x(w)}&quot; đã có sẵn trên hóa đơn và được tách tự động ở tab Phân Tích — đặt hạng mục theo loại sẽ làm 1 hóa đơn phải chọn giữa 'vị trí' và 'loại'."><span class="material-symbols-outlined" style="font-size:15px;vertical-align:-3px">warning</span> giống loại chi phí</span>` : '';
}
function tytHmDel(id) {
  const d = _tytCtEdit();
  d.hangMuc = d.hangMuc.filter(h => h.id !== id);
  _tytRenderCauTruc();
}
// Tạo nhanh cấu trúc mẫu (thay thế cấu trúc đang có trên bản nháp)
function tytCtMau() {
  const p = _tytProj();
  if (!p) return;
  if (_tytCtCur().giaiDoan.length && !confirm('Thay cấu trúc hiện tại bằng mẫu gợi ý?\n(Chỉ áp dụng khi bấm Lưu Cấu Trúc)')) return;
  const m = tytMauGoiY(p);
  _tytDraft = { giaiDoan: m.giaiDoan, hangMuc: m.hangMuc };
  _tytRenderCauTruc();
}
function tytCtReset() {
  _tytDraft = null;
  _tytRenderCauTruc();
}

function tytCtSave() {
  const p = _tytProj();
  if (!p) return;
  if (!_tytDraft) { toast('Cấu trúc không có thay đổi', 'info'); return; }
  const d = _tytDraft;
  // Chuẩn hóa + kiểm tra
  d.giaiDoan.forEach(g => { g.ten = (g.ten || '').trim(); });
  d.hangMuc.forEach(h => { h.ten = (h.ten || '').trim(); });
  d.hangMuc = d.hangMuc.filter(h => h.ten);               // hạng mục để trống tên → bỏ
  const thieuTen = d.giaiDoan.findIndex(g => !g.ten);
  if (thieuTen >= 0) { toast(`Giai đoạn thứ ${thieuTen + 1} chưa có tên!`, 'error'); return; }
  const saiNgay = d.giaiDoan.find(g => g.tu && g.den && g.den < g.tu);
  if (saiNgay) { toast(`"${saiNgay.ten}": Đến ngày phải sau Từ ngày!`, 'error'); return; }

  // Dọn các gán tay trỏ tới giai đoạn / hạng mục đã xóa
  const gdIds = new Set(d.giaiDoan.map(g => g.id));
  const hmIds = new Set(d.hangMuc.map(h => h.id));
  const phanBo = tytStructOf(p.id).phanBo;
  let mat = 0;
  Object.keys(phanBo).forEach(k => {
    const v = phanBo[k];
    if ((v.h && !hmIds.has(v.h)) || (v.g && !gdIds.has(v.g)) || (!v.h && !v.g)) {
      // hạng mục bị xóa nhưng giai đoạn còn → giữ ở cấp giai đoạn
      if (v.g && gdIds.has(v.g)) phanBo[k] = { g: v.g, h: '' };
      else { delete phanBo[k]; mat++; }
    }
  });
  if (mat && !confirm(`${mat} khoản chi đang gán vào giai đoạn bị xóa sẽ quay về "Chưa phân bổ". Lưu?`)) return;

  // Giai đoạn MỚI tạo → mở sẵn trong bảng cây Phân Tích (giai đoạn cũ giữ trạng thái người dùng chọn)
  const cuIds = new Set(tytStructOf(p.id).giaiDoan.map(g => g.id));
  d.giaiDoan.forEach(g => { if (!cuIds.has(g.id)) _tytOpen.add('G:' + g.id); });

  tytSaveStruct(p.id, { giaiDoan: d.giaiDoan, hangMuc: d.hangMuc, phanBo });
  _tytDraft = null;
  toast('✅ Đã lưu cấu trúc giai đoạn / hạng mục', 'success');
  _tytRenderCauTruc();
  _tytRecalc();
}

// ══ BẢNG THEO LOẠI CHI PHÍ (toàn nhà) ════════════════════════════
function _tytRenderLoai(r) {
  const tb = document.getElementById('tyt-loai-tbody');
  if (!tb) return;
  if (!r.theoLoai.length) {
    tb.innerHTML = '<tr><td colspan="5" class="text-center text-secondary py-3">Chưa có khoản chi nào</td></tr>';
    return;
  }
  tb.innerHTML = r.theoLoai.map(o => `<tr>
      <td>${x(o.loai)} <span class="text-secondary" style="font-size:11px">(${o.soDong})</span></td>
      <td>${_tytRoChipLoai(r, o.loai)}</td>
      <td class="text-end font-monospace" style="white-space:nowrap">${fmtM(o.tien)}</td>
      ${_tytPctCell(o.tien, r.tongChi)}
      <td class="text-end font-monospace" style="white-space:nowrap">${_tytM2Txt(o.tien, r.tongSan)}</td>
    </tr>`).join('') + _tytTongRow(r);
}

// Chip rổ THỰC TẾ của 1 loại chi phí ở CT này (các khoản có thể vào rổ khác nhau do luật / HĐ TP / gán tay
// / tách món) — rổ nào có tiền thì hiện, sắp theo tiền giảm dần; tooltip ghi số tiền từng rổ
function _tytRoChipLoai(r, loai) {
  const by = {};
  r.lines.forEach(l => { if (l.loai === loai) l.parts.forEach(pt => { by[pt.ro] = (by[pt.ro] || 0) + pt.tien; }); });
  return Object.keys(by).sort((a, b) => by[b] - by[a]).map(ro => {
    const t = TYT_RO[ro];
    return `<span class="tyt-ro tyt-ro-${ro} tyt-ro-sm" title="${x(t.ten)}: ${fmtM(by[ro])}">${t.ngan}</span>`;
  }).join(" ");
}

function _tytTongRow(r) {
  return `<tr class="tyt-rpt-total">
    <td>TỔNG</td><td></td>
    <td class="text-end font-monospace">${fmtM(r.tongChi)}</td>
    <td class="text-end font-monospace">${r.tongChi ? '100%' : '—'}</td>
    <td class="text-end font-monospace">${_tytM2Txt(r.tongChi, r.tongSan)}</td>
  </tr>`;
}

// ══ BẢNG CÂY — 2 GÓC NHÌN (tab con TỔNG QUAN) ═══════════════════════
// Nút gạt #tyt-view-ro / #tyt-view-gd (tytSetView, nhớ ở localStorage 'tyt_view'):
//   • 'ro' THEO RỔ (Lợi nhuận / giá khoán) — tytCayRo(): Rổ → Loại chi phí → từng khoản (hoặc MÓN).
//       Rổ 1: Số tiền · % · đ/m2 | Rổ 2: Số tiền · % | Rổ 3: chỉ Số tiền (đúng file thiết kế).
//       Mặc định chỉ 3 dòng lớn (thu gọn) — bấm [+] mới bung.
//   • 'gd' THEO GIAI ĐOẠN (Kỹ thuật) — tytCay(): Giai đoạn → Hạng mục → Loại → khoản,
//       thêm cột TÁCH CẤU THÀNH (Vật tư / Nhân công / Khoán TP / Khác) để biết tỉ lệ VT/NC từng phần việc.
// Cột "% Cấp trên" = tiền dòng ÷ tiền dòng cha ngay trên; cấp 1 → "—".
const _TYT_KIND_CLS = { gd: 'tyt-cay-gd', ro: 'tyt-cay-gd', tru: 'tyt-cay-hm', chua: 'tyt-cay-chua', hm: 'tyt-cay-hm', chung: 'tyt-cay-hm tyt-cay-chung', loai: 'tyt-cay-loai', line: 'tyt-cay-line' };
let _tytView = (() => { try { return localStorage.getItem('tyt_view') === 'gd' ? 'gd' : 'ro'; } catch (e) { return 'ro'; } })();

function tytSetView(v) {
  _tytView = v === 'gd' ? 'gd' : 'ro';
  try { localStorage.setItem('tyt_view', _tytView); } catch (e) { /* bỏ qua */ }
  if (_tytLast) _tytRenderKpi(_tytLast);
  tytRenderCay();
}

// Chip rổ (màu theo rổ). src: nguồn xếp (tooltip)
const _TYT_RO_SRC = { tay: 'gán tay', hdtp: 'theo HĐ thầu phụ', luat: 'theo luật từ khóa', loai: 'theo bảng Loại → Rổ', macdinh: 'mặc định theo tên loại' };
function _tytRoChip(ro, src, nho) {
  const t = TYT_RO[ro] || TYT_RO[0];
  return `<span class="tyt-ro tyt-ro-${ro}${nho ? ' tyt-ro-sm' : ''}" title="${x(t.ten)}${src ? ' — ' + (_TYT_RO_SRC[src] || src) : ''}">${t.ngan}</span>`;
}
// Chip rổ của 1 khoản (nhiều món khác rổ → nhiều chip)
function _tytRoChipLine(l) {
  const seen = new Map();
  (l.parts || []).forEach(pt => { if (!seen.has(pt.ro)) seen.set(pt.ro, pt.roSrc); });
  return [...seen.entries()].map(([ro, src]) => _tytRoChip(ro, src, true)).join(' ');
}

// Ô "Tách cấu thành": thanh chồng + chữ ngắn
function _tytCauThanhCell(ct, tong) {
  if (!ct || !tong) return '<td></td>';
  const ks = ['vt', 'nc', 'tp', 'khac'].filter(k => ct[k] > 0);
  const bar = ks.map(k => `<span class="tyt-ct-${k}" style="width:${(ct[k] / tong * 100).toFixed(1)}%"></span>`).join('');
  const txt = ks.map(k => `${TYT_CT_TEN[k]} ${Math.round(ct[k] / tong * 100)}%`).join(' · ');
  return `<td style="min-width:150px"><div class="tyt-ct-bar" title="${txt}">${bar}</div><div class="tyt-cay-note" style="white-space:nowrap">${txt}</div></td>`;
}

function tytRenderCay() {
  const tb = document.getElementById('tyt-cay-tbody');
  const th = document.getElementById('tyt-cay-thead');
  if (!tb || !_tytLast) return;
  const r = _tytLast;
  const ro = _tytView === 'ro';
  const an0 = !!document.getElementById('tyt-cay-an0')?.checked;
  document.querySelectorAll('input[name="tyt-view"]').forEach(i => { i.checked = i.value === _tytView; });
  const title = document.getElementById('tyt-cay-title');
  if (title) title.innerHTML = ro
    ? '<span class="material-symbols-outlined msi-gap">shopping_basket</span>Tổng Quan Theo Rổ Chi Phí'
    : '<span class="material-symbols-outlined msi-gap">account_tree</span>Phân Tích Theo Giai Đoạn → Hạng Mục';
  const hint = document.getElementById('tyt-cay-hint');
  if (hint) hint.innerHTML = ro
    ? '<b>Rổ 1</b> là gói chuẩn để tính đ/m2 báo giá (chia 4 trụ cột + Quỹ phụ phí) · <b>Rổ 2</b> phần chủ nhà / ngoài gói · <b>Rổ 3</b> chi phí công ty lỡ nhập vào CT. Bấm <b>[+]</b> để xem rổ gồm những trụ cột / loại chi phí / khoản nào. Cấu hình rổ ở tab <b>Thiết lập</b>.'
    : 'Bấm <b>[+]</b> để tách nhỏ: Hạng mục → các <b>loại chi phí</b> → từng khoản chi. <b>% Cấp trên</b> = so với dòng cha · <b>Tách cấu thành</b> = tỉ lệ Vật tư / Nhân công / Khoán thầu phụ của phần việc.';
  const ncot = ro ? 5 : 6;
  if (th) th.innerHTML = `<tr>
      <th>${ro ? 'Rổ / Chi tiết' : 'Giai đoạn / Chi tiết'}</th><th class="text-end">Số tiền</th>
      <th class="text-end" style="width:110px">% Toàn CT</th><th class="text-end" style="width:96px">% Cấp trên</th>
      <th class="text-end">đ / m2 sàn</th>${ro ? '' : '<th>Tách cấu thành</th>'}</tr>`;

  const nodes = ro ? tytCayRo(r) : tytCay(r);
  let html = '';
  const walk = (n, depth, parentTien) => {
    if (an0 && !n.tien) return;
    const has  = n.children.length > 0;
    const open = has && _tytOpen.has(n.key);
    const toggle = has
      ? `<button type="button" class="tyt-cay-tg" onclick="tytCayToggle(this)" title="${open ? 'Thu gọn' : 'Mở rộng'}"><span class="material-symbols-outlined">${open ? 'remove' : 'add'}</span></button>`
      : '<span class="tyt-cay-tg-sp"></span>';
    let ten;
    if (n.kind === 'gd')        ten = `<b>${x(n.ten).toUpperCase()}</b>`;
    else if (n.kind === 'ro')   ten = `${_tytRoChip(n.ro)} <b>${x(n.ten.replace(/^Rổ \d · /, '').toUpperCase())}</b> <span class="tyt-cay-note">${x(TYT_RO[n.ro].mo)}</span>`;
    else if (n.kind === 'chua') ten = `<span class="material-symbols-outlined" style="font-size:15px;vertical-align:-3px">help</span> <b>Chưa phân bổ</b> <span class="tyt-cay-note">→ gán ở tab Phân Bổ</span>`;
    else if (n.kind === 'tru')  ten = `<span class="tyt-tru tyt-tru-${n.tru || 'x'}"></span><b>${x(n.ten)}</b> <span class="tyt-cay-note">${x(TYT_TRU[n.tru].mo)}</span>`;
    else if (n.kind === 'chung') ten = `<i>${x(n.ten)}</i>`;
    else if (n.kind === 'loai') ten = `${x(n.ten)} <span class="tyt-cay-note">(${n.soDong} ${n.ro !== undefined ? 'mục' : 'khoản'})</span>`;
    else if (n.kind === 'line') {
      const l = n.line;
      const mon = n.part && n.part.mon ? `<span class="tyt-cay-note">món</span> <b>${x(n.part.ten)}</b> <span class="tyt-cay-note">— HĐ: ${x((l.nd || '').slice(0, 50))}</span>` : x(l.nd || '—');
      const nguon = n.part ? ` <span class="tyt-cay-note" title="Nguồn xếp rổ">[${x(_TYT_RO_SRC[n.part.roSrc] || '')}]</span>` : '';
      ten = `<span class="tyt-cay-date">${fmtISODate(l.ngay)}</span> ${mon}${l.doiTuong ? ` <span class="tyt-cay-note">· ${x(l.doiTuong)}</span>` : ''}${nguon}`;
    } else ten = x(n.ten);
    // Cột theo rổ: Rổ 1 đủ · Rổ 2 không đ/m2 · Rổ 3 chỉ số tiền
    const nro = n.ro;
    const anPct = ro && nro === 3;
    const anM2  = ro && nro !== 1;
    const pctCha = parentTien === null ? '<span class="text-secondary">—</span>' : _tytPctTxt(n.tien, parentTien);
    const gach = '<td class="text-end text-secondary">—</td>';
    html += `<tr class="${_TYT_KIND_CLS[n.kind] || ''}${n.kind === 'ro' && nro === 0 ? ' tyt-cay-chua' : ''}${n.tien ? '' : ' tyt-rpt-zero'}" data-k="${x(n.key)}">
      <td><div class="tyt-cay-name" style="padding-left:${depth * 20}px">${toggle}<span>${ten}</span></div></td>
      <td class="text-end font-monospace" style="white-space:nowrap">${fmtM(n.tien)}</td>
      ${anPct ? gach : (n.kind === 'line' ? `<td class="text-end font-monospace">${_tytPctTxt(n.tien, r.tongChi)}</td>` : _tytPctCell(n.tien, r.tongChi))}
      ${anPct ? gach : `<td class="text-end font-monospace" style="white-space:nowrap">${pctCha}</td>`}
      ${anM2 ? gach : `<td class="text-end font-monospace" style="white-space:nowrap">${_tytM2Txt(n.tien, r.tongSan)}</td>`}
      ${ro ? '' : (n.kind === 'line' ? '<td></td>' : _tytCauThanhCell(n.ct, n.tien))}
    </tr>`;
    if (open) n.children.forEach(c => walk(c, depth + 1, n.tien));
  };
  nodes.forEach(n => walk(n, 0, null));

  if (!ro && !r.st.giaiDoan.length) {
    html = `<tr><td colspan="${ncot}" class="py-3 text-center" style="font-size:12.5px">
      <div class="text-secondary mb-2">Công trình chưa có giai đoạn / hạng mục — toàn bộ chi phí đang ở "Chưa phân bổ".</div>
      <button class="btn btn-sm btn-outline-primary" onclick="tytGoSub('tyt-sub-tl')"><span class="material-symbols-outlined msi-gap">tune</span>Sang tab Thiết lập</button>
    </td></tr>` + html;
  }
  if (!r.lines.length) html = `<tr><td colspan="${ncot}" class="text-center text-secondary py-3">Chưa có khoản chi nào</td></tr>`;
  tb.innerHTML = html + `<tr class="tyt-rpt-total">
    <td>TỔNG CÔNG TRÌNH</td>
    <td class="text-end font-monospace">${fmtM(r.tongChi)}</td>
    <td class="text-end font-monospace">${r.tongChi ? '100%' : '—'}</td>
    <td class="text-end font-monospace"></td>
    <td class="text-end font-monospace">${_tytM2Txt(r.tongChi, r.tongSan)}</td>${ro ? '' : '<td></td>'}
  </tr>` + (ro && r.tongSan > 0 ? `<tr class="tyt-rpt-total tyt-ro1-total">
    <td>RỔ 1 ÷ TỔNG SÀN <span class="tyt-cay-note">(con số báo giá phần thô)</span></td>
    <td class="text-end font-monospace">${fmtM(r.theoRo[1])}</td><td class="text-end font-monospace">${_tytPctTxt(r.theoRo[1], r.tongChi)}</td><td></td>
    <td class="text-end font-monospace">${fmtM(Math.round(r.cpM2Ro1))}</td>
  </tr>` : '');

  // Chấm đỏ "Chưa xếp rổ"
  const btn = document.getElementById('tyt-chuaro-btn');
  if (btn) {
    btn.style.display = r.chuaRo.length ? '' : 'none';
    const n = document.getElementById('tyt-chuaro-n');
    if (n) n.textContent = r.chuaRo.length;
  }
}

// Bấm [+]/[−] ở 1 dòng
function tytCayToggle(btn) {
  const k = btn?.closest('tr')?.dataset.k;
  if (!k) return;
  if (_tytOpen.has(k)) _tytOpen.delete(k); else _tytOpen.add(k);
  tytRenderCay();
}

// Mở hết (tới cấp Loại chi phí — chưa bung từng khoản chi) / Thu gọn hết — theo góc nhìn đang chọn
function tytCayAll(open) {
  _tytOpen.clear();
  if (open && _tytLast) {
    const walk = n => {
      if (n.kind === 'loai' || !n.children.length) return;
      _tytOpen.add(n.key);
      n.children.forEach(walk);
    };
    (_tytView === 'ro' ? tytCayRo(_tytLast) : tytCay(_tytLast)).forEach(walk);
  }
  tytRenderCay();
}

// ══ POPUP "CHƯA XẾP RỔ" (chấm đỏ — Phần A) ═════════════════════════
// Nhóm các khoản chưa có rổ theo LOẠI CHI PHÍ: xếp cả loại 1 lần (ghi vào bảng Loại → Rổ dùng chung)
// hoặc xếp từng khoản (gán tay rổ — chỉ công trình này). Xử lý hết → popup tự đóng.
function tytMoChuaRo() {
  const r = _tytLast;
  if (!r) return;
  if (!r.chuaRo.length) { if (typeof closeModal === 'function') closeModal(); toast('✅ Không còn khoản nào chưa xếp rổ', 'success'); return; }
  const m = new Map();
  r.chuaRo.forEach(l => {
    const tien = l.parts.filter(pt => pt.ro === 0).reduce((s, pt) => s + pt.tien, 0);
    const o = m.get(l.loai) || { loai: l.loai, tien: 0, ls: [] };
    o.tien += tien; o.ls.push({ l, tien });
    m.set(l.loai, o);
  });
  const nut = (fn, arg) => [1, 2, 3].map(ro => `<button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="${fn}(${arg}, ${ro})" title="${x(TYT_RO[ro].ten)}">${TYT_RO[ro].ngan}</button>`).join(' ');
  const nhom = [...m.values()].sort((a, b) => b.tien - a.tien);
  const body = `<div class="text-secondary mb-2" style="font-size:12px">${r.chuaRo.length} khoản chưa có rổ. Xếp <b>cả loại</b> (áp cho mọi công trình, lưu vào bảng Loại → Rổ) hoặc xếp <b>từng khoản</b> (chỉ công trình này).</div>
    ${nhom.map((o, gi) => `<div class="border rounded mb-2">
      <div class="d-flex align-items-center flex-wrap gap-2 px-2 py-1" style="background:var(--bs-tertiary-bg)">
        <b>${x(o.loai)}</b> <span class="text-secondary" style="font-size:12px">${o.ls.length} khoản · ${fmtM(o.tien)}</span>
        <span class="ms-auto" style="font-size:12px">Xếp cả loại vào: ${nut('tytChuaRoLoai', gi)}</span>
      </div>
      <table class="table table-sm align-middle mb-0" style="font-size:12px"><tbody>
        ${o.ls.slice(0, 40).map(({ l, tien }) => `<tr>
          <td class="text-secondary" style="white-space:nowrap">${fmtISODate(l.ngay)}</td>
          <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(l.nd)}">${x(l.nd || '—')}</td>
          <td class="text-secondary" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x(l.doiTuong || '')}</td>
          <td class="text-end font-monospace" style="white-space:nowrap">${fmtM(tien)}</td>
          <td class="text-end" style="white-space:nowrap">${nut('tytChuaRoKhoan', `'${x(l.key)}'`)}</td></tr>`).join('')}
        ${o.ls.length > 40 ? `<tr><td colspan="5" class="text-secondary text-center">… và ${o.ls.length - 40} khoản nữa — xếp cả loại hoặc dùng bộ lọc "Chưa xếp rổ" ở tab Phân Bổ</td></tr>` : ''}
      </tbody></table></div>`).join('')}`;
  _tytChuaRoNhom = nhom.map(o => o.loai);
  document.getElementById('modal-title').innerHTML = '<span class="material-symbols-outlined msi-gap">priority_high</span>Khoản Chưa Xếp Rổ';
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('ct-modal').classList.add('open');
}
let _tytChuaRoNhom = [];
function tytChuaRoLoai(gi, ro) {
  const loai = _tytChuaRoNhom[gi];
  if (loai === undefined) return;
  const cfg = tytRoCfg();
  cfg.roLoai[tytLoaiKey(loai)] = ro;
  tytSaveRoCfg({ roLoai: cfg.roLoai });
  toast(`✅ Loại "${loai}" → ${TYT_RO[ro].ngan} (áp cho mọi công trình)`, 'success');
  _tytRecalc(); tytMoChuaRo();
}
function tytChuaRoKhoan(key, ro) {
  const p = _tytProj();
  if (!p) return;
  const st = tytStructOf(p.id);
  st.roTay[key] = ro;
  tytSaveStruct(p.id, { roTay: st.roTay });
  _tytRecalc(); tytMoChuaRo();
}

// ══ CẤU HÌNH RỔ — tab Thiết lập (dùng chung mọi công trình) ════════════
function _tytRenderRoCfg(r) {
  const tb = document.getElementById('tyt-roloai-tbody');
  const cfg = r.cfg;
  // Danh sách loại: danh mục + loại đang có ở CT này
  const tienCT = new Map();
  r.lines.forEach(l => tienCT.set(l.loai, (tienCT.get(l.loai) || 0) + l.tien));
  const ds = new Map();
  ((typeof cats !== 'undefined' && cats && Array.isArray(cats.loaiChiPhi)) ? cats.loaiChiPhi : []).forEach(n => { if (n) ds.set(tytLoaiKey(n), n); });
  tienCT.forEach((_, n) => { if (!ds.has(tytLoaiKey(n))) ds.set(tytLoaiKey(n), n); });
  const list = [...ds.values()].sort((a, b) => ((tienCT.get(b) || 0) - (tienCT.get(a) || 0)) || a.localeCompare(b, 'vi'));
  if (tb) {
    tb.innerHTML = list.map((n, i) => {
      const m = tytRoCuaLoai(n, cfg);
      return `<tr class="${m.ro === 0 ? 'table-danger' : ''}">
        <td>${x(n)}</td>
        <td class="text-end font-monospace text-secondary" style="white-space:nowrap">${tienCT.get(n) ? fmtM(tienCT.get(n)) : ''}</td>
        <td><select class="form-select form-select-sm py-0" onchange="tytRoLoaiSet(${i}, this.value)">
          ${[1, 2, 3, 0].map(ro => `<option value="${ro}"${m.ro === ro ? ' selected' : ''}>${ro ? TYT_RO[ro].ngan + ' · ' + ['', 'Gói thô', 'Chủ nhà', 'Công ty'][ro] : 'Chưa xếp'}</option>`).join('')}
        </select>${m.src === 'macdinh' ? '<div class="tyt-cay-note">mặc định</div>' : ''}</td>
        ${_tytTruSelHtml(n, i, cfg, m.ro)}
      </tr>`;
    }).join('');
  }
  _tytRoLoaiDs = list;
  const dl = document.getElementById('tyt-roluat-dl');
  if (dl) dl.innerHTML = list.map(n => `<option value="${x(n)}">`).join('');

  // Luật rổ
  const tl = document.getElementById('tyt-roluat-tbody');
  if (tl) {
    const nhan = new Map();
    r.lines.forEach(l => l.parts.forEach(pt => {
      if (pt.roSrc !== 'luat') return;
      const o = nhan.get(pt.roRef) || { n: 0, tien: 0 };
      o.n++; o.tien += pt.tien; nhan.set(pt.roRef, o);
    }));
    tl.innerHTML = cfg.roLuat.length ? cfg.roLuat.map((lu, i) => {
      const o = nhan.get(lu.id) || { n: 0, tien: 0 };
      return `<tr>
        <td class="text-secondary">${i + 1}</td>
        <td>${lu.loai ? x(lu.loai) : '<span class="text-secondary">mọi loại</span>'}</td>
        <td>"${x(lu.tuKhoa)}"</td>
        <td>${_tytRoChip(+lu.ro)}</td>
        <td class="text-end font-monospace" style="white-space:nowrap">${o.n ? `${o.n} mục · ${fmtM(o.tien)}` : '<span class="text-secondary">0</span>'}</td>
        <td class="text-end" style="white-space:nowrap">
          <button type="button" class="btn btn-link btn-sm p-0 text-secondary" title="Ưu tiên lên trên" onclick="tytRoLuatMove('${lu.id}',-1)" ${i === 0 ? 'disabled' : ''}><span class="material-symbols-outlined" style="font-size:17px">arrow_upward</span></button>
          <button type="button" class="btn btn-link btn-sm p-0 text-danger" title="Xóa luật" onclick="tytRoLuatDel('${lu.id}')"><span class="material-symbols-outlined" style="font-size:17px">delete</span></button>
        </td></tr>`;
    }).join('') : '<tr><td colspan="6" class="text-secondary text-center py-2">Chưa có luật rổ.</td></tr>';
  }
}
let _tytRoLoaiDs = [];

// (Phần B) Ô chọn TRỤ CỘT Rổ 1 của 1 loại — mờ đi khi loại không thuộc Rổ 1 (vẫn chọn được vì luật rổ
// có thể kéo từng khoản của loại đó vào Rổ 1, VD loại "Khác" có chữ "xà bần")
function _tytTruSelHtml(n, i, cfg, ro) {
  const t = tytTruCuaLoai(n, cfg);
  return `<td style="${ro === 1 ? '' : 'opacity:.45'}"><select class="form-select form-select-sm py-0${ro === 1 && !t.tru ? ' border-danger' : ''}" onchange="tytTruLoaiSet(${i}, this.value)">
      ${TYT_TRU_THU_TU.map(k => `<option value="${k}"${t.tru === k ? ' selected' : ''}>${k ? TYT_TRU[k].ten : '— Chưa xếp —'}</option>`).join('')}
    </select>${t.src === 'macdinh' && t.tru ? '<div class="tyt-cay-note">mặc định</div>' : ''}</td>`;
}
function tytTruLoaiSet(i, v) {
  const n = _tytRoLoaiDs[i];
  if (n === undefined) return;
  const cfg = tytRoCfg();
  cfg.truLoai[tytLoaiKey(n)] = v;
  tytSaveRoCfg({ truLoai: cfg.truLoai });
  toast(`✅ "${n}" → trụ cột ${TYT_TRU[v] ? TYT_TRU[v].ten : ''} (áp cho mọi công trình)`, 'success');
  _tytRecalc();
}
function tytRoLoaiSet(i, v) {
  const n = _tytRoLoaiDs[i];
  if (n === undefined) return;
  const cfg = tytRoCfg();
  cfg.roLoai[tytLoaiKey(n)] = +v;
  tytSaveRoCfg({ roLoai: cfg.roLoai });
  toast(`✅ "${n}" → ${TYT_RO[+v].ngan} (áp cho mọi công trình)`, 'success');
  _tytRecalc();
}
function tytRoLuatAdd() {
  const loai = (document.getElementById('tyt-roluat-loai')?.value || '').trim();
  const tkEl = document.getElementById('tyt-roluat-tk');
  const tk = (tkEl?.value || '').trim();
  const ro = +(document.getElementById('tyt-roluat-ro')?.value || 1);
  if (!tk) { toast('Nhập từ khóa cho luật rổ!', 'error'); tkEl?.focus(); return; }
  const cfg = tytRoCfg();
  cfg.roLuat.push({ id: tytNewId('q'), loai, tuKhoa: tk, ro });
  tytSaveRoCfg({ roLuat: cfg.roLuat });
  if (tkEl) tkEl.value = '';
  toast('✅ Đã thêm luật rổ (áp cho mọi công trình)', 'success');
  _tytRecalc();
}
function tytRoLuatDel(id) {
  const cfg = tytRoCfg();
  const lu = cfg.roLuat.find(z => z.id === id);
  if (!lu || !confirm(`Xóa luật rổ "${lu.tuKhoa}" → ${TYT_RO[+lu.ro].ngan}?\n(Áp dụng cho mọi công trình)`)) return;
  tytSaveRoCfg({ roLuat: cfg.roLuat.filter(z => z.id !== id) });
  _tytRecalc();
}
function tytRoLuatMove(id, dir) {
  const cfg = tytRoCfg();
  const a = cfg.roLuat, i = a.findIndex(z => z.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]];
  tytSaveRoCfg({ roLuat: a });
  _tytRecalc();
}
function tytRoLuatMacDinh() {
  if (!confirm('Thay TOÀN BỘ luật rổ hiện tại bằng bộ luật mặc định?\n(Áp dụng cho mọi công trình — bảng Loại → Rổ giữ nguyên)')) return;
  tytSaveRoCfg({ roLuat: TYT_RO_LUAT_MAC_DINH.map(l => ({ id: tytNewId('q'), ...l })) });
  _tytRecalc();
}

// Gán RỔ tay cho các dòng đang tick ở bảng Gán tay (0 = bỏ gán tay → tự động)
function tytPbGanRo() {
  const p = _tytProj();
  if (!p) return;
  if (!_tytPbSel.size) { toast('Chưa tick khoản chi nào!', 'error'); return; }
  const ro = +(document.getElementById('tyt-pb-ro')?.value || 0);
  const st = tytStructOf(p.id);
  _tytPbSel.forEach(k => { if (ro) st.roTay[k] = ro; else delete st.roTay[k]; });
  const n = _tytPbSel.size;
  tytSaveStruct(p.id, { roTay: st.roTay });
  _tytPbSel.clear();
  toast(ro ? `✅ Đã xếp ${n} khoản vào ${TYT_RO[ro].ngan}` : `Đã bỏ gán tay rổ ${n} khoản (về tự động)`, 'success');
  _tytRecalc();
}

// Rổ của HĐ thầu phụ ('' = theo loại chi phí)
function tytHdtpSetRo(id, v) {
  const p = _tytProj();
  if (!p) return;
  const st = tytStructOf(p.id);
  const cu = st.theoHdtp[id] || { g: '', h: '' };
  if (+v) st.theoHdtp[id] = { ...cu, ro: +v };
  else { const { ro, ...con } = cu; if (con.g || con.h) st.theoHdtp[id] = con; else delete st.theoHdtp[id]; }
  tytSaveStruct(p.id, { theoHdtp: st.theoHdtp });
  toast(+v ? `✅ HĐ thầu phụ → ${TYT_RO[+v].ngan}` : 'HĐ thầu phụ: rổ theo loại chi phí', 'success');
  _tytRecalc();
}

// ══ PHÂN BỔ CHI PHÍ ═════════════════════════════════════════════
// <option> "gán vào": mỗi giai đoạn 1 nhóm — [cả giai đoạn] + từng hạng mục. Dùng chung cho
// dropdown gán tay, luật mới, HĐ thầu phụ. cur: giá trị đang chọn ("g:<id>" | "h:<id>"); ph: dòng đầu.
function _tytDichOpts(st, cur, ph) {
  if (!st.giaiDoan.length) return '<option value="">(Chưa có giai đoạn — tạo ở tab Thiết lập)</option>';
  return `<option value="">${x(ph || "-- Gán vào --")}</option>` + st.giaiDoan.map(g => {
    const hms = st.hangMuc.filter(h => h.gdId === g.id);
    return `<optgroup label="${x(g.ten)}">
      <option value="g:${g.id}"${cur === "g:" + g.id ? " selected" : ""}>${x(g.ten)} (cả giai đoạn)</option>
      ${hms.map(h => `<option value="h:${h.id}"${cur === "h:" + h.id ? " selected" : ""}>${x(g.ten)} › ${x(h.ten)}</option>`).join("")}
    </optgroup>`;
  }).join("");
}
// "g:<id>" | "h:<id>" ↔ { g, h } (đích lưu trong luật / theoHdtp / phanBo)
function _tytDichParse(v, st) {
  if (!v) return null;
  if (v.startsWith("h:")) { const h = st.hangMuc.find(z => z.id === v.slice(2)); return h ? { g: h.gdId, h: h.id } : null; }
  if (v.startsWith("g:")) return { g: v.slice(2), h: "" };
  return null;
}
function _tytDichVal(d) { return !d ? "" : (d.h ? "h:" + d.h : (d.g ? "g:" + d.g : "")); }
// Tên hiển thị của 1 đích ("Phần thô › Lầu 1"); đích đã bị xóa → null
function _tytDichTen(d, st) {
  const v = _tytDich(d, st);
  if (!v) return null;
  const g = st.giaiDoan.find(z => z.id === v.g);
  const h = v.h ? st.hangMuc.find(z => z.id === v.h) : null;
  return (g ? g.ten : "?") + (h ? " › " + h.ten : "");
}

function _tytRenderPbDich(r) {
  const sel = document.getElementById("tyt-pb-dich");
  if (sel) { const cur = sel.value; sel.innerHTML = _tytDichOpts(r.st, cur); }
}

// Dropdown lọc loại chi phí
function _tytRenderPbLoai(r) {
  const sel = document.getElementById('tyt-pb-loai');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Mọi loại chi phí</option>' +
    r.theoLoai.map(o => `<option value="${x(o.loai)}">${x(o.loai)}</option>`).join('');
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
}

// Các dòng chi phí theo bộ lọc đang chọn
function _tytPbFiltered() {
  if (!_tytLast) return [];
  const tt   = document.getElementById("tyt-pb-tt")?.value || "chua";
  const loai = document.getElementById("tyt-pb-loai")?.value || "";
  const q    = (document.getElementById("tyt-pb-q")?.value || "").trim().toLowerCase();
  return _tytLast.lines.filter(l => {
    if (tt === "chua" && l.pb.g) return false;
    if (tt === "chuaro") { if (!l.parts.some(pt => pt.ro === 0)) return false; }        // (Phần A)
    else if (tt !== "chua" && tt !== "all" && l.pb.src !== tt) return false;   // ngay | tiento | luat | hdtp | tay
    if (loai && l.loai !== loai) return false;
    if (q && !(`${l.nd} ${l.doiTuong} ${l.loai}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

// Đổi bộ lọc → về trang 1, bỏ chọn (tránh gán nhầm dòng không còn nhìn thấy)
function tytPbFilter() {
  _tytPbSel.clear();
  tytRenderPb(0);
}

// Nhãn "Thuộc" của 1 dòng — màu theo NGUỒN xếp (class .tyt-src-*: tay / hdtp / luat / ngay)
const _TYT_SRC_TXT = { tay: "", hdtp: "theo HĐ TP", tiento: "theo [ ]", luat: "theo luật", ngay: "theo ngày" };
const _TYT_SRC_TIP = { tiento: "Tự xếp theo tiền tố [ ] đầu nội dung", tay: "Đã gán tay", hdtp: "Tự xếp theo HĐ thầu phụ đã gắn", luat: "Tự xếp theo luật", ngay: "Tự xếp theo mốc ngày của giai đoạn" };
function _tytPbLabel(l) {
  if (!l.pb.g) return '<span class="tyt-src">Chưa phân bổ</span>';
  const ten = x(_tytDichTen(l.pb, _tytLast.st) || "?");
  const sub = _TYT_SRC_TXT[l.pb.src];
  return `<span class="tyt-src tyt-src-${l.pb.src}" title="${_TYT_SRC_TIP[l.pb.src] || ""}">${ten}${sub ? " · " + sub : ""}</span>`;
}

const _TYT_KIND_TXT = { cc: 'Chấm công', ungtp: 'Ứng TP', ungncc: 'Ứng NCC' };

function tytRenderPb(page) {
  const tb = document.getElementById('tyt-pb-tbody');
  if (!tb || !_tytLast) return;
  const list = _tytPbFiltered();
  const total = list.length;
  const tong = list.reduce((s, l) => s + l.tien, 0);
  const cnt = document.getElementById('tyt-pb-count');
  if (cnt) cnt.textContent = `${total} khoản · ${fmtM(tong)}`;

  page = page || 0;
  if (page * TYT_PB_PG >= total) page = Math.max(0, Math.ceil(total / TYT_PB_PG) - 1);
  _tytPbPage = page;
  const slice = list.slice(page * TYT_PB_PG, (page + 1) * TYT_PB_PG);
  if (!total) {
    tb.innerHTML = '<tr><td colspan="8" class="text-center text-secondary py-4">Không có khoản chi nào khớp bộ lọc</td></tr>';
  } else {
    tb.innerHTML = slice.map(l => {
      const k = x(l.key);
      const on = _tytPbSel.has(l.key);
      const kindTxt = _TYT_KIND_TXT[l.kind] ? `<span class="badge text-bg-secondary bg-opacity-25 text-secondary-emphasis ms-1" style="font-size:9.5px">${_TYT_KIND_TXT[l.kind]}</span>` : '';
      return `<tr style="${on ? 'background:var(--bs-primary-bg-subtle)' : ''}">
        <td class="text-center"><input type="checkbox" class="form-check-input" data-k="${k}" ${on ? 'checked' : ''} onchange="tytPbToggle(this)"></td>
        <td class="text-secondary" style="white-space:nowrap;font-size:12px">${fmtISODate(l.ngay)}</td>
        <td style="white-space:nowrap">${x(l.loai)}${kindTxt}</td>
        <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(l.nd)}">${x(l.nd || '—')}</td>
        <td class="text-secondary" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(l.doiTuong)}">${x(l.doiTuong || '—')}</td>
        <td class="text-end font-monospace fw-semibold" style="white-space:nowrap">${fmtM(l.tien)}</td>
        <td style="white-space:nowrap">${_tytRoChipLine(l)}</td>
        <td style="white-space:nowrap">${_tytPbLabel(l)}</td>
      </tr>`;
    }).join('');
  }
  const pg = document.getElementById('tyt-pb-pagination');
  if (pg) pg.innerHTML = (typeof _dtPaginationHtml === 'function') ? _dtPaginationHtml(total, page, 'tytRenderPb', TYT_PB_PG) : '';
  _tytPbUpdateSel(list);
}

// Cập nhật số dòng đã chọn + trạng thái ô "chọn tất cả"
function _tytPbUpdateSel(list) {
  list = list || _tytPbFiltered();
  const el = document.getElementById('tyt-pb-selcount');
  if (el) el.textContent = _tytPbSel.size;
  const all = document.getElementById('tyt-pb-all');
  if (all) {
    const n = list.filter(l => _tytPbSel.has(l.key)).length;
    all.checked = list.length > 0 && n === list.length;
    all.indeterminate = n > 0 && n < list.length;
  }
}

function tytPbToggle(cb) {
  const k = cb.dataset.k;
  if (cb.checked) _tytPbSel.add(k); else _tytPbSel.delete(k);
  const tr = cb.closest('tr');
  if (tr) tr.style.background = cb.checked ? 'var(--bs-primary-bg-subtle)' : '';
  _tytPbUpdateSel();
}

// Chọn / bỏ chọn MỌI dòng đang lọc (tất cả các trang)
function tytPbSelectAll(on) {
  const list = _tytPbFiltered();
  list.forEach(l => { if (on) _tytPbSel.add(l.key); else _tytPbSel.delete(l.key); });
  tytRenderPb(_tytPbPage);
}

// Gán các dòng đã chọn vào giai đoạn / hạng mục
function tytPbAssign() {
  const p = _tytProj();
  if (!p) return;
  if (_tytDraft) { toast('Hãy Lưu (hoặc Hủy) thay đổi cấu trúc giai đoạn trước khi gán', 'error'); return; }
  const dich = document.getElementById('tyt-pb-dich')?.value || '';
  if (!dich) { toast('Chọn giai đoạn / hạng mục cần gán vào!', 'error'); return; }
  if (!_tytPbSel.size) { toast('Chưa tick khoản chi nào!', 'error'); return; }
  const st = tytStructOf(p.id);
  let val;
  if (dich.startsWith('h:')) {
    const h = st.hangMuc.find(z => z.id === dich.slice(2));
    if (!h) return;
    val = { g: h.gdId, h: h.id };
  } else {
    val = { g: dich.slice(2), h: '' };
  }
  const n = _tytPbSel.size;
  _tytPbSel.forEach(k => { st.phanBo[k] = { ...val }; });
  tytSaveStruct(p.id, { phanBo: st.phanBo });
  _tytPbSel.clear();
  toast(`✅ Đã gán ${n} khoản chi`, 'success');
  _tytRecalc();
}

// Bỏ gán tay → dòng quay về tự xếp theo mốc ngày (nếu có) hoặc Chưa phân bổ
function tytPbUnassign() {
  const p = _tytProj();
  if (!p) return;
  if (!_tytPbSel.size) { toast('Chưa tick khoản chi nào!', 'error'); return; }
  const st = tytStructOf(p.id);
  let n = 0;
  _tytPbSel.forEach(k => { if (st.phanBo[k]) { delete st.phanBo[k]; n++; } });
  if (!n) { toast('Các dòng đã chọn không có gán tay nào', 'info'); return; }
  tytSaveStruct(p.id, { phanBo: st.phanBo });
  _tytPbSel.clear();
  toast(`Đã bỏ gán tay ${n} khoản chi`, 'success');
  _tytRecalc();
}

// ══ LUẬT TỰ GÁN (tab con PHÂN BỔ — Lần 2) ═════════════════════════
// Luật lưu ở st.luat (tytrong_v1) — lớp TỰ ĐỘNG, xét theo thứ tự; xóa luật = tự hoàn tác.
function _tytRenderLuat(r) {
  const st = r.st;
  const tb = document.getElementById('tyt-luat-tbody');
  if (tb) {
    tb.innerHTML = st.luat.length ? st.luat.map((lu, i) => {
      const xt  = tytLuatXemTruoc(r, lu);
      const ten = _tytDichTen(lu, st);
      const bi  = xt.tong - xt.nhan;   // khớp nhưng bị gán tay / HĐ TP / luật trước giành
      return `<tr>
        <td class="text-secondary">${i + 1}</td>
        <td>${TYT_LUAT_TRUONG[lu.truong] || ''} <b>"${x(lu.giaTri)}"</b></td>
        <td>${ten ? `<span class="tyt-src tyt-src-luat">${x(ten)}</span>` : '<span class="text-danger" title="Giai đoạn / hạng mục đã bị xóa — luật đang tạm ngưng">⚠ đích đã xóa</span>'}</td>
        <td class="text-end font-monospace" style="white-space:nowrap">${xt.nhan} khoản · ${fmtM(xt.tienNhan)}
          ${bi ? `<div class="text-secondary" style="font-size:10.5px" title="Các khoản này đã được gán tay / theo HĐ thầu phụ / luật đứng trước">+${bi} khoản khớp nhưng ưu tiên khác giữ</div>` : ''}</td>
        <td class="text-end" style="white-space:nowrap">
          <button type="button" class="btn btn-link btn-sm p-0 text-secondary" title="Ưu tiên lên trên" onclick="tytLuatMove('${lu.id}',-1)" ${i === 0 ? 'disabled' : ''}><span class="material-symbols-outlined" style="font-size:17px">arrow_upward</span></button>
          <button type="button" class="btn btn-link btn-sm p-0 text-danger" title="Xóa luật (các khoản luật này đang nhận sẽ tự quay về như cũ)" onclick="tytLuatDel('${lu.id}')"><span class="material-symbols-outlined" style="font-size:17px">delete</span></button>
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="5" class="text-secondary text-center py-2" style="font-size:12px">
        Chưa có luật. VD: <i>Nội dung chứa</i> "móng, đà kiềng" → Móng · <i>NCC chứa</i> "thạch cao" → Hoàn thiện.</td></tr>`;
  }
  const sel = document.getElementById('tyt-luat-dich');
  if (sel) { const cur = sel.value; sel.innerHTML = _tytDichOpts(st, cur); }
  tytLuatPreview();
}

// Gợi ý giá trị (datalist) + xem trước số khoản luật đang soạn sẽ nhận
function tytLuatPreview() {
  const truong = document.getElementById('tyt-luat-truong')?.value || 'nd';
  const gt     = (document.getElementById('tyt-luat-gt')?.value || '').trim();
  const dl     = document.getElementById('tyt-luat-dl');
  const box    = document.getElementById('tyt-luat-xt');
  if (!_tytLast) return;
  if (dl) {
    const vals = truong === 'loai' ? _tytLast.theoLoai.map(o => o.loai)
      : truong === 'dt' ? [...new Set(_tytLast.lines.map(l => l.doiTuong).filter(Boolean))] : [];
    dl.innerHTML = vals.map(v => `<option value="${x(v)}">`).join('');
  }
  if (!box) return;
  if (!gt) { box.innerHTML = ''; return; }
  const xt = tytLuatXemTruoc(_tytLast, { truong, giaTri: gt });
  box.innerHTML = xt.tong
    ? `<span class="text-success">Khớp <b>${xt.tong}</b> khoản (${fmtM(xt.tien)})</span> → sẽ nhận <b>${xt.nhan}</b> khoản (${fmtM(xt.tienNhan)}) đang chưa phân bổ / theo ngày.` +
      (xt.tong > xt.nhan ? ` <span class="text-secondary">${xt.tong - xt.nhan} khoản còn lại đã có ưu tiên cao hơn.</span>` : '')
    : '<span class="text-warning-emphasis">Chưa khớp khoản chi nào — kiểm tra lại từ khóa.</span>';
}

function tytLuatAdd() {
  const p = _tytProj();
  if (!p || !_tytLast) return;
  const truong = document.getElementById('tyt-luat-truong')?.value || 'nd';
  const gtEl   = document.getElementById('tyt-luat-gt');
  const gt     = (gtEl?.value || '').trim();
  const st     = tytStructOf(p.id);
  const d      = _tytDichParse(document.getElementById('tyt-luat-dich')?.value || '', st);
  if (!gt) { toast('Nhập từ khóa / giá trị cho luật!', 'error'); gtEl?.focus(); return; }
  if (!d)  { toast('Chọn giai đoạn / hạng mục cần gán vào!', 'error'); return; }
  const xt = tytLuatXemTruoc(_tytLast, { truong, giaTri: gt });
  st.luat.push({ id: tytNewId('r'), truong, giaTri: gt, g: d.g, h: d.h });
  tytSaveStruct(p.id, { luat: st.luat });
  if (gtEl) gtEl.value = '';
  toast(`✅ Đã thêm luật — nhận ${xt.nhan} khoản (${fmtM(xt.tienNhan)})`, 'success');
  _tytRecalc();
}

function tytLuatDel(id) {
  const p = _tytProj();
  if (!p) return;
  const st = tytStructOf(p.id);
  const lu = st.luat.find(z => z.id === id);
  if (!lu) return;
  if (!confirm(`Xóa luật ${TYT_LUAT_TRUONG[lu.truong]} "${lu.giaTri}"?\nCác khoản luật này đang nhận sẽ tự quay về như trước (mốc ngày / chưa phân bổ).`)) return;
  tytSaveStruct(p.id, { luat: st.luat.filter(z => z.id !== id) });
  toast('Đã xóa luật', 'success');
  _tytRecalc();
}

function tytLuatMove(id, dir) {
  const p = _tytProj();
  if (!p) return;
  const arr = tytStructOf(p.id).luat;
  const i = arr.findIndex(z => z.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  tytSaveStruct(p.id, { luat: arr });
  _tytRecalc();
}

// ══ GẮN THEO HỢP ĐỒNG THẦU PHỤ (tab con PHÂN BỔ — Lần 2) ═══════════════
function _tytRenderHdtp(r) {
  const tb = document.getElementById('tyt-hdtp-tbody');
  if (!tb) return;
  const st = r.st, ds = r.ctx.hdtp;
  if (!ds.length) {
    tb.innerHTML = '<tr><td colspan="4" class="text-secondary text-center py-2" style="font-size:12px">Công trình chưa có hợp đồng thầu phụ (tab Công Nợ → Hợp đồng thầu phụ).</td></tr>';
    return;
  }
  const tk = tytHdtpThongKe(r);
  tb.innerHTML = ds.map(h => {
    const o = tk.get(h.id) || { soKhoan: 0, tien: 0, nhan: 0 };
    const cur = st.theoHdtp[h.id];
    const daXoa = cur && (cur.g || cur.h) && !_tytDich(cur, st);
    const roHd = cur && cur.ro ? +cur.ro : 0;
    const roMd = tytRoCuaLoai(TYT_LOAI_UNG_TP, r.cfg).ro;   // rổ mặc định theo loại "Thầu Phụ"
    return `<tr>
      <td><div class="fw-semibold">${x(h.ten || '—')}</div>
        <div class="text-secondary text-truncate" style="font-size:10.5px;max-width:200px" title="${x(h.nd)}">HĐ ${fmtM(h.giaTri)}${h.nd ? ' · ' + x(h.nd) : ''}</div></td>
      <td class="text-end font-monospace" style="white-space:nowrap">${fmtM(o.tien)}<div class="text-secondary" style="font-size:10.5px">${o.soKhoan} khoản</div></td>
      <td><select class="form-select form-select-sm" style="min-width:110px" onchange="tytHdtpSetRo('${h.id}', this.value)">
          <option value="0">Theo loại (${TYT_RO[roMd].ngan})</option>
          ${[1, 2, 3].map(ro => `<option value="${ro}"${roHd === ro ? ' selected' : ''}>${TYT_RO[ro].ngan} · ${['', 'Gói thô', 'Chủ nhà', 'Công ty'][ro]}</option>`).join('')}
        </select></td>
      <td><select class="form-select form-select-sm" style="min-width:150px" onchange="tytHdtpSet('${h.id}', this.value)">${_tytDichOpts(st, _tytDichVal(_tytDich(cur, st)), '— Không gắn —')}</select>
        ${daXoa ? '<div class="text-danger" style="font-size:10.5px">⚠ nơi gắn cũ đã bị xóa</div>' : ''}
        ${cur && !daXoa && o.nhan < o.soKhoan ? `<div class="text-secondary" style="font-size:10.5px">${o.soKhoan - o.nhan} khoản đã gán tay nơi khác</div>` : ''}</td>
    </tr>`;
  }).join('');
}

function tytHdtpSet(id, v) {
  const p = _tytProj();
  if (!p) return;
  const st = tytStructOf(p.id);
  const d = _tytDichParse(v, st);
  const ro = st.theoHdtp[id] && st.theoHdtp[id].ro;   // (Phần A) giữ rổ đã chọn của HĐ
  if (d) st.theoHdtp[id] = ro ? { ...d, ro } : d;
  else if (ro) st.theoHdtp[id] = { g: '', h: '', ro };
  else delete st.theoHdtp[id];
  tytSaveStruct(p.id, { theoHdtp: st.theoHdtp });
  toast(d ? '✅ Đã gắn HĐ thầu phụ' : 'Đã bỏ gắn HĐ thầu phụ', 'success');
  _tytRecalc();
}

// ══ KIỂM SOÁT ĐỊNH MỨC (tab con 4 — Lần 2, làm lại 07/10/2026 — Cải tiến Phần B: CHỈ RỔ 1) ══════
// • Bảng kiểm soát (#tyt-dt-*): 4 trụ cột Rổ 1 + Quỹ phụ phí — ngân sách = diện tích × định mức đ/m2,
//   so với thực tế CT đang chọn; CHỈ tô đỏ khi vượt (quản trị ngoại lệ). Bấm [+] xem loại chi phí trong trụ cột.
// • Bộ định mức (#tyt-dm-*): lưu từ CT · nhập tay 4 trụ cột (định mức an toàn) · sửa · cập nhật lại từ CT nguồn
//   (cho định mức lưu trước Phần B chưa có số Rổ 1) · xóa.
// • Thư viện đơn giá module (#tyt-tv-*): tick giai đoạn / hạng mục của 1 định mức → giá vốn + giá báo.
let _tytDtDm = '';             // id định mức đang chọn ở bảng Kiểm soát
const _tytKsOpen = new Set();  // trụ cột đang bung xem loại chi phí

function _tytRenderDm(r) {
  const p = _tytProj();
  // Ghi chú điều kiện lưu định mức
  const note = document.getElementById('tyt-dm-note');
  if (note && p) {
    const ws = [];
    if (!(r.tongSan > 0)) ws.push('<span class="text-danger">✗ Chưa có tổng diện tích sàn — nhập bảng M2 ở tab Thiết lập.</span>');
    if (p.status !== 'closed') ws.push('<span class="text-warning-emphasis">⚠ Công trình chưa quyết toán — đơn giá có thể chưa đủ.</span>');
    if (!r.allYears && tytNhanNam() !== 'Tất cả năm') ws.push(`<span class="text-warning-emphasis">⚠ Đang lọc năm ${x(tytNhanNam())} — bật "Trọn vòng đời" để lấy đủ chi phí.</span>`);
    if (r.theoRo[0] > 0) ws.push(`<span class="text-warning-emphasis">⚠ Còn ${fmtM(r.theoRo[0])} chưa xếp rổ — xếp xong số Rổ 1 mới đủ.</span>`);
    if (r.theoTru[''] > 0) ws.push(`<span class="text-warning-emphasis">⚠ Còn ${fmtM(r.theoTru[''])} Rổ 1 chưa xếp trụ cột (tab Thiết lập).</span>`);
    if (r.tongSan > 0) ws.unshift(`Sẽ lưu: <b>Rổ 1 ${fmtM(Math.round(r.cpM2Ro1))}/m2</b> (toàn bộ ${fmtM(Math.round(r.cpM2))}/m2, sàn ${tytFmtM2(r.tongSan)} m2).`);
    note.innerHTML = ws.map(w => `<div>${w}</div>`).join('');
  }
  const tenEl = document.getElementById('tyt-dm-ten');
  if (tenEl && p && tenEl.dataset.pid !== p.id) { tenEl.value = 'Định mức — ' + p.name; tenEl.dataset.pid = p.id; }

  // Danh sách định mức: Rổ 1 đ/m2 là số chính, 4 trụ cột ghi nhỏ bên dưới
  const list = tytDinhMucList();
  const tb = document.getElementById('tyt-dm-tbody');
  if (tb) {
    tb.innerHTML = list.length ? list.map(dm => {
      const co = tytDmCoRo1(dm);
      const tru = co ? TYT_TRU_DS.map(t => `${TYT_TRU[t].ten} ${fmtM(+dm.ro1[t] || 0)}`).join(' · ') : '';
      return `<tr class="${dm.id === _tytDtDm ? 'table-primary' : ''}">
        <td><div class="fw-semibold">${x(dm.ten)}${dm.nhapTay ? ' <span class="badge text-bg-secondary" style="font-size:9.5px">nhập tay</span>' : ''}</div>
          <div class="text-secondary" style="font-size:10.5px">${dm.nhapTay ? 'Định mức an toàn' : x(dm.nguonTen || '') + ' · ' + tytFmtM2(dm.tongSan) + ' m2'} · ${x(dm.nam || '')}${dm.createdAt > 1e12 ? ' · lưu ' + new Date(dm.createdAt).toLocaleDateString('vi-VN') : ''}</div>
          ${co ? `<div class="text-secondary" style="font-size:10.5px">${tru}</div>`
            : '<div class="text-warning-emphasis" style="font-size:10.5px">⚠ Lưu trước khi có Rổ 1 — bấm ✎ để cập nhật</div>'}</td>
        <td class="text-end font-monospace" style="white-space:nowrap"><div class="fw-semibold">${co || dm.dgRo1 ? fmtM(dm.dgRo1) : '—'}</div>
          ${dm.dgTong ? `<div class="text-secondary" style="font-size:10.5px">toàn bộ ${fmtM(dm.dgTong)}</div>` : ''}</td>
        <td class="text-end" style="white-space:nowrap">
          <button class="btn btn-sm btn-outline-primary py-0 px-1" title="Dùng cho bảng Kiểm soát" onclick="tytDmDung('${dm.id}')">Dùng</button>
          <button class="btn btn-link btn-sm p-0 text-secondary" title="Sửa tên / định mức 4 trụ cột · cập nhật từ CT nguồn" onclick="tytDmSua('${dm.id}')"><span class="material-symbols-outlined" style="font-size:17px">edit</span></button>
          <button class="btn btn-link btn-sm p-0 text-danger" title="Xóa" onclick="tytDmXoa('${dm.id}')"><span class="material-symbols-outlined" style="font-size:17px">delete</span></button>
        </td></tr>`;
    }).join('')
      : '<tr><td colspan="3" class="text-secondary text-center py-3" style="font-size:12px">Chưa có bộ định mức nào. Chọn công trình đã quyết toán rồi bấm "Lưu từ CT này", hoặc "Nhập tay".</td></tr>';
  }

  // Dropdown định mức cho bảng kiểm soát
  if (!list.some(dm => dm.id === _tytDtDm)) _tytDtDm = list.length ? list[0].id : '';
  const sel = document.getElementById('tyt-dt-dm');
  if (sel) {
    sel.innerHTML = list.length ? list.map(dm => `<option value="${dm.id}">${x(dm.ten)}${dm.dgRo1 ? ' — Rổ 1 ' + fmtM(dm.dgRo1) + '/m2' : ''}</option>`).join('')
      : '<option value="">(Chưa có định mức)</option>';
    sel.value = _tytDtDm;
  }
  // Ô diện tích: tự theo tổng sàn CT đang chọn cho tới khi người dùng TỰ GÕ số khác (dataset.user = '1');
  // đổi công trình hoặc bấm "↺ Sàn CT" → quay lại tự theo.
  _tytDtAuto('tyt-dt-dt', p, r);
  _tytDtAuto('tyt-tv-dt', p, r);
  tytRenderKiemSoat();
  tytRenderThuVien();
}

// Ô diện tích tự theo tổng sàn CT đang chọn (trừ khi người dùng đã tự gõ)
function _tytDtAuto(id, p, r) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.dataset.pid !== (p && p.id)) el.dataset.user = '';
  if (el.dataset.user !== '1') el.value = r && r.tongSan > 0 ? Math.round(r.tongSan * 100) / 100 : '';
  el.dataset.pid = p ? p.id : '';
}

function tytDmLuu() {
  const p = _tytProj(), r = _tytLast;
  if (!p || !r) return;
  if (!(r.tongSan > 0)) { toast('Chưa có tổng diện tích sàn — nhập bảng M2 ở tab Thiết lập trước!', 'error'); return; }
  if (!r.tongChi) { toast('Công trình chưa có chi phí!', 'error'); return; }
  const canhBao = [];
  if (p.status !== 'closed') canhBao.push('• Công trình CHƯA quyết toán');
  if (!r.allYears && tytNhanNam() !== 'Tất cả năm') canhBao.push(`• Đang lọc năm ${tytNhanNam()} (chưa phải trọn vòng đời)`);
  if (r.theoRo[0] > 0) canhBao.push(`• Còn ${fmtM(r.theoRo[0])} chưa xếp rổ`);
  if (canhBao.length && !confirm('Lưu định mức dù:\n' + canhBao.join('\n') + '\n\nVẫn lưu?')) return;
  const ten = document.getElementById('tyt-dm-ten')?.value || '';
  const rec = tytTaoDinhMuc(p, r, ten);
  _tytDtDm = rec.id;
  toast(`✅ Đã lưu định mức "${rec.ten}" — Rổ 1 ${fmtM(rec.dgRo1)}/m2`, 'success');
  _tytRenderDm(r);
  tytRenderNhom();   // ô "Chuẩn" của khung đối chiếu nhóm có ngay định mức mới
}
function tytDmDung(id) {
  _tytDtDm = id;
  if (_tytLast) _tytRenderDm(_tytLast);
}

// Popup SỬA định mức (id = '' → TẠO định mức nhập tay): tên + đ/m2 của 4 trụ cột Rổ 1.
// Định mức có CT nguồn → thêm nút "Cập nhật lại từ CT nguồn" (tính lại mọi số liệu, giữ tên).
function tytDmSua(id) {
  const dm = id ? tytDinhMucById(id) : null;
  if (id && !dm) return;
  const ro1 = (dm && dm.ro1) || {};
  const o = TYT_TRU_DS.map(t => `<div class="col-6">
      <label class="form-label mb-0" style="font-size:12px">${TYT_TRU[t].ten} <span class="text-secondary">(đ/m2)</span></label>
      <input type="number" min="0" step="1000" class="form-control form-control-sm text-end font-monospace" id="tyt-dms-${t}" value="${+ro1[t] || ''}" placeholder="0">
      <div class="text-secondary" style="font-size:10.5px">${x(TYT_TRU[t].mo)}</div></div>`).join('');
  const p = dm && dm.nguonPid ? _tytAllProjs().find(z => z.id === dm.nguonPid) : null;
  document.getElementById('modal-title').innerHTML = `<span class="material-symbols-outlined msi-gap">${dm ? 'edit' : 'edit_note'}</span>${dm ? 'Sửa Bộ Định Mức' : 'Nhập Tay Định Mức An Toàn'}`;
  document.getElementById('modal-body').innerHTML = `
    <div class="mb-2"><label class="form-label mb-0" style="font-size:12px">Tên bộ định mức</label>
      <input type="text" class="form-control form-control-sm" id="tyt-dms-ten" value="${x(dm ? dm.ten : 'Định mức an toàn')}"></div>
    <div class="row g-2 mb-2">${o}</div>
    <div class="text-secondary mb-2" style="font-size:11.5px">Quỹ phụ phí dùng <b>mức chung</b> (đang là ${fmtM(tytRoCfg().quyMuc)} đ/m2) — chỉnh ngay dưới bảng Kiểm soát.${dm && !dm.nhapTay ? ' Sửa số ở đây sẽ ghi đè số tính từ CT nguồn (đơn giá giai đoạn / hạng mục giữ nguyên).' : ''}</div>
    <div class="d-flex flex-wrap gap-2 justify-content-end">
      ${dm && dm.nguonPid ? `<button class="btn btn-sm btn-outline-primary me-auto" onclick="tytDmCapNhat('${dm.id}')" ${p ? '' : 'disabled title="Không còn công trình nguồn"'}><span class="material-symbols-outlined msi-gap">sync</span>Cập nhật lại từ ${x(p ? p.name : 'CT nguồn')}</button>` : ''}
      <button class="btn btn-sm btn-secondary" onclick="closeModal()">Hủy</button>
      <button class="btn btn-sm btn-success fw-bold" onclick="tytDmSuaLuu('${dm ? dm.id : ''}')"><span class="material-symbols-outlined msi-gap">save</span>Lưu</button>
    </div>`;
  document.getElementById('ct-modal').classList.add('open');
}
function tytDmSuaLuu(id) {
  const ten = (document.getElementById('tyt-dms-ten')?.value || '').trim();
  if (!ten) { toast('Nhập tên bộ định mức!', 'error'); return; }
  const vals = {};
  TYT_TRU_DS.forEach(t => { vals[t] = Math.max(0, Math.round(tytKlNum(document.getElementById('tyt-dms-' + t)?.value))); });
  if (!TYT_TRU_DS.some(t => vals[t] > 0)) { toast('Nhập định mức đ/m2 cho ít nhất 1 trụ cột!', 'error'); return; }
  if (id) {
    const dm = tytDinhMucById(id);
    if (!dm) return;
    const ro1 = { ...(dm.ro1 || {}), ...vals };
    tytSuaDinhMuc(id, { ten, ro1, dgRo1: dm.nhapTay ? TYT_TRU_DS.reduce((s2, t) => s2 + vals[t], 0) : dm.dgRo1 });
    toast('✅ Đã lưu định mức "' + ten + '"', 'success');
  } else {
    const rec = tytTaoDinhMucTay(ten, vals);
    _tytDtDm = rec.id;
    toast('✅ Đã tạo định mức nhập tay "' + ten + '"', 'success');
  }
  if (typeof closeModal === 'function') closeModal();
  if (_tytLast) _tytRenderDm(_tytLast);
  tytRenderNhom();
}
// Cập nhật lại số liệu định mức từ CT nguồn (trọn vòng đời nếu định mức lưu theo vòng đời)
function tytDmCapNhat(id) {
  const dm = tytDinhMucById(id);
  const p = dm && dm.nguonPid ? _tytAllProjs().find(z => z.id === dm.nguonPid) : null;
  if (!p) { toast('Không tìm thấy công trình nguồn!', 'error'); return; }
  if (!(tytTongSan(p) > 0)) { toast('Công trình nguồn chưa có bảng M2 sàn!', 'error'); return; }
  const allYears = dm.nam === 'Trọn vòng đời' || _tytAllYears;
  if (allYears && _tytEnsureYears(tytNamVongDoi(p))) { toast('⏳ Đang tải dữ liệu các năm của CT nguồn — tải xong bấm lại "Cập nhật"', 'info'); return; }
  const r = tytTongHop(p, { allYears });
  if (!confirm(`Cập nhật "${dm.ten}" theo số liệu hiện tại của ${p.name}?\nRổ 1: ${fmtM(Math.round(r.cpM2Ro1))}/m2 · toàn bộ: ${fmtM(Math.round(r.cpM2))}/m2\n(Số nhập tay của 4 trụ cột sẽ bị thay)`)) return;
  tytCapNhatDinhMuc(id, p, r);
  toast('✅ Đã cập nhật định mức từ ' + p.name, 'success');
  if (typeof closeModal === 'function') closeModal();
  if (_tytLast) _tytRenderDm(_tytLast);
  tytRenderNhom();
}
function tytDmXoa(id) {
  const dm = tytDinhMucById(id);
  if (!dm || !confirm(`Xóa bộ định mức "${dm.ten}"?`)) return;
  tytXoaDinhMuc(id);
  toast('Đã xóa định mức', 'success');
  if (_tytLast) _tytRenderDm(_tytLast);
  tytRenderNhom();
}
function tytDtLaySan() {
  const el = document.getElementById('tyt-dt-dt');
  if (el && _tytLast) { el.value = _tytLast.tongSan > 0 ? Math.round(_tytLast.tongSan * 100) / 100 : ''; el.dataset.user = ''; }
  tytRenderKiemSoat();
}
// Mức Quỹ phụ phí dùng chung (đ/m2)
function tytQuyMucSet(v) {
  const n = Math.max(0, Math.round(tytKlNum(v)));
  tytSaveRoCfg({ quyMuc: n });
  toast(`✅ Mức Quỹ phụ phí = ${fmtM(n)} đ/m2 (dùng chung mọi công trình)`, 'success');
  _tytRecalc();
}
function tytKsToggle(k) {
  if (_tytKsOpen.has(k)) _tytKsOpen.delete(k); else _tytKsOpen.add(k);
  tytRenderKiemSoat();
}

// Bảng KIỂM SOÁT RỔ 1 của CT đang chọn
function tytRenderKiemSoat() {
  const tb = document.getElementById('tyt-dt-tbody');
  const kpi = document.getElementById('tyt-dt-kpi');
  const badge = document.getElementById('tyt-sub-dm-badge');
  const r = _tytLast;
  if (!tb || !r) return;
  const quyEl = document.getElementById('tyt-quy-muc');
  if (quyEl && document.activeElement !== quyEl) quyEl.value = r.cfg.quyMuc;
  const sel = document.getElementById('tyt-dt-dm');
  if (sel && sel.value) _tytDtDm = sel.value;
  const dm = tytDinhMucById(_tytDtDm);
  const dt = tytKlNum(document.getElementById('tyt-dt-dt')?.value);
  const setBadge = n => { if (badge) { badge.textContent = n ? n + ' vượt' : ''; badge.className = 'badge rounded-pill ms-1' + (n ? ' text-bg-danger' : ''); } };
  const trong = msg => { tb.innerHTML = `<tr><td colspan="7" class="text-secondary text-center py-3" style="font-size:12px">${msg}</td></tr>`; if (kpi) kpi.innerHTML = ''; setBadge(0); };
  if (!dm) return trong('Chưa có bộ định mức — "Lưu từ CT này" (công trình đã quyết toán) hoặc "Nhập tay" định mức an toàn.');
  if (!(dt > 0)) return trong('Nhập diện tích để tính ngân sách.');
  if (!tytDmCoRo1(dm)) return trong(`Bộ định mức "${x(dm.ten)}" lưu trước khi có Rổ 1 → chưa có số 4 trụ cột.<br>
    <button class="btn btn-sm btn-outline-primary mt-2" onclick="tytDmSua('${dm.id}')"><span class="material-symbols-outlined msi-gap">edit</span>Cập nhật / nhập số trụ cột</button>`);

  const ks = tytKiemSoat(dm, dt, r);
  const pctCell = (pct, vuot) => {
    if (pct === Infinity) return '<td class="text-end text-danger fw-bold">ngoài ĐM</td>';
    return `<td class="text-end font-monospace ${vuot ? 'tyt-dt-vuot' : ''}" style="white-space:nowrap"><div>${pct.toFixed(1).replace('.', ',')}%</div>
      <div class="tyt-bar"><span style="width:${Math.min(100, pct).toFixed(1)}%"></span></div></td>`;
  };
  // Chỉ báo đỏ khi VƯỢT; còn trong ngân sách → chữ thường (không xanh / vàng — quản trị ngoại lệ)
  const conLai = (v, vuot) => Math.abs(v) < 1000 ? '<td class="text-end font-monospace text-secondary">≈ 0</td>'
    : `<td class="text-end font-monospace ${vuot ? 'text-danger fw-bold' : ''}" style="white-space:nowrap">${vuot ? 'Vượt ' + fmtM(-v) : fmtM(v)}</td>`;
  const m2 = v => r.tongSan > 0 ? fmtM(Math.round(v / r.tongSan)) : '—';
  let html = '';
  ks.rows.forEach(o => {
    const kk = o.k || 'x';
    const open = _tytKsOpen.has(kk);
    const tg = o.loais.length
      ? `<button type="button" class="tyt-cay-tg" onclick="tytKsToggle('${kk}')" title="${open ? 'Thu gọn' : 'Xem loại chi phí'}"><span class="material-symbols-outlined">${open ? 'remove' : 'add'}</span></button>`
      : '<span class="tyt-cay-tg-sp"></span>';
    html += `<tr class="${o.vuot ? 'tyt-ks-vuot' : ''}">
      <td><div class="tyt-cay-name">${tg}<span><span class="tyt-tru tyt-tru-${kk}"></span><b>${x(o.ten)}</b>${o.k === 'quy' ? ' <span class="tyt-cay-note">mức chung</span>' : ''}
        ${o.vuot ? ' <span class="badge text-bg-danger" style="font-size:9.5px">VƯỢT</span>' : ''}</span></div></td>
      <td class="text-end font-monospace" style="white-space:nowrap">${o.dg ? fmtM(o.dg) : '<span class="text-secondary">—</span>'}</td>
      <td class="text-end font-monospace" style="white-space:nowrap">${fmtM(o.ns)}</td>
      <td class="text-end font-monospace" style="white-space:nowrap">${fmtM(o.tt)}</td>
      <td class="text-end font-monospace" style="white-space:nowrap">${m2(o.tt)}</td>
      ${conLai(o.conLai, o.vuot)}${pctCell(o.pct, o.vuot)}
    </tr>`;
    if (open) o.loais.forEach(z => { html += `<tr class="tyt-cay-line">
      <td><div class="tyt-cay-name" style="padding-left:40px"><span>${x(z.loai)}</span></div></td><td></td><td></td>
      <td class="text-end font-monospace" style="white-space:nowrap">${fmtM(z.tien)}</td>
      <td class="text-end font-monospace" style="white-space:nowrap">${m2(z.tien)}</td><td></td>
      <td class="text-end font-monospace text-secondary">${_tytPctTxt(z.tien, o.tt)}</td></tr>`; });
  });
  tb.innerHTML = html + `<tr class="tyt-rpt-total" style="white-space:nowrap">
      <td>TỔNG RỔ 1</td><td class="text-end font-monospace">${fmtM(ks.tong.dg)}</td>
      <td class="text-end font-monospace">${fmtM(ks.tong.ns)}</td><td class="text-end font-monospace">${fmtM(ks.tong.tt)}</td>
      <td class="text-end font-monospace">${m2(ks.tong.tt)}</td>
      ${conLai(ks.tong.conLai, ks.tong.vuot)}${pctCell(ks.tong.pct, ks.tong.vuot)}</tr>`;
  if (kpi) {
    const cell = (lb, val, cls, sub) => `<div class="col-4"><div class="qt-sum-cell h-100"><div class="qt-sum-lb">${lb}</div>
      <div class="qt-sum-val ${cls}">${val}</div><div class="qt-sum-sub">${sub || ''}</div></div></div>`;
    kpi.innerHTML = cell('Ngân sách Rổ 1', fmtM(ks.tong.ns), 'text-primary', `${tytFmtM2(dt)} m2 × ${fmtM(ks.tong.dg)}`) +
      cell('Thực tế Rổ 1', fmtM(ks.tong.tt), '', r.tongSan > 0 ? m2(ks.tong.tt) + '/m2' : '') +
      cell(ks.tong.vuot ? 'Đã vượt' : 'Còn lại', fmtM(Math.abs(ks.tong.conLai)), ks.tong.vuot ? 'text-danger' : '',
        ks.soVuot ? `<span class="text-danger fw-semibold">${ks.soVuot} dòng vượt định mức</span>` : 'Chưa dòng nào vượt');
  }
  setBadge(ks.soVuot);
}

// ── THƯ VIỆN ĐƠN GIÁ MODULE ──
let _tytTvDm = '';               // id định mức đang xem ở thư viện
const _tytTvBo = new Set();      // khóa module BỎ tick (mặc định tick hết)
let _tytTvMods = [];             // module vừa vẽ (onclick dùng chỉ số)

function tytTvChonDm(id) { _tytTvDm = id; _tytTvBo.clear(); tytRenderThuVien(); }
function tytTvTick(i, on) {
  const m = _tytTvMods[i];
  if (!m) return;
  // Tick dòng giai đoạn → tick / bỏ cả các module của giai đoạn đó
  const ks = m.cap === 'gd' ? _tytTvMods.filter(z => z.gd === m.gd && z.cap !== 'gd').map(z => z.key) : [m.key];
  ks.forEach(k => { if (on) _tytTvBo.delete(k); else _tytTvBo.add(k); });
  tytRenderThuVien();
}

function tytRenderThuVien() {
  const box = document.getElementById('tyt-tv-body');
  const sel = document.getElementById('tyt-tv-dm');
  if (!box || !sel) return;
  // Định mức nhập tay không có giai đoạn / hạng mục → không có module
  const list = tytDinhMucList().filter(dm => Object.keys(dm.dgGd || {}).length);
  if (!list.some(dm => dm.id === _tytTvDm)) { _tytTvDm = list.length ? list[0].id : ''; _tytTvBo.clear(); }
  sel.innerHTML = list.length ? list.map(dm => `<option value="${dm.id}">${x(dm.ten)}</option>`).join('') : '<option value="">(Chưa có định mức lưu từ CT)</option>';
  sel.value = _tytTvDm;
  const dm = tytDinhMucById(_tytTvDm);
  const pv = document.getElementById('tyt-tv-pv')?.value || 'all';
  const dt = tytKlNum(document.getElementById('tyt-tv-dt')?.value);
  const ln = Math.max(0, tytKlNum(document.getElementById('tyt-tv-ln')?.value));
  if (!dm) { box.innerHTML = '<div class="text-secondary text-center py-3" style="font-size:12px">Chưa có bộ định mức lưu từ công trình (có giai đoạn / hạng mục).</div>'; _tytTvMods = []; return; }
  const mods = tytModules(dm, pv);
  _tytTvMods = mods;
  if (!mods.length) {
    box.innerHTML = `<div class="text-secondary text-center py-3" style="font-size:12px">${pv === 'r1' && !dm.dgGdR1
      ? `Bộ định mức này lưu trước khi có Rổ 1 → chưa có đơn giá Rổ 1 theo giai đoạn. <a href="#" onclick="tytDmSua('${dm.id}');return false">Cập nhật lại từ CT nguồn</a>.`
      : 'Bộ định mức này chưa có đơn giá theo giai đoạn / hạng mục.'}</div>`;
    return;
  }
  const chon = m => !_tytTvBo.has(m.key);
  const items = mods.filter(m => m.cap !== 'gd');
  const tongDg = items.filter(chon).reduce((s2, m) => s2 + m.dg, 0);
  const tien = v => dt > 0 ? fmtM(Math.round(v * dt)) : '—';
  const rows = mods.map((m, i) => {
    if (m.cap === 'gd') {
      const con = items.filter(z => z.gd === m.gd);
      const nChon = con.filter(chon).length;
      const dgChon = con.filter(chon).reduce((s2, z) => s2 + z.dg, 0);
      return `<tr class="tyt-cay-gd"><td style="width:30px"><input type="checkbox" class="form-check-input" ${nChon === con.length ? 'checked' : ''} ${nChon && nChon < con.length ? 'data-mot-phan="1"' : ''} onchange="tytTvTick(${i}, this.checked)"></td>
        <td><b>${x(m.ten.toUpperCase())}</b></td><td class="text-end font-monospace">${fmtM(dgChon)}</td><td class="text-end font-monospace">${tien(dgChon)}</td></tr>`;
    }
    return `<tr class="${chon(m) ? '' : 'tyt-rpt-zero'}${m.cap === 'chua' ? ' tyt-cay-chua' : ''}"><td><input type="checkbox" class="form-check-input" ${chon(m) ? 'checked' : ''} onchange="tytTvTick(${i}, this.checked)"></td>
      <td style="${m.cap === 'chua' ? '' : 'padding-left:22px'}">${m.cap === 'chua' ? '' : '<span class="text-secondary">└</span> '}${m.cap === 'chung' ? '<i>' + x(m.ten) + '</i>' : x(m.ten)}</td>
      <td class="text-end font-monospace">${fmtM(m.dg)}</td><td class="text-end font-monospace">${tien(m.dg)}</td></tr>`;
  }).join('');
  const giaVon = dt > 0 ? Math.round(tongDg * dt) : 0;
  const giaBao = Math.round(giaVon * (1 + ln / 100));
  box.innerHTML = `<div style="overflow-x:auto">
      <table class="table table-sm table-hover align-middle mb-0 tyt-rpt" style="font-size:12px;min-width:520px">
        <thead class="table-light"><tr><th></th><th>Module (giai đoạn / hạng mục)</th><th class="text-end">đ / m2</th><th class="text-end">Thành tiền ${dt > 0 ? '(' + tytFmtM2(dt) + ' m2)' : ''}</th></tr></thead>
        <tbody>${rows}
          <tr class="tyt-rpt-total"><td></td><td>GIÁ VỐN — ${items.filter(chon).length}/${items.length} module</td><td class="text-end font-monospace">${fmtM(tongDg)}</td><td class="text-end font-monospace">${dt > 0 ? fmtM(giaVon) : '—'}</td></tr>
          <tr class="tyt-rpt-total tyt-ro1-total"><td></td><td>GIÁ BÁO (+ ${String(ln).replace('.', ',')}% lợi nhuận)</td><td class="text-end font-monospace">${fmtM(Math.round(tongDg * (1 + ln / 100)))}</td><td class="text-end font-monospace" id="tyt-tv-giabao">${dt > 0 ? fmtM(giaBao) : '—'}</td></tr>
        </tbody>
      </table></div>
    <div class="text-secondary mt-1" style="font-size:11px">Nguồn: ${x(dm.nguonTen || dm.ten)} · ${pv === 'r1' ? 'chỉ Rổ 1' : 'toàn bộ chi phí'} · đơn giá = tiền giai đoạn / hạng mục ÷ tổng sàn CT nguồn (${tytFmtM2(dm.tongSan)} m2).</div>`;
  // Ô tick giai đoạn chọn 1 phần → trạng thái "nửa" (indeterminate)
  box.querySelectorAll('input[data-mot-phan]').forEach(cb => { cb.indeterminate = true; });
}

// ══ SO SÁNH CÔNG TRÌNH (tab con 5 — Lần 2) ═══════════════════════════
const _tytSsSel = new Set();   // projectId đang tick để so sánh
let _tytSsInit  = false;       // đã chọn sẵn mặc định chưa
let _tytSsLast  = null;        // dữ liệu bảng vừa vẽ (cho Xuất Excel)

function tytSsToggle(pid, on) {
  if (on) _tytSsSel.add(pid); else _tytSsSel.delete(pid);
  tytRenderSoSanh();
}

function tytRenderSoSanh() {
  const listEl = document.getElementById('tyt-ss-list');
  const tbl = document.getElementById('tyt-ss-table');
  if (!listEl || !tbl) return;
  // (Lần 3) Vòng đời → mọi công trình; theo năm → CT thuộc năm đang lọc.
  // Công tắc #tyt-ss-chict (mặc định BẬT): chỉ công trình XÂY MỚI (mã CT), ẩn sửa chữa / cải tạo (SC, SN, Khác)
  const chiCT = document.getElementById('tyt-ss-chict')?.checked !== false;
  const list = (_tytAllYears ? _tytAllProjs() : ((typeof _qtProjList === 'function') ? _qtProjList(_tytPid) : []))
    .filter(p => !chiCT || (typeof ctLoaiOf === 'function' ? ctLoaiOf(p) : 'CT') === 'CT')
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
  if (!_tytSsInit) {   // mặc định: công trình đang chọn + mọi CT đã nhập bảng M2
    list.forEach(p => { if (p.id === _tytPid || tytTongSan(p) > 0) _tytSsSel.add(p.id); });
    _tytSsInit = true;
  }
  listEl.innerHTML = list.map(p => {
    const san = tytTongSan(p);
    return `<label class="tyt-ss-chip ${_tytSsSel.has(p.id) ? 'on' : ''}" title="${x(p.name)}">
      <input type="checkbox" class="form-check-input me-1" ${_tytSsSel.has(p.id) ? 'checked' : ''} onchange="tytSsToggle('${p.id}', this.checked)">
      ${x(p.name)} <span class="text-secondary">${san > 0 ? tytFmtM2(san) + ' m2' : '(chưa có M2)'}</span></label>`;
  }).join('') || '<span class="text-secondary">Không có công trình trong năm đang lọc.</span>';

  const projs = list.filter(p => _tytSsSel.has(p.id));
  if (_tytAllYears) _tytEnsureYears([...new Set(projs.flatMap(p => tytNamVongDoi(p)))]);
  if (!projs.length) { tbl.innerHTML = '<tbody><tr><td class="text-secondary text-center py-3">Tick ít nhất 1 công trình để so sánh.</td></tr></tbody>'; _tytSsLast = null; return; }
  const che = document.querySelector('input[name="tyt-ss-che"]:checked')?.value || 'm2';
  // (Phần C) Chỉ Rổ 1 (mặc định): chỉ đặt GÓI CHUẨN lên bàn cân, tách theo 4 trụ cột → loại chi phí.
  //   % tỉ trọng khi đó = so với tổng Rổ 1. Tắt → như cũ (toàn bộ chi phí theo loại).
  const r1 = document.getElementById('tyt-ss-r1')?.checked !== false;
  const { cots, loais } = tytSoSanh(projs, _tytOpts());
  const tongCT = c => r1 ? c.r.theoRo[1] : c.r.tongChi;
  const conv = (c, t) => {
    if (che === 'tien') return t;
    if (che === 'pct') return tongCT(c) ? t / tongCT(c) * 100 : null;
    return c.r.tongSan > 0 ? t / c.r.tongSan : null;
  };
  const val = (c, loai) => conv(c, (c.r.theoLoai.find(o => o.loai === loai) || {}).tien || 0);
  const fmt = v => v === null || v === undefined ? '—' : (che === 'pct' ? v.toFixed(1).replace('.', ',') + '%' : fmtM(Math.round(v)));
  // Hàng: [nhãn, giá trị từng CT, định dạng, có tô min/max không, class]
  const hang = [
    ['Tổng diện tích sàn (m2)', cots.map(c => c.r.tongSan > 0 ? c.r.tongSan : null), v => v === null ? '—' : tytFmtM2(v), false, 'tyt-ss-info'],
    [r1 ? 'Tổng chi phí Rổ 1' : 'Tổng chi phí', cots.map(c => tongCT(c)), v => fmtM(v), false, 'tyt-ss-info'],
    [r1 ? 'RỔ 1 / M2 SÀN' : 'CHI PHÍ / M2 SÀN', cots.map(c => c.r.tongSan > 0 ? (r1 ? c.r.cpM2Ro1 : c.r.cpM2) : null), v => v === null ? '—' : fmtM(Math.round(v)), true, 'tyt-ss-key'],
  ];
  if (r1) {
    // Tiền Rổ 1 của từng CT theo "trụ cột|loại"
    cots.forEach(c => {
      c.r1l = {};
      c.r.lines.forEach(l => l.parts.forEach(pt => { if (pt.ro === 1) { const k = pt.tru + '|' + l.loai; c.r1l[k] = (c.r1l[k] || 0) + pt.tien; } }));
    });
    TYT_TRU_THU_TU.forEach(t => {
      if (!cots.some(c => c.r.theoTru[t] > 0)) return;
      hang.push([TYT_TRU[t].ten.toUpperCase(), cots.map(c => conv(c, c.r.theoTru[t] || 0)), fmt, true, 'tyt-ss-tru']);
      const tong = new Map();
      cots.forEach(c => Object.keys(c.r1l).forEach(k => { if (k.startsWith(t + '|')) tong.set(k, (tong.get(k) || 0) + c.r1l[k]); }));
      [...tong.keys()].sort((a, b) => tong.get(b) - tong.get(a)).forEach(k =>
        hang.push(['└ ' + k.slice(t.length + 1), cots.map(c => conv(c, c.r1l[k] || 0)), fmt, true, 'tyt-ss-sub']));
    });
  } else {
    loais.forEach(l => hang.push([l, cots.map(c => val(c, l)), fmt, true, '']));
  }
  const tdVals = (vals, f, hl) => {
    const nums = vals.filter(v => v !== null && v !== undefined && v > 0);
    const mx = nums.length >= 2 ? Math.max(...nums) : null, mn = nums.length >= 2 ? Math.min(...nums) : null;
    const tb = nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null;
    return vals.map(v => {
      const cls = hl && mx !== mn && v === mx ? 'tyt-ss-max' : (hl && mx !== mn && v === mn ? 'tyt-ss-min' : '');
      // CT không có loại chi phí này → "—" (không tính vào cao/thấp nhất & trung bình)
      if (v === 0) return '<td class="text-end text-secondary" title="Công trình không có loại chi phí này">—</td>';
      return `<td class="text-end font-monospace ${cls}" style="white-space:nowrap">${f(v)}</td>`;
    }).join('') + `<td class="text-end font-monospace tyt-ss-avg" style="white-space:nowrap">${tb === null ? '—' : f(tb)}</td>`;
  };
  tbl.innerHTML = `<thead class="table-light"><tr>
      <th style="min-width:160px">Chỉ tiêu ${che === 'm2' ? '(đ / m2 sàn)' : che === 'pct' ? (r1 ? '(% tổng Rổ 1)' : '(% tổng chi)') : '(tổng tiền)'}${r1 ? ' · <span class="tyt-ro tyt-ro-1 tyt-ro-sm">Rổ 1</span>' : ''}</th>
      ${cots.map(c => `<th class="text-end tyt-ss-th" title="${x(c.p.name)}">${x(c.p.name)}<div class="fw-normal text-secondary" style="font-size:10.5px">năm ${tytNamCT(c.p)}${c.p.status === 'closed' || c.p.status === 'completed' ? '' : ' · đang làm'}</div></th>`).join('')}
      <th class="text-end">Trung bình</th></tr></thead>
    <tbody>${hang.map(([lb, vals, f, hl, cls]) => `<tr class="${cls}"><td>${x(lb)}</td>${tdVals(vals, f, hl)}</tr>`).join('')}</tbody>`;
  _tytSsLast = { che, r1, ten: cots.map(c => c.p.name), hang };
}

// Xuất bảng so sánh ra Excel (SheetJS — đã nạp ở index.html cho tab Nhập/Xuất)
function tytSsExcel() {
  if (!_tytSsLast) { toast('Chưa có dữ liệu so sánh', 'error'); return; }
  if (typeof XLSX === 'undefined') { toast('Chưa tải được thư viện Excel — kiểm tra mạng', 'error'); return; }
  const d = _tytSsLast;
  const donVi = d.che === 'm2' ? 'đ/m2 sàn' : d.che === 'pct' ? '% tổng chi' : 'đồng';
  const aoa = [[`So sánh tỉ trọng chi phí ${d.r1 ? 'RỔ 1 ' : ''}(${donVi}) — ${_tytAllYears ? 'trọn vòng đời công trình' : 'năm ' + tytNhanNam()}`], [], ['Chỉ tiêu', ...d.ten, 'Trung bình']];
  d.hang.forEach(([lb, vals]) => {
    const nums = vals.filter(v => v !== null && v !== undefined && v > 0);
    const tb = nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null;
    const r2 = v => v === null || v === undefined ? '' : Math.round(v * 100) / 100;
    aoa.push([lb, ...vals.map(r2), r2(tb)]);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 28 }, ...d.ten.map(() => ({ wch: 18 })), { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'SoSanh');
  XLSX.writeFile(wb, `so-sanh-ti-trong_${today()}.xlsx`);
}

// ══ XU HƯỚNG & BIẾN ĐỘNG (tab con 5 — 07/10/2026 — Cải tiến Phần C) ═══════════════════
function _tytRenderTabSs() { tytRenderSoSanh(); tytRenderXuHuong(); tytRenderGiaVt(); }

const _TYT_MAU = ['#fd7e14', '#0d6efd', '#198754', '#6f42c1', '#d63384', '#20c997', '#dc3545', '#495057', '#0dcaf0', '#b58900'];
// Số gọn cho trục biểu đồ: 4,87 tr · 565k
function _tytGon(v) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2).replace('.', ',') + ' tr';
  if (Math.abs(v) >= 1e3) return Math.round(v / 1e3) + 'k';
  return String(Math.round(v));
}

// BIỂU ĐỒ ĐƯỜNG SVG (tự vẽ — app không nạp thư viện biểu đồ).
// o: { labels: [nhãn trục X], dbLabel: nhãn điểm dự báo ('' = không), baseline: số (vẽ đường gạch, VD 100%),
//      series: [{ ten, mau, vals: [số | null theo labels], db: số dự báo | null }], fmtY: v => chuỗi, fmtTip }
// Điểm dự báo: nối NÉT ĐỨT từ điểm cuối tới cột dự báo, chấm rỗng.
function _tytLineSvg(o) {
  const W = 760, H = o.h || 240, L = 62, R = 18, T = 14, B = 30;
  const labs = o.dbLabel ? [...o.labels, o.dbLabel] : o.labels.slice();
  const nX = labs.length;
  const all = [];
  o.series.forEach(sr => { sr.vals.forEach(v => { if (v !== null && v !== undefined && isFinite(v)) all.push(v); }); if (sr.db !== null && sr.db !== undefined && isFinite(sr.db)) all.push(sr.db); });
  if (o.baseline !== undefined) all.push(o.baseline);
  if (!all.length || !nX) return '';
  let mn = Math.min(...all), mx = Math.max(...all);
  if (mn === mx) { mn = mn * 0.9; mx = mx * 1.1 || 1; }
  const pad = (mx - mn) * 0.1; mn = Math.max(0, mn - pad); mx += pad;
  const X = i => nX === 1 ? L + (W - L - R) / 2 : L + i * (W - L - R) / (nX - 1);
  const Y = v => T + (H - T - B) * (1 - (v - mn) / (mx - mn));
  const fy = o.fmtY || _tytGon, ft = o.fmtTip || fy;
  let g = '';
  for (let k = 0; k <= 4; k++) {
    const v = mn + (mx - mn) * k / 4, y = Y(v).toFixed(1);
    g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="tyt-ch-grid"/><text x="${L - 6}" y="${(+y + 4).toFixed(1)}" text-anchor="end" class="tyt-ch-txt">${fy(v)}</text>`;
  }
  const step = Math.max(1, Math.ceil(nX / 12));
  labs.forEach((lb, i) => {
    if (i % step && i !== nX - 1) return;
    const db = o.dbLabel && i === nX - 1;
    g += `<text x="${X(i).toFixed(1)}" y="${H - 9}" text-anchor="${db && nX > 1 ? 'end' : 'middle'}" class="tyt-ch-txt${db ? ' tyt-ch-db' : ''}">${x(lb)}</text>`;
  });
  // Vùng dự báo: tô nền + chữ "dự báo" ở trên (không chen vào nhãn trục)
  if (o.dbLabel && nX > 1) {
    const x0 = (X(nX - 2) + X(nX - 1)) / 2;
    g += `<rect x="${x0.toFixed(1)}" y="${T}" width="${(W - x0).toFixed(1)}" height="${H - T - B}" class="tyt-ch-dbzone"/>
      <text x="${(W - 4).toFixed(1)}" y="${T + 11}" text-anchor="end" class="tyt-ch-txt tyt-ch-db">dự báo</text>`;
  }
  if (o.baseline !== undefined) g += `<line x1="${L}" x2="${W - R}" y1="${Y(o.baseline).toFixed(1)}" y2="${Y(o.baseline).toFixed(1)}" class="tyt-ch-base"/>`;
  o.series.forEach(sr => {
    const pts = [];
    sr.vals.forEach((v, i) => { if (v !== null && v !== undefined && isFinite(v)) pts.push([i, v]); });
    if (!pts.length) return;
    g += `<path d="${pts.map(([i, v], j) => (j ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ')}" fill="none" stroke="${sr.mau}" stroke-width="2.2" stroke-linejoin="round"/>`;
    pts.forEach(([i, v]) => { g += `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3.6" fill="${sr.mau}"><title>${x(sr.ten)} · ${x(labs[i])}: ${x(ft(v))}</title></circle>`; });
    const [li, lv] = pts[pts.length - 1];
    if (o.dbLabel && sr.db !== null && sr.db !== undefined && isFinite(sr.db) && li === o.labels.length - 1) {
      g += `<line x1="${X(li).toFixed(1)}" y1="${Y(lv).toFixed(1)}" x2="${X(nX - 1).toFixed(1)}" y2="${Y(sr.db).toFixed(1)}" stroke="${sr.mau}" stroke-width="2" stroke-dasharray="5 4"/>
        <circle cx="${X(nX - 1).toFixed(1)}" cy="${Y(sr.db).toFixed(1)}" r="4" fill="var(--bs-body-bg)" stroke="${sr.mau}" stroke-width="2"><title>${x(sr.ten)} · dự báo ${x(o.dbLabel)} (ước tính): ${x(ft(sr.db))}</title></circle>`;
    }
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="tyt-chart" role="img">${g}</svg>`;
}
// Chú thích bấm được để ẩn / hiện đường
function _tytLegend(items, fn) {
  return `<div class="d-flex flex-wrap gap-2 mt-1 mb-2">${items.map(it => `<span class="tyt-lg${it.an ? ' off' : ''}" onclick="${fn}('${it.k}')" title="Bấm để ${it.an ? 'hiện' : 'ẩn'}"><i style="background:${it.mau}"></i>${x(it.ten)}</span>`).join('')}</div>`;
}
// Đường nhỏ trong ô bảng (sparkline)
function _tytSpark(vals, mau) {
  const v = vals.filter(z => z !== null && z !== undefined);
  if (v.length < 2) return '';
  const mn = Math.min(...v), mx = Math.max(...v), W = 90, H = 22;
  const pts = [];
  vals.forEach((z, i) => { if (z !== null && z !== undefined) pts.push(`${(i * (W - 4) / (vals.length - 1) + 2).toFixed(1)},${(H - 3 - (mx === mn ? 0.5 : (z - mn) / (mx - mn)) * (H - 6)).toFixed(1)}`); });
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><polyline points="${pts.join(' ')}" fill="none" stroke="${mau || '#0d6efd'}" stroke-width="1.6"/></svg>`;
}
function _tytPctDoi(p) {
  if (p === null || p === undefined || !isFinite(p)) return '—';
  const t = (p > 0 ? '+' : '') + p.toFixed(1).replace('.', ',') + '%';
  return Math.abs(p) < 0.05 ? '<span class="text-secondary">0%</span>' : `<span class="${p > 0 ? 'text-danger' : 'text-success'} fw-semibold">${t}</span>`;
}
// Mọi năm có dữ liệu của mọi công trình (để tải đủ trước khi vẽ xu hướng / giá)
function _tytNamMoiCT(projs) { return [...new Set((projs || _tytAllProjs()).flatMap(p => tytNamVongDoi(p)))]; }

// ── XU HƯỚNG đ/m2 RỔ 1 THEO NĂM ──
const _TYT_XH_SR = [
  { k: 'sat', ten: 'Sắt thép', mau: '#495057' }, { k: 'bt', ten: 'Bê tông', mau: '#0d6efd' }, { k: 'nc', ten: 'Nhân công', mau: '#fd7e14' },
  { k: 'tp', ten: 'Thầu phụ phụ trợ', mau: '#6f42c1' }, { k: 'quy', ten: 'Quỹ phụ phí', mau: '#20c997' }, { k: 'ro1', ten: 'Tổng Rổ 1', mau: '#198754' },
];
const _tytXhAn = new Set(['tp', 'quy', 'ro1']);   // mặc định chỉ hiện Sắt · Bê tông · Nhân công (đúng file thiết kế)
function tytXhSeries(k) { if (_tytXhAn.has(k)) _tytXhAn.delete(k); else _tytXhAn.add(k); tytRenderXuHuong(); }

function tytRenderXuHuong() {
  const chart = document.getElementById('tyt-xh-chart'), body = document.getElementById('tyt-xh-body');
  if (!chart || !body) return;
  const chiXong = !!document.getElementById('tyt-xh-xong')?.checked;
  const laCT = p => (typeof ctLoaiOf === 'function' ? ctLoaiOf(p) : 'CT') === 'CT';
  const projs = _tytAllProjs().filter(laCT);
  const coM2 = projs.filter(p => tytTongSan(p) > 0);
  if (_tytAllYears) _tytEnsureYears(_tytNamMoiCT(coM2));
  const xong = p => p.status === 'closed' || p.status === 'completed';
  const xh = tytXuHuongM2(coM2.filter(p => !chiXong || xong(p)), _tytOpts());
  // CT xây mới chưa có bảng M2 → chưa lên được biểu đồ (gợi ý nhập để có thêm điểm)
  const thieu = projs.filter(p => !(tytTongSan(p) > 0)).sort((a, b) => tytNamCT(a).localeCompare(tytNamCT(b)));
  const thieuHtml = thieu.length ? `<div class="tyt-uutien mt-2" style="font-size:11.5px"><b>${thieu.length} công trình xây mới chưa có bảng M2</b> nên chưa lên biểu đồ — nhập M2 (tab Thiết lập) để có thêm điểm các năm: ${
    thieu.map(p => `<a href="#" onclick="tytXhMoCT('${p.id}');return false">${x(p.name)}</a> <span class="text-secondary">(${tytNamCT(p)})</span>`).join(' · ')}</div>` : '';
  if (!xh.nams.length) {
    chart.innerHTML = '';
    body.innerHTML = `<div class="text-secondary text-center py-3" style="font-size:12px">Chưa có công trình${chiXong ? ' đã xong' : ''} nào có bảng M2.</div>` + thieuHtml;
    return;
  }
  const labels = xh.nams.map(n => n.nam);
  const namSau = String(+labels[labels.length - 1] + 1);
  const hq = {};
  _TYT_XH_SR.forEach(sr => { hq[sr.k] = tytHoiQuy(xh.nams.map(n => ({ x: +n.nam, y: n.m2[sr.k] }))); });
  const coDb = Object.values(hq).some(Boolean);
  const series = _TYT_XH_SR.filter(sr => !_tytXhAn.has(sr.k)).map(sr => ({
    ten: sr.ten, mau: sr.mau, vals: xh.nams.map(n => n.m2[sr.k] || null), db: hq[sr.k] ? hq[sr.k].du(+namSau) : null,
  }));
  chart.innerHTML = _tytLegend(_TYT_XH_SR.map(sr => ({ ...sr, an: _tytXhAn.has(sr.k) })), 'tytXhSeries') +
    (series.length ? _tytLineSvg({ labels, dbLabel: coDb ? namSau : '', series, fmtTip: v => fmtM(Math.round(v)) + '/m2' }) : '');
  const cot = ['ro1', 'sat', 'bt', 'nc', 'tp', 'quy'];
  const ten = { ro1: 'Rổ 1', sat: 'Sắt thép', bt: 'Bê tông', nc: 'Nhân công', tp: 'TP phụ trợ', quy: 'Quỹ PP' };
  const rows = xh.nams.map(n => `<tr>
      <td class="fw-semibold">${n.nam}</td>
      <td class="text-end">${n.soCT}${n.dangLam ? ` <span class="text-secondary" style="font-size:10.5px">(${n.dangLam} đang làm)</span>` : ''}</td>
      <td class="text-end font-monospace">${tytFmtM2(n.san)}</td>
      ${cot.map(k => `<td class="text-end font-monospace${k === 'ro1' ? ' fw-bold' : ''}" style="white-space:nowrap">${fmtM(Math.round(n.m2[k]))}</td>`).join('')}
    </tr>`).join('');
  const dbRow = coDb ? `<tr class="tyt-xh-db">
      <td class="fw-semibold">${namSau} <span class="badge text-bg-warning" style="font-size:9.5px">ước tính</span></td><td></td><td class="text-end text-secondary" style="font-size:10.5px">dự báo</td>
      ${cot.map(k => hq[k] ? `<td class="text-end font-monospace" style="white-space:nowrap">${fmtM(Math.round(hq[k].du(+namSau)))}<div style="font-size:10.5px">${_tytPctDoi(hq[k].pctNam)}/năm</div></td>` : '<td class="text-end text-secondary">—</td>').join('')}
    </tr>` : '';
  const ctHtml = xh.cts.sort((a, b) => a.nam.localeCompare(b.nam)).map(c => `${x(c.p.name)} <span class="text-secondary">(${c.nam}${c.dongXong ? '' : ', đang làm'} · ${fmtM(Math.round(c.ro1 / c.san))}/m2)</span>`).join(' · ');
  body.innerHTML = `<div style="overflow-x:auto"><table class="table table-sm table-hover align-middle mb-0 tyt-rpt" style="font-size:12px;min-width:720px">
      <thead class="table-light"><tr><th>Năm</th><th class="text-end">Số CT</th><th class="text-end">Sàn (m2)</th>${cot.map(k => `<th class="text-end">${ten[k]} /m2</th>`).join('')}</tr></thead>
      <tbody>${rows}${dbRow}</tbody></table></div>
    ${coDb ? '' : `<div class="text-secondary mt-1" style="font-size:11px">Mới có ${xh.nams.length} năm dữ liệu — cần ≥ ${TYT_DB_MIN} năm mới dự báo được năm tới.</div>`}
    <div class="text-secondary mt-1" style="font-size:11px">Công trình đã tính: ${ctHtml}</div>${thieuHtml}`;
}
// Mở 1 công trình (từ danh sách "chưa có bảng M2") ở tab Thiết lập
function tytXhMoCT(pid) {
  if (_tytHasUnsaved() && !confirm('Đang có thay đổi chưa lưu ở công trình hiện tại — bỏ qua và chuyển công trình?')) return;
  _tytPid = pid; _tytResetEdits(); _tytSub = 'tyt-sub-tl';
  tytPopulateSels();
  const sel = document.getElementById('tytf-ct');
  if (sel && ![...sel.options].some(o => o.value === pid)) {
    const p = getProjectById(pid);
    if (p) sel.insertAdjacentHTML('beforeend', `<option value="${pid}">${x(p.name)}</option>`);
  }
  if (sel) sel.value = pid;
  tytRenderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── BIẾN ĐỘNG ĐƠN GIÁ VẬT TƯ & CÔNG NHẬT ──
const _tytGvChon = new Set();   // mặt hàng đang vẽ trên biểu đồ
let _tytGvInit = false;
const TYT_GV_MAX = 25;          // số dòng tối đa của bảng (khi không tìm)
let _tytGvList = [];            // dòng bảng vừa vẽ (onchange dùng chỉ số dòng)
function tytGvTick(i, on) {
  const o = _tytGvList[i];
  if (!o) return;
  if (on) _tytGvChon.add(o.key); else _tytGvChon.delete(o.key);
  tytRenderGiaVt();
}

function tytRenderGiaVt() {
  const chart = document.getElementById('tyt-gv-chart'), body = document.getElementById('tyt-gv-body');
  if (!chart || !body) return;
  const che = document.querySelector('input[name="tyt-gv-che"]:checked')?.value || 'q';
  const tim = _tytBoDau(document.getElementById('tyt-gv-tim')?.value || '');
  if (_tytAllYears) _tytEnsureYears(_tytNamMoiCT());
  const cong = tytGiaCong(che);
  const ds = [{ key: 'CONG', ten: 'Công nhật (lương ngày bình quân)', dv: 'công', loai: 'Nhân công · chấm công',
    soLan: Math.round(Object.values(cong).reduce((s2, o) => s2 + o.cong, 0)), ky: cong, kys: Object.keys(cong).sort() }, ...tytGiaVatTu(che)];
  if (!_tytGvInit) {   // mặc định: công nhật + 4 vật tư mua thường xuyên nhất (≥ 3 kỳ)
    const mac = ds.filter(o => o.kys.length >= 3).slice(0, 5);
    mac.forEach(o => _tytGvChon.add(o.key));
    if (mac.length) _tytGvInit = true;   // dữ liệu chưa tải xong (chưa có gì) → lần vẽ sau chọn lại
  }
  const list = (tim ? ds.filter(o => _tytBoDau(o.ten + ' ' + o.loai + ' ' + o.dv).includes(tim)) : ds.filter(o => o.kys.length >= 2)).slice(0, TYT_GV_MAX);
  // Biểu đồ: % so với kỳ đầu của từng mặt hàng đang chọn, trục kỳ liên tục chung
  const chon = ds.filter(o => _tytGvChon.has(o.key) && o.kys.length);
  if (chon.length) {
    const dau = chon.map(o => o.kys[0]).sort()[0], cuoi = chon.map(o => o.kys[o.kys.length - 1]).sort().slice(-1)[0];
    const truc = tytDayKy(dau, cuoi, che);
    const kySau = tytKyKe(cuoi, che);
    const series = chon.map((o, i) => {
      const bd = tytBienDong(o.ky, o.kys);
      const g0 = o.ky[o.kys[0]].gia;
      return { ten: o.ten + (o.dv ? ' (' + o.dv + ')' : ''), mau: o.key === 'CONG' ? '#fd7e14' : _TYT_MAU[(i + 1) % _TYT_MAU.length],
        vals: truc.map(k => o.ky[k] ? o.ky[k].gia / g0 * 100 : null),
        db: bd && bd.db !== null && bd.kyCuoi === cuoi ? bd.db / g0 * 100 : null };
    });
    chart.innerHTML = _tytLineSvg({ labels: truc, dbLabel: series.some(sr => sr.db !== null) ? kySau : '', baseline: 100, series,
      fmtY: v => Math.round(v) + '%', fmtTip: v => Math.round(v) + '% so với kỳ đầu' }) +
      `<div class="d-flex flex-wrap gap-2 mt-1 mb-2">${series.map(sr => `<span class="tyt-lg"><i style="background:${sr.mau}"></i>${x(sr.ten)}</span>`).join('')}</div>`;
  } else chart.innerHTML = '<div class="text-secondary text-center py-2" style="font-size:12px">Tick mặt hàng ở bảng dưới để vẽ biểu đồ.</div>';

  const nhan = k => che === 'q' ? k.replace('-', ' ') : (che === 'm' ? k.slice(5) + '/' + k.slice(0, 4) : k);
  _tytGvList = list;
  const rows = list.map((o, i) => {
    const bd = tytBienDong(o.ky, o.kys);
    const on = _tytGvChon.has(o.key);
    const spark = bd ? _tytSpark(bd.day.map(k => o.ky[k] ? o.ky[k].gia : null), o.key === 'CONG' ? '#fd7e14' : '#0d6efd') : '';
    return `<tr class="${o.key === 'CONG' ? 'tyt-ss-key' : ''}">
      <td style="width:30px"><input type="checkbox" class="form-check-input" ${on ? 'checked' : ''} onchange="tytGvTick(${i}, this.checked)"></td>
      <td><div class="fw-semibold">${x(o.ten)}</div><div class="text-secondary" style="font-size:10.5px">${x(o.loai)}</div></td>
      <td>${x(o.dv || '—')}</td>
      <td class="text-end font-monospace">${o.key === 'CONG' ? fmtM(o.soLan).replace(' đ', '') + ' công' : o.soLan + ' lần'}</td>
      <td class="text-end font-monospace" style="white-space:nowrap">${bd ? fmtM(Math.round(bd.dau)) : '—'}<div class="text-secondary" style="font-size:10.5px">${bd ? nhan(bd.kyDau) : ''}</div></td>
      <td class="text-end font-monospace" style="white-space:nowrap">${bd ? fmtM(Math.round(bd.cuoi)) : '—'}<div class="text-secondary" style="font-size:10.5px">${bd ? nhan(bd.kyCuoi) : ''}</div></td>
      <td class="text-end">${bd && o.kys.length > 1 ? _tytPctDoi(bd.pct) : '—'}</td>
      <td class="text-end font-monospace" style="white-space:nowrap">${bd && bd.db !== null ? fmtM(Math.round(bd.db)) : '<span class="text-secondary" title="Cần ≥ ' + TYT_DB_MIN + ' kỳ có mua">—</span>'}</td>
      <td>${spark}</td></tr>`;
  }).join('');
  body.innerHTML = `<div style="overflow-x:auto"><table class="table table-sm table-hover align-middle mb-0 tyt-rpt" style="font-size:12px;min-width:820px">
      <thead class="table-light"><tr><th></th><th>Mặt hàng</th><th>ĐVT</th><th class="text-end">Đã mua</th><th class="text-end">Giá kỳ đầu</th><th class="text-end">Giá gần nhất</th><th class="text-end">Thay đổi</th><th class="text-end">Dự báo kỳ tới <span class="badge text-bg-warning" style="font-size:9px">ước tính</span></th><th>Diễn biến</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="9" class="text-secondary text-center py-3">Không có mặt hàng phù hợp.</td></tr>'}</tbody></table></div>
    <div class="text-secondary mt-1" style="font-size:11px">${tim ? 'Kết quả tìm' : `Các mặt hàng mua ở ≥ 2 kỳ, nhiều lần mua nhất trước (tối đa ${TYT_GV_MAX} dòng — gõ ô "Tìm" để xem mặt hàng khác)`}. Tên khác nhau (VD "Xi măng" và "Xi măng Hà Tiên") là 2 mặt hàng. Dự báo = đường thẳng qua các kỳ, cần ≥ ${TYT_DB_MIN} kỳ — chỉ để tham khảo khi chốt giá khoán.</div>`;
}

// ══ PHẠM VI: TRỌN VÒNG ĐỜI CÔNG TRÌNH (06/10/2026 — Lần 3) ═════════════════
// Mặc định tab BỎ QUA bộ lọc năm chung: xem 1 công trình là xem đủ chi phí từ lúc khởi công tới lúc
// kết thúc (VD đang lọc 2026 nhưng nhà Cô Sáu bắt đầu 2025 → vẫn tính cả chi phí 2025).
// App chỉ tải dữ liệu các năm đang lọc → tab TỰ TẢI các năm còn thiếu của vòng đời (pullChanges(năm)),
// tải xong tự vẽ lại. Công tắc #tyt-vongdoi tắt → quay về tính theo năm đang lọc như các tab khác.
let _tytAllYears   = true;
let _tytLoading    = false;      // đang tải năm còn thiếu
const _tytTried    = new Set();  // năm đã thử tải trong phiên (tránh tải lặp khi lỗi mạng)
let _tytLoadingYrs = [];         // năm đang tải (để hiện trạng thái)

function _tytOpts() { return { allYears: _tytAllYears }; }

// Năm của danh sách chưa có trong máy (chưa pull trong phiên)
function _tytMissingYears(years) {
  const pulled = (typeof _pulledYearsThisSession !== 'undefined') ? _pulledYearsThisSession : new Set();
  return years.filter(y => !pulled.has(String(y)));
}

// Bảo đảm các năm đã có trong máy; thiếu → tải tuần tự rồi vẽ lại. Trả true nếu VỪA bắt đầu tải.
function _tytEnsureYears(years) {
  if (!_tytAllYears || _tytLoading) return false;
  if (typeof fbReady !== 'function' || !fbReady() || typeof pullChanges !== 'function') return false;
  const miss = _tytMissingYears(years).filter(y => !_tytTried.has(String(y)));
  if (!miss.length) return false;
  _tytLoading = true; _tytLoadingYrs = miss;
  _tytRenderScope();
  let i = 0;
  const next = () => {
    if (i >= miss.length) {
      _tytLoading = false; _tytLoadingYrs = [];
      if (typeof _reloadGlobals === 'function') _reloadGlobals();
      if (typeof clearInvoiceCache === 'function') clearInvoiceCache();
      toast(`✅ Đã tải dữ liệu năm ${miss.join(', ')} để xem trọn vòng đời công trình`, 'success');
      _tytRecalc();
      return;
    }
    // Đang có lượt đồng bộ khác chạy → chờ rồi thử lại (pullChanges tự bỏ qua khi đang pull)
    if (typeof isSyncing === 'function' && isSyncing()) { setTimeout(next, 1200); return; }
    const y = miss[i++];
    _tytTried.add(String(y));
    pullChanges(y, next, { silent: true });
  };
  next();
  return true;
}

// Dòng trạng thái dưới công tắc phạm vi
function _tytRenderScope() {
  const el = document.getElementById('tyt-vongdoi-st');
  const sw = document.getElementById('tyt-vongdoi');
  if (sw) sw.checked = _tytAllYears;
  if (!el) return;
  const p = _tytProj();
  if (!_tytAllYears) { el.innerHTML = `Đang tính theo <b>năm đang lọc</b> (${x(tytNhanNam())}).`; return; }
  if (!p) { el.innerHTML = 'Tính <b>trọn vòng đời</b> công trình — bỏ qua bộ lọc năm.'; return; }
  const ys = tytNamVongDoi(p);
  const range = ys.length > 1 ? `${ys[0]}–${ys[ys.length - 1]}` : ys[0];
  if (_tytLoading) { el.innerHTML = `<span class="text-primary">⏳ Đang tải dữ liệu năm ${_tytLoadingYrs.join(', ')}…</span>`; return; }
  const thieu = _tytMissingYears(ys);
  el.innerHTML = thieu.length && (typeof fbReady === 'function' && fbReady())
    ? `Vòng đời <b>${range}</b> · <span class="text-warning-emphasis">⚠ chưa tải được năm ${thieu.join(', ')} — số liệu có thể thiếu</span> <a href="#" onclick="tytTaiLai();return false">Thử lại</a>`
    : `Vòng đời <b>${range}</b> · đã đủ dữ liệu các năm.`;
}

function tytSetVongDoi(on) {
  _tytAllYears = !!on;
  _tytRecalc();
}
function tytTaiLai() {
  const p = _tytProj();
  if (!p) return;
  tytNamVongDoi(p).forEach(y => _tytTried.delete(String(y)));
  _tytEnsureYears(tytNamVongDoi(p));
}

// ══ SAO CHÉP / DÁN LUẬT & CẤU TRÚC (06/10/2026 — Lần 3) ════════════════════
// "Bộ nhớ tạm" riêng của tab (lưu localStorage để chuyển trang / tải lại vẫn còn — chỉ trên máy này):
//   { kind: 'luat' | 'cautruc', fromPid, fromTen, at, giaiDoan, hangMuc, luat }
// Dán = GỘP theo tên (tytSaoChep) — không xóa gì của công trình đích.
//   • Dán cấu trúc → vào BẢN NHÁP (bấm "Lưu Cấu Trúc" mới ghi, Hủy được).
//   • Dán luật     → ghi ngay; giai đoạn / hạng mục mà luật cần nhưng CT đích chưa có → tự thêm.
const _TYT_CLIP_KEY = 'tyt_clip_v1';
function _tytClipGet() {
  try { return JSON.parse(localStorage.getItem(_TYT_CLIP_KEY) || 'null'); } catch (e) { return null; }
}
function _tytClipSet(v) {
  try { localStorage.setItem(_TYT_CLIP_KEY, JSON.stringify(v)); } catch (e) { /* trình duyệt chặn lưu → chỉ nhớ trong phiên */ }
  _tytClipMem = v;
}
let _tytClipMem = null;
function _tytClip() { return _tytClipGet() || _tytClipMem; }

function tytCopy(kind) {
  const p = _tytProj();
  if (!p) return;
  const st = tytStructOf(p.id);
  if (kind === 'luat' && !st.luat.length) { toast('Công trình này chưa có luật nào để sao chép', 'error'); return; }
  if (kind === 'cautruc' && !st.giaiDoan.length) { toast('Công trình này chưa có giai đoạn nào để sao chép', 'error'); return; }
  _tytClipSet({ kind, fromPid: p.id, fromTen: p.name, at: Date.now(), giaiDoan: st.giaiDoan, hangMuc: st.hangMuc, luat: st.luat });
  toast(kind === 'luat'
    ? `📋 Đã sao chép ${st.luat.length} luật — chọn công trình khác rồi bấm "Dán luật"`
    : `📋 Đã sao chép cấu trúc (${st.giaiDoan.length} giai đoạn, ${st.hangMuc.length} hạng mục) — chọn công trình khác rồi bấm "Dán cấu trúc"`, 'success');
  _tytRenderClipBtns();
}

// Nút "Dán …" chỉ hiện khi bộ nhớ tạm có đúng loại và đến từ công trình KHÁC
function _tytRenderClipBtns() {
  const c = _tytClip();
  [['luat', 'tyt-paste-luat'], ['cautruc', 'tyt-paste-ct']].forEach(([kind, id]) => {
    const b = document.getElementById(id);
    if (!b) return;
    const ok = c && c.kind === kind && c.fromPid !== _tytPid;
    b.style.display = ok ? '' : 'none';
    if (ok) b.title = `Dán ${kind === 'luat' ? (c.luat || []).length + ' luật' : 'cấu trúc'} từ "${c.fromTen}" (gộp theo tên, không xóa gì của công trình này)`;
    const lb = b.querySelector('.tyt-paste-from');
    if (lb && ok) lb.textContent = c.fromTen;
  });
}

function tytPaste(kind) {
  const p = _tytProj();
  const c = _tytClip();
  if (!p || !c || c.kind !== kind) return;
  if (kind === 'cautruc') {
    const d = _tytCtEdit();   // dán vào bản nháp
    const res = tytSaoChep(c, d, { cauTruc: true });
    _tytRenderCauTruc();
    toast(res.gdMoi || res.hmMoi
      ? `📥 Đã dán: +${res.gdMoi} giai đoạn, +${res.hmMoi} hạng mục — bấm "Lưu Cấu Trúc" để ghi`
      : 'Công trình này đã có đủ các giai đoạn / hạng mục đó', res.gdMoi || res.hmMoi ? 'success' : 'info');
    return;
  }
  // Dán luật: ghi ngay → không được đang sửa dở cấu trúc
  if (_tytDraft) { toast('Hãy Lưu (hoặc Hủy) thay đổi cấu trúc ở tab Thiết lập trước khi dán luật', 'error'); return; }
  const st = tytStructOf(p.id);
  const cuIds = new Set(st.giaiDoan.map(g => g.id));
  // Thêm trước các giai đoạn / hạng mục mà luật cần (chỉ những cái luật dùng tới)
  const can = { giaiDoan: c.giaiDoan.filter(g => c.luat.some(l => l.g === g.id)),
                hangMuc: c.hangMuc.filter(h => c.luat.some(l => l.h === h.id)), luat: [] };
  // giai đoạn của hạng mục cần cũng phải có
  can.hangMuc.forEach(h => { if (!can.giaiDoan.some(g => g.id === h.gdId)) { const g = c.giaiDoan.find(z => z.id === h.gdId); if (g) can.giaiDoan.push(g); } });
  const r1 = tytSaoChep(can, st, { cauTruc: true });
  const r2 = tytSaoChep(c, st, { luat: true });
  tytSaveStruct(p.id, { giaiDoan: st.giaiDoan, hangMuc: st.hangMuc, luat: st.luat });
  st.giaiDoan.forEach(g => { if (!cuIds.has(g.id)) _tytOpen.add('G:' + g.id); });
  toast(`📥 Đã dán ${r2.luatMoi} luật` + (r1.gdMoi || r1.hmMoi ? ` (tự thêm ${r1.gdMoi} giai đoạn, ${r1.hmMoi} hạng mục)` : '') +
    (r2.trung ? ` · bỏ qua ${r2.trung} luật trùng` : ''), 'success');
  _tytRenderCauTruc();
  _tytRecalc();
}

// ══ ĐỐI CHIẾU NHÓM CÔNG TRÌNH CÙNG CẤU TRÚC (tab Định mức — 06/10/2026 — Lần 3) ══════
// Gom các CT có CÙNG mẫu Giai đoạn & Hạng mục (tytNhomCauTruc) → so đ/m2 từng giai đoạn / hạng mục
// giữa các CT với 1 CHUẨN (định mức đã lưu, hoặc trung bình nhóm) để thấy CT nào trượt giá / vượt chi.
let _tytNhKey = '';   // khóa nhóm đang xem ('' = nhóm của CT đang chọn)
const TYT_NH_LECH = 10;   // lệch quá ±10% so với chuẩn → tô màu

function _tytAllProjs() {
  return ((typeof getAllProjects === 'function') ? getAllProjects() : [])
    .filter(p => p && p.id !== 'COMPANY' && !p.deletedAt);
}

function tytRenderNhom() {
  const box = document.getElementById('tyt-nh-body');
  const sel = document.getElementById('tyt-nh-sel');
  const selC = document.getElementById('tyt-nh-chuan');
  if (!box || !sel) return;
  const nhoms = tytNhomCauTruc(_tytAllProjs());
  if (!nhoms.length) {
    sel.innerHTML = '<option value="">(Chưa có công trình nào tạo Giai đoạn & Hạng mục)</option>';
    box.innerHTML = '';
    return;
  }
  // Mặc định: nhóm chứa công trình đang chọn
  if (!nhoms.some(n => n.key === _tytNhKey)) {
    const cua = nhoms.find(n => n.projs.some(p => p.id === _tytPid));
    _tytNhKey = (cua || nhoms[0]).key;
  }
  sel.innerHTML = nhoms.map((n, i) => {
    const soHm = n.st.hangMuc.length;
    return `<option value="${x(n.key)}">Nhóm ${i + 1}: ${n.st.giaiDoan.length} GĐ · ${soHm} HM — ${n.projs.length} công trình (${x(n.projs.slice(0, 3).map(p => p.name).join(', '))}${n.projs.length > 3 ? '…' : ''})</option>`;
  }).join('');
  sel.value = _tytNhKey;
  // Chuẩn so sánh: trung bình nhóm hoặc 1 bộ định mức
  if (selC) {
    const cur = selC.value || 'tb';
    selC.innerHTML = '<option value="tb">Chuẩn: Trung bình nhóm</option>' +
      tytDinhMucList().map(dm => `<option value="${dm.id}">Chuẩn: ${x(dm.ten)}</option>`).join('');
    selC.value = [...selC.options].some(o => o.value === cur) ? cur : 'tb';
  }
  const nhom = nhoms.find(n => n.key === _tytNhKey);
  const opts = _tytOpts();
  // Bảo đảm dữ liệu các năm của mọi CT trong nhóm (chế độ vòng đời)
  if (_tytAllYears) _tytEnsureYears([...new Set(nhom.projs.flatMap(p => tytNamVongDoi(p)))]);
  // (Phần B) Chỉ Rổ 1: tiền giai đoạn / hạng mục chỉ gồm các món Rổ 1 (tytGomGd); chuẩn định mức dùng số Rổ 1
  const r1 = !!document.getElementById('tyt-nh-r1')?.checked;
  const cots = nhom.projs.map(p => {
    const r = tytTongHop(p, opts);
    return r1 ? { p, r, g: tytGomGd(r, pt => pt.ro === 1), tong: r.theoRo[1], cpM2: r.cpM2Ro1 }
              : { p, r, g: r, tong: r.tongChi, cpM2: r.cpM2 };
  });
  const dm = selC && selC.value !== 'tb' ? tytDinhMucById(selC.value) : null;
  const dmGd = dm ? ((r1 ? dm.dgGdR1 : dm.dgGd) || {}) : {};
  const dmHm = dm ? ((r1 ? dm.dgHmR1 : dm.dgHm) || {}) : {};
  const dmTong = dm ? (r1 ? (dm.dgRo1 || 0) : dm.dgTong) : 0;
  const k = t => _tytBoDau(t);

  // Hàng ma trận: giai đoạn + hạng mục theo cấu trúc mẫu của nhóm (khớp theo TÊN — id mỗi CT khác nhau)
  const tienGd = (g, ten) => { const o = g.theoGD.find(z => k(z.gd.ten) === k(ten)); return o ? o.tien : 0; };
  const tienHm = (g, tenGd, tenHm) => {
    const o = g.theoGD.find(z => k(z.gd.ten) === k(tenGd));
    const h = o && o.hms.find(z => k(z.hm.ten) === k(tenHm));
    return h ? h.tien : 0;
  };
  const hang = [];
  nhom.st.giaiDoan.forEach(g => {
    hang.push({ cap: 'gd', ten: g.ten, val: c => tienGd(c.g, g.ten), chuanDm: dmGd[g.ten] });
    nhom.st.hangMuc.filter(h => h.gdId === g.id).forEach(h => hang.push({
      cap: 'hm', ten: h.ten, val: c => tienHm(c.g, g.ten, h.ten), chuanDm: dmHm[g.ten + ' › ' + h.ten],
    }));
  });
  hang.push({ cap: 'chua', ten: 'Chưa phân bổ', val: c => c.g.chuaPB, chuanDm: dmGd['Chưa phân bổ'] });

  const m2 = (c, tien) => c.r.tongSan > 0 ? tien / c.r.tongSan : null;
  const tbNhom = vals => { const v = vals.filter(z => z !== null && z > 0); return v.length ? v.reduce((s, z) => s + z, 0) / v.length : null; };
  const lechCell = (v, chuan) => {
    if (v === null) return '<td class="text-end text-secondary">—</td>';
    if (!v) return '<td class="text-end text-secondary">0</td>';
    let cls = '', sub = '';
    if (chuan) {
      const pct = (v - chuan) / chuan * 100;
      cls = pct > TYT_NH_LECH ? 'tyt-ss-max' : (pct < -TYT_NH_LECH ? 'tyt-ss-min' : '');
      const p1 = Math.abs(pct) < 0.05 ? 0 : pct;   // tránh hiện "-0,0%"
      sub = `<div style="font-size:10.5px">${p1 > 0 ? '+' : ''}${p1.toFixed(1).replace('.', ',')}%</div>`;
    }
    return `<td class="text-end font-monospace ${cls}" style="white-space:nowrap">${fmtM(Math.round(v))}${sub}</td>`;
  };

  // Bảng 1: tổng hợp ngân sách từng CT (ngân sách = sàn × đơn giá chuẩn)
  const dgChuanTong = dm ? dmTong : tbNhom(cots.map(c => c.r.tongSan > 0 ? c.cpM2 : null));
  const tong = cots.map(c => {
    const ns = c.r.tongSan > 0 && dgChuanTong ? Math.round(c.r.tongSan * dgChuanTong) : null;
    return `<tr>
      <td class="fw-semibold">${x(c.p.name)}${c.p.id === _tytPid ? ' <span class="badge text-bg-primary">đang chọn</span>' : ''}</td>
      <td class="text-end font-monospace">${c.r.tongSan > 0 ? tytFmtM2(c.r.tongSan) + ' m2' : '<span class="text-warning-emphasis">chưa có M2</span>'}</td>
      <td class="text-end font-monospace">${ns === null ? '—' : fmtM(ns)}</td>
      <td class="text-end font-monospace">${fmtM(c.tong)}</td>
      ${ns === null ? '<td class="text-end">—</td><td class="text-end">—</td>' :
        `${Math.abs(ns - c.tong) < 1000 ? '<td class="text-end font-monospace text-secondary">≈ 0</td>' : `<td class="text-end font-monospace ${ns - c.tong < 0 ? 'text-danger fw-bold' : 'text-success'}">${ns - c.tong < 0 ? 'Vượt ' + fmtM(c.tong - ns) : fmtM(ns - c.tong)}</td>`}
         <td class="text-end font-monospace ${c.tong / ns > 1 ? 'tyt-dt-vuot' : (c.tong / ns > 0.85 ? 'tyt-dt-gan' : '')}">${(c.tong / ns * 100).toFixed(1).replace('.', ',')}%</td>`}
      <td class="text-end font-monospace">${c.r.tongSan > 0 ? fmtM(Math.round(c.cpM2)) : '—'}</td>
    </tr>`;
  }).join('');

  // Bảng 2: ma trận đ/m2 theo giai đoạn / hạng mục
  const head = cots.map(c => `<th class="text-end tyt-ss-th" title="${x(c.p.name)}">${x(c.p.name)}</th>`).join('');
  const rows = hang.map(h => {
    const vals = cots.map(c => m2(c, h.val(c)));
    const chuan = dm ? (h.chuanDm || null) : tbNhom(vals);
    if (h.cap === 'chua' && !vals.some(v => v)) return '';
    return `<tr class="${h.cap === 'gd' ? 'tyt-cay-gd' : (h.cap === 'chua' ? 'tyt-cay-chua' : '')}">
      <td style="${h.cap === 'hm' ? 'padding-left:22px' : ''}">${h.cap === 'hm' ? '<span class="text-secondary">└</span> ' : ''}${x(h.cap === 'gd' ? h.ten.toUpperCase() : h.ten)}</td>
      <td class="text-end font-monospace tyt-ss-avg">${chuan ? fmtM(Math.round(chuan)) : '—'}</td>
      ${vals.map(v => lechCell(v, chuan)).join('')}
    </tr>`;
  }).join('');

  box.innerHTML = `
    <div class="qt-lb mb-1">${r1 ? 'Chỉ Rổ 1 · ' : 'Toàn bộ chi phí · '}Ngân sách theo chuẩn (${dm ? x(dm.ten) + ' — ' + fmtM(dmTong) + '/m2' : 'trung bình nhóm' + (dgChuanTong ? ' — ' + fmtM(Math.round(dgChuanTong)) + '/m2' : '')})</div>
    <div style="overflow-x:auto" class="mb-3">
      <table class="table table-sm table-hover align-middle mb-0 tyt-rpt" style="font-size:12px;min-width:720px">
        <thead class="table-light"><tr><th>Công trình</th><th class="text-end">Sàn</th><th class="text-end">Ngân sách chuẩn</th><th class="text-end">Thực tế${r1 ? ' Rổ 1' : ''}</th><th class="text-end">Còn lại / Vượt</th><th class="text-end">% đã dùng</th><th class="text-end">đ / m2 thực tế</th></tr></thead>
        <tbody>${tong}</tbody>
      </table>
    </div>
    <div class="qt-lb mb-1">Đơn giá thực tế đ/m2 theo giai đoạn / hạng mục — ô <span class="tyt-ss-max px-1">đỏ</span> cao hơn chuẩn &gt; ${TYT_NH_LECH}%, <span class="tyt-ss-min px-1">xanh</span> thấp hơn &gt; ${TYT_NH_LECH}%</div>
    <div style="overflow-x:auto">
      <table class="table table-sm table-hover align-middle mb-0 tyt-rpt tyt-ss" style="font-size:12px">
        <thead class="table-light"><tr><th style="min-width:200px">Giai đoạn / Hạng mục</th><th class="text-end">Chuẩn</th>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${!dm ? '' : (r1 && !dm.dgGdR1
      ? '<div class="text-warning-emphasis mt-1" style="font-size:11px">⚠ Định mức này lưu trước khi có Rổ 1 → chưa có chuẩn Rổ 1 theo giai đoạn / hạng mục. Bấm ✎ ở danh sách định mức → "Cập nhật lại từ CT nguồn", hoặc tắt công tắc "Chỉ Rổ 1".</div>'
      : '<div class="text-secondary mt-1" style="font-size:11px">Định mức lưu trước ngày 06/10/2026 chưa có đơn giá theo hạng mục → cột Chuẩn của hạng mục để trống (vẫn so được cấp giai đoạn). Cập nhật lại định mức để có đủ.</div>')}`;
}

function tytNhomChon(key) { _tytNhKey = key; tytRenderNhom(); }

// Cấp ra global (gọi từ onclick trong HTML + main.js + projects.ui.js)
window.initTyTrong = initTyTrong;
window.tytRefresh   = tytRefresh;
window.tytOpenFor   = tytOpenFor;
