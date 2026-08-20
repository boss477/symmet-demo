/** IKEA-style live bill bar: compact strip + full summary panel. */

function formatInr(v) {
  if (v == null) return "—";
  return "₹" + Number(v).toLocaleString("en-IN");
}

/**
 * @param {{
 *   onBoqPdf?: Function,
 *   onRfq?: Function,
 *   onCheckout?: Function,
 *   onRemoveBagItem?: (code: string) => void,
 *   onAddToBag?: (code: string) => void,
 *   onClose?: Function,
 *   getProjectName?: () => string,
 *   getPlanImageUrl?: () => string,
 * }} callbacks
 */
export function createBillBar(callbacks) {
  callbacks = callbacks || {};

  var currentRows = [];
  var currentTotal = 0;
  var panelEl = null;

  // ── Summary panel ────────────────────────────────────────────────
  function openSummaryPanel() {
    if (!panelEl) panelEl = buildPanel();
    panelEl.hidden = false;
    refreshPanel();
  }

  function buildPanel() {
    var panel = document.createElement("div");
    panel.className = "summary-panel";
    panel.hidden = true;

    // Header
    var header = document.createElement("div");
    header.className = "summary-panel__header";

    var backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "summary-panel__back";
    backBtn.textContent = "← Edit design";
    backBtn.addEventListener("click", function () { panel.hidden = true; });

    var titleEl = document.createElement("div");
    titleEl.className = "summary-panel__project-name";

    var boqBtn = document.createElement("button");
    boqBtn.type = "button";
    boqBtn.className = "summary-panel__boq-btn";
    boqBtn.textContent = "Download BOQ";
    boqBtn.addEventListener("click", function () {
      if (callbacks.onBoqPdf) callbacks.onBoqPdf();
    });

    header.appendChild(backBtn);
    header.appendChild(titleEl);
    header.appendChild(boqBtn);

    // Body
    var body = document.createElement("div");
    body.className = "summary-panel__body";

    // Left: plan preview
    var preview = document.createElement("div");
    preview.className = "summary-panel__preview";

    // Right: shop panel
    var right = document.createElement("div");
    right.className = "summary-panel__right";

    var shopHeader = document.createElement("div");
    shopHeader.className = "summary-panel__shop-header";
    var shopTitle = document.createElement("div");
    shopTitle.className = "summary-panel__shop-title";
    shopTitle.textContent = "Shop this design";
    var totalEl = document.createElement("div");
    totalEl.className = "summary-panel__grand-total";
    shopHeader.appendChild(shopTitle);
    shopHeader.appendChild(totalEl);

    var rfqBtn = document.createElement("button");
    rfqBtn.type = "button";
    rfqBtn.className = "summary-panel__rfq-btn";
    rfqBtn.textContent = "Add room to shopping bag";
    rfqBtn.addEventListener("click", function () {
      if (callbacks.onRfq) callbacks.onRfq();
      panel.hidden = true;
    });

    var checkoutBtn = document.createElement("button");
    checkoutBtn.type = "button";
    checkoutBtn.className = "summary-panel__checkout-btn";
    checkoutBtn.textContent = "Checkout";
    checkoutBtn.addEventListener("click", function () {
      if (callbacks.onCheckout) callbacks.onCheckout(currentRows);
    });

    var listEl = document.createElement("div");
    listEl.className = "summary-panel__list";

    right.appendChild(shopHeader);
    right.appendChild(rfqBtn);
    right.appendChild(checkoutBtn);
    right.appendChild(listEl);

    body.appendChild(preview);
    body.appendChild(right);
    panel.appendChild(header);
    panel.appendChild(body);
    document.body.appendChild(panel);
    return panel;
  }

  function refreshPanel() {
    if (!panelEl || panelEl.hidden) return;

    var titleEl = panelEl.querySelector(".summary-panel__project-name");
    if (titleEl) titleEl.textContent = (callbacks.getProjectName ? callbacks.getProjectName() : "") || "Untitled Design";

    var totalEl = panelEl.querySelector(".summary-panel__grand-total");
    if (totalEl) totalEl.textContent = formatInr(currentTotal);

    var preview = panelEl.querySelector(".summary-panel__preview");
    if (preview) {
      preview.innerHTML = "";
      var imgUrl = callbacks.getPlanImageUrl ? callbacks.getPlanImageUrl() : null;
      if (imgUrl) {
        var img = document.createElement("img");
        img.src = imgUrl;
        img.alt = "Floor plan";
        preview.appendChild(img);
      } else {
        preview.textContent = "🏠";
        preview.classList.add("summary-panel__preview--empty");
      }
    }

    var listEl = panelEl.querySelector(".summary-panel__list");
    if (!listEl) return;
    listEl.innerHTML = "";

    currentRows.forEach(function (r) {
      var item = document.createElement("div");
      item.className = "summary-item";

      var thumb = document.createElement("div");
      thumb.className = "summary-item__thumb";
      if (r.imageUrl) {
        var thumbImg = document.createElement("img");
        thumbImg.src = r.imageUrl;
        thumbImg.alt = r.name || "";
        thumbImg.referrerPolicy = "no-referrer";
        thumb.appendChild(thumbImg);
      }

      var info = document.createElement("div");
      info.className = "summary-item__info";
      var nameEl = document.createElement("div");
      nameEl.className = "summary-item__name";
      nameEl.textContent = r.name || r.productCode || "Item";
      var descEl = document.createElement("div");
      descEl.className = "summary-item__desc";
      descEl.textContent = (r.category || r.dims || "");
      info.appendChild(nameEl);
      info.appendChild(descEl);

      var priceEl = document.createElement("div");
      priceEl.className = "summary-item__price";
      priceEl.textContent = formatInr(r.unitPrice);

      var actionArea = document.createElement("div");
      actionArea.className = "summary-item__action";

      if (r.removable) {
        var rmBtn = document.createElement("button");
        rmBtn.type = "button";
        rmBtn.className = "summary-item__remove-btn";
        rmBtn.textContent = "Remove";
        rmBtn.addEventListener("click", function () {
          if (callbacks.onRemoveBagItem) callbacks.onRemoveBagItem(r.productCode);
        });
        actionArea.appendChild(rmBtn);
      } else {
        var addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "summary-item__add-btn";
        addBtn.innerHTML = "🛒 Add to bag";
        addBtn.addEventListener("click", function () {
          if (callbacks.onAddToBag) callbacks.onAddToBag(r.productCode);
        });
        actionArea.appendChild(addBtn);
      }

      item.appendChild(thumb);
      item.appendChild(info);
      item.appendChild(priceEl);
      item.appendChild(actionArea);
      listEl.appendChild(item);
    });
  }

  // ── Strip bar ────────────────────────────────────────────────────
  var root = document.createElement("div");
  root.className = "bill-bar";
  root.hidden = true;

  var strip = document.createElement("div");
  strip.className = "bill-bar__strip";

  var totalText = document.createElement("span");
  totalText.className = "bill-bar__total-text";

  var summaryBtn = document.createElement("button");
  summaryBtn.type = "button";
  summaryBtn.className = "bill-bar__summary-btn";
  summaryBtn.innerHTML = "Summary →";
  summaryBtn.addEventListener("click", openSummaryPanel);

  var closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "bill-bar__close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", function () {
    if (callbacks.onClose) callbacks.onClose();
  });

  strip.appendChild(totalText);
  strip.appendChild(summaryBtn);
  strip.appendChild(closeBtn);
  root.appendChild(strip);

  return {
    el: root,
    mount: function (container) { container.appendChild(root); },
    refresh: function (rows, total) {
      rows = rows || [];
      currentRows = rows;
      currentTotal = total || 0;
      if (!rows.length) { root.hidden = true; return; }
      root.hidden = false;
      totalText.textContent = formatInr(total);
      refreshPanel();
    },
    hide: function () {
      root.hidden = true;
      if (panelEl) panelEl.hidden = true;
    },
    destroy: function () {
      if (root.parentNode) root.parentNode.removeChild(root);
      if (panelEl && panelEl.parentNode) panelEl.parentNode.removeChild(panelEl);
    },
  };
}
