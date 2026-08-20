/**
 * Photo-style seamless floor tiles for 2D SVG room fills (Drafted-like).
 * Generated once on canvas, cached as data URLs, embedded in SVG patterns.
 */

const NS = "http://www.w3.org/2000/svg";
const _dataUrlCache = {};

function canvasDataUrl(key, width, height, draw) {
  if (_dataUrlCache[key]) return _dataUrlCache[key];
  var cv = document.createElement("canvas");
  cv.width = width;
  cv.height = height;
  draw(cv.getContext("2d"), width, height);
  _dataUrlCache[key] = cv.toDataURL("image/png");
  return _dataUrlCache[key];
}

function svgEl(tag) {
  return document.createElementNS(NS, tag);
}

function addImagePattern(defs, id, dataUrl, pw, ph) {
  if (defs.querySelector("#" + id)) return;
  var pat = svgEl("pattern");
  pat.setAttribute("id", id);
  pat.setAttribute("patternUnits", "userSpaceOnUse");
  pat.setAttribute("width", String(pw));
  pat.setAttribute("height", String(ph));
  var img = svgEl("image");
  img.setAttribute("href", dataUrl);
  img.setAttribute("width", String(pw));
  img.setAttribute("height", String(ph));
  img.setAttribute("preserveAspectRatio", "none");
  pat.appendChild(img);
  defs.appendChild(pat);
}

export function drawWoodPlanks(ctx, w, h) {
  // Light oak boards, low contrast (≤8% tone variation between planks).
  var plankH = Math.max(18, Math.round(h / 10));
  ctx.fillStyle = "#d8c4a4";
  ctx.fillRect(0, 0, w, h);
  var row = 0;
  for (var y = 0; y < h; y += plankH, row++) {
    var tone = 0.96 + Math.random() * 0.08;
    ctx.fillStyle =
      "rgb(" +
      Math.round(216 * tone) +
      "," +
      Math.round(196 * tone) +
      "," +
      Math.round(164 * tone) +
      ")";
    ctx.fillRect(0, y, w, plankH - 1);
    for (var i = 0; i < 14; i++) {
      var gy = y + Math.random() * plankH;
      ctx.strokeStyle = "rgba(150,124,92," + (0.03 + Math.random() * 0.05) + ")";
      ctx.lineWidth = 0.6 + Math.random() * 0.7;
      ctx.beginPath();
      var yy = gy;
      ctx.moveTo(-2, yy);
      for (var gx = 0; gx <= w + 2; gx += 24) {
        yy = gy + Math.sin(gx * 0.03 + row * 5 + i) * 1.2;
        yy = Math.max(y + 1, Math.min(y + plankH - 2, yy));
        ctx.lineTo(gx, yy);
      }
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(140,118,90,0.35)";
    ctx.fillRect(0, y, w, 1);
    ctx.fillRect(((row * 0.37 + 0.21) % 1) * w, y, 1, plankH);
  }
}

function drawWoodPlanksDark(ctx, w, h) {
  // Same plank artwork multiplied down to dark walnut (matches 3D "wood-dark").
  drawWoodPlanks(ctx, w, h);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "#8a684a";
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
}

export function drawChevronParquet(ctx, w, h) {
  // French chevron: 4 columns of 45° planks, direction alternating per column.
  // Seams meet at column boundaries (V joints); tones repeat with the canvas so it tiles.
  var colW = w / 4;
  var seam = h / 8;
  ctx.fillStyle = "#d3bd97";
  ctx.fillRect(0, 0, w, h);
  for (var c = 0; c < 4; c++) {
    var dir = c % 2 === 0 ? 1 : -1;
    var x0 = c * colW;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, 0, colW, h);
    ctx.clip();
    var rows = Math.ceil(h / seam) + 2;
    for (var k = -3; k < rows + 1; k++) {
      var kk = ((k % 8) + 8) % 8;
      var tone = 0.9 + ((Math.sin(kk * 12.9898 + c * 78.233) + 1) / 2) * 0.18;
      var y0 = k * seam;
      ctx.fillStyle =
        "rgb(" +
        Math.round(211 * tone) +
        "," +
        Math.round(186 * tone) +
        "," +
        Math.round(146 * tone) +
        ")";
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + colW, y0 + dir * colW);
      ctx.lineTo(x0 + colW, y0 + dir * colW + seam);
      ctx.lineTo(x0, y0 + seam);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(116,84,50,0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + colW, y0 + dir * colW);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(116,84,50,0.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0, h);
    ctx.stroke();
  }
}

export function drawCalacattaMarble(ctx, w, h) {
  // Warm white marble slab with grey clouds and diagonal grey/gold veins.
  ctx.fillStyle = "#edebe6";
  ctx.fillRect(0, 0, w, h);
  for (var i = 0; i < 24; i++) {
    var x = Math.random() * w;
    var y = Math.random() * h;
    var r = 12 + (Math.random() * w) / 5;
    var g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, "rgba(196,198,202,0.16)");
    g.addColorStop(1, "rgba(196,198,202,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function veins(color, lw, count) {
    for (var v = 0; v < count; v++) {
      var px = Math.random() * w;
      var py = Math.random() * h;
      var a = Math.PI / 4 + (Math.random() - 0.5) * 0.6;
      ctx.strokeStyle = color;
      ctx.lineWidth = lw * (0.6 + Math.random());
      ctx.beginPath();
      ctx.moveTo(px, py);
      for (var s = 0; s < 26; s++) {
        a += (Math.random() - 0.5) * 0.5;
        px += Math.cos(a) * (w / 30);
        py += Math.sin(a) * (w / 30);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
  veins("rgba(120,126,136,0.35)", 1.6, 4);
  veins("rgba(120,126,136,0.2)", 0.8, 6);
  veins("rgba(176,154,110,0.18)", 1, 3);
}

export function drawMarbleTile(ctx, w, h) {
  // Light blue-grey bathroom tile grid.
  ctx.fillStyle = "#e2e8ed";
  ctx.fillRect(0, 0, w, h);
  var tile = Math.round(w / 4);
  for (var ty = 0; ty < h; ty += tile) {
    for (var tx = 0; tx < w; tx += tile) {
      var v = Math.sin(tx * 0.07) * Math.cos(ty * 0.09) * 3;
      ctx.fillStyle = "rgb(" + Math.round(226 + v) + "," + Math.round(232 + v) + "," + Math.round(237 + v) + ")";
      ctx.fillRect(tx + 1, ty + 1, tile - 2, tile - 2);
    }
  }
  ctx.strokeStyle = "rgba(154, 166, 180, 0.6)";
  ctx.lineWidth = 1.2;
  for (var i = 0; i <= w; i += tile) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(w, i);
    ctx.stroke();
  }
}

function drawKitchenTile(ctx, w, h) {
  // Beige large-format tile.
  ctx.fillStyle = "#ece3d2";
  ctx.fillRect(0, 0, w, h);
  var tile = Math.round(w / 2);
  for (var ky = 0; ky < h; ky += tile) {
    for (var kx = 0; kx < w; kx += tile) {
      var kv = ((kx + ky) % (tile * 2) === 0) ? 3 : -2;
      ctx.fillStyle = "rgb(" + (236 + kv) + "," + (227 + kv) + "," + (210 + kv) + ")";
      ctx.fillRect(kx + 1, ky + 1, tile - 2, tile - 2);
    }
  }
  ctx.strokeStyle = "rgba(205, 190, 160, 0.55)";
  ctx.lineWidth = 1;
  for (var gi = 0; gi <= w; gi += tile) {
    ctx.beginPath();
    ctx.moveTo(gi, 0);
    ctx.lineTo(gi, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, gi);
    ctx.lineTo(w, gi);
    ctx.stroke();
  }
}

function drawConcrete(ctx, w, h) {
  ctx.fillStyle = "#c8ccd1";
  ctx.fillRect(0, 0, w, h);
  for (var c = 0; c < w * h * 0.008; c++) {
    var a = Math.random() * 0.12;
    ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255," + a + ")" : "rgba(0,0,0," + a + ")";
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  ctx.globalAlpha = 0.15;
  for (var s = 0; s < 8; s++) {
    ctx.fillStyle = "#a0a4aa";
    ctx.beginPath();
    ctx.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 30, 8 + Math.random() * 12, Math.random(), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawCarpet(ctx, w, h) {
  ctx.fillStyle = "#e8dfd2";
  ctx.fillRect(0, 0, w, h);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var n = Math.sin(x * 0.9) * Math.cos(y * 0.7) * 0.5 + Math.random() * 0.5;
      var t = 232 + n * 8;
      ctx.fillStyle = "rgb(" + Math.round(t) + "," + Math.round(t - 6) + "," + Math.round(t - 14) + ")";
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

/** @typedef {{ id: string, url: string, pw: number, ph: number }} PhotoPatternSpec */

/** @returns {PhotoPatternSpec[]} */
export function getPhotoPatternSpecs() {
  return [
    {
      id: "photo-wood-floor",
      url: canvasDataUrl("wood", 256, 512, drawWoodPlanks),
      pw: 64,
      ph: 128,
    },
    {
      id: "photo-wood-dark-floor",
      url: canvasDataUrl("wood-dark", 256, 512, drawWoodPlanksDark),
      pw: 64,
      ph: 128,
    },
    {
      id: "photo-chevron-floor",
      url: canvasDataUrl("chevron", 256, 256, drawChevronParquet),
      pw: 72,
      ph: 72,
    },
    {
      id: "photo-marble-floor",
      url: canvasDataUrl("calacatta", 256, 256, drawCalacattaMarble),
      pw: 96,
      ph: 96,
    },
    {
      id: "photo-tile-floor",
      url: canvasDataUrl("marble", 256, 256, drawMarbleTile),
      pw: 64,
      ph: 64,
    },
    {
      id: "photo-kitchen-floor",
      url: canvasDataUrl("kitchen", 256, 256, drawKitchenTile),
      pw: 64,
      ph: 64,
    },
    {
      id: "photo-stone-floor",
      url: canvasDataUrl("concrete", 256, 256, drawConcrete),
      pw: 80,
      ph: 80,
    },
    {
      id: "photo-carpet",
      url: canvasDataUrl("carpet", 128, 128, drawCarpet),
      pw: 48,
      ph: 48,
    },
  ];
}

/**
 * The five premium floor finishes selectable in the paint palette.
 * `id` is stored on room.flooring; `url` is a thumbnail for the swatch.
 * @returns {{ id: string, label: string, url: string }[]}
 */
export function getFloorFinishes() {
  return [
    { id: "oak", label: "Light oak", url: canvasDataUrl("wood", 256, 512, drawWoodPlanks) },
    {
      id: "chevron",
      label: "Chevron oak",
      url: canvasDataUrl("chevron", 256, 256, drawChevronParquet),
    },
    {
      id: "wood-dark",
      label: "Dark walnut",
      url: canvasDataUrl("wood-dark", 256, 512, drawWoodPlanksDark),
    },
    {
      id: "marble",
      label: "Calacatta marble",
      url: canvasDataUrl("calacatta", 256, 256, drawCalacattaMarble),
    },
    { id: "stone", label: "Grey stone", url: canvasDataUrl("concrete", 256, 256, drawConcrete) },
  ];
}

/**
 * Inject photo SVG patterns into defs (idempotent).
 * @param {SVGDefsElement} defs
 */
export function ensurePhotoFloorPatterns(defs) {
  if (!defs || defs.getAttribute("data-photo-floor-patterns") === "1") return;
  getPhotoPatternSpecs().forEach(function (spec) {
    addImagePattern(defs, spec.id, spec.url, spec.pw, spec.ph);
  });
  defs.setAttribute("data-photo-floor-patterns", "1");
}

/**
 * @param {object} room
 * @returns {string}
 */
export function photoPatternForRoom(room) {
  var flooring = String(room.flooring || "").toLowerCase();
  var name = String(room.type || room.name || "").toLowerCase();
  if (flooring === "carpet") return "url(#photo-carpet)";
  // Explicit premium finishes (paint tool / floor select) win over name-based defaults.
  if (flooring === "oak") return "url(#photo-wood-floor)";
  if (flooring === "wood-dark") return "url(#photo-wood-dark-floor)";
  if (flooring === "chevron") return "url(#photo-chevron-floor)";
  if (flooring === "marble") return "url(#photo-marble-floor)";
  if (
    flooring === "stone" ||
    name.indexOf("garage") >= 0 ||
    name.indexOf("utility") >= 0 ||
    name.indexOf("store") >= 0 ||
    name.indexOf("balcon") >= 0 ||
    name.indexOf("terrace") >= 0 ||
    name.indexOf("patio") >= 0 ||
    name.indexOf("deck") >= 0
  ) {
    return "url(#photo-stone-floor)";
  }
  if (flooring === "tile" || name.indexOf("bath") >= 0 || name.indexOf("toilet") >= 0 || name.indexOf("wc") >= 0) {
    return "url(#photo-tile-floor)";
  }
  if (
    name.indexOf("kitchen") >= 0 ||
    name.indexOf("pantry") >= 0 ||
    name.indexOf("laundry") >= 0
  ) {
    return "url(#photo-kitchen-floor)";
  }
  if (
    flooring === "wood" ||
    name.indexOf("bed") >= 0 ||
    name.indexOf("living") >= 0 ||
    name.indexOf("dining") >= 0 ||
    name.indexOf("hall") >= 0 ||
    name.indexOf("foyer") >= 0 ||
    name.indexOf("office") >= 0 ||
    name.indexOf("great") >= 0 ||
    name.indexOf("porch") >= 0
  ) {
    return "url(#photo-wood-floor)";
  }
  return "url(#photo-wood-floor)";
}
