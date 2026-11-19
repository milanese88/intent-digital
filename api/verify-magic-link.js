import crypto from 'crypto';
import { getDb, isDatabaseQuotaError, isDatabaseUnavailableError } from './_lib/db.js';
import {
  createSession,
  createStatelessSession,
  getCleanEnv,
  getSessionSigningSecret
} from './_lib/session.js';
import { sanitizeAdminNextPath } from '../src/utils/authRedirect.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { token } = req.query || {};

  if (!token || typeof token !== 'string') {
    return res.redirect('/login?error=invalid_link');
  }

  const signingSecret = getSessionSigningSecret();
  if (!signingSecret) {
    console.error('Server configuration error: AUTH_SECRET (or ADMIN_PASSWORD) missing.');
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
    } catch {
      return res.redirect('/login?error=invalid_link');
    }

    if (!payload.exp || Date.now() > payload.exp) {
      return res.redirect('/login?error=expired_link');
    }

    const expectedSignature = crypto
      .createHmac('sha256', signingSecret)
      .update(payloadStr)
      .digest('base64url');

    const providedSigBuffer = Buffer.from(providedSignatureBase64, 'utf8');
    const expectedSigBuffer = Buffer.from(expectedSignature, 'utf8');

    if (
      providedSigBuffer.length !== expectedSigBuffer.length ||
      !crypto.timingSafeEqual(providedSigBuffer, expectedSigBuffer)
    ) {
      return res.redirect('/login?error=invalid_link');
    }

    const cleanEmail = String(payload.email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return res.redirect('/login?error=invalid_link');
    }

    const destination = sanitizeAdminNextPath(payload.next || req.query?.next);

    try {
      const sql = getDb();
      const users = await sql`
        SELECT id, email, username, full_name
        FROM admin_user
        WHERE lower(email) = ${cleanEmail}
        LIMIT 1
      `;

      if (users.length === 0) {
        const adminEmail = getCleanEnv('ADMIN_EMAIL').toLowerCase();
        if (adminEmail && cleanEmail === adminEmail) {
          createStatelessSession({ email: cleanEmail }, res, req);
          return res.redirect(destination);
        }
        return res.redirect('/login?error=invalid_link');
      }

      await createSession(users[0].id, res, req);
      return res.redirect(destination);
    } catch (dbError) {
      console.error('Magic link DB session fallback:', dbError?.message || dbError);
      if (isDatabaseUnavailableError(dbError)) {
        const adminEmail = getCleanEnv('ADMIN_EMAIL').toLowerCase();
        if (!adminEmail || cleanEmail === adminEmail) {
          createStatelessSession({ email: cleanEmail }, res, req);
          return res.redirect(destination);
        }
        return res.redirect(
          isDatabaseQuotaError(dbError) ? '/login?error=db_quota' : '/login?error=db_unreachable'
        );
      }
      throw dbError;
    }
  } catch (error) {
    console.error('Error verifying magic link:', error);
    return res.redirect('/login?error=invalid_link');
  }
}
