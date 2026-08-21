import { FLOORING_OPTIONS, ROOM_PRESETS } from "./planTools.js";

/**
 * Row 1: file, zoom, export, LLM.
 */
export function mountFileToolbar(container, handlers) {
  var row = document.createElement("div");
  row.className = "toolbar-row toolbar-row--file";

  function addGroup(name, className) {
    var group = document.createElement("div");
    group.className = "toolbar-command-group " + className;
    var label = document.createElement("span");
    label.className = "toolbar-command-group__label";
    label.textContent = name;
    group.appendChild(label);
    row.appendChild(group);
    return group;
  }

  var ingestGroup = addGroup("Ingest", "toolbar-command-group--ingest");
  var lab = document.createElement("label");
  lab.className = "btn";
  lab.textContent = "Open image";
  var inp = document.createElement("input");
  inp.type = "file";
  inp.accept = "image/*,application/pdf,.dxf,.dwg";
  inp.hidden = true;
  lab.appendChild(inp);
  ingestGroup.appendChild(lab);

  function addButton(group, text, fn) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btn";
    b.textContent = text;
    b.addEventListener("click", fn);
    group.appendChild(b);
    return b;
  }

  addButton(ingestGroup, "Try demo", handlers.loadFixture);
  if (handlers.uploadSupabase) addButton(ingestGroup, "Upload plan (Supabase)", handlers.uploadSupabase);
  if (handlers.analyzeLlm) addButton(ingestGroup, "Analyze LLM", handlers.analyzeLlm);

  var projectGroup = addGroup("Project", "toolbar-command-group--project");
  addButton(projectGroup, "Save", handlers.saveToDb);
  addButton(projectGroup, "Load", handlers.loadFromDb);

  var viewGroup = addGroup("View", "toolbar-command-group--view");
  if (handlers.toggleCatalog) addButton(viewGroup, "Catalog", handlers.toggleCatalog);
  addButton(viewGroup, "+", handlers.zoomIn);
  addButton(viewGroup, "−", handlers.zoomOut);
  addButton(viewGroup, "Reset", handlers.reset);
  var b2d = addButton(viewGroup, "2D View", handlers.show2D);
  var b3d = addButton(viewGroup, "Realistic 3D", handlers.show3D);

  container.appendChild(row);
  return { fileInput: inp, row: row, btn2D: b2d, btn3D: b3d };
}

/**
 * Row 2: geometry tools (single active mode).
 */
export function mountGeometryToolbar(container, handlers) {
  var row = document.createElement("div");
  row.className = "toolbar-row toolbar-row--geometry";

  var groupLab = document.createElement("span");
  groupLab.className = "toolbar-group-label";
  groupLab.textContent = "Drafting";
  row.appendChild(groupLab);

  var buttons = {};

  function addButton(text, fn, key, shouldAppend) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btn";
    b.textContent = text;
    b.addEventListener("click", fn);
    if (shouldAppend !== false) {
      row.appendChild(b);
    }
    if (key) buttons[key] = b;
    return b;
  }

  buttons.btnSetScale = addButton("Set scale", handlers.toggleSetScale, "btnSetScale", false);
  buttons.btnMeasure = addButton("Measure", handlers.toggleMeasure, "btnMeasure", false);
  buttons.btnVertexEdit = addButton("Edit vertices", handlers.toggleVertexEdit, "btnVertexEdit", false);
  buttons.btnDrawRoom = addButton("Add room", handlers.toggleDrawRoom, "btnDrawRoom", true);
  buttons.btnWalls = addButton("Walls", handlers.toggleWalls, "btnWalls", false);
  buttons.btnWindows = addButton("Windows", handlers.toggleWindows, "btnWindows", true);
  buttons.btnWindows.title = "Click a window to select it, drag to move, Delete window to remove";
  buttons.btnHideOverlay = addButton(
    "Hide overlay",
    handlers.toggleOverlayVisibility,
    "btnHideOverlay",
    true
  );
  buttons.btnHideOverlay.title = "Hide drawn rooms/furniture to see the original floor plan";

  var wallModeWrap = document.createElement("span");
  wallModeWrap.className = "wall-mode-wrap";
  wallModeWrap.hidden = true;
  var wallDrawBtn = document.createElement("button");
  wallDrawBtn.type = "button";
  wallDrawBtn.className = "btn wall-mode-btn";
  wallDrawBtn.textContent = "Draw";
  wallDrawBtn.addEventListener("click", handlers.wallDraw);
  var wallEditBtn = document.createElement("button");
  wallEditBtn.type = "button";
  wallEditBtn.className = "btn wall-mode-btn";
  wallEditBtn.textContent = "Edit";
  wallEditBtn.addEventListener("click", handlers.wallEdit);
  var wallDoorBtn = document.createElement("button");
  wallDoorBtn.type = "button";
  wallDoorBtn.className = "btn wall-mode-btn";
  wallDoorBtn.textContent = "Door";
  wallDoorBtn.title = "Click two points on a wall to cut a doorway opening";
  wallDoorBtn.addEventListener("click", handlers.wallDoor);
  var wallCutBtn = document.createElement("button");
  wallCutBtn.type = "button";
  wallCutBtn.className = "btn wall-mode-btn";
  wallCutBtn.textContent = "Cut";
  wallCutBtn.title = "Click two points on a wall to remove just that section";
  wallCutBtn.addEventListener("click", handlers.wallCut);
  wallModeWrap.appendChild(wallDrawBtn);
  wallModeWrap.appendChild(wallEditBtn);
  wallModeWrap.appendChild(wallDoorBtn);
  wallModeWrap.appendChild(wallCutBtn);
  row.appendChild(wallModeWrap);

  var roomPresetSelect = document.createElement("select");
  roomPresetSelect.className = "room-preset-select";
  roomPresetSelect.setAttribute("aria-label", "Room type preset");
  ROOM_PRESETS.forEach(function (p) {
    var o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.label;
    roomPresetSelect.appendChild(o);
  });
  row.appendChild(roomPresetSelect);

  var finishRoomBtn = document.createElement("button");
  finishRoomBtn.type = "button";
  finishRoomBtn.textContent = "Finish room";
  finishRoomBtn.className = "btn finish-room-btn";
  finishRoomBtn.hidden = true;
  finishRoomBtn.addEventListener("click", handlers.finishDrawRoom);
  row.appendChild(finishRoomBtn);

  var finishWallBtn = document.createElement("button");
  finishWallBtn.type = "button";
  finishWallBtn.textContent = "Finish wall";
  finishWallBtn.className = "btn finish-wall-btn";
  finishWallBtn.hidden = true;
  finishWallBtn.addEventListener("click", handlers.finishDrawWall);
  row.appendChild(finishWallBtn);

  var deleteWallBtn = document.createElement("button");
  deleteWallBtn.type = "button";
  deleteWallBtn.textContent = "Remove wall";
  deleteWallBtn.className = "btn delete-wall-btn";
  deleteWallBtn.hidden = true;
  deleteWallBtn.addEventListener("click", handlers.deleteSelectedWall);
  row.appendChild(deleteWallBtn);

  var deleteRoomBtn = document.createElement("button");
  deleteRoomBtn.type = "button";
  deleteRoomBtn.textContent = "Delete room";
  deleteRoomBtn.className = "btn delete-room-btn";
  deleteRoomBtn.hidden = true;
  deleteRoomBtn.addEventListener("click", handlers.deleteSelectedRoom);
  row.appendChild(deleteRoomBtn);

  var deleteWindowBtn = document.createElement("button");
  deleteWindowBtn.type = "button";
  deleteWindowBtn.textContent = "Delete window";
  deleteWindowBtn.className = "btn delete-window-btn";
  deleteWindowBtn.hidden = true;
  deleteWindowBtn.addEventListener("click", handlers.deleteSelectedWindow);
  row.appendChild(deleteWindowBtn);

  var deleteVertexBtn = document.createElement("button");
  deleteVertexBtn.type = "button";
  deleteVertexBtn.textContent = "Delete vertex";
  deleteVertexBtn.className = "btn delete-vertex-btn";
  deleteVertexBtn.hidden = true;
  deleteVertexBtn.addEventListener("click", handlers.deleteSelectedVertex);
  row.appendChild(deleteVertexBtn);

  var btnUndo = document.createElement("button");
  btnUndo.type = "button";
  btnUndo.textContent = "Undo";
  btnUndo.className = "btn undo-btn";
  btnUndo.disabled = true;
  btnUndo.title = "Undo (Ctrl+Z)";
  btnUndo.addEventListener("click", handlers.undo);
  row.appendChild(btnUndo);

  var scaleLengthWrap = document.createElement("span");
  scaleLengthWrap.className = "scale-length-wrap";
  scaleLengthWrap.hidden = true;
  var scaleLengthLabel = document.createElement("label");
  scaleLengthLabel.textContent = "Length (m) ";
  scaleLengthLabel.className = "scale-length-label";
  var scaleLengthInput = document.createElement("input");
  scaleLengthInput.type = "number";
  scaleLengthInput.min = "0.01";
  scaleLengthInput.step = "0.01";
  scaleLengthInput.className = "scale-length-input";
  scaleLengthInput.setAttribute("aria-label", "Known length in meters");
  var scaleApplyBtn = document.createElement("button");
  scaleApplyBtn.type = "button";
  scaleApplyBtn.textContent = "Apply scale";
  scaleApplyBtn.className = "btn scale-apply-btn";
  scaleApplyBtn.addEventListener("click", handlers.applyScale);
  scaleLengthLabel.appendChild(scaleLengthInput);
  scaleLengthWrap.appendChild(scaleLengthLabel);
  scaleLengthWrap.appendChild(scaleApplyBtn);
  row.appendChild(scaleLengthWrap);

  var measureReadout = document.createElement("span");
  measureReadout.className = "measure-readout";
  measureReadout.textContent = "Measure: —";
  row.appendChild(measureReadout);

  var roomMeasureReadout = document.createElement("span");
  roomMeasureReadout.className = "room-measure-readout";
  roomMeasureReadout.textContent = "Room: —";
  row.appendChild(roomMeasureReadout);

  var floorLab = document.createElement("label");
  floorLab.className = "floor-picker-label";
  floorLab.textContent = "Floor ";
  var floorSelect = document.createElement("select");
  floorSelect.className = "floor-picker-select";
  floorSelect.disabled = true;
  floorSelect.setAttribute("aria-label", "Room floor material");
  var emptyOpt = document.createElement("option");
  emptyOpt.value = "";
  emptyOpt.textContent = "Select room…";
  floorSelect.appendChild(emptyOpt);
  FLOORING_OPTIONS.forEach(function (opt) {
    var o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    floorSelect.appendChild(o);
  });
  floorSelect.addEventListener("change", handlers.onFloorChange);
  floorLab.appendChild(floorSelect);
  row.appendChild(floorLab);

  container.appendChild(row);

  return {
    row: row,
    btnSetScale: buttons.btnSetScale,
    btnMeasure: buttons.btnMeasure,
    btnVertexEdit: buttons.btnVertexEdit,
    btnDrawRoom: buttons.btnDrawRoom,
    btnWalls: buttons.btnWalls,
    btnWindows: buttons.btnWindows,
    btnHideOverlay: buttons.btnHideOverlay,
    wallModeWrap: wallModeWrap,
    wallDrawBtn: wallDrawBtn,
    wallEditBtn: wallEditBtn,
    wallDoorBtn: wallDoorBtn,
    wallCutBtn: wallCutBtn,
    roomPresetSelect: roomPresetSelect,
    finishRoomBtn: finishRoomBtn,
    finishWallBtn: finishWallBtn,
    deleteWallBtn: deleteWallBtn,
    deleteRoomBtn: deleteRoomBtn,
    deleteWindowBtn: deleteWindowBtn,
    deleteVertexBtn: deleteVertexBtn,
    btnUndo: btnUndo,
    scaleLengthInput: scaleLengthInput,
    scaleLengthWrap: scaleLengthWrap,
    measureReadout: measureReadout,
    roomMeasureReadout: roomMeasureReadout,
    floorSelect: floorSelect,
  };
}

export function mountDisplayToolbar(container, handlers) {
  var row = document.createElement("div");
  row.className = "toolbar-row toolbar-row--display";

  var label = document.createElement("span");
  label.className = "toolbar-group-label";
  label.textContent = "Display";
  row.appendChild(label);

  function addToggle(text, key) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn display-toggle display-toggle--on";
    btn.textContent = text;
    btn.setAttribute("aria-pressed", "true");
    btn.addEventListener("click", function () {
      var visible = handlers.toggle(key);
      btn.classList.toggle("display-toggle--on", visible);
      btn.textContent = (visible ? "Hide " : "Show ") + text.replace(/^(Hide|Show) /, "");
      btn.setAttribute("aria-pressed", visible ? "true" : "false");
    });
    row.appendChild(btn);
  }

  addToggle("Hide furniture", "furniture");
  container.appendChild(row);
  return row;
}

export function setToolButtonActive(btn, active) {
  if (!btn) return;
  if (active) btn.classList.add("tool-active");
  else btn.classList.remove("tool-active");
}

/** @deprecated use mountFileToolbar */
export function mountToolbar(container, handlers) {
  return mountFileToolbar(container, handlers);
}
