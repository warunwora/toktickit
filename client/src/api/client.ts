// One place that talks to the API. Lab 3 replaced the Development Requester
// header with the session cookie, which the browser attaches itself as long as
// every request opts into credentials (docs/lab-03/api-spec.md §1.1).

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  status: number;
  code?: string;
  fields?: { field: string; message: string }[];

  constructor(
    status: number,
    message: string,
    options: { code?: string; fields?: { field: string; message: string }[] } = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = options.code;
    this.fields = options.fields;
  }
}

/**
 * Called whenever the API answers 401, so the session that the application
 * believes in cannot outlive the session the server holds (AC-07).
 */
type UnauthorizedHandler = () => void;

let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

async function readError(response: Response, fallback: string): Promise<ApiError> {
  let message = fallback;
  let code: string | undefined;
  let fields: { field: string; message: string }[] | undefined;

  try {
    const body = await response.json();
    if (typeof body?.error === "string") message = body.error;
    if (typeof body?.code === "string") code = body.code;
    if (Array.isArray(body?.fields)) fields = body.fields;
  } catch {
    // A non-JSON error body is still a failure; keep the generic message.
  }

  return new ApiError(response.status, message, { code, fields });
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...options, credentials: "include" });

  if (!response.ok) {
    if (response.status === 401) onUnauthorized?.();
    throw await readError(response, "Something went wrong. Please try again.");
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Downloads carry the session cookie too, so a plain <a href> will not do. */
export async function apiFetchBlob(path: string): Promise<{ blob: Blob; filename: string | null }> {
  const response = await fetch(`${API_URL}${path}`, { credentials: "include" });

  if (!response.ok) {
    if (response.status === 401) onUnauthorized?.();
    throw await readError(response, "Unable to download this file.");
  }

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  return { blob: await response.blob(), filename: match ? match[1] : null };
}
