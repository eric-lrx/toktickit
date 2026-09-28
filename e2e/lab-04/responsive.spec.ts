import { test, expect, Page } from "@playwright/test";
import path from "path";
import { API_URL, loginAs } from "./helpers.js";
import { STAFF_MARGARET } from "../lab-03/helpers.js";

const OUT = path.join(process.cwd(), "artifacts", "lab-04", "screenshots");
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 375, height: 812 },
] as const;

async function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function gridColumns(page: Page) {
  return page.locator(".zg-metric-grid").first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
}

test("RESP-01 staff dashboard: 5 / 3 / 2 cards per row, no horizontal scroll", async ({ page }) => {
  await loginAs(page, STAFF_MARGARET);
  const expected = { desktop: 5, tablet: 3, mobile: 2 };
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /^Welcome back/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^New: \d+, view all$/ })).toBeVisible();
    expect(await gridColumns(page), vp.name).toBe(expected[vp.name]);
    expect(await overflow(page), vp.name).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(OUT, "staff-dashboard", `${vp.name}.png`), fullPage: true });
  }
});

test("RESP-01 requester dashboard: 4 / 3 / 2 cards per row, no horizontal scroll", async ({ page }) => {
  // Alan's Tickets are seed data only, so the screenshots show realistic content.
  await loginAs(page, "alan.turing@example.com");
  const expected = { desktop: 4, tablet: 3, mobile: 2 };
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: /^My Open Tickets: \d+, view all$/ })).toBeVisible();
    expect(await gridColumns(page), vp.name).toBe(expected[vp.name]);
    expect(await overflow(page), vp.name).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(OUT, "requester-dashboard", `${vp.name}.png`), fullPage: true });
  }
});

test("RESP-02 Actions Taken: full table, folded performer column, stacked cards; no horizontal scroll", async ({ page }) => {
  await loginAs(page, STAFF_MARGARET);
  const ticket = await (await page.request.get(`${API_URL}/api/staff/tickets?search=TKT-9999-000003`)).json();
  const id = ticket.data[0].id;
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`/queue/${id}`);
    const panel = page.getByTestId("actions-taken-panel");
    await expect(panel.getByRole("heading", { name: /^Actions Taken \(\d+\)$/ })).toBeVisible();
    const performerHeader = panel.locator("th.actions-col-performer");
    const headerRow = panel.locator("thead");
    if (vp.name === "desktop") await expect(performerHeader).toBeVisible();
    if (vp.name === "tablet") await expect(performerHeader).toBeHidden();
    if (vp.name === "mobile") {
      const theadHeight = await headerRow.evaluate((el) => el.getBoundingClientRect().height);
      expect(theadHeight).toBeLessThanOrEqual(1);
    }
    expect(await overflow(page), vp.name).toBeLessThanOrEqual(0);
    await panel.scrollIntoViewIfNeeded();
    await panel.screenshot({ path: path.join(OUT, "actions-taken", `${vp.name}.png`) });
  }
});

test("STYLE-01 metric cards use the Zen Green surface, border, and text tokens", async ({ page }) => {
  await loginAs(page, STAFF_MARGARET);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dashboard");
  const card = page.getByRole("link", { name: /^Open: \d+, view all$/ });
  await expect(card).toBeVisible();
  const style = await card.evaluate((el) => {
    const s = getComputedStyle(el);
    const count = getComputedStyle(el.querySelector(".zg-metric-count")!);
    return { bg: s.backgroundColor, border: s.borderTopColor, color: s.color, countWeight: count.fontWeight };
  });
  expect(style).toEqual({ bg: "rgb(255, 255, 255)", border: "rgb(221, 229, 225)", color: "rgb(30, 43, 37)", countWeight: "700" });
});

test("STYLE-05 keyboard focus shows a 3px primary outline", async ({ page }) => {
  await loginAs(page, STAFF_MARGARET);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: /^New: \d+, view all$/ })).toBeVisible();
  let outline = "";
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || !el.classList.contains("zg-metric-card")) return null;
      const s = getComputedStyle(el);
      return `${s.outlineColor} ${s.outlineStyle} ${s.outlineWidth}`;
    });
    if (info) {
      outline = info;
      break;
    }
  }
  expect(outline).toBe("rgb(0, 107, 60) solid 3px");
  await page.screenshot({ path: path.join(OUT, "staff-dashboard", "keyboard-focus.png") });
});

// A11Y-01 (ui-spec.md §9) — the Actions Taken area is operable with the
// keyboard alone: reach "Add Action", fill the form, save, open and dismiss
// the cancel dialog, with focus returned to where it was.
test("A11Y-01 an action can be created and the cancel dialog used with the keyboard only", async ({ page, browser }) => {
  const { createAccount, createTicketAs, signIn } = await import("./helpers.js");
  const requester = await createAccount("REQUESTER", "a11y-owner");
  const req = await browser.newPage();
  await signIn(req, requester.email);
  const ticket = await createTicketAs(req, "Keyboard-only check");
  await req.close();

  await loginAs(page, STAFF_MARGARET);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/queue/${ticket.id}`);
  const panel = page.getByTestId("actions-taken-panel");
  await expect(panel.getByRole("button", { name: "Add Action" })).toBeVisible();

  const focusedIs = (predicate: string) => page.evaluate((p) => new Function("el", `return ${p}`)(document.activeElement), predicate);
  async function tabUntil(predicate: string, max = 60) {
    for (let i = 0; i < max; i++) {
      if (await focusedIs(predicate)) return;
      await page.keyboard.press("Tab");
    }
    throw new Error(`focus never reached: ${predicate}`);
  }

  await tabUntil(`el && el.textContent === "Add Action"`);
  await page.keyboard.press("Enter");
  await tabUntil(`el && el.id === "new-action-description"`);
  await page.keyboard.type("Typed without a mouse");
  await tabUntil(`el && el.textContent === "Save Action"`);
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("heading", { name: "Actions Taken (1)" })).toBeVisible();

  await tabUntil(`el && el.textContent === "Cancel action"`);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Cancel this action?" });
  await expect(dialog).toBeVisible();
  expect(await focusedIs(`el && el.textContent === "Keep action"`)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await focusedIs(`el && el.textContent === "Cancel action"`)).toBe(true);
});
