// hoadon.quick-entry.js — Nhập hóa đơn nhanh, duplicate check, row/money helpers
// Load order: sau js/legacy/tienich.js, trước hoadon.detail-entry.js

// ══════════════════════════════
//  ENTRY TABLE
// ══════════════════════════════
function initTable(n=10) {
  document.getElementById('entry-tbody').innerHTML='';
  for(let i=0;i<n;i++) addRow();
  calcSummary();
}

function addRows(n) { for(let i=0;i<n;i++) addRow(); }

// Rebuild tất cả dropdowns trong bảng nhập nhanh và form chi tiết
// Gọi khi danh mục hoặc công trình thay đổi (realtime, không reload)
function refreshEntryDropdowns() {
  // Helper nội bộ: dedup + sort (dùng _dedupCatArr nếu danhmuc.js đã load, fallback nếu chưa)
  const _dd = arr => typeof _dedupCatArr === 'function'
    ? _dedupCatArr(arr)
    : [...arr].filter(Boolean).sort((a,b)=>a.localeCompare(b,'vi'));
  document.querySelectorAll('#entry-tbody tr').forEach(tr => {
    const loaiSel  = tr.querySelector('[data-f="loai"]');
    const ctSel    = tr.querySelector('[data-f="ct"]');
    const nguoiSel = tr.querySelector('[data-f="nguoi"]');
    const nccSel   = tr.querySelector('[data-f="ncc"]');
    if(loaiSel) {
      const v = loaiSel.value;
      loaiSel.innerHTML = '<option value="">-- Chọn --</option>' +
        _dd(cats.loaiChiPhi).map(c=>`<option value="${x(c)}" ${c===v?'selected':''}>${x(c)}</option>`).join('');
    }
    if(ctSel) {
      const v = ctSel.value;
      ctSel.innerHTML = _buildProjOpts(v, '-- Chọn --');
    }
    if(nguoiSel) {
      const v = nguoiSel.value;
      nguoiSel.innerHTML = '<option value="">-- Chọn --</option>' +
        _dd(cats.nguoiTH).map(c=>`<option value="${x(c)}" ${c===v?'selected':''}>${x(c)}</option>`).join('');
    }
    if(nccSel) {
      const v = nccSel.value;
      nccSel.innerHTML = '<option value="">-- Chọn --</option>' +
        _dd(cats.nhaCungCap).map(c=>`<option value="${x(c)}" ${c===v?'selected':''}>${x(c)}</option>`).join('');
    }
  });
  if(typeof _initDetailFormSelects === 'function') _initDetailFormSelects();
}

function addRow(d={}) {
  const tbody = document.getElementById('entry-tbody');
  // PHẦN 6: copy loai/CT từ dòng trên nếu không có dữ liệu truyền vào
  if(!d.loai && !d.congtrinh) {
    const lastRow = tbody.querySelector('tr:last-child');
    if(lastRow) {
      const prevLoai = lastRow.querySelector('[data-f="loai"]')?.value || '';
      const prevCt   = lastRow.querySelector('[data-f="ct"]')?.value   || '';
      if(prevLoai || prevCt) d = { ...d, loai: prevLoai, congtrinh: prevCt };
    }
  }
  const num = tbody.children.length + 1;
  const ctDef = d.congtrinh || '';

  const tr = document.createElement('tr');

  // Dùng _dedupCatArr (từ danhmuc.js) để loại rỗng + trùng normalizeKey + sort tiếng Việt
  const _dd = arr => typeof _dedupCatArr === 'function'
    ? _dedupCatArr(arr)
    : [...arr].filter(Boolean).sort((a,b)=>a.localeCompare(b,'vi'));
  const loaiOpts  = `<option value="">-- Chọn --</option>` + _dd(cats.loaiChiPhi).map(v=>`<option value="${x(v)}" ${v===(d.loai||'')?'selected':''}>${x(v)}</option>`).join('');
  const ctOpts    = _buildProjOpts(ctDef, '-- Chọn --');
  const nguoiOpts = `<option value="">-- Chọn --</option>` + _dd(cats.nguoiTH).map(v=>`<option value="${x(v)}" ${v===(d.nguoi||'')?'selected':''}>${x(v)}</option>`).join('');
  const nccOpts   = `<option value="">-- Chọn --</option>` + _dd(cats.nhaCungCap).map(v=>`<option value="${x(v)}" ${v===(d.ncc||'')?'selected':''}>${x(v)}</option>`).join('');

  tr.innerHTML = `
    <td class="row-num">${num}</td>
    <td><select class="cell-input" data-f="loai">${loaiOpts}</select></td>
    <td><select class="cell-input" data-f="ct">${ctOpts}</select></td>
    <td><input class="cell-input right tien-input" data-f="tien" data-raw="${d.tien||''}" placeholder="0" value="${d.tien?numFmt(d.tien):''}" inputmode="decimal"></td>
    <td><input class="cell-input" data-f="nd" value="${x(d.nd||'')}" placeholder="Nội dung..."></td>
    <td><select class="cell-input" data-f="nguoi">${nguoiOpts}</select></td>
    <td><select class="cell-input" data-f="ncc">${nccOpts}</select></td>
    <td><button class="del-btn" onclick="delRow(this)">✕</button></td>
  `;

  // Thousand-separator logic for tien input
  const tienInput = tr.querySelector('[data-f="tien"]');
  tienInput.addEventListener('input', function() {
    const raw = this.value.replace(/[.,]/g,'');
    this.dataset.raw = raw;
    if(raw) this.value = numFmt(parseInt(raw,10)||0);
    calcSummary();
  });
  tienInput.addEventListener('focus', function() { this.value = this.dataset.raw || ''; });
  tienInput.addEventListener('blur', function() {
    const raw = parseInt(this.dataset.raw||'0',10)||0;
    this.value = raw ? numFmt(raw) : '';
  });

  tr.querySelectorAll('input,select').forEach(el => {
    if(el.dataset.f!=='tien') {
      el.addEventListener('input', calcSummary);
      el.addEventListener('change', calcSummary);
    }
  });

  // PHẦN 5: Enter key → nhảy xuống dòng dưới (chỉ áp dụng cho input)
  const entryInputs = [...tr.querySelectorAll('input')];
  entryInputs.forEach(inp => {
    inp.addEventListener('keydown', function(e) {
      if(e.key !== 'Enter') return;
      e.preventDefault();
      const allRows = [...document.querySelectorAll('#entry-tbody tr')];
      const curIdx  = allRows.indexOf(tr);
      const colIdx  = entryInputs.indexOf(this);
      let targetRow;
      if(curIdx < allRows.length - 1) {
        targetRow = allRows[curIdx + 1];
      } else {
        addRows(1);
        targetRow = [...document.querySelectorAll('#entry-tbody tr')][curIdx + 1];
      }
      if(targetRow) {
        const targets = [...targetRow.querySelectorAll('input')];
        (targets[colIdx] || targets[0])?.focus();
      }
    });
  });

  tbody.appendChild(tr);

  // Orphaned CT: nếu ctDef không khớp với bất kỳ option nào → thêm option tạm
  if (ctDef) {
    const ctSel = tr.querySelector('[data-f="ct"]');
    if (ctSel && !ctSel.value) {
      const orphan = document.createElement('option');
      orphan.value = ctDef;
      orphan.textContent = ctDef + ' (*)';
      if (d.projectId) orphan.dataset.pid = d.projectId;
      ctSel.appendChild(orphan);
      ctSel.value = ctDef;
    }
  }
}

function delRow(btn) { btn.closest('tr').remove(); renumber(); calcSummary(); }

function renumber() { renumberRows('#entry-tbody'); }

function calcSummary() {
  let cnt=0, total=0;
  document.querySelectorAll('#entry-tbody tr').forEach(tr => {
    const loai = tr.querySelector('[data-f="loai"]')?.value||'';
    const ct   = tr.querySelector('[data-f="ct"]')?.value||'';
    const tienRaw = parseInt(tr.querySelector('[data-f="tien"]')?.dataset.raw||'0',10)||0;
    if(loai||ct||tienRaw>0) { cnt++; total += tienRaw; }
  });
  document.getElementById('row-count').textContent = cnt;
  document.getElementById('entry-total').textContent = fmtM(total);
}

function clearTable() {
  if(!confirm('Xóa toàn bộ bảng nhập hiện tại?')) return;
  initTable(5);
}

function saveAllRows(skipDupCheck) {
  const date = document.getElementById('entry-date').value;
  if(!date) { toast('Vui lòng chọn ngày!','error'); return; }

  // Thu thập tất cả dòng hợp lệ
  const rows = [];
  let errRow = 0;
  document.querySelectorAll('#entry-tbody tr').forEach(tr => {
    const loai   = (tr.querySelector('[data-f="loai"]')?.value||'').trim();
    const ctSel  = tr.querySelector('[data-f="ct"]');
    const ct     = (ctSel?.value||'').trim();
    const ctPid  = _readPidFromSel(ctSel);
    const tien   = parseInt(tr.querySelector('[data-f="tien"]')?.dataset.raw||'0',10)||0;
    if(!loai&&!ct&&!tien) return;
    if(!ct||!loai) { errRow++; tr.style.background='#fdecea'; return; }
    // Kiểm tra công trình đã quyết toán
    if (ctPid && ctPid !== 'COMPANY') {
      const proj = getProjectById(ctPid);
      if (proj && proj.status === 'closed') { errRow++; tr.style.background='#fdecea'; return; }
    }
    tr.style.background='';
    rows.push({
      tr,
      editId: tr.dataset.editId || null,
      payload: {
        ngay: date,
        congtrinh: ct, loai,
        projectId: ctPid || null,
        nguoi: (tr.querySelector('[data-f="nguoi"]')?.value||'').trim(),
        ncc:   (tr.querySelector('[data-f="ncc"]')?.value||'').trim(),
        nd:    (tr.querySelector('[data-f="nd"]')?.value||'').trim(),
        tien
      }
    });
  });

  if(errRow>0) { toast(`${errRow} dòng có lỗi (thiếu thông tin hoặc công trình đã quyết toán)!`,'error'); return; }
  if(!rows.length) { toast('Không có dòng hợp lệ!','error'); return; }

  // Kiểm tra trùng — chỉ cho dòng MỚI (không phải edit)
  if(!skipDupCheck) {
    const newRows = rows.filter(r => !r.editId);
    const dupRows = [];
    newRows.forEach(r => {
      // Chỉ so sánh với HĐ nhập tay (không ccKey) trong cùng ngày+CT
      const candidates = invoices.filter(i =>
        !i.ccKey &&
        i.ngay === r.payload.ngay &&
        i.congtrinh === r.payload.congtrinh &&
        (i.thanhtien||i.tien||0) === r.payload.tien
      );
      if(!candidates.length) return;

      // Fuzzy match nội dung ≥ 70%
      const nd = r.payload.nd.toLowerCase().trim();
      candidates.forEach(inv => {
        const sim = _strSimilarity(nd, (inv.nd||'').toLowerCase().trim());
        if(sim >= 0.7 || (nd === '' && (inv.nd||'') === '')) {
          dupRows.push({
            newRow: r,
            existing: inv,
            similarity: sim,
            isExact: sim >= 0.99
          });
        }
      });
    });

    if(dupRows.length > 0) {
      _showDupModal(dupRows, rows);
      return; // Dừng lại — chờ user quyết định
    }
  }

  // ── Thực sự lưu ────────────────────────────────────────────
  _doSaveRows(rows);
}

// ══════════════════════════════
// DUPLICATE CHECK
// ══════════════════════════════

// ── Fuzzy string similarity (Dice coefficient) ───────────────
// Trả về 0.0 → 1.0. Không cần thư viện ngoài.

// ── Hiển thị modal cảnh báo trùng ────────────────────────────
function _showDupModal(dupRows, allRows) {
  const overlay = document.getElementById('dup-modal-overlay');
  const body    = document.getElementById('dup-modal-body');
  const sub     = document.getElementById('dup-modal-subtitle');

  // Lưu allRows để forceSave dùng lại
  overlay._allRows = allRows;

  sub.textContent = `Tìm thấy ${dupRows.length} hóa đơn có thể bị trùng`;

  const numFmtLocal = n => n ? n.toLocaleString('vi-VN') + 'đ' : '0đ';
  body.innerHTML = dupRows.map(d => {
    const pct     = Math.round(d.similarity * 100);
    const badge   = d.isExact
      ? '<span class="dup-badge dup-badge-exact">Trùng hoàn toàn</span>'
      : `<span class="dup-badge dup-badge-fuzzy">Giống ${pct}%</span>`;
    const existTime = d.existing._ts
      ? new Date(d.existing._ts).toLocaleString('vi-VN')
      : d.existing.ngay || '';
    return `<div class="dup-item">
      <div style="font-size:11px;font-weight:700;color:#f57f17;margin-bottom:6px">
        HĐ MỚI ${badge}
      </div>
      <div class="dup-item-row">
        <span class="dup-item-label">Ngày</span>
        <span class="dup-item-val">${d.newRow.payload.ngay}</span>
      </div>
      <div class="dup-item-row">
        <span class="dup-item-label">Công trình</span>
        <span class="dup-item-val">${d.newRow.payload.congtrinh}</span>
      </div>
      <div class="dup-item-row">
        <span class="dup-item-label">Số tiền</span>
        <span class="dup-item-val" style="color:var(--red);font-family:'IBM Plex Mono',monospace">
          ${numFmtLocal(d.newRow.payload.tien)}
        </span>
      </div>
      <div class="dup-item-row">
        <span class="dup-item-label">Nội dung</span>
        <span class="dup-item-val">${d.newRow.payload.nd||'(trống)'}</span>
      </div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #ffe082;font-size:11px;color:#888">
        ↑ Trùng với HĐ đã lưu lúc ${existTime}:
        <span style="color:#555;font-weight:600">${d.existing.nd||'(trống)'}</span>
      </div>
    </div>`;
  }).join('');

  overlay.classList.add('open');
}

function closeDupModal() {
  document.getElementById('dup-modal-overlay').classList.remove('open');
}

function forceSaveAll() {
  closeDupModal();
  const overlay = document.getElementById('dup-modal-overlay');
  const allRows = overlay._allRows;
  if(allRows) _doSaveRows(allRows);
}

// ── Đảm bảo cả projectId lẫn congtrinh luôn nhất quán trước khi lưu ──
function _ensureInvRef(fields) {
  let { projectId, congtrinh } = fields;
  if (!projectId && congtrinh && typeof findProjectIdByName === 'function') {
    projectId = findProjectIdByName(congtrinh) || null;
    if (!projectId) console.warn('[invoice] Cannot resolve projectId for CT:', congtrinh);
  }
  if (projectId && typeof getProjectById === 'function') {
    const p = getProjectById(projectId);
    if (p && p.name) congtrinh = p.name;
  }
  return { ...fields, projectId: projectId || null, congtrinh: congtrinh || fields.congtrinh || '' };
}

// ── Hàm lưu thực sự (dùng chung cho cả normal và force) ──────
function _doSaveRows(rows) {
  let saved = 0, updated = 0;
  rows.forEach(({tr, editId, payload}) => {
    const p = _ensureInvRef({
      ngay: payload.ngay, congtrinh: payload.congtrinh, loai: payload.loai,
      nguoi: payload.nguoi, ncc: payload.ncc, nd: payload.nd,
      tien: payload.tien, thanhtien: payload.tien,
      projectId: payload.projectId || null,
      source: 'quick'
    });
    if(editId) {
      const idx = invoices.findIndex(i => String(i.id) === String(editId));
      if(idx >= 0) { invoices[idx] = mkUpdate(invoices[idx], p); updated++; }
    } else {
      invoices.unshift(mkRecord(p));
      saved++;
    }
    tr.style.background = '#f0fff4';
  });

  clearInvoiceCache(); save('inv_v3', invoices);
  buildYearSelect(); updateTop();

  if(updated > 0 && saved === 0) toast(`✅ Đã cập nhật ${updated} hóa đơn!`, 'success');
  else if(saved > 0 && updated === 0) toast(`✅ Đã lưu ${saved} hóa đơn!`, 'success');
  else toast(`✅ Đã lưu ${saved} mới, cập nhật ${updated} hóa đơn!`, 'success');
  const _eBtn = document.getElementById('entry-save-btn');
  if (_eBtn) _eBtn.textContent = '💾 Lưu Hóa Đơn';

  // Tự động refresh sub-tab "HĐ/CP nhập trong ngày"
  renderTodayInvoices();
  // Tự động refresh sub-tab "Tất cả CP/HĐ" (luôn sync sau mỗi lần lưu)
  buildFilters(); filterAndRender();
}

// ══════════════════════════════════════════════════════════════
// HELPERS (shared — dùng cho cả quick-entry và detail-entry)
// ══════════════════════════════════════════════════════════════

// Tính thành tiền một dòng: sl × dongia áp chiết khấu ck
// ck = "" → không CK | "5%" → giảm 5% | "50000" → giảm tiền cố định
function calcRowMoney(sl, dongia, ck) {
  const base = sl * dongia;
  if (!ck) return Math.round(base);
  if (ck.endsWith('%')) return Math.round(base * (1 - (parseFloat(ck) || 0) / 100));
  return Math.round(base - parseMoney(ck));
}

// Đọc dữ liệu một dòng trong #detail-tbody
function getRowData(tr) {
  return {
    ten:    (tr.querySelector('[data-f="ten"]')?.value    || '').trim(),
    dv:     (tr.querySelector('[data-f="dv"]')?.value     || '').trim(),
    sl:     parseFloat(tr.querySelector('[data-f="sl"]')?.value)  || 1,
    dongia: parseInt(tr.querySelector('[data-f="dongia"]')?.dataset.raw || '0', 10) || 0,
    ck:     (tr.querySelector('[data-f="ck"]')?.value     || '').trim(),
  };
}
