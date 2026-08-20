/**
 * Catalog adapt seam: all sources -> one canonical Catalog Entry.
 * Run: node --test scripts/catalog-adapt.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalogEntryFromSkuRow,
  catalogEntryFromPresetRow,
  createCatalogIndex,
} from "../src/lib/catalog.js";
import { DEFAULT_PLAN_CATALOG } from "../src/lib/planFurniturePresets.js";

// A row as imported from the spreadsheet (spaced column headers).
var SPACED_ROW = {
  "Product Code": "SHL-SF-014",
  "Product Name": "Milano 3-Seater",
  "Category": "Sofa",
  "Keywords": "3 seater, fabric, low arms",
  "Width (mm)": 2200,
  "Length / Depth (mm)": 950,
  "Height (mm)": 850,
  "Colours": "grey, beige",
  "Price (INR)": "₹ 64,999",
  image_url: "https://r2.example.com/milano.png",
};

// The same product after a clean schema migration (lowercase columns).
var CLEAN_ROW = {
  product_code: "SHL-CH-001",
  product_name: "Oslo Armchair",
  category: "Chair",
  width_mm: 720,
  depth_mm: 800,
  height_mm: 780,
  price: 18999,
};

var PRESET_ROW = DEFAULT_PLAN_CATALOG[5]; // cat-sofa

describe("catalog adapt seam", function () {
  it("maps a spaced-column SKU row to a resolved sku Entry", function () {
    var e = catalogEntryFromSkuRow(SPACED_ROW);
    assert.equal(e.kind, "sku");
    assert.equal(e.vendor, "Shearling");
    assert.equal(e.product_code, "SHL-SF-014");
    assert.equal(e.product_name, "Milano 3-Seater");
    assert.equal(e.id, "SHL-SF-014");
    assert.equal(e.shape, "sofa");
    assert.equal(e.price, 64999, "₹ 64,999 -> 64999");
    assert.ok(e.width_mm > 0 && e.depth_mm > 0, "dimensions resolved");
    assert.ok(Array.isArray(e.available_colours), "colours resolved to array");
    assert.equal(e.image_url, "https://r2.example.com/milano.png", "R2 link passes through");
  });

  it("maps a clean lowercase SKU row to the same shape", function () {
    var e = catalogEntryFromSkuRow(CLEAN_ROW);
    assert.equal(e.kind, "sku");
    assert.equal(e.vendor, "Shearling");
    assert.equal(e.price, 18999);
    assert.equal(e.shape, "chair");
  });

  it("scales a per-seat sofa width by seat count so a 2-seater is longer than a chair", function () {
    var e = catalogEntryFromSkuRow({
      product_code: "SH-NORMA-015",
      product_name: "Norma 2-Seater",
      category: "Sofa",
      keywords: "2 seater",
      width_mm: 460,
      depth_mm: 460,
      height_mm: 800,
    });
    assert.equal(e.sofa_seats, 2);
    assert.equal(e.width_mm, 920, "460 per-seat x 2 seats");
    assert.equal(e.depth_mm, 460, "depth unchanged");
  });

  it("does not inflate a sofa width that already stores a full footprint", function () {
    var e = catalogEntryFromSkuRow(SPACED_ROW); // Milano 3-seater, Width 2200
    assert.equal(e.width_mm, 2200, "2200 is already a full footprint, left as-is");
  });

  it("maps a preset row to a resolved preset Entry", function () {
    var e = catalogEntryFromPresetRow(PRESET_ROW);
    assert.equal(e.kind, "preset");
    assert.equal(e.vendor, null, "presets have no vendor");
    assert.equal(e.price, null, "presets have no price");
    assert.equal(e.id, "cat-sofa");
    assert.ok(e.width_mm > 0 && e.depth_mm > 0);
  });

  it("emits an identical key set from every source (the shape guarantee)", function () {
    var keys = function (o) { return Object.keys(o).sort().join(","); };
    var sku1 = keys(catalogEntryFromSkuRow(SPACED_ROW));
    var sku2 = keys(catalogEntryFromSkuRow(CLEAN_ROW));
    var pre1 = keys(catalogEntryFromPresetRow(PRESET_ROW));
    var pre2 = keys(catalogEntryFromPresetRow(DEFAULT_PLAN_CATALOG[0])); // raw default
    assert.equal(sku1, sku2);
    assert.equal(sku1, pre1, "sku and preset entries share one shape");
    assert.equal(pre1, pre2, "DB preset and raw default share one shape");
  });

  it("parses missing/blank price as null, not NaN", function () {
    assert.equal(catalogEntryFromSkuRow({ product_code: "X" }).price, null);
    assert.equal(catalogEntryFromSkuRow({ product_code: "X", price: "" }).price, null);
    assert.equal(catalogEntryFromSkuRow({ product_code: "X", price: "abc" }).price, null);
  });

  it("indexes entries by id and product_code", function () {
    var entries = [catalogEntryFromSkuRow(SPACED_ROW), catalogEntryFromPresetRow(PRESET_ROW)];
    var idx = createCatalogIndex(entries);
    assert.equal(idx.by_id("SHL-SF-014").product_name, "Milano 3-Seater");
    assert.equal(idx.by_id("cat-sofa").kind, "preset");
    assert.equal(idx.by_id("nope"), null);
    assert.equal(idx.all().length, 2);
  });
});
