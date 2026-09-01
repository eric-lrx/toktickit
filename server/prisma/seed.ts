import { getPrisma } from "../src/prisma.js";

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

async function main() {
  const prisma = getPrisma();
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
    await prisma.requesterUser.upsert({
      where: { email },
      update: {},
      create: { name, email, isActive: true },
    });
  }
  await prisma.requesterUser.upsert({
    where: { email: INACTIVE_REQUESTER.email },
    update: {},
    create: { ...INACTIVE_REQUESTER, isActive: false },
  });
  console.log(`Seeded ${ACTIVE_REQUESTERS.length} active + 1 inactive Development Requester.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
