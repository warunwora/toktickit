// One place that talks to the API, so Lab 3 can swap the Development Requester
// header for a real credential without touching any screen (BR-43).

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export const REQUESTER_STORAGE_KEY = "toktickit.requesterId";

export class ApiError extends Error {
  status: number;
  fields?: { field: string; message: string }[];

  constructor(status: number, message: string, fields?: { field: string; message: string }[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

export function getStoredRequesterId(): number | null {
  const raw = window.localStorage.getItem(REQUESTER_STORAGE_KEY);
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function storeRequesterId(id: number): void {
  window.localStorage.setItem(REQUESTER_STORAGE_KEY, String(id));
}

export function clearStoredRequesterId(): void {
  window.localStorage.removeItem(REQUESTER_STORAGE_KEY);
}

interface RequestOptions extends RequestInit {
  /** Send the selected Development Requester as X-Requester-Id (BR-07). */
  withRequester?: boolean;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { withRequester = false, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);

  if (withRequester) {
    const requesterId = getStoredRequesterId();
    if (requesterId !== null) finalHeaders.set("X-Requester-Id", String(requesterId));
  }

  const response = await fetch(`${API_URL}${path}`, { ...rest, headers: finalHeaders });

  if (!response.ok) {
    let message = "Something went wrong. Please try again.";
    let fields: { field: string; message: string }[] | undefined;
    try {
      const body = await response.json();
      if (typeof body?.error === "string") message = body.error;
      if (Array.isArray(body?.fields)) fields = body.fields;
    } catch {
      // A non-JSON error body is still a failure; keep the generic message.
    }
    throw new ApiError(response.status, message, fields);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Downloads need the identity header too, so a plain <a href> will not do. */
export async function apiFetchBlob(path: string): Promise<{ blob: Blob; filename: string | null }> {
  const headers = new Headers();
  const requesterId = getStoredRequesterId();
  if (requesterId !== null) headers.set("X-Requester-Id", String(requesterId));

  const response = await fetch(`${API_URL}${path}`, { headers });

  if (!response.ok) {
    let message = "Unable to download this file.";
    try {
      const body = await response.json();
      if (typeof body?.error === "string") message = body.error;
    } catch {
      // Keep the generic message.
    }
    throw new ApiError(response.status, message);
  }

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  return { blob: await response.blob(), filename: match ? match[1] : null };
}
