/* Private application data, HTML, API, GPS and payroll are never cached. */
const STATIC='knaba-static-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(STATIC).then(cache=>cache.addAll(['/icon.svg','/manifest.webmanifest'])));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==STATIC).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(url.origin===self.location.origin&&['/icon.svg','/manifest.webmanifest'].includes(url.pathname)&&event.request.method==='GET'){event.respondWith(caches.match(event.request).then(found=>found||fetch(event.request)));}});
self.addEventListener('message',event=>{if(event.data==='CLEAR_PRIVATE_DATA'){event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==STATIC).map(key=>caches.delete(key)))));}});
