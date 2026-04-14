/* My Notes — Service Worker v4
   Strategy:
   - HTML pages: network-first (always fresh, cache as fallback)
   - Assets (icons, manifest): cache-first (fast, rarely change)
   - Self-healing: bad/404 cache entries are deleted automatically
   - Never caches sw.js itself to avoid update loops
*/

const CACHE    = 'mynotes-v4';
const HTML_ASSETS = ['./', './index.html'];
const OTHER_ASSETS = ['./manifest.json', './icon.png'];

/* ── INSTALL: cache everything, activate immediately ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll([...HTML_ASSETS, ...OTHER_ASSETS]))
      .then(() => self.skipWaiting())
      .catch(err => {
        console.warn('[SW] Install cache failed, continuing anyway:', err);
        return self.skipWaiting();
      })
  );
});

/* ── ACTIVATE: delete ALL old caches, claim all clients ── */
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
      .then(() => {
        // Tell all open tabs to reload so they get the fresh SW immediately
        return self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
        });
      })
  );
});

/* ── FETCH: smart strategy per resource type ── */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Never intercept sw.js itself — browser handles SW updates directly
  if (url.pathname.endsWith('sw.js')) return;

  // HTML pages — network first, cache fallback
  // This ensures users always get the latest version when online
  if (e.request.mode === 'navigate' ||
      url.pathname.endsWith('.html') ||
      url.pathname.endsWith('/')) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // Everything else — cache first, network fallback
  e.respondWith(cacheFirst(e.request));
});

/* Network-first: try network, fall back to cache, self-heal bad cache entries */
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const networkResponse = await fetch(request);
    // Only cache valid responses
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    } else if (networkResponse.status === 404) {
      // Bad response from network — delete stale cache entry if exists
      await cache.delete(request);
    }
    return networkResponse;
  } catch (err) {
    // Offline — try cache
    const cached = await cache.match(request);
    if (cached && cached.ok) return cached;
    // Cache has bad entry or nothing — return offline fallback
    return offlineFallback();
  }
}

/* Cache-first: serve from cache, update cache in background */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached && cached.ok) {
    // Update cache in background (stale-while-revalidate)
    fetch(request).then(r => { if (r.ok) cache.put(request, r); }).catch(() => {});
    return cached;
  }
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (err) {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

/* Minimal offline fallback page */
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
  const url = noteId ? './?open=' + noteId : './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.registration.scope));
      if (existing) {
        if (noteId) existing.postMessage({ type: 'OPEN_NOTE', noteId });
        return existing.focus();
      }
      return clients.openWindow(url);
    })
  );
});
