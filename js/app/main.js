// main.js — Global State / init() / goPage() / Year Filter
// Load order: 7 — LOAD CUOI CUNG

// Multi-year filter — empty Set = "Tất cả"
let activeYears = new Set([new Date().getFullYear()]);
// Backward compat shim — always kept in sync via _syncActiveYearCompat()
// Legacy code still reads `activeYear`; new filter logic uses activeYears + inActiveYear()
let activeYear = new Date().getFullYear();

function _syncActiveYearCompat() {
  if (activeYears.size === 0)      activeYear = 0;
  else if (activeYears.size === 1) activeYear = [...activeYears][0];
  else                             activeYear = 0; // multi → "all" for legacy
}

// Dùng cho backward compat (setActiveYear(0) = Tất cả, setActiveYear(2025) = 1 năm)
function setActiveYear(year) {
  if (year === 0) activeYears = new Set();
  else            activeYears = new Set([year]);
  _syncActiveYearCompat();
}

// ══════════════════════════════════════════════════════════════
//  AUTH + ROLE
// ══════════════════════════════════════════════════════════════
const USER_KEY = 'users_v1';
const USER_SESSION_KEY = 'currentUser';
const USER_DEVICE_KEY = 'device_id';
let currentUser = null;
let _roleObserver = null;
let _roleTick = 0;
let _userHeartbeatTimer = null;

// [ADDED]
function getDeviceId() {
  let id = localStorage.getItem(USER_DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(USER_DEVICE_KEY, id);
  }
  return id;
}

// [ADDED]
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

// [ADDED]
function normalizeUserRecord(user, fallbackIdx = 0) {
  const now = Date.now();
  const base = user && typeof user === 'object' ? user : {};
  return {
    id: base.id || `u_${fallbackIdx}_${crypto.randomUUID()}`,
    username: String(base.username || '').trim(),
    password: String(base.password || ''),
    role: base.role || 'ketoan',
    updatedAt: Number(base.updatedAt) || now,
    sessionVersion: Number(base.sessionVersion) || 1,
    sessions: _safeSessions(base.sessions)
  };
}

// [ADDED]
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
    winner.sessions = _safeSessions([...(prev.sessions || []), ...(next.sessions || [])]);
    winner.sessionVersion = Math.max(prev.sessionVersion || 1, next.sessionVersion || 1);
    byKey.set(key, winner);
  });
  return [...byKey.values()];
}

// [ADDED]
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
    const older = newer === cloudUser ? localUser : cloudUser;

    byId.set(cloudUser.id, {
      ...older,
      ...newer,
      updatedAt: Math.max(localTs, cloudTs),
      sessionVersion: Math.max(localUser.sessionVersion || 1, cloudUser.sessionVersion || 1),
      sessions: _safeSessions([...(localUser.sessions || []), ...(cloudUser.sessions || [])])
    });
  });

  return [...byId.values()];
}

function loadUsers() {
  const raw = load(USER_KEY, []) || [];
  const users = normalizeUsersArray(raw);
  if (JSON.stringify(raw) !== JSON.stringify(users)) save(USER_KEY, users);
  return users;
}

function saveUsers(arr) {
  save(USER_KEY, normalizeUsersArray(arr || []));
  if (typeof schedulePush === 'function') schedulePush();
}

function ensureDefaultUsers() {
  let users = loadUsers();

  if (!users || users.length === 0) {
    const now = Date.now();
    users = normalizeUsersArray([
      { username: 'admin', password: '123', role: 'admin', updatedAt: now, sessionVersion: 1, sessions: [] },
      { username: 'giamdoc', password: '123', role: 'giamdoc', updatedAt: now, sessionVersion: 1, sessions: [] },
      { username: 'ketoan', password: '123', role: 'ketoan', updatedAt: now, sessionVersion: 1, sessions: [] }
    ]);

    saveUsers(users);
    console.log('✅ Default users created');
  }
}

function showCloudSetup() {
  syncAuthUI();
  showLoginError('Vui lòng kết nối Cloud để sử dụng hệ thống');
  toggleUserDropdown(true);
  if (typeof openBinModal === 'function') openBinModal();
}

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
    password: user.password,
    role: user.role,
    sessionVersion: user.sessionVersion || 1,
    deviceId: getDeviceId()
  } : null;
  if (currentUser) localStorage.setItem(USER_SESSION_KEY, JSON.stringify(currentUser));
  else localStorage.removeItem(USER_SESSION_KEY);
}

function isAdmin() { return getCurrentUser()?.role === 'admin'; }
function isKetoan() { return getCurrentUser()?.role === 'ketoan'; }
function isGiamdoc() { return getCurrentUser()?.role === 'giamdoc'; }

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('show', !!msg);
}

function clearLoginError() {
  showLoginError('');
}

// [ADDED]
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

// [ADDED]
function forceLogout(reason) {
  setCurrentUser(null);
  clearInterval(_userHeartbeatTimer);
  _userHeartbeatTimer = null;
  syncAuthUI();
  applyRoleUI();
  toggleUserDropdown(true);
  if (reason) showLoginError(reason);
}

// [ADDED]
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
  return user;
}

function syncAuthUI() {
  const user = validateCurrentSession() || getCurrentUser();
  currentUser = user;

  const label = document.getElementById('current-user-label');
  const userBtn = document.getElementById('user-btn');
  const guestBox = document.getElementById('user-guest');
  const authBox = document.getElementById('user-auth');

  if (label) label.textContent = user ? user.username : 'Đăng nhập';
  if (userBtn) {
    userBtn.classList.toggle('is-authenticated', !!user);
    if (user) {
      userBtn.title = `Tài khoản: ${user.username} (${user.role})`;
      // Update avatar circle
      const avatar = document.getElementById('ud-avatar-circle');
      if (avatar) avatar.textContent = user.username.charAt(0).toUpperCase();
    } else {
      userBtn.title = 'Tài khoản';
    }
  }

  if (guestBox) guestBox.style.display = user ? 'none' : 'block';
  if (authBox) authBox.style.display = user ? 'block' : 'none';

  if (user) {
    const accountName = document.getElementById('account-current-username');
    const accountRole = document.getElementById('account-current-role');
    if (accountName) accountName.textContent = user.username;
    if (accountRole) accountRole.textContent = user.role;
    
    // Auto-populate settings fields
    const newUsernameField = document.getElementById('account-new-username');
    if (newUsernameField) newUsernameField.value = user.username;
  }
  
  // Reset settings view when syncing
  closeAccountSettings();
}

function toggleUserDropdown(forceOpen, e) {
  if (e && e.stopPropagation) e.stopPropagation();
  
  const el = document.getElementById('user-dropdown');
  if (!el) return;
  const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !el.classList.contains('show');
  
  // Close others
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
  const mainView = document.getElementById('ud-main-view');
  const settingsView = document.getElementById('ud-settings-view');
  if (mainView) mainView.style.display = 'none';
  if (settingsView) {
    settingsView.style.display = 'block';
    hideUDError();
    setTimeout(() => document.getElementById('account-old-password')?.focus(), 50);
  }
}

function closeAccountSettings() {
  const mainView = document.getElementById('ud-main-view');
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

// Click outside logic updated to allow clicks inside the dropdown
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('user-dropdown');
  const userBtn = document.getElementById('user-btn');
  
  if (dropdown && dropdown.classList.contains('show')) {
    // If click is NOT inside dropdown AND NOT on user button, then close
    if (!dropdown.contains(e.target) && !userBtn.contains(e.target)) {
      toggleUserDropdown(null, false);
    }
  }
});

// [ADDED]
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
    saveUsers(users);
    setCurrentUser(users[idx]);
  };
  _userHeartbeatTimer = setInterval(tick, 60 * 1000);
}

function login(username, password) {
  const users = loadUsers();
  const idx = users.findIndex(x => x.username === username && x.password === password);

  if (idx < 0) {
    showLoginError('Sai tên đăng nhập hoặc mật khẩu');
    return false;
  }

  const u = {
    ...users[idx],
    sessions: _touchUserSession(users[idx], false),
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

function doLogin() {
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



function updateUserProfile({ username, password }) {
  const session = getCurrentUser();
  if (!session) return false;

  const users = loadUsers();
  const idx = users.findIndex(u => String(u.id) === String(session.id));
  if (idx < 0) return false;

  const user = users[idx];
  const now = Date.now();
  const nextUser = {
    ...user,
    username: username || user.username,
    updatedAt: now
  };

  const passwordChanged = !!password && password !== user.password;
  if (passwordChanged) {
    nextUser.password = password;
    nextUser.sessionVersion = (user.sessionVersion || 1) + 1;
    nextUser.sessions = [];
  }

  users[idx] = normalizeUserRecord(nextUser, idx);
  saveUsers(users);

  if (typeof manualSync === 'function' && typeof fbReady === 'function' && fbReady()) {
    setTimeout(() => { try { manualSync(); } catch {} }, 0);
  }

  if (passwordChanged) {
    forceLogout('Máº­t kháº©u Ä‘Ã£ thay Ä‘á»•i. Vui lÃ²ng Ä‘Äƒng nháº­p láº¡i.');
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

  const newUsername = (document.getElementById('account-new-username')?.value || '').trim();
  const oldPassword = document.getElementById('account-old-password')?.value || '';
  const newPassword = document.getElementById('account-new-password')?.value || '';
  const confirmPassword = document.getElementById('account-confirm-password')?.value || '';

  // Validation
  if (!newUsername) return showUDError('Tên đăng nhập không được để trống');
  if (!oldPassword) return showUDError('Vui lòng nhập mật khẩu hiện tại');
  if (oldPassword !== user.password) return showUDError('Mật khẩu cũ không chính xác');

  if (newPassword) {
    if (newPassword.length < 4) return showUDError('Mật khẩu mới phải từ 4 ký tự');
    if (newPassword !== confirmPassword) return showUDError('Xác nhận mật khẩu không khớp');
  }

  const users = loadUsers();
  const duplicate = users.find(u => u.username === newUsername && String(u.id) !== String(user.id));
  if (duplicate) return showUDError('Tên đăng nhập đã tồn tại');

  // Loading state
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Đang lưu...';
  }

  // Simulate async for UX
  await new Promise(r => setTimeout(r, 600));

  const ok = updateUserProfile({
    username: newUsername,
    password: newPassword || null
  });

  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Lưu thay đổi';
  }

  if (ok) {
    if (newPassword) {
      // Password changed -> forceLogout already called inside updateUserProfile
    } else {
      toast('Cập nhật tài khoản thành công', 'success');
      syncAuthUI(); // This will also closeSettings
    }
  }
}

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

  const lock = isGiamdoc();

  _setRoleDisabled(
    '#sub-nhap-hd input, #sub-nhap-hd select, #sub-nhap-hd textarea, #sub-nhap-hd button',
    lock,
    el => el.classList.contains('inner-sub-btn') || el.classList.contains('sub-nav-btn')
  );
  _setRoleDisabled(
    '#page-chamcong > .section-header:first-of-type button, #page-chamcong > .entry-date-bar input, #page-chamcong > .entry-date-bar select, #page-chamcong > .entry-date-bar button, #page-chamcong > .entry-table-wrap .add-row-bar button, #cc-tbody input, #cc-tbody button, #cc-tbody select, #cc-tbody textarea',
    lock
  );
  _setRoleDisabled(
    '#page-thietbi > .section-header:first-of-type button, #thietbi-form input, #thietbi-form button, #thietbi-form select, #thietbi-form textarea',
    lock
  );

  const user = getCurrentUser();
  if (!user) return;

  const role = user.role;

  // Ẩn/hiện tab theo role
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const page = btn.dataset.page;

    let visible = true;

    if (role === 'ketoan') {
      if (['dashboard', 'doanhthu'].includes(page)) {
        visible = false;
      }
    }

    btn.style.display = visible ? '' : 'none';
  });
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

function initAuth() {
  const users = loadUsers();

  const session = getCurrentUser();
  if (!users || users.length === 0) {
    currentUser = null;
    syncAuthUI();
    applyRoleUI();
    showCloudSetup();
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

function afterSync() {
  const users = loadUsers();

  if (users && users.length > 0) {
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
}

async function trySyncUsersBeforeAuth() {
  const users = loadUsers();
  if (users && users.length > 0) return;
  if (typeof fbReady !== 'function' || !fbReady()) return;
  if (typeof pullChanges !== 'function') return;

  await new Promise(resolve => pullChanges(null, () => resolve(), { silent: true }));
  if (typeof _reloadGlobals === 'function') _reloadGlobals();
  afterSync();
}

if (typeof manualSync === 'function' && !manualSync.__authWrapped) {
  const _manualSyncOriginal = manualSync;
  manualSync = async function(...args) {
    const result = await _manualSyncOriginal.apply(this, args);
    afterSync();
    return result;
  };
  manualSync.__authWrapped = true;
}

// [ADDED]
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
  saveUsers(users);
  setCurrentUser(users[idx]);
});

// ══════════════════════════════
//  INIT
// ══════════════════════════════
function init() {
  document.getElementById('entry-date').value = today();
  document.getElementById('ung-date').value = today();

  // Hiển thị dữ liệu local ngay lập tức
  initTable(5);
  initUngTable(4);
  initCC();
  updateTop();
  updateJbBtn();

  // ── Nâng cấp schema nếu cần (chạy trước khi dùng data) ──
  migrateData();

  buildYearSelect();
  renderTrash();
  renderTodayInvoices();
  applyNavPermissions();
  syncAuthUI();
  startRoleObserver();
  queueApplyRoleUI();

  // Tự động đo chiều cao topbar và cập nhật padding cho body
  // Giải quyết vấn đề topbar sticky che khuất content trên mobile khi nút rớt dòng
  (function syncTopbarHeight() {
    const topbar = document.querySelector('.topbar');
    const body   = document.body;
    function update() {
      const h = topbar ? topbar.getBoundingClientRect().height : 0;
      // Thêm CSS variable để dùng ở bất cứ đâu nếu cần
      document.documentElement.style.setProperty('--topbar-h', h + 'px');
    }
    update();
    // Theo dõi khi topbar thay đổi chiều cao (wrap nút, resize cửa sổ)
    if (window.ResizeObserver) {
      new ResizeObserver(update).observe(topbar);
    }
    window.addEventListener('resize', update);
  })();

  // Topbar luôn cố định — không dùng compact effect khi cuộn

  // Tải dữ liệu mới nhất từ cloud (nếu đã có Bin ID)
  gsLoadAll(function(data) {
    if (!data) return;
    invoices    = load('inv_v3', []);
    ungRecords  = load('ung_v1', []);
    ccData      = load('cc_v2', []);
    tbData      = load('tb_v1', []);
    projects    = load('projects_v1', []);
    cats.congTrinh      = load('cat_ct',       DEFAULTS.congTrinh);
    cats.congTrinhYears = load('cat_ct_years', {});
    cats.loaiChiPhi     = load('cat_loai',     DEFAULTS.loaiChiPhi);
    cats.nhaCungCap     = load('cat_ncc',      DEFAULTS.nhaCungCap);
    cats.nguoiTH        = load('cat_nguoi',    DEFAULTS.nguoiTH);
    cats.tbTen          = load('cat_tbteb',    DEFAULTS.tbTen);
    buildYearSelect(); updateTop();
    rebuildEntrySelects(); rebuildCCNameList(); populateCCCtSel();
    initTable(5); initUngTable(4); initCC();
    const built2 = rebuildCCCategories();
    // Rebuild cats.congTrinh từ projects sau tất cả các rebuild khác
    // → đảm bảo projects là single source of truth, loại bỏ garbage
    rebuildCatCTFromProjects();
    updateTop();
    toast(`✅ Đồng bộ xong! ${built2.cts} CT mới`, 'success');
  });
}

function today() { return new Date().toISOString().split('T')[0]; }


// ══════════════════════════════
//  NAVIGATION
// ══════════════════════════════
function goPage(btn, id) {
  if (!getCurrentUser()) {
    toggleUserDropdown(true);
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  btn.classList.add('active');
  // Reload globals từ _mem → đảm bảo tab switch luôn thấy data mới nhất (kể cả khi auto-sync chạy ngầm)
  if (typeof _reloadGlobals === 'function') _reloadGlobals();
  if (id==='nhap') { renderTodayInvoices(); }
  if (id==='thongkecphd') { buildFilters(); filterAndRender(); }
  if (id==='danhmuc') renderSettings();
  if (id==='dashboard') renderDashboard();
  if (id==='doanhthu') initDoanhThu();
  if (id==='nhapung') { initUngTableIfEmpty(); buildUngFilters(); filterAndRenderUng(); }
  if (id==='chamcong') { populateCCCtSel(); rebuildCCNameList(); renderCCHistory(); renderCCTLT(); }
  if (id==='thietbi') { tbPopulateSels(); tbBuildRows(5); tbRenderList(); renderKhoTong(); }
  if (id==='congtrinh') renderProjectsPage();
  queueApplyRoleUI();
}

// Sub-tab navigation bên trong page-nhap
function goSubPage(btn, id) {
  document.querySelectorAll('#page-nhap .sub-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#page-nhap .sub-nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
  if (id === 'sub-hom-nay') { renderTodayInvoices(); }
  if (id === 'sub-tat-ca')  { buildFilters(); filterAndRender(); }
  if (id === 'sub-da-xoa')  { renderTrash(); }
}

// Toggle 1 năm trong activeYears (gọi từ checkbox trong dropdown)
function onYearToggle(year) {
  if (activeYears.has(year)) activeYears.delete(year);
  else                        activeYears.add(year);
  _syncActiveYearCompat();
  _updateYearBtn();
  onYearChange();
}

// Quick actions
function yearQuickAll() {
  activeYears = new Set();
  _syncActiveYearCompat();
  buildYearSelect();
  _closeYearDropdown();
  onYearChange();
}
function yearQuickRecent() {
  const years = new Set();
  invoices.forEach(i=>{ if(i.ngay) years.add(parseInt(i.ngay)); });
  ungRecords.forEach(u=>{ if(u.ngay) years.add(parseInt(u.ngay)); });
  ccData.forEach(w=>{ if(w.fromDate) years.add(parseInt(w.fromDate)); });
  years.add(new Date().getFullYear());
  const sorted = [...years].sort((a,b)=>b-a);
  activeYears = new Set(sorted.slice(0, 2));
  _syncActiveYearCompat();
  buildYearSelect();
  _closeYearDropdown();
  onYearChange();
}
function toggleYearDropdown(e) {
  e.stopPropagation();
  const dd = document.getElementById('year-dropdown');
  if (!dd) return;
  const open = dd.classList.toggle('open');
  if (open) {
    setTimeout(() => document.addEventListener('click', _closeYearDropdown, { once: true }), 0);
  }
}
function _closeYearDropdown() {
  const dd = document.getElementById('year-dropdown');
  if (dd) dd.classList.remove('open');
}

function onYearChange() {
  // activeYears đã được cập nhật trước khi gọi hàm này
  _syncActiveYearCompat();

  if (activeYears.size === 0) { renderActiveTab(); return; }

  if (!fbReady() || typeof pullChanges !== 'function') {
    renderActiveTab(); return;
  }

  // Push pending trước khi đổi năm
  if (typeof _pendingChanges !== 'undefined' && _pendingChanges > 0
      && !isSyncing() && typeof pushChanges === 'function') {
    pushChanges({ silent: true });
  }

  // Tìm các năm chưa có data local
  const missing = [...activeYears].filter(yr => {
    const ys = String(yr);
    return !invoices.some(i=>i.ngay&&i.ngay.startsWith(ys))
        && !ccData.some(w=>w.fromDate&&w.fromDate.startsWith(ys))
        && !ungRecords.some(u=>u.ngay&&u.ngay.startsWith(ys));
  });

  if (!missing.length) {
    renderActiveTab();
    if (typeof _pendingChanges !== 'undefined' && _pendingChanges > 0) {
      setTimeout(()=>toast('⚠️ Còn ' + _pendingChanges + ' thay đổi chưa đồng bộ — bấm 🔄 Sync', 'info'), 400);
    }
    return;
  }

  // Pull từng năm còn thiếu tuần tự
  const yrsStr = missing.join(', ');
  showSyncBanner('⏳ Đang tải dữ liệu năm ' + yrsStr + '...');
  let idx = 0;
  function pullNext() {
    if (idx >= missing.length) {
      _reloadGlobals();
      buildYearSelect();
      renderActiveTab();
      hideSyncBanner();
      if (typeof _pendingChanges !== 'undefined' && _pendingChanges > 0) {
        toast('✅ Đã tải năm ' + yrsStr + '. ⚠️ Còn ' + _pendingChanges + ' thay đổi chưa sync — bấm 🔄 Sync.', 'info');
      } else {
        toast('✅ Đã tải dữ liệu năm ' + yrsStr + ' từ Firebase', 'success');
      }
      return;
    }
    pullChanges(missing[idx++], pullNext, { silent: true });
  }
  pullNext();
}

function _refreshAllTabs() {
  // Full refresh — dùng cho import/restore khi cần cập nhật mọi tab ngay lập tức.
  // Sau sync hoặc đổi năm: dùng renderActiveTab() thay thế để tránh render tab ẩn.

  // Tầng 1: Rebuild filter dropdowns theo năm mới
  buildFilters();
  buildUngFilters();
  buildCCHistFilters();
  populateCCCtSel();        // dropdown CT trong Chấm Công
  tbPopulateSels();         // dropdown CT trong Thiết Bị
  rebuildEntrySelects();    // dropdown CT trong bảng nhập HĐ đang mở
  rebuildUngSelects();      // dropdown CT trong bảng nhập tiền ứng đang mở
  renderSettings();         // Tab Danh Mục — lọc CT theo năm mới

  // Tầng 2: Render lại nội dung TẤT CẢ các tab
  filterAndRender();        // Tất cả CP
  renderTrash();
  filterAndRenderUng();     // Tiền Ứng
  renderCtPage();           // Tổng CP CT
  renderCCHistory();        // Lịch sử CC
  renderCCTLT();            // Tổng lương tuần
  renderTodayInvoices();    // HĐ trong ngày (tab Nhập)
  tbRenderList();           // Thiết Bị
  renderDashboard();        // Dashboard (gọi renderLaiLo() bên trong)
  renderProjectsPage();     // Tab Công Trình — cập nhật chi phí theo năm

  dtPopulateSels();          // dropdowns tab Doanh Thu (gọi renderHdcTable/renderHdtpTable bên trong)
  renderThuTable();          // lịch sử thu tiền
  updateTop();
}

// ── Lấy ID tab đang active ─────────────────────────────────────────
function getCurrentTab() {
  const active = document.querySelector('.page.active');
  return active ? active.id.replace('page-', '') : 'dashboard';
}

// ── Render ONLY tab đang hiển thị — dùng sau sync và đổi năm ───────
// Không render tab ẩn → nhanh hơn _refreshAllTabs() nhiều lần.
// Tự gọi _reloadGlobals() để đảm bảo luôn dùng data mới nhất từ _mem.
function renderActiveTab() {
  // Reload globals từ _mem → bắt buộc sau sync hoặc tab switch khi auto-sync chạy ngầm
  if (typeof _reloadGlobals === 'function') _reloadGlobals();
  updateTop();

  const tab = getCurrentTab();
  if (!getCurrentUser()) {
    toggleUserDropdown(true);
    return;
  }
  switch (tab) {
    case 'nhap': {
      rebuildEntrySelects(); buildFilters(); refreshHoadonCtDropdowns();
      const sub = document.querySelector('#page-nhap .sub-page.active');
      if (!sub || sub.id === 'sub-hom-nay') renderTodayInvoices();
      else if (sub.id === 'sub-tat-ca')     { buildFilters(); filterAndRender(); }
      else if (sub.id === 'sub-da-xoa')     renderTrash();
      else renderTodayInvoices();
      break;
    }
    case 'nhapung':
      rebuildUngSelects(); buildUngFilters(); filterAndRenderUng();
      break;
    case 'chamcong':
      populateCCCtSel(); rebuildCCNameList(); renderCCHistory(); renderCCTLT();
      break;
    case 'thietbi':
      tbPopulateSels(); tbRenderList(); renderKhoTong();
      break;
    case 'danhmuc':
      renderSettings();
      break;
    case 'congtrinh':
      renderProjectsPage();
      break;
    case 'doanhthu':
      // dtPopulateSels() gọi renderHdcTable + renderHdtpTable + renderCongNoThauPhu bên trong
      dtPopulateSels(); renderThuTable();
      break;
    case 'dashboard':
    default:
      // renderDashboard() gọi renderCtPage() bên trong
      renderDashboard();
      break;
  }
  queueApplyRoleUI();
}

// Khoi dong app — IDB preflight truoc, sau do moi chay init()
// Flag bảo vệ: render sẽ bail-out nếu data chưa sẵn sàng
window._dataReady = false;
(async () => {
  await dbInit();
  // Re-load globals từ _mem (đã được dbInit() populate từ IDB)
  trash       = load('trash_v1', []);
  invoices    = load('inv_v3', []);
  ungRecords  = load('ung_v1', []);
  ccData      = load('cc_v2', []);
  tbData      = load('tb_v1', []);
  hopDongData      = load('hopdong_v1',  {});
  thuRecords       = load('thu_v1',      []);
  thauPhuContracts = load('thauphu_v1',  []);
  projects         = load('projects_v1', []);
  _migrateProjectDates(); // year → startDate/endDate migration (idempotent)
  cats.congTrinh      = load('cat_ct',       DEFAULTS.congTrinh);
  cats.congTrinhYears = load('cat_ct_years', {});
  cats.loaiChiPhi     = load('cat_loai',     DEFAULTS.loaiChiPhi);
  cats.nhaCungCap     = load('cat_ncc',      DEFAULTS.nhaCungCap);
  cats.nguoiTH        = load('cat_nguoi',    DEFAULTS.nguoiTH);
  cats.thauPhu        = load('cat_tp',       []);
  cats.congNhan       = load('cat_cn',       []);
  cats.tbTen          = load('cat_tbteb',    DEFAULTS.tbTen);
  cnRoles             = load('cat_cn_roles', {});

  // Dọn sạch HĐ CC cũ còn sót trong inv_v3 (migration một lần)
  // Từ giờ CC invoices được tính động qua buildInvoices(), không lưu vào storage
  const legacyCCCount = invoices.filter(i => i.ccKey).length;
  if (legacyCCCount > 0) {
    invoices = invoices.filter(i => !i.ccKey);
    save('inv_v3', invoices);
    console.log(`[Migration] Đã xóa ${legacyCCCount} HĐ CC cũ khỏi inv_v3`);
  }

  // Xóa các project không hợp lệ khỏi projects_v1
  // (ví dụ: tên loại chi phí, ngày tháng bị tạo nhầm bởi migration)
  cleanupInvalidProjects([
    ...(cats.loaiChiPhi  || []),
    ...(cats.congNhan    || []),
    ...(cats.thauPhu     || []),
    ...(cats.nhaCungCap  || []),
    ...(cats.nguoiTH     || []),
  ]);

  // Gán projectId cho tất cả records chưa có (migration một lần, idempotent)
  migrateProjectLinks();

  // Normalize ctPid cho dữ liệu CC cũ chưa có ctPid (backward compat)
  if (typeof normalizeAllChamCong === 'function') normalizeAllChamCong();

  // Đánh dấu data đã sẵn sàng — các render sau đây mới được phép chạy
  window._dataReady = true;

  await trySyncUsersBeforeAuth();

  if (!initAuth()) return;

  init();

  // Reset pending counter sau init (tránh migration/startup saves làm badge sai)
  if (typeof _resetPending === 'function') _resetPending();

  applyNavPermissions();
  renderProjectsPage();
  queueApplyRoleUI();

  // Cảnh báo khi đóng tab nếu còn thay đổi chưa sync
  window.addEventListener('beforeunload', function(e) {
    if (typeof _pendingChanges !== 'undefined' && _pendingChanges > 0) {
      e.preventDefault();
      e.returnValue = ''; // trình duyệt hiện cảnh báo mặc định
    }
  });

})();
