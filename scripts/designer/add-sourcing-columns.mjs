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
  const migrationPath = path.resolve(__dirname, '../../migrations/add_stage4_sourcing_columns.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  console.log('Applying additive migration: Stage 4 Sourcing Library columns...');
  const statements = migrationSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    console.log(`[${i + 1}/${statements.length}] Executing:\n${stmt}\n`);
    await sql.query(stmt);
  }
  console.log('Stage 4 sourcing migration completed successfully!');
}

if (process.argv.includes('--apply')) {
  runMigration().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
} else {
  console.log('Dry run: add --apply to execute this migration.');
}
