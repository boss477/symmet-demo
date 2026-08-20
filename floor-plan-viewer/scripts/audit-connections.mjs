/**
 * Audit: Supabase catalog, R2 GLBs, image URLs, viewer wiring.
 * Run: node --env-file=.env scripts/audit-connections.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createR2Client, publicUrlForKey } from "./r2-client.mjs";

var supabaseUrl = process.env.VITE_SUPABASE_URL;
var supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

function headOk(url, ms) {
  var ctrl = new AbortController();
  var t = setTimeout(function () {
    ctrl.abort();
  }, ms || 8000);
  return fetch(url, { method: "HEAD", signal: ctrl.signal })
    .then(function (r) {
      clearTimeout(t);
      return { ok: r.ok, status: r.status };
    })
    .catch(function (e) {
      clearTimeout(t);
      return { ok: false, status: 0, err: e.message };
    });
}

async function main() {
  var report = {
    supabase: { ok: false, rows: 0, withImage: 0, withModel3d: 0, imageReachable: 0, imageFailed: 0 },
    r2: { ok: false, bucket: "", glbCount: 0, writeOk: false, publicBase: "" },
    viewer: { glbFromDb: false, glbLocalDemo: true, image2dFromDb: true },
    gaps: [],
  };

  console.log("=== Connection audit ===\n");

  if (!supabaseUrl || !supabaseKey) {
    report.gaps.push("Supabase: missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
  } else {
    var sb = createClient(supabaseUrl, supabaseKey);
    var res = await sb.from("shearling_catalog").select("*").eq("is_active", true);
    if (res.error) {
      report.gaps.push("Supabase query failed: " + res.error.message);
    } else {
      report.supabase.ok = true;
      var rows = res.data || [];
      report.supabase.rows = rows.length;

      var sampleImages = [];
      rows.forEach(function (row) {
        var img =
          row.image_url ||
          row["Image URL"] ||
          row.image_2d_url ||
          "";
        var m3 =
          row.model_3d_url ||
          row["model_3d_url"] ||
          row.model_3d ||
          "";
        if (String(img).trim()) report.supabase.withImage++;
        if (String(m3).trim()) report.supabase.withModel3d++;
        if (sampleImages.length < 8 && /^https?:\/\//i.test(String(img))) {
          sampleImages.push(String(img).trim());
        }
      });

      for (var u of sampleImages) {
        var h = await headOk(u);
        if (h.ok) report.supabase.imageReachable++;
        else report.supabase.imageFailed++;
      }

      report.viewer.glbFromDb = report.supabase.withModel3d > 0;
      if (report.supabase.withModel3d === 0) {
        report.gaps.push("No model_3d_url in Supabase — 3D uses local demo GLB only");
      }
      if (report.supabase.withImage < report.supabase.rows * 0.5) {
        report.gaps.push("Many SKUs missing image_url");
      }
    }
  }

  try {
    var { client, bucket, publicBase } = createR2Client();
    report.r2.bucket = bucket;
    report.r2.publicBase = publicBase || "(not set)";
    var list = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 500 })
    );
    var keys = (list.Contents || []).map(function (o) {
      return o.Key;
    });
    report.r2.glbCount = keys.filter(function (k) {
      return /\.glb$/i.test(k);
    }).length;
    report.r2.ok = true;

    if (!publicBase) {
      report.gaps.push("R2_PUBLIC_BASE_URL empty — browser cannot load R2 GLBs by URL");
    } else {
      var testGlb = keys.find(function (k) {
        return /\.glb$/i.test(k);
      });
      if (testGlb) {
        var pub = publicUrlForKey(publicBase, testGlb);
        var gh = await headOk(pub);
        if (!gh.ok) report.gaps.push("Public GLB URL not reachable: " + pub);
      }
    }
  } catch (e) {
    report.gaps.push("R2: " + (e.message || e));
  }

  console.log("Supabase:", report.supabase.ok ? "OK" : "FAIL");
  if (report.supabase.ok) {
    console.log("  active rows:", report.supabase.rows);
    console.log("  with image_url:", report.supabase.withImage);
    console.log("  with model_3d_url:", report.supabase.withModel3d);
    console.log("  sample images HEAD ok/fail:", report.supabase.imageReachable, "/", report.supabase.imageFailed);
  }

  console.log("\nR2:", report.r2.ok ? "OK" : "FAIL");
  if (report.r2.ok) {
    console.log("  bucket:", report.r2.bucket);
    console.log("  .glb files:", report.r2.glbCount);
    console.log("  public base:", report.r2.publicBase);
  }

  console.log("\nViewer wiring:");
  console.log("  2D photos: catalog image_url -> furniture2dRender / catalogDrawer");
  console.log("  2D GLB bake: useGlbBake + local /models/ demo only");
  console.log("  3D GLB: useGlbModel + glbUrl on staged item OR box mesh");

  if (report.gaps.length) {
    console.log("\nGAPS:");
    report.gaps.forEach(function (g) {
      console.log("  -", g);
    });
  } else {
    console.log("\nAll core links OK (see counts above).");
  }
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
