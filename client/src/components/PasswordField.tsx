import { useState } from "react";

// Shared password input with a real show/hide button (ui-spec.md §7).

interface Props {
  id: string;
  label: string;
  value: string;
  autoComplete: string;
  error?: string;
  onChange: (value: string) => void;
  describedBy?: string;
}

export default function PasswordField({ id, label, value, autoComplete, error, onChange, describedBy }: Props) {
  const [visible, setVisible] = useState(false);
  const described = [error ? `${id}-error` : null, describedBy].filter(Boolean).join(" ");

  return (
    <div className="zg-field">
      <label className="zg-label" htmlFor={id}>
        {label} <span aria-hidden="true" className="zg-required">*</span>
      </label>
      <div className="zg-password-input">
        <input
          id={id}
          className={error ? "form-control zg-input zg-invalid" : "form-control zg-input"}
          type={visible ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={described || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="zg-btn zg-btn-tertiary zg-password-toggle"
          aria-pressed={visible}
          onClick={() => setVisible((shown) => !shown)}
        >
          {visible ? "Hide password" : "Show password"}
        </button>
      </div>
      {error ? (
        <span className="zg-message zg-message-error" id={`${id}-error`} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
