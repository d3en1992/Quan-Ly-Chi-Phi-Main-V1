// thungrac.js — Tab Thùng Rác thống nhất: xem, khôi phục, xóa vĩnh viễn dữ liệu đã xóa mềm
// Đọc trực tiếp từ deletedAt != null trên các storage chính (không dùng trash_v1 riêng)
// Bản có purgedAt = "bia mộ" đã xóa vĩnh viễn → không hiện ở đây (xem _trashPurgeIds)
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

  // Dọn bia mộ xóa vĩnh viễn đã quá hạn giữ (xem _trashGcTombstones)
  try { _trashGcTombstones(); } catch (e) { console.warn('[Trash] Dọn bia mộ lỗi:', e); }

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
// Sắp xếp CỐ ĐỊNH: ngày xóa mới nhất lên trên (hòa → ngày chứng từ mới hơn, rồi theo id).
// [Fix 29/09/2026] Trước đây giữ nguyên thứ tự trong mảng — mà thứ tự mảng phụ thuộc năm
// nào được tải về trước trên từng máy → 2 máy cùng dữ liệu nhưng thùng rác hiện lộn xộn khác nhau.
function _trashSort(arr) {
  return arr.sort((a, b) =>
    (Number(b.deletedAt) || 0) - (Number(a.deletedAt) || 0)
    || String(b.ngay || b.fromDate || '').localeCompare(String(a.ngay || a.fromDate || ''))
    || String(a.id || '').localeCompare(String(b.id || '')));
}
// Bản ghi nằm trong thùng rác = đã xóa mềm (deletedAt) và CHƯA xóa vĩnh viễn (purgedAt).
// Bản có purgedAt là "bia mộ" — ẩn khỏi thùng rác, chỉ giữ lại để báo cho các máy khác.
const _trashIn = r => r && r.deletedAt && !r.purgedAt;
function _trashGetRecords(type) {
  if (type === 'hoadon')   return _trashSort((invoices || []).filter(_trashIn));
  if (type === 'chamcong') return _trashSort((ccData || []).filter(_trashIn));
  if (type === 'tienung')  return _trashSort((ungRecords || []).filter(_trashIn));
  if (type === 'thietbi')  return _trashSort((tbData || []).filter(_trashIn));
  if (type === 'thutien')  return _trashSort((thuRecords || []).filter(_trashIn));
  if (type === 'hopdong') {
    const chinh = Object.entries(hopDongData || {})
      .filter(([, v]) => _trashIn(v))
      .map(([k, v]) => ({ ...v, _trashKey: k, _trashLoai: 'Chính' }));
    const tp = (thauPhuContracts || []).filter(_trashIn)
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

  // Nhãn cảnh báo dữ liệu cũ thiếu trường (xem _trashCheck)
  const chk = _trashCheck(type === 'hopdong' ? (r._trashLoai === 'Chính' ? 'hopdong-chinh' : 'hopdong-tp') : type, r);
  const probs = [...chk.errors, ...chk.fixNotes, ...chk.warns];
  if (probs.length) {
    const color = chk.errors.length ? 'bg-danger' : 'bg-warning text-dark';
    const tag = `<span class="badge ${color} ms-1" style="font-size:9px;cursor:help" title="${x(probs.join('\n'))}">⚠ ${chk.errors.length ? 'Lỗi dữ liệu' : 'Thiếu trường'}</span>`;
    cells = cells.replace(/<\/td>/, tag + '</td>');   // gắn vào ô đầu tiên của dòng
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

// ══════════════════════════════════════════════════════════════════════════════
// KHO DỮ LIỆU THEO LOẠI — dùng chung cho khôi phục / xóa vĩnh viễn / dọn bia mộ
// ══════════════════════════════════════════════════════════════════════════════
// key  : khóa lưu trữ (save/load)
// get  : lấy mảng global hiện tại
// set  : gán lại mảng global (và xóa cache hóa đơn nếu cần)
const _TRASH_STORES = {
  hoadon:       { key: 'inv_v3',     get: () => invoices,         set: v => { invoices = v; clearInvoiceCache(); } },
  chamcong:     { key: 'cc_v2',      get: () => ccData,           set: v => { ccData = v; clearInvoiceCache(); } },
  tienung:      { key: 'ung_v1',     get: () => ungRecords,       set: v => { ungRecords = v; } },
  thietbi:      { key: 'tb_v1',      get: () => tbData,           set: v => { tbData = v; } },
  thutien:      { key: 'thu_v1',     get: () => thuRecords,       set: v => { thuRecords = v; } },
  'hopdong-tp': { key: 'thauphu_v1', get: () => thauPhuContracts, set: v => { thauPhuContracts = v; } },
};

// ══════════════════════════════════════════════════════════════════════════════
// KIỂM TRA DỮ LIỆU TRƯỚC KHI KHÔI PHỤC (01/10/2026)
// ══════════════════════════════════════════════════════════════════════════════
// Dữ liệu đời cũ (đồng bộ từ Firebase về) có thể thiếu trường quan trọng. Khôi phục
// nguyên trạng sẽ làm báo cáo / tổng chi tính sai mà không ai biết.
// Trả về:
//   errors   : lỗi KHÔNG THỂ tự sửa → CHẶN khôi phục (khuyên xóa vĩnh viễn)
//   fixes    : các trường TỰ ĐIỀN được (vd toDate = fromDate + 6 ngày)
//   fixNotes : mô tả các trường sẽ tự điền (hiện cho người dùng)
//   warns    : thiếu thông tin phụ — vẫn khôi phục được nhưng nên kiểm tra lại
const _TRASH_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const _trashIsISO = d => typeof d === 'string' && _TRASH_ISO_RE.test(d);

function _trashCheck(type, r) {
  const errors = [], warns = [], fixNotes = [], fixes = {};
  if (!r) return { errors: ['Không tìm thấy bản ghi'], warns, fixNotes, fixes };

  // Thiếu công trình (cả id lẫn tên) → chỉ cảnh báo, vì khôi phục xong vẫn sửa tay được
  const noProject = (nameField) => !r.projectId && !r[nameField];

  if (type === 'chamcong') {
    // Ngày bắt đầu tuần: bản đời cũ có thể chỉ có 'from' → tự chuyển sang fromDate
    const from = r.fromDate || r.from;
    if (!_trashIsISO(from)) {
      errors.push('Thiếu ngày bắt đầu tuần (fromDate)');
    } else {
      if (!r.fromDate) { fixes.fromDate = from; fixNotes.push(`Ngày bắt đầu tuần → ${viShort(from)}`); }
      // Thiếu ngày kết thúc → tự tính = ngày bắt đầu (Chủ nhật) + 6 ngày (Thứ bảy)
      if (!_trashIsISO(r.toDate)) {
        fixes.toDate = ccSaturdayISO(from);
        fixNotes.push(`Thiếu ngày kết thúc tuần → tự điền ${viShort(fixes.toDate)}`);
      }
    }
    if (!Array.isArray(r.workers)) errors.push('Thiếu danh sách công nhân (workers)');
    else if (!r.workers.length)    warns.push('Tuần không có công nhân nào');
    if (noProject('ct')) errors.push('Thiếu công trình');
    // Đã có tuần ĐANG SỐNG cùng tuần + công trình → khôi phục sẽ đè mất tuần đó
    // (quy tắc 1 tuần + 1 công trình = 1 bản ghi)
    if (_trashIsISO(from)) {
      const proj = r.projectId || r.ct || '';
      const dup = (ccData || []).find(o => o && !o.deletedAt && String(o.id) !== String(r.id)
        && (o.fromDate || o.from) === from && (o.projectId || o.ct || '') === proj);
      if (dup) errors.push('Đã có tuần chấm công khác (đang dùng) cùng tuần + công trình — khôi phục sẽ ghi đè mất tuần đó');
    }
  } else if (type === 'hoadon' || type === 'tienung' || type === 'thietbi' || type === 'thutien') {
    // Ngày là bắt buộc: thiếu ngày thì bản ghi không thuộc năm nào → không lên được cloud
    if (!_trashIsISO(r.ngay)) errors.push('Thiếu hoặc sai ngày (ngay)');
    if (type === 'hoadon') {
      if (noProject('congtrinh')) warns.push('Thiếu công trình');
      if (!(Number(r.thanhtien || r.tien) > 0)) warns.push('Không có số tiền');
    } else if (type === 'tienung') {
      if (noProject('congtrinh')) warns.push('Thiếu công trình');
      if (!(Number(r.tien) > 0)) warns.push('Không có số tiền');
    } else if (type === 'thietbi') {
      if (noProject('ct')) warns.push('Thiếu công trình');
      if (!r.ten) warns.push('Thiếu tên thiết bị');
    } else if (type === 'thutien') {
      if (noProject('congtrinh')) warns.push('Thiếu công trình');
      if (!(Number(r.tien) > 0)) warns.push('Không có số tiền');
    }
  } else if (type === 'hopdong-tp') {
    if (noProject('congtrinh')) warns.push('Thiếu công trình');
    if (!(Number(r.giaTri) > 0)) warns.push('Không có giá trị hợp đồng');
  } else if (type === 'hopdong-chinh') {
    if (!(Number(r.giaTri) > 0)) warns.push('Không có giá trị hợp đồng');
  }
  return { errors, warns, fixNotes, fixes };
}

// ── Khôi phục ─────────────────────────────────────────────────────────────────
// (01/10/2026) Kiểm tra dữ liệu trước khi khôi phục:
//   • Có lỗi không tự sửa được → CHẶN, báo lý do, khuyên xóa vĩnh viễn
//   • Có trường tự điền được / thiếu thông tin phụ → hỏi xác nhận, liệt kê rõ
// Khôi phục đặt updatedAt = now → mới hơn thời điểm xóa → khi gộp cloud bản khôi phục
// thắng (xem resolveConflict trong sync.js).
function _trashRestore(compositeId) {
  const [type, id] = compositeId.split('||');
  const now = Date.now();

  // Tìm bản ghi
  let rec = null, idx = -1, store = null;
  if (type === 'hopdong-chinh') {
    rec = hopDongData[id] || null;
  } else {
    store = _TRASH_STORES[type];
    if (!store) return;
    idx = store.get().findIndex(r => String(r.id) === String(id));
    rec = idx >= 0 ? store.get()[idx] : null;
  }
  if (!rec || rec.purgedAt) { toast('Không tìm thấy bản ghi (có thể đã bị xóa vĩnh viễn ở máy khác)', 'error'); renderThungRac(); return; }

  // Kiểm tra dữ liệu
  const chk = _trashCheck(type, rec);
  if (chk.errors.length) {
    alert('⛔ KHÔNG THỂ KHÔI PHỤC bản ghi này vì dữ liệu cũ bị lỗi:\n\n• '
      + chk.errors.join('\n• ')
      + '\n\nKhôi phục sẽ làm sai báo cáo / tổng chi phí. Nên XÓA VĨNH VIỄN bản ghi này và nhập lại nếu cần.');
    return;
  }
  if (chk.fixNotes.length || chk.warns.length) {
    let msg = '⚠️ Bản ghi này là dữ liệu cũ, chưa đủ chuẩn:\n';
    if (chk.fixNotes.length) msg += '\nSẽ TỰ ĐỘNG BỔ SUNG:\n• ' + chk.fixNotes.join('\n• ') + '\n';
    if (chk.warns.length)    msg += '\nCÒN THIẾU (cần kiểm tra/sửa tay sau khi khôi phục):\n• ' + chk.warns.join('\n• ') + '\n';
    msg += '\nVẫn khôi phục?';
    if (!confirm(msg)) return;
  }

  // Áp dụng: bổ sung trường + bỏ cờ xóa
  const restored = { ...rec, ...chk.fixes, deletedAt: null, deletedBy: null, updatedAt: now };
  if (type === 'hopdong-chinh') {
    hopDongData[id] = restored;
    save('hopdong_v1', hopDongData);
  } else {
    restored.deviceId = DEVICE_ID;
    const arr = store.get().slice();
    arr[idx] = restored;
    store.set(arr);
    save(store.key, arr);
    if (type === 'hoadon') {
      // Đồng bộ với trash_v1 cũ nếu còn tồn tại
      save('trash_v1', load('trash_v1', []).filter(i => String(i.id) !== String(id)));
    }
  }

  if (typeof schedulePush === 'function') schedulePush();
  toast('✅ Đã khôi phục bản ghi!', 'success');
  renderThungRac();
}

// ══════════════════════════════════════════════════════════════════════════════
// XÓA VĨNH VIỄN BẰNG "BIA MỘ" (01/10/2026)
// ══════════════════════════════════════════════════════════════════════════════
// LỖI CŨ: xóa vĩnh viễn = bỏ HẲN bản ghi khỏi mảng + báo purgeIds cho outbox. Lệnh xóa
//   chỉ nằm ở máy vừa xóa → máy khác (hoặc tab cũ) vẫn giữ bản xóa mềm, lần đẩy cloud
//   kế tiếp gộp bản đó lên lại → mở app trên thiết bị mới thấy bản ghi "sống lại".
// CÁCH MỚI: giữ lại bản ghi nhưng gắn purgedAt (= "bia mộ"):
//   • Thùng rác ẩn bản có purgedAt; mọi màn hình khác đã ẩn sẵn vì vẫn có deletedAt.
//   • Bia mộ được đồng bộ lên cloud như dữ liệu thường. Khi gộp, bia mộ LUÔN THẮNG
//     (resolveConflict / _mergeHopDong / normalizeCC trong sync.js) → máy nào còn bản
//     cũ cũng bị thay bằng bia mộ, không máy nào làm bản ghi sống lại được.
//   • Sau _TRASH_TOMB_KEEP_DAYS ngày, bia mộ được dọn hẳn (_trashGcTombstones) để
//     không phình dữ liệu — lúc đó mọi máy đã đồng bộ xong từ lâu.
const _TRASH_TOMB_KEEP_DAYS = 90;

// Chuyển 1 bản ghi thành bia mộ
function _trashTomb(r, now) {
  return { ...r, deletedAt: r.deletedAt || now, purgedAt: now, updatedAt: now,
           deviceId: (typeof DEVICE_ID !== 'undefined') ? DEVICE_ID : r.deviceId };
}

// Xóa vĩnh viễn các id thuộc 1 loại (chỉ đụng bản ĐANG Ở THÙNG RÁC). Trả về số bản ghi đã xử lý.
function _trashPurgeIds(type, ids) {
  const idSet = new Set([...ids].map(String));
  if (!idSet.size) return 0;
  const now = Date.now();
  let n = 0;
  if (type === 'hopdong-chinh') {
    idSet.forEach(k => {
      if (_trashIn(hopDongData[k])) { hopDongData[k] = _trashTomb(hopDongData[k], now); n++; }
    });
    if (n) save('hopdong_v1', hopDongData);
    return n;
  }
  const store = _TRASH_STORES[type];
  if (!store) return 0;
  const arr = store.get().map(r => {
    if (!_trashIn(r) || !idSet.has(String(r.id))) return r;
    n++;
    return _trashTomb(r, now);
  });
  if (!n) return 0;
  store.set(arr);
  save(store.key, arr);
  if (type === 'hoadon') {
    save('trash_v1', load('trash_v1', []).filter(i => !idSet.has(String(i.id))));
  }
  return n;
}

// Dọn bia mộ quá hạn: bỏ hẳn khỏi mảng (kèm purge để bước gộp cloud không kéo về lại).
// Chạy mỗi lần mở tab Thùng Rác — nhẹ, chỉ quét các mảng đã có trong bộ nhớ.
function _trashGcTombstones() {
  const limit = Date.now() - _TRASH_TOMB_KEEP_DAYS * 86400000;
  const old = r => r && r.purgedAt && Number(r.purgedAt) < limit;
  Object.values(_TRASH_STORES).forEach(store => {
    const cur = store.get() || [];
    const ids = cur.filter(old).map(r => String(r.id));
    if (!ids.length) return;
    const arr = cur.filter(r => !old(r));
    store.set(arr);
    save(store.key, arr, { purge: ids });
  });
  const hdKeys = Object.keys(hopDongData || {}).filter(k => old(hopDongData[k]));
  if (hdKeys.length) {
    hdKeys.forEach(k => { delete hopDongData[k]; });
    save('hopdong_v1', hopDongData, { purge: hdKeys });
  }
}

// Yêu cầu đẩy cloud ngay + báo cho người dùng biết lệnh xóa đã lên cloud chưa
function _trashPushPurge(count) {
  const msg = `Đã xóa vĩnh viễn ${count} bản ghi`;
  if (typeof fbReady !== 'function' || !fbReady()) { toast(msg, 'success'); return; }
  if (!navigator.onLine) {
    toast(`${msg} trên máy này — đang mất mạng, sẽ đẩy lên cloud khi có mạng lại`, 'error');
    return;
  }
  toast(`${msg} — đang đồng bộ lên cloud...`, 'success');
  if (typeof schedulePush === 'function') schedulePush();
}

// ── Xóa vĩnh viễn 1 bản ghi ───────────────────────────────────────────────────
function _trashHardDelete(compositeId) {
  if (!confirm('⚠️ Xóa vĩnh viễn?\nDữ liệu sẽ KHÔNG THỂ khôi phục!')) return;
  const [type, id] = compositeId.split('||');
  const n = _trashPurgeIds(type, [id]);
  if (!n) { toast('Không tìm thấy bản ghi', 'error'); renderThungRac(); return; }
  _trashPushPurge(n);
  renderThungRac();
}

// ── Xóa tất cả trong tab hiện tại ─────────────────────────────────────────────
function _trashEmptyCurrentTab() {
  const type  = _trashCurrentType;
  const recs  = _trashGetRecords(type);
  if (!recs.length) { toast('Thùng rác tab này đang trống!', ''); return; }
  if (!confirm(`⚠️ Xóa vĩnh viễn ${recs.length} bản ghi trong tab này?\nKHÔNG THỂ KHÔI PHỤC!`)) return;

  let n = 0;
  if (type === 'hopdong') {
    n += _trashPurgeIds('hopdong-chinh', recs.filter(r => r._trashLoai === 'Chính').map(r => r._trashKey));
    n += _trashPurgeIds('hopdong-tp',    recs.filter(r => r._trashLoai === 'Thầu phụ').map(r => r.id));
  } else {
    n = _trashPurgeIds(type, recs.map(r => r.id));
  }
  _trashPushPurge(n);
  renderThungRac();
}

// ── Làm sạch toàn bộ thùng rác ────────────────────────────────────────────────
function _trashEmptyAll() {
  const total = _trashCountAll();
  if (!total) { toast('Thùng rác đang trống!', ''); return; }
  if (!confirm(`⚠️ Xóa vĩnh viễn TOÀN BỘ ${total} bản ghi trong thùng rác?\nKHÔNG THỂ KHÔI PHỤC!`)) return;

  let n = 0;
  ['hoadon', 'chamcong', 'tienung', 'thietbi', 'thutien', 'hopdong-tp'].forEach(type => {
    n += _trashPurgeIds(type, (_TRASH_STORES[type].get() || []).filter(_trashIn).map(r => r.id));
  });
  n += _trashPurgeIds('hopdong-chinh', Object.keys(hopDongData || {}).filter(k => _trashIn(hopDongData[k])));
  if (load('trash_v1', []).length) save('trash_v1', []);

  _trashPushPurge(n);
  renderThungRac();
}
