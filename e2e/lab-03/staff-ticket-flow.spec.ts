import { test, expect, Page } from "@playwright/test";
import { ACCOUNTS, signInAs, signOut } from "../helpers/auth.js";

// E2E-07 … E2E-11 — docs/lab-03/tests.md §2.11.
//
// The spec creates its own ticket through the Requester screens, so the
// workflow assertions never depend on which seeded ticket happens to be first,
// and a rerun never re-resolves a ticket a previous run already closed.

test.describe.configure({ mode: "serial" });

const RUN = `E2E${Date.now()}`;
const SUMMARY = `${RUN} projector in room 402 will not power on`;
const DESCRIPTION =
  "The ceiling projector in room 402 shows no power light, on two different wall sockets and after a reset.";

const COMMENT = "A technician is on the way with a replacement power module.";
const NOTE = `${RUN} internal: the spare module is in the second-floor cabinet.`;

let ticketNumber = "";

async function createTicket(page: Page) {
  // My Tickets offers the same destination in the shell nav and as a page
  // action; either will do, so the nav one is chosen explicitly.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Create Ticket" }).click();
  await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();

  await page.getByLabel(/^Category/).selectOption({ index: 1 });
  await page.getByLabel(/^Related System/).selectOption({ index: 1 });
  await page.getByLabel(/^Summary/).fill(SUMMARY);
  await page.getByLabel(/^Description/).fill(DESCRIPTION);
  await page.getByLabel(/^Requested Priority/).selectOption("HIGH");
  await page.getByRole("button", { name: /Submit Ticket/i }).click();

  // Create Ticket confirms in place and shows the backend-generated number.
  await expect(page.getByText(/your ticket has been created/i)).toBeVisible();
  return (await page.locator("strong", { hasText: /^TKT-/ }).innerText()).trim();
}

/** Opens this run's ticket from the queue by searching for its number. */
async function openInQueue(page: Page) {
  await page.goto("/staff/queue");
  await page.getByLabel("Search").fill(ticketNumber);
  // Below 768 px the table is replaced by cards; at this viewport only the
  // table link is in the accessibility tree.
  await expect(page.getByRole("link", { name: ticketNumber })).toHaveCount(1);
  await page.getByRole("link", { name: ticketNumber }).click();
  await expect(page.getByRole("heading", { name: ticketNumber })).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await signInAs(page, ACCOUNTS.requester.email, /My Tickets/);
  ticketNumber = await createTicket(page);
  await page.close();
});

// E2E-07 / AC-25
test("IT Staff finds work in the queue by search and by filter", async ({ page }) => {
  await signInAs(page, ACCOUNTS.staff.email, /Ticket Queue/);

  const count = page.getByRole("status").filter({ hasText: /Showing|No tickets/ });
  await expect(count).toBeVisible();

  await page.getByLabel("Search").fill(ticketNumber);
  await expect(page.getByRole("link", { name: ticketNumber })).toHaveCount(1);
  await expect(count).toContainText("Showing 1 to 1 of 1");

  // A filter that cannot match the New ticket empties the result.
  await page.getByLabel("Status").selectOption("CLOSED");
  await expect(page.getByText("No tickets match these filters.")).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(count).not.toContainText("Showing 1 to 1 of 1");
});

// E2E-08 / AC-32
test("IT Staff claims the ticket and the queue then shows them as the owner", async ({ page }) => {
  await signInAs(page, ACCOUNTS.staff.email, /Ticket Queue/);
  await openInQueue(page);

  await expect(page.getByLabel("Ticket Owner")).toHaveValue("");
  await page.getByRole("button", { name: "Claim this ticket" }).click();
  await expect(page.getByText("The ticket has been updated.")).toBeVisible();

  await page.goto("/staff/queue");
  await page.getByLabel("Search").fill(ticketNumber);
  const row = page.getByRole("row", { name: new RegExp(ticketNumber) });
  await expect(row).toContainText(ACCOUNTS.staff.name);
  await expect(row).not.toContainText("Unassigned");
});

// E2E-09 / AC-35
test("IT Staff sets IT Priority and walks the ticket to Resolved", async ({ page }) => {
  await signInAs(page, ACCOUNTS.staff.email, /Ticket Queue/);
  await openInQueue(page);

  await page.getByLabel("IT Priority").selectOption("URGENT");
  await page.getByLabel("Status").selectOption("IN_PROGRESS");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("The ticket has been updated.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("IT Priority")).toHaveValue("URGENT");
  await expect(page.getByLabel("Status")).toHaveValue("IN_PROGRESS");
  // The Requester's own priority is never touched (BR-30).
  await expect(page.getByLabel("Ticket information").getByText("High")).toBeVisible();

  await page.getByLabel("Status").selectOption("RESOLVED");
  await page.getByLabel(/Resolution Summary/).fill("Replaced the projector power module.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("The ticket has been updated.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Status")).toHaveValue("RESOLVED");
  await expect(page.getByLabel(/Resolution Summary/)).toHaveValue("Replaced the projector power module.");
  // Resolved only offers the two transitions the matrix permits.
  await expect(page.getByLabel("Status").locator("option")).toHaveText(["Resolved", "Closed", "Reopened"]);
});

// E2E-10 / AC-37
test("a Public Comment reaches the Requester and an Internal Note never does", async ({ page }) => {
  await signInAs(page, ACCOUNTS.staff.email, /Ticket Queue/);
  await openInQueue(page);

  const comments = page.getByRole("region", { name: "Public Comments" });
  await comments.getByLabel("Add a comment").fill(COMMENT);
  await comments.getByRole("button", { name: "Post Comment" }).click();
  await expect(comments.getByText(COMMENT)).toBeVisible();

  await page.getByRole("tab", { name: /Internal Notes/ }).click();
  const notes = page.getByRole("region", { name: "Internal Notes" });
  await expect(notes.getByText("Not visible to the Requester")).toBeVisible();
  await notes.getByLabel("Add an internal note").fill(NOTE);
  await notes.getByRole("button", { name: "Add Internal Note" }).click();
  await expect(notes.getByText(NOTE)).toBeVisible();

  await signOut(page);

  await signInAs(page, ACCOUNTS.requester.email, /My Tickets/);
  await page.getByRole("link", { name: ticketNumber }).first().click();
  await expect(page.getByRole("heading", { name: ticketNumber })).toBeVisible();

  await expect(page.getByRole("region", { name: "Public Comments" }).getByText(COMMENT)).toBeVisible();
  await expect(page.getByRole("region", { name: "Internal Notes" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /Internal Notes/ })).toHaveCount(0);
  // Not the note, and not one word of it, anywhere on the page (AC-14).
  await expect(page.locator("body")).not.toContainText(NOTE);
  await expect(page.locator("body")).not.toContainText(/internal note/i);
});

// E2E-11 / AC-23
test("the Requester's resolution indication reaches the queue without moving the status", async ({ page }) => {
  await signInAs(page, ACCOUNTS.requester.email, /My Tickets/);
  await page.getByRole("link", { name: ticketNumber }).first().click();

  await page.getByRole("button", { name: "The problem appears resolved" }).click();
  await page.getByRole("button", { name: "Yes, tell IT Staff" }).click();
  await expect(page.getByText("You told IT Staff that this problem appears resolved.")).toBeVisible();

  // The status badge is the staff member's to change, not the Requester's.
  await expect(page.getByText("Resolved", { exact: true }).first()).toBeVisible();

  await signOut(page);

  await signInAs(page, ACCOUNTS.staff.email, /Ticket Queue/);
  await page.getByLabel("Search").fill(ticketNumber);
  const row = page.getByRole("row", { name: new RegExp(ticketNumber) });
  await expect(row).toContainText("Requester says resolved");
});
