# Lab 4 API Contract

This contract **extends** `docs/lab-03/api-spec.md`. Every Lab 2 and Lab 3 route keeps
its path, shapes, and status codes unless listed under "Changed routes" below.

Conventions (unchanged): routes are prefixed `/api`; the session is the `token`
`httpOnly` cookie; success bodies are `{ "data": ... }` (lists may add `"meta"`); error
bodies are `{ "error": { "message": string, "code"?: string } }`; mutating requests
carry `Content-Type: application/json`; `500` never includes internal detail. Error
precedence on every protected route: no/invalid session `401` → wrong role `403` → not
found or not owned by the Requester `404` → invalid input `400` → state conflict `409`.

## Shared types

**ActionTaken**
```json
{
  "id": 12,
  "ticketId": 40,
  "actionAt": "2026-10-02T03:15:00.000Z",
  "description": "Replaced the laptop battery",
  "result": "Battery holds charge for 6h",
  "status": "COMPLETED",
  "followUpRequired": true,
  "followUpNote": "Check again in one week",
  "attachmentNotes": "See battery-report.pdf on the Ticket",
  "performedById": 7, "performedByName": "Margaret Hamilton",
  "assigneeId": 8, "assigneeName": "Katherine Johnson", "assigneeActive": true,
  "version": 3,
  "createdAt": "...", "updatedAt": "..."
}
```
`status` is `PLANNED | IN_PROGRESS | COMPLETED | CANCELLED`. Dates are ISO 8601 UTC;
the client formats them in `APP_TIMEZONE` (Asia/Bangkok).

**Stale update (409)** — returned by every route that checks `version`:
```json
{ "error": { "message": "This record was changed by someone else. Reload to see the latest version.",
             "code": "STALE_UPDATE", "current": { ...the current record... } } }
```

**Idempotency-Key** (optional header, create routes only): a client-generated UUID,
one per form submission, reused on retry. A repeat of the same key by the same user
returns the stored status and body of the first request and creates nothing.

## Actions Taken

### GET /api/tickets/:id/actions
Roles: Requester (own Ticket only), IT Staff, Administrator.

- `200` → `{ "data": [ActionTaken, ...] }`, ordered by `actionAt` asc, then `id` asc
  (BR-12). The Requester receives the same fields; the list is read-only for them.
- `404` — Ticket not found, or a Requester who does not own it

### POST /api/tickets/:id/actions
Roles: IT Staff, Administrator. Accepts `Idempotency-Key`.

Body:
```json
{ "description": "string, required",
  "actionAt": "ISO date-time, optional (default: now)",
  "result": "string, optional",
  "assigneeId": 8,
  "status": "PLANNED | IN_PROGRESS | COMPLETED (optional, default PLANNED)",
  "followUpRequired": false,
  "followUpNote": "string, required when followUpRequired is true",
  "attachmentNotes": "string, optional" }
```
Any `performedById`, `ticketId`, `version`, or `id` in the body is ignored (BR-03).

- `201` → `{ "data": ActionTaken }` with `performedById` = session user, `version` 1
- `400` — missing/blank description; text over 4000 characters; invalid `actionAt`;
  invalid `status` value; `followUpRequired` true without a note; `status: COMPLETED`
  without a result; `assigneeId` not an active IT Staff/Administrator user
- `403` — caller is a Requester
- `404` — Ticket not found
- `409` → code `TICKET_NOT_ACTIVE` — Ticket is `RESOLVED`, `CLOSED`, or `CANCELLED`
  (BR-10)

### PATCH /api/actions/:id
Roles: IT Staff, Administrator.

Body: `version` (required) plus any of `description`, `actionAt`, `result`,
`assigneeId` (`null` unassigns), `status`, `followUpRequired`, `followUpNote`,
`attachmentNotes`. The same validation as creation applies to the resulting record.
Start, complete, and cancel are status changes through this route:
`{ "version": 2, "status": "COMPLETED", "result": "..." }`.

- `200` → `{ "data": ActionTaken }` with `version` incremented
- `400` — invalid field (as creation), or `version` missing/not an integer
- `403` — caller is a Requester
- `404` — Action Taken not found
- `409` → one of:
  - `STALE_UPDATE` — `version` does not match (BR-20), with `current`
  - `ACTION_TERMINAL` — the action is `COMPLETED` or `CANCELLED` (BR-09)
  - `INVALID_ACTION_TRANSITION` — status change outside the Action status matrix,
    message names the allowed targets (BR-07)
  - `TICKET_NOT_ACTIVE` — the Ticket is `RESOLVED`, `CLOSED`, or `CANCELLED` (BR-10)

There is no `DELETE` route (BR-11).

## Ticket workflow

### PATCH /api/staff/tickets/:id/status (changed)
Roles: IT Staff, **Administrator** (was IT Staff only).

Body: `{ "status": string, "resolutionSummary"?: string, "version"?: number }`.

Processing, in one transaction with the Ticket row locked: version check (when
`version` is sent) → transition-matrix check → resolution gate (target `RESOLVED`) →
update (`status`, `resolutionSummary`, `resolvedAt` per BR-16, `version + 1`) →
append a status-history row.

- `200` → `{ "data": { "status": "RESOLVED", "resolutionSummary": "...", "resolvedAt": "...", "version": 5 } }`
- `400` — invalid status value
- `403` — caller is a Requester
- `404` — Ticket not found
- `409` → one of:
  - no code — transition outside the matrix (message as in Lab 3)
  - `RESOLUTION_BLOCKED` →
    ```json
    { "error": { "message": "Resolve or cancel the open Actions Taken first.",
                 "code": "RESOLUTION_BLOCKED", "blockingActionIds": [12, 15] } }
    ```
  - `STALE_UPDATE` — with `current`

### PATCH /api/staff/tickets/:id/owner and /priority (changed)
Roles: IT Staff, **Administrator**. Bodies unchanged, plus optional `version`. Success
responses add `"version"`. New `409 STALE_UPDATE` when `version` does not match.

### GET /api/tickets/:id/status-history (new)
Roles: Requester (own Ticket only), IT Staff, Administrator.

- `200` → `{ "data": [ { "id": 1, "fromStatus": "OPEN", "toStatus": "IN_PROGRESS", "changedByName": "Margaret Hamilton", "changedByRole": "IT_STAFF", "changedAt": "..." } ] }`, oldest first
- `404` — Ticket not found, or a Requester who does not own it

### Ticket detail payloads (changed, additive)
`GET /api/staff/tickets/:id` and `GET /api/tickets/:id` add `version` and
`resolvedAt`. `GET /api/staff/tickets/:id` also adds `allowedTransitions` (the targets
the matrix permits from the current status), so the UI never duplicates the table.

### POST /api/tickets/:id/comments and /notes (changed)
Administrator now allowed (was `403`). Both accept `Idempotency-Key`. Everything else
unchanged; notes remain `403` for Requesters with no content in the response.

### POST /api/tickets (changed)
Accepts `Idempotency-Key`. Unchanged otherwise.

## Lists used by drill-down (changed)

### GET /api/tickets
New optional `status` parameter: one status or a comma-separated list
(`status=NEW,OPEN,IN_PROGRESS,REOPENED`). An unknown value → `400` naming it. Every
other parameter unchanged.

### GET /api/staff/tickets
`status` now also accepts a comma-separated list. A single value behaves as in Lab 3.

## Dashboards

### GET /api/dashboard/requester
Role: Requester. Every figure is filtered by the session user (BR-23).

- `200` →
  ```json
  { "data": {
      "metrics": [
        { "key": "myOpen", "label": "My Open Tickets", "count": 3,
          "drillDown": { "path": "/tickets", "query": { "status": "NEW,OPEN,IN_PROGRESS,REOPENED" } } },
        { "key": "waitingForMe", "label": "Waiting for Me", "count": 1,
          "drillDown": { "path": "/tickets", "query": { "status": "WAITING_FOR_REQUESTER" } } },
        { "key": "resolved", "label": "Resolved", "count": 5, "drillDown": { "path": "/tickets", "query": { "status": "RESOLVED" } } },
        { "key": "closed", "label": "Closed", "count": 12, "drillDown": { "path": "/tickets", "query": { "status": "CLOSED" } } }
      ],
      "recentTickets": [ { "id": 40, "ticketNumber": "TKT-2026-000040", "summary": "...", "status": "IN_PROGRESS", "updatedAt": "..." } ],
      "recentlyResolved": [ { "id": 31, "ticketNumber": "...", "summary": "...", "status": "RESOLVED", "resolvedAt": "..." } ]
  } }
  ```
  `recentTickets` ≤ 5, `recentlyResolved` ≤ 5. Empty lists are `[]`, counts `0`.
- `401` — no session; `403` — IT Staff or Administrator

### GET /api/dashboard/staff
Roles: IT Staff, Administrator.

- `200` →
  ```json
  { "data": {
      "metrics": [
        { "key": "new", "label": "New", "count": 14, "drillDown": { "path": "/queue", "query": { "status": "NEW" } } },
        { "key": "open", "label": "Open", "count": 23, "drillDown": { "path": "/queue", "query": { "status": "OPEN" } } },
        { "key": "inProgress", "label": "In Progress", "count": 18, "drillDown": { "path": "/queue", "query": { "status": "IN_PROGRESS" } } },
        { "key": "waitingForRequester", "label": "Waiting for Requester", "count": 7, "drillDown": { "path": "/queue", "query": { "status": "WAITING_FOR_REQUESTER" } } },
        { "key": "unassigned", "label": "Unassigned", "count": 9,
          "drillDown": { "path": "/queue", "query": { "ownerId": "unassigned", "status": "NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,RESOLVED,REOPENED" } } },
        { "key": "myAssigned", "label": "My Assigned", "count": 16,
          "drillDown": { "path": "/queue", "query": { "ownerId": "7", "status": "NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,RESOLVED,REOPENED" } } },
        { "key": "highPriority", "label": "High Priority", "count": 4,
          "drillDown": { "path": "/queue", "query": { "itPriority": "HIGH", "status": "NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,RESOLVED,REOPENED" } } },
        { "key": "myOpenActions", "label": "My Open Actions", "count": 5, "drillDown": { "path": "#my-open-actions" } }
      ],
      "myOpenActions": { "total": 5, "items": [ { "id": 12, "ticketId": 40, "ticketNumber": "...", "description": "...", "status": "PLANNED", "actionAt": "..." } ] },
      "recentTickets": [ { "id": 40, "ticketNumber": "...", "summary": "...", "status": "OPEN", "itPriority": "HIGH", "ticketOwnerName": null, "updatedAt": "..." } ],
      "accounts": { "active": 42, "inactive": 3 }
  } }
  ```
  `myOpenActions.items` ≤ 10 (oldest `actionAt` first), `recentTickets` ≤ 10.
  `accounts` is present only for an Administrator.
- `401` — no session; `403` — Requester

**Performance-smoke threshold** (both endpoints): under 300 ms on the local test
database with at least 2,000 Tickets and 2,000 Actions Taken, and a fixed number of
database queries that does not grow with the number of Tickets.

## Removed

### GET /api/requesters
Removed (BR-31). It answered without a session with every active Requester's name and
email. Any call now falls through to the API's unknown-route handling (`404`).

## HTTP status summary (additions to Lab 3)

| Status | New meaning in Lab 4 |
|---|---|
| 201 | Action Taken created |
| 400 | Action Taken validation (follow-up note, result to complete, assignee, lengths, dates) |
| 403 | Requester attempting an Action Taken write or the staff dashboard |
| 409 | `RESOLUTION_BLOCKED`, `STALE_UPDATE`, `ACTION_TERMINAL`, `INVALID_ACTION_TRANSITION`, `TICKET_NOT_ACTIVE` |
