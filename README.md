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

## Tests
```bash
cd server && npm test
cd client && npm test
```
