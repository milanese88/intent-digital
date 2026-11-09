import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDb } from '../../api/_lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.production.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function splitStatements(sql) {
  const statements = [];
  let current = '';
  let inDollarQuote = false;
  let inSingleQuote = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = sql[i + 1] || '';

    // Check single quote toggle (when not in dollar quote)
    if (char === "'" && !inDollarQuote) {
      if (nextChar === "'") {
        current += "''";
        i++;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }

    // Check dollar quote toggle (when not in single quote)
    if (char === '$' && nextChar === '$' && !inSingleQuote) {
      inDollarQuote = !inDollarQuote;
      current += '$$';
      i++;
      continue;
    }

    // Statement boundary
    if (char === ';' && !inDollarQuote && !inSingleQuote) {
      const trimmed = current.trim();
      // Remove pure comment lines to see if there is actual SQL
      const withoutComments = trimmed.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('--')).join(' ');
      if (withoutComments.length > 0) {
        statements.push(trimmed);
      }
      current = '';
      continue;
    }

    current += char;
  }

  const finalTrimmed = current.trim();
  const withoutComments = finalTrimmed.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('--')).join(' ');
  if (withoutComments.length > 0) {
    statements.push(finalTrimmed);
  }

  return statements;
}

export async function runMigration() {
  const sql = getDb();
  const migrationPath = path.resolve(__dirname, '../../migrations/designer_hub_tables.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  console.log('Parsing Designer Hub tables migration...');
  const statements = splitStatements(migrationSql);
  console.log(`Found ${statements.length} SQL statements to execute.`);

  for (let idx = 0; idx < statements.length; idx++) {
    const stmt = statements[idx];
    const preview = stmt.replace(/\s+/g, ' ').substring(0, 60);
    console.log(`[${idx + 1}/${statements.length}] Executing: ${preview}...`);
    await sql.query(stmt);
  }

  console.log('All Designer Hub migration statements executed successfully!');
}

if (process.argv.includes('--apply')) {
  runMigration().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
