const CACHE = 'loza-classic-v13';
const IMAGE_CACHE = 'loza-classic-images-v4';
const PRECACHE = [
  './',
  './index.html',
  './css/styles.css',
  './js/data.js',
  './js/libraryContent.js',
  './js/audioStorage.js',
  './js/media.js',
  './js/api.js',
  './js/app.js',
  './config.js',
  './manifest.json',
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
