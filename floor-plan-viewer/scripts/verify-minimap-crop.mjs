/** Verify mini-map auto-crop + enlarged key-plan panel. Run: node scripts/verify-minimap-crop.mjs */
import { chromium } from "playwright";
import { PNG } from "pngjs";
import fs from "node:fs";

var BASE = process.env.VERIFY_BASE || "http://localhost:5173";

// --- Fixture: A4-ish document page, drawing confined to the top third ---
var W = 1240;
var H = 1754;
var png = new PNG({ width: W, height: H });
png.data.fill(255);

function fillRect(x, y, rw, rh, v) {
  for (var yy = y; yy < y + rh; yy++) {
    for (var xx = x; xx < x + rw; xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      var o = (yy * W + xx) * 4;
      png.data[o] = v;
      png.data[o + 1] = v;
      png.data[o + 2] = v;
      png.data[o + 3] = 255;
    }
  }
}
function frameRect(x, y, rw, rh, t, v) {
  fillRect(x, y, rw, t, v);
  fillRect(x, y + rh - t, rw, t, v);
  fillRect(x, y, t, rh, v);
  fillRect(x + rw - t, y, t, rh, v);
}

fillRect(120, 70, 420, 8, 60); // title underline
frameRect(120, 140, 1000, 560, 10, 30); // outer walls
fillRect(520, 140, 10, 340, 30); // room divider
fillRect(120, 470, 500, 10, 30); // lower divider
frameRect(200, 220, 120, 80, 6, 90); // some furniture
frameRect(700, 260, 160, 90, 6, 90);

var fixturePath = "scripts/.verify-crop-fixture.png";
fs.writeFileSync(fixturePath, PNG.sync.write(png));

var browser = await chromium.launch();
var page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
var errors = [];
page.on("pageerror", function (e) { errors.push(String(e)); });

// --- Pass 1: uploaded document page → mini-map should show cropped drawing ---
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.setInputFiles("#upload-overlay-input", fixturePath);
await page.waitForTimeout(1800);

await page.getByRole("button", { name: "Realistic 3D" }).click({ force: true });
await page.waitForTimeout(3000);
await page.click("#btn3d-path", { force: true });
await page.waitForTimeout(1800); // crop runs async after open

var state = await page.evaluate(function () {
  var img = document.getElementById("minimap-img");
  var map = document.getElementById("minimap-map");
  var box = map.getBoundingClientRect();
  return {
    srcIsDataPng: img.src.indexOf("data:image/png") === 0,
    natW: img.naturalWidth,
    natH: img.naturalHeight,
    mapW: Math.round(box.width),
    mapH: Math.round(box.height),
  };
});
// Full page is portrait (1240x1754 ≈ 0.71 aspect); the drawing region is
// landscape (~1050x680 ≈ 1.5). A landscape mini-map proves the crop ran.
var aspect = state.natW / state.natH;
console.log("cropped src applied:", state.srcIsDataPng);
console.log("mini-map image", state.natW + "x" + state.natH, "aspect", aspect.toFixed(2), "(fixture page is 0.71)");
console.log("panel size:", state.mapW + "x" + state.mapH, "(was 280 wide)");
console.log("crop OK:", state.srcIsDataPng && aspect > 1.2, "| bigger OK:", state.mapW >= 380);

await page.screenshot({ path: "scripts/.verify-crop-minimap.png" });

// --- Pass 2: demo plan → interactions still work on the (possibly) cropped map ---
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.click("#upload-overlay-demo");
await page.waitForTimeout(2000);
await page.getByRole("button", { name: "Realistic 3D" }).click({ force: true });
await page.waitForTimeout(3000);
await page.click("#btn3d-path", { force: true });
await page.waitForTimeout(1800);

var camBefore = await page.evaluate(function () {
  var el = document.getElementById("minimap-cam");
  return { left: el.style.left, top: el.style.top };
});
var box = await page.locator("#minimap-map").boundingBox();
await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.35, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(400);
var camAfter = await page.evaluate(function () {
  var el = document.getElementById("minimap-cam");
  return { left: el.style.left, top: el.style.top };
});
console.log("cam dot before:", JSON.stringify(camBefore), "after:", JSON.stringify(camAfter));
console.log("dot moved:", camBefore.left !== camAfter.left || camBefore.top !== camAfter.top);

await page.screenshot({ path: "scripts/.verify-crop-demo.png" });
console.log("page errors:", errors.length ? errors : "none");
await browser.close();
