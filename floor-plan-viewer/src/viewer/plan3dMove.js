import * as THREE from "three";
import { constrainFurnitureMove } from "../lib/furnitureBounds.js";
import { normToWorld, worldToNorm } from "../lib/coordinates.js";

var SNAP_D = 0.18;

var _localBoxTmpPos = new THREE.Vector3();
var _localBoxTmpQuat = new THREE.Quaternion();
var _localBoxTmpScale = new THREE.Vector3();
var _otherWorldBox = new THREE.Box3();

/**
 * Drop a furniture group's cached local-space bounding box, e.g. after its
 * meshes are swapped (GLB finishes loading, catalog swap) so the next
 * getFurnitureWorldBox() call re-measures instead of using stale geometry.
 * @param {THREE.Group} group
 */
export function invalidateFurnitureBox(group) {
  if (group && group.userData) group.userData._localBox = null;
}

function getLocalBox(group) {
  var cached = group.userData._localBox;
  if (cached) return cached;
  // Box3.setFromObject walks every mesh's geometry, which is O(vertices) —
  // too slow to redo every pointermove for every other piece of furniture in
  // the room. Measure once in the group's own untransformed space, cache it,
  // and re-derive the world box on demand by transforming its corners
  // through matrixWorld (cheap) instead of re-walking geometry.
  _localBoxTmpPos.copy(group.position);
  _localBoxTmpQuat.copy(group.quaternion);
  _localBoxTmpScale.copy(group.scale);
  group.position.set(0, 0, 0);
  group.quaternion.identity();
  group.scale.set(1, 1, 1);
  group.updateMatrixWorld(true);
  var box = new THREE.Box3().setFromObject(group);
  group.position.copy(_localBoxTmpPos);
  group.quaternion.copy(_localBoxTmpQuat);
  group.scale.copy(_localBoxTmpScale);
  group.updateMatrixWorld(true);
  group.userData._localBox = box;
  return box;
}

/**
 * World-space AABB for a furniture group, backed by the cached local box.
 * @param {THREE.Group} group
 * @param {THREE.Box3} [target]
 */
export function getFurnitureWorldBox(group, target) {
  var out = target || new THREE.Box3();
  var local = getLocalBox(group);
  if (local.isEmpty()) return out.makeEmpty();
  group.updateMatrixWorld();
  return out.copy(local).applyMatrix4(group.matrixWorld);
}

/**
 * @param {THREE.Group} group
 * @param {number} rawX
 * @param {number} rawZ
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} bounds
 * @param {THREE.Group[]} furnitureGroups
 */
export function resolvePosition3D(group, rawX, rawZ, bounds, furnitureGroups) {
  var box = getFurnitureWorldBox(group);
  var hw = (box.max.x - box.min.x) / 2;
  var hd = (box.max.z - box.min.z) / 2;
  var offX = group.position.x - (box.min.x + hw);
  var offZ = group.position.z - (box.min.z + hd);
  var cx = rawX;
  var cz = rawZ;

  var wallL = bounds.minX;
  var wallR = bounds.maxX;
  var wallB = bounds.minZ;
  var wallF = bounds.maxZ;

  cx = Math.max(wallL + hw + offX, Math.min(wallR - hw + offX, cx));
  cz = Math.max(wallB + hd + offZ, Math.min(wallF - hd + offZ, cz));

  var minX = cx - offX - hw;
  var maxX = cx - offX + hw;
  var minZ = cz - offZ - hd;
  var maxZ = cz - offZ + hd;

  if (Math.abs(minX - wallL) < SNAP_D) cx += wallL - minX;
  if (Math.abs(maxX - wallR) < SNAP_D) cx += wallR - maxX;
  if (Math.abs(minZ - wallB) < SNAP_D) cz += wallB - minZ;
  if (Math.abs(maxZ - wallF) < SNAP_D) cz += wallF - maxZ;

  (furnitureGroups || []).forEach(function (other) {
    if (other === group) return;
    var ob = getFurnitureWorldBox(other, _otherWorldBox);
    var oX = Math.min(cx - offX + hw, ob.max.x) - Math.max(cx - offX - hw, ob.min.x);
    var oZ = Math.min(cz - offZ + hd, ob.max.z) - Math.max(cz - offZ - hd, ob.min.z);
    if (oX > 0 && oZ > 0) {
      if (oX < oZ) {
        if (cx < (ob.min.x + ob.max.x) / 2) cx -= oX;
        else cx += oX;
      } else {
        if (cz < (ob.min.z + ob.max.z) / 2) cz -= oZ;
        else cz += oZ;
      }
    }
  });

  return { x: cx, z: cz };
}

/**
 * @param {THREE.Group} group
 * @param {object} item
 * @param {number} wReal
 * @param {number} hReal
 * @param {Array} rooms
 * @param {Array} furniture
 */
export function syncGroupFromItem(group, item, wReal, hReal, rooms, furniture) {
  var prevX = item.x;
  var prevY = item.y;
  var w = normToWorld({ x: item.x, y: item.y }, wReal, hReal);
  group.position.set(w.x, item.z || 0, w.z);
  constrainFurnitureMove(item, rooms, prevX, prevY, furniture);
  var w2 = normToWorld({ x: item.x, y: item.y }, wReal, hReal);
  group.position.set(w2.x, item.z || 0, w2.z);
}

/**
 * @param {THREE.Group} group
 * @param {object} item
 * @param {number} wx
 * @param {number} wz
 * @param {number} wReal
 * @param {number} hReal
 * @param {Array} rooms
 * @param {Array} furniture
 */
export function applyWorldPositionToItem(group, item, wx, wz, wReal, hReal, rooms, furniture) {
  var prevX = item.x;
  var prevY = item.y;
  var norm = worldToNorm(wx, wz, wReal, hReal);
  item.x = norm.x;
  item.y = norm.y;
  if (!constrainFurnitureMove(item, rooms, prevX, prevY, furniture)) {
    var w = normToWorld({ x: item.x, y: item.y }, wReal, hReal);
    group.position.set(w.x, item.z || 0, w.z);
    return false;
  }
  return true;
}
