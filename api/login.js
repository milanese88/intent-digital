import bcrypt from 'bcryptjs';
import {
  getDb,
  DATABASE_QUOTA_MESSAGE,
  formatSafeDbError,
  isMissingSchemaError,
  isDatabaseQuotaError,
  isDatabaseUnavailableError
} from './_lib/db.js';
import {
  createSession,
  createStatelessSession,
  getSessionSigningSecret,
  verifyOwnerEnvCredentials
} from './_lib/session.js';

function parseBody(req) {
  if (!req?.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { email, password } = parseBody(req);

  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password required.' });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const sql = getDb();

    const users = await sql`
      SELECT id, email, username, full_name, password_hash
      FROM admin_user
      WHERE lower(email) = ${cleanEmail}
      LIMIT 1
    `;

    if (users.length === 0) {
      const countRows = await sql`SELECT count(*)::int AS count FROM admin_user`;
      if (!countRows[0]?.count) {
        const envCheck = verifyOwnerEnvCredentials(cleanEmail, password);
        if (envCheck.configured && getSessionSigningSecret()) {
          if (!envCheck.valid) {
            return res.status(401).json({ error: 'Wrong credentials. Please try again.' });
          }
          createStatelessSession({ email: cleanEmail }, res, req);
          return res.status(200).json({ success: true, sessionMode: 'stateless' });
        }
        return res.status(500).json({ error: 'No admin account has been seeded yet.' });
      }
      return res.status(401).json({ error: 'Wrong credentials. Please try again.' });
    }

    const user = users[0];
    const isValid = user.password_hash
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    if (!isValid) {
      return res.status(401).json({ error: 'Wrong credentials. Please try again.' });
    }

    try {
      await createSession(user.id, res, req);
      return res.status(200).json({ success: true });
    } catch (sessionErr) {
      if (isDatabaseUnavailableError(sessionErr) && getSessionSigningSecret()) {
        const sDiag = formatSafeDbError(sessionErr);
        console.warn(
          `[DB Login Warning] Session insert unavailable (code=${sDiag.code} source=${sDiag.source}): "${sDiag.message}"`
        );
        createStatelessSession(user, res, req);
        return res.status(200).json({
          success: true,
          sessionMode: 'stateless',
          databaseQuotaExceeded: isDatabaseQuotaError(sessionErr)
        });
      }
      throw sessionErr;
    }
  } catch (error) {
    const diag = formatSafeDbError(error);
    console.error(
      `[DB Login Error] code=${diag.code} source=${diag.source} message="${diag.message}"`
    );

    if (isDatabaseUnavailableError(error) || isMissingSchemaError(error)) {
      const envCheck = verifyOwnerEnvCredentials(cleanEmail, password);
      if (envCheck.configured && getSessionSigningSecret()) {
        if (!envCheck.valid) {
          return res.status(401).json({ error: 'Wrong credentials. Please try again.' });
        }
        createStatelessSession({ email: cleanEmail }, res, req);
        return res.status(200).json({
          success: true,
          sessionMode: 'stateless',
          databaseQuotaExceeded: isDatabaseQuotaError(error)
        });
      }

      if (isDatabaseQuotaError(error)) {
        return res.status(503).json({
          error: DATABASE_QUOTA_MESSAGE,
          databaseQuotaExceeded: true
        });
      }

      return res.status(503).json({
        error: 'Database is temporarily unreachable. Please check your database status and try again.'
      });
    }

    return res.status(500).json({ error: 'Server error during login.' });
  }
}
