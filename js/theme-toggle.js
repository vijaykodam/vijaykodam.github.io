// Dark-mode toggle for the redesign.
// Binds #theme-toggle: flips html[data-theme] between light/dark, persists the
// choice in localStorage('theme'), and keeps the cookie-consent banner's dark
// class (cc--darkmode) in sync. Icon swap (sun/moon) is handled purely in CSS
// via the html[data-theme] attribute; this script only sets that attribute.

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) {
    return;
  }

  const root = document.documentElement;

  const prefersDark = () =>
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  // Effective scheme right now: explicit data-theme wins, else system preference.
  const isDarkNow = () => {
    const attr = root.dataset.theme;
    if (attr === 'dark' || attr === 'light') {
      return attr === 'dark';
    }
    return prefersDark();
  };

  const syncButton = (isDark) => {
    toggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
  };

  // Reflect the initial (bootstrap-resolved) state on the button.
  syncButton(isDarkNow());

  toggle.addEventListener('click', () => {
    try {
      const nextDark = !isDarkNow();
      const theme = nextDark ? 'dark' : 'light';
      root.dataset.theme = theme;
      localStorage.setItem('theme', theme);
      root.classList.toggle('cc--darkmode', nextDark);
      syncButton(nextDark);
    } catch (e) {
      // localStorage can throw in private mode; still flip the attribute.
      const nextDark = !isDarkNow();
      root.dataset.theme = nextDark ? 'dark' : 'light';
      root.classList.toggle('cc--darkmode', nextDark);
      syncButton(nextDark);
    }
  });
});
