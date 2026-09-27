// Runs before first paint so the page never flashes the wrong theme.
(function () {
  try {
    var stored = localStorage.getItem('pramaan-theme');
    var dark =
      stored === 'dark' ||
      ((stored === null || stored === 'system') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch {
    // Storage blocked: fall back to the light theme.
  }
})();
