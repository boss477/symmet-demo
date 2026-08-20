/** Hardcoded living-room demo sofa (2D bake + 3D mesh). */
export var LIVING_ROOM_DEMO_GLB_URL =
  "https://pub-cdfdd6db8e374af085a2724000f8977c.r2.dev/HUDSON.glb";

export var LIVING_ROOM_DEMO_W_MM = 2200;
export var LIVING_ROOM_DEMO_D_MM = 950;
export var LIVING_ROOM_DEMO_H_MM = 850;

export function livingRoomDemoMetres() {
  return {
    wM: LIVING_ROOM_DEMO_W_MM / 1000,
    dM: LIVING_ROOM_DEMO_D_MM / 1000,
    hM: LIVING_ROOM_DEMO_H_MM / 1000,
  };
}

/** @param {object} item */
export function itemUsesGlbModel(item) {
  return !!(item && item.useGlbModel);
}

function isDemoGlbItem(item) {
  return !!(
    item &&
    (item.stageRole === "living-glb-demo" || item.id === "__default_sofa__")
  );
}

/** @param {object} item */
export function resolveItemGlbUrl(item) {
  if (item && item.glbUrl) {
    var url = String(item.glbUrl).trim();
    if (url) return url;
  }
  if (isDemoGlbItem(item)) return LIVING_ROOM_DEMO_GLB_URL;
  return "";
}

/** @param {object} item */
export function itemGlbMetres(item) {
  var wMm = item && item.catalogWidthMm != null ? item.catalogWidthMm : LIVING_ROOM_DEMO_W_MM;
  var dMm = item && item.catalogDepthMm != null ? item.catalogDepthMm : LIVING_ROOM_DEMO_D_MM;
  var hMm = item && item.catalogHeightMm != null ? item.catalogHeightMm : LIVING_ROOM_DEMO_H_MM;
  return { wM: wMm / 1000, dM: dMm / 1000, hM: hMm / 1000 };
}
