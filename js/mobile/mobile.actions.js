// ══════════════════════════════════════════════════════════════
// mobile.actions.js — Các hành động GHI dữ liệu của giao diện điện thoại
// Load order: sau mobile.screens.js
//
// QUY TẮC AN TOÀN:
//   - Ghi dữ liệu đi ĐÚNG đường của bản desktop: mkRecord()/mkUpdate() + save().
//     save() tự lo _mem → IndexedDB → hẹn giờ đẩy lên Firebase (sync.js).
//   - Chỗ nào bản desktop đã có hàm chuẩn thì GỌI LẠI hàm đó (danh mục, thùng rác)
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

// ══════════════════════════════════════════════════════════════
//  ĐĂNG KÝ HÀNH ĐỘNG — bổ sung vào bảng MB_ACTS của mobile.core.js
// ══════════════════════════════════════════════════════════════
Object.assign(MB_ACTS, {

  // ── Bộ lọc / chip chung: data-arg="khóaState|giá trị" ──
  setFilter: (arg) => {
    const [key, val] = arg.split('|');
    MB[key] = val;
    if (key === 'dtKind') MB.dtForm.tien = '';   // đổi loại khai báo → xóa số tiền cũ
    mbRender();
  },

  // Bấm vào cột biểu đồ tuần ở Tổng quan
  weekTip: (arg) => {
    const i   = parseInt(arg, 10);
    const sun = (typeof ccSundayISO === 'function') ? ccSundayISO(i - 5) : '';
    mbToast('Tuần ' + ((typeof weekLabel === 'function') ? weekLabel(sun) : sun), 'info');
  },

  // Nút tắt trong màn chi tiết công trình
  shortcut: (arg) => {
    const p = mbProject(MB.projectId);
    const ct = p ? p.name : '';
    if (arg === 'nhap')     { MB.form.ct = ct;    mbGo('nhap',     { seg: Object.assign({}, MB.seg, { nhap: 'nhanh' }) }); }
    if (arg === 'chamcong') { MB.ccCt = ct; MB.ccWorkers = null; mbGo('chamcong', { seg: Object.assign({}, MB.seg, { chamcong: 'so' }) }); }
    if (arg === 'tienung')  { MB.ungForm.ct = ct; mbGo('tienung',  { seg: Object.assign({}, MB.seg, { tienung: 'nhap' }) }); }
    if (arg === 'thu')      { MB.dtForm.ct = ct; MB.dtKind = 'thu'; mbGo('doanhthu', { seg: Object.assign({}, MB.seg, { doanhthu: 'khaibao' }) }); }
  },

  // ══════════════════════════════
  //  NHẬP HÓA ĐƠN NHANH
  // ══════════════════════════════
  clearForm: () => {
    Object.assign(MB.form, { ncc: '', nguoi: '', nd: '', sl: '', tien: '' });
    mbRender();
  },

  addDraft: () => {
    const f = MB.form;
    if (!f.ct)                        { mbToast('Chọn công trình', 'error'); return; }
    if (!f.nd.trim())                 { mbToast('Nhập nội dung', 'error'); return; }
    if (!mbNum(f.sl) || !mbMoney(f.tien)) { mbToast('Nhập số lượng và đơn giá', 'error'); return; }
    if (mbBlockClosed(f.ct)) return;

    MB.drafts.push({
      ngay: f.ngay, ct: f.ct, loai: f.loai, ncc: f.ncc.trim(), nguoi: f.nguoi.trim(),
      nd: f.nd.trim(), sl: mbNum(f.sl), tien: mbMoney(f.tien),
    });
    // Giữ lại ngày / CT / loại / NCC / người để nhập dòng tiếp cho nhanh
    Object.assign(MB.form, { nd: '', sl: '', tien: '' });
    mbRender();
  },

  delDraft: (arg) => { MB.drafts.splice(parseInt(arg, 10), 1); mbRender(); },

  saveDrafts: () => {
    if (!MB.drafts.length) { mbToast('Chưa có dòng nào để lưu', 'error'); return; }
    let n = 0;
    MB.drafts.forEach(d => {
      const thanhtien = Math.round(d.sl * d.tien);
      const fields = (typeof _ensureInvRef === 'function')
        ? _ensureInvRef({
            ngay: d.ngay, congtrinh: d.ct, loai: d.loai, nguoi: d.nguoi, ncc: d.ncc,
            nd: d.nd, sl: d.sl, tien: thanhtien, thanhtien, projectId: null, source: 'quick',
          })
        : { ngay: d.ngay, congtrinh: d.ct, loai: d.loai, nguoi: d.nguoi, ncc: d.ncc,
            nd: d.nd, sl: d.sl, tien: thanhtien, thanhtien, projectId: null, source: 'quick' };
      invoices.unshift(mkRecord(fields));
      n++;
    });
    save('inv_v3', invoices);
    MB.drafts = [];
    mbToast('✅ Đã lưu ' + n + ' hóa đơn', 'success');
    mbAfterWrite();
    MB.seg.nhap = 'tatca';
    mbRender();
  },

  // ══════════════════════════════
  //  HÓA ĐƠN CHI TIẾT NHIỀU DÒNG
  // ══════════════════════════════
  addItem: () => {
    const it = MB.itemForm;
    if (!it.ten.trim())                 { mbToast('Nhập tên vật tư', 'error'); return; }
    if (!mbNum(it.sl) || !mbMoney(it.dg)) { mbToast('Nhập số lượng và đơn giá', 'error'); return; }
    MB.detailItems.push({ ten: it.ten.trim(), dvt: it.dvt.trim(), sl: mbNum(it.sl), dg: mbMoney(it.dg) });
    Object.assign(MB.itemForm, { ten: '', dvt: '', sl: '', dg: '' });
    mbRender();
  },

  delItem: (arg) => { MB.detailItems.splice(parseInt(arg, 10), 1); mbRender(); },

  saveDetailInvoice: () => {
    const f = MB.detailForm;
    if (!f.ct)                  { mbToast('Chọn công trình', 'error'); return; }
    if (!MB.detailItems.length) { mbToast('Chưa có dòng vật tư nào', 'error'); return; }
    if (mbBlockClosed(f.ct)) return;

    const items = MB.detailItems.map(r => ({ ten: r.ten, dvt: r.dvt, sl: r.sl, dongia: r.dg, thanhtien: Math.round(r.sl * r.dg) }));
    const total = items.reduce((s, r) => s + r.thanhtien, 0);
    const nd    = (typeof buildNDFromItems === 'function') ? buildNDFromItems(items) : items.map(i => i.ten).join(', ');

    const fields = (typeof _ensureInvRef === 'function')
      ? _ensureInvRef({ ngay: f.ngay, congtrinh: f.ct, loai: f.loai, nguoi: f.nguoi.trim(), ncc: f.ncc.trim(),
                        nd, items, tien: total, thanhtien: total, projectId: null, source: 'detail' })
      : { ngay: f.ngay, congtrinh: f.ct, loai: f.loai, nguoi: f.nguoi.trim(), ncc: f.ncc.trim(),
          nd, items, tien: total, thanhtien: total, projectId: null, source: 'detail' };

    invoices.unshift(mkRecord(fields));
    save('inv_v3', invoices);
    MB.detailItems = [];
    mbToast('✅ Đã lưu hóa đơn chi tiết ' + mbFull(total), 'success');
    mbAfterWrite();
  },

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
    mbRender();
  },

  ccDelWorker: (arg) => { MB.ccWorkers.splice(parseInt(arg, 10), 1); mbRender(); },

  // Mở nhanh một tuần trong lịch sử
  ccOpenWeek: (arg) => {
    const [from, ct] = arg.split('|');
    // Tính offset tuần so với tuần hiện tại
    const curSun = (typeof ccSundayISO === 'function') ? ccSundayISO(0) : mbToday();
    const diff   = Math.round((new Date(from) - new Date(curSun)) / (7 * 86400000));
    MB.ccOffset  = diff;
    MB.ccCt      = ct;
    MB.ccWorkers = null;
    mbSeg('chamcong', 'so');
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

  // Sang màn Tiền Ứng, chọn sẵn loại "công nhân"
  goUngCN: () => {
    MB.ungKind = 'congnhan';
    mbGo('tienung', { seg: Object.assign({}, MB.seg, { tienung: 'nhap' }) });
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
  //  DOANH THU (HĐ chính · HĐ thầu phụ · Thu tiền)
  // ══════════════════════════════
  saveDt: () => {
    const f    = MB.dtForm;
    const kind = MB.dtKind;
    const tien = mbMoney(f.tien);
    if (!f.ct)  { mbToast('Chọn công trình', 'error'); return; }
    if (!tien)  { mbToast('Nhập số tiền', 'error'); return; }
    if (!f.ngay) { mbToast('Chọn ngày', 'error'); return; }

    const proj = mbFindProjByName(f.ct);
    if (!proj) { mbToast('Chỉ được tạo công trình tại tab Công Trình', 'error'); return; }
    const now = Date.now();

    if (kind === 'hdc') {
      // Hợp đồng chính — lưu vào map hopdong_v1, ưu tiên key = projectId
      const key = proj.id;
      const old = hopDongData[key] || {};
      hopDongData[key] = {
        ...old,
        giaTri: tien,
        giaTriphu: old.giaTriphu || 0,
        phatSinh:  old.phatSinh  || 0,
        nd:        f.nd.trim(),
        nguoi:     old.nguoi || '',
        khachHang: proj.chuDauTu || old.khachHang || '',
        projectId: proj.id,
        ngay:      f.ngay,
        createdAt: old.createdAt || now,
        updatedAt: now,
        deletedAt: null,
      };
      save('hopdong_v1', hopDongData);
      mbToast('✅ Đã lưu hợp đồng: ' + proj.name, 'success');

    } else if (kind === 'hdtp') {
      if (!f.tp.trim()) { mbToast('Nhập tên thầu phụ', 'error'); return; }
      thauPhuContracts.unshift(mkRecord({
        ngay: f.ngay, congtrinh: proj.name, projectId: proj.id,
        thauphu: f.tp.trim(), giaTri: tien, phatSinh: 0, nd: f.nd.trim(), items: [],
      }));
      save('thauphu_v1', thauPhuContracts);
      mbToast('✅ Đã lưu HĐ thầu phụ: ' + f.tp.trim(), 'success');

    } else {
      thuRecords.unshift(mkRecord({
        ngay: f.ngay, congtrinh: proj.name, projectId: proj.id,
        tien, nguoi: '', nd: f.nd.trim(), loaiThu: '',
      }));
      save('thu_v1', thuRecords);
      mbToast('✅ Đã ghi nhận thu ' + mbFull(tien) + ' — ' + proj.name, 'success');
    }

    Object.assign(MB.dtForm, { tien: '', nd: '' });
    mbAfterWrite();
  },

  // ══════════════════════════════
  //  DANH MỤC — gọi thẳng addItem()/delItem() của bản desktop
  //  để giữ nguyên luật chống trùng, kiểm tra "đang sử dụng", dọn ung_v1...
  // ══════════════════════════════
  addDm: () => {
    const catId = MB.dmType;
    const val   = (MB.dmNew || '').trim();
    if (!val) { mbToast('Nhập tên mục', 'error'); return; }
    if (typeof addItem !== 'function') { mbToast('Chưa sẵn sàng', 'error'); return; }

    // addItem() đọc giá trị từ ô nhập của bản desktop (id="sa-<catId>").
    // Ô này chỉ tồn tại sau renderSettings() → nếu chưa có thì tạo tạm một ô ẩn.
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

    MB.dmNew = '';
    mbAfterWrite();
  },

  delDm: (arg) => {
    const catId = MB.dmType;
    const idx   = parseInt(arg, 10);
    if (typeof delItem !== 'function') { mbToast('Chưa sẵn sàng', 'error'); return; }
    delItem(catId, idx);               // đã tự hỏi xác nhận + kiểm tra đang dùng
    mbAfterWrite();
  },

  // ══════════════════════════════
  //  THÙNG RÁC — gọi thẳng hàm của bản desktop
  // ══════════════════════════════
  trashRestore: (arg) => {
    if (typeof _trashRestore !== 'function') return;
    _trashRestore(arg);
    mbAfterWrite();
  },

  trashPurge: (arg) => {
    if (typeof _trashHardDelete !== 'function') return;
    _trashHardDelete(arg);             // đã tự hỏi xác nhận
    mbAfterWrite();
  },
});
