import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AppRoot from "../../src/AppRoot.js";
import * as api from "../../src/api.js";

// Lab 3 (Issue 33) replaced the Development Requester Selector gate with a
// real Login gate — same "what does AppRoot show with no identity in
// context yet" question the original Lab 2 test asked, answered by the new
// mechanism.
describe("AppRoot", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the Login screen when there is no authenticated session", async () => {
    vi.spyOn(api, "getCurrentUser").mockRejectedValue(new Error("no session"));
    render(<AppRoot />);
    expect(await screen.findByText(/sign in to your account/i)).toBeInTheDocument();
  });
});
