import PptxGenJS from "pptxgenjs";

/**
 * Pitch-deck (.pptx) generator.
 *
 * Clean white proposal layout modelled on the ELA-style reference deck:
 * cover (faded plan + "DESIGN PROPOSAL") → "PROPOSED LAYOUTS" divider with
 * the plan photo and a diagonal cut → per-floor layout slide (angled ribbon
 * title, logo badge, full-width plan, north arrow) → BOQ table → render
 * slots → thank-you.
 *
 * Pass the 2D plan image as a data URL in `opts.planImage`; renders are an
 * array of image URLs in `opts.renders` — any slide without an image shows a
 * labelled placeholder frame.
 */

// 16:9 inches.
var W = 13.333;
var H = 7.5;

// Brand palette (override via opts.brand).
var BRAND = {
  ink: "1F2A3A", // dark navy — ribbons, titles, footer
  accent: "D04A02", // small highlights only
  grey: "767676",
  greyLight: "D9D9D9",
  paper: "FFFFFF",
  sidebar: "INDIA DESIGN STUDIO",
  website: "", // shown in the cover footer when set, e.g. "www.example.in"
};

function brand(opts) {
  return Object.assign({}, BRAND, (opts && opts.brand) || {});
}

function formatInr(v) {
  if (v == null) return "—";
  return "₹ " + Number(v).toLocaleString("en-IN");
}

// Dark angled ribbon banner, top-left (like "9TH FLOOR PROPOSED LAYOUT").
function ribbon(slide, b, text) {
  var label = String(text || "").toUpperCase();
  var rw = Math.min(0.7 + label.length * 0.135, 8.5);
  slide.addShape("rect", { x: 0, y: 0.42, w: rw, h: 0.52, fill: { color: b.ink } });
  // Slanted right end of the banner.
  slide.addShape("rtTriangle", { x: rw, y: 0.42, w: 0.32, h: 0.52, fill: { color: b.ink } });
  slide.addText(label, {
    x: 0.3, y: 0.42, w: rw, h: 0.52,
    fontSize: 13, bold: true, color: b.paper, charSpacing: 2, valign: "middle",
  });
}

// Small dark logo badge, top-right corner.
function logoBadge(slide, b) {
  var bw = Math.min(0.6 + b.sidebar.length * 0.1, 3.2);
  slide.addShape("roundRect", {
    x: W - bw - 0.35, y: 0.28, w: bw, h: 0.42,
    fill: { color: b.ink }, rectRadius: 0.06,
  });
  slide.addText(b.sidebar, {
    x: W - bw - 0.35, y: 0.28, w: bw, h: 0.42,
    align: "center", valign: "middle",
    fontSize: 9, bold: true, color: b.paper, charSpacing: 1.5,
  });
}

function pageNo(slide, b, pageNum) {
  if (pageNum == null) return;
  slide.addText(String(pageNum), {
    x: W - 0.8, y: H - 0.5, w: 0.5, h: 0.3,
    align: "right", fontSize: 9, color: b.grey,
  });
}

// North arrow, bottom-right of a plan slide.
function northArrow(slide, b) {
  slide.addText("N", {
    x: W - 0.92, y: H - 1.62, w: 0.44, h: 0.3,
    align: "center", fontSize: 12, bold: true, color: b.ink,
  });
  slide.addShape("triangle", {
    x: W - 0.88, y: H - 1.32, w: 0.36, h: 0.44,
    fill: { color: b.ink }, flipV: true,
  });
}

function addCover(pptx, b, opts) {
  var s = pptx.addSlide();
  s.background = { color: b.paper };

  // Decorative thick outline rings — one behind the title edge, one low-centre.
  s.addShape("ellipse", { x: W - 2.5, y: 0.5, w: 2.2, h: 2.2, fill: { type: "none" }, line: { color: "EEEEF0", width: 24 } });

  // Footer band (light grey) with website + date.
  s.addShape("rect", { x: 0, y: H - 1.25, w: W, h: 1.25, fill: { color: "F4F4F6" } });
  s.addShape("ellipse", { x: 5.7, y: H - 2.6, w: 2.2, h: 2.2, fill: { type: "none" }, line: { color: "EEEEF0", width: 24 } });

  // Full-height navy bar, left edge — rounded right side (left corners sit off-slide).
  s.addShape("roundRect", { x: -0.65, y: -0.2, w: 1.4, h: H + 0.4, fill: { color: b.ink }, rectRadius: 0.5 });

  logoBadge(s, b);

  s.addText([
    { text: "DESIGN ", options: { color: b.ink } },
    { text: "PROPOSAL", options: { color: b.grey } },
  ], {
    x: 1.25, y: 0.55, w: 11.6, h: 1.3,
    fontSize: 60, bold: true, charSpacing: 2,
  });
  s.addText((opts.projectName || "Project").toUpperCase(), {
    x: 1.32, y: 1.9, w: 11, h: 0.5,
    fontSize: 15, bold: true, color: b.grey, charSpacing: 3,
  });

  // Website line: small navy globe dot + address.
  var site = b.website || b.sidebar;
  s.addShape("ellipse", { x: 1.35, y: H - 1.02, w: 0.28, h: 0.28, fill: { color: b.ink } });
  s.addText(site, {
    x: 1.75, y: H - 1.09, w: 6, h: 0.42,
    valign: "middle", fontSize: 13, color: b.ink,
  });
  s.addText("DATE:   " + new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-"), {
    x: 1.35, y: H - 0.58, w: 6, h: 0.35,
    valign: "middle", fontSize: 11, color: b.ink, charSpacing: 1,
  });
}

// "PROPOSED LAYOUTS" divider — plan photo left, diagonal cut, spaced title right.
function addLayoutsDivider(pptx, b, planImage, pageNum) {
  var s = pptx.addSlide();
  s.background = { color: b.paper };

  var imgW = 6.4;
  if (planImage) {
    s.addImage({
      data: planImage,
      x: 0, y: 0, w: imgW, h: H,
      sizing: { type: "cover", w: imgW, h: H },
    });
  } else {
    s.addShape("rect", { x: 0, y: 0, w: imgW, h: H, fill: { color: "F2F2F2" } });
  }
  // White wedge slicing the image edge diagonally.
  s.addShape("rtTriangle", {
    x: imgW - 1.6, y: 0, w: 1.6, h: H,
    fill: { color: b.paper }, flipH: true,
  });

  logoBadge(s, b);

  s.addShape("rect", { x: 7.4, y: 2.75, w: 4.6, h: 0.02, fill: { color: b.grey } });
  s.addText("PROPOSED", {
    x: 7.2, y: 2.9, w: 5.2, h: 0.8,
    align: "center", fontSize: 30, bold: true, color: b.ink, charSpacing: 8,
  });
  s.addText("LAYOUTS", {
    x: 7.2, y: 3.65, w: 5.2, h: 0.8,
    align: "center", fontSize: 30, bold: true, color: b.ink, charSpacing: 8,
  });
  s.addShape("rect", { x: 7.4, y: 4.55, w: 4.6, h: 0.02, fill: { color: b.grey } });

  pageNo(s, b, pageNum);
}

// Full-width floor plan slide with ribbon title + north arrow.
function addLayoutSlide(pptx, b, planImage, label, pageNum) {
  var s = pptx.addSlide();
  s.background = { color: b.paper };
  ribbon(s, b, (label ? label + " " : "") + "Proposed Layout");
  logoBadge(s, b);

  var frame = { x: 0.7, y: 1.25, w: W - 1.4, h: H - 1.95 };
  if (planImage) {
    s.addImage(Object.assign({
      data: planImage,
      sizing: { type: "contain", w: frame.w, h: frame.h },
    }, frame));
  } else {
    s.addShape("rect", Object.assign({
      fill: { color: "F7F7F7" }, line: { color: b.greyLight, width: 1, dashType: "dash" },
    }, frame));
    s.addText("[ floor plan image unavailable ]", {
      x: frame.x, y: frame.y + frame.h / 2 - 0.3, w: frame.w, h: 0.6,
      align: "center", fontSize: 14, color: b.grey, italic: true,
    });
  }

  northArrow(s, b);
  pageNo(s, b, pageNum);
}

function addBoqTable(pptx, b, rows, projectName, pageNum) {
  var s = pptx.addSlide();
  s.background = { color: b.paper };
  ribbon(s, b, "Bill of Quantities");
  logoBadge(s, b);
  pageNo(s, b, pageNum);

  var hasPrice = rows.some(function (r) { return r.unitPrice != null; });
  var header = ["#", "SKU", "Product", "Category", "Dimensions", "Qty"];
  if (hasPrice) header.push("Unit", "Total");

  var headRow = header.map(function (t) {
    return {
      text: t,
      options: { bold: true, color: b.paper, fill: { color: b.ink }, fontSize: 9 },
    };
  });

  var body = rows.map(function (r, i) {
    var cells = [
      String(i + 1), r.productCode, r.name, r.category || "", r.dims || "—", String(r.qty),
    ];
    if (hasPrice) cells.push(formatInr(r.unitPrice), formatInr(r.total));
    return cells.map(function (c) {
      return { text: c, options: { fontSize: 8, color: b.ink } };
    });
  });

  var colW = hasPrice
    ? [0.5, 1.5, 3.2, 1.7, 1.9, 0.7, 1.3, 1.3]
    : [0.6, 2.0, 4.2, 2.2, 2.3, 0.8];

  s.addTable([headRow].concat(body), {
    x: 0.6, y: 1.25, w: W - 1.4,
    colW: colW,
    border: { type: "solid", pt: 0.5, color: "DDDDDD" },
    rowH: 0.3,
    valign: "middle",
    autoPage: true,
    autoPageRepeatHeader: true,
    autoPageLineWeight: -0.5,
  });

  if (hasPrice) {
    var grand = rows.reduce(function (sum, r) { return r.total != null ? sum + r.total : sum; }, 0);
    s.addText("Grand Total:  " + formatInr(grand), {
      x: W - 5, y: H - 0.85, w: 4.4, h: 0.4,
      align: "right", fontSize: 13, bold: true, color: b.ink,
    });
  }
}

function addRenderSlide(pptx, b, render, index, pageNum, planImage) {
  var s = pptx.addSlide();
  s.background = { color: b.paper };
  var title = (render && render.title) || "Proposed Render " + index;
  ribbon(s, b, title);
  logoBadge(s, b);
  pageNo(s, b, pageNum);

  // Render fills the left; key-plan column reserved on the right.
  var frame = { x: 0.35, y: 1.25, w: 9.55, h: H - 1.95 };
  if (render && render.url) {
    s.addImage(Object.assign({ path: render.url, sizing: { type: "contain", w: frame.w, h: frame.h } }, frame));
  } else {
    // Placeholder frame — drop a render URL here later.
    s.addShape("rect", Object.assign({
      fill: { color: "F7F7F7" }, line: { color: b.greyLight, width: 1, dashType: "dash" },
    }, frame));
    s.addText("[ render slot — pipe photoreal output here ]", {
      x: frame.x, y: frame.y + frame.h / 2 - 0.3, w: frame.w, h: 0.6,
      align: "center", fontSize: 14, color: b.grey, italic: true,
    });
  }

  // Key plan, right column: plan with the camera-angle marker showing where
  // this shot was taken; falls back to the bare plan when no marker thumb.
  var keyImg = (render && render.thumb) || planImage;
  if (keyImg) {
    var kw = 2.75, kh = 2.6;
    var kx = frame.x + frame.w + 0.35;
    var ky = frame.y + (frame.h - kh) / 2 - 0.3;
    s.addShape("rect", {
      x: kx, y: ky, w: kw, h: kh,
      fill: { color: b.paper }, line: { color: b.ink, width: 1.25 },
    });
    s.addImage({
      data: keyImg,
      x: kx + 0.08, y: ky + 0.08, w: kw - 0.16, h: kh - 0.16,
      sizing: { type: "contain", w: kw - 0.16, h: kh - 0.16 },
    });
    s.addText("KEY PLAN", {
      x: kx, y: ky + kh + 0.1, w: kw, h: 0.4,
      align: "center", fontSize: 16, bold: true, color: b.ink,
    });
  }
}

function addThankYou(pptx, b) {
  var s = pptx.addSlide();
  s.background = { color: b.ink };
  s.addText("Thank you", {
    x: 0.7, y: 3.0, w: 11, h: 1.2, fontSize: 48, color: b.paper, bold: true,
  });
  s.addText(b.sidebar, {
    x: 0.72, y: 4.2, w: 11, h: 0.5, fontSize: 14, color: b.paper, charSpacing: 2,
  });
}

/**
 * Build and download the deck.
 *
 * @param {Array}  rows   from buildBoqRows()
 * @param {Object} [opts]
 * @param {string} [opts.projectName]
 * @param {string} [opts.planImage]  2D plan as data URL (renderPlanThumbnail)
 * @param {string} [opts.floorLabel]  e.g. "9th Floor" — prefixes the layout slide title
 * @param {Array<{title?:string,url?:string,thumb?:string}>} [opts.renders]  render slots; empty url → placeholder
 * @param {number} [opts.renderSlots]  number of placeholder render slides when no renders given (default 4)
 * @param {Object} [opts.brand]  palette/logo-text overrides
 */
export function downloadDeck(rows, opts) {
  opts = opts || {};
  var b = brand(opts);
  var pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: W, height: H });
  pptx.layout = "WIDE";

  var page = 1;
  addCover(pptx, b, opts);
  addLayoutsDivider(pptx, b, opts.planImage, ++page);
  addLayoutSlide(pptx, b, opts.planImage, opts.floorLabel, ++page);
  addBoqTable(pptx, b, rows || [], opts.projectName, ++page);

  var renders = (opts.renders && opts.renders.length)
    ? opts.renders
    : new Array(opts.renderSlots || 4).fill(null);
  renders.forEach(function (r, i) {
    addRenderSlide(pptx, b, r, i + 1, ++page, opts.planImage);
  });

  addThankYou(pptx, b);

  var filename = (opts.projectName || "Proposal").replace(/[^a-z0-9_\-]/gi, "_") + "_Deck.pptx";
  return pptx.writeFile({ fileName: filename });
}
