/* Xpend service worker — network-first so a home-screen (standalone) install always
   picks up the latest deploy, with an offline cache fallback. */
const V="v1";

self.addEventListener("install",e=>self.skipWaiting());

self.addEventListener("activate",e=>e.waitUntil(
  Promise.all([self.clients.claim(),caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k))))])
));

self.addEventListener("fetch",e=>{
  const req=e.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin!==location.origin)return;
  if(req.mode==="navigate"){
    e.respondWith(
      fetch(req)
        .then(r=>{
          const cl=r.clone();
          caches.open(V).then(c=>c.put(req,cl)).catch(()=>{});
          return r;
        })
        .catch(()=>caches.match(req,{ignoreSearch:true}).then(r=>r||fetch(req)))
    );
    return;
  }
  e.respondWith(
    caches.open(V).then(c=>c.match(req).then(cached=>{
      const net=fetch(req).then(r=>{c.put(req,r.clone()).catch(()=>{});return r}).catch(()=>cached);
      return cached||net;
    }))
  );
});