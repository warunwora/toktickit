import { apiFetch } from "./client.js";

export interface ReferenceItem {
  id: number;
  name: string;
}

export interface Requester {
  id: number;
  name: string;
  email: string;
  department: string | null;
}

export function getCategories(): Promise<ReferenceItem[]> {
  return apiFetch<ReferenceItem[]>("/api/categories");
}

export function getRelatedSystems(): Promise<ReferenceItem[]> {
  return apiFetch<ReferenceItem[]>("/api/related-systems");
}

/** Active Development Requesters only — the inactive one never appears (BR-06). */
export function getRequesters(): Promise<Requester[]> {
  return apiFetch<Requester[]>("/api/requesters");
}
