# Publish, Share Link & Public Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user share a furnished plan by an unguessable link that opens a read-only 3D viewer (the WhatsApp share), and optionally publish it to a public gallery — two independent visibility states.

**Architecture:** One migration adds `published` / `share_token` / `title` / `cover_image_url` to `projects`. Sharing and publishing write to the project row through the existing Supabase anon client (no Flask changes — consistent with the SKU portal). The read-only viewer reuses the existing `initFloorPlanViewer()` via a `/view/<token>` branch that auto-loads the scene through the existing `GET /api/projects/<id>` endpoint, enters 3D with `show3D()`, and hides editing chrome. GLBs decode with Draco on every path.

**Tech Stack:** Supabase (`projects` table, anon key), Three.js GLTFLoader + DRACOLoader, Vite multi-page build, Flask static serving, `node --test`.

---

## Why no Flask changes

`GET /api/projects/<id>` ([app.py:892](../../app.py)) already assembles the full viewer JSON (rooms + structural elements + furniture). `projects` has no RLS (migration 003), so the anon client can read/write it directly. So:
- **Share/Publish** = `projects` row updates via `@supabase/supabase-js`.
- **Token → project** = an anon `select id from projects where share_token = …`.
- **Viewer scene** = the existing `/api/projects/<id>` endpoint.

Enumeration is mitigated by the unguessable token, not RLS (security deferred, per spec).

---

## File structure

| File | Responsibility | New/Modify |
|---|---|---|
| `supabase/migrations/009_publish_and_share_projects.sql` | Add publish + share columns to `projects` | Create |
| `src/lib/shareLink.js` | Pure token generation, URL building, path parsing | Create |
| `scripts/share-link.test.mjs` | Unit tests for `shareLink.js` | Create |
| `src/services/projectShare.js` | Supabase wrappers: ensure token, publish, resolve token, list published | Create |
| `src/viewer/plan3dGlb.js:33` | Attach a shared `DRACOLoader` to the GLTFLoader | Modify |
| `src/viewer/shareControls.js` | Mount "Share link" + "Publish" buttons, wire to `projectShare` | Create |
| `src/viewer/floorPlanViewer.js` | Read-only `/view/<token>` auto-load branch; mount share controls | Modify |
| `gallery.html` + `src/gallery/main.js` | Public gallery page listing published projects | Create |
| `vite.config.js` | Add `gallery` build input | Modify |
| `app.py` | Serve `gallery.html` at `/gallery` | Modify |

---

## Task 1: Migration — publish + share columns

**Files:**
- Create: `supabase/migrations/009_publish_and_share_projects.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 009_publish_and_share_projects.sql
-- Publish (gallery) and link-share (token) are independent visibility states.

alter table if exists public.projects
  add column if not exists published boolean not null default false,
  add column if not exists share_token text unique,
  add column if not exists title text,
  add column if not exists cover_image_url text;

create index if not exists projects_published_created_at
  on public.projects (published, created_at desc);
```

- [ ] **Step 2: Apply it to the database**

Apply via your normal Supabase migration path (SQL editor or CLI) so the live `projects` table gains the four columns. Verify:

Run a one-row check (substitute creds from `.env`):
`curl -s "$VITE_SUPABASE_URL/rest/v1/projects?select=id,published,share_token,title,cover_image_url&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"`
Expected: JSON with the new fields present (null/false).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/009_publish_and_share_projects.sql
git commit -m "feat: add publish + share-token columns to projects"
```

---

## Task 2: Pure share-link helpers

**Files:**
- Create: `src/lib/shareLink.js`
- Test: `scripts/share-link.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// scripts/share-link.test.mjs
/** Share link helpers. Run: node --test scripts/share-link.test.mjs */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateShareToken, buildShareUrl, parseViewToken } from "../src/lib/shareLink.js";

describe("generateShareToken", function () {
  it("returns a URL-safe token of stable length", function () {
    var t = generateShareToken();
    assert.match(t, /^[A-Za-z0-9_-]{22}$/);
  });
  it("is unique across calls", function () {
    var seen = new Set();
    for (var i = 0; i < 500; i++) seen.add(generateShareToken());
    assert.equal(seen.size, 500);
  });
});

describe("buildShareUrl", function () {
  it("joins origin and token as a /view path", function () {
    assert.equal(buildShareUrl("abc", "https://app.example.com"), "https://app.example.com/view/abc");
  });
  it("trims a trailing slash on origin", function () {
    assert.equal(buildShareUrl("abc", "https://app.example.com/"), "https://app.example.com/view/abc");
  });
});

describe("parseViewToken", function () {
  it("extracts the token from a /view/<token> path", function () {
    assert.equal(parseViewToken("/view/abc123"), "abc123");
  });
  it("returns null for non-view paths", function () {
    assert.equal(parseViewToken("/manufacturer"), null);
    assert.equal(parseViewToken("/view/"), null);
    assert.equal(parseViewToken("/"), null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/share-link.test.mjs`
Expected: FAIL — cannot find module `../src/lib/shareLink.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/shareLink.js

/** 16 random bytes → 22-char base64url token. Uses Web Crypto (browser + Node 18+). */
export function generateShareToken() {
  var bytes = new Uint8Array(16);
  (globalThis.crypto || {}).getRandomValues(bytes);
  var bin = "";
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  var b64 = (typeof btoa === "function" ? btoa(bin) : Buffer.from(bytes).toString("base64"));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** origin + "/view/" + token, with any trailing slash on origin removed. */
export function buildShareUrl(token, origin) {
  return String(origin || "").replace(/\/$/, "") + "/view/" + token;
}

/** Extract a non-empty token from "/view/<token>", else null. */
export function parseViewToken(pathname) {
  var m = /^\/view\/([^/]+)$/.exec(String(pathname || ""));
  return m ? m[1] : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/share-link.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Add the npm test script**

In `package.json` `"scripts"`, add:

```json
"test:share-link": "node --test scripts/share-link.test.mjs",
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/shareLink.js scripts/share-link.test.mjs package.json
git commit -m "feat: pure share-link helpers (token, url, parse)"
```

---

## Task 3: Project share/publish service

**Files:**
- Create: `src/services/projectShare.js`

Thin Supabase wrappers (no unit test — network). Pure logic already covered in Task 2.

- [ ] **Step 1: Write the service**

```js
// src/services/projectShare.js
import { getSupabase } from "./supabase.js";
import { generateShareToken } from "../lib/shareLink.js";

function client() {
  var sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  return sb;
}

/** Ensure the project has a share_token; return it. */
export async function ensureShareToken(projectId) {
  var sb = client();
  var got = await sb.from("projects").select("share_token").eq("id", projectId).maybeSingle();
  if (got.error) throw got.error;
  if (got.data && got.data.share_token) return got.data.share_token;
  var token = generateShareToken();
  var upd = await sb.from("projects").update({ share_token: token }).eq("id", projectId);
  if (upd.error) throw upd.error;
  return token;
}

/** Publish to the gallery: set published, title, and (optional) cover; also ensure a token. */
export async function publishProject(projectId, opts) {
  opts = opts || {};
  var patch = { published: true };
  if (opts.title != null) patch.title = String(opts.title);
  if (opts.coverImageUrl != null) patch.cover_image_url = String(opts.coverImageUrl);
  var sb = client();
  var upd = await sb.from("projects").update(patch).eq("id", projectId);
  if (upd.error) throw upd.error;
  return ensureShareToken(projectId);
}

/** Resolve a share_token to a project id, or null. */
export async function getProjectIdByToken(token) {
  var got = await client().from("projects").select("id").eq("share_token", token).maybeSingle();
  if (got.error) throw got.error;
  return got.data ? got.data.id : null;
}

/** List published projects for the gallery feed. */
export async function listPublished() {
  var got = await client()
    .from("projects")
    .select("id, title, name, share_token, cover_image_url, created_at")
    .eq("published", true)
    .order("created_at", { ascending: false });
  if (got.error) throw got.error;
  return got.data || [];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/projectShare.js
git commit -m "feat: project share/publish service"
```

---

## Task 4: Draco-decode GLBs

**Files:**
- Modify: `src/viewer/plan3dGlb.js:1-2,33`

- [ ] **Step 1: Add the DRACOLoader import and a shared instance**

At the top of `src/viewer/plan3dGlb.js`, after the existing imports, add:

```js
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

/** One decoder shared across loads; Google-hosted WASM decoder. */
var _draco = null;
function dracoLoader() {
  if (!_draco) {
    _draco = new DRACOLoader();
    _draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
  }
  return _draco;
}
```

- [ ] **Step 2: Attach it to the GLTFLoader**

In `preloadDefaultSofaGlb`, change the loader construction (currently `var loader = new GLTFLoader();` at line 33) to:

```js
    var loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader());
```

(Draco-compressed GLBs now decode; uncompressed GLBs still load unchanged.)

- [ ] **Step 3: Build to verify it compiles**

Run: `npm run build`
Expected: success (no missing-module error for DRACOLoader).

- [ ] **Step 4: Commit**

```bash
git add src/viewer/plan3dGlb.js
git commit -m "feat: Draco decoding for GLB furniture"
```

---

## Task 5: Share + Publish controls

**Files:**
- Create: `src/viewer/shareControls.js`
- Modify: `src/viewer/floorPlanViewer.js` (mount the controls in the toolbar, near the existing file toolbar mount ~line 1282)

The current project id is the URL hash that `saveToDb` sets ([floorPlanViewer.js:1246](../../src/viewer/floorPlanViewer.js)). Controls require a saved project (a hash id).

- [ ] **Step 1: Write the controls module**

```js
// src/viewer/shareControls.js
import { ensureShareToken, publishProject } from "../services/projectShare.js";
import { buildShareUrl } from "../lib/shareLink.js";

function currentProjectId() {
  return (window.location.hash || "").replace(/^#/, "").trim();
}

function whatsappHref(text) {
  return "https://wa.me/?text=" + encodeURIComponent(text);
}

/** Mount "Share link" and "Publish" buttons into the given toolbar element. */
export function mountShareControls(toolbarEl) {
  var row = document.createElement("div");
  row.className = "share-controls";

  var shareBtn = document.createElement("button");
  shareBtn.type = "button";
  shareBtn.textContent = "Share link";
  var publishBtn = document.createElement("button");
  publishBtn.type = "button";
  publishBtn.textContent = "Publish";

  shareBtn.addEventListener("click", async function () {
    var pid = currentProjectId();
    if (!pid) { alert("Save the project first (it needs an ID)."); return; }
    try {
      var token = await ensureShareToken(pid);
      var url = buildShareUrl(token, window.location.origin);
      try { await navigator.clipboard.writeText(url); } catch (e) {}
      window.open(whatsappHref("View my 3D home design: " + url), "_blank");
    } catch (err) { alert("Share failed: " + (err.message || err)); }
  });

  publishBtn.addEventListener("click", async function () {
    var pid = currentProjectId();
    if (!pid) { alert("Save the project first (it needs an ID)."); return; }
    var title = window.prompt("Title for the public gallery:", "My home design");
    if (title == null) return;
    try {
      var token = await publishProject(pid, { title: title });
      var url = buildShareUrl(token, window.location.origin);
      alert("Published to the gallery.\nShare link: " + url);
    } catch (err) { alert("Publish failed: " + (err.message || err)); }
  });

  row.appendChild(shareBtn);
  row.appendChild(publishBtn);
  toolbarEl.appendChild(row);
}
```

- [ ] **Step 2: Mount the controls in the viewer**

In `src/viewer/floorPlanViewer.js`, add the import near the other `./` imports (top of file):

```js
import { mountShareControls } from "./shareControls.js";
```

Then, right after the file toolbar is mounted (after the `fileTb = mountFileToolbar(...)` block, before `geoTb = mountGeometryToolbar(...)` at ~line 1347), add:

```js
  mountShareControls(toolbarEl);
```

- [ ] **Step 3: Build and commit**

Run: `npm run build` (expect success).

```bash
git add src/viewer/shareControls.js src/viewer/floorPlanViewer.js
git commit -m "feat: share-link + publish controls in the editor"
```

> Cover image (`cover_image_url`) is left null in v1; the gallery falls back to a placeholder. Wiring a baked 3D snapshot as the cover (via `plan3dSnapshot.js`) is a follow-up — it needs the snapshot's blob/dataURL shape confirmed and an upload through `uploadPlanRaster` ([supabase.js](../../src/services/supabase.js)).

---

## Task 6: Read-only `/view/<token>` viewer

**Files:**
- Modify: `src/viewer/floorPlanViewer.js` (top of `initFloorPlanViewer`, and an auto-load block at the end of init)
- Modify: `src/styles/main.css` (read-only chrome hiding)

The catch-all `spa_fallback` ([app.py:1265](../../app.py)) already serves `index.html` for `/view/<anything>`, so no new route/page is needed — branch client-side.

- [ ] **Step 1: Add read-only detection + auto-load**

In `src/viewer/floorPlanViewer.js`, add the import near the top:

```js
import { parseViewToken } from "../lib/shareLink.js";
import { getProjectIdByToken } from "../services/projectShare.js";
```

Just before the very end of `initFloorPlanViewer` (after `show3D` and `applyAnalysisFromObject` are defined and after the toolbars are mounted), add:

```js
  var _viewToken = parseViewToken(window.location.pathname);
  if (_viewToken) {
    document.body.classList.add("readonly-share");
    (async function () {
      try {
        var pid = await getProjectIdByToken(_viewToken);
        if (!pid) { setLlmStatus("Shared design not found."); return; }
        var loaded = await fetch("/api/projects/" + pid).then(function (r) {
          if (!r.ok) throw new Error("status " + r.status);
          return r.json();
        });
        applyAnalysisFromObject(loaded);
        show3D();
      } catch (err) {
        setLlmStatus("Could not open shared design: " + (err.message || err));
      }
    })();
  }
```

(`setLlmStatus`, `applyAnalysisFromObject`, and `show3D` are all inner functions of `initFloorPlanViewer`, so they are in scope here.)

- [ ] **Step 2: Hide editing chrome in read-only mode**

Append to `src/styles/main.css`:

```css
/* Read-only shared viewer: hide editing chrome, keep the 3D view + camera controls. */
body.readonly-share #toolbar { display: none; }
body.readonly-share .share-controls { display: none; }
```

- [ ] **Step 3: Build to verify it compiles**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/viewer/floorPlanViewer.js src/styles/main.css
git commit -m "feat: read-only /view/<token> shared 3D viewer"
```

---

## Task 7: Public gallery page

**Files:**
- Create: `gallery.html`
- Create: `src/gallery/main.js`
- Modify: `vite.config.js` (add `gallery` input)
- Modify: `app.py` (serve `/gallery`)

- [ ] **Step 1: Write the gallery bootstrap**

```js
// src/gallery/main.js
import { listPublished } from "../services/projectShare.js";
import { buildShareUrl } from "../lib/shareLink.js";

function card(p) {
  var a = document.createElement("a");
  a.className = "g-card";
  a.href = buildShareUrl(p.share_token, window.location.origin);
  var img = document.createElement("div");
  img.className = "g-thumb";
  if (p.cover_image_url) img.style.backgroundImage = "url('" + p.cover_image_url + "')";
  var title = document.createElement("div");
  title.className = "g-title";
  title.textContent = p.title || p.name || "Untitled design";
  a.appendChild(img);
  a.appendChild(title);
  return a;
}

async function render() {
  var root = document.getElementById("gallery-root");
  root.textContent = "Loading…";
  try {
    var rows = await listPublished();
    root.textContent = "";
    if (!rows.length) { root.textContent = "No published designs yet."; return; }
    rows.filter(function (p) { return p.share_token; }).forEach(function (p) { root.appendChild(card(p)); });
  } catch (err) {
    root.textContent = "Failed to load gallery: " + (err.message || err);
  }
}

render();
```

- [ ] **Step 2: Write the HTML entry**

```html
<!-- gallery.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Design Gallery</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 1.5rem; }
    #gallery-root { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
    .g-card { display: block; text-decoration: none; color: inherit; border: 1px solid #eee; border-radius: 10px; overflow: hidden; }
    .g-thumb { height: 150px; background: #f0efe9 center/cover no-repeat; }
    .g-title { padding: .6rem .75rem; font-weight: 600; }
  </style>
</head>
<body>
  <h1>Design Gallery</h1>
  <div id="gallery-root"></div>
  <script type="module" src="/src/gallery/main.js"></script>
</body>
</html>
```

- [ ] **Step 3: Add the Vite input**

In `vite.config.js`, add to the `input` map (alongside `main` and, if Task from the portal plan was done, `manufacturer`):

```js
        gallery: resolve(__dirname, "gallery.html"),
```

- [ ] **Step 4: Add the Flask route**

In `app.py`, after the `index()` route, add:

```python
@app.route("/gallery", methods=["GET"])
def gallery():
    return serve_index("gallery.html")
```

- [ ] **Step 5: Build and commit**

Run: `npm run build` (expect `dist/gallery.html` to exist).

```bash
git add gallery.html src/gallery/main.js vite.config.js app.py
git commit -m "feat: public gallery of published designs"
```

---

## Task 8: Manual verification (end to end)

- [ ] **Step 1: Run the app**

Run: `npm start`.

- [ ] **Step 2: Share a private (unpublished) plan**

Load/build a furnished plan, save it (gives it a hash id), click **Share link**. Confirm a `/view/<token>` URL is produced. Open that URL in a fresh tab → the 3D scene with GLB furniture renders read-only, editing chrome hidden. This is the WhatsApp link.

- [ ] **Step 3: Confirm share works without publishing**

In Supabase, confirm the project row has `share_token` set but `published = false`. The `/view/<token>` link still works; the plan does NOT appear at `/gallery`.

- [ ] **Step 4: Publish and check the gallery**

Click **Publish**, set a title. Open `/gallery` → a card with that title appears and links to `/view/<token>`. Confirm an unpublished plan does not appear.

- [ ] **Step 5: Mobile/Draco sanity**

Open a `/view/<token>` link on a phone (or a throttled browser). The GLB furniture loads (Draco decoder fetched once from gstatic) and the scene is navigable.

- [ ] **Step 6: Run all unit tests**

Run: `node --test scripts/share-link.test.mjs`
Expected: PASS.

---

## Self-review notes

- **Spec coverage:** share-token independent of publish (Tasks 1,3,5), token-keyed read-only viewer (Task 6), Draco GLBs (Task 4), gallery of published only (Task 7) — all covered. OG preview image and RLS intentionally excluded (spec "Out of scope").
- **Type consistency:** `share_token` (DB) ↔ `parseViewToken`/`getProjectIdByToken` (token string) ↔ `buildShareUrl` consistent across tasks. `cover_image_url` set by `publishProject`, read by gallery `card()`.
- **Known v1 gap:** `cover_image_url` is not auto-populated (Task 5 note) — gallery shows a placeholder thumb until the snapshot-as-cover follow-up lands.
- **Security:** anon read/write of `projects` and the open `/view/<token>` are deliberate, time-boxed risks; lock down with auth + RLS before real external use.
- **Risk — read-only viewer:** Task 6 relies on `applyAnalysisFromObject`, `show3D`, and `setLlmStatus` being in scope at the end of `initFloorPlanViewer`. Verified they are inner functions of that closure ([floorPlanViewer.js:809,1190](../../src/viewer/floorPlanViewer.js)). If a future refactor extracts them, update the call sites.
```
