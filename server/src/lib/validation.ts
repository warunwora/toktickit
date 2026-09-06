// Backend validation for ticket input (BR-15, BR-16, BR-17).
// The frontend mirrors these rules for convenience but never replaces them.

export const SUMMARY_MIN = 10;
export const SUMMARY_MAX = 120;
export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 4000;

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type PriorityValue = (typeof PRIORITIES)[number];

export interface FieldError {
  field: string;
  message: string;
}

export interface CreateTicketInput {
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: PriorityValue;
}

export interface ValidationResult {
  errors: FieldError[];
  value?: CreateTicketInput;
}

function asTrimmedString(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function validateId(raw: unknown, field: string, label: string, errors: FieldError[]): number {
  const id = Number(raw);
  if (raw === undefined || raw === null || raw === "" || !Number.isInteger(id) || id <= 0) {
    errors.push({ field, message: `${label} is required` });
    return 0;
  }
  return id;
}

function validateText(
  raw: unknown,
  field: string,
  label: string,
  min: number,
  max: number,
  errors: FieldError[]
): string {
  const value = asTrimmedString(raw);

  if (value === "") {
    errors.push({ field, message: `${label} is required` });
  } else if (value.length < min) {
    errors.push({ field, message: `${label} must be at least ${min} characters` });
  } else if (value.length > max) {
    errors.push({ field, message: `${label} must be ${max} characters or fewer` });
  }

  return value;
}

export function validateCreateTicket(body: unknown): ValidationResult {
  const errors: FieldError[] = [];
  const input = (body ?? {}) as Record<string, unknown>;

  const categoryId = validateId(input.categoryId, "categoryId", "Category", errors);
  const relatedSystemId = validateId(input.relatedSystemId, "relatedSystemId", "Related System", errors);
  const summary = validateText(input.summary, "summary", "Summary", SUMMARY_MIN, SUMMARY_MAX, errors);
  const description = validateText(
    input.description,
    "description",
    "Description",
    DESCRIPTION_MIN,
    DESCRIPTION_MAX,
    errors
  );

  const priority = asTrimmedString(input.requestedPriority);
  if (priority === "") {
    errors.push({ field: "requestedPriority", message: "Requested Priority is required" });
  } else if (!PRIORITIES.includes(priority as PriorityValue)) {
    errors.push({
      field: "requestedPriority",
      message: `Requested Priority must be one of ${PRIORITIES.join(", ")}`,
    });
  }

  if (errors.length > 0) return { errors };

  return {
    errors,
    value: {
      categoryId,
      relatedSystemId,
      summary,
      description,
      requestedPriority: priority as PriorityValue,
    },
  };
}

// BR-37 — an attachment may only be removed with a stated reason.
export function validateRemovalReason(raw: unknown): { errors: FieldError[]; value?: string } {
  const errors: FieldError[] = [];
  const value = validateText(raw, "reason", "Reason", 3, 200, errors);
  return errors.length > 0 ? { errors } : { errors, value };
}
