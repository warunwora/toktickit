import bcrypt from "bcryptjs";
import { getPrisma } from "../src/prisma.js";
import type { Priority, RoleName, TicketStatus } from "@prisma/client";

// Lab 1 seeded the four categories. Lab 2 added related systems and the
// Development Requesters. Lab 3 turns those records into real users with one
// role each, and adds IT Staff, an Administrator, queue-worthy tickets, Public
// Comments and Internal Notes (docs/lab-03/specification.md §7.5).
//
// Idempotency: every insert is an upsert on a natural unique key, and every
// ticket, comment and note is looked up by its seed key before it is created,
// so running this file twice changes nothing (BR-58 … BR-60).
//
// The seeded password is a LOCAL DEVELOPMENT credential only. It is documented
// in the README; no real personal password or secret is committed (BR-17).

const DEV_PASSWORD = "ChangeMe!2026";

const CATEGORY_NAMES = ["Account and Access", "Hardware", "Software", "Network"];

const RELATED_SYSTEM_NAMES = [
  "Email",
  "Campus Wi-Fi",
  "VPN",
  "LEB2 App",
  "Grade Submission App",
  "Printer",
  "Corporate Laptop",
];

interface SeedUser {
  name: string;
  email: string;
  department: string | null;
  role: RoleName;
  isActive: boolean;
  /** false for the demonstration accounts, so a demo does not start on four password screens (D-12). */
  mustChangePassword: boolean;
}

const USERS: SeedUser[] = [
  // Requesters — the five Lab 2 Development Requesters, migrated in place.
  { name: "Napat Srisai", email: "napat.sri@kmutt.ac.th", department: "Faculty of Engineering", role: "REQUESTER", isActive: true, mustChangePassword: false },
  { name: "Chanya Pholrat", email: "chanya.pho@kmutt.ac.th", department: "Faculty of Science", role: "REQUESTER", isActive: true, mustChangePassword: false },
  { name: "Kittisak Boonmee", email: "kittisak.boo@kmutt.ac.th", department: "Office of the Registrar", role: "REQUESTER", isActive: true, mustChangePassword: true },
  { name: "Suphansa Wongchai", email: "suphansa.won@kmutt.ac.th", department: "Library", role: "REQUESTER", isActive: true, mustChangePassword: true },
  { name: "Anan Tepsiri", email: "anan.tep@kmutt.ac.th", department: "Facilities (retired)", role: "REQUESTER", isActive: false, mustChangePassword: true },

  // IT Staff.
  { name: "Warin Chaiyaporn", email: "warin.cha@kmutt.ac.th", department: "IT Service Desk", role: "IT_STAFF", isActive: true, mustChangePassword: false },
  { name: "Pimchanok Rattana", email: "pimchanok.rat@kmutt.ac.th", department: "IT Service Desk", role: "IT_STAFF", isActive: true, mustChangePassword: false },
  { name: "Thanakrit Meesap", email: "thanakrit.mee@kmutt.ac.th", department: "Network Operations", role: "IT_STAFF", isActive: true, mustChangePassword: false },
  { name: "Ratchanon Duangdee", email: "ratchanon.dua@kmutt.ac.th", department: "IT Service Desk (left)", role: "IT_STAFF", isActive: false, mustChangePassword: true },

  // Administrator.
  { name: "Anong Sukjai", email: "anong.suk@kmutt.ac.th", department: "IT Management", role: "ADMINISTRATOR", isActive: true, mustChangePassword: false },
];

interface SeedTicket {
  requesterEmail: string;
  ownerEmail: string | null;
  category: string;
  relatedSystem: string;
  summary: string;
  description: string;
  requestedPriority: Priority;
  itPriority: Priority;
  status: TicketStatus;
  resolutionSummary?: string;
  requesterResolved?: boolean;
}

// Spread across every status, all four priorities, and assigned and unassigned
// ownership, so the IT Staff queue has something realistic to filter and sort.
const TICKETS: SeedTicket[] = [
  {
    requesterEmail: "napat.sri@kmutt.ac.th", ownerEmail: null,
    category: "Network", relatedSystem: "VPN",
    summary: "Cannot connect to the VPN from home",
    description: "The VPN client reports a certificate error every time I try to connect from my home network. It worked last week.",
    requestedPriority: "HIGH", itPriority: "HIGH", status: "NEW",
  },
  {
    requesterEmail: "chanya.pho@kmutt.ac.th", ownerEmail: null,
    category: "Hardware", relatedSystem: "Printer",
    summary: "Printer on the third floor keeps showing offline",
    description: "The shared printer shows offline for everyone on the floor even though its display says ready.",
    requestedPriority: "MEDIUM", itPriority: "MEDIUM", status: "NEW",
  },
  {
    requesterEmail: "kittisak.boo@kmutt.ac.th", ownerEmail: "warin.cha@kmutt.ac.th",
    category: "Account and Access", relatedSystem: "LEB2 App",
    summary: "New teaching assistant needs LEB2 access",
    description: "A new teaching assistant started this week and needs access to the course workspace in LEB2.",
    requestedPriority: "LOW", itPriority: "MEDIUM", status: "OPEN",
  },
  {
    requesterEmail: "suphansa.won@kmutt.ac.th", ownerEmail: "warin.cha@kmutt.ac.th",
    category: "Software", relatedSystem: "Email",
    summary: "Outlook freezes when opening large mailboxes",
    description: "Outlook stops responding for about a minute whenever I open the shared library mailbox.",
    requestedPriority: "MEDIUM", itPriority: "HIGH", status: "IN_PROGRESS",
  },
  {
    requesterEmail: "napat.sri@kmutt.ac.th", ownerEmail: "pimchanok.rat@kmutt.ac.th",
    category: "Hardware", relatedSystem: "Corporate Laptop",
    summary: "Laptop battery drains within two hours",
    description: "The battery on my assigned laptop drains much faster than usual even when the machine is idle.",
    requestedPriority: "MEDIUM", itPriority: "MEDIUM", status: "IN_PROGRESS",
  },
  {
    requesterEmail: "chanya.pho@kmutt.ac.th", ownerEmail: "pimchanok.rat@kmutt.ac.th",
    category: "Network", relatedSystem: "Campus Wi-Fi",
    summary: "Wi-Fi drops in the lecture room every afternoon",
    description: "Students lose the campus Wi-Fi during afternoon lectures in room CB2-401 and have to reconnect.",
    requestedPriority: "HIGH", itPriority: "URGENT", status: "WAITING_FOR_REQUESTER",
  },
  {
    requesterEmail: "kittisak.boo@kmutt.ac.th", ownerEmail: "thanakrit.mee@kmutt.ac.th",
    category: "Software", relatedSystem: "Grade Submission App",
    summary: "Grade submission page times out at the deadline",
    description: "The submission page times out when many lecturers submit at the same time near the deadline.",
    requestedPriority: "URGENT", itPriority: "URGENT", status: "WAITING_FOR_REQUESTER",
    requesterResolved: true,
  },
  {
    requesterEmail: "suphansa.won@kmutt.ac.th", ownerEmail: "thanakrit.mee@kmutt.ac.th",
    category: "Account and Access", relatedSystem: "Email",
    summary: "Shared library mailbox permissions are missing",
    description: "Two staff members lost their permissions on the shared library mailbox after the last change.",
    requestedPriority: "MEDIUM", itPriority: "MEDIUM", status: "RESOLVED",
    resolutionSummary: "Re-applied the mailbox delegation for both accounts and confirmed access with the requester.",
  },
  {
    requesterEmail: "napat.sri@kmutt.ac.th", ownerEmail: "warin.cha@kmutt.ac.th",
    category: "Software", relatedSystem: "LEB2 App",
    summary: "Course material upload fails for large files",
    description: "Uploading a lecture recording over 200 MB fails without any error message.",
    requestedPriority: "LOW", itPriority: "LOW", status: "RESOLVED",
    resolutionSummary: "Raised the upload limit on the application server and verified a 400 MB upload.",
    requesterResolved: true,
  },
  {
    requesterEmail: "chanya.pho@kmutt.ac.th", ownerEmail: "warin.cha@kmutt.ac.th",
    category: "Hardware", relatedSystem: "Corporate Laptop",
    summary: "Docking station is not detected",
    description: "The docking station in the shared office is not detected by my laptop after the last Windows update.",
    requestedPriority: "LOW", itPriority: "LOW", status: "CLOSED",
    resolutionSummary: "Replaced the dock firmware and confirmed both monitors work.",
  },
  {
    requesterEmail: "suphansa.won@kmutt.ac.th", ownerEmail: "pimchanok.rat@kmutt.ac.th",
    category: "Network", relatedSystem: "VPN",
    summary: "VPN disconnects after fifteen minutes",
    description: "The VPN session drops after about fifteen minutes and has to be started again.",
    requestedPriority: "HIGH", itPriority: "HIGH", status: "REOPENED",
  },
  {
    requesterEmail: "kittisak.boo@kmutt.ac.th", ownerEmail: null,
    category: "Software", relatedSystem: "Email",
    summary: "Duplicate request for a second monitor",
    description: "This request was submitted twice by mistake; the other ticket covers the same monitor.",
    requestedPriority: "LOW", itPriority: "LOW", status: "CANCELLED",
  },
  {
    requesterEmail: "napat.sri@kmutt.ac.th", ownerEmail: null,
    category: "Account and Access", relatedSystem: "Grade Submission App",
    summary: "Access request for the grade submission report",
    description: "I need read access to the grade submission report for the current semester.",
    requestedPriority: "LOW", itPriority: "LOW", status: "NEW",
  },
  {
    requesterEmail: "chanya.pho@kmutt.ac.th", ownerEmail: "thanakrit.mee@kmutt.ac.th",
    category: "Hardware", relatedSystem: "Printer",
    summary: "Multi-function printer jams on double sided printing",
    description: "The printer jams on almost every double sided job since the paper tray was refilled.",
    requestedPriority: "MEDIUM", itPriority: "LOW", status: "OPEN",
  },
];

interface SeedEntry {
  ticketSummary: string;
  authorEmail: string;
  body: string;
}

const PUBLIC_COMMENTS: SeedEntry[] = [
  { ticketSummary: "Outlook freezes when opening large mailboxes", authorEmail: "warin.cha@kmutt.ac.th", body: "We are investigating the issue on your device. Could you tell us roughly how many items the shared mailbox holds?" },
  { ticketSummary: "Outlook freezes when opening large mailboxes", authorEmail: "suphansa.won@kmutt.ac.th", body: "It is about forty thousand items. Thank you for looking into it." },
  { ticketSummary: "Wi-Fi drops in the lecture room every afternoon", authorEmail: "pimchanok.rat@kmutt.ac.th", body: "We have asked the network team to check the access point in that room. We will update you after the site visit." },
  { ticketSummary: "Grade submission page times out at the deadline", authorEmail: "kittisak.boo@kmutt.ac.th", body: "It has been working for me since yesterday, so the problem appears resolved on my side." },
  { ticketSummary: "Shared library mailbox permissions are missing", authorEmail: "thanakrit.mee@kmutt.ac.th", body: "The delegation has been re-applied for both accounts. Please confirm that you can open the mailbox." },
  { ticketSummary: "Course material upload fails for large files", authorEmail: "napat.sri@kmutt.ac.th", body: "The upload works now. Thank you for the quick fix." },
];

const INTERNAL_NOTES: SeedEntry[] = [
  { ticketSummary: "Wi-Fi drops in the lecture room every afternoon", authorEmail: "pimchanok.rat@kmutt.ac.th", body: "Access point firmware on that floor is two versions behind. Scheduled for the maintenance window on Sunday." },
  { ticketSummary: "Outlook freezes when opening large mailboxes", authorEmail: "warin.cha@kmutt.ac.th", body: "Cached mode is off for this profile. Enable it before considering a mailbox archive." },
  { ticketSummary: "Grade submission page times out at the deadline", authorEmail: "thanakrit.mee@kmutt.ac.th", body: "Application pool recycles under load. Capacity request raised with the platform team, reference INF-2291." },
  { ticketSummary: "VPN disconnects after fifteen minutes", authorEmail: "pimchanok.rat@kmutt.ac.th", body: "Reopened because the idle timeout change was reverted during the last configuration rollback." },
  { ticketSummary: "New teaching assistant needs LEB2 access", authorEmail: "warin.cha@kmutt.ac.th", body: "Waiting for the department head to confirm the contract end date before granting access." },
];

function ticketNumber(year: number, id: number): string {
  return `TKT-${year}-${String(id).padStart(6, "0")}`;
}

async function main() {
  const prisma = getPrisma();
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  for (const name of CATEGORY_NAMES) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }

  for (const name of RELATED_SYSTEM_NAMES) {
    await prisma.relatedSystem.upsert({ where: { name }, update: {}, create: { name } });
  }

  // The password hash is set only when the row is created, so a password
  // changed during a demonstration survives the next seed run.
  for (const user of USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        department: user.department,
        role: user.role,
        isActive: user.isActive,
        mustChangePassword: user.mustChangePassword,
      },
      create: { ...user, passwordHash },
    });
  }

  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  const userId = new Map(users.map((u) => [u.email, u.id]));
  const categories = await prisma.category.findMany({ select: { id: true, name: true } });
  const categoryId = new Map(categories.map((c) => [c.name, c.id]));
  const systems = await prisma.relatedSystem.findMany({ select: { id: true, name: true } });
  const systemId = new Map(systems.map((s) => [s.name, s.id]));

  let createdTickets = 0;
  for (const ticket of TICKETS) {
    const requesterId = userId.get(ticket.requesterEmail)!;
    const existing = await prisma.ticket.findFirst({
      where: { requesterId, summary: ticket.summary },
      select: { id: true },
    });
    if (existing) continue;

    // The ticket number is derived from the row id inside the same transaction,
    // exactly as the Create Ticket endpoint does it.
    await prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: {
          ticketNumber: "",
          requesterId,
          ownerId: ticket.ownerEmail ? userId.get(ticket.ownerEmail)! : null,
          categoryId: categoryId.get(ticket.category)!,
          relatedSystemId: systemId.get(ticket.relatedSystem)!,
          summary: ticket.summary,
          description: ticket.description,
          requestedPriority: ticket.requestedPriority,
          itPriority: ticket.itPriority,
          status: ticket.status,
          resolutionSummary: ticket.resolutionSummary ?? null,
          requesterResolvedAt: ticket.requesterResolved ? new Date() : null,
          resolvedAt: ticket.status === "RESOLVED" || ticket.status === "CLOSED" ? new Date() : null,
          closedAt: ticket.status === "CLOSED" ? new Date() : null,
        },
        select: { id: true, createdAt: true },
      });
      await tx.ticket.update({
        where: { id: created.id },
        data: { ticketNumber: ticketNumber(created.createdAt.getFullYear(), created.id) },
      });
    });
    createdTickets += 1;
  }

  const seededTickets = await prisma.ticket.findMany({ select: { id: true, summary: true } });
  const ticketId = new Map(seededTickets.map((t) => [t.summary, t.id]));

  let createdComments = 0;
  for (const comment of PUBLIC_COMMENTS) {
    const id = ticketId.get(comment.ticketSummary);
    if (!id) continue;
    const existing = await prisma.publicComment.findFirst({
      where: { ticketId: id, body: comment.body },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.publicComment.create({
      data: { ticketId: id, authorId: userId.get(comment.authorEmail)!, body: comment.body },
    });
    createdComments += 1;
  }

  let createdNotes = 0;
  for (const note of INTERNAL_NOTES) {
    const id = ticketId.get(note.ticketSummary);
    if (!id) continue;
    const existing = await prisma.internalNote.findFirst({
      where: { ticketId: id, body: note.body },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.internalNote.create({
      data: { ticketId: id, authorId: userId.get(note.authorEmail)!, body: note.body },
    });
    createdNotes += 1;
  }

  const activeRequesters = USERS.filter((u) => u.role === "REQUESTER" && u.isActive).length;
  const activeStaff = USERS.filter((u) => u.role === "IT_STAFF" && u.isActive).length;
  console.log(
    `Seeded ${CATEGORY_NAMES.length} categories, ${RELATED_SYSTEM_NAMES.length} related systems, ` +
      `${USERS.length} users (${activeRequesters} active Requesters, ${activeStaff} active IT Staff, ` +
      `1 Administrator, 2 inactive). Created ${createdTickets} ticket(s), ${createdComments} comment(s) ` +
      `and ${createdNotes} internal note(s) on this run.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
