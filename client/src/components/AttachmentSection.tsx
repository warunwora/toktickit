import { useRef, useState, ChangeEvent } from "react";
import {
  ALLOWED_ACCEPT,
  ATTACHMENT_RULES_TEXT,
  Attachment,
  MAX_ACTIVE_ATTACHMENTS,
  checkFile,
  downloadAttachment,
  formatFileSize,
  removeAttachment,
  uploadAttachment,
} from "../api/attachments.js";
import { ApiError } from "../api/client.js";

// Attachment section — docs/lab-02/ui-spec.md §7.4.

interface Props {
  ticketId: number;
  attachments: Attachment[];
  onChange: (attachments: Attachment[]) => void;
}

export default function AttachmentSection({ ticketId, attachments, onChange }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [removalTarget, setRemovalTarget] = useState<Attachment | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const activeCount = attachments.filter((a) => a.state === "ACTIVE").length;
  const limitReached = activeCount >= MAX_ACTIVE_ATTACHMENTS;

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow the same file to be chosen again after an error
    if (!file) return;

    setDownloadError(null);
    const problem = checkFile(file);
    if (problem) {
      setUploadError(problem);
      return;
    }

    setUploadError(null);
    setUploading(true);
    try {
      const created = await uploadAttachment(ticketId, file);
      onChange([...attachments, created]);
    } catch (error) {
      setUploadError(
        error instanceof ApiError ? error.message : "Unable to upload this file. Please try again."
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(attachment: Attachment) {
    setDownloadError(null);
    try {
      await downloadAttachment(attachment);
    } catch (error) {
      setDownloadError(
        error instanceof ApiError ? error.message : "Unable to download this file. Please try again."
      );
    }
  }

  function openRemoval(attachment: Attachment) {
    setRemovalTarget(attachment);
    setReason("");
    setReasonError(null);
  }

  async function confirmRemoval() {
    if (!removalTarget) return;

    // BR-37 — a reason is required before anything is removed.
    if (reason.trim().length < 3) {
      setReasonError("Reason must be at least 3 characters");
      return;
    }

    setRemoving(true);
    try {
      const removed = await removeAttachment(removalTarget.id, reason.trim());
      onChange(attachments.map((a) => (a.id === removed.id ? removed : a)));
      setRemovalTarget(null);
    } catch (error) {
      setReasonError(
        error instanceof ApiError ? error.message : "Unable to remove this file. Please try again."
      );
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section className="zg-card mt-4" aria-labelledby="attachments-heading">
      <h2 className="zg-section-title" id="attachments-heading">
        Attachments
      </h2>

      <p className="zg-muted">
        {activeCount} of {MAX_ACTIVE_ATTACHMENTS} active attachments · {ATTACHMENT_RULES_TEXT}
      </p>

      {uploadError && (
        <div className="zg-callout zg-callout-error" role="alert">
          {uploadError}
        </div>
      )}

      {downloadError && (
        <div className="zg-callout zg-callout-error" role="alert">
          {downloadError}
        </div>
      )}

      {attachments.length === 0 && (
        <p className="zg-muted" role="status">
          No attachments yet.
        </p>
      )}

      <ul className="zg-attachment-list">
        {attachments.map((attachment) => {
          const removed = attachment.state === "REMOVED";
          return (
            <li key={attachment.id} className={removed ? "zg-attachment zg-attachment-removed" : "zg-attachment"}>
              <div>
                <p className="mb-1">
                  <span className="zg-attachment-name">{attachment.originalFilename}</span>{" "}
                  <span className={removed ? "zg-badge zg-badge-removed" : "zg-badge zg-badge-active"}>
                    {removed ? "Removed" : "Active"}
                  </span>
                </p>
                <p className="zg-muted mb-0">
                  {formatFileSize(attachment.sizeBytes)} · uploaded{" "}
                  {new Date(attachment.uploadedAt).toLocaleString()} by {attachment.uploadedBy.name}
                </p>
                {removed && (
                  <p className="zg-muted mb-0">
                    Removed {attachment.removedAt ? new Date(attachment.removedAt).toLocaleString() : ""} ·
                    reason: {attachment.removalReason}
                  </p>
                )}
              </div>

              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="zg-btn zg-btn-secondary"
                  onClick={() => handleDownload(attachment)}
                  disabled={removed}
                  title={removed ? "A removed attachment cannot be downloaded" : `Download ${attachment.originalFilename}`}
                  aria-label={`Download ${attachment.originalFilename}`}
                >
                  Download
                </button>
                <button
                  type="button"
                  className="zg-btn zg-btn-destructive"
                  onClick={() => openRemoval(attachment)}
                  disabled={removed}
                  aria-label={`Remove ${attachment.originalFilename}`}
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <input
        ref={fileInput}
        id="attachmentFile"
        type="file"
        className="visually-hidden"
        accept={ALLOWED_ACCEPT}
        onChange={handleFileSelected}
      />

      <button
        type="button"
        className="zg-btn zg-btn-primary"
        onClick={() => fileInput.current?.click()}
        disabled={limitReached || uploading}
      >
        {uploading ? "Uploading…" : "Add attachment"}
      </button>

      {limitReached && (
        <p className="zg-muted mt-2" role="status">
          This ticket already has {MAX_ACTIVE_ATTACHMENTS} active attachments. Remove one before adding
          another.
        </p>
      )}

      {removalTarget && (
        <div className="zg-modal" role="dialog" aria-modal="true" aria-labelledby="removal-heading">
          <div className="zg-modal-panel">
            <h3 className="zg-section-title" id="removal-heading">
              Remove attachment
            </h3>
            <p>
              <strong>{removalTarget.originalFilename}</strong> stays visible as metadata but can no longer
              be downloaded.
            </p>

            <div className="zg-field">
              <label className="zg-label" htmlFor="removalReason">
                Reason
                <span className="zg-required" aria-hidden="true">
                  *
                </span>
              </label>
              <textarea
                id="removalReason"
                className={reasonError ? "zg-textarea zg-invalid" : "zg-textarea"}
                rows={3}
                maxLength={200}
                required
                aria-required="true"
                aria-invalid={reasonError ? true : undefined}
                aria-describedby={reasonError ? "removalReason-error" : undefined}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              {reasonError && (
                <span className="zg-message zg-message-error" id="removalReason-error">
                  {reasonError}
                </span>
              )}
            </div>

            <div className="d-flex flex-wrap gap-2">
              <button type="button" className="zg-btn zg-btn-destructive" onClick={confirmRemoval} disabled={removing}>
                {removing ? "Removing…" : "Remove"}
              </button>
              <button
                type="button"
                className="zg-btn zg-btn-secondary"
                onClick={() => setRemovalTarget(null)}
                disabled={removing}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
