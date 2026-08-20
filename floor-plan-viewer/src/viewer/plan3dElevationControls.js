import {
  clampElevationState,
  defaultElevationState,
  elevationCameraVectors,
} from "./plan3dElevation.js";

/**
 * Coohom-style elevation navigation: height, pan along wall, zoom — no orbit.
 * @param {object} opts
 * @param {HTMLElement} opts.container
 * @param {HTMLElement} opts.canvas
 * @param {THREE.PerspectiveCamera} opts.camera
 * @param {import("three/examples/jsm/controls/OrbitControls.js").OrbitControls} opts.controls
 * @param {() => boolean} opts.isActive
 * @param {() => { span: number } | null} opts.getBounds
 * @param {() => object | null} opts.getWall
 * @param {() => import("./plan3dElevation.js").ElevationState | null} opts.getState
 * @param {(state: import("./plan3dElevation.js").ElevationState) => void} opts.setState
 * @param {(state: import("./plan3dElevation.js").ElevationState) => void} opts.onStateApplied
 * @param {() => boolean} [opts.isMoveMode]
 */
export function createPlan3DElevationControls(opts) {
  var bar = document.createElement("div");
  bar.id = "view3d-elevation-bar";
  bar.hidden = true;
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Elevation view controls");
  bar.innerHTML =
    '<span class="view3d-elev-label">Wall view</span>' +
    '<div class="view3d-elev-group" aria-label="Height">' +
    '<button type="button" class="view3d-elev-btn" data-action="up" title="Raise camera">↑</button>' +
    '<button type="button" class="view3d-elev-btn" data-action="down" title="Lower camera">↓</button>' +
    "</div>" +
    '<span class="view3d-elev-sep"></span>' +
    '<div class="view3d-elev-group" aria-label="Pan along wall">' +
    '<button type="button" class="view3d-elev-btn" data-action="pan-left" title="Pan left">←</button>' +
    '<button type="button" class="view3d-elev-btn" data-action="pan-right" title="Pan right">→</button>' +
    "</div>" +
    '<span class="view3d-elev-sep"></span>' +
    '<div class="view3d-elev-group" aria-label="Distance">' +
    '<button type="button" class="view3d-elev-btn" data-action="zoom-in" title="Closer to wall">+</button>' +
    '<button type="button" class="view3d-elev-btn" data-action="zoom-out" title="Farther from wall">−</button>' +
    "</div>";
  opts.container.appendChild(bar);

  var dragging = false;
  var dragStartX = 0;
  var dragStartY = 0;
  var dragStartState = null;

  var STEP_HEIGHT = 0.08;
  var STEP_PAN = 0.12;
  var STEP_ZOOM = 0.06;

  function applyState(state) {
    var bounds = opts.getBounds();
    var wall = opts.getWall();
    if (!bounds || !wall || !opts.camera || !opts.controls) return;
    var clamped = clampElevationState(bounds, wall, state);
    opts.setState(clamped);
    var v = elevationCameraVectors(wall, clamped);
    opts.camera.position.copy(v.pos);
    opts.controls.target.copy(v.look);
    opts.camera.lookAt(v.look);
    opts.onStateApplied(clamped);
  }

  function moveModeActive() {
    return !!(opts.isMoveMode && opts.isMoveMode());
  }

  function nudge(action) {
    if (!opts.isActive() || moveModeActive()) return;
    var bounds = opts.getBounds();
    var wall = opts.getWall();
    var state = opts.getState();
    if (!bounds || !wall || !state) return;
    var next = Object.assign({}, state);
    if (action === "up") next.eyeHeight += STEP_HEIGHT;
    else if (action === "down") next.eyeHeight -= STEP_HEIGHT;
    else if (action === "pan-left") next.panAlong -= STEP_PAN;
    else if (action === "pan-right") next.panAlong += STEP_PAN;
    else if (action === "zoom-in") next.distance -= STEP_ZOOM;
    else if (action === "zoom-out") next.distance += STEP_ZOOM;
    applyState(next);
  }

  bar.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    nudge(btn.getAttribute("data-action"));
  });

  function onPointerDown(e) {
    if (!opts.isActive() || moveModeActive() || e.button !== 0) return;
    var state = opts.getState();
    if (!state) return;
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartState = Object.assign({}, state);
    opts.canvas.setPointerCapture(e.pointerId);
    document.body.classList.add("view3d-elevation-drag");
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!dragging || !dragStartState) return;
    var bounds = opts.getBounds();
    var wall = opts.getWall();
    if (!bounds || !wall) return;
    var dx = e.clientX - dragStartX;
    var dy = e.clientY - dragStartY;
    var span = bounds.span;
    var next = Object.assign({}, dragStartState);
    next.panAlong += (dx / 280) * span * 0.35;
    next.eyeHeight -= (dy / 220) * 0.55;
    applyState(next);
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    dragStartState = null;
    document.body.classList.remove("view3d-elevation-drag");
    try {
      opts.canvas.releasePointerCapture(e.pointerId);
    } catch (_err) {
      /* ignore */
    }
  }

  function onWheel(e) {
    if (!opts.isActive() || moveModeActive()) return;
    e.preventDefault();
    var state = opts.getState();
    if (!state) return;
    var next = Object.assign({}, state);
    next.distance += e.deltaY > 0 ? STEP_ZOOM * 1.4 : -STEP_ZOOM * 1.4;
    applyState(next);
  }

  function onKeyDown(e) {
    if (!opts.isActive() || moveModeActive()) return;
    var tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    var map = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "pan-left",
      ArrowRight: "pan-right",
      "+": "zoom-in",
      "=": "zoom-in",
      "-": "zoom-out",
    };
    var action = map[e.key];
    if (!action) return;
    e.preventDefault();
    nudge(action);
  }

  opts.canvas.addEventListener("pointerdown", onPointerDown);
  opts.canvas.addEventListener("pointermove", onPointerMove);
  opts.canvas.addEventListener("pointerup", onPointerUp);
  opts.canvas.addEventListener("pointercancel", onPointerUp);
  opts.canvas.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);

  return {
    bar: bar,
    show: function () {
      bar.hidden = false;
      document.body.classList.add("view3d-elevation-mode");
    },
    hide: function () {
      bar.hidden = true;
      dragging = false;
      document.body.classList.remove("view3d-elevation-mode");
      document.body.classList.remove("view3d-elevation-drag");
    },
    applyState: applyState,
    snapImmediate: function (bounds, wall, state) {
      var st = defaultElevationState(bounds, wall, state);
      applyState(st);
    },
    dispose: function () {
      bar.remove();
      opts.canvas.removeEventListener("pointerdown", onPointerDown);
      opts.canvas.removeEventListener("pointermove", onPointerMove);
      opts.canvas.removeEventListener("pointerup", onPointerUp);
      opts.canvas.removeEventListener("pointercancel", onPointerUp);
      opts.canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("view3d-elevation-mode");
      document.body.classList.remove("view3d-elevation-drag");
    },
  };
}
