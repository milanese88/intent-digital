# County Property Tax Roll Tools (Phase 2)

This directory contains standalone, non-deployed Node.js scripts for inspecting and importing Florida Department of Revenue (FDOR) Property Tax Oversight (PTO) property tax rolls into Neon PostgreSQL.

---

## 1. Scripts Overview

1. **`inspect-roll.mjs`** (Step 2.1 — Inspection & Sizing):
   - Streams multi-hundred-megabyte and multi-gigabyte property roll files (`.zip`, `.csv`, `.tsv`, `.txt`) with constant memory (< 50MB RAM).
   - Reports total row counts, land-use breakdowns (`DOR_UC`), arm's-length qualification rates (`QUAL_CD`), privacy-safe sample rows, and projected database sizes.
   - Zero database interaction (inspection only).

2. **`import-roll.mjs`** (Step 2.2 — Production ETL Import):
   - Imports residential property parcels (use codes `000`, `001`, `002`, `004`, `008`) into `county_parcels`.
   - Imports all residential sales (> $100) from SDF plus historical sales from NAL into `county_sales` with deduplication on `(county, parcel_id, sale_year, sale_month, sale_price, or_book, or_page)`.
   - Batch size: 500 rows per transaction with `ON CONFLICT DO UPDATE` (parcels) and `ON CONFLICT DO NOTHING` (sales).
   - Supports `--dry-run` to parse and verify import counts without connecting to the database.
   - Reports post-import relation sizes (`pg_total_relation_size`) and whole database size.

---

## 2. Database Setup (Neon PostgreSQL)

Before running the live import, run the migration in your **Neon SQL Editor**:

```bash
# File: migrations/county_data_tables.sql
```

The migration creates:
- `county_parcels`: Primary key `(county, parcel_id)`, indexes on `(county, zip)`, `(county, use_code)`, and `lower(address) text_pattern_ops`.
- `county_sales`: Unique constraint on `(county, parcel_id, sale_year, sale_month, sale_price, or_book, or_page)`, indexes on `(county, parcel_id)` and `(county, sale_year, sale_month, qual_code)`.
- `county_sale_codes`: Pre-populated with all 33 FDOR PTO qualification codes from the 2026 User's Guide (marking only Code `01` as `is_market = true`).

> **Privacy Guarantee**: No owner names (`OWN_NAME`), mailing addresses (`OWN_ADDR1`, `OWN_ADDR2`, etc.), fiduciary fields, or exemption amounts are ever stored or retained in memory.

---

## 3. Environment Configuration

The import script reads `DATABASE_URL` from `.env.local`. To populate it:

```bash
# Option A: Pull environment from linked Vercel project
vercel env pull .env.local

# Option B: Add directly to .env.local (never commit .env.local)
echo "DATABASE_URL=postgresql://neondb_owner:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require" >> .env.local
```

---

## 4. Usage Commands

### Inspect County Roll Files
```bash
# Inspect all files or filter by county
node scripts/county/inspect-roll.mjs --county=Broward
node scripts/county/inspect-roll.mjs --county="Palm Beach"
```

### Dry-Run Simulation (Test without Database)
```bash
# Parse files, test streaming, and report counts without inserting into Neon
node scripts/county/import-roll.mjs --county=Broward --dry-run
```

### Live Production Import
```bash
# Run the live import into Neon
node scripts/county/import-roll.mjs --county=Broward
```

---

## 5. County Roll Data Folder

All large county files reside in `data/county/` which is ignored by Git in `.gitignore`:

```text
intent-digital/
├── data/
│   └── county/
│       ├── Broward 16 Final NAL 2026.zip
│       ├── Broward 16 Final SDF 2026.zip
│       ├── Palm Beach 60 Final NAL 2026.zip
│       └── Palm Beach 60 Final SDF 2026.zip
├── migrations/
│   └── county_data_tables.sql
└── scripts/
    └── county/
        ├── inspect-roll.mjs
        ├── import-roll.mjs
        └── README.md
```
