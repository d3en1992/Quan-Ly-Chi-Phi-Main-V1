// danhmuc.ung.js — Tiền Ứng: global state, entry form, history, filter, export
// Load order: sau danhmuc.categories.js, trước danhmuc.tools.js

// ══════════════════════════════
//  TIỀN ỨNG - GLOBAL STATE
// ══════════════════════════════
// ungRecords là global shared — _reloadGlobals(), nhapxuat.js, projects.js, doanhthu.js đọc/gán lại
let ungRecords = load('ung_v1', []);
let filteredUng = [];
let ungPage = 1;
const UNG_TP_PG = 10;
let ungTpPage = 1;
let _editingUngId = null;

// ── Migration top-level: chạy ngay khi file nạp ──────────────────

// Chuẩn hóa dữ liệu cũ: cancelled=true -> deletedAt
function _normalizeUngDeletedAt() {
  // Guard: bỏ qua nếu không còn record nào có field 'cancelled' (migration đã chạy xong)
  if (!(ungRecords || []).some(r => r && Object.prototype.hasOwnProperty.call(r, 'cancelled'))) return;
  let changed = false;
  ungRecords = ungRecords.map(r => {
    if (!r) return r;
    if (r.cancelled === true && !r.deletedAt) {
      changed = true;
      return { ...r, deletedAt: r.updatedAt || Date.now() };
    }
    if (Object.prototype.hasOwnProperty.call(r, 'cancelled')) {
      changed = true;
      const rec = { ...r };
      delete rec.cancelled;
      return rec;
    }
    return r;
  });
  if (changed) save('ung_v1', ungRecords);
}
_normalizeUngDeletedAt();

function _normalizeUngProjectIds() {
  // Guard: bỏ qua nếu mọi record đã có projectId (migration đã chạy xong)
  if (!(ungRecords || []).some(r => !r.deletedAt && !r.projectId && r.congtrinh)) return;
  let changed = false;
  ungRecords.forEach(r => {
    if (r.deletedAt) return;
    if (!r.projectId && r.congtrinh) {
      const pid = _getProjectIdByName(r.congtrinh);
      if (pid) { r.projectId = pid; changed = true; }
    }
    // Sync name from project if needed
    if (r.projectId) {
      const pName = _getProjectNameById(r.projectId);
      if (pName && pName !== r.congtrinh) {
        r.congtrinh = pName;
        changed = true;
      }
    }
  });
  if (changed) save('ung_v1', ungRecords);
}
_normalizeUngProjectIds();

// Cleanup dữ liệu sai: loại tên NCC/CN nằm nhầm trong danh mục thầu phụ
cats.thauPhu = (cats.thauPhu || []).filter(name =>
  ungRecords.some(r => r.loai === 'thauphu' && r.tp === name)
  || !ungRecords.some(r => r.tp === name)
);

// ══════════════════════════════
//  TIỀN ỨNG - ENTRY TABLE
// ══════════════════════════════

function initUngTable(n=4) {
  document.getElementById('ung-tbody').innerHTML='';
  for(let i=0;i<n;i++) addUngRow();
  calcUngSummary();
}

function initUngTableIfEmpty() {
  if(document.getElementById('ung-tbody').children.length===0) initUngTable(4);
}

function addUngRows(n) { for(let i=0;i<n;i++) addUngRow(); }

function clearUngRows() {
  const tbody = document.getElementById('ung-tbody');
  if (tbody) tbody.innerHTML = '';
  calcUngSummary();
}

function resetUngForm() {
  _editingUngId = null;
  initUngTable(4);
  document.getElementById('ung-date').value = today();
  const btn = document.getElementById('ung-save-btn');
  if (btn) btn.textContent = '💾 Lưu tất cả';
  calcUngSummary();
  document.querySelectorAll('.editing-row').forEach(tr => tr.classList.remove('editing-row'));
}

function onUngLoaiChange(sel) {
  const tr = sel.closest('tr');
  const tpInp = tr.querySelector('[data-f="tp"]');
  if (!tpInp) return;
  const loai = sel.value;
  tpInp.value = '';
  tpInp.placeholder = loai === 'nhacungcap'
    ? 'Chọn nhà cung cấp...'
    : 'Chọn thầu phụ...';
  calcUngSummary();
}

function _ungTpOptions(loai) {
  if (loai === 'nhacungcap') return cats.nhaCungCap;
  return cats.thauPhu;
}

function addUngRow(d={}) {
  const tbody = document.getElementById('ung-tbody');
  const num = tbody.children.length + 1;
  const ctOpts = _buildProjOpts(d.congtrinh||'', '-- Chọn --');
  const dLoai = d.loai || 'thauphu';
  const tpPlaceholder = dLoai === 'nhacungcap'
    ? 'Chọn nhà cung cấp...'
    : 'Chọn thầu phụ...';

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="row-num">${num}</td>
    <td style="padding:0">
      <select class="cell-input" data-f="loai" style="width:100%;border:none;background:transparent;padding:7px 6px;font-size:12px;font-weight:600;outline:none;color:var(--ink);cursor:pointer" onchange="onUngLoaiChange(this)">
        <option value="thauphu" ${dLoai==='thauphu'?'selected':''}>Thầu phụ</option>
        <option value="nhacungcap" ${dLoai==='nhacungcap'?'selected':''}>Nhà cung cấp</option>
      </select>
    </td>
    <td>
      <input class="cell-input" data-f="tp" value="${x(d.tp||'')}" placeholder="${tpPlaceholder}" autocomplete="off">
    </td>
    <td><select class="cell-input" data-f="ct">${ctOpts}</select></td>
    <td><input class="cell-input right tien-input" data-f="tien" data-raw="${d.tien||''}" placeholder="0" value="${d.tien?numFmt(d.tien):''}" inputmode="decimal"></td>
    <td><input class="cell-input" data-f="nd" value="${x(d.nd||'')}" placeholder="Nội dung..."></td>
    <td><button class="del-btn" onclick="delUngRow(this)">✕</button></td>
  `;

  const tienInput = tr.querySelector('[data-f="tien"]');
  tienInput.addEventListener('input', function() {
    const raw = this.value.replace(/[.,]/g,'');
    this.dataset.raw = raw;
    if(raw) this.value = numFmt(parseInt(raw,10)||0);
    calcUngSummary();
  });
  tienInput.addEventListener('focus', function() { this.value = this.dataset.raw || ''; });
  tienInput.addEventListener('blur',  function() {
    const raw = parseInt(this.dataset.raw||'0',10)||0;
    this.value = raw ? numFmt(raw) : '';
  });

  // Autocomplete cho ô Thầu Phụ / Công Nhân
  const tpInp = tr.querySelector('[data-f="tp"]');
  const _tpAC = () => {
    const loai = tr.querySelector('[data-f="loai"]')?.value || 'thauphu';
    _acShow(tpInp, _ungTpOptions(loai), v => { tpInp.value = v; calcUngSummary(); });
  };
  tpInp.addEventListener('input',  _tpAC);
  tpInp.addEventListener('focus',  _tpAC);
  tpInp.addEventListener('blur', function() {
    const v = this.value.trim();
    if (!v) return;
    const loai = tr.querySelector('[data-f="loai"]')?.value || 'thauphu';
    const opts = _ungTpOptions(loai);
    // Tìm tên chuẩn trong danh mục (so sánh normalized) thay vì ép toUpperCase mù quáng
    const canonical = opts.find(o => normalizeKey(o) === normalizeKey(v));
    if (!canonical) {
      toast('⚠️ "' + v + '" không có trong danh mục!', 'error');
      this.value = '';
      calcUngSummary();
    } else {
      this.value = canonical; // điền đúng tên chuẩn từ danh mục
    }
  });

  tr.querySelectorAll('input,select').forEach(el => {
    if(el.dataset.f!=='tien' && el.dataset.f!=='tp') { el.addEventListener('input', calcUngSummary); el.addEventListener('change', calcUngSummary); }
  });
  tbody.appendChild(tr);
}

function delUngRow(btn) { btn.closest('tr').remove(); renumberUng(); calcUngSummary(); }

function renumberUng() { renumberRows('#ung-tbody'); }

function calcUngSummary() {
  let cnt=0, total=0;
  document.querySelectorAll('#ung-tbody tr').forEach(tr => {
    const tp  = tr.querySelector('[data-f="tp"]')?.value||'';
    const tien = parseInt(tr.querySelector('[data-f="tien"]')?.dataset.raw||'0',10)||0;
    if(tp||tien>0) { cnt++; total+=tien; }
  });
  document.getElementById('ung-row-count').textContent=cnt;
  document.getElementById('ung-entry-total').textContent=fmtM(total);
}

function clearUngTable() {
  if(!confirm('Xóa toàn bộ bảng nhập tiền ứng?')) return;
  initUngTable(4);
}

function saveAllUngRows() {
  const date = document.getElementById('ung-date').value;
  if(!date) { toast('Vui lòng chọn ngày!','error'); return; }
  let saved=0, errRow=0;
  const rowsData=[];
  document.querySelectorAll('#ung-tbody tr').forEach(tr => {
    const tp = (tr.querySelector('[data-f="tp"]')?.value||'').trim();
    const tien = parseInt(tr.querySelector('[data-f="tien"]')?.dataset.raw||'0',10)||0;
    if(!tp&&!tien) return;
    if(!tp) { errRow++; tr.style.background='#fdecea'; return; }
    const ctSel = tr.querySelector('[data-f="ct"]');
    const ct    = (ctSel?.value||'').trim();
    const ctPid = _readPidFromSel(ctSel);
    // Kiểm tra công trình đã quyết toán
    if (ctPid && ctPid !== 'COMPANY') {
      const proj = getProjectById(ctPid);
      if (proj && proj.status === 'closed') { errRow++; tr.style.background='#fdecea'; return; }
    }
    tr.style.background='';
    rowsData.push({
      ngay: date,
      loai: (tr.querySelector('[data-f="loai"]')?.value||'thauphu'),
      tp, congtrinh: ct,
      projectId: ctPid || null,
      tien,
      nd: (tr.querySelector('[data-f="nd"]')?.value||'').trim()
    });
  });
  if(errRow>0) { toast(`${errRow} dòng có lỗi (thiếu TP/NCC hoặc CT đã quyết toán)!`,'error'); return; }
  if(rowsData.length===0) { toast('Không có dòng hợp lệ!','error'); return; }

  if (_editingUngId != null) {
    const idx = ungRecords.findIndex(r => String(r.id) === String(_editingUngId));
    if (idx < 0) { toast('Không tìm thấy bản ghi đang sửa!','error'); return; }
    const rec = rowsData[0]; // khi sửa chỉ xử lý 1 dòng
    ungRecords[idx] = {
      ...ungRecords[idx],
      ...rec,
      updatedAt: Date.now(),
      deviceId: DEVICE_ID
    };
    saved = 1;
  } else {
    rowsData.forEach(rec => {
      ungRecords.unshift(mkRecord(rec));
      saved++;
    });
  }

  save('ung_v1', ungRecords);
  toast(`✅ Đã ${_editingUngId ? 'cập nhật' : 'lưu'} ${saved} tiền ứng!`,'success');
  _editingUngId = null;
  resetUngForm();
  buildUngFilters();
  filterAndRenderUng();
}

function editUngRecord(id) {
  const rec = ungRecords.find(r => String(r.id) === String(id) && !r.deletedAt);
  if (!rec) return;

  _editingUngId = id;

  // Set ngày
  document.getElementById('ung-date').value = rec.ngay || '';

  // Clear bảng nhập
  clearUngRows();

  // Add 1 dòng với data
  addUngRow({
    loai: rec.loai,
    tp: rec.tp,
    congtrinh: rec.projectId ? resolveProjectName(rec) : rec.congtrinh,
    projectId: rec.projectId,
    tien: rec.tien,
    nd: rec.nd
  });

  // Scroll lên form
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Đổi nút
  const btn = document.getElementById('ung-save-btn');
  if (btn) btn.textContent = '💾 Cập Nhật';

  // Highlight dòng đang edit (optional bonus)
  document.querySelectorAll('.editing-row').forEach(tr => tr.classList.remove('editing-row'));
  const row = document.querySelector(`[data-ung-id="${id}"]`);
  if (row) row.classList.add('editing-row'), row.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ══════════════════════════════
//  TIỀN ỨNG - ALL PAGE
// ══════════════════════════════
function buildUngFilters() {
  const active = ungRecords.filter(r => !r.deletedAt);
  const tps    = [...new Set(active.map(i=>i.tp))].filter(Boolean).sort((a,b)=>a.localeCompare(b,'vi'));
  const cts    = [...new Set(active.map(i=>resolveProjectName(i)))].filter(Boolean);
  // Sort will be handle by project order if needed, but for filters alphabetic is usually fine.
  // Actually, projects in filters should also follow the project sort rule if we want "single source of truth".
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

  // [FIXED] Sort by date DESC — newest on top
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

function delUngRecord(id) {
  const idx = ungRecords.findIndex(r=>String(r.id)===String(id));
  if(idx<0) return;
  if(!confirm('Xóa bản ghi tiền ứng này?')) return;
  const now = Date.now();
  ungRecords[idx] = { ...ungRecords[idx], deletedAt: now, updatedAt: now, deviceId: DEVICE_ID };
  save('ung_v1',ungRecords); buildUngFilters(); filterAndRenderUng(); _refreshAllTabs();
  toast('Đã xóa bản ghi tiền ứng');
}

function rebuildUngSelects() {
  document.querySelectorAll('#ung-tbody [data-f="ct"]').forEach(sel=>{
    if(sel.tagName==='SELECT'){
      const cur=sel.value;
      sel.innerHTML = _buildProjOpts(cur, '-- Chọn --');
    }
  });
  // tp dùng custom AC — không cần cập nhật datalist
}

function exportUngEntryCSV() {
  const rows=[['Thầu Phụ / Nhà CC','Công Trình','Số Tiền Ứng','Nội Dung']];
  document.querySelectorAll('#ung-tbody tr').forEach(tr=>{
    const tp=tr.querySelector('[data-f="tp"]')?.value||'';
    if(!tp) return;
    rows.push([tp,tr.querySelector('[data-f="ct"]')?.value||'',parseInt(tr.querySelector('[data-f="tien"]')?.dataset.raw||'0',10)||0,tr.querySelector('[data-f="nd"]')?.value||'']);
  });
  dlCSV(rows,'nhap_tien_ung_'+today()+'.csv');
}

function exportUngAllCSV() {
  const src=filteredUng.length>0?filteredUng:ungRecords;
  const rows=[['Ngày','Thầu Phụ / Nhà CC','Công Trình','Nội Dung','Số Tiền Ứng']];
  src.forEach(r=>rows.push([r.ngay,r.tp,r.congtrinh||'',r.nd||'',r.tien]));
  dlCSV(rows,'tien_ung_'+today()+'.csv');
}
