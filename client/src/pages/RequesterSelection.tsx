import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRequesters, Requester } from "../api/reference.js";
import { useRequester } from "../context/RequesterContext.js";

// Development Requester Selection — docs/lab-02/ui-spec.md §7.1.
// This is a Lab 2 testing mechanism, not a login screen (BR-05, BR-44).

type LoadState = "loading" | "ready" | "empty" | "failed";

export default function RequesterSelection() {
  const [state, setState] = useState<LoadState>("loading");
  const [requesters, setRequesters] = useState<Requester[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const { selectRequester, staleSelectionMessage, clearStaleSelectionMessage } = useRequester();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    getRequesters()
      .then((list) => {
        if (cancelled) return;
        setRequesters(list);
        setState(list.length === 0 ? "empty" : "ready");
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  function handleContinue() {
    const chosen = requesters.find((r) => String(r.id) === selectedId);
    if (!chosen) return;
    clearStaleSelectionMessage();
    selectRequester(chosen);
    navigate("/tickets");
  }

  return (
    <main className="zg-page" style={{ maxWidth: 480 }}>
      <div className="zg-card">
        <h1 className="zg-page-title">TokTickIT</h1>

        <p className="zg-muted">
          Select a Development Requester to test requester-specific ticket behavior. This is not a
          login screen. Authentication and role-based access will be introduced in Lab 3.
        </p>

        {staleSelectionMessage && (
          <div className="zg-callout zg-callout-warning" role="status">
            {staleSelectionMessage}
          </div>
        )}

        {state === "loading" && (
          <p role="status" aria-live="polite">
            Loading requesters…
          </p>
        )}

        {state === "empty" && (
          <div className="zg-callout zg-callout-warning" role="status">
            <p className="mb-2">No active Development Requesters found. Run the seed and reload.</p>
            <button type="button" className="zg-btn zg-btn-secondary" onClick={() => setReloadToken((t) => t + 1)}>
              Retry
            </button>
          </div>
        )}

        {state === "failed" && (
          <div className="zg-callout zg-callout-error" role="alert">
            <p className="mb-2">Unable to load Development Requesters.</p>
            <button type="button" className="zg-btn zg-btn-secondary" onClick={() => setReloadToken((t) => t + 1)}>
              Retry
            </button>
          </div>
        )}

        {state === "ready" && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleContinue();
            }}
          >
            <div className="zg-field">
              <label className="zg-label" htmlFor="requester">
                Development Requester
                <span className="zg-required" aria-hidden="true">
                  *
                </span>
              </label>
              <select
                id="requester"
                className="zg-select"
                required
                aria-required="true"
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                <option value="">Select a Development Requester…</option>
                {requesters.map((requester) => (
                  <option key={requester.id} value={requester.id}>
                    {requester.department ? `${requester.name} — ${requester.department}` : requester.name}
                  </option>
                ))}
              </select>
            </div>

            <button type="submit" className="zg-btn zg-btn-primary" disabled={selectedId === ""}>
              Continue
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
