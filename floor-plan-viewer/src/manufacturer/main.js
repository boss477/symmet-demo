import { mountPortal } from "./portal.js";

mountPortal("portal-root").catch(function (err) {
  document.getElementById("portal-root").textContent = "Portal error: " + (err.message || err);
});
