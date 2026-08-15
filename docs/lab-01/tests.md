# Lab 1 — Test Plan and Evidence

All test files live under `server/tests/lab-01/` and `client/tests/lab-01/`.

| ID | Test File | Tool | Test Description | Result |
|----|-----------|------|------------------|--------|
| API-01 | `server/tests/lab-01/health.test.ts` | Supertest | `GET /api/health` returns 200 and the exact JSON `{ status: "ok", service: "TokTickIT API" }` | Pass |
| API-02 | `server/tests/lab-01/categories.test.ts` | Supertest | `GET /api/categories` returns the four seeded categories, by name, with ascending ids | Pass |
| UI-01 | `client/tests/lab-01/App.test.tsx` | Vitest | The TokTickIT heading renders | Pass |
| UI-02 | `client/tests/lab-01/App.test.tsx` | Vitest | Success state shows `System Status: Online` and the category list from the API | Pass |
| UI-03 | `client/tests/lab-01/App.test.tsx` | Vitest | Failure state shows `System Status: Offline` and a useful error message | Pass |

API-02 requires the database to be migrated and seeded before the suite runs
(`npx prisma migrate dev` then `npm run prisma:seed`).

## Passing output

### server
```
 ✓ tests/lab-01/health.test.ts (1 test) 16ms
 ✓ tests/lab-01/categories.test.ts (1 test) 164ms

 Test Files  2 passed (2)
      Tests  2 passed (2)
```

### client
```
 ✓ tests/lab-01/App.test.tsx (3 tests) 73ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```
