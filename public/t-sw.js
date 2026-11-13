// Service worker voor de ticketpagina (/t/...): een bezochte ticketpagina blijft zonder verbinding bruikbaar,
// zodat de QR-code ook bij slecht bereik in het stadion te openen is. Er is geen account of wallet nodig.
// Alleen GET-verzoeken van de pagina zelf, de pdf en de bestanden die de pagina nodig heeft.
const CACHE = "hhc-ticket-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  const isTicket = url.pathname.startsWith("/t/");
  const isAsset = url.pathname.startsWith("/_next/static/");
  if (!isTicket && !isAsset) return;
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
