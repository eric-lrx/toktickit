import { test, expect } from "@playwright/test";
import path from "path";
import { API_URL, createAccount, createTicketAs, loginAs, signIn } from "./helpers.js";
import { STAFF_MARGARET } from "../lab-03/helpers.js";

const OUT = path.join(process.cwd(), "artifacts", "lab-04", "screenshots");

// Disposable accounts with a known number of Tickets: a count compared with a
// list here cannot be moved by another test running in parallel.

test("E2E-07 an IT Staff card's drill-down lands on a queue whose total equals the card", async ({ page, browser }) => {
  const tech = await createAccount("IT_STAFF", "dashboard-tech");
  const requester = await createAccount("REQUESTER", "dashboard-req-staff");
  const req = await browser.newPage();
  await signIn(req, requester.email);
  const a = await createTicketAs(req, "Monitor flickers at the front desk");
  const b = await createTicketAs(req, "Badge reader rejects valid cards");
  await req.close();

  const staff = await browser.newPage();
  await loginAs(staff, STAFF_MARGARET);
  for (const t of [a, b]) {
    const res = await staff.request.patch(`${API_URL}/api/staff/tickets/${t.id}/owner`, { data: { ticketOwnerId: tech.id } });
    expect(res.ok()).toBe(true);
  }
  await staff.close();

  await signIn(page, tech.email);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("link", { name: "My Assigned: 2, view all" }).click();
  await expect(page).toHaveURL(/\/queue\?/);
  await expect(page.getByText("(2 tickets)")).toBeVisible();
  const rows = await page.getByRole("table").getByRole("link").allTextContents();
  expect(rows.sort()).toEqual([a.ticketNumber, b.ticketNumber].sort());
});

test("E2E-08 a Requester card's drill-down lands on My Tickets with the same total and only their own Tickets", async ({ page, browser }) => {
  const requester = await createAccount("REQUESTER", "dashboard-req");
  await signIn(page, requester.email);
  const t1 = await createTicketAs(page, "Laptop battery drains quickly");
  const t2 = await createTicketAs(page, "Need access to the finance share");
  const t3 = await createTicketAs(page, "Email signature shows the old logo");

  const staff = await browser.newPage();
  await loginAs(staff, STAFF_MARGARET);
  for (const s of ["OPEN", "WAITING_FOR_REQUESTER"]) {
    await staff.request.patch(`${API_URL}/api/staff/tickets/${t3.id}/status`, { data: { status: s } });
  }
  await staff.close();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "My Open Tickets: 2, view all" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Waiting for Me: 1, view all" })).toBeVisible();
  await page.screenshot({ path: path.join(OUT, "requester-dashboard", "fresh-requester.png"), fullPage: true });

  await page.getByRole("link", { name: "My Open Tickets: 2, view all" }).click();
  await expect(page.getByRole("list", { name: "Active status filters" })).toBeVisible();
  await expect(page.getByText("(2 tickets)")).toBeVisible();
  const rows = await page.getByRole("table").getByRole("link").allTextContents();
  expect(rows.sort()).toEqual([t1.ticketNumber, t2.ticketNumber].sort());
});

test("E2E-09 accounts with no data see zero cards whose drill-downs reach the no-results state", async ({ page }) => {
  await loginAs(page, "zoe.empty@example.com");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dashboard");
  for (const label of ["My Open Tickets", "Waiting for Me", "Resolved", "Closed"]) {
    await expect(page.getByRole("link", { name: `${label}: 0, view all` })).toBeVisible();
  }
  await expect(page.getByText("No tickets yet")).toBeVisible();
  await page.screenshot({ path: path.join(OUT, "requester-dashboard", "zero-metrics.png"), fullPage: true });
  await page.getByRole("link", { name: "Closed: 0, view all" }).click();
  await expect(page.getByText("No tickets match your search or filters.")).toBeVisible();

  await loginAs(page, "zed.empty@toktickit.com");
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "My Assigned: 0, view all" })).toBeVisible();
  await expect(page.getByRole("link", { name: "My Open Actions: 0, view all" })).toBeVisible();
  await expect(page.getByText("No open actions assigned to you")).toBeVisible();
  await page.screenshot({ path: path.join(OUT, "staff-dashboard", "zero-personal-metrics.png"), fullPage: true });
  await page.getByRole("link", { name: "My Assigned: 0, view all" }).click();
  await expect(page.getByText("No tickets match your search or filters.")).toBeVisible();
});
