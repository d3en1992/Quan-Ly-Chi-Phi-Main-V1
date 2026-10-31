// tytrong.ui.js — Tab TỈ TRỌNG & ĐỊNH MỨC · GIAO DIỆN + THAO TÁC (05/10/2026 · tái cấu trúc 3.0 ngày 27/10/2026)
// Load order: sau tytrong.core.js. Giao diện: pages/tytrong.html (tiền tố ID tyt-).
//
// Các khối:
//   ĐẦU TRANG: Chọn công trình (#tytf-ct — cùng danh sách tab Quyết Toán, _qtProjList) + công tắc Trọn vòng đời
//              + nút "⚙ Cấu hình phân nhóm" (tytCfgMo — popup dùng chung mọi CT: Loại → Nhóm / Trụ cột, Luật từ khóa)
//              + 4 KPI (#tyt-kpi-*): Tổng chi · Tổng sàn (bấm → popup Bảng M2, tytM2Mo) · Đơn giá Thô & NC/m2 · Toàn bộ/m2
//              + nút đỏ "Chưa xếp nhóm" (#tyt-chuanhom-btn → tytMoChuaNhom)
//   3 TAB CON (tytGoSub — nút có ID = ID tab con + "-btn"):
//   1. TỔNG QUAN & PHÂN BỔ #tyt-sub-pt — cây 4 Nhóm (#tyt-cay-tbody, tytRenderCay): Nhóm → (Nhóm 1: Trụ cột) → Loại
//        → từng khoản; dòng khoản có ô 1·2·3·4 đổi nhóm 1-click (tytDoiNhom). Trạng thái mở/đóng: _tytOpen.
//      + Theo loại chi phí (#tyt-loai-tbody) + Gán nhóm theo HĐ thầu phụ (#tyt-hdtp-tbody)
//      + Tra cứu & gán hàng loạt (#tyt-pb-*, tytPbGan)
//   2. KIỂM SOÁT ĐỊNH MỨC #tyt-sub-dm — Nhóm 1: 4 trụ cột + Quỹ phụ phí (#tyt-dt-*, tytRenderKiemSoat)
//        + bộ định mức mẫu: lưu từ CT / nhập tay / sửa / cập nhật / xóa (#tyt-dm-*, tytDmSua)
//   3. XU HƯỚNG & SO SÁNH #tyt-sub-ss — so sánh CT theo 4 Nhóm (+ trụ cột Nhóm 1) hoặc chỉ Nhóm 1 (#tyt-ss-n1), xuất Excel
//        + xu hướng đ/m2 Nhóm 1 theo năm (#tyt-xh-*) + biến động đơn giá vật tư / công nhật (#tyt-gv-*) — biểu đồ SVG tự vẽ
// Popup dùng chung #ct-modal (closeModal). Không sửa hóa đơn / tiền ứng: mọi phân nhóm lưu ở store tytrong_v1.

// ─── State ─────────────────────────────────────────────────────
let _tytPid      = '';      // projectId đang chọn
let _tytPbPage   = 0;       // trang hiện tại của bảng gán hàng loạt
const _tytPbSel  = new Set();   // khóa các dòng chi phí đang tick
let _tytLast     = null;    // kết quả tytTongHop lần vẽ gần nhất (dùng cho lọc / chọn tất cả)
const TYT_PB_PG  = 30;      // số dòng / trang bảng gán hàng loạt
let _tytSub      = 'tyt-sub-pt';   // tab con đang mở (giữ khi đổi công trình / sync)
const _tytOpen   = new Set();      // key các node đang MỞ trong bảng cây
let _tytMoM2     = false;   // mở popup Bảng M2 ngay khi vào tab (tytOpenFor từ form Sửa công trình)

// ══ KHỞI TẠO ════════════════════════════════════════════════════
// Vào tab (goPage) → nạp dropdown, GIỮ công trình đang chọn (nếu còn), vẽ lại
function initTyTrong() {
  tytPopulateSels();
  tytRenderAll();
}
// Đổi năm / sync xong (renderActiveTab) → vẽ lại
function tytRefresh() {
  tytPopulateSels();
  tytRenderAll();
}

// Mở tab, chọn sẵn 1 công trình và mở popup Bảng M2 (gọi từ form Sửa công trình)
function tytOpenFor(pid) {
  if (typeof closeModal === 'function') closeModal();
  if (pid !== _tytPid) { _tytPid = pid; _tytResetEdits(); }
  _tytMoM2 = true;
  goPage(null, 'tytrong');
}

function _tytResetEdits() {
  _tytPbPage = 0; _tytPbSel.clear();
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

function tytOnCtChange() {
  const sel = document.getElementById('tytf-ct');
  const v = sel ? sel.value : '';
  if (v === _tytPid) return;
  _tytPid = v;
  _tytResetEdits();
  tytRenderAll();
}

// ══ VẼ TOÀN BỘ ══════════════════════════════════════════════════
function tytRenderAll() {
  const p = _tytProj();
  const empty = document.getElementById('tyt-empty');
  const main  = document.getElementById('tyt-main');
  if (empty) empty.style.display = p ? 'none' : '';
  if (main)  main.style.display  = p ? '' : 'none';
  if (!p) { _tytLast = null; _tytRenderKpi(null); _tytRenderScope(); return; }
  tytGoSub(_tytSub);
  _tytRecalc();
  if (_tytMoM2) { _tytMoM2 = false; tytM2Mo(); }
}

// Tính lại + vẽ các phần phụ thuộc số liệu
function _tytRecalc() {
  const p = _tytProj();
  if (!p) return;
  // Trọn vòng đời: tải các năm còn thiếu của CT (tải xong tự gọi lại hàm này)
  if (_tytAllYears) _tytEnsureYears(tytNamVongDoi(p));
  _tytLast = tytTongHop(p, _tytOpts());
  _tytRenderKpi(_tytLast);
  _tytRenderLoai(_tytLast);
  tytRenderCay();
  _tytRenderHdtp(_tytLast);
  _tytRenderPbLoai(_tytLast);
  tytRenderPb(_tytPbPage);
  _tytRenderDm(_tytLast);
  if (_tytSub === 'tyt-sub-ss') _tytRenderTabSs();   // so sánh / xu hướng tính nhiều CT → chỉ vẽ khi đang mở
  _tytRenderScope();
  _tytCfgFill();   // popup cấu hình đang mở → cập nhật cột "CT này"
}

// ══ TAB CON ═════════════════════════════════════════════════════
function tytGoSub(id) {
  if (!document.getElementById(id)) id = 'tyt-sub-pt';
  _tytSub = id;
  document.querySelectorAll('#tyt-main .sub-page').forEach(pg => pg.classList.toggle('active', pg.id === id));
  document.querySelectorAll('#tyt-sub-nav .nav-link').forEach(b => b.classList.toggle('active', b.id === id + '-btn'));
  if (id === 'tyt-sub-ss' && _tytLast) _tytRenderTabSs();
}

// ── Định dạng dùng chung ──
function _tytPct(v, tong) { return tong ? (v / tong * 100) : 0; }
function _tytPctTxt(v, tong) { return tong ? _tytPct(v, tong).toFixed(1).replace('.', ',') + '%' : '—'; }
function _tytM2Txt(v, san) { return san > 0 ? fmtM(Math.round(v / san)) : '—'; }
// Ô tỉ trọng có thanh ngang nhỏ minh họa (màu theo nhóm nếu có)
function _tytPctCell(v, tong, nhom) {
  const w = Math.max(0, Math.min(100, _tytPct(v, tong)));
  return `<td class="text-end font-monospace" style="white-space:nowrap">
    <div>${_tytPctTxt(v, tong)}</div>
    <div class="tyt-bar${nhom !== undefined ? ' tyt-nh-' + nhom : ''}"><span style="width:${w.toFixed(1)}%"></span></div>
  </td>`;
}
// Hiện popup dùng chung #ct-modal
function _tytModal(title, body) {
  document.getElementById('modal-title').innerHTML = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('ct-modal').classList.add('open');
}
// Popup #ct-modal đang mở và đang chứa phần tử id này không
function _tytModalCo(id) {
  return !!(document.getElementById('ct-modal')?.classList.contains('open') && document.getElementById(id));
}

// ── Chip nhóm (màu theo nhóm) ──
const _TYT_NHOM_SRC = { tay: 'gán tay', hdtp: 'theo HĐ thầu phụ', luat: 'theo luật từ khóa', loai: 'theo bảng Loại → Nhóm', macdinh: 'mặc định theo tên loại' };
function _tytNhomChip(n, src, nho) {
  const t = TYT_NHOM[n] || TYT_NHOM[0];
  return `<span class="tyt-nh tyt-nh-${n}${nho ? ' tyt-nh-sm' : ''}" title="${n ? 'Nhóm ' + n + ': ' : ''}${x(t.ten)}${src ? ' — ' + (_TYT_NHOM_SRC[src] || src) : ''}">${n ? n + ' · ' : ''}${t.ngan}</span>`;
}
// Chip nhóm của 1 khoản (nhiều món khác nhóm → nhiều chip)
function _tytNhomChipLine(l) {
  const seen = new Map();
  (l.parts || []).forEach(pt => { if (!seen.has(pt.nhom)) seen.set(pt.nhom, pt.nhomSrc); });
  return [...seen.entries()].map(([n, src]) => _tytNhomChip(n, src, true)).join(' ');
}
// Biểu tượng (?) — rê chuột xem hướng dẫn
function _tytHelp(txt) {
  return `<span class="tyt-help" title="${x(txt)}"><span class="material-symbols-outlined">help</span></span>`;
}

// ══ KPI ═════════════════════════════════════════════════════════
function _tytRenderKpi(r) {
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  const btn = document.getElementById('tyt-chuanhom-btn');
  if (!r) {
    ['tyt-kpi-chi', 'tyt-kpi-san', 'tyt-kpi-m2n1', 'tyt-kpi-m2all'].forEach(id => set(id, '—'));
    ['tyt-kpi-chi-sub', 'tyt-kpi-warn'].forEach(id => set(id, ''));
    if (btn) btn.style.display = 'none';
    return;
  }
  set('tyt-kpi-chi', fmtM(r.tongChi));
  set('tyt-kpi-chi-sub', `${r.lines.length} khoản chi · ${r.allYears ? 'trọn vòng đời' : 'năm ' + x(tytNhanNam())}`);
  set('tyt-kpi-san', r.tongSan > 0 ? `${tytFmtM2(r.tongSan)} m2` : '<span class="text-warning">Chưa nhập</span>');
  set('tyt-kpi-san-sub', r.tongSan > 0 ? 'Bấm để xem / sửa bảng M2' : 'Bấm để nhập bảng M2');
  set('tyt-kpi-m2n1', r.tongSan > 0 ? fmtM(Math.round(r.cpM2N1)) : '—');
  set('tyt-kpi-m2n1-sub', `Nhóm 1: ${fmtM(r.theoNhom[1])} ÷ sàn`);
  set('tyt-kpi-m2all', r.tongSan > 0 ? fmtM(Math.round(r.cpM2)) : '—');
  set('tyt-kpi-m2all-sub', 'Tổng chi ÷ sàn (cả 4 nhóm)');
  if (btn) {
    btn.style.display = r.chuaNhom.length ? '' : 'none';
    set('tyt-chuanhom-n', `${r.chuaNhom.length} khoản · ${fmtM(r.theoNhom[0])}`);
  }
  // Tự kiểm tra: tổng các dòng phải khớp "Tổng chi" trên thẻ công trình
  set('tyt-kpi-warn', r.tongKhop ? '' :
    '<div class="text-danger" style="font-size:11.5px">⚠ Tổng các khoản chi chưa khớp "Tổng chi" ở thẻ công trình — báo lại cho người lập trình kiểm tra.</div>');
}

// ══ POPUP BẢNG M2 SÀN (bấm thẻ KPI "Tổng diện tích sàn") ══════════════
// Ghi vào project.khoiLuong qua updateProject (form Sửa công trình chỉ còn TỔNG read-only + nút dẫn sang đây)
function tytM2Mo() {
  const p = _tytProj();
  if (!p) { toast('Chọn công trình trước!', 'error'); return; }
  const rows = Array.isArray(p.khoiLuong) && p.khoiLuong.length ? p.khoiLuong : [{}, {}, {}];
  _tytModal(`<span class="material-symbols-outlined msi-gap">square_foot</span>Bảng Tính M2 Sàn — ${x(p.name)}`, `
    <div class="table-responsive border rounded">
      <table class="table table-sm align-middle mb-0" style="font-size:12.5px">
        <thead class="table-light">
          <tr style="font-size:10.5px">
            <th>TÊN (Trệt, Lầu 1, Sân thượng, Mái...)</th>
            <th style="width:62px">ĐVT</th>
            <th style="width:90px" class="text-end">KL</th>
            <th style="width:66px" class="text-end" title="Hệ số quy đổi diện tích — VD mái, sân: 0,5. Mặc định 1">Hệ số</th>
            <th style="width:44px" class="text-center" title="Bỏ tick = không cộng vào Tổng diện tích sàn">Tính</th>
            <th style="width:30px"></th>
          </tr>
        </thead>
        <tbody id="tyt-kl-tbody">${rows.map(_tytKlRowHtml).join('')}</tbody>
      </table>
    </div>
    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-2">
      <button type="button" class="btn btn-outline-secondary btn-sm" onclick="tytKlAddRow()">+ 1 dòng</button>
      <span>Tổng sàn quy đổi: <b id="tyt-kl-tong" class="font-monospace">${tytFmtM2(tytTongSanRows(rows))}</b> m2
        <span id="tyt-kl-dirty" class="badge text-bg-warning ms-1" style="display:none">Chưa lưu</span></span>
    </div>
    <div class="d-flex justify-content-end gap-2 mt-3">
      <button class="btn btn-sm btn-secondary" onclick="closeModal()">Hủy</button>
      <button class="btn btn-sm btn-primary fw-bold" onclick="tytKlSave()"><span class="material-symbols-outlined msi-gap">save</span>Lưu Bảng M2</button>
    </div>`);
}

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

// Đọc bảng M2 trên popup → [{ ten, dvt, kl, heSo, tinh }]. keepEmpty: giữ cả dòng trống
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

// Gõ vào bảng M2 → cập nhật tổng + đánh dấu chưa lưu
function _tytKlChanged() {
  const el = document.getElementById('tyt-kl-tong');
  if (el) el.textContent = tytFmtM2(tytTongSanRows(_tytKlRead(true)));
  const b = document.getElementById('tyt-kl-dirty');
  if (b) b.style.display = '';
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
  toast(`✅ Đã lưu bảng M2 — tổng sàn ${tytFmtM2(tytTongSanRows(khoiLuong))} m2`, 'success');
  if (typeof closeModal === 'function') closeModal();
  tytRenderAll();
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
      <td>${_tytNhomChipLoai(r, o.loai)}</td>
      <td class="text-end font-monospace" style="white-space:nowrap">${fmtM(o.tien)}</td>
      ${_tytPctCell(o.tien, r.tongChi)}
      <td class="text-end font-monospace" style="white-space:nowrap">${_tytM2Txt(o.tien, r.tongSan)}</td>
    </tr>`).join('') + `<tr class="tyt-rpt-total">
      <td>TỔNG</td><td></td>
      <td class="text-end font-monospace">${fmtM(r.tongChi)}</td>
      <td class="text-end font-monospace">${r.tongChi ? '100%' : '—'}</td>
      <td class="text-end font-monospace">${_tytM2Txt(r.tongChi, r.tongSan)}</td>
    </tr>`;
}

// Chip nhóm THỰC TẾ của 1 loại chi phí ở CT này (các khoản có thể vào nhóm khác nhau do luật / HĐ TP /
// gán tay / tách món) — nhóm nào có tiền thì hiện, sắp theo tiền giảm dần; tooltip ghi số tiền từng nhóm
function _tytNhomChipLoai(r, loai) {
  const by = {};
  r.lines.forEach(l => { if (l.loai === loai) l.parts.forEach(pt => { by[pt.nhom] = (by[pt.nhom] || 0) + pt.tien; }); });
  return Object.keys(by).sort((a, b) => by[b] - by[a]).map(n => {
    const t = TYT_NHOM[n];
    return `<span class="tyt-nh tyt-nh-${n} tyt-nh-sm" title="${+n ? 'Nhóm ' + n + ': ' : ''}${x(t.ten)}: ${fmtM(by[n])}">${+n ? n : '!'}</span>`;
  }).join(' ');
}

// ══ BẢNG CÂY 4 NHÓM (tab con TỔNG QUAN & PHÂN BỔ) ═══════════════════
// tytCayNhom(): Nhóm → (Nhóm 1: Trụ cột) → Loại chi phí → từng khoản (hoặc MÓN của hóa đơn chi tiết).
// 4 cột: Nhóm / Chi tiết · Số tiền · Tỷ trọng (% tổng CT) · Đơn giá / m2 sàn. Mặc định chỉ 4 dòng nhóm (thu gọn).
// Dòng khoản chi: ô 1·2·3·4 để ĐỔI NHÓM 1-CLICK (gán tay cả khoản) + ↺ trả về tự động.
const _TYT_KIND_CLS = { nhom: 'tyt-cay-gd', tru: 'tyt-cay-hm', loai: 'tyt-cay-loai', line: 'tyt-cay-line' };

function tytRenderCay() {
  const tb = document.getElementById('tyt-cay-tbody');
  if (!tb || !_tytLast) return;
  const r = _tytLast;
  const an0 = !!document.getElementById('tyt-cay-an0')?.checked;
  let html = '';
  const walk = (n, depth) => {
    if (an0 && !n.tien) return;
    const has  = n.children.length > 0;
    const open = has && _tytOpen.has(n.key);
    const toggle = has
      ? `<button type="button" class="tyt-cay-tg" onclick="tytCayToggle(this)" title="${open ? 'Thu gọn' : 'Mở rộng'}"><span class="material-symbols-outlined">${open ? 'remove' : 'add'}</span></button>`
      : '<span class="tyt-cay-tg-sp"></span>';
    let ten, pick = '';
    if (n.kind === 'nhom') {
      ten = n.nhom
        ? `<span class="tyt-nh-so tyt-nh-${n.nhom}">${n.nhom}</span><b title="${x(TYT_NHOM[n.nhom].mo)}">${x(n.ten.toUpperCase())}</b>`
        : `<span class="tyt-nh-so tyt-nh-0">!</span><b>CHƯA XẾP NHÓM</b> <span class="tyt-cay-note">→ bấm ô 1·2·3·4 ở từng khoản, hoặc nút đỏ "Chưa xếp nhóm"</span>`;
    } else if (n.kind === 'tru') {
      ten = `<span class="tyt-tru tyt-tru-${n.tru || 'x'}"></span><b title="${x(TYT_TRU[n.tru].mo)}">${x(n.ten)}</b>`;
    } else if (n.kind === 'loai') {
      ten = `${x(n.ten)} <span class="tyt-cay-note">(${n.soDong} khoản)</span>`;
    } else {
      const l = n.line, pt = n.part;
      const mon = pt.mon ? `<span class="tyt-cay-note">món</span> <b>${x(pt.ten)}</b> <span class="tyt-cay-note">— HĐ: ${x((l.nd || '').slice(0, 50))}</span>` : x(l.nd || '—');
      ten = `<span class="tyt-cay-date">${fmtISODate(l.ngay)}</span> ${mon}${l.doiTuong ? ` <span class="tyt-cay-note">· ${x(l.doiTuong)}</span>` : ''}`;
      pick = _tytNhomPick(l, pt);
    }
    const lineAttr = n.kind === 'line' ? ` data-lk="${x(n.line.key)}"` : '';
    html += `<tr class="${_TYT_KIND_CLS[n.kind] || ''}${n.kind === 'nhom' ? ' tyt-nhrow tyt-nh-' + n.nhom : ''}${n.tien ? '' : ' tyt-rpt-zero'}" data-k="${x(n.key)}"${lineAttr}>
      <td><div class="tyt-cay-name" style="padding-left:${depth * 20}px">${toggle}<span>${ten}</span>${pick}</div></td>
      <td class="text-end font-monospace" style="white-space:nowrap">${fmtM(n.tien)}</td>
      ${n.kind === 'line' ? `<td class="text-end font-monospace">${_tytPctTxt(n.tien, r.tongChi)}</td>` : _tytPctCell(n.tien, r.tongChi, n.kind === 'nhom' ? n.nhom : undefined)}
      <td class="text-end font-monospace" style="white-space:nowrap">${_tytM2Txt(n.tien, r.tongSan)}</td>
    </tr>`;
    if (open) n.children.forEach(c => walk(c, depth + 1));
  };
  tytCayNhom(r).forEach(n => walk(n, 0));
  if (!r.lines.length) html = '<tr><td colspan="4" class="text-center text-secondary py-3">Chưa có khoản chi nào</td></tr>';
  tb.innerHTML = html + `<tr class="tyt-rpt-total">
    <td>TỔNG CÔNG TRÌNH</td>
    <td class="text-end font-monospace">${fmtM(r.tongChi)}</td>
    <td class="text-end font-monospace">${r.tongChi ? '100%' : '—'}</td>
    <td class="text-end font-monospace">${_tytM2Txt(r.tongChi, r.tongSan)}</td>
  </tr>`;
}

// Ô đổi nhóm 1-click trên dòng khoản chi: 1 · 2 · 3 · 4 (+ ↺ khi đang gán tay)
function _tytNhomPick(l, pt) {
  const ca = l.parts.length > 1 ? ' (cả hóa đơn, mọi món)' : '';
  return `<span class="tyt-nh-pick">${TYT_NHOM_DS.map(n =>
    `<button type="button" class="tyt-nh-pk tyt-nh-${n}${n === pt.nhom ? ' on' : ''}" onclick="tytDoiNhom(this, ${n})" title="Chuyển khoản này sang Nhóm ${n}: ${x(TYT_NHOM[n].ten)}${ca}">${n}</button>`).join('')}${
    pt.nhomSrc === 'tay' ? '<button type="button" class="tyt-nh-pk tyt-nh-auto" onclick="tytDoiNhom(this, 0)" title="Đang gán tay — bấm để trả về tự động">↺</button>'
      : `<span class="tyt-nh-src" title="Đang xếp ${x(_TYT_NHOM_SRC[pt.nhomSrc] || '')}">tự động</span>`}</span>`;
}

// Bấm ô nhóm trên dòng khoản chi → gán tay cả khoản (n = 0 → bỏ gán tay)
function tytDoiNhom(btn, n) {
  const key = btn?.closest('tr')?.dataset.lk;
  const p = _tytProj();
  if (!key || !p) return;
  const st = tytStructOf(p.id);
  if (n) st.nhomTay[key] = n; else delete st.nhomTay[key];
  tytSaveStruct(p.id, { nhomTay: st.nhomTay });
  toast(n ? `✅ Đã chuyển sang Nhóm ${n}: ${TYT_NHOM[n].ten}` : 'Đã trả khoản chi về tự động xếp nhóm', 'success');
  _tytRecalc();
}

// Bấm [+]/[−] ở 1 dòng
function tytCayToggle(btn) {
  const k = btn?.closest('tr')?.dataset.k;
  if (!k) return;
  if (_tytOpen.has(k)) _tytOpen.delete(k); else _tytOpen.add(k);
  tytRenderCay();
}

// Mở hết (tới cấp Loại chi phí — chưa bung từng khoản chi) / Thu gọn hết
function tytCayAll(open) {
  _tytOpen.clear();
  if (open && _tytLast) {
    const walk = n => {
      if (n.kind === 'loai' || !n.children.length) return;
      _tytOpen.add(n.key);
      n.children.forEach(walk);
    };
    tytCayNhom(_tytLast).forEach(walk);
  }
  tytRenderCay();
}

// ══ POPUP "CHƯA XẾP NHÓM" (nút cảnh báo đỏ) ═══════════════════════════
// Nhóm các khoản chưa có nhóm theo LOẠI CHI PHÍ: xếp cả loại 1 lần (ghi vào bảng Loại → Nhóm dùng chung)
// hoặc xếp từng khoản (gán tay — chỉ công trình này). Xử lý hết → popup tự đóng.
let _tytChuaNhomDs = [];
function tytMoChuaNhom() {
  const r = _tytLast;
  if (!r) return;
  if (!r.chuaNhom.length) { if (typeof closeModal === 'function') closeModal(); toast('✅ Không còn khoản nào chưa xếp nhóm', 'success'); return; }
  const m = new Map();
  r.chuaNhom.forEach(l => {
    const tien = l.parts.filter(pt => pt.nhom === 0).reduce((s, pt) => s + pt.tien, 0);
    const o = m.get(l.loai) || { loai: l.loai, tien: 0, ls: [] };
    o.tien += tien; o.ls.push({ l, tien });
    m.set(l.loai, o);
  });
  const nut = (fn, arg) => TYT_NHOM_DS.map(n => `<button class="tyt-nh-pk tyt-nh-${n}" onclick="${fn}(${arg}, ${n})" title="Nhóm ${n}: ${x(TYT_NHOM[n].ten)}">${n}</button>`).join('');
  const nhom = [...m.values()].sort((a, b) => b.tien - a.tien);
  _tytChuaNhomDs = nhom.map(o => o.loai);
  _tytModal('<span class="material-symbols-outlined msi-gap">priority_high</span>Khoản Chưa Xếp Nhóm', `
    <div class="text-secondary mb-2" style="font-size:12px">${r.chuaNhom.length} khoản chưa có nhóm. Xếp <b>cả loại</b> (áp cho mọi công trình) hoặc xếp <b>từng khoản</b> (chỉ công trình này).
      <span class="ms-1">${TYT_NHOM_DS.map(n => _tytNhomChip(n, '', true)).join(' ')}</span></div>
    ${nhom.map((o, gi) => `<div class="border rounded mb-2">
      <div class="d-flex align-items-center flex-wrap gap-2 px-2 py-1" style="background:var(--bs-tertiary-bg)">
        <b>${x(o.loai)}</b> <span class="text-secondary" style="font-size:12px">${o.ls.length} khoản · ${fmtM(o.tien)}</span>
        <span class="ms-auto d-flex align-items-center gap-1" style="font-size:12px">Xếp cả loại vào: <span class="tyt-nh-pick">${nut('tytChuaNhomLoai', gi)}</span></span>
      </div>
      <table class="table table-sm align-middle mb-0" style="font-size:12px"><tbody>
        ${o.ls.slice(0, 40).map(({ l, tien }) => `<tr data-lk="${x(l.key)}">
          <td class="text-secondary" style="white-space:nowrap">${fmtISODate(l.ngay)}</td>
          <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(l.nd)}">${x(l.nd || '—')}</td>
          <td class="text-secondary" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x(l.doiTuong || '')}</td>
          <td class="text-end font-monospace" style="white-space:nowrap">${fmtM(tien)}</td>
          <td class="text-end" style="white-space:nowrap"><span class="tyt-nh-pick">${nut('tytChuaNhomKhoan', 'this')}</span></td></tr>`).join('')}
        ${o.ls.length > 40 ? `<tr><td colspan="5" class="text-secondary text-center">… và ${o.ls.length - 40} khoản nữa — xếp cả loại hoặc lọc "Chưa xếp nhóm" ở bảng Tra cứu &amp; gán hàng loạt</td></tr>` : ''}
      </tbody></table></div>`).join('')}`);
}
function tytChuaNhomLoai(gi, n) {
  const loai = _tytChuaNhomDs[gi];
  if (loai === undefined) return;
  const cfg = tytNhomCfg();
  cfg.nhomLoai[tytLoaiKey(loai)] = n;
  tytSaveNhomCfg({ nhomLoai: cfg.nhomLoai });
  toast(`✅ Loại "${loai}" → Nhóm ${n} (áp cho mọi công trình)`, 'success');
  _tytRecalc(); tytMoChuaNhom();
}
function tytChuaNhomKhoan(btn, n) {
  const key = btn?.closest('tr')?.dataset.lk;
  const p = _tytProj();
  if (!key || !p) return;
  const st = tytStructOf(p.id);
  st.nhomTay[key] = n;
  tytSaveStruct(p.id, { nhomTay: st.nhomTay });
  _tytRecalc(); tytMoChuaNhom();
}

// ══ POPUP "⚙ CẤU HÌNH PHÂN NHÓM MẶC ĐỊNH" (dùng chung mọi công trình) ═════════
// 1. Bảng Loại chi phí → Nhóm (+ Trụ cột nếu thuộc Nhóm 1)   2. Bảng Luật từ khóa tự động DUY NHẤT
// Khung popup vẽ 1 lần (giữ chữ đang gõ ở ô thêm luật); 2 bảng vẽ lại bằng _tytCfgFill sau mỗi thay đổi.
let _tytCfgLoaiDs = [];
function tytCfgMo() {
  const opt = n => `<option value="${n}">→ Nhóm ${n} · ${TYT_NHOM[n].ngan}</option>`;
  _tytModal('<span class="material-symbols-outlined msi-gap">settings</span>Cấu Hình Phân Nhóm Mặc Định', `
    <div id="tyt-cfg-box">
      <div class="text-secondary mb-2" style="font-size:12px">Cài 1 lần, dùng cho <b>mọi công trình</b>. Thứ tự xếp 1 khoản chi:
        <b>Gán tay</b> → <b>HĐ thầu phụ</b> → <b>Luật từ khóa</b> (bảng 2) → <b>Loại chi phí</b> (bảng 1). Hóa đơn chi tiết được xếp theo từng món.</div>
      <div class="row g-3">
        <div class="col-12 col-lg-6">
          <div class="qt-lb mb-1">1. Loại chi phí → Nhóm ${_tytHelp('Nhóm mặc định của mỗi loại chi phí. Dòng tô đỏ = chưa xếp nhóm. Cột Trụ cột chỉ có ý nghĩa với Nhóm 1 (dùng cho Kiểm soát định mức). "mặc định" = app tự đoán theo tên loại.')}</div>
          <div class="table-responsive border rounded" style="max-height:440px;overflow-y:auto">
            <table class="table table-sm align-middle mb-0" style="font-size:12px">
              <thead class="table-light" style="position:sticky;top:0;z-index:1"><tr style="font-size:10.5px">
                <th>LOẠI CHI PHÍ</th><th class="text-end">CT NÀY</th><th style="width:140px">NHÓM</th><th style="width:140px">TRỤ CỘT (NHÓM 1)</th>
              </tr></thead>
              <tbody id="tyt-cfg-loai"></tbody>
            </table>
          </div>
        </div>
        <div class="col-12 col-lg-6">
          <div class="qt-lb mb-1">2. Luật từ khóa tự động ${_tytHelp('Xét từ trên xuống, luật đầu tiên khớp sẽ xếp nhóm. Nhiều từ khóa cách nhau bằng dấu phẩy, không phân biệt dấu / hoa thường. Áp cho cả từng món của hóa đơn chi tiết. VD: "ép cọc" → Nhóm 4 · "bồn cầu, đèn" → Nhóm 2 · "thang máy" → Nhóm 3.')}</div>
          <div class="table-responsive border rounded mb-2">
            <table class="table table-sm align-middle mb-0" style="font-size:12px">
              <thead class="table-light"><tr style="font-size:10.5px">
                <th style="width:26px">#</th><th>LOẠI CHỨA</th><th>NỘI DUNG / MÓN / NCC CHỨA</th><th>→ NHÓM</th><th class="text-end">CT NÀY</th><th style="width:56px"></th>
              </tr></thead>
              <tbody id="tyt-cfg-luat"></tbody>
            </table>
          </div>
          <div class="d-flex flex-wrap align-items-center gap-2">
            <input type="text" id="tyt-luat-loai" class="form-control form-control-sm" style="width:150px" placeholder="Loại (trống = mọi loại)" list="tyt-luat-dl">
            <datalist id="tyt-luat-dl"></datalist>
            <input type="text" id="tyt-luat-tk" class="form-control form-control-sm" style="flex:1 1 160px" placeholder="Từ khóa: bồn cầu, đèn led">
            <select id="tyt-luat-nhom" class="form-select form-select-sm" style="width:auto">${TYT_NHOM_DS.map(opt).join('')}</select>
            <button class="btn btn-sm btn-primary fw-bold" onclick="tytLuatAdd()"><span class="material-symbols-outlined msi-gap">add</span>Thêm</button>
          </div>
          <div class="text-end mt-2">
            <button class="btn btn-sm btn-outline-secondary" onclick="tytLuatMacDinh()" title="Thay toàn bộ luật bằng bộ luật mặc định">Khôi phục luật mặc định</button>
          </div>
        </div>
      </div>
    </div>`);
  _tytCfgFill();
}

// Vẽ 2 bảng trong popup cấu hình (bỏ qua nếu popup không mở)
function _tytCfgFill() {
  if (!_tytModalCo('tyt-cfg-box')) return;
  const cfg = tytNhomCfg();
  const r = _tytLast;
  // Danh sách loại: danh mục + loại đang có ở CT đang chọn
  const tienCT = new Map();
  (r ? r.lines : []).forEach(l => tienCT.set(l.loai, (tienCT.get(l.loai) || 0) + l.tien));
  const ds = new Map();
  ((typeof cats !== 'undefined' && cats && Array.isArray(cats.loaiChiPhi)) ? cats.loaiChiPhi : []).forEach(n => { if (n) ds.set(tytLoaiKey(n), n); });
  [TYT_LOAI_UNG_TP, ...tienCT.keys()].forEach(n => { if (!ds.has(tytLoaiKey(n))) ds.set(tytLoaiKey(n), n); });
  const list = [...ds.values()].sort((a, b) => ((tienCT.get(b) || 0) - (tienCT.get(a) || 0)) || a.localeCompare(b, 'vi'));
  _tytCfgLoaiDs = list;
  const tl = document.getElementById('tyt-cfg-loai');
  if (tl) tl.innerHTML = list.map((n, i) => {
    const m = tytNhomCuaLoai(n, cfg);
    const t = tytTruCuaLoai(n, cfg);
    return `<tr class="${m.nhom === 0 ? 'table-danger' : ''}">
      <td><span class="tyt-nh-dot tyt-nh-${m.nhom}"></span>${x(n)}</td>
      <td class="text-end font-monospace text-secondary" style="white-space:nowrap">${tienCT.get(n) ? fmtM(tienCT.get(n)) : ''}</td>
      <td><select class="form-select form-select-sm py-0" onchange="tytNhomLoaiSet(${i}, this.value)">
        ${[1, 2, 3, 4, 0].map(k => `<option value="${k}"${m.nhom === k ? ' selected' : ''}>${k ? k + ' · ' + TYT_NHOM[k].ngan : 'Chưa xếp'}</option>`).join('')}
      </select>${m.src === 'macdinh' ? '<div class="tyt-cay-note">mặc định</div>' : ''}</td>
      <td style="${m.nhom === 1 ? '' : 'opacity:.4'}"><select class="form-select form-select-sm py-0${m.nhom === 1 && !t.tru ? ' border-danger' : ''}" onchange="tytTruLoaiSet(${i}, this.value)">
        ${TYT_TRU_THU_TU.map(k => `<option value="${k}"${t.tru === k ? ' selected' : ''}>${k ? TYT_TRU[k].ten : '— Chưa xếp —'}</option>`).join('')}
      </select></td>
    </tr>`;
  }).join('');
  const dl = document.getElementById('tyt-luat-dl');
  if (dl) dl.innerHTML = list.map(n => `<option value="${x(n)}">`).join('');

  // Luật: đếm số món / tiền luật đang nhận ở CT đang chọn
  const nhan = new Map();
  (r ? r.lines : []).forEach(l => l.parts.forEach(pt => {
    if (pt.nhomSrc !== 'luat') return;
    const o = nhan.get(pt.nhomRef) || { n: 0, tien: 0 };
    o.n++; o.tien += pt.tien; nhan.set(pt.nhomRef, o);
  }));
  const tb = document.getElementById('tyt-cfg-luat');
  if (tb) tb.innerHTML = cfg.nhomLuat.length ? cfg.nhomLuat.map((lu, i) => {
    const o = nhan.get(lu.id) || { n: 0, tien: 0 };
    return `<tr>
      <td class="text-secondary">${i + 1}</td>
      <td>${lu.loai ? x(lu.loai) : '<span class="text-secondary">mọi loại</span>'}</td>
      <td>"${x(lu.tuKhoa)}"</td>
      <td>${_tytNhomChip(_tytNhomHopLe(lu.nhom), '', true)}</td>
      <td class="text-end font-monospace" style="white-space:nowrap">${o.n ? `${o.n} · ${fmtM(o.tien)}` : '<span class="text-secondary">0</span>'}</td>
      <td class="text-end" style="white-space:nowrap">
        <button type="button" class="btn btn-link btn-sm p-0 text-secondary" title="Ưu tiên lên trên" onclick="tytLuatMove('${x(lu.id)}',-1)" ${i === 0 ? 'disabled' : ''}><span class="material-symbols-outlined" style="font-size:17px">arrow_upward</span></button>
        <button type="button" class="btn btn-link btn-sm p-0 text-danger" title="Xóa luật" onclick="tytLuatDel('${x(lu.id)}')"><span class="material-symbols-outlined" style="font-size:17px">delete</span></button>
      </td></tr>`;
  }).join('') : '<tr><td colspan="6" class="text-secondary text-center py-2">Chưa có luật.</td></tr>';
}

// Sau khi đổi cấu hình: tính lại CT đang chọn (nếu có) + vẽ lại popup
function _tytSauCfg() {
  if (_tytProj()) _tytRecalc(); else _tytCfgFill();
}
function tytNhomLoaiSet(i, v) {
  const n = _tytCfgLoaiDs[i];
  if (n === undefined) return;
  const cfg = tytNhomCfg();
  cfg.nhomLoai[tytLoaiKey(n)] = +v;
  tytSaveNhomCfg({ nhomLoai: cfg.nhomLoai });
  toast(`✅ "${n}" → ${+v ? 'Nhóm ' + v : 'Chưa xếp'} (áp cho mọi công trình)`, 'success');
  _tytSauCfg();
}
function tytTruLoaiSet(i, v) {
  const n = _tytCfgLoaiDs[i];
  if (n === undefined) return;
  const cfg = tytNhomCfg();
  cfg.truLoai[tytLoaiKey(n)] = v;
  tytSaveNhomCfg({ truLoai: cfg.truLoai });
  toast(`✅ "${n}" → trụ cột ${TYT_TRU[v] ? TYT_TRU[v].ten : ''} (áp cho mọi công trình)`, 'success');
  _tytSauCfg();
}
function tytLuatAdd() {
  const loai = (document.getElementById('tyt-luat-loai')?.value || '').trim();
  const tkEl = document.getElementById('tyt-luat-tk');
  const tk = (tkEl?.value || '').trim();
  const nhom = +(document.getElementById('tyt-luat-nhom')?.value || 1);
  if (!tk) { toast('Nhập từ khóa cho luật!', 'error'); tkEl?.focus(); return; }
  const cfg = tytNhomCfg();
  cfg.nhomLuat.push({ id: tytNewId('q'), loai, tuKhoa: tk, nhom });
  tytSaveNhomCfg({ nhomLuat: cfg.nhomLuat });
  if (tkEl) tkEl.value = '';
  toast(`✅ Đã thêm luật "${tk}" → Nhóm ${nhom} (áp cho mọi công trình)`, 'success');
  _tytSauCfg();
}
function tytLuatDel(id) {
  const cfg = tytNhomCfg();
  const lu = cfg.nhomLuat.find(z => z.id === id);
  if (!lu || !confirm(`Xóa luật "${lu.tuKhoa}" → Nhóm ${lu.nhom}?\n(Áp dụng cho mọi công trình)`)) return;
  tytSaveNhomCfg({ nhomLuat: cfg.nhomLuat.filter(z => z.id !== id) });
  _tytSauCfg();
}
function tytLuatMove(id, dir) {
  const cfg = tytNhomCfg();
  const a = cfg.nhomLuat, i = a.findIndex(z => z.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]];
  tytSaveNhomCfg({ nhomLuat: a });
  _tytSauCfg();
}
function tytLuatMacDinh() {
  if (!confirm('Thay TOÀN BỘ luật từ khóa hiện tại bằng bộ luật mặc định?\n(Áp dụng cho mọi công trình — bảng Loại → Nhóm giữ nguyên)')) return;
  tytSaveNhomCfg({ nhomLuat: TYT_NHOM_LUAT_MAC_DINH.map(l => ({ id: tytNewId('q'), ...l })) });
  _tytSauCfg();
}

// ══ GÁN NHÓM THEO HỢP ĐỒNG THẦU PHỤ ══════════════════════════════
function _tytRenderHdtp(r) {
  const tb = document.getElementById('tyt-hdtp-tbody');
  if (!tb) return;
  const st = r.st, ds = r.ctx.hdtp;
  if (!ds.length) {
    tb.innerHTML = '<tr><td colspan="3" class="text-secondary text-center py-2" style="font-size:12px">Công trình chưa có hợp đồng thầu phụ (tab Công Nợ → Hợp đồng thầu phụ).</td></tr>';
    return;
  }
  const tk = tytHdtpThongKe(r);
  const md = tytNhomCuaLoai(TYT_LOAI_UNG_TP, r.cfg).nhom;   // nhóm mặc định theo loại "Thầu Phụ"
  tb.innerHTML = ds.map(h => {
    const o = tk.get(h.id) || { soKhoan: 0, tien: 0, nhan: 0 };
    const cur = st.theoHdtp[h.id] ? +st.theoHdtp[h.id].nhom : 0;
    return `<tr>
      <td><div class="fw-semibold">${cur ? `<span class="tyt-nh-dot tyt-nh-${cur}"></span>` : ''}${x(h.ten || '—')}</div>
        <div class="text-secondary text-truncate" style="font-size:10.5px;max-width:200px" title="${x(h.nd)}">HĐ ${fmtM(h.giaTri)}${h.nd ? ' · ' + x(h.nd) : ''}</div></td>
      <td class="text-end font-monospace" style="white-space:nowrap">${fmtM(o.tien)}<div class="text-secondary" style="font-size:10.5px">${o.soKhoan} khoản</div></td>
      <td><select class="form-select form-select-sm" onchange="tytHdtpSetNhom('${x(h.id)}', this.value)">
          <option value="0">Theo loại chi phí${md ? ' (Nhóm ' + md + ')' : ''}</option>
          ${TYT_NHOM_DS.map(n => `<option value="${n}"${cur === n ? ' selected' : ''}>Nhóm ${n} · ${TYT_NHOM[n].ngan}</option>`).join('')}
        </select>
        ${cur && o.nhan < o.soKhoan ? `<div class="text-secondary" style="font-size:10.5px">${o.soKhoan - o.nhan} khoản đã gán tay nhóm khác</div>` : ''}</td>
    </tr>`;
  }).join('');
}

function tytHdtpSetNhom(id, v) {
  const p = _tytProj();
  if (!p) return;
  const st = tytStructOf(p.id);
  if (+v) st.theoHdtp[id] = { nhom: +v }; else delete st.theoHdtp[id];
  tytSaveStruct(p.id, { theoHdtp: st.theoHdtp });
  toast(+v ? `✅ HĐ thầu phụ → Nhóm ${v}: ${TYT_NHOM[+v].ten}` : 'HĐ thầu phụ: nhóm theo loại chi phí', 'success');
  _tytRecalc();
}

// ══ TRA CỨU & GÁN NHÓM HÀNG LOẠT ═════════════════════════════════
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
  const nhom = document.getElementById('tyt-pb-nhom')?.value ?? '';
  const src  = document.getElementById('tyt-pb-src')?.value || '';
  const loai = document.getElementById('tyt-pb-loai')?.value || '';
  const q    = _tytBoDau(document.getElementById('tyt-pb-q')?.value || '');
  return _tytLast.lines.filter(l => {
    if (nhom !== '' && !l.parts.some(pt => pt.nhom === +nhom)) return false;
    if (src && !l.parts.some(pt => pt.nhomSrc === src || (src === 'loai' && pt.nhomSrc === 'macdinh'))) return false;
    if (loai && l.loai !== loai) return false;
    if (q && !_tytBoDau(`${l.nd} ${l.doiTuong} ${l.loai} ${(l.items || []).map(it => it.ten || '').join(' ')}`).includes(q)) return false;
    return true;
  });
}

// Đổi bộ lọc → về trang 1, bỏ chọn (tránh gán nhầm dòng không còn nhìn thấy)
function tytPbFilter() {
  _tytPbSel.clear();
  tytRenderPb(0);
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
    tb.innerHTML = '<tr><td colspan="7" class="text-center text-secondary py-4">Không có khoản chi nào khớp bộ lọc</td></tr>';
  } else {
    tb.innerHTML = slice.map(l => {
      const k = x(l.key);
      const on = _tytPbSel.has(l.key);
      const kindTxt = _TYT_KIND_TXT[l.kind] ? `<span class="badge text-bg-secondary bg-opacity-25 text-secondary-emphasis ms-1" style="font-size:9.5px">${_TYT_KIND_TXT[l.kind]}</span>` : '';
      const tay = l.parts.some(pt => pt.nhomSrc === 'tay') ? ' <span class="tyt-cay-note" title="Đã gán tay">✋</span>' : '';
      return `<tr style="${on ? 'background:var(--bs-primary-bg-subtle)' : ''}">
        <td class="text-center"><input type="checkbox" class="form-check-input" data-k="${k}" ${on ? 'checked' : ''} onchange="tytPbToggle(this)"></td>
        <td class="text-secondary" style="white-space:nowrap;font-size:12px">${fmtISODate(l.ngay)}</td>
        <td style="white-space:nowrap">${x(l.loai)}${kindTxt}</td>
        <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(l.nd)}">${x(l.nd || '—')}</td>
        <td class="text-secondary" style="max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(l.doiTuong)}">${x(l.doiTuong || '—')}</td>
        <td class="text-end font-monospace fw-semibold" style="white-space:nowrap">${fmtM(l.tien)}</td>
        <td style="white-space:nowrap">${_tytNhomChipLine(l)}${tay}</td>
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

// Gán tay NHÓM cho các dòng đang tick (n = 0 → bỏ gán tay, trả về tự động)
function tytPbGan(n) {
  const p = _tytProj();
  if (!p) return;
  if (!_tytPbSel.size) { toast('Chưa tick khoản chi nào!', 'error'); return; }
  const st = tytStructOf(p.id);
  let dem = 0;
  _tytPbSel.forEach(k => {
    if (n) { st.nhomTay[k] = n; dem++; }
    else if (st.nhomTay[k]) { delete st.nhomTay[k]; dem++; }
  });
  if (!dem) { toast('Các dòng đã chọn không có gán tay nào', 'info'); return; }
  tytSaveStruct(p.id, { nhomTay: st.nhomTay });
  _tytPbSel.clear();
  toast(n ? `✅ Đã gán ${dem} khoản vào Nhóm ${n}: ${TYT_NHOM[n].ten}` : `Đã trả ${dem} khoản về tự động xếp nhóm`, 'success');
  _tytRecalc();
}

// ══ KIỂM SOÁT ĐỊNH MỨC NHÓM 1 (tab con 2) ═══════════════════════════════
// • Bảng kiểm soát (#tyt-dt-*): 4 trụ cột Nhóm 1 + Quỹ phụ phí — ngân sách = diện tích × định mức đ/m2,
//   so với thực tế CT đang chọn; CHỈ tô đỏ khi vượt (quản trị ngoại lệ). Bấm [+] xem loại chi phí trong trụ cột.
// • Bộ định mức mẫu (#tyt-dm-*): lưu từ CT · nhập tay 4 trụ cột (định mức an toàn) · sửa · cập nhật lại từ CT nguồn · xóa.
let _tytDtDm = '';             // id định mức đang chọn ở bảng Kiểm soát
const _tytKsOpen = new Set();  // trụ cột đang bung xem loại chi phí

function _tytRenderDm(r) {
  const p = _tytProj();
  // Ghi chú điều kiện lưu định mức
  const note = document.getElementById('tyt-dm-note');
  if (note && p) {
    const ws = [];
    if (!(r.tongSan > 0)) ws.push('<span class="text-danger">✗ Chưa có tổng diện tích sàn — bấm thẻ "Tổng diện tích sàn" để nhập.</span>');
    if (p.status !== 'closed') ws.push('<span class="text-warning-emphasis">⚠ Công trình chưa quyết toán — đơn giá có thể chưa đủ.</span>');
    if (!r.allYears && tytNhanNam() !== 'Tất cả năm') ws.push(`<span class="text-warning-emphasis">⚠ Đang lọc năm ${x(tytNhanNam())} — bật "Trọn vòng đời" để lấy đủ chi phí.</span>`);
    if (r.theoNhom[0] > 0) ws.push(`<span class="text-warning-emphasis">⚠ Còn ${fmtM(r.theoNhom[0])} chưa xếp nhóm.</span>`);
    if (r.theoTru[''] > 0) ws.push(`<span class="text-warning-emphasis">⚠ Còn ${fmtM(r.theoTru[''])} Nhóm 1 chưa xếp trụ cột (nút ⚙ Cấu hình phân nhóm).</span>`);
    if (r.tongSan > 0) ws.unshift(`Sẽ lưu: <b>Nhóm 1 ${fmtM(Math.round(r.cpM2N1))}/m2</b> (toàn bộ ${fmtM(Math.round(r.cpM2))}/m2, sàn ${tytFmtM2(r.tongSan)} m2).`);
    note.innerHTML = ws.map(w => `<div>${w}</div>`).join('');
  }
  const tenEl = document.getElementById('tyt-dm-ten');
  if (tenEl && p && tenEl.dataset.pid !== p.id) { tenEl.value = 'Định mức — ' + p.name; tenEl.dataset.pid = p.id; }

  // Danh sách định mức: Nhóm 1 đ/m2 là số chính, 4 trụ cột ghi nhỏ bên dưới
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
            : '<div class="text-warning-emphasis" style="font-size:10.5px">⚠ Chưa có số 4 trụ cột — bấm ✎ để cập nhật</div>'}</td>
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
    sel.innerHTML = list.length ? list.map(dm => `<option value="${dm.id}">${x(dm.ten)}${dm.dgRo1 ? ' — Nhóm 1 ' + fmtM(dm.dgRo1) + '/m2' : ''}</option>`).join('')
      : '<option value="">(Chưa có định mức)</option>';
    sel.value = _tytDtDm;
  }
  // Ô diện tích: tự theo tổng sàn CT đang chọn cho tới khi người dùng TỰ GÕ số khác (dataset.user = '1');
  // đổi công trình hoặc bấm "↺ Sàn CT" → quay lại tự theo.
  const el = document.getElementById('tyt-dt-dt');
  if (el) {
    if (el.dataset.pid !== (p && p.id)) el.dataset.user = '';
    if (el.dataset.user !== '1') el.value = r && r.tongSan > 0 ? Math.round(r.tongSan * 100) / 100 : '';
    el.dataset.pid = p ? p.id : '';
  }
  tytRenderKiemSoat();
}

function tytDmLuu() {
  const p = _tytProj(), r = _tytLast;
  if (!p || !r) return;
  if (!(r.tongSan > 0)) { toast('Chưa có tổng diện tích sàn — bấm thẻ "Tổng diện tích sàn" để nhập bảng M2!', 'error'); return; }
  if (!r.tongChi) { toast('Công trình chưa có chi phí!', 'error'); return; }
  const canhBao = [];
  if (p.status !== 'closed') canhBao.push('• Công trình CHƯA quyết toán');
  if (!r.allYears && tytNhanNam() !== 'Tất cả năm') canhBao.push(`• Đang lọc năm ${tytNhanNam()} (chưa phải trọn vòng đời)`);
  if (r.theoNhom[0] > 0) canhBao.push(`• Còn ${fmtM(r.theoNhom[0])} chưa xếp nhóm`);
  if (canhBao.length && !confirm('Lưu định mức dù:\n' + canhBao.join('\n') + '\n\nVẫn lưu?')) return;
  const ten = document.getElementById('tyt-dm-ten')?.value || '';
  const rec = tytTaoDinhMuc(p, r, ten);
  _tytDtDm = rec.id;
  toast(`✅ Đã lưu định mức "${rec.ten}" — Nhóm 1 ${fmtM(rec.dgRo1)}/m2`, 'success');
  _tytRenderDm(r);
}
function tytDmDung(id) {
  _tytDtDm = id;
  if (_tytLast) _tytRenderDm(_tytLast);
}

// Popup SỬA định mức (id = '' → TẠO định mức nhập tay): tên + đ/m2 của 4 trụ cột Nhóm 1.
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
  _tytModal(`<span class="material-symbols-outlined msi-gap">${dm ? 'edit' : 'edit_note'}</span>${dm ? 'Sửa Bộ Định Mức' : 'Nhập Tay Định Mức An Toàn'}`, `
    <div class="mb-2"><label class="form-label mb-0" style="font-size:12px">Tên bộ định mức</label>
      <input type="text" class="form-control form-control-sm" id="tyt-dms-ten" value="${x(dm ? dm.ten : 'Định mức an toàn')}"></div>
    <div class="row g-2 mb-2">${o}</div>
    <div class="text-secondary mb-2" style="font-size:11.5px">Quỹ phụ phí dùng <b>mức chung</b> (đang là ${fmtM(tytNhomCfg().quyMuc)} đ/m2) — chỉnh ngay dưới bảng Kiểm soát.${dm && !dm.nhapTay ? ' Sửa số ở đây sẽ ghi đè số tính từ CT nguồn.' : ''}</div>
    <div class="d-flex flex-wrap gap-2 justify-content-end">
      ${dm && dm.nguonPid ? `<button class="btn btn-sm btn-outline-primary me-auto" onclick="tytDmCapNhat('${dm.id}')" ${p ? '' : 'disabled title="Không còn công trình nguồn"'}><span class="material-symbols-outlined msi-gap">sync</span>Cập nhật lại từ ${x(p ? p.name : 'CT nguồn')}</button>` : ''}
      <button class="btn btn-sm btn-secondary" onclick="closeModal()">Hủy</button>
      <button class="btn btn-sm btn-success fw-bold" onclick="tytDmSuaLuu('${dm ? dm.id : ''}')"><span class="material-symbols-outlined msi-gap">save</span>Lưu</button>
    </div>`);
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
  if (!confirm(`Cập nhật "${dm.ten}" theo số liệu hiện tại của ${p.name}?\nNhóm 1: ${fmtM(Math.round(r.cpM2N1))}/m2 · toàn bộ: ${fmtM(Math.round(r.cpM2))}/m2\n(Số nhập tay của 4 trụ cột sẽ bị thay)`)) return;
  tytCapNhatDinhMuc(id, p, r);
  toast('✅ Đã cập nhật định mức từ ' + p.name, 'success');
  if (typeof closeModal === 'function') closeModal();
  if (_tytLast) _tytRenderDm(_tytLast);
}
function tytDmXoa(id) {
  const dm = tytDinhMucById(id);
  if (!dm || !confirm(`Xóa bộ định mức "${dm.ten}"?`)) return;
  tytXoaDinhMuc(id);
  toast('Đã xóa định mức', 'success');
  if (_tytLast) _tytRenderDm(_tytLast);
}
function tytDtLaySan() {
  const el = document.getElementById('tyt-dt-dt');
  if (el && _tytLast) { el.value = _tytLast.tongSan > 0 ? Math.round(_tytLast.tongSan * 100) / 100 : ''; el.dataset.user = ''; }
  tytRenderKiemSoat();
}
// Mức Quỹ phụ phí dùng chung (đ/m2)
function tytQuyMucSet(v) {
  const n = Math.max(0, Math.round(tytKlNum(v)));
  tytSaveNhomCfg({ quyMuc: n });
  toast(`✅ Mức Quỹ phụ phí = ${fmtM(n)} đ/m2 (dùng chung mọi công trình)`, 'success');
  _tytRecalc();
}
function tytKsToggle(k) {
  if (_tytKsOpen.has(k)) _tytKsOpen.delete(k); else _tytKsOpen.add(k);
  tytRenderKiemSoat();
}

// Bảng KIỂM SOÁT NHÓM 1 của CT đang chọn
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
  if (!tytDmCoRo1(dm)) return trong(`Bộ định mức "${x(dm.ten)}" chưa có số 4 trụ cột.<br>
    <button class="btn btn-sm btn-outline-primary mt-2" onclick="tytDmSua('${dm.id}')"><span class="material-symbols-outlined msi-gap">edit</span>Cập nhật / nhập số trụ cột</button>`);

  const ks = tytKiemSoat(dm, dt, r);
  const pctCell = (pct, vuot) => {
    if (pct === Infinity) return '<td class="text-end text-danger fw-bold">ngoài ĐM</td>';
    return `<td class="text-end font-monospace ${vuot ? 'tyt-dt-vuot' : ''}" style="white-space:nowrap"><div>${pct.toFixed(1).replace('.', ',')}%</div>
      <div class="tyt-bar"><span style="width:${Math.min(100, pct).toFixed(1)}%"></span></div></td>`;
  };
  // Chỉ báo đỏ khi VƯỢT; còn trong ngân sách → chữ thường (không xanh / vàng — quản trị ngoại lệ)
  const conLai = (v, vuot) => Math.abs(v) < 1000 ? '<td class="text-end font-monospace text-secondary">≈ 0</td>'
    : `<td class="text-end font-monospace ${vuot ? 'text-danger fw-bold' : ''}" style="white-space:nowrap">${vuot ? 'Vượt ' + fmtM(-v) : 'Dư ' + fmtM(v)}</td>`;
  const m2 = v => r.tongSan > 0 ? fmtM(Math.round(v / r.tongSan)) : '—';
  let html = '';
  ks.rows.forEach(o => {
    const kk = o.k || 'x';
    const open = _tytKsOpen.has(kk);
    const tg = o.loais.length
      ? `<button type="button" class="tyt-cay-tg" onclick="tytKsToggle('${kk}')" title="${open ? 'Thu gọn' : 'Xem loại chi phí'}"><span class="material-symbols-outlined">${open ? 'remove' : 'add'}</span></button>`
      : '<span class="tyt-cay-tg-sp"></span>';
    html += `<tr class="${o.vuot ? 'tyt-ks-vuot' : ''}">
      <td><div class="tyt-cay-name">${tg}<span><span class="tyt-tru tyt-tru-${kk}"></span><b title="${x(TYT_TRU[o.k].mo)}">${x(o.ten)}</b>${o.k === 'quy' ? ' <span class="tyt-cay-note">mức trần chung</span>' : ''}
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
      <td>TỔNG NHÓM 1</td><td class="text-end font-monospace">${fmtM(ks.tong.dg)}</td>
      <td class="text-end font-monospace">${fmtM(ks.tong.ns)}</td><td class="text-end font-monospace">${fmtM(ks.tong.tt)}</td>
      <td class="text-end font-monospace">${m2(ks.tong.tt)}</td>
      ${conLai(ks.tong.conLai, ks.tong.vuot)}${pctCell(ks.tong.pct, ks.tong.vuot)}</tr>`;
  if (kpi) {
    const cell = (lb, val, cls, sub) => `<div class="col-4"><div class="qt-sum-cell h-100"><div class="qt-sum-lb">${lb}</div>
      <div class="qt-sum-val ${cls}">${val}</div><div class="qt-sum-sub">${sub || ''}</div></div></div>`;
    kpi.innerHTML = cell('Ngân sách Nhóm 1', fmtM(ks.tong.ns), 'text-primary', `${tytFmtM2(dt)} m2 × ${fmtM(ks.tong.dg)}`) +
      cell('Thực tế Nhóm 1', fmtM(ks.tong.tt), '', r.tongSan > 0 ? m2(ks.tong.tt) + '/m2' : '') +
      cell(ks.tong.vuot ? 'Đã vượt' : 'Còn dư', fmtM(Math.abs(ks.tong.conLai)), ks.tong.vuot ? 'text-danger' : '',
        ks.soVuot ? `<span class="text-danger fw-semibold">${ks.soVuot} dòng vượt định mức</span>` : 'Chưa dòng nào vượt');
  }
  setBadge(ks.soVuot);
}

// ══ SO SÁNH CÔNG TRÌNH (tab con 3) ═══════════════════════════════════
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
  // Vòng đời → mọi công trình; theo năm → CT thuộc năm đang lọc.
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
  // Chỉ Nhóm 1: 4 trụ cột → loại chi phí, % so với tổng Nhóm 1.
  // Mặc định: cả 4 Nhóm — Nhóm 1 tách theo trụ cột, Nhóm 2-4 tách theo loại chi phí, % so với tổng chi.
  const n1 = !!document.getElementById('tyt-ss-n1')?.checked;
  const { cots } = tytSoSanh(projs, _tytOpts());
  const tongCT = c => n1 ? c.r.theoNhom[1] : c.r.tongChi;
  const conv = (c, t) => {
    if (che === 'tien') return t;
    if (che === 'pct') return tongCT(c) ? t / tongCT(c) * 100 : null;
    return c.r.tongSan > 0 ? t / c.r.tongSan : null;
  };
  const fmt = v => v === null || v === undefined ? '—' : (che === 'pct' ? v.toFixed(1).replace('.', ',') + '%' : fmtM(Math.round(v)));
  const fm2 = v => v === null ? '—' : fmtM(Math.round(v));
  // Tiền từng CT theo "nhóm|loại" và "trụ|loại" (Nhóm 1)
  cots.forEach(c => {
    c.nl = {}; c.tl = {};
    c.r.lines.forEach(l => l.parts.forEach(pt => {
      const k = pt.nhom + '|' + l.loai;
      c.nl[k] = (c.nl[k] || 0) + pt.tien;
      if (pt.nhom === 1) { const kt = pt.tru + '|' + l.loai; c.tl[kt] = (c.tl[kt] || 0) + pt.tien; }
    }));
  });
  // Các khóa con của 1 nhánh, sắp theo tổng tiền mọi CT giảm dần
  const conCua = (map, prefix) => {
    const tong = new Map();
    cots.forEach(c => Object.keys(c[map]).forEach(k => { if (k.startsWith(prefix)) tong.set(k, (tong.get(k) || 0) + c[map][k]); }));
    return [...tong.keys()].sort((a, b) => tong.get(b) - tong.get(a));
  };
  // Hàng: [nhãn, giá trị từng CT, định dạng, có tô min/max không, class]
  const hang = [
    ['Tổng diện tích sàn (m2)', cots.map(c => c.r.tongSan > 0 ? c.r.tongSan : null), v => v === null ? '—' : tytFmtM2(v), false, 'tyt-ss-info'],
    [n1 ? 'Tổng chi phí Nhóm 1' : 'Tổng chi phí', cots.map(c => tongCT(c)), v => fmtM(v), false, 'tyt-ss-info'],
    ['ĐƠN GIÁ THÔ & NC / M2', cots.map(c => c.r.tongSan > 0 ? c.r.cpM2N1 : null), fm2, true, 'tyt-ss-key'],
  ];
  if (!n1) hang.push(['ĐƠN GIÁ TOÀN BỘ CT / M2', cots.map(c => c.r.tongSan > 0 ? c.r.cpM2 : null), fm2, true, 'tyt-ss-key']);
  const truRows = (cls, sub) => TYT_TRU_THU_TU.forEach(t => {
    if (!cots.some(c => c.r.theoTru[t] > 0)) return;
    hang.push([(sub ? '└ ' : '') + TYT_TRU[t].ten.toUpperCase(), cots.map(c => conv(c, c.r.theoTru[t] || 0)), fmt, true, cls]);
    if (!sub) conCua('tl', t + '|').forEach(k => hang.push(['└ ' + k.slice(t.length + 1), cots.map(c => conv(c, c.tl[k] || 0)), fmt, true, 'tyt-ss-sub']));
  });
  if (n1) truRows('tyt-ss-tru', false);
  else {
    [1, 2, 3, 4, 0].forEach(n => {
      if (!cots.some(c => c.r.theoNhom[n] > 0)) return;
      hang.push([(n ? n + '. ' : '') + TYT_NHOM[n].ten.toUpperCase(), cots.map(c => conv(c, c.r.theoNhom[n] || 0)), fmt, true, 'tyt-ss-tru tyt-ss-nh tyt-nh-' + n]);
      if (n === 1) truRows('tyt-ss-sub', true);
      else conCua('nl', n + '|').forEach(k => hang.push(['└ ' + k.slice(String(n).length + 1), cots.map(c => conv(c, c.nl[k] || 0)), fmt, true, 'tyt-ss-sub']));
    });
  }
  const tdVals = (vals, f, hl) => {
    const nums = vals.filter(v => v !== null && v !== undefined && v > 0);
    const mx = nums.length >= 2 ? Math.max(...nums) : null, mn = nums.length >= 2 ? Math.min(...nums) : null;
    const tb = nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null;
    return vals.map(v => {
      const cls = hl && mx !== mn && v === mx ? 'tyt-ss-max' : (hl && mx !== mn && v === mn ? 'tyt-ss-min' : '');
      // CT không có khoản này → "—" (không tính vào cao/thấp nhất & trung bình)
      if (v === 0) return '<td class="text-end text-secondary" title="Công trình không có khoản này">—</td>';
      return `<td class="text-end font-monospace ${cls}" style="white-space:nowrap">${f(v)}</td>`;
    }).join('') + `<td class="text-end font-monospace tyt-ss-avg" style="white-space:nowrap">${tb === null ? '—' : f(tb)}</td>`;
  };
  tbl.innerHTML = `<thead class="table-light"><tr>
      <th style="min-width:180px">Chỉ tiêu ${che === 'm2' ? '(đ / m2 sàn)' : che === 'pct' ? (n1 ? '(% tổng Nhóm 1)' : '(% tổng chi)') : '(tổng tiền)'}${n1 ? ' · ' + _tytNhomChip(1, '', true) : ''}</th>
      ${cots.map(c => `<th class="text-end tyt-ss-th" title="${x(c.p.name)}">${x(c.p.name)}<div class="fw-normal text-secondary" style="font-size:10.5px">năm ${tytNamCT(c.p)}${c.p.status === 'closed' || c.p.status === 'completed' ? '' : ' · đang làm'}</div></th>`).join('')}
      <th class="text-end">Trung bình</th></tr></thead>
    <tbody>${hang.map(([lb, vals, f, hl, cls]) => `<tr class="${cls}"><td>${x(lb)}</td>${tdVals(vals, f, hl)}</tr>`).join('')}</tbody>`;
  _tytSsLast = { che, n1, ten: cots.map(c => c.p.name), hang };
}

// Xuất bảng so sánh ra Excel (SheetJS — đã nạp ở index.html cho tab Nhập/Xuất)
function tytSsExcel() {
  if (!_tytSsLast) { toast('Chưa có dữ liệu so sánh', 'error'); return; }
  if (typeof XLSX === 'undefined') { toast('Chưa tải được thư viện Excel — kiểm tra mạng', 'error'); return; }
  const d = _tytSsLast;
  const donVi = d.che === 'm2' ? 'đ/m2 sàn' : d.che === 'pct' ? (d.n1 ? '% tổng Nhóm 1' : '% tổng chi') : 'đồng';
  const aoa = [[`So sánh tỷ trọng chi phí ${d.n1 ? 'NHÓM 1 ' : 'theo 4 nhóm '}(${donVi}) — ${_tytAllYears ? 'trọn vòng đời công trình' : 'năm ' + tytNhanNam()}`], [], ['Chỉ tiêu', ...d.ten, 'Trung bình']];
  d.hang.forEach(([lb, vals]) => {
    const nums = vals.filter(v => v !== null && v !== undefined && v > 0);
    const tb = nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null;
    const r2 = v => v === null || v === undefined ? '' : Math.round(v * 100) / 100;
    aoa.push([lb, ...vals.map(r2), r2(tb)]);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 34 }, ...d.ten.map(() => ({ wch: 18 })), { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'SoSanh');
  XLSX.writeFile(wb, `so-sanh-ty-trong_${today()}.xlsx`);
}

// ══ XU HƯỚNG & BIẾN ĐỘNG (tab con 3 — 07/10/2026 — Cải tiến Phần C) ═══════════════════
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

// ── XU HƯỚNG đ/m2 NHÓM 1 THEO NĂM ──
const _TYT_XH_SR = [
  { k: 'sat', ten: 'Sắt thép', mau: '#495057' }, { k: 'bt', ten: 'Bê tông & VL thô', mau: '#0d6efd' }, { k: 'nc', ten: 'Nhân công', mau: '#fd7e14' },
  { k: 'tp', ten: 'Thầu phụ thô & phụ trợ', mau: '#6f42c1' }, { k: 'quy', ten: 'Quỹ phụ phí', mau: '#20c997' }, { k: 'n1', ten: 'Tổng Nhóm 1', mau: '#198754' },
];
const _tytXhAn = new Set(['sat', 'bt', 'nc', 'tp', 'quy']);   // mặc định: đường đơn giá Thô & NC bình quân (bấm chú thích để xem từng trụ cột)
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
  const thieuHtml = thieu.length ? `<div class="tyt-uutien mt-2" style="font-size:11.5px"><b>${thieu.length} công trình xây mới chưa có bảng M2</b> nên chưa lên biểu đồ — bấm tên để nhập M2: ${
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
  const cot = ['n1', 'sat', 'bt', 'nc', 'tp', 'quy'];
  const ten = { n1: 'Thô & NC', sat: 'Sắt thép', bt: 'Bê tông', nc: 'Nhân công', tp: 'TP thô', quy: 'Quỹ PP' };
  const rows = xh.nams.map(n => `<tr>
      <td class="fw-semibold">${n.nam}</td>
      <td class="text-end">${n.soCT}${n.dangLam ? ` <span class="text-secondary" style="font-size:10.5px">(${n.dangLam} đang làm)</span>` : ''}</td>
      <td class="text-end font-monospace">${tytFmtM2(n.san)}</td>
      ${cot.map(k => `<td class="text-end font-monospace${k === 'n1' ? ' fw-bold' : ''}" style="white-space:nowrap">${fmtM(Math.round(n.m2[k]))}</td>`).join('')}
    </tr>`).join('');
  const dbRow = coDb ? `<tr class="tyt-xh-db">
      <td class="fw-semibold">${namSau} <span class="badge text-bg-warning" style="font-size:9.5px">ước tính</span></td><td></td><td class="text-end text-secondary" style="font-size:10.5px">dự báo</td>
      ${cot.map(k => hq[k] ? `<td class="text-end font-monospace" style="white-space:nowrap">${fmtM(Math.round(hq[k].du(+namSau)))}<div style="font-size:10.5px">${_tytPctDoi(hq[k].pctNam)}/năm</div></td>` : '<td class="text-end text-secondary">—</td>').join('')}
    </tr>` : '';
  const ctHtml = xh.cts.sort((a, b) => a.nam.localeCompare(b.nam)).map(c => `${x(c.p.name)} <span class="text-secondary">(${c.nam}${c.dongXong ? '' : ', đang làm'} · ${fmtM(Math.round(c.n1 / c.san))}/m2)</span>`).join(' · ');
  body.innerHTML = `<div style="overflow-x:auto"><table class="table table-sm table-hover align-middle mb-0 tyt-rpt" style="font-size:12px;min-width:720px">
      <thead class="table-light"><tr><th>Năm</th><th class="text-end">Số CT</th><th class="text-end">Sàn (m2)</th>${cot.map(k => `<th class="text-end">${ten[k]} /m2</th>`).join('')}</tr></thead>
      <tbody>${rows}${dbRow}</tbody></table></div>
    ${coDb ? '' : `<div class="text-secondary mt-1" style="font-size:11px">Mới có ${xh.nams.length} năm dữ liệu — cần ≥ ${TYT_DB_MIN} năm mới dự báo được năm tới.</div>`}
    <div class="text-secondary mt-1" style="font-size:11px">Công trình đã tính: ${ctHtml}</div>${thieuHtml}`;
}
// Mở 1 công trình (từ danh sách "chưa có bảng M2") và mở popup Bảng M2
function tytXhMoCT(pid) {
  _tytPid = pid; _tytResetEdits();
  tytPopulateSels();
  const sel = document.getElementById('tytf-ct');
  if (sel && ![...sel.options].some(o => o.value === pid)) {
    const p = getProjectById(pid);
    if (p) sel.insertAdjacentHTML('beforeend', `<option value="${pid}">${x(p.name)}</option>`);
  }
  if (sel) sel.value = pid;
  _tytMoM2 = true;
  tytRenderAll();
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
    <div class="text-secondary mt-1" style="font-size:11px">${tim ? 'Kết quả tìm' : `Mặt hàng mua ở ≥ 2 kỳ, nhiều lần mua nhất trước (tối đa ${TYT_GV_MAX} dòng — gõ ô "Tìm" để xem mặt hàng khác)`}.</div>`;
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
      // (31/10/2026) Giao diện điện thoại cũng gọi hàm này (mbTytEnsureYears) → vẽ lại màn điện thoại
      if (typeof MB !== 'undefined' && MB.on && typeof mbRender === 'function') mbRender();
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
  if (!p) { el.innerHTML = ''; return; }
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
  _tytRenderScope();
}
function tytTaiLai() {
  const p = _tytProj();
  if (!p) return;
  tytNamVongDoi(p).forEach(y => _tytTried.delete(String(y)));
  _tytEnsureYears(tytNamVongDoi(p));
}

function _tytAllProjs() {
  return ((typeof getAllProjects === 'function') ? getAllProjects() : [])
    .filter(p => p && p.id !== 'COMPANY' && !p.deletedAt);
}

// Cấp ra global (gọi từ onclick trong HTML + main.js + projects.ui.js)
window.initTyTrong = initTyTrong;
window.tytRefresh   = tytRefresh;
window.tytOpenFor   = tytOpenFor;
