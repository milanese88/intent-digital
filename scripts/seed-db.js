import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL is not set.');
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  try {
    console.log('Creating tables...');
    
    // Create admin_user table
    await sql`
      CREATE TABLE IF NOT EXISTS admin_user (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(255),
        full_name VARCHAR(255),
        profile_image_url TEXT,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create sessions table
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES admin_user(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        user_agent TEXT,
        ip_address VARCHAR(45)
      )
    `;

    console.log('Checking for existing admin user...');
    const existingUsers = await sql`SELECT id FROM admin_user LIMIT 1`;
    
    if (existingUsers.length > 0) {
      console.log('Admin user already exists. Seed is not needed.');
      process.exit(0);
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      console.error('WARNING: ADMIN_EMAIL or ADMIN_PASSWORD not found in environment.');
      console.error('The seed script requires these variables to create the initial admin user.');
      process.exit(1);
    }

    console.log('Hashing password...');
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(adminPassword, salt);

    console.log('Creating admin user...');
    await sql`
      INSERT INTO admin_user (email, username, full_name, password_hash)
      VALUES (${adminEmail.toLowerCase().trim()}, 'admin', 'Florencia Milanese', ${passwordHash})
    `;

    console.log('Database seeded successfully!');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

seed();
