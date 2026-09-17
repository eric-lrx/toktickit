import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import FormField from "./components/FormField.js";
import PasswordInput from "./components/PasswordInput.js";
import { useAuth } from "./AuthContext.js";

// Issue 33 — Login (ui-spec.md §2). No "Forgot your password?" link — excluded
// by the handout (§4.2); an Administrator issues a new initial password instead.
export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [apiError, setApiError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function validate() {
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = "Email is required.";
    if (!password) next.password = "Password is required.";
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
      const user = await login(email.trim(), password);
      navigate(user.mustChangePassword ? "/change-password" : "/", { replace: true });
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Unable to sign in. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 420 }}>
      <div style={{ background: "var(--zg-pale)" }} className="p-4 rounded">
        <h1 className="h3 mb-1 text-center">TokTickIT</h1>
        <p className="text-muted text-center mb-4">Sign in to your account</p>

        <form onSubmit={handleSubmit} noValidate>
          <FormField id="email" label="Email" required error={errors.email}>
            <input
              id="email"
              type="text"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </FormField>

          <FormField id="password" label="Password" required error={errors.password}>
            <PasswordInput
              id="password"
              value={password}
              onChange={setPassword}
              show={showPassword}
              onToggleShow={() => setShowPassword((v) => !v)}
              autoComplete="current-password"
            />
          </FormField>

          {apiError && (
            <p role="alert" style={{ color: "var(--zg-error)" }} className="small mt-1">
              {apiError}
            </p>
          )}

          <button type="submit" className="btn btn-success w-100 mt-2" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
