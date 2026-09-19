import { test, expect, Page } from "@playwright/test";
import { ACCOUNTS, signInAs, signOut } from "../helpers/auth.js";

// E2E-01 … E2E-04 — docs/lab-02/tests.md §2.5, kept as Lab 3 regression
// evidence (BR-62). Only the identity step changed: Lab 3 removed the
// Development Requester selector, so each test signs in instead.
// Runs against the real client, API, and PostgreSQL.

const REQUESTER_A = ACCOUNTS.requester;
const REQUESTER_B = ACCOUNTS.otherRequester;

const RUN = `E2E ${Date.now()}`;
const SUMMARY = `${RUN} monitor flickers on the docking station`;
const DESCRIPTION =
  "The external monitor flickers every few seconds when connected through the docking station, on two different cables.";

const PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea735a3250000000049454e44ae426082",
  "hex"
);

async function asRequester(page: Page, account: { email: string }) {
  await signInAs(page, account.email, /My Tickets/);
}

/** Lab 3 replaced "Change Requester" with logging out and back in (BR-61). */
async function switchRequester(page: Page, account: { email: string }) {
  await signOut(page);
  await asRequester(page, account);
}

test.describe.configure({ mode: "serial" });

let ticketNumber = "";
let ticketUrl = "";

test.describe("Requester ticket flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  // E2E-01 / AC-01, AC-03, AC-07
  test("signs in and creates a ticket with a backend ticket number", async ({ page }) => {
    await asRequester(page, REQUESTER_A);
    await expect(page.getByText(REQUESTER_A.name).first()).toBeVisible();

    await page.getByRole("link", { name: "Create Ticket" }).first().click();

    // The requester field is filled from the authenticated identity, read-only.
    await expect(page.getByLabel(/^Requester/)).toHaveValue(REQUESTER_A.name);
    await expect(page.getByLabel(/Ticket Number/)).toHaveValue(/generated/i);

    await page.getByLabel(/^Category/).selectOption({ label: "Hardware" });
    await page.getByLabel(/^Related System/).selectOption({ label: "Corporate Laptop" });
    await page.getByLabel(/^Requested Priority/).selectOption("HIGH");
    await page.getByLabel(/^Summary/).fill(SUMMARY);
    await page.getByLabel(/^Description/).fill(DESCRIPTION);

    await page.getByRole("button", { name: "Submit Ticket" }).click();

    await expect(page.getByText(/your ticket has been created/i)).toBeVisible();
    const numberText = await page.locator("strong", { hasText: /^TKT-/ }).innerText();
    expect(numberText).toMatch(/^TKT-\d{4}-\d{6,}$/);
    ticketNumber = numberText;
  });

  // E2E-02 / AC-16, AC-25
  test("finds the new ticket in My Tickets and opens its detail screen", async ({ page }) => {
    await asRequester(page, REQUESTER_A);

    await page.getByLabel(/^Search/).fill(ticketNumber);
    await expect(page.getByRole("link", { name: ticketNumber })).toBeVisible();

    await page.getByRole("link", { name: ticketNumber }).click();

    await expect(page.getByRole("heading", { name: ticketNumber })).toBeVisible();
    await expect(page.getByLabel(/^Summary/)).toHaveValue(SUMMARY);
    await expect(page.getByLabel(/^Summary/)).toHaveAttribute("readonly", "");
    ticketUrl = new URL(page.url()).pathname;
  });

  // E2E-03 / AC-27, AC-29, AC-30, AC-31
  test("uploads, downloads, and soft-removes an attachment", async ({ page }) => {
    await asRequester(page, REQUESTER_A);
    await page.goto(ticketUrl);

    await page.setInputFiles("#attachmentFile", {
      name: "evidence.png",
      mimeType: "image/png",
      buffer: PNG_BYTES,
    });

    await expect(page.getByText("evidence.png")).toBeVisible();
    await expect(page.getByText("1 of 5 active attachments")).toBeVisible();
    await expect(page.getByText("Active", { exact: true })).toBeVisible();

    // AC-29 — the browser receives the original filename.
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /download evidence\.png/i }).click();
    expect((await download).suggestedFilename()).toBe("evidence.png");

    // AC-30 — removal needs a confirmation and a reason.
    await page.getByRole("button", { name: /remove evidence\.png/i }).click();
    await page.getByLabel(/^Reason/).fill("Uploaded the wrong screenshot");
    await page.getByRole("dialog").getByRole("button", { name: "Remove", exact: true }).click();

    // AC-31 — metadata stays, download is blocked.
    await expect(page.getByText("Removed", { exact: true })).toBeVisible();
    await expect(page.getByText(/uploaded the wrong screenshot/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /download evidence\.png/i })).toBeDisabled();
    await expect(page.getByText("0 of 5 active attachments")).toBeVisible();
  });

  // E2E-04 / AC-04, AC-26
  test("hides the ticket from another Requester, including by direct URL", async ({ page }) => {
    await asRequester(page, REQUESTER_A);
    await page.getByLabel(/^Search/).fill(ticketNumber);
    await expect(page.getByRole("link", { name: ticketNumber })).toBeVisible();

    await switchRequester(page, REQUESTER_B);
    await expect(page.getByText(REQUESTER_B.name).first()).toBeVisible();

    await page.getByLabel(/^Search/).fill(ticketNumber);
    await expect(page.getByRole("link", { name: ticketNumber })).toHaveCount(0);
    await expect(page.getByText(/no tickets match these filters/i)).toBeVisible();

    // Direct access to another Requester's ticket is rejected.
    await page.goto(ticketUrl);
    await expect(page.getByRole("alert")).toContainText(/belongs to another requester/i);
    await expect(page.getByText(SUMMARY)).toHaveCount(0);
  });
});
