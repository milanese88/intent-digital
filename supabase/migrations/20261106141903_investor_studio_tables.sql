-- ==============================================================================
-- Migration: Investor Studio Tables
-- Created: 2026-11-06
-- Description: Creates 4 private tables for real estate investor tracking,
--              comps, watched locations, and deal underwriting analyses.
-- ==============================================================================

-- 1. Helper function for updated_at timestamps
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 2. Table: investor_properties
create table if not exists public.investor_properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
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
drop trigger if exists trigger_set_investor_properties_updated_at on public.investor_properties;
create trigger trigger_set_investor_properties_updated_at
  before update on public.investor_properties
  for each row
  execute function public.set_updated_at();

-- 3. Table: investor_comps (sold comparables for a property)
create table if not exists public.investor_comps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  property_id uuid not null references public.investor_properties(id) on delete cascade,
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
create table if not exists public.investor_locations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  city text,
  zip text,
  county text,
  notes text,
  created_at timestamptz not null default now()
);

-- 5. Table: investor_analyses (saved underwriting runs)
create table if not exists public.investor_analyses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  property_id uuid not null references public.investor_properties(id) on delete cascade,
  strategy text not null check (strategy in ('rental','flip','brrrr')),
  inputs jsonb not null default '{}'::jsonb,
  results jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ==============================================================================
-- Indexes
-- ==============================================================================

-- owner_id on every table
create index if not exists idx_investor_properties_owner_id on public.investor_properties(owner_id);
create index if not exists idx_investor_comps_owner_id on public.investor_comps(owner_id);
create index if not exists idx_investor_locations_owner_id on public.investor_locations(owner_id);
create index if not exists idx_investor_analyses_owner_id on public.investor_analyses(owner_id);

-- property_id on comps and analyses
create index if not exists idx_investor_comps_property_id on public.investor_comps(property_id);
create index if not exists idx_investor_analyses_property_id on public.investor_analyses(property_id);

-- zip on properties
create index if not exists idx_investor_properties_zip on public.investor_properties(zip);

-- ==============================================================================
-- Security (Row Level Security & Role Access)
-- ==============================================================================

-- Enable RLS on all 4 tables
alter table public.investor_properties enable row level security;
alter table public.investor_comps enable row level security;
alter table public.investor_locations enable row level security;
alter table public.investor_analyses enable row level security;

-- Policies: Authenticated users manage only their own rows (select, insert, update, delete)
create policy "Authenticated users can manage their own investor properties"
  on public.investor_properties
  for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Authenticated users can manage their own investor comps"
  on public.investor_comps
  for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Authenticated users can manage their own investor locations"
  on public.investor_locations
  for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Authenticated users can manage their own investor analyses"
  on public.investor_analyses
  for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Explicitly disallow the anon role from accessing any tables
revoke all on table public.investor_properties from anon;
revoke all on table public.investor_comps from anon;
revoke all on table public.investor_locations from anon;
revoke all on table public.investor_analyses from anon;
