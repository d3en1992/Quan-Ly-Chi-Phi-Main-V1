// danhmuc.tools.js — Wrapper tiện ích backup/restore + khôi phục từ sao lưu cloud
// Load order: sau danhmuc.ung.js

// ══════════════════════════════════════════════════════════════════
// WRAPPERS (gọi từ HTML onclick)
// ══════════════════════════════════════════════════════════════════
function toolBackupNow() {
  _snapshotNow('manual');
  renderBackupList();
  toast('✅ Đã tạo bản sao lưu thủ công', 'success');
}
function toolRestoreBackup() {
  renderBackupList();
  const wrap = document.getElementById('backup-list-wrap');
  if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


// ══════════════════════════════════════════════════════════════════
// KHÔI PHỤC TỪ SAO LƯU CLOUD (bản chụp tự động hằng ngày — sync.backup.js)
// ──────────────────────────────────────────────────────────────────
// Luồng: mở modal → liệt kê các ngày (ngày, dung lượng, thiết bị) → chọn 1 ngày
//   → xác nhận 2 lần → _snapshotNow() sao lưu LOCAL hiện tại trước (phòng nhầm)
//   → tải đủ các phần + giải nén → importJSONFull() (đường khôi phục SẴN CÓ):
//        xóa IDB → ghi dữ liệu bản sao lưu → chặn pull 2 giờ → đẩy TẤT CẢ năm lên
//        cloud (ghi đè, allYears) → tải lại app. Cloud + local nhất quán.
// Tài khoản (users_v1) KHÔNG bị khôi phục — importJSONFull giữ tài khoản đang dùng.
// Chỉ Quản trị viên (admin) được dùng.
// ══════════════════════════════════════════════════════════════════

// Hộp modal dùng chung (tạo 1 lần)
function _cloudRestoreOverlay() {
  let ov = document.getElementById('cloud-restore-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'cloud-restore-overlay';
    // Không đóng khi bấm nền — chỉ đóng bằng nút ✕ (tránh thao tác nhầm)
    ov.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99990;'
      + 'align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(ov);
  }
  return ov;
}
function closeCloudRestoreModal() {
  const ov = document.getElementById('cloud-restore-overlay');
  if (ov) ov.style.display = 'none';
}

// Khung modal: tiêu đề + nội dung truyền vào
function _cloudRestoreFrame(bodyHtml) {
  return `<div onclick="event.stopPropagation()" style="max-width:520px;width:100%;max-height:86vh;overflow:auto;
      background:var(--bs-body-bg);color:var(--bs-body-color);border-radius:12px;padding:20px 22px;
      box-shadow:0 12px 48px rgba(0,0,0,.25);font-family:inherit">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="font-size:16px;font-weight:800;margin:0">
        <span class="material-symbols-outlined msi-gap">cloud_download</span>Khôi phục từ sao lưu cloud
      </h3>
      <button onclick="closeCloudRestoreModal()" class="btn btn-sm btn-outline-secondary" title="Đóng">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    ${bodyHtml}
  </div>`;
}

// Mở modal + tải danh sách các ngày có bản sao lưu
async function openCloudRestoreModal() {
  if (typeof isAdmin === 'function' && !isAdmin()) {
    toast('⛔ Chỉ Quản trị viên được khôi phục từ sao lưu cloud', 'error'); return;
  }
  if (typeof fbReady !== 'function' || !fbReady()) {
    toast('Chưa kết nối Firebase', 'error'); return;
  }
  if (!navigator.onLine) {
    toast('🔴 Không có mạng — không tải được danh sách sao lưu', 'error'); return;
  }
  const ov = _cloudRestoreOverlay();
  ov.innerHTML = _cloudRestoreFrame(
    '<div class="text-secondary" style="font-size:13px;padding:12px 0">'
    + '<span class="material-symbols-outlined msi-gap">hourglass_top</span>Đang tải danh sách bản sao lưu...</div>');
  ov.style.display = 'flex';

  let list = [];
  try {
    list = await cloudBackupList();
  } catch (e) {
    console.warn('[CloudRestore] Đọc danh sách lỗi:', e);
    ov.innerHTML = _cloudRestoreFrame(
      '<div class="text-danger" style="font-size:13px">Không đọc được danh sách sao lưu ('
      + x(e.message || String(e)) + ').</div>');
    return;
  }

  if (!list.length) {
    ov.innerHTML = _cloudRestoreFrame(
      '<div class="text-secondary" style="font-size:13px">Chưa có bản sao lưu cloud nào. '
      + 'App tự sao lưu mỗi ngày 1 lần sau khi mở và đồng bộ xong.</div>');
    return;
  }

  const myDev = (typeof DEVICE_ID !== 'undefined') ? DEVICE_ID : '';
  const rows = list.map(b => {
    const [y, m, d] = b.date.split('-');
    const time = b.createdAt
      ? new Date(b.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
    const kb   = Math.max(1, Math.round((b.bytesRaw || 0) / 1024));
    const dev  = b.deviceId ? b.deviceId.slice(0, 8) + (b.deviceId === myDev ? ' (máy này)' : '') : '—';
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--bs-border-color);
                border-radius:8px;margin-bottom:8px;flex-wrap:wrap">
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:700">${d}/${m}/${y}${time ? ' <span class="text-secondary" style="font-weight:400;font-size:12px">lúc ' + time + '</span>' : ''}</div>
        <div class="text-secondary" style="font-size:11px;margin-top:2px">
          ~${kb} KB dữ liệu · ${b.parts} phần · ${b.enc === 'gzip' ? 'nén gzip' : 'không nén'} · thiết bị ${x(dev)}
        </div>
      </div>
      <button class="btn btn-sm btn-outline-danger" onclick="_cloudRestorePick('${b.date}')">↩ Khôi phục</button>
    </div>`;
  }).join('');

  ov.innerHTML = _cloudRestoreFrame(
    `<div style="background:#fff3cd;color:#664d03;border-radius:8px;padding:10px 12px;font-size:12px;line-height:1.6;margin-bottom:12px">
      Khôi phục sẽ <b>thay toàn bộ dữ liệu</b> (máy này + cloud + mọi thiết bị khác) bằng dữ liệu của ngày được chọn.
      Tài khoản đăng nhập được giữ nguyên. Trước khi khôi phục, app tự sao lưu dữ liệu hiện tại của máy này.
    </div>${rows}`);
}

// Chọn 1 ngày → xác nhận 2 lần → khôi phục
async function _cloudRestorePick(dateStr) {
  if (typeof isAdmin === 'function' && !isAdmin()) {
    toast('⛔ Chỉ Quản trị viên được khôi phục từ sao lưu cloud', 'error'); return;
  }
  const [y, m, d] = String(dateStr).split('-');
  const label = `${d}/${m}/${y}`;
  // Xác nhận lần 1
  if (!confirm(`⚠️ Khôi phục toàn bộ dữ liệu về bản sao lưu ngày ${label}?\n\n`
    + `Mọi thay đổi sau ngày này trên TẤT CẢ thiết bị sẽ bị thay thế.`)) return;
  // Xác nhận lần 2
  if (!confirm(`⚠️ XÁC NHẬN LẦN CUỐI\n\nGhi đè cloud + mọi thiết bị bằng dữ liệu ngày ${label}.\n`
    + `Thao tác này không thể hoàn tác (chỉ có thể khôi phục lại bằng bản sao lưu khác).\n\nTiếp tục?`)) return;

  const ov = _cloudRestoreOverlay();
  ov.innerHTML = _cloudRestoreFrame(
    '<div class="text-secondary" style="font-size:13px;padding:12px 0">'
    + '<span class="material-symbols-outlined msi-gap">hourglass_top</span>Đang sao lưu dữ liệu hiện tại và tải bản sao lưu '
    + label + '...</div>');

  try {
    // 1. Sao lưu LOCAL hiện tại trước (để còn đường lui nếu chọn nhầm ngày)
    if (typeof _snapshotNow === 'function') await _snapshotNow('before-cloud-restore');
    // 2. Tải đủ các phần + giải nén
    const snap = await cloudBackupDownload(dateStr);
    closeCloudRestoreModal();
    // 3. Đi qua đường khôi phục sẵn có (xóa IDB, ghi, đẩy tất cả năm lên cloud, tải lại app)
    await importJSONFull(snap.data);
  } catch (e) {
    console.error('[CloudRestore] Lỗi:', e);
    ov.innerHTML = _cloudRestoreFrame(
      '<div class="text-danger" style="font-size:13px">Khôi phục thất bại: ' + x(e.message || String(e))
      + '<br>Dữ liệu hiện tại KHÔNG bị thay đổi.</div>');
  }
}
