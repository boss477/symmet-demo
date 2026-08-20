/**
 * Upload files to Cloudflare R2 (sofa-3d bucket).
 *
 * Usage:
 *   npm run r2:upload -- path/to/file.glb [object-key]
 *   npm run r2:upload -- --dir ./public/models catalog/glb
 *   npm run r2:list
 *
 * Requires .env: R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 * Optional: R2_PUBLIC_BASE_URL (https://pub-xxxx.r2.dev) for printed browser URLs
 *
 * Setup: see docs/R2-UPLOAD.md (API tokens — wrangler login not required).
 */
import { readFileSync, statSync, readdirSync } from "fs";
import { basename, join, relative } from "path";
import { PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createR2Client, publicUrlForKey } from "./r2-client.mjs";

var CONTENT_TYPES = {
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function contentTypeFor(filePath) {
  var dot = filePath.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  return CONTENT_TYPES[filePath.slice(dot).toLowerCase()] || "application/octet-stream";
}

async function putFile(client, bucket, localPath, key) {
  var body = readFileSync(localPath);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key.replace(/^\//, ""),
      Body: body,
      ContentType: contentTypeFor(localPath),
    })
  );
  return key.replace(/^\//, "");
}

function walkFiles(dir) {
  var out = [];
  for (var name of readdirSync(dir, { withFileTypes: true })) {
    var full = join(dir, name.name);
    if (name.isDirectory()) out.push(...walkFiles(full));
    else if (name.isFile()) out.push(full);
  }
  return out;
}

async function uploadDir(client, bucket, localDir, prefix) {
  var base = prefix ? prefix.replace(/\/$/, "") + "/" : "";
  var files = walkFiles(localDir);
  var uploaded = [];
  for (var file of files) {
    var rel = relative(localDir, file).replace(/\\/g, "/");
    var key = base + rel;
    await putFile(client, bucket, file, key);
    uploaded.push(key);
  }
  return uploaded;
}

async function listBucket(client, bucket, prefix) {
  var res = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix || undefined,
      MaxKeys: 200,
    })
  );
  return (res.Contents || []).map(function (o) {
    return o.Key;
  });
}

function printUrls(publicBase, keys) {
  keys.forEach(function (key) {
    var url = publicUrlForKey(publicBase, key);
    if (url) console.log(url);
    else console.log("r2://" + process.env.R2_BUCKET + "/" + key);
  });
  if (!publicBase) {
    console.log(
      "\nSet R2_PUBLIC_BASE_URL in .env (bucket Settings → Public Development URL) to print HTTPS links."
    );
  }
}

async function main() {
  var args = process.argv.slice(2);
  var { client, bucket, publicBase } = createR2Client();

  if (args[0] === "--list" || args[0] === "list") {
    var keys = await listBucket(client, bucket, args[1] || "");
    console.log("Objects in " + bucket + (args[1] ? " prefix " + args[1] : "") + ":");
    keys.forEach(function (k) {
      console.log("  " + k);
    });
    return;
  }

  if (args[0] === "--dir" && args[1]) {
    var prefix = args[2] || "";
    var uploaded = await uploadDir(client, bucket, args[1], prefix);
    console.log("Uploaded " + uploaded.length + " file(s) to " + bucket + ":");
    printUrls(publicBase, uploaded);
    return;
  }

  if (!args[0]) {
    console.error(
      "Usage: npm run r2:upload -- <file> [key]\n" +
        "       npm run r2:upload -- --dir <folder> [key-prefix]\n" +
        "       npm run r2:list [-- prefix]"
    );
    process.exit(1);
  }

  var localPath = args[0];
  var st = statSync(localPath);
  if (st.isDirectory()) {
    var keys2 = await uploadDir(client, bucket, localPath, args[1] || "");
    console.log("Uploaded " + keys2.length + " file(s):");
    printUrls(publicBase, keys2);
    return;
  }

  var objectKey = args[1] || basename(localPath);
  var key = await putFile(client, bucket, localPath, objectKey);
  console.log("Uploaded: " + key);
  printUrls(publicBase, [key]);
}

main().catch(function (err) {
  var msg = err.message || String(err);
  console.error(msg);
  if (msg.indexOf("Access Denied") >= 0 || err.name === "AccessDenied") {
    console.error(
      "R2 token may be read-only. In Cloudflare: R2 → Manage API Tokens → create Object Read & Write scoped to sofa-3d."
    );
  }
  process.exit(1);
});
