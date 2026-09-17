import { Page } from "@playwright/test";

export const ADA = "Ada Lovelace — ada.lovelace@example.com";
export const GRACE = "Grace Hopper — grace.hopper@example.com";

const EMAIL_BY_LABEL: Record<string, string> = {
  [ADA]: "ada.lovelace@example.com",
  [GRACE]: "grace.hopper@example.com",
};

// Backend runs on a different origin/port than the app under test
// (baseURL is the Vite dev server) — same convention as client/src/api.ts's
// own API_URL, no Vite proxy exists for /api.
const API_URL = "http://localhost:3000";
// Matches server/tests/lab-03/testAuth.ts — the two passwords a seeded
// Requester account can plausibly currently have.
const SEED_PASSWORD = "ChangeMe123!";
const FIXED_PASSWORD = "TestSuiteFixed1!";

// Issue 34 — the Development Requester selector is gone (Issue 33); this
// now logs the given Requester in for real via page.request (which shares
// its cookie jar with `page`, so the resulting session cookie is already
// present when the test navigates), completing the mandatory
// change-password step if needed. Tries the fixed test password first
// (the likely current state after any recent server test run against the
// same dev database), falling back to the documented seed password for a
// freshly reseeded database.
export async function selectRequester(page: Page, label: string) {
  const email = EMAIL_BY_LABEL[label];
  if (!email) throw new Error(`selectRequester: unknown label "${label}"`);

  let currentPassword = FIXED_PASSWORD;
  let res = await page.request.post(`${API_URL}/api/auth/login`, { data: { email, password: currentPassword } });
  if (!res.ok()) {
    currentPassword = SEED_PASSWORD;
    res = await page.request.post(`${API_URL}/api/auth/login`, { data: { email, password: currentPassword } });
  }
  if (!res.ok()) {
    throw new Error(`selectRequester: could not log in as ${email} with either known password`);
  }

  const body = await res.json();
  if (body.data.mustChangePassword) {
    const changed = await page.request.post(`${API_URL}/api/auth/change-password`, {
      data: { currentPassword, newPassword: FIXED_PASSWORD },
    });
    if (!changed.ok()) {
      throw new Error(`selectRequester: mandatory change-password failed for ${email}`);
    }
  }

  await page.goto("/");
}

// "Create Ticket" appears twice on My Tickets (nav link + toolbar CTA button) —
// both are intentional (ui-spec.md §4.4), so navigation must be scoped to the
// nav landmark specifically. Mobile also collapses the nav behind "Menu": it
// starts `display:none` (Bootstrap `d-none`), which removes it from the
// accessibility tree entirely, so a role-based locator can't even be used to
// check `data-mobile-open` before the toggle — a plain CSS locator can.
export async function clickNavLink(page: Page, name: "My Tickets" | "Create Ticket") {
  const nav = page.locator('nav[aria-label="Main"]');
  const viewport = page.viewportSize();
  if (viewport && viewport.width < 768) {
    const isOpen = await nav.getAttribute("data-mobile-open");
    if (isOpen !== "true") {
      await page.getByRole("button", { name: /menu/i }).click();
    }
  }
  await nav.getByRole("link", { name }).click();
}
