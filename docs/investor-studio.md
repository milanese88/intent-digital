# Investor Studio Database Schema

This migration establishes the core persistence layer for the **Investor Studio** real estate investor toolkit. It creates 4 private tables protected by Supabase Row Level Security (RLS) linked directly to `auth.users(id)`.

---

## Tables Overview

1. **`investor_properties`**
   - Stores real estate target properties being watched, analyzed, or under contract.
   - Captures property details (address, coordinates, beds, baths, sqft, year built, list price), strategy (`rental`, `flip`, `brrrr`), status (`watching`, `analyzing`, `offer_sent`, `under_contract`, `passed`, `owned`), and condition notes.
   - Automatically maintains `updated_at` timestamps via a Postgres trigger.

2. **`investor_comps`**
   - Stores sold comparable properties tied to a parent property via `property_id`.
   - Automatically computes `price_per_sqft` via a Postgres stored generated column `(sold_price / nullif(sqft, 0))`.
   - Records distance in miles, comp inclusion flag (`included`), and comp data source.

3. **`investor_locations`**
   - Keeps track of target submarkets, neighborhoods, zip codes, and counties on the investor's radar.

4. **`investor_analyses`**
   - Stores underwriting scenarios and calculations for a given property.
   - Stores full scenario parameters and outputs using `inputs` (jsonb) and `results` (jsonb) for flexible financial modeling (cash flow, ROI, cap rate, max allowable offer).

---

## Security & Row Level Security (RLS)

- **RLS Enabled:** All 4 tables strictly enforce Row Level Security.
- **Tenant Isolation:** Authenticated users (`role = authenticated`) can only select, insert, update, or delete rows where `owner_id = auth.uid()`.
- **Public Protection:** The public/anonymous role (`anon`) has all privileges explicitly revoked. Unauthenticated visitors cannot read or query any records.

---

## How to Apply this Migration to your Supabase Project

You can apply this migration using either the **Supabase Dashboard (SQL Editor)** or the **Supabase CLI**.

### Option A: Via the Supabase Dashboard SQL Editor (Quickest)
1. Log in to your [Supabase Dashboard](https://app.supabase.com) and select your project.
2. Click on **SQL Editor** in the left sidebar.
3. Click **New query**.
4. Open [`supabase/migrations/20261106141903_investor_studio_tables.sql`](../supabase/migrations/20261106141903_investor_studio_tables.sql), copy its entire content, and paste it into the SQL Editor.
5. Click **Run** (or press `Cmd + Enter`).
6. You will see a `Success` confirmation. The 4 new tables will now appear under **Table Editor**.

### Option B: Via the Supabase CLI
If you have your project linked via the Supabase CLI:
```bash
# Link project if not already linked (requires project reference ID)
supabase link --project-ref <your-project-ref>

# Push pending local migrations to the remote database
supabase db push
```
