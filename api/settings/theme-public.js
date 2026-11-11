import { getDb } from '../_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT colors, fonts, apply_to_login
      FROM portal_theme
      WHERE apply_to_login = true
      ORDER BY updated_at DESC
      LIMIT 1;
    `;

    if (rows.length === 0) {
      return res.status(200).json({ apply_to_login: false });
    }

    const row = rows[0];
    // Return strictly colors and fonts — no email or identifiable user data
    return res.status(200).json({
      apply_to_login: Boolean(row.apply_to_login),
      colors: row.colors || null,
      fonts: row.fonts || null
    });
  } catch (error) {
    if (error.message && (error.message.includes('relation "portal_theme" does not exist') || error.code === '42P01')) {
      return res.status(200).json({ apply_to_login: false });
    }
    console.error('Error in /api/settings/theme-public:', error);
    return res.status(200).json({ apply_to_login: false });
  }
}
