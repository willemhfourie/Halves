// Minimal service worker so phones offer "Install app" with the proper icon.
// It does no caching, so app updates from GitHub always show up straight away.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request)));
