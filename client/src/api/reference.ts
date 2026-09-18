import { apiFetch } from "./client.js";

export interface ReferenceItem {
  id: number;
  name: string;
}

export function getCategories(): Promise<ReferenceItem[]> {
  return apiFetch<ReferenceItem[]>("/api/categories");
}

export function getRelatedSystems(): Promise<ReferenceItem[]> {
  return apiFetch<ReferenceItem[]>("/api/related-systems");
}
