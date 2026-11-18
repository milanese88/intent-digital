/**
 * Shared Authentication Redirect Helpers
 *
 * Enforces strict internal `/admin` redirect allowlisting so:
 * - Post-login always lands on `/admin` by default.
 * - Deep links like `/admin?tab=investor` or `/admin/investor/report/<id>` survive
 *   the login round-trip via `?next=`.
 * - External URLs, protocol-relative URLs (`//...`), public pages (`/news`, `/dashboard`),
 *   and prefix spoofs (`/admin-foo`) are rejected back to `/admin`.
 */

export const DEFAULT_POST_LOGIN_PATH = '/admin';

export function isAllowedAdminPath(candidate) {
  if (typeof candidate !== 'string') return false;
  const trimmed = candidate.trim();
  if (!trimmed.startsWith('/admin')) return false;
  if (trimmed.startsWith('//') || trimmed.includes('\\')) return false;
  // Control characters check
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return false;
  // Must be exactly `/admin`, `/admin/...`, `/admin?...`, or `/admin#...`
  return /^\/admin(?:$|[/?#])/.test(trimmed);
}

export function sanitizeAdminNextPath(rawNext) {
  if (isAllowedAdminPath(rawNext)) {
    return rawNext.trim();
  }
  return DEFAULT_POST_LOGIN_PATH;
}

export function extractValidatedAdminNext(searchStr = '') {
  if (!searchStr) return null;
  const params = new URLSearchParams(searchStr.startsWith('?') ? searchStr : `?${searchStr}`);
  const candidate = params.get('next') || params.get('redirect') || '';
  return isAllowedAdminPath(candidate) ? candidate.trim() : null;
}

export function resolvePostLoginDestination(searchStr = '') {
  return extractValidatedAdminNext(searchStr) || DEFAULT_POST_LOGIN_PATH;
}

export function buildLoginPath(nextCandidate = '') {
  if (isAllowedAdminPath(nextCandidate)) {
    const clean = nextCandidate.trim();
    if (clean !== DEFAULT_POST_LOGIN_PATH) {
      return `/login?next=${encodeURIComponent(clean)}`;
    }
  }
  return '/login';
}

