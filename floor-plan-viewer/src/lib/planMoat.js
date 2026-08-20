/**
 * Moat payload helpers — scene JSON meta, RFQ, furniture provenance.
 */
import { pointInPolygon } from "./geometry.js";
import { polygonAreaSqMFromNorm } from "./calibration.js";

var SESSION_KEY = "planr_session_id";

export function resolveTenantId() {
  if (typeof window !== "undefined") {
    var params = new URLSearchParams(window.location.search);
    var fromQuery = params.get("tenant") || params.get("tenantId");
    if (fromQuery) return String(fromQuery).trim();
  }
  var fromEnv = import.meta.env.VITE_TENANT_ID;
  if (fromEnv) return String(fromEnv).trim();
  return "default";
}

export function resolveShowroomId() {
  if (typeof window !== "undefined") {
    var params = new URLSearchParams(window.location.search);
    var fromQuery = params.get("showroom") || params.get("showroomId");
    if (fromQuery) return String(fromQuery).trim();
  }
  var fromEnv = import.meta.env.VITE_SHOWROOM_ID;
  if (fromEnv) return String(fromEnv).trim();
  return null;
}

export function getOrCreateSessionId() {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return crypto && crypto.randomUUID ? crypto.randomUUID() : "session-" + Date.now();
  }
  var existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  var id = crypto && crypto.randomUUID ? crypto.randomUUID() : "session-" + Date.now();
  window.sessionStorage.setItem(SESSION_KEY, id);
  return id;
}

export function productCodeFromRow(row, catalogId) {
  if (row) return String(row.product_code || row.id || catalogId || "").trim() || null;
  return catalogId ? String(catalogId).trim() : null;
}

export function roomForPoint(x, y, rooms) {
  for (var i = 0; i < (rooms || []).length; i++) {
    var room = rooms[i];
    if (room.polygon && pointInPolygon(x, y, room.polygon)) return room;
  }
  return null;
}

export function serializeFurnitureItem(item, rooms, lookupRow) {
  var room = roomForPoint(item.x, item.y, rooms);
  var row = lookupRow ? lookupRow(item.catalogId) : null;
  var productCode = productCodeFromRow(row, item.catalogId);
  var out = {
    id: item.id,
    catalogId: item.catalogId || productCode,
    productCode: productCode,
    roomId: room ? room.id : item.roomId || null,
    x: item.x,
    y: item.y,
    rotationDeg: item.rotationDeg != null ? item.rotationDeg : 0,
    z: item.z != null ? item.z : 0,
    stageSource: item.stageSource || null,
    placementSource: item.placementSource || (item.stageSource === "auto" ? "auto_stage" : "manual"),
    category: item.type || item.shape || (row && row.category) || null,
    catalogWidthMm: item.catalogWidthMm != null ? item.catalogWidthMm : null,
    catalogDepthMm: item.catalogDepthMm != null ? item.catalogDepthMm : null,
    colorVariant: item.sofaColorOverride || (item.sofaParams && item.sofaParams.color) || null,
    vaastuAdjusted: !!item.vaastuAdjusted,
  };
  if (item.sofaColorOverride || item.sofaParams) {
    out.sofaColorOverride = item.sofaColorOverride;
    out.sofaParams = item.sofaParams;
  }
  return out;
}

export function buildRfqPayload(designBag, furniture, lookupRow, rooms) {
  var items = [];
  var seen = {};

  function addItem(code, catalogId, roomId) {
    if (!code || seen[code]) return;
    seen[code] = true;
    items.push({
      catalogId: catalogId || code,
      productCode: code,
      qty: 1,
      roomId: roomId || null,
    });
  }

  (designBag || []).forEach(function (code) {
    addItem(code, code, null);
  });

  (furniture || []).forEach(function (f) {
    if (!f.catalogId) return;
    var row = lookupRow ? lookupRow(f.catalogId) : null;
    var code = productCodeFromRow(row, f.catalogId);
    if (!code) return;
    var room = roomForPoint(f.x, f.y, rooms || []);
    addItem(code, f.catalogId, room ? room.id : null);
  });

  return { items: items, estimatedValueInr: null, status: "draft" };
}

export function buildPlanMeta(opts) {
  opts = opts || {};
  return {
    tenantId: opts.tenantId || resolveTenantId(),
    showroomId: opts.showroomId || resolveShowroomId(),
    staffId: opts.staffId || null,
    sessionId: opts.sessionId || getOrCreateSessionId(),
    source: opts.source || "showroom_ipad",
    vaastuEnabled: !!opts.vaastuEnabled,
    northEdge: opts.northEdge || "top",
    autoStageUsed: !!opts.autoStageUsed,
    catalogSnapshotId: opts.catalogSnapshotId || null,
    planImageUrl: opts.planImageUrl || null,
    cityTier: opts.cityTier || import.meta.env.VITE_CITY_TIER || null,
    savedAt: new Date().toISOString(),
    status: opts.status || "draft",
  };
}

export function roomMetrics(room, ctx) {
  if (!room || !room.polygon || room.polygon.length < 3) return null;
  var areaSqM = null;
  if (ctx && ctx.mmPerPixel) {
    areaSqM = polygonAreaSqMFromNorm(
      room.polygon,
      ctx.planWidthPx || 1000,
      ctx.planHeightPx || 1000,
      ctx.mmPerPixel / 1000
    );
  }
  var xs = room.polygon.map(function (p) {
    return p.x;
  });
  var ys = room.polygon.map(function (p) {
    return p.y;
  });
  var minX = Math.min.apply(null, xs);
  var maxX = Math.max.apply(null, xs);
  var minY = Math.min.apply(null, ys);
  var maxY = Math.max.apply(null, ys);
  var w = maxX - minX;
  var h = maxY - minY;
  var aspect = h > 0 ? w / h : null;
  return {
    roomClientId: room.id,
    roomType: room.type || room.name || room.id,
    roomAreaSqM: areaSqM,
    roomAspectRatio: aspect,
  };
}
