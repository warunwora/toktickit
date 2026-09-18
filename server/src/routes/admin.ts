import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { getPrisma } from "../prisma.js";
import { currentUser, requireRole } from "../lib/auth.js";
import { deleteSessionsForUser } from "../lib/session.js";
import { validatePasswordValue } from "../lib/password.js";
import { isRole, validateCreateUser, validateUpdateUser } from "../lib/user-validation.js";

// Administrator user management — docs/lab-03/api-spec.md §7.
//
// Two rules make this screen safe to use on the account you are signed in with:
// an Administrator cannot deactivate themselves (BR-52), and the last active
// Administrator can neither be deactivated nor demoted (BR-53). Both are
// checked here, in the backend, because a disabled button is feedback, not
// authorization.

export const adminRouter = Router();

const adminOnly = requireRole("ADMINISTRATOR");

const BCRYPT_COST = 10;

/** No hash and no password field ever leaves this router (api-spec.md §7.1). */
const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
} as const;

const SEARCH_MAX = 120;

function first(raw: unknown): string | undefined {
  if (Array.isArray(raw)) return raw.find((v): v is string => typeof v === "string");
  return typeof raw === "string" ? raw : undefined;
}

function userId(req: Request): number | null {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * True when `userId` is the only Administrator still active. Used before a
 * deactivation and before a role change, because both remove the same person
 * from the set of people who can administer the system (BR-53).
 */
async function isLastActiveAdministrator(userId: number): Promise<boolean> {
  const others = await getPrisma().user.count({
    where: { role: "ADMINISTRATOR", isActive: true, id: { not: userId } },
  });
  return others === 0;
}

adminRouter.get("/api/admin/users", adminOnly, async (req: Request, res: Response) => {
  const search = first(req.query.search)?.trim() ?? "";
  const role = first(req.query.role);

  if (search.length > SEARCH_MAX) {
    res.status(400).json({
      error: "Invalid query parameters",
      fields: [{ field: "search", message: `search must be ${SEARCH_MAX} characters or fewer` }],
    });
    return;
  }

  if (role !== undefined && role !== "" && !isRole(role)) {
    res.status(400).json({
      error: "Invalid query parameters",
      fields: [{ field: "role", message: "role must be one of REQUESTER, IT_STAFF, ADMINISTRATOR" }],
    });
    return;
  }

  try {
    const users = await getPrisma().user.findMany({
      where: {
        ...(role !== undefined && role !== "" ? { role } : {}),
        ...(search !== ""
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { email: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      // BR-57 — one screenful sorted by name; the list is not paginated.
      orderBy: { name: "asc" },
      select: userSelect,
    });

    res.status(200).json({ users });
  } catch {
    res.status(500).json({ error: "Unable to load the users" });
  }
});

adminRouter.post("/api/admin/users", adminOnly, async (req: Request, res: Response) => {
  const { errors, value } = validateCreateUser(req.body);
  if (!value) {
    res.status(400).json({ error: "Validation failed", fields: errors });
    return;
  }

  try {
    const prisma = getPrisma();

    const existing = await prisma.user.findUnique({ where: { email: value.email }, select: { id: true } });
    if (existing) {
      res.status(409).json({ error: "That email address is already in use", code: "EMAIL_IN_USE" });
      return;
    }

    const user = await prisma.user.create({
      data: {
        name: value.name,
        email: value.email,
        role: value.role,
        isActive: value.isActive,
        passwordHash: await bcrypt.hash(value.initialPassword, BCRYPT_COST),
        // BR-51 — every Administrator-issued password is an initial one.
        mustChangePassword: true,
      },
      select: userSelect,
    });

    res.status(201).json(user);
  } catch {
    res.status(500).json({ error: "Unable to create the user" });
  }
});

adminRouter.patch("/api/admin/users/:id", adminOnly, async (req: Request, res: Response) => {
  const id = userId(req);
  if (id === null) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const { errors, value } = validateUpdateUser(req.body);
  if (errors.length > 0) {
    res.status(400).json({ error: "Validation failed", fields: errors });
    return;
  }
  if (!value) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  try {
    const prisma = getPrisma();
    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, isActive: true },
    });

    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const deactivating = value.isActive === false && target.isActive;
    const demoting = value.role !== undefined && value.role !== "ADMINISTRATOR" && target.role === "ADMINISTRATOR";

    // BR-53 is checked before BR-52. When the two overlap — the sole
    // Administrator deactivating themselves — "at least one active
    // Administrator must remain" is the reason that actually matters, and
    // answering "you cannot deactivate your own account" would suggest the
    // operation is fine from another account, which it is not.
    if (
      (deactivating || demoting) &&
      target.role === "ADMINISTRATOR" &&
      target.isActive &&
      (await isLastActiveAdministrator(id))
    ) {
      res.status(400).json({
        error: "At least one active Administrator must remain",
        code: "LAST_ADMINISTRATOR",
      });
      return;
    }

    // BR-52 — with another Administrator still active, deactivating your own
    // account is merely the mistake of locking yourself out.
    if (deactivating && id === currentUser(req).id) {
      res.status(400).json({ error: "You cannot deactivate your own account", code: "SELF_DEACTIVATION" });
      return;
    }

    if (value.email !== undefined) {
      const clash = await prisma.user.findFirst({
        where: { email: value.email, id: { not: id } },
        select: { id: true },
      });
      if (clash) {
        res.status(409).json({ error: "That email address is already in use", code: "EMAIL_IN_USE" });
        return;
      }
    }

    const user = await prisma.user.update({ where: { id }, data: value, select: userSelect });

    // BR-10 — a deactivated account must stop working immediately, not at the
    // end of its session.
    if (value.isActive === false) await deleteSessionsForUser(id);

    res.status(200).json(user);
  } catch {
    res.status(500).json({ error: "Unable to update the user" });
  }
});

adminRouter.post("/api/admin/users/:id/password", adminOnly, async (req: Request, res: Response) => {
  const id = userId(req);
  if (id === null) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const initialPassword = (req.body ?? {}).initialPassword;
  const errors = validatePasswordValue(initialPassword, "initialPassword");
  if (errors.length > 0) {
    res.status(400).json({ error: "Validation failed", fields: errors });
    return;
  }

  try {
    const prisma = getPrisma();
    const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });

    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        passwordHash: await bcrypt.hash(initialPassword as string, BCRYPT_COST),
        mustChangePassword: true,
      },
      select: userSelect,
    });

    // Decision C-06 — otherwise the account whose password was just reset would
    // stay signed in elsewhere, which is the opposite of the intent.
    await deleteSessionsForUser(id);

    res.status(200).json(user);
  } catch {
    res.status(500).json({ error: "Unable to set a new initial password" });
  }
});
