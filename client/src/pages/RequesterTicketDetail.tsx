import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { getTicket, Ticket } from "../api/tickets.js";
import { Attachment } from "../api/attachments.js";
import { PriorityBadge, StatusBadge } from "../components/Badges.js";
import AttachmentSection from "../components/AttachmentSection.js";

// Requester Ticket Detail (view mode) — docs/lab-02/ui-spec.md §7.5.
// Every ticket field is read-only here (BR-04, AC-25).

type LoadState = "loading" | "ready" | "notFound" | "failed";

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  const id = `field-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div className="col-12 col-lg-4 zg-field">
      <label className="zg-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="zg-input zg-readonly" readOnly aria-readonly="true" value={value} />
    </div>
  );
}

export default function RequesterTicketDetail() {
  const { id } = useParams();
  const ticketId = Number(id);

  const [state, setState] = useState<LoadState>("loading");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!Number.isInteger(ticketId)) {
      setState("notFound");
      return;
    }

    let cancelled = false;
    setState("loading");

    getTicket(ticketId)
      .then((loaded) => {
        if (cancelled) return;
        setTicket(loaded);
        setAttachments((loaded.attachments as Attachment[]) ?? []);
        setState("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        // 404 covers both "missing" and "not yours" (BR-13).
        setState(error instanceof ApiError && error.status === 404 ? "notFound" : "failed");
      });

    return () => {
      cancelled = true;
    };
  }, [ticketId, reloadToken]);

  if (state === "loading") {
    return (
      <main className="zg-page">
        <p role="status" aria-live="polite">
          Loading ticket…
        </p>
      </main>
    );
  }

  if (state === "notFound") {
    return (
      <main className="zg-page">
        <div className="zg-callout zg-callout-error" role="alert">
          <p className="mb-2">Ticket not found. It may not exist, or it belongs to another Requester.</p>
          <Link className="zg-btn zg-btn-secondary" to="/tickets">
            Back to My Tickets
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
        <div className="d-flex align-items-center gap-3">
          <h1 className="zg-page-title mb-0">{ticket.ticketNumber}</h1>
          <StatusBadge value={ticket.status} />
        </div>
        <Link className="zg-btn zg-btn-secondary" to="/tickets">
          Back to My Tickets
        </Link>
      </div>

      <section className="zg-card" aria-label="Ticket information">
        <div className="row g-3">
          <ReadOnlyField label="Ticket Number" value={ticket.ticketNumber} />
          <ReadOnlyField label="Ticket Date" value={new Date(ticket.createdAt).toLocaleString()} />
          <ReadOnlyField label="Requester" value={ticket.requester.name} />
          <ReadOnlyField label="Category" value={ticket.category.name} />
          <ReadOnlyField label="Related System" value={ticket.relatedSystem.name} />
          <ReadOnlyField label="Last Updated" value={new Date(ticket.updatedAt).toLocaleString()} />
        </div>

        <div className="zg-field">
          <span className="zg-label">Requested Priority</span>
          <div>
            <PriorityBadge value={ticket.requestedPriority} />
          </div>
        </div>

        <div className="zg-field">
          <label className="zg-label" htmlFor="detail-summary">
            Summary
          </label>
          <input
            id="detail-summary"
            className="zg-input zg-readonly"
            readOnly
            aria-readonly="true"
            value={ticket.summary}
          />
        </div>

        <div className="zg-field mb-0">
          <label className="zg-label" htmlFor="detail-description">
            Description
          </label>
          <textarea
            id="detail-description"
            className="zg-textarea zg-readonly"
            readOnly
            aria-readonly="true"
            rows={5}
            value={ticket.description}
          />
        </div>
      </section>

      <AttachmentSection ticketId={ticket.id} attachments={attachments} onChange={setAttachments} />
    </main>
  );
}
