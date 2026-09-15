// Minimal offline-first service worker: cache app shell, network-first for API.
const CACHE = 'qc-shell-v1';
const SHELL = ['/', '/manifest.json'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) return; // API: network only (queued in IndexedDB when offline)
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then((m) => m || caches.match('/')))
  );
});
self.addEventListener('sync', (e) => {
  if (e.tag === 'qc-sync') e.waitUntil(Promise.resolve());
});
