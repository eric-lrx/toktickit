import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StaffDashboard from "../../src/StaffDashboard.js";
import StaffTicketQueue from "../../src/StaffTicketQueue.js";
import Shell from "../../src/Shell.js";
import AppRoot from "../../src/AppRoot.js";
import { AuthProvider } from "../../src/AuthContext.js";
import * as api from "../../src/api.js";
import type { AuthUser, StaffDashboardData } from "../../src/api.js";

const ACTIVE = "NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,RESOLVED,REOPENED";
const STAFF: AuthUser = { id: 7, name: "Margaret Hamilton", email: "m@toktickit.com", role: "IT_STAFF", mustChangePassword: false };
const ADMIN: AuthUser = { id: 9, name: "Barbara Liskov", email: "b@toktickit.com", role: "ADMINISTRATOR", mustChangePassword: false };

function data(overrides: Partial<StaffDashboardData> = {}): StaffDashboardData {
  return {
    metrics: [
      { key: "new", label: "New", count: 14, drillDown: { path: "/queue", query: { status: "NEW" } } },
      { key: "open", label: "Open", count: 23, drillDown: { path: "/queue", query: { status: "OPEN" } } },
      { key: "inProgress", label: "In Progress", count: 18, drillDown: { path: "/queue", query: { status: "IN_PROGRESS" } } },
      { key: "waitingForRequester", label: "Waiting for Requester", count: 7, drillDown: { path: "/queue", query: { status: "WAITING_FOR_REQUESTER" } } },
      { key: "unassigned", label: "Unassigned", count: 9, drillDown: { path: "/queue", query: { ownerId: "unassigned", status: ACTIVE } } },
      { key: "myAssigned", label: "My Assigned", count: 16, drillDown: { path: "/queue", query: { ownerId: "7", status: ACTIVE } } },
      { key: "highPriority", label: "High Priority", count: 4, drillDown: { path: "/queue", query: { itPriority: "HIGH", status: ACTIVE } } },
      { key: "myOpenActions", label: "My Open Actions", count: 12, drillDown: { path: "#my-open-actions" } },
    ],
    myOpenActions: {
      total: 12,
      items: [{ id: 31, ticketId: 730, ticketNumber: "TKT-9999-000002", description: "Check the access point logs", status: "PLANNED", actionAt: "2026-09-25T03:23:00.000Z" }],
    },
    recentTickets: [
      { id: 730, ticketNumber: "TKT-9999-000002", summary: "Wi-Fi drops", status: "OPEN", itPriority: "HIGH", ticketOwnerName: "Margaret Hamilton", updatedAt: "2026-09-25T03:23:00.000Z" },
    ],
    ...overrides,
  };
}

function renderDashboard(user: AuthUser = STAFF) {
  vi.spyOn(api, "getCurrentUser").mockResolvedValue(user);
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <AuthProvider>
        <Routes>
          <Route path="/dashboard" element={<StaffDashboard />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("StaffDashboard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("UI-01 renders the eight cards with the API's labels and counts", async () => {
    vi.spyOn(api, "getStaffDashboard").mockResolvedValue(data());
    renderDashboard();
    expect(await screen.findByRole("heading", { name: "Welcome back, Margaret" })).toBeInTheDocument();
    for (const [label, count] of [["New", 14], ["Open", 23], ["In Progress", 18], ["Waiting for Requester", 7], ["Unassigned", 9], ["My Assigned", 16], ["High Priority", 4], ["My Open Actions", 12]] as const) {
      expect(screen.getByRole("link", { name: `${label}: ${count}, view all` })).toBeInTheDocument();
    }
  });

  it("UI-02 links every card to its drill-down with the API's query", async () => {
    vi.spyOn(api, "getStaffDashboard").mockResolvedValue(data());
    renderDashboard();
    const unassigned = await screen.findByRole("link", { name: "Unassigned: 9, view all" });
    expect(unassigned).toHaveAttribute("href", `/queue?ownerId=unassigned&status=${encodeURIComponent(ACTIVE)}`);
    expect(screen.getByRole("link", { name: "New: 14, view all" })).toHaveAttribute("href", "/queue?status=NEW");
    expect(screen.getByRole("link", { name: "My Open Actions: 12, view all" })).toHaveAttribute("href", "#my-open-actions");
    const list = screen.getByRole("region", { name: "My Open Actions" });
    expect(list).toHaveAttribute("id", "my-open-actions");
    expect(within(list).getByText("Showing 1 of 12")).toBeInTheDocument();
    expect(within(list).getByRole("link", { name: /TKT-9999-000002/ })).toHaveAttribute("href", "/queue/730");
  });

  it("UI-03 shows 0 and keeps View all on empty metrics, with empty-list messages", async () => {
    const empty = data();
    empty.metrics = empty.metrics.map((m) => ({ ...m, count: 0 }));
    empty.myOpenActions = { total: 0, items: [] };
    empty.recentTickets = [];
    vi.spyOn(api, "getStaffDashboard").mockResolvedValue(empty);
    renderDashboard();
    expect(await screen.findByRole("link", { name: "My Assigned: 0, view all" })).toBeInTheDocument();
    expect(screen.getByText("No open actions assigned to you")).toBeInTheDocument();
    expect(screen.getByText("No tickets yet")).toBeInTheDocument();
  });

  it("UI-04 shows skeletons while loading, then a safe error with Try again and no numbers", async () => {
    let reject: (e: Error) => void = () => {};
    const spy = vi.spyOn(api, "getStaffDashboard").mockReturnValue(new Promise((_, r) => (reject = r)));
    renderDashboard();
    expect(await screen.findByRole("status")).toHaveTextContent("Loading dashboard");
    reject(new Error("Dashboard data could not be loaded."));
    expect(await screen.findByRole("alert")).toHaveTextContent("Dashboard data could not be loaded.");
    expect(screen.queryByRole("link", { name: /view all/ })).not.toBeInTheDocument();
    spy.mockResolvedValue(data());
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "New: 14, view all" })).toBeInTheDocument();
  });

  it("UI-05 adds Active and Inactive Users cards for an Administrator", async () => {
    vi.spyOn(api, "getStaffDashboard").mockResolvedValue(data({ accounts: { active: 42, inactive: 3 } }));
    renderDashboard(ADMIN);
    expect(await screen.findByRole("link", { name: "Active Users: 42, view all" })).toHaveAttribute("href", "/admin/users");
    expect(screen.getByRole("link", { name: "Inactive Users: 3, view all" })).toHaveAttribute("href", "/admin/users");
    expect(screen.getByRole("link", { name: "Manage Users" })).toBeInTheDocument();
  });
});

describe("Queue drill-down from the URL", () => {
  afterEach(() => vi.restoreAllMocks());

  it("UI-02 applies the card's filter from the URL and shows it", async () => {
    const queueSpy = vi.spyOn(api, "getStaffQueue").mockResolvedValue({ data: [], meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 } });
    vi.spyOn(api, "getStaffUsers").mockResolvedValue([{ id: 7, name: "Margaret Hamilton" }]);
    render(
      <MemoryRouter initialEntries={[`/queue?ownerId=unassigned&status=${ACTIVE}`]}>
        <StaffTicketQueue />
      </MemoryRouter>
    );
    await screen.findByText(/No tickets match/i);
    expect(queueSpy).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "unassigned", status: ACTIVE }));
    expect(screen.getByLabelText("Owner")).toHaveValue("unassigned");
    expect(screen.getByLabelText("Status")).toHaveValue(ACTIVE);
    expect(screen.getByRole("option", { name: "Active (not closed or cancelled)" })).toBeInTheDocument();
  });
});

describe("Role navigation and landing screen (FR-15)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("UI-20 shows Dashboard first; the Administrator also gets My Queue", () => {
    const { unmount } = render(
      <MemoryRouter>
        <AuthProvider>
          <Shell user={STAFF}>x</Shell>
        </AuthProvider>
      </MemoryRouter>
    );
    let links = within(screen.getByRole("navigation")).getAllByRole("link").map((l) => l.textContent);
    expect(links.slice(0, 2)).toEqual(["Dashboard", "My Queue"]);
    unmount();

    render(
      <MemoryRouter>
        <AuthProvider>
          <Shell user={ADMIN}>x</Shell>
        </AuthProvider>
      </MemoryRouter>
    );
    links = within(screen.getByRole("navigation")).getAllByRole("link").map((l) => l.textContent);
    expect(links.slice(0, 3)).toEqual(["Dashboard", "My Queue", "Users"]);
  });

  it("UI-20 lands IT Staff on the dashboard after login", async () => {
    vi.spyOn(api, "getCurrentUser").mockResolvedValue(STAFF);
    vi.spyOn(api, "getStaffDashboard").mockResolvedValue(data());
    // AppRoot owns its BrowserRouter, so the starting URL is set on jsdom.
    window.history.pushState({}, "", "/");
    render(<AppRoot />);
    expect(await screen.findByRole("heading", { name: "Welcome back, Margaret" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/dashboard");
  });
});
