import { ensureShareToken, publishProject } from "../services/projectShare.js";
import { buildShareUrl } from "../lib/shareLink.js";

function currentProjectId() {
  return (window.location.hash || "").replace(/^#/, "").trim();
}

function whatsappHref(text) {
  return "https://wa.me/?text=" + encodeURIComponent(text);
}

/** Mount "Share link" and "Publish" buttons into the given toolbar element. */
export function mountShareControls(toolbarEl) {
  var row = document.createElement("div");
  row.className = "share-controls";
  var label = document.createElement("span");
  label.className = "toolbar-command-group__label";
  label.textContent = "Output";
  row.appendChild(label);

  var shareBtn = document.createElement("button");
  shareBtn.type = "button";
  shareBtn.textContent = "Share link";
  var publishBtn = document.createElement("button");
  publishBtn.type = "button";
  publishBtn.textContent = "Publish";

  shareBtn.addEventListener("click", async function () {
    var pid = currentProjectId();
    if (!pid) { alert("Save the project first (it needs an ID)."); return; }
    shareBtn.disabled = true;
    try {
      var token = await ensureShareToken(pid);
      var url = buildShareUrl(token, window.location.origin);
      try { await navigator.clipboard.writeText(url); } catch (e) {}
      window.open(whatsappHref("View my 3D home design: " + url), "_blank");
    } catch (err) { alert("Share failed: " + (err.message || err)); }
    finally { shareBtn.disabled = false; }
  });

  publishBtn.addEventListener("click", async function () {
    var pid = currentProjectId();
    if (!pid) { alert("Save the project first (it needs an ID)."); return; }
    var title = window.prompt("Title for the public gallery:", "My home design");
    if (title == null) return;
    publishBtn.disabled = true;
    try {
      var token = await publishProject(pid, { title: title });
      var url = buildShareUrl(token, window.location.origin);
      alert("Published to the gallery.\nShare link: " + url);
    } catch (err) { alert("Publish failed: " + (err.message || err)); }
    finally { publishBtn.disabled = false; }
  });

  row.appendChild(shareBtn);
  row.appendChild(publishBtn);
  toolbarEl.appendChild(row);
}
