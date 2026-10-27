// tienung.history.js — Tiền Ứng: lịch sử, filter, render, xóa, export CSV
// Load order: sau tienung.entry.js

// ══════════════════════════════
//  THỐNG KÊ ỨNG — 1 BẢNG GỘP Thầu Phụ + Nhà Cung Cấp (27/10/2026)
// ══════════════════════════════
// 3 nút chuyển nhanh (_ungKind: '' tất cả | 'thauphu' | 'nhacungcap') + 1 bộ lọc duy nhất:
//   #ung-search · #uf-dt (đối tác) · #uf-ct (công trình) · #uf-month. Bảng: #ung-all-section, trang ungPage.
// filteredUng = kết quả đang lọc; filteredUngTp / filteredUngNcc = 2 phần con (giữ cho code cũ / xuất CSV riêng).
let _ungKind = '';
const UNG_ALL_PG = 20;

function ungSetKind(kind) {
  _ungKind = kind || '';
  document.querySelectorAll('#ung-kind-group .btn').forEach(b => b.classList.toggle('active', b.dataset.kind === _ungKind));
  const dt = document.getElementById('uf-dt');
  if (dt) dt.value = '';   // đối tác của nhóm cũ có thể không thuộc nhóm mới
  buildUngFilters();
  filterAndRenderUngAll();
}

function _ungActive() {
  return ungRecords.filter(r => !r.deletedAt && (r.loai === 'thauphu' || r.loai === 'nhacungcap') && (!_ungKind || r.loai === _ungKind));
}

function buildUngFilters() {
  const active = _ungActive();
  const dts    = [...new Set(active.map(i => recCatName(i,'ung','tp')))].filter(Boolean).sort((a,b) => a.localeCompare(b,'vi'));
  const ctNames = [...new Set(active.map(i => resolveProjectName(i)))].filter(Boolean);
  const sortedCts = getAllProjects().map(p => p.name).filter(n => ctNames.includes(n));
  const months = [...new Set(active.map(i => (i.ngay||'').slice(0,7)))].filter(Boolean).sort().reverse();
  const fill = (id, ph, vals) => {
    const sel = document.getElementById(id); if (!sel) return;
    const cv = sel.value;
    sel.innerHTML = `<option value="">${ph}</option>` + vals.map(v => `<option ${v===cv?'selected':''} value="${x(v)}">${x(v)}</option>`).join('');
  };
  fill('uf-dt', _ungKind === 'thauphu' ? 'Tất cả thầu phụ' : _ungKind === 'nhacungcap' ? 'Tất cả nhà CC' : 'Tất cả đối tác', dts);
  fill('uf-ct', 'Tất cả công trình', sortedCts);
  fill('uf-month', 'Tất cả tháng', months);
}
// Tên cũ — code khác vẫn gọi
function buildUngTpFilters() { buildUngFilters(); }
function buildUngNccFilters() { buildUngFilters(); }

function filterAndRenderUngAll() {
  ungPage = 1;
  const q      = (document.getElementById('ung-search')?.value || '').toLowerCase();
  const fDt    = document.getElementById('uf-dt')?.value    || '';
  const fCt    = document.getElementById('uf-ct')?.value    || '';
  const fMonth = document.getElementById('uf-month')?.value || '';
  filteredUng = _ungActive().filter(r => {
    if (!inActiveYear(r.ngay)) return false;
    if (fDt    && recCatName(r,'ung','tp') !== fDt)     return false;
    if (fCt    && resolveProjectName(r) !== fCt)        return false;
    if (fMonth && !(r.ngay||'').startsWith(fMonth))     return false;
    if (q) { const t = [r.ngay, recCatName(r,'ung','tp'), resolveProjectName(r), r.nd].join(' ').toLowerCase(); if (!t.includes(q)) return false; }
    return true;
  });
  filteredUng.sort((a,b) => (b.ngay||'').localeCompare(a.ngay||''));
  filteredUngTp  = filteredUng.filter(r => r.loai === 'thauphu');
  filteredUngNcc = filteredUng.filter(r => r.loai === 'nhacungcap');
  renderUngTable();
}
// Tên cũ — code khác vẫn gọi
function filterAndRenderUngTp() { filterAndRenderUngAll(); }
function filterAndRenderUngNcc() { filterAndRenderUngAll(); }

// Backward-compat (gọi khi reload, đổi năm, delUngRecord, v.v.)
function filterAndRenderUng() {
  buildUngFilters();
  filterAndRenderUngAll();
  // Bảng "Phiếu Ứng Gần Đây" ở subtab Nhập — hook duy nhất tại đây tự phủ mọi
  // điểm dữ liệu thay đổi (lưu, xóa, mở tab, đổi năm, điều hướng từ tab Công Trình)
  renderUngMini();
}

// ══════════════════════════════
//  TABLE RENDERER
// ══════════════════════════════

function _ungTableHTML(pagedRecs, allRecs, paginationFn, curPage) {
  const mono = "font-family:'IBM Plex Mono',monospace";
  const tp = Math.ceil(allRecs.length / UNG_ALL_PG);
  const coLoai = !_ungKind;   // đang xem Tất cả → thêm nhãn TP / NCC cạnh tên đối tác
  const nameColLabel = _ungKind === 'thauphu' ? 'Thầu Phụ' : _ungKind === 'nhacungcap' ? 'Nhà Cung Cấp' : 'Đối Tác';
  // Dòng thống kê — theo kết quả ĐANG LỌC (allRecs), không phải chỉ trang hiện tại
  const sTp = sumBy(allRecs.filter(r => r.loai === 'thauphu'), 'tien'), sNcc = sumBy(allRecs.filter(r => r.loai === 'nhacungcap'), 'tien');
  const summaryHtml = `<span>${allRecs.length} bản ghi · Tổng: <strong class="text-primary" style="${mono}">${numFmt(sTp + sNcc)} đ</strong>${coLoai && sTp && sNcc ? ` <span style="font-size:11px">(TP ${numFmt(sTp)} · NCC ${numFmt(sNcc)})</span>` : ''}</span>`;
  let pagBtns = '';
  if (tp > 1) {
    const btns = [];
    for (let p = 1; p <= Math.min(tp, 10); p++) {
      btns.push(`<li class="page-item ${p===curPage?'active':''}"><button class="page-link" onclick="${paginationFn}(${p})">${p}</button></li>`);
    }
    if (tp > 10) btns.push(`<li class="page-item disabled"><span class="page-link">...${tp}</span></li>`);
    pagBtns = `<ul class="pagination pagination-sm mb-0">${btns.join('')}</ul>`;
  }
  const pagHtml = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:8px 12px;border-top:1px solid var(--bs-border-color);background:var(--bs-tertiary-bg);font-size:12px" class="text-secondary">
      ${summaryHtml}
      ${pagBtns}
    </div>`;
  const tag = r => !coLoai ? '' : (r.loai === 'thauphu'
    ? ' <span class="badge bg-primary-subtle text-primary" style="font-size:9.5px" title="Thầu phụ">TP</span>'
    : ' <span class="badge bg-warning-subtle text-warning-emphasis" style="font-size:9.5px" title="Nhà cung cấp">NCC</span>');
  // Sticky columns: dùng class chuyên để background bám theo hover state
  return `<div class="ung-table-wrap" style="overflow-x:auto">
    <table class="table table-sm table-hover align-middle mb-0 ung-sticky-table" style="min-width:580px">
      <thead><tr>
        <th class="ung-sticky-chk" style="width:32px;text-align:center">
          <input type="checkbox" class="ung-section-chk-all" title="Chọn tất cả dòng trang này"
            onchange="this.closest('table').querySelectorAll('.ung-row-chk').forEach(c=>c.checked=this.checked);_ungUpdateExportCount()">
        </th>
        <th style="white-space:nowrap">Ngày</th>
        <th class="ung-sticky-name" style="white-space:nowrap">${nameColLabel}</th>
        <th style="white-space:nowrap">Công Trình</th>
        <th>Nội Dung</th>
        <th style="text-align:right;white-space:nowrap">Số Tiền Ứng</th>
        <th></th>
      </tr></thead>
      <tbody>${pagedRecs.map(r => `<tr data-ung-id="${r.id}" class="${_editingUngId===r.id?'editing-row':''}">
        <td class="ung-sticky-chk" style="text-align:center;padding:4px">
          <input type="checkbox" class="ung-row-chk" data-id="${r.id}" style="width:15px;height:15px;cursor:pointer" onchange="_ungUpdateExportCount()">
        </td>
        <td class="text-secondary font-monospace" style="font-size:11px;white-space:nowrap">${fmtISODate(r.ngay)}</td>
        <td class="ung-sticky-name" style="font-weight:600;font-size:12px;white-space:nowrap">${x(recCatName(r,'ung','tp'))}${tag(r)}</td>
        <td class="text-secondary" style="white-space:nowrap">${x(resolveProjectName(r)||'—')}</td>
        <td class="text-secondary" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(r.nd)}">${x(r.nd||'—')}</td>
        <td class="text-end font-monospace fw-semibold text-primary" style="white-space:nowrap">${numFmt(r.tien||0)}</td>
        <td style="white-space:nowrap">
          ${_ungActionsHtml(r)}
        </td>
      </tr>`).join('')}</tbody>
    </table>
  </div>${pagHtml}`;
}

// ── Cột thao tác của 1 phiếu ứng ──
// Phiếu TỰ SINH từ Tất toán (tab Công Nợ TP/NCC, autoSettle) → CHỈ XEM: ẩn nút Sửa/Xóa, hiện nhãn khóa.
// Muốn hủy phải vào tab Công Nợ TP/NCC → Công Nợ → Lịch sử tất toán (hủy cả lô cho đúng sổ).
// Dùng chung cho bảng Thống kê ứng và bảng "Phiếu Ứng Gần Đây".
function _ungActionsHtml(r) {
  if (r.autoSettle) {
    return `<div style="display:flex;justify-content:flex-end">
      <span class="badge bg-secondary-subtle text-secondary-emphasis" style="font-size:10px;cursor:help"
        title="Phiếu tự sinh từ Tất toán${r.settledBy ? ' (' + x(r.settledBy) + ')' : ''} — chỉ xem. Muốn hủy: tab Công Nợ TP/NCC → Công Nợ → Lịch sử tất toán.">
        <span class="material-symbols-outlined" style="font-size:12px;vertical-align:-2px">lock</span> Tất toán</span>
    </div>`;
  }
  return `<div style="display:flex;gap:4px;justify-content:flex-end">
    <button class="btn btn-outline-secondary btn-sm" onclick="editUngRecord('${r.id}')"><span class="material-symbols-outlined">edit</span></button>
    <button class="btn btn-outline-danger btn-sm" onclick="delUngRecord('${r.id}')"><span class="material-symbols-outlined">close</span></button>
  </div>`;
}

function renderUngTable() {
  const container = document.getElementById('ung-all-section');
  if (!container) return;
  if (!filteredUng.length) {
    container.innerHTML = '<div class="text-secondary" style="text-align:center;padding:32px;font-size:13px">Không có phiếu ứng nào khớp bộ lọc</div>';
  } else {
    const paged = filteredUng.slice((ungPage-1)*UNG_ALL_PG, ungPage*UNG_ALL_PG);
    container.innerHTML = _ungTableHTML(paged, filteredUng, 'goUngTo', ungPage);
  }
  _ungUpdateExportCount();
}
// Tên cũ — code khác vẫn gọi
function renderUngTpSection() { renderUngTable(); }
function renderUngNccSection() { renderUngTable(); }

function goUngTo(p) { ungPage = p; renderUngTable(); }
function goUngTpTo(p) { goUngTo(p); }
function goUngNccTo(p) { goUngTo(p); }

// Số dòng đang tick → hiện ngay trên nút "Xuất Phiếu Ứng (n)"
function _ungUpdateExportCount() {
  const n = document.querySelectorAll('#ung-all-section .ung-row-chk:checked').length;
  const el = document.getElementById('ung-export-count');
  if (el) el.textContent = n ? `(${n})` : '';
  const btn = document.getElementById('ung-export-img-btn');
  if (btn) btn.style.opacity = n ? '1' : '.65';
}
// Xuất phiếu ứng PNG cho các dòng đang tick (cả TP lẫn NCC)
function exportUngToImageSel() {
  _exportUngImageFrom('ung-all-section', filteredUng);
}

// ─── Bảng "Phiếu Ứng Gần Đây" (subtab Nhập Tiền Ứng) ─────────────────────────
// 10 phiếu mới nhất trộn cả Thầu Phụ + Nhà Cung Cấp, có nút Sửa/Xóa
// (tái sử dụng editUngRecord/delUngRecord). KHÔNG có checkbox .ung-row-chk
// để không đụng các hàm xuất phiếu ảnh quét checkbox theo scope.
function renderUngMini() {
  const container = document.getElementById('ung-recent-section');
  if (!container) return;
  const recs = ungRecords
    .filter(r => !r.deletedAt && r.loai !== 'congnhan' && inActiveYear(r.ngay))
    .sort((a,b) => (b.ngay||'').localeCompare(a.ngay||'') || (b.updatedAt||0)-(a.updatedAt||0))
    .slice(0, 10);
  if (!recs.length) {
    container.innerHTML = '<div class="text-secondary" style="text-align:center;padding:32px;font-size:13px">Chưa có phiếu ứng nào</div>';
    return;
  }
  const mono = "font-family:'IBM Plex Mono',monospace";
  const rowsHtml = recs.map(r => {
    // Badge phân loại: TP (thầu phụ) xanh dương / NCC (nhà cung cấp) cam
    const isTp = r.loai === 'thauphu';
    const badge = isTp
      ? '<span class="badge text-bg-primary" style="font-size:10px">TP</span>'
      : '<span class="badge text-bg-warning" style="font-size:10px">NCC</span>';
    return `<tr data-ung-id="${r.id}" class="${_editingUngId===r.id?'editing-row':''}">
      <td class="text-secondary font-monospace" style="font-size:11px;white-space:nowrap">${fmtISODate(r.ngay)}</td>
      <td style="text-align:center">${badge}</td>
      <td style="font-weight:600;font-size:12px;white-space:nowrap">${x(recCatName(r,'ung','tp'))}</td>
      <td class="text-secondary" style="white-space:nowrap">${x(resolveProjectName(r)||'—')}</td>
      <td class="text-secondary" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(r.nd)}">${x(r.nd||'—')}</td>
      <td class="text-end font-monospace fw-semibold text-primary" style="white-space:nowrap">${numFmt(r.tien||0)}</td>
      <td style="white-space:nowrap">
        ${_ungActionsHtml(r)}
      </td>
    </tr>`;
  }).join('');
  const summaryHtml = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:8px 12px;border-top:1px solid var(--bs-border-color);background:var(--bs-tertiary-bg);font-size:12px" class="text-secondary">
      <span>Hiển thị ${recs.length} phiếu gần nhất · Tổng: <strong class="text-primary" style="${mono}">${numFmt(sumBy(recs,'tien'))} đ</strong></span>
    </div>`;
  container.innerHTML = `<div style="overflow-x:auto">
    <table class="table table-sm table-hover align-middle mb-0" style="min-width:560px">
      <thead><tr>
        <th style="white-space:nowrap">Ngày</th>
        <th style="text-align:center;width:48px">Loại</th>
        <th style="white-space:nowrap">Thầu Phụ / Nhà CC</th>
        <th style="white-space:nowrap">Công Trình</th>
        <th>Nội Dung</th>
        <th style="text-align:right;white-space:nowrap">Số Tiền Ứng</th>
        <th></th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>${summaryHtml}`;
}

// ══════════════════════════════
//  DELETE & EXPORT
// ══════════════════════════════

function delUngRecord(id) {
  const idx = ungRecords.findIndex(r => String(r.id) === String(id));
  if (idx < 0) return;
  // Phiếu tự sinh từ Tất toán → chỉ xem, không xóa lẻ ở đây
  if (ungRecords[idx].autoSettle) { toast('Phiếu tự sinh từ Tất toán — chỉ xem. Muốn hủy: tab Công Nợ TP/NCC → Công Nợ → Lịch sử tất toán', 'error'); return; }
  if (!confirm('Xóa bản ghi tiền ứng này?')) return;
  const now = Date.now();
  ungRecords[idx] = { ...ungRecords[idx], deletedAt: now, updatedAt: now, deviceId: DEVICE_ID, deletedBy: getCurrentUser()?.username || 'Không rõ' };
  save('ung_v1', ungRecords);
  buildUngFilters(); filterAndRenderUng(); _refreshAllTabs();
  toast('Đã xóa bản ghi tiền ứng');
}

function exportUngTpCSV() {
  const src = filteredUngTp.length > 0 ? filteredUngTp
    : ungRecords.filter(r => !r.deletedAt && r.loai === 'thauphu');
  const rows = [['Ngày','Thầu Phụ','Công Trình','Nội Dung','Số Tiền Ứng']];
  src.forEach(r => rows.push([r.ngay, recCatName(r,'ung','tp'), resolveProjectName(r)||'', r.nd||'', r.tien]));
  dlCSV(rows, 'ung_thauphu_' + today() + '.csv');
}

function exportUngNccCSV() {
  const src = filteredUngNcc.length > 0 ? filteredUngNcc
    : ungRecords.filter(r => !r.deletedAt && r.loai === 'nhacungcap');
  const rows = [['Ngày','Nhà Cung Cấp','Công Trình','Nội Dung','Số Tiền Ứng']];
  src.forEach(r => rows.push([r.ngay, recCatName(r,'ung','tp'), resolveProjectName(r)||'', r.nd||'', r.tien]));
  dlCSV(rows, 'ung_nhacungcap_' + today() + '.csv');
}

// Backward-compat (xuất tất cả — union của 2 bảng)
function exportUngAllCSV() {
  const src = filteredUng.length > 0 ? filteredUng
    : ungRecords.filter(r => !r.deletedAt && r.loai !== 'congnhan');
  const rows = [['Ngày','Thầu Phụ / Nhà CC','Công Trình','Nội Dung','Số Tiền Ứng']];
  src.forEach(r => rows.push([r.ngay, recCatName(r,'ung','tp'), resolveProjectName(r)||'', r.nd||'', r.tien]));
  dlCSV(rows, 'tien_ung_' + today() + '.csv');
}
