import bcrypt from "bcryptjs";

// Password policy — docs/lab-03/specification.md BR-11 … BR-14.
// bcrypt with cost 10 (decision D-02): salted per password and deliberately
// slow, while still fast enough to run the whole API suite.

const BCRYPT_COST = 10;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export interface FieldError {
  field: string;
  message: string;
}

/** The four rules the Change Password screen shows as a live checklist. */
export interface PasswordRuleResult {
  length: boolean;
  upperAndLower: boolean;
  digit: boolean;
  special: boolean;
}

export function checkPasswordRules(value: string): PasswordRuleResult {
  return {
    length: value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH,
    upperAndLower: /[A-Z]/.test(value) && /[a-z]/.test(value),
    digit: /[0-9]/.test(value),
    special: /[^A-Za-z0-9]/.test(value),
  };
}

export function isStrongPassword(value: string): boolean {
  const rules = checkPasswordRules(value);
  return rules.length && rules.upperAndLower && rules.digit && rules.special;
}

/** Validates a password that is being SET, on the named field (BR-12). */
export function validatePasswordValue(value: unknown, field: string): FieldError[] {
  if (typeof value !== "string" || value.length === 0) {
    return [{ field, message: "Enter a password" }];
  }

  const rules = checkPasswordRules(value);
  const errors: FieldError[] = [];

  if (value.length < PASSWORD_MIN_LENGTH) {
    errors.push({ field, message: `Use at least ${PASSWORD_MIN_LENGTH} characters` });
  } else if (value.length > PASSWORD_MAX_LENGTH) {
    errors.push({ field, message: `Use at most ${PASSWORD_MAX_LENGTH} characters` });
  }
  if (!rules.upperAndLower) {
    errors.push({ field, message: "Include an upper case and a lower case letter" });
  }
  if (!rules.digit) {
    errors.push({ field, message: "Include a number" });
  }
  if (!rules.special) {
    errors.push({ field, message: "Include a special character" });
  }

  return errors;
}

export interface ChangePasswordInput {
  currentPassword?: unknown;
  newPassword?: unknown;
  confirmPassword?: unknown;
}

/** Validates a self-service password change (BR-12, BR-13, BR-14). */
export function validatePasswordChange(input: ChangePasswordInput): FieldError[] {
  const errors: FieldError[] = [];

  if (typeof input.currentPassword !== "string" || input.currentPassword.length === 0) {
    errors.push({ field: "currentPassword", message: "Enter your current password" });
  }

  errors.push(...validatePasswordValue(input.newPassword, "newPassword"));

  if (typeof input.confirmPassword !== "string" || input.confirmPassword.length === 0) {
    errors.push({ field: "confirmPassword", message: "Confirm your new password" });
  } else if (input.confirmPassword !== input.newPassword) {
    errors.push({ field: "confirmPassword", message: "The two passwords do not match" });
  }

  if (
    typeof input.newPassword === "string" &&
    typeof input.currentPassword === "string" &&
    input.newPassword.length > 0 &&
    input.newPassword === input.currentPassword
  ) {
    errors.push({ field: "newPassword", message: "Choose a password you have not used before" });
  }

  return errors;
}

export async function hashPassword(value: string): Promise<string> {
  return bcrypt.hash(value, BCRYPT_COST);
}

export async function verifyPassword(value: string, hash: string): Promise<boolean> {
  return bcrypt.compare(value, hash);
}
