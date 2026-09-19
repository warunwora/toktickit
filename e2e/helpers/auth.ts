import { APIRequestContext, Page, expect, request } from "@playwright/test";

// Shared sign-in helpers. Lab 3 replaced the Development Requester selector
// with a real login, so every end-to-end spec — including the Lab 2 ones kept
// as regression evidence (BR-62) — starts here.

export const API_URL = "http://localhost:3000";

/** The seeded local-development password, documented in the README. */
export const PASSWORD = "ChangeMe!2026";

export const ACCOUNTS = {
  requester: { email: "napat.sri@kmutt.ac.th", name: "Napat Srisai" },
  otherRequester: { email: "chanya.pho@kmutt.ac.th", name: "Chanya Pholrat" },
  staff: { email: "warin.cha@kmutt.ac.th", name: "Warin Chaiyaporn" },
  otherStaff: { email: "pimchanok.rat@kmutt.ac.th", name: "Pimchanok Rattana" },
  administrator: { email: "anong.suk@kmutt.ac.th", name: "Anong Sukjai" },
  inactive: { email: "anan.tep@kmutt.ac.th", name: "Anan Tepsiri" },
} as const;

export async function signIn(page: Page, email: string, password: string = PASSWORD): Promise<void> {
  await page.goto("/login");
  // The shared PasswordField appends a required marker to its label, so the
  // accessible name is "Password *" rather than "Password".
  await page.getByLabel(/Email address/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
}

/** Signs in and waits for the role's landing screen to be on screen. */
export async function signInAs(page: Page, email: string, landing: RegExp): Promise<void> {
  await signIn(page, email);
  await expect(page.getByRole("heading", { name: landing })).toBeVisible();
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to your account" })).toBeVisible();
}

/**
 * An API context signed in as the Administrator, for provisioning the throwaway
 * accounts a spec needs. Creating them through the UI would make every other
 * assertion depend on the create form still working.
 */
export async function administratorApi(): Promise<APIRequestContext> {
  const context = await request.newContext({ baseURL: API_URL });
  const response = await context.post("/api/auth/login", {
    data: { email: ACCOUNTS.administrator.email, password: PASSWORD },
  });
  expect(response.status(), "the Administrator must be able to sign in").toBe(200);
  return context;
}

export interface ProvisionedUser {
  id: number;
  name: string;
  email: string;
  password: string;
}

/** Creates a user whose initial password still has to be changed (BR-51). */
export async function provisionUser(
  api: APIRequestContext,
  options: { name: string; role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR"; password?: string }
): Promise<ProvisionedUser> {
  const password = options.password ?? "Start#2026";
  const email = `e2e.${Date.now()}.${Math.floor(Math.random() * 10_000)}@toktickit.test`;

  const response = await api.post("/api/admin/users", {
    data: { name: options.name, email, role: options.role, isActive: true, initialPassword: password },
  });

  expect(response.status(), await response.text()).toBe(201);
  const body = await response.json();
  return { id: body.id, name: body.name, email: body.email, password };
}

/** Removes the accounts a spec created, so a rerun starts from the seed again. */
export async function deactivateProvisioned(api: APIRequestContext, ids: number[]): Promise<void> {
  for (const id of ids) {
    await api.patch(`/api/admin/users/${id}`, { data: { isActive: false } });
  }
}
