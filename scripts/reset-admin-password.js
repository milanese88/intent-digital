import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function resetPassword() {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error('Usage: node scripts/reset-admin-password.js <email> <new_password>');
    process.exit(1);
  }

  const email = args[0].trim().toLowerCase();
  const newPassword = args[1];

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL is not set in your environment or .env.local.');
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  try {
    console.log(`Looking up admin_user for email: ${email}`);
    const users = await sql`SELECT id FROM admin_user WHERE email = ${email} LIMIT 1`;
    
    if (users.length === 0) {
      console.error(`Error: No admin account found for email ${email}.`);
      process.exit(1);
    }

    const userId = users[0].id;

    console.log('Hashing new password...');
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    console.log('Updating password in database...');
    await sql`
      UPDATE admin_user 
      SET password_hash = ${passwordHash}, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ${userId}
    `;

    console.log('Password successfully reset. You can now log in.');
  } catch (error) {
    console.error('Password reset failed:', error);
    process.exit(1);
  }
}

resetPassword();
