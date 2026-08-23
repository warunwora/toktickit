import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useRequester } from "../context/RequesterContext.js";

// Application shell — docs/lab-02/ui-spec.md §6.
// Rendered only once a Development Requester is selected (BR-09).

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? "zg-nav-link zg-nav-link-active" : "zg-nav-link";
}

export default function AppShell() {
  const { requester, changeRequester } = useRequester();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="zg-header">
        <div className="zg-header-bar zg-page">
          <div className="zg-header-left">
            <Link to="/tickets" className="zg-brand">
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
            <NavLink to="/tickets" end className={navClass} onClick={() => setMenuOpen(false)}>
              My Tickets
            </NavLink>
            <NavLink to="/tickets/new" className={navClass} onClick={() => setMenuOpen(false)}>
              Create Ticket
            </NavLink>
          </nav>

          <div className="zg-header-identity">
            <span>
              <span className="visually-hidden">Development Requester: </span>
              {requester?.name}
            </span>
            <button type="button" className="zg-btn zg-btn-tertiary" onClick={changeRequester}>
              Change Requester
            </button>
          </div>
        </div>
      </header>

      <Outlet />
    </>
  );
}
