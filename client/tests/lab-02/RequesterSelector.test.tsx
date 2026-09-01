import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RequesterSelector from "../../src/RequesterSelector.js";
import * as api from "../../src/api.js";

describe("RequesterSelector", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a loading state while requesters are being fetched", () => {
    vi.spyOn(api, "getActiveRequesters").mockReturnValue(new Promise(() => {}));
    render(<RequesterSelector onSelect={vi.fn()} />);
    expect(screen.getByText(/loading requesters/i)).toBeInTheDocument();
  });

  it("shows the empty state when no active requester exists", async () => {
    vi.spyOn(api, "getActiveRequesters").mockResolvedValue([]);
    render(<RequesterSelector onSelect={vi.fn()} />);
    expect(await screen.findByText(/no active development requesters/i)).toBeInTheDocument();
  });

  it("shows a safe failure state when the fetch fails", async () => {
    vi.spyOn(api, "getActiveRequesters").mockRejectedValue(new Error("network down"));
    render(<RequesterSelector onSelect={vi.fn()} />);
    expect(await screen.findByText(/unable to load development requesters/i)).toBeInTheDocument();
  });

  it("disables Continue until a Requester is selected, then persists the selection", async () => {
    vi.spyOn(api, "getActiveRequesters").mockResolvedValue([
      { id: 1, name: "Ada Lovelace", email: "ada.lovelace@example.com" },
      { id: 2, name: "Grace Hopper", email: "grace.hopper@example.com" },
    ]);
    const onSelect = vi.fn();
    render(<RequesterSelector onSelect={onSelect} />);

    const continueButton = await screen.findByRole("button", { name: /continue/i });
    expect(continueButton).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText(/development requester/i), "1");
    expect(continueButton).toBeEnabled();

    await userEvent.click(continueButton);
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(localStorage.getItem("toktickit.requesterId")).toBe("1");
  });
});
