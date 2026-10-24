/* BassCast SA service worker
 *
 * What it does
 *  - Pre-caches the app shell (page, PWA files, icons, offline page) and the pinned map libraries,
 *    so the app opens and the saved forecast, spots, notes and log still work offline.
 *  - Pages and the app's own scripts: network first (fresh deploys always win when online), cached
 *    copy if the network is slow or down, offline page as the last resort. Scripts follow the page
 *    so a new page is never run with an old copy of app.js.
 *  - Libraries are checked against the same integrity hashes as the page, so a tampered CDN file
 *    is never saved into the cache.
 *  - Never touches live data: Open-Meteo weather and map tiles go straight to the network.
 *    The app keeps its own last forecast and labels it "Offline, last updated ..." itself.
 *
 * Releasing a new version: bump VERSION below whenever any cached file changes.
 */
const VERSION = 'v3-2026-10-24';
const SHELL_CACHE = 'basscast-shell-' + VERSION;
const RUNTIME_CACHE = 'basscast-runtime-' + VERSION;

// Relative to this file, so it works under /basscast-sa/ on GitHub Pages.
const SHELL = [
  './',
  './index.html',
  './offline.html',
  './offline.js',
  './manifest.webmanifest',
  './theme.js',
  './app.js',
  './maplibre-loader.js',
  './effects.js',
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
// and without them the app's scripts cannot start offline. The hashes match the integrity
// attributes in index.html; keep the two in step if a library version ever changes.
const LIB_INTEGRITY = {
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css': 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js': 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH',
  'https://unpkg.com/maplibre-gl@6.15.0/dist/maplibre-gl.css': 'sha384-S+OnE5M4U3Qc2nR0RgljGrVs06xqfRg8L7uFk/pOF5+sRuSDG4oKkqKZmFrx7w09',
  'https://unpkg.com/maplibre-gl@6.15.0/dist/maplibre-gl.mjs': 'sha384-f3IomKpQJ9QgLFg9JJeeIXKzhYFCZFLXDs4FbQLY13Y1uiaEctrT8RHbumCfpsAc',
  // Fetched by maplibre-loader.js, which holds the same hash.
  'https://unpkg.com/maplibre-gl@6.15.0/dist/maplibre-gl-worker.mjs': 'sha384-bFMCdo+41ozOqjqQ5s+XmCW14ORz7o11KR04vuUouko65bE1KkGqbN3/z4wUS5Q4',
  'https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js': 'sha384-tXYNKOHx4T02jMP7YYCtBxPIv1B5gaA5mcVPBzqMp6d7VzWzxJgI2aWF/nJLrQdS'
};
const LIBS = Object.keys(LIB_INTEGRITY);

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
        const res = await fetch(url, { mode: 'cors', credentials: 'omit', integrity: LIB_INTEGRITY[url] });
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
    // Preload is switched off: it can hand back a page from the browser's HTTP cache (GitHub Pages
    // allows 10 minutes), which could then run with newer scripts. Pages are fetched below instead.
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.disable(); } catch (e) {}
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
    // Scripts must match the page that loads them, so they follow the network like the page does.
    if (url.pathname.endsWith('.js')) event.respondWith(networkFirst(event, req, SHELL_CACHE));
    else event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
    return;
  }

  if (LIBS.includes(url.href)) {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE, LIB_INTEGRITY[url.href]));
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
    // 'no-cache' asks the server whether the page changed (a cheap 304 when it has not), so the page
    // and its scripts always come from the same deploy. 'manual' keeps redirects as a navigation expects.
    const res = await fetch(event.request.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'manual' });
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

// Own files that must stay in step with the page: network when it answers in time, else the cached copy.
async function networkFirst(event, req, cacheName) {
  const cache = await caches.open(cacheName);
  const network = fetch(new Request(req, { cache: 'no-cache' })).then(res => {
    if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  });
  try {
    return await promiseTimeout(network, NAV_TIMEOUT_MS);
  } catch (e) {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) { event.waitUntil(network.catch(() => {})); return cached; }
    try { return await network; } catch (err) {
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  }
}

async function cacheFirst(req, cacheName, integrity) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    // With a known hash, fetch with it, so a file that does not match is never cached.
    const res = await fetch(integrity ? new Request(req.url, { mode: 'cors', credentials: 'omit', integrity }) : req);
    if (res && (res.ok || (!integrity && res.type === 'opaque'))) cache.put(req, res.clone());
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
