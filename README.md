# Volley Plus API

Node.js REST API built with Express for handling authenticated uploads to Cloudflare R2 and persisting auth, tokens, and match reports directly inside a dedicated R2 bucket.

## Requirements

- Node.js 20+
- npm 10+

## Setup

```bash
npm install
```

Copy `.env.example` to `.env` and adjust environment variables when needed.

```bash
copy .env.example .env
```

### Cloudflare R2 configuration

Set different credentials for the media bucket (`R2_BUCKET_NAME`) and for the structured data bucket (`R2_DATA_BUCKET_NAME`). Both buckets must live inside the same Cloudflare account (`CLOUDFLARE_ACCOUNT_ID`), but creating an extra API token for the data bucket keeps auth records isolated from the presigned-upload credentials.

Required keys:

- `R2_BUCKET_NAME`, `R2_ACCESS_KEY`, `R2_SECRET_KEY` — used for presigned uploads/downloads of media files.
- `R2_DATA_BUCKET_NAME`, `R2_DATA_ACCESS_KEY`, `R2_DATA_SECRET_KEY` — used for persisting users, download tokens, and match reports as JSON documents.

## Scripts

- `npm run dev`: starts the development server with automatic reload via nodemon
- `npm start`: starts the server in production mode
- `npm run lint`: runs ESLint checks
- `npm run lint:fix`: fixes lint issues when possible
- `npm run format`: validates formatting with Prettier
- `npm run format:fix`: formats the project with Prettier
- `npm test`: executes the Node.js test runner (no tests yet)

## Endpoints

- `GET /health`: returns basic API health information
- `POST /auth/register`: creates a user (requires `name`, `email`, `password`, optional `age` 10-100, plus optional metadata like `country`, `currentTeam`, `currentTeamCountry`, `yearsAsAProfessional`, `playerNumber`, and a `teamHistory` array)
- `POST /auth/login`: returns a demo token for the provided `userId`
- `GET /auth/me`: returns the authenticated user extracted from headers
- `PATCH /auth/me`: updates profile metadata (`currentTeam`, `currentTeamCountry`, `country`, `yearsAsAProfessional`, `playerNumber`, `teamHistory`)
- `POST /upload/multipart`: generates presigned URLs for multipart uploads (requires `x-user-id` header)
- `POST /upload/multipart/complete`: finalises multipart uploads with part metadata
- `POST /upload/multipart/cancel`: aborts multipart uploads
- `DELETE /upload/multipart/pending/:uploadId`: alternative shortcut for aborting a pending upload by `uploadId` (provide `fileKey` or `fileName` via query string)
- `GET /upload/multipart/pending`: lists current multipart uploads that have not been completed yet (filtered by `x-user-id`)
- `GET /upload/multipart/completed`: lists fully uploaded objects for the authenticated user, with optional pagination via `limit` and `continuationToken`
- `POST /download/generate`: creates a reusable (until expiry) download token stored in the R2 data bucket (accepts optional `uploadedAt` timestamp from the frontend)
- `GET /download/use/:token`: uses a token to fetch a fresh presigned URL and redirects to it while the token remains valid
- `POST /stats/match-report`: validates and persists structured match statistics generated from PDFs and returns a server-side `matchId`. Requires the `x-user-id` header, stores that value as `ownerId`, and rejects duplicates (same `matchDate` + same team names) with **409**.
- `GET /stats/match-report`: lists stored match reports (newest first). Supports optional `?limit=` and `?ownerId=<userId>` filtering. Every item includes its `ownerId` so the frontend can further filter locally if needed.
- `GET /stats/match-report/:matchId`: retrieves the stored report data by `matchId`

### Team history payload

`teamHistory` is always an array. Each entry requires:

- `teamName` (string)
- `teamCountry` (string)
- `seasonStart` and `seasonEnd` (date strings, `seasonEnd` must come after `seasonStart`)
- `playerNumber` (digits up to three characters, same validation as the main `playerNumber` field)

Use `PATCH /auth/me` to replace the entire history — send the full array you want persisted or `null`/`[]` to clear it.

### Multipart upload request body

`POST /upload/multipart` (auth required: `x-user-id` header) accepts:

- `fileName` (string, required)
- `contentType` (string, optional but recommended)
- `fileSizeBytes` (number, optional) — when provided, the API automatically sets **one part per 100 MB** (e.g., 450 MB → 5 parts). If `fileSizeBytes` is omitted you can still pass `parts`; otherwise it defaults to a single part.

The response echoes `partCount`, `chunkSizeBytes`, and a `fileKey` that includes the authenticated `userId` as a prefix (`<userId>/<originalName>`). Use that `fileKey` for `/upload/multipart/complete`, `/upload/multipart/cancel`, and when generating download tokens so each object stays namespaced per user. The object metadata also stores the `userId` for traceability. When the original name ends with `.pdf`, the API checks for an existing object with the same user-scoped key and returns **409** if the PDF was already uploaded by that user.

Call `GET /upload/multipart/pending` (with the same auth headers) to inspect any multipart uploads that are still open for that user. Optional query `?limit=25` adjusts how many records the API asks from Cloudflare R2 (defaults to 50) and returns an array of `{ key, uploadId, initiatedAt }`. To remove one of those entries from the UI, hit `DELETE /upload/multipart/pending/<uploadId>?fileKey=<key>`, which internally reuses the same cancellation logic as the POST endpoint but is easier to wire from the frontend list view.

Use `GET /upload/multipart/completed` to enumerate finished objects (`{ key, size, lastModified, etag }`). Provide `?limit=25` and/or `?continuationToken=...` if you need to page through large collections.

### Download token request body

`POST /download/generate` accepts:

- `fileName` (string, required): the R2 key (e.g. `user123/video.mp4`).
- `uploadedAt` (ISO string, optional): original video creation/upload timestamp coming from the frontend UI. When omitted the API stores the current timestamp.

The response includes the generated token URL, TTL, and the normalized `uploadedAt` value returned in ISO format so the client can render consistent metadata without recomputing it.

Download tokens are no longer single-use. Generating a link stores the file reference, expiry timestamp, and the supplied `uploadedAt` metadata; every call to `GET /download/use/:token` verifies the token is still valid and then issues a brand-new presigned URL. Once the configured TTL elapses the token expires automatically (HTTP 410), keeping access scoped without forcing users to request a new link for each download attempt.

### Match report request body

`POST /stats/match-report` expects the JSON payload emitted by `PdfReader.js`. The API rejects duplicates whenever both the `matchDate` and the set of team names (case-insensitive) match a previously stored report. The authenticated user becomes the `ownerId` of the created match report, and every response that returns report data includes this field so clients can filter by user:

- `generatedAt` (ISO string, required)
- `setColumns` (positive integer, required)
- `columnLabels` (array of column headers, must include at least `setColumns` entries)
- `matchDate` (string `YYYY-MM-DD`, optional)
- `matchTime` (`HH:mm`, optional)
- `teams` (array with at least one team)
	- `team` (string)
	- `players` (non-empty array)
		- `number` (integer jersey number)
		- `name` (string)
		- `stats` (record of column label → string/number values)

The API validates the payload with Zod. Validation errors return **400** with the structured issues, successful saves reply with **201** and `{ "matchId": "<uuid>" }`, and unexpected failures bubble up as **500**.

Provide `?ownerId=<user-id>` when listing reports to have the API filter before returning results. Otherwise fetch the latest records and filter client-side via the `ownerId` attribute.

Listing reports:

```bash
curl http://localhost:3000/stats/match-report?limit=20
```

Retrieving a report:

```bash
curl http://localhost:3000/stats/match-report/<match-id>
```

Example request:

```bash
curl -X POST http://localhost:3000/stats/match-report \
	-H "Content-Type: application/json" \
	-d '{
		"generatedAt": "2025-11-29T12:34:56.000Z",
		"setColumns": 5,
		"columnLabels": ["1","2","3","4","5","Vote","Tot"],
		"matchDate": "2025-11-12",
		"matchTime": "19:30",
		"teams": [
			{
				"team": "Time A",
				"players": [
					{
						"number": 10,
						"name": "Fulano",
						"stats": {"1": "6", "2": "5", "BK Pts": "."}
					}
				]
			}
		]
	}'
```

## Development

```bash
npm run dev
```

The server loads variables from `.env` (if present), initialises the R2 clients, and listens on the port configured through `PORT` (default 3000).

### Authentication headers

The simple auth middleware reads these headers:

- `x-user-id` (required)
- `x-user-email` (optional)

Provide them when calling any route that requires authentication.

### User policy rules

`src/config/userPolicies.js` centralizes plan limits:

- **paid**: faster transfers (100 Mbps up / 200 Mbps down) and uploads up to 10 GB, with the same 10 GB available for storage.
- **free**: capped at 10 Mbps up / 20 Mbps down and limited to 2 GB of storage/upload size.

Use `getUserPolicy(plan)` whenever you need to enforce quotas or tune throttling logic.
