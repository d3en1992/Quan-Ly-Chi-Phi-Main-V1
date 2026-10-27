// ══════════════════════════════════════════════════════════════
// mobile.actions.js — Các hành động GHI dữ liệu của giao diện điện thoại
// Load order: sau mobile.screens.js
//
// QUY TẮC AN TOÀN:
//   - Ghi dữ liệu đi ĐÚNG đường của bản desktop: mkRecord()/mkUpdate() + save().
//     save() tự lo _mem → IndexedDB → hẹn giờ đẩy lên Firebase (sync.js).
//   - Chỗ nào bản desktop đã có hàm chuẩn thì GỌI LẠI hàm đó (danh mục, trạng thái CT, tất toán)
//     thay vì chép logic — tránh lệch nghiệp vụ về sau.
//   - Sau khi ghi: gọi mbAfterWrite() để nạp lại global từ _mem rồi vẽ lại
//     màn hình mobile. Không cần đụng tầng render desktop (đang bị ẩn).
// ══════════════════════════════════════════════════════════════

/** Đọc số tiền do người dùng gõ ("1.500.000", "1,5tr") → số nguyên */
function mbMoney(v) { return (typeof parseMoney === 'function') ? parseMoney(v) : (parseInt(v, 10) || 0); }

/** Đọc số lượng (chấp nhận dấu phẩy thập phân) */
function mbNum(v) { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? 0 : n; }

/** Tra project theo TÊN (dùng cho các form chọn công trình bằng tên) */
function mbFindProjByName(name) {
  if (!name) return null;
  const pid = (typeof findProjectIdByName === 'function') ? findProjectIdByName(name) : null;
  return pid ? mbProject(pid) : null;
}

/** Chặn ghi vào công trình đã quyết toán (giữ đúng luật của bản desktop) */
function mbBlockClosed(name) {
  const p = mbFindProjByName(name);
  if (p && p.status === 'closed') {
    mbToast('Công trình "' + p.name + '" đã quyết toán — không nhập thêm được', 'error');
    return true;
  }
  return false;
}

/**
 * Làm mới dữ liệu + vẽ lại màn hình sau khi ghi.
 * Không cần gọi các hàm render của desktop: ở chế độ mobile, renderActiveTab()
 * đã tự bỏ qua tầng desktop (xem js/app/main.js) và DOM desktop đang bị ẩn.
 */
function mbAfterWrite() {
  if (typeof clearInvoiceCache === 'function') clearInvoiceCache();
  if (typeof _reloadGlobals === 'function') _reloadGlobals();
  if (typeof updateTop === 'function') { try { updateTop(); } catch (e) {} }
  mbRender();
}

/**
 * Thêm 1 mục vào danh mục `cats[catId]` bằng đúng addItem() của bản desktop
 * (giữ luật chống trùng / chuẩn hóa / lưu cloud). addItem() đọc giá trị từ ô
 * nhập desktop id="sa-<catId>" — ô này chỉ có sau renderSettings(), nên nếu
 * chưa có thì tạo tạm một ô ẩn rồi gỡ đi.
 */
function mbAddCat(catId, val) {
  if (typeof addItem !== 'function') { mbToast('Chưa sẵn sàng', 'error'); return; }
  let inp = document.getElementById('sa-' + catId);
  let temp = false;
  if (!inp) {
    inp = document.createElement('input');
    inp.id = 'sa-' + catId;
    inp.style.display = 'none';
    document.body.appendChild(inp);
    temp = true;
  }
  inp.value = val;
  addItem(catId);
  if (temp && inp.parentNode) inp.parentNode.removeChild(inp);
}

// ══════════════════════════════════════════════════════════════
//  ĐĂNG KÝ HÀNH ĐỘNG — bổ sung vào bảng MB_ACTS của mobile.core.js
// ══════════════════════════════════════════════════════════════
Object.assign(MB_ACTS, {

  // ── Bộ lọc / chip chung: data-arg="khóaState|giá trị" (giá trị được phép chứa "|") ──
  setFilter: (arg) => {
    const cut = arg.indexOf('|');
    const key = cut < 0 ? arg : arg.slice(0, cut);
    const val = cut < 0 ? '' : arg.slice(cut + 1);
    MB[key] = val;
    if (key === 'tbView') MB.tbCt = '';          // đổi Công trình ↔ Kho → bỏ lọc nơi đặt cũ
    mbRender();
  },

  // Chip gợi ý số tiền: data-arg="đường.dẫn|số" → ghi số đã phân cách nghìn vào ô tiền
  setMoney: (arg) => {
    const cut = arg.lastIndexOf('|');
    mbSetPath(arg.slice(0, cut), mbGroup(parseInt(arg.slice(cut + 1), 10) || 0));
    mbRender();
  },

  // Bấm vào cột biểu đồ tuần ở Tổng quan
  weekTip: (arg) => {
    const i   = parseInt(arg, 10);
    const sun = (typeof ccSundayISO === 'function') ? ccSundayISO(i - 5) : '';
    mbToast('Tuần ' + ((typeof weekLabel === 'function') ? weekLabel(sun) : sun), 'info');
  },

  // Nút tắt trong màn chi tiết công trình — mở form và chọn sẵn công trình này
  shortcut: (arg) => {
    const p = mbProject(MB.projectId);
    const ct = p ? p.name : '';
    if (arg === 'nhap')     { MB.form.ct = ct;    mbGo('nhap',     { seg: Object.assign({}, MB.seg, { nhap: 'nhanh' }) }); }
    if (arg === 'chamcong') { MB.ccCt = ct; MB.ccWorkers = null; mbGo('chamcong', { seg: Object.assign({}, MB.seg, { chamcong: 'so' }) }); }
    if (arg === 'tienung')  { MB.ungForm.ct = ct; mbGo('tienung',  { seg: Object.assign({}, MB.seg, { tienung: 'nhap' }) }); }
    if (arg === 'thu')      { MB.dtForm.ct = ct; mbGo('doanhthu', { seg: Object.assign({}, MB.seg, { doanhthu: 'thu' }) }); }
  },

  // Đổi nhanh trạng thái công trình (Admin / Giám đốc) — đi qua updateProject() của desktop
  changeProjStatus: (arg) => {
    const p = mbProject(MB.projectId);
    if (!p || p.status === arg || !MB_STATUS[arg]) return;
    if (mbRole() === 'ketoan') { mbToast('Vai trò Kế toán không đổi được trạng thái công trình', 'error'); return; }
    if (typeof updateProject !== 'function') { mbToast('Chưa sẵn sàng', 'error'); return; }
    const today = mbToday();
    const ch  = { status: arg };
    let msg = `Đổi trạng thái "${p.name}" → ${MB_STATUS[arg][0]}?`;
    // Giữ đúng luật của form sửa CT bản desktop: Hoàn thành cần endDate, Quyết toán cần closedDate
    if (arg === 'completed') {
      ch.endDate = p.endDate || today;
      ch.completedDate = p.completedDate || ch.endDate;
      msg += `\nNgày hoàn thành: ${mbDate(ch.endDate)}`;
    }
    if (arg === 'closed') {
      ch.closedDate = today;
      msg += `\nNgày quyết toán: ${mbDate(today)}\n\n⚠ Sau khi quyết toán sẽ không nhập thêm dữ liệu vào công trình này.`;
    }
    if (!confirm(msg)) return;
    try { updateProject(p.id, ch); }
    catch (e) { mbToast((e && e.message) || 'Không đổi được trạng thái', 'error'); return; }
    mbToast('✅ ' + p.name + ' → ' + MB_STATUS[arg][0], 'success');
    mbAfterWrite();
  },

  // ══════════════════════════════
  //  NHẬP HÓA ĐƠN — LƯU 1 CHẠM (27/10/2026)
  // ══════════════════════════════

  // Đổi giữa "nhập thẳng tổng tiền" ↔ "SL × Đơn giá", mang số đang có sang chế độ mới
  toggleCalcMode: () => {
    const f = MB.form;
    if (f.calcMode) {
      const tt = Math.round(mbNum(f.sl) * mbMoney(f.dg));
      if (tt) f.tien = mbGroup(tt);
    } else if (mbMoney(f.tien) && !mbMoney(f.dg)) {
      f.sl = '1';
      f.dg = f.tien;
    }
    f.calcMode = !f.calcMode;
    mbRender();
  },

  // Nút "+" cạnh Loại CP / NCC / Người chi → thêm mục danh mục mới rồi chọn luôn
  quickAddCat: (catId) => {
    const MAP = { loaiChiPhi: ['loại chi phí', 'loai'], nhaCungCap: ['nhà cung cấp', 'ncc'], nguoiTH: ['người chi', 'nguoi'] };
    if (!MAP[catId]) return;
    const val = (prompt('Thêm ' + MAP[catId][0] + ' mới:') || '').trim();
    if (!val) return;
    const find = () => (cats[catId] || []).find(v => String(v).toLowerCase() === val.toLowerCase());
    if (!find()) mbAddCat(catId, val);
    MB.form[MAP[catId][1]] = find() || val;
    mbAfterWrite();
  },

  saveQuickInv: () => {
    const f = MB.form;
    const tien = f.calcMode ? Math.round(mbNum(f.sl) * mbMoney(f.dg)) : mbMoney(f.tien);
    if (!f.ct)          { mbToast('Chọn công trình', 'error'); return; }
    if (!f.nd.trim())   { mbToast('Nhập nội dung chi phí', 'error'); return; }
    if (!tien)          { mbToast(f.calcMode ? 'Nhập số lượng và đơn giá' : 'Nhập số tiền', 'error'); return; }
    if (mbBlockClosed(f.ct)) return;

    const raw = {
      ngay: f.ngay, congtrinh: f.ct, loai: f.loai, nguoi: (f.nguoi || '').trim(), ncc: (f.ncc || '').trim(),
      nd: f.nd.trim(), sl: f.calcMode ? mbNum(f.sl) : 1, tien, thanhtien: tien, projectId: null, source: 'quick',
    };
    const fields = (typeof _ensureInvRef === 'function') ? _ensureInvRef(raw) : raw;

    if (f.editId) {
      const idx = invoices.findIndex(i => String(i.id) === String(f.editId));
      if (idx < 0) { mbToast('Không tìm thấy hóa đơn đang sửa', 'error'); f.editId = null; mbRender(); return; }
      invoices[idx] = mkUpdate(invoices[idx], fields);
      mbToast('✅ Đã cập nhật hóa đơn: ' + mbFull(tien), 'success');
    } else {
      invoices.unshift(mkRecord(fields));
      mbToast('✅ Đã lưu hóa đơn: ' + mbFull(tien), 'success');
    }
    save('inv_v3', invoices);
    // Giữ ngày / CT / loại / NCC / người chi để nhập tiếp tờ kế tiếp.
    // Vừa sửa xong 1 HĐ → trả về chế độ nhập thẳng tổng tiền (mặc định).
    if (f.editId) f.calcMode = false;
    Object.assign(f, { nd: '', tien: '', sl: '', dg: '', editId: null });
    mbAfterWrite();
  },

  // Nạp một hóa đơn nhập nhanh lên form để sửa
  editQuickInv: (id) => {
    const inv = invoices.find(i => String(i.id) === String(id) && !i.deletedAt);
    if (!inv) { mbToast('Không tìm thấy hóa đơn', 'error'); return; }
    if (inv.ccKey || inv.source === 'cc') { mbToast('Hóa đơn từ chấm công — sửa tại tab Chấm công', 'error'); return; }
    if (Array.isArray(inv.items) && inv.items.length) { mbToast('Hóa đơn chi tiết nhiều dòng — sửa trên máy tính', 'error'); return; }
    const tien = inv.thanhtien || inv.tien || 0;
    const sl   = Number(inv.sl) || 0;
    const calc = sl > 0 && sl !== 1;
    Object.assign(MB.form, {
      ngay: inv.ngay || mbToday(), ct: inv.congtrinh || '', loai: inv.loai || '',
      ncc: inv.ncc || '', nguoi: inv.nguoi || '', nd: inv.nd || '',
      calcMode: calc,
      tien: calc ? '' : mbGroup(tien),
      sl:   calc ? String(sl) : '',
      dg:   calc ? mbGroup(Math.round(tien / sl)) : '',
      editId: inv.id,
    });
    mbGo('nhap', { seg: Object.assign({}, MB.seg, { nhap: 'nhanh' }) });
  },

  cancelEditInv: () => {
    Object.assign(MB.form, { nd: '', tien: '', sl: '', dg: '', editId: null, calcMode: false });
    mbRender();
  },

  // Xóa mềm hóa đơn (vào Thùng rác của bản máy tính) — giống delInvoice() desktop
  delQuickInv: (id) => {
    const idx = invoices.findIndex(i => String(i.id) === String(id));
    if (idx < 0) { mbToast('Không tìm thấy hóa đơn', 'error'); return; }
    const inv = invoices[idx];
    if (inv.ccKey || inv.source === 'cc') { mbToast('Hóa đơn từ chấm công — sửa tại tab Chấm công', 'error'); return; }
    if (!confirm(`Xóa hóa đơn "${inv.nd || ''}" — ${mbFull(inv.thanhtien || inv.tien || 0)}?\n(Có thể khôi phục trong Thùng Rác trên máy tính)`)) return;
    const now = Date.now();
    const u   = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    invoices[idx] = {
      ...inv, deletedAt: now, updatedAt: now,
      deviceId: (typeof DEVICE_ID !== 'undefined') ? DEVICE_ID : inv.deviceId,
      deletedBy: (u && u.username) || 'Không rõ',
    };
    save('inv_v3', invoices);
    if (String(MB.form.editId) === String(id)) Object.assign(MB.form, { nd: '', tien: '', sl: '', dg: '', editId: null });
    mbToast('Đã xóa hóa đơn', 'success');
    mbAfterWrite();
  },

  // Lịch sử HĐ: hiện thêm 50 dòng
  moreInvs: () => { MB.invLimit = (MB.invLimit || 50) + 50; mbRender(); },

  // ══════════════════════════════
  //  CHẤM CÔNG
  // ══════════════════════════════
  ccWeek: (arg) => {
    MB.ccOffset += parseInt(arg, 10);
    MB.ccWorkers = null;               // đổi tuần → nạp lại bản nháp từ dữ liệu đã lưu
    mbRender();
  },

  // Bấm ô ngày: 0 → 1 công → 0.5 công → 0
  ccCycle: (arg) => {
    const [wi, di] = arg.split('|').map(Number);
    const w = MB.ccWorkers && MB.ccWorkers[wi];
    if (!w) return;
    const cur  = w.d[di] || 0;
    w.d[di] = cur === 0 ? 1 : cur === 1 ? 0.5 : 0;
    mbRender();
  },

  ccAddWorker: () => {
    mbCcEnsureDraft();
    MB.ccWorkers.push({ name: '', d: [0, 0, 0, 0, 0, 0, 0], luong: 0, phucap: 0, hdmuale: 0, nd: '' });
    MB.ccOpenSalary[MB.ccWorkers.length - 1] = true;
    mbRender();
  },

  // Xóa 1 dòng → chỉ số các dòng sau dịch lên, nên bỏ hết trạng thái mở dòng lương
  ccDelWorker: (arg) => { MB.ccWorkers.splice(parseInt(arg, 10), 1); MB.ccOpenSalary = {}; mbRender(); },

  // Nút "⚙ Lương": đóng/mở dòng sửa Lương/công & Phụ cấp của 1 công nhân
  ccToggleSalary: (arg) => {
    const wi = parseInt(arg, 10);
    MB.ccOpenSalary[wi] = !MB.ccOpenSalary[wi];
    mbRender();
  },

  // Chọn/gõ xong tên công nhân (sự kiện change) → tự điền lương từ tuần chấm công gần nhất.
  // Chỉ render lại khi thực sự điền, để không nuốt cú bấm nút kế tiếp khi ô mất focus.
  ccNamePicked: (arg) => {
    const w = MB.ccWorkers && MB.ccWorkers[parseInt(arg, 10)];
    if (!w || mbMoney(w.luong)) return;
    const luong = mbCcLastLuong(w.name);
    if (!luong) return;
    w.luong = luong;
    mbRender();
  },

  // Chép danh sách công nhân (tên + lương, công = 0) từ tuần gần nhất trước đó của cùng công trình
  ccCopyPrevWeek: () => {
    mbCcEnsureDraft();
    const prev = mbCcPrevWeek();
    if (!prev) { mbToast('Không tìm thấy tuần trước của công trình này', 'info'); return; }
    MB.ccWorkers = MB.ccWorkers.filter(w => (w.name || '').trim());
    const have = new Set(MB.ccWorkers.map(w => w.name.trim().toLowerCase()));
    let n = 0;
    (prev.workers || []).forEach(k => {
      const name = (k.name || '').trim();
      if (!name || have.has(name.toLowerCase())) return;
      have.add(name.toLowerCase());
      MB.ccWorkers.push({ name, d: [0, 0, 0, 0, 0, 0, 0], luong: k.luong || 0, phucap: 0, hdmuale: 0, nd: '' });
      n++;
    });
    MB.ccOpenSalary = {};
    mbToast(n ? '✅ Đã chép ' + n + ' công nhân từ tuần trước' : 'Đã có đủ công nhân của tuần trước', n ? 'success' : 'info');
    mbRender();
  },

  /**
   * Mở một tuần đã lưu để sửa. Gọi được từ 2 nơi:
   *   - Chấm công → "Tổng lương" (đang ở sẵn tab chamcong)
   *   - Chi tiết công trình → tab "Chấm công" (đang ở tab detail)
   * Vì vậy phải dùng mbGo() để CHUYỂN TAB, không chỉ mbSeg() đổi tab con.
   */
  ccOpenWeek: (arg) => {
    const [from, ct] = arg.split('|');
    // Tính offset tuần so với tuần hiện tại
    const curSun = (typeof ccSundayISO === 'function') ? ccSundayISO(0) : mbToday();
    const diff   = Math.round((new Date(from) - new Date(curSun)) / (7 * 86400000));
    MB.ccOffset  = diff;
    MB.ccCt      = ct;
    MB.ccWorkers = null;
    MB.seg.chamcong = 'so';
    mbGo('chamcong');
  },

  ccSaveWeek: () => {
    mbCcEnsureDraft();
    const ct = MB.ccCt;
    if (!ct) { mbToast('Chọn công trình', 'error'); return; }
    if (mbBlockClosed(ct)) return;

    // Bỏ dòng trống, chuẩn hóa số
    const workers = (MB.ccWorkers || [])
      .filter(w => (w.name || '').trim())
      .map(w => ({
        name: w.name.trim(),
        d: (w.d || []).map(v => Number(v) || 0),
        luong:  mbMoney(w.luong),
        phucap: mbMoney(w.phucap),
        hdmuale: mbMoney(w.hdmuale),
        nd: w.nd || '',
      }));
    if (!workers.length) { mbToast('Chưa có công nhân nào', 'error'); return; }

    const from = mbCcSunday();
    const to   = mbCcSaturday();
    const proj = mbFindProjByName(ct);
    const pid  = proj ? proj.id : null;

    const existing = mbCcFindWeek();
    if (existing) {
      const idx = ccData.findIndex(w => w.id === existing.id);
      ccData[idx] = mkUpdate(ccData[idx], { fromDate: from, toDate: to, ct, projectId: pid, ctPid: pid, workers });
    } else {
      ccData.unshift(mkRecord({ fromDate: from, toDate: to, ct, projectId: pid, ctPid: pid, workers }));
    }
    save('cc_v2', ccData);

    // Danh mục công nhân / công trình có thể phát sinh tên mới
    if (typeof rebuildCCCategories === 'function') { try { rebuildCCCategories(); } catch (e) {} }

    MB.ccWorkers = null;
    mbToast('✅ Đã lưu tuần chấm công', 'success');
    mbAfterWrite();
    MB.seg.chamcong = 'baocao';
    mbRender();
  },

  // ── Ứng / trả nợ công nhân (tab Chấm công → "Ứng CN") ──
  // Sổ nợ riêng theo người: ung_v1 với loai='congnhan' + cnKind='ung'|'tra'.
  // Trang Tiền Ứng và Công Nợ đều lọc bỏ loại này (giống bản desktop).
  ccUngKind: (arg) => { MB.ccUngForm.kind = arg; mbRender(); },

  // Bấm thẻ công nhân đang nợ → điền tên vào form ghi phiếu ứng/trả phía trên
  ccPickWorker: (name) => {
    MB.ccUngForm.tp = name || '';
    mbRender();
    const body = document.getElementById('mb-body');
    if (body) body.scrollTop = 0;
  },

  saveUngCN: () => {
    const f = MB.ccUngForm;
    if (!f.tp.trim())     { mbToast('Nhập tên công nhân', 'error'); return; }
    if (!mbMoney(f.tien)) { mbToast('Nhập số tiền', 'error'); return; }
    if (!f.ngay)          { mbToast('Chọn ngày', 'error'); return; }

    const proj = mbFindProjByName(f.ct);
    const isTra = f.kind === 'tra';
    ungRecords.unshift(mkRecord({
      ngay: f.ngay,
      loai: 'congnhan',
      cnKind: isTra ? 'tra' : 'ung',
      tp: f.tp.trim(),
      congtrinh: proj ? proj.name : (f.ct || ''),
      projectId: proj ? proj.id : null,
      tien: mbMoney(f.tien),
      nd: f.nd.trim() || (isTra ? 'Trả nợ' : 'Ứng tiền'),
      tinhVaoThucLanh: true,   // trừ thẳng vào cột Thực Lãnh của tuần chấm công
    }));
    save('ung_v1', ungRecords);

    // Tên công nhân mới → bổ sung vào danh mục để lần sau gợi ý được
    if (typeof rebuildCCNameList === 'function') { try { rebuildCCNameList(); } catch (e) {} }

    Object.assign(MB.ccUngForm, { tp: '', tien: '', nd: '' });
    MB.ccWorkers = null;       // thực lãnh của tuần đổi theo → nạp lại bản nháp
    mbToast('✅ Đã lưu phiếu ' + (isTra ? 'trả nợ ' : 'ứng ') + mbFull(mbMoney(f.tien)), 'success');
    mbAfterWrite();
  },

  // ══════════════════════════════
  //  TIỀN ỨNG
  // ══════════════════════════════
  saveUng: () => {
    const f = MB.ungForm;
    if (!f.tp.trim())   { mbToast('Nhập tên đối tác', 'error'); return; }
    if (!f.ct)          { mbToast('Chọn công trình', 'error'); return; }
    if (!mbMoney(f.tien)) { mbToast('Nhập số tiền', 'error'); return; }
    if (!f.ngay)        { mbToast('Chọn ngày', 'error'); return; }
    if (mbBlockClosed(f.ct)) return;

    const proj = mbFindProjByName(f.ct);
    const rec  = {
      ngay: f.ngay,
      loai: MB.ungKind,
      tp:   f.tp.trim(),
      congtrinh: proj ? proj.name : f.ct,
      projectId: proj ? proj.id : null,
      tien: mbMoney(f.tien),
      nd:   f.nd.trim() || 'Tạm ứng',
    };
    ungRecords.unshift(mkRecord(rec));
    save('ung_v1', ungRecords);

    Object.assign(MB.ungForm, { tp: '', tien: '', nd: '' });
    mbToast('✅ Đã lưu phiếu ứng ' + mbFull(rec.tien), 'success');
    mbAfterWrite();
  },

  // ══════════════════════════════
  //  THU TIỀN (27/10/2026: điện thoại chỉ còn ghi nhận thu — HĐ chính / HĐ thầu phụ làm trên máy tính)
  // ══════════════════════════════
  saveDt: () => {
    const f    = MB.dtForm;
    const tien = mbMoney(f.tien);
    if (!f.ct)   { mbToast('Chọn công trình', 'error'); return; }
    if (!tien)   { mbToast('Nhập số tiền', 'error'); return; }
    if (!f.ngay) { mbToast('Chọn ngày', 'error'); return; }

    const proj = mbFindProjByName(f.ct);
    if (!proj) { mbToast('Chỉ được tạo công trình tại tab Công Trình', 'error'); return; }

    thuRecords.unshift(mkRecord({
      ngay: f.ngay, congtrinh: proj.name, projectId: proj.id,
      tien, nguoi: '', nd: f.nd.trim(), loaiThu: '',
    }));
    save('thu_v1', thuRecords);
    mbToast('✅ Đã ghi nhận thu ' + mbFull(tien) + ' — ' + proj.name, 'success');

    Object.assign(MB.dtForm, { tien: '', nd: '' });
    mbAfterWrite();
  },

  // Xóa mềm phiếu thu nhập nhầm (khôi phục được trong Thùng Rác trên máy tính)
  delThu: (id) => {
    const idx = thuRecords.findIndex(r => String(r.id) === String(id));
    if (idx < 0) return;
    const r = thuRecords[idx];
    if (!confirm(`Xóa phiếu thu ${mbFull(r.tien || 0)} — ${r.congtrinh || ''} (${mbDate(r.ngay)})?`)) return;
    const now = Date.now();
    thuRecords[idx] = { ...r, deletedAt: now, updatedAt: now, deviceId: (typeof DEVICE_ID !== 'undefined') ? DEVICE_ID : r.deviceId };
    save('thu_v1', thuRecords);
    mbToast('Đã xóa phiếu thu', 'success');
    mbAfterWrite();
  },

  // ══════════════════════════════
  //  CÔNG NỢ · TẤT TOÁN TP/NCC — gọi lõi desktop (congno.tattoan.js)
  //  (03/10/2026) Mọi vai trò đã đăng nhập (kể cả Kế toán) được tất toán / hủy tất toán
  //  ttBuildRows() / ttCreatePhieu() / ttRemoveBatch() → cùng 1 logic với máy tính
  // ══════════════════════════════
  ttSettleMb: (key) => {
    // Tính lại số dư ngay lúc bấm (không dùng số cũ trên màn hình)
    const r = ttBuildRows().find(x => x.key === key);
    if (!r) { mbToast('Dòng này đã hết nợ', 'info'); mbRender(); return; }
    const ngay = mbToday();
    const miss = (typeof qtMissingYears === 'function') ? qtMissingYears() : [];
    const warn = miss.length ? `\n\n⚠ Máy chưa tải dữ liệu năm ${miss.join(', ')} — số dư có thể chưa đủ.` : '';
    if (!confirm(`Tất toán ${r.partner} — ${r.ctName || 'không gắn CT'}?\n\nTạo phiếu ứng ${mbFull(r.con)} ngày ${mbDate(ngay)}.${warn}`)) return;
    // Người TH: dùng người đã chọn ở lần tất toán gần nhất trên máy (trống → tên tài khoản)
    const id = ttCreatePhieu([r], ngay, (typeof ttLastNguoi === 'function') ? ttLastNguoi() : '');
    MB.ttLast = { id, msg: '✅ Đã tất toán ' + r.partner + ' · ' + mbFull(r.con) };
    mbToast('✅ Đã tất toán ' + r.partner, 'success');
    mbAfterWrite();
  },

  // Hoàn tác lần tất toán vừa làm trên điện thoại
  ttUndoMb: () => {
    if (!MB.ttLast) return;
    ttRemoveBatch(MB.ttLast.id);
    MB.ttLast = null;
    mbToast('↩ Đã hoàn tác', 'success');
    mbAfterWrite();
  },

  // Hủy 1 lần tất toán trong danh sách "Tất toán gần đây"
  ttCancelMb: (id) => {
    const b = ttBatches().find(x => x.id === id);
    if (!b) return;
    if (!confirm(`Hủy lần tất toán ngày ${mbDate(b.ngay)} (${b.recs.length} phiếu, ${mbFull(b.total)})?\nCác phiếu ứng tự sinh sẽ bị xóa → công nợ quay lại như trước.`)) return;
    ttRemoveBatch(id);
    if (MB.ttLast && MB.ttLast.id === id) MB.ttLast = null;
    mbToast('Đã hủy lần tất toán', 'success');
    mbAfterWrite();
  },

  // Công nợ → "+ Ghi phiếu ứng": sang màn Tiền ứng, điền sẵn loại + tên đối tác + công trình
  cnQuickUng: (key) => {
    const r = (typeof ttBuildRows === 'function') ? ttBuildRows({ includeDone: true }).find(x => x.key === key) : null;
    if (!r) { mbToast('Không tìm thấy đối tác', 'error'); return; }
    MB.ungKind = r.group === 'nhacungcap' ? 'nhacungcap' : 'thauphu';
    Object.assign(MB.ungForm, { tp: r.partner || '', ct: r.ctName || '', tien: '', nd: '' });
    mbGo('tienung', { seg: Object.assign({}, MB.seg, { tienung: 'nhap' }) });
  },
});
