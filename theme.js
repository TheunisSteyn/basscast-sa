/* Apply saved appearance before first paint so dark mode does not flash light. */
(function () {
  try {
    var s = JSON.parse(localStorage.getItem('basscastSettings') || '{}') || {};
    var t = s.theme === 'light' || s.theme === 'dark' ? s.theme : 'auto';
    var dark = t === 'dark' || (t === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
    if (s.motion === true) document.documentElement.classList.add('reduce-motion');
  } catch (e) {}
})();
