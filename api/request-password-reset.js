import { Resend } from 'resend';
import crypto from 'crypto';
import { getDb } from './_lib/db.js';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Always return generic success to prevent email enumeration
  const sendSuccess = () => res.status(200).json({ 
    success: true, 
    message: 'If an account exists with this email, a password reset link has been sent.' 
  });

  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return sendSuccess();
  }

  const cleanEmail = email.trim().toLowerCase();

  // Rate Limiting Logic: 5 requests per 15 minutes per IP
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

  if (rateData.count > 5) {
    return res.status(429).json({ error: 'Too many requests. Please try again in 15 minutes.' });
  }

  const authSecret = process.env.AUTH_SECRET;
  const resendApiKey = process.env.RESEND_API_KEY;
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

  if (!authSecret || !resendApiKey) {
    console.error('Server configuration error: AUTH_SECRET or RESEND_API_KEY is missing.');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Verify email matches admin
  let userExists = false;
  if (adminEmail && cleanEmail === adminEmail) {
    userExists = true;
  } else {
    try {
      const sql = getDb();
      const users = await sql`SELECT id FROM admin_user WHERE email = ${cleanEmail} LIMIT 1`;
      if (users.length > 0) {
        userExists = true;
      }
    } catch (e) {
      console.warn('DB check in request-password-reset:', e.message);
    }
  }

  if (!userExists) {
    return sendSuccess();
  }

  try {
    const expiresAt = now + 15 * 60 * 1000;
    const payload = JSON.stringify({ email: cleanEmail, exp: expiresAt, type: 'reset_password' });

    const signature = crypto
      .createHmac('sha256', authSecret)
      .update(payload)
      .digest('base64url');

    const tokenPayload = Buffer.from(payload).toString('base64url');
    const token = `${tokenPayload}.${signature}`;

    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    const host = req.headers.host;
    const resetUrl = `${protocol}://${host}/?route=reset-password&token=${token}`;

    const resend = new Resend(resendApiKey);
    const fromAddress = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    await resend.emails.send({
      from: fromAddress,
      to: cleanEmail,
      subject: 'Reset your Intent Digital password',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 40px 20px; background-color: #FAF8F5; color: #34292A; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-family: Georgia, serif; font-size: 26px; font-weight: 400; letter-spacing: -0.01em; margin: 0 0 8px 0; color: #34292A;">
              Intent Digital Studio
            </h1>
            <p style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(52, 41, 42, 0.6); margin: 0;">
              Owner Portal • Password Reset
            </p>
          </div>

          <div style="background-color: #FFFFFF; padding: 36px 32px; border-radius: 10px; border: 1px solid rgba(52, 41, 42, 0.08); text-align: center;">
            <p style="font-size: 16px; line-height: 1.6; color: #34292A; margin: 0 0 24px 0;">
              We received a request to reset your password for your Intent Digital owner account. Click the button below to choose a new password:
            </p>

            <a href="${resetUrl}" style="display: inline-block; background-color: #34292A; color: #FAF8F5; padding: 14px 36px; text-decoration: none; border-radius: 50px; font-size: 14px; font-weight: 600; letter-spacing: 0.04em; margin: 8px 0 24px 0; box-shadow: 0 2px 8px rgba(52, 41, 42, 0.15);">
              Reset My Password
            </a>

            <p style="font-size: 13px; line-height: 1.5; color: rgba(52, 41, 42, 0.6); margin: 16px 0 0 0;">
              This link is valid for <strong>15 minutes</strong> and can only be used once. If you didn't request a password reset, you can safely ignore this email.
            </p>
          </div>

          <div style="text-align: center; margin-top: 24px;">
            <p style="font-size: 11px; color: rgba(52, 41, 42, 0.4); margin: 0;">
              © ${new Date().getFullYear()} Intent Digital Studio. All rights reserved.
            </p>
          </div>
        </div>
      `
    });

    return sendSuccess();
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return res.status(500).json({ error: 'Failed to send password reset email' });
  }
}
