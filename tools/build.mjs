// Build the offline trip app from the latest itinerary page.
// Usage: node tools/build.mjs <itinerary.html> [mapFolder]
// Reads the passphrase and salt from ~/.config/argentina-trip (never committed), encrypts the
// whole page (map images inlined) into trip.enc, and bumps the service worker VERSION.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { webcrypto as crypto } from "node:crypto";

const src = process.argv[2];
if (!src) { console.error("usage: node tools/build.mjs <itinerary.html> [mapFolder]"); process.exit(1); }
const mapDir = process.argv[3] || path.join(path.dirname(src), "map");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const cfg = path.join(os.homedir(), ".config", "argentina-trip");
const pass = fs.readFileSync(path.join(cfg, "passphrase"), "utf8").trim().toLowerCase();
const salt = Buffer.from(fs.readFileSync(path.join(cfg, "salt"), "utf8").trim(), "hex");
const ITER = 600000;

let s = fs.readFileSync(src, "utf8");
const must = (cond, what) => { if (!cond) { console.error("build: could not find " + what); process.exit(1); } };

// local fonts and Leaflet instead of Google Fonts and the CDN
const fontRe = /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\s*<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*">/;
must(fontRe.test(s), "Google Fonts links");
s = s.replace(fontRe, '<link rel="stylesheet" href="fonts/fonts.css">');
const leafRe = /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/1\.9\.4\/leaflet\.min\.js"[^>]*><\/script>/;
must(leafRe.test(s), "Leaflet script tag");
s = s.replace(leafRe, '<script src="vendor/leaflet.js"></script>');

// map images inside the encrypted page
s = s.replace(/"map\/([a-z]+)\.jpg"/g, (m, n) => {
  const f = path.join(mapDir, n + ".jpg");
  must(fs.existsSync(f), f);
  return '"data:image/jpeg;base64,' + fs.readFileSync(f).toString("base64") + '"';
});

// "Show where I am" on the map: GPS works with no cell service
const locate = `
  (function () {
    if (!navigator.geolocation) return;
    var me = null, ring = null;
    var Ctl = L.Control.extend({ options: { position: "topleft" }, onAdd: function () {
      var b = L.DomUtil.create("a", "leaflet-bar locate-btn");
      b.href = "#"; b.title = "Show where I am"; b.setAttribute("role", "button"); b.setAttribute("aria-label", "Show where I am");
      b.innerHTML = "<svg viewBox='0 0 24 24' width='18' height='18' aria-hidden='true'><circle cx='12' cy='12' r='4' fill='currentColor'/><circle cx='12' cy='12' r='8' fill='none' stroke='currentColor' stroke-width='2'/><path d='M12 1v4M12 19v4M1 12h4M19 12h4' stroke='currentColor' stroke-width='2'/></svg>";
      L.DomEvent.on(b, "click", function (e) {
        L.DomEvent.preventDefault(e); L.DomEvent.stopPropagation(e);
        b.classList.add("busy");
        navigator.geolocation.getCurrentPosition(function (p) {
          b.classList.remove("busy");
          var ll = [p.coords.latitude, p.coords.longitude], acc = p.coords.accuracy || 50;
          if (me) { me.setLatLng(ll); ring.setLatLng(ll).setRadius(acc); }
          else {
            ring = L.circle(ll, { radius: acc, color: "#1a73e8", weight: 1, fillOpacity: .12, interactive: false }).addTo(map);
            me = L.circleMarker(ll, { radius: 7, color: "#fff", weight: 2, fillColor: "#1a73e8", fillOpacity: 1 }).addTo(map);
          }
          var t = new Date(p.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
          me.bindPopup("<b>You are here</b><br>" + ll[0].toFixed(5) + ", " + ll[1].toFixed(5) + "<br>within " + Math.round(acc * 3.28) + " ft · " + t).openPopup();
          map.setView(ll, Math.max(map.getZoom(), 11));
        }, function () { b.classList.remove("busy"); alertless(); }, { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 });
      });
      return b;
    } });
    function alertless() { var m = document.getElementById("map-status"); if (m) m.textContent = "Couldn't get your location. Check that Location is allowed for this app, and step outside for a clear sky."; }
    new Ctl().addTo(map);
  })();
`;
const anchor = "  map.fitBounds(ARG);";
must(s.includes(anchor), "map.fitBounds(ARG) anchor");
s = s.replace(anchor, anchor + locate);
const css = `
.locate-btn { display: grid !important; place-items: center; width: 30px; height: 30px; background: var(--surface, #fff); color: #1a73e8; cursor: pointer; }
.locate-btn.busy { opacity: .5; }
#map-status { font-size: .8rem; color: var(--muted); min-height: 1em; }
`;
s = s.replace("</style>", css + "</style>");
must(s.includes('<div id="trip-map"'), "trip-map element");
s = s.replace(/(<div id="trip-map"[^>]*>(?:<\/div>)?)/, '$1<p id="map-status" aria-live="polite"></p>');

// app note in the header
const built = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
s = s.replace(/(<div class="eyebrow">)([^<]*)(<\/div>)/, `$1$2 · App copy ${built}, works offline$3`);

const head = '<!doctype html>\n<html lang="en">\n<head>\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="robots" content="noindex, nofollow">\n<meta name="theme-color" content="#f4f7f7" media="(prefers-color-scheme: light)">\n<meta name="theme-color" content="#0e171b" media="(prefers-color-scheme: dark)">\n<link rel="manifest" href="manifest.webmanifest">\n<link rel="apple-touch-icon" href="icons/icon-180.png">\n';
const doc = head + s.replace(/^\s*<meta charset="utf-8">/, '<meta charset="utf-8">') + "\n</html>\n";

// encrypt: PBKDF2-SHA256 -> AES-GCM 256
const enc = new TextEncoder();
const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITER }, base, 256);
const key = await crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["encrypt"]);
const iv = crypto.getRandomValues(new Uint8Array(12));
const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(doc));
fs.writeFileSync(path.join(root, "trip.enc"), JSON.stringify({
  v: 1, iter: ITER, salt: salt.toString("base64"), iv: Buffer.from(iv).toString("base64"), data: Buffer.from(data).toString("base64")
}));

// service worker: new VERSION and the font list
const fonts = fs.readdirSync(path.join(root, "fonts")).filter((f) => f.endsWith(".woff2")).map((f) => `"fonts/${f}"`);
let sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const ver = "trip-" + new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
sw = sw.replace(/const VERSION = "[^"]*";/, `const VERSION = "${ver}";`)
       .replace(/\/\*FONTS\*\/[^\]]*\];/, `/*FONTS*/, ${fonts.join(", ")}];`);
fs.writeFileSync(path.join(root, "sw.js"), sw);
console.log("built", ver, "page", Math.round(doc.length / 1024) + " KB", "trip.enc", Math.round(fs.statSync(path.join(root, "trip.enc")).size / 1024) + " KB", fonts.length, "fonts");
