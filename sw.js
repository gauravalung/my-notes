/* My Notes — Service Worker v3
   Handles: offline caching + notification clicks only.
   Scheduling is done by the main page via swReg.showNotification(). */

const CACHE = 'mynotes-v3';
const ASSETS = ['./', './index.html', './sw.js', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
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
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

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
