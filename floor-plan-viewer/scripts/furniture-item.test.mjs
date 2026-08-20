/**
 * Furniture Item lifecycle: create + the questions consumers ask of a placed item.
 * Run: node --test scripts/furniture-item.test.mjs
 */
import assert from "node:assert/strict";
import { describe as suite, it } from "node:test";
import {
  create,
  isSofa,
  isColorable,
  resolveColorId,
  dimensionsMm,
  describe as describeItem,
} from "../src/lib/furnitureItem.js";
import { catalogEntryFromSkuRow } from "../src/lib/catalog.js";

var SOFA = catalogEntryFromSkuRow({
  product_code: "SHL-SF-014",
  product_name: "Milano 3-Seater",
  category: "Sofa",
  keywords: "3 seater, fabric",
  "Width (mm)": 2200,
  "Length / Depth (mm)": 950,
  Colours: "grey, beige",
});

var CHAIR = catalogEntryFromSkuRow({
  product_code: "SHL-CH-001",
  product_name: "Oslo Armchair",
  category: "Chair",
  width_mm: 720,
  depth_mm: 800,
});

suite("furniture item", function () {
  it("create() fills id/x/y/rotation defaults", function () {
    var f = create({ catalogId: "SHL-SF-014", type: "sofa" });
    assert.ok(f.id, "id generated");
    assert.equal(f.catalogId, "SHL-SF-014");
    assert.equal(f.type, "sofa");
    assert.equal(f.x, 0.5);
    assert.equal(f.y, 0.5);
    assert.equal(f.rotationDeg, 0);
  });

  it("isSofa() from item type and from entry", function () {
    assert.equal(isSofa({ type: "sofa" }, null), true, "type alone");
    assert.equal(isSofa({ type: "" }, SOFA), true, "entry says sofa");
    assert.equal(isSofa({ type: "" }, CHAIR), false);
    assert.equal(isSofa(null, SOFA), false);
  });

  it("isColorable() for sofa, seating, and coloured SKUs", function () {
    assert.equal(isColorable({ type: "sofa" }, SOFA), true);
    assert.equal(isColorable({}, CHAIR), true, "seating is colorable");
    assert.equal(isColorable({}, null), false, "no entry, not a sofa");
  });

  it("resolveColorId() honours the override chain", function () {
    assert.equal(
      resolveColorId({ sofaColorOverride: "navy" }, SOFA),
      "navy",
      "instance override wins"
    );
    assert.equal(
      resolveColorId({ sofaParams: { color: "olive" } }, SOFA),
      "olive",
      "sofaParams next"
    );
    assert.equal(resolveColorId({}, SOFA), "grey", "first listed colour from entry");
    assert.equal(resolveColorId({}, null), "");
  });

  it("dimensionsMm() reads catalog mm carried on the item", function () {
    assert.deepEqual(dimensionsMm({ catalogWidthMm: 2200, catalogDepthMm: 950 }), {
      width_mm: 2200,
      depth_mm: 950,
    });
    assert.deepEqual(dimensionsMm({}), { width_mm: null, depth_mm: null });
  });

  it("describe() never returns an empty label for a real SKU", function () {
    var d = describeItem({ type: "sofa", sofaColorOverride: "navy" }, SOFA);
    assert.equal(d.label, "Milano 3-Seater");
    assert.equal(d.colorName, "navy");
  });

  it("describe() falls back to item.type when no entry exists", function () {
    var d = describeItem({ type: "table" }, null);
    assert.equal(d.label, "table");
    assert.equal(d.colorName, "", "non-colorable -> no colour");
  });
});
