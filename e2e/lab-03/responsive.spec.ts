import { test, expect, Page } from "@playwright/test";
import { ACCOUNTS, PASSWORD, signIn, signInAs, signOut } from "../helpers/auth.js";

// RESP-01 … RESP-05 — docs/lab-03/tests.md §2.11, ui-spec.md §6.
// Also captures the screenshot evidence for Part 9 of the submission.

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "mobile", width: 390, height: 844 },
] as const;

const SHOTS = "artifacts/lab-03/screenshots";

async function shot(page: Page, folder: string, name: string) {
  await page.screenshot({ path: `${SHOTS}/${folder}/${name}.png`, fullPage: true });
}

/** No part of the page may scroll horizontally (AC-48). */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/**
 * Nor may any single element stick out past the viewport — except one inside a
 * wrapper that scrolls horizontally on purpose. The Lab 2 rule the queue and
 * the ticket tables follow is exactly that: the table clips inside its card and
 * scrolls inside `.zg-table-wrap`, so the page never scrolls (ui-spec.md §6).
 */
async function expectNothingWiderThanTheViewport(page: Page) {
  const offenders = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth;

    function insideAScroller(element: HTMLElement): boolean {
      for (let node = element.parentElement; node; node = node.parentElement) {
        const overflowX = getComputedStyle(node).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") return true;
      }
      return false;
    }

    return Array.from(document.body.querySelectorAll<HTMLElement>("*"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;
        if (Math.ceil(rect.right - limit) <= 1) return false;
        return !insideAScroller(element);
      })
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`.slice(0, 80));
  });

  expect(offenders, "elements wider than the viewport").toEqual([]);
}

async function checkPage(page: Page, folder: string, viewport: string) {
  await expectNoHorizontalScroll(page);
  await expectNothingWiderThanTheViewport(page);
  await shot(page, folder, viewport);
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    // RESP-01 / AC-48
    test("login and change-password fit the viewport", async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "Sign in to your account" })).toBeVisible();
      await checkPage(page, "authentication", `${viewport.name}-login`);

      // The failure state adds an alert above the fields; it must not overflow.
      await page.getByLabel(/Email address/).fill(ACCOUNTS.requester.email);
      await page.getByLabel(/^Password/).fill("WrongPassword#1");
      await page.getByRole("button", { name: "Sign In" }).click();
      await expect(page.getByRole("alert")).toBeVisible();
      await checkPage(page, "authentication", `${viewport.name}-login-error`);

      // A seeded account that still has its initial password (BR-51).
      await signIn(page, "kittisak.boo@kmutt.ac.th", PASSWORD);
      await expect(page.getByRole("heading", { name: "Change Your Password" })).toBeVisible();
      await checkPage(page, "authentication", `${viewport.name}-change-password`);
    });

    // RESP-02 / AC-48
    test("the staff queue fits the viewport and becomes cards on mobile", async ({ page }) => {
      await signInAs(page, ACCOUNTS.staff.email, /Ticket Queue/);
      await checkPage(page, "staff-queue", `${viewport.name}-list`);

      // Below 768 px the table is replaced by one card per ticket (ui-spec §6).
      const tableVisible = await page.locator("table.zg-table").first().isVisible();
      const cardsVisible = await page.locator(".zg-queue-cards").first().isVisible();
      expect(tableVisible).toBe(viewport.width >= 768);
      expect(cardsVisible).toBe(viewport.width < 768);

      // The no-results state is a different layout and is checked too.
      await page.getByLabel("Search").fill("no-such-ticket-anywhere");
      await expect(page.getByText("No tickets match these filters.")).toBeVisible();
      await checkPage(page, "staff-queue", `${viewport.name}-no-results`);
    });

    // RESP-03 / AC-48
    test("staff ticket detail fits the viewport and keeps its tabs reachable", async ({ page }) => {
      await signInAs(page, ACCOUNTS.staff.email, /Ticket Queue/);
      await page.getByRole("link", { name: /^TKT-/ }).first().click();
      await expect(page.getByRole("heading", { name: /^TKT-/ })).toBeVisible();
      await checkPage(page, "staff-ticket-detail", `${viewport.name}-detail`);

      for (const tab of ["Public Comments", "Internal Notes", "Attachments"]) {
        const control = page.getByRole("tab", { name: new RegExp(tab) });
        await expect(control).toBeVisible();
        await control.click();
      }

      await expect(page.getByRole("region", { name: "Internal Notes" })).toHaveCount(0);
      await page.getByRole("tab", { name: /Internal Notes/ }).click();
      await expect(page.getByRole("region", { name: "Internal Notes" })).toBeVisible();
      await checkPage(page, "staff-ticket-detail", `${viewport.name}-internal-notes`);
    });

    // RESP-04 / AC-48
    test("user management fits the viewport and stacks its panel below 900 px", async ({ page }) => {
      await signInAs(page, ACCOUNTS.administrator.email, /Ticket Queue/);
      await page.goto("/admin/users");
      await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
      await checkPage(page, "user-management", `${viewport.name}-list`);

      await page.getByRole("button", { name: "＋ Create User" }).click();
      await expect(page.getByRole("region", { name: "Create New User" })).toBeVisible();
      await checkPage(page, "user-management", `${viewport.name}-create-panel`);

      // Above 900 px the panel sits beside the list; below, it stacks under it.
      const columns = await page.evaluate(
        () => getComputedStyle(document.querySelector(".zg-admin-layout")!).gridTemplateColumns
      );
      expect(columns.trim().split(/\s+/).length).toBe(viewport.width >= 900 ? 2 : 1);
    });

    // RESP-05 / AC-49 — the Requester screens complete the screenshot set.
    test("the requester screens fit the viewport", async ({ page }) => {
      await signInAs(page, ACCOUNTS.requester.email, /My Tickets/);
      await checkPage(page, "requester", `${viewport.name}-my-tickets`);

      await page.getByRole("link", { name: /^TKT-/ }).first().click();
      await expect(page.getByRole("heading", { name: /^TKT-/ })).toBeVisible();
      await expect(page.getByRole("region", { name: "Public Comments" })).toBeVisible();
      await checkPage(page, "requester", `${viewport.name}-ticket-detail`);

      await signOut(page);
    });
  });
}
