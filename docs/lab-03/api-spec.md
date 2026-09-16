# Lab 3 API Contract

All routes are prefixed `/api`. Authentication is a JWT in an `httpOnly` cookie
(`token`), set by login and cleared by logout — no route accepts `X-Dev-Requester-Id`
anymore. Every protected route applies this precedence: no/invalid session → `401`;
valid session but wrong role → `403`; resource exists but not owned by the
authenticated Requester → `404`; invalid input → `400`; state conflict → `409`. All
error bodies: `{ "error": { "message": string, "code"?: string } }`. `500` never
includes a stack trace or internal detail. Mutating requests must carry
`Content-Type: application/json` (CSRF layer, see `specification.md` §11).

## Authentication

### POST /api/auth/login
Body: `{ "email": string, "password": string }`. No session required.

- `200` → sets the `token` cookie; `{ "data": { "id": 1, "name": "...", "email": "...", "role": "REQUESTER", "mustChangePassword": false } }`
- `401` → `{ "error": { "message": "Invalid email or password." } }` — identical for
  unknown email, wrong password, and inactive account (BR-08)
- `400` — missing `email` or `password`

### POST /api/auth/logout
Requires a session.

- `200` → clears the `token` cookie; `{ "data": { "loggedOut": true } }`
- A subsequent protected request with the old cookie returns `401`

### GET /api/auth/me
Requires a session.

- `200` → `{ "data": { "id": 1, "name": "...", "email": "...", "role": "IT_STAFF", "mustChangePassword": false } }`
- `401` — no/invalid session

### POST /api/auth/change-password
Requires a session (allowed even while `mustChangePassword` is true — this is one of
the three routes exempt from the password-change gate, along with `/me` and
`/logout`).

Body: `{ "currentPassword": string, "newPassword": string }`.

- `200` → `{ "data": { "mustChangePassword": false } }`
- `400` — `newPassword` fails the password rules (§ below), or `newPassword` equals
  `currentPassword`
- `401` — `currentPassword` does not match

**Password rules** (BR-11): minimum 8 characters, at least one uppercase letter, one
lowercase letter, one digit, one special character. Enforced on both client and
server.

**Password-change gate** (BR-02, BR-04 of the briefing): while
`mustChangePassword = true`, every route other than `/api/auth/me`,
`/api/auth/change-password`, and `/api/auth/logout` returns:

- `403` → `{ "error": { "message": "Password change required.", "code": "PASSWORD_CHANGE_REQUIRED" } }`

## Tickets and Attachments (Requester — continued from Lab 2)

Same paths and shapes as Lab 2's `api-spec.md`, with two changes: no
`X-Dev-Requester-Id` header (the session determines the Requester), and every `404`
for a cross-Requester Ticket/Attachment access is unchanged in spirit — ownership
still resolves to `404`, now derived from the session instead of the header.

- `POST /api/tickets`, `GET /api/tickets`, `GET /api/tickets/:id`
- `POST /api/tickets/:id/attachments`, `GET /api/attachments/:id/download`, `DELETE /api/attachments/:id`
- All require an authenticated `REQUESTER` session; `401` with no session.

### POST /api/tickets/:id/comments
Adds a Public Comment. Any authenticated user who can already view the Ticket
(owning Requester, any IT Staff, any Administrator) may post.

Body: `{ "content": string }`, 1–4000 chars after trimming, not whitespace-only.

- `201` → `{ "data": { "id": 1, "ticketId": 1, "authorId": 1, "authorName": "...", "content": "...", "createdAt": "..." } }`
- `400` — empty/whitespace-only content, or over 4000 chars
- `404` — Ticket not found or not owned (Requester caller only)

### GET /api/tickets/:id/comments
Returns Public Comments for a Ticket, oldest first. Same visibility as the Ticket
itself.

- `200` → `{ "data": [ { "id": 1, "authorName": "...", "authorRole": "REQUESTER", "content": "...", "createdAt": "..." } ] }`

### PATCH /api/tickets/:id/resolution-indicated
Requester-only. Sets the "problem appears resolved" signal.

- `200` → `{ "data": { "requesterResolutionIndicatedAt": "..." } }`
- `404` — Ticket not found or not owned by the calling Requester
- `403` — caller is not a Requester

## IT Staff Ticket Queue and operations

All routes below require an authenticated `IT_STAFF` or `ADMINISTRATOR` session for
reads; write operations (owner/priority/status/notes) are `IT_STAFF`-only except
where noted. Non-staff, non-admin roles get `403`.

### GET /api/staff/tickets
Shared queue — every Ticket, not just the caller's own.

| Param | Type | Default | Notes |
|---|---|---|---|
| `search` | string | — | matches `ticketNumber` and `summary` |
| `status` | one of the 8 statuses | — | |
| `itPriority` | `LOW\|MEDIUM\|HIGH` | — | |
| `ownerId` | int or literal `unassigned` | — | |
| `categoryId` | int | — | |
| `sort` | `createdAt\|updatedAt\|itPriority\|ticketNumber` | `updatedAt` | |
| `order` | `asc\|desc` | `desc` | |
| `page` | int ≥ 1 | `1` | |
| `pageSize` | `10\|20\|50` | `10` | |

Secondary sort always `id desc`.

- `200` → `{ "data": [ { ...ticket, "itPriority": "MEDIUM", "ticketOwnerId": 3, "ticketOwnerName": "...", "status": "OPEN" } ], "meta": { "page": 1, "pageSize": 10, "total": 87, "totalPages": 9 } }`
- `400` — invalid parameter value, naming the offending parameter
- `403` — caller is a Requester

### GET /api/staff/tickets/:id
One Ticket for IT Staff operations: full Ticket fields, Attachments, Public Comments,
and Internal Notes together.

- `200` → `{ "data": { ...ticket, "attachments": [...], "publicComments": [...], "internalNotes": [...] } }`
- `403` — caller is a Requester
- `404` — Ticket id does not exist

### PATCH /api/staff/tickets/:id/owner
Body: `{ "ticketOwnerId": number | null }`. `null` unassigns.

- `200` → `{ "data": { "ticketOwnerId": 3, "ticketOwnerName": "..." } }`
- `400` — target user is not an active `IT_STAFF`/`ADMINISTRATOR` user
- `403` — caller is not IT Staff
- `404` — Ticket not found

### PATCH /api/staff/tickets/:id/priority
Body: `{ "itPriority": "LOW" | "MEDIUM" | "HIGH" }`.

- `200` → `{ "data": { "itPriority": "HIGH" } }`
- `400` — invalid value
- `403` — caller is not IT Staff
- `404` — Ticket not found

### PATCH /api/staff/tickets/:id/status
Body: `{ "status": <one of the 8 statuses>, "resolutionSummary"?: string }`.
`resolutionSummary` is accepted (and expected) when the target status is `RESOLVED`.

- `200` → `{ "data": { "status": "RESOLVED", "resolutionSummary": "..." } }`
- `403` — caller is not IT Staff (this includes Requesters attempting any transition —
  AC-10)
- `404` — Ticket not found
- `409` → `{ "error": { "message": "Cannot move from OPEN to RESOLVED. Allowed: IN_PROGRESS, WAITING_FOR_REQUESTER, CANCELLED." } }` — transition not permitted by the
  matrix (`specification.md` §7)

### POST /api/tickets/:id/notes
Creates an Internal Note. IT Staff or Administrator only.

Body: `{ "content": string }`, same length/whitespace rules as Public Comments.

- `201` → `{ "data": { "id": 1, "ticketId": 1, "authorId": 3, "authorName": "...", "content": "...", "createdAt": "..." } }`
- `400` — empty/whitespace-only content, or over 4000 chars
- `403` → `{ "error": { "message": "Forbidden." } }` — caller is a Requester; no note
  content is included in the response (AC-04)
- `404` — Ticket not found

### GET /api/tickets/:id/notes
Internal Notes for a Ticket, oldest first. IT Staff or Administrator only.

- `200` → `{ "data": [ { "id": 1, "authorName": "...", "content": "...", "createdAt": "..." } ] }`
- `403` — caller is a Requester, no data returned

## Administrator

All routes require an authenticated `ADMINISTRATOR` session; any other role gets
`403`.

### GET /api/admin/users
| Param | Type | Notes |
|---|---|---|
| `search` | string | matches `name` or `email`, partial, case-insensitive |
| `role` | `REQUESTER\|IT_STAFF\|ADMINISTRATOR` | optional |

No pagination (out of scope, §4.2 of the handout).

- `200` → `{ "data": [ { "id": 1, "name": "...", "email": "...", "role": "IT_STAFF", "isActive": true } ] }`

### POST /api/admin/users
Body: `{ "name": string, "email": string, "role": "REQUESTER"|"IT_STAFF"|"ADMINISTRATOR", "isActive": boolean, "initialPassword": string }`.

- `201` → `{ "data": { "id": 10, "name": "...", "email": "...", "role": "...", "isActive": true, "mustChangePassword": true } }`
- `400` — missing/invalid field, or `initialPassword` fails the password rules
- `409` — `email` already in use

### PATCH /api/admin/users/:id
Body: any of `{ "name"?: string, "email"?: string, "role"?: string, "isActive"?: boolean }`.

- `200` → `{ "data": { ...updated user } }`
- `400` — invalid field value
- `409` — new `email` already used by another user; OR the update would deactivate or
  change the role of the last active Administrator; OR the caller is deactivating
  their own account
- `404` — user id does not exist

### PATCH /api/admin/users/:id/password
Body: `{ "newPassword": string }`.

- `200` → `{ "data": { "mustChangePassword": true } }`
- `400` — `newPassword` fails the password rules
- `404` — user id does not exist

## HTTP status summary

| Status | Meaning in this API |
|---|---|
| 200 | successful read or update |
| 201 | resource created (user, comment, note) |
| 400 | invalid input, invalid query parameter, failed validation |
| 401 | no or invalid session |
| 403 | authenticated but role does not permit the operation; or password-change gate active |
| 404 | resource does not exist, or exists but not owned by the current Requester |
| 409 | duplicate email, last-Administrator protection, self-deactivation, disallowed status transition, attachment quota |
| 413 | uploaded file exceeds 5 MB (unchanged from Lab 2) |
| 415 | uploaded file type not allowed (unchanged from Lab 2) |
| 500 | unexpected server error; generic message, no internal detail leaked |
