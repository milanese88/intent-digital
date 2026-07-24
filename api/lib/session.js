import crypto from 'crypto';
import { getDb } from './db.js';
import { serialize } from 'cookie';

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId, res, req) {
  const sql = getDb();
  
  // Generate a random token
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  
  // 7 day expiry
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  
  const userAgent = req.headers['user-agent'] || null;
  const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;

  await sql`
    INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip_address)
    VALUES (${userId}, ${tokenHash}, ${expiresAt}, ${userAgent}, ${ipAddress})
  `;

  const cookie = serialize('auth_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    path: '/'
  });

  res.setHeader('Set-Cookie', cookie);
  return token;
}
