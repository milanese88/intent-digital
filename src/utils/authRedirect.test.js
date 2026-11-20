import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_POST_LOGIN_PATH,
  isAllowedAdminPath,
  sanitizeAdminNextPath,
  extractValidatedAdminNext,
  resolvePostLoginDestination,
  buildLoginPath
} from './authRedirect.js';
import {
  getCleanEnv,
  isSecureRequest,
  verifyStatelessSessionToken
} from '../../api/_lib/session.js';
import {
  DATABASE_QUOTA_MESSAGE,
  NEON_QUOTA_MESSAGE,
  attachSqlAdapters,
  validateDatabaseUrl,
  formatSafeDbError,
  resolveAppDatabaseUrl,
  resolveScriptDatabaseUrl,
  isDatabaseError,
  isDatabaseQuotaError,
  sendSafeApiError
} from '../../api/_lib/db.js';
import loginHandler from '../../api/login.js';
import verifyHandler from '../../api/verify.js';
import logoutHandler from '../../api/logout.js';
import { HOME_CONTENT } from '../content/home.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createMockRes() {
  const headers = {};
  return {
    statusCode: 200,
    headers,
    body: null,
    setHeader(k, v) {
      headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test('Auth redirect helpers allow ONLY internal /admin paths and default to /admin', () => {
  assert.equal(DEFAULT_POST_LOGIN_PATH, '/admin');

  assert.equal(isAllowedAdminPath('/admin'), true);
  assert.equal(isAllowedAdminPath('/admin?tab=investor'), true);
  assert.equal(isAllowedAdminPath('/admin/investor/report/123?analysis=456'), true);

  for (const blocked of [
    '',
    '/',
    '/dashboard',
    '/news',
    '/?route=services',
    '/admin-phish',
    '//evil.example/admin',
    'https://evil.example/admin',
    '/admin\\@evil.example',
    'javascript:alert(1)'
  ]) {
    assert.equal(isAllowedAdminPath(blocked), false, `Expected ${blocked} to be rejected`);
    assert.equal(sanitizeAdminNextPath(blocked), '/admin');
  }

  const loginUrl = buildLoginPath('/admin?tab=investor');
  assert.equal(loginUrl, '/login?next=%2Fadmin%3Ftab%3Dinvestor');
  const search = loginUrl.split('?')[1];
  assert.equal(extractValidatedAdminNext(search), '/admin?tab=investor');
  assert.equal(resolvePostLoginDestination(search), '/admin?tab=investor');

  assert.equal(buildLoginPath('/'), '/login');
  assert.equal(resolvePostLoginDestination(''), '/admin');
  assert.equal(resolvePostLoginDestination('?next=%2Fnews'), '/admin');
});

test('Cookie secure flag works on Vercel preview (*.vercel.app), production, and localhost', () => {
  assert.equal(
    isSecureRequest({
      headers: {
        host: 'intent-digital-git-feature-milanese.vercel.app',
        'x-forwarded-proto': 'https'
      }
    }),
    true
  );

  assert.equal(
    isSecureRequest({
      headers: {
        host: 'localhost:5173',
        'x-forwarded-proto': 'http'
      }
    }),
    false
  );
});

test('Homepage header config exposes STUDIO -> /admin when authenticated, Login distinguishes 503 vs 401, and magic link redirects to /admin', () => {
  assert.equal(HOME_CONTENT.header.login.label, 'LOG IN');
  assert.equal(HOME_CONTENT.header.login.href, '/login');
  assert.equal(HOME_CONTENT.header.studio.label, 'STUDIO →');
  assert.equal(HOME_CONTENT.header.studio.href, '/admin');
  assert.equal(HOME_CONTENT.header.studio.route, 'admin');

  const loginSrc = fs.readFileSync(path.resolve(__dirname, '../pages/Login.jsx'), 'utf8');
  assert.equal(loginSrc.includes("import '../styles/home.css'"), true);
  assert.equal(loginSrc.includes('res.status === 401'), true);
  assert.equal(loginSrc.includes('res.status === 503'), true);

  const verifyMagicSrc = fs.readFileSync(
    path.resolve(__dirname, '../../api/verify-magic-link.js'),
    'utf8'
  );
  assert.equal(verifyMagicSrc.includes("'/dashboard'"), false);
  assert.equal(verifyMagicSrc.includes('sanitizeAdminNextPath'), true);
});

test('Database HTTP 402 quota errors map to friendly 503 DATABASE_QUOTA_MESSAGE and [SENSITIVE] placeholders are ignored', () => {
  const quotaErr = new Error(
    'Server error (HTTP status 402): {"message":"Your account or project has exceeded the quota. Upgrade your plan to increase limits."}'
  );
  assert.equal(isDatabaseQuotaError(quotaErr), true);

  const res = createMockRes();
  sendSafeApiError(res, quotaErr, 'Test quota error');
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, DATABASE_QUOTA_MESSAGE);
  assert.equal(res.body.error, NEON_QUOTA_MESSAGE);
  assert.equal(res.body.databaseQuotaExceeded, true);

  const prevAuthSecret = process.env.AUTH_SECRET;
  try {
    process.env.AUTH_SECRET = '[SENSITIVE]';
    assert.equal(getCleanEnv('AUTH_SECRET'), '');
  } finally {
    if (prevAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = prevAuthSecret;
  }
});

test('Login -> Verify -> Logout round-trip succeeds with signed stateless session when DB is unavailable and rejects wrong credentials', async () => {
  const saved = {
    SUPABASE_POOLER_URL: process.env.SUPABASE_POOLER_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    AUTH_SECRET: process.env.AUTH_SECRET
  };

  try {
    process.env.SUPABASE_POOLER_URL = '[SENSITIVE]';
    process.env.DATABASE_URL = '[SENSITIVE]';
    process.env.ADMIN_EMAIL = 'owner-test@example.com';
    process.env.ADMIN_PASSWORD = 'correct-horse-battery-staple';
    delete process.env.AUTH_SECRET;

    // 1. Wrong password -> 401 and no Set-Cookie
    const badRes = createMockRes();
    await loginHandler(
      {
        method: 'POST',
        headers: { host: 'localhost:5173' },
        body: { email: 'owner-test@example.com', password: 'wrong-password' }
      },
      badRes
    );
    assert.equal(badRes.statusCode, 401);
    assert.equal(badRes.headers['Set-Cookie'], undefined);

    // 2. Correct owner credentials -> 200 + signed st1 cookie
    const okRes = createMockRes();
    await loginHandler(
      {
        method: 'POST',
        headers: { host: 'localhost:5173' },
        body: { email: '  OWNER-TEST@example.com ', password: 'correct-horse-battery-staple' }
      },
      okRes
    );
    assert.equal(okRes.statusCode, 200);
    assert.equal(okRes.body.success, true);
    assert.equal(okRes.body.sessionMode, 'stateless');
    const setCookie = okRes.headers['Set-Cookie'];
    assert.ok(setCookie && setCookie.includes('auth_session=st1.'));
    assert.ok(setCookie.includes('HttpOnly'));

    const cookiePair = setCookie.split(';')[0];

    // 3. GET /api/verify recognizes the signed cookie without hitting DB
    const verifyRes = createMockRes();
    await verifyHandler(
      {
        method: 'GET',
        headers: { host: 'localhost:5173', cookie: cookiePair }
      },
      verifyRes
    );
    assert.equal(verifyRes.statusCode, 200);
    assert.equal(verifyRes.body.loggedIn, true);
    assert.equal(verifyRes.body.user.email, 'owner-test@example.com');

    // 4. Tampered signature -> rejected
    const rawToken = cookiePair.replace(/^auth_session=/, '');
    const tampered = `${rawToken.slice(0, -4)}AAAA`;
    assert.equal(verifyStatelessSessionToken(tampered), null);

    // 5. POST /api/logout clears cookie
    const logoutRes = createMockRes();
    await logoutHandler(
      {
        method: 'POST',
        headers: { host: 'localhost:5173', cookie: cookiePair }
      },
      logoutRes
    );
    assert.equal(logoutRes.statusCode, 200);
    assert.ok(logoutRes.headers['Set-Cookie'].includes('Max-Age=-1'));

    // 6. When env credentials are NOT set and DB is unavailable, login returns 503 (never misleading 401)
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    const unreachRes = createMockRes();
    await loginHandler(
      {
        method: 'POST',
        headers: { host: 'localhost:5173' },
        body: { email: 'owner-test@example.com', password: 'correct-horse-battery-staple' }
      },
      unreachRes
    );
    assert.equal(unreachRes.statusCode, 503);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('postgres.js shared client adapters preserve sql.query, sql.transaction, session-pooler script routing, and PostgresError classification', async () => {
  const calls = [];
  const fakeSql = Object.assign(
    (strings, ...vals) => Promise.resolve([{ tpl: strings.join('?'), vals }]),
    {
      unsafe(text, params) {
        calls.push({ text, params });
        return Promise.resolve([{ ok: true }]);
      },
      async begin(fn) {
        const tx = Object.assign(
          (strings, ...vals) => Promise.resolve({ txSql: strings.join('?'), vals }),
          { unsafe: fakeSql.unsafe }
        );
        return fn(tx);
      }
    }
  );

  attachSqlAdapters(fakeSql);
  await fakeSql.query('SELECT 1');
  await fakeSql.query('SELECT $1::int', [42]);
  assert.deepEqual(calls, [
    { text: 'SELECT 1', params: undefined },
    { text: 'SELECT $1::int', params: [42] }
  ]);

  const txOut = await fakeSql.transaction((tx) => [tx`UPDATE a SET x = ${1}`, tx`UPDATE b SET y = ${2}`]);
  assert.equal(txOut.length, 2);

  // App URL routing prefers SUPABASE_POOLER_URL over legacy DATABASE_URL,
  // and script URL routing prefers SUPABASE_DATABASE_URL (5432) over both.
  const prevSupa = process.env.SUPABASE_DATABASE_URL;
  const prevPooler = process.env.SUPABASE_POOLER_URL;
  const prevDb = process.env.DATABASE_URL;
  try {
    process.env.SUPABASE_DATABASE_URL = 'postgresql://u:p@example.pooler:5432/postgres';
    process.env.SUPABASE_POOLER_URL = 'postgresql://u:p@example.pooler:6543/postgres';
    process.env.DATABASE_URL = 'postgresql://u:p@legacy-db.example:5432/postgres';
    assert.equal(resolveAppDatabaseUrl(), 'postgresql://u:p@example.pooler:6543/postgres');
    assert.ok(resolveScriptDatabaseUrl().includes(':5432/'));
    assert.ok(resolveScriptDatabaseUrl(process.env.DATABASE_URL).includes(':5432/'));
    assert.ok(resolveScriptDatabaseUrl(process.env.SUPABASE_POOLER_URL).includes(':5432/'));
  } finally {
    if (prevSupa === undefined) delete process.env.SUPABASE_DATABASE_URL;
    else process.env.SUPABASE_DATABASE_URL = prevSupa;
    if (prevPooler === undefined) delete process.env.SUPABASE_POOLER_URL;
    else process.env.SUPABASE_POOLER_URL = prevPooler;
    if (prevDb === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDb;
  }

  const pgErr = Object.assign(new Error('duplicate key value'), { name: 'PostgresError', code: '23505' });
  assert.equal(isDatabaseError(pgErr), true);
});

test('validateDatabaseUrl catches Vercel paste mistakes without false positives and formatSafeDbError never leaks secrets', () => {
  // Valid URIs (including ?sslmode=require query params and "=" inside password)
  assert.equal(
    validateDatabaseUrl(
      'postgresql://postgres.ref:pass=word==@example.pooler:6543/postgres?sslmode=require&pgbouncer=true',
      'SUPABASE_POOLER_URL'
    ).valid,
    true
  );

  // Wrapped in DATABASE_URL="..."
  const prefixCheck = validateDatabaseUrl(
    'DATABASE_URL="postgresql://postgres.ref:secret123@example.pooler:6543/postgres"',
    'SUPABASE_POOLER_URL'
  );
  assert.equal(prefixCheck.valid, false);
  assert.equal(prefixCheck.code, 'INVALID_DATABASE_URL');
  assert.equal(prefixCheck.detectedPrefix, 'DATABASE_URL=');
  assert.ok(prefixCheck.reason.includes('DATABASE_URL='));
  assert.equal(prefixCheck.reason.includes('secret123'), false);

  // Wrapped in SUPABASE_POOLER_URL=...
  const supaPrefixCheck = validateDatabaseUrl(
    'SUPABASE_POOLER_URL=postgresql://postgres.ref:secret123@example.pooler:6543/postgres',
    'SUPABASE_POOLER_URL'
  );
  assert.equal(supaPrefixCheck.valid, false);
  assert.equal(supaPrefixCheck.detectedPrefix, 'SUPABASE_POOLER_URL=');
  assert.ok(supaPrefixCheck.reason.includes('SUPABASE_POOLER_URL='));

  // Wrapped in quotes — safePrefix stops at "://" before credentials
  const quoteCheck = validateDatabaseUrl(
    '"postgresql://postgres.ref:secret123@example.pooler:6543/postgres"',
    'SUPABASE_POOLER_URL'
  );
  assert.equal(quoteCheck.valid, false);
  assert.ok(quoteCheck.reason.includes('quote'));
  assert.equal(quoteCheck.reason.includes('secret123'), false);
  assert.equal(quoteCheck.reason.includes('postgres.ref'), false);

  // Missing scheme with user:pass omits prefix completely
  const bareCredCheck = validateDatabaseUrl('user:secret123@host:6543/db', 'SUPABASE_POOLER_URL');
  assert.equal(bareCredCheck.valid, false);
  assert.equal(bareCredCheck.safePrefix, '(omitted)');
  assert.equal(bareCredCheck.reason.includes('secret123'), false);

  // Trailing newline / whitespace
  const spaceCheck = validateDatabaseUrl(
    'postgresql://postgres.ref:secret123@example.pooler:6543/postgres\n',
    'SUPABASE_POOLER_URL'
  );
  assert.equal(spaceCheck.valid, false);
  assert.ok(spaceCheck.reason.includes('whitespace'));

  // Wrong scheme
  const schemeCheck = validateDatabaseUrl('https://example.supabase.co', 'SUPABASE_POOLER_URL');
  assert.equal(schemeCheck.valid, false);
  assert.ok(schemeCheck.reason.includes('postgresql://'));

  // Safe error formatting scrubs secrets while keeping code + message
  const prevPooler = process.env.SUPABASE_POOLER_URL;
  try {
    process.env.SUPABASE_POOLER_URL = 'postgresql://postgres.myref:mySuperSecretPass@myhost.pooler:6543/postgres';
    const authErr = Object.assign(
      new Error('password authentication failed for user "postgres" at postgresql://postgres.myref:mySuperSecretPass@myhost.pooler:6543/postgres'),
      { code: '28P01' }
    );
    const diag = formatSafeDbError(authErr);
    assert.equal(diag.code, '28P01');
    assert.equal(diag.source, 'SUPABASE_POOLER_URL');
    assert.equal(diag.message.includes('mySuperSecretPass'), false);
    assert.equal(diag.message.includes('myhost.pooler'), false);
    assert.ok(diag.message.includes('password authentication failed'));
  } finally {
    if (prevPooler === undefined) delete process.env.SUPABASE_POOLER_URL;
    else process.env.SUPABASE_POOLER_URL = prevPooler;
  }
});
