/**
 * Pinterest widget utilities and URL validators for Designer Hub.
 *
 * Rules:
 * 1. Only official script: https://assets.pinterest.com/js/pinit.js
 * 2. Loaded once, lazily, only on Designer Hub pages.
 * 3. After React renders new embeds, call window.PinUtils.build().
 * 4. Strict URL validation for boards and pins.
 */

let pinitPromise = null;

/**
 * Lazily loads Pinterest's official widget script (pinit.js) once.
 * Resolves with window.PinUtils when loaded.
 */
export function loadPinterestScript() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.PinUtils && typeof window.PinUtils.build === 'function') {
    return Promise.resolve(window.PinUtils);
  }
  if (pinitPromise) return pinitPromise;

  pinitPromise = new Promise((resolve) => {
    // Check if script element is already in the document
    const existing = document.querySelector('script[src*="assets.pinterest.com/js/pinit.js"]');
    if (existing) {
      let elapsed = 0;
      const interval = setInterval(() => {
        elapsed += 100;
        if (window.PinUtils && typeof window.PinUtils.build === 'function') {
          clearInterval(interval);
          resolve(window.PinUtils);
        } else if (elapsed >= 5000) {
          clearInterval(interval);
          resolve(window.PinUtils || null);
        }
      }, 100);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://assets.pinterest.com/js/pinit.js';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      resolve(window.PinUtils || null);
    };
    script.onerror = () => {
      console.warn('Failed to load Pinterest pinit.js script');
      resolve(null);
    };
    document.body.appendChild(script);
  });

  return pinitPromise;
}

/**
 * Triggers Pinterest PinUtils.build() on newly rendered elements.
 */
export function buildPinterestWidgets() {
  if (typeof window === 'undefined') return;
  if (window.PinUtils && typeof window.PinUtils.build === 'function') {
    try {
      window.PinUtils.build();
    } catch (err) {
      console.warn('PinUtils.build() error:', err);
    }
  } else {
    // Ensure script is loaded, then trigger build
    loadPinterestScript().then((PinUtils) => {
      if (PinUtils && typeof PinUtils.build === 'function') {
        try {
          PinUtils.build();
        } catch (err) {
          console.warn('PinUtils.build() error on load:', err);
        }
      }
    });
  }
}

/**
 * Validates a Pinterest board URL.
 * Accepts:
 *   - https://(www.)?pinterest.com/<user>/<board>/ (and country domains e.g. pinterest.co.uk)
 *   - https://pin.it/<shortcode>
 * Rejects:
 *   - pinterest.com/pin/...
 *   - pinterest.com/search/...
 *   - Non-board URLs and arbitrary domains
 */
export function isValidPinterestBoardUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const trimmed = urlStr.trim();
  if (!trimmed) return false;

  try {
    const withProto = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withProto);
    const host = parsed.hostname.toLowerCase();

    // pin.it short links (e.g. pin.it/abc123)
    if (host === 'pin.it' || host === 'www.pin.it') {
      const parts = parsed.pathname.split('/').filter(Boolean);
      return parts.length >= 1;
    }

    // pinterest domains (pinterest.com, pinterest.ca, etc.)
    if (host === 'pinterest.com' || host.endsWith('.pinterest.com') || /^pinterest\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host)) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      // A board URL has at least 2 segments: <user>/<board>
      if (parts.length >= 2) {
        const first = parts[0].toLowerCase();
        // Reject reserved non-user paths
        const reserved = ['pin', 'pins', 'search', 'today', 'settings', 'business', 'ideas', 'explore', 'login', 'signup', 'oauth'];
        if (reserved.includes(first)) {
          return false;
        }
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Cleans and normalizes a Pinterest board URL for storage.
 */
export function normalizePinterestBoardUrl(urlStr) {
  const trimmed = (urlStr || '').trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Derives a human-friendly board title from a board URL if user didn't specify one.
 * e.g. https://www.pinterest.com/intentdigital/japandi-kitchens/ -> "Japandi Kitchens"
 */
export function deriveBoardTitleFromUrl(urlStr) {
  try {
    const withProto = urlStr.startsWith('http://') || urlStr.startsWith('https://') ? urlStr : `https://${urlStr}`;
    const parsed = new URL(withProto);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      const slug = parts[1];
      return slug
        .replace(/[-_]+/g, ' ')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
  } catch {
    // fallback
  }
  return 'Inspiration Board';
}

/**
 * Validates and parses a Pinterest pin URL.
 * Accepts:
 *   - https://(www.)?pinterest.com/pin/<pin_id>/
 *   - https://pin.it/<shortcode>
 * Returns: { valid: true, pin_url: string, pin_id: string } or null.
 */
export function parsePinterestPinUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null;
  const trimmed = urlStr.trim();
  if (!trimmed) return null;

  try {
    const withProto = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withProto);
    const host = parsed.hostname.toLowerCase();

    // pin.it short links
    if (host === 'pin.it' || host === 'www.pin.it') {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length >= 1) {
        const id = parts[0].replace(/[^a-zA-Z0-9_-]/g, '');
        if (id) {
          return {
            valid: true,
            pin_url: `https://pin.it/${id}`,
            pin_id: id
          };
        }
      }
      return null;
    }

    // pinterest domains: /pin/<id>/
    if (host === 'pinterest.com' || host.endsWith('.pinterest.com') || /^pinterest\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host)) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && parts[0].toLowerCase() === 'pin') {
        const id = parts[1].replace(/[^a-zA-Z0-9_-]/g, '');
        if (id) {
          return {
            valid: true,
            pin_url: `https://www.pinterest.com/pin/${id}/`,
            pin_id: id
          };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}
