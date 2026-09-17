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

  await seedTickets(prisma);
}

// Lab 3 §5.3 — realistic Tickets distributed across Requesters, statuses,
// priorities, and assigned/unassigned ownership. Year "9999" in the Ticket
// Number is the idempotency key (upsert) and doubles as an unmistakable
// "this is seed data" marker — real Tickets always carry the current year.
async function seedTickets(prisma: ReturnType<typeof getPrisma>) {
  const [ada, grace, alan] = await prisma.user.findMany({
    where: { role: "REQUESTER", isActive: true },
    orderBy: { id: "asc" },
    take: 3,
  });
  const [margaret, katherine, radia] = await prisma.user.findMany({
    where: { role: "IT_STAFF", isActive: true },
    orderBy: { id: "asc" },
    take: 3,
  });
  const administrator = await prisma.user.findFirstOrThrow({ where: { role: "ADMINISTRATOR", isActive: true } });
  const hardware = await prisma.category.findFirstOrThrow({ where: { name: "Hardware" } });
  const software = await prisma.category.findFirstOrThrow({ where: { name: "Software" } });
  const network = await prisma.category.findFirstOrThrow({ where: { name: "Network" } });
  const accountAccess = await prisma.category.findFirstOrThrow({ where: { name: "Account and Access" } });
  const email = await prisma.relatedSystem.findFirstOrThrow({ where: { name: "Email" } });
  const wifi = await prisma.relatedSystem.findFirstOrThrow({ where: { name: "Campus Wi-Fi" } });
  const printer = await prisma.relatedSystem.findFirstOrThrow({ where: { name: "Printer" } });
  const laptop = await prisma.relatedSystem.findFirstOrThrow({ where: { name: "Corporate Laptop" } });

  const seedTicketsData = [
    {
      n: 1,
      requester: ada,
      category: hardware,
      related: printer,
      summary: "Printer on 3rd floor jams every print job",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      status: "NEW",
      owner: null,
    },
    {
      n: 2,
      requester: ada,
      category: network,
      related: wifi,
      summary: "Wi-Fi drops every few minutes in the library",
      requestedPriority: "HIGH",
      itPriority: "HIGH",
      status: "OPEN",
      owner: margaret,
    },
    {
      n: 3,
      requester: grace,
      category: software,
      related: laptop,
      summary: "Corporate laptop won't boot past the login screen",
      requestedPriority: "HIGH",
      itPriority: "HIGH",
      status: "IN_PROGRESS",
      owner: margaret,
    },
    {
      n: 4,
      requester: grace,
      category: accountAccess,
      related: email,
      summary: "Locked out of email after password expiry",
      requestedPriority: "MEDIUM",
      itPriority: "LOW",
      status: "WAITING_FOR_REQUESTER",
      owner: katherine,
    },
    {
      n: 5,
      requester: alan,
      category: hardware,
      related: laptop,
      summary: "Laptop battery drains fully within an hour",
      requestedPriority: "LOW",
      itPriority: "LOW",
      status: "RESOLVED",
      owner: katherine,
      resolutionSummary: "Replaced the battery; verified 6+ hours of runtime.",
    },
    {
      n: 6,
      requester: alan,
      category: network,
      related: wifi,
      summary: "VPN certificate expired, cannot connect remotely",
      requestedPriority: "HIGH",
      itPriority: "HIGH",
      status: "CLOSED",
      owner: radia,
      resolutionSummary: "Issued a renewed certificate; confirmed remote access restored.",
    },
    {
      n: 7,
      requester: ada,
      category: software,
      related: email,
      summary: "Grade submission app rejects valid CSV uploads",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      status: "REOPENED",
      owner: radia,
    },
    {
      n: 8,
      requester: grace,
      category: accountAccess,
      related: email,
      summary: "Duplicate account request submitted by mistake",
      requestedPriority: "LOW",
      itPriority: "LOW",
      status: "CANCELLED",
      owner: null,
    },
    {
      n: 9,
      requester: alan,
      category: hardware,
      related: printer,
      summary: "Need a second monitor for the accessibility workstation",
      requestedPriority: "LOW",
      itPriority: "LOW",
      status: "NEW",
      owner: null,
    },
    {
      n: 10,
      requester: ada,
      category: network,
      related: laptop,
      summary: "Corporate laptop flagged by endpoint security, needs review",
      requestedPriority: "HIGH",
      itPriority: "HIGH",
      status: "OPEN",
      owner: administrator,
    },
  ] as const;

  for (const t of seedTicketsData) {
    const ticketNumber = `TKT-9999-${String(t.n).padStart(6, "0")}`;
    await prisma.ticket.upsert({
      where: { ticketNumber },
      update: {},
      create: {
        ticketNumber,
        requesterId: t.requester.id,
        categoryId: t.category.id,
        relatedSystemId: t.related.id,
        summary: t.summary,
        description: `${t.summary}. (Seed fixture for the IT Staff Ticket Queue and Detail screens.)`,
        requestedPriority: t.requestedPriority,
        itPriority: t.itPriority,
        status: t.status,
        ticketOwnerId: t.owner?.id ?? null,
        resolutionSummary: "resolutionSummary" in t ? t.resolutionSummary : null,
      },
    });
  }
  console.log(`Seeded ${seedTicketsData.length} realistic Tickets across statuses, priorities, and ownership.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
