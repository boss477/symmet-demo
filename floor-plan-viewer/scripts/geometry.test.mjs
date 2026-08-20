/**
 * Geometry primitive parity tests. Run: node --test scripts/geometry.test.mjs
 * Same fixture file (fixtures/geometry-cases.json) is asserted by the Python
 * suite (tests/test_geometry.py) against app.py — keeps both impls in lockstep.
 */
import assert from "node:assert/strict";
import { describe as suite, it } from "node:test";
import { readFileSync } from "node:fs";
import { pointInPolygon, polygonArea } from "../src/lib/geometry.js";

var fixture = JSON.parse(
  readFileSync(new URL("../fixtures/geometry-cases.json", import.meta.url), "utf8")
);

fixture.cases.forEach(function (c) {
  suite(c.name, function () {
    it("polygonArea matches within 1e-9", function () {
      assert.ok(
        Math.abs(polygonArea(c.polygon) - c.area) < 1e-9,
        "expected " + c.area + ", got " + polygonArea(c.polygon)
      );
    });
    c.queries.forEach(function (q) {
      it("pointInPolygon(" + q.x + ", " + q.y + ") === " + q.inside, function () {
        assert.equal(pointInPolygon(q.x, q.y, c.polygon), q.inside);
      });
    });
  });
});
