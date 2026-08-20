-- Moat layer: tenant context, placement provenance, append-only events, layout snapshots.

alter table public.projects
  add column if not exists tenant_id text,
  add column if not exists showroom_id text,
  add column if not exists session_id uuid,
  add column if not exists source text default 'showroom_ipad',
  add column if not exists vaastu_enabled boolean default false,
  add column if not exists plan_image_url text,
  add column if not exists layout_fingerprint text,
  add column if not exists status text default 'draft',
  add column if not exists meta jsonb,
  add column if not exists rfq jsonb,
  add column if not exists updated_at timestamptz default now();

alter table public.placed_furniture
  add column if not exists product_code text,
  add column if not exists stage_source text,
  add column if not exists placement_source text,
  add column if not exists category text,
  add column if not exists color_variant text,
  add column if not exists vaastu_adjusted boolean default false,
  add column if not exists room_client_id text;

create table if not exists public.plan_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  tenant_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists plan_events_project_id on public.plan_events (project_id, created_at desc);
create index if not exists plan_events_tenant_id on public.plan_events (tenant_id, event_type, created_at desc);

create table if not exists public.layout_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  tenant_id text,
  room_client_id text,
  room_type text,
  room_area_sqm numeric,
  room_aspect_ratio numeric,
  sku_combo text[] default '{}',
  placement_mix jsonb default '{}'::jsonb,
  vaastu_enabled boolean default false,
  rfq_sent boolean default false,
  converted boolean,
  created_at timestamptz default now()
);

create index if not exists layout_snapshots_tenant_room on public.layout_snapshots (tenant_id, room_type, created_at desc);
create index if not exists layout_snapshots_project on public.layout_snapshots (project_id);

alter table public.plan_events enable row level security;
alter table public.layout_snapshots enable row level security;

drop policy if exists "Anon access to plan_events" on public.plan_events;
create policy "Anon access to plan_events"
  on public.plan_events for all using (true) with check (true);

drop policy if exists "Anon access to layout_snapshots" on public.layout_snapshots;
create policy "Anon access to layout_snapshots"
  on public.layout_snapshots for all using (true) with check (true);
