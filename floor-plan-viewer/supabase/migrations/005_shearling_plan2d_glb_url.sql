-- Pre-baked top-down PNG for 2D plan (from GLB bake pipeline).
ALTER TABLE public.shearling_catalog
  ADD COLUMN IF NOT EXISTS plan2d_glb_url text;

COMMENT ON COLUMN public.shearling_catalog.plan2d_glb_url IS
  'Pre-baked top-down PNG URL for 2D plan view (Cloudflare R2)';

CREATE INDEX IF NOT EXISTS shearling_catalog_plan2d_glb_url_idx
  ON public.shearling_catalog (plan2d_glb_url)
  WHERE plan2d_glb_url IS NOT NULL;
