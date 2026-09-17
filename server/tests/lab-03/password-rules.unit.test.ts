import { describe, it, expect } from "vitest";
import { passwordRuleViolations, hashPassword, verifyPassword } from "../../src/password.js";

// UNIT-02 (BR-11) — password rule validator.
describe("passwordRuleViolations", () => {
  it("rejects a password shorter than 8 characters", () => {
    expect(passwordRuleViolations("Ab1!")).toContain("must be at least 8 characters long");
  });

  it("rejects a password with no uppercase letter", () => {
    expect(passwordRuleViolations("lowercase1!")).toContain("must contain an uppercase letter");
  });

  it("rejects a password with no lowercase letter", () => {
    expect(passwordRuleViolations("UPPERCASE1!")).toContain("must contain a lowercase letter");
  });

  it("rejects a password with no digit", () => {
    expect(passwordRuleViolations("NoDigitsHere!")).toContain("must contain a digit");
  });

  it("rejects a password with no special character", () => {
    expect(passwordRuleViolations("NoSpecial123")).toContain("must contain a special character");
  });

  it("accepts a password that satisfies every rule", () => {
    expect(passwordRuleViolations("Valid123!")).toEqual([]);
  });
});

// UNIT-03 (BR-06) — password hashing helper.
describe("hashPassword / verifyPassword", () => {
  it("produces a bcrypt hash that differs from the plaintext", async () => {
    const hash = await hashPassword("Valid123!");
    expect(hash).not.toBe("Valid123!");
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it("verifies correctly against the original password", async () => {
    const hash = await hashPassword("Valid123!");
    expect(await verifyPassword("Valid123!", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("Valid123!");
    expect(await verifyPassword("WrongPassword1!", hash)).toBe(false);
  });
});
