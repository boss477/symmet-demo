/**
 * Verify photoreal snap → deck export embeds a real image, not a placeholder.
 *
 * The async chain under test:
 *   btn3d-photoreal click → snapshot3D() → POST /api/photoreal (mocked)
 *   → onResult callback → deckRenders.push(entry) → Deck PPT click
 *   → downloadDeck({ renders: deckRenders }) → pptx.writeFile()
 *
 * Sharp assertion: ppt/media/ inside the downloaded pptx must contain ≥ 1
 * file. The placeholder path (no render captured) leaves ppt/media/ empty —
 * so media count > 0 is the exact predicate that distinguishes "real snap"
 * from "graceful-degradation slide".
 *
 * Failure-mode contract (PptxGenJS v4.0.1, pinned):
 *   - Fetch fails for a path: image → writeFile() rejects → no download event
 *     → download === null → caught by the "no download" check below.
 *     It does NOT produce an empty ppt/media/; it throws.
 *   - Render never captured (deckRenders empty) → placeholder shape, no image
 *     → writeFile() succeeds → download arrives → ppt/media/ count === 0
 *     → caught by the "media count" check below.
 * If PptxGenJS is upgraded, verify it still rejects on fetch failure rather
 * than swallowing and continuing — the two checks cover different failure
 * modes and both need to stay meaningful.
 *
 * Run: node scripts/verify-photoreal-deck.mjs
 */
import { chromium } from "playwright";
import { promises as fsp } from "fs";
import JSZip from "jszip";

// A real 1×1 gray PNG that PptxGenJS can embed as a media file.
var TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

var browser = await chromium.launch();
var page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
var errors = [];
page.on("pageerror", function (e) { errors.push(String(e)); });

// Intercept the photoreal API so the test runs offline and deterministically.
await page.route("**/api/photoreal", async function (route) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ url: "http://localhost:5199/__test-render.png" }),
  });
});
// Serve a genuine PNG at that URL; PptxGenJS fetches it when building the pptx.
// This route is the crux of the assertion's attributability: with it served,
// mediaCount === 0 has exactly one cause — the render never entered deckRenders.
// Without it, mediaCount === 0 and "fetch flaked" are indistinguishable.
// (In v4.0.1 a fetch failure actually rejects writeFile(), so you'd get
// download === null instead, but the principle holds across versions.)
await page.route("**/__test-render.png", async function (route) {
  await route.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG });
});

// Alert from "Deck PPT" means no furniture in the fixture — fail loudly.
page.on("dialog", async function (dialog) {
  console.error("FAIL: unexpected dialog —", dialog.message());
  await dialog.dismiss();
});

await page.goto("http://localhost:5199/", { waitUntil: "networkidle" });
await page.waitForTimeout(2500); // fixture + auto-stage

// Dismiss the welcome/upload overlay (added after this script was written);
// it sits over the toolbar and swallows every click until closed.
var tryDemo = page.locator("#upload-overlay").getByRole("button", { name: "Try demo" });
if (await tryDemo.isVisible().catch(function () { return false; })) {
  await tryDemo.click();
  await page.waitForTimeout(2500);
}

// Switch to 3D
await page.getByRole("button", { name: "Realistic 3D" }).click({ force: true });
await page.waitForTimeout(3000); // 3D init + GLB attempts

await page.screenshot({ path: "scripts/.verify-photoreal-3d.png" });

// Fire the photoreal render (the route mock returns instantly).
await page.click("#btn3d-photoreal", { force: true });

// img-wrap becomes visible only when onResult callback has fired (#1 → async
// boundary crossed). This proves the callback ran, not yet that deckRenders
// was updated — that's what #3 (media embedded) actually proves.
await page.waitForSelector("#photoreal-img-wrap:not([hidden])", { timeout: 20000 });

var imgSrc = await page.getAttribute("#photoreal-img", "src");
console.log("render url received:", imgSrc);
// #2: proves URL propagated to the DOM (img.src set). Does NOT prove
// deckRenders.push ran — src and push are separate writes in showResult/onResult.
// The push is confirmed by #3 (media embedded in the downloaded pptx).
var urlOk = imgSrc === "http://localhost:5199/__test-render.png";
console.log("url matches mock:", urlOk);

// Dismiss modal (several hidden toolbar buttons share title="Close")
await page.locator('button[title="Close"]:visible').first().click();
await page.waitForTimeout(300);

await page.screenshot({ path: "scripts/.verify-photoreal-post-snap.png" });

// Deck download — the Deck PPT button lives in the 2D toolbar, hidden in 3D.
await page.getByRole("button", { name: "2D View" }).click({ force: true });
await page.waitForTimeout(1000);
var downloadPromise = page.waitForEvent("download", { timeout: 30000 }).catch(function () { return null; });
await page.getByRole("button", { name: "Deck PPT" }).click({ force: true });
// With captured shots, the render picker opens first — confirm the selection
// (all shots are checked by default) to start the actual export.
await page.getByRole("button", { name: /Create PPT/ }).click();
var download = await downloadPromise;
console.log("deck download:", download ? download.suggestedFilename() : "FAILED");

// Parse the pptx zip and count real media files.
// Baseline (no renders): ppt/media/ is absent → 0 files.
// With a captured render: addImage({ path: url }) embeds the PNG → ≥ 1 file.
// #3: this is the rung that proves deckRenders.push actually ran — if the
// array was empty, downloadDeck falls back to placeholder shapes and the
// PNG never reaches ppt/media/.
var mediaCount = 0;
if (download) {
  var dlPath = await download.path();
  var pptxBuf = await fsp.readFile(dlPath);
  var zip = await JSZip.loadAsync(pptxBuf);
  var mediaFiles = Object.keys(zip.files).filter(function (f) {
    return f.startsWith("ppt/media/") && !zip.files[f].dir;
  });
  console.log("ppt/media files:", mediaFiles);
  mediaCount = mediaFiles.length;
}

await page.screenshot({ path: "scripts/.verify-photoreal-deck.png" });
console.log("page errors:", errors.length ? errors : "none");
await browser.close();

if (!download) {
  console.error("FAIL: Deck PPT did not produce a download");
  process.exit(1);
}
if (!urlOk) {
  console.error("FAIL: photoreal callback delivered wrong URL — onResult wiring broken");
  process.exit(1);
}
if (mediaCount === 0) {
  console.error("FAIL: ppt/media/ is empty — render was captured but not embedded (placeholder path taken)");
  process.exit(1);
}
console.log("PASS: " + mediaCount + " media file(s) in ppt/media/ — photoreal render embedded in deck");
