import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Login from "../../src/Login.js";
import { AuthProvider } from "../../src/AuthContext.js";
import * as api from "../../src/api.js";

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/change-password" element={<p>CHANGE PASSWORD SCREEN</p>} />
          <Route path="/" element={<p>APP HOME</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("Login", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("UI-01 shows field errors on empty submit and makes no API call", async () => {
    vi.spyOn(api, "getCurrentUser").mockRejectedValue(new Error("no session"));
    const loginSpy = vi.spyOn(api, "login");
    renderLogin();

    await userEvent.click(await screen.findByRole("button", { name: /sign in/i }));

    expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    expect(loginSpy).not.toHaveBeenCalled();
  });

  it("UI-02 shows the generic error message on a mocked 401", async () => {
    vi.spyOn(api, "getCurrentUser").mockRejectedValue(new Error("no session"));
    vi.spyOn(api, "login").mockRejectedValue(new Error("Invalid email or password."));
    renderLogin();

    await userEvent.type(await screen.findByLabelText(/^email/i), "nobody@example.com");
    await userEvent.type(screen.getByLabelText(/^password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Invalid email or password.")).toBeInTheDocument();
  });

  it("UI-03 shows a busy state while the request is in flight", async () => {
    vi.spyOn(api, "getCurrentUser").mockRejectedValue(new Error("no session"));
    vi.spyOn(api, "login").mockReturnValue(new Promise(() => {}));
    renderLogin();

    await userEvent.type(await screen.findByLabelText(/^email/i), "ada.lovelace@example.com");
    await userEvent.type(screen.getByLabelText(/^password/i), "ChangeMe123!");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("button", { name: /signing in/i })).toBeDisabled();
  });

  it("UI-04 toggles the password field between hidden and visible", async () => {
    vi.spyOn(api, "getCurrentUser").mockRejectedValue(new Error("no session"));
    renderLogin();

    const passwordInput = await screen.findByLabelText(/^password/i);
    expect(passwordInput).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: /show password/i }));
    expect(passwordInput).toHaveAttribute("type", "text");

    await userEvent.click(screen.getByRole("button", { name: /hide password/i }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("UI-05 redirects to Change Password (not the app) when mustChangePassword is true", async () => {
    vi.spyOn(api, "getCurrentUser").mockRejectedValue(new Error("no session"));
    vi.spyOn(api, "login").mockResolvedValue({
      id: 1,
      name: "Ada Lovelace",
      email: "ada.lovelace@example.com",
      role: "REQUESTER",
      mustChangePassword: true,
    });
    renderLogin();

    await userEvent.type(await screen.findByLabelText(/^email/i), "ada.lovelace@example.com");
    await userEvent.type(screen.getByLabelText(/^password/i), "ChangeMe123!");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("CHANGE PASSWORD SCREEN")).toBeInTheDocument();
    expect(screen.queryByText("APP HOME")).not.toBeInTheDocument();
  });

  it("redirects into the app when mustChangePassword is false", async () => {
    vi.spyOn(api, "getCurrentUser").mockRejectedValue(new Error("no session"));
    vi.spyOn(api, "login").mockResolvedValue({
      id: 2,
      name: "Grace Hopper",
      email: "grace.hopper@example.com",
      role: "REQUESTER",
      mustChangePassword: false,
    });
    renderLogin();

    await userEvent.type(await screen.findByLabelText(/^email/i), "grace.hopper@example.com");
    await userEvent.type(screen.getByLabelText(/^password/i), "NewValid123!");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("APP HOME")).toBeInTheDocument();
  });
});
