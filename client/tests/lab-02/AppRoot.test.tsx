import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AppRoot from "../../src/AppRoot.js";
import * as api from "../../src/api.js";

describe("AppRoot", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the Development Requester Selector when no Requester is in context", () => {
    vi.spyOn(api, "getActiveRequesters").mockResolvedValue([]);
    render(<AppRoot />);
    expect(screen.getByText(/select a development requester/i)).toBeInTheDocument();
  });
});
