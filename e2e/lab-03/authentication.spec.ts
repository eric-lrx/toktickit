import { test, expect } from "@playwright/test";
import path from "path";
import { API_URL, ADMIN_BARBARA, clickNavLink, loginAs, REQUESTER_GRACE } from "./helpers.js";

const ARTIFACTS = path.join(process.cwd(), "artifacts", "lab-03", "screenshots");
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "mobile", width: 375, height: 812 },
];

// Issue 39 — full authentication journeys against the real running app +
// database, not a mocked environment (same rationale as e2e/lab-02's specs,
// and the reason Issue 34's session-cookie regression was only ever caught
// here, never by a server-side unit/API test).

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

// E2E-01 (AC-01, AC-02) — a fresh account with mustChangePassword:true logs
// in through the real form, is forced into Change Password with no way
// around it, and ends on the normal application shell once it's done.
test("E2E-01 full login, forced password change, ends on the normal application shell", async ({ page }) => {
  await loginAs(page, ADMIN_BARBARA);
  const email = `e2e-forced-change-${Date.now()}@toktickit.com`;
  const firstPassword = "FreshStart1!";
  const created = await page.request.post(`${API_URL}/api/admin/users`, {
    data: { name: "E2E Forced Change", email, role: "REQUESTER", isActive: true, initialPassword: firstPassword },
  });
  if (!created.ok()) throw new Error(`E2E-01 setup: could not create the fixture user (${created.status()})`);
  await page.request.post(`${API_URL}/api/auth/logout`);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^password/i).fill(firstPassword);
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page.getByText(/must change your password/i)).toBeVisible();
  const secondPassword = "FreshStartTwo2!";
  await page.getByLabel(/^current password/i).fill(firstPassword);
  await page.getByLabel(/^new password/i).fill(secondPassword);
  await page.getByLabel(/confirm new password/i).fill(secondPassword);
  await page.getByRole("button", { name: /^continue$/i }).click();

  // Updated in Lab 4 (docs/lab-04/tests.md §3): every role now lands on the
  // Dashboard, whose "View My Tickets" quick action also matches a loose
  // "My Tickets" name, so the check is scoped to the main navigation.
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "My Tickets" })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
});

// E2E-02 (AC-07) — after logout, neither back-navigation nor a direct URL
// to a protected route can reuse the old session: the cookie is cleared
// client-side and its jti revoked server-side (session.ts).
test("E2E-02 after logout, the app cannot be reused via back-navigation or a direct URL", async ({ page }) => {
  await loginAs(page, REQUESTER_GRACE);
  // Scoped to the main navigation in Lab 4 (docs/lab-04/tests.md §3) — see E2E-01.
  const myTicketsNav = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "My Tickets" });
  await expect(myTicketsNav).toBeVisible();

  await page.getByRole("button", { name: /^logout$/i }).click();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  await expect(myTicketsNav).toHaveCount(0);

  await page.goto("/tickets");
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

// E2E-03 (FR-08) — the Lab 2 create -> My Tickets -> Ticket Detail flow
// still works end-to-end under real session auth, and the Ticket Detail
// screen now also carries Issue 37's Public Comments panel.
test("E2E-03 a Requester creates a Ticket, finds it in My Tickets, and opens it while authenticated", async ({ page }) => {
  await loginAs(page, REQUESTER_GRACE);

  await clickNavLink(page, "Create Ticket");
  await page.getByLabel(/^category/i).selectOption({ label: "Hardware" });
  await page.getByLabel(/related system/i).selectOption({ label: "Printer" });
  await page.getByLabel(/^summary/i).fill("E2E Lab 3: full authenticated flow check");
  await page
    .getByLabel(/^description/i)
    .fill("Confirms create, My Tickets, and Ticket Detail still work end to end under session auth.");
  await page.getByRole("button", { name: /^submit$/i }).click();

  await expect(page.getByText(/ticket created/i)).toBeVisible();
  const ticketNumber = (await page.getByText(/TKT-\d{4}-\d{6}/).textContent())?.match(/TKT-\d{4}-\d{6}/)?.[0];
  expect(ticketNumber).toBeTruthy();

  await clickNavLink(page, "My Tickets");
  await page.getByLabel(/search/i).fill(ticketNumber!);
  await page.getByRole("table").getByText(ticketNumber!).click();

  await expect(page.getByRole("heading", { name: ticketNumber! })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Public Comments" })).toBeVisible();
});

// RESP-03 (ui-spec.md §2-3) — Login and (voluntary) Change Password at
// mobile width: no horizontal scroll, and the primary button is a
// reasonable touch target. Also captures the 3-viewport screenshot
// evidence for both screens (artifacts/lab-03/screenshots/).
test("RESP-03 Login and Change Password have no horizontal scroll at mobile width", async ({ page }) => {
  for (const { name, width, height } of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.goto("/login");
    // AuthContext shows a brief "Loading…" placeholder while it checks for
    // an existing session — waiting for the real form avoids measuring or
    // screenshotting that transient state instead of the actual screen.
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(ARTIFACTS, "login", `${name}.png`) });
  }

  const signInBox = await page.getByRole("button", { name: /sign in/i }).boundingBox();
  expect(signInBox).not.toBeNull();
  expect(signInBox!.height).toBeGreaterThanOrEqual(36);

  await loginAs(page, REQUESTER_GRACE);
  for (const { name, width, height } of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.goto("/change-password");
    await expect(page.getByRole("button", { name: /^save$/i })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(ARTIFACTS, "change-password", `${name}.png`) });
  }

  const saveBox = await page.getByRole("button", { name: /^save$/i }).boundingBox();
  expect(saveBox).not.toBeNull();
  expect(saveBox!.height).toBeGreaterThanOrEqual(36);
});
