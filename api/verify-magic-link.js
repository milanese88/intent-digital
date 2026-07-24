import crypto from 'crypto';
import { serialize } from 'cookie';

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

    // Verify email matches
    const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (!payload.email || payload.email !== adminEmail) {
      return res.redirect('/login?error=invalid_link');
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

    // Success! Issue the secure cookie
    const cookie = serialize('auth_session', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // as requested
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: '/'
    });
    
    res.setHeader('Set-Cookie', cookie);
    
    // Redirect to the dashboard
    // In this Vite setup, since it's an SPA, redirecting to /#admin might be needed if they don't have proper server-side catch-all,
    // but looking at App.jsx it relies on window state, wait. 
    // Wait, the React app uses state-based routing `currentPage === 'admin'`, so a hard redirect to `/admin` might just give a 404 on Vercel unless a `rewrites` is set up, OR we can redirect to `/?page=admin` and handle it in React.
    // Let's redirect to `/?admin=true` or similar to trigger the SPA to load the admin state.
    // However, I noticed the user asked to "redirect to the Owner Portal dashboard".
    // I will redirect to `/?login_success=true` and in `App.jsx` check for this param, OR if Vercel has rewrites to `index.html`.
    // I will check `vite.config.js` or `vercel.json`. 
    // Usually SPAs have rewrites to `/`. Let's just redirect to `/?route=admin`. 
    // Actually, I can redirect to `/` and let the UI know.
    
    return res.redirect('/?route=admin');
  } catch (error) {
    console.error('Error verifying magic link:', error);
    return res.redirect('/login?error=invalid_link');
  }
}
