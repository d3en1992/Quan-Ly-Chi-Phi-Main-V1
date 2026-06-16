// auth.js — Authentication & Role Management
// Load order: sau sync.js, trước main.js
// Kiến trúc: classic script global — KHÔNG dùng import/export

const USER_KEY = 'users_v1';
const USER_SESSION_KEY = 'currentUser';
const USER_DEVICE_KEY = 'device_id';
let currentUser = null;
let _roleObserver = null;
let _roleTick = 0;
let _userHeartbeatTimer = null;

// ══════════════════════════════════════════════════════════════
//  WEB CRYPTO — SHA-256 hash
//  Dùng cho mật khẩu nội bộ. Format: "sha256:<hex>"
// ══════════════════════════════════════════════════════════════
async function hashPassword(plain) {
  if (!window.crypto?.subtle) throw new Error('Web Crypto API không khả dụng trên trình duyệt này');
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(String(plain)));
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return 'sha256:' + hex;
}

async function checkPassword(plain, hashStr) {
  if (!hashStr || !hashStr.startsWith('sha256:')) return false;
  const computed = await hashPassword(plain);
  return computed === hashStr;
}

// ══════════════════════════════════════════════════════════════
//  DEVICE IDENTITY
// ══════════════════════════════════════════════════════════════
function getDeviceId() {
  let id = localStorage.getItem(USER_DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(USER_DEVICE_KEY, id);
  }
  return id;
}

// ══════════════════════════════════════════════════════════════
//  USER NORMALIZATION
// ══════════════════════════════════════════════════════════════
function _safeSessions(sessions) {
  if (!Array.isArray(sessions)) return [];
  const byDevice = new Map();
  sessions.forEach(s => {
    if (!s || !s.deviceId) return;
    const next = {
      deviceId: String(s.deviceId),
      loginAt: Number(s.loginAt) || Date.now(),
      lastActive: Number(s.lastActive) || Number(s.loginAt) || Date.now()
    };
    const prev = byDevice.get(next.deviceId);
    if (!prev || next.lastActive >= prev.lastActive) byDevice.set(next.deviceId, next);
  });
  return [...byDevice.values()];
}

function normalizeUserRecord(user, fallbackIdx = 0) {
  const now = Date.now();
  const base = user && typeof user === 'object' ? user : {};
  return {
    id: base.id || `u_${fallbackIdx}_${crypto.randomUUID()}`,
    username: String(base.username || '').trim(),
    passwordHash: base.passwordHash || '',
    passwordUpdatedAt: Number(base.passwordUpdatedAt) || 0,
    role: base.role || 'ketoan',
    updatedAt: Number(base.updatedAt) || now,
    sessionVersion: Number(base.sessionVersion) || 1,
    sessions: _safeSessions(base.sessions)
  };
}

function normalizeUsersArray(users) {
  const list = Array.isArray(users) ? users : [];
  const byKey = new Map();
  list.forEach((u, idx) => {
    const next = normalizeUserRecord(u, idx);
    if (!next.username) return;
    const key = String(next.id || next.username);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, next);
      return;
    }
    const winner = (next.updatedAt || 0) >= (prev.updatedAt || 0) ? next : prev;
    const loser  = winner === next ? prev : next;
    // passwordHash: chọn từ record có passwordUpdatedAt mới hơn
    const wHash = winner.passwordUpdatedAt >= loser.passwordUpdatedAt ? winner.passwordHash : loser.passwordHash;
    byKey.set(key, {
      ...loser,
      ...winner,
      passwordHash: wHash || winner.passwordHash || loser.passwordHash,
      sessions: _safeSessions([...(prev.sessions || []), ...(next.sessions || [])]),
      sessionVersion: Math.max(prev.sessionVersion || 1, next.sessionVersion || 1)
    });
  });
  return [...byKey.values()];
}

// Merge local + cloud theo id — record updatedAt mới hơn thắng
// sessions được merge theo deviceId; sessionVersion lấy max; không làm mất role
function mergeUsers(localUsers, cloudUsers) {
  const local = normalizeUsersArray(localUsers);
  const cloud = normalizeUsersArray(cloudUsers);
  const byId = new Map();

  local.forEach(u => byId.set(u.id, u));
  cloud.forEach(cloudUser => {
    const localUser = byId.get(cloudUser.id);
    if (!localUser) {
      byId.set(cloudUser.id, cloudUser);
      return;
    }

    const localTs = Number(localUser.updatedAt) || 0;
    const cloudTs = Number(cloudUser.updatedAt) || 0;
    const newer = cloudTs > localTs ? cloudUser : localUser;
    const older  = newer === cloudUser ? localUser : cloudUser;

    // passwordHash: record nào có passwordUpdatedAt mới hơn thắng
    const localPwTs = Number(localUser.passwordUpdatedAt) || 0;
    const cloudPwTs = Number(cloudUser.passwordUpdatedAt) || 0;
    const winnerHash = cloudPwTs > localPwTs ? cloudUser.passwordHash : localUser.passwordHash;

    byId.set(cloudUser.id, {
      ...older,
      ...newer,
      passwordHash: winnerHash || newer.passwordHash,
      passwordUpdatedAt: Math.max(localPwTs, cloudPwTs),
      updatedAt: Math.max(localTs, cloudTs),
      sessionVersion: Math.max(localUser.sessionVersion || 1, cloudUser.sessionVersion || 1),
      sessions: _safeSessions([...(localUser.sessions || []), ...(cloudUser.sessions || [])])
    });
  });

  return [...byId.values()];
}

// ══════════════════════════════════════════════════════════════
//  STORAGE
// ══════════════════════════════════════════════════════════════
function loadUsers() {
  const raw = load(USER_KEY, []) || [];
  const users = normalizeUsersArray(raw);
  if (JSON.stringify(raw) !== JSON.stringify(users)) save(USER_KEY, users);
  return users;
}

// opts.skipSync = true → chỉ ghi local, không tăng pending counter
function saveUsers(arr, opts) {
  save(USER_KEY, normalizeUsersArray(arr || []), opts);
  if (!opts?.skipSync && typeof schedulePush === 'function') schedulePush();
}

// ══════════════════════════════════════════════════════════════
//  MIGRATION — plain password → passwordHash (idempotent)
//  Chạy async khi startup; không block UI.
// ══════════════════════════════════════════════════════════════
async function migrateUsersToHash() {
  if (!window.crypto?.subtle) {
    console.warn('[Auth] Web Crypto không khả dụng — bỏ qua migration hash');
    return;
  }
  const raw = load(USER_KEY, []) || [];
  const needMigration = raw.some(u => u && u.password && !u.passwordHash);
  if (!needMigration) return;

  const migrated = await Promise.all(raw.map(async (u, idx) => {
    if (!u) return u;
    if (u.passwordHash) {
      // Đã có hash → chỉ loại bỏ password plain text nếu còn sót
      if ('password' in u) {
        const next = { ...u };
        delete next.password;
        return next;
      }
      return u;
    }
    if (u.password) {
      // Có plain text → hash
      const hash = await hashPassword(u.password);
      const next = normalizeUserRecord({
        ...u,
        passwordHash: hash,
        passwordUpdatedAt: Number(u.updatedAt) || Date.now()
      }, idx);
      return next;
    }
    return normalizeUserRecord(u, idx);
  }));

  save(USER_KEY, migrated);
  console.log('[Auth] Migration plain→hash hoàn tất:', migrated.length, 'users');
}

// ══════════════════════════════════════════════════════════════
//  DEFAULT ACCOUNTS — nguồn duy nhất cho tài khoản + mật khẩu mặc định
//  (dùng cho tạo mới lần đầu VÀ cho chức năng reset mật khẩu)
// ══════════════════════════════════════════════════════════════
const DEFAULT_ACCOUNTS = [
  { role: 'admin',   username: 'ADMIN',   password: 'tinhden@' },
  { role: 'giamdoc', username: 'GIAMDOC', password: '12345' },
  { role: 'ketoan',  username: 'KETOAN',  password: '123' }
];

// ══════════════════════════════════════════════════════════════
//  DEFAULT USERS — chỉ tạo khi users_v1 thật sự trống
// ══════════════════════════════════════════════════════════════
async function ensureDefaultUsers() {
  const users = loadUsers();
  if (users && users.length > 0) return; // idempotent

  if (!window.crypto?.subtle) {
    console.error('[Auth] Không thể tạo default users — Web Crypto không khả dụng');
    return;
  }

  const now = Date.now();
  const built = await Promise.all(DEFAULT_ACCOUNTS.map(async (acc) => ({
    username: acc.username,
    passwordHash: await hashPassword(acc.password),
    passwordUpdatedAt: now,
    role: acc.role,
    updatedAt: now,
    sessionVersion: 1,
    sessions: []
  })));
  saveUsers(normalizeUsersArray(built));
  console.log('[Auth] Default users đã được tạo (passwordHash)');

  if (typeof manualSync === 'function' && typeof fbReady === 'function' && fbReady()) {
    setTimeout(() => { try { manualSync(); } catch {} }, 500);
  }
}

// ══════════════════════════════════════════════════════════════
//  RESET PASSWORD — đặt lại tài khoản + mật khẩu về mặc định
//  Dùng khi quên mật khẩu. Yêu cầu gõ đúng "RESETMATKHAU" để xác nhận.
//  Reset CẢ tên hiển thị lẫn mật khẩu, giữ nguyên id cũ (theo role),
//  rồi đẩy lên cloud để các máy khác cũng nhận bản reset.
// ══════════════════════════════════════════════════════════════
const RESET_CONFIRM_WORD = 'RESETMATKHAU';

async function doResetDefaultPasswords() {
  if (!window.crypto?.subtle) {
    showLoginError('Trình duyệt không hỗ trợ xác thực bảo mật (Web Crypto API thiếu)');
    return false;
  }

  const now = Date.now();
  const existing = loadUsers();
  const out = [];

  for (const acc of DEFAULT_ACCOUNTS) {
    const prev = existing.find(u => u.role === acc.role);
    const hash = await hashPassword(acc.password);
    out.push(normalizeUserRecord({
      id: prev?.id, // giữ id cũ nếu có để merge theo id với cloud
      username: acc.username,
      passwordHash: hash,
      passwordUpdatedAt: now,
      role: acc.role,
      updatedAt: now,
      sessionVersion: (prev?.sessionVersion || 1) + 1, // vô hiệu hóa mọi phiên cũ
      sessions: []
    }, out.length));
  }

  // Giữ lại các tài khoản khác (nếu có role lạ ngoài 3 role mặc định)
  existing.forEach(u => {
    if (!DEFAULT_ACCOUNTS.some(a => a.role === u.role)) out.push(u);
  });

  saveUsers(out);

  // Đẩy thẳng lên cloud với skipPull:true.
  // KHÔNG dùng manualSync()/push thường vì chúng pull (THAY THẾ) users từ cloud
  // trước khi ghi → sẽ kéo bản cũ về đè mất bản reset rồi đẩy ngược bản cũ lên.
  if (typeof pushChanges === 'function' && typeof fbReady === 'function' && fbReady()) {
    try { await pushChanges({ silent: true, skipPull: true }); } catch {}
  }

  return true;
}

// UI: hỏi xác nhận bằng cách gõ đúng từ khóa, rồi reset
async function promptResetPasswords() {
  const answer = prompt(
    'ĐẶT LẠI MẬT KHẨU MẶC ĐỊNH\n\n' +
    'Thao tác này sẽ đặt lại TÊN ĐĂNG NHẬP và MẬT KHẨU của tất cả tài khoản về mặc định, ' +
    'và đăng xuất mọi thiết bị.\n\n' +
    'Gõ chính xác "' + RESET_CONFIRM_WORD + '" để xác nhận:'
  );
  if (answer === null) return; // người dùng bấm Hủy

  if (String(answer).trim() !== RESET_CONFIRM_WORD) {
    showLoginError('Mã xác nhận không đúng. Mật khẩu chưa được đặt lại.');
    return;
  }

  const ok = await doResetDefaultPasswords();
  if (ok) {
    clearLoginError();
    if (typeof toast === 'function') {
      toast('✅ Đã đặt lại mật khẩu mặc định. Vui lòng đăng nhập lại.', 'success');
    } else {
      alert('Đã đặt lại mật khẩu mặc định. Vui lòng đăng nhập lại.');
    }
    syncAuthUI();
    toggleUserDropdown(true);
  }
}

// ══════════════════════════════════════════════════════════════
//  CURRENT USER — session trong localStorage (không lưu password)
// ══════════════════════════════════════════════════════════════
function getCurrentUser() {
  try {
    const session = JSON.parse(localStorage.getItem(USER_SESSION_KEY) || 'null');
    return session && typeof session === 'object' ? session : null;
  } catch {
    return null;
  }
}

function setCurrentUser(user) {
  currentUser = user ? {
    id: user.id,
    username: user.username,
    role: user.role,
    sessionVersion: user.sessionVersion || 1,
    deviceId: getDeviceId()
  } : null;
  if (currentUser) localStorage.setItem(USER_SESSION_KEY, JSON.stringify(currentUser));
  else localStorage.removeItem(USER_SESSION_KEY);
}

function isAdmin()   { return getCurrentUser()?.role === 'admin'; }
function isGiamdoc() { return getCurrentUser()?.role === 'giamdoc'; }
function isKetoan()  { return getCurrentUser()?.role === 'ketoan'; }

// ══════════════════════════════════════════════════════════════
//  LOGIN UI HELPERS
// ══════════════════════════════════════════════════════════════
function showLoginError(msg) {
  const el = document.getElementById('login-error');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('show', !!msg);
}

function clearLoginError() {
  showLoginError('');
}

// ══════════════════════════════════════════════════════════════
//  SESSION MANAGEMENT
// ══════════════════════════════════════════════════════════════
function _touchUserSession(user, keepLoginAt) {
  const deviceId = getDeviceId();
  const now = Date.now();
  const sessions = _safeSessions(user.sessions);
  const existing = sessions.find(s => s.deviceId === deviceId);
  const next = {
    deviceId,
    loginAt: keepLoginAt && existing ? existing.loginAt : now,
    lastActive: now
  };
  return [...sessions.filter(s => s.deviceId !== deviceId), next];
}

function forceLogout(reason) {
  setCurrentUser(null);
  clearInterval(_userHeartbeatTimer);
  _userHeartbeatTimer = null;
  syncAuthUI();
  applyRoleUI();
  toggleUserDropdown(true);
  if (reason) showLoginError(reason);
}

// Kiểm tra session localStorage với users_v1 — không so mật khẩu
function validateCurrentSession() {
  const session = getCurrentUser();
  if (!session) return null;
  const user = loadUsers().find(u => String(u.id) === String(session.id) || u.username === session.username);
  if (!user) {
    forceLogout('Tài khoản không còn tồn tại');
    return null;
  }
  if ((user.sessionVersion || 1) !== (session.sessionVersion || 1)) {
    forceLogout('Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.');
    return null;
  }
  return user; // trả về full user record từ storage (bao gồm passwordHash)
}

// ══════════════════════════════════════════════════════════════
//  AUTH UI
// ══════════════════════════════════════════════════════════════
function syncAuthUI() {
  const user = validateCurrentSession() || getCurrentUser();
  currentUser = user;

  const label   = document.getElementById('current-user-label');
  const userBtn = document.getElementById('user-btn');
  const guestBox = document.getElementById('user-guest');
  const authBox  = document.getElementById('user-auth');

  if (label) label.textContent = user ? user.username : 'Đăng nhập';
  if (userBtn) {
    userBtn.classList.toggle('is-authenticated', !!user);
    if (user) {
      userBtn.title = `Tài khoản: ${user.username} (${user.role})`;
      const avatar = document.getElementById('ud-avatar-circle');
      if (avatar) avatar.textContent = user.username.charAt(0).toUpperCase();
    } else {
      userBtn.title = 'Tài khoản';
    }
  }

  if (guestBox) guestBox.style.display = user ? 'none' : 'block';
  if (authBox)  authBox.style.display  = user ? 'block' : 'none';

  if (user) {
    const accountName = document.getElementById('account-current-username');
    const accountRole = document.getElementById('account-current-role');
    if (accountName) accountName.textContent = user.username;
    if (accountRole) accountRole.textContent = user.role;

    const newUsernameField = document.getElementById('account-new-username');
    if (newUsernameField) newUsernameField.value = user.username;
  }

  closeAccountSettings();
}

function toggleUserDropdown(forceOpen, e) {
  if (e && e.stopPropagation) e.stopPropagation();

  const el = document.getElementById('user-dropdown');
  if (!el) return;
  const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !el.classList.contains('show');

  document.getElementById('year-dropdown')?.classList.remove('open');

  el.classList.toggle('show', shouldOpen);
  el.classList.toggle('hidden', !shouldOpen);

  if (shouldOpen) {
    syncAuthUI();
    clearLoginError();
    if (!getCurrentUser()) {
      setTimeout(() => document.getElementById('login-username')?.focus(), 150);
    }
  }
}

function openAccountSettings() {
  const mainView     = document.getElementById('ud-main-view');
  const settingsView = document.getElementById('ud-settings-view');
  if (mainView) mainView.style.display = 'none';
  if (settingsView) {
    settingsView.style.display = 'block';
    hideUDError();
    setTimeout(() => document.getElementById('account-old-password')?.focus(), 50);
  }
}

function closeAccountSettings() {
  const mainView     = document.getElementById('ud-main-view');
  const settingsView = document.getElementById('ud-settings-view');
  if (mainView) mainView.style.display = 'block';
  if (settingsView) settingsView.style.display = 'none';
  hideUDError();
}

function showUDError(msg) {
  const err = document.getElementById('ud-settings-error');
  if (err) {
    err.textContent = msg;
    err.classList.add('show');
  }
}

function hideUDError() {
  const err = document.getElementById('ud-settings-error');
  if (err) err.classList.remove('show');
}

// Đóng dropdown khi click bên ngoài
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('user-dropdown');
  const userBtn  = document.getElementById('user-btn');
  if (dropdown && dropdown.classList.contains('show')) {
    if (!dropdown.contains(e.target) && !userBtn.contains(e.target)) {
      toggleUserDropdown(null, false);
    }
  }
});

// ══════════════════════════════════════════════════════════════
//  SESSION HEARTBEAT — cập nhật lastActive mỗi phút
// ══════════════════════════════════════════════════════════════
function _startSessionHeartbeat() {
  clearInterval(_userHeartbeatTimer);
  const tick = () => {
    const session = getCurrentUser();
    if (!session) return;
    const users = loadUsers();
    const idx = users.findIndex(u => String(u.id) === String(session.id));
    if (idx < 0) return;
    users[idx] = {
      ...users[idx],
      sessions: _touchUserSession(users[idx], true),
      updatedAt: Math.max(users[idx].updatedAt || 0, Date.now())
    };
    // skipSync: cập nhật lastActive chỉ là heartbeat — không phải thay đổi nghiệp vụ
    saveUsers(users, { skipSync: true });
    setCurrentUser(users[idx]);
  };
  _userHeartbeatTimer = setInterval(tick, 60 * 1000);
}

// Cập nhật lastActive khi tab được focus lại — local only (skipSync)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  const session = getCurrentUser();
  if (!session) return;
  const users = loadUsers();
  const idx = users.findIndex(u => String(u.id) === String(session.id));
  if (idx < 0) return;
  users[idx] = {
    ...users[idx],
    sessions: _touchUserSession(users[idx], true),
    updatedAt: Math.max(users[idx].updatedAt || 0, Date.now())
  };
  saveUsers(users, { skipSync: true });
  setCurrentUser(users[idx]);
});

// ══════════════════════════════════════════════════════════════
//  LOGIN / LOGOUT
// ══════════════════════════════════════════════════════════════
async function login(username, password) {
  if (!window.crypto?.subtle) {
    showLoginError('Trình duyệt không hỗ trợ xác thực bảo mật (Web Crypto API thiếu)');
    return false;
  }

  const users = loadUsers();
  const idx = users.findIndex(x => x.username === username);

  if (idx < 0) {
    showLoginError('Sai tên đăng nhập hoặc mật khẩu');
    return false;
  }

  const user = users[idx];
  const ok = await checkPassword(password, user.passwordHash);
  if (!ok) {
    showLoginError('Sai tên đăng nhập hoặc mật khẩu');
    return false;
  }

  const u = {
    ...user,
    sessions: _touchUserSession(user, false),
    updatedAt: Date.now()
  };
  users[idx] = normalizeUserRecord(u, idx);
  saveUsers(users);
  clearLoginError();
  setCurrentUser(u);
  _startSessionHeartbeat();

  if (typeof manualSync === 'function' && typeof fbReady === 'function' && fbReady()) {
    setTimeout(() => { try { manualSync(); } catch {} }, 0);
  }
  location.reload();
  return true;
}

async function doLogin() {
  const username = (document.getElementById('login-username')?.value || '').trim();
  const password = document.getElementById('login-password')?.value || '';
  return login(username, password);
}

function logout() {
  const session = getCurrentUser();
  if (session) {
    const users = loadUsers();
    const idx = users.findIndex(u => String(u.id) === String(session.id));
    if (idx >= 0) {
      users[idx] = {
        ...users[idx],
        sessions: _safeSessions(users[idx].sessions).filter(s => s.deviceId !== getDeviceId()),
        updatedAt: Date.now()
      };
      saveUsers(users);
    }
  }
  clearInterval(_userHeartbeatTimer);
  _userHeartbeatTimer = null;
  setCurrentUser(null);
  location.reload();
}

// ══════════════════════════════════════════════════════════════
//  ACCOUNT SETTINGS — đổi username / đổi mật khẩu
// ══════════════════════════════════════════════════════════════
async function updateUserProfile({ username, newPassword }) {
  const session = getCurrentUser();
  if (!session) return false;

  const users = loadUsers();
  const idx = users.findIndex(u => String(u.id) === String(session.id));
  if (idx < 0) return false;

  const user = users[idx];
  const now  = Date.now();
  const nextUser = {
    ...user,
    username: username || user.username,
    updatedAt: now
  };

  let passwordChanged = false;
  if (newPassword) {
    nextUser.passwordHash     = await hashPassword(newPassword);
    nextUser.passwordUpdatedAt = now;
    nextUser.sessionVersion   = (user.sessionVersion || 1) + 1;
    nextUser.sessions         = []; // vô hiệu hóa thiết bị khác
    passwordChanged = true;
  }

  users[idx] = normalizeUserRecord(nextUser, idx);
  saveUsers(users);

  if (typeof manualSync === 'function' && typeof fbReady === 'function' && fbReady()) {
    setTimeout(() => { try { manualSync(); } catch {} }, 0);
  }

  if (passwordChanged) {
    forceLogout('Mật khẩu đã thay đổi. Vui lòng đăng nhập lại.');
    return true;
  }

  setCurrentUser(users[idx]);
  syncAuthUI();
  return true;
}

async function saveAccountSettings() {
  const user = validateCurrentSession();
  if (!user) return;

  hideUDError();
  const btn = document.getElementById('ud-save-btn');

  const newUsername     = (document.getElementById('account-new-username')?.value || '').trim();
  const oldPassword     = document.getElementById('account-old-password')?.value || '';
  const newPassword     = document.getElementById('account-new-password')?.value || '';
  const confirmPassword = document.getElementById('account-confirm-password')?.value || '';

  if (!newUsername) return showUDError('Tên đăng nhập không được để trống');
  if (!oldPassword) return showUDError('Vui lòng nhập mật khẩu hiện tại');

  // Xác minh mật khẩu cũ qua hash
  const passwordOk = await checkPassword(oldPassword, user.passwordHash);
  if (!passwordOk) return showUDError('Mật khẩu cũ không chính xác');

  if (newPassword) {
    if (newPassword.length < 4)        return showUDError('Mật khẩu mới phải từ 4 ký tự');
    if (newPassword !== confirmPassword) return showUDError('Xác nhận mật khẩu không khớp');
  }

  const users    = loadUsers();
  const duplicate = users.find(u => u.username === newUsername && String(u.id) !== String(user.id));
  if (duplicate) return showUDError('Tên đăng nhập đã tồn tại');

  if (btn) { btn.disabled = true; btn.textContent = 'Đang lưu...'; }
  await new Promise(r => setTimeout(r, 600));

  const ok = await updateUserProfile({
    username: newUsername,
    newPassword: newPassword || null
  });

  if (btn) { btn.disabled = false; btn.textContent = 'Lưu thay đổi'; }

  if (ok && !newPassword) {
    if (typeof toast === 'function') toast('Cập nhật tài khoản thành công', 'success');
    syncAuthUI();
  }
}

// ══════════════════════════════════════════════════════════════
//  ACCESS CONTROL
// ══════════════════════════════════════════════════════════════
function canAccess() {
  return !!getCurrentUser();
}

function applyNavPermissions() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.style.display = canAccess() ? '' : 'none';
  });
}

function _setRoleDisabled(selector, disabled, skip) {
  document.querySelectorAll(selector).forEach(el => {
    if (skip && skip(el)) return;
    if (disabled) {
      el.disabled = true;
      if ('readOnly' in el) el.readOnly = true;
      el.dataset.roleLocked = '1';
    } else if (el.dataset.roleLocked === '1') {
      el.disabled = false;
      if ('readOnly' in el) el.readOnly = false;
      el.dataset.roleLocked = '0';
    }
  });
}

function applyRoleUI() {
  const loggedIn = !!getCurrentUser();
  document.body.classList.toggle('auth-guest', !loggedIn);
  applyNavPermissions();
  if (!loggedIn) return;

  const user = getCurrentUser();
  if (!user) return;

  document.querySelectorAll('.nav-btn').forEach(btn => {
    const page = btn.dataset.page;
    let visible = true;
    if (user.role === 'ketoan' && ['dashboard', 'doanhthu', 'congno'].includes(page)) {
      visible = false;
    }
    btn.style.display = visible ? '' : 'none';
  });

  // Ẩn khu vực Tools với giamdoc (chỉ tab Danh Mục) và ketoan (toàn hệ thống)
  const toolsSection = document.getElementById('dm-tools-section');
  if (toolsSection) {
    toolsSection.style.display = (user.role === 'giamdoc' || user.role === 'ketoan') ? 'none' : '';
  }
}

function queueApplyRoleUI() {
  if (_roleTick) cancelAnimationFrame(_roleTick);
  _roleTick = requestAnimationFrame(() => {
    _roleTick = 0;
    applyRoleUI();
  });
}

function startRoleObserver() {
  if (_roleObserver) return;
  const content = document.querySelector('.content');
  if (!content || !window.MutationObserver) return;
  _roleObserver = new MutationObserver(() => queueApplyRoleUI());
  _roleObserver.observe(content, { childList: true, subtree: true });
}

// ══════════════════════════════════════════════════════════════
//  CLOUD SETUP FALLBACK
// ══════════════════════════════════════════════════════════════
function showCloudSetup() {
  syncAuthUI();
  showLoginError('Vui lòng kết nối Cloud để sử dụng hệ thống');
  toggleUserDropdown(true);
  if (typeof openBinModal === 'function') openBinModal();
}

// ══════════════════════════════════════════════════════════════
//  AUTH INIT
// ══════════════════════════════════════════════════════════════
function initAuth() {
  const users   = loadUsers();
  const session = getCurrentUser();

  if (!users || users.length === 0) {
    currentUser = null;
    syncAuthUI();
    applyRoleUI();
    toggleUserDropdown(true);
    return false;
  }

  if (!session) {
    currentUser = null;
    syncAuthUI();
    applyRoleUI();
    toggleUserDropdown(true);
    return false;
  }

  const user = users.find(u => String(u.id) === String(session.id) || u.username === session.username);
  if (!user) {
    setCurrentUser(null);
    syncAuthUI();
    applyRoleUI();
    toggleUserDropdown(true);
    showLoginError('Tài khoản không còn tồn tại');
    return false;
  }

  if ((user.sessionVersion || 1) !== (session.sessionVersion || 1)) {
    forceLogout('Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.');
    return false;
  }

  setCurrentUser(user);
  syncAuthUI();
  applyRoleUI();
  _startSessionHeartbeat();
  toggleUserDropdown(false);
  return true;
}

// Gọi sau mỗi lần pull/sync để tái kiểm tra session
function afterSync() {
  const users = loadUsers();
  if (!users || users.length === 0) return;

  const session = getCurrentUser();
  if (!session) {
    showLoginError('Vui lòng đăng nhập để sử dụng hệ thống');
    toggleUserDropdown(true);
    return;
  }
  const user = users.find(u => String(u.id) === String(session.id) || u.username === session.username);
  if (!user || (user.sessionVersion || 1) !== (session.sessionVersion || 1)) {
    forceLogout('Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.');
    return;
  }
  setCurrentUser(user);
  _startSessionHeartbeat();
  syncAuthUI();
}

// Pull cloud trước khi auth — INTERNAL / ONLINE-FIRST.
// Cloud là nguồn chuẩn cho tài khoản: nếu đã cấu hình Firebase thì LUÔN pull users
// từ cloud trước khi đăng nhập, kể cả khi local đã có sẵn users. Nhờ vậy tài khoản
// mới tạo / mật khẩu vừa đổi ở máy khác sẽ lan tới máy này, tránh bị kẹt ở bản local cũ.
async function trySyncUsersBeforeAuth() {
  await migrateUsersToHash();

  const canCloud = (typeof fbReady === 'function' && fbReady()
                    && typeof pullChanges === 'function');

  // Đã cấu hình cloud → luôn đồng bộ tài khoản từ cloud (KHÔNG early-return theo local)
  if (canCloud) {
    await new Promise(resolve => pullChanges(null, () => resolve(), { silent: true }));
    if (typeof _reloadGlobals === 'function') _reloadGlobals();
    await migrateUsersToHash(); // cloud có thể gửi về user dạng cũ
  }

  const users = loadUsers();
  if (users && users.length > 0) {
    // Đã có tài khoản (vừa pull từ cloud hoặc đang dùng bản local khi chưa có cloud)
    if (canCloud && typeof afterSync === 'function') afterSync();
    return;
  }

  // Local + cloud đều trống → lần khởi tạo đầu tiên: tạo bộ tài khoản mặc định
  await ensureDefaultUsers();
}

// Bọc manualSync để afterSync() luôn được gọi sau mỗi lần sync
if (typeof manualSync === 'function' && !manualSync.__authWrapped) {
  const _orig = manualSync;
  manualSync = async function(...args) {
    const result = await _orig.apply(this, args);
    afterSync();
    return result;
  };
  manualSync.__authWrapped = true;
}
