import { test, expect, Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { ACCOUNTS, signInAs } from "../helpers/auth.js";
import { apiAs } from "../helpers/api.js";

// RESP-01 … RESP-04 — docs/lab-04/tests.md §2.9, ui-spec.md §6, §7, §11.
// Also writes the Lab 4 screenshot evidence.

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800, cards: 4 },
  { name: "tablet", width: 820, height: 1180, cards: 2 },
  { name: "mobile", width: 390, height: 844, cards: 1 },
] as const;

const SHOTS = "artifacts/lab-04/screenshots";

async function shot(page: Page, folder: string, name: string) {
  await page.screenshot({ path: `${SHOTS}/${folder}/${name}.png`, fullPage: true });
}

/** No horizontal page scroll, and nothing wider than the viewport outside a scroller (AC-41). */
async function checkLayout(page: Page) {
  const report = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const scroll = document.documentElement.scrollWidth - limit;
    const insideScroller = (element: HTMLElement) => {
      for (let node = element.parentElement; node; node = node.parentElement) {
        const overflowX = getComputedStyle(node).overflowX;
        if (overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden") return true;
      }
      return false;
    };
    const offenders = Array.from(document.body.querySelectorAll<HTMLElement>("*"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;
        return Math.ceil(rect.right - limit) > 1 && !insideScroller(element);
      })
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`.slice(0, 80));
    return { scroll, offenders };
  });
  expect(report.scroll, "horizontal page scroll").toBeLessThanOrEqual(0);
  expect(report.offenders, "elements wider than the viewport").toEqual([]);
}

async function cardsPerRow(page: Page): Promise<number> {
  return page.evaluate(
    () => getComputedStyle(document.querySelector(".zg-metric-grid")!).gridTemplateColumns.split(" ").length
  );
}

let actionsTicketId = 0;

test.beforeAll(async () => {
  // The seeded ticket with several actions in every status (seed §7.6).
  const staff = await apiAs(ACCOUNTS.staff.email);
  const queue = await (await staff.get("/api/staff/tickets?search=Outlook%20freezes")).json();
  actionsTicketId = queue.tickets[0].id;
  await staff.dispose();
});

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    // RESP-01 / AC-41
    test("the three dashboards fit and lay their cards out for the width", async ({ page }) => {
      for (const [account, folder, name] of [
        [ACCOUNTS.requester, "requester-dashboard", viewport.name],
        [ACCOUNTS.staff, "staff-dashboard", `${viewport.name}-it-staff`],
        [ACCOUNTS.administrator, "staff-dashboard", `${viewport.name}-administrator`],
      ] as const) {
        await signInAs(page, account.email, /Welcome back/);
        await expect(page.getByRole("link", { name: /^View / }).first()).toBeVisible();
        expect(await cardsPerRow(page)).toBe(viewport.cards);
        await checkLayout(page);
        await shot(page, folder, name);
        await page.context().clearCookies();
      }
    });

    // RESP-02 / AC-41
    test("the Actions Taken list and form fit; the table becomes cards below 768 px", async ({ page }) => {
      await signInAs(page, ACCOUNTS.staff.email, /Welcome back/);
      await page.goto(`/staff/tickets/${actionsTicketId}?tab=actions`);
      const section = page.getByRole("region", { name: "Actions Taken" });
      await expect(section.getByTestId("action-row").first()).toBeVisible();

      const headerShown = await section.locator("thead").isVisible();
      expect(headerShown).toBe(viewport.width >= 768);
      await checkLayout(page);
      await section.scrollIntoViewIfNeeded();
      await shot(page, "actions-taken", `${viewport.name}-list`);

      await section.getByRole("button", { name: "Add action" }).click();
      await expect(page.getByRole("form", { name: "Add action" })).toBeVisible();
      await checkLayout(page);
      await shot(page, "actions-taken", `${viewport.name}-form`);
    });
  });
}

// RESP-03 / AC-38
test("every Lab 2–4 screen opens with no console error and no placeholder text", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // Signed out, the login screen asks the API who is signed in and is told
    // 401 — the expected answer, which the browser still logs as a failed
    // resource. Every other error, on every screen, fails this test.
    if (page.url().endsWith("/login") && /status of 401/.test(message.text())) return;
    problems.push(`${page.url()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`${page.url()}: ${error.message}`));

  async function visit(path: string, ready: RegExp | string) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: ready }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    const text = await page.locator("body").innerText();
    const placeholder = /\b(TODO|Lorem|Coming soon|undefined|NaN)\b|\[object Object\]/.exec(text);
    if (placeholder) problems.push(`${path}: placeholder "${placeholder[0]}"`);
  }

  await signInAs(page, ACCOUNTS.requester.email, /Welcome back/);
  const mine = await (await page.request.get("http://localhost:3000/api/tickets?pageSize=5")).json();
  for (const [path, heading] of [
    ["/dashboard", /Welcome back/],
    ["/tickets", "My Tickets"],
    ["/tickets?statusGroup=active", "My Tickets"],
    ["/tickets/new", "Create Ticket"],
    [`/tickets/${mine.items[0].id}`, mine.items[0].ticketNumber],
    ["/account", /account/i],
  ] as const) {
    await visit(path, heading);
  }
  await page.context().clearCookies();

  await signInAs(page, ACCOUNTS.administrator.email, /Welcome back/);
  for (const [path, heading] of [
    ["/staff/dashboard", /Welcome back/],
    ["/staff/queue", "Ticket Queue"],
    ["/staff/queue?ownerId=unassigned&statusGroup=active", "Ticket Queue"],
    [`/staff/tickets/${actionsTicketId}`, /^TKT-/],
    [`/staff/tickets/${actionsTicketId}?tab=actions`, /^TKT-/],
    ["/admin/users", "Users"],
    ["/admin/users?role=IT_STAFF", "Users"],
  ] as const) {
    await visit(path, heading);
  }

  expect(problems).toEqual([]);
});

// RESP-04 / AC-44
test("the screenshot evidence is written for every folder and width", () => {
  const expected = VIEWPORTS.flatMap(({ name }) => [
    `requester-dashboard/${name}.png`,
    `staff-dashboard/${name}-it-staff.png`,
    `staff-dashboard/${name}-administrator.png`,
    `actions-taken/${name}-list.png`,
    `actions-taken/${name}-form.png`,
  ]);
  expect(expected.filter((file) => !existsSync(`${SHOTS}/${file}`))).toEqual([]);
});
