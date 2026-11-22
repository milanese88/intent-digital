import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createPostgresClient } from '../../api/_lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, '../..');
export const MIGRATIONS_DIR = path.resolve(PROJECT_ROOT, 'migrations');

/**
 * Canonical dependency & chronological order for the repository's migrations.
 * Any future migration files added to migrations/ (e.g. 20261115_*.sql) sort
 * lexicographically after these baseline files.
 */
export const CANONICAL_MIGRATION_ORDER = [
  '000_schema_migrations.sql',
  'investor_studio_tables.sql',
  'county_data_tables.sql',
  'add_parcel_columns_to_investor.sql',
  'add_county_parcels_coords_index.sql',
  'designer_hub_tables.sql',
  'add_size_to_design_room_images.sql',
  'add_stage3_budget_columns.sql',
  'add_stage4_sourcing_columns.sql',
  'studio_journal_tables.sql',
  'learning_progress_table.sql',
  'add_pinterest_tables.sql',
  'add_portal_theme.sql',
  'add_county_parcels_norm.sql',
  'add_property_documents.sql',
  'add_valuation_and_backtest.sql',
  'add_live_in_fha_strategy.sql',
  'add_comp_details_and_nal_clues.sql',
  'add_newsletter_subscribers.sql',
  'add_location_intelligence_tables.sql',
  'add_subdivision_and_hoa_fields.sql',
  'add_boat_dock_and_construction.sql',
  'add_appraisal_v2_columns.sql',
  'add_price_source_and_subject_meta.sql',
  'add_building_characteristics.sql',
  'add_deal_breakdowns.sql',
  'add_property_permits.sql',
  'add_flip_finder_perf_indexes.sql',
  'drop_redundant_sales_indexes.sql',
  'add_opportunity_map_and_redfin.sql'
];

/**
 * Explicit read-only information_schema / pg_catalog signatures for every baseline
 * migration so already-applied files can be accurately detected and backfilled into
 * schema_migrations without guesswork.
 */
export const MIGRATION_SCHEMA_SIGNATURES = {
  '000_schema_migrations.sql': {
    tables: ['schema_migrations'],
    columns: [
      { table: 'schema_migrations', column: 'filename' },
      { table: 'schema_migrations', column: 'applied_at' }
    ]
  },
  'investor_studio_tables.sql': {
    tables: ['investor_properties', 'investor_comps', 'investor_locations', 'investor_analyses']
  },
  'county_data_tables.sql': {
    tables: ['county_parcels', 'county_sales', 'county_sale_codes'],
    columns: [{ table: 'county_sale_codes', column: 'is_distressed' }]
  },
  'add_parcel_columns_to_investor.sql': {
    columns: [
      { table: 'investor_properties', column: 'parcel_id' },
      { table: 'investor_properties', column: 'parcel_county' },
      { table: 'investor_comps', column: 'parcel_id' },
      { table: 'investor_comps', column: 'parcel_county' }
    ]
  },
  'add_county_parcels_coords_index.sql': {
    indexes: ['idx_county_parcels_coords']
  },
  'designer_hub_tables.sql': {
    tables: [
      'design_products',
      'design_projects',
      'design_rooms',
      'design_room_images',
      'design_items',
      'design_trades',
      'portfolio_entries'
    ]
  },
  'add_size_to_design_room_images.sql': {
    columns: [{ table: 'design_room_images', column: 'size' }],
    constraints: [{ table: 'design_room_images', conname: 'design_room_images_size_check' }]
  },
  'add_stage3_budget_columns.sql': {
    columns: [
      { table: 'design_items', column: 'paid' },
      { table: 'design_items', column: 'due_date' },
      { table: 'design_items', column: 'invoice_url' },
      { table: 'investor_properties', column: 'rehab_budget' },
      { table: 'investor_properties', column: 'rehab_budget_source' },
      { table: 'investor_properties', column: 'rehab_budget_updated_at' }
    ]
  },
  'add_stage4_sourcing_columns.sql': {
    columns: [
      { table: 'design_items', column: 'trade_id' },
      { table: 'design_products', column: 'favorite' },
      { table: 'design_products', column: 'room_types' }
    ],
    indexes: ['idx_design_items_trade_id', 'idx_design_products_favorite']
  },
  'studio_journal_tables.sql': {
    tables: ['inspiration_images', 'learning_notes'],
    columns: [
      { table: 'investor_properties', column: 'is_studying' },
      { table: 'admin_user', column: 'journal_metadata' }
    ]
  },
  'learning_progress_table.sql': {
    tables: ['learning_progress'],
    indexes: ['idx_learning_progress_owner_date']
  },
  'add_pinterest_tables.sql': {
    tables: ['pinterest_boards', 'room_pins'],
    columns: [{ table: 'pinterest_boards', column: 'kind' }]
  },
  'add_portal_theme.sql': {
    tables: ['portal_theme', 'portal_theme_presets']
  },
  'add_county_parcels_norm.sql': {
    columns: [
      { table: 'county_parcels', column: 'situs_number' },
      { table: 'county_parcels', column: 'situs_street_norm' }
    ],
    indexes: ['idx_county_parcels_norm_lookup']
  },
  'add_property_documents.sql': {
    tables: ['investor_property_documents'],
    indexes: ['idx_investor_property_documents_prop']
  },
  'add_valuation_and_backtest.sql': {
    tables: ['investor_profile', 'valuation_backtest_results'],
    columns: [
      { table: 'investor_comps', column: 'condition' },
      { table: 'investor_comps', column: 'pool' },
      { table: 'investor_comps', column: 'garage' },
      { table: 'investor_comps', column: 'waterfront' },
      { table: 'investor_comps', column: 'lot_sqft' },
      { table: 'investor_comps', column: 'notes' },
      { table: 'investor_comps', column: 'adjustments' },
      { table: 'investor_properties', column: 'pool' },
      { table: 'investor_properties', column: 'garage' },
      { table: 'investor_properties', column: 'waterfront' },
      { table: 'investor_properties', column: 'before_offer_checklist' },
      { table: 'investor_profile', column: 'valuation_defaults' }
    ]
  },
  'add_live_in_fha_strategy.sql': {
    columns: [
      { table: 'investor_properties', column: 'has_hoa' },
      { table: 'investor_properties', column: 'hoa_monthly' },
      { table: 'investor_profile', column: 'financing_overrides' }
    ],
    constraintDefs: [
      { table: 'investor_properties', includes: 'live_in', label: "investor_properties.strategy allows 'live_in'" },
      { table: 'investor_analyses', includes: 'live_in', label: "investor_analyses.strategy allows 'live_in'" }
    ]
  },
  'add_comp_details_and_nal_clues.sql': {
    tables: ['comp_details'],
    columns: [
      { table: 'county_parcels', column: 'eff_year_built' },
      { table: 'county_parcels', column: 'units' },
      { table: 'county_parcels', column: 'imp_qual' },
      { table: 'county_parcels', column: 'const_class' },
      { table: 'county_parcels', column: 'spec_feat_val' },
      { table: 'county_parcels', column: 'beds' },
      { table: 'county_parcels', column: 'full_baths' },
      { table: 'county_parcels', column: 'half_baths' },
      { table: 'investor_comps', column: 'comp_details_json' },
      { table: 'investor_comps', column: 'is_outlier' },
      { table: 'investor_properties', column: 'subject_details' }
    ],
    constraintDefs: [
      { table: 'investor_comps', includes: 'c1', label: "investor_comps.condition allows UAD 'c1'..'c6'" }
    ]
  },
  'add_newsletter_subscribers.sql': {
    tables: ['newsletter_subscribers'],
    columns: [
      { table: 'newsletter_subscribers', column: 'email' },
      { table: 'newsletter_subscribers', column: 'created_at' },
      { table: 'newsletter_subscribers', column: 'consent_text' },
      { table: 'newsletter_subscribers', column: 'unsubscribed_at' }
    ],
    indexes: ['idx_newsletter_subscribers_email_lower']
  },
  'add_subdivision_and_hoa_fields.sql': {
    columns: [
      { table: 'county_parcels', column: 's_legal' },
      { table: 'county_parcels', column: 'subdivision_name' },
      { table: 'county_parcels', column: 'subdivision_code' },
      { table: 'investor_properties', column: 'hoa_name' },
      { table: 'investor_comps', column: 'hoa_name' },
      { table: 'comp_details', column: 'hoa_name' }
    ],
    constraintDefs: [
      { table: 'comp_details', includes: 'Martin', label: "comp_details.county allows 'Martin'" }
    ]
  },
  'add_boat_dock_and_construction.sql': {
    columns: [
      { table: 'investor_properties', column: 'boat_dock' },
      { table: 'investor_properties', column: 'boat_dock_sqft' },
      { table: 'investor_properties', column: 'construction_type' },
      { table: 'investor_comps', column: 'boat_dock' },
      { table: 'investor_comps', column: 'boat_dock_sqft' },
      { table: 'investor_comps', column: 'construction_type' },
      { table: 'comp_details', column: 'boat_dock' },
      { table: 'comp_details', column: 'boat_dock_sqft' },
      { table: 'comp_details', column: 'construction_type' }
    ]
  },
  'add_appraisal_v2_columns.sql': {
    columns: [
      { table: 'county_parcels', column: 'land_value' },
      { table: 'investor_properties', column: 'quality' },
      { table: 'investor_properties', column: 'boat_lift' },
      { table: 'investor_properties', column: 'land_value' },
      { table: 'investor_comps', column: 'quality' },
      { table: 'investor_comps', column: 'boat_lift' },
      { table: 'comp_details', column: 'quality' },
      { table: 'comp_details', column: 'boat_lift' }
    ]
  },
  'add_price_source_and_subject_meta.sql': {
    columns: [
      { table: 'investor_properties', column: 'price_source' },
      { table: 'investor_properties', column: 'offer_price' },
      { table: 'investor_properties', column: 'construction_detail' }
    ]
  },
  'add_building_characteristics.sql': {
    tables: ['building_characteristics'],
    columns: [
      { table: 'building_characteristics', column: 'county' },
      { table: 'building_characteristics', column: 'folio' },
      { table: 'building_characteristics', column: 'source' },
      { table: 'building_characteristics', column: 'roll_year' },
      { table: 'building_characteristics', column: 'quality_uad' },
      { table: 'building_characteristics', column: 'raw_quality_code' },
      { table: 'building_characteristics', column: 'condition_uad' },
      { table: 'building_characteristics', column: 'raw_condition_code' },
      { table: 'building_characteristics', column: 'condition_is_default' },
      { table: 'building_characteristics', column: 'living_area_sqft' }
    ],
    indexes: ['idx_building_characteristics_folio']
  },
  'add_deal_breakdowns.sql': {
    tables: ['deal_breakdowns'],
    columns: [
      { table: 'deal_breakdowns', column: 'owner_email' },
      { table: 'deal_breakdowns', column: 'property_id' },
      { table: 'deal_breakdowns', column: 'deal_type' },
      { table: 'deal_breakdowns', column: 'inputs' },
      { table: 'deal_breakdowns', column: 'results' }
    ],
    indexes: [
      'idx_deal_breakdowns_owner_updated',
      'idx_deal_breakdowns_owner_property',
      'idx_deal_breakdowns_owner_parcel',
      'idx_county_sales_flip_finder'
    ]
  },
  'add_property_permits.sql': {
    tables: ['property_permits'],
    columns: [
      { table: 'property_permits', column: 'owner_email' },
      { table: 'property_permits', column: 'property_id' },
      { table: 'property_permits', column: 'folio' },
      { table: 'property_permits', column: 'permit_type' },
      { table: 'property_permits', column: 'issue_date' }
    ],
    indexes: [
      'idx_property_permits_owner_property',
      'idx_property_permits_owner_folio',
      'idx_property_permits_issue_date'
    ]
  },
  'add_flip_finder_perf_indexes.sql': {
    tables: [],
    columns: [],
    indexes: [
      'idx_county_sales_parcel_ym',
      'idx_county_sales_county_ym_sell',
      'idx_county_parcels_county_zip_parcel'
    ]
  },
  'drop_redundant_sales_indexes.sql': {
    tables: [],
    columns: [],
    indexes: []
  },
  'add_opportunity_map_and_redfin.sql': {
    tables: [
      'redfin_zip_market'
    ],
    columns: [
      { table: 'redfin_zip_market', column: 'zip' },
      { table: 'redfin_zip_market', column: 'period_end' },
      { table: 'redfin_zip_market', column: 'median_dom' }
    ],
    indexes: [
      'idx_redfin_zip_market_lookup',
      'idx_redfin_zip_market_dom'
    ]
  },
  'add_location_intelligence_tables.sql': {
    tables: [
      'location_snapshots',
      'fl_highway_junctions',
      'school_attendance_zones',
      'fldoe_school_grades',
      'fdle_agency_stats'
    ],
    columns: [
      { table: 'location_snapshots', column: 'field_sources' },
      { table: 'location_snapshots', column: 'getting_around' },
      { table: 'location_snapshots', column: 'schools' },
      { table: 'location_snapshots', column: 'people_housing' },
      { table: 'location_snapshots', column: 'safety' }
    ],
    indexes: [
      'idx_location_snapshots_owner_fetched',
      'idx_fl_highway_junctions_route_coords',
      'idx_school_attendance_zones_bbox',
      'idx_fldoe_school_grades_county_coords',
      'idx_fdle_agency_stats_lookup'
    ]
  }
};

/**
 * Loads SUPABASE_DATABASE_URL (port 5432 session pooler, falling back to DATABASE_URL)
 * strictly from .env.local (never falls back to shell env or .env.production).
 */
export function loadEnvLocalDatabaseUrl(projectRoot = PROJECT_ROOT) {
  const envLocalPath = path.resolve(projectRoot, '.env.local');
  if (!fs.existsSync(envLocalPath)) {
    throw new Error(`Missing .env.local at ${envLocalPath}. Refusing to run against any other database.`);
  }
  const parsed = dotenv.parse(fs.readFileSync(envLocalPath, 'utf8'));
  const databaseUrl = parsed.SUPABASE_DATABASE_URL || parsed.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('SUPABASE_DATABASE_URL (or DATABASE_URL) is not set inside .env.local.');
  }
  let host = '(unknown host)';
  try {
    host = new URL(databaseUrl).host;
  } catch {
    // ignore URL parse issues
  }
  return { databaseUrl, host, envLocalPath };
}

export function createEnvLocalSqlClient(projectRoot = PROJECT_ROOT) {
  const { databaseUrl, host, envLocalPath } = loadEnvLocalDatabaseUrl(projectRoot);
  return {
    sql: createPostgresClient(databaseUrl, { mode: 'script' }),
    databaseUrl,
    host,
    envLocalPath
  };
}

/**
 * Lists all .sql files in migrations/ in deterministic dependency order.
 */
export function listOrderedMigrationFiles(migrationsDir = MIGRATIONS_DIR) {
  if (!fs.existsSync(migrationsDir)) return [];
  const allFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  const orderIndex = new Map(CANONICAL_MIGRATION_ORDER.map((name, idx) => [name, idx]));

  return allFiles.sort((a, b) => {
    const idxA = orderIndex.has(a) ? orderIndex.get(a) : Number.MAX_SAFE_INTEGER;
    const idxB = orderIndex.has(b) ? orderIndex.get(b) : Number.MAX_SAFE_INTEGER;
    if (idxA !== idxB) return idxA - idxB;
    return a.localeCompare(b);
  });
}

/**
 * Fallback parser for any future migration .sql file not hardcoded in MIGRATION_SCHEMA_SIGNATURES:
 * extracts CREATE TABLE, ADD COLUMN, and CREATE INDEX expectations automatically.
 */
export function extractSqlExpectations(sqlContent = '') {
  const cleaned = sqlContent
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');

  const tables = new Set();
  const columns = [];
  const indexes = new Set();

  const createTableRegex = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi;
  let m;
  while ((m = createTableRegex.exec(cleaned)) !== null) {
    tables.add(m[1].toLowerCase());
  }

  const createIndexRegex = /create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_]+)/gi;
  while ((m = createIndexRegex.exec(cleaned)) !== null) {
    indexes.add(m[1].toLowerCase());
  }

  const alterBlockRegex = /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)([\s\S]*?);/gi;
  while ((m = alterBlockRegex.exec(cleaned)) !== null) {
    const tbl = m[1].toLowerCase();
    const body = m[2];
    const addColRegex = /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_]+)/gi;
    let cm;
    while ((cm = addColRegex.exec(body)) !== null) {
      columns.push({ table: tbl, column: cm[1].toLowerCase() });
    }
  }

  return {
    tables: Array.from(tables),
    columns,
    indexes: Array.from(indexes),
    constraints: [],
    constraintDefs: []
  };
}

/**
 * Splits a multi-statement PostgreSQL file into individual executable SQL statements,
 * preserving single-quoted strings, double-quoted identifiers, comments, and
 * dollar-quoted PL/pgSQL blocks (DO $$ ... END $$; / CREATE FUNCTION ... $$).
 */
export function splitSqlStatements(sqlText = '') {
  const statements = [];
  let current = '';
  let i = 0;
  const len = sqlText.length;

  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag = null;

  while (i < len) {
    const ch = sqlText[i];
    const next = i + 1 < len ? sqlText[i + 1] : '';

    if (inLineComment) {
      current += ch;
      if (ch === '\n') {
        inLineComment = false;
      }
      i++;
      continue;
    }

    if (inBlockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += next;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i++;
      continue;
    }

    if (dollarTag !== null) {
      if (sqlText.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += ch;
      i++;
      continue;
    }

    if (inSingleQuote) {
      current += ch;
      if (ch === "'" && next === "'") {
        current += next;
        i += 2;
        continue;
      }
      if (ch === "'") {
        inSingleQuote = false;
      }
      i++;
      continue;
    }

    if (inDoubleQuote) {
      current += ch;
      if (ch === '"' && next === '"') {
        current += next;
        i += 2;
        continue;
      }
      if (ch === '"') {
        inDoubleQuote = false;
      }
      i++;
      continue;
    }

    // Start of comments
    if (ch === '-' && next === '-') {
      inLineComment = true;
      current += ch + next;
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      current += ch + next;
      i += 2;
      continue;
    }

    // Start of dollar-quoted block: $$ or $tag$
    if (ch === '$') {
      const rest = sqlText.slice(i);
      const tagMatch = rest.match(/^\$([a-zA-Z0-9_]*)\$/);
      if (tagMatch) {
        dollarTag = tagMatch[0];
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }

    if (ch === "'") {
      inSingleQuote = true;
      current += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inDoubleQuote = true;
      current += ch;
      i++;
      continue;
    }

    if (ch === ';') {
      const trimmed = current.trim();
      const withoutComments = trimmed
        .replace(/--[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .trim();
      if (withoutComments.length > 0) {
        statements.push(trimmed + ';');
      }
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  const tail = current.trim();
  const tailWithoutComments = tail
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();
  if (tailWithoutComments.length > 0) {
    statements.push(tail + ';');
  }

  return statements;
}

/**
 * Strictly READ-ONLY snapshot of public schema tables, columns, indexes, constraints,
 * schema_migrations (if present), and database size.
 */
export async function inspectDatabaseSchema(sql) {
  const tablesRows = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE';
  `;
  const tables = new Set(tablesRows.map((r) => r.table_name.toLowerCase()));

  const colsRows = await sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public';
  `;
  const columnsByTable = new Map();
  for (const r of colsRows) {
    const t = r.table_name.toLowerCase();
    if (!columnsByTable.has(t)) columnsByTable.set(t, new Set());
    columnsByTable.get(t).add(r.column_name.toLowerCase());
  }

  const idxRows = await sql`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public';
  `;
  const indexes = new Set(idxRows.map((r) => r.indexname.toLowerCase()));

  const conRows = await sql`
    SELECT t.relname AS table_name, c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public';
  `;
  const constraints = conRows.map((r) => ({
    table: r.table_name.toLowerCase(),
    conname: r.conname.toLowerCase(),
    def: String(r.def || '')
  }));

  const sizeRows = await sql`
    SELECT
      pg_size_pretty(pg_database_size(current_database())) AS pretty_size,
      pg_database_size(current_database()) AS bytes;
  `;

  let recordedMigrations = new Map();
  const hasMigrationsTable = tables.has('schema_migrations');
  if (hasMigrationsTable) {
    const migRows = await sql`
      SELECT filename, applied_at
      FROM schema_migrations
      ORDER BY applied_at ASC, filename ASC;
    `;
    recordedMigrations = new Map(migRows.map((r) => [r.filename, r.applied_at]));
  }

  return {
    tables,
    columnsByTable,
    indexes,
    constraints,
    hasMigrationsTable,
    recordedMigrations,
    dbSizePretty: sizeRows[0]?.pretty_size || 'unknown',
    dbSizeBytes: Number(sizeRows[0]?.bytes || 0)
  };
}

/**
 * Evaluates every .sql file in migrations/ against schema_migrations AND information_schema.
 */
export function evaluateMigrationsStatus(snapshot, migrationsDir = MIGRATIONS_DIR) {
  const orderedFiles = listOrderedMigrationFiles(migrationsDir);
  const results = [];

  for (const filename of orderedFiles) {
    const fullPath = path.join(migrationsDir, filename);
    const sqlContent = fs.readFileSync(fullPath, 'utf8');
    const sig = MIGRATION_SCHEMA_SIGNATURES[filename] || extractSqlExpectations(sqlContent);
    const missing = [];

    for (const tbl of sig.tables || []) {
      if (!snapshot.tables.has(tbl.toLowerCase())) {
        missing.push(`table ${tbl}`);
      }
    }

    for (const col of sig.columns || []) {
      const tCols = snapshot.columnsByTable.get(col.table.toLowerCase());
      if (!tCols || !tCols.has(col.column.toLowerCase())) {
        missing.push(`column ${col.table}.${col.column}`);
      }
    }

    for (const idx of sig.indexes || []) {
      // If an index was intentionally dropped by a later recorded migration, do not treat as missing
      if (
        filename === 'add_flip_finder_perf_indexes.sql' &&
        (idx === 'idx_county_sales_parcel_ym' || idx === 'idx_county_sales_county_ym_sell') &&
        snapshot.recordedMigrations.has('drop_redundant_sales_indexes.sql')
      ) {
        continue;
      }
      if (!snapshot.indexes.has(idx.toLowerCase())) {
        missing.push(`index ${idx}`);
      }
    }

    for (const con of sig.constraints || []) {
      const found = snapshot.constraints.some(
        (c) => c.table === con.table.toLowerCase() && c.conname === con.conname.toLowerCase()
      );
      if (!found) {
        missing.push(`constraint ${con.table}.${con.conname}`);
      }
    }

    for (const cd of sig.constraintDefs || []) {
      const found = snapshot.constraints.some(
        (c) =>
          c.table === cd.table.toLowerCase() &&
          c.def.toLowerCase().includes(cd.includes.toLowerCase())
      );
      if (!found) {
        missing.push(`check (${cd.label || `${cd.table} includes ${cd.includes}`})`);
      }
    }

    const isRecorded = snapshot.recordedMigrations.has(filename);
    const isKnownLegacyBaseline = Object.prototype.hasOwnProperty.call(
      MIGRATION_SCHEMA_SIGNATURES,
      filename
    );

    let status;
    if (missing.length > 0) {
      status = 'pending';
    } else if (isRecorded) {
      status = 'applied';
    } else if (!snapshot.hasMigrationsTable || snapshot.recordedMigrations.size === 0) {
      status = isKnownLegacyBaseline ? 'applied_unrecorded' : 'pending';
    } else {
      // Once schema_migrations is initialized, any unrecorded new migration file is pending
      status = 'pending';
    }

    results.push({
      filename,
      fullPath,
      sqlContent,
      status, // 'applied' | 'applied_unrecorded' | 'pending'
      isRecorded,
      appliedAt: snapshot.recordedMigrations.get(filename) || null,
      missing
    });
  }

  return results;
}
