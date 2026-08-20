/**
 * Crop a floor-plan image to its drawn content.
 *
 * Uploaded plans are usually full document pages (title block + wide white
 * margins), so anything that displays them small — like the 3D camera
 * mini-map — shows a tiny drawing in a sea of paper. This module finds the
 * ink bounding box and returns a cropped copy plus the crop rect in
 * normalized (0–1) coordinates of the original image, so callers can remap
 * camera/marker positions between full-plan space and cropped space.
 */

// Channels at/above this value count as paper, not ink.
var WHITE_THRESHOLD = 246;
// Rows/columns need at least this share of ink pixels to count as content
// (ignores isolated scan specks and JPEG noise).
var MIN_INK_SHARE = 0.002;
// Padding around the ink bbox, as a fraction of the bbox's larger side.
var PAD_RATIO = 0.025;
// Skip cropping when the ink already covers most of the page.
var IDENTITY_AREA = 0.92;
// Cap the cropped output; the mini-map shows ≤ ~880 device px.
var MAX_OUTPUT_PX = 1600;

var IDENTITY_RECT = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Ink bounding box of an RGBA raster.
 * @param {{ data: Uint8ClampedArray, width: number, height: number }} img
 * @returns {{ x: number, y: number, w: number, h: number } | null}
 *   pixel-space bbox, or null when the image is blank.
 */
export function contentBounds(img) {
  var w = img.width;
  var h = img.height;
  var data = img.data;
  var rowCounts = new Uint32Array(h);
  var colCounts = new Uint32Array(w);

  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var o = (y * w + x) * 4;
      if (data[o + 3] <= 16) continue; // transparent = paper
      if (
        data[o] >= WHITE_THRESHOLD &&
        data[o + 1] >= WHITE_THRESHOLD &&
        data[o + 2] >= WHITE_THRESHOLD
      ) continue;
      rowCounts[y]++;
      colCounts[x]++;
    }
  }

  var minRowInk = Math.max(2, Math.round(w * MIN_INK_SHARE));
  var minColInk = Math.max(2, Math.round(h * MIN_INK_SHARE));

  var top = -1, bottom = -1, left = -1, right = -1;
  for (var r = 0; r < h; r++) {
    if (rowCounts[r] >= minRowInk) { if (top < 0) top = r; bottom = r; }
  }
  for (var c = 0; c < w; c++) {
    if (colCounts[c] >= minColInk) { if (left < 0) left = c; right = c; }
  }
  if (top < 0 || left < 0) return null;

  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

function loadImage(src) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    // Allow canvas reads when the plan lives on R2 (cross-origin).
    img.crossOrigin = "anonymous";
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(new Error("Failed to load plan image")); };
    img.src = src;
  });
}

/**
 * Crop `src` to its drawn content.
 * @param {string} src  plan image URL (R2/blob/data URI)
 * @returns {Promise<{ src: string, rect: { x: number, y: number, w: number, h: number } }>}
 *   cropped image + normalized crop rect. Falls back to the original image
 *   with an identity rect on blank/tainted/undecodable input.
 */
export async function cropPlanToContent(src) {
  var identity = { src: src, rect: IDENTITY_RECT };

  var img;
  try {
    img = await loadImage(src);
  } catch (e) {
    return identity;
  }
  var natW = img.naturalWidth;
  var natH = img.naturalHeight;
  if (!natW || !natH) return identity;

  // Scan pass at reduced resolution — the bbox doesn't need full res.
  var scanScale = Math.min(1, 800 / Math.max(natW, natH));
  var scanW = Math.max(1, Math.round(natW * scanScale));
  var scanH = Math.max(1, Math.round(natH * scanScale));
  var canvas = document.createElement("canvas");
  canvas.width = scanW;
  canvas.height = scanH;
  var ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, scanW, scanH);

  var pixels;
  try {
    pixels = ctx.getImageData(0, 0, scanW, scanH);
  } catch (e) {
    return identity; // tainted canvas (missing CORS) — show uncropped
  }

  var box = contentBounds(pixels);
  if (!box) return identity;

  var pad = Math.round(Math.max(box.w, box.h) * PAD_RATIO);
  var left = Math.max(0, box.x - pad);
  var top = Math.max(0, box.y - pad);
  var right = Math.min(scanW, box.x + box.w + pad);
  var bottom = Math.min(scanH, box.y + box.h + pad);

  var rect = {
    x: left / scanW,
    y: top / scanH,
    w: (right - left) / scanW,
    h: (bottom - top) / scanH,
  };
  if (rect.w * rect.h >= IDENTITY_AREA) return identity;

  // Output pass crops from the full-res image so the result stays crisp.
  var cropW = Math.round(rect.w * natW);
  var cropH = Math.round(rect.h * natH);
  var outScale = Math.min(1, MAX_OUTPUT_PX / Math.max(cropW, cropH));
  var out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cropW * outScale));
  out.height = Math.max(1, Math.round(cropH * outScale));
  out.getContext("2d").drawImage(
    img,
    Math.round(rect.x * natW), Math.round(rect.y * natH), cropW, cropH,
    0, 0, out.width, out.height
  );

  return { src: out.toDataURL("image/png"), rect: rect };
}
