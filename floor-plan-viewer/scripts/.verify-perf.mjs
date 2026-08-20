/** Verify #1 (no preserveDrawingBuffer → snapshot still works) and #4 (frozen shadow map → scene renders shadows). */
import { chromium } from "playwright";
import { PNG } from "pngjs";
import fs from "node:fs";

var browser = await chromium.launch();
var page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
var errors = [];
page.on("pageerror", function (e) { errors.push(String(e)); });

await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// Dismiss upload modal via demo fixture
await page.click("#upload-overlay-demo");
await page.waitForTimeout(2500);

// Switch to 3D
await page.getByRole("button", { name: "Realistic 3D" }).click({ force: true });
await page.waitForTimeout(6000); // 3D init + GLB loads + one-shot shadow render

await page.screenshot({ path: "scripts/.verify-perf-3d.png" });

// Orbit-drag: with on-demand rendering the view must still update live and
// keep rendering through damping after release (no freeze mid-damping).
var canvas = await page.locator("#viewport3d canvas").first().boundingBox();
var cx = canvas.x + canvas.width / 2;
var cy = canvas.y + canvas.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + 200, cy + 60, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(1800); // damping settle + heartbeat
await page.screenshot({ path: "scripts/.verify-perf-3d-after-orbit.png" });

var before = fs.readFileSync("scripts/.verify-perf-3d.png");
var after = fs.readFileSync("scripts/.verify-perf-3d-after-orbit.png");
console.log("orbit changed view:", !before.equals(after) ? "YES (OK)" : "NO (render-on-demand froze!)");

// Snap → exercises snapshot3D() → renderer.render + toDataURL (the path at
// risk without preserveDrawingBuffer). Headless software WebGL is slow at 1080p.
var downloadPromise = page.waitForEvent("download", { timeout: 150000 }).catch(function () { return null; });
await page.click("#btn3d-snap", { force: true, timeout: 150000 });
var download = await downloadPromise;
if (!download) {
  console.log("snap download: FAILED");
} else {
  var snapPath = "scripts/.verify-perf-snap.png";
  await download.saveAs(snapPath);
  var png = PNG.sync.read(fs.readFileSync(snapPath));
  var sum = 0;
  var n = png.width * png.height;
  for (var i = 0; i < n; i++) {
    sum += (png.data[i * 4] + png.data[i * 4 + 1] + png.data[i * 4 + 2]) / 3;
  }
  var avg = sum / n;
  console.log("snap download:", download.suggestedFilename(), png.width + "x" + png.height, "avg brightness:", avg.toFixed(1), avg > 8 ? "(NOT BLACK — OK)" : "(BLACK — preserveDrawingBuffer regression!)");
}

console.log("page errors:", errors.length ? errors : "none");
await browser.close();
