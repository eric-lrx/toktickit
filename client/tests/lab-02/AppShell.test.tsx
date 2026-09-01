import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Shell from "../../src/Shell.js";

describe("Shell", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const requester = { id: 1, name: "Ada Lovelace", email: "ada.lovelace@example.com" };

  it("renders the TokTickIT identity and the required nav links", () => {
    render(
      <MemoryRouter initialEntries={["/tickets"]}>
        <Shell requester={requester} onChangeRequester={vi.fn()}>
          <p>content</p>
        </Shell>
      </MemoryRouter>
    );
    expect(screen.getByText("TokTickIT")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /my tickets/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create ticket/i })).toBeInTheDocument();
  });

  it("marks the current route's nav link with aria-current", () => {
    render(
      <MemoryRouter initialEntries={["/tickets/new"]}>
        <Shell requester={requester} onChangeRequester={vi.fn()}>
          <p>content</p>
        </Shell>
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: /create ticket/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /my tickets/i })).not.toHaveAttribute("aria-current");
  });

  it("shows the selected Requester's name and clears context on Change Requester", async () => {
    localStorage.setItem("toktickit.requesterId", "1");
    const onChangeRequester = vi.fn();
    render(
      <MemoryRouter initialEntries={["/tickets"]}>
        <Shell requester={requester} onChangeRequester={onChangeRequester}>
          <p>content</p>
        </Shell>
      </MemoryRouter>
    );
    expect(screen.getByText(/ada lovelace/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /change requester/i }));
    expect(onChangeRequester).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("toktickit.requesterId")).toBeNull();
  });

  it("hides nav links behind a mobile toggle and reveals them on click", async () => {
    render(
      <MemoryRouter initialEntries={["/tickets"]}>
        <Shell requester={requester} onChangeRequester={vi.fn()}>
          <p>content</p>
        </Shell>
      </MemoryRouter>
    );
    const nav = screen.getByRole("navigation");
    expect(nav).toHaveAttribute("data-mobile-open", "false");

    await userEvent.click(screen.getByRole("button", { name: /menu/i }));
    expect(nav).toHaveAttribute("data-mobile-open", "true");
  });
});
