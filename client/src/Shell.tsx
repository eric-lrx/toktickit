import { ReactNode, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { AuthUser, Role } from "./api.js";
import { useAuth } from "./AuthContext.js";

interface Props {
  user: AuthUser;
  children: ReactNode;
}

// ui-spec.md §1 — nav is role-specific; a role never sees a link to a
// destination it cannot use. IT Staff does not submit Tickets in Lab 3, and
// Create Ticket/My Tickets are Requester-only; the Ticket Queue and Users
// screens land in Issues 35 and 38.
const NAV_BY_ROLE: Record<Role, { to: string; label: string; end?: boolean }[]> = {
  // end on "/tickets" — without it, NavLink's prefix match would also mark
  // My Tickets active while on /tickets/new or /tickets/:id.
  REQUESTER: [
    { to: "/tickets", label: "My Tickets", end: true },
    { to: "/tickets/new", label: "Create Ticket" },
  ],
  IT_STAFF: [{ to: "/queue", label: "My Queue" }],
  ADMINISTRATOR: [{ to: "/admin/users", label: "Users" }],
};

const ROLE_LABEL: Record<Role, string> = {
  REQUESTER: "Requester",
  IT_STAFF: "IT Staff",
  ADMINISTRATOR: "Administrator",
};

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? "nav-link fw-semibold text-white border-bottom border-2" : "nav-link text-white-50";

// Issue 33 — Zen Green application shell, now authenticated: name + role
// display, role-specific nav, Logout, a voluntary Change Password entry
// point. The Development Requester selector and "Change Requester" are gone
// (Issue 33 DoD — no trace reachable in the app).
export default function Shell({ user, children }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  const navLinks = NAV_BY_ROLE[user.role];

  return (
    <div>
      <header style={{ background: "var(--zg-primary)" }} className="text-white">
        <div className="container d-flex flex-wrap align-items-center justify-content-between py-2">
          <div className="d-flex align-items-center justify-content-between w-100 w-md-auto">
            <span className="fw-bold fs-5">TokTickIT</span>
            <button
              className="btn btn-sm btn-outline-light d-md-none"
              aria-label="Menu"
              onClick={() => setMobileOpen((open) => !open)}
            >
              Menu
            </button>
          </div>
          <nav
            aria-label="Main"
            data-mobile-open={mobileOpen}
            className={`w-100 w-md-auto d-md-flex flex-md-row align-items-md-center gap-md-3 mt-md-0 ${
              mobileOpen ? "d-flex flex-column align-items-start gap-2 mt-2" : "d-none"
            }`}
          >
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={navLinkClass}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="d-flex align-items-center gap-3 mt-2 mt-md-0">
            <Link to="/change-password" className="text-white-50 small">
              Change Password
            </Link>
            <span className="text-white-50 small">
              {user.name} — {ROLE_LABEL[user.role]}
            </span>
            <button className="btn btn-sm btn-outline-light" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="container py-4">{children}</main>
    </div>
  );
}
