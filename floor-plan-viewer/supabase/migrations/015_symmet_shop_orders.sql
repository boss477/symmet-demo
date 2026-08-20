-- Orders placed through the symmet-demo shop checkout. Product catalog stays
-- in Cloudflare D1 (symmet-shop-api worker); only orders live in Supabase.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  created_at timestamptz not null default now(),
  first_name text not null,
  last_name text not null,
  email text not null,
  address text not null,
  city text not null,
  postcode text not null,
  items jsonb not null,
  total numeric not null,
  status text not null default 'received'
);

alter table public.orders enable row level security;

-- The checkout worker submits orders using the public anon key, so anon
-- needs insert access. No select/update/delete policy exists for anon,
-- so submitted orders can't be read back or altered from the client —
-- only via the Supabase dashboard/service role.
create policy "Public checkout can create orders"
  on public.orders for insert
  to anon
  with check (true);
