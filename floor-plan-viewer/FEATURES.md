# Floor Plan Viewer — Full Feature Document

Flask backend (`app.py`) + Vite/vanilla-JS frontend (`src/`) + Supabase (Postgres/storage) + Cloudflare Workers/Pages for edge routes (payments, photoreal). AI-driven floor-plan digitizer, 3D viewer/stager, and interior-design sales tool (built for an iPad showroom use case).

---

## 1. Backend / API (`app.py`, Flask)

- **Page routes**: `/`, `/manufacturer`, `/gallery`, and a SPA fallback — serve built HTML with server-injected config (`window.__ANALYZE_API__`, model names, Supabase URL/anon key).
- **`POST /api/analyze`** — the core AI floor-plan reader:
  - Accepts an uploaded image (base64), resizes it (max 1024px), and sends it to whichever vision LLM is configured, tried in priority order:
    1. **Anthropic Claude** (default) — streamed keepalive during a background thread so long vision calls don't hit Flask's timeout.
    2. **Qwen/DashScope or Fireworks-compatible** — reasoning disabled to cut latency (~8min → ~20s).
    3. **Gemini**.
    4. **Local LM Studio** (OpenAI-compatible, for offline/dev use).
  - Returns structured JSON: **rooms** (polygon, flooring material, label point, dimensions/area text), **walls** (point runs + thickness), **doors** (position/polygon/swing/connects), **windows**, **furniture** (type, catalog id, x/y/size/rotation/scale/z-index) — all normalized 0–1 image coordinates.
  - Robust JSON extraction from LLM output: strips markdown fences, "thinking" blocks, trailing commas, brace-balanced fallback extraction.
  - Validates/clamps all geometry fields; dedupes duplicate doors that vision models sometimes emit twice (once per adjoining room).
- **`GET /api/health`** — reports active AI provider, pings LM Studio if that's the fallback.
- **`GET /api/projects/<id>`** — reassembles a full project (rooms/walls/doors/windows/furniture/calibration/meta/RFQ) from Supabase tables.
- **`PUT /api/projects/<id>`** — saves/upserts a project: writes project row, replaces all rooms/structural elements/furniture, computes a **layout fingerprint** (hash of room types + SKUs, to detect duplicate layouts), logs an **append-only analytics event**, and builds **layout snapshot** rows per room (area, aspect ratio, SKU combo, auto/manual placement mix, vaastu flag, RFQ-sent flag, won/lost) — feeding a future "recommendation" model.
- **`GET /api/projects/dataset-export`** — exports layout data for ML/analytics use.
- **Static asset serving** for built JS, GLB models, fixtures, Draco decoder.
- CORS open on all responses.
- Photoreal rendering and payments were deliberately moved OUT of Flask into Cloudflare (kept as single implementations, duplicate Flask routes removed).

---

## 2. Import / Upload Features

- **Image upload** (PNG/JPG/SVG) via drag-and-drop or click.
- **PDF upload** — client-side renders the PDF page to a raster image before sending to `/api/analyze` (vision models need pixels, not raw PDF bytes — recently fixed bug).
- **CAD upload (DXF/DWG)** — separate upload button; uses a WASM port of libredwg (`@mlightcad/libredwg-web`) to parse/rasterize CAD files client-side before analysis.
- **"Try demo"** button — loads a bundled sample plan with no upload.
- All paths funnel into the same AI analyze pipeline that produces structured rooms/walls/doors/windows/furniture.

---

## 3. 2D Floor-Plan View & Editing Tools

- 2D stage: plan image with an SVG overlay for vector annotations (rooms, walls, doors, windows, furniture icons).
- **Tool modes** (toolbar-driven, full undo stack):
  - **Set Scale** — draw a reference line, enter its real-world length to calibrate mm-per-pixel.
  - **Measure** — draw a line for live length/area readout.
  - **Draw Room** — click-to-place polygon rooms, or instantiate from a room preset.
  - **Vertex Edit** — drag room polygon vertices.
  - **Edit Walls** — pick/drag wall vertices and edges.
  - **Draw Wall** — click-to-place new wall polylines.
  - **Cut Wall / Cut Door** — two-click tool: click two points on a wall to cut a gap, or cut + insert a door opening (recent addition).
  - **Edit Windows** — window placement/editing.
  - **Delete Room** button (in view mode, when a room is selected).
  - **View** — default pan/select mode.
- Undo covers geometry edits AND calibration changes; recent UX fix auto-hides the calibration reference line after applying scale.

---

## 4. 3D Viewer

Built on Three.js with on-demand rendering (redraws only when something changes) and adaptive quality (drops resolution/SSAO while orbiting, restores after input stops; permanently disables ambient occlusion if sustained FPS is too low on weak devices).

- **Scene generation**: rooms extruded into floor slabs, walls at "dollhouse" cut height, procedural windows, base plinth.
- **View modes**:
  - **Dollhouse** — default angled 3/4 view.
  - **Top view** — top-down, furniture draggable directly (no need for Move mode).
  - **Side/elevation views** — per-wall flat view with pan/zoom/height, with a per-room wall picker (click a room → 4 live-rendered wall thumbnails → click one to fly into a locked elevation view). Camera state persists per room/wall.
- **Furniture interaction**: hover tooltips (dimensions/area), click-select with bounding-box highlight, drag-move (Move mode or Top view), rotate/replace/delete via a floating action toolbar that follows the selected item.
- **Wall/floor paint mode** — click a wall to recolor it, click a room floor to change its flooring finish, via a preset color/finish palette UI.
- **Measurement overlay** — in-scene dimension lines when furniture is selected.
- **Mini-map** — shows camera position/heading as a live marker over the plan thumbnail, with a draggable camera-height slider.
- **Snapshot** — renders a fixed 1920×1080 PNG for download, independent of viewport size.
- **Preset camera flights** — named views ("hero", "corner", "top", "entry") for auto-generated marketing shots.
- **GLB furniture models** — real 3D models loaded per catalog item, swapped in asynchronously over placeholder boxes so first paint isn't blocked; LRU cache eviction and WebP texture compression for performance; anisotropic filtering fix for blurry wall/GLB textures.
- **Full-screen toggle**.

---

## 5. Furniture Catalog & Placement Logic

- **Catalog sources**: real purchasable SKUs (Supabase catalog tables, e.g. sofas/wardrobes) and offline preset bundles (room furniture sets), normalized into one canonical "Catalog Entry" shape.
- SKU adaptation handles messy legacy spreadsheet columns, currency-formatted prices (with a manual price-override table for missing prices), sofa seat-count-aware width inference, shape classification, color parsing, and icon assignment.
- **Placing a SKU** on the plan: converts real mm dimensions to plan-normalized size, assigns the right icon/GLB, and **snaps the item to nearby walls**.
- **Auto-adjacent placement** — e.g. adding a nightstand automatically places it beside an existing bed, trying multiple sides until a non-overlapping spot is found.
- **Placement validation/physics**:
  - Furniture must have all 4 footprint corners inside its room.
  - Dragging/nudging an item reverts the move if it would cross a wall or overlap another item.
  - New/resized items get nudged into a valid spot via a spiral search, falling back to room center.
- **2D icon rendering** — priority order: pre-baked top-down GLB render → cached/queued live GLB bake → hand-drawn seat-count-aware SVG icons (sofas/chairs) → catalog product photo → procedural SVG per furniture type (dining table w/ chair count, bed, toilet, bathtub, plant variants, sink, desk, kitchen island, rug, tables, wardrobe) → generic fallback icon.
- **Furniture bounds fidelity** (per project memory) — placed furniture matches catalog seat-count in 2D and exact width/depth/height in 3D, not the raw GLB's native proportions.
- **Auto-staging / demo furnishing** — automatically fills recognized room types (bathroom → toilet+bathtub+sink, bedroom → correctly sized bed for "master" vs. regular) with placeholder furniture, tagged so it can be cleared/replaced without touching manually placed items; skips garages. Backfills real catalog dimensions/models onto auto-staged placeholders once a SKU match is known.
- **Vastu Shastra placement rules** — given a user-set "north" edge, computes compass zones and suggests/validates furniture placement by type (beds → SW facing S, sofas → S facing N, kitchen → SE facing E, toilet → W, plants avoid NE, etc.), matching a documented rule reference.
- **Catalog UI drawer**: 4 tabs (Add / List / Favorites / Gallery), search box, room-type filter, category filter, quick-category chips.
- **Auto-cropping uploaded plans** to their actual drawn content (trims blank scan margins/title blocks) so thumbnails aren't mostly white space.

---

## 6. Save / Load / Projects / Sharing

- Full relational persistence to Supabase: projects, rooms, structural elements (walls/doors/windows), placed furniture.
- **Multi-tenant metadata** on every project: tenant id, showroom id, session id, source (defaults to an iPad-showroom kiosk identifier), vastu-enabled flag, status (draft/won/lost/rfq_sent), free-form meta blob, RFQ (request-for-quote) state.
- **Layout fingerprinting** to detect duplicate/repeat layouts across sessions.
- **Analytics**: append-only event log per project; per-room "layout snapshot" rows capturing area, aspect ratio, SKU combo, placement mix, vastu usage, RFQ status, and win/loss — intended as training data for future auto-layout suggestions.
- **Dataset export endpoint** for offline ML/analytics.
- **Publish & share**: projects can be published to a public gallery, or shared via a random, unguessable share token/link independent of publish state; supports title and cover image.
- **Public gallery page** of published projects; separate **manufacturer-facing page** (catalog/SKU admin).
- **Known limitation (documented, accepted)**: no authentication — anyone with a project link can view/edit/publish it. Flagged as needing real auth before broader multi-tenant use.

---

## 7. Photorealistic AI Rendering ("Photoreal")

- Flow: capture a 1920×1080 snapshot of the current 3D dollhouse view → send to a Cloudflare edge function with a strict "edit, don't regenerate" prompt → an image-generation model restyles walls/floor/ceiling/lighting/decor while a hard furniture-count anchor and explicit do/don't instructions prevent it from moving, recoloring, or adding/removing actual furniture → result uploaded to Cloudflare object storage → shown in a result modal.
- **6 style presets**: Realistic (passthrough), Modern, Italian, Warm & Cozy, Scandinavian, Luxury Classic.
- **Result actions**: Download (forces download even cross-origin) and **Share on WhatsApp** (deep link).
- Renders are saved (camera position/heading/FOV + title + URL) so they persist across reloads and can be pulled into the gallery or exported deck.
- Runs exclusively as a Cloudflare Pages Function now — duplicate Flask implementation was intentionally removed.

---

## 8. Export Features

- **Bill of Quantities (BOQ) PDF export** — groups placed furniture by product code (collapsing duplicates into quantities), computing line totals, dimensions, which rooms each item appears in, and product images, into a printable schedule.
- **PowerPoint pitch-deck export** — generates a full 16:9 branded proposal deck: cover slide (plan + "Design Proposal"), layout divider, per-floor layout slides with plan images and a north-arrow, a BOQ table slide, photoreal render slots, and a thank-you slide; brand colors/logo/website are overridable.
- **Camera-marked plan thumbnails** — small plan images annotated with the camera field-of-view cone showing exactly where each photoreal shot was taken, embedded in deck slides.
- **3D snapshot PNG download** directly from the viewer toolbar.

---

## 9. Payments & Other Cloudflare-Edge Integration

- **Razorpay payment webhook** (Cloudflare Worker) — verifies HMAC signature (rejects bad signatures so Razorpay doesn't retry), handles payment-captured/order-paid events, and atomically marks the associated project as "won" in a way that's safe against duplicate webhook deliveries.
- **AR support** — catalog items can carry a USDZ file and an "AR enabled" flag for iOS Quick Look AR try-before-you-buy; AR interaction events are logged per product for analytics.
- **R2 (object storage) tooling** — scripts to upload/list assets, a pipeline to bake and upload 2D top-down furniture icons from 3D models, and a GLB compression pipeline (Draco geometry compression + texture optimization).

---

## 10. Database Schema Highlights (Supabase migrations)

- `projects` — core project row (name, calibration, tenant/showroom/session ids, status, meta, rfq, published, share_token, title, cover image).
- `rooms` — polygon, label point, flooring, dimensions.
- `structural_elements` — walls/doors/windows with geometry, thickness, connections.
- `placed_furniture` — position/rotation/overrides per item.
- `plan_catalog_presets` — offline furniture-bundle presets.
- Furniture catalog table(s) (sofas, wardrobes, etc.) with pre-baked 2D icon URLs, prices, and AR (USDZ) columns.
- `plan_events` — append-only analytics log.
- `layout_snapshots` — per-room analytics/training data.
- `ar_events` — AR interaction analytics.
- `design_renders` — saved photoreal shots with camera position/heading/FOV.
- A Postgres RPC function for atomic full-layout saves (an alternative to the multi-step Flask save).
- (One checkout also has a vision-analysis cache table, to avoid re-calling the AI on identical plan images.)

---

## 11. Documentation In Repo

- `CONTEXT.md` — domain-language reference (Catalog Entry model, Furniture Item lifecycle, the Fetch → Adapt → Hold catalog pipeline) and an explicit "known limitations (accepted)" security section.
- `docs/vastu-rules.md` — the Vastu Shastra rule reference implemented in code.
- `docs/DRRT-system-thinking.md`, `docs/architecture.html`, `docs/note.md`, `docs/R2-UPLOAD.md`.

---

## 12. Tech Stack Summary

- **Build**: Vite 6.
- **3D**: Three.js + three-mesh-bvh (precise raycasting).
- **Backend/DB**: Flask (analysis + project APIs), Supabase (Postgres + storage + client SDK), Cloudflare Workers (Hono framework, payments) + Pages Functions (photoreal).
- **CAD import**: WASM DWG/DXF parser (`@mlightcad/libredwg-web`).
- **Export**: jsPDF + autotable (BOQ), pptxgenjs (deck).
- **Asset pipeline**: gltf-transform + Draco (GLB compression), sharp/pngjs (image processing), S3-compatible SDK (R2 upload).
- **Testing**: Node's built-in test runner covering catalog adaptation, icon policy, furniture lifecycle, share links, analysis regularization, plan cropping, GLB scale — the "pure function" layers all carry headless unit tests.

---

## 13. Recent Feature History (from git log)

- Fixed blurry wall/GLB textures via anisotropic filtering.
- Fixed PDF upload to analyze a rendered page instead of raw PDF bytes.
- Added Delete Room button and the two-click wall Cut tool.
- Improved Set Scale UX (auto-hide reference line, universal undo including calibration); added DWG import via WASM.
- Added LRU eviction for the GLB template cache and WebP texture compression.
- Wired client-side PPTX deck download, removed a dead duplicate Flask route.
- Consolidated Photoreal rendering to a single Cloudflare Pages Function implementation (removed duplicate Flask route).
