/* Caches the app shell only. API calls (POST to Google) always go to the network,
 * so staff never see stale schedules or hours. Bump VERSION on every release. */
const VERSION = 'selectives-v1';
const SHELL = [
  './', './index.html', './app.css', './app.js', './admin.js', './demo.js', './config.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // API is POST: never touched
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // Google, fonts etc.: straight to network
  // Network first so a new release shows up right away; cache is the offline fallback.
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});
