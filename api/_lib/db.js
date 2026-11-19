import { neon } from '@neondatabase/serverless';

export const MIGRATION_UPDATE_MESSAGE =
  'This feature needs a database update — ask to apply migrations.';

export const NEON_QUOTA_MESSAGE =
  'Database quota exceeded on Neon (storage or compute limit reached). Upgrade your Neon plan or free up space in the Neon Console.';

export function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.trim() === '[SENSITIVE]') {
    throw new Error('DATABASE_URL is not set');
  }
  return neon(databaseUrl);
}

/**
 * Returns true when Neon rejects queries with HTTP 402 / plan quota exceeded.
 */
export function isDatabaseQuotaError(err) {
  if (!err) return false;
  const msg = String(err.message || '') + ' ' + String(err.sourceError?.message || '');
  return /\bHTTP status 402\b|exceeded the quota|quota exceeded/i.test(msg);
}

/**
 * Returns true when Neon / Postgres cannot be reached due to quota suspension or network failure.
 */
export function isDatabaseUnavailableError(err) {
  if (!err) return false;
  if (isDatabaseQuotaError(err)) return true;
  const code = String(err.code || err.sourceError?.code || err.sourceError?.cause?.code || '');
  if (/^(ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN)$/.test(code)) return true;
  const msg = String(err.message || '');
  return /DATABASE_URL is not set|Error connecting to database|fetch failed|connect ECONN/i.test(msg);
}

/**
 * Returns true when PostgreSQL reports a missing table/relation (42P01) or column (42703),
 * or an error message indicating a relation/column/table "does not exist".
 */
export function isMissingSchemaError(err) {
  if (!err) return false;
  const code = String(err.code || '');
  if (code === '42P01' || code === '42703') return true;
  const msg = String(err.message || '');
  return /\b(relation|column|table)\b.+does not exist/i.test(msg);
}

/**
 * Returns true when an error originated from PostgreSQL / Neon so raw SQL or driver
 * internals are never leaked to the browser UI.
 */
export function isDatabaseError(err) {
  if (!err) return false;
  if (isMissingSchemaError(err)) return true;
  if (err.name === 'NeonDbError') return true;
  if (typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code)) return true;
  if (err.severity !== undefined || err.routine !== undefined) return true;
  const msg = String(err.message || '');
  return /NeonDbError|Error connecting to database|syntax error at or near|violates (check|foreign key|unique|not-null) constraint|invalid input syntax for type|value too long for type|null value in column/i.test(
    msg
  );
}

/**
 * Logs full error details server-side and sends a safe, friendly JSON error response.
 * - 42P01 / 42703 ("does not exist") -> logs and returns 503 with:
 *   "This feature needs a database update — ask to apply migrations."
 * - 23514 (outdated CHECK constraint from pending migration) -> logs and returns 503 with:
 *   "This feature needs a database update — ask to apply migrations."
 * - Any other database or unexpected server error -> logs and returns 500 with fallbackMessage
 *   (never exposing raw Postgres error messages to the UI).
 */
export function sendSafeApiError(
  res,
  err,
  context = 'API Error',
  fallbackMessage = 'Something went wrong while processing your request. Please try again.'
) {
  if (isMissingSchemaError(err) || err?.code === '23514') {
    console.error(`[DB Schema Update Needed] ${context}:`, {
      code: err?.code,
      message: err?.message,
      table: err?.table,
      column: err?.column,
      constraint: err?.constraint
    });
    return res.status(503).json({
      error: MIGRATION_UPDATE_MESSAGE,
      migrationPending: true
    });
  }

  console.error(`${context}:`, err);

  if (isDatabaseQuotaError(err)) {
    return res.status(503).json({
      error: NEON_QUOTA_MESSAGE,
      databaseQuotaExceeded: true
    });
  }

  if (err?.code === '57014' || /statement_timeout/i.test(String(err?.message || ''))) {
    return res.status(504).json({
      error: 'The query timed out. Please refine your filters and try again.',
      timeout: true
    });
  }

  return res.status(500).json({ error: fallbackMessage });
}
