import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Shell from "../../src/Shell.js";
import { AuthProvider } from "../../src/AuthContext.js";
import * as api from "../../src/api.js";
import { AuthUser } from "../../src/api.js";

// Lab 3 (Issue 33) renamed Shell's props from {requester, onChangeRequester}
// to {user} and replaced "Change Requester" with Logout — that specific
// obsolete behavior moved to tests/lab-03/AppShell.test.tsx (UI-10) along
// with the new role-nav coverage (UI-09). What's kept here is the
// structural behavior that didn't change: wordmark, nav links for a
// Requester, active-route indication, and the mobile toggle.
describe("Shell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const user: AuthUser = {
    id: 1,
    name: "Ada Lovelace",
    email: "ada.lovelace@example.com",
    role: "REQUESTER",
    mustChangePassword: false,
  };

  function renderShell(initialEntry: string) {
    vi.spyOn(api, "getCurrentUser").mockRejectedValue(new Error("no session"));
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <AuthProvider>
          <Shell user={user}>
            <p>content</p>
          </Shell>
        </AuthProvider>
      </MemoryRouter>
    );
  }

  it("renders the TokTickIT identity and the Requester's nav links", () => {
    renderShell("/tickets");
    expect(screen.getByText("TokTickIT")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /my tickets/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create ticket/i })).toBeInTheDocument();
  });

  it("marks the current route's nav link with aria-current", () => {
    renderShell("/tickets/new");
    expect(screen.getByRole("link", { name: /create ticket/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /my tickets/i })).not.toHaveAttribute("aria-current");
  });

  it("hides nav links behind a mobile toggle and reveals them on click", async () => {
    renderShell("/tickets");
    const nav = screen.getByRole("navigation");
    expect(nav).toHaveAttribute("data-mobile-open", "false");

    await userEvent.click(screen.getByRole("button", { name: /menu/i }));
    expect(nav).toHaveAttribute("data-mobile-open", "true");
  });
});
