import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StaffTicketDetail from "../../src/StaffTicketDetail.js";
import { AuthProvider } from "../../src/AuthContext.js";
import * as api from "../../src/api.js";
import type { StaffTicketDetail as StaffTicketDetailType, AuthUser } from "../../src/api.js";

const CURRENT_USER: AuthUser = {
  id: 2,
  name: "Margaret Hamilton",
  email: "margaret.hamilton@toktickit.com",
  role: "IT_STAFF",
  mustChangePassword: false,
};

const baseTicket: StaffTicketDetailType = {
  id: 1,
  ticketNumber: "TKT-2026-000001",
  requesterId: 1,
  categoryId: 1,
  categoryName: "Hardware",
  relatedSystemId: 1,
  summary: "Printer jam",
  description: "Paper stuck",
  requestedPriority: "MEDIUM",
  itPriority: "MEDIUM",
  status: "OPEN",
  ticketOwnerId: null,
  ticketOwnerName: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  resolutionSummary: null,
  requesterResolutionIndicatedAt: null,
  // Lab 4 contract fields (docs/lab-04/tests.md §3): the API now returns the
  // matrix row for the current status, which the UI renders as-is.
  version: 1,
  resolvedAt: null,
  allowedTransitions: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  attachments: [],
  publicComments: [],
  internalNotes: [],
};

function renderDetail() {
  vi.spyOn(api, "getCurrentUser").mockResolvedValue(CURRENT_USER);
  vi.spyOn(api, "getStaffUsers").mockResolvedValue([
    { id: 2, name: "Margaret Hamilton" },
    { id: 3, name: "Katherine Johnson" },
  ]);
  return render(
    <MemoryRouter initialEntries={["/queue/1"]}>
      <AuthProvider>
        <Routes>
          <Route path="/queue/:id" element={<StaffTicketDetail />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("StaffTicketDetail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("UI-14 calls the owner endpoint with the current user when Claim is clicked", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue({ ...baseTicket, ticketOwnerId: null, ticketOwnerName: null });
    const ownerSpy = vi.spyOn(api, "setTicketOwner").mockResolvedValue({ version: 2 });
    renderDetail();

    const claimButton = await screen.findByRole("button", { name: /claim/i });
    await userEvent.click(claimButton);

    // Lab 4 (BR-21, docs/lab-04/tests.md §3): the claim also sends the version it read.
    expect(ownerSpy).toHaveBeenCalledWith(1, CURRENT_USER.id, 1);
  });

  it("does not show a Claim button once the Ticket has an owner", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue({ ...baseTicket, ticketOwnerId: 2, ticketOwnerName: "Margaret Hamilton" });
    renderDetail();
    await screen.findByText("TKT-2026-000001");
    expect(screen.queryByRole("button", { name: /claim/i })).not.toBeInTheDocument();
  });

  it("UI-15 the Status dropdown only offers the current status and its allowed transitions", async () => {
    // OPEN allows IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CANCELLED.
    vi.spyOn(api, "getStaffTicket").mockResolvedValue({ ...baseTicket, status: "OPEN" });
    renderDetail();

    const statusSelect = await screen.findByLabelText(/^status/i);
    const options = Array.from(statusSelect.querySelectorAll("option")).map((o) => o.getAttribute("value"));
    expect(options).toEqual(["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]);
  });

  it("UI-15 offers no transitions when the Ticket is Cancelled (terminal)", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue({ ...baseTicket, status: "CANCELLED", allowedTransitions: [] });
    renderDetail();

    const statusSelect = await screen.findByLabelText(/^status/i);
    const options = Array.from(statusSelect.querySelectorAll("option")).map((o) => o.getAttribute("value"));
    expect(options).toEqual(["CANCELLED"]);
  });

  it("UI-16 renders Public Comments and Internal Notes in two distinct panels", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue({
      ...baseTicket,
      publicComments: [{ id: 1, authorName: "Ada Lovelace", authorRole: "REQUESTER", content: "Any update?", createdAt: "2026-09-01T00:00:00.000Z" }],
      internalNotes: [{ id: 1, authorName: "Katherine Johnson", content: "Escalated to network team.", createdAt: "2026-09-01T00:00:00.000Z" }],
    });
    renderDetail();

    const publicPanel = await screen.findByTestId("public-comments-panel");
    const internalPanel = await screen.findByTestId("internal-notes-panel");
    expect(publicPanel).not.toBe(internalPanel);
    expect(publicPanel.className).not.toBe(internalPanel.className);
    expect(internalPanel).toHaveTextContent(/internal.*not visible to requester/i);
    expect(publicPanel).toHaveTextContent("Any update?");
    expect(internalPanel).toHaveTextContent("Escalated to network team.");
    // Cross-check: neither panel's content leaked into the other.
    expect(publicPanel).not.toHaveTextContent("Escalated to network team.");
    expect(internalPanel).not.toHaveTextContent("Any update?");
  });
});
