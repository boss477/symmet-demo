/**
 * Bake top-down PNGs from Supabase 3d_url GLBs, upload to R2, update plan2d_glb_url.
 *
 * Usage:
 *   npm run plan2d:pipeline
 *   node --env-file=.env scripts/bake-and-upload-plan2d.mjs --dry-run
 *
 * Env:
 *   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 *   R2_* (upload bucket)
 *   PLAN2D_PUBLIC_BASE_URL — public HTTPS base for PNG URLs (defaults to R2_PUBLIC_BASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY — optional; if missing uses Supabase MCP / manual SQL manifest
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { bakeGlbTopDownPng } from "./lib/bake-topdown-playwright.mjs";
import { chromium } from "playwright";
import { createR2Client, publicUrlForKey } from "./r2-client.mjs";
import { resolveCatalogModel3dUrl } from "../src/services/supabase.js";
import { resolveCatalogDimensionsMm } from "../src/lib/catalogSizing.js";

var dryRun = process.argv.includes("--dry-run");
var limitArg = process.argv.find(function (a) {
  return a.indexOf("--limit=") === 0;
});
var limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 0;

var supabaseUrl = process.env.VITE_SUPABASE_URL;
var supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
var publicBase = (
  process.env.PLAN2D_PUBLIC_BASE_URL ||
  process.env.R2_PUBLIC_BASE_URL ||
  ""
).replace(/\/$/, "");

var PREFIX = "plan2d";

async function headOk(url) {
  try {
    var r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(12000) });
    return r.ok;
  } catch (e) {
    return false;
  }
}

function productCode(row) {
  return String(row.product_code || row["Product Code"] || "").trim();
}

function pngKey(code) {
  return PREFIX + "/" + code + ".png";
}

async function uploadPng(client, bucket, key, body) {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "image/png",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
}

async function main() {
  if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase env");

  var sb = createClient(supabaseUrl, supabaseKey);
  var res = await sb.from("shearling_catalog").select("*");
  if (res.error) throw res.error;

  var candidates = (res.data || []).filter(function (row) {
    return !!resolveCatalogModel3dUrl(row);
  });

  console.log("Catalog rows with 3d_url:", candidates.length);

  var okRows = [];
  for (var row of candidates) {
    var glb = resolveCatalogModel3dUrl(row);
    if (await headOk(glb)) okRows.push(row);
    else console.warn("Skip (GLB 404):", productCode(row), glb);
  }
  console.log("GLB reachable:", okRows.length);

  if (limit > 0) okRows = okRows.slice(0, limit);

  if (!publicBase && okRows.length) {
    try {
      var sampleGlb = resolveCatalogModel3dUrl(okRows[0]);
      publicBase = new URL(sampleGlb).origin;
      console.log("Using GLB public origin for plan2d URLs:", publicBase);
    } catch (e) {
      /* ignore */
    }
  }

  if (!publicBase && !dryRun) {
    throw new Error(
      "Set PLAN2D_PUBLIC_BASE_URL or R2_PUBLIC_BASE_URL (R2 bucket public dev URL)"
    );
  }

  var { client, bucket } = createR2Client();
  mkdirSync(join(process.cwd(), "scripts", ".plan2d-out"), { recursive: true });

  var browser = await chromium.launch({ headless: true });
  var manifest = [];
  var errors = [];

  try {
  for (var i = 0; i < okRows.length; i++) {
    var r = okRows[i];
    var code = productCode(r);
    var glbUrl = resolveCatalogModel3dUrl(r);
    var dims = resolveCatalogDimensionsMm({
      width_mm: r.width_mm != null ? r.width_mm : r["Width (mm)"],
      depth_mm: r.depth_mm != null ? r.depth_mm : r["Length / Depth (mm)"],
      height_mm: r.height_mm != null ? r.height_mm : r["Height (mm)"],
      category: r.category,
      keywords: r.keywords,
      product_name: r.product_name,
    });

    process.stdout.write("[" + (i + 1) + "/" + okRows.length + "] " + code + " … ");

    try {
      var png = await bakeGlbTopDownPng(
        glbUrl,
        {
          widthMm: dims.width_mm,
          depthMm: dims.depth_mm,
          heightMm: dims.height_mm,
          sizePx: 512,
        },
        browser
      );

      var key = pngKey(code);
      var localPath = join(process.cwd(), "scripts", ".plan2d-out", code + ".png");
      writeFileSync(localPath, png);

      if (!dryRun) {
        await uploadPng(client, bucket, key, png);
      }

      var plan2dUrl = publicBase ? publicUrlForKey(publicBase, key) : key;
      manifest.push({ product_code: code, plan2d_glb_url: plan2dUrl, glb_url: glbUrl, r2_key: key });
      console.log(dryRun ? "baked (dry)" : "uploaded");
    } catch (e) {
      console.log("FAIL");
      errors.push({ code: code, error: e.message || String(e) });
    }
  }
  } finally {
    await browser.close();
  }

  var manifestPath = join(process.cwd(), "scripts", ".plan2d-out", "manifest.json");
  writeFileSync(manifestPath, JSON.stringify({ manifest: manifest, errors: errors }, null, 2));
  console.log("\nManifest:", manifestPath);

  if (dryRun || !manifest.length) return;

  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    for (var m of manifest) {
      var up = await sb
        .from("shearling_catalog")
        .update({ plan2d_glb_url: m.plan2d_glb_url })
        .eq("Product Code", m.product_code);
      if (up.error) console.warn("Supabase update failed:", m.product_code, up.error.message);
    }
    console.log("Supabase updated via service role:", manifest.length);
  } else {
    console.log("\nNo SUPABASE_SERVICE_ROLE_KEY — run SQL via Supabase dashboard:\n");
    manifest.forEach(function (m) {
      console.log(
        "UPDATE shearling_catalog SET plan2d_glb_url = '" +
          m.plan2d_glb_url.replace(/'/g, "''") +
          "' WHERE \"Product Code\" = '" +
          m.product_code.replace(/'/g, "''") +
          "';"
      );
    });
  }

  if (errors.length) {
    console.warn("\nErrors:", errors.length);
    errors.forEach(function (e) {
      console.warn(" ", e.code, e.error);
    });
    process.exitCode = 1;
  }
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
