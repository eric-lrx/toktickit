import { ReactNode } from "react";

interface Props {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}

// Zen Green form field — ui-spec.md §3. Label above the control, red asterisk
// on required fields (never a substitute for the validation message), error
// message directly under the control.
export default function FormField({ id, label, required, error, children }: Props) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label fw-semibold">
        {label} {required && <span style={{ color: "var(--zg-error)" }}>*</span>}
      </label>
      {children}
      {error && (
        <p role="alert" style={{ color: "var(--zg-error)" }} className="small mt-1 mb-0">
          {error}
        </p>
      )}
    </div>
  );
}
