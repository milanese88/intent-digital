# Investor Studio Database Schema (Neon Postgres)

This schema establishes the persistence layer for the **Investor Studio** real estate investor toolkit on **Neon Serverless Postgres**.

---

## 1. Tables Overview

All 4 tables include `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `owner_email TEXT NOT NULL`, and `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.

1. **`investor_properties`**
   - Core property records tracked by the investor.
   - Tracks location (`address`, `city`, `state` default `'FL'`, `zip`, `county`, `lat`, `lng`), physical attributes (`property_type`, `units`, `beds`, `baths`, `sqft`, `lot_sqft`, `year_built`), price (`list_price`), acquisition status (`status`), strategy (`strategy`), condition notes, roof age, listing link, and notes.
   - Includes an automatic `updated_at` trigger.

2. **`investor_comps`**
   - Sold comparable properties linked to a parent property via `property_id` (`ON DELETE CASCADE`).
   - Includes sale data (`sold_date`, `sold_price`, `sqft`, `beds`, `baths`, `year_built`, `distance_mi`, `source`).
   - Features a Postgres **generated stored column**:
     `price_per_sqft numeric generated always as (sold_price / nullif(sqft, 0)) stored`

3. **`investor_locations`**
   - Target markets and neighborhoods the investor is watching (`name`, `city`, `zip`, `county`, `notes`).

4. **`investor_analyses`**
   - Saved underwriting financial scenario runs linked to `property_id` (`ON DELETE CASCADE`).
   - Stores flexible scenario parameters in `inputs` (JSONB) and `results` (JSONB) along with the chosen `strategy` (`rental`, `flip`, `brrrr`).

---

## 2. Security & Access Model

- **Server-Side Protection:** The database connection string (`DATABASE_URL`) is strictly server-side and never exposed to the browser.
- **Admin Verification:** All database reads and writes are performed through serverless `/api/*` functions that verify the caller's identity via `getUserFromSession(req)` using the HTTP-only `auth_session` cookie.
- **Data Isolation:** Queries always filter or insert using the authenticated admin's email (`user.email`), ensuring row-level data isolation via the `owner_email` column.

---

## 3. How to Apply this Migration to your Neon Database

You can apply this SQL directly into your Neon Postgres database using the Vercel dashboard or the Neon console.

### Option A: Via Vercel Dashboard (Fastest if Neon is connected through Vercel)
1. Go to your **[Vercel Dashboard](https://vercel.com)**.
2. Select your `intent-digital` project.
3. Click on the **Storage** tab.
4. Click on your connected **Neon Postgres** database.
5. In the database management interface, click **Query** or **SQL Editor**.
6. Copy the entire SQL from [`migrations/investor_studio_tables.sql`](../migrations/investor_studio_tables.sql).
7. Paste the SQL into the query editor and click **Run**.
8. You will see a success message, and the 4 tables will appear in your database schema.

### Option B: Via the Neon Console Directly
1. Log in to the **[Neon Console](https://console.neon.tech)**.
2. Select your project.
3. In the left navigation menu, click **SQL Editor**.
4. Paste the SQL from [`migrations/investor_studio_tables.sql`](../migrations/investor_studio_tables.sql).
5. Click **Run** (or `Cmd + Enter`).
6. Confirm the 4 tables (`investor_properties`, `investor_comps`, `investor_locations`, `investor_analyses`) now appear under the **Tables** sidebar.
