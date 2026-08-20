/**
 * Catalog adapt seam: raw source rows -> one canonical Catalog Entry.
 *
 * Two sources, one shape. Every field is present and resolved here so no caller
 * re-derives dimensions, colours, or sofa params. Pure functions (URL resolution
 * is injected) so they are unit-testable without network or DOM.
 *
 * See CONTEXT.md > "Catalog Entry" for the field contract and `kind`/`vendor`.
 */

import { parseCatalogColourText } from "./sofaColors.js";
import { SHEARLING_PRICE_OVERRIDES } from "./catalogPrices.js";
import {
  parseSofaParams,
  resolveCatalogDimensionsMm,
  richSofaIconId,
  isSofaCatalogRow,
  inferSofaSeatsFromCatalogRow,
} from "./catalogSizing.js";

/** Shearling is the only vendor for now; one table per vendor, stamped here. */
export var SHEARLING_VENDOR = "Shearling";

/** Every Entry has exactly these keys; adapters override what they know. */
function entryDefaults() {
  return {
    id: null,
    kind: null,
    name: "",
    product_name: "",
    product_code: null,
    vendor: null,
    price: null,
    category: "",
    shape: "chair",
    width_mm: null,
    depth_mm: null,
    height_mm: null,
    seat_height_mm: null,
    arm_height_mm: null,
    available_colours: [],
    colours: null,
    sofa_seats: null,
    rich_icon: null,
    keywords: "",
    image_url: "",
    image_2d_url: "",
    plan2d_photo_url: "",
    model_3d_url: "",
    plan2d_glb_url: "",
    chair_count: null,
    side_table_plant: false,
  };
}

function pick(row) {
  // First non-null of the given keys (handles spaced spreadsheet headers).
  for (var i = 1; i < arguments.length; i++) {
    var v = row[arguments[i]];
    if (v != null) return v;
  }
  return null;
}

function num(v) {
  return v != null && v !== "" ? Number(v) : null;
}

/** Price may arrive as "₹ 64,999" or a number; reduce to a plain number. */
function parsePrice(row) {
  var raw = pick(row, "price", "Price", "Price (INR)", "MRP", "MRP (INR)", "mrp", "entry_fabric_price", "entry_leather_price");
  if (raw == null || raw === "") return null;
  var n = Number(String(raw).replace(/[^0-9.]/g, ""));
  return isFinite(n) && n > 0 ? n : null;
}

function shapeFromCategory(category) {
  var c = String(category || "").toLowerCase();
  if (c.indexOf("chair") >= 0 || c.indexOf("stool") >= 0) return "chair";
  if (c.indexOf("sofa") >= 0 || c.indexOf("lounge") >= 0) return "sofa";
  if (c.indexOf("table") >= 0 || c.indexOf("dining") >= 0) return "table";
  if (c.indexOf("wardrobe") >= 0 || c.indexOf("almirah") >= 0 || c.indexOf("cupboard") >= 0) return "wardrobe";
  return "chair";
}

function sofaPlanDimensions(row, category, keywords, productName) {
  if (shapeFromCategory(category) !== "sofa") return null;
  var seats = parseSofaParams(keywords, productName, category).seats || 2;
  var len3 = row["3-Seater Length (mm)"];
  var len2 = row["2-Seater Length (mm)"];
  var depth =
    row["Length / Depth (mm)"] != null
      ? row["Length / Depth (mm)"]
      : row.depth_mm != null
        ? row.depth_mm
        : row["Width (mm)"];
  var seaterLen =
    seats >= 3 && len3 != null ? len3 : seats >= 2 && len2 != null ? len2 : null;
  var baseWidth = row["Width (mm)"] != null ? row["Width (mm)"] : row.width_mm;
  var width;
  if (seaterLen != null) {
    // Vendor gave a full seater length — trust it as the footprint width.
    width = Number(seaterLen);
  } else if (baseWidth != null) {
    // No seater-length column: the stored width is a per-seat/single value, so a
    // multi-seat sofa would otherwise be as narrow as a chair. Scale by seat
    // count so a 2-seater reads longer than a 1-seat piece. Guard on <900mm so a
    // width already storing a real multi-seat footprint isn't inflated.
    width = Number(baseWidth);
    if (seats >= 2 && width < 900) width = width * seats;
  } else {
    width = null;
  }
  if (width == null && depth == null) return null;
  return {
    width_mm: width != null ? Number(width) : null,
    depth_mm: depth != null ? Number(depth) : null,
  };
}

function fullUrl(raw) {
  raw = String(raw == null ? "" : raw).trim();
  return /^https?:\/\//i.test(raw) ? raw : "";
}

// Pure defaults: read the URL field and pass full https URLs straight through
// (the Cloudflare R2 link convention). Storage paths resolve to "" here;
// production injects the storage-aware resolvers from services/supabase.js.
var DEFAULT_URL_DEPS = {
  resolveImageUrl: function (row) {
    return fullUrl(row.image_url != null ? row.image_url : row["Image URL"]);
  },
  resolveModel3dUrl: function (row) {
    return fullUrl(row.model_3d_url != null ? row.model_3d_url : row["3d_url"]);
  },
  resolvePlan2dGlbUrl: function (row) {
    return fullUrl(row.plan2d_glb_url);
  },
};

/**
 * Adapt a shearling_catalog row (real SKU) into a canonical Catalog Entry.
 * @param {object} row  raw DB row (may use spaced column names)
 * @param {{resolveImageUrl?:Function, resolveModel3dUrl?:Function, resolvePlan2dGlbUrl?:Function}} [deps]
 * @returns {object} Catalog Entry, kind "sku"
 */
export function catalogEntryFromSkuRow(row, deps) {
  deps = deps || DEFAULT_URL_DEPS;
  var resolveImageUrl = deps.resolveImageUrl || DEFAULT_URL_DEPS.resolveImageUrl;
  var resolveModel3dUrl = deps.resolveModel3dUrl || DEFAULT_URL_DEPS.resolveModel3dUrl;
  var resolvePlan2dGlbUrl = deps.resolvePlan2dGlbUrl || DEFAULT_URL_DEPS.resolvePlan2dGlbUrl;

  var productCode = pick(row, "product_code", "Product Code");
  var productName = pick(row, "product_name", "Product Name");
  var category = pick(row, "category", "Category");
  var keywords = pick(row, "keywords", "Keywords");

  var widthMm = pick(row, "width_mm", "Width (mm)");
  var depthMm = row.depth_mm != null
    ? row.depth_mm
    : row.length_mm != null
      ? row.length_mm
      : row["Length / Depth (mm)"];
  var heightMm = pick(row, "height_mm", "Height (mm)");

  var sofaDims = sofaPlanDimensions(row, category, keywords, productName);
  if (sofaDims) {
    if (sofaDims.width_mm != null) widthMm = sofaDims.width_mm;
    if (sofaDims.depth_mm != null) depthMm = sofaDims.depth_mm;
  }

  var coloursRaw = pick(row, "colours", "Colours");
  var imageUrl = resolveImageUrl(row);

  var entry = entryDefaults();
  entry.id = productCode;
  entry.kind = "sku";
  entry.name = (productName || "") + " · " + (productCode || "");
  entry.product_name = productName;
  entry.product_code = productCode;
  entry.vendor = SHEARLING_VENDOR;
  entry.price = parsePrice(row);
  if (entry.price == null && productCode != null && SHEARLING_PRICE_OVERRIDES[productCode] != null) {
    entry.price = SHEARLING_PRICE_OVERRIDES[productCode];
  }
  entry.category = category || "";
  entry.keywords = keywords != null ? String(keywords) : "";
  entry.colours = coloursRaw != null ? String(coloursRaw) : null;
  entry.width_mm = num(widthMm);
  entry.depth_mm = num(depthMm);
  entry.height_mm = num(heightMm);
  entry.seat_height_mm = num(row.seat_height_mm);
  entry.arm_height_mm = num(row.arm_height_mm);
  entry.image_url = imageUrl;
  entry.image_2d_url = imageUrl;
  entry.plan2d_photo_url = imageUrl;
  entry.model_3d_url = resolveModel3dUrl(row);
  entry.plan2d_glb_url = resolvePlan2dGlbUrl(row);
  entry.shape = shapeFromCategory(category);

  var resolved = resolveCatalogDimensionsMm(entry);
  entry.width_mm = resolved.width_mm;
  entry.depth_mm = resolved.depth_mm;
  entry.available_colours = parseCatalogColourText(coloursRaw, keywords, productName);

  if (isSofaCatalogRow(entry)) {
    var seats = inferSofaSeatsFromCatalogRow(Object.assign({}, entry, row));
    entry.sofa_seats = seats;
    entry.rich_icon = richSofaIconId(seats);
  } else if (entry.shape === "wardrobe") {
    entry.rich_icon = "wardrobe";
  } else {
    var catLower = String(category || "").toLowerCase();
    if (catLower.indexOf("chair") >= 0 || catLower.indexOf("stool") >= 0) {
      entry.rich_icon = "chair";
    }
  }
  return entry;
}

/**
 * Adapt a plan_catalog_presets row (or an offline DEFAULT_PLAN_CATALOG entry)
 * into a canonical Catalog Entry. Fully resolves so presets match SKUs in shape.
 * @param {object} row
 * @returns {object} Catalog Entry, kind "preset"
 */
export function catalogEntryFromPresetRow(row) {
  var entry = entryDefaults();
  entry.id = row.id;
  entry.kind = "preset";
  entry.name = row.name || "";
  entry.product_name = row.name || "";
  entry.category = row.category || "";
  entry.keywords = row.keywords != null ? String(row.keywords) : "";
  entry.width_mm = num(row.width_mm);
  entry.depth_mm = num(row.depth_mm);
  entry.height_mm = num(row.height_mm);
  entry.chair_count = num(row.chair_count);
  entry.sofa_seats = num(row.sofa_seats);
  entry.side_table_plant = !!row.side_table_plant;
  entry.rich_icon = row.rich_icon || null;
  entry.shape = row.shape || shapeFromCategory(row.category) || row.rich_icon || "chair";

  var resolved = resolveCatalogDimensionsMm(entry);
  entry.width_mm = resolved.width_mm;
  entry.depth_mm = resolved.depth_mm;
  return entry;
}

/**
 * Index a list of Catalog Entries for O(1) lookup by id or product_code,
 * replacing per-file catalogById scans and the two-list lookupCatalogRow.
 * @param {Array<object>} entries
 * @returns {{ by_id: (id: string) => object|null, all: () => Array<object> }}
 */
export function createCatalogIndex(entries) {
  var list = entries || [];
  var map = new Map();
  list.forEach(function (e) {
    if (!e) return;
    if (e.id != null) map.set(String(e.id), e);
    if (e.product_code != null && !map.has(String(e.product_code))) {
      map.set(String(e.product_code), e);
    }
  });
  return {
    by_id: function (id) {
      return id == null ? null : map.get(String(id)) || null;
    },
    all: function () {
      return list.slice();
    },
  };
}
