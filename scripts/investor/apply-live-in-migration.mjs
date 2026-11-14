import fs from 'fs';
import path from 'path';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

// Strictly read ONLY .env.local (never fall back to .env, .env.production.local, or shell env)
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (!fs.existsSync(envLocalPath)) {
  console.error('Missing .env.local file. Refusing to run against any other environment.');
  process.exit(1);
}

const parsedEnvLocal = dotenv.parse(fs.readFileSync(envLocalPath, 'utf8'));
const databaseUrl = parsedEnvLocal.DATABASE_URL;
if (!databaseUrl) {
  console.error('Missing DATABASE_URL inside .env.local.');
  process.exit(1);
}

const sql = neon(databaseUrl);

async function run() {
  const migrationPath = path.resolve(process.cwd(), 'migrations/add_live_in_fha_strategy.sql');
  const rawSql = fs.readFileSync(migrationPath, 'utf8');

  const dbHost = (() => {
    try {
      return new URL(databaseUrl).host;
    } catch {
      return '(parsed host unavailable)';
    }
  })();

  console.log(`Applying migrations/add_live_in_fha_strategy.sql against .env.local host: ${dbHost}...`);

  await sql.query(`
    DO $$
    DECLARE
      r record;
    BEGIN
      FOR r IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'investor_properties'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%strategy%'
          AND pg_get_constraintdef(c.oid) NOT ILIKE '%live_in%'
      LOOP
        EXECUTE format('ALTER TABLE investor_properties DROP CONSTRAINT IF EXISTS %I', r.conname);
      END LOOP;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'investor_properties'
          AND c.conname = 'investor_properties_strategy_check'
      ) THEN
        ALTER TABLE investor_properties
          ADD CONSTRAINT investor_properties_strategy_check
          CHECK (strategy IS NULL OR strategy IN ('rental', 'flip', 'brrrr', 'live_in'));
      END IF;
    END $$;
  `);

  await sql.query(`
    DO $$
    DECLARE
      r record;
    BEGIN
      FOR r IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'investor_analyses'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%strategy%'
          AND pg_get_constraintdef(c.oid) NOT ILIKE '%live_in%'
      LOOP
        EXECUTE format('ALTER TABLE investor_analyses DROP CONSTRAINT IF EXISTS %I', r.conname);
      END LOOP;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'investor_analyses'
          AND c.conname = 'investor_analyses_strategy_check'
      ) THEN
        ALTER TABLE investor_analyses
          ADD CONSTRAINT investor_analyses_strategy_check
          CHECK (strategy IN ('rental', 'flip', 'brrrr', 'live_in'));
      END IF;
    END $$;
  `);

  await sql.query(`
    ALTER TABLE investor_properties
      ADD COLUMN IF NOT EXISTS has_hoa boolean,
      ADD COLUMN IF NOT EXISTS hoa_monthly numeric;
  `);

  await sql.query(`
    ALTER TABLE investor_profile
      ADD COLUMN IF NOT EXISTS financing_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
  `);

  // Read-only verification queries (NO test rows inserted)
  const verifyConstraints = await sql`
    SELECT t.relname AS table_name, c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname IN ('investor_properties', 'investor_analyses')
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%strategy%'
    ORDER BY t.relname, c.conname;
  `;

  const verifyColumns = await sql`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE (table_name = 'investor_properties' AND column_name IN ('has_hoa', 'hoa_monthly'))
       OR (table_name = 'investor_profile' AND column_name = 'financing_overrides')
    ORDER BY table_name, column_name;
  `;

  console.log('Verified strategy constraints:', verifyConstraints);
  console.log('Verified columns:', verifyColumns);
  console.log(`Migration complete (${rawSql.length} bytes source, 0 test rows inserted).`);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
