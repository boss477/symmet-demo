import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import {
  computeBoundsTree,
  disposeBoundsTree,
  acceleratedRaycast,
} from "three-mesh-bvh";
import { LIVING_ROOM_DEMO_GLB_URL } from "../lib/glbDemoSofa.js";

// BVH-accelerated raycasting: O(log n) triangle picking on high-poly GLBs.
// acceleratedRaycast falls back to three's default for geometries without a
// boundsTree, so walls/floors/primitives are unaffected.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

/** Improve texture quality for small details like paintings by applying anisotropic filtering. */
function improveTextureQuality(root) {
  root.traverse(function (obj) {
    if (!obj.isMesh || !obj.material) return;
    var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(function (mat) {
      for (var key in mat) {
        if (mat[key] && mat[key].isTexture) {
          var tex = mat[key];
          tex.anisotropy = Math.max(tex.anisotropy || 1, 8);
          if (tex.minFilter === THREE.LinearFilter) {
            tex.minFilter = THREE.LinearMipmapLinearFilter;
          }
        }
      }
    });
  });
}

/** Build a BVH per unique geometry; clones share geometry, so all instances benefit. */
function buildBoundsTrees(root) {
  root.traverse(function (obj) {
    if (obj.isMesh && obj.geometry && !obj.geometry.boundsTree) {
      try {
        obj.geometry.computeBoundsTree();
      } catch (err) {
        console.warn("[plan3d] BVH build skipped:", err && err.message ? err.message : err);
      }
    }
  });
}

/** Default demo sofa GLB served from /public/models. */
export var DEFAULT_SOFA_GLB_URL = LIVING_ROOM_DEMO_GLB_URL;

/** Max GLB templates kept in memory; least-recently-used is evicted past this. */
var MAX_TEMPLATES = 15;

/** @type {Map<string, THREE.Object3D>} insertion order doubles as LRU order (oldest first) */
var templates = new Map();
/** @type {Map<string, Promise<THREE.Object3D>>} */
var loadPromises = new Map();

function disposeTemplate(template) {
  template.traverse(function (obj) {
    if (obj.geometry && obj.geometry.boundsTree) obj.geometry.disposeBoundsTree();
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(function (m) {
        for (var key in m) {
          if (m[key] && m[key].isTexture) m[key].dispose();
        }
        m.dispose();
      });
    }
  });
}

/** Re-insert to mark as most recently used. */
function touchTemplate(src) {
  var template = templates.get(src);
  if (template === undefined) return undefined;
  templates.delete(src);
  templates.set(src, template);
  return template;
}

function evictOverLimit() {
  while (templates.size > MAX_TEMPLATES) {
    var oldestSrc = templates.keys().next().value;
    disposeTemplate(templates.get(oldestSrc));
    templates.delete(oldestSrc);
  }
}

function enableShadows(root) {
  root.traverse(function (obj) {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
}

/**
 * Fit an arbitrary GLB clone to the catalog's measured W x D x H metres.
 * Source GLBs are not consistently authored to real scale, so preserve the
 * product's measured footprint over the model file's original proportions.
 *
 * @param {THREE.Object3D} model
 * @param {number} wM catalog width in metres (local X)
 * @param {number} dM catalog depth in metres (local Z)
 * @param {number} hM catalog height in metres (local Y)
 * @returns {THREE.Object3D}
 */
export function fitObjectToMeasuredBox(model, wM, dM, hM) {
  var box = new THREE.Box3().setFromObject(model);
  var size = new THREE.Vector3();
  box.getSize(size);
  if (size.x < 1e-6 || size.y < 1e-6 || size.z < 1e-6) return model;

  model.scale.x *= wM / size.x;
  model.scale.y *= hM / size.y;
  model.scale.z *= dM / size.z;

  box.setFromObject(model);
  var center = new THREE.Vector3();
  box.getCenter(center);
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  return model;
}

/**
 * Preload a sofa GLB once per URL.
 * @param {string} [url]
 * @returns {Promise<THREE.Object3D>}
 */
export function preloadDefaultSofaGlb(url) {
  var src = url || DEFAULT_SOFA_GLB_URL;
  if (templates.has(src)) return Promise.resolve(touchTemplate(src));
  if (loadPromises.has(src)) return loadPromises.get(src);

  var promise = new Promise(function (resolve, reject) {
    var dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("/draco/");
    var loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    loader.load(
      src,
      function (gltf) {
        enableShadows(gltf.scene);
        improveTextureQuality(gltf.scene);
        buildBoundsTrees(gltf.scene);
        templates.set(src, gltf.scene);
        evictOverLimit();
        loadPromises.delete(src);
        resolve(gltf.scene);
      },
      undefined,
      function (err) {
        loadPromises.delete(src);
        console.warn("[plan3d] GLB load failed:", src, err && err.message ? err.message : err);
        reject(err);
      }
    );
  });
  loadPromises.set(src, promise);
  return promise;
}

export function isSofaTypeStr(typeStr) {
  var t = String(typeStr || "").toLowerCase();
  return (
    t.indexOf("sofa") >= 0 ||
    t.indexOf("lounge") >= 0 ||
    t.indexOf("sectional") >= 0 ||
    t.indexOf("apartment_living_sofa") >= 0
  );
}

/**
 * Clone a sofa GLB, scaled to w×d×h (metres) with base on y=0.
 * @param {number} wM
 * @param {number} dM
 * @param {number} hM
 * @param {string} [url]
 * @returns {THREE.Object3D|null}
 */
export function createDefaultSofaInstance(wM, dM, hM, url) {
  var src = url || DEFAULT_SOFA_GLB_URL;
  var sofaTemplate = touchTemplate(src);
  if (!sofaTemplate) return null;
  var model = sofaTemplate.clone(true);
  enableShadows(model);
  // Fit to the catalog's measured W x D x H so a 2-seat sofa reads as a 2-seat
  // sofa and a chair keeps its real proportions — source GLBs are not authored
  // to a consistent scale, so uniform (min) scaling let bad proportions win.
  return fitObjectToMeasuredBox(model, wM, dM, hM);
}

export function disposeDefaultSofaGlb() {
  templates.forEach(function (sofaTemplate) {
    disposeTemplate(sofaTemplate);
  });
  templates.clear();
  loadPromises.clear();
}
