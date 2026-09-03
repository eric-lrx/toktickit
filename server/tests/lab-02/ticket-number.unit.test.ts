import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { nextTicketNumber, withUniqueTicketNumber } from "../../src/ticketNumber.js";

describe("nextTicketNumber", () => {
  it("returns the TKT-YYYY-NNNNNN format for the given year", async () => {
    const num = await nextTicketNumber(2026);
    expect(num).toMatch(/^TKT-2026-\d{6}$/);
  });
});

// BR-04 — two concurrent creations must never produce the same Ticket Number.
// generateNumber is injected so this test exercises the retry control flow in
// isolation, without depending on real database timing.
describe("withUniqueTicketNumber", () => {
  it("retries with a fresh number when the first attempt collides", async () => {
    let genCalls = 0;
    const generateNumber = async () => (genCalls++ === 0 ? "TKT-2026-000001" : "TKT-2026-000002");

    let attemptCalls = 0;
    const result = await withUniqueTicketNumber(generateNumber, async (ticketNumber) => {
      attemptCalls++;
      if (attemptCalls === 1) {
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "5.22.0",
        });
      }
      return ticketNumber;
    });

    expect(attemptCalls).toBe(2);
    expect(result).toBe("TKT-2026-000002");
  });

  it("does not retry and rethrows on a non-collision error", async () => {
    const generateNumber = async () => "TKT-2026-000001";
    let attemptCalls = 0;

    await expect(
      withUniqueTicketNumber(generateNumber, async () => {
        attemptCalls++;
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(attemptCalls).toBe(1);
  });
});
