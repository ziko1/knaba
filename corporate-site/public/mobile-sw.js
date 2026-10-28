/* KNABA install helper only: never intercept requests or cache customer, employee or partner data. */
self.addEventListener('install', event => { event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
