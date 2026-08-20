/**
 * Playwright-based top-down PNG bake (real WebGL + GLB textures).
 */
import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, extname } from "path";

var scriptsDir = join(dirname(fileURLToPath(import.meta.url)), "..");
var projectRoot = join(scriptsDir, "..");

function resolveVendorPath(urlPath) {
  var threeBuild = join(projectRoot, "node_modules", "three", "build");
  if (urlPath === "/vendor/three.module.js") {
    return join(threeBuild, "three.module.js");
  }
  if (urlPath === "/vendor/three.core.js") {
    return join(threeBuild, "three.core.js");
  }
  if (urlPath.indexOf("/vendor/addons/") === 0) {
    var sub = urlPath.slice("/vendor/addons/".length);
    return join(projectRoot, "node_modules", "three", "examples", "jsm", sub);
  }
  return null;
}

function contentType(filePath) {
  var ext = extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".glb") return "model/gltf-binary";
  return "application/octet-stream";
}

function startScriptsServer(glbBuffer) {
  return new Promise(function (resolve, reject) {
    var server = createServer(function (req, res) {
      var rel = req.url === "/" ? "/bake-plan2d-page.html" : req.url.split("?")[0];
      if (rel === "/local.glb" && glbBuffer) {
        res.writeHead(200, {
          "Content-Type": "model/gltf-binary",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(glbBuffer);
        return;
      }
      var vendor = resolveVendorPath(rel);
      var filePath = vendor || join(scriptsDir, rel.replace(/^\//, ""));
      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not found: " + rel);
        return;
      }
      res.writeHead(200, { "Content-Type": contentType(filePath) });
      res.end(readFileSync(filePath));
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", function () {
      var addr = server.address();
      resolve({ server: server, port: addr.port });
    });
  });
}

function dataUrlToPngBuffer(dataUrl) {
  var m = String(dataUrl).match(/^data:image\/png;base64,(.+)$/);
  if (!m) throw new Error("Expected PNG data URL");
  return Buffer.from(m[1], "base64");
}

async function fetchGlbBuffer(glbUrl) {
  var res = await fetch(glbUrl, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error("GLB fetch " + res.status + " " + glbUrl);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * @param {string} glbUrl
 * @param {{ widthMm?: number, depthMm?: number, heightMm?: number, sizePx?: number }} dims
 * @param {import('playwright').Browser} [browser]
 * @returns {Promise<Buffer>}
 */
export async function bakeGlbTopDownPng(glbUrl, dims, browser) {
  dims = dims || {};
  var wM = (dims.widthMm != null ? dims.widthMm : 2200) / 1000;
  var dM = (dims.depthMm != null ? dims.depthMm : 950) / 1000;
  var hM = (dims.heightMm != null ? dims.heightMm : 850) / 1000;
  var sizePx = dims.sizePx || 512;

  var glbBuffer = await fetchGlbBuffer(glbUrl);

  var ownBrowser = !browser;
  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }

  var http = await startScriptsServer(glbBuffer);
  var page = await browser.newPage();
  try {
    await page.goto("http://127.0.0.1:" + http.port + "/bake-plan2d-page.html");
    await page.waitForFunction(function () {
      return typeof window.__bakeGlbTopDownPng === "function";
    });
    var localGlbUrl = "http://127.0.0.1:" + http.port + "/local.glb";
    var dataUrl = await page.evaluate(
      function (args) {
        return window.__bakeGlbTopDownPng(args.glbUrl, args.wM, args.dM, args.hM, args.sizePx);
      },
      { glbUrl: localGlbUrl, wM: wM, dM: dM, hM: hM, sizePx: sizePx }
    );
    return dataUrlToPngBuffer(dataUrl);
  } finally {
    await page.close();
    http.server.close();
    if (ownBrowser) await browser.close();
  }
}
