/**
 * Compress GLB files with Draco geometry compression and WebP texture compression.
 *
 * Usage:
 *   node scripts/compress-glb.mjs path/to/model.glb [output.glb]
 *   node scripts/compress-glb.mjs --dir ./models/raw --out ./models/compressed
 *
 * After compressing, upload with: npm run r2:upload -- compressed/file.glb [key]
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync } from "fs";
import { join, basename, dirname } from "path";
import { NodeIO } from "@gltf-transform/core";
import { draco, textureCompress } from "@gltf-transform/functions";
import draco3d from "draco3d";
import sharp from "sharp";

async function compressFile(inputPath, outputPath) {
  var io = new NodeIO();
  io.registerExtensions((await import("@gltf-transform/extensions")).ALL_EXTENSIONS);

  var encoder = await draco3d.createEncoderModule();
  var decoder = await draco3d.createDecoderModule();
  io.registerDependencies({ "draco3d.encoder": encoder, "draco3d.decoder": decoder });

  var doc = await io.read(inputPath);
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: "webp", quality: 82 }),
    draco()
  );
  var glb = await io.writeBinary(doc);

  writeFileSync(outputPath, glb);

  var inSize = statSync(inputPath).size;
  var outSize = glb.byteLength;
  var pct = (((inSize - outSize) / inSize) * 100).toFixed(1);
  console.log(
    basename(inputPath),
    "→",
    basename(outputPath),
    "  " + kb(inSize) + " → " + kb(outSize) + " (" + pct + "% smaller)"
  );
}

function kb(bytes) {
  return (bytes / 1024).toFixed(0) + " KB";
}

async function main() {
  var args = process.argv.slice(2);
  var dirIdx = args.indexOf("--dir");
  var outIdx = args.indexOf("--out");

  if (dirIdx >= 0) {
    var inputDir = args[dirIdx + 1];
    var outputDir = outIdx >= 0 ? args[outIdx + 1] : inputDir + "-draco";
    mkdirSync(outputDir, { recursive: true });
    var files = readdirSync(inputDir).filter((f) => f.toLowerCase().endsWith(".glb"));
    if (!files.length) {
      console.error("No .glb files found in", inputDir);
      process.exit(1);
    }
    for (var f of files) {
      await compressFile(join(inputDir, f), join(outputDir, f));
    }
  } else if (args[0]) {
    var inputPath = args[0];
    var outputPath = args[1] || inputPath.replace(/\.glb$/i, ".draco.glb");
    await compressFile(inputPath, outputPath);
  } else {
    console.log("Usage:");
    console.log("  node scripts/compress-glb.mjs model.glb [output.glb]");
    console.log("  node scripts/compress-glb.mjs --dir ./models/raw --out ./models/compressed");
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
