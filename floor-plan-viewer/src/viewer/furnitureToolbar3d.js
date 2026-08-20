/** Floating pill toolbar for selected furniture in 3D view. */

import * as THREE from "three";
import { getFurnitureWorldBox } from "./plan3dMove.js";

var ACTIONS = [
  { id: "bag", label: "Add to bag", title: "Add selected item to bag" },
  { id: "rotate", label: "Rotate", title: "Rotate 5°" },
  { id: "replace", label: "Replace", title: "Replace with catalog SKU" },
  { id: "copy", label: "Make copy", title: "Duplicate selection" },
  { id: "remove", label: "Remove", title: "Delete selected items" },
];

/**
 * @param {HTMLElement} container
 * @param {{ onAction?: (actionId: string) => void }} callbacks
 */
export function createFurnitureToolbar3d(container, callbacks) {
  var root = document.createElement("div");
  root.id = "view3d-furniture-toolbar";
  root.hidden = true;
  root.setAttribute("role", "toolbar");
  root.setAttribute("aria-label", "Furniture actions");

  var bar = document.createElement("div");
  bar.className = "view3d-furniture-bar";

  ACTIONS.forEach(function (action, index) {
    if (index > 0) {
      var sep = document.createElement("span");
      sep.className = "view3d-sep";
      bar.appendChild(sep);
    }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "view3d-btn view3d-furniture-btn";
    btn.dataset.action = action.id;
    btn.textContent = action.label;
    btn.title = action.title;
    if (action.id === "remove") btn.classList.add("view3d-furniture-btn--danger");
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (callbacks && callbacks.onAction) callbacks.onAction(action.id);
    });
    bar.appendChild(btn);
  });

  function dismissToolbar(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }
    if (callbacks && callbacks.onClose) callbacks.onClose();
  }

  var closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "view3d-btn view3d-furniture-close";
  closeBtn.setAttribute("aria-label", "Close toolbar");
  closeBtn.title = "Close";
  closeBtn.textContent = "\u00d7";
  closeBtn.addEventListener("pointerdown", dismissToolbar);
  closeBtn.addEventListener("click", dismissToolbar);
  bar.appendChild(closeBtn);

  ["pointerdown", "mousedown", "click"].forEach(function (type) {
    bar.addEventListener(
      type,
      function (e) {
        e.stopPropagation();
      },
      false
    );
  });

  root.appendChild(bar);
  container.appendChild(root);

  var activeGroup = null;
  var _vec = new THREE.Vector3();
  var _box = new THREE.Box3();

  return {
    el: root,
    show: function (group) {
      activeGroup = group;
      root.hidden = false;
    },
    hide: function () {
      activeGroup = null;
      root.hidden = true;
    },
    getActiveGroup: function () {
      return activeGroup;
    },
    updatePosition: function (group, camera, dom) {
      var target = group || activeGroup;
      if (!target || root.hidden || !camera || !dom) return;
      var box = getFurnitureWorldBox(target, _box);
      _vec.set((box.min.x + box.max.x) / 2, box.max.y + 0.14, (box.min.z + box.max.z) / 2);
      _vec.project(camera);
      if (_vec.z > 1) {
        root.hidden = true;
        return;
      }
      root.hidden = false;
      var w = dom.clientWidth;
      var h = dom.clientHeight;
      var x = (_vec.x * 0.5 + 0.5) * w;
      var y = (-_vec.y * 0.5 + 0.5) * h - 12;
      root.style.left = x + "px";
      root.style.top = y + "px";
    },
  };
}
