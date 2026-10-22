/* BassCast SA: installable app support.
 *
 *  1. Registers the service worker (offline app shell).
 *  2. Works out whether BassCast is already installed / running as an app.
 *  3. If not installed, shows the install card once per page load, on every visit.
 *     "Not now" only hides it for this page load. Nothing is stored to suppress it.
 *  4. Uses the browser's own install dialog when it offers one (beforeinstallprompt),
 *     otherwise shows the right steps for the browser in use.
 *  5. Flags offline state so the map can say its tiles need a connection, and refreshes
 *     the forecast automatically when the connection comes back.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var card = $('installCard');
  var goBtn = $('installGo');
  var laterBtn = $('installLater');
  var help = $('installHelp');

  var deferredPrompt = null;   // saved beforeinstallprompt event
  var shownThisLoad = false;   // one card per page load, never duplicates
  var installedNow = false;    // appinstalled fired during this page load
  var helpOpen = false;
  var returnFocus = null;

  /* ---------------- service worker ---------------- */
  var swOk = 'serviceWorker' in navigator &&
    (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');

  if (swOk) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
        .then(function (reg) {
          // An app left open for days should still pick up new releases.
          document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') reg.update().catch(function () {});
          });
        })
        .catch(function (err) { console.warn('BassCast: service worker not registered', err); });
    });
  }

  /* ---------------- installed-state detection ---------------- */
  var modes = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'];
  var modeQueries = window.matchMedia ? modes.map(function (m) { return matchMedia('(display-mode: ' + m + ')'); }) : [];

  function runningAsApp() {
    if (modeQueries.some(function (q) { return q.matches; })) return true;
    if (window.navigator.standalone === true) return true;               // iOS home-screen app
    if (document.referrer && document.referrer.indexOf('android-app://') === 0) return true; // Android TWA
    return false;
  }

  // Chromium can report that this web app is installed even when it is opened in a normal tab,
  // via related_applications in the manifest. Other browsers return nothing; that is not proof
  // either way, so a missing answer never counts as "installed".
  function installedElsewhere() {
    if (!('getInstalledRelatedApps' in navigator)) return Promise.resolve(false);
    var check = navigator.getInstalledRelatedApps()
      .then(function (apps) { return !!(apps && apps.length); })
      .catch(function () { return false; });
    var timeout = new Promise(function (r) { setTimeout(function () { r(false); }, 1500); });
    return Promise.race([check, timeout]);
  }

  function isInstalled() { return installedNow || runningAsApp(); }

  function markMode() {
    document.documentElement.classList.toggle('pwa-standalone', runningAsApp());
  }
  markMode();

  modeQueries.forEach(function (q) {
    var onChange = function () { markMode(); if (runningAsApp()) hideCard(); };
    if (q.addEventListener) q.addEventListener('change', onChange);
    else if (q.addListener) q.addListener(onChange);
  });

  /* ---------------- browser detection (for the manual steps) ---------------- */
  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/i.test(ua);
  var inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|WhatsApp|Snapchat|TikTok/i.test(ua);
  var isSamsung = /SamsungBrowser/i.test(ua);
  var isFirefox = /Firefox|FxiOS/i.test(ua);
  var isEdge = /Edg(e|A|iOS)?\//i.test(ua);
  var isOpera = /OPR\/|Opera/i.test(ua);
  var isChrome = /Chrome|CriOS/i.test(ua) && !isEdge && !isOpera && !isSamsung;
  var isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|Edg|OPR|FxiOS|Firefox/i.test(ua);

  var SHARE_ICON = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11v9h12v-9"/></svg>';
  var DOTS_V = '<b aria-label="menu">&#8942;</b>';
  var DOTS_H = '<b aria-label="menu">&middot;&middot;&middot;</b>';

  function steps(list, note) {
    return '<ol>' + list.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' +
      (note ? '<p class="note">' + note + '</p>' : '');
  }

  function manualHelp() {
    if (inApp) {
      return '<strong>Open BassCast in your browser first.</strong>' + steps([
        'Tap the menu in this app and choose <b>Open in browser</b> (or Open in Safari / Chrome).',
        'Then tap <b>Install BassCast SA</b> again.'
      ], 'Apps like WhatsApp, Facebook and Instagram open links in a built-in viewer that can’t install web apps.');
    }
    if (isIOS) {
      return '<strong>Add BassCast to your Home Screen</strong>' + steps([
        'Tap the <b>Share</b> button ' + SHARE_ICON + (isSafari ? ' in Safari’s toolbar (on newer iOS it may sit under ' + DOTS_H + ').' : ' in your browser’s address bar or menu.'),
        'Scroll down and tap <b>Add to Home Screen</b>.',
        'Tap <b>Add</b>. BassCast will open full screen from its icon.'
      ], isSafari ? '' : 'Don’t see it? Open this page in Safari and try there. Older iOS versions only allow it from Safari.');
    }
    if (isAndroid) {
      if (isSamsung) {
        return '<strong>Install on Samsung Internet</strong>' + steps([
          'Tap the install icon in the address bar if you see one, or open the menu <b>&#9776;</b>.',
          'Choose <b>Add page to</b> → <b>Apps</b> (or <b>Home screen</b>).'
        ]);
      }
      if (isFirefox) {
        return '<strong>Install on Firefox</strong>' + steps([
          'Tap the menu ' + DOTS_V + '.',
          'Choose <b>Install</b> or <b>Add to Home screen</b>.'
        ]);
      }
      return '<strong>Install on Android</strong>' + steps([
        'Tap your browser’s menu ' + DOTS_V + ' (top right).',
        'Choose <b>Install app</b> or <b>Add to Home screen</b>.',
        'Confirm with <b>Install</b>.'
      ], 'If the option is missing, reload the page once and try again.');
    }
    // Desktop
    if (isEdge) {
      return '<strong>Install with Microsoft Edge</strong>' + steps([
        'Click the app install icon at the right of the address bar, or open the menu ' + DOTS_H + '.',
        'Choose <b>Apps</b> → <b>Install this site as an app</b>.'
      ]);
    }
    if (isChrome || isOpera) {
      return '<strong>Install with your browser</strong>' + steps([
        'Click the install icon at the right of the address bar, or open the menu ' + DOTS_V + '.',
        'Choose <b>Cast, save and share</b> → <b>Install page as app</b> (or <b>Install BassCast SA</b>).'
      ]);
    }
    if (isSafari) {
      return '<strong>Add to your Dock (Safari on Mac)</strong>' + steps([
        'In the menu bar choose <b>File</b> → <b>Add to Dock</b>, or click Share ' + SHARE_ICON + ' → <b>Add to Dock</b>.',
        'Click <b>Add</b>.'
      ], 'Needs macOS Sonoma (14) or newer.');
    }
    if (isFirefox) {
      return '<strong>This browser can’t install web apps</strong>' +
        '<p class="note" style="margin-top:4px">Firefox on desktop doesn’t support installing sites as apps. Open BassCast in Chrome or Edge to install it, or bookmark it for quick access. Everything works here as normal.</p>';
    }
    return '<strong>Install from your browser menu</strong>' + steps([
      'Look in your browser’s menu for <b>Install</b>, <b>Install app</b> or <b>Add to Home screen</b>.'
    ], 'If there isn’t one, this browser can’t install web apps. BassCast still works fully here, and you can bookmark it.');
  }

  /* ---------------- toast (reuses the app's toast element) ---------------- */
  var toastTimer = null;
  function toast(msg, ms) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 3200);
  }

  /* ---------------- card ---------------- */
  function setPrimary(label) { goBtn.textContent = label; }

  function showCard() {
    if (!card || shownThisLoad || isInstalled()) return;
    shownThisLoad = true;
    helpOpen = false;
    help.hidden = true;
    help.innerHTML = '';
    setPrimary('Install BassCast SA');
    card.hidden = false;
    card.classList.add('enter');
  }

  function hideCard() {
    if (!card || card.hidden) return;
    var hadFocus = card.contains(document.activeElement);
    card.hidden = true;
    card.classList.remove('enter');
    if (hadFocus) {
      var to = returnFocus && document.contains(returnFocus) ? returnFocus : document.querySelector('.tab[aria-selected="true"]');
      if (to && to.focus) to.focus();
    }
  }

  function openHelp() {
    help.innerHTML = manualHelp();
    help.hidden = false;
    helpOpen = true;
    setPrimary('Got it');
    goBtn.setAttribute('aria-expanded', 'true');
  }

  if (goBtn) goBtn.addEventListener('click', function () {
    if (deferredPrompt) {
      var evt = deferredPrompt;
      deferredPrompt = null;            // the saved event can only be used once
      goBtn.disabled = true;
      Promise.resolve(evt.prompt())
        .then(function () { return evt.userChoice; })
        .then(function (choice) {
          goBtn.disabled = false;
          hideCard();
          if (choice && choice.outcome === 'accepted') {
            // Accepted is not the same as finished; "appinstalled" confirms it.
            toast('Installing BassCast SA…');
          }
        })
        .catch(function (err) {
          console.warn('BassCast: install prompt failed', err);
          goBtn.disabled = false;
          openHelp();
        });
      return;
    }
    if (helpOpen) { hideCard(); return; }
    openHelp();
  });

  if (laterBtn) laterBtn.addEventListener('click', function () {
    hideCard(); // this page load only; it shows again on the next visit if still not installed
  });

  if (card) card.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hideCard();
  });

  /* ---------------- install events ---------------- */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();               // keep the browser's mini-bar away; our button triggers it
    deferredPrompt = e;
    if (card && !card.hidden && helpOpen) {
      // A native install became available while manual steps were showing: offer it.
      help.hidden = true;
      helpOpen = false;
      setPrimary('Install BassCast SA');
      goBtn.removeAttribute('aria-expanded');
    }
  });

  window.addEventListener('appinstalled', function () {
    installedNow = true;
    deferredPrompt = null;
    hideCard();
    toast('BassCast SA is installed. Open it from your home screen or app list.', 4200);
  });

  /* ---------------- show on load ---------------- */
  function whenReady(fn) {
    if (document.readyState === 'complete') fn();
    else window.addEventListener('load', fn, { once: true });
  }

  if (!runningAsApp()) {
    whenReady(function () {
      // Small pause so the forecast has started loading and the card doesn't jump in mid-paint.
      setTimeout(function () {
        installedElsewhere().then(function (yes) {
          if (yes) { installedNow = true; return; }
          showCard();
        });
      }, 1200);
    });
  }

  /* ---------------- online / offline ---------------- */
  function addMapNote() {
    var panel = $('tab-map'), map = $('map');
    if (!panel || !map || $('mapOffline')) return;
    var n = document.createElement('p');
    n.id = 'mapOffline';
    n.className = 'mapoffline';
    n.setAttribute('role', 'status');
    n.textContent = 'You’re offline. Map tiles need a connection, so parts of the map may be blank or out of date. Your saved spots and last forecast still work.';
    map.parentNode.insertBefore(n, map);
  }

  function setOffline(off) {
    document.documentElement.classList.toggle('is-offline', off);
  }

  addMapNote();
  setOffline(navigator.onLine === false);

  window.addEventListener('offline', function () { setOffline(true); });
  window.addEventListener('online', function () {
    setOffline(false);
    // If the app is showing a saved (offline) forecast or a connection error, fetch fresh data.
    var s = $('status');
    var phase = s && s.dataset ? s.dataset.phase : '';
    if ((phase === 'offline' || phase === 'error') && typeof window.load === 'function') {
      var water = $('water');
      if (water && water.value) { try { window.load(); } catch (e) {} }
    }
  });
})();
