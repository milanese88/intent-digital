import cookie from 'cookie';
const { parse, serialize } = cookie;
import { getDb } from './_lib/db.js';
import { hashToken } from './_lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const cookies = parse(req.headers.cookie || '');
  const sessionToken = cookies.auth_session;

  if (sessionToken) {
    try {
      const sql = getDb();
      const tokenHash = hashToken(sessionToken);
      
      // Delete session from DB
      await sql`DELETE FROM sessions WHERE token_hash = ${tokenHash}`;
    } catch (e) {
      console.error('Error deleting session on logout', e);
    }
  }

  // Clear cookie
  const cookie = serialize('auth_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: -1,
    path: '/'
  });

  res.setHeader('Set-Cookie', cookie);
  return res.status(200).json({ success: true });
}
