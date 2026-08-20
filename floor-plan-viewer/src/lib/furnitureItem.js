/**
 * Furniture Item module: the lifecycle of a Catalog Entry *placed* on a plan.
 *
 * A Furniture Item is the smeared concept of the codebase — born in four places
 * with different field subsets, then read/written by ~10 files that each defend
 * against absent fields. This module concentrates the field knowledge: how an
 * item is created, the questions consumers ask of it (isSofa, colour, label,
 * dimensions), and how it serializes. Callers ask the module instead of
 * re-deriving from raw fields — which is how field-name bugs (the photoreal
 * prompt reading f.label that no item carries) get designed out.
 *
 * Pure functions over plain data (no DOM/WebGL) so the lifecycle is headlessly
 * testable. Questions take the item plus its resolved Catalog Entry (canonical,
 * from lib/catalog.js) — the module never re-fetches or re-normalizes.
 *
 * See CONTEXT.md > "Furniture Item" for the field contract.
 *
 * Note: the heavy ctx-coupled mutators (applyCatalogSkuToItem, createFurnitureNearItem)
 * stay in lib/catalogSizing.js — they own wall-snap/dimension geometry, not field
 * knowledge. serialize() is surfaced here but implemented in lib/planMoat.js where
 * it lives beside room-geometry helpers.
 */

import {
  isSofaCatalogRow,
  isSeatingCatalogRow,
  parseSofaParams,
} from "./catalogSizing.js";
import { getCatalogRowColours, sofaColorLabel } from "./sofaColors.js";

// serialize is a Furniture Item question ("what does this item look like in the
// saved payload?") but its implementation needs room geometry, so it stays in
// planMoat and is re-exported here so consumers ask the item module.
export { serializeFurnitureItem as serialize } from "./planMoat.js";

/**
 * Birth site for a bare placed item (catalog click with no anchor). The raw
 * object literal that used to live at the call site, with the id/default rules
 * in one place. Geometry/size/icon come later via applyCatalogSkuToItem.
 * @param {{id?:string, catalogId?:string|null, type?:string, x?:number, y?:number, rotationDeg?:number}} [opts]
 */
export function create(opts) {
  opts = opts || {};
  return {
    id: opts.id || "f_" + Math.random().toString(36).slice(2, 10),
    catalogId: opts.catalogId != null ? opts.catalogId : null,
    type: opts.type || "chair",
    x: opts.x != null ? opts.x : 0.5,
    y: opts.y != null ? opts.y : 0.5,
    rotationDeg: opts.rotationDeg != null ? opts.rotationDeg : 0,
  };
}

/** Is this item a sofa? Item type/shape first, then its Catalog Entry. */
export function isSofa(item, entry) {
  if (!item) return false;
  var t = String(item.type || item.shape || "").toLowerCase();
  if (t.indexOf("sofa") >= 0 || t.indexOf("lounge") >= 0 || t.indexOf("sectional") >= 0) {
    return true;
  }
  return entry ? isSofaCatalogRow(entry) : false;
}

/** Does this item support a colour choice (sofa, seating, or coloured SKU)? */
export function isColorable(item, entry) {
  if (!item) return false;
  if (isSofa(item, entry)) return true;
  if (!entry) return false;
  if (isSeatingCatalogRow(entry)) return true;
  return getCatalogRowColours(entry).length > 0;
}

/**
 * The active colour id for an item: per-instance override → sofaParams →
 * Entry's listed colours → keyword parse. "" when none resolves.
 */
export function resolveColorId(item, entry) {
  if (item && item.sofaColorOverride) return item.sofaColorOverride;
  if (item && item.sofaParams && item.sofaParams.color) return item.sofaParams.color;
  if (entry) {
    var fromDb = getCatalogRowColours(entry);
    if (fromDb.length) return fromDb[0];
    var parsed = parseSofaParams(
      entry.keywords,
      entry.product_name,
      entry.category,
      entry.colours
    );
    return parsed.color || "";
  }
  return "";
}

/** Real-world size carried on the item (set by applyCatalogSkuToItem). */
export function dimensionsMm(item) {
  return {
    width_mm: item && item.catalogWidthMm != null ? item.catalogWidthMm : null,
    depth_mm: item && item.catalogDepthMm != null ? item.catalogDepthMm : null,
  };
}

/**
 * What the item *is*, in words — the single source for the photoreal prompt and
 * any human label. Resolves from the item + its Catalog Entry so no caller reads
 * raw fields (and so a label can never silently come back empty for a real SKU).
 * @returns {{label:string, material:(string|null), colorName:string}}
 */
export function describe(item, entry) {
  var label = (entry && (entry.product_name || entry.name)) || (item && item.type) || "";
  var colorId = isColorable(item, entry) ? resolveColorId(item, entry) : "";
  return {
    label: label,
    material: null,
    colorName: colorId ? sofaColorLabel(colorId) : "",
  };
}
