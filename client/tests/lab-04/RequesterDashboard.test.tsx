import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import RequesterDashboard from "../../src/RequesterDashboard.js";
import MyTickets from "../../src/MyTickets.js";
import Shell from "../../src/Shell.js";
import AppRoot from "../../src/AppRoot.js";
import { AuthProvider } from "../../src/AuthContext.js";
import * as api from "../../src/api.js";
import type { AuthUser, RequesterDashboardData } from "../../src/api.js";

const ADA: AuthUser = { id: 1, name: "Ada Lovelace", email: "ada.lovelace@example.com", role: "REQUESTER", mustChangePassword: false };
const OPEN_SET = "NEW,OPEN,IN_PROGRESS,REOPENED";

function data(overrides: Partial<RequesterDashboardData> = {}): RequesterDashboardData {
  return {
    metrics: [
      { key: "myOpen", label: "My Open Tickets", count: 3, drillDown: { path: "/tickets", query: { status: OPEN_SET } } },
      { key: "waitingForMe", label: "Waiting for Me", count: 1, drillDown: { path: "/tickets", query: { status: "WAITING_FOR_REQUESTER" } } },
      { key: "resolved", label: "Resolved", count: 5, drillDown: { path: "/tickets", query: { status: "RESOLVED" } } },
      { key: "closed", label: "Closed", count: 12, drillDown: { path: "/tickets", query: { status: "CLOSED" } } },
    ],
    recentTickets: [
      { id: 40, ticketNumber: "TKT-2026-000040", summary: "Laptop battery drains quickly", status: "IN_PROGRESS", updatedAt: "2026-10-01T02:14:00.000Z", resolvedAt: null },
    ],
    recentlyResolved: [
      { id: 31, ticketNumber: "TKT-2026-000031", summary: "Request software access", status: "RESOLVED", updatedAt: "2026-09-30T07:30:00.000Z", resolvedAt: "2026-09-30T07:30:00.000Z" },
    ],
    ...overrides,
  };
}

function renderDashboard() {
  vi.spyOn(api, "getCurrentUser").mockResolvedValue(ADA);
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <AuthProvider>
        <Routes>
          <Route path="/dashboard" element={<RequesterDashboard />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("RequesterDashboard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("UI-06 renders the four cards and both lists from the API", async () => {
    vi.spyOn(api, "getRequesterDashboard").mockResolvedValue(data());
    renderDashboard();
    expect(await screen.findByRole("heading", { name: "Welcome, Ada" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My Open Tickets: 3, view all" })).toHaveAttribute("href", `/tickets?status=${encodeURIComponent(OPEN_SET)}`);
    expect(screen.getByRole("link", { name: "Waiting for Me: 1, view all" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Resolved: 5, view all" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Closed: 12, view all" })).toBeInTheDocument();
    const recent = screen.getByRole("region", { name: "My Recent Tickets" });
    expect(within(recent).getByRole("link", { name: /TKT-2026-000040/ })).toHaveAttribute("href", "/tickets/40");
    const resolved = screen.getByRole("region", { name: "Recently Resolved" });
    expect(within(resolved).getByText("Request software access")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create Ticket/ })).toHaveAttribute("href", "/tickets/new");
  });

  it("UI-08 shows zeros, kept drill-downs, and the empty messages for a Requester with no Tickets", async () => {
    const empty = data({ recentTickets: [], recentlyResolved: [] });
    empty.metrics = empty.metrics.map((m) => ({ ...m, count: 0 }));
    vi.spyOn(api, "getRequesterDashboard").mockResolvedValue(empty);
    renderDashboard();
    expect(await screen.findByRole("link", { name: "My Open Tickets: 0, view all" })).toBeInTheDocument();
    expect(screen.getByText("No tickets yet")).toBeInTheDocument();
    expect(screen.getByText("Nothing resolved yet")).toBeInTheDocument();
  });

  it("shows a safe error with Try again", async () => {
    const spy = vi.spyOn(api, "getRequesterDashboard").mockRejectedValue(new Error("Dashboard data could not be loaded."));
    renderDashboard();
    expect(await screen.findByRole("alert")).toHaveTextContent("Dashboard data could not be loaded.");
    spy.mockResolvedValue(data());
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Closed: 12, view all" })).toBeInTheDocument();
  });
});

describe("My Tickets drill-down from the URL", () => {
  afterEach(() => vi.restoreAllMocks());

  it("UI-07 applies the card's status filter, shows it as removable chips, and can clear it", async () => {
    const spy = vi.spyOn(api, "getMyTickets").mockResolvedValue({ data: [], meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 } });
    render(
      <MemoryRouter initialEntries={[`/tickets?status=${OPEN_SET}`]}>
        <MyTickets />
      </MemoryRouter>
    );
    await screen.findByText(/No tickets match/i);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ status: OPEN_SET }));
    const chips = screen.getByRole("list", { name: "Active status filters" });
    expect(within(chips).getAllByRole("listitem").map((c) => c.textContent?.replace("×", "").trim())).toEqual(["New", "Open", "In Progress", "Reopened"]);

    await userEvent.click(within(chips).getByRole("button", { name: "Remove filter: Open" }));
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ status: "NEW,IN_PROGRESS,REOPENED" }));

    await userEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ status: undefined }));
    expect(screen.queryByRole("list", { name: "Active status filters" })).not.toBeInTheDocument();
  });
});

describe("Requester navigation and landing screen (FR-15)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("UI-20 puts Dashboard first for a Requester and lands there after login", async () => {
    const { unmount } = render(
      <MemoryRouter>
        <AuthProvider>
          <Shell user={ADA}>x</Shell>
        </AuthProvider>
      </MemoryRouter>
    );
    const links = within(screen.getByRole("navigation")).getAllByRole("link").map((l) => l.textContent);
    expect(links.slice(0, 3)).toEqual(["Dashboard", "My Tickets", "Create Ticket"]);
    unmount();

    vi.spyOn(api, "getCurrentUser").mockResolvedValue(ADA);
    vi.spyOn(api, "getRequesterDashboard").mockResolvedValue(data());
    window.history.pushState({}, "", "/");
    render(<AppRoot />);
    expect(await screen.findByRole("heading", { name: "Welcome, Ada" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/dashboard");
  });
});
