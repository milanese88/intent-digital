import crypto from 'crypto';
import { getDb, formatSafeDbError } from './db.js';
import cookie from 'cookie';
const { parse, serialize } = cookie;

const STATELESS_PREFIX = 'st1';
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
const SEVEN_DAYS_MS = SEVEN_DAYS_SECONDS * 1000;
const DEFAULT_OWNER_ID = 'a145b049-c360-4664-99c6-f029ce1b83b3';

export function getCleanEnv(key) {
  const val = process.env[key];
  if (!val || typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (!trimmed || trimmed === '[SENSITIVE]') return '';
  return trimmed;
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sha256Buffer(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest();
}

/**
 * Returns a strong HMAC signing secret from AUTH_SECRET, or derived via scrypt
 * from ADMIN_EMAIL + ADMIN_PASSWORD when AUTH_SECRET is not set.
 */
export function getSessionSigningSecret() {
  const authSecret = getCleanEnv('AUTH_SECRET');
  if (authSecret.length >= 16) {
    return authSecret;
  }
  const adminEmail = getCleanEnv('ADMIN_EMAIL').toLowerCase();
  const adminPassword = getCleanEnv('ADMIN_PASSWORD');
  if (adminEmail && adminPassword) {
    return crypto
      .scryptSync(adminPassword, `intent-digital-owner-session:${adminEmail}`, 32)
      .toString('hex');
  }
  return null;
}

/**
 * Timing-safe verification against ADMIN_EMAIL + ADMIN_PASSWORD environment variables.
 */
export function verifyOwnerEnvCredentials(email, password) {
  const envEmail = getCleanEnv('ADMIN_EMAIL').toLowerCase();
  const envPassword = getCleanEnv('ADMIN_PASSWORD');

  if (!envEmail || !envPassword) {
    return { configured: false, valid: false, email: null };
  }

  if (typeof email !== 'string' || typeof password !== 'string') {
    return { configured: true, valid: false, email: null };
  }

  const cleanEmail = email.trim().toLowerCase();
  const emailMatch = crypto.timingSafeEqual(
    sha256Buffer(cleanEmail),
    sha256Buffer(envEmail)
  );
  const passwordMatch = crypto.timingSafeEqual(
    sha256Buffer(password),
    sha256Buffer(envPassword)
  );

  return {
    configured: true,
    valid: emailMatch && passwordMatch,
    email: emailMatch && passwordMatch ? cleanEmail : null
  };
}

export function isSecureRequest(req) {
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '');
  if (/^(localhost|127\.0\.0\.1)(:|$)/i.test(host)) {
    return false;
  }
  const proto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  if (proto === 'https') return true;
  return process.env.NODE_ENV === 'production';
}

function setSessionCookie(token, res, req) {
  // Host-only cookie (no Domain attribute) so both Vercel Preview (*.vercel.app) and Production work cleanly
  const serialized = serialize('auth_session', token, {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: 'lax',
    maxAge: SEVEN_DAYS_SECONDS,
    path: '/'
  });
  res.setHeader('Set-Cookie', serialized);
}

/**
 * Issues a cryptographically signed HMAC session cookie when the database is unavailable
 * (e.g. database quota suspension or network maintenance) after owner credentials or magic link are verified.
 */
export function createStatelessSession(userInfo, res, req) {
  const secret = getSessionSigningSecret();
  if (!secret) {
    throw new Error('Cannot create stateless session: signing secret not configured');
  }

  const email = String(userInfo?.email || getCleanEnv('ADMIN_EMAIL')).trim().toLowerCase();
  const payload = JSON.stringify({
    sub: userInfo?.id || DEFAULT_OWNER_ID,
    email,
    username: userInfo?.username || '@florencianuñez',
    full_name: userInfo?.full_name || 'Florencia Nuñez',
    iat: Date.now(),
    exp: Date.now() + SEVEN_DAYS_MS
  });

  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sigB64 = crypto
    .createHmac('sha256', secret)
    .update(`${STATELESS_PREFIX}.${payloadB64}`)
    .digest('base64url');

  const token = `${STATELESS_PREFIX}.${payloadB64}.${sigB64}`;
  setSessionCookie(token, res, req);
  return token;
}

export function verifyStatelessSessionToken(token) {
  if (!token || typeof token !== 'string' || !token.startsWith(`${STATELESS_PREFIX}.`)) {
    return null;
  }

  const secret = getSessionSigningSecret();
  if (!secret) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [prefix, payloadB64, providedSig] = parts;
  if (prefix !== STATELESS_PREFIX || !payloadB64 || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${STATELESS_PREFIX}.${payloadB64}`)
    .digest('base64url');

  const providedBuf = Buffer.from(providedSig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload?.email || !payload?.exp || Date.now() > payload.exp) {
      return null;
    }

    const envEmail = getCleanEnv('ADMIN_EMAIL').toLowerCase();
    if (envEmail && payload.email.toLowerCase() !== envEmail) {
      return null;
    }

    return {
      id: payload.sub || DEFAULT_OWNER_ID,
      email: payload.email.toLowerCase(),
      username: payload.username || '@florencianuñez',
      full_name: payload.full_name || 'Florencia Nuñez',
      profile_image_url: null
    };
  } catch {
    return null;
  }
}

export async function createSession(userId, res, req) {
  const sql = getDb();

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);

  const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS);

  const userAgent = req.headers['user-agent'] || null;
  const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;

  await sql`
    INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip_address)
    VALUES (${userId}, ${tokenHash}, ${expiresAt}, ${userAgent}, ${ipAddress})
  `;

  setSessionCookie(token, res, req);
  return token;
}

export async function getUserFromSession(req) {
  if (req && req._user) return req._user;
  const cookies = parse(req?.headers?.cookie || '');
  const sessionToken = cookies.auth_session;

  if (!sessionToken) return null;

  if (sessionToken.startsWith(`${STATELESS_PREFIX}.`)) {
    return verifyStatelessSessionToken(sessionToken);
  }

  try {
    const sql = getDb();
    const tokenHash = hashToken(sessionToken);

    const sessions = await sql`
      SELECT user_id, expires_at FROM sessions WHERE token_hash = ${tokenHash} LIMIT 1
    `;

    if (sessions.length === 0) return null;
    if (new Date(sessions[0].expires_at) < new Date()) return null;

    const users = await sql`
      SELECT id, email, username, full_name, profile_image_url, password_hash
      FROM admin_user 
      WHERE id = ${sessions[0].user_id} 
      LIMIT 1
    `;

    if (users.length === 0) return null;

    return users[0];
  } catch (e) {
    const diag = formatSafeDbError(e);
    console.error(
      `[DB Session Error] code=${diag.code} source=${diag.source} message="${diag.message}"`
    );
    return null;
  }
}
