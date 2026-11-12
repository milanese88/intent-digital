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
    // GET: List all presets for owner
    // =========================================================================
    if (req.method === 'GET') {
      try {
        const rows = await sql`
          SELECT id, owner_email, name, colors, fonts, created_at
          FROM portal_theme_presets
          WHERE lower(owner_email) = ${cleanEmail}
          ORDER BY created_at DESC;
        `;
        return res.status(200).json({ presets: rows });
      } catch (dbErr) {
        if (dbErr.message && (dbErr.message.includes('relation "portal_theme_presets" does not exist') || dbErr.code === '42P01')) {
          return res.status(200).json({ presets: [], migrationPending: true });
        }
        throw dbErr;
      }
    }

    // =========================================================================
    // POST: Save a new preset
    // =========================================================================
    if (req.method === 'POST') {
      const body = req.body || {};
      const name = (body.name || '').trim();
      if (!name) {
        return res.status(400).json({ error: 'Preset name is required' });
      }

      const rawColors = body.colors || {};
      const rawFonts = body.fonts || {};

      // Sanitize colors
      const sanitizedColors = {};
      for (const key of Object.keys(DEFAULT_THEME_COLORS)) {
        const val = rawColors[key];
        sanitizedColors[key] = (val && isValidHex(val)) ? normalizeHex(val) : DEFAULT_THEME_COLORS[key];
      }

      // Sanitize fonts
      const headingMatch = matchFontInList(ALLOWED_HEADING_FONTS, rawFonts.headingFont);
      const bodyMatch = matchFontInList(ALLOWED_BODY_FONTS, rawFonts.bodyFont);
      const labelMatch = matchFontInList(ALLOWED_LABEL_FONTS, rawFonts.labelFont);
      const accentMatch = rawFonts.accentFont
        ? matchFontInList(ALLOWED_ACCENT_FONTS, rawFonts.accentFont)
        : null;

      const sanitizedFonts = {
        headingFont: headingMatch ? headingMatch.id : DEFAULT_THEME_FONTS.headingFont,
        bodyFont: bodyMatch ? bodyMatch.id : DEFAULT_THEME_FONTS.bodyFont,
        labelFont: labelMatch ? labelMatch.id : DEFAULT_THEME_FONTS.labelFont,
        accentFont: accentMatch ? accentMatch.id : '',
        baseTextSize: ['small', 'default', 'large'].includes(rawFonts.baseTextSize) ? rawFonts.baseTextSize : 'default',
        italicSecondLine: rawFonts.italicSecondLine !== undefined ? Boolean(rawFonts.italicSecondLine) : true
      };

      try {
        const rows = await sql`
          INSERT INTO portal_theme_presets (owner_email, name, colors, fonts)
          VALUES (
            ${cleanEmail},
            ${name},
            ${JSON.stringify(sanitizedColors)},
            ${JSON.stringify(sanitizedFonts)}
          )
          RETURNING id, owner_email, name, colors, fonts, created_at;
        `;

        return res.status(201).json({ preset: rows[0] });
      } catch (dbErr) {
        if (dbErr.message && (dbErr.message.includes('relation "portal_theme_presets" does not exist') || dbErr.code === '42P01')) {
          return res.status(400).json({
            error: 'Database table "portal_theme_presets" does not exist yet. Please apply the migration SQL first.'
          });
        }
        throw dbErr;
      }
    }

    // =========================================================================
    // DELETE: Delete a preset
    // =========================================================================
    if (req.method === 'DELETE') {
      const { id } = req.query || {};
      if (!id) {
        return res.status(400).json({ error: 'Preset ID is required' });
      }

      try {
        const deleted = await sql`
          DELETE FROM portal_theme_presets
          WHERE id = ${id} AND lower(owner_email) = ${cleanEmail}
          RETURNING id;
        `;

        if (deleted.length === 0) {
          return res.status(404).json({ error: 'Preset not found or unauthorized' });
        }

        return res.status(200).json({ success: true, id });
      } catch (dbErr) {
        if (dbErr.message && (dbErr.message.includes('relation "portal_theme_presets" does not exist') || dbErr.code === '42P01')) {
          return res.status(400).json({ error: 'Database table "portal_theme_presets" does not exist yet.' });
        }
        throw dbErr;
      }
    }

    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  } catch (error) {
    console.error('Error in /api/settings/theme-presets:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
