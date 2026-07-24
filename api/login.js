import { serialize } from 'cookie';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { email, password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminEmail = process.env.ADMIN_EMAIL || 'mn.florenciaok@gmail.com';

  if (!adminPassword) {
    return res.status(500).json({ error: 'Server configuration error: ADMIN_PASSWORD not set.' });
  }

  if (password === adminPassword && email.toLowerCase() === adminEmail.toLowerCase()) {
    // Set a secure HttpOnly cookie
    const cookie = serialize('auth_session', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: '/'
    });
    
    res.setHeader('Set-Cookie', cookie);
    return res.status(200).json({ success: true });
  } else {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
}
