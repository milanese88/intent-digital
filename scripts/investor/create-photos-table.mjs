import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../../api/_lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.production.local') });

export const PHOTOS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS investor_property_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES investor_properties(id) ON DELETE CASCADE,
  owner_email TEXT NOT NULL,
  blob_url TEXT NOT NULL,
  caption TEXT,
  sort_order INT DEFAULT 0,
  is_cover BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_investor_property_photos_prop ON investor_property_photos (property_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_investor_property_photos_owner ON investor_property_photos (owner_email);
`;

export async function runMigration() {
  const sql = getDb();
  console.log('Applying investor_property_photos migration...');
  await sql.unsafe(PHOTOS_TABLE_SQL);
  console.log('investor_property_photos table created successfully!');
}

if (process.argv.includes('--apply')) {
  runMigration().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
