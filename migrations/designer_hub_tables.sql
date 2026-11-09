-- ==============================================================================
-- Migration: Designer Hub Tables (Neon Postgres)
-- Created: 2026-11-09
-- Description: Creates tables for Designer Hub (interior design studio):
--              projects, rooms, room images, line items, sourcing products,
--              trade contacts, and portfolio entries.
-- Target Database: Neon Serverless Postgres
-- Auth Model: Authenticated admin session validation via server-side /api routes
-- ==============================================================================

-- Helper function for updated_at timestamps (safe if already exists)
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 1. Table: design_products (Sourcing Library - created first so design_items can reference it)
create table if not exists design_products (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  name text not null,
  category text,
  vendor text,
  sku text,
  spec text,
  unit_cost numeric,
  unit text,
  finish text,
  lead_time text,
  image_url text,
  link_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trigger_set_design_products_updated_at on design_products;
create trigger trigger_set_design_products_updated_at
  before update on design_products
  for each row
  execute function set_updated_at();

-- 2. Table: design_projects
create table if not exists design_projects (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  name text not null,
  location text,
  project_type text check (project_type in ('client','investor','concept','coursework')),
  status text not null default 'concept' check (status in ('concept','in_design','in_progress','complete','on_hold')),
  style text,
  target_budget numeric,
  contingency_pct numeric default 10,
  investor_property_id uuid null references investor_properties(id) on delete set null,
  cover_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trigger_set_design_projects_updated_at on design_projects;
create trigger trigger_set_design_projects_updated_at
  before update on design_projects
  for each row
  execute function set_updated_at();

-- 3. Table: design_rooms
create table if not exists design_rooms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references design_projects(id) on delete cascade,
  owner_email text not null,
  room_type text check (room_type in ('kitchen','bathroom','living','bedroom','dining','exterior','outdoor','office','laundry','other')),
  name text not null,
  style text,
  brief text,
  palette jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 4. Table: design_room_images
create table if not exists design_room_images (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references design_rooms(id) on delete cascade,
  owner_email text not null,
  blob_url text not null,
  kind text check (kind in ('mood','before','after','plan','render')),
  caption text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 5. Table: design_items
create table if not exists design_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references design_projects(id) on delete cascade,
  room_id uuid null references design_rooms(id) on delete set null,
  owner_email text not null,
  name text not null,
  spec text,
  category text check (category in ('materials','labor','fixtures','furniture','lighting','plumbing','hardware','appliances','decor','paint','design_fee','other')),
  vendor text,
  qty numeric not null default 1,
  unit_cost numeric,
  total numeric generated always as (qty * unit_cost) stored,
  status text not null default 'idea' check (status in ('idea','selected','quoted','ordered','delivered','installed')),
  product_id uuid null references design_products(id) on delete set null,
  link_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trigger_set_design_items_updated_at on design_items;
create trigger trigger_set_design_items_updated_at
  before update on design_items
  for each row
  execute function set_updated_at();

-- 6. Table: design_trades
create table if not exists design_trades (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  role text,
  company text not null,
  contact_name text,
  phone text,
  email text,
  license_no text,
  insurance_expires date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trigger_set_design_trades_updated_at on design_trades;
create trigger trigger_set_design_trades_updated_at
  before update on design_trades
  for each row
  execute function set_updated_at();

-- 7. Table: portfolio_entries
create table if not exists portfolio_entries (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  project_id uuid null references design_projects(id) on delete set null,
  room_id uuid null references design_rooms(id) on delete set null,
  title text not null,
  slug text not null unique,
  tag text,
  story text,
  cover_url text,
  image_urls jsonb not null default '[]'::jsonb,
  published boolean not null default false,
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trigger_set_portfolio_entries_updated_at on portfolio_entries;
create trigger trigger_set_portfolio_entries_updated_at
  before update on portfolio_entries
  for each row
  execute function set_updated_at();

-- ==============================================================================
-- Indexes (owner_email and all foreign keys)
-- ==============================================================================

-- owner_email indexes
create index if not exists idx_design_projects_owner_email on design_projects(owner_email);
create index if not exists idx_design_rooms_owner_email on design_rooms(owner_email);
create index if not exists idx_design_room_images_owner_email on design_room_images(owner_email);
create index if not exists idx_design_items_owner_email on design_items(owner_email);
create index if not exists idx_design_products_owner_email on design_products(owner_email);
create index if not exists idx_design_trades_owner_email on design_trades(owner_email);
create index if not exists idx_portfolio_entries_owner_email on portfolio_entries(owner_email);

-- Foreign key indexes
create index if not exists idx_design_projects_investor_property_id on design_projects(investor_property_id);
create index if not exists idx_design_rooms_project_id on design_rooms(project_id);
create index if not exists idx_design_room_images_room_id on design_room_images(room_id);
create index if not exists idx_design_items_project_id on design_items(project_id);
create index if not exists idx_design_items_room_id on design_items(room_id);
create index if not exists idx_design_items_product_id on design_items(product_id);
create index if not exists idx_portfolio_entries_project_id on portfolio_entries(project_id);
create index if not exists idx_portfolio_entries_room_id on portfolio_entries(room_id);
