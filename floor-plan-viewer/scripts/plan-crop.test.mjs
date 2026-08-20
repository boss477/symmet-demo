/** Ink-bbox scan for the mini-map crop. Run: node --test scripts/plan-crop.test.mjs */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contentBounds } from "../src/lib/planCrop.js";

function makeImage(w, h) {
  var data = new Uint8ClampedArray(w * h * 4).fill(255);
  return { data: data, width: w, height: h };
}

function fillRect(img, x, y, rw, rh, shade) {
  var v = shade == null ? 0 : shade;
  for (var yy = y; yy < y + rh; yy++) {
    for (var xx = x; xx < x + rw; xx++) {
      if (xx < 0 || yy < 0 || xx >= img.width || yy >= img.height) continue;
      var o = (yy * img.width + xx) * 4;
      img.data[o] = v;
      img.data[o + 1] = v;
      img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
}

describe("contentBounds", function () {
  it("finds the drawing on a page with wide margins", function () {
    var img = makeImage(400, 600);
    // Drawing occupies the top-left quarter, like a plan on a document page.
    fillRect(img, 40, 60, 200, 150);
    var box = contentBounds(img);
    assert.deepEqual(box, { x: 40, y: 60, w: 200, h: 150 });
  });

  it("returns null for a blank page", function () {
    assert.equal(contentBounds(makeImage(200, 200)), null);
  });

  it("ignores near-white paper texture", function () {
    var img = makeImage(300, 300);
    fillRect(img, 0, 0, 300, 300, 250); // off-white background
    fillRect(img, 100, 100, 80, 80); // actual ink
    var box = contentBounds(img);
    assert.deepEqual(box, { x: 100, y: 100, w: 80, h: 80 });
  });

  it("ignores isolated specks outside the drawing", function () {
    var img = makeImage(400, 400);
    fillRect(img, 150, 150, 100, 100);
    fillRect(img, 390, 390, 1, 1); // lone dust pixel near the corner
    var box = contentBounds(img);
    assert.deepEqual(box, { x: 150, y: 150, w: 100, h: 100 });
  });

  it("treats transparent pixels as paper", function () {
    var img = makeImage(200, 200);
    img.data.fill(0); // black but fully transparent
    fillRect(img, 50, 50, 60, 60); // opaque ink
    var box = contentBounds(img);
    assert.deepEqual(box, { x: 50, y: 50, w: 60, h: 60 });
  });
});
