import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDb } from '../../api/_lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.production.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export async function runMigration() {
  const sql = getDb();
  const migrationPath = path.resolve(__dirname, '../../migrations/add_size_to_design_room_images.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  console.log('Applying additive migration: add size column to design_room_images...');
  await sql.query(migrationSql);
  console.log('Migration completed successfully!');
}

if (process.argv.includes('--apply')) {
  runMigration().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
