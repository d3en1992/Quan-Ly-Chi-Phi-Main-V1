// doanhthu.reports-export.js — Công nợ, Lãi/Lỗ, initDoanhThu, copy/paste KLCT, xuất phiếu ảnh
// Load order: sau doanhthu.forms.js

// ══ BẢNG CÔNG NỢ THẦU PHỤ ════════════════════════════════════

// ── Render bảng Công Nợ Thầu Phụ ─────────────────────────────
function renderCongNoThauPhu() {
  const tbody = document.getElementById('congno-tbody');
  const empty = document.getElementById('congno-empty');
  if (!tbody) return;

  // Gom nhóm theo key (thauphu ||| congtrinh)
  const map = {}; // key → { thauphu, congtrinh, tongUng, count, tongHD }

  // Nguồn 1: tiền ứng thầu phụ (ungRecords loai='thauphu')
  ungRecords
    .filter(r =>
      r.loai === 'thauphu' &&
      !r.deletedAt &&
      inActiveYear(r.ngay) &&
      _dtMatchProjFilter(r)
    )
    .forEach(r => {
      const ctDisplay = _resolveCtName(r);
      const key = (r.tp || '') + '|||' + ctDisplay;
      if (!map[key]) map[key] = { thauphu: r.tp || '', congtrinh: ctDisplay, tongUng: 0, count: 0, tongHD: 0 };
      map[key].tongUng += (r.tien || 0);
      map[key].count++;
    });

  // Nguồn 2: hợp đồng thầu phụ (thauPhuContracts)
  thauPhuContracts
    .filter(r => !r.deletedAt && _dtInYear(r.ngay) && _dtMatchProjFilter(r))
    .forEach(r => {
      const ctDisplay = _resolveCtName(r);
      const key = (r.thauphu || '') + '|||' + ctDisplay;
      if (!map[key]) map[key] = { thauphu: r.thauphu || '', congtrinh: ctDisplay, tongUng: 0, count: 0, tongHD: 0 };
      map[key].tongHD += (r.giaTri || 0) + (r.phatSinh || 0);
    });

  const rows = Object.values(map)
    .map(r => ({ ...r, name: r.thauphu }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi') || a.congtrinh.localeCompare(b.congtrinh, 'vi'));

  _renderCongNoTable(rows, tbody, empty);
}

function _renderCongNoTable(rows, tbody, empty) {
  if (!tbody) return;
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  let totUng = 0, totHD = 0, totConlai = 0;

  const dataRows = rows.map(row => {
    const conlai = (row.tongHD || 0) - (row.tongUng || 0);
    totUng    += row.tongUng || 0;
    totHD     += row.tongHD || 0;
    totConlai += conlai;
    const overdrawn    = (row.tongUng || 0) > (row.tongHD || 0) && (row.tongHD || 0) > 0;
    const conlaiClass  = overdrawn
      ? 'text-danger fw-bold'
      : (conlai === 0 ? 'text-secondary' : '');
    const countLabel   = row.count > 0
      ? `<span class="text-secondary" style="font-size:11px;margin-left:3px">(${row.count})</span>`
      : '';
    return `<tr>
      <td style="font-weight:600;white-space:nowrap">${x(row.name)}</td>
      <td style="white-space:nowrap">${x(row.congtrinh || '—')}</td>
      <td class="text-end font-monospace fw-semibold" style="white-space:nowrap;min-width:140px;font-size:14px">
        ${row.tongUng ? fmtS(row.tongUng) : '<span class="text-secondary">—</span>'}${countLabel}
      </td>
      <td class="text-end font-monospace fw-semibold" style="white-space:nowrap;min-width:140px;font-size:14px">
        ${row.tongHD ? fmtS(row.tongHD) : '<span class="text-secondary">—</span>'}
      </td>
      <td class="text-end font-monospace fw-semibold ${conlaiClass}" style="white-space:nowrap;min-width:140px;font-size:14px">
        ${fmtS(conlai)}
      </td>
    </tr>`;
  }).join('');

  const footerConlaiClass = totUng > totHD && totHD > 0 ? 'text-danger' : '';
  const footerRow = `<tr style="border-top:2px solid var(--bs-border-color);font-weight:700;background:var(--bs-tertiary-bg)">
    <td colspan="2" class="text-secondary" style="padding:8px 12px">Tổng cộng</td>
    <td class="text-end font-monospace" style="white-space:nowrap;padding:8px 10px;font-size:14px">${fmtS(totUng)}</td>
    <td class="text-end font-monospace" style="white-space:nowrap;padding:8px 10px;font-size:14px">${fmtS(totHD)}</td>
    <td class="text-end font-monospace ${footerConlaiClass}" style="white-space:nowrap;padding:8px 10px;font-size:14px">${fmtS(totConlai)}</td>
  </tr>`;

  tbody.innerHTML = dataRows + footerRow;
}

// ── Render bảng Công Nợ Nhà Cung Cấp ─────────────────────────
function renderCongNoNhaCungCap() {
  const tbody = document.getElementById('congno-ncc-tbody');
  const empty = document.getElementById('congno-ncc-empty');
  if (!tbody) return;

  const selProjId = (() => {
    if (!_dtCtFilter) return null;
    const p = getAllProjects().find(prj => prj.name === _dtCtFilter);
    return p ? p.id : null;
  })();

  const nccFromUng = new Set(
    ungRecords
      .filter(r =>
        r.loai === 'nhacungcap' &&
        !r.deletedAt &&
        inActiveYear(r.ngay)
      )
      .map(r => (r.tp || '').trim())
      .filter(Boolean)
  );

  const nccList = (typeof cats !== 'undefined' && cats.nhaCungCap) ? cats.nhaCungCap : [];
  const rows = [];
  let totUng = 0, totTien = 0, totCon = 0;

  nccList
    .filter(ncc => nccFromUng.has(ncc))
    .forEach(ncc => {
    let tongUng = 0, tongTien = 0;
    const ctSet = new Set();

    ungRecords
      .filter(r =>
        r.loai === 'nhacungcap' &&
        (r.tp || '') === ncc &&
        !r.deletedAt &&
        inActiveYear(r.ngay) &&
        (!selProjId || r.projectId === selProjId)
      )
      .forEach(r => { tongUng += (r.tien || 0); });

    getInvoicesCached()
      .filter(inv =>
        !inv.deletedAt &&
        inActiveYear(inv.ngay) &&
        (inv.ncc || '') === ncc &&
        (!selProjId || inv.projectId === selProjId)
      )
      .forEach(inv => {
        const proj = inv.projectId ? getProjectById(inv.projectId) : null;
        if (proj && proj.status === 'closed') return;
        const amt = inv.thanhtien || inv.tien || 0;
        tongTien += amt;
      });

    ungRecords
      .filter(r =>
        r.loai === 'nhacungcap' &&
        (r.tp || '') === ncc &&
        !r.deletedAt &&
        inActiveYear(r.ngay) &&
        (!selProjId || r.projectId === selProjId)
      )
      .forEach(r => {
        const proj = r.projectId ? getProjectById(r.projectId) : null;
        if (proj && proj.status === 'closed') return;
        const ctName = resolveProjectName(r) || ''; // [MODIFIED]
        if (ctName) ctSet.add(ctName);
      });

    if (tongUng === 0 && tongTien === 0 && ctSet.size === 0) return;

    const conPhaiTT = tongTien - tongUng;
    totUng += tongUng; totTien += tongTien; totCon += conPhaiTT;
    rows.push({
      name: ncc,
      congtrinh: Array.from(ctSet).join(', '),
      tongUng,
      tongHD: tongTien,
      conPhaiTT,
      count: 0
    });
    });

  rows.sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  _renderCongNoTable(rows, tbody, empty);
}

// ══ BẢNG LÃI/LỖ (Dashboard) ═══════════════════════════════════

// ── Render bảng Lãi/Lỗ trong Dashboard ───────────────────────
function renderLaiLo() {
  const wrap = document.getElementById('db-lailo-wrap');
  if (!wrap) return;

  // Tổng chi theo CT trong năm đang chọn
  const tongChi = {};
  getInvoicesCached().filter(i => inActiveYear(i.ngay)).forEach(i => {
    const ct = resolveProjectName(i) || '(Không rõ)';
    tongChi[ct] = (tongChi[ct] || 0) + (i.thanhtien || i.tien || 0);
  });

  // Tổng đã thu theo CT trong năm đang chọn
  const daThu = {};
  thuRecords.filter(r => !r.deletedAt && inActiveYear(r.ngay)).forEach(r => {
    const ct = resolveProjectName(r) || '';
    daThu[ct] = (daThu[ct] || 0) + (r.tien || 0);
  });

  // Hợp đồng theo CT (từ hopDongData — bỏ qua soft-deleted, lọc theo năm)
  // Key có thể là projectId (UUID) hoặc tên CT (legacy) → resolve sang tên cho hiển thị
  const hdByCT = {};
  const _llProjs = (typeof projects !== 'undefined') ? projects : [];
  Object.entries(hopDongData).filter(([, v]) => !v.deletedAt && _dtInYear(v.ngay)).forEach(([keyId, hd]) => {
    const p = _llProjs.find(proj => proj.id === keyId);
    const ctName = p ? p.name : keyId;
    hdByCT[ctName] = {
      giaTri:    hd.giaTri    || 0,
      giaTriphu: hd.giaTriphu || 0,
      phatSinh:  hd.phatSinh  || 0,
    };
  });

  // Gộp tất cả CT
  const allCts = [...new Set([
    ...Object.keys(tongChi),
    ...Object.keys(hdByCT)
  ])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi'));

  if (!allCts.length) {
    wrap.innerHTML = '<div class="db-empty">Chưa có dữ liệu</div>';
    return;
  }

  let tongHD = 0, tongHDPhu = 0, tongPS = 0, tongDT = 0, tongChi_ = 0, tongThu = 0;

  const rows = allCts.map(ct => {
    const hd       = hdByCT[ct] || {};
    const giaTri   = hd.giaTri    || 0;
    const giaTriphu= hd.giaTriphu || 0;
    const phatSinh = hd.phatSinh  || 0;
    const tongDTct = giaTri + giaTriphu + phatSinh;
    const chi      = tongChi[ct] || 0;
    const thu      = daThu[ct]   || 0;
    const conPhaiThu = tongDTct - thu;
    const laiLo    = tongDTct - chi;
    const llClass  = laiLo > 0 ? 'll-pos' : laiLo < 0 ? 'll-neg' : 'll-zero';
    const llPrefix = laiLo > 0 ? '+' : '';

    tongHD    += giaTri;
    tongHDPhu += giaTriphu;
    tongPS    += phatSinh;
    tongDT    += tongDTct;
    tongChi_  += chi;
    tongThu   += thu;

    return `<tr>
      <td>${x(ct)}</td>
      <td>${giaTri    ? fmtS(giaTri)    : '<span class="text-secondary">—</span>'}</td>
      <td>${giaTriphu ? fmtS(giaTriphu) : '<span class="text-secondary">—</span>'}</td>
      <td>${phatSinh  ? fmtS(phatSinh)  : '<span class="text-secondary">—</span>'}</td>
      <td style="font-weight:600">${tongDTct ? fmtS(tongDTct) : '—'}</td>
      <td class="text-danger">${fmtS(chi)}</td>
      <td class="text-success">${thu ? fmtS(thu) : '—'}</td>
      <td>${tongDTct ? fmtS(conPhaiThu) : '—'}</td>
      <td class="${llClass}">${tongDTct ? llPrefix + fmtS(laiLo) : '—'}</td>
    </tr>`;
  }).join('');

  const tongLaiLo  = tongDT - tongChi_;
  const tongLLClass = tongLaiLo > 0 ? 'll-pos' : tongLaiLo < 0 ? 'll-neg' : 'll-zero';

  wrap.innerHTML = `
    <div style="overflow-x:auto">
      <table class="table table-sm table-hover align-middle mb-0">
        <thead>
          <tr>
            <th style="text-align:left;min-width:140px">Công Trình</th>
            <th>HĐ Chính</th>
            <th>HĐ Phụ</th>
            <th>Phát Sinh</th>
            <th>Tổng DT</th>
            <th>Tổng Chi</th>
            <th>Đã Thu</th>
            <th>Còn Phải Thu</th>
            <th>Lãi / Lỗ</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td style="text-align:left">TỔNG CỘNG</td>
            <td>${fmtS(tongHD)}</td>
            <td>${fmtS(tongHDPhu)}</td>
            <td>${fmtS(tongPS)}</td>
            <td style="font-weight:700">${fmtS(tongDT)}</td>
            <td class="text-danger fw-bold">${fmtS(tongChi_)}</td>
            <td class="text-success fw-bold">${fmtS(tongThu)}</td>
            <td>${fmtS(tongDT - tongThu)}</td>
            <td class="${tongLLClass}">${tongDT ? (tongLaiLo >= 0 ? '+' : '') + fmtS(tongLaiLo) : '—'}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}

// ── Init tab Doanh Thu khi mở ─────────────────────────────────
function initDoanhThu() {
  // Reload dữ liệu mới nhất từ _mem (đã được dbInit() populate từ IDB)
  hopDongData      = load('hopdong_v1', {});
  thauPhuContracts = load('thauphu_v1', []);

  _initDoanhThuAddons(); // [ADDED]


  dtEnsureCongNoSubtab();
  dtPopulateSels();
  dtPopulateCtFilter();

  // Set ngày mặc định = hôm nay nếu chưa có
  const ngayEl = document.getElementById('thu-ngay');
  if (ngayEl && !ngayEl.value) ngayEl.value = today();
  const hdcNgayEl = document.getElementById('hdc-ngay');
  if (hdcNgayEl && !hdcNgayEl.value) hdcNgayEl.value = today();
  const hdtpNgayEl = document.getElementById('hdtp-ngay');
  if (hdtpNgayEl && !hdtpNgayEl.value) hdtpNgayEl.value = today();

  // Đảm bảo KHAI BÁO là sub-tab active mặc định
  const kbBtn = document.getElementById('dt-sub-khaibao-btn');
  const kbPage = document.getElementById('dt-sub-khaibao');
  const tkBtn  = document.getElementById('dt-sub-thongke-btn');
  const tkPage = document.getElementById('dt-sub-thongke');
  const cnBtn  = document.getElementById('dt-sub-congno-btn');
  const cnPage = document.getElementById('dt-sub-congno');
  document.querySelectorAll('#page-doanhthu .sub-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#page-doanhthu .nav-link').forEach(b => b.classList.remove('active'));
  if (kbBtn && kbPage) { kbPage.classList.add('active'); kbBtn.classList.add('active'); }
  if (tkPage) tkPage.classList.remove('active');
  if (tkBtn) tkBtn.classList.remove('active');
  if (cnPage) cnPage.classList.remove('active');
  if (cnBtn) cnBtn.classList.remove('active');

  // Reset edit state
  _hdcResetForm();
  _hdtpResetForm();
}

// Cấp ra global theo yêu cầu
window.initDoanhThu = initDoanhThu;
window.dtGoSub = dtGoSub;

// [ADDED COPY KLCT]
function copyKLCT(btn) {
  try {
    const container = btn.closest('.section, .card, .block') || btn.parentElement;
    const tbody = container.querySelector('tbody');
    if (!tbody) { toast('Không tìm thấy bảng dữ liệu', 'error'); return; }

    const rows = tbody.querySelectorAll('tr');
    const data = [];

    rows.forEach(tr => {
      const inputs = tr.querySelectorAll('input');
      if (inputs.length < 4) return;

      const row = {
        ten: inputs[0]?.value || '',
        donvi: inputs[1]?.value || '',
        khoiluong: inputs[2]?.value || '',
        dongia: (inputs[3]?.dataset?.raw || inputs[3]?.value || '').toString().replace(/[^0-9]/g, '')
      };

      if (row.ten || row.khoiluong || row.dongia) {
        data.push(row);
      }
    });

    if (!data.length) {
      toast('Không có dữ liệu để copy', 'error');
      return;
    }

    localStorage.setItem('klct_clipboard', JSON.stringify(data));

    // Highlight button
    const oldBg = btn.style.background;
    btn.style.background = '#e8f0fb';
    setTimeout(() => { btn.style.background = oldBg; }, 1000);

    toast('✅ Đã copy khối lượng chi tiết');
  } catch (e) {
    console.error(e);
    toast('❌ Copy thất bại', 'error');
  }
}

function pasteKLCT(btn) {
  try {
    const raw = localStorage.getItem('klct_clipboard');
    if (!raw) {
      toast('Chưa có dữ liệu copy', 'error');
      return;
    }
    const data = JSON.parse(raw);
    const container = btn.closest('.section, .card, .block') || btn.parentElement;
    const tbody = container.querySelector('tbody');
    if (!tbody) return;

    // Detect prefix from tbody ID
    const prefix = tbody.id.split('-')[0]; // hdc or hdtp
    const arr = prefix === 'hdc' ? _hdcItems : _hdtpItems;

    if (arr.length > 0 && !confirm('Bạn có muốn ghi đè dữ liệu chi tiết hiện có không?')) {
      return;
    }

    arr.length = 0;
    data.forEach(row => {
      arr.push({
        name: row.ten || '',
        donVi: row.donvi || '',
        sl: parseFloat(row.khoiluong) || 0,
        donGia: parseFloat(row.dongia) || 0
      });
    });

    if (window['render' + prefix + 'ChiTiet']) window['render' + prefix + 'ChiTiet']();
    if (window[prefix + 'CalcAuto'] ) window[prefix + 'CalcAuto']();

    // Auto scroll down to the table
    tbody.scrollIntoView({ behavior: 'smooth', block: 'end' });

    toast('📥 Đã dán khối lượng chi tiết');
  } catch (e) {
    console.error(e);
    toast('❌ Paste lỗi', 'error');
  }
}

function exportHdcToImage() {
  const checked = [...document.querySelectorAll('.hdc-row-chk:checked')];
  if (!checked.length) { toast('⚠️ Vui lòng tick chọn ít nhất 1 hợp đồng!', 'error'); return; }
  if (checked.length > 1) { toast('⚠️ Chỉ chọn 1 hợp đồng để xuất phiếu!', 'error'); return; }

  const keyId = checked[0].dataset.id;
  const hd = hopDongData[keyId];
  if (!hd) return;

  const ctName = projects.find(p => p.id === keyId)?.name || keyId;
  const total = (hd.giaTri || 0) + (hd.giaTriphu || 0) + (hd.phatSinh || 0);

  document.getElementById('phdc-ct-name').textContent = ctName;
  document.getElementById('phdc-ct-label').textContent = ctName;
  document.getElementById('phdc-date').textContent = hd.ngay || today();
  document.getElementById('phdc-nguoi').textContent = hd.nguoi || '—';
  document.getElementById('phdc-giatri').textContent = numFmt(hd.giaTri || 0) + ' đ';
  document.getElementById('phdc-phatsinh').textContent = numFmt((hd.giaTriphu || 0) + (hd.phatSinh || 0)) + ' đ';
  document.getElementById('phdc-tong').textContent = numFmt(total) + ' đ';

  const items = Array.isArray(hd.items) ? hd.items : [];
  let totalDetail = 0;
  document.getElementById('phdc-tbody').innerHTML = items.map(it => {
    const st = (it.sl || 0) * (it.donGia || 0);
    totalDetail += st;
    return `<tr>
      <td style="padding:8px 10px; border:1px solid #1a1814;">${x(it.name)}</td>
      <td style="padding:8px 10px; border:1px solid #1a1814; text-align:center;">${x(it.donVi || '—')}</td>
      <td style="padding:8px 10px; border:1px solid #1a1814; text-align:center;">${it.sl || 0}</td>
      <td style="padding:8px 10px; border:1px solid #1a1814; text-align:right;">${numFmt(it.donGia || 0)}</td>
      <td style="padding:8px 10px; border:1px solid #1a1814; text-align:right; font-weight:700;">${numFmt(st)}</td>
    </tr>`;
  }).join('');
  document.getElementById('phdc-total-detail').textContent = numFmt(totalDetail) + ' đ';

  const tpl = document.getElementById('hdchinh-template');
  tpl.style.display = 'block';
  toast('⏳ Đang tạo phiếu HĐ Công ty...', 'info');

  html2canvas(tpl, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: 800 }).then(canvas => {
    tpl.style.display = 'none';
    const link = document.createElement('a');
    link.download = 'HDChinh_' + removeVietnameseTones(ctName) + '_' + today() + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('✅ Đã xuất phiếu HĐ Công ty!', 'success');
  }).catch(err => { tpl.style.display = 'none'; toast('❌ Lỗi: ' + err.message, 'error'); });
}

function exportHdtpToImage() {
  const checked = [...document.querySelectorAll('.hdtp-row-chk:checked')];
  if (!checked.length) { toast('⚠️ Vui lòng tick chọn ít nhất 1 HĐ thầu phụ!', 'error'); return; }
  if (checked.length > 1) { toast('⚠️ Chỉ chọn 1 HĐ thầu phụ để xuất phiếu!', 'error'); return; }

  const id = checked[0].dataset.id;
  const r = thauPhuContracts.find(c => c.id === id);
  if (!r) return;

  const ctName = _resolveCtName(r);
  const total = (r.giaTri || 0) + (r.phatSinh || 0);

  document.getElementById('phdtp-ct-name').textContent = ctName;
  document.getElementById('phdtp-ct-label').textContent = ctName;
  document.getElementById('phdtp-date').textContent = r.ngay || today();
  document.getElementById('phdtp-thauphu').textContent = r.thauphu || '—';
  document.getElementById('phdtp-nd').textContent = r.nd || '—';
  document.getElementById('phdtp-giatri').textContent = numFmt(r.giaTri || 0) + ' đ';
  document.getElementById('phdtp-phatsinh').textContent = numFmt(r.phatSinh || 0) + ' đ';
  document.getElementById('phdtp-tong').textContent = numFmt(total) + ' đ';

  const items = Array.isArray(r.items) ? r.items : [];
  let totalDetail = 0;
  document.getElementById('phdtp-tbody').innerHTML = items.map(it => {
    const st = (it.sl || 0) * (it.donGia || 0);
    totalDetail += st;
    return `<tr>
      <td style="padding:8px 10px; border:1px solid #1a1814;">${x(it.name)}</td>
      <td style="padding:8px 10px; border:1px solid #1a1814; text-align:center;">${x(it.donVi || '—')}</td>
      <td style="padding:8px 10px; border:1px solid #1a1814; text-align:center;">${it.sl || 0}</td>
      <td style="padding:8px 10px; border:1px solid #1a1814; text-align:right;">${numFmt(it.donGia || 0)}</td>
      <td style="padding:8px 10px; border:1px solid #1a1814; text-align:right; font-weight:700;">${numFmt(st)}</td>
    </tr>`;
  }).join('');
  document.getElementById('phdtp-total-detail').textContent = numFmt(totalDetail) + ' đ';

  const tpl = document.getElementById('hdthauphu-template');
  tpl.style.display = 'block';
  toast('⏳ Đang tạo phiếu HĐ Thầu phụ...', 'info');

  html2canvas(tpl, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: 800 }).then(canvas => {
    tpl.style.display = 'none';
    const link = document.createElement('a');
    link.download = 'HDThauPhu_' + removeVietnameseTones(ctName) + '_' + removeVietnameseTones(r.thauphu||'') + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('✅ Đã xuất phiếu HĐ Thầu phụ!', 'success');
  }).catch(err => { tpl.style.display = 'none'; toast('❌ Lỗi: ' + err.message, 'error'); });
}

function exportThuToImage() {
  const checked = [...document.querySelectorAll('.thu-row-chk:checked')];
  if (!checked.length) { toast('⚠️ Vui lòng tick chọn ít nhất 1 lần thu tiền!', 'error'); return; }
  if (checked.length > 1) { toast('⚠️ Hiện tại chỉ hỗ trợ xuất phiếu thu cho từng đợt lẻ!', 'error'); return; }

  const id = checked[0].dataset.id;
  const r = thuRecords.find(t => t.id === id);
  if (!r) return;

  const ctName = _resolveCtName(r);

  document.getElementById('ppt-ct-name').textContent = ctName;
  document.getElementById('ppt-ct-label').textContent = ctName;
  document.getElementById('ppt-date').textContent = r.ngay || today();
  document.getElementById('ppt-nguoi').textContent = r.nguoi || '—';
  document.getElementById('ppt-tien').textContent = numFmt(r.tien || 0) + ' đ';
  document.getElementById('ppt-nd').textContent = r.nd || '—';

  const tpl = document.getElementById('phieuthu-template');
  tpl.style.display = 'block';
  toast('⏳ Đang tạo phiếu thu tiền...', 'info');

  html2canvas(tpl, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: 680 }).then(canvas => {
    tpl.style.display = 'none';
    const link = document.createElement('a');
    link.download = 'PhieuThu_' + removeVietnameseTones(ctName) + '_' + r.ngay + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('✅ Đã xuất phiếu thu tiền!', 'success');
  }).catch(err => { tpl.style.display = 'none'; toast('❌ Lỗi: ' + err.message, 'error'); });
}
