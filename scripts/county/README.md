# Florida County Property Tax Roll Pipeline (Phase 2)

This directory contains standalone, non-deployed Node.js scripts for inspecting, reprojecting coordinates from GIS shapefiles, and importing Florida Department of Revenue (FDOR) Property Tax Oversight (PTO) property tax rolls into Neon PostgreSQL.

---

## 1. Scripts Overview

1. **`inspect-roll.mjs`** (Inspection & Integrity Engine):
   - Streams multi-hundred-megabyte property roll archives (`.zip`, `.csv`) with constant memory (< 50MB RAM).
   - Reports total row counts, DOR land-use breakdown (`DOR_UC`), arm's-length market qualification rates (`QUAL_CD`), privacy-safe sample rows, and projected database sizes.
   - Zero database interaction (read-only inspection).

2. **`import-coords.mjs`** (GIS Parcel Shapefile Reprojection & Coordinate Cache):
   - Streams DOR parcel polygon shapefiles (`.shp`, `.dbf`, `.prj`).
   - Uses `polylabel` in original projected feet (precision `1.0`) to compute a pole of inaccessibility guaranteed to fall strictly inside each parcel polygon.
   - Reprojects points to WGS84 (`lat`, `lng`).
   - Resolves duplicate parcel shapes by retaining the point from the largest shape by polygon area.
   - Generates local cache files (`data/county/<county-slug>-coords.json`) enabling one-pass parcel imports without database table bloat.

3. **`import-roll.mjs`** (Production ETL One-Pass Import):
   - Reads the precomputed coordinate cache and inserts residential parcels (`000`, `001`, `002`, `004`, `008`) directly into `county_parcels` with `lat` and `lng` populated in **one single pass** (eliminating subsequent update sweeps and dead tuple bloat).
   - The `ON CONFLICT DO UPDATE` clause uses `lat = COALESCE(EXCLUDED.lat, county_parcels.lat)` and `lng = COALESCE(EXCLUDED.lng, county_parcels.lng)`, ensuring coordinates are never overwritten with NULL during updates.
   - Imports all residential sales (> $100) from SDF plus historical sales from NAL into `county_sales` with deduplication on `(county, parcel_id, sale_year, sale_month, sale_price, or_book, or_page)`.
   - Classifies sales into Market (`01`, `02`) vs. Distressed (`12`, `18`, `19`, `38`) vs. Other transfer types.
   - Batch size: 1,000 rows per transaction.
   - Validates data integrity: aborts if malformed rows exceed 0.5%.

> **Privacy Guarantee**: Owner names (`OWN_NAME`), mailing addresses (`OWN_ADDR1`, `OWN_ADDR2`), fiduciary fields, and exemption amounts are never stored or retained.

---

## 2. Environment Configuration

The import scripts read `DATABASE_URL` from `.env.local`:

```bash
# Option A: Pull environment from linked Vercel project
vercel env pull .env.local

# Option B: Add directly to .env.local (never commit .env.local)
echo "DATABASE_URL=postgresql://neondb_owner:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require" >> .env.local
```

---

## 3. Yearly Roll Refresh Procedure

When the Florida Department of Revenue releases the new assessment rolls each year (typically Final rolls published in October/November), follow these standard operational steps:

### Step 1: Download New Roll Archives & GIS Shapefiles
Download the updated files from the Florida DOR Data Portal into `data/county/`:
- **NAL (Name-Address-Legal)**: e.g. `Broward 16 Final NAL <YEAR>.zip`, `Palm Beach 60 Final NAL <YEAR>.zip`
- **SDF (Sales Data File)**: e.g. `Broward 16 Final SDF <YEAR>.zip`, `Palm Beach 60 Final SDF <YEAR>.zip`
- **PIN Shapefile (if updated)**: from the DOR Map Data directory (e.g. `broward_<YEAR>pin.zip`, `palmbeach_<YEAR>pin.zip`)

### Step 2: Build the Precomputed Coordinate Cache
Compute interior points from the shapefiles and save the coordinate cache (`broward-coords.json`, `palm-beach-coords.json`) without touching the database:

```bash
# Broward
node scripts/county/import-coords.mjs --county=Broward --dry-run

# Palm Beach
node scripts/county/import-coords.mjs --county="Palm Beach" --dry-run
```

### Step 3: Run the Dry-Run Validation
Verify that column counts, parcel IDs, zip codes, and coordinates pass validation before any data is inserted:

```bash
# Broward Dry Run
node scripts/county/import-roll.mjs --county=Broward --dry-run

# Palm Beach Dry Run
node scripts/county/import-roll.mjs --county="Palm Beach" --dry-run
```
Confirm:
- Malformed error rate is `< 0.5%`
- Coordinate coverage is `> 99.8%`
- Known benchmark parcel coordinates and sales match expectations

### Step 4: Run the Real Import
Execute the one-pass production import into Neon PostgreSQL:

```bash
# Broward Real Import
node scripts/county/import-roll.mjs --county=Broward

# Palm Beach Real Import
node scripts/county/import-roll.mjs --county="Palm Beach"
```

### Step 5: Post-Refresh Maintenance (Vacuum & Analyze)
After updating or refreshing hundreds of thousands of rows, reclaim any dead tuples, rebuild table statistics, and verify total database size:

1. In the **Neon SQL Editor** or via `psql`, run:
```sql
VACUUM (FULL, ANALYZE) county_parcels;
VACUUM (FULL, ANALYZE) county_sales;
```

2. Check the database and table sizes:
```sql
SELECT 
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_size_pretty(pg_relation_size(relid)) AS table_size,
  pg_size_pretty(pg_indexes_size(relid)) AS index_size
FROM pg_catalog.pg_statio_user_tables
WHERE relname IN ('county_parcels', 'county_sales', 'county_sale_codes')
ORDER BY pg_total_relation_size(relid) DESC;

SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;
```

---

## 4. Directory Structure

```text
intent-digital/
├── data/
│   └── county/
│       ├── broward-coords.json          # Precomputed coordinates cache (24.2 MB)
│       ├── palm-beach-coords.json       # Precomputed coordinates cache (24.5 MB)
│       ├── Broward 16 Final NAL 2026.zip
│       ├── Broward 16 Final SDF 2026.zip
│       ├── Palm Beach 60 Final NAL 2026.zip
│       ├── Palm Beach 60 Final SDF 2026.zip
│       ├── broward_2026pin/
│       └── palmbeach_2026pin/
├── migrations/
│   ├── county_data_tables.sql
│   └── add_parcel_columns_to_investor.sql
└── scripts/
    └── county/
        ├── inspect-roll.mjs
        ├── import-coords.mjs
        ├── import-roll.mjs
        └── README.md
```
