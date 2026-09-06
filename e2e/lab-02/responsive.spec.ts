import { test, expect, Page } from "@playwright/test";

// RESP-01, RESP-02, RESP-03 — docs/lab-02/tests.md §2.5, ui-spec.md §9 and §12.
// Also captures the screenshot evidence for Part 9 of the submission.

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "mobile", width: 390, height: 844 },
] as const;

const SHOTS = "artifacts/lab-02/screenshots";
const REQUESTER = "Napat Srisai";

async function shot(page: Page, folder: string, name: string) {
  await page.screenshot({ path: `${SHOTS}/${folder}/${name}.png`, fullPage: true });
}

/** No part of the page may scroll horizontally (ui-spec §9). */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function selectRequester(page: Page) {
  await expect(page.getByText(/this is not a login screen/i)).toBeVisible();
  const option = page.locator("option", { hasText: REQUESTER }).first();
  await page.getByLabel(/Development Requester/).selectOption((await option.getAttribute("value"))!);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("renders every Lab 2 screen without clipping or horizontal scrolling", async ({ page }) => {
      // Requester Selection
      await page.goto("/tickets");
      await expect(page.getByText(/this is not a login screen/i)).toBeVisible();
      await expectNoHorizontalScroll(page);
      await shot(page, "requester-selection", `${viewport.name}-initial`);

      await selectRequester(page);

      // My Tickets
      await expect(page.getByRole("table")).toBeVisible();
      await expectNoHorizontalScroll(page);
      await shot(page, "my-tickets", `${viewport.name}-list`);

      // The table header is hidden below 768 px, where rows become cards.
      const headerVisible = await page.locator("thead").isVisible();
      expect(headerVisible).toBe(viewport.width >= 768);

      // Related System is hidden on tablet only (ui-spec §9).
      const systemCellVisible = await page.locator("td.zg-col-system").first().isVisible();
      expect(systemCellVisible).toBe(!(viewport.width >= 768 && viewport.width < 992));

      // Search and filters stay usable at every size.
      await page.getByLabel(/^Search/).fill("zzzz-no-match");
      await expect(page.getByText(/no tickets match these filters/i)).toBeVisible();
      await expectNoHorizontalScroll(page);
      await shot(page, "my-tickets", `${viewport.name}-no-results`);
      await page.getByRole("button", { name: /clear filters/i }).first().click();
      await expect(page.getByRole("table")).toBeVisible();

      // Ticket Detail
      await page.locator("tbody tr a").first().click();
      await expect(page.getByRole("heading", { name: /^TKT-/ })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await shot(page, "ticket-detail", `${viewport.name}-view`);

      // Create Ticket — initial and validation states
      await page.goto("/tickets/new");
      await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();
      await expect(page.getByLabel(/^Category/)).toBeEnabled();
      await expectNoHorizontalScroll(page);
      await shot(page, "create-ticket", `${viewport.name}-initial`);

      await page.getByRole("button", { name: "Submit Ticket" }).click();
      await expect(page.getByText("Summary is required")).toBeVisible();
      await expectNoHorizontalScroll(page);
      await shot(page, "create-ticket", `${viewport.name}-validation`);
    });

    test("keeps controls readable and touch-friendly", async ({ page }) => {
      await page.goto("/tickets");
      await selectRequester(page);

      // ui-spec §9 — touch targets stay at least 44 px on mobile.
      const submit = page.getByRole("link", { name: "Create Ticket" }).first();
      const box = await submit.boundingBox();
      expect(box).not.toBeNull();
      if (viewport.width < 768) expect(box!.height).toBeGreaterThanOrEqual(44);

      // Nothing may overflow its own container either.
      const clipped = await page.evaluate(() =>
        Array.from(document.querySelectorAll("main *")).filter(
          (element) => element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).overflowX === "visible"
        ).length
      );
      expect(clipped).toBe(0);
    });
  });
}
