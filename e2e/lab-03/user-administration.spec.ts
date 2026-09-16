import { test, expect } from "@playwright/test";
import path from "path";
import { API_URL, ADMIN_BARBARA, clickNavLink, loginAs } from "./helpers.js";

const ARTIFACTS = path.join(process.cwd(), "artifacts", "lab-03", "screenshots");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

// E2E-06 (FR-19, FR-21) — create, reset password, and the new password
// forces a change at the next login: the full administrative loop closes
// correctly end-to-end through the real UI.
test("E2E-06 Administrator creates a user, resets their password, and the new password forces a change at login", async ({
  page,
}) => {
  await loginAs(page, ADMIN_BARBARA);
  await clickNavLink(page, "Users");

  const email = `e2e-full-loop-${Date.now()}@toktickit.com`;
  await page.getByRole("button", { name: /create user/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/full name/i).fill("E2E Full Loop");
  await dialog.getByLabel(/^email/i).fill(email);
  await dialog.getByLabel(/^role/i).selectOption("REQUESTER");
  await dialog.getByLabel(/^initial password/i).fill("FirstPass1!");
  await dialog.getByRole("button", { name: /save user/i }).click();
  // Desktop table and mobile cards both exist in the DOM (CSS toggles which
  // is visible, same responsive split as StaffTicketQueue) — scope to the
  // table to avoid an unscoped query matching both.
  await expect(page.getByRole("table").getByText(email)).toBeVisible();

  await page.getByLabel(/^search/i).fill(email);
  await page.getByRole("button", { name: /^edit$/i }).first().click();
  await page.getByRole("button", { name: /set new password/i }).click();
  await page.getByLabel(/^new password/i).fill("SecondPass1!");
  await page.getByRole("button", { name: /confirm new password/i }).click();
  await expect(page.getByText(/new password set/i)).toBeVisible();

  await page.getByRole("button", { name: /^logout$/i }).click();
  // Logout is a client-side route swap, not a full navigation — filling
  // immediately can race the Login form's remount and land keystrokes on
  // an instance that's about to be replaced (its state discarded with it).
  // Waiting for Sign In to settle first avoids that, same as E2E-02 above.
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^password/i).fill("SecondPass1!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText(/must change your password/i)).toBeVisible();
});

// E2E-07 (AC-13, AC-14) — self-deactivation is always blocked; the
// last-active-Administrator protection is isolated here the same way the
// automated ADMIN-12/13 tests isolate it (repeated automated runs against
// this shared dev database have left many active Administrator fixtures
// behind, so "the last one" isn't otherwise reachable in the UI anymore).
// The business rule itself is already proven directly, including its
// concurrency case, by users-admin.api.test.ts — this is the UI-level
// confirmation that a blocked attempt surfaces a clear message.
test("E2E-07 self-deactivation and last-Administrator deactivation are both blocked with a clear message", async ({
  page,
}) => {
  await loginAs(page, ADMIN_BARBARA);
  await clickNavLink(page, "Users");

  await page.getByLabel(/^search/i).fill("barbara liskov");
  await page.getByRole("button", { name: /^edit$/i }).first().click();
  await expect(page.getByRole("button", { name: /deactivate user/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /deactivate user/i })).toHaveAttribute("title", /own account/i);
  await page.getByRole("button", { name: /^cancel$/i }).first().click();

  const listRes = await page.request.get(`${API_URL}/api/admin/users?role=ADMINISTRATOR`);
  const { data: admins } = await listRes.json();
  const barbara = admins.find((a: { email: string }) => a.email === ADMIN_BARBARA);
  let survivor = admins.find((a: { id: number; isActive: boolean }) => a.id !== barbara.id && a.isActive);
  if (!survivor) {
    const created = await page.request.post(`${API_URL}/api/admin/users`, {
      data: {
        name: "E2E Survivor Admin",
        email: `e2e-survivor-${Date.now()}@toktickit.com`,
        role: "ADMINISTRATOR",
        isActive: true,
        initialPassword: "SurvivorPass1!",
      },
    });
    survivor = (await created.json()).data;
  }
  const toDeactivate = admins.filter((a: { id: number; isActive: boolean }) => a.id !== survivor.id && a.isActive);

  for (const admin of toDeactivate) {
    await page.request.patch(`${API_URL}/api/admin/users/${admin.id}`, { data: { isActive: false } });
  }
  try {
    await page.reload();
    await page.getByLabel(/^search/i).fill(survivor.name);
    await page.getByRole("button", { name: /^edit$/i }).first().click();
    await expect(page.getByRole("button", { name: /deactivate user/i })).toBeDisabled();
    await expect(page.getByRole("button", { name: /deactivate user/i })).toHaveAttribute(
      "title",
      /at least one active administrator/i
    );
  } finally {
    for (const admin of toDeactivate) {
      await page.request.patch(`${API_URL}/api/admin/users/${admin.id}`, { data: { isActive: true } });
    }
  }
});

// RESP-02 (ui-spec.md §7) — usable at all three breakpoints: no clipping,
// no overlap, and no horizontal scroll on the page itself (the table
// carries its own internal scroll, per the table-responsive fix).
test("RESP-02 User Management is usable at desktop, tablet, and mobile widths", async ({ page }) => {
  await loginAs(page, ADMIN_BARBARA);

  for (const { name, width, height } of [
    { name: "mobile", width: 375, height: 812 },
    { name: "tablet", width: 820, height: 1180 },
    { name: "desktop", width: 1280, height: 800 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/admin/users");
    await expect(page.getByRole("button", { name: /create user/i })).toBeVisible();
    const overflow = await page.evaluate(() => document.body.scrollWidth - document.body.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(ARTIFACTS, "user-management", `${name}.png`) });
  }
});
