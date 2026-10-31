import { test, expect, Locator, Page } from "@playwright/test";
import { ACCOUNTS, signInAs } from "../helpers/auth.js";
import { CreatedTicket, addAction, apiAs, createTicket, setStatus } from "../helpers/api.js";

// E2E-06 … E2E-09 — docs/lab-04/tests.md §2.9.

test.describe.configure({ mode: "serial" });

const RUN = `E2E${Date.now()}`;

/** A status badge inside a row; the row's detail list repeats some of the same words. */
const badge = (scope: Locator, text: string) => scope.locator(".zg-badge").filter({ hasText: new RegExp(`^${text}$`) });
const SHOTS = "artifacts/lab-04/screenshots/actions-taken";

let gated: CreatedTicket;
let shared: CreatedTicket;
let indicated: CreatedTicket;

async function openTicket(page: Page, ticket: CreatedTicket, tab = "") {
  await page.goto(`/staff/tickets/${ticket.id}${tab}`);
  await expect(page.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();
}

const statusBadge = (page: Page) => page.getByRole("heading", { level: 1 }).locator("xpath=..").locator(".zg-badge").first();

async function requestResolved(page: Page) {
  await page.getByLabel("Status").selectOption("RESOLVED");
  await page.getByLabel(/Resolution Summary/).fill("Replaced the print head and printed a test label.");
  await page.getByRole("button", { name: "Save changes" }).click();
}

test.beforeAll(async () => {
  const requester = await apiAs(ACCOUNTS.requester.email);
  gated = await createTicket(requester, `${RUN} resolution gate ticket`);
  shared = await createTicket(requester, `${RUN} two people edit this ticket`);
  indicated = await createTicket(requester, `${RUN} requester says it is fixed`);
  await requester.dispose();

  const staff = await apiAs(ACCOUNTS.staff.email);
  await setStatus(staff, gated.id, "IN_PROGRESS");
  await addAction(staff, gated.id, { description: `${RUN} replace the print head`, status: "IN_PROGRESS" });
  await setStatus(staff, indicated.id, "IN_PROGRESS");
  await setStatus(staff, indicated.id, "WAITING_FOR_REQUESTER");
  await staff.dispose();
});

// E2E-06 / AC-14
test("resolving with an incomplete action is blocked and the status stays", async ({ page }) => {
  await signInAs(page, ACCOUNTS.staff.email, /Welcome back/);
  await openTicket(page, gated);
  await requestResolved(page);

  const callout = page.locator(".zg-callout", { hasText: "This ticket cannot be resolved yet." });
  await expect(callout).toBeVisible();
  await expect(callout.getByRole("listitem")).toHaveText([`${RUN} replace the print head — incomplete`]);
  await page.screenshot({ path: `${SHOTS}/desktop-blocked-resolution.png`, fullPage: true });

  await page.reload();
  await expect(statusBadge(page)).toHaveText("In Progress");
});

// E2E-07 / AC-15
test("completing with a follow-up still blocks; clearing it lets the ticket resolve and close", async ({ page }) => {
  await signInAs(page, ACCOUNTS.staff.email, /Welcome back/);
  await openTicket(page, gated, "?tab=actions");
  const action = page.getByTestId("action-row").filter({ hasText: "replace the print head" });

  await action.getByRole("button", { name: "Complete" }).click();
  const form = page.getByRole("form", { name: "Edit action" });
  await form.getByLabel(/^Result/).fill("New print head fitted.");
  await form.getByLabel("Follow-Up Required").check();
  await form.getByLabel(/Follow-up Note/).fill("Check the label quality on Monday.");
  await form.getByRole("button", { name: "Save action" }).click();
  await expect(badge(action, "Follow-up")).toBeVisible();

  await requestResolved(page);
  await expect(page.locator(".zg-callout", { hasText: "This ticket cannot be resolved yet." })).toContainText(
    "follow-up open"
  );

  await action.getByRole("button", { name: "Mark follow-up done" }).click();
  await expect(action.getByRole("button", { name: "Mark follow-up done" })).toHaveCount(0);

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("The ticket has been updated.")).toBeVisible();
  await expect(statusBadge(page)).toHaveText("Resolved");

  await page.getByLabel("Status").selectOption("CLOSED");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("button", { name: "Yes, move to Closed" }).click();
  await expect(statusBadge(page)).toHaveText("Closed");
});

// E2E-08 / AC-17
test("two people save the same ticket: the second sees the stale warning and keeps their choice", async ({ browser }) => {
  const first = await browser.newPage();
  const second = await browser.newPage({ storageState: undefined });
  await signInAs(first, ACCOUNTS.staff.email, /Welcome back/);
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signInAs(other, ACCOUNTS.otherStaff.email, /Welcome back/);
  await second.close();

  await openTicket(first, shared);
  await openTicket(other, shared);

  await first.getByLabel("IT Priority").selectOption("URGENT");
  await first.getByRole("button", { name: "Save changes" }).click();
  await expect(first.getByText("The ticket has been updated.")).toBeVisible();

  await other.getByLabel("IT Priority").selectOption("LOW");
  await other.getByRole("button", { name: "Save changes" }).click();
  const warning = other.locator(".zg-callout-warning", { hasText: "This ticket was changed by someone else." });
  await expect(warning).toBeVisible();
  await expect(other.getByLabel("IT Priority")).toHaveValue("LOW");
  await other.screenshot({ path: `${SHOTS}/desktop-conflict.png`, fullPage: true });

  await warning.getByRole("button", { name: "Reload latest" }).click();
  await expect(other.getByLabel("IT Priority")).toHaveValue("URGENT");

  await first.close();
  await otherContext.close();
});

// E2E-09 / AC-22
test("the Requester's indication shows to IT Staff and leaves the status alone", async ({ page }) => {
  await signInAs(page, ACCOUNTS.requester.email, /Welcome back/);
  await page.goto(`/tickets/${indicated.id}`);
  await page.getByRole("button", { name: "The problem appears resolved" }).click();
  await page.getByRole("button", { name: "Yes, tell IT Staff" }).click();
  await expect(page.getByText("You told IT Staff that this problem appears resolved.")).toBeVisible();

  await page.getByRole("button", { name: "Logout" }).click();
  await signInAs(page, ACCOUNTS.staff.email, /Welcome back/);
  await openTicket(page, indicated);
  await expect(page.getByText("Requester says resolved")).toBeVisible();
  await expect(statusBadge(page)).toHaveText("Waiting for Requester");
});
