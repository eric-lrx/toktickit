import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/password.js";

// Issue 34 — every Lab 2/3 server test that used to send
// X-Dev-Requester-Id now logs in for real and reuses the session cookie.
//
// Rather than guessing which password a shared named seed account (Ada,
// Grace, Margaret, Barbara...) currently has — Issue 32/33's own manual
// verification already changed some of them — this sets a known password
// directly via Prisma before logging in. That's a legitimate test-fixture
// technique here: this helper's job is "produce a working session," not
// exercise the login flow itself (auth.api.test.ts already covers that).
export const TEST_FIXED_PASSWORD = "TestSuiteFixed1!";
let cachedHash: string | null = null;

function extractCookie(res: request.Response): string {
  const raw = res.headers["set-cookie"] as unknown as string[] | string | undefined;
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const tokenCookie = cookies.find((c) => c.startsWith("token="));
  if (!tokenCookie) throw new Error("loginAs: no token cookie in login response");
  return tokenCookie.split(";")[0];
}

export async function loginAs(email: string): Promise<string> {
  if (!cachedHash) cachedHash = await hashPassword(TEST_FIXED_PASSWORD);
  await getPrisma().user.update({
    where: { email },
    data: { passwordHash: cachedHash, mustChangePassword: false },
  });

  const res = await request(app).post("/api/auth/login").send({ email, password: TEST_FIXED_PASSWORD });
  if (res.status !== 200) {
    throw new Error(`loginAs(${email}) failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return extractCookie(res);
}
