# Lab 4 Sprint Engineering Specification — TokTickIT Actions Taken, Dashboards and Final Regression

**Course:** CPE 334 — Introduction to Software Engineering in the Age of AI Agents
**Student:** Warun Woraphoo — 67070563438 — Section 31
**Sprint:** 4
**Status:** approved before implementation (see the merge date of the Issue 1 Pull Request)

This document extends the Lab 2 and Lab 3 contracts ([docs/lab-02](../lab-02/specification.md),
[docs/lab-03](../lab-03/specification.md)). Every earlier rule stays in force unless a rule below
replaces it, and every replacement names the rule it replaces.

---

## 1. Sprint Goal

Complete the core service-desk workflow. IT Staff and Administrators record the real work on a Ticket
as Actions Taken, each with its own assignee, result and follow-up; the backend refuses to resolve a
Ticket while that work is incomplete and refuses any update made from a stale copy. Requesters and IT
Staff get concise dashboards whose every number is calculated by the backend and opens the detailed
list behind it. The whole application from Labs 1 to 3 keeps working, consistently, under the Zen Green
design language.

## 2. Stakeholder Request Interpretation

The service desk can already receive Tickets and talk to Requesters. What it cannot do is show the work
itself: who did what, when, with what result, and what still has to happen. Actions Taken are that
record. The Ticket Owner still coordinates the Ticket as a whole, but the person doing a piece of work
may be someone else, so every action names both who recorded it and who it is assigned to.

"Resolved" has to mean something. A Requester saying the problem looks fixed is a useful signal and
nothing more; IT Staff resolve a Ticket, and only once no recorded work is still open. Because two
staff members may have the same Ticket open, the system must notice when one of them is about to
overwrite a change the other has just made.

Dashboards are a starting point, not a replacement: a handful of counts and short lists, each one a
link to the filtered screen that already exists. Finally, the product is hardened: every earlier
feature keeps working, repeated clicks cannot create duplicates, a recoverable failure never throws
away what someone typed, and nothing unfinished or obsolete is left on screen.

## 3. Scope

### 3.1 Included

1. The Action Taken model and its API: create, list and update, with an assignee, an action status, a
   result, a follow-up flag and note, and attachment notes.
2. The Actions Taken area on the IT Staff Ticket Detail (list, create, view and edit) and a read-only
   list on the Requester Ticket Detail.
3. The final Ticket status-transition matrix, the resolution gate, and stale-update detection on every
   Ticket and Action write.
4. Requester, IT Staff and Administrator dashboards with drill-down links.
5. Administrator permitted to perform IT Staff behaviour (handout §4.3), replacing Lab 3 decision D-10.
6. Database migration with a documented and tested recovery procedure; an idempotent seed with Tickets
   that have zero, one and several Actions Taken.
7. Final regression and hardening of Labs 1 to 3: duplicate prevention, data-preserving failures,
   removal of obsolete UI, accessibility, responsive behaviour and README accuracy.

### 3.2 Explicitly excluded

1. SLA clocks, escalation engines, on-call scheduling and breach notifications.
2. Email, SMS, LINE, push or any external notification service.
3. Inventory, spare parts, purchasing and cost accounting.
4. Time-sheet billing, payroll and labour-cost calculation.
5. Multi-level approvals and electronic signatures.
6. Business-intelligence tools, custom report builders, exports and charts beyond simple counts.
7. Multi-tenancy and production cloud operations.
8. Deleting an Action Taken; uploading files to an Action Taken (Attachment Notes point to existing
   Ticket attachments instead).
9. Any feature not approved in this contract.

## 4. Functional Requirements

| ID | Requirement |
|---|---|
| FR-01 | IT Staff and Administrators can record an Action Taken on any Ticket that is not Closed or Cancelled. |
| FR-02 | An Action Taken records Action Date/Time, Action Description, Result, Performed by (set automatically to the authenticated user), Assigned to, Follow-Up Required, Follow-up Note and Attachment Notes. |
| FR-03 | IT Staff and Administrators can assign an Action Taken to any active IT Staff or Administrator user, including someone other than the Ticket Owner. |
| FR-04 | IT Staff and Administrators can edit an open Action Taken and move it through its status workflow: start, complete or cancel. |
| FR-05 | Every role that may see a Ticket can list its Actions Taken in a stable order; Requesters see them read-only on their own Tickets. |
| FR-06 | The backend refuses to resolve a Ticket while any Action Taken is incomplete or has an open follow-up. |
| FR-07 | Every update to a Ticket or an Action Taken carries the version the user saw; an update made from a stale version is refused with a conflict and the current data. |
| FR-08 | Status controls offer only the transitions permitted from the current status, and a successful change refreshes the Ticket summary. |
| FR-09 | A Requester dashboard summarises only that Requester's Tickets with counts and short lists that open the filtered My Tickets screen or the Ticket. |
| FR-10 | An IT Staff dashboard summarises unassigned Tickets, Tickets owned by the current user, the current user's open Actions Taken, Tickets by status and IT Priority, and recently updated Tickets, each opening the filtered queue or the Ticket. |
| FR-11 | The Administrator dashboard is the IT Staff dashboard plus concise user-account counts that open User Management. |
| FR-12 | Every dashboard metric is calculated by the backend from authoritative data and documented in api-spec.md §5. |
| FR-13 | The application shell offers a Dashboard destination to every role and opens it after sign-in. |
| FR-14 | All earlier Requester, IT Staff and Administrator functions from Labs 1 to 3 remain available to permitted users. |
| FR-15 | Important forms keep entered data after a recoverable failure, and repeated clicks or retries cannot create duplicate records. |
| FR-16 | The database migration preserves all earlier data and can be reversed with a documented, tested recovery procedure. |

## 5. Business Rules

### Actions Taken

| ID | Rule |
|---|---|
| BR-01 | An Action Taken belongs to exactly one Ticket and never moves to another. |
| BR-02 | The Ticket Owner coordinates the Ticket, but an Action Taken may be performed by, and assigned to, a different IT Staff member or Administrator. |
| BR-03 | Performed by is set by the backend to the authenticated user who records the action. A client-supplied value is ignored. |
| BR-04 | Assigned to is required and must be an active IT Staff or Administrator user; when the client omits it, it defaults to the performer. An inactive user, a Requester or an unknown id is rejected. |
| BR-05 | Action Date/Time is required. It may not be more than 5 minutes in the future (clock tolerance) and may not be earlier than the Ticket's creation time. |
| BR-06 | Action Description is required, 1 to 2000 characters after trimming. |
| BR-07 | Result is optional while an action is Planned or In Progress, and required (1 to 2000 characters) when it is Completed. |
| BR-08 | Follow-up Note is required (1 to 1000 characters) whenever Follow-Up Required is true, and is cleared when Follow-Up Required is false. |
| BR-09 | Attachment Notes are optional plain text, at most 500 characters, naming which Ticket attachment to look at; they are not file uploads. |
| BR-10 | Action statuses are Planned, In Progress, Completed and Cancelled. The permitted transitions are those in §5.2. |
| BR-11 | Completed and Cancelled are final. A final action's content can no longer be edited; the only change allowed is clearing an open follow-up (BR-12). |
| BR-12 | A Completed action with Follow-Up Required may have its follow-up cleared by IT Staff or an Administrator; the backend records who cleared it and when. |
| BR-13 | Cancelling an action requires a reason of 3 to 500 characters and a confirmation in the UI. |
| BR-14 | Actions Taken are never deleted. Cancelled actions remain visible with their reason. |
| BR-15 | Actions Taken are listed oldest first by Action Date/Time, then by id, so the order is stable even when two actions share a time. |
| BR-16 | No Action Taken may be created or changed on a Closed or Cancelled Ticket. |
| BR-17 | Requesters may view all Actions Taken on their own Tickets and may not create or change any. Internal Notes stay hidden from them as in Lab 3. |

### Ticket workflow and resolution

| ID | Rule |
|---|---|
| BR-18 | Ticket statuses remain New, Open, In Progress, Waiting for Requester, Resolved, Closed, Reopened and Cancelled; the final transition matrix is §5.1. |
| BR-19 | **Resolution gate:** a Ticket may move to Resolved only when none of its Actions Taken is Planned or In Progress and none has an uncleared follow-up. A Ticket with no Actions Taken is not blocked. The backend enforces this on every request, whatever the client. |
| BR-20 | A refused resolution answers 409 with the code `RESOLUTION_BLOCKED` and the list of blocking actions; the Ticket is unchanged. |
| BR-21 | The Lab 3 rule that Resolved requires a resolution summary (Lab 3 BR-37) still applies. |
| BR-22 | A Requester's "problem appears resolved" indication stays advisory: it never changes the Ticket status (Lab 3 BR-40). |
| BR-23 | Every Ticket and Action Taken carries a version number that increases by one on every successful write. |
| BR-24 | Every update to a Ticket (status, IT Priority, resolution summary, owner) or to an Action Taken must send the version the user last saw. A different version answers 409 with the code `STALE_UPDATE` and the current record, and changes nothing. |
| BR-25 | Adding, completing, cancelling or clearing the follow-up of an Action Taken increases the parent Ticket's version and `updatedAt`, so a Ticket screen open elsewhere detects the change. |

### Roles and authorization

| ID | Rule |
|---|---|
| BR-26 | **Administrators perform IT Staff behaviour** (handout §4.3): they may claim, own and reassign Tickets, set IT Priority, change status and create or update Actions Taken. This replaces Lab 3 decision D-10. |
| BR-27 | A Ticket Owner may be an active IT Staff or Administrator user (extends Lab 3 BR-26). |
| BR-28 | A Requester asking for the Actions Taken of a Ticket that is not theirs receives the same 404 as a missing Ticket (Lab 3 BR-22). |
| BR-29 | Every write is authorized by the backend; hiding a control is never the authorization. |

### Dashboards

| ID | Rule |
|---|---|
| BR-30 | Dashboard metrics are calculated by the backend from the database on every request; the client never counts records itself. |
| BR-31 | Active statuses are New, Open, In Progress, Waiting for Requester and Reopened. Resolved, Closed and Cancelled are not active. |
| BR-32 | "Recently updated" means `updatedAt` within the last 7 days, measured as a rolling 7 × 24 hours from the request time. "Recently resolved" means `resolvedAt` within the last 30 days. |
| BR-33 | Dates are stored in UTC and displayed in Asia/Bangkok time (UTC+7). Rolling windows do not depend on the time zone. |
| BR-34 | Short lists on a dashboard hold at most 5 items, newest first. |
| BR-35 | A metric that matches nothing returns 0 or an empty list, never an error; the screen shows an explicit empty message. |
| BR-36 | Every count opens the screen that lists exactly the Tickets it counted, through documented query parameters. |
| BR-37 | A Requester dashboard counts only the authenticated Requester's own Tickets. |
| BR-38 | Dashboard responses are concise summaries and never contain whole Ticket collections. |

### Hardening and regression

| ID | Rule |
|---|---|
| BR-39 | A submit control is disabled while its request is in flight, and the Lab 2 duplicate-submission rule for Tickets still applies. An identical Action Taken (same Ticket, performer, description and Action Date/Time) submitted again within 60 seconds is refused with 409 `DUPLICATE_SUBMISSION` and the id of the original, so a network retry cannot create a second record. |
| BR-40 | After a recoverable failure (network error, 409, 500) a form keeps every value the user entered. |
| BR-41 | Temporary, duplicate, obsolete or unfinished UI from earlier labs is removed; the browser console shows no errors on any screen. |
| BR-42 | Every Lab 1, 2 and 3 acceptance criterion still in scope keeps passing; the earlier suites stay in the repository and run in every build. |
| BR-43 | Legacy Tickets created before this migration have no Actions Taken; they are valid, they count in dashboards like any other Ticket, and they can be resolved because nothing is incomplete. |

### 5.1 Ticket status transition matrix (final)

Unchanged from Lab 3 §5.1. Every transition is performed by IT Staff or an Administrator (BR-26).

| From \ To | Open | In Progress | Waiting for Requester | Resolved | Closed | Reopened | Cancelled |
|---|---|---|---|---|---|---|---|
| **New** | ✔ | ✔ | — | — | — | — | ✔ |
| **Open** | — | ✔ | ✔ | ✔ gate | — | — | ✔ |
| **In Progress** | — | — | ✔ | ✔ gate | — | — | ✔ |
| **Waiting for Requester** | — | ✔ | — | ✔ gate | — | — | ✔ |
| **Resolved** | — | — | — | — | ✔ | ✔ | — |
| **Reopened** | — | ✔ | ✔ | ✔ gate | — | — | ✔ |
| **Closed** | — | — | — | — | — | — | — |
| **Cancelled** | — | — | — | — | — | — | — |

"gate" = subject to the resolution gate (BR-19). Resolved requires a resolution summary (BR-21).
Closed and Cancelled require a confirmation in the UI and are final.

### 5.2 Action Taken status transition matrix

| From \ To | In Progress | Completed | Cancelled |
|---|---|---|---|
| **Planned** | ✔ | ✔ needs Result | ✔ needs reason |
| **In Progress** | — | ✔ needs Result | ✔ needs reason |
| **Completed** | — | — | — |
| **Cancelled** | — | — | — |

A new action may be created as Planned, In Progress or Completed (a quick fix is often recorded after
it is done); Completed on creation also needs a Result.

### 5.3 Authorization matrix (changes from Lab 3 in bold)

| Operation | Requester | IT Staff | Administrator |
|---|---|---|---|
| List Actions Taken of a Ticket | own Ticket | ✔ | ✔ |
| Create an Action Taken | ✖ 403 | ✔ | **✔** |
| Update an Action Taken (fields, status, clear follow-up) | ✖ 403 | ✔ | **✔** |
| Claim, assign or release a Ticket | ✖ 403 | ✔ | **✔** |
| Change Ticket status, IT Priority, resolution summary | ✖ 403 | ✔ | **✔** |
| Requester dashboard | ✔ | ✖ 403 | ✖ 403 |
| IT Staff dashboard | ✖ 403 | ✔ | ✔ (+ user counts) |
| User Management | ✖ 403 | ✖ 403 | ✔ |

All Lab 3 rows not listed are unchanged.

## 6. UI Specification Summary

Full detail: [ui-spec.md](ui-spec.md).

- **Dashboard** for every role, the landing screen after sign-in, first in the navigation. Metric
  cards with a label, a value and a "View" link; short lists of recent Tickets; explicit empty,
  loading, forbidden and failure states; cards become a single column on mobile.
- **Actions Taken** area on the IT Staff Ticket Detail, as a fourth tab beside Public Comments,
  Internal Notes and Attachments: stable list with status badges, a create form, a view mode and an
  edit mode for open actions, Start / Complete / Cancel actions with confirmation for Cancel.
- **Actions Taken** read-only list on the Requester Ticket Detail.
- **Workflow feedback:** the status select offers only permitted transitions; a blocked resolution
  lists the blocking actions; a stale update shows "This ticket was changed by someone else" with a
  Reload action and keeps the user's input.

## 7. Data Changes

### 7.1 Models

| Model | Change | Fields |
|---|---|---|
| `ActionTaken` | new | `id`, `ticketId`, `actionAt`, `description`, `result?`, `status` (`ActionStatus`), `performedById`, `assigneeId`, `followUpRequired`, `followUpNote?`, `followUpClearedAt?`, `followUpClearedById?`, `attachmentNotes?`, `cancelReason?`, `completedAt?`, `cancelledAt?`, `version`, `createdAt`, `updatedAt` |
| `Ticket` | extended | adds `version Int @default(1)` |
| others | unchanged | `User`, `Session`, `Category`, `RelatedSystem`, `Attachment`, `PublicComment`, `InternalNote` |

New enum `ActionStatus`: `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.

### 7.2 Relationships

- One `Ticket` has many `ActionTaken` (BR-01); the foreign key is `Restrict`, because Tickets are never
  deleted and an action must never disappear with a parent.
- Each `ActionTaken` has one performer, one assignee and at most one follow-up clearer, all `User`.

### 7.3 Indexes

| Index | Query it serves |
|---|---|
| `ActionTaken(ticketId, actionAt, id)` | The Actions Taken list of one Ticket in its stable order (BR-15), and the resolution gate's look-up of that Ticket's incomplete actions. |
| `ActionTaken(assigneeId, status)` | The IT Staff dashboard's "My open actions": actions assigned to me that are Planned or In Progress. |
| `Ticket(updatedAt)` | "Recently updated" lists on both dashboards (BR-32). |
| `Ticket(requesterId, status)` (Lab 2) | Requester dashboard counts by status. |
| `Ticket(ownerId, status)` (Lab 3) | IT Staff dashboard "owned by me" and "unassigned". |

### 7.4 Database design decisions (handout §5.1 asks for at least two)

| ID | Decision | Reason |
|---|---|---|
| DB-1 | Actions Taken are a child table, not a JSON array on Ticket. | Each action has its own lifecycle, assignee and version, needs foreign keys to `User`, and is queried across Tickets by the dashboard ("my open actions"). A JSON column could do none of that with integrity. |
| DB-2 | Optimistic concurrency with an integer `version` on `Ticket` and `ActionTaken`, checked inside the update's `WHERE`. | `UPDATE … WHERE id = ? AND version = ?` changes zero rows when the copy is stale, so the check and the write are one atomic statement; no lock is held while a person is editing. `updatedAt` was rejected because two writes in the same millisecond would compare equal. |
| DB-3 | Action status is an enum, not a reference table. | The four values are fixed by the contract and each drives code paths; an enum makes an invalid status impossible in the database. |
| DB-4 | Dashboard metrics are computed with live `COUNT` queries, not stored counters. | Counts are always consistent with the data and there is no second place to update; at service-desk volume the indexed counts stay well inside the performance-smoke budget (tests.md §2.9). |

### 7.5 Migration, backfill and recovery

1. The migration only **adds**: a new enum, a new table and a `version` column on `Ticket` with
   default 1. No existing column is renamed, dropped or rewritten, so every User, Ticket, Attachment,
   Public Comment and Internal Note from Labs 2 and 3 stays valid.
2. **Backfill:** every existing Ticket gets `version = 1` from the column default. No Actions Taken
   are invented for legacy Tickets (BR-43): they have none, they appear in dashboards like any other
   Ticket, and the resolution gate does not block them.
3. **Recovery:** before migrating, take a backup with `pg_dump`. To reverse the migration without a
   restore, `server/prisma/recovery/lab4_down.sql` drops the `ActionTaken` table, the `ActionStatus`
   enum and the `Ticket.version` column, and deletes the migration's row from `_prisma_migrations`.
   Because the migration only added objects, reversing it loses only Lab 4 data.
4. **Recovery test:** an automated test applies the migration and then `lab4_down.sql` to a
   throwaway PostgreSQL schema populated with Lab 3 data, and asserts every Lab 3 row is intact
   (tests.md REG-05). The full backup-and-restore drill is run once and recorded in Issue 6.

### 7.6 Seed data

| Kind | Count |
|---|---|
| Users | unchanged from Lab 3: 4 + 1 Requesters, 3 + 1 IT Staff, 1 Administrator |
| Tickets | the Lab 3 seed plus enough to cover every status, every IT Priority, assigned and unassigned |
| Actions Taken | Tickets with zero actions, with exactly one, and with several (mixing Planned, In Progress, Completed with and without follow-up, and Cancelled), including actions assigned to someone other than the Ticket Owner |
| Dashboard coverage | at least one Requester with zero Tickets Waiting for Requester and one IT Staff user with zero open actions, so zero metrics can be demonstrated next to non-zero ones |

Every insert is looked up by a seed key first, so the seed is idempotent.

## 8. API Contract

Full detail: [api-spec.md](api-spec.md).

| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/api/tickets/:id/actions` | Requester (own), IT Staff, Administrator | List Actions Taken |
| POST | `/api/tickets/:id/actions` | IT Staff, Administrator | Create an Action Taken |
| PATCH | `/api/actions/:id` | IT Staff, Administrator | Update fields or status; requires `version` |
| PATCH | `/api/actions/:id/follow-up` | IT Staff, Administrator | Clear the follow-up of a Completed action; requires `version` |
| PATCH | `/api/staff/tickets/:id` | IT Staff, **Administrator** | Status, IT Priority, resolution summary; now requires `version`; resolution gate |
| PATCH | `/api/staff/tickets/:id/owner` | IT Staff, **Administrator** | Claim, assign, release; now requires `version` |
| GET | `/api/staff/assignable-users` | IT Staff, Administrator | Now returns active IT Staff **and** Administrators |
| GET | `/api/dashboard/requester` | Requester | Requester dashboard |
| GET | `/api/dashboard/staff` | IT Staff, Administrator | IT Staff dashboard; Administrators also receive user counts |
| GET | `/api/tickets`, `/api/staff/tickets` | as Lab 2 / Lab 3 | gain a `statusGroup=active` filter for dashboard drill-down |

All other Lab 2 and Lab 3 endpoints are unchanged.

## 9. Acceptance Criteria

### Actions Taken

| ID | Criterion |
|---|---|
| AC-01 | Given a permitted IT Staff user and valid data, when an Action Taken is created, then it is saved under the correct Ticket with the authenticated user as Performed by and the approved assignee. |
| AC-02 | Given an Administrator, when an Action Taken is created or updated, then it succeeds exactly as for IT Staff. |
| AC-03 | Given a Requester, when an Action Taken is created or updated through the API, then the response is 403 and nothing is stored. |
| AC-04 | Given an assignee who is inactive, a Requester or unknown, when an action is created or reassigned, then it is rejected with a field message. |
| AC-05 | Given a client-supplied performer, when an action is created, then the backend ignores it and records the authenticated user. |
| AC-06 | Given missing or invalid fields (empty description, Action Date/Time in the future or before the Ticket, over-length text, Follow-Up Required without a note), when an action is saved, then it is rejected with field messages and nothing is stored. |
| AC-07 | Given an open action, when it is moved Planned → In Progress → Completed with a Result, then each change is stored and `completedAt` is set. |
| AC-08 | Given an action, when Completed is requested without a Result, or Cancelled without a reason, then it is rejected. |
| AC-09 | Given a Completed or Cancelled action, when its content or status is changed, then it is rejected; only an open follow-up can be cleared. |
| AC-10 | Given several actions, when they are listed, then they appear oldest first by Action Date/Time and then id, every time. |
| AC-11 | Given one Ticket, when different IT Staff members record actions on it, then the list shows each action with its own performer and assignee, independent of the Ticket Owner. |
| AC-12 | Given a Closed or Cancelled Ticket, when an action is created or changed, then it is rejected. |
| AC-13 | Given a Requester, when they open their own Ticket, then all its Actions Taken are visible read-only with no create or edit control; another Requester's Ticket answers 404. |

### Ticket workflow and concurrency

| ID | Criterion |
|---|---|
| AC-14 | Given a Ticket with a Planned or In Progress action, when Resolved is requested through the API, then the response is 409 `RESOLUTION_BLOCKED` listing that action, and the status is unchanged. |
| AC-15 | Given a Ticket whose only Completed action has an uncleared follow-up, when Resolved is requested, then it is blocked; after the follow-up is cleared, the same request succeeds. |
| AC-16 | Given a legacy Ticket with no Actions Taken, when Resolved is requested with a summary, then it succeeds. |
| AC-17 | Given two users holding version N of a Ticket, when the first saves and the second then saves from version N, then the second receives 409 `STALE_UPDATE` with the current Ticket and nothing of theirs is written. |
| AC-18 | Given two users holding version N of an Action Taken, when both save, then the second receives 409 `STALE_UPDATE`. |
| AC-19 | Given an action is added or completed, when a Ticket screen opened earlier saves a status change from the old version, then it receives 409 (BR-25). |
| AC-20 | Given a Ticket in any status, when the status control renders, then it offers exactly the transitions in §5.1, and a transition outside the matrix is rejected by the API. |
| AC-21 | Given a successful status change, when the response arrives, then the Ticket summary, badges and version on screen update without a reload. |
| AC-22 | Given a Requester indicates the problem appears resolved, when IT Staff view the Ticket, then the indication is visible and the status is unchanged. |

### Dashboards

| ID | Criterion |
|---|---|
| AC-23 | Given an authenticated Requester, when dashboard data is retrieved, then only metrics and recent Tickets owned by that Requester are returned. |
| AC-24 | Given known seed data, when the Requester dashboard is retrieved, then Open, Waiting for me, Recently updated and Recently resolved equal the documented queries. |
| AC-25 | Given IT Staff, when the staff dashboard is retrieved, then Unassigned, Owned by me, My open actions, counts by status and by IT Priority, and Recently updated equal the documented queries. |
| AC-26 | Given an Administrator, when the staff dashboard is retrieved, then it contains the IT Staff metrics plus active and inactive user counts by role. |
| AC-27 | Given a metric with no matching records, when the dashboard loads, then it returns 0 or an empty list and the screen shows an explicit empty message. |
| AC-28 | Given any dashboard card, when its View link is followed, then the destination lists exactly the records the card counted. |
| AC-29 | Given a Requester calling the staff dashboard, or IT Staff calling the Requester dashboard, then the response is 403; without a session it is 401. |
| AC-30 | Given the dashboard endpoints, then their response contains only summary fields and lists of at most 5 items. |
| AC-31 | Given the seeded database, when each dashboard endpoint is called, then it answers within the performance-smoke budget in tests.md §2.9. |
| AC-32 | Given a slow or failing dashboard request, when the screen loads, then it shows a loading state and then a safe failure message with Retry. |

### Roles, regression and hardening

| ID | Criterion |
|---|---|
| AC-33 | Given an Administrator, when they claim a Ticket, set IT Priority or change status, then it succeeds; the assignable-users list includes active Administrators. |
| AC-34 | Given each role, when they sign in, then they land on their Dashboard and the navigation shows only their permitted destinations with the active page indicated. |
| AC-35 | Given the Lab 1, 2 and 3 suites, when the whole test run executes, then every earlier test passes. |
| AC-36 | Given a submit control, when it is clicked repeatedly or the request is retried, then only one record is created. |
| AC-37 | Given a form, when the save fails with a network error, a 409 or a 500, then every entered value is still on screen. |
| AC-38 | Given every screen, when it is opened, then the browser console has no errors and no placeholder text or unfinished control remains. |
| AC-39 | Given a database holding Lab 3 data, when the Lab 4 migration is applied, then every earlier row is intact; when the recovery script is applied, the Lab 3 schema and data are restored. |
| AC-40 | Given the seed, when it is run twice, then the second run creates nothing and Tickets with zero, one and several Actions Taken exist. |

### Presentation, responsiveness and accessibility

| ID | Criterion |
|---|---|
| AC-41 | Given the Dashboard and the Actions Taken area at 1280, 820 and 390 px, then nothing overflows its container and the page never scrolls horizontally. |
| AC-42 | Given every interactive control, when navigated by keyboard, then it is reachable, its focus is visible, and dialogs trap and return focus. |
| AC-43 | Given status, priority and action-status badges, then each conveys its meaning in text, not by colour alone. |
| AC-44 | Given the new screens, then they use only the Zen Green tokens, spacing and button hierarchy of Labs 2 and 3. |

## 10. Definition of Done — Product Completion

1. Every FR in §4 is implemented and every BR in §5 is enforced by the backend.
2. Every AC in §9 maps to at least one automated test in [tests.md](tests.md), and all pass on `main`.
3. The Lab 1, 2 and 3 suites still pass unchanged except where a Lab 4 rule explicitly replaces an
   earlier one (BR-24, BR-26), and each such change is named in its Pull Request.
4. The migration applies to a database with Lab 3 data with no data loss; the recovery script and its
   test pass; the seed is idempotent across two runs.
5. Server, client and Playwright suites pass from a clean checkout and `tsc` reports no errors.
6. Every new write endpoint has been called directly without the UI for 401, 403, 404, 409 and 400.
7. Each dashboard metric has been compared with its documented SQL query on the seeded database.
8. The Dashboard, Actions Taken and workflow have been demonstrated in a browser, with desktop, tablet
   and mobile screenshots in `artifacts/lab-04/screenshots/`, and the visual checklist is complete.
9. No console errors, broken links, placeholder text or unfinished controls remain; README setup,
   seed, migration, recovery, test and demonstration instructions are current.
10. Every Issue is Done, every Pull Request is peer reviewed and approved, and `lab4-staging` is merged
    into `main`.

## 11. Assumptions and Decisions

| ID | Decision | Reason |
|---|---|---|
| D-01 | Performed by is the authenticated recorder; Assigned to is a separate, selectable user defaulting to the recorder. | The handout asks for "Performed by (auto)" and also for assignment and inactive-assignee rejection (§14 Part 6, AC-01). Two fields keep both truths: who recorded it and who is responsible. |
| D-02 | The resolution gate blocks only incomplete work; a Ticket with no actions can still be resolved. | The handout's rule is about Actions Taken that "remain incomplete". Requiring at least one action would block every legacy Ticket and invent a rule the stakeholder did not ask for. |
| D-03 | A refused resolution is 409, not 400. | The request is well-formed; it conflicts with the current state of related records, and the client needs the blocking actions to show the user. |
| D-04 | `version` is required on every Ticket and Action update. | Making it optional would let any client skip the check, which defeats §6.1 of the handout. |
| D-05 | Administrators perform IT Staff behaviour; this reverses Lab 3 D-10. | Handout §4.3 says so explicitly. The Lab 3 tests that asserted the opposite are updated in Issue 2 and named in its Pull Request. |
| D-06 | Actions Taken are never deleted; Cancelled replaces deletion. | An action is part of the service record; deleting it would hide what happened. |
| D-07 | Attachment Notes are text that names a Ticket attachment rather than a new upload. | The handout defines them as "what file to look for"; uploads already exist on the Ticket. |
| D-08 | Dashboards use rolling windows (7 days, 30 days) and display times in Asia/Bangkok. | Rolling windows have no midnight boundary to get wrong; Bangkok is where the service desk runs. |
| D-09 | The Administrator dashboard reuses the IT Staff endpoint with an extra `users` block. | The handout allows reuse; one endpoint means one set of calculations to test. |
| D-10 | Actions Taken appear as a fourth tab on the IT Staff Ticket Detail. | The tab pattern already separates Public Comments, Internal Notes and Attachments; a fourth tab reuses it instead of growing the page. |
