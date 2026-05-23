// tienung.history.js — Tiền Ứng: lịch sử, filter, render, xóa, export CSV
// Load order: sau tienung.entry.js

// ══════════════════════════════
//  FILTER BUILDERS
// ══════════════════════════════

function buildUngTpFilters() {
  const active = ungRecords.filter(r => !r.deletedAt && r.loai === 'thauphu');
  const tps    = [...new Set(active.map(i => i.tp))].filter(Boolean).sort((a,b) => a.localeCompare(b,'vi'));
  const ctNames = [...new Set(active.map(i => resolveProjectName(i)))].filter(Boolean);
  const sortedCts = getAllProjects().map(p => p.name).filter(n => ctNames.includes(n));
  const months = [...new Set(active.map(i => i.ngay.slice(0,7)))].filter(Boolean).sort().reverse();

  const tpSel = document.getElementById('uf-tp-tp'); if (!tpSel) return;
  const tv = tpSel.value;
  tpSel.innerHTML = '<option value="">Tất cả thầu phụ</option>' +
    tps.map(v => `<option ${v===tv?'selected':''} value="${x(v)}">${x(v)}</option>`).join('');

  const ctSel = document.getElementById('uf-tp-ct');
  if (ctSel) { const cv = ctSel.value;
    ctSel.innerHTML = '<option value="">Tất cả công trình</option>' +
      sortedCts.map(v => `<option ${v===cv?'selected':''} value="${x(v)}">${x(v)}</option>`).join(''); }

  const mSel = document.getElementById('uf-tp-month');
  if (mSel) { const mv = mSel.value;
    mSel.innerHTML = '<option value="">Tất cả tháng</option>' +
      months.map(m => `<option ${m===mv?'selected':''} value="${m}">${m}</option>`).join(''); }
}

function buildUngNccFilters() {
  const active = ungRecords.filter(r => !r.deletedAt && r.loai === 'nhacungcap');
  const nccs   = [...new Set(active.map(i => i.tp))].filter(Boolean).sort((a,b) => a.localeCompare(b,'vi'));
  const ctNames = [...new Set(active.map(i => resolveProjectName(i)))].filter(Boolean);
  const sortedCts = getAllProjects().map(p => p.name).filter(n => ctNames.includes(n));
  const months = [...new Set(active.map(i => i.ngay.slice(0,7)))].filter(Boolean).sort().reverse();

  const nccSel = document.getElementById('uf-ncc-ncc'); if (!nccSel) return;
  const nv = nccSel.value;
  nccSel.innerHTML = '<option value="">Tất cả nhà CC</option>' +
    nccs.map(v => `<option ${v===nv?'selected':''} value="${x(v)}">${x(v)}</option>`).join('');

  const ctSel = document.getElementById('uf-ncc-ct');
  if (ctSel) { const cv = ctSel.value;
    ctSel.innerHTML = '<option value="">Tất cả công trình</option>' +
      sortedCts.map(v => `<option ${v===cv?'selected':''} value="${x(v)}">${x(v)}</option>`).join(''); }

  const mSel = document.getElementById('uf-ncc-month');
  if (mSel) { const mv = mSel.value;
    mSel.innerHTML = '<option value="">Tất cả tháng</option>' +
      months.map(m => `<option ${m===mv?'selected':''} value="${m}">${m}</option>`).join(''); }
}

// Backward-compat wrapper (called from delUngRecord, editUngRecord, etc.)
function buildUngFilters() {
  buildUngTpFilters();
  buildUngNccFilters();
}

// ══════════════════════════════
//  FILTER & RENDER
// ══════════════════════════════

function filterAndRenderUngTp() {
  ungTpPage = 1;
  const q      = (document.getElementById('ung-tp-search')?.value || '').toLowerCase();
  const fTp    = document.getElementById('uf-tp-tp')?.value    || '';
  const fCt    = document.getElementById('uf-tp-ct')?.value    || '';
  const fMonth = document.getElementById('uf-tp-month')?.value || '';
  filteredUngTp = ungRecords.filter(r => {
    if (r.deletedAt || r.loai !== 'thauphu') return false;
    if (!inActiveYear(r.ngay)) return false;
    if (fTp    && r.tp !== fTp)                         return false;
    if (fCt    && resolveProjectName(r) !== fCt)        return false;
    if (fMonth && !r.ngay.startsWith(fMonth))           return false;
    if (q) { const t = [r.ngay, r.tp, resolveProjectName(r), r.nd].join(' ').toLowerCase(); if (!t.includes(q)) return false; }
    return true;
  });
  filteredUngTp.sort((a,b) => (b.ngay||'').localeCompare(a.ngay||''));
  renderUngTpSection();
  _syncFilteredUng();
}

function filterAndRenderUngNcc() {
  ungNccPage = 1;
  const q      = (document.getElementById('ung-ncc-search')?.value || '').toLowerCase();
  const fNcc   = document.getElementById('uf-ncc-ncc')?.value   || '';
  const fCt    = document.getElementById('uf-ncc-ct')?.value    || '';
  const fMonth = document.getElementById('uf-ncc-month')?.value || '';
  filteredUngNcc = ungRecords.filter(r => {
    if (r.deletedAt || r.loai !== 'nhacungcap') return false;
    if (!inActiveYear(r.ngay)) return false;
    if (fNcc   && r.tp !== fNcc)                        return false;
    if (fCt    && resolveProjectName(r) !== fCt)        return false;
    if (fMonth && !r.ngay.startsWith(fMonth))           return false;
    if (q) { const t = [r.ngay, r.tp, resolveProjectName(r), r.nd].join(' ').toLowerCase(); if (!t.includes(q)) return false; }
    return true;
  });
  filteredUngNcc.sort((a,b) => (b.ngay||'').localeCompare(a.ngay||''));
  renderUngNccSection();
  _syncFilteredUng();
}

// Giữ filteredUng = union của 2 bảng (cho exportUngAllCSV / exportUngToImage)
function _syncFilteredUng() {
  filteredUng = [...filteredUngTp, ...filteredUngNcc]
    .sort((a,b) => (b.ngay||'').localeCompare(a.ngay||''));
}

// Backward-compat (gọi khi reload, đổi năm, delUngRecord, v.v.)
function filterAndRenderUng() {
  buildUngTpFilters();
  buildUngNccFilters();
  filterAndRenderUngTp();
  filterAndRenderUngNcc();
}

// ══════════════════════════════
//  TABLE RENDERERS
// ══════════════════════════════

function _ungTableHTML(pagedRecs, allRecs, nameColLabel, paginationFn, curPage) {
  const mono = "font-family:'IBM Plex Mono',monospace";
  const tp = Math.ceil(allRecs.length / UNG_TP_PG);
  let pagHtml = '';
  if (tp > 1) {
    const btns = [];
    for (let p = 1; p <= Math.min(tp, 10); p++) {
      btns.push(`<li class="page-item ${p===curPage?'active':''}"><button class="page-link" onclick="${paginationFn}(${p})">${p}</button></li>`);
    }
    pagHtml = `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-top:1px solid var(--bs-border-color);background:var(--bs-tertiary-bg);font-size:12px" class="text-secondary">
      <span>${allRecs.length} dòng · <span style="${mono};font-weight:700">${fmtS(sumBy(allRecs,'tien'))}</span></span>
      <ul class="pagination pagination-sm mb-0">${btns.join('')}</ul>
    </div>`;
  }
  return `<div style="overflow-x:auto">
    <table class="table table-sm table-hover align-middle mb-0" style="min-width:580px">
      <thead><tr>
        <th style="width:32px;text-align:center">
          <input type="checkbox" class="ung-section-chk-all" title="Chọn tất cả"
            onchange="this.closest('table').querySelectorAll('.ung-row-chk').forEach(c=>c.checked=this.checked)">
        </th>
        <th style="white-space:nowrap">Ngày</th>
        <th style="white-space:nowrap">${nameColLabel}</th>
        <th style="white-space:nowrap">Công Trình</th>
        <th>Nội Dung</th>
        <th style="text-align:right;white-space:nowrap">Số Tiền Ứng</th>
        <th></th>
      </tr></thead>
      <tbody>${pagedRecs.map(r => `<tr data-ung-id="${r.id}" class="${_editingUngId===r.id?'editing-row':''}">
        <td style="text-align:center;padding:4px">
          <input type="checkbox" class="ung-row-chk" data-id="${r.id}" style="width:15px;height:15px;cursor:pointer">
        </td>
        <td class="text-secondary font-monospace" style="font-size:11px;white-space:nowrap">${fmtISODate(r.ngay)}</td>
        <td style="font-weight:600;font-size:12px;white-space:nowrap">${x(r.tp)}</td>
        <td class="text-secondary" style="white-space:nowrap">${x(resolveProjectName(r)||'—')}</td>
        <td class="text-secondary" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(r.nd)}">${x(r.nd||'—')}</td>
        <td class="text-end font-monospace fw-semibold text-primary" style="white-space:nowrap">${numFmt(r.tien||0)}</td>
        <td style="white-space:nowrap">
          <div style="display:flex;gap:4px;justify-content:flex-end">
            <button class="btn btn-outline-secondary btn-sm" onclick="editUngRecord('${r.id}')">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="delUngRecord('${r.id}')">✕</button>
          </div>
        </td>
      </tr>`).join('')}</tbody>
    </table>
  </div>${pagHtml}`;
}

function renderUngTpSection() {
  const container = document.getElementById('ung-tp-section');
  const pagEl     = document.getElementById('ung-tp-pagination');
  if (!container) return;
  if (!filteredUngTp.length) {
    container.innerHTML = '<div class="text-secondary" style="text-align:center;padding:32px;font-size:13px">Không có dữ liệu thầu phụ</div>';
    if (pagEl) pagEl.innerHTML = ''; return;
  }
  const paged = filteredUngTp.slice((ungTpPage-1)*UNG_TP_PG, ungTpPage*UNG_TP_PG);
  container.innerHTML = _ungTableHTML(paged, filteredUngTp, 'Thầu Phụ', 'goUngTpTo', ungTpPage);
  if (pagEl) pagEl.innerHTML =
    `<span>${filteredUngTp.length} bản ghi · Tổng: <strong class="text-primary font-monospace">${fmtS(sumBy(filteredUngTp,'tien'))}</strong></span>`;
}

function renderUngNccSection() {
  const container = document.getElementById('ung-ncc-section');
  const pagEl     = document.getElementById('ung-ncc-pagination');
  if (!container) return;
  if (!filteredUngNcc.length) {
    container.innerHTML = '<div class="text-secondary" style="text-align:center;padding:32px;font-size:13px">Không có dữ liệu nhà cung cấp</div>';
    if (pagEl) pagEl.innerHTML = ''; return;
  }
  const paged = filteredUngNcc.slice((ungNccPage-1)*UNG_TP_PG, ungNccPage*UNG_TP_PG);
  container.innerHTML = _ungTableHTML(paged, filteredUngNcc, 'Nhà Cung Cấp', 'goUngNccTo', ungNccPage);
  if (pagEl) pagEl.innerHTML =
    `<span>${filteredUngNcc.length} bản ghi · Tổng: <strong class="text-primary font-monospace">${fmtS(sumBy(filteredUngNcc,'tien'))}</strong></span>`;
}

// Backward-compat wrapper — gọi cả 2 section
function renderUngTable() {
  renderUngTpSection();
  renderUngNccSection();
}

function goUngTpTo(p) { ungTpPage = p; renderUngTpSection(); }
function goUngNccTo(p) { ungNccPage = p; renderUngNccSection(); }

// ══════════════════════════════
//  DELETE & EXPORT
// ══════════════════════════════

function delUngRecord(id) {
  const idx = ungRecords.findIndex(r => String(r.id) === String(id));
  if (idx < 0) return;
  if (!confirm('Xóa bản ghi tiền ứng này?')) return;
  const now = Date.now();
  ungRecords[idx] = { ...ungRecords[idx], deletedAt: now, updatedAt: now, deviceId: DEVICE_ID };
  save('ung_v1', ungRecords);
  buildUngFilters(); filterAndRenderUng(); _refreshAllTabs();
  toast('Đã xóa bản ghi tiền ứng');
}

function exportUngTpCSV() {
  const src = filteredUngTp.length > 0 ? filteredUngTp
    : ungRecords.filter(r => !r.deletedAt && r.loai === 'thauphu');
  const rows = [['Ngày','Thầu Phụ','Công Trình','Nội Dung','Số Tiền Ứng']];
  src.forEach(r => rows.push([r.ngay, r.tp, resolveProjectName(r)||'', r.nd||'', r.tien]));
  dlCSV(rows, 'ung_thauphu_' + today() + '.csv');
}

function exportUngNccCSV() {
  const src = filteredUngNcc.length > 0 ? filteredUngNcc
    : ungRecords.filter(r => !r.deletedAt && r.loai === 'nhacungcap');
  const rows = [['Ngày','Nhà Cung Cấp','Công Trình','Nội Dung','Số Tiền Ứng']];
  src.forEach(r => rows.push([r.ngay, r.tp, resolveProjectName(r)||'', r.nd||'', r.tien]));
  dlCSV(rows, 'ung_nhacungcap_' + today() + '.csv');
}

// Backward-compat (xuất tất cả — union của 2 bảng)
function exportUngAllCSV() {
  const src = filteredUng.length > 0 ? filteredUng
    : ungRecords.filter(r => !r.deletedAt && r.loai !== 'congnhan');
  const rows = [['Ngày','Thầu Phụ / Nhà CC','Công Trình','Nội Dung','Số Tiền Ứng']];
  src.forEach(r => rows.push([r.ngay, r.tp, resolveProjectName(r)||'', r.nd||'', r.tien]));
  dlCSV(rows, 'tien_ung_' + today() + '.csv');
}
