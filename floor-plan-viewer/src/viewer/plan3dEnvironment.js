import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

var _envRT = null;

/**
 * Image-based lighting from a procedural studio environment (no HDR download).
 * Gives PBR materials realistic ambient light + reflections.
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {number} [intensity]
 */
export function applyEnvironment(renderer, scene, intensity) {
  disposeEnvironment(scene);
  var pmrem = new THREE.PMREMGenerator(renderer);
  var envScene = new RoomEnvironment();
  _envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = _envRT.texture;
  if ("environmentIntensity" in scene) {
    scene.environmentIntensity = intensity != null ? intensity : 0.45;
  }
  if (envScene.dispose) envScene.dispose();
  pmrem.dispose();
}

/** @param {THREE.Scene} [scene] */
export function disposeEnvironment(scene) {
  if (scene) scene.environment = null;
  if (_envRT) {
    _envRT.dispose();
    _envRT = null;
  }
}
