# Lab 2 UI Specification — Zen Green Theme

## 1. Color tokens

| Token (CSS var) | Value | Use |
|---|---|---|
| `--zg-primary` | `#006B3C` | app header, primary actions, strong emphasis |
| `--zg-secondary` | `#0B7A46` | active tabs, focus ring, links, hover |
| `--zg-pale` | `#EAF6EF` | selected row, success surface, subtle emphasis |
| `--zg-bg` | `#F5F7F6` | page background |
| `--zg-surface` | `#FFFFFF` | cards/panels, 1px `#DDE5E1` border, restrained shadow |
| `--zg-text` | `#1E2B25` | dark charcoal-green body text, never pure black |
| `--zg-field-bg` | `#FFFFFF` | editable field background |
| `--zg-field-border` | `#C7D2CC` | editable field border |
| `--zg-readonly-bg` | `#F1EFE6` | read-only field background (warm ivory), clearly distinct |
| `--zg-error` | `#8A1F1F` | error text and border |
| `--zg-warning` | `#A66A00` | warning callout/badge text, amber (`#FCEFD1`) background |
| `--zg-success` | `#0B7A46` | success text, paired with an icon/label, never color alone |

Declared once as `:root` CSS variables in the shell stylesheet; every component
references the variable, never a hardcoded hex.

## 2. Typography and spacing

- Font: system sans-serif stack, base size 16px, line-height 1.5.
- Headings: `h1` 24px/700, `h2` 20px/600, `h3` 16px/600 — all in `--zg-text`.
- Spacing scale (used for padding/gaps): 4, 8, 12, 16, 24, 32px.
- One consistent input height (40px) across text inputs, selects, and buttons.

## 3. Component rules

- Labels sit above their control, 14px/600, `--zg-text`.
- Required fields show a red asterisk after the label text; the asterisk never
  substitutes for a validation message.
- Multiline `Description` is taller (min 96px) and resizable vertically only.
- Buttons always carry visible text; an icon may accompany but never replace it.
- Every icon-only control (e.g. remove-attachment "×") has `aria-label` and a tooltip.
- Disabled controls: reduced opacity (0.5) + `cursor: not-allowed`; not focusable via
  tab order changes, but remain screen-reader visible as disabled.
- Focus indicator: 2px `--zg-secondary` outline, visible on every interactive element.
- Submit button: shows a spinner + "Submitting…" label and `disabled` while a request
  is in flight (BR-13).
- Validation messages render directly under their field in `--zg-error`, not only in a
  page-level banner.
- Success state (Create Ticket) shows the generated Ticket Number in a `--zg-pale`
  panel with a "View Ticket" / "Create another" pair of actions.

### Button hierarchy
- **Primary** (`--zg-primary` fill, white text) — one per screen: Submit, Continue.
- **Secondary** (white fill, `--zg-secondary` border/text) — Cancel, Change Requester.
- **Tertiary** (text-only, `--zg-secondary`) — Clear filters, links.
- **Destructive** (white fill, `--zg-error` border/text) — Remove attachment.
- **Disabled** — any of the above with the disabled treatment in §3.
- **Busy** — primary button variant with spinner, described above.

## 4. Screens

### 4.1 Development Requester Selection
- TokTickIT title + one-line explanation: "Select a Development Requester to test
  requester-specific ticket behavior. This is not a login screen. Authentication and
  role-based access will be introduced in Lab 3."
- Dropdown of active Requesters (name + email), keyboard-navigable.
- Continue button, disabled until a Requester is chosen.
- States: loading (skeleton/spinner), empty ("No active Development Requesters — ask
  an administrator to seed one"), API-failure (retry action).
- Screenshot path: `artifacts/lab-02/screenshots/create-ticket/00-selector.png`
  (selector is the entry point shared by every flow, hence grouped with create-ticket).

### 4.2 Application shell
- Header (`--zg-primary`): TokTickIT wordmark, nav (My Tickets, Create Ticket),
  current Requester name + Change Requester link.
- Active nav item underlined in `--zg-secondary` and `aria-current="page"`.
- Mobile (< 768px): nav collapses behind a hamburger button; shell never causes
  horizontal scroll.

### 4.3 Create Ticket
Layout, top to bottom: read-only system-generated row (Ticket Date placeholder, "Ticket
Number: assigned after submission") in `--zg-readonly-bg` → classification group
(Category, Related System, Requested Priority selects) → Summary (single line) →
Description (multiline) → Attachments (file picker + list of staged files with
remove) → primary (Submit) / secondary (Cancel) actions.
- States: initial, field-validation, submitting (button busy), success (Ticket Number
  shown), API-failure (form values preserved, error banner + field errors if
  applicable), invalid-attachment (per-file error: wrong type / too large / quota).
- Screenshot path: `artifacts/lab-02/screenshots/create-ticket/`.

### 4.4 My Tickets
- Toolbar: search box, Category/Related System/Priority filters, sort control, "Create
  Ticket" primary action.
- Desktop (≥ 992px): table — Ticket Number, Summary, Category, Requested Priority
  (badge), Current Status (badge), Created (date), row click opens Detail.
- Mobile (< 768px): one card per Ticket with the same fields stacked; tap opens Detail.
- Pagination control below the list (page numbers + page-size select).
- States: loading (skeleton rows/cards), empty (no Tickets ever — "Create your first
  ticket" CTA), no-results (filters applied, nothing matched — "Clear filters" CTA),
  failure (retry action).
- Screenshot path: `artifacts/lab-02/screenshots/my-tickets/`.

### 4.5 Requester Ticket Detail
- Read-only header block: Ticket Number, Current Status badge, Created/Updated dates.
- Read-only classification block: Category, Related System, Requested Priority badge.
- Summary and Description in read-only styled fields (`--zg-readonly-bg`).
- Attachments section, visually separated from Ticket information: list of active
  attachments (name, size, download button) and, distinctly styled (muted, no
  download), removed attachments showing name + removal reason. "Add attachment"
  control at the top of the section.
- No Public Comments, Internal Notes, Actions Taken, or status controls.
- Screenshot path: `artifacts/lab-02/screenshots/ticket-detail/`.

## 5. Badges

Requested Priority: `LOW` (gray-green), `MEDIUM` (amber), `HIGH` (`--zg-error` text on
pale red). Current Status: `NEW` (`--zg-secondary` text on `--zg-pale`) — the only
value in Lab 2. Badge text is always present alongside color; color is never the sole
signal.

## 6. Responsive rules

| Viewport | Rule |
|---|---|
| Desktop ≥ 992px | Multi-column layout, content max-width ~1040px, centered |
| Tablet 768–991px | Two columns where practical; Summary/Description get full width |
| Mobile < 768px | Single column, stacked fields, touch-sized (≥ 40px) buttons, **no horizontal scroll** |
| All | No clipped labels, no overlapping messages, no hidden buttons, attachment names wrap instead of truncating unreadably |

## 7. Accessibility

- Every form control has a programmatically associated `<label>`.
- Icon-only controls: `aria-label` + native `title` tooltip.
- Focus order follows visual order; focus ring always visible (§3).
- Status/validation messages use `role="alert"` or `aria-live="polite"` as appropriate.
- Color is never the only indicator of state (badges and messages always carry text).

## 8. Visual inspection checklist — completed in Issue 12

- [x] Colors match the token table exactly — checked against `client/src/theme.css`'s
      `--zg-*` custom properties directly (not by eye): primary `#006b3c`, secondary
      `#0b7a46`, pale `#eaf6ef`, background `#f5f7f6`, error `#8a1f1f`, warning
      `#a66a00`/`#fcefd1`, success `#0b7a46` — all match §1 exactly.
- [x] Editable vs. read-only fields are visually distinguishable at a glance —
      editable fields are white (`--zg-field-bg`); read-only blocks (Ticket
      Detail's Summary/Description, Create Ticket's system-generated note) use
      the warm-ivory `--zg-readonly-bg`. Confirmed in `artifacts/lab-02/
      screenshots/ticket-detail/desktop.png`.
- [x] Validation messages appear directly under their field, not only at the
      top — confirmed live in Lab 2's own manual verification (Issue 8):
      "Summary must be at least 5 characters." renders immediately under the
      Summary input, not in a page-level banner.
- [x] Button hierarchy is consistent across screens — primary (`btn-success`,
      Submit/Continue/Create Ticket), secondary (`btn-outline-secondary`,
      Change Requester/Previous/Next/Cancel), destructive (`btn-danger`/
      `btn-outline-danger`, Confirm removal/Remove) used the same way on every
      screen; busy state (Submitting…, disabled) verified live in Issue 8.
- [x] No clipped labels or truncated buttons at any of the three breakpoints —
      see the three Playwright screenshots (`create-ticket/tablet.png`,
      `my-tickets/{desktop,mobile}.png`, `ticket-detail/desktop.png`).
- [x] No overlapping elements at any of the three breakpoints — same
      screenshots; the mobile nav overlap bug found during Issue 7's manual
      verification (menu button overlapping the title) was fixed then and
      re-confirmed clean here.
- [x] No horizontal scrolling at the mobile breakpoint — asserted
      programmatically in `e2e/lab-02/responsive.spec.ts`
      (`document.documentElement.scrollWidth <= clientWidth` at 375px), not
      just visually.
- [x] Screenshots captured under
      `artifacts/lab-02/screenshots/{create-ticket,my-tickets,ticket-detail}/`,
      generated by `e2e/lab-02/responsive.spec.ts`, not hand-taken: My Tickets
      at desktop and mobile, Create Ticket at tablet, Ticket Detail at
      desktop — every one of the three required viewport widths is
      represented at least once across the three screens.
