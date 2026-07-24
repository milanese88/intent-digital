import crypto from 'crypto';
import { getDb } from './_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { secret } = req.query;
  const setupSecret = process.env.SETUP_SECRET;

  if (!setupSecret) {
    return res.status(500).json({ error: 'Server misconfigured: SETUP_SECRET not set' });
  }

  if (!secret || typeof secret !== 'string') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Timing safe comparison
  const providedBuffer = Buffer.from(secret, 'utf8');
  const expectedBuffer = Buffer.from(setupSecret, 'utf8');

  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Generate status object (booleans only)
  const status = {
    env: {
      DATABASE_URL: !!process.env.DATABASE_URL,
      ADMIN_EMAIL: !!process.env.ADMIN_EMAIL,
      ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
      AUTH_SECRET: !!process.env.AUTH_SECRET,
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      SETUP_SECRET: !!process.env.SETUP_SECRET
    },
    db_reachable: false,
    migrations_run: false,
    admin_account_seeded: false
  };

  if (status.env.DATABASE_URL) {
    try {
      const sql = getDb();
      
      // Test connection and check if table exists
      const tableCheck = await sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'admin_user'
        ) as exists
      `;
      
      status.db_reachable = true;
      status.migrations_run = tableCheck[0].exists;

      if (status.migrations_run) {
        // Check if admin is seeded
        const adminCheck = await sql`SELECT id FROM admin_user LIMIT 1`;
        status.admin_account_seeded = adminCheck.length > 0;
      }
    } catch (error) {
      status.db_reachable = false;
      console.error('Diagnostic DB Error:', error);
    }
  }

  return res.status(200).json(status);
}
