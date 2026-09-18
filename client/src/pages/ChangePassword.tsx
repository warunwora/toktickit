import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { PASSWORD_RULES, ROLE_HOME, changePassword, passwordSatisfiesRules } from "../api/auth.js";
import { useAuth } from "../context/AuthContext.js";
import PasswordField from "../components/PasswordField.js";

// Mandatory Change Password — docs/lab-03/ui-spec.md §5.2, api-spec.md §3.4.

type Errors = Partial<Record<"currentPassword" | "newPassword" | "confirmPassword", string>>;

export default function ChangePassword() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const mandatory = user?.mustChangePassword ?? false;

  function validate(): Errors {
    const next: Errors = {};
    if (!currentPassword) next.currentPassword = "Enter your current password";
    if (!newPassword) next.newPassword = "Enter a new password";
    else if (!passwordSatisfiesRules(newPassword)) next.newPassword = "This password does not meet the rules below";
    else if (newPassword === currentPassword) next.newPassword = "Choose a password you have not used before";
    if (!confirmPassword) next.confirmPassword = "Confirm your new password";
    else if (confirmPassword !== newPassword) next.confirmPassword = "The two passwords do not match";
    return next;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);
    setSuccess(false);

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      const { user: updated } = await changePassword({ currentPassword, newPassword, confirmPassword });
      setUser(updated);
      setSuccess(true);
      navigate(ROLE_HOME[updated.role], { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.fields?.length) {
        const next: Errors = {};
        for (const field of error.fields) {
          if (field.field === "currentPassword") next.currentPassword = field.message;
          if (field.field === "newPassword") next.newPassword = field.message;
          if (field.field === "confirmPassword") next.confirmPassword = field.message;
        }
        setErrors(next);
        if (Object.keys(next).length === 0) setFailure(error.message);
      } else if (error instanceof ApiError) {
        setFailure(error.message);
      } else {
        setFailure("Unable to change your password right now. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="zg-auth-page">
      <div className="zg-auth-card zg-card">
        <h1 className="zg-page-title">Change Your Password</h1>
        <p className="zg-helper-text">
          {mandatory
            ? "You must change your password to continue."
            : "Choose a new password for your account."}
        </p>

        {failure ? (
          <div className="zg-callout zg-callout-error" role="alert">
            {failure}
          </div>
        ) : null}
        {success ? (
          <div className="zg-callout zg-callout-success" role="status">
            Your password has been changed.
          </div>
        ) : null}

        <form onSubmit={handleSubmit} noValidate>
          <PasswordField
            id="currentPassword"
            label={mandatory ? "Current (temporary) password" : "Current password"}
            value={currentPassword}
            autoComplete="current-password"
            error={errors.currentPassword}
            onChange={setCurrentPassword}
          />
          <PasswordField
            id="newPassword"
            label="New password"
            value={newPassword}
            autoComplete="new-password"
            error={errors.newPassword}
            describedBy="password-rules"
            onChange={setNewPassword}
          />
          <PasswordField
            id="confirmPassword"
            label="Confirm new password"
            value={confirmPassword}
            autoComplete="new-password"
            error={errors.confirmPassword}
            onChange={setConfirmPassword}
          />

          <div className="zg-rules" id="password-rules" aria-live="polite">
            <p className="zg-rules-title">Password must:</p>
            <ul className="zg-rules-list">
              {PASSWORD_RULES.map((rule) => {
                const satisfied = newPassword.length > 0 && rule.test(newPassword);
                return (
                  <li key={rule.key} className={satisfied ? "zg-rule zg-rule-met" : "zg-rule"}>
                    <span aria-hidden="true">{satisfied ? "✓" : "•"}</span>
                    <span>{rule.label}</span>
                    <span className="visually-hidden">{satisfied ? " — met" : " — not met yet"}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <button type="submit" className="zg-btn zg-btn-primary zg-btn-block" disabled={busy}>
            {busy ? "Saving…" : "Continue"}
          </button>
        </form>
      </div>
    </main>
  );
}
