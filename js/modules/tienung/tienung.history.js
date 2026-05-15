// tienung.history.js — Tiền Ứng: lịch sử, filter, render, xóa, export CSV
// Load order: sau tienung.entry.js

// ══════════════════════════════
//  FILTER & RENDER
// ══════════════════════════════

function buildUngFilters() {
  const active = ungRecords.filter(r => !r.deletedAt);
  const tps    = [...new Set(active.map(i=>i.tp))].filter(Boolean).sort((a,b)=>a.localeCompare(b,'vi'));
  const cts    = [...new Set(active.map(i=>resolveProjectName(i)))].filter(Boolean);
  const sortedCts = getAllProjects().map(p => p.name).filter(name => cts.includes(name));
  const months = [...new Set(active.map(i=>i.ngay.slice(0,7)))].filter(Boolean).sort().reverse();

  const tpSel=document.getElementById('uf-tp'); const tv=tpSel.value;
  tpSel.innerHTML='<option value="">Tất cả TP/NCC</option>'+tps.map(v=>`<option ${v===tv?'selected':''} value="${x(v)}">${x(v)}</option>`).join('');
  const ctSel=document.getElementById('uf-ct'); const cv=ctSel.value;
  ctSel.innerHTML='<option value="">Tất cả công trình</option>'+sortedCts.map(v=>`<option ${v===cv?'selected':''} value="${x(v)}">${x(v)}</option>`).join('');
  const mSel=document.getElementById('uf-month'); const mv=mSel.value;
  mSel.innerHTML='<option value="">Tất cả tháng</option>'+months.map(m=>`<option ${m===mv?'selected':''} value="${m}">${m}</option>`).join('');
}

function filterAndRenderUng() {
  ungPage=1; ungTpPage=1;
  const q=document.getElementById('ung-search').value.toLowerCase();
  const fTp=document.getElementById('uf-tp').value;
  const fCt=document.getElementById('uf-ct').value;
  const fMonth=document.getElementById('uf-month').value;
  filteredUng = ungRecords.filter(r => {
    if(r.deletedAt) return false;
    if(r.loai === 'congnhan') return false;
    if(!inActiveYear(r.ngay)) return false;
    if(fTp && r.tp!==fTp) return false;
    if(fCt && resolveProjectName(r)!==fCt) return false;
    if(fMonth && !r.ngay.startsWith(fMonth)) return false;
    if(q) { const t=[r.ngay,r.tp,resolveProjectName(r),r.nd].join(' ').toLowerCase(); if(!t.includes(q)) return false; }
    return true;
  });

  filteredUng.sort((a, b) => (b.ngay || '').localeCompare(a.ngay || ''));
  renderUngTable();
}

function _ungSectionHTML(pagedRecs, allRecs, title, accentColor, curPage, pgSize, gotoFn, nameColLabel) {
  if (!allRecs.length) return '';
  const mono = "font-family:'IBM Plex Mono',monospace";
  const sumSec = sumBy(allRecs, 'tien');
  const tp = Math.ceil(allRecs.length / pgSize);
  let pagHtml = '';
  if (tp > 1) {
    const btns = [];
    for (let p = 1; p <= Math.min(tp, 10); p++) {
      btns.push(`<button class="page-btn ${p===curPage?'active':''}" onclick="${gotoFn}(${p})">${p}</button>`);
    }
    pagHtml = `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-top:1px solid var(--line);background:#f3f1ec;font-size:12px;color:var(--ink2)">
      <span>${allRecs.length} dòng · <span style="${mono};font-weight:700;color:${accentColor}">${fmtS(sumSec)}</span></span>
      <div class="page-btns">${btns.join('')}</div>
    </div>`;
  }
  return `<div style="margin-bottom:18px">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 12px;background:var(--bg);border-radius:6px;margin-bottom:8px;border-left:3px solid ${accentColor}">
      <span style="font-weight:700;font-size:12px;color:var(--ink2)">${title}</span>
      <span style="${mono};font-size:12px;font-weight:700;color:${accentColor}">${fmtS(sumSec)}</span>
    </div>
    <div style="overflow-x:auto">
      <table class="records-table">
        <thead><tr>
          <th style="width:32px;text-align:center">
            <input type="checkbox" class="ung-section-chk-all" title="Chọn tất cả"
              onchange="this.closest('table').querySelectorAll('.ung-row-chk').forEach(c=>c.checked=this.checked)">
          </th>
          <th>Ngày</th><th>${nameColLabel}</th><th>Công Trình</th><th>Nội Dung</th>
          <th style="text-align:right">Số Tiền Ứng</th><th></th>
        </tr></thead>
        <tbody>${pagedRecs.map(r=>`<tr data-ung-id="${r.id}" class="${_editingUngId===r.id?'editing-row':''}">
          <td style="text-align:center;padding:4px">
            <input type="checkbox" class="ung-row-chk" data-id="${r.id}" style="width:15px;height:15px;cursor:pointer">
          </td>
          <td style="${mono};font-size:11px;color:var(--ink2)">${fmtISODate(r.ngay)}</td>
          <td style="font-weight:600;font-size:12px">${x(r.tp)}</td>
          <td style="color:var(--ink2)">${x(resolveProjectName(r)||'—')}</td>
          <td style="color:var(--ink2);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(r.nd)}">${x(r.nd||'—')}</td>
          <td class="amount-td" style="color:var(--blue)">${numFmt(r.tien||0)}</td>
          <td style="white-space:nowrap;display:flex;gap:4px;justify-content:flex-end">
            <button class="btn btn-outline btn-sm" onclick="editUngRecord('${r.id}')">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="delUngRecord('${r.id}')">✕</button>
          </td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
    ${pagHtml}
  </div>`;
}

function renderUngTable() {
  const container = document.getElementById('ung-all-sections');
  const allTp = filteredUng.filter(r => r.loai === 'thauphu');
  const allNcc = filteredUng.filter(r => r.loai === 'nhacungcap');
  const sumTien = sumBy(filteredUng, 'tien');

  if (!allTp.length && !allNcc.length) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--ink3);font-size:14px">Không có dữ liệu tiền ứng nào</div>`;
    document.getElementById('ung-pagination').innerHTML = ''; return;
  }

  const tpPaged = allTp.slice((ungTpPage-1)*UNG_TP_PG, ungTpPage*UNG_TP_PG);
  const nccPaged = allNcc.slice((ungTpPage-1)*UNG_TP_PG, ungTpPage*UNG_TP_PG);

  container.innerHTML =
    _ungSectionHTML(tpPaged, allTp, 'Thầu Phụ', 'var(--gold)', ungTpPage, UNG_TP_PG, 'goUngTpTo', 'Thầu phụ') +
    _ungSectionHTML(nccPaged, allNcc, 'Nhà Cung Cấp', 'var(--green)', ungTpPage, UNG_TP_PG, 'goUngTpTo', 'Nhà cung cấp');

  const mono = "font-family:'IBM Plex Mono',monospace";
  document.getElementById('ung-pagination').innerHTML =
    `<span>${filteredUng.length} bản ghi · Tổng tiền ứng: <strong style="color:var(--blue);${mono}">${fmtS(sumTien)}</strong></span>`;
}

function goUngTpTo(p) { ungTpPage=p; renderUngTable(); }

// ══════════════════════════════
//  DELETE & EXPORT
// ══════════════════════════════

function delUngRecord(id) {
  const idx = ungRecords.findIndex(r=>String(r.id)===String(id));
  if(idx<0) return;
  if(!confirm('Xóa bản ghi tiền ứng này?')) return;
  const now = Date.now();
  ungRecords[idx] = { ...ungRecords[idx], deletedAt: now, updatedAt: now, deviceId: DEVICE_ID };
  save('ung_v1',ungRecords); buildUngFilters(); filterAndRenderUng(); _refreshAllTabs();
  toast('Đã xóa bản ghi tiền ứng');
}

function exportUngAllCSV() {
  const src=filteredUng.length>0?filteredUng:ungRecords;
  const rows=[['Ngày','Thầu Phụ / Nhà CC','Công Trình','Nội Dung','Số Tiền Ứng']];
  src.forEach(r=>rows.push([r.ngay,r.tp,r.congtrinh||'',r.nd||'',r.tien]));
  dlCSV(rows,'tien_ung_'+today()+'.csv');
}
