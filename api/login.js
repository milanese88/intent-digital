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
    
    // 1. Check if DB is reachable and if table exists
    let tableExists = false;
    try {
      const check = await sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'admin_user'
        ) as exists
      `;
      tableExists = check[0].exists;
    } catch (e) {
      return res.status(503).json({ error: 'Database unreachable' });
    }

    if (!tableExists) {
      return res.status(500).json({ error: 'No admin account seeded yet' });
    }

    // 2. Check if admin account exists
    const usersCount = await sql`SELECT count(*) FROM admin_user`;
    if (parseInt(usersCount[0].count) === 0) {
      return res.status(500).json({ error: 'No admin account seeded yet' });
    }
    
    // 3. Find the user by email
    const users = await sql`
      SELECT id, password_hash FROM admin_user WHERE email = ${email.trim().toLowerCase()} LIMIT 1
    `;

    if (users.length === 0) {
      return res.status(401).json({ error: 'Email not found' });
    }

    const user = users[0];

    // 4. Compare password
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Wrong password' });
    }

    // Create a new session
    await createSession(user.id, res, req);
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Login error:', error);
    // If it reaches here, it might be a DB timeout or other issue
    if (error.message?.includes('connect') || error.code === 'ECONNREFUSED' || error.message?.includes('fetch')) {
      return res.status(503).json({ error: 'Database unreachable' });
    }
    return res.status(500).json({ error: 'Server error during login' });
  }
}
