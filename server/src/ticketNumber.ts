import { Prisma } from "@prisma/client";
import { getPrisma } from "./prisma.js";

const MAX_ATTEMPTS = 5;

// BR-04 — format TKT-YYYY-NNNNNN, sequential per calendar year.
export async function nextTicketNumber(year: number): Promise<string> {
  const prefix = `TKT-${year}-`;
  const count = await getPrisma().ticket.count({ where: { ticketNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(6, "0")}`;
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

// BR-04 — retry with a freshly generated number on unique-constraint collision,
// so two concurrent creations never produce the same Ticket Number.
export async function withUniqueTicketNumber<T>(
  generateNumber: () => Promise<string>,
  attempt: (ticketNumber: string) => Promise<T>
): Promise<T> {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const ticketNumber = await generateNumber();
    try {
      return await attempt(ticketNumber);
    } catch (err) {
      if (!isUniqueConstraintError(err) || i === MAX_ATTEMPTS - 1) throw err;
    }
  }
  throw new Error("unreachable");
}
