import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ActionsTaken from "../../src/components/ActionsTaken.js";
import CommentPanel from "../../src/components/CommentPanel.js";
import CreateTicket from "../../src/CreateTicket.js";
import * as api from "../../src/api.js";
import type { ActionTaken } from "../../src/api.js";

const saved: ActionTaken = {
  id: 1,
  ticketId: 10,
  actionAt: "2026-10-01T03:00:00.000Z",
  description: "Swap the keyboard",
  result: null,
  status: "PLANNED",
  followUpRequired: false,
  followUpNote: null,
  attachmentNotes: null,
  performedById: 2,
  performedByName: "Margaret Hamilton",
  assigneeId: null,
  assigneeName: null,
  assigneeActive: null,
  version: 1,
  createdAt: "2026-10-01T03:00:00.000Z",
  updatedAt: "2026-10-01T03:00:00.000Z",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("Duplicate submission (FR-17, BR-28)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("UI-21 sends one request on a double click, disables Save while sending, and sends an Idempotency-Key", async () => {
    vi.spyOn(api, "getTicketActions").mockResolvedValue([]);
    let resolve: (a: ActionTaken) => void = () => {};
    const createSpy = vi.spyOn(api, "createTicketAction").mockReturnValue(new Promise((r) => (resolve = r)));
    render(<ActionsTaken ticketId={10} ticketStatus="OPEN" mode="staff" staffUsers={[]} />);

    await userEvent.click(await screen.findByRole("button", { name: "Add Action" }));
    await userEvent.type(screen.getByLabelText(/^Description/), "Swap the keyboard");
    const save = screen.getByRole("button", { name: "Save Action" });
    await userEvent.dblClick(save);

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(createSpy.mock.calls[0][2]).toMatch(UUID);
    await act(async () => resolve(saved));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Saving…" })).not.toBeInTheDocument());
  });

  it("UI-21 retries with the same key after a network failure, and uses a new key for the next action", async () => {
    vi.spyOn(api, "getTicketActions").mockResolvedValue([]);
    const createSpy = vi
      .spyOn(api, "createTicketAction")
      .mockRejectedValueOnce(new api.ApiError(0, "Unable to reach the server. Please try again."))
      .mockResolvedValueOnce(saved);
    render(<ActionsTaken ticketId={10} ticketStatus="OPEN" mode="staff" staffUsers={[]} />);

    await userEvent.click(await screen.findByRole("button", { name: "Add Action" }));
    await userEvent.type(screen.getByLabelText(/^Description/), "Swap the keyboard");
    await userEvent.click(screen.getByRole("button", { name: "Save Action" }));
    await screen.findByText("Unable to reach the server. Please try again.");
    await userEvent.click(screen.getByRole("button", { name: "Save Action" }));

    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(createSpy.mock.calls[1][2]).toBe(createSpy.mock.calls[0][2]);
  });

  it("UI-21 sends an Idempotency-Key with a comment and a new one after success", async () => {
    const onPost = vi.fn().mockResolvedValue(undefined);
    render(<CommentPanel variant="public" entries={[]} onPost={onPost} />);
    await userEvent.type(screen.getByLabelText("Add a public comment"), "First");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    await userEvent.type(screen.getByLabelText("Add a public comment"), "Second");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(onPost.mock.calls[0][1]).toMatch(UUID);
    expect(onPost.mock.calls[1][1]).toMatch(UUID);
    expect(onPost.mock.calls[1][1]).not.toBe(onPost.mock.calls[0][1]);
  });
});

describe("Form preservation after a recoverable failure (FR-18, BR-29)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("UI-22 keeps every Create Ticket value after a network failure", async () => {
    vi.spyOn(api, "getCategories").mockResolvedValue([{ id: 1, name: "Hardware" }]);
    vi.spyOn(api, "getRelatedSystems").mockResolvedValue([{ id: 2, name: "Printer" }]);
    const createSpy = vi.spyOn(api, "createTicket").mockRejectedValue(new Error("Unable to reach the server. Please try again."));
    render(
      <MemoryRouter>
        <CreateTicket />
      </MemoryRouter>
    );
    await userEvent.selectOptions(await screen.findByLabelText(/^Category/), "1");
    await userEvent.selectOptions(screen.getByLabelText(/Related System/), "2");
    await userEvent.type(screen.getByLabelText(/^Summary/), "Printer jams on every job");
    await userEvent.type(screen.getByLabelText(/^Description/), "Paper gets stuck in tray two every time.");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Unable to reach the server. Please try again.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Summary/)).toHaveValue("Printer jams on every job");
    expect(screen.getByLabelText(/^Description/)).toHaveValue("Paper gets stuck in tray two every time.");
    expect(screen.getByLabelText(/^Category/)).toHaveValue("1");
    expect(createSpy.mock.calls[0][2]).toMatch(UUID);
  });

  it("UI-22 keeps the Action form values after a network failure", async () => {
    vi.spyOn(api, "getTicketActions").mockResolvedValue([]);
    vi.spyOn(api, "createTicketAction").mockRejectedValue(new api.ApiError(0, "Unable to reach the server. Please try again."));
    render(<ActionsTaken ticketId={10} ticketStatus="OPEN" mode="staff" staffUsers={[]} />);
    await userEvent.click(await screen.findByRole("button", { name: "Add Action" }));
    await userEvent.type(screen.getByLabelText(/^Description/), "Swap the keyboard");
    await userEvent.type(screen.getByLabelText("Attachment notes"), "photo-1.png");
    await userEvent.click(screen.getByRole("button", { name: "Save Action" }));
    await screen.findByText("Unable to reach the server. Please try again.");
    expect(screen.getByLabelText(/^Description/)).toHaveValue("Swap the keyboard");
    expect(screen.getByLabelText("Attachment notes")).toHaveValue("photo-1.png");
  });

  it("UI-22 keeps a comment draft after a failed post", async () => {
    const onPost = vi.fn().mockRejectedValue(new Error("Unable to post your comment. Please try again."));
    render(<CommentPanel variant="public" entries={[]} onPost={onPost} />);
    await userEvent.type(screen.getByLabelText("Add a public comment"), "Any update on this?");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to post your comment.");
    expect(screen.getByLabelText("Add a public comment")).toHaveValue("Any update on this?");
  });
});

describe("Session after back-forward cache restore (root cause of Lab 3 E2E-02's intermittent failure)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("UI-23 re-checks the session when the page is restored from the back-forward cache", async () => {
    const { AuthProvider, useAuth } = await import("../../src/AuthContext.js");
    function Probe() {
      const { user, loading } = useAuth();
      return <p>{loading ? "Loading…" : user ? `Signed in as ${user.name}` : "Signed out"}</p>;
    }
    const spy = vi
      .spyOn(api, "getCurrentUser")
      .mockResolvedValueOnce({ id: 1, name: "Ada Lovelace", email: "a@example.com", role: "REQUESTER", mustChangePassword: false })
      .mockRejectedValueOnce(new Error("no session"));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(await screen.findByText("Signed in as Ada Lovelace")).toBeInTheDocument();

    const restored = new Event("pageshow") as Event & { persisted: boolean };
    Object.defineProperty(restored, "persisted", { value: true });
    await act(async () => {
      window.dispatchEvent(restored);
    });
    expect(await screen.findByText("Signed out")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
