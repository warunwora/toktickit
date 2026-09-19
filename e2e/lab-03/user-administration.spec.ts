import { test, expect } from "@playwright/test";
import {
  ACCOUNTS,
  administratorApi,
  deactivateProvisioned,
  provisionUser,
  signIn,
  signInAs,
  signOut,
} from "../helpers/auth.js";

// E2E-12 … E2E-18 — docs/lab-03/tests.md §2.11.
// Every account this file touches is one it created, so the seeded
// demonstration users keep their roles and their activation state.

test.describe.configure({ mode: "serial" });

// Lower case throughout: the API stores every address lower-cased (BR-49).
const RUN = `e2e${Date.now()}`;
const created: number[] = [];

test.afterAll(async () => {
  if (created.length === 0) return;
  const api = await administratorApi();
  await deactivateProvisioned(api, created);
  await api.dispose();
});

/** The desktop table and the mobile cards both exist; Edit comes from the table. */
function editIn(page: import("@playwright/test").Page, name: string) {
  return page.getByRole("table").getByRole("button", { name: `Edit ${name}` });
}

// E2E-12 / AC-40
test("the Administrator lists, searches and filters users", async ({ page }) => {
  await signInAs(page, ACCOUNTS.administrator.email, /Ticket Queue/);
  await page.getByRole("link", { name: "Users" }).click();
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

  const table = page.getByRole("table");
  await expect(table.getByRole("row")).not.toHaveCount(1);
  await expect(table).toContainText(ACCOUNTS.administrator.email);

  await page.getByLabel("Search").fill(ACCOUNTS.staff.name);
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText(ACCOUNTS.staff.email);

  await page.getByLabel("Search").fill("");
  await page.getByLabel("Role").selectOption("ADMINISTRATOR");
  await expect(table).toContainText("Administrator");
  await expect(table).not.toContainText(ACCOUNTS.requester.email);

  await page.getByLabel("Search").fill(`no-such-person-${RUN}`);
  await expect(page.getByText("No users match this search.")).toBeVisible();
});

// E2E-13 / AC-42
test("a user created here signs in and is forced through the password change", async ({ page }) => {
  await signInAs(page, ACCOUNTS.administrator.email, /Ticket Queue/);
  await page.goto("/admin/users");

  const email = `created.${RUN}@toktickit.test`;
  await page.getByRole("button", { name: "＋ Create User" }).click();
  const panel = page.getByRole("region", { name: "Create New User" });

  await panel.getByLabel(/Full Name/).fill(`Created By E2E ${RUN}`);
  await panel.getByLabel(/Email Address/).fill(email);
  await panel.getByLabel(/^Role/).selectOption("IT_STAFF");
  await panel.getByLabel(/Initial Password/).fill("Start#2026");
  await panel.getByRole("button", { name: "Save User" }).click();

  await expect(page.getByText(/must change this password at their next login/)).toBeVisible();
  await expect(page.getByRole("table")).toContainText(email);

  await signOut(page);
  await signIn(page, email, "Start#2026");
  await expect(page.getByRole("heading", { name: "Change Your Password" })).toBeVisible();

  await page.getByLabel(/Current \(temporary\) password/).fill("Start#2026");
  await page.getByLabel(/^New password/).fill("Fresh#2026");
  await page.getByLabel(/Confirm new password/).fill("Fresh#2026");
  await page.getByRole("button", { name: "Continue" }).click();

  // IT Staff land on the queue, which is their role's screen.
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
});

// E2E-14 / AC-43
test("a duplicate email is reported on the email field", async ({ page }) => {
  await signInAs(page, ACCOUNTS.administrator.email, /Ticket Queue/);
  await page.goto("/admin/users");

  await page.getByRole("button", { name: "＋ Create User" }).click();
  const panel = page.getByRole("region", { name: "Create New User" });

  await panel.getByLabel(/Full Name/).fill("Duplicate Address");
  await panel.getByLabel(/Email Address/).fill(ACCOUNTS.staff.email);
  await panel.getByLabel(/Initial Password/).fill("Start#2026");
  await panel.getByRole("button", { name: "Save User" }).click();

  await expect(panel.getByText("That email address is already in use")).toBeVisible();
  await expect(panel.getByLabel(/Email Address/)).toHaveAttribute("aria-invalid", "true");
});

// E2E-15 / AC-44
test("the Administrator edits one account and deactivates another", async ({ page }) => {
  const api = await administratorApi();
  const target = await provisionUser(api, { name: `E2E Editable ${RUN}`, role: "REQUESTER" });
  const victim = await provisionUser(api, { name: `E2E Deactivatable ${RUN}`, role: "REQUESTER" });
  created.push(target.id, victim.id);
  await api.dispose();

  await signInAs(page, ACCOUNTS.administrator.email, /Ticket Queue/);
  await page.goto("/admin/users");

  await page.getByLabel("Search").fill(`E2E Editable ${RUN}`);
  await editIn(page, target.name).click();
  const panel = page.getByRole("region", { name: "Edit User" });

  await panel.getByLabel(/Full Name/).fill(`E2E Renamed ${RUN}`);
  await panel.getByLabel(/^Role/).selectOption("IT_STAFF");
  await panel.getByRole("button", { name: "Save User" }).click();
  await expect(page.getByText("User updated.")).toBeVisible();

  await page.getByLabel("Search").fill(`E2E Renamed ${RUN}`);
  await expect(page.getByRole("table")).toContainText("IT Staff");

  await page.getByLabel("Search").fill(`E2E Deactivatable ${RUN}`);
  await editIn(page, victim.name).click();
  await page.getByRole("region", { name: "Edit User" }).getByRole("button", { name: "Deactivate user" }).click();
  await page.getByRole("button", { name: "Yes, deactivate" }).click();

  await expect(page.getByText("User deactivated.")).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Inactive");
});

// E2E-16 / AC-45
test("the Administrator cannot deactivate their own account", async ({ page }) => {
  // A second Administrator exists, so the answer is the self-deactivation rule
  // rather than the last-Administrator rule.
  const api = await administratorApi();
  const peer = await provisionUser(api, { name: `E2E Peer Admin ${RUN}`, role: "ADMINISTRATOR" });
  created.push(peer.id);
  await api.dispose();

  await signInAs(page, ACCOUNTS.administrator.email, /Ticket Queue/);
  await page.goto("/admin/users");

  await page.getByLabel("Search").fill(ACCOUNTS.administrator.name);
  await editIn(page, ACCOUNTS.administrator.name).click();

  const panel = page.getByRole("region", { name: "Edit User" });
  await panel.getByRole("button", { name: "Deactivate user" }).click();
  await page.getByRole("button", { name: "Yes, deactivate" }).click();

  await expect(panel.getByText("You cannot deactivate your own account")).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Active");
});

// E2E-17 / AC-47
test("a new initial password is demanded at that user's next sign-in", async ({ page }) => {
  const api = await administratorApi();
  const target = await provisionUser(api, { name: `E2E Reset ${RUN}`, role: "REQUESTER" });
  created.push(target.id);
  // The account starts already-changed, so the reset is the only thing that can
  // put it back on the change-password screen.
  await api.post(`/api/admin/users/${target.id}/password`, { data: { initialPassword: target.password } });
  await api.dispose();

  await signInAs(page, ACCOUNTS.administrator.email, /Ticket Queue/);
  await page.goto("/admin/users");
  await page.getByLabel("Search").fill(`E2E Reset ${RUN}`);
  await editIn(page, target.name).click();

  const panel = page.getByRole("region", { name: "Edit User" });
  await panel.getByLabel(/New initial password/).fill("Reset#2026");
  await panel.getByRole("button", { name: "Set new initial password" }).click();
  await page.getByRole("button", { name: "Yes, set the password" }).click();
  await expect(panel.getByText(/New initial password set/)).toBeVisible();

  await signOut(page);
  await signIn(page, target.email, "Reset#2026");
  await expect(page.getByRole("heading", { name: "Change Your Password" })).toBeVisible();
});

// E2E-18 / AC-15
test("a Requester cannot reach a staff URL or an administration URL", async ({ page }) => {
  await signInAs(page, ACCOUNTS.requester.email, /My Tickets/);

  await page.goto("/staff/queue");
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();

  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "Users" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();

  // The backend refuses as well, not only the route guard (AC-15).
  const staffApi = await page.request.get("http://localhost:3000/api/staff/tickets");
  const adminApi = await page.request.get("http://localhost:3000/api/admin/users");
  expect(staffApi.status()).toBe(403);
  expect(adminApi.status()).toBe(403);
});
