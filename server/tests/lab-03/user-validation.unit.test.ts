import { describe, it, expect } from "vitest";
import {
  EMAIL_MAX,
  NAME_MAX,
  NAME_MIN,
  isRole,
  validateCreateUser,
  validateUpdateUser,
} from "../../src/lib/user-validation.js";

// U-17 — docs/lab-03/tests.md §2.1 (BR-50, BR-56).

const VALID = {
  name: "Alex Thompson",
  email: "alex.thompson@kmutt.ac.th",
  role: "IT_STAFF",
  isActive: true,
  initialPassword: "Start#2026",
};

function fields(errors: { field: string }[]): string[] {
  return errors.map((error) => error.field);
}

describe("isRole", () => {
  it("accepts exactly the three permitted roles", () => {
    for (const role of ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"]) expect(isRole(role)).toBe(true);
    for (const role of ["SUPERUSER", "it_staff", "", null, 1]) expect(isRole(role)).toBe(false);
  });
});

describe("validateCreateUser", () => {
  it("accepts a complete valid user and normalises it", () => {
    const { errors, value } = validateCreateUser({ ...VALID, name: "  Alex Thompson  ", email: "Alex.Thompson@KMUTT.ac.th" });

    expect(errors).toEqual([]);
    expect(value).toEqual({
      name: "Alex Thompson",
      email: "alex.thompson@kmutt.ac.th",
      role: "IT_STAFF",
      isActive: true,
      initialPassword: "Start#2026",
    });
  });

  it("defaults isActive to true and rejects a non-boolean", () => {
    const { value } = validateCreateUser({ ...VALID, isActive: undefined });
    expect(value?.isActive).toBe(true);

    expect(validateCreateUser({ ...VALID, isActive: false }).value?.isActive).toBe(false);
    expect(fields(validateCreateUser({ ...VALID, isActive: "yes" }).errors)).toContain("isActive");
  });

  it("enforces the name bounds", () => {
    expect(fields(validateCreateUser({ ...VALID, name: "" }).errors)).toContain("name");
    expect(fields(validateCreateUser({ ...VALID, name: "A" }).errors)).toContain("name");
    expect(validateCreateUser({ ...VALID, name: "A".repeat(NAME_MIN) }).errors).toEqual([]);
    expect(validateCreateUser({ ...VALID, name: "A".repeat(NAME_MAX) }).errors).toEqual([]);
    expect(fields(validateCreateUser({ ...VALID, name: "A".repeat(NAME_MAX + 1) }).errors)).toContain("name");
  });

  it("enforces email syntax and length", () => {
    for (const email of ["", "not-an-email", "missing@domain", "two@@at.com", "spaces in@mail.com"]) {
      expect(fields(validateCreateUser({ ...VALID, email }).errors), email).toContain("email");
    }

    const long = `${"a".repeat(EMAIL_MAX)}@kmutt.ac.th`;
    expect(fields(validateCreateUser({ ...VALID, email: long }).errors)).toContain("email");
  });

  it("rejects an unknown role", () => {
    expect(fields(validateCreateUser({ ...VALID, role: "SUPERUSER" }).errors)).toContain("role");
    expect(fields(validateCreateUser({ ...VALID, role: undefined }).errors)).toContain("role");
  });

  it("applies the password rules to the initial password", () => {
    expect(fields(validateCreateUser({ ...VALID, initialPassword: "short" }).errors)).toContain("initialPassword");
    expect(fields(validateCreateUser({ ...VALID, initialPassword: "alllowercase1!" }).errors)).toContain(
      "initialPassword"
    );
    expect(fields(validateCreateUser({ ...VALID, initialPassword: "NoDigits!!" }).errors)).toContain(
      "initialPassword"
    );
    expect(fields(validateCreateUser({ ...VALID, initialPassword: "NoSpecial1" }).errors)).toContain(
      "initialPassword"
    );
  });

  it("reports every broken field at once rather than the first", () => {
    const { errors } = validateCreateUser({ name: "", email: "bad", role: "X", initialPassword: "weak" });
    expect(new Set(fields(errors))).toEqual(new Set(["name", "email", "role", "initialPassword"]));
  });
});

describe("validateUpdateUser", () => {
  it("validates only the fields that were sent", () => {
    const { errors, value } = validateUpdateUser({ name: "New Name" });
    expect(errors).toEqual([]);
    expect(value).toEqual({ name: "New Name" });
  });

  it("returns no value for a body with none of the editable fields", () => {
    expect(validateUpdateUser({}).value).toBeUndefined();
    expect(validateUpdateUser({ password: "Sneaky#2026" }).value).toBeUndefined();
    expect(validateUpdateUser({}).errors).toEqual([]);
  });

  it("never carries a password through", () => {
    const { value } = validateUpdateUser({ name: "New Name", passwordHash: "x", initialPassword: "Start#2026" });
    expect(value).toEqual({ name: "New Name" });
  });

  it("lower-cases an updated email and rejects an invalid one", () => {
    expect(validateUpdateUser({ email: "NEW@Kmutt.AC.TH" }).value?.email).toBe("new@kmutt.ac.th");
    expect(fields(validateUpdateUser({ email: "nope" }).errors)).toContain("email");
  });

  it("accepts a deactivation and an activation", () => {
    expect(validateUpdateUser({ isActive: false }).value).toEqual({ isActive: false });
    expect(validateUpdateUser({ isActive: true }).value).toEqual({ isActive: true });
  });
});
