/* Optional offline cache; no game or account data is stored here. */
var CACHE = 'gold-runner-vijay-v3';
// Hugo serves the directory URL and redirects index.html to it.
var FILES = ['./', './style.css', './engine.js', './app.js', './icon.svg', './apple-touch-icon.png', './manifest.json'];
self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return Promise.all(FILES.map(function (path) {
      return fetch(new Request(path, { cache: 'reload' })).then(function (response) {
        if (!response.ok || response.redirected) throw new Error('Asset unavailable');
        return cache.put(path, response);
      });
    }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.map(function (name) { if (name.indexOf('gold-runner-') === 0 && name !== CACHE) return caches.delete(name); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(event.request, { ignoreSearch: true }).then(function (cached) { return cached || fetch(event.request); });
  }));
});
self.addEventListener('message', function (event) {
  if (event.data === 'CACHE_STATUS' && event.source) {
    event.waitUntil(caches.open(CACHE).then(function (cache) {
      return Promise.all(FILES.map(function (file) { return cache.match(file); }));
    }).then(function (files) {
      if (files.every(function (file) { return !!file; })) event.source.postMessage('OFFLINE_READY');
    }));
  }
});
