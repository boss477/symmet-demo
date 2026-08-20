import { inferFurnitureIcon } from "./inferFurnitureIcon.js";
import { snapFurnitureFromWalls } from "./wallSnap.js";
import { parseSofaColor, sofaColorLabel, getCatalogRowColours } from "./sofaColors.js";

/** Legacy fallback when plan size unknown (avoid tiny icons) */
export var DEFAULT_MM_PER_PX = 1 / 3.78;

/**
 * When JSON has no calibration, assume the plan bitmap spans ~12 m across its long edge.
 * @param {number} planWidthPx
 * @param {number} planHeightPx
 */
export function fallbackMmPerPixel(planWidthPx, planHeightPx) {
  var spanPx = Math.max(planWidthPx || 0, planHeightPx || 0);
  if (spanPx < 1) return DEFAULT_MM_PER_PX;
  var assumedPlanSpanMm = 12000;
  return assumedPlanSpanMm / spanPx;
}

export function effectiveMmPerPixel(ctx) {
  if (ctx && ctx.mmPerPixel != null && ctx.mmPerPixel > 0) return ctx.mmPerPixel;
  var w = ctx && ctx.planWidthPx > 0 ? ctx.planWidthPx : 1000;
  var h = ctx && ctx.planHeightPx > 0 ? ctx.planHeightPx : 1000;
  return fallbackMmPerPixel(w, h);
}

export function mmToPx(mm, mmPerPixel) {
  if (mm == null || !isFinite(mm)) return null;
  var mpp = mmPerPixel != null && mmPerPixel > 0 ? mmPerPixel : DEFAULT_MM_PER_PX;
  return mm / mpp;
}

export function mmToNormalized(mm, mmPerPixel, planDimPx) {
  if (planDimPx == null || planDimPx < 1) return null;
  var px = mmToPx(mm, mmPerPixel);
  if (px == null) return null;
  return px / planDimPx;
}

function shapeFromCategory(category) {
  var c = String(category || "").toLowerCase();
  if (c.indexOf("sofa") >= 0 || c.indexOf("sectional") >= 0) return "sofa";
  if (c.indexOf("lounge") >= 0 && c.indexOf("chair") < 0) return "sofa";
  if (c.indexOf("chair") >= 0 || c.indexOf("stool") >= 0 || c.indexOf("armchair") >= 0) return "chair";
  if (c.indexOf("table") >= 0 || c.indexOf("dining") >= 0) return "table";
  if (c.indexOf("wardrobe") >= 0 || c.indexOf("almirah") >= 0 || c.indexOf("cupboard") >= 0) return "wardrobe";
  return "chair";
}

export function isSofaCatalogRow(row) {
  if (!row) return false;
  var ri = String(row.rich_icon || row.richIcon || "").toLowerCase();
  if (ri.indexOf("sofa") >= 0) return true;
  var cat = String(row.category || "").toLowerCase();
  if (cat.indexOf("sofa") >= 0) return true;
  if (cat.indexOf("lounge") >= 0 && cat.indexOf("chair") < 0) return true;
  if (cat.indexOf("sectional") >= 0) return true;
  return shapeFromCategory(row.category) === "sofa";
}

export function isChairCatalogRow(row) {
  if (!row || isSofaCatalogRow(row)) return false;
  var ri = String(row.rich_icon || row.richIcon || "").toLowerCase();
  if (ri.indexOf("chair") >= 0) return true;
  if (shapeFromCategory(row.category) === "chair") return true;
  var k = String(row.keywords || row.product_name || row.name || "").toLowerCase();
  return (
    k.indexOf("chair") >= 0 ||
    k.indexOf("stool") >= 0 ||
    k.indexOf("armchair") >= 0 ||
    k.indexOf("dining chair") >= 0
  );
}

/** Shearling sofas, armchairs, stools, dining chairs, etc. */
export function isSeatingCatalogRow(row) {
  return isSofaCatalogRow(row) || isChairCatalogRow(row);
}

export function filterSeatingCatalog(catalog) {
  return (catalog || []).filter(isSeatingCatalogRow);
}

export function parseSofaParams(keywords, productName, category, colours) {
  var k = [keywords, productName, category].filter(Boolean).join(" ").toLowerCase();
  var seats = 2;
  if (
    k.indexOf("single") >= 0 ||
    k.indexOf("1 seat") >= 0 ||
    k.indexOf("1-seat") >= 0 ||
    k.indexOf("1 seater") >= 0 ||
    k.indexOf("armchair") >= 0 ||
    k.indexOf("accent chair") >= 0 ||
    (k.indexOf("lounge") >= 0 && k.indexOf("chair") >= 0)
  ) {
    seats = 1;
  } else if (k.indexOf("double") >= 0 || k.indexOf("2 seat") >= 0 || k.indexOf("2-seater") >= 0) {
    seats = 2;
  } else if (k.indexOf("3 seat") >= 0 || k.indexOf("3-seater") >= 0 || k.indexOf("3 seater") >= 0) {
    seats = 3;
  } else {
    var seatMatch = k.match(/(\d+)\s*seater/);
    if (seatMatch) seats = parseInt(seatMatch[1], 10) || 2;
  }
  seats = Math.max(1, Math.min(6, seats));
  var hasLounge =
    (k.indexOf("lounge") >= 0 && k.indexOf("lounge chair") < 0) ||
    k.indexOf("chaise") >= 0 ||
    k.indexOf("sectional") >= 0;
  var hasArm = k.indexOf("no arm") < 0 && k.indexOf("armless") < 0;
  var params = { seats: seats, hasLounge: hasLounge, hasArm: hasArm };
  var color = parseSofaColor(keywords, productName, colours);
  if (color) params.color = color;
  return params;
}

/**
 * Seat count from catalog row: explicit sofa_seats, DB seater columns, then keywords.
 * @param {object|null} row
 */
export function inferSofaSeatsFromCatalogRow(row) {
  if (!row) return 2;
  if (row.sofa_seats != null) {
    return Math.max(1, Math.min(6, Number(row.sofa_seats) || 2));
  }
  var len2 = row["2-Seater Length (mm)"];
  var len3 = row["3-Seater Length (mm)"];
  if (len2 != null && len3 == null) return 2;
  if (len3 != null && len2 == null) return 3;
  if (len2 != null && len3 != null) {
    var w = row.width_mm != null ? Number(row.width_mm) : null;
    var l2 = Number(len2);
    var l3 = Number(len3);
    if (w != null && Math.abs(w - l3) < Math.abs(w - l2)) return 3;
    return 2;
  }
  return parseSofaParams(row.keywords, row.product_name, row.category, row.colours).seats;
}

/** @param {number} seats */
export function richSofaIconId(seats) {
  var n = Math.max(1, Math.min(3, seats || 2));
  return "sofa_" + n;
}

/**
 * Width/depth mm from DB row, with keyword/category fallbacks.
 * @param {object|null} row
 */
export function resolveCatalogDimensionsMm(row) {
  if (!row) return { width_mm: null, depth_mm: null };
  var w = row.width_mm != null ? row.width_mm : null;
  var d =
    row.depth_mm != null ? row.depth_mm : row.length_mm != null ? row.length_mm : null;
  if (w != null && d != null) {
    return { width_mm: Number(w), depth_mm: Number(d) };
  }
  var inf = inferFurnitureIcon(row, null);
  if (inf.defaultMm) {
    if (w == null) w = inf.defaultMm.w;
    if (d == null) d = inf.defaultMm.d;
  }
  return {
    width_mm: w != null ? Number(w) : null,
    depth_mm: d != null ? Number(d) : null,
  };
}

export function formatReplaceOptionLabel(row) {
  if (!row) return "";
  var name =
    row.name ||
    (row.product_name && row.product_code
      ? row.product_name + " · " + row.product_code
      : String(row.id || row.product_code || "SKU"));
  var dims = resolveCatalogDimensionsMm(row);
  var w = dims.width_mm;
  var d = dims.depth_mm;
  var seatNote = "";
  if (isSofaCatalogRow(row)) {
    var seats =
      row.sofa_seats != null
        ? row.sofa_seats
        : parseSofaParams(row.keywords, row.product_name, row.category).seats;
    seatNote = " · " + Math.min(3, Math.max(1, seats)) + "-seat";
  } else if (isChairCatalogRow(row)) {
    seatNote = " · chair";
  }
  if (w != null && d != null) {
    return name + " — " + Math.round(w) + "×" + Math.round(d) + " mm" + seatNote;
  }
  if (w != null) return name + " — W " + Math.round(w) + " mm" + seatNote;
  if (d != null) return name + " — D " + Math.round(d) + " mm" + seatNote;
  return name + seatNote;
}

export function catalogById(catalog, id) {
  if (!catalog || !id) return null;
  var sid = String(id);
  for (var i = 0; i < catalog.length; i++) {
    var row = catalog[i];
    if (String(row.id) === sid) return row;
    if (row.product_code && String(row.product_code) === sid) return row;
  }
  return null;
}

/**
 * Match furniture to a Shearling row (product_code). LLM ids are ignored unless they match DB.
 * @param {object} item
 * @param {Array<object>} catalog
 * @param {{ autoTypeDefault?: boolean }} opts
 */
export function resolveCatalogRowForItem(item, catalog, opts) {
  if (!item || !catalog || !catalog.length) return null;
  opts = opts || {};
  var row = catalogById(catalog, item.catalogId);
  if (row) return row;
  if (!opts.autoTypeDefault) return null;
  var t = String(item.type || item.shape || "").toLowerCase();
  if (t.indexOf("sofa") >= 0 || t.indexOf("couch") >= 0 || t.indexOf("lounge") >= 0) {
    return findSofaCatalogRow(catalog, null);
  }
  return null;
}

/**
 * Normalized width/height from catalog mm only (never LLM width/height/scale).
 * @returns {{ wNorm: number, hNorm: number }|null}
 */
export function furnitureNormDimensions(item, catalogRow, ctx) {
  if (!catalogRow) return null;
  var widthMm = catalogRow.width_mm != null ? catalogRow.width_mm : item.catalogWidthMm;
  var depthMm =
    catalogRow.depth_mm != null
      ? catalogRow.depth_mm
      : catalogRow.length_mm != null
        ? catalogRow.length_mm
        : item.catalogDepthMm;
  if (widthMm == null && depthMm == null) return null;

  var planW = ctx.planWidthPx > 0 ? ctx.planWidthPx : 1000;
  var planH = ctx.planHeightPx > 0 ? ctx.planHeightPx : 1000;
  var mpp = effectiveMmPerPixel(ctx);

  var wNorm = widthMm != null ? mmToNormalized(widthMm, mpp, planW) : null;
  var hNorm = depthMm != null ? mmToNormalized(depthMm, mpp, planH) : null;
  if (wNorm == null && hNorm == null) return null;
  if (wNorm == null) wNorm = hNorm;
  if (hNorm == null) hNorm = wNorm;
  return {
    wNorm: Math.min(0.85, Math.max(0.004, wNorm)),
    hNorm: Math.min(0.85, Math.max(0.004, hNorm)),
  };
}

export function formatCatalogDimensionsLabel(row, item) {
  if (!row) return "";
  var name =
    row.name ||
    (row.product_name && row.product_code
      ? row.product_name + " · " + row.product_code
      : String(row.id || row.product_code || "SKU"));
  var dims = resolveCatalogDimensionsMm(row);
  var w = dims.width_mm;
  var d = dims.depth_mm;
  var colorNote = "";
  if (isSofaCatalogRow(row)) {
    var colorId =
      (item && item.sofaColorOverride) ||
      (item && item.sofaParams && item.sofaParams.color) ||
      parseSofaColor(row.keywords, row.product_name, row.colours);
    if (colorId) colorNote = " · " + sofaColorLabel(colorId);
    var seats =
      (item && item.sofaSeats) ||
      row.sofa_seats ||
      parseSofaParams(row.keywords, row.product_name, row.category).seats;
    colorNote += " · " + Math.min(3, Math.max(1, seats)) + "-seat rich SVG";
  } else if (isChairCatalogRow(row)) {
    colorNote = " · chair rich SVG";
  }
  if (w != null && d != null) return name + " — " + Math.round(w) + " × " + Math.round(d) + " mm" + colorNote;
  if (w != null) return name + " — W " + Math.round(w) + " mm" + colorNote;
  if (d != null) return name + " — D " + Math.round(d) + " mm" + colorNote;
  return name + colorNote;
}

/** Attach catalog GLB (3D) + pre-baked plan2d PNG when present. */
function applyGlbFromCatalog(item, catalogRow, opts) {
  opts = opts || {};
  var url =
    (catalogRow && catalogRow.model_3d_url) ||
    (catalogRow && catalogRow.model3d_url) ||
    (catalogRow && catalogRow["3d_url"]) ||
    "";
  url = String(url || "").trim();
  var plan2d =
    (catalogRow && catalogRow.plan2d_glb_url) ||
    (catalogRow && catalogRow.plan2dGlbUrl) ||
    "";
  plan2d = String(plan2d || "").trim();
  var hasGlb = /^https?:\/\//i.test(url);
  var hasPlan2d = /^https?:\/\//i.test(plan2d);
  if (!hasGlb && !hasPlan2d) return false;
  if (hasGlb) {
    item.glbUrl = url;
    item.useGlbModel = true;
  }
  if (hasPlan2d && opts.plan2d !== false) {
    item.plan2dGlbUrl = plan2d;
    item.iconMode = "glb";
    delete item.useGlbBake;
  }
  if (catalogRow.height_mm != null) item.catalogHeightMm = Number(catalogRow.height_mm);
  return true;
}

function applySeatingIconFromCatalog(item, catalogRow) {
  if (isSofaCatalogRow(catalogRow)) {
    var params = parseSofaParams(
      catalogRow.keywords,
      catalogRow.product_name,
      catalogRow.category,
      catalogRow.colours
    );
    params.seats = inferSofaSeatsFromCatalogRow(catalogRow);
    var paletteIds = getCatalogRowColours(catalogRow);
    if (!item.sofaColorOverride && paletteIds.length) params.color = paletteIds[0];
    if (item.sofaColorOverride) params.color = item.sofaColorOverride;
    item.sofaParams = params;
    var seats = Math.max(1, Math.min(3, params.seats || 2));
    item.sofaSeats = seats;
    item.richIcon = richSofaIconId(seats);
    item.type = item.richIcon;
    item.shape = item.richIcon;
    item.iconMode = "svg";
    delete item.plan2dGlbUrl;
    delete item.useGlbBake;
    delete item.iconSource;
  } else if (isChairCatalogRow(catalogRow)) {
    var chairColours = getCatalogRowColours(catalogRow);
    item.sofaParams = {
      seats: 1,
      hasLounge: false,
      hasArm: true,
      color: item.sofaColorOverride || (chairColours.length ? chairColours[0] : undefined),
    };
    item.sofaSeats = 1;
    item.richIcon = "chair";
    item.type = "chair";
    item.shape = "chair";
    item.iconMode = "svg";
    delete item.plan2dGlbUrl;
    delete item.useGlbBake;
    delete item.iconSource;
  }
  applyGlbFromCatalog(item, catalogRow, { plan2d: false });
}

/**
 * Apply DB SKU to selected furniture: real mm size, type/icon, wall snap.
 */
export function applyCatalogSkuToItem(item, catalogRow, ctx) {
  if (!item || !catalogRow) return item;

  var planW = ctx.planWidthPx > 0 ? ctx.planWidthPx : 1000;
  var planH = ctx.planHeightPx > 0 ? ctx.planHeightPx : 1000;

  var resolved = resolveCatalogDimensionsMm(catalogRow);
  var widthMm = resolved.width_mm;
  var depthMm = resolved.depth_mm;

  delete item.scale;
  delete item.depth;
  delete item.width;
  delete item.height;

  if (widthMm != null) item.catalogWidthMm = widthMm;
  if (depthMm != null) item.catalogDepthMm = depthMm;
  if (widthMm != null || depthMm != null) {
    var dims = furnitureNormDimensions(
      item,
      { width_mm: widthMm, depth_mm: depthMm },
      ctx
    );
    if (dims) {
      item.width = dims.wNorm;
      item.height = dims.hNorm;
    }
  } else {
    console.warn(
      "[catalog] SKU " + (catalogRow.id || catalogRow.product_code) + " has no size even after fallback"
    );
  }

  item.catalogId = catalogRow.id || catalogRow.product_code;
  item.type = shapeFromCategory(catalogRow.category);
  item.shape = item.type;
  delete item.scale;

  if (isSeatingCatalogRow(catalogRow)) {
    applySeatingIconFromCatalog(item, catalogRow);
  } else {
    delete item.sofaParams;
    delete item.sofaColorOverride;
    delete item.sofaSeats;
    delete item.richIcon;
    delete item.iconMode;
  }

  var richIcon =
    catalogRow.rich_icon ||
    catalogRow.richIcon ||
    (catalogRow.sofa_seats != null ? richSofaIconId(catalogRow.sofa_seats) : null);
  if (richIcon && !item.richIcon) {
    item.richIcon = richIcon;
    item.type = richIcon;
    item.shape = richIcon;
    item.iconMode = "svg";
    delete item.useGlbBake;
    delete item.iconSource;
  }
  if (!isSeatingCatalogRow(catalogRow) && !item.useGlbModel) {
    applyGlbFromCatalog(item, catalogRow);
  }
  if (catalogRow.chair_count != null) item.chairCount = catalogRow.chair_count;
  if (catalogRow.sofa_seats != null && item.sofaSeats == null) {
    item.sofaSeats = catalogRow.sofa_seats;
  }
  if (catalogRow.side_table_plant) item.sideTablePlant = true;
  else if (catalogRow.side_table_plant === false) delete item.sideTablePlant;

  snapFurnitureFromWalls(item, ctx.walls || [], planW, planH, ctx.rooms || []);
  return item;
}

function itemWidthNorm(it) {
  return it.width != null ? it.width : it.scale != null ? it.scale : 0.06;
}

function itemHeightNorm(it) {
  return it.height != null ? it.height : it.depth != null ? it.depth : itemWidthNorm(it);
}

/** Prefer selected SKU when it is seating; otherwise first sofa/chair in catalog. */
export function findSeatingCatalogRow(catalog, preferId) {
  var row = preferId ? catalogById(catalog, preferId) : null;
  if (row && isSeatingCatalogRow(row)) return row;
  for (var i = 0; i < (catalog || []).length; i++) {
    if (isSeatingCatalogRow(catalog[i])) return catalog[i];
  }
  return null;
}

/** Prefer selected SKU when it is a sofa; otherwise first sofa in catalog. */
export function findSofaCatalogRow(catalog, preferId) {
  var row = preferId ? catalogById(catalog, preferId) : null;
  if (row && isSofaCatalogRow(row)) return row;
  for (var i = 0; i < (catalog || []).length; i++) {
    if (isSofaCatalogRow(catalog[i])) return catalog[i];
  }
  return null;
}

/**
 * New furniture piece beside anchor (tries right, left, below, above).
 */
export function createFurnitureNearItem(anchor, catalogRow, ctx, opts) {
  if (!anchor || !catalogRow) return null;
  opts = opts || {};
  var planW = ctx.planWidthPx > 0 ? ctx.planWidthPx : 1000;
  var planH = ctx.planHeightPx > 0 ? ctx.planHeightPx : 1000;
  var gap = opts.gap != null ? opts.gap : 0.015;
  var dirs = opts.directions || ["right", "left", "below", "above"];

  var item = {
    id: opts.id || "f-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
    x: anchor.x,
    y: anchor.y,
    rotationDeg: anchor.rotationDeg != null ? anchor.rotationDeg : anchor.rotation || 0,
    zIndex: (anchor.zIndex != null ? anchor.zIndex : 0) + 1,
  };
  applyCatalogSkuToItem(item, catalogRow, ctx);

  var aw = itemWidthNorm(anchor);
  var ah = itemHeightNorm(anchor);
  var nw = itemWidthNorm(item);
  var nh = itemHeightNorm(item);

  function offsetFor(dir) {
    if (dir === "right") return { dx: aw / 2 + nw / 2 + gap, dy: 0 };
    if (dir === "left") return { dx: -(aw / 2 + nw / 2 + gap), dy: 0 };
    if (dir === "below") return { dx: 0, dy: ah / 2 + nh / 2 + gap };
    if (dir === "above") return { dx: 0, dy: -(ah / 2 + nh / 2 + gap) };
    return { dx: 0, dy: 0 };
  }

  function inBounds(candidate) {
    var hw = nw / 2;
    var hd = nh / 2;
    return (
      candidate.x >= hw &&
      candidate.x <= 1 - hw &&
      candidate.y >= hd &&
      candidate.y <= 1 - hd
    );
  }

  for (var d = 0; d < dirs.length; d++) {
    var off = offsetFor(dirs[d]);
    var placed = Object.assign({}, item, {
      x: anchor.x + off.dx,
      y: anchor.y + off.dy,
    });
    snapFurnitureFromWalls(placed, ctx.walls || [], planW, planH, ctx.rooms || []);
    if (inBounds(placed)) return placed;
  }

  var fallbackOff = offsetFor("right");
  item.x = anchor.x + fallbackOff.dx;
  item.y = anchor.y + fallbackOff.dy;
  snapFurnitureFromWalls(item, ctx.walls || [], planW, planH, ctx.rooms || []);
  return item;
}
