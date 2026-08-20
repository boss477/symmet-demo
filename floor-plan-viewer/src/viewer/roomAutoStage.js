/**
 * Auto-stage furniture presets into room polygons (Drafted-style demo layout).
 */
import { polygonBBox } from "../lib/geometry.js";
import { catalogById } from "../lib/catalogSizing.js";

function roomName(room) {
  return String(room.type || room.name || room.id || "").toLowerCase();
}

function centroid(room) {
  if (room.labelPoint) return { x: room.labelPoint.x, y: room.labelPoint.y };
  var poly = room.polygon;
  if (!poly || !poly.length) return { x: 0.5, y: 0.5 };
  var sx = 0;
  var sy = 0;
  poly.forEach(function (p) {
    sx += p.x;
    sy += p.y;
  });
  return { x: sx / poly.length, y: sy / poly.length };
}

function clampInBBox(x, y, bbox, pad) {
  pad = pad || 0.08;
  return {
    x: Math.min(bbox.maxX - pad, Math.max(bbox.minX + pad, x)),
    y: Math.min(bbox.maxY - pad, Math.max(bbox.minY + pad, y)),
  };
}

function newId(prefix, n) {
  return prefix + "-" + n + "-" + Date.now().toString(36);
}

/**
 * @param {object} data plan JSON (mutated)
 * @param {Array} catalog
 * @param {{ replaceAuto?: boolean }} opts
 * @returns {number} items added
 */
export function autoStagePlan(data, catalog, opts) {
  opts = opts || {};
  var rooms = data.rooms || [];
  if (!rooms.length) return 0;

  if (opts.replaceAuto !== false) {
    data.furniture = (data.furniture || []).filter(function (f) {
      return f.stageSource !== "auto";
    });
  }

  var list = data.furniture || [];
  var seq = 0;

  rooms.forEach(function (room) {
    if (!room.polygon || room.polygon.length < 3) return;
    var name = roomName(room);
    var bb = polygonBBox(room.polygon);
    var c = centroid(room);
    var pad = 0.1;
    var bw = bb.maxX - bb.minX;
    var bh = bb.maxY - bb.minY;

    function add(partial) {
      seq++;
      list.push(
        Object.assign(
          {
            id: newId("auto", seq),
            stageSource: "auto",
            rotationDeg: 0,
            zIndex: seq,
          },
          partial
        )
      );
    }

    if (name.indexOf("garage") >= 0) return;

    if (name.indexOf("bath") >= 0) {
      add({ type: "toilet", richIcon: "toilet", x: bb.minX + bw * 0.25, y: bb.minY + bh * 0.3, catalogWidthMm: 400, catalogDepthMm: 650 });
      add({ type: "bathtub", richIcon: "bathtub", x: bb.minX + bw * 0.72, y: c.y, rotationDeg: 90, catalogWidthMm: 760, catalogDepthMm: 1700 });
      add({ type: "sink", richIcon: "sink", x: bb.minX + bw * 0.25, y: bb.minY + bh * 0.72, catalogWidthMm: 550, catalogDepthMm: 450 });
      return;
    }

    if (name.indexOf("bed") >= 0 || (name.indexOf("master") >= 0 && name.indexOf("bath") < 0)) {
      var bedSize = name.indexOf("master") >= 0 ? { w: 1930, d: 2030 } : { w: 1520, d: 2030 };
      add({
        type: "bed",
        richIcon: "bed",
        x: c.x,
        y: c.y,
        catalogWidthMm: bedSize.w,
        catalogDepthMm: bedSize.d,
      });
    }

  });

  data.furniture = list;
  return seq;
}

/**
 * Apply catalog mm to staged items when catalog row exists.
 */
export function enrichStagedFromCatalog(data, catalog) {
  (data.furniture || []).forEach(function (item) {
    if (item.stageSource !== "auto") return;
    if (item.stageRole === "living-glb-demo") return;
    var row = catalogById(catalog || [], item.catalogId);
    if (!row) return;
    if (row.width_mm != null) item.catalogWidthMm = row.width_mm;
    if (row.depth_mm != null) item.catalogDepthMm = row.depth_mm;
    if (row.model_3d_url || row["3d_url"]) {
      item.glbUrl = row.model_3d_url || row["3d_url"];
      item.useGlbModel = true;
    }
  });
}
