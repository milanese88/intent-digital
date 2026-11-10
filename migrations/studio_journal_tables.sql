-- ==============================================================================
-- Migration: Studio Journal Tables (Neon Postgres)
-- Created: 2026-11-10
-- Description: Creates inspiration_images and learning_notes tables, and adds
--              is_studying flag to investor_properties.
-- ==============================================================================

-- 1. Table: inspiration_images
create table if not exists inspiration_images (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  url text not null,
  title text,
  credit text,
  alt text not null,
  notice text not null,
  try_it text not null,
  palette jsonb not null default '[]'::jsonb,
  source text not null default 'library' check (source in ('library', 'upload')),
  active boolean not null default true,
  last_shown date,
  created_at timestamptz not null default now()
);

create index if not exists idx_inspiration_images_owner_active on inspiration_images (owner_email, active);
create index if not exists idx_inspiration_images_last_shown on inspiration_images (last_shown);

-- 2. Table: learning_notes
create table if not exists learning_notes (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  title text not null,
  body text not null,
  color_bar jsonb,
  link_url text,
  link_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_learning_notes_owner_created on learning_notes (owner_email, created_at desc);

-- 3. Add is_studying toggle to investor_properties
alter table investor_properties 
  add column if not exists is_studying boolean not null default false;

-- 4. Add journal_metadata to admin_user for weekly trackers
alter table admin_user
  add column if not exists journal_metadata jsonb default '{}'::jsonb;

