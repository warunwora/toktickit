import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Attachment rules — docs/lab-02/specification.md §5 (BR-31 … BR-35).

export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB (BR-32)
export const MAX_ACTIVE_ATTACHMENTS = 5; // per ticket (BR-33)

/** Allowed MIME type -> the extensions that may carry it (BR-31). */
export const ALLOWED_TYPES: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
};

export const ALLOWED_LABEL = "Only JPG, PNG, WEBP and PDF files are allowed";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Files live outside the web root and are git-ignored (BR-35, D-04). */
export const UPLOAD_DIR = path.join(serverRoot, "uploads");

export function isAllowedType(mimeType: string, originalFilename: string): boolean {
  const extensions = ALLOWED_TYPES[mimeType];
  if (!extensions) return false;
  const extension = path.extname(originalFilename).toLowerCase();
  return extensions.includes(extension);
}

/**
 * Server-generated storage name: a UUID plus the validated extension (BR-35).
 * The original filename is never used as a path, so traversal and collisions
 * are impossible.
 */
export function buildStoredFilename(mimeType: string, originalFilename: string): string {
  const extension = path.extname(originalFilename).toLowerCase();
  const allowed = ALLOWED_TYPES[mimeType] ?? [];
  const safeExtension = allowed.includes(extension) ? extension : (allowed[0] ?? "");
  return `${randomUUID()}${safeExtension}`;
}

export function storedFilePath(storedFilename: string): string {
  // basename() strips any path element that could have crept in.
  return path.join(UPLOAD_DIR, path.basename(storedFilename));
}
