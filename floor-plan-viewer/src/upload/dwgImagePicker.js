/**
 * DWG floor-plan renderer. Parses DWG via the libredwg WASM port and
 * rasterizes the resulting SVG to a PNG data-URL.
 */

const WASM_DIR = "/wasm";
const MAX_DIM = 2400;

function svgToDataUrl(svgText) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not rasterize DWG drawing."));
    img.src = src;
  });
}

// libredwg emits width="100%" height="100%", which gives <img> no intrinsic
// size (browsers fall back to a 300x150 box). Replace with pixel dimensions
// derived from the viewBox so the raster matches the drawing's aspect ratio.
function sizeSvgFromViewBox(svgText) {
  const m = svgText.match(/viewBox="([-\d.eE]+)\s+([-\d.eE]+)\s+([-\d.eE]+)\s+([-\d.eE]+)"/);
  if (!m) return svgText;
  const vbW = parseFloat(m[3]);
  const vbH = parseFloat(m[4]);
  if (!(vbW > 0) || !(vbH > 0)) return svgText;

  const scale = MAX_DIM / Math.max(vbW, vbH);
  const w = Math.max(1, Math.round(vbW * scale));
  const h = Math.max(1, Math.round(vbH * scale));
  return svgText
    .replace(/width="100%"/, `width="${w}"`)
    .replace(/height="100%"/, `height="${h}"`);
}

// AutoCAD color index 7 ("white/black") is designed for a black CAD
// viewport and comes through as rgb(255,255,255). We render on a white
// background like paper, so treat it the way AutoCAD itself does when
// plotting to white paper: as black.
function blackenWhiteStrokes(svgText) {
  return svgText
    .replace(/rgb\(255,\s*255,\s*255\)/gi, "rgb(0,0,0)")
    .replace(/#ffffff/gi, "#000000");
}

/**
 * Parse a DWG File and render it to a PNG data-URL.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function dwgFileToDataUrl(file) {
  const { LibreDwg, Dwg_File_Type } = await import("@mlightcad/libredwg-web");
  const libredwg = await LibreDwg.create(WASM_DIR);

  const buffer = await file.arrayBuffer();
  const data = libredwg.dwg_read_data(buffer, Dwg_File_Type.DWG);
  if (data == null) throw new Error("Could not read DWG file.");

  const db = libredwg.convert(data);
  libredwg.dwg_free(data);

  let svgText = libredwg.dwg_to_svg(db);
  if (!svgText) throw new Error("No drawable entities found in DWG file.");
  svgText = blackenWhiteStrokes(sizeSvgFromViewBox(svgText));

  const img = await loadImage(svgToDataUrl(svgText));
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error("No drawable entities found in DWG file.");

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}
