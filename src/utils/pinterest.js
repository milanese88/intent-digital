/**
 * Pinterest widget utilities, URL validators, and normalizers for Designer Hub.
 *
 * Rules:
 * 1. Only official script: https://assets.pinterest.com/js/pinit.js
 * 2. Loaded once, lazily, only on Designer Hub pages.
 * 3. After React renders new embeds, call window.PinUtils.build().
 * 4. Strict URL validation for boards, board sections, and pins across all Pinterest country domains.
 */

let pinitPromise = null;

/**
 * Checks if a hostname belongs to Pinterest (including pin.it and international country domains).
 * e.g. pinterest.com, www.pinterest.com, ar.pinterest.com, es.pinterest.com,
 * pinterest.co.uk, pinterest.ca, pinterest.com.mx, pin.it, etc.
 */
export function isPinterestHost(hostname) {
  if (!hostname || typeof hostname !== 'string') return false;
  const h = hostname.trim().toLowerCase();
  if (h === 'pin.it' || h === 'www.pin.it') return true;
  return /^([a-z0-9-]+\.)*pinterest\.[a-z]{2,3}(\.[a-z]{2})?$/i.test(h);
}

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
 * Validates and parses a Pinterest board or section URL.
 * Normalizes to https://www.pinterest.com/<path>/, stripping query strings and tracking parameters.
 * Distinguishes board links (/user/board/) from board section links (/user/board/section/).
 * Rejects pin links (/pin/123/) with specific guidance.
 *
 * Returns:
 * {
 *   valid: true,
 *   isShortLink: boolean,
 *   kind: 'board' | 'section',
 *   normalizedUrl: string,
 *   user?: string,
 *   board?: string,
 *   section?: string
 * }
 * or
 * {
 *   valid: false,
 *   error: string
 * }
 */
export function validateAndParsePinterestBoardUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') {
    return { valid: false, error: 'Please enter a Pinterest board URL.' };
  }
  const trimmed = urlStr.trim();
  if (!trimmed) {
    return { valid: false, error: 'Please enter a Pinterest board URL.' };
  }

  try {
    const withProto = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withProto);
    const host = parsed.hostname.toLowerCase();

    if (!isPinterestHost(host)) {
      return {
        valid: false,
        error: 'This is not a Pinterest link. Please provide a pinterest.com or pin.it link.'
      };
    }

    // pin.it short links
    if (host === 'pin.it' || host === 'www.pin.it') {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length === 0) {
        return { valid: false, error: 'Please provide a complete pin.it link.' };
      }
      return {
        valid: true,
        isShortLink: true,
        kind: 'board',
        originalUrl: trimmed,
        normalizedUrl: `https://pin.it/${parts[0]}`
      };
    }

    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length === 0) {
      return {
        valid: false,
        error: 'This is a Pinterest homepage link, not a board. Please paste a board link.'
      };
    }

    // Single pin detection
    if (parts[0].toLowerCase() === 'pin') {
      return {
        valid: false,
        error: "This looks like a single pin — add it to a room's mood board instead."
      };
    }

    // Reserved non-user paths
    const reserved = ['pins', 'search', 'today', 'settings', 'business', 'ideas', 'explore', 'login', 'signup', 'oauth'];
    if (reserved.includes(parts[0].toLowerCase())) {
      return {
        valid: false,
        error: 'This is a Pinterest page, not a board. Please paste a board link (e.g. pinterest.com/username/board-name/).'
      };
    }

    // Single user profile
    if (parts.length === 1) {
      return {
        valid: false,
        error: 'This link is a user profile, not a board. Please paste a board link (e.g. pinterest.com/username/board-name/).'
      };
    }

    // Board link: /user/board/
    if (parts.length === 2) {
      const normalizedPath = `/${parts[0]}/${parts[1]}/`;
      return {
        valid: true,
        isShortLink: false,
        kind: 'board',
        user: parts[0],
        board: parts[1],
        normalizedUrl: `https://www.pinterest.com${normalizedPath}`
      };
    }

    // Board Section link: /user/board/section/...
    const normalizedPath = `/${parts[0]}/${parts[1]}/${parts[2]}/`;
    return {
      valid: true,
      isShortLink: false,
      kind: 'section',
      user: parts[0],
      board: parts[1],
      section: parts[2],
      normalizedUrl: `https://www.pinterest.com${normalizedPath}`
    };
  } catch {
    return {
      valid: false,
      error: 'Please enter a valid URL.'
    };
  }
}

/**
 * Returns true if the URL is a valid Pinterest board, section, or pin.it short link.
 */
export function isValidPinterestBoardUrl(urlStr) {
  return validateAndParsePinterestBoardUrl(urlStr).valid;
}

/**
 * Returns normalized board or section URL (https://www.pinterest.com/...) or null if invalid.
 */
export function normalizePinterestBoardUrl(urlStr) {
  const res = validateAndParsePinterestBoardUrl(urlStr);
  return res.valid ? res.normalizedUrl : null;
}

/**
 * Resolves a pin.it short link to its target destination URL by following HTTP redirects
 * and reading the Location header only. Accepts the result only if it is a Pinterest domain.
 * No HTML body scraping or third-party APIs.
 */
export async function resolvePinterestShortLink(urlStr) {
  let cur = (urlStr || '').trim();
  if (!cur) return null;
  if (!cur.startsWith('http://') && !cur.startsWith('https://')) {
    cur = `https://${cur}`;
  }

  for (let i = 0; i < 5; i++) {
    try {
      const parsed = new URL(cur);
      if (!isPinterestHost(parsed.hostname)) {
        return null;
      }
      // If reached full pinterest domain and not a redirector path, stop
      if (parsed.hostname.toLowerCase() !== 'pin.it' &&
          parsed.hostname.toLowerCase() !== 'www.pin.it' &&
          !parsed.pathname.includes('/url_shortener/')) {
        return cur;
      }

      const res = await fetch(cur, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IntentDigitalBot/1.0)' },
        signal: AbortSignal.timeout(6000)
      });

      const loc = res.headers.get('location');
      if (!loc) break;
      cur = new URL(loc, cur).href;
    } catch {
      break;
    }
  }

  try {
    const finalParsed = new URL(cur);
    if (isPinterestHost(finalParsed.hostname)) {
      return cur;
    }
  } catch {
    // invalid URL
  }
  return null;
}

/**
 * Derives a human-friendly title from a board or section URL slug if user didn't specify one.
 * e.g.
 * - https://ar.pinterest.com/mnflorencia/home/kitchen/ -> "Kitchen"
 * - https://www.pinterest.com/intentdigital/japandi-kitchens/ -> "Japandi Kitchens"
 */
export function deriveBoardTitleFromUrl(urlStr) {
  const result = validateAndParsePinterestBoardUrl(urlStr);
  if (result.valid) {
    const rawName = result.kind === 'section' ? result.section : result.board;
    if (rawName) {
      return rawName
        .replace(/[-_]+/g, ' ')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
  }
  return 'Inspiration Board';
}

/**
 * Validates and parses a Pinterest pin URL.
 * Accepts:
 *   - https://(any-pinterest-domain)/pin/<pin_id>/
 *   - https://pin.it/<shortcode>
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

    if (!isPinterestHost(host)) return null;

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

    return null;
  } catch {
    return null;
  }
}
