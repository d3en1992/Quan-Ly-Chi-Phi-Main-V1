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
/** Sao chép chữ vào clipboard (navigator.clipboard, máy cũ / http thì dùng execCommand) */
function mbCopyText(text, okMsg) {
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (ok) mbToast(okMsg, 'success');
    else { mbToast('Máy không cho sao chép tự động — giữ để chọn và sao chép', 'error'); prompt('Sao chép nội dung:', text); }
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => mbToast(okMsg, 'success'), fallback);
  } else fallback();
}

// ── Thiết bị: dùng lại helper NƠI của thietbi.js (_tbLocFromSel / _tbLocKey / _tbGhiKey) ──
/** Tên nơi (tên kho hoặc tên công trình) → { ct, projectId, kho, key } */
function mbTbLocOf(name) {
  const pid = (typeof findProjectIdByName === 'function') ? findProjectIdByName(name) : null;
  if (typeof _tbLocFromSel === 'function') return _tbLocFromSel(name, pid);
  return { ct: name, projectId: pid || null, kho: null, key: pid || name };
}

/** Nơi hiện tại của 1 dòng thiết bị (để trả phần còn lại về đúng chỗ khi điều chuyển một phần) */
function mbTbSrcLoc(r) {
  const key = (typeof _tbLocKey === 'function') ? _tbLocKey(r) : (r.projectId || r.ct || '');
  if (r.projectId === 'COMPANY' && typeof TB_KHO !== 'undefined' && typeof _tbKhoCode === 'function') {
    const code = _tbKhoCode(r);
    return { ct: TB_KHO[code].name, projectId: 'COMPANY', kho: code, key };
  }
  return { ct: r.ct, projectId: r.projectId || null, kho: null, key };
}

/**
 * Cộng thiết bị vào 1 nơi: có dòng trùng (Nơi + Tên + Tình trạng + Thông tin máy) → cộng dồn số lượng,
 * chưa có → tạo dòng mới. keepDate = true: không đổi ngày luân chuyển của dòng đang có.
 */
function mbTbAddAt(loc, row, ngay, keepDate) {
  const key  = (typeof _tbLocKey === 'function') ? _tbLocKey : (t => t.projectId || t.ct || '');
  const gkey = (typeof _tbGhiKey === 'function') ? _tbGhiKey : (s => String(s || '').trim().toLowerCase());
  const exist = tbData.find(t => !t.deletedAt && t.ten === row.ten && t.tinhtrang === row.tinhtrang &&
    gkey(t.ghichu) === gkey(row.ghichu) && key(t) === loc.key);
  if (exist) {
    exist.soluong = (exist.soluong || 0) + row.soluong;
    if (!keepDate) exist.ngay = ngay;
    exist.updatedAt = Date.now();
    exist.deviceId  = (typeof DEVICE_ID !== 'undefined') ? DEVICE_ID : exist.deviceId;
  } else {
    tbData.push(mkRecord({ ct: loc.ct, projectId: loc.projectId, ...(loc.kho ? { kho: loc.kho } : {}), ...row, ngay }));
  }
}

/** Thêm 1 mục danh mục rồi trả về tên chuẩn đang có trong cats (prompt → mbAddCat) */
function mbPromptAddCat(catId, label) {
  const val = (prompt('Thêm ' + label + ' mới:') || '').trim();
  if (!val) return '';
  const find = () => (cats[catId] || []).find(v => String(v).toLowerCase() === val.toLowerCase());
  if (!find()) mbAddCat(catId, val);
  return find() || val;
}

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

  // Bấm thẻ công nhân → điền tên vào form ghi phiếu ứng/trả phía trên + bung/thu lịch sử ứng–trả ngay dưới thẻ
  ccPickWorker: (name) => {
    MB.ccUngForm.tp = name || '';
    MB.ccUngOpen = MB.ccUngOpen === name ? '' : (name || '');
    mbRender();
  },

  // Xóa mềm 1 phiếu ứng / trả nợ công nhân nhập nhầm (giống chamcong.ung-ledger.js)
  delUngCnMb: (id) => {
    const idx = ungRecords.findIndex(r => String(r.id) === String(id));
    if (idx < 0) return;
    const r = ungRecords[idx];
    if (!confirm(`Xóa phiếu ${r.cnKind === 'tra' ? 'trả nợ' : 'ứng'} ${mbFull(r.tien || 0)} của ${r.tp || ''} (${mbDate(r.ngay)})?`)) return;
    ungRecords[idx] = mkUpdate(ungRecords[idx], { deletedAt: Date.now() });
    save('ung_v1', ungRecords);
    MB.ccWorkers = null;       // thực lãnh của tuần đổi theo → nạp lại bản nháp
    mbToast('Đã xóa phiếu', 'success');
    mbAfterWrite();
  },

  // Bảng lương từng công nhân → sao chép phiếu lương (dán vào Zalo)
  ccCopyPayslip: (name) => {
    const { from, to, rows } = mbCcPayroll();
    const r = rows.find(x => x.name === name);
    if (!r) { mbToast('Không tìm thấy công nhân trong tuần này', 'error'); return; }
    mbCopyText(mbCcPayslipText(r, from, to), '📋 Đã sao chép phiếu lương ' + name + ' — dán vào Zalo');
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
    if (f.editId) {
      const idx = ungRecords.findIndex(u => String(u.id) === String(f.editId));
      if (idx < 0) { mbToast('Không tìm thấy phiếu đang sửa', 'error'); f.editId = null; mbRender(); return; }
      ungRecords[idx] = mkUpdate(ungRecords[idx], rec);
      mbToast('✅ Đã cập nhật phiếu ứng ' + mbFull(rec.tien), 'success');
    } else {
      ungRecords.unshift(mkRecord(rec));
      mbToast('✅ Đã lưu phiếu ứng ' + mbFull(rec.tien), 'success');
    }
    save('ung_v1', ungRecords);

    Object.assign(MB.ungForm, { tp: '', tien: '', nd: '', editId: null });
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

  // ══════════════════════════════
  //  V2 (27/10/2026) — chung
  // ══════════════════════════════

  // Chip ghi vào state lồng nhau: data-arg="đường.dẫn|giá trị" (vd projForm.loai|CT)
  setPath: (arg) => {
    const cut = arg.indexOf('|');
    mbSetPath(arg.slice(0, cut), arg.slice(cut + 1));
    mbRender();
  },

  // Khối "⚡ Việc cần chú ý" ở Tổng quan
  alertGo: (arg) => {
    // (31/10/2026) "Đã hoàn thành chưa quyết toán" → mở thẳng danh sách Quyết toán (Kế toán: lọc ở Công trình)
    if (arg === 'completed' && mbCanSee('quyettoan')) {
      Object.assign(MB, { qtFilter: 'chua', qtSearch: '', seg: Object.assign({}, MB.seg, { quyettoan: 'ds' }) });
      mbGo('quyettoan');
      return;
    }
    if (arg === 'over' || arg === 'completed') { MB.statusFilter = arg; MB.search = ''; mbGo('congtrinh'); }
    if (arg === 'congno')  mbGo('congno');
    if (arg === 'thietbi') { MB.tbWarn = '1'; MB.tbCt = ''; mbGo('thietbi'); }
  },

  // ══════════════════════════════
  //  CÔNG TRÌNH — tạo mới / sửa (createProject / updateProject của projects.model.js)
  // ══════════════════════════════
  toggleProjForm: () => {
    if (MB.projFormOpen && !MB.projForm.id) { MB.projFormOpen = false; mbRender(); return; }
    MB.projForm = { id: null, loai: 'CT', kh: '', phone: '', name: '', diachi: '', ngay: mbToday(), heSo: '1' };
    MB.projFormOpen = true;
    mbRender();
  },

  closeProjForm: () => { MB.projFormOpen = false; mbRender(); },

  editProjMb: () => {
    const p = mbProject(MB.projectId);
    if (!p) return;
    const c = mbProjCustomer(p);
    const loai = (typeof ctLoaiOf === 'function') ? ctLoaiOf(p)
      : (typeof ctDetectLoai === 'function') ? ctDetectLoai(p.name) : (p.type || 'OTHER');
    MB.projForm = {
      id: p.id,
      loai: (loai === 'CT' || loai === 'SC') ? loai : 'OTHER',
      kh: (c && c.name) || p.chuDauTu || '',
      phone: (c && c.phone) || '',
      name: p.name || '',
      diachi: p.note || '',
      ngay: p.startDate || '',
      heSo: String((typeof getProjectK === 'function') ? getProjectK(p) : (p.heSoTiTrong == null ? 1 : p.heSoTiTrong)),
    };
    MB.projFormOpen = true;
    mbRender();
  },

  // Chọn Chủ đầu tư có sẵn → điền SĐT / địa chỉ còn trống từ hồ sơ khách hàng
  projKhPicked: () => {
    const f = MB.projForm;
    const c = (typeof findCustomerByName === 'function') ? findCustomerByName(f.kh) : null;
    if (!c) return;
    let changed = false;
    if (!f.phone && c.phone)    { f.phone = c.phone; changed = true; }
    if (!f.diachi && c.address) { f.diachi = c.address; changed = true; }
    if (changed) mbRender();
  },

  // Gợi ý tên kiểu desktop (_ctSuggestName): "<mã loại> <tên Chủ đầu tư>"
  projSuggestName: () => {
    const f = MB.projForm;
    if (!f.kh.trim()) { mbToast('Nhập tên Chủ đầu tư trước', 'error'); return; }
    const max = (typeof CT_NAME_MAX !== 'undefined') ? CT_NAME_MAX : 45;
    f.name = ((f.loai === 'CT' || f.loai === 'SC') ? f.loai + ' ' : '') + f.kh.trim();
    f.name = f.name.slice(0, max).trim();
    mbRender();
  },

  saveProjMb: () => {
    const f = MB.projForm;
    const kh = (f.kh || '').trim();
    if (!kh) { mbToast('Nhập tên Chủ đầu tư', 'error'); return; }
    if (typeof createProject !== 'function' || typeof getOrCreateCustomerByName !== 'function') { mbToast('Chưa sẵn sàng', 'error'); return; }

    const detect = (typeof ctDetectLoai === 'function') ? ctDetectLoai
      : (n => { const m = String(n || '').match(/^\s*\[?\s*(CT|SC|SN)\s*\]?(?![a-zà-ỹ])/i); return m ? m[1].toUpperCase() : 'Khác'; });
    let name = (f.name || '').trim() || (((f.loai === 'CT' || f.loai === 'SC') ? f.loai + ' ' : '') + kh);
    if (typeof _ctNormalizeNamePrefix === 'function') name = _ctNormalizeNamePrefix(name);
    // Chọn chip Công trình mới / Sửa chữa mà tên chưa có mã → gắn mã vào đầu tên (desktop nhận loại từ tiền tố tên)
    if ((f.loai === 'CT' || f.loai === 'SC') && detect(name) === 'Khác') name = f.loai + ' ' + name;
    const old = f.id ? mbProject(f.id) : null;
    const max = (typeof CT_NAME_MAX !== 'undefined') ? CT_NAME_MAX : 45;
    if (name.length > max && (!old || name !== old.name)) { mbToast(`Tên công trình tối đa ${max} ký tự (đang ${name.length})`, 'error'); return; }
    const loaiCongTrinh = detect(name);
    const type = (loaiCongTrinh === 'CT' || loaiCongTrinh === 'SC') ? loaiCongTrinh : 'OTHER';
    const k = String(f.heSo).trim() === '' ? 1 : mbNum(f.heSo);
    const heSoTiTrong = (isFinite(k) && k >= 0) ? k : 1;
    const diachi = (f.diachi || '').trim();

    let projId = f.id;
    try {
      const c = getOrCreateCustomerByName(kh);
      // Cập nhật SĐT (chỉ người được xem SĐT) + địa chỉ khách nếu khách chưa có
      const canPhone = (typeof khCanSeePhone === 'function') ? khCanSeePhone() : false;
      const ch = {};
      if (canPhone && (f.phone || '').trim() && f.phone.trim() !== (c.phone || '')) ch.phone = f.phone.trim();
      if (diachi && !c.address) ch.address = diachi;
      if (Object.keys(ch).length && typeof updateCustomer === 'function') updateCustomer(c.id, ch);

      if (old) {
        const changes = { name, note: diachi, chuDauTu: c.name, customerId: c.id, heSoTiTrong, loaiCongTrinh, type };
        if (f.ngay && f.ngay !== old.startDate) Object.assign(changes, { startDate: f.ngay, startDateUserEdited: true });
        updateProject(old.id, changes);
      } else {
        const p = createProject({
          name, type, loaiCongTrinh, status: 'active', startDate: f.ngay || undefined,
          note: diachi, chuDauTu: c.name, customerId: c.id, heSoTiTrong,
        });
        projId = p.id;
      }
    } catch (e) {
      mbToast('❌ ' + ((e && e.message) || 'Không lưu được công trình'), 'error');
      return;
    }
    // Cập nhật dropdown công trình của bản desktop (đang ẩn) cho khớp — như saveCTCreate()
    ['refreshHoadonCtDropdowns', 'rebuildUngSelects', 'populateCCCtSel'].forEach(fn => {
      if (typeof window[fn] === 'function') { try { window[fn](); } catch (e) { /* DOM desktop chưa nạp */ } }
    });
    MB.projFormOpen = false;
    mbToast(old ? '✅ Đã cập nhật công trình' : '✅ Đã tạo công trình: ' + name, 'success');
    mbAfterWrite();
    if (!old && projId) mbOpenProject(projId);
  },

  // ══════════════════════════════
  //  TIỀN ỨNG — sửa / xóa phiếu, thêm đối tác, xem chi tiết theo đối tác
  // ══════════════════════════════
  quickAddUngParty: () => {
    const isTp = MB.ungKind === 'thauphu';
    const v = mbPromptAddCat(isTp ? 'thauPhu' : 'nhaCungCap', isTp ? 'thầu phụ' : 'nhà cung cấp');
    if (!v) return;
    MB.ungForm.tp = v;
    mbAfterWrite();
  },

  editUngMb: (id) => {
    const u = ungRecords.find(r => String(r.id) === String(id) && !r.deletedAt);
    if (!u) { mbToast('Không tìm thấy phiếu ứng', 'error'); return; }
    if (u.autoSettle) { mbToast('Phiếu tất toán chỉ xem — hủy ở Công nợ → Tất toán gần đây', 'error'); return; }
    if (u.loai === 'congnhan') { mbToast('Phiếu ứng công nhân — xem ở Chấm công → Ứng công nhân', 'error'); return; }
    MB.ungKind = u.loai === 'nhacungcap' ? 'nhacungcap' : 'thauphu';
    Object.assign(MB.ungForm, { tp: u.tp || '', ct: u.congtrinh || '', ngay: u.ngay || mbToday(), tien: mbGroup(u.tien || 0), nd: u.nd || '', editId: u.id });
    mbGo('tienung', { seg: Object.assign({}, MB.seg, { tienung: 'nhap' }) });
  },

  cancelEditUng: () => {
    Object.assign(MB.ungForm, { tp: '', tien: '', nd: '', editId: null });
    mbRender();
  },

  delUngMb: (id) => {
    const idx = ungRecords.findIndex(r => String(r.id) === String(id));
    if (idx < 0) return;
    const u = ungRecords[idx];
    if (u.autoSettle) { mbToast('Phiếu tất toán chỉ xem — hủy ở Công nợ → Tất toán gần đây', 'error'); return; }
    if (!confirm(`Xóa phiếu ứng ${mbFull(u.tien || 0)} — ${u.tp || ''} (${mbDate(u.ngay)})?\n(Có thể khôi phục trong Thùng Rác trên máy tính)`)) return;
    const now = Date.now();
    const usr = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    ungRecords[idx] = {
      ...u, deletedAt: now, updatedAt: now,
      deviceId: (typeof DEVICE_ID !== 'undefined') ? DEVICE_ID : u.deviceId,
      deletedBy: (usr && usr.username) || 'Không rõ',
    };
    save('ung_v1', ungRecords);
    if (String(MB.ungForm.editId) === String(id)) Object.assign(MB.ungForm, { tp: '', tien: '', nd: '', editId: null });
    mbToast('Đã xóa phiếu ứng', 'success');
    mbAfterWrite();
  },

  toggleUngParty: (name) => { MB.ungOpen = MB.ungOpen === name ? '' : name; mbRender(); },

  // ══════════════════════════════
  //  CÔNG NỢ — bung chi tiết · thêm hợp đồng thầu phụ
  // ══════════════════════════════
  toggleCnDetail: (key) => { MB.cnOpen = MB.cnOpen === key ? '' : key; mbRender(); },

  toggleHdtpForm: () => { MB.hdtpOpen = !MB.hdtpOpen; mbRender(); },

  quickAddHdtpTp: () => {
    const v = mbPromptAddCat('thauPhu', 'thầu phụ');
    if (!v) return;
    MB.hdtpForm.tp = v;
    mbAfterWrite();
  },

  // Cùng schema với nhánh 'hdtp' của saveDt cũ / form HĐ thầu phụ desktop (thauphu_v1)
  saveHdtpMb: () => {
    const f = MB.hdtpForm;
    const giaTri = mbMoney(f.giaTri);
    if (!f.ct)        { mbToast('Chọn công trình', 'error'); return; }
    if (!f.tp.trim()) { mbToast('Nhập tên thầu phụ', 'error'); return; }
    if (!giaTri)      { mbToast('Nhập giá trị hợp đồng', 'error'); return; }
    if (!f.ngay)      { mbToast('Chọn ngày ký', 'error'); return; }
    if (mbBlockClosed(f.ct)) return;
    const proj = mbFindProjByName(f.ct);
    if (!proj) { mbToast('Chỉ được tạo công trình tại tab Công Trình', 'error'); return; }
    thauPhuContracts.unshift(mkRecord({
      ngay: f.ngay, congtrinh: proj.name, projectId: proj.id,
      thauphu: f.tp.trim(), giaTri, phatSinh: mbMoney(f.phatSinh), nd: f.nd.trim(), items: [],
    }));
    save('thauphu_v1', thauPhuContracts);
    mbToast('✅ Đã lưu hợp đồng thầu phụ: ' + f.tp.trim() + ' · ' + mbFull(giaTri), 'success');
    Object.assign(f, { tp: '', giaTri: '', phatSinh: '', nd: '' });
    MB.hdtpOpen = false;
    mbAfterWrite();
  },

  // ══════════════════════════════
  //  THIẾT BỊ & KHO — thêm · điều chuyển · đổi tình trạng · xóa
  //  Giữ đúng luật gộp của thietbi.js: 1 dòng = Nơi + Tên + Tình trạng + Thông tin máy
  // ══════════════════════════════
  toggleTbForm: () => {
    MB.tbFormOpen = !MB.tbFormOpen;
    if (MB.tbFormOpen) MB.tbForm = { noi: MB.tbForm.noi || '', ten: '', sl: '1', tt: MB_TB_TT[0], ghichu: '' };
    mbRender();
  },

  quickAddTbTen: () => {
    const v = mbPromptAddCat('tbTen', 'tên thiết bị');
    if (!v) return;
    MB.tbForm.ten = v;
    mbAfterWrite();
  },

  saveTbMb: () => {
    const f = MB.tbForm;
    if (!f.noi) { mbToast('Chọn nơi đặt (công trình / kho)', 'error'); return; }
    const loc = mbTbLocOf(f.noi);
    if (!loc.kho && mbBlockClosed(f.noi)) return;
    const names = (typeof tbGetNames === 'function') ? tbGetNames() : (cats.tbTen || []);
    const norm  = s => (typeof _tbNormQ === 'function') ? _tbNormQ(s) : String(s || '').trim().toLowerCase();
    const ten   = names.find(n => norm(n) === norm(f.ten));
    if (!ten) { mbToast(f.ten.trim() ? 'Tên thiết bị chưa có trong danh mục — bấm "+" để thêm' : 'Nhập tên thiết bị', 'error'); return; }
    const sl = mbNum(f.sl);
    if (!(sl > 0)) { mbToast('Số lượng phải lớn hơn 0', 'error'); return; }
    const tt = MB_TB_TT.includes(f.tt) ? f.tt : MB_TB_TT[0];
    const ghichu = (f.ghichu || '').trim();
    mbTbAddAt(loc, { ten, soluong: sl, tinhtrang: tt, ghichu }, mbToday());
    save('tb_v1', tbData);
    MB.tbFormOpen = false;
    mbToast(`✅ Đã lưu ${sl} ${ten} vào ${loc.ct}`, 'success');
    mbAfterWrite();
  },

  // Mở / đóng khung điều chuyển ngay trên thẻ (data-arg rỗng = đóng)
  openTbMove: (id) => {
    if (!id || MB.tbMoveId === id) { MB.tbMoveId = ''; mbRender(); return; }
    const r = tbData.find(t => t.id === id && !t.deletedAt);
    MB.tbMoveId = id;
    MB.tbMove = { noi: '', sl: String((r && r.soluong) || '') };
    mbRender();
  },

  // Giống tbSaveEdit(): xóa mềm dòng gốc → cộng dồn phần chuyển vào nơi nhận → phần còn lại giữ ở nơi cũ
  saveTbMove: (id) => {
    const idx = tbData.findIndex(t => t.id === id && !t.deletedAt);
    if (idx < 0) { mbToast('Không tìm thấy thiết bị', 'error'); return; }
    const r = tbData[idx];
    const noi = MB.tbMove.noi;
    const sl  = mbNum(MB.tbMove.sl);
    const old = r.soluong || 0;
    if (!noi) { mbToast('Chọn nơi nhận', 'error'); return; }
    if (!(sl > 0) || sl > old) { mbToast(`Số lượng phải từ 1 đến ${old}`, 'error'); return; }
    const dest = mbTbLocOf(noi);
    if (!dest.kho && mbBlockClosed(noi)) return;
    const srcLoc = mbTbSrcLoc(r);
    const ngay = mbToday();

    tbData = softDeleteRecord(tbData, id);
    mbTbAddAt(dest, { ten: r.ten, soluong: sl, tinhtrang: r.tinhtrang, ghichu: r.ghichu || '' }, ngay);
    if (old - sl > 0) mbTbAddAt(srcLoc, { ten: r.ten, soluong: old - sl, tinhtrang: r.tinhtrang, ghichu: r.ghichu || '' }, r.ngay || ngay, true);
    save('tb_v1', tbData);
    MB.tbMoveId = '';
    mbToast(`✅ Đã chuyển ${sl} ${r.ten} → ${dest.ct}`, 'success');
    mbAfterWrite();
  },

  // Đang hoạt động → Cần bảo trì → Cần sửa chữa → … ; trùng dòng cùng nơi thì gộp (giống _tbApplyEdit)
  cycleTbStatus: (id) => {
    const r = tbData.find(t => t.id === id && !t.deletedAt);
    if (!r) return;
    const i = MB_TB_TT.indexOf(r.tinhtrang);
    const next = MB_TB_TT[(i + 1) % MB_TB_TT.length];
    const key  = (typeof _tbLocKey === 'function') ? _tbLocKey : (t => t.projectId || t.ct || '');
    const gkey = (typeof _tbGhiKey === 'function') ? _tbGhiKey : (s => String(s || '').trim().toLowerCase());
    const twin = tbData.find(t => t !== r && !t.deletedAt && key(t) === key(r) && t.ten === r.ten &&
      t.tinhtrang === next && gkey(t.ghichu) === gkey(r.ghichu));
    const dev = (typeof DEVICE_ID !== 'undefined') ? DEVICE_ID : r.deviceId;
    if (twin) {
      twin.soluong = (twin.soluong || 0) + (r.soluong || 0);
      twin.updatedAt = Date.now(); twin.deviceId = dev;
      tbData = softDeleteRecord(tbData, id);
    } else {
      r.tinhtrang = next; r.updatedAt = Date.now(); r.deviceId = dev;
    }
    save('tb_v1', tbData);
    mbToast(`🔧 ${r.ten}: ${next}${twin ? ' (gộp vào dòng trùng)' : ''}`, 'success');
    mbAfterWrite();
  },

  // Chỉ xóa được thiết bị trong KHO (giống tbDeleteRow desktop); ở công trình → điều chuyển về kho
  delTbMb: (id) => {
    const r = tbData.find(t => t.id === id && !t.deletedAt);
    if (!r) return;
    if (r.projectId !== 'COMPANY') { mbToast('Thiết bị ở công trình — hãy điều chuyển về kho trước khi xóa', 'error'); return; }
    if (!confirm(`Xóa ${r.soluong || 0} ${r.ten || ''} khỏi ${mbTbLoc(r)}?`)) return;
    const usr = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    tbData = softDeleteRecord(tbData, id, { deletedBy: (usr && usr.username) || 'Không rõ' });
    save('tb_v1', tbData);
    mbToast('Đã xóa thiết bị', 'success');
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

// ══════════════════════════════════════════════════════════════
//  TỈ TRỌNG & ĐỊNH MỨC (31/10/2026) — điều hướng / bung thu trên màn chỉ xem
// ══════════════════════════════════════════════════════════════
Object.assign(MB_ACTS, {
  // Đổi công trình ở dropdown → bỏ trạng thái bung / diện tích của công trình cũ
  tytPickCt: () => {
    Object.assign(MB, { tytOpen: {}, tytLim: {}, tytKsOpen: {}, tytDt: '', tytKlEdit: null, tytDm: mbTytDmRemembered(MB.tytCt) });
    mbRender();
  },

  tytScope: (arg) => { MB.tytAllYears = arg === '1'; mbRender(); },

  // Bung / thu 1 node (khóa node cây 4 nhóm, hoặc 'chua' / 'm2' / 'loai')
  tytToggle: (key) => { MB.tytOpen[key] = !MB.tytOpen[key]; mbRender(); },

  // Loại chi phí đang bung → hiện thêm 20 khoản
  tytMore: (key) => { MB.tytLim[key] = (MB.tytLim[key] || 20) + 20; mbRender(); },

  tytKsToggle: (k) => { MB.tytKsOpen[k] = !MB.tytKsOpen[k]; mbRender(); },

  tytDtReset: () => { MB.tytDt = ''; mbRender(); },

  // Bấm 1 công trình ở tab So sánh → xem tổng quan công trình đó
  tytOpenCt: (pid) => {
    Object.assign(MB, { tytCt: pid, tytOpen: {}, tytLim: {}, tytKsOpen: {}, tytDt: '', tytKlEdit: null, tytDm: mbTytDmRemembered(pid) });
    mbSeg('tytrong', 'tong');
  },

  // Năm tải lỗi → cho phép thử tải lại (giống tytTaiLai desktop)
  tytRetry: () => {
    const p = mbProject(MB.tytCt);
    if (p && typeof _tytTried !== 'undefined') tytNamVongDoi(p).forEach(y => _tytTried.delete(String(y)));
    mbRender();
  },

  // Lối tắt từ Chi tiết công trình
  openTyTrong: (pid) => {
    if (pid !== MB.tytCt) Object.assign(MB, { tytCt: pid, tytOpen: {}, tytLim: {}, tytKsOpen: {}, tytDt: '', tytKlEdit: null, tytDm: mbTytDmRemembered(pid) });
    mbGo('tytrong', { backPid: pid, seg: Object.assign({}, MB.seg, { tytrong: 'tong' }) });
  },
});

// ══════════════════════════════════════════════════════════════
//  QUYẾT TOÁN (31/10/2026) — lưu qua qtLuuQuyetToan() của desktop (1 logic duy nhất)
// ══════════════════════════════════════════════════════════════

/** Nạp form quyết toán của 1 công trình. Đã có quyết toán → nạp bản đó ở chế độ CHỈ XEM (quy tắc 1-1). */
function mbQtLoadForm(pid, preferId) {
  const { rec } = (typeof _qtRecordOfCt === 'function') ? _qtRecordOfCt(pid, preferId) : { rec: null };
  MB.qtCt = pid;
  if (rec) {
    const v = qtSoTien(rec);
    MB.qtForm = {
      editId: rec.id, loai: qtLoaiOf(rec), soTien: v ? mbGroup(v) : '', ngay: rec.ngay || mbToday(),
      nguoi: rec.nguoi || '', nd: rec.nd || '', chot: !!rec.chot,
      thuConLai: !!(typeof _qtAutoThuOf === 'function' && _qtAutoThuOf(rec.id)),   // đang có phiếu tự động → giữ bật
    };
    MB.qtLocked = true;
  } else {
    MB.qtForm = { editId: '', loai: 'tang', soTien: '', ngay: mbToday(), nguoi: '', nd: '', chot: false, thuConLai: false };
    MB.qtLocked = false;
  }
}

Object.assign(MB_ACTS, {
  openQtForm: (pid) => {
    mbQtLoadForm(pid);
    mbGo('quyettoan', { qtCt: pid, backPid: MB.backPid });
  },

  // Lối tắt từ Chi tiết công trình → Back quay lại công trình
  openQtFor: (pid) => {
    mbQtLoadForm(pid);
    mbGo('quyettoan', { qtCt: pid, backPid: pid });
  },

  qtSetLoai: (loai) => {
    if (MB.qtLocked || !QT_LOAI[loai]) return;
    MB.qtForm.loai = loai;
    // Giống qtOnLoaiChange desktop: "Thay thế" thường là bản chốt cuối → tự bật Chốt sổ khi nhập MỚI
    if (!MB.qtForm.editId) MB.qtForm.chot = loai === 'thaythe';
    mbRender();
  },

  qtToggle: (key) => {
    if (MB.qtLocked || (key !== 'chot' && key !== 'thuConLai')) return;
    MB.qtForm[key] = !MB.qtForm[key];
    mbRender();
  },

  qtUnlock: () => {
    if (!mbQtCanEdit()) { mbToast('Chỉ Quản trị viên hoặc Giám đốc được sửa quyết toán', 'error'); return; }
    MB.qtLocked = false;
    mbRender();
  },

  // Đang sửa bản đã lưu → nạp lại + khóa; đang thêm mới → về danh sách (hoặc chi tiết CT)
  qtCancel: () => {
    if (MB.qtForm.editId) { mbQtLoadForm(MB.qtCt); mbRender(); return; }
    MB_ACTS.back();
  },

  saveQtMb: () => {
    const F = MB.qtForm;
    const kq = qtLuuQuyetToan({
      pid: MB.qtCt, editId: F.editId, loai: F.loai, soTien: mbMoney(F.soTien), ngay: F.ngay,
      nd: F.nd, nguoi: F.nguoi, chot: F.chot, wantThu: !!F.thuConLai,
    });
    if (!kq.ok) return;
    const back = MB.backPid;
    mbAfterWrite();
    if (back) mbOpenProject(back);
    else mbGo('quyettoan', { qtCt: '' });
  },

  // Sửa từ lịch sử → mở form ở chế độ đã mở khóa
  editQtMb: (id) => {
    const r = quyetToanRecords.find(x => String(x.id) === String(id) && !x.deletedAt);
    const p = r ? (_qtResolveProj(r.projectId) || _qtResolveProj(r.congtrinh)) : null;
    if (!p) { mbToast('Không tìm thấy công trình của bản quyết toán', 'error'); return; }
    mbQtLoadForm(p.id, r.id);
    MB.qtLocked = !mbQtCanEdit();
    mbGo('quyettoan', { qtCt: p.id });
  },

  // Xóa mềm — qtDelete() desktop đã có hộp xác nhận + gỡ phiếu thu tự động đi kèm
  delQtMb: (id) => {
    if (typeof qtDelete !== 'function') { mbToast('Chưa sẵn sàng', 'error'); return; }
    qtDelete(id);
    mbAfterWrite();
  },

  moreQtHis: () => { MB.qtHisLimit += 20; mbRender(); },
});

// ══════════════════════════════════════════════════════════════
//  DANH MỤC (31/10/2026) — ghi qua đúng hàm desktop: addItem · dmDoiTen · delItem · updateCNRole
// ══════════════════════════════════════════════════════════════

/** Dòng idx còn đúng là tên lúc vẽ không? (danh mục vừa đồng bộ từ máy khác → idx có thể lệch) */
function mbDmIdxOk(idx) {
  const want = (MB._dmRowNames || {})[idx];
  if (want !== undefined && (cats[MB.dmType] || [])[idx] === want) return true;
  mbToast('🔄 Danh mục vừa được đồng bộ từ thiết bị khác — đã tải lại, vui lòng thao tác lại', 'info');
  MB.dmEditIdx = -1;
  mbRender();
  return false;
}

Object.assign(MB_ACTS, {
  dmPickType: (catId) => {
    Object.assign(MB, { dmType: catId, dmSearch: '', dmNew: '', dmEditIdx: -1, dmEditVal: '', dmLimit: 60 });
    mbRender();
  },

  toggleDmAllYears: () => { MB.dmAllYears = !MB.dmAllYears; mbRender(); },

  moreDm: () => { MB.dmLimit += 60; mbRender(); },

  // addItem() desktop tự chuẩn hóa tên + chống trùng (toast báo trùng) + lưu cloud
  addDmMb: () => {
    const val = (MB.dmNew || '').trim();
    if (!val) { mbToast('Nhập tên mục mới', 'error'); return; }
    const before = (cats[MB.dmType] || []).length;
    mbAddCat(MB.dmType, val);
    if ((cats[MB.dmType] || []).length > before) MB.dmNew = '';
    mbAfterWrite();
  },

  editDmMb: (arg) => {
    const idx = parseInt(arg, 10);
    if (!mbDmIdxOk(idx)) return;
    MB.dmEditIdx = idx;
    MB.dmEditVal = cats[MB.dmType][idx];
    mbRender();
    const el = document.getElementById('mb-dm-edit');
    if (el) { el.focus(); try { el.select(); } catch (e) { /* bỏ qua */ } }
  },

  cancelDmEdit: () => { MB.dmEditIdx = -1; MB.dmEditVal = ''; mbRender(); },

  saveDmNameMb: () => {
    const idx = MB.dmEditIdx;
    if (idx < 0 || !mbDmIdxOk(idx)) return;
    if (typeof dmDoiTen !== 'function') { mbToast('Chưa sẵn sàng', 'error'); return; }
    const old = cats[MB.dmType][idx];
    const val = (MB.dmEditVal || '').trim();
    if (!val) { mbToast('Tên không được để trống', 'error'); return; }
    const norm = normalizeName(MB.dmType, val);
    if (norm === old) { MB_ACTS.cancelDmEdit(); return; }   // không đổi gì
    if (!confirm(`Đổi tên "${old}" → "${norm}"?\nTên mới sẽ được cập nhật vào mọi hóa đơn / phiếu ứng / chấm công đã lưu.`)) return;
    if (!dmDoiTen(MB.dmType, idx, val)) { mbRender(); return; }   // trùng tên mục khác → giữ ô sửa (đã có toast)
    MB.dmEditIdx = -1; MB.dmEditVal = '';
    mbAfterWrite();
  },

  // delItem() desktop: chặn mục đang dùng + hỏi xác nhận + xóa mềm master
  delDmMb: (arg) => {
    const idx = parseInt(arg, 10);
    if (!mbDmIdxOk(idx)) return;
    if (typeof delItem !== 'function') { mbToast('Chưa sẵn sàng', 'error'); return; }
    delItem(MB.dmType, idx);
    MB.dmEditIdx = -1;
    mbAfterWrite();
  },

  // data-arg="idx|vai trò" ('' = bỏ vai trò)
  setCnRoleMb: (arg) => {
    const cut = arg.indexOf('|');
    const idx = parseInt(arg.slice(0, cut), 10);
    if (MB.dmType !== 'congNhan' || !mbDmIdxOk(idx)) return;
    if (typeof updateCNRole !== 'function') { mbToast('Chưa sẵn sàng', 'error'); return; }
    updateCNRole(idx, arg.slice(cut + 1));
    mbAfterWrite();
  },
});

// ══════════════════════════════════════════════════════════════
//  TỈ TRỌNG — nâng cao (31/10/2026): gán nhóm 1 chạm · sửa bảng M2 · nhớ bộ định mức theo công trình
// ══════════════════════════════════════════════════════════════
const MB_TYT_DM_KEY = '_mbTytDmTheoCt';   // localStorage: { projectId: id bộ định mức } — tiện ích riêng máy này

function mbTytDmMap() {
  try { return JSON.parse(localStorage.getItem(MB_TYT_DM_KEY) || '{}') || {}; } catch (e) { return {}; }
}

/** Bộ định mức đã chọn lần trước cho công trình (không có → '' = bộ đầu tiên) */
function mbTytDmRemembered(pid) { return (pid && mbTytDmMap()[pid]) || ''; }

Object.assign(MB_ACTS, {
  // Xếp 1 khoản "chưa xếp nhóm" vào nhóm n — giống tytChuaNhomKhoan desktop (gán tay, chỉ CT này).
  // data-arg="n|khóa khoản" (khóa có thể chứa "|" → cắt ở dấu đầu tiên)
  tytGanNhom: (arg) => {
    const cut = arg.indexOf('|');
    const n   = parseInt(arg.slice(0, cut), 10);
    const key = arg.slice(cut + 1);
    const p   = mbProject(MB.tytCt);
    if (!p || !key || !TYT_NHOM_DS.includes(n)) return;
    const st = tytStructOf(p.id);
    st.nhomTay[key] = n;
    tytSaveStruct(p.id, { nhomTay: st.nhomTay });
    mbToast(`✅ Đã xếp vào Nhóm ${n}: ${TYT_NHOM[n].ten}`, 'success');
    mbAfterWrite();
  },

  // Đổi bộ định mức → nhớ cho công trình đang xem
  tytPickDm: () => {
    if (MB.tytCt) {
      const m = mbTytDmMap();
      m[MB.tytCt] = MB.tytDm;
      try { localStorage.setItem(MB_TYT_DM_KEY, JSON.stringify(m)); } catch (e) { /* trình duyệt chặn lưu → bỏ qua */ }
    }
    mbRender();
  },

  // ── Bảng M2: sửa trên bản nháp MB.tytKlEdit, Lưu mới ghi vào công trình ──
  tytKlStart: () => {
    const p = mbProject(MB.tytCt);
    if (!p) return;
    const src = Array.isArray(p.khoiLuong) && p.khoiLuong.length ? p.khoiLuong : [{}, {}, {}];
    const num = v => (v === 0 || v) ? String(v).replace('.', ',') : '';
    MB.tytKlEdit = src.map(x => ({
      ten: (x && x.ten) || '', dvt: (x && x.dvt !== undefined) ? x.dvt : 'm2',
      kl: num(x && x.kl), heSo: (x && (x.heSo === 0 || x.heSo)) ? num(x.heSo) : '1', tinh: tytKlTinh(x),
    }));
    mbRender();
  },
  tytKlAdd:  () => { MB.tytKlEdit.push({ ten: '', dvt: 'm2', kl: '', heSo: '1', tinh: true }); mbRender(); },
  tytKlDel:  (i) => { MB.tytKlEdit.splice(parseInt(i, 10), 1); mbRender(); },
  tytKlTinh: (i) => { const x = MB.tytKlEdit[parseInt(i, 10)]; if (x) x.tinh = !x.tinh; mbRender(); },
  tytKlCancel: () => { MB.tytKlEdit = null; mbRender(); },

  // Cùng cách đọc + ghi như _tytKlRead / tytKlSave desktop
  tytKlSaveMb: () => {
    const p = mbProject(MB.tytCt);
    if (!p || !MB.tytKlEdit) return;
    const khoiLuong = [];
    MB.tytKlEdit.forEach(x => {
      const ten = (x.ten || '').trim(), klRaw = String(x.kl || '').trim(), hsRaw = String(x.heSo || '').trim();
      if (!ten && !klRaw) return;
      const heSo = hsRaw === '' ? 1 : tytKlNum(hsRaw);
      khoiLuong.push({ ten, dvt: (x.dvt || '').trim(), kl: tytKlNum(klRaw), heSo: heSo >= 0 ? heSo : 1, tinh: !!x.tinh });
    });
    try { updateProject(p.id, { khoiLuong }); }
    catch (e) { mbToast('❌ ' + ((e && e.message) || 'Không lưu được bảng M2'), 'error'); return; }
    MB.tytKlEdit = null;
    mbToast(`✅ Đã lưu bảng M2 — tổng sàn ${tytFmtM2(tytTongSanRows(khoiLuong))} m²`, 'success');
    mbAfterWrite();
  },
});
