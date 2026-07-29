const CACHE = 'loza-classic-v26';
const IMAGE_CACHE = 'loza-classic-images-v10';
const PRECACHE = [
  './',
  './index.html',
  './css/styles.css',
  './css/onboarding.css',
  './js/data.js',
  './js/libraryContent.js',
  './js/audioStorage.js',
  './js/media.js',
  './js/api.js',
  './js/app.js',
  './config.js',
  './manifest.json',
  './assets/webp/new_logo.webp',
  './assets/webp/hero_logo.webp',
  './assets/webp/auth_back.webp',
  './assets/favicon.png',
  './assets/favicon-32.png',
  './assets/apple-touch-icon.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/brand-avatar.png',
  './assets/webp/onboarding/onboarding_one.webp',
];

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|ico)(\?|$)/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys
        .filter((k) => k !== CACHE && k !== IMAGE_CACHE)
        .map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

function isImageRequest(request, url) {
  return request.destination === 'image' || IMAGE_EXT.test(url.pathname);
}

// Cache-first with background refresh: images load once and stay instant,
// regardless of whether they live on this origin or the asset host.
function cacheFirstImage(request) {
  return caches.open(IMAGE_CACHE).then((cache) =>
    cache.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && (response.ok || response.type === 'opaque')) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
}

// Show push/local notifications in the background. Click focuses the app.
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const title = data.title || 'Лоза';
  const options = {
    body: data.body || 'Новое сообщение в клубе',
    icon: data.icon || './assets/icon-192.png',
    badge: data.badge || './assets/favicon-32.png',
    tag: data.tag || 'loza-default',
    requireInteraction: false,
    data: { url: data.url || './', roomId: data.roomId || null },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const focused = clients.find((c) => c.focused);
      if (focused) return focused.navigate(targetUrl).then((c) => c.focus());
      const existing = clients.find((c) => c.url === targetUrl);
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl);
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.pathname.includes('/api/')) return;

  if (isImageRequest(request, url)) {
    event.respondWith(cacheFirstImage(request));
    return;
  }

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});
