# Lab 4 Sprint Engineering Specification

## 1. Sprint Goal

Complete the TokTickIT service-desk workflow: IT Staff and Administrators record the
actual work on a Ticket as Actions Taken, the backend refuses to resolve a Ticket while
planned work is still open, every role gets a concise dashboard computed from
authoritative data, and the whole application built over Labs 1–3 is hardened and
proven to still work — with no data from earlier labs lost.

## 2. Stakeholder Request Interpretation

Tickets and conversations exist; what is missing is a record of the work itself. Each
Ticket gains a list of Actions Taken — what was done or planned, when, by whom, with
what result, and whether a follow-up is needed. The primary Ticket Owner still
coordinates, but any IT Staff member (or Administrator acting as support) can record
an action. A Ticket cannot be formally resolved while recorded work is still planned
or in progress, and a Requester saying "it looks fixed" stays a signal, not a status
change. Dashboards summarize what each role needs to act on and always lead back to
the detailed screens. Finally, every earlier screen must keep working, look like one
application, and fail safely.

## 3. Scope

### Included
- Actions Taken on a Ticket: list, create, assign, edit, start, complete, cancel
- Read-only Actions Taken for the Requester on their own Tickets
- Final Ticket status-transition matrix and the resolution gate, enforced by the backend
- Append-only Ticket status history (§11 decision)
- Optimistic concurrency on Ticket workflow writes and Action Taken updates
- Requester, IT Staff, and Administrator dashboards with drill-down
- Revised authorization matrix: Administrator gains IT Staff Ticket behavior (§4)
- Final hardening: duplicate-submission handling, form preservation, consistent
  feedback, removal of obsolete UI/API from earlier labs, README
- Full regression of Labs 1–3

### Excluded
- SLA clocks, escalation engines, on-call scheduling, breach notifications
- Email, SMS, LINE, push, or any external notification
- Inventory, spare parts, purchasing, cost accounting, time-sheets, payroll
- Multi-level approvals, electronic signatures
- Business-intelligence tools, custom report builders, export, historical trends
  (including the mockup's "+3 from yesterday" deltas — §11)
- Deleting an Action Taken (cancellation replaces deletion, BR-11)
- File upload on an Action Taken (Attachment Notes is a text reference, §11)
- IT Staff creating Tickets (unchanged from Lab 3)
- Multi-tenant organizations, production cloud operations

## 4. Functional Requirements

**Actions Taken**
- **FR-01** IT Staff and Administrators can list the Actions Taken of any Ticket; a
  Requester can list, read-only, the Actions Taken of a Ticket they own.
- **FR-02** IT Staff and Administrators can create an Action Taken on a Ticket with an
  action date/time, description, result, optional assignee, follow-up flag, follow-up
  note, and attachment notes. The performer is recorded automatically.
- **FR-03** IT Staff and Administrators can assign, reassign, or unassign an Action
  Taken to an active IT Staff or Administrator user.
- **FR-04** IT Staff and Administrators can edit the editable fields of an Action
  Taken that is not in a terminal status.
- **FR-05** IT Staff and Administrators can start, complete, or cancel an Action Taken
  according to the Action status matrix (BR-07).

**Ticket workflow**
- **FR-06** IT Staff and Administrators can change a Ticket's status to any status the
  final transition matrix permits from its current status.
- **FR-07** The backend refuses a transition to Resolved while the Ticket has open
  Actions Taken (resolution gate, BR-15), whatever client sends the request.
- **FR-08** Every status change is recorded in an append-only status history, visible
  to every role that can view the Ticket.
- **FR-09** A user whose Ticket or Action Taken data is out of date is told so instead
  of silently overwriting a more recent change (BR-19 to BR-21).
- **FR-10** A Requester can still indicate that the problem appears resolved, without
  changing the status (continued from Lab 3).

**Dashboards**
- **FR-11** A Requester sees a dashboard of their own Tickets only.
- **FR-12** IT Staff see an operational dashboard of the shared queue and of their own
  assigned Tickets and Actions Taken.
- **FR-13** Administrators see the IT Staff dashboard plus active/inactive account
  counts.
- **FR-14** Every dashboard card opens the matching detailed screen with the matching
  filter; the list reached shows exactly the records the card counted.
- **FR-15** Every role's navigation includes Dashboard, which becomes the landing
  screen after login.

**Hardening and regression**
- **FR-16** Every Lab 1–3 screen and API remains available to the roles permitted by
  the revised matrix and behaves as specified in its lab.
- **FR-17** Repeated clicks or network retries on a create operation never create a
  duplicate record.
- **FR-18** Important forms keep the entered data after a recoverable failure.
- **FR-19** Every screen shows consistent loading, validation, success, empty,
  no-results, forbidden, conflict, not-found, and safe-failure feedback.
- **FR-20** Temporary, duplicate, obsolete, or inconsistent UI and API left from
  earlier labs is removed (§11 lists the known items).
- **FR-21** The README documents setup, migration, seed, tests, rollback, and a
  demonstration path.

### Authorization Matrix (revised for Lab 4)

Every row is enforced by the backend. "Own" means a Ticket whose `requesterId` is the
session user; any other Ticket answers `404` to a Requester (Lab 2/3 rule). The last
column marks what changed from Lab 3.

| Operation | Requester | IT Staff | Administrator | Change from Lab 3 |
|---|---|---|---|---|
| Login, logout, own identity, change own password | Yes | Yes | Yes | — |
| Create / list / view own Tickets, own Attachments | Own only | No | No | — |
| View own Dashboard | Yes (own data) | Yes | Yes (+ account counts) | New |
| View shared Ticket Queue and any Ticket detail | No | Yes | Yes | — |
| Claim / reassign Ticket owner | No | Yes | **Yes** | Admin was No |
| Set IT Priority | No | Yes | **Yes** | Admin was No |
| Change Ticket status, set Resolution Summary | No | Yes | **Yes** | Admin was No |
| View Ticket status history | Own only | Yes | Yes | New |
| Post a Public Comment | Own only | Yes | **Yes** | Admin was No |
| View Public Comments | Own only | Yes | Yes | — |
| Create an Internal Note | No | Yes | **Yes** | Admin was No |
| View Internal Notes | No | Yes | Yes | — |
| List Actions Taken | Own only, read-only | Yes | Yes | New |
| Create / assign / edit / start / complete / cancel an Action Taken | No | Yes | Yes | New |
| Indicate "problem appears resolved" | Own only | No | No | — |
| User management (list, create, edit, activate, reset password) | No | No | Yes | — |

## 5. Business Rules

**Actions Taken**
- **BR-01** An Action Taken belongs to exactly one Ticket; its Ticket never changes.
- **BR-02** The Ticket Owner coordinates the Ticket, but an Action Taken may be created
  by, and assigned to, a different IT Staff member or Administrator.
- **BR-03** `performedById` is always the authenticated user who creates the Action
  Taken. It is never read from the request and never changes afterward.
- **BR-04** The assignee is optional. When set, it must be an active IT Staff or
  Administrator user at the moment of assignment, otherwise `400`. An assignee later
  deactivated stays recorded and is shown as inactive.
- **BR-05** A follow-up note is required (non-blank) when `followUpRequired` is true,
  otherwise `400`. When `followUpRequired` is false the stored note is cleared.
- **BR-06** Description is required, 1–4000 characters after trimming; result,
  follow-up note, and attachment notes are optional, at most 4000 characters. The
  action date/time is a valid ISO date-time and defaults to the server's current time.
- **BR-07** Action status matrix: `PLANNED → IN_PROGRESS | COMPLETED | CANCELLED`,
  `IN_PROGRESS → COMPLETED | CANCELLED`. `COMPLETED` and `CANCELLED` are terminal. A
  transition outside the matrix returns `409` naming the allowed targets.
- **BR-08** Completing an Action Taken requires a non-blank result (`400`).
- **BR-09** An Action Taken in a terminal status is read-only; any update returns `409`.
- **BR-10** Actions Taken can be created or updated only while the Ticket is in an
  active status (`NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `REOPENED`).
  On a `RESOLVED`, `CLOSED`, or `CANCELLED` Ticket the request returns `409`. This keeps
  the resolution gate's invariant true after resolution, not only at it.
- **BR-11** Actions Taken are never deleted; an unwanted action is cancelled.
- **BR-12** Actions Taken are listed by action date/time ascending, then id ascending,
  so the order is stable across reloads.

**Ticket workflow**
- **BR-13** Ticket statuses remain `NEW`, `OPEN`, `IN_PROGRESS`,
  `WAITING_FOR_REQUESTER`, `RESOLVED`, `CLOSED`, `REOPENED`, `CANCELLED`.
- **BR-14** Status changes follow the final transition matrix below, enforced from one
  table on the backend. Allowed roles: IT Staff and Administrator. A Requester can
  never change a status. A transition outside the matrix returns `409` naming the
  current status and the allowed targets.

  | From | Allowed targets |
  |---|---|
  | NEW | OPEN, CANCELLED |
  | OPEN | IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CANCELLED |
  | IN_PROGRESS | WAITING_FOR_REQUESTER, RESOLVED, CANCELLED |
  | WAITING_FOR_REQUESTER | IN_PROGRESS, RESOLVED, CANCELLED |
  | RESOLVED | CLOSED, REOPENED |
  | CLOSED | REOPENED |
  | REOPENED | IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CANCELLED |
  | CANCELLED | — (terminal) |

  The matrix is unchanged from Lab 3; Lab 4 confirms it as final and adds the gate.
- **BR-15 — Resolution gate.** A Ticket cannot move to `RESOLVED` while any of its
  Actions Taken is `PLANNED` or `IN_PROGRESS`. `COMPLETED` and `CANCELLED` actions do
  not block. The check runs in the same database transaction as the status update,
  with the Ticket row locked (`SELECT … FOR UPDATE`); Action Taken creation and
  updates lock the same row, so a concurrent new action cannot slip in between the
  check and the update. A refusal returns `409` with code `RESOLUTION_BLOCKED` and the
  ids of the blocking actions. A Ticket with no Actions Taken is never blocked.
- **BR-16** `resolvedAt` is set when a Ticket moves to `RESOLVED`, kept when it moves
  to `CLOSED`, and cleared when it moves to `REOPENED`.
- **BR-17** A Requester's "appears resolved" indication is advisory and never changes
  the status (Lab 3 BR-05, continued).
- **BR-18** Every successful status change appends one status-history row (from, to,
  changed by, changed at) in the same transaction. History rows are never updated or
  deleted and are listed oldest first.

**Concurrency**
- **BR-19** `Ticket.version` and `ActionTaken.version` start at 1 and increase by 1 on
  every update made through the API.
- **BR-20** Updating an Action Taken requires the `version` the client last read. The
  update runs as `update … where id and version`; if no row matches, the response is
  `409` with code `STALE_UPDATE` and the current state.
- **BR-21** The Ticket workflow writes (owner, IT Priority, status) accept the same
  `version` and apply the same check. The Lab 4 UI always sends it. A request without
  `version` is still accepted so the Lab 3 API contract keeps working (§11).

**Dashboards**
- **BR-22** Every metric is computed by the backend with aggregate queries (`count`,
  `groupBy`) or a bounded top-N query, never by loading whole collections.
- **BR-23** The Requester dashboard counts and lists only Tickets whose `requesterId`
  is the session user.
- **BR-24** Each metric's query, empty behavior, and drill-down are fixed by the tables
  in §5.1.
- **BR-25** No metric is bounded by a date. Counters are current states; "recent"
  lists are top-N ordered by a timestamp. `APP_TIMEZONE = Asia/Bangkok` is used only
  to display dates.
- **BR-26** An empty metric shows `0` and keeps its drill-down, which leads to the
  destination's no-results state.
- **BR-27** A card's drill-down applies the same filter as the card's query, so the
  list reached shows exactly the counted records.

**Hardening**
- **BR-28** Create operations (Tickets, Public Comments, Internal Notes, Actions Taken)
  accept an `Idempotency-Key` header generated by the client once per form submission.
  A repeated request with the same key from the same user returns the original
  response and creates nothing. Every submit button is also disabled while its request
  is in flight.
- **BR-29** After a recoverable failure (validation, conflict, network), a form keeps
  every entered value.
- **BR-30** Error responses never expose a stack trace or internal detail (continued).
- **BR-31** The legacy `GET /api/requesters` route is removed: it answers without any
  session and discloses every active Requester's name and email (§11).

### 5.1 Dashboard metric definitions

"Active" below means status ∉ {`CLOSED`, `CANCELLED`}.

**Requester dashboard** (all queries also filter `requesterId = session user`)

| Card | Query | Empty | Drill-down |
|---|---|---|---|
| My Open Tickets | count, status ∈ {NEW, OPEN, IN_PROGRESS, REOPENED} | 0 | My Tickets `?status=NEW,OPEN,IN_PROGRESS,REOPENED` |
| Waiting for Me | count, status = WAITING_FOR_REQUESTER | 0 | My Tickets `?status=WAITING_FOR_REQUESTER` |
| Resolved | count, status = RESOLVED | 0 | My Tickets `?status=RESOLVED` |
| Closed | count, status = CLOSED | 0 | My Tickets `?status=CLOSED` |
| My Recent Tickets (list) | 5 most recent by `updatedAt` desc, `id` desc | "No tickets yet" + Create Ticket | Ticket Detail |
| Recently Resolved (list) | 5 most recent by `resolvedAt` desc, status ∈ {RESOLVED, CLOSED} | "Nothing resolved yet" | Ticket Detail |

**IT Staff dashboard**

| Card | Query | Empty | Drill-down |
|---|---|---|---|
| New | count, status = NEW | 0 | Queue `?status=NEW` |
| Open | count, status = OPEN | 0 | Queue `?status=OPEN` |
| In Progress | count, status = IN_PROGRESS | 0 | Queue `?status=IN_PROGRESS` |
| Waiting for Requester | count, status = WAITING_FOR_REQUESTER | 0 | Queue `?status=WAITING_FOR_REQUESTER` |
| Unassigned | count, `ticketOwnerId` null and active | 0 | Queue `?ownerId=unassigned&status=<active set>` |
| My Assigned | count, `ticketOwnerId` = me and active | 0 | Queue `?ownerId=<me>&status=<active set>` |
| High Priority | count, `itPriority` = HIGH and active | 0 | Queue `?itPriority=HIGH&status=<active set>` |
| My Open Actions | count of Actions Taken, `assigneeId` = me and status ∈ {PLANNED, IN_PROGRESS} | 0 | the "My Open Actions" list on the dashboard |
| My Open Actions (list) | 10 oldest by `actionAt` asc, same filter, with the total | "No open actions assigned to you" | Ticket Detail of each action |
| Recent Tickets (list) | 10 most recent by `updatedAt` desc, `id` desc, all Tickets | "No tickets yet" | Ticket Detail |

**Administrator dashboard**: the IT Staff dashboard, plus Active Users (count,
`isActive` = true) and Inactive Users (count, `isActive` = false), both drilling down
to User Management.

To make BR-27 hold for the multi-status cards, the `status` query parameter of
`GET /api/tickets` (new) and `GET /api/staff/tickets` (existing) accepts a
comma-separated list. A single value keeps working exactly as in Labs 2–3.

## 6. UI Specification Summary

Full detail in `ui-spec.md`, which extends the Lab 2 and Lab 3 specs with no second
visual system. New: a Dashboard screen per role (landing screen after login), an
Actions Taken area on the staff Ticket Detail (list, create mode, view/edit mode,
start/complete/cancel), a read-only Actions Taken section on the Requester Ticket
Detail, a status history on both detail screens, status controls that offer only the
permitted transitions and explain a resolution-gate refusal by pointing at the blocking
actions, a stale-data message with a reload action, and a status filter on My Tickets
so dashboard drill-downs land on a filtered list. Actions Taken are visually distinct
from Internal Notes, which the Requester never sees.

## 7. Data Changes

**`ActionTaken`** (new)

| Field | Type | Notes |
|---|---|---|
| `id` | int, PK | |
| `ticketId` | int, FK → `Ticket`, required | BR-01, indexed |
| `performedById` | int, FK → `User`, required | from the session, BR-03 |
| `assigneeId` | int, FK → `User`, nullable | active IT Staff/Admin when set, BR-04, indexed |
| `actionAt` | datetime, default now | "Action Date/Time" |
| `description` | text, required | ≤ 4000 |
| `result` | text, nullable | required to complete, BR-08 |
| `status` | enum `ActionStatus`, default `PLANNED` | `PLANNED \| IN_PROGRESS \| COMPLETED \| CANCELLED` |
| `followUpRequired` | bool, default false | |
| `followUpNote` | text, nullable | required when `followUpRequired`, BR-05 |
| `attachmentNotes` | text, nullable | "what file to look for" |
| `version` | int, default 1 | BR-19 |
| `createdAt`, `updatedAt` | datetime | |

Indexes: `ticketId` (Ticket Detail list, resolution gate), `(assigneeId, status)` (IT
Staff "My Open Actions").

**`Ticket`** — additive columns: `version` int default 1, `resolvedAt` datetime
nullable. New index on `itPriority` is not added: the High Priority card combines it
with `status`, and the existing `status` index already narrows the rows.

**`TicketStatusChange`** (new): `id`, `ticketId` FK (indexed), `fromStatus`,
`toStatus` (both `TicketStatus`), `changedById` FK → `User`, `changedAt` default now.
No update or delete route exists.

**`IdempotencyKey`** (new): `id`, `key` (string), `userId` FK, `route` (string),
`responseStatus` (int), `responseBody` (json), `createdAt`; unique on
`(userId, key)`. Keys older than 24 hours may be ignored and deleted.

### Database-design decisions

1. **Optimistic `version` column rather than row locks for concurrent edits.** Two IT
   Staff members working the same Ticket should never overwrite each other unknowingly
   (§6.1 of the handout). Holding a lock while a user edits a form would block the
   shared queue for as long as the form stays open, and a closed browser would leave
   it held. A version counter detects the conflict at write time without blocking
   anyone, and the `409` gives the user the current state to decide. Row locks are
   still used, but only for the few milliseconds of the resolution-gate transaction,
   where a check and an update must not interleave (BR-15).
2. **Action status and assignee as columns on `ActionTaken`.** The handout lists seven
   fields but also requires assign, status transition, complete, cancel, and
   inactive-assignee rejection, and calls actions "incomplete" (§4.5). A status enum
   plus a nullable assignee FK is the smallest model that supports all of that and
   makes the resolution gate one indexed count. A separate assignment table would only
   be needed for several assignees per action, which nothing in the handout asks for.
3. **Status history in its own append-only table.** Keeping only the current status on
   `Ticket` loses who resolved or reopened a Ticket and when. A separate insert-only
   table gives a stable, ordered audit trail without touching the `Ticket` row's
   shape, and no update/delete route can rewrite it.
4. **Separate `IdempotencyKey` table.** Duplicate prevention on retries has to survive
   a double click that the client-side disabled button misses (two requests already in
   flight). One generic table keyed by `(userId, key)` covers every create route
   without adding a column to each resource table.

### Migration, backfill, and rollback

One additive migration (`lab4_actions_taken`), with a database dump taken before it
runs (`db-backups/`, gitignored):

1. Create enum `ActionStatus` and tables `ActionTaken`, `TicketStatusChange`,
   `IdempotencyKey` with their indexes and foreign keys.
2. Add `Ticket.version` (`NOT NULL DEFAULT 1`, so every existing row gets 1) and
   `Ticket.resolvedAt` (nullable).
3. Backfill `resolvedAt = updatedAt` for Tickets already `RESOLVED` or `CLOSED`. The
   true resolution moment was never recorded; `updatedAt` is the closest recorded
   value and keeps "Recently Resolved" meaningful for legacy Tickets.
4. No history rows are fabricated for legacy Tickets: their history starts at the
   first Lab 4 status change.

No column is removed or renamed, and every Lab 1–3 row stays valid. Legacy Tickets have
zero Actions Taken, so the resolution gate never blocks them.

**Rollback.** Prisma has no down migrations, so a hand-written
`server/prisma/rollback/lab4_actions_taken.down.sql` drops the three new tables, the
`ActionStatus` enum, and the two `Ticket` columns, and deletes the migration's row from
`_prisma_migrations`. It touches no Lab 1–3 data. It is tested once on a copy, never on
the working database: restore the dump into a scratch database, apply the migration,
run the down script, then check that `prisma migrate diff` reports no difference from
the Lab 3 schema and that Lab 1–3 row counts are unchanged.

### Seed

Idempotent (upsert on stable natural keys; running it twice creates nothing new).
It adds Tickets covering all eight statuses, all three IT Priorities, assigned and
unassigned owners; Tickets with zero, one, and several Actions Taken; Actions Taken in
all four statuses, including at least one `PLANNED` action on an unresolved Ticket to
demonstrate the gate live; enough data for every dashboard metric to be non-zero for
the seeded accounts; and one seeded Requester and one IT Staff user with no Tickets and
no actions, so zero metrics can be shown too.

## 8. API Contract

Full detail in `api-spec.md`. New or changed:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/tickets/:id/actions` | list Actions Taken (Requester: own Ticket, read-only) |
| POST | `/api/tickets/:id/actions` | create an Action Taken (IT Staff/Admin) |
| PATCH | `/api/actions/:id` | edit, assign, start, complete, cancel (IT Staff/Admin, requires `version`) |
| GET | `/api/tickets/:id/status-history` | status history (Requester: own Ticket) |
| PATCH | `/api/staff/tickets/:id/status` | changed: resolution gate, `resolvedAt`, history, `version` |
| PATCH | `/api/staff/tickets/:id/owner`, `/priority` | changed: Admin allowed, `version` |
| POST | `/api/tickets/:id/comments`, `/notes` | changed: Admin allowed |
| GET | `/api/tickets` | changed: `status` filter (comma-separated) |
| GET | `/api/staff/tickets` | changed: `status` accepts a comma-separated list |
| GET | `/api/dashboard/requester` | Requester dashboard |
| GET | `/api/dashboard/staff` | IT Staff / Administrator dashboard |
| GET | `/api/requesters` | removed (BR-31) |

Error precedence is unchanged: no session `401`, wrong role `403`, not owned or not
found `404`, invalid input `400`, state conflict `409`.

## 9. Acceptance Criteria

**Actions Taken**
- **AC-01** Given a permitted IT Staff user and valid data, when an Action Taken is
  created, then it is saved under the correct Ticket with the authenticated creator
  and the approved assignee.
- **AC-03** Given a create request that includes a `performedById`, when the Action
  Taken is saved, then the performer is the authenticated user, not the supplied value.
- **AC-04** Given `followUpRequired = true` and no follow-up note, when an Action Taken
  is created or updated, then the request is rejected with `400`.
- **AC-05** Given an inactive user or a Requester as assignee, when an Action Taken is
  created or assigned, then the request is rejected with `400`.
- **AC-06** Given an Action Taken, when it is started, completed with a result, or
  cancelled, then its status changes; a transition outside the Action status matrix,
  or completing without a result, is rejected.
- **AC-07** Given a completed or cancelled Action Taken, when any update is attempted,
  then it is rejected with `409`.
- **AC-08** Given a Requester, when they try to create or update an Action Taken, then
  the request is rejected with `403`.
- **AC-09** Given a Requester, when they list the Actions Taken of their own Ticket,
  then they get `200`; for another Requester's Ticket, `404`.
- **AC-10** Given a Ticket with several Actions Taken, when it is viewed, then every
  action appears in a stable order (action time, then id).
- **AC-11** Given an Administrator, when they create or update an Action Taken, then it
  succeeds exactly as for IT Staff.

**Ticket workflow and concurrency**
- **AC-12** Given a Ticket with at least one `PLANNED` or `IN_PROGRESS` Action Taken,
  when a transition to `RESOLVED` is sent directly to the API, then it is rejected with
  `409 RESOLUTION_BLOCKED` listing the blocking action ids, and the status is unchanged.
- **AC-13** Given a Ticket whose Actions Taken are all completed or cancelled, or that
  has none, when it is resolved, then it succeeds and `resolvedAt` is set.
- **AC-14** Given a resolved or closed Ticket, when an Action Taken is created on it,
  then the request is rejected with `409`.
- **AC-15** Given any status change, when it succeeds, then one status-history row is
  appended and the history is visible to the owning Requester, IT Staff, and
  Administrators.
- **AC-16** Given two users who read the same Action Taken or Ticket, when the second
  one saves with the older `version`, then the save is rejected with `409 STALE_UPDATE`
  and the first change is kept.
- **AC-17** Given an Administrator, when they claim a Ticket, set its IT Priority,
  change its status, post a Public Comment, or create an Internal Note, then the
  operation succeeds (revised matrix).
- **AC-18** Given the Ticket Detail screen, when the status control is opened, then
  only the transitions permitted from the current status are offered.

**Dashboards**
- **AC-02** Given an authenticated Requester, when dashboard data is retrieved, then
  only metrics and recent Tickets owned by that Requester are returned.
- **AC-19** Given the seeded data, when either dashboard is retrieved, then every
  metric equals the result of the matching direct database query.
- **AC-20** Given a user with no matching records, when their dashboard is retrieved,
  then the metrics are `0` and each drill-down still leads to a no-results list.
- **AC-21** Given a dashboard card, when its drill-down is followed, then the
  destination list is filtered so that its total equals the card's count.
- **AC-22** Given a Requester or an unauthenticated caller, when the IT Staff dashboard
  endpoint is called, then it is rejected (`403` / `401`).
- **AC-23** Given an Administrator, when the IT Staff dashboard is retrieved, then it
  also contains the active and inactive account counts.
- **AC-24** Given a significant seed volume, when a dashboard endpoint is called, then
  it answers under the documented threshold with a fixed number of queries.

**Hardening and regression**
- **AC-25** Given a create request repeated with the same `Idempotency-Key`, when the
  second request arrives, then no second record is created and the original response
  is returned.
- **AC-26** Given a form that fails with a recoverable error, when the error is shown,
  then every entered value is still in the form.
- **AC-27** Given the full Lab 1–3 test suites, when they run from `main` after this
  sprint, then they all pass (with the documented Lab 3 → Lab 4 authorization updates).
- **AC-28** Given no session, when `GET /api/requesters` is called, then no Requester
  data is returned.
- **AC-29** Given an Internal Note on a Ticket, when its owning Requester views the
  Ticket (including its Actions Taken), then the note appears nowhere.

## 10. Definition of Done

- Every FR, BR, and AC above is implemented and traced to at least one passing test.
- `npm test` is green for `server` and `client`, and Playwright is green, from `main`,
  including every Lab 1, Lab 2, and Lab 3 test. No Lab 1–3 test is skipped or disabled;
  the ones changed by the revised matrix are listed in `tests.md` with the reason.
- The migration was applied after a database dump, with zero data loss, proven by a
  migration/regression test; the rollback was tested once on a copy.
- The seed replays twice with zero duplicates and demonstrates zero and non-zero
  metrics.
- The resolution gate is proven by a direct API call, not only through the screen.
- Every dashboard metric is proven equal to a direct database query.
- Every protected operation is covered by a direct-API test with the wrong role.
- Every screen matches `ui-spec.md` at desktop, tablet, and mobile; the visual and
  accessibility checklists are completed with real evidence.
- No console errors, dead links, placeholder text, or unfinished controls remain.
- Every PR into `lab4-staging` has been peer-reviewed and its comments answered.
- `tests.md` holds real final results, not a plan reconstructed afterward.
- README setup, migration, rollback, seed, test, and demonstration instructions are
  current. No secret is committed.

## 11. Assumptions and Decisions

- **Action Taken fields.** Sections 3 and 8.3 list seven fields with no assignee and no
  status, but Part 6 of the submission requires assign, status transition, complete,
  cancel, and inactive-assignee rejection, and §4.5 speaks of "incomplete" actions.
  Decision: the model carries the seven fields plus `assigneeId` and `status`; without
  them neither Part 6 nor the resolution gate is possible.
- **Administrator and Ticket operations (reversal of Lab 3).** Lab 3 made the
  Administrator read-only on Tickets. §4.3 of this handout says the Administrator
  "performs IT Staff behavior and retains administrative access needed for support and
  testing." Decision: the Administrator gains every IT Staff write operation on
  Tickets, comments, notes, and Actions Taken, and keeps user management. This is a
  deliberate change driven by the handout's support and testing need. The Lab 3 tests
  that asserted an Administrator `403` on those writes are updated to assert the new
  rule, and each one is listed in `tests.md`.
- **Requester visibility of Actions Taken.** §8.3 says Requesters see all Actions
  Taken; §4.3 says "where approved by the specification." Decision: read-only, every
  Action Taken, on their own Tickets only. Actions Taken sit near Internal Notes on the
  staff screen, but the Requester screen never renders an Internal Note, and a test
  proves it (AC-29).
- **Resolved Tickets and new work (BR-10).** Allowing a new `PLANNED` action on a
  resolved Ticket would leave a resolved Ticket with open work, which the gate exists
  to prevent. Decision: reopen the Ticket first.
- **Result required to complete (BR-08).** A completed action without a result records
  nothing useful for the Requester or the next IT Staff member. Decision: required at
  completion only.
- **Status history (FR-08, BR-18).** Not listed in the briefing's data changes. Added
  because Part 7 asks to demonstrate "stable ordering" and "append-only behavior" of
  the workflow, and because the learning outcomes name auditability. It is one
  additive table.
- **Concurrency on the Lab 3 Ticket routes (BR-21).** `version` is required on the new
  Action Taken route, but optional on the three Lab 3 Ticket routes so the Lab 3 API
  contract and its tests keep working. The trade-off: a client that omits `version`
  gets last-write-wins. The Lab 4 UI always sends it.
- **Idempotency (BR-28).** The disabled submit button handles the common double click;
  the `Idempotency-Key` handles the rest (two requests already in flight, a network
  retry). The header is optional, so Lab 2/3 clients and tests still work.
- **Dashboard deltas.** The IT Staff mockup shows "+3 from yesterday." §4.6 does not
  require them, §4.2 excludes BI tools, and they would need daily snapshots. Decision:
  not implemented.
- **Additions to the briefing's metric list.** "Recently Resolved" on the Requester
  dashboard (§4.6 names "recently resolved Tickets", and it is the reason `resolvedAt`
  exists) and "High Priority" on the IT Staff dashboard (§4.6 mentions Tickets by IT
  Priority, and Part 5 asks for urgent Tickets).
- **"My Open Actions" drill-down.** It counts actions, not Tickets, so its drill-down
  is the dashboard list of those actions, each opening its Ticket Detail, rather than a
  Queue filter whose Ticket count would differ from the action count.
- **Time zone.** No metric is date-bounded, which removes time-zone ambiguity from every
  calculation. `APP_TIMEZONE = Asia/Bangkok` is a display setting only.
- **`resolvedAt` backfill.** `updatedAt` for legacy `RESOLVED`/`CLOSED` Tickets — the
  closest recorded value; the true moment was never stored.
- **Attachment Notes.** A text field ("what file to look for"), per §3 and §8.3, not a
  file upload; files stay on the Ticket's Attachments.
- **IT Staff Quick Actions.** The mockup shows "Create Ticket" for IT Staff, but IT
  Staff do not create Tickets (Lab 3 scope, unchanged). The IT Staff quick actions are
  Open Queue, Unassigned, and My Assigned.
- **Known obsolete items to remove (FR-20).** `GET /api/requesters` answers without a
  session and returns every active Requester's name and email, a Lab 2 leftover that
  Lab 3 believed removed; the unused client function `getActiveRequesters`; any
  "TikTockIT" spelling. The Lab 2 test of that route is replaced by a test that it no
  longer answers.
- **Spelling.** The mockups show "TikTockIT"; the product is **TokTickIT** everywhere.
- **Handout typo.** The E2E-02 row of the §10 example table is empty; nothing is
  inferred from it.
