/* My Notes — Service Worker v7
   Base path: /my-notes/
   Strategy:
   - HTML / navigation: network-first → fallback to cached /my-notes/index.html
   - Assets: cache-first, background revalidate
   - Self-healing: purge all caches except current on activate
*/

const CACHE    = 'mynotes-v7';
const BASE     = '/my-notes/';
const PRECACHE = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'icon.png',
];

/* ── INSTALL ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(err => {
        console.warn('[SW] Precache failed, continuing:', err);
        return self.skipWaiting();
      })
  );
});

/* ── ACTIVATE: purge old caches, claim clients ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
  );
});

/* ── FETCH ── */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Never intercept sw.js — browser manages SW updates
  if (url.pathname.endsWith('sw.js')) return;

  // Only handle requests within our scope
  if (!url.pathname.startsWith(BASE)) return;

  // Navigation requests — network first, fallback to cached index.html
  if (e.request.mode === 'navigate') {
    e.respondWith(navigationHandler(e.request));
    return;
  }

  // Everything else — cache first, network fallback
  e.respondWith(cacheFirst(e.request));
});

/* Navigation: try exact URL from network, then cache, then cached index.html */
async function navigationHandler(request) {
  const cache = await caches.open(CACHE);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
    // Network returned error (e.g. 404) — serve cached index.html
    const fallback = await cache.match(BASE + 'index.html')
                  || await cache.match(BASE);
    if (fallback) return fallback;
    return networkResponse; // return the error response as last resort
  } catch (err) {
    // Offline — try exact cache match first, then index.html
    const cached = await cache.match(request)
                || await cache.match(BASE + 'index.html')
                || await cache.match(BASE);
    if (cached) return cached;
    return offlineFallback();
  }
}

/* Cache-first with background revalidate */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) {
    fetch(request).then(r => { if (r.ok) cache.put(request, r.clone()); }).catch(() => {});
    return cached;
  }
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

/* Minimal offline fallback */
function offlineFallback() {
  return new Response(
    `<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>My Notes — Offline</title>
    <style>
      body{font-family:system-ui,sans-serif;background:#F5F0FF;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
      .box{background:white;border-radius:20px;padding:40px;text-align:center;max-width:320px;border:1px solid rgba(83,74,183,.15)}
      h1{color:#3C3489;font-size:20px;margin:0 0 10px}
      p{color:#5B5380;font-size:14px;line-height:1.6;margin:0 0 20px}
      button{background:#534AB7;color:white;border:none;border-radius:20px;padding:12px 24px;font-size:14px;cursor:pointer}
    </style>
    </head><body>
    <div class="box">
      <h1>You are offline</h1>
      <p>My Notes needs a connection to load. Please check your internet and try again.</p>
      <button onclick="location.reload()">Try again</button>
    </div>
    </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );
}

/* ── NOTIFICATION CLICK ── */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const noteId = e.notification.data && e.notification.data.noteId;
  const url = noteId ? BASE + '?open=' + noteId : BASE;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(BASE));
      if (existing) {
        if (noteId) existing.postMessage({ type: 'OPEN_NOTE', noteId });
        return existing.focus();
      }
      return clients.openWindow(url);
    })
  );
});

/* ── SKIP WAITING ── */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
