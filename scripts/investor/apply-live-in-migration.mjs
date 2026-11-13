import fs from 'fs';
import path from 'path';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Missing DATABASE_URL environment variable.');
  process.exit(1);
}

const sql = neon(databaseUrl);

async function run() {
  const migrationPath = path.resolve(process.cwd(), 'migrations/add_live_in_fha_strategy.sql');
  const rawSql = fs.readFileSync(migrationPath, 'utf8');

  console.log('Applying migrations/add_live_in_fha_strategy.sql...');

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
      LOOP
        EXECUTE format('ALTER TABLE investor_properties DROP CONSTRAINT IF EXISTS %I', r.conname);
      END LOOP;
    END $$;
  `);

  await sql.query(`
    ALTER TABLE investor_properties
      ADD CONSTRAINT investor_properties_strategy_check
      CHECK (strategy IS NULL OR strategy IN ('rental', 'flip', 'brrrr', 'live_in'));
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
      LOOP
        EXECUTE format('ALTER TABLE investor_analyses DROP CONSTRAINT IF EXISTS %I', r.conname);
      END LOOP;
    END $$;
  `);

  await sql.query(`
    ALTER TABLE investor_analyses
      ADD CONSTRAINT investor_analyses_strategy_check
      CHECK (strategy IN ('rental', 'flip', 'brrrr', 'live_in'));
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

  const verifyConstraints = await sql`
    SELECT t.relname AS table_name, c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname IN ('investor_properties', 'investor_analyses')
      AND c.conname IN ('investor_properties_strategy_check', 'investor_analyses_strategy_check')
    ORDER BY t.relname;
  `;

  console.log('Verified constraints:', verifyConstraints);
  console.log(`Migration complete (${rawSql.length} bytes source).`);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

