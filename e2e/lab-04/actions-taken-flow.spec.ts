import { test, expect, Locator, Page } from "@playwright/test";
import { ACCOUNTS, signInAs } from "../helpers/auth.js";
import { CreatedTicket, apiAs, createTicket, setStatus } from "../helpers/api.js";

// E2E-01 … E2E-05 — docs/lab-04/tests.md §2.9.
// One ticket per run, created through the API, worked by two IT Staff members
// and then read by its Requester.

test.describe.configure({ mode: "serial" });

const RUN = `E2E${Date.now()}`;

/** A status badge inside a row; the row's detail list repeats some of the same words. */
const badge = (scope: Locator, text: string) => scope.locator(".zg-badge").filter({ hasText: new RegExp(`^${text}$`) });
let ticket: CreatedTicket;

const SHOTS = "artifacts/lab-04/screenshots/actions-taken";

async function openActions(page: Page) {
  await page.goto(`/staff/tickets/${ticket.id}?tab=actions`);
  await expect(page.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Actions Taken/ })).toHaveAttribute("aria-selected", "true");
  return page.getByRole("region", { name: "Actions Taken" });
}

const row = (page: Page, text: string) => page.getByTestId("action-row").filter({ hasText: text });

test.beforeAll(async () => {
  const requester = await apiAs(ACCOUNTS.requester.email);
  ticket = await createTicket(requester, `${RUN} label printer prints blank labels`);
  await requester.dispose();
  const staff = await apiAs(ACCOUNTS.staff.email);
  await setStatus(staff, ticket.id, "IN_PROGRESS");
  await staff.dispose();
});

// E2E-01 / AC-01
test("IT Staff adds an action for a colleague, starts it and completes it", async ({ page }) => {
  await signInAs(page, ACCOUNTS.staff.email, /Welcome back/);
  const section = await openActions(page);
  await expect(section.getByText("No actions recorded yet.")).toBeVisible();

  await section.getByRole("button", { name: "Add action" }).click();
  const form = page.getByRole("form", { name: "Add action" });
  await expect(form.getByLabel("Performed by")).toHaveValue(ACCOUNTS.staff.name);
  await form.getByLabel(/Action Description/).fill(`${RUN} replace the print head`);
  await form.getByLabel(/Assigned to/).selectOption({ label: ACCOUNTS.otherStaff.name });
  await form.getByLabel("Attachment Notes").fill("evidence.png");
  await page.screenshot({ path: `${SHOTS}/desktop-form.png`, fullPage: true });
  await form.getByRole("button", { name: "Save action" }).click();

  await expect(page.getByText("Action saved.")).toBeVisible();
  const action = row(page, "replace the print head");
  await expect(action).toContainText(ACCOUNTS.staff.name);
  await expect(action).toContainText(ACCOUNTS.otherStaff.name);
  await expect(badge(action, "Planned")).toBeVisible();

  await action.getByRole("button", { name: "Start" }).click();
  await expect(badge(action, "In Progress")).toBeVisible();

  await action.getByRole("button", { name: "Complete" }).click();
  const edit = page.getByRole("form", { name: "Edit action" });
  await edit.getByLabel(/^Result/).fill("A test label printed correctly.");
  await edit.getByRole("button", { name: "Save action" }).click();

  await expect(badge(action, "Completed")).toBeVisible();
  await expect(action).toContainText("A test label printed correctly.");
  await expect(action.getByRole("button", { name: "Edit" })).toHaveCount(0);
});

// E2E-02 / AC-11
test("a second IT Staff member records a different action on the same ticket", async ({ page }) => {
  await signInAs(page, ACCOUNTS.otherStaff.email, /Welcome back/);
  const section = await openActions(page);

  await section.getByRole("button", { name: "Add action" }).click();
  const form = page.getByRole("form", { name: "Add action" });
  await expect(form.getByLabel("Performed by")).toHaveValue(ACCOUNTS.otherStaff.name);
  await form.getByLabel(/Action Description/).fill(`${RUN} order a spare print head`);
  await form.getByRole("button", { name: "Save action" }).click();
  await expect(page.getByText("Action saved.")).toBeVisible();

  await expect(page.getByTestId("action-row")).toHaveCount(2);
  await expect(row(page, "replace the print head")).toContainText(ACCOUNTS.staff.name);
  await expect(row(page, "order a spare print head")).toContainText(ACCOUNTS.otherStaff.name);
  await page.screenshot({ path: `${SHOTS}/desktop-list.png`, fullPage: true });
});

// E2E-03 / AC-08
test("an action is cancelled with a reason through the dialog", async ({ page }) => {
  await signInAs(page, ACCOUNTS.otherStaff.email, /Welcome back/);
  await openActions(page);
  const action = row(page, "order a spare print head");

  await action.getByRole("button", { name: "Cancel" }).click();
  const dialog = page.getByRole("dialog", { name: "Cancel this action?" });
  await expect(dialog.getByLabel(/Reason/)).toBeFocused();
  await dialog.getByLabel(/Reason/).fill("A spare is already in the cabinet.");
  await dialog.getByRole("button", { name: "Cancel action" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(badge(action, "Cancelled")).toBeVisible();
  await expect(action).toContainText("A spare is already in the cabinet.");
  await expect(action.getByRole("button")).toHaveCount(0);
});

// E2E-04 / AC-04
test("the assignee list leaves out inactive users and the API refuses one", async ({ page }) => {
  await signInAs(page, ACCOUNTS.staff.email, /Welcome back/);
  const section = await openActions(page);
  await section.getByRole("button", { name: "Add action" }).click();

  const options = await page.getByRole("form", { name: "Add action" }).getByLabel(/Assigned to/).locator("option").allInnerTexts();
  expect(options).toContain(ACCOUNTS.otherStaff.name);
  expect(options).toContain("Anong Sukjai (Administrator)");
  expect(options).not.toContain("Ratchanon Duangdee");

  const staff = await apiAs(ACCOUNTS.staff.email);
  const admin = await apiAs(ACCOUNTS.administrator.email);
  const users = (await (await admin.get("/api/admin/users?search=ratchanon")).json()).users ?? [];
  const inactive = users.find((user: { isActive: boolean }) => !user.isActive);
  expect(inactive, "the seeded inactive IT Staff account").toBeTruthy();

  const refused = await staff.post(`/api/tickets/${ticket.id}/actions`, {
    data: { actionAt: new Date().toISOString(), description: `${RUN} refused`, assigneeId: inactive.id },
  });
  expect(refused.status()).toBe(400);
  expect((await refused.json()).fields[0].field).toBe("assigneeId");
  await staff.dispose();
  await admin.dispose();
});

// E2E-05 / AC-13
test("the Requester reads the actions on their ticket without any control or internal note", async ({ page }) => {
  await signInAs(page, ACCOUNTS.requester.email, /Welcome back/);
  await page.goto(`/tickets/${ticket.id}`);
  const section = page.getByRole("region", { name: "Actions Taken" });

  await expect(section.getByTestId("action-row")).toHaveCount(2);
  await expect(section).toContainText("A test label printed correctly.");
  await expect(section.getByRole("button")).toHaveCount(0);
  await expect(section.getByText("Not the ticket owner")).toHaveCount(0);
  await expect(page.getByText("Internal Notes")).toHaveCount(0);
});
