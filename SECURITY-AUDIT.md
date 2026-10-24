# BassCast SA security audit and hardening, 24 October 2026

## 1. Overall assessment

**Before:** For a static app, BassCast was already careful. It has no secrets, no accounts and no back end. It uses HTTPS everywhere, escapes nearly all text with `esc()`, validates settings and restored backups, and puts a timeout on the weather request. The weaknesses were in the layers around that care:

- One place built HTML from weather data without escaping it.
- There was no Content Security Policy, so any injection that slipped through would run with full control of the page.
- The five CDN libraries had no integrity checks.
- One damaged entry in browser storage could stop the whole app from starting.

**After:** Each weakness above is fixed, and two layers now sit behind the code fixes:

- A strict script policy blocks inline code and every unpkg package except the three pinned ones.
- The browser refuses any CDN file that does not match its recorded hash.

Every fix was shown to work against the attack that succeeded on the original. The fishing logic is unchanged: an automated comparison gives byte-identical results on real Open-Meteo data. The app is not immune to attack. The remaining risks are in section 5.

## 2. Vulnerabilities found

| # | Severity | Status | Issue |
|---|---|---|---|
| 1 | Medium | Confirmed, fixed | DOM-based XSS from forecast data in the 7-day strip |
| 2 | Medium | Confirmed, fixed | No Content Security Policy |
| 3 | Medium | Confirmed, fixed | CDN libraries loaded without Subresource Integrity |
| 4 | Medium (availability) | Confirmed, fixed | One corrupted storage entry stops the app starting |
| 5 | Low (dependency) | Confirmed advisory (was not reachable), **fixed** by upgrading to 6.15.0 | MapLibre GL 5.24.0 is affected by GHSA-jrc7-96c5-q579 |
| 6 | Low (data integrity) | Confirmed, fixed | Switching spots quickly can show one dam's forecast under another dam's name |
| 7 | Low | Confirmed, fixed | Catch log text had no length limits |
| 8 | Low | Fixed | Service worker cached CDN files without checking them, and could pair a new page with old scripts |

### 1. DOM XSS through forecast data (Medium)

- **File:** `app.js` `renderWeek()` (inline in `index.html` before).
- **What was wrong:** Each day button was built as `data-day="${day}"`, with the day string taken unescaped from the Open-Meteo answer or from the copy saved in `localStorage`.
- **Realistic attack:** Two routes lead here:
  - **The weather service itself:** a compromised Open-Meteo, or anything able to tamper with its answer, can return a "date" that contains markup.
  - **Any page on the same origin:** `theunissteyn.github.io` is shared by every GitHub Pages site under that account, so such a page can write a poisoned forecast into `basscastForecast`.

  The next time the app falls back to the saved forecast, the markup runs as script.
- **Proof:** On the original, a poisoned cache set `window.__pwn = 1` through an `<img onerror>`.
- **Fix:**
  - `cleanForecast()` checks every forecast, fresh or saved. Days and hours must be ISO dates and times, readings must be numbers or empty, sizes are capped, and only the fields the app uses are kept.
  - `renderWeek` also escapes the value.
  - The CSP blocks inline handlers anyway.
- **Verified:** Both attack routes were blocked in the browser. The app shows "Open-Meteo returned a forecast this app could not read." The test suite confirms real Open-Meteo answers pass through unchanged.

### 2. No Content Security Policy (Medium)

- **File:** `index.html`, `offline.html`.
- **What was wrong:** Any HTML injection, now or from a future change, could run code. Allowing all of `unpkg.com` would have been a bypass, because unpkg serves every npm package.
- **Fix:**
  - All inline scripts were moved, byte for byte, into `theme.js`, `app.js`, `effects.js` and `offline.js`, and the one `onclick` became a listener.
  - A `<meta>` CSP was added. Scripts may only come from this site and the three exact library folders. `object-src`, `frame-src` and `base-uri` are locked down. `connect-src` allows only Open-Meteo and OpenFreeMap.
- **Verified:** Injected `<script>`, inline `onerror`, dynamically inserted inline scripts and a script from another unpkg package (lodash) were all blocked. The map, all four layers, fonts, the forecast, sharing and the install card produced no CSP violations.

### 3. No Subresource Integrity on CDN files (Medium)

- **File:** `index.html`, `sw.js`.
- **Attack:** If unpkg or the npm packages were compromised, attacker code would run in the app.
- **Fix:**
  - All five files now have `sha384` `integrity` attributes.
  - Leaflet's hashes match the values Leaflet publishes.
  - The service worker fetches and caches these files with the same hashes, so a tampered file is never stored for offline use.
- **Verified:** `node tests/run-tests.mjs --network` re-downloads all five files and confirms the hashes.

### 4. Corrupted storage stops the app (Medium, availability)

- **File:** `app.js` `logs()`, plus the water temperature, clarity and tips storage.
- **What was wrong:** `basscastLogs` = `[null]` threw during start-up. The rest of the script never ran, so the spot picker, Settings, sharing, tips and recent spots were all dead.
- **How it can happen:** Browser storage damage, a manual edit, or another page on the shared origin.
- **Fix:**
  - `logs()` skips anything that is not a session record.
  - A `readObj()` helper makes the water, clarity and tips keys read any wrong shape as empty.
  - Notes only load text into the notes box.
- **Verified:**
  - In the browser, junk in eight keys at once still gave a full start, and the home spot, units, measured temperature and clarity all saved.
  - The test suite starts the app with nine kinds of junk in each of the ten storage keys.

### 5. MapLibre GL 5.24.0 advisory (Low as configured)

- **Advisory:** `npm audit` reports GHSA-jrc7-96c5-q579 (critical, CVSS 10), a sanitizer bypass in MapLibre's attribution control. Versions up to 6.4.0 are affected.
- **Why it is not reachable:** The Leaflet plugin creates MapLibre with `attributionControl: false`. Because BassCast passes its own fixed `customAttribution`, no attribution text from the tile server is ever displayed.
- **First fix:** A comment in `initMap` warns against removing `customAttribution`. Without it, the plugin would copy the tile server's attribution strings into Leaflet unsanitised.
- **Fixed (later on 24 October 2026):** MapLibre was upgraded to **6.15.0**, the latest release; the fix landed in 6.4.1. `npm audit` on `maplibre-gl@6.15.0`, `@maplibre/maplibre-gl-leaflet@0.1.4` and `leaflet@1.9.4` reports 0 vulnerabilities. The plugin stays at 0.1.4, whose peer range includes `^6`.
  - **Loading:** MapLibre 6 is an ES module only. The new `maplibre-loader.js` (`type="module"`) imports it and sets the global `maplibregl`. The plugin, `app.js` and `effects.js` are now `defer`, so the browser runs them after the loader, in page order. There is still no build step.
  - **Integrity:** A `<link rel="modulepreload" integrity>` checks the main `.mjs` file, and the loader's import reuses that checked copy. MapLibre would otherwise load its worker from unpkg with no hash check. So the loader fetches `maplibre-gl-worker.mjs` with its `sha384` hash and hands MapLibre a local `blob:` copy (`setWorkerUrl`). All three new files are in `LIB_INTEGRITY` in `sw.js`, and the cache version is `v3-2026-10-24`.
  - **CSP:** `script-src` and `style-src` now pin `maplibre-gl@6.15.0/`. `connect-src` adds only the worker file. `worker-src 'self' blob:` already covered the blob worker, so it is unchanged.
  - **WebGL2:** MapLibre 6 needs WebGL2, and its `Map` constructor throws `GPUInitializationError` instead of firing an error event. Before this change, that error would have reached `initMap`'s outer `catch` and removed the whole map. Now `initMap` checks for WebGL2 only and catches the error inside the layer. It also waits for the worker before showing the vector map. In each failure case it switches to the Esri street map.
  - **Verified:**
    - `node tests/run-tests.mjs --network`: 26 passed, 0 failed. A new test keeps the loader, the preload, `sw.js` and the CSP in step.
    - In the browser, with and without the service worker, the following showed no CSP violations: the vector map, all four layers, dam pins, and dropping and saving a pin.
    - Three simulated failures each fell back to the Esri street map with every pin: no WebGL2, a real `GPUInitializationError`, and a blocked worker download.
    - An offline start with the server stopped loaded the app and MapLibre 6 from the cache.

### 6. Out-of-order forecasts (Low)

- **File:** `app.js` `load()`.
- **Proof:** On the original, choosing Theewaterskloof and then Hartbeespoort with a slow first answer showed "Hartbeespoort Dam" over Theewaterskloof's forecast.
- **Fix:** Each load gets a sequence number, and older answers are dropped.
- **Verified:** The same test now shows Hartbeespoort's own forecast, and Refresh re-enables correctly.

### 7. Catch log length limits (Low)

- **Fix:** Spot is limited to 80 characters and lure or notes to 200, both in the HTML and in `saveCatch`. The count is capped at 9999. These are the same limits a restored backup already enforced.

### 8. Service worker caching (Low)

- **Fix:**
  - CDN files are cached only if their integrity check passes.
  - The app's own scripts now come from the network first, just like the page, and both ask the server for changes (`cache: 'no-cache'`). A new page is never run with an older `app.js`.
  - The cache version was bumped to `v2-2026-10-24`.
- **Verified:** A simulated upgrade from the deployed v1 to this version was tested. User data survived, the v1 caches were removed, and a later `app.js` change took effect on the first reload.

### Checked and found sound

The following were checked and not changed:

- No secrets, API keys or `http://` resources.
- No `eval`, `new Function` or `document.write`.
- No open redirects.
- No prototype pollution: storage keys are constrained, and a `__proto__` key in a restored backup was tested.
- External links use `rel="noopener"`.
- Location is only requested on a tap.
- Coordinates are never put in the page URL.
- Restoring a backup checks the size, the app marker, spot ids, note keys and each session.
- The manifest has nothing sensitive.

## 3. Files modified

| File | Change |
|---|---|
| `index.html` | Adds the CSP and referrer meta tags and SRI on five CDN tags, replaces the three inline scripts with `<script src>`, and adds `maxlength` to two catch log fields. |
| `app.js` (new) | The main inline script, moved verbatim, plus these fixes: `cleanForecast`, `readObj`, the forecast sequence guard, the `logs()` filter, escaping in `renderWeek`, catch log limits, a cap on the error text, and the attribution comment. |
| `theme.js`, `effects.js` (new) | The other two inline scripts, moved verbatim. |
| `offline.html`, `offline.js` (new) | Adds a CSP and replaces the inline `onclick` and inline script with a file. |
| `sw.js` | New version, new files in the pre-cache, integrity-checked library caching, network-first scripts, and revalidated navigations with preload off. |
| `tests/run-tests.mjs`, `tests/fixtures/*` (new) | Automated test suite, two real Open-Meteo answers, and a golden snapshot of the scoring taken from the original code. |

`pwa.js`, `pwa.css`, `manifest.webmanifest` and the icons are unchanged.

## 4. Functionality verification

**Automated:** Command: `node tests/run-tests.mjs --baseline <old index.html> --network`. Result: **25 passed, 0 failed.**

- Every day score, best window, hourly score, factor, lure pick and advice line matches the original code on two real forecasts. That covers both regions, 5 clarities, 3 angler types, with and without a measured water temperature, and with default and catch-log-tuned weights.
- Catch-log learning weights are identical.
- A mutation test confirmed the suite fails if a single scoring weight changes by 0.01.

**In the browser** (local server, plus the app installed from the original version and then upgraded):

| Feature | Result |
|---|---|
| Dam selection, spot picker, recent spots, home spot | Pass |
| Interactive map: vector map, Terrain, Satellite, Hybrid, dam pins, dropping and saving a pin | Pass |
| Weather fetch, pressure gauge and 6/24/48 h trend, moon strip and solunar times | Pass |
| Score (62 for Theewaterskloof today, same as the original), best window, 7-day strip, hour bars | Pass |
| Water temperature estimate and measured entry, clarity, baits and techniques | Pass |
| Catch log save and remove, summaries, backup restore | Pass |
| Settings: units, theme, angler type | Pass |
| Share card | Pass |
| Mobile width (375 px): no horizontal scroll | Pass |
| Offline: server stopped, app opened from the service worker cache with the saved forecast | Pass |
| Update from the deployed v1 service worker | Pass |
| Install card shows | Pass |
| The browser's own install dialog | **Not tested.** It needs a real HTTPS origin and user gesture. Check it after deploying. |
| Real phones (iOS Safari, Android Chrome) | **Not tested.** Check after deploying. |

Already present in the original and not changed: on a 375 px screen the Refresh icon pokes a few pixels past the edge of the forecast card.

## 5. Remaining risks (limits of static hosting)

- **Shared origin.** `localStorage`, caches and service workers belong to `https://theunissteyn.github.io`, which every Pages site of that account shares. A page in another repository could read or alter BassCast's spots, notes and log. The app now survives hostile data, but it cannot hide its data. The fix is free: give BassCast its own custom domain or subdomain.
- **Meta-tag CSP limits.** GitHub Pages cannot send headers, so the policy has these gaps:
  - No `frame-ancestors`: the app can be framed, so clickjacking is possible. The only destructive action, Delete everything, needs two taps.
  - No violation reporting.
  - It does not apply to anything placed above it in `<head>`.

  To get real headers on free infrastructure, put the custom domain behind Cloudflare's free plan and set the CSP, `frame-ancestors 'none'` and `X-Content-Type-Options` there.
- **Inline styles allowed.** The policy permits `style-src 'unsafe-inline'` because the app and Leaflet set inline styles. The risk is low, since styles cannot run script.
- **Google Fonts.** The font stylesheet cannot carry an integrity hash because Google tailors it to each browser.
- **Third-party data.** Weather values and map tiles are trusted for content. They can be wrong, but they can no longer inject code.
- **Data on the device.** Spots, notes and logs are stored unencrypted in the browser. Anyone with access to the device or browser profile can read them. No sensitive personal data is stored.
- **MapLibre 6 module loading** (see #5). Browsers without `modulepreload` (Safari before 17, Firefox before 115) would import MapLibre with no hash check. Browsers without module support skip the vector map and show the Esri map.

## 6. Deployment to GitHub Pages

1. Run `node tests/run-tests.mjs` and confirm `0 failed`.
2. Upload or commit **all** of these together, in one commit:
   - `index.html`, `app.js`, `theme.js`, `effects.js`, `maplibre-loader.js`
   - `offline.html`, `offline.js`
   - `sw.js`
   - `tests/` (optional, harmless to publish)

   Deploying `index.html` without the new `.js` files leaves a blank app.
3. Wait for the Pages build to finish, then open the site and check:
   - The forecast loads.
   - The map shows.
   - DevTools → Console shows no "Content Security Policy" errors.
   - Application → Service Workers shows `sw.js` active, and Cache Storage shows `basscast-*-v3-2026-10-24`.
4. On a phone that has the app installed, open it twice. The first open may still show the previous version; the second runs the new one.
5. **Future releases:** change `VERSION` in `sw.js` whenever any cached file changes, and run the tests.
   - If you add a new external service, add its address to the CSP or the browser will block it.
   - If you change a library version, update its `integrity` in `index.html` **and** `LIB_INTEGRITY` in `sw.js`. The tests check that they match.

## 7. Rollback

A full copy of the pre-change app is at `C:\Users\theunis.steyn\Desktop\basscast-sa-pwa-backup-2026-10-24`.

1. Delete the new files (`app.js`, `theme.js`, `effects.js`, `offline.js`, `tests/`), copy the backup's files over the site, and deploy. With git, revert the hardening commit instead.
2. Restoring the backup's `sw.js` is enough to roll installed copies back. Any byte change makes browsers install that worker, and its start-up deletes the v2 caches. To be extra safe, set its `VERSION` to something new such as `v3-rollback`.
3. Nothing in the user data format changed, so spots, notes, sessions and settings survive in both directions.
