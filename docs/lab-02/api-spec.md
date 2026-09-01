# Lab 2 API Contract

All routes are prefixed `/api`. Every route below `Requesters` requires the header
`X-Dev-Requester-Id: <id>`. Missing or inactive id on a protected route → `400`. All
error bodies: `{ "error": { "message": string } }`. `500` never includes a stack trace
or internal detail.

## Reference data

### GET /api/categories
No header required. Returns active categories only.
- `200` → `{ "data": [{ "id": 1, "name": "Hardware" }, ...] }`

### GET /api/related-systems
No header required. Returns active related systems only.
- `200` → `{ "data": [{ "id": 1, "name": "Campus Wi-Fi" }, ...] }`

### GET /api/requesters
No header required (this is the endpoint the selector calls before a Requester
exists in context). Returns active Development Requesters only.
- `200` → `{ "data": [{ "id": 1, "name": "Ada Somchai", "email": "ada@example.com" }, ...] }`
- `200` with `data: []` if no active Requester exists (empty state, not an error)

## Tickets

### POST /api/tickets
Creates one Ticket for the Requester in `X-Dev-Requester-Id`, optionally with
attachments. `multipart/form-data`.

Fields: `categoryId` (int, required), `relatedSystemId` (int, required), `summary`
(string, 5–150 chars, required), `description` (string, 10–4000 chars, required),
`requestedPriority` (`LOW|MEDIUM|HIGH`, required). Files: `attachments[]` (0–5 files).

- `201` → `{ "data": { "id": 1, "ticketNumber": "TKT-2026-000042", "requesterId": 1, "categoryId": 1, "relatedSystemId": 1, "summary": "...", "description": "...", "requestedPriority": "MEDIUM", "status": "NEW", "createdAt": "...", "updatedAt": "...", "attachments": [] } }`
- `400` — missing/invalid header; missing/empty required field; field over length limit;
  invalid `categoryId`/`relatedSystemId` (not found or inactive); invalid
  `requestedPriority`; more than 5 files in one request
- `413` — a file exceeds 5 MB
- `415` — a file's extension or MIME type is not in JPG/JPEG/PNG/WEBP/PDF
- `500` — unexpected error; nothing is persisted (compensation strategy, see
  `specification.md` §11)

### GET /api/tickets
Paginated, filtered, sorted list scoped to the current Requester.

Query parameters:
| Param | Type | Default | Notes |
|---|---|---|---|
| `search` | string | — | matches `ticketNumber` (exact/partial) and `summary` (partial, case-insensitive) |
| `categoryId` | int | — | |
| `relatedSystemId` | int | — | |
| `requestedPriority` | `LOW\|MEDIUM\|HIGH` | — | |
| `sort` | `createdAt\|ticketNumber\|summary` | `createdAt` | |
| `order` | `asc\|desc` | `desc` | |
| `page` | int ≥ 1 | `1` | |
| `pageSize` | `10\|20\|50` | `10` | |

Secondary sort is always `id desc`, for a stable order under pagination.

- `200` → `{ "data": [ { ...ticket, "attachmentCount": 2 } ], "meta": { "page": 1, "pageSize": 10, "total": 23, "totalPages": 3 } }`
- `400` — any parameter outside its allowed values, naming the offending parameter,
  e.g. `{ "error": { "message": "invalid sort: 'nope'" } }` (no silent fallback)
- Never returns another Requester's Tickets, regardless of query parameters

### GET /api/tickets/:id
One Ticket owned by the current Requester, with its attachments (active and removed
metadata).

- `200` → `{ "data": { ...ticket, "attachments": [ { "id": 1, "originalName": "screenshot.png", "mimeType": "image/png", "sizeBytes": 12345, "uploadedAt": "...", "removedAt": null, "removalReason": null } ] } }`
- `404` — Ticket does not exist, or exists but is owned by a different Requester
  (identical response in both cases — see `specification.md` §11)

## Attachments

### POST /api/tickets/:id/attachments
Adds 1–5 attachments to an existing, owned Ticket. `multipart/form-data`, field
`attachments[]`.

- `201` → `{ "data": [ { "id": 5, "originalName": "log.pdf", ... } ] }`
- `400` — no file provided, or more than 5 files in one request
- `404` — Ticket not found or not owned by the current Requester
- `409` — adding these files would exceed 5 **active** attachments on this Ticket
- `413` — a file exceeds 5 MB
- `415` — a file's extension or MIME type is not allowed

### GET /api/attachments/:id/download
Streams an active attachment's bytes with its original filename and MIME type.

- `200` — binary stream, `Content-Disposition: attachment; filename="<originalName>"`
- `404` — attachment does not exist, is not owned by the current Requester (via its
  Ticket), or has been soft-removed (`removedAt` is not null)

### DELETE /api/attachments/:id
Soft-removes an attachment. Body: `{ "reason": string }`, required, non-empty.

- `200` → `{ "data": { "id": 5, "removedAt": "...", "removalReason": "..." } }`
- `400` — missing or empty `reason`
- `404` — attachment does not exist, is not owned by the current Requester, or is
  already removed

## HTTP status summary

| Status | Meaning in this API |
|---|---|
| 200 | successful read, or successful soft-remove |
| 201 | Ticket or Attachment created |
| 400 | invalid input, invalid/missing query parameter, missing/inactive requester header |
| 404 | resource does not exist, or exists but is not owned by the current Requester |
| 409 | active-attachment quota (5) would be exceeded |
| 413 | uploaded file exceeds 5 MB |
| 415 | uploaded file type not in JPG/JPEG/PNG/WEBP/PDF |
| 500 | unexpected server error; message is generic, no internal detail leaked |
