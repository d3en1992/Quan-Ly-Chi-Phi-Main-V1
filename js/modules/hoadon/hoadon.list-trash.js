// hoadon.list-trash.js — Filter/render danh sách hóa đơn, sửa/xóa, thùng rác, hóa đơn trong ngày
// Load order: sau hoadon.detail-entry.js

// ══════════════════════════════
// INVOICE LIST
// ══════════════════════════════

// Toggle giữa "Tất cả HĐ" và "🗑 Đã xóa" trong sub-tat-ca
function switchTatCaView(val) {
  const activeWrap = document.getElementById('active-inv-wrap');
  const trashWrap  = document.getElementById('inline-trash-wrap');
  const isTrash = val === 'trash';
  if(activeWrap) activeWrap.style.display = isTrash ? 'none' : '';
  if(trashWrap)  trashWrap.style.display  = isTrash ? ''     : 'none';
  // Ẩn/hiện search + filters theo chế độ
  const filterIds = ['tc-search-box','f-ct','f-loai','f-ncc','f-month'];
  filterIds.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = isTrash ? 'none' : '';
  });
  const exportBtn = document.getElementById('btn-export-csv');
  if(exportBtn) exportBtn.style.display = isTrash ? 'none' : '';
  if(isTrash) renderTrash();
  else { buildFilters(); filterAndRender(); }
}

function buildFilters() {
  const allInvs = getInvoicesCached();
  const yearInvs = allInvs.filter(i=>inActiveYear(i.ngay));

  // CT dropdown — luôn hiển thị đầy đủ
  const cts = [...new Set(yearInvs.map(i => resolveProjectName(i)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'vi'));
  const ctSel=document.getElementById('f-ct'); if(!ctSel) return;
  const cv=ctSel.value;
  ctSel.innerHTML='<option value="">Tất cả công trình</option>'+cts.map(c=>`<option ${c===cv?'selected':''} value="${x(c)}">${x(c)}</option>`).join('');

  // Lọc theo CT đang chọn để build Loại CP và NCC động
  const relevantInvs = cv ? yearInvs.filter(i => resolveProjectName(i) === cv) : yearInvs;

  // Loại CP dropdown — chỉ hiển thị loại có trong CT đang chọn
  const loais = [...new Set(relevantInvs.map(i=>i.loai))].filter(Boolean).sort((a,b)=>a.localeCompare(b,'vi'));
  const lSel=document.getElementById('f-loai'); const lv=lSel.value;
  lSel.innerHTML='<option value="">Tất cả loại</option>'+loais.map(l=>`<option ${l===lv?'selected':''} value="${x(l)}">${x(l)}</option>`).join('');

  // NCC dropdown — chỉ hiển thị NCC có trong CT đang chọn
  const nccSel=document.getElementById('f-ncc');
  if(nccSel) {
    const nccs=[...new Set(relevantInvs.map(i=>i.ncc))].filter(Boolean).sort((a,b)=>a.localeCompare(b,'vi'));
    const nv=nccSel.value;
    nccSel.innerHTML='<option value="">Tất cả NCC</option>'+nccs.map(n=>`<option ${n===nv?'selected':''} value="${x(n)}">${x(n)}</option>`).join('');
  }

  // Tháng dropdown — luôn hiển thị đầy đủ
  const months=[...new Set(yearInvs.map(i=>i.ngay?.slice(0,7)))].filter(Boolean).sort().reverse();
  const mSel=document.getElementById('f-month'); const mv=mSel.value;
  mSel.innerHTML='<option value="">Tất cả tháng</option>'+months.map(m=>`<option ${m===mv?'selected':''} value="${m}">${m}</option>`).join('');
}

function filterAndRender() {
  if (!window._dataReady) return; // chặn render trước khi dbInit() hoàn tất
  curPage=1;
  const q=document.getElementById('search')?.value.toLowerCase()||'';
  const fCt=document.getElementById('f-ct')?.value||'';
  const fLoai=document.getElementById('f-loai')?.value||'';
  const fNcc=document.getElementById('f-ncc')?.value||'';
  const fMonth=document.getElementById('f-month')?.value||'';
  filteredInvs = getInvoicesCached().filter(inv => {
    if(!inActiveYear(inv.ngay)) return false;
    if(fCt && resolveProjectName(inv)!==fCt) return false;
    if(fLoai && inv.loai!==fLoai) return false;
    if(fNcc && (inv.ncc||'')!==fNcc) return false;
    if(fMonth && !inv.ngay.startsWith(fMonth)) return false;
    if(q) { const t=[inv.ngay,resolveProjectName(inv),inv.loai,inv.nguoi,inv.ncc,inv.nd,String(inv.thanhtien||inv.tien||0)].join(' ').toLowerCase(); if(!t.includes(q)) return false; }
    return true;
  });
  // Sort: Newest → Oldest based on ngay
  filteredInvs.sort((a, b) => {
    return (b.ngay || '').localeCompare(a.ngay || '');
  });
  renderTable();
}

function renderTable() {
  const tbody=document.getElementById('all-tbody');
  const start=(curPage-1)*PG;
  const paged=filteredInvs.slice(start,start+PG);
  const sumTT=filteredInvs.reduce((s,i)=>s+(i.thanhtien||i.tien||0),0);
  if(!paged.length) {
    tbody.innerHTML=`<tr class="empty-row"><td colspan="10">Không có hóa đơn nào</td></tr>`;
    document.getElementById('pagination').innerHTML=''; return;
  }
  tbody.innerHTML = paged.map(inv=>{
    const isCC     = inv.source === 'cc' || (!inv.source && !!inv.ccKey);
    const isManual = !isCC;
    const src      = isCC ? 'cc' : _resolveInvSource(inv);
    const rowClass = src === 'quick' ? 'inv-row-quick' : src === 'detail' ? 'inv-row-detail' : '';
    const actionBtn = isManual
      ? `<span class="d-flex gap-1">
          <button class="btn btn-outline-primary btn-sm" onclick="editManualInvoice('${inv.id}')" title="Sửa hóa đơn"><i class="bi bi-pencil-fill"></i></button>
          <button class="btn btn-danger btn-sm" onclick="delInvoice('${inv.id}')" title="Xóa hóa đơn"><i class="bi bi-trash-fill"></i></button>
        </span>`
      : isCC
        ? `<button class="btn btn-outline-info btn-sm" style="font-size:11px;white-space:nowrap" onclick="editCCInvoice('${inv.ccKey||inv.id}')" title="Chỉnh sửa tại tab Chấm Công"><i class="bi bi-arrow-return-left"></i> CC</button>`
        : `<span class="text-body-secondary" style="font-size:11px;padding:0 6px">—</span>`;
    const displayDate = fmtISODate(inv.ngay);
    return `<tr class="${rowClass}">
    <td class="font-monospace text-secondary" style="font-size:11px">${displayDate}</td>
    <td style="font-weight:600;font-size:12px;max-width:220px">${x(resolveProjectName(inv))}</td>
    <td><span class="tag tag-gold">${x(inv.loai)}</span></td>
    <td class="hide-mobile text-secondary">${x(inv.nguoi||'—')}</td>
    <td class="hide-mobile text-secondary">${x(inv.ncc||'—')}</td>
    <td class="text-secondary" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(inv.nd)}">${x(inv.nd||'—')}</td>
    <td class="text-end font-monospace fw-semibold text-success" title="Đơn giá: ${numFmt(inv.tien||0)}${inv.sl&&inv.sl!==1?' × '+inv.sl:''}">${numFmt(inv.thanhtien||inv.tien||0)}</td>
    <td style="white-space:nowrap">${actionBtn}</td>
  </tr>`;}).join('');

  const tp=Math.ceil(filteredInvs.length/PG);
  let pag=`<span>${filteredInvs.length} hóa đơn · Tổng: <strong class="text-warning font-monospace">${fmtS(sumTT)}</strong></span>`;
  if(tp>1) {
    pag+='<ul class="pagination pagination-sm mb-0">';
    for(let p=1;p<=Math.min(tp,10);p++) pag+=`<li class="page-item ${p===curPage?'active':''}"><button class="page-link" onclick="goTo(${p})">${p}</button></li>`;
    if(tp>10) pag+=`<li class="page-item disabled"><span class="page-link">...${tp}</span></li>`;
    pag+='</ul>';
  }
  document.getElementById('pagination').innerHTML=pag;
}

function goTo(p) { curPage=p; renderTable(); }

function delInvoice(id) {
  const inv=invoices.find(i=>String(i.id)===String(id));
  if(!inv) { toast('Không tìm thấy hóa đơn!','error'); return; }
  // Chỉ cho xóa manual invoice — CC invoices phải xóa từ tab Chấm Công
  if(inv.ccKey || inv.source==='cc') {
    toast('⚠️ Không thể xóa hóa đơn từ chấm công! Hãy chỉnh sửa tại tab Chấm Công.','error');
    return;
  }
  if(!confirm('Xóa hóa đơn này? (Có thể khôi phục từ Thùng Rác)')) return;
  // Soft delete: giữ record trong invoices với deletedAt (tránh resurrection khi sync)
  const now = Date.now();
  const idx = invoices.findIndex(i => String(i.id) === String(id));
  if (idx >= 0) {
    invoices[idx] = { ...invoices[idx], deletedAt: now, updatedAt: now, deviceId: DEVICE_ID };
  }
  clearInvoiceCache(); save('inv_v3', invoices);
  trashAdd({...inv}); // giữ trong trash để UI "Thùng Rác" vẫn hoạt động
  updateTop(); buildFilters(); filterAndRender(); renderTrash();
  toast('Đã xóa (có thể khôi phục trong Thùng Rác)');
}

function editCCInvoice(ccKeyOrId) {
  // ccKey format: 'cc|fromDate|ct|...'
  const key = String(ccKeyOrId);
  const parts = key.split('|');
  if (parts.length < 3 || parts[0] !== 'cc') return;
  const fromDate=parts[1], ct=parts[2];

  // 1. Chuyển tab — dùng goPage chuẩn
  const navBtn=document.querySelector('.nav-btn[data-page="chamcong"]');
  goPage(navBtn,'chamcong');
  window.scrollTo({top:0,behavior:'smooth'});

  // 2. Set tuần đúng (snap về CN của tuần đó)
  const sunISO=snapToSunday(fromDate);
  const satISO=ccSaturdayISO(sunISO);
  document.getElementById('cc-from').value=sunISO;
  document.getElementById('cc-to').value=satISO;
  document.getElementById('cc-week-label').textContent='Tuần: '+weekLabel(sunISO);
  // Tính lại offset
  const thisSun=ccSundayISO(0);
  const [ty,tm,td]=thisSun.split('-').map(Number);
  const [fy,fm,fd]=sunISO.split('-').map(Number);
  ccOffset=Math.round((new Date(fy,fm-1,fd)-new Date(ty,tm-1,td))/(7*86400000));

  // 3. Set công trình và load bảng (sau khi goPage đã populate select)
  setTimeout(()=>{
    const ctSel=document.getElementById('cc-ct-sel');
    if(ctSel){
      if(![...ctSel.options].find(o=>o.value===ct)){
        const o=document.createElement('option');o.value=ct;o.textContent=ct;ctSel.appendChild(o);
      }
      ctSel.value=ct;
    }
    loadCCWeekForm();
    toast('✏️ Đang xem tuần '+viShort(sunISO)+' — '+ct,'success');
  },50);
}

// Điều hướng đến form Nhập nhanh và nạp dữ liệu HĐ để chỉnh sửa
function openEntryEdit(inv) {
  // 1. Chuyển sang page Nhập
  const navBtn = document.querySelector('.nav-btn[data-page="nhap"]');
  if (navBtn) goPage(navBtn, 'nhap');
  // 2. Chuyển về sub-tab sub-nhap-hd
  const subBtn = document.querySelector('.nav-link[onclick*="sub-nhap-hd"]');
  if (subBtn && !subBtn.classList.contains('active')) {
    goSubPage(subBtn, 'sub-nhap-hd');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => {
    // 3. Chuyển về inner tab Nhập nhanh
    const innerBtn = document.querySelector('.nav-link[onclick*="inr-nhap-nhanh"]');
    if (innerBtn) goInnerSub(innerBtn, 'inr-nhap-nhanh');
    // 4. Nạp dữ liệu vào form
    document.getElementById('entry-date').value = inv.ngay || today();
    document.getElementById('entry-tbody').innerHTML = '';
    addRow({ loai: inv.loai, congtrinh: inv.congtrinh,
             nguoi: inv.nguoi || '', ncc: inv.ncc || '', nd: inv.nd || '', tien: inv.tien || 0 });
    const row = document.querySelector('#entry-tbody tr');
    if (row) {
      row.dataset.editId = String(inv.id);
      // FIX: gán NCC/Người TH linh hoạt (phòng trường hợp giá trị trong HĐ
      // có whitespace/case khác với danh mục → option không được selected)
      _setSelectFlexible(row.querySelector('[data-f="ncc"]'),   inv.ncc);
      _setSelectFlexible(row.querySelector('[data-f="nguoi"]'), inv.nguoi);
      _setSelectFlexible(row.querySelector('[data-f="loai"]'),  inv.loai);
    }
    calcSummary();
    const _eBtn = document.getElementById('entry-save-btn');
    if (_eBtn) _eBtn.textContent = '💾 Cập nhật';
    toast('✏️ Chỉnh sửa rồi nhấn 💾 Cập nhật', 'success');
  }, 100);
}

// Xác định loại hóa đơn chuẩn: dùng field source, fallback cho dữ liệu cũ
function _resolveInvSource(inv) {
  if (inv.source === 'detail') return 'detail';
  if (inv.source === 'quick' || inv.source === 'manual') return 'quick';
  // Backward compat: dữ liệu cũ không có source → suy từ items
  if (inv.items && inv.items.length) return 'detail';
  return 'quick';
}

function editManualInvoice(id) {
  // Đọc từ inv_v3 gốc — KHÔNG dùng getInvoicesCached() vì cache trộn manual+CC.
  // CC-derived invoice (ccKey) không có items → nếu find nhầm sẽ mở form rỗng.
  const inv = getState('inv_v3', []).find(i => !i.deletedAt && !i.ccKey && String(i.id) === String(id));
  if (!inv) return;
  if (_resolveInvSource(inv) === 'detail') { openDetailEdit(inv); return; }
  openEntryEdit(inv);
}

// ══════════════════════════════════════════════════════════════════
// TRASH SYSTEM
// ══════════════════════════════════════════════════════════════════
let trash = load('trash_v1', []);

function trashAdd(inv) {
  inv._deletedAt = new Date().toISOString();
  trash.unshift(inv);
  // Giữ tối đa 200 HĐ trong thùng rác
  if(trash.length>200) trash=trash.slice(0,200);
  save('trash_v1', trash);
}

function trashRestore(id) {
  const idx=trash.findIndex(i=>String(i.id)===String(id));
  if(idx<0) return;
  const now = Date.now();
  // Xóa deletedAt trên record đang có trong invoices (soft-delete tombstone)
  const invIdx = invoices.findIndex(i => String(i.id) === String(id));
  if (invIdx >= 0) {
    invoices[invIdx] = { ...invoices[invIdx], deletedAt: null, updatedAt: now, deviceId: DEVICE_ID };
  } else {
    // Fallback: record chưa có trong invoices (import cũ) — thêm mới
    const inv = { ...trash[idx] };
    delete inv._deletedAt;
    inv.deletedAt = null;
    inv.updatedAt = now;
    inv.deviceId = DEVICE_ID;
    invoices.unshift(inv);
  }
  trash.splice(idx, 1);
  clearInvoiceCache(); save('inv_v3', invoices);
  save('trash_v1', trash);
  updateTop(); buildFilters(); filterAndRender(); renderTrash();
  toast('✅ Đã khôi phục hóa đơn!', 'success');
}

function trashDeletePermanent(id) {
  trash=trash.filter(i=>String(i.id)!==String(id));
  save('trash_v1', trash);
  renderTrash();
  toast('Đã xóa vĩnh viễn','success');
}

function trashClearAll() {
  if(!trash.length) return;
  if(!confirm(`Xóa vĩnh viễn ${trash.length} hóa đơn trong thùng rác?\nKhông thể khôi phục!`)) return;
  trash=[];
  save('trash_v1', trash);
  renderTrash();
  toast('Đã xóa toàn bộ thùng rác','success');
}

function renderTrash() {
  const wrap=document.getElementById('trash-wrap');
  const empty=document.getElementById('trash-empty');
  const tbody=document.getElementById('trash-tbody');
  if(!wrap||!tbody||!empty) return;
  if(!trash.length) {
    wrap.style.display='none'; empty.style.display='';
    return;
  }
  wrap.style.display=''; empty.style.display='none';
  tbody.innerHTML=trash.slice(0,100).map(inv=>`<tr>
    <td class="text-secondary font-monospace" style="font-size:11px;white-space:nowrap">${inv.ngay||''}</td>
    <td style="font-size:12px;font-weight:600;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x(inv.congtrinh||'—')}</td>
    <td><span class="tag tag-gold">${x(inv.loai||'—')}</span></td>
    <td class="text-secondary" style="font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x(inv.nd||'—')}</td>
    <td class="text-end font-monospace fw-semibold text-success">${numFmt(inv.tien||0)}</td>
    <td style="white-space:nowrap;display:flex;gap:4px;padding:5px 4px">
      <button class="btn btn-outline-secondary btn-sm" onclick="trashRestore('${inv.id}')" title="Khôi phục">↩ Khôi phục</button>
      <button class="btn btn-danger btn-sm" onclick="trashDeletePermanent('${inv.id}')" title="Xóa vĩnh viễn">✕</button>
    </td>
  </tr>`).join('');
}

// ══════════════════════════════════════════════════════════════════
//  BẢNG HÓA ĐƠN ĐÃ NHẬP TRONG NGÀY
// ══════════════════════════════════════════════════════════════════
function renderTodayInvoices() {
  if (!window._dataReady) return; // chặn render trước khi dbInit() hoàn tất
  // Lấy ngày từ subtab đang active
  const activeInner = document.querySelector('#sub-nhap-hd .inner-sub-page.active');
  const date = (activeInner?.id === 'inr-hd-chitiet')
    ? (document.getElementById('detail-ngay')?.value || today())
    : (document.getElementById('entry-date')?.value || today());

  const dateEl = document.getElementById('today-inv-date');
  if(dateEl) {
    const _dp = date.split('-');
    dateEl.textContent = _dp.length === 3 ? `${_dp[2]}-${_dp[1]}-${_dp[0]}` : date;
  }

  const tbody = document.getElementById('today-inv-tbody');
  const footer = document.getElementById('today-inv-footer');
  if(!tbody) return;

  const todayInvs = invoices.filter(i => i.ngay === date && !i.ccKey && !i.deletedAt);
  if(!todayInvs.length) {
    const displayDate = fmtISODate(date, date);
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Chưa có hóa đơn nào vào ngày ${displayDate}</td></tr>`;
    if(footer) footer.innerHTML = '';
    return;
  }

  const mono = "font-family:'IBM Plex Mono',monospace";
  tbody.innerHTML = todayInvs.map(inv => {
    return `<tr>
      <td><span class="tag tag-gold">${x(inv.loai||'—')}</span></td>
      <td style="font-size:12px;font-weight:600;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x(inv.congtrinh||'—')}</td>
      <td class="text-end font-monospace fw-bold text-success">${inv.tien?numFmt(inv.tien):'—'}</td>
      <td class="text-secondary" style="font-size:11px">${x(inv.nguoi||'—')}</td>
      <td class="text-secondary" style="font-size:11px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x(inv.nd||'—')}</td>
      <td class="text-secondary" style="font-size:11px;white-space:nowrap">${x(inv.ncc||'—')}</td>
    </tr>`;
  }).join('');

  const total = todayInvs.reduce((s,i)=>s+(i.thanhtien||i.tien||0),0);
  if(footer) footer.innerHTML = `<span>${todayInvs.length} hóa đơn</span><span>Tổng: <strong class="text-warning font-monospace">${fmtS(total)}</strong></span>`;
}

/** Cập nhật tất cả dropdown CT trong tab Hóa Đơn (nhập nhanh + chi tiết) ngay lập tức. */
function refreshHoadonCtDropdowns() {
  document.querySelectorAll('#entry-tbody [data-f="ct"]').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = _buildProjOpts(cur, '-- Chọn --');
    sel.value = cur;
  });
  const detCtSel = document.getElementById('detail-ct');
  if (detCtSel) {
    const cur = detCtSel.value;
    detCtSel.innerHTML = _buildProjOpts(cur, '-- Chọn Công Trình --');
    detCtSel.value = cur;
  }
}
