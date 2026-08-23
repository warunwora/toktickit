import { useEffect, useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { getCategories, getRelatedSystems, ReferenceItem } from "../api/reference.js";
import { createTicket, Priority, Ticket } from "../api/tickets.js";
import { useRequester } from "../context/RequesterContext.js";

// Create Ticket — docs/lab-02/ui-spec.md §7.2, api-spec.md §3.1.

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const SUMMARY_MIN = 10;
const SUMMARY_MAX = 120;
const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 4000;

type ReferenceState = "loading" | "ready" | "failed";

interface FormValues {
  categoryId: string;
  relatedSystemId: string;
  requestedPriority: string;
  summary: string;
  description: string;
}

const EMPTY_FORM: FormValues = {
  categoryId: "",
  relatedSystemId: "",
  requestedPriority: "",
  summary: "",
  description: "",
};

// The frontend mirrors the backend rules for convenience; the backend remains
// the authority and its field errors are merged in on failure (BR-17).
function validate(values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!values.categoryId) errors.categoryId = "Category is required";
  if (!values.relatedSystemId) errors.relatedSystemId = "Related System is required";
  if (!values.requestedPriority) errors.requestedPriority = "Requested Priority is required";

  const summary = values.summary.trim();
  if (summary === "") errors.summary = "Summary is required";
  else if (summary.length < SUMMARY_MIN) errors.summary = `Summary must be at least ${SUMMARY_MIN} characters`;
  else if (summary.length > SUMMARY_MAX) errors.summary = `Summary must be ${SUMMARY_MAX} characters or fewer`;

  const description = values.description.trim();
  if (description === "") errors.description = "Description is required";
  else if (description.length < DESCRIPTION_MIN)
    errors.description = `Description must be at least ${DESCRIPTION_MIN} characters`;
  else if (description.length > DESCRIPTION_MAX)
    errors.description = `Description must be ${DESCRIPTION_MAX} characters or fewer`;

  return errors;
}

export default function CreateTicket() {
  const { requester } = useRequester();

  const [referenceState, setReferenceState] = useState<ReferenceState>("loading");
  const [categories, setCategories] = useState<ReferenceItem[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<ReferenceItem[]>([]);
  const [referenceToken, setReferenceToken] = useState(0);

  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<Ticket | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReferenceState("loading");

    Promise.all([getCategories(), getRelatedSystems()])
      .then(([categoryList, relatedSystemList]) => {
        if (cancelled) return;
        setCategories(categoryList);
        setRelatedSystems(relatedSystemList);
        setReferenceState("ready");
      })
      .catch(() => {
        if (!cancelled) setReferenceState("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [referenceToken]);

  function update(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);

    const clientErrors = validate(values);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return; // AC-09 — no request is sent while the form is invalid.
    }

    setSubmitting(true);
    try {
      const ticket = await createTicket({
        categoryId: Number(values.categoryId),
        relatedSystemId: Number(values.relatedSystemId),
        requestedPriority: values.requestedPriority as Priority,
        summary: values.summary.trim(),
        description: values.description.trim(),
      });
      setCreated(ticket);
      setErrors({});
    } catch (error) {
      // BR-20 / AC-12 — never clear the form on failure.
      if (error instanceof ApiError) {
        if (error.fields?.length) {
          setErrors(Object.fromEntries(error.fields.map((f) => [f.field, f.message])));
        }
        setSubmitError(error.message);
      } else {
        setSubmitError("Unable to reach TokTickIT API. Your ticket has not been submitted.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function startAnother() {
    setCreated(null);
    setValues(EMPTY_FORM);
    setErrors({});
    setSubmitError(null);
  }

  function messageFor(field: keyof FormValues) {
    const message = errors[field];
    if (!message) return null;
    return (
      <span className="zg-message zg-message-error" id={`${field}-error`}>
        {message}
      </span>
    );
  }

  function fieldProps(field: keyof FormValues) {
    return {
      id: field,
      value: values[field],
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": errors[field] ? `${field}-error` : undefined,
      "aria-required": true as const,
      required: true,
    };
  }

  if (created) {
    return (
      <main className="zg-page">
        <h1 className="zg-page-title">Create Ticket</h1>
        <div className="zg-card">
          <div className="zg-callout zg-callout-success" role="status">
            <p className="mb-1">Your ticket has been created.</p>
            <p className="mb-0">
              Ticket Number: <strong>{created.ticketNumber}</strong>
            </p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <Link className="zg-btn zg-btn-primary" to={`/tickets/${created.id}`}>
              View Ticket
            </Link>
            <button type="button" className="zg-btn zg-btn-secondary" onClick={startAnother}>
              Create Another
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="zg-page">
      <h1 className="zg-page-title">Create Ticket</h1>

      <form className="zg-card" onSubmit={handleSubmit} noValidate>
        {submitError && (
          <div className="zg-callout zg-callout-error" role="alert">
            {submitError}
          </div>
        )}

        {referenceState === "failed" && (
          <div className="zg-callout zg-callout-error" role="alert">
            <p className="mb-2">Unable to load Categories and Related Systems.</p>
            <button
              type="button"
              className="zg-btn zg-btn-secondary"
              onClick={() => setReferenceToken((t) => t + 1)}
            >
              Retry
            </button>
          </div>
        )}

        {/* System-generated values, read-only (BR-04) */}
        <section className="row g-3 mb-2">
          <div className="col-12 col-lg-4 zg-field">
            <label className="zg-label" htmlFor="ticketNumber">
              Ticket Number
            </label>
            <input
              id="ticketNumber"
              className="zg-input zg-readonly"
              readOnly
              aria-readonly="true"
              value="Will be generated on submit"
            />
          </div>

          <div className="col-12 col-lg-4 zg-field">
            <label className="zg-label" htmlFor="ticketDate">
              Ticket Date
            </label>
            <input
              id="ticketDate"
              className="zg-input zg-readonly"
              readOnly
              aria-readonly="true"
              value={new Date().toLocaleDateString()}
            />
          </div>

          <div className="col-12 col-lg-4 zg-field">
            <label className="zg-label" htmlFor="requesterName">
              Requester
            </label>
            <input
              id="requesterName"
              className="zg-input zg-readonly"
              readOnly
              aria-readonly="true"
              value={requester?.name ?? ""}
            />
          </div>
        </section>

        {/* Classification */}
        <section className="row g-3">
          <div className="col-12 col-lg-4 zg-field">
            <label className="zg-label" htmlFor="categoryId">
              Category
              <span className="zg-required" aria-hidden="true">
                *
              </span>
            </label>
            <select
              {...fieldProps("categoryId")}
              className={errors.categoryId ? "zg-select zg-invalid" : "zg-select"}
              disabled={referenceState !== "ready"}
              onChange={(event) => update("categoryId", event.target.value)}
            >
              <option value="">
                {referenceState === "loading" ? "Loading…" : "Select a category…"}
              </option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {messageFor("categoryId")}
          </div>

          <div className="col-12 col-lg-4 zg-field">
            <label className="zg-label" htmlFor="relatedSystemId">
              Related System
              <span className="zg-required" aria-hidden="true">
                *
              </span>
            </label>
            <select
              {...fieldProps("relatedSystemId")}
              className={errors.relatedSystemId ? "zg-select zg-invalid" : "zg-select"}
              disabled={referenceState !== "ready"}
              onChange={(event) => update("relatedSystemId", event.target.value)}
            >
              <option value="">
                {referenceState === "loading" ? "Loading…" : "Select a related system…"}
              </option>
              {relatedSystems.map((system) => (
                <option key={system.id} value={system.id}>
                  {system.name}
                </option>
              ))}
            </select>
            {messageFor("relatedSystemId")}
          </div>

          <div className="col-12 col-lg-4 zg-field">
            <label className="zg-label" htmlFor="requestedPriority">
              Requested Priority
              <span className="zg-required" aria-hidden="true">
                *
              </span>
            </label>
            <select
              {...fieldProps("requestedPriority")}
              className={errors.requestedPriority ? "zg-select zg-invalid" : "zg-select"}
              onChange={(event) => update("requestedPriority", event.target.value)}
            >
              <option value="">Select a priority…</option>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority.charAt(0) + priority.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
            {messageFor("requestedPriority")}
          </div>
        </section>

        {/* Content */}
        <div className="zg-field">
          <label className="zg-label" htmlFor="summary">
            Summary
            <span className="zg-required" aria-hidden="true">
              *
            </span>
          </label>
          <input
            {...fieldProps("summary")}
            className={errors.summary ? "zg-input zg-invalid" : "zg-input"}
            maxLength={SUMMARY_MAX}
            placeholder="One line describing the problem"
            onChange={(event) => update("summary", event.target.value)}
          />
          {messageFor("summary")}
          <span className="zg-muted">
            {values.summary.trim().length}/{SUMMARY_MAX}
          </span>
        </div>

        <div className="zg-field">
          <label className="zg-label" htmlFor="description">
            Description
            <span className="zg-required" aria-hidden="true">
              *
            </span>
          </label>
          <textarea
            {...fieldProps("description")}
            className={errors.description ? "zg-textarea zg-invalid" : "zg-textarea"}
            rows={5}
            maxLength={DESCRIPTION_MAX}
            placeholder="What happened, when it started, and what you already tried"
            onChange={(event) => update("description", event.target.value)}
          />
          {messageFor("description")}
          <span className="zg-muted">
            {values.description.trim().length}/{DESCRIPTION_MAX}
          </span>
        </div>

        <div className="zg-callout zg-callout-info" role="note">
          Attachments can be added on the ticket after it is created.
        </div>

        <div className="d-flex flex-wrap gap-2">
          <button type="submit" className="zg-btn zg-btn-primary" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit Ticket"}
          </button>
          <Link className="zg-btn zg-btn-secondary" to="/tickets">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
