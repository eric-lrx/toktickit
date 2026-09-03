import { test, expect } from "@playwright/test";
import path from "path";
import { ADA, clickNavLink, selectRequester } from "./helpers.js";

// Issue 12 — RESP-01/02/03. Each test sets its own viewport rather than
// running every spec through a 3-viewport project matrix (see
// playwright.config.ts) since only these tests are viewport-specific.

const ARTIFACTS = path.join(process.cwd(), "artifacts", "lab-02", "screenshots");

test("My Tickets renders as a table at desktop width", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await selectRequester(page, ADA);
  await clickNavLink(page, "My Tickets");
  await expect(page.getByRole("table")).toBeVisible();
  await page.screenshot({ path: path.join(ARTIFACTS, "my-tickets", "desktop.png") });
});

test("My Tickets renders as cards at mobile width with no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await selectRequester(page, ADA);
  await clickNavLink(page, "My Tickets");
  await expect(page.getByRole("table")).toBeHidden();

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  await page.screenshot({ path: path.join(ARTIFACTS, "my-tickets", "mobile.png") });
});

test("Create Ticket shows the classification fields in a multi-column row at tablet width", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await selectRequester(page, ADA);
  await clickNavLink(page, "Create Ticket");

  const categoryBox = await page.getByLabel(/^category/i).boundingBox();
  const priorityBox = await page.getByLabel(/requested priority/i).boundingBox();
  expect(categoryBox).not.toBeNull();
  expect(priorityBox).not.toBeNull();
  // Side-by-side columns share the same row, so their vertical position matches
  // but their horizontal position does not.
  expect(Math.abs(categoryBox!.y - priorityBox!.y)).toBeLessThan(5);
  expect(categoryBox!.x).toBeLessThan(priorityBox!.x);

  await page.screenshot({ path: path.join(ARTIFACTS, "create-ticket", "tablet.png") });
});

// Not a planned RESP row on its own — the required artifacts/lab-02/screenshots
// structure has a ticket-detail/ folder, so this captures the read-only detail
// screen at desktop width for completeness of Part 9's evidence.
test("Ticket Detail read-only screen at desktop width", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await selectRequester(page, ADA);

  await clickNavLink(page, "Create Ticket");
  await page.getByLabel(/^category/i).selectOption({ label: "Hardware" });
  await page.getByLabel(/related system/i).selectOption({ label: "Printer" });
  await page.getByLabel(/^summary/i).fill("E2E: screenshot fixture for Ticket Detail");
  await page.getByLabel(/^description/i).fill("Created only to capture the Ticket Detail screenshot.");
  await page.getByRole("button", { name: /^submit$/i }).click();
  const ticketNumber = (await page.getByText(/TKT-\d{4}-\d{6}/).textContent())?.match(/TKT-\d{4}-\d{6}/)?.[0];

  await clickNavLink(page, "My Tickets");
  await page.getByLabel(/search/i).fill(ticketNumber!);
  await page.getByRole("link", { name: ticketNumber! }).click();

  // Assert on the heading specifically (unique to the detail page) rather
  // than generic text like "Requested Priority", which also exists on My
  // Tickets (filter label + table header) and can transiently double-match
  // mid-navigation, before the old page has fully unmounted.
  await expect(page.getByRole("heading", { name: ticketNumber! })).toBeVisible();
  await page.screenshot({ path: path.join(ARTIFACTS, "ticket-detail", "desktop.png") });
});
