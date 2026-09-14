-- Hive Inspect take-home: template importer schema
-- Applied to Supabase project `hive-template-importer` (ap-south-1) as migration `init_template_importer_schema`.
-- Copy this file into the repo as supabase/schema.sql for the README's "database initialization" step.
--
-- Hierarchy: templates -> sections -> items -> comments
-- Provenance: import_runs, import_issues (nothing is silently dropped)

create extension if not exists "pgcrypto";

create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_platform text not null default 'spectora',
  source_file_name text,
  source_file_hash text,
  parent_template_id uuid references templates(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists templates_parent_idx on templates(parent_template_id);

create table if not exists sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates(id) on delete cascade,
  name text not null,
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sections_template_pos_idx on sections(template_id, position);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  name text not null,
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists items_section_pos_idx on items(section_id, position);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  name text,
  body_html text,
  body_text text,
  comment_type text,
  category text,
  recommendation text,
  position integer not null,
  -- every other source column, verbatim, keyed by its header. Preserved even when not rendered.
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists comments_item_pos_idx on comments(item_id, position);

create table if not exists import_runs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references templates(id) on delete cascade,  -- null when the import was rejected
  file_name text,
  file_hash text,
  status text not null default 'completed' check (status in ('completed','rejected')),
  reject_reason text,
  rows_total integer,
  sections_count integer,
  items_count integer,
  comments_count integer,
  issues_count integer,
  columns_seen text[],       -- headers present in the source file
  columns_mapped text[],     -- headers the importer understood
  created_at timestamptz not null default now()
);
create index if not exists import_runs_template_idx on import_runs(template_id);

create table if not exists import_issues (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references import_runs(id) on delete cascade,
  template_id uuid references templates(id) on delete cascade,
  severity text not null check (severity in ('skipped','unsupported','warning','info')),
  kind text not null check (kind in ('missing_in_source','unsupported_by_importer','malformed','orphan','duplicate','other')),
  row_number integer,
  location text,
  message text not null,
  raw_value text,
  created_at timestamptz not null default now()
);
create index if not exists import_issues_template_idx on import_issues(template_id);
create index if not exists import_issues_run_idx on import_issues(import_run_id);

-- keep updated_at honest
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists templates_set_updated_at on templates;
create trigger templates_set_updated_at before update on templates
  for each row execute function set_updated_at();
drop trigger if exists sections_set_updated_at on sections;
create trigger sections_set_updated_at before update on sections
  for each row execute function set_updated_at();
drop trigger if exists items_set_updated_at on items;
create trigger items_set_updated_at before update on items
  for each row execute function set_updated_at();
drop trigger if exists comments_set_updated_at on comments;
create trigger comments_set_updated_at before update on comments
  for each row execute function set_updated_at();

-- RLS on, no anon policies: all reads/writes go through the Next.js server with the service role key.
-- The public URL can never touch the tables directly.
alter table templates      enable row level security;
alter table sections       enable row level security;
alter table items          enable row level security;
alter table comments       enable row level security;
alter table import_runs    enable row level security;
alter table import_issues  enable row level security;
