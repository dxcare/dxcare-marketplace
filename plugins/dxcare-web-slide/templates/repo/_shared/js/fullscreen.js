export function initFullscreen() {
  function toggle() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'f' || e.key === 'F') toggle(); });
  document.querySelector('[data-action="fullscreen"]')?.addEventListener('click', toggle);
}
