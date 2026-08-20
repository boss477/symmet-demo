import * as THREE from "three";

/** @typedef {{ eyeHeight: number, panAlong: number, distance: number }} ElevationState */

var EYE_MIN = 0.9;
var EYE_MAX = 2.25;
var EYE_DEFAULT = 1.55;

var memory = {};

function wallPad(span) {
  return Math.max(span * 0.02, 0.05);
}

function defaultInset(span) {
  return Math.max(span * 0.12, 0.35);
}

function panLimit(span) {
  return Math.max(span * 0.38, 0.5);
}

/**
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number, centerX: number, centerZ: number, span: number }} bounds
 * @returns {Array<{ label: string, wallIndex: number } & Record<string, unknown>>}
 */
export function buildRoomWallElevations(bounds) {
  var span = bounds.span;
  var wp = wallPad(span);
  var inset = defaultInset(span);
  var panLim = panLimit(span);
  return [
    {
      label: "Side A",
      wallIndex: 0,
      panAxis: "z",
      panCenter: bounds.centerZ,
      panMin: bounds.centerZ - panLim,
      panMax: bounds.centerZ + panLim,
      camX: function (d) {
        return bounds.maxX - d;
      },
      lookX: bounds.minX + wp,
      fixedLookX: true,
    },
    {
      label: "Side B",
      wallIndex: 1,
      panAxis: "z",
      panCenter: bounds.centerZ,
      panMin: bounds.centerZ - panLim,
      panMax: bounds.centerZ + panLim,
      camX: function (d) {
        return bounds.minX + d;
      },
      lookX: bounds.maxX - wp,
      fixedLookX: true,
    },
    {
      label: "Side C",
      wallIndex: 2,
      panAxis: "x",
      panCenter: bounds.centerX,
      panMin: bounds.centerX - panLim,
      panMax: bounds.centerX + panLim,
      camZ: function (d) {
        return bounds.maxZ - d;
      },
      lookZ: bounds.minZ + wp,
      fixedLookZ: true,
    },
    {
      label: "Side D",
      wallIndex: 3,
      panAxis: "x",
      panCenter: bounds.centerX,
      panMin: bounds.centerX - panLim,
      panMax: bounds.centerX + panLim,
      camZ: function (d) {
        return bounds.minZ + d;
      },
      lookZ: bounds.maxZ - wp,
      fixedLookZ: true,
    },
  ];
}

/**
 * @param {{ span: number }} bounds
 * @param {ReturnType<typeof buildRoomWallElevations>[number]} wall
 * @param {Partial<ElevationState>} [overrides]
 * @returns {ElevationState}
 */
export function defaultElevationState(bounds, wall, overrides) {
  var inset = defaultInset(bounds.span);
  var state = {
    eyeHeight: EYE_DEFAULT,
    panAlong: 0,
    distance: inset,
  };
  if (overrides) {
    if (overrides.eyeHeight != null) state.eyeHeight = overrides.eyeHeight;
    if (overrides.panAlong != null) state.panAlong = overrides.panAlong;
    if (overrides.distance != null) state.distance = overrides.distance;
  }
  return clampElevationState(bounds, wall, state);
}

/**
 * @param {{ span: number }} bounds
 * @param {ReturnType<typeof buildRoomWallElevations>[number]} wall
 * @param {ElevationState} state
 * @returns {ElevationState}
 */
export function clampElevationState(bounds, wall, state) {
  var span = bounds.span;
  var minDist = Math.max(span * 0.08, 0.22);
  var maxDist = Math.max(span * 0.42, 0.85);
  var pan = wall.panCenter + state.panAlong;
  pan = Math.max(wall.panMin, Math.min(wall.panMax, pan));
  return {
    eyeHeight: Math.max(EYE_MIN, Math.min(EYE_MAX, state.eyeHeight)),
    panAlong: pan - wall.panCenter,
    distance: Math.max(minDist, Math.min(maxDist, state.distance)),
  };
}

/**
 * @param {ReturnType<typeof buildRoomWallElevations>[number]} wall
 * @param {ElevationState} state
 * @returns {{ pos: THREE.Vector3, look: THREE.Vector3 }}
 */
export function elevationCameraVectors(wall, state) {
  var eyeY = state.eyeHeight;
  var lookY = Math.max(0.35, eyeY - 0.2);
  var pan = wall.panCenter + state.panAlong;
  var d = state.distance;
  var pos;
  var look;

  if (wall.fixedLookX) {
    pos = new THREE.Vector3(wall.camX(d), eyeY, pan);
    look = new THREE.Vector3(wall.lookX, lookY, pan);
  } else {
    pos = new THREE.Vector3(pan, eyeY, wall.camZ(d));
    look = new THREE.Vector3(pan, lookY, wall.lookZ);
  }
  return { pos: pos, look: look };
}

/**
 * Legacy shape for thumbnails: { label, pos: number[], look: number[] }
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number, centerX: number, centerZ: number, span: number }} bounds
 * @returns {Array<{ label: string, pos: number[], look: number[] }>}
 */
export function getRoomSideViews(bounds) {
  var walls = buildRoomWallElevations(bounds);
  return walls.map(function (wall) {
    var st = defaultElevationState(bounds, wall);
    var v = elevationCameraVectors(wall, st);
    return {
      label: wall.label,
      pos: [v.pos.x, v.pos.y, v.pos.z],
      look: [v.look.x, v.look.y, v.look.z],
    };
  });
}

/**
 * @param {string} roomKey
 * @param {number} wallIndex
 * @returns {Partial<ElevationState> | null}
 */
export function loadElevationMemory(roomKey, wallIndex) {
  var key = roomKey + ":" + wallIndex;
  return memory[key] ? Object.assign({}, memory[key]) : null;
}

/**
 * @param {string} roomKey
 * @param {number} wallIndex
 * @param {ElevationState} state
 */
export function saveElevationMemory(roomKey, wallIndex, state) {
  memory[keyFor(roomKey, wallIndex)] = {
    eyeHeight: state.eyeHeight,
    panAlong: state.panAlong,
    distance: state.distance,
  };
}

function keyFor(roomKey, wallIndex) {
  return roomKey + ":" + wallIndex;
}

export function clearElevationMemory() {
  memory = {};
}

/**
 * @param {object} room
 * @returns {string}
 */
export function elevationRoomKey(room) {
  return String(room.id || room.name || "room");
}
