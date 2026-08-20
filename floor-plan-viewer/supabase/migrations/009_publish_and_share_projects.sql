-- 009_publish_and_share_projects.sql
-- Publish (gallery) and link-share (token) are independent visibility states.

alter table if exists public.projects
  add column if not exists published boolean not null default false,
  add column if not exists share_token text unique,
  add column if not exists title text,
  add column if not exists cover_image_url text;

create index if not exists projects_published_created_at
  on public.projects (published, created_at desc);
