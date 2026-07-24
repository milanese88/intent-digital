import { getUserFromSession } from './_lib/session.js';
import { getDb } from './_lib/db.js';
import bcrypt from 'bcryptjs';
import cookie from 'cookie';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const user = await getUserFromSession(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword || newPassword.length < 10) {
    return res.status(400).json({ error: 'Invalid password format' });
  }

  const sql = getDb();

  try {
    // 1. Fetch user's current password hash
    const users = await sql`SELECT password_hash FROM admin_user WHERE id = ${user.id} LIMIT 1`;
    if (users.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    const currentHash = users[0].password_hash;

    // 2. Verify current password
    const isValid = await bcrypt.compare(currentPassword, currentHash);
    if (!isValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // 3. Hash the new password with bcryptjs at cost 10
    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    // 4. Update admin_user.password_hash and set updated_at
    await sql`
      UPDATE admin_user 
      SET password_hash = ${newHash}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${user.id}
    `;

    // 5. Delete all sessions for that user EXCEPT the current one
    const cookies = cookie.parse(req.headers.cookie || '');
    const sessionToken = cookies.auth_session;
    
    if (sessionToken) {
      const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
      
      await sql`
        DELETE FROM sessions 
        WHERE user_id = ${user.id} AND token_hash != ${tokenHash}
      `;
    } else {
      await sql`DELETE FROM sessions WHERE user_id = ${user.id}`;
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error in change-password:', error);
    return res.status(500).json({ error: 'Server error updating password' });
  }
}
