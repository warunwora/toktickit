import { apiFetch } from "./client.js";

// Authentication — docs/lab-03/api-spec.md §3.

export type RoleName = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: RoleName;
  mustChangePassword: boolean;
  lastLoginAt?: string | null;
}

export const ROLE_LABEL: Record<RoleName, string> = {
  REQUESTER: "Requester",
  IT_STAFF: "IT Staff",
  ADMINISTRATOR: "Administrator",
};

/** Where each role starts after signing in (docs/lab-03/ui-spec.md §4). */
export const ROLE_HOME: Record<RoleName, string> = {
  REQUESTER: "/tickets",
  IT_STAFF: "/staff/queue",
  ADMINISTRATOR: "/staff/queue",
};

export function login(email: string, password: string): Promise<{ user: AuthUser }> {
  return apiFetch<{ user: AuthUser }>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export function logout(): Promise<void> {
  return apiFetch<void>("/api/auth/logout", { method: "POST" });
}

export function getCurrentUser(): Promise<{ user: AuthUser }> {
  return apiFetch<{ user: AuthUser }>("/api/auth/me");
}

export function changePassword(payload: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ user: AuthUser }> {
  return apiFetch<{ user: AuthUser }>("/api/auth/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// The same four rules the backend enforces (BR-12), shown as a live checklist
// so a person is never told "invalid" without being told what is missing.
export const PASSWORD_RULES = [
  { key: "length", label: "Be at least 8 characters", test: (v: string) => v.length >= 8 && v.length <= 128 },
  { key: "case", label: "Include upper and lower case letters", test: (v: string) => /[A-Z]/.test(v) && /[a-z]/.test(v) },
  { key: "digit", label: "Include a number", test: (v: string) => /[0-9]/.test(v) },
  { key: "special", label: "Include a special character", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
] as const;

export function passwordSatisfiesRules(value: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(value));
}
