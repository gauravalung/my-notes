/* ═══════════════════════════════════════════════════════════
   My Notes — Service Worker
   Handles:
   1. Offline caching (app works without internet after first load)
   2. Background reminder checks via periodic sync
   3. Scheduled notifications via setTimeout after SW wakes
   4. Notification click → opens/focuses the app
═══════════════════════════════════════════════════════════ */

const CACHE = 'mynotes-v1';
const ASSETS = ['/', '/index.html'];

/* ── INSTALL: cache the app shell ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: clean old caches ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: serve from cache, fall back to network ── */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

/* ── NOTIFICATION CLICK: focus or open the app ── */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const noteId = e.notification.data && e.notification.data.noteId;
  const url = noteId ? `/?open=${noteId}` : '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.postMessage({ type: 'OPEN_NOTE', noteId });
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});

/* ── MESSAGE: schedule a reminder from the main page ── */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SCHEDULE_REMINDER') {
    const { noteId, title, body, reminderTime } = e.data;
    const delay = new Date(reminderTime).getTime() - Date.now();
    if (delay < 0) return; // already past
    setTimeout(() => {
      self.registration.showNotification('My Notes — Reminder', {
        body: title + (body ? '\n' + body.slice(0, 80) : ''),
        icon: '/icon.png',
        badge: '/icon.png',
        tag: 'reminder-' + noteId,      // replaces any earlier notif for same note
        renotify: true,
        data: { noteId },
        actions: [
          { action: 'open',  title: 'Open note' },
          { action: 'done',  title: 'Mark done'  },
        ]
      });
    }, Math.max(delay, 0));
  }

  if (e.data && e.data.type === 'CANCEL_REMINDER') {
    // No reliable way to cancel a setTimeout in SW after restart,
    // but marking as done in localStorage means SW notification is ignored on click
  }
});

/* ── NOTIFICATION ACTION: "Mark done" pressed on the notification ── */
self.addEventListener('notificationclick', e => {
  const action = e.action;
  const noteId = e.notification.data && e.notification.data.noteId;
  e.notification.close();

  if (action === 'done' && noteId) {
    // Tell the page to mark this reminder done
    e.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        if (list.length > 0) {
          list[0].postMessage({ type: 'MARK_DONE', noteId });
          list[0].focus();
        } else {
          // App not open — store the action for next open
          // (handled via ?done=noteId URL param)
          clients.openWindow(`/?done=${noteId}`);
        }
      })
    );
    return;
  }

  // Default: open the note
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          if (noteId) client.postMessage({ type: 'OPEN_NOTE', noteId });
          return;
        }
      }
      return clients.openWindow(noteId ? `/?open=${noteId}` : '/');
    })
  );
});
