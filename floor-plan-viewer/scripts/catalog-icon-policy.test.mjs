/**
 * Catalog seating icon policy: rich SVG by seat count; GLB for 3D only.
 * Run: node --test scripts/catalog-icon-policy.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCatalogSkuToItem,
  inferSofaSeatsFromCatalogRow,
  richSofaIconId,
} from "../src/lib/catalogSizing.js";

var HUDSON_ROW = {
  id: "HUDSON",
  product_code: "HUDSON",
  product_name: "HUDSON",
  category: "Sofa",
  keywords:
    "high arms, loose back cushions, SS/MS base, wooden base, two-tone leather/fabric, clean modern, wide seat",
  width_mm: 1600,
  depth_mm: 900,
  height_mm: 850,
  sofa_seats: 2,
  rich_icon: "sofa_2",
  model_3d_url: "https://pub-cdfdd6db8e374af085a2724000f8977c.r2.dev/HUDSON.glb",
  plan2d_glb_url: "https://pub-cdfdd6db8e374af085a2724000f8977c.r2.dev/HUDSON-plan2d.png",
  "2-Seater Length (mm)": 1600,
  "Length / Depth (mm)": 900,
};

var CHAIR_ROW = {
  id: "DINING-CHAIR",
  product_name: "Dining Chair",
  category: "Chair",
  keywords: "dining chair",
  width_mm: 550,
  depth_mm: 550,
  model_3d_url: "https://example.com/chair.glb",
};

var CTX = { planWidthPx: 2000, planHeightPx: 1500, walls: [], rooms: [] };

describe("inferSofaSeatsFromCatalogRow", function () {
  it("uses 2-Seater Length column when present", function () {
    assert.equal(
      inferSofaSeatsFromCatalogRow({
        keywords: "wide seat",
        category: "Sofa",
        "2-Seater Length (mm)": 1600,
      }),
      2
    );
  });

  it("uses 3-Seater Length column when only that is set", function () {
    assert.equal(
      inferSofaSeatsFromCatalogRow({
        keywords: "sofa",
        category: "Sofa",
        "3-Seater Length (mm)": 2200,
      }),
      3
    );
  });
});

describe("applyCatalogSkuToItem seating icon policy", function () {
  it("HUDSON gets sofa_2 SVG and 3D GLB without GLB bake", function () {
    var item = { id: "f-1", x: 0.5, y: 0.5 };
    applyCatalogSkuToItem(item, HUDSON_ROW, CTX);
    assert.equal(item.richIcon, "sofa_2");
    assert.equal(item.sofaSeats, 2);
    assert.equal(item.iconMode, "svg");
    assert.equal(item.useGlbModel, true);
    assert.equal(item.glbUrl, HUDSON_ROW.model_3d_url);
    assert.equal(item.plan2dGlbUrl, undefined);
    assert.equal(item.useGlbBake, undefined);
  });

  it("3-seat sofa maps to sofa_3 rich icon", function () {
    var item = { id: "f-2", x: 0.5, y: 0.5 };
    applyCatalogSkuToItem(
      item,
      {
        id: "NOVARA",
        category: "Sofa",
        keywords: "3 seater lounge",
        width_mm: 2200,
        depth_mm: 950,
        sofa_seats: 3,
        rich_icon: richSofaIconId(3),
      },
      CTX
    );
    assert.equal(item.richIcon, "sofa_3");
    assert.equal(item.iconMode, "svg");
    assert.equal(item.useGlbBake, undefined);
  });

  it("chair SKU gets chair SVG even when GLB URL exists", function () {
    var item = { id: "f-3", x: 0.5, y: 0.5 };
    applyCatalogSkuToItem(item, CHAIR_ROW, CTX);
    assert.equal(item.richIcon, "chair");
    assert.equal(item.iconMode, "svg");
    assert.equal(item.useGlbModel, true);
    assert.equal(item.useGlbBake, undefined);
  });
});
