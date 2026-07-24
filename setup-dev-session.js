import { getDb } from './api/_lib/db.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  try {
    const sql = getDb();
    const users = await sql`SELECT id FROM admin_user LIMIT 1`;
    if (users.length > 0) {
      const userId = users[0].id;
      const token = 'dev_test_token_123';
      const crypto = await import('crypto');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
      await sql`
        INSERT INTO sessions (user_id, token_hash, expires_at)
        VALUES (${userId}, ${tokenHash}, ${expiresAt})
        ON CONFLICT (token_hash) DO NOTHING
      `;
      console.log('Session injected. Use cookie: auth_session=' + token);
    } else {
      console.log('No admin users found.');
    }
  } catch (err) {
    console.error(err);
  }
}
run();
