/* Offline cache + reminder notifications for Odometer Logbook.
 * Bump VERSION whenever you upload changed app files (odo-v3, odo-v4, ...). */
var VERSION = 'odo-v2';
var SHELL = ['./', 'index.html', 'app.js', 'config.js', 'ocr-worker.js', 'manifest.webmanifest',
             'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
             'icons/badge-96.png', 'sounds/odometer-chime.mp3'];
var OCR_CACHE = 'odo-ocr-v1';   // photo-reader files from jsDelivr (kept across app updates)

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION && k !== OCR_CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // Photo reader (Tesseract) from jsDelivr: cache first, download once.
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open(OCR_CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          if (res.ok || res.type === 'opaque') c.put(req, res.clone());
          return res;
        });
      });
    }));
    return;
  }

  if (url.origin !== location.origin) return;   // e.g. the reminder server: always live

  // App files: serve from cache instantly, refresh the cache in the background.
  e.respondWith(caches.open(VERSION).then(function (c) {
    var key = req.mode === 'navigate' ? 'index.html' : req;
    return c.match(key, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res.ok && res.status === 200) c.put(key, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});

/* ---------- Reminder notifications ---------- */
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || 'Odometer Logbook', {
      body: d.body || 'Remember to log your odometer.',
      icon: 'icons/icon-192.png',
      badge: 'icons/badge-96.png',
      tag: d.tag || 'odo-reminder',
      renotify: true,
      vibrate: [180, 140, 180],          // two soft pulses, like the two chimes
      data: { url: d.url || './' }
    }),
    // If the app is open on screen, it plays the two chimes itself.
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      list.forEach(function (c) { c.postMessage({ type: 'chime' }); });
    })
  ]));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if ('focus' in list[i]) return list[i].focus();
    }
    return self.clients.openWindow(target);
  }));
});
