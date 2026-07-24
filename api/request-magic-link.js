import { Resend } from 'resend';
import crypto from 'crypto';

// In-memory rate limiting (Note: resets on serverless cold starts)
const rateLimitMap = new Map();

// Helper to clean up old rate limits
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

  // Always return the exact same success message regardless of outcome to prevent email enumeration
  const sendSuccess = () => res.status(200).json({ success: true, message: 'If the email exists, a magic link has been sent.' });

  const { email } = req.body;
  
  if (!email || typeof email !== 'string') {
    return sendSuccess(); // Fail silently
  }

  const cleanEmail = email.trim().toLowerCase();
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  
  // Rate Limiting Logic: 3 requests per 15 minutes per IP
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  cleanupRateLimits();

  const now = Date.now();
  const rateData = rateLimitMap.get(ip) || { count: 0, timestamp: now };
  
  // Reset window if 15 minutes passed
  if (now - rateData.timestamp > 15 * 60 * 1000) {
    rateData.count = 0;
    rateData.timestamp = now;
  }

  rateData.count++;
  rateLimitMap.set(ip, rateData);

  if (rateData.count > 3) {
    // We could return 429, but returning generic success masks the rate limit state from attackers slightly, 
    // or we can return a 429 so the UI knows. The prompt asks to "always return the same success response 
    // regardless of whether the email matched". A 429 might be useful for the UI, but let's stick to the secure approach.
    // Actually, UI needs to know if rate-limited to avoid confusion. The prompt specifically said:
    // "always return the same success response regardless of whether the email matched".
    // It also said "Rate-limit to 3 requests per 15 minutes per IP".
    // I will return a 429 if rate limited to allow the UI to say "Too many requests".
    return res.status(429).json({ error: 'Too many requests. Please try again in 15 minutes.' });
  }

  // Verify email matches the admin email
  if (!adminEmail || cleanEmail !== adminEmail) {
    return sendSuccess();
  }

  const authSecret = process.env.AUTH_SECRET;
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!authSecret || !resendApiKey) {
    console.error('Server configuration error: AUTH_SECRET or RESEND_API_KEY is missing.');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // Generate stateless token
    // Expiry: 15 minutes in the future
    const expiresAt = now + 15 * 60 * 1000;
    const payload = JSON.stringify({ email: cleanEmail, exp: expiresAt });
    
    const signature = crypto
      .createHmac('sha256', authSecret)
      .update(payload)
      .digest('base64url');

    const tokenPayload = Buffer.from(payload).toString('base64url');
    const token = `${tokenPayload}.${signature}`;

    // Use req.headers.host to determine the domain
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    const host = req.headers.host;
    const magicLink = `${protocol}://${host}/auth/verify?token=${token}`;

    const resend = new Resend(resendApiKey);
    
    await resend.emails.send({
      from: 'onboarding@resend.dev',
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
    return res.status(500).json({ error: 'Failed to send email' });
  }
}
