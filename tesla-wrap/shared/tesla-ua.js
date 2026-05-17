// Tesla in-car browser detection.
//
// Older Tesla MCUs report `QtCarBrowser`; newer firmware ships a Chromium
// build that includes the substring `Tesla` in the user-agent. Either
// substring is sufficient evidence the page is rendered on a vehicle screen.
//
// Exposed as a global so this script can be loaded via plain <script src>
// without ES modules (consistent with how shared/models.js is loaded).
(function () {
  'use strict';
  function isTeslaBrowser(ua) {
    var s = ua || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
    return /QtCarBrowser|Tesla/i.test(s);
  }
  if (typeof window !== 'undefined') window.isTeslaBrowser = isTeslaBrowser;
  if (typeof module !== 'undefined') module.exports = { isTeslaBrowser: isTeslaBrowser };
})();
