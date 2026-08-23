import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  MAX_FILE_BYTES,
  buildStoredFilename,
  isAllowedType,
  storedFilePath,
  UPLOAD_DIR,
} from "../../src/lib/attachments.js";
import { validateRemovalReason } from "../../src/lib/validation.js";

// UNIT-06, UNIT-07 — docs/lab-02/tests.md §2.1 (BR-31, BR-32, BR-35, BR-37)

describe("attachment type and size rules", () => {
  it("accepts the four permitted types", () => {
    expect(isAllowedType("image/jpeg", "photo.jpg")).toBe(true);
    expect(isAllowedType("image/jpeg", "photo.jpeg")).toBe(true);
    expect(isAllowedType("image/png", "screenshot.PNG")).toBe(true);
    expect(isAllowedType("image/webp", "capture.webp")).toBe(true);
    expect(isAllowedType("application/pdf", "report.pdf")).toBe(true);
  });

  it("rejects a disallowed type", () => {
    expect(isAllowedType("application/x-msdownload", "setup.exe")).toBe(false);
    expect(isAllowedType("text/plain", "notes.txt")).toBe(false);
  });

  it("rejects a file whose extension does not match its MIME type", () => {
    expect(isAllowedType("application/pdf", "invoice.png")).toBe(false);
    expect(isAllowedType("image/png", "payload.exe")).toBe(false);
  });

  it("fixes the size limit at exactly 5 MB", () => {
    expect(MAX_FILE_BYTES).toBe(5 * 1024 * 1024);
    expect(MAX_FILE_BYTES).toBe(5_242_880);
  });
});

describe("safe stored filenames", () => {
  it("stores a UUID plus the validated extension, never the original name", () => {
    const stored = buildStoredFilename("application/pdf", "battery report.pdf");

    expect(stored).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(stored).not.toContain("battery");
    expect(stored).not.toContain(" ");
  });

  it("cannot be used to escape the upload directory", () => {
    const stored = buildStoredFilename("image/png", "../../etc/passwd.png");

    expect(stored).not.toContain("..");
    expect(stored).not.toContain("/");

    const resolved = path.resolve(storedFilePath("../../etc/passwd"));
    expect(resolved.startsWith(path.resolve(UPLOAD_DIR))).toBe(true);
  });

  it("gives every upload a distinct stored name", () => {
    const names = new Set(Array.from({ length: 20 }, () => buildStoredFilename("image/png", "same.png")));
    expect(names.size).toBe(20);
  });
});

describe("removal reason", () => {
  it("requires 3 to 200 trimmed characters", () => {
    expect(validateRemovalReason("ab").errors[0].field).toBe("reason");
    expect(validateRemovalReason("   ").errors[0].message).toMatch(/required/i);
    expect(validateRemovalReason("a".repeat(201)).errors[0].field).toBe("reason");
    expect(validateRemovalReason("  wrong file  ").value).toBe("wrong file");
  });
});
