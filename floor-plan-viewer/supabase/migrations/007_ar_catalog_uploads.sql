-- AR catalog upload support for Cloudflare Pages + R2.

alter table if exists public.shearling_catalog
  add column if not exists usdz_url text,
  add column if not exists ar_enabled boolean default true;

create table if not exists public.ar_events (
  id uuid primary key default gen_random_uuid(),
  product_code text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists ar_events_product_code_created_at
  on public.ar_events (product_code, created_at desc);

alter table public.ar_events enable row level security;

drop policy if exists "Anon insert ar_events" on public.ar_events;
create policy "Anon insert ar_events"
  on public.ar_events for insert with check (true);

drop policy if exists "Anon read ar_events" on public.ar_events;
create policy "Anon read ar_events"
  on public.ar_events for select using (true);
