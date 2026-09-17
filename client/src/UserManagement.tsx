import { FormEvent, useEffect, useState } from "react";
import Badge, { BadgeTone } from "./components/Badge.js";
import FormField from "./components/FormField.js";
import PasswordInput from "./components/PasswordInput.js";
import { useAuth } from "./AuthContext.js";
import {
  AdminUser,
  createAdminUser,
  getAdminUsers,
  Role,
  setAdminUserPassword,
  updateAdminUser,
} from "./api.js";

type LoadState = "loading" | "loaded" | "forbidden" | "error";
type Panel = { mode: "create" } | { mode: "edit"; user: AdminUser };

const ROLES: Role[] = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"];
const ROLE_LABEL: Record<Role, string> = { REQUESTER: "Requester", IT_STAFF: "IT Staff", ADMINISTRATOR: "Administrator" };
const ROLE_TONE: Record<Role, BadgeTone> = { REQUESTER: "pale", IT_STAFF: "warning", ADMINISTRATOR: "outline" };

// Mirrors server/src/password.ts's passwordRuleViolations (BR-11) — see
// ChangePassword.tsx's identical comment on why this isn't shared code.
const PASSWORD_RULES: { key: string; label: string; test: (p: string) => boolean }[] = [
  { key: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { key: "upper", label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { key: "lower", label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { key: "digit", label: "One digit", test: (p) => /[0-9]/.test(p) },
  { key: "special", label: "One special character", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

// Issue 38 — the minimalist Administrator User Management screen
// (ui-spec.md §7): list + a side panel shared between create and edit mode.
// Deactivate/last-Administrator/self-deactivation are all re-checked
// server-side regardless of what this screen disables (BR-28/29/30) — the
// disabled state here is a UX courtesy, not the enforcement.
export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    getAdminUsers({ search: search.trim() || undefined, role: roleFilter || undefined })
      .then((data) => {
        if (cancelled) return;
        setUsers(data);
        setState("loaded");
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unable to load users.";
        setErrorMessage(message);
        setState(message.toLowerCase().includes("access") ? "forbidden" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [search, roleFilter, reloadToken]);

  const activeAdminCount = users.filter((u) => u.role === "ADMINISTRATOR" && u.isActive).length;

  async function refresh() {
    setReloadToken((n) => n + 1);
  }

  return (
    <div>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3">
        <div className="d-flex flex-wrap gap-2 align-items-end">
          <div>
            <label htmlFor="userSearch" className="form-label small fw-semibold mb-1">
              Search
            </label>
            <input
              id="userSearch"
              className="form-control"
              placeholder="Name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="userRoleFilter" className="form-label small fw-semibold mb-1">
              Role
            </label>
            <select
              id="userRoleFilter"
              className="form-select"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as Role | "")}
            >
              <option value="">All</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button type="button" className="btn btn-success" onClick={() => setPanel({ mode: "create" })}>
          Create User
        </button>
      </div>

      {state === "loading" && <p role="status">Loading users…</p>}

      {state === "forbidden" && (
        <p role="alert" style={{ color: "var(--zg-error)" }}>
          {errorMessage}
        </p>
      )}

      {state === "error" && (
        <div>
          <p role="alert" style={{ color: "var(--zg-error)" }} className="mb-2">
            {errorMessage}
          </p>
          <button className="btn btn-outline-secondary" onClick={refresh}>
            Retry
          </button>
        </div>
      )}

      {state === "loaded" && users.length === 0 && <p className="text-muted text-center py-5">No users match.</p>}

      {state === "loaded" && users.length > 0 && (
        <>
          {/* ui-spec.md §9 — no horizontal scroll on mobile; below md, the
              table gives way to cards entirely (same split as
              StaffTicketQueue.tsx) rather than relying on a scrollable
              table, which left Role/Status/Edit unreachable without first
              discovering the gesture. */}
          <div className="d-none d-md-block table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>
                      <span
                        title={u.email}
                        style={{
                          display: "inline-block",
                          maxWidth: 150,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          verticalAlign: "bottom",
                        }}
                      >
                        {u.email}
                      </span>
                    </td>
                    <td>
                      <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                    </td>
                    <td>
                      <Badge tone={u.isActive ? "success" : "neutral"}>{u.isActive ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => setPanel({ mode: "edit", user: u })}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="d-md-none d-flex flex-column gap-2">
            {users.map((u) => (
              <div key={u.id} className="p-3 rounded" style={{ background: "var(--zg-surface)", border: "1px solid var(--zg-surface-border)" }}>
                <div className="d-flex justify-content-between align-items-start gap-2">
                  <div>
                    <strong>{u.name}</strong>
                    <p className="mb-0 small text-muted">{u.email}</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary flex-shrink-0"
                    onClick={() => setPanel({ mode: "edit", user: u })}
                  >
                    Edit
                  </button>
                </div>
                <div className="d-flex gap-1 mt-2">
                  <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                  <Badge tone={u.isActive ? "success" : "neutral"}>{u.isActive ? "Active" : "Inactive"}</Badge>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {panel && (
        <UserPanel
          panel={panel}
          currentUserId={currentUser?.id ?? null}
          activeAdminCount={activeAdminCount}
          onClose={() => setPanel(null)}
          onSaved={() => {
            setPanel(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

interface PanelProps {
  panel: Panel;
  currentUserId: number | null;
  activeAdminCount: number;
  onClose: () => void;
  onSaved: () => void;
}

function UserPanel({ panel, currentUserId, activeAdminCount, onClose, onSaved }: PanelProps) {
  const isEdit = panel.mode === "edit";
  const existing = isEdit ? panel.user : null;

  const [name, setName] = useState(existing?.name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [role, setRole] = useState<Role>(existing?.role ?? "REQUESTER");
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [initialPassword, setInitialPassword] = useState("");
  const [showInitialPassword, setShowInitialPassword] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; initialPassword?: string }>({});
  const [apiError, setApiError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [deactivateError, setDeactivateError] = useState("");

  const [settingPassword, setSettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);

  const isSelf = isEdit && existing!.id === currentUserId;
  const isLastActiveAdmin = isEdit && existing!.role === "ADMINISTRATOR" && existing!.isActive && activeAdminCount <= 1;
  const deactivateDisabled = !isEdit || !existing!.isActive || isSelf || isLastActiveAdmin;
  const deactivateTitle = isSelf
    ? "You cannot deactivate your own account."
    : isLastActiveAdmin
      ? "At least one active Administrator must remain."
      : !isEdit || !existing!.isActive
        ? "This user is already inactive."
        : "";

  function validate() {
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Full name is required.";
    if (!email.trim()) next.email = "Email is required.";
    if (!isEdit) {
      const violations = PASSWORD_RULES.filter((r) => !r.test(initialPassword)).map((r) => r.label);
      if (violations.length > 0) next.initialPassword = "Password does not meet the requirements below.";
    }
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
      if (isEdit) {
        await updateAdminUser(existing!.id, { name: name.trim(), email: email.trim(), role, isActive });
      } else {
        await createAdminUser({ name: name.trim(), email: email.trim(), role, isActive, initialPassword });
      }
      onSaved();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Unable to save this user. Please try again.");
      setSubmitting(false);
    }
  }

  async function handleDeactivate() {
    if (!existing) return;
    setDeactivateError("");
    try {
      await updateAdminUser(existing.id, { isActive: false });
      onSaved();
    } catch (err) {
      setDeactivateError(err instanceof Error ? err.message : "Unable to deactivate this user. Please try again.");
      setConfirmingDeactivate(false);
    }
  }

  async function handleSetPassword(e: FormEvent) {
    e.preventDefault();
    if (!existing) return;
    const violations = PASSWORD_RULES.filter((r) => !r.test(newPassword));
    if (violations.length > 0) {
      setPasswordError("Password does not meet the requirements below.");
      return;
    }
    setPasswordError("");
    try {
      await setAdminUserPassword(existing.id, newPassword);
      setPasswordSet(true);
      setSettingPassword(false);
      setNewPassword("");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Unable to set the new password. Please try again.");
    }
  }

  return (
    <div
      role="dialog"
      aria-label={isEdit ? "Edit User" : "Create User"}
      className="p-3 mt-4 rounded"
      style={{ background: "var(--zg-pale)", maxWidth: 480 }}
    >
      <h2 className="h5 mb-3">{isEdit ? "Edit User" : "Create User"}</h2>

      <form onSubmit={handleSubmit} noValidate>
        <FormField id="userName" label="Full Name" required error={errors.name}>
          <input id="userName" className="form-control" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>

        <FormField id="userEmail" label="Email" required error={errors.email}>
          <input id="userEmail" type="email" className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>

        <FormField id="userRole" label="Role" required>
          <select id="userRole" className="form-select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </FormField>

        <div className="form-check mb-3">
          <input
            id="userActive"
            type="checkbox"
            className="form-check-input"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <label htmlFor="userActive" className="form-check-label">
            Active
          </label>
        </div>

        {!isEdit && (
          <>
            <FormField id="userInitialPassword" label="Initial Password" required error={errors.initialPassword}>
              <PasswordInput
                id="userInitialPassword"
                value={initialPassword}
                onChange={setInitialPassword}
                show={showInitialPassword}
                onToggleShow={() => setShowInitialPassword((v) => !v)}
                autoComplete="new-password"
                fieldLabel="initial password"
              />
            </FormField>
            <ul className="list-unstyled small mb-3">
              {PASSWORD_RULES.map((rule) => {
                const started = initialPassword.length > 0;
                const met = rule.test(initialPassword);
                return (
                  <li key={rule.key} data-met={started ? met : "neutral"}>
                    <span aria-hidden="true">{!started ? "•" : met ? "✓" : "○"}</span> {rule.label}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {apiError && (
          <p role="alert" style={{ color: "var(--zg-error)" }} className="small mt-1">
            {apiError}
          </p>
        )}

        <div className="d-flex flex-wrap gap-2 mt-3">
          <button type="submit" className="btn btn-success" disabled={submitting}>
            {submitting ? "Saving…" : "Save User"}
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          {isEdit && !confirmingDeactivate && (
            <button
              type="button"
              className="btn btn-outline-danger ms-auto"
              disabled={deactivateDisabled}
              title={deactivateTitle}
              onClick={() => setConfirmingDeactivate(true)}
            >
              Deactivate User
            </button>
          )}
        </div>
      </form>

      {confirmingDeactivate && (
        <div className="mt-3 p-2 rounded" style={{ background: "var(--zg-warning-bg)" }}>
          <p className="small mb-2">Deactivate {existing?.name}? They will no longer be able to log in.</p>
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-sm btn-danger" onClick={handleDeactivate}>
              Confirm deactivation
            </button>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setConfirmingDeactivate(false)}>
              Cancel
            </button>
          </div>
          {deactivateError && (
            <p role="alert" style={{ color: "var(--zg-error)" }} className="small mt-2 mb-0">
              {deactivateError}
            </p>
          )}
        </div>
      )}

      {isEdit && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--zg-surface-border)" }}>
          {!settingPassword && !passwordSet && (
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setSettingPassword(true)}>
              Set new password
            </button>
          )}
          {passwordSet && <p className="small mb-0">New password set — {existing?.name} must change it at next login.</p>}
          {settingPassword && (
            <form onSubmit={handleSetPassword}>
              <FormField id="newAdminPassword" label="New Password" required error={passwordError}>
                <PasswordInput
                  id="newAdminPassword"
                  value={newPassword}
                  onChange={setNewPassword}
                  show={showNewPassword}
                  onToggleShow={() => setShowNewPassword((v) => !v)}
                  autoComplete="new-password"
                  fieldLabel="new password"
                />
              </FormField>
              <ul className="list-unstyled small mb-2">
                {PASSWORD_RULES.map((rule) => {
                  const started = newPassword.length > 0;
                  const met = rule.test(newPassword);
                  return (
                    <li key={rule.key} data-met={started ? met : "neutral"}>
                      <span aria-hidden="true">{!started ? "•" : met ? "✓" : "○"}</span> {rule.label}
                    </li>
                  );
                })}
              </ul>
              <div className="d-flex gap-2">
                <button type="submit" className="btn btn-sm btn-success">
                  Confirm new password
                </button>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setSettingPassword(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
