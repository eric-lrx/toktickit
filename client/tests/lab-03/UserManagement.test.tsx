import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import UserManagement from "../../src/UserManagement.js";
import { AuthProvider } from "../../src/AuthContext.js";
import * as api from "../../src/api.js";
import type { AdminUser, AuthUser } from "../../src/api.js";

const CURRENT_ADMIN: AuthUser = {
  id: 9,
  name: "Fixture Admin",
  email: "fixture.admin@toktickit.com",
  role: "ADMINISTRATOR",
  mustChangePassword: false,
};

const SAMPLE_USERS: AdminUser[] = [
  { id: 1, name: "Ada Lovelace", email: "ada.lovelace@example.com", role: "REQUESTER", isActive: true },
  { id: 2, name: "Margaret Hamilton", email: "margaret.hamilton@toktickit.com", role: "IT_STAFF", isActive: true },
  { id: 9, name: "Fixture Admin", email: "fixture.admin@toktickit.com", role: "ADMINISTRATOR", isActive: true },
];

function renderScreen(users: AdminUser[] = SAMPLE_USERS) {
  vi.spyOn(api, "getCurrentUser").mockResolvedValue(CURRENT_ADMIN);
  vi.spyOn(api, "getAdminUsers").mockResolvedValue(users);
  return render(
    <MemoryRouter>
      <AuthProvider>
        <UserManagement />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("UserManagement", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("UI-17 renders Name, Email, Role, Status, and an Edit action for every user", async () => {
    renderScreen();

    // Desktop table and mobile cards both exist in the DOM (CSS toggles
    // which is visible, matching StaffTicketQueue's own responsive split),
    // so an unscoped single-match query is ambiguous — assert presence via
    // getAllBy*, and scope the Edit-button count to the table specifically.
    expect((await screen.findAllByText("Ada Lovelace")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("ada.lovelace@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/requester/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/active/i).length).toBeGreaterThan(0);
    expect(within(screen.getByRole("table")).getAllByRole("button", { name: /edit/i }).length).toBe(SAMPLE_USERS.length);
  });

  it("UI-18 filters the rendered list by search and by role", async () => {
    renderScreen();
    await screen.findAllByText("Ada Lovelace");

    const searchSpy = vi.spyOn(api, "getAdminUsers").mockResolvedValue([SAMPLE_USERS[0]]);
    await userEvent.type(screen.getByLabelText(/search/i), "ada");
    await waitFor(() => expect(searchSpy).toHaveBeenCalledWith(expect.objectContaining({ search: "ada" })));
    expect((await screen.findAllByText("Ada Lovelace")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Margaret Hamilton")).not.toBeInTheDocument();

    const roleSpy = vi.spyOn(api, "getAdminUsers").mockResolvedValue([SAMPLE_USERS[1]]);
    await userEvent.clear(screen.getByLabelText(/search/i));
    await userEvent.selectOptions(screen.getByLabelText(/role/i), "IT_STAFF");
    await waitFor(() => expect(roleSpy).toHaveBeenCalledWith(expect.objectContaining({ role: "IT_STAFF" })));
    expect((await screen.findAllByText("Margaret Hamilton")).length).toBeGreaterThan(0);
  });

  it("UI-19 shows a field-level error on a mocked 409 duplicate email when creating a user", async () => {
    renderScreen();
    await screen.findAllByText("Ada Lovelace");

    await userEvent.click(screen.getByRole("button", { name: /create user/i }));
    const panel = within(await screen.findByRole("dialog"));
    await userEvent.type(panel.getByLabelText(/full name/i), "New Person");
    await userEvent.type(panel.getByLabelText(/^email/i), "ada.lovelace@example.com");
    await userEvent.selectOptions(panel.getByLabelText(/^role/i), "REQUESTER");
    await userEvent.type(panel.getByLabelText(/^initial password/i), "GoodPass1!");

    vi.spyOn(api, "createAdminUser").mockRejectedValue(new Error("email is already in use"));
    await userEvent.click(panel.getByRole("button", { name: /save user/i }));

    expect(await screen.findByText(/email is already in use/i)).toBeInTheDocument();
  });

  it("UI-20 disables Deactivate with an explanatory tooltip when editing your own account", async () => {
    renderScreen();
    await screen.findAllByText("Fixture Admin");

    // Scoped to the table specifically — the mobile cards render the same
    // users in the same order, but scoping avoids relying on that.
    const editButtons = within(screen.getByRole("table")).getAllByRole("button", { name: /edit/i });
    // SAMPLE_USERS[2] (index 2) is the current admin themselves.
    await userEvent.click(editButtons[2]);

    const deactivateButton = await screen.findByRole("button", { name: /deactivate user/i });
    expect(deactivateButton).toBeDisabled();
    expect(deactivateButton).toHaveAttribute("title", expect.stringMatching(/own account/i));
  });

  it("does not disable Deactivate when editing a different user", async () => {
    renderScreen();
    await screen.findAllByText("Ada Lovelace");

    const editButtons = within(screen.getByRole("table")).getAllByRole("button", { name: /edit/i });
    await userEvent.click(editButtons[0]);

    const deactivateButton = await screen.findByRole("button", { name: /deactivate user/i });
    expect(deactivateButton).not.toBeDisabled();
  });

  it("shows a forbidden message, not a raw error, on a mocked 403", async () => {
    vi.spyOn(api, "getCurrentUser").mockResolvedValue(CURRENT_ADMIN);
    vi.spyOn(api, "getAdminUsers").mockRejectedValue(new Error("You do not have access to user management."));
    render(
      <MemoryRouter>
        <AuthProvider>
          <UserManagement />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText(/you do not have access to user management/i)).toBeInTheDocument();
  });
});
