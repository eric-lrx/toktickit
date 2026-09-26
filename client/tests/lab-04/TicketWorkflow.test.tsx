import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StaffTicketDetail from "../../src/StaffTicketDetail.js";
import { AuthProvider } from "../../src/AuthContext.js";
import * as api from "../../src/api.js";
import type { ActionTaken, AuthUser, StaffTicketDetail as StaffTicketDetailType, StatusChange } from "../../src/api.js";

const STAFF_USER: AuthUser = { id: 2, name: "Margaret Hamilton", email: "m@toktickit.com", role: "IT_STAFF", mustChangePassword: false };

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
  status: "IN_PROGRESS",
  ticketOwnerId: 2,
  ticketOwnerName: "Margaret Hamilton",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  resolutionSummary: null,
  requesterResolutionIndicatedAt: null,
  version: 3,
  resolvedAt: null,
  allowedTransitions: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  attachments: [],
  publicComments: [],
  internalNotes: [],
};

const plannedAction: ActionTaken = {
  id: 5,
  ticketId: 1,
  actionAt: "2026-09-02T03:00:00.000Z",
  description: "Replace the fuser",
  result: null,
  status: "PLANNED",
  followUpRequired: false,
  followUpNote: null,
  attachmentNotes: null,
  performedById: 2,
  performedByName: "Margaret Hamilton",
  assigneeId: 2,
  assigneeName: "Margaret Hamilton",
  assigneeActive: true,
  version: 1,
  createdAt: "2026-09-02T03:00:00.000Z",
  updatedAt: "2026-09-02T03:00:00.000Z",
};

const history: StatusChange[] = [
  { id: 1, fromStatus: "NEW", toStatus: "OPEN", changedByName: "Margaret Hamilton", changedByRole: "IT_STAFF", changedAt: "2026-09-01T02:00:00.000Z" },
  { id: 2, fromStatus: "OPEN", toStatus: "IN_PROGRESS", changedByName: "Barbara Liskov", changedByRole: "ADMINISTRATOR", changedAt: "2026-09-01T05:00:00.000Z" },
];

function renderDetail(ticket: StaffTicketDetailType = baseTicket) {
  vi.spyOn(api, "getCurrentUser").mockResolvedValue(STAFF_USER);
  vi.spyOn(api, "getStaffUsers").mockResolvedValue([{ id: 2, name: "Margaret Hamilton" }]);
  const ticketSpy = vi.spyOn(api, "getStaffTicket").mockResolvedValue(ticket);
  const historySpy = vi.spyOn(api, "getStatusHistory").mockResolvedValue(history);
  vi.spyOn(api, "getTicketActions").mockResolvedValue([plannedAction]);
  render(
    <MemoryRouter initialEntries={["/queue/1"]}>
      <AuthProvider>
        <Routes>
          <Route path="/queue/:id" element={<StaffTicketDetail />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
  return { ticketSpy, historySpy };
}

describe("Ticket workflow controls", () => {
  afterEach(() => vi.restoreAllMocks());

  it("UI-16 offers exactly the transitions the API returns, not a local copy of the matrix", async () => {
    // The API is the authority: a list that differs from the matrix is still
    // what the dropdown must show.
    renderDetail({ ...baseTicket, status: "OPEN", allowedTransitions: ["CANCELLED"] });
    const select = await screen.findByLabelText(/^Status$/);
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.getAttribute("value"));
    expect(options).toEqual(["OPEN", "CANCELLED"]);
  });

  it("UI-17 explains a RESOLUTION_BLOCKED refusal and highlights the blocking action", async () => {
    renderDetail();
    vi.spyOn(api, "setTicketStatus").mockRejectedValue(
      new api.ApiError(409, "Resolve or cancel the open Actions Taken first.", "RESOLUTION_BLOCKED", { blockingActionIds: [5] })
    );

    await userEvent.selectOptions(await screen.findByLabelText(/^Status$/), "RESOLVED");
    await userEvent.type(screen.getByLabelText("Resolution Summary"), "Fuser replaced");
    await userEvent.click(screen.getByRole("button", { name: "Save and mark Resolved" }));

    const message = await screen.findByText("This ticket still has open actions. Complete or cancel them before resolving.");
    expect(message.closest("[role=alert]")).not.toBeNull();
    const link = screen.getByRole("link", { name: "Replace the fuser" });
    expect(link).toHaveAttribute("href", "#action-5");
    const row = document.getElementById("action-5")!;
    expect(row).toHaveClass("action-row-blocking");
    expect(within(row).getByText("Blocking resolution")).toBeInTheDocument();
  });

  it("UI-18 refreshes the badge, the options, and the history after a successful change, and announces it", async () => {
    const { ticketSpy, historySpy } = renderDetail();
    const statusSpy = vi.spyOn(api, "setTicketStatus").mockResolvedValue({ version: 4 });
    await screen.findByLabelText(/^Status$/);
    ticketSpy.mockResolvedValue({ ...baseTicket, status: "WAITING_FOR_REQUESTER", version: 4, allowedTransitions: ["IN_PROGRESS", "RESOLVED", "CANCELLED"] });
    const historyCalls = historySpy.mock.calls.length;

    await userEvent.selectOptions(screen.getByLabelText(/^Status$/), "WAITING_FOR_REQUESTER");

    expect(statusSpy).toHaveBeenCalledWith(1, "WAITING_FOR_REQUESTER", undefined, 3);
    const announcement = await screen.findByText("Status changed to Waiting for Requester");
    expect(announcement.closest("[aria-live=polite]")).not.toBeNull();
    const options = Array.from(screen.getByLabelText(/^Status$/).querySelectorAll("option")).map((o) => o.getAttribute("value"));
    expect(options).toEqual(["WAITING_FOR_REQUESTER", "IN_PROGRESS", "RESOLVED", "CANCELLED"]);
    expect(historySpy.mock.calls.length).toBeGreaterThan(historyCalls);
  });

  it("UI-19 renders the status history oldest first with who and when", async () => {
    renderDetail();
    const timeline = await screen.findByRole("list", { name: "History of status changes" });
    const items = within(timeline).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("New → Open");
    expect(items[0]).toHaveTextContent("Margaret Hamilton");
    expect(items[0]).toHaveTextContent("IT Staff");
    expect(items[1]).toHaveTextContent("Open → In Progress");
    expect(items[1]).toHaveTextContent("Barbara Liskov");
    expect(items[1]).toHaveTextContent("Administrator");
  });

  it("sends the version it read and shows a reload warning on a stale ticket update", async () => {
    const { ticketSpy } = renderDetail();
    const ownerSpy = vi
      .spyOn(api, "setTicketItPriority")
      .mockRejectedValue(new api.ApiError(409, "This ticket was changed by someone else.", "STALE_UPDATE"));
    await userEvent.selectOptions(await screen.findByLabelText("IT Priority"), "HIGH");
    expect(ownerSpy).toHaveBeenCalledWith(1, "HIGH", 3);
    expect(await screen.findByText("Someone else changed this ticket. Reload to see the latest version.")).toBeInTheDocument();
    const calls = ticketSpy.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(ticketSpy.mock.calls.length).toBe(calls + 1);
  });
});
