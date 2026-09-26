import { Page, request as playwrightRequest } from "@playwright/test";
import { API_URL, ADMIN_BARBARA, loginAs } from "../lab-03/helpers.js";

export { API_URL, loginAs };

// Lab 4 E2E specs run in parallel with the Lab 2–3 ones against one shared
// database. Anything that compares a count with a list uses a disposable
// account created here, so another test creating Tickets at the same time
// cannot change the numbers under it.
const INITIAL_PASSWORD = "E2eInitial1!";
const FINAL_PASSWORD = "E2eFinal1!";
// The two passwords a seeded account can currently have (see lab-03/helpers.ts).
const ADMIN_PASSWORDS = ["TestSuiteFixed1!", "ChangeMe123!"];

export type Role = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";

async function adminRequest() {
  const admin = await playwrightRequest.newContext({ baseURL: API_URL });
  for (const password of ADMIN_PASSWORDS) {
    if ((await admin.post("/api/auth/login", { data: { email: ADMIN_BARBARA, password } })).ok()) return admin;
  }
  throw new Error("Administrator login failed");
}

// Creates an account through the Administrator API, then completes the
// mandatory password change through the API so the account is ready to use.
export async function createAccount(role: Role, label: string): Promise<{ id: number; email: string }> {
  const admin = await adminRequest();
  const email = `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@toktickit.com`;
  const created = await admin.post("/api/admin/users", {
    data: { name: `E2E ${label}`, email, role, isActive: true, initialPassword: INITIAL_PASSWORD },
  });
  if (!created.ok()) throw new Error(`createAccount: ${created.status()} ${await created.text()}`);
  const id = (await created.json()).data.id as number;
  await admin.dispose();

  const self = await playwrightRequest.newContext({ baseURL: API_URL });
  await self.post("/api/auth/login", { data: { email, password: INITIAL_PASSWORD } });
  const changed = await self.post("/api/auth/change-password", { data: { currentPassword: INITIAL_PASSWORD, newPassword: FINAL_PASSWORD } });
  if (!changed.ok()) throw new Error(`createAccount: password change failed (${changed.status()})`);
  await self.dispose();
  return { id, email };
}

export async function deactivateAccount(id: number) {
  const admin = await adminRequest();
  const res = await admin.patch(`/api/admin/users/${id}`, { data: { isActive: false } });
  if (!res.ok()) throw new Error(`deactivateAccount: ${res.status()}`);
  await admin.dispose();
}

// Signs a page in as a disposable account created by createAccount.
export async function signIn(page: Page, email: string) {
  const res = await page.request.post(`${API_URL}/api/auth/login`, { data: { email, password: FINAL_PASSWORD } });
  if (!res.ok()) throw new Error(`signIn(${email}) failed: ${res.status()}`);
  await page.goto("/");
}

export async function createTicketAs(page: Page, summary: string): Promise<{ id: number; ticketNumber: string }> {
  const cats = await (await page.request.get(`${API_URL}/api/categories`)).json();
  const systems = await (await page.request.get(`${API_URL}/api/related-systems`)).json();
  const res = await page.request.post(`${API_URL}/api/tickets`, {
    data: { categoryId: cats[0].id, relatedSystemId: systems[0].id, summary, description: `${summary} (E2E fixture)`, requestedPriority: "MEDIUM" },
  });
  if (!res.ok()) throw new Error(`createTicketAs: ${res.status()} ${await res.text()}`);
  const t = (await res.json()).data;
  return { id: t.id, ticketNumber: t.ticketNumber };
}
