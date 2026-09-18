import { Link } from "react-router-dom";
import { ROLE_LABEL } from "../api/auth.js";
import { RoleBadge } from "../components/Badges.js";
import { useAuth } from "../context/AuthContext.js";

// Account — the profile and password actions the shell must offer
// (docs/lab-03/ui-spec.md §4).

export default function Account() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <main className="zg-page">
      <h1 className="zg-page-title">Your account</h1>

      <section className="zg-card">
        <dl className="row zg-summary">
          <div className="col-12 col-lg-4 zg-field">
            <dt className="zg-label">Name</dt>
            <dd className="zg-readonly">{user.name}</dd>
          </div>
          <div className="col-12 col-lg-4 zg-field">
            <dt className="zg-label">Email address</dt>
            <dd className="zg-readonly">{user.email}</dd>
          </div>
          <div className="col-12 col-lg-4 zg-field">
            <dt className="zg-label">Role</dt>
            <dd className="zg-readonly">
              <RoleBadge value={user.role} /> <span className="visually-hidden">{ROLE_LABEL[user.role]}</span>
            </dd>
          </div>
        </dl>

        <Link to="/change-password" className="zg-btn zg-btn-secondary">
          Change password
        </Link>
      </section>
    </main>
  );
}
