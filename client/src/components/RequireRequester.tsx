import { ReactNode } from "react";
import { useRequester } from "../context/RequesterContext.js";
import RequesterSelection from "../pages/RequesterSelection.js";

// BR-09 / AC-01 — no Development Requester selected means no ticket screen.
export default function RequireRequester({ children }: { children: ReactNode }) {
  const { requester, loading } = useRequester();

  if (loading) {
    return (
      <main className="zg-page">
        <p role="status" aria-live="polite">
          Loading…
        </p>
      </main>
    );
  }

  if (!requester) return <RequesterSelection />;

  return <>{children}</>;
}
