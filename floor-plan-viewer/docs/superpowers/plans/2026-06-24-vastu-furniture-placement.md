# Vastu-aware Furniture Auto-placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the Vaastu toggle is ON, a freshly placed sofa/chair/bed/cupboard/desk/etc. snaps once to its Vastu-correct zone within the room it lands in, oriented to the user-chosen North, then drags freely afterward.

**Architecture:** A pure, headless-testable module `src/lib/vastuPlacement.js` holds all rule + geometry logic (no DOM/WebGL), mirroring the existing `lib/furnitureBounds`/`lib/wallSnap` pattern. `src/viewer/floorPlanViewer.js` gets a 4-way North control (`meta.northEdge`) and a thin snap hook in the fresh-drop branch of `addCatalogRowToPlan`. Rules are sourced from `docs/vastu-rules.md` §4.

**Tech Stack:** Vanilla ES modules, Node's built-in test runner (`node --test`), `node:assert/strict`. No new dependencies.

**Reference docs:** Design spec `docs/superpowers/specs/2026-06-24-vastu-furniture-placement-design.md`; rules `docs/vastu-rules.md`.

---

## File Structure

- **Create** `src/lib/vastuPlacement.js` — pure rule + geometry module. Exports `northVectors`, `vastuRuleForItem`, `vastuTargetInRoom`, `vastuRoomHint`. Depends only on `src/lib/furnitureBounds.js` (`furnitureHalfExtents`) and `src/lib/geometry.js` (`polygonBBox`).
- **Create** `scripts/vastu-placement.test.mjs` — headless tests, mirrors `scripts/furniture-item.test.mjs`.
- **Modify** `src/lib/planMoat.js` (`buildPlanMeta`, ~line 114) — add `northEdge` passthrough.
- **Modify** `src/viewer/floorPlanViewer.js` — `northEdge` state + persistence (~770, ~850), North toolbar control (~1499), snap hook in `addCatalogRowToPlan` (~736).

**Coordinate model:** furniture normalized `x,y ∈ [0,1]`; `+x` right, `+y` down. Rooms are polygons in the same space. `rotationDeg` is a screen-space clockwise rotation of the icon.

---

## Task 1: Module skeleton + `northVectors`

**Files:**
- Create: `src/lib/vastuPlacement.js`
- Test: `scripts/vastu-placement.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/vastu-placement.test.mjs`:

```js
/**
 * Vastu placement rules + geometry. Run: node --test scripts/vastu-placement.test.mjs
 */
import assert from "node:assert/strict";
import { describe as suite, it } from "node:test";
import { northVectors } from "../src/lib/vastuPlacement.js";

suite("northVectors", function () {
  it("top: N up, E right, S down, W left", function () {
    var v = northVectors("top");
    assert.deepEqual(v.N, { x: 0, y: -1 });
    assert.deepEqual(v.E, { x: 1, y: 0 });
    assert.deepEqual(v.S, { x: 0, y: 1 });
    assert.deepEqual(v.W, { x: -1, y: 0 });
  });

  it("right: North points right, East points down", function () {
    var v = northVectors("right");
    assert.deepEqual(v.N, { x: 1, y: 0 });
    assert.deepEqual(v.E, { x: 0, y: 1 });
  });

  it("bottom and left are the opposite/rotated frames", function () {
    assert.deepEqual(northVectors("bottom").N, { x: 0, y: 1 });
    assert.deepEqual(northVectors("left").N, { x: -1, y: 0 });
  });

  it("unknown edge falls back to top", function () {
    assert.deepEqual(northVectors("nonsense").N, { x: 0, y: -1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/vastu-placement.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/vastuPlacement.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/vastuPlacement.js`:

```js
/**
 * Vastu-aware furniture placement: pure rule + geometry helpers.
 *
 * No DOM/WebGL — headlessly testable like lib/furnitureBounds and lib/wallSnap.
 * Rules mirror docs/vastu-rules.md §4. Screen axes: +x right, +y down.
 * Direction is user-set via meta.northEdge ("top"|"right"|"bottom"|"left").
 */

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/vastu-placement.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/vastuPlacement.js scripts/vastu-placement.test.mjs
git commit -m "feat(vastu): northVectors direction frame"
```

---

## Task 2: `vastuRuleForItem` (type → zone/face/category)

**Files:**
- Modify: `src/lib/vastuPlacement.js`
- Test: `scripts/vastu-placement.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `scripts/vastu-placement.test.mjs` (add `vastuRuleForItem` to the import at top):

```js
import { northVectors, vastuRuleForItem } from "../src/lib/vastuPlacement.js";
```

```js
suite("vastuRuleForItem", function () {
  it("bed -> SW, face S, cat bed", function () {
    assert.deepEqual(vastuRuleForItem({ type: "bed" }), { zone: "SW", face: "S", cat: "bed" });
  });
  it("sofa family -> S, face N, cat seating", function () {
    assert.deepEqual(vastuRuleForItem({ richIcon: "sofa_3" }), { zone: "S", face: "N", cat: "seating" });
    assert.equal(vastuRuleForItem({ type: "couch" }).zone, "S");
  });
  it("chair -> S, face N, cat seating (armchair too)", function () {
    assert.equal(vastuRuleForItem({ type: "chair" }).cat, "seating");
    assert.equal(vastuRuleForItem({ type: "armchair" }).cat, "seating");
  });
  it("cupboard/wardrobe/dresser -> SW, no face, cat storage", function () {
    assert.deepEqual(vastuRuleForItem({ type: "wardrobe" }), { zone: "SW", face: null, cat: "storage" });
    assert.equal(vastuRuleForItem({ type: "cupboard" }).zone, "SW");
  });
  it("kitchen_island -> SE face E; sink -> NE", function () {
    assert.deepEqual(vastuRuleForItem({ richIcon: "kitchen_island" }), { zone: "SE", face: "E", cat: "kitchen" });
    assert.equal(vastuRuleForItem({ type: "sink" }).zone, "NE");
  });
  it("desk -> N face N; dining_table -> NW", function () {
    assert.deepEqual(vastuRuleForItem({ type: "desk" }), { zone: "N", face: "N", cat: "desk" });
    assert.equal(vastuRuleForItem({ richIcon: "dining_table" }).zone, "NW");
  });
  it("toilet -> W; bathtub -> NE; plant -> avoid:NE", function () {
    assert.equal(vastuRuleForItem({ type: "toilet" }).zone, "W");
    assert.equal(vastuRuleForItem({ type: "bathtub" }).zone, "NE");
    assert.deepEqual(vastuRuleForItem({ type: "plant" }), { zone: "avoid:NE", face: null, cat: "plant" });
  });
  it("nightstand -> NW; unlisted (coffee_table) -> null", function () {
    assert.equal(vastuRuleForItem({ type: "nightstand" }).zone, "NW");
    assert.equal(vastuRuleForItem({ type: "coffee_table" }), null);
    assert.equal(vastuRuleForItem({ type: "side_table" }), null);
    assert.equal(vastuRuleForItem(null), null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/vastu-placement.test.mjs`
Expected: FAIL — `vastuRuleForItem is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/vastuPlacement.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/vastu-placement.test.mjs`
Expected: PASS. (Note: `dining_table` contains "dining" — caught by the dining rule; `kitchen_island` caught by kitchen rule; neither hits a generic "table" rule because none exists.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/vastuPlacement.js scripts/vastu-placement.test.mjs
git commit -m "feat(vastu): vastuRuleForItem type-to-zone mapping"
```

---

## Task 3: `vastuTargetInRoom` — corner/edge snap with inset

**Files:**
- Modify: `src/lib/vastuPlacement.js`
- Test: `scripts/vastu-placement.test.mjs`

- [ ] **Step 1: Write the failing test**

Update the import line and append a suite. A unit-square room and a small item (half-extent 0.05, so `width=height=0.1`):

```js
import {
  northVectors,
  vastuRuleForItem,
  vastuTargetInRoom,
} from "../src/lib/vastuPlacement.js";

var UNIT_ROOM = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];
function smallItem(type) {
  return { type: type, x: 0.5, y: 0.5, width: 0.1, height: 0.1 };
}
```

```js
suite("vastuTargetInRoom (zone placement)", function () {
  it("bed top-North snaps to bottom-left (SW) corner, inset", function () {
    var t = vastuTargetInRoom(smallItem("bed"), UNIT_ROOM, "top");
    assert.ok(Math.abs(t.x - 0.06) < 1e-6, "x near minX+hw+margin: " + t.x);
    assert.ok(Math.abs(t.y - 0.94) < 1e-6, "y near maxY-hd-margin: " + t.y);
  });

  it("bed right-North snaps to top-left (SW rotates with North)", function () {
    var t = vastuTargetInRoom(smallItem("bed"), UNIT_ROOM, "right");
    assert.ok(Math.abs(t.x - 0.06) < 1e-6, "x left: " + t.x);
    assert.ok(Math.abs(t.y - 0.06) < 1e-6, "y top: " + t.y);
  });

  it("kitchen_island top-North snaps to SE (bottom-right) corner", function () {
    var t = vastuTargetInRoom(smallItem("kitchen_island"), UNIT_ROOM, "top");
    assert.ok(Math.abs(t.x - 0.94) < 1e-6, "x right: " + t.x);
    assert.ok(Math.abs(t.y - 0.94) < 1e-6, "y bottom: " + t.y);
  });

  it("sofa (single-letter S zone) snaps to bottom edge midpoint", function () {
    var t = vastuTargetInRoom(smallItem("sofa"), UNIT_ROOM, "top");
    assert.ok(Math.abs(t.x - 0.5) < 1e-6, "x centred: " + t.x);
    assert.ok(Math.abs(t.y - 0.94) < 1e-6, "y bottom: " + t.y);
  });

  it("desk (N zone) snaps to top edge midpoint", function () {
    var t = vastuTargetInRoom(smallItem("desk"), UNIT_ROOM, "top");
    assert.ok(Math.abs(t.x - 0.5) < 1e-6, "x centred: " + t.x);
    assert.ok(Math.abs(t.y - 0.06) < 1e-6, "y top: " + t.y);
  });

  it("unlisted type returns null (caller leaves item untouched)", function () {
    assert.equal(vastuTargetInRoom(smallItem("coffee_table"), UNIT_ROOM, "top"), null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/vastu-placement.test.mjs`
Expected: FAIL — `vastuTargetInRoom is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add imports at the top of `src/lib/vastuPlacement.js` (below the file comment):

```js
import { polygonBBox } from "./geometry.js";
import { furnitureHalfExtents } from "./furnitureBounds.js";
```

Append:

```js
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
 * type has no rule. rotationDeg is added in Task 5 (returns item's current value
 * for now). "avoid:" zones are handled in Task 4.
 */
export function vastuTargetInRoom(item, roomPolygon, northEdge) {
  var rule = vastuRuleForItem(item);
  if (!rule || !roomPolygon || roomPolygon.length < 3) return null;
  if (rule.zone.indexOf("avoid:") === 0) return null; // Task 4
  var V = northVectors(northEdge);
  var bb = polygonBBox(roomPolygon);
  var ext = furnitureHalfExtents(item);
  var pos = placeByVector(zoneVector(rule.zone, V), bb, ext.hw, ext.hd);
  return { x: pos.x, y: pos.y, rotationDeg: item.rotationDeg != null ? item.rotationDeg : 0 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/vastu-placement.test.mjs`
Expected: PASS. (Spot-check: bed top-North `SW = V.S(0,1)+V.W(-1,0) = (-1,1)` → x=minX+hw+margin=0.06, y=maxY-hd-margin=0.94. ✓)

- [ ] **Step 5: Commit**

```bash
git add src/lib/vastuPlacement.js scripts/vastu-placement.test.mjs
git commit -m "feat(vastu): vastuTargetInRoom corner/edge snap"
```

---

## Task 4: `avoid:NE` handling (plants)

**Files:**
- Modify: `src/lib/vastuPlacement.js`
- Test: `scripts/vastu-placement.test.mjs`

- [ ] **Step 1: Write the failing test**

Append:

```js
suite("vastuTargetInRoom (avoid zones)", function () {
  it("plant in NE quadrant is pushed to SW; top-North", function () {
    // NE for top-North is top-right: x>0.5, y<0.5.
    var item = { type: "plant", x: 0.8, y: 0.2, width: 0.1, height: 0.1 };
    var t = vastuTargetInRoom(item, UNIT_ROOM, "top");
    assert.ok(t, "should move");
    assert.ok(t.x < 0.5 && t.y > 0.5, "moved to SW-ish: " + t.x + "," + t.y);
  });

  it("plant already away from NE (centre) returns null", function () {
    var item = { type: "plant", x: 0.5, y: 0.5, width: 0.1, height: 0.1 };
    assert.equal(vastuTargetInRoom(item, UNIT_ROOM, "top"), null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/vastu-placement.test.mjs`
Expected: FAIL — plant currently returns null in both cases (the `avoid:` early-return from Task 3).

- [ ] **Step 3: Write minimal implementation**

In `vastuTargetInRoom`, replace the line `if (rule.zone.indexOf("avoid:") === 0) return null; // Task 4` with:

```js
  var V = northVectors(northEdge);
  var bb = polygonBBox(roomPolygon);
  var ext = furnitureHalfExtents(item);

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
    return { x: p.x, y: p.y, rotationDeg: item.rotationDeg != null ? item.rotationDeg : 0 };
  }
```

Then delete the now-duplicate `var V = ...`, `var bb = ...`, `var ext = ...` lines that followed the old early-return (the three lines just before `var pos = placeByVector(...)`), so `V`/`bb`/`ext` are declared once. The tail becomes:

```js
  var pos = placeByVector(zoneVector(rule.zone, V), bb, ext.hw, ext.hd);
  return { x: pos.x, y: pos.y, rotationDeg: item.rotationDeg != null ? item.rotationDeg : 0 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/vastu-placement.test.mjs`
Expected: PASS (all prior suites still green — no duplicate-declaration error).

- [ ] **Step 5: Commit**

```bash
git add src/lib/vastuPlacement.js scripts/vastu-placement.test.mjs
git commit -m "feat(vastu): push plants out of the NE zone"
```

---

## Task 5: Facing → `rotationDeg`

**Convention (verify visually in Task 9):** at `rotationDeg = 0` an icon's front points screen-**down** (`+y`). `rotationDeg` increases **clockwise**. `faceToRotation` returns the clockwise angle from down to the desired screen facing `V[face]`. If a later visual check shows the icon front actually points up at 0°, flip `FRONT_AT_ZERO` to `{x:0,y:-1}` — one constant, one place.

**Files:**
- Modify: `src/lib/vastuPlacement.js`
- Test: `scripts/vastu-placement.test.mjs`

- [ ] **Step 1: Write the failing test**

Append (import `faceToRotation`):

```js
import {
  northVectors,
  vastuRuleForItem,
  vastuTargetInRoom,
  faceToRotation,
} from "../src/lib/vastuPlacement.js";
```

```js
suite("faceToRotation", function () {
  it("face S (down) at top-North is 0deg", function () {
    assert.equal(faceToRotation("S", "top"), 0);
  });
  it("face N (up) at top-North is 180deg", function () {
    assert.equal(Math.abs(faceToRotation("N", "top")), 180);
  });
  it("face E (right) at top-North is -90 (CCW from down)", function () {
    assert.equal(faceToRotation("E", "top"), -90);
  });
  it("null face -> 0", function () {
    assert.equal(faceToRotation(null, "top"), 0);
  });
});

suite("vastuTargetInRoom (rotation)", function () {
  it("sofa faces N -> rotationDeg 180 at top-North", function () {
    var t = vastuTargetInRoom(smallItem("sofa"), UNIT_ROOM, "top");
    assert.equal(Math.abs(t.rotationDeg), 180);
  });
  it("storage (no face) keeps current rotation", function () {
    var item = { type: "wardrobe", x: 0.5, y: 0.5, width: 0.1, height: 0.1, rotationDeg: 45 };
    assert.equal(vastuTargetInRoom(item, UNIT_ROOM, "top").rotationDeg, 45);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/vastu-placement.test.mjs`
Expected: FAIL — `faceToRotation is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/vastuPlacement.js`:

```js
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
```

Then in `vastuTargetInRoom`, replace **both** `rotationDeg: item.rotationDeg != null ? item.rotationDeg : 0` expressions with a face-aware value. At the top of the function (after computing `rule`) add:

```js
  var rot = rule.face
    ? faceToRotation(rule.face, northEdge)
    : (item.rotationDeg != null ? item.rotationDeg : 0);
```

and use `rotationDeg: rot` in both `return` statements.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/vastu-placement.test.mjs`
Expected: PASS. (down→up is a 180° turn; down→right is −90° clockwise i.e. 90° CCW.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/vastuPlacement.js scripts/vastu-placement.test.mjs
git commit -m "feat(vastu): facing-to-rotation mapping"
```

---

## Task 6: `vastuRoomHint` — non-blocking house-level warning

**Files:**
- Modify: `src/lib/vastuPlacement.js`
- Test: `scripts/vastu-placement.test.mjs`

- [ ] **Step 1: Write the failing test**

Append (import `vastuRoomHint`). A small NE room and a small SW room within the unit plan:

```js
import {
  northVectors,
  vastuRuleForItem,
  vastuTargetInRoom,
  faceToRotation,
  vastuRoomHint,
} from "../src/lib/vastuPlacement.js";
```

```js
suite("vastuRoomHint", function () {
  var NE_ROOM = { polygon: [ { x: 0.6, y: 0.05 }, { x: 0.95, y: 0.05 }, { x: 0.95, y: 0.4 }, { x: 0.6, y: 0.4 } ] };
  var SW_ROOM = { polygon: [ { x: 0.05, y: 0.6 }, { x: 0.4, y: 0.6 }, { x: 0.4, y: 0.95 }, { x: 0.05, y: 0.95 } ] };

  it("bed in NE room warns; bed in SW room is silent (top-North)", function () {
    assert.ok(vastuRoomHint({ type: "bed" }, NE_ROOM, "top"));
    assert.equal(vastuRoomHint({ type: "bed" }, SW_ROOM, "top"), null);
  });
  it("kitchen item in NE room warns", function () {
    assert.ok(vastuRoomHint({ richIcon: "kitchen_island" }, NE_ROOM, "top"));
  });
  it("desk in SW room warns (study wants NE); desk in NE room is silent", function () {
    assert.ok(vastuRoomHint({ type: "desk" }, SW_ROOM, "top"));
    assert.equal(vastuRoomHint({ type: "desk" }, NE_ROOM, "top"), null);
  });
  it("unlisted type -> null", function () {
    assert.equal(vastuRoomHint({ type: "coffee_table" }, NE_ROOM, "top"), null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/vastu-placement.test.mjs`
Expected: FAIL — `vastuRoomHint is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/vastuPlacement.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/vastu-placement.test.mjs`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
git add src/lib/vastuPlacement.js scripts/vastu-placement.test.mjs
git commit -m "feat(vastu): house-level room hints"
```

---

## Task 7: Persist `meta.northEdge`

**Files:**
- Modify: `src/lib/planMoat.js:114-130` (`buildPlanMeta`)
- Modify: `src/viewer/floorPlanViewer.js` (state ~164, save ~771, restore ~851)

- [ ] **Step 1: Add `northEdge` to `buildPlanMeta`**

In `src/lib/planMoat.js`, inside the object returned by `buildPlanMeta` (after the `vaastuEnabled` line), add:

```js
    northEdge: opts.northEdge || "top",
```

- [ ] **Step 2: Add `northEdge` state + save in floorPlanViewer.js**

Near the existing `var vaastuEnabled = false;` (~line 164) add:

```js
  var northEdge = "top";
```

In `currentAnalysisJson` (~line 771), add `northEdge: northEdge,` to the `buildPlanMeta({...})` call, beside `vaastuEnabled: vaastuEnabled,`.

- [ ] **Step 3: Restore `northEdge` on load**

In `applyAnalysisFromObject`, inside `if (nextData && nextData.meta) {` (~line 851), add after the `vaastuEnabled` restore:

```js
      northEdge = nextData.meta.northEdge || "top";
```

- [ ] **Step 4: Verify build + existing tests unaffected**

Run: `node --test scripts/*.test.mjs`
Expected: PASS (no test depends on these lines yet; this confirms no syntax break in the touched modules that the test imports transitively).
Run: `npx vite build` (from `floor-plan-viewer/`)
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planMoat.js src/viewer/floorPlanViewer.js
git commit -m "feat(vastu): persist meta.northEdge"
```

---

## Task 8: 4-way North toolbar control

**Files:**
- Modify: `src/viewer/floorPlanViewer.js` (~after line 1512, the Vaastu label block)

- [ ] **Step 1: Add the control after the Vaastu label**

In `src/viewer/floorPlanViewer.js`, immediately after `furnitureRow.appendChild(vaastuLab);` (~line 1512) insert:

```js
  var northWrap = document.createElement("span");
  northWrap.style.marginLeft = "8px";
  northWrap.title = "Which screen edge is North (Vaastu)";
  var northLab = document.createElement("span");
  northLab.textContent = "N:";
  northWrap.appendChild(northLab);
  var NORTH_EDGES = [
    { edge: "top", glyph: "↑" },
    { edge: "right", glyph: "→" },
    { edge: "bottom", glyph: "↓" },
    { edge: "left", glyph: "←" },
  ];
  var northBtns = {};
  function syncNorthButtons() {
    NORTH_EDGES.forEach(function (o) {
      northBtns[o.edge].style.fontWeight = northEdge === o.edge ? "bold" : "normal";
      northBtns[o.edge].style.outline = northEdge === o.edge ? "2px solid #2a7" : "none";
    });
  }
  NORTH_EDGES.forEach(function (o) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = o.glyph;
    b.style.padding = "0 4px";
    b.addEventListener("click", function () {
      northEdge = o.edge;
      syncNorthButtons();
    });
    northBtns[o.edge] = b;
    northWrap.appendChild(b);
  });
  syncNorthButtons();
  furnitureRow.appendChild(northWrap);
```

- [ ] **Step 2: Reflect a loaded `northEdge` in the buttons**

The control is created during initial toolbar build; loads happen later. Find where `vaastuToggle.checked = vaastuEnabled;` is set after load (~lines 1254 and 1277) and add `syncNorthButtons();` immediately after each, so a loaded project's North lights the right button.

- [ ] **Step 3: Build + manual smoke**

Run: `npx vite build`
Expected: build succeeds.
Manual: load the app, confirm four arrow buttons appear next to the Vaastu checkbox and clicking one highlights it.

- [ ] **Step 4: Commit**

```bash
git add src/viewer/floorPlanViewer.js
git commit -m "feat(vastu): 4-way North toolbar control"
```

---

## Task 9: Snap hook in `addCatalogRowToPlan` (fresh-drop only) + visual verify

**Files:**
- Modify: `src/viewer/floorPlanViewer.js` (imports ~line 19; `addCatalogRowToPlan` ~line 736)

- [ ] **Step 1: Import the module**

Near the top imports (the block importing from `../lib/catalogSizing.js` around line 19), add:

```js
import { vastuTargetInRoom, vastuRoomHint } from "../lib/vastuPlacement.js";
```

- [ ] **Step 2: Add the snap in the fresh-placement branch**

In `addCatalogRowToPlan`, the `else` branch (~lines 735-742) currently reads:

```js
    } else {
      newItem = createFurnitureItem({
        catalogId: catalogRow.id || catalogRow.product_code || null,
        type: catalogRow.shape || "chair",
      });
      applyCatalogSkuToItem(newItem, catalogRow, getCatalogContext());
      constrainFurnitureMove(newItem, data.rooms || []);
    }
```

Replace the body of the `else` with (insert the Vaastu block between `applyCatalogSkuToItem` and `constrainFurnitureMove`):

```js
    } else {
      newItem = createFurnitureItem({
        catalogId: catalogRow.id || catalogRow.product_code || null,
        type: catalogRow.shape || "chair",
      });
      applyCatalogSkuToItem(newItem, catalogRow, getCatalogContext());
      if (vaastuEnabled) {
        var vroom =
          pickRoomAtNorm(newItem.x, newItem.y) ||
          (data.rooms || []).find(function (r) {
            return (r.id || r.name) === activeRoomId;
          });
        if (vroom && vroom.polygon) {
          var vt = vastuTargetInRoom(newItem, vroom.polygon, northEdge);
          if (vt) {
            newItem.x = vt.x;
            newItem.y = vt.y;
            newItem.rotationDeg = vt.rotationDeg;
          }
          var vhint = vastuRoomHint(newItem, vroom, northEdge);
          if (vhint) setLlmStatus("Vastu: " + vhint);
        }
      }
      constrainFurnitureMove(newItem, data.rooms || []);
    }
```

(`pickRoomAtNorm`, `activeRoomId`, `setLlmStatus`, `northEdge`, `vaastuEnabled` are all already in scope in this closure.)

- [ ] **Step 3: Build**

Run: `npx vite build`
Expected: build succeeds.

- [ ] **Step 4: Manual visual verification (the rotation convention check)**

Run the app (`python server.py` or the project's usual dev serve on :5199 per memory; otherwise `npx vite preview` after build). Then:
1. Load/auto-stage a plan with rooms.
2. Turn the **Vaastu** checkbox ON, set **North = ↑ (top)**.
3. From the catalog, place a **bed** into a bedroom with **nothing selected** (fresh drop). Confirm it jumps to the room's **bottom-left** (SW) corner.
4. Place a **sofa** — confirm it sits on the **bottom (S)** edge and **faces up (North)**. **If the sofa faces down instead**, flip `FRONT_AT_ZERO` in `vastuPlacement.js` to `{ x: 0, y: -1 }`, re-run `node --test scripts/vastu-placement.test.mjs` (update the two faceToRotation expectation signs if they flip), rebuild, recheck.
5. Switch **North = →** and place another bed; confirm it now snaps to the **top-left** corner.
6. After a snap, **drag** the piece elsewhere — confirm it does **not** snap back.
7. Place a piece with **Vaastu OFF** — confirm it lands at centre (no snap).

- [ ] **Step 5: Commit**

```bash
git add src/viewer/floorPlanViewer.js src/lib/vastuPlacement.js scripts/vastu-placement.test.mjs
git commit -m "feat(vastu): snap furniture to Vastu zone on placement"
```

---

## Task 10: Full regression + docs cross-check

**Files:** none modified (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `node --test scripts/*.test.mjs`
Expected: PASS — existing `furniture-item.test.mjs` etc. plus the new `vastu-placement.test.mjs` all green.

- [ ] **Step 2: Build once more**

Run: `npx vite build`
Expected: succeeds.

- [ ] **Step 3: Confirm the rules doc still matches the code**

Open `docs/vastu-rules.md` §4/§7 and confirm the `RULES` array in `vastuPlacement.js` matches the documented zone for each in-scope item (bed→SW, sofa/chair→S, cupboard→SW, nightstand→NW, kitchen→SE, sink→NE, desk→N, dining→NW, toilet→W, bathtub→NE, plant→avoid NE). If any drifted, fix the code (doc is the source of truth) and re-run Step 1.

- [ ] **Step 4: Final commit (if Step 3 changed anything)**

```bash
git add -A
git commit -m "fix(vastu): align rules code with vastu-rules.md"
```

---

## Self-Review notes (author)

- **Spec coverage:** northEdge 4-way + persistence (T7/T8) ✓; snap-within-room (T3/T4/T5/T9) ✓; house-level hint (T6/T9) ✓; gating by toggle + snap-once + free drag (T9, manual steps) ✓; pure module + headless tests (T1–T6) ✓; anchor branch left unchanged (T9 only touches the `else`) ✓.
- **Type consistency:** `vastuRuleForItem` returns `{zone,face,cat}` used identically in T3/T5/T6; `northVectors` shape `{N,E,S,W}` of `{x,y}` consistent throughout; `vastuTargetInRoom(item, polygon, northEdge)` and `vastuRoomHint(item, room, northEdge)` signatures stable across tasks and the T9 call site (note: hint takes the **room object**, target takes **room.polygon**).
- **Known soft spot:** the `FRONT_AT_ZERO` rotation convention is asserted in tests but only *confirmed* against real icons in T9 Step 4 — the plan gives the exact one-constant fix if it's inverted.
```
