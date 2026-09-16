import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import RequesterTicketDetail from "../../src/RequesterTicketDetail.js";
import * as api from "../../src/api.js";

const sampleTicket = {
  id: 1,
  ticketNumber: "TKT-2026-000001",
  requesterId: 1,
  categoryId: 1,
  relatedSystemId: 1,
  summary: "Printer jam",
  description: "Paper stuck in tray 2",
  requestedPriority: "HIGH" as const,
  status: "NEW" as const,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  resolutionSummary: null,
  requesterResolutionIndicatedAt: null,
  attachments: [],
  publicComments: [],
};

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/tickets/1"]}>
      <Routes>
        <Route path="/tickets/:id" element={<RequesterTicketDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("RequesterTicketDetail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the Ticket's fields as read-only, with no editable inputs outside the comment box", async () => {
    vi.spyOn(api, "getTicket").mockResolvedValue(sampleTicket);
    renderDetail();

    expect(await screen.findByText("TKT-2026-000001")).toBeInTheDocument();
    expect(screen.getByText("Printer jam")).toBeInTheDocument();
    expect(screen.getByText("Paper stuck in tray 2")).toBeInTheDocument();
    // Issue 37 adds the Public Comments textarea to this screen — it is the
    // only textbox; none of the Ticket's own fields (summary/description/
    // priority/status) are editable.
    const textboxes = screen.queryAllByRole("textbox");
    expect(textboxes).toHaveLength(1);
    expect(textboxes[0]).toHaveAttribute("id", "public-comment-input");
    expect(screen.queryByRole("button", { name: /submit/i })).not.toBeInTheDocument();
  });

  it("shows a not-found/safe state when the Ticket is not owned or does not exist", async () => {
    vi.spyOn(api, "getTicket").mockRejectedValue(new Error("Ticket not found"));
    renderDetail();
    expect(await screen.findByText(/ticket not found/i)).toBeInTheDocument();
  });
});
