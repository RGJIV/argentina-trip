/* Offline: keep the whole trip on the phone. tools/build.mjs rewrites VERSION on every build. */
const VERSION = "trip-202611241925";
const FILES = ["./", "index.html", "trip.enc", "manifest.webmanifest", "vendor/leaflet.js", "fonts/fonts.css",
  "icons/icon-32.png", "icons/icon-180.png", "icons/icon-512.png" /*FONTS*/, "fonts/BarlowCondensed-500-latin-ext.woff2", "fonts/BarlowCondensed-500-latin.woff2", "fonts/BarlowCondensed-600-latin-ext.woff2", "fonts/BarlowCondensed-600-latin.woff2", "fonts/BarlowCondensed-700-latin-ext.woff2", "fonts/BarlowCondensed-700-latin.woff2", "fonts/IBMPlexMono-400-latin-ext.woff2", "fonts/IBMPlexMono-400-latin.woff2", "fonts/IBMPlexMono-500-latin-ext.woff2", "fonts/IBMPlexMono-500-latin.woff2", "fonts/IBMPlexSans-400-latin-ext.woff2", "fonts/IBMPlexSans-400-latin.woff2", "fonts/IBMPlexSans-400i-latin-ext.woff2", "fonts/IBMPlexSans-400i-latin.woff2", "fonts/IBMPlexSans-500-latin-ext.woff2", "fonts/IBMPlexSans-500-latin.woff2", "fonts/IBMPlexSans-600-latin-ext.woff2", "fonts/IBMPlexSans-600-latin.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;            // weather and outside links: network only
  if (url.pathname.endsWith("trip.enc") || e.request.mode === "navigate") {
    // newest trip when there is a connection, saved copy when there isn't
    e.respondWith(fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html"))));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
