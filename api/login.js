import bcrypt from 'bcryptjs';
import { getDb } from './lib/db.js';
import { createSession } from './lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const sql = getDb();
    
    // Find the user by email
    const users = await sql`
      SELECT id, password_hash FROM admin_user WHERE email = ${email.trim().toLowerCase()} LIMIT 1
    `;

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = users[0];

    // Compare password
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Create a new session
    await createSession(user.id, res, req);
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Server error during login' });
  }
}
