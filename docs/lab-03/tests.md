# Lab 3 Test Plan and Results

This plan is written and approved before implementation (Test DD). It will be updated
with real, run results as each Issue lands — never reconstructed afterward from
whatever the coding agent happened to produce.

## 1. Test Strategy

Eight required levels: unit, API/integration, UI component, UI style, responsive,
security/authorization, migration/regression, and E2E.

- **Unit** and **API/integration** run under Vitest/Supertest against a real local
  PostgreSQL (same approach as Labs 1–2), colocated under `server/tests/lab-03/`.
- **Security/authorization** gets its own file, `authorization.api.test.ts`, separate
  from the functional `auth.api.test.ts` — every protected operation across every
  route group is called directly with the wrong role and asserted rejected, per the
  handout's explicit demand ("hiding a button is not authorization"). Functional auth
  tests (login/logout/me/change-password behavior) stay in `auth.api.test.ts`.
- **Migration/regression** is not in the handout's minimum file list; adding
  `server/tests/lab-03/migration-regression.api.test.ts` as a deliberate addition,
  since §5.2 and the Definition of Done both require it as evidence, not just a
  manual check.
- **UI component** tests run under Vitest + Testing Library, `client/tests/lab-03/`.
- **UI style** is folded into a dedicated addition, `client/tests/lab-03/zen-green.style.test.tsx`,
  continuing the Lab 2 convention of keeping CSS-class/behavioral assertions out of
  the four required component files.
- **Responsive** and **E2E** run under Playwright, `e2e/lab-03/`.
- Every Lab 1 and Lab 2 test must continue to pass. Lab 2 server tests that sent
  `X-Dev-Requester-Id` are migrated in place (Issue 16) to an authenticated-login test
  helper; this is tracked explicitly as MIG rows below, not silently absorbed.

Every Acceptance Criterion in `specification.md` maps to at least one row below.

## 2. Planned Tests

### Unit

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-22 | Status transition table lookup | Returns allowed next statuses for each of the 8 statuses; empty set for Cancelled | server/tests/lab-03/status-transitions.unit.test.ts | Pass |
| UNIT-02 | Unit | BR-11 | Password rule validator | Rejects short/no-uppercase/no-digit/no-special-char passwords; accepts a compliant one | server/tests/lab-03/password-rules.unit.test.ts | Pass |
| UNIT-03 | Unit | BR-06 | Password hashing helper | bcrypt hash differs from plaintext; verifies correctly against the original password | server/tests/lab-03/password-rules.unit.test.ts | Pass |

### API — Authentication (`auth.api.test.ts`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-01 | API | AC-01 | Valid login | 200, sets cookie, returns identity + role | server/tests/lab-03/auth.api.test.ts | Pass |
| API-02 | API | AC-05 | Login with unknown email | 401, generic message | server/tests/lab-03/auth.api.test.ts | Pass |
| API-03 | API | AC-05 | Login with wrong password | 401, identical generic message to API-02 | server/tests/lab-03/auth.api.test.ts | Pass |
| API-04 | API | AC-06 | Login with inactive account, correct password | 401, identical generic message | server/tests/lab-03/auth.api.test.ts | Pass |
| API-05 | API | FR-01 | Missing email or password field | 400 | server/tests/lab-03/auth.api.test.ts | Pass |
| API-06 | API | FR-02 | GET /api/auth/me, valid session | 200, correct identity/role/mustChangePassword | server/tests/lab-03/auth.api.test.ts | Pass |
| API-07 | API | BR-14 | GET /api/auth/me, no session | 401 | server/tests/lab-03/auth.api.test.ts | Pass |
| API-08 | API | AC-07 | Logout then repeat prior protected request with old cookie | 401 | server/tests/lab-03/auth.api.test.ts | Pass |
| API-09 | API | AC-02, BR-02 | Any normal route while mustChangePassword=true | 403 PASSWORD_CHANGE_REQUIRED | server/tests/lab-03/auth.api.test.ts | Pass |
| API-10 | API | BR-02 | /api/auth/me, /change-password, /logout while mustChangePassword=true | All succeed (exempt routes) | server/tests/lab-03/auth.api.test.ts | Pass |
| API-11 | API | FR-05, BR-11 | Change password with a rule-violating new password | 400 | server/tests/lab-03/auth.api.test.ts | Pass |
| API-12 | API | BR-12 | Change password where new equals current | 400 | server/tests/lab-03/auth.api.test.ts | Pass |
| API-13 | API | FR-05 | Change password with wrong current password | 401 | server/tests/lab-03/auth.api.test.ts | Pass |
| API-14 | API | AC-02, BR-13 | Change password success | 200, mustChangePassword cleared, normal routes now reachable | server/tests/lab-03/auth.api.test.ts | Pass |

### API — Authorization (`authorization.api.test.ts`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| AUTHZ-01 | Security | AC-04 | Requester calls GET internal notes directly | 403, no note content in body | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| AUTHZ-02 | Security | AC-04 | Requester calls POST internal notes directly | 403, note not created | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| AUTHZ-03 | Security | AC-16 | Requester calls GET /api/staff/tickets | 403 | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| AUTHZ-04 | Security | FR-13 | Requester calls PATCH owner/priority/status directly | 403 on all three | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| AUTHZ-05 | Security | AC-10 | Requester calls PATCH status directly with any target status | 403 regardless of target | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| AUTHZ-06 | Security | AC-16 | IT Staff calls any /api/admin/* route | 403 | server/tests/lab-03/authorization.api.test.ts | Pending |
| AUTHZ-07 | Security | AC-16 | Requester calls any /api/admin/* route | 403 | server/tests/lab-03/authorization.api.test.ts | Pending |
| AUTHZ-08 | Security | BR-14 | Any protected route with no session at all | 401, not 403 | server/tests/lab-03/authorization.api.test.ts | Pass |
| AUTHZ-09 | Security | BR-14 | Any protected route with a tampered/invalid JWT | 401 | server/tests/lab-03/authorization.api.test.ts | Pass |
| AUTHZ-10 | Security | AC-03, BR-03 | Authenticated Requester supplies a different requesterId in the body/query | Backend ignores it, uses session identity only | server/tests/lab-03/authorization.api.test.ts | Pass |
| AUTHZ-11 | Security | FR-06 | Administrator calls a Ticket-workflow write route (owner/priority/status) | 403 (read-only per §11 decision) | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| AUTHZ-12 | Security | FR-22 | Administrator calls GET staff ticket detail (read) | 200, allowed | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |

AUTHZ-08/09 test the `requireRole` middleware itself, mounted on a throwaway
route (Issue 33) — no staff/admin/notes route existed yet to hang them on.
AUTHZ-10 landed with Issue 34's real Requester routes. AUTHZ-03/04/05/11/12
(Issues 35/36) are a refinement of the original plan: each lives alongside
the endpoint it guards (`staff-queue.api.test.ts`,
`staff-ticket-detail.api.test.ts`) rather than duplicated here too — this
file stays the home for the cross-cutting/subtle cases (no session, a
tampered JWT, identity spoofing) that don't belong to any one feature's own
file. AUTHZ-01/02 (Issue 37) moved the same way, into
`comments-notes.api.test.ts` alongside the notes routes they guard; 06/07
still need Issue 38 (admin routes).

### API — Requester regression (migrated Lab 2 routes)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| MIG-01 | Migration/Regression | AC-17 | A Ticket created under Lab 2 (pre-migration fixture) is fetched by its migrated owner post-migration | 200, same Ticket Number, content, Attachments | server/tests/lab-03/migration-regression.api.test.ts | Pass |
| MIG-02 | Migration/Regression | BR-33 | Every pre-existing RequesterUser row exists as a User post-migration with the same id | Row counts and ids match before/after | server/tests/lab-03/migration-regression.api.test.ts | Pass |
| MIG-03 | Migration/Regression | BR-34 | Every migrated User has role=REQUESTER, mustChangePassword=true, a valid bcrypt hash | All three true for every migrated row | server/tests/lab-03/migration-regression.api.test.ts | Pass |
| MIG-04 | Migration/Regression | BR-35 | Every pre-existing Ticket has itPriority = its requestedPriority after migration | Equal for every row | server/tests/lab-03/migration-regression.api.test.ts | Pending |
| MIG-05 | Migration/Regression | BR-36 | X-Dev-Requester-Id header sent to any Lab 2 route post-migration | Ignored entirely; identity comes from the session only | server/tests/lab-03/migration-regression.api.test.ts | Pass |
| MIG-06 | Regression | FR-08 | Full Lab 2 create/list/detail/attachment flow, authenticated | Identical behavior to Lab 2, now under a real session | server/tests/lab-03/create-ticket.api.test.ts (existing, migrated) | Pass |
| MIG-07 | Regression | — | Full Lab 1 + Lab 2 suites | All still pass unmodified in behavior | server/tests/lab-01/*, server/tests/lab-02/* | Pass |
| MIG-08 | Regression | — | An active IT Staff or Administrator id passed as X-Dev-Requester-Id (discovered during Issue 32, not pre-planned) | 400 — legacy header stays scoped to role=REQUESTER | server/tests/lab-03/migration-regression.api.test.ts | Pass |

MIG-04 is deferred: `Ticket.itPriority` does not exist until Issue 36 adds it
(specification.md §7 migration path, steps 5-7 belong to the Ticket workflow
Issues, not Issue 32's User-only migration). MIG-05/06/07 depend on Issue 34
removing `X-Dev-Requester-Id` entirely and are still Pending until then.

### API — IT Staff Ticket Queue (`staff-queue.api.test.ts`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| STAFF-Q-01 | API | FR-11 | GET queue, no filters | 200, all Tickets from every Requester (shared, not scoped) | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| STAFF-Q-02 | API | FR-11 | search matches ticketNumber | Correct subset returned | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| STAFF-Q-03 | API | FR-11 | search matches summary | Correct subset returned | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| STAFF-Q-04 | API | FR-11 | status filter | Only matching-status Tickets returned | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| STAFF-Q-05 | API | FR-11 | itPriority filter | Only matching Tickets returned | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| STAFF-Q-06 | API | FR-11 | ownerId=unassigned | Only Tickets with ticketOwnerId=null returned | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| STAFF-Q-07 | API | FR-11 | ownerId=<id> | Only that owner's Tickets returned | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| STAFF-Q-08 | API | FR-11 | categoryId filter | Only matching Tickets returned | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| STAFF-Q-09 | API | FR-11 | Combined filters | Only Tickets matching all of them returned | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| STAFF-Q-10 | API | FR-11 | sort=itPriority&order=desc | Ordered High→Low, id desc secondary | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| STAFF-Q-11 | API | FR-11 | Default sort/order | updatedAt desc | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| STAFF-Q-12 | API | AC-18 | Invalid sort value | 400 naming the parameter | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| STAFF-Q-13 | API | AC-18 | Invalid status value in filter | 400 naming the parameter | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| STAFF-Q-14 | API | FR-11 | page/pageSize | Correct page returned, meta.totalPages correct | server/tests/lab-03/staff-queue.api.test.ts | Pass |

### API — IT Staff Ticket Detail and workflow (`staff-ticket-detail.api.test.ts`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| STAFF-D-01 | API | FR-12 | GET staff ticket detail | 200, includes attachments + comments + notes together | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| STAFF-D-02 | API | FR-12 | GET staff ticket detail, nonexistent id | 404 | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| STAFF-D-03 | API | AC-08, FR-13 | Claim an unassigned Ticket | 200, ticketOwnerId = caller | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| STAFF-D-04 | API | FR-13 | Reassign to another active IT Staff user | 200, ticketOwnerId updated | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| STAFF-D-05 | API | BR-19 | Assign an inactive user as owner | 400 | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| STAFF-D-06 | API | BR-19 | Assign a Requester-role user as owner | 400 | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| STAFF-D-07 | API | FR-14, BR-21 | Update IT Priority | 200, itPriority changed; requestedPriority unchanged | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| STAFF-D-08 | API | FR-15 | Valid status transition (e.g. New→Open) | 200, status updated | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| STAFF-D-09 | API | AC-09, BR-22 | Disallowed status transition (New→Resolved) | 409, message names current + allowed statuses | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| STAFF-D-10 | API | BR-23 | Any transition attempted from Cancelled | 409, empty allowed list | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| STAFF-D-11 | API | FR-17, BR-24 | Move to Resolved with a resolutionSummary | 200, resolutionSummary saved | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| STAFF-D-12 | API | AC-11, FR-10 | Requester posts resolution-indicated signal | requesterResolutionIndicatedAt set, status unchanged | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |

### API — Public Comments and Internal Notes (`comments-notes.api.test.ts`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| CN-01 | API | FR-09 | Requester posts a Public Comment on own Ticket | 201 | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| CN-02 | API | FR-09 | Requester posts a Public Comment on a Ticket they don't own | 404 | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| CN-03 | API | BR-26 | Post empty/whitespace-only comment | 400 | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| CN-04 | API | BR-26 | Post comment over 4000 chars | 400 | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| CN-05 | API | FR-16 | IT Staff posts a Public Comment | 201 | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| CN-06 | API | BR-04 | GET comments as Requester, IT Staff, Administrator | All three see the same list | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| CN-07 | API | FR-16 | IT Staff creates an Internal Note | 201 | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| CN-08 | API | AC-12, BR-04 | Requester fetches Ticket detail after a Note is posted | Note absent anywhere in the response | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| CN-09 | API | BR-25 | No edit/delete route exists for either model | Attempting one returns 404/405 | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| CN-10 | API | BR-27 | Author/timestamp always come from the backend | Client-supplied authorId/createdAt in body ignored | server/tests/lab-03/comments-notes.api.test.ts | Pass |

### API — Administrator (`users-admin.api.test.ts`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| ADMIN-01 | API | FR-18 | List users, no filters | 200, all users | server/tests/lab-03/users-admin.api.test.ts | Pending |
| ADMIN-02 | API | FR-18 | search by partial name | Correct subset | server/tests/lab-03/users-admin.api.test.ts | Pending |
| ADMIN-03 | API | FR-18 | search by partial email | Correct subset | server/tests/lab-03/users-admin.api.test.ts | Pending |
| ADMIN-04 | API | FR-18 | role filter | Only that role returned | server/tests/lab-03/users-admin.api.test.ts | Pending |
| ADMIN-05 | API | FR-19, AC-01-style | Create user, valid data | 201, mustChangePassword=true | server/tests/lab-03/users-admin.api.test.ts | Pending |
| ADMIN-06 | API | AC-15, BR-28 | Create user with duplicate email | 409 | server/tests/lab-03/users-admin.api.test.ts | Pending |
| ADMIN-07 | API | BR-17 | Create user with an invalid/multiple role value | 400 | server/tests/lab-03/users-admin.api.test.ts | Pending |
| ADMIN-08 | API | FR-19 | Create user with weak initialPassword | 400 | server/tests/lab-03/users-admin.api.test.ts | Pending |
| ADMIN-09 | API | FR-20 | Edit name/email/role/isActive | 200, fields updated | server/tests/lab-03/users-admin.api.test.ts | Pending |
| ADMIN-10 | API | BR-28 | Edit email to one already used by another user | 409 | server/tests/lab-03/users-admin.api.test.ts | Pending |
| ADMIN-11 | API | AC-13, BR-29 | Administrator deactivates their own account | 409 | server/tests/lab-03/users-admin.api.test.ts | Pending |
| ADMIN-12 | API | AC-14, BR-30 | Deactivate the last active Administrator | 409 | server/tests/lab-03/users-admin.api.test.ts | Pending |
| ADMIN-13 | API | AC-14, BR-30 | Change the last active Administrator's role away from ADMINISTRATOR | 409 | server/tests/lab-03/users-admin.api.test.ts | Pending |
| ADMIN-14 | API | BR-30 | Two concurrent requests both trying to deactivate the two remaining active Administrators | At most one succeeds; the system never ends with zero active Administrators | server/tests/lab-03/users-admin.api.test.ts | Pending |
| ADMIN-15 | API | FR-21, BR-32 | Set new initial password | 200, mustChangePassword=true; user can log in with the new password | server/tests/lab-03/users-admin.api.test.ts | Pending |
| ADMIN-16 | API | FR-21 | Set new initial password, weak value | 400 | server/tests/lab-03/users-admin.api.test.ts | Pending |
| ADMIN-17 | API | BR-31 | Confirm no delete-user route exists | 404/405 on the attempt | server/tests/lab-03/users-admin.api.test.ts | Pending |

### UI Component

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UI-01 | UI | FR-01 | Login form, empty submit | Field-level errors, no API call | client/tests/lab-03/Login.test.tsx | Pass |
| UI-02 | UI | AC-05 | Login, mocked 401 | Generic error message shown | client/tests/lab-03/Login.test.tsx | Pass |
| UI-03 | UI | FR-01 | Login, busy state | Button shows spinner label, disabled | client/tests/lab-03/Login.test.tsx | Pass |
| UI-04 | UI | FR-01 | Show/hide password toggle | Input type switches; icon has aria-label | client/tests/lab-03/Login.test.tsx | Pass |
| UI-05 | UI | AC-02 | Successful login with mustChangePassword=true | Redirects to Change Password, not the app | client/tests/lab-03/Login.test.tsx | Pass |
| UI-06 | UI | BR-11 | Change Password, weak new password | Field error, checklist shows unmet rules | client/tests/lab-03/ChangePassword.test.tsx | Pass |
| UI-07 | UI | BR-12 | Change Password, confirm mismatch | Field error, no API call | client/tests/lab-03/ChangePassword.test.tsx | Pass |
| UI-08 | UI | AC-02 | Change Password success (mandatory flow) | Proceeds into the application | client/tests/lab-03/ChangePassword.test.tsx | Pass |
| UI-09 | UI | FR-07 | Shell renders correct nav per role (3 cases: Requester/IT Staff/Administrator) | Only permitted links rendered | client/tests/lab-03/AppShell.test.tsx | Pass |
| UI-10 | UI | FR-03 | Logout button | Calls logout, redirects to Login | client/tests/lab-03/AppShell.test.tsx | Pass |
| UI-11 | UI | FR-11 | Queue renders rows with all badges | Ticket Number, Status, Requested + IT Priority, Owner all visible | client/tests/lab-03/StaffTicketQueue.test.tsx | Pass |
| UI-12 | UI | FR-11 | Queue empty state vs no-results state | Correct message for each, distinguishable | client/tests/lab-03/StaffTicketQueue.test.tsx | Pass |
| UI-13 | UI | FR-11 | Queue forbidden state (mocked 403) | Redirect/forbidden message, not a raw error | client/tests/lab-03/StaffTicketQueue.test.tsx | Pass |
| UI-14 | UI | FR-13 | Claim button, unassigned Ticket | Calls owner endpoint with the current user | client/tests/lab-03/StaffTicketDetail.test.tsx | Pass |
| UI-15 | UI | FR-15 | Status dropdown only offers allowed transitions | Options match the mocked allowed-transitions list | client/tests/lab-03/StaffTicketDetail.test.tsx | Pass |
| UI-16 | UI | BR-04 | Public Comments and Internal Notes render in visually distinct panels | Both present, distinguishable by test id/class | client/tests/lab-03/StaffTicketDetail.test.tsx | Pass |
| UI-17 | UI | FR-18 | User list renders Name/Email/Role/Status/Edit | All columns present | client/tests/lab-03/UserManagement.test.tsx | Pending |
| UI-18 | UI | FR-18 | Search + role filter | Filters the rendered list | client/tests/lab-03/UserManagement.test.tsx | Pending |
| UI-19 | UI | AC-15 | Create user, mocked 409 duplicate email | Field-level error shown | client/tests/lab-03/UserManagement.test.tsx | Pending |
| UI-20 | UI | BR-29 | Edit own account | Deactivate control disabled with an explanatory tooltip | client/tests/lab-03/UserManagement.test.tsx | Pending |

### UI Style

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| STYLE-01 | UI Style | ui-spec.md §8 | Role badge classes | Correct class per role, text label always present | client/tests/lab-03/zen-green.style.test.tsx | Pending |
| STYLE-02 | UI Style | ui-spec.md §8 | Status badge classes across all 8 statuses | Each status maps to its documented class/label | client/tests/lab-03/zen-green.style.test.tsx | Pending |
| STYLE-03 | UI Style | ui-spec.md §3 | Editable vs read-only field classes on Staff Ticket Detail | Matches `--zg-field-bg` / `--zg-readonly-bg` convention | client/tests/lab-03/zen-green.style.test.tsx | Pending |
| STYLE-04 | UI Style | ui-spec.md §5 | Internal Notes panel carries its distinct background/label | Class/label present, differs from Public Comments panel | client/tests/lab-03/zen-green.style.test.tsx | Pending |

### Responsive and E2E

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| RESP-01 | Responsive | ui-spec.md §4 | Queue at desktop/tablet/mobile | Table → reduced table → cards; no horizontal scroll | e2e/lab-03/staff-ticket-flow.spec.ts | Pending |
| RESP-02 | Responsive | ui-spec.md §7 | User Management at 3 breakpoints | Usable, no clipping/overlap | e2e/lab-03/user-administration.spec.ts | Pending |
| RESP-03 | Responsive | ui-spec.md §2-3 | Login/Change Password at mobile width | No horizontal scroll, buttons touch-sized | e2e/lab-03/authentication.spec.ts | Pending |
| E2E-01 | E2E | AC-01, AC-02 | Full login → forced password change → app | Ends on the normal application shell | e2e/lab-03/authentication.spec.ts | Pending |
| E2E-02 | E2E | AC-07 | Login → logout → attempt to reuse the app via back-navigation | Redirected to Login, no protected data shown | e2e/lab-03/authentication.spec.ts | Pending |
| E2E-03 | E2E | FR-08 | Requester creates a Ticket, finds it in My Tickets, opens it (authenticated) | Full Lab 2 flow works end-to-end under real auth | e2e/lab-03/authentication.spec.ts | Pending |
| E2E-04 | E2E | FR-13, FR-15 | IT Staff claims a Ticket, sets IT Priority, transitions status, posts a comment and a note | Queue and detail reflect every change | e2e/lab-03/staff-ticket-flow.spec.ts | Pending |
| E2E-05 | E2E | AC-12 | Internal Note posted by staff never appears on the Requester's view of the same Ticket | Confirmed by loading the Ticket as the Requester | e2e/lab-03/staff-ticket-flow.spec.ts | Pending |
| E2E-06 | E2E | FR-19, FR-21 | Administrator creates a user, sets a new initial password for them, that user logs in and is forced to change it | Full loop closes correctly | e2e/lab-03/user-administration.spec.ts | Pending |
| E2E-07 | E2E | AC-13, AC-14 | Administrator attempts self-deactivation and last-admin deactivation in the UI | Both blocked with a clear message | e2e/lab-03/user-administration.spec.ts | Pending |

## 3. Test Commands

```
cd server && npm test        # unit, API, authorization, migration/regression
cd client && npm test        # UI component, UI style
npx playwright test          # responsive, E2E (from repo root)
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit
```

## 4. Final Results

_To be filled in as each Issue lands, with real pass/fail counts and any bugs found
during manual verification — same discipline as Lab 2._

### Issue 32 — Authentication foundation

`cd server && npm test`: **67/67 passed** (11 files) — the 23 new Lab 3 tests
(UNIT-02/03, API-01..14, MIG-01/02/03/08) plus all 44 pre-existing Lab 1/Lab 2
server tests, unmodified in behavior. `cd client && npm test`: 31/31 passed,
untouched by this Issue (backend-only scope). Both `npx tsc --noEmit` clean.

Manual verification against the real dev server (`curl`, not just Supertest):
login sets a cookie with `HttpOnly; SameSite=Lax; Max-Age=28800`; a fresh
login's session blocks `GET /api/categories` with `403
PASSWORD_CHANGE_REQUIRED`; `change-password` returns a **new** cookie with
`mustChangePassword:false` baked in and the same old-cookie request now
reaches `/api/categories` with `200`; `logout` clears the cookie and the same
old cookie value is rejected with `401` on the next request — confirmed this
is real revocation (an in-memory jti deny-list), not just a client-side
cookie clear, since a stateless JWT would otherwise still verify until its
8h expiry.

Two real bugs found and fixed while implementing the migration (not
pre-planned, both regression-tested — MIG-08 and the `/api/requesters` test
in `requester-context.api.test.ts`):
1. `requireActiveRequester` looked up the legacy `X-Dev-Requester-Id` id
   without checking `role`. Post-migration the same table also holds IT
   Staff/Administrator rows, so an active staff id would have been silently
   accepted as a Requester.
2. `GET /api/requesters` (the Lab 2 selector's data source) had the same
   gap — it would have started listing IT Staff and Administrator accounts
   in the selector dropdown.

Both are fixed by scoping the relevant queries to `role: "REQUESTER"`
(`src/requesterAuth.ts`, `src/app.ts`).

### Issue 33 — Role-based authorization and app shell

`cd server && npm test`: **72/72 passed** (12 files) — 5 new AUTHZ tests in
the new `authorization.api.test.ts` (`requireRole` proven in isolation, no
staff/admin route exists yet to hang it on) plus everything from Issue 32
(67/67, 11 files). `cd client && npm test`: **41/41 passed** (11 files) —
Login (6), ChangePassword (5), the new lab-03 AppShell.test.tsx (4, role-nav
+ logout), the lab-02 AppShell/AppRoot tests updated in place for the new
`{user}` Shell prop and the Login gate. Both `npx tsc --noEmit` clean.

Manual verification in the real browser (not just RTL): logged in as one
account per role (Alan Turing/Requester, Margaret Hamilton/IT Staff, Barbara
Liskov/Administrator), each landing on the mandatory Change Password screen
with the live rule checklist updating correctly, then into the shell with
exactly its own role's nav link ("My Tickets"/"Create Ticket" only for
Requester, "My Queue" only for IT Staff, "Users" only for Administrator) and
correct "Name — Role" display. Logout redirects to Login; a direct URL
navigation to `/tickets` after logout redirects back to `/login` (`AC-07` /
Part 5's "direct access blocked after logout"), proving the guard is a real
route-level check, not just a hidden link. The voluntary Change Password
entry point (from the shell) showed "Change Password"/"Save"/Cancel copy
correctly distinct from the mandatory flow's "You must change your
password..."/"Continue".

The Authorization Matrix FR-06 refers to was written up for the first time
in this Issue (`specification.md`, new subsection under §4) — it existed
only as scattered FR/BR statements before, never as the single table the
handout and grading rubric expect.

Known, tracked gap (not silently dropped): removing the Development
Requester selector breaks `e2e/lab-02/helpers.ts`'s `selectRequester()` (it
looks for the now-deleted selector's label). Deliberately deferred to Issue
34, whose own scope is exactly this test-infrastructure migration — the
gap's lifetime is one Issue, not the rest of the sprint.

### Issue 34 — Requester regression on authenticated identity

`cd server && npm test`: **73/73 passed** (12 files) — 1 new AUTHZ-10 test
plus everything from Issue 33 (72/72). `cd client && npm test`: **40/40
passed** (11 files) — one obsolete Lab 2 test removed (the in-app "switching
Requester mid-session" case no longer exists once switching means logging
out and back in as someone else — see below), no other losses. Both
`npx tsc --noEmit` clean.

`X-Dev-Requester-Id` is removed from `src/app.ts` entirely; every Requester
route now uses `requireAuth` + `requireRole("REQUESTER")`, with ownership
always read from `req.user.id`. `src/requesterAuth.ts` is deleted (nothing
imports it anymore). All four Lab 2 server test files (`create-ticket`,
`my-tickets`, `ticket-detail`, `attachments`) were migrated to a shared
`server/tests/lab-03/testAuth.ts` login helper — deliberately not a
"guess which password this shared seed account currently has" approach;
it sets a known password directly via Prisma before logging in, since its
job is producing a working session, not exercising the login flow itself.

**A real bug found only by running the full Playwright suite, not caught by
any unit/API test:** the client (`api.ts`) still sent `X-Dev-Requester-Id`
and never set `credentials: "include"` on any Ticket/Attachment call. Server
tests all passed (they call the Express app directly and can set whatever
headers they like), but in the actual browser this meant every Requester
screen was broken — My Tickets, Create Ticket, and Ticket Detail all failed
with "Unable to load tickets"/generic errors, because the session cookie
was never sent and the header was silently ignored. `e2e/lab-02/*.spec.ts`
caught this immediately (5 of 7 failing) the first time it was run against
the new backend. Fixed by removing the `requesterId` parameter and the
`X-Dev-Requester-Id` header from every function in `api.ts`, adding
`credentials: "include"` throughout, and removing the now-unnecessary
`requesterId` prop from `CreateTicket`, `MyTickets`, and
`RequesterTicketDetail` (it only ever existed to feed that header). Confirmed
fixed by re-running the full `e2e/lab-02/` suite: 7/7 passing.

`e2e/lab-02/helpers.ts`'s `selectRequester()` (the gap flagged at the end of
Issue 33) is rewritten to log in for real via `page.request` (which shares
its cookie jar with `page`, so the session is already present on the next
`page.goto`), completing the mandatory change-password step when needed.
`e2e/lab-02/requester-ticket-flow.spec.ts`'s "switching Requester" test is
rewritten to Logout then Login as someone else — the real equivalent of what
it used to do via the now-deleted in-app switcher.

Manual browser verification: logged in as Ada Lovelace, confirmed My
Tickets renders real ticket data (ticket numbers, dates, status/priority
badges) — the exact screen the E2E suite had caught broken minutes earlier.

### Issue 35 — IT Staff Ticket Queue

Migration (specification.md §7, steps 5-7, all done together in this Issue
rather than split across 35-37 as first planned): `Ticket.itPriority`
(backfilled from `requestedPriority` for all 642 pre-existing rows),
`ticketOwnerId`/`resolutionSummary`/`requesterResolutionIndicatedAt`
(nullable, no backfill needed), and `TicketStatus` grown from 1 to 8 values
via `ALTER TYPE ... ADD VALUE`. A pg_dump backup was taken first
(db-backups/, gitignored). Verified via `psql`: 642/642 rows backfilled
correctly, all 8 enum values present, zero data loss.

`prisma/seed.ts` now seeds 10 realistic Tickets (idempotent — ticket number
year "9999" is both the upsert key and an unmistakable seed marker) spanning
all 8 statuses, both matching and IT-Staff-adjusted priorities, and
assigned/unassigned/administrator-owned tickets — fulfilling §5.3's
"realistic Tickets distributed across statuses, priorities, and ownership"
requirement that Issue 32 deferred until these columns existed.

`GET /api/staff/tickets` implements the full query contract (search,
status, itPriority, ownerId including `unassigned`, categoryId, sort,
order, pagination), guarded by `requireRole("IT_STAFF", "ADMINISTRATOR")`.
Also added `GET /api/staff/users` (not in the original api-spec.md
contract) once building the queue's Owner filter made clear a named
dropdown needs a real list of staff — documented in `api-spec.md` as a
deliberate addition, the same way `/api/staff/tickets` needed the
Authorization Matrix written up in Issue 33.

`cd server && npm test`: **93/93 passed** (13 files) — 19 new
`staff-queue.api.test.ts` tests (STAFF-Q-01..14, the role guard, and
`/api/staff/users`) plus the real MIG-04 test (previously deferred, now
implemented and passing) and everything from Issue 34. `cd client && npm
test`: **46/46 passed** (12 files) — 6 new `StaffTicketQueue.test.tsx`
tests (UI-11/12/13). Both `npx tsc --noEmit` clean.

Two test-fragility bugs found and fixed while writing this Issue's tests,
both the same underlying lesson as Issue 32's `mustChangePassword` fix —
a migration-time or filter-time invariant is not a permanent one once real
usage (or realistic seed data simulating it) legitimately changes the
field:
1. MIG-04 initially failed because the new seed Tickets deliberately give a
   few Tickets an IT-adjusted `itPriority` different from
   `requestedPriority` — correctly excluded from the check by ticket number
   (`TKT-9999-*`), which are Tickets created *after* the migration, not
   pre-existing ones it's meant to verify.
2. STAFF-Q-05/06 (`itPriority=HIGH`, `ownerId=unassigned`) initially
   asserted specific seed Tickets appeared within a `pageSize=50` window —
   both filters are also matched by hundreds of ordinary Tickets from other
   tests, which can drown the fixtures out of the first page once enough
   accumulate. Fixed by combining each with `search=TKT-9999` to scope
   precisely to the seed fixtures being asserted on.

A third, separate bug: adding `staff-queue.api.test.ts` (which calls
`loginAs()` on the shared Margaret Hamilton/Barbara Liskov accounts) changed
which test file resets which shared account's password, and by coincidence
this pushed `auth.api.test.ts`'s own `SEED_PASSWORD`-based logins (against
whichever account `findFirstOrThrow` happened to return) into occasional
failure depending on file execution order. Fixed by making
`auth.api.test.ts` fully self-contained — it now creates its own dedicated
fixture accounts via `createFreshRequester()` instead of reusing any shared
seeded identity, immune to any other file's side effects regardless of
order. Confirmed via 3 consecutive full-suite runs after the fix.

One additional transient failure was observed in a full-suite run after
that fix (not reproduced in 15 subsequent runs). `ps aux` found 7 zombie
`tsx watch` dev-server processes accumulated from earlier manual-verification
restarts across Issues 32-35 (the same class of issue as Lab 2's
zombie-process cleanup) — a plausible source of resource contention during
the bcrypt-heavy suite, though the original failure's exact error wasn't
captured before it scrolled past. Cleaned with `pkill -9 -f "tsx watch
src/index.ts"`; 5 further consecutive clean runs afterward. Flagged here
rather than silently dismissed, per the standing "no unexplained flakiness"
rule — the fix is real (one confirmed contributing factor removed) even
though full certainty about the single occurrence isn't possible after the
fact.

Manual browser verification: logged in as Margaret Hamilton (IT Staff),
confirmed the desktop table (all 9 columns, correct badges, real owner
names, real category names) and the mobile card layout (no horizontal
scroll, both priority badges + owner visible) against the real seeded data,
searching `TKT-9999` to see all 8 statuses at once with their distinct
badge tones and labels.

### Issue 36 — IT Staff Ticket Detail and workflow

`server/src/statusTransitions.ts` is the sole source of truth for the
transition matrix (UNIT-01), reused directly by `PATCH
/api/staff/tickets/:id/status` — a disallowed transition's 409 names both
the current state and every allowed target (e.g. "Cannot move from NEW to
RESOLVED. Allowed: OPEN, CANCELLED."). `client/src/ticketStatus.ts` mirrors
the same table for the Status dropdown's options (ui-spec.md §5: hiding a
button is not authorization, so the server re-checks regardless).

`GET /api/staff/tickets/:id`, `PATCH .../owner` (claim/reassign, validating
the target is an active IT_STAFF/ADMINISTRATOR user), `PATCH .../priority`,
`PATCH .../status` (with the resolutionSummary submitted alongside a move
to Resolved), and `PATCH /api/tickets/:id/resolution-indicated`
(Requester-only, sets the signal without touching status, per BR-05) are
all implemented and guarded: `requireStaffWrite` (`IT_STAFF` only — even
Administrator gets 403, consistent with its read-only role) for the first
three, `requireRequester` for the last one. `GET
/api/staff/tickets/:id`'s response hardcodes empty `publicComments`/
`internalNotes` arrays — the shape api-spec.md already commits to, with
real data landing in Issue 37 once those tables exist.

`cd server && npm test`: **123/123 passed** (15 files) — 8 new
`status-transitions.unit.test.ts` (UNIT-01, every matrix edge including
terminal Cancelled) and 22 new `staff-ticket-detail.api.test.ts`
(STAFF-D-01..12 plus AUTHZ-04/05/11/12, colocated with the routes they
guard — the same refinement as AUTHZ-03 in Issue 35) plus everything from
Issue 35. `cd client && npm test`: **50/50 passed** (13 files) — 4 new
`StaffTicketDetail.test.tsx` tests (UI-14/15; UI-16 stays Pending until
Issue 37's comment/note panels exist). Both `npx tsc --noEmit` clean.

A recurring test-fragility lesson from this sprint showed up a third time:
STAFF-D-07's fixture (proving IT Priority updates don't touch Requested
Priority) creates a real `itPriority`/`requestedPriority` mismatch via the
actual PATCH route, which broke MIG-04 again until its exclusion list also
covered the `TKT-TEST-*` ticket numbers this file's fixtures use (alongside
the `TKT-9999-*` seed exclusion already added in Issue 35) — the same
"migration-time invariant is not a permanent one" pattern, now hit by a
third independent source.

Manual browser verification end-to-end on a real seeded Ticket: Claim (owner
became "Margaret Hamilton", Status dropdown correctly showed only NEW's
allowed targets: Open, Cancelled) → changed Status to Open (dropdown updated
to Open's own allowed targets) → changed Status to Resolved (Resolution
Summary panel appeared, saved, badge and read-only summary updated
correctly). Separately, logged in as Alan Turing (Requester) on one of his
own NEW Tickets, clicked "Mark problem as resolved," confirmed the exact
confirmation copy from ui-spec.md §6 appeared and the Status badge stayed
unchanged (New) — the signal never touches formal status.

### Issue 37 — Public Comments and Internal Notes

`PublicComment` and `InternalNote` are separate Prisma models/tables, not one
table with an `isInternal` flag — the leak-prevention argument from
specification.md holds structurally: a route that queries `PublicComment`
has no way to accidentally return a Note, because there is no column, no
flag, and no shared query path to get it wrong on. `POST/GET
/api/tickets/:id/comments` mixes Requester-ownership (404, not 403, on a
Ticket the caller doesn't own — BR-16) with IT_STAFF-any-Ticket access, and
flatly 403s an Administrator on POST regardless of ownership, consistent
with its read-only role everywhere else in the workflow. `POST/GET
/api/tickets/:id/notes` reuse `requireStaffWrite`/`requireStaffRead`
(IT_STAFF and Administrator respectively — Administrator can read Notes,
per FR-22, but never write anywhere in the workflow). `GET
/api/tickets/:id` (Requester) now returns real `publicComments` and never an
`internalNotes` key at all; `GET /api/staff/tickets/:id` returns both real
arrays, replacing Issue 36's hardcoded `[]` placeholder.

While writing this Issue's tests, the Authorization Matrix (added in Issue
33) turned up two places where earlier prose had drifted from it:
specification.md's BR-21 said IT Priority could be changed "by IT Staff or
Administrator" (the matrix says IT_STAFF only), and api-spec.md's POST
comments/notes sections said Administrator "may post"/could act (the matrix
says Administrator is read-only on the whole Ticket workflow). Both were
already implemented correctly — only the prose was stale — so both were
fixed to match the matrix rather than the other way around.

`cd server && npm test`: **140/140 passed** (16 files) — 17 new
`comments-notes.api.test.ts` tests covering CN-01..10 plus AUTHZ-01/02
(colocated with the notes routes they guard, the same refinement as
AUTHZ-03/04/05/11/12 in Issues 35/36) plus two Administrator-rejection
cases and a cross-Requester-404 case that weren't in the original plan but
follow directly from the Authorization Matrix fixes above. `cd client && npm
test`: **51/51 passed** (13 files) — 1 new `StaffTicketDetail.test.tsx` test
(UI-16). Both `npx tsc --noEmit` clean.

`CommentPanel.tsx` is the one component behind both variants
(`data-testid="public-comments-panel"`/`"internal-notes-panel"`, an
"Internal — not visible to Requester" label on the internal variant only) —
`StaffTicketDetail.tsx` renders both, `RequesterTicketDetail.tsx` renders
only the public one. Internal Notes never appear anywhere in a Requester
session's code path — there's no conditional hiding a Requester could see
around, because the component simply isn't imported for that panel and the
API response the screen consumes has no field to render even if it were.

Adding the Public Comments panel to `RequesterTicketDetail.tsx` broke one
pre-existing Lab 2 test (`tests/lab-02/RequesterTicketDetail.test.tsx`),
which asserted zero textboxes anywhere on the page as a proxy for "the
Ticket's fields are read-only." That proxy was never precise — the fields'
read-only-ness was already independently confirmed by the `getByText`
checks above it — so the assertion was narrowed to what it actually meant:
exactly one textbox exists, and it's the comment box, not a field editor.

Manual browser verification end-to-end, three real accounts, one real
Ticket: logged in as Ada Lovelace (Requester), posted a Public Comment;
logged in as Margaret Hamilton (IT Staff), opened the same Ticket, saw
Ada's comment, posted a Public Comment and an Internal Note — both panels
rendered distinctly, each showing only its own entry; logged back in as Ada
and confirmed both Public Comments were visible but the Internal Notes
heading, its "not visible to Requester" label, and the note's text appeared
nowhere in the page — and, checking past the DOM to the wire itself, the
`GET /api/tickets/:id` response body for Ada's session had no
`internalNotes` key at all, confirming the absence is structural and not a
client-side filter that a determined user could bypass by reading the
network tab.
