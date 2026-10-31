import { describe, it, expect } from "vitest";
import {
  RECENT_RESOLVED_DAYS,
  RECENT_UPDATED_DAYS,
  actionLink,
  inWindow,
  requesterLinks,
  staffLinks,
  userLink,
} from "../../src/lib/dashboard.js";

// U-09, U-10 — docs/lab-04/tests.md §2.1.

const NOW = new Date("2026-10-30T03:45:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("rolling windows (BR-32)", () => {
  // U-09 / AC-24
  it("keeps 7 days minus 1 second, drops 7 days plus 1 ms; drops 30 days plus 1 ms", () => {
    expect(inWindow(ago(7 * DAY - 1000), NOW, RECENT_UPDATED_DAYS)).toBe(true);
    // Exactly at the boundary is inside, because the SQL is ">= now - interval".
    expect(inWindow(ago(7 * DAY), NOW, RECENT_UPDATED_DAYS)).toBe(true);
    expect(inWindow(ago(7 * DAY + 1), NOW, RECENT_UPDATED_DAYS)).toBe(false);
    expect(inWindow(ago(30 * DAY - 1000), NOW, RECENT_RESOLVED_DAYS)).toBe(true);
    expect(inWindow(ago(30 * DAY + 1), NOW, RECENT_RESOLVED_DAYS)).toBe(false);
    expect(inWindow(null, NOW, RECENT_RESOLVED_DAYS)).toBe(false);
  });

  it("does not depend on the time zone the date was written in", () => {
    const bangkokMidnight = new Date("2026-10-23T00:00:00+07:00");
    expect(inWindow(bangkokMidnight, NOW, RECENT_UPDATED_DAYS)).toBe(
      NOW.getTime() - bangkokMidnight.getTime() <= 7 * DAY
    );
  });
});

describe("drill-down links (BR-36)", () => {
  // U-10 / AC-28 — transcribed from api-spec.md §5.1 and §5.2.
  it("matches the documented Requester links", () => {
    expect(requesterLinks).toEqual({
      open: "/tickets?statusGroup=active",
      waitingForMe: "/tickets?status=WAITING_FOR_REQUESTER",
      resolved: "/tickets?status=RESOLVED",
      closed: "/tickets?status=CLOSED",
      recentlyUpdated: "/tickets?sort=updatedAt&order=desc",
    });
  });

  it("matches the documented IT Staff and Administrator links", () => {
    const links = staffLinks(26);
    expect(links.unassigned).toBe("/staff/queue?ownerId=unassigned&statusGroup=active");
    expect(links.ownedByMe).toBe("/staff/queue?ownerId=26&statusGroup=active");
    expect(links.urgentActive).toBe("/staff/queue?itPriority=URGENT&statusGroup=active");
    expect(links.recentlyUpdated).toBe("/staff/queue?sort=updatedAt&order=desc");
    expect(links.byStatus.WAITING_FOR_REQUESTER).toBe("/staff/queue?status=WAITING_FOR_REQUESTER");
    expect(Object.keys(links.byStatus)).toHaveLength(8);
    expect(links.byItPriority).toEqual({
      LOW: "/staff/queue?itPriority=LOW&statusGroup=active",
      MEDIUM: "/staff/queue?itPriority=MEDIUM&statusGroup=active",
      HIGH: "/staff/queue?itPriority=HIGH&statusGroup=active",
      URGENT: "/staff/queue?itPriority=URGENT&statusGroup=active",
    });
    expect(userLink("IT_STAFF")).toBe("/admin/users?role=IT_STAFF");
    expect(actionLink(281)).toBe("/staff/tickets/281?tab=actions");
  });
});
