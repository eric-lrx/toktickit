import { describe, it, expect } from "vitest";
import { allowedActionTransitions, isAllowedActionTransition } from "../../src/actionStatus.js";

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
