// The resolution gate — docs/lab-04/specification.md BR-19, BR-20, D-02.
// A Ticket may become Resolved only when none of its Actions Taken is still
// open and none has an uncleared follow-up. No actions at all is not a block,
// so every legacy Ticket can still be resolved (BR-43).

export type BlockReason = "INCOMPLETE" | "FOLLOW_UP_OPEN";

export interface GateAction {
  id: number;
  description: string;
  status: string;
  followUpRequired: boolean;
  followUpClearedAt: Date | null;
}

export interface BlockingAction {
  id: number;
  description: string;
  status: string;
  reason: BlockReason;
}

const OPEN_STATUSES = ["PLANNED", "IN_PROGRESS"];

export function blockReason(action: GateAction): BlockReason | null {
  if (OPEN_STATUSES.includes(action.status)) return "INCOMPLETE";
  if (action.status === "COMPLETED" && action.followUpRequired && action.followUpClearedAt === null) {
    return "FOLLOW_UP_OPEN";
  }
  return null;
}

/** Every action that stops the Ticket from being resolved, in the order given. */
export function resolutionBlockers(actions: GateAction[]): BlockingAction[] {
  const blockers: BlockingAction[] = [];
  for (const action of actions) {
    const reason = blockReason(action);
    if (reason) blockers.push({ id: action.id, description: action.description, status: action.status, reason });
  }
  return blockers;
}
