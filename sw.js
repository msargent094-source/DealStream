const NAME = 'dealstream-v2';
const ASSETS = ['./','./index.html','./app.js','./styles.css','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(Promise.all([caches.keys().then(keys => Promise.all(keys.filter(k => k !== NAME).map(k => caches.delete(k)))),self.clients.claim()]));
});
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if(url.origin !== location.origin) return;
  if(url.pathname.endsWith('/data/deals.json')){
    e.respondWith(fetch(e.request).then(r => {
      if(r.ok){const copy=r.clone();e.waitUntil(caches.open(NAME).then(c=>c.put('./data/deals.json',copy)));}
      return r;
    }).catch(()=>caches.match('./data/deals.json').then(r=>r||Response.error())));
    return;
  }
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).catch(()=>caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request).then(r => {
    if(r.ok){const copy=r.clone();e.waitUntil(caches.open(NAME).then(c=>c.put(e.request,copy)));}
    return r;
  })));
});

