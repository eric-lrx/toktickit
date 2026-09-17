import { getPrisma } from "../src/prisma.js";
import { hashPassword } from "../src/password.js";

// Lab 3 §5.3 — documented local-dev initial password for every seeded
// account. Not a real secret: every account it applies to also has
// mustChangePassword=true, so it only ever unlocks the mandatory
// change-password screen, never the application itself.
export const SEED_INITIAL_PASSWORD = "ChangeMe123!";

// Issue 3 — seed the four supported categories.
// The four names are: Account and Access, Hardware, Software, Network.
// Requirement: running the seed twice must NOT create duplicates.
// Hint: prisma.category.upsert({ where:{name}, update:{}, create:{name} }).
const CATEGORY_NAMES = ["Account and Access", "Hardware", "Software", "Network"];

// Issue 6 — reference data and Development Requester context (BR-03, not auth).
const RELATED_SYSTEM_NAMES = [
  "Email",
  "Campus Wi-Fi",
  "VPN",
  "LEB2 App",
  "Grade Submission App",
  "Printer",
  "Corporate Laptop",
];

const ACTIVE_REQUESTERS = [
  { name: "Ada Lovelace", email: "ada.lovelace@example.com" },
  { name: "Grace Hopper", email: "grace.hopper@example.com" },
  { name: "Alan Turing", email: "alan.turing@example.com" },
  { name: "Linus Torvalds", email: "linus.torvalds@example.com" },
];

// Required by 5.3: at least one inactive Requester, must not appear in the selector.
const INACTIVE_REQUESTER = { name: "Ivy Inactive", email: "ivy.inactive@example.com" };

// Lab 3 §5.3 — at least three active IT Staff and one inactive IT Staff.
const ACTIVE_IT_STAFF = [
  { name: "Margaret Hamilton", email: "margaret.hamilton@toktickit.com" },
  { name: "Katherine Johnson", email: "katherine.johnson@toktickit.com" },
  { name: "Radia Perlman", email: "radia.perlman@toktickit.com" },
];
const INACTIVE_IT_STAFF = { name: "Nolan Inactive", email: "nolan.inactive@toktickit.com" };

// Lab 3 §5.3 — at least one active Administrator.
const ACTIVE_ADMINISTRATORS = [{ name: "Barbara Liskov", email: "barbara.liskov@toktickit.com" }];

async function main() {
  const prisma = getPrisma();
  const passwordHash = await hashPassword(SEED_INITIAL_PASSWORD);
  for (const name of CATEGORY_NAMES) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${CATEGORY_NAMES.length} categories.`);

  for (const name of RELATED_SYSTEM_NAMES) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${RELATED_SYSTEM_NAMES.length} related systems.`);

  for (const { name, email } of ACTIVE_REQUESTERS) {
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: { name, email, isActive: true, role: "REQUESTER", passwordHash, mustChangePassword: true },
    });
  }
  await prisma.user.upsert({
    where: { email: INACTIVE_REQUESTER.email },
    update: {},
    create: { ...INACTIVE_REQUESTER, isActive: false, role: "REQUESTER", passwordHash, mustChangePassword: true },
  });
  console.log(`Seeded ${ACTIVE_REQUESTERS.length} active + 1 inactive Requester.`);

  for (const { name, email } of ACTIVE_IT_STAFF) {
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: { name, email, isActive: true, role: "IT_STAFF", passwordHash, mustChangePassword: true },
    });
  }
  await prisma.user.upsert({
    where: { email: INACTIVE_IT_STAFF.email },
    update: {},
    create: { ...INACTIVE_IT_STAFF, isActive: false, role: "IT_STAFF", passwordHash, mustChangePassword: true },
  });
  console.log(`Seeded ${ACTIVE_IT_STAFF.length} active + 1 inactive IT Staff.`);

  for (const { name, email } of ACTIVE_ADMINISTRATORS) {
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: { name, email, isActive: true, role: "ADMINISTRATOR", passwordHash, mustChangePassword: true },
    });
  }
  console.log(`Seeded ${ACTIVE_ADMINISTRATORS.length} active Administrator.`);
  console.log(`All seeded accounts use the documented local-dev initial password (README.md).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
