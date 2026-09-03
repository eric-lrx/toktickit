import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AttachmentSection from "../../src/components/AttachmentSection.js";

function makeFile(name: string, type: string, sizeBytes = 1024) {
  const file = new File(["x".repeat(sizeBytes)], name, { type });
  return file;
}

describe("AttachmentSection", () => {
  it("rejects a disallowed file type with an inline error and does not stage it", async () => {
    const onChange = vi.fn();
    render(<AttachmentSection files={[]} onChange={onChange} />);

    const input = screen.getByLabelText(/attachments/i);
    await userEvent.upload(input, makeFile("virus.exe", "application/x-msdownload"));

    expect(await screen.findByText(/not an allowed file type/i)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("accepts a valid file and stages it", async () => {
    const onChange = vi.fn();
    render(<AttachmentSection files={[]} onChange={onChange} />);

    const input = screen.getByLabelText(/attachments/i);
    const file = makeFile("photo.jpg", "image/jpeg");
    await userEvent.upload(input, file);

    expect(onChange).toHaveBeenCalledWith([file]);
  });

  it("shows removed attachments as metadata without a download control", () => {
    render(
      <AttachmentSection
        files={[]}
        onChange={vi.fn()}
        existing={[
          {
            id: 1,
            originalName: "old.png",
            mimeType: "image/png",
            sizeBytes: 100,
            uploadedAt: "2026-09-01T00:00:00.000Z",
            removedAt: "2026-09-02T00:00:00.000Z",
            removalReason: "duplicate",
          },
        ]}
      />
    );
    expect(screen.getByText("old.png")).toBeInTheDocument();
    expect(screen.getByText(/duplicate/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /download/i })).not.toBeInTheDocument();
  });
});
