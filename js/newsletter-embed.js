// Click-to-load for the homepage Substack subscribe form.
// The Substack embed is a cross-origin iframe that sets substack.com cookies as
// soon as it loads. The site's cookie-consent config (layouts/partials/cookie-consent.html)
// only declares "necessary" and "analytics" categories, so a third-party embed has no
// category to belong to. Rather than widen the banner, the iframe is not in the markup
// at all: it is injected only when the visitor presses Subscribe. Nothing is requested
// from substack.com on page load.
//
// Ships site-wide via params.custom_js but only ever acts on the homepage, where
// layouts/partials/home.html renders [data-embed-src] / [data-embed-toggle].
// The "open on Substack" link is the no-JS fallback and is never touched.

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('[data-embed-toggle]');
  if (!toggle) {
    return;
  }

  const action = toggle.closest('[data-embed-src]');
  const src = action && action.dataset.embedSrc;
  if (!action || !src) {
    return;
  }

  let loaded = false;

  toggle.addEventListener('click', () => {
    if (loaded) {
      return;
    }
    loaded = true;

    try {
      const wrapper = document.createElement('div');
      wrapper.className = 'cta-embed';

      const frame = document.createElement('iframe');
      frame.src = src;
      frame.title = 'Subscribe to the newsletter';
      frame.loading = 'lazy';
      frame.scrolling = 'no';
      frame.setAttribute('frameborder', '0');

      wrapper.appendChild(frame);
      action.insertBefore(wrapper, toggle);

      // One subscribe affordance at a time: the button and the cookie note are
      // replaced by the form itself. The Substack link below stays put.
      toggle.hidden = true;
      const privacy = action.querySelector('.cta-privacy');
      if (privacy) {
        privacy.hidden = true;
      }

      frame.focus();
    } catch (err) {
      // Leave the button and the "open on Substack" link working.
      loaded = false;
      console.error('Could not load the newsletter form:', err);
    }
  });
});
