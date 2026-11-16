# Intent Digital Design System Rules

These rules govern the styling, colors, and layout structure of the Intent Digital branding agency marketing website.

## Design Tokens (60-30-10 Rule)

- **60% Dominant (Page Base & Backgrounds)**: Toasted Cream (`#FAF8F5`)
- **30% Secondary (Structure, Depth & Text)**: PANTONE 19-1018 TCX Ganache (`#34292A`)
- **10% Accent (CTAs, Badges & Highlights)**: PANTONE 12-4207 TSX Quietude (`#BDD3E2`) & Periwinkle Blue (`#859DCE`)

## Typography Rules

- **Editorial Serif (Headings & Titles)**: `Cormorant Garamond` / `Playfair Display` for titles and headings.
- **UI Sans-Serif (Navigation, Body Paragraphs, Labels, Buttons & Badges)**: `Montserrat`.

## Layout & Color Application Rules

- **60% Base**: Always use Toasted Cream (`#FAF8F5`) as the anchoring base background.
- **30% Depth**: Use Pantone Ganache (`#34292A`) for typography, dark structural panels, card borders, and footers.
- **10% Accent**: Use Pantone Quietude (`#BDD3E2`) & Periwinkle (`#859DCE`) for high-impact buttons, marquee banners, active underlines, and category badges.

## Database Migrations & API Error Handling Rules

- **Check Pending Migrations Before Commit**: Run `node scripts/db/check.mjs` before every commit that adds or modifies a SQL migration, and report in the summary: `"Pending migrations: X — say apply"`.
- **Apply Only on Explicit Approval**: Never apply SQL migrations automatically. Show idempotent SQL (`IF NOT EXISTS`, zero test rows) first and wait for `"apply"`, then run `node scripts/db/migrate.mjs` against `.env.local` only.
- **Friendly API Error Messages**: Never expose raw PostgreSQL / Neon errors to the UI. When Postgres returns `"does not exist"` (`42P01` / `42703`), log it server-side and return `"This feature needs a database update — ask to apply migrations."` via `sendSafeApiError` in `api/_lib/db.js`.
