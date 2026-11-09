import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../../api/_lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.production.local') });

export const PROFILE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS investor_profile (
  owner_email TEXT PRIMARY KEY,
  credit_tier TEXT NOT NULL CHECK (credit_tier IN ('760+','740-759','720-739','700-719','680-699','660-679','640-659','below 640')),
  liquid_cash NUMERIC NOT NULL DEFAULT 0,
  reserve_months INT NOT NULL DEFAULT 6,
  rate_sheet JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

export async function runMigration() {
  const sql = getDb();
  console.log('Applying investor_profile migration...');
  await sql`
    CREATE TABLE IF NOT EXISTS investor_profile (
      owner_email TEXT PRIMARY KEY,
      credit_tier TEXT NOT NULL CHECK (credit_tier IN ('760+','740-759','720-739','700-719','680-699','660-679','640-659','below 640')),
      liquid_cash NUMERIC NOT NULL DEFAULT 0,
      reserve_months INT NOT NULL DEFAULT 6,
      rate_sheet JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;
  console.log('investor_profile table created successfully!');
}

if (process.argv.includes('--apply')) {
  runMigration().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
