import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { clearStoredRequesterId, getStoredRequesterId, storeRequesterId } from "../api/client.js";
import { getRequesters, Requester } from "../api/reference.js";

// The selected Development Requester is the Lab 2 testing identity (BR-05).
// It is NOT authentication: it lives in localStorage and is sent as a header.

interface RequesterContextValue {
  requester: Requester | null;
  /** Bumped on every change so requester-scoped screens can reload (BR-08). */
  version: number;
  loading: boolean;
  selectRequester: (requester: Requester) => void;
  changeRequester: () => void;
  /** Set when a stored selection turned out to be gone or inactive (BR-10). */
  staleSelectionMessage: string | null;
  clearStaleSelectionMessage: () => void;
}

const RequesterContext = createContext<RequesterContextValue | null>(null);

export function RequesterProvider({ children }: { children: ReactNode }) {
  const [requester, setRequester] = useState<Requester | null>(null);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [staleSelectionMessage, setStaleSelectionMessage] = useState<string | null>(null);

  // Re-resolve a stored id against the active requesters on start-up, so a
  // requester that was deactivated cannot keep a session alive (BR-10).
  useEffect(() => {
    const storedId = getStoredRequesterId();
    if (storedId === null) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    getRequesters()
      .then((requesters) => {
        if (cancelled) return;
        const match = requesters.find((r) => r.id === storedId);
        if (match) {
          setRequester(match);
        } else {
          clearStoredRequesterId();
          setStaleSelectionMessage(
            "The Development Requester you were using is no longer available. Please select another one."
          );
        }
      })
      .catch(() => {
        // Leave the selection in storage: a network blip must not force a reselect.
        if (!cancelled) setRequester(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectRequester = useCallback((next: Requester) => {
    storeRequesterId(next.id);
    setRequester(next);
    setStaleSelectionMessage(null);
    setVersion((v) => v + 1);
  }, []);

  const changeRequester = useCallback(() => {
    clearStoredRequesterId();
    setRequester(null);
    setVersion((v) => v + 1);
  }, []);

  const clearStaleSelectionMessage = useCallback(() => setStaleSelectionMessage(null), []);

  const value = useMemo(
    () => ({
      requester,
      version,
      loading,
      selectRequester,
      changeRequester,
      staleSelectionMessage,
      clearStaleSelectionMessage,
    }),
    [requester, version, loading, selectRequester, changeRequester, staleSelectionMessage, clearStaleSelectionMessage]
  );

  return <RequesterContext.Provider value={value}>{children}</RequesterContext.Provider>;
}

export function useRequester(): RequesterContextValue {
  const context = useContext(RequesterContext);
  if (!context) throw new Error("useRequester must be used inside a RequesterProvider");
  return context;
}
