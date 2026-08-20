/**
 * Composite a small floor-plan thumbnail with an orange camera-direction
 * marker, for embedding in the pitch-deck render slides.
 *
 * Reuses the same camera state the on-screen mini-map consumes
 * (get3DCameraMiniMapState → { x, y, heading }) so the marker matches what
 * the user sees: x/y in 0–1 plan space, heading in radians (map space, where
 * +x is right and +y is down — same as worldToNorm).
 */

var MARKER_COLOR = "#ff6a00"; // PwC/Awfis orange accent
var FOV_RAD = Math.PI / 3; // 60° field-of-view wedge for the POV cone

/**
 * @param {string} src  plan image URL (R2/blob/data URI). R2 needs CORS for export.
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(src) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    // Allow canvas export when the plan lives on R2 (cross-origin).
    img.crossOrigin = "anonymous";
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(new Error("Failed to load plan image")); };
    img.src = src;
  });
}

/**
 * Draw a camera POV marker at (cx, cy): a field-of-view cone fanning out
 * along `heading` radians, plus a camera dot at the origin — so it reads as
 * "the shot was taken from here, looking this way" (like a key-plan camera).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} heading
 * @param {number} size  marker unit size in px (dot radius ≈ size)
 * @param {number} [fov]  horizontal field of view in radians (default 60°)
 */
function drawCameraMarker(ctx, cx, cy, heading, size, fov) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(heading);

  // Field-of-view cone, opening along +x before rotation.
  var reach = size * 4.5;
  var half = (fov || FOV_RAD) / 2;
  var ex = reach * Math.cos(half);
  var ey = reach * Math.sin(half);

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(ex, -ey);
  ctx.lineTo(ex, ey);
  ctx.closePath();

  var grad = ctx.createLinearGradient(0, 0, reach, 0);
  grad.addColorStop(0, "rgba(255,106,0,0.55)");
  grad.addColorStop(1, "rgba(255,106,0,0)");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.18);
  ctx.strokeStyle = MARKER_COLOR;
  ctx.stroke();

  // Camera origin dot (white halo + orange core) so it stays visible on ink.
  ctx.beginPath();
  ctx.arc(0, 0, size * 1.1, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.7, 0, Math.PI * 2);
  ctx.fillStyle = MARKER_COLOR;
  ctx.fill();

  ctx.restore();
}

/**
 * Render the plan thumbnail + camera marker to a PNG data URL.
 * @param {string} planSrc  plan image source (same value as minimapImg.src)
 * @param {{ x: number, y: number, heading: number, fov?: number } | null} cam
 *   camera mini-map state; pass null to render the plan with no marker.
 * @param {{ maxWidth?: number }} [opts]
 * @returns {Promise<string>}  data:image/png;base64,…
 */
export async function renderPlanThumbnail(planSrc, cam, opts) {
  opts = opts || {};
  var maxWidth = opts.maxWidth || 520;

  var img = await loadImage(planSrc);
  var natW = img.naturalWidth || maxWidth;
  var natH = img.naturalHeight || maxWidth;

  var scale = Math.min(1, maxWidth / natW);
  var w = Math.round(natW * scale);
  var h = Math.round(natH * scale);

  var canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext("2d");

  ctx.drawImage(img, 0, 0, w, h);

  if (cam && isFinite(cam.x) && isFinite(cam.y)) {
    var cx = Math.max(0, Math.min(1, cam.x)) * w;
    var cy = Math.max(0, Math.min(1, cam.y)) * h;
    var size = Math.max(8, Math.min(w, h) * 0.045);
    drawCameraMarker(ctx, cx, cy, cam.heading || 0, size, cam.fov);
  }

  return canvas.toDataURL("image/png");
}
