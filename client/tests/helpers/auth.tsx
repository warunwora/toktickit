import { vi } from "vitest";
import * as authApi from "../../src/api/auth.js";

// Lab 3: every screen lives behind an authenticated session, so component
// tests state who is signed in instead of writing a requester id to storage.

export const REQUESTER: authApi.AuthUser = {
  id: 1,
  name: "Napat Srisai",
  email: "napat.sri@kmutt.ac.th",
  role: "REQUESTER",
  mustChangePassword: false,
};

export const IT_STAFF: authApi.AuthUser = {
  id: 26,
  name: "Warin Chaiyaporn",
  email: "warin.cha@kmutt.ac.th",
  role: "IT_STAFF",
  mustChangePassword: false,
};

export const ADMINISTRATOR: authApi.AuthUser = {
  id: 30,
  name: "Anong Sukjai",
  email: "anong.suk@kmutt.ac.th",
  role: "ADMINISTRATOR",
  mustChangePassword: false,
};

export function signedInAs(user: authApi.AuthUser | null) {
  if (user === null) {
    return vi.spyOn(authApi, "getCurrentUser").mockRejectedValue(new Error("Not signed in"));
  }
  return vi.spyOn(authApi, "getCurrentUser").mockResolvedValue({ user });
}
