-- Rollback of the lab4_actions_taken migration (specification.md §7).
-- Removes only what that migration added; no Lab 1–3 table, column, or row is
-- touched. Test it on a restored copy of a dump, never on the working database
-- (server/scripts/test-rollback.sh does exactly that).
BEGIN;

DROP TABLE IF EXISTS "IdempotencyKey";
DROP TABLE IF EXISTS "TicketStatusChange";
DROP TABLE IF EXISTS "ActionTaken";
DROP TYPE IF EXISTS "ActionStatus";

ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "resolvedAt";
ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "version";

DELETE FROM "_prisma_migrations" WHERE "migration_name" LIKE '%_lab4_actions_taken';

COMMIT;
