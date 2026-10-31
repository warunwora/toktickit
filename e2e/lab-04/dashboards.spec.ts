import { test, expect, Page } from "@playwright/test";
import { ACCOUNTS, signIn, signInAs, signOut } from "../helpers/auth.js";

// E2E-10 … E2E-13 — docs/lab-04/tests.md §2.9.
// Every drill-down is followed by clicking the card's own View link, and the
// list it opens must show the total the card counted (AC-28).

async function metric(page: Page, label: string): Promise<number> {
  const card = page.getByRole("region", { name: label, exact: true });
  await expect(card.getByRole("link", { name: /^View / })).toBeVisible();
  return Number(await card.locator(".zg-metric-value").innerText());
}

/** "Showing 1 to 10 of 25 tickets" → 25; the queue's empty state → 0. */
async function queueTotal(page: Page): Promise<number> {
  const count = page.locator(".zg-result-count");
  await expect(count).toBeVisible();
  const text = await count.innerText();
  return text.startsWith("No tickets") ? 0 : Number(/of (\d+) tickets/.exec(text)![1]);
}

// E2E-10 / AC-34
test("each role signs in to its own dashboard with Dashboard first in the navigation", async ({ page }) => {
  const cases = [
    [ACCOUNTS.requester, "/dashboard", ["Dashboard", "My Tickets", "Create Ticket", "Account"]],
    [ACCOUNTS.staff, "/staff/dashboard", ["Dashboard", "Ticket Queue", "Account"]],
    [ACCOUNTS.administrator, "/staff/dashboard", ["Dashboard", "Ticket Queue", "Users", "Account"]],
  ] as const;

  for (const [account, path, nav] of cases) {
    await signIn(page, account.email);
    await expect(page.getByRole("heading", { name: `Welcome back, ${account.name.split(" ")[0]}` })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    const links = page.getByRole("navigation", { name: "Main" }).getByRole("link");
    await expect(links).toHaveText([...nav]);
    await expect(links.first()).toHaveAttribute("aria-current", "page");
    await signOut(page);
  }
});

// E2E-11 / AC-28
test("Unassigned and Owned by me open queues with the same totals", async ({ page }) => {
  await signInAs(page, ACCOUNTS.staff.email, /Welcome back/);

  for (const label of ["Unassigned", "Owned by me", "Urgent (active)"]) {
    await page.goto("/staff/dashboard");
    const value = await metric(page, label);
    await page.getByRole("region", { name: label, exact: true }).getByRole("link").click();
    await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
    expect(await queueTotal(page), label).toBe(value);
  }
});

// E2E-12 / AC-28
test("Waiting for me opens My Tickets with the same total", async ({ page }) => {
  // Chanya has a ticket Waiting for Requester in the seed, so the total is not 0.
  await signInAs(page, ACCOUNTS.otherRequester.email, /Welcome back/);
  const value = await metric(page, "Waiting for me");
  expect(value).toBeGreaterThan(0);

  await page.getByRole("region", { name: "Waiting for me" }).getByRole("link").click();
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
  await expect(page.getByLabel("Status")).toHaveValue("WAITING_FOR_REQUESTER");
  await expect(page.getByText(new RegExp(`Showing 1–${value} of ${value}$`))).toBeVisible();
});

// E2E-13 / AC-26
test("the Administrator's user counts match User Management filtered by role", async ({ page }) => {
  await signInAs(page, ACCOUNTS.administrator.email, /Welcome back/);
  const users = page.getByRole("region", { name: "Users" });
  await expect(users).toBeVisible();

  for (const [role, label] of [
    ["REQUESTER", "Requester"],
    ["IT_STAFF", "IT Staff"],
    ["ADMINISTRATOR", "Administrator"],
  ] as const) {
    await page.goto("/staff/dashboard");
    const line = page.getByRole("region", { name: "Users" }).getByRole("listitem").filter({ hasText: label }).first();
    const [, active, inactive] = /(\d+) active · (\d+) inactive/.exec(await line.innerText())!;

    await line.getByRole("link", { name: `View ${label} users` }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/users\\?role=${role}$`));
    await expect(page.getByLabel(/^Role/).first()).toHaveValue(role);
    const rows = page.getByRole("table").first().locator("tbody tr");
    await expect(rows).toHaveCount(Number(active) + Number(inactive));
    await expect(rows.filter({ hasText: "Inactive" })).toHaveCount(Number(inactive));
  }
});
