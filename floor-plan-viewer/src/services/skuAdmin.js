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

/** A write returned no rows: blocked by RLS or no matching Product Code. */
function assertAffected(data, productCode) {
  if (!data || data.length === 0) {
    throw new Error("No row written for \"" + productCode + "\" (blocked by row-level security, or code not found)");
  }
}

/** Update one SKU by Product Code with an editable-only patch. */
export async function updateSku(productCode, fields) {
  var patch = buildSkuPatch(fields);
  var { data, error } = await client().from(TABLE).update(patch).eq(IDENTITY, productCode).select();
  if (error) throw error;
  assertAffected(data, productCode);
}

/** Insert a new SKU. */
export async function insertSku(fields) {
  var row = buildSkuInsert(fields);
  var { data, error } = await client().from(TABLE).insert(row).select();
  if (error) throw error;
  assertAffected(data, row[IDENTITY]);
}

/** Delete one SKU by Product Code. */
export async function deleteSku(productCode) {
  var { data, error } = await client().from(TABLE).delete().eq(IDENTITY, productCode).select();
  if (error) throw error;
  assertAffected(data, productCode);
}
