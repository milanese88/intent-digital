import { getDb, sendSafeApiError } from './_lib/db.js';

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 5;
const rateLimitMap = new Map();

const DEFAULT_CONSENT_TEXT =
  'By subscribing, you agree to receive occasional email notes from Florencia Nuñez. Unsubscribe anytime.';

export function validateNewsletterEmail(rawEmail) {
  if (typeof rawEmail !== 'string') {
    return { valid: false, email: '', error: 'Please enter a valid email address.' };
  }
  const cleaned = rawEmail.trim().toLowerCase();
  if (!cleaned) {
    return { valid: false, email: '', error: 'Please enter your email address.' };
  }
  if (cleaned.length > 254) {
    return { valid: false, email: '', error: 'Email address is too long.' };
  }
  // Standard strict practical email check (no spaces, domain + TLD >= 2 chars)
  const emailRegex = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
  if (!emailRegex.test(cleaned)) {
    return { valid: false, email: '', error: 'Please enter a valid email address.' };
  }
  return { valid: true, email: cleaned, error: null };
}

export function checkNewsletterRateLimit(ipKey, now = Date.now(), store = rateLimitMap) {
  for (const [key, entry] of store.entries()) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      store.delete(key);
    }
  }

  const key = String(ipKey || 'unknown');
  const existing = store.get(key);

  if (!existing || now - existing.windowStart > RATE_LIMIT_WINDOW_MS) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  existing.count += 1;
  store.set(key, existing);

  if (existing.count > RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - existing.count };
}

export function resetNewsletterRateLimitForTests() {
  rateLimitMap.clear();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // Honeypot trap: bots that fill hidden "website" / "company_website" fields get a silent 200
  const honeypot = body.company_website ?? body.website ?? '';
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    return res.status(200).json({
      ok: true,
      message: 'You’re on the list. Thank you for reading along.'
    });
  }

  const forwarded = req.headers?.['x-forwarded-for'];
  const clientIp = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : req.socket?.remoteAddress || 'unknown';

  const rate = checkNewsletterRateLimit(clientIp);
  if (!rate.allowed) {
    return res.status(429).json({
      error: 'Too many signup attempts. Please wait a few minutes and try again.'
    });
  }

  const emailCheck = validateNewsletterEmail(body.email);
  if (!emailCheck.valid) {
    return res.status(400).json({ error: emailCheck.error });
  }

  const rawConsent = typeof body.consent_text === 'string' ? body.consent_text.trim() : '';
  const consentText = rawConsent.slice(0, 500) || DEFAULT_CONSENT_TEXT;

  try {
    const sql = getDb();
    await sql`
      INSERT INTO newsletter_subscribers (
        email,
        consent_text
      )
      VALUES (
        ${emailCheck.email},
        ${consentText}
      )
      ON CONFLICT (email) DO UPDATE
      SET consent_text = EXCLUDED.consent_text,
          unsubscribed_at = NULL;
    `;

    return res.status(200).json({
      ok: true,
      message: 'You’re on the list. Thank you for reading along.'
    });
  } catch (err) {
    return sendSafeApiError(
      res,
      err,
      'POST /api/newsletter error',
      'Unable to save your subscription right now. Please try again shortly.'
    );
  }
}

