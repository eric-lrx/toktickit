import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ChangePassword from "../../src/ChangePassword.js";
import { AuthProvider } from "../../src/AuthContext.js";
import * as api from "../../src/api.js";

function renderChangePassword(mode: "mandatory" | "voluntary" = "mandatory") {
  return render(
    <MemoryRouter initialEntries={["/change-password"]}>
      <AuthProvider>
        <Routes>
          <Route path="/change-password" element={<ChangePassword mode={mode} />} />
          <Route path="/" element={<p>APP HOME</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

async function fillFields(current: string, next: string, confirm: string) {
  await userEvent.type(await screen.findByLabelText(/^current password/i), current);
  await userEvent.type(screen.getByLabelText(/^new password/i), next);
  await userEvent.type(screen.getByLabelText(/^confirm new password/i), confirm);
}

describe("ChangePassword", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("UI-06 shows a field error and the unmet rules on a weak new password", async () => {
    vi.spyOn(api, "getCurrentUser").mockRejectedValue(new Error("no session"));
    const changePasswordSpy = vi.spyOn(api, "changePassword");
    renderChangePassword();

    await fillFields("ChangeMe123!", "weak", "weak");
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(screen.getByText(/does not meet the requirements/i)).toBeInTheDocument();
    const lengthRule = screen.getByText(/at least 8 characters/i).closest("li");
    expect(lengthRule).toHaveAttribute("data-met", "false");
    expect(changePasswordSpy).not.toHaveBeenCalled();
  });

  it("shows rules turning met as a compliant password is typed", async () => {
    vi.spyOn(api, "getCurrentUser").mockRejectedValue(new Error("no session"));
    renderChangePassword();

    const newPasswordInput = await screen.findByLabelText(/^new password/i);
    await userEvent.type(newPasswordInput, "Valid123!");

    expect(screen.getByText(/at least 8 characters/i).closest("li")).toHaveAttribute("data-met", "true");
    expect(screen.getByText(/uppercase letter/i).closest("li")).toHaveAttribute("data-met", "true");
    expect(screen.getByText(/lowercase letter/i).closest("li")).toHaveAttribute("data-met", "true");
    expect(screen.getByText(/digit/i).closest("li")).toHaveAttribute("data-met", "true");
    expect(screen.getByText(/special character/i).closest("li")).toHaveAttribute("data-met", "true");
  });

  it("UI-07 shows a field error and makes no API call on a confirm mismatch", async () => {
    vi.spyOn(api, "getCurrentUser").mockRejectedValue(new Error("no session"));
    const changePasswordSpy = vi.spyOn(api, "changePassword");
    renderChangePassword();

    await fillFields("ChangeMe123!", "Valid123!", "Different123!");
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    expect(changePasswordSpy).not.toHaveBeenCalled();
  });

  it("UI-08 proceeds into the application on success (mandatory flow)", async () => {
    vi.spyOn(api, "getCurrentUser").mockRejectedValue(new Error("no session"));
    vi.spyOn(api, "changePassword").mockResolvedValue(undefined);
    renderChangePassword("mandatory");

    await fillFields("ChangeMe123!", "Valid123!", "Valid123!");
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText("APP HOME")).toBeInTheDocument();
  });

  it("shows a success confirmation and a Cancel action in the voluntary flow", async () => {
    vi.spyOn(api, "getCurrentUser").mockRejectedValue(new Error("no session"));
    vi.spyOn(api, "changePassword").mockResolvedValue(undefined);
    renderChangePassword("voluntary");

    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    await fillFields("ChangeMe123!", "Valid123!", "Valid123!");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/password changed/i)).toBeInTheDocument();
    expect(screen.queryByText("APP HOME")).not.toBeInTheDocument();
  });
});
