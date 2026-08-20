/**
 * Generates fixtures/geometry-cases.json by running the canonical
 * src/lib/geometry.js implementation. Boundary (on-edge/on-vertex) query
 * expectations are whatever the canonical impl returns — recorded, not derived.
 *
 * Run: node scripts/gen-geometry-fixtures.mjs
 * Only rerun when geometry.js behavior is INTENTIONALLY changed; the fixture
 * diff in review then shows exactly what behavior moved.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pointInPolygon, polygonArea } from "../src/lib/geometry.js";

var square = [
  { x: 0.2, y: 0.2 },
  { x: 0.8, y: 0.2 },
  { x: 0.8, y: 0.8 },
  { x: 0.2, y: 0.8 },
];

var cases = [
  {
    name: "convex-square",
    polygon: square,
    queryPoints: [
      { x: 0.5, y: 0.5 },
      { x: 0.1, y: 0.5 },
      { x: 0.9, y: 0.5 },
      { x: 0.5, y: 0.1 },
      { x: 0.2, y: 0.5 }, // on left edge
      { x: 0.8, y: 0.5 }, // on right edge
      { x: 0.5, y: 0.2 }, // on top (horizontal) edge
      { x: 0.2, y: 0.2 }, // on vertex
    ],
  },
  {
    name: "concave-L-shape",
    polygon: [
      { x: 0.1, y: 0.1 },
      { x: 0.6, y: 0.1 },
      { x: 0.6, y: 0.4 },
      { x: 0.3, y: 0.4 },
      { x: 0.3, y: 0.7 },
      { x: 0.1, y: 0.7 },
    ],
    queryPoints: [
      { x: 0.2, y: 0.2 },
      { x: 0.5, y: 0.2 },
      { x: 0.2, y: 0.6 },
      { x: 0.5, y: 0.6 }, // in the notch — outside
      { x: 0.3, y: 0.55 }, // on inner vertical edge
    ],
  },
  {
    name: "triangle",
    polygon: [
      { x: 0.5, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ],
    queryPoints: [
      { x: 0.5, y: 0.5 },
      { x: 0.15, y: 0.2 },
      { x: 0.5, y: 0.1 }, // on apex vertex
      { x: 0.5, y: 0.9 }, // on horizontal base edge
    ],
  },
  {
    name: "degenerate-empty",
    polygon: [],
    queryPoints: [{ x: 0.5, y: 0.5 }],
  },
  {
    name: "degenerate-one-point",
    polygon: [{ x: 0.5, y: 0.5 }],
    queryPoints: [{ x: 0.5, y: 0.5 }],
  },
  {
    name: "degenerate-two-points",
    polygon: [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.8 },
    ],
    queryPoints: [
      { x: 0.5, y: 0.5 },
      { x: 0.2, y: 0.2 },
    ],
  },
  {
    name: "horizontal-edge-pentagon",
    // Long horizontal top edge — the case where the old Python impl read a
    // stale xints value.
    polygon: [
      { x: 0.1, y: 0.3 },
      { x: 0.9, y: 0.3 },
      { x: 0.9, y: 0.7 },
      { x: 0.5, y: 0.9 },
      { x: 0.1, y: 0.7 },
    ],
    queryPoints: [
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.2 },
      { x: 0.5, y: 0.3 }, // on the horizontal edge
      { x: 0.05, y: 0.3 }, // level with horizontal edge, outside
      { x: 0.5, y: 0.85 },
    ],
  },
  {
    name: "square-ccw-winding",
    polygon: square.slice().reverse(),
    queryPoints: [
      { x: 0.5, y: 0.5 },
      { x: 0.1, y: 0.5 },
    ],
  },
];

var out = {
  _comment:
    "Shared JS/Python fixtures for pointInPolygon + polygonArea (shoelace). " +
    "Canonical impl: src/lib/geometry.js; Python transliteration: app.py. " +
    "GENERATED FILE — do not edit by hand; regenerate with " +
    "`node scripts/gen-geometry-fixtures.mjs`, which runs the canonical JS impl " +
    "and records its output. For on-edge and on-vertex query points the result " +
    "is implementation-defined (ray casting with strict < is not " +
    "boundary-consistent) — these expectations lock the current behavior for " +
    "parity, they are not mathematical truth. " +
    "Run: node --test scripts/geometry.test.mjs AND pytest tests/test_geometry.py",
  cases: cases.map(function (c) {
    return {
      name: c.name,
      polygon: c.polygon,
      area: polygonArea(c.polygon),
      queries: c.queryPoints.map(function (q) {
        return { x: q.x, y: q.y, inside: pointInPolygon(q.x, q.y, c.polygon) };
      }),
    };
  }),
};

var outPath = fileURLToPath(new URL("../fixtures/geometry-cases.json", import.meta.url));
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log("wrote", outPath);
out.cases.forEach(function (c) {
  console.log(c.name, "area=" + c.area, c.queries.map(function (q) { return q.inside ? 1 : 0; }).join(""));
});
