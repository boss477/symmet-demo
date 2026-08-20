/**
 * Vastu-aware furniture placement: pure rule + geometry helpers.
 *
 * No DOM/WebGL — headlessly testable like lib/furnitureBounds and lib/wallSnap.
 * Rules mirror docs/vastu-rules.md §4. Screen axes: +x right, +y down.
 * Direction is user-set via meta.northEdge ("top"|"right"|"bottom"|"left").
 */
import { polygonBBox } from "./geometry.js";
import { furnitureHalfExtents, isFurnitureInsideRooms, clampPlanBounds } from "./furnitureBounds.js";

var NORTH_FRAMES = {
  top: { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 } },
  right: { N: { x: 1, y: 0 }, E: { x: 0, y: 1 }, S: { x: -1, y: 0 }, W: { x: 0, y: -1 } },
  bottom: { N: { x: 0, y: 1 }, E: { x: -1, y: 0 }, S: { x: 0, y: -1 }, W: { x: 1, y: 0 } },
  left: { N: { x: -1, y: 0 }, E: { x: 0, y: -1 }, S: { x: 1, y: 0 }, W: { x: 0, y: 1 } },
};

/** Screen-space unit vectors {N,E,S,W} for the chosen North edge. */
export function northVectors(northEdge) {
  return NORTH_FRAMES[northEdge] || NORTH_FRAMES.top;
}

// Ordered matchers: first hit wins. Keyword tested against type/shape/richIcon.
// Note: generic "table" is intentionally NOT matched (coffee/side tables get no rule).
var RULES = [
  { cat: "bed", zone: "SW", face: "S", any: ["bed", "mattress", "king", "queen", "twin"] },
  { cat: "seating", zone: "S", face: "N", any: ["sofa", "couch", "loveseat", "sectional", "chaise", "lounge"] },
  { cat: "seating", zone: "S", face: "N", any: ["chair", "armchair", "stool"] },
  { cat: "storage", zone: "SW", face: null, any: ["wardrobe", "cupboard", "dresser", "bureau", "almirah", "closet"] },
  { cat: "nightstand", zone: "NW", face: null, any: ["nightstand"] },
  { cat: "kitchen", zone: "SE", face: "E", any: ["kitchen_island", "kitchen", "stove", "cooktop", "hob", "counter"] },
  { cat: "sink", zone: "NE", face: null, any: ["sink", "basin", "washbasin"] },
  { cat: "desk", zone: "N", face: "N", any: ["desk"] },
  { cat: "dining", zone: "NW", face: null, any: ["dining_table", "dining"] },
  { cat: "toilet", zone: "W", face: null, any: ["toilet", "wc", "commode"] },
  { cat: "bath", zone: "NE", face: null, any: ["bathtub", "tub"] },
  { cat: "plant", zone: "avoid:NE", face: null, any: ["plant", "tree"] },
];

/** Match a placed item to a Vastu rule, or null if its type has no rule. */
export function vastuRuleForItem(item) {
  if (!item) return null;
  var key = String(item.type || item.shape || item.richIcon || "").toLowerCase();
  if (!key) return null;
  for (var i = 0; i < RULES.length; i++) {
    var r = RULES[i];
    for (var j = 0; j < r.any.length; j++) {
      if (key.indexOf(r.any[j]) >= 0) {
        return { zone: r.zone, face: r.face, cat: r.cat };
      }
    }
  }
  return null;
}

var MARGIN = 0.01;

function zoneVector(zone, V) {
  // Sum each compass letter's unit vector. e.g. "SW" -> V.S + V.W.
  var sum = { x: 0, y: 0 };
  for (var i = 0; i < zone.length; i++) {
    var d = V[zone[i]];
    if (d) {
      sum.x += d.x;
      sum.y += d.y;
    }
  }
  return sum;
}

// Place the footprint against the bbox in the direction of `vec`.
// Component 0 -> centre that axis (edge midpoint); +/- -> max/min side, inset.
function placeByVector(vec, bb, hw, hd) {
  var x;
  var y;
  if (vec.x > 1e-9) x = bb.maxX - hw - MARGIN;
  else if (vec.x < -1e-9) x = bb.minX + hw + MARGIN;
  else x = (bb.minX + bb.maxX) / 2;
  if (vec.y > 1e-9) y = bb.maxY - hd - MARGIN;
  else if (vec.y < -1e-9) y = bb.minY + hd + MARGIN;
  else y = (bb.minY + bb.maxY) / 2;
  return { x: x, y: y };
}

/**
 * Target {x,y,rotationDeg} for a placed item within a room, or null if the item
 * type has no rule. Facing-aware rotation is added in Task 5 (returns the item's
 * current rotation for now). "avoid:" zones are handled in Task 4.
 */
export function vastuTargetInRoom(item, roomPolygon, northEdge) {
  var rule = vastuRuleForItem(item);
  if (!rule || !roomPolygon || roomPolygon.length < 3) return null;
  var V = northVectors(northEdge);
  var bb = polygonBBox(roomPolygon);
  var ext = furnitureHalfExtents(item);
  var rot = rule.face
    ? faceToRotation(rule.face, northEdge)
    : (item.rotationDeg != null ? item.rotationDeg : 0);

  if (rule.zone.indexOf("avoid:") === 0) {
    var avoid = rule.zone.slice("avoid:".length); // e.g. "NE"
    var avoidVec = zoneVector(avoid, V);
    var cx = (bb.minX + bb.maxX) / 2;
    var cy = (bb.minY + bb.maxY) / 2;
    var rel = { x: item.x - cx, y: item.y - cy };
    var towardAvoid = rel.x * avoidVec.x + rel.y * avoidVec.y;
    if (towardAvoid <= 1e-9) return null; // not in the bad zone -> leave it
    var opp = { x: -avoidVec.x, y: -avoidVec.y };
    var p = placeByVector(opp, bb, ext.hw, ext.hd);
    return { x: p.x, y: p.y, rotationDeg: rot };
  }

  var pos = placeByVector(zoneVector(rule.zone, V), bb, ext.hw, ext.hd);
  return { x: pos.x, y: pos.y, rotationDeg: rot };
}

var FRONT_AT_ZERO = { x: 0, y: 1 }; // icon front points down at rotationDeg 0

/**
 * Clockwise degrees to rotate an item so its front points toward `face`
 * (a compass letter) under the chosen North. Returns 0 when face is null.
 */
export function faceToRotation(face, northEdge) {
  if (!face) return 0;
  var target = northVectors(northEdge)[face];
  if (!target) return 0;
  var a = Math.atan2(FRONT_AT_ZERO.y, FRONT_AT_ZERO.x);
  var b = Math.atan2(target.y, target.x);
  var deg = Math.round(((b - a) * 180) / Math.PI);
  // normalize to (-180, 180]
  while (deg > 180) deg -= 360;
  while (deg <= -180) deg += 360;
  return deg;
}

function roomCentroid(poly) {
  var sx = 0;
  var sy = 0;
  for (var i = 0; i < poly.length; i++) {
    sx += poly[i].x;
    sy += poly[i].y;
  }
  return { x: sx / poly.length, y: sy / poly.length };
}

/**
 * After Vastu snap, slide `item` left/right (then up/down as fallback) until it
 * no longer overlaps any other furniture. Skips items with no valid position.
 * Operates in normalized 0–1 plan space. Mutates item.x / item.y in place.
 */
export function resolveVastuOverlaps(item, allFurniture, rooms) {
  if (!allFurniture || allFurniture.length <= 1) return item;

  var OVERLAP_GAP = 0.006; // normalized gap to keep between items
  var MAX_ITER = 12;

  for (var iter = 0; iter < MAX_ITER; iter++) {
    var extA = furnitureHalfExtents(item);
    var collider = null;

    for (var i = 0; i < allFurniture.length; i++) {
      var b = allFurniture[i];
      if (b === item || b.id === item.id) continue;
      if (b.x == null || b.y == null) continue;
      var extB = furnitureHalfExtents(b);
      var ox = (extA.hw + extB.hw) - Math.abs(item.x - b.x);
      var oy = (extA.hd + extB.hd) - Math.abs(item.y - b.y);
      if (ox > 1e-9 && oy > 1e-9) {
        collider = { b: b, ox: ox, oy: oy };
        break;
      }
    }

    if (!collider) break; // no overlap left

    var prevX = item.x;
    var prevY = item.y;
    var b = collider.b;
    var sepX = collider.ox + OVERLAP_GAP;
    var sepY = collider.oy + OVERLAP_GAP;

    // Try preferred x direction (push away from B)
    item.x = prevX + (prevX >= b.x ? sepX : -sepX);
    clampPlanBounds(item);
    if (isFurnitureInsideRooms(item, rooms)) continue;

    // Try opposite x direction
    item.x = prevX + (prevX >= b.x ? -sepX : sepX);
    clampPlanBounds(item);
    if (isFurnitureInsideRooms(item, rooms)) continue;

    // Fall back: try y (push away from B)
    item.x = prevX;
    item.y = prevY + (prevY >= b.y ? sepY : -sepY);
    clampPlanBounds(item);
    if (isFurnitureInsideRooms(item, rooms)) continue;

    // Try opposite y
    item.y = prevY + (prevY >= b.y ? -sepY : sepY);
    clampPlanBounds(item);
    if (isFurnitureInsideRooms(item, rooms)) continue;

    // Cannot separate — restore and stop
    item.x = prevX;
    item.y = prevY;
    break;
  }

  return item;
}

/**
 * Non-blocking house-level hint string, or null. Compares the room's position in
 * the unit plan (centre 0.5,0.5) against the chosen North. Never moves anything.
 */
export function vastuRoomHint(item, room, northEdge) {
  var rule = vastuRuleForItem(item);
  if (!rule || !room || !room.polygon || room.polygon.length < 3) return null;
  var V = northVectors(northEdge);
  var c = roomCentroid(room.polygon);
  var rel = { x: c.x - 0.5, y: c.y - 0.5 };
  var tol = 0.02;
  function comp(dir) {
    return rel.x * dir.x + rel.y * dir.y;
  }
  var n = comp(V.N) > tol;
  var e = comp(V.E) > tol;
  var s = comp(V.S) > tol;
  var w = comp(V.W) > tol;
  var isNE = n && e;

  if (rule.cat === "bed") {
    if (isNE || (e && !s && !w)) return "bedrooms suit the South/West of the house";
    return null;
  }
  if (rule.cat === "kitchen") {
    if (isNE) return "kitchen suits the South-East of the house";
    return null;
  }
  if (rule.cat === "toilet") {
    if (isNE) return "avoid toilets in the North-East of the house";
    return null;
  }
  if (rule.cat === "desk") {
    if (!(n || e)) return "study/desk suits the North-East of the house";
    return null;
  }
  return null;
}
