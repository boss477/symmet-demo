-- 012_design_renders.sql
-- Photoreal shots gallery: persist each render's R2 URL + the camera's
-- plan-space position (x/y 0-1, heading radians) so the deck's key-plan
-- inset can be rebuilt after a page refresh.

create table if not exists public.design_renders (
  id uuid primary key default gen_random_uuid(),
  design_id text not null,
  title text,
  url text not null,
  cam_x double precision,
  cam_y double precision,
  cam_heading double precision,
  created_at timestamptz not null default now()
);

create index if not exists design_renders_design_id_created_at
  on public.design_renders (design_id, created_at);

alter table public.design_renders enable row level security;

drop policy if exists "Anon insert design_renders" on public.design_renders;
create policy "Anon insert design_renders"
  on public.design_renders for insert with check (true);

drop policy if exists "Anon read design_renders" on public.design_renders;
create policy "Anon read design_renders"
  on public.design_renders for select using (true);
