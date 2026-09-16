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
| UNIT-01 | Unit | BR-22 | Status transition table lookup | Returns allowed next statuses for each of the 8 statuses; empty set for Cancelled | server/tests/lab-03/status-transitions.unit.test.ts | Pending |
| UNIT-02 | Unit | BR-11 | Password rule validator | Rejects short/no-uppercase/no-digit/no-special-char passwords; accepts a compliant one | server/tests/lab-03/password-rules.unit.test.ts | Pending |
| UNIT-03 | Unit | BR-06 | Password hashing helper | bcrypt hash differs from plaintext; verifies correctly against the original password | server/tests/lab-03/password-rules.unit.test.ts | Pending |

### API — Authentication (`auth.api.test.ts`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-01 | API | AC-01 | Valid login | 200, sets cookie, returns identity + role | server/tests/lab-03/auth.api.test.ts | Pending |
| API-02 | API | AC-05 | Login with unknown email | 401, generic message | server/tests/lab-03/auth.api.test.ts | Pending |
| API-03 | API | AC-05 | Login with wrong password | 401, identical generic message to API-02 | server/tests/lab-03/auth.api.test.ts | Pending |
| API-04 | API | AC-06 | Login with inactive account, correct password | 401, identical generic message | server/tests/lab-03/auth.api.test.ts | Pending |
| API-05 | API | FR-01 | Missing email or password field | 400 | server/tests/lab-03/auth.api.test.ts | Pending |
| API-06 | API | FR-02 | GET /api/auth/me, valid session | 200, correct identity/role/mustChangePassword | server/tests/lab-03/auth.api.test.ts | Pending |
| API-07 | API | BR-14 | GET /api/auth/me, no session | 401 | server/tests/lab-03/auth.api.test.ts | Pending |
| API-08 | API | AC-07 | Logout then repeat prior protected request with old cookie | 401 | server/tests/lab-03/auth.api.test.ts | Pending |
| API-09 | API | AC-02, BR-02 | Any normal route while mustChangePassword=true | 403 PASSWORD_CHANGE_REQUIRED | server/tests/lab-03/auth.api.test.ts | Pending |
| API-10 | API | BR-02 | /api/auth/me, /change-password, /logout while mustChangePassword=true | All succeed (exempt routes) | server/tests/lab-03/auth.api.test.ts | Pending |
| API-11 | API | FR-05, BR-11 | Change password with a rule-violating new password | 400 | server/tests/lab-03/auth.api.test.ts | Pending |
| API-12 | API | BR-12 | Change password where new equals current | 400 | server/tests/lab-03/auth.api.test.ts | Pending |
| API-13 | API | FR-05 | Change password with wrong current password | 401 | server/tests/lab-03/auth.api.test.ts | Pending |
| API-14 | API | AC-02, BR-13 | Change password success | 200, mustChangePassword cleared, normal routes now reachable | server/tests/lab-03/auth.api.test.ts | Pending |

### API — Authorization (`authorization.api.test.ts`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| AUTHZ-01 | Security | AC-04 | Requester calls GET internal notes directly | 403, no note content in body | server/tests/lab-03/authorization.api.test.ts | Pending |
| AUTHZ-02 | Security | AC-04 | Requester calls POST internal notes directly | 403, note not created | server/tests/lab-03/authorization.api.test.ts | Pending |
| AUTHZ-03 | Security | AC-16 | Requester calls GET /api/staff/tickets | 403 | server/tests/lab-03/authorization.api.test.ts | Pending |
| AUTHZ-04 | Security | FR-13 | Requester calls PATCH owner/priority/status directly | 403 on all three | server/tests/lab-03/authorization.api.test.ts | Pending |
| AUTHZ-05 | Security | AC-10 | Requester calls PATCH status directly with any target status | 403 regardless of target | server/tests/lab-03/authorization.api.test.ts | Pending |
| AUTHZ-06 | Security | AC-16 | IT Staff calls any /api/admin/* route | 403 | server/tests/lab-03/authorization.api.test.ts | Pending |
| AUTHZ-07 | Security | AC-16 | Requester calls any /api/admin/* route | 403 | server/tests/lab-03/authorization.api.test.ts | Pending |
| AUTHZ-08 | Security | BR-14 | Any protected route with no session at all | 401, not 403 | server/tests/lab-03/authorization.api.test.ts | Pending |
| AUTHZ-09 | Security | BR-14 | Any protected route with a tampered/invalid JWT | 401 | server/tests/lab-03/authorization.api.test.ts | Pending |
| AUTHZ-10 | Security | AC-03, BR-03 | Authenticated Requester supplies a different requesterId in the body/query | Backend ignores it, uses session identity only | server/tests/lab-03/authorization.api.test.ts | Pending |
| AUTHZ-11 | Security | FR-06 | Administrator calls a Ticket-workflow write route (owner/priority/status) | 403 (read-only per §11 decision) | server/tests/lab-03/authorization.api.test.ts | Pending |
| AUTHZ-12 | Security | FR-22 | Administrator calls GET staff ticket detail (read) | 200, allowed | server/tests/lab-03/authorization.api.test.ts | Pending |

### API — Requester regression (migrated Lab 2 routes)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| MIG-01 | Migration/Regression | AC-17 | A Ticket created under Lab 2 (pre-migration fixture) is fetched by its migrated owner post-migration | 200, same Ticket Number, content, Attachments | server/tests/lab-03/migration-regression.api.test.ts | Pending |
| MIG-02 | Migration/Regression | BR-33 | Every pre-existing RequesterUser row exists as a User post-migration with the same id | Row counts and ids match before/after | server/tests/lab-03/migration-regression.api.test.ts | Pending |
| MIG-03 | Migration/Regression | BR-34 | Every migrated User has role=REQUESTER, mustChangePassword=true, a valid bcrypt hash | All three true for every migrated row | server/tests/lab-03/migration-regression.api.test.ts | Pending |
| MIG-04 | Migration/Regression | BR-35 | Every pre-existing Ticket has itPriority = its requestedPriority after migration | Equal for every row | server/tests/lab-03/migration-regression.api.test.ts | Pending |
| MIG-05 | Migration/Regression | BR-36 | X-Dev-Requester-Id header sent to any Lab 2 route post-migration | Ignored entirely; identity comes from the session only | server/tests/lab-03/migration-regression.api.test.ts | Pending |
| MIG-06 | Regression | FR-08 | Full Lab 2 create/list/detail/attachment flow, authenticated | Identical behavior to Lab 2, now under a real session | server/tests/lab-03/create-ticket.api.test.ts (existing, migrated) | Pending |
| MIG-07 | Regression | — | Full Lab 1 + Lab 2 suites | All still pass unmodified in behavior | server/tests/lab-01/*, server/tests/lab-02/* | Pending |

### API — IT Staff Ticket Queue (`staff-queue.api.test.ts`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| STAFF-Q-01 | API | FR-11 | GET queue, no filters | 200, all Tickets from every Requester (shared, not scoped) | server/tests/lab-03/staff-queue.api.test.ts | Pending |
| STAFF-Q-02 | API | FR-11 | search matches ticketNumber | Correct subset returned | server/tests/lab-03/staff-queue.api.test.ts | Pending |
| STAFF-Q-03 | API | FR-11 | search matches summary | Correct subset returned | server/tests/lab-03/staff-queue.api.test.ts | Pending |
| STAFF-Q-04 | API | FR-11 | status filter | Only matching-status Tickets returned | server/tests/lab-03/staff-queue.api.test.ts | Pending |
| STAFF-Q-05 | API | FR-11 | itPriority filter | Only matching Tickets returned | server/tests/lab-03/staff-queue.api.test.ts | Pending |
| STAFF-Q-06 | API | FR-11 | ownerId=unassigned | Only Tickets with ticketOwnerId=null returned | server/tests/lab-03/staff-queue.api.test.ts | Pending |
| STAFF-Q-07 | API | FR-11 | ownerId=<id> | Only that owner's Tickets returned | server/tests/lab-03/staff-queue.api.test.ts | Pending |
| STAFF-Q-08 | API | FR-11 | categoryId filter | Only matching Tickets returned | server/tests/lab-03/staff-queue.api.test.ts | Pending |
| STAFF-Q-09 | API | FR-11 | Combined filters | Only Tickets matching all of them returned | server/tests/lab-03/staff-queue.api.test.ts | Pending |
| STAFF-Q-10 | API | FR-11 | sort=itPriority&order=desc | Ordered High→Low, id desc secondary | server/tests/lab-03/staff-queue.api.test.ts | Pending |
| STAFF-Q-11 | API | FR-11 | Default sort/order | updatedAt desc | server/tests/lab-03/staff-queue.api.test.ts | Pending |
| STAFF-Q-12 | API | AC-18 | Invalid sort value | 400 naming the parameter | server/tests/lab-03/staff-queue.api.test.ts | Pending |
| STAFF-Q-13 | API | AC-18 | Invalid status value in filter | 400 naming the parameter | server/tests/lab-03/staff-queue.api.test.ts | Pending |
| STAFF-Q-14 | API | FR-11 | page/pageSize | Correct page returned, meta.totalPages correct | server/tests/lab-03/staff-queue.api.test.ts | Pending |

### API — IT Staff Ticket Detail and workflow (`staff-ticket-detail.api.test.ts`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| STAFF-D-01 | API | FR-12 | GET staff ticket detail | 200, includes attachments + comments + notes together | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pending |
| STAFF-D-02 | API | FR-12 | GET staff ticket detail, nonexistent id | 404 | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pending |
| STAFF-D-03 | API | AC-08, FR-13 | Claim an unassigned Ticket | 200, ticketOwnerId = caller | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pending |
| STAFF-D-04 | API | FR-13 | Reassign to another active IT Staff user | 200, ticketOwnerId updated | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pending |
| STAFF-D-05 | API | BR-19 | Assign an inactive user as owner | 400 | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pending |
| STAFF-D-06 | API | BR-19 | Assign a Requester-role user as owner | 400 | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pending |
| STAFF-D-07 | API | FR-14, BR-21 | Update IT Priority | 200, itPriority changed; requestedPriority unchanged | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pending |
| STAFF-D-08 | API | FR-15 | Valid status transition (e.g. New→Open) | 200, status updated | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pending |
| STAFF-D-09 | API | AC-09, BR-22 | Disallowed status transition (New→Resolved) | 409, message names current + allowed statuses | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pending |
| STAFF-D-10 | API | BR-23 | Any transition attempted from Cancelled | 409, empty allowed list | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pending |
| STAFF-D-11 | API | FR-17, BR-24 | Move to Resolved with a resolutionSummary | 200, resolutionSummary saved | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pending |
| STAFF-D-12 | API | AC-11, FR-10 | Requester posts resolution-indicated signal | requesterResolutionIndicatedAt set, status unchanged | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pending |

### API — Public Comments and Internal Notes (`comments-notes.api.test.ts`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| CN-01 | API | FR-09 | Requester posts a Public Comment on own Ticket | 201 | server/tests/lab-03/comments-notes.api.test.ts | Pending |
| CN-02 | API | FR-09 | Requester posts a Public Comment on a Ticket they don't own | 404 | server/tests/lab-03/comments-notes.api.test.ts | Pending |
| CN-03 | API | BR-26 | Post empty/whitespace-only comment | 400 | server/tests/lab-03/comments-notes.api.test.ts | Pending |
| CN-04 | API | BR-26 | Post comment over 4000 chars | 400 | server/tests/lab-03/comments-notes.api.test.ts | Pending |
| CN-05 | API | FR-16 | IT Staff posts a Public Comment | 201 | server/tests/lab-03/comments-notes.api.test.ts | Pending |
| CN-06 | API | BR-04 | GET comments as Requester, IT Staff, Administrator | All three see the same list | server/tests/lab-03/comments-notes.api.test.ts | Pending |
| CN-07 | API | FR-16 | IT Staff creates an Internal Note | 201 | server/tests/lab-03/comments-notes.api.test.ts | Pending |
| CN-08 | API | AC-12, BR-04 | Requester fetches Ticket detail after a Note is posted | Note absent anywhere in the response | server/tests/lab-03/comments-notes.api.test.ts | Pending |
| CN-09 | API | BR-25 | No edit/delete route exists for either model | Attempting one returns 404/405 | server/tests/lab-03/comments-notes.api.test.ts | Pending |
| CN-10 | API | BR-27 | Author/timestamp always come from the backend | Client-supplied authorId/createdAt in body ignored | server/tests/lab-03/comments-notes.api.test.ts | Pending |

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
| UI-01 | UI | FR-01 | Login form, empty submit | Field-level errors, no API call | client/tests/lab-03/Login.test.tsx | Pending |
| UI-02 | UI | AC-05 | Login, mocked 401 | Generic error message shown | client/tests/lab-03/Login.test.tsx | Pending |
| UI-03 | UI | FR-01 | Login, busy state | Button shows spinner label, disabled | client/tests/lab-03/Login.test.tsx | Pending |
| UI-04 | UI | FR-01 | Show/hide password toggle | Input type switches; icon has aria-label | client/tests/lab-03/Login.test.tsx | Pending |
| UI-05 | UI | AC-02 | Successful login with mustChangePassword=true | Redirects to Change Password, not the app | client/tests/lab-03/Login.test.tsx | Pending |
| UI-06 | UI | BR-11 | Change Password, weak new password | Field error, checklist shows unmet rules | client/tests/lab-03/ChangePassword.test.tsx | Pending |
| UI-07 | UI | BR-12 | Change Password, confirm mismatch | Field error, no API call | client/tests/lab-03/ChangePassword.test.tsx | Pending |
| UI-08 | UI | AC-02 | Change Password success (mandatory flow) | Proceeds into the application | client/tests/lab-03/ChangePassword.test.tsx | Pending |
| UI-09 | UI | FR-07 | Shell renders correct nav per role (3 cases: Requester/IT Staff/Administrator) | Only permitted links rendered | client/tests/lab-03/AppShell.test.tsx | Pending |
| UI-10 | UI | FR-03 | Logout button | Calls logout, redirects to Login | client/tests/lab-03/AppShell.test.tsx | Pending |
| UI-11 | UI | FR-11 | Queue renders rows with all badges | Ticket Number, Status, Requested + IT Priority, Owner all visible | client/tests/lab-03/StaffTicketQueue.test.tsx | Pending |
| UI-12 | UI | FR-11 | Queue empty state vs no-results state | Correct message for each, distinguishable | client/tests/lab-03/StaffTicketQueue.test.tsx | Pending |
| UI-13 | UI | FR-11 | Queue forbidden state (mocked 403) | Redirect/forbidden message, not a raw error | client/tests/lab-03/StaffTicketQueue.test.tsx | Pending |
| UI-14 | UI | FR-13 | Claim button, unassigned Ticket | Calls owner endpoint with the current user | client/tests/lab-03/StaffTicketDetail.test.tsx | Pending |
| UI-15 | UI | FR-15 | Status dropdown only offers allowed transitions | Options match the mocked allowed-transitions list | client/tests/lab-03/StaffTicketDetail.test.tsx | Pending |
| UI-16 | UI | BR-04 | Public Comments and Internal Notes render in visually distinct panels | Both present, distinguishable by test id/class | client/tests/lab-03/StaffTicketDetail.test.tsx | Pending |
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
