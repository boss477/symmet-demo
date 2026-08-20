import { createClient } from "@supabase/supabase-js";
import { DEFAULT_PLAN_CATALOG } from "../lib/planFurniturePresets.js";
import { catalogEntryFromSkuRow, catalogEntryFromPresetRow } from "../lib/catalog.js";

var _client = null;

function url() {
  return (
    import.meta.env.VITE_SUPABASE_URL ||
    (typeof window !== "undefined" && window.__SUPABASE_URL__) ||
    ""
  );
}

function key() {
  return (
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    (typeof window !== "undefined" && window.__SUPABASE_ANON_KEY__) ||
    ""
  );
}

export function getSupabase() {
  var u = url();
  var k = key();
  if (!u || !k) return null;
  if (!_client) _client = createClient(u, k);
  return _client;
}

export async function uploadPlanRaster(file, path) {
  var sb = getSupabase();
  if (!sb) throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
  var bucket = "floor-plans";
  var up = await sb.storage.from(bucket).upload(path, file, {
    upsert: true,
    contentType: file.type || "image/png",
  });
  if (up.error) throw up.error;
  var pub = sb.storage.from(bucket).getPublicUrl(path);
  return { publicUrl: pub.data.publicUrl };
}

// Note: the current DB table uses spaced column names (e.g. "Product Code").
// We select * and let the catalog adapter map with fallbacks.
var SHEARLING_SELECT = "*";

// Product codes hidden from the frontend until their assets are fixed.
// JUDY: its image_url (JUDY.webp) is a bar stool, but JUDY is a mustard-yellow
// L-shaped sofa (GLB/plan are correct). Hidden until the card photo is replaced.
// The rest below: their GLB files are missing from the chair-3d bucket (404 on
// the public pub-*.r2.dev URL, verified 2026-07-13); rows still point at the
// private r2.cloudflarestorage.com endpoint. Un-hide after re-uploading the
// GLB and updating the row's 3d_url to the public URL.
var HIDDEN_PRODUCT_CODES = {
  JUDY: true,
  "CH-MILA-002": true, // MILA.glb missing
  "AC-DEVA-006": true, // DEVA_ARM.glb missing
  "CH-MARIA-012": true, // MARIA.glb missing
  "BS-ANNETTE-019": true, // ANNETTE.glb missing
  "ZK-AKARI48HD-026": true, // AKARI_48HD.glb exists but no AKARI_48HD.png image in zakkaa-almirah bucket
};

/**
 * Public image URL for catalog UI (full URL, Supabase Storage path, or empty).
 * @param {object} row
 */
export function resolveCatalogImageUrl(row) {
  if (!row) return "";
  var raw =
    row.image_url != null
      ? row.image_url
      : row["image_url"] != null
        ? row["image_url"]
        : row["Image URL"];
  raw = String(raw || "").trim();
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) return raw;

  var sb = getSupabase();
  if (!sb) return raw;

  var path = raw.replace(/^\/+/, "");
  var bucket = "catalog-images";
  if (path.indexOf("/") >= 0) {
    var slash = path.indexOf("/");
    bucket = path.slice(0, slash);
    path = path.slice(slash + 1);
  }
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** Public GLB URL from shearling_catalog (`3d_url` or model_3d_url). */
export function resolveCatalogModel3dUrl(row) {
  if (!row) return "";
  // First candidate that is a full URL wins; empty/blank columns fall through
  // (a row can have model_3d_url = '' alongside a populated 3d_url).
  var candidates = [row.model_3d_url, row["3d_url"]];
  for (var i = 0; i < candidates.length; i++) {
    var raw = String(candidates[i] == null ? "" : candidates[i]).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
  }
  return "";
}

/** Pre-baked top-down PNG URL for 2D plan (from GLB). */
export function resolveCatalogPlan2dGlbUrl(row) {
  if (!row) return "";
  var raw =
    row.plan2d_glb_url != null
      ? row.plan2d_glb_url
      : row["plan2d_glb_url"] != null
        ? row["plan2d_glb_url"]
        : "";
  raw = String(raw || "").trim();
  return /^https?:\/\//i.test(raw) ? raw : "";
}

// Thin wrapper: supplies the storage-coupled URL resolvers to the pure adapter.
export function mapShearlingRow(row) {
  return catalogEntryFromSkuRow(row, {
    resolveImageUrl: resolveCatalogImageUrl,
    resolveModel3dUrl: resolveCatalogModel3dUrl,
    resolvePlan2dGlbUrl: resolveCatalogPlan2dGlbUrl,
  });
}

export async function fetchShearlingCatalog() {
  var sb = getSupabase();
  if (!sb) throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
  var res = await sb.from("shearling_catalog").select(SHEARLING_SELECT);
  if (res.error) throw res.error;
  var rows = res.data || [];
  if (!rows.length) {
    var backup = await sb.from("shearling_catalog_backup").select(SHEARLING_SELECT);
    if (!backup.error && backup.data && backup.data.length) rows = backup.data;
  }
  rows.sort(function (a, b) {
    var sa = a["S.No"] != null ? Number(a["S.No"]) : 0;
    var sbNo = b["S.No"] != null ? Number(b["S.No"]) : 0;
    return sa - sbNo;
  });
  var entries = rows.map(mapShearlingRow);

  // Zakkaa almirahs/wardrobes: same column shape as shearling_catalog, so they
  // go through the same adapter; only the vendor stamp differs.
  var zk = await sb.from("zakkaa").select(SHEARLING_SELECT);
  if (zk.error) {
    console.warn("[catalog] zakkaa:", zk.error.message);
  } else {
    (zk.data || [])
      .sort(function (a, b) {
        return (Number(a["S.No"]) || 0) - (Number(b["S.No"]) || 0);
      })
      .forEach(function (row) {
        var e = mapShearlingRow(row);
        e.vendor = "Zakkaa";
        entries.push(e);
      });
  }

  // Frontend shows only SKUs that carry BOTH a 3D GLB model and an image.
  // Rows without both stay in Supabase (nothing deleted) — they're just hidden here.
  return entries.filter(function (e) {
    return (
      e &&
      e.model_3d_url &&
      e.image_url &&
      !HIDDEN_PRODUCT_CODES[e.product_code]
    );
  });
}

/**
 * Persist a photoreal shot so the deck gallery survives page reloads.
 * Stores the R2 render URL plus the camera's plan-space position; the
 * key-plan thumbnail is rebuilt client-side from cam_x/cam_y/cam_heading/cam_fov.
 * No-op (returns null) when Supabase isn't configured.
 */
export async function saveDesignRender(designId, entry) {
  var sb = getSupabase();
  if (!sb || !designId) return null;
  var cam = entry.cam || null;
  var res = await sb
    .from("design_renders")
    .insert({
      design_id: String(designId),
      title: entry.title || null,
      url: entry.url,
      cam_x: cam && isFinite(cam.x) ? cam.x : null,
      cam_y: cam && isFinite(cam.y) ? cam.y : null,
      cam_heading: cam && isFinite(cam.heading) ? cam.heading : null,
      cam_fov: cam && isFinite(cam.fov) ? cam.fov : null,
    })
    .select()
    .single();
  if (res.error) throw res.error;
  return res.data;
}

/** All persisted photoreal shots for a design, oldest first. */
export async function fetchDesignRenders(designId) {
  var sb = getSupabase();
  if (!sb || !designId) return [];
  var res = await sb
    .from("design_renders")
    .select("*")
    .eq("design_id", String(designId))
    .order("created_at", { ascending: true });
  if (res.error) throw res.error;
  return res.data || [];
}

export function mapPlanPresetRow(row) {
  return catalogEntryFromPresetRow(row);
}

/** Offline presets, mapped through the same adapter as the DB rows. */
export function defaultPlanCatalog() {
  return DEFAULT_PLAN_CATALOG.map(mapPlanPresetRow);
}

/** Room furniture sets (Replace with dropdown). Falls back to embedded presets. */
export async function fetchPlanCatalog() {
  var sb = getSupabase();
  if (!sb) return defaultPlanCatalog();
  var res = await sb
    .from("plan_catalog_presets")
    .select("*")
    .order("sort_order", { ascending: true });
  if (res.error) {
    console.warn("[catalog] plan_catalog_presets:", res.error.message);
    return defaultPlanCatalog();
  }
  var rows = res.data || [];
  if (!rows.length) return defaultPlanCatalog();
  return rows.map(mapPlanPresetRow);
}
