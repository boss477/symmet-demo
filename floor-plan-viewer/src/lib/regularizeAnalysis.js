/**
 * Tier-1 geometric regularization for vision-LLM floor plan analysis.
 * Cleans wall/room geometry in place (normalized 0-1 coordinates):
 *  1. Snap near-horizontal/vertical segments exactly onto the axis.
 *  2. Cluster shared X/Y coordinates so collinear walls align and
 *     adjacent rooms share edges.
 *  3. Close small gaps where a wall endpoint should meet another wall.
 *  4. Remove jitter vertices along straight runs.
 *  5. Snap door/window positions onto the nearest wall line.
 * Skips steps 1-2 when the plan is not Manhattan-dominant (rotated or
 * diagonal-heavy plans keep their angles).
 */

var ANGLE_SNAP_DEG = 10;
var MANHATTAN_MIN_FRACTION = 0.6;
var CLUSTER_EPS = 0.006;
var CLUSTER_MAX_SPAN = 0.012;
var JUNCTION_EPS = 0.012;
var SIMPLIFY_TOL = 0.004;
var OPENING_SNAP_MAX = 0.03;

/** @param {object} p */
function isPt(p) {
  return !!p && isFinite(p.x) && isFinite(p.y);
}

/**
 * Wall polylines (open) and room polygons (closed) that get geometry cleanup.
 * Filters out malformed points in place.
 * @param {object} data
 * @returns {Array<{points:Array<{x:number,y:number}>, closed:boolean}>}
 */
function gatherPaths(data) {
  var paths = [];
  (data.walls || []).forEach(function (w) {
    if (!w || !Array.isArray(w.points)) return;
    w.points = w.points.filter(isPt);
    if (w.points.length >= 2) paths.push({ points: w.points, closed: false });
  });
  (data.rooms || []).forEach(function (r) {
    if (!r || !Array.isArray(r.polygon)) return;
    r.polygon = r.polygon.filter(isPt);
    if (r.polygon.length >= 3) paths.push({ points: r.polygon, closed: true });
  });
  return paths;
}

/**
 * "h" | "v" if the segment is within maxDeg of an axis (in pixel-true
 * angles via sx/sy aspect factors), else null.
 */
function segmentAxis(a, b, sx, sy, maxDeg) {
  var dx = (b.x - a.x) * sx;
  var dy = (b.y - a.y) * sy;
  if (Math.hypot(dx, dy) < 1e-9) return null;
  var deg = (Math.abs(Math.atan2(dy, dx)) * 180) / Math.PI;
  if (deg <= maxDeg || deg >= 180 - maxDeg) return "h";
  if (Math.abs(deg - 90) <= maxDeg) return "v";
  return null;
}

/** Fraction of total segment length that is near-axis. */
function manhattanFraction(paths, sx, sy) {
  var total = 0;
  var axisAligned = 0;
  paths.forEach(function (path) {
    var pts = path.points;
    var count = path.closed ? pts.length : pts.length - 1;
    for (var i = 0; i < count; i++) {
      var a = pts[i];
      var b = pts[(i + 1) % pts.length];
      var len = Math.hypot((b.x - a.x) * sx, (b.y - a.y) * sy);
      total += len;
      if (segmentAxis(a, b, sx, sy, ANGLE_SNAP_DEG)) axisAligned += len;
    }
  });
  return total < 1e-9 ? 0 : axisAligned / total;
}

/** Set near-axis segments exactly horizontal/vertical (endpoint mean). */
function snapPathAxes(path, sx, sy) {
  var pts = path.points;
  var count = path.closed ? pts.length : pts.length - 1;
  for (var i = 0; i < count; i++) {
    var a = pts[i];
    var b = pts[(i + 1) % pts.length];
    var axis = segmentAxis(a, b, sx, sy, ANGLE_SNAP_DEG);
    if (axis === "h") {
      var y = (a.y + b.y) / 2;
      a.y = y;
      b.y = y;
    } else if (axis === "v") {
      var x = (a.x + b.x) / 2;
      a.x = x;
      b.x = x;
    }
  }
}

/**
 * 1D agglomerative clustering: sort all point coords on one axis, group
 * runs whose neighbor gap <= CLUSTER_EPS (capped at CLUSTER_MAX_SPAN per
 * cluster), snap each group to its mean. Keeps the two faces of a thick
 * wall apart because their gap exceeds CLUSTER_EPS.
 * @param {Array<{points:Array<{x:number,y:number}>}>} paths
 * @param {"x"|"y"} key
 */
function clusterAxisCoords(paths, key) {
  var refs = [];
  paths.forEach(function (path) {
    path.points.forEach(function (pt) {
      refs.push(pt);
    });
  });
  refs.sort(function (a, b) {
    return a[key] - b[key];
  });
  var i = 0;
  while (i < refs.length) {
    var j = i + 1;
    while (
      j < refs.length &&
      refs[j][key] - refs[j - 1][key] <= CLUSTER_EPS &&
      refs[j][key] - refs[i][key] <= CLUSTER_MAX_SPAN
    ) {
      j++;
    }
    var sum = 0;
    for (var k = i; k < j; k++) sum += refs[k][key];
    var mean = sum / (j - i);
    for (k = i; k < j; k++) refs[k][key] = mean;
    i = j;
  }
}

/**
 * Nearest point on an open polyline.
 * @returns {{point:{x:number,y:number}, dist:number}|null}
 */
function projectOnPolyline(pt, points) {
  var best = null;
  for (var i = 0; i < points.length - 1; i++) {
    var a = points[i];
    var b = points[i + 1];
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var lenSq = dx * dx + dy * dy;
    var t = lenSq < 1e-14 ? 0 : ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    var qx = a.x + t * dx;
    var qy = a.y + t * dy;
    var dist = Math.hypot(pt.x - qx, pt.y - qy);
    if (!best || dist < best.dist) best = { point: { x: qx, y: qy }, dist: dist };
  }
  return best;
}

/** Pull wall endpoints onto a nearby other wall (closes L/T junction gaps). */
function closeWallJunctions(walls) {
  var list = (walls || []).filter(function (w) {
    return w && Array.isArray(w.points) && w.points.length >= 2;
  });
  list.forEach(function (wall) {
    [0, wall.points.length - 1].forEach(function (idx) {
      var pt = wall.points[idx];
      var best = null;
      list.forEach(function (other) {
        if (other === wall) return;
        var proj = projectOnPolyline(pt, other.points);
        if (proj && (!best || proj.dist < best.dist)) best = proj;
      });
      if (best && best.dist > 1e-9 && best.dist <= JUNCTION_EPS) {
        pt.x = best.point.x;
        pt.y = best.point.y;
      }
    });
  });
}

function pointToSegmentDist(p, a, b) {
  var dx = b.x - a.x;
  var dy = b.y - a.y;
  var lenSq = dx * dx + dy * dy;
  var t = lenSq < 1e-14 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Drop duplicate/near-collinear interior vertices (jitter removal). */
function simplifyPath(path) {
  var pts = path.points;
  var minPts = path.closed ? 3 : 2;
  var changed = true;
  while (changed && pts.length > minPts) {
    changed = false;
    var start = path.closed ? 0 : 1;
    for (var i = start; i < (path.closed ? pts.length : pts.length - 1); i++) {
      if (pts.length <= minPts) break;
      var n = pts.length;
      var prev = pts[(i - 1 + n) % n];
      var cur = pts[i];
      var next = pts[(i + 1) % n];
      var dup = Math.hypot(cur.x - prev.x, cur.y - prev.y) < 1e-9;
      if (dup || pointToSegmentDist(cur, prev, next) <= SIMPLIFY_TOL) {
        pts.splice(i, 1);
        changed = true;
        i--;
      }
    }
  }
}

/** Snap door/window centers onto the nearest wall line (translates door polygons too). */
function snapOpeningsToWalls(items, walls) {
  (items || []).forEach(function (item) {
    var pos = item && item.position;
    if (!isPt(pos)) return;
    var best = null;
    (walls || []).forEach(function (w) {
      if (!w || !Array.isArray(w.points) || w.points.length < 2) return;
      var proj = projectOnPolyline(pos, w.points);
      if (proj && (!best || proj.dist < best.dist)) best = proj;
    });
    if (!best || best.dist > OPENING_SNAP_MAX) return;
    var dx = best.point.x - pos.x;
    var dy = best.point.y - pos.y;
    pos.x = best.point.x;
    pos.y = best.point.y;
    if (Array.isArray(item.polygon)) {
      item.polygon.forEach(function (p) {
        if (isPt(p)) {
          p.x += dx;
          p.y += dy;
        }
      });
    }
  });
}

/**
 * Regularize a fresh vision analysis in place.
 * @param {object} data analysis JSON (rooms/walls/doors/windows)
 * @param {{width?:number, height?:number}} [opts] source image pixels for
 *   aspect-true angle measurement; defaults to square.
 * @returns {object} the same data object
 */
export function regularizeAnalysis(data, opts) {
  if (!data || typeof data !== "object") return data;
  var width = opts && opts.width > 0 ? opts.width : 1;
  var height = opts && opts.height > 0 ? opts.height : 1;
  var m = Math.max(width, height);
  var sx = width / m;
  var sy = height / m;

  var paths = gatherPaths(data);
  if (paths.length && manhattanFraction(paths, sx, sy) >= MANHATTAN_MIN_FRACTION) {
    paths.forEach(function (path) {
      snapPathAxes(path, sx, sy);
    });
    clusterAxisCoords(paths, "x");
    clusterAxisCoords(paths, "y");
  }
  closeWallJunctions(data.walls);
  paths.forEach(simplifyPath);
  snapOpeningsToWalls(data.doors, data.walls);
  snapOpeningsToWalls(data.windows, data.walls);
  return data;
}
