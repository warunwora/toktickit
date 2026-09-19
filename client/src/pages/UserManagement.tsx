import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "../api/client.js";
import { RoleName, ROLE_LABEL, passwordSatisfiesRules } from "../api/auth.js";
import {
  ManagedUser,
  createUser,
  listUsers,
  setInitialPassword,
  updateUser,
} from "../api/admin.js";
import { RoleBadge } from "../components/Badges.js";
import PasswordField from "../components/PasswordField.js";
import { useAuth } from "../context/AuthContext.js";

// Administrator User Management — docs/lab-03/ui-spec.md §5.6, api-spec.md §7.
//
// Deliberately minimal: one list, one side panel, no pagination and no bulk
// actions. The two safety rules (BR-52, BR-53) are enforced by the backend and
// reported here as a callout above the panel actions, because a disabled button
// is feedback, not authorization.

const SEARCH_DEBOUNCE_MS = 300;

const ROLE_OPTIONS: RoleName[] = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"];

const PASSWORD_REMINDER = "The user must change this password at their next login.";

type PanelMode = "closed" | "create" | "edit";
type ListState = "loading" | "ready" | "forbidden" | "failed";

interface PanelFields {
  name: string;
  email: string;
  role: RoleName;
  isActive: boolean;
  initialPassword: string;
}

const EMPTY_PANEL: PanelFields = {
  name: "",
  email: "",
  role: "REQUESTER",
  isActive: true,
  initialPassword: "",
};

type Confirmation = "deactivate" | "password" | null;

export default function UserManagement() {
  const { user: signedIn } = useAuth();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleName | "">("");

  const [state, setState] = useState<ListState>("loading");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  const [mode, setMode] = useState<PanelMode>("closed");
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [fields, setFields] = useState<PanelFields>(EMPTY_PANEL);
  const [newPassword, setNewPassword] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelSuccess, setPanelSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState<Confirmation>(null);

  const hasFilters = search !== "" || roleFilter !== "";

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    listUsers({ search, role: roleFilter })
      .then((loaded) => {
        if (cancelled) return;
        setUsers(loaded);
        setState("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setState(error instanceof ApiError && error.status === 403 ? "forbidden" : "failed");
      });

    return () => {
      cancelled = true;
    };
  }, [search, roleFilter, reloadToken]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  function resetPanelFeedback() {
    setFieldErrors({});
    setPanelError(null);
    setPanelSuccess(null);
    setConfirming(null);
  }

  function openCreate() {
    resetPanelFeedback();
    setEditing(null);
    setFields(EMPTY_PANEL);
    setNewPassword("");
    setMode("create");
  }

  function openEdit(target: ManagedUser) {
    resetPanelFeedback();
    setEditing(target);
    setFields({
      name: target.name,
      email: target.email,
      role: target.role,
      isActive: target.isActive,
      initialPassword: "",
    });
    setNewPassword("");
    setMode("edit");
  }

  function closePanel() {
    resetPanelFeedback();
    setMode("closed");
    setEditing(null);
  }

  /** Mirrors the backend rules so an obviously bad form never leaves the page. */
  function validate(): boolean {
    const next: Record<string, string> = {};

    if (fields.name.trim().length < 2) next.name = "Full Name must be at least 2 characters";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) {
      next.email = "Enter a valid email address";
    }
    if (mode === "create" && !passwordSatisfiesRules(fields.initialPassword)) {
      next.initialPassword = "This password does not meet the rules";
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  function applyFailure(error: unknown, fallback: string) {
    if (error instanceof ApiError && error.code === "EMAIL_IN_USE") {
      setFieldErrors({ email: error.message });
      return;
    }
    if (error instanceof ApiError && error.fields?.length) {
      setFieldErrors(Object.fromEntries(error.fields.map((field) => [field.field, field.message])));
      return;
    }
    // Both safety rules arrive here, and both belong above the panel actions.
    setPanelError(error instanceof ApiError ? error.message : fallback);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPanelError(null);
    setPanelSuccess(null);

    if (!validate()) return;

    setSaving(true);
    try {
      if (mode === "create") {
        await createUser({
          name: fields.name.trim(),
          email: fields.email.trim(),
          role: fields.role,
          isActive: fields.isActive,
          initialPassword: fields.initialPassword,
        });
        setPanelSuccess(`User created. ${PASSWORD_REMINDER}`);
        setMode("closed");
      } else if (editing) {
        await updateUser(editing.id, {
          name: fields.name.trim(),
          email: fields.email.trim(),
          role: fields.role,
          isActive: fields.isActive,
        });
        setPanelSuccess("User updated.");
        setMode("closed");
      }
      refresh();
    } catch (error) {
      applyFailure(error, "The user could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeactivate() {
    if (!editing) return;
    setSaving(true);
    setPanelError(null);

    try {
      await updateUser(editing.id, { isActive: false });
      setConfirming(null);
      setPanelSuccess("User deactivated.");
      setMode("closed");
      refresh();
    } catch (error) {
      setConfirming(null);
      applyFailure(error, "The user could not be deactivated. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmNewPassword() {
    if (!editing) return;

    if (!passwordSatisfiesRules(newPassword)) {
      setFieldErrors({ newInitialPassword: "This password does not meet the rules" });
      setConfirming(null);
      return;
    }

    setSaving(true);
    setPanelError(null);

    try {
      await setInitialPassword(editing.id, newPassword);
      setConfirming(null);
      setNewPassword("");
      setPanelSuccess(`New initial password set. ${PASSWORD_REMINDER}`);
      refresh();
    } catch (error) {
      setConfirming(null);
      applyFailure(error, "The password could not be set. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const editingSelf = useMemo(
    () => editing !== null && signedIn?.id === editing.id,
    [editing, signedIn]
  );

  if (state === "forbidden") {
    return (
      <main className="zg-page">
        <h1 className="zg-page-title">Users</h1>
        <div className="zg-callout zg-callout-error" role="alert">
          You do not have access to this screen.
        </div>
      </main>
    );
  }

  return (
    <main className="zg-page">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h1 className="zg-page-title mb-0">Users</h1>
        <button type="button" className="zg-btn zg-btn-primary" onClick={openCreate}>
          ＋ Create User
        </button>
      </div>

      {panelSuccess && mode === "closed" ? (
        <div className="zg-callout zg-callout-success" role="status">
          {panelSuccess}
        </div>
      ) : null}

      <div className={`zg-admin-layout${mode === "closed" ? " zg-admin-layout-wide" : ""}`}>
        <div className="zg-admin-list">
          <section className="zg-card zg-toolbar" aria-label="User filters">
            <div className="row g-3">
              <div className="col-12 col-md-7 zg-field mb-0">
                <label className="zg-label" htmlFor="user-search">
                  Search
                </label>
                <input
                  id="user-search"
                  className="form-control zg-input"
                  type="search"
                  placeholder="Search users by name or email"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
              </div>

              <div className="col-12 col-md-5 zg-field mb-0">
                <label className="zg-label" htmlFor="user-role">
                  Role
                </label>
                <select
                  id="user-role"
                  className="form-select zg-select"
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value as RoleName | "")}
                >
                  <option value="">All roles</option>
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {state === "failed" ? (
            <div className="zg-callout zg-callout-error" role="alert">
              <p className="mb-2">The user list could not be loaded.</p>
              <button type="button" className="zg-btn zg-btn-secondary" onClick={refresh}>
                Retry
              </button>
            </div>
          ) : null}

          {state === "loading" ? (
            <p role="status" aria-live="polite">
              Loading users…
            </p>
          ) : null}

          {state === "ready" && users.length === 0 ? (
            <div className="zg-card zg-empty">
              <p className="mb-2">No users match this search.</p>
              {hasFilters ? (
                <button
                  type="button"
                  className="zg-btn zg-btn-secondary"
                  onClick={() => {
                    setSearchInput("");
                    setSearch("");
                    setRoleFilter("");
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
          ) : null}

          {state === "ready" && users.length > 0 ? (
            <>
              <div className="zg-card zg-table-card zg-user-table">
                <div className="zg-table-wrap">
                  <table className="table zg-table">
                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Email</th>
                        <th scope="col">Role</th>
                        <th scope="col">Status</th>
                        <th scope="col">
                          <span className="visually-hidden">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((row) => (
                        <tr key={row.id}>
                          <td>{row.name}</td>
                          <td>{row.email}</td>
                          <td>
                            <RoleBadge value={row.role} />
                          </td>
                          <td>
                            <span
                              className={`zg-badge ${row.isActive ? "zg-badge-active" : "zg-badge-removed"}`}
                            >
                              {row.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="zg-btn zg-btn-secondary"
                              onClick={() => openEdit(row)}
                              aria-label={`Edit ${row.name}`}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <ul className="zg-user-cards" aria-label="Users">
                {users.map((row) => (
                  <li key={row.id} className="zg-card zg-user-card">
                    <div className="zg-user-card-head">
                      <span className="zg-user-card-name">{row.name}</span>
                      <RoleBadge value={row.role} />
                    </div>
                    <p className="zg-muted mb-2">{row.email}</p>
                    <div className="d-flex flex-wrap align-items-center gap-2">
                      <span className={`zg-badge ${row.isActive ? "zg-badge-active" : "zg-badge-removed"}`}>
                        {row.isActive ? "Active" : "Inactive"}
                      </span>
                      <button
                        type="button"
                        className="zg-btn zg-btn-secondary"
                        onClick={() => openEdit(row)}
                        aria-label={`Edit ${row.name}`}
                      >
                        Edit
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        {mode === "closed" ? null : (
          <section className="zg-card zg-admin-panel" aria-label={mode === "create" ? "Create New User" : "Edit User"}>
            <div className="d-flex justify-content-between align-items-start gap-2">
              <h2 className="zg-section-title">{mode === "create" ? "Create New User" : "Edit User"}</h2>
              <button type="button" className="zg-btn zg-btn-tertiary" onClick={closePanel} aria-label="Close panel">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className="zg-field">
                <label className="zg-label" htmlFor="panel-name">
                  Full Name <span aria-hidden="true" className="zg-required">*</span>
                </label>
                <input
                  id="panel-name"
                  className={`form-control zg-input${fieldErrors.name ? " zg-invalid" : ""}`}
                  value={fields.name}
                  aria-invalid={fieldErrors.name ? true : undefined}
                  onChange={(event) => setFields({ ...fields, name: event.target.value })}
                />
                {fieldErrors.name ? (
                  <span className="zg-message zg-message-error" role="alert">
                    {fieldErrors.name}
                  </span>
                ) : null}
              </div>

              <div className="zg-field">
                <label className="zg-label" htmlFor="panel-email">
                  Email Address <span aria-hidden="true" className="zg-required">*</span>
                </label>
                <input
                  id="panel-email"
                  type="email"
                  className={`form-control zg-input${fieldErrors.email ? " zg-invalid" : ""}`}
                  value={fields.email}
                  aria-invalid={fieldErrors.email ? true : undefined}
                  onChange={(event) => setFields({ ...fields, email: event.target.value })}
                />
                {fieldErrors.email ? (
                  <span className="zg-message zg-message-error" role="alert">
                    {fieldErrors.email}
                  </span>
                ) : null}
              </div>

              <div className="zg-field">
                <label className="zg-label" htmlFor="panel-role">
                  Role <span aria-hidden="true" className="zg-required">*</span>
                </label>
                <select
                  id="panel-role"
                  className={`form-select zg-select${fieldErrors.role ? " zg-invalid" : ""}`}
                  value={fields.role}
                  onChange={(event) => setFields({ ...fields, role: event.target.value as RoleName })}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </select>
                {fieldErrors.role ? (
                  <span className="zg-message zg-message-error" role="alert">
                    {fieldErrors.role}
                  </span>
                ) : null}
              </div>

              <div className="zg-field">
                <label className="zg-label" htmlFor="panel-active">
                  Active
                </label>
                <select
                  id="panel-active"
                  className="form-select zg-select"
                  value={fields.isActive ? "yes" : "no"}
                  onChange={(event) => setFields({ ...fields, isActive: event.target.value === "yes" })}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>

              {mode === "create" ? (
                <div className="zg-initial-password">
                  <PasswordField
                    id="panel-initial-password"
                    label="Initial Password"
                    value={fields.initialPassword}
                    autoComplete="new-password"
                    error={fieldErrors.initialPassword}
                    onChange={(value) => setFields({ ...fields, initialPassword: value })}
                    describedBy="initial-password-help"
                  />
                  <p className="zg-muted mb-0" id="initial-password-help">
                    {PASSWORD_REMINDER}
                  </p>
                </div>
              ) : null}

              {panelError ? (
                <div className="zg-callout zg-callout-error" role="alert">
                  {panelError}
                </div>
              ) : null}

              {panelSuccess ? (
                <div className="zg-callout zg-callout-success" role="status">
                  {panelSuccess}
                </div>
              ) : null}

              <div className="d-flex flex-wrap gap-2">
                <button type="submit" className="zg-btn zg-btn-primary" disabled={saving}>
                  {saving ? "Saving…" : "Save User"}
                </button>
                <button type="button" className="zg-btn zg-btn-tertiary" onClick={closePanel} disabled={saving}>
                  Cancel
                </button>
              </div>
            </form>

            {mode === "edit" && editing ? (
              <div className="zg-panel-secondary">
                <div className="zg-initial-password">
                  <PasswordField
                    id="panel-new-password"
                    label="New initial password"
                    value={newPassword}
                    autoComplete="new-password"
                    error={fieldErrors.newInitialPassword}
                    onChange={setNewPassword}
                  />
                </div>

                <div className="d-flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="zg-btn zg-btn-secondary"
                    onClick={() => setConfirming("password")}
                    disabled={saving || newPassword === ""}
                  >
                    Set new initial password
                  </button>

                  {editing.isActive ? (
                    <button
                      type="button"
                      className="zg-btn zg-btn-destructive"
                      onClick={() => setConfirming("deactivate")}
                      disabled={saving}
                    >
                      Deactivate user
                    </button>
                  ) : null}
                </div>

                {editingSelf ? (
                  <p className="zg-muted mb-0 mt-2">This is your own account.</p>
                ) : null}
              </div>
            ) : null}

            {confirming ? (
              <div className="zg-modal" role="dialog" aria-modal="true" aria-labelledby="admin-confirm-heading">
                <div className="zg-modal-panel">
                  <h3 className="zg-section-title" id="admin-confirm-heading">
                    {confirming === "deactivate"
                      ? `Deactivate ${editing?.name}?`
                      : `Set a new initial password for ${editing?.name}?`}
                  </h3>
                  <p>
                    {confirming === "deactivate"
                      ? "They will be signed out immediately and cannot sign in again until the account is reactivated."
                      : `They will be signed out everywhere. ${PASSWORD_REMINDER}`}
                  </p>
                  <div className="d-flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={confirming === "deactivate" ? "zg-btn zg-btn-destructive" : "zg-btn zg-btn-primary"}
                      onClick={confirming === "deactivate" ? confirmDeactivate : confirmNewPassword}
                      disabled={saving}
                    >
                      {confirming === "deactivate" ? "Yes, deactivate" : "Yes, set the password"}
                    </button>
                    <button
                      type="button"
                      className="zg-btn zg-btn-secondary"
                      onClick={() => setConfirming(null)}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}
