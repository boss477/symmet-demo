/**
 * Photoreal snapshot: snapshot 3D → fal-ai/flux-pro/kontext → R2 → share.
 */

// Style presets for the photoreal dropdown. Each clause restyles walls,
// floor, lighting, and wall decor only — furniture stays hard-locked by
// the base prompt in buildFurniturePrompt().
export var PHOTOREAL_STYLES = {
  realistic:
    "Keep the room exactly as it is — same wall colours, same floor, same ceiling, same " +
    "lighting positions. Do not restyle anything. Only make every surface and material look " +
    "photorealistic, like a real photograph of this exact room.",
  modern:
    "Restyle ONLY the walls, floor surface, ceiling, and lighting in clean modern style: " +
    "repaint the walls in matte light grey, change the floor surface to light oak planks, " +
    "a flat smooth matte-white ceiling with recessed ceiling spotlights and warm-white glow, large framed abstract art on empty " +
    "walls, crisp natural daylight. Add a few small modern decor objects in empty corners " +
    "and on window sills only: a sleek floor lamp, a minimal ceramic vase, a small potted " +
    "monstera plant. The furniture stays exactly the same.",
  italian:
    "Restyle ONLY the walls, floor surface, ceiling, and lighting in elegant Italian style: " +
    "repaint the walls in warm cream and beige, change the floor surface to polished marble " +
    "or terrazzo, a coffered ceiling with elegant cream crown moulding, classic framed artwork on empty walls, sculptural pendant lighting, " +
    "luxurious drapes at the windows, warm golden-hour light, refined luxurious atmosphere. " +
    "Add a few small Italian decor objects in empty corners and on window sills only: a " +
    "classical sculpture bust on a pedestal, an ornate ceramic urn, a small olive tree in a " +
    "terracotta pot. The furniture stays exactly the same.",
  warm:
    "Restyle ONLY the walls, floor surface, ceiling, and lighting in warm cozy style: " +
    "repaint the walls in warm terracotta and sand tones, change the floor surface to rich " +
    "warm wood planks, a warm cream ceiling with exposed rustic wood beams, glowing pendant lamps and wall sconces, framed posters and gallery-wall " +
    "pictures on empty walls, inviting golden ambient glow like a premium lifestyle photograph. " +
    "Add a few small cozy decor objects in empty corners and on window sills only: a warm " +
    "glowing floor lamp, candles on the window sill, a small hanging plant near the window. " +
    "The furniture stays exactly the same.",
  scandinavian:
    "Restyle ONLY the walls, floor surface, ceiling, and lighting in Scandinavian style: " +
    "repaint the walls in pure white, change the floor surface to very pale ash wood, a clean bright white ceiling with a simple minimalist pendant light, simple " +
    "line-art framed prints on empty walls, abundant soft natural daylight, airy bright calm " +
    "atmosphere. Add a few small Scandinavian decor objects in empty corners and on window " +
    "sills only: a simple paper floor lamp, a small green plant in a white pot, a woven " +
    "basket in a corner. The furniture stays exactly the same.",
  luxury:
    "Restyle ONLY the walls, floor surface, ceiling, and lighting in luxury classic style: " +
    "elegant wall panelling in deep warm tones on the walls, change the floor surface to " +
    "polished marble, an ornate coffered ceiling with gilded moulding and a central ceiling rose, a chandelier or statement pendant light, ornate framed paintings on " +
    "empty walls, heavy elegant curtains, warm dramatic light with soft shadows, high-end " +
    "showroom photography look. Add only small luxury decor accents on window sills and " +
    "walls: a crystal vase with flowers on a window sill, gilded wall sconces, a small marble " +
    "sculpture on a window sill. Do not add any sofas, armchairs, seating, or tables. " +
    "The furniture stays exactly the same.",
};

/**
 * Build a fal prompt from the furniture array in the plan data.
 * @param {Array<{ label?: string, material?: string, colorName?: string }>} furniture
 * @param {string} [styleClause] preset clause from PHOTOREAL_STYLES or custom text
 * @returns {string}
 */
export function buildFurniturePrompt(furniture, styleClause) {
  // Edit-not-generate: Qwen treats a furniture *list* as a checklist and adds
  // items, and "design render" as licence to re-stage. We instead instruct it
  // to keep the input exactly, using the piece count as an anti-addition anchor.
  var count = (furniture || []).filter(function (f) { return f && f.label; }).length;
  var countClause = count > 0
    ? "The room contains exactly " + count + " furniture pieces — keep all of them and add no others. "
    : "";

  return (
    "Turn this 3D interior render into a realistic photograph of the exact same room. " +
    countClause +
    "DO: " +
    "preserve the camera angle, walls, and windows exactly; " +
    "keep every furniture item in its current position, size, shape, colour, material, and texture — completely untouched; " +
    "add a few tasteful framed pictures or minimal wall art on the large empty wall areas, flat against the wall, never covering windows or furniture; " +
    "change only the walls, floor surface, ceiling, lighting, and wall decor; " +
    "make the overall image look photorealistic with natural daylight, realistic shadows, and sharp detail. " +
    "DON'T: " +
    "do not add, remove, move, resize, restyle, recolour, or re-texture any furniture; " +
    "do not place any new object on or against the furniture; " +
    "do not change the room layout, proportions, or camera angle; " +
    "do not remove existing wall text, graphics, or picture frames. " +
    (styleClause ? styleClause.trim() + " " : "")
  );
}

var _modalEl = null;

function ensureModal() {
  if (_modalEl) return _modalEl;

  var overlay = document.createElement("div");
  overlay.id = "photoreal-overlay";
  // Show/hide via style.display — the hidden attribute would be overridden
  // by the inline display value.
  overlay.style.cssText = [
    "position:fixed", "inset:0", "z-index:9000",
    "background:rgba(0,0,0,0.82)", "display:none",
    "align-items:center", "justify-content:center",
    "flex-direction:column", "gap:16px",
  ].join(";");

  var card = document.createElement("div");
  card.style.cssText = [
    "background:#1c1a18", "border-radius:12px",
    "padding:24px", "max-width:92vw", "max-height:92vh",
    "display:flex", "flex-direction:column", "gap:12px",
    "box-shadow:0 8px 40px rgba(0,0,0,0.7)",
  ].join(";");

  var spinner = document.createElement("div");
  spinner.id = "photoreal-spinner";
  spinner.style.cssText = [
    "display:flex", "flex-direction:column",
    "align-items:center", "gap:12px", "padding:32px 16px",
  ].join(";");
  spinner.innerHTML = [
    "<div style=\"width:40px;height:40px;border:3px solid #555;border-top-color:#e8c97a;border-radius:50%;animation:pr-spin 0.8s linear infinite\"></div>",
    "<div style=\"color:#ccc;font-size:14px\">Generating photoreal render… (10–15 s)</div>",
  ].join("");

  var imgWrap = document.createElement("div");
  imgWrap.id = "photoreal-img-wrap";
  imgWrap.hidden = true;
  imgWrap.style.cssText = "display:flex;flex-direction:column;gap:10px;align-items:center";

  var img = document.createElement("img");
  img.id = "photoreal-img";
  img.style.cssText = "max-width:min(860px,88vw);max-height:60vh;border-radius:8px;object-fit:contain";
  img.alt = "Photoreal render";

  var actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;justify-content:center";

  var btnDl = document.createElement("a");
  btnDl.id = "photoreal-download";
  btnDl.download = "planr_render.png";
  btnDl.style.cssText = "padding:8px 18px;background:#e8c97a;color:#000;border-radius:6px;font-weight:600;font-size:14px;text-decoration:none;cursor:pointer";
  btnDl.textContent = "Download";

  var btnWa = document.createElement("button");
  btnWa.id = "photoreal-share";
  btnWa.type = "button";
  btnWa.style.cssText = "padding:8px 18px;background:#25d366;color:#fff;border:none;border-radius:6px;font-weight:600;font-size:14px;cursor:pointer";
  btnWa.textContent = "Share on WhatsApp";

  actions.appendChild(btnDl);
  actions.appendChild(btnWa);
  imgWrap.appendChild(img);
  imgWrap.appendChild(actions);

  var errDiv = document.createElement("div");
  errDiv.id = "photoreal-err";
  errDiv.hidden = true;
  errDiv.style.cssText = "color:#f87171;font-size:13px;max-width:400px;text-align:center";

  var btnClose = document.createElement("button");
  btnClose.type = "button";
  btnClose.style.cssText = "align-self:flex-end;background:transparent;border:none;color:#888;font-size:22px;cursor:pointer;line-height:1;padding:0";
  btnClose.textContent = "×";
  btnClose.title = "Close";
  btnClose.addEventListener("click", function () { overlay.style.display = "none"; });

  card.appendChild(btnClose);
  card.appendChild(spinner);
  card.appendChild(imgWrap);
  card.appendChild(errDiv);

  overlay.appendChild(card);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) overlay.style.display = "none";
  });

  // inject spin keyframe once
  if (!document.getElementById("pr-spin-style")) {
    var st = document.createElement("style");
    st.id = "pr-spin-style";
    st.textContent = "@keyframes pr-spin{to{transform:rotate(360deg)}}";
    document.head.appendChild(st);
  }

  document.body.appendChild(overlay);
  _modalEl = overlay;
  return overlay;
}

function showLoading() {
  var overlay = ensureModal();
  document.getElementById("photoreal-spinner").hidden = false;
  document.getElementById("photoreal-img-wrap").hidden = true;
  var errDiv = document.getElementById("photoreal-err");
  errDiv.hidden = true;
  errDiv.textContent = "";
  overlay.style.display = "flex";
}

function showResult(publicUrl) {
  document.getElementById("photoreal-spinner").hidden = true;
  var wrap = document.getElementById("photoreal-img-wrap");
  wrap.hidden = false;
  var img = document.getElementById("photoreal-img");
  img.src = publicUrl;
  var dl = document.getElementById("photoreal-download");
  // Cross-origin URLs ignore the download attribute — fetch as blob instead.
  dl.onclick = function (e) {
    e.preventDefault();
    fetch(publicUrl)
      .then(function (r) { return r.blob(); })
      .then(function (blob) {
        var objUrl = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = objUrl;
        a.download = "planr_render_" + Date.now() + ".png";
        a.click();
        setTimeout(function () { URL.revokeObjectURL(objUrl); }, 5000);
      })
      .catch(function () { window.open(publicUrl, "_blank"); });
  };
  dl.href = publicUrl;
  var wa = document.getElementById("photoreal-share");
  wa.onclick = function () {
    var text = encodeURIComponent("Check out this interior design render: " + publicUrl);
    window.open("https://wa.me/?text=" + text, "_blank");
  };
}

function showError(msg) {
  document.getElementById("photoreal-spinner").hidden = true;
  var errDiv = document.getElementById("photoreal-err");
  errDiv.textContent = msg || "Generation failed. Please try again.";
  errDiv.hidden = false;
}

/**
 * Capture snapshot, send to /api/photoreal, show result in modal.
 * @param {string} dataURL  base64 PNG from snapshot3D()
 * @param {string} designId  used as R2 filename prefix
 * @param {Array}  furniture  data.furniture array for prompt
 * @param {HTMLElement} snapBtn  snap button to disable during generation
 * @param {(url: string) => void} [onResult]  called with the public render URL on success
 * @param {string} [styleClause]  style clause appended to the prompt
 */
export async function triggerPhotoreal(dataURL, designId, furniture, snapBtn, onResult, styleClause) {
  if (!dataURL) return;
  showLoading();
  if (snapBtn) snapBtn.disabled = true;

  try {
    var prompt = buildFurniturePrompt(furniture, styleClause);
    // Local dev has no /api/photoreal (Flask route removed) — point
    // VITE_PHOTOREAL_URL at the deployed Pages function.
    var endpoint = import.meta.env.VITE_PHOTOREAL_URL || "/api/photoreal";
    var res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: dataURL,
        prompt: prompt,
        designId: designId || "plan",
        dev: import.meta.env.DEV,
      }),
    });
    if (!res.ok) {
      var errBody = await res.text().catch(function () { return ""; });
      throw new Error(errBody || ("HTTP " + res.status));
    }
    var json = await res.json();
    if (!json.url) throw new Error("No URL returned from server");
    showResult(json.url);
    if (onResult) onResult(json.url);
  } catch (err) {
    showError(err.message || String(err));
  } finally {
    if (snapBtn) snapBtn.disabled = false;
  }
}
