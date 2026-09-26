# Lab 4 Test Plan and Results

This plan is written and approved before implementation (Test DD). Each row is
written first as a failing test, checked to fail for the right reason, then made to
pass (TDD). The "Final" column holds the real result of the run from `main`, filled in
as each Issue lands — never reconstructed afterward.

## 1. Test Strategy

Ten required levels: unit, API/integration, UI component, UI style, responsive,
authorization, workflow, migration/regression, performance-smoke, and E2E.

- **Unit** and **API/integration** run under Vitest + Supertest against the real local
  PostgreSQL (same as Labs 1–3), in `server/tests/lab-04/`.
- **Authorization** tests call every protected Lab 4 operation directly with the wrong
  role and with no session. They live next to the feature they guard (as in Lab 3),
  and the revised Administrator rights have their own rows.
- **Workflow** tests (`ticket-workflow.api.test.ts`) cover the final transition
  matrix, the resolution gate by direct API call, `resolvedAt`, status history, and
  stale updates.
- **Dashboard** tests compare every metric with a direct Prisma query run in the same
  test against the same database, never with a hard-coded number.
- **Performance-smoke** (`dashboard-performance.smoke.test.ts`) times both dashboard
  endpoints on the full local database and counts the SQL queries each one issues.
- **Migration/regression**: `migration-regression.api.test.ts` proves legacy data
  survives the migration and is not blocked by the gate; the rollback is exercised by
  a script on a restored copy of the dump (§2, MIG-05). Regression is the complete
  Lab 1–3 suites (server, client, Playwright), run from `main`.
- **UI component** and **UI style** run under Vitest + Testing Library in
  `client/tests/lab-04/`; style assertions live in `zen-green.style.test.tsx`, as in
  Lab 3.
- **Responsive** and **E2E** run under Playwright in `e2e/lab-04/`, with screenshots in
  `artifacts/lab-04/screenshots/`.

Files added beyond the handout's minimum list, on purpose: `action-status.unit.test.ts`,
`migration-regression.api.test.ts`, `hardening.api.test.ts`,
`dashboard-performance.smoke.test.ts` (server); `Hardening.test.tsx`,
`zen-green.style.test.tsx` (client); `responsive.spec.ts`, `regression.spec.ts` (E2E).

Every Acceptance Criterion in `specification.md` maps to at least one row (§4).

## 2. Planned Tests

### Unit (`server/tests/lab-04/action-status.unit.test.ts`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-07 | Action status matrix lookup | Allowed targets per status; none for COMPLETED and CANCELLED | server/tests/lab-04/action-status.unit.test.ts | Pass |
| UNIT-02 | Unit | BR-16 | `resolvedAt` rule for a transition | Set on → RESOLVED, kept on → CLOSED, cleared on → REOPENED, untouched otherwise | server/tests/lab-04/action-status.unit.test.ts | Pass |
| UNIT-03 | Unit | BR-27 | Comma-separated `status` parser | Parses one or several statuses; rejects an unknown value by name | server/tests/lab-04/action-status.unit.test.ts | Pass |

### API — Actions Taken (`actions-taken.api.test.ts`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-01 | API | FR-01 | IT Staff lists a Ticket's Actions Taken | 200, all actions, ordered by actionAt then id | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-02 | API | AC-10, BR-12 | Several actions with equal actionAt | Order is stable (id breaks ties) across two reads | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-03 | API | AC-01 | Create a valid Action Taken | 201, under the correct Ticket, creator = session user, approved assignee, version 1 | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-04 | API | AC-03, BR-03 | Create with a forged `performedById` | Saved performer is the session user | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-05 | API | AC-04, BR-05 | `followUpRequired: true`, no note (create and update) | 400 both times, nothing saved | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-06 | API | BR-05 | `followUpRequired: false` with a note | 201, stored note is null | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-07 | API | AC-05, BR-04 | Assign an inactive IT Staff user | 400 on create and on update | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-08 | API | AC-05, BR-04 | Assign a Requester | 400 | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-09 | API | FR-03 | Reassign to another active staff user, then unassign | 200 each, assignee updated then null | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-10 | API | BR-06 | Blank description, 4001-char text, invalid actionAt | 400 each | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-11 | API | AC-06, FR-05 | PLANNED → IN_PROGRESS → COMPLETED (with result) | 200 each, version increments | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-12 | API | AC-06, BR-08 | Complete without a result | 400, status unchanged | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-13 | API | AC-06, BR-07 | Cancel a PLANNED action | 200, CANCELLED | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-14 | API | AC-06, BR-07 | Transition outside the matrix (e.g. IN_PROGRESS → PLANNED) | 409 INVALID_ACTION_TRANSITION naming allowed targets | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-15 | API | AC-07, BR-09 | Any update to a COMPLETED or CANCELLED action | 409 ACTION_TERMINAL | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-16 | API | AC-14, BR-10 | Create or update an action on a RESOLVED / CLOSED / CANCELLED Ticket | 409 TICKET_NOT_ACTIVE | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-17 | API | AC-16, BR-20 | Update with a stale version | 409 STALE_UPDATE with current state; first change kept | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-18 | API | BR-20 | Update without `version` | 400 | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-19 | API | BR-11 | `DELETE /api/actions/:id` | No such route (404), action still present | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-20 | API | BR-02 | Action created by an IT Staff user who is not the Ticket Owner | 201 | server/tests/lab-04/actions-taken.api.test.ts | Pass |

### Authorization — Actions Taken (`actions-taken.api.test.ts`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| AUTHZ-01 | Authorization | AC-08 | Requester POSTs an Action Taken on their own Ticket | 403, nothing created | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| AUTHZ-02 | Authorization | AC-08 | Requester PATCHes an Action Taken | 403, unchanged | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| AUTHZ-03 | Authorization | AC-09 | Requester lists Actions Taken of their own Ticket | 200, same fields | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| AUTHZ-04 | Authorization | AC-09, BR-16 (Lab 3) | Requester lists Actions Taken of another Requester's Ticket | 404 | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| AUTHZ-05 | Authorization | AC-11 | Administrator creates and completes an Action Taken | 201 then 200 | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| AUTHZ-06 | Authorization | BR-14 (Lab 3) | Every Actions Taken route with no session / tampered token | 401 | server/tests/lab-04/actions-taken.api.test.ts | Pass |

### Workflow (`ticket-workflow.api.test.ts`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| WF-01 | Workflow | BR-14 | Every allowed transition of the final matrix | 200 for each pair in the matrix | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| WF-02 | Workflow | BR-14 | Disallowed transitions (sample per source status) | 409 naming allowed targets | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| WF-03 | Workflow | AC-12, BR-15 | Resolve with a PLANNED action, by direct API call | 409 RESOLUTION_BLOCKED with that action's id; status unchanged | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| WF-04 | Workflow | AC-12, BR-15 | Resolve with an IN_PROGRESS action | 409 RESOLUTION_BLOCKED | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| WF-05 | Workflow | AC-13, BR-15 | Resolve when all actions are COMPLETED/CANCELLED | 200, resolvedAt set | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| WF-06 | Workflow | AC-13, BR-15 | Resolve a Ticket with no actions | 200 | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| WF-07 | Workflow | BR-15 | Concurrent "resolve" and "create PLANNED action" on the same Ticket | Never ends RESOLVED with an open action | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| WF-08 | Workflow | BR-16 | RESOLVED → CLOSED → REOPENED | resolvedAt kept on CLOSED, cleared on REOPENED | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| WF-09 | Workflow | AC-15, BR-18 | Status history after three changes | Three rows, oldest first, correct from/to/by | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| WF-10 | Workflow | AC-15 | Status history read by owner / other Requester / staff | 200 / 404 / 200 | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| WF-11 | Workflow | AC-16, BR-21 | Status change with a stale Ticket version | 409 STALE_UPDATE; status unchanged | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| WF-12 | Workflow | BR-21 | Owner / priority change with a stale version; and without version | 409; without version 200 (Lab 3 contract) | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| WF-13 | Workflow | AC-18 | `allowedTransitions` in the staff Ticket detail | Equals the matrix row for the current status | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| WF-14 | Workflow | BR-17 | Requester "appears resolved" signal on a Ticket with open actions | Signal recorded, status unchanged | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |

### Authorization — revised matrix (`ticket-workflow.api.test.ts`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| AUTHZ-07 | Authorization | AC-17 | Administrator claims / reassigns a Ticket | 200 | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| AUTHZ-08 | Authorization | AC-17 | Administrator sets IT Priority | 200 | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| AUTHZ-09 | Authorization | AC-17 | Administrator changes status (incl. resolution gate applies to them too) | 200; 409 when blocked | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| AUTHZ-10 | Authorization | AC-17 | Administrator posts a Public Comment and an Internal Note | 201 each | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| AUTHZ-11 | Authorization | BR-14 | Requester calls status / owner / priority on their own Ticket | 403 each | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |

### API — Requester dashboard (`requester-dashboard.api.test.ts`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| DASH-R-01 | API | AC-19 | Each of the 4 counts vs a direct Prisma count for that Requester | Equal | server/tests/lab-04/requester-dashboard.api.test.ts | Pass |
| DASH-R-02 | API | AC-02, BR-23 | Another Requester's Tickets in every status exist | Never counted or listed | server/tests/lab-04/requester-dashboard.api.test.ts | Pass |
| DASH-R-03 | API | AC-19 | Recent Tickets list | 5 max, `updatedAt` desc, own only, equals direct query | server/tests/lab-04/requester-dashboard.api.test.ts | Pass |
| DASH-R-04 | API | AC-19 | Recently Resolved list | 5 max, `resolvedAt` desc, RESOLVED/CLOSED only | server/tests/lab-04/requester-dashboard.api.test.ts | Pass |
| DASH-R-05 | API | AC-20, BR-26 | Requester with no Tickets | All counts 0, lists empty, drill-downs present | server/tests/lab-04/requester-dashboard.api.test.ts | Pass |
| DASH-R-06 | API | AC-21, BR-27 | Each card's drill-down applied to `GET /api/tickets` | `meta.total` equals the card count | server/tests/lab-04/requester-dashboard.api.test.ts | Pass |
| DASH-R-07 | Authorization | FR-11 | IT Staff / Administrator / no session call it | 403 / 403 / 401 | server/tests/lab-04/requester-dashboard.api.test.ts | Pass |
| DASH-R-08 | API | BR-27 | `GET /api/tickets?status=NEW,OPEN` and an unknown status | Filtered list; 400 naming the bad value | server/tests/lab-04/requester-dashboard.api.test.ts | Pass |

### API — IT Staff dashboard (`staff-dashboard.api.test.ts`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| DASH-S-01 | API | AC-19 | New / Open / In Progress / Waiting counts vs direct Prisma counts | Equal | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| DASH-S-02 | API | AC-19 | Unassigned, My Assigned, High Priority vs direct queries | Equal, CLOSED/CANCELLED excluded | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| DASH-S-03 | API | AC-19 | My Open Actions count and list | Only my PLANNED/IN_PROGRESS actions, 10 max oldest first, total correct | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| DASH-S-04 | API | AC-19 | Recent Tickets list | 10 max, `updatedAt` desc, equals direct query | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| DASH-S-05 | API | AC-20 | IT Staff user with nothing assigned | My Assigned and My Open Actions are 0, drill-downs present | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| DASH-S-06 | API | AC-21, BR-27 | Each Queue drill-down applied to `GET /api/staff/tickets` | `meta.total` equals the card count | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| DASH-S-07 | API | AC-23 | Administrator variant | Same metrics plus active/inactive counts equal to direct queries | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| DASH-S-08 | API | FR-12 | IT Staff response | No `accounts` block | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| DASH-S-09 | Authorization | AC-22 | Requester / no session | 403 / 401 | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| DASH-S-10 | API | BR-27 | `GET /api/staff/tickets?status=OPEN,REOPENED` | Only those statuses; single value unchanged | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |

### Performance-smoke (`dashboard-performance.smoke.test.ts`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| PERF-01 | Performance-smoke | AC-24 | Staff dashboard on ≥ 2,000 Tickets and ≥ 2,000 Actions Taken | < 300 ms (median of 5 calls) | server/tests/lab-04/dashboard-performance.smoke.test.ts | Pass |
| PERF-02 | Performance-smoke | AC-24 | Requester dashboard on the same volume | < 300 ms | server/tests/lab-04/dashboard-performance.smoke.test.ts | Pass |
| PERF-03 | Performance-smoke | AC-24, BR-22 | SQL statements per staff dashboard call for two users with different, non-zero numbers of open actions (and a zero-data user) | Same count for both busy users, ≤ 12, zero-data user ≤ that (no per-row queries) | server/tests/lab-04/dashboard-performance.smoke.test.ts | Pass |

### Migration / hardening API (`migration-regression.api.test.ts`, `hardening.api.test.ts`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| MIG-01 | Migration | §7 | Every pre-migration Ticket has `version = 1` | True for every row older than the migration | server/tests/lab-04/migration-regression.api.test.ts | Pass |
| MIG-02 | Migration | §7 | Legacy RESOLVED/CLOSED Tickets got `resolvedAt = updatedAt` | True for every such row older than the migration | server/tests/lab-04/migration-regression.api.test.ts | Pass |
| MIG-03 | Migration | AC-13 | A legacy Ticket (no actions) moves to RESOLVED | 200, not blocked | server/tests/lab-04/migration-regression.api.test.ts | Pass |
| MIG-04 | Migration | §7 | Lab 1–3 data still reachable: a Lab 2 Ticket, its Attachments, comments, notes | Same content before/after | server/tests/lab-04/migration-regression.api.test.ts | Pass |
| MIG-05 | Migration | §7 rollback | Rollback on a restored copy of the dump | Schema equals Lab 3 (`prisma migrate diff` empty), Lab 1–3 row counts unchanged | server/scripts/test-rollback.sh (output kept in this file) | Pass |
| MIG-06 | Migration | §7 seed | Seed run twice | Same row counts after the second run | server/tests/lab-04/migration-regression.api.test.ts | Pass |
| HARD-01 | API | AC-25, BR-28 | Same `Idempotency-Key` twice on POST action | One record; second response identical to the first | server/tests/lab-04/hardening.api.test.ts | Pending |
| HARD-02 | API | AC-25, BR-28 | Same key twice on POST ticket / comment / note | One record each | server/tests/lab-04/hardening.api.test.ts | Pending |
| HARD-03 | API | BR-28 | Same key used by two different users | Two independent records | server/tests/lab-04/hardening.api.test.ts | Pending |
| HARD-04 | API | AC-28, BR-31 | `GET /api/requesters` with no session | No Requester data (404) | server/tests/lab-04/hardening.api.test.ts | Pending |
| HARD-05 | API | BR-30 | A forced database failure on a Lab 4 route | 500 with a generic message, no stack | server/tests/lab-04/hardening.api.test.ts | Pending |

### UI component (`client/tests/lab-04/`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UI-01 | UI component | FR-12 | Staff dashboard renders the 8 cards with API counts | Labels and counts shown | client/tests/lab-04/StaffDashboard.test.tsx | Pass |
| UI-02 | UI component | AC-21 | Staff card link targets | Each link carries the API drill-down query | client/tests/lab-04/StaffDashboard.test.tsx | Pass |
| UI-03 | UI component | AC-20 | Zero metrics and empty lists | "0" shown, "View all" kept, empty messages | client/tests/lab-04/StaffDashboard.test.tsx | Pass |
| UI-04 | UI component | FR-19 | Loading, then API failure | Skeletons, then error panel with "Try again"; no numbers | client/tests/lab-04/StaffDashboard.test.tsx | Pass |
| UI-05 | UI component | AC-23 | Administrator variant | Active/Inactive Users cards present | client/tests/lab-04/StaffDashboard.test.tsx | Pass |
| UI-06 | UI component | FR-11 | Requester dashboard cards, recent and recently resolved lists | Rendered from API data | client/tests/lab-04/RequesterDashboard.test.tsx | Pass |
| UI-07 | UI component | AC-21 | Requester card → My Tickets with the status filter pre-applied and visible | Filter chips shown, request sent with `status` | client/tests/lab-04/RequesterDashboard.test.tsx | Pass |
| UI-08 | UI component | AC-20 | Requester with no Tickets | Zeros, "No tickets yet" + Create Ticket | client/tests/lab-04/RequesterDashboard.test.tsx | Pass |
| UI-09 | UI component | AC-10 | Actions Taken list with several actions | All rendered in API order with status badges | client/tests/lab-04/ActionsTaken.test.tsx | Pass |
| UI-10 | UI component | FR-02, AC-04 | Create form: follow-up note appears and becomes required when ticked | Client-side error without a note; request blocked | client/tests/lab-04/ActionsTaken.test.tsx | Pass |
| UI-11 | UI component | AC-05 | Server rejects an inactive assignee | Error under Assignee, entered values kept | client/tests/lab-04/ActionsTaken.test.tsx | Pass |
| UI-12 | UI component | AC-06 | Start / Complete (result required) / Cancel (dialog) controls per status | Only permitted controls; none on terminal actions | client/tests/lab-04/ActionsTaken.test.tsx | Pass |
| UI-13 | UI component | AC-16 | STALE_UPDATE on save | Warning with "Reload"; typed values kept until reload | client/tests/lab-04/ActionsTaken.test.tsx | Pass |
| UI-14 | UI component | AC-09, AC-29 | Requester Ticket Detail | Read-only Actions Taken, no create/edit controls, no Internal Notes in the DOM | client/tests/lab-04/ActionsTaken.test.tsx | Pass |
| UI-15 | UI component | AC-14 | Resolved Ticket | "Add Action" replaced by the reopen message | client/tests/lab-04/ActionsTaken.test.tsx | Pass |
| UI-16 | UI component | AC-18 | Status select options | Exactly the API's `allowedTransitions` | client/tests/lab-04/TicketWorkflow.test.tsx | Pass |
| UI-17 | UI component | AC-12 | RESOLUTION_BLOCKED response | Inline message; blocking actions highlighted and linked | client/tests/lab-04/TicketWorkflow.test.tsx | Pass |
| UI-18 | UI component | FR-06 | Successful status change | Badge, options, and history refreshed; live-region message | client/tests/lab-04/TicketWorkflow.test.tsx | Pass |
| UI-19 | UI component | AC-15 | Status history timeline | Rows oldest first with who and when | client/tests/lab-04/TicketWorkflow.test.tsx | Pass |
| UI-20 | UI component | FR-15 | Role navigation and landing screen | Dashboard first for every role; Administrator also sees My Queue | client/tests/lab-04/StaffDashboard.test.tsx | Pass |
| UI-21 | UI component | AC-25, FR-17 | Double click on "Save Action" | One request; submit disabled while in flight; `Idempotency-Key` sent | client/tests/lab-04/Hardening.test.tsx | Pending |
| UI-22 | UI component | AC-26, FR-18 | Network failure on Create Ticket, Action form, comment box | Every entered value kept | client/tests/lab-04/Hardening.test.tsx | Pending |

### UI style (`client/tests/lab-04/zen-green.style.test.tsx`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| STYLE-01 | UI style | ui-spec §2 | Metric cards use theme tokens | Surface/border/text from `--zg-*` values | client/tests/lab-04/zen-green.style.test.tsx | Pending |
| STYLE-02 | UI style | ui-spec §3 | Action status badges for the 4 statuses | Distinct classes and text labels | client/tests/lab-04/zen-green.style.test.tsx | Pass |
| STYLE-03 | UI style | ui-spec §3, AC-29 | Actions Taken vs Internal Notes on staff detail | Different background/border and labels | client/tests/lab-04/zen-green.style.test.tsx | Pass |
| STYLE-04 | UI style | ui-spec §3 | Action form editable vs read-only fields | `--zg-field-bg` vs `--zg-readonly-bg` | client/tests/lab-04/zen-green.style.test.tsx | Pass |
| STYLE-05 | UI style | ui-spec §7 | Focus indicator | 3px `--zg-primary` outline on focus | client/tests/lab-04/zen-green.style.test.tsx | Pending |

### Responsive and E2E (`e2e/lab-04/`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| RESP-01 | Responsive | ui-spec §2 | Both dashboards at 375 / 768 / 1280 | Card grid per breakpoint, no horizontal scroll; screenshots | e2e/lab-04/responsive.spec.ts | Pending |
| RESP-02 | Responsive | ui-spec §3 | Actions Taken area at 375 / 768 / 1280 | Cards / reduced table / table, no horizontal scroll; screenshots | e2e/lab-04/responsive.spec.ts | Pending |
| E2E-01 | E2E | AC-01, AC-06, AC-10 | IT Staff adds three actions to one Ticket, assigns, edits, starts, completes, cancels | All visible in order with final statuses | e2e/lab-04/actions-taken-flow.spec.ts | Pending |
| E2E-02 | E2E | AC-05 | Assigning an inactive user from the form | Error under Assignee, nothing saved | e2e/lab-04/actions-taken-flow.spec.ts | Pending |
| E2E-03 | E2E | AC-09, AC-29 | Requester opens the same Ticket | Actions Taken read-only, Internal Note absent | e2e/lab-04/actions-taken-flow.spec.ts | Pending |
| E2E-04 | E2E | AC-12 | Resolving with an open action on screen | Blocked message pointing at the action; status unchanged | e2e/lab-04/ticket-resolution.spec.ts | Pending |
| E2E-05 | E2E | AC-12 | Same Ticket, direct API call from the test's request context | 409 RESOLUTION_BLOCKED | e2e/lab-04/ticket-resolution.spec.ts | Pending |
| E2E-06 | E2E | AC-13, AC-15 | Complete the action, resolve, close | Succeeds; history shows every step | e2e/lab-04/ticket-resolution.spec.ts | Pending |
| E2E-07 | E2E | AC-19, AC-21 | IT Staff dashboard card → Queue | Queue total equals the card count | e2e/lab-04/dashboards.spec.ts | Pending |
| E2E-08 | E2E | AC-02, AC-21 | Requester dashboard card → My Tickets | Filtered list total equals the card count; only own Tickets | e2e/lab-04/dashboards.spec.ts | Pending |
| E2E-09 | E2E | AC-20 | Zero-data seeded users log in | Zero cards; drill-down reaches no-results | e2e/lab-04/dashboards.spec.ts | Pending |
| E2E-10 | E2E | AC-27 | Visual regression walk: authentication, My Tickets, Ticket Detail, Attachments, Public Comments, IT Staff functions, Internal Notes, User Management | Each screen works; screenshots saved | e2e/lab-04/regression.spec.ts | Pending |

## 3. Regression — Labs 1 to 3

### Full suites (run from `main`)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| REG-01 | Regression | AC-27 | All Lab 1–3 server tests | All pass (166 before this sprint) | server/tests/lab-01, lab-02, lab-03 | Pending |
| REG-02 | Regression | AC-27 | All Lab 1–3 client tests | All pass (62 before this sprint) | client/tests/lab-01, lab-02, lab-03 | Pending |
| REG-03 | Regression | AC-27 | All Lab 2–3 Playwright tests | All pass (17 before this sprint) | e2e/lab-02, e2e/lab-03 | Pending |

Baseline recorded on 2026-09-26 from `main` (`a46958b`) before any Lab 4 change:
166/166 server, 62/62 client, 17/17 E2E, `tsc --noEmit` clean in both packages.

### Lab 2–3 tests that change because the specification changed

These tests are **updated, not skipped or deleted**. Each one encoded a Lab 2 or Lab 3
decision that Lab 4 reverses on purpose (specification §11). The update lands in the
same PR as the behavior change, and the test then asserts the new rule.

| Test | File | Old assertion | New assertion | Reason | Issue |
|---|---|---|---|---|---|
| Administrator posts a Public Comment | server/tests/lab-03/comments-notes.api.test.ts (l.93) | 403 | 201 | Revised matrix, AC-17 | 25 (done) |
| Administrator creates an Internal Note | server/tests/lab-03/comments-notes.api.test.ts (l.151) | 403 | 201 | Revised matrix, AC-17 | 25 (done) |
| AUTHZ-11 Administrator claims/reassigns | server/tests/lab-03/staff-ticket-detail.api.test.ts (l.147) | 403 | 200 | Revised matrix, AC-17 | 25 (done) |
| AUTHZ-11 Administrator changes status | server/tests/lab-03/staff-ticket-detail.api.test.ts (l.234) | 403 | 200 | Revised matrix, AC-17 | 25 (done) |
| UI-09 Administrator navigation | client/tests/lab-03/AppShell.test.tsx (l.79) | "Users" only, no "My Queue" | Dashboard, My Queue, Users | Revised matrix, FR-15 | 26 (done) |
| E2E-01 lands on My Tickets after login; E2E-02 "My Tickets" link | e2e/lab-03/authentication.spec.ts (l.46–47, l.55, l.62) | URL `/tickets`; `getByRole("link", { name: "My Tickets" })` anywhere on the page | URL `/dashboard`; the same link looked up inside the main navigation | Dashboard is the landing screen (FR-15). E2E-02 was not on the original list: on the new landing page, the "View My Tickets" quick action also matches the loose name, and Playwright's strict mode rejected two matches — found by running it, not predicted | 27 (done) |
| RESP-01 Ticket Queue across breakpoints | e2e/lab-03/staff-ticket-flow.spec.ts (l.111) | Relies on landing on the queue | Opens the queue explicitly first | Landing is now the Dashboard. Checked before changing it: the mobile step then passes on the wrong screen (the dashboard has no table either) and the tablet step fails — a half-silent failure, not the fully silent one this row first predicted | 26 (done) |
| GET /api/requesters (2 tests) | server/tests/lab-02/requester-context.api.test.ts (l.30–42) | 200 with the Requester list | Replaced by HARD-04: no data returned | Unauthenticated disclosure removed, BR-31 | 28 |
| STAFF-Q-04 status filter | server/tests/lab-03/staff-queue.api.test.ts (l.73) | Seeded RESOLVED Ticket on page 1 of *all* RESOLVED Tickets | Same assertions, scoped with `search=TKT-9999` like its siblings STAFF-Q-05/06 | Test isolation, not a spec change: 84 RESOLVED Tickets had become newer than the seeded one (43 from Lab 4 workflow fixtures, 41 from other runs) | 25 (done) |
| STAFF-Q-07 ownerId filter | server/tests/lab-03/staff-queue.api.test.ts (l.106) | Seeded Margaret-owned Tickets on page 1 of *all* her Tickets | Same assertions, scoped with `search=TKT-9999` | Test isolation: 51 of the 54 newer Margaret-owned Tickets came from Lab 3's own claim tests, so it was failing on its own | 25 (done) |
| UI-14 Claim call arguments; staff detail fixtures | client/tests/lab-03/StaffTicketDetail.test.tsx (l.18, l.63–71, l.92), client/tests/lab-03/zen-green.style.test.tsx (l.52) | `setTicketOwner(1, userId)`; fixture without Lab 4 fields | `setTicketOwner(1, userId, 1)`; fixtures carry `version`, `resolvedAt`, `allowedTransitions` matching their status | Contract change: the UI always sends the version it read (BR-21) and renders the API's `allowedTransitions` | 25 (done) |

## 4. Acceptance Criteria traceability

| AC | Tests |
|---|---|
| AC-01 | API-03, E2E-01 |
| AC-02 | DASH-R-02, E2E-08 |
| AC-03 | API-04 |
| AC-04 | API-05, UI-10 |
| AC-05 | API-07, API-08, UI-11, E2E-02 |
| AC-06 | API-11, API-12, API-13, API-14, UI-12, E2E-01 |
| AC-07 | API-15 |
| AC-08 | AUTHZ-01, AUTHZ-02 |
| AC-09 | AUTHZ-03, AUTHZ-04, UI-14, E2E-03 |
| AC-10 | API-01, API-02, UI-09, E2E-01 |
| AC-11 | AUTHZ-05 |
| AC-12 | WF-03, WF-04, UI-17, E2E-04, E2E-05 |
| AC-13 | WF-05, WF-06, MIG-03, E2E-06 |
| AC-14 | API-16, UI-15 |
| AC-15 | WF-09, WF-10, UI-19, E2E-06 |
| AC-16 | API-17, WF-11, WF-12, UI-13 |
| AC-17 | AUTHZ-07, AUTHZ-08, AUTHZ-09, AUTHZ-10 |
| AC-18 | WF-13, UI-16 |
| AC-19 | DASH-R-01, DASH-R-03, DASH-R-04, DASH-S-01..04, E2E-07 |
| AC-20 | DASH-R-05, DASH-S-05, UI-03, UI-08, E2E-09 |
| AC-21 | DASH-R-06, DASH-S-06, UI-02, UI-07, E2E-07, E2E-08 |
| AC-22 | DASH-S-09 |
| AC-23 | DASH-S-07, UI-05 |
| AC-24 | PERF-01, PERF-02, PERF-03 |
| AC-25 | HARD-01, HARD-02, UI-21 |
| AC-26 | UI-22 |
| AC-27 | REG-01, REG-02, REG-03, E2E-10 |
| AC-28 | HARD-04 |
| AC-29 | UI-14, STYLE-03, E2E-03 |

## 5. Final Results

Filled in as each Issue lands, from real runs only.

### Issue 23 — Actions Taken foundation

**TDD.** The 42 Lab 4 tests below were written first and run before any
implementation. They failed for the expected reasons: routes answering `404`,
`src/actionStatus.ts` missing, `prisma.actionTaken` undefined, the
`lab4_actions_taken` migration not applied. Two passed trivially at that point
because they expect a `404` (AUTHZ-04, API-19); they become meaningful once the
routes exist.

**Migration.** Database dumped first
(`db-backups/pre-actions-taken-migration-20260926-031538.dump`, gitignored). The
SQL was generated with `prisma migrate diff` against the live database — purely
additive, which also confirmed there was no drift from the Lab 3 migrations —
plus the `resolvedAt` backfill, then applied with `prisma migrate deploy` (never
`migrate dev`/`reset`). Row counts on the working database before and after:
User 845, Ticket 2446, Attachment 1357, PublicComment 59, InternalNote 61 — identical.
Backfill checks: 0 Tickets with `version ≠ 1`, 0 RESOLVED/CLOSED Tickets with
`resolvedAt ≠ updatedAt`, 0 other Tickets with a `resolvedAt`.

**MIG-05 rollback**, run on two scratch copies restored from that dump before the
migration touched the working database (`server/scripts/test-rollback.sh`):

```
Lab 1-3 row counts before migration (User|Ticket|Attachment|PublicComment|InternalNote|Category|RelatedSystem): 845|2415|1357|59|61|4|7
Applying migration `20260925201854_lab4_actions_taken`
BEGIN / DROP TABLE ×3 / DROP TYPE / ALTER TABLE ×2 / DELETE 1 / COMMIT
-- This is an empty migration.
Lab 1-3 row counts after rollback: 845|2415|1357|59|61|4|7
RESULT: PASS — schema identical to Lab 3, row counts unchanged, migration record removed
```

**Seed.** Run twice: `Seeded Actions Taken: 14 new` then `0 new, 14 already
present`. Seeded actions cover all four statuses (PLANNED 3, IN_PROGRESS 2,
COMPLETED 7, CANCELLED 2); Tickets with zero (#1, #8, #9), one (#2, #4, #6, #10,
#12), and several (#3, #5, #7) actions; a PLANNED action on the OPEN Ticket #2 for
the live resolution-gate demo; zero-data accounts `zoe.empty@example.com` and
`zed.empty@toktickit.com`.

**A real regression found and fixed during this Issue.** The first full run
failed Lab 3's STAFF-Q-07 (`ownerId=<Margaret>` must list the seeded Tickets #2
and #3 on page 1). Cause: the new Lab 4 fixtures defaulted every fixture Ticket's
owner to Margaret, adding ~45 newer Margaret-owned Tickets per run and pushing the
seeded ones off page 1. The Lab 3 test was not touched: Lab 4 fixtures are now
unassigned by default, and the 97 fixture Tickets already created by those runs
were unassigned. A second defect of the same kind was removed: API-16 first
forced a Ticket to RESOLVED directly in the database, creating a
"resolved with an open action" row the API makes impossible; it now reaches a
non-active Ticket through the real status route (cancellation).

**Results** (full suites, this branch):
- Server: **208/208** (Lab 1–3: 166, Lab 4: 42), run twice in a row, both green;
  `tsc --noEmit` clean.
- Client: 62/62; `tsc --noEmit` clean.
- Playwright (Lab 2–3): 17/17.
- Manual check on the running dev server: Margaret lists Ticket #3's four seeded
  actions in order with performer and assignee names; its owner Grace gets `200`
  on the list and `403` on create; Ada (not the owner) gets `404` on the list and
  `403` on create.

**Covered:** FR-01–FR-05, BR-01–BR-12, BR-19, BR-20; AC-01, AC-03–AC-11,
AC-14 (create/update side). Tests: UNIT-01, API-01–API-20, AUTHZ-01–AUTHZ-06,
MIG-01, MIG-02, MIG-04, MIG-05, MIG-06.


### Issue 24 — Actions Taken UI

**TDD.** `ActionsTaken.test.tsx` (UI-09–UI-15) and the Actions Taken rows of
`zen-green.style.test.tsx` (STYLE-02–STYLE-04) were written first and failed
because `src/components/ActionsTaken.tsx` did not exist.

**Design choice.** One DOM structure for the list: a table that CSS folds into
stacked cards below 768px (`.actions-table` in `theme.css`), instead of Lab 3's
separate table and card renders — one list to keep in sync, and no duplicated
text for the tests to work around.

**Visual check** (temporary Playwright script logging in through the test helpers,
screenshots read back, then deleted): TKT-9999-000003 on the staff detail at 1280,
820, and 375px, horizontal overflow 0 at all three. Two real defects found and
fixed from the screenshots: on desktop the "by <performer>" line meant for tablet
also showed next to the Performed by column (Bootstrap's `d-block` is
`!important` and overrode the hiding rule), and the "In Progress" badge wrapped
onto two lines.

**Real end-to-end flow** against the running API, on a throwaway Ticket: the
follow-up note error kept the typed description; save; Start; Complete with a
result; a second action cancelled through the accessible dialog; and a real stale
conflict between two staff sessions (Margaret saves first, Katherine's save shows
"Someone else changed this action…", keeps her typed text, and Reload brings the
saved version). Final API state: both actions at version 3 with the right
performer and assignee. Console errors after reload: 0.

**Results:**
- Client: **76/76** (Lab 1–3: 62, Lab 4: 14); `tsc --noEmit` clean. The only stderr
  output is the two pre-existing `act()` warnings from Lab 2's AppShell test, same
  as the baseline.
- Server: unchanged by this Issue (208/208 at Issue 23).
- Playwright (Lab 2–3): 17/17.

**Covered:** FR-01–FR-05 (UI), AC-04, AC-05, AC-06, AC-09, AC-10, AC-14, AC-16,
AC-29 (Requester view). Tests: UI-09–UI-15, STYLE-02–STYLE-04.

### Issue 25 — Ticket workflow and resolution gate

**TDD.** `ticket-workflow.api.test.ts` (WF-01–WF-14, AUTHZ-07–AUTHZ-11), UNIT-02,
MIG-03, and `TicketWorkflow.test.tsx` (UI-16–UI-19) were written first. The new
behavior failed for the expected reasons (Administrator `403`, no gate, no
history route, no `version`). WF-01, WF-02, WF-06, WF-14, AUTHZ-11, and MIG-03
passed from the start: they pin behavior that must not change (the matrix
itself, Requester rejection, Tickets without actions not blocked).

**Implementation notes.** The status change runs in one transaction with the
Ticket row locked (`SELECT … FOR UPDATE`), in this order: version, matrix, gate,
update with `resolvedAt`, history row. Action Taken writes take the same lock,
which WF-07 exercises: eight real concurrent "resolve" + "create action" pairs,
each ending with exactly one winner and never a RESOLVED Ticket with an open
action.

**Lab 2–3 tests changed**, all listed in §3: the four planned Administrator
rows; two Lab 3 queue tests whose own fixtures had grown past their page-1
assumption (counts measured before changing anything); the staff detail
fixtures and one argument assertion that follow the new contract.

**A real defect caught by the Lab 3 E2E regression.** E2E-04 changes IT
Priority and then status without waiting. The status request went out with the
version read before the priority response arrived, so the server answered
`STALE_UPDATE` and the user conflicted with their own change. Fixed on the
client: workflow writes are serialized, and each write uses the version returned
by the previous response. Conflicts between two different users are still
detected (WF-11, WF-12).

**Manual check in the running app** (temporary Playwright script, then deleted):
- Seed Ticket #2 (one PLANNED action). The screen shows "This ticket still has
  open actions…", links the action, and highlights its row. A direct
  `PATCH /status` returns `409 {"code":"RESOLUTION_BLOCKED","blockingActionIds":[31]}`.
  The Ticket is still OPEN, version 1, after both attempts.
- A throwaway Ticket: blocked, then the action is completed from the linked row,
  and the message goes away. Resolved: "Status changed to Resolved" is announced
  and "Add Action" is replaced by the reopen message. The history shows three
  steps, and the owning Requester sees the same three with no Internal Note.

**Results:**
- Server: **231/231** (Lab 1–3: 166, Lab 4: 65), run twice.
- Client: **81/81**; `tsc --noEmit` clean in both packages.
- Playwright (Lab 2–3): 17/17 on 6 of 7 full runs after the fix. On one run,
  Lab 3's E2E-02 (logout, then back-navigation, then expects Sign In within 5 s)
  failed at the back-navigation step. It did not reproduce in 12 isolated
  repeats nor in 4 more full runs, and it exercises no code this Issue touched.
  It is recorded here as intermittent, not hidden, to investigate in Issue 28.

**Covered:** FR-06–FR-10, BR-13–BR-18, BR-21; AC-12, AC-13, AC-15, AC-16
(Ticket side), AC-17, AC-18. Tests: UNIT-02, MIG-03, WF-01–WF-14,
AUTHZ-07–AUTHZ-11, UI-16–UI-19.

### Issue 26 — IT Staff dashboard

**TDD.** `staff-dashboard.api.test.ts` (DASH-S-01–DASH-S-10), UNIT-03,
`dashboard-performance.smoke.test.ts` (PERF-01, PERF-03) and
`StaffDashboard.test.tsx` (UI-01–UI-05, UI-20, plus the queue drill-down test)
were written first and failed on the missing route, parser, and screen. PERF-03
passed trivially at that point (a missing route issues zero queries); it became
meaningful once the route existed.

**Implementation notes.** `GET /api/dashboard/staff` runs one `groupBy` for the
four status cards, `count`s for the others, and two bounded top-N lists, all in
one `Promise.all`: 9 SQL statements whatever the volume. The queue now accepts a
comma-separated `status`, reads and writes its filters in the URL (so a card
lands on exactly its own list), and gets the **Owner filter that Lab 3's
ui-spec §4 promised but the Lab 3 screen never had** — needed for the
Unassigned and My Assigned drill-downs.

**PERF-03 refined while implementing.** The first version asserted that a busy
user and the zero-data user issue the same number of statements: 9 vs 8. The
difference is Prisma loading a relation with one batched `WHERE id IN (…)`
statement that it skips when there are no rows — a constant +1, not a per-row
pattern. The test now compares two users who both have open actions in
different numbers (2 and 9 at the time of the run: 9 statements each), keeps the
zero-data user as a lower bound, and caps the count at 12.

**Real-app check** (temporary Playwright script, then deleted):
- Margaret's eight cards compared with direct SQL at the same moment: New 2693,
  Open 111, In Progress 357, Waiting 26, Unassigned 3231, My Assigned 70, High
  Priority 221, My Open Actions 2 — all identical.
- The Unassigned card opens the queue with "Active (not closed or cancelled)"
  and "Unassigned" preselected; queue total 3231 = the card's count.
- The Administrator lands on the dashboard with the Active/Inactive Users
  cards.
- No horizontal overflow at 1280, 820, or 375px; 0 console errors.
- One defect fixed from the mobile screenshot: action status badges stretched
  across the whole list row.

**Results:**
- Server: **245/245**. PERF-01 median 5.0 ms on 3,322 Tickets / 2,000 Actions
  Taken (threshold 300 ms).
- Client: **89/89**; `tsc` clean.
- Playwright (Lab 2–3): 17/17 after the planned RESP-01 update.

**Covered:** FR-12, FR-13, FR-14 (staff side), FR-15 (staff roles), BR-22,
BR-24–BR-27; AC-19–AC-24 (staff side). Tests: UNIT-03, DASH-S-01–DASH-S-10,
PERF-01, PERF-03, UI-01–UI-05, UI-20.

### Issue 27 — Requester dashboard

**TDD.** `requester-dashboard.api.test.ts` (DASH-R-01–DASH-R-08), PERF-02 and
`RequesterDashboard.test.tsx` (UI-06–UI-08, the Requester part of UI-20, the My
Tickets drill-down) were written first and failed on the missing route, filter,
and screen.

**Implementation notes.** `GET /api/dashboard/requester` is one `groupBy` scoped to
`requesterId = session user` plus two bounded lists — the client never names the
Requester. `GET /api/tickets` accepts the same comma-separated `status`, always on
top of the session-owned scope. My Tickets reads its status filter from the URL and
shows it as removable chips with "Clear filters". Requesters now land on the
Dashboard, with Dashboard first in their navigation.

**Lab 3 E2E updates** (listed in §3): E2E-01 now expects `/dashboard`. E2E-02 was
**not** on the planned list: running it showed that the new landing page's "View
My Tickets" quick action also matches its loose `name: "My Tickets"` lookup, so
Playwright's strict mode refused two matches. Both lookups are now scoped to the
main navigation, which is what they meant.

**An environment incident, not a code defect.** The first E2E run of this Issue
failed 15 tests in about 0.2 s each: both dev servers had been stopped by the app
during an 11-hour pause between sessions. Restarted, then run for real.

**Real-app check** (temporary Playwright script, then deleted):
- Ada's four cards against direct SQL: My Open 2137, Waiting for Me 29, Resolved
  124, Closed 26 — identical.
- The ten listed Tickets all belong to Ada (checked in SQL).
- "My Open Tickets" opens My Tickets with the four status chips and "(2137
  tickets)", the card's own count.
- Zoe (no Tickets) sees four zeros, and "Closed: 0" leads to the no-results state.
- No overflow at 1280, 820, or 375px; 0 console errors.

Noted for Issue 28: My Tickets (Lab 2) shows status badges in capitals ("NEW")
where every other screen writes "New". Noted for Issue 29: Ada's data is dominated
by test fixtures, so demonstration screenshots need a clean account.

**Results:**
- Server: **254/254**. PERF-02 median 2.8 ms.
- Client: **94/94**; `tsc` clean.
- Playwright (Lab 2–3): 17/17 on three consecutive runs.

**Covered:** FR-11, FR-14 (Requester side), FR-15 (Requester), BR-23; AC-02,
AC-19–AC-21 and AC-24 (Requester side). Tests: DASH-R-01–DASH-R-08, PERF-02,
UI-06–UI-08, UI-20 (Requester part).