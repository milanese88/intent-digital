import { getUserFromSession } from '../_lib/session.js';
import { getDb } from '../_lib/db.js';
import {
  DEFAULT_THEME_COLORS,
  DEFAULT_THEME_FONTS,
  ALLOWED_HEADING_FONTS,
  ALLOWED_BODY_FONTS,
  ALLOWED_LABEL_FONTS,
  ALLOWED_ACCENT_FONTS
} from '../../src/utils/themeFonts.js';
import { matchFontInList } from '../../src/config/fonts.js';
import { isValidHex, normalizeHex } from '../../src/utils/themeContrast.js';

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const cleanEmail = (user.email || '').trim().toLowerCase();
    const sql = getDb();

    // =========================================================================
    // GET: Retrieve the owner's active portal theme
    // =========================================================================
    if (req.method === 'GET') {
      try {
        const rows = await sql`
          SELECT owner_email, colors, fonts, apply_to_login, updated_at
          FROM portal_theme
          WHERE lower(owner_email) = ${cleanEmail}
          LIMIT 1;
        `;

        if (rows.length === 0) {
          return res.status(200).json({
            theme: {
              colors: DEFAULT_THEME_COLORS,
              fonts: DEFAULT_THEME_FONTS,
              apply_to_login: false
            },
            isDefault: true
          });
        }

        const row = rows[0];
        return res.status(200).json({
          theme: {
            colors: { ...DEFAULT_THEME_COLORS, ...(row.colors || {}) },
            fonts: { ...DEFAULT_THEME_FONTS, ...(row.fonts || {}) },
            apply_to_login: Boolean(row.apply_to_login)
          },
          updated_at: row.updated_at
        });
      } catch (dbErr) {
        // Handle unapplied migration gracefully
        if (dbErr.message && (dbErr.message.includes('relation "portal_theme" does not exist') || dbErr.code === '42P01')) {
          return res.status(200).json({
            theme: {
              colors: DEFAULT_THEME_COLORS,
              fonts: DEFAULT_THEME_FONTS,
              apply_to_login: false
            },
            migrationPending: true
          });
        }
        throw dbErr;
      }
    }

    // =========================================================================
    // PUT: Save or update owner's active portal theme
    // =========================================================================
    if (req.method === 'PUT') {
      const body = req.body || {};
      const rawColors = body.colors || {};
      const rawFonts = body.fonts || {};
      const applyToLogin = Boolean(body.apply_to_login);

      // Sanitize and validate colors
      const sanitizedColors = {};
      const allowedColorKeys = Object.keys(DEFAULT_THEME_COLORS);

      for (const key of allowedColorKeys) {
        const val = rawColors[key];
        if (val && isValidHex(val)) {
          sanitizedColors[key] = normalizeHex(val);
        } else {
          sanitizedColors[key] = DEFAULT_THEME_COLORS[key];
        }
      }

      // Sanitize and validate fonts against allowlist
      const headingFontMatch = matchFontInList(ALLOWED_HEADING_FONTS, rawFonts.headingFont);
      const bodyFontMatch = matchFontInList(ALLOWED_BODY_FONTS, rawFonts.bodyFont);
      const labelFontMatch = matchFontInList(ALLOWED_LABEL_FONTS, rawFonts.labelFont);
      const accentFontMatch = rawFonts.accentFont
        ? matchFontInList(ALLOWED_ACCENT_FONTS, rawFonts.accentFont)
        : null;

      const sanitizedFonts = {
        headingFont: headingFontMatch ? headingFontMatch.id : DEFAULT_THEME_FONTS.headingFont,
        bodyFont: bodyFontMatch ? bodyFontMatch.id : DEFAULT_THEME_FONTS.bodyFont,
        labelFont: labelFontMatch ? labelFontMatch.id : DEFAULT_THEME_FONTS.labelFont,
        accentFont: accentFontMatch ? accentFontMatch.id : '',
        baseTextSize: ['small', 'default', 'large'].includes(rawFonts.baseTextSize) ? rawFonts.baseTextSize : 'default',
        italicSecondLine: rawFonts.italicSecondLine !== undefined ? Boolean(rawFonts.italicSecondLine) : true
      };

      try {
        const updated = await sql`
          INSERT INTO portal_theme (owner_email, colors, fonts, apply_to_login, updated_at)
          VALUES (
            ${cleanEmail},
            ${JSON.stringify(sanitizedColors)},
            ${JSON.stringify(sanitizedFonts)},
            ${applyToLogin},
            now()
          )
          ON CONFLICT (owner_email) DO UPDATE SET
            colors = EXCLUDED.colors,
            fonts = EXCLUDED.fonts,
            apply_to_login = EXCLUDED.apply_to_login,
            updated_at = now()
          RETURNING owner_email, colors, fonts, apply_to_login, updated_at;
        `;

        return res.status(200).json({
          success: true,
          theme: {
            colors: updated[0].colors,
            fonts: updated[0].fonts,
            apply_to_login: updated[0].apply_to_login
          },
          updated_at: updated[0].updated_at
        });
      } catch (dbErr) {
        if (dbErr.message && (dbErr.message.includes('relation "portal_theme" does not exist') || dbErr.code === '42P01')) {
          return res.status(400).json({
            error: 'The database table "portal_theme" has not been created yet. Please apply the SQL migration first.'
          });
        }
        throw dbErr;
      }
    }

    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(450).json({ error: `Method ${req.method} Not Allowed` });
  } catch (error) {
    console.error('Error in /api/settings/theme:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
