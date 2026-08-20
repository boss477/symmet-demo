/** Verify Windows move/delete tool in 2D + 3D interaction smoke. Run: node verify-windows-tool.mjs */
import { chromium } from "playwright";

var browser = await chromium.launch();
var page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
var errors = [];
page.on("pageerror", function (e) { errors.push(String(e)); });

// Inject a wall + two windows into the demo fixture (fixture ships without them).
await page.route("**/fixtures/sample-plan.json", async function (route) {
  var res = await route.fetch();
  var json = await res.json();
  json.walls = (json.walls || []).concat([
    { id: "wall-t1", points: [{ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.3 }] },
  ]);
  json.windows = [
    { position: { x: 0.5, y: 0.33 }, width: 0.1 },
    { position: { x: 0.7, y: 0.33 }, width: 0.08 },
  ];
  await route.fulfill({ response: res, json: json });
});

await page.goto("http://localhost:5199/", { waitUntil: "networkidle" });
await page.click("#upload-overlay-demo");
await page.waitForTimeout(3000); // fixture + auto-stage

// --- 2D Windows tool ---
await page.getByRole("button", { name: "Windows", exact: true }).click({ force: true });
await page.waitForTimeout(400);

var hitCount = await page.locator("#overlay .plan-window-hit").count();
console.log("window hit rects after enabling tool:", hitCount, hitCount === 2 ? "PASS" : "FAIL");

function readWindowNorm(i) {
  return page.evaluate(function (idx) {
    var svg = document.getElementById("overlay");
    var r = svg.querySelectorAll(".plan-window-hit")[idx];
    var vb = svg.getAttribute("viewBox").split(" ");
    var W = parseFloat(vb[2]);
    var H = parseFloat(vb[3]);
    return {
      x: (parseFloat(r.getAttribute("x")) + parseFloat(r.getAttribute("width")) / 2) / W,
      y: (parseFloat(r.getAttribute("y")) + parseFloat(r.getAttribute("height")) / 2) / H,
      id: r.getAttribute("data-window-id"),
    };
  }, i);
}

var before = await readWindowNorm(0);
console.log("window[0] before drag:", JSON.stringify(before));

// Drag window 0: +0.05 in x, up to y≈0.315 (within 0.02 of the wall at y=0.30 → should snap to 0.30)
var overlayBox = await page.locator("#overlay").boundingBox();
var rect0 = await page.locator("#overlay .plan-window-hit").first().boundingBox();
var startX = rect0.x + rect0.width / 2;
var startY = rect0.y + rect0.height / 2;
await page.mouse.move(startX, startY);
await page.mouse.down();
await page.mouse.move(startX + overlayBox.width * 0.05, startY - overlayBox.height * 0.015, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);

var after = await readWindowNorm(0);
console.log("window[0] after drag:", JSON.stringify(after));
var movedX = Math.abs(after.x - (before.x + 0.05)) < 0.01;
var snappedY = Math.abs(after.y - 0.3) < 0.005;
console.log("moved in x:", movedX ? "PASS" : "FAIL", "| snapped onto wall y=0.30:", snappedY ? "PASS" : "FAIL");

// Selected → Delete window button visible, then delete
var delVisible = await page.isVisible(".delete-window-btn");
console.log("Delete window button visible:", delVisible ? "PASS" : "FAIL");
await page.screenshot({ path: "scripts/.verify-windows-2d.png" });
await page.click(".delete-window-btn");
await page.waitForTimeout(300);
var countAfterDelete = await page.locator("#overlay .plan-window-hit").count();
console.log("windows after delete:", countAfterDelete, countAfterDelete === 1 ? "PASS" : "FAIL");

// Undo restores the deleted window
await page.keyboard.press("Control+z");
await page.waitForTimeout(300);
var countAfterUndo = await page.locator("#overlay .plan-window-hit").count();
console.log("windows after undo:", countAfterUndo, countAfterUndo === 2 ? "PASS" : "FAIL");

// --- 3D interaction smoke (hover throttle + orbit skip + broad-phase picking) ---
await page.getByRole("button", { name: "Realistic 3D" }).click({ force: true });
await page.waitForTimeout(3500);
var canvas = await page.locator("#plan3d-container canvas, canvas").first().boundingBox();
if (canvas) {
  var cx = canvas.x + canvas.width / 2;
  var cy = canvas.y + canvas.height / 2;
  // hover sweep (raycasts, throttled)
  for (var i = 0; i < 10; i++) {
    await page.mouse.move(cx - 200 + i * 40, cy - 50 + i * 10);
    await page.waitForTimeout(20);
  }
  // orbit drag (raycasts skipped while buttons held)
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 150, cy - 80, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  // click-select a furniture group (broad-phase + narrow-phase)
  await page.mouse.click(cx - 60, cy + 40);
  await page.waitForTimeout(500);
  console.log("3D hover/orbit/click smoke: done");
} else {
  console.log("3D canvas not found: FAIL");
}
await page.screenshot({ path: "scripts/.verify-windows-3d.png" });

console.log("page errors:", errors.length ? errors : "none");
await browser.close();
