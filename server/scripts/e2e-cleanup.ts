import { getPrisma } from "../src/prisma.js";

// Removes the throwaway accounts the Playwright suites create. The product
// deactivates rather than deletes users (BR-54), which is right for real
// accounts but would let test rows pile up in the demonstration list, so the
// cleanup happens outside the API.

const TEST_DOMAIN = "@toktickit.test";

async function main() {
  const prisma = getPrisma();

  const users = await prisma.user.findMany({
    where: { email: { endsWith: TEST_DOMAIN } },
    select: { id: true },
  });

  if (users.length === 0) {
    console.log("No end-to-end test accounts to remove.");
    return;
  }

  const ids = users.map((user) => user.id);

  // A user who owns or requested a ticket cannot be deleted (onDelete: Restrict),
  // and the end-to-end tickets are evidence, so those accounts stay deactivated.
  const inUse = await prisma.ticket.findMany({
    where: { OR: [{ requesterId: { in: ids } }, { ownerId: { in: ids } }] },
    select: { requesterId: true, ownerId: true },
  });
  const keep = new Set<number>();
  for (const ticket of inUse) {
    keep.add(ticket.requesterId);
    if (ticket.ownerId) keep.add(ticket.ownerId);
  }

  const removable = ids.filter((id) => !keep.has(id));

  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.publicComment.deleteMany({ where: { authorId: { in: removable } } });
  await prisma.internalNote.deleteMany({ where: { authorId: { in: removable } } });
  await prisma.user.deleteMany({ where: { id: { in: removable } } });

  console.log(
    `Removed ${removable.length} end-to-end test account(s); kept ${keep.size} that still own ticket history.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
