import { S3Client } from "@aws-sdk/client-s3";

function requireEnv(name) {
  var v = process.env[name];
  if (!v) throw new Error("Missing env: " + name + " (set in floor-plan-viewer/.env)");
  return v;
}

/** @returns {{ client: S3Client, bucket: string, publicBase: string|null }} */
export function createR2Client() {
  var bucket = requireEnv("R2_BUCKET");
  var client = new S3Client({
    region: "auto",
    endpoint: requireEnv("R2_ENDPOINT"),
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
    forcePathStyle: true,
  });
  var publicBase = process.env.R2_PUBLIC_BASE_URL || null;
  if (publicBase) publicBase = publicBase.replace(/\/$/, "");
  return { client, bucket, publicBase };
}

/** @param {string|null} publicBase @param {string} key */
export function publicUrlForKey(publicBase, key) {
  if (!publicBase) return null;
  return publicBase + "/" + key.replace(/^\//, "");
}
