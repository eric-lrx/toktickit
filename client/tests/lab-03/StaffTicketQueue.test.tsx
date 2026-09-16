import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StaffTicketQueue from "../../src/StaffTicketQueue.js";
import * as api from "../../src/api.js";
import type { StaffTicket } from "../../src/api.js";

function renderQueue() {
  return render(
    <MemoryRouter>
      <StaffTicketQueue />
    </MemoryRouter>
  );
}

const sampleTicket: StaffTicket = {
  id: 1,
  ticketNumber: "TKT-2026-000001",
  requesterId: 1,
  categoryId: 1,
  categoryName: "Hardware",
  relatedSystemId: 1,
  summary: "Printer jam",
  description: "Paper stuck",
  requestedPriority: "MEDIUM",
  itPriority: "HIGH",
  status: "OPEN",
  ticketOwnerId: 2,
  ticketOwnerName: "Margaret Hamilton",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

describe("StaffTicketQueue", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("UI-11 renders a row with Ticket Number, Status, both priorities, and Owner", async () => {
    vi.spyOn(api, "getStaffQueue").mockResolvedValue({
      data: [sampleTicket],
      meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    });
    renderQueue();

    expect((await screen.findAllByText("TKT-2026-000001")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/open/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("MEDIUM").length).toBeGreaterThan(0);
    expect(screen.getAllByText("HIGH").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Margaret Hamilton").length).toBeGreaterThan(0);
  });

  it("shows Unassigned for a Ticket with no owner", async () => {
    vi.spyOn(api, "getStaffQueue").mockResolvedValue({
      data: [{ ...sampleTicket, ticketOwnerId: null, ticketOwnerName: null }],
      meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    });
    renderQueue();
    expect((await screen.findAllByText(/unassigned/i)).length).toBeGreaterThan(0);
  });

  it("UI-12 shows the empty state when no Tickets exist at all", async () => {
    vi.spyOn(api, "getStaffQueue").mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
    });
    renderQueue();
    expect(await screen.findByText(/no tickets yet/i)).toBeInTheDocument();
  });

  it("UI-12 shows the no-results state, distinct from empty, when filters match nothing", async () => {
    vi.spyOn(api, "getStaffQueue").mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
    });
    renderQueue();
    await screen.findByText(/no tickets yet/i);

    await import("@testing-library/user-event").then(({ default: userEvent }) =>
      userEvent.type(screen.getByLabelText(/search/i), "nothing matches this")
    );

    expect(await screen.findByRole("button", { name: /clear filters/i })).toBeInTheDocument();
    expect(screen.queryByText(/no tickets yet/i)).not.toBeInTheDocument();
  });

  it("UI-13 shows a forbidden message, not a raw error, on a mocked 403", async () => {
    vi.spyOn(api, "getStaffQueue").mockRejectedValue(new Error("You do not have access to the ticket queue."));
    renderQueue();
    expect(await screen.findByText(/you do not have access to the ticket queue/i)).toBeInTheDocument();
  });

  it("shows a failure state with a retry action on an unexpected error", async () => {
    const spy = vi
      .spyOn(api, "getStaffQueue")
      .mockRejectedValueOnce(new Error("Unable to load the ticket queue. Please try again."));
    renderQueue();
    expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument();

    spy.mockResolvedValueOnce({ data: [sampleTicket], meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 } });
    await import("@testing-library/user-event").then(({ default: userEvent }) =>
      userEvent.click(screen.getByRole("button", { name: /retry/i }))
    );
    expect((await screen.findAllByText("TKT-2026-000001")).length).toBeGreaterThan(0);
  });
});
