import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDb } from '../../api/_lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.production.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function run() {
  const sql = getDb();
  const sqlPath = path.resolve(__dirname, '../../migrations/learning_progress_table.sql');
  const fileContent = fs.readFileSync(sqlPath, 'utf8');

  // Strip comments and split statements
  const statements = fileContent
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  console.log(`Applying ${statements.length} migration statements for learning_progress...`);

  for (const stmt of statements) {
    try {
      await sql.query(stmt);
      console.log('✔ Statement executed successfully');
    } catch (err) {
      console.error('Error executing statement:', stmt, err.message);
      throw err;
    }
  }

  console.log('Migration learning_progress_table.sql applied successfully!');
}

run().catch(err => {
  console.error('Failed to run migration:', err);
  process.exit(1);
});
