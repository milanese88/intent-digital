import postgres from 'postgres';

export const MIGRATION_UPDATE_MESSAGE =
  'This feature needs a database update — ask to apply migrations.';

export const NEON_QUOTA_MESSAGE =
  'Database quota exceeded (storage or compute limit reached). Upgrade your database plan or free up space.';

// Cache serverless client per URL within a warm lambda / dev process (max: 1 connection)
const appClientCache = new Map();

function cleanUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '[SENSITIVE]') return '';
  return trimmed;
}

/**
 * Attaches backward-compatible adapters onto a postgres.js sql / transaction tag:
 * - sql.query(text, params?) -> sql.unsafe(text, params)
 * - sql.transaction(fnOrArray) -> sql.begin(...)
 */
export function attachSqlAdapters(sql) {
  if (!sql || sql._intentAdaptersAttached) return sql;

  sql.query = (text, params = []) => {
    if (Array.isArray(params) && params.length > 0) {
      return sql.unsafe(text, params);
    }
    return sql.unsafe(text);
  };

  if (typeof sql.begin === 'function') {
    sql.transaction = async (queriesOrFn) => {
      if (typeof queriesOrFn === 'function') {
        return sql.begin(async (tx) => {
          attachSqlAdapters(tx);
          const res = await queriesOrFn(tx);
          if (Array.isArray(res)) {
            return Promise.all(res);
          }
          return res;
        });
      }
      if (Array.isArray(queriesOrFn)) {
        return sql.begin(async () => {
          const results = [];
          for (const q of queriesOrFn) {
            results.push(await q);
          }
          return results;
        });
      }
      throw new Error('sql.transaction() expects a callback or an array of queries.');
    };
  }

  Object.defineProperty(sql, '_intentAdaptersAttached', {
    value: true,
    enumerable: false,
    configurable: true
  });

  return sql;
}

/**
 * Creates a configured postgres.js client with adapters attached.
 * - mode === 'app': Supabase Transaction Pooler (port 6543), prepare: false, max: 1, idle_timeout: 20s, ssl: 'require'
 * - mode === 'script': Supabase Session Pooler (port 5432), max: 2, idle_timeout: 2s (auto-allows CLI exit), ssl: 'require'
 */
export function createPostgresClient(connectionString, { mode = 'app', max, idleTimeout } = {}) {
  const url = cleanUrl(connectionString);
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  const isScript = mode === 'script';
  const sql = postgres(url, {
    prepare: false,
    max: max ?? (isScript ? 2 : 1),
    max_pipeline: 1,
    idle_timeout: idleTimeout ?? (isScript ? 2 : 20),
    connect_timeout: isScript ? 30 : 15,
    ssl: 'require',
    fetch_types: false,
    transform: { undefined: null },
    onnotice: () => {}
  });

  return attachSqlAdapters(sql);
}

/**
 * Shared serverless / API database client using DATABASE_URL (Supabase Transaction Pooler, port 6543).
 */
export function getDb() {
  const databaseUrl = cleanUrl(process.env.DATABASE_URL);
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  let client = appClientCache.get(databaseUrl);
  if (!client) {
    client = createPostgresClient(databaseUrl, { mode: 'app' });
    appClientCache.set(databaseUrl, client);
  }
  return client;
}

/**
 * Resolves the Session Pooler connection string (port 5432) for CLI scripts, migrations, and bulk imports.
 */
export function resolveScriptDatabaseUrl(explicitUrl) {
  const explicit = cleanUrl(explicitUrl);
  const sessionUrl = cleanUrl(process.env.SUPABASE_DATABASE_URL);
  const fallbackUrl = cleanUrl(process.env.DATABASE_URL);

  // Always prefer SUPABASE_DATABASE_URL (port 5432 session pooler) for scripts unless an explicit non-default URL was passed
  if (explicit && explicit !== fallbackUrl) {
    return explicit;
  }
  return sessionUrl || explicit || fallbackUrl;
}

/**
 * Creates a Session Pooler client (port 5432) for CLI scripts and migrations.
 */
export function getScriptDb(explicitUrl, opts = {}) {
  const url = resolveScriptDatabaseUrl(explicitUrl);
  if (!url) {
    throw new Error('SUPABASE_DATABASE_URL (or DATABASE_URL) is not set');
  }
  return createPostgresClient(url, { mode: 'script', ...opts });
}

function wrapQueryResult(res) {
  const rows = Array.from(res);
  const rowCount = typeof res?.count === 'number' ? res.count : rows.length;
  return { rows, rowCount };
}

/**
 * Pool/Client-compatible adapter backed by postgres.js on the Session Pooler (port 5432)
 * for bulk county import & VACUUM scripts (.query, .connect, client.release, .end).
 */
export function createScriptPool(explicitUrl) {
  const sql = getScriptDb(explicitUrl, { max: 4, idleTimeout: 5 });

  return {
    async query(text, values = []) {
      const res =
        Array.isArray(values) && values.length > 0
          ? await sql.unsafe(text, values)
          : await sql.unsafe(text);
      return wrapQueryResult(res);
    },
    async connect() {
      const reserved = await sql.reserve();
      return {
        async query(text, values = []) {
          const res =
            Array.isArray(values) && values.length > 0
              ? await reserved.unsafe(text, values)
              : await reserved.unsafe(text);
          return wrapQueryResult(res);
        },
        release() {
          reserved.release();
        }
      };
    },
    async end() {
      await sql.end({ timeout: 5 });
    }
  };
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
 * Returns true when the database provider rejects queries due to plan quota limits.
 */
export function isDatabaseQuotaError(err) {
  if (!err) return false;
  const msg = String(err.message || '') + ' ' + String(err.sourceError?.message || '');
  return /\bHTTP status 402\b|exceeded the quota|quota exceeded/i.test(msg);
}

/**
 * Returns true when Postgres cannot be reached due to quota suspension or network/socket failure.
 */
export function isDatabaseUnavailableError(err) {
  if (!err) return false;
  if (isDatabaseQuotaError(err)) return true;
  const code = String(err.code || err.sourceError?.code || err.sourceError?.cause?.code || '');
  if (/^(ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN|CONNECT_TIMEOUT|CONNECTION_ENDED|CONNECTION_CLOSED|57P01|57P03|08006|08001)$/.test(code)) {
    return true;
  }
  const msg = String(err.message || '');
  return /DATABASE_URL is not set|Error connecting to database|fetch failed|connect ECONN|write CONNECT_TIMEOUT/i.test(msg);
}

/**
 * Returns true when an error originated from PostgreSQL so raw SQL or driver
 * internals are never leaked to the browser UI.
 */
export function isDatabaseError(err) {
  if (!err) return false;
  if (isMissingSchemaError(err)) return true;
  if (err.name === 'PostgresError' || err.name === 'NeonDbError') return true;
  if (typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code)) return true;
  if (err.severity !== undefined || err.routine !== undefined) return true;
  const msg = String(err.message || '');
  return /PostgresError|NeonDbError|Error connecting to database|syntax error at or near|violates (check|foreign key|unique|not-null) constraint|invalid input syntax for type|value too long for type|null value in column/i.test(
    msg
  );
}

/**
 * Logs full error details server-side and sends a safe, friendly JSON error response.
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
      table: err?.table || err?.table_name,
      column: err?.column || err?.column_name,
      constraint: err?.constraint || err?.constraint_name
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
