import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDb } from './lib/db.js';

// In-memory rate limiting (Note: resets on serverless cold starts)
const rateLimitMap = new Map();

const cleanupRateLimits = () => {
  const now = Date.now();
  for (const [ip, data] of rateLimitMap.entries()) {
    if (now - data.timestamp > 60 * 60 * 1000) {
      rateLimitMap.delete(ip);
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  cleanupRateLimits();

  const now = Date.now();
  const rateData = rateLimitMap.get(ip) || { count: 0, timestamp: now };
  
  if (now - rateData.timestamp > 60 * 60 * 1000) {
    rateData.count = 0;
    rateData.timestamp = now;
  }

  rateData.count++;
  rateLimitMap.set(ip, rateData);

  if (rateData.count > 3) {
    console.warn(`Rate limit exceeded for seed attempt from IP: ${ip}`);
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { secret } = req.body;
  const setupSecret = process.env.SETUP_SECRET;

  if (!setupSecret) {
    console.error(`Failed seed attempt from IP: ${ip} - SETUP_SECRET not configured on server`);
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  if (!secret || typeof secret !== 'string') {
    console.warn(`Failed seed attempt from IP: ${ip} - Missing or invalid secret payload`);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Timing safe comparison
  const providedBuffer = Buffer.from(secret, 'utf8');
  const expectedBuffer = Buffer.from(setupSecret, 'utf8');

  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    console.warn(`Failed seed attempt from IP: ${ip} - Invalid secret provided`);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log(`Valid seed request received from IP: ${ip}`);

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    return res.status(500).json({ error: 'Server misconfigured: missing ADMIN_EMAIL or ADMIN_PASSWORD' });
  }

  try {
    const sql = getDb();

    // Check if an admin already exists
    const existingAdmins = await sql`SELECT id FROM admin_user LIMIT 1`;
    
    if (existingAdmins.length > 0) {
      console.log('Seed refused: admin_user already exists');
      return res.status(409).json({ error: 'Conflict: Admin user already exists' });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(adminPassword, salt);

    // Insert the admin
    await sql`
      INSERT INTO admin_user (email, username, full_name, password_hash)
      VALUES (${adminEmail.trim().toLowerCase()}, 'admin', 'Florencia Milanese', ${passwordHash})
    `;

    console.log('Seed successful: admin_user created.');
    return res.status(200).json({ success: true, message: 'Admin seeded successfully' });
  } catch (error) {
    console.error('Database error during seed:', error);
    return res.status(500).json({ error: 'Database error' });
  }
}
