// thungrac.js — Tab Thùng Rác thống nhất: xem, khôi phục, xóa vĩnh viễn dữ liệu đã xóa mềm
// Đọc trực tiếp từ deletedAt != null trên các storage chính (không dùng trash_v1 riêng)
// Load order: sau tất cả module chức năng, trước main.js

// ── Trạng thái ────────────────────────────────────────────────────────────────
let _trashCurrentType = 'hoadon';

const _TRASH_TABS = [
  { id: 'hoadon',   label: 'Hóa Đơn'   },
  { id: 'chamcong', label: 'Chấm Công'  },
  { id: 'tienung',  label: 'Tiền Ứng'   },
  { id: 'thietbi',  label: 'Thiết Bị'   },
  { id: 'thutien',  label: 'Thu Tiền'   },
  { id: 'hopdong',  label: 'Hợp Đồng'  },
];

// ── Entry point ───────────────────────────────────────────────────────────────
function renderThungRac() {
  const page = document.getElementById('page-thungrac');
  if (!page) return;

  const totalCount = _trashCountAll();

  page.innerHTML = `
    <div style="padding:12px 16px 0">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        <div>
          <span style="font-size:16px;font-weight:700"><span class="material-symbols-outlined msi-gap">delete</span>Thùng Rác</span>
          <span class="text-secondary" style="font-size:12px;margin-left:8px">${totalCount ? totalCount + ' bản ghi' : 'Trống'}</span>
        </div>
        <button class="btn btn-outline-danger btn-sm" onclick="_trashEmptyAll()" ${!totalCount ? 'disabled' : ''}>
          <span class="material-symbols-outlined msi-gap">cleaning_services</span>Làm sạch thùng rác
        </button>
      </div>

      <!-- Sub-tab navigation -->
      <div class="nav nav-pills gap-1 mb-3 flex-wrap" id="trash-subtab-nav">
        ${_TRASH_TABS.map(t => {
          const cnt = _trashCountType(t.id);
          return `<button class="nav-link${t.id === _trashCurrentType ? ' active' : ''}"
            onclick="_trashGoSubTab('${t.id}')" id="trash-tab-${t.id}">
            ${t.label}${cnt ? ` <span class="badge bg-danger ms-1" style="font-size:10px">${cnt}</span>` : ''}
          </button>`;
        }).join('')}
      </div>

      <!-- Bảng nội dung -->
      <div id="trash-content"></div>
    </div>`;

  _trashRenderTable(_trashCurrentType);
}

// ── Điều hướng sub-tab ────────────────────────────────────────────────────────
function _trashGoSubTab(type) {
  _trashCurrentType = type;
  document.querySelectorAll('#trash-subtab-nav .nav-link').forEach(btn => {
    btn.classList.toggle('active', btn.id === 'trash-tab-' + type);
  });
  _trashRenderTable(type);
}

// ── Đếm số bản ghi trong thùng rác ───────────────────────────────────────────
function _trashCountType(type) {
  return _trashGetRecords(type).length;
}

function _trashCountAll() {
  return _TRASH_TABS.reduce((s, t) => s + _trashCountType(t.id), 0);
}

// ── Lấy danh sách bản ghi đã xóa mềm theo type ───────────────────────────────
function _trashGetRecords(type) {
  if (type === 'hoadon')   return (invoices || []).filter(r => r.deletedAt);
  if (type === 'chamcong') return (ccData || []).filter(r => r.deletedAt);
  if (type === 'tienung')  return (ungRecords || []).filter(r => r.deletedAt);
  if (type === 'thietbi')  return (tbData || []).filter(r => r.deletedAt);
  if (type === 'thutien')  return (thuRecords || []).filter(r => r.deletedAt);
  if (type === 'hopdong') {
    const chinh = Object.entries(hopDongData || {})
      .filter(([, v]) => v.deletedAt)
      .map(([k, v]) => ({ ...v, _trashKey: k, _trashLoai: 'Chính' }));
    const tp = (thauPhuContracts || []).filter(r => r.deletedAt)
      .map(r => ({ ...r, _trashLoai: 'Thầu phụ' }));
    return [...chinh, ...tp].sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  }
  return [];
}

// ── Render bảng theo type ─────────────────────────────────────────────────────
function _trashRenderTable(type) {
  const wrap = document.getElementById('trash-content');
  if (!wrap) return;

  const recs = _trashGetRecords(type);

  if (!recs.length) {
    wrap.innerHTML = `<div class="text-secondary" style="text-align:center;padding:48px 16px;font-size:13px">
      <div style="font-size:32px;margin-bottom:8px"><span class="material-symbols-outlined">delete</span></div>
      Thùng rác trống cho mục này
    </div>`;
    return;
  }

  const headers = _trashGetHeaders(type);
  const rows    = recs.map(r => _trashBuildRow(type, r)).join('');

  wrap.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
      <button class="btn btn-outline-danger btn-sm" onclick="_trashEmptyCurrentTab()">
        <span class="material-symbols-outlined msi-gap">delete</span>Xóa tất cả trong tab này (${recs.length})
      </button>
    </div>
    <div style="overflow-x:auto">
      <table class="table table-sm table-hover align-middle mb-0" style="min-width:600px">
        <thead class="table-light">
          <tr>${headers.map(h => `<th style="white-space:nowrap;font-size:12px">${h}</th>`).join('')}<th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── Header columns theo type ──────────────────────────────────────────────────
function _trashGetHeaders(type) {
  if (type === 'hoadon')   return ['Ngày','Công Trình','Loại','Nội Dung','Thành Tiền','Ngày Xóa','Người Xóa'];
  if (type === 'chamcong') return ['Tuần','Công Trình','Số CN','Ngày Xóa','Người Xóa'];
  if (type === 'tienung')  return ['Ngày','Loại','Đối Tượng','Công Trình','Số Tiền','Ngày Xóa','Người Xóa'];
  if (type === 'thietbi')  return ['Ngày','Công Trình','Tên TB','SL','Tình Trạng','Ngày Xóa','Người Xóa'];
  if (type === 'thutien')  return ['Ngày','Công Trình','Số Tiền','Người Nộp','Nội Dung','Ngày Xóa','Người Xóa'];
  if (type === 'hopdong')  return ['Loại','Công Trình','Giá Trị','Nội Dung','Ngày Xóa','Người Xóa'];
  return [];
}

// ── Build row HTML theo type ──────────────────────────────────────────────────
function _trashBuildRow(type, r) {
  const deletedDate = r.deletedAt ? new Date(r.deletedAt).toLocaleDateString('vi-VN') : '—';
  const deletedBy   = x(r.deletedBy || '—');
  const actionBtns  = _trashActionBtns(type, r);

  let cells = '';
  if (type === 'hoadon') {
    cells = `
      <td class="font-monospace text-secondary" style="font-size:11px;white-space:nowrap">${fmtISODate(r.ngay)}</td>
      <td style="font-size:12px;font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x(resolveProjectName(r) || '—')}</td>
      <td><span class="tag tag-gold">${x(recCatName(r,'inv','loai') || '—')}</span></td>
      <td class="text-secondary" style="font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(r.nd)}">${x(r.nd || '—')}</td>
      <td class="text-end font-monospace fw-semibold text-success" style="white-space:nowrap">${numFmt(r.thanhtien || r.tien || 0)}</td>`;
  } else if (type === 'chamcong') {
    const ctName = _getProjectNameById(r.projectId) || r.ct || '—';
    const numCN  = (r.workers || []).length;
    cells = `
      <td class="font-monospace text-secondary" style="font-size:11px;white-space:nowrap">${viShort(r.fromDate)}<br><span class="text-body-secondary">${viShort(r.toDate)}</span></td>
      <td style="font-size:12px;font-weight:600;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x(ctName)}</td>
      <td class="text-center">${numCN} CN</td>`;
  } else if (type === 'tienung') {
    const loaiLabel = r.loai === 'thauphu' ? 'Thầu Phụ' : r.loai === 'nhacungcap' ? 'Nhà CC' : r.loai || '—';
    cells = `
      <td class="font-monospace text-secondary" style="font-size:11px;white-space:nowrap">${fmtISODate(r.ngay)}</td>
      <td><span class="badge bg-secondary" style="font-size:10px">${loaiLabel}</span></td>
      <td style="font-size:12px;font-weight:600;white-space:nowrap">${x(recCatName(r,'ung','tp') || '—')}</td>
      <td class="text-secondary" style="font-size:12px;white-space:nowrap">${x(resolveProjectName(r) || '—')}</td>
      <td class="text-end font-monospace fw-semibold text-primary" style="white-space:nowrap">${numFmt(r.tien || 0)}</td>`;
  } else if (type === 'thietbi') {
    cells = `
      <td class="font-monospace text-secondary" style="font-size:11px;white-space:nowrap">${fmtISODate(r.ngay)}</td>
      <td style="font-size:12px;white-space:nowrap">${x(r.ct || '—')}</td>
      <td style="font-size:12px;font-weight:600;white-space:nowrap">${x(r.ten || '—')}</td>
      <td class="text-center">${r.soluong || 0}</td>
      <td class="text-secondary" style="font-size:11px">${x(r.tinhtrang || '—')}</td>`;
  } else if (type === 'thutien') {
    cells = `
      <td class="font-monospace text-secondary" style="font-size:11px;white-space:nowrap">${fmtISODate(r.ngay)}</td>
      <td style="font-size:12px;font-weight:600;white-space:nowrap">${x(resolveProjectName(r) || '—')}</td>
      <td class="text-end font-monospace fw-semibold text-success" style="white-space:nowrap">${numFmt(r.tien || 0)}</td>
      <td class="text-secondary" style="font-size:12px">${x(recCatName(r,'thu','nguoi') || '—')}</td>
      <td class="text-secondary" style="font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x(r.nd || '—')}</td>`;
  } else if (type === 'hopdong') {
    const ctName = r._trashLoai === 'Chính'
      ? (_getProjectNameById(r._trashKey) || r._trashKey || '—')
      : x(resolveProjectName(r) || r.congtrinh || '—');
    const giatri = r._trashLoai === 'Chính'
      ? ((r.giaTri || 0) + (r.giaTriphu || 0))
      : (r.giaTri || 0);
    cells = `
      <td><span class="badge ${r._trashLoai === 'Chính' ? 'bg-primary' : 'bg-warning text-dark'}" style="font-size:10px">${r._trashLoai}</span></td>
      <td style="font-size:12px;font-weight:600;white-space:nowrap">${ctName}</td>
      <td class="text-end font-monospace fw-semibold text-warning" style="white-space:nowrap">${giatri ? numFmt(giatri) : '—'}</td>
      <td class="text-secondary" style="font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x(r.nd || '—')}</td>`;
  }

  return `<tr>
    ${cells}
    <td class="font-monospace text-danger" style="font-size:11px;white-space:nowrap">${deletedDate}</td>
    <td class="text-secondary" style="font-size:11px;white-space:nowrap">${deletedBy}</td>
    <td style="white-space:nowrap">${actionBtns}</td>
  </tr>`;
}

// ── Nút hành động ──────────────────────────────────────────────────────────────
function _trashActionBtns(type, r) {
  let restoreId, deleteId;
  if (type === 'hopdong') {
    restoreId = r._trashLoai === 'Chính' ? `hopdong-chinh||${r._trashKey}` : `hopdong-tp||${r.id}`;
    deleteId  = restoreId;
  } else {
    restoreId = `${type}||${r.id}`;
    deleteId  = `${type}||${r.id}`;
  }
  return `<div class="d-flex gap-1">
    <button class="btn btn-outline-secondary btn-sm" style="font-size:11px"
      onclick="_trashRestore('${restoreId}')">↩ Khôi phục</button>
    <button class="btn btn-danger btn-sm" style="font-size:11px"
      onclick="_trashHardDelete('${deleteId}')"><span class="material-symbols-outlined">close</span></button>
  </div>`;
}

// ── Khôi phục ─────────────────────────────────────────────────────────────────
function _trashRestore(compositeId) {
  const [type, id] = compositeId.split('||');
  const now = Date.now();

  if (type === 'hoadon') {
    const idx = invoices.findIndex(i => String(i.id) === String(id));
    if (idx < 0) return;
    invoices[idx] = { ...invoices[idx], deletedAt: null, deletedBy: null, updatedAt: now, deviceId: DEVICE_ID };
    clearInvoiceCache();
    save('inv_v3', invoices);
    // Đồng bộ với trash_v1 cũ nếu còn tồn tại
    let _tv1 = load('trash_v1', []);
    _tv1 = _tv1.filter(i => String(i.id) !== String(id));
    save('trash_v1', _tv1);
  } else if (type === 'chamcong') {
    const idx = ccData.findIndex(r => String(r.id) === String(id));
    if (idx < 0) return;
    ccData[idx] = { ...ccData[idx], deletedAt: null, deletedBy: null, updatedAt: now, deviceId: DEVICE_ID };
    clearInvoiceCache();
    save('cc_v2', ccData);
  } else if (type === 'tienung') {
    const idx = ungRecords.findIndex(r => String(r.id) === String(id));
    if (idx < 0) return;
    ungRecords[idx] = { ...ungRecords[idx], deletedAt: null, deletedBy: null, updatedAt: now, deviceId: DEVICE_ID };
    save('ung_v1', ungRecords);
  } else if (type === 'thietbi') {
    const idx = tbData.findIndex(r => String(r.id) === String(id));
    if (idx < 0) return;
    tbData[idx] = { ...tbData[idx], deletedAt: null, deletedBy: null, updatedAt: now, deviceId: DEVICE_ID };
    save('tb_v1', tbData);
  } else if (type === 'thutien') {
    const idx = thuRecords.findIndex(r => String(r.id) === String(id));
    if (idx < 0) return;
    thuRecords[idx] = { ...thuRecords[idx], deletedAt: null, deletedBy: null, updatedAt: now, deviceId: DEVICE_ID };
    save('thu_v1', thuRecords);
  } else if (type === 'hopdong-chinh') {
    if (!hopDongData[id]) return;
    hopDongData[id] = { ...hopDongData[id], deletedAt: null, deletedBy: null, updatedAt: now };
    save('hopdong_v1', hopDongData);
  } else if (type === 'hopdong-tp') {
    const idx = thauPhuContracts.findIndex(r => String(r.id) === String(id));
    if (idx < 0) return;
    thauPhuContracts[idx] = { ...thauPhuContracts[idx], deletedAt: null, deletedBy: null, updatedAt: now, deviceId: DEVICE_ID };
    save('thauphu_v1', thauPhuContracts);
  } else { return; }

  if (typeof schedulePush === 'function') schedulePush();
  toast('✅ Đã khôi phục bản ghi!', 'success');
  renderThungRac();
}

// ── ĐẨY LỆNH XÓA VĨNH VIỄN LÊN CLOUD (ghi đè thẳng, KHÔNG gộp lại) ────────────
// VÌ SAO CẦN RIÊNG (đây là chỗ sửa lỗi "xóa rồi vẫn hồi về"):
//   save() ở core.storage.js sau khi lưu sẽ TỰ ĐỘNG lên lịch một lần push "thường".
//   Lần push thường đó có bước B1 = ĐỌC cloud rồi GỘP (merge) ngược vào local.
//   Bản ghi vừa bị xóa HẲN khỏi mảng local nhưng TRÊN CLOUD vẫn còn (kèm deletedAt)
//   → bước gộp KÉO NGƯỢC nó về local → ghi lại lên cloud → bản ghi "sống lại"
//   trong thùng rác ngay khi F5 / đồng bộ.
//   Ở đây ta HUỶ lần push thường đó, rồi tự GHI ĐÈ từng document cloud bằng dữ liệu
//   local hiện tại (đã bỏ bản ghi xóa) — KHÔNG đọc-gộp cloud trước. Nhờ vậy lệnh xóa
//   thật sự thắng, kể cả khi slice của một năm trở thành rỗng sau khi xóa.
async function _trashPushPurge() {
  // Huỷ lần push "thường" (có bước gộp) mà save() vừa lên lịch
  if (typeof cancelScheduledPush === 'function') cancelScheduledPush();

  // Offline / chưa cấu hình Firebase: chỉ giữ thay đổi ở local, không đẩy được
  if (typeof fbReady !== 'function' || !fbReady()) {
    if (typeof _resetPending === 'function') _resetPending();
    return;
  }

  try {
    // Tất cả năm đang có dữ liệu local (gồm cả năm vừa trở nên trống sau khi xóa)
    const years = (typeof _getAllLocalYears === 'function')
      ? _getAllLocalYears()
      : [String((typeof activeYear !== 'undefined' && activeYear) || new Date().getFullYear())];

    // GHI ĐÈ từng hạng mục theo năm bằng dữ liệu local hiện tại (đã loại bản ghi xóa).
    // Không gộp cloud → lệnh xóa "thắng" tuyệt đối, kể cả khi records rỗng.
    for (const yr of years) {
      const yrInt = parseInt(yr);
      for (const { cat, key, dateField } of _YEAR_CATS) {
        await fsSet(fbDocYearCat(yrInt, cat), fbYearCatPayload(yrInt, key, dateField));
      }
    }
    // Ghi đè meta hợp đồng (HĐ chính + thầu phụ) — cho trường hợp xóa vĩnh viễn hợp đồng
    await fsSet(fbDocMetaHD(), fbMetaHDPayload());

    if (typeof _resetPending === 'function') _resetPending();
    if (typeof LAST_SYNC_KEY !== 'undefined') localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
    if (typeof _updateSyncBtnBadge === 'function') _updateSyncBtnBadge();
    console.log('[Trash] ✅ Đã ghi đè cloud sau khi xóa vĩnh viễn — bản ghi sẽ không hồi về');
  } catch (e) {
    console.warn('[Trash] Ghi đè cloud lỗi:', e);
    if (typeof toast === 'function') toast('⚠️ Đã xóa ở máy này nhưng đẩy cloud lỗi — thử bấm 🔄 Sync', 'error');
  }
}

// ── Xóa vĩnh viễn 1 bản ghi ───────────────────────────────────────────────────
function _trashHardDelete(compositeId) {
  if (!confirm('⚠️ Xóa vĩnh viễn?\nDữ liệu sẽ KHÔNG THỂ khôi phục!')) return;
  const [type, id] = compositeId.split('||');

  if (type === 'hoadon') {
    invoices = invoices.filter(i => String(i.id) !== String(id));
    clearInvoiceCache();
    save('inv_v3', invoices);
    let _tv1 = load('trash_v1', []);
    _tv1 = _tv1.filter(i => String(i.id) !== String(id));
    save('trash_v1', _tv1);
  } else if (type === 'chamcong') {
    ccData = ccData.filter(r => String(r.id) !== String(id));
    clearInvoiceCache();
    save('cc_v2', ccData);
  } else if (type === 'tienung') {
    ungRecords = ungRecords.filter(r => String(r.id) !== String(id));
    save('ung_v1', ungRecords);
  } else if (type === 'thietbi') {
    tbData = tbData.filter(r => String(r.id) !== String(id));
    save('tb_v1', tbData);
  } else if (type === 'thutien') {
    thuRecords = thuRecords.filter(r => String(r.id) !== String(id));
    save('thu_v1', thuRecords);
  } else if (type === 'hopdong-chinh') {
    delete hopDongData[id];
    save('hopdong_v1', hopDongData);
  } else if (type === 'hopdong-tp') {
    thauPhuContracts = thauPhuContracts.filter(r => String(r.id) !== String(id));
    save('thauphu_v1', thauPhuContracts);
  } else { return; }

  _trashPushPurge();
  toast('Đã xóa vĩnh viễn', 'success');
  renderThungRac();
}

// ── Xóa tất cả trong tab hiện tại ─────────────────────────────────────────────
function _trashEmptyCurrentTab() {
  const type  = _trashCurrentType;
  const recs  = _trashGetRecords(type);
  if (!recs.length) { toast('Thùng rác tab này đang trống!', ''); return; }
  if (!confirm(`⚠️ Xóa vĩnh viễn ${recs.length} bản ghi trong tab này?\nKHÔNG THỂ KHÔI PHỤC!`)) return;

  if (type === 'hoadon') {
    const ids = new Set(recs.map(r => String(r.id)));
    invoices = invoices.filter(r => !ids.has(String(r.id)));
    clearInvoiceCache();
    save('inv_v3', invoices);
    let _tv1 = load('trash_v1', []);
    _tv1 = _tv1.filter(i => !ids.has(String(i.id)));
    save('trash_v1', _tv1);
  } else if (type === 'chamcong') {
    const ids = new Set(recs.map(r => String(r.id)));
    ccData = ccData.filter(r => !ids.has(String(r.id)));
    clearInvoiceCache();
    save('cc_v2', ccData);
  } else if (type === 'tienung') {
    const ids = new Set(recs.map(r => String(r.id)));
    ungRecords = ungRecords.filter(r => !ids.has(String(r.id)));
    save('ung_v1', ungRecords);
  } else if (type === 'thietbi') {
    const ids = new Set(recs.map(r => String(r.id)));
    tbData = tbData.filter(r => !ids.has(String(r.id)));
    save('tb_v1', tbData);
  } else if (type === 'thutien') {
    const ids = new Set(recs.map(r => String(r.id)));
    thuRecords = thuRecords.filter(r => !ids.has(String(r.id)));
    save('thu_v1', thuRecords);
  } else if (type === 'hopdong') {
    // Xóa HĐ chính
    recs.filter(r => r._trashLoai === 'Chính').forEach(r => { delete hopDongData[r._trashKey]; });
    save('hopdong_v1', hopDongData);
    // Xóa HĐ thầu phụ
    const tpIds = new Set(recs.filter(r => r._trashLoai === 'Thầu phụ').map(r => String(r.id)));
    if (tpIds.size) {
      thauPhuContracts = thauPhuContracts.filter(r => !tpIds.has(String(r.id)));
      save('thauphu_v1', thauPhuContracts);
    }
  }

  _trashPushPurge();
  toast(`Đã xóa vĩnh viễn ${recs.length} bản ghi`, 'success');
  renderThungRac();
}

// ── Làm sạch toàn bộ thùng rác ────────────────────────────────────────────────
function _trashEmptyAll() {
  const total = _trashCountAll();
  if (!total) { toast('Thùng rác đang trống!', ''); return; }
  if (!confirm(`⚠️ Xóa vĩnh viễn TOÀN BỘ ${total} bản ghi trong thùng rác?\nKHÔNG THỂ KHÔI PHỤC!`)) return;

  // Hóa đơn
  const delInvIds = new Set((invoices || []).filter(r => r.deletedAt).map(r => String(r.id)));
  if (delInvIds.size) {
    invoices = invoices.filter(r => !delInvIds.has(String(r.id)));
    clearInvoiceCache();
    save('inv_v3', invoices);
    save('trash_v1', []);
  }
  // Chấm công
  const delCCIds = new Set((ccData || []).filter(r => r.deletedAt).map(r => String(r.id)));
  if (delCCIds.size) {
    ccData = ccData.filter(r => !delCCIds.has(String(r.id)));
    clearInvoiceCache();
    save('cc_v2', ccData);
  }
  // Tiền ứng
  const delUngIds = new Set((ungRecords || []).filter(r => r.deletedAt).map(r => String(r.id)));
  if (delUngIds.size) {
    ungRecords = ungRecords.filter(r => !delUngIds.has(String(r.id)));
    save('ung_v1', ungRecords);
  }
  // Thiết bị
  const delTBIds = new Set((tbData || []).filter(r => r.deletedAt).map(r => String(r.id)));
  if (delTBIds.size) {
    tbData = tbData.filter(r => !delTBIds.has(String(r.id)));
    save('tb_v1', tbData);
  }
  // Thu tiền
  const delThuIds = new Set((thuRecords || []).filter(r => r.deletedAt).map(r => String(r.id)));
  if (delThuIds.size) {
    thuRecords = thuRecords.filter(r => !delThuIds.has(String(r.id)));
    save('thu_v1', thuRecords);
  }
  // HĐ chính
  Object.keys(hopDongData || {}).forEach(k => {
    if (hopDongData[k].deletedAt) delete hopDongData[k];
  });
  save('hopdong_v1', hopDongData);
  // HĐ thầu phụ
  const delTPIds = new Set((thauPhuContracts || []).filter(r => r.deletedAt).map(r => String(r.id)));
  if (delTPIds.size) {
    thauPhuContracts = thauPhuContracts.filter(r => !delTPIds.has(String(r.id)));
    save('thauphu_v1', thauPhuContracts);
  }

  _trashPushPurge();
  toast('🧹 Đã làm sạch toàn bộ thùng rác!', 'success');
  renderThungRac();
}
