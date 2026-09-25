#!/usr/bin/env bash
# MIG-05 (docs/lab-04/tests.md) — exercises the lab4_actions_taken rollback on a
# restored copy of a pre-migration dump. It never connects to the working
# database: every write goes to two scratch databases whose names end in
# _rollback_test, created and dropped by this script.
#
# Usage: server/scripts/test-rollback.sh <pre-migration dump file>
set -euo pipefail

DUMP="${1:?usage: test-rollback.sh <pre-migration .dump file>}"
cd "$(dirname "$0")/.."

BASE_URL="$(grep -E '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's/?schema=public//')"
SERVER_URL="${BASE_URL%/*}"
MIGRATED="toktickit_rollback_test"
REFERENCE="toktickit_reference_rollback_test"
MIGRATED_URL="$SERVER_URL/$MIGRATED"
REFERENCE_URL="$SERVER_URL/$REFERENCE"

counts() {
  psql "$1" -Atc 'select
    (select count(*) from "User"),
    (select count(*) from "Ticket"),
    (select count(*) from "Attachment"),
    (select count(*) from "PublicComment"),
    (select count(*) from "InternalNote"),
    (select count(*) from "Category"),
    (select count(*) from "RelatedSystem")'
}

cleanup() {
  dropdb --if-exists --maintenance-db="$SERVER_URL/postgres" "$MIGRATED"
  dropdb --if-exists --maintenance-db="$SERVER_URL/postgres" "$REFERENCE"
}
trap cleanup EXIT
cleanup

echo "== 1. restore the pre-migration dump into two scratch databases"
createdb --maintenance-db="$SERVER_URL/postgres" "$MIGRATED"
createdb --maintenance-db="$SERVER_URL/postgres" "$REFERENCE"
pg_restore --no-owner -d "$MIGRATED_URL" "$DUMP"
pg_restore --no-owner -d "$REFERENCE_URL" "$DUMP"
BEFORE="$(counts "$MIGRATED_URL")"
echo "Lab 1-3 row counts before migration (User|Ticket|Attachment|PublicComment|InternalNote|Category|RelatedSystem): $BEFORE"

echo "== 2. apply the Lab 4 migration to the copy"
DATABASE_URL="$MIGRATED_URL?schema=public" npx prisma migrate deploy
psql "$MIGRATED_URL" -Atc 'select count(*) from "ActionTaken"' >/dev/null
echo "migration applied: ActionTaken table exists"

echo "== 3. run the rollback script"
psql -v ON_ERROR_STOP=1 "$MIGRATED_URL" -f prisma/rollback/lab4_actions_taken.down.sql

echo "== 4. compare with the untouched Lab 3 reference"
DIFF="$(npx prisma migrate diff --from-url "$MIGRATED_URL?schema=public" --to-url "$REFERENCE_URL?schema=public" --script 2>/dev/null)"
echo "$DIFF"
AFTER="$(counts "$MIGRATED_URL")"
echo "Lab 1-3 row counts after rollback: $AFTER"
LEFT="$(psql "$MIGRATED_URL" -Atc "select count(*) from \"_prisma_migrations\" where migration_name like '%_lab4_actions_taken'")"

if [[ "$DIFF" == *"empty migration"* && "$BEFORE" == "$AFTER" && "$LEFT" == "0" ]]; then
  echo "RESULT: PASS — schema identical to Lab 3, row counts unchanged, migration record removed"
else
  echo "RESULT: FAIL"
  exit 1
fi
