/** Verify adaptive-quality fast mode: canvas buffer drops to 1x DPR while orbiting, restores on settle. */
import { chromium } from "playwright";
var browser = await chromium.launch();
var page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });
var errors = [];
page.on("pageerror", function (e) { errors.push(String(e)); });

await page.goto("http://localhost:5199/", { waitUntil: "networkidle" });
await page.click("#upload-overlay-demo");
await page.waitForTimeout(3000);
await page.getByRole("button", { name: "Realistic 3D" }).click({ force: true });
await page.waitForTimeout(3500);

function bufferState() {
  return page.evaluate(function () {
    var c = document.querySelector("canvas");
    var r = c.getBoundingClientRect();
    return { buf: c.width, css: Math.round(r.width), ratio: +(c.width / r.width).toFixed(2) };
  });
}

var idle = await bufferState();
console.log("idle:", JSON.stringify(idle));

// Start an orbit drag and sample mid-drag (button still held)
var c = await page.locator("canvas").first().boundingBox();
var cx = c.x + c.width / 2, cy = c.y + c.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + 100, cy - 50, { steps: 10 });
var during = await bufferState();
await page.mouse.move(cx + 200, cy - 90, { steps: 10 });
await page.mouse.up();
console.log("during orbit:", JSON.stringify(during));

// Headless software rendering is slow — damping takes seconds to settle. Poll.
var after = null;
for (var i = 0; i < 20; i++) {
  await page.waitForTimeout(500);
  after = await bufferState();
  if (after.ratio > 1.5) break;
}
console.log("after settle:", JSON.stringify(after));

console.log("dropped to 1x during orbit:", during.ratio <= 1.05 ? "PASS" : "FAIL");
console.log("restored after settle:", after.ratio > 1.5 && after.ratio === idle.ratio ? "PASS" : "FAIL");
console.log("page errors:", errors.length ? errors : "none");
await browser.close();
