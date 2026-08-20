/**
 * Vastu placement rules + geometry. Run: node --test scripts/vastu-placement.test.mjs
 */
import assert from "node:assert/strict";
import { describe as suite, it } from "node:test";
import {
  northVectors,
  vastuRuleForItem,
  vastuTargetInRoom,
  faceToRotation,
  vastuRoomHint,
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
