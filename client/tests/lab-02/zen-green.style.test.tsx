import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Badge from "../../src/components/Badge.js";
import FormField from "../../src/components/FormField.js";

describe("Badge", () => {
  it("renders the CSS class matching its tone", () => {
    render(<Badge tone="danger">High</Badge>);
    expect(screen.getByText("High")).toHaveClass("badge-danger");
  });

  it("always renders visible text, not color alone", () => {
    render(<Badge tone="success">Active</Badge>);
    expect(screen.getByText("Active")).toBeVisible();
  });
});

describe("FormField", () => {
  it("shows a required marker for required fields", () => {
    render(
      <FormField id="summary" label="Summary" required>
        <input id="summary" />
      </FormField>
    );
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("does not show a required marker when not required", () => {
    render(
      <FormField id="notes" label="Notes">
        <input id="notes" />
      </FormField>
    );
    expect(screen.queryByText("*")).not.toBeInTheDocument();
  });

  it("renders the error message immediately under the control", () => {
    render(
      <FormField id="summary" label="Summary" required error="Summary is required">
        <input id="summary" />
      </FormField>
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Summary is required");
  });
});
