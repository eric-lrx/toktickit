import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MyTickets from "../../src/MyTickets.js";
import * as api from "../../src/api.js";

// Issue 34 — MyTickets no longer takes a requesterId prop; ownership scoping
// moved server-side to the session. The old "switching Requester mid-session
// reloads the list" test is gone with it — there is no more in-place
// Requester switch, only logging out and back in as someone else, which
// unmounts the whole authenticated app rather than re-rendering this
// component with a new prop.
function renderMyTickets() {
  return render(
    <MemoryRouter>
      <MyTickets />
    </MemoryRouter>
  );
}

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
});
