import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import CreateTicket from "../../src/CreateTicket.js";
import * as api from "../../src/api.js";
import type { TicketDetail } from "../../src/api.js";

function mockReferenceData() {
  vi.spyOn(api, "getCategories").mockResolvedValue([{ id: 1, name: "Hardware" }]);
  vi.spyOn(api, "getRelatedSystems").mockResolvedValue([{ id: 1, name: "Printer" }]);
}

async function fillValidForm() {
  await userEvent.selectOptions(await screen.findByLabelText(/^category/i), "1");
  await userEvent.selectOptions(screen.getByLabelText(/related system/i), "1");
  await userEvent.type(screen.getByLabelText(/^summary/i), "Printer jam");
  await userEvent.type(screen.getByLabelText(/^description/i), "Paper stuck in tray 2");
}

function renderCreateTicket() {
  render(
    <MemoryRouter>
      <CreateTicket requesterId={1} />
    </MemoryRouter>
  );
}

describe("CreateTicket", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a field error and does not call the API when Summary is empty", async () => {
    mockReferenceData();
    const createSpy = vi.spyOn(api, "createTicket");
    renderCreateTicket();

    await userEvent.click(await screen.findByRole("button", { name: /submit/i }));

    expect(await screen.findByText(/summary must be at least/i)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("disables Submit and shows a busy label while the request is pending", async () => {
    mockReferenceData();
    let resolveCreate: (value: TicketDetail) => void = () => {};
    vi.spyOn(api, "createTicket").mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      })
    );
    renderCreateTicket();
    await fillValidForm();

    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    const busyButton = await screen.findByRole("button", { name: /submitting/i });
    expect(busyButton).toBeDisabled();

    resolveCreate({
      id: 1,
      ticketNumber: "TKT-2026-000001",
      requesterId: 1,
      categoryId: 1,
      relatedSystemId: 1,
      summary: "Printer jam",
      description: "Paper stuck in tray 2",
      requestedPriority: "MEDIUM",
      status: "NEW",
      createdAt: "",
      updatedAt: "",
      attachments: [],
    });
    await screen.findByText(/TKT-2026-000001/);
  });

  it("shows the backend-issued Ticket Number on success", async () => {
    mockReferenceData();
    vi.spyOn(api, "createTicket").mockResolvedValue({
      id: 1,
      ticketNumber: "TKT-2026-000042",
      requesterId: 1,
      categoryId: 1,
      relatedSystemId: 1,
      summary: "Printer jam",
      description: "Paper stuck in tray 2",
      requestedPriority: "MEDIUM",
      status: "NEW",
      createdAt: "",
      updatedAt: "",
      attachments: [],
    });
    renderCreateTicket();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    expect(await screen.findByText(/TKT-2026-000042/)).toBeInTheDocument();
  });

  it("shows a safe failure message and preserves the entered values on API failure", async () => {
    mockReferenceData();
    vi.spyOn(api, "createTicket").mockRejectedValue(new Error("Unable to create ticket"));
    renderCreateTicket();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    expect(await screen.findByText(/unable to create ticket/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^summary/i)).toHaveValue("Printer jam");
  });

  it("offers a View Ticket link to the created ticket on success", async () => {
    mockReferenceData();
    vi.spyOn(api, "createTicket").mockResolvedValue({
      id: 42,
      ticketNumber: "TKT-2026-000042",
      requesterId: 1,
      categoryId: 1,
      relatedSystemId: 1,
      summary: "Printer jam",
      description: "Paper stuck in tray 2",
      requestedPriority: "MEDIUM",
      status: "NEW",
      createdAt: "",
      updatedAt: "",
      attachments: [],
    });
    renderCreateTicket();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    const viewLink = await screen.findByRole("link", { name: /view ticket/i });
    expect(viewLink).toHaveAttribute("href", "/tickets/42");
  });

  it("resets the form to a blank state when Create another is clicked", async () => {
    mockReferenceData();
    vi.spyOn(api, "createTicket").mockResolvedValue({
      id: 42,
      ticketNumber: "TKT-2026-000042",
      requesterId: 1,
      categoryId: 1,
      relatedSystemId: 1,
      summary: "Printer jam",
      description: "Paper stuck in tray 2",
      requestedPriority: "MEDIUM",
      status: "NEW",
      createdAt: "",
      updatedAt: "",
      attachments: [],
    });
    renderCreateTicket();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    await userEvent.click(await screen.findByRole("button", { name: /create another/i }));

    expect(await screen.findByLabelText(/^summary/i)).toHaveValue("");
    expect(screen.getByRole("button", { name: /^submit$/i })).toBeInTheDocument();
  });
});
