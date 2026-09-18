import { FormEvent, useState } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { ROLE_HOME } from "../api/auth.js";
import { useAuth } from "../context/AuthContext.js";
import PasswordField from "../components/PasswordField.js";

// Login — docs/lab-03/ui-spec.md §5.1, api-spec.md §3.1.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) {
    return <Navigate to={user.mustChangePassword ? "/change-password" : ROLE_HOME[user.role]} replace />;
  }

  function validate() {
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) errors.email = "Enter your email address";
    else if (!EMAIL_PATTERN.test(email.trim())) errors.email = "Enter a valid email address";
    if (!password) errors.password = "Enter your password";
    return errors;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    try {
      const signedIn = await signIn(email.trim(), password);
      const target = signedIn.mustChangePassword
        ? "/change-password"
        : location.state?.from && !signedIn.mustChangePassword
          ? location.state.from
          : ROLE_HOME[signedIn.role];
      navigate(target, { replace: true });
    } catch (error) {
      setPassword("");
      if (error instanceof ApiError && error.fields?.length) {
        const next: { email?: string; password?: string } = {};
        for (const field of error.fields) {
          if (field.field === "email") next.email = field.message;
          if (field.field === "password") next.password = field.message;
        }
        setFieldErrors(next);
      } else if (error instanceof ApiError) {
        setFailure(error.message);
      } else {
        setFailure("Unable to sign in right now. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="zg-auth-page">
      <div className="zg-auth-card zg-card">
        <p className="zg-brand zg-auth-brand">TokTickIT</p>
        <h1 className="zg-page-title">Sign in to your account</h1>

        {failure ? (
          <div className="zg-callout zg-callout-error" role="alert">
            {failure}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} noValidate>
          <div className="zg-field">
            <label className="zg-label" htmlFor="email">
              Email address <span aria-hidden="true" className="zg-required">*</span>
            </label>
            <input
              id="email"
              className={fieldErrors.email ? "form-control zg-input zg-invalid" : "form-control zg-input"}
              type="email"
              autoComplete="username"
              value={email}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
            {fieldErrors.email ? (
              <span className="zg-message zg-message-error" id="email-error" role="alert">
                {fieldErrors.email}
              </span>
            ) : null}
          </div>

          <PasswordField
            id="password"
            label="Password"
            value={password}
            autoComplete="current-password"
            error={fieldErrors.password}
            onChange={setPassword}
          />

          <button type="submit" className="zg-btn zg-btn-primary zg-btn-block" disabled={busy}>
            {busy ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </main>
  );
}
