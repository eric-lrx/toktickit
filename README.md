# TokTickIT

IT service desk app — Lab 1 vertical slice (React/Vite/Bootstrap → Express → Prisma/PostgreSQL).

## Setup

### Backend
```bash
cd server
cp .env.example .env   # adjust DATABASE_URL if needed
npm install
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev             # http://localhost:3000
```

### Frontend
```bash
cd client
cp .env.example .env
npm install
npm run dev              # http://localhost:5173
```

## Authentication (Lab 3)

Every seeded account (`server/prisma/seed.ts`) shares one local-dev-only
initial password: **`ChangeMe123!`**. Not a real secret — every seeded
account also has `mustChangePassword: true`, so this password only ever
unlocks the mandatory change-password screen, never the application itself.

| Role | Email |
|---|---|
| Requester | `ada.lovelace@example.com` (+ 3 more active, 1 inactive) |
| IT Staff | `margaret.hamilton@toktickit.com` (+ 2 more active, 1 inactive) |
| Administrator | `barbara.liskov@toktickit.com` |

`server/.env` needs `JWT_SECRET` (generate your own — see `.env.example`) and
`CLIENT_ORIGIN` (defaults to `http://localhost:5173`) in addition to the Lab
1/2 `DATABASE_URL`/`PORT`.

## Tests
```bash
cd server && npm test
cd client && npm test
```
