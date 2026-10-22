/* BassCast SA service worker
 *
 * What it does
 *  - Pre-caches the app shell (page, PWA files, icons, offline page) and the pinned map libraries,
 *    so the app opens and the saved forecast, spots, notes and log still work offline.
 *  - Pages: network first (fresh deploys always win when online), cached copy if the network is
 *    slow or down, offline page as the last resort.
 *  - Never touches live data: Open-Meteo weather and map tiles go straight to the network.
 *    The app keeps its own last forecast and labels it "Offline, last updated ..." itself.
 *
 * Releasing a new version: bump VERSION below whenever any cached file changes.
 */
const VERSION = 'v1-2026-10-22';
const SHELL_CACHE = 'basscast-shell-' + VERSION;
const RUNTIME_CACHE = 'basscast-runtime-' + VERSION;

// Relative to this file, so it works under /basscast-sa/ on GitHub Pages.
const SHELL = [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './pwa.js',
  './pwa.css',
  './icons/icon.svg',
  './icons/favicon.svg',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];

// Version-pinned libraries the page loads. They never change at these URLs, so caching is safe,
// and without them the app's scripts cannot start offline.
const LIBS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css',
  'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js',
  'https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js'
];

// Live data: always network, never cached by the worker.
const LIVE_HOSTS = [
  'api.open-meteo.com',
  'tiles.openfreemap.org',
  'server.arcgisonline.com',
  'tile.openstreetmap.org'
];

const NAV_TIMEOUT_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    // The shell must cache completely, or this version does not install.
    await shell.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })));
    // Libraries are best effort: one CDN hiccup should not block the install.
    const runtime = await caches.open(RUNTIME_CACHE);
    await Promise.all(LIBS.map(async url => {
      try {
        const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (res.ok) await runtime.put(url, res);
      } catch (e) { /* fetched again on first online use */ }
    }));
    // Take over straight away so nobody is left on an old version.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, RUNTIME_CACHE]);
    const names = await caches.keys();
    await Promise.all(names
      .filter(n => n.startsWith('basscast-') && !keep.has(n))
      .map(n => caches.delete(n)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (e) {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  // Live data and anything not listed below: let the browser handle it normally.
  if (LIVE_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) return;

  if (req.mode === 'navigate') {
    if (url.origin === self.location.origin) event.respondWith(handleNavigation(event));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
    return;
  }

  if (LIBS.includes(url.href)) {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));
    return;
  }

  // Google Fonts: stylesheet refreshes in the background, font files are immutable.
  if (url.hostname === 'fonts.googleapis.com') {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
    return;
  }
  if (url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));
    return;
  }
  // Everything else (other third parties) is not intercepted.
});

async function handleNavigation(event) {
  const cache = await caches.open(SHELL_CACHE);
  const network = (async () => {
    const preload = event.preloadResponse ? await event.preloadResponse : null;
    const res = preload || await fetch(event.request);
    // Keep the newest page for offline use (only for the app page itself).
    if (res && res.ok && res.type === 'basic') {
      const path = new URL(event.request.url).pathname;
      const scopePath = new URL(self.registration.scope).pathname;
      if (path === scopePath || path === scopePath + 'index.html') {
        cache.put('./index.html', res.clone());
      }
    }
    return res;
  })();

  try {
    // Wait for the network, but not forever on a weak signal.
    return await promiseTimeout(network, NAV_TIMEOUT_MS);
  } catch (e) {
    const cached = await cache.match(event.request, { ignoreSearch: true })
      || await cache.match('./index.html')
      || await cache.match('./');
    if (cached) {
      // If the slow request does finish, it still refreshes the cache for next time.
      event.waitUntil(network.catch(() => {}));
      return cached;
    }
    try { return await network; } catch (err) {
      return (await cache.match('./offline.html')) || new Response('BassCast SA is offline.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req, { ignoreSearch: true });
  const fresh = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  if (cached) { fresh.catch(() => {}); return cached; }
  const res = await fresh;
  return res || new Response('', { status: 504, statusText: 'Offline' });
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

function promiseTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}
