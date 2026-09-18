import { describe, it, expect } from "vitest";
import {
  checkPasswordRules,
  hashPassword,
  isStrongPassword,
  validatePasswordChange,
  validatePasswordValue,
  verifyPassword,
} from "../../src/lib/password.js";

// U-01 … U-07 — docs/lab-03/tests.md §2.1

const VALID = "Kmutt#2026x";

function fieldsOf(errors: { field: string }[]) {
  return errors.map((e) => e.field);
}

describe("password policy (BR-12)", () => {
  // U-01
  it("rejects a password shorter than 8 characters", () => {
    const errors = validatePasswordValue("Ab1#c", "newPassword");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => /at least 8/i.test(e.message))).toBe(true);
  });

  // U-02
  it("rejects a password longer than 128 characters", () => {
    const errors = validatePasswordValue(`Ab1#${"x".repeat(130)}`, "newPassword");
    expect(errors.some((e) => /at most 128/i.test(e.message))).toBe(true);
  });

  // U-03
  it("rejects a password missing any one of the four character classes", () => {
    expect(validatePasswordValue("kmutt#2026x", "newPassword").length).toBeGreaterThan(0); // no upper
    expect(validatePasswordValue("KMUTT#2026X", "newPassword").length).toBeGreaterThan(0); // no lower
    expect(validatePasswordValue("KmuttAbc#xy", "newPassword").length).toBeGreaterThan(0); // no digit
    expect(validatePasswordValue("Kmutt2026xy", "newPassword").length).toBeGreaterThan(0); // no special
  });

  // U-04
  it("accepts a password that satisfies every rule", () => {
    expect(validatePasswordValue(VALID, "newPassword")).toEqual([]);
    expect(isStrongPassword(VALID)).toBe(true);
    expect(checkPasswordRules(VALID)).toEqual({
      length: true,
      upperAndLower: true,
      digit: true,
      special: true,
    });
  });

  it("reports the rules one by one, so the UI can show a live checklist", () => {
    expect(checkPasswordRules("abc")).toEqual({
      length: false,
      upperAndLower: false,
      digit: false,
      special: false,
    });
    expect(checkPasswordRules("Abcdefgh")).toMatchObject({ length: true, upperAndLower: true, digit: false });
  });

  it("rejects a missing password value", () => {
    expect(fieldsOf(validatePasswordValue(undefined, "initialPassword"))).toEqual(["initialPassword"]);
  });
});

describe("password change (BR-13, BR-14)", () => {
  // U-05
  it("rejects a confirmation that does not match", () => {
    const errors = validatePasswordChange({
      currentPassword: "ChangeMe!2026",
      newPassword: VALID,
      confirmPassword: "Kmutt#2026y",
    });
    expect(fieldsOf(errors)).toContain("confirmPassword");
  });

  // U-06
  it("rejects a new password equal to the current one", () => {
    const errors = validatePasswordChange({
      currentPassword: VALID,
      newPassword: VALID,
      confirmPassword: VALID,
    });
    expect(fieldsOf(errors)).toContain("newPassword");
  });

  it("requires the current password", () => {
    const errors = validatePasswordChange({ newPassword: VALID, confirmPassword: VALID });
    expect(fieldsOf(errors)).toContain("currentPassword");
  });

  it("accepts a valid change", () => {
    expect(
      validatePasswordChange({
        currentPassword: "ChangeMe!2026",
        newPassword: VALID,
        confirmPassword: VALID,
      })
    ).toEqual([]);
  });
});

describe("hashing (BR-11)", () => {
  // U-07
  it("hashes and verifies without ever storing the plaintext", async () => {
    const hash = await hashPassword(VALID);

    expect(hash).not.toBe(VALID);
    expect(hash).not.toContain(VALID);
    expect(hash.startsWith("$2")).toBe(true);
    expect(await verifyPassword(VALID, hash)).toBe(true);
    expect(await verifyPassword("Kmutt#2026y", hash)).toBe(false);
  });

  it("salts, so the same password hashes differently every time", async () => {
    const [a, b] = await Promise.all([hashPassword(VALID), hashPassword(VALID)]);
    expect(a).not.toBe(b);
    expect(await verifyPassword(VALID, a)).toBe(true);
    expect(await verifyPassword(VALID, b)).toBe(true);
  });
});
