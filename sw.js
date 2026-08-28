// Bump ASSET_VERSION together with the ?v= query in index.html so installed
// PWAs cannot keep serving stale scripts out of the HTTP cache.
const ASSET_VERSION = '42';
const CACHE = `loza-classic-v${ASSET_VERSION}`;
const IMAGE_CACHE = 'loza-classic-images-v12';
const BADGE_CACHE = 'loza-classic-badge-v1';
const BADGE_STATE_URL = new URL('./__loza_badge_count__', self.registration.scope).toString();
const PRECACHE = [
  './',
  './index.html',
  `./css/styles.css?v=${ASSET_VERSION}`,
  `./css/onboarding.css?v=${ASSET_VERSION}`,
  `./js/data.js?v=${ASSET_VERSION}`,
  `./js/libraryContent.js?v=${ASSET_VERSION}`,
  `./js/audioStorage.js?v=${ASSET_VERSION}`,
  `./js/media.js?v=${ASSET_VERSION}`,
  `./js/api.js?v=${ASSET_VERSION}`,
  `./js/app.js?v=${ASSET_VERSION}`,
  `./config.js?v=${ASSET_VERSION}`,
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
        .filter((k) => k !== CACHE && k !== IMAGE_CACHE && k !== BADGE_CACHE)
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

// User uploads (chat photos) go network-first: an error response cached right
// after upload must never keep one device permanently blind to a photo that
// everyone else can see. Cache is only the offline fallback here.
function networkFirstImage(request) {
  return caches.open(IMAGE_CACHE).then((cache) =>
    fetch(request)
      .then((response) => {
        if (response && (response.ok || response.type === 'opaque')) {
          cache.put(request, response.clone());
        }
        return response;
      })
      .catch(() => cache.match(request)),
  );
}

// Static legal pages have no app script, so they cannot handle our messages.
function appWindows(windows) {
  return windows.filter((client) => !/\/(privacy|terms)\.html/i.test(client.url));
}

async function setStoredBadgeCount(value) {
  const count = Math.max(0, Number(value) || 0);
  const cache = await caches.open(BADGE_CACHE);
  await cache.put(BADGE_STATE_URL, new Response(String(count)));
  if ('setAppBadge' in self.navigator) {
    if (count) await self.navigator.setAppBadge(count);
    else await self.navigator.clearAppBadge();
  }
  return count;
}

async function incrementStoredBadge() {
  const cache = await caches.open(BADGE_CACHE);
  const response = await cache.match(BADGE_STATE_URL);
  const current = Number(await response?.text()) || 0;
  return setStoredBadgeCount(current + 1);
}

// Show push notifications in the background. Click focuses the app.
async function showChatPush(data) {
  // App in the foreground? Hand it over for an in-app banner instead of a
  // system one, so a message never lands twice in front of the same person.
  if (data.roomId) {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const active = appWindows(windows).find((c) => c.focused && c.visibilityState === 'visible');
    if (active) {
      active.postMessage({ type: 'loza:chat-push', ...data });
      return;
    }
  }

  if (data.roomId) await incrementStoredBadge();

  const title = data.title || 'Р›РѕР·Р°';
  const options = {
    body: data.body || 'РќРѕРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ РІ РєР»СѓР±Рµ',
    icon: data.icon || './assets/icon-192.png',
    badge: data.badge || './assets/favicon-32.png',
    // A photo message shows the photo itself where the platform supports it.
    image: data.image || undefined,
    tag: data.tag || 'loza-default',
    // Collapse per chat, but still alert on every new message.
    renotify: Boolean(data.renotify),
    timestamp: data.timestamp || Date.now(),
    vibrate: data.vibrate || [12, 60, 12],
    actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : undefined,
    requireInteraction: false,
    data: { url: data.url || './', roomId: data.roomId || null },
  };
  await self.registration.showNotification(title, options);
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = {};
  }
  event.waitUntil(showChatPush(data));
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'loza:set-badge') return;
  event.waitUntil(setStoredBadgeCount(event.data.count));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { url: targetUrl = './', roomId = null } = event.notification.data || {};
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Reusing an open window keeps the chat warm вЂ” no cold reload on tap.
      const candidates = appWindows(clients);
      const open = candidates.find((c) => c.focused) || candidates[0];
      if (open) {
        open.postMessage({ type: 'loza:open-chat', roomId, url: targetUrl });
        return open.focus();
      }
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
    event.respondWith(
      url.pathname.includes('/uploads/')
        ? networkFirstImage(request)
        : cacheFirstImage(request),
    );
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
