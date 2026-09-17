import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Badge, { BadgeTone } from "../../src/components/Badge.js";
import CommentPanel from "../../src/components/CommentPanel.js";
import StaffTicketDetail from "../../src/StaffTicketDetail.js";
import { AuthProvider } from "../../src/AuthContext.js";
import * as api from "../../src/api.js";
import type { AuthUser, Role, StaffTicketDetail as StaffTicketDetailType } from "../../src/api.js";
import { STATUSES, STATUS_LABELS, statusTone } from "../../src/ticketStatus.js";

// ui-spec.md §8 — mirrors UserManagement.tsx's own ROLE_TONE/ROLE_LABEL maps.
const ROLE_TONE: Record<Role, BadgeTone> = { REQUESTER: "pale", IT_STAFF: "warning", ADMINISTRATOR: "outline" };
const ROLE_LABEL: Record<Role, string> = { REQUESTER: "Requester", IT_STAFF: "IT Staff", ADMINISTRATOR: "Administrator" };

describe("Zen Green style — badges", () => {
  it("STYLE-01 renders the documented class and a text label for every role", () => {
    (Object.keys(ROLE_TONE) as Role[]).forEach((role) => {
      const { container, unmount } = render(<Badge tone={ROLE_TONE[role]}>{ROLE_LABEL[role]}</Badge>);
      const badge = container.firstElementChild as HTMLElement;
      expect(badge.className).toBe(`badge-${ROLE_TONE[role]}`);
      expect(badge.textContent).toBe(ROLE_LABEL[role]);
      unmount();
    });
  });

  it("STYLE-02 maps every one of the 8 statuses to its documented class and a text label", () => {
    STATUSES.forEach((status) => {
      const tone = statusTone(status);
      const { container, unmount } = render(<Badge tone={tone}>{STATUS_LABELS[status]}</Badge>);
      const badge = container.firstElementChild as HTMLElement;
      expect(badge.className).toBe(`badge-${tone}`);
      expect(badge.textContent).toBe(STATUS_LABELS[status]);
      unmount();
    });
  });

  it("STYLE-02 gives In Progress and Waiting for Requester distinct text despite sharing a tone", () => {
    expect(statusTone("IN_PROGRESS")).toBe(statusTone("WAITING_FOR_REQUESTER"));
    expect(STATUS_LABELS.IN_PROGRESS).not.toBe(STATUS_LABELS.WAITING_FOR_REQUESTER);
  });
});

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
  attachments: [],
  publicComments: [],
  internalNotes: [],
};

describe("Zen Green style — Staff Ticket Detail editable vs read-only fields", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("STYLE-03 editable fields use --zg-field-bg and read-only fields use --zg-readonly-bg", async () => {
    vi.spyOn(api, "getCurrentUser").mockResolvedValue(CURRENT_USER);
    vi.spyOn(api, "getStaffUsers").mockResolvedValue([]);
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(baseTicket);
    render(
      <MemoryRouter initialEntries={["/queue/1"]}>
        <AuthProvider>
          <Routes>
            <Route path="/queue/:id" element={<StaffTicketDetail />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    const itPrioritySelect = await screen.findByLabelText(/^it priority/i);
    expect(itPrioritySelect).toHaveStyle({ background: "var(--zg-field-bg)" });
    const statusSelect = screen.getByLabelText(/^status/i);
    expect(statusSelect).toHaveStyle({ background: "var(--zg-field-bg)" });

    const summaryText = screen.getByText(baseTicket.summary);
    expect(summaryText).toHaveStyle({ background: "var(--zg-readonly-bg)" });
    const descriptionText = screen.getByText(baseTicket.description);
    expect(descriptionText).toHaveStyle({ background: "var(--zg-readonly-bg)" });
  });
});

describe("Zen Green style — Public Comments vs Internal Notes panels", () => {
  it("STYLE-04 the Internal Notes panel carries a distinct background and its own label", () => {
    const { container: publicContainer } = render(<CommentPanel variant="public" entries={[]} onPost={async () => {}} />);
    const { container: internalContainer } = render(<CommentPanel variant="internal" entries={[]} onPost={async () => {}} />);

    const publicPanel = publicContainer.querySelector('[data-testid="public-comments-panel"]') as HTMLElement;
    const internalPanel = internalContainer.querySelector('[data-testid="internal-notes-panel"]') as HTMLElement;

    expect(publicPanel).toBeTruthy();
    expect(internalPanel).toBeTruthy();
    expect(publicPanel.style.background).not.toBe(internalPanel.style.background);
    expect(internalContainer.textContent).toMatch(/internal.*not visible to requester/i);
    expect(publicContainer.textContent).not.toMatch(/not visible to requester/i);
  });
});
