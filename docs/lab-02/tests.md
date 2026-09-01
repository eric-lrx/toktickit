# Lab 2 Test Plan and Results

This plan is written and approved before implementation (Test DD). It will be updated
with real, run results as each Issue lands — never reconstructed afterward from
whatever the coding agent happened to produce.

## 1. Test Strategy

Six required levels: unit, API, UI component, UI style, responsive, and E2E.

- **Unit** and **API** run under Vitest/Supertest against a real local PostgreSQL
  (same approach as Lab 1), colocated under `server/tests/lab-02/`.
- **UI component** tests run under Vitest + Testing Library, `client/tests/lab-02/`.
- **UI style** is split into its own file (`zen-green.style.test.tsx`) rather than
  folded into the four required component files, so behavioral and presentational
  assertions don't get tangled — documented here as a deliberate addition beyond the
  handout's minimum file list.
- **Responsive** and **E2E** run under Playwright, introduced in Issue 12
  (`feature/12-e2e-and-visual`); an extra `responsive.spec.ts` is added alongside the
  required `requester-ticket-flow.spec.ts` for the same reason as UI style above.
- Reference data and the Development Requester Selector (Issue 6) have no dedicated
  file in the handout's minimum structure either. Added: `server/tests/lab-02/
  requester-context.api.test.ts` and `client/tests/lab-02/RequesterSelector.test.tsx`.
- The application shell and reusable components (Issue 7) are likewise untested by
  the minimum file list. Added: `client/tests/lab-02/AppShell.test.tsx`; the shared
  `Badge`/`FormField` components are covered inside `zen-green.style.test.tsx`.
- Every Acceptance Criterion in `specification.md` maps to at least one row below.

## 2. Planned Tests

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-04 | Ticket number generator format | Matches `TKT-YYYY-NNNNNN` | `server/tests/lab-02/ticket-number.unit.test.ts` | Pending |
| UNIT-02 | Unit | BR-04 | Retry after simulated unique-constraint collision | Second attempt succeeds with a different number | `server/tests/lab-02/ticket-number.unit.test.ts` | Pending |
| API-01 | API | AC-01 | `POST /api/tickets` valid payload | 201; Ticket saved; ticketNumber returned | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-02 | API | AC-04, BR-12 | `POST /api/tickets` missing Summary | 400 naming `summary` | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-03 | API | BR-07 | `POST /api/tickets` missing `X-Dev-Requester-Id` | 400 | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-04 | API | AC-20, BR-21 | `POST /api/tickets` with inactive requester id | 400 | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-05 | API | AC-16, BR-15 | `POST /api/tickets` with a `.exe` attachment | 415 | `server/tests/lab-02/create-ticket.api.test.ts` | Deferred to Issue 11 |
| API-06 | API | AC-17, BR-15 | `POST /api/tickets` with a 6 MB file | 413 | `server/tests/lab-02/create-ticket.api.test.ts` | Deferred to Issue 11 |
| API-07 | API | BR-20 | Ticket write succeeds, forced attachment write failure | No Ticket row persisted; no temp file left on disk | `server/tests/lab-02/create-ticket.api.test.ts` | Deferred to Issue 11 |
| API-08 | API | AC-08 | `GET /api/tickets?search=<ticketNumber>` | Only the matching Ticket returned | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-09 | API | AC-09 | Combined `categoryId`+`relatedSystemId`+`requestedPriority` filters | Only Tickets matching all filters returned | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-10 | API | AC-10 | `sort=ticketNumber&order=asc` | Correctly ordered; stable `id desc` secondary sort | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-11 | API | AC-11 | `page=2&pageSize=10` with 15 rows | Second page has 5 rows; `meta.totalPages` = 2 | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-12 | API | AC-12 | `sort=nope` | 400 naming `sort` | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-13 | API | AC-18, BR-11 | List as Requester A, then as Requester B | Disjoint result sets | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-14 | API | AC-06 | List for a Requester with zero Tickets | `200`, `data: []`, `total: 0` | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-15 | API | AC-03 | `GET /api/tickets/:id` owned by another Requester | 404 | `server/tests/lab-02/ticket-detail.api.test.ts` | Pending |
| API-16 | API | FR-10 | `GET /api/tickets/:id` owned | 200 with nested `attachments` | `server/tests/lab-02/ticket-detail.api.test.ts` | Pending |
| API-17 | API | AC-13, BR-15 | Upload a 6th attachment when 5 active exist | 409 | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-18 | API | AC-14, BR-16 | Upload when 4 active + 1 soft-removed exist | 201 (removed one excluded from quota) | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-19 | API | AC-15, BR-19 | Download after soft-removal | 404 | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-20 | API | BR-18 | `DELETE` attachment without `reason` | 400 | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-21 | API | BR-10 | Download/soft-remove an attachment owned by another Requester | 404 | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-22 | API | BR-21 | `GET /api/requesters` | Seeded inactive Requester is excluded from the list | `server/tests/lab-02/requester-context.api.test.ts` | Pass |
| API-23 | API | FR-01 | `GET /api/categories` | Returns only active categories | `server/tests/lab-02/requester-context.api.test.ts` | Pass |
| API-24 | API | FR-01 | `GET /api/related-systems` | Returns the ≥6 seeded active related systems | `server/tests/lab-02/requester-context.api.test.ts` | Pass |
| UI-11 | UI | ui-spec §4.1 | Requester Selector loading state | Loading indicator shown while `/api/requesters` is pending | `client/tests/lab-02/RequesterSelector.test.tsx` | Pass |
| UI-12 | UI | ui-spec §4.1 | Requester Selector empty state | Empty message shown when no active Requester exists | `client/tests/lab-02/RequesterSelector.test.tsx` | Pass |
| UI-13 | UI | ui-spec §4.1 | Requester Selector failure state | Safe error/retry shown on fetch failure | `client/tests/lab-02/RequesterSelector.test.tsx` | Pass |
| UI-14 | UI | FR-01 | Continue button and selection | Disabled with no selection; selecting a Requester persists it and enables Continue | `client/tests/lab-02/RequesterSelector.test.tsx` | Pass |
| UI-16 | UI | ui-spec §4.2 | Shell identity and nav | Renders TokTickIT identity, My Tickets and Create Ticket nav links | `client/tests/lab-02/AppShell.test.tsx` | Pass |
| UI-17 | UI | ui-spec §4.2 | Active nav indication | Current route's nav link has `aria-current="page"` | `client/tests/lab-02/AppShell.test.tsx` | Pass |
| UI-18 | UI | ui-spec §4.2 | Requester identity and Change Requester | Selected Requester's name shown; Change Requester clears context and returns to the Selector | `client/tests/lab-02/AppShell.test.tsx` | Pass |
| UI-19 | UI | ui-spec §6 | Mobile nav toggle | Nav links hidden behind a toggle below 768px, reachable via the toggle button | `client/tests/lab-02/AppShell.test.tsx` | Pass |
| STYLE-04 | UI Style | ui-spec §5 | Badge tone classes | `Badge` renders the CSS class matching its `tone` prop | `client/tests/lab-02/zen-green.style.test.tsx` | Pass |
| STYLE-05 | UI Style | ui-spec §3 | FormField required marker and error placement | Asterisk shown for required fields; error message renders immediately under the control | `client/tests/lab-02/zen-green.style.test.tsx` | Pass |
| UI-01 | UI | AC-04 | Submit with empty Summary | Inline field error; no `fetch` call made | `client/tests/lab-02/CreateTicket.test.tsx` | Pending |
| UI-02 | UI | BR-13 | Submit button while request is pending | Busy + `disabled` | `client/tests/lab-02/CreateTicket.test.tsx` | Pending |
| UI-03 | UI | AC-01 | Successful submit | Ticket Number from the mocked response is rendered | `client/tests/lab-02/CreateTicket.test.tsx` | Pending |
| UI-04 | UI | AC-05 | Submit with a mocked network failure | Error shown; all field values still present | `client/tests/lab-02/CreateTicket.test.tsx` | Pending |
| UI-05 | UI | AC-16 | Select a disallowed file type | Per-file inline error; file not added to the upload list | `client/tests/lab-02/AttachmentSection.test.tsx` | Pending |
| UI-06 | UI | AC-06, AC-07 | Empty vs. no-results states | Correct, distinct message rendered per case | `client/tests/lab-02/MyTickets.test.tsx` | Pending |
| UI-07 | UI | AC-18 | Requester switch | Previous Requester's rows are removed from the DOM before new ones render | `client/tests/lab-02/MyTickets.test.tsx` | Pending |
| UI-10 | UI | AC-02 | Render My Tickets with no Requester in context | Selection screen is shown instead of the list | `client/tests/lab-02/MyTickets.test.tsx` | Pending |
| UI-08 | UI | FR-10 | Ticket Detail read-only rendering | No editable inputs present in the ticket-info block | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Pending |
| UI-09 | UI | BR-19 | Removed attachment row | Download control absent/disabled | `client/tests/lab-02/AttachmentSection.test.tsx` | Pending |
| STYLE-01 | UI Style | ui-spec §3 | Required-field asterisk | Asterisk element present on every required field | `client/tests/lab-02/zen-green.style.test.tsx` | Pending |
| STYLE-02 | UI Style | ui-spec §3 | Disabled/busy submit button | Correct class/attribute while submitting | `client/tests/lab-02/zen-green.style.test.tsx` | Pending |
| STYLE-03 | UI Style | ui-spec §5 | Priority/status badge classes | Badge class matches the documented token mapping | `client/tests/lab-02/zen-green.style.test.tsx` | Pending |
| RESP-01 | Responsive | ui-spec §6 | My Tickets at desktop width | Table layout renders | `e2e/lab-02/responsive.spec.ts` | Pending |
| RESP-02 | Responsive | AC-19, ui-spec §6 | My Tickets at mobile width | Card layout; `scrollWidth <= clientWidth` (no horizontal scroll) | `e2e/lab-02/responsive.spec.ts` | Pending |
| RESP-03 | Responsive | ui-spec §6 | Create Ticket at tablet width | Two-column classification group | `e2e/lab-02/responsive.spec.ts` | Pending |
| E2E-01 | E2E | AC-01 | Full create-ticket flow with one attachment | Confirmation shows the official Ticket Number; Ticket later found in My Tickets | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pending |
| E2E-02 | E2E | AC-18 | Switch Requester mid-session | Requester A's Ticket is not visible after switching to Requester B | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pending |
| E2E-03 | E2E | AC-15 | Add, download, then soft-remove an attachment | Download is blocked after removal; metadata still shown | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pending |

## 3. Acceptance-Criterion Traceability

| AC | Covered by |
|---|---|
| AC-01 | API-01, UI-03, E2E-01 |
| AC-02 | UI-10 |
| AC-03 | API-15 |
| AC-04 | API-02, UI-01 |
| AC-05 | UI-04 |
| AC-06 | API-14, UI-06 |
| AC-07 | UI-06 |
| AC-08 | API-08 |
| AC-09 | API-09 |
| AC-10 | API-10 |
| AC-11 | API-11 |
| AC-12 | API-12 |
| AC-13 | API-17 |
| AC-14 | API-18 |
| AC-15 | API-19, E2E-03 |
| AC-16 | API-05, UI-05 |
| AC-17 | API-06 |
| AC-18 | API-13, UI-07, E2E-02 |
| AC-19 | RESP-02 |
| AC-20 | API-04 |

## 4. Responsive and Visual Checklist

Tracked in `ui-spec.md` §8; results copied here once Issue 12 runs the visual pass.
Not yet executed — no implementation exists.

## 5. Test Commands

```bash
cd server && npm test
cd client && npm test
npx playwright test          # from e2e/, added in Issue 12
```

## 6. Final Results

Populated incrementally as each Issue's PR lands, and finalized in Issue 12
(`feature/12-e2e-and-visual`) with full `main`-branch output.

### Issue 6 — Reference data and Development Requester context

```
server: tests/lab-01/health.test.ts (1), tests/lab-01/categories.test.ts (1),
        tests/lab-02/requester-context.api.test.ts (3) — 5 passed (5)
client: tests/lab-01/App.test.tsx (3), tests/lab-02/RequesterSelector.test.tsx (4)
        — 7 passed (7)
```

Manually verified: migration `20260901063527_lab2_requester_context` applied
cleanly; seed replayed twice, row counts unchanged (4 categories, 7 related
systems, 5 requesters — 4 active + 1 inactive); dev server and client start and
serve real data end to end (Selector → Continue → Change Requester cycle checked
in the running app, not just in tests).

### Issue 7 — Application shell and Zen Green foundation

```
client: tests/lab-01/App.test.tsx (3), tests/lab-02/RequesterSelector.test.tsx (4),
        tests/lab-02/AppShell.test.tsx (4), tests/lab-02/zen-green.style.test.tsx (5)
        — 16 passed (16)
server: unchanged — 5 passed (5)
```

Manually verified in the running app, not just under jsdom: real-viewport resize
(desktop 1400px → mobile 390px → back to desktop) caught and fixed a genuine bug
— the mobile nav's open state leaked `flex-column`/`align-items-start` into the
desktop layout when `mobileOpen` stayed `true` across a resize, since those
classes had no `-md-` reset variant. Fixed with `flex-md-row
align-items-md-center mt-md-0`; re-verified the exact repro (open mobile menu at
390px, then resize to 1400px without reloading) no longer overlaps or wraps.

## 7. Known Limitations or Deferred Tests

- Responsive (`RESP-*`) and E2E (`E2E-*`) rows cannot execute until Playwright is
  installed in Issue 12; until then they are planned, not run.
- Current Status transitions, IT Priority, and Ticket Owner are out of scope (see
  `specification.md` §3 and §11) and therefore have no tests in this plan.
- API-05/06/07 (attachment type/size validation and the compensation strategy on
  Ticket creation) require the `Attachment` model and upload plumbing, which is
  Issue 11's scope, not Issue 8's (the Issue table separates "Create Ticket" from
  "Attachment lifecycle" and does not list attachments under Issue 8). Issue 8
  implements Ticket creation with its non-file fields only; these three rows run
  once Issue 11 lands.
