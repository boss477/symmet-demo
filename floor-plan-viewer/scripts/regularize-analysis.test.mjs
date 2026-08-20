/** Tier-1 analysis regularization. Run: node --test scripts/regularize-analysis.test.mjs */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { regularizeAnalysis } from "../src/lib/regularizeAnalysis.js";

describe("axis snapping", function () {
  it("makes a near-horizontal wall exactly horizontal", function () {
    var data = {
      walls: [{ points: [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.215 }], thickness: 0.008 }],
    };
    regularizeAnalysis(data);
    var pts = data.walls[0].points;
    assert.equal(pts[0].y, pts[1].y);
    assert.ok(Math.abs(pts[0].y - 0.2075) < 1e-9);
  });

  it("leaves a diagonal-dominant plan untouched (no forced Manhattan)", function () {
    var diag = [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.1 }];
    var data = { walls: [{ points: diag.map(function (p) { return { x: p.x, y: p.y }; }) }] };
    regularizeAnalysis(data);
    assert.deepEqual(data.walls[0].points, diag);
  });
});

describe("coordinate clustering", function () {
  it("aligns two nearly-collinear vertical walls to one x", function () {
    var data = {
      walls: [
        { points: [{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.45 }] },
        { points: [{ x: 0.504, y: 0.55 }, { x: 0.504, y: 0.9 }] },
      ],
    };
    regularizeAnalysis(data);
    assert.equal(data.walls[0].points[0].x, data.walls[1].points[0].x);
  });

  it("keeps rooms on either side of a thick wall apart", function () {
    var data = {
      rooms: [
        { polygon: [{ x: 0.1, y: 0.1 }, { x: 0.49, y: 0.1 }, { x: 0.49, y: 0.9 }, { x: 0.1, y: 0.9 }] },
        { polygon: [{ x: 0.51, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.51, y: 0.9 }] },
      ],
    };
    regularizeAnalysis(data);
    assert.equal(data.rooms[0].polygon[1].x, 0.49);
    assert.equal(data.rooms[1].polygon[0].x, 0.51);
  });
});

describe("jitter vertex removal", function () {
  it("drops interior points along a straight wall run", function () {
    var data = {
      walls: [
        { points: [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.203 }, { x: 0.9, y: 0.2 }] },
      ],
    };
    regularizeAnalysis(data);
    assert.equal(data.walls[0].points.length, 2);
  });

  it("keeps a closed room polygon at 3+ points", function () {
    var data = {
      rooms: [{ polygon: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.10001 }] }],
    };
    regularizeAnalysis(data);
    assert.equal(data.rooms[0].polygon.length, 3);
  });
});

describe("junction closing", function () {
  it("pulls a wall endpoint onto the wall it nearly touches", function () {
    var data = {
      walls: [
        { points: [{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.9 }] },
        { points: [{ x: 0.51, y: 0.5 }, { x: 0.9, y: 0.5 }] },
      ],
    };
    regularizeAnalysis(data);
    assert.equal(data.walls[1].points[0].x, 0.5);
    assert.equal(data.walls[1].points[0].y, 0.5);
  });
});

describe("opening snap", function () {
  it("snaps a door center onto the nearest wall line", function () {
    var data = {
      walls: [{ points: [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.2 }] }],
      doors: [{ type: "door", position: { x: 0.5, y: 0.215 }, width: 0.04 }],
    };
    regularizeAnalysis(data);
    assert.equal(data.doors[0].position.x, 0.5);
    assert.equal(data.doors[0].position.y, 0.2);
  });

  it("translates a door polygon along with its position", function () {
    var data = {
      walls: [{ points: [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.2 }] }],
      doors: [
        {
          type: "door",
          position: { x: 0.5, y: 0.21 },
          width: 0.04,
          polygon: [{ x: 0.48, y: 0.21 }, { x: 0.52, y: 0.21 }],
        },
      ],
    };
    regularizeAnalysis(data);
    assert.ok(Math.abs(data.doors[0].polygon[0].y - 0.2) < 1e-9);
    assert.ok(Math.abs(data.doors[0].polygon[1].y - 0.2) < 1e-9);
  });

  it("leaves a far-away door alone", function () {
    var data = {
      walls: [{ points: [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.2 }] }],
      doors: [{ type: "door", position: { x: 0.5, y: 0.5 }, width: 0.04 }],
    };
    regularizeAnalysis(data);
    assert.equal(data.doors[0].position.y, 0.5);
  });
});

describe("robustness", function () {
  it("survives empty and malformed analysis", function () {
    assert.equal(regularizeAnalysis(null), null);
    var data = {
      walls: [{ points: [{ x: 0.1 }, null, { x: 0.2, y: 0.2 }] }, { notPoints: true }],
      rooms: [{ polygon: "bad" }],
      doors: [{ position: null }],
    };
    regularizeAnalysis(data);
    assert.equal(data.walls[0].points.length, 1);
  });

  it("uses image aspect for angle decisions", function () {
    // dy=0.03 over dx=0.4 is ~4.3 deg on a square image (snaps) but
    // ~12.6 deg on a 3:1 tall image (kept).
    var mk = function () {
      return { walls: [{ points: [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.23 }] }] };
    };
    var square = mk();
    regularizeAnalysis(square, { width: 100, height: 100 });
    assert.equal(square.walls[0].points[0].y, square.walls[0].points[1].y);
    var tall = mk();
    regularizeAnalysis(tall, { width: 100, height: 300 });
    assert.notEqual(tall.walls[0].points[0].y, tall.walls[0].points[1].y);
  });
});
