/* DealStream v3: network-first app updates, separate offline feed cache. */
const SHELL_CACHE='dealstream-shell-v4';
const FEED_CACHE='dealstream-feed-v1';
const ASSETS=['./','./index.html','./app.js','./styles.css','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
const feedKey=()=>new Request(new URL('./data/deals.json',self.registration.scope));
self.addEventListener('install',event=>event.waitUntil(
  caches.open(SHELL_CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())
));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  // Carry an offline feed forward from older service workers, if available.
  const names=await caches.keys();const data=await caches.open(FEED_CACHE);
  if(!await data.match(feedKey())){
    for(const name of names){if(name===SHELL_CACHE||name===FEED_CACHE)continue;
      const old=await caches.open(name);const record=await old.match(feedKey());
      if(record){await data.put(feedKey(),record);break;}
    }
  }
  await Promise.all(names.filter(name=>name!==SHELL_CACHE&&name!==FEED_CACHE).map(name=>caches.delete(name)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);if(url.origin!==location.origin)return;
  if(url.pathname.endsWith('/data/deals.json')){
    event.respondWith(fetch(event.request).then(async response=>{
      if(response.ok){const clone=response.clone();event.waitUntil(caches.open(FEED_CACHE).then(c=>c.put(feedKey(),clone)));}
      return response;
    }).catch(async()=>{
      const cached=await caches.match(feedKey());
      if(!cached)return Response.error();
      const headers=new Headers(cached.headers);headers.set('X-DealStream-Cache','offline');
      return new Response(await cached.blob(),{status:cached.status,statusText:cached.statusText,headers});
    }));return;
  }
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const clone=response.clone();event.waitUntil(caches.open(SHELL_CACHE).then(c=>c.put(event.request,clone)));}
    return response;
  }).catch(async()=>await caches.match(event.request)|| (event.request.mode==='navigate'?await caches.match('./index.html'):Response.error())));
});
