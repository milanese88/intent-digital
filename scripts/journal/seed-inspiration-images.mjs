import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDb } from '../../api/_lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.production.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function seed() {
  const sql = getDb();
  const manifestPath = path.resolve(__dirname, '../../public/images/inspiration/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  // Get admin owner email
  const admins = await sql`SELECT email FROM admin_user LIMIT 1`;
  const ownerEmail = admins[0]?.email || 'mn.florenciaok@gmail.com';

  console.log(`Seeding ${manifest.length} inspiration images for ${ownerEmail}...`);

  for (const item of manifest) {
    const existing = await sql`
      SELECT id FROM inspiration_images 
      WHERE owner_email = ${ownerEmail} AND url = ${item.file}
      LIMIT 1
    `;

    if (existing.length === 0) {
      await sql`
        INSERT INTO inspiration_images (
          owner_email,
          url,
          title,
          credit,
          alt,
          notice,
          try_it,
          palette,
          source,
          active
        ) VALUES (
          ${ownerEmail},
          ${item.file},
          ${item.title},
          ${item.credit},
          ${item.alt},
          ${item.notice},
          ${item.try_it},
          ${JSON.stringify(item.palette)},
          'library',
          true
        )
      `;
      console.log(`+ Inserted: ${item.title} (${item.file})`);
    } else {
      // Update metadata in case title/notice/try_it/credit changed
      await sql`
        UPDATE inspiration_images SET
          title = ${item.title},
          credit = ${item.credit},
          alt = ${item.alt},
          notice = ${item.notice},
          try_it = ${item.try_it},
          palette = ${JSON.stringify(item.palette)}
        WHERE id = ${existing[0].id}
      `;
      console.log(`~ Updated: ${item.title} (${item.file})`);
    }
  }

  // Also seed initial learning note if table is empty
  const notes = await sql`SELECT count(*) FROM learning_notes WHERE owner_email = ${ownerEmail}`;
  if (parseInt(notes[0]?.count || '0', 10) === 0) {
    await sql`
      INSERT INTO learning_notes (
        owner_email,
        title,
        body,
        color_bar,
        link_url,
        link_label
      ) VALUES (
        ${ownerEmail},
        'The 60-30-10 Rule in Living Spaces',
        '60% base (walls, large rug, sofa) in toasted cream keeps the room grounded. 30% secondary (built-ins, coffee tables, armchairs) in dark espresso creates depth without visual noise. 10% accent (pillows, ceramics, throws) in burgundy or pale quietude delivers intent.',
        ${JSON.stringify([
          { "color": "#FAF8F5", "pct": 60, "label": "60% Base (Cream)" },
          { "color": "#1E1509", "pct": 30, "label": "30% Depth (Espresso)" },
          { "color": "#41101B", "pct": 10, "label": "10% Accent (Burgundy)" }
        ])},
        'https://intent-digital.com',
        'Study color proportions →'
      )
    `;
    console.log('+ Seeded default learning note');
  }

  console.log('Seeding completed successfully!');
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
