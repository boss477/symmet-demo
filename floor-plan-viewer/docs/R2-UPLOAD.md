# Cloudflare R2 uploads (floor-plan-viewer)

This app stores catalog GLBs and photos on **Cloudflare R2**. Uploads use the **S3-compatible API** via `npm run r2:upload` — not `wrangler login`.

## Setup (one time)

1. In [Cloudflare Dashboard](https://dash.cloudflare.com) → **R2** → bucket (e.g. `sofa-3d`) → **Settings** → **S3 API**.
2. **Create API token** with Object Read & Write on that bucket.
3. Copy `floor-plan-viewer/.env.example` → `floor-plan-viewer/.env` and set:

| Variable | Source |
|----------|--------|
| `R2_ACCOUNT_ID` | Account ID (dashboard sidebar) |
| `R2_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_BUCKET` | Bucket name |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | From the API token |
| `R2_PUBLIC_BASE_URL` | Public bucket URL (`https://pub-….r2.dev`) if the bucket is public |

## Commands

From `floor-plan-viewer/`:

```bash
npm run r2:upload -- path/to/HUDSON.glb HUDSON.glb
npm run r2:upload -- --dir ./local-models catalog/glb
npm run r2:list
```

After upload, set the printed URL (or `R2_PUBLIC_BASE_URL` + key) in Supabase `shearling_catalog.3d_url` / `image_url`.

## If `wrangler login` fails

`request_forbidden` / OAuth errors are common on locked-down networks or accounts without Workers OAuth. **You do not need Wrangler** for R2 uploads in this repo — use API tokens in `.env` as above.

Wrangler is only needed if you later add Workers/Pages in this project.
