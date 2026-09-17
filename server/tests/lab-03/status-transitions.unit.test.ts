import { describe, it, expect } from "vitest";
import { allowedTransitions } from "../../src/statusTransitions.js";

// UNIT-01 (BR-22) — the transition table from BRIEFING_AGENT_LAB03.md,
// exercised for every one of the 8 statuses, including the terminal one.
describe("allowedTransitions", () => {
  it("NEW allows OPEN and CANCELLED", () => {
    expect(allowedTransitions("NEW")).toEqual(["OPEN", "CANCELLED"]);
  });

  it("OPEN allows IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CANCELLED", () => {
    expect(allowedTransitions("OPEN")).toEqual(["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]);
  });

  it("IN_PROGRESS allows WAITING_FOR_REQUESTER, RESOLVED, CANCELLED", () => {
    expect(allowedTransitions("IN_PROGRESS")).toEqual(["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]);
  });

  it("WAITING_FOR_REQUESTER allows IN_PROGRESS, RESOLVED, CANCELLED", () => {
    expect(allowedTransitions("WAITING_FOR_REQUESTER")).toEqual(["IN_PROGRESS", "RESOLVED", "CANCELLED"]);
  });

  it("RESOLVED allows CLOSED, REOPENED", () => {
    expect(allowedTransitions("RESOLVED")).toEqual(["CLOSED", "REOPENED"]);
  });

  it("CLOSED allows only REOPENED", () => {
    expect(allowedTransitions("CLOSED")).toEqual(["REOPENED"]);
  });

  it("REOPENED allows IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CANCELLED", () => {
    expect(allowedTransitions("REOPENED")).toEqual(["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]);
  });

  it("CANCELLED is terminal — empty set", () => {
    expect(allowedTransitions("CANCELLED")).toEqual([]);
  });
});
