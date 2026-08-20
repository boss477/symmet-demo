import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

var manifestPath = join(process.cwd(), "scripts", ".plan2d-out", "manifest.json");
var { manifest } = JSON.parse(readFileSync(manifestPath, "utf8"));
var rows = manifest
  .map(function (m) {
    var code = m.product_code.replace(/'/g, "''");
    var url = m.plan2d_glb_url.replace(/'/g, "''");
    return "('" + code + "', '" + url + "')";
  })
  .join(",\n  ");
var sql =
  "UPDATE shearling_catalog AS c\n" +
  "SET plan2d_glb_url = v.url\n" +
  "FROM (VALUES\n  " +
  rows +
  "\n) AS v(code, url)\n" +
  "WHERE c.\"Product Code\" = v.code;";
writeFileSync(join(process.cwd(), "scripts", ".plan2d-out", "update.sql"), sql);
console.log("Wrote", manifest.length, "rows");
