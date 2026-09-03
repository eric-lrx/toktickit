import { ReactNode, useState } from "react";
import { NavLink } from "react-router-dom";
import { REQUESTER_STORAGE_KEY } from "./RequesterSelector.js";

interface Requester {
  id: number;
  name: string;
  email: string;
}

interface Props {
  requester: Requester;
  onChangeRequester: () => void;
  children: ReactNode;
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? "nav-link fw-semibold text-white border-bottom border-2" : "nav-link text-white-50";

// Issue 7 — Zen Green application shell: identity, nav, active-page indication,
// Requester identity + Change Requester, responsive mobile nav (ui-spec.md §4.2).
export default function Shell({ requester, onChangeRequester, children }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  function handleChangeRequester() {
    localStorage.removeItem(REQUESTER_STORAGE_KEY);
    onChangeRequester();
  }

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
            <NavLink to="/tickets" end className={navLinkClass} onClick={() => setMobileOpen(false)}>
              My Tickets
            </NavLink>
            <NavLink to="/tickets/new" className={navLinkClass} onClick={() => setMobileOpen(false)}>
              Create Ticket
            </NavLink>
            <span className="text-white-50 small ms-md-3">{requester.name}</span>
            <button className="btn btn-sm btn-outline-light" onClick={handleChangeRequester}>
              Change Requester
            </button>
          </nav>
        </div>
      </header>
      <main className="container py-4">{children}</main>
    </div>
  );
}
