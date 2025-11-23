# Volley Plus API

Node.js REST API built with Express for handling authenticated uploads to Cloudflare R2 and one-time download links managed via MongoDB.

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
- `POST /auth/register`: creates a user (requires `name`, `email`, `password`, `role`, optional `age` 10-100)
- `POST /auth/login`: returns a demo token for the provided `userId`
- `GET /auth/me`: returns the authenticated user extracted from headers
- `POST /upload/multipart`: generates presigned URLs for multipart uploads (requires `x-user-id` header)
- `POST /upload/multipart/complete`: finalises multipart uploads with part metadata
- `POST /upload/multipart/cancel`: aborts multipart uploads
- `GET /upload/multipart/pending`: lists current multipart uploads that have not been completed yet (filtered by `x-user-id`)
- `POST /download/generate`: creates a one-time download link stored in MongoDB
- `GET /download/use/:token`: consumes a token and redirects to the R2 presigned URL

### Multipart upload request body

`POST /upload/multipart` (auth required: `x-user-id` header) accepts:

- `fileName` (string, required)
- `contentType` (string, optional but recommended)
- `fileSizeBytes` (number, optional) — when provided, the API automatically sets **one part per 100 MB** (e.g., 450 MB → 5 parts). If `fileSizeBytes` is omitted you can still pass `parts`; otherwise it defaults to a single part.

The response echoes `partCount`, `chunkSizeBytes`, and a `fileKey` that includes the authenticated `userId` as a prefix (`<userId>/<originalName>`). Use that `fileKey` for `/upload/multipart/complete`, `/upload/multipart/cancel`, and when generating download tokens so each object stays namespaced per user. The object metadata also stores the `userId` for traceability.

Call `GET /upload/multipart/pending` (with the same auth headers) to inspect any multipart uploads that are still open for that user. Optional query `?limit=25` adjusts how many records the API asks from Cloudflare R2 (defaults to 50) and returns an array of `{ key, uploadId, initiatedAt }`.

## Development

```bash
npm run dev
```

The server loads variables from `.env` (if present), initialises MongoDB (with TTL index on download tokens), and listens on the port configured through `PORT` (default 3000).

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
