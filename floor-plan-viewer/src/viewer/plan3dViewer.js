import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { resolveCalibration } from "../lib/calibration.js";
import { catalogById } from "../lib/catalogSizing.js";
import { pointInPolygon, polygonArea } from "../lib/geometry.js";
import {
  createFabricMaterial,
  createFloorMaterial,
  createGlassMaterial,
  createTableTopMaterial,
  cloneWallMaterial,
  createWindowFrameMaterial,
  createWoodLegMaterial,
  disposeMaterials,
} from "./plan3dMaterials.js";
import { addSceneLighting, disposeLighting } from "./plan3dLighting.js";
import { applyEnvironment, disposeEnvironment } from "./plan3dEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { FXAAPass } from "three/examples/jsm/postprocessing/FXAAPass.js";
import {
  computeSceneBounds,
  computeRoomBounds,
  flyToView,
  flyToSideView,
  flyToPosition,
  getRoomSideViews,
  buildRoomWallElevations,
  frameCamera,
  updateCameraTransition,
  cancelCameraTransition,
  cameraMiniMapState,
  placeCameraFromMiniMap,
} from "./plan3dCamera.js";
import {
  elevationRoomKey,
  loadElevationMemory,
  saveElevationMemory,
  clearElevationMemory,
  defaultElevationState,
} from "./plan3dElevation.js";
import { createPlan3DElevationControls } from "./plan3dElevationControls.js";
import { createPlan3DInteraction } from "./plan3dInteraction.js";
import { invalidateFurnitureBox } from "./plan3dMove.js";
import {
  createDefaultSofaInstance,
  isSofaTypeStr,
  preloadDefaultSofaGlb,
} from "./plan3dGlb.js";
import {
  LIVING_ROOM_DEMO_D_MM,
  LIVING_ROOM_DEMO_GLB_URL,
  LIVING_ROOM_DEMO_H_MM,
  LIVING_ROOM_DEMO_W_MM,
  itemUsesGlbModel,
  resolveItemGlbUrl,
} from "../lib/glbDemoSofa.js";
import { normToWorld } from "../lib/coordinates.js";
import { getRoomMeasurementDisplay, resolveWallSegmentColor, setWallSegmentColor, wallSegmentKey } from "./planTools.js";
import { mountWallPaintUi } from "./plan3dWallPaint.js";
import { createPlan3DMeasureOverlay } from "./plan3dMeasureOverlay.js";
import { createFurnitureToolbar3d } from "./furnitureToolbar3d.js";
import { hideTooltip, showRoomTooltip } from "./tooltip.js";

var scene, camera, renderer, controls;
var animFrameId;
var containerEl;
var activePlanData;
var activePlanImage;
var sceneBounds = null;
var viewMode = "dollhouse";
var sceneContent = null;
var planToWorld = null;
var sceneMetrics = { wReal: 10, hReal: 10 };
var furnitureGroups = [];
var furnitureVisible = true;
var roomFloorMeshes = [];
var wallSegmentMeshes = [];
var activePaintColor = "warm-white";
// When set, paint clicks on room floors apply this finish instead of wall color.
var activeFloorFinish = null;
var paintUi = null;
var interaction = null;
var measureOverlay = null;
var furnitureToolbar3d = null;
var furnitureToolbar3dDismissed = false;
var onFurnitureMovedCb = null;
var onFurnitureActionCb = null;
var onFurnitureSelectionSyncCb = null;
var onFurnitureToolbarCloseCb = null;
var selectedSideRoom = null;
var hoveredSideRoom = null;
var selectedRoomBounds = null;
var activeSideIndex = -1;
var activeElevationWall = null;
var elevationState = null;
var elevationControls = null;
var elevationActivatePending = false;
var calibrationState3d = null;
var planImageSize3d = { width: 1000, height: 1000 };
var orbitDefaults = {
  enableRotate: true,
  minPolarAngle: 0,
  maxPolarAngle: Math.PI * 0.88,
};
var composer = null;
var ssaoPass = null;
var aoWatch = { accum: 0, frames: 0, warmed: false, lastT: 0 };

var hardwareProfile = { isCpuOrLowEnd: false, isSoftware: false, dprCap: 1.0 };

function detectHardwareProfile(rend) {
  var gl = rend ? rend.getContext() : null;
  var debugInfo = gl ? gl.getExtension("WEBGL_debug_renderer_info") : null;
  var unmasked = debugInfo ? (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "").toLowerCase() : "";

  var isSoftware = /swiftshader|llvmpipe|software|basic render|microsoft basic|mesa|cpu/i.test(unmasked);
  var isIntegrated = /intel.*(hd|uhd|iris|graphics)|gma|adreno 3|adreno 4|mali-4|mali-t/i.test(unmasked);
  var cores = navigator.hardwareConcurrency || 2;
  var mem = navigator.deviceMemory || 2;

  var isCpuOrLowEnd = isSoftware || (cores <= 4 && mem <= 4) || isIntegrated;
  var dprCap = isSoftware ? 1.0 : isCpuOrLowEnd ? 1.15 : 1.5;

  hardwareProfile = {
    isCpuOrLowEnd: isCpuOrLowEnd,
    isSoftware: isSoftware,
    dprCap: dprCap,
    rendererStr: unmasked,
  };
  return hardwareProfile;
}

/**
 * Adaptive quality: while the camera moves (orbit/pan/zoom/flights) or
 * furniture is dragged, render at lower pixel ratio so interaction
 * stays at full frame rate on CPU; full quality returns once the camera settles.
 */
var fastMode = { active: false, fullDpr: 0, pendingRestore: false, lastInteractT: 0 };

function beginFastMode() {
  fastMode.pendingRestore = false;
  if (fastMode.active || !renderer) return;
  fastMode.active = true;
  fastMode.fullDpr = renderer.getPixelRatio();
  var targetDpr = hardwareProfile.isSoftware ? 0.75 : hardwareProfile.isCpuOrLowEnd ? 0.85 : 1.0;
  if (fastMode.fullDpr > targetDpr) renderer.setPixelRatio(targetDpr);
  invalidate();
}

function endFastMode() {
  fastMode.pendingRestore = false;
  if (!fastMode.active || !renderer) return;
  fastMode.active = false;
  if (renderer.getPixelRatio() !== fastMode.fullDpr) {
    renderer.setPixelRatio(fastMode.fullDpr);
  }
  invalidate();
}

/**
 * SSAO device tier: disabled for CPU / integrated / low-end hardware for smooth framerate.
 */
function aoDeviceTier() {
  if (hardwareProfile.isCpuOrLowEnd || hardwareProfile.isSoftware) return "low";
  var ua = navigator.userAgent || "";
  var isTouch =
    /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua) ||
    (navigator.maxTouchPoints || 0) > 2;
  if (!isTouch) return "high";
  var cores = navigator.hardwareConcurrency || 4;
  var mem = navigator.deviceMemory || 4;
  return cores >= 6 && mem >= 4 ? "mid" : "low";
}

function setupPostprocessing(width, height) {
  var tier = aoDeviceTier();
  if (/[?&]ao=off/.test(window.location.search) || /[?&]cpu=1/.test(window.location.search)) tier = "low";
  if (tier === "low") {
    composer = null;
    return;
  }
  var dprCap = tier === "high" ? 1.5 : 1.15;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
  renderer.setSize(width, height);

  composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.addPass(new RenderPass(scene, camera));
  ssaoPass = new SSAOPass(
    scene,
    camera,
    Math.round(width * renderer.getPixelRatio()),
    Math.round(height * renderer.getPixelRatio())
  );
  ssaoPass.kernelRadius = 0.4;
  ssaoPass.minDistance = 0.001;
  ssaoPass.maxDistance = 0.15;
  composer.addPass(ssaoPass);
  composer.addPass(new OutputPass());
  composer.addPass(new FXAAPass());
  composer.setSize(width, height);
}

/** On-demand rendering: frames draw only when flagged dirty (plus a 1s heartbeat for async texture/GLB pops). */
var needsRender = true;
var lastRenderT = 0;

function invalidate() {
  needsRender = true;
}

/** Queue a one-shot shadow map render (shadowMap.autoUpdate is off). */
function requestShadowUpdate() {
  if (renderer) renderer.shadowMap.needsUpdate = true;
  invalidate();
}

/** Watchdog: tablets/CPUs that can't hold ~40fps with SSAO fall back to plain render. */
function disableAOForPerf() {
  if (!composer) return;
  endFastMode();
  composer.dispose();
  composer = null;
  ssaoPass = null;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, hardwareProfile.dprCap));
  resize3D();
  console.info("[plan3d] Postprocessing disabled for performance optimization");
}

function applyOrbitForViewMode(mode) {
  if (!controls) return;
  if (mode === "top") {
    controls.enableRotate = false;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI / 2;
    document.body.classList.add("view3d-top-mode");
  } else if (mode === "dollhouse") {
    controls.enableRotate = orbitDefaults.enableRotate;
    controls.minPolarAngle = orbitDefaults.minPolarAngle;
    controls.maxPolarAngle = orbitDefaults.maxPolarAngle;
    document.body.classList.remove("view3d-top-mode");
  }
}

function disposeSceneGraph(root) {
  if (!root) return;
  root.traverse(function (obj) {
    if (obj.geometry) obj.geometry.dispose();
  });
}

/**
 * Initialize realistic-style 3D view from AI plan JSON.
 * @param {HTMLElement} container
 * @param {object} data
 * @param {HTMLImageElement} planImage
 */
export function init3D(container, data, planImage) {
  dispose3D();
  containerEl = container;
  activePlanData = data;
  activePlanImage = planImage;

  var width = container.clientWidth || 500;
  var height = container.clientHeight || 500;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2b2823);

  camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 500);
  camera.position.set(0, 15, 20);

  // No preserveDrawingBuffer: snapshot paths render synchronously right before toDataURL.
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "default",
  });
  detectHardwareProfile(renderer);

  renderer.setSize(width, height);
  // Cap device pixel ratio to avoid CPU-rasterization bottleneck on high-DPI displays
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, hardwareProfile.dprCap));
  renderer.shadowMap.enabled = true;
  // Use PCFShadowMap or BasicShadowMap on CPU/low-end for faster shadow evaluation
  renderer.shadowMap.type = hardwareProfile.isCpuOrLowEnd ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  // Static scene: shadow map renders only when casters change (requestShadowUpdate).
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  // IBL: realistic ambient + PBR reflections on floors, glass, GLB furniture
  applyEnvironment(renderer, scene, 0.3);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false; // FIX 1: Completely disable wheel/gesture zoom on 3D
  controls.enableDamping = true;
  controls.dampingFactor = 0.18;
  controls.maxPolarAngle = Math.PI * 0.88;
  controls.minDistance = 0.5;
  controls.maxDistance = 80;
  controls.screenSpacePanning = true;
  controls.target.set(0, 0.8, 0);
  orbitDefaults.enableRotate = controls.enableRotate;
  orbitDefaults.minPolarAngle = controls.minPolarAngle;
  orbitDefaults.maxPolarAngle = controls.maxPolarAngle;
  applyOrbitForViewMode(viewMode);

  renderer.domElement.addEventListener(
    "wheel",
    function (e) {
      e.preventDefault();
    },
    { passive: false }
  );

  // On-demand rendering: any orbit change or canvas pointer activity
  // (hover raycasts, drag, paint, elevation handles) flags a frame.
  needsRender = true;
  fastMode.active = false;
  fastMode.pendingRestore = false;
  controls.addEventListener("change", function () {
    // Stamp only while input is held — damping-tail changes after release must
    // not keep deferring the quality restore (Sketchfab-style progressive
    // refinement: sharpen a fixed beat after the user lets go).
    if (!fastMode.pendingRestore) fastMode.lastInteractT = performance.now();
    invalidate();
  });
  controls.addEventListener("start", function () {
    fastMode.lastInteractT = performance.now();
    beginFastMode();
  });
  controls.addEventListener("end", function () {
    fastMode.pendingRestore = true;
  });
  ["pointermove", "pointerdown", "pointerup"].forEach(function (ev) {
    renderer.domElement.addEventListener(ev, invalidate, { passive: true });
  });

  elevationControls = createPlan3DElevationControls({
    container: container,
    canvas: renderer.domElement,
    camera: camera,
    controls: controls,
    isActive: function () {
      return viewMode === "side" && activeElevationWall != null && elevationState != null;
    },
    getBounds: function () {
      return selectedRoomBounds;
    },
    getWall: function () {
      return activeElevationWall;
    },
    getState: function () {
      return elevationState;
    },
    setState: function (st) {
      elevationState = st;
    },
    onStateApplied: function (st) {
      if (selectedSideRoom && activeSideIndex >= 0) {
        saveElevationMemory(elevationRoomKey(selectedSideRoom), activeSideIndex, st);
      }
    },
    isMoveMode: function () {
      return !!(interaction && interaction.isMoveMode());
    },
  });

  sceneContent = new THREE.Group();
  scene.add(sceneContent);

  var lightingStats = null;
  buildSceneGeometry();
  preloadPlanGlbs()
    .then(function () {
      refreshGlbMeshes();
      if (measureOverlay && interaction && interaction.getSelected()) {
        measureOverlay.updateForGroup(interaction.getSelected());
      }
    })
    .catch(function (err) {
      console.warn("Plan GLB preload:", err && err.message ? err.message : err);
    });
  if (sceneBounds && planToWorld) {
    lightingStats = addSceneLighting(
      scene,
      sceneBounds,
      activePlanData.rooms || [],
      planToWorld
    );
    frameCamera(camera, controls, sceneBounds, viewMode);
  }
  requestShadowUpdate();

  // Direct rendering is more reliable across retail demo machines. The
  // optional post-processing passes can produce a black canvas on some GPUs.
  composer = null;

  interaction = createPlan3DInteraction({
    renderer: renderer,
    camera: camera,
    controls: controls,
    scene: scene,
    getFurnitureGroups: function () {
      return furnitureGroups;
    },
    getFurnitureItems: function () {
      return activePlanData && activePlanData.furniture ? activePlanData.furniture : [];
    },
    getRoomFloorMeshes: function () {
      return roomFloorMeshes;
    },
    getWallSegmentMeshes: function () {
      return wallSegmentMeshes;
    },
    findRoomAtWorld: findRoomAtWorld,
    bounds: sceneBounds,
    wReal: sceneMetrics.wReal,
    hReal: sceneMetrics.hReal,
    rooms: activePlanData.rooms || [],
    onRoomSelected: selectSideRoom,
    onRoomHover: onSideRoomHover,
    onRoomHoverEnd: onSideRoomHoverEnd,
    onRoomHoverGeneral: onRoomHoverGeneral,
    onRoomHoverGeneralEnd: onRoomHoverGeneralEnd,
    onFurnitureHover: onFurnitureHover3D,
    onFurnitureHoverEnd: onFurnitureHoverEnd3D,
    onFurnitureSelect: onFurnitureSelect3D,
    onFurnitureDeselect: onFurnitureDeselect3D,
    isSidePanelOpen: is3DSidePanelOpen,
    isSideRoomPickActive: isSideRoomPickActive,
    isElevationActive: function () {
      return viewMode === "side" && activeElevationWall != null;
    },
    isTopView: function () {
      return viewMode === "top";
    },
    getElevationWall: function () {
      return activeElevationWall;
    },
    onFurnitureMoved: function (item) {
      if (onFurnitureMovedCb) onFurnitureMovedCb(item);
    },
    onWallPaint: function (segmentKey) {
      if (activeFloorFinish) return;
      applyPaintToSegment(segmentKey, activePaintColor);
    },
    onRoomPaint: function (room) {
      if (activeFloorFinish) {
        applyFloorFinishToRoom(room);
        return;
      }
      applyPaintToRoom(room);
    },
  });

  var existingPaint = document.getElementById("view3d-wall-paint");
  if (existingPaint) {
    var prev = existingPaint.previousElementSibling;
    if (prev && prev.classList && prev.classList.contains("view3d-sep")) prev.remove();
    existingPaint.remove();
  }
  paintUi = mountWallPaintUi({
    onTogglePaint: toggle3DPaintMode,
    onPickColor: function (presetId) {
      activePaintColor = presetId;
      activeFloorFinish = null;
      if (interaction && interaction.isPaintMode()) set3dHint(default3dHintText());
    },
    onPickFloor: function (finishId) {
      activeFloorFinish = finishId;
      if (interaction && interaction.isPaintMode()) {
        set3dHint("Click a room floor to apply the finish");
      }
    },
    getActiveColor: function () {
      return activePaintColor;
    },
  });

  measureOverlay = createPlan3DMeasureOverlay({
    scene: scene,
    camera: camera,
    container: container,
    findRoomAtWorld: findRoomAtWorld,
    planToWorld: planToWorld,
  });

  furnitureToolbar3d = createFurnitureToolbar3d(container, {
    onAction: function (actionId) {
      var grp = interaction && interaction.getSelected();
      var item = grp && grp.userData.furnitureItem ? grp.userData.furnitureItem : null;
      if (onFurnitureActionCb) onFurnitureActionCb(actionId, item, grp);
    },
    onClose: function () {
      dismiss3DFurnitureToolbar();
      if (onFurnitureToolbarCloseCb) onFurnitureToolbarCloseCb();
    },
  });

  set3dHint(default3dHintText());
  syncChromeActive(viewMode);

  var lastDragShadowT = 0;
  var wasDraggingFurniture = false;

  function animate() {
    animFrameId = requestAnimationFrame(animate);
    var nowT = performance.now();
    var transitioning = updateCameraTransition(camera);
    if (transitioning) {
      invalidate();
      fastMode.lastInteractT = nowT;
      beginFastMode();
      fastMode.pendingRestore = true;
    }
    if (!transitioning && elevationActivatePending) {
      elevationActivatePending = false;
      if (elevationControls && elevationState && activeElevationWall) {
        elevationControls.show();
        elevationControls.applyState(elevationState);
        set3dHint(elevationHintText());
        invalidate();
      }
    }
    if (!transitioning) {
      if (viewMode === "side" && activeElevationWall) {
        if (controls) controls.enabled = false;
      } else if (
        !interaction ||
        (!interaction.isMoveMode() && !interaction.isDragging())
      ) {
        if (controls.update()) invalidate(); // damping still settling
      }
    }
    if (interaction) {
      interaction.updateHelper();
      var draggingNow = interaction.isDragging();
      if (draggingNow) {
        fastMode.lastInteractT = nowT;
        beginFastMode();
        fastMode.pendingRestore = true;
        // Re-rendering the shadow map every frame with many GLB casters is
        // what makes drags stutter — ~8Hz is enough while moving.
        if (nowT - lastDragShadowT > 120) {
          lastDragShadowT = nowT;
          requestShadowUpdate();
        }
      } else if (wasDraggingFurniture) {
        requestShadowUpdate(); // crisp shadow at the drop position
      }
      wasDraggingFurniture = draggingNow;
    }

    // Camera settled (damping done, no input for 250ms) — restore full quality.
    if (fastMode.pendingRestore && nowT - fastMode.lastInteractT > 250) {
      endFastMode();
    }

    if (!needsRender && nowT - lastRenderT < 1000) {
      aoWatch.lastT = 0; // idle gap — keep it out of the FPS window
      return;
    }
    needsRender = false;
    lastRenderT = nowT;

    if (
      !furnitureToolbar3dDismissed &&
      furnitureToolbar3d &&
      interaction &&
      interaction.getSelected()
    ) {
      furnitureToolbar3d.updatePosition(
        interaction.getSelected(),
        camera,
        renderer.domElement
      );
    }
    var useComposer = composer && !fastMode.active;
    if (useComposer) composer.render();
    else renderer.render(scene, camera);
    if (measureOverlay) measureOverlay.render();

    if (useComposer) {
      if (aoWatch.lastT) {
        aoWatch.accum += nowT - aoWatch.lastT;
        aoWatch.frames++;
        if (aoWatch.frames >= 120) {
          var avgFps = (aoWatch.frames * 1000) / aoWatch.accum;
          // skip the first window — scene build / GLB loads skew it
          if (aoWatch.warmed && avgFps < 38) disableAOForPerf();
          aoWatch.warmed = true;
          aoWatch.frames = 0;
          aoWatch.accum = 0;
        }
      }
      aoWatch.lastT = nowT;
    } else if (composer) {
      aoWatch.lastT = 0; // fast-mode frames don't count toward the SSAO FPS window
    }
  }
  animate();
}

/** @param {(item: object) => void} cb */
export function set3DFurnitureMovedCallback(cb) {
  onFurnitureMovedCb = cb;
}

/** @param {(actionId: string, item: object|null, group: object|null) => void} cb */
export function set3DFurnitureActionCallback(cb) {
  onFurnitureActionCb = cb;
}

/** @param {(itemId: string|null) => void} cb */
export function set3DFurnitureSelectionSyncCallback(cb) {
  onFurnitureSelectionSyncCb = cb;
}

/** @param {() => void} cb */
export function set3DFurnitureToolbarCloseCallback(cb) {
  onFurnitureToolbarCloseCb = cb;
}

export function dismiss3DFurnitureToolbar() {
  furnitureToolbar3dDismissed = true;
  if (furnitureToolbar3d) furnitureToolbar3d.hide();
}

export function clear3DFurnitureToolbarDismiss() {
  furnitureToolbar3dDismissed = false;
}

/** Select furniture in 3D by plan item id (e.g. after drawer pick). */
export function select3DFurnitureByItemId(itemId) {
  if (interaction) interaction.selectByItemId(itemId);
  invalidate();
}

export function set3DFurnitureVisible(visible) {
  furnitureVisible = visible !== false;
  furnitureGroups.forEach(function (group) {
    group.visible = furnitureVisible;
  });
  invalidate();
}

export function zoom3D(delta) {
  if (!camera || !controls) return;
  var target = controls.target || new THREE.Vector3(0, 0.8, 0);
  var offset = new THREE.Vector3().subVectors(camera.position, target);
  var factor = delta > 0 ? 0.82 : 1.22;
  var newLen = offset.length() * factor;
  if (newLen >= 1.0 && newLen <= 120) {
    offset.multiplyScalar(factor);
    camera.position.addVectors(target, offset);
    controls.update();
    invalidate();
  }
}

export function fit3D() {
  if (sceneBounds && camera && controls) {
    frameCamera(camera, controls, sceneBounds, viewMode);
    controls.update();
    invalidate();
  }
}

/** Update rotation on the selected 3D group without full mesh rebuild. */
export function applySelectedFurnitureRotation(rotationDeg) {
  if (!interaction) return;
  var grp = interaction.getSelected();
  if (!grp || !grp.userData.furnitureItem) return;
  grp.userData.furnitureItem.rotationDeg = rotationDeg;
  grp.rotation.y = -(rotationDeg || 0) * (Math.PI / 180);
  requestShadowUpdate();
  interaction.updateHelper();
  if (measureOverlay) measureOverlay.updateForGroup(grp);
}

/** Rebuild all furniture meshes from activePlanData (after copy/remove/replace). */
export function rebuildFurnitureMeshes() {
  if (!sceneContent || !activePlanData) return;
  var selectedId =
    interaction && interaction.getSelected() && interaction.getSelected().userData.furnitureItem
      ? interaction.getSelected().userData.furnitureItem.id
      : null;

  furnitureGroups.forEach(function (group) {
    sceneContent.remove(group);
    disposeSceneGraph(group);
  });
  furnitureGroups = [];

  var wReal = sceneMetrics.wReal;
  var hReal = sceneMetrics.hReal;
  var hasSofaOnPlan = false;
  (activePlanData.furniture || []).forEach(function (item) {
    if (item.x == null || item.y == null) return;
    var g = addFurnitureGroup(item, wReal, hReal);
    if (g && g.userData.isSofaFurniture) hasSofaOnPlan = true;
  });
  furnitureGroups.forEach(function (group) {
    group.visible = furnitureVisible;
  });
  if (!hasSofaOnPlan) addDefaultLivingRoomSofa(wReal, hReal);
  requestShadowUpdate();

  preloadPlanGlbs()
    .then(function () {
      refreshGlbMeshes();
      if (selectedId && interaction) interaction.selectByItemId(selectedId);
    })
    .catch(function () {
      if (selectedId && interaction) interaction.selectByItemId(selectedId);
    });
}

export function toggle3DMoveMode() {
  if (!interaction) return false;
  if (interaction.isMoveMode()) {
    interaction.exitMoveMode();
    set3dHint(default3dHintText());
    syncChromeActive("dollhouse");
    return false;
  }
  exit3DPaintMode();
  close3DSidePanel();
  interaction.enterMoveMode();
  set3dHint(default3dHintText());
  syncChromeActive("move");
  return true;
}

export function toggle3DPaintMode() {
  if (!interaction) return false;
  if (interaction.isPaintMode()) {
    exit3DPaintMode();
    syncChromeActive(viewMode);
    return false;
  }
  exit3DMoveMode();
  close3DSidePanel();
  interaction.enterPaintMode();
  if (paintUi) {
    paintUi.setPaintActive(true);
    paintUi.openPalette();
  }
  set3dHint(paintHintText());
  syncChromeActive("paint");
  return true;
}

function paintHintText() {
  if (activeFloorFinish) return "Click a room floor to apply the finish";
  return "Pick a color or floor finish · click a wall or room floor";
}

export function exit3DPaintMode() {
  if (interaction && interaction.isPaintMode()) {
    interaction.exitPaintMode();
  }
  if (paintUi) {
    paintUi.setPaintActive(false);
    paintUi.closePalette();
  }
  if (!interaction || (!interaction.isMoveMode() && !interaction.isPaintMode())) {
    set3dHint(default3dHintText());
  }
}

export function exit3DMoveMode() {
  if (interaction && interaction.isMoveMode()) {
    interaction.exitMoveMode();
    set3dHint(default3dHintText());
  }
}

/** Leave move/paint mode and restore the view-mode button state. */
export function exit3DToolModes() {
  exit3DMoveMode();
  exit3DPaintMode();
  syncChromeActive(viewMode);
}

function set3dHint(text) {
  var el = document.getElementById("view3d-hint");
  if (!el) return;
  el.textContent = text || "";
  el.hidden = !text;
}

function elevationHintText() {
  return (
    "Elevation: drag ↔ pan along wall · ↕ height · scroll zoom · arrow keys · toolbar"
  );
}

function exitElevationMode() {
  elevationActivatePending = false;
  elevationState = null;
  activeElevationWall = null;
  if (elevationControls) elevationControls.hide();
}

function default3dHintText() {
  if (interaction && interaction.isMoveMode()) {
    return "Drag furniture · snaps to walls";
  }
  if (interaction && interaction.isPaintMode()) {
    return paintHintText();
  }
  if (viewMode === "top") {
    return "Top view · drag furniture · pan empty floor · scroll to zoom";
  }
  if (viewMode === "dollhouse") {
    return "Use Top view to place furniture · or Move tool to drag here";
  }
  return "Hover a room for measurements";
}

function showRoomMeasureTooltip(room, e) {
  var tip = document.getElementById("tip");
  if (!tip || !room || !e) return;
  var measure = getRoomMeasurementDisplay(
    room,
    planImageSize3d.width,
    planImageSize3d.height,
    calibrationState3d
  );
  var displayRoom = {
    name: roomLabel(room),
    dimensions: room.dimensions,
    dimensionsText: room.dimensionsText,
    areaSqFt: room.areaSqFt,
  };
  var tipY = e.clientY + 14;
  if (e.clientY > window.innerHeight - 220) tipY = e.clientY - 100;
  showRoomTooltip(
    tip,
    { clientX: e.clientX, clientY: tipY },
    displayRoom,
    {
      dimLine: measure.dimLine,
      areaLine: measure.areaLine,
      scaleSummary: calibrationState3d ? calibrationState3d.summary : null,
    }
  );
}

function onRoomHoverGeneral(room, e) {
  showRoomMeasureTooltip(room, e);
}

function onRoomHoverGeneralEnd() {
  if (interaction && interaction.getSelected()) return;
  var tip = document.getElementById("tip");
  if (tip && !is3DSidePanelOpen()) hideTooltip(tip);
}

function onFurnitureHover3D() {
  /* No white #tip overlay for furniture — in-scene measure lines only when selected. */
}

function onFurnitureHoverEnd3D() {
  var tip = document.getElementById("tip");
  if (tip) hideTooltip(tip);
}

function onFurnitureSelect3D(grp) {
  furnitureToolbar3dDismissed = false;
  var tip = document.getElementById("tip");
  if (tip) hideTooltip(tip);
  if (measureOverlay) measureOverlay.updateForGroup(grp);
  set3dHint(default3dHintText());
  if (furnitureToolbar3d) {
    furnitureToolbar3d.show(grp);
  }
  if (onFurnitureSelectionSyncCb && grp && grp.userData.furnitureItem) {
    onFurnitureSelectionSyncCb(grp.userData.furnitureItem.id);
  }
}

function onFurnitureDeselect3D() {
  if (measureOverlay) measureOverlay.clear();
  set3dHint(default3dHintText());
  var tip = document.getElementById("tip");
  if (tip) hideTooltip(tip);
  if (furnitureToolbar3d) furnitureToolbar3d.hide();
  if (onFurnitureSelectionSyncCb) onFurnitureSelectionSyncCb(null);
}

function syncChromeActive(mode) {
  var ids = ["btn3d-dollhouse", "btn3d-top", "btn3d-side", "btn3d-move", "btn3d-paint"];
  var modes = ["dollhouse", "top", "side", "move", "paint"];
  ids.forEach(function (id, i) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle("view3d-btn--active", modes[i] === mode);
  });
}

export function close3DSidePanel() {
  var panel = document.getElementById("view3d-side-panel");
  if (panel) panel.hidden = true;
  if (containerEl) containerEl.classList.remove("view3d-room-pick");
  if (interaction) interaction.setSidePickMode(false);
  document.body.classList.remove("view3d-side-pick-mode");
  onSideRoomHoverEnd();
  if (renderer && renderer.domElement) renderer.domElement.style.cursor = "";
}

export function is3DSidePanelOpen() {
  var panel = document.getElementById("view3d-side-panel");
  return !!(panel && !panel.hidden);
}

export function toggle3DSidePanel() {
  var panel = document.getElementById("view3d-side-panel");
  if (!panel || !sceneBounds) return false;
  if (is3DSidePanelOpen()) {
    close3DSidePanel();
    syncChromeActive(viewMode === "top" ? "top" : viewMode === "side" ? "side" : "dollhouse");
    return false;
  }
  exit3DMoveMode();
  exit3DPaintMode();
  panel.hidden = false;
  if (containerEl) containerEl.classList.add("view3d-room-pick");
  syncChromeActive("side");
  if (selectedSideRoom && selectedRoomBounds) {
    buildSideThumbnails(selectedSideRoom);
    if (interaction) interaction.setSidePickMode(false);
    set3dHint(roomLabel(selectedSideRoom) + " — pick a side view");
  } else {
    showSidePanelPrompt();
    if (interaction) interaction.setSidePickMode(true);
    set3dHint("");
  }
  return true;
}

export function flyTo3DSideView(index) {
  if (!camera || !controls || !selectedRoomBounds || !selectedSideRoom) return;
  exit3DMoveMode();
  exit3DPaintMode();
  var walls = buildRoomWallElevations(selectedRoomBounds);
  var wall = walls[index];
  if (!wall) return;

  activeSideIndex = index;
  activeElevationWall = wall;
  var mem = loadElevationMemory(elevationRoomKey(selectedSideRoom), index);
  elevationState = defaultElevationState(selectedRoomBounds, wall, mem);

  flyToSideView(camera, controls, selectedRoomBounds, index, 800, elevationState);
  if (controls) controls.enabled = false;
  elevationActivatePending = true;
  viewMode = "side";
  syncChromeActive("side");
  var panel = document.getElementById("view3d-side-panel");
  if (panel) {
    panel.querySelectorAll(".view3d-tcard").forEach(function (card, i) {
      card.classList.toggle("view3d-tcard--active", i === index);
    });
  }
  close3DSidePanel();
}

function roomLabel(room) {
  return room.name || room.id || "Room";
}

function findRoomAtWorld(wx, wz) {
  var rooms = (activePlanData && activePlanData.rooms) || [];
  var wReal = sceneMetrics.wReal;
  var hReal = sceneMetrics.hReal;
  var nx = wx / wReal + 0.5;
  var ny = wz / hReal + 0.5;
  var best = null;
  var bestArea = Infinity;
  rooms.forEach(function (room) {
    if (!room.polygon || room.polygon.length < 3) return;
    if (!pointInPolygon(nx, ny, room.polygon)) return;
    var area = polygonArea(room.polygon);
    if (area < bestArea) {
      bestArea = area;
      best = room;
    }
  });
  return best;
}

function isSideRoomPickActive() {
  if (interaction && interaction.isMoveMode()) return false;
  if (interaction && interaction.isSidePickMode()) return true;
  return is3DSidePanelOpen();
}

function clearSideRoomSelection() {
  exitElevationMode();
  selectedSideRoom = null;
  hoveredSideRoom = null;
  selectedRoomBounds = null;
  activeSideIndex = -1;
  updateRoomFloorHighlight(null, null);
  onSideRoomHoverEnd();
  if (interaction) interaction.setSidePickMode(false);
}

function updateRoomFloorHighlight() {
  roomFloorMeshes.forEach(function (mesh) {
    var mat = mesh.material;
    if (!mat || !mat.emissive) return;
    mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
  });
}

function onSideRoomHover(room, e) {
  if (room === hoveredSideRoom) {
    var tip = document.getElementById("tip");
    if (tip && e) {
      tip.style.left = Math.min(e.clientX + 14, window.innerWidth - 300) + "px";
      tip.style.top = Math.min(e.clientY + 14, window.innerHeight - 120) + "px";
    }
    return;
  }
  hoveredSideRoom = room;
  updateRoomFloorHighlight(hoveredSideRoom, selectedSideRoom);
  showSidePanelHover(room);
  showRoomMeasureTooltip(room, e);
}

function onSideRoomHoverEnd() {
  hoveredSideRoom = null;
  updateRoomFloorHighlight(null, selectedSideRoom);
  if (interaction && interaction.isSidePickMode() && !selectedSideRoom) {
    showSidePanelPrompt();
  }
  var tip = document.getElementById("tip");
  if (tip) hideTooltip(tip);
}

function showSidePanelPrompt() {
  var panel = document.getElementById("view3d-side-panel");
  if (!panel) return;
  panel.innerHTML =
    '<p class="view3d-side-prompt">Click a room floor in the view</p>';
}

function showSidePanelHover(room) {
  var panel = document.getElementById("view3d-side-panel");
  if (!panel || !room || selectedSideRoom) return;
  panel.innerHTML =
    '<p class="view3d-side-prompt view3d-side-prompt--hover"><strong>' +
    roomLabel(room) +
    "</strong><br>Click to select this room</p>";
}

function selectSideRoom(room) {
  if (!room || !planToWorld) return;
  exitElevationMode();
  selectedSideRoom = room;
  hoveredSideRoom = null;
  selectedRoomBounds = computeRoomBounds(room, planToWorld);
  activeSideIndex = -1;
  updateRoomFloorHighlight(null, selectedSideRoom);
  onSideRoomHoverEnd();
  buildSideThumbnails(room);
  if (interaction) interaction.setSidePickMode(false);
  set3dHint(roomLabel(room) + " — pick a side view");
  var panel = document.getElementById("view3d-side-panel");
  if (panel) panel.hidden = false;
  syncChromeActive("side");
}

function buildSideThumbnails(room) {
  var panel = document.getElementById("view3d-side-panel");
  if (!panel || !renderer || !camera || !scene || !room || !planToWorld) return;
  var bounds = computeRoomBounds(room, planToWorld);
  selectedRoomBounds = bounds;
  var views = getRoomSideViews(bounds);
  var sW = renderer.domElement.width;
  var sH = renderer.domElement.height;
  var sP = camera.position.clone();
  var sT = controls.target.clone();
  var sA = camera.aspect;
  var TW = 185;
  var TH = 115;

  panel.innerHTML = "";
  var header = document.createElement("div");
  header.className = "view3d-side-header";
  header.textContent = roomLabel(room);
  panel.appendChild(header);

  var thumbs = document.createElement("div");
  thumbs.className = "view3d-side-thumbs";
  panel.appendChild(thumbs);

  views.forEach(function (sv, idx) {
    renderer.setSize(TW, TH, false);
    camera.position.set(sv.pos[0], sv.pos[1], sv.pos[2]);
    camera.aspect = TW / TH;
    var lt = new THREE.Vector3(sv.look[0], sv.look[1], sv.look[2]);
    camera.lookAt(lt);
    controls.target.copy(lt);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    var url = renderer.domElement.toDataURL("image/jpeg", 0.88);
    var card = document.createElement("button");
    card.type = "button";
    card.className = "view3d-tcard" + (idx === activeSideIndex ? " view3d-tcard--active" : "");
    card.title = sv.label;
    card.innerHTML = '<img src="' + url + '" alt="' + sv.label + ' elevation">';
    card.addEventListener("click", function () {
      flyTo3DSideView(idx);
    });
    thumbs.appendChild(card);
  });

  renderer.setSize(sW, sH, false);
  camera.position.copy(sP);
  camera.aspect = sA;
  controls.target.copy(sT);
  camera.updateProjectionMatrix();
  if (containerEl) resize3D();
}

/**
 * @param {"dollhouse"|"top"} mode
 */
export function set3DViewMode(mode) {
  close3DSidePanel();
  exitElevationMode();
  clearSideRoomSelection();
  exit3DMoveMode();
  exit3DPaintMode();
  viewMode = mode === "top" ? "top" : "dollhouse";
  applyOrbitForViewMode(viewMode);
  syncChromeActive(viewMode);
  if (!camera || !controls || !sceneBounds) return;
  flyToView(camera, controls, sceneBounds, viewMode, 900);
  if (controls) controls.enabled = true;
  set3dHint(default3dHintText());
}

/**
 * Destroy and clean up 3D engine.
 */
export function dispose3D() {
  cancelCameraTransition();
  close3DSidePanel();
  exitElevationMode();
  exit3DMoveMode();
  exit3DPaintMode();
  clearSideRoomSelection();
  clearElevationMemory();
  if (elevationControls) {
    elevationControls.dispose();
    elevationControls = null;
  }
  roomFloorMeshes = [];
  wallSegmentMeshes = [];
  var existingPaint = document.getElementById("view3d-wall-paint");
  if (existingPaint) {
    if (existingPaint.previousElementSibling && existingPaint.previousElementSibling.classList.contains("view3d-sep")) {
      existingPaint.previousElementSibling.remove();
    }
    existingPaint.remove();
  }
  paintUi = null;
  if (measureOverlay) {
    measureOverlay.dispose();
    measureOverlay = null;
  }
  if (furnitureToolbar3d && furnitureToolbar3d.el && furnitureToolbar3d.el.parentNode) {
    furnitureToolbar3d.el.parentNode.removeChild(furnitureToolbar3d.el);
  }
  furnitureToolbar3d = null;
  if (interaction) {
    interaction.dispose();
    interaction = null;
  }
  furnitureGroups = [];
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (controls) {
    controls.dispose();
    controls = null;
  }
  disposeLighting();
  if (sceneContent) {
    disposeSceneGraph(sceneContent);
    sceneContent = null;
  }
  disposeMaterials();
  if (composer) {
    composer.dispose();
    composer = null;
    ssaoPass = null;
  }
  aoWatch = { accum: 0, frames: 0, warmed: false, lastT: 0 };
  disposeEnvironment(scene);
  if (renderer) {
    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    renderer.dispose();
    renderer = null;
  }
  scene = null;
  camera = null;
  containerEl = null;
  sceneBounds = null;
  planToWorld = null;
  document.body.classList.remove("view3d-top-mode", "view3d-dragging");
}

/**
 * Handle resizing of container.
 */
export function resize3D() {
  if (!containerEl || !camera || !renderer) return;
  var w = containerEl.clientWidth;
  var h = containerEl.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (composer) composer.setSize(w, h);
  invalidate();
}

/**
 * Fly camera to a named preset view computed from the current scene bounds.
 * @param {"hero"|"corner"|"top"|"entry"} name
 */
export function goTo3DPresetView(name) {
  if (!camera || !controls || !sceneBounds) return;
  var sb = sceneBounds;
  var cx = sb.centerX;
  var cz = sb.centerZ;
  var d = sb.span * 0.65;
  var look = new THREE.Vector3(cx, 1.2, cz);
  var pos;
  if (name === "hero") {
    pos = new THREE.Vector3(cx + d, d * 0.7, cz + d);
  } else if (name === "corner") {
    pos = new THREE.Vector3(sb.minX - d * 0.3, d * 0.55, sb.minZ - d * 0.3);
  } else if (name === "top") {
    pos = new THREE.Vector3(cx, sb.span * 1.85, cz + 0.02);
    look = new THREE.Vector3(cx, 0, cz);
  } else if (name === "entry") {
    pos = new THREE.Vector3(cx, 2.2, sb.maxZ + d * 0.5);
  } else {
    return;
  }
  flyToPosition(camera, controls, pos, look, 900);
}

/**
 * Camera position in normalized plan coords for the mini-map.
 * @returns {{ x: number, y: number, heading: number } | null}
 *   x/y in 0–1 plan space (may exceed when camera is outside the plan),
 *   heading in radians — direction the camera looks, in map space.
 */
export function get3DCameraMiniMapState() {
  if (!camera || !controls || !sceneMetrics) return null;
  return cameraMiniMapState(camera, controls, sceneMetrics);
}

/**
 * Free camera placement from the mini-map: move to plan coords at the given
 * eye height, keeping the current view direction so orbit-look still works.
 * @param {number} normX  0–1 across the plan image
 * @param {number} normY  0–1 down the plan image
 * @param {number} heightM  camera eye height in metres
 */
export function set3DCameraMiniMapPosition(normX, normY, heightM) {
  if (!camera || !controls || !sceneMetrics) return;
  placeCameraFromMiniMap(camera, controls, sceneMetrics, normX, normY, heightM);
  invalidate();
}

/**
 * Render a snapshot at 1920×1080 and return a base64 PNG data URL.
 * Temporarily resizes the renderer; restores viewport after.
 */
export function snapshot3D() {
  if (!renderer || !camera || !scene) return null;
  var snapW = 1920;
  var snapH = 1080;
  var prevW = renderer.domElement.width;
  var prevH = renderer.domElement.height;
  var prevRatio = renderer.getPixelRatio();
  var prevAspect = camera.aspect;

  renderer.setPixelRatio(1);
  renderer.setSize(snapW, snapH);
  camera.aspect = snapW / snapH;
  camera.updateProjectionMatrix();

  if (composer) {
    composer.setSize(snapW, snapH);
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
  var dataURL = renderer.domElement.toDataURL("image/png");

  // Restore
  var cw = containerEl ? containerEl.clientWidth : prevW;
  var ch = containerEl ? containerEl.clientHeight : prevH;
  renderer.setPixelRatio(prevRatio);
  renderer.setSize(cw, ch);
  camera.aspect = prevAspect;
  camera.updateProjectionMatrix();
  if (composer) composer.setSize(cw, ch);
  invalidate();

  return dataURL;
}

function polygonRepeat(room, wReal, hReal) {
  var minX = 1;
  var maxX = 0;
  var minY = 1;
  var maxY = 0;
  (room.polygon || []).forEach(function (p) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });
  var rw = Math.max((maxX - minX) * wReal, 1);
  var rh = Math.max((maxY - minY) * hReal, 1);
  return { x: Math.max(rw / 2, 1.5), y: Math.max(rh / 2, 1.5) };
}

/**
 * Window on longest room edge (3.html-style frame + glass).
 */
function addRoomWindow(room, toWorld, wallHeight, matFr, matG, parent) {
  var poly = room.polygon;
  if (!poly || poly.length < 3) return;

  var bestLen = 0;
  var bestA = null;
  var bestB = null;
  for (var i = 0; i < poly.length; i++) {
    var a = toWorld(poly[i]);
    var b = toWorld(poly[(i + 1) % poly.length]);
    var len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len > bestLen) {
      bestLen = len;
      bestA = a;
      bestB = b;
    }
  }
  if (bestLen < 1.8 || !bestA) return;

  var midX = (bestA.x + bestB.x) / 2;
  var midZ = (bestA.z + bestB.z) / 2;
  var angle = -Math.atan2(bestB.z - bestA.z, bestB.x - bestA.x);
  var wWin = Math.min(bestLen * 0.35, bestLen - 0.4);
  if (wWin < 0.8) return;

  var wy1 = wallHeight * 0.29;
  var wy2 = wallHeight * 0.94;
  var wH = wy2 - wy1;
  var fcy = wy1 + wH / 2;
  var fw = 0.07;
  var wallZ = 0.12;
  var glassZ = 0.19;
  var paneW = (wWin - fw) / 2;
  var paneOff = (paneW + fw) / 4;

  var g = new THREE.Group();
  g.position.set(midX, 0, midZ);
  g.rotation.y = angle;

  function lm(geo, mat, x, y, z) {
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }

  lm(new THREE.BoxGeometry(wWin + fw * 2, fw, 0.12), matFr, 0, wy1, wallZ);
  lm(new THREE.BoxGeometry(wWin + fw * 2, fw, 0.12), matFr, 0, wy2, wallZ);
  lm(new THREE.BoxGeometry(fw, wH, 0.12), matFr, -wWin / 2, fcy, wallZ);
  lm(new THREE.BoxGeometry(fw, wH, 0.12), matFr, wWin / 2, fcy, wallZ);
  lm(new THREE.PlaneGeometry(paneW, wH), matG, -paneOff, fcy, glassZ);
  lm(new THREE.PlaneGeometry(paneW, wH), matG, paneOff, fcy, glassZ);

  parent.add(g);
}

function buildSceneGeometry() {
  if (!activePlanData || !sceneContent) return;

  disposeSceneGraph(sceneContent);
  while (sceneContent.children.length) sceneContent.remove(sceneContent.children[0]);

  var imgW = activePlanImage ? activePlanImage.naturalWidth || 1000 : 1000;
  var imgH = activePlanImage ? activePlanImage.naturalHeight || 1000 : 1000;

  var cal = resolveCalibration(activePlanData.calibration, imgW, imgH);
  calibrationState3d = cal;
  planImageSize3d = { width: imgW, height: imgH };
  var mpp = cal ? cal.metersPerPixel : 12 / Math.max(imgW, imgH);

  var wReal = imgW * mpp;
  var hReal = imgH * mpp;

  function toWorld(pt) {
    return normToWorld(pt, wReal, hReal);
  }

  planToWorld = toWorld;
  sceneMetrics = { wReal: wReal, hReal: hReal };
  sceneBounds = computeSceneBounds(activePlanData.rooms || [], toWorld);
  furnitureGroups = [];
  roomFloorMeshes = [];
  wallSegmentMeshes = [];

  var matFr = createWindowFrameMaterial();
  var matG = createGlassMaterial();
  // Thin warm-white cap on top of walls — reads like the 2D plan's wall lines.
  var matCap = new THREE.MeshStandardMaterial({ color: 0xe7e0d4, roughness: 0.6, metalness: 0 });
  // Dollhouse cut height — low enough for the camera to see over walls into
  // every room, tall enough to still read as walls. Applies to all plans.
  var wallHeight = 1.7;

  // Base slab under the full footprint — fills gaps between room polygons
  // (otherwise the dark scene background shows through) and reads as a plinth.
  if (sceneBounds) {
    var basePad = 0.6;
    var baseMesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        sceneBounds.maxX - sceneBounds.minX + basePad * 2,
        0.1,
        sceneBounds.maxZ - sceneBounds.minZ + basePad * 2
      ),
      new THREE.MeshStandardMaterial({ color: 0xcabba8, roughness: 0.92, metalness: 0 })
    );
    baseMesh.position.set(sceneBounds.centerX, -0.05, sceneBounds.centerZ);
    baseMesh.receiveShadow = true;
    sceneContent.add(baseMesh);
  }

  var roomList = activePlanData.rooms || [];
  var roomAreas = roomList.map(function (r) {
    return r.polygon && r.polygon.length >= 3 ? polygonArea(r.polygon) : 0;
  });
  // Vision-traced polygons often overshoot past dividing walls into neighbors.
  // Stack floors by area (largest lowest, sub-mm steps) so the smallest room
  // wins every contested overlap — matching findRoomAtWorld's smallest-wins
  // click rule, so the floor you see is always the room a click resolves to.
  var floorRank = [];
  roomList
    .map(function (_, i) {
      return i;
    })
    .sort(function (a, b) {
      return roomAreas[b] - roomAreas[a] || a - b;
    })
    .forEach(function (roomIdx, rank) {
      floorRank[roomIdx] = rank;
    });

  roomList.forEach(function (room, roomIdx) {
    if (!room.polygon || room.polygon.length < 3) return;

    // rotation.x = -PI/2 maps shape-y to world -z, so store -z here to land
    // floors on the same +z convention as walls/furniture (else they mirror
    // across the plan's centerline and paint shows up in the wrong room).
    var shape = new THREE.Shape();
    var start = toWorld(room.polygon[0]);
    shape.moveTo(start.x, -start.z);
    for (var i = 1; i < room.polygon.length; i++) {
      var pt = toWorld(room.polygon[i]);
      shape.lineTo(pt.x, -pt.z);
    }
    shape.closePath();

    // Carve out any smaller room that sits fully inside this one (e.g. an
    // ensuite or closet within a bedroom) so floor polygons never overlap and
    // a painted finish can't bleed across into the nested room.
    roomList.forEach(function (other, otherIdx) {
      if (otherIdx === roomIdx) return;
      if (!other.polygon || other.polygon.length < 3) return;
      if (roomAreas[otherIdx] >= roomAreas[roomIdx]) return;
      var fullyInside = other.polygon.every(function (p) {
        return pointInPolygon(p.x, p.y, room.polygon);
      });
      if (!fullyInside) return;
      var hole = new THREE.Path();
      var h0 = toWorld(other.polygon[0]);
      hole.moveTo(h0.x, -h0.z);
      for (var k = 1; k < other.polygon.length; k++) {
        var hp = toWorld(other.polygon[k]);
        hole.lineTo(hp.x, -hp.z);
      }
      hole.closePath();
      shape.holes.push(hole);
    });

    var floorGeo = new THREE.ShapeGeometry(shape);
    var floorMat = createFloorMaterial(resolveRoomFlooring(room));
    var floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0.005 + floorRank[roomIdx] * 0.0003;
    floorMesh.receiveShadow = true;
    floorMesh.userData.room = room;
    floorMesh.userData.isRoomFloor = true;
    roomFloorMeshes.push(floorMesh);
    sceneContent.add(floorMesh);

    addRoomWindow(room, toWorld, wallHeight, matFr, matG, sceneContent);
  });

  var walls = (activePlanData.walls || []).slice();
  if (walls.length === 0 && activePlanData.rooms && activePlanData.rooms.length) {
    activePlanData.rooms.forEach(function (r) {
      if (r.polygon && r.polygon.length >= 3) {
        var pts = r.polygon.map(function (p) {
          return { x: p.x, y: p.y };
        });
        pts.push({ x: pts[0].x, y: pts[0].y });
        walls.push({
          id: "wall-from-" + (r.id || "room"),
          roomId: r.id,
          points: pts,
          thickness: 0.006,
        });
      }
    });
  }

  walls.forEach(function (wall, wallIdx) {
    var pts = wall.points;
    if (!pts || pts.length < 2) return;
    var thick = (wall.thickness || 0.006) * Math.max(imgW, imgH) * mpp * 0.55;
    var wallId = wall.id || "wall-" + wallIdx;

    for (var wi = 0; wi < pts.length - 1; wi++) {
      var w1 = toWorld(pts[wi]);
      var w2 = toWorld(pts[wi + 1]);

      var dx = w2.x - w1.x;
      var dz = w2.z - w1.z;
      var len = Math.hypot(dx, dz);
      if (len < 0.01) continue;

      var midNorm = {
        x: (pts[wi].x + pts[wi + 1].x) / 2,
        y: (pts[wi].y + pts[wi + 1].y) / 2,
      };
      var room = findRoomForWall(wall) || findRoomForWallPoint(midNorm);
      var segKey = wallSegmentKey(wallId, wi);
      var preset = resolveWallSegmentColor(activePlanData, segKey, room);
      var segMat = cloneWallMaterial(preset);

      var wallGeo = new THREE.BoxGeometry(len, wallHeight, thick);
      var wallMesh = new THREE.Mesh(wallGeo, segMat);
      var midX = (w1.x + w2.x) / 2;
      var midZ = (w1.z + w2.z) / 2;
      wallMesh.position.set(midX, wallHeight / 2, midZ);
      wallMesh.rotation.y = -Math.atan2(dz, dx);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      wallMesh.userData.isWallSegment = true;
      wallMesh.userData.segmentKey = segKey;
      wallMesh.userData.presetId = preset;
      wallMesh.userData.room = room;
      wallSegmentMeshes.push(wallMesh);
      sceneContent.add(wallMesh);

      var capMesh = new THREE.Mesh(new THREE.BoxGeometry(len + 0.02, 0.02, thick + 0.02), matCap);
      capMesh.position.set(midX, wallHeight + 0.01, midZ);
      capMesh.rotation.y = wallMesh.rotation.y;
      capMesh.receiveShadow = true;
      sceneContent.add(capMesh);
    }
  });

  var hasSofaOnPlan = false;
  (activePlanData.furniture || []).forEach(function (item) {
    if (item.x == null || item.y == null) return;
    var g = addFurnitureGroup(item, wReal, hReal);
    if (g && g.userData.isSofaFurniture) hasSofaOnPlan = true;
  });

  if (!hasSofaOnPlan) addDefaultLivingRoomSofa(wReal, hReal);
  addLivingRoomRug(wReal, hReal);
}

/** Light woven area rug under the living room seating (reference-render look). */
function addLivingRoomRug(wReal, hReal) {
  var room = findLivingRoom(activePlanData.rooms || []);
  if (!room || !room.polygon || room.polygon.length < 3) return;

  var minX = 1;
  var maxX = 0;
  var minY = 1;
  var maxY = 0;
  room.polygon.forEach(function (p) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });
  var rw = Math.min((maxX - minX) * wReal * 0.55, 3.4);
  var rd = Math.min((maxY - minY) * hReal * 0.55, 2.6);
  if (rw < 1 || rd < 1) return;

  var c = polygonCentroidNorm(room.polygon);
  var wPos = normToWorld({ x: c.x, y: c.y }, wReal, hReal);

  // ShapeGeometry UVs stay in meters, so the carpet weave renders real-scale.
  var shape = new THREE.Shape();
  shape.moveTo(-rw / 2, -rd / 2);
  shape.lineTo(rw / 2, -rd / 2);
  shape.lineTo(rw / 2, rd / 2);
  shape.lineTo(-rw / 2, rd / 2);
  shape.closePath();
  var rug = new THREE.Mesh(new THREE.ShapeGeometry(shape), createFloorMaterial("carpet"));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(wPos.x, 0.012, wPos.z);
  rug.receiveShadow = true;
  sceneContent.add(rug);
}

/** Light oak by default; grey stone on balconies, marble tile in wet rooms. */
function resolveRoomFlooring(room) {
  var s = (
    String((room && room.name) || "") +
    " " +
    String((room && room.id) || "") +
    " " +
    String((room && room.type) || "")
  ).toLowerCase();
  var flooring = String((room && room.flooring) || "").toLowerCase();
  if (/balcon|terrace|patio|deck/.test(s) && (!flooring || flooring === "wood")) return "stone";
  if (flooring) return flooring;
  if (/bath|toilet|wc|shower|ensuite|laundry/.test(s)) return "tile";
  return "wood";
}

function findRoomForWall(wall) {
  if (!wall || !wall.roomId || !activePlanData) return null;
  var rooms = activePlanData.rooms || [];
  for (var i = 0; i < rooms.length; i++) {
    if (rooms[i].id === wall.roomId) return rooms[i];
  }
  return null;
}

function findRoomForWallPoint(normPt) {
  if (!normPt || !activePlanData) return null;
  var rooms = activePlanData.rooms || [];
  for (var i = 0; i < rooms.length; i++) {
    if (rooms[i].polygon && pointInPolygon(normPt.x, normPt.y, rooms[i].polygon)) return rooms[i];
  }
  return null;
}

function applyPaintToSegment(segmentKey, presetId) {
  if (!segmentKey || !presetId || !activePlanData) return;
  setWallSegmentColor(activePlanData, segmentKey, presetId);
  wallSegmentMeshes.forEach(function (mesh) {
    if (mesh.userData.segmentKey === segmentKey) {
      mesh.material = cloneWallMaterial(presetId);
      mesh.userData.presetId = presetId;
    }
  });
}

function applyPaintToRoom(room) {
  if (!room) return;
  wallSegmentMeshes.forEach(function (mesh) {
    if (mesh.userData.room && mesh.userData.room.id === room.id) {
      applyPaintToSegment(mesh.userData.segmentKey, activePaintColor);
    }
  });
}

function applyFloorFinishToRoom(room) {
  if (!room || !activeFloorFinish) return;
  room.flooring = activeFloorFinish;
  roomFloorMeshes.forEach(function (mesh) {
    if (mesh.userData.room === room) {
      mesh.material = createFloorMaterial(resolveRoomFlooring(room));
    }
  });
}

function furnitureDimsForItem(item, catalogRow, wReal, hReal) {
  var type = furnitureTypeStr(item, catalogRow);
  var wM = 0.6;
  var dM = 0.6;
  var hM = 0.7;

  if (catalogRow) {
    wM = (catalogRow.width_mm || 600) / 1000;
    dM = (catalogRow.depth_mm || catalogRow.length_mm || 600) / 1000;
    hM = (catalogRow.height_mm || 750) / 1000;
  } else if (item.catalogWidthMm != null || item.catalogDepthMm != null) {
    wM = (item.catalogWidthMm || 600) / 1000;
    dM = (item.catalogDepthMm || 600) / 1000;
    hM = (item.catalogHeightMm || 750) / 1000;
  } else {
    var normW = item.width != null ? item.width : item.scale != null ? item.scale : 0.06;
    var normD = item.height != null ? item.height : item.depth != null ? item.depth : normW;
    wM = normW * wReal;
    dM = normD * hReal;
    if (type.indexOf("bed") >= 0) hM = 0.6;
    else if (type.indexOf("sofa") >= 0) hM = 0.75;
    else if (type.indexOf("chair") >= 0) hM = 0.85;
    else if (type.indexOf("table") >= 0) hM = 0.75;
    else hM = 0.7;
  }
  // Bad/missing catalog data can make a sofa render smaller than a chair. Real
  // catalog dims are kept (so a long sofa stays longer than a short one), but a
  // sofa whose resolved footprint is chair-sized falls back to one fixed sofa
  // size instead of rendering as a chair.
  if (isSofaTypeStr(type) || type.indexOf("couch") >= 0) {
    if (wM < 1.2) {
      wM = LIVING_ROOM_DEMO_W_MM / 1000;
      dM = LIVING_ROOM_DEMO_D_MM / 1000;
      hM = LIVING_ROOM_DEMO_H_MM / 1000;
    } else {
      if (dM < 0.75) dM = 0.75;
      if (hM < 0.65) hM = 0.65;
    }
  }
  return { wM: wM, dM: dM, hM: hM };
}

function furnitureTypeStr(item, catalogRow) {
  var parts = [
    item.type,
    item.shape,
    item.richIcon,
    item.catalogId,
    item.id,
    catalogRow && catalogRow.shape,
    catalogRow && catalogRow.rich_icon,
    catalogRow && catalogRow.category,
    catalogRow && catalogRow.product_name,
    catalogRow && catalogRow.name,
  ];
  var typeStr = parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return typeStr;
}

/** Rugs are 2D SVG only — skip in dollhouse / 3D view. */
function is2dOnlyFurniture(item, catalogRow) {
  if (!item) return false;
  if (item.richIcon === "area_rug") return true;
  if (String(item.type || "").toLowerCase() === "area_rug") return true;
  if (item.catalogId === "cat-rug") return true;
  if (catalogRow && catalogRow.rich_icon === "area_rug") return true;
  var typeStr = furnitureTypeStr(item, catalogRow);
  return typeStr.indexOf("area_rug") >= 0 || typeStr.indexOf("area rug") >= 0;
}

function addFurnitureGroup(item, wReal, hReal) {
  var catalog = activePlanData.furniture_catalog || [];
  var catalogRow = catalogById(catalog, item.catalogId);
  if (is2dOnlyFurniture(item, catalogRow)) return null;
  var dims = furnitureDimsForItem(item, catalogRow, wReal, hReal);
  var typeStr = furnitureTypeStr(item, catalogRow);

  var group = new THREE.Group();
  group.userData.furnitureItem = item;
  group.userData.isFurniture = true;
  group.userData.furnitureTypeStr = typeStr;
  group.userData.furnitureDims = dims;
  group.userData.isSofaFurniture = isSofaTypeStr(typeStr);

  var wPos = normToWorld({ x: item.x, y: item.y }, wReal, hReal);
  group.position.set(wPos.x, item.z || 0, wPos.z);
  group.rotation.y = -(item.rotationDeg || 0) * Math.PI / 180;

  addFurnitureMeshes(group, typeStr, item, dims.wM, dims.dM, dims.hM);
  group.traverse(function (c) {
    if (c.isMesh) c.userData.furnitureGroup = group;
  });
  sceneContent.add(group);
  furnitureGroups.push(group);
  return group;
}

function findLivingRoom(rooms) {
  for (var i = 0; i < rooms.length; i++) {
    var r = rooms[i];
    var id = String(r.id || "").toLowerCase();
    var name = String(r.name || "").toLowerCase();
    var type = String(r.type || "").toLowerCase();
    if (id.indexOf("living") >= 0 || name.indexOf("living") >= 0 || type === "living") return r;
  }
  return null;
}

function polygonCentroidNorm(poly) {
  var cx = 0;
  var cy = 0;
  for (var i = 0; i < poly.length; i++) {
    cx += poly[i].x;
    cy += poly[i].y;
  }
  return { x: cx / poly.length, y: cy / poly.length };
}

/** Place demo GLB sofa in living room when plan has no sofa. */
function addDefaultLivingRoomSofa(wReal, hReal) {
  var room = findLivingRoom(activePlanData.rooms || []);
  if (!room || !room.polygon || room.polygon.length < 3) return;

  var c = polygonCentroidNorm(room.polygon);
  var placeholder = {
    id: "__default_sofa__",
    catalogId: null,
    type: "sofa",
    shape: "sofa",
    x: c.x,
    y: c.y,
    rotationDeg: 0,
    isDefaultPlaceholder: true,
    catalogWidthMm: LIVING_ROOM_DEMO_W_MM,
    catalogDepthMm: LIVING_ROOM_DEMO_D_MM,
    catalogHeightMm: LIVING_ROOM_DEMO_H_MM,
    useGlbBake: true,
    useGlbModel: true,
    glbUrl: LIVING_ROOM_DEMO_GLB_URL,
    iconMode: "glb",
  };
  addFurnitureGroup(placeholder, wReal, hReal);
}

function clearFurnitureMeshes(group) {
  var kids = group.children.slice();
  kids.forEach(function (child) {
    group.remove(child);
    disposeSceneGraph(child);
  });
  group.userData.usesGlbSofa = false;
  invalidateFurnitureBox(group);
}

function collectPlanGlbUrls() {
  var urls = {};
  urls[LIVING_ROOM_DEMO_GLB_URL] = true;
  (activePlanData.furniture || []).forEach(function (item) {
    if (!itemUsesGlbModel(item)) return;
    var url = resolveItemGlbUrl(item);
    if (url) urls[url] = true;
  });
  return Object.keys(urls).filter(Boolean);
}

function preloadPlanGlbs() {
  var urls = collectPlanGlbUrls();
  if (!urls.length) return Promise.resolve([]);
  return Promise.all(
    urls.map(function (url) {
      return preloadDefaultSofaGlb(url).then(
        function () {
          return { url: url, ok: true };
        },
        function (err) {
          return { url: url, ok: false, err: err && err.message ? err.message : String(err) };
        }
      );
    })
  ).then(function (results) {
    results.forEach(function (r) {
      if (!r.ok) {
        console.warn("[plan3d] GLB preload failed:", r.url, r.err || "");
      }
    });
    return results;
  });
}

function refreshGlbMeshes() {
  furnitureGroups.forEach(function (group) {
    var item = group.userData.furnitureItem;
    if (!itemUsesGlbModel(item)) return;
    var dims = group.userData.furnitureDims;
    if (!dims) return;
    var glbUrl = resolveItemGlbUrl(item);
    if (!glbUrl) return;
    var glb = createDefaultSofaInstance(dims.wM, dims.dM, dims.hM, glbUrl);
    if (!glb) return;
    clearFurnitureMeshes(group);
    group.add(glb);
    group.userData.usesGlbSofa = true;
    glb.traverse(function (c) {
      if (c.isMesh) c.userData.furnitureGroup = group;
    });
  });
  requestShadowUpdate();
}

/** @deprecated use refreshGlbMeshes */
function refreshSofaGlbMeshes() {
  refreshGlbMeshes();
}

function addFurnitureMeshes(group, typeStr, item, wM, dM, hM) {
  if (itemUsesGlbModel(item)) {
    var glbUrl = resolveItemGlbUrl(item);
    if (glbUrl) {
      var glbModel = createDefaultSofaInstance(wM, dM, hM, glbUrl);
      if (glbModel) {
        group.add(glbModel);
        group.userData.usesGlbSofa = true;
        return;
      }
    }
  }

  // Keep the item visible while its optional GLB model loads or fails.
  if (typeStr.indexOf("sofa") >= 0 || typeStr.indexOf("lounge") >= 0) {
    var sofaColor = 0xe7dfd0;
    if (item.sofaColorOverride) sofaColor = getSofaHexColor(item.sofaColorOverride);
    else if (item.sofaParams && item.sofaParams.color) sofaColor = getSofaHexColor(item.sofaParams.color);

    var sofaMat = createFabricMaterial(sofaColor, 0.88);
    var cushionMat = createFabricMaterial(lightenHexColor(sofaColor, 0.12), 0.9);
    var woodMat = createWoodLegMaterial();

    var seatMesh = new THREE.Mesh(roundedBoxGeo(wM * 0.9, hM * 0.4, dM * 0.85, 0.04), cushionMat);
    seatMesh.position.y = hM * 0.3;
    seatMesh.castShadow = seatMesh.receiveShadow = true;
    group.add(seatMesh);

    var backMesh = new THREE.Mesh(roundedBoxGeo(wM * 0.9, hM * 0.5, dM * 0.15, 0.04), sofaMat);
    backMesh.position.set(0, hM * 0.65, -dM * 0.35);
    backMesh.castShadow = backMesh.receiveShadow = true;
    group.add(backMesh);

    var armW = wM * 0.08;
    var armGeo = roundedBoxGeo(armW, hM * 0.65, dM * 0.85, 0.03);
    [-1, 1].forEach(function (side) {
      var arm = new THREE.Mesh(armGeo, sofaMat);
      arm.position.set(side * (wM * 0.45 - armW / 2), hM * 0.425, 0);
      arm.castShadow = arm.receiveShadow = true;
      group.add(arm);
    });

    var legGeo = new THREE.CylinderGeometry(0.02, 0.02, hM * 0.1);
    [[-wM * 0.42, -dM * 0.38], [wM * 0.42, -dM * 0.38], [-wM * 0.42, dM * 0.38], [wM * 0.42, dM * 0.38]].forEach(
      function (off) {
        var leg = new THREE.Mesh(legGeo, woodMat);
        leg.position.set(off[0], hM * 0.05, off[1]);
        leg.castShadow = true;
        group.add(leg);
      }
    );
    return;
  }

  if (typeStr.indexOf("bed") >= 0) {
    var bedWood = createWoodLegMaterial();
    var mattressMat = createFabricMaterial(0xffffff, 0.95);
    var blanketMat = createFabricMaterial(0xd9cdb6, 0.92);
    var pillowMat = createFabricMaterial(0xfaf7f0, 0.93);

    var frameMesh = new THREE.Mesh(new THREE.BoxGeometry(wM, hM * 0.25, dM), bedWood);
    frameMesh.position.y = hM * 0.125;
    frameMesh.castShadow = frameMesh.receiveShadow = true;
    group.add(frameMesh);

    var headboardMesh = new THREE.Mesh(roundedBoxGeo(wM, hM * 0.9, dM * 0.08, 0.025), bedWood);
    headboardMesh.position.set(0, hM * 0.45, -dM * 0.46);
    headboardMesh.castShadow = true;
    group.add(headboardMesh);

    var mattressMesh = new THREE.Mesh(roundedBoxGeo(wM * 0.94, hM * 0.4, dM * 0.9, 0.05), mattressMat);
    mattressMesh.position.set(0, hM * 0.4, dM * 0.03);
    mattressMesh.castShadow = mattressMesh.receiveShadow = true;
    group.add(mattressMesh);

    var blanketMesh = new THREE.Mesh(roundedBoxGeo(wM * 0.96, hM * 0.42, dM * 0.45, 0.04), blanketMat);
    blanketMesh.position.set(0, hM * 0.41, dM * 0.24);
    blanketMesh.castShadow = blanketMesh.receiveShadow = true;
    group.add(blanketMesh);

    var pillowGeo = roundedBoxGeo(wM * 0.36, hM * 0.14, dM * 0.18, 0.035);
    [-1, 1].forEach(function (side) {
      var pillow = new THREE.Mesh(pillowGeo, pillowMat);
      pillow.position.set(side * wM * 0.22, hM * 0.66, -dM * 0.32);
      pillow.castShadow = pillow.receiveShadow = true;
      group.add(pillow);
    });
    return;
  }

  if (typeStr.indexOf("table") >= 0 || typeStr.indexOf("desk") >= 0) {
    var tableMat = createTableTopMaterial();
    var legMat = createWoodLegMaterial();
    var topMesh = new THREE.Mesh(new THREE.BoxGeometry(wM, 0.04, dM), tableMat);
    topMesh.position.y = hM - 0.02;
    topMesh.castShadow = topMesh.receiveShadow = true;
    group.add(topMesh);
    var legGeo = new THREE.CylinderGeometry(0.025, 0.015, hM - 0.04);
    [[-wM * 0.44, dM * 0.44], [wM * 0.44, dM * 0.44], [-wM * 0.44, -dM * 0.44], [wM * 0.44, -dM * 0.44]].forEach(
      function (off) {
        var leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(off[0], (hM - 0.04) / 2, off[1]);
        leg.castShadow = true;
        group.add(leg);
      }
    );
    return;
  }

  if (typeStr.indexOf("chair") >= 0 || typeStr.indexOf("stool") >= 0) {
    var frameMat = createWoodLegMaterial();
    var seatMat = createFabricMaterial(0xe3d8c2, 0.88);
    var seatMesh = new THREE.Mesh(roundedBoxGeo(wM, hM * 0.08, dM, 0.02), seatMat);
    seatMesh.position.y = hM * 0.5;
    seatMesh.castShadow = seatMesh.receiveShadow = true;
    group.add(seatMesh);
    var backMesh = new THREE.Mesh(roundedBoxGeo(wM, hM * 0.45, dM * 0.06, 0.02), seatMat);
    backMesh.position.set(0, hM * 0.755, -dM * 0.47);
    backMesh.castShadow = true;
    group.add(backMesh);
    var legGeo = new THREE.CylinderGeometry(0.015, 0.01, hM * 0.5);
    [[-wM * 0.43, dM * 0.43], [wM * 0.43, dM * 0.43], [-wM * 0.43, -dM * 0.43], [wM * 0.43, -dM * 0.43]].forEach(
      function (off) {
        var leg = new THREE.Mesh(legGeo, frameMat);
        leg.position.set(off[0], hM * 0.25, off[1]);
        leg.castShadow = true;
        group.add(leg);
      }
    );
    return;
  }

  if (typeStr.indexOf("plant") >= 0 || typeStr.indexOf("tree") >= 0) {
    var potMat = new THREE.MeshStandardMaterial({ color: 0xb0653a, roughness: 0.75 });
    var trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.85 });
    var leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7d44, roughness: 0.7 });
    var leafMatDark = new THREE.MeshStandardMaterial({ color: 0x2f6136, roughness: 0.75 });

    var potMesh = new THREE.Mesh(new THREE.CylinderGeometry(wM * 0.32, wM * 0.24, hM * 0.32, 16), potMat);
    potMesh.position.y = hM * 0.16;
    potMesh.castShadow = potMesh.receiveShadow = true;
    group.add(potMesh);

    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(wM * 0.035, wM * 0.05, hM * 0.42, 8), trunkMat);
    trunk.position.y = hM * 0.5;
    trunk.castShadow = true;
    group.add(trunk);

    // Irregular foliage cluster instead of a single green sphere.
    [
      { x: 0, y: hM * 0.82, r: wM * 0.32, mat: leafMat },
      { x: wM * 0.2, y: hM * 0.68, r: wM * 0.22, mat: leafMatDark },
      { x: -wM * 0.18, y: hM * 0.7, r: wM * 0.2, mat: leafMatDark },
      { x: wM * 0.06, y: hM * 0.94, r: wM * 0.18, mat: leafMat },
    ].forEach(function (b) {
      var blob = new THREE.Mesh(new THREE.SphereGeometry(b.r, 10, 8), b.mat);
      blob.position.set(b.x, b.y, (Math.abs(b.x) > 0 ? -b.x * 0.5 : wM * 0.1));
      blob.scale.y = 0.85;
      blob.castShadow = true;
      group.add(blob);
    });
    return;
  }

  if (/bath|tub|toilet|wc|basin|sink|shower/.test(typeStr)) {
    var ceramicMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.22,
      metalness: 0,
      envMapIntensity: 0.8,
    });
    var fixtureMesh = new THREE.Mesh(roundedBoxGeo(wM, hM, dM, 0.05), ceramicMat);
    fixtureMesh.position.y = hM / 2;
    fixtureMesh.castShadow = fixtureMesh.receiveShadow = true;
    group.add(fixtureMesh);
    return;
  }

  var boxMat = new THREE.MeshStandardMaterial({ color: 0xded7cb, roughness: 0.7, metalness: 0.05 });
  var boxMesh = new THREE.Mesh(new THREE.BoxGeometry(wM, hM, dM), boxMat);
  boxMesh.position.y = hM / 2;
  boxMesh.castShadow = boxMesh.receiveShadow = true;
  group.add(boxMesh);
}

/** Rounded box with radius clamped to the smallest half-dimension. */
function roundedBoxGeo(w, h, d, r) {
  var radius = Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002);
  if (!(radius > 0.004)) return new THREE.BoxGeometry(w, h, d);
  return new RoundedBoxGeometry(w, h, d, 2, radius);
}

function getSofaHexColor(colorName) {
  var colors = {
    beige: 0xe6dfd3,
    grey: 0x8a8a8a,
    gray: 0x8a8a8a,
    cream: 0xfdf6e2,
    tan: 0xd2b48c,
    brown: 0x6e473b,
    navy: 0x1d3557,
    blue: 0x3b82f6,
    green: 0x2e7d32,
    red: 0xc62828,
    charcoal: 0x334155,
  };
  return colors[String(colorName).toLowerCase()] || 0x475569;
}

function lightenHexColor(hex, percent) {
  var r = (hex >> 16) & 0xff;
  var g = (hex >> 8) & 0xff;
  var b = hex & 0xff;
  r = Math.min(255, Math.floor(r + (255 - r) * percent));
  g = Math.min(255, Math.floor(g + (255 - g) * percent));
  b = Math.min(255, Math.floor(b + (255 - b) * percent));
  return (r << 16) | (g << 8) | b;
}
