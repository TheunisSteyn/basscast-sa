/* BassCast SA presentation layer (2026.10.27 redesign).
 *
 * Everything here is visual. It reads what app.js has already worked out and dresses it up:
 *  - the hero: band tint, score arc and the four condition tiles
 *  - today's score for every dam and saved spot, for the spot picker leaderboard, My spots and the
 *    map badges. These use app.js's own scoring functions on the same Open-Meteo data, so they always
 *    match the main forecast. They load only when the picker or the Map tab is opened, in one
 *    request, and are reused for an hour.
 *  - the map's floating tools and bottom sheet
 * It never changes a score, a window or any saved data apart from its own score cache.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var txt = function (id) { var e = $(id); return e ? String(e.textContent || '').replace(/\s+/g, ' ').trim() : ''; };

  /* ---------- hero ---------- */
  var hero = document.querySelector('#tab-forecast .hero');
  var arc = $('heroArc');
  var COMPASS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  var ARROW = '<svg class="dirarrow" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style="transform:rotate({r}deg)"><path d="M12 3v18M6 9l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var TREND = { fall: '↘', rise: '↗', steady: '→' };

  function setStat(id, value, sub, html) {
    var el = $(id);
    if (!el) return;
    var b = el.querySelector('b'), s = el.querySelector('small');
    if (html) b.innerHTML = value; else b.textContent = value;
    s.textContent = sub || ' ';
  }

  function decorateHero() {
    var score = parseInt(txt('gaugePinVal'), 10);
    if (!Number.isFinite(score)) return;
    var key = bandKey(score);
    hero.setAttribute('data-band', key);
    document.documentElement.setAttribute('data-band', key);
    if (arc) {
      var off = String(100 - Math.max(0, Math.min(100, score)));
      if (motionOff()) arc.style.strokeDashoffset = off;
      else { arc.style.strokeDashoffset = '100'; requestAnimationFrame(function () { requestAnimationFrame(function () { arc.style.strokeDashoffset = off; }); }); }
    }

    // Water: the same estimate (or your reading) as the Conditions list
    try {
      var day = $('forecastDay').value || (lastData && lastCtx ? lastData.daily.time[lastCtx.histDays] : '');
      var tw = lastCtx && lastCtx.water ? lastCtx.water[day] : NaN, tr = lastCtx && lastCtx.trend ? lastCtx.trend[day] : 0;
      var src = lastCtx && lastCtx.waterSrc ? lastCtx.waterSrc[day] : 'estimated';
      if (Number.isFinite(tw)) {
        var v = src === 'measured' ? tw.toFixed(1) : String(Math.round(tw));
        setStat('statWater', esc(v) + '°' + (src === 'estimated' ? '<span class="est" title="Estimated from the past week of air temperature">Est.</span>' : ''),
          src === 'measured' ? 'Measured' : tr >= 1 ? 'Warming' : tr <= -1 ? 'Cooling' : 'Steady', true);
      }
    } catch (e) { /* the tile keeps its dash */ }

    // Wind at the best hour, with an arrow showing where it blows to
    var w = txt('wind').match(/^([\d.]+)\s*(\S+)\s*([NESW]{1,3})?$/);
    if (w) {
      var i = COMPASS16.indexOf(w[3] || '');
      var arrow = i >= 0 ? ARROW.replace('{r}', String((i * 22.5 + 180) % 360)) : '';
      $('statWind').title = w[3] ? 'Wind from the ' + w[3] : '';
      setStat('statWind', esc(w[1]) + '<small class="unit"> ' + esc(w[2]) + '</small>', '', true);
      $('statWind').querySelector('small:not(.unit)').innerHTML = (arrow + ' ' + (w[3] ? esc(w[3]) : '')).trim() || ' ';
    }

    // Pressure trend (now, or at your best hour on other days)
    var tag = $('pressureTag'), kind = tag ? (tag.className.match(/\b(fall|rise|steady)\b/) || [])[1] : '';
    var hpa = txt('pressureVal').replace(/\s*hPa$/, '');
    if (/^\d+$/.test(hpa)) setStat('statPressure', (TREND[kind] || '') + ' ' + hpa, kind ? txt('pressureTag') : '');

    // Moon
    var mo = txt('moon').replace(/\.$/, '').split(/,\s*/);
    if (mo[0] && mo[0] !== '–') {
      var lit = (mo[1] || '').replace(/\s*lit$/, '');
      setStat('statMoon', '<span class="moonico">' + moonIconSvg(mo[0]) + '</span>' + esc(lit), mo[0].replace(/ moon$/i, ''), true);
    }
  }
  document.addEventListener('basscast:status', function (e) {
    var ph = e.detail && e.detail.phase;
    if (ph === 'ready' || ph === 'offline') { decorateHero(); seedFromMain(); }
  });

  /* ---------- today's score for every spot ---------- */
  var KEY = 'basscastSpotScores', TTL = 3600e3;
  var cache = readCache(), inflight = null;
  function k(lat, lon) { return Number(lat).toFixed(2) + ',' + Number(lon).toFixed(2); }
  function today() { return localISODate(new Date()); }
  function readCache() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!c || typeof c !== 'object' || typeof c.day !== 'string' || !c.map || typeof c.map !== 'object') throw 0;
      var map = {};
      Object.keys(c.map).forEach(function (key) {
        var e = c.map[key];
        if (/^-?\d+\.\d\d,-?\d+\.\d\d$/.test(key) && e && [e.score, e.startH, e.endH, e.wind, e.at].every(Number.isFinite) && e.score >= 0 && e.score <= 100)
          map[key] = { score: Math.round(e.score), startH: e.startH | 0, endH: e.endH | 0, wind: +e.wind, dir: Number.isFinite(e.dir) ? +e.dir : NaN, at: +e.at };
      });
      return { day: c.day, map: map };
    } catch (e) { return { day: '', map: {} }; }
  }
  function saveCache() { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) {} }
  function checkDay() { if (cache.day !== today()) cache = { day: today(), map: {} }; }

  window.spotMeta = function (lat, lon) {
    checkDay();
    return cache.map[k(lat, lon)] || null;
  };

  function selFor(t) { return t.kind === 'dam' ? { kind: 'dam', name: t.name } : t.kind === 'spot' ? { kind: 'spot', id: t.id } : { kind: 'free' }; }
  function store(t, data, ctx) {
    var idx = ctx.histDays;
    if (data.daily.time[idx] !== today()) return;
    var r = scoreDayV2(data, idx, ctx, currentInfluence().a);
    if (!r || !Number.isFinite(r.dayScore)) return;
    cache.map[k(t.lat, t.lon)] = { score: r.dayScore, startH: r.startH, endH: r.endH, wind: r.best.wind, dir: safeNum(r.best.h.wind_direction_10m, NaN), at: Date.now() };
  }
  // The main forecast already has the selected spot, so reuse it instead of fetching it again.
  function seedFromMain() {
    try {
      if (!lastData || !lastCtx || !selected) return;
      checkDay();
      store({ lat: selected.lat, lon: selected.lon }, lastData, lastCtx);
      saveCache();
      refreshAll();
    } catch (e) { /* not essential */ }
  }

  function targets() {
    var a = dams.map(function (d) { return { kind: 'dam', name: d.name, lat: d.lat, lon: d.lon }; });
    spots.forEach(function (sp) { a.push({ kind: 'spot', id: sp.id, lat: sp.lat, lon: sp.lon }); });
    if (selected && selected.kind === 'free') a.push({ kind: 'free', lat: selected.lat, lon: selected.lon });
    var seen = {};
    return a.filter(function (t) { var key = k(t.lat, t.lon); if (seen[key]) return false; seen[key] = 1; return true; });
  }

  function loadScores(force) {
    checkDay();
    var now = Date.now();
    var need = targets().filter(function (t) { var e = cache.map[k(t.lat, t.lon)]; return force || !e || now - e.at > TTL; });
    if (!need.length) return Promise.resolve(false);
    if (inflight) return inflight;
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + need.map(function (t) { return t.lat.toFixed(4); }).join(',') +
      '&longitude=' + need.map(function (t) { return t.lon.toFixed(4); }).join(',') +
      '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m&daily=sunrise,sunset&past_days=7&forecast_days=7&timezone=auto';
    var ctrl = new AbortController(), timer = setTimeout(function () { ctrl.abort(); }, 20000);
    document.documentElement.classList.add('scores-loading');
    inflight = fetch(url, { signal: ctrl.signal })
      .then(function (res) { if (!res.ok) throw Error('scores ' + res.status); return res.json(); })
      .then(function (raw) {
        var list = Array.isArray(raw) ? raw : [raw];
        need.forEach(function (t, i) {
          try {
            var data = cleanForecast(list[i]);
            if (!data || !data.daily || !data.daily.time) return;
            store(t, data, applyMeasured(buildContext(data), getMeasured(selFor(t), t.lat, t.lon)));
          } catch (e) { console.warn('BassCast: could not score', t, e); }
        });
        saveCache();
        return true;
      })
      .catch(function (e) { console.warn('BassCast: spot scores unavailable.', e && e.message); return false; })
      .finally(function () {
        clearTimeout(timer); inflight = null;
        document.documentElement.classList.remove('scores-loading');
        refreshAll();
      });
    return inflight;
  }

  function refreshAll() {
    try { refreshMarkerIcons(); } catch (e) {}
    try { if (typeof window.rebuildPicker === 'function') window.rebuildPicker(); } catch (e) {}
    try { if (!editingId) renderMySpots(); } catch (e) {}
    try { updateSheet(); } catch (e) {}
  }

  // Load when the picker or the Map tab is opened.
  document.querySelectorAll('.spotpill').forEach(function (b) { b.addEventListener('click', function () { loadScores(false); }); });
  var mapPanel = $('tab-map');
  new MutationObserver(function () { if (!mapPanel.hidden) loadScores(false); }).observe(mapPanel, { attributes: true, attributeFilter: ['hidden'] });

  /* ---------- map: floating tools and bottom sheet ---------- */
  $('mapDrop').addEventListener('click', function () {
    if (!map) return;
    var c = map.getCenter();
    startFreeSpot(c.lat, c.lng);
  });

  var pinTimer = null;
  function updateSheet() {
    var box = $('msHero');
    if (!selected) { box.hidden = true; return; }
    var m = spotMeta(selected.lat, selected.lon);
    box.hidden = false;
    $('msName').textContent = selected.name;
    var badge = $('msBadge'), tag = $('msTag');
    badge.className = 'badge lg ' + (m ? 'b-' + bandKey(m.score) : 'none');
    badge.textContent = m ? m.score : '';
    tag.hidden = !m;
    if (m) { tag.className = 'btag b-' + bandKey(m.score); tag.textContent = quality(m.score); }
    if (m) $('msMeta').innerHTML = spotLine(m);
    else $('msMeta').textContent = document.documentElement.classList.contains('scores-loading') ? 'Loading today’s score…' : 'Today’s score shows once the forecast loads.';
    $('mapSheet').classList.toggle('has-hero', true);
    // A dropped or dragged pin is not in the dam list, so score it on its own after a short pause.
    if (!m && selected.kind === 'free' && !mapPanel.hidden) {
      clearTimeout(pinTimer);
      pinTimer = setTimeout(function () { loadScores(false); }, 700);
    }
    try { refreshMarkerIcons(); } catch (e) {}
  }
  new MutationObserver(updateSheet).observe($('mapPick'), { childList: true, characterData: true, subtree: true });
})();
