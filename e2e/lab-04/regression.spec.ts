import { test, expect, Page } from "@playwright/test";
import path from "path";
import { API_URL, ADMIN_BARBARA, clickNavLink, loginAs, STAFF_MARGARET } from "../lab-03/helpers.js";

// E2E-10 (AC-27, handout Part 8) — one walk through every Lab 1–3 capability the
// final report must show still working after Lab 4, with a screenshot of each
// and zero console errors along the way.
const OUT = path.join(process.cwd(), "artifacts", "lab-04", "screenshots", "regression");

// Failed responses are recorded with their URL, so a console error such as
// "Failed to load resource: 401" names the request that caused it.
function watchConsole(page: Page, errors: string[]) {
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
}

test("E2E-10 Lab 1–3 regression walk: authentication, My Tickets, Ticket Detail, Attachments, comments, IT Staff, notes, users", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  watchConsole(page, errors);
  await page.setViewportSize({ width: 1280, height: 900 });
  const stamp = Date.now();

  // Authentication — a fresh account logs in through the real form and is
  // forced through the mandatory password change first (Lab 3).
  await loginAs(page, ADMIN_BARBARA);
  // Let the Administrator's dashboard finish loading before the API logout
  // below: logging out while its requests were still in flight made them
  // answer 401, which the browser logged as console errors (found with the
  // failing-response URLs recorded by watchConsole).
  await expect(page.getByRole("link", { name: /^New: \d+, view all$/ })).toBeVisible();
  const email = `regression-${stamp}@toktickit.com`;
  const created = await page.request.post(`${API_URL}/api/admin/users`, {
    data: { name: "Riley Regression", email, role: "REQUESTER", isActive: true, initialPassword: "FirstLogin1!" },
  });
  expect(created.ok()).toBe(true);
  await page.request.post(`${API_URL}/api/auth/logout`);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^password/i).fill("FirstLogin1!");
  await page.screenshot({ path: path.join(OUT, "01-login.png") });
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText(/must change your password/i)).toBeVisible();
  await page.screenshot({ path: path.join(OUT, "02-forced-password-change.png") });
  await page.getByLabel(/^current password/i).fill("FirstLogin1!");
  await page.getByLabel(/^new password/i).fill("SecondLogin2!");
  await page.getByLabel(/confirm new password/i).fill("SecondLogin2!");
  await page.getByRole("button", { name: /^continue$/i }).click();
  await expect(page.getByRole("heading", { name: "Welcome, Riley" })).toBeVisible();

  // Create Ticket with an attachment, then My Tickets (Lab 2).
  await clickNavLink(page, "Create Ticket");
  await page.getByLabel(/^category/i).selectOption({ label: "Hardware" });
  await page.getByLabel(/related system/i).selectOption({ label: "Printer" });
  await page.getByLabel(/^summary/i).fill("Regression walk: printer offline on floor 2");
  await page.getByLabel(/^description/i).fill("The printer shows offline for every user on floor 2 since this morning.");
  await page.locator('input[type="file"]').setInputFiles({ name: "printer-panel.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") });
  await page.getByRole("button", { name: /^submit$/i }).click();
  const ticketNumber = (await page.getByText(/TKT-\d{4}-\d{6}/).first().textContent())?.match(/TKT-\d{4}-\d{6}/)?.[0];
  expect(ticketNumber).toBeTruthy();

  await clickNavLink(page, "My Tickets");
  await expect(page.getByRole("table").getByText(ticketNumber!)).toBeVisible();
  await page.screenshot({ path: path.join(OUT, "03-my-tickets.png") });

  // Ticket Detail, Attachments, Public Comments (Lab 2–3).
  await page.getByRole("table").getByText(ticketNumber!).click();
  await expect(page.getByRole("heading", { name: ticketNumber! })).toBeVisible();
  await expect(page.getByText("printer-panel.png")).toBeVisible();
  await page.getByLabel(/add a public comment/i).fill("Regression walk: is anyone looking at this?");
  await page.getByLabel(/add a public comment/i).locator("..").getByRole("button", { name: /^post$/i }).click();
  await expect(page.getByText("Regression walk: is anyone looking at this?").last()).toBeVisible();
  await page.screenshot({ path: path.join(OUT, "04-ticket-detail-attachments-comments.png"), fullPage: true });

  // IT Staff functions and Internal Notes (Lab 3), in a separate session.
  const staffContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const staff = await staffContext.newPage();
  watchConsole(staff, errors);
  await loginAs(staff, STAFF_MARGARET);
  await clickNavLink(staff, "My Queue");
  await staff.getByLabel(/^search/i).fill(ticketNumber!);
  await expect(staff.getByRole("table").getByText(ticketNumber!)).toBeVisible();
  await staff.screenshot({ path: path.join(OUT, "05-staff-queue.png") });
  await staff.getByRole("table").getByText(ticketNumber!).click();
  await staff.getByRole("button", { name: /^claim$/i }).click();
  await expect(staff.getByRole("combobox", { name: "Owner" })).toBeVisible();
  await staff.getByLabel(/^it priority/i).selectOption("HIGH");
  await staff.getByLabel(/^Status$/).selectOption("OPEN");
  await expect(staff.getByText("Status changed to Open")).toBeVisible();
  await staff.getByLabel(/add an internal note/i).fill("Regression walk: printer firmware needs an update.");
  await staff.getByLabel(/add an internal note/i).locator("..").getByRole("button", { name: /^post$/i }).click();
  await expect(staff.getByText("Regression walk: printer firmware needs an update.").last()).toBeVisible();
  await staff.screenshot({ path: path.join(OUT, "06-staff-ticket-detail-notes.png"), fullPage: true });

  // The Requester sees the new status and the staff comment path, never the note.
  await page.reload();
  await expect(page.getByText("Open", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Regression walk: printer firmware needs an update.")).toHaveCount(0);
  await expect(page.getByText(/Internal/)).toHaveCount(0);
  await page.screenshot({ path: path.join(OUT, "07-requester-view-no-internal-note.png"), fullPage: true });

  // User Management (Lab 3), as the Administrator.
  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const admin = await adminContext.newPage();
  watchConsole(admin, errors);
  await loginAs(admin, ADMIN_BARBARA);
  await clickNavLink(admin, "Users");
  await admin.getByLabel(/^search/i).fill(email);
  await expect(admin.getByText(email).first()).toBeVisible();
  await admin.screenshot({ path: path.join(OUT, "08-user-management.png") });

  // Logout ends the session (Lab 3).
  await page.getByRole("button", { name: /^logout$/i }).click();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

  await staffContext.close();
  await adminContext.close();
  expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
});
