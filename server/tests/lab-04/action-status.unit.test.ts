import { describe, it, expect } from "vitest";
import { allowedActionTransitions, isAllowedActionTransition } from "../../src/actionStatus.js";
import { nextResolvedAt } from "../../src/ticketWorkflow.js";

describe("Action status matrix (BR-07)", () => {
  it("UNIT-01 PLANNED can move to IN_PROGRESS, COMPLETED, or CANCELLED", () => {
    expect(allowedActionTransitions("PLANNED")).toEqual(["IN_PROGRESS", "COMPLETED", "CANCELLED"]);
  });

  it("UNIT-01 IN_PROGRESS can move to COMPLETED or CANCELLED, never back to PLANNED", () => {
    expect(allowedActionTransitions("IN_PROGRESS")).toEqual(["COMPLETED", "CANCELLED"]);
    expect(isAllowedActionTransition("IN_PROGRESS", "PLANNED")).toBe(false);
  });

  it("UNIT-01 COMPLETED and CANCELLED are terminal", () => {
    expect(allowedActionTransitions("COMPLETED")).toEqual([]);
    expect(allowedActionTransitions("CANCELLED")).toEqual([]);
    expect(isAllowedActionTransition("COMPLETED", "IN_PROGRESS")).toBe(false);
    expect(isAllowedActionTransition("CANCELLED", "PLANNED")).toBe(false);
  });
});

describe("resolvedAt rule (BR-16)", () => {
  const now = new Date("2026-10-05T10:00:00.000Z");
  const earlier = new Date("2026-10-01T10:00:00.000Z");

  it("UNIT-02 sets resolvedAt on a move to RESOLVED", () => {
    expect(nextResolvedAt("RESOLVED", null, now)).toEqual(now);
    expect(nextResolvedAt("RESOLVED", earlier, now)).toEqual(now);
  });

  it("UNIT-02 keeps it on CLOSED, clears it on REOPENED, leaves it alone otherwise", () => {
    expect(nextResolvedAt("CLOSED", earlier, now)).toEqual(earlier);
    expect(nextResolvedAt("REOPENED", earlier, now)).toBeNull();
    expect(nextResolvedAt("IN_PROGRESS", null, now)).toBeNull();
    expect(nextResolvedAt("CANCELLED", null, now)).toBeNull();
  });
});
