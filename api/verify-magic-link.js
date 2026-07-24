import crypto from 'crypto';
import { getDb } from './lib/db.js';
import { createSession } from './lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.redirect('/login?error=invalid_link');
  }

  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    console.error('Server configuration error: AUTH_SECRET missing.');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      return res.redirect('/login?error=invalid_link');
    }

    const [tokenPayloadBase64, providedSignatureBase64] = parts;
    const payloadStr = Buffer.from(tokenPayloadBase64, 'base64url').toString('utf8');
    
    let payload;
    try {
      payload = JSON.parse(payloadStr);
    } catch (e) {
      return res.redirect('/login?error=invalid_link');
    }

    // Check expiry
    if (!payload.exp || Date.now() > payload.exp) {
      return res.redirect('/login?error=expired_link');
    }

    // Recompute signature
    const expectedSignature = crypto
      .createHmac('sha256', authSecret)
      .update(payloadStr)
      .digest('base64url');

    // Timing-safe comparison
    const providedSigBuffer = Buffer.from(providedSignatureBase64, 'utf8');
    const expectedSigBuffer = Buffer.from(expectedSignature, 'utf8');

    if (providedSigBuffer.length !== expectedSigBuffer.length || !crypto.timingSafeEqual(providedSigBuffer, expectedSigBuffer)) {
      return res.redirect('/login?error=invalid_link');
    }

    // Email is valid and signature matched. Find user in DB.
    const sql = getDb();
    const cleanEmail = payload.email.trim().toLowerCase();

    const users = await sql`
      SELECT id FROM admin_user WHERE email = ${cleanEmail} LIMIT 1
    `;

    if (users.length === 0) {
      return res.redirect('/login?error=invalid_link');
    }

    const user = users[0];

    // Create a new DB-backed session
    await createSession(user.id, res, req);
    
    // Redirect to the dashboard
    return res.redirect('/dashboard');
  } catch (error) {
    console.error('Error verifying magic link:', error);
    return res.redirect('/login?error=invalid_link');
  }
}
