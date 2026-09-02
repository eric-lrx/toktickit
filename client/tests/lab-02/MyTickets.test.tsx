import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MyTickets from "../../src/MyTickets.js";
import * as api from "../../src/api.js";

function renderMyTickets(requesterId = 1) {
  return render(
    <MemoryRouter>
      <MyTickets requesterId={requesterId} />
    </MemoryRouter>
  );
}

const sampleTicket = {
  id: 1,
  ticketNumber: "TKT-2026-000001",
  requesterId: 1,
  categoryId: 1,
  relatedSystemId: 1,
  summary: "Printer jam",
  description: "Paper stuck",
  requestedPriority: "MEDIUM" as const,
  status: "NEW" as const,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

describe("MyTickets", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the empty state when the Requester has zero Tickets and no filters are applied", async () => {
    vi.spyOn(api, "getMyTickets").mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
    });
    renderMyTickets();
    expect(await screen.findByText(/create your first ticket/i)).toBeInTheDocument();
  });

  it("shows the no-results state when a search matches nothing", async () => {
    vi.spyOn(api, "getMyTickets").mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
    });
    renderMyTickets();
    const searchBox = await screen.findByLabelText(/search/i);
    await import("@testing-library/user-event").then(({ default: userEvent }) =>
      userEvent.type(searchBox, "nothing matches this")
    );
    expect(await screen.findByText(/no tickets match/i)).toBeInTheDocument();
  });

  it("reloads and shows only the new Requester's Tickets when the Requester changes", async () => {
    const spy = vi.spyOn(api, "getMyTickets").mockResolvedValueOnce({
      data: [sampleTicket],
      meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    });
    const { rerender } = renderMyTickets(1);
    expect(await screen.findByText("TKT-2026-000001")).toBeInTheDocument();

    spy.mockResolvedValueOnce({ data: [], meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 } });
    rerender(
      <MemoryRouter>
        <MyTickets requesterId={2} />
      </MemoryRouter>
    );

    expect(await screen.findByText(/create your first ticket/i)).toBeInTheDocument();
    expect(screen.queryByText("TKT-2026-000001")).not.toBeInTheDocument();
  });
});
