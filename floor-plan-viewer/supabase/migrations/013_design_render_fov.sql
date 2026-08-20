-- 013_design_render_fov.sql
-- Persist the camera's horizontal field of view (radians) so the deck's
-- key-plan POV cone reproduces the exact lens angle after a page refresh.
-- Older rows stay null and fall back to the default 60° wedge client-side.

alter table public.design_renders
  add column if not exists cam_fov double precision;
