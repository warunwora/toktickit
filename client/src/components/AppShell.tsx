import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { RoleName } from "../api/auth.js";
import { useAuth } from "../context/AuthContext.js";
import { RoleBadge } from "./Badges.js";

// Application shell — docs/lab-03/ui-spec.md §4.
// Navigation shows only the destinations the role may use; the backend
// enforces the same rule, which is what actually protects the data (BR-21).

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const NAVIGATION: Record<RoleName, NavItem[]> = {
  REQUESTER: [
    { to: "/tickets", label: "My Tickets", end: true },
    { to: "/tickets/new", label: "Create Ticket" },
    { to: "/account", label: "Account" },
  ],
  IT_STAFF: [
    { to: "/staff/queue", label: "Ticket Queue" },
    { to: "/account", label: "Account" },
  ],
  ADMINISTRATOR: [
    { to: "/staff/queue", label: "Ticket Queue" },
    { to: "/admin/users", label: "Users" },
    { to: "/account", label: "Account" },
  ],
};

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? "zg-nav-link zg-nav-link-active" : "zg-nav-link";
}

export default function AppShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (!user) return null;

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      navigate("/login", { replace: true });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <>
      <header className="zg-header">
        <div className="zg-header-bar zg-page">
          <div className="zg-header-left">
            <Link to="/" className="zg-brand">
              TokTickIT
            </Link>
            <button
              type="button"
              className="zg-btn zg-btn-tertiary zg-menu-toggle"
              aria-expanded={menuOpen}
              aria-controls="zg-main-nav"
              onClick={() => setMenuOpen((open) => !open)}
            >
              Menu
            </button>
          </div>

          <nav id="zg-main-nav" aria-label="Main" className={menuOpen ? "zg-nav zg-nav-open" : "zg-nav"}>
            {NAVIGATION[user.role].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={navClass}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="zg-header-identity">
            <span className="zg-identity-name">
              <span className="visually-hidden">Signed in as </span>
              {user.name}
            </span>
            <RoleBadge value={user.role} />
            <button
              type="button"
              className="zg-btn zg-btn-tertiary"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? "Logging out…" : "Logout"}
            </button>
          </div>
        </div>
      </header>

      <Outlet />
    </>
  );
}
