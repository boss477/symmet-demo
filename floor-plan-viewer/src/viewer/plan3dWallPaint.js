import {
  WALL_COLOR_COLLECTIONS,
  WALL_COLOR_HEX,
  WALL_COLOR_PRESETS,
} from "./planTools.js";
import { getFloorFinishes } from "./floorPhotoTextures.js";

/**
 * Wall paint button + tabbed swatch palette (wall colors + floor finishes) for the 3D chrome bar.
 * @param {{ onTogglePaint: () => void, onPickColor: (presetId: string) => void, onPickFloor: (finishId: string) => void, getActiveColor: () => string }} opts
 */
export function mountWallPaintUi(opts) {
  opts = opts || {};
  var bar = document.getElementById("view3d-bar");
  if (!bar) return null;

  var wrap = document.createElement("div");
  wrap.className = "view3d-wall-paint";
  wrap.id = "view3d-wall-paint";

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "view3d-btn";
  btn.id = "btn3d-paint";
  btn.setAttribute("data-mode", "paint");
  btn.textContent = "Paint";

  var palette = document.createElement("div");
  palette.className = "view3d-wall-palette";
  palette.id = "view3d-wall-palette";
  palette.hidden = true;

  var toggleSwatch = document.createElement("button");
  toggleSwatch.type = "button";
  toggleSwatch.className = "wall-swatch wall-swatch--toggle";
  toggleSwatch.disabled = true;
  toggleSwatch.title = "Active color";
  toggleSwatch.style.background = WALL_COLOR_HEX["warm-white"];
  palette.appendChild(toggleSwatch);

  var tabs = document.createElement("div");
  tabs.className = "view3d-wall-palette-tabs";
  tabs.setAttribute("role", "tablist");

  var gridWrap = document.createElement("div");
  gridWrap.className = "view3d-wall-palette-grid-wrap";

  var grids = {};
  var activeTabId = WALL_COLOR_COLLECTIONS[0] ? WALL_COLOR_COLLECTIONS[0].id : "light";

  WALL_COLOR_COLLECTIONS.forEach(function (col, tabIndex) {
    var tabBtn = document.createElement("button");
    tabBtn.type = "button";
    tabBtn.className = "view3d-wall-palette-tab";
    tabBtn.setAttribute("role", "tab");
    tabBtn.setAttribute("aria-selected", tabIndex === 0 ? "true" : "false");
    tabBtn.setAttribute("data-collection", col.id);
    tabBtn.textContent = col.label;
    tabBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      setActiveTab(col.id);
    });
    tabs.appendChild(tabBtn);

    var grid = document.createElement("div");
    grid.className = "view3d-wall-palette-grid";
    grid.setAttribute("role", "tabpanel");
    grid.setAttribute("data-collection", col.id);
    grid.hidden = tabIndex !== 0;

    col.presets.forEach(function (presetId) {
      var preset = WALL_COLOR_PRESETS[presetId];
      if (!preset) return;
      var sw = document.createElement("button");
      sw.type = "button";
      sw.className = "wall-swatch";
      sw.setAttribute("data-preset", presetId);
      sw.title = preset.label;
      sw.style.background = preset.color;
      sw.addEventListener("click", function (e) {
        e.stopPropagation();
        if (opts.onPickColor) opts.onPickColor(presetId);
        setActiveSwatch(presetId);
      });
      grid.appendChild(sw);
    });

    grids[col.id] = grid;
    gridWrap.appendChild(grid);
  });

  // Floors tab: the five premium finishes, applied per room by clicking its floor.
  var floorTabBtn = document.createElement("button");
  floorTabBtn.type = "button";
  floorTabBtn.className = "view3d-wall-palette-tab";
  floorTabBtn.setAttribute("role", "tab");
  floorTabBtn.setAttribute("aria-selected", "false");
  floorTabBtn.setAttribute("data-collection", "floors");
  floorTabBtn.textContent = "Floors";
  floorTabBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    setActiveTab("floors");
  });
  tabs.appendChild(floorTabBtn);

  var floorGrid = document.createElement("div");
  floorGrid.className = "view3d-wall-palette-grid";
  floorGrid.setAttribute("role", "tabpanel");
  floorGrid.setAttribute("data-collection", "floors");
  floorGrid.hidden = true;

  getFloorFinishes().forEach(function (fin) {
    var sw = document.createElement("button");
    sw.type = "button";
    sw.className = "wall-swatch";
    sw.setAttribute("data-floor", fin.id);
    sw.title = fin.label;
    sw.style.backgroundImage = "url(" + fin.url + ")";
    sw.style.backgroundSize = "cover";
    sw.addEventListener("click", function (e) {
      e.stopPropagation();
      if (opts.onPickFloor) opts.onPickFloor(fin.id);
      setActiveFloor(fin.id, fin.url, fin.label);
    });
    floorGrid.appendChild(sw);
  });

  grids["floors"] = floorGrid;
  gridWrap.appendChild(floorGrid);

  function setActiveTab(collectionId) {
    activeTabId = collectionId;
    tabs.querySelectorAll(".view3d-wall-palette-tab").forEach(function (el) {
      var on = el.getAttribute("data-collection") === collectionId;
      el.classList.toggle("view3d-wall-palette-tab--active", on);
      el.setAttribute("aria-selected", on ? "true" : "false");
    });
    Object.keys(grids).forEach(function (id) {
      grids[id].hidden = id !== collectionId;
    });
  }

  function setActiveSwatch(presetId) {
    var hex = WALL_COLOR_HEX[presetId] || WALL_COLOR_HEX["warm-white"];
    toggleSwatch.style.backgroundImage = "";
    toggleSwatch.style.background = hex;
    var preset = WALL_COLOR_PRESETS[presetId];
    toggleSwatch.title = preset ? preset.label : "Active color";
    palette.querySelectorAll(".wall-swatch[data-floor]").forEach(function (el) {
      el.classList.remove("wall-swatch--active");
    });
    palette.querySelectorAll(".wall-swatch[data-preset]").forEach(function (el) {
      el.classList.toggle("wall-swatch--active", el.getAttribute("data-preset") === presetId);
    });
    WALL_COLOR_COLLECTIONS.forEach(function (col) {
      if (col.presets.indexOf(presetId) >= 0) setActiveTab(col.id);
    });
  }

  function setActiveFloor(finishId, url, label) {
    toggleSwatch.style.background = "";
    toggleSwatch.style.backgroundImage = "url(" + url + ")";
    toggleSwatch.style.backgroundSize = "cover";
    toggleSwatch.title = label || "Floor finish";
    palette.querySelectorAll(".wall-swatch[data-preset]").forEach(function (el) {
      el.classList.remove("wall-swatch--active");
    });
    palette.querySelectorAll(".wall-swatch[data-floor]").forEach(function (el) {
      el.classList.toggle("wall-swatch--active", el.getAttribute("data-floor") === finishId);
    });
  }

  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (opts.onTogglePaint) opts.onTogglePaint();
  });

  document.addEventListener("click", function () {
    if (palette.hidden) return;
    palette.hidden = true;
    wrap.classList.remove("view3d-wall-paint--open");
  });

  palette.addEventListener("click", function (e) {
    e.stopPropagation();
  });

  palette.appendChild(tabs);
  palette.appendChild(gridWrap);
  wrap.appendChild(btn);
  wrap.appendChild(palette);

  var sep = document.createElement("span");
  sep.className = "view3d-sep";
  bar.appendChild(sep);
  bar.appendChild(wrap);

  setActiveTab(activeTabId);
  setActiveSwatch(opts.getActiveColor ? opts.getActiveColor() : "warm-white");

  return {
    setActiveColor: setActiveSwatch,
    setPaintActive: function (active) {
      btn.classList.toggle("view3d-btn--active", !!active);
    },
    openPalette: function () {
      palette.hidden = false;
      wrap.classList.add("view3d-wall-paint--open");
    },
    closePalette: function () {
      palette.hidden = true;
      wrap.classList.remove("view3d-wall-paint--open");
    },
  };
}
