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
//   2. PHÂN BỔ    #tyt-sub-pb — lọc, tick nhiều dòng, gán vào giai đoạn / hạng mục (#tyt-pb-*)
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
  _tytLast = tytTongHop(p);
  // Bảng M2 đang sửa dở → KPI dùng tổng sàn trên màn hình cho người dùng thấy ngay
  if (_tytKlDirty) {
    _tytLast.tongSan = tytTongSanRows(_tytKlRead());
    _tytLast.cpM2 = _tytLast.tongSan > 0 ? _tytLast.tongChi / _tytLast.tongSan : 0;
  }
  _tytRenderKpi(_tytLast);
  _tytRenderLoai(_tytLast);
  tytRenderCay();
  _tytRenderPbDich(_tytLast);
  _tytRenderPbLoai(_tytLast);
  tytRenderPb(_tytPbPage);
  _tytRenderSubBadges();
}

// ══ TAB CON ═════════════════════════════════════════════════════
function tytGoSub(id) {
  if (!document.getElementById(id)) return;
  _tytSub = id;
  document.querySelectorAll('#tyt-main .sub-page').forEach(pg => pg.classList.toggle('active', pg.id === id));
  document.querySelectorAll('#tyt-sub-nav .nav-link').forEach(b => b.classList.toggle('active', b.id === id + '-btn'));
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
    ['tyt-kpi-chi-sub', 'tyt-kpi-san-sub', 'tyt-kpi-pb-sub', 'tyt-kpi-warn'].forEach(id => set(id, ''));
    return;
  }
  set('tyt-kpi-chi', fmtM(r.tongChi));
  set('tyt-kpi-chi-sub', `${r.lines.length} khoản chi`);
  set('tyt-kpi-san', r.tongSan > 0 ? `${tytFmtM2(r.tongSan)} m2` : '<span class="text-warning">Chưa nhập</span>');
  set('tyt-kpi-san-sub', _tytKlDirty ? 'Đang sửa — chưa lưu' : 'Quy đổi theo hệ số');
  set('tyt-kpi-m2', r.tongSan > 0 ? fmtM(Math.round(r.cpM2)) : '—');
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
    tb.innerHTML = '<tr><td colspan="4" class="text-center text-secondary py-3">Chưa có khoản chi nào trong năm đang lọc</td></tr>';
    return;
  }
  tb.innerHTML = r.theoLoai.map(o => `<tr>
      <td>${x(o.loai)} <span class="text-secondary" style="font-size:11px">(${o.soDong})</span></td>
      <td class="text-end font-monospace" style="white-space:nowrap">${fmtM(o.tien)}</td>
      ${_tytPctCell(o.tien, r.tongChi)}
      <td class="text-end font-monospace" style="white-space:nowrap">${_tytM2Txt(o.tien, r.tongSan)}</td>
    </tr>`).join('') + _tytTongRow(r);
}

function _tytTongRow(r) {
  return `<tr class="tyt-rpt-total">
    <td>TỔNG</td>
    <td class="text-end font-monospace">${fmtM(r.tongChi)}</td>
    <td class="text-end font-monospace">${r.tongChi ? '100%' : '—'}</td>
    <td class="text-end font-monospace">${_tytM2Txt(r.tongChi, r.tongSan)}</td>
  </tr>`;
}

// ══ BẢNG CÂY MA TRẬN (tab con PHÂN TÍCH) ═══════════════════════════
// Dựng từ tytCay() (tytrong.core.js). Mỗi dòng có data-k = key node; bấm nút [+]/[−] → tytCayToggle.
// Cột "% Cấp trên" = tiền dòng ÷ tiền dòng cha ngay trên (VD sắt thép móng chiếm bao nhiêu % của Móng);
// cấp Giai đoạn không có cha → "—".
const _TYT_KIND_CLS = { gd: 'tyt-cay-gd', chua: 'tyt-cay-chua', hm: 'tyt-cay-hm', chung: 'tyt-cay-hm tyt-cay-chung', loai: 'tyt-cay-loai', line: 'tyt-cay-line' };

function tytRenderCay() {
  const tb = document.getElementById('tyt-cay-tbody');
  if (!tb || !_tytLast) return;
  const r = _tytLast;
  const an0 = !!document.getElementById('tyt-cay-an0')?.checked;
  const nodes = tytCay(r);
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
    else if (n.kind === 'chua') ten = `<span class="material-symbols-outlined" style="font-size:15px;vertical-align:-3px">help</span> <b>Chưa phân bổ</b> <span class="tyt-cay-note">→ gán ở tab Phân Bổ</span>`;
    else if (n.kind === 'chung') ten = `<i>${x(n.ten)}</i>`;
    else if (n.kind === 'loai') ten = `${x(n.ten)} <span class="tyt-cay-note">(${n.soDong} khoản)</span>`;
    else if (n.kind === 'line') {
      const l = n.line;
      ten = `<span class="tyt-cay-date">${fmtISODate(l.ngay)}</span> ${x(l.nd || '—')}${l.doiTuong ? ` <span class="tyt-cay-note">· ${x(l.doiTuong)}</span>` : ''}`;
    } else ten = x(n.ten);
    const pctCha = parentTien === null ? '<span class="text-secondary">—</span>' : _tytPctTxt(n.tien, parentTien);
    html += `<tr class="${_TYT_KIND_CLS[n.kind] || ''}${n.tien ? '' : ' tyt-rpt-zero'}" data-k="${x(n.key)}">
      <td><div class="tyt-cay-name" style="padding-left:${depth * 20}px">${toggle}<span>${ten}</span></div></td>
      <td class="text-end font-monospace" style="white-space:nowrap">${fmtM(n.tien)}</td>
      ${n.kind === 'line' ? `<td class="text-end font-monospace">${_tytPctTxt(n.tien, r.tongChi)}</td>` : _tytPctCell(n.tien, r.tongChi)}
      <td class="text-end font-monospace" style="white-space:nowrap">${pctCha}</td>
      <td class="text-end font-monospace" style="white-space:nowrap">${_tytM2Txt(n.tien, r.tongSan)}</td>
    </tr>`;
    if (open) n.children.forEach(c => walk(c, depth + 1, n.tien));
  };
  nodes.forEach(n => walk(n, 0, null));

  if (!r.st.giaiDoan.length) {
    html = `<tr><td colspan="5" class="py-3 text-center" style="font-size:12.5px">
      <div class="text-secondary mb-2">Công trình chưa có giai đoạn / hạng mục — toàn bộ chi phí đang ở "Chưa phân bổ".</div>
      <button class="btn btn-sm btn-outline-primary" onclick="tytGoSub('tyt-sub-tl')"><span class="material-symbols-outlined msi-gap">tune</span>Sang tab Thiết lập</button>
    </td></tr>` + html;
  }
  if (!r.lines.length) html = '<tr><td colspan="5" class="text-center text-secondary py-3">Chưa có khoản chi nào trong năm đang lọc</td></tr>';
  tb.innerHTML = html + `<tr class="tyt-rpt-total">
    <td>TỔNG CÔNG TRÌNH</td>
    <td class="text-end font-monospace">${fmtM(r.tongChi)}</td>
    <td class="text-end font-monospace">${r.tongChi ? '100%' : '—'}</td>
    <td class="text-end font-monospace"></td>
    <td class="text-end font-monospace">${_tytM2Txt(r.tongChi, r.tongSan)}</td>
  </tr>`;
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
    tytCay(_tytLast).forEach(walk);
  }
  tytRenderCay();
}

// ══ PHÂN BỔ CHI PHÍ ═════════════════════════════════════════════
// Dropdown "gán vào": mỗi giai đoạn 1 nhóm — [cả giai đoạn] + từng hạng mục
function _tytRenderPbDich(r) {
  const sel = document.getElementById('tyt-pb-dich');
  if (!sel) return;
  const cur = sel.value;
  const st = r.st;
  if (!st.giaiDoan.length) {
    sel.innerHTML = '<option value="">(Chưa có giai đoạn — tạo ở khung trên)</option>';
    return;
  }
  sel.innerHTML = '<option value="">-- Gán vào --</option>' + st.giaiDoan.map(g => {
    const hms = st.hangMuc.filter(h => h.gdId === g.id);
    return `<optgroup label="${x(g.ten)}">
      <option value="g:${g.id}">${x(g.ten)} (cả giai đoạn)</option>
      ${hms.map(h => `<option value="h:${h.id}">${x(g.ten)} › ${x(h.ten)}</option>`).join('')}
    </optgroup>`;
  }).join('');
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
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
  const tt   = document.getElementById('tyt-pb-tt')?.value || 'chua';
  const loai = document.getElementById('tyt-pb-loai')?.value || '';
  const q    = (document.getElementById('tyt-pb-q')?.value || '').trim().toLowerCase();
  return _tytLast.lines.filter(l => {
    if (tt === 'chua' && l.pb.g) return false;
    if (tt === 'ngay' && l.pb.src !== 'ngay') return false;
    if (tt === 'tay'  && l.pb.src !== 'tay') return false;
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

// Nhãn "Thuộc" của 1 dòng
function _tytPbLabel(l) {
  if (!l.pb.g) return '<span class="badge text-bg-light border text-secondary">Chưa phân bổ</span>';
  const st = _tytLast.st;
  const g = st.giaiDoan.find(z => z.id === l.pb.g);
  const h = l.pb.h ? st.hangMuc.find(z => z.id === l.pb.h) : null;
  const ten = x(g ? g.ten : '?') + (h ? ' › ' + x(h.ten) : '');
  return l.pb.src === 'ngay'
    ? `<span class="badge text-bg-info bg-opacity-25 text-info-emphasis border border-info-subtle" title="Tự xếp theo mốc ngày của giai đoạn">${ten} · theo ngày</span>`
    : `<span class="badge text-bg-primary bg-opacity-25 text-primary-emphasis border border-primary-subtle" title="Đã gán tay">${ten}</span>`;
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
      return `<tr style="${on ? 'background:var(--bs-primary-bg-subtle)' : ''}">
        <td class="text-center"><input type="checkbox" class="form-check-input" data-k="${k}" ${on ? 'checked' : ''} onchange="tytPbToggle(this)"></td>
        <td class="text-secondary" style="white-space:nowrap;font-size:12px">${fmtISODate(l.ngay)}</td>
        <td style="white-space:nowrap">${x(l.loai)}${kindTxt}</td>
        <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(l.nd)}">${x(l.nd || '—')}</td>
        <td class="text-secondary" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(l.doiTuong)}">${x(l.doiTuong || '—')}</td>
        <td class="text-end font-monospace fw-semibold" style="white-space:nowrap">${fmtM(l.tien)}</td>
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

// Cấp ra global (gọi từ onclick trong HTML + main.js + projects.ui.js)
window.initTyTrong = initTyTrong;
window.tytRefresh   = tytRefresh;
window.tytOpenFor   = tytOpenFor;
