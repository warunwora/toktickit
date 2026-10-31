import { FormEvent, KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { ApiError } from "../api/client.js";
import { ActionPayload, ActionStatus, ActionTaken, clearFollowUp, createAction, updateAction } from "../api/actions.js";
import { AssignableUser } from "../api/staff.js";
import { RoleBadge } from "./Badges.js";
import {
  ACTION_STATUS_LABEL,
  ACTION_TRANSITIONS,
  ATTACHMENT_NOTES_MAX,
  ActionDraft,
  CANCEL_REASON_MAX,
  CANCEL_REASON_MIN,
  CREATE_STATUSES,
  DESCRIPTION_MAX,
  FOLLOW_UP_NOTE_MAX,
  RESULT_MAX,
  canMove,
  formatBangkok,
  fromBangkokInput,
  hasOpenFollowUp,
  isFinal,
  sortActions,
  toBangkokInput,
  validateDraft,
} from "../lib/actions.js";

// Actions Taken — docs/lab-04/ui-spec.md §3 (IT Staff tab) and §4 (Requester,
// read-only). One component for both, because they are the same list: the
// `readOnly` flag removes every control and the internal-only hints, nothing else.

interface Props {
  ticketId: number;
  ticketCreatedAt: string;
  ownerId: number | null;
  /** Closed or Cancelled: nothing may change (BR-16). */
  locked: boolean;
  actions: ActionTaken[];
  loadFailed: boolean;
  onReload: () => void;
  onChange: (actions: ActionTaken[]) => void;
  readOnly?: boolean;
  assignable?: AssignableUser[];
  currentUser?: { id: number; name: string };
}

type FormMode = { kind: "create" } | { kind: "edit"; action: ActionTaken };
type Notice = { tone: "success" | "warning" | "error"; text: string; reload?: boolean };

export function ActionStatusBadge({ value }: { value: ActionStatus }) {
  return (
    <span className={`zg-badge zg-badge-action-${value.toLowerCase().replace(/_/g, "-")}`}>
      {ACTION_STATUS_LABEL[value]}
    </span>
  );
}

function emptyDraft(userId: number | undefined): ActionDraft {
  return {
    actionAt: toBangkokInput(new Date()),
    description: "",
    result: "",
    status: "PLANNED",
    assigneeId: userId ?? "",
    followUpRequired: false,
    followUpNote: "",
    attachmentNotes: "",
  };
}

function draftFrom(action: ActionTaken, status: ActionStatus = action.status): ActionDraft {
  return {
    actionAt: toBangkokInput(action.actionAt),
    description: action.description,
    result: action.result ?? "",
    status,
    assigneeId: action.assignee.id,
    followUpRequired: action.followUpRequired,
    followUpNote: action.followUpNote ?? "",
    attachmentNotes: action.attachmentNotes ?? "",
  };
}

/** The failure feedback of ui-spec.md §3.3, shared by every write on this tab. */
function noticeFor(error: unknown): Notice {
  if (error instanceof ApiError && error.code === "STALE_UPDATE") {
    return { tone: "warning", text: "This action was changed by someone else.", reload: true };
  }
  if (error instanceof ApiError && error.code === "TICKET_LOCKED") {
    return { tone: "error", text: "This ticket is closed, so its actions can no longer change." };
  }
  if (error instanceof ApiError && (error.code === "ACTION_FINAL" || error.code === "INVALID_ACTION_TRANSITION")) {
    return { tone: "warning", text: "This action has moved on since you opened it.", reload: true };
  }
  if (error instanceof ApiError && error.code === "DUPLICATE_SUBMISSION") {
    return { tone: "warning", text: "This action was already saved a moment ago.", reload: true };
  }
  if (error instanceof ApiError && error.status === 400 && error.fields?.length) {
    return { tone: "error", text: "Please correct the highlighted fields." };
  }
  return { tone: "error", text: "The action could not be saved. Please try again." };
}

function Counter({ value, max }: { value: string; max: number }) {
  return (
    <span className="zg-counter" aria-hidden="true">
      {value.length}/{max}
    </span>
  );
}

export default function ActionsTaken({
  ticketId,
  ticketCreatedAt,
  ownerId,
  locked,
  actions,
  loadFailed,
  onReload,
  onChange,
  readOnly = false,
  assignable = [],
  currentUser,
}: Props) {
  const formId = useId();
  const [mode, setMode] = useState<FormMode | null>(null);
  const [draft, setDraft] = useState<ActionDraft>(() => emptyDraft(currentUser?.id));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  // A ref, not state: a double click lands before React re-renders the
  // disabled button, and must still send one request (BR-39, UI-10).
  const inFlight = useRef(false);

  const [cancelling, setCancelling] = useState<ActionTaken | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const cancelOpener = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const canWrite = !readOnly && !locked;

  useEffect(() => {
    if (cancelling) reasonRef.current?.focus();
  }, [cancelling]);

  function upsert(saved: ActionTaken) {
    onChange(sortActions([...actions.filter((action) => action.id !== saved.id), saved]));
  }

  async function run(write: () => Promise<ActionTaken>, after?: () => void): Promise<boolean> {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setNotice(null);

    try {
      upsert(await write());
      setNotice({ tone: "success", text: "Action saved." });
      after?.();
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.fields?.length) {
        setErrors(Object.fromEntries(error.fields.map((field) => [field.field, field.message])));
      }
      setNotice(noticeFor(error));
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function openCreate() {
    setMode({ kind: "create" });
    setDraft(emptyDraft(currentUser?.id));
    setErrors({});
    setNotice(null);
  }

  function openEdit(action: ActionTaken, status: ActionStatus = action.status) {
    setMode({ kind: "edit", action });
    setDraft(draftFrom(action, status));
    setErrors({});
    setNotice(null);
  }

  function closeForm() {
    setMode(null);
    setErrors({});
  }

  function update<K extends keyof ActionDraft>(key: K, value: ActionDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!mode || inFlight.current) return;

    const found = validateDraft(draft, ticketCreatedAt);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setNotice(null);
      return;
    }

    const payload: ActionPayload = {
      description: draft.description.trim(),
      status: draft.status,
      assigneeId: draft.assigneeId as number,
      followUpRequired: draft.followUpRequired,
      ...(draft.followUpRequired ? { followUpNote: draft.followUpNote.trim() } : {}),
    };

    if (mode.kind === "create") {
      payload.actionAt = fromBangkokInput(draft.actionAt)!.toISOString();
      if (draft.result.trim()) payload.result = draft.result.trim();
      if (draft.attachmentNotes.trim()) payload.attachmentNotes = draft.attachmentNotes.trim();
      await run(() => createAction(ticketId, payload), closeForm);
      return;
    }

    // The control holds whole minutes; resending an untouched time would
    // silently drop the stored seconds.
    if (draft.actionAt !== toBangkokInput(mode.action.actionAt)) {
      payload.actionAt = fromBangkokInput(draft.actionAt)!.toISOString();
    }
    payload.result = draft.result.trim();
    payload.attachmentNotes = draft.attachmentNotes.trim();
    if (payload.status === mode.action.status) delete payload.status;
    await run(() => updateAction(mode.action.id, mode.action.version, payload), closeForm);
  }

  function openCancel(action: ActionTaken, opener: HTMLButtonElement) {
    cancelOpener.current = opener;
    setCancelling(action);
    setCancelReason("");
    setCancelError(null);
  }

  function closeCancel() {
    setCancelling(null);
    cancelOpener.current?.focus();
  }

  async function confirmCancel() {
    if (!cancelling) return;
    const reason = cancelReason.trim();
    if (reason.length < CANCEL_REASON_MIN || reason.length > CANCEL_REASON_MAX) {
      setCancelError(`A reason of ${CANCEL_REASON_MIN} to ${CANCEL_REASON_MAX} characters is required`);
      return;
    }
    const target = cancelling;
    const ok = await run(() => updateAction(target.id, target.version, { status: "CANCELLED", cancelReason: reason }));
    // On failure the dialog stays open with the reason typed (BR-40).
    if (ok) closeCancel();
    else setCancelError("The action could not be cancelled. Please try again.");
  }

  /** ui-spec.md §8 — the dialog keeps focus inside it and Escape closes it. */
  function dialogKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCancel();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>("textarea, button:not([disabled])")
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const statusOptions: ActionStatus[] =
    mode?.kind === "edit"
      ? [mode.action.status, ...ACTION_TRANSITIONS[mode.action.status].filter((s) => s !== "CANCELLED")]
      : [...CREATE_STATUSES];

  const describedBy = (field: string) => (errors[field] ? `${formId}-${field}-error` : undefined);

  function fieldError(field: string) {
    return errors[field] ? (
      <p className="zg-message zg-message-error" id={`${formId}-${field}-error`} role="alert">
        {errors[field]}
      </p>
    ) : null;
  }

  return (
    <section className="zg-card zg-actions" aria-label="Actions Taken">
      <div className="zg-thread-head">
        <h2 className="zg-section-title mb-0">Actions Taken</h2>
        {canWrite && !mode ? (
          <button type="button" className="zg-btn zg-btn-primary" onClick={openCreate}>
            Add action
          </button>
        ) : null}
      </div>

      {!readOnly && locked ? (
        <p className="zg-muted">This ticket is closed, so its actions can no longer change.</p>
      ) : null}

      {notice ? (
        <div className={`zg-callout zg-callout-${notice.tone}`} role={notice.tone === "success" ? "status" : "alert"}>
          <span>{notice.text}</span>
          {notice.reload ? (
            <button
              type="button"
              className="zg-btn zg-btn-secondary ms-2"
              onClick={() => {
                setNotice(null);
                closeForm();
                onReload();
              }}
            >
              Reload latest
            </button>
          ) : null}
        </div>
      ) : null}

      {loadFailed ? (
        <div className="zg-callout zg-callout-error" role="alert">
          <span>The Actions Taken could not be loaded.</span>
          <button type="button" className="zg-btn zg-btn-secondary ms-2" onClick={onReload}>
            Retry
          </button>
        </div>
      ) : actions.length === 0 ? (
        <p className="zg-empty-line">{readOnly ? "No actions have been recorded yet." : "No actions recorded yet."}</p>
      ) : (
        <table className="zg-table zg-actions-table">
          <thead>
            <tr>
              <th scope="col">Action Date/Time</th>
              <th scope="col">Description</th>
              <th scope="col">Performed by</th>
              <th scope="col">Assigned to</th>
              <th scope="col">Status</th>
              {canWrite ? <th scope="col">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {actions.map((action) => {
              const open = !isFinal(action.status);
              const followUpOpen = hasOpenFollowUp(action);
              return (
                <tr key={action.id} id={`action-${action.id}`} data-testid="action-row">
                  <td data-label="Action Date/Time">
                    <time dateTime={action.actionAt}>{formatBangkok(action.actionAt)}</time>
                  </td>
                  <td data-label="Description" className="zg-action-description">
                    <p className="mb-1">{action.description}</p>
                    <dl className="zg-action-detail">
                      {action.result ? (
                        <>
                          <dt>Result</dt>
                          <dd>{action.result}</dd>
                        </>
                      ) : null}
                      {action.followUpRequired ? (
                        <>
                          <dt>Follow-up</dt>
                          <dd>
                            {action.followUpNote}
                            {action.followUpClearedAt
                              ? ` — done ${formatBangkok(action.followUpClearedAt)}${
                                  action.followUpClearedBy ? ` by ${action.followUpClearedBy.name}` : ""
                                }`
                              : ""}
                          </dd>
                        </>
                      ) : null}
                      {action.attachmentNotes ? (
                        <>
                          <dt>Attachment Notes</dt>
                          <dd>{action.attachmentNotes}</dd>
                        </>
                      ) : null}
                      {action.completedAt ? (
                        <>
                          <dt>Completed</dt>
                          <dd>{formatBangkok(action.completedAt)}</dd>
                        </>
                      ) : null}
                      {action.status === "CANCELLED" ? (
                        <>
                          <dt>Cancelled</dt>
                          <dd>
                            {formatBangkok(action.cancelledAt)}
                            {action.cancelReason ? ` — ${action.cancelReason}` : ""}
                          </dd>
                        </>
                      ) : null}
                    </dl>
                  </td>
                  <td data-label="Performed by">
                    <span className="zg-action-person">{action.performedBy.name}</span>
                  </td>
                  <td data-label="Assigned to">
                    <span className="zg-action-assignee">
                      <span className="zg-action-person">
                        {action.assignee.name} <RoleBadge value={action.assignee.role} />
                      </span>
                      {!readOnly && ownerId !== null && action.assignee.id !== ownerId ? (
                        <span className="zg-muted zg-action-hint">Not the ticket owner</span>
                      ) : null}
                    </span>
                  </td>
                  <td data-label="Status">
                    <span className="zg-action-badges">
                      <ActionStatusBadge value={action.status} />
                      {followUpOpen ? <span className="zg-badge zg-badge-follow-up">Follow-up</span> : null}
                    </span>
                  </td>
                  {canWrite ? (
                    <td data-label="Actions">
                      <span className="zg-action-buttons">
                        {open ? (
                          <button type="button" className="zg-btn zg-btn-tertiary" disabled={busy} onClick={() => openEdit(action)}>
                            Edit
                          </button>
                        ) : null}
                        {canMove(action.status, "IN_PROGRESS") ? (
                          <button
                            type="button"
                            className="zg-btn zg-btn-secondary"
                            disabled={busy}
                            onClick={() => run(() => updateAction(action.id, action.version, { status: "IN_PROGRESS" }))}
                          >
                            Start
                          </button>
                        ) : null}
                        {canMove(action.status, "COMPLETED") ? (
                          <button
                            type="button"
                            className="zg-btn zg-btn-secondary"
                            disabled={busy}
                            onClick={() => openEdit(action, "COMPLETED")}
                          >
                            Complete
                          </button>
                        ) : null}
                        {canMove(action.status, "CANCELLED") ? (
                          <button
                            type="button"
                            className="zg-btn zg-btn-tertiary"
                            disabled={busy}
                            onClick={(event) => openCancel(action, event.currentTarget)}
                          >
                            Cancel
                          </button>
                        ) : null}
                        {followUpOpen ? (
                          <button
                            type="button"
                            className="zg-btn zg-btn-secondary"
                            disabled={busy}
                            onClick={() => run(() => clearFollowUp(action.id, action.version))}
                          >
                            Mark follow-up done
                          </button>
                        ) : null}
                      </span>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {canWrite && mode ? (
        <form className="zg-action-form" onSubmit={submit} noValidate aria-label={mode.kind === "create" ? "Add action" : "Edit action"}>
          <h3 className="zg-section-title">{mode.kind === "create" ? "Add action" : "Edit action"}</h3>
          <div className="row g-3">
            <div className="col-12 col-md-6 zg-field">
              <label className="zg-label" htmlFor={`${formId}-actionAt`}>
                Action Date/Time <span aria-hidden="true">*</span>
              </label>
              <input
                id={`${formId}-actionAt`}
                type="datetime-local"
                className={`zg-input${errors.actionAt ? " zg-invalid" : ""}`}
                value={draft.actionAt}
                required
                aria-invalid={errors.actionAt ? true : undefined}
                aria-describedby={describedBy("actionAt")}
                onChange={(event) => update("actionAt", event.target.value)}
              />
              <p className="zg-helper-text mb-0">Bangkok time</p>
              {fieldError("actionAt")}
            </div>

            <div className="col-12 col-md-6 zg-field">
              <label className="zg-label" htmlFor={`${formId}-performer`}>
                Performed by
              </label>
              <input
                id={`${formId}-performer`}
                className="zg-input zg-readonly"
                readOnly
                aria-readonly="true"
                value={mode.kind === "edit" ? mode.action.performedBy.name : currentUser?.name ?? ""}
              />
            </div>

            <div className="col-12 zg-field">
              <label className="zg-label" htmlFor={`${formId}-description`}>
                Action Description <span aria-hidden="true">*</span>
              </label>
              <textarea
                id={`${formId}-description`}
                className={`zg-textarea${errors.description ? " zg-invalid" : ""}`}
                rows={3}
                maxLength={DESCRIPTION_MAX}
                value={draft.description}
                required
                aria-invalid={errors.description ? true : undefined}
                aria-describedby={describedBy("description")}
                onChange={(event) => update("description", event.target.value)}
              />
              <Counter value={draft.description} max={DESCRIPTION_MAX} />
              {fieldError("description")}
            </div>

            <div className="col-12 col-md-6 zg-field">
              <label className="zg-label" htmlFor={`${formId}-status`}>
                Status <span aria-hidden="true">*</span>
              </label>
              <select
                id={`${formId}-status`}
                className="form-select zg-select"
                value={draft.status}
                onChange={(event) => update("status", event.target.value as ActionStatus)}
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {ACTION_STATUS_LABEL[status]}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-12 col-md-6 zg-field">
              <label className="zg-label" htmlFor={`${formId}-assignee`}>
                Assigned to <span aria-hidden="true">*</span>
              </label>
              <select
                id={`${formId}-assignee`}
                className={`form-select zg-select${errors.assigneeId ? " zg-invalid" : ""}`}
                value={draft.assigneeId}
                aria-invalid={errors.assigneeId ? true : undefined}
                aria-describedby={describedBy("assigneeId")}
                onChange={(event) => update("assigneeId", event.target.value === "" ? "" : Number(event.target.value))}
              >
                <option value="">Select a person</option>
                {assignable.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.role === "ADMINISTRATOR" ? `${person.name} (Administrator)` : person.name}
                  </option>
                ))}
              </select>
              {fieldError("assigneeId")}
            </div>

            <div className="col-12 zg-field">
              <label className="zg-label" htmlFor={`${formId}-result`}>
                Result {draft.status === "COMPLETED" ? <span aria-hidden="true">*</span> : null}
              </label>
              <textarea
                id={`${formId}-result`}
                className={`zg-textarea${errors.result ? " zg-invalid" : ""}`}
                rows={2}
                maxLength={RESULT_MAX}
                value={draft.result}
                required={draft.status === "COMPLETED"}
                aria-invalid={errors.result ? true : undefined}
                aria-describedby={describedBy("result")}
                onChange={(event) => update("result", event.target.value)}
              />
              <Counter value={draft.result} max={RESULT_MAX} />
              {fieldError("result")}
            </div>

            <div className="col-12 zg-field">
              <div className="form-check">
                <input
                  id={`${formId}-followUp`}
                  type="checkbox"
                  className="form-check-input"
                  checked={draft.followUpRequired}
                  aria-controls={`${formId}-followUpNote-wrap`}
                  aria-expanded={draft.followUpRequired}
                  onChange={(event) => update("followUpRequired", event.target.checked)}
                />
                <label className="form-check-label" htmlFor={`${formId}-followUp`}>
                  Follow-Up Required
                </label>
              </div>
              <div id={`${formId}-followUpNote-wrap`} hidden={!draft.followUpRequired}>
                {draft.followUpRequired ? (
                  <>
                    <label className="zg-label mt-2" htmlFor={`${formId}-followUpNote`}>
                      Follow-up Note <span aria-hidden="true">*</span>
                    </label>
                    <textarea
                      id={`${formId}-followUpNote`}
                      className={`zg-textarea${errors.followUpNote ? " zg-invalid" : ""}`}
                      rows={2}
                      maxLength={FOLLOW_UP_NOTE_MAX}
                      value={draft.followUpNote}
                      required
                      aria-invalid={errors.followUpNote ? true : undefined}
                      aria-describedby={describedBy("followUpNote")}
                      onChange={(event) => update("followUpNote", event.target.value)}
                    />
                    <Counter value={draft.followUpNote} max={FOLLOW_UP_NOTE_MAX} />
                    {fieldError("followUpNote")}
                  </>
                ) : null}
              </div>
            </div>

            <div className="col-12 zg-field">
              <label className="zg-label" htmlFor={`${formId}-attachmentNotes`}>
                Attachment Notes
              </label>
              <input
                id={`${formId}-attachmentNotes`}
                className={`zg-input${errors.attachmentNotes ? " zg-invalid" : ""}`}
                maxLength={ATTACHMENT_NOTES_MAX}
                value={draft.attachmentNotes}
                aria-invalid={errors.attachmentNotes ? true : undefined}
                aria-describedby={`${formId}-attachmentNotes-help${errors.attachmentNotes ? ` ${formId}-attachmentNotes-error` : ""}`}
                onChange={(event) => update("attachmentNotes", event.target.value)}
              />
              <p className="zg-helper-text mb-0" id={`${formId}-attachmentNotes-help`}>
                Name the Ticket attachment to look at, e.g. evidence.png
              </p>
              {fieldError("attachmentNotes")}
            </div>
          </div>

          <div className="d-flex flex-wrap gap-2">
            <button type="submit" className="zg-btn zg-btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save action"}
            </button>
            <button type="button" className="zg-btn zg-btn-tertiary" onClick={closeForm} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {cancelling ? (
        <div className="zg-modal">
          <div
            ref={dialogRef}
            className="zg-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${formId}-cancel-heading`}
            onKeyDown={dialogKeys}
          >
            <h3 className="zg-section-title" id={`${formId}-cancel-heading`}>
              Cancel this action?
            </h3>
            <p>{cancelling.description}</p>
            <label className="zg-label" htmlFor={`${formId}-cancelReason`}>
              Reason <span aria-hidden="true">*</span>
            </label>
            <textarea
              id={`${formId}-cancelReason`}
              ref={reasonRef}
              className={`zg-textarea${cancelError ? " zg-invalid" : ""}`}
              rows={2}
              maxLength={CANCEL_REASON_MAX}
              value={cancelReason}
              aria-invalid={cancelError ? true : undefined}
              aria-describedby={cancelError ? `${formId}-cancelReason-error` : undefined}
              onChange={(event) => setCancelReason(event.target.value)}
            />
            {cancelError ? (
              <p className="zg-message zg-message-error" id={`${formId}-cancelReason-error`} role="alert">
                {cancelError}
              </p>
            ) : null}
            <div className="d-flex flex-wrap gap-2 mt-3">
              <button type="button" className="zg-btn zg-btn-destructive" onClick={confirmCancel} disabled={busy}>
                {busy ? "Cancelling…" : "Cancel action"}
              </button>
              <button type="button" className="zg-btn zg-btn-secondary" onClick={closeCancel} disabled={busy}>
                Keep it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
