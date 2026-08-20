import { listPublished } from "../services/projectShare.js";
import { buildShareUrl } from "../lib/shareLink.js";

var root = document.getElementById("gallery-root");

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function renderCard(project) {
  var a = document.createElement("a");
  a.className = "card";
  a.href = buildShareUrl(project.share_token, window.location.origin);

  var cover;
  if (project.cover_image_url) {
    cover = document.createElement("img");
    cover.className = "card__cover";
    cover.src = project.cover_image_url;
    cover.alt = project.title || "Design";
  } else {
    cover = document.createElement("div");
    cover.className = "card__cover--placeholder";
    cover.textContent = "🏠";
  }

  var body = document.createElement("div");
  body.className = "card__body";

  var title = document.createElement("div");
  title.className = "card__title";
  title.textContent = project.title || project.name || "Untitled design";

  var date = document.createElement("div");
  date.className = "card__date";
  date.textContent = formatDate(project.created_at);

  body.appendChild(title);
  body.appendChild(date);
  a.appendChild(cover);
  a.appendChild(body);
  return a;
}

listPublished()
  .then(function (projects) {
    root.innerHTML = "";
    if (projects.length === 0) {
      var empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No designs published yet.";
      root.appendChild(empty);
      return;
    }
    projects.forEach(function (p) { root.appendChild(renderCard(p)); });
  })
  .catch(function (err) {
    root.innerHTML = "";
    var el = document.createElement("div");
    el.className = "error";
    el.textContent = "Could not load gallery: " + (err && err.message ? err.message : err);
    root.appendChild(el);
  });
