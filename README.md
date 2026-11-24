# Argentina Trip app

Offline phone web app for Richard's Dec 4-19, 2026 Patagonia fly-fishing trip. Same idea as the golf Caddie: add it to the iPhone Home Screen once, then it opens with no cell service.

- **Live:** https://rgjiv.github.io/argentina-trip/ (GitHub Pages, branch `gh-pages`)
- **Locked:** the trip page is AES-GCM encrypted in `trip.enc` (PBKDF2-SHA256, 600,000 rounds). The passphrase is typed once per device; the derived key stays in that device's storage, so later opens need no typing and no network.
- **Passphrase and salt:** `~/.config/argentina-trip/passphrase` and `salt` on the office Mac, plus Richard's password manager. Never commit them. Keep the same salt so phones that already unlocked keep working after updates.

## Update after an itinerary change

```bash
node tools/build.mjs ~/AI_Files/04_Personal/Travel/2026-12_Argentina-Lago-Strobel/<latest>_Argentina-Trip_Itinerary_vNN.html
git add -A && git commit -m "Trip app: itinerary vNN" && git push
```

The build inlines the map images (from the `map/` folder beside the itinerary), swaps Google Fonts and the Leaflet CDN for the local copies in `fonts/` and `vendor/`, adds the map's "Show where I am" button, encrypts, and bumps `VERSION` in `sw.js` so phones pick up the new copy the next time they open with a connection.

## Offline behavior

- Everything on the page works offline: itinerary, map, saved weather, tips, packing, contacts.
- Weather "Update" and outside links (Windy, SMN, maps) need a connection (lodge Wi-Fi or Starlink).
- "Show where I am" uses GPS, which works with no service.
- The AccuWeather fallback only exists on the claude.ai copy of the page.

© 2026 Cow Rock Construction, LLC. All rights reserved.
