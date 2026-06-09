export function initDeeplink(nav) {
  function applyHash() {
    const m = location.hash.match(/^#\/slide\/(\d+)$/);
    if (m) nav.goTo(parseInt(m[1], 10) - 1);
  }
  window.addEventListener('hashchange', applyHash);
  applyHash();
}
