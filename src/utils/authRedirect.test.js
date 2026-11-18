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
import { isSecureRequest } from '../../api/_lib/session.js';
import { HOME_CONTENT } from '../content/home.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('Auth redirect helpers allow ONLY internal /admin paths and default to /admin', () => {
  assert.equal(DEFAULT_POST_LOGIN_PATH, '/admin');

  // Allowed internal /admin destinations
  assert.equal(isAllowedAdminPath('/admin'), true);
  assert.equal(isAllowedAdminPath('/admin?tab=investor'), true);
  assert.equal(isAllowedAdminPath('/admin/investor/report/123?analysis=456'), true);

  // Blocked open redirects, public routes, and prefix spoofs
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

  // ?next= round-trip for /admin?tab=investor
  const loginUrl = buildLoginPath('/admin?tab=investor');
  assert.equal(loginUrl, '/login?next=%2Fadmin%3Ftab%3Dinvestor');
  const search = loginUrl.split('?')[1];
  assert.equal(extractValidatedAdminNext(search), '/admin?tab=investor');
  assert.equal(resolvePostLoginDestination(search), '/admin?tab=investor');

  // Plain homepage login has no ?next= and lands on /admin
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

test('Homepage header config exposes STUDIO -> /admin when authenticated, Login imports home.css, and magic link redirects to /admin', () => {
  assert.equal(HOME_CONTENT.header.login.label, 'LOG IN');
  assert.equal(HOME_CONTENT.header.login.href, '/login');
  assert.equal(HOME_CONTENT.header.studio.label, 'STUDIO →');
  assert.equal(HOME_CONTENT.header.studio.href, '/admin');
  assert.equal(HOME_CONTENT.header.studio.route, 'admin');

  const loginSrc = fs.readFileSync(path.resolve(__dirname, '../pages/Login.jsx'), 'utf8');
  assert.equal(loginSrc.includes("import '../styles/home.css'"), true);

  const verifyMagicSrc = fs.readFileSync(
    path.resolve(__dirname, '../../api/verify-magic-link.js'),
    'utf8'
  );
  assert.equal(verifyMagicSrc.includes("'/dashboard'"), false);
  assert.equal(verifyMagicSrc.includes('sanitizeAdminNextPath'), true);
});
