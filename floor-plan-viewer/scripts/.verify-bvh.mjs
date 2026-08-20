/** Verify BVH-accelerated picking: GLBs load with boundsTree, clicking furniture still selects it. */
import { chromium } from "playwright";
var browser = await chromium.launch();
var page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
var errors = [];
var warns = [];
page.on("pageerror", function (e) { errors.push(String(e)); });
page.on("console", function (m) {
  var t = m.text();
  if (t.indexOf("BVH build skipped") >= 0) warns.push(t);
});

await page.goto("http://localhost:5199/", { waitUntil: "networkidle" });
await page.click("#upload-overlay-demo");
await page.waitForTimeout(3000);
await page.getByRole("button", { name: "Realistic 3D" }).click({ force: true });
await page.waitForTimeout(4000); // 3D init + GLB loads + BVH build

var c = await page.locator("canvas").first().boundingBox();
var selected = false;
outer:
for (var gy = 0.3; gy <= 0.7; gy += 0.1) {
  for (var gx = 0.25; gx <= 0.75; gx += 0.08) {
    await page.mouse.click(c.x + c.width * gx, c.y + c.height * gy);
    await page.waitForTimeout(120);
    selected = await page.evaluate(function () {
      return document.body.classList.contains("view3d-has-selection");
    });
    if (selected) break outer;
  }
}
console.log("furniture selected via BVH raycast:", selected ? "PASS" : "FAIL");
console.log("BVH build warnings:", warns.length ? warns : "none");
console.log("page errors:", errors.length ? errors : "none");
await page.screenshot({ path: "scripts/.verify-bvh.png" });
await browser.close();
