// danhmuc.categories.js — CT Page, Danh Mục, Settings, Normalize, Rebuild Selects
// Load order: sau hoadon.js, trước danhmuc.ung.js

// ══════════════════════════════
//  CT PAGE
// ══════════════════════════════
function renderCtPage() {
  const grid=document.getElementById('ct-grid');
  const map={};
  getInvoicesCached().forEach(inv=>{
    if(!inActiveYear(inv.ngay)) return;
    const ctKey = resolveProjectName(inv) || '(Không rõ)';
    if(!map[ctKey]) map[ctKey]={total:0,count:0,byLoai:{}};
    map[ctKey].total+=(inv.thanhtien||inv.tien||0); map[ctKey].count++;
    map[ctKey].byLoai[inv.loai]=(map[ctKey].byLoai[inv.loai]||0)+(inv.thanhtien||inv.tien||0);
  });
  const sortBy=(document.getElementById('ct-sort')?.value)||'value';
  const entries=Object.entries(map).sort((a,b)=>
    sortBy==='name' ? a[0].localeCompare(b[0],'vi') : b[1].total-a[1].total
  );
  if(!entries.length){grid.innerHTML=`<div class="text-secondary" style="grid-column:1/-1;text-align:center;padding:60px;font-size:14px">Chưa có dữ liệu</div>`;return;}
  grid.innerHTML=entries.map(([ct,d])=>{
    const rows=Object.entries(d.byLoai).sort((a,b)=>b[1]-a[1]);
    return `<div class="ct-card card shadow-sm overflow-hidden" onclick="showCtModal(${JSON.stringify(ct)})">
      <div class="ct-card-head">
        <div><div class="ct-card-name">${x(ct)}</div><div class="ct-card-count">${d.count} hóa đơn</div></div>
        <div class="ct-card-total">${fmtS(d.total)}</div>
      </div>
      <div class="ct-card-body">
        ${rows.slice(0,6).map(([l,v])=>`<div class="ct-loai-row"><span class="ct-loai-name">${x(l)}</span><span class="ct-loai-val">${fmtS(v)}</span></div>`).join('')}
        ${rows.length>6?`<div class="text-secondary" style="font-size:11px;text-align:right;padding-top:6px">+${rows.length-6} loại khác...</div>`:''}
      </div>
    </div>`;
  }).join('');
}

function showCtModal(ctName) {
  const invs=getInvoicesCached().filter(i=>resolveProjectName(i)===ctName && inActiveYear(i.ngay));
  document.getElementById('modal-title').textContent='🏗️ '+ctName;
  const byLoai={};
  invs.forEach(inv=>{ if(!byLoai[inv.loai])byLoai[inv.loai]=[]; byLoai[inv.loai].push(inv); });
  const total=invs.reduce((s,i)=>s+(i.thanhtien||i.tien||0),0);
  let html=`<div style="display:flex;gap:12px;margin-bottom:18px">
    <div style="flex:1;background:var(--bs-tertiary-bg);border-radius:8px;padding:12px"><div class="text-body-secondary" style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Tổng HĐ</div><div style="font-size:22px;font-weight:700">${invs.length}</div></div>
    <div style="flex:2;background:var(--bs-success-subtle);border-radius:8px;padding:12px"><div class="text-body-secondary" style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Tổng Chi Phí</div><div class="text-success" style="font-size:20px;font-weight:700;font-family:'IBM Plex Mono',monospace">${fmtM(total)}</div></div>
  </div>`;
  Object.entries(byLoai).forEach(([loai,invList])=>{
    const lt=invList.reduce((s,i)=>s+(i.thanhtien||i.tien||0),0);
    html+=`<div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 12px;background:var(--bs-warning-subtle);border-radius:6px;margin-bottom:6px">
        <span class="tag tag-gold">${x(loai)}</span>
        <span class="text-warning fw-bold font-monospace">${fmtM(lt)}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr>${['Ngày','Người TH','Nội Dung','Thành Tiền'].map((h,i)=>`<th class="text-secondary" style="padding:5px 8px;background:var(--bs-tertiary-bg);font-size:10px;font-weight:700;text-transform:uppercase;text-align:${i===3?'right':'left'}">${h}</th>`).join('')}</tr></thead>
        <tbody>${invList.map(i=>`<tr style="border-bottom:1px solid var(--bs-border-color)">
          <td class="text-secondary font-monospace" style="padding:6px 8px">${i.ngay}</td>
          <td class="text-secondary" style="padding:6px 8px">${x(i.nguoi||'—')}</td>
          <td class="text-secondary" style="padding:6px 8px">${x(i.nd||'—')}</td>
          <td class="text-success text-end font-monospace fw-semibold" style="padding:6px 8px">${numFmt(i.thanhtien||i.tien||0)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  });
  document.getElementById('modal-body').innerHTML=html;
  document.getElementById('ct-modal').classList.add('open');
}
function closeModal(){ document.getElementById('ct-modal').classList.remove('open'); }
document.getElementById('ct-modal').addEventListener('click',e=>{ if(e.target===e.currentTarget)closeModal(); });

// ══════════════════════════════
//  DANH MỤC — NORMALIZE + DEDUP
// ══════════════════════════════

// Chuẩn hóa tên theo loại danh mục — wrapper của normalizeCatDisplayName (core.cloud-cats-ui.js)
// loaiChiPhi / tbTen → Title Case; còn lại → UPPERCASE
function normalizeName(catId, val) {
  if (typeof normalizeCatDisplayName === 'function') {
    return normalizeCatDisplayName(catId, val);
  }
  // Fallback (không nên xảy ra trong runtime — core.cloud-cats-ui.js load trước)
  val = (val || '').trim();
  if (!val) return val;
  if (catId === 'loaiChiPhi' || catId === 'tbTen') {
    return val.toLowerCase().split(/\s+/).filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return val.toUpperCase();
}

// Chuẩn hóa để so sánh trùng: bỏ dấu tiếng Việt + lowercase + chuẩn khoảng trắng
function normalizeKey(val) {
  return (val || '').normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // bỏ dấu kết hợp Unicode
    .replace(/[đĐ]/g, 'd')             // đ/Đ → d
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Kiểm tra item có phát sinh trong năm đang chọn không
// LƯU Ý: cả 2 vế trong .some() đều bọc qua normalizeKey() để map "Hóa Đơn Lẻ" ↔ "HÓA ĐƠN LẺ"
function _isDmItemUsedInYear(catId, item) {
  const nItem = normalizeKey(item);
  if (!nItem) return false;
  const invs = getInvoicesCached();
  const cfg = CATS.find(c => c.id === catId);
  if (cfg && cfg.refField) {
    if (invs.some(i => inActiveYear(i.ngay)
        && normalizeKey(i[cfg.refField] || '') === nItem)) return true;
  }
  if (catId === 'thauPhu' || catId === 'nhaCungCap') {
    if (ungRecords.some(r => !r.deletedAt && inActiveYear(r.ngay)
        && (r.loai || 'thauphu') === 'thauphu'
        && normalizeKey(r.tp || '') === nItem)) return true;
  }
  if (catId === 'congNhan') {
    if (ccData.some(w => !w.deletedAt && inActiveYear(w.fromDate)
        && (w.workers || []).some(wk => normalizeKey(wk.name) === nItem))) return true;
    if (ungRecords.some(r => !r.deletedAt && inActiveYear(r.ngay)
        && r.loai === 'congnhan'
        && normalizeKey(r.tp || '') === nItem)) return true;
  }
  if (catId === 'tbTen') {
    if (typeof tbData !== 'undefined'
        && tbData.some(t => !t.deletedAt && inActiveYear(t.ngay)
            && normalizeKey(t.ten) === nItem)) return true;
  }
  return false;
}

// Kiểm tra item có phát sinh bất kỳ năm nào không
// LƯU Ý: cả 2 vế đều bọc normalizeKey() để khớp được mọi dạng hoa/thường/dấu
function _isDmItemUsedAnytime(catId, item) {
  const nItem = normalizeKey(item);
  if (!nItem) return false;
  const invs = getInvoicesCached();
  const cfg = CATS.find(c => c.id === catId);
  if (cfg && cfg.refField) {
    if (invs.some(i => normalizeKey(i[cfg.refField] || '') === nItem)) return true;
  }
  if (catId === 'thauPhu' || catId === 'nhaCungCap') {
    if (ungRecords.some(r => !r.deletedAt
        && (r.loai || 'thauphu') === 'thauphu'
        && normalizeKey(r.tp || '') === nItem)) return true;
  }
  if (catId === 'congNhan') {
    if (ccData.some(w => !w.deletedAt
        && (w.workers || []).some(wk => normalizeKey(wk.name) === nItem))) return true;
    if (ungRecords.some(r => !r.deletedAt && r.loai === 'congnhan'
        && normalizeKey(r.tp || '') === nItem)) return true;
  }
  if (catId === 'tbTen') {
    if (typeof tbData !== 'undefined'
        && tbData.some(t => !t.deletedAt && normalizeKey(t.ten) === nItem)) return true;
  }
  return false;
}

// Quét và sửa toàn bộ data cũ: chuẩn hóa tên trong mọi record cho khớp với cats
// Mỗi bảng: nếu normalizeKey(giá trị) khớp cats nhưng cách viết khác → thay bằng tên chuẩn
function scanAndFixAllDataFormats() {
  // Xây canonical map: normalizeKey → tên chuẩn (từ cats)
  const canonMap = new Map();
  const addArr = arr => (arr||[]).forEach(name => {
    const k = normalizeKey(name);
    if (k && !canonMap.has(k)) canonMap.set(k, name);
  });
  addArr(cats.loaiChiPhi); addArr(cats.nhaCungCap); addArr(cats.nguoiTH);
  addArr(cats.thauPhu);    addArr(cats.congNhan);   addArr(cats.tbTen);
  if (!canonMap.size) return;

  // Tra cứu tên chuẩn; trả về nguyên gốc nếu không có trong danh mục
  const fix = v => { const c = canonMap.get(normalizeKey(v||'')); return (c&&c!==v) ? c : v; };

  let inv=false, ung=false, cc=false, tb=false, tp=false, thu=false, hd=false, roles=false;

  // invoices: loai, ncc, nguoi
  invoices.forEach(r => {
    ['loai','ncc','nguoi'].forEach(f => {
      if (!r[f]) return;
      const fixed = fix(r[f]);
      if (fixed !== r[f]) { r[f]=fixed; inv=true; }
    });
  });

  // ungRecords: tp
  ungRecords.forEach(r => {
    if (!r.tp) return;
    const fixed = fix(r.tp);
    if (fixed !== r.tp) { r.tp=fixed; ung=true; }
  });

  // ccData: worker.name
  (ccData||[]).forEach(week => {
    (week.workers||[]).forEach(wk => {
      if (!wk.name) return;
      const fixed = fix(wk.name);
      if (fixed !== wk.name) { wk.name=fixed; cc=true; }
    });
  });

  // tbData: ten
  if (typeof tbData!=='undefined') tbData.forEach(t => {
    if (!t.ten) return;
    const fixed = fix(t.ten);
    if (fixed !== t.ten) { t.ten=fixed; tb=true; }
  });

  // thauPhuContracts: thauphu
  if (typeof thauPhuContracts!=='undefined') thauPhuContracts.forEach(r => {
    if (!r.thauphu) return;
    const fixed = fix(r.thauphu);
    if (fixed !== r.thauphu) { r.thauphu=fixed; tp=true; }
  });

  // thuRecords: nguoi
  if (typeof thuRecords!=='undefined') thuRecords.forEach(r => {
    if (!r.nguoi) return;
    const fixed = fix(r.nguoi);
    if (fixed !== r.nguoi) { r.nguoi=fixed; thu=true; }
  });

  // hopDongData: nguoi
  if (typeof hopDongData!=='undefined') Object.values(hopDongData).forEach(hd_ => {
    if (!hd_.nguoi) return;
    const fixed = fix(hd_.nguoi);
    if (fixed !== hd_.nguoi) { hd_.nguoi=fixed; hd=true; }
  });

  // cnRoles: rename keys sai hoa/thường
  if (typeof cnRoles!=='undefined') {
    const fixed = {};
    Object.entries(cnRoles).forEach(([k,v]) => {
      const fk = fix(k) || k;
      if (!fixed.hasOwnProperty(fk)) fixed[fk]=v;
      if (fk!==k) roles=true;
    });
    if (roles) {
      Object.keys(cnRoles).forEach(k => delete cnRoles[k]);
      Object.assign(cnRoles, fixed);
      save('cat_cn_roles', cnRoles);
    }
  }

  // Lưu các bảng đã thay đổi
  if (inv)  { clearInvoiceCache(); save('inv_v3', invoices); }
  if (ung)  save('ung_v1', ungRecords);
  if (cc)   save('cc_v2',  ccData);
  if (tb)   save('tb_v1',  tbData);
  if (tp)   save('thauphu_v1',  thauPhuContracts);
  if (thu)  save('thu_v1', thuRecords);
  if (hd)   save('hopdong_v1',  hopDongData);

  const n = [inv,ung,cc,tb,tp,thu,hd,roles].filter(Boolean).length;
  if (n) console.log(`[DM] scanAndFixAllDataFormats: đã chuẩn hóa ${n} bảng dữ liệu`);
}

// Chuẩn hóa dữ liệu hiện có: loaiChiPhi + tbTen → Title Case
// Idempotent: chỉ save khi thực sự có thay đổi
// Flag chỉ dùng cho bước scanAndFixAllDataFormats (scan record nghiệp vụ — tốn kém hơn)
// Canonicalize cats arrays luôn chạy (rẻ, idempotent)
let _catNamesMigrated = false;
// Gọi từ sync/import để cho phép _migrateCatNamesFormat chạy lại ở lần renderSettings tiếp theo
function resetCatNamesMigrated() { _catNamesMigrated = false; }
function _migrateCatNamesFormat() {
  const needScanData = !_catNamesMigrated;
  _catNamesMigrated = true;
  let changed = false;
  // Bước 1: chuẩn hóa + dedup mảng cats (Title Case / UPPERCASE + loại bỏ bản trùng)
  ['loaiChiPhi', 'tbTen', 'nhaCungCap', 'nguoiTH', 'thauPhu', 'congNhan'].forEach(catId => {
    if (!Array.isArray(cats[catId])) return;
    // normalize từng phần tử, sau đó dedup bằng normalizeKey (bắt "COPHA" vs "Copha")
    const seen = new Set();
    const deduped = cats[catId]
      .map(n => normalizeName(catId, n))
      .filter(n => {
        const k = normalizeKey(n);
        return k && !seen.has(k) ? (seen.add(k), true) : false;
      });
    if (JSON.stringify(deduped) !== JSON.stringify(cats[catId])) {
      cats[catId] = deduped;
      saveCats(catId);
      changed = true;
    }
  });
  if (changed) console.log('[DM] _migrateCatNamesFormat: chuẩn hóa + dedup cats xong');
  // Bước 2: quét và sửa tất cả data cũ trong DB (chỉ chạy khi cần — tốn kém hơn)
  if (needScanData) scanAndFixAllDataFormats();
}

// ══════════════════════════════
//  SETTINGS
// ══════════════════════════════
function renderSettings() {
  _migrateCatNamesFormat(); // đảm bảo data luôn đúng format trước khi render
  const grid=document.getElementById('dm-grid');
  grid.innerHTML='';
  // congTrinh đã có module riêng (Tab Công Trình) — không hiển thị card tại đây nữa
  CATS.filter(cfg => cfg.id !== 'congTrinh').forEach(cfg=>{
    // ── tbTen: bổ sung tên thiết bị có trong tbData mà thiếu trong cats.tbTen ──
    // Đảm bảo danh sách hiển thị đầy đủ thiết bị thực tế đang tồn tại,
    // không bị rớt do pruneTbTen cũ hay sync chưa kịp.
    if (cfg.id === 'tbTen' && typeof tbData !== 'undefined') {
      const haveKeys = new Set((cats.tbTen || []).map(n => normalizeKey(n)));
      const toAdd = [];
      tbData.filter(t => !t.deletedAt && t.ten).forEach(t => {
        const k = normalizeKey(t.ten);
        if (k && !haveKeys.has(k)) {
          haveKeys.add(k);
          toAdd.push(normalizeName('tbTen', t.ten));
        }
      });
      if (toAdd.length) {
        cats.tbTen = [...(cats.tbTen || []), ...toAdd];
        saveCats('tbTen');
      }
    }

    const fullList = cats[cfg.id];
    const withIdxRaw = fullList.map((item, idx) => ({item, idx}));

    // ── Dedup UI: gộp các entry cùng normalizeKey thành 1 dòng ──
    // VD: "Hóa Đơn Lẻ" + "HÓA ĐƠN LẺ" → giữ 1 dòng (ưu tiên bản đúng format chuẩn)
    const dedupMap = new Map();
    withIdxRaw.forEach(entry => {
      const k = normalizeKey(entry.item);
      if (!k) return;
      const existing = dedupMap.get(k);
      if (!existing) { dedupMap.set(k, entry); return; }
      // Có duplicate → ưu tiên bản đã đúng format chuẩn (normalizeName)
      const canonical = normalizeName(cfg.id, entry.item);
      const currentIsCanonical = entry.item === canonical;
      const existingIsCanonical = existing.item === canonical;
      if (currentIsCanonical && !existingIsCanonical) dedupMap.set(k, entry);
    });

    // Lọc theo năm: tbTen luôn hiển thị 100%; các card khác lọc 3 trạng thái
    const allDeduped = [...dedupMap.values()];
    const filteredByYear = cfg.id === 'tbTen'
      ? allDeduped
      : allDeduped.filter(({item}) => {
          const usedInYear = _isDmItemUsedInYear(cfg.id, item);
          if (usedInYear) return true;          // Có phát sinh năm đang chọn → hiện
          const usedAnytime = _isDmItemUsedAnytime(cfg.id, item);
          return !usedAnytime;                  // Chưa từng dùng → hiện; dùng năm khác → ẩn
        });

    const filtered = filteredByYear
      .sort((a, b) => (a.item || '').localeCompare(b.item || '', 'vi'));
    const countLabel = `${filtered.length}`;
    const card=document.createElement('div');
    card.className='settings-card card shadow-sm overflow-hidden';
    card.innerHTML=`
      <div class="settings-card-head" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div class="settings-card-title">${cfg.title} <span class="text-secondary" style="font-size:11px;font-weight:400">(${countLabel})</span></div>
        <input type="search" id="dm-search-${cfg.id}" placeholder="🔍 Tìm..." autocomplete="off"
          style="flex:0 0 auto;width:140px;padding:4px 8px;border:1.5px solid var(--bs-border-color-translucent);border-radius:6px;font-family:inherit;font-size:12px;background:var(--bs-body-bg);color:var(--bs-body-color);outline:none"
          oninput="_dmFilterCard('${cfg.id}')">
      </div>
      <div class="settings-list" id="sl-${cfg.id}">
        ${filtered.map(({item,idx})=>
          cfg.id==='congNhan'  ? renderCNItem(item,idx) :
          cfg.id==='congTrinh' ? renderCTItem(item,idx) :
          cfg.id==='tbTen'     ? renderTbTenItem(item,idx) :
          renderItem(cfg.id,item,idx)
        ).join('')}
      </div>
      <div class="settings-add">
        <input type="text" id="sa-${cfg.id}" placeholder="Thêm mới..." onkeydown="if(event.key==='Enter')addItem('${cfg.id}')">
        <button class="btn btn-warning btn-sm" onclick="addItem('${cfg.id}')">+ Thêm</button>
      </div>`;
    grid.appendChild(card);
  });
  // Render panel sao lưu
  renderBackupList();
}

// ── Per-card search filter ────────────────────────────────────────
function _dmFilterCard(catId) {
  const q = (document.getElementById('dm-search-' + catId)?.value || '').toLowerCase().trim();
  const list = document.getElementById('sl-' + catId);
  if (!list) return;
  list.querySelectorAll('.settings-item').forEach(el => {
    const nameEl = el.querySelector('.s-name');
    const text = (nameEl ? nameEl.textContent : el.textContent).toLowerCase();
    el.style.display = !q || text.includes(q) ? '' : 'none';
  });
}

// ── Render item Công Trình với badge năm ──────────────────────────
function renderCTItem(item, idx) {
  const inUse = isItemInUse('congTrinh', item);
  const yr = cats.congTrinhYears && cats.congTrinhYears[item];
  const yrBadge = yr
    ? `<span class="text-primary" style="font-size:10px;padding:1px 5px;background:rgba(21,101,192,0.1);border-radius:3px;margin-right:2px;flex-shrink:0">${yr}</span>`
    : '';
  return `<div class="settings-item" id="si-congTrinh-${idx}" style="${inUse?'background:rgba(26,122,69,0.04)':''}">
    <span class="s-name" id="sn-congTrinh-${idx}" ondblclick="startEdit('congTrinh',${idx})">${x(item)}</span>
    ${yrBadge}
    ${inUse?`<span title="Đang được sử dụng" class="text-success" style="font-size:10px;padding:2px 5px;background:rgba(26,122,69,0.1);border-radius:3px;margin-right:2px;flex-shrink:0">✓ đang dùng</span>`:''}
    <input class="s-edit-input" id="se-congTrinh-${idx}" value="${x(item)}"
      onblur="finishEdit('congTrinh',${idx})"
      onkeydown="if(event.key==='Enter')finishEdit('congTrinh',${idx});if(event.key==='Escape')cancelEdit('congTrinh',${idx})">
    <button class="btn btn-outline-secondary btn-sm" onclick="startEdit('congTrinh',${idx})" title="Sửa tên">✏️</button>
    <button class="btn ${inUse?'btn-outline-secondary':'btn-danger'} btn-sm" onclick="delItem('congTrinh',${idx})"
      title="${inUse?'Đang được sử dụng — không thể xóa':'Xóa'}" ${inUse?'style="opacity:0.4;cursor:not-allowed"':''}>✕</button>
  </div>`;
}

function renderItem(catId,item,idx) {
  const inUse = isItemInUse(catId, item);
  return `<div class="settings-item" id="si-${catId}-${idx}" style="${inUse?'background:rgba(26,122,69,0.04)':''}">
    <span class="s-name" id="sn-${catId}-${idx}" ondblclick="startEdit('${catId}',${idx})">${x(item)}</span>
    ${inUse?`<span title="Đang được sử dụng" class="text-success" style="font-size:10px;padding:2px 5px;background:rgba(26,122,69,0.1);border-radius:3px;margin-right:2px">✓ đang dùng</span>`:''}
    <input class="s-edit-input" id="se-${catId}-${idx}" value="${x(item)}"
      onblur="finishEdit('${catId}',${idx})"
      onkeydown="if(event.key==='Enter')finishEdit('${catId}',${idx});if(event.key==='Escape')cancelEdit('${catId}',${idx})">
    <button class="btn btn-outline-secondary btn-sm" onclick="startEdit('${catId}',${idx})" title="Sửa tên">✏️</button>
    <button class="btn ${inUse?'btn-outline-secondary':'btn-danger'} btn-sm" onclick="delItem('${catId}',${idx})"
      title="${inUse?'Đang được sử dụng — không thể xóa':'Xóa'}" ${inUse?'style="opacity:0.4;cursor:not-allowed"':''}>✕</button>
  </div>`;
}

// ── Render item Công Nhân với cột T/P ────────────────────────────
function renderCNItem(name, idx) {
  const role = cnRoles[name] || '';
  // Chỉ tính record chưa bị xóa mềm
  const inUse = ccData.some(w => !w.deletedAt && w.workers && w.workers.some(wk => wk.name === name));
  return `<div class="settings-item" id="si-congNhan-${idx}" style="${inUse?'background:rgba(26,122,69,0.04)':''}">
    <span class="s-name" id="sn-congNhan-${idx}" ondblclick="startEdit('congNhan',${idx})">${x(name)}</span>
    ${inUse?`<span title="Đang được sử dụng" class="text-success" style="font-size:10px;padding:2px 5px;background:rgba(26,122,69,0.1);border-radius:3px;margin-right:2px">✓ đang dùng</span>`:''}
    <input class="s-edit-input" id="se-congNhan-${idx}" value="${x(name)}"
      onblur="finishEdit('congNhan',${idx})"
      onkeydown="if(event.key==='Enter')finishEdit('congNhan',${idx});if(event.key==='Escape')cancelEdit('congNhan',${idx})">
    <select onchange="updateCNRole(${idx},this.value)"
      style="margin:0 4px;padding:2px 6px;border:1px solid var(--bs-border-color-translucent);border-radius:4px;font-size:12px;font-weight:700;cursor:pointer;min-width:44px"
      title="Vai trò (C=Cái, T=Thợ, P=Phụ)">
      <option value="" ${!role?'selected':''}>—</option>
      <option value="C" ${role==='C'?'selected':''}>C</option>
      <option value="T" ${role==='T'?'selected':''}>T</option>
      <option value="P" ${role==='P'?'selected':''}>P</option>
    </select>
    <button class="btn btn-outline-secondary btn-sm" onclick="startEdit('congNhan',${idx})" title="Sửa tên">✏️</button>
    <button class="btn ${inUse?'btn-outline-secondary':'btn-danger'} btn-sm" onclick="delItem('congNhan',${idx})"
      title="${inUse?'Đang được sử dụng — không thể xóa':'Xóa'}" ${inUse?'style="opacity:0.4;cursor:not-allowed"':''}>✕</button>
  </div>`;
}

// ── Cập nhật vai trò CN từ Danh mục ──────────────────────────────
function updateCNRole(idx, role) {
  const name = cats.congNhan[idx];
  if (!name) return;
  cnRoles[name] = role;
  save('cat_cn_roles', cnRoles);
  syncCNRoles(name, role);
  toast(`✅ Đã cập nhật vai trò "${name}" → ${role||'—'}`, 'success');
}

// ── Render item Thiết Bị (tbTen) ──────────────────────────────────
function renderTbTenItem(item, idx) {
  const inUse = typeof tbData !== 'undefined' && tbData.some(t => t.ten === item);
  return `<div class="settings-item" id="si-tbTen-${idx}" style="${inUse?'background:rgba(26,122,69,0.04)':''}">
    <span class="s-name" id="sn-tbTen-${idx}" ondblclick="startEdit('tbTen',${idx})">${x(item)}</span>
    ${inUse?`<span title="Đang được sử dụng" class="text-success" style="font-size:10px;padding:2px 5px;background:rgba(26,122,69,0.1);border-radius:3px;margin-right:2px;flex-shrink:0">✓ đang dùng</span>`:''}
    <input class="s-edit-input" id="se-tbTen-${idx}" value="${x(item)}"
      onblur="finishEdit('tbTen',${idx})"
      onkeydown="if(event.key==='Enter')finishEdit('tbTen',${idx});if(event.key==='Escape')cancelEdit('tbTen',${idx})">
    <button class="btn btn-outline-secondary btn-sm" onclick="startEdit('tbTen',${idx})" title="Sửa tên">✏️</button>
    <button class="btn ${inUse?'btn-outline-secondary':'btn-danger'} btn-sm" onclick="delItem('tbTen',${idx})"
      title="${inUse?'Thiết bị đang được sử dụng — không thể xóa':'Xóa'}" ${inUse?'style="opacity:0.4;cursor:not-allowed"':''}>✕</button>
  </div>`;
}

// ── Đồng bộ vai trò vào ccData (năm hiện tại + năm trước) ────────
function syncCNRoles(name, role) {
  const curYear = activeYear || new Date().getFullYear();
  const prevYear = curYear - 1;
  let changed = false;
  ccData.forEach(week => {
    const yr = parseInt((week.fromDate || '').slice(0, 4));
    if (yr !== curYear && yr !== prevYear) return;
    (week.workers || []).forEach(wk => {
      if (wk.name === name) { wk.role = role; changed = true; }
    });
  });
  if (changed) { clearInvoiceCache(); save('cc_v2', ccData); }
}

function startEdit(catId,idx) {
  document.getElementById(`sn-${catId}-${idx}`).classList.add('off');
  const e=document.getElementById(`se-${catId}-${idx}`); e.classList.add('on'); e.focus(); e.select();
}
function cancelEdit(catId,idx) {
  document.getElementById(`se-${catId}-${idx}`).classList.remove('on');
  document.getElementById(`sn-${catId}-${idx}`).classList.remove('off');
}
function finishEdit(catId,idx) {
  // congTrinh không được đổi tên qua danh mục — dùng Tab Công Trình để đổi tên project
  if (catId === 'congTrinh') {
    cancelEdit(catId, idx);
    toast('💡 Đổi tên công trình tại Tab Công Trình → nhấn ✏️ trên project', 'info');
    return;
  }
  const inp=document.getElementById(`se-${catId}-${idx}`);
  let newVal=normalizeName(catId, inp.value);
  if(!newVal){cancelEdit(catId,idx);return;}
  inp.value = newVal; // cập nhật input để hiển thị tên đã chuẩn hóa
  const old=cats[catId][idx];
  if(newVal===old){cancelEdit(catId,idx);return;} // không thay đổi thực sự
  // Chống trùng: so sánh sau khi bỏ dấu + lowercase
  const normNew = normalizeKey(newVal);
  const isDup = cats[catId].some((existing, i) => i !== idx && normalizeKey(existing) === normNew);
  if(isDup){toast(`⚠️ "${newVal}" đã tồn tại trong danh mục!`,'error');cancelEdit(catId,idx);return;}
  cats[catId][idx]=newVal;
  // normalizeKey(old) dùng để so sánh — bắt được cả trường hợp cũ sai hoa/thường
  const normOld = normalizeKey(old);
  const cfg=CATS.find(c=>c.id===catId);
  if(cfg&&cfg.refField) {
    // invoices: fix refField (loai, ncc, nguoi...)
    invoices.forEach(inv=>{
      if(normalizeKey(inv[cfg.refField]||'')===normOld) inv[cfg.refField]=newVal;
    });
    // ungRecords.tp: nguoiTH / nhaCungCap / thauPhu → loai thauphu; congNhan → loai congnhan
    if(catId==='nguoiTH'||catId==='nhaCungCap'||catId==='thauPhu') {
      ungRecords.forEach(r=>{
        if((r.loai||'thauphu')==='thauphu' && normalizeKey(r.tp||'')===normOld) r.tp=newVal;
      });
    }
    if(catId==='congNhan') {
      ungRecords.forEach(r=>{
        if(r.loai==='congnhan' && normalizeKey(r.tp||'')===normOld) r.tp=newVal;
      });
    }
  }
  // tbTen → tbData.ten
  if(catId==='tbTen' && typeof tbData!=='undefined') {
    tbData.forEach(t=>{ if(normalizeKey(t.ten||'')===normOld) t.ten=newVal; });
    save('tb_v1',tbData);
    try{ tbRefreshNameDl(); tbPopulateSels(); tbRenderList(); renderKhoTong(); tbRenderThongKeVon(); }catch(e){}
  }
  // thauPhu → thauPhuContracts.thauphu
  if(catId==='thauPhu' && typeof thauPhuContracts!=='undefined') {
    thauPhuContracts.forEach(r=>{ if(normalizeKey(r.thauphu||'')===normOld) r.thauphu=newVal; });
    save('thauphu_v1',thauPhuContracts);
  }
  // nguoiTH → thuRecords.nguoi + hopDongData[].nguoi
  if(catId==='nguoiTH') {
    if(typeof thuRecords!=='undefined') {
      thuRecords.forEach(r=>{ if(normalizeKey(r.nguoi||'')===normOld) r.nguoi=newVal; });
      save('thu_v1',thuRecords);
    }
    if(typeof hopDongData!=='undefined') {
      Object.values(hopDongData).forEach(hd=>{ if(normalizeKey(hd.nguoi||'')===normOld) hd.nguoi=newVal; });
      save('hopdong_v1',hopDongData);
    }
  }
  // congNhan → ccData workers + cnRoles key
  if(catId==='congNhan') {
    if(typeof ccData!=='undefined') {
      ccData.forEach(week=>{
        (week.workers||[]).forEach(wk=>{ if(normalizeKey(wk.name||'')===normOld) wk.name=newVal; });
      });
      save('cc_v2',ccData);
    }
    if(typeof cnRoles!=='undefined') {
      // tìm key cũ bằng normalizeKey (đề phòng key cũ sai hoa/thường)
      const oldKey=Object.keys(cnRoles).find(k=>normalizeKey(k)===normOld);
      if(oldKey!==undefined) {
        cnRoles[newVal]=cnRoles[oldKey];
        delete cnRoles[oldKey];
        save('cat_cn_roles',cnRoles);
      }
    }
  }
  saveCats(catId); clearInvoiceCache(); save('inv_v3',invoices); save('ung_v1',ungRecords);
  renderSettings(); updateTop();
  try { dtPopulateSels(); } catch(e) {}
  toast('✅ Đã cập nhật "'+newVal+'"','success');
}
function addItem(catId) {
  // congTrinh không được thêm trực tiếp — phải tạo qua Tab Công Trình (projects_v1)
  if (catId === 'congTrinh') {
    const inp = document.getElementById(`sa-${catId}`);
    if (inp) inp.value = '';
    toast('💡 Thêm công trình tại Tab Công Trình (nút + Thêm CT mới)', 'info');
    return;
  }
  const inp=document.getElementById(`sa-${catId}`);
  let val=normalizeName(catId, inp.value);
  if(!val) return;
  // Chống trùng: so sánh sau khi bỏ dấu + lowercase (áp dụng đồng nhất cho tất cả catId)
  const normVal = normalizeKey(val);
  const isDup = cats[catId].some(existing => normalizeKey(existing) === normVal);
  if(isDup){toast(`⚠️ "${val}" đã tồn tại trong danh mục!`,'error');return;}
  cats[catId].push(val);
  // Gán năm cho công trình mới (để lọc theo năm)
  if (catId === 'congTrinh') {
    cats.congTrinhYears[val] = activeYear || new Date().getFullYear();
  }
  saveCats(catId); inp.value='';
  renderSettings(); rebuildEntrySelects(); rebuildUngSelects();
  if (catId === 'congTrinh') {
    try { populateCCCtSel(); } catch(e) {}
    try { tbPopulateSels(); } catch(e) {}
  }
  if (catId === 'tbTen') {
    try { tbRefreshNameDl(); tbPopulateSels(); } catch(e) {}
  }
  // Realtime sync vào các dropdown Doanh Thu
  if (catId === 'nguoiTH' || catId === 'thauPhu' || catId === 'nhaCungCap') {
    try { dtPopulateSels(); } catch(e) {}
  }
  toast(`✅ Đã thêm "${val}"`,'success');
}
function isItemInUse(catId, item) {
  const nk = normalizeKey; // alias ngắn
  const nItem = nk(item);
  // tbTen — kiểm tra trong tbData, so sánh normalized
  if (catId === 'tbTen') return typeof tbData !== 'undefined'
    && tbData.some(t => !t.deletedAt && nk(t.ten) === nItem);
  const cfg = CATS.find(c=>c.id===catId);
  if (!cfg || !cfg.refField) {
    if (catId === 'congNhan') return ccData.some(w => !w.deletedAt && w.workers
      && w.workers.some(wk => nk(wk.name) === nItem));
    return false;
  }
  // Kiểm tra trong invoices (so sánh normalized)
  if (getInvoicesCached().some(i => nk(i[cfg.refField]||'') === nItem)) return true;
  // Kiểm tra trong ungRecords
  if (catId === 'thauPhu') {
    if (ungRecords.some(r => !r.deletedAt && (r.loai||'thauphu') === 'thauphu'
        && nk(r.tp||'') === nItem)) return true;
  }
  if (catId === 'nhaCungCap') {
    if (ungRecords.some(r => !r.deletedAt && (r.loai||'thauphu') === 'thauphu'
        && nk(r.tp||'') === nItem)) return true;
  }
  if (catId === 'congNhan') {
    if (ungRecords.some(r => !r.deletedAt && r.loai === 'congnhan'
        && nk(r.tp||'') === nItem)) return true;
  }
  // Kiểm tra congTrinh trong ung + cc + thietbi
  if (catId === 'congTrinh') {
    if (ungRecords.some(r => !r.deletedAt && nk(r.congtrinh||'') === nItem)) return true;
    if (ccData.some(w => !w.deletedAt && nk(w.ct||'') === nItem)) return true;
    if (typeof tbData !== 'undefined' && tbData.some(r => !r.deletedAt && nk(r.ct||'') === nItem)) return true;
  }
  return false;
}

function delItem(catId,idx) {
  // congTrinh không được xóa qua danh mục — phải xóa/kết thúc qua Tab Công Trình
  if (catId === 'congTrinh') {
    toast('💡 Quản lý công trình tại Tab Công Trình — đổi trạng thái thành "Đã quyết toán" để ẩn', 'info');
    return;
  }
  const item=cats[catId][idx];
  if(isItemInUse(catId, item)) {
    const msg = catId === 'tbTen'
      ? '⚠️ Thiết bị đang được sử dụng trong công trình — không thể xóa.'
      : '⚠️ Mục này đã có dữ liệu, không thể xóa.';
    toast(msg, 'error');
    return;
  }
  if(!confirm(`Xóa "${item}" khỏi danh mục?`)) return;
  if (catId === 'thauPhu') {
    ungRecords = ungRecords.filter(r => !(r.loai === 'thauphu' && r.tp === item));
  }
  if (catId === 'nhaCungCap') {
    ungRecords = ungRecords.filter(r => !(r.loai === 'nhacungcap' && r.tp === item));
  }
  if (catId === 'congNhan') {
    ungRecords = ungRecords.filter(r => !(r.loai === 'congnhan' && r.tp === item));
  }
  cats[catId].splice(idx,1);
  // Xóa year entry nếu có
  if (catId === 'congTrinh' && cats.congTrinhYears) {
    delete cats.congTrinhYears[item];
  }
  saveCats(catId);
  save('ung_v1', ungRecords);
  renderSettings(); rebuildEntrySelects(); rebuildUngSelects();
  if (catId === 'congTrinh') {
    try { populateCCCtSel(); } catch(e) {}
    try { tbPopulateSels(); } catch(e) {}
  }
  toast(`Đã xóa "${item}"`);
}

// Dedup + sort mảng danh mục trước khi render dropdown
// Loại bỏ phần tử rỗng, dedup bằng normalizeKey, sắp xếp tiếng Việt
function _dedupCatArr(arr) {
  const seen = new Set();
  return (arr || [])
    .filter(v => v && v.trim())
    .filter(v => { const k = normalizeKey(v); return k && !seen.has(k) ? (seen.add(k), true) : false; })
    .sort((a, b) => a.localeCompare(b, 'vi'));
}

function rebuildEntrySelects() {
  document.querySelectorAll('#entry-tbody [data-f="ct"]').forEach(sel=>{
    if(sel.tagName==='SELECT'){
      const cur=sel.value;
      sel.innerHTML = _buildProjOpts(cur, '-- Chọn --');
    }
  });
  document.querySelectorAll('#entry-tbody [data-f="loai"]').forEach(sel=>{
    if(sel.tagName==='SELECT'){
      const cur=sel.value;
      sel.innerHTML=`<option value="">-- Chọn --</option>`+
        _dedupCatArr(cats.loaiChiPhi).map(v=>`<option value="${x(v)}" ${v===cur?'selected':''}>${x(v)}</option>`).join('');
    }
  });
  // nguoi combo: nguoiTH + congNhan + thauPhu — dedup bằng normalizeKey
  const _nguoiCombo = _dedupCatArr([...cats.nguoiTH, ...cats.congNhan, ...cats.thauPhu]);
  document.querySelectorAll('#entry-tbody [data-f="nguoi"]').forEach(inp=>{
    const dl=document.getElementById(inp.getAttribute('list'));
    if(dl) dl.innerHTML=_nguoiCombo.map(v=>`<option value="${x(v)}">`).join('');
  });
  document.querySelectorAll('#entry-tbody [data-f="ncc"]').forEach(inp=>{
    const dl=document.getElementById(inp.getAttribute('list'));
    if(dl) dl.innerHTML=_dedupCatArr(cats.nhaCungCap).map(v=>`<option value="${x(v)}">`).join('');
  });
}
