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
  NEON_QUOTA_MESSAGE,
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

test('Neon HTTP 402 quota errors map to friendly 503 NEON_QUOTA_MESSAGE and [SENSITIVE] placeholders are ignored', () => {
  const quotaErr = new Error(
    'Server error (HTTP status 402): {"message":"Your account or project has exceeded the quota. Upgrade your plan to increase limits."}'
  );
  assert.equal(isDatabaseQuotaError(quotaErr), true);

  const res = createMockRes();
  sendSafeApiError(res, quotaErr, 'Test quota error');
  assert.equal(res.statusCode, 503);
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
    DATABASE_URL: process.env.DATABASE_URL,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    AUTH_SECRET: process.env.AUTH_SECRET
  };

  try {
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
