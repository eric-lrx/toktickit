import { test, expect, Page } from "@playwright/test";
import path from "path";
import { API_URL, createAccount, createTicketAs, deactivateAccount, loginAs, signIn } from "./helpers.js";
import { STAFF_MARGARET } from "../lab-03/helpers.js";

const OUT = path.join(process.cwd(), "artifacts", "lab-04", "screenshots", "actions-taken");

test.describe.serial("Actions Taken flow", () => {
  let requesterEmail: string;
  let ticket: { id: number; ticketNumber: string };

  test.beforeAll(async ({ browser }) => {
    requesterEmail = (await createAccount("REQUESTER", "actions-owner")).email;
    const page = await browser.newPage();
    await signIn(page, requesterEmail);
    ticket = await createTicketAs(page, "Keyboard keys stick on the reception laptop");
    await page.close();
  });

  const panel = (page: Page) => page.getByTestId("actions-taken-panel");
  const row = (page: Page, n: number) => panel(page).getByRole("row").nth(n);

  async function addAction(page: Page, description: string, opts: { assignee?: string; status?: string } = {}) {
    await panel(page).getByRole("button", { name: "Add Action" }).click();
    await panel(page).getByLabel(/^Description/).fill(description);
    if (opts.assignee) await panel(page).getByLabel("Assignee").selectOption({ label: opts.assignee });
    if (opts.status) await panel(page).getByLabel("Status").selectOption(opts.status);
    await panel(page).getByRole("button", { name: "Save Action" }).click();
    await expect(panel(page).getByRole("button", { name: `View action: ${description}` })).toBeVisible();
  }

  test("E2E-01 IT Staff records three actions, then assigns, edits, starts, completes, and cancels them", async ({ page }) => {
    await loginAs(page, STAFF_MARGARET);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/queue/${ticket.id}`);
    await expect(panel(page).getByText("No actions recorded yet.")).toBeVisible();

    await addAction(page, "Diagnose the sticking keys", { assignee: "Margaret Hamilton", status: "IN_PROGRESS" });
    await addAction(page, "Order a replacement keyboard");
    await addAction(page, "Install the keyboard", { assignee: "Katherine Johnson" });
    await expect(panel(page).getByRole("heading", { name: "Actions Taken (3)" })).toBeVisible();

    // Complete the first, with a result.
    await panel(page).getByRole("button", { name: "View action: Diagnose the sticking keys" }).click();
    await panel(page).getByRole("button", { name: "Complete" }).click();
    await panel(page).getByLabel(/^Result/).fill("Liquid damage under the keys; replacement needed");
    await panel(page).getByRole("button", { name: "Confirm completion" }).click();
    await expect(row(page, 1).getByText("Completed")).toBeVisible();

    // Cancel the second, through the confirmation dialog.
    await panel(page).getByRole("button", { name: "View action: Order a replacement keyboard" }).click();
    await panel(page).getByRole("button", { name: "Cancel action" }).click();
    await page.getByRole("dialog", { name: "Cancel this action?" }).getByRole("button", { name: "Yes, cancel action" }).click();
    await expect(row(page, 2).getByText("Cancelled")).toBeVisible();

    // Edit and reassign the third, then start it.
    await panel(page).getByRole("button", { name: "View action: Install the keyboard" }).click();
    await panel(page).getByRole("button", { name: "Edit" }).click();
    await panel(page).getByLabel(/^Description/).fill("Install the replacement keyboard");
    await panel(page).getByLabel("Assignee").selectOption({ label: "Margaret Hamilton" });
    await panel(page).getByRole("button", { name: "Save Action" }).click();
    await expect(panel(page).getByRole("button", { name: "View action: Install the replacement keyboard" })).toBeVisible();
    await panel(page).getByRole("button", { name: "Start" }).click();
    await expect(row(page, 3).getByText("In Progress")).toBeVisible();

    const descriptions = await panel(page).getByTestId("action-description").allTextContents();
    expect(descriptions).toEqual(["Diagnose the sticking keys", "Order a replacement keyboard", "Install the replacement keyboard"]);
    await panel(page).getByRole("button", { name: "View action: Diagnose the sticking keys" }).click();
    await panel(page).screenshot({ path: path.join(OUT, "several-actions-one-ticket.png") });

    // Finish the in-progress action too, so repeated runs do not pile open
    // actions onto a shared seeded account's dashboard.
    await panel(page).getByRole("button", { name: "View action: Install the replacement keyboard" }).click();
    await panel(page).getByRole("button", { name: "Complete" }).click();
    await panel(page).getByLabel(/^Result/).fill("Keyboard replaced and tested");
    await panel(page).getByRole("button", { name: "Confirm completion" }).click();
    await expect(row(page, 3).getByText("Completed")).toBeVisible();
  });

  test("E2E-02 an assignee deactivated before saving is rejected by the server and shown under Assignee", async ({ page }) => {
    const temp = await createAccount("IT_STAFF", "temp-assignee");
    await loginAs(page, STAFF_MARGARET);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/queue/${ticket.id}`);
    await panel(page).getByRole("button", { name: "Add Action" }).click();
    await panel(page).getByLabel(/^Description/).fill("Hand over to the temporary technician");
    await panel(page).getByLabel("Assignee").selectOption({ label: "E2E temp-assignee" });

    await deactivateAccount(temp.id);
    await panel(page).getByRole("button", { name: "Save Action" }).click();
    await expect(panel(page).getByText("Choose an active IT Staff member or Administrator.")).toBeVisible();
    await expect(panel(page).getByLabel(/^Description/)).toHaveValue("Hand over to the temporary technician");
    await panel(page).screenshot({ path: path.join(OUT, "inactive-assignee-rejected.png") });

    const actions = await (await page.request.get(`${API_URL}/api/tickets/${ticket.id}/actions`)).json();
    expect(actions.data).toHaveLength(3);
  });

  test("E2E-03 the owning Requester sees the actions read-only and never the Internal Note", async ({ page, browser }) => {
    const staff = await browser.newPage();
    await loginAs(staff, STAFF_MARGARET);
    const note = await staff.request.post(`${API_URL}/api/tickets/${ticket.id}/notes`, { data: { content: "Internal: customer spilled coffee, bill the department." } });
    expect(note.ok()).toBe(true);
    await staff.close();

    await signIn(page, requesterEmail);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/tickets/${ticket.id}`);
    await expect(panel(page).getByRole("heading", { name: "Actions Taken (3)" })).toBeVisible();
    await expect(panel(page).getByRole("button", { name: "Add Action" })).toHaveCount(0);
    await panel(page).getByRole("button", { name: "View action: Diagnose the sticking keys" }).click();
    await expect(panel(page).getByText("Liquid damage under the keys; replacement needed")).toBeVisible();
    await expect(panel(page).getByRole("button", { name: "Edit" })).toHaveCount(0);
    await expect(page.getByText(/customer spilled coffee/)).toHaveCount(0);
    await expect(page.getByText(/Internal/)).toHaveCount(0);
    await page.screenshot({ path: path.join(OUT, "requester-read-only.png"), fullPage: true });
  });
});
