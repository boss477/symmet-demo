/**
 * Hyper-realistic 2D plan render — no AI, pure canvas.
 * Rasterizes the SVG plan in two layers (floors/walls, furniture), then adds
 * archviz passes: wall-base ambient occlusion, furniture contact + directional
 * shadows toward bottom-right, top-left morning sunlight, warm grade, vignette,
 * subtle film grain.
 */
import { renderPlan } from "./svgRenderer.js";

var NS = "http://www.w3.org/2000/svg";

function svgToImage(svg, width, height) {
  svg.setAttribute("xmlns", NS);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", "0 0 " + width + " " + height);
  var markup = new XMLSerializer().serializeToString(svg);
  var url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markup);
  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.onload = function () {
      resolve(img);
    };
    img.onerror = function () {
      reject(new Error("Could not rasterize plan SVG"));
    };
    img.src = url;
  });
}

function renderLayerSvg(data, size, opts, stripSelectors) {
  var svg = document.createElementNS(NS, "svg");
  renderPlan(svg, data, null, [], size, opts);
  (stripSelectors || []).forEach(function (sel) {
    svg.querySelectorAll(sel).forEach(function (el) {
      el.remove();
    });
  });
  return svg;
}

/** Trace every room polygon into the current path (for clipping passes). */
function roomsPath(ctx, rooms, w, h) {
  ctx.beginPath();
  (rooms || []).forEach(function (room) {
    var poly = room.polygon;
    if (!poly || poly.length < 3) return;
    for (var i = 0; i < poly.length; i++) {
      var x = poly[i].x * w;
      var y = poly[i].y * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  });
}

/** Inner shadow along wall bases: blurred stroke clipped inside each room. */
function drawRoomInnerShadows(ctx, rooms, w, h, scale) {
  (rooms || []).forEach(function (room) {
    var poly = room.polygon;
    if (!poly || poly.length < 3) return;
    ctx.save();
    ctx.beginPath();
    for (var i = 0; i < poly.length; i++) {
      var x = poly[i].x * w;
      var y = poly[i].y * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.clip();
    ctx.filter = "blur(" + 4 * scale + "px)";
    ctx.strokeStyle = "rgba(60,45,30,0.35)";
    ctx.lineWidth = 3 * scale;
    ctx.stroke();
    ctx.restore();
  });
}

/** Black blurred silhouette of a layer, offset — used for furniture shadows. */
function drawSilhouette(ctx, img, w, h, dx, dy, blur, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.filter = "brightness(0) blur(" + blur + "px)";
  ctx.drawImage(img, dx, dy, w, h);
  ctx.restore();
}

/** Morning sun from top-left, clipped to rooms so the background stays white. */
function applySunlight(ctx, rooms, w, h) {
  var g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "rgba(255,243,220,0.16)");
  g.addColorStop(0.45, "rgba(255,248,235,0.04)");
  g.addColorStop(1, "rgba(43,36,26,0.07)");
  ctx.save();
  roomsPath(ctx, rooms, w, h);
  ctx.clip();
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Slightly warm white balance over the rooms only. */
function applyWarmGrade(ctx, rooms, w, h) {
  ctx.save();
  roomsPath(ctx, rooms, w, h);
  ctx.clip();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "#fff6e8";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Very subtle film grain. */
function applyFilmGrain(ctx, w, h) {
  var n = document.createElement("canvas");
  n.width = 128;
  n.height = 128;
  var nctx = n.getContext("2d");
  var id = nctx.createImageData(128, 128);
  for (var i = 0; i < id.data.length; i += 4) {
    var v = 128 + (Math.random() - 0.5) * 200;
    id.data[i] = v;
    id.data[i + 1] = v;
    id.data[i + 2] = v;
    id.data[i + 3] = 255;
  }
  nctx.putImageData(id, 0, 0);
  ctx.save();
  ctx.globalAlpha = 0.025;
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = ctx.createPattern(n, "repeat");
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * @param {object} data plan JSON (rooms, walls, furniture, doors, windows)
 * @param {{width:number,height:number}} size overlay size used by renderPlan
 * @param {object|null} furnitureRenderCtx same ctx the live SVG render uses
 * @returns {Promise<HTMLCanvasElement>}
 */
export function renderRealisticPlanCanvas(data, size, furnitureRenderCtx) {
  var scale = Math.min(3, 4096 / Math.max(size.width || 1, size.height || 1));
  if (!(scale > 1)) scale = 1;
  var w = Math.round(size.width * scale);
  var h = Math.round(size.height * scale);

  var baseData = Object.assign({}, data, { furniture: [], calibration: null });
  var furnData = {
    rooms: [],
    walls: [],
    doors: [],
    windows: [],
    calibration: null,
    furniture: data.furniture || [],
    furniture_catalog: data.furniture_catalog || [],
  };
  var opts = { furnitureRenderCtx: furnitureRenderCtx || null };
  var baseSvg = renderLayerSvg(baseData, size, opts, [".plan-label", ".plan-bg-group"]);
  var furnSvg = renderLayerSvg(furnData, size, opts, [".plan-bg-group"]);

  return Promise.all([
    svgToImage(baseSvg, size.width, size.height),
    svgToImage(furnSvg, size.width, size.height),
  ]).then(function (imgs) {
    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(imgs[0], 0, 0, w, h);
    drawRoomInnerShadows(ctx, data.rooms, w, h, scale);
    drawSilhouette(ctx, imgs[1], w, h, 1.5 * scale, 1.5 * scale, 2.5 * scale, 0.3);
    drawSilhouette(ctx, imgs[1], w, h, 7 * scale, 9 * scale, 8 * scale, 0.14);
    ctx.drawImage(imgs[1], 0, 0, w, h);
    applySunlight(ctx, data.rooms, w, h);
    applyWarmGrade(ctx, data.rooms, w, h);
    applyFilmGrain(ctx, w, h);
    return canvas;
  });
}
