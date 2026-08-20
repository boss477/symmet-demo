/** Set CORS on the R2 bucket so the browser can fetch GLB/PNG assets cross-origin.
 *  Run: node --env-file=.env scripts/r2-set-cors.mjs
 */
import { PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";
import { createR2Client } from "./r2-client.mjs";

var { client, bucket } = createR2Client();

await client.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: ["*"],
          AllowedMethods: ["GET", "HEAD"],
          AllowedHeaders: ["*"],
          MaxAgeSeconds: 86400,
        },
      ],
    },
  })
);

var res = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
console.log("CORS set on bucket:", bucket);
console.log(JSON.stringify(res.CORSRules, null, 2));
