/**
 * Service worker for the web build, so the installed game keeps playing offline. vite.config.js
 * copies this file to dist/sw.js and fills in the cache version and the list of files to precache.
 * Pages are fetched network first, so a new deploy shows up on the next visit; everything else is
 * served from the cache first, since built files are hashed and never change in place.
 */
const VERSION = '__VERSION__';
const PRECACHE = ['__PRECACHE__'];
const CACHE = `lethal-grid-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Ads, analytics and portal scripts always go straight to the network
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/', { cacheName: CACHE }))
    );
    return;
  }

  // ignoreVary: module scripts are fetched with an Origin header the precache request didn't send,
  // so a `Vary: Origin` response would otherwise never match
  event.respondWith(
    caches.match(request, { cacheName: CACHE, ignoreSearch: true, ignoreVary: true }).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
    )
  );
});
