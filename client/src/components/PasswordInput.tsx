interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggleShow: () => void;
  autoComplete?: string;
  fieldLabel?: string;
}

// Shared by Login and Change Password (ui-spec.md §2/§3) — icon-only
// show/hide toggle, aria-label parameterized so multiple password fields on
// the same screen (current/new/confirm) stay individually addressable.
export default function PasswordInput({
  id,
  value,
  onChange,
  show,
  onToggleShow,
  autoComplete,
  fieldLabel = "password",
}: Props) {
  return (
    <div className="input-group">
      <input
        id={id}
        type={show ? "text" : "password"}
        className="form-control"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="btn btn-outline-secondary"
        aria-label={show ? `Hide ${fieldLabel}` : `Show ${fieldLabel}`}
        onClick={onToggleShow}
      >
        {show ? "🙈" : "👁"}
      </button>
    </div>
  );
}
