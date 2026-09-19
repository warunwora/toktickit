import { apiFetch } from "./client.js";
import { AuthUser, RoleName } from "./auth.js";

// Administrator user management — docs/lab-03/api-spec.md §7.
// No endpoint here ever returns password material, so `ManagedUser` has no
// field that could carry one.

export interface ManagedUser {
  id: number;
  name: string;
  email: string;
  role: RoleName;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface UserListQuery {
  search?: string;
  role?: RoleName | "";
}

export function listUsers(query: UserListQuery = {}): Promise<ManagedUser[]> {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.role) params.set("role", query.role);
  const suffix = params.toString();

  return apiFetch<{ users: ManagedUser[] }>(`/api/admin/users${suffix ? `?${suffix}` : ""}`).then(
    (body) => body.users
  );
}

export interface CreateUserPayload {
  name: string;
  email: string;
  role: RoleName;
  isActive: boolean;
  initialPassword: string;
}

export function createUser(payload: CreateUserPayload): Promise<ManagedUser> {
  return apiFetch<ManagedUser>("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export interface UpdateUserPayload {
  name?: string;
  email?: string;
  role?: RoleName;
  isActive?: boolean;
}

export function updateUser(id: number, payload: UpdateUserPayload): Promise<ManagedUser> {
  return apiFetch<ManagedUser>(`/api/admin/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** The user must change this at their next login, and their sessions end now. */
export function setInitialPassword(id: number, initialPassword: string): Promise<ManagedUser> {
  return apiFetch<ManagedUser>(`/api/admin/users/${id}/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initialPassword }),
  });
}

/** The signed-in Administrator may not deactivate their own account (BR-52). */
export function isSelf(user: AuthUser | null, managed: ManagedUser): boolean {
  return user?.id === managed.id;
}
