import * as THREE from "three";
import {
  resolvePosition3D,
  applyWorldPositionToItem,
  getFurnitureWorldBox,
} from "./plan3dMove.js";

var FLOOR_NORMAL = new THREE.Vector3(0, 1, 0);
var _dragPlane = new THREE.Plane();
var _dragPt = new THREE.Vector3();
var _groupBox = new THREE.Box3();

/**
 * @param {object} opts
 * @param {THREE.WebGLRenderer} opts.renderer
 * @param {THREE.PerspectiveCamera} opts.camera
 * @param {import("three/examples/jsm/controls/OrbitControls.js").OrbitControls} opts.controls
 * @param {THREE.Scene} opts.scene
 * @param {() => THREE.Group[]} opts.getFurnitureGroups
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} opts.bounds
 * @param {number} opts.wReal
 * @param {number} opts.hReal
 * @param {Array} opts.rooms
 * @param {() => THREE.Mesh[]} opts.getRoomFloorMeshes
 * @param {(wx: number, wz: number) => object | null} opts.findRoomAtWorld
 * @param {(room: object) => void} [opts.onRoomSelected]
 * @param {(room: object, e: MouseEvent) => void} [opts.onRoomHover]
 * @param {() => void} [opts.onRoomHoverEnd]
 * @param {(room: object, e: MouseEvent) => void} [opts.onRoomHoverGeneral]
 * @param {() => void} [opts.onRoomHoverGeneralEnd]
 * @param {(group: THREE.Group, e: MouseEvent) => void} [opts.onFurnitureHover]
 * @param {() => void} [opts.onFurnitureHoverEnd]
 * @param {(group: THREE.Group) => void} [opts.onFurnitureSelect]
 * @param {() => void} [opts.onFurnitureDeselect]
 * @param {() => boolean} [opts.isSidePanelOpen]
 * @param {() => boolean} [opts.isSideRoomPickActive]
 * @param {() => boolean} [opts.isElevationActive]
 * @param {() => object | null} [opts.getElevationWall]
 * @param {() => boolean} [opts.isTopView]
 * @param {(item: object) => void} [opts.onFurnitureMoved]
 * @param {() => THREE.Mesh[]} [opts.getWallSegmentMeshes]
 * @param {(segmentKey: string) => void} [opts.onWallPaint]
 * @param {(room: object) => void} [opts.onRoomPaint]
 */
export function createPlan3DInteraction(opts) {
  var raycaster = new THREE.Raycaster();
  // three-mesh-bvh: stop at the closest hit per mesh instead of collecting all
  // intersections — every pick site here only reads hits[0].
  raycaster.firstHitOnly = true;
  var mouse2 = new THREE.Vector2();
  var moveMode = false;
  var paintMode = false;
  var sidePickMode = false;
  var isDragging = false;
  var dragTarget = null;
  var dragOX = 0;
  var dragOZ = 0;
  var lastHoverPickT = 0;
  var lastDragSyncT = 0;
  var selected = null;
  // Box3Helper reads the given Box3 directly (no geometry traversal), unlike
  // THREE.BoxHelper which re-walks the target's full mesh geometry on every
  // update() — costly for high-poly GLBs called every drag pointermove.
  var _selectedBox = new THREE.Box3();
  var boxHelper = new THREE.Box3Helper(_selectedBox, 0xffcc00);
  boxHelper.material.linewidth = 2;
  boxHelper.visible = false;
  opts.scene.add(boxHelper);

  var dom = opts.renderer.domElement;

  function getNDC(e) {
    var r = dom.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * 2 - 1,
      y: -(((e.clientY - r.top) / r.height) * 2 - 1),
    };
  }

  function pickFurniture(e) {
    var nd = getNDC(e);
    mouse2.set(nd.x, nd.y);
    raycaster.setFromCamera(mouse2, opts.camera);
    // Broad-phase: test each group's bounding box first so high-poly GLBs
    // (chairs etc.) only pay for triangle raycasts when the ray is near them.
    var meshes = [];
    opts.getFurnitureGroups().forEach(function (fg) {
      getFurnitureWorldBox(fg, _groupBox);
      if (_groupBox.isEmpty() || !raycaster.ray.intersectsBox(_groupBox)) return;
      fg.traverse(function (c) {
        if (c.isMesh) meshes.push(c);
      });
    });
    if (!meshes.length) return null;
    var hits = raycaster.intersectObjects(meshes);
    return hits.length ? hits[0].object.userData.furnitureGroup : null;
  }

  function floorHit(e, planeY) {
    var nd = getNDC(e);
    mouse2.set(nd.x, nd.y);
    raycaster.setFromCamera(mouse2, opts.camera);
    _dragPlane.set(FLOOR_NORMAL, -(planeY != null ? planeY : 0));
    if (!raycaster.ray.intersectPlane(_dragPlane, _dragPt)) return null;
    return _dragPt;
  }

  function constrainElevationDragPoint(fp, grp) {
    if (!fp || !grp || !isElevationActive()) return fp;
    var wall = opts.getElevationWall ? opts.getElevationWall() : null;
    if (!wall || !wall.panAxis) return fp;
    if (wall.panAxis === "z") {
      fp.x = grp.position.x;
    } else if (wall.panAxis === "x") {
      fp.z = grp.position.z;
    }
    return fp;
  }

  function pickRoom(e) {
    var nd = getNDC(e);
    mouse2.set(nd.x, nd.y);
    raycaster.setFromCamera(mouse2, opts.camera);
    var pt = null;
    var floors = opts.getRoomFloorMeshes ? opts.getRoomFloorMeshes() : [];
    if (floors.length) {
      var hits = raycaster.intersectObjects(floors, false);
      if (hits.length) {
        hits.sort(function (a, b) {
          return a.distance - b.distance;
        });
        // The floor mesh physically under the cursor is unambiguous — trust it
        // rather than re-deriving by point-in-polygon, which picks the smallest
        // overlapping room (e.g. a bathroom carved inside a bedroom's polygon).
        var hitRoom = hits[0].object.userData && hits[0].object.userData.room;
        if (hitRoom) return hitRoom;
        pt = hits[0].point;
      }
    }
    if (!pt) {
      var fp = floorHit(e);
      if (!fp) return null;
      pt = fp;
    }
    if (!opts.findRoomAtWorld) return null;
    return opts.findRoomAtWorld(pt.x, pt.z);
  }

  function pickWallSegment(e) {
    if (!opts.getWallSegmentMeshes) return null;
    var walls = opts.getWallSegmentMeshes();
    if (!walls.length) return null;
    var nd = getNDC(e);
    mouse2.set(nd.x, nd.y);
    raycaster.setFromCamera(mouse2, opts.camera);
    var hits = raycaster.intersectObjects(walls, false);
    return hits.length ? hits[0].object : null;
  }

  function isElevationActive() {
    return !!(opts.isElevationActive && opts.isElevationActive());
  }

  function isTopView() {
    return !!(opts.isTopView && opts.isTopView());
  }

  /** Top view behaves like 2D: drag furniture without the Move tool. */
  function isTopPlacementView() {
    if (!isTopView() || moveMode || paintMode || isElevationActive()) return false;
    if (sidePickMode) return false;
    if (opts.isSideRoomPickActive && opts.isSideRoomPickActive()) return false;
    if (opts.isSidePanelOpen && opts.isSidePanelOpen()) return false;
    return true;
  }

  function canDragFurniture() {
    return moveMode || isTopPlacementView();
  }

  function setControlsForDrag(on) {
    if (moveMode) return;
    if (!isTopPlacementView() && !on) return;
    opts.controls.enabled = !on;
  }

  function isRoomPickActive() {
    if (isElevationActive()) return false;
    if (moveMode || paintMode) return false;
    if (opts.isSideRoomPickActive) return opts.isSideRoomPickActive();
    if (sidePickMode) return true;
    return !!(opts.isSidePanelOpen && opts.isSidePanelOpen());
  }

  function selectGroup(grp) {
    selected = grp;
    getFurnitureWorldBox(grp, _selectedBox);
    boxHelper.visible = true;
    document.body.classList.add("view3d-has-selection");
  }

  function deselect() {
    selected = null;
    boxHelper.visible = false;
    document.body.classList.remove("view3d-has-selection");
    if (opts.onFurnitureDeselect) opts.onFurnitureDeselect();
  }

  function onPointerDown(e) {
    if (!canDragFurniture() || e.button !== 0) return;
    var grp = pickFurniture(e);
    if (!grp) return;
    var fp = floorHit(e, 0);
    if (!fp) return;
    dragOX = grp.position.x - fp.x;
    dragOZ = grp.position.z - fp.z;
    if (isElevationActive()) {
      var wall = opts.getElevationWall ? opts.getElevationWall() : null;
      if (wall && wall.panAxis === "z") dragOX = 0;
      else if (wall && wall.panAxis === "x") dragOZ = 0;
    }
    dragTarget = grp;
    isDragging = true;
    lastDragSyncT = performance.now();
    selectGroup(grp);
    if (opts.onFurnitureSelect) opts.onFurnitureSelect(grp);
    setControlsForDrag(true);
    document.body.classList.add("view3d-dragging");
    dom.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  }

  function onPointerMove(e) {
    if (isElevationActive() && !canDragFurniture()) return;
    if (canDragFurniture() && isDragging && dragTarget) {
      var fp = floorHit(e, 0);
      if (!fp) return;
      constrainElevationDragPoint(fp, dragTarget);
      var item = dragTarget.userData.furnitureItem;
      if (!item) return;
      var r = resolvePosition3D(
        dragTarget,
        fp.x + dragOX,
        fp.z + dragOZ,
        opts.bounds,
        opts.getFurnitureGroups()
      );
      dragTarget.position.set(r.x, dragTarget.position.y, r.z);
      applyWorldPositionToItem(
        dragTarget,
        item,
        r.x,
        r.z,
        opts.wReal,
        opts.hReal,
        opts.rooms,
        opts.getFurnitureItems ? opts.getFurnitureItems() : null
      );
      getFurnitureWorldBox(dragTarget, _selectedBox);
      if (opts.onFurnitureMoved) opts.onFurnitureMoved(item);
      // onFurnitureSelect drives the measurement-overlay/toolbar DOM refresh —
      // real work (position, snapping, box helper) above stays unthrottled,
      // but pointermove can fire far faster than the display refreshes, so
      // rebuilding overlay DOM on every single tick was the biggest source of
      // drag jank. 60ms (~16/s) keeps it visually live without the thrash.
      var dragNowT = performance.now();
      if (opts.onFurnitureSelect && dragNowT - lastDragSyncT >= 60) {
        lastDragSyncT = dragNowT;
        opts.onFurnitureSelect(dragTarget);
      }
      return;
    }

    // Everything below is hover feedback (cursor, tooltips). Raycasting GLB
    // furniture is expensive, so skip it while the camera is being orbited or
    // panned (a button is held), and throttle it — pointermove can fire far
    // faster than the frame rate.
    if (e.buttons) return;
    var nowT = performance.now();
    if (nowT - lastHoverPickT < 30) return;
    lastHoverPickT = nowT;

    if (paintMode) {
      var wallHover = pickWallSegment(e);
      if (wallHover) {
        dom.style.cursor = "pointer";
        return;
      }
      var roomPaintHover = pickRoom(e);
      dom.style.cursor = roomPaintHover ? "pointer" : "crosshair";
      return;
    }

    if (isRoomPickActive()) {
      var roomSide = pickRoom(e);
      if (roomSide) {
        dom.style.cursor = "pointer";
        if (opts.onRoomHover) opts.onRoomHover(roomSide, e);
      } else {
        dom.style.cursor = "crosshair";
        if (opts.onRoomHoverEnd) opts.onRoomHoverEnd();
      }
      return;
    }

    var grpHover = pickFurniture(e);
    if (grpHover && opts.onFurnitureHover) {
      dom.style.cursor = canDragFurniture() ? "grab" : "pointer";
      opts.onFurnitureHover(grpHover, e);
    } else {
      if (opts.onFurnitureHoverEnd) opts.onFurnitureHoverEnd();
      var roomGen = pickRoom(e);
      if (roomGen && opts.onRoomHoverGeneral) {
        dom.style.cursor = "pointer";
        opts.onRoomHoverGeneral(roomGen, e);
      } else {
        dom.style.cursor = canDragFurniture() ? "grab" : "";
        if (opts.onRoomHoverGeneralEnd) opts.onRoomHoverGeneralEnd();
      }
    }
  }

  function onPointerUp(e) {
    if (!canDragFurniture() || !isDragging) return;
    isDragging = false;
    dragTarget = null;
    setControlsForDrag(false);
    document.body.classList.remove("view3d-dragging");
    try {
      dom.releasePointerCapture(e.pointerId);
    } catch (_err) {
      /* ignore */
    }
  }

  function onClick(e) {
    if (isElevationActive() && !canDragFurniture()) return;
    if (moveMode || isTopPlacementView()) return;
    if (paintMode) {
      var wallMesh = pickWallSegment(e);
      if (wallMesh && opts.onWallPaint) {
        opts.onWallPaint(wallMesh.userData.segmentKey);
        return;
      }
      var roomPaint = pickRoom(e);
      if (roomPaint && opts.onRoomPaint) {
        opts.onRoomPaint(roomPaint);
        return;
      }
      return;
    }
    if (isRoomPickActive()) {
      var room = pickRoom(e);
      if (room && opts.onRoomSelected) {
        opts.onRoomSelected(room);
        return;
      }
      if (sidePickMode) return;
    }
    var grp = pickFurniture(e);
    if (grp) {
      selectGroup(grp);
      if (opts.onFurnitureSelect) opts.onFurnitureSelect(grp);
    } else deselect();
  }

  dom.addEventListener("pointerdown", onPointerDown);
  dom.addEventListener("pointermove", onPointerMove);
  dom.addEventListener("pointerup", onPointerUp);
  dom.addEventListener("pointercancel", onPointerUp);
  dom.addEventListener("click", onClick);

  opts.controls.addEventListener("start", function () {
    if (moveMode) return;
  });

  return {
    enterMoveMode: function () {
      moveMode = true;
      opts.controls.enabled = false;
      document.body.classList.add("view3d-move-mode");
    },
    exitMoveMode: function () {
      moveMode = false;
      isDragging = false;
      dragTarget = null;
      opts.controls.enabled = true;
      document.body.classList.remove("view3d-move-mode", "view3d-dragging");
    },
    enterPaintMode: function () {
      paintMode = true;
      deselect();
      document.body.classList.add("view3d-paint-mode");
    },
    exitPaintMode: function () {
      paintMode = false;
      document.body.classList.remove("view3d-paint-mode");
      dom.style.cursor = "";
    },
    isPaintMode: function () {
      return paintMode;
    },
    isMoveMode: function () {
      return moveMode;
    },
    isDragging: function () {
      return isDragging;
    },
    isTopPlacementView: isTopPlacementView,
    setSidePickMode: function (on) {
      sidePickMode = !!on;
      document.body.classList.toggle("view3d-side-pick-mode", sidePickMode);
      if (sidePickMode) deselect();
    },
    isSidePickMode: function () {
      return sidePickMode;
    },
    getSelected: function () {
      return selected;
    },
    selectGroup: function (grp) {
      if (!grp) {
        deselect();
        return;
      }
      selectGroup(grp);
      if (opts.onFurnitureSelect) opts.onFurnitureSelect(grp);
    },
    selectByItemId: function (itemId) {
      if (!itemId) {
        deselect();
        return;
      }
      var found = null;
      opts.getFurnitureGroups().forEach(function (g) {
        if (g.userData.furnitureItem && g.userData.furnitureItem.id === itemId) found = g;
      });
      if (found) {
        selectGroup(found);
        if (opts.onFurnitureSelect) opts.onFurnitureSelect(found);
      }
    },
    deselect: deselect,
    updateHelper: function () {
      if (selected) getFurnitureWorldBox(selected, _selectedBox);
    },
    dispose: function () {
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("pointercancel", onPointerUp);
      dom.removeEventListener("click", onClick);
      opts.scene.remove(boxHelper);
      boxHelper.geometry.dispose();
      deselect();
      dom.style.cursor = "";
      document.body.classList.remove(
        "view3d-move-mode",
        "view3d-dragging",
        "view3d-has-selection",
        "view3d-side-pick-mode",
        "view3d-paint-mode"
      );
    },
  };
}
