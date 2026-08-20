/**
 * Render picker: modal grid of captured photoreal shots, each with a
 * checkbox and its key-plan inset, so the user chooses which ones go
 * into the deck before export.
 *
 * pickRenders(renders) → Promise<Array|null>
 *   resolves with the selected subset (deck order preserved), or null
 *   when the user closes/cancels the dialog.
 */

var _overlay = null;

function buildCard(entry, index, onToggle) {
  var card = document.createElement("label");
  card.style.cssText = [
    "position:relative", "display:flex", "flex-direction:column",
    "width:220px", "border:2px solid #e8c97a", "border-radius:8px",
    "overflow:hidden", "cursor:pointer", "background:#111",
  ].join(";");

  var img = document.createElement("img");
  img.src = entry.url;
  img.alt = entry.title || "Render " + (index + 1);
  img.style.cssText = "width:100%;height:140px;object-fit:cover;display:block";
  card.appendChild(img);

  // Key-plan inset (bottom-right), matching the deck slide's inset.
  if (entry.thumb) {
    var inset = document.createElement("img");
    inset.src = entry.thumb;
    inset.alt = "";
    inset.style.cssText = [
      "position:absolute", "right:6px", "top:84px", "width:64px",
      "background:#fff", "border:1px solid #999", "border-radius:4px",
    ].join(";");
    card.appendChild(inset);
  }

  var row = document.createElement("div");
  row.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px 10px";

  var cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = true;
  cb.addEventListener("change", function () {
    card.style.borderColor = cb.checked ? "#e8c97a" : "#444";
    card.style.opacity = cb.checked ? "1" : "0.55";
    onToggle();
  });

  var title = document.createElement("span");
  title.textContent = entry.title || "Render " + (index + 1);
  title.style.cssText = "color:#ddd;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";

  row.appendChild(cb);
  row.appendChild(title);
  card.appendChild(row);

  return { card: card, checkbox: cb };
}

/**
 * @param {Array<{title?:string,url:string,thumb?:string}>} renders
 * @returns {Promise<Array|null>}
 */
export function pickRenders(renders) {
  return new Promise(function (resolve) {
    if (_overlay) _overlay.remove();

    var overlay = document.createElement("div");
    _overlay = overlay;
    overlay.style.cssText = [
      "position:fixed", "inset:0", "z-index:9000",
      "background:rgba(0,0,0,0.82)", "display:flex",
      "align-items:center", "justify-content:center",
    ].join(";");

    var card = document.createElement("div");
    card.style.cssText = [
      "background:#1c1a18", "border-radius:12px", "padding:20px 24px",
      "max-width:92vw", "max-height:88vh", "overflow:auto",
      "display:flex", "flex-direction:column", "gap:14px",
    ].join(";");

    var head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:16px";
    var heading = document.createElement("div");
    heading.textContent = "Choose renders for the deck";
    heading.style.cssText = "color:#eee;font-size:16px;font-weight:600";
    var btnClose = document.createElement("button");
    btnClose.type = "button";
    btnClose.textContent = "×";
    btnClose.title = "Cancel";
    btnClose.style.cssText = "background:transparent;border:none;color:#888;font-size:24px;cursor:pointer;line-height:1;padding:0";
    head.appendChild(heading);
    head.appendChild(btnClose);

    var grid = document.createElement("div");
    grid.style.cssText = "display:flex;flex-wrap:wrap;gap:12px;justify-content:center";

    var btnGo = document.createElement("button");
    btnGo.type = "button";
    btnGo.style.cssText = "align-self:center;padding:9px 22px;background:#e8c97a;color:#000;border:none;border-radius:6px;font-weight:600;font-size:14px;cursor:pointer";

    var checkboxes = [];
    function selected() {
      return renders.filter(function (_, i) { return checkboxes[i].checked; });
    }
    function syncButton() {
      var n = selected().length;
      btnGo.textContent = "Create PPT (" + n + " render" + (n === 1 ? "" : "s") + ")";
    }

    renders.forEach(function (entry, i) {
      var built = buildCard(entry, i, syncButton);
      checkboxes.push(built.checkbox);
      grid.appendChild(built.card);
    });
    syncButton();

    function close(result) {
      overlay.remove();
      _overlay = null;
      resolve(result);
    }
    btnClose.addEventListener("click", function () { close(null); });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) close(null);
    });
    btnGo.addEventListener("click", function () { close(selected()); });

    card.appendChild(head);
    card.appendChild(grid);
    card.appendChild(btnGo);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  });
}
