import { apiFetch, apiFetchBlob } from "./client.js";

// Attachment rules mirrored from the backend (BR-31 … BR-33); the backend
// remains the authority and re-checks every one of them.
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ACTIVE_ATTACHMENTS = 5;
export const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
export const ALLOWED_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf";
export const ATTACHMENT_RULES_TEXT = "JPG, PNG, WEBP or PDF · max 5 MB each · up to 5 active files";

export interface Attachment {
  id: number;
  ticketId: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: { id: number; name: string };
  state: "ACTIVE" | "REMOVED";
  removedAt?: string;
  removalReason?: string;
  removedBy?: { id: number; name: string } | null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Returns the reason a file is not acceptable, or null when it is fine. */
export function checkFile(file: File): string | null {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return `${file.name}: only JPG, PNG, WEBP and PDF files are allowed`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `${file.name}: each file must be 5 MB or smaller`;
  }
  return null;
}

export function listAttachments(ticketId: number): Promise<Attachment[]> {
  return apiFetch<Attachment[]>(`/api/tickets/${ticketId}/attachments`, { withRequester: true });
}

export function uploadAttachment(ticketId: number, file: File): Promise<Attachment> {
  const body = new FormData();
  body.append("file", file);
  // No Content-Type header: the browser adds the multipart boundary itself.
  return apiFetch<Attachment>(`/api/tickets/${ticketId}/attachments`, {
    method: "POST",
    withRequester: true,
    body,
  });
}

export function removeAttachment(attachmentId: number, reason: string): Promise<Attachment> {
  return apiFetch<Attachment>(`/api/attachments/${attachmentId}/remove`, {
    method: "PATCH",
    withRequester: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

/** Fetches the bytes with the identity header, then hands them to the browser. */
export async function downloadAttachment(attachment: Attachment): Promise<void> {
  const { blob, filename } = await apiFetchBlob(`/api/attachments/${attachment.id}/download`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename ?? attachment.originalFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
