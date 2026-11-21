// Service worker voor de Hub-apps op het beginscherm (Communicatie, Commerciële Zaken, Klantenservice,
// Tickets). Bewust minimaal: pagina's en API's gaan altijd rechtstreeks naar de server en worden
// nooit bewaard (ingelogde gegevens horen niet in een cache). Alleen als er geen verbinding is, toont
// hij een eigen melding in plaats van de foutpagina van de browser.
// De scanner (/scan) en ticketpagina's (/t/) hebben hun eigen service worker met een smallere scope.
const CACHE = "hhc-app-v1";
const OFFLINE = "/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/branding/hhc-logo.png"])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("hhc-app-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  // Alleen het openen van een pagina; al het andere (API, bestanden, formulieren) laat hij met rust.
  if (req.mode !== "navigate" || req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(fetch(req).catch(() => caches.match(OFFLINE).then((hit) => hit || Response.error())));
});
