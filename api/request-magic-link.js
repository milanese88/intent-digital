import { Resend } from 'resend';
import crypto from 'crypto';
import {
  getDb,
  NEON_QUOTA_MESSAGE,
  isDatabaseQuotaError,
  isDatabaseUnavailableError
} from './_lib/db.js';
import { getCleanEnv, getSessionSigningSecret } from './_lib/session.js';
import { sanitizeAdminNextPath } from '../src/utils/authRedirect.js';

// In-memory rate limiting (Note: resets on serverless cold starts)
const rateLimitMap = new Map();

const cleanupRateLimits = () => {
  const now = Date.now();
  for (const [ip, data] of rateLimitMap.entries()) {
    if (now - data.timestamp > 15 * 60 * 1000) {
      rateLimitMap.delete(ip);
    }
  }
};

function parseBody(req) {
  if (!req?.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Always return the exact same success message regardless of email match to prevent enumeration
  const sendSuccess = () =>
    res.status(200).json({
      success: true,
      message: 'If the email exists, a magic link has been sent.'
    });

  const { email, next: rawNext } = parseBody(req);
  const safeNext = sanitizeAdminNextPath(rawNext);

  if (!email || typeof email !== 'string') {
    return sendSuccess();
  }

  const cleanEmail = email.trim().toLowerCase();
  const adminEmail = getCleanEnv('ADMIN_EMAIL').toLowerCase();

  // Rate Limiting Logic: 3 requests per 15 minutes per IP
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  cleanupRateLimits();

  const now = Date.now();
  const rateData = rateLimitMap.get(ip) || { count: 0, timestamp: now };

  if (now - rateData.timestamp > 15 * 60 * 1000) {
    rateData.count = 0;
    rateData.timestamp = now;
  }

  rateData.count++;
  rateLimitMap.set(ip, rateData);

  if (rateData.count > 3) {
    return res.status(429).json({ error: 'Too many requests. Please try again in 15 minutes.' });
  }

  const signingSecret = getSessionSigningSecret();
  const resendApiKey = getCleanEnv('RESEND_API_KEY');

  if (!signingSecret || !resendApiKey) {
    console.error('Server configuration error: AUTH_SECRET (or ADMIN_PASSWORD) or RESEND_API_KEY is missing.');
    return res.status(500).json({
      error: 'Magic-link email is not configured on this server. Please sign in with your password instead.'
    });
  }

  // Verify email matches owner (via ADMIN_EMAIL env first, or DB fallback when ADMIN_EMAIL is unset)
  let emailAllowed = false;
  if (adminEmail) {
    emailAllowed = cleanEmail === adminEmail;
  } else {
    try {
      const sql = getDb();
      const users = await sql`SELECT id FROM admin_user WHERE lower(email) = ${cleanEmail} LIMIT 1`;
      emailAllowed = users.length > 0;
    } catch (dbErr) {
      console.error('DB check failed in request-magic-link:', dbErr?.message || dbErr);
      if (isDatabaseQuotaError(dbErr)) {
        return res.status(503).json({ error: NEON_QUOTA_MESSAGE, databaseQuotaExceeded: true });
      }
      if (isDatabaseUnavailableError(dbErr)) {
        return res.status(503).json({
          error: 'Database is temporarily unreachable. Please check your Neon database status and try again.'
        });
      }
      return res.status(500).json({ error: 'Unable to verify account right now.' });
    }
  }

  if (!emailAllowed) {
    return sendSuccess();
  }

  try {
    const expiresAt = now + 15 * 60 * 1000;
    const payload = JSON.stringify({ email: cleanEmail, exp: expiresAt, next: safeNext });

    const signature = crypto
      .createHmac('sha256', signingSecret)
      .update(payload)
      .digest('base64url');

    const tokenPayload = Buffer.from(payload).toString('base64url');
    const token = `${tokenPayload}.${signature}`;

    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const protocol = forwardedProto || (/^(localhost|127\.0\.0\.1)(:|$)/i.test(host) ? 'http' : 'https');
    const magicLink = `${protocol}://${host}/auth/verify?token=${encodeURIComponent(token)}`;

    const resend = new Resend(resendApiKey);
    const fromAddress = getCleanEnv('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';

    await resend.emails.send({
      from: fromAddress,
      to: cleanEmail,
      subject: 'Your Secure Login Link',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; text-align: center;">
          <h2 style="color: #34292A;">Owner Portal Login</h2>
          <p style="color: #666; font-size: 16px;">Click the button below to securely log in to your dashboard.</p>
          <a href="${magicLink}" style="display: inline-block; background-color: #34292A; color: #FAF8F5; padding: 14px 28px; text-decoration: none; border-radius: 50px; font-weight: 600; margin: 24px 0;">Sign In</a>
          <p style="color: #999; font-size: 14px;">This link expires in 15 minutes and can only be used once.</p>
        </div>
      `
    });

    return sendSuccess();
  } catch (error) {
    console.error('Error sending magic link:', error);
    return res.status(500).json({ error: 'Failed to send email.' });
  }
}
