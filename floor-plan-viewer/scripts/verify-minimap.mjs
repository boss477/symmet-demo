/** Verify Camera mini-map + Snap button in 3D view. Run: node scripts/verify-minimap.mjs */
import { chromium } from "playwright";

var browser = await chromium.launch();
var page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
var errors = [];
page.on("pageerror", function (e) { errors.push(String(e)); });

await page.goto("http://localhost:5199/", { waitUntil: "networkidle" });
await page.waitForTimeout(2500); // fixture + auto-stage

// Switch to 3D
await page.getByRole("button", { name: "Realistic 3D" }).click({ force: true });
await page.waitForTimeout(3000); // 3D init + GLB attempts

await page.screenshot({ path: "scripts/.verify-3d-before.png" });

// Open the Camera mini-map (force: floating furniture toolbar may overlap the bar)
await page.click("#btn3d-path", { force: true });
await page.waitForTimeout(600);

var minimapVisible = await page.isVisible("#view3d-minimap");
var imgSrc = await page.getAttribute("#minimap-img", "src");
console.log("minimap visible:", minimapVisible, "| img src set:", !!imgSrc);

var camBefore = await page.evaluate(function () {
  var el = document.getElementById("minimap-cam");
  return { left: el.style.left, top: el.style.top };
});

// Drag camera dot to upper-left quarter of the map
var box = await page.locator("#minimap-map").boundingBox();
await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(400);

var camAfter = await page.evaluate(function () {
  var el = document.getElementById("minimap-cam");
  return { left: el.style.left, top: el.style.top };
});
console.log("cam dot before:", JSON.stringify(camBefore), "after:", JSON.stringify(camAfter));
console.log("dot moved:", camBefore.left !== camAfter.left || camBefore.top !== camAfter.top);

// Height slider (set via JS — vertical writing-mode confuses Playwright fill)
var heightResult = await page.evaluate(function () {
  var slider = document.getElementById("minimap-height");
  slider.value = "35";
  slider.dispatchEvent(new Event("input", { bubbles: true }));
  return slider.value;
});
console.log("height slider set to:", heightResult);
await page.waitForTimeout(300);

// Snap button triggers a download. Headless software-WebGL renders the
// 1920x1080 snapshot very slowly — allow generous timeouts.
var downloadPromise = page.waitForEvent("download", { timeout: 150000 }).catch(function () { return null; });
await page.click("#btn3d-snap", { force: true, timeout: 150000 });
var download = await downloadPromise;
console.log("snap download:", download ? download.suggestedFilename() : "FAILED");

await page.screenshot({ path: "scripts/.verify-minimap.png" });
console.log("page errors:", errors.length ? errors : "none");
await browser.close();
