(function () {
  var GA_ID = 'G-9L86XBXWE8';
  var COOKIE_NAME = 'cc_cookie';

  function readConsentCookie() {
    var parts = document.cookie ? document.cookie.split('; ') : [];
    for (var i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf('=');
      if (eq === -1) continue;
      if (parts[i].slice(0, eq) !== COOKIE_NAME) continue;
      try {
        return JSON.parse(decodeURIComponent(parts[i].slice(eq + 1)));
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  function analyticsAccepted() {
    var c = readConsentCookie();
    return !!(c && Array.isArray(c.categories) && c.categories.indexOf('analytics') !== -1);
  }

  function loadGA() {
    if (typeof window.gtag === 'function') return;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_ID, {
      anonymize_ip: true,
      cookie_flags: 'SameSite=None;Secure'
    });
  }

  if (analyticsAccepted()) loadGA();
})();
