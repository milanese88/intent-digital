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
  const migrationPath = path.resolve(__dirname, '../../migrations/add_stage3_budget_columns.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  console.log('Applying additive migration: add Stage 3 budget columns to design_items and investor_properties...');
  await sql.query(migrationSql);
  console.log('Stage 3 budget migration completed successfully!');
}

if (process.argv.includes('--apply')) {
  runMigration().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
} else {
  console.log('Dry run: add --apply to execute this migration.');
}
