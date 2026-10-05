/* ══════════════════════════════════════════════════════════════
   sw.js — Service worker tối thiểu, chỉ để app "cài được" như ứng dụng
            ("Thêm vào màn hình chính" trên Android/iOS).

   QUAN TRỌNG — vì sao dùng NETWORK-FIRST:
     App này chạy online 100% (dữ liệu nằm trên Firebase, main.js chặn màn hình
     khi mất mạng). Nếu service worker phục vụ file từ cache trước, người dùng
     rất dễ dính bản JS cũ sau khi deploy → lỗi khó hiểu.
     Vì vậy ở đây LUÔN ưu tiên tải từ mạng; cache chỉ là phao cứu sinh để trang
     không trắng xóa khi mạng chập chờn.

   Muốn ép làm mới toàn bộ cache: tăng số ở CACHE_NAME.
   ══════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'qlcp-shell-v1';

// Những file tối thiểu để dựng được khung app khi mạng chập chờn
const SHELL = [
  './',
  './index.html',
  './assets/css/style.css',
  './assets/css/mobile.css',
  './manifest.json',
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // Chỉ đụng vào GET cùng origin. Firebase / CDN để trình duyệt tự lo.
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        // Lưu bản mới nhất vào cache để dùng khi mất mạng
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
