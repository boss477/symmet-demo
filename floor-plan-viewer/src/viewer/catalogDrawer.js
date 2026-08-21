import { appendFurniture2dIcon } from "./furniture2dRender.js";
import { listPublished } from "../services/projectShare.js";
import { buildShareUrl } from "../lib/shareLink.js";

var SVG_NS = "http://www.w3.org/2000/svg";

function uniqStrings(arr) {
  var seen = {};
  var out = [];
  (arr || []).forEach(function (v) {
    var s = String(v || "").trim();
    if (!s) return;
    if (seen[s]) return;
    seen[s] = 1;
    out.push(s);
  });
  return out;
}

function normStr(s) {
  return String(s || "").toLowerCase().trim();
}

function favoritesKey() {
  return "fpv:favorites:v1";
}

function loadFavorites() {
  try {
    var raw = localStorage.getItem(favoritesKey());
    if (!raw) return {};
    var obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch (e) {
    return {};
  }
}

function saveFavorites(favs) {
  try {
    localStorage.setItem(favoritesKey(), JSON.stringify(favs || {}));
  } catch (e) {
    // ignore
  }
}

function catalogImageUrl(row) {
  if (!row) return "";
  var url = row.image_url || row.image_2d_url || row.plan2d_photo_url;
  return url ? String(url).trim() : "";
}

/**
 * Render a catalog entry's rich furniture icon for the card media slot.
 * Presets (and photo-less seating SKUs) carry a rich_icon but no image; this
 * draws the same SVG the plan canvas uses so every such card has a visual.
 * @param {object} r catalog entry
 * @returns {SVGSVGElement|null} null when the entry has no rich icon
 */
function buildIconMedia(r) {
  if (!r || !r.rich_icon) return null;
  var VW = 160;
  var VH = 120;
  var PAD = 14;
  var aw = r.width_mm > 0 ? r.width_mm : 1000;
  var ad = r.depth_mm > 0 ? r.depth_mm : 1000;
  var scale = Math.min((VW - PAD * 2) / aw, (VH - PAD * 2) / ad);
  var box = { w: aw * scale, h: ad * scale };

  var svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "catalog-card__icon");
  svg.setAttribute("viewBox", "0 0 " + VW + " " + VH);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  var defs = document.createElementNS(SVG_NS, "defs");
  svg.appendChild(defs);

  var g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("transform", "translate(" + VW / 2 + " " + VH / 2 + ")");
  svg.appendChild(g);

  var item = {
    richIcon: r.rich_icon,
    sofaSeats: r.sofa_seats,
    chairCount: r.chair_count,
    sideTablePlant: r.side_table_plant,
    rotationDeg: 0,
  };
  appendFurniture2dIcon(g, item, box, r, defs);
  return svg;
}

/** Icon when the entry has a rich icon, else the "No photo" placeholder. */
function mediaFallback(r) {
  var icon = buildIconMedia(r);
  if (icon) return icon;
  var ph = document.createElement("div");
  ph.className = "catalog-card__placeholder";
  ph.textContent = "No photo";
  return ph;
}

function formatDims(row) {
  if (!row) return "";
  var w = row.width_mm != null ? Math.round(row.width_mm) : null;
  var d = row.depth_mm != null ? Math.round(row.depth_mm) : null;
  var h = row.height_mm != null ? Math.round(row.height_mm) : null;
  var parts = [];
  if (w != null && d != null) parts.push(w + "×" + d + " mm");
  if (h != null) parts.push("H " + h + " mm");
  return parts.join(" · ");
}

function inferRoomFromCategory(category) {
  var c = normStr(category);
  if (!c) return "living";
  if (c.indexOf("sofa") >= 0 || c.indexOf("lounge") >= 0 || c.indexOf("tv") >= 0 || c.indexOf("chair") >= 0 || c.indexOf("seating") >= 0 || c.indexOf("living") >= 0) return "living";
  if (c.indexOf("bed") >= 0 || c.indexOf("mattress") >= 0 || c.indexOf("wardrobe") >= 0 || c.indexOf("almirah") >= 0 || c.indexOf("cupboard") >= 0) return "bedroom";
  if (c.indexOf("dining") >= 0) return "dining";
  if (c.indexOf("desk") >= 0 || c.indexOf("office") >= 0) return "office";
  return "living";
}

export function createCatalogDrawer(opts) {
  var root = opts.root;
  var onAdd = opts.onAdd;
  var getPlacedItems = opts.getPlacedItems;

  var els = {
    close: root.querySelector("#catalog-close"),
    tabBtns: Array.prototype.slice.call(root.querySelectorAll(".catalog-tab")),
    search: root.querySelector("#catalog-search"),
    room: root.querySelector("#catalog-room"),
    category: root.querySelector("#catalog-category"),
    chips: root.querySelector("#catalog-chips"),
    grid: root.querySelector("#catalog-grid"),
    list: root.querySelector("#catalog-list"),
    gallery: root.querySelector("#catalog-gallery"),
    controls: root.querySelector(".catalog-controls"),
  };

  var state = {
    open: false,
    tab: "add",
    q: "",
    room: "",
    category: "",
    chipCategory: "Sofa",
    catalog: [],
    favorites: loadFavorites(),
    galleryLoaded: false,
    galleryLoading: false,
  };

  function setOpen(open) {
    state.open = !!open;
    root.hidden = !state.open;
    if (state.open) render();
  }

  function setTab(tab) {
    if (tab === "gallery" && state.tab !== "gallery") {
      state.galleryLoaded = false;
    }
    state.tab = tab;
    els.tabBtns.forEach(function (b) {
      var t = b.getAttribute("data-tab");
      var active = t === tab;
      if (active) b.classList.add("catalog-tab--active");
      else b.classList.remove("catalog-tab--active");
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    render();
  }

  function setCatalogRows(rows) {
    state.catalog = rows || [];
    buildCategoryOptions();
    buildChips();
    render();
  }

  function buildCategoryOptions() {
    var cats = uniqStrings(
      (state.catalog || []).map(function (r) {
        return r && r.category ? r.category : "";
      })
    ).sort();
    els.category.innerHTML = "";
    var empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "All categories";
    els.category.appendChild(empty);
    cats.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      els.category.appendChild(o);
    });
  }

  function buildChips() {
    var top = uniqStrings(
      (state.catalog || [])
        .map(function (r) {
          return r && r.category ? r.category : "";
        })
        .filter(Boolean)
    );
    // Simple heuristic: prioritize common categories
    var counts = {};
    top.forEach(function (c) {
      counts[c] = 0;
    });
    (state.catalog || []).forEach(function (r) {
      var c = r && r.category ? r.category : "";
      if (!c) return;
      counts[c] = (counts[c] || 0) + 1;
    });
    top.sort(function (a, b) {
      return (counts[b] || 0) - (counts[a] || 0);
    });
    top = top.slice(0, 8);

    els.chips.innerHTML = "";
    top.forEach(function (c) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "catalog-chip";
      btn.textContent = c;
      btn.addEventListener("click", function () {
        state.chipCategory = state.chipCategory === c ? "" : c;
        if (state.chipCategory) {
          state.category = "";
          els.category.value = "";
        }
        render();
      });
      els.chips.appendChild(btn);
    });
  }

  function toggleFavorite(productCode) {
    if (!productCode) return;
    if (state.favorites[productCode]) delete state.favorites[productCode];
    else state.favorites[productCode] = 1;
    saveFavorites(state.favorites);
    render();
  }

  function matchesRoom(row) {
    if (!state.room) return true;
    var inferred = inferRoomFromCategory(row.category);
    if (!inferred) return false;
    return inferred === state.room;
  }

  function matchesQuery(row) {
    if (!state.q) return true;
    var q = normStr(state.q);
    var hay =
      normStr(row.product_code) +
      " " +
      normStr(row.product_name) +
      " " +
      normStr(row.category) +
      " " +
      normStr(row.keywords);
    return hay.indexOf(q) >= 0;
  }

  function matchesCategory(row) {
    var cat = state.chipCategory || state.category;
    if (!cat) return true;
    return String(row.category || "") === cat;
  }

  function filteredCatalog() {
    var rows = state.catalog || [];
    if (state.tab === "favorites") {
      rows = rows.filter(function (r) {
        return r && r.product_code && state.favorites[r.product_code];
      });
    }
    return rows.filter(function (r) {
      if (!r) return false;
      if (!matchesRoom(r)) return false;
      if (!matchesCategory(r)) return false;
      if (!matchesQuery(r)) return false;
      return true;
    });
  }

  function formatGalleryDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function renderGalleryCard(project) {
    var a = document.createElement("a");
    a.className = "gallery-card";
    a.href = buildShareUrl(project.share_token, window.location.origin);
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    var cover = document.createElement("div");
    cover.className = "gallery-card__cover";
    if (project.cover_image_url) {
      var img = document.createElement("img");
      img.src = project.cover_image_url;
      img.alt = project.title || "Design";
      img.loading = "lazy";
      cover.appendChild(img);
    } else {
      cover.textContent = "🏠";
      cover.classList.add("gallery-card__cover--empty");
    }

    var body = document.createElement("div");
    body.className = "gallery-card__body";

    var title = document.createElement("div");
    title.className = "gallery-card__title";
    title.textContent = project.title || project.name || "Untitled design";

    var date = document.createElement("div");
    date.className = "gallery-card__date";
    date.textContent = formatGalleryDate(project.created_at);

    body.appendChild(title);
    body.appendChild(date);
    a.appendChild(cover);
    a.appendChild(body);
    return a;
  }

  function renderGallery() {
    if (state.tab !== "gallery") return;
    if (state.galleryLoaded || state.galleryLoading) return;

    state.galleryLoading = true;
    els.gallery.innerHTML = "";
    var loading = document.createElement("div");
    loading.className = "gallery-status";
    loading.textContent = "Loading…";
    els.gallery.appendChild(loading);

    listPublished()
      .then(function (projects) {
        state.galleryLoaded = true;
        state.galleryLoading = false;
        els.gallery.innerHTML = "";
        if (projects.length === 0) {
          var empty = document.createElement("div");
          empty.className = "gallery-status";
          empty.textContent = "No published designs yet.";
          els.gallery.appendChild(empty);
          return;
        }
        projects.forEach(function (p) { els.gallery.appendChild(renderGalleryCard(p)); });
      })
      .catch(function (err) {
        state.galleryLoading = false;
        els.gallery.innerHTML = "";
        var errEl = document.createElement("div");
        errEl.className = "gallery-status gallery-status--error";
        errEl.textContent = "Could not load gallery: " + (err && err.message ? err.message : err);
        els.gallery.appendChild(errEl);
      });
  }

  function renderGrid() {
    var isGallery = state.tab === "gallery";
    els.grid.hidden = state.tab === "list" || isGallery;
    els.list.hidden = state.tab !== "list";
    if (state.tab === "list") return;

    var rows = filteredCatalog();
    els.grid.innerHTML = "";
    rows.forEach(function (r) {
      var card = document.createElement("div");
      card.className = "catalog-card";
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", "Add " + (r.product_name || r.product_code || "item"));

      var imgWrap = document.createElement("div");
      imgWrap.className = "catalog-card__media";

      var fav = document.createElement("button");
      fav.type = "button";
      fav.className = "catalog-card__fav";
      fav.textContent = state.favorites[r.product_code] ? "♥" : "♡";
      fav.setAttribute("data-on", state.favorites[r.product_code] ? "1" : "0");
      fav.title = state.favorites[r.product_code] ? "Remove from favorites" : "Add to favorites";
      fav.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(r.product_code);
      });

      var imgUrl = catalogImageUrl(r);
      if (imgUrl) {
        var img = document.createElement("img");
        img.className = "catalog-card__img";
        img.alt = r.product_name || r.product_code || "Product";
        img.loading = "lazy";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        img.src = imgUrl;
        var retries = 0;
        img.addEventListener("error", function () {
          if (retries < 2) {
            retries += 1;
            setTimeout(function () {
              img.src = imgUrl + (imgUrl.indexOf("?") >= 0 ? "&" : "?") + "r=" + retries;
            }, 800 * retries);
            return;
          }
          img.remove();
          imgWrap.appendChild(mediaFallback(r));
        });
        imgWrap.appendChild(img);
      } else {
        imgWrap.appendChild(mediaFallback(r));
      }

      var body = document.createElement("div");
      body.className = "catalog-card__body";

      var displayName = (r.product_name || r.product_code || "Item").trim();
      var name = document.createElement("div");
      name.className = "catalog-card__name";
      name.textContent = displayName;
      name.title = displayName;

      var desc = document.createElement("div");
      desc.className = "catalog-card__desc";
      desc.textContent = (r.product_code || r.category || displayName).trim();

      var meta = document.createElement("div");
      meta.className = "catalog-card__meta";

      var dims = document.createElement("div");
      dims.className = "catalog-card__dims";
      dims.textContent = formatDims(r) || "Standard";

      meta.appendChild(dims);
      meta.appendChild(fav);

      body.appendChild(name);
      body.appendChild(desc);
      body.appendChild(meta);

      card.appendChild(imgWrap);
      card.appendChild(body);

      function addThis() {
        if (typeof onAdd === "function") onAdd(r);
      }
      card.addEventListener("click", addThis);
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") addThis();
      });

      els.grid.appendChild(card);
    });
  }

  function renderList() {
    if (state.tab !== "list") return;
    var items = typeof getPlacedItems === "function" ? getPlacedItems() : [];
    els.list.innerHTML = "";
    if (!items.length) {
      var empty = document.createElement("div");
      empty.style.color = "#64748b";
      empty.textContent = "No placed items yet. Use Add tab to place furniture.";
      els.list.appendChild(empty);
      return;
    }
    items.forEach(function (it) {
      var row = document.createElement("div");
      row.className = "catalog-list-item";
      var left = document.createElement("div");
      var title = document.createElement("div");
      title.className = "catalog-list-item__title";
      title.textContent = it.label || it.id || "Item";
      var sub = document.createElement("div");
      sub.className = "catalog-list-item__sub";
      sub.textContent = it.sub || "";
      left.appendChild(title);
      left.appendChild(sub);

      var btns = document.createElement("div");
      btns.className = "catalog-list-item__btns";
      var sel = document.createElement("button");
      sel.type = "button";
      sel.textContent = "Select";
      sel.addEventListener("click", function () {
        if (typeof it.onSelect === "function") it.onSelect();
      });
      var del = document.createElement("button");
      del.type = "button";
      del.textContent = "Remove";
      del.addEventListener("click", function () {
        if (typeof it.onRemove === "function") it.onRemove();
      });
      btns.appendChild(sel);
      btns.appendChild(del);

      row.appendChild(left);
      row.appendChild(btns);
      els.list.appendChild(row);
    });
  }

  function syncChipActive() {
    var kids = Array.prototype.slice.call(els.chips.children || []);
    kids.forEach(function (el) {
      var txt = el.textContent || "";
      var active = state.chipCategory && txt === state.chipCategory;
      if (active) el.classList.add("catalog-chip--active");
      else el.classList.remove("catalog-chip--active");
    });
  }

  function render() {
    if (!state.open) return;
    var isGallery = state.tab === "gallery";
    if (els.controls) els.controls.hidden = isGallery;
    if (els.gallery) els.gallery.hidden = !isGallery;
    syncChipActive();
    renderGrid();
    renderList();
    renderGallery();
  }

  els.close.addEventListener("click", function () {
    setOpen(false);
  });
  els.tabBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      setTab(b.getAttribute("data-tab"));
    });
  });
  els.search.addEventListener("input", function () {
    state.q = els.search.value || "";
    render();
  });
  els.room.addEventListener("change", function () {
    state.room = els.room.value || "";
    render();
  });
  els.category.addEventListener("change", function () {
    state.category = els.category.value || "";
    if (state.category) state.chipCategory = "";
    render();
  });

  return {
    setOpen: setOpen,
    isOpen: function () {
      return !!state.open;
    },
    setTab: setTab,
    setCatalogRows: setCatalogRows,
    render: render,
  };
}
