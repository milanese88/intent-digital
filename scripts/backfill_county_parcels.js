import { getDb } from '../api/_lib/db.js';

export async function runBackfill() {
  const sql = getDb();
  console.log('--- 1. Applying DDL columns if not present ---');
  await sql`ALTER TABLE county_parcels ADD COLUMN IF NOT EXISTS situs_number text;`;
  await sql`ALTER TABLE county_parcels ADD COLUMN IF NOT EXISTS situs_street_norm text;`;
  console.log('Columns situs_number and situs_street_norm verified.');

  console.log('\n--- 2. Batch Backfill in chunks of 50,000 ---');
  let totalUpdated = 0;
  let batchNum = 1;
  const startTime = performance.now();

  while (true) {
    const batchStart = performance.now();
    const result = await sql`
      WITH batch AS (
        SELECT county, parcel_id, address
        FROM county_parcels
        WHERE situs_street_norm IS NULL AND address IS NOT NULL
        LIMIT 50000
      )
      UPDATE county_parcels p
      SET 
        situs_number = CASE 
          WHEN b.address ~ '^[0-9]+' THEN split_part(b.address, ' ', 1)
          ELSE NULL
        END,
        situs_street_norm = CASE
          WHEN b.address ~ '^[0-9]+' THEN 
            trim(regexp_replace(
              regexp_replace(
                substring(b.address from '^[0-9]+[^ ]*\\s*(.*)$'),
                '\\m([0-9]+)(ST|ND|RD|TH)\\y', '\\1', 'gi'
              ),
              '\\s+', ' ', 'g'
            ))
          ELSE b.address
        END
      FROM batch b
      WHERE p.county = b.county AND p.parcel_id = b.parcel_id;
    `;

    // Neon serverless returns count or array
    const updatedInBatch = result.count !== undefined ? result.count : (Array.isArray(result) ? result.length : 50000);
    totalUpdated += updatedInBatch;
    const batchElapsed = ((performance.now() - batchStart) / 1000).toFixed(2);
    console.log(`Batch ${batchNum}: updated ~${updatedInBatch} rows (${batchElapsed}s) | Total updated: ${totalUpdated}`);

    if (updatedInBatch === 0) break;
    batchNum++;
  }

  const backfillElapsed = ((performance.now() - startTime) / 1000).toFixed(2);
  console.log(`\nBackfill complete: ${totalUpdated} rows updated in ${backfillElapsed}s.`);

  console.log('\n--- 3. Creating B-Tree index on (county, situs_number, situs_street_norm) ---');
  const indexStart = performance.now();
  await sql`
    CREATE INDEX IF NOT EXISTS idx_county_parcels_norm_lookup 
    ON county_parcels (county, situs_number, situs_street_norm);
  `;
  const indexElapsed = ((performance.now() - indexStart) / 1000).toFixed(2);
  console.log(`Index created in ${indexElapsed}s.`);

  console.log('\n--- 4. Running VACUUM (ANALYZE) ---');
  const vacuumStart = performance.now();
  await sql`VACUUM (ANALYZE) county_parcels;`;
  const vacuumElapsed = ((performance.now() - vacuumStart) / 1000).toFixed(2);
  console.log(`VACUUM (ANALYZE) complete in ${vacuumElapsed}s.`);

  console.log('\n--- 5. Reporting Index and Database Size ---');
  const indexSize = await sql`
    SELECT pg_size_pretty(pg_relation_size('idx_county_parcels_norm_lookup')) as index_size;
  `;
  const totalDbSize = await sql`
    SELECT pg_size_pretty(pg_database_size(current_database())) as total_db_size;
  `;
  console.log(`idx_county_parcels_norm_lookup size: ${indexSize[0].index_size}`);
  console.log(`Total database size: ${totalDbSize[0].total_db_size} (Plan limit: 1 GB)`);
}

if (process.argv[1]?.endsWith('backfill_county_parcels.js')) {
  runBackfill().catch(err => {
    console.error('Error during backfill:', err);
    process.exit(1);
  });
}
