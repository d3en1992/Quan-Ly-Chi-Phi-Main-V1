// danhmuc.tools.js — Wrapper tiện ích backup/restore
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
