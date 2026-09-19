import { test, expect } from "@playwright/test";
import {
  ACCOUNTS,
  PASSWORD,
  administratorApi,
  deactivateProvisioned,
  provisionUser,
  signIn,
  signInAs,
  signOut,
} from "../helpers/auth.js";

// E2E-01 … E2E-06 — docs/lab-03/tests.md §2.11.
// Runs against the real client, API and PostgreSQL.

const created: number[] = [];

test.afterAll(async () => {
  if (created.length === 0) return;
  const api = await administratorApi();
  await deactivateProvisioned(api, created);
  await api.dispose();
});

// E2E-01 / AC-01
test("an already-changed Requester signs in and reaches My Tickets", async ({ page }) => {
  await signInAs(page, ACCOUNTS.requester.email, /My Tickets/);

  await expect(page.getByText(ACCOUNTS.requester.name).first()).toBeVisible();
  await expect(page.getByText("Requester").first()).toBeVisible();
  await expect(page.getByRole("table").or(page.getByText(/no tickets/i)).first()).toBeVisible();
});

// E2E-02 / AC-02
test("a new account must change its initial password before anything else opens", async ({ page }) => {
  const api = await administratorApi();
  const user = await provisionUser(api, { name: "E2E Initial Password", role: "REQUESTER" });
  created.push(user.id);
  await api.dispose();

  await signIn(page, user.email, user.password);
  await expect(page.getByRole("heading", { name: "Change Your Password" })).toBeVisible();

  // The application stays closed while the initial password is in place.
  await page.goto("/tickets");
  await expect(page.getByRole("heading", { name: "Change Your Password" })).toBeVisible();

  await page.getByLabel(/Current \(temporary\) password/).fill(user.password);
  await page.getByLabel(/^New password/).fill("Fresh#2026");
  await page.getByLabel(/Confirm new password/).fill("Fresh#2026");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: /My Tickets/ })).toBeVisible();
});

// E2E-03 / AC-03
test("an invalid login shows one safe message and opens nothing", async ({ page }) => {
  await signIn(page, ACCOUNTS.requester.email, "WrongPassword#1");

  await expect(page.getByRole("alert")).toContainText(/invalid email or password/i);
  // The message must not say which half was wrong.
  await expect(page.getByRole("alert")).not.toContainText(/unknown|no such|not found/i);

  await page.goto("/tickets");
  await expect(page.getByRole("heading", { name: "Sign in to your account" })).toBeVisible();
});

// E2E-04 / AC-05
test("an inactive account is told the account is not active", async ({ page }) => {
  await signIn(page, ACCOUNTS.inactive.email, PASSWORD);

  await expect(page.getByRole("alert")).toContainText(/not active/i);
  await expect(page.getByRole("heading", { name: "Sign in to your account" })).toBeVisible();
});

// E2E-05 / AC-07
test("after logging out, a direct application URL returns to the login screen", async ({ page }) => {
  await signInAs(page, ACCOUNTS.staff.email, /Ticket Queue/);
  await signOut(page);

  await page.goto("/staff/queue");
  await expect(page.getByRole("heading", { name: "Sign in to your account" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toHaveCount(0);
});

// E2E-06 / AC-18
test("each role sees only its own navigation", async ({ page }) => {
  await signInAs(page, ACCOUNTS.requester.email, /My Tickets/);
  let nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "My Tickets" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Create Ticket" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Ticket Queue" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Users" })).toHaveCount(0);
  await signOut(page);

  await signInAs(page, ACCOUNTS.staff.email, /Ticket Queue/);
  nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Ticket Queue" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "My Tickets" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Users" })).toHaveCount(0);
  await signOut(page);

  await signInAs(page, ACCOUNTS.administrator.email, /Ticket Queue/);
  nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Ticket Queue" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Users" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "My Tickets" })).toHaveCount(0);
});
