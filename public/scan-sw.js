// Service worker voor de HHC-scanner: de app opent ook zonder verbinding. API-aanroepen
// worden nooit gecachet (scans en lijsten komen altijd van de server of uit de eigen opslag).
const CACHE = "hhc-scan-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add("/scan")).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  const isShell = url.pathname === "/scan";
  const isAsset = url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.png" || url.pathname === "/scan/manifest.webmanifest";
  if (!isShell && !isAsset) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || Response.error())),
  );
});
