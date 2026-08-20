# Manufacturer Portal + Public Design Gallery — Design

**Date:** 2026-06-13
**Status:** Approved for planning
**Author:** brainstorming session

## Goal

Add two capabilities to floor-plan-viewer, extending existing tables and patterns (no re-architecture):

1. **Manufacturer portal** — a page where a manufacturer views and manages their own catalog SKUs (create / read / update / delete).
2. **Publish designs → public gallery** — a manufacturer marks a furnished plan as public; it appears in a gallery feed and opens in a read-only 3D viewer. The read-only viewer URL doubles as the WhatsApp-shareable link.

## Context / existing architecture

- **Frontend:** Vite + Three.js, SPA-style (`src/main.js`, `src/viewer/*`).
- **Data:** Supabase Postgres. Relevant tables: `shearling_catalog` (SKUs), `projects` / `rooms` / `structural_elements` / `placed_furniture` (relational scene graph).
- **Assets:** Cloudflare R2 + Supabase Storage (catalog images, GLB models, snapshots).
- **Catalog is "one table per vendor."** Vendor is stamped in code, not a column — `SHEARLING_VENDOR = "Shearling"` in `src/lib/catalog.js`. Today there is exactly one vendor table: `shearling_catalog`.
- **No auth today.** App uses the Supabase anon key only; `projects.user_id` is never populated.
- **Snapshots already exist** via `src/viewer/plan3dSnapshot.js`.

## Decisions (locked)

- **Portal access:** open admin page, **no login**. CRUD runs against the single `shearling_catalog` vendor table through the anon key. Auth + RLS are deferred to a later round.
- **GLB delivery for the shared viewer:** Draco-compressed geometry on the read-only/mobile path.
- **Share vs publish are independent visibility states.** A plan can be shared by link (works even when *not* in the public gallery) via an unguessable `share_token`. Publishing (`published = true`) is a separate action that lists the plan in the gallery. The read-only viewer is keyed by `share_token`, not by raw project id, so private plans are not enumerable.

## Out of scope (deferred this round)

- RLS / authentication / per-vendor isolation.
- "Best-selling" / sales analytics (no orders table exists; engagement analytics via `ar_events` is a separate future round).
- Open Graph preview card for WhatsApp.
- Multi-vendor portal (only one vendor table exists today; portal targets `shearling_catalog`).

---

## Feature A — Manufacturer portal

### Route
- New page at `/manufacturer`. Register an explicit Flask route (per local env note: new HTML entries need explicit routes) and ensure it works under Cloudflare Pages.

### UI
- **SKU list:** table of rows from `shearling_catalog` (reuse existing fetch in `src/services/supabase.js`). Columns: product code, product name, price, image thumbnail, GLB present (yes/no).
- **Edit row:** editable fields — product name, price, image URL, `3d_url`/`model_3d_url`, `plan2d_glb_url`. Save writes back to the row.
- **Add row:** form to insert a new SKU.
- **Delete row:** remove a SKU (confirm first).

### Data flow
- Reads/writes via the existing Supabase client (anon key). New service functions in `src/services/supabase.js` (or a sibling module) for `updateSku`, `insertSku`, `deleteSku`. No schema change required for Feature A — `shearling_catalog` already has the needed columns.

### Notes
- Column names in `shearling_catalog` are spaced/legacy (e.g. `"Product Code"`); reuse the existing adapter conventions in `src/lib/catalog.js` rather than hard-coding names.
- Security is intentionally absent this round (deferred). Do not add throwaway auth.

---

## Feature B — Publish designs → public gallery

### Schema (one new migration: `009_publish_and_share_projects.sql`)
Add to `public.projects`:
- `published boolean not null default false` — listed in the public gallery
- `share_token text unique` — unguessable token for link sharing (nullable until first shared)
- `title text`
- `cover_image_url text`

(Index `projects (published, created_at desc)` for the feed; `share_token` is unique for lookup.)

### Share action (link, independent of publish)
- A "Share" control in the editor:
  1. If `share_token` is null, generate an unguessable token (e.g. random URL-safe string) and persist it.
  2. Return `/view/<share_token>`. This works even if the plan is never published.
- Optionally bakes/uploads a cover snapshot so the link has a thumbnail too, but a cover is **required** only for publishing.

### Publish action (gallery, independent of share)
- A "Publish" control in the editor:
  1. Bakes a snapshot via `plan3dSnapshot.js`.
  2. Uploads the snapshot to storage (R2/Supabase) → `cover_image_url`.
  3. Sets `published = true` and `title`.
- Publishing also ensures a `share_token` exists so gallery cards can link to the viewer.

### Gallery page
- Public page listing **published** projects as cards: title, author label, thumbnail (`cover_image_url`), recency. Matches the existing gallery mock.
- Each card links to `/view/<share_token>`.

### Read-only viewer
- Route `/view/<share_token>`: looks the project up **by `share_token`** (not raw id), loads the relational scene (`rooms`, `structural_elements`, `placed_furniture`) and renders it view-only (no editing tools).
- Works regardless of `published` state — a valid token is sufficient.
- Loads GLBs through a **Draco-enabled** loader on this path for mobile weight.
- This URL is the WhatsApp-shareable link.

### Data flow
- Gallery query: `select` projects where `published = true` ordered by `created_at desc`.
- Viewer query: load one project + its children **by `share_token`**. Anon read is allowed (security deferred); enumeration is mitigated by the unguessable token rather than RLS.

---

## Components / boundaries

| Unit | Purpose | Depends on |
|---|---|---|
| `/manufacturer` page + SKU table component | View/manage SKUs | Supabase service, catalog adapter |
| SKU service fns (`insert/update/deleteSku`) | DB writes for SKUs | Supabase client |
| `009_publish_and_share_projects.sql` | Adds publish + share-token fields to projects | — |
| Share control | Generate/persist `share_token`, return link | Supabase write |
| Publish control | Snapshot + flip published | `plan3dSnapshot.js`, storage upload |
| Gallery page | List published projects | Supabase read |
| `/view/<share_token>` read-only viewer | Render shared scene by token | scene-graph loaders, Draco GLB loader |

## Verification

- **Portal:** load `/manufacturer` → list shows SKUs; edit a price and reload → persisted; add a SKU → appears; delete → gone.
- **Share:** click Share on an *unpublished* plan → `share_token` generated, `/view/<token>` opens the scene read-only.
- **Publish:** publish a plan → row has `published=true`, `cover_image_url` set, snapshot viewable.
- **Gallery:** published plan appears as a card linking to `/view/<token>`; unpublished does not appear in the gallery but is still reachable by its share link.
- **Shared viewer:** open `/view/<token>` in a fresh/mobile context → scene + GLB furniture render read-only; Draco-compressed GLB loads; a bad/missing token shows not-found.

## Risks / open items

- GLB weight on low-end phones — mitigated by Draco on the view path; consider lazy/progressive loading if scenes are large.
- No security this round is a deliberate, time-boxed risk; the open admin page and anon writes must be locked down before any real external manufacturer access.
