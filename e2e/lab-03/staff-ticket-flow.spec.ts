import { test, expect } from "@playwright/test";
import path from "path";
import { clickNavLink, loginAs, REQUESTER_GRACE, STAFF_KATHERINE, STAFF_MARGARET } from "./helpers.js";

const ARTIFACTS = path.join(process.cwd(), "artifacts", "lab-03", "screenshots");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

// E2E-04 (FR-13, FR-15) — claim, IT Priority, status transition, a Public
// Comment, and an Internal Note, all in one pass, then confirmed back in
// the Queue.
test("E2E-04 IT Staff claims a Ticket, sets priority, transitions status, and posts a comment and a note", async ({
  page,
}) => {
  await loginAs(page, REQUESTER_GRACE);
  await clickNavLink(page, "Create Ticket");
  await page.getByLabel(/^category/i).selectOption({ label: "Hardware" });
  await page.getByLabel(/related system/i).selectOption({ label: "Printer" });
  await page.getByLabel(/^summary/i).fill("E2E: staff workflow end to end");
  await page.getByLabel(/^description/i).fill("Created to exercise claim, priority, status, comment, and note.");
  await page.getByRole("button", { name: /^submit$/i }).click();
  const ticketNumber = (await page.getByText(/TKT-\d{4}-\d{6}/).textContent())?.match(/TKT-\d{4}-\d{6}/)?.[0];
  expect(ticketNumber).toBeTruthy();

  await loginAs(page, STAFF_MARGARET);
  await clickNavLink(page, "My Queue");
  await page.getByLabel(/^search/i).fill(ticketNumber!);
  await page.getByRole("table").getByText(ticketNumber!).click();
  await expect(page.getByRole("heading", { name: ticketNumber! })).toBeVisible();

  await page.getByRole("button", { name: /^claim$/i }).click();
  await expect(page.getByRole("combobox", { name: "Owner" })).toBeVisible();

  await page.getByLabel(/^it priority/i).selectOption("HIGH");
  await page.getByLabel(/^status/i).selectOption("OPEN");
  await expect(page.getByText(/^open$/i).first()).toBeVisible();

  await page.getByLabel(/add a public comment/i).fill("E2E: staff public comment");
  await page.getByLabel(/add a public comment/i).locator("..").getByRole("button", { name: /^post$/i }).click();
  await expect(page.getByText("E2E: staff public comment")).toBeVisible();

  await page.getByLabel(/add an internal note/i).fill("E2E: staff internal note");
  await page.getByLabel(/add an internal note/i).locator("..").getByRole("button", { name: /^post$/i }).click();
  await expect(page.getByText("E2E: staff internal note")).toBeVisible();

  // Screenshot evidence for Staff Ticket Detail, both panels populated —
  // not a planned RESP row on its own, same rationale as lab-02's extra
  // Ticket Detail capture in responsive.spec.ts. Both "Post" buttons
  // returning to their idle label (not "Posting…") confirms the reload
  // that follows each post has actually settled before capturing, since
  // getByText above can match a still-in-flight textarea's own draft value
  // rather than only the posted, reloaded list item.
  await expect(page.getByRole("button", { name: "Post" })).toHaveCount(2);
  await page.screenshot({ path: path.join(ARTIFACTS, "staff-ticket-detail", "desktop.png") });
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.screenshot({ path: path.join(ARTIFACTS, "staff-ticket-detail", "tablet.png") });
  await page.setViewportSize({ width: 375, height: 812 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: path.join(ARTIFACTS, "staff-ticket-detail", "mobile.png") });
  await page.setViewportSize({ width: 1280, height: 800 });

  await clickNavLink(page, "My Queue");
  await page.getByLabel(/^search/i).fill(ticketNumber!);
  const row = page.getByRole("row", { name: new RegExp(ticketNumber!) });
  await expect(row.getByText("HIGH")).toBeVisible();
  await expect(row.getByText(/^open$/i)).toBeVisible();
});

// E2E-05 (AC-12) — an Internal Note is structurally absent from the
// Requester's own view of the same Ticket, confirmed by actually loading
// it as that Requester afterward (not just asserting the staff side).
test("E2E-05 an Internal Note posted by staff never appears on the Requester's view of the same Ticket", async ({
  page,
}) => {
  await loginAs(page, REQUESTER_GRACE);
  await clickNavLink(page, "Create Ticket");
  await page.getByLabel(/^category/i).selectOption({ label: "Software" });
  await page.getByLabel(/related system/i).selectOption({ label: "VPN" });
  await page.getByLabel(/^summary/i).fill("E2E: note visibility check");
  await page.getByLabel(/^description/i).fill("Created to confirm staff-only material never reaches the owning Requester.");
  await page.getByRole("button", { name: /^submit$/i }).click();
  const ticketNumber = (await page.getByText(/TKT-\d{4}-\d{6}/).textContent())?.match(/TKT-\d{4}-\d{6}/)?.[0];
  expect(ticketNumber).toBeTruthy();

  await loginAs(page, STAFF_KATHERINE);
  await clickNavLink(page, "My Queue");
  await page.getByLabel(/^search/i).fill(ticketNumber!);
  await page.getByRole("table").getByText(ticketNumber!).click();
  await page.getByLabel(/add an internal note/i).fill("E2E: this must never reach the Requester");
  await page.getByLabel(/add an internal note/i).locator("..").getByRole("button", { name: /^post$/i }).click();
  await expect(page.getByText("E2E: this must never reach the Requester")).toBeVisible();

  await loginAs(page, REQUESTER_GRACE);
  await clickNavLink(page, "My Tickets");
  await page.getByLabel(/search/i).fill(ticketNumber!);
  await page.getByRole("table").getByText(ticketNumber!).click();
  await expect(page.getByRole("heading", { name: ticketNumber! })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Internal Notes" })).toHaveCount(0);
  await expect(page.getByText("E2E: this must never reach the Requester")).toHaveCount(0);
});

// RESP-01 (ui-spec.md §4) — cards at mobile, a reduced table (no Category
// column) at tablet, the full table at desktop, and no horizontal scroll
// at any of the three.
test("RESP-01 the Ticket Queue renders as cards, a reduced table, then the full table across breakpoints", async ({
  page,
}) => {
  await loginAs(page, STAFF_MARGARET);
  // Updated in Lab 4 (docs/lab-04/tests.md §3): IT Staff now land on the
  // Dashboard, so the queue is opened explicitly instead of assumed.
  await page.goto("/queue");

  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(page.getByRole("table")).toBeHidden();
  let overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: path.join(ARTIFACTS, "staff-queue", "mobile.png") });

  await page.setViewportSize({ width: 820, height: 1180 });
  await page.reload();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Category" })).toBeHidden();
  overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: path.join(ARTIFACTS, "staff-queue", "tablet.png") });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  await expect(page.getByRole("columnheader", { name: "Category" })).toBeVisible();
  overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: path.join(ARTIFACTS, "staff-queue", "desktop.png") });
});
