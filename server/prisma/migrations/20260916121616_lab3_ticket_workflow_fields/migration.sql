-- Lab 3, Issue 35 — Ticket workflow fields (specification.md §7 migration
-- path, steps 5-7). A full pg_dump backup was taken before this file ran
-- (repo-root db-backups/, gitignored, never a deliverable).

-- Step 7 — extend TicketStatus. Safe to run in the same transaction as the
-- rest of this file (Postgres 12+ allows ALTER TYPE ... ADD VALUE inside a
-- transaction) as long as no new value is *used* in this same transaction —
-- it isn't; every existing row stays NEW.
ALTER TYPE "TicketStatus" ADD VALUE 'OPEN';
ALTER TYPE "TicketStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "TicketStatus" ADD VALUE 'WAITING_FOR_REQUESTER';
ALTER TYPE "TicketStatus" ADD VALUE 'RESOLVED';
ALTER TYPE "TicketStatus" ADD VALUE 'CLOSED';
ALTER TYPE "TicketStatus" ADD VALUE 'REOPENED';
ALTER TYPE "TicketStatus" ADD VALUE 'CANCELLED';

-- Step 6 — ticketOwnerId/resolutionSummary/requesterResolutionIndicatedAt
-- are all nullable with no backfill needed: "unassigned" and "not yet
-- resolved" are real, permanent states, not migration artifacts.
ALTER TABLE "Ticket" ADD COLUMN "ticketOwnerId" INTEGER;
ALTER TABLE "Ticket" ADD COLUMN "resolutionSummary" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "requesterResolutionIndicatedAt" TIMESTAMP(3);

CREATE INDEX "Ticket_ticketOwnerId_idx" ON "Ticket"("ticketOwnerId");
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ticketOwnerId_fkey"
  FOREIGN KEY ("ticketOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 5 — itPriority: add nullable, backfill from requestedPriority (BR-35
-- — "IT Priority initially copies Requested Priority"), then require it.
-- Same enum type on both sides, so no cast needed for the backfill.
ALTER TABLE "Ticket" ADD COLUMN "itPriority" "RequestedPriority";
UPDATE "Ticket" SET "itPriority" = "requestedPriority" WHERE "itPriority" IS NULL;
ALTER TABLE "Ticket" ALTER COLUMN "itPriority" SET NOT NULL;
