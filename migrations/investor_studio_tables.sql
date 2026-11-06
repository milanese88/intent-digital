-- ==============================================================================
-- Migration: Investor Studio Tables (Neon Postgres)
-- Created: 2026-11-06
-- Description: Creates 4 private tables for real estate investor tracking,
--              comps, watched locations, and deal underwriting analyses.
-- Target Database: Neon Serverless Postgres
-- Auth Model: Authenticated admin session validation via server-side /api routes
-- ==============================================================================

-- 1. Helper function for updated_at timestamps
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 2. Table: investor_properties
create table if not exists investor_properties (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  address text not null,
  city text,
  state text default 'FL',
  zip text,
  county text,
  lat double precision,
  lng double precision,
  property_type text check (property_type in ('single_family','condo','townhome','multifamily_2_9','other')),
  units int default 1,
  beds numeric,
  baths numeric,
  sqft int,
  lot_sqft int,
  year_built int,
  list_price numeric,
  status text not null default 'watching' check (status in ('watching','analyzing','offer_sent','under_contract','passed','owned')),
  strategy text check (strategy in ('rental','flip','brrrr')),
  condition text,
  roof_year int,
  listing_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger: auto-update updated_at on investor_properties
drop trigger if exists trigger_set_investor_properties_updated_at on investor_properties;
create trigger trigger_set_investor_properties_updated_at
  before update on investor_properties
  for each row
  execute function set_updated_at();

-- 3. Table: investor_comps (sold comparables for a property)
create table if not exists investor_comps (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  property_id uuid not null references investor_properties(id) on delete cascade,
  address text not null,
  city text,
  zip text,
  lat double precision,
  lng double precision,
  sold_date date,
  sold_price numeric,
  sqft int,
  beds numeric,
  baths numeric,
  year_built int,
  price_per_sqft numeric generated always as (sold_price / nullif(sqft, 0)) stored,
  distance_mi numeric,
  included boolean not null default true,
  source text,
  created_at timestamptz not null default now()
);

-- 4. Table: investor_locations (areas watched)
create table if not exists investor_locations (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  name text not null,
  city text,
  zip text,
  county text,
  notes text,
  created_at timestamptz not null default now()
);

-- 5. Table: investor_analyses (saved underwriting runs)
create table if not exists investor_analyses (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  property_id uuid not null references investor_properties(id) on delete cascade,
  strategy text not null check (strategy in ('rental','flip','brrrr')),
  inputs jsonb not null default '{}'::jsonb,
  results jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ==============================================================================
-- Indexes
-- ==============================================================================

-- owner_email on every table
create index if not exists idx_investor_properties_owner_email on investor_properties(owner_email);
create index if not exists idx_investor_comps_owner_email on investor_comps(owner_email);
create index if not exists idx_investor_locations_owner_email on investor_locations(owner_email);
create index if not exists idx_investor_analyses_owner_email on investor_analyses(owner_email);

-- property_id on comps and analyses
create index if not exists idx_investor_comps_property_id on investor_comps(property_id);
create index if not exists idx_investor_analyses_property_id on investor_analyses(property_id);

-- zip on properties
create index if not exists idx_investor_properties_zip on investor_properties(zip);
