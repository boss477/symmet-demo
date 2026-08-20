/**
 * Headless top-down PNG bake from GLB URL (Node + headless-gl).
 */
import "./node-three-polyfill.mjs";
import createGL from "gl";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PNG } from "pngjs";

const DEFAULT_H_MM = 850;

function loadGlbFromUrl(url) {
  return fetch(url)
    .then(function (res) {
      if (!res.ok) throw new Error("GLB fetch failed " + res.status + " " + url);
      return res.arrayBuffer();
    })
    .then(function (buffer) {
      return new Promise(function (resolve, reject) {
        var loader = new GLTFLoader();
        loader.parse(
          buffer,
          "",
          function (gltf) {
            gltf.scene.traverse(function (obj) {
              if (obj.isMesh) {
                obj.material = new THREE.MeshStandardMaterial({
                  color: 0x6b7280,
                  roughness: 0.85,
                  metalness: 0.05,
                });
              }
            });
            resolve(gltf.scene);
          },
          reject
        );
      });
    });
}

function scaleModelToMetres(model, wM, dM, hM) {
  var box = new THREE.Box3().setFromObject(model);
  var size = new THREE.Vector3();
  box.getSize(size);
  if (size.x < 1e-6 || size.y < 1e-6 || size.z < 1e-6) return model;
  var sx = wM / size.x;
  var sy = hM / size.y;
  var sz = dM / size.z;
  var scale = Math.min(sx, sy, sz);
  model.scale.setScalar(scale);
  box.setFromObject(model);
  var center = new THREE.Vector3();
  box.getCenter(center);
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
  return model;
}

function disposeObject3D(root) {
  root.traverse(function (obj) {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(function (m) {
        m.dispose();
      });
      else obj.material.dispose();
    }
  });
}

/**
 * @param {string} glbUrl
 * @param {{ widthMm?: number, depthMm?: number, heightMm?: number, sizePx?: number }} dims
 * @returns {Promise<Buffer>}
 */
export async function bakeGlbTopDownPng(glbUrl, dims) {
  dims = dims || {};
  var wM = (dims.widthMm != null ? dims.widthMm : 2200) / 1000;
  var dM = (dims.depthMm != null ? dims.depthMm : 950) / 1000;
  var hM = (dims.heightMm != null ? dims.heightMm : DEFAULT_H_MM) / 1000;
  var sizePx = dims.sizePx || 512;

  var template = await loadGlbFromUrl(glbUrl);
  var model = template.clone(true);
  scaleModelToMetres(model, wM, dM, hM);

  var width = sizePx;
  var height = sizePx;
  var context = createGL(width, height, { preserveDrawingBuffer: true });
  var canvas = {
    width: width,
    height: height,
    style: {},
    clientWidth: width,
    clientHeight: height,
    addEventListener: function () {},
    removeEventListener: function () {},
    getContext: function (type) {
      if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") return context;
      return null;
    },
  };
  var renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    context: context,
    antialias: true,
    alpha: true,
  });
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);

  var scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 0.85));
  var dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(3, 8, 2);
  scene.add(dir);
  scene.add(model);

  var span = Math.max(wM, dM) * 1.2;
  var camera = new THREE.OrthographicCamera(-span / 2, span / 2, span / 2, -span / 2, 0.05, 40);
  camera.position.set(0, 12, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);

  var pixels = new Uint8Array(width * height * 4);
  context.readPixels(0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, pixels);

  var png = new PNG({ width: width, height: height });
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var src = ((height - y - 1) * width + x) * 4;
      var dst = (y * width + x) * 4;
      png.data[dst] = pixels[src];
      png.data[dst + 1] = pixels[src + 1];
      png.data[dst + 2] = pixels[src + 2];
      png.data[dst + 3] = pixels[src + 3];
    }
  }

  renderer.dispose();
  disposeObject3D(model);
  disposeObject3D(template);

  return PNG.sync.write(png);
}
