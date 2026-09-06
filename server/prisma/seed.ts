import { getPrisma } from "../src/prisma.js";

// Lab 1 seeded the four categories. Lab 2 adds related systems and the
// Development Requesters used instead of login (BR-05, BR-06).
//
// Every insert is an upsert on a natural unique key, so running the seed twice
// creates no duplicates (docs/lab-02/specification.md §7.4).

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

const REQUESTERS = [
  { name: "Napat Srisai", email: "napat.sri@kmutt.ac.th", department: "Faculty of Engineering", isActive: true },
  { name: "Chanya Pholrat", email: "chanya.pho@kmutt.ac.th", department: "Faculty of Science", isActive: true },
  { name: "Kittisak Boonmee", email: "kittisak.boo@kmutt.ac.th", department: "Office of the Registrar", isActive: true },
  { name: "Suphansa Wongchai", email: "suphansa.won@kmutt.ac.th", department: "Library", isActive: true },
  { name: "Anan Tepsiri", email: "anan.tep@kmutt.ac.th", department: "Facilities (retired)", isActive: false },
];

async function main() {
  const prisma = getPrisma();

  for (const name of CATEGORY_NAMES) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const name of RELATED_SYSTEM_NAMES) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const requester of REQUESTERS) {
    await prisma.requesterUser.upsert({
      where: { email: requester.email },
      update: {},
      create: requester,
    });
  }

  const activeRequesters = REQUESTERS.filter((r) => r.isActive).length;
  console.log(
    `Seeded ${CATEGORY_NAMES.length} categories, ${RELATED_SYSTEM_NAMES.length} related systems, ` +
      `${activeRequesters} active and ${REQUESTERS.length - activeRequesters} inactive Development Requester(s).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
