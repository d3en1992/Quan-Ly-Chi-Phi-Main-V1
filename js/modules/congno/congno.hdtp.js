// congno.hdtp.js — HỢP ĐỒNG THẦU PHỤ (tab CÔNG NỢ → sub-tab THẦU PHỤ)
// Load order: sau doanhthu.forms.js (chuyển nguyên từ doanhthu.forms.js — 02/10/2026)
//
// HĐ thầu phụ là CHI PHÍ phải trả → thuộc tab Công Nợ, tách khỏi tab Doanh Thu.
// Dữ liệu vẫn ở kho 'thauphu_v1' (biến thauPhuContracts khai báo trong doanhthu.core.js).
// State/bộ lọc dùng chung còn ở doanhthu.core.js: _hdtpItems, _hdtpPage, _hdtpTkPage,
// _dtTpCtFilter, _dtTpSearch, dtSetTpCtFilter, dtSetTpSearch, dtPopulateTpCtFilter,
// _hdtpOnCtChange, openDtModal/closeDtModal. Tên hàm giữ nguyên để HTML cũ gọi được.

// ══ FORM HỢP ĐỒNG THẦU PHỤ (modal global #dt-modal-hdtp-ov trong index.html) ══

// ── Cập nhật hiển thị Tổng HĐ Thầu Phụ khi nhập ─────────────
function hdtpUpdateTotal() {
  const tong = _readMoneyInput('hdtp-giatri');
  const el = document.getElementById('hdtp-tong-label');
  if (el) el.textContent = tong ? 'Tổng: ' + fmtM(tong) : '';
}

// ── Lưu / Cập nhật Hợp Đồng Thầu Phụ ────────────────────────
function saveHopDongThauPhu() {
  const ct = document.getElementById('hdtp-ct-input')?.value.trim();
  const tp = (document.getElementById('hdtp-thauphu')?.value || '').trim();
  if (!ct) { toast('Vui lòng chọn Công Trình!', 'error'); return; }
  if (!tp) { toast('Vui lòng chọn Thầu Phụ!', 'error'); return; }

  // Chỉ cho phép CT đã tồn tại
  const _hdtpProjExists = (typeof getAllProjects === 'function') &&
    getAllProjects().some(p => p.id !== 'COMPANY' && p.name === ct);
  if (!_hdtpProjExists) {
    toast('Chỉ được tạo công trình tại tab Công Trình', 'error');
    return;
  }

  const ngay     = document.getElementById('hdtp-ngay')?.value || today();
  const nd       = document.getElementById('hdtp-nd')?.value.trim() || '';
  const giaTri   = _hdtpItems.length > 0
    ? calcHopDongValue({ items: _hdtpItems })
    : _readMoneyInput('hdtp-giatri');
  const editId   = document.getElementById('hdtp-edit-id')?.value || '';

  _dtAddCT(ct);
  _dtAddTP(tp);
  const now = Date.now();
  const _hdtpProj = projects.find(p => p.name === ct) || null;
  const _hdtpPid  = _hdtpProj ? _hdtpProj.id : null;

  if (editId) {
    const idx = thauPhuContracts.findIndex(r => r.id === editId);
    if (idx >= 0) {
      thauPhuContracts[idx] = mkUpdate(thauPhuContracts[idx], { ngay, congtrinh: ct, projectId: _hdtpPid, thauphu: tp, giaTri, nd, items: [..._hdtpItems] });
    }
    toast('✅ Đã cập nhật HĐ thầu phụ', 'success');
  } else {
    thauPhuContracts.unshift(mkRecord({ ngay, congtrinh: ct, projectId: _hdtpPid, thauphu: tp, giaTri, nd, items: [..._hdtpItems] }));
    toast('✅ Đã lưu HĐ thầu phụ: ' + tp + ' — ' + ct, 'success');
  }

  save('thauphu_v1', thauPhuContracts);
  _hdtpResetForm();
  closeDtModal('hdtp');
  renderHdtpTable(0);
  renderHdtpTableTk(_hdtpTkPage);
}

function _hdtpResetForm() {
  _hdtpItems = [];
  if(typeof window.renderhdtpChiTiet === 'function') window.renderhdtpChiTiet();

  ['hdtp-giatri','hdtp-nd'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = '';
    if (el.dataset) el.dataset.raw = '';
  });
  const giaTriEl = document.getElementById('hdtp-giatri');
  if (giaTriEl) { giaTriEl.readOnly = false; giaTriEl.style.background = ''; giaTriEl.style.pointerEvents = ''; }
  const ctSel = document.getElementById('hdtp-ct-input');
  if (ctSel) ctSel.value = '';
  const tpSel = document.getElementById('hdtp-thauphu');
  if (tpSel) tpSel.value = '';
  const ngayEl = document.getElementById('hdtp-ngay');
  if (ngayEl) ngayEl.value = today();
  const editEl = document.getElementById('hdtp-edit-id');
  if (editEl) editEl.value = '';
  const btn = document.getElementById('hdtp-save-btn');
  if (btn) btn.innerHTML = '<span class="material-symbols-outlined msi-gap">save</span>Lưu';
  const tong = document.getElementById('hdtp-tong-label');
  if (tong) tong.textContent = '';
}

// ── Sửa Hợp Đồng Thầu Phụ (mở modal) ────────────────────────
function editHopDongThauPhu(id) {
  const r = thauPhuContracts.find(r => r.id === id);
  if (!r) return;

  // Rebuild options từ danh mục hiện hành trước khi set giá trị (tránh dropdown trắng khi đổi tên)
  if (typeof dtPopulateSels === 'function') dtPopulateSels();

  const ctName = resolveProjectName(r) || r.congtrinh || '';
  const ctSel = document.getElementById('hdtp-ct-input');
  // _setSelectFlexible: tự thêm option nếu thiếu → không bao giờ trắng
  if (ctSel) _setSelectFlexible(ctSel, ctName);
  const tpSel = document.getElementById('hdtp-thauphu');
  // Tên Thầu Phụ resolve theo ID (mới nhất), fallback text cũ
  if (tpSel) _setSelectFlexible(tpSel, recCatName(r,'thauphu','thauphu'));
  const ngayEl = document.getElementById('hdtp-ngay');
  if (ngayEl) ngayEl.value = r.ngay || '';
  const ndInput = document.getElementById('hdtp-nd');
  if (ndInput) ndInput.value = r.nd || '';

  function _setMoney(elemId, val) {
    const el = document.getElementById(elemId);
    if (!el) return;
    el.dataset.raw = val || 0;
    el.value = val ? parseInt(val).toLocaleString('vi-VN') : '';
  }

  _hdtpItems = Array.isArray(r.items) ? [...r.items] : [];
  if(typeof window.renderhdtpChiTiet === 'function') window.renderhdtpChiTiet();
  if(typeof window.hdtpCalcAuto === 'function') window.hdtpCalcAuto();
  if (_hdtpItems.length === 0) _setMoney('hdtp-giatri', r.giaTri || 0);

  const editEl = document.getElementById('hdtp-edit-id');
  if (editEl) editEl.value = id;
  const btn = document.getElementById('hdtp-save-btn');
  if (btn) btn.innerHTML = '<span class="material-symbols-outlined msi-gap">edit</span>Cập nhật';

  hdtpUpdateTotal();
  openDtModal('hdtp');
}

// ── Xóa mềm Hợp Đồng Thầu Phụ ────────────────────────────────
function delHopDongThauPhu(id) {
  if (!confirm('Xóa hợp đồng thầu phụ này?')) return;
  const idx = thauPhuContracts.findIndex(r => r.id === id);
  if (idx < 0) return;
  const now = Date.now();
  thauPhuContracts[idx] = { ...thauPhuContracts[idx], deletedAt: now, updatedAt: now, deviceId: DEVICE_ID, deletedBy: getCurrentUser()?.username || 'Không rõ' };
  save('thauphu_v1', thauPhuContracts);
  renderHdtpTable(_hdtpPage);
  renderHdtpTableTk(_hdtpTkPage);
  toast('Đã xóa hợp đồng thầu phụ', 'success');
}

// ── Hàm cũ (tên giữ nguyên để không vỡ lời gọi) → nay vẽ lại bảng CÔNG NỢ ──
// HĐ thầu phụ không còn hiện ở bảng Khai Báo tab Doanh Thu.
function renderHdtpTable(_page) { if (typeof cnRenderTable === 'function') cnRenderTable(); }

// ══ BẢNG ĐỐI SOÁT HĐ THẦU PHỤ (toàn bộ) ══════════════════════
// ── Render bảng Hợp Đồng Thầu Phụ (toàn bộ) ──────────────────
function renderHdtpTableTk(page) {
  page = page || 0;
  _hdtpTkPage = page;
  const tbody  = document.getElementById('hdtptk-tbody');
  const empty  = document.getElementById('hdtptk-empty');
  const pgWrap = document.getElementById('hdtptk-pagination');
  if (!tbody) return;

  // Sắp xếp: ngày mới nhất lên đầu (DESC), tie-break theo thời điểm tạo
  let filtered = thauPhuContracts
    .filter(r => !r.deletedAt && _dtInYear(r.ngay) && _dtMatchTpProjFilter(r))
    .sort((a, b) => (b.ngay || '').localeCompare(a.ngay || '')
      || ((b.createdAt || 0) - (a.createdAt || 0)));

  if (_dtTpSearch) {
    const q = _dtTpSearch;
    filtered = filtered.filter(r =>
      (_resolveCtName(r) || '').toLowerCase().includes(q) ||
      (recCatName(r,'thauphu','thauphu') || '').toLowerCase().includes(q) ||
      (r.nd || '').toLowerCase().includes(q)
    );
  }

  if (!filtered.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    if (pgWrap) pgWrap.innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  const total = filtered.length;
  const slice = filtered.slice(page * DT_PG, (page + 1) * DT_PG);

  tbody.innerHTML = slice.map(r => {
    const tong = (r.giaTri || 0) + (r.phatSinh || 0);
    return `<tr>
      <td style="text-align:center;padding:4px 6px"><input type="checkbox" class="hdtp-row-chk" data-id="${r.id}"></td>
      <td class="text-secondary" style="white-space:nowrap;font-size:12px">${fmtISODate(r.ngay)}</td>
      <td style="font-weight:600;white-space:nowrap">${x(_resolveCtName(r))}</td>
      <td style="white-space:nowrap">${x(recCatName(r,'thauphu','thauphu'))}</td>
      <td class="text-secondary hdtp-nd-cell"><span class="hdtp-nd-clamp">${x(r.nd || '—')}</span></td>
      <td class="text-end font-monospace fw-bold text-warning" style="white-space:nowrap">${tong ? fmtS(tong) : '—'}</td>
      <td class="action-col">
        <div class="d-flex gap-1 justify-content-center">
          <button class="btn btn-outline-primary btn-sm" title="S&#7917;a"
            onclick="editHopDongThauPhu('${r.id}')"><i class="bi bi-pencil-fill"></i></button>
          <button class="btn btn-outline-danger btn-sm" title="X&#243;a"
            onclick="delHopDongThauPhu('${r.id}')"><i class="bi bi-trash-fill"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  if (pgWrap) pgWrap.innerHTML = _dtPaginationHtml(total, page, 'renderHdtpTableTk');
}

