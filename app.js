const $ = id => document.getElementById(id);

/* ---------- settings (stored on this device) ---------- */
const APP_VERSION = '2026.10.27';
const SETTINGS_KEY = 'basscastSettings';
const SETTING_CHOICES = {
  wind: ['kmh', 'kn', 'ms'],
  angler: ['both', 'bank', 'boat'],
  theme: ['auto', 'light', 'dark'],
  layer: ['Map', 'Terrain', 'Satellite', 'Hybrid']
};
const SETTING_DEFAULTS = { wind: 'kmh', angler: 'both', theme: 'auto', layer: 'Hybrid', home: '', motion: false, tips: true, learn: true };
function cleanSettings(o) {
  const out = Object.assign({}, SETTING_DEFAULTS);
  if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
  Object.keys(SETTING_CHOICES).forEach(k => { if (SETTING_CHOICES[k].includes(o[k])) out[k] = o[k]; });
  if (typeof o.home === 'string' && /^([ds]:.{1,60})?$/.test(o.home)) out.home = o.home;
  if (typeof o.motion === 'boolean') out.motion = o.motion;
  if (typeof o.tips === 'boolean') out.tips = o.tips;
  if (typeof o.learn === 'boolean') out.learn = o.learn;
  return out;
}
let settings = (() => { try { return cleanSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { return cleanSettings(null); } })();
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true; } catch { return false; } }
// Redesign (2026.10.27): the Map tab now opens on Hybrid. Anyone still on the old "Map" default is
// moved across once; choosing "Map" again in Settings afterwards sticks.
(function () {
  try {
    if (localStorage.getItem('basscastLayerV2')) return;
    if (settings.layer === 'Map') { settings.layer = 'Hybrid'; saveSettings(); }
    localStorage.setItem('basscastLayerV2', '1');
  } catch (e) {}
})();

const WIND_UNITS = { kmh: { f: 1, u: 'km/h' }, kn: { f: 1 / 1.852, u: 'kn' }, ms: { f: 1 / 3.6, u: 'm/s' } };
function windNum(kmh) {
  const v = safeNum(kmh) * (WIND_UNITS[settings.wind] || WIND_UNITS.kmh).f;
  return settings.wind === 'ms' ? String(Math.round(v * 10) / 10) : String(Math.round(v));
}
function fmtWind(kmh) { return windNum(kmh) + ' ' + (WIND_UNITS[settings.wind] || WIND_UNITS.kmh).u; }

const darkQuery = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
function applyTheme() {
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && !!(darkQuery && darkQuery.matches));
  document.documentElement.classList.toggle('dark', dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0B1418' : '#EEF3F5');
}
if (darkQuery) {
  const onScheme = () => { if (settings.theme === 'auto') applyTheme(); };
  if (darkQuery.addEventListener) darkQuery.addEventListener('change', onScheme); else if (darkQuery.addListener) darkQuery.addListener(onScheme);
}
function applyMotion() { document.documentElement.classList.toggle('reduce-motion', !!settings.motion); }
const motionOff = () => document.documentElement.classList.contains('reduce-motion') ||
  !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
applyTheme();
applyMotion();

function seasonFor(d) {
  const m = d.getMonth() + 1;
  return [12, 1, 2].includes(m) ? 'Summer'
    : [3, 4, 5].includes(m) ? 'Autumn'
    : [6, 7, 8].includes(m) ? 'Winter'
    : 'Spring';
}

const MOON_PHASES = [
  { key: 'New moon', short: 'New' },
  { key: 'Waxing crescent', short: 'Waxing<br>crescent' },
  { key: 'First quarter', short: 'First<br>quarter' },
  { key: 'Waxing gibbous', short: 'Waxing<br>gibbous' },
  { key: 'Full moon', short: 'Full' },
  { key: 'Waning gibbous', short: 'Waning<br>gibbous' },
  { key: 'Last quarter', short: 'Last<br>quarter' },
  { key: 'Waning crescent', short: 'Waning<br>crescent' }
];

function moonInfo(d) {
  const syn = 29.530588853;
  const known = Date.UTC(2000, 0, 6, 18, 14);
  const days = (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - known) / 86400000;
  const age = ((days % syn) + syn) % syn;
  const illum = Math.round((1 - Math.cos(2 * Math.PI * age / syn)) / 2 * 100);
  let phase = 'Waning crescent';
  if (age < 1.85) phase = 'New moon';
  else if (age < 5.53) phase = 'Waxing crescent';
  else if (age < 9.22) phase = 'First quarter';
  else if (age < 12.91) phase = 'Waxing gibbous';
  else if (age < 16.61) phase = 'Full moon';
  else if (age < 20.3) phase = 'Waning gibbous';
  else if (age < 23.99) phase = 'Last quarter';
  let index = MOON_PHASES.findIndex(function(p){ return p.key === phase; });
  if (index < 0) index = 0;
  return { phase: phase, illum: illum, age: age, index: index };
}

function moonIconSvg(phase) {
  var ink = '#12262E';
  var mist = '#EDF1EF';
  var base = '<circle class="m-d" cx="14" cy="14" r="11" fill="' + ink + '"/>';
  var parts = {
    'New moon': '',
    'Waxing crescent': '<path d="M14 3a11 11 0 0 1 0 22 7 11 0 0 0 0-22z" class="m-l" fill="' + mist + '"/>',
    'First quarter': '<path d="M14 3a11 11 0 0 1 0 22z" class="m-l" fill="' + mist + '"/>',
    'Waxing gibbous': '<path d="M14 3a11 11 0 1 1 0 22 4 11 0 0 0 0-22z" class="m-l" fill="' + mist + '"/>',
    'Full moon': '<circle class="m-l" cx="14" cy="14" r="11" fill="' + mist + '"/>',
    'Waning gibbous': '<path d="M14 3a11 11 0 1 0 0 22 4 11 0 0 1 0-22z" class="m-l" fill="' + mist + '"/>',
    'Last quarter': '<path d="M14 3a11 11 0 0 0 0 22z" class="m-l" fill="' + mist + '"/>',
    'Waning crescent': '<path d="M14 3a11 11 0 0 0 0 22 7 11 0 0 1 0-22z" class="m-l" fill="' + mist + '"/>'
  };
  return '<svg viewBox="0 0 28 28" aria-hidden="true">' + base + (parts[phase] || '') + '</svg>';
}

function renderMoonStrip(moon) {
  var box = document.getElementById('moonStrip');
  var meta = document.getElementById('moonMeta');
  if (!box || !moon) return;
  box.innerHTML = MOON_PHASES.map(function(p, i) {
    var on = i === moon.index;
    return '<div class="mooncell' + (on ? ' on' : '') + '" role="listitem"' + (on ? ' aria-current="true"' : '') + '>' +
      moonIconSvg(p.key) +
      '<div class="mn">' + p.short + '</div>' +
      '<div class="dot" aria-hidden="true"></div></div>';
  }).join('');
  if (meta) meta.textContent = moon.phase + ', ' + moon.illum + '% lit.';
}

function updatePressureGauge(hPa, deltaP) {
  var needle = document.getElementById('pressureNeedle');
  var valEl = document.getElementById('pressureVal');
  var tag = document.getElementById('pressureTag');
  var note = document.getElementById('pressureNote');
  var bar = document.getElementById('pressureBar');
  if (!needle || !valEl) {
    console.warn('pressure gauge elements missing');
    return;
  }
  var lo = 990, hi = 1035;
  var p = Number(hPa);
  if (!Number.isFinite(p)) p = 1013;
  if (p < lo) p = lo;
  if (p > hi) p = hi;
  var pct = ((p - lo) / (hi - lo)) * 100;
  if (pct < 4) pct = 4;
  if (pct > 96) pct = 96;
  needle.style.left = pct + '%';
  valEl.textContent = Math.round(Number(hPa) || p) + ' hPa';
  var kind = 'steady', label = 'Steady';
  var text = 'Pressure is fairly steady. Fish should follow normal light and temperature patterns.';
  if (deltaP != null && Number.isFinite(deltaP)) {
    if (deltaP <= -4) {
      kind = 'fall'; label = 'Falling fast';
      text = 'Pressure is dropping quickly (often ahead of a front). Bass frequently feed more actively — cover water with reaction baits and expect changing conditions.';
    } else if (deltaP <= -1.5) {
      kind = 'fall'; label = 'Falling';
      text = 'Pressure is falling. Many anglers see a better bite with moving baits along banks and cover.';
    } else if (deltaP >= 4) {
      kind = 'rise'; label = 'Rising fast';
      text = 'Pressure is climbing sharply (common after a front). Fish often tighten to cover and get fussy — slow down, downsize and fish close to structure.';
    } else if (deltaP >= 1.5) {
      kind = 'rise'; label = 'Rising';
      text = 'Pressure is rising. The bite may be tougher at first and improve as conditions settle.';
    } else {
      text = 'Pressure change is small. Rely more on light levels, wind and the best window than on the barometer.';
    }
  } else {
    text = 'Not enough hourly data to measure the recent trend. Absolute pressure is shown; trend advice needs a few hours of history.';
  }
  if (tag) {
    tag.className = 'tag ' + kind;
    tag.innerHTML = '<i></i> ' + label;
  }
  if (note) note.textContent = text;
  if (bar) bar.setAttribute('aria-label', 'Barometric pressure ' + Math.round(Number(hPa) || p) + ' hectopascals, trend ' + label.toLowerCase() + '.');
}


const clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, Number.isFinite(x) ? x : a));
const COMPASS=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
function compass(deg){ return COMPASS[Math.round(((deg%360)+360)%360/22.5)%16]; }
const BANK={N:'north',NNE:'north-northeast',NE:'northeast',ENE:'east-northeast',E:'east',ESE:'east-southeast',SE:'southeast',SSE:'south-southeast',S:'south',SSW:'south-southwest',SW:'southwest',WSW:'west-southwest',W:'west',WNW:'west-northwest',NW:'northwest',NNW:'north-northwest'};
function windCallFor(speed, deg){
  if (!Number.isFinite(deg)) return '';
  const from = compass(deg), to = BANK[compass(deg + 180)];
  if (speed < 5) return `Wind ${from}, barely moving. No bank is really windblown, so fish shade and cover.`;
  if (speed > 25) return `Strong ${from} wind piles onto the ${to} bank. Fish it only from shore; boats should hide in the lee on the ${BANK[from]} side.`;
  return `${from} wind pushes bait onto the ${to} bank. Start on the ${to} shore and wind-blown points.`;
}
function clockStr(h){ h=((h%24)+24)%24; const m=Math.round(h*60)%1440; return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); }
function solunarFor(moon, sunrise, sunset){
  const toH = t => { const m = String(t||'').slice(11,16).match(/^(\d\d):(\d\d)$/); return m ? +m[1] + +m[2]/60 : NaN; };
  let noon = (toH(sunrise) + toH(sunset)) / 2; if (!Number.isFinite(noon)) noon = 12;
  const transit = noon + moon.age / 29.530588853 * 24.84;
  const under = transit + 12.42, rise = transit - 6.21, set = transit + 6.21;
  const w = (c, half) => ({ c: ((c%24)+24)%24, txt: clockStr(c-half)+' to '+clockStr(c+half) });
  return [
    { kind:'major', name:'Major: moon overhead', ...w(transit,1) },
    { kind:'major', name:'Major: moon underfoot', ...w(under,1) },
    { kind:'minor', name:'Minor: moonrise', ...w(rise,.5) },
    { kind:'minor', name:'Minor: moonset', ...w(set,.5) }
  ].sort((a,b)=>a.c-b.c);
}
function renderSolunar(moon, sunrise, sunset){
  const box=$('solunar'); if(!box) return;
  box.innerHTML = solunarFor(moon, sunrise, sunset).map(p=>`<div class="sol ${p.kind}"><b>${p.txt}</b><span>${p.name}</span></div>`).join('');
  $('solunarNote').textContent='Solunar windows are estimated from the moon phase and local sun times, accurate to roughly half an hour. The coloured edge marks the two major periods.';
}
const CACHE_KEY='basscastForecast';
function saveForecast(lat, lon, data){ try{ localStorage.setItem(CACHE_KEY, JSON.stringify({lat,lon,savedAt:Date.now(),data})); }catch{} }
function cachedForecast(lat, lon){
  try{ const c=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
    if(c && c.data && Math.abs(c.lat-lat)<0.02 && Math.abs(c.lon-lon)<0.02) { const data = cleanForecast(c.data); if (data) return Object.assign({}, c, { data }); } }catch{}
  return null;
}
/* Forecast data comes from another service, or from the copy saved on this device, so its shape is
   checked before anything reads it: days and hours must look like dates and times, readings must be
   numbers (or empty), and the size must be sane. Real Open-Meteo answers pass through unchanged;
   anything else returns null and is treated as "no forecast". Only the fields the app uses are kept. */
const FORECAST_SERIES = ['temperature_2m', 'precipitation_probability', 'precipitation', 'weather_code', 'cloud_cover', 'pressure_msl', 'wind_speed_10m', 'wind_direction_10m'];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/, ISO_HOUR = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
function cleanForecast(d) {
  if (!d || typeof d !== 'object' || !d.hourly || typeof d.hourly !== 'object' || !d.daily || typeof d.daily !== 'object') return null;
  const H = d.hourly, D = d.daily;
  const okList = (a, re, max) => Array.isArray(a) && a.length > 0 && a.length <= max && a.every(t => typeof t === 'string' && re.test(t));
  if (!okList(H.time, ISO_HOUR, 2000) || !okList(D.time, ISO_DAY, 80)) return null;
  const hourly = { time: H.time.slice() };
  FORECAST_SERIES.forEach(k => {
    if (Array.isArray(H[k])) hourly[k] = H[k].slice(0, H.time.length).map(v => (typeof v === 'number' || v === null) ? v : undefined);
  });
  const sunTimes = a => (Array.isArray(a) ? a.slice(0, D.time.length) : []).map(v => typeof v === 'string' && ISO_HOUR.test(v) ? v : null);
  const out = { hourly, daily: { time: D.time.slice(), sunrise: sunTimes(D.sunrise), sunset: sunTimes(D.sunset) } };
  if (typeof d.timezone === 'string' && /^[\w+\-/]{1,64}$/.test(d.timezone)) out.timezone = d.timezone;
  return out;
}
// Reads a stored JSON object. Missing, corrupted or wrong-shaped data reads as an empty object.
function readObj(key) {
  try { const o = JSON.parse(localStorage.getItem(key) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; }
}
function time(s) { return s ? String(s).slice(11, 16) : '–'; }
function safeNum(n, fallback = 0) { const v = Number(n); return Number.isFinite(v) ? v : fallback; }
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const hourOf = t => +String(t).slice(11, 13);
const hh = n => String(n).padStart(2, '0') + ':00';
const heat = s => bandOf(safeNum(s)).t;

/* ---------- scoring engine v2 ----------
   Built around what drives largemouth bass feeding:
   1. Water temperature (estimated from the last week of air temperature) and its trend
   2. Light, which adapts: low light in warm water, the warm afternoon in cold water
   3. Fronts: bass feed ahead of a cold front and shut down for a day or two behind it
   4. Wind (surface chop and baitfish)
   5. Rain and thunderstorms
   plus small modifiers for spawn stage, moon/solunar and heat stress.
   Pressure is used as a front signal, not on its own, because the evidence for
   pressure alone is weak while fronts have a clear effect. */
const FACTOR_KEYS = ['water', 'light', 'front', 'wind', 'rain'];
const FACTOR_NAMES = { water: 'Water temperature', light: 'Light', front: 'Fronts and stability', wind: 'Wind', rain: 'Rain and storms' };
// Water temperature and fronts set how actively bass feed, so they scale the score.
// Light, wind and rain decide which hours are best, so they are blended (weights below).
const COND_WEIGHTS = { light: 0.45, wind: 0.25, rain: 0.30 };
// How strongly each factor counts. 1 is the science-based default; catch-log learning nudges these.
const BASE_INFLUENCE = { water: 1, light: 1, front: 1, wind: 1, rain: 1 };

const lerpCurve = (x, pts) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let k = 1; k < pts.length; k++) {
    if (x <= pts[k][0]) {
      const [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
};
const c01 = x => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const clockOf = t => { const m = String(t || '').slice(11, 16).match(/^(\d\d):(\d\d)$/); return m ? +m[1] + +m[2] / 60 : NaN; };

// Largemouth bass activity against water temperature (feeding falls off sharply below ~12 °C,
// peaks in the mid to high 20s and drops again in very warm, low-oxygen water).
const WATER_CURVE = [[6, 10], [10, 25], [13, 42], [16, 56], [19, 74], [22, 90], [25, 100], [27.5, 100], [29.5, 88], [32, 62], [35, 40]];

/* Context shared by every hour: daily mean air temperature, estimated water temperature
   and its trend for each date, and a front signal for every hour. */
function buildContext(data) {
  const H = data.hourly, n = H.time.length;
  const T = H.temperature_2m || [], P = H.pressure_msl || [];
  const dates = data.daily.time.slice();
  const meanAir = {};
  dates.forEach(d => {
    const v = [];
    for (let i = 0; i < n; i++) if (H.time[i].startsWith(d) && Number.isFinite(T[i])) v.push(T[i]);
    meanAir[d] = v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
  });
  // Surface water follows air temperature with a lag of several days (time constant about 4.5 days).
  // Start from the average of the first three days, then step forward a day at a time.
  const known = dates.map(d => meanAir[d]).filter(Number.isFinite);
  let tw = known.length ? known.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, known.length) : 18;
  const K = 0.2, SUN_OFFSET = 1;
  const water = {}, trend = {}, history = [];
  dates.forEach(d => {
    if (Number.isFinite(meanAir[d])) tw = tw + K * (meanAir[d] + SUN_OFFSET - tw);
    water[d] = Math.max(5, Math.min(33, tw));
    history.push(water[d]);
    const back = history.length > 3 ? history[history.length - 4] : history[0];
    trend[d] = water[d] - back;                        // change over the last 3 days
  });
  const histDays = dates.findIndex(d => d >= localTodayISO());
  // Front signal per hour: a cold front shows as pressure climbing and the air cooling over a day.
  const sev = new Array(n).fill(0), pre = new Array(n).fill(0), post = new Array(n).fill(0), postAge = new Array(n).fill(null);
  const meanT = (a, b) => { let s = 0, c = 0; for (let j = Math.max(0, a); j <= b; j++) if (Number.isFinite(T[j])) { s += T[j]; c++; } return c ? s / c : NaN; };
  for (let j = 0; j < n; j++) {
    if (j >= 47 && Number.isFinite(P[j]) && Number.isFinite(P[j - 24])) {
      const rise = P[j] - P[j - 24];
      const cool = meanT(j - 23, j) - meanT(j - 47, j - 24);
      sev[j] = c01((rise - 2) / 6) * c01((-cool - 1) / 5);
    }
    if (j >= 6 && Number.isFinite(P[j]) && Number.isFinite(P[j - 6])) pre[j] = c01((-(P[j] - P[j - 6]) - 1) / 4);
  }
  for (let i = 0; i < n; i++) {
    let m = 0, age = null;
    for (let L = 0; L <= 60 && i - L >= 0; L++) {
      const v = sev[i - L] * (1 - L / 72);
      if (v > m) { m = v; age = L; }
    }
    post[i] = m; postAge[i] = m > 0.15 ? age : null;
  }
  return { meanAir, water, trend, pre, post, postAge, histDays: histDays < 0 ? 0 : histDays, dates };
}

function localTodayISO() {
  const d = new Date(), x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 10);
}

// Spawn and seasonal stage, judged from estimated water temperature, its trend and the month (southern hemisphere).
function seasonStage(month, tw, tr) {
  const spring = month >= 8 && month <= 11, autumn = month >= 3 && month <= 5;
  if (spring && tw >= 14 && tw < 19 && tr >= -0.3) return { key: 'prespawn', label: 'Pre-spawn', mod: 4, note: 'Water is warming through the mid to high teens, the pre-spawn feed. Bass push into sheltered, sun-facing bays and feed hard.' };
  if (spring && tw >= 19 && tw < 24) return { key: 'spawn', label: 'Spawn', mod: 0, note: 'Water is in the spawning range. Many bass are on beds, guarding rather than feeding, so expect patchy bites and release spawners quickly.' };
  if ((month === 11 || month === 12) && tw >= 24) return { key: 'postspawn', label: 'Post-spawn', mod: -2, note: 'Early summer after the spawn. Recovering fish can be lethargic for a few weeks before the summer pattern settles.' };
  if (autumn && tw >= 15 && tw <= 24 && tr <= 0.3) return { key: 'fall', label: 'Autumn feed', mod: 3, note: 'Water is cooling from summer highs. Bass follow baitfish and feed up before winter.' };
  if (tw < 13) return { key: 'winter', label: 'Winter', mod: 0, note: 'Cold water slows bass right down. Fish slowly and target the warmest part of the day.' };
  if (tw >= 27) return { key: 'summer', label: 'Summer heat', mod: 0, note: 'Warm water. Bass feed early and late and hold deeper or in shade through the middle of the day.' };
  return { key: 'normal', label: 'Settled', mod: 0, note: 'No strong seasonal effect. Light, wind and fronts lead the bite.' };
}

/* Score one hour. Returns the score, each factor (0 to 100) and the modifiers. */
function scoreHourV2(data, i, ctx, day, sun, solunar, weights) {
  const H = data.hourly;
  const air = H.temperature_2m[i], cloud = safeNum(H.cloud_cover && H.cloud_cover[i], 50);
  const wind = safeNum(H.wind_speed_10m && H.wind_speed_10m[i], 10);
  const prob = safeNum(H.precipitation_probability && H.precipitation_probability[i], 0);
  const mm = safeNum(H.precipitation && H.precipitation[i], 0);
  const code = safeNum(H.weather_code && H.weather_code[i], 0);
  const pressure = safeNum(H.pressure_msl && H.pressure_msl[i], 1013);
  const hr = hourOf(H.time[i]) + 0.5;
  const sr = sun.sr, ss = sun.ss;
  const night = Number.isFinite(sr) && Number.isFinite(ss) ? (hr < sr - 0.5 || hr > ss + 0.5) : (hr < 5 || hr > 19);

  // 1. Water temperature: the daily estimate, nudged by how warm this hour is (shallows warm through the day)
  const tw0 = ctx.water[day], tr = ctx.trend[day] || 0;
  const tw = Number.isFinite(air) && Number.isFinite(ctx.meanAir[day]) ? tw0 + 0.15 * (air - ctx.meanAir[day]) : tw0;
  let water = lerpCurve(tw, WATER_CURVE);
  if (tw < 24) water += Math.max(-15, Math.min(8, tr * 3));        // warming spells switch fish on, sudden cooling shuts them down
  else if (tw > 28) water += Math.max(-8, Math.min(5, -tr * 3));   // in very warm water, cooling helps
  water = clamp(water, 5, 100);

  // 2. Light: dawn and dusk in warm water, the warm afternoon in cold water; cloud helps through the middle of the day
  let light;
  if (night) light = 25;
  else {
    const dist = Math.min(Math.abs(hr - (sr + 0.5)), Math.abs(hr - (ss - 0.5)));
    const timing = Math.max(50, 100 - 18 * Math.max(0, dist - 0.75));
    const midCloud = 45 + 0.42 * cloud;
    const warmLight = Math.max(timing, midCloud);
    const coldLight = Math.max(40, 100 - 12 * Math.abs(hr - 14.5)) + (cloud < 40 ? 5 : 0);
    const cw = c01((16 - tw) / 4);
    light = clamp(cw * coldLight + (1 - cw) * warmLight, 20, 100);
  }

  // 3. Fronts and stability
  const preF = ctx.pre[i] || 0, postF = ctx.post[i] || 0;
  const front = clamp(64 + 26 * preF - 46 * postF, 15, 95);

  // 4. Wind
  const windS = lerpCurve(wind, [[0, 55], [4, 62], [7, 84], [12, 92], [20, 88], [26, 68], [32, 42], [40, 20], [55, 10]]);

  // 5. Rain and storms
  const thunder = code >= 95;
  let rain;
  if (thunder) rain = 10;
  else if (mm > 5) rain = 30;
  else if (mm > 2) rain = 55;
  else if (mm >= 0.2) rain = 78;
  else rain = lerpCurve(prob, [[0, 86], [25, 84], [50, 78], [75, 70], [100, 62]]);

  const f = { water, light, front, wind: windS, rain };
  const a = weights || BASE_INFLUENCE;
  // Conditions: weighted geometric mean, so one bad factor (a gale, a storm) drags the hour down
  const cw = { light: COND_WEIGHTS.light * a.light, wind: COND_WEIGHTS.wind * a.wind, rain: COND_WEIGHTS.rain * a.rain };
  const cwSum = cw.light + cw.wind + cw.rain;
  const conditions = Math.exp(['light', 'wind', 'rain'].reduce((t, k) => t + (cw[k] / cwSum) * Math.log(Math.max(1, f[k])), 0));
  // Activity: cold or very hot water and a passing front cap how hard bass feed
  const waterGate = Math.max(0.1, 1 - a.water * 0.8 * (1 - water / 100));
  const frontMult = Math.max(0.3, 1 + a.front * (0.08 * preF - 0.42 * postF));
  let raw = conditions * waterGate * frontMult;

  // Modifiers
  const m = new Date(day + 'T12:00:00').getMonth() + 1;
  const stage = seasonStage(m, tw0, tr);
  let moon = 0;
  if (solunar && !night) {
    const inWin = solunar.some(p => {
      const half = p.kind === 'major' ? 1 : 0.5;
      const d = Math.abs(((hr - p.c) % 24 + 36) % 24 - 12);
      return d <= half + 0.5;
    });
    const major = solunar.some(p => p.kind === 'major' && Math.abs(((hr - p.c) % 24 + 36) % 24 - 12) <= 1.5);
    moon = major ? 3 : inWin ? 1.5 : 0;
  }
  if (sun.moonStrong) moon += 2;
  const sunUp = Number.isFinite(sr) && Number.isFinite(ss) && !night ? Math.sin(Math.PI * c01((hr - sr) / (ss - sr))) : 0;
  const heat = tw > 28 && wind < 6 && cloud < 40 && sunUp > 0.5 ? -8 : 0;
  raw += stage.mod + moon + heat;
  let score = Math.round(clamp(raw));
  if (thunder) score = Math.min(score, 30);
  const gale = wind > 38;
  if (gale) score = Math.min(score, 35);

  return {
    i, h: Object.fromEntries(Object.keys(H).map(k => [k, H[k][i]])),
    score, f, mods: { season: stage.mod, moon, heat }, stage, night, thunder, gale, conditions, waterGate, frontMult,
    tw, preF, postF, postAge: ctx.postAge[i],
    temp: Number.isFinite(air) ? air : null, cloud, wind, rain: prob, mm, pressure
  };
}

/* Score a whole day. Day score = average of the best 4 daylight hours. */
function scoreDayV2(data, dayIdx, ctx, weights) {
  const day = data.daily.time[dayIdx];
  const sunrise = data.daily.sunrise[dayIdx], sunset = data.daily.sunset[dayIdx];
  const sun = { sr: clockOf(sunrise), ss: clockOf(sunset) };
  const moon = moonInfo(new Date(day + 'T12:00:00'));
  sun.moonStrong = moon.illum <= 12 || moon.illum >= 88;
  let sol = null;
  try { sol = solunarFor(moon, sunrise, sunset); } catch (e) { sol = null; }
  const arr = [];
  for (let i = 0; i < data.hourly.time.length; i++) {
    if (data.hourly.time[i].startsWith(day)) arr.push(scoreHourV2(data, i, ctx, day, sun, sol, weights));
  }
  if (!arr.length) return null;
  const daylight = arr.filter(x => !x.night);
  const pool = daylight.length ? daylight : arr;
  const top = pool.slice().sort((a, b) => b.score - a.score).slice(0, 4);
  const dayScore = Math.round(top.reduce((t, x) => t + x.score, 0) / top.length);
  const best = pool.reduce((a, b) => b.score > a.score ? b : a, pool[0]);
  let lo = pool.indexOf(best), hi = lo;
  while (hi - lo < 2) {
    const L = pool[lo - 1], R = pool[hi + 1];
    const okL = L && L.score >= best.score - 6 && hourOf(L.h.time) === hourOf(pool[lo].h.time) - 1;
    const okR = R && R.score >= best.score - 6 && hourOf(R.h.time) === hourOf(pool[hi].h.time) + 1;
    if (okR && (!okL || R.score >= L.score)) hi++;
    else if (okL) lo--;
    else break;
  }
  const win = pool.slice(lo, hi + 1);
  const winFactors = {};
  FACTOR_KEYS.forEach(k => { winFactors[k] = Math.round(win.reduce((t, x) => t + x.f[k], 0) / win.length); });
  return {
    day, dayIdx, arr, daylight: pool, dayScore, best,
    startH: hourOf(pool[lo].h.time), endH: hourOf(pool[hi].h.time) + 1,
    winFactors, water: ctx.water[day], trend: ctx.trend[day], stage: best.stage, moon, sunrise, sunset
  };
}


let lastData = null, lastCtx = null;
function waterText(tw, tr, src) {
  const trend = tr >= 1 ? 'warming' : tr <= -1 ? 'cooling' : 'steady';
  if (src === 'measured') return `Water ${tw.toFixed(1)}°C (your measured reading)`;
  if (src === 'adjusted') return `Water about ${Math.round(tw)}°C and ${trend} (from your reading, adjusted by the forecast)`;
  return `Water about ${Math.round(tw)}°C and ${trend} (estimated)`;
}

/* ---------- learning from the catch log ----------
   After LEARN_MIN sessions that carry factor values, each factor's influence is nudged toward
   what has actually caught you fish: factors that rise with your catch rate count a little more,
   factors that do not count a little less. The change grows slowly with more sessions and is
   capped, so a few lucky days cannot take over the score. */
const LEARN_MIN = 10;
let infCache = null;
function pearson(xs, ys) {
  const n = xs.length; if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let k = 0; k < n; k++) { const dx = xs[k] - mx, dy = ys[k] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}
function rankOf(vals) {
  const idx = vals.map((v, k) => [v, k]).sort((p, q) => p[0] - q[0]);
  const out = new Array(vals.length);
  for (let k = 0; k < idx.length;) {
    let j = k; while (j + 1 < idx.length && idx[j + 1][0] === idx[k][0]) j++;
    const r = (k + j) / 2 / Math.max(1, vals.length - 1);
    for (let m = k; m <= j; m++) out[idx[m][1]] = r;
    k = j + 1;
  }
  return out;
}
function currentInfluence() {
  if (infCache) return infCache;
  const rows = logs().filter(x => x && x.factors && FACTOR_KEYS.every(k => Number.isFinite(Number(x.factors[k]))));
  const v = { a: Object.assign({}, BASE_INFLUENCE), n: rows.length, active: false, delta: {} };
  if (settings.learn && rows.length >= LEARN_MIN) {
    const rate = x => safeNum(x.hours) > 0 ? safeNum(x.count) / safeNum(x.hours) : safeNum(x.count) / 3;
    const ranks = rankOf(rows.map(rate));
    const shrink = rows.length / (rows.length + 20);
    FACTOR_KEYS.forEach(k => {
      const r0 = pearson(rows.map(x => Number(x.factors[k])), ranks);
      const r = Math.sign(r0) * Math.max(0, Math.abs(r0) - 0.15);   // ignore weak, likely-chance patterns
      v.a[k] = Math.max(0.6, Math.min(1.5, 1 + 0.9 * shrink * Math.max(-0.5, Math.min(0.5, r))));
      v.delta[k] = v.a[k] - 1;
    });
    v.active = true;
  }
  infCache = v;
  return v;
}

function renderFactors(r, inf) {
  const b = r.best, wf = r.winFactors;
  const trendTxt = r.trend >= 1 ? 'warming' : r.trend <= -1 ? 'cooling' : 'steady';
  const sub = {
    water: (lastCtx && lastCtx.waterSrc && lastCtx.waterSrc[r.day] === 'measured') ? `${r.water.toFixed(1)}°C, measured by you. Your reading replaces the estimate.`
      : (lastCtx && lastCtx.waterSrc && lastCtx.waterSrc[r.day] === 'adjusted') ? `About ${Math.round(r.water)}°C, from your measured reading adjusted by the forecast for this day.`
      : `About ${Math.round(r.water)}°C and ${trendTxt} over the last 3 days (estimated from air temperature).`,
    light: (b.tw < 15 ? 'Cold water, so the warm afternoon counts most. ' : '') + `${Math.round(b.cloud)}% cloud at the best hour.`,
    front: b.postF > 0.3 ? `A cold front passed ${b.postAge != null ? 'about ' + b.postAge + ' hours' : 'recently'} before the best hour.`
      : b.preF > 0.3 ? 'Pressure is falling ahead of a change.' : 'Settled weather, no front nearby.',
    frontP: (() => { const P = lastData && lastData.hourly.pressure_msl; const i = b.i; return P && i >= 24 && Number.isFinite(P[i]) && Number.isFinite(P[i - 24]) ? ` Pressure changed ${(P[i] - P[i - 24] > 0 ? '+' : '') + (P[i] - P[i - 24]).toFixed(1)} hPa in the 24 hours before the best hour; this factor is where the score counts that trend.` : ''; })(),
    wind: `${fmtWind(b.wind)} at the best hour.`,
    rain: b.thunder ? 'Thunderstorms likely.' : `${Math.round(b.rain)}% chance of rain at the best hour.`
  };
  const role = { water: 'Sets how hard bass feed', front: 'Sets how hard bass feed', light: 'Picks the best hours', wind: 'Picks the best hours', rain: 'Picks the best hours' };
  const pct = k => { const d = Math.round((inf.delta[k] || 0) * 100); return inf.active && d ? `<span class="chip ${d > 0 ? 'lead' : ''}">${d > 0 ? '+' : ''}${d}% from your log</span>` : ''; };
  const m = b.mods, modBits = [];
  if (r.stage && r.stage.mod) modBits.push(`${r.stage.label} ${r.stage.mod > 0 ? '+' : ''}${r.stage.mod}`);
  if (m.moon) modBits.push(`Moon and solunar +${m.moon}`);
  if (m.heat) modBits.push(`Heat stress ${m.heat}`);
  const learn = !settings.learn ? 'Learning from your catch log is off (Settings).'
    : inf.active ? `Tuned to your catch log from ${inf.n} sessions. Changes stay small until you have more.`
    : `Learning from your catch log starts after ${LEARN_MIN} sessions logged with a score (you have ${inf.n}).`;
  $('factors').innerHTML = FACTOR_KEYS.map(k => `
      <div class="factor">
        <div class="row"><span>${FACTOR_NAMES[k]}</span><span>${wf[k]}</span></div>
        <div class="meter"><span style="width:${wf[k]}%"></span></div>
        <p class="fsub"><span class="frole">${role[k]}</span> ${esc(sub[k] + (k === 'front' ? sub.frontP : ''))} ${pct(k)}</p>
      </div>`).join('') +
    `<p class="fmods">${modBits.length ? 'Adjustments at the best hour: ' + esc(modBits.join(' · ')) + '.' : 'No seasonal, moon or heat adjustment at the best hour.'}${r.stage && r.stage.key !== 'normal' ? ' ' + esc(r.stage.note) : ''}</p>` +
    `<p class="fine">${esc(learn)}</p>`;
}


/* ---------- Pressure trend over 6, 24 and 48 hours ----------
   Uses the hourly pressure Open-Meteo already returns: the request asks for the past 7 days
   (past_days=7), so real readings before the reference hour are available. Nothing is
   estimated: if there are not enough hours of history, the change is shown as unavailable. */
function pressureTrend(data, ref) {
  const P = data.hourly.pressure_msl || [], T = data.hourly.time;
  const at = i => (i >= 0 && i < P.length && Number.isFinite(P[i])) ? P[i] : null;
  const now = at(ref);
  const ch = h => (now != null && at(ref - h) != null) ? now - at(ref - h) : null;
  const d6 = ch(6), d24 = ch(24), d48 = ch(48);
  let hist = 0; while (hist < 48 && at(ref - hist - 1) != null) hist++;
  let pattern = null;
  if (d24 != null) {
    const win = []; for (let i = ref - Math.min(48, hist); i <= ref; i++) win.push(at(i));
    const range = Math.max(...win) - Math.min(...win);
    const first = d48 != null ? at(ref - 24) - at(ref - 48) : null;
    // direction changes in 6-hour steps, ignoring small wobbles
    let flips = 0, last = 0;
    for (let i = ref - Math.min(48, hist) + 6; i <= ref; i += 6) {
      const d = at(i) - at(i - 6); const sgn = Math.abs(d) < 0.7 ? 0 : Math.sign(d);
      if (sgn && last && sgn !== last) flips++; if (sgn) last = sgn;
    }
    const net = d48 != null ? d48 : d24;
    if (first != null && first <= -1.5 && d24 >= 1.5) pattern = 'turnUp';
    else if (first != null && first >= 1.5 && d24 <= -1.5) pattern = 'turnDown';
    else if (flips >= 2 && Math.abs(net) < range * 0.5 && range >= 2) pattern = 'fluct';
    else if (net >= 2) pattern = 'rising';
    else if (net <= -2) pattern = 'falling';
    else pattern = 'stable';
  }
  return { now, d6, d24, d48, hist, pattern, ref };
}
const PRESSURE_PATTERNS = {
  rising: { label: 'Rising steadily', kind: 'rise', text: 'Pressure has climbed steadily. That usually comes with clearing skies after unsettled weather. Bass can be slow at first; fish slower and tighter to cover, and expect the bite to improve as the weather settles.' },
  falling: { label: 'Falling steadily', kind: 'fall', text: 'Pressure has been falling steadily, the classic sign of a front approaching. Bass often feed well ahead of it, so cover water with moving baits while it lasts and keep an eye on the weather.' },
  turnUp: { label: 'Changed direction: fell, now rising', kind: 'rise', text: 'Pressure fell and is now climbing again, which usually means a front has just passed. Expect a slower bite for a day or so: slow down, downsize and fish tight to cover, ideally in the warmest part of the day.' },
  turnDown: { label: 'Changed direction: rose, now falling', kind: 'fall', text: 'After a rise, pressure has turned down, so a new weather system may be on its way. The bite often picks up as it falls, so this can be a good window.' },
  fluct: { label: 'Fluctuating', kind: 'steady', text: 'Pressure has gone up and down without a clear trend. Let light, wind and water temperature guide you more than the barometer.' },
  stable: { label: 'Relatively stable', kind: 'steady', text: 'Pressure has hardly changed over this period. Settled weather means bass should follow their normal light and temperature patterns.' }
};

function renderPressureTrend(data, ref, label) {
  const box = $('pressureTrend'); if (!box) return;
  const t = pressureTrend(data, ref);
  const P = data.hourly.pressure_msl || [];
  const fmt = d => d == null ? null : (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d).toFixed(1) + ' hPa';
  const tile = (name, d, need) => `<div class="pt-tile"><span>${name}</span><b>${d == null ? 'Not available' : fmt(d)}</b>${d == null ? `<em>Needs ${need} hours of history</em>` : `<em>${Math.abs(d) < 1 ? 'steady' : d > 0 ? 'rising' : 'falling'}</em>`}</div>`;
  let html = `<p class="pt-ref">${esc(label)}: <b>${t.now != null ? Math.round(t.now) + ' hPa' : 'no reading'}</b></p>` +
    `<div class="pt-tiles">${tile('Last 6 hours', t.d6, 6)}${tile('Last 24 hours', t.d24, 24)}${tile('Last 48 hours', t.d48, 48)}</div>`;
  if (t.pattern) {
    const pat = PRESSURE_PATTERNS[t.pattern];
    html += `<p class="pt-pattern"><span class="tag ${pat.kind}"><i></i> ${esc(pat.label)}</span>${t.d48 == null ? ' <span class="fine">(over the last 24 hours)</span>' : ''}</p><p class="pnote">${esc(pat.text)}</p>`;
  } else {
    html += `<p class="pnote">Only ${t.hist} hour${t.hist === 1 ? '' : 's'} of pressure history ${t.hist === 1 ? 'is' : 'are'} available before this time, so the 24 and 48 hour trend cannot be worked out. The 6-hour trend above still works. This happens with a forecast saved by an older version of the app; refresh while online to load the past week.</p>`;
  }
  // graph: up to 48 h before the reference hour (solid) and up to 24 h after it (dashed, forecast)
  const a = Math.max(0, ref - 48), z = Math.min(P.length - 1, ref + 24);
  const pts = []; for (let i = a; i <= z; i++) if (Number.isFinite(P[i])) pts.push([i, P[i]]);
  if (pts.length >= 3) {
    const W = 320, H = 90, padL = 34, padR = 6, padT = 8, padB = 18;
    let lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1]));
    if (hi - lo < 4) { const m = (hi + lo) / 2; lo = m - 2; hi = m + 2; }
    const span = ref + 24 - (ref - 48);
    const x = i => padL + (i - (ref - 48)) / span * (W - padL - padR);
    const y = v => padT + (hi - v) / (hi - lo) * (H - padT - padB);
    const path = arr => arr.map((p, n) => (n ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join('');
    const past = pts.filter(p => p[0] <= ref), fut = pts.filter(p => p[0] >= ref);
    const tick = (i, txt) => `<line x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${padT}" y2="${H - padB}" class="pt-grid"/><text x="${x(i).toFixed(1)}" y="${H - 4}" text-anchor="middle">${txt}</text>`;
    html += `<svg class="pt-graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pressure over the last ${Math.min(48, t.hist)} hours and the next ${Math.max(0, z - ref)} hours">` +
      `<text x="${padL - 4}" y="${padT + 4}" text-anchor="end">${Math.round(hi)}</text><text x="${padL - 4}" y="${H - padB}" text-anchor="end">${Math.round(lo)}</text>` +
      tick(ref - 48, '−48 h') + tick(ref - 24, '−24 h') + tick(ref + 24, '+24 h') +
      `<line x1="${x(ref).toFixed(1)}" x2="${x(ref).toFixed(1)}" y1="${padT}" y2="${H - padB}" class="pt-now"/><text x="${x(ref).toFixed(1)}" y="${H - 4}" text-anchor="middle" class="pt-nowtxt">${esc(label.startsWith('Now') ? 'now' : 'best hour')}</text>` +
      (past.length > 1 ? `<path d="${path(past)}" class="pt-line"/>` : '') +
      (fut.length > 1 ? `<path d="${path(fut)}" class="pt-line pt-fut"/>` : '') +
      (t.now != null ? `<circle cx="${x(ref).toFixed(1)}" cy="${y(t.now).toFixed(1)}" r="3.5" class="pt-dot"/>` : '') +
      `</svg><p class="fine pt-legend">Solid line: the past readings. Dashed: the forecast. Past readings are Open-Meteo&rsquo;s hourly data for this spot, not a barometer at the dam.</p>`;
  }
  box.innerHTML = html;
  return t;
}

/* ---------- Measured water temperature ----------
   A reading you enter takes precedence over the estimate. It is stored per spot on this device
   with the time you entered it, and is never replaced by a new estimate; only you can clear it.
   For later days the forecast's warming or cooling is applied on top of your reading. */
const WATER_KEY = 'basscastWater';
function waterKeyFor(sel, lat, lon) { return spotKeyOf(sel) || ('pin:' + Number(lat).toFixed(2) + ',' + Number(lon).toFixed(2)); }
function getMeasured(sel, lat, lon) {
  try {
    const o = readObj(WATER_KEY), m = o[waterKeyFor(sel, lat, lon)];
    return m && Number.isFinite(m.v) && m.v >= 0 && m.v <= 40 && /^\d{4}-\d{2}-\d{2}$/.test(m.date) ? m : null;
  } catch { return null; }
}
function setMeasured(sel, lat, lon, m) {
  try {
    const o = readObj(WATER_KEY), k = waterKeyFor(sel, lat, lon);
    if (m) o[k] = m; else delete o[k];
    localStorage.setItem(WATER_KEY, JSON.stringify(o)); return true;
  } catch { return false; }
}
function parseWaterInput(raw) {
  const s = String(raw == null ? '' : raw).trim().replace(',', '.');
  if (!s) return { err: 'Enter the temperature you measured, in °C.' };
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { err: 'Enter a number in °C, for example 18.5.' };
  const v = Number(s);
  if (v < 0 || v > 40) return { err: 'That is not a realistic dam water temperature. Enter a value from 0 to 40 °C.' };
  return { v: Math.round(v * 10) / 10 };
}
// Applies a measured reading to the scoring context. Keeps the estimate alongside for reference.
function applyMeasured(ctx, m) {
  ctx.waterEst = Object.assign({}, ctx.water);
  ctx.waterSrc = {};
  ctx.dates.forEach(d => { ctx.waterSrc[d] = 'estimated'; });
  ctx.measured = null;
  if (!m) return ctx;
  const today = ctx.dates[ctx.histDays] || ctx.dates[0];
  const base = ctx.dates.includes(m.date) ? m.date : today;
  const offset = m.v - ctx.waterEst[base];
  ctx.dates.forEach(d => {
    if (d >= base) { ctx.water[d] = Math.max(0, Math.min(40, ctx.waterEst[d] + offset)); ctx.waterSrc[d] = d === base ? 'measured' : 'adjusted'; }
  });
  ctx.measured = m; ctx.measuredBase = base;
  return ctx;
}
function renderWaterBox(ctx, day) {
  const src = ctx.waterSrc ? ctx.waterSrc[day] : 'estimated', v = ctx.water[day], m = ctx.measured;
  const when = m ? (() => {
    const d = new Date(m.at), sameDay = localISODate(d) === localISODate(new Date());
    return (sameDay ? 'today at ' : d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) + ' at ') + d.toTimeString().slice(0, 5);
  })() : '';
  const old = m && (Date.now() - m.at) > 3 * 864e5;
  $('wtVal').textContent = src === 'measured' ? v.toFixed(1) + '°C' : 'about ' + Math.round(v) + '°C';
  const badge = $('wtBadge');
  badge.textContent = src === 'measured' ? 'Measured' : src === 'adjusted' ? 'From your reading' : 'Estimated';
  badge.className = 'wtbadge ' + (src === 'estimated' ? 'est' : 'meas');
  $('wtMeta').textContent = src === 'measured' ? `You entered ${m.v.toFixed(1)}°C ${when}.${old ? ' It is a few days old, so the water may have changed.' : ''}`
    : src === 'adjusted' ? `Your ${m.v.toFixed(1)}°C reading from ${when}, adjusted for this day by the forecast.${old ? ' It is a few days old.' : ''}`
    : 'From the past week of air temperature. It can be a degree or two out.';
  $('wtClear').hidden = !m;
  $('wtEdit').textContent = m ? 'Update reading' : 'Enter measured';
  $('wtForm').hidden = true; $('wtMsg').textContent = '';
}

const BANDS = [
  { label: 'Bad',       lo: 0,  hi: 39,  t: 0,   note: 'A tough day. Go only if it is your one chance, and fish slowly and close to cover.' },
  { label: 'Slow',      lo: 40, hi: 54,  t: 25,  note: 'Fish will feed, but expect to work for your bites. Downsize and be patient.' },
  { label: 'Medium',    lo: 55, hi: 67,  t: 50,  note: 'A decent day. Expect steady fishing if you are on the right spots at the right time.' },
  { label: 'Good',      lo: 68, hi: 79, t: 75, note: 'Active fish are likely. Worth planning your trip around this one.' },
  { label: 'Excellent', lo: 80, hi: 100, t: 100, note: 'Prime conditions. Make time for this one and fish the best window hard.' }
];
const bandOf = s => BANDS.find(b => s <= b.hi) || BANDS[BANDS.length - 1];
// Colour classes for the score bands (b-bad ... b-excellent). Presentation only.
const BAND_KEYS = ['bad', 'slow', 'medium', 'good', 'excellent'];
const bandKey = s => BAND_KEYS[BANDS.indexOf(bandOf(clamp(safeNum(s, 0))))];
function quality(s) { return bandOf(safeNum(s, 0)).label; }

function buildGauge() {
  $('gauge').innerHTML =
    '<div class="pin" id="gaugePin" style="left:0%"><span id="gaugePinVal">–</span></div>' +
    '<div class="segs">' + BANDS.map((b, i) => `<div class="seg" data-i="${i}" style="--t:${b.t}"></div>`).join('') + '</div>' +
    '<div class="labels">' + BANDS.map((b, i) =>
      `<div class="lab" data-i="${i}"><strong>${b.label}</strong>${b.hi >= 100 ? b.lo + '+' : b.lo + ' to ' + b.hi}</div>`).join('') + '</div>';
  $('gauge').setAttribute('role', 'img');
  $('gauge').setAttribute('aria-label', 'Score guide: Bad 0 to 39, Slow 40 to 54, Medium 55 to 67, Good 68 to 79, Excellent 80 and above.');
}

function updateGauge(score) {
  const n = clamp(safeNum(score, 0));
  const i = BANDS.indexOf(bandOf(n));
  const b = BANDS[i];
  const frac = Math.min((n - b.lo) / (b.hi - b.lo + 1), 1);
  const pos = clamp((i + frac) / BANDS.length * 100, 4, 96);
  $('gaugePin').style.left = pos + '%';
  $('gaugePinVal').textContent = Math.round(n);
  $('gauge').classList.add('live');
  $('gauge').querySelectorAll('.seg,.lab').forEach(el => el.classList.toggle('on', +el.dataset.i === i));
  $('gauge').setAttribute('aria-label', `Score guide: today scores ${Math.round(n)}, which is ${b.label.toLowerCase()}.`);
  $('gaugeNote').innerHTML = `<strong>${Math.round(n)} is ${esc(b.label.toLowerCase())}.</strong> ${esc(b.note)}`;
}

// The status line shows text to the user and also announces what phase the app is in.
// Other parts of the page listen for the 'basscast:status' event and read its phase,
// so the wording of any message can change freely without breaking them.
// Phases: 'loading', 'ready', 'offline', 'error', or '' for plain messages.
function setStatus(t, err = false, phase) {
  const p = phase != null ? phase : (err ? 'error' : '');
  const el = $('status');
  el.textContent = t;
  el.className = 'status' + (p === 'error' ? ' error' : p === 'offline' ? ' offline' : '');
  el.dataset.phase = p;
  document.dispatchEvent(new CustomEvent('basscast:status', { detail: { phase: p, text: t } }));
}

function updateClock() {
  const now = new Date();
  $('liveDate').textContent = now.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  $('liveTime').textContent = now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' SAST';
}

/* ---------- tabs ---------- */
const TABS = ['forecast', 'map', 'log', 'settings'];
function showTab(name) {
  TABS.forEach(n => {
    $('tab-' + n).hidden = n !== name;
    const b = $('tabbtn-' + n);
    b.setAttribute('aria-selected', String(n === name));
    b.tabIndex = n === name ? 0 : -1;
  });
  const panel = $('tab-' + name);
  if (panel) {
    panel.querySelectorAll('.block').forEach(el => el.classList.add('shown'));
  }
  if (name === 'map' && map) {
    setTimeout(() => {
      map.invalidateSize();
      if (!mapShown && selected) { map.setView([selected.lat, selected.lon], selected.kind === 'free' ? 9 : 8); }
      mapShown = true;
    }, 60);
  }
}
TABS.forEach((n, i) => {
  const b = $('tabbtn-' + n);
  b.addEventListener('click', () => showTab(n));
  b.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    showTab(next);
    $('tabbtn-' + next).focus();
  });
});

/* ---------- forecast ---------- */
let currentHours = [];
let dayInfo = {};
let chosenName = '';
let placeDate = '';
function setPlaceTag() {
  $('placeTag').textContent = placeDate || 'Choose a spot';
  document.querySelectorAll('.js-spotname').forEach(el => { el.textContent = chosenName || 'Select spot'; });
}

function showHour(x) {
  if (!x) return;
  const t = x.temp == null ? 'unknown air temperature' : Math.round(x.temp) + '°C air';
  $('hourDetail').innerHTML =
    `<strong>${esc(time(x.h.time))}</strong> scores ${x.score}, with ${t}, ${Math.round(x.cloud)}% cloud, ` +
    `wind at ${fmtWind(x.wind)} and a ${Math.round(x.rain)}% chance of rain` + (x.thunder ? '. Thunderstorms likely, stay off the water.' : x.night ? '. This hour is before sunrise or after sunset.' : '.');
  $('hours').querySelectorAll('.bar').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.i === x.i)));
}


/* ---------- advice engine ---------- */
const REGION_PHRASE = { wc: 'the Western Cape', hv: 'Gauteng and the Highveld', kzn: 'KwaZulu-Natal', sa: 'South Africa' };
const REGION_NAME = { wc: 'Western Cape', hv: 'Gauteng and Highveld', kzn: 'KwaZulu-Natal', sa: 'South Africa' };

function regionFor(lat, lon) {
  if (lon >= 17.5 && lon <= 22.5 && lat <= -31.5 && lat >= -35.5) return 'wc';
  if (lon >= 29 && lon <= 33 && lat <= -26.8 && lat >= -31.5) return 'kzn';
  if (lon >= 25 && lon <= 31.5 && lat <= -23.5 && lat >= -28.5) return 'hv';
  return 'sa';
}

const REGIONAL = {
  wc: {
    Summer: [
      "Strong southeasterlies are common in summer. Wind-blown points and banks concentrate baitfish, and a lee shore gives you control for finesse work.",
      "Many Western Cape dams run clear, so low light and natural colours count for more than they do on turbid Highveld water."
    ],
    Autumn: [
      "Cooling nights start dropping water temperatures. Fish follow baitfish onto points and into creek arms as the dam cools.",
      "Cold fronts begin arriving late in autumn. Bass often feed ahead of a front and go quiet behind it."
    ],
    Winter: [
      "Winter is the wet season and fronts roll through every week or two. Fish the day before a front and the stable afternoon after it.",
      "Water is coldest around July and August. Slow down and fish the warmest part of the day, midday into afternoon, on sunny banks and deeper edges beside flats."
    ],
    Spring: [
      "Spring warms sheltered coves first, especially the north-facing banks, which get the most sun in the southern hemisphere. Look there for pre-spawn fish from about September.",
      "Release spawning fish quickly and leave beds alone where you can."
    ]
  },
  hv: {
    Summer: [
      "Summer rain falls mostly as afternoon thunderstorms from about November to March. Fish the morning and be off the water before storms build.",
      "Warm, nutrient-rich Highveld dams can be turbid or weedy. Use vibration and contrast (spinnerbaits, chatterbaits, black and blue, chartreuse) and weedless rigs around hyacinth or thick weed."
    ],
    Autumn: [
      "Days stay pleasant but nights cool fast at altitude. Fish push shallow in the warmest part of the afternoon and feed up as the water cools.",
      "Frost can start inland late in autumn. After a cold night, wait for the sun to warm the shallows before fishing them."
    ],
    Winter: [
      "Highveld winters are dry and sunny with frosty mornings. Water gets cold, so fish slowly and start late, from mid-morning to mid-afternoon.",
      "Clear, still, sunny days can be tough. Downsize, use fluorocarbon and fish deeper edges beside shallow flats."
    ],
    Spring: [
      "Things warm quickly from September. Shallow bays and north-facing banks produce first, and wind-blown points deserve a few casts.",
      "Early thunderstorms can arrive from October, so keep an eye on the sky."
    ]
  },
  kzn: {
    Summer: [
      "Summer is hot and humid with afternoon thunderstorms. Fish early and late, and leave the water as soon as you hear thunder.",
      "Warm water holds fish deeper at midday. Look for shade, docks, standing timber or deeper weed edges."
    ],
    Autumn: [
      "Autumn is stable and comfortable. Follow bait and bird activity around points and creek mouths as baitfish move.",
      "Midlands dams cool earlier than those closer to the coast."
    ],
    Winter: [
      "KZN winters are mild and dry, and the water stays warmer than on the Highveld or in the Western Cape, so fish remain catchable. Slow down a notch and favour the warm afternoon.",
      "Berg wind days bring sudden warm, dry, gusty weather. Expect fast changes in wind direction and pressure around them."
    ],
    Spring: [
      "Water warms fast. In the warmer dams, shallow bays, flats and cover near points hold pre-spawn fish from about August or September, and Midlands dams run a little later.",
      "The first big thunderstorms often arrive from October."
    ]
  },
  sa: {
    Summer: ["Most of the country gets summer rain, usually as afternoon thunderstorms. Fish the morning and be off the water when storms build."],
    Autumn: ["Cooling nights shift fish toward points and creek arms. Fish the warm part of the afternoon."],
    Winter: ["Water is at its coldest. Slow down and fish the warmest part of the day."],
    Spring: ["Water warms from the shallows first. Sheltered, sun-facing bays and flats hold pre-spawn fish."]
  }
};

// Keep only the "Where to fish" lines that match how the user fishes (Settings).
function whereFor(items) {
  const pick = settings.angler === 'bank' ? 'Bank: ' : settings.angler === 'boat' ? 'Boat or kayak: ' : null;
  if (!pick) return items;
  const kept = items.filter(i => i.startsWith(pick)).map(i => i.slice(pick.length));
  return kept.length ? kept.map(i => i.charAt(0).toUpperCase() + i.slice(1)) : items;
}


/* ---------- How to fish it: water clarity and lure picks ----------
   Extends buildAdvice with the water clarity you choose. Uses only the data the forecast
   already has (estimated water temperature and trend, light and cloud at the best window,
   wind, rain, fronts, spawn stage, region, bank or boat) plus the clarity setting.
   It suggests where bass are LIKELY to be, from common bass behaviour; it has no live
   data on where fish actually are or how deep the dam is at any spot. */
const CLARITY = [
  { k: 'clear', t: 'Clear', note: 'You can see the bottom or a lure well over a metre down.' },
  { k: 'slight', t: 'Slightly stained', note: 'A lure fades from view at roughly 60 cm to 1 m.' },
  { k: 'moderate', t: 'Moderately stained', note: 'A lure disappears at roughly 30 to 60 cm.' },
  { k: 'muddy', t: 'Muddy', note: 'A lure disappears within about 30 cm.' }
];
const CLARITY_KEY = 'basscastClarity';
const clarityIndex = k => Math.max(0, CLARITY.findIndex(c => c.k === k));
function clarityKeyFor(sel) { return spotKeyOf(sel) || 'pin'; }
function getClarity(sel) {
  try { const v = readObj(CLARITY_KEY)[clarityKeyFor(sel)]; return CLARITY.some(c => c.k === v) ? v : null; } catch { return null; }
}
function setClarity(sel, v) {
  try { const o = readObj(CLARITY_KEY); o[clarityKeyFor(sel)] = v; localStorage.setItem(CLARITY_KEY, JSON.stringify(o)); return true; } catch { return false; }
}

// Lure set. depth: where the lure fishes (m). temp: [too cold, ideal from, ideal to, too warm] in °C water.
// clar: preference for [clear, slightly stained, moderately stained, muddy].
const LURES = [
  { id: 'walk', name: 'Walking topwater', cat: 'top', kind: 'top', depth: [0, 0], temp: [16, 20, 28, 31], clar: [10, 6, -2, -10] },
  { id: 'popper', name: 'Popper', cat: 'top', kind: 'top', depth: [0, 0], temp: [17, 20, 28, 31], clar: [4, 6, 4, -2] },
  { id: 'buzz', name: 'Buzzbait', cat: 'top', kind: 'blade', depth: [0, 0], temp: [18, 21, 29, 32], clar: [-4, 4, 8, 8] },
  { id: 'frog', name: 'Hollow-body frog', cat: 'top', kind: 'frog', depth: [0, 0], temp: [21, 24, 31, 33], clar: [0, 4, 4, 4] },
  { id: 'spinner', name: 'Spinnerbait', cat: 'moving', kind: 'blade', depth: [0.3, 3], temp: [11, 15, 24, 29], clar: [-2, 6, 12, 12] },
  { id: 'chatter', name: 'Bladed jig (chatterbait)', cat: 'moving', kind: 'blade', depth: [0.3, 2.5], temp: [13, 16, 26, 30], clar: [-4, 6, 12, 14] },
  { id: 'squarebill', name: 'Squarebill crankbait', cat: 'moving', kind: 'hard', depth: [0.5, 1.5], temp: [13, 16, 26, 30], clar: [-2, 6, 8, 6] },
  { id: 'midcrank', name: 'Medium-diving crankbait', cat: 'moving', kind: 'hard', depth: [2, 4], temp: [12, 16, 27, 31], clar: [2, 6, 6, 0] },
  { id: 'deepcrank', name: 'Deep-diving crankbait', cat: 'moving', kind: 'hard', depth: [4, 6], temp: [18, 24, 30, 33], clar: [4, 6, 2, -6] },
  { id: 'lipless', name: 'Lipless crankbait', cat: 'moving', kind: 'hard', depth: [0.5, 3], temp: [10, 12, 21, 27], clar: [0, 8, 8, 4] },
  { id: 'jerk', name: 'Suspending jerkbait', cat: 'moving', kind: 'hard', depth: [1, 2.5], temp: [7, 9, 17, 22], clar: [12, 6, -6, -20] },
  { id: 'swim', name: 'Paddle-tail swimbait', cat: 'moving', kind: 'soft', depth: [0.5, 3], temp: [14, 17, 25, 29], clar: [10, 6, 0, -12] },
  { id: 'blade', name: 'Blade bait', cat: 'moving', kind: 'metal', depth: [3, 6], temp: [5, 6, 12, 15], clar: [8, 4, -6, -15] },
  { id: 'texas', name: 'Texas-rigged worm or creature bait', cat: 'bottom', kind: 'soft', depth: [0.5, 4], temp: [12, 18, 30, 33], clar: [2, 4, 6, 6] },
  { id: 'jig', name: 'Flipping or football jig', cat: 'bottom', kind: 'jig', depth: [1, 5], temp: [8, 12, 24, 30], clar: [0, 4, 6, 6] },
  { id: 'wacky', name: 'Wacky-rigged stick bait', cat: 'bottom', kind: 'soft', depth: [0.3, 2], temp: [15, 18, 27, 31], clar: [8, 6, 0, -8] },
  { id: 'ned', name: 'Ned rig or shaky head', cat: 'finesse', kind: 'soft', depth: [1, 5], temp: [8, 11, 28, 31], clar: [10, 6, 0, -8] },
  { id: 'dropshot', name: 'Drop shot', cat: 'finesse', kind: 'soft', depth: [3, 8], temp: [10, 13, 31, 33], clar: [12, 6, -4, -12] },
  { id: 'carolina', name: 'Carolina rig', cat: 'bottom', kind: 'soft', depth: [3, 7], temp: [17, 23, 30, 33], clar: [2, 4, 4, 2] }
];
const STAGE_PICKS = {
  prespawn: ['jerk', 'lipless', 'midcrank', 'jig', 'spinner', 'swim'],
  spawn: ['wacky', 'texas', 'ned', 'popper'],
  postspawn: ['walk', 'popper', 'swim', 'wacky'],
  fall: ['lipless', 'spinner', 'walk', 'squarebill', 'swim'],
  winter: ['blade', 'jerk', 'jig', 'ned', 'dropshot'],
  summer: ['deepcrank', 'carolina', 'dropshot', 'texas', 'frog']
};

// Likely depth band from conditions. A starting point from typical bass behaviour, not a reading of the dam.
function depthBand(k) {
  let lo, hi, why;
  if (k.tw < 14) { lo = 2; hi = 6; why = 'cold water holds bass on deeper edges'; if (k.sunnyAfternoon) { lo = 1; hi = 3; why = 'cold water, but sun warms the shallows beside deep water in the afternoon'; } }
  else if (k.tw < 19) { lo = k.low ? 0.5 : 1.5; hi = k.low ? 2.5 : 4; why = k.low ? 'cool water with low light lets bass move up' : 'cool water and full light keep bass at mid depths'; }
  else if (k.tw <= 26) { lo = k.low ? 0 : 1; hi = k.low ? 1.5 : 3; why = k.low ? 'warm water and low light put bass shallow' : 'warm water, with bass easing to cover or a little deeper as the light climbs'; }
  else { lo = k.low ? 0 : 3; hi = k.low ? 1.5 : 7; why = k.low ? 'hot water, but bass come shallow at first and last light' : 'hot water pushes bass deeper or into heavy shade through the day'; }
  if (k.stage === 'spawn') { lo = 0.3; hi = k.clar === 0 ? 3 : 1.5; why = 'spawning bass sit on shallow beds, deeper in clear water'; }
  if (k.over && !k.low && k.tw >= 16) { hi = Math.max(lo + 1, hi - 1); why += '; cloud lets them roam a little shallower'; }
  if (k.clar === 0 && k.bright) { hi += 1; why += '; clear water and bright sun push them deeper'; }
  if (k.clar === 2) { hi = Math.max(lo + 0.5, Math.min(hi, 3)); why += '; stained water keeps them shallower'; }
  if (k.clar === 3) { hi = Math.max(lo + 0.5, Math.min(hi, 2)); lo = Math.min(lo, 1); why += '; muddy water keeps them shallow, close to cover'; }
  if (k.post) { lo += 0.5; hi += 1; why += '; after a cold front they drop a little deeper and tight to cover'; }
  lo = Math.max(0, Math.round(lo * 2) / 2); hi = Math.max(lo + 0.5, Math.round(hi * 2) / 2);
  return { lo, hi, why };
}

function lureConditions(c, clarity) {
  const b = c.best, tw = c.water;
  const midWin = (c.startH + c.endH) / 2;
  const low = (Number.isFinite(c.sunriseH) && Math.abs(midWin - c.sunriseH) <= 1.5) || (Number.isFinite(c.sunsetH) && Math.abs(midWin - c.sunsetH) <= 1.5);
  const k = {
    tw, trend: c.trend || 0, low, over: b.cloud >= 60, bright: b.cloud < 30 && !low, wind: b.wind,
    clar: clarityIndex(clarity || 'slight'), post: b.postF > 0.3, pre: b.preF > 0.3,
    stage: c.stage ? c.stage.key : 'normal', angler: settings.angler, rain: b.rain, thunder: !!b.thunder,
    sunnyAfternoon: b.cloud < 50 && midWin >= 12 && midWin <= 17
  };
  k.zone = depthBand(k);
  return k;
}

function scoreLure(L, k) {
  const why = [];
  let s = 0;
  // rank orders the reasons shown: specific reasons first, general temperature and depth fit last
  const add = (pts, txt, rank) => { s += pts; if (txt && pts > 0) why.push([rank != null ? rank : pts, txt]); };
  const [tMin, tLo, tHi, tMax] = L.temp;
  if (k.tw < tMin || k.tw > tMax) add(-35);
  else if (k.tw >= tLo && k.tw <= tHi) add(30, `suits water around ${Math.round(k.tw)}°C`, 3);
  else add(30 * (k.tw < tLo ? (k.tw - tMin) / (tLo - tMin) : (tMax - k.tw) / (tMax - tHi)), `still workable at about ${Math.round(k.tw)}°C`, 1);
  // depth: does the lure run where bass are likely to be?
  const top = L.depth[1] === 0;
  if (top) add(k.zone.lo <= 1 ? 14 : -25, k.zone.lo <= 1 ? 'bass are likely shallow enough to come up for it' : null, 2);
  else {
    const ov = Math.min(L.depth[1], k.zone.hi) - Math.max(L.depth[0], k.zone.lo);
    if (ov >= 0) add(14, `runs in the likely ${k.zone.lo}–${k.zone.hi} m band`, 2);
    else add(-10 * Math.min(2.5, -ov));
  }
  // light
  if (L.cat === 'top') { if (k.low) add(18, 'low light is prime surface time'); else if (k.over) add(10, 'cloud cover keeps fish looking up'); else if (k.bright) add(L.id === 'frog' ? -6 : -25); }
  else if (L.cat === 'moving') { if (k.over) add(6, 'overcast skies suit moving baits'); if (k.bright) add(-3); }
  else { if (k.bright) add(7, k.tw < 15 ? 'in cold, bright conditions a slow bait near the bottom gets the most bites' : 'bright sun pushes bass tight to cover, where slow baits shine'); }
  // wind
  if (L.cat === 'top') { if (k.wind > 15) add(-20); else if (k.wind > 10 && (L.id === 'walk' || L.id === 'frog')) add(-8); else if (k.wind < 6) add(5, 'calm water suits surface baits'); }
  else if (L.cat === 'moving') { if (k.wind >= 8 && k.wind <= 25) add(10, 'the breeze breaks up the surface and stacks baitfish'); else if (k.wind < 5) add(-5); }
  else { if (k.wind > 20) add(-8); else if (k.wind < 6) add(4, 'calm conditions suit a slow, subtle presentation'); }
  // clarity
  const cp = L.clar[k.clar];
  const loud = L.kind === 'blade' || L.kind === 'metal' || ['squarebill', 'lipless', 'midcrank', 'popper', 'buzz'].includes(L.id);
  add(cp, cp > 0 ? (k.clar === 3 ? 'gives bass a strong outline or vibration to find in muddy water'
    : k.clar === 2 ? (loud ? 'its vibration and flash help bass find it in stained water' : 'a dark, solid outline shows up well in stained water')
    : k.clar === 1 ? (loud ? 'a touch of flash and vibration suits lightly stained water' : 'a natural look suits lightly stained water')
    : 'looks natural in clear water') : null);
  // fronts
  if (k.post) { if (L.cat === 'bottom' || L.cat === 'finesse') add(12, 'post-front bass want something slow and close to the bottom'); else if (L.cat === 'top') add(-15); else add(-8); }
  if (k.pre) { if (L.cat === 'moving') add(10, 'bass often feed hard ahead of a front, so cover water'); else if (L.cat === 'top') add(4); }
  // season and spawn stage
  const st = STAGE_PICKS[k.stage];
  if (st && st.includes(L.id)) add(10, { prespawn: 'a classic pre-spawn bait', spawn: 'good for bedding fish', postspawn: 'suits post-spawn fish feeding up', fall: 'matches the autumn baitfish feed', winter: 'a proven cold-water bait', summer: 'reaches summer fish' }[k.stage]);
  // bank or boat
  if (k.angler === 'bank' && (L.id === 'deepcrank' || L.id === 'dropshot')) add(-12);
  return { L, s, why: why.sort((p, q) => q[0] - p[0]).map(x => x[1]) };
}

function colourFor(L, k) {
  const c = k.clar, dim = k.low || k.over, bright = k.bright;
  if (L.kind === 'top') {
    if (dim) return c >= 2 ? 'Black, for the clearest silhouette against the sky' : 'Bone or black, which show up well against a dim sky';
    return c === 0 ? 'Clear, ghost or translucent shad' : 'Bone or white';
  }
  if (L.kind === 'frog') return dim || c >= 2 ? 'Black, for a strong silhouette' : 'White, or a natural brown or green in clear water';
  if (L.kind === 'blade') {
    const skirt = ['White or translucent shad', 'White and chartreuse', 'Chartreuse and white', 'Black and blue, or solid chartreuse'][c];
    const blades = ['silver willow blades', 'silver or gold willow and Colorado blades', 'gold Colorado or Indiana blades', 'gold Colorado blades for maximum thump'][c];
    return `${skirt} skirt${L.id === 'buzz' ? '' : ' with ' + blades}${dim && c <= 1 ? '. Go a shade darker in this low light' : bright && c === 0 ? '. Use silver blades for flash in the sun' : ''}`;
  }
  if (L.kind === 'hard') {
    const base = ['Ghost shad, translucent kurper (bluegill) or natural baitfish', 'Kurper (bluegill), sexy shad or crawfish brown', 'Chartreuse with a blue back, firetiger or crawfish red', 'Solid chartreuse, black back with chartreuse, or bright firetiger, ideally with rattles'][c];
    return base + (bright && c <= 1 ? '. Pick a translucent finish with a little flash for the bright sun' : dim && c <= 1 ? '. A more solid finish shows up better in this light' : '');
  }
  if (L.kind === 'metal') return c <= 1 ? 'Silver, or gold on cloudy days' : 'Gold or chartreuse';
  // soft plastics and jigs
  const soft = ['Green pumpkin, watermelon or translucent smoke', 'Green pumpkin with a chartreuse tail, or watermelon red flake', 'Junebug, black and blue flake, or green pumpkin with chartreuse', 'Black and blue, or junebug: solid dark colours'][c];
  const extra = L.kind === 'jig' ? '. Match the trailer to the skirt' : L.id === 'swim' ? '' : '';
  return (L.id === 'swim' ? ['Natural shad or kurper with a translucent belly', 'Kurper (bluegill) or pearl shad', 'White or chartreuse shad', 'Solid white or chartreuse'][c] : soft) + extra +
    (bright && c === 0 && L.id !== 'swim' ? '. Translucent colours look most natural in bright, clear water' : dim && c >= 1 && L.id !== 'swim' ? '. Darker shades give a better outline in this light' : '');
}

function locationFor(L, k) {
  const windy = k.wind >= 8 && k.wind <= 25;
  const wb = windy ? 'wind-blown ' : '';
  if (k.stage === 'spawn' && (L.id === 'wacky' || L.id === 'texas' || L.id === 'ned' || L.id === 'popper'))
    return 'Sheltered, sun-facing bays and shallow flats with a firm bottom, beside reeds or weed edges. Fish around beds rather than over them where you can';
  if (L.cat === 'top') {
    if (L.id === 'frog') return 'Matted weed, hyacinth and shaded pockets, if your dam has them';
    return k.low ? `Reed lines, weed edges and shallow flats close to deeper water${windy ? ', starting on the wind-blown side' : ''}` : 'Weed edges, reed lines and shaded banks';
  }
  if (L.id === 'spinner' || L.id === 'chatter') return k.clar >= 2 ? `The edges of the dirtier water, ${wb}reed lines and the first cover you can find` : `${windy ? 'Wind-blown rocky banks and points' : 'Reed lines and laydowns'}, plus weed edges`;
  if (L.id === 'squarebill') return `Shallow ${wb}rocky banks, laydowns and the outside of reed lines, where it can bump cover`;
  if (L.id === 'lipless') return k.stage === 'prespawn' ? 'Flats beside deeper water in sun-facing bays, and over the top of submerged weed' : `${windy ? 'Wind-blown flats and points' : 'Flats and points'}, ripped over submerged weed`;
  if (L.id === 'midcrank') return `${windy ? 'Wind-blown rocky points' : 'Rocky points'} and the first drop-off off the bank`;
  if (L.id === 'deepcrank') return 'Main-dam points, humps and the deeper drop-offs next to channels';
  if (L.id === 'jerk') return 'Rocky points, steeper banks and the edges of drop-offs';
  if (L.id === 'swim') return 'Points, weed edges and anywhere you see baitfish or kurper';
  if (L.id === 'blade') return 'Deeper drop-offs, channel edges and steep rocky points';
  if (L.id === 'texas' || L.id === 'jig') {
    if (k.post) return 'Tight to the thickest cover: laydowns, the base of reeds, rocks on drop-offs';
    if (k.bright && k.tw < 15) return 'The sunny side of rocks, laydowns and drop-offs near the warmest bank, where the water warms first';
    if (k.bright) return 'Shaded cover: laydowns, reed and weed pockets, jetties and the shady side of rocks';
    return L.id === 'jig' ? 'Rocky drop-offs, laydowns and the base of steeper banks' : 'Laydowns, reed and weed pockets, and the base of drop-offs';
  }
  if (L.id === 'wacky') return 'Shade lines, reed edges and isolated shallow cover';
  if (L.id === 'ned') return k.tw < 14 ? 'Deeper rocky points and gentle drop-offs near the warmest bank' : 'Rocky points, gentle drop-offs and clean bottom near cover';
  if (L.id === 'dropshot') return 'Drop-offs, channel edges and deeper rocks, ideally where the sounder shows fish or bait';
  if (L.id === 'carolina') return 'Deeper flats, points and channel edges';
  return 'Points, drop-offs and the best cover nearby';
}

function retrieveFor(L, k) {
  const slow = k.tw < 15 || k.post, fast = k.tw >= 20 && (k.pre || k.over) && !k.post;
  const base = {
    walk: 'Cast past the target and "walk the dog": a steady rhythm of short rod-tip twitches on a slack line. Pause for a second or two beside cover',
    popper: 'Pop it two or three times, then let it sit until the rings settle, about 3 to 5 seconds',
    buzz: 'Start winding before it lands and keep it just fast enough to stay up and gurgling, running it tight along cover',
    frog: 'Skip it under shade or onto the mat, then twitch it across with pauses in the open holes. Wait until the line moves off before you set the hook',
    spinner: 'Let it sink to the depth you want, then slow-roll it just fast enough to feel the blades thump, bumping it into cover',
    chatter: 'Use a steady retrieve with the odd rip and pause. When it touches weed, snap it free, because that is when bites come',
    squarebill: 'Wind it steadily so it digs and deflects off rocks and wood, with a short pause after each bump',
    midcrank: 'Wind quickly at first to get it down, then keep it ticking the bottom or rocks, pausing when it deflects',
    deepcrank: 'Make long casts and crank hard to reach depth, then keep it digging along the drop-off',
    lipless: 'Yo-yo it: rip it off the bottom, then let it fall back on a semi-slack line. Over weed, wind it just over the tops',
    jerk: 'Give it two or three sharp twitches on a slack line, then pause',
    swim: 'Count it down to the depth, then wind slowly and steadily, just fast enough for the tail to kick',
    blade: 'Lift the rod 30 to 60 cm to feel it vibrate, then let it fall back on a tight line',
    texas: 'Let it fall on a semi-slack line, then lift and drag it slowly along the bottom, pausing beside cover',
    jig: 'Crawl and hop it slowly over rocks and wood. Most bites come as it falls',
    wacky: 'Let it fall slowly on a slack line, give it a light twitch or two and let it fall again. Most bites come on the fall',
    ned: 'Drag it slowly along the bottom with tiny hops and long pauses. Less action is more',
    dropshot: 'Hold the weight in place on the bottom and gently shake the slack line so the bait quivers without moving far. Move a little and repeat',
    carolina: 'Make long casts and sweep the rod sideways slowly to drag the weight over the bottom, pausing when you feel structure'
  }[L.id];
  let tune = '';
  if (L.id === 'jerk') tune = slow ? ' for 5 to 10 seconds. In cold water most bites come on the long pause' : ' for 1 to 3 seconds. Most bites come on the pause';
  else if (slow) tune = L.cat === 'top' ? '. Slow the cadence right down today' : '. Fish it slower than usual today, keeping it close to the bottom or cover';
  else if (fast && (L.cat === 'moving')) tune = '. With active fish you can speed it up and burn it closer to the surface';
  else if (k.wind < 5 && L.cat === 'top') tune = '. In calm water, use a gentler, slower rhythm';
  return base + tune + '.';
}

function depthFor(L, k) {
  const z = k.zone;
  if (L.depth[1] === 0) return `Surface, over fish likely holding in about 0–${Math.max(1, Math.min(z.hi, 2))} m`;
  const lo = Math.max(L.depth[0], z.lo), hi = Math.min(L.depth[1], z.hi);
  if (hi >= lo) return `About ${lo}–${hi} m`;
  return `About ${L.depth[0]}–${L.depth[1]} m (this lure's working depth, close to the likely band of ${z.lo}–${z.hi} m)`;
}

function recommendLures(c, clarity) {
  const k = lureConditions(c, clarity);
  const ranked = LURES.map(L => scoreLure(L, k)).sort((p, q) => q.s - p.s);
  const picks = [], perCat = {};
  for (const r of ranked) {
    const cat = r.L.cat === 'finesse' ? 'bottom' : r.L.cat;
    const cap = cat === 'top' ? 1 : 2;
    if ((perCat[cat] || 0) >= cap) continue;
    perCat[cat] = (perCat[cat] || 0) + 1;
    picks.push(r);
    if (picks.length === 3) break;
  }
  return {
    k, zone: k.zone,
    picks: picks.map((r, n) => ({
      rank: n + 1, name: r.L.name, colour: colourFor(r.L, k), depth: depthFor(r.L, k),
      where: locationFor(r.L, k), how: retrieveFor(r.L, k),
      why: r.why.slice(0, 3)
    }))
  };
}

function buildAdvice(c) {
  const b = c.best;
  // Phase from estimated water temperature (it drives bass behaviour more than air temperature)
  const phase = c.meanTemp < 14 ? 'cold' : c.meanTemp < 19 ? 'cool' : c.meanTemp <= 26 ? 'warm' : 'hot';
  const sky = b.cloud >= 60 ? 'overcast' : b.cloud < 30 ? 'bright' : 'partly cloudy';
  const where = c.region === 'sa' ? '' : ' in ' + REGION_PHRASE[c.region];
  const outlook = b.score >= 68
    ? "Conditions favour an active bite: cover water first, then slow down on the best cover."
    : b.score < 55
      ? "Expect a tougher bite: fish slowly, downsize and stay on high-percentage cover."
      : "Expect a fair bite: start with a search bait and adjust to what the fish tell you.";
  const wtxt = c.waterSrc === 'measured' ? `water ${c.water.toFixed(1)}°C as you measured it` : c.waterSrc === 'adjusted' ? `water about ${Math.round(c.water)}°C from your reading` : `water about ${Math.round(c.water)}°C`;
  const summary = `${c.season} day${where}, ${wtxt} (${phase}) and ${sky} skies. ${outlook}`;

  const whereItems = {
    cold: [
      "Bank: sunny banks and rocky points that catch the afternoon sun. Fish slowly and pause between moves.",
      "Boat or kayak: sit on deeper edges and channel breaks, roughly 3 to 6 m, beside flats. Work them in the warmest part of the day."
    ],
    cool: [
      "Bank: points, rocky banks and the transition between flats and drop-offs.",
      "Boat or kayak: mid-depth edges around 2 to 5 m, creek channel swings and wind-blown points."
    ],
    warm: [
      "Bank: weed edges, laydowns, rocks, shaded banks and wind-blown points.",
      "Boat or kayak: work cover at about 1 to 4 m and the first drop-off, covering water with the trolling motor or paddle."
    ],
    hot: [
      "Bank: shade, trees, jetties and wind-blown points. Fish first and last light, then rest the middle of the day.",
      "Boat or kayak: after first light, move to deeper structure around 4 to 8 m and cover beside deep water. Look for baitfish on the sounder."
    ]
  }[phase].slice();

  const throwItems = {
    cold: [
      "Suspending jerkbait with 5 to 10 second pauses, blade baits, and a slow-rolled jig or shaky head at 1/8 to 1/4 oz.",
      "Drop to 8 to 10 lb fluorocarbon where the water is clear."
    ],
    cool: [
      "Jerkbaits, mid-depth crankbaits and slow-rolled spinnerbaits around 3/8 oz.",
      "Switch to a jig or Texas-rigged creature bait on harder cover when they ignore moving baits."
    ],
    warm: [
      "Topwater early and late (walking bait, popper, buzzbait), then swim jigs, spinnerbaits and Texas-rigged worms as the sun climbs.",
      "Kurper-coloured swimbaits and crankbaits (bluegill and bream patterns) suit most SA dams."
    ],
    hot: [
      "Topwater and buzzbaits at first light, then Carolina rigs, drop shots and big worms on deeper structure.",
      "When the bite goes quiet, slow down and downsize. Fish rarely chase in hot, bright midday water."
    ]
  }[phase].slice();

  if (b.cloud >= 60) throwItems.push("Overcast helps: fish roam shallower and chase. Cover water with spinnerbaits, chatterbaits and crankbaits in brighter or darker colours.");
  else if (b.cloud < 30) throwItems.push("Bright and clear: fish tuck into shade and deeper cover. Use natural, translucent colours, smaller baits and longer pauses.");
  else throwItems.push("Mixed light: start with a search bait, then slow down with a jig or worm on the best cover.");
  const clar = clarityIndex(c.clarity || 'slight');
  throwItems.push([
    'Clear water: natural, translucent colours, lighter line and longer casts. Finesse baits and jerkbaits shine.',
    'Slightly stained water: natural colours with a touch of chartreuse or flash. Most baits work.',
    'Stained water: brighter or darker solid colours and baits with vibration or rattles, such as spinnerbaits, chatterbaits and squarebills.',
    'Muddy water: black and blue or chartreuse, big thumping blades and rattles. Fish shallower and closer to cover.'
  ][clar] + (c.clarity ? '' : ' (Assuming slightly stained. Set the clarity above for this spot.)'));

  const timing = [];
  const midWin = (c.startH + c.endH) / 2;
  const lowLight = (Number.isFinite(c.sunriseH) && Math.abs(midWin - c.sunriseH) <= 1.5) ||
                   (Number.isFinite(c.sunsetH) && Math.abs(midWin - c.sunsetH) <= 1.5);
  if (lowLight) timing.push("Your best window sits around first or last light. Fish shallow cover and flats with topwater and shallow reaction baits, then move deeper as the light climbs.");
  else timing.push("Your best window falls in the middle of the day. Expect fish tight to shade or deeper structure, and favour the cloudier or windier hours.");

  if (b.wind < 5) timing.push("Calm: make long casts and stay quiet. Topwater and finesse baits work, and sound carries, so keep boat noise and your shadow off the water.");
  if (b.h && Number.isFinite(b.h.wind_direction_10m) && b.wind >= 5) timing.push(windCallFor(b.wind, b.h.wind_direction_10m));
  if (b.wind >= 5) {
    if (b.wind <= 18) timing.push("A light to moderate breeze is ideal. Fish the wind-blown bank with spinnerbaits or crankbaits" + (settings.angler === 'bank' ? "." : ", and drift a boat with a drogue."));
    else timing.push("Strong wind: fish sheltered coves and the lee side, use 3/8 to 1/2 oz baits and heavier line to keep contact" + (settings.angler === 'bank' ? "." : ", and take care in a boat."));
  }

  if (c.stage && c.stage.key !== 'normal') timing.unshift(c.stage.note);
  if (b.postF > 0.3) timing.push("A cold front has just passed. Expect a slower bite for a day or two: slow down, downsize and fish tight to cover, and give the afternoon a go as the water warms.");
  else if (b.preF > 0.3) timing.push("Pressure is falling ahead of a change. Bass often feed hard before a front, so cover water with moving baits while it lasts.");
  if (c.deltaP != null && !(b.postF > 0.3 || b.preF > 0.3)) {
    if (c.deltaP <= -4) timing.push("Pressure is dropping fast. Fish often feed ahead of a front, so cover water with reaction baits and expect conditions to change quickly.");
    else if (c.deltaP <= -2) timing.push("Pressure is falling steadily, which anglers usually read as a good sign. Fish moving baits.");
    else if (c.deltaP >= 4) timing.push("Pressure is climbing fast. Fish usually tighten to cover and get fussy, so slow down, downsize and fish close to structure.");
    else if (c.deltaP >= 2) timing.push("Pressure is rising. The bite may be tougher at first and improve as it settles.");
    else timing.push("Pressure is steady, so fish should follow normal light and temperature patterns.");
  }
  if (b.rain >= 60) timing.push("High chance of rain. Light rain can switch the bite on, but heavy rain or thunder means getting off the water.");
  if (c.moon && (c.moon.phase === 'New moon' || c.moon.phase === 'Full moon')) {
    timing.push(`Near the ${c.moon.phase.toLowerCase()}, some anglers see stronger feeding at first and last light. Treat it as a tie-breaker, not a rule.`);
  }

  const local = (REGIONAL[c.region] && REGIONAL[c.region][c.season]) || REGIONAL.sa[c.season];

  const before = [
    "Check the dam's permit and bag rules. They differ by dam and province, and some dams are run by a club or authority.",
    "Check the current water level. Falling levels push fish off bank cover, and rising stained water moves them into flooded bushes and edges."
  ];
  if (b.wind >= 25 && settings.angler !== 'bank') before.unshift("Wind at this strength is risky for kayaks and small boats. Stay off open water or fish sheltered arms.");
  if (b.rain >= 40 && c.region !== 'wc') before.unshift("Thunderstorm risk: leave the water at the first thunder, and keep clear of the dam wall and open banks.");
  if (phase === 'hot') before.push("In hot conditions, handle fish quickly and keep them in the water as much as you can before release.");

  return {
    summary,
    lures: recommendLures(c, c.clarity),
    sections: [
      { title: 'Where to fish', items: whereFor(whereItems) },
      { title: 'What to throw', items: throwItems },
      { title: 'Timing and weather', items: timing },
      { title: `${REGION_NAME[c.region]} in ${c.season.toLowerCase()}`, items: local },
      { title: 'Before you go', items: before, wide: true }
    ]
  };
}

let lastAdviceCtx = null;
function renderAdvice(c) {
  lastAdviceCtx = c;
  c.clarity = getClarity(selected);
  syncClarityControl(c.clarity);
  const adv = buildAdvice(c);
  $('tips').innerHTML = lureCardsHtml(adv.lures, c.clarity) +
    `<details class="more"><summary>Where to fish, timing and local advice</summary><div class="advice">` + adv.sections.map(sec =>
    `<div class="adv${sec.wide ? ' wide' : ''}"><h3>${esc(sec.title)}</h3><ul>${sec.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`
  ).join('') + `</div></details>`;
  renderOutlook(c, adv);
  $('adviceHint').textContent = c.region === 'sa'
    ? 'This spot is outside the regions this page knows well, so the local notes are general.'
    : `Tuned for ${REGION_PHRASE[c.region]} in ${c.season.toLowerCase()}. Location is worked out from the coordinates.`;
  if (settings.angler !== 'both') $('adviceHint').textContent += settings.angler === 'bank' ? ' Showing bank fishing advice (change in Settings).' : ' Showing boat and kayak advice (change in Settings).';
}

function lureCardsHtml(rec, clarity) {
  if (!rec || !rec.picks.length) return '';
  const z = rec.zone;
  const row = (label, val) => `<div class="lurerow"><dt>${label}</dt><dd>${esc(val)}</dd></div>`;
  const card = (p, best) => `<article class="lurecard${best ? ' best' : ''}">
      <h4><span class="lurerank">${p.rank}</span>${esc(p.name)}${best ? '<span class="bestbet">Best bet</span>' : ''}</h4>
      <dl>${row('Colour', p.colour)}${row('Depth', p.depth)}${row('Where', p.where)}${row('How to fish it', p.how)}</dl>
      ${p.why.length ? `<p class="lurewhy"><strong>Why:</strong> ${esc(p.why.slice(0, 2).map((w, n) => n ? w : w.charAt(0).toUpperCase() + w.slice(1)).join('; '))}.</p>` : ''}
    </article>`;
  const rest = rec.picks.slice(1);
  return card(rec.picks[0], true) +
    `<p class="lurezone">Likely depth: about ${z.lo}&ndash;${z.hi} m, because ${esc(z.why)}. A starting point from typical bass behaviour, not a reading of your dam.${clarity ? '' : ' Clarity is not set, so slightly stained is assumed.'}</p>` +
    (rest.length ? `<details class="more"><summary>${rest.length === 1 ? 'One more option' : rest.length + ' more options'}: ${esc(rest.map(p => p.name).join(' and '))}</summary><div class="lurecards">${rest.map(p => card(p, false)).join('')}</div></details>` : '');
}
const firstSentence = t => { const m = String(t || '').match(/^.*?[.!?](\s|$)/); return (m ? m[0] : String(t || '')).trim().replace(/[.!?]$/, ''); };
// The outlook at the top of the Forecast: a plain-language summary, any safety warning and where to start.
function renderOutlook(c, adv) {
  const rec = adv.lures, top = rec && rec.picks[0], k = rec ? rec.k : null, b = c.best, s = c.dayScore;
  const lead = s >= 80 ? 'Conditions look excellent' : s >= 68 ? 'Conditions look promising' : s >= 55 ? 'Conditions look fair' : s >= 40 ? 'Expect a slow bite' : 'Expect a tough day';
  const why = [];
  if (k && k.post) why.push('a cold front has just passed');
  else if (k && k.pre) why.push('pressure is falling ahead of a change');
  if (c.stage && c.stage.key === 'prespawn') why.push('bass are feeding up before the spawn');
  else if (c.stage && c.stage.key === 'spawn') why.push('many bass are on their beds');
  else if (c.stage && c.stage.key === 'fall') why.push('bass are feeding up for winter');
  else if (c.water < 14) why.push('cold water is slowing bass down');
  else if (c.water >= 28) why.push('warm water pushes bass deep or into shade as the sun climbs');
  if (why.length < 2 && k && k.low) why.push('your best window is in the low light');
  let where = top ? firstSentence(top.where).split(/,\s*plus\s|;\s*|\s+with\s|,\s*beside\s|,\s*where\s|,\s*ideally\s|:\s*/)[0] : '';
  if (where) where = where.charAt(0).toLowerCase() + where.slice(1);
  $('windowReason').textContent = `${lead}${why.length ? ': ' + why.slice(0, 2).join(' and ') : ''}.` + (where ? ` Start around ${where}.` : '');
  const warn = b.thunder ? 'Thunderstorms are likely around your best window. Get off the water at the first thunder.'
    : b.wind >= 25 ? 'Strong wind. Take care on open water, especially in kayaks and small boats.' : '';
  $('outlookWarn').hidden = !warn;
  $('outlookWarn').textContent = warn ? '⚠ ' + warn : '';
  const box = $('startWith');
  if (!top) { box.hidden = true; return; }
  const r = (label, val) => `<div><dt>${label}</dt><dd>${esc(val)}</dd></div>`;
  const short = t => { t = firstSentence(t); if (t.length <= 70) return t; const cut = t.lastIndexOf(',', 70); return cut > 25 ? t.slice(0, cut) : t; };
  const depth = /^Surface/.test(top.depth) ? 'Surface' : top.depth.replace(/ \(this lure.*$/, '');
  box.innerHTML = `<dl>${r('Start with', top.name)}${r('Colour', short(top.colour.split(/,\s*which\s|,\s*for\s/)[0]))}${r('Depth', depth)}${r('Technique', short(top.how))}</dl>`;
  box.hidden = false;
}
function renderPressureRow(t, label) {
  if (!t) return;
  const now = t.now != null ? Math.round(t.now) + ' hPa' : '';
  if (t.pattern) {
    const pat = PRESSURE_PATTERNS[t.pattern];
    $('condPressure').textContent = pat.label;
    const d = t.d48 != null ? t.d48 : t.d24, span = t.d48 != null ? 48 : 24;
    $('condPressureNote').textContent = `${now} ${label.startsWith('Now') ? 'now' : 'at your best hour'}, ${Math.abs(d) < 1 ? 'about the same as ' + span + ' hours ago' : (d > 0 ? 'up ' : 'down ') + Math.abs(d).toFixed(1) + ' hPa over ' + span + ' hours'}.`;
  } else {
    const d = t.d6;
    $('condPressure').textContent = d == null ? (now || '–') : Math.abs(d) < 1.5 ? 'Steady' : d > 0 ? 'Rising' : 'Falling';
    $('condPressureNote').textContent = `${now}. Only a ${t.hist}-hour history is available, so this is the 6-hour trend.`;
  }
}
function syncClarityControl(v) {
  const seg = $('claritySeg'); if (!seg) return;
  seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.clarity === v)));
  const c = CLARITY.find(x => x.k === v);
  $('clarityNote').textContent = c ? c.note + ' Saved for this spot.' : 'Not set yet, so slightly stained is assumed. Pick what you see at the dam.';
  $('condClarity').textContent = c ? c.t : 'Not set';
  $('toClarity').textContent = c ? 'Change' : 'Set water clarity';
}
/* jump links from the outlook and the conditions list */
function jumpTo(el) { if (!el) return; el.scrollIntoView({ behavior: motionOff() ? 'auto' : 'smooth', block: 'start' }); }
$('toGuide').addEventListener('click', () => jumpTo($('guide')));
$('toClarity').addEventListener('click', () => { jumpTo($('clarityBox')); const b = $('claritySeg').querySelector('[aria-pressed="true"]') || $('claritySeg').querySelector('button'); if (b) setTimeout(() => b.focus({ preventScroll: true }), 300); });
/* measured water temperature controls */
$('wtEdit').addEventListener('click', () => {
  const m = getMeasured(selected, Number($('lat').value), Number($('lon').value));
  $('wtForm').hidden = false; $('wtMsg').textContent = '';
  $('wtInput').value = m ? m.v.toFixed(1) : '';
  $('wtInput').focus();
});
$('wtCancel').addEventListener('click', () => { $('wtForm').hidden = true; $('wtMsg').textContent = ''; });
$('wtForm').addEventListener('submit', e => {
  e.preventDefault();
  const r = parseWaterInput($('wtInput').value);
  if (r.err) { $('wtMsg').textContent = r.err; $('wtInput').focus(); return; }
  const ok = setMeasured(selected, Number($('lat').value), Number($('lon').value), { v: r.v, at: Date.now(), date: localISODate(new Date()) });
  if (!ok) { $('wtMsg').textContent = 'This browser would not save the reading.'; return; }
  $('wtForm').hidden = true;
  load({ reuse: true });
});
$('wtClear').addEventListener('click', () => {
  setMeasured(selected, Number($('lat').value), Number($('lon').value), null);
  $('wtForm').hidden = true;
  load({ reuse: true });
});
$('claritySeg').addEventListener('click', e => {
  const b = e.target.closest('button[data-clarity]');
  if (!b) return;
  setClarity(selected, b.dataset.clarity);
  if (lastAdviceCtx) renderAdvice(lastAdviceCtx); else syncClarityControl(b.dataset.clarity);
});

let lastFetch = null;
// Each load gets a number. If you switch spots while a forecast is still on its way, the older
// answer is dropped when it arrives, so it can never be drawn under the newer spot's name.
let loadSeq = 0;
// opts.reuse re-scores the forecast already loaded (for example after you enter a water temperature) without fetching again.
async function load(opts) {
  const seq = ++loadSeq;
  const btn = $('load');
  btn.disabled = true;
  setStatus('Reading the conditions at ' + chosenName + '\u2026', false, 'loading');
  try {
    const lat = Number($('lat').value);
    const lon = Number($('lon').value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw Error('Enter a valid latitude and longitude.');
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m&daily=sunrise,sunset&past_days=7&forecast_days=7&timezone=auto`;
    let data, offlineAt = null;
    const reuse = !!(opts && opts.reuse === true && lastData && lastFetch && lastFetch.lat === lat && lastFetch.lon === lon);
    if (reuse) { data = lastData; offlineAt = lastFetch.offlineAt; }
    else try {
    let res;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      res = await fetch(url, { signal: ctrl.signal });
    } catch (netErr) {
      throw Error(netErr && netErr.name === 'AbortError'
        ? 'The weather service took too long to answer. Try Refresh in a moment.'
        : 'Could not reach the weather service. Check your connection and try Refresh. If this is a preview, open the file in a normal browser.');
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      let reason = '';
      try { reason = String((await res.json()).reason || '').slice(0, 200); } catch {}
      throw Error('Open-Meteo returned an error (' + res.status + ')' + (reason ? ': ' + reason : '.'));
    }
    const raw = await res.json();
    if (!raw || !raw.hourly || !raw.hourly.time || !raw.hourly.time.length) throw Error('Open-Meteo returned no hourly forecast.');
    data = cleanForecast(raw);
    if (!data) throw Error('Open-Meteo returned a forecast this app could not read.');
    saveForecast(lat, lon, data);
    } catch (fetchErr) {
      const c = cachedForecast(lat, lon);
      if (!c) throw fetchErr;
      data = c.data; offlineAt = new Date(c.savedAt);
    }
    if (seq !== loadSeq) return;   // a newer load has started; let it draw instead
    if (!data.hourly || !data.hourly.time || !data.hourly.time.length) throw Error('Open-Meteo returned no hourly forecast.');
    if (!data.daily || !data.daily.time || !data.daily.time.length) throw Error('Open-Meteo returned no daily forecast.');

    // Scoring context: estimated water temperature, its trend and fronts, from the past week plus the forecast
    const ctx = applyMeasured(buildContext(data), getMeasured(selected, lat, lon));
    lastData = data; lastCtx = ctx; lastFetch = { lat, lon, offlineAt };
    const firstFc = ctx.histDays;                         // index of today in the daily list
    const fcDays = data.daily.time.slice(firstFc);
    let day = $('forecastDay').value || fcDays[0];
    if (!fcDays.includes(day)) {
      day = fcDays[0];
      $('forecastDay').value = day;
    }

    const dayIndex = data.daily.time.indexOf(day);
    const noon = new Date(day + 'T12:00:00');
    const season = seasonFor(noon);
    const moon = moonInfo(noon);
    const sunrise = data.daily.sunrise[dayIndex];
    const sunset = data.daily.sunset[dayIndex];

    const influence = currentInfluence();
    const r = scoreDayV2(data, dayIndex, ctx, influence.a);
    if (!r) throw Error('No hourly data for the selected day.');
    const arr = r.arr, best = r.best, startH = r.startH, endH = r.endH;
    const safeAvg = Number.isFinite(r.dayScore) ? r.dayScore : 0;
    const twTxt = waterText(r.water, r.trend, ctx.waterSrc[day]);
    try { renderWaterBox(ctx, day); } catch (e) { console.error('water box', e); }

    placeDate = noon.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });
    setPlaceTag();
    $('bestWindow').textContent = `Best ${hh(startH)}\u2013${hh(endH)}`;
    $('dailyScore').innerHTML = `<span class="num">${safeAvg}</span><span class="of">out of 100</span>`;
    $('quality').textContent = quality(safeAvg) + ' conditions';
    updateGauge(safeAvg);
    // Conditions list (the outlook summary itself is written by renderAdvice, which knows the top lure)
    $('condWhen').textContent = `At your best hour, ${hh(startH)} to ${hh(endH)}`;
    const airs = r.daylight.map(x => x.temp).filter(Number.isFinite);
    $('condAir').textContent = best.temp != null ? Math.round(best.temp) + '°C' : '–';
    $('condAirNote').textContent = airs.length ? `Between ${Math.round(Math.min(...airs))} and ${Math.round(Math.max(...airs))}°C through the daylight hours.` : '';
    $('condSeason').textContent = !r.stage || r.stage.key === 'normal' ? season + ', settled' : r.stage.key === 'winter' ? season + ', cold-water pattern' : r.stage.key === 'summer' ? season + ', summer heat' : r.stage.label;
    $('condSeasonNote').textContent = r.stage ? r.stage.note : '';
    $('sunrise').textContent = time(sunrise);
    $('sunset').textContent = time(sunset);
    $('pressure').textContent = Math.round(best.pressure) + ' hPa';
    const wdir = safeNum(best.h.wind_direction_10m, NaN);
    $('wind').textContent = fmtWind(best.wind) + (Number.isFinite(wdir) ? ' ' + compass(wdir) : '');
    $('windCall').textContent = firstSentence(windCallFor(best.wind, wdir)) + (windCallFor(best.wind, wdir) ? '.' : '');
    const stageTxt = !r.stage || r.stage.key === 'normal' ? '' : r.stage.key === 'winter' ? ', cold-water pattern' : r.stage.key === 'summer' ? ', summer heat pattern' : ', ' + r.stage.label.toLowerCase() + ' stage';
    $('season').textContent = season + ' in the southern hemisphere' + stageTxt + '.';
    $('moon').textContent = moon.phase + ', ' + moon.illum + '% lit.';
    try { renderMoonStrip(moon); renderSolunar(moon, sunrise, sunset); } catch (e) { console.error('moon strip', e); }

    // hour bars
    currentHours = arr.filter(x => { const t = hourOf(x.h.time); return t >= 5 && t <= 20; });
    $('hours').classList.remove('in');
    $('hours').innerHTML = currentHours.map((x, n) => {
      const t = hourOf(x.h.time);
      const inWin = t >= startH && t < endH;
      return `<button type="button" class="bar b-${bandKey(x.score)}${inWin ? ' win' : ''}${x.night ? ' dark' : ''}" data-i="${x.i}" aria-pressed="false" aria-label="${hh(t)}, score ${x.score}${inWin ? ', in best window' : ''}${x.night ? ', before sunrise or after sunset' : ''}">
        <span class="track"><span class="fill" style="--h:${Math.max(6, x.score)}%;--t:${heat(x.score)};--i:${n}"></span></span>
        <span class="lbl${t % 3 === 0 ? ' show' : ''}">${t}</span>
      </button>`;
    }).join('') || '<p class="hint">No hourly slots between 05:00 and 20:00.</p>';
    requestAnimationFrame(() => requestAnimationFrame(() => $('hours').classList.add('in')));
    showHour(currentHours.find(x => x.i === best.i) || currentHours[0]);

    // factors
    renderFactors(r, influence);

    // advice
    const pm = data.hourly.pressure_msl;
    const deltaP = (best.i >= 6 && Number.isFinite(pm[best.i]) && Number.isFinite(pm[best.i - 6])) ? pm[best.i] - pm[best.i - 6] : null;
    let pRef = best.i, pLabel = 'At your best hour (' + time(best.h.time) + ')';
    if (day === localISODate(new Date())) {
      const nowKey = day + 'T' + String(new Date().getHours()).padStart(2, '0') + ':00';
      const ni = data.hourly.time.indexOf(nowKey);
      if (ni >= 0) { pRef = ni; pLabel = 'Now (' + nowKey.slice(11) + ')'; }
    }
    const pRefVal = Number.isFinite(pm[pRef]) ? pm[pRef] : best.pressure;
    const d6Ref = (pRef >= 6 && Number.isFinite(pm[pRef]) && Number.isFinite(pm[pRef - 6])) ? pm[pRef] - pm[pRef - 6] : null;
    try { updatePressureGauge(pRefVal, d6Ref); } catch (e) { console.error('pressure gauge', e); }
    try { const pt = renderPressureTrend(data, pRef, pLabel); renderPressureRow(pt, pLabel); } catch (e) { console.error('pressure trend', e); $('pressureTrend').innerHTML = '<p class="pnote">The 24 and 48 hour trend could not be drawn for this forecast.</p>'; }
    const clockH = t => { const m = time(t).match(/^(\d\d):(\d\d)$/); return m ? +m[1] + +m[2] / 60 : NaN; };
    renderAdvice({
      region: regionFor(lat, lon), season, meanTemp: r.water, water: r.water, waterSrc: ctx.waterSrc[day], trend: r.trend, stage: r.stage, dayScore: safeAvg,
      best, startH, endH, deltaP, moon, sunriseH: clockH(sunrise), sunsetH: clockH(sunset)
    });

    try { renderContext(data, day, best, startH, endH, sunrise, sunset); } catch (e) { console.error('BassCast context error:', e); }
    renderWeek(data, ctx, influence.a);
    updateLogForecast();
    const top = fcDays.filter(d => dayInfo[d]).reduce((a, d) => !a || dayInfo[d].avg > dayInfo[a].avg ? d : a, null);
    if (top) {
      const wd = new Date(top + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'long' });
      $('bestDay').textContent = top === localISODate(new Date()) ? `Today is the best of the next ${fcDays.length} (${dayInfo[top].avg})` : `${wd} is the best of the next ${fcDays.length} (${dayInfo[top].avg})`;
    }
    if (offlineAt) {
      const d = offlineAt, sameDay = localISODate(d) === localISODate(new Date());
      const stamp = (sameDay ? '' : d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) + ' ') + d.toTimeString().slice(0, 5);
      setStatus(`Offline, last updated ${stamp}. Showing the saved forecast.`, false, 'offline');
    } else setStatus(`Forecast ready for ${placeDate}. Times are in ${data.timezone || 'local time'}.`, false, 'ready');
  } catch (e) {
    if (seq !== loadSeq) return;
    console.error('BassCast load error:', e);
    setStatus(e && e.message ? e.message : 'Something went wrong loading the forecast.', true);
  } finally {
    if (seq === loadSeq) btn.disabled = false;
  }
}

// Small weather icon for a day, from its best hour. Presentation only.
const WXI = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const WX = {
  sun: { label: 'Sunny', svg: WXI('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>') },
  part: { label: 'Partly cloudy', svg: WXI('<path d="M9 4.5v1.3M4.4 6.4l.9.9M3 11h1.3M13.6 6.4l-.9.9"/><path d="M6.6 11.2a3.2 3.2 0 0 1 5.9-1.9"/><path d="M8 19h9a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.4 1.9A2.6 2.6 0 0 0 8 19z"/>') },
  cloud: { label: 'Cloudy', svg: WXI('<path d="M7 18.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.6A3.2 3.2 0 0 0 7 18.5z"/>') },
  fog: { label: 'Fog', svg: WXI('<path d="M4 9h16M6 13h12M4 17h16"/>') },
  rain: { label: 'Rain', svg: WXI('<path d="M7 15.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.6A3.2 3.2 0 0 0 7 15.5z"/><path d="M8.5 18.5l-1 2M12.5 18.5l-1 2M16.5 18.5l-1 2"/>') },
  storm: { label: 'Thunderstorms', svg: WXI('<path d="M7 14.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.6A3.2 3.2 0 0 0 7 14.5z"/><path d="m12.5 15-2 3.5h3l-2 3.5"/>') }
};
function wxKind(h) {
  const c = safeNum(h && h.h && h.h.weather_code, 0), cloud = safeNum(h && h.cloud, 0);
  if (c >= 95) return 'storm';
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 'rain';
  if (c === 45 || c === 48) return 'fog';
  if (cloud >= 70 || c === 3) return 'cloud';
  if (cloud >= 30 || c === 2) return 'part';
  return 'sun';
}

function localISODate(d) {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 10);
}

// Scores every day in the data (the past week too, so sessions you log afterwards still get a score),
// and shows the forecast days from today in the week strip.
function renderWeek(data, ctx, a) {
  try {
    const selected = $('forecastDay').value;
    ctx = ctx || buildContext(data);
    dayInfo = {};
    data.daily.time.forEach((day, idx) => {
      const r = scoreDayV2(data, idx, ctx, a);
      if (!r) return;
      dayInfo[day] = { avg: r.dayScore, best: time(r.best.h.time), window: `${hh(r.startH)} to ${hh(r.endH)}`, factors: r.winFactors, water: Math.round(r.water * 10) / 10, wx: wxKind(r.best) };
    });
    const cards = data.daily.time.slice(ctx.histDays).filter(d => dayInfo[d]);
    $('week').innerHTML = cards.map(day => {
      const c = dayInfo[day], d = new Date(day + 'T12:00:00');
      return `<button type="button" class="day b-${bandKey(c.avg)}" data-day="${esc(day)}" aria-pressed="${day === selected}" aria-label="${d.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })}, score ${c.avg}, ${quality(c.avg).toLowerCase()}, ${WX[c.wx].label.toLowerCase()}">
        <div class="dn">${d.toLocaleDateString('en-ZA', { weekday: 'short' })} ${d.getDate()}</div>
        <span class="wx" title="${WX[c.wx].label}">${WX[c.wx].svg}</span>
        <span class="badge">${c.avg}</span>
        <div class="db">${quality(c.avg)}</div>
      </button>`;
    }).join('');
  } catch (err) {
    console.error('renderWeek error:', err);
    $('week').innerHTML = '<p class="hint">Could not build the weekly outlook. Try Refresh.</p>';
  }
}

$('week').addEventListener('click', e => {
  const b = e.target.closest('[data-day]');
  if (!b) return;
  $('forecastDay').value = b.dataset.day;
  load();
});
$('hours').addEventListener('click', e => {
  const b = e.target.closest('.bar');
  if (!b) return;
  showHour(currentHours.find(x => x.i === +b.dataset.i));
});

/* ---------- map and spots ---------- */
const dams = [
  { name: 'Theewaterskloof Dam', lat: -34.05, lon: 19.32 },
  { name: 'Clanwilliam Dam', lat: -32.18, lon: 18.95 },
  { name: 'Brandvlei Dam', lat: -33.78, lon: 19.45 },
  { name: 'Kwaggaskloof Dam', lat: -33.79, lon: 19.56 },
  { name: 'Wemmershoek Dam', lat: -33.85, lon: 19.03 },
  { name: 'Roodeplaat Dam', lat: -25.63, lon: 28.36 },
  { name: 'Hartbeespoort Dam', lat: -25.73, lon: 27.86 },
  { name: 'Bronkhorstspruit Dam', lat: -25.82, lon: 28.75 },
  { name: 'Rust de Winter Dam', lat: -25.19, lon: 28.58 },
  { name: 'Albert Falls Dam', lat: -29.45, lon: 30.45 },
  { name: 'Inanda Dam', lat: -29.67, lon: 30.88 },
  { name: 'Nagle Dam', lat: -29.57, lon: 30.76 },
  { name: 'Midmar Dam', lat: -29.50, lon: 30.20 }
];

// Build the dam options in the spot menu from the list above, so dams live in one place.
(function buildDamOptions() {
  const sel = $('water'), before = sel.querySelector('option[value="custom"]');
  dams.forEach(d => {
    const o = document.createElement('option');
    o.value = d.lat.toFixed(2) + ',' + d.lon.toFixed(2) + ',' + d.name;
    o.textContent = d.name;
    sel.insertBefore(o, before);
  });
})();

const SPOT_KEY = 'basscastSpots';
let map = null, tempMarker = null, spotLayer = null, mapShown = false;
let baseLayers = null;
// Switch the visible base layer (used by the Settings "Default map layer" choice).
function setMapLayer(name) {
  if (!map || !baseLayers || !baseLayers[name]) return;
  Object.keys(baseLayers).forEach(k => { if (k !== name && map.hasLayer(baseLayers[k])) map.removeLayer(baseLayers[k]); });
  if (!map.hasLayer(baseLayers[name])) baseLayers[name].addTo(map);
}
let spots = [], selected = null, editingId = null;

const cleanName = n => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 60);
const newId = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const validLL = (la, lo) => Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180;

function loadSpots() {
  try {
    const a = JSON.parse(localStorage.getItem(SPOT_KEY) || '[]');
    return Array.isArray(a)
      ? a.filter(x => x && x.id && validLL(+x.lat, +x.lon)).map(x => ({ id: String(x.id), name: cleanName(x.name) || 'My spot', lat: +x.lat, lon: +x.lon }))
      : [];
  } catch { return []; }
}
function saveSpots() {
  try { localStorage.setItem(SPOT_KEY, JSON.stringify(spots)); return true; } catch { return false; }
}

// Score badges for the map (redesign). spotMeta() comes from ui.js and returns today's score for a
// place once the spot scores have loaded; until then the badge shows a neutral dot.
let damMarkers = [], spotMarkers = [];
function markerIcon(kind, lat, lon, label) {
  const m = typeof spotMeta === 'function' ? spotMeta(lat, lon) : null;
  const sel = selected && Math.abs(selected.lat - lat) < 1e-4 && Math.abs(selected.lon - lon) < 1e-4;
  const cls = 'mkb mk-' + kind + (m ? ' b-' + bandKey(m.score) : ' none') + (sel ? ' sel' : '');
  const tip = esc(label || '') + (m ? ', ' + m.score + ' ' + quality(m.score).toLowerCase() : '');
  return L.divIcon({
    className: 'mk',
    html: `<span class="${cls}" title="${tip}">${m ? m.score : ''}</span>`,
    iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -18]
  });
}
function refreshMarkerIcons() {
  if (!map) return;
  damMarkers.forEach(x => x.m.setIcon(markerIcon('dam', x.d.lat, x.d.lon, x.d.name)));
  spotMarkers.forEach(x => x.m.setIcon(markerIcon('spot', x.sp.lat, x.sp.lon, x.sp.name)));
}
function pinIcon(fill, dot) {
  return L.divIcon({
    className: 'pin-icon',
    html: `<svg width="30" height="38" viewBox="0 0 30 38" aria-hidden="true"><path d="M15 36C15 36 3 23 3 14a12 12 0 0 1 24 0c0 9-12 22-12 22z" fill="${fill}" stroke="#0B1418" stroke-width="2"/><circle cx="15" cy="14" r="4.5" fill="${dot}"/></svg>`,
    iconSize: [30, 38], iconAnchor: [15, 36], popupAnchor: [0, -32]
  });
}

function damOptionValue(name) {
  const o = [...$('water').options].find(x => x.value.split(',')[2] === name);
  return o ? o.value : 'custom';
}
function syncSelect() {
  if (!selected) return;
  $('water').value = selected.kind === 'dam' ? damOptionValue(selected.name)
    : selected.kind === 'spot' ? 'spot:' + selected.id : 'custom';
}

function renderSpotSelect() {
  const old = $('mySpotsGroup');
  if (old) old.remove();
  if (!spots.length) return;
  const g = document.createElement('optgroup');
  g.id = 'mySpotsGroup';
  g.label = 'My spots';
  spots.forEach(sp => {
    const o = document.createElement('option');
    o.value = 'spot:' + sp.id;
    o.textContent = sp.name;
    g.appendChild(o);
  });
  $('water').insertBefore(g, $('water').querySelector('option[value="custom"]'));
}

function renderMySpots() {
  const box = $('mySpots');
  if (typeof renderSpotDetails === 'function') renderSpotDetails();
  if (!spots.length) {
    box.innerHTML = '<div class="empty"><div class="emptyicon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg></div>' +
      '<div class="emptybody"><h3>Keep your own fishing spots</h3>' +
      '<p>Save the points, bays and banks you actually fish, then pull up their forecast from the spot picker whenever you like.</p>' +
      '<ol class="emptysteps"><li>Tap the map where you fish to drop a pin.</li><li>Drag it to fine-tune, then give it a name.</li><li>Press Save spot. It stays on this device.</li></ol>' +
      '<button class="btn ghost" id="emptyLocate" type="button">Start from my location</button></div></div>';
    $('emptyLocate').addEventListener('click', () => {
      if ($('map') && $('map').scrollIntoView) $('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
      $('locateMe').click();
    });
    return;
  }
  const meta = sp => (typeof spotMeta === 'function' ? spotMeta(sp.lat, sp.lon) : null);
  const ranked = spots.slice();
  if (ranked.every(meta)) ranked.sort((a, b) => meta(b).score - meta(a).score);
  box.innerHTML = ranked.map(sp => editingId === sp.id
    ? `<form class="spotrow editing" data-id="${esc(sp.id)}">
        <label class="sr" for="rn-${esc(sp.id)}">Spot name</label>
        <input id="rn-${esc(sp.id)}" value="${esc(sp.name)}" maxlength="60" autocomplete="off">
        <button class="btn" type="submit">Save name</button>
        <button class="btn ghost" type="button" data-act="cancel">Cancel</button>
      </form>`
    : `<div class="spotrow" data-id="${esc(sp.id)}">${spotBadge(meta(sp))}
        <button type="button" class="spotname" data-act="use"><strong>${esc(sp.name)}</strong><span>${meta(sp) ? spotLine(meta(sp)) : sp.lat.toFixed(3) + ', ' + sp.lon.toFixed(3)}${hasNote('s:' + sp.id) ? ' &middot; Has notes' : ''}</span></button>${spotTag(meta(sp))}
        <div class="spotbtns">
          <button type="button" class="link" data-act="rename" aria-label="Rename ${esc(sp.name)}">Rename</button>
          <button type="button" class="link" data-act="delete" aria-label="Delete ${esc(sp.name)}">Delete</button>
        </div>
      </div>`).join('');
}

// Leaderboard pieces shared by My spots and the spot picker (redesign).
function spotBadge(m) {
  return m ? `<span class="badge b-${bandKey(m.score)}" aria-hidden="true">${m.score}</span>` : '<span class="badge none" aria-hidden="true"></span>';
}
function spotTag(m) {
  return m ? `<span class="btag b-${bandKey(m.score)}">${esc(quality(m.score))}<span class="sr">, score ${m.score}</span></span>` : '';
}
function spotLine(m) {
  return `Best ${hh(m.startH)}\u2013${hh(m.endH)} &middot; ${esc(fmtWind(m.wind))}${Number.isFinite(m.dir) ? ' ' + compass(m.dir) : ''}`;
}
function spotPopup(sp) {
  const d = document.createElement('div');
  d.className = 'spotpop';
  const t = document.createElement('strong'); t.textContent = sp.name;
  const c = document.createElement('div'); c.className = 'fine'; c.textContent = `${sp.lat.toFixed(4)}, ${sp.lon.toFixed(4)}`;
  const row = document.createElement('div'); row.className = 'spotpopbtns';
  const r = document.createElement('button'); r.type = 'button'; r.textContent = 'Rename';
  r.addEventListener('click', () => { if (map) map.closePopup(); startRename(sp.id); });
  const x = document.createElement('button'); x.type = 'button'; x.textContent = 'Delete';
  x.addEventListener('click', () => armDelete(x, sp.id));
  row.append(r, x);
  d.append(t, c, row);
  return d;
}

function renderSpotMarkers() {
  if (!map || !spotLayer) return;
  spotLayer.clearLayers();
  spotMarkers = [];
  spots.forEach(sp => {
    const m = L.marker([sp.lat, sp.lon], { icon: markerIcon('spot', sp.lat, sp.lon, sp.name), title: sp.name, riseOnHover: true });
    spotMarkers.push({ m, sp });
    m.bindPopup(() => spotPopup(sp));
    m.on('click', () => applySelection({ kind: 'spot', id: sp.id, name: sp.name, lat: sp.lat, lon: sp.lon }));
    m.addTo(spotLayer);
  });
}

function refreshSpotUI() {
  renderSpotMarkers();
  renderSpotSelect();
  renderMySpots();
  syncSelect();
}

function hideTempPin() {
  if (tempMarker && map) map.removeLayer(tempMarker);
  tempMarker = null;
}
function showTempPin(lat, lon) {
  if (!map) return;
  if (tempMarker) { tempMarker.setLatLng([lat, lon]); return; }
  tempMarker = L.marker([lat, lon], { icon: pinIcon('#56C7F0', '#0B1418'), draggable: true, title: 'New spot. Drag to adjust.' }).addTo(map);
  tempMarker.on('dragend', () => {
    const p = tempMarker.getLatLng();
    applySelection({ kind: 'free', name: 'Custom fishing spot', lat: p.lat, lon: p.lng }, { form: true });
  });
}

// One place that changes the chosen spot, whatever the source (map, list, menu, coordinates, location).
function applySelection(sel, opts = {}) {
  selected = sel;
  $('lat').value = sel.lat.toFixed(4);
  $('lon').value = sel.lon.toFixed(4);
  chosenName = sel.name;
  $('logSpot').value = sel.name;
  setPlaceTag();
  $('mapPick').textContent = `${sel.name} (${sel.lat.toFixed(3)}, ${sel.lon.toFixed(3)})`;
  $('useMapLocation').disabled = false;
  syncSelect();
  if (sel.kind === 'free' && opts.form) {
    showTempPin(sel.lat, sel.lon);
    $('spotForm').hidden = false;
    if (opts.focusName) {
      $('spotName').value = `My spot ${spots.length + 1}`;
      setTimeout(() => { $('spotName').focus(); $('spotName').select(); }, 0);
    }
  } else {
    hideTempPin();
    $('spotForm').hidden = true;
  }
  if (map && opts.move) map.setView([sel.lat, sel.lon], opts.zoom || 9);
}

function startFreeSpot(lat, lon, o = {}) {
  $('spotMsg').textContent = '';
  applySelection({ kind: 'free', name: o.name || 'Custom fishing spot', lat, lon }, { form: true, focusName: true, ...o.view });
}

function startRename(id) {
  editingId = id;
  renderMySpots();
  const el = $('rn-' + id);
  if (el) {
    if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus();
    el.select();
  }
}

function renameSpot(id, name) {
  const sp = spots.find(x => x.id === id);
  const n = cleanName(name);
  if (!sp) return;
  if (!n) { $('spotMsg').textContent = 'Give the spot a name first.'; return; }
  sp.name = n;
  const ok = saveSpots();
  editingId = null;
  if (selected && selected.kind === 'spot' && selected.id === id) {
    selected.name = n;
    chosenName = n;
    $('logSpot').value = n;
    setPlaceTag();
    $('mapPick').textContent = `${n} (${sp.lat.toFixed(3)}, ${sp.lon.toFixed(3)})`;
  }
  refreshSpotUI();
  $('spotMsg').textContent = ok ? `Renamed to ${n}.` : 'Renamed for now, but this browser would not keep the change.';
}

function deleteSpot(id) {
  const sp = spots.find(x => x.id === id);
  if (!sp) return;
  spots = spots.filter(x => x.id !== id);
  const ok = saveSpots();
  if (selected && selected.kind === 'spot' && selected.id === id) {
    selected = { kind: 'free', id: null, name: sp.name, lat: sp.lat, lon: sp.lon };
  }
  if (editingId === id) editingId = null;
  if (map) map.closePopup();
  refreshSpotUI();
  $('spotMsg').textContent = ok ? `Deleted ${sp.name}.` : 'Deleted for now, but this browser would not keep the change.';
}

// Two taps to delete, so a stray tap cannot remove a spot.
function armDelete(btn, id) {
  if (btn.dataset.armed) { deleteSpot(id); return; }
  btn.dataset.armed = '1';
  const label = btn.textContent;
  btn.textContent = 'Tap again to delete';
  setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = label; } }, 3500);
}

function initMap() {
  if (typeof L === 'undefined') {
    $('map').innerHTML = '<p style="padding:16px">The map could not load. Check your connection and refresh. You can still pick a dam from the menu, or enter coordinates below to save a spot.</p>';
    return;
  }
  try {
  map = L.map('map').setView([-30.5, 25.5], 5);
  // Free layers from Esri's public tile service. No account or API key is needed, and it
  // does not require a referrer header, so it works in previews and when opened as a local file.
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  const esri = (name, attr, max) => L.tileLayer(ESRI + name + '/MapServer/tile/{z}/{y}/{x}', { maxZoom: max || 18, attribution: attr });
  const street = esri('World_Street_Map', 'Tiles &copy; Esri, HERE, Garmin, OpenStreetMap contributors', 19);
  const topo = esri('World_Topo_Map', 'Tiles &copy; Esri, HERE, Garmin, USGS, OpenStreetMap contributors');
  const sat = () => esri('World_Imagery', 'Imagery &copy; Esri, Maxar, Earthstar Geographics');
  const labels = esri('Reference/World_Boundaries_and_Places', '');
  const tilesFailed = () =>
    $('spotMsg').textContent = 'The map tiles could not load. Check your connection. You can still pick a dam from the menu or enter coordinates below.';

  // Main map: OpenFreeMap's free "Liberty" vector style (no account, key or usage limit),
  // drawn through MapLibre 6 (set up by maplibre-loader.js). It needs WebGL2; without it, or if
  // MapLibre or the style cannot load, the page falls back to the Esri street map so the map always works.
  const webgl2 = (() => {
    try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
  })();
  const vector = (webgl2 && typeof maplibregl !== 'undefined' && typeof L.maplibreGL === 'function' && window.mapLibreReady)
    ? L.maplibreGL({
        style: 'https://tiles.openfreemap.org/styles/liberty',
        // Keep this fixed text. Without it the plugin copies the tile server's own attribution
        // strings into the page as HTML, unchecked, which would let that server inject markup.
        attributionControl: { customAttribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }
      })
    : null;
  // "Map" is a group so its contents can be swapped without moving it in the layer switcher.
  // The vector map joins the group once MapLibre's worker is ready (below).
  const base = L.layerGroup(vector ? [] : [street]);
  baseLayers = { 'Map': base, 'Terrain': topo, 'Satellite': sat(), 'Hybrid': L.layerGroup([sat(), labels]) };
  (baseLayers[settings.layer] || base).addTo(map);
  L.control.layers(baseLayers, null, { position: 'topright' }).addTo(map);

  // Tell the user plainly if tiles cannot load at all.
  let fails = 0;
  street.on('tileerror', () => { if (++fails === 4) tilesFailed(); });

  if (vector) {
    // If the vector style cannot load (offline, blocked, service down), swap in the Esri street map.
    let swapped = false;
    const fallBack = () => {
      if (swapped) return;
      swapped = true;
      base.removeLayer(vector);
      base.addLayer(street);
      console.warn('BassCast: vector map unavailable, using Esri street map instead.');
    };
    // MapLibre 6 throws (GPUInitializationError) instead of firing an error event when it cannot
    // start WebGL2. Catch it here so Leaflet is not left with a half-added layer; watch() below
    // then finds no MapLibre map and swaps in the street map.
    const glAdd = vector.onAdd, glRemove = vector.onRemove;
    vector.onAdd = function (m) {
      try { glAdd.call(this, m); } catch (e) { console.warn('BassCast: MapLibre could not start.', e); }
    };
    vector.onRemove = function (m) {
      if (this._glMap) glRemove.call(this, m); else L.DomUtil.remove(this._container);
    };
    // Start watching once the vector map is first shown (it may not be the default layer).
    const watch = () => {
      try {
        const gl = vector.getMaplibreMap();
        let styleOk = false;
        gl.once('style.load', () => { styleOk = true; });
        gl.on('error', () => { if (!styleOk) fallBack(); });
        setTimeout(() => { if (!styleOk) fallBack(); }, 20000);
      } catch (e) { fallBack(); }
    };
    vector.once('add', watch);
    // MapLibre starts its worker as soon as a map is made, so wait until the loader has it ready.
    window.mapLibreReady.then(() => { if (!swapped) base.addLayer(vector); }, fallBack);
  }

  dams.forEach(d => {
    const m = L.marker([d.lat, d.lon], { icon: markerIcon('dam', d.lat, d.lon, d.name), title: d.name, riseOnHover: true }).addTo(map);
    damMarkers.push({ m, d });
    m.on('click', () => applySelection({ kind: 'dam', name: d.name, lat: d.lat, lon: d.lon }));
  });
  spotLayer = L.layerGroup().addTo(map);
  renderSpotMarkers();
  map.on('click', e => startFreeSpot(e.latlng.lat, e.latlng.lng));
  } catch (err) {
    console.error('BassCast map error:', err);
    $('map').innerHTML = '<p style="padding:16px">The map could not start. You can still pick a dam from the menu, or enter coordinates below to save a spot.</p>';
  }
}

$('spotForm').addEventListener('submit', e => {
  e.preventDefault();
  if (!selected || selected.kind !== 'free') return;
  const name = cleanName($('spotName').value) || `My spot ${spots.length + 1}`;
  const sp = { id: newId(), name, lat: selected.lat, lon: selected.lon };
  spots.push(sp);
  const ok = saveSpots();
  refreshSpotUI();
  applySelection({ kind: 'spot', id: sp.id, name: sp.name, lat: sp.lat, lon: sp.lon });
  $('spotMsg').textContent = ok
    ? `Saved ${name}. It is in your list below and in the spot menu at the top.`
    : 'Saved for now, but this browser would not keep it after you close the page.';
});
$('spotCancel').addEventListener('click', () => { hideTempPin(); $('spotForm').hidden = true; });

$('mySpots').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const row = b.closest('[data-id]');
  const sp = row && spots.find(x => x.id === row.dataset.id);
  if (!sp) return;
  const act = b.dataset.act;
  if (act === 'use') applySelection({ kind: 'spot', id: sp.id, name: sp.name, lat: sp.lat, lon: sp.lon }, { move: true });
  else if (act === 'rename') startRename(sp.id);
  else if (act === 'cancel') { editingId = null; renderMySpots(); }
  else if (act === 'delete') armDelete(b, sp.id);
});
$('mySpots').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target.closest('form[data-id]');
  if (f) renameSpot(f.dataset.id, f.querySelector('input').value);
});

$('useMapLocation').addEventListener('click', () => {
  if (!selected) return;
  showTab('forecast');
  load();
});

$('applyCoords').addEventListener('click', () => {
  const lat = Number($('lat').value), lon = Number($('lon').value);
  if (!validLL(lat, lon) || $('lat').value === '' || $('lon').value === '') {
    $('spotMsg').textContent = 'Enter a latitude between -90 and 90 and a longitude between -180 and 180.';
    return;
  }
  startFreeSpot(lat, lon, { view: { move: true, zoom: 10 } });
});

$('locateMe').addEventListener('click', () => {
  if (!navigator.geolocation) { $('spotMsg').textContent = 'This browser cannot share your location. Tap the map instead.'; return; }
  $('spotMsg').textContent = 'Finding your location.';
  navigator.geolocation.getCurrentPosition(
    p => {
      startFreeSpot(p.coords.latitude, p.coords.longitude, { name: 'My location', view: { move: true, zoom: 14 } });
      $('spotMsg').textContent = 'Pin dropped at your location. Name it to save it.';
    },
    () => { $('spotMsg').textContent = 'Could not get your location. Allow location access for this page, or tap the map instead.'; },
    { enableHighAccuracy: true, timeout: 15000 }
  );
});

function onWaterChange(fetchNow) {
  const v = $('water').value;
  if (v === 'custom') return;
  if (v.startsWith('spot:')) {
    const sp = spots.find(x => x.id === v.slice(5));
    if (!sp) return;
    applySelection({ kind: 'spot', id: sp.id, name: sp.name, lat: sp.lat, lon: sp.lon }, { move: true });
  } else {
    const p = v.split(',');
    applySelection({ kind: 'dam', name: p[2], lat: Number(p[0]), lon: Number(p[1]) }, { move: true, zoom: 8 });
  }
  if (fetchNow) load();
}
$('water').addEventListener('change', () => onWaterChange(true));

$('load').addEventListener('click', load);

/* ---------- catch log ---------- */
function logs() {
  try {
    const a = JSON.parse(localStorage.getItem('basscastLogs') || '[]');
    // Skip anything that is not a session record, so one damaged entry cannot stop the app starting.
    return Array.isArray(a) ? a.filter(x => x && typeof x === 'object' && !Array.isArray(x)) : [];
  } catch { return []; }
}
function saveLogs(a) {
  infCache = null;
  try { localStorage.setItem('basscastLogs', JSON.stringify(a)); return true; } catch { return false; }
}

function updateLogForecast() {
  const d = $('resultDate').value;
  const info = dayInfo[d];
  $('logForecast').textContent = info
    ? `Forecast for ${d}: score ${info.avg}, ${info.window ? 'best window ' + info.window : 'best hour ' + info.best}. It will be saved with this session.`
    : 'No score for this date yet. Scores cover the past 7 days and the next 7 once a spot is chosen, so older sessions are saved without one.';
}

let logShowAll = false;
const bandColor = s => `var(--b-${bandKey(s)})`;
const num1 = n => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
function fmtLogDate(d) {
  const x = new Date(d + 'T12:00:00');
  return isNaN(x) ? String(d) : x.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
}

/* ---- shared vocab ---- */
const TECHS = ['Soft plastics', 'Crankbait', 'Topwater', 'Spinnerbait', 'Jig', 'Other'];
const PERIODS = [{ k: 'dawn', t: 'Dawn' }, { k: 'morning', t: 'Morning' }, { k: 'midday', t: 'Midday' }, { k: 'afternoon', t: 'Afternoon' }, { k: 'dusk', t: 'Dusk' }];
const periodName = k => { const p = PERIODS.find(x => x.k === k); return p ? p.t : ''; };

/* ---- optional tags in the log form ---- */
function selectedTag(group) {
  const b = document.querySelector('#logTags .tagchip[data-group="' + group + '"][aria-pressed="true"]');
  return b ? b.dataset.v : null;
}
function clearTags() {
  document.querySelectorAll('#logTags .tagchip').forEach(b => b.setAttribute('aria-pressed', 'false'));
}
$('logTags').addEventListener('click', e => {
  const b = e.target.closest('.tagchip');
  if (!b) return;
  const on = b.getAttribute('aria-pressed') === 'true';
  document.querySelectorAll('#logTags .tagchip[data-group="' + b.dataset.group + '"]').forEach(x => x.setAttribute('aria-pressed', 'false'));
  if (!on) b.setAttribute('aria-pressed', 'true');
});

/* ---- spot notes + linking sessions to spots ---- */
const NOTES_KEY = 'basscastNotes';
function loadNotes() {
  try { const o = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; }
}
function saveNotes(o) { try { localStorage.setItem(NOTES_KEY, JSON.stringify(o)); return true; } catch { return false; } }
function hasNote(key) { try { const n = loadNotes()[key]; return !!(n && n.text); } catch { return false; } }
function spotKeyOf(sel) {
  if (!sel) return null;
  if (sel.kind === 'dam') return 'd:' + sel.name;
  if (sel.kind === 'spot') return 's:' + sel.id;
  return null;
}
function keyForName(name) {
  const n = cleanName(name).toLowerCase();
  if (!n) return null;
  const d = dams.find(x => x.name.toLowerCase() === n);
  if (d) return 'd:' + d.name;
  const s = spots.find(x => x.name.toLowerCase() === n);
  return s ? 's:' + s.id : null;
}
function sessionsForKey(key) { return logs().filter(x => (x.spotKey || keyForName(x.spot)) === key); }

/* ---- stats helpers ---- */
const calcRows = rows => {
  const bass = rows.reduce((t, x) => t + safeNum(x.count), 0);
  const wh = rows.filter(x => safeNum(x.hours) > 0);
  const hrs = wh.reduce((t, x) => t + safeNum(x.hours), 0);
  return { n: rows.length, avg: rows.length ? bass / rows.length : null,
    perHr: hrs > 0 ? wh.reduce((t, x) => t + safeNum(x.count), 0) / hrs : null };
};
function nearMoon(date) {
  const d = new Date(date + 'T12:00:00');
  if (isNaN(d)) return null;
  const m = moonInfo(d);
  return m.illum <= 12 || m.illum >= 88;
}
function groupItems(groups) {
  return groups.map(g => Object.assign({ label: g.label }, calcRows(g.rows), { rows: g.rows }))
    .filter(g => g.n > 0).sort((x, y) => y.avg - x.avg);
}
function leaderOf(items) {
  return items.length >= 2 && items[0].n >= 2 && items[0].avg > items[1].avg * 1.1 ? items[0] : null;
}
function groupPanel(title, hint, groups, extra) {
  const items = groupItems(groups);
  if (items.reduce((t, g) => t + g.n, 0) < 3) return '';
  const max = Math.max(...items.map(g => g.avg), 1);
  return `<div class="tagpanel"><h4>${title}</h4><p class="fine">${hint}</p>` + items.slice(0, 6).map((g, i) => `<div class="bandrow2">
      <div class="brtop"><strong>${esc(g.label)}</strong>${i === 0 && items.length > 1 && g.n >= 2 ? '<span class="chip lead">Leading so far</span>' : ''}</div>
      <div class="brmeter"><span style="width:${Math.max(4, Math.round(g.avg / max * 100))}%;background:var(--accent)"></span></div>
      <div class="brnums"><b>${num1(g.avg)}</b> bass per session${g.perHr != null ? ` <span class="dotsep">&middot;</span> <b>${num1(g.perHr)}</b> per hour` : ''} <span class="dotsep">&middot;</span> ${plural(g.n, 'session')}${g.n < 3 ? ' <em>(early days)</em>' : ''}${extra ? extra(g) : ''}</div>
    </div>`).join('') + '</div>';
}

function renderLogSummary(a) {
  const box = $('logSummary');
  if (!a.length) { box.innerHTML = ''; return; }
  const total = a.reduce((t, x) => t + safeNum(x.count), 0);
  const scored = a.filter(x => x.score != null);
  const best = a.reduce((m, x) => safeNum(x.count) > safeNum(m.count) ? x : m, a[0]);
  const unscored = a.length - scored.length;
  const stats = '<div class="logstats">' +
    `<div class="lstat"><b>${a.length}</b><span>${a.length === 1 ? 'Session' : 'Sessions'}</span></div>` +
    `<div class="lstat"><b>${total}</b><span>Bass caught</span></div>` +
    `<div class="lstat"><b>${safeNum(best.count) > 0 ? safeNum(best.count) : '–'}</b><span>${safeNum(best.count) > 0 ? 'Best session, ' + esc(fmtLogDate(best.date)) : 'Best session'}</span></div>` +
    '</div>';
  const note = unscored > 0
    ? `<p class="fine">${plural(unscored, 'session')} without a forecast score ${unscored === 1 ? 'is' : 'are'} left out of the forecast comparison. Scores are saved for dates inside the seven-day forecast, once a spot is chosen.</p>`
    : '';

  // Patterns from the user's own tags (these do not need forecast scores)
  const periodGroups = PERIODS.map(p => ({ label: p.t, rows: a.filter(x => x.period === p.k) }));
  const techGroups = TECHS.map(t => ({ label: t, rows: a.filter(x => x.tech === t) }));
  const taggedP = a.filter(x => x.period).length, taggedT = a.filter(x => x.tech).length;
  const goodAvg = g => {
    const r = g.rows.filter(x => x.score != null && x.score >= 68);
    if (!r.length) return '';
    const c = calcRows(r);
    return ` <span class="dotsep">&middot;</span> Good-or-better days <b>${num1(c.avg)}</b> (${r.length})`;
  };
  let panels = groupPanel('By time of day', 'Average catch for the time you fished.', periodGroups) +
               groupPanel('By technique', 'Average catch for each technique you tagged.', techGroups, goodAvg);
  if (!panels && a.length >= 5 && !taggedP && !taggedT) {
    panels = '<p class="fine tagnudge">Tick a technique and a time of day when you log a session (both optional) and your own patterns will appear here.</p>';
  } else if (panels) {
    panels = '<div class="tagpanels">' + panels + '</div>';
  }

  // Strongest conditions: only what the data can actually support
  const parts = [];
  let lead = null, bands = null, top = null, rest = null;
  if (scored.length >= 5) {
    const defs = [
      { label: 'Good or excellent', short: 'Good or excellent forecasts', range: '68 and above', rep: 74, test: s => s >= 68 },
      { label: 'Medium', short: 'Medium forecasts', range: '55 to 67', rep: 61, test: s => s >= 55 && s < 68 },
      { label: 'Slow or bad', short: 'Slow forecasts', range: 'under 55', rep: 40, test: s => s < 55 }
    ];
    bands = defs.map(d => Object.assign({}, d, calcRows(scored.filter(x => d.test(x.score)))));
    top = bands[0];
    rest = calcRows(scored.filter(x => x.score < 68));
    const live0 = bands.filter(b => b.n > 0);
    lead = live0.length > 1 ? live0.reduce((m, b) => b.avg > m.avg ? b : m, live0[0]) : null;
    if (lead && lead.n >= 2) parts.push(['Forecast', lead.short]);
  }
  const pl = leaderOf(groupItems(periodGroups)); if (pl) parts.push(['Time', pl.label]);
  const tl = leaderOf(groupItems(techGroups)); if (tl) parts.push(['Technique', tl.label]);
  const nm = calcRows(a.filter(x => nearMoon(x.date) === true)), fm = calcRows(a.filter(x => nearMoon(x.date) === false));
  if (nm.n >= 2 && fm.n >= 2) {
    if (nm.avg > fm.avg * 1.15) parts.push(['Moon', 'Around new or full moon']);
    else if (fm.avg > nm.avg * 1.15) parts.push(['Moon', 'Away from new and full moon']);
  }
  const strongest = (a.length >= 5 && parts.length)
    ? '<div class="strongcard"><p class="strongtitle">Your strongest conditions so far</p><div class="strongchips">' +
      parts.map(p => `<span class="chip lead"><em>${p[0]}</em> ${esc(p[1])}</span>`).join('') +
      `</div><p class="fine">Ranked by average bass per session across your ${a.length} sessions. These are early patterns from your own logs and they sharpen as you add more.</p></div>`
    : '';

  if (scored.length < 5) {
    const dots = [0, 1, 2, 3, 4].map(i => `<i class="${i < scored.length ? 'on' : ''}"></i>`).join('');
    box.innerHTML = '<div class="logsummary">' + stats + strongest +
      `<div class="logprog"><div class="emptydots" aria-label="${scored.length} of 5 scored sessions">${dots}<span>${scored.length} of 5 scored sessions</span></div>` +
      `<p>${5 - scored.length === 1 ? 'One more scored session' : (5 - scored.length) + ' more scored sessions'} and your forecast comparison appears here. Every outing counts.</p></div>` +
      panels + note + '</div>';
    return;
  }

  let insight;
  const useHr = top.perHr != null && rest.perHr != null;
  const unit = useHr ? 'bass an hour' : 'bass a session';
  const tv = useHr ? top.perHr : top.avg, rv = useHr ? rest.perHr : rest.avg;
  if (top.n === 0) {
    insight = 'None of your sessions have landed on a Good-or-better forecast yet. When one shows up on the Forecast tab it is worth planning around, and logging.';
  } else if (rest.n === 0) {
    insight = 'Every scored session so far was on a Good-or-better day, so there is nothing to compare against yet. Logging a quieter day will fill in the picture.';
  } else if (tv > rv * 1.15) {
    insight = `On days rated Good or better you averaged ${num1(tv)} ${unit}, against ${num1(rv)} on other days. Your catches are following the scores.`;
  } else if (tv < rv * 0.85) {
    insight = `So far your best catches have not come on the highest-scored days (${num1(tv)} against ${num1(rv)} ${unit}). That is normal with a small sample, and spot, lure and timing matter too. Keep logging.`;
  } else {
    insight = `Good-forecast days and the rest are producing similar catches so far (${num1(tv)} against ${num1(rv)} ${unit}). A few more sessions will show whether a pattern appears.`;
  }

  const live = bands.filter(b => b.n > 0);
  const max = Math.max(...live.map(b => b.avg), 1);
  const rows = live.map(b => `<div class="bandrow2">
      <div class="brtop"><strong>${b.label}</strong><span class="brrange">${b.range}</span>${lead === b ? '<span class="chip lead">Most bass per session</span>' : ''}</div>
      <div class="brmeter"><span style="width:${Math.max(4, Math.round(b.avg / max * 100))}%;background:${bandColor(b.rep)}"></span></div>
      <div class="brnums"><b>${num1(b.avg)}</b> bass per session${b.perHr != null ? ` <span class="dotsep">&middot;</span> <b>${num1(b.perHr)}</b> per hour` : ''} <span class="dotsep">&middot;</span> ${plural(b.n, 'session')}${b.n < 3 ? ' <em>(early days)</em>' : ''}</div>
    </div>`).join('');

  const firm = scored.length >= 20
    ? 'With 20 or more scored sessions, this is a fairly solid read on how the forecast fits your fishing.'
    : 'Small samples are noisy. Patterns firm up at around 20 scored sessions, and you have ' + scored.length + '.';
  box.innerHTML = '<div class="logsummary">' +
    '<h3 class="sumtitle">Your forecast, against your catches</h3>' +
    `<p class="insight">${esc(insight)}</p>` + stats + strongest +
    `<div class="bandlist">${rows}</div>` +
    panels +
    `<p class="fine">${firm}</p>` + note + '</div>';
}

const EMPTY_LOG = '<div class="empty"><div class="emptyicon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12c3-5 8-7 12-5 2 1 4 3 6 5-2 2-4 4-6 5-4 2-9 0-12-5z"/><path d="M3 12l-1-4M3 12l-1 4"/><circle cx="16.5" cy="11" r=".8" fill="currentColor"/></svg></div>' +
  '<div class="emptybody"><h3>Your first session starts the story</h3>' +
  '<p>Each session you log is saved next to its forecast score. After a few outings you can see how the scores compare with the bass you actually caught, and learn which days, times and techniques are worth planning around.</p>' +
  '<ol class="emptysteps"><li>Choose a spot on the Forecast tab so the session can carry its score.</li><li>Fill in the date, bass caught and hours fished above. Tick a technique and time of day if you like.</li><li>Press Save session. Five scored sessions unlock the comparison.</li></ol>' +
  '<div class="emptydots" aria-label="0 of 5 scored sessions logged"><i></i><i></i><i></i><i></i><i></i><span>0 of 5 scored sessions</span></div>' +
  '<button class="btn" id="emptyLogStart" type="button">Log a session</button></div></div>';

function renderLogs() {
  const a = logs();
  renderLogSummary(a);
  if (!a.length) { $('logs').innerHTML = EMPTY_LOG; if (typeof renderSpotDetails === 'function') renderSpotDetails(); return; }
  const LIMIT = 8;
  const list = logShowAll ? a : a.slice(0, LIMIT);
  const rows = list.map((x, i) => {
    const hrs = safeNum(x.hours);
    const meta = [esc(fmtLogDate(x.date)), hrs > 0 ? esc(hrs) + ' h' : '', periodName(x.period) ? esc(periodName(x.period)) : ''].filter(Boolean).join(' <span class="dotsep">·</span> ');
    const chip = x.score != null
      ? `<span class="chip fc"><i style="background:${bandColor(x.score)}"></i>Forecast ${esc(x.score)}, ${esc(quality(x.score).toLowerCase())}</span>`
      : '<span class="chip none">No forecast</span>';
    const tech = TECHS.includes(x.tech) ? `<span class="chip tag">${esc(x.tech)}</span>` : '';
    return `<div class="logrow2">
      <div class="lr-count"><b>${esc(x.count)}</b><span>bass</span></div>
      <div class="lr-main"><strong>${esc(x.spot || 'Unknown spot')}</strong><span>${meta}</span>${tech ? `<span class="lr-tags">${tech}</span>` : ''}${x.lure ? `<span class="lr-note">${esc(x.lure)}</span>` : ''}</div>
      <div class="lr-side">${chip}<button type="button" class="rm" data-idx="${i}" aria-label="Remove session from ${esc(x.date)}">Remove</button></div>
    </div>`;
  }).join('');
  const more = a.length > LIMIT
    ? `<button type="button" class="link" id="logMore">${logShowAll ? 'Show recent only' : 'Show all ' + a.length + ' sessions'}</button>` : '';
  $('logs').innerHTML = `<div class="logheadrow"><h3>Recent sessions</h3><span class="fine">${a.length} logged</span></div>` + rows + (more ? `<div class="logmore">${more}</div>` : '');
  if (typeof renderSpotDetails === 'function') renderSpotDetails();
}

/* ---- Spot details: notes and history on the Map tab ---- */
let detailsKey = null;
function renderSpotDetails() {
  const box = $('spotDetails');
  if (!box) return;
  const key = spotKeyOf(selected);
  if (!key) { box.hidden = true; detailsKey = null; return; }
  if (detailsKey !== key) {
    detailsKey = key;
    box.innerHTML =
      '<h2 id="sdName"></h2>' +
      '<p class="hint">Your notes and catch history for this spot. Saved on this device.</p>' +
      '<label class="f" for="spotNote">Notes</label>' +
      '<textarea id="spotNote" maxlength="600" rows="3" placeholder="Water clarity, level, ramp condition, what worked, access notes"></textarea>' +
      '<div class="notechips" aria-label="Quick prompts">' + ['Clarity', 'Level', 'Ramp', 'Access', 'What worked'].map(t => `<button type="button" class="tagchip notechip" data-t="${t}">${t}</button>`).join('') + '</div>' +
      '<div class="noterow"><button class="btn" id="noteSave" type="button">Save notes</button><span class="fine" id="noteStatus" role="status"></span></div>' +
      '<h3 class="sdh">Catch history here</h3><div id="sdHistory"></div>';
    const n = loadNotes()[key];
    $('spotNote').value = n && typeof n.text === 'string' ? n.text : '';
    $('noteStatus').textContent = n && n.at ? 'Last saved ' + new Date(n.at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  }
  $('sdName').textContent = selected.name;
  const ss = sessionsForKey(key);
  const hist = $('sdHistory');
  if (!ss.length) {
    hist.innerHTML = '<p class="hint">No sessions logged here yet. Log one from the Catch log tab and it will appear here.</p><button class="btn ghost" id="sdLog" type="button">Log a session here</button>';
  } else {
    const bass = ss.reduce((t, x) => t + safeNum(x.count), 0);
    hist.innerHTML = '<div class="logstats">' +
      `<div class="lstat"><b>${ss.length}</b><span>${ss.length === 1 ? 'Session' : 'Sessions'}</span></div>` +
      `<div class="lstat"><b>${bass}</b><span>Bass caught</span></div>` +
      `<div class="lstat"><b>${num1(bass / ss.length)}</b><span>Per session</span></div></div>` +
      ss.slice(0, 5).map(x => `<div class="sdrow"><b>${esc(x.count)}</b><div><strong>${esc(fmtLogDate(x.date))}</strong><span>${[periodName(x.period), TECHS.includes(x.tech) ? x.tech : '', x.lure].filter(Boolean).map(esc).join(' &middot; ') || '&nbsp;'}</span></div>${x.score != null ? `<span class="chip fc"><i style="background:${bandColor(x.score)}"></i>${esc(x.score)}</span>` : ''}</div>`).join('') +
      `<div class="logmore"><button type="button" class="link" id="sdAll">${ss.length > 5 ? 'See all ' + ss.length + ' in the Catch log' : 'Open the Catch log'}</button></div>`;
  }
  box.hidden = false;
}
function saveSpotNote() {
  const key = detailsKey;
  if (!key || !$('spotNote')) return;
  const text = $('spotNote').value.trim().slice(0, 600);
  const all = loadNotes();
  const prev = all[key] && all[key].text ? all[key].text : '';
  if (text === prev) { if ($('noteStatus') && text) $('noteStatus').textContent = 'Saved on this device'; return; }
  if (text) all[key] = { text, at: Date.now() }; else delete all[key];
  const ok = saveNotes(all);
  $('noteStatus').textContent = ok ? (text ? 'Saved on this device' : 'Notes cleared') : 'This browser would not keep the note';
  if (key.startsWith('s:')) renderMySpots();
}
$('spotDetails').addEventListener('click', e => {
  const t = e.target;
  if (t.closest('#noteSave')) { saveSpotNote(); return; }
  const chip = t.closest('.notechip');
  if (chip) {
    const ta = $('spotNote');
    const add = chip.dataset.t + ': ';
    ta.value = (ta.value && !/\s$/.test(ta.value) ? ta.value + '\n' : ta.value) + add;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    return;
  }
  if (t.closest('#sdAll')) { showTab('log'); return; }
  if (t.closest('#sdLog')) {
    if (selected) $('logSpot').value = selected.name;
    showTab('log');
    $('resultCount').focus();
  }
});
$('spotDetails').addEventListener('focusout', e => { if (e.target && e.target.id === 'spotNote') saveSpotNote(); });
new MutationObserver(renderSpotDetails).observe($('mapPick'), { childList: true, characterData: true, subtree: true });

/* ---- Backup and restore ---- */
const BACKUP_AT = 'basscastBackupAt';
function backupSub() {
  let at = null;
  try { at = localStorage.getItem(BACKUP_AT); } catch {}
  $('backupSub').textContent = at
    ? 'Last backup ' + new Date(+at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'No backup downloaded yet';
}
function backupMsg(t, err) { $('backupMsg').textContent = t; $('backupMsg').className = 'status' + (err ? ' error' : ''); }
function sanitizeLog(x) {
  if (!x || typeof x !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(String(x.date))) return null;
  const hours = Number(x.hours), score = Number(x.score);
  return {
    date: String(x.date),
    spot: String(x.spot || '').slice(0, 80),
    count: Math.max(0, Math.round(Number(x.count)) || 0),
    hours: Number.isFinite(hours) && hours > 0 ? hours : null,
    lure: String(x.lure || '').slice(0, 200),
    score: x.score != null && Number.isFinite(score) ? Math.round(clamp(score)) : null,
    window: x.window ? String(x.window).slice(0, 30) : null,
    tech: TECHS.includes(x.tech) ? x.tech : null,
    period: PERIODS.some(p => p.k === x.period) ? x.period : null,
    factors: x.factors && typeof x.factors === 'object' && FACTOR_KEYS.every(k => Number.isFinite(Number(x.factors[k])))
      ? Object.fromEntries(FACTOR_KEYS.map(k => [k, Math.round(clamp(Number(x.factors[k])))])) : null,
    water: Number.isFinite(Number(x.water)) && x.water != null ? Math.round(Number(x.water) * 10) / 10 : null,
    spotKey: x.spotKey && /^[ds]:.{1,60}$/.test(String(x.spotKey)) ? String(x.spotKey) : null
  };
}
const logSig = x => [x.date, x.spot, x.count, x.hours, x.lure, x.tech, x.period].join('|');
function exportBackup() {
  const notes = loadNotes(), ls = logs();
  const data = { app: 'basscast-sa', version: 1, exportedAt: new Date().toISOString(), spots: spots.slice(), notes, logs: ls, settings: Object.assign({}, settings) };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'basscast-backup-' + localISODate(new Date()) + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  try { localStorage.setItem(BACKUP_AT, String(Date.now())); } catch {}
  backupSub();
  backupMsg(`Backup downloaded: ${plural(spots.length, 'saved spot')}, ${plural(Object.keys(notes).length, 'note')}, ${plural(ls.length, 'session')}.`);
}
function importBackup(text) {
  let d;
  try { d = JSON.parse(text); } catch { backupMsg('That file is not a readable backup.', true); return; }
  if (!d || d.app !== 'basscast-sa' || typeof d !== 'object') { backupMsg('That does not look like a BassCast SA backup.', true); return; }
  let addSpots = 0, addNotes = 0, addLogs = 0;
  // spots: add missing ids
  const have = new Set(spots.map(s => s.id));
  (Array.isArray(d.spots) ? d.spots : []).forEach(x => {
    if (!x || !/^[\w-]{1,24}$/.test(String(x.id)) || have.has(String(x.id)) || !validLL(+x.lat, +x.lon)) return;
    spots.push({ id: String(x.id), name: cleanName(x.name) || 'My spot', lat: +x.lat, lon: +x.lon });
    have.add(String(x.id)); addSpots++;
  });
  if (addSpots) saveSpots();
  // notes: take the newer one per spot
  const notes = loadNotes();
  if (d.notes && typeof d.notes === 'object' && !Array.isArray(d.notes)) {
    Object.keys(d.notes).forEach(k => {
      const n = d.notes[k];
      if (!/^[ds]:.{1,60}$/.test(k) || !n || typeof n.text !== 'string' || !n.text.trim()) return;
      const at = Number(n.at) || 0;
      if (!notes[k] || (Number(notes[k].at) || 0) < at) { notes[k] = { text: n.text.trim().slice(0, 600), at }; addNotes++; }
    });
    if (addNotes) saveNotes(notes);
  }
  // sessions: add the ones we do not already have
  const cur = logs();
  const sigs = new Set(cur.map(logSig));
  const merged = cur.slice();
  (Array.isArray(d.logs) ? d.logs : []).forEach(x => {
    const c = sanitizeLog(x);
    if (!c || sigs.has(logSig(c))) return;
    sigs.add(logSig(c)); merged.push(c); addLogs++;
  });
  if (addLogs) { merged.sort((p, q) => (p.date < q.date ? 1 : p.date > q.date ? -1 : 0)); saveLogs(merged); }
  // settings: only taken from the file when this device has never saved its own
  let addSettings = false;
  let hadSettings = true;
  try { hadSettings = localStorage.getItem(SETTINGS_KEY) != null; } catch {}
  if (!hadSettings && d.settings && typeof d.settings === 'object') {
    settings = cleanSettings(d.settings);
    saveSettings(); applyTheme(); applyMotion();
    document.dispatchEvent(new CustomEvent('basscast:settings-restored'));
    addSettings = true;
  }
  refreshSpotUI();
  renderLogs();
  detailsKey = null; renderSpotDetails();
  backupMsg(addSpots + addNotes + addLogs || addSettings
    ? `Restored ${plural(addSpots, 'spot')}, ${plural(addNotes, 'note')} and ${plural(addLogs, 'session')}${addSettings ? ', plus your settings' : ''}.`
    : 'Nothing new to restore. Everything in that file is already here.');
}
$('exportBtn').addEventListener('click', exportBackup);
$('importFile').addEventListener('change', () => {
  const f = $('importFile').files && $('importFile').files[0];
  if (!f) return;
  if (f.size > 2e6) { backupMsg('That file is too large to be a BassCast backup.', true); $('importFile').value = ''; return; }
  const r = new FileReader();
  r.onload = () => { importBackup(String(r.result || '')); $('importFile').value = ''; };
  r.onerror = () => { backupMsg('Could not read that file.', true); $('importFile').value = ''; };
  r.readAsText(f);
});
$('importLabel').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('importFile').click(); } });
backupSub();

/* ---- Conditions in context (derived from the forecast already fetched) ---- */
function circDiff(a, b) { return Math.abs((((a - b) % 360) + 540) % 360 - 180); }
function spark(vals, mark) {
  const v = vals.filter(Number.isFinite);
  if (v.length < 3) return '';
  const lo = Math.min(...v), hi = Math.max(...v), w = 132, h = 34;
  const ys = vals.map(x => Number.isFinite(x) ? x : lo);
  const pts = ys.map((x, i) => [i / (ys.length - 1) * w, h - 3 - ((x - lo) / ((hi - lo) || 1)) * (h - 6)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  const m = pts[Math.max(0, Math.min(pts.length - 1, mark))];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${m[0].toFixed(1)}" cy="${m[1].toFixed(1)}" r="3.5" fill="var(--gold)"/></svg>`;
}
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);

function renderContext(data, day, best, startH, endH, sunrise, sunset) {
  const H = data.hourly, grid = $('ctxGrid');
  if (!grid) return;
  const idx = [];
  for (let i = 0; i < H.time.length; i++) if (H.time[i].startsWith(day)) idx.push(i);
  if (!idx.length) return;
  const hr = i => hourOf(H.time[i]);
  const clockH = t => { const m = time(t).match(/^(\d\d):(\d\d)$/); return m ? +m[1] + +m[2] / 60 : NaN; };
  const sr = clockH(sunrise), ss = clockH(sunset);
  const mid = (startH + endH) / 2;
  const cards = [];

  /* ---- Light ---- */
  {
    const hasSun = Number.isFinite(sr) && Number.isFinite(ss);
    const lowLight = hasSun && (Math.abs(mid - (sr + 0.5)) <= 2 || Math.abs(mid - (ss - 0.5)) <= 2);
    const midClouds = idx.filter(i => hr(i) >= 10 && hr(i) <= 15).map(i => H.cloud_cover[i]).filter(Number.isFinite);
    const midCloud = midClouds.length ? midClouds.reduce((t, v) => t + v, 0) / midClouds.length : null;
    let body = '';
    if (hasSun) body += `Prime light is dawn ${clockStr(sr - 0.5)} to ${clockStr(sr + 1.5)} and dusk ${clockStr(ss - 1.5)} to ${clockStr(ss + 0.5)}. `;
    if (midCloud != null) body += midCloud >= 60 ? 'Cloud keeps the middle of the day dim, so fish may stay active for longer. '
      : midCloud < 30 ? 'The middle of the day is bright and clear, so expect fish tight to shade or deeper water. '
      : 'Light through the middle of the day is mixed. ';
    body += lowLight ? 'Your best window sits in the low light, so give those hours priority.'
      : 'Your best window is mid-day, driven more by cloud, wind and temperature than by low light.';
    const pos = h => Math.max(0, Math.min(100, (h - 4) / 18 * 100));
    const seg = (a, b, cls) => `<i class="${cls}" style="left:${pos(a).toFixed(1)}%;width:${Math.max(1, pos(b) - pos(a)).toFixed(1)}%"></i>`;
    const strip = `<div class="lightstrip" aria-hidden="true">${hasSun ? seg(sr - 0.5, sr + 1.5, 'lw') + seg(ss - 1.5, ss + 0.5, 'lw') : ''}${seg(startH, endH, 'bw')}</div>` +
      '<div class="lightlbl" aria-hidden="true"><span>04:00</span><span>13:00</span><span>22:00</span></div>';
    cards.push({ label: 'Light', head: lowLight ? 'Best window is in the low light' : 'Best window is mid-day', body, visual: strip });
  }

  /* ---- Wind and banks ---- */
  {
    const lo = Number.isFinite(sr) ? Math.max(5, Math.floor(sr)) : 6, hi = Number.isFinite(ss) ? Math.min(20, Math.ceil(ss)) : 19;
    const w = idx.filter(i => hr(i) >= lo && hr(i) <= hi).map(i => ({ h: hr(i), d: H.wind_direction_10m[i], s: H.wind_speed_10m[i] }))
      .filter(x => Number.isFinite(x.d) && Number.isFinite(x.s));
    const bd = best.h && best.h.wind_direction_10m;
    if (w.length >= 3 && Number.isFinite(bd)) {
      const first = w[0], last = w[w.length - 1];
      const swing = w.find(x => circDiff(x.d, first.d) >= 50);
      const sMin = Math.min(...w.map(x => x.s)), peak = w.reduce((m, x) => x.s > m.s ? x : m, w[0]);
      let body = windCallFor(best.wind, bd) + ' ';
      if (swing) body += `From about ${hh(swing.h)} it turns to the ${compass(last.d)}, so the windblown shore moves to the ${BANK[compass(last.d + 180)]} side. `;
      else body += 'The direction holds all day, so the same bank stays windblown. ';
      body += `Speed runs from ${windNum(sMin)} to ${fmtWind(peak.s)}, strongest around ${hh(peak.h)}.`;
      const arrow = `<svg class="windarrow" viewBox="0 0 40 40" style="transform:rotate(${Math.round(bd + 180)}deg)" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="2"/><path d="M20 6v26M12 24l8 8 8-8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      cards.push({ label: 'Wind and banks', head: swing ? `${compass(first.d)} wind turning ${compass(last.d)}` : `${compass(bd)} wind, holding steady`, body, visual: arrow });
    }
  }

  /* ---- Rain timing ---- */
  {
    const rp = idx.filter(i => hr(i) >= 5 && hr(i) <= 21).map(i => ({ h: hr(i), p: H.precipitation_probability[i] })).filter(x => Number.isFinite(x.p));
    if (rp.length) {
      const peak = rp.reduce((m, x) => x.p > m.p ? x : m, rp[0]);
      const wet = rp.filter(x => x.p >= 40);
      let head, body;
      if (!wet.length) {
        head = peak.p < 20 ? 'Dry all day' : 'Low rain risk';
        body = `Rain chance stays under 40%, peaking at ${Math.round(peak.p)}% around ${hh(peak.h)}. Nothing should interrupt your window.`;
      } else {
        const firstWet = wet[0].h;
        let lastWet = firstWet;
        for (let k = 0; k < wet.length; k++) { if (wet[k].h - lastWet <= 1) lastWet = wet[k].h; else break; }
        head = `Rain risk from ${hh(firstWet)}`;
        body = `Chance reaches 40% or more from ${hh(firstWet)} to ${hh(lastWet + 1)}, peaking at ${Math.round(peak.p)}% around ${hh(peak.h)}. `;
        body += firstWet >= endH ? 'Your best window comes before it, so fish it first. '
          : lastWet < startH ? 'It should clear before your best window. '
          : 'It overlaps your best window: light rain can switch the bite on, but leave the water for thunder. ';
        if (firstWet >= endH) body += 'Fish often feed up ahead of approaching weather.';
      }
      const bars = '<div class="rainbars" aria-hidden="true">' + rp.map(x => `<i style="height:${Math.max(6, x.p)}%"></i>`).join('') + '</div>';
      cards.push({ label: 'Rain timing', head, body, visual: bars });
    }
  }

  /* ---- Pressure trend ---- */
  {
    const pm = H.pressure_msl, i0 = best.i;
    const d6 = i => (i >= 6 && Number.isFinite(pm[i]) && Number.isFinite(pm[i - 6])) ? pm[i] - pm[i - 6] : null;
    const before = d6(i0);
    const after = (i0 + 6 < pm.length && Number.isFinite(pm[i0]) && Number.isFinite(pm[i0 + 6])) ? pm[i0 + 6] - pm[i0] : null;
    const word = d => d == null ? null : d <= -4 ? 'falling fast' : d <= -1.5 ? 'falling' : d >= 4 ? 'rising fast' : d >= 1.5 ? 'rising' : 'steady';
    const fmtD = d => (d > 0 ? '+' : '') + d.toFixed(1) + ' hPa';
    const wb = word(before), wa = word(after);
    if (wb || wa) {
      const head = wb && wa ? (wb === wa ? cap1(wb) + ' through the window' : cap1(wb) + ', then ' + wa) : cap1(wb || wa);
      let body = '';
      if (before != null) body += `Over the 6 hours up to your best hour pressure moved ${fmtD(before)}. `;
      if (after != null) body += `Over the 6 hours after it moves ${fmtD(after)}. `;
      if (before != null && before <= -1.5 && after != null && after >= 1.5) body += 'That looks like a front passing: fish tend to feed ahead of it and tighten up behind it, so make this window count.';
      else if (before != null && before <= -1.5) body += 'Falling pressure usually switches fish on. Fish moving baits and cover water.';
      else if (before != null && before >= 1.5) body += 'Pressure has been climbing, which can make fish fussy. Slow down, downsize and stay tight to cover.';
      else if (after != null && after <= -1.5) body += 'Pressure starts falling after your window, so the bite may improve later in the day.';
      else if (after != null && after >= 1.5) body += 'Pressure starts climbing after your window, so the bite may tighten later.';
      else body += 'Pressure is stable, so let light, wind and water temperature lead your choices.';
      const vals = idx.map(i => pm[i]);
      cards.push({ label: 'Pressure trend', head, body, visual: '<span class="sparkwrap">' + spark(vals, Math.max(0, idx.indexOf(i0))) + '</span>' });
    }
  }

  if (!cards.length) return;
  grid.innerHTML = cards.map(c => `<div class="ctx"><div class="ctxhead"><span class="ctxlabel">${esc(c.label)}</span></div>` +
    `<div class="ctxvis">${c.visual || ''}</div><h3>${esc(c.head)}</h3><p>${esc(c.body)}</p></div>`).join('');
}

$('logs').addEventListener('click', e => {
  const b = e.target.closest('.rm');
  if (!b) return;
  const a = logs();
  a.splice(+b.dataset.idx, 1);
  if (saveLogs(a)) { $('logStatus').textContent = 'Session removed.'; renderLogs(); }
});

$('resultDate').addEventListener('change', updateLogForecast);
$('logs').addEventListener('click', e => {
  if (!e.target.closest('#logMore')) return;
  logShowAll = !logShowAll;
  renderLogs();
});
$('logs').addEventListener('click', e => {
  if (!e.target.closest('#emptyLogStart')) return;
  const f = $('resultCount');
  f.scrollIntoView({ behavior: 'smooth', block: 'center' });
  f.focus({ preventScroll: true });
  f.select();
});

$('saveCatch').addEventListener('click', () => {
  const a = logs();
  const date = $('resultDate').value || localISODate(new Date());
  const info = dayInfo[date];
  const hours = Number($('resultHours').value);
  a.unshift({
    date,
    // Same limits as a restored backup (sanitizeLog), so typed and restored sessions match.
    spot: $('logSpot').value.trim().slice(0, 80),
    count: Math.min(9999, Math.max(0, Number($('resultCount').value) || 0)),
    hours: Number.isFinite(hours) && hours > 0 ? hours : null,
    lure: $('lure').value.trim().slice(0, 200),
    score: info ? info.avg : null,
    window: info && info.window ? info.window : null,
    factors: info && info.factors ? Object.assign({}, info.factors) : null,
    water: info && Number.isFinite(info.water) ? info.water : null,
    tech: selectedTag('tech'),
    period: selectedTag('period'),
    spotKey: keyForName($('logSpot').value)
  });
  if (saveLogs(a)) {
    $('logStatus').textContent = 'Session saved on this browser.' + (info && info.factors ? '' : ' It has no forecast score, so it will not count towards learning.');
    clearTags();
    renderLogs();
    if (settings.learn && currentInfluence().active && typeof heroState !== 'undefined' && heroState === 'ready') load();
  } else {
    $('logStatus').textContent = 'This browser would not save the session.';
  }
});

/* ---------- start ---------- */
$('resultDate').value = localISODate(new Date());
$('forecastDay').value = localISODate(new Date());
updateClock();
setInterval(updateClock, 1000);
buildGauge();
spots = loadSpots();
renderSpotSelect();
renderMySpots();
initMap();
renderLogs();

/* ---------- progressive disclosure ---------- */
(function () {
  var folds = Array.prototype.slice.call(document.querySelectorAll('.fold'));
  var all = $('foldAll');
  function setFold(f, open) {
    f.classList.toggle('open', open);
    f.querySelector('.foldbtn').setAttribute('aria-expanded', String(open));
  }
  function syncAll() {
    var every = folds.every(function (f) { return f.classList.contains('open'); });
    all.textContent = every ? 'Collapse all' : 'Expand all';
    all.dataset.state = every ? 'open' : 'closed';
  }
  folds.forEach(function (f) {
    f.querySelector('.foldbtn').addEventListener('click', function () {
      setFold(f, !f.classList.contains('open'));
      syncAll();
    });
  });
  all.addEventListener('click', function () {
    var open = all.dataset.state !== 'open';
    folds.forEach(function (f) { setFold(f, open); });
    syncAll();
  });
  // Detail panels start closed on every screen size, so the outlook stays the focus.
  syncAll();
})();

/* ---------- calm first load ---------- */
var heroEl = $('tab-forecast').querySelector('.hero');
var heroState = 'empty';
function introLine(text) { var t = $('introStateText'); if (t) t.textContent = text || ''; var s = $('introState'); if (s) s.hidden = !text; var n = $('skelNote'); if (n) n.textContent = text || ''; }
function setHero(state, line) {
  heroState = state;
  heroEl.classList.toggle('is-empty', state === 'empty');
  heroEl.classList.toggle('is-loading', state === 'loading');
  $('tab-forecast').classList.toggle('pending', state !== 'ready');
  $('tab-forecast').classList.toggle('loading', state === 'loading');
  if (state !== 'ready') $('tab-forecast').classList.remove('refreshing');
  if (line) introLine(line);
}
(function () {
  document.addEventListener('basscast:status', function (e) {
    var phase = e.detail ? e.detail.phase : '';
    if (heroState === 'ready') {
      $('tab-forecast').classList.toggle('refreshing', phase === 'loading');
      return;
    }
    if (phase === 'error') {
      setHero('empty', 'We could not load the forecast just yet. Try Refresh in a moment.');
    } else if (phase === 'loading') {
      setHero('loading', 'Reading the conditions at ' + chosenName + '\u2026');
    }
  });

  var sc = $('dailyScore');
  new MutationObserver(function () {
    var n = sc.querySelector('.num');
    if (heroState !== 'ready' && n && /^\d+$/.test(n.textContent.trim())) setHero('ready');
  }).observe(sc, { childList: true });

  new MutationObserver(function () {
    if (heroState !== 'empty') return;
    $('introGo').hidden = !chosenName;
    introLine(chosenName ? chosenName + ' is selected. Ready when you are.' : '');
  }).observe($('placeTag'), { childList: true });
})();
$('introGo').addEventListener('click', function () { load(); });
$('introMap').addEventListener('click', function () { $('tabbtn-map').click(); });

/* ---------- location picker ---------- */
(function () {
  var sheet = $('picker'), list = $('pickerList'), opener = null;
  function currentVal() { return $('water').value; }
  function build() {
    var sel = $('water'), groups = {}, order = [], spotItems = [];
    Array.prototype.forEach.call(sel.children, function (n) {
      if (n.tagName === 'OPTION' && n.value !== 'custom' && n.value !== '') {
        var p = n.value.split(',');
        var key = REGION_NAME[regionFor(Number(p[0]), Number(p[1]))];
        if (!groups[key]) { groups[key] = []; order.push(key); }
        groups[key].push({ v: n.value, t: n.textContent });
      } else if (n.tagName === 'OPTGROUP') {
        Array.prototype.forEach.call(n.children, function (o) { spotItems.push({ v: o.value, t: o.textContent }); });
      }
    });
    var cur = currentVal();
    var tick = '<svg class="tick" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>';
    // Redesign: each row is a leaderboard entry. Rows rank by today's score once the scores are in.
    function where(x) {
      if (x.v.indexOf('spot:') === 0) { var sp = spots.find(function (o) { return 'spot:' + o.id === x.v; }); return sp ? { lat: sp.lat, lon: sp.lon } : null; }
      var p = x.v.split(','); return { lat: Number(p[0]), lon: Number(p[1]) };
    }
    function metaOf(x) { var w = where(x); return w && typeof spotMeta === 'function' ? spotMeta(w.lat, w.lon) : null; }
    function item(x) {
      var m = metaOf(x);
      return '<button type="button" class="sheetitem" data-v="' + esc(x.v) + '"' + (x.v === cur ? ' aria-current="true"' : '') + '>' + spotBadge(m) +
        '<span class="si-text"><span class="si-name">' + esc(x.t) + '</span><span class="si-meta">' + (m ? spotLine(m) : esc(x.region || 'My spot')) + '</span></span>' +
        spotTag(m) + tick + '</button>';
    }
    function rank(a) {
      if (!a.every(metaOf)) return a;
      return a.slice().sort(function (p, q) { return metaOf(q).score - metaOf(p).score; });
    }
    var html = '';
    if (spotItems.length) html += '<div class="sheetgrp">My spots</div>' + rank(spotItems).map(item).join('');
    var damsAll = [];
    order.forEach(function (k) { groups[k].forEach(function (x) { x.region = k; damsAll.push(x); }); });
    var ranked = damsAll.every(metaOf);
    html += '<div class="sheetgrp">' + (ranked ? 'Dams, best first today' : 'Dams') + '</div>' + rank(damsAll).map(item).join('');
    list.innerHTML = html;
  }
  // ui.js calls this when spot scores arrive, so an open picker re-ranks in place.
  window.rebuildPicker = function () {
    if (sheet.hidden) return;
    var f = document.activeElement && document.activeElement.closest && document.activeElement.closest('.sheetitem');
    var keep = f ? f.dataset.v : null, top = list.scrollTop;
    build();
    list.scrollTop = top;
    if (keep) { var again = list.querySelector('.sheetitem[data-v="' + CSS.escape(keep) + '"]'); if (again) again.focus({ preventScroll: true }); }
  };
  function open(btn) {
    opener = btn || null;
    build();
    sheet.hidden = false;
    document.querySelectorAll('.spotpill').forEach(function (p) { p.setAttribute('aria-expanded', 'true'); });
    var on = list.querySelector('[aria-current="true"]') || list.querySelector('.sheetitem');
    if (on) { on.scrollIntoView({ block: 'center' }); on.focus({ preventScroll: true }); }
  }
  function close(returnFocus) {
    sheet.hidden = true;
    document.querySelectorAll('.spotpill').forEach(function (p) { p.setAttribute('aria-expanded', 'false'); });
    if (returnFocus !== false && opener && opener.isConnected && opener.offsetParent !== null) opener.focus();
  }
  document.querySelectorAll('.spotpill').forEach(function (b) { b.addEventListener('click', function () { open(b); }); });
  sheet.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) { close(); return; }
    var it = e.target.closest('.sheetitem');
    if (!it) return;
    close(false);
    $('water').value = it.dataset.v;
    $('water').dispatchEvent(new Event('change'));
  });
  $('pickerMap').addEventListener('click', function () { close(false); showTab('map'); });
  document.addEventListener('keydown', function (e) {
    if (sheet.hidden) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'Tab') {
      var f = sheet.querySelectorAll('button:not([hidden])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
})();

/* ---------- first-visit tips ---------- */
(function () {
  var KEY = 'basscastTips', mem = {};
  function seen(k) {
    if (!settings.tips) return true;
    if (mem[k]) return true;
    try { return !!readObj(KEY)[k]; } catch (e) { return false; }
  }
  function mark(k) {
    mem[k] = 1;
    try { var o = readObj(KEY); o[k] = 1; localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
  }
  function show(id) { $(id).classList.add('show'); }
  function dismiss(k, id) { mark(k); $(id).classList.remove('show'); }
  var hero = document.querySelector('#tab-forecast .hero');
  var endSpot = function () { dismiss('spot', 'spotTipWrap'); };
  var mapPanel = $('tab-map');

  // Tip 1: how to choose a spot. Only if nothing has been chosen after a calm beat.
  if (!seen('spot')) {
    setTimeout(function () {
      if (!seen('spot') && hero.classList.contains('is-empty') && !chosenName && $('picker').hidden && mapPanel.hidden) show('spotTipWrap');
    }, 1600);
  }
  document.querySelectorAll('.spotpill').forEach(function (b) { b.addEventListener('click', endSpot); });
  $('water').addEventListener('change', endSpot);
  new MutationObserver(function () {
    if (!hero.classList.contains('is-empty')) endSpot();
  }).observe(hero, { attributes: true, attributeFilter: ['class'] });

  // Tip 2: how to drop a pin, the first time the Map tab is opened.
  new MutationObserver(function () {
    if (!mapPanel.hidden) {
      endSpot();
      if (!seen('map')) setTimeout(function () { if (!mapPanel.hidden && !seen('map')) show('mapTipWrap'); }, 600);
    } else {
      $('mapTipWrap').classList.remove('show');
    }
  }).observe(mapPanel, { attributes: true, attributeFilter: ['hidden'] });
  $('map').addEventListener('click', function () { dismiss('map', 'mapTipWrap'); });
  $('spotForm').addEventListener('submit', function () { dismiss('map', 'mapTipWrap'); });

  document.querySelectorAll('.coachx').forEach(function (b) {
    b.addEventListener('click', function () { dismiss(b.dataset.tip, b.dataset.wrap); });
  });

  // "?" in the top bar: forget what was seen and show the tip that fits where you are.
  var hideLive = function () { $('liveTipWrap').classList.remove('show'); };
  document.querySelectorAll('.spotpill').forEach(function (b) { b.addEventListener('click', hideLive); });
  document.querySelectorAll('.tab').forEach(function (b) { b.addEventListener('click', hideLive); });
  // Settings: the "Show tips" switch hides any tip on screen when turned off.
  document.addEventListener('basscast:tips', function () {
    if (!settings.tips) ['spotTipWrap', 'mapTipWrap', 'liveTipWrap'].forEach(function (id) { $(id).classList.remove('show'); });
  });
  // Settings: "Show tips again" forgets what was seen, turns tips on and shows the tip for the Forecast tab.
  $('tipsBtn').addEventListener('click', function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
    for (var k in mem) delete mem[k];
    if (!settings.tips) { settings.tips = true; saveSettings(); if ($('setTips')) $('setTips').checked = true; }
    ['spotTipWrap', 'mapTipWrap', 'liveTipWrap'].forEach(function (id) { $(id).classList.remove('show'); });
    if (!$('tab-log').hidden || !$('tab-settings').hidden) $('tabbtn-forecast').click();
    setTimeout(function () {
      if (!mapPanel.hidden) show('mapTipWrap');
      else if (hero.classList.contains('is-empty')) show('spotTipWrap');
      else if (!hero.classList.contains('is-loading')) show('liveTipWrap');
    }, 120);
  });
})();


/* ---- Share image: draws the card onto a canvas ---- */
function drawShareCanvas(d, canvas) {
  // Redesign (2026.10.27): mirrors the Forecast hero. Dark base tinted by the day's band, score arc,
  // band word, best-window pill and four condition tiles.
  const W = 1080, PAD = 64, TH = 206, GAP = 18;
  canvas.width = W; canvas.height = 1600;
  const ctx = canvas.getContext('2d');
  const F = '"Inter", "Segoe UI", system-ui, sans-serif';
  const font = (w, px) => `${w} ${px}px ${F}`;
  const spacing = px => { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; };
  const rr = (x, y, w, h, r) => {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  };
  const fit = (text, maxW, px, min, weight) => {
    let s = px;
    ctx.font = font(weight, s);
    while (s > min && ctx.measureText(text).width > maxW) { s -= 2; ctx.font = font(weight, s); }
    if (ctx.measureText(text).width > maxW) {
      let t = text;
      while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
      return { text: t.replace(/\s+$/, '') + '…', px: s };
    }
    return { text, px: s };
  };
  const BANDHEX = { excellent: '#34D399', good: '#2DD4BF', medium: '#FBBF24', slow: '#FB923C', bad: '#F87171' };
  const sc = Math.max(0, Math.min(100, Number(d.score) || 0));
  const band = BANDHEX[bandKey(sc)];
  const mix = (hex, amt) => {
    const a = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)), b = [11, 20, 24];
    return 'rgb(' + a.map((v, i) => Math.round(v * amt + b[i] * (1 - amt))).join(',') + ')';
  };
  const TXT = '#F2F7F8', TXT2 = 'rgba(242,247,248,.8)';

  // ---- layout first, so the image is only as tall as its content ----
  const maxW = W - PAD * 2;
  const wrapAt = sz => {
    ctx.font = font(600, sz);
    const words = d.spot.split(/\s+/), out = []; let cur = '';
    words.forEach(w => {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { out.push(cur); cur = w; }
    });
    if (cur) out.push(cur);
    return out;
  };
  let size = 76, lines = [];
  for (; size >= 56; size -= 4) { lines = wrapAt(size); if (lines.length === 1 && ctx.measureText(lines[0]).width <= maxW) break; }
  if (lines.length !== 1 || ctx.measureText(lines[0]).width > maxW) {
    for (size = 68; size >= 48; size -= 4) { lines = wrapAt(size); if (lines.length <= 2 && lines.every(l => ctx.measureText(l).width <= maxW)) break; }
    if (lines.length > 2) { ctx.font = font(600, size); lines = [lines[0], fit(lines.slice(1).join(' '), maxW, size, size, 600).text]; }
  }
  const lineH = size * 1.12, nameBase = 250, nameBottom = nameBase + (lines.length - 1) * lineH;
  const R = 270, cx = W / 2, cy = nameBottom + 70 + R;      // cy is the arc's baseline
  const verdictY = cy + 118, pillY = verdictY + 48, tilesY = pillY + 132;
  const H = Math.round(tilesY + TH + 150);
  canvas.height = H;   // resizing resets the context, everything below redraws from scratch

  // ---- background ----
  let g = ctx.createLinearGradient(0, 0, W * 0.15, H);
  g.addColorStop(0, mix(band, 0.42)); g.addColorStop(0.58, mix(band, 0.18)); g.addColorStop(1, '#0B1418');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.strokeStyle = 'rgba(242,247,248,.06)'; ctx.lineWidth = 2;
  for (let i = 1; i <= 6; i++) { ctx.beginPath(); ctx.ellipse(W - 120, 170, 120 * i, 90 * i, -0.3, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();

  // ---- brand row ----
  ctx.save(); ctx.translate(PAD, 82); ctx.scale(1.2, 1.2);
  ctx.fillStyle = TXT;
  ctx.fill(new Path2D('M2 22c6-10 16-16 28-16 8 0 14 3 20 8 3 2 6 3 9 2-2 3-5 5-9 6-1 4-4 7-8 9-5 2-11 1-15-2-3 3-7 4-11 3 2-3 3-7 2-10-5 1-10 1-16 0z'));
  ctx.fillStyle = '#56C7F0'; ctx.beginPath(); ctx.arc(48, 16, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = TXT; ctx.font = font(600, 38);
  ctx.fillText('BassCast SA', PAD + 64 * 1.2 + 18, 118);
  if (d.date) {
    const dt = fit(d.date, 440, 30, 22, 400);
    ctx.textAlign = 'right'; ctx.fillStyle = TXT2; ctx.font = font(400, dt.px);
    ctx.fillText(dt.text, W - PAD, 116);
  }

  // ---- spot name ----
  ctx.textAlign = 'center'; ctx.fillStyle = TXT; ctx.font = font(600, size); spacing(-1);
  lines.forEach((l, i) => { ctx.fillText(l, cx, nameBase + i * lineH); });
  spacing(0);

  // ---- score arc ----
  ctx.lineWidth = 20; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,.14)';
  ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 2 * Math.PI); ctx.stroke();
  if (sc > 0) {
    ctx.save(); ctx.shadowColor = band; ctx.shadowBlur = 24; ctx.strokeStyle = band;
    ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, Math.PI + Math.PI * sc / 100); ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = TXT; ctx.font = font(200, 250); spacing(-10);
  ctx.fillText(String(d.score), cx, cy - 6);
  spacing(4); ctx.fillStyle = TXT2; ctx.font = font(600, 24);
  ctx.fillText('OUT OF 100', cx, cy + 42);
  spacing(0);

  // ---- band word and best window ----
  const qual = (d.qual || quality(sc)) + ' conditions';
  ctx.font = font(600, 44);
  const qw = ctx.measureText(qual).width, qx = cx - (qw + 40) / 2;
  ctx.fillStyle = band; ctx.beginPath(); ctx.arc(qx + 12, verdictY - 15, 12, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = 'left'; ctx.fillStyle = TXT; ctx.fillText(qual, qx + 40, verdictY);
  const win = 'Best ' + String(d.win).replace(/\s+to\s+/, '–');
  ctx.font = font(600, 40);
  const pw = Math.min(maxW, ctx.measureText(win).width + 72), px0 = cx - pw / 2;
  ctx.fillStyle = band + '2E'; rr(px0, pillY, pw, 82, 41); ctx.fill();
  ctx.strokeStyle = band + '8C'; ctx.lineWidth = 2.5; rr(px0, pillY, pw, 82, 41); ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillStyle = TXT; ctx.fillText(fit(win, pw - 48, 40, 26, 600).text, cx, pillY + 55);

  // ---- condition tiles ----
  const tw = (W - PAD * 2 - GAP * 3) / 4;
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  const tiles = [
    ['WATER', d.water || '–', d.waterSub || ''],
    ['WIND', (d.wind || '–').replace(/\s+[NESW]{1,3}$/, ''), ((d.wind || '').match(/\s([NESW]{1,3})$/) || [])[1] ? 'From ' + d.wind.match(/\s([NESW]{1,3})$/)[1] : ''],
    ['PRESSURE', d.pr ? d.pr.replace(/\s*hPa$/, '') : '–', d.trend ? cap(d.trend) : 'hPa'],
    ['MOON', d.moonLit ? d.moonLit.replace(/\s*lit$/, '') : (d.moonName || '–'), d.moonName ? d.moonName.replace(/ moon$/i, '') : '']
  ];
  ctx.textAlign = 'left';
  tiles.forEach((t, i) => {
    const x = PAD + i * (tw + GAP);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; rr(x, tilesY, tw, TH, 26); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 2; rr(x, tilesY, tw, TH, 26); ctx.stroke();
    spacing(2.5); ctx.fillStyle = TXT2; ctx.font = font(600, 20); ctx.fillText(t[0], x + 22, tilesY + 48); spacing(0);
    const v = fit(t[1], tw - 44, 40, 24, 500);
    ctx.fillStyle = TXT; ctx.font = font(500, v.px); ctx.fillText(v.text, x + 22, tilesY + 112);
    if (t[2]) { const s2 = fit(t[2], tw - 44, 26, 18, 400); ctx.fillStyle = TXT2; ctx.font = font(400, s2.px); ctx.fillText(s2.text, x + 22, tilesY + 158); }
  });

  // ---- footer ----
  ctx.textAlign = 'center'; ctx.fillStyle = TXT2; ctx.font = font(400, 28);
  if (d.sr && d.ss) ctx.fillText('Sunrise ' + d.sr + '  ·  Sunset ' + d.ss, cx, tilesY + TH + 72);
  ctx.font = font(400, 22); ctx.fillStyle = 'rgba(242,247,248,.6)';
  ctx.fillText('Bass conditions for SA dams', cx, tilesY + TH + 112);
  ctx.textAlign = 'left';
  return canvas;
}

/* ---------- share the day's forecast ---------- */
(function () {
  var toastTimer = null, opener = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2300);
  }
  var read = function (id) { var e = $(id); return e ? String(e.textContent || '').replace(/\s+/g, ' ').trim() : ''; };
  var tidy = function (s) { return s.replace(/[.\s]+$/, ''); };
  var dash = '–';

  // One place that reads what is on screen, used for both the card and the plain-text summary.
  function collect() {
    var spot = chosenName || '';
    var score = read('gaugePinVal');
    var win = read('bestWindow').replace(/^(Fish|Best)\s+/i, '').replace(/\u2013/g, ' to ');
    if (!spot || !/^\d+$/.test(score) || !win || /^Checking/i.test(win)) return null;
    var qual = read('quality').replace(/\s*(day overall|conditions)$/i, '');
    if (/^Waiting/i.test(qual)) qual = '';
    var moon = tidy(read('moon')).split(/,\s*/);
    var tr = read('pressureTag').toLowerCase();
    var date = read('placeTag');
    var wind = read('wind'), pr = read('pressure'), sr = read('sunrise'), ss = read('sunset');
    var water = read('wtVal').replace(/^about\s+/i, '').replace(/C$/, ''), waterSub = read('wtBadge');
    return {
      spot: spot,
      date: date && date !== 'Choose a spot' ? date : '',
      score: score, qual: qual, win: win,
      wind: wind && wind !== dash ? wind : '',
      pr: pr && pr !== dash ? pr : '',
      trend: tr && !/^waiting/.test(tr) ? tr : '',
      moonName: moon[0] || '', moonLit: moon[1] || '',
      sr: /\d/.test(sr) ? sr : '', ss: /\d/.test(ss) ? ss : '',
      water: /\d/.test(water) ? water : '', waterSub: waterSub
    };
  }

  function buildShareText(d) {
    var lines = ['BassCast SA: ' + d.spot];
    if (d.date) lines.push(d.date);
    lines.push('Score ' + d.score + '/100' + (d.qual ? ' (' + d.qual.toLowerCase() + ')' : ''));
    lines.push('Best window: ' + d.win);
    var bits = [];
    if (d.wind) bits.push('Wind ' + d.wind);
    if (d.pr) bits.push('Pressure ' + d.pr + (d.trend ? ', ' + d.trend : ''));
    if (d.moonName) bits.push('Moon ' + d.moonName.charAt(0).toLowerCase() + d.moonName.slice(1) + (d.moonLit ? ', ' + d.moonLit : ''));
    if (bits.length) lines.push(bits.join(' | '));
    if (d.sr && d.ss) lines.push('Sunrise ' + d.sr + ', sunset ' + d.ss);
    return lines.join('\n');
  }

  function renderCard(d) {
    var tile = function (label, value, sub) {
      return '<div><span>' + label + '</span><b>' + esc(value || dash) + '</b>' + (sub ? '<em>' + esc(sub) + '</em>' : '') + '</div>';
    };
    var cap = function (t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; };
    var n = Math.max(0, Math.min(100, Number(d.score)));
    var arcD = 'M20 120a100 100 0 0 1 200 0';
    var card = $('shareCard');
    card.setAttribute('data-band', bandKey(n));
    card.innerHTML =
      '<div class="sc-top"><span class="sc-brand">' + card.dataset.fish + 'BassCast SA</span><span class="sc-date">' + esc(d.date) + '</span></div>' +
      '<h3 class="sc-spot">' + esc(d.spot) + '</h3>' +
      '<div class="sc-ring" role="img" aria-label="Score ' + esc(d.score) + ' out of 100">' +
        '<svg viewBox="0 0 240 132" aria-hidden="true"><path class="trk" d="' + arcD + '" pathLength="100"/><path class="val" d="' + arcD + '" pathLength="100"/></svg>' +
        '<div class="num"><b>' + esc(d.score) + '</b><small>out of 100</small></div></div>' +
      '<div class="sc-verdict"><span class="sc-qual">' + esc((d.qual || quality(n)) + ' conditions') + '</span>' +
        '<b class="sc-win">Best ' + esc(d.win.replace(/\s+to\s+/, '\u2013')) + '</b></div>' +
      '<div class="sc-tiles">' +
        tile('Water', d.water ? d.water : '', d.waterSub) +
        tile('Wind', d.wind) +
        tile('Pressure', d.pr, cap(d.trend)) +
        tile('Moon', d.moonName, d.moonLit) +
      '</div>' +
      ((d.sr && d.ss) ? '<p class="sc-foot">Sunrise ' + esc(d.sr) + ' &middot; Sunset ' + esc(d.ss) + '</p>' : '<p class="sc-foot"></p>');
    var ring = card.querySelector('.sc-ring .val');
    var off = String(100 - n);
    if (motionOff()) ring.style.strokeDashoffset = off;
    else requestAnimationFrame(function () { requestAnimationFrame(function () { ring.style.strokeDashoffset = off; }); });
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    return ok;
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  var sheet = $('shareSheet'), current = null, imgPromise = Promise.resolve(null);
  var FILE_NAME = 'basscast-forecast.png';
  function loadFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var jobs = Promise.all([
      document.fonts.load('200 250px "Inter"'),
      document.fonts.load('400 30px "Inter"'),
      document.fonts.load('500 40px "Inter"'),
      document.fonts.load('600 40px "Inter"')
    ]).catch(function () {});
    return Promise.race([jobs, new Promise(function (r) { setTimeout(r, 1500); })]);
  }
  function makeImage(d) {
    return loadFonts().then(function () {
      var c = drawShareCanvas(d, document.createElement('canvas'));
      return new Promise(function (res) { c.toBlob(function (b) { res(b || null); }, 'image/png'); });
    }).catch(function (e) { console.error('BassCast share image error:', e); return null; });
  }
  function payload() {
    var text = buildShareText(current);
    var data = { title: 'BassCast SA forecast', text: text };
    if (/^https?:/i.test(location.href)) data.url = location.href.split('#')[0];
    return data;
  }
  function open(btn) {
    var d = collect();
    if (!d) { toast('Load a forecast first, then share it'); return; }
    current = d;
    opener = btn;
    renderCard(d);
    imgPromise = makeImage(d);
    var canShare = !!navigator.share;
    $('shareGo').hidden = !canShare;
    $('shareCopy').classList.toggle('ghost', canShare);
    sheet.hidden = false;
    var first = canShare ? $('shareGo') : $('shareCopy');
    first.focus({ preventScroll: true });
  }
  function close(returnFocus) {
    sheet.hidden = true;
    if (returnFocus !== false && opener && opener.isConnected) opener.focus();
  }

  $('share').addEventListener('click', function () { open(this); });
  sheet.addEventListener('click', function (e) { if (e.target.closest('[data-sclose]')) close(); });
  $('shareCopy').addEventListener('click', function () {
    var p = payload();
    copyText(p.text + (p.url ? '\n' + p.url : '')).then(function (ok) {
      toast(ok ? 'Copied. Ready to paste and share' : 'Could not copy on this browser');
    });
  });
  function copyFallback(msg) {
    var p = payload();
    copyText(p.text + (p.url ? '\n' + p.url : '')).then(function (ok) {
      toast(ok ? msg : 'Could not share on this browser');
    });
  }
  $('shareGo').addEventListener('click', function () {
    if (!navigator.share) return;
    var p = payload();
    imgPromise.then(function (blob) {
      var data = p;
      if (blob && typeof File === 'function') {
        var file = new File([blob], FILE_NAME, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          data = { files: [file], title: p.title, text: p.text + (p.url ? '\n' + p.url : '') };
        }
      }
      return navigator.share(data).then(function () { close(false); });
    }).catch(function (err) {
      if (err && err.name === 'AbortError') return;
      copyFallback('Copied the summary. Ready to paste and share');
    });
  });
  $('shareSave').addEventListener('click', function () {
    imgPromise.then(function (blob) {
      if (!blob) { toast('Could not create the image on this browser'); return; }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = FILE_NAME;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
      toast('Image saved. Ready to send');
    });
  });
  document.addEventListener('keydown', function (e) {
    if (sheet.hidden) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'Tab') {
      var f = sheet.querySelectorAll('button:not([hidden])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
})();

/* ---------- recent spots ---------- */
(function () {
  var KEY = 'basscastRecent', MAX_STORED = 6, MAX_SHOWN = 4;
  function load() {
    try { var a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a.filter(function (r) { return r && (r.k === 's' ? r.id : r.n); }) : []; }
    catch (e) { return []; }
  }
  function save(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} }
  // Resolve against live data so renamed or deleted spots stay correct.
  function resolve() {
    var out = [];
    load().forEach(function (r) {
      if (r.k === 's') {
        var sp = spots.find(function (x) { return x.id === r.id; });
        if (sp) out.push({ k: 's', id: sp.id, name: sp.name });
      } else {
        var d = dams.find(function (x) { return x.name === r.n; });
        if (d) out.push({ k: 'd', name: d.name });
      }
    });
    return out;
  }
  function isCurrent(it) {
    return !!selected && ((selected.kind === 'spot' && it.k === 's' && selected.id === it.id) ||
                          (selected.kind === 'dam' && it.k === 'd' && selected.name === it.name));
  }
  function fill(box, items) {
    if (!items.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML = '<span class="rlabel">Recent</span>' + items.map(function (it) {
      return '<button type="button" class="rchip" data-k="' + it.k + '" data-id="' + esc(it.id || '') + '" data-n="' + esc(it.name) + '" title="' + esc(it.name) + '"><i aria-hidden="true"></i><span>' + esc(it.name) + '</span></button>';
    }).join('');
    box.hidden = false;
  }
  function render() {
    var items = resolve();
    fill($('recentsIntro'), items.slice(0, MAX_SHOWN));
    fill($('recentsLive'), items.filter(function (it) { return !isCurrent(it); }).slice(0, MAX_SHOWN));
  }
  function record() {
    if (!selected || (selected.kind !== 'dam' && selected.kind !== 'spot')) return;
    var e = selected.kind === 'spot' ? { k: 's', id: selected.id } : { k: 'd', n: selected.name };
    var list = load().filter(function (r) { return !(r.k === e.k && (e.k === 's' ? r.id === e.id : r.n === e.n)); });
    list.unshift(e);
    save(list.slice(0, MAX_STORED));
    render();
  }
  function go(btn) {
    var v = btn.dataset.k === 's' ? 'spot:' + btn.dataset.id : damOptionValue(btn.dataset.n);
    if (!v || v === 'custom') return;
    $('water').value = v;
    $('water').dispatchEvent(new Event('change'));
  }
  ['recentsIntro', 'recentsLive'].forEach(function (id) {
    $(id).addEventListener('click', function (e) {
      var b = e.target.closest('.rchip');
      if (b) go(b);
    });
  });
  // A spot counts as used once its forecast has actually loaded (live or from the offline copy).
  document.addEventListener('basscast:status', function (e) {
    var phase = e.detail ? e.detail.phase : '';
    if (phase === 'ready' || phase === 'offline') record();
  });
  // Spots can be renamed or deleted on the Map tab, so refresh when returning to Forecast.
  new MutationObserver(function () { if (!$('tab-forecast').hidden) render(); })
    .observe($('tab-forecast'), { attributes: true, attributeFilter: ['hidden'] });
  render();
})();

/* ---------- settings tab ---------- */
(function () {
  var panel = $('tab-settings');
  $('appVersion').textContent = 'Version ' + APP_VERSION;

  function homeKeyValid(k) {
    if (!k) return false;
    if (k.indexOf('d:') === 0) return dams.some(function (d) { return d.name === k.slice(2); });
    if (k.indexOf('s:') === 0) return spots.some(function (sp) { return sp.id === k.slice(2); });
    return false;
  }
  function buildHome() {
    var sel = $('setHome');
    var html = '<option value="">None</option>';
    if (spots.length) html += '<optgroup label="My spots">' + spots.map(function (sp) { return '<option value="s:' + esc(sp.id) + '">' + esc(sp.name) + '</option>'; }).join('') + '</optgroup>';
    html += '<optgroup label="Dams">' + dams.map(function (d) { return '<option value="d:' + esc(d.name) + '">' + esc(d.name) + '</option>'; }).join('') + '</optgroup>';
    sel.innerHTML = html;
    sel.value = homeKeyValid(settings.home) ? settings.home : '';
  }
  function sync() {
    panel.querySelectorAll('.segctl[data-setting]').forEach(function (g) {
      var k = g.dataset.setting;
      g.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === settings[k])); });
    });
    $('setLayer').value = settings.layer;
    $('setMotion').checked = !!settings.motion;
    $('setTips').checked = !!settings.tips;
    $('setLearn').checked = !!settings.learn;
    buildHome();
  }
  function refreshForecast() {
    // Re-draw the forecast in the new units or advice, if one is showing.
    if (typeof heroState !== 'undefined' && heroState === 'ready') load();
  }
  function changed(k) {
    saveSettings();
    if (k === 'theme') applyTheme();
    else if (k === 'motion') applyMotion();
    else if (k === 'layer') setMapLayer(settings.layer);
    else if (k === 'tips') document.dispatchEvent(new CustomEvent('basscast:tips'));
    else if (k === 'wind' || k === 'angler') refreshForecast();
    else if (k === 'learn') { infCache = null; refreshForecast(); }
  }

  panel.addEventListener('click', function (e) {
    var b = e.target.closest('.segctl[data-setting] button');
    if (!b) return;
    var k = b.closest('.segctl').dataset.setting;
    if (settings[k] === b.dataset.v) return;
    settings[k] = b.dataset.v;
    sync();
    changed(k);
  });
  $('setHome').addEventListener('change', function () { settings.home = this.value; changed('home'); });
  $('setLayer').addEventListener('change', function () { settings.layer = this.value; changed('layer'); });
  $('setMotion').addEventListener('change', function () { settings.motion = this.checked; changed('motion'); });
  $('setTips').addEventListener('change', function () { settings.tips = this.checked; changed('tips'); });
  $('setLearn').addEventListener('change', function () { settings.learn = this.checked; changed('learn'); });
  document.addEventListener('basscast:settings-restored', function () { sync(); setMapLayer(settings.layer); });

  // Refresh the home spot list whenever Settings is opened (spots may have been added or renamed).
  new MutationObserver(function () { if (!panel.hidden) sync(); })
    .observe(panel, { attributes: true, attributeFilter: ['hidden'] });

  // Delete all data: two taps, then a clean reload.
  $('wipeBtn').addEventListener('click', function () {
    var b = this;
    if (!b.dataset.armed) {
      b.dataset.armed = '1';
      b.textContent = 'Tap again to delete';
      $('wipeMsg').textContent = 'This cannot be undone.';
      setTimeout(function () { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Delete everything'; $('wipeMsg').textContent = ''; } }, 4000);
      return;
    }
    try {
      Object.keys(localStorage).filter(function (k) { return k.indexOf('basscast') === 0; }).forEach(function (k) { localStorage.removeItem(k); });
    } catch (err) { $('wipeMsg').textContent = 'This browser would not let the data be removed.'; return; }
    location.reload();
  });

  sync();

  // Home spot: open straight to its forecast on start.
  if (homeKeyValid(settings.home)) {
    var k = settings.home;
    $('water').value = k.indexOf('s:') === 0 ? 'spot:' + k.slice(2) : damOptionValue(k.slice(2));
    if ($('water').value && $('water').value !== 'custom') $('water').dispatchEvent(new Event('change'));
  }
})();

