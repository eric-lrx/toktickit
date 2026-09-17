# Lab 3 UI Specification — Zen Green Theme (extends Lab 2)

This document **extends** `docs/lab-02/ui-spec.md`. Every color token, spacing scale,
component rule, button hierarchy, responsive rule, and accessibility rule from Lab 2
§1–§3, §6, §7 remains in force unchanged. Only what is new or changed for Lab 3 is
specified here — new screens must look like part of the same application, not a
second visual system.

## 1. Application shell (changed)

- The header's Requester name + "Change Requester" link are replaced by: the
  authenticated user's **name and role** (e.g. "Michael Brown — IT Staff"), a
  **Logout** button, and (for users who must change their password only) nothing else
  reachable.
- Navigation is role-specific and never renders a link to a destination the current
  role cannot use:
  - **Requester:** My Tickets, Create Ticket.
  - **IT Staff:** My Queue (the Ticket Queue), Create Ticket is not shown (IT Staff
    does not submit Tickets in Lab 3).
  - **Administrator:** Users.
- The Development Requester selector screen and its route are removed entirely.

## 2. Login

- Centered card, same visual weight as the old selector screen: TokTickIT wordmark,
  "Sign in to your account".
- Fields: Email (text), Password (password, with a show/hide toggle — icon-only,
  `aria-label="Show password"`/`"Hide password"`).
- Primary button "Sign In"; busy state shows a spinner + "Signing in…" and is
  disabled while the request is in flight (same busy convention as Lab 2's Submit).
- Failure: a single `--zg-error` message directly under the password field —
  "Invalid email or password." — identical wording regardless of cause (BR-08).
  Never a page-level banner only.
- No "Forgot your password?" link (excluded, §4.2 of the handout).

## 3. Change Password

Two entry points, one component:
- **Mandatory** (first login with `mustChangePassword = true`): shown immediately
  after login, no way to reach any other screen, no "Cancel". Heading: "You must
  change your password to continue."
- **Voluntary** (from the Profile menu, any time): same form, adds a "Cancel" action
  back to wherever the user came from.

Fields: Current password, New password, Confirm new password (all password type with
show/hide toggles). A live checklist under New Password mirrors the four rules (≥ 8
chars, uppercase, lowercase, digit, special character), each item shown with a
neutral state until typing starts, then a check or a plain indicator — never color
alone (an icon or text label accompanies each). Confirm must match New exactly;
mismatch is a field-level message, not a submit-time surprise.

Primary button "Continue" (mandatory) / "Save" (voluntary); busy label "Saving…". On
success, mandatory flow proceeds straight into the application; voluntary flow shows
a brief success confirmation and returns to the previous screen.

## 4. IT Staff Ticket Queue

- Toolbar: search box (Ticket Number or Summary), Filters (Status, IT Priority, Owner
  — including an explicit "Unassigned" option, Category), Sort control. No "Create
  Ticket" action (IT Staff does not create Tickets).
- **Desktop (≥ 992px):** table. Columns: Ticket Number, Created Date, Summary,
  Category, Requested Priority (badge), IT Priority (badge), Status (badge), Owner
  (name or "Unassigned"), Last Updated. Nine columns is deliberately the ceiling —
  Category is dropped first on tablet if width is tight, to avoid an unreadable
  mega-grid (the handout's own warning).
- **Tablet (768–991px):** same table, Category column hidden; row click still opens
  Ticket Detail.
- **Mobile (< 768px):** one card per Ticket — Ticket Number + Status badge on the top
  line, Summary below, a second line with Requested/IT Priority badges and Owner.
- Pagination control below the list, same convention as Lab 2's My Tickets.
- States: loading (skeleton rows/cards), empty (no Tickets exist at all — rare but
  possible on a fresh install — "No tickets yet"), no-results (filters applied,
  nothing matched — "Clear filters" CTA), forbidden (a Requester somehow reaches the
  route — redirect, not a rendered error page), failure (retry action).
- Screenshot path: `artifacts/lab-03/screenshots/staff-queue/`.

## 5. IT Staff Ticket Detail

Extends the Lab 2 Requester Ticket Detail layout (read-only header, classification
block, Summary/Description) with:

- **Ticket Owner**: an editable select (active IT Staff/Administrator users +
  "Unassigned"), with a one-click "Claim" button shown only when unassigned.
- **IT Priority**: editable select, visually distinct from the read-only Requested
  Priority badge next to it (editable fields use `--zg-field-bg`, exactly like every
  other editable control per Lab 2 §3).
- **Current Status**: editable select constrained to the transitions the transition
  matrix permits from the Ticket's current status; disallowed targets are not shown
  in the dropdown at all (the frontend mirrors the backend table for a better UX, but
  the backend remains the actual enforcement per the handout's "hiding a button is
  not authorization").
- **Resolution Summary**: editable textarea, relevant once status moves toward
  Resolved; shown read-only (with the same `--zg-readonly-bg` treatment) on the
  Requester-facing detail screen.
- **Requester's resolution signal**: if `requesterResolutionIndicatedAt` is set, a
  small `--zg-pale` badge "Requester indicated this is resolved" appears near the
  status control — informational only, it does not change the dropdown's options.
- **Attachments**: identical section to Lab 2, continuity preserved.
- **Public Comments / Internal Notes**: two visually distinct panels or tabs, never
  merged into one list.
  - Public Comments: `--zg-surface` background, author name badge shows the author's
    role (Requester / IT Staff / Administrator).
  - Internal Notes: a warm, clearly different background (`--zg-readonly-bg` family)
    with a persistent "Internal — not visible to Requester" label at the top of the
    panel, so posting in the wrong panel is visually hard to do by accident.
  - Both: a text box + "Post" button, append-only (no edit/delete controls anywhere
    in either panel), newest-at-bottom, timestamp + author on every entry.
- Screenshot path: `artifacts/lab-03/screenshots/staff-ticket-detail/`.

## 6. Requester Ticket Detail (additions)

- Adds a Public Comments panel identical in style to the one above, and a "Mark
  problem as resolved" secondary-button action that sets the resolution signal and
  then shows a small confirmation ("Thanks — IT Staff will confirm and close this
  ticket.") without changing the Status badge.
- Internal Notes are never rendered on this screen — not hidden with CSS, not present
  in the DOM at all, since the API response the Requester's session can reach never
  includes them.

## 7. Administrator User Management

- Single screen, list + slide-over or side panel for create/edit (same panel
  component for both, mode-dependent title).
- List: Name, Email, Role (badge), Status (Active/Inactive badge), Edit action. No
  pagination controls (BR: not required at this scale).
- Toolbar: search (name/email), optional role filter. No multi-column sort, no
  simultaneous multi-filter beyond the one role filter.
- Create/Edit panel fields: Full Name, Email, Role (single select), Active toggle,
  and — create mode only — Initial Password; edit mode instead shows a distinct "Set
  new password" action that opens a small confirmation before applying (since it
  forces the target user's next login into Change Password).
- No "Send password reset email" checkbox (excluded, §11 of `specification.md`).
- Buttons: primary "Save User", destructive-style "Deactivate User" (edit mode,
  disabled with a tooltip explaining why when the target is the last active
  Administrator or the acting Administrator's own account).
- States: validation (duplicate email, invalid role), success, forbidden
  (non-Administrator reaching the route), safe API-failure.
- Screenshot path: `artifacts/lab-03/screenshots/user-management/`.

## 8. Badges (additions)

- **Role badge**: Requester (`--zg-secondary` text on `--zg-pale`), IT Staff (amber,
  matching the existing warning palette), Administrator (`--zg-primary` text on
  white with a `--zg-primary` border) — always paired with the role's text label.
- **Current Status badge**, now 8 values: New (`--zg-secondary`/`--zg-pale`, as Lab
  2), Open (`--zg-secondary`/`--zg-pale`), In Progress (amber), Waiting for Requester
  (amber, distinct label text from In Progress even though both use the warning
  palette — text is always the differentiator, never color alone), Resolved/Closed
  (`--zg-success`/pale green), Reopened (amber), Cancelled (muted gray, not
  `--zg-error` — cancellation is not a failure state of the UI).
- **IT Priority badge**: same three-value styling as Requested Priority (Lab 2 §5),
  rendered side by side so the two are easy to compare at a glance.

## 9. Accessibility and responsive (unchanged)

Same rules as Lab 2 §6–§7: every control has a programmatic label, focus order
follows visual order, `role="alert"`/`aria-live="polite"` for status messages, color
never the sole signal, no horizontal scroll on mobile for any new screen. The
show/hide password toggle and the Claim/Post buttons are icon-or-text controls with
`aria-label`s where icon-only.

## 10. Visual inspection checklist — completed in Issue 21

Evidence: `client/tests/lab-03/zen-green.style.test.tsx` (STYLE-01..04),
`e2e/lab-03/*.spec.ts` (RESP-01/02/03), and the screenshots under
`artifacts/lab-03/screenshots/` (login, change-password, staff-queue,
staff-ticket-detail, user-management — 3 viewports each), all real,
re-inspected after two genuine issues below were found and fixed, not
checked from memory.

- [x] Colors match the token table exactly on every new screen (checked against
      `client/src/theme.css`, not by eye). STYLE-01..04 assert the actual
      `var(--zg-*)` value on the rendered element, not a visual guess.
- [x] Role navigation shows no destination the current role cannot use, on all three
      roles. Confirmed both by UI-09 (Issue 33) and by real login as each role
      in this pass (Requester/IT Staff/Administrator each showed only their
      own nav links).
- [x] Status and Priority badges are consistent across the Queue, Staff Detail, and
      Requester Detail screens. All three import the same `ticketStatus.ts`
      tone/label maps — structurally one source, not three copies that could
      drift; STYLE-02 covers all 8 statuses.
- [x] Editable vs. read-only fields are visually distinguishable at a glance on the
      Staff Ticket Detail screen. STYLE-03, plus visual confirmation in the
      screenshots (white `--zg-field-bg` selects vs. tan `--zg-readonly-bg`
      text).
- [x] Validation messages appear directly under their field on Login, Change
      Password, and User Management — for client-side validation
      (`FormField`'s own `error` prop, e.g. empty required fields, password
      rules). One honest caveat: a *server-rejected* value (duplicate email
      on User Management, wrong current password on Change Password) surfaces
      as a form-level message below the fields, not re-anchored under the
      specific field — consistent across every screen that has this
      distinction, not an oversight isolated to one screen, but looser than
      this item's literal wording.
- [x] Focus indicator visible on every interactive element, including the
      show/hide-password toggle. Verified via keyboard Tab + computed style
      (`box-shadow: 0 0 0 4px rgba(248,249,250,.5)`, Bootstrap's default) —
      present and visible, but a pale, uncustomized color against this
      theme's own light background is noticeably subtle. Not blocking; worth
      a follow-up if accessibility polish gets scheduled.
- [x] No clipped labels or truncated buttons at desktop, tablet, and mobile on the
      Queue, Staff Ticket Detail, and User Management screens. Real finding
      during this pass: User Management's table overflowed at tablet width
      (Status/Edit columns pushed out of view) and was largely unusable at
      mobile (only Name/Email reachable). Fixed with a truncated+titled Email
      column for the desktop table and a proper mobile card view (mirroring
      StaffTicketQueue's own responsive split) — re-screenshotted and
      confirmed clean at all three widths afterward.
- [x] No overlapping elements at any of the three breakpoints. Checked across
      all 15 screenshots.
- [x] No horizontal scrolling at the mobile breakpoint, asserted programmatically.
      RESP-01/02/03 each assert `scrollWidth <= clientWidth` at mobile width
      as part of the test, not just a visual check.
