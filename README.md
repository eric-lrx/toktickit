# TokTickIT

IT service desk application built over four sprints (CPE334, KMUTT):
React + Vite + Bootstrap (Zen Green theme) → Express + Prisma → PostgreSQL.

| Lab | Increment |
|---|---|
| 1 | Vertical slice: health check, categories |
| 2 | Requester ticketing: create, My Tickets, Ticket Detail, attachments |
| 3 | Authentication, roles, IT Staff queue and workflow, comments, internal notes, user management |
| 4 | Actions Taken, resolution gate, status history, role dashboards, final hardening |

Engineering contracts live in `docs/lab-0N/` (`specification.md`, `api-spec.md`,
`ui-spec.md`, `tests.md`).

## Prerequisites

- Node.js 20+
- PostgreSQL 16 running locally (`pg_isready` should answer)

## Setup

### Backend

```bash
cd server
cp .env.example .env
npm install
npx prisma migrate deploy
npm run prisma:seed
npm run dev                  # http://localhost:3000
```

`server/.env` needs:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | API port (default `3000`) |
| `JWT_SECRET` | session signing secret — generate your own, never commit it |
| `CLIENT_ORIGIN` | the front-end origin allowed by CORS (`http://localhost:5173`) |

### Frontend

```bash
cd client
cp .env.example .env
npm install
npm run dev                  # http://localhost:5173
```

Dates are stored in UTC and displayed in `Asia/Bangkok` (`client/src/dates.ts`).

## Database migrations

Always take a dump first (the `db-backups/` folder is gitignored):

```bash
pg_dump -Fc -d "postgresql://USER:PASSWORD@localhost:5432/toktickit" -f db-backups/pre-migration-$(date +%Y%m%d-%H%M%S).dump
cd server && npx prisma migrate deploy
```

`migrate deploy` applies pending migrations and never resets the database. Do not
run `prisma migrate reset` on a database whose data you want to keep.

### Rolling back the Lab 4 migration

Prisma has no down migrations. The Lab 4 migration (`*_lab4_actions_taken`) is
purely additive, and `server/prisma/rollback/lab4_actions_taken.down.sql` removes
exactly what it added, touching no Lab 1–3 data. Test it on a copy first:

```bash
cd server
./scripts/test-rollback.sh ../db-backups/<pre-migration dump>.dump
```

The script restores the dump into two scratch databases, applies the migration to
one, runs the down script, and checks that the schema matches the untouched copy
and that Lab 1–3 row counts are unchanged. It never connects to the working
database.

## Seed data and demo accounts

`npm run prisma:seed` is idempotent: running it twice creates nothing new.

Every seeded account starts with the local-dev password **`ChangeMe123!`** and
`mustChangePassword: true`, so it only unlocks the mandatory change-password
screen. This is not a real secret.

| Role | Email | Notes |
|---|---|---|
| Requester | `ada.lovelace@example.com` | Tickets in every dashboard bucket |
| Requester | `grace.hopper@example.com`, `alan.turing@example.com`, `linus.torvalds@example.com` | |
| Requester | `zoe.empty@example.com` | no Tickets — zero dashboard metrics |
| Requester (inactive) | `ivy.inactive@example.com` | cannot sign in |
| IT Staff | `margaret.hamilton@toktickit.com`, `katherine.johnson@toktickit.com`, `radia.perlman@toktickit.com` | |
| IT Staff | `zed.empty@toktickit.com` | nothing assigned — zero metrics |
| IT Staff (inactive) | `nolan.inactive@toktickit.com` | cannot sign in or be assigned |
| Administrator | `barbara.liskov@toktickit.com` | IT Staff behavior + user management |

Seeded Tickets use the `TKT-9999-` prefix. They cover all eight statuses, three
priorities, and assigned and unassigned owners. Some have no Actions Taken, some
one, some several, in all four action statuses. `TKT-9999-000002` (OPEN) has a
PLANNED action, which demonstrates the resolution gate.

## Tests

```bash
cd server && npm test        # unit, API/integration, authorization, workflow, migration, performance-smoke
cd client && npm test        # UI component and UI style
npx playwright test          # E2E and responsive (from the repo root, both dev servers running)
```

The server tests run against the real local database (no mocks). Seed it first.
Playwright saves screenshots under `artifacts/lab-0N/screenshots/`.

## Demonstration path

1. **Requester** (`ada.lovelace@example.com`): the Dashboard shows four cards and
   recent lists. Click "My Open Tickets" to land on My Tickets, pre-filtered with
   the same count. Open a Ticket: attachments, public comments, read-only Actions
   Taken, and the status history. There are no internal notes.
2. **IT Staff** (`margaret.hamilton@toktickit.com`): the Dashboard shows queue
   counts, My Assigned, High Priority, and My Open Actions. Open
   `TKT-9999-000002` and try to resolve it: the resolution gate refuses and points
   at the PLANNED action. Complete the action, then resolve.
3. **Actions Taken**: add an action with a follow-up, assign it, start it,
   complete it with a result, and cancel another one. Two browsers editing the same
   action get a "changed by someone else" warning instead of overwriting each
   other.
4. **Administrator** (`barbara.liskov@toktickit.com`): the same dashboard plus
   account counts. The Administrator can also work tickets (claim, status,
   actions) and manage users.
5. **Zero states**: `zoe.empty@example.com` and `zed.empty@toktickit.com` show
   zero metrics, and each drill-down leads to a no-results list.
