import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext.js";
import Login from "./Login.js";
import ChangePassword from "./ChangePassword.js";
import Shell from "./Shell.js";
import CreateTicket from "./CreateTicket.js";
import MyTickets from "./MyTickets.js";
import RequesterTicketDetail from "./RequesterTicketDetail.js";
import StaffTicketQueue from "./StaffTicketQueue.js";
import StaffTicketDetail from "./StaffTicketDetail.js";
import StaffDashboard from "./StaffDashboard.js";
import RequesterDashboard from "./RequesterDashboard.js";
import UserManagement from "./UserManagement.js";
import { Role } from "./api.js";

const ROLE_HOME: Record<Role, string> = {
  REQUESTER: "/dashboard",
  // Lab 4 (FR-15) — the dashboard is the staff roles' starting point.
  IT_STAFF: "/dashboard",
  ADMINISTRATOR: "/dashboard",
};

// Issue 33 — every screen lives under one Router now (Login and Change
// Password included), so Login's post-submit navigate() and the guards
// below are ordinary route-level redirects rather than component swaps.
export default function AppRoot() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <p className="text-muted p-4">Loading…</p>;
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/change-password"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : (
            <ChangePassword mode={user.mustChangePassword ? "mandatory" : "voluntary"} />
          )
        }
      />
      <Route path="/*" element={<AuthenticatedApp />} />
    </Routes>
  );
}

// Everything else requires a session with mustChangePassword already
// cleared — the mandatory Change Password screen has no nav and no way to
// reach any of this (ui-spec.md §3), enforced here, not just by hiding a link.
function AuthenticatedApp() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;

  return (
    <Shell user={user}>
      <Routes>
        <Route path="/" element={<Navigate to={ROLE_HOME[user.role]} replace />} />
        {user.role === "REQUESTER" && (
          <>
            <Route path="/dashboard" element={<RequesterDashboard />} />
            <Route path="/tickets" element={<MyTickets />} />
            <Route path="/tickets/new" element={<CreateTicket />} />
            <Route path="/tickets/:id" element={<RequesterTicketDetail />} />
          </>
        )}
        {(user.role === "IT_STAFF" || user.role === "ADMINISTRATOR") && (
          <>
            <Route path="/dashboard" element={<StaffDashboard />} />
            <Route path="/queue" element={<StaffTicketQueue />} />
            <Route path="/queue/:id" element={<StaffTicketDetail />} />
          </>
        )}
        {user.role === "ADMINISTRATOR" && <Route path="/admin/users" element={<UserManagement />} />}
      </Routes>
    </Shell>
  );
}
