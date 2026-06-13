// chamcong.history-reports.js — Lịch sử, tổng lương tuần, load/xóa, CSV exports, phiếu lương/export ảnh
// Load order: sau chamcong.week-form.js

// ─── history (per week) ───────────────────────────────────────────
// [MODIFIED] — CT dropdown values use projectId, display resolved name
function buildCCHistFilters(){
  const yearCC=ccData.filter(w=>!w.deletedAt&&inActiveYear(w.fromDate));
  // Build unique CT list: resolve name from projectId for display
  const ctMap=new Map(); // pid/ct → displayName
  yearCC.forEach(w=>{
    const pid=w.projectId||w.ctPid||null;
    const displayName=pid ? (_getProjectNameById(pid)||w.ct||pid) : (w.ct||'');
    if(displayName) ctMap.set(pid||w.ct, displayName);
  });
  const allCts=[...ctMap.entries()].sort((a,b)=>a[1].localeCompare(b[1],'vi'));
  // weeks list — chỉ năm đang chọn
  const allWeeks=[...new Set(yearCC.map(w=>w.fromDate))].sort().reverse();

  const ctSel=document.getElementById('cc-hist-ct'); const cv=ctSel.value;
  ctSel.innerHTML='<option value="">Tất cả CT</option>'+allCts.map(([val,name])=>`<option ${val===cv?'selected':''} value="${x(val)}">${x(name)}</option>`).join('');

  const wkSel=document.getElementById('cc-hist-week'); const wv=wkSel.value;
  wkSel.innerHTML='<option value="">Tất cả tuần</option>'+allWeeks.map(w=>`<option ${w===wv?'selected':''} value="${w}">${weekLabel(w)}</option>`).join('');

  // also update TLT week filter
  const tltSel=document.getElementById('cc-tlt-week'); const tv=tltSel.value;
  tltSel.innerHTML='<option value="">Tất cả tuần</option>'+allWeeks.map(w=>`<option ${w===tv?'selected':''} value="${w}">${weekLabel(w)}</option>`).join('');

  // Cập nhật dropdown CT cho TLT
  const tltCtSel=document.getElementById('cc-tlt-ct');
  if(tltCtSel){ const tcv=tltCtSel.value;
    tltCtSel.innerHTML='<option value="">Tất cả CT</option>'+allCts.map(([val,name])=>`<option ${val===tcv?'selected':''} value="${x(val)}">${x(name)}</option>`).join('');
  }
}

// [MODIFIED] — filter/group/display by projectId, resolve name for display
function renderCCHistory(){
  buildCCHistFilters();
  const fCt=document.getElementById('cc-hist-ct').value; // may be projectId or ct name
  const fWk=document.getElementById('cc-hist-week').value;

  // [MODIFIED] — filter matcher uses projectId
  const _fMatch=w=>{
    if(!fCt) return true;
    if(w.projectId && w.projectId===fCt) return true;
    if(w.ctPid && w.ctPid===fCt) return true;
    if(w.ct===fCt) return true;
    return false;
  };

  const map={};
  ccData.forEach(w=>{
    if(w.deletedAt) return;
    if(!inActiveYear(w.fromDate)) return;
    if(!_fMatch(w)) return;
    if(fWk&&w.fromDate!==fWk) return;
    // [MODIFIED] — group key uses projectId
    const gKey=w.fromDate+'|'+(w.projectId||w.ct);
    const ctDisplay=_resolveCtName(w); // [MODIFIED]
    if(!map[gKey]){
      map[gKey]={
        id:w.id,
        fromDate:w.fromDate,
        toDate:w.toDate,
        ct:ctDisplay,                  // [MODIFIED] — resolved name
        projectId:w.projectId||null,
        d:[0,0,0,0,0,0,0],
        tc:0, tl:0, pc:0, hd:0, tongcong:0,
        luongList:[],
        ndList:[]
      };
    }
    w.workers.forEach(wk=>{
      const tc=round1(wk.d.reduce((s,v)=>s+v,0));
      const luong=Number(wk.luong)||0;
      const tl=tc*luong;
      const pc=wk.phucap||0;
      const hd=wk.hdmuale||0;
      wk.d.forEach((v,i)=>{ map[gKey].d[i]+=Number(v)||0; });
      map[gKey].tc+=tc;
      map[gKey].tl+=tl;
      map[gKey].pc+=pc;
      map[gKey].hd+=hd;
      if(luong>0) map[gKey].luongList.push(luong);
      if(wk.nd) map[gKey].ndList.push(wk.nd);
    });
    map[gKey].tongcong=map[gKey].tl+map[gKey].pc+map[gKey].hd;
  });
  Object.values(map).forEach(r=>{ r.tc=round1(r.tc); r.d=r.d.map(v=>round1(v)); });
  let rows=Object.values(map).map(r=>{
    const avgLuong=r.luongList.length
      ? Math.round(r.luongList.reduce((s,v)=>s+v,0)/r.luongList.length)
      : 0;
    const nd=[...new Set(r.ndList.map(v=>(v||'').trim()).filter(Boolean))].join(' | ');
    return {...r, avgLuong, nd};
  });
  rows.sort((a,b)=>b.fromDate.localeCompare(a.fromDate)||(a.ct||'').localeCompare(b.ct||'','vi'));

  const tbody=document.getElementById('cc-hist-tbody');
  const totalTL=rows.reduce((s,r)=>s+r.tl,0);
  const totalTC2=rows.reduce((s,r)=>s+r.tongcong,0);

  if(!rows.length){
    tbody.innerHTML=`<tr class="empty-row"><td colspan="17">Chưa có dữ liệu chấm công</td></tr>`;
    document.getElementById('cc-hist-pagination').innerHTML=''; return;
  }

  const start=(ccHistPage-1)*CC_PG_HIST;
  const paged=rows.slice(start,start+CC_PG_HIST);

  tbody.innerHTML=paged.map(r=>`<tr>
    <td class="text-secondary font-monospace" style="font-size:11px;white-space:nowrap">${viShort(r.fromDate)}<br><span class="text-secondary">${viShort(r.toDate)}</span></td>
    <td style="font-weight:600;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x(r.ct||'—')}</td>
    ${r.d.map(v=>`<td class="${v===1?'text-success':v>0?'text-primary':'text-body-secondary'}" style="text-align:center;font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:12px">${v||'·'}</td>`).join('')}
    <td class="text-warning" style="text-align:center;font-family:'IBM Plex Mono',monospace;font-weight:700">${r.tc}</td>
    <td class="text-secondary" style="text-align:right;font-family:'IBM Plex Mono',monospace;font-size:11px">${r.avgLuong?numFmt(r.avgLuong):'—'}</td>
    <td class="text-end font-monospace fw-semibold text-success" style="white-space:nowrap;min-width:110px">${r.tl?numFmt(r.tl):'—'}</td>
    <td class="text-primary" style="text-align:right;font-family:'IBM Plex Mono',monospace;font-size:12px">${r.pc?numFmt(r.pc):'—'}</td>
    <td class="text-secondary" style="text-align:right;font-family:'IBM Plex Mono',monospace;font-size:12px;white-space:nowrap;min-width:110px">${r.hd?numFmt(r.hd):'—'}</td>
    <td class="text-secondary" style="font-size:11px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x(r.nd||'—')}</td>
    <td class="text-warning" style="text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:13px">${r.tongcong?numFmt(r.tongcong):'—'}</td>
    <td style="white-space:nowrap">
      <div class="d-flex gap-1 flex-nowrap justify-content-center align-items-center">
        <button class="btn btn-outline-secondary btn-sm" onclick="loadCCWeekById('${r.id}','${r.fromDate}','${x(r.ct)}')" title="Tải tuần này">↩ Tải</button>
        <button class="btn btn-danger btn-sm" onclick="delCCWeekById('${r.id}','${r.fromDate}','${x(r.ct)}')" title="Xóa tuần">✕ Xóa</button>
      </div>
    </td>
  </tr>`).join('');

  const tp=Math.ceil(rows.length/CC_PG_HIST);
  let pag=`<span>${rows.length} dòng · Tổng lương: <strong class="text-success font-monospace">${fmtS(totalTL)}</strong> · Tổng cộng: <strong class="text-warning font-monospace">${fmtS(totalTC2)}</strong></span>`;
  if(tp>1){
    pag+='<ul class="pagination pagination-sm mb-0">';
    for(let p=1;p<=Math.min(tp,10);p++) pag+=`<li class="page-item ${p===ccHistPage?'active':''}"><button class="page-link" onclick="ccHistGoTo(${p})">${p}</button></li>`;
    if(tp>10) pag+=`<li class="page-item disabled"><span class="page-link">...${tp}</span></li>`;
    pag+='</ul>';
  }
  document.getElementById('cc-hist-pagination').innerHTML=pag;
  renderCCTLT();
}

function ccHistGoTo(p){ ccHistPage=p; renderCCHistory(); }

// ─── Tổng Lương Tuần (grouped by name per week) ───────────────────
function renderCCTLT(){
  buildCCHistFilters();
  const fWk=document.getElementById('cc-tlt-week').value;
  const fCt2=document.getElementById('cc-tlt-ct')?.value||'';
  const fQ=(document.getElementById('cc-tlt-search')?.value||'').toLowerCase().trim(); // tìm theo tên CN

  // Group by name only khi "tất cả tuần", hoặc (tuần+name) khi lọc tuần cụ thể
  // [MODIFIED] — filter by projectId, resolve CT names for display
  const _fMatch2=w=>{
    if(!fCt2) return true;
    if(w.projectId && w.projectId===fCt2) return true;
    if(w.ctPid && w.ctPid===fCt2) return true;
    if(w.ct===fCt2) return true;
    return false;
  };
  const map={};
  ccData.forEach(w=>{
    if(w.deletedAt) return;
    if(!inActiveYear(w.fromDate)) return;
    if(!_fMatch2(w)) return;
    if(fWk&&w.fromDate!==fWk) return;
    const ctDisplay=_resolveCtName(w); // [MODIFIED]
    w.workers.forEach(wk=>{
      if(fQ && !(wk.name||'').toLowerCase().includes(fQ)) return; // lọc theo tên CN
      const key = fWk ? w.fromDate+'|'+wk.name : wk.name;
      if(!map[key]) map[key]={fromDate:w.fromDate,toDate:w.toDate,name:wk.name,
        d:[0,0,0,0,0,0,0],tc:0,tl:0,pc:0,hdml:0,loan:0,tru:0,cts:[],luongList:[]};
      wk.d.forEach((v,i)=>{ map[key].d[i]+=v; });
      const tc=round1(wk.d.reduce((s,v)=>s+v,0));
      map[key].tc+=tc;
      map[key].tl+=tc*(wk.luong||0);
      map[key].pc+=(wk.phucap||0);
      map[key].hdml+=(wk.hdmuale||0);
      map[key].loan+=(wk.loanAmount||0);
      map[key].tru+=(wk.tru||0);
      if(!map[key].cts.includes(ctDisplay)) map[key].cts.push(ctDisplay); // [MODIFIED]
      map[key].luongList.push(wk.luong||0);
      if(!fWk){ if(w.fromDate<map[key].fromDate) map[key].fromDate=w.fromDate;
                if(w.toDate>map[key].toDate) map[key].toDate=w.toDate; }
    });
  });
  Object.values(map).forEach(r=>{ r.tc=round1(r.tc); r.d=r.d.map(v=>round1(v)); });

  const rows=Object.values(map).sort((a,b)=>
    fWk ? b.fromDate.localeCompare(a.fromDate)||a.name.localeCompare(b.name,'vi')
        : a.name.localeCompare(b.name,'vi'));

  const tbody=document.getElementById('cc-tlt-tbody');
  const tableWrap=document.getElementById('cc-tlt-table-wrap');
  const cardsEl=document.getElementById('cc-tlt-cards');
  const isMobile=window.innerWidth<768;

  if(!rows.length){
    if(isMobile){ tableWrap.style.display='none'; cardsEl.style.display='block'; cardsEl.innerHTML='<p class="text-secondary" style="text-align:center;padding:20px">Chưa có dữ liệu</p>'; }
    else{ tableWrap.style.display=''; cardsEl.style.display='none'; tbody.innerHTML=`<tr class="empty-row"><td colspan="17">Chưa có dữ liệu</td></tr>`; }
    document.getElementById('cc-tlt-pagination').innerHTML=''; return;
  }

  const grandTCLuong=rows.reduce((s,r)=>s+r.tl+r.pc,0);
  const start=(ccTltPage-1)*CC_PG_TLT;
  const paged=rows.slice(start,start+CC_PG_TLT);
  const mono="font-family:'IBM Plex Mono',monospace";
  const DAY_LABELS=['CN','T2','T3','T4','T5','T6','T7'];

  if(isMobile){
    // ── Mobile: card view ──
    tableWrap.style.display='none';
    cardsEl.style.display='block';
    cardsEl.innerHTML=paged.map(r=>{
      const tcLuong=r.tl+r.pc;
      const daysHtml=r.d.map((v,i)=>v>0?`<span class="tlt-day-badge${v>=1?' tlt-day-full':' tlt-day-half'}">${DAY_LABELS[i]}: ${v}</span>`:'').filter(Boolean).join('');
      const ctsHtml=r.cts.length?`<div class="tlt-card-cts">${r.cts.map(c=>x(c)).join(' · ')}</div>`:'';
      const periodHtml=fWk?`${viShort(r.fromDate)} – ${viShort(r.toDate)}`:'Tổng nhiều tuần';
      const noCon_=_calcDebtBefore(r.name, r.fromDate);
      return `<div class="tlt-card card shadow-sm"
        data-name="${x(r.name)}" data-from="${r.fromDate}" data-to="${r.toDate}"
        data-tc="${r.tc}" data-tl="${r.tl}" data-pc="${r.pc}" data-hdml="${r.hdml}"
        data-loan="${r.loan}" data-tru="${r.tru}" data-no-con="${noCon_}"
        data-cts="${r.cts.join('|')}">
        <div class="tlt-card-header">
          <label class="tlt-card-label">
            <input type="checkbox" class="cc-tlt-chk">
            <span class="tlt-card-name">${x(r.name||'—')}</span>
          </label>
          <span class="tlt-card-amount">${tcLuong?numFmt(tcLuong)+' đ':'—'}</span>
        </div>
        <div class="tlt-card-meta">${periodHtml} &nbsp;·&nbsp; <strong>${r.tc}</strong> công</div>
        ${daysHtml?`<div class="tlt-card-days">${daysHtml}</div>`:''}
        ${ctsHtml}
      </div>`;
    }).join('');
  } else {
    // ── Desktop: table view ──
    tableWrap.style.display='';
    cardsEl.style.display='none';
    tbody.innerHTML=paged.map(r=>{
      const tcLuong=r.tl+r.pc;
      const thucLanh_=r.tl+r.pc+r.loan+r.hdml-r.tru;
      const luongTB=r.tc>0?Math.round(tcLuong/r.tc):0; // TB/ngày = TC Lương ÷ TC
      const noCon_=_calcDebtBefore(r.name, r.fromDate);
      const ctDisplay_=r.cts.length<=1
        ? x(r.cts[0]||'—')
        : x(r.cts[0])+` <span class="tlt-ct-more" title="${r.cts.map(c=>x(c)).join(', ')}">+${r.cts.length-1}</span>`;
      return `<tr
        data-name="${x(r.name)}" data-from="${r.fromDate}" data-to="${r.toDate}"
        data-tc="${r.tc}" data-tl="${r.tl}" data-pc="${r.pc}" data-hdml="${r.hdml}"
        data-loan="${r.loan}" data-tru="${r.tru}" data-no-con="${noCon_}"
        data-cts="${r.cts.join('|')}">
        <td style="text-align:center;padding:4px"><input type="checkbox" class="cc-tlt-chk" style="width:15px;height:15px;cursor:pointer"></td>
        <td class="text-secondary" style="${mono};font-size:10px;white-space:nowrap">${fWk?viShort(r.fromDate):'Tổng'}<br><span class="text-body-secondary">${fWk?viShort(r.toDate):r.tc+' công'}</span></td>
        <td style="font-weight:700;font-size:13px">${x(r.name||'—')}</td>
        <td class="text-secondary" style="text-align:center;font-size:12px;font-weight:700">${cnRoles[r.name]||'—'}</td>
        ${r.d.map(v=>`<td class="${v===1?'text-success':v>0?'text-primary':'text-body-secondary'}" style="text-align:center;${mono};font-weight:600;font-size:12px">${v||'·'}</td>`).join('')}
        <td class="text-warning" style="text-align:center;${mono};font-weight:700">${r.tc}</td>
        <td class="text-success" style="text-align:right;${mono};font-weight:700;font-size:13px">${tcLuong?numFmt(tcLuong):'—'}</td>
        <td class="text-secondary" style="text-align:right;${mono};font-size:12px">${luongTB?numFmt(luongTB):'—'}</td>
        <td class="text-danger cc-tlt-debt-col" style="text-align:right;${mono};font-size:12px">${r.tru?numFmt(r.tru):'—'}</td>
        <td class="text-success fw-bold cc-tlt-debt-col" style="text-align:right;${mono};background:#f1f8f4">${thucLanh_>0?numFmt(thucLanh_):thucLanh_<0?'('+numFmt(-thucLanh_)+')':'—'}</td>
        <td class="project-col text-secondary" style="font-size:11px">${ctDisplay_}</td>
      </tr>`;
    }).join('');
  }

  // Ẩn/hiện cột TRỪ và THỰC LÃNH: chỉ hiện khi lọc một tuần cụ thể
  document.querySelectorAll('.cc-tlt-debt-col').forEach(el => {
    el.style.display = fWk ? '' : 'none';
  });

  const tp=Math.ceil(rows.length/CC_PG_TLT);
  let pag=`<span>${rows.length} công nhân · Tổng TC Lương: <strong class="text-success font-monospace">${fmtS(grandTCLuong)}</strong></span><span id="cc-tlt-selected-sum" class="text-warning fw-bold font-monospace" style="margin-left:14px"></span>`;
  if(tp>1){
    pag+='<ul class="pagination pagination-sm mb-0">';
    for(let p=1;p<=Math.min(tp,10);p++) pag+=`<li class="page-item ${p===ccTltPage?'active':''}"><button class="page-link" onclick="ccTltGoTo(${p})">${p}</button></li>`;
    pag+='</ul>';
  }
  document.getElementById('cc-tlt-pagination').innerHTML=pag;
}

// ─── Bảng Tổng Lương Tuần MINI (subtab Sổ Chấm Công) ─────────────────────────
// Phiên bản rút gọn CHỈ XEM của renderCCTLT: tự bám theo tuần đang chọn ở sổ
// (#cc-from), gộp TẤT CẢ công trình trong tuần, không checkbox/phân trang/export.
// LƯU Ý: không dùng class cc-tlt-debt-col / cc-tlt-chk để tránh bị các hàm
// quét toàn cục của bảng TLT đầy đủ (ẩn cột, tính tổng tick) đụng nhầm.
function renderCCTLTMini(){
  const tbody=document.getElementById('cc-tlt-mini-tbody');
  if(!tbody) return;
  const sumEl=document.getElementById('cc-tlt-mini-summary');
  const lblEl=document.getElementById('cc-tlt-mini-week-label');
  const fWk=document.getElementById('cc-from')?.value||'';
  if(!fWk){
    tbody.innerHTML=`<tr class="empty-row"><td colspan="15">Chưa chọn tuần</td></tr>`;
    if(sumEl) sumEl.innerHTML=''; if(lblEl) lblEl.textContent='';
    return;
  }
  if(lblEl) lblEl.textContent='— Tuần '+weekLabel(fWk);

  // Gom dữ liệu đúng tuần, mọi công trình (không lọc CT, không lọc năm — bám theo sổ)
  const map={};
  ccData.forEach(w=>{
    if(w.deletedAt) return;
    if(w.fromDate!==fWk) return;
    const ctDisplay=_resolveCtName(w);
    w.workers.forEach(wk=>{
      const key=wk.name;
      if(!map[key]) map[key]={name:wk.name,d:[0,0,0,0,0,0,0],tc:0,tl:0,pc:0,hdml:0,loan:0,tru:0,cts:[]};
      wk.d.forEach((v,i)=>{ map[key].d[i]+=v; });
      const tc=round1(wk.d.reduce((s,v)=>s+v,0));
      map[key].tc+=tc;
      map[key].tl+=tc*(wk.luong||0);
      map[key].pc+=(wk.phucap||0);
      map[key].hdml+=(wk.hdmuale||0);
      map[key].loan+=(wk.loanAmount||0);
      map[key].tru+=(wk.tru||0);
      if(!map[key].cts.includes(ctDisplay)) map[key].cts.push(ctDisplay);
    });
  });
  Object.values(map).forEach(r=>{ r.tc=round1(r.tc); r.d=r.d.map(v=>round1(v)); });

  const rows=Object.values(map).sort((a,b)=>a.name.localeCompare(b.name,'vi'));
  if(!rows.length){
    tbody.innerHTML=`<tr class="empty-row"><td colspan="15">Chưa có chấm công tuần này</td></tr>`;
    if(sumEl) sumEl.innerHTML='';
    return;
  }

  const mono="font-family:'IBM Plex Mono',monospace";
  let sumTCLuong=0, sumThucLanh=0;
  tbody.innerHTML=rows.map(r=>{
    const tcLuong=r.tl+r.pc;
    const thucLanh_=r.tl+r.pc+r.loan+r.hdml-r.tru;
    const luongTB=r.tc>0?Math.round(tcLuong/r.tc):0;
    sumTCLuong+=tcLuong; sumThucLanh+=thucLanh_;
    const ctDisplay_=r.cts.length<=1
      ? x(r.cts[0]||'—')
      : x(r.cts[0])+` <span class="tlt-ct-more" title="${r.cts.map(c=>x(c)).join(', ')}">+${r.cts.length-1}</span>`;
    return `<tr>
      <td style="font-weight:700;font-size:13px">${x(r.name||'—')}</td>
      <td class="text-secondary" style="text-align:center;font-size:12px;font-weight:700">${cnRoles[r.name]||'—'}</td>
      ${r.d.map(v=>`<td class="${v===1?'text-success':v>0?'text-primary':'text-body-secondary'}" style="text-align:center;${mono};font-weight:600;font-size:12px">${v||'·'}</td>`).join('')}
      <td class="text-warning" style="text-align:center;${mono};font-weight:700">${r.tc}</td>
      <td class="text-success" style="text-align:right;${mono};font-weight:700;font-size:13px">${tcLuong?numFmt(tcLuong):'—'}</td>
      <td class="text-secondary" style="text-align:right;${mono};font-size:12px">${luongTB?numFmt(luongTB):'—'}</td>
      <td class="text-danger" style="text-align:right;${mono};font-size:12px">${r.tru?numFmt(r.tru):'—'}</td>
      <td class="text-success fw-bold" style="text-align:right;${mono};background:#f1f8f4">${thucLanh_>0?numFmt(thucLanh_):thucLanh_<0?'('+numFmt(-thucLanh_)+')':'—'}</td>
      <td class="project-col text-secondary" style="font-size:11px">${ctDisplay_}</td>
    </tr>`;
  }).join('');

  if(sumEl) sumEl.innerHTML=`<span>${rows.length} công nhân · Tổng TC Lương: <strong class="text-success font-monospace">${fmtS(sumTCLuong)}</strong> · Tổng Thực Lãnh: <strong class="text-warning font-monospace">${fmtS(sumThucLanh)}</strong></span>`;
}

// Format nghìn đồng — chỉ dùng cho selected summary (32,620,000 → "32.620 k")
function fmtK(v){ const k=Math.round((v||0)/1000); return k.toLocaleString('vi-VN')+' k'; }

// Tính tổng Thực Lãnh của các dòng đang được tick trong bảng TLT
function updateTLTSelectedSum(){
  const sumEl=document.getElementById('cc-tlt-selected-sum');
  if(!sumEl) return;
  const chks=[...document.querySelectorAll('#cc-tlt-tbody .cc-tlt-chk:checked, #cc-tlt-cards .cc-tlt-chk:checked')];
  if(!chks.length){ sumEl.textContent=''; return; }
  let total=0;
  chks.forEach(chk=>{
    const container=chk.closest('tr')||chk.closest('.tlt-card');
    if(!container) return;
    const tl=+(container.dataset.tl||0);
    const pc=+(container.dataset.pc||0);
    const hdml=+(container.dataset.hdml||0);
    const loan=+(container.dataset.loan||0);
    const tru=+(container.dataset.tru||0);
    total+=tl+pc+loan+hdml-tru;
  });
  sumEl.textContent=chks.length+'cn: '+fmtK(total);
}

function exportCCTLTCSV(){
  const fWk=document.getElementById('cc-tlt-week').value;
  const fCt2=document.getElementById('cc-tlt-ct')?.value||'';
  const fQ=(document.getElementById('cc-tlt-search')?.value||'').toLowerCase().trim(); // tìm theo tên CN
  const map={};
  // [MODIFIED] — filter by projectId, resolve CT names
  ccData.forEach(w=>{
    if(w.deletedAt) return;
    if(!inActiveYear(w.fromDate)) return;
    if(fCt2&&!(w.projectId===fCt2||w.ctPid===fCt2||w.ct===fCt2)) return; // [MODIFIED]
    if(fWk&&w.fromDate!==fWk) return;
    const ctDisplay=_resolveCtName(w); // [MODIFIED]
    w.workers.forEach(wk=>{
      if(fQ && !(wk.name||'').toLowerCase().includes(fQ)) return; // lọc theo tên CN (khớp bảng đang hiển thị)
      // Mirror same key logic as renderCCTLT: group by name-only when no week filter
      const key=fWk?w.fromDate+'|'+wk.name:wk.name;
      if(!map[key]) map[key]={fromDate:w.fromDate,toDate:w.toDate,name:wk.name,
        d:[0,0,0,0,0,0,0],tc:0,tl:0,pc:0,hdml:0,loan:0,tru:0,cts:[]};
      wk.d.forEach((v,i)=>{ map[key].d[i]+=v; });
      const tc=round1(wk.d.reduce((s,v)=>s+v,0));
      map[key].tc+=tc; map[key].tl+=tc*(wk.luong||0);
      map[key].pc+=(wk.phucap||0); map[key].hdml+=(wk.hdmuale||0);
      map[key].loan+=(wk.loanAmount||0);
      map[key].tru+=(wk.tru||0);
      if(!map[key].cts.includes(ctDisplay)) map[key].cts.push(ctDisplay); // [MODIFIED]
      if(!fWk){ if(w.fromDate<map[key].fromDate) map[key].fromDate=w.fromDate;
                if(w.toDate>map[key].toDate) map[key].toDate=w.toDate; }
    });
  });
  Object.values(map).forEach(r=>{ r.tc=round1(r.tc); r.d=r.d.map(v=>round1(v)); });
  const rows=[['Tuần','Tên CN','CN','T2','T3','T4','T5','T6','T7','TC','TC Lương','Lương TB/Ngày','Vay Mới','Trừ Nợ','Thực Lãnh','Công Trình']];
  Object.values(map).sort((a,b)=>fWk?b.fromDate.localeCompare(a.fromDate)||a.name.localeCompare(b.name,'vi'):a.name.localeCompare(b.name,'vi')).forEach(r=>{
    const tcL=r.tl+r.pc+r.hdml;  // TC Lương = lương + phụ cấp + HĐ mua lẻ
    const ltb=r.tc>0?Math.round(tcL/r.tc):0;
    const thucLanh_csv=r.tl+r.pc+r.loan+r.hdml-r.tru;
    const periodStr=fWk?viShort(r.fromDate)+'–'+viShort(r.toDate):'Tổng';
    rows.push([periodStr,r.name,...r.d,r.tc,tcL,ltb,r.loan,r.tru,thucLanh_csv,r.cts.join(', ')]);
  });
  dlCSV(rows,'tong_luong_tuan_'+today()+'.csv');
}

function ccTltGoTo(p){ ccTltPage=p; renderCCTLT(); }

// [MODIFIED] — resolve ct name from projectId for display
function loadCCWeekById(id, fromDate, ct) {
  const rec = ccData.find(w => !w.deletedAt && String(w.id) === String(id))
           || ccData.find(w => !w.deletedAt && w.fromDate === fromDate && (w.projectId === ct || w.ct === ct));
  if (!rec) { toast('Không tìm thấy dữ liệu tuần này', 'error'); return; }
  const thisSun=ccSundayISO(0);
  const [ty,tm,td]=thisSun.split('-').map(Number);
  const [fy,fm,fd]=rec.fromDate.split('-').map(Number);
  const diffMs=new Date(fy,fm-1,fd)-new Date(ty,tm-1,td);
  ccOffset=Math.round(diffMs/(7*86400000));
  const satISO=ccSaturdayISO(rec.fromDate);
  const ctDisplay=_resolveCtName(rec); // [MODIFIED]
  document.getElementById('cc-from').value=rec.fromDate;
  document.getElementById('cc-to').value=satISO;
  document.getElementById('cc-week-label').textContent='Tuần: '+weekLabel(rec.fromDate);
  document.getElementById('cc-ct-sel').value=ctDisplay; // [MODIFIED]
  buildCCTable(rec.workers);
  renderCCTLTMini();   // cập nhật bảng tổng lương mini theo tuần vừa tải
  ccShowSubSoCC();     // nút "Tải" nằm ở subtab 2 → tự chuyển về subtab 1 để thấy sổ
  window.scrollTo({top:0,behavior:'smooth'});
  toast('Đã tải tuần '+viShort(rec.fromDate)+' – '+ctDisplay); // [MODIFIED]
}

// [MODIFIED] — match by projectId, display resolved name
function delCCWeekById(id, fromDate, ct) {
  const ctDisplay = _getProjectNameById(ct) || ct; // [MODIFIED] — ct may be projectId
  if(!confirm(`Xóa toàn bộ chấm công tuần ${viShort(fromDate)} của công trình "${ctDisplay}"?`)) return;
  const now = Date.now();
  let found = false;
  ccData = ccData.map(r => {
    const matchId  = String(r.id) === String(id);
    // [MODIFIED] — also match by projectId
    const matchKey = r.fromDate === fromDate && (r.projectId === ct || r.ct === ct);
    if ((matchId || matchKey) && !r.deletedAt) {
      found = true;
      return { ...r, deletedAt: now, updatedAt: now, deviceId: DEVICE_ID, deletedBy: getCurrentUser()?.username || 'Không rõ' };
    }
    return r;
  });
  if (!found) { toast('Không tìm thấy dữ liệu để xóa', 'error'); return; }
  clearInvoiceCache(); save('cc_v2', ccData);
  updateTop(); renderCCHistory(); renderCCTLT();
  renderCCTLTMini(); // phòng trường hợp tuần bị xóa chính là tuần đang mở ở sổ
  toast('Đã xóa tuần chấm công');
}

function delCCWorker(wid,name){
  if(!confirm(`Xóa "${name}" khỏi tuần này?`)) return;
  const w=ccData.find(r=>r.id===wid);
  if(w){ w.workers=w.workers.filter(wk=>wk.name!==name); if(!w.workers.length) ccData=ccData.filter(r=>r.id!==wid); }
  clearInvoiceCache(); save('cc_v2',ccData); renderCCHistory(); renderCCTLTMini(); toast('Đã xóa');
}

// ─── export ────────────────────────────────────────────────────────
function exportCCWeekCSV(){
  const f=document.getElementById('cc-from').value;
  const ct=document.getElementById('cc-ct-sel').value||'?';
  const rows=[['CT','Từ','Đến','Tên','CN','T2','T3','T4','T5','T6','T7','TC','Lương/N','Tổng Lương','Phụ Cấp','Vay Mới','HĐ Mua Lẻ','Trừ Nợ','Nội Dung','Thực Lãnh']];
  document.querySelectorAll('#cc-tbody tr:not(.cc-sum-row)').forEach(tr=>{
    const name=tr.querySelector('[data-cc="name"]')?.value?.trim()||'';
    if(!name) return;
    const d=[]; for(let i=0;i<7;i++) d.push(parseFloat(tr.querySelector(`[data-cc="d${i}"]`)?.value||0)||0);
    const tc=round1(d.reduce((s,v)=>s+v,0));
    const l=parseInt(tr.querySelector('[data-cc="luong"]')?.dataset?.raw||0)||0;
    const pc=parseInt(tr.querySelector('[data-cc="phucap"]')?.dataset?.raw||0)||0;
    const ln=parseInt(tr.querySelector('[data-cc="loan"]')?.dataset?.raw||0)||0;
    const hd=parseInt(tr.querySelector('[data-cc="hdml"]')?.dataset?.raw||0)||0;
    const tru=parseInt(tr.querySelector('[data-cc="tru"]')?.dataset?.raw||0)||0;
    const nd=tr.querySelector('[data-cc="nd"]')?.value?.trim()||'';
    rows.push([ct,f,document.getElementById('cc-to').value,name,...d,tc,l,tc*l,pc,ln,hd,tru,nd,tc*l+pc+ln+hd-tru]);
  });
  dlCSV(rows,'chamcong_'+f+'.csv');
}

function exportCCHistCSV(){
  // Xuất đúng dữ liệu đang lọc trong bảng Lịch Sử Chấm Công Tuần
  const fCt=document.getElementById('cc-hist-ct').value;
  const fWk=document.getElementById('cc-hist-week').value;
  const rows=[['CT','Từ','Đến','CN','T2','T3','T4','T5','T6','T7','TC','Lương/Ngày TB','Tổng Lương','Phụ Cấp','HĐ Mua Lẻ','Nội Dung','Tổng Cộng']];
  const map={};
  // [MODIFIED] — filter + group by projectId, display resolved name
  ccData.forEach(w=>{
    if(w.deletedAt) return;
    if(!inActiveYear(w.fromDate)) return;
    if(fCt&&!(w.projectId===fCt||w.ctPid===fCt||w.ct===fCt)) return; // [MODIFIED]
    if(fWk&&w.fromDate!==fWk) return;
    const ctDisplay=_resolveCtName(w); // [MODIFIED]
    const key=w.fromDate+'|'+(w.projectId||w.ct); // [MODIFIED]
    if(!map[key]) map[key]={
      fromDate:w.fromDate,toDate:w.toDate,ct:ctDisplay, // [MODIFIED]
      d:[0,0,0,0,0,0,0],tc:0,tl:0,pc:0,hd:0,luongList:[],ndList:[]
    };
    w.workers.forEach(wk=>{
      const tc=round1(wk.d.reduce((s,v)=>s+v,0));
      const luong=Number(wk.luong)||0;
      wk.d.forEach((v,i)=>{ map[key].d[i]+=Number(v)||0; });
      map[key].tc+=tc;
      map[key].tl+=tc*luong;
      map[key].pc+=(wk.phucap||0);
      map[key].hd+=(wk.hdmuale||0);
      if(luong>0) map[key].luongList.push(luong);
      if(wk.nd) map[key].ndList.push(wk.nd);
    });
  });
  Object.values(map).forEach(r=>{ r.tc=round1(r.tc); r.d=r.d.map(v=>round1(v)); });
  Object.values(map)
    .map(r=>{
      const avgLuong=r.luongList.length?Math.round(r.luongList.reduce((s,v)=>s+v,0)/r.luongList.length):0;
      const nd=[...new Set(r.ndList.map(v=>(v||'').trim()).filter(Boolean))].join(' | ');
      return {...r,avgLuong,nd,tong:r.tl+r.pc+r.hd};
    })
    .sort((a,b)=>b.fromDate.localeCompare(a.fromDate)||(a.ct||'').localeCompare(b.ct||'','vi'))
    .forEach(r=>{
      rows.push([r.ct,viShort(r.fromDate)+'–'+viShort(r.toDate),r.toDate,...r.d,r.tc,r.avgLuong,r.tl,r.pc,r.hd,r.nd,r.tong]);
    });
  const label=fWk?viShort(fWk):'all';
  dlCSV(rows,'lich_su_cham_cong_'+label+'_'+today()+'.csv');
}

// [MODULE: PHIẾU LƯƠNG] — xuatPhieuLuong · html2canvas
// Ctrl+F → "MODULE: PHIẾU LƯƠNG"
// ══════════════════════════════════════════════════════════════

function removeVietnameseTones(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // xóa dấu
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9\s_]/g, '')    // xóa ký tự đặc biệt
    .trim()
    .replace(/\s+/g, '_');
}

function xuatPhieuLuong() {
  // 1. Thu thập công nhân được tick từ bảng Tổng Lương Tuần
  //    Hỗ trợ cả table row (desktop) và card div (mobile)
  const rows = [];
  document.querySelectorAll('.cc-tlt-chk:checked').forEach(chk => {
    const container = chk.closest('[data-name]');
    if (!container) return;
    const name     = container.dataset.name || '(Chưa đặt tên)';
    const fromDate = container.dataset.from  || '';
    const toDate   = container.dataset.to    || '';
    const tc       = parseFloat(container.dataset.tc)   || 0;
    const tl       = parseInt(container.dataset.tl)     || 0; // tc * luong
    const pc       = parseInt(container.dataset.pc)     || 0; // phụ cấp
    const hdml     = parseInt(container.dataset.hdml)   || 0; // HĐ mua lẻ
    const loan     = parseInt(container.dataset.loan)   || 0; // vay mới
    const tru      = parseInt(container.dataset.tru)    || 0; // trừ nợ ứng
    const noCon    = parseInt(container.dataset.noCon)  || 0; // nợ còn
    const cts      = (container.dataset.cts || '').split('|').filter(Boolean);
    const tongCong = tl + pc;
    const luongTB  = tc > 0 ? Math.round(tl / tc) : 0;
    rows.push({ name, fromDate, toDate, tc, tl, pc, hdml, loan, cts, tongCong, luongTB, tru, noCon });
  });

  if (!rows.length) {
    toast('⚠️ Tick chọn ít nhất 1 công nhân trong bảng Tổng Lương Tuần!', 'error');
    return;
  }

  // 2. Tổng hợp thông tin chung
  const allFrom = rows.map(r => r.fromDate).filter(Boolean).sort();
  const allTo   = rows.map(r => r.toDate).filter(Boolean).sort();
  const fromDt  = allFrom[0] || '';
  const toDt    = allTo[allTo.length - 1] || '';
  const period  = fromDt && toDt ? _fmtDate(fromDt) + ' — ' + _fmtDate(toDt) : '(Chưa rõ)';

  const allCts     = [...new Set(rows.flatMap(r => r.cts))];
  const ctLabel    = allCts.join(', ') || '(Nhiều công trình)';
  const today_     = new Date().toLocaleDateString('vi-VN');
  const tongThanhToan  = rows.reduce((s, r) => s + r.tongCong, 0); // sum(tl+pc)
  const tongTru_       = rows.reduce((s, r) => s + r.tru,      0);
  const tongLoan_      = rows.reduce((s, r) => s + r.loan,     0);
  const tongHDML_      = rows.reduce((s, r) => s + r.hdml,     0);
  const tongThucLanh_  = tongThanhToan + tongHDML_ + tongLoan_ - tongTru_;
  const _seenCNNames = new Set();
  let tongNoCon_ = 0; // tổng nợ cũ (trước tuần) — mỗi CN chỉ tính 1 lần
  rows.forEach(r => { if(!_seenCNNames.has(r.name)){ _seenCNNames.add(r.name); tongNoCon_ += r.noCon; } });
  const tongNoHienTai_ = tongNoCon_ + tongLoan_ - tongTru_; // nợ còn sau tuần này

  // 3. Đổ dữ liệu vào template
  document.getElementById('pl-ct-name').textContent = ctLabel;
  document.getElementById('pl-ct-label').textContent = ctLabel;
  document.getElementById('pl-period').textContent   = period;
  document.getElementById('pl-date').textContent     = today_;

  document.getElementById('pl-tbody').innerHTML = rows.map(r => `
    <tr>
      <td>${x(r.name)}</td>
      <td>${r.tc}</td>
      <td>${r.luongTB ? numFmt(r.luongTB) + ' đ' : '—'}</td>
      <td>${r.pc ? numFmt(r.pc) + ' đ' : '—'}</td>
      <td style="font-weight:700;color:#c8870a">${numFmt(r.tongCong)} đ</td>
    </tr>`).join('');

  document.getElementById('pl-total-cell').textContent = numFmt(tongThanhToan) + ' đ';

  // ── Phần tổng hợp chi phí & công nợ ──────────────────────────────
  document.getElementById('pl-sum-hdml').textContent =
    tongHDML_ ? numFmt(tongHDML_) + ' đ' : '—';
  document.getElementById('pl-sum-thuclanh').textContent =
    numFmt(tongThanhToan + tongHDML_) + ' đ'; // (lương+PC) + HĐ mua lẻ
  document.getElementById('pl-sum-tru').textContent =
    tongTru_ ? numFmt(tongTru_) + ' đ' : '—';
  document.getElementById('pl-sum-loan').textContent =
    tongLoan_ ? numFmt(tongLoan_) + ' đ' : '—';
  const _noConEl    = document.getElementById('pl-sum-nocon');
  const _noConStr   = tongNoHienTai_ > 0 ? numFmt(tongNoHienTai_) + ' (nợ)'
                    : tongNoHienTai_ < 0 ? numFmt(-tongNoHienTai_) + ' (dư)'
                    : '0 đ';
  const _noConColor = tongNoHienTai_ > 0 ? '#c0392b'
                    : tongNoHienTai_ < 0 ? '#1a6e3a' : '#555';
  if (_noConEl) { _noConEl.textContent = _noConStr; _noConEl.style.color = _noConColor; }

  // Grand total — luôn hiển thị Thực Lãnh
  document.getElementById('pl-grand-total').textContent =
    'THỰC LÃNH: ' + numFmt(Math.max(0, tongThucLanh_)) + ' đồng';

  // 4. Hiện template tạm để chụp
  const tpl = document.getElementById('phieu-luong-template');
  tpl.style.display = 'block';

  // 5. Chụp bằng html2canvas
  const _now = new Date();
  const _dd = String(_now.getDate()).padStart(2, '0');
  const _mm = String(_now.getMonth() + 1).padStart(2, '0');
  const _yy = String(_now.getFullYear()).slice(-2);
  const _datePart = _dd + _mm + _yy;
  const _wParts = rows.map(r =>
    removeVietnameseTones(r.name) + '_' + r.tc + 'c'
  ).join('_');
  const _ctList = allCts.slice(0, 3).map(ct => removeVietnameseTones(ct).slice(0, 3));
  const _ctPart = _ctList.join('_') + (allCts.length > 3 ? '_etc' : '');
  const fileName = 'Phieuluong_' + _datePart + '_' + _wParts + (_ctPart ? '_' + _ctPart : '');
  toast('⏳ Đang tạo phiếu lương...', 'info');

  document.fonts.ready.then(() => {
    html2canvas(tpl, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: 760
    }).then(canvas => {
      tpl.style.display = 'none';
      const link = document.createElement('a');
      link.download = fileName + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast('✅ Đã xuất phiếu lương ' + rows.length + ' người!', 'success');
    }).catch(err => {
      tpl.style.display = 'none';
      console.error('html2canvas error:', err);
      toast('❌ Lỗi khi tạo ảnh: ' + err.message, 'error');
    });
  });
}

// Helper: format ngày YYYY-MM-DD → DD/MM/YYYY
// Lõi xuất phiếu ứng PNG — tách riêng theo từng bảng (TP / NCC) để không xuất lẫn lộn.
//  scopeId     : id container của bảng cần lấy checkbox ('ung-tp-section' | 'ung-ncc-section')
//  sourceRecs  : danh sách bản ghi tương ứng để lấy dữ liệu (filteredUngTp | filteredUngNcc)
function _exportUngImageFrom(scopeId, sourceRecs) {
  // 1. Chỉ lấy các dòng được tick TRONG đúng bảng đang xuất (không lấy nhầm bảng kia)
  const scope = document.getElementById(scopeId);
  const checkedIds = new Set(
    [...(scope ? scope.querySelectorAll('.ung-row-chk:checked') : [])].map(el => el.dataset.id)
  );
  if (!checkedIds.size) {
    toast('⚠️ Vui lòng tick chọn ít nhất 1 khoản ứng!', 'error');
    return;
  }
  const rows = (sourceRecs || []).filter(r => checkedIds.has(String(r.id)));
  if (!rows.length) {
    toast('⚠️ Không tìm thấy dữ liệu — thử lọc lại rồi tick chọn!', 'error');
    return;
  }

  // 2. Thông tin chung
  const ct       = rows[0]?.congtrinh || '(Chưa rõ CT)';
  const tongTien = sumBy(rows, 'tien');

  // 3. Đổ dữ liệu vào template
  document.getElementById('pul-ct-name').textContent  = ct;
  document.getElementById('pul-ct-label').textContent = ct;
  document.getElementById('pul-date').textContent     = new Date().toLocaleDateString('vi-VN');

  document.getElementById('pul-tbody').innerHTML = rows.map((r, i) => `
    <tr style="${i % 2 === 1 ? 'background:#f9f7f4' : ''}">
      <td style="padding:8px 10px;white-space:nowrap">${r.ngay}</td>
      <td style="padding:8px 10px;font-weight:600">${x(r.tp || '—')}</td>
      <td style="padding:8px 10px;color:#555">${x(r.nd || '—')}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;color:#c8870a;white-space:nowrap">
        ${numFmt(r.tien || 0)} đ
      </td>
    </tr>`).join('');

  document.getElementById('pul-total-cell').textContent   = numFmt(tongTien) + ' đ';
  document.getElementById('pul-grand-total').textContent  =
    'TỔNG TIỀN TẠM ỨNG: ' + numFmt(tongTien) + ' đồng';

  // 4. Tạo tên file:  Phieuung_TenCT_TenTP1_500k_TenTP2_300k.png
  const safeCT = removeVietnameseTones(ct);
  const tpMap  = {};
  rows.forEach(r => {
    const key = r.tp || 'KhongRo';
    tpMap[key] = (tpMap[key] || 0) + (r.tien || 0);
  });
  const workerParts = Object.entries(tpMap)
    .map(([tp, tien]) => removeVietnameseTones(tp) + '_' + Math.round(tien / 1000) + 'k')
    .join('_');
  const fileName = 'Phieuung_' + safeCT + '_' + workerParts;

  // 5. Chụp ảnh
  const tpl = document.getElementById('phieu-ung-template');
  tpl.style.display = 'block';
  toast('⏳ Đang tạo phiếu tạm ứng...', 'info');

  document.fonts.ready.then(() => {
    html2canvas(tpl, {
      scale: 2, backgroundColor: '#ffffff',
      useCORS: true, logging: false, windowWidth: 760
    }).then(canvas => {
      tpl.style.display = 'none';
      const link = document.createElement('a');
      link.download = fileName + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast('✅ Đã xuất phiếu tạm ứng ' + rows.length + ' dòng!', 'success');
    }).catch(err => {
      tpl.style.display = 'none';
      toast('❌ Lỗi khi tạo ảnh: ' + err.message, 'error');
    });
  });
}

// Xuất phiếu ứng riêng cho bảng THẦU PHỤ (chỉ lấy dòng tick trong bảng Thầu Phụ)
function exportUngTpToImage() {
  _exportUngImageFrom('ung-tp-section', filteredUngTp);
}

// Xuất phiếu ứng riêng cho bảng NHÀ CUNG CẤP (chỉ lấy dòng tick trong bảng NCC)
function exportUngNccToImage() {
  _exportUngImageFrom('ung-ncc-section', filteredUngNcc);
}
