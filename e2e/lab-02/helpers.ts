import { Page } from "@playwright/test";

export const ADA = "Ada Lovelace — ada.lovelace@example.com";
export const GRACE = "Grace Hopper — grace.hopper@example.com";

export async function selectRequester(page: Page, label: string) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await page.getByLabel(/development requester/i).selectOption({ label });
  await page.getByRole("button", { name: /continue/i }).click();
}

// "Create Ticket" appears twice on My Tickets (nav link + toolbar CTA button) —
// both are intentional (ui-spec.md §4.4), so navigation must be scoped to the
// nav landmark specifically. Mobile also collapses the nav behind "Menu": it
// starts `display:none` (Bootstrap `d-none`), which removes it from the
// accessibility tree entirely, so a role-based locator can't even be used to
// check `data-mobile-open` before the toggle — a plain CSS locator can.
export async function clickNavLink(page: Page, name: "My Tickets" | "Create Ticket") {
  const nav = page.locator('nav[aria-label="Main"]');
  const viewport = page.viewportSize();
  if (viewport && viewport.width < 768) {
    const isOpen = await nav.getAttribute("data-mobile-open");
    if (isOpen !== "true") {
      await page.getByRole("button", { name: /menu/i }).click();
    }
  }
  await nav.getByRole("link", { name }).click();
}
