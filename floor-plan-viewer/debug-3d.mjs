// One-off: load sample plan, switch to 3D, go Top view, screenshot.
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("pageerror", (e) => console.log("[PAGEERROR]", e.message));

await page.goto("http://localhost:5199/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Load sample JSON" }).click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Realistic 3D" }).click();
await page.waitForTimeout(3000);
await page.locator("#btn3d-top").click();
await page.waitForTimeout(2500);

await page.screenshot({ path: "debug-3d.png" });
await browser.close();
