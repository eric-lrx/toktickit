import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import FormField from "./components/FormField.js";
import PasswordInput from "./components/PasswordInput.js";
import { useAuth } from "./AuthContext.js";

interface Props {
  mode: "mandatory" | "voluntary";
}

// Mirrors server/src/password.ts's passwordRuleViolations (BR-11) — no
// shared package between client and server in this project, so both sides
// declare the same five rules independently; each enforces its own copy.
const RULES: { key: string; label: string; test: (p: string) => boolean }[] = [
  { key: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { key: "upper", label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { key: "lower", label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { key: "digit", label: "One digit", test: (p) => /[0-9]/.test(p) },
  { key: "special", label: "One special character", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

// Issue 33 — Change Password (ui-spec.md §3). One component, two entry
// points: mandatory (first login, no way out, proceeds straight into the
// app) and voluntary (from the shell, adds Cancel, shows a success message
// instead of navigating away on its own).
export default function ChangePassword({ mode }: Props) {
  const { changePassword } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<{ currentPassword?: string; newPassword?: string; confirmPassword?: string }>(
    {}
  );
  const [apiError, setApiError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  function validate() {
    const next: typeof errors = {};
    if (!currentPassword) next.currentPassword = "Current password is required.";
    if (!newPassword) next.newPassword = "New password is required.";
    else if (RULES.some((rule) => !rule.test(newPassword))) {
      next.newPassword = "Password does not meet the requirements below.";
    } else if (newPassword === currentPassword) {
      next.newPassword = "New password must be different from the current password.";
    }
    if (confirmPassword !== newPassword) next.confirmPassword = "Passwords do not match.";
    return next;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setSubmitting(true);
    setApiError("");
    try {
      await changePassword(currentPassword, newPassword);
      if (mode === "mandatory") {
        navigate("/", { replace: true });
      } else {
        setSuccess(true);
        setSubmitting(false);
      }
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Unable to change password. Please try again.");
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="container py-5" style={{ maxWidth: 420 }}>
        <div style={{ background: "var(--zg-pale)" }} className="p-4 rounded">
          <p className="fw-semibold mb-0">Password changed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-5" style={{ maxWidth: 420 }}>
      <div style={{ background: "var(--zg-pale)" }} className="p-4 rounded">
        <h1 className="h4 mb-3">
          {mode === "mandatory" ? "You must change your password to continue." : "Change Password"}
        </h1>

        <form onSubmit={handleSubmit} noValidate>
          <FormField id="current-password" label="Current Password" required error={errors.currentPassword}>
            <PasswordInput
              id="current-password"
              value={currentPassword}
              onChange={setCurrentPassword}
              show={showCurrent}
              onToggleShow={() => setShowCurrent((v) => !v)}
              autoComplete="current-password"
              fieldLabel="current password"
            />
          </FormField>

          <FormField id="new-password" label="New Password" required error={errors.newPassword}>
            <PasswordInput
              id="new-password"
              value={newPassword}
              onChange={setNewPassword}
              show={showNew}
              onToggleShow={() => setShowNew((v) => !v)}
              autoComplete="new-password"
              fieldLabel="new password"
            />
          </FormField>

          <ul className="list-unstyled small mb-3">
            {RULES.map((rule) => {
              const started = newPassword.length > 0;
              const met = rule.test(newPassword);
              return (
                <li key={rule.key} data-met={started ? met : "neutral"}>
                  <span aria-hidden="true">{!started ? "•" : met ? "✓" : "○"}</span> {rule.label}
                </li>
              );
            })}
          </ul>

          <FormField id="confirm-password" label="Confirm New Password" required error={errors.confirmPassword}>
            <PasswordInput
              id="confirm-password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirm}
              onToggleShow={() => setShowConfirm((v) => !v)}
              autoComplete="new-password"
              fieldLabel="confirm password"
            />
          </FormField>

          {apiError && (
            <p role="alert" style={{ color: "var(--zg-error)" }} className="small mt-1">
              {apiError}
            </p>
          )}

          <div className="d-flex gap-2 mt-3">
            <button type="submit" className="btn btn-success" disabled={submitting}>
              {submitting ? "Saving…" : mode === "mandatory" ? "Continue" : "Save"}
            </button>
            {mode === "voluntary" && (
              <button type="button" className="btn btn-outline-secondary" onClick={() => navigate(-1)}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
