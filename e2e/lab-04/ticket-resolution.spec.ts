import { test, expect, Page } from "@playwright/test";
import path from "path";
import { API_URL, createAccount, createTicketAs, loginAs, signIn } from "./helpers.js";
import { STAFF_MARGARET } from "../lab-03/helpers.js";

const OUT = path.join(process.cwd(), "artifacts", "lab-04", "screenshots", "ticket-workflow");

test.describe.serial("Ticket resolution and the resolution gate", () => {
  let ticket: { id: number; ticketNumber: string };
  let actionId: number;

  test.beforeAll(async ({ browser }) => {
    const requester = await createAccount("REQUESTER", "resolution-owner");
    const page = await browser.newPage();
    await signIn(page, requester.email);
    ticket = await createTicketAs(page, "Projector in room 402 shows no signal");
    await page.close();

    const staff = await browser.newPage();
    await loginAs(staff, STAFF_MARGARET);
    await staff.request.patch(`${API_URL}/api/staff/tickets/${ticket.id}/status`, { data: { status: "OPEN" } });
    const action = await staff.request.post(`${API_URL}/api/tickets/${ticket.id}/actions`, { data: { description: "Replace the HDMI cable" } });
    actionId = (await action.json()).data.id;
    await staff.close();
  });

  async function openTicket(page: Page) {
    await loginAs(page, STAFF_MARGARET);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/queue/${ticket.id}`);
    await expect(page.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();
  }

  test("E2E-04 resolving on screen with an open action is refused and points at the action", async ({ page }) => {
    await openTicket(page);
    await page.getByLabel(/^Status$/).selectOption("RESOLVED");
    await page.getByLabel("Resolution Summary").fill("Cable replaced");
    await page.getByRole("button", { name: "Save and mark Resolved" }).click();

    await expect(page.getByText("This ticket still has open actions. Complete or cancel them before resolving.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Replace the HDMI cable" })).toHaveAttribute("href", `#action-${actionId}`);
    await expect(page.locator(`#action-${actionId}`)).toHaveClass(/action-row-blocking/);
    await expect(page.getByLabel(/^Status$/)).toHaveValue("OPEN");
    await page.screenshot({ path: path.join(OUT, "resolution-gate-on-screen.png"), fullPage: true });
  });

  test("E2E-05 the same refusal holds for a direct API call that bypasses the screen", async ({ page }) => {
    await loginAs(page, STAFF_MARGARET);
    const res = await page.request.patch(`${API_URL}/api/staff/tickets/${ticket.id}/status`, { data: { status: "RESOLVED" } });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("RESOLUTION_BLOCKED");
    expect(body.error.blockingActionIds).toEqual([actionId]);
    const after = await (await page.request.get(`${API_URL}/api/staff/tickets/${ticket.id}`)).json();
    expect(after.data.status).toBe("OPEN");
  });

  test("E2E-06 completing the action unblocks resolution; the history records every step", async ({ page }) => {
    await openTicket(page);
    const panel = page.getByTestId("actions-taken-panel");
    await panel.getByRole("button", { name: "View action: Replace the HDMI cable" }).click();
    await panel.getByRole("button", { name: "Complete" }).click();
    await panel.getByLabel(/^Result/).fill("New cable installed; projector shows the laptop screen");
    await panel.getByRole("button", { name: "Confirm completion" }).click();
    await expect(panel.getByRole("row").nth(1).getByText("Completed")).toBeVisible();

    await page.getByLabel(/^Status$/).selectOption("RESOLVED");
    await page.getByLabel("Resolution Summary").fill("HDMI cable replaced");
    await page.getByRole("button", { name: "Save and mark Resolved" }).click();
    await expect(page.getByText("Status changed to Resolved")).toBeVisible();
    await page.getByLabel(/^Status$/).selectOption("CLOSED");
    await expect(page.getByText("Status changed to Closed")).toBeVisible();

    const history = page.getByRole("list", { name: "History of status changes" }).getByRole("listitem");
    await expect(history).toHaveCount(3);
    expect((await history.allTextContents()).map((t) => t.split(" · ")[0])).toEqual(["New → Open", "Open → Resolved", "Resolved → Closed"]);
    await page.getByText("Status history").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, "resolved-and-closed-with-history.png"), fullPage: true });
  });
});
