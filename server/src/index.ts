import { app } from "./app.js";

const PORT = Number(process.env.PORT) || 3000;

const server = app.listen(PORT, () => {
  console.log(`TokTickIT API listening on http://localhost:${PORT}`);
});

// Node closes idle keep-alive sockets after 5 s by default; a client that
// reuses one at that exact moment gets ECONNRESET (seen once during the Lab 4
// E2E campaign). Keeping idle sockets longer than clients do, with the
// headers timeout above it as Node requires, removes that race.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
