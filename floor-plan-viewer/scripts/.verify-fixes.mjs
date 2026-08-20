/** Verify Track A fixes + Track B refactor behavior. Run: node scripts/.verify-fixes.mjs */
import { chromium } from "playwright";

var browser = await chromium.launch();
var page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
var errors = [];
page.on("pageerror", function (e) { errors.push(String(e)); });

// Mock the photoreal API and capture the prompt the app sends.
var capturedPrompt = null;
await page.route("**/api/photoreal", async function (route) {
  var body = route.request().postDataJSON();
  capturedPrompt = body && body.prompt;
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ url: "https://example.com/mock-render.png" }),
  });
});

await page.goto("http://localhost:5199/", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

await page.getByRole("button", { name: "Realistic 3D" }).click({ force: true });
await page.waitForTimeout(3000);

// --- Fix A4: minimap size ---
await page.click("#btn3d-path", { force: true });
await page.waitForTimeout(600);
var mapBox = await page.locator("#minimap-map").boundingBox();
console.log("[A4] minimap map width:", mapBox ? mapBox.width : "none", "(expect 280)");

// --- Fix A3: opening minimap exits move mode ---
await page.click("#btn3d-path", { force: true }); // close first
await page.waitForTimeout(300);
await page.click("#btn3d-move", { force: true }); // enter move mode
await page.waitForTimeout(300);
var moveActiveBefore = await page.evaluate(function () {
  return document.getElementById("btn3d-move").classList.contains("view3d-btn--active");
});
await page.click("#btn3d-path", { force: true }); // open minimap
await page.waitForTimeout(300);
var st = await page.evaluate(function () {
  return {
    moveActive: document.getElementById("btn3d-move").classList.contains("view3d-btn--active"),
    pathActive: document.getElementById("btn3d-path").classList.contains("view3d-btn--active"),
    minimapVisible: !document.getElementById("view3d-minimap").hidden,
  };
});
console.log("[A3] move active before open:", moveActiveBefore, "| after open:", st.moveActive,
  "| minimap visible:", st.minimapVisible, "| path active:", st.pathActive);

// Minimap drag still works after refactor (B2: placeCameraFromMiniMap)
var camBefore = await page.evaluate(function () {
  var el = document.getElementById("minimap-cam");
  return { left: el.style.left, top: el.style.top };
});
var box = await page.locator("#minimap-map").boundingBox();
await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.3);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.4, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(400);
var camAfter = await page.evaluate(function () {
  var el = document.getElementById("minimap-cam");
  return { left: el.style.left, top: el.style.top };
});
console.log("[B2] cam dot before:", JSON.stringify(camBefore), "after:", JSON.stringify(camAfter),
  "| moved:", camBefore.left !== camAfter.left || camBefore.top !== camAfter.top);

await page.screenshot({ path: "scripts/.verify-fixes-3d.png" });

// --- Fix A1: photoreal prompt describes the design ---
await page.click("#btn3d-photoreal", { force: true, timeout: 150000 });
// snapshot render in headless software WebGL is slow
for (var i = 0; i < 120 && capturedPrompt === null; i++) await page.waitForTimeout(1000);
console.log("[A1] prompt sent:", capturedPrompt ? JSON.stringify(capturedPrompt) : "NOT CAPTURED");
console.log("[A1] generic fallback used:", capturedPrompt ? /modern furniture/.test(capturedPrompt) : "n/a");
await page.waitForTimeout(500);
await page.screenshot({ path: "scripts/.verify-fixes-photoreal.png" });
// close photoreal overlay
await page.evaluate(function () {
  var ov = document.getElementById("photoreal-overlay");
  if (ov) ov.hidden = true;
});

// --- Fix A2: minimap RAF loop stops when switching back to 2D ---
await page.getByRole("button", { name: "2D View" }).click({ force: true });
await page.waitForTimeout(400);
var after2d = await page.evaluate(function () {
  return new Promise(function (resolve) {
    var minimapHidden = document.getElementById("view3d-minimap").hidden;
    var pathActive = document.getElementById("btn3d-path").classList.contains("view3d-btn--active");
    var count = 0;
    var orig = window.requestAnimationFrame;
    window.requestAnimationFrame = function (cb) { count++; return orig.call(window, cb); };
    setTimeout(function () {
      window.requestAnimationFrame = orig;
      resolve({ minimapHidden: minimapHidden, pathActive: pathActive, rafCallsIn800ms: count });
    }, 800);
  });
});
console.log("[A2] after switch to 2D:", JSON.stringify(after2d), "(expect hidden:true, active:false, rafCalls ~0)");

// Probe: re-enter 3D, minimap reopens cleanly
await page.getByRole("button", { name: "Realistic 3D" }).click({ force: true });
await page.waitForTimeout(2500);
await page.click("#btn3d-path", { force: true });
await page.waitForTimeout(500);
var reopen = await page.evaluate(function () {
  return {
    visible: !document.getElementById("view3d-minimap").hidden,
    imgSrc: !!document.getElementById("minimap-img").src,
  };
});
console.log("[probe] minimap after 2D->3D round trip:", JSON.stringify(reopen));

console.log("page errors:", errors.length ? errors : "none");
await browser.close();
