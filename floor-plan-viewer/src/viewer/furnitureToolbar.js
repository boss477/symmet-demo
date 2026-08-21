/** Floating action bar for selected furniture in 2D plan view. */

var ACTIONS = [
  { id: "bag", label: "Add to bag", title: "Add selected item to bag" },
  { id: "rotate", label: "Rotate", title: "Rotate 5° ( ] )" },
  { id: "replace", label: "Replace", title: "Replace primary item (header SKU)" },
  { id: "goeswith", label: "Goes with", title: "Show items that go well with this" },
  { id: "copy", label: "Make copy", title: "Duplicate selection with offset" },
  { id: "remove", label: "Remove", title: "Delete selected items" },
];

export function createFurnitureToolbar(callbacks) {
  var root = document.createElement("div");
  root.className = "furniture-floating-toolbar";
  root.hidden = true;
  root.setAttribute("role", "toolbar");
  root.setAttribute("aria-label", "Furniture actions");

  var hintEl = document.createElement("div");
  hintEl.className = "furniture-floating-toolbar__hint";
  hintEl.hidden = true;

  var btnRow = document.createElement("div");
  btnRow.className = "furniture-floating-toolbar__actions";

  ACTIONS.forEach(function (action) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "furniture-floating-toolbar__btn";
    btn.dataset.action = action.id;
    btn.textContent = action.label;
    btn.title = action.title;
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (callbacks && callbacks.onAction) callbacks.onAction(action.id);
    });
    btnRow.appendChild(btn);
  });

  function dismissToolbar(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }
    if (callbacks && callbacks.onClose) callbacks.onClose();
  }

  var closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "furniture-floating-toolbar__close";
  closeBtn.setAttribute("aria-label", "Close toolbar");
  closeBtn.title = "Close";
  closeBtn.textContent = "\u00d7";
  closeBtn.addEventListener("pointerdown", dismissToolbar);
  closeBtn.addEventListener("click", dismissToolbar);
  btnRow.appendChild(closeBtn);

  root.appendChild(hintEl);
  root.appendChild(btnRow);
  document.body.appendChild(root);

  // Bubble only — capture stopImmediatePropagation on root blocks the close button.
  ["pointerdown", "mousedown", "click"].forEach(function (type) {
    root.addEventListener(
      type,
      function (e) {
        e.stopPropagation();
      },
      false
    );
  });

  function setHint(text) {
    if (!text) {
      hintEl.hidden = true;
      hintEl.textContent = "";
      return;
    }
    hintEl.hidden = false;
    hintEl.textContent = text;
  }

  /** Position in viewport (fixed) coords — immune to #content pan/zoom transform. */
  function updatePosition(screenRect) {
    if (!screenRect || root.hidden) return;
    var cx = screenRect.left + screenRect.width / 2;
    var top = screenRect.top - 8;
    root.style.left = cx + "px";
    root.style.top = top + "px";
    root.style.transform = "translate(-50%, -100%)";
  }

  return {
    el: root,
    show: function (screenRect, opts) {
      opts = opts || {};
      root.hidden = false;
      setHint(opts.hint || "");
      updatePosition(screenRect);
    },
    hide: function () {
      root.hidden = true;
      setHint("");
    },
    reposition: updatePosition,
    setHint: setHint,
  };
}

/** Bounding box of selected furniture groups in screen coordinates. */
export function selectionScreenRect(overlay, selectedIds) {
  if (!overlay || !selectedIds || !selectedIds.length) return null;
  var idSet = {};
  selectedIds.forEach(function (id) {
    idSet[id] = true;
  });
  var nodes = overlay.querySelectorAll("[data-furniture-id]");
  var minX = Infinity;
  var minY = Infinity;
  var maxX = -Infinity;
  var maxY = -Infinity;
  var found = false;
  nodes.forEach(function (node) {
    var id = node.getAttribute("data-furniture-id");
    if (!idSet[id]) return;
    var box = node.getBoundingClientRect();
    if (!box.width && !box.height) return;
    found = true;
    minX = Math.min(minX, box.left);
    minY = Math.min(minY, box.top);
    maxX = Math.max(maxX, box.right);
    maxY = Math.max(maxY, box.bottom);
  });
  if (!found) return null;
  return {
    left: minX,
    top: minY,
    width: maxX - minX,
    height: maxY - minY,
    right: maxX,
    bottom: maxY,
  };
}
