import { Page } from "@playwright/test";

// Backend runs on a different origin/port than the app under test (baseURL
// is the Vite dev server) — same convention as e2e/lab-02/helpers.ts.
export const API_URL = "http://localhost:3000";

export const REQUESTER_ADA = "ada.lovelace@example.com";
export const REQUESTER_GRACE = "grace.hopper@example.com";
export const STAFF_MARGARET = "margaret.hamilton@toktickit.com";
export const STAFF_KATHERINE = "katherine.johnson@toktickit.com";
export const ADMIN_BARBARA = "barbara.liskov@toktickit.com";

// Matches server/tests/lab-03/testAuth.ts's TEST_FIXED_PASSWORD, and
// seed.ts's SEED_INITIAL_PASSWORD as a fallback for a freshly reseeded
// database — the two passwords any seeded account can plausibly currently
// have, exactly as e2e/lab-02/helpers.ts's selectRequester already does.
const FIXED_PASSWORD = "TestSuiteFixed1!";
const SEED_PASSWORD = "ChangeMe123!";

// Generalizes selectRequester (lab-02) to any of the three roles: logs the
// given account in for real via page.request (shares its cookie jar with
// `page`), completes the mandatory change-password step if needed, then
// navigates. Not used by every test — a few tests need to drive the actual
// login form instead, since that's the thing under test there.
export async function loginAs(page: Page, email: string) {
  let currentPassword = FIXED_PASSWORD;
  let res = await page.request.post(`${API_URL}/api/auth/login`, { data: { email, password: currentPassword } });
  if (!res.ok()) {
    currentPassword = SEED_PASSWORD;
    res = await page.request.post(`${API_URL}/api/auth/login`, { data: { email, password: currentPassword } });
  }
  if (!res.ok()) {
    throw new Error(`loginAs: could not log in as ${email} with either known password (status ${res.status()})`);
  }

  const body = await res.json();
  if (body.data.mustChangePassword) {
    const changed = await page.request.post(`${API_URL}/api/auth/change-password`, {
      data: { currentPassword, newPassword: FIXED_PASSWORD },
    });
    if (!changed.ok()) {
      throw new Error(`loginAs: mandatory change-password failed for ${email}`);
    }
  }

  await page.goto("/");
}

// Same nav-scoping rationale as e2e/lab-02/helpers.ts's clickNavLink,
// generalized to any role's link labels ("My Tickets"/"Create Ticket" for
// Requester, "My Queue" for IT Staff, "Users" for Administrator).
export async function clickNavLink(page: Page, name: string) {
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
