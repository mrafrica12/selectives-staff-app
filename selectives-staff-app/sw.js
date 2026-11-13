/* Release changes to this list or its files require a new VERSION. */
const VERSION = 'selectives-shell-v3';
const prefix = VERSION.replace(/v\d+$/, '') + self.registration.scope + ':';
const cacheName = prefix + VERSION;
const scope = self.registration.scope;
const shell = [
  './', 'index.html', 'app.css', 'app.js', 'admin.js', 'config.js', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/maskable-512.png'
].map(path => new URL(path, scope).href);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(prefix) && key !== cacheName).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate' && [scope, new URL('index.html', scope).href].includes(url.origin + url.pathname)) {
    event.respondWith(caches.open(cacheName).then(cache => cache.match(scope)).then(response => response || fetch(request)));
  } else if (shell.includes(request.url)) {
    event.respondWith(caches.open(cacheName).then(cache => cache.match(request)).then(response => response || fetch(request)));
  }
});
