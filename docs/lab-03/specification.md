# Lab 3 Sprint Engineering Specification

## 1. Sprint Goal

Replace the Development Requester selector with real authentication and server-enforced
role-based authorization, then deliver the first operational IT Staff Ticket workflow
(queue, ownership, priority, status, Public Comments, Internal Notes) and a minimalist
Administrator user-management screen — without losing any Lab 2 Ticket or Attachment
data, and without breaking any Lab 2 Requester function.

## 2. Stakeholder Request Interpretation

The temporary selector was a development convenience; the product now needs real users.
An email/password login replaces it, with a mandatory password change on first use.
Every authenticated user sees only the navigation and data their role permits — decided
by the backend, not by hiding a button. Requesters keep every Lab 2 capability, now
under their authenticated identity. IT Staff get a shared queue to find, claim, and work
Tickets through a controlled status workflow, communicating with the Requester through
Public Comments while keeping operational detail in Internal Notes the Requester never
sees. Administrators manage accounts only — creating users, fixing basic account
details, activating/deactivating, and resetting an initial password — they do not run
the Ticket workflow.

## 3. Scope

### Included
- Email/password authentication: login, logout, current-user retrieval
- Mandatory password change on first login (`mustChangePassword`)
- Server-side role-based authorization for Requester, IT Staff, Administrator
- Migration of `RequesterUser` → `User`, preserving every existing Ticket/Attachment
- Continued Requester functions (Lab 2 scope) under the authenticated identity
- IT Staff Ticket Queue: search, filter, sort, paginate, shared across all staff
- Ticket ownership (claim/reassign), IT Priority, permitted status transitions
- Public Comments (Requester + Staff + Admin) and Internal Notes (Staff + Admin only)
- Requester "problem appears resolved" signal
- Minimalist Administrator User Management: list, search, role filter, create, edit,
  activate/deactivate, set new initial password
- Zen Green UI extensions for every new screen

### Excluded
- Email invitations, password-reset email, MFA, social login, SSO
- Self-registration or Requester-created accounts
- Actions Taken / Service Actions (deferred to Lab 4 per the handout)
- SLA calculation, escalation rules, notification services
- Dashboards/KPI analytics beyond simple queue counts
- Multi-tenant organizations, departments
- User deletion, bulk user operations, import/export, account-history screens
- Multiple roles per user
- Pagination, multi-column sort, or multiple simultaneous filters on the user list

## 4. Functional Requirements

**Authentication**
- **FR-01** A user authenticates with email and password; the backend establishes an
  authenticated session and returns the permitted identity and role.
- **FR-02** An authenticated user can retrieve their own current identity and role.
- **FR-03** An authenticated user can log out; the session is invalidated server-side.
- **FR-04** A user whose account requires a password change cannot reach any
  application screen or protected API other than the change-password flow until a new
  valid password is saved.
- **FR-05** A user can change their password, subject to the password rules, and the
  new password must differ from the current one.

**Authorization and shell**
- **FR-06** Every protected screen and API route enforces the approved authorization
  matrix on the backend, independent of what the frontend displays.
- **FR-07** The application shell displays the authenticated user's name and role and
  shows only navigation destinations permitted for that role.

**Requester (continued from Lab 2)**
- **FR-08** A Requester continues to create, list, search, filter, sort, and page
  through their own Tickets, and add/download/soft-remove Attachments, using their
  authenticated identity in place of the Lab 2 selector.
- **FR-09** A Requester can post a Public Comment on a Ticket they own.
- **FR-10** A Requester can indicate that the reported problem appears resolved,
  without changing the Ticket's formal status.

**IT Staff**
- **FR-11** IT Staff can retrieve the shared Ticket Queue with search, filters, sort,
  and pagination.
- **FR-12** IT Staff can open the detail of any Ticket from the queue.
- **FR-13** IT Staff can claim an unassigned Ticket (self-assign) or reassign a Ticket
  to another active IT Staff or Administrator user.
- **FR-14** IT Staff can set or change a Ticket's IT Priority.
- **FR-15** IT Staff can change a Ticket's status to any status permitted by the
  transition matrix from its current status.
- **FR-16** IT Staff can post Public Comments and create Internal Notes on any Ticket.
- **FR-17** IT Staff can set the Resolution Summary when moving a Ticket to Resolved.

**Administrator**
- **FR-18** An Administrator can list users, search by name or email, and optionally
  filter by role.
- **FR-19** An Administrator can create a user with a name, email, one role, an active
  state, and an initial password.
- **FR-20** An Administrator can edit a user's name, email, role, and active state.
- **FR-21** An Administrator can set a new initial password for a user, which forces
  that user to change it at their next login.
- **FR-22** An Administrator can view (read-only) any Ticket, its Public Comments, and
  its Internal Notes, but cannot perform IT Staff workflow operations on it.

## 5. Business Rules

**Authentication and session**
- **BR-01** Only an active user with valid credentials may authenticate.
- **BR-02** A user marked as requiring a password change cannot enter the normal
  application until a new valid password is saved.
- **BR-03** The authenticated user identity, not a `requesterId` supplied by the
  client, determines ownership of Requester operations.
- **BR-06** Passwords are hashed with bcrypt (cost 12); no password is ever stored,
  logged, or returned in plaintext, anywhere.
- **BR-07** A session is a JWT signed with a server-side secret, transported in an
  `httpOnly` cookie (`secure: false` in local dev, `sameSite: 'lax'`, 8-hour
  expiration). The token is never placed in `localStorage` or any client-readable
  storage.
- **BR-08** Login failure for an unknown email, a wrong password, and an inactive
  account all return the identical message "Invalid email or password." —
  distinguishing them would let an attacker enumerate valid accounts.
- **BR-09** Logout clears the session cookie server-side; a protected request made
  with the old cookie afterward is rejected as unauthenticated.
- **BR-10** Mutating requests are additionally required to carry
  `Content-Type: application/json`, which a cross-site HTML form cannot produce —
  a second layer behind `sameSite: 'lax'` against CSRF.

**Password change**
- **BR-11** A new password must be at least 8 characters and include at least one
  uppercase letter, one lowercase letter, one digit, and one special character,
  validated on both frontend and backend.
- **BR-12** A new password must differ from the current password.
- **BR-13** On successful password change, `mustChangePassword` is cleared.

**Authorization, ownership, and safe errors**
- **BR-04** Public Comments are visible to the Requester, IT Staff, and Administrator.
  Internal Notes are visible only to IT Staff and Administrator.
- **BR-05** A Requester may indicate that the problem appears resolved, but cannot
  formally set the Ticket to Resolved or Closed.
- **BR-14** A request with no valid session returns `401`.
- **BR-15** An authenticated request for an operation the user's role does not permit
  returns `403` with no response body content beyond a generic message — the route's
  existence is not a secret, but the data behind it is (Internal Notes content, Admin
  data).
- **BR-16** A request for a Ticket or Attachment that exists but is not owned by the
  requesting Requester returns `404`, identical to a nonexistent resource, so
  existence is never confirmed by the response code.
- **BR-17** One role per user; multi-role accounts are out of scope.
- **BR-18** `User.email` is unique across all roles.

**Ticket ownership, priority, and status**
- **BR-19** A Ticket may have zero or one primary Ticket Owner, who must be an active
  IT Staff or Administrator user; assigning an inactive or wrong-role user returns
  `400`.
- **BR-20** Claim assigns the acting IT Staff user to `ticketOwnerId`. Reassign
  assigns a different user. Both are IT-Staff-only operations.
- **BR-21** Requested Priority is set once by the Requester at creation and never
  changes. IT Priority initially copies Requested Priority and can only be changed
  afterward by IT Staff or Administrator.
- **BR-22** `TicketStatus` transitions are enforced server-side against a fixed
  transition table (§7), never by ad hoc conditionals. An attempted transition not in
  the table returns `409` naming the current status and the allowed next statuses.
  All transitions are IT-Staff-only.
- **BR-23** Cancelled is a terminal status; no further transition is permitted from it.
- **BR-24** Resolution Summary is editable by IT Staff only, becomes relevant when a
  Ticket moves to Resolved, and is visible read-only to the owning Requester.

**Comments and notes**
- **BR-25** Public Comments and Internal Notes are append-only: no edit, no delete.
- **BR-26** Empty or whitespace-only content is rejected for both. Content is capped
  at 4000 characters (matching the existing Ticket Description limit) and is rendered
  as escaped text on the client — never through `dangerouslySetInnerHTML` — so posted
  content can never execute as markup.
- **BR-27** Each Comment/Note records its author and creation time from the backend,
  never from client input.

**Administrator**
- **BR-28** Creating a duplicate email address returns `409`.
- **BR-29** An Administrator cannot deactivate their own account (`409`).
- **BR-30** The system must always retain at least one active Administrator; an
  attempt to deactivate or change the role of the last active Administrator returns
  `409`. This check runs inside the same transaction as the update, so two concurrent
  requests cannot both succeed and leave zero active Administrators.
- **BR-31** Accounts are deactivated, never deleted.
- **BR-32** Setting a new initial password for a user sets `mustChangePassword = true`.

**Migration from Lab 2**
- **BR-33** `RequesterUser` is renamed to `User` rather than replaced by a new table,
  so every existing `Ticket.requesterId` foreign key remains valid with no orphaned
  row.
- **BR-34** Every migrated Lab 2 Requester receives `role = REQUESTER`,
  `mustChangePassword = true`, and a bcrypt hash of the documented local-dev initial
  password (README).
- **BR-35** `itPriority` is backfilled from each existing Ticket's `requestedPriority`
  so no Ticket is left without an IT Priority after migration.
- **BR-36** The `X-Dev-Requester-Id` header, the Development Requester selector, and
  the `toktickit.requesterId` `localStorage` key are removed everywhere; no residual
  client-side state from Lab 2's identity mechanism remains reachable.
- **BR-37** A Ticket created in Lab 2 remains fully accessible to its (migrated) owner
  after migration, with the same Ticket Number, content, and Attachments.

## 6. UI Specification Summary

Full detail in `ui-spec.md`, which extends (not replaces) Lab 2's Zen Green tokens,
form conventions, cards, badges, buttons, and responsive rules. New screens: Login,
Change Password (mandatory first-login variant and voluntary variant), IT Staff Ticket
Queue, IT Staff Ticket Detail (extends the Lab 2 Requester Ticket Detail with
ownership/priority/status/comments/notes), and Administrator User Management. The
shell now shows the authenticated user's name + role instead of the Requester
selector, with role-specific navigation. Every screen implements loading, empty,
no-results (where applicable), forbidden, and safe-failure states in addition to its
normal states.

## 7. Data Changes

**`User`** (renamed from `RequesterUser`):

| Field | Type | Notes |
|---|---|---|
| `id` | int, PK | unchanged from `RequesterUser.id` |
| `name` | string | |
| `email` | string, unique | |
| `passwordHash` | string | bcrypt, cost 12 |
| `role` | enum `REQUESTER \| IT_STAFF \| ADMINISTRATOR` | one role per user |
| `isActive` | bool | |
| `mustChangePassword` | bool | |
| `createdAt`, `updatedAt` | datetime | |

**`Ticket`** — additive columns:

| Field | Type | Notes |
|---|---|---|
| `ticketOwnerId` | int, FK → `User`, nullable | must reference an active `IT_STAFF`/`ADMINISTRATOR` user |
| `itPriority` | enum `LOW\|MEDIUM\|HIGH`, nullable → backfilled, then required | copies `requestedPriority` initially |
| `resolutionSummary` | text, nullable | |
| `requesterResolutionIndicatedAt` | datetime, nullable | Requester signal only, not a status |

`TicketStatus` grows from `NEW` alone to `NEW | OPEN | IN_PROGRESS |
WAITING_FOR_REQUESTER | RESOLVED | CLOSED | REOPENED | CANCELLED`, added via
`ALTER TYPE ... ADD VALUE` (no enum recreation, so existing `NEW` rows are untouched).

**`PublicComment`**: `id`, `ticketId` FK, `authorId` FK → `User`, `content` (text, ≤
4000 chars), `createdAt`.

**`InternalNote`**: identical shape to `PublicComment`, separate table. Two tables
rather than one table with an `isInternal` flag: a forgotten `WHERE isInternal =
false` filter would leak Internal Notes to a Requester through the Public Comments
endpoint; with separate tables, the Requester-facing endpoint structurally has no
column to leak from.

Indexes: `Ticket.ticketOwnerId` and `Ticket.status` (the queue filters on both),
`PublicComment.ticketId`, `InternalNote.ticketId`, unique on `User.email` (already
present as `RequesterUser.email`).

### Migration path (Lab 2 → Lab 3), in order

1. Rename `RequesterUser` → `User`. FKs targeting it (`Ticket.requesterId`) are
   unaffected — same table, same primary keys.
2. Add `passwordHash`, `role`, `mustChangePassword` as nullable columns.
3. Backfill every existing row: `role = 'REQUESTER'`, `mustChangePassword = true`,
   `passwordHash` = bcrypt hash of the documented local-dev initial password.
4. Alter the three columns to `NOT NULL` now that every row has a value.
5. Add `Ticket.itPriority` nullable, backfill `itPriority = requestedPriority` on
   every existing Ticket, then alter to `NOT NULL`.
6. Add `Ticket.ticketOwnerId` (nullable, stays nullable — unassigned is a real state),
   `resolutionSummary`, `requesterResolutionIndicatedAt` (both nullable).
7. Extend the `TicketStatus` enum with the seven new values via `ALTER TYPE ... ADD
   VALUE` (existing `NEW` rows require no data change).
8. Create `PublicComment` and `InternalNote`.
9. Remove `X-Dev-Requester-Id` from the backend, the selector component and its route
   from the frontend, and the `toktickit.requesterId` key from `localStorage` (cleared
   proactively on first load of the new build, not just left unused).

No `prisma migrate reset` at any point; every step is additive or a rename. A
migration/regression test (§10) proves a Lab 2 Ticket survives with its original
owner, Ticket Number, and Attachments intact.

## 8. API Contract

Full detail in `api-spec.md`. New/changed endpoint groups:

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | authenticate, set session cookie |
| POST | `/api/auth/logout` | clear session |
| GET | `/api/auth/me` | current identity, role, `mustChangePassword` |
| POST | `/api/auth/change-password` | change password, clear `mustChangePassword` |
| GET/POST/etc. | `/api/tickets*`, `/api/attachments*` | unchanged shapes, now authenticated (no `X-Dev-Requester-Id`) |
| GET | `/api/staff/tickets` | IT Staff queue: search/filter/sort/paginate |
| GET | `/api/staff/tickets/:id` | one Ticket for IT Staff operations |
| PATCH | `/api/staff/tickets/:id/owner` | claim/reassign |
| PATCH | `/api/staff/tickets/:id/priority` | set IT Priority |
| PATCH | `/api/staff/tickets/:id/status` | status transition |
| POST/GET | `/api/tickets/:id/comments` | Public Comments |
| POST/GET | `/api/tickets/:id/notes` | Internal Notes (Staff/Admin only) |
| PATCH | `/api/tickets/:id/resolution-indicated` | Requester's "appears resolved" signal |
| GET | `/api/admin/users` | list, search, role filter |
| POST | `/api/admin/users` | create |
| PATCH | `/api/admin/users/:id` | edit basic fields / role / active state |
| PATCH | `/api/admin/users/:id/password` | set new initial password |

Authorization/error precedence, applied in this order on every protected route: no
session → `401`; session valid but wrong role → `403`; resource not owned by the
current Requester → `404`; input invalid → `400`; state conflict (duplicate email,
last Administrator, disallowed status transition, attachment quota) → `409`.

## 9. Acceptance Criteria

- **AC-01** Given an active user with valid credentials, when the user logs in, then
  the backend establishes authenticated access and returns the permitted user identity
  and role.
- **AC-02** Given a user who must change the initial password, when login succeeds,
  then normal application screens remain unavailable until a new valid password is
  saved.
- **AC-03** Given an authenticated Requester, when the client supplies another
  requesterId anywhere, then the backend still applies the authenticated identity and
  never returns another Requester's data.
- **AC-04** Given a Requester account, when an Internal Note endpoint is requested,
  then the operation is rejected with `403` without exposing note content.
- **AC-05** Given wrong credentials or an unknown email, when login is attempted, then
  the same generic "Invalid email or password." message is returned.
- **AC-06** Given an inactive account with correct credentials, when login is
  attempted, then it is rejected with the same generic message as AC-05.
- **AC-07** Given a valid session, when the user logs out and then repeats a
  previously-successful protected request with the old cookie, then the request is
  rejected as unauthenticated.
- **AC-08** Given an unassigned Ticket, when an IT Staff user claims it, then
  `ticketOwnerId` is set to that user and the queue reflects the change.
- **AC-09** Given a Ticket with `status = NEW`, when a transition to `RESOLVED` is
  attempted, then it is rejected with `409` naming the current status and the allowed
  transitions.
- **AC-10** Given a Requester, when they call the status-change endpoint directly,
  then the request is rejected regardless of the target status.
- **AC-11** Given a Requester, when they indicate the problem appears resolved, then
  `requesterResolutionIndicatedAt` is set and the Ticket's status is unchanged.
- **AC-12** Given an Internal Note posted by IT Staff, when the same Ticket is viewed
  by its owning Requester, then the note does not appear anywhere in the response.
- **AC-13** Given an Administrator, when they attempt to deactivate their own account,
  then the request is rejected with `409`.
- **AC-14** Given exactly one active Administrator, when a request would deactivate
  them or change their role, then it is rejected with `409`.
- **AC-15** Given an email already in use, when an Administrator creates a user with
  it, then the request is rejected with `409`.
- **AC-16** Given a non-Administrator, when any `/api/admin/*` route is called, then
  the request is rejected with `403`.
- **AC-17** Given a Ticket created in Lab 2, when the database is migrated, then its
  original owner (now a `User`), Ticket Number, content, and Attachments remain
  accessible exactly as before.
- **AC-18** Given an invalid IT Staff queue query parameter, when the queue is
  requested, then `400` is returned naming the offending parameter.

## 10. Definition of Done

- All FR/BR/AC above are implemented and traceable to at least one passing test.
- `npm test` is green for `server` and `client` from `main`, including every Lab 1 and
  Lab 2 test (migrated to authenticated identity where the Lab 2 test used
  `X-Dev-Requester-Id`).
- The Lab 2 → Lab 3 migration applies cleanly against a database dump taken
  beforehand, with zero data loss, proven by a migration/regression test.
- Seed replays twice with zero duplicates.
- No skipped, disabled, or unrelated tests are used as evidence.
- Every screen matches `ui-spec.md` at desktop, tablet, and mobile.
- Every protected operation is enforced server-side and covered by a direct-API
  authorization test with the wrong role — a hidden button is never the evidence.
- Every PR into `lab3-staging` has been peer-reviewed and the review comments
  answered.
- `docs/lab-03/tests.md` reflects real, final pass/fail results, not a plan
  reconstructed after the fact.
- README setup/test instructions are current for the Lab 3 increment, including the
  documented local-dev initial password and seeded role accounts.
- No real secret, password, or `JWT_SECRET` value is committed to the repository.

## 11. Assumptions and Decisions

- **Administrator and Ticket operations.** §4.3 of the handout says Administrator and
  IT Staff responsibilities "remain conceptually separate" and an Administrator "does
  not automatically need to perform IT Staff Ticket operations," while BR-04 makes
  Internal Notes visible to the Administrator and §4.5 allows the Administrator to
  change IT Priority. Decision: the Administrator has **read-only** access to
  Tickets, Public Comments, and Internal Notes, but not the workflow write operations
  (claim, status, IT Priority) — consistent with "Admins manage accounts, IT Staff
  manage Tickets," fixed explicitly in the authorization matrix.
- **"Send password reset email."** Present in the Create User mockup (§8.5) even
  though §4.2 explicitly excludes password-reset email. Decision: the checkbox is not
  implemented; the Administrator enters an initial password directly, and the screen
  states the user must change it at next login.
- **User list pagination.** Present in the mockup (§8.5) but §4.2/§8.6 explicitly list
  it as not required. Decision: not implemented; search by name/email plus an
  optional role filter is sufficient at this scale.
- **Spelling.** Mockups show "TikTockIT" and `@tiktockit.com` addresses; the written
  brief says "TokTickIT." Decision: use **TokTickIT** everywhere, including seed
  email domains.
- **"Service Actions" tab.** Present in the Ticket Detail mockup (§8.4) but Actions
  Taken is explicitly excluded (§4.2). Decision: the tab is not implemented.
- **Resolution Summary.** Present in the IT Staff mockup; the field is added, editable
  by IT Staff on transition to Resolved, and shown read-only to the owning Requester.
- **Session storage.** A JWT in `localStorage` is readable by any injected script
  (XSS); an `httpOnly` cookie is not. `localhost:5173` and `localhost:3000` are
  same-site for cookie purposes (the port is not part of the site), so
  `sameSite: 'lax'` works in local dev without weakening CSRF protection. CORS runs
  with `credentials: true` and an explicit origin (never a wildcard) to make the
  cookie usable cross-port.
- **CSRF.** `sameSite: 'lax'` already blocks the cookie on cross-site POST requests;
  requiring `Content-Type: application/json` on mutations is a second, independent
  layer, since a plain cross-origin HTML form cannot set that header.
- **Ownership vs. role failures.** Kept the Lab 2 rule that an ownership failure
  (Requester requesting another Requester's Ticket) returns `404` — a `403` would
  confirm the Ticket exists. A **role** failure (wrong role calling a route that
  exists for other roles) returns `403` instead, because the route's existence is not
  sensitive, only the data behind it is; this matches AC-04's requirement to reject
  without exposing Internal Note content.
- **Separate Comment/Note tables vs. a visibility flag.** A single table with an
  `isInternal` boolean makes a leak a single missing `WHERE` clause away. Two tables
  make that class of bug structurally impossible: the Requester-facing endpoint never
  queries the Internal Notes table at all.
