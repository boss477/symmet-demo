/**
 * GLB scaling must honor catalog measurements exactly.
 * Run: node --test scripts/plan3d-glb-scale.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { fitObjectToMeasuredBox } from "../src/viewer/plan3dGlb.js";

function measuredSize(root) {
  var box = new THREE.Box3().setFromObject(root);
  var size = new THREE.Vector3();
  box.getSize(size);
  return { x: size.x, y: size.y, z: size.z, minY: box.min.y };
}

describe("fitObjectToMeasuredBox", function () {
  it("scales non-uniform source models to exact catalog W x H x D metres", function () {
    var root = new THREE.Group();
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 0.5));
    mesh.position.set(3, 2, -5);
    root.add(mesh);

    fitObjectToMeasuredBox(root, 1.6, 0.9, 0.75);

    var size = measuredSize(root);
    assert.ok(Math.abs(size.x - 1.6) < 1e-9, "width");
    assert.ok(Math.abs(size.y - 0.75) < 1e-9, "height");
    assert.ok(Math.abs(size.z - 0.9) < 1e-9, "depth");
    assert.ok(Math.abs(size.minY) < 1e-9, "base sits on floor");
  });
});
