# Lab 4 UI Specification — Zen Green Theme (extends Labs 2 and 3)

This document **extends** `docs/lab-02/ui-spec.md` and `docs/lab-03/ui-spec.md`. Every
token, spacing rule, component, badge, button hierarchy, responsive rule, and
accessibility rule from those documents stays in force. Only what is new or changed
for Lab 4 is specified here. Lab 4 screens reuse the existing components (`Badge`,
`FormField`, cards, tables, loading/empty/error states) — no second visual system.

Tokens referenced below come from `client/src/theme.css`: `--zg-primary` #006b3c,
`--zg-secondary` #0b7a46, `--zg-pale` #eaf6ef, `--zg-surface` #ffffff,
`--zg-surface-border` #dde5e1, `--zg-field-bg` #ffffff, `--zg-readonly-bg` #f1efe6,
`--zg-warning-bg` #fcefd1, `--zg-warning-text` #8f5b00 (darkened in Lab 4 from #a66a00, see §9), `--zg-error` #8a1f1f,
`--zg-success` #0b7a46, `--zg-text` #1e2b25, `--zg-bg` #f5f7f6.

## 1. Application shell (changed)

- The product name is **TokTickIT** everywhere (never "TikTockIT").
- Navigation per role, with the active page indicated by both the underline and
  `aria-current="page"`:
  - **Requester:** Dashboard, My Tickets, Create Ticket.
  - **IT Staff:** Dashboard, My Queue (label kept from Lab 3).
  - **Administrator:** Dashboard, My Queue, Users (My Queue is new for the
    Administrator, following the revised authorization matrix).
- After login (and after the mandatory password change) every role lands on Dashboard
  (the "operational starting point" of handout §8.1). Lab 3 tests that relied on the
  old landing page are listed in `tests.md` §3.

## 2. Dashboards (new)

Shared layout, matching the handout mockups:
- Heading "Welcome back, <first name>" and a one-line subtitle; a secondary "Refresh"
  button at the top right that re-fetches the dashboard (disabled with "Refreshing…"
  while in flight).
- A row of **metric cards**: label (small, `--zg-text` at reduced emphasis), count
  (large, bold), and a "View all" link. The whole card is one link with an accessible
  name "<label>: <count>, view all". Counts are numbers, never colors alone.
- Below: a **list panel** on the left (two-thirds width on desktop) and a **Quick
  Actions** panel on the right (one-third).
- Cards grid: 5 per row on desktop (≥ 992px), 3 per row on tablet (768–991px), 2 per
  row on mobile (< 768px); panels stack below the cards on tablet and mobile.
- No "+N from yesterday" deltas (specification §11).

### 2.1 Requester Dashboard
- Cards: My Open Tickets, Waiting for Me, Resolved, Closed. "Waiting for Me" uses the
  `--zg-warning-bg` / `--zg-warning-text` pair when its count is above zero, with the
  label text as the primary signal.
- "My Recent Tickets" list (5): Ticket Number (link), Summary, Status badge, last
  updated date. "View all" opens My Tickets.
- "Recently Resolved" list (5): Ticket Number, Summary, resolved date.
- Quick Actions: "Create Ticket" (primary style), "View My Tickets".
- Drill-down: a card opens My Tickets with its status filter applied and visible (§5).
- Screenshot path: `artifacts/lab-04/screenshots/requester-dashboard/`.

### 2.2 IT Staff Dashboard
- Cards: New, Open, In Progress, Waiting for Requester, Unassigned, My Assigned, High
  Priority, My Open Actions.
- "My Open Actions" list (id `my-open-actions`, the target of its card): up to 10
  actions, oldest first — Ticket Number (link to Ticket Detail), description
  (truncated with a `title`), Action status badge, action date; a "Showing 10 of N"
  line when the total is larger.
- "Recent Tickets" list (10): Ticket Number, Summary, Status and IT Priority badges,
  Owner or "Unassigned", last updated.
- Quick Actions: "Open Queue", "Unassigned Tickets", "My Assigned Tickets".
- Screenshot path: `artifacts/lab-04/screenshots/staff-dashboard/`.

### 2.3 Administrator Dashboard
The IT Staff dashboard plus two cards, Active Users and Inactive Users, linking to User
Management, and a "Manage Users" quick action.

### 2.4 Dashboard states
- **Loading:** card skeletons with the labels already visible, list skeleton rows.
- **Empty metric:** the card shows `0` and keeps "View all" (it leads to the list's
  no-results state). An empty list shows a one-line message with its action (e.g. "No
  tickets yet" + "Create Ticket").
- **Forbidden:** a role reaching another role's dashboard route is redirected to its
  own dashboard (same rule as Lab 3 routes).
- **Failure:** one inline error panel "Dashboard data could not be loaded." with a
  "Try again" button; no partial or invented numbers are shown.

## 3. Actions Taken on the staff Ticket Detail (new)

- A dedicated **Actions Taken** section placed between the Ticket summary/workflow
  block and the Public Comments / Internal Notes panels, with its own heading and a
  count ("Actions Taken (3)").
- **Visual distinction from Internal Notes** (required): Actions Taken use a
  `--zg-surface` card with a 4px `--zg-primary` left border and a checklist icon;
  Internal Notes keep their `--zg-readonly-bg` background and the persistent
  "Internal — not visible to Requester" label. Actions Taken carry a small label
  "Visible to the Requester" so staff know the difference in audience.
- **List**, desktop (≥ 992px): a table — Date/Time, Description, Performed by,
  Assignee (name, or "Unassigned", with an "Inactive" badge when applicable), Status
  badge, Follow-up (icon + "Yes"/"No"), actions menu. Tablet: Performed by is folded
  under Description. Mobile: one card per action (status badge and date on the top
  line, description, then assignee and follow-up).
- **Action status badges:** Planned (`--zg-pale` / `--zg-secondary`), In Progress
  (`--zg-warning-bg` / `--zg-warning-text`), Completed (pale green / `--zg-success`
  with a check icon), Cancelled (muted gray, struck-through label is not used — the
  word "Cancelled" is enough). Text always carries the meaning.
- **Create mode:** an "Add Action" primary button opens an inline form above the list:
  Action Date/Time (datetime-local, defaults to now), Description (textarea, required),
  Result (textarea), Assignee (select of active IT Staff/Administrators +
  "Unassigned"), Status (Planned / In Progress / Completed), Follow-up required
  (checkbox), Follow-up note (textarea, shown and marked required only when the
  checkbox is ticked), Attachment notes (text input, helper text "Which Ticket file to
  look at, e.g. screenshot-2.png"). Buttons: "Save Action" (primary, busy label
  "Saving…", disabled while in flight) and "Cancel" (secondary).
- **View/edit mode:** selecting an action opens it in the same form component, fields
  read-only by default with an "Edit" button; editable fields use `--zg-field-bg`,
  read-only fields `--zg-readonly-bg` (Lab 2 §3). Performed by and created time are
  always read-only.
- **Status actions** in view mode, shown only when permitted by the Action status
  matrix: "Start" (Planned), "Complete" (Planned / In Progress — opens the Result
  field and requires it), "Cancel action" (Planned / In Progress — asks for a
  confirmation in an accessible dialog, not a browser `confirm()`). Completed and
  Cancelled actions show no edit or status controls.
- **Validation** appears under the field concerned: required description, required
  follow-up note, required result to complete, and a server rejection of an inactive
  assignee shown under the Assignee field.
- **Conflict:** a `STALE_UPDATE` shows an inline warning "Someone else changed this
  action. Reload to see the latest version." with a "Reload" button; the user's typed
  values stay in the form until they choose to reload.
- **Ticket not active:** on a Resolved, Closed, or Cancelled Ticket the "Add Action"
  button is replaced by the text "Reopen the ticket to record new actions."
- **States:** loading (skeleton rows), empty ("No actions recorded yet." + "Add
  Action"), failure (inline error + "Try again").
- Screenshot path: `artifacts/lab-04/screenshots/actions-taken/`.

## 4. Ticket workflow controls (changed)

- The status select offers only the targets returned by the API
  (`allowedTransitions`); the current status is shown as a badge next to it.
- **Resolution gate feedback:** when the API answers `RESOLUTION_BLOCKED`, an inline
  message under the status control reads "This ticket still has open actions. Complete
  or cancel them before resolving." and the blocking actions are highlighted in the
  Actions Taken list (warning left border + "Blocking" label) and linked from the
  message.
- A successful change refreshes the status badge, the allowed transitions, and the
  status history without a page reload, and announces "Status changed to <status>"
  through `aria-live="polite"`.
- **Stale ticket:** the same inline "Reload" warning as §3.
- **Status history:** a compact timeline under the workflow block, oldest first —
  "<from> → <to>", who (name + role badge), and when. Read-only for every role.

## 5. Requester screens (changed)

- **My Tickets:** a Status filter (multi-select of the 8 statuses) is added to the
  existing filters. When the screen is opened from a dashboard card, the filter is
  pre-applied from the URL and shown as removable chips with a "Clear filters" action.
- **Requester Ticket Detail:** adds a read-only **Actions Taken** section (same list
  layout as §3, no create/edit/status controls, no "Visible to the Requester" label)
  and the status history. Internal Notes are never rendered — not hidden with CSS, not
  in the DOM, because the Requester's API responses never contain them.

## 6. Hardening conventions (applies to every screen)

- Every submit button is disabled while its request is in flight and shows a busy
  label; create forms send an `Idempotency-Key` generated once per submission and
  reused on retry.
- After a recoverable failure (validation, conflict, network), the form keeps every
  entered value and moves focus to the first error.
- Feedback wording is consistent: loading skeletons; success confirmations through
  `aria-live="polite"`; errors through `role="alert"`; forbidden routes redirect to
  the role's dashboard; not-found shows "This ticket doesn't exist or you don't have
  access to it." with a link back.
- No placeholder text, dead link, unfinished control, or console error on any screen.
- Obsolete Lab 2/3 leftovers are removed (specification §11).

## 7. Accessibility and responsive

Same rules as Labs 2 and 3: every control has a programmatic label; visible keyboard
focus on every interactive element (the Lab 3 checklist noted Bootstrap's default focus
ring is faint on this theme — Lab 4 replaces it with a 3px `--zg-primary` outline at
2px offset); focus order follows visual order; dialogs trap focus and return it on
close; color is never the only signal; no clipped content, overlapping controls, or
horizontal page scroll at 375px, 768px, and 1280px.

## 8. Visual inspection checklist — completed in Issue 29

Evidence: `e2e/lab-04/responsive.spec.ts` (RESP-01, RESP-02, STYLE-01, STYLE-05,
A11Y-01), `client/tests/lab-04/zen-green.style.test.tsx` (STYLE-02–STYLE-04), the
E2E specs, and the screenshots under `artifacts/lab-04/screenshots/`
(staff-dashboard, requester-dashboard, actions-taken, ticket-workflow,
regression — desktop 1280, tablet 768, mobile 375), each re-inspected after the
last change.

- [x] Dashboards, Actions Taken, and workflow controls use the existing tokens and
      components. STYLE-01 reads the metric card's computed colors in a real
      browser (surface `rgb(255,255,255)`, border `rgb(221,229,225)`, text
      `rgb(30,43,37)`, count weight 700). The only token change in Lab 4 is
      `--zg-warning-text` (see §9), which is documented.
- [x] Role navigation shows only permitted destinations, with the active page
      marked. UI-20 (Dashboard first for all three roles; the Administrator also
      gets My Queue), Lab 3 UI-09 updated, and `aria-current` kept (Lab 2 AppShell
      test).
- [x] Metric cards: label, count, and drill-down readable at all three widths.
      RESP-01 asserts 5/3/2 columns (staff) and 4/3/2 (Requester), no horizontal
      scroll; screenshots `staff-dashboard/*.png`, `requester-dashboard/*.png`.
- [x] Actions Taken and Internal Notes are clearly different on the staff Ticket
      Detail; Internal Notes absent from the Requester Ticket Detail. STYLE-03,
      UI-14, E2E-03, and E2E-10's `07-requester-view-no-internal-note.png`.
- [x] Status, IT Priority, and Action status badges are consistent across every
      screen. Found and fixed in Issue 28: My Tickets showed raw `NEW` in one
      pale tone; it now uses the shared labels and tones. STYLE-02 covers the four
      Action statuses.
- [x] Editable vs read-only fields distinguishable at a glance in the Action form.
      STYLE-04 (`--zg-field-bg` vs `--zg-readonly-bg`), visible in
      `actions-taken/several-actions-one-ticket.png`.
- [x] Validation messages appear under their field, including server rejections.
      UI-10/UI-11 and E2E-02: a server-rejected inactive assignee shows "Choose an
      active IT Staff member or Administrator." under Assignee, linked with
      `aria-describedby`. This closes the caveat recorded in Lab 3's checklist
      (server rejections used to appear only as a form-level message).
- [x] No clipping, overlap, or horizontal scroll at desktop, tablet, and mobile.
      Asserted programmatically in RESP-01/RESP-02 and the Issue 24–27 checks. Two
      defects were found in screenshots and fixed: a duplicated "by <performer>"
      line on desktop, and badges stretched across list rows on mobile.

## 9. Accessibility checklist — completed in Issue 29

- [x] Every Lab 4 screen is fully operable with the keyboard alone. A11Y-01
      creates an Action and opens and dismisses the cancel dialog using only Tab,
      Enter, typing, and Escape.
- [x] Focus is visible on every interactive element, including cards and menu
      items. STYLE-05 reads the computed outline on a keyboard-focused metric card:
      `rgb(0, 107, 60) solid 3px`. Screenshot: `staff-dashboard/keyboard-focus.png`.
      This replaces Bootstrap's faint default ring noted in Lab 3.
- [x] Dashboard cards announce label, count, and destination. Every card link's
      accessible name is "<label>: <count>, view all" (UI-01, E2E-07–E2E-09
      select them by that name).
- [x] Form fields have labels; required fields are announced as required. Every
      Action form control is found by its label in the tests, and required fields
      carry the `required` attribute (UI-10 asserts it on the follow-up note).
- [x] Errors are announced (`role="alert"`) and linked to their field
      (`aria-describedby`). `FormField` now gives each error an id (UI-11).
- [x] The cancel-action dialog traps focus, closes with Escape, and returns focus.
      UI-12 (Escape) and A11Y-01 (focus starts on "Keep action" and returns to
      "Cancel action" on close).
- [x] Status and priority information never relies on color alone. Every badge
      carries its text label (STYLE-02), and blocking actions carry the words
      "Blocking resolution".
- [x] Text contrast meets WCAG AA on cards, badges, and the Actions Taken section.
      Computed ratios: body text on surface 14.71:1, secondary on surface 5.40:1,
      Planned badge 4.87:1, error text 9.14:1, header nav 6.63:1. **Found and
      fixed:** the warning badge text (In Progress, Waiting for Requester,
      Reopened, MEDIUM) was 3.93:1 on its background — below AA for small text
      since Lab 2. `--zg-warning-text` was darkened from `#a66a00` to `#8f5b00`
      (5.02:1), same hue.
