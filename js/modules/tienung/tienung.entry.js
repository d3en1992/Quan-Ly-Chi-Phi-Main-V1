// tienung.entry.js — Tiền Ứng: bảng nhập, lưu, sửa, autocomplete
// Load order: sau tienung.core.js

// ══════════════════════════════
//  ENTRY TABLE
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
    const canonical = opts.find(o => normalizeKey(o) === normalizeKey(v));
    if (!canonical) {
      toast('⚠️ "' + v + '" không có trong danh mục!', 'error');
      this.value = '';
      calcUngSummary();
    } else {
      this.value = canonical;
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
    const rec = rowsData[0];
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

  document.getElementById('ung-date').value = rec.ngay || '';
  clearUngRows();
  addUngRow({
    loai: rec.loai,
    tp: rec.tp,
    congtrinh: rec.projectId ? resolveProjectName(rec) : rec.congtrinh,
    projectId: rec.projectId,
    tien: rec.tien,
    nd: rec.nd
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });

  const btn = document.getElementById('ung-save-btn');
  if (btn) btn.textContent = '💾 Cập Nhật';

  document.querySelectorAll('.editing-row').forEach(tr => tr.classList.remove('editing-row'));
  const row = document.querySelector(`[data-ung-id="${id}"]`);
  if (row) row.classList.add('editing-row'), row.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function rebuildUngSelects() {
  document.querySelectorAll('#ung-tbody [data-f="ct"]').forEach(sel=>{
    if(sel.tagName==='SELECT'){
      const cur=sel.value;
      sel.innerHTML = _buildProjOpts(cur, '-- Chọn --');
    }
  });
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
