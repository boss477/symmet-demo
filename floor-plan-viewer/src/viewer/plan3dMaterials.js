import * as THREE from "three";
import { WALL_COLOR_PRESETS } from "./planTools.js";
import {
  drawWoodPlanks,
  drawMarbleTile,
  drawChevronParquet,
  drawCalacattaMarble,
} from "./floorPhotoTextures.js";

var _disposables = [];

/** @param {THREE.Texture} tex */
function track(tex) {
  _disposables.push(tex);
  return tex;
}

export function disposeMaterials() {
  _disposables.forEach(function (t) {
    t.dispose();
  });
  _disposables.length = 0;
  clearWallMaterialCache();
  _fabricRough = null;
  _woodGrain = null;
}

/**
 * @param {number} sz
 * @param {(ctx: CanvasRenderingContext2D, sz: number) => void} drawFn
 * @param {number} [repeatX]
 * @param {number} [repeatY]
 * @param {boolean} [isColor] true for diffuse/color maps (sRGB); false for data maps
 */
export function mkTex(sz, drawFn, repeatX, repeatY, isColor) {
  var cv = document.createElement("canvas");
  cv.width = cv.height = sz;
  drawFn(cv.getContext("2d"), sz);
  var t = track(new THREE.CanvasTexture(cv));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX || 1, repeatY || 1);
  t.anisotropy = 8;
  // Canvas colors are authored in sRGB — without this the renderer treats them
  // as linear and the texture displays washed-out / desaturated.
  if (isColor) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Non-square canvas texture for draw fns with (ctx, w, h) signature. */
function mkTexRect(w, h, drawFn, repeatX, repeatY, isColor) {
  var cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  drawFn(cv.getContext("2d"), w, h);
  var t = track(new THREE.CanvasTexture(cv));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX || 1, repeatY || 1);
  t.anisotropy = 8;
  if (isColor) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function fabricRoughnessTex() {
  return mkTex(
    256,
    function (ctx, sz) {
      ctx.fillStyle = "#b4b4b4";
      ctx.fillRect(0, 0, sz, sz);
      for (var i = 0; i < 8000; i++) {
        var a = Math.random() * 0.25;
        ctx.fillStyle = "rgba(0,0,0," + a + ")";
        ctx.fillRect(Math.random() * sz, Math.random() * sz, 1 + Math.random(), 1);
      }
    },
    2,
    2
  );
}

function woodGrainTex() {
  return mkTex(
    256,
    function (ctx, sz) {
      ctx.fillStyle = "#909090";
      ctx.fillRect(0, 0, sz, sz);
      for (var i = 0; i < sz; i += 2) {
        var v = 80 + Math.sin(i * 0.4) * 25 + Math.random() * 15;
        ctx.strokeStyle = "rgb(" + v + "," + v + "," + v + ")";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(sz, i + Math.random() * 4 - 2);
        ctx.stroke();
      }
    },
    1,
    4
  );
}

var _fabricRough = null;
var _woodGrain = null;

export function getFabricRoughnessMap() {
  if (!_fabricRough) _fabricRough = fabricRoughnessTex();
  return _fabricRough;
}

export function getWoodGrainMap() {
  if (!_woodGrain) _woodGrain = woodGrainTex();
  return _woodGrain;
}

// ---- PBR helpers: height-painted canvas → tangent-space normal map ----

function normalFromHeightCanvas(src, strength) {
  var sz = src.width;
  var data = src.getContext("2d").getImageData(0, 0, sz, sz).data;
  function h(x, y) {
    x = (x + sz) % sz;
    y = (y + sz) % sz;
    return data[(y * sz + x) * 4];
  }
  var out = document.createElement("canvas");
  out.width = out.height = sz;
  var octx = out.getContext("2d");
  var img = octx.createImageData(sz, sz);
  var od = img.data;
  for (var y = 0; y < sz; y++) {
    for (var x = 0; x < sz; x++) {
      var dx = ((h(x - 1, y) - h(x + 1, y)) * strength) / 255;
      var dy = ((h(x, y - 1) - h(x, y + 1)) * strength) / 255;
      var len = Math.sqrt(dx * dx + dy * dy + 1);
      var i = (y * sz + x) * 4;
      od[i] = (dx / len) * 127.5 + 127.5;
      od[i + 1] = (dy / len) * 127.5 + 127.5;
      od[i + 2] = (1 / len) * 127.5 + 127.5;
      od[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/** Normal map texture from a height-drawing function. */
export function mkNormalTex(sz, drawHeightFn, repeatX, repeatY, strength) {
  var hcv = document.createElement("canvas");
  hcv.width = hcv.height = sz;
  drawHeightFn(hcv.getContext("2d"), sz);
  var t = track(new THREE.CanvasTexture(normalFromHeightCanvas(hcv, strength || 1)));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX || 1, repeatY || 1);
  t.anisotropy = 8;
  return t;
}

// ---- oak plank floor (light Scandinavian oak) ----

var OAK_PLANKS = 10;

function oakButtJointX(p, sz) {
  return ((p * 0.37 + 0.21) % 1) * sz;
}

function drawOakDiffuse(ctx, sz) {
  var ph = sz / OAK_PLANKS;
  for (var p = 0; p < OAK_PLANKS; p++) {
    var tone = 0.86 + Math.random() * 0.22;
    ctx.fillStyle =
      "rgb(" +
      Math.round(214 * tone) +
      "," +
      Math.round(183 * tone) +
      "," +
      Math.round(138 * tone) +
      ")";
    ctx.fillRect(0, p * ph, sz, ph);
    for (var i = 0; i < 64; i++) {
      var y = p * ph + Math.random() * ph;
      ctx.strokeStyle = "rgba(116,84,50," + (0.06 + Math.random() * 0.11) + ")";
      ctx.lineWidth = 0.6 + Math.random() * 1.2;
      ctx.beginPath();
      var yy = y;
      ctx.moveTo(-4, yy);
      for (var x = 0; x <= sz + 4; x += 32) {
        yy = y + Math.sin(x * 0.02 + p * 7 + i) * 1.6 + (Math.random() - 0.5) * 1.2;
        yy = Math.max(p * ph + 1, Math.min((p + 1) * ph - 1, yy));
        ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    if (Math.random() < 0.45) {
      var kx = Math.random() * sz;
      var ky = p * ph + ph * (0.3 + Math.random() * 0.4);
      var kr = 3 + Math.random() * 5;
      var grad = ctx.createRadialGradient(kx, ky, 0.5, kx, ky, kr);
      grad.addColorStop(0, "rgba(96,66,40,0.5)");
      grad.addColorStop(1, "rgba(96,66,40,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(kx, ky, kr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(74,55,38,0.8)";
    ctx.fillRect(0, p * ph, sz, 1.5);
    ctx.fillRect(oakButtJointX(p, sz), p * ph, 1.5, ph);
  }
  for (var d = 0; d < 1400; d++) {
    ctx.fillStyle = "rgba(255,246,228," + Math.random() * 0.03 + ")";
    ctx.fillRect(Math.random() * sz, Math.random() * sz, 2, 1);
  }
}

function drawOakHeight(ctx, sz) {
  var ph = sz / OAK_PLANKS;
  for (var p = 0; p < OAK_PLANKS; p++) {
    var v = 150 + Math.round((Math.random() - 0.5) * 16);
    ctx.fillStyle = "rgb(" + v + "," + v + "," + v + ")";
    ctx.fillRect(0, p * ph, sz, ph);
    for (var i = 0; i < 36; i++) {
      ctx.strokeStyle = "rgba(112,112,112," + (0.1 + Math.random() * 0.14) + ")";
      ctx.lineWidth = 1;
      var y = p * ph + Math.random() * ph;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(sz, y + (Math.random() * 4 - 2));
      ctx.stroke();
    }
    ctx.fillStyle = "rgb(42,42,42)";
    ctx.fillRect(0, p * ph, sz, 2);
    ctx.fillRect(oakButtJointX(p, sz), p * ph, 2, ph);
  }
}

function drawOakRoughness(ctx, sz) {
  var ph = sz / OAK_PLANKS;
  ctx.fillStyle = "#737373";
  ctx.fillRect(0, 0, sz, sz);
  for (var p = 0; p < OAK_PLANKS; p++) {
    for (var i = 0; i < 24; i++) {
      ctx.strokeStyle = "rgba(150,150,150," + Math.random() * 0.25 + ")";
      ctx.lineWidth = 1 + Math.random();
      var y = p * ph + Math.random() * ph;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(sz, y + (Math.random() * 4 - 2));
      ctx.stroke();
    }
    ctx.fillStyle = "rgb(205,205,205)";
    ctx.fillRect(0, p * ph, sz, 2);
    ctx.fillRect(oakButtJointX(p, sz), p * ph, 2, ph);
  }
}

// ---- marble / stone ----

function marbleVeins(ctx, sz, count, color, width) {
  for (var v = 0; v < count; v++) {
    var x = Math.random() * sz;
    var y = Math.random() * sz;
    var ang = Math.random() * Math.PI * 2;
    var steps = 22 + Math.floor(Math.random() * 26);
    for (var pass = 0; pass < 3; pass++) {
      var px = x;
      var py = y;
      var pa = ang;
      ctx.strokeStyle = "rgba(" + color + "," + (0.05 + pass * 0.04) + ")";
      ctx.lineWidth = width * (1.7 - pass * 0.5);
      ctx.beginPath();
      ctx.moveTo(px, py);
      for (var s = 0; s < steps; s++) {
        pa += (Math.random() - 0.5) * 0.7;
        px += Math.cos(pa) * (sz / 38);
        py += Math.sin(pa) * (sz / 38);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
}

function mottle(ctx, sz, count, rgba, maxR) {
  for (var i = 0; i < count; i++) {
    var x = Math.random() * sz;
    var y = Math.random() * sz;
    var r = 6 + Math.random() * maxR;
    var grad = ctx.createRadialGradient(x, y, 1, x, y, r);
    grad.addColorStop(0, rgba);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMarbleDiffuse(base, veinColor, veinCount) {
  return function (ctx, sz) {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, sz, sz);
    mottle(ctx, sz, 26, "rgba(255,255,255,0.08)", sz / 6);
    mottle(ctx, sz, 22, "rgba(120,124,132,0.05)", sz / 7);
    marbleVeins(ctx, sz, veinCount, veinColor, 1.4);
    marbleVeins(ctx, sz, Math.ceil(veinCount / 2), veinColor, 0.7);
  };
}

function groutGrid(ctx, sz, divisions, style, lineW) {
  ctx.strokeStyle = style;
  ctx.lineWidth = lineW;
  for (var i = 0; i <= divisions; i++) {
    var t = (sz * i) / divisions;
    ctx.beginPath();
    ctx.moveTo(t, 0);
    ctx.lineTo(t, sz);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, t);
    ctx.lineTo(sz, t);
    ctx.stroke();
  }
}

function drawTileHeight(divisions) {
  return function (ctx, sz) {
    ctx.fillStyle = "rgb(160,160,160)";
    ctx.fillRect(0, 0, sz, sz);
    mottle(ctx, sz, 30, "rgba(176,176,176,0.5)", sz / 8);
    groutGrid(ctx, sz, divisions, "rgb(60,60,60)", 3);
  };
}

function drawStoneHeight(ctx, sz) {
  ctx.fillStyle = "rgb(158,158,158)";
  ctx.fillRect(0, 0, sz, sz);
  mottle(ctx, sz, 40, "rgba(180,180,180,0.45)", sz / 7);
  mottle(ctx, sz, 40, "rgba(132,132,132,0.4)", sz / 8);
}

function drawPlasterHeight(ctx, sz) {
  ctx.fillStyle = "rgb(150,150,150)";
  ctx.fillRect(0, 0, sz, sz);
  for (var i = 0; i < 5000; i++) {
    var v = 130 + Math.random() * 40;
    ctx.fillStyle = "rgba(" + v + "," + v + "," + v + ",0.5)";
    ctx.fillRect(Math.random() * sz, Math.random() * sz, 1 + Math.random() * 2, 1);
  }
  mottle(ctx, sz, 18, "rgba(168,168,168,0.35)", sz / 9);
}

function drawCarpetDiffuse(ctx, sz) {
  ctx.fillStyle = "#cfc9bf";
  ctx.fillRect(0, 0, sz, sz);
  for (var i = 0; i < 14000; i++) {
    var v = Math.random();
    ctx.fillStyle =
      v > 0.5
        ? "rgba(255,252,244," + Math.random() * 0.1 + ")"
        : "rgba(96,88,76," + Math.random() * 0.12 + ")";
    ctx.fillRect(Math.random() * sz, Math.random() * sz, 1.5, 1.5);
  }
}

function drawCarpetHeight(ctx, sz) {
  ctx.fillStyle = "rgb(150,150,150)";
  ctx.fillRect(0, 0, sz, sz);
  for (var i = 0; i < 9000; i++) {
    var v = 110 + Math.random() * 80;
    ctx.fillStyle = "rgb(" + v + "," + v + "," + v + ")";
    ctx.fillRect(Math.random() * sz, Math.random() * sz, 2, 2);
  }
}

/**
 * Floor materials share the 2D plan's canvas artwork (floorPhotoTextures.js).
 * Room floors are ShapeGeometry whose UVs equal world coordinates in meters,
 * so repeat = 1/span pins the texture to real-world scale in every room.
 * @param {string} [flooring]
 */
export function createFloorMaterial(flooring) {
  var kind = String(flooring || "").toLowerCase();

  if (kind === "wood" || kind === "oak") {
    // One tile spans 1.2m x 1.6m: ~16cm boards, butt joints every ~1.2m.
    return new THREE.MeshStandardMaterial({
      map: mkTexRect(256, 512, drawWoodPlanks, 1 / 1.2, 1 / 1.6, true),
      normalMap: mkNormalTex(256, drawOakHeight, 1 / 1.2, 1 / 1.6, 1.4),
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughnessMap: mkTex(256, drawOakRoughness, 1 / 1.2, 1 / 1.6),
      roughness: 0.85,
      metalness: 0.0,
      envMapIntensity: 0.8,
      side: THREE.DoubleSide,
    });
  }

  if (kind === "wood-dark") {
    // Bedrooms: same plank artwork multiplied down to a dark walnut tone.
    return new THREE.MeshStandardMaterial({
      map: mkTexRect(
        256,
        512,
        function (ctx, w, h) {
          drawWoodPlanks(ctx, w, h);
          ctx.globalCompositeOperation = "multiply";
          ctx.fillStyle = "#8a684a";
          ctx.fillRect(0, 0, w, h);
          ctx.globalCompositeOperation = "source-over";
        },
        1 / 1.2,
        1 / 1.6,
        true
      ),
      normalMap: mkNormalTex(256, drawOakHeight, 1 / 1.2, 1 / 1.6, 1.4),
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughnessMap: mkTex(256, drawOakRoughness, 1 / 1.2, 1 / 1.6),
      roughness: 0.8,
      metalness: 0.0,
      envMapIntensity: 0.7,
      side: THREE.DoubleSide,
    });
  }

  if (kind === "chevron") {
    // One chevron tile spans 1.6m: ~20cm planks in 40cm columns.
    return new THREE.MeshStandardMaterial({
      map: mkTexRect(256, 256, drawChevronParquet, 1 / 1.6, 1 / 1.6, true),
      roughness: 0.7,
      metalness: 0.0,
      envMapIntensity: 0.8,
      side: THREE.DoubleSide,
    });
  }

  if (kind === "marble") {
    // Polished Calacatta slab, 2m repeat.
    return new THREE.MeshStandardMaterial({
      map: mkTexRect(512, 512, drawCalacattaMarble, 1 / 2, 1 / 2, true),
      normalMap: mkNormalTex(256, drawStoneHeight, 1 / 2, 1 / 2, 0.6),
      normalScale: new THREE.Vector2(0.2, 0.2),
      roughness: 0.22,
      metalness: 0.0,
      envMapIntensity: 1.0,
      side: THREE.DoubleSide,
    });
  }

  if (kind === "tile") {
    // Shared blue-grey marble, 2x2 tiles per canvas spanning 1.2m -> 60cm tiles.
    return new THREE.MeshStandardMaterial({
      map: mkTexRect(256, 256, drawMarbleTile, 1 / 1.2, 1 / 1.2, true),
      normalMap: mkNormalTex(256, drawTileHeight(2), 1 / 1.2, 1 / 1.2, 1.2),
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 0.3,
      metalness: 0.0,
      envMapIntensity: 0.9,
      side: THREE.DoubleSide,
    });
  }

  if (kind === "kitchen" || kind === "stone") {
    var isKitchen = kind === "kitchen";
    return new THREE.MeshStandardMaterial({
      map: mkTex(
        512,
        isKitchen
          ? drawMarbleDiffuse("#4b5563", "210,214,220", 4)
          : drawMarbleDiffuse("#c6cacf", "138,142,148", 5),
        1 / 2,
        1 / 2,
        true
      ),
      normalMap: mkNormalTex(256, drawStoneHeight, 1 / 2, 1 / 2, 0.9),
      normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: isKitchen ? 0.5 : 0.62,
      metalness: 0.0,
      envMapIntensity: isKitchen ? 0.6 : 0.4,
      side: THREE.DoubleSide,
    });
  }

  if (kind === "carpet") {
    return new THREE.MeshStandardMaterial({
      map: mkTex(512, drawCarpetDiffuse, 1 / 0.8, 1 / 0.8, true),
      normalMap: mkNormalTex(256, drawCarpetHeight, 1 / 0.8, 1 / 0.8, 1.1),
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.96,
      metalness: 0.0,
      envMapIntensity: 0.25,
      side: THREE.DoubleSide,
    });
  }

  return new THREE.MeshStandardMaterial({
    map: mkTex(
      512,
      function (ctx, sz) {
        drawMarbleDiffuse("#f1ede6", "196,190,180", 3)(ctx, sz);
        groutGrid(ctx, sz, 2, "rgba(190,184,174,0.8)", 2);
      },
      1 / 1.6,
      1 / 1.6,
      true
    ),
    normalMap: mkNormalTex(256, drawTileHeight(2), 1 / 1.6, 1 / 1.6, 0.8),
    normalScale: new THREE.Vector2(0.3, 0.3),
    roughness: 0.42,
    metalness: 0.0,
    envMapIntensity: 0.6,
    side: THREE.DoubleSide,
  });
}

var _wallMatCache = {};

function clearWallMaterialCache() {
  Object.keys(_wallMatCache).forEach(function (key) {
    if (_wallMatCache[key]) _wallMatCache[key].dispose();
  });
  _wallMatCache = {};
}

/** Cached prototype material per preset (clone for each wall segment). */
export function getWallMaterial(presetId) {
  var id = presetId && WALL_COLOR_PRESETS[presetId] ? presetId : "warm-white";
  if (!_wallMatCache[id]) _wallMatCache[id] = createWallMaterial(id);
  return _wallMatCache[id];
}

/** Independent material instance per wall segment. */
export function cloneWallMaterial(presetId) {
  return getWallMaterial(presetId).clone();
}

/** @param {string} [presetId] */
export function getWallPresetHex(presetId) {
  var id = presetId && WALL_COLOR_PRESETS[presetId] ? presetId : "warm-white";
  return WALL_COLOR_PRESETS[id].color;
}

/** Textured premium interior paint for a preset id. */
export function createWallMaterial(presetId) {
  var id = presetId && WALL_COLOR_PRESETS[presetId] ? presetId : "warm-white";
  var preset = WALL_COLOR_PRESETS[id];
  var base = preset.color;

  var wcTex = mkTex(
    512,
    function (ctx, sz) {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, sz, sz);
      for (var i = 0; i < 4000; i++) {
        var a = Math.random() * 0.045;
        ctx.fillStyle = "rgba(0,0,0," + a + ")";
        ctx.fillRect(Math.random() * sz, Math.random() * sz, 1, 1);
      }
      for (var j = 0; j < 1200; j++) {
        var b = Math.random() * 0.03;
        ctx.fillStyle = "rgba(255,255,255," + b + ")";
        ctx.fillRect(Math.random() * sz, Math.random() * sz, 1, 1);
      }
    },
    3,
    3,
    true
  );
  var wrTex = mkTex(
    256,
    function (ctx, sz) {
      ctx.fillStyle = "#c8c8c8";
      ctx.fillRect(0, 0, sz, sz);
      for (var i = 0; i < 3000; i++) {
        var a = Math.random() * 0.3;
        ctx.fillStyle =
          Math.random() > 0.5 ? "rgba(255,255,255," + a + ")" : "rgba(0,0,0," + a + ")";
        ctx.fillRect(Math.random() * sz, Math.random() * sz, 2, 2);
      }
    },
    3,
    3
  );
  return new THREE.MeshStandardMaterial({
    map: wcTex,
    normalMap: mkNormalTex(256, drawPlasterHeight, 3, 3, 0.7),
    normalScale: new THREE.Vector2(0.25, 0.25),
    roughnessMap: wrTex,
    roughness: preset.roughness,
    metalness: 0,
    envMapIntensity: 0.35,
  });
}

/** @param {{ x: number, y: number }} repeat */
export function createCeilingMaterial(repeat) {
  var rx = repeat && repeat.x > 0 ? repeat.x : 4;
  var ry = repeat && repeat.y > 0 ? repeat.y : 4;
  return new THREE.MeshStandardMaterial({
    color: 0xf5f2ec,
    roughness: 0.96,
    metalness: 0,
    side: THREE.DoubleSide,
  });
}

/**
 * @param {number} colorHex
 * @param {number} [roughness]
 */
export function createFabricMaterial(colorHex, roughness) {
  return new THREE.MeshStandardMaterial({
    color: colorHex,
    roughnessMap: getFabricRoughnessMap(),
    roughness: roughness != null ? roughness : 0.88,
    metalness: 0,
    envMapIntensity: 0.35,
  });
}

export function createWoodLegMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x9a6b42,
    roughnessMap: getWoodGrainMap(),
    roughness: 0.45,
    metalness: 0.05,
    envMapIntensity: 0.55,
  });
}

export function createTableTopMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x8f6a48,
    roughnessMap: getWoodGrainMap(),
    roughness: 0.4,
    metalness: 0.03,
    envMapIntensity: 0.65,
  });
}

export function createGlassMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xdce9f5,
    transparent: true,
    opacity: 0.26,
    roughness: 0.04,
    metalness: 0,
    envMapIntensity: 1.3,
    side: THREE.DoubleSide,
  });
}

export function createWindowFrameMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.6,
    metalness: 0.04,
  });
}
