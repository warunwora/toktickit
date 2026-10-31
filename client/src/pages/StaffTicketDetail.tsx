import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { ConversationEntry, postComment, postNote } from "../api/conversation.js";
import {
  AssignableUser,
  BlockingAction,
  StaffTicket,
  getAssignableUsers,
  getStaffTicket,
  updateOwner,
  updateStaffTicket,
} from "../api/staff.js";
import { Attachment } from "../api/attachments.js";
import { ActionTaken, listActions } from "../api/actions.js";
import { Priority, TicketStatus } from "../api/tickets.js";
import { CONFIRM_REQUIRED, STATUS_LABEL, allowedTransitions } from "../lib/transitions.js";
import { PriorityBadge, StatusBadge } from "../components/Badges.js";
import AttachmentSection from "../components/AttachmentSection.js";
import ConversationThread from "../components/ConversationThread.js";
import ActionsTaken from "../components/ActionsTaken.js";
import { useAuth } from "../context/AuthContext.js";

// IT Staff Ticket Detail — docs/lab-03/ui-spec.md §5.5, api-spec.md §6.2-§6.4.
//
// Lab 4 (docs/lab-04/ui-spec.md §3, §5):
// - Administrators operate the workflow exactly like IT Staff (BR-26), which
//   replaces Lab 3 decision D-10.
// - Every write sends the version on screen; a stale one is reported with a
//   Reload action and the selections stay until then (BR-24).
// - A refused resolution lists the actions that block it (BR-19, BR-20).
// - The Actions Taken tab opens with ?tab=actions.

type LoadState = "loading" | "ready" | "notFound" | "forbidden" | "failed";
type Tab = "comments" | "notes" | "attachments" | "actions";

const TABS: readonly Tab[] = ["comments", "notes", "attachments", "actions"];

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  const id = `staff-field-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div className="col-12 col-lg-4 zg-field">
      <label className="zg-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="zg-input zg-readonly" readOnly aria-readonly="true" value={value} />
    </div>
  );
}

export default function StaffTicketDetail() {
  const { id } = useParams();
  const ticketId = Number(id);
  const { user } = useAuth();
  const canOperate = user?.role === "IT_STAFF" || user?.role === "ADMINISTRATOR";
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") as Tab | null;

  const [state, setState] = useState<LoadState>("loading");
  const [ticket, setTicket] = useState<StaffTicket | null>(null);
  const [assignable, setAssignable] = useState<AssignableUser[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  const [comments, setComments] = useState<ConversationEntry[]>([]);
  const [notes, setNotes] = useState<ConversationEntry[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [tab, setTab] = useState<Tab>(requestedTab && TABS.includes(requestedTab) ? requestedTab : "comments");

  const [actions, setActions] = useState<ActionTaken[]>([]);
  const [actionsFailed, setActionsFailed] = useState(false);
  const [actionsToken, setActionsToken] = useState(0);

  // The operations panel is a draft over the loaded ticket: nothing is sent
  // until Save, and a rejection restores every control (ui-spec.md §5.5).
  const [ownerDraft, setOwnerDraft] = useState<number | "">("");
  const [priorityDraft, setPriorityDraft] = useState<Priority>("MEDIUM");
  const [statusDraft, setStatusDraft] = useState<TicketStatus>("NEW");
  const [summaryDraft, setSummaryDraft] = useState("");

  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<TicketStatus | null>(null);
  const [stale, setStale] = useState(false);
  const [blocking, setBlocking] = useState<BlockingAction[]>([]);

  const summaryRef = useRef<HTMLTextAreaElement>(null);

  function adopt(loaded: StaffTicket) {
    setTicket(loaded);
    setOwnerDraft(loaded.owner?.id ?? "");
    setPriorityDraft(loaded.itPriority);
    setStatusDraft(loaded.status);
    setSummaryDraft(loaded.resolutionSummary ?? "");
    setComments(loaded.comments ?? []);
    setNotes(loaded.notes ?? []);
    setAttachments((loaded.attachments as Attachment[]) ?? []);
  }

  useEffect(() => {
    if (!Number.isInteger(ticketId)) {
      setState("notFound");
      return;
    }

    let cancelled = false;
    setState("loading");

    getStaffTicket(ticketId)
      .then((loaded) => {
        if (cancelled) return;
        adopt(loaded);
        setState("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) setState("notFound");
        else if (error instanceof ApiError && error.status === 403) setState("forbidden");
        else setState("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [ticketId, reloadToken]);

  useEffect(() => {
    if (!Number.isInteger(ticketId)) return;
    let cancelled = false;
    listActions(ticketId)
      .then((loaded) => {
        if (cancelled) return;
        setActions(loaded);
        setActionsFailed(false);
      })
      .catch(() => {
        if (!cancelled) setActionsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId, actionsToken]);

  // The Owner select and the action assignee select share one list (api-spec.md §4.2).
  useEffect(() => {
    if (!canOperate) return;
    getAssignableUsers()
      .then(setAssignable)
      .catch(() => setAssignable([]));
  }, [canOperate]);

  const statusOptions = useMemo(
    () => (ticket ? allowedTransitions(ticket.status) : []),
    [ticket]
  );

  const resolving = statusDraft === "RESOLVED" && ticket?.status !== "RESOLVED";

  useEffect(() => {
    // Choosing Resolved makes the summary the next thing to do, so focus moves
    // there rather than leaving the person to find it (ui-spec.md §5.5).
    if (resolving) summaryRef.current?.focus();
  }, [resolving]);

  async function save(confirmed = false) {
    if (!ticket) return;

    const statusChanged = statusDraft !== ticket.status;

    if (statusChanged && !confirmed && CONFIRM_REQUIRED.includes(statusDraft)) {
      setPendingConfirm(statusDraft);
      return;
    }

    setPendingConfirm(null);
    setSaving(true);
    clearFeedback();

    const ownerChanged = (ticket.owner?.id ?? "") !== ownerDraft;
    const priorityChanged = priorityDraft !== ticket.itPriority;
    const summaryChanged = summaryDraft.trim() !== (ticket.resolutionSummary ?? "");

    if (!ownerChanged && !statusChanged && !priorityChanged && !summaryChanged) {
      setSaving(false);
      setSaveError("Nothing has changed yet.");
      return;
    }

    // Each write answers with the next version, which the following write sends.
    let latest = ticket;

    try {
      if (ownerChanged) {
        latest = { ...latest, ...(await updateOwner(ticket.id, latest.version, ownerDraft === "" ? null : ownerDraft)) };
      }

      if (statusChanged || priorityChanged || summaryChanged) {
        latest = {
          ...latest,
          ...(await updateStaffTicket(ticket.id, latest.version, {
            ...(priorityChanged ? { itPriority: priorityDraft } : {}),
            ...(statusChanged ? { status: statusDraft } : {}),
            ...(statusDraft === "RESOLVED" || summaryChanged ? { resolutionSummary: summaryDraft.trim() } : {}),
          })),
        };
      }

      // The write responses carry the ticket without its threads, so the
      // conversation already on screen is kept.
      adoptOperation(latest);
      setSaved(true);
    } catch (error) {
      // An owner change that went through before a later refusal is real.
      if (latest !== ticket) setTicket(latest);
      handleWriteError(error, "The ticket could not be updated. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function adoptOperation(latest: StaffTicket) {
    setTicket(latest);
    setOwnerDraft(latest.owner?.id ?? "");
    setPriorityDraft(latest.itPriority);
    setStatusDraft(latest.status);
    setSummaryDraft(latest.resolutionSummary ?? "");
  }

  function clearFeedback() {
    setFieldErrors({});
    setSaveError(null);
    setSaved(false);
    setStale(false);
    setBlocking([]);
  }

  /**
   * ui-spec.md §5. A stale save and a blocked resolution keep every selection,
   * so nothing the person chose is lost while they look; any other refusal puts
   * the controls back to the stored ticket, so the screen never shows a value
   * the server refused (Lab 3 ui-spec.md §5.5).
   */
  function handleWriteError(error: unknown, fallback: string) {
    if (error instanceof ApiError && error.code === "STALE_UPDATE") {
      setStale(true);
      return;
    }

    if (error instanceof ApiError && error.code === "RESOLUTION_BLOCKED") {
      setBlocking((error.body?.blockingActions as BlockingAction[] | undefined) ?? []);
      return;
    }

    if (error instanceof ApiError && error.fields?.length) {
      setFieldErrors(Object.fromEntries(error.fields.map((f) => [f.field, f.message])));
    } else {
      setSaveError(fallback);
    }

    if (ticket) {
      setOwnerDraft(ticket.owner?.id ?? "");
      setPriorityDraft(ticket.itPriority);
      setStatusDraft(ticket.status);
      setSummaryDraft(ticket.resolutionSummary ?? "");
    }
  }

  async function claim() {
    if (!ticket || !user) return;
    setOwnerDraft(user.id);
    setSaving(true);
    clearFeedback();

    try {
      const latest = await updateOwner(ticket.id, ticket.version, user.id);
      setTicket({ ...ticket, ...latest });
      setOwnerDraft(latest.owner?.id ?? "");
      setSaved(true);
    } catch (error) {
      handleWriteError(error, "The ticket could not be claimed. Please try again.");
      setOwnerDraft(ticket.owner?.id ?? "");
    } finally {
      setSaving(false);
    }
  }

  function reloadLatest() {
    clearFeedback();
    setReloadToken((t) => t + 1);
    setActionsToken((t) => t + 1);
  }

  /**
   * Adding, completing or clearing an action raises the ticket's version
   * (BR-25). This screen made that change itself, so it takes the new version
   * quietly instead of reporting its own write as someone else's.
   */
  function actionsChanged(next: ActionTaken[]) {
    setActions(next);
    getStaffTicket(ticketId)
      .then((fresh) =>
        setTicket((current) => (current ? { ...current, version: fresh.version, updatedAt: fresh.updatedAt } : current))
      )
      .catch(() => undefined);
  }

  function showAction(actionId: number) {
    setTab("actions");
    requestAnimationFrame(() => document.getElementById(`action-${actionId}`)?.scrollIntoView?.({ block: "center" }));
  }

  if (state === "loading") {
    return (
      <main className="zg-page">
        <p role="status" aria-live="polite">
          Loading ticket…
        </p>
      </main>
    );
  }

  if (state === "notFound" || state === "forbidden") {
    return (
      <main className="zg-page">
        <div className="zg-callout zg-callout-error" role="alert">
          <p className="mb-2">
            {state === "forbidden"
              ? "You do not have access to this screen."
              : "Ticket not found. It may have been removed."}
          </p>
          <Link className="zg-btn zg-btn-secondary" to="/staff/queue">
            Back to the queue
          </Link>
        </div>
      </main>
    );
  }

  if (state === "failed" || !ticket) {
    return (
      <main className="zg-page">
        <div className="zg-callout zg-callout-error" role="alert">
          <p className="mb-2">Unable to load this ticket.</p>
          <button type="button" className="zg-btn zg-btn-secondary" onClick={() => setReloadToken((t) => t + 1)}>
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="zg-page">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <h1 className="zg-page-title mb-0">{ticket.ticketNumber}</h1>
          <StatusBadge value={ticket.status} />
          {ticket.requesterResolvedAt ? (
            <span className="zg-badge zg-badge-requester-resolved">Requester says resolved</span>
          ) : null}
        </div>
        <Link className="zg-btn zg-btn-secondary" to="/staff/queue">
          Back to the queue
        </Link>
      </div>

      <section className="zg-card" aria-label="Ticket information">
        <div className="row g-3">
          <ReadOnlyField label="Ticket Number" value={ticket.ticketNumber} />
          <ReadOnlyField label="Category" value={ticket.category.name} />
          <ReadOnlyField label="Related System" value={ticket.relatedSystem.name} />
          <ReadOnlyField label="Requester" value={ticket.requester.name} />
          <ReadOnlyField label="Created" value={formatDate(ticket.createdAt)} />
          <ReadOnlyField label="Last Updated" value={formatDate(ticket.updatedAt)} />
        </div>

        <div className="zg-field">
          <span className="zg-label">Requested Priority</span>
          <div>
            <PriorityBadge value={ticket.requestedPriority} />
            <span className="zg-muted ms-2">Set by the Requester and never changed by IT Staff.</span>
          </div>
        </div>

        <div className="zg-field">
          <label className="zg-label" htmlFor="staff-summary">
            Summary
          </label>
          <input
            id="staff-summary"
            className="zg-input zg-readonly"
            readOnly
            aria-readonly="true"
            value={ticket.summary}
          />
        </div>

        <div className="zg-field mb-0">
          <label className="zg-label" htmlFor="staff-description">
            Description
          </label>
          <textarea
            id="staff-description"
            className="zg-textarea zg-readonly"
            readOnly
            aria-readonly="true"
            rows={5}
            value={ticket.description}
          />
        </div>
      </section>

      <section className="zg-card zg-operations" aria-label="Ticket operations">
        <h2 className="zg-section-title">Operations</h2>

        <div className="row g-3">
          <div className="col-12 col-lg-4 zg-field">
            <label className="zg-label" htmlFor="staff-owner">
              Ticket Owner
            </label>
            <select
              id="staff-owner"
              className={`form-select zg-select${fieldErrors.ownerId ? " zg-invalid" : ""}`}
              value={ownerDraft}
              disabled={!canOperate || saving}
              aria-invalid={fieldErrors.ownerId ? true : undefined}
              onChange={(event) =>
                setOwnerDraft(event.target.value === "" ? "" : Number(event.target.value))
              }
            >
              <option value="">Unassigned</option>
              {assignable.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
            {fieldErrors.ownerId ? (
              <p className="zg-message zg-message-error" role="alert">
                {fieldErrors.ownerId}
              </p>
            ) : null}
            {canOperate && !ticket.owner ? (
              <button type="button" className="zg-btn zg-btn-secondary mt-2" onClick={() => claim()} disabled={saving}>
                Claim this ticket
              </button>
            ) : null}
          </div>

          <div className="col-12 col-lg-4 zg-field">
            <label className="zg-label" htmlFor="staff-priority">
              IT Priority
            </label>
            <select
              id="staff-priority"
              className={`form-select zg-select${fieldErrors.itPriority ? " zg-invalid" : ""}`}
              value={priorityDraft}
              disabled={!canOperate || saving}
              onChange={(event) => setPriorityDraft(event.target.value as Priority)}
            >
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABEL[priority]}
                </option>
              ))}
            </select>
            {fieldErrors.itPriority ? (
              <p className="zg-message zg-message-error" role="alert">
                {fieldErrors.itPriority}
              </p>
            ) : null}
          </div>

          <div className="col-12 col-lg-4 zg-field">
            <label className="zg-label" htmlFor="staff-status">
              Status
            </label>
            <select
              id="staff-status"
              className={`form-select zg-select${fieldErrors.status ? " zg-invalid" : ""}`}
              value={statusDraft}
              disabled={!canOperate || saving || statusOptions.length === 0}
              aria-invalid={fieldErrors.status ? true : undefined}
              onChange={(event) => setStatusDraft(event.target.value as TicketStatus)}
            >
              {/* The current status, then only the transitions it permits: an
                  unreachable status is never rendered (ui-spec.md §5.5). */}
              <option value={ticket.status}>{STATUS_LABEL[ticket.status]}</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </select>
            {statusOptions.length === 0 ? (
              <p className="zg-muted mb-0">{STATUS_LABEL[ticket.status]} is final; this ticket cannot move on.</p>
            ) : null}
            {fieldErrors.status ? (
              <p className="zg-message zg-message-error" role="alert">
                {fieldErrors.status}
              </p>
            ) : null}
          </div>
        </div>

        <div className="zg-field">
          <label className="zg-label" htmlFor="staff-resolution">
            Resolution Summary {resolving ? <span aria-hidden="true">*</span> : null}
          </label>
          <textarea
            id="staff-resolution"
            ref={summaryRef}
            className={`zg-textarea${resolving ? "" : " zg-readonly"}${fieldErrors.resolutionSummary ? " zg-invalid" : ""}`}
            rows={3}
            value={summaryDraft}
            readOnly={!canOperate || !resolving}
            aria-readonly={!canOperate || !resolving ? "true" : undefined}
            required={resolving}
            aria-required={resolving ? true : undefined}
            aria-invalid={fieldErrors.resolutionSummary ? true : undefined}
            onChange={(event) => setSummaryDraft(event.target.value)}
          />
          {fieldErrors.resolutionSummary ? (
            <p className="zg-message zg-message-error" role="alert">
              {fieldErrors.resolutionSummary}
            </p>
          ) : null}
        </div>

        {saveError ? (
          <div className="zg-callout zg-callout-error" role="alert">
            {saveError}
          </div>
        ) : null}

        {stale ? (
          <div className="zg-callout zg-callout-warning" role="alert">
            <span>This ticket was changed by someone else.</span>
            <button type="button" className="zg-btn zg-btn-secondary ms-2" onClick={reloadLatest}>
              Reload latest
            </button>
          </div>
        ) : null}

        {blocking.length > 0 ? (
          <div className="zg-callout zg-callout-error" role="alert">
            <p className="mb-2">This ticket cannot be resolved yet.</p>
            <ul className="zg-blocking-list mb-0">
              {blocking.map((action) => (
                <li key={action.id}>
                  <a
                    href={`?tab=actions#action-${action.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      showAction(action.id);
                    }}
                  >
                    {action.description}
                  </a>{" "}
                  — {action.reason === "FOLLOW_UP_OPEN" ? "follow-up open" : "incomplete"}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {saved ? (
          <div className="zg-callout zg-callout-success" role="status">
            The ticket has been updated.
          </div>
        ) : null}

        {canOperate ? (
          <button type="button" className="zg-btn zg-btn-primary" onClick={() => save()} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        ) : null}

        {pendingConfirm ? (
          <div className="zg-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-heading">
            <div className="zg-modal-panel">
              <h3 className="zg-section-title" id="confirm-heading">
                Move this ticket to {STATUS_LABEL[pendingConfirm]}?
              </h3>
              <p>
                {STATUS_LABEL[pendingConfirm]} is final. The ticket cannot be moved to another status
                afterwards.
              </p>
              <div className="d-flex flex-wrap gap-2">
                <button type="button" className="zg-btn zg-btn-destructive" onClick={() => save(true)}>
                  Yes, move to {STATUS_LABEL[pendingConfirm]}
                </button>
                <button
                  type="button"
                  className="zg-btn zg-btn-secondary"
                  onClick={() => {
                    setPendingConfirm(null);
                    setStatusDraft(ticket.status);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <div className="zg-tabs" role="tablist" aria-label="Ticket conversation">
        {(
          [
            ["comments", `Public Comments (${comments.length})`],
            ["notes", `Internal Notes (${notes.length})`],
            ["attachments", `Attachments (${attachments.length})`],
            ["actions", `Actions Taken (${actions.length})`],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`panel-${value}`}
            className={`zg-tab${tab === value ? " zg-tab-active" : ""}`}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="panel-comments" aria-labelledby="tab-comments" hidden={tab !== "comments"}>
        <ConversationThread
          variant="comment"
          entries={comments}
          onPost={(body) => postComment(ticket.id, body)}
          onPosted={(entry) => setComments((current) => [...current, entry])}
        />
      </div>

      <div role="tabpanel" id="panel-notes" aria-labelledby="tab-notes" hidden={tab !== "notes"}>
        <ConversationThread
          variant="note"
          entries={notes}
          onPost={(body) => postNote(ticket.id, body)}
          onPosted={(entry) => setNotes((current) => [...current, entry])}
        />
      </div>

      <div
        role="tabpanel"
        id="panel-attachments"
        aria-labelledby="tab-attachments"
        hidden={tab !== "attachments"}
      >
        <AttachmentSection ticketId={ticket.id} attachments={attachments} onChange={setAttachments} readOnly />
      </div>

      <div role="tabpanel" id="panel-actions" aria-labelledby="tab-actions" hidden={tab !== "actions"}>
        <ActionsTaken
          ticketId={ticket.id}
          ticketCreatedAt={ticket.createdAt}
          ownerId={ticket.owner?.id ?? null}
          locked={ticket.status === "CLOSED" || ticket.status === "CANCELLED"}
          actions={actions}
          loadFailed={actionsFailed}
          onReload={() => setActionsToken((t) => t + 1)}
          onChange={actionsChanged}
          readOnly={!canOperate}
          assignable={assignable}
          currentUser={user ?? undefined}
        />
      </div>
    </main>
  );
}
