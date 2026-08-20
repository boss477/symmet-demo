# CONTEXT — floor-plan-viewer domain language

Shared vocabulary for the floor-plan design app. Terms here are the names the
code and reviews should use. Architecture vocabulary (module, seam, adapter,
depth) is defined separately; this file is the *domain*.

## Catalog

The pool of furniture **templates** a user can place onto a plan. Loaded from
two sources but consumed as one pool.

### Catalog Entry

One canonical template in the Catalog. A single shape regardless of source;
every field is present and resolved (no caller re-derives dimensions, colours,
or sofa params). An Entry is a *template* — it is not placed anywhere on its
own; a **Furniture Item** references one by `catalogId`.

Field spellings stay `snake_case` (`width_mm`, `depth_mm`, `available_colours`,
`sofa_seats`) to match existing reads — what the canonical Entry adds is the
*guarantee* of presence + resolution, not new spellings.

The Catalog is **multi-vendor**, so a `"sku"` Entry carries a **`price`** and a
**`vendor`** (the supplying company). Product **image and GLB URLs are Cloudflare
R2 links pasted into Supabase**; the Entry carries them as full https URLs
(`image_url`, `model_3d_url`, `plan2d_glb_url`) and the existing URL resolvers
pass them through unchanged.

#### kind

Discriminates an Entry's source. One of:

- **`"sku"`** — a real purchasable product from the `shearling_catalog` table
  (has `product_code`, `colours`, GLB/image URLs).
- **`"preset"`** — a room-set bundle (e.g. "Bed + nightstands + dresser") from
  `plan_catalog_presets`, or the offline `DEFAULT_PLAN_CATALOG` fallback.

Consumers treat both kinds uniformly (lookup by id, read name + dimensions);
`kind` exists for the few places that genuinely need to tell them apart.

## Furniture Item

A Catalog Entry **placed** on a plan: carries position (`x`, `y`),
`rotationDeg`, a `catalogId` referencing its Entry, and per-instance overrides
(e.g. `sofaColorOverride`, `sofaParams`). It also caches resolved size
(`catalogWidthMm`, `catalogDepthMm`) and rendering hints (`type`/`shape`,
`richIcon`) once a SKU is applied. The same Item object is read and mutated by
both the 2D and 3D views.

`lib/furnitureItem.js` owns the item's field knowledge so callers stop
re-deriving from raw fields:

- **create()** — the birth site for a bare placed item (id + position defaults);
  geometry/size/icon are layered on after by `applyCatalogSkuToItem`.
- **questions** — `isSofa`, `isColorable`, `resolveColorId`, `dimensionsMm`,
  and **`describe(item, entry)`** → `{ label, material, colorName }`, the single
  source for the photoreal prompt and any human label. Each takes the item plus
  its resolved Catalog Entry; the module never re-fetches.
- **serialize** — re-exported from `planMoat` (its implementation needs room
  geometry), so consumers ask the item module.

The heavy ctx-coupled mutators stay in `lib/catalogSizing.js`
(`applyCatalogSkuToItem`, `createFurnitureNearItem`) — they own wall-snap and
dimension geometry, not field knowledge. The lifecycle is pure data over plain
objects, so it carries headless tests (`scripts/furniture-item.test.mjs`).

## The catalog seam

Three stages, one direction:

1. **Fetch** — network/IO only (`services/supabase.js`): pulls raw rows from
   Supabase, or returns the offline defaults. Knows table/column quirks
   (spaced column names like `"Product Code"`), knows nothing about shape.
2. **Adapt** — pure mapping (raw row → Catalog Entry). The *only* place raw row
   shapes exist; resolves dimensions, colours, sofa params, and icon up front.
   Pure functions → the codebase's first headless unit tests live here.
3. **Hold** — an indexed collection of Entries offering `by_id` lookup,
   replacing the three duplicated `catalogById` definitions and the
   linear-scan `lookupCatalogRow`.

## Security — known limitations (accepted)

This is a single-tenant / demo deployment with **no user accounts**, so the
following are accepted risks, not bugs to "fix" in passing:

- **`projects` is anon read/write** (`003_relational_scene_graph.sql`,
  `for all using(true) with check(true)`). Publish/share (`projectShare.js`,
  migration 009) and the Flask `/api/projects/*` routes rely on this. Effect:
  anyone who knows a project UUID can view, publish, retitle, or rotate the
  `share_token` of any project. The share link is **not** an access capability —
  `get_project` reads by raw id without a token. A real fix needs Supabase Auth
  + owner-scoped RLS before this goes multi-tenant.
- **`/api/photoreal` and Flask `/api/*` are unauthenticated** with `CORS *`, no
  rate limit, and no request-size cap — an open proxy that spends `HF_TOKEN`
  credits. A shared secret can't work for `/api/photoreal` (the browser calls it
  directly, so the secret would ship in the bundle) — use a Cloudflare
  rate-limiting rule on the route + body cap instead.
- **`/api/photoreal` exists only as the Pages function** (`functions/api/photoreal.js`);
  the duplicate Flask route was deleted (2026-07). Local dev calls the deployed
  function via `VITE_PHOTOREAL_URL`, so edits to `photoreal.js` aren't exercisable
  locally until deployed (or run once via `wrangler pages dev`).
