// Runs before first paint to avoid a light/dark flash.
(function () {
  var t = null;
  try { t = localStorage.getItem('ca-theme'); } catch (e) { /* storage unavailable */ }
  if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
})();
