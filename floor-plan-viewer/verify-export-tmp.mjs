import { chromium } from "playwright";

var browser = await chromium.launch();
var page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://127.0.0.1:5173/");
await page.click("#upload-overlay-demo");
await page.waitForTimeout(4000);

// 4 steps present?
var steps = await page.$$eval(".phase-nav__btn", function (els) {
  return els.map(function (e) { return e.textContent + ":" + e.dataset.step; });
});
console.log("steps:", JSON.stringify(steps));

// Furnish row: only Auto stage + Vaastu (+ replace controls), no RFQ/CSV/Deck buttons
await page.click('[data-phase="furnish"]');
await page.waitForTimeout(800);
var rowTexts = await page.$$eval(".toolbar-row--furniture button", function (els) {
  return els.map(function (e) { return e.textContent.trim(); });
});
console.log("furnish row buttons:", JSON.stringify(rowTexts));

// Bill bar visible?
console.log("bill bar hidden:", await page.$eval(".bill-bar", function (e) { return e.hidden; }));

// Go to Export
await page.click('[data-phase="export"]');
await page.waitForTimeout(600);
console.log("export screen hidden:", await page.$eval("#export-screen", function (e) { return e.hidden; }));
console.log("stats:", await page.$eval("#export-stat-rooms", function(e){return e.textContent;}),
  await page.$eval("#export-stat-doors", function(e){return e.textContent;}),
  await page.$eval("#export-stat-windows", function(e){return e.textContent;}),
  await page.$eval("#export-stat-furniture", function(e){return e.textContent;}));
await page.screenshot({ path: "C:/Users/fawaz/AppData/Local/Temp/opencode/export-screen.png" });

// Quote list download works?
await page.click("#export-btn-quote");
await page.waitForTimeout(1500);
console.log("quote clicked ok");

// Presentation card asks about renders or generates (no deckRenders on fresh demo -> generates)
await page.click("#export-btn-deck");
await page.waitForTimeout(2500);

// Back to 3D then bill bar still visible?
await page.click('[data-phase="3d"]');
await page.waitForTimeout(1000);
console.log("bill bar visible in 3D:", await page.$eval(".bill-bar", function (e) { return !e.hidden; }));
await browser.close();
console.log("OK");
