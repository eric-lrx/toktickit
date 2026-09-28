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

// Lab 4 §5.3 — one Requester and one IT Staff user who own nothing, have
// nothing assigned, and never get Actions Taken, so zero dashboard metrics
// can be demonstrated next to non-zero ones.
const ZERO_DATA_REQUESTER = { name: "Zoe Empty", email: "zoe.empty@example.com" };
const ZERO_DATA_IT_STAFF = { name: "Zed Empty", email: "zed.empty@toktickit.com" };

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

  await prisma.user.upsert({
    where: { email: ZERO_DATA_REQUESTER.email },
    update: {},
    create: { ...ZERO_DATA_REQUESTER, isActive: true, role: "REQUESTER", passwordHash, mustChangePassword: true },
  });
  await prisma.user.upsert({
    where: { email: ZERO_DATA_IT_STAFF.email },
    update: {},
    create: { ...ZERO_DATA_IT_STAFF, isActive: true, role: "IT_STAFF", passwordHash, mustChangePassword: true },
  });
  console.log("Seeded 1 zero-data Requester + 1 zero-data IT Staff user.");
  console.log(`All seeded accounts use the documented local-dev initial password (README.md).`);

  await seedTickets(prisma);
  await seedActionsTaken(prisma);
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
    // Lab 4 — gives Ada a Ticket in every Requester dashboard bucket.
    {
      n: 11,
      requester: ada,
      category: accountAccess,
      related: email,
      summary: "Shared mailbox access request needs manager approval",
      requestedPriority: "LOW",
      itPriority: "LOW",
      status: "WAITING_FOR_REQUESTER",
      owner: katherine,
    },
    {
      n: 12,
      requester: ada,
      category: software,
      related: laptop,
      summary: "Office suite license expired on corporate laptop",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      status: "RESOLVED",
      owner: margaret,
      resolutionSummary: "Renewed the license and reactivated the suite.",
    },
    {
      n: 13,
      requester: ada,
      category: hardware,
      related: printer,
      summary: "Toner replacement for the lab printer",
      requestedPriority: "LOW",
      itPriority: "LOW",
      status: "CLOSED",
      owner: radia,
      resolutionSummary: "Replaced the toner cartridge.",
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
        // BR-16 — a freshly seeded RESOLVED/CLOSED Ticket needs resolvedAt
        // too (the migration backfill only covers rows that already existed).
        resolvedAt: t.status === "RESOLVED" || t.status === "CLOSED" ? new Date() : null,
      },
    });
  }
  console.log(`Seeded ${seedTicketsData.length} realistic Tickets across statuses, priorities, and ownership.`);
}

// Lab 4 §5.3 — Tickets with zero, one, and several Actions Taken, every
// Action status, and at least one PLANNED action on an unresolved Ticket
// (TKT-9999-000002) so the resolution gate can be demonstrated live. Resolved
// and closed Tickets only carry COMPLETED/CANCELLED actions, consistent with
// the gate. ActionTaken has no natural unique key, so (ticketId, description)
// is the idempotency key here: an existing pair is never recreated.
async function seedActionsTaken(prisma: ReturnType<typeof getPrisma>) {
  const byEmail = async (email: string) => prisma.user.findUniqueOrThrow({ where: { email } });
  const margaret = await byEmail("margaret.hamilton@toktickit.com");
  const katherine = await byEmail("katherine.johnson@toktickit.com");
  const radia = await byEmail("radia.perlman@toktickit.com");
  const barbara = await byEmail("barbara.liskov@toktickit.com");

  const day = 24 * 60 * 60 * 1000;
  const daysAgo = (n: number) => new Date(Date.now() - n * day);

  const actions = [
    // #2 OPEN — one PLANNED action: blocks resolution (gate demo).
    { n: 2, by: margaret, assignee: margaret, at: daysAgo(1), status: "PLANNED", description: "Check the library access point logs for disconnect events" },
    // #3 IN_PROGRESS — several actions in several statuses, by two staff members (BR-02).
    { n: 3, by: margaret, assignee: margaret, at: daysAgo(4), status: "COMPLETED", description: "Ran hardware diagnostics on the laptop", result: "Disk and memory pass; login service fails to start" },
    { n: 3, by: katherine, assignee: katherine, at: daysAgo(3), status: "IN_PROGRESS", description: "Reimage the login service configuration" },
    { n: 3, by: margaret, assignee: margaret, at: daysAgo(2), status: "PLANNED", description: "Confirm the fix with the Requester after reimage", followUpRequired: true, followUpNote: "Call the Requester once the reimage is done" },
    { n: 3, by: margaret, assignee: null, at: daysAgo(2), status: "CANCELLED", description: "Order a replacement laptop" },
    // #4 WAITING — one completed action that needs a follow-up.
    { n: 4, by: katherine, assignee: katherine, at: daysAgo(2), status: "COMPLETED", description: "Reset the email password and sent a temporary one", result: "Temporary password issued", followUpRequired: true, followUpNote: "Waiting for the Requester to confirm login", attachmentNotes: "See reset-confirmation.png on the Ticket" },
    // #5 RESOLVED — all actions terminal.
    { n: 5, by: katherine, assignee: katherine, at: daysAgo(6), status: "COMPLETED", description: "Tested the battery with the vendor tool", result: "Battery health at 41%" },
    { n: 5, by: katherine, assignee: katherine, at: daysAgo(5), status: "COMPLETED", description: "Replaced the battery", result: "Runtime back to 6+ hours" },
    { n: 5, by: radia, assignee: null, at: daysAgo(5), status: "CANCELLED", description: "Loan a spare laptop" },
    // #6 CLOSED — one completed action.
    { n: 6, by: radia, assignee: radia, at: daysAgo(8), status: "COMPLETED", description: "Issued a renewed VPN certificate", result: "Remote access confirmed" },
    // #7 REOPENED — earlier work completed, new work planned.
    { n: 7, by: radia, assignee: radia, at: daysAgo(7), status: "COMPLETED", description: "Fixed the CSV delimiter setting", result: "Test upload accepted" },
    { n: 7, by: radia, assignee: radia, at: daysAgo(1), status: "PLANNED", description: "Investigate the rejected upload reported after reopening" },
    // #10 OPEN — Administrator doing IT Staff work (revised matrix).
    { n: 10, by: barbara, assignee: barbara, at: daysAgo(1), status: "IN_PROGRESS", description: "Review the endpoint security alert details" },
    // #12 RESOLVED — one completed action.
    { n: 12, by: margaret, assignee: margaret, at: daysAgo(3), status: "COMPLETED", description: "Renewed the office suite license", result: "Suite activated" },
  ] as const;

  let created = 0;
  for (const a of actions) {
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: `TKT-9999-${String(a.n).padStart(6, "0")}` } });
    const exists = await prisma.actionTaken.findFirst({ where: { ticketId: ticket.id, description: a.description } });
    if (exists) continue;
    await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        performedById: a.by.id,
        assigneeId: a.assignee?.id ?? null,
        actionAt: a.at,
        description: a.description,
        result: "result" in a ? a.result : null,
        status: a.status,
        followUpRequired: "followUpRequired" in a ? a.followUpRequired : false,
        followUpNote: "followUpNote" in a ? a.followUpNote : null,
        attachmentNotes: "attachmentNotes" in a ? a.attachmentNotes : null,
      },
    });
    created++;
  }
  console.log(`Seeded Actions Taken: ${created} new, ${actions.length - created} already present.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
