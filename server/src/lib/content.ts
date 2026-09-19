import { FieldError } from "./validation.js";

// Public Comment and Internal Note bodies share one rule (BR-45), so they share
// one validator: the two threads must never diverge on what counts as content.

export const BODY_MIN = 1;
export const BODY_MAX = 2000;

export interface BodyResult {
  errors: FieldError[];
  value?: string;
}

/**
 * `label` names the thread in the message ("Comment", "Internal Note"), so the
 * person is told which composer was rejected when both are on screen.
 */
export function validateEntryBody(raw: unknown, label = "Comment"): BodyResult {
  const value = typeof raw === "string" ? raw.trim() : "";

  if (value.length < BODY_MIN) {
    return { errors: [{ field: "body", message: `${label} is required` }] };
  }

  if (value.length > BODY_MAX) {
    return { errors: [{ field: "body", message: `${label} must be ${BODY_MAX} characters or fewer` }] };
  }

  return { errors: [], value };
}
