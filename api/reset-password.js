import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDb } from './_lib/db.js';
import { createSession } from './_lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { token, newPassword } = req.body || {};

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid reset token.' });
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 10) {
    return res.status(400).json({ error: 'Password must be at least 10 characters long.' });
  }

  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    console.error('Server configuration error: AUTH_SECRET missing.');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      return res.status(400).json({ error: 'Invalid reset token format.' });
    }

    const [tokenPayloadBase64, providedSignatureBase64] = parts;
    const payloadStr = Buffer.from(tokenPayloadBase64, 'base64url').toString('utf8');

    let payload;
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      return res.status(400).json({ error: 'Corrupt reset token payload.' });
    }

    // Verify token type
    if (payload.type !== 'reset_password') {
      return res.status(400).json({ error: 'Invalid token type for password reset.' });
    }

    // Verify token expiry
    if (!payload.exp || Date.now() > payload.exp) {
      return res.status(400).json({ error: 'This password reset link has expired. Please request a new one.' });
    }

    // Timing-safe HMAC check
    const expectedSignature = crypto
      .createHmac('sha256', authSecret)
      .update(payloadStr)
      .digest('base64url');

    const providedSigBuffer = Buffer.from(providedSignatureBase64, 'utf8');
    const expectedSigBuffer = Buffer.from(expectedSignature, 'utf8');

    if (
      providedSigBuffer.length !== expectedSigBuffer.length ||
      !crypto.timingSafeEqual(providedSigBuffer, expectedSigBuffer)
    ) {
      return res.status(400).json({ error: 'Invalid or forged reset token.' });
    }

    const cleanEmail = payload.email.trim().toLowerCase();
    const sql = getDb();

    // Find user in DB
    const users = await sql`
      SELECT id, email FROM admin_user WHERE email = ${cleanEmail} LIMIT 1
    `;

    if (users.length === 0) {
      return res.status(404).json({ error: 'No admin user found with this email.' });
    }

    const user = users[0];

    // Hash the new password with bcrypt
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Update password in DB
    await sql`
      UPDATE admin_user
      SET password_hash = ${passwordHash}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${user.id}
    `;

    // Invalidate existing sessions
    await sql`DELETE FROM sessions WHERE user_id = ${user.id}`;

    // Automatically create a new authenticated session cookie so user is logged in
    await createSession(user.id, res, req);

    return res.status(200).json({
      success: true,
      message: 'Your password has been successfully updated.'
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    return res.status(500).json({ error: 'Server error while resetting password.' });
  }
}
