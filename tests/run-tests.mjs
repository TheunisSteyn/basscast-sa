/* BassCast SA test suite. Needs only Node.js 18 or newer, no installs.

     node tests/run-tests.mjs                     static, security and scoring checks
     node tests/run-tests.mjs --baseline <file>   also compares scoring with an older index.html
     node tests/run-tests.mjs --network           also re-downloads the CDN libraries and checks their hashes
     node tests/run-tests.mjs --write-golden      (maintainers) rewrites tests/fixtures/golden.json

   The scoring check runs the real app.js on saved Open-Meteo answers and compares every day score,
   best window, factor, lure pick and advice line with tests/fixtures/golden.json, which was made from
   the version before the security changes. If you change the scoring on purpose, re-create it with
   --write-golden and say so in your commit. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] || true) : null; };
const read = f => readFileSync(join(ROOT, f), 'utf8');

let pass = 0, fail = 0, skipped = [];
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ok    ' + name); }
  catch (e) { fail++; console.log('  FAIL  ' + name + '\n        ' + String(e && e.message || e).split('\n').join('\n        ')); }
}

/* ---------- run app.js without a browser ----------
   Every DOM lookup returns a harmless stand-in, so the top-level start-up code runs and the
   app's own functions become callable. Only the pure functions are tested here; the page itself
   is tested in a real browser (see tests/README.md). */
function stub() {
  const store = {};
  const p = new Proxy(function () {}, {
    get(t, k) {
      if (k in store) return store[k];
      if (k === Symbol.iterator) return function* () {};
      if (k === Symbol.toPrimitive) return () => '';
      if (k === 'then') return undefined;
      if (k === 'value' || k === 'textContent' || k === 'innerHTML' || k === 'className') return '';
      if (k === 'dataset' || k === 'style') return (store[k] = {});
      if (k === 'hidden' || k === 'checked' || k === 'disabled' || k === 'isConnected') return false;
      if (k === 'length') return 0;
      if (k === 'options' || k === 'children') return [];
      if (k === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
      return stub();
    },
    set(t, k, v) { store[k] = v; return true; },
    apply() { return stub(); },
    construct() { return stub(); }
  });
  return p;
}
function memoryStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    clear: () => m.clear(),
    _map: m
  };
}
const EXPORTS = ['buildContext', 'applyMeasured', 'scoreDayV2', 'pressureTrend', 'buildAdvice', 'regionFor', 'seasonFor',
  'moonInfo', 'solunarFor', 'seasonStage', 'parseWaterInput', 'cleanSettings', 'sanitizeLog', 'esc', 'quality',
  'currentInfluence', 'logs', 'BASE_INFLUENCE', 'FACTOR_KEYS', 'CLARITY', 'getMeasured', 'getClarity', 'loadSpots', 'loadNotes'];
const OPTIONAL = ['cleanForecast', 'readObj', 'cachedForecast'];
function loadApp(source, storageInit) {
  const localStorage = memoryStorage(storageInit);
  const doc = stub();
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    localStorage, document: doc, navigator: { userAgent: 'node', onLine: true }, location: { href: 'http://localhost/', protocol: 'http:', hostname: 'localhost', reload() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0,
    MutationObserver: class { observe() {} disconnect() {} }, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
    Event: class { constructor(t) { this.type = t; } }, Blob: class {}, URL, FileReader: class {}, AbortController,
    fetch: () => Promise.reject(new Error('no network in tests')), Intl, Date, Math, JSON, Number, String, Object, Array, Promise, Error, TypeError, RegExp, Map, Set, Symbol, isNaN, parseFloat, parseInt
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  const names = EXPORTS.concat(OPTIONAL.filter(n => new RegExp('function ' + n + '\\b').test(source)));
  const tail = '\n;globalThis.__app = {' + names.join(',') +
    ', setSettings(o) { Object.assign(settings, o); infCache = null; }, resetInfluence() { infCache = null; } };';
  vm.runInContext(source + tail, ctx, { filename: 'app.js' });
  return { app: ctx.__app, storage: localStorage };
}
function inlineAppScript(html) {
  const start = html.indexOf('<script>\nconst $ = id =>');
  if (start < 0) throw new Error('could not find the inline app script in the baseline file');
  const end = html.indexOf('</script>', start);
  return html.slice(start + '<script>\n'.length, end);
}

/* ---------- the scoring snapshot: everything a user sees that comes out of the maths ---------- */
const FIXTURES = ['open-meteo-theewaterskloof.json', 'open-meteo-hartbeespoort.json'];
function snapshot(app, prepare) {
  const out = {};
  const r1 = x => Math.round(x * 1e6) / 1e6;   // stable across engines; real differences are far bigger
  const norm = v => JSON.parse(JSON.stringify(v, (k, x) => typeof x === 'number' ? r1(x) : x));
  FIXTURES.forEach(name => {
    let data = JSON.parse(read('tests/fixtures/' + name));
    if (prepare) data = prepare(data);
    const lat = name.includes('theewaters') ? -34.05 : -25.73, lon = name.includes('theewaters') ? 19.32 : 27.86;
    const res = {};
    const weightsList = { base: app.BASE_INFLUENCE, tuned: { water: 1.3, light: 0.8, front: 1.1, wind: 0.7, rain: 1.2 } };
    const measuredList = { none: null, measured: { v: 17.5, at: 1761300000000, date: data.daily.time[7] } };
    for (const [mk, m] of Object.entries(measuredList)) {
      const ctx = app.applyMeasured(app.buildContext(data), m);
      for (const [wk, w] of Object.entries(weightsList)) {
        res[mk + '/' + wk] = data.daily.time.map((day, idx) => {
          const r = app.scoreDayV2(data, idx, ctx, w);
          if (!r) return null;
          const hours = r.arr.map(x => [x.score, x.f, x.mods, x.stage.key, x.night, x.tw, x.preF, x.postF]);
          const noon = new Date(day + 'T12:00:00');
          const pm = data.hourly.pressure_msl;
          const deltaP = (r.best.i >= 6 && Number.isFinite(pm[r.best.i]) && Number.isFinite(pm[r.best.i - 6])) ? pm[r.best.i] - pm[r.best.i - 6] : null;
          const clockH = t => { const mm = String(t || '').slice(11, 16).match(/^(\d\d):(\d\d)$/); return mm ? +mm[1] + +mm[2] / 60 : NaN; };
          const advice = {};
          for (const angler of ['both', 'bank', 'boat']) for (const clarity of [null, 'clear', 'slight', 'moderate', 'muddy']) {
            app.setSettings({ angler });
            const c = { region: app.regionFor(lat, lon), season: app.seasonFor(noon), meanTemp: r.water, water: r.water, waterSrc: ctx.waterSrc[day], trend: r.trend,
              stage: r.stage, dayScore: r.dayScore, best: r.best, startH: r.startH, endH: r.endH, deltaP, moon: app.moonInfo(noon), sunriseH: clockH(r.sunrise), sunsetH: clockH(r.sunset), clarity };
            const a = app.buildAdvice(c);
            advice[angler + '/' + clarity] = { summary: a.summary, lures: a.lures.picks, zone: a.lures.zone, sections: a.sections };
          }
          app.setSettings({ angler: 'both' });
          return { day, dayScore: r.dayScore, startH: r.startH, endH: r.endH, best: r.best.i, winFactors: r.winFactors, water: r.water, trend: r.trend,
            stage: r.stage.key, moon: r.moon, hours, pressure: app.pressureTrend(data, r.best.i), advice };
        });
      }
    }
    out[name] = norm(res);
  });
  // learning from the catch log
  return out;
}
const digest = o => createHash('sha256').update(JSON.stringify(o)).digest('hex');
function summary(snap) {
  const s = {};
  for (const [f, v] of Object.entries(snap)) s[f] = v['none/base'].map(d => d && `${d.day} ${d.dayScore} ${d.startH}-${d.endH}`);
  return s;
}

/* ================================ tests ================================ */
const html = read('index.html');
const sw = read('sw.js');
const appSrc = read('app.js');

console.log('\nStatic and deployment checks');
await test('index.html has no inline scripts and no inline event handlers', () => {
  assert.equal((html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) || []).length, 0, 'inline <script> found');
  assert.equal((html.match(/\son[a-z]+\s*=\s*["']/gi) || []).length, 0, 'on...= attribute found');
  const off = read('offline.html');
  assert.equal((off.match(/<script(?![^>]*\bsrc=)[^>]*>/g) || []).length, 0, 'inline <script> in offline.html');
  assert.equal((off.match(/\son[a-z]+\s*=\s*["']/gi) || []).length, 0, 'on...= attribute in offline.html');
});
await test('Content-Security-Policy comes before every script and stylesheet', () => {
  const csp = html.indexOf('http-equiv="Content-Security-Policy"');
  assert.ok(csp > 0, 'no CSP meta tag');
  const firstRes = Math.min(...[html.indexOf('<script'), html.indexOf('<link rel="stylesheet"'), html.indexOf('<style')].filter(i => i >= 0));
  assert.ok(csp < firstRes, 'CSP must be above the first script or stylesheet');
  const policy = html.slice(csp).match(/content="([^"]+)"/)[1];
  assert.ok(!/script-src[^;]*'unsafe-(inline|eval)'/.test(policy), 'script-src must not allow unsafe-inline or unsafe-eval');
  assert.ok(/object-src 'none'/.test(policy) && /base-uri 'self'/.test(policy), 'object-src and base-uri locked down');
  for (const host of ['https://api.open-meteo.com', 'https://tiles.openfreemap.org', 'https://server.arcgisonline.com']) assert.ok(policy.includes(host), 'CSP is missing ' + host);
});
await test('every CDN file has integrity, and the hashes match sw.js', () => {
  const tags = [...html.matchAll(/<(script|link)[^>]+(?:src|href)="(https:\/\/unpkg\.com\/[^"]+)"[^>]*>/g)];
  assert.equal(tags.length, 5, 'expected 5 unpkg files');
  for (const t of tags) {
    const m = t[0].match(/integrity="(sha384-[^"]+)"/);
    assert.ok(m, 'no integrity on ' + t[2]);
    assert.ok(/crossorigin/.test(t[0]), 'integrity needs crossorigin on ' + t[2]);
    assert.ok(sw.includes(`'${t[2]}': '${m[1]}'`), 'sw.js LIB_INTEGRITY does not match ' + t[2]);
  }
});
await test('maplibre-loader.js imports the preloaded file and checks the worker hash from sw.js', () => {
  const loader = read('maplibre-loader.js');
  const imp = loader.match(/^import \* as maplibregl from '(https:\/\/unpkg\.com\/[^']+)';$/m);
  assert.ok(imp, 'loader import not found');
  assert.ok(new RegExp(`<link rel="modulepreload" href="${imp[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" integrity="sha384-`).test(html),
    'the import must have a modulepreload with integrity in index.html, or its hash is never checked');
  const worker = loader.match(/const WORKER = '([^']+)'/)[1], hash = loader.match(/const WORKER_INTEGRITY = '([^']+)'/)[1];
  assert.ok(sw.includes(`'${worker}': '${hash}'`), 'sw.js LIB_INTEGRITY does not match the worker in maplibre-loader.js');
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.ok(/connect-src[^;]*/.exec(policy)[0].split(' ').includes(worker), 'CSP connect-src must allow the worker file');
  assert.ok(/worker-src[^;]*\bblob:/.test(policy), 'CSP worker-src must allow blob: for the MapLibre worker');
  const order = ['src="maplibre-loader.js"', 'leaflet-maplibre-gl.js"', 'src="app.js"'].map(s => html.indexOf(s));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), 'loader, plugin and app.js must come in that order');
  assert.ok(/<script type="module" src="maplibre-loader\.js">/.test(html), 'loader must be a module script');
  assert.ok(/leaflet-maplibre-gl\.js"[^>]*\bdefer\b/.test(html) && /src="app\.js" defer/.test(html), 'plugin and app.js must be deferred so they run after the loader');
});
await test('every local file the page needs is pre-cached by the service worker, and exists', () => {
  const shell = [...sw.matchAll(/'\.\/([^']*)'/g)].map(m => m[1]).filter(Boolean);
  const local = [...html.matchAll(/(?:src|href)="(?!https?:|#|data:)([^"]+)"/g)].map(m => m[1]);
  for (const f of new Set(local)) assert.ok(shell.includes(f), f + ' is used by index.html but not in the SHELL list in sw.js');
  for (const f of shell) assert.ok(existsSync(join(ROOT, f)), 'sw.js pre-caches ' + f + ' but the file is missing');
  assert.ok(shell.includes('offline.js'), 'offline.js must be cached for the offline page');
});
await test('no secrets or keys in the code', () => {
  const all = [html, appSrc, sw, read('pwa.js'), read('manifest.webmanifest')].join('\n');
  assert.ok(!/(api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]{8,}/i.test(all), 'something that looks like a secret was found');
  assert.ok(!/http:\/\/(?!www\.w3\.org)/.test(all.replace(/http:\/\/localhost|http:\/\/127\.0\.0\.1/g, '')), 'plain http:// URL found');
});

console.log('\nScoring is unchanged');
const golden = existsSync(join(ROOT, 'tests/fixtures/golden.json')) ? JSON.parse(read('tests/fixtures/golden.json')) : null;
const current = loadApp(appSrc);
const snapNow = snapshot(current.app);
if (opt('--write-golden')) {
  const baselineFile = opt('--baseline');
  const src = baselineFile ? inlineAppScript(readFileSync(baselineFile, 'utf8')) : appSrc;
  const s = snapshot(loadApp(src).app);
  writeFileSync(join(ROOT, 'tests/fixtures/golden.json'), JSON.stringify({ made: new Date().toISOString(), from: baselineFile ? 'baseline index.html' : 'app.js', sha256: digest(s), summary: summary(s) }, null, 2) + '\n');
  console.log('  wrote tests/fixtures/golden.json from ' + (baselineFile || 'app.js'));
}
await test('day scores, windows, factors, lures and advice match the saved snapshot', () => {
  const g = JSON.parse(read('tests/fixtures/golden.json'));
  assert.deepEqual(summary(snapNow), g.summary, 'day scores or best windows changed');
  assert.equal(digest(snapNow), g.sha256, 'some hourly score, factor, lure or advice text changed');
});
if (opt('--baseline') && opt('--baseline') !== true) {
  await test('scoring matches the baseline index.html line for line', () => {
    const base = snapshot(loadApp(inlineAppScript(readFileSync(opt('--baseline'), 'utf8'))).app);
    assert.deepEqual(snapNow, base);
  });
} else skipped.push('comparison with a baseline file (pass --baseline <old index.html>)');
await test('cleaning a real Open-Meteo answer does not change any result', () => {
  assert.ok(current.app.cleanForecast, 'cleanForecast missing');
  const viaClean = snapshot(current.app, d => current.app.cleanForecast(d));
  assert.equal(digest(viaClean), digest(snapNow));
});
await test('learning from the catch log gives the same weights', () => {
  const rows = [];
  for (let k = 0; k < 24; k++) rows.push({ date: '2026-10-' + String(1 + (k % 28)).padStart(2, '0'), spot: 'x', count: (k * 7) % 5, hours: 2 + (k % 3),
    score: 40 + k, factors: { water: 30 + (k * 13) % 60, light: 40 + (k * 7) % 50, front: 50 + (k * 3) % 40, wind: 60 + (k * 11) % 30, rain: 70 + (k * 5) % 25 } });
  const store = { basscastLogs: JSON.stringify(rows) };
  const a = loadApp(appSrc, store).app.currentInfluence();
  const g = JSON.parse(read('tests/fixtures/golden.json'));
  if (!g.influence) { g.influence = a; if (opt('--write-golden')) writeFileSync(join(ROOT, 'tests/fixtures/golden.json'), JSON.stringify(g, null, 2) + '\n'); }
  if (opt('--baseline') && opt('--baseline') !== true) {
    const b = loadApp(inlineAppScript(readFileSync(opt('--baseline'), 'utf8')), store).app.currentInfluence();
    assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  }
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(g.influence)));
});

console.log('\nUntrusted forecast data');
const C = current.app.cleanForecast;
const fx = JSON.parse(read('tests/fixtures/' + FIXTURES[0]));
await test('rejects HTML or script in dates and times', () => {
  const P = 'x"><img src=x onerror=alert(1)>';
  assert.equal(C({ ...fx, daily: { ...fx.daily, time: [P] } }), null);
  assert.equal(C({ ...fx, hourly: { ...fx.hourly, time: fx.hourly.time.map((t, i) => i ? t : P) } }), null);
});
await test('rejects malformed shapes without throwing', () => {
  for (const bad of [null, undefined, 1, 'x', [], {}, { hourly: {} }, { hourly: { time: [] }, daily: { time: [] } }, { hourly: { time: 'a' }, daily: { time: 'b' } },
    { hourly: { time: [1, 2] }, daily: { time: ['2026-01-01'] } }, { hourly: { time: new Array(5000).fill('2026-01-01T00:00') }, daily: { time: ['2026-01-01'] } }]) {
    assert.equal(C(bad), null, 'accepted ' + String(JSON.stringify(bad)).slice(0, 60));
  }
});
await test('keeps numbers and gaps, drops text pretending to be a reading', () => {
  const d = C({ ...fx, hourly: { ...fx.hourly, cloud_cover: fx.hourly.cloud_cover.map((v, i) => i === 0 ? '<b>50</b>' : i === 1 ? null : v) } });
  assert.equal(d.hourly.cloud_cover[0], undefined);
  assert.equal(d.hourly.cloud_cover[1], null);
  assert.equal(d.hourly.cloud_cover[2], fx.hourly.cloud_cover[2]);
});
await test('bad sunrise text and a bad time zone are dropped', () => {
  const d = C({ ...fx, timezone: '<script>', daily: { ...fx.daily, sunrise: fx.daily.sunrise.map((v, i) => i ? v : '<img>') } });
  assert.equal(d.timezone, undefined);
  assert.equal(d.daily.sunrise[0], null);
  assert.equal(d.daily.sunrise[1], fx.daily.sunrise[1]);
});
await test('a tampered saved forecast is ignored', () => {
  const { app } = loadApp(appSrc, { basscastForecast: JSON.stringify({ lat: -34.05, lon: 19.32, savedAt: 1, data: { hourly: { time: ['<x>'] }, daily: { time: ['<x>'] } } }) });
  assert.equal(app.cachedForecast(-34.05, 19.32), null);
  const ok = loadApp(appSrc, { basscastForecast: JSON.stringify({ lat: -34.05, lon: 19.32, savedAt: 1, data: fx }) }).app.cachedForecast(-34.05, 19.32);
  assert.ok(ok && ok.data.hourly.time.length === fx.hourly.time.length);
});

console.log('\nCorrupted or hostile data on this device');
const junk = ['null', '5', '"text"', '[]', '{}', '[null,5,"x",[]]', '{"__proto__":{"polluted":1}}', 'not json{', '{"a":null}'];
await test('the app starts with any key holding junk', () => {
  for (const key of ['basscastLogs', 'basscastSpots', 'basscastNotes', 'basscastSettings', 'basscastWater', 'basscastClarity', 'basscastTips', 'basscastRecent', 'basscastForecast', 'basscastBackupAt']) {
    for (const v of junk) {
      try { loadApp(appSrc, { [key]: v }); } catch (e) { throw new Error(`start-up failed with ${key}=${v}: ${e.message}`); }
    }
  }
  assert.equal(({}).polluted, undefined, 'Object prototype was polluted');
});
await test('damaged catch log entries are skipped, good ones kept', () => {
  const { app } = loadApp(appSrc, { basscastLogs: JSON.stringify([null, 5, 'x', [], { date: '2026-10-01', count: 3 }]) });
  assert.equal(app.logs().length, 1);
  assert.equal(app.logs()[0].count, 3);
});
await test('settings only accept known values', () => {
  const s = current.app.cleanSettings({ wind: '<img>', theme: 'dark', home: 'x'.repeat(500), motion: 'yes', learn: false, layer: 'javascript:alert(1)' });
  assert.equal(s.wind, 'kmh'); assert.equal(s.theme, 'dark'); assert.equal(s.home, ''); assert.equal(s.motion, false); assert.equal(s.learn, false); assert.equal(s.layer, 'Hybrid'); // default layer is Hybrid since the 2026.10.27 redesign
});
await test('restored sessions are trimmed and typed', () => {
  const r = current.app.sanitizeLog({ date: '2026-10-01', spot: '<b>' + 'x'.repeat(500), count: '7', hours: 'abc', lure: 'y'.repeat(900), score: 900, tech: '<script>', period: 'midnight', spotKey: 'x:evil', factors: { water: 'a' } });
  assert.equal(r.spot.length, 80); assert.equal(r.lure.length, 200); assert.equal(r.count, 7); assert.equal(r.hours, null);
  assert.equal(r.score, 100); assert.equal(r.tech, null); assert.equal(r.period, null); assert.equal(r.spotKey, null); assert.equal(r.factors, null);
  assert.equal(current.app.sanitizeLog({ date: '<x>' }), null);
});
await test('measured water temperature input is validated', () => {
  const p = current.app.parseWaterInput;
  assert.equal(p('18,5').v, 18.5); assert.ok(p('').err); assert.ok(p('<b>1</b>').err); assert.ok(p('1e3').err); assert.ok(p('-1').err); assert.ok(p('41').err); assert.ok(p('NaN').err);
});
await test('esc() neutralises every HTML-special character', () => {
  assert.equal(current.app.esc(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
});

if (opt('--network')) {
  console.log('\nCDN integrity (network)');
  const want = Object.fromEntries([...sw.matchAll(/'(https:\/\/unpkg\.com\/[^']+)': '(sha384-[^']+)'/g)].map(m => [m[1], m[2]]));
  for (const [url, sri] of Object.entries(want)) {
    await test('unpkg serves the expected bytes for ' + url.replace('https://unpkg.com/', ''), async () => {
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      assert.equal('sha384-' + createHash('sha384').update(buf).digest('base64'), sri);
    });
  }
} else skipped.push('CDN hash check (pass --network)');

console.log(`\n${pass} passed, ${fail} failed` + (skipped.length ? `\nSkipped: ${skipped.join('; ')}` : ''));
process.exit(fail ? 1 : 0);
