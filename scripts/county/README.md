# County Property Tax Roll Inspector (Phase 2, Step 1)

This directory contains `inspect-roll.mjs`, an autonomous Node.js inspection utility for Florida Department of Revenue (FDOR) Property Tax Oversight (PTO) property tax rolls.

---

## 1. What This Script Does

- **Constant-Memory Streaming**: Streams multi-hundred-megabyte and multi-gigabyte property roll files (`.csv`, `.tsv`, `.txt`, `.zip`, `.gz`) with constant memory (< 50MB RAM). It reads `.zip` archives directly via standard streaming without decompressing huge files to disk.
- **Auto-Detection**: Automatically detects delimiters (comma, pipe, tab), encodings, and headers.
- **Land-Use Code Breakdown (NAL)**: Groups parcels by Department of Revenue Use Code (`DOR_UC`):
  - `Single-family (001)`
  - `Condominium (004)`
  - `Multifamily under 10 units (008)` (duplex, triplex, quad)
  - `Mobile home (002)`
  - `Multifamily 10+ (003)`
  - `Vacant residential (000)`
  - `Other` (commercial, industrial, institutional, agricultural, etc.)
  - Subtotal of Target Residential parcels (codes `000`, `001`, `002`, `004`, `008`).
- **Sales History & Qualification (SDF)**:
  - Summarizes sales transactions by year.
  - Distinguishes **Qualified arm's-length market transactions** (DOR Code `01` / `Q`) from disqualified transfers (foreclosures, family deeds, court orders, trades, multi-parcel packages).
- **Strict Privacy Whitelist**: Prints 3 sample rows with non-PII property fields only (`parcel_id`, `address`, `city`, `zip`, `use_code`, `living_sqft`, `year_built`, `land_sqft`, `units`, `just_value`, `sale_price`, `sale_year`, `sale_month`, `qual_code`). **Owner names and mailing addresses are strictly excluded and never printed.**
- **Neon PostgreSQL Sizing Estimate**: Computes projected table size, row byte density, and B-Tree index overhead for importing residential parcels and sales history.

---

## 2. Where to Download Broward County Roll Files

1. Navigate to the **Florida Department of Revenue PTO Data Portal**:
   [https://floridarevenue.com/property/Pages/DataPortal.aspx](https://floridarevenue.com/property/Pages/DataPortal.aspx)
2. Open the **Tax Roll Data Files** section.
3. Select:
   - **County**: **Broward** (County Code **16**)
   - **Year**: Latest tax year (e.g., `2024`)
   - **Roll Status**: `Final` (or `Preliminary` if final is not yet certified)
4. Download the two primary datasets:
   - **Real Property Roll (NAL)**: e.g., `NAL16F2024.zip` or `NAL162024.csv` (Name, Address, Legal)
   - **Sales Data File (SDF)**: e.g., `SDF16F2024.zip` or `SDF162024.csv` (Property Transfer & Sales Records)

---

## 3. Where to Place the Files

Place the downloaded files (either `.zip` or uncompressed `.csv`) into the `data/county/` folder inside the project root:

```text
intent-digital/
├── data/
│   └── county/
│       ├── NAL16F2024.zip   <-- Broward Real Property Roll
│       └── SDF16F2024.zip   <-- Broward Sales Data File
└── scripts/
    └── county/
        ├── inspect-roll.mjs
        └── README.md
```

> **Note**: The `/data/` folder is explicitly listed in `.gitignore` so large data files are never committed to Git.

---

## 4. How to Run the Inspector

From the project root:

```bash
node scripts/county/inspect-roll.mjs
```

Or target a specific directory or individual file:

```bash
# Inspect a specific folder
node scripts/county/inspect-roll.mjs ./data/county

# Inspect a single archive or CSV file
node scripts/county/inspect-roll.mjs ./data/county/NAL16F2024.zip
```
