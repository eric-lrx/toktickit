import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Shell from "../../src/Shell.js";
import { AuthProvider } from "../../src/AuthContext.js";
import * as api from "../../src/api.js";
import { AuthUser } from "../../src/api.js";

const REQUESTER: AuthUser = {
  id: 1,
  name: "Ada Lovelace",
  email: "ada.lovelace@example.com",
  role: "REQUESTER",
  mustChangePassword: false,
};
const IT_STAFF: AuthUser = {
  id: 2,
  name: "Margaret Hamilton",
  email: "margaret.hamilton@toktickit.com",
  role: "IT_STAFF",
  mustChangePassword: false,
};
const ADMINISTRATOR: AuthUser = {
  id: 3,
  name: "Barbara Liskov",
  email: "barbara.liskov@toktickit.com",
  role: "ADMINISTRATOR",
  mustChangePassword: false,
};

function renderShell(user: AuthUser) {
  return render(
    <MemoryRouter initialEntries={["/tickets"]}>
      <AuthProvider>
        <Routes>
          <Route
            path="*"
            element={
              <Shell user={user}>
                <p>content</p>
              </Shell>
            }
          />
          <Route path="/login" element={<p>LOGIN SCREEN</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("Shell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("UI-09 renders only Requester nav destinations for a Requester", async () => {
    vi.spyOn(api, "getCurrentUser").mockRejectedValue(new Error("no session"));
    renderShell(REQUESTER);
    const nav = screen.getByRole("navigation");
    expect(await screen.findByText("Ada Lovelace — Requester")).toBeInTheDocument();
    expect(nav).toHaveTextContent("My Tickets");
    expect(nav).toHaveTextContent("Create Ticket");
    expect(nav).not.toHaveTextContent("My Queue");
    expect(nav).not.toHaveTextContent("Users");
  });

  it("UI-09 renders only the IT Staff nav destination for IT Staff", async () => {
    vi.spyOn(api, "getCurrentUser").mockRejectedValue(new Error("no session"));
    renderShell(IT_STAFF);
    const nav = screen.getByRole("navigation");
    expect(await screen.findByText("Margaret Hamilton — IT Staff")).toBeInTheDocument();
    expect(nav).toHaveTextContent("My Queue");
    expect(nav).not.toHaveTextContent("Create Ticket");
    expect(nav).not.toHaveTextContent("My Tickets");
    expect(nav).not.toHaveTextContent("Users");
  });

  it("UI-09 renders only the Administrator nav destination for an Administrator", async () => {
    vi.spyOn(api, "getCurrentUser").mockRejectedValue(new Error("no session"));
    renderShell(ADMINISTRATOR);
    const nav = screen.getByRole("navigation");
    expect(await screen.findByText("Barbara Liskov — Administrator")).toBeInTheDocument();
    expect(nav).toHaveTextContent("Users");
    expect(nav).not.toHaveTextContent("My Tickets");
    expect(nav).not.toHaveTextContent("My Queue");
  });

  it("UI-10 calls logout and redirects to Login", async () => {
    vi.spyOn(api, "getCurrentUser").mockRejectedValue(new Error("no session"));
    const logoutSpy = vi.spyOn(api, "logout").mockResolvedValue(undefined);
    renderShell(REQUESTER);

    await userEvent.click(await screen.findByRole("button", { name: /logout/i }));

    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("LOGIN SCREEN")).toBeInTheDocument();
  });
});
