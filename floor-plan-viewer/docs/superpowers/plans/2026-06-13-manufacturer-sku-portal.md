# Manufacturer SKU Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an open (no-login) admin page at `/manufacturer` where a manufacturer lists, edits, adds, and deletes SKUs in the `shearling_catalog` table.

**Architecture:** A new standalone HTML entry (`manufacturer.html`) boots a small portal module that reads/writes `shearling_catalog` rows directly through the existing Supabase anon client. Pure payload-building logic lives in a testable `skuAdmin.js` module; thin async wrappers call Supabase. Security (auth/RLS) is deliberately deferred.

**Tech Stack:** Vite multi-page build, `@supabase/supabase-js` (anon key), Flask static serving, `node --test` for unit tests.

---

## Schema reality (verified against the live table, 2026-06-13)

`shearling_catalog` was imported from a spreadsheet (never `CREATE`d in migrations). A live row has these columns:

`S.No`, `Product Code`, `Product Name`, `Category`, `Keywords`, `Leg/Base Options`, `Length / Depth (mm)`, `Width (mm)`, `Height (mm)`, `2-Seater Length (mm)`, `2-Seater Width (mm)`, `2-Seater Height (mm)`, `3-Seater Length (mm)`, `3-Seater Width (mm)`, `3-Seater Height (mm)`, `Other Dimensions`, `Catalog Page`, `Colours`, `Source File`, `image_url`, `3d_url`, `plan2d_glb_url`.

**The live table does NOT have `price` (migration 008 was never applied).** The portal edits only columns that exist. `Product Code` is the identity used for update/delete.

Editable columns exposed by the portal:
`Product Name`, `Category`, `Colours`, `Keywords`, `image_url`, `3d_url`, `plan2d_glb_url`.

---

## File structure

| File | Responsibility | New/Modify |
|---|---|---|
| `src/services/skuAdmin.js` | Pure payload builders + Supabase write wrappers for SKUs | Create |
| `scripts/sku-admin.test.mjs` | Unit tests for the pure builders | Create |
| `manufacturer.html` | Standalone portal page entry | Create |
| `src/manufacturer/portal.js` | Render SKU table, wire edit/add/delete | Create |
| `src/manufacturer/main.js` | Bootstrap that mounts the portal | Create |
| `vite.config.js` | Add `manufacturer` build input | Modify |
| `app.py` | Serve `manufacturer.html` at `/manufacturer` | Modify |
| `package.json` | Add `test:sku-admin` script | Modify |

---

## Task 1: Pure SKU payload builders

**Files:**
- Create: `src/services/skuAdmin.js`
- Test: `scripts/sku-admin.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// scripts/sku-admin.test.mjs
/**
 * SKU admin payload builders. Run: node --test scripts/sku-admin.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSkuPatch, buildSkuInsert, EDITABLE_SKU_COLUMNS } from "../src/services/skuAdmin.js";

describe("buildSkuPatch", function () {
  it("keeps only editable columns and trims strings", function () {
    var patch = buildSkuPatch({
      "Product Name": "  Verdana  ",
      "image_url": "https://r2/x.png",
      "S.No": 99, // not editable -> dropped
      "Product Code": "VERDANA", // identity -> dropped from patch
    });
    assert.deepEqual(patch, { "Product Name": "Verdana", "image_url": "https://r2/x.png" });
  });

  it("omits keys whose value is undefined or empty after trim", function () {
    var patch = buildSkuPatch({ "Category": "   ", "Colours": "grey" });
    assert.deepEqual(patch, { "Colours": "grey" });
  });

  it("exposes the editable column allowlist", function () {
    assert.ok(EDITABLE_SKU_COLUMNS.includes("Product Name"));
    assert.ok(!EDITABLE_SKU_COLUMNS.includes("S.No"));
    assert.ok(!EDITABLE_SKU_COLUMNS.includes("Product Code"));
  });
});

describe("buildSkuInsert", function () {
  it("requires a Product Code", function () {
    assert.throws(function () { buildSkuInsert({ "Product Name": "x" }); }, /Product Code/);
  });

  it("builds an insert row with code plus editable fields", function () {
    var row = buildSkuInsert({ "Product Code": " SHL-NEW ", "Product Name": " Sofa ", "S.No": 1 });
    assert.deepEqual(row, { "Product Code": "SHL-NEW", "Product Name": "Sofa" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/sku-admin.test.mjs`
Expected: FAIL — cannot find module `../src/services/skuAdmin.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/services/skuAdmin.js
import { getSupabase } from "./supabase.js";

/** Columns a manufacturer may edit. Identity ("Product Code") and "S.No" are excluded. */
export var EDITABLE_SKU_COLUMNS = [
  "Product Name",
  "Category",
  "Colours",
  "Keywords",
  "image_url",
  "3d_url",
  "plan2d_glb_url",
];

var TABLE = "shearling_catalog";
var IDENTITY = "Product Code";

function trimmed(value) {
  return value == null ? "" : String(value).trim();
}

/** Reduce a UI field object to a PostgREST patch of editable, non-empty columns. */
export function buildSkuPatch(fields) {
  var patch = {};
  EDITABLE_SKU_COLUMNS.forEach(function (col) {
    if (!(col in fields)) return;
    var v = trimmed(fields[col]);
    if (v !== "") patch[col] = v;
  });
  return patch;
}

/** Build an insert row: a non-empty Product Code plus any editable fields. */
export function buildSkuInsert(fields) {
  var code = trimmed(fields[IDENTITY]);
  if (!code) throw new Error("Product Code is required to add a SKU");
  var row = { "Product Code": code };
  Object.assign(row, buildSkuPatch(fields));
  return row;
}

function client() {
  var sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)");
  return sb;
}

/** Fetch all raw SKU rows for the portal table. */
export async function listSkus() {
  var { data, error } = await client().from(TABLE).select("*").order("Product Code", { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Update one SKU by Product Code with an editable-only patch. */
export async function updateSku(productCode, fields) {
  var patch = buildSkuPatch(fields);
  var { error } = await client().from(TABLE).update(patch).eq(IDENTITY, productCode);
  if (error) throw error;
}

/** Insert a new SKU. */
export async function insertSku(fields) {
  var row = buildSkuInsert(fields);
  var { error } = await client().from(TABLE).insert(row);
  if (error) throw error;
}

/** Delete one SKU by Product Code. */
export async function deleteSku(productCode) {
  var { error } = await client().from(TABLE).delete().eq(IDENTITY, productCode);
  if (error) throw error;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/sku-admin.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Add the npm test script**

In `package.json`, under `"scripts"`, add:

```json
"test:sku-admin": "node --test scripts/sku-admin.test.mjs",
```

- [ ] **Step 6: Commit**

```bash
git add src/services/skuAdmin.js scripts/sku-admin.test.mjs package.json
git commit -m "feat: SKU admin payload builders + write wrappers"
```

---

## Task 2: Portal UI module

**Files:**
- Create: `src/manufacturer/portal.js`

This module renders a table of SKUs with inline edit, an add form, and per-row delete. No test (DOM wiring); verified manually in Task 5.

- [ ] **Step 1: Write the portal renderer**

```js
// src/manufacturer/portal.js
import { listSkus, updateSku, insertSku, deleteSku, EDITABLE_SKU_COLUMNS } from "../services/skuAdmin.js";

var IDENTITY = "Product Code";

function el(tag, props, children) {
  var node = document.createElement(tag);
  if (props) Object.keys(props).forEach(function (k) { node[k] = props[k]; });
  (children || []).forEach(function (c) {
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}

function field(label, name, value) {
  var input = el("input", { type: "text", name: name, value: value == null ? "" : String(value) });
  return el("label", { className: "sku-field" }, [label, input]);
}

function rowEditor(row, onSaved) {
  var form = el("form", { className: "sku-row" });
  var code = row[IDENTITY] || "";
  form.appendChild(el("div", { className: "sku-code" }, [String(code)]));
  EDITABLE_SKU_COLUMNS.forEach(function (col) {
    form.appendChild(field(col, col, row[col]));
  });
  var status = el("span", { className: "sku-status" }, [""]);
  var save = el("button", { type: "submit" }, ["Save"]);
  var del = el("button", { type: "button", className: "sku-del" }, ["Delete"]);
  form.appendChild(save);
  form.appendChild(del);
  form.appendChild(status);

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    status.textContent = "Saving…";
    var fields = {};
    EDITABLE_SKU_COLUMNS.forEach(function (col) { fields[col] = form.elements[col].value; });
    try { await updateSku(code, fields); status.textContent = "Saved"; if (onSaved) onSaved(); }
    catch (err) { status.textContent = "Error: " + (err.message || err); }
  });
  del.addEventListener("click", async function () {
    if (!window.confirm("Delete " + code + "?")) return;
    status.textContent = "Deleting…";
    try { await deleteSku(code); form.remove(); }
    catch (err) { status.textContent = "Error: " + (err.message || err); }
  });
  return form;
}

function addForm(onAdded) {
  var form = el("form", { className: "sku-row sku-add" });
  form.appendChild(field("Product Code (required)", IDENTITY, ""));
  EDITABLE_SKU_COLUMNS.forEach(function (col) { form.appendChild(field(col, col, "")); });
  var status = el("span", { className: "sku-status" }, [""]);
  form.appendChild(el("button", { type: "submit" }, ["Add SKU"]));
  form.appendChild(status);
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    status.textContent = "Adding…";
    var fields = { "Product Code": form.elements[IDENTITY].value };
    EDITABLE_SKU_COLUMNS.forEach(function (col) { fields[col] = form.elements[col].value; });
    try { await insertSku(fields); status.textContent = "Added"; form.reset(); if (onAdded) onAdded(); }
    catch (err) { status.textContent = "Error: " + (err.message || err); }
  });
  return form;
}

export async function mountPortal(rootId) {
  var root = document.getElementById(rootId);
  root.textContent = "Loading SKUs…";
  async function refresh() {
    root.textContent = "";
    root.appendChild(el("h2", null, ["Add SKU"]));
    root.appendChild(addForm(refresh));
    root.appendChild(el("h2", null, ["Catalog"]));
    var rows;
    try { rows = await listSkus(); }
    catch (err) { root.appendChild(el("p", null, ["Failed to load: " + (err.message || err)])); return; }
    root.appendChild(el("p", null, [rows.length + " SKUs"]));
    rows.forEach(function (r) { root.appendChild(rowEditor(r, null)); });
  }
  await refresh();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/manufacturer/portal.js
git commit -m "feat: manufacturer portal UI module"
```

---

## Task 3: Page entry + bootstrap

**Files:**
- Create: `manufacturer.html`
- Create: `src/manufacturer/main.js`

- [ ] **Step 1: Create the bootstrap**

```js
// src/manufacturer/main.js
import { mountPortal } from "./portal.js";

mountPortal("portal-root").catch(function (err) {
  document.getElementById("portal-root").textContent = "Portal error: " + (err.message || err);
});
```

- [ ] **Step 2: Create the HTML entry**

```html
<!-- manufacturer.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Manufacturer Portal</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 1.5rem; }
    .sku-row { display: flex; flex-wrap: wrap; gap: .5rem; align-items: end; padding: .5rem; border-bottom: 1px solid #eee; }
    .sku-field { display: flex; flex-direction: column; font-size: .75rem; }
    .sku-field input { min-width: 9rem; }
    .sku-code { font-weight: 600; min-width: 8rem; }
    .sku-add { background: #f7f7f7; }
    .sku-status { font-size: .75rem; color: #555; }
  </style>
</head>
<body>
  <h1>Manufacturer Portal — Shearling</h1>
  <div id="portal-root"></div>
  <script type="module" src="/src/manufacturer/main.js"></script>
</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add manufacturer.html src/manufacturer/main.js
git commit -m "feat: manufacturer.html entry + bootstrap"
```

---

## Task 4: Wire the build and the server route

**Files:**
- Modify: `vite.config.js`
- Modify: `app.py:1245-1247` (add a route next to `index`)

- [ ] **Step 1: Add the Vite input**

In `vite.config.js`, change the `input` block to:

```js
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: ".",
  publicDir: "public",
  server: { port: 5173, strictPort: false },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        manufacturer: resolve(__dirname, "manufacturer.html"),
      },
    },
  },
});
```

- [ ] **Step 2: Add the Flask route**

In `app.py`, immediately after the `index()` route (line 1247), add:

```python
@app.route("/manufacturer", methods=["GET"])
def manufacturer():
    return serve_index("manufacturer.html")
```

Note: `serve_index` already injects `window.__SUPABASE_URL__` / `__SUPABASE_ANON_KEY__` into the served HTML, so the portal's Supabase client works with no extra wiring. The existing `spa_fallback` catch-all must stay BELOW this route (it already is).

- [ ] **Step 3: Build to verify the entry compiles**

Run: `npm run build`
Expected: build succeeds and `dist/manufacturer.html` exists.

- [ ] **Step 4: Commit**

```bash
git add vite.config.js app.py
git commit -m "feat: serve manufacturer portal at /manufacturer"
```

---

## Task 5: Manual verification

- [ ] **Step 1: Run the app**

Run: `npm start` (builds, then serves on the Flask port).

- [ ] **Step 2: Verify the portal**

Open `/manufacturer`. Confirm:
1. The SKU list loads (row count matches the catalog).
2. Edit a `Product Name` or `Colours` on a row → Save → status shows "Saved"; reload the page → the change persisted.
3. Add a SKU with a new `Product Code` → "Added"; reload → it appears in the list.
4. Delete that SKU → confirm → the row disappears; reload → still gone.

- [ ] **Step 3: Run the unit tests once more**

Run: `node --test scripts/sku-admin.test.mjs`
Expected: PASS.

---

## Self-review notes

- **Spec coverage:** portal route, list, edit, add, delete, no-login, no-RLS — all covered. Analytics intentionally excluded (separate future round, per spec "Out of scope").
- **Price:** the live table lacks the `price` column, so it is excluded from the editable set. If `price` is later added (apply migration `008_shearling_price.sql`), append `"price"` to `EDITABLE_SKU_COLUMNS` in `skuAdmin.js` — no other change needed.
- **Security:** anon writes to `shearling_catalog` are open by design this round; must be locked down (auth + RLS) before any external manufacturer access.
