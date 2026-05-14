// nhapxuat.export.js — Export modal, sheet builders Excel và CSV exports
// Load order: sau nhapxuat.import.js
// Không gọi bất kỳ hàm export nào ở top-level vì một số data (doanhthu) nạp sau

'use strict';

// [10] EXPORT MODAL + EXPORT EXCEL — 10 sheets
// ══════════════════════════════════════════════════════════════

function openExportModal() {
  let ov = document.getElementById('export-modal-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'export-modal-overlay';
    ov.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center';
    ov.onclick = function(e) { if (e.target === this) ov.style.display = 'none'; };
    document.body.appendChild(ov);
  }

  const invCount  = invoices.filter(i        => !i.deletedAt && !i.ccKey).length;
  const ungCount  = ungRecords.filter(u       => !u.deletedAt).length;
  const ccWks     = ccData.filter(w           => !w.deletedAt).length;
  const cnCount   = ccData.filter(w           => !w.deletedAt).reduce((s, w) => s + (w.workers || []).length, 0);
  const tbCount   = tbData.filter(t           => !t.deletedAt).length;
  const thuCount  = thuRecords.filter(r       => !r.deletedAt).length;
  const tpCount   = thauPhuContracts.filter(r => !r.deletedAt).length;
  const hdCount   = Object.values(hopDongData).filter(v => !v.deletedAt).length;

  ov.innerHTML = `<div onclick="event.stopPropagation()" style="max-width:460px;width:95vw;background:#fff;border-radius:16px;padding:24px;font-family:'IBM Plex Sans',sans-serif;box-shadow:0 12px 48px rgba(0,0,0,.2);max-height:90vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-size:16px;font-weight:800;margin:0">📤 Xuất Toàn Bộ Dữ Liệu Ra Excel</h3>
      <button onclick="document.getElementById('export-modal-overlay').style.display='none'" style="background:none;border:none;font-size:22px;cursor:pointer;color:#888">✕</button>
    </div>
    <div style="background:#f0f9f4;border-radius:8px;padding:12px 16px;margin-bottom:14px;font-size:12.5px;color:#1a3c2a;line-height:2">
      <strong>Dữ liệu sẽ xuất (tất cả năm):</strong><br>
      🧾 ${invCount} hóa đơn &nbsp;·&nbsp; 💸 ${ungCount} tiền ứng &nbsp;·&nbsp; 👷 ${cnCount} CN (${ccWks} tuần)<br>
      🔧 ${tbCount} thiết bị &nbsp;·&nbsp; 💰 ${thuCount} lần thu &nbsp;·&nbsp; 🤝 ${tpCount} HĐ thầu phụ &nbsp;·&nbsp; 📋 ${hdCount} HĐ chính
    </div>
    <div style="background:#f0f4ff;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:11.5px;color:#444;line-height:1.8">
      <strong>10 sheets:</strong>
      1_HoaDonNhanh · 2_HoaDonChiTiet · 3_ChamCong · 4_TienUng · 5_ThietBi ·
      6_DanhMuc · 7_HopDongChinh · 8_ThuTien · 9_HopDongThauPhu · 10_HuongDan<br>
      <span style="color:#888">Ngày: yyyy-mm-dd · Số: không ký hiệu tiền · Có thể chỉnh sửa → import lại</span>
    </div>
    <div style="display:flex;gap:8px">
      <button onclick="document.getElementById('export-modal-overlay').style.display='none'" style="flex:1;padding:11px;border-radius:8px;border:1.5px solid #ccc;background:#fff;font-family:inherit;font-size:13px;cursor:pointer">Huỷ</button>
      <button onclick="exportExcel()" style="flex:2;padding:11px;border-radius:8px;border:none;background:#1a7a45;color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">📥 Tải export_full_data.xlsx</button>
    </div>
  </div>`;
  ov.style.display = 'flex';
}

// ── Sheet builder helper ─────────────────────────────────────
// headers: [{label, w, num?}]  rows: Array<Array>
// Row 1 = bold dark header, Row 2+ = data, freeze row 1
function _buildSheet(headers, rows) {
  const nCols = headers.length;
  const aoa   = [headers.map(h => h.label), ...rows];
  const ws    = XLSX.utils.aoa_to_sheet(aoa);

  ws['!cols'] = headers.map(h => ({ wch: h.w || 14 }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  ws['!rows']   = [{ hpt: 22 }];

  const S_H = {
    font:      { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
    fill:      { fgColor: { rgb: '1A1A2E' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  };
  const S_D  = { alignment: { vertical: 'top', wrapText: false } };
  const S_N  = { numFmt: '#,##0', alignment: { horizontal: 'right', vertical: 'top' } };

  for (let r = 0; r < aoa.length; r++) {
    for (let c = 0; c < nCols; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      ws[addr].s = r === 0 ? S_H : (headers[c] && headers[c].num ? S_N : S_D);
    }
  }
  return ws;
}

// ── Sheet 1: HoaDonNhanh ────────────────────────────────────
function buildHoaDonNhanh() {
  const hdrs = [
    { label: 'NGÀY',             w: 13 },
    { label: 'CÔNG TRÌNH',       w: 32 },
    { label: 'LOẠI CHI PHÍ',     w: 22 },
    { label: 'NỘI DUNG',         w: 36 },
    { label: 'SỐ TIỀN',          w: 15, num: true },
    { label: 'NGƯỜI THỰC HIỆN',  w: 22 },
    { label: 'NHÀ CUNG CẤP',     w: 24 },
    { label: 'SỐ HĐ',            w: 16 },
    { label: 'ID',               w: 36 },
  ];
  const rows = invoices
    .filter(i => !i.deletedAt && !i.ccKey && i.source !== 'detail' && !(Array.isArray(i.items) && i.items.length))
    .map(i => [
      i.ngay || '',
      i.congtrinh || '',
      i.loai || '',
      i.nd || '',
      i.tien || 0,
      i.nguoi || '',
      i.ncc || '',
      i.soHD || '',
      i.id || '',
    ]);
  return _buildSheet(hdrs, rows);
}

// ── Sheet 2: HoaDonChiTiet ──────────────────────────────────
function buildHoaDonChiTiet() {
  const hdrs = [
    { label: 'NGÀY',             w: 13 },
    { label: 'CÔNG TRÌNH',       w: 32 },
    { label: 'LOẠI CHI PHÍ',     w: 22 },
    { label: 'NGƯỜI THỰC HIỆN',  w: 22 },
    { label: 'NHÀ CUNG CẤP',     w: 24 },
    { label: 'SỐ HĐ',            w: 16 },
    { label: 'TÊN HÀNG HÓA',     w: 36 },
    { label: 'ĐVT',              w: 10 },
    { label: 'SỐ LƯỢNG',         w: 10, num: true },
    { label: 'ĐƠN GIÁ',          w: 14, num: true },
    { label: 'THÀNH TIỀN',       w: 15, num: true },
    { label: 'ID HÓA ĐƠN',       w: 36 },
  ];
  const rows = [];
  invoices
    .filter(i => !i.deletedAt && !i.ccKey && (i.source === 'detail' || (Array.isArray(i.items) && i.items.length)))
    .forEach(i => {
      const itemList = Array.isArray(i.items) ? i.items : [];
      itemList.forEach(it => {
        const sl = it.sl != null ? it.sl : (it.soluong != null ? it.soluong : 1);
        const dg = it.dongia || 0;
        const tt = it.thanhtien != null ? it.thanhtien : (sl * dg) || 0;
        rows.push([
          i.ngay       || '',
          resolveProjectName ? resolveProjectName(i) : (i.congtrinh || ''),
          i.loai       || '',
          i.nguoi      || '',
          i.ncc        || '',
          i.soHD       || '',
          it.ten       || '',
          it.dv        || it.dvt || '',
          sl,
          dg,
          tt,
          i.id         || '',
        ]);
      });
    });
  return _buildSheet(hdrs, rows);
}

// ── Sheet 3: ChamCong ───────────────────────────────────────
function buildChamCong() {
  const hdrs = [
    { label: 'NGÀY ĐẦU TUẦN',   w: 14 },
    { label: 'CÔNG TRÌNH',       w: 32 },
    { label: 'TÊN CN',           w: 22 },
    { label: 'VAI TRÒ',          w: 16 },
    { label: 'LƯƠNG NGÀY',       w: 13, num: true },
    { label: 'PHỤ CẤP',          w: 12, num: true },
    { label: 'HD MUA LẺ',        w: 12, num: true },
    { label: 'CN',               w:  6, num: true },
    { label: 'T2',               w:  6, num: true },
    { label: 'T3',               w:  6, num: true },
    { label: 'T4',               w:  6, num: true },
    { label: 'T5',               w:  6, num: true },
    { label: 'T6',               w:  6, num: true },
    { label: 'T7',               w:  6, num: true },
    { label: 'GHI CHÚ',          w: 28 },
  ];
  const rows = [];
  ccData
    .filter(w => !w.deletedAt)
    .forEach(week => {
      (week.workers || []).forEach(wk => {
        const d = wk.d || [0,0,0,0,0,0,0];
        rows.push([
          week.fromDate || '',
          week.ct || '',
          wk.name || '',
          wk.role || '',
          wk.luong || 0,
          wk.phucap || 0,
          wk.hdmuale || 0,
          d[0] || 0, d[1] || 0, d[2] || 0, d[3] || 0,
          d[4] || 0, d[5] || 0, d[6] || 0,
          wk.nd || '',
        ]);
      });
    });
  return _buildSheet(hdrs, rows);
}

// ── Sheet 4: TienUng ────────────────────────────────────────
function buildTienUng() {
  const hdrs = [
    { label: 'NGÀY',         w: 13 },
    { label: 'ĐỐI TƯỢNG',    w: 14 },
    { label: 'TÊN',          w: 26 },
    { label: 'CÔNG TRÌNH',   w: 32 },
    { label: 'SỐ TIỀN',      w: 15, num: true },
    { label: 'NỘI DUNG',     w: 36 },
    { label: 'ID',           w: 36 },
  ];
  const _ungLoaiLabel = loai => {
    if (loai === 'nhacungcap') return 'Nhà cung cấp';
    return 'Thầu phụ';
  };
  const rows = ungRecords
    .filter(u => !u.deletedAt && u.loai !== 'congnhan')
    .map(u => [
      u.ngay || '',
      _ungLoaiLabel(u.loai || 'thauphu'),
      u.tp || '',
      resolveProjectName ? resolveProjectName(u) : (u.congtrinh || ''),
      u.tien || 0,
      u.nd || '',
      u.id || '',
    ]);
  return _buildSheet(hdrs, rows);
}

// ── Sheet 5: ThietBi ────────────────────────────────────────
function buildThietBi() {
  const hdrs = [
    { label: 'NGÀY',         w: 13 },
    { label: 'CÔNG TRÌNH',   w: 32 },
    { label: 'TÊN THIẾT BỊ', w: 26 },
    { label: 'SỐ LƯỢNG',     w: 10, num: true },
    { label: 'TÌNH TRẠNG',   w: 22 },
    { label: 'GHI CHÚ',      w: 32 },
    { label: 'ID',           w: 36 },
  ];
  const rows = tbData
    .filter(t => !t.deletedAt)
    .map(t => [
      t.ngay || '',
      t.ct || '',
      t.ten || '',
      t.soluong != null ? t.soluong : 1,
      t.tinhtrang || '',
      t.ghichu || '',
      t.id || '',
    ]);
  return _buildSheet(hdrs, rows);
}

// ── Sheet 6: DanhMuc ────────────────────────────────────────
function buildDanhMuc() {
  const hdrs = [
    { label: 'LOẠI DANH MỤC', w: 28 },
    { label: 'TÊN',            w: 44 },
    { label: 'EXTRA',          w: 20 },
  ];
  const cnRolesObj = (typeof cnRoles !== 'undefined' && cnRoles) ? cnRoles : {};
  const groups = [
    ['Công Trình',              cats.congTrinh   || [],  null],
    ['Loại Chi Phí',            cats.loaiChiPhi  || [],  null],
    ['Nhà Cung Cấp',            cats.nhaCungCap  || [],  null],
    ['Người Thực Hiện',         cats.nguoiTH     || [],  null],
    ['Thầu Phụ / TP',           cats.thauPhu     || [],  null],
    ['Công Nhân',               cats.congNhan    || [],  'role'],
    ['Máy / Thiết Bị Thi Công', cats.tbTen       || [],  null],
  ];
  const rows = [];
  groups.forEach(([groupName, items, extraType]) => {
    items.forEach(item => {
      const extra = extraType === 'role' ? (cnRolesObj[item] || '') : '';
      rows.push([groupName, item, extra]);
    });
  });
  return _buildSheet(hdrs, rows);
}

// ── Sheet 7: HopDongChinh ───────────────────────────────────
function buildHopDongChinh() {
  const hdrs = [
    { label: 'NGÀY',                    w: 13 },
    { label: 'CÔNG TRÌNH',              w: 36 },
    { label: 'NGƯỜI THỰC HIỆN',         w: 22 },
    { label: 'GIÁ TRỊ HĐ CHÍNH',       w: 22, num: true },
    { label: 'GIÁ TRỊ HĐ PHỤ',         w: 20, num: true },
    { label: 'PHÁT SINH',               w: 15, num: true },
    { label: 'GHI CHÚ',                 w: 32 },
  ];
  const _expProjs = (typeof projects !== 'undefined') ? projects : [];
  const rows = Object.entries(hopDongData)
    .filter(([, v]) => !v.deletedAt)
    .map(([keyId, hd]) => {
      const p = _expProjs.find(proj => proj.id === keyId);
      const ctName = p ? p.name : keyId;
      return [
        hd.ngay || '',
        ctName,
        hd.nguoi || '',
        hd.giaTri    || 0,
        hd.giaTriphu || 0,
        hd.phatSinh  || 0,
        hd.nd || '',
      ];
    });
  return _buildSheet(hdrs, rows);
}

// ── Sheet 8: ThuTien ────────────────────────────────────────
function buildThuTien() {
  const hdrs = [
    { label: 'NGÀY',             w: 13 },
    { label: 'NGƯỜI THỰC HIỆN',  w: 22 },
    { label: 'CÔNG TRÌNH',       w: 32 },
    { label: 'SỐ TIỀN',          w: 15, num: true },
    { label: 'NỘI DUNG',         w: 36 },
    { label: 'ID',               w: 36 },
  ];
  const rows = thuRecords
    .filter(r => !r.deletedAt)
    .map(r => [
      r.ngay || '',
      r.nguoi || '',
      r.congtrinh || '',
      r.tien || 0,
      r.nd || '',
      r.id || '',
    ]);
  return _buildSheet(hdrs, rows);
}

// ── Sheet 9: HopDongThauPhu ─────────────────────────────────
function buildHopDongThauPhu() {
  const hdrs = [
    { label: 'NGÀY',              w: 13 },
    { label: 'CÔNG TRÌNH',        w: 32 },
    { label: 'TÊN THẦU PHỤ',     w: 26 },
    { label: 'GIÁ TRỊ HĐ',       w: 18, num: true },
    { label: 'PHÁT SINH',         w: 15, num: true },
    { label: 'NỘI DUNG',          w: 36 },
    { label: 'ID',                w: 36 },
  ];
  const rows = thauPhuContracts
    .filter(r => !r.deletedAt)
    .map(r => [
      r.ngay || '',
      r.congtrinh || '',
      r.thauphu || '',
      r.giaTri   || 0,
      r.phatSinh || 0,
      r.nd || '',
      r.id || '',
    ]);
  return _buildSheet(hdrs, rows);
}

// ── Sheet 10: HuongDan ──────────────────────────────────────
function buildHuongDan() {
  const hdrs = [{ label: 'HƯỚNG DẪN SỬ DỤNG FILE EXCEL', w: 90 }];
  const rows = [
    ['File export_full_data.xlsx chứa toàn bộ dữ liệu ứng dụng Quản Lý Công Trình.'],
    [''],
    ['━━━ CẤU TRÚC FILE ━━━'],
    ['1_HoaDonNhanh   — Hóa đơn nhập nhanh (1 dòng = 1 hóa đơn)'],
    ['2_HoaDonChiTiet — Hóa đơn chi tiết theo hàng hóa/vật tư (1 dòng = 1 mặt hàng)'],
    ['3_ChamCong       — Chấm công theo tuần (1 dòng = 1 công nhân/tuần)'],
    ['4_TienUng        — Tiền ứng (1 dòng = 1 khoản ứng)'],
    ['5_ThietBi        — Thiết bị thi công (1 dòng = 1 thiết bị)'],
    ['6_DanhMuc        — Danh mục toàn bộ (Công Trình, Loại Chi Phí, Nhà CC, Người TH, ...)'],
    ['7_HopDongChinh  — Hợp đồng chính theo công trình'],
    ['8_ThuTien        — Lịch sử thu tiền'],
    ['9_HopDongThauPhu — Hợp đồng thầu phụ'],
    [''],
    ['━━━ QUY TẮC IMPORT LẠI ━━━'],
    ['• Không xóa hoặc đổi tên dòng header (hàng đầu tiên của mỗi sheet)'],
    ['• Ngày theo định dạng yyyy-mm-dd (ví dụ: 2025-03-15)'],
    ['• Số tiền nhập dạng số nguyên, không có dấu chấm/phẩy/ký hiệu (ví dụ: 1500000)'],
    ['• Sheet 4_TienUng: cột ĐỐI TƯỢNG = "Thầu phụ" hoặc "Nhà cung cấp"'],
    ['• Sheet 6_DanhMuc: cột LOẠI DANH MỤC phải khớp chính xác tên nhóm'],
    ['• Sheet 6_DanhMuc: cột EXTRA dùng cho VAI TRÒ của Công Nhân (C=Chính, T=Thợ, P=Phụ)'],
    ['• Sheet 3_ChamCong: VAI TRÒ = C (chính), T (thợ), P (phụ) — để trống nếu không có'],
    ['• Có thể thêm dòng mới, chỉnh sửa dữ liệu, sau đó import lại file qua nút Nhập Excel'],
  ];
  return _buildSheet(hdrs, rows);
}

// ── exportExcel: tổng hợp 10 sheets ─────────────────────────
function exportExcel() {
  document.getElementById('export-modal-overlay').style.display = 'none';

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildHoaDonNhanh(),    '1_HoaDonNhanh');
  XLSX.utils.book_append_sheet(wb, buildHoaDonChiTiet(),  '2_HoaDonChiTiet');
  XLSX.utils.book_append_sheet(wb, buildChamCong(),       '3_ChamCong');
  XLSX.utils.book_append_sheet(wb, buildTienUng(),        '4_TienUng');
  XLSX.utils.book_append_sheet(wb, buildThietBi(),        '5_ThietBi');
  XLSX.utils.book_append_sheet(wb, buildDanhMuc(),        '6_DanhMuc');
  XLSX.utils.book_append_sheet(wb, buildHopDongChinh(),   '7_HopDongChinh');
  XLSX.utils.book_append_sheet(wb, buildThuTien(),        '8_ThuTien');
  XLSX.utils.book_append_sheet(wb, buildHopDongThauPhu(), '9_HopDongThauPhu');
  XLSX.utils.book_append_sheet(wb, buildHuongDan(),       '10_HuongDan');

  XLSX.writeFile(wb, 'export_full_data.xlsx');

  const invCount = invoices.filter(i => !i.deletedAt && !i.ccKey && i.source !== 'detail' && !(Array.isArray(i.items) && i.items.length)).length;
  const invDCount = invoices.filter(i => !i.deletedAt && !i.ccKey && (i.source === 'detail' || (Array.isArray(i.items) && i.items.length))).length;
  const ungCount = ungRecords.filter(u => !u.deletedAt && u.loai !== 'congnhan').length;
  const cnCount  = ccData.filter(w => !w.deletedAt).reduce((s, w) => s + (w.workers || []).length, 0);
  const thuCount = thuRecords.filter(r => !r.deletedAt).length;
  const tpCount  = thauPhuContracts.filter(r => !r.deletedAt).length;
  toast(
    `✅ Đã xuất ${invCount} HĐ nhanh · ${invDCount} HĐ chi tiết · ${ungCount} ứng · ${cnCount} CN · ${thuCount} thu · ${tpCount} HĐTP → export_full_data.xlsx`,
    'success'
  );
}

// ── _doExport: alias để không break các chỗ gọi cũ ──────────
function _doExport() {
  exportExcel();
}


// ══════════════════════════════════════════════════════════════
// [11] CSV EXPORTS
// ══════════════════════════════════════════════════════════════

function exportEntryCSV() {
  const rows = [['Loại Chi Phí','Công Trình','Người TH','Nhà Cung Cấp','Nội Dung','Số Tiền']];
  document.querySelectorAll('#entry-tbody tr').forEach(tr => {
    const loai = tr.querySelector('[data-f="loai"]')?.value || '';
    const ct   = tr.querySelector('[data-f="ct"]')?.value   || '';
    if (!loai && !ct) return;
    const tien = parseInt(tr.querySelector('[data-f="tien"]')?.dataset.raw || '0', 10) || 0;
    rows.push([loai, ct,
      tr.querySelector('[data-f="nguoi"]')?.value || '',
      tr.querySelector('[data-f="ncc"]')?.value   || '',
      tr.querySelector('[data-f="nd"]')?.value     || '',
      tien,
    ]);
  });
  dlCSV(rows, 'nhap_' + today() + '.csv');
}

function exportAllCSV() {
  const src = (typeof filteredInvs !== 'undefined') ? filteredInvs : getInvoicesCached().filter(i => !i.deletedAt);
  const rows = [['Ngày','Công Trình','Loại Chi Phí','Người TH','Nhà Cung Cấp','Nội Dung','Số Tiền']];
  src.filter(i => !i.deletedAt).forEach(i =>
    rows.push([i.ngay, resolveProjectName(i), i.loai, i.nguoi||'', i.ncc||'', i.nd||'', i.thanhtien||i.tien||0])
  );
  dlCSV(rows, 'thong_ke_cphd_' + today() + '.csv');
}

// ══════════════════════════════════════════════════════════════
// [12] PUBLIC WRAPPERS — Excel (gọi từ HTML onclick)
// ══════════════════════════════════════════════════════════════

function toolImportExcel() { document.getElementById('import-file-input').click(); }
function toolExportExcel() { openExportModal(); }
