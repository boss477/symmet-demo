/**
 * Unified 2D furniture icon rendering for svgRenderer.
 */
import { parseSofaParams } from "../lib/catalogSizing.js";
import { inferFurnitureIcon, pickPlantVariant } from "../lib/inferFurnitureIcon.js";
import {
  itemGlbMetres,
  resolveItemGlbUrl,
} from "../lib/glbDemoSofa.js";
import {
  bakeGlbTopDownDataUrl,
  getCachedGlbTopDownUrl,
} from "./glbTopDownBake.js";
import {
  appendRichAreaRug,
  appendRichCoffeeTable,
  appendRichSideTable,
  appendRichSofa,
  appendRichChair,
  appendRichLoungeSofa,
  appendRichBed,
  appendRichBathtub,
  appendRichDesk,
  appendRichDiningTable,
  appendRichKitchenIsland,
  appendRichPlant,
  appendRichSink,
  appendRichToilet,
  appendRichWardrobe,
  appendCatalogPhotoIcon,
  appendGlbBakedIcon,
  ensureRichFurnitureDefs,
} from "./richFurnitureIcons.js";

function catalogPhotoUrl(row, item) {
  if (item && item.imageUrl) return item.imageUrl;
  if (row && row.image_2d_url) return row.image_2d_url;
  if (row && row.image_url) return row.image_url;
  if (row && row.plan2d_photo_url) return row.plan2d_photo_url;
  return null;
}

function wantsRichSvgSeating(item, catalogRow, inferred) {
  if (item && item.plan2dGlbUrl) return false;
  if (catalogRow && catalogRow.plan2d_glb_url) return false;
  if (item && (item.useGlbBake || item.iconMode === "glb")) return false;
  if (item && item.iconMode === "photo") return false;
  if (item && item.iconMode === "svg") return true;
  if (item && item.richIcon && String(item.richIcon).indexOf("sofa") >= 0) return true;
  if (item && item.richIcon === "chair") return true;
  if (item && item.catalogId && catalogRow) {
    var cat = String(catalogRow.category || "").toLowerCase();
    if (cat.indexOf("sofa") >= 0 || cat.indexOf("lounge") >= 0 || cat.indexOf("chair") >= 0) {
      return true;
    }
  }
  if (inferred && (inferred.icon === "sofa" || inferred.icon === "chair")) return true;
  return false;
}

function shouldUseCatalogPhoto(row, item, inferred) {
  if (item && item.iconMode === "svg") return false;
  if (item && item.iconMode === "photo") return true;
  if (wantsRichSvgSeating(item, row, inferred)) return false;
  var cat = row && row.category ? String(row.category).toLowerCase() : "";
  return cat.indexOf("sofa") >= 0 && !!catalogPhotoUrl(row, item);
}

function richSofaSeats(item, inferred, iconKey) {
  var seatMap = { sofa_1: 1, sofa_2: 2, sofa_3: 3 };
  return (
    seatMap[iconKey] ||
    (item && item.sofaSeats) ||
    (item && item.sofaParams && item.sofaParams.seats) ||
    inferred.seats ||
    2
  );
}

function renderRichSeating(g, w, h, item, catalogRow, inferred, iconKey) {
  var rot = item.rotationDeg != null ? item.rotationDeg : item.rotation || 0;
  var seats = richSofaSeats(item, inferred, iconKey);
  var params =
    (item && item.sofaParams) ||
    parseSofaParams(
      catalogRow && catalogRow.keywords,
      catalogRow && catalogRow.product_name,
      catalogRow && catalogRow.category,
      catalogRow && catalogRow.colours
    );
  var colorId =
    (item && item.sofaColorOverride) ||
    (item && item.sofaParams && item.sofaParams.color) ||
    params.color ||
    null;
  if (iconKey === "chair") {
    appendRichChair(g, w, h, colorId);
    return;
  }
  if (params.hasLounge) {
    appendRichLoungeSofa(g, w, h, seats, rot, colorId);
  } else {
    appendRichSofa(g, w, h, seats, rot, colorId);
  }
}

function tryAppendPlan2dPngIcon(g, w, h, item, catalogRow) {
  var url =
    (item && item.plan2dGlbUrl) ||
    (catalogRow && catalogRow.plan2d_glb_url) ||
    "";
  url = String(url || "").trim();
  if (!/^https?:\/\//i.test(url)) return false;
  appendGlbBakedIcon(g, w, h, url);
  return true;
}

function tryAppendGlbBakedIcon(g, w, h, item) {
  if (!item || !item.useGlbBake) return false;
  var glbUrl = resolveItemGlbUrl(item);
  var dims = itemGlbMetres(item);
  var baked = getCachedGlbTopDownUrl(glbUrl, dims.wM, dims.dM);
  if (baked) {
    appendGlbBakedIcon(g, w, h, baked);
    return true;
  }
  if (item._glbBakeKey !== glbUrl + "|" + dims.wM + "|" + dims.dM) {
    item._glbBakeKey = glbUrl + "|" + dims.wM + "|" + dims.dM;
    bakeGlbTopDownDataUrl(glbUrl, dims.wM, dims.dM, dims.hM).catch(function () {});
  }
  return false;
}

/**
 * @param {SVGGElement} g
 * @param {object} item
 * @param {{ w: number, h: number }} box
 * @param {object|null} catalogRow
 * @param {SVGDefsElement} defs
 */
export function appendFurniture2dIcon(g, item, box, catalogRow, defs) {
  ensureRichFurnitureDefs(defs);
  var w = box.w;
  var h = box.h;
  var inferred = inferFurnitureIcon(catalogRow, item);
  if (item && item.richIcon) inferred.icon = item.richIcon;
  if (item && item.chairCount) inferred.chairCount = item.chairCount;
  if (item && item.sofaSeats) inferred.seats = item.sofaSeats;

  if (tryAppendPlan2dPngIcon(g, w, h, item, catalogRow)) return;

  if (tryAppendGlbBakedIcon(g, w, h, item)) return;

  var iconKey = inferred.icon;
  var isRichSeating =
    iconKey === "sofa" ||
    iconKey === "sofa_1" ||
    iconKey === "sofa_2" ||
    iconKey === "sofa_3" ||
    iconKey === "chair";

  if (isRichSeating && wantsRichSvgSeating(item, catalogRow, inferred)) {
    renderRichSeating(g, w, h, item, catalogRow, inferred, iconKey);
    return;
  }

  if (shouldUseCatalogPhoto(catalogRow, item, inferred)) {
    appendCatalogPhotoIcon(g, w, h, catalogPhotoUrl(catalogRow, item));
    return;
  }

  switch (inferred.icon) {
    case "dining_table":
      appendRichDiningTable(
        g,
        w,
        h,
        inferred.chairCount || item.chairs || 8,
        item.rotationDeg != null ? item.rotationDeg : item.rotation || 0
      );
      break;
    case "bed":
      appendRichBed(g, w, h);
      break;
    case "toilet":
      appendRichToilet(g, w, h);
      break;
    case "bathtub":
      appendRichBathtub(g, w, h);
      break;
    case "plant":
      appendRichPlant(g, w, h, item.plantVariant || pickPlantVariant(item.id || item.x + item.y));
      break;
    case "sink":
      appendRichSink(g, w, h);
      break;
    case "desk":
      appendRichDesk(g, w, h);
      break;
    case "kitchen_island":
      appendRichKitchenIsland(g, w, h);
      break;
    case "area_rug":
      appendRichAreaRug(g, w, h);
      break;
    case "coffee_table":
      appendRichCoffeeTable(g, w, h);
      break;
    case "side_table":
      appendRichSideTable(g, w, h, false);
      break;
    case "wardrobe":
      appendRichWardrobe(g, w, h);
      break;
    case "chair":
    case "sofa":
    case "sofa_1":
    case "sofa_2":
    case "sofa_3":
      renderRichSeating(g, w, h, item, catalogRow, inferred, inferred.icon);
      break;
    default:
      appendRichPlant(g, w, h, "plant_0");
  }
}
