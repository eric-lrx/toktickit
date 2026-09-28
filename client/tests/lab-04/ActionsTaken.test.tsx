import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ActionsTaken from "../../src/components/ActionsTaken.js";
import RequesterTicketDetail from "../../src/RequesterTicketDetail.js";
import { AuthProvider } from "../../src/AuthContext.js";
import * as api from "../../src/api.js";
import type { ActionTaken, AuthUser, TicketDetail } from "../../src/api.js";

const STAFF = [
  { id: 2, name: "Margaret Hamilton" },
  { id: 3, name: "Katherine Johnson" },
];

function action(overrides: Partial<ActionTaken>): ActionTaken {
  return {
    id: 1,
    ticketId: 10,
    actionAt: "2026-10-01T03:00:00.000Z",
    description: "Ran diagnostics",
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
    createdAt: "2026-10-01T03:00:00.000Z",
    updatedAt: "2026-10-01T03:00:00.000Z",
    ...overrides,
  };
}

function renderStaff(ticketStatus: api.TicketStatus = "IN_PROGRESS") {
  return render(<ActionsTaken ticketId={10} ticketStatus={ticketStatus} mode="staff" staffUsers={STAFF} />);
}

describe("ActionsTaken — staff", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("UI-09 renders several actions in API order with their status labels and people", async () => {
    vi.spyOn(api, "getTicketActions").mockResolvedValue([
      action({ id: 1, description: "Ran diagnostics", status: "COMPLETED", result: "Disk OK" }),
      action({ id: 2, description: "Reimage login service", status: "IN_PROGRESS", performedByName: "Katherine Johnson", assigneeName: "Katherine Johnson", assigneeId: 3 }),
      action({ id: 3, description: "Confirm with requester", status: "PLANNED" }),
      action({ id: 4, description: "Order replacement", status: "CANCELLED", assigneeId: null, assigneeName: null, assigneeActive: null }),
    ]);
    renderStaff();

    expect(await screen.findByRole("heading", { name: "Actions Taken (4)" })).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getByTestId("action-description").textContent)).toEqual([
      "Ran diagnostics",
      "Reimage login service",
      "Confirm with requester",
      "Order replacement",
    ]);
    expect(within(rows[0]).getByText("Completed")).toBeInTheDocument();
    expect(within(rows[1]).getByText("In Progress")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Planned")).toBeInTheDocument();
    expect(within(rows[3]).getByText("Cancelled")).toBeInTheDocument();
    expect(within(rows[1]).getAllByText("Katherine Johnson").length).toBeGreaterThan(0);
    expect(within(rows[3]).getByText("Unassigned")).toBeInTheDocument();
    expect(screen.getByText("Visible to the Requester")).toBeInTheDocument();
  });

  it("UI-09 shows the empty state with an Add Action button", async () => {
    vi.spyOn(api, "getTicketActions").mockResolvedValue([]);
    renderStaff();
    expect(await screen.findByText("No actions recorded yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Action" })).toBeInTheDocument();
  });

  it("UI-10 makes the follow-up note appear and required when follow-up is ticked", async () => {
    vi.spyOn(api, "getTicketActions").mockResolvedValue([]);
    const createSpy = vi.spyOn(api, "createTicketAction").mockResolvedValue(action({ id: 9 }));
    renderStaff();

    await userEvent.click(await screen.findByRole("button", { name: "Add Action" }));
    await userEvent.type(screen.getByLabelText(/^Description/), "Reset the password");
    expect(screen.queryByLabelText(/^Follow-up note/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Follow-up required"));
    const note = screen.getByLabelText(/^Follow-up note/);
    expect(note).toBeRequired();

    await userEvent.click(screen.getByRole("button", { name: "Save Action" }));
    expect(await screen.findByText("A follow-up note is required when a follow-up is needed.")).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();

    await userEvent.type(note, "Call back on Monday");
    await userEvent.click(screen.getByRole("button", { name: "Save Action" }));
    expect(createSpy).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ description: "Reset the password", followUpRequired: true, followUpNote: "Call back on Monday" }),
      expect.any(String)
    );
  });

  it("UI-11 shows a server rejection of an inactive assignee under Assignee and keeps the entered values", async () => {
    vi.spyOn(api, "getTicketActions").mockResolvedValue([]);
    vi.spyOn(api, "createTicketAction").mockRejectedValue(
      new api.ApiError(400, "assigneeId must be an active IT Staff or Administrator user")
    );
    renderStaff();

    await userEvent.click(await screen.findByRole("button", { name: "Add Action" }));
    await userEvent.type(screen.getByLabelText(/^Description/), "Swap the keyboard");
    await userEvent.selectOptions(screen.getByLabelText("Assignee"), "3");
    await userEvent.click(screen.getByRole("button", { name: "Save Action" }));

    const error = await screen.findByText("Choose an active IT Staff member or Administrator.");
    expect(screen.getByLabelText("Assignee")).toHaveAttribute("aria-describedby", error.id);
    expect(screen.getByLabelText(/^Description/)).toHaveValue("Swap the keyboard");
    expect(screen.getByLabelText("Assignee")).toHaveValue("3");
  });

  it("UI-12 offers Start, Complete, and Cancel on a PLANNED action and no controls on a COMPLETED one", async () => {
    vi.spyOn(api, "getTicketActions").mockResolvedValue([
      action({ id: 1, description: "Planned work", status: "PLANNED" }),
      action({ id: 2, description: "Finished work", status: "COMPLETED", result: "Done" }),
    ]);
    renderStaff();

    await userEvent.click(await screen.findByRole("button", { name: "View action: Planned work" }));
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel action" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "View action: Finished work" }));
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel action" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("UI-12 requires a result to complete, then sends the completion with the read version", async () => {
    vi.spyOn(api, "getTicketActions").mockResolvedValue([action({ id: 5, description: "In flight", status: "IN_PROGRESS", version: 4 })]);
    const updateSpy = vi.spyOn(api, "updateTicketAction").mockResolvedValue(action({ id: 5, status: "COMPLETED", result: "Fixed" }));
    renderStaff();

    await userEvent.click(await screen.findByRole("button", { name: "View action: In flight" }));
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Complete" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm completion" }));
    expect(await screen.findByText("A result is required to complete an action.")).toBeInTheDocument();
    expect(updateSpy).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/^Result/), "Fixed");
    await userEvent.click(screen.getByRole("button", { name: "Confirm completion" }));
    expect(updateSpy).toHaveBeenCalledWith(5, { version: 4, status: "COMPLETED", result: "Fixed" });
  });

  it("UI-12 cancels an action only after confirming in an accessible dialog", async () => {
    vi.spyOn(api, "getTicketActions").mockResolvedValue([action({ id: 6, description: "Maybe later", status: "PLANNED", version: 2 })]);
    const updateSpy = vi.spyOn(api, "updateTicketAction").mockResolvedValue(action({ id: 6, status: "CANCELLED" }));
    renderStaff();

    await userEvent.click(await screen.findByRole("button", { name: "View action: Maybe later" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel action" }));
    const dialog = screen.getByRole("dialog", { name: "Cancel this action?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(updateSpy).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Cancel action" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Yes, cancel action" }));
    expect(updateSpy).toHaveBeenCalledWith(6, { version: 2, status: "CANCELLED" });
  });

  it("UI-13 shows a reload warning on STALE_UPDATE and keeps the typed values until reload", async () => {
    const listSpy = vi.spyOn(api, "getTicketActions").mockResolvedValue([action({ id: 7, description: "Original text", version: 1 })]);
    vi.spyOn(api, "updateTicketAction").mockRejectedValue(
      new api.ApiError(409, "This action was changed by someone else. Reload to see the latest version.", "STALE_UPDATE")
    );
    renderStaff();

    await userEvent.click(await screen.findByRole("button", { name: "View action: Original text" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const description = screen.getByLabelText(/^Description/);
    await userEvent.clear(description);
    await userEvent.type(description, "My edited text");
    await userEvent.click(screen.getByRole("button", { name: "Save Action" }));

    expect(await screen.findByText("Someone else changed this action. Reload to see the latest version.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Description/)).toHaveValue("My edited text");

    const callsBefore = listSpy.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(listSpy.mock.calls.length).toBe(callsBefore + 1);
  });

  it("UI-15 replaces Add Action with the reopen message on a resolved ticket", async () => {
    vi.spyOn(api, "getTicketActions").mockResolvedValue([action({ id: 8, status: "COMPLETED", result: "ok" })]);
    renderStaff("RESOLVED");
    expect(await screen.findByText("Reopen the ticket to record new actions.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Action" })).not.toBeInTheDocument();
  });

  it("shows a safe error with Try again when the list cannot load", async () => {
    const listSpy = vi.spyOn(api, "getTicketActions").mockRejectedValue(new Error("Unable to load actions. Please try again."));
    renderStaff();
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load actions. Please try again.");
    listSpy.mockResolvedValue([]);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No actions recorded yet.")).toBeInTheDocument();
  });
});

describe("ActionsTaken — Requester", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const REQUESTER: AuthUser = { id: 1, name: "Ada Lovelace", email: "ada.lovelace@example.com", role: "REQUESTER", mustChangePassword: false };
  const ticket: TicketDetail = {
    id: 10,
    ticketNumber: "TKT-2026-000010",
    requesterId: 1,
    categoryId: 1,
    relatedSystemId: 1,
    summary: "Laptop will not boot",
    description: "Stuck on the login screen",
    requestedPriority: "HIGH",
    status: "IN_PROGRESS",
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    resolutionSummary: null,
    requesterResolutionIndicatedAt: null,
    attachments: [],
    publicComments: [],
  };

  it("UI-14 shows Actions Taken read-only on the Requester detail and never renders Internal Notes", async () => {
    vi.spyOn(api, "getCurrentUser").mockResolvedValue(REQUESTER);
    vi.spyOn(api, "getTicket").mockResolvedValue(ticket);
    vi.spyOn(api, "getTicketActions").mockResolvedValue([
      action({ id: 1, description: "Ran diagnostics", status: "COMPLETED", result: "Disk OK", followUpRequired: true, followUpNote: "We will call you" }),
    ]);
    render(
      <MemoryRouter initialEntries={["/tickets/10"]}>
        <AuthProvider>
          <Routes>
            <Route path="/tickets/:id" element={<RequesterTicketDetail />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Actions Taken (1)" })).toBeInTheDocument();
    expect(screen.getByText("Ran diagnostics")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Action" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^View action/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "View action: Ran diagnostics" }));
    expect(screen.getByText("We will call you")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete" })).not.toBeInTheDocument();
    expect(screen.queryByText("Visible to the Requester")).not.toBeInTheDocument();
    expect(screen.queryByText(/Internal/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("internal-notes-panel")).not.toBeInTheDocument();
  });
});
