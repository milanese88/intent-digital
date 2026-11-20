import postgres from 'postgres';

export const MIGRATION_UPDATE_MESSAGE =
  'This feature needs a database update — ask to apply migrations.';

export const NEON_QUOTA_MESSAGE =
  'Database quota exceeded (storage or compute limit reached). Upgrade your database plan or free up space.';

// Cache serverless client per URL within a warm lambda / dev process (max: 1 connection)
const appClientCache = new Map();

function isUnsetOrPlaceholder(raw) {
  if (!raw || typeof raw !== 'string') return true;
  const trimmed = raw.trim();
  return !trimmed || trimmed === '[SENSITIVE]';
}

/**
 * Validates a PostgreSQL connection string without ever echoing the URL, host, user, or password.
 * Catches common Vercel Environment Variable paste mistakes:
 * - surrounding quotes ("..." or '...')
 * - leading/trailing/internal whitespace or newlines
 * - KEY= prefix (e.g. DATABASE_URL=... or SUPABASE_POOLER_URL=...)
 * - [YOUR-PASSWORD] placeholder
 * - wrong scheme (not postgresql:// or postgres://)
 * - unencoded special characters breaking URL parsing
 */
export function validateDatabaseUrl(raw, envVarName = 'DATABASE_URL') {
  if (isUnsetOrPlaceholder(raw)) {
    return {
      valid: false,
      empty: true,
      code: 'MISSING_DATABASE_URL',
      reason: `${envVarName} is not set`
    };
  }

  const str = String(raw);

  if (/^\s*[A-Z0-9_]*DATABASE[A-Z0-9_]*URL\s*=|^\s*SUPABASE_[A-Z0-9_]*URL\s*=|\bDATABASE_URL\s*=/i.test(str)) {
    return {
      valid: false,
      empty: false,
      code: 'INVALID_DATABASE_URL',
      reason: 'contains a KEY= assignment prefix (paste only the raw postgresql://... URI value)'
    };
  }

  if (/["'`]/.test(str)) {
    return {
      valid: false,
      empty: false,
      code: 'INVALID_DATABASE_URL',
      reason: 'contains quote characters (remove surrounding "..." or \'...\' quotes in Vercel)'
    };
  }

  if (/\s/.test(str)) {
    return {
      valid: false,
      empty: false,
      code: 'INVALID_DATABASE_URL',
      reason: 'contains whitespace or newline characters'
    };
  }

  if (/\[YOUR[-_A-Z]*PASSWORD\]/i.test(str)) {
    return {
      valid: false,
      empty: false,
      code: 'INVALID_DATABASE_URL',
      reason: 'still contains the [YOUR-PASSWORD] placeholder'
    };
  }

  if (!/^postgres(?:ql)?:\/\//i.test(str)) {
    return {
      valid: false,
      empty: false,
      code: 'INVALID_DATABASE_URL',
      reason: 'must start with postgresql:// or postgres://'
    };
  }

  try {
    const parsed = new URL(str);
    if (!parsed.hostname) {
      return {
        valid: false,
        empty: false,
        code: 'INVALID_DATABASE_URL',
        reason: 'missing database hostname in URI'
      };
    }
    if (!parsed.username) {
      return {
        valid: false,
        empty: false,
        code: 'INVALID_DATABASE_URL',
        reason: 'missing database username in URI'
      };
    }
  } catch {
    return {
      valid: false,
      empty: false,
      code: 'INVALID_DATABASE_URL',
      reason: 'malformed URI (percent-encode special characters like @, #, %, or : in password)'
    };
  }

  return { valid: true, empty: false, code: null, reason: null };
}

function assertValidDatabaseUrl(raw, envVarName = 'DATABASE_URL') {
  const check = validateDatabaseUrl(raw, envVarName);
  if (check.empty) {
    const err = new Error('DATABASE_URL is not set');
    err.code = 'MISSING_DATABASE_URL';
    throw err;
  }
  if (!check.valid) {
    console.error(`[DB Config Error] Invalid ${envVarName} (code=${check.code}): ${check.reason}`);
    const err = new Error(`Invalid ${envVarName}: ${check.reason}`);
    err.code = check.code;
    err.envVar = envVarName;
    throw err;
  }
  return String(raw);
}

/**
 * Scrubs connection strings, hosts, usernames, and passwords from any error string
 * so logs only ever contain safe error codes and messages.
 */
export function scrubDbMessage(rawMsg) {
  if (!rawMsg) return 'Unknown database error';
  let msg = String(rawMsg);

  for (const key of [
    'SUPABASE_POOLER_URL',
    'SUPABASE_DATABASE_URL',
    'DATABASE_URL',
    'NEON_DATABASE_URL'
  ]) {
    const val = process.env[key];
    if (val && typeof val === 'string' && val.trim() && val.trim() !== '[SENSITIVE]') {
      msg = msg.split(val).join('[REDACTED_URL]');
      msg = msg.split(val.trim()).join('[REDACTED_URL]');
      try {
        const cleaned = val.trim().replace(/^["']|["']$/g, '');
        const u = new URL(cleaned);
        if (u.password) {
          msg = msg.split(u.password).join('[REDACTED]');
          msg = msg.split(decodeURIComponent(u.password)).join('[REDACTED]');
        }
        if (u.hostname) {
          msg = msg.split(u.hostname).join('[DB_HOST]');
        }
        if (u.username && u.username !== 'postgres') {
          msg = msg.split(u.username).join('[DB_USER]');
        }
      } catch {
        // ignore unparseable env value
      }
    }
  }

  msg = msg.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[REDACTED_URL]');
  return msg;
}

/**
 * Extracts only the safe error code, active env var name, and scrubbed message for server logs.
 */
export function formatSafeDbError(err) {
  const source = !isUnsetOrPlaceholder(process.env.SUPABASE_POOLER_URL)
    ? 'SUPABASE_POOLER_URL'
    : !isUnsetOrPlaceholder(process.env.DATABASE_URL)
      ? 'DATABASE_URL'
      : 'NONE';
  const code = String(
    err?.code || err?.errno || err?.sourceError?.code || err?.cause?.code || 'UNKNOWN'
  );
  const message = scrubDbMessage(err?.message || 'Unknown database error');
  return { source, code, message };
}

// Run non-throwing cold-start validation so Vercel Logs immediately surface malformed env vars
(function validateConfiguredDatabaseUrlOnStartup() {
  const source = !isUnsetOrPlaceholder(process.env.SUPABASE_POOLER_URL)
    ? 'SUPABASE_POOLER_URL'
    : !isUnsetOrPlaceholder(process.env.DATABASE_URL)
      ? 'DATABASE_URL'
      : null;
  if (!source) return;
  const check = validateDatabaseUrl(process.env[source], source);
  if (!check.valid && !check.empty) {
    console.error(`[DB Startup Check] Invalid ${source} (code=${check.code}): ${check.reason}`);
  }
})();

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
export function createPostgresClient(
  connectionString,
  { mode = 'app', max, idleTimeout, envVarName = 'DATABASE_URL' } = {}
) {
  const url = assertValidDatabaseUrl(connectionString, envVarName);

  const isScript = mode === 'script';
  const sql = postgres(url, {
    prepare: false,
    max: max ?? (isScript ? 2 : 1),
    max_pipeline: 1,
    idle_timeout: idleTimeout ?? (isScript ? 2 : 20),
    connect_timeout: isScript ? 30 : 15,
    ssl: 'require',
    channel_binding: 'prefer',
    fetch_types: false,
    transform: { undefined: null },
    onnotice: () => {}
  });

  return attachSqlAdapters(sql);
}

/**
 * Resolves the App/API database URL, preferring SUPABASE_POOLER_URL over DATABASE_URL
 * so Vercel's Neon-managed DATABASE_URL cannot override Supabase.
 */
export function resolveAppDatabaseUrl() {
  if (!isUnsetOrPlaceholder(process.env.SUPABASE_POOLER_URL)) {
    return process.env.SUPABASE_POOLER_URL;
  }
  if (!isUnsetOrPlaceholder(process.env.DATABASE_URL)) {
    return process.env.DATABASE_URL;
  }
  return '';
}

/**
 * Shared serverless / API database client using SUPABASE_POOLER_URL || DATABASE_URL
 * (Supabase Transaction Pooler, port 6543).
 */
export function getDb() {
  const hasPooler = !isUnsetOrPlaceholder(process.env.SUPABASE_POOLER_URL);
  const envVarName = hasPooler ? 'SUPABASE_POOLER_URL' : 'DATABASE_URL';
  const rawUrl = hasPooler ? process.env.SUPABASE_POOLER_URL : process.env.DATABASE_URL;

  const databaseUrl = assertValidDatabaseUrl(rawUrl, envVarName);

  let client = appClientCache.get(databaseUrl);
  if (!client) {
    client = createPostgresClient(databaseUrl, { mode: 'app', envVarName });
    appClientCache.set(databaseUrl, client);
  }
  return client;
}

/**
 * Resolves the Session Pooler connection string (port 5432) for CLI scripts, migrations, and bulk imports.
 */
export function resolveScriptDatabaseUrl(explicitUrl) {
  const explicit = !isUnsetOrPlaceholder(explicitUrl) ? String(explicitUrl).trim() : '';
  const sessionUrl = !isUnsetOrPlaceholder(process.env.SUPABASE_DATABASE_URL)
    ? String(process.env.SUPABASE_DATABASE_URL).trim()
    : '';
  const poolerUrl = !isUnsetOrPlaceholder(process.env.SUPABASE_POOLER_URL)
    ? String(process.env.SUPABASE_POOLER_URL).trim()
    : '';
  const fallbackUrl = !isUnsetOrPlaceholder(process.env.DATABASE_URL)
    ? String(process.env.DATABASE_URL).trim()
    : '';

  if (explicit && explicit !== fallbackUrl && explicit !== poolerUrl) {
    return explicit;
  }
  return sessionUrl || explicit || poolerUrl || fallbackUrl;
}

/**
 * Creates a Session Pooler client (port 5432) for CLI scripts and migrations.
 */
export function getScriptDb(explicitUrl, opts = {}) {
  const url = resolveScriptDatabaseUrl(explicitUrl);
  if (!url) {
    throw new Error('SUPABASE_DATABASE_URL (or DATABASE_URL) is not set');
  }
  return createPostgresClient(url, { mode: 'script', envVarName: 'SUPABASE_DATABASE_URL', ...opts });
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
  if (
    /^(MISSING_DATABASE_URL|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN|CONNECT_TIMEOUT|CONNECTION_ENDED|CONNECTION_CLOSED|57P01|57P03|08006|08001)$/.test(
      code
    )
  ) {
    return true;
  }
  const msg = String(err.message || '');
  return /DATABASE_URL is not set|Error connecting to database|fetch failed|connect ECONN|write CONNECT_TIMEOUT/i.test(
    msg
  );
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
 * Logs safe error code + message server-side (never URLs or passwords) and sends a friendly JSON response.
 */
export function sendSafeApiError(
  res,
  err,
  context = 'API Error',
  fallbackMessage = 'Something went wrong while processing your request. Please try again.'
) {
  const safeDiag = formatSafeDbError(err);

  if (isMissingSchemaError(err) || err?.code === '23514') {
    console.error(`[DB Schema Update Needed] ${context}:`, {
      code: safeDiag.code,
      source: safeDiag.source,
      message: safeDiag.message,
      table: err?.table || err?.table_name,
      column: err?.column || err?.column_name,
      constraint: err?.constraint || err?.constraint_name
    });
    return res.status(503).json({
      error: MIGRATION_UPDATE_MESSAGE,
      migrationPending: true
    });
  }

  console.error(
    `[DB Error] ${context}: code=${safeDiag.code} source=${safeDiag.source} message="${safeDiag.message}"`
  );

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
