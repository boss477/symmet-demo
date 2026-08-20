/** Verify: applied scale line is hidden after Apply, scale chip stays, Undo reverts calibration. */
import { chromium } from "playwright";

var browser = await chromium.launch();
var page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
var errors = [];
page.on("pageerror", function (e) { errors.push(String(e)); });

await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// Dismiss upload modal via demo fixture
await page.click("#upload-overlay-demo");
await page.waitForTimeout(2500);

var chip = page.locator(".calibration-scale");
var chipBefore = await chip.textContent();
console.log("chip before:", chipBefore.trim());

// Activate Set scale and click two points on the plan
await page.getByRole("button", { name: "Set scale" }).click({ force: true });
var box = await page.locator("#overlay").boundingBox();
await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.5);
await page.waitForTimeout(300);

// Draft line should be visible while picking
var draftLines = await page.locator(".plan-calibration-line").count();
console.log("draft line visible during picking:", draftLines > 0 ? "YES (OK)" : "NO (FAIL)");

// Enter length + apply
await page.locator(".scale-length-input").fill("5");
await page.locator(".scale-apply-btn").click();
await page.waitForTimeout(500);

var chipAfter = (await chip.textContent()).trim();
var linesAfter = await page.locator(".plan-calibration-line").count();
var inputHidden = await page.locator(".scale-length-wrap").isHidden();
console.log("chip after apply:", chipAfter);
console.log("chip shows calibration:", /ref\. segment/.test(chipAfter) ? "YES (OK)" : "NO (FAIL)");
console.log("line removed after apply:", linesAfter === 0 ? "YES (OK)" : "NO (FAIL, count=" + linesAfter + ")");
console.log("length input hidden:", inputHidden ? "YES (OK)" : "NO (FAIL)");

// Re-enter Set scale: saved segment should show again for context
await page.getByRole("button", { name: "Set scale" }).click({ force: true });
await page.waitForTimeout(300);
var linesInTool = await page.locator(".plan-calibration-line").count();
console.log("saved line shown while tool active:", linesInTool > 0 ? "YES (OK)" : "NO (FAIL)");
await page.getByRole("button", { name: "Set scale" }).click({ force: true }); // toggle off
await page.waitForTimeout(300);

// Undo should revert calibration and chip text
var undoBtn = page.locator(".undo-btn");
var undoEnabled = await undoBtn.isEnabled();
console.log("undo enabled after setScale:", undoEnabled ? "YES (OK)" : "NO (FAIL)");
if (undoEnabled) {
  await undoBtn.click();
  await page.waitForTimeout(500);
  var chipUndone = (await chip.textContent()).trim();
  console.log("chip after undo:", chipUndone);
  console.log("undo reverted chip:", chipUndone === chipBefore.trim() ? "YES (OK)" : (chipUndone !== chipAfter ? "CHANGED (check)" : "NO (FAIL)"));
}

console.log("page errors:", errors.length ? errors : "none");
await browser.close();
