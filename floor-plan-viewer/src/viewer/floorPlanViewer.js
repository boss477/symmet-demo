import {
  polygonAreaSqMFromNorm,
  resolveCalibration,
} from "../lib/calibration.js";
import { constrainFurnitureMove, resolveFurniturePosition } from "../lib/furnitureBounds.js";
import { pointInPolygon, polygonArea } from "../lib/geometry.js";
import { regularizeAnalysis } from "../lib/regularizeAnalysis.js";
import {
  analyzeFloorPlan,
  fileToImageBase64,
  imageSrcToImageBase64,
  isVisionConfigured,
  visionAnalyzingMessage,
  visionProviderLabel,
} from "../services/vision.js";
import { renderRealisticPlanCanvas } from "./realistic2dCanvas.js";
import { vastuTargetInRoom, vastuRoomHint, vastuRuleForItem, resolveVastuOverlaps } from "../lib/vastuPlacement.js";
import {
  applyCatalogSkuToItem,
  resolveCatalogRowForItem,
  catalogById,
  createFurnitureNearItem,
  findSofaCatalogRow,
  isSeatingCatalogRow,
  formatCatalogDimensionsLabel,
  formatReplaceOptionLabel,
  isSofaCatalogRow,
  isChairCatalogRow,
  parseSofaParams,
} from "../lib/catalogSizing.js";
import {
  getAvailableSofaColors,
  getCatalogRowColours,
  sofaColorLabel,
  SOFA_COLOR_OPTIONS,
} from "../lib/sofaColors.js";
import { defaultPlanCatalog, fetchPlanCatalog, fetchShearlingCatalog, uploadPlanRaster, saveDesignRender, fetchDesignRenders } from "../services/supabase.js";
import { createCatalogIndex } from "../lib/catalog.js";
import { bindPlanFileInput } from "../upload/uploadDropzone.js";
import { pickPageFromPdf } from "../upload/pdfImagePicker.js";
import { cadFileToDataUrl } from "../upload/cadImagePicker.js";
import { dwgFileToDataUrl } from "../upload/dwgImagePicker.js";
import { renderPlan } from "./svgRenderer.js";
import { updateRoomHighlight } from "./roomOverlay.js";
import { hideTooltip, showRoomTooltip } from "./tooltip.js";
import { createGeometryEditor } from "./geometryEditor.js";
import { mountFileToolbar, mountGeometryToolbar, mountDisplayToolbar, setToolButtonActive } from "./toolbar.js";
import { DEFAULT_DISPLAY_STATE, toggleDisplayState } from "../lib/displayState.js";
import { createCatalogDrawer } from "./catalogDrawer.js";
import { getRoomMeasurementDisplay } from "./planTools.js";
import { syncOverlayToImage } from "../lib/coordinates.js";
import {
  init3D,
  dispose3D,
  resize3D,
  rebuildFurnitureMeshes,
  applySelectedFurnitureRotation,
  select3DFurnitureByItemId,
  set3DFurnitureVisible,
  set3DViewMode,
  set3DFurnitureMovedCallback,
  set3DFurnitureActionCallback,
  set3DFurnitureSelectionSyncCallback,
  set3DFurnitureToolbarCloseCallback,
  dismiss3DFurnitureToolbar,
  clear3DFurnitureToolbarDismiss,
  toggle3DSidePanel,
  toggle3DMoveMode,
  exit3DToolModes,
  get3DCameraMiniMapState,
  set3DCameraMiniMapPosition,
  snapshot3D,
  zoom3D,
  fit3D,
} from "./plan3dViewer.js";
import { triggerPhotoreal } from "./plan3dSnapshot.js";
import { preloadGlbTopDownIcons, setGlbBakeRenderHook } from "./glbTopDownBake.js";
import { autoStagePlan, enrichStagedFromCatalog } from "./roomAutoStage.js";
import { createFurnitureToolbar, selectionScreenRect } from "./furnitureToolbar.js";
import { duplicateFurnitureItems } from "./furnitureSelection.js";
import {
  create as createFurnitureItem,
  describe as describeFurnitureItem,
  isSofa as itemIsSofa,
  isColorable as itemIsColorable,
  resolveColorId as itemResolveColorId,
} from "../lib/furnitureItem.js";
import {
  buildPlanMeta,
  buildRfqPayload,
  getOrCreateSessionId,
  productCodeFromRow,
  resolveShowroomId,
  resolveTenantId,
  roomForPoint,
  serializeFurnitureItem,
} from "../lib/planMoat.js";
import { buildBoqRows, downloadBoqPdf, downloadBoqCsv } from "../lib/boqExport.js";
import { createBillBar } from "./billBar.js";
import { downloadDeck } from "../lib/deckExport.js";
import { pickRenders } from "./renderPicker.js";
import { renderPlanThumbnail } from "../lib/planThumbnail.js";
import { mountShareControls } from "./shareControls.js";
import { parseViewToken } from "../lib/shareLink.js";
import { getProjectIdByToken } from "../services/projectShare.js";

var PLAN_SIZE = { width: 1000, height: 1000 };

export function initFloorPlanViewer() {
  var plan = document.getElementById("plan");
  var overlay = document.getElementById("overlay");
  var viewport = document.getElementById("viewport");
  var content = document.getElementById("content");
  var planWrap = document.getElementById("planWrap");
  var tip = document.getElementById("tip");
  var toolbarEl = document.getElementById("toolbar");
  var contextualToolbarEl = document.getElementById("contextual-toolbar");
  var catalogDrawerEl = document.getElementById("catalog-drawer");
  var phaseNav = document.getElementById("phase-nav");
  var uploadStatus = document.getElementById("upload-overlay-status");
  var planRail = document.getElementById("plan-rail");
  var planUndo = document.getElementById("plan-undo");
  var planZoomIn = document.getElementById("plan-zoom-in");
  var planZoomOut = document.getElementById("plan-zoom-out");
  var planZoomFit = document.getElementById("plan-zoom-fit");
  var planZoomLevel = document.getElementById("plan-zoom-level");

  var data = {
    analysisVersion: "1.0",
    label: "",
    rooms: [],
    walls: [],
    furniture: [],
    furniture_catalog: [],
    doors: [],
    windows: [],
    calibration: null,
  };
  var calibrationState = null;
  var s = 1;
  var tx = 0;
  var ty = 0;
  var drag = null;
  var furnitureDrag = null;
  var activeRoomId = null;
  var selectedFurnitureId = null;
  // Set when the user hits "Replace" on a selection: the next catalog pick
  // swaps that item in place instead of adding a new piece beside it.
  var pendingReplaceItemId = null;
  var lastOpenedFile = null;
  var shearlingCatalog = null;
  var planCatalog = defaultPlanCatalog();
  var catalogIndex = createCatalogIndex(planCatalog);

  function rebuildCatalogIndex() {
    catalogIndex = createCatalogIndex((planCatalog || []).concat(shearlingCatalog || []));
  }

  function fullCatalog() {
    return (planCatalog || []).concat(shearlingCatalog || []);
  }

  function lookupCatalogRow(id) {
    return catalogIndex.by_id(id);
  }

  function syncCatalogDrawerRows() {
    if (!catalogDrawer) return;
    var rows = fullCatalog().slice();
    catalogDrawer.setCatalogRows(rows);
  }
  var lastFurniturePointer = { clientX: 0, clientY: 0 };
  var vertexDrag = null;
  var geo = null;
  var activeMode = "2D";
  var activePhase = "plan";
  var fileTb = null;
  var geoTb = null;
  var furnitureRow = null;
  var catalogDrawer = null;
  var furnitureToolbar = null;
  var furnitureToolbarDismissed = false;
  var suppressToolbarReshowUntil = 0;
  var billBar = null;
  var billDismissed = false;
  var lastBillSig = null;
  var designBag = [];
  var pendingEvents = [];
  var vaastuEnabled = false;
  var northEdge = "top";
  var projectStatus = "draft";
  var lastAutoStageUsed = false;
  var planImageUrl = null;
  var rfqStatus = "draft";
  var displayState = Object.assign({}, DEFAULT_DISPLAY_STATE);

  var llmStatus = document.createElement("span");
  llmStatus.className = "llm-status";
  llmStatus.setAttribute("aria-live", "polite");
  var serverLabel =
    typeof window !== "undefined" && window.__SERVER_KIMI_MODEL__
      ? "Kimi " + String(window.__SERVER_KIMI_MODEL__)
      : typeof window !== "undefined" && window.__SERVER_GEMINI_MODEL__
        ? "Gemini " + String(window.__SERVER_GEMINI_MODEL__)
        : typeof window !== "undefined" && window.__SERVER_LM_MODEL__
          ? "LM Studio " + String(window.__SERVER_LM_MODEL__)
          : "";
  llmStatus.textContent = isVisionConfigured()
    ? "LLM: " + (serverLabel || visionProviderLabel()) + " (press Analyze LLM)"
    : "LLM: set VITE_GEMINI_API_KEY, LM Studio, or VITE_ANALYZE_API in .env";

  function setLlmStatus(msg) {
    llmStatus.textContent = msg;
  }

  var replaceSel = document.createElement("select");
  replaceSel.setAttribute("aria-label", "Replace selected furniture");
  replaceSel.disabled = true;

  var skuFilterMode = "";

  var sofaColorSel = document.createElement("select");
  sofaColorSel.setAttribute("aria-label", "Sofa color");
  sofaColorSel.disabled = true;
  sofaColorSel.title = "Switch sofa upholstery color";

  var addSofaNearBtn = document.createElement("button");
  addSofaNearBtn.type = "button";
  addSofaNearBtn.className = "btn";
  addSofaNearBtn.textContent = "+ near";
  addSofaNearBtn.disabled = true;
  addSofaNearBtn.title =
    "Place the SKU selected in Replace with beside the selection (sofa or chair)";

  var hint = document.createElement("span");
  hint.className = "toolbar-hint";
  hint.textContent =
    "Select · Replace SKU · Color · + near · drag · [ ] rotate · arrows · Esc deselect";

  var scaleEl = document.createElement("span");
  scaleEl.className = "calibration-scale";
  scaleEl.textContent = "Scale: load plan + JSON calibration";

  var furnitureInfoEl = document.createElement("span");
  furnitureInfoEl.className = "furniture-info";
  furnitureInfoEl.setAttribute("aria-live", "polite");
  furnitureInfoEl.textContent = "Furniture: click a piece, then choose from catalog";

  function getCatalogContext() {
    return {
      mmPerPixel: calibrationState ? calibrationState.mmPerPixel : null,
      planWidthPx: plan.naturalWidth || PLAN_SIZE.width,
      planHeightPx: plan.naturalHeight || PLAN_SIZE.height,
      walls: data.walls || [],
      rooms: data.rooms || [],
    };
  }

  function applyCatalogToAllFurniture() {
    var catalog = fullCatalog();
    if (!catalog.length) return;
    (data.furniture || []).forEach(function (f) {
      if (!f.catalogId) return;
      var row = catalogById(catalog, f.catalogId);
      if (row) applyCatalogSkuToItem(f, row, getCatalogContext());
    });
  }

  function updateFurnitureSelectionUi(pointerEvent) {
    if (pointerEvent) {
      lastFurniturePointer.clientX = pointerEvent.clientX;
      lastFurniturePointer.clientY = pointerEvent.clientY;
    }
    if (!selectedFurnitureId) {
      furnitureInfoEl.textContent = "Furniture: click a piece, then choose from catalog";
      return;
    }
    var item = data.furniture.find(function (f) {
      return f.id === selectedFurnitureId;
    });
    if (!item) {
      furnitureInfoEl.textContent = "Furniture: (selection lost)";
      return;
    }
    var row = lookupCatalogRow(item.catalogId);
    if (row) {
      var label = formatCatalogDimensionsLabel(row, item);
      furnitureInfoEl.textContent = label;
      hideTooltip(tip);
    } else if (item.catalogId) {
      furnitureInfoEl.textContent =
        item.catalogId + " — use Replace with to pick a catalog item";
    } else {
      furnitureInfoEl.textContent = "Selected — use Replace with for DB size + icon";
    }
  }

  function refreshCalibration() {
    if (!plan.naturalWidth || !plan.naturalHeight || !data.calibration) {
      calibrationState = null;
      scaleEl.textContent = "Scale: no calibration in JSON or image not loaded";
      return;
    }
    calibrationState = resolveCalibration(
      data.calibration,
      plan.naturalWidth,
      plan.naturalHeight
    );
    scaleEl.textContent = calibrationState
      ? "Scale: " + calibrationState.summary
      : "Scale: calibration segments invalid";
    if (calibrationState) applyCatalogToAllFurniture();
  }

  // Sofa/colour questions live in the Furniture Item module; these resolve the
  // item's Catalog Entry and ask it, so the field knowledge stays in one place.
  function isItemSofa(item) {
    return itemIsSofa(item, item ? lookupCatalogRow(item.catalogId) : null);
  }

  function isItemColorable(item) {
    return itemIsColorable(item, item ? lookupCatalogRow(item.catalogId) : null);
  }

  function activeSofaColorId(item, catalogRow) {
    return itemResolveColorId(item, catalogRow);
  }

  function syncSofaColorSelect() {
    sofaColorSel.innerHTML = "";
    if (!selectedFurnitureId) {
      sofaColorSel.disabled = true;
      return;
    }
    var item = data.furniture.find(function (f) {
      return f.id === selectedFurnitureId;
    });
    if (!item || !isItemColorable(item)) {
      sofaColorSel.disabled = true;
      return;
    }
    var catalog = fullCatalog();
    var row = catalogById(catalog, item.catalogId);
    if (!row && item.catalogId) {
      var wait = document.createElement("option");
      wait.value = "";
      wait.textContent = "Loading catalog…";
      sofaColorSel.appendChild(wait);
      sofaColorSel.disabled = true;
      return;
    }
    var available = getAvailableSofaColors(row, catalog);
    var availableSet = {};
    available.forEach(function (id) {
      availableSet[id] = true;
    });

    var autoOpt = document.createElement("option");
    autoOpt.value = "";
    autoOpt.textContent = "Auto (from catalog)";
    sofaColorSel.appendChild(autoOpt);

    var grpAvail = document.createElement("optgroup");
    grpAvail.label = row && row.colours ? "From Supabase Colours" : "Available for this line";
    available.forEach(function (id) {
      var o = document.createElement("option");
      o.value = id;
      o.textContent = sofaColorLabel(id);
      grpAvail.appendChild(o);
    });
    sofaColorSel.appendChild(grpAvail);

    var grpAll = document.createElement("optgroup");
    grpAll.label = "All colors";
    SOFA_COLOR_OPTIONS.forEach(function (opt) {
      if (availableSet[opt.id]) return;
      var o = document.createElement("option");
      o.value = opt.id;
      o.textContent = opt.label;
      grpAll.appendChild(o);
    });
    if (grpAll.children.length) sofaColorSel.appendChild(grpAll);

    var current = activeSofaColorId(item, row);
    sofaColorSel.value = item.sofaColorOverride ? item.sofaColorOverride : current || "";
    if (!sofaColorSel.value && item.sofaColorOverride !== undefined) sofaColorSel.value = "";
    sofaColorSel.disabled = false;
  }

  function appendReplaceOptions(container, rows) {
    rows.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c.id || c.product_code;
      o.textContent = formatReplaceOptionLabel(c);
      container.appendChild(o);
    });
  }

  function matchesSkuFilter(row) {
    if (!skuFilterMode) return true;
    if (skuFilterMode === "chair") return isChairCatalogRow(row);
    if (skuFilterMode === "sofa") return isSofaCatalogRow(row);
    return true;
  }

  function syncReplaceSelect() {
    replaceSel.innerHTML = "";
    var shearling = shearlingCatalog || [];
    var presets = planCatalog || [];

    if (shearling.length) {
      var filtered = skuFilterMode ? shearling.filter(matchesSkuFilter) : shearling;
      var grpSku = document.createElement("optgroup");
      grpSku.label =
        "Shearling SKUs" +
        (skuFilterMode ? " · " + skuFilterMode : "") +
        " (" +
        filtered.length +
        "/" +
        shearling.length +
        ")";
      appendReplaceOptions(grpSku, filtered);
      replaceSel.appendChild(grpSku);
    }

    if (presets.length) {
      var grpSets = document.createElement("optgroup");
      grpSets.label = "Room sets";
      appendReplaceOptions(grpSets, presets);
      replaceSel.appendChild(grpSets);
    }

    if (!shearling.length && !presets.length) {
      var empty = document.createElement("option");
      empty.value = "";
      empty.textContent = hasSb ? "Loading catalog…" : "No catalog loaded";
      replaceSel.appendChild(empty);
    }

    if (selectedFurnitureId) {
      var item = data.furniture.find(function (f) {
        return f.id === selectedFurnitureId;
      });
      if (item && item.catalogId && lookupCatalogRow(item.catalogId)) {
        replaceSel.value = item.catalogId;
      }
      replaceSel.disabled = false;
      addSofaNearBtn.disabled = false;
    } else {
      replaceSel.disabled = true;
      addSofaNearBtn.disabled = true;
    }
    syncSofaColorSelect();
  }

  function applySofaColorToItem(item, colorId) {
    if (!item || !isItemColorable(item)) return;
    var row = lookupCatalogRow(item.catalogId);
    if (!item.sofaParams) {
      item.sofaParams = row
        ? (function () {
            var p = parseSofaParams(
              row.keywords,
              row.product_name,
              row.category,
              row.colours
            );
            if (row.sofa_seats != null) p.seats = row.sofa_seats;
            return p;
          })()
        : { seats: 2, hasLounge: false, hasArm: true };
    }
    if (!colorId) {
      delete item.sofaColorOverride;
      if (row) {
        var fromDb = getCatalogRowColours(row);
        if (fromDb.length) item.sofaParams.color = fromDb[0];
        else {
          var parsed = parseSofaParams(
            row.keywords,
            row.product_name,
            row.category,
            row.colours
          );
          if (parsed.color) item.sofaParams.color = parsed.color;
          else delete item.sofaParams.color;
        }
      } else {
        delete item.sofaParams.color;
      }
    } else {
      item.sofaColorOverride = colorId;
      item.sofaParams.color = colorId;
    }
  }

  function addSofaNearSelected() {
    if (!selectedFurnitureId) return;
    var anchor = data.furniture.find(function (f) {
      return f.id === selectedFurnitureId;
    });
    if (!anchor) return;
    var row = lookupCatalogRow(replaceSel.value);
    if (!row) {
      alert("Pick a catalog SKU in Replace with first.");
      return;
    }
    if (!isSeatingCatalogRow(row)) {
      alert("+ near works for sofas and chairs. Pick a seating SKU in Replace with.");
      return;
    }
    var newItem = createFurnitureNearItem(anchor, row, getCatalogContext());
    if (!newItem) return;
    if (!data.furniture) data.furniture = [];
    data.furniture.push(newItem);
    selectedFurnitureId = newItem.id;
    syncReplaceSelect();
    updateFurnitureSelectionUi();
    render();
  }

  function applyTransform() {
    content.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + s + ")";
  }

  function layoutOverlay() {
    overlay.setAttribute("viewBox", "0 0 " + PLAN_SIZE.width + " " + PLAN_SIZE.height);
    overlay.setAttribute("preserveAspectRatio", "none");
    syncOverlayToImage(plan, overlay);
  }

  function imageSize() {
    return PLAN_SIZE;
  }

  function clientToPlanNormalized(clientX, clientY) {
    var ctm = overlay.getScreenCTM && overlay.getScreenCTM();
    if (ctm && overlay.createSVGPoint) {
      var pt = overlay.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      var svgPt = pt.matrixTransform(ctm.inverse());
      return {
        x: svgPt.x / PLAN_SIZE.width,
        y: svgPt.y / PLAN_SIZE.height,
      };
    }
    var box = overlay.getBoundingClientRect();
    return {
      x: (clientX - box.left) / box.width,
      y: (clientY - box.top) / box.height,
    };
  }

  function pickRoomAtNorm(x, y) {
    var hits = [];
    for (var i = 0; i < data.rooms.length; i++) {
      var poly = data.rooms[i].polygon;
      if (poly && poly.length >= 3 && pointInPolygon(x, y, poly)) {
        hits.push(data.rooms[i]);
      }
    }
    if (!hits.length) return null;
    if (hits.length === 1) return hits[0];
    hits.sort(function (a, b) {
      return polygonArea(a.polygon) - polygonArea(b.polygon);
    });
    return hits[0];
  }

  function setActiveFromNorm(x, y, e) {
    if (furnitureDrag) return;
    var r = pickRoomAtNorm(x, y);
    var id = r ? r.id || r.name || null : null;
    if (id !== activeRoomId) {
      activeRoomId = id;
      updateRoomHighlight(overlay, activeRoomId);
    }
    if (r && e) {
      var areaSqM = null;
      if (calibrationState && r.polygon) {
        areaSqM = polygonAreaSqMFromNorm(
          r.polygon,
          plan.naturalWidth,
          plan.naturalHeight,
          calibrationState.metersPerPixel
        );
      }
      var measure = getRoomMeasurementDisplay(
        r,
        plan.naturalWidth,
        plan.naturalHeight,
        calibrationState
      );
      showRoomTooltip(tip, e, r, {
        areaSqM: areaSqM,
        dimLine: measure.dimLine,
        areaLine: measure.areaLine,
        scaleSummary: calibrationState ? calibrationState.summary : null,
      });
    } else hideTooltip(tip);
  }

  function render() {
    layoutOverlay();
    var geoOpts = geo ? geo.getRenderOptions() : {};
    var size = imageSize();
    geoOpts.calibrationState = calibrationState;
    geoOpts.planImageSrc = null;
    geoOpts.furnitureRenderCtx = {
      mmPerPixel: calibrationState ? calibrationState.mmPerPixel : null,
      planWidthPx: plan.naturalWidth || size.width,
      planHeightPx: plan.naturalHeight || size.height,
      furnitureCatalog: fullCatalog(),
    };
    geoOpts.display = displayState;
    renderPlan(overlay, data, activeRoomId, selectedFurnitureId, size, geoOpts);
    positionFloatingToolbar();
    refreshBill();
  }

  function dismissFloatingToolbar() {
    furnitureToolbarDismissed = true;
    suppressToolbarReshowUntil = Date.now() + 500;
    if (furnitureToolbar) furnitureToolbar.hide();
    hideTooltip(tip);
    dismiss3DFurnitureToolbar();
  }

  function clearFloatingToolbarDismiss() {
    if (Date.now() < suppressToolbarReshowUntil) return;
    furnitureToolbarDismissed = false;
    clear3DFurnitureToolbarDismiss();
  }

  function positionFloatingToolbar() {
    if (!furnitureToolbar) return;
    if (activeMode !== "2D" || (geo && geo.blocksFurnitureInteraction())) {
      furnitureToolbar.hide();
      return;
    }
    if (furnitureToolbarDismissed) {
      furnitureToolbar.hide();
      return;
    }
    if (!selectedFurnitureId) {
      furnitureToolbar.hide();
      return;
    }
    var rect = selectionScreenRect(overlay, [selectedFurnitureId]);
    if (!rect) {
      furnitureToolbar.hide();
      return;
    }
    furnitureToolbar.show(rect);
  }

  function addToDesignBag(item) {
    if (!item) return;
    var row = lookupCatalogRow(item.catalogId);
    var key = row
      ? String(row.product_code || row.id || item.catalogId || item.id)
      : String(item.catalogId || item.id || "item");
    if (designBag.indexOf(key) < 0) designBag.push(key);
    setLlmStatus("Bag: " + designBag.length + " item(s)");
    refreshBill();
  }

  function removeFromDesignBag(code) {
    var i = designBag.indexOf(code);
    if (i < 0) return;
    designBag.splice(i, 1);
    setLlmStatus("Bag: " + designBag.length + " item(s)");
    refreshBill();
  }

  // Bill rows = placed furniture (aggregated by buildBoqRows) plus any bagged
  // SKU that is not already placed, folded in as a removable qty-1 line.
  // Placed items that are also in the bag are marked removable so the Summary
  // panel shows "Remove" (not "Add to bag") for them.
  function buildBillRows() {
    var placed = buildBoqRows(data.furniture || [], lookupCatalogRow, data.rooms || []);
    var bagSet = {};
    (designBag || []).forEach(function (code) { bagSet[code] = true; });
    var placedCodes = {};
    placed.forEach(function (r) {
      placedCodes[r.productCode] = true;
      if (bagSet[r.productCode]) r.removable = true;
    });
    var bagRows = [];
    (designBag || []).forEach(function (code) {
      if (placedCodes[code]) return;
      var row = lookupCatalogRow(code);
      var price = row && row.price != null ? Number(row.price) : null;
      bagRows.push({
        productCode: code,
        name: row ? row.product_name || row.name || code : code,
        category: row ? row.category || "" : "",
        imageUrl: row ? row.image_url || "" : "",
        qty: 1,
        unitPrice: price,
        total: price,
        removable: true,
      });
    });
    return placed.concat(bagRows);
  }

  function refreshBill() {
    if (!billBar) return;
    if (billDismissed) {
      billBar.hide();
      lastBillSig = null;
      return;
    }
    var rows = buildBillRows();
    var total = rows.reduce(function (s, r) {
      return r.total != null ? s + r.total : s;
    }, 0);
    var sig = JSON.stringify({
      r: rows.map(function (r) {
        return [r.productCode, r.qty, r.total, r.removable ? 1 : 0];
      }),
      t: total,
    });
    if (sig === lastBillSig) return;
    lastBillSig = sig;
    billBar.refresh(rows, total);
  }

  // RFQ doubles as the re-opener: clear the dismissal, re-show the bill, then mark sent.
  function reopenBillAndMarkRfq() {
    billDismissed = false;
    lastBillSig = null;
    refreshBill();
    markRfqSent();
  }

  function runFurnitureAction(actionId) {
    if (!selectedFurnitureId) return;
    var item = data.furniture.find(function (f) {
      return f.id === selectedFurnitureId;
    });
    if (!item) return;

    if (actionId === "bag") {
      addToDesignBag(item);
      return;
    }
    if (actionId === "rotate") {
      item.rotationDeg = (item.rotationDeg || 0) + 5;
      render();
      if (activeMode === "3D") applySelectedFurnitureRotation(item.rotationDeg);
      return;
    }
    if (actionId === "remove") {
      data.furniture = (data.furniture || []).filter(function (f) {
        return f.id !== selectedFurnitureId;
      });
      selectedFurnitureId = null;
      syncReplaceSelect();
      updateFurnitureSelectionUi();
      if (furnitureToolbar) furnitureToolbar.hide();
      render();
      if (activeMode === "3D") rebuildFurnitureMeshes();
      return;
    }
    if (actionId === "copy") {
      var copies = duplicateFurnitureItems(data.furniture, [selectedFurnitureId]);
      if (!copies.length) return;
      copies.forEach(function (c) {
        constrainFurnitureMove(c, data.rooms || []);
        data.furniture.push(c);
      });
      selectedFurnitureId = copies[0].id;
      syncReplaceSelect();
      updateFurnitureSelectionUi();
      render();
      if (activeMode === "3D") rebuildFurnitureMeshes();
      return;
    }
    if (actionId === "replace") {
      pendingReplaceItemId = selectedFurnitureId;
      if (catalogDrawer && catalogDrawer.setOpen) catalogDrawer.setOpen(true);
      replaceSel.focus();
      setLlmStatus("Pick a SKU to replace this item (from catalog or Replace with)");
      return;
    }
  }

  function getPlacedItemsForDrawer() {
    return (data.furniture || []).map(function (f) {
      var row = lookupCatalogRow(f.catalogId);
      var title = row ? row.product_code || row.id || f.catalogId : f.catalogId || f.id;
      var sub = row ? (row.product_name || row.name || "") : "";
      return {
        id: f.id,
        label: title || "Item",
        sub: sub,
        onSelect: function () {
          selectedFurnitureId = f.id;
          clearFloatingToolbarDismiss();
          syncReplaceSelect();
          updateFurnitureSelectionUi();
          render();
          if (activeMode === "3D") select3DFurnitureByItemId(f.id);
        },
        onRemove: function () {
          data.furniture = (data.furniture || []).filter(function (x) {
            return x.id !== f.id;
          });
          if (selectedFurnitureId === f.id) selectedFurnitureId = null;
          syncReplaceSelect();
          updateFurnitureSelectionUi();
          render();
        },
      };
    });
  }

  // Resolve which room a freshly placed item belongs to, robustly:
  // the room under it, else the hovered room, else the nearest room centroid.
  function resolveVastuRoom(item) {
    var hit = pickRoomAtNorm(item.x, item.y);
    if (hit) return hit;
    var active = (data.rooms || []).find(function (r) {
      return (r.id || r.name) === activeRoomId;
    });
    if (active && active.polygon) return active;
    var best = null;
    var bestD = Infinity;
    (data.rooms || []).forEach(function (r) {
      if (!r.polygon || r.polygon.length < 3) return;
      var sx = 0;
      var sy = 0;
      r.polygon.forEach(function (p) {
        sx += p.x;
        sy += p.y;
      });
      var cx = sx / r.polygon.length;
      var cy = sy / r.polygon.length;
      var d = (cx - item.x) * (cx - item.x) + (cy - item.y) * (cy - item.y);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    });
    return best;
  }

  // Snap a placed item to its Vastu zone (gated by the Vaastu toggle).
  // Returns true if it moved. Reports the outcome on the status line so the
  // user can see whether a rule fired.
  function applyVastuSnap(item) {
    if (!vaastuEnabled) return false;
    var rule = vastuRuleForItem(item);
    if (!rule) {
      setLlmStatus("Vaastu: no rule for this item type — left as placed");
      return false;
    }
    var room = resolveVastuRoom(item);
    if (!room || !room.polygon) {
      setLlmStatus("Vaastu: no room found to snap into");
      return false;
    }
    var t = vastuTargetInRoom(item, room.polygon, northEdge);
    var moved = false;
    if (t) {
      item.x = t.x;
      item.y = t.y;
      item.rotationDeg = t.rotationDeg;
      // The zone target is a bbox corner; for non-rectangular rooms it can sit
      // outside the polygon. Nudge the whole footprint back inside the walls.
      resolveFurniturePosition(item, data.rooms || []);
      // Slide sideways to clear any overlaps with other placed furniture.
      resolveVastuOverlaps(item, data.furniture || [], data.rooms || []);
      moved = true;
    }
    var roomLabel = room.type || room.name || room.id || "room";
    var hint = vastuRoomHint(item, room, northEdge);
    setLlmStatus(
      "Vaastu: " + rule.cat + " → " + rule.zone + " of " + roomLabel +
      (hint ? " · " + hint : "")
    );
    return moved;
  }

  // Re-snap every placed item to its Vastu zone (used when Vaastu is switched on).
  function snapAllFurnitureToVastu() {
    var list = data.furniture || [];
    var count = 0;
    list.forEach(function (item) {
      var room = resolveVastuRoom(item);
      if (!room || !room.polygon) return;
      var t = vastuTargetInRoom(item, room.polygon, northEdge);
      if (!t) return;
      item.x = t.x;
      item.y = t.y;
      item.rotationDeg = t.rotationDeg;
      resolveFurniturePosition(item, data.rooms || []);
      resolveVastuOverlaps(item, data.furniture || [], data.rooms || []);
      count++;
    });
    render();
    if (activeMode === "3D") rebuildFurnitureMeshes();
    setLlmStatus("Vaastu: snapped " + count + " item(s) to their zones");
  }

  // Swap an existing item's SKU in place (real mm size + icon), preserving its
  // colour override and logging the swap. Shared by the "Replace with" dropdown
  // and the toolbar Replace → catalog-drawer flow.
  function replaceItemWithRow(item, row) {
    if (!item || !row) return;
    var prevSku = productCodeFromRow(lookupCatalogRow(item.catalogId), item.catalogId);
    var prevColor = item.sofaColorOverride;
    applyCatalogSkuToItem(item, row, getCatalogContext());
    if (prevColor) {
      item.sofaColorOverride = prevColor;
      if (item.sofaParams) item.sofaParams.color = prevColor;
    }
    item.placementSource = "replaced";
    var room = roomForPoint(item.x, item.y, data.rooms || []);
    pendingEvents.push({
      eventType: "sku_swapped",
      payload: {
        fromSku: prevSku,
        toSku: productCodeFromRow(row, row.id || row.product_code),
        roomId: room ? room.id : null,
        itemId: item.id,
      },
    });
  }

  function addCatalogRowToPlan(row) {
    if (!row) return;
    var catalogRow = lookupCatalogRow(row.id || row.product_code) || row;

    // Toolbar "Replace" armed a pending swap: replace that item in place
    // instead of adding a new piece beside it. Only honour it while that item
    // is still the selection; otherwise the user moved on — treat as an add.
    if (pendingReplaceItemId && pendingReplaceItemId === selectedFurnitureId) {
      var target = data.furniture.find(function (f) {
        return f.id === pendingReplaceItemId;
      });
      pendingReplaceItemId = null;
      if (target) {
        replaceItemWithRow(target, catalogRow);
        selectedFurnitureId = target.id;
        syncReplaceSelect();
        syncSofaColorSelect();
        updateFurnitureSelectionUi();
        render();
        if (activeMode === "3D") {
          rebuildFurnitureMeshes();
          select3DFurnitureByItemId(target.id);
        }
        return;
      }
    }

    var anchor = selectedFurnitureId
      ? data.furniture.find(function (f) {
          return f.id === selectedFurnitureId;
        })
      : null;

    var newItem = null;
    if (anchor) {
      newItem = createFurnitureNearItem(anchor, catalogRow, getCatalogContext());
    } else {
      newItem = createFurnitureItem({
        catalogId: catalogRow.id || catalogRow.product_code || null,
        type: catalogRow.shape || "chair",
      });
      applyCatalogSkuToItem(newItem, catalogRow, getCatalogContext());
      constrainFurnitureMove(newItem, data.rooms || []);
    }
    if (newItem && vaastuEnabled) {
      applyVastuSnap(newItem);
      constrainFurnitureMove(newItem, data.rooms || []);
    }
    if (!newItem) return;
    newItem.placementSource = "manual";
    if (!data.furniture) data.furniture = [];
    data.furniture.push(newItem);
    selectedFurnitureId = newItem.id;
    syncReplaceSelect();
    updateFurnitureSelectionUi();
    render();
    if (activeMode === "3D") {
      rebuildFurnitureMeshes();
      // Adding furniture must not move the camera — exit tool modes (move/
      // paint) only; view changes are reserved for explicit camera controls.
      exit3DToolModes();
      select3DFurnitureByItemId(newItem.id);
    }
  }

  function onPlanLoaded() {
    activeRoomId = null;
    refreshCalibration();
    render();
  }

  function normalizeFurnitureIds() {
    (data.furniture || []).forEach(function (f, i) {
      if (!f.id) f.id = "f-" + i;
    });
  }

  function currentAnalysisJson() {
    var meta = buildPlanMeta({
      tenantId: resolveTenantId(),
      showroomId: resolveShowroomId(),
      sessionId: getOrCreateSessionId(),
      vaastuEnabled: vaastuEnabled,
      northEdge: northEdge,
      autoStageUsed: lastAutoStageUsed,
      planImageUrl: planImageUrl || (plan && plan.src ? plan.src : null),
      status: projectStatus,
    });
    var rfq = buildRfqPayload(designBag, data.furniture || [], lookupCatalogRow, data.rooms || []);
    rfq.status = rfqStatus;
    return {
      analysisVersion: "2.0",
      label: data.label || "Edited floor plan",
      calibration: data.calibration || null,
      meta: meta,
      rfq: rfq,
      rooms: data.rooms || [],
      walls: data.walls || [],
      doors: data.doors || [],
      windows: data.windows || [],
      furniture: (data.furniture || []).map(function (f) {
        return serializeFurnitureItem(f, data.rooms || [], lookupCatalogRow);
      }),
      events: pendingEvents.slice(),
    };
  }

  function runAutoStage(replaceAuto) {
    var catalog = fullCatalog();
    var count = autoStagePlan(data, catalog, { replaceAuto: replaceAuto !== false });
    enrichStagedFromCatalog(data, catalog);
    normalizeFurnitureIds();
    applyCatalogToAllFurniture();
    syncReplaceSelect();
    render();
    lastAutoStageUsed = true;
    pendingEvents.push({
      eventType: "auto_staged",
      payload: { count: count, vaastuEnabled: vaastuEnabled },
    });
    setLlmStatus("Auto-staged " + count + " furniture items (rich SVG + GLB sofa demo)");
    setPhase(activePhase);
  }

  function applyAnalysisFromObject(nextData) {
    var normalized = Object.assign(
      {
        analysisVersion: "1.0",
        label: "",
        rooms: [],
        walls: [],
        furniture: [],
        furniture_catalog: [],
        doors: [],
        windows: [],
        calibration: null,
      },
      nextData || {}
    );
    Object.keys(data).forEach(function (key) {
      delete data[key];
    });
    Object.assign(data, normalized);
    data.rooms = Array.isArray(data.rooms) ? data.rooms : [];
    data.walls = Array.isArray(data.walls) ? data.walls : [];
    data.furniture = Array.isArray(data.furniture) ? data.furniture : [];
    data.furniture_catalog = planCatalog.slice();
    data.doors = Array.isArray(data.doors) ? data.doors : [];
    data.windows = Array.isArray(data.windows) ? data.windows : [];
    data.windows.forEach(function (w, i) {
      if (!w.id) w.id = "win-" + i;
    });
    normalizeFurnitureIds();
    data.furniture.forEach(function (f) {
      delete f.width;
      delete f.height;
      delete f.depth;
      delete f.scale;
      if (f.stageSource && !f.placementSource) {
        f.placementSource = f.stageSource === "auto" ? "auto_stage" : f.placementSource;
      }
    });
    if (nextData && nextData.meta) {
      vaastuEnabled = !!nextData.meta.vaastuEnabled;
      northEdge = nextData.meta.northEdge || "top";
      projectStatus = nextData.meta.status || "draft";
      planImageUrl = nextData.meta.planImageUrl || null;
      lastAutoStageUsed = !!nextData.meta.autoStageUsed;
    }
    if (nextData && nextData.rfq) {
      rfqStatus = nextData.rfq.status || "draft";
      designBag = (nextData.rfq.items || [])
        .map(function (it) {
          return it.productCode || it.catalogId;
        })
        .filter(Boolean);
    } else {
      designBag = [];
      rfqStatus = "draft";
    }
    billDismissed = false;
    displayState.furniture = true;
    syncFurnitureVisibility();
    lastBillSig = null;
    pendingEvents = [];
    selectedFurnitureId = null;
    activeRoomId = null;
    if (geo && geo.resetForNewData) geo.resetForNewData();
    syncReplaceSelect();
    refreshCalibration();
    applyCatalogToAllFurniture();
    syncCatalogDrawerRows();
    render();
  }

  function runVisionOnFile(file) {
    runVisionWith(fileToImageBase64(file));
  }

  // CAD/PDF uploads have no raster source file; analyze the rendered plan.
  function runVisionOnPlanImage() {
    runVisionWith(imageSrcToImageBase64(plan.src));
  }

  function runVisionWith(imagePromise) {
    if (uploadStatus) uploadStatus.textContent = "Reading your floor plan...";
    imagePromise
      .then(function (img) {
        return analyzeFloorPlan(img.imageBase64, img.mimeType);
      })
      .then(function (analysis) {
        regularizeAnalysis(analysis, {
          width: plan.naturalWidth,
          height: plan.naturalHeight,
        });
        var apply = function () {
          applyAnalysisFromObject(analysis);
          dismissOverlay();
          if (uploadStatus) uploadStatus.textContent = "";
          setPhase("plan");
        };
        if (hasSb && (!shearlingCatalog || !shearlingCatalog.length)) {
          return Promise.all([
            fetchPlanCatalog(),
            fetchShearlingCatalog().catch(function () {
              return [];
            }),
          ])
            .then(function (results) {
              planCatalog = results[0];
              shearlingCatalog = results[1];
              rebuildCatalogIndex();
              data.furniture_catalog = planCatalog.slice();
              syncCatalogDrawerRows();
              apply();
            })
            .catch(function (err) {
              apply();
              setLlmStatus("Catalog unavailable; using the built-in catalog");
            });
        }
        apply();
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : String(err);
        if (uploadStatus) uploadStatus.textContent = "Could not read it. Draw your plan instead.";
        applyAnalysisFromObject({ rooms: [], walls: [], doors: [], windows: [], furniture: [] });
        setPhase("plan");
      });
  }

  function showRealisticRenderResult(dataUrl) {
    var overlay = document.createElement("div");
    overlay.className = "render-result-overlay";
    var panel = document.createElement("div");
    panel.className = "render-result-panel";
    var img = document.createElement("img");
    img.src = dataUrl;
    img.alt = "Realistic 2D render";
    panel.appendChild(img);
    var actions = document.createElement("div");
    actions.className = "render-result-actions";
    var download = document.createElement("a");
    download.className = "btn";
    download.textContent = "Download";
    download.href = dataUrl;
    download.download = "floor-plan-realistic-2d.png";
    actions.appendChild(download);
    var close = document.createElement("button");
    close.type = "button";
    close.className = "btn";
    close.textContent = "Close";
    close.addEventListener("click", function () {
      overlay.remove();
    });
    actions.appendChild(close);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  function runRealisticRender() {
    if (!data.rooms || !data.rooms.length) {
      alert("Load or analyze a plan first (rooms required).");
      return;
    }
    setLlmStatus("Render: building realistic 2D canvas...");
    var size = imageSize();
    var furnitureRenderCtx = {
      mmPerPixel: calibrationState ? calibrationState.mmPerPixel : null,
      planWidthPx: plan.naturalWidth || size.width,
      planHeightPx: plan.naturalHeight || size.height,
      furnitureCatalog: fullCatalog(),
    };
    renderRealisticPlanCanvas(data, size, furnitureRenderCtx)
      .then(function (canvas) {
        setLlmStatus("Render: done");
        showRealisticRenderResult(canvas.toDataURL("image/png"));
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : String(err);
        setLlmStatus("Render: error - " + msg);
        alert(msg);
      });
  }

  function exportJson() {
    var json = JSON.stringify(currentAnalysisJson(), null, 2);
    var blob = new Blob([json], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "floor-plan-analysis.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function loadFixture() {
    return fetch("/fixtures/sample-plan.json")
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        applyAnalysisFromObject(j);
        setLlmStatus("LLM: sample JSON (not from model)");
      })
      .catch(function () {
        alert("Could not load /fixtures/sample-plan.json");
      });
  }

  function supabaseConfigured() {
    var u =
      import.meta.env.VITE_SUPABASE_URL ||
      (typeof window !== "undefined" && window.__SUPABASE_URL__) ||
      "";
    var k =
      import.meta.env.VITE_SUPABASE_ANON_KEY ||
      (typeof window !== "undefined" && window.__SUPABASE_ANON_KEY__) ||
      "";
    return !!(u && k);
  }

  var hasSb = supabaseConfigured();
  var hasSbStorage = hasSb && import.meta.env.VITE_SUPABASE_STORAGE === "1";

  if (catalogDrawerEl) {
    catalogDrawer = createCatalogDrawer({
      root: catalogDrawerEl,
      onAdd: function (row) {
        addCatalogRowToPlan(row);
      },
      getPlacedItems: function () {
        return getPlacedItemsForDrawer();
      },
    });
  }
  var pricingNote = document.getElementById("catalog-pricing-note");
  if (pricingNote) {
    var pricingClose = pricingNote.querySelector("button");
    if (pricingClose) pricingClose.addEventListener("click", function () {
      pricingNote.hidden = true;
    });
  }

  var viewport2D = document.getElementById("viewport");
  var viewport3D = document.getElementById("viewport3d");
  var view3dChrome = document.getElementById("view3d-chrome");
  var btn3dDollhouse = document.getElementById("btn3d-dollhouse");
  var btn3dTop = document.getElementById("btn3d-top");
  var btn3dSide = document.getElementById("btn3d-side");
  var btn3dMove = document.getElementById("btn3d-move");
  var btn3dFurniture = document.getElementById("btn3d-furniture");

  if (btn3dDollhouse) {
    btn3dDollhouse.addEventListener("click", function () {
      set3DViewMode("dollhouse");
    });
  }
  if (btn3dTop) {
    btn3dTop.addEventListener("click", function () {
      set3DViewMode("top");
    });
  }
  if (btn3dSide) {
    btn3dSide.addEventListener("click", function () {
      toggle3DSidePanel();
    });
  }
  if (btn3dMove) {
    btn3dMove.addEventListener("click", function () {
      toggle3DMoveMode();
    });
  }

  function syncFurnitureVisibility() {
    var visible = displayState.furniture !== false;
    set3DFurnitureVisible(visible);
    var displayToggle = contextualToolbarEl && contextualToolbarEl.querySelector(".display-toggle");
    if (displayToggle) {
      displayToggle.textContent = (visible ? "Hide" : "Show") + " furniture";
      displayToggle.setAttribute("aria-pressed", visible ? "true" : "false");
    }
    if (btn3dFurniture) {
      btn3dFurniture.textContent = (visible ? "Hide" : "Show") + " furniture";
      btn3dFurniture.setAttribute("aria-pressed", visible ? "true" : "false");
    }
  }

  if (btn3dFurniture) {
    btn3dFurniture.addEventListener("click", function () {
      displayState = toggleDisplayState(displayState, "furniture");
      render();
      syncFurnitureVisibility();
    });
  }

  var btn3dFullscreen = document.getElementById("btn3d-fullscreen");
  if (btn3dFullscreen) {
    btn3dFullscreen.addEventListener("click", function () {
      if (!document.fullscreenElement) viewport3D.requestFullscreen().catch(function () {});
      else document.exitFullscreen();
    });
    document.addEventListener("fullscreenchange", function () {
      var isFs = document.fullscreenElement === viewport3D;
      btn3dFullscreen.classList.toggle("view3d-btn--active", isFs);
      btn3dFullscreen.innerHTML = isFs ? "&#9974; Exit full screen" : "&#9974; Full screen";
      if (activeMode === "3D") resize3D();
    });
  }

  var btn3dPhotoreal = document.getElementById("btn3d-photoreal");

  var btn3dPath = document.getElementById("btn3d-path");
  var minimapEl = document.getElementById("view3d-minimap");
  var minimapMap = document.getElementById("minimap-map");
  var minimapImg = document.getElementById("minimap-img");
  var minimapCam = document.getElementById("minimap-cam");
  var minimapHeight = document.getElementById("minimap-height");
  var minimapRafId = 0;

  // Renders captured from the photoreal pipeline, fed into the deck export.
  var deckRenders = [];

  // Reload previously captured shots so the gallery survives page refreshes.
  // Key-plan thumbs are rebuilt from the stored camera position.
  if (data && data.id) {
    fetchDesignRenders(String(data.id))
      .then(function (rows) {
        rows.forEach(function (r) {
          var entry = {
            title: r.title || "Proposed Render " + (deckRenders.length + 1),
            url: r.url,
          };
          deckRenders.push(entry);
          if (plan && plan.src && r.cam_x != null && r.cam_y != null) {
            renderPlanThumbnail(plan.src, { x: r.cam_x, y: r.cam_y, heading: r.cam_heading || 0 })
              .then(function (thumb) { entry.thumb = thumb; })
              .catch(function () { /* slide just omits the inset */ });
          }
        });
      })
      .catch(function (err) {
        console.warn("[deck] could not load saved renders:", err.message);
      });
  }

  function syncMinimapDot() {
    var st = get3DCameraMiniMapState();
    if (st) {
      var x = Math.max(0, Math.min(1, st.x)) * 100;
      var y = Math.max(0, Math.min(1, st.y)) * 100;
      minimapCam.style.left = x + "%";
      minimapCam.style.top = y + "%";
      minimapCam.style.setProperty("--heading", st.heading + "rad");
    }
    if (!minimapEl.hidden) minimapRafId = requestAnimationFrame(syncMinimapDot);
  }

  function minimapMoveCamera(e) {
    var rect = minimapMap.getBoundingClientRect();
    var nx = (e.clientX - rect.left) / rect.width;
    var ny = (e.clientY - rect.top) / rect.height;
    nx = Math.max(0, Math.min(1, nx));
    ny = Math.max(0, Math.min(1, ny));
    set3DCameraMiniMapPosition(nx, ny, Number(minimapHeight.value) / 10);
  }

  if (btn3dPath && minimapEl) {
    btn3dPath.addEventListener("click", function () {
      minimapEl.hidden = !minimapEl.hidden;
      btn3dPath.classList.toggle("view3d-btn--active", !minimapEl.hidden);
      cancelAnimationFrame(minimapRafId);
      if (!minimapEl.hidden) {
        exit3DToolModes();
        if (plan && plan.src) minimapImg.src = plan.src;
        syncMinimapDot();
      }
    });

    var minimapDragging = false;
    minimapMap.addEventListener("pointerdown", function (e) {
      minimapDragging = true;
      minimapMap.setPointerCapture(e.pointerId);
      minimapMoveCamera(e);
    });
    minimapMap.addEventListener("pointermove", function (e) {
      if (minimapDragging) minimapMoveCamera(e);
    });
    minimapMap.addEventListener("pointerup", function () {
      minimapDragging = false;
    });
    minimapHeight.addEventListener("input", function () {
      var st = get3DCameraMiniMapState();
      if (st) set3DCameraMiniMapPosition(st.x, st.y, Number(minimapHeight.value) / 10);
    });
  }

  var btn3dSnap = document.getElementById("btn3d-snap");
  if (btn3dSnap) {
    btn3dSnap.addEventListener("click", function () {
      var dataURL = snapshot3D();
      if (!dataURL) return;
      var a = document.createElement("a");
      a.href = dataURL;
      a.download = "planr_" + Date.now() + ".png";
      a.click();
    });
  }
  if (btn3dPhotoreal) {
    btn3dPhotoreal.addEventListener("click", function () {
      var dataURL = snapshot3D();
      if (!dataURL) return;
      // Items only carry catalogId; the Furniture Item module resolves the
      // label/colour from each item's Catalog Entry so the prompt describes
      // the actual design (and never silently drops a real SKU).
      var furniture = (data && data.furniture ? data.furniture : []).map(function (f) {
        return describeFurnitureItem(f, lookupCatalogRow(f.catalogId));
      });
      var designId = (data && data.id) ? String(data.id) : "plan";

      // Snapshot the camera's plan position now, while it frames this render,
      // so the deck slide can show where the shot was taken.
      var camAtSnap = get3DCameraMiniMapState();

      triggerPhotoreal(dataURL, designId, furniture, btn3dPhotoreal, function (url) {
        var entry = { title: "Proposed Render " + (deckRenders.length + 1), url: url, cam: camAtSnap };
        deckRenders.push(entry);
        // Persist so the shot survives a refresh; failure only costs persistence.
        saveDesignRender(designId, entry).catch(function (err) {
          console.warn("[deck] could not save render:", err.message);
        });
        // Build the plan-inset thumbnail in the background; the deck reads
        // entry.thumb if present, falls back to plan-only if it fails.
        if (plan && plan.src) {
          renderPlanThumbnail(plan.src, camAtSnap)
            .then(function (thumb) { entry.thumb = thumb; })
            .catch(function () { /* CORS / load failure — slide just omits the inset */ });
        }
      });
    });
  }

  set3DFurnitureMovedCallback(function () {
    /* positions already written to data.furniture items */
  });

  set3DFurnitureActionCallback(function (actionId, item) {
    if (item && item.id) selectedFurnitureId = item.id;
    runFurnitureAction(actionId);
  });

  set3DFurnitureSelectionSyncCallback(function (itemId) {
    selectedFurnitureId = itemId;
    syncReplaceSelect();
    syncSofaColorSelect();
    if (!itemId) {
      updateFurnitureSelectionUi();
      return;
    }
    clearFloatingToolbarDismiss();
    updateFurnitureSelectionUi();
  });

  set3DFurnitureToolbarCloseCallback(function () {
    furnitureToolbarDismissed = true;
    if (furnitureToolbar) furnitureToolbar.hide();
  });

  furnitureToolbar = createFurnitureToolbar({
    onAction: runFurnitureAction,
    onClose: dismissFloatingToolbar,
  });

  function show2D() {
    if (activeMode === "2D") return;
    activeMode = "2D";
    cancelAnimationFrame(minimapRafId);
    if (minimapEl) minimapEl.hidden = true;
    if (btn3dPath) btn3dPath.classList.remove("view3d-btn--active");
    dispose3D();
    viewport3D.style.display = "none";
    if (view3dChrome) view3dChrome.hidden = true;
    viewport2D.style.display = "";
    if (geoTb && geoTb.row) geoTb.row.style.display = "";
    if (furnitureRow) furnitureRow.style.display = "";
    if (fileTb && fileTb.btn2D) fileTb.btn2D.classList.add("tool-active");
    if (fileTb && fileTb.btn3D) fileTb.btn3D.classList.remove("tool-active");
    if (furnitureToolbar) furnitureToolbar.hide();
    render();
  }

  function setPhase(phase) {
    activePhase = phase === "3d" ? "3d" : phase === "furnish" ? "furnish" : "plan";
    document.body.dataset.phase = activePhase;
    if (planRail) planRail.hidden = activePhase !== "plan";
    if (planUndo) planUndo.hidden = activePhase !== "plan";
    if (phaseNav) {
      phaseNav.hidden = false;
      phaseNav.querySelectorAll("[data-phase]").forEach(function (btn) {
        btn.classList.toggle("phase-nav__btn--active", btn.dataset.phase === activePhase);
      });
    }
    if (activePhase === "3d") {
      show3D();
      if (catalogDrawer) catalogDrawer.setOpen(true);
    }
    else {
      show2D();
      if (catalogDrawer) catalogDrawer.setOpen(activePhase === "furnish" || activePhase === "3d");
    }
    var phaseStatus = document.getElementById("phase-status");
    if (phaseStatus) {
      phaseStatus.textContent = activePhase === "plan"
        ? (data.rooms.length + " rooms · " + data.doors.length + " doors · " + data.windows.length + " windows")
        : activePhase === "furnish"
          ? (data.furniture.length + " pieces placed")
          : "Choose a view, style, or photoreal render";
    }
  }

  function show3D() {
    if (activeMode === "3D") return;
    activeMode = "3D";
    if (furnitureToolbar) furnitureToolbar.hide();
    hideTooltip(tip);

    viewport2D.style.display = "none";
    viewport3D.style.display = "block";
    if (view3dChrome) view3dChrome.hidden = false;
    if (geoTb && geoTb.row) geoTb.row.style.display = "none";
    if (furnitureRow) furnitureRow.style.display = "none";
    if (fileTb && fileTb.btn2D) fileTb.btn2D.classList.remove("tool-active");
    if (fileTb && fileTb.btn3D) fileTb.btn3D.classList.add("tool-active");
    init3D(viewport3D, data, plan);
    syncFurnitureVisibility();
    if (selectedFurnitureId) {
      setTimeout(function () { select3DFurnitureByItemId(selectedFurnitureId); }, 0);
    }
  }

  function markRfqSent() {
    var payload = buildRfqPayload(designBag, data.furniture || [], lookupCatalogRow, data.rooms || []);
    if (!payload.items.length) {
      alert("Add items to the bag first (Bag action on furniture).");
      return;
    }
    rfqStatus = "sent";
    projectStatus = "rfq_sent";
    pendingEvents.push({ eventType: "rfq_sent", payload: payload });
    setLlmStatus("RFQ ready: " + payload.items.length + " SKU(s) — save to DB to persist");
  }

  function saveToDb() {
    var defaultId = window.location.hash.replace("#", "") || (crypto && crypto.randomUUID ? crypto.randomUUID() : "project-12345");
    var pid = prompt("Save Project under ID (UUID):", defaultId);
    if (!pid) return;
    var body = currentAnalysisJson();
    pendingEvents.push({ eventType: "plan_saved", payload: { projectId: pid } });
    body.events = pendingEvents.slice();
    fetch("/api/projects/" + pid, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        if (res.success) {
          window.location.hash = pid;
          pendingEvents = [];
          if (vaastuToggle) vaastuToggle.checked = vaastuEnabled;
          syncNorthButtons();
          setLlmStatus("Saved · tenant " + resolveTenantId());
          alert("Project saved (scene + moat events).");
        } else {
          alert("Save failed: " + (res.error || "Unknown error"));
        }
      })
      .catch(function (err) {
        alert("Save failed: " + err.message);
      });
  }

  function loadFromDb() {
    var pid = prompt("Enter Project UUID to load from Supabase:");
    if (!pid) return;
    fetch("/api/projects/" + pid)
      .then(function (r) {
        if (!r.ok) throw new Error("Server returned status " + r.status);
        return r.json();
      })
      .then(function (loaded) {
        window.location.hash = pid;
        applyAnalysisFromObject(loaded);
        if (vaastuToggle) vaastuToggle.checked = vaastuEnabled;
        syncNorthButtons();
        setLlmStatus("Loaded · " + (loaded.meta && loaded.meta.tenantId ? loaded.meta.tenantId : "default"));
        alert("Project loaded from Supabase.");
      })
      .catch(function (err) {
        alert("Load failed: " + err.message);
      });
  }

  fileTb = mountFileToolbar(contextualToolbarEl, {
    loadFixture: function () { var ov = document.getElementById("upload-overlay"); if (ov) ov.hidden = true; return loadFixture(); },
    uploadSupabase: hasSbStorage
      ? function () {
          var inp = fileTb.fileInput;
          if (!inp.files || !inp.files[0]) {
            return;
          }
          var f = inp.files[0];
          var path =
            "uploads/" +
            Date.now() +
            "-" +
            f.name.replace(/[^\w.\-]+/g, "_");
          uploadPlanRaster(f, path)
            .then(function (r) {
              planImageUrl = r.publicUrl;
              plan.crossOrigin = "anonymous";
              plan.src = r.publicUrl;
              plan.onload = onPlanLoaded;
            })
            .catch(function (err) {
              alert(err.message || String(err));
            });
        }
      : undefined,
    zoomIn: function () {
      s *= 1.15;
      applyTransform();
    },
    zoomOut: function () {
      s /= 1.15;
      applyTransform();
    },
    reset: function () {
      s = 1;
      tx = ty = 0;
      applyTransform();
    },
    fullscreen: function () {
      if (!document.fullscreenElement) viewport.requestFullscreen().catch(function () {});
      else document.exitFullscreen();
    },
    exportJson: exportJson,
    analyzeLlm: function () {
      var f = (fileTb.fileInput.files && fileTb.fileInput.files[0]) || lastOpenedFile;
      var isNonRaster = f && (/\.(dxf|dwg|pdf)$/i.test(f.name) || f.type === "application/pdf");
      if (f && !isNonRaster) {
        runVisionOnFile(f);
        return;
      }
      // CAD/PDF upload or demo fixture: analyze the rendered plan image.
      if (plan && plan.src) runVisionOnPlanImage();
    },
    realistic2d: runRealisticRender,
    show2D: show2D,
    show3D: show3D,
    saveToDb: saveToDb,
    loadFromDb: loadFromDb,
    toggleCatalog: catalogDrawer
      ? function () {
          // Opening the drawer manually is an "add" flow, not a Replace.
          pendingReplaceItemId = null;
          catalogDrawer.setOpen(!catalogDrawer.isOpen());
          if (activeMode === "3D") resize3D();
        }
      : undefined,
  });

  mountShareControls(toolbarEl);

  geoTb = mountGeometryToolbar(contextualToolbarEl, {
    toggleSetScale: function () {
      geo.toggleTool("setScale");
    },
    toggleMeasure: function () {
      geo.toggleTool("measure");
    },
    toggleVertexEdit: function () {
      geo.toggleTool("vertexEdit");
    },
    toggleDrawRoom: function () {
      if (geo.getToolMode() === "drawRoom") {
        geo.toggleTool("view");
      } else {
        geo.toggleTool("drawRoom");
      }
    },
    toggleWalls: function () {
      var m = geo.getToolMode();
      if (m === "editWalls" || m === "drawWall") {
        geo.toggleTool("view");
      } else {
        // Open the Walls tool: draw on an empty plan, edit once walls exist.
        geo.toggleTool(data.walls && data.walls.length ? "editWalls" : "drawWall");
      }
    },
    wallDraw: function () {
      if (geo.getToolMode() !== "drawWall") geo.toggleTool("drawWall");
    },
    wallEdit: function () {
      if (geo.getToolMode() !== "editWalls") geo.toggleTool("editWalls");
    },
    wallDoor: function () {
      if (geo.getToolMode() !== "cutDoor") geo.toggleTool("cutDoor");
    },
    wallCut: function () {
      if (geo.getToolMode() !== "cutWall") geo.toggleTool("cutWall");
    },
    toggleWindows: function () {
      geo.toggleTool("editWindows");
    },
    deleteSelectedWindow: function () {
      geo.deleteSelectedWindow();
    },
    finishDrawRoom: function () {
      geo.finishDrawRoom();
    },
    finishDrawWall: function () {
      geo.finishDrawWall();
    },
    deleteSelectedVertex: function () {
      geo.deleteSelectedVertex();
    },
    deleteSelectedWall: function () {
      geo.deleteSelectedWall();
    },
    deleteSelectedRoom: function () {
      geo.deleteSelectedRoom();
    },
    undo: function () {
      geo.performUndo();
    },
    applyScale: function () {
      geo.applyScaleFromInput();
    },
    onFloorChange: function () {
      geo.onFloorChange();
    },
    toggleOverlayVisibility: function () {
      var isHidden = overlay.classList.toggle("overlay-hidden");
      setToolButtonActive(geoTb.btnHideOverlay, isHidden);
      geoTb.btnHideOverlay.textContent = isHidden ? "Show overlay" : "Hide overlay";
    },
  });
  geo = createGeometryEditor({
    data: data,
    plan: plan,
    planWrap: planWrap,
    hintEl: hint,
    geoTb: geoTb,
    getCalibrationState: function () {
      return calibrationState;
    },
    refreshCalibration: refreshCalibration,
    pickRoomAtNorm: pickRoomAtNorm,
    requestRender: render,
    onToolModeChange: function (mode) {
      if (mode !== "view") {
        selectedFurnitureId = null;
        furnitureDrag = null;
        syncReplaceSelect();
        updateFurnitureSelectionUi();
        hideTooltip(tip);
      }
    },
    onSelectRoom: function () {},
  });
  geo.init();

  mountDisplayToolbar(contextualToolbarEl, {
    toggle: function (key) {
      displayState = toggleDisplayState(displayState, key);
      render();
      syncFurnitureVisibility();
      return displayState[key];
    },
  });

  furnitureRow = document.createElement("div");
  furnitureRow.className = "toolbar-row toolbar-row--furniture";
  var furnLab = document.createElement("span");
  furnLab.className = "toolbar-group-label";
  furnLab.textContent = "Furniture";
  furnitureRow.appendChild(furnLab);

  var replaceLab = document.createElement("label");
  replaceLab.textContent = "Replace with ";
  replaceLab.style.display = "inline-flex";
  replaceLab.style.alignItems = "center";
  replaceLab.style.gap = "6px";
  replaceLab.appendChild(replaceSel);

  var skuChairBtn = document.createElement("button");
  skuChairBtn.type = "button";
  skuChairBtn.className = "btn sku-filter-btn";
  skuChairBtn.textContent = "Chair";

  var skuSofaBtn = document.createElement("button");
  skuSofaBtn.type = "button";
  skuSofaBtn.className = "btn sku-filter-btn";
  skuSofaBtn.textContent = "Sofa";

  function syncSkuFilterButtons() {
    skuChairBtn.classList.toggle("sku-filter-btn--active", skuFilterMode === "chair");
    skuSofaBtn.classList.toggle("sku-filter-btn--active", skuFilterMode === "sofa");
  }

  function toggleSkuFilter(next) {
    skuFilterMode = skuFilterMode === next ? "" : next;
    syncSkuFilterButtons();
    syncReplaceSelect();
  }

  skuChairBtn.addEventListener("click", function (e) {
    e.preventDefault();
    toggleSkuFilter("chair");
  });
  skuSofaBtn.addEventListener("click", function (e) {
    e.preventDefault();
    toggleSkuFilter("sofa");
  });

  var colorLab = document.createElement("label");
  colorLab.textContent = "Color ";
  colorLab.style.display = "inline-flex";
  colorLab.style.alignItems = "center";
  colorLab.style.gap = "6px";
  colorLab.appendChild(sofaColorSel);

  replaceLab.appendChild(colorLab);
  replaceLab.appendChild(skuChairBtn);
  replaceLab.appendChild(skuSofaBtn);
  replaceLab.appendChild(addSofaNearBtn);

  var autoStageBtn = document.createElement("button");
  autoStageBtn.type = "button";
  autoStageBtn.textContent = "Auto stage";
  autoStageBtn.title = "Place rich SVG + demo GLB sofa in each room";
  autoStageBtn.addEventListener("click", function () {
    runAutoStage(true);
  });
  furnitureRow.appendChild(autoStageBtn);

  var vaastuToggle = document.createElement("input");
  vaastuToggle.type = "checkbox";
  vaastuToggle.id = "vaastu-toggle";
  vaastuToggle.checked = vaastuEnabled;
  vaastuToggle.addEventListener("change", function () {
    vaastuEnabled = vaastuToggle.checked;
    if (vaastuEnabled) snapAllFurnitureToVastu();
  });
  var vaastuLab = document.createElement("label");
  vaastuLab.htmlFor = "vaastu-toggle";
  vaastuLab.textContent = " Vaastu";
  vaastuLab.title = "Tag layouts for Vaastu-aware recommendations (rules coming)";
  vaastuLab.style.marginLeft = "8px";
  vaastuLab.insertBefore(vaastuToggle, vaastuLab.firstChild);
  furnitureRow.appendChild(vaastuLab);

  // Compass rosette: a compact 3x3 plus with a centre "N" and four outward
  // arrows. Clicking an arrow sets which screen edge is North; the active one
  // glows. Small, self-explanatory, and rotates the whole Vaastu frame.
  var northWrap = document.createElement("div");
  northWrap.title = "Set North edge (Vaastu)";
  // Fixed to the canvas corner so it never overlaps room content while panning.
  northWrap.style.cssText =
    "position:absolute;left:14px;top:14px;z-index:20;" +
    "display:grid;grid-template-columns:repeat(3,30px);" +
    "grid-template-rows:repeat(3,30px);align-items:center;justify-items:center;" +
    "background:rgba(243,244,246,0.95);border:1px solid #cbd5e1;border-radius:12px;" +
    "padding:3px;box-shadow:0 2px 8px rgba(0,0,0,0.18);";
  var NORTH_EDGES = [
    { edge: "top", glyph: "▲", col: 2, row: 1 },
    { edge: "left", glyph: "◀", col: 1, row: 2 },
    { edge: "right", glyph: "▶", col: 3, row: 2 },
    { edge: "bottom", glyph: "▼", col: 2, row: 3 },
  ];
  var northBtns = {};
  var northHub = document.createElement("span");
  northHub.textContent = "N";
  northHub.style.cssText =
    "grid-column:2;grid-row:2;font-size:17px;font-weight:800;color:#374151;";
  function syncNorthButtons() {
    NORTH_EDGES.forEach(function (o) {
      var active = northEdge === o.edge;
      northBtns[o.edge].style.color = active ? "#0f9d58" : "#9ca3af";
      northBtns[o.edge].style.textShadow = active ? "0 0 4px rgba(15,157,88,0.7)" : "none";
      northBtns[o.edge].style.transform = active ? "scale(1.35)" : "scale(1)";
    });
  }
  NORTH_EDGES.forEach(function (o) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = o.glyph;
    b.setAttribute("aria-label", "North = " + o.edge);
    b.style.cssText =
      "grid-column:" + o.col + ";grid-row:" + o.row + ";" +
      "border:0;background:transparent;cursor:pointer;padding:0;line-height:1;" +
      "font-size:16px;transition:transform .1s,color .1s;";
    b.addEventListener("click", function () {
      northEdge = o.edge;
      syncNorthButtons();
    });
    northBtns[o.edge] = b;
    northWrap.appendChild(b);
  });
  northWrap.appendChild(northHub);
  syncNorthButtons();
  // Appended last (after the Replace controls) so it sits in the far-right corner.

  var rfqBtn = document.createElement("button");
  rfqBtn.type = "button";
  rfqBtn.textContent = "RFQ";
  rfqBtn.title = "Re-open the bill and mark quote bag as sent";
  rfqBtn.addEventListener("click", reopenBillAndMarkRfq);
  furnitureRow.appendChild(rfqBtn);

  var boqCsvBtn = document.createElement("button");
  boqCsvBtn.type = "button";
  boqCsvBtn.textContent = "BOQ CSV";
  boqCsvBtn.title = "Download Bill of Quantities as CSV";
  boqCsvBtn.addEventListener("click", function () {
    var rows = buildBoqRows(data.furniture || [], lookupCatalogRow, data.rooms || []);
    if (!rows.length) { alert("No furniture placed yet."); return; }
    downloadBoqCsv(rows, data.name || null);
  });
  furnitureRow.appendChild(boqCsvBtn);

  var deckBtn = document.createElement("button");
  deckBtn.type = "button";
  deckBtn.textContent = "Deck PPT";
  deckBtn.title = "Download branded pitch deck (.pptx) with BOQ + render slots";
  deckBtn.addEventListener("click", function () {
    var rows = buildBoqRows(data.furniture || [], lookupCatalogRow, data.rooms || []);
    if (!rows.length) { alert("No furniture placed yet."); return; }

    function generate(renders) {
      deckBtn.disabled = true;
      deckBtn.textContent = "Generating…";
      var planImagePromise = (plan && plan.src)
        ? renderPlanThumbnail(plan.src, null, { maxWidth: 1600 }).catch(function () { return null; })
        : Promise.resolve(null);
      planImagePromise
        .then(function (planImage) {
          return downloadDeck(rows, {
            projectName: data.name || "Project",
            planImage: planImage,
            renders: renders,
          });
        })
        .catch(function (err) { alert("Deck PPT failed: " + err.message); })
        .finally(function () {
          deckBtn.disabled = false;
          deckBtn.textContent = "Deck PPT";
        });
    }

    // With captured shots, let the user pick which ones make the deck;
    // otherwise keep the old placeholder-slides behaviour.
    if (deckRenders.length) {
      pickRenders(deckRenders).then(function (chosen) {
        if (chosen) generate(chosen);
      });
    } else {
      generate([]);
    }
  });
  furnitureRow.appendChild(deckBtn);

  furnitureRow.appendChild(replaceLab);
  contextualToolbarEl.appendChild(furnitureRow);

  // Mount the North compass floating on the left of the 2D plan viewport.
  if (viewport) {
    viewport.style.position = "relative";
    viewport.appendChild(northWrap);
  }

  // Live bill bar pinned to the bottom of the 2D plan viewport.
  billBar = createBillBar({
    onBoqPdf: function () {
      var rows = buildBoqRows(data.furniture || [], lookupCatalogRow, data.rooms || []);
      if (!rows.length) { alert("No furniture placed yet."); return; }
      downloadBoqPdf(rows, data.name || null);
    },
    onRfq: markRfqSent,
    onCheckout: function (rows) {
      var codes = (rows || []).map(function (r) { return r.productCode; }).filter(Boolean);
      try { localStorage.setItem("symmet-cart", JSON.stringify(codes)); } catch (e) {}
      window.location.href = "/checkout.html";
    },
    onRemoveBagItem: removeFromDesignBag,
    onAddToBag: function (code) {
      addToDesignBag({ catalogId: code, id: code });
    },
    onClose: function () {
      billDismissed = true;
      lastBillSig = null;
      billBar.hide();
    },
    getProjectName: function () {
      return data.name || "Untitled Design";
    },
    getPlanImageUrl: function () {
      var planImg = document.getElementById("plan");
      return planImg && planImg.src ? planImg.src : null;
    },
  });
  if (viewport) billBar.mount(viewport);
  refreshBill();

  sofaColorSel.addEventListener("change", function () {
    if (!selectedFurnitureId) return;
    var item = data.furniture.find(function (f) {
      return f.id === selectedFurnitureId;
    });
    if (!item) return;
    applySofaColorToItem(item, sofaColorSel.value);
    updateFurnitureSelectionUi();
    render();
  });

  addSofaNearBtn.addEventListener("click", function () {
    addSofaNearSelected();
  });
  contextualToolbarEl.appendChild(furnitureInfoEl);
  contextualToolbarEl.appendChild(llmStatus);
  contextualToolbarEl.appendChild(scaleEl);
  contextualToolbarEl.appendChild(hint);

  replaceSel.addEventListener("change", function () {
    if (!selectedFurnitureId) return;
    var item = data.furniture.find(function (f) {
      return f.id === selectedFurnitureId;
    });
    if (!item) return;
    var row = lookupCatalogRow(replaceSel.value);
    if (row) {
      replaceItemWithRow(item, row);
    } else {
      item.catalogId = replaceSel.value;
      item.placementSource = "replaced";
    }
    syncSofaColorSelect();
    updateFurnitureSelectionUi();
    render();
    positionFloatingToolbar();
    if (activeMode === "3D") rebuildFurnitureMeshes();
  });

  bindPlanFileInput(
    fileTb.fileInput,
    plan,
    function () {
      onPlanLoaded();
      // Vision analysis is manual now — press "Analyze LLM" to run it.
    },
    function (file) {
      lastOpenedFile = file;
      var ov = document.getElementById("upload-overlay"); if (ov) ov.hidden = true;
    }
  );

  planWrap.addEventListener(
    "mousedown",
    function (e) {
      if (e.button !== 0) return;
      if (e.target.closest(".furniture-floating-toolbar")) return;
      if (Date.now() < suppressToolbarReshowUntil) return;
      var n = clientToPlanNormalized(e.clientX, e.clientY);

      if (geo.isGeometryClickMode()) {
        e.stopPropagation();
        geo.handlePlanClick(n);
        return;
      }

      var wallHandle = e.target.closest(".plan-wall-vertex-handle");
      if (geo.getToolMode() === "editWalls") {
        e.stopPropagation();
        e.preventDefault();
        geo.handleWallMousedown(n, wallHandle);
        vertexDrag = geo.hasActiveVertexDrag();
        return;
      }

      if (geo.getToolMode() === "editWindows") {
        // Only claim the event when a window is hit so empty-space panning still works.
        if (geo.handleWindowMousedown(n)) {
          e.stopPropagation();
          e.preventDefault();
          vertexDrag = geo.hasActiveVertexDrag();
        }
        return;
      }

      var handle = e.target.closest(".plan-vertex-handle");
      if (geo.getToolMode() === "vertexEdit") {
        e.stopPropagation();
        e.preventDefault();
        geo.handleVertexMousedown(n, handle);
        vertexDrag = geo.hasActiveVertexDrag();
        return;
      }

      if (geo.blocksFurnitureInteraction()) return;

      var g = e.target.closest("[data-furniture-id]");
      if (g) {
        e.stopPropagation();
        var id = g.getAttribute("data-furniture-id");
        var item = data.furniture.find(function (f) {
          return f.id === id;
        });
        if (!item) return;
        selectedFurnitureId = id;
        clearFloatingToolbarDismiss();
        activeRoomId = null;
        updateRoomHighlight(overlay, null);
        syncReplaceSelect();
        updateFurnitureSelectionUi(e);
        render();
        furnitureDrag = {
          id: id,
          nx: n.x,
          ny: n.y,
          ox: item.x,
          oy: item.y,
          lastValidX: item.x,
          lastValidY: item.y,
        };
        return;
      }

      if (geo.getToolMode() === "view") {
        e.stopPropagation();
        geo.handlePlanClick(n);
      }
    },
    false
  );

  planWrap.addEventListener("mousemove", function (e) {
    if (furnitureDrag || vertexDrag) return;
    var n = clientToPlanNormalized(e.clientX, e.clientY);
    if (geo.handleMousemove(n)) return;
    if (geo.getToolMode() !== "view") return;
    if (selectedFurnitureId) return;
    if (n.x < 0 || n.x > 1 || n.y < 0 || n.y > 1) {
      activeRoomId = null;
      updateRoomHighlight(overlay, null);
      hideTooltip(tip);
      return;
    }
    setActiveFromNorm(n.x, n.y, e);
  });

  planWrap.addEventListener("mouseleave", function () {
    activeRoomId = null;
    updateRoomHighlight(overlay, null);
    hideTooltip(tip);
  });

  var view3dZoomIn = document.getElementById("view3d-zoom-in");
  var view3dZoomOut = document.getElementById("view3d-zoom-out");
  var view3dZoomFit = document.getElementById("view3d-zoom-fit");

  if (view3dZoomIn) {
    view3dZoomIn.addEventListener("click", function () {
      zoom3D(1);
    });
  }
  if (view3dZoomOut) {
    view3dZoomOut.addEventListener("click", function () {
      zoom3D(-1);
    });
  }
  if (view3dZoomFit) {
    view3dZoomFit.addEventListener("click", function () {
      fit3D();
    });
  }

  viewport.addEventListener(
    "wheel",
    function (e) {
      // FIX 1: Disable scroll-wheel and gesture zoom completely on 2D floor plan view
      e.preventDefault();
    },
    { passive: false }
  );
  if (planZoomIn) planZoomIn.addEventListener("click", function () {
    s = Math.min(6, s * 1.15);
    applyTransform();
    if (planZoomLevel) planZoomLevel.textContent = Math.round(s * 100) + "%";
  });
  if (planZoomOut) planZoomOut.addEventListener("click", function () {
    s = Math.max(0.3, s / 1.15);
    applyTransform();
    if (planZoomLevel) planZoomLevel.textContent = Math.round(s * 100) + "%";
  });
  if (planZoomFit) planZoomFit.addEventListener("click", function () {
    s = 1;
    tx = 0;
    ty = 0;
    applyTransform();
    if (planZoomLevel) planZoomLevel.textContent = "100%";
  });

  viewport.addEventListener("mousedown", function (e) {
    if (e.button !== 0) return;
    if (geo.isGeometryClickMode()) return;
    if (e.target.closest(".furniture-floating-toolbar")) return;
    if (e.target.closest(".plan-wall-vertex-handle")) return;
    if (e.target.closest(".plan-vertex-handle")) return;
    if (e.target.closest("[data-furniture-id]")) return;
    drag = { x: e.clientX - tx, y: e.clientY - ty };
  });
  window.addEventListener("mousemove", function (e) {
    if (vertexDrag) {
      var nVert = clientToPlanNormalized(e.clientX, e.clientY);
      geo.handleVertexDragMove(nVert);
      return;
    }
    if (furnitureDrag) {
      var item = data.furniture.find(function (f) {
        return f.id === furnitureDrag.id;
      });
      if (item) {
        var n = clientToPlanNormalized(e.clientX, e.clientY);
        var dx = n.x - furnitureDrag.nx;
        var dy = n.y - furnitureDrag.ny;
        var tryX = furnitureDrag.ox + dx;
        var tryY = furnitureDrag.oy + dy;
        item.x = tryX;
        item.y = tryY;
        if (
          constrainFurnitureMove(
            item,
            data.rooms,
            furnitureDrag.lastValidX,
            furnitureDrag.lastValidY
          )
        ) {
          furnitureDrag.lastValidX = item.x;
          furnitureDrag.lastValidY = item.y;
        }
        render();
        positionFloatingToolbar();
      }
      return;
    }
    if (!drag) return;
    tx = e.clientX - drag.x;
    ty = e.clientY - drag.y;
    applyTransform();
  });
  window.addEventListener("mouseup", function () {
    if (vertexDrag) {
      vertexDrag = null;
      geo.clearVertexDrag();
    }
    // Snap a dragged piece to its Vastu zone on drop (Vaastu mode acts as a
    // magnet: drop a bed into a room and it jumps to that room's zone).
    if (furnitureDrag && vaastuEnabled) {
      var dropped = (data.furniture || []).find(function (f) {
        return f.id === furnitureDrag.id;
      });
      furnitureDrag = null;
      if (dropped && applyVastuSnap(dropped)) {
        constrainFurnitureMove(dropped, data.rooms || []);
        render();
        if (activeMode === "3D") rebuildFurnitureMeshes();
      }
    }
    drag = null;
    furnitureDrag = null;
  });

  window.addEventListener("keydown", function (e) {
    var tag = e.target && e.target.tagName;
    if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key === "Escape") {
      var geoHandled = geo.handleEscape();
      if (geoHandled) {
        render();
        e.preventDefault();
        return;
      }
      selectedFurnitureId = null;
      syncReplaceSelect();
      updateFurnitureSelectionUi();
      hideTooltip(tip);
      if (furnitureToolbar) furnitureToolbar.hide();
      render();
      e.preventDefault();
      return;
    }
    if (geo.handleKeydown(e)) {
      e.preventDefault();
      return;
    }
    if (geo.blocksFurnitureInteraction()) return;
    if (!selectedFurnitureId) return;
    var item = data.furniture.find(function (f) {
      return f.id === selectedFurnitureId;
    });
    if (!item) return;
    var step = e.shiftKey ? 0.022 : 0.009;
    var prevX = item.x;
    var prevY = item.y;
    var changed = false;
    if (e.key === "ArrowLeft") {
      item.x -= step;
      changed = true;
    } else if (e.key === "ArrowRight") {
      item.x += step;
      changed = true;
    } else if (e.key === "ArrowUp") {
      item.y -= step;
      changed = true;
    } else if (e.key === "ArrowDown") {
      item.y += step;
      changed = true;
    } else if (e.key === "[" || e.key === "{") {
      item.rotationDeg = (item.rotationDeg || 0) - 5;
      changed = true;
    } else if (e.key === "]" || e.key === "}") {
      item.rotationDeg = (item.rotationDeg || 0) + 5;
      changed = true;
    }
    if (changed) {
      if (e.key.indexOf("Arrow") === 0) {
        constrainFurnitureMove(item, data.rooms, prevX, prevY);
      }
      if (e.key === "[" || e.key === "{" || e.key === "]" || e.key === "}") {
        if (activeMode === "3D") applySelectedFurnitureRotation(item.rotationDeg);
      }
      render();
      positionFloatingToolbar();
      e.preventDefault();
    }
  });

  new ResizeObserver(function () {
    layoutOverlay();
    render();
    if (activeMode === "3D") resize3D();
  }).observe(planWrap);

  window.addEventListener("resize", function () {
    if (activeMode === "3D") resize3D();
  });

  plan.addEventListener("load", function () {
    layoutOverlay();
    refreshCalibration();
  });

  applyTransform();
  plan.onload = onPlanLoaded;
  plan.onerror = function () {
    plan.onerror = null;
    plan.src = "/fixtures/sample-floor.svg";
  };
  plan.src = "/fixtures/reference-floor.png";

  function boot() {
    setGlbBakeRenderHook(render);
    data.furniture_catalog = planCatalog.slice();
    syncCatalogDrawerRows();
    if (catalogDrawer) catalogDrawer.setOpen(true);
    loadFixture()
      .then(function () {
        return preloadGlbTopDownIcons().catch(function () {});
      })
      .then(function () {
        runAutoStage(true);
      });
  }

  function loadCatalogsFromSupabase() {
    return Promise.all([
      fetchPlanCatalog(),
      fetchShearlingCatalog().catch(function (err) {
        console.warn("[catalog] shearling:", err && err.message ? err.message : err);
        return [];
      }),
    ]).then(function (results) {
      planCatalog = results[0];
      shearlingCatalog = results[1];
      rebuildCatalogIndex();
      syncCatalogDrawerRows();
      var msg = "Catalog: " + planCatalog.length + " sets";
      if (shearlingCatalog.length) msg += ", " + shearlingCatalog.length + " Shearling SKUs";
      setLlmStatus(msg);
    });
  }

  var viewToken = parseViewToken(window.location.pathname);

  function bootSharedViewer() {
    document.body.classList.add("readonly-share");
    getProjectIdByToken(viewToken)
      .then(function (pid) {
        if (!pid) {
          setLlmStatus("Shared design not found.");
          return;
        }
        return fetch("/api/projects/" + pid)
          .then(function (r) {
            if (!r.ok) throw new Error("status " + r.status);
            return r.json();
          })
          .then(function (loaded) {
            applyAnalysisFromObject(loaded);
            show3D();
          });
      })
      .catch(function (err) {
        setLlmStatus("Could not open shared design: " + (err && err.message ? err.message : err));
      });
  }

  // Upload overlay wiring
  var uploadOverlay = document.getElementById("upload-overlay");
  var uploadOverlayInput = document.getElementById("upload-overlay-input");
  var uploadOverlayDemo = document.getElementById("upload-overlay-demo");

  function dismissOverlay() {
    if (uploadOverlay) uploadOverlay.hidden = true;
  }

  function bootWithDemo() {
    dismissOverlay();
    displayState.furniture = true;
    setPhase("plan");
    boot();
  }

  function bootWithDataUrl(dataUrl) {
    plan.src = dataUrl;
    plan.onload = function () {
      onPlanLoaded();
      preloadGlbTopDownIcons().catch(function () {});
      runVisionOnPlanImage();
    };
  }

  async function bootWithFile(file) {
    lastOpenedFile = file;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isDxf = file.name.toLowerCase().endsWith(".dxf");
    if (isPdf) {
      try { bootWithDataUrl(await pickPageFromPdf(file)); } catch { /* cancelled */ }
      return;
    }
    if (isDxf) {
      try { bootWithDataUrl(await cadFileToDataUrl(file)); } catch (err) {
        alert("Could not render DXF: " + err.message);
      }
      return;
    }
    const isDwg = file.name.toLowerCase().endsWith(".dwg");
    if (isDwg) {
      try { bootWithDataUrl(await dwgFileToDataUrl(file)); } catch (err) {
        alert("Could not render DWG: " + err.message);
      }
      return;
    }
    plan.src = URL.createObjectURL(file);
    plan.onload = function () {
      onPlanLoaded();
      runVisionOnFile(file);
    };
  }

  if (uploadOverlayDemo) uploadOverlayDemo.addEventListener("click", bootWithDemo);
  if (phaseNav) {
    phaseNav.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-phase]");
      if (btn) setPhase(btn.dataset.phase);
    });
  }
  if (planRail) {
    planRail.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-plan-tool]");
      if (btn && geo) geo.toggleTool(btn.dataset.planTool);
    });
  }
  if (planUndo) planUndo.addEventListener("click", function () {
    if (geo) geo.performUndo();
  });
  if (uploadOverlayInput) {
    uploadOverlayInput.addEventListener("change", function () {
      var f = uploadOverlayInput.files && uploadOverlayInput.files[0];
      if (f) bootWithFile(f);
    });
  }
  var uploadOverlayCad = document.getElementById("upload-overlay-cad");
  if (uploadOverlayCad) {
    uploadOverlayCad.addEventListener("change", function () {
      var f = uploadOverlayCad.files && uploadOverlayCad.files[0];
      if (f) bootWithFile(f);
    });
  }

  var uploadDropZone = document.getElementById("upload-drop-zone");
  if (uploadDropZone) {
    ["dragenter", "dragover"].forEach(function (type) {
      uploadDropZone.addEventListener(type, function (e) {
        e.preventDefault();
        uploadDropZone.classList.add("upload-overlay__drop--active");
      });
    });
    ["dragleave", "drop"].forEach(function (type) {
      uploadDropZone.addEventListener(type, function (e) {
        e.preventDefault();
        uploadDropZone.classList.remove("upload-overlay__drop--active");
      });
    });
    uploadDropZone.addEventListener("drop", function (e) {
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) bootWithFile(file);
    });
  }

  if (viewToken) {
    dismissOverlay();
    if (hasSb) {
      loadCatalogsFromSupabase().then(bootSharedViewer).catch(bootSharedViewer);
    } else {
      bootSharedViewer();
    }
  } else if (hasSb) {
    loadCatalogsFromSupabase()
      .then(function () {
        bootWithDemo();
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : String(err);
        setLlmStatus("Catalog error: " + msg);
        bootWithDemo();
      });
  } else {
    syncCatalogDrawerRows();
    bootWithDemo();
  }
}
