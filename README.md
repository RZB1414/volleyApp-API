# Volley Plus API (Workers)

Volley Plus now runs entirely on [Cloudflare Workers](https://developers.cloudflare.com/workers/) with [Hono](https://hono.dev/). Binary uploads live in the `videos` bucket (bound as `VOLLEY_MEDIA`) while JSON data such as users, tokens, and match reports live in the `volleyplus-storage` bucket (bound as `VOLLEY_DATA`) — no more Express, MongoDB, or AWS SDK.

## Requirements

- Node.js 20+ (for local tooling)
- npm 10+
- Cloudflare account with Workers + R2 access
- Wrangler 3.114+ (`npx wrangler --version`)

## Project layout

```
worker/
  package.json        # scripts and deps for the Worker
  wrangler.toml       # bindings + deployment config
  src/                # Hono app, routes, services and utilities
```

All legacy Express files (`src/`, `tests/`, root `package.json`, etc.) were removed. The Worker folder is now the only runtime code.

## Setup

```bash
cd worker
npm install
# Authenticate once if you have not yet linked Wrangler to your account
npx wrangler login

# Configure secrets/bindings
npx wrangler secret put JWT_SECRET
# Update wrangler.toml with both R2 bucket bindings (VOLLEY_MEDIA + VOLLEY_DATA)
```

`wrangler.toml` already binds `VOLLEY_MEDIA` to `videos` and `VOLLEY_DATA` to `volleyplus-storage`. Edit the `bucket_name` fields if your account uses different names.

## Development

```bash
cd worker
npm run dev
```

Wrangler serves the Worker locally (by default on <http://127.0.0.1:8787>). All state reads/writes go against the R2 bucket referenced in `wrangler.toml`, so consider pointing that binding to a development bucket.

## Deployment

```bash
cd worker
npm run deploy
```

This runs `wrangler deploy`, uploading the latest bundle to Cloudflare. Ensure the production bucket is referenced in `wrangler.toml` (or override via `--name`/`--env`).

## Configuration summary

| Setting | Where | Notes |
| --- | --- | --- |
| `VOLLEY_MEDIA` | `wrangler.toml` (`[[r2_buckets]]`) | Binds the `videos` bucket that stores user uploads and other binary blobs. |
| `VOLLEY_DATA` | `wrangler.toml` (`[[r2_buckets]]`) | Binds the `volleyplus-storage` bucket that stores JSON collections (`data/users.json`, `matchReports/...`, etc.). |
| `JWT_SECRET` | `wrangler secret put JWT_SECRET` | HMAC secret for issuing/validating access tokens. Use a long random string. |

Optional values (rate limits, TTLs, etc.) can be hard-coded or promoted to additional Wrangler vars as you evolve the worker.

## Authentication

- `POST /auth/register` — Validates profile fields, hashes passwords with WebCrypto, writes to `data/users.json` in R2, and returns `{ user, accessToken }`.
- `POST /auth/login` — Verifies credentials and returns `{ user, accessToken }`.

Use `Authorization: Bearer <accessToken>` for every protected route (`/upload`, `/download/generate`, `/upload/completed`, `/stats/match-report`, etc.).

## Upload workflow

- `POST /upload` — Accepts `multipart/form-data` with a `file` field. Files are namespaced as `<userId>/<originalName>`. PDFs are deduplicated per user (existing key ⇒ HTTP 409). Response includes `{ key, metadata }`.
- `GET /upload/completed` — Returns all stored metadata files under `uploads/completed/<userId>/`.
- `GET /upload/incomplete` — Placeholder endpoint that lists any JSON entries saved under `uploads/incomplete/<userId>/`.

All uploaded objects land directly in `VOLLEY_MEDIA` with metadata storing `ownerId` + `originalFileName`.

## Download tokens

- `POST /download/generate` — Persists `{ token, userId, fileName, expiresAt }` inside `downloadTokens/<token>.json`. Returns a relative `/download/use/<token>` URL plus TTL metadata.
- `GET /download/use/:token` — Streams the file directly from the `VOLLEY_MEDIA` bucket. Returns 404 for missing tokens/files and 410 for expired ones.

## Match reports

- `POST /stats/match-report` — Same JSON contract as the previous Express endpoint. Requires auth, stores `ownerId`, and blocks duplicates (matching `matchDate` + team set) with HTTP 409 and the existing `matchId`.
- `GET /stats/match-report` — Lists latest reports, with optional `?limit=` (1–100) and `?ownerId=<userId>` filtering.
- `GET /stats/match-report/:matchId` — Fetches a single report by ID.

Internally the worker keeps (inside `VOLLEY_DATA`):

- `matchReports/data/<timestamp>_<uuid>.json` — canonical records.
- `matchReports/by-match-id/<uuid>.json` — index pointing to the canonical file.
- `matchReports/by-signature/<date>__<teamA>__<teamB>.json` — duplicate guard map.

## Data storage

- `data/users.json` — Array of registered users + password hashes/salts.
- `downloadTokens/*.json` — Issued download token metadata.
- `uploads/completed/<userId>/<key>.json` — Metadata for finished uploads. (Extend as needed for incomplete uploads, resumable tracking, etc.)
- `matchReports/...` — Match report documents and indexes described above.

Feel free to introduce additional prefixes for new collections — use the helpers in `worker/src/services/jsonStore.service.ts` to keep JSON persistence consistent.

## Troubleshooting

- Run `npx wrangler dev --local` if you prefer the Miniflare simulator with local-only storage.
- Clearing buckets between runs is often easier than hand-editing JSON files. Consider pointing `VOLLEY_MEDIA`/`VOLLEY_DATA` to disposable dev buckets.
- If Wrangler warns about an outdated version, upgrade inside `worker/package.json` (`npm install --save-dev wrangler@latest`).

Enjoy the fully serverless version of Volley Plus! PRs or issues are welcome if you extend the Worker with additional routes or bindings.
