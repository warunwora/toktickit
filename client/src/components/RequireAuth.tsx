import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { RoleName, ROLE_HOME } from "../api/auth.js";
import { useAuth } from "../context/AuthContext.js";

// Route guard — docs/lab-03/ui-spec.md §4.
// This is convenience, not security: every rule below is also enforced by the
// backend, which is what actually protects the data (BR-21).

export default function RequireAuth({ allow, children }: { allow?: RoleName[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="zg-page">
        <p role="status" aria-live="polite">
          Loading…
        </p>
      </main>
    );
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  // An initial password blocks every other screen until it is replaced (BR-02).
  if (user.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  if (allow && !allow.includes(user.role)) return <Navigate to={ROLE_HOME[user.role]} replace />;

  return <>{children}</>;
}
