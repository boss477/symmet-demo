-- Unit price for shearling_catalog SKUs.
-- The catalog is multi-vendor (one table per vendor); vendor is stamped by the
-- catalog adapter, so there is no per-row vendor column. Only price is stored.

alter table if exists public.shearling_catalog
  add column if not exists price numeric;

comment on column public.shearling_catalog.price is
  'Unit price (numeric). Surfaced on the canonical Catalog Entry for RFQ / quoting.';
