/* ═══════════════════════════════════════════════════════════
   My Notes — Service Worker  (v2)

   Responsibilities:
   1. Cache the app shell so it loads offline
   2. Handle notification CLICKS (open note / mark done)

   NOT responsible for scheduling — the main page does that
   via Notification API directly. SW timers are unreliable.
═══════════════════════════════════════════════════════════ */

const CACHE = 'mynotes-v2';
const ASSETS = ['./', './index.html'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

/* ── Single, correct notificationclick handler ── */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const noteId = e.notification.data && e.notification.data.noteId;
  const action  = e.action;

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.registration.scope));

      if (action === 'done' && noteId) {
        // Tell the open tab to mark it done
        if (existing) {
          existing.postMessage({ type: 'MARK_DONE', noteId });
          return existing.focus();
        }
        return clients.openWindow('./?done=' + noteId);
      }

      // Default: open the note
      if (existing) {
        if (noteId) existing.postMessage({ type: 'OPEN_NOTE', noteId });
        return existing.focus();
      }
      return clients.openWindow(noteId ? './?open=' + noteId : './');
    })
  );
});
