import { FormEvent, useId, useState } from "react";
import { ApiError } from "../api/client.js";
import { ConversationEntry } from "../api/conversation.js";
import { RoleBadge } from "./Badges.js";

// One thread component serves Public Comments and Internal Notes, because they
// are the same conversation with different visibility. The `variant` carries
// the whole difference: the note variant sits on the warning surface and states
// that the Requester cannot see it, so the two can never be confused (AC-38,
// ui-spec.md §1 and §5.5).

const BODY_MAX = 2000;

export type ThreadVariant = "comment" | "note";

interface Props {
  variant: ThreadVariant;
  entries: ConversationEntry[];
  onPost: (body: string) => Promise<ConversationEntry>;
  onPosted: (entry: ConversationEntry) => void;
  /** Hides the composer while the thread stays readable. */
  readOnly?: boolean;
}

const COPY = {
  comment: {
    heading: "Public Comments",
    empty: "No comments yet.",
    label: "Add a comment",
    action: "Post Comment",
    busy: "Posting…",
    required: "Comment is required",
    failure: "The comment could not be posted. Please try again.",
  },
  note: {
    heading: "Internal Notes",
    empty: "No internal notes yet.",
    label: "Add an internal note",
    action: "Add Internal Note",
    busy: "Adding…",
    required: "Internal Note is required",
    failure: "The internal note could not be added. Please try again.",
  },
} as const;

function formatTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function ConversationThread({ variant, entries, onPost, onPosted, readOnly = false }: Props) {
  const copy = COPY[variant];
  const fieldId = useId();

  const [body, setBody] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const trimmed = body.trim();
    if (trimmed === "") {
      // Blocked here so an empty submission never reaches the API (AC-22).
      setFieldError(copy.required);
      setFailure(null);
      return;
    }

    setBusy(true);
    setFieldError(null);
    setFailure(null);

    try {
      const entry = await onPost(trimmed);
      onPosted(entry);
      setBody("");
    } catch (error) {
      const fieldMessage =
        error instanceof ApiError ? error.fields?.find((f) => f.field === "body")?.message : undefined;
      if (fieldMessage) setFieldError(fieldMessage);
      else setFailure(copy.failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={variant === "note" ? "zg-card zg-notes" : "zg-card zg-comments"}
      aria-label={copy.heading}
    >
      <div className="zg-thread-head">
        <h2 className="zg-section-title mb-0">{copy.heading}</h2>
        {variant === "note" ? <span className="zg-notes-caption">Not visible to the Requester</span> : null}
      </div>

      {entries.length === 0 ? (
        <p className="zg-empty-line">{copy.empty}</p>
      ) : (
        <ol className="zg-thread">
          {entries.map((entry) => (
            <li key={entry.id} className="zg-thread-entry">
              <div className="zg-thread-meta">
                <span className="zg-thread-author">{entry.author.name}</span>
                <RoleBadge value={entry.author.role} />
                <time dateTime={entry.createdAt}>{formatTime(entry.createdAt)}</time>
              </div>
              <p className="zg-thread-body">{entry.body}</p>
            </li>
          ))}
        </ol>
      )}

      {readOnly ? null : (
        <form className="zg-thread-form" onSubmit={handleSubmit} noValidate>
          <div className="zg-field">
            <label className="zg-label" htmlFor={fieldId}>
              {copy.label}
            </label>
            <textarea
              id={fieldId}
              className={`zg-textarea${fieldError ? " zg-invalid" : ""}`}
              rows={3}
              maxLength={BODY_MAX}
              value={body}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? `${fieldId}-error` : undefined}
              onChange={(event) => setBody(event.target.value)}
            />
            {fieldError ? (
              <p className="zg-message zg-message-error" id={`${fieldId}-error`} role="alert">
                {fieldError}
              </p>
            ) : null}
          </div>

          {failure ? (
            <div className="zg-callout zg-callout-error" role="alert">
              {failure}
            </div>
          ) : null}

          <button type="submit" className="zg-btn zg-btn-primary" disabled={busy}>
            {busy ? copy.busy : copy.action}
          </button>
        </form>
      )}
    </section>
  );
}
