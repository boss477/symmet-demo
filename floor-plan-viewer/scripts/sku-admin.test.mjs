/**
 * SKU admin payload builders. Run: node --test scripts/sku-admin.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSkuPatch, buildSkuInsert, EDITABLE_SKU_COLUMNS } from "../src/services/skuAdmin.js";

describe("buildSkuPatch", function () {
  it("keeps only editable columns and trims strings", function () {
    var patch = buildSkuPatch({
      "Product Name": "  Verdana  ",
      "image_url": "https://r2/x.png",
      "S.No": 99, // not editable -> dropped
      "Product Code": "VERDANA", // identity -> dropped from patch
    });
    assert.deepEqual(patch, { "Product Name": "Verdana", "image_url": "https://r2/x.png" });
  });

  it("omits keys whose value is undefined or empty after trim", function () {
    var patch = buildSkuPatch({ "Category": "   ", "Colours": "grey" });
    assert.deepEqual(patch, { "Colours": "grey" });
  });

  it("exposes the editable column allowlist", function () {
    assert.ok(EDITABLE_SKU_COLUMNS.includes("Product Name"));
    assert.ok(!EDITABLE_SKU_COLUMNS.includes("S.No"));
    assert.ok(!EDITABLE_SKU_COLUMNS.includes("Product Code"));
  });
});

describe("buildSkuInsert", function () {
  it("requires a Product Code", function () {
    assert.throws(function () { buildSkuInsert({ "Product Name": "x" }); }, /Product Code/);
  });

  it("builds an insert row with code plus editable fields", function () {
    var row = buildSkuInsert({ "Product Code": " SHL-NEW ", "Product Name": " Sofa ", "S.No": 1 });
    assert.deepEqual(row, { "Product Code": "SHL-NEW", "Product Name": "Sofa" });
  });
});
