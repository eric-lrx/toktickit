import { test, expect } from "@playwright/test";
import { ADA, clickNavLink, GRACE, selectRequester } from "./helpers.js";

// Issue 12 — full Requester journey against the real running app + database
// (same dev server/DB the manual verification used throughout this sprint),
// not a mocked environment.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
});

// E2E-01 (AC-01) — full create-ticket flow with one attachment, found again in My Tickets.
test("a Requester creates a Ticket with an attachment and finds it in My Tickets", async ({ page }) => {
  await selectRequester(page, ADA);

  await clickNavLink(page, "Create Ticket");
  await page.getByLabel(/^category/i).selectOption({ label: "Hardware" });
  await page.getByLabel(/related system/i).selectOption({ label: "Printer" });
  await page.getByLabel(/^summary/i).fill("E2E: keyboard keys sticking");
  await page.getByLabel(/^description/i).fill("Several keys need a hard press to register a keystroke.");
  await page
    .getByLabel(/attachments/i)
    .setInputFiles({ name: "evidence.jpg", mimeType: "image/jpeg", buffer: Buffer.from("fake jpeg bytes") });

  await page.getByRole("button", { name: /^submit$/i }).click();

  await expect(page.getByText(/ticket created/i)).toBeVisible();
  const ticketNumber = (await page.getByText(/TKT-\d{4}-\d{6}/).textContent())?.match(/TKT-\d{4}-\d{6}/)?.[0];
  expect(ticketNumber).toBeTruthy();

  await clickNavLink(page, "My Tickets");
  await page.getByLabel(/search/i).fill(ticketNumber!);
  // Desktop table and mobile card both exist in the DOM (CSS toggles which is
  // visible), so an unscoped text query is ambiguous — scope to the table,
  // which is what's actually visible at this test's (desktop) viewport.
  await expect(page.getByRole("table").getByText(ticketNumber!)).toBeVisible();
});

// E2E-02 (AC-18) — switching Requester hides the previous Requester's Tickets.
test("switching Requester mid-session hides the previous Requester's Tickets", async ({ page }) => {
  await selectRequester(page, ADA);

  await clickNavLink(page, "Create Ticket");
  await page.getByLabel(/^category/i).selectOption({ label: "Software" });
  await page.getByLabel(/related system/i).selectOption({ label: "VPN" });
  await page.getByLabel(/^summary/i).fill("E2E: Ada-only ticket for isolation check");
  await page.getByLabel(/^description/i).fill("This Ticket must not be visible once we switch to Requester B.");
  await page.getByRole("button", { name: /^submit$/i }).click();
  const adaTicketNumber = (await page.getByText(/TKT-\d{4}-\d{6}/).textContent())?.match(/TKT-\d{4}-\d{6}/)?.[0];
  expect(adaTicketNumber).toBeTruthy();

  await page.getByRole("button", { name: /change requester/i }).click();
  await selectRequester(page, GRACE);

  await clickNavLink(page, "My Tickets");
  await page.getByLabel(/search/i).fill(adaTicketNumber!);
  await expect(page.getByText(/no tickets match/i)).toBeVisible();
  await expect(page.getByText(adaTicketNumber!)).not.toBeVisible();
});

// E2E-03 (AC-15) — add, download, then soft-remove an attachment.
test("adding, downloading, then soft-removing an attachment on Ticket Detail", async ({ page }) => {
  await selectRequester(page, ADA);

  await clickNavLink(page, "Create Ticket");
  await page.getByLabel(/^category/i).selectOption({ label: "Network" });
  await page.getByLabel(/related system/i).selectOption({ label: "Campus Wi-Fi" });
  await page.getByLabel(/^summary/i).fill("E2E: attachment lifecycle check");
  await page.getByLabel(/^description/i).fill("Created to exercise add, download, and soft-remove in sequence.");
  await page.getByRole("button", { name: /^submit$/i }).click();
  await expect(page.getByText(/ticket created/i)).toBeVisible();
  const ticketNumber = (await page.getByText(/TKT-\d{4}-\d{6}/).textContent())?.match(/TKT-\d{4}-\d{6}/)?.[0];

  await clickNavLink(page, "My Tickets");
  await page.getByLabel(/search/i).fill(ticketNumber!);
  await page.getByRole("link", { name: ticketNumber! }).click();

  await page
    .getByLabel(/attachments/i)
    .setInputFiles({ name: "log.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 fake") });
  await page.getByRole("button", { name: /^upload$/i }).click();
  await expect(page.getByText("log.pdf")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /download/i }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("log.pdf");

  await page.getByRole("button", { name: /^remove$/i }).click();
  await page.getByLabel(/reason for removal/i).fill("No longer needed for this ticket");
  await page.getByRole("button", { name: /confirm removal/i }).click();

  await expect(page.getByText(/removed: no longer needed/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /download/i })).toHaveCount(0);
});
