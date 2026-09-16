import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;

// BR-11 — minimum 8 characters, at least one uppercase letter, one lowercase
// letter, one digit, one special character. Enforced again on the client
// (ui-spec.md); this is the source of truth the server trusts.
export function passwordRuleViolations(password: string): string[] {
  const errors: string[] = [];
  if (password.length < 8) errors.push("must be at least 8 characters long");
  if (!/[A-Z]/.test(password)) errors.push("must contain an uppercase letter");
  if (!/[a-z]/.test(password)) errors.push("must contain a lowercase letter");
  if (!/[0-9]/.test(password)) errors.push("must contain a digit");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("must contain a special character");
  return errors;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
