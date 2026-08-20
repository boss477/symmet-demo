/**
 * Minimal DXF floor-plan renderer.
 * Handles LINE, LWPOLYLINE, POLYLINE/VERTEX, ARC, CIRCLE.
 * Returns a PNG data-URL.
 */

function parseDxf(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const entities = [];
  let i = 0;

  function nextPair() {
    while (i < lines.length) {
      const code = parseInt(lines[i], 10);
      const val = (lines[i + 1] || "").trim();
      i += 2;
      if (!isNaN(code)) return { code, val };
    }
    return null;
  }

  // Skip to ENTITIES section
  while (i < lines.length) {
    const p = nextPair();
    if (!p) break;
    if (p.code === 2 && p.val === "ENTITIES") break;
  }

  let entity = null;
  let polyVerts = null;

  while (i < lines.length) {
    const p = nextPair();
    if (!p) break;

    if (p.code === 0) {
      if (entity) {
        if (entity.type === "POLYLINE") entity.vertices = polyVerts || [];
        entities.push(entity);
      }
      if (p.val === "ENDSEC" || p.val === "EOF") break;
      entity = { type: p.val };
      polyVerts = p.val === "POLYLINE" ? [] : null;
    } else if (entity) {
      if (entity.type === "VERTEX" && polyVerts) {
        // absorb vertex into parent polyline
        if (p.code === 10) entity.x = parseFloat(p.val);
        else if (p.code === 20) entity.y = parseFloat(p.val);
        // commit vertex when next entity starts — handled by code===0 above
      }
      if (p.code === 10) entity.x = parseFloat(p.val);
      else if (p.code === 20) entity.y = parseFloat(p.val);
      else if (p.code === 11) entity.x2 = parseFloat(p.val);
      else if (p.code === 21) entity.y2 = parseFloat(p.val);
      else if (p.code === 40) entity.r = parseFloat(p.val);
      else if (p.code === 50) entity.startAngle = parseFloat(p.val);
      else if (p.code === 51) entity.endAngle = parseFloat(p.val);
      else if (p.code === 70) entity.flags = parseInt(p.val, 10);
      else if (p.code === 90) entity.vertexCount = parseInt(p.val, 10);
      else if (p.code === -1) {
        // not a real code; used internally
      }

      // LWPOLYLINE accumulates vertices via repeated 10/20
      if (entity.type === "LWPOLYLINE") {
        if (!entity._xs) { entity._xs = []; entity._ys = []; }
        if (p.code === 10) entity._xs.push(parseFloat(p.val));
        if (p.code === 20) entity._ys.push(parseFloat(p.val));
      }
    }
  }

  // Fix up LWPOLYLINE vertices
  return entities.map(e => {
    if (e.type === "LWPOLYLINE" && e._xs) {
      e.vertices = e._xs.map((x, i) => ({ x, y: e._ys[i] || 0 }));
    }
    return e;
  });
}

function renderToCanvas(entities) {
  // Compute bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function expand(x, y) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }

  for (const e of entities) {
    if (e.type === "LINE") {
      expand(e.x, e.y); expand(e.x2, e.y2);
    } else if (e.type === "LWPOLYLINE" || e.type === "POLYLINE") {
      (e.vertices || []).forEach(v => expand(v.x, v.y));
    } else if (e.type === "CIRCLE" || e.type === "ARC") {
      expand(e.x - e.r, e.y - e.r); expand(e.x + e.r, e.y + e.r);
    }
  }

  if (!isFinite(minX)) return null;

  const PAD = 40;
  const MAX_DIM = 2400;
  const dxW = maxX - minX || 1;
  const dxH = maxY - minY || 1;
  const scale = Math.min(MAX_DIM / dxW, MAX_DIM / dxH);
  const cw = Math.round(dxW * scale) + PAD * 2;
  const ch = Math.round(dxH * scale) + PAD * 2;

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, cw, ch);

  // DXF Y axis is flipped vs canvas
  function tx(x) { return (x - minX) * scale + PAD; }
  function ty(y) { return ch - PAD - (y - minY) * scale; }

  ctx.strokeStyle = "#111";
  ctx.lineWidth = Math.max(1, scale * 0.6);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const e of entities) {
    ctx.beginPath();
    if (e.type === "LINE") {
      ctx.moveTo(tx(e.x), ty(e.y));
      ctx.lineTo(tx(e.x2), ty(e.y2));
      ctx.stroke();
    } else if (e.type === "LWPOLYLINE" || e.type === "POLYLINE") {
      const verts = e.vertices || [];
      if (verts.length < 2) continue;
      ctx.moveTo(tx(verts[0].x), ty(verts[0].y));
      for (let i = 1; i < verts.length; i++) ctx.lineTo(tx(verts[i].x), ty(verts[i].y));
      const closed = e.flags & 1;
      if (closed) ctx.closePath();
      ctx.stroke();
    } else if (e.type === "CIRCLE") {
      ctx.arc(tx(e.x), ty(e.y), e.r * scale, 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.type === "ARC") {
      // DXF angles are CCW from +X; canvas angles are CW from +X, Y flipped
      const sa = -(e.startAngle * Math.PI / 180);
      const ea = -(e.endAngle * Math.PI / 180);
      ctx.arc(tx(e.x), ty(e.y), e.r * scale, sa, ea, true);
      ctx.stroke();
    }
  }
  return canvas;
}

/**
 * Parse a DXF File and render it to a PNG data-URL.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function cadFileToDataUrl(file) {
  const text = await file.text();
  const entities = parseDxf(text);
  const canvas = renderToCanvas(entities);
  if (!canvas) throw new Error("No drawable entities found in DXF file.");
  return canvas.toDataURL("image/png");
}
