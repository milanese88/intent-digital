import { getUserFromSession } from './_lib/session.js';
import { getDb } from './_lib/db.js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const user = await getUserFromSession(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { type, data } = req.body;
  const sql = getDb();

  try {
    if (type === 'profile') {
      const { username, full_name, email } = data;
      
      // Basic validation
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      await sql`
        UPDATE admin_user 
        SET username = ${username}, full_name = ${full_name}, email = ${email.trim().toLowerCase()}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${user.id}
      `;
      
      return res.status(200).json({ success: true });
    } 
    
    else if (type === 'password') {
      const { currentPassword, newPassword } = data;
      
      if (!currentPassword || !newPassword || newPassword.length < 10) {
        return res.status(400).json({ error: 'Invalid password format' });
      }

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValid) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(12);
      const newHash = await bcrypt.hash(newPassword, salt);

      // Update password
      await sql`
        UPDATE admin_user 
        SET password_hash = ${newHash}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${user.id}
      `;

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid update type' });
  } catch (error) {
    console.error('Error updating settings:', error);
    
    // Check if it's a unique constraint violation for email
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email is already in use by another account' });
    }
    
    return res.status(500).json({ error: 'Server error updating settings' });
  }
}
