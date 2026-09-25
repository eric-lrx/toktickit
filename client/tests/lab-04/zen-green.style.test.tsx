import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Badge from "../../src/components/Badge.js";
import ActionsTaken from "../../src/components/ActionsTaken.js";
import StaffTicketDetail from "../../src/StaffTicketDetail.js";
import { AuthProvider } from "../../src/AuthContext.js";
import * as api from "../../src/api.js";
import type { ActionStatus, ActionTaken, AuthUser, StaffTicketDetail as StaffTicketDetailType } from "../../src/api.js";
import { ACTION_STATUSES, ACTION_STATUS_LABELS, actionStatusTone } from "../../src/actionStatus.js";

const anAction: ActionTaken = {
  id: 1,
  ticketId: 1,
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
};

describe("Zen Green style — Action status badges", () => {
  it("STYLE-02 gives each of the 4 action statuses a distinct class and a text label", () => {
    const classes = new Set<string>();
    const labels = new Set<string>();
    ACTION_STATUSES.forEach((status: ActionStatus) => {
      const tone = actionStatusTone(status);
      const { container, unmount } = render(<Badge tone={tone}>{ACTION_STATUS_LABELS[status]}</Badge>);
      const badge = container.firstElementChild as HTMLElement;
      expect(badge.className).toBe(`badge-${tone}`);
      expect(badge.textContent).toBe(ACTION_STATUS_LABELS[status]);
      classes.add(badge.className);
      labels.add(badge.textContent!);
      unmount();
    });
    expect(classes.size).toBe(4);
    expect(labels.size).toBe(4);
  });
});

describe("Zen Green style — Actions Taken vs Internal Notes", () => {
  afterEach(() => vi.restoreAllMocks());

  it("STYLE-03 renders Actions Taken with a primary left border on the surface color, unlike the Internal Notes panel", async () => {
    const user: AuthUser = { id: 2, name: "Margaret Hamilton", email: "m@toktickit.com", role: "IT_STAFF", mustChangePassword: false };
    const ticket: StaffTicketDetailType = {
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
      ticketOwnerId: 2,
      ticketOwnerName: "Margaret Hamilton",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      resolutionSummary: null,
      requesterResolutionIndicatedAt: null,
      attachments: [],
      publicComments: [],
      internalNotes: [],
    };
    vi.spyOn(api, "getCurrentUser").mockResolvedValue(user);
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(ticket);
    vi.spyOn(api, "getStaffUsers").mockResolvedValue([{ id: 2, name: "Margaret Hamilton" }]);
    vi.spyOn(api, "getTicketActions").mockResolvedValue([anAction]);
    render(
      <MemoryRouter initialEntries={["/queue/1"]}>
        <AuthProvider>
          <Routes>
            <Route path="/queue/:id" element={<StaffTicketDetail />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    const actions = await screen.findByTestId("actions-taken-panel");
    const notes = screen.getByTestId("internal-notes-panel");
    expect(actions.style.borderLeft).toBe("4px solid var(--zg-primary)");
    expect(actions.style.background).toBe("var(--zg-surface)");
    expect(notes.style.background).toBe("var(--zg-readonly-bg)");
    expect(actions.style.background).not.toBe(notes.style.background);
    expect(actions).toHaveTextContent("Visible to the Requester");
    expect(notes).toHaveTextContent("Internal — not visible to Requester");
  });
});

describe("Zen Green style — Action form editable vs read-only fields", () => {
  afterEach(() => vi.restoreAllMocks());

  it("STYLE-04 uses --zg-readonly-bg in view mode and --zg-field-bg once Edit is pressed; Performed by stays read-only", async () => {
    vi.spyOn(api, "getTicketActions").mockResolvedValue([anAction]);
    render(<ActionsTaken ticketId={1} ticketStatus="OPEN" mode="staff" staffUsers={[{ id: 2, name: "Margaret Hamilton" }]} />);

    await userEvent.click(await screen.findByRole("button", { name: "View action: Ran diagnostics" }));
    expect(screen.getByLabelText(/^Description/).style.background).toBe("var(--zg-readonly-bg)");
    expect(screen.getByLabelText(/^Description/)).toHaveAttribute("readonly");

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText(/^Description/).style.background).toBe("var(--zg-field-bg)");
    expect(screen.getByLabelText(/^Description/)).not.toHaveAttribute("readonly");
    expect(screen.getByLabelText("Performed by").style.background).toBe("var(--zg-readonly-bg)");
    expect(screen.getByLabelText("Performed by")).toHaveAttribute("readonly");
  });
});
