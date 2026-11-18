import crypto from 'crypto';
import { getDb } from './db.js';
import cookie from 'cookie';
const { parse, serialize } = cookie;

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
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

export async function createSession(userId, res, req) {
  const sql = getDb();
  
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  
  const userAgent = req.headers['user-agent'] || null;
  const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;

  await sql`
    INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip_address)
    VALUES (${userId}, ${tokenHash}, ${expiresAt}, ${userAgent}, ${ipAddress})
  `;

  // Host-only cookie (no Domain attribute) so both Vercel Preview (*.vercel.app) and Production work cleanly
  const cookie = serialize('auth_session', token, {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/'
  });

  res.setHeader('Set-Cookie', cookie);
  return token;
}

export async function getUserFromSession(req) {
  if (req && req._user) return req._user;
  const cookies = parse(req?.headers?.cookie || '');
  const sessionToken = cookies.auth_session;

  if (!sessionToken) return null;

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
    console.error('Error getting user from session', e);
    return null;
  }
}
