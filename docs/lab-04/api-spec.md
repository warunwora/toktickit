# Lab 4 API Contract — Actions Taken, Workflow and Dashboards

Extends [docs/lab-03/api-spec.md](../lab-03/api-spec.md). Authentication (session cookie), the
resolution order of every protected endpoint, the error shape and the safe-error rules are unchanged.
Business rules referenced as BR-nn are in [specification.md](specification.md) §5.

---

## 1. Conventions added in Lab 4

### 1.1 Status codes

| Code | New use in Lab 4 |
|---|---|
| 409 `STALE_UPDATE` | The `version` sent does not match the stored version (BR-24). The body includes the current record. |
| 409 `RESOLUTION_BLOCKED` | Resolved was requested while Actions Taken are incomplete (BR-19, BR-20). |
| 400 `TICKET_LOCKED` | An Action Taken was created or changed on a Closed or Cancelled Ticket (BR-16). |
| 400 `INVALID_ACTION_TRANSITION` | An action status change outside specification.md §5.2. |
| 400 `ACTION_FINAL` | A Completed or Cancelled action's content or status was changed (BR-11). |
| 409 `DUPLICATE_SUBMISSION` | The same Action Taken was submitted again within 60 seconds (BR-39). |

All other codes keep their Lab 3 meaning: 400 validation, 401 no session, 403 role, 404 missing or not
yours, 409 duplicate email or duplicate ticket, 410 removed attachment, 500 safe server error.

### 1.2 Stale-update protocol

Every response that returns a Ticket or an Action Taken includes its `version`. Every write to that
record must send it back:

```json
{ "version": 7, "status": "IN_PROGRESS" }
```

The server performs the write as one statement, `UPDATE … WHERE id = :id AND version = :version`, and
increments `version`. Zero rows updated means the copy was stale:

```json
{ "error": "This ticket was changed by someone else. Reload to see the latest version.",
  "code": "STALE_UPDATE",
  "current": { "...": "the current ticket or action, including its new version" } }
```

A missing or non-integer `version` is a 400 on the `version` field.

### 1.3 Action Taken object

```json
{
  "id": 31,
  "ticketId": 3253,
  "actionAt": "2026-10-30T03:15:00.000Z",
  "description": "Replaced the print head on the counter 2 label printer.",
  "result": "Test label printed correctly.",
  "status": "COMPLETED",
  "performedBy": { "id": 26, "name": "Warin Chaiyaporn", "role": "IT_STAFF" },
  "assignee":    { "id": 27, "name": "Pimchanok Rattana", "role": "IT_STAFF" },
  "followUpRequired": true,
  "followUpNote": "Order a spare print head for the second counter.",
  "followUpClearedAt": null,
  "followUpClearedBy": null,
  "attachmentNotes": "See evidence.png attached by the Requester.",
  "cancelReason": null,
  "completedAt": "2026-10-30T03:40:00.000Z",
  "cancelledAt": null,
  "version": 3,
  "createdAt": "2026-10-30T03:16:02.000Z",
  "updatedAt": "2026-10-30T03:40:11.000Z"
}
```

## 2. Authorization matrix — Lab 4 rows

| Endpoint | R | S | A |
|---|---|---|---|
| `GET /api/tickets/:id/actions` | own (404 otherwise) | ✔ | ✔ |
| `POST /api/tickets/:id/actions` | ✖ 403 | ✔ | ✔ |
| `PATCH /api/actions/:id`, `PATCH /api/actions/:id/follow-up` | ✖ 403 | ✔ | ✔ |
| `PATCH /api/staff/tickets/:id`, `PATCH /api/staff/tickets/:id/owner` | ✖ 403 | ✔ | **✔ (was ✖ in Lab 3)** |
| `GET /api/dashboard/requester` | ✔ | ✖ 403 | ✖ 403 |
| `GET /api/dashboard/staff` | ✖ 403 | ✔ | ✔ |

Every other row of the Lab 3 matrix is unchanged.

## 3. Actions Taken

### 3.1 `GET /api/tickets/:id/actions`

**200** `{ "actions": [ActionTaken, …] }` ordered by `actionAt` ascending, then `id` ascending
(BR-15). A Requester asking about a Ticket that is not theirs receives **404** `{"error":"Ticket not found"}`.
An unknown Ticket is 404 for every role.

### 3.2 `POST /api/tickets/:id/actions`

IT Staff and Administrator.

```json
{
  "actionAt": "2026-10-30T03:15:00.000Z",
  "description": "Replaced the print head.",
  "result": "Test label printed correctly.",
  "status": "COMPLETED",
  "assigneeId": 27,
  "followUpRequired": true,
  "followUpNote": "Order a spare print head.",
  "attachmentNotes": "See evidence.png."
}
```

| Field | Rule |
|---|---|
| `actionAt` | required ISO 8601; ≤ now + 5 minutes; ≥ the Ticket's `createdAt` (BR-05) |
| `description` | required, 1–2000 after trimming (BR-06) |
| `result` | optional, ≤ 2000; required when `status` is `COMPLETED` (BR-07) |
| `status` | optional, `PLANNED` (default), `IN_PROGRESS` or `COMPLETED`; `CANCELLED` is not allowed on creation |
| `assigneeId` | optional, defaults to the performer; must be an active IT Staff or Administrator (BR-04) |
| `followUpRequired` | optional boolean, default `false` |
| `followUpNote` | required, 1–1000, when `followUpRequired` is true; ignored and stored as null otherwise (BR-08) |
| `attachmentNotes` | optional, ≤ 500 (BR-09) |
| `performedById` and any other field | ignored; performer is the session user (BR-03) |

**201** returns the created Action Taken. The parent Ticket's `version` and `updatedAt` increase
(BR-25).

| Failure | Code | Body |
|---|---|---|
| Validation | 400 | `fields` |
| Ticket is Closed or Cancelled | 400 | `code: "TICKET_LOCKED"` |
| Identical action within 60 seconds (BR-39) | 409 | `code: "DUPLICATE_SUBMISSION"`, `actionId` of the original |
| Requester | 403 | — |
| Unknown Ticket | 404 | — |

### 3.3 `PATCH /api/actions/:id`

IT Staff and Administrator. Body: `version` (required) plus any subset of `actionAt`, `description`,
`result`, `assigneeId`, `followUpRequired`, `followUpNote`, `attachmentNotes`, `status`, `cancelReason`.

- Field rules are those of §3.2. `cancelReason` (3–500) is required when `status` is `CANCELLED` (BR-13).
- `status` must follow specification.md §5.2; otherwise **400** `INVALID_ACTION_TRANSITION`.
- `COMPLETED` sets `completedAt`; `CANCELLED` sets `cancelledAt`.
- A Completed or Cancelled action cannot be changed: **400** `ACTION_FINAL` (BR-11).
- Stale `version`: **409** `STALE_UPDATE` with `current`.
- Closed or Cancelled parent Ticket: **400** `TICKET_LOCKED`.

**200** returns the updated Action Taken; the parent Ticket's `version` increases when the status
changes (BR-25).

### 3.4 `PATCH /api/actions/:id/follow-up`

IT Staff and Administrator. Body `{ "version": 4 }`. Allowed only on a Completed action whose
`followUpRequired` is true and not yet cleared; sets `followUpClearedAt` and `followUpClearedBy` and
increases the parent Ticket's `version` (BR-12). Any other state is **400** with a message; stale
version is **409** `STALE_UPDATE`.

## 4. Ticket workflow changes

### 4.1 `PATCH /api/staff/tickets/:id` and `PATCH /api/staff/tickets/:id/owner`

Unchanged from Lab 3 §6.3–6.4 except:

1. **Administrators are permitted** (BR-26).
2. **`version` is required** in the body (BR-24); a stale version answers 409 `STALE_UPDATE` with the
   current Ticket.
3. **Resolution gate** on `status: "RESOLVED"` (BR-19):

```json
{ "error": "This ticket still has incomplete Actions Taken.",
  "code": "RESOLUTION_BLOCKED",
  "blockingActions": [
    { "id": 31, "description": "Replace the print head", "status": "IN_PROGRESS", "reason": "INCOMPLETE" },
    { "id": 29, "description": "Check the driver",       "status": "COMPLETED",   "reason": "FOLLOW_UP_OPEN" }
  ] }
```

4. The owner may be an active IT Staff **or Administrator** (BR-27).

The order of checks is: authentication → role → Ticket exists (404) → validation (400) → version
(409 `STALE_UPDATE`) → transition matrix (400 `INVALID_TRANSITION`) → resolution gate (409
`RESOLUTION_BLOCKED`). The version is checked first among the state checks, so a user never sees a
gate decision made against data they have not seen.

### 4.2 `GET /api/staff/assignable-users`

Now returns active IT Staff **and** Administrators, each with `role`, sorted by name. Used for both the
Ticket Owner select and the Action Taken assignee select.

### 4.3 Version in responses

`GET /api/staff/tickets/:id`, `GET /api/tickets/:id` and every Ticket write response include
`version`. The queue and My Tickets lists do not need it.

## 5. Dashboards

All metrics are computed on every request (BR-30). "Active" = `NEW`, `OPEN`, `IN_PROGRESS`,
`WAITING_FOR_REQUESTER`, `REOPENED` (BR-31). `now` is the request time; windows are rolling (BR-32).

### 5.1 `GET /api/dashboard/requester`

Requester only. `:me` is the session user.

| Field | Calculation (SQL) | Drill-down |
|---|---|---|
| `metrics.open` | `COUNT(*) FROM "Ticket" WHERE "requesterId" = :me AND status IN (active)` | `/tickets?statusGroup=active` |
| `metrics.waitingForMe` | `… WHERE "requesterId" = :me AND status = 'WAITING_FOR_REQUESTER'` | `/tickets?status=WAITING_FOR_REQUESTER` |
| `metrics.resolved` | `… WHERE "requesterId" = :me AND status = 'RESOLVED'` | `/tickets?status=RESOLVED` |
| `metrics.closed` | `… WHERE "requesterId" = :me AND status = 'CLOSED'` | `/tickets?status=CLOSED` |
| `recentlyUpdated` | top 5 `WHERE "requesterId" = :me AND "updatedAt" >= now() - interval '7 days' ORDER BY "updatedAt" DESC` | `/tickets/:id` each; "View all" → `/tickets?sort=updatedAt&order=desc` |
| `recentlyResolved` | top 5 `WHERE "requesterId" = :me AND "resolvedAt" >= now() - interval '30 days' ORDER BY "resolvedAt" DESC` | `/tickets/:id` each |

```json
{
  "metrics": { "open": 3, "waitingForMe": 1, "resolved": 2, "closed": 1 },
  "recentlyUpdated": [ { "id": 281, "ticketNumber": "TKT-2026-000281", "summary": "…",
                         "status": "IN_PROGRESS", "updatedAt": "…" } ],
  "recentlyResolved": [],
  "links": { "open": "/tickets?statusGroup=active", "…": "…" },
  "generatedAt": "2026-10-30T03:45:00.000Z"
}
```

### 5.2 `GET /api/dashboard/staff`

IT Staff and Administrator. `:me` is the session user.

| Field | Calculation (SQL) | Drill-down |
|---|---|---|
| `metrics.unassigned` | `COUNT(*) FROM "Ticket" WHERE "ownerId" IS NULL AND status IN (active)` | `/staff/queue?ownerId=unassigned&statusGroup=active` |
| `metrics.ownedByMe` | `… WHERE "ownerId" = :me AND status IN (active)` | `/staff/queue?ownerId=:me&statusGroup=active` |
| `metrics.myOpenActions` | `COUNT(*) FROM "ActionTaken" WHERE "assigneeId" = :me AND status IN ('PLANNED','IN_PROGRESS')` | list below |
| `metrics.urgentActive` | `… "Ticket" WHERE "itPriority" = 'URGENT' AND status IN (active)` | `/staff/queue?itPriority=URGENT&statusGroup=active` |
| `byStatus` | `SELECT status, COUNT(*) FROM "Ticket" GROUP BY status`, all eight statuses present (0 when none) | `/staff/queue?status=:status` |
| `byItPriority` | `SELECT "itPriority", COUNT(*) … WHERE status IN (active) GROUP BY "itPriority"`, all four present | `/staff/queue?itPriority=:p&statusGroup=active` |
| `myOpenActionsList` | top 5 of `metrics.myOpenActions` `ORDER BY "actionAt" ASC` with ticket number | `/staff/tickets/:ticketId?tab=actions` |
| `recentlyUpdated` | top 5 `"Ticket" WHERE "updatedAt" >= now() - interval '7 days' ORDER BY "updatedAt" DESC` | `/staff/tickets/:id`; "View all" → `/staff/queue?sort=updatedAt&order=desc` |
| `users` (Administrator only) | `SELECT role, "isActive", COUNT(*) FROM "User" GROUP BY role, "isActive"` | `/admin/users?role=:role` |

IT Staff never receive `users`; the field is absent, not empty.

### 5.2a Drill-down links in the response

Both responses carry a `links` object holding the drill-down URLs of the tables above, built by the
server (`server/src/lib/dashboard.ts`), so the screens never assemble a URL themselves (BR-36). Each
`myOpenActionsList` item carries its own `link`, and each `users` role carries its `link`. The links
are part of the summary, not data; DR-07 and U-10 pin them.

### 5.3 Empty behaviour

Counts are 0 and lists are `[]`; no endpoint answers 404 or 204 for "no data" (BR-35).

### 5.4 Drill-down filter `statusGroup`

`GET /api/tickets` and `GET /api/staff/tickets` accept `statusGroup=active`, equivalent to
`status IN (NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED)`. Combined with `status` it is a
400. Any other value is a 400 on `statusGroup`. This is the only Lab 2/3 API change besides §4.

### 5.5 Failures

401 no session, 403 wrong role, 500 safe message `"Unable to load the dashboard"`.

## 6. Contract decisions

| ID | Decision | Reason |
|---|---|---|
| C-01 | `PATCH /api/actions/:id` rather than `/api/tickets/:ticketId/actions/:id`. | An action id is globally unique and the server looks up its Ticket for authorization; the shorter path cannot be mismatched with the wrong Ticket id. |
| C-02 | Clearing a follow-up is its own endpoint. | It is the only change allowed on a final action, so a separate path keeps the "final actions are immutable" rule simple and testable. |
| C-03 | 409 bodies carry the current record. | The client can show the newer data and keep the user's input without a second request. |
| C-04 | Dashboard SQL is documented next to every metric. | Handout §14 Part 5 asks for evidence that the metrics match database queries; the documented query is what that evidence is compared with. |
