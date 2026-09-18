import { FieldError } from "./validation.js";
import { validatePasswordValue } from "./password.js";

// Administrator user input — docs/lab-03/specification.md BR-50, BR-56 and
// api-spec.md §7.2, §7.3.

export const NAME_MIN = 2;
export const NAME_MAX = 120;
export const EMAIL_MAX = 200;

export const ROLES = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"] as const;
export type RoleValue = (typeof ROLES)[number];

/**
 * Deliberately simple: one @, something either side, a dot in the domain. A
 * stricter pattern rejects addresses that are legal, and the address is never
 * used to send anything in Lab 3 (email delivery is out of scope).
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isRole(value: unknown): value is RoleValue {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

function trimmed(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

export function validateName(raw: unknown, errors: FieldError[]): string {
  const name = trimmed(raw);

  if (name === "") errors.push({ field: "name", message: "Full Name is required" });
  else if (name.length < NAME_MIN) {
    errors.push({ field: "name", message: `Full Name must be at least ${NAME_MIN} characters` });
  } else if (name.length > NAME_MAX) {
    errors.push({ field: "name", message: `Full Name must be ${NAME_MAX} characters or fewer` });
  }

  return name;
}

/** Stored lower-cased, so "A@x.com" and "a@x.com" are the same account (BR-49). */
export function validateEmail(raw: unknown, errors: FieldError[]): string {
  const email = trimmed(raw).toLowerCase();

  if (email === "") errors.push({ field: "email", message: "Email Address is required" });
  else if (email.length > EMAIL_MAX) {
    errors.push({ field: "email", message: `Email Address must be ${EMAIL_MAX} characters or fewer` });
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.push({ field: "email", message: "Enter a valid email address" });
  }

  return email;
}

export function validateRole(raw: unknown, errors: FieldError[]): RoleValue {
  if (!isRole(raw)) {
    errors.push({ field: "role", message: "Select one of Requester, IT Staff or Administrator" });
    return "REQUESTER";
  }
  return raw;
}

export interface CreateUserInput {
  name: string;
  email: string;
  role: RoleValue;
  isActive: boolean;
  initialPassword: string;
}

export interface CreateUserResult {
  errors: FieldError[];
  value?: CreateUserInput;
}

export function validateCreateUser(body: unknown): CreateUserResult {
  const input = (body ?? {}) as Record<string, unknown>;
  const errors: FieldError[] = [];

  const name = validateName(input.name, errors);
  const email = validateEmail(input.email, errors);
  const role = validateRole(input.role, errors);

  if (input.isActive !== undefined && typeof input.isActive !== "boolean") {
    errors.push({ field: "isActive", message: "Active must be true or false" });
  }

  errors.push(...validatePasswordValue(input.initialPassword, "initialPassword"));

  if (errors.length > 0) return { errors };

  return {
    errors,
    value: {
      name,
      email,
      role,
      // Default true: an account created inactive cannot do anything, so it is
      // the unusual case and must be asked for explicitly.
      isActive: input.isActive === undefined ? true : (input.isActive as boolean),
      initialPassword: input.initialPassword as string,
    },
  };
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: RoleValue;
  isActive?: boolean;
}

export interface UpdateUserResult {
  errors: FieldError[];
  /** Undefined when the body carried none of the four editable fields. */
  value?: UpdateUserInput;
}

/** A subset update: only the fields that were sent are validated (BR-55). */
export function validateUpdateUser(body: unknown): UpdateUserResult {
  const input = (body ?? {}) as Record<string, unknown>;
  const errors: FieldError[] = [];
  const value: UpdateUserInput = {};

  if (input.name !== undefined) value.name = validateName(input.name, errors);
  if (input.email !== undefined) value.email = validateEmail(input.email, errors);
  if (input.role !== undefined) value.role = validateRole(input.role, errors);

  if (input.isActive !== undefined) {
    if (typeof input.isActive !== "boolean") {
      errors.push({ field: "isActive", message: "Active must be true or false" });
    } else {
      value.isActive = input.isActive;
    }
  }

  if (errors.length > 0) return { errors };
  if (Object.keys(value).length === 0) return { errors };

  return { errors, value };
}
