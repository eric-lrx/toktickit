import { Prisma, PrismaClient } from "@prisma/client";

// Lazy singleton: the client is created on first use, not at import time.
// This keeps route modules and tests that don't touch the DB (e.g. /api/health)
// free of database side effects.
let client: PrismaClient | null = null;
const queryListeners = new Set<(e: Prisma.QueryEvent) => void>();

export function getPrisma(): PrismaClient {
  if (!client) {
    // Query events only under Vitest: the Lab 4 performance-smoke test counts
    // the SQL statements a dashboard call issues (PERF-03). Nothing listens
    // in development or production.
    if (process.env.VITEST) {
      const c = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
      c.$on("query", (e) => queryListeners.forEach((listen) => listen(e)));
      client = c as unknown as PrismaClient;
    } else {
      client = new PrismaClient();
    }
  }
  return client;
}

export function onPrismaQuery(listener: (e: Prisma.QueryEvent) => void): () => void {
  queryListeners.add(listener);
  return () => queryListeners.delete(listener);
}
