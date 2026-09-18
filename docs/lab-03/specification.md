# Lab 3 Sprint Engineering Specification — TokTickIT Authentication, Roles, IT Staff Ticketing and Administration

**Course:** CPE 334 — Introduction to Software Engineering in the Age of AI Agents
**Student:** Warun Woraphoo — 67070563438 — Section 31
**Sprint:** 3
**Status:** approved before implementation (see the merge date of PR for Issue 1)

This document extends the Lab 2 contract ([docs/lab-02/specification.md](../lab-02/specification.md)).
Every Lab 2 requirement stays in force unless a rule below replaces it. Where a Lab 2 rule is
replaced, the replacement names it explicitly.

---

## 1. Sprint Goal

Replace the temporary Development Requester selector with real authentication and server-side
role-based authorization, and deliver the first operational IT Staff workflow and the minimalist
Administrator user management screen. At the end of the sprint a person signs in with an email
address and password, is forced to replace an initial password, and then sees only the navigation,
screens and actions their single role permits — Requester, IT Staff or Administrator — while every
Lab 2 Requester function keeps working under the authenticated identity.

## 2. Stakeholder Request Interpretation

The stakeholder wants the development shortcut gone. Identity must come from a credential the person
supplies, not from a value the browser chooses, and the temporary selector and its client-side state
must disappear entirely.

Administrators need one small screen, not an identity-management product: list users, search them,
optionally filter by role, create an account with exactly one role, edit the basic fields, activate
or deactivate, and hand out a new initial password. Nothing is deleted; deactivation is the off
switch.

IT Staff need a shared queue that answers "what should I work on" — searchable, filterable, sortable,
paginated — and a Ticket Detail screen where they can take ownership, set the internal priority, move
the ticket through its permitted statuses, talk to the Requester in Public Comments and record
private Internal Notes that a Requester can never read.

A Requester keeps the Lab 2 experience and gains two things: they can reply in Public Comments and
they can say "this looks fixed to me". Saying so is a signal, not a decision — only IT Staff resolve
or close a ticket.

The last sentence of the request is the one that shapes the code: hiding a button is not
authorization. Every rule below is enforced in the backend; the UI only makes the same rule pleasant.

## 3. Scope

### 3.1 Included

1. Email and password authentication, logout, and retrieval of the current authenticated user.
2. Mandatory password change for any account flagged as holding an initial password.
3. Server-side role-based authorization for Requester, IT Staff and Administrator, plus ownership
   checks that survive a hostile client.
4. Migration of the Lab 2 `RequesterUser` records into the real `User` model, preserving Ticket and
   Attachment ownership.
5. Continuation of every Lab 2 Requester function under the authenticated identity, with the
   Development Requester selector and its stored state removed.
6. IT Staff Ticket Queue with search, filters, sorting and pagination.
7. IT Staff Ticket Detail with ownership, IT Priority, permitted status transitions, Public Comments
   and Internal Notes.
8. Requester Public Comments and the "problem appears resolved" indication.
9. Minimalist Administrator user management: list, search, optional role filter, create, edit,
   activate or deactivate, and set a new initial password.
10. Zen Green extensions for the new screens, role-aware navigation, and responsive behaviour on
    desktop, tablet and mobile.

### 3.2 Explicitly excluded

1. Email invitations, password-reset email, multi-factor authentication, social login and single
   sign-on.
2. Self-registration and Requester-created accounts.
3. Actions Taken by IT Staff (Lab 4), and therefore any rule that blocks resolution until Actions
   Taken are complete.
4. SLA calculation, escalation rules and notification services.
5. Dashboards and KPI analytics beyond the simple queue counts already shown.
6. Multi-tenancy, departments as an organisational structure, and customer administration.
7. Production deployment and cloud infrastructure changes.
8. Multiple roles on one user.
9. User deletion, bulk operations, import or export, and account-history screens.
10. Profile photos and extended profile management.
11. Account unlocking, administrator approval workflows and advanced identity management.
12. Pagination, multi-column sorting and simultaneous multi-filter on the Administrator user list.
13. Editing or deleting a Public Comment or an Internal Note.

## 4. Functional Requirements

| ID | Requirement |
|---|---|
| FR-01 | A person signs in with an email address and a password and receives an authenticated session. |
| FR-02 | The backend exposes the current authenticated user, including name, email and role. |
| FR-03 | A person can log out, after which the previous session no longer grants access. |
| FR-04 | A user whose account is flagged as holding an initial password must set a new password before any other screen or protected operation becomes available. |
| FR-05 | A user can change their own password by supplying the current password and a new password twice. |
| FR-06 | Authentication failures return a safe message that does not reveal whether an email address exists. |
| FR-07 | Every protected endpoint rejects an unauthenticated request before it evaluates anything else. |
| FR-08 | Every protected endpoint checks the authenticated user's role, and where relevant their ownership of the resource, on the server. |
| FR-09 | Navigation shows only the destinations permitted to the authenticated role. |
| FR-10 | The application shell shows the authenticated user's name and role and offers Logout. |
| FR-11 | A Requester creates, lists and opens their own Tickets and manages their Attachments exactly as in Lab 2, using the authenticated identity. |
| FR-12 | A Requester can post a Public Comment on a Ticket they own. |
| FR-13 | A Requester can indicate that the problem appears resolved on a Ticket they own. |
| FR-14 | IT Staff can retrieve a shared Ticket Queue with search, filters, sorting and pagination. |
| FR-15 | IT Staff can open any Ticket in the IT Staff Ticket Detail screen. |
| FR-16 | IT Staff can claim an unassigned Ticket, assign it to another active IT Staff user, reassign it, or release it. |
| FR-17 | IT Staff can set the IT Priority of a Ticket independently of the Requested Priority. |
| FR-18 | IT Staff can move a Ticket through the permitted status transitions, supplying a resolution summary where one is required. |
| FR-19 | IT Staff and Administrators can post an Internal Note on a Ticket. |
| FR-20 | Internal Notes are never returned to a Requester by any endpoint. |
| FR-21 | An Administrator can list users with name, email, role and activation state. |
| FR-22 | An Administrator can search users by name or email and optionally filter by role. |
| FR-23 | An Administrator can create a user with one permitted role, an activation state and an initial password. |
| FR-24 | An Administrator can edit a user's name, email address, role and activation state. |
| FR-25 | An Administrator can set a new initial password that the user must change at their next login. |

## 5. Business Rules

### Authentication and sessions

| ID | Rule |
|---|---|
| BR-01 | Only an active user with valid credentials may authenticate. |
| BR-02 | A user marked as requiring a password change cannot enter the normal application until a new valid password is saved. |
| BR-03 | Credentials are an email address, compared case-insensitively after trimming, and a password, compared exactly. |
| BR-04 | An invalid email address and an invalid password produce the same response, so the API cannot be used to discover which accounts exist. |
| BR-05 | An account that is inactive is rejected only after its password has been verified, and the rejection states that the account is not active so the person stops retrying. |
| BR-06 | A successful login creates one server-side session row and returns it to the browser as an HTTP-only cookie. The session identifier is never readable by client JavaScript. |
| BR-07 | A session expires 8 hours after it is created. An expired session is treated as no session at all. |
| BR-08 | Logout deletes the session row, so a copied cookie cannot be replayed after logout. |
| BR-09 | Logging in again creates a new session and does not invalidate other sessions of the same user; Lab 3 does not implement single-session enforcement. |
| BR-10 | Deactivating a user causes their existing sessions to stop working, because activation is re-checked on every authenticated request. |

### Passwords

| ID | Rule |
|---|---|
| BR-11 | Passwords are stored only as a bcrypt hash. Plaintext passwords are never stored, logged or returned. |
| BR-12 | A valid password is at least 8 and at most 128 characters and contains an upper-case letter, a lower-case letter, a digit and a special character. |
| BR-13 | A password change requires the current password, the new password and a confirmation; the two new values must match. |
| BR-14 | The new password must differ from the current password. |
| BR-15 | A successful password change clears the must-change flag and keeps the user signed in on the current session. |
| BR-16 | An Administrator setting a new initial password sets the must-change flag on that user. |
| BR-17 | Seeded credentials exist for local development only and are documented in the README. No real personal password or secret is committed. |

### Identity and authorization

| ID | Rule |
|---|---|
| BR-18 | The authenticated user identity, not any identifier supplied by the client, determines ownership of Requester operations. |
| BR-19 | A `requesterId` or `X-Requester-Id` value sent by a client is ignored entirely. The Lab 2 header mechanism is removed. |
| BR-20 | An unauthenticated request to a protected endpoint returns 401 and never reveals whether the resource exists. |
| BR-21 | An authenticated request that the role does not permit returns 403. |
| BR-22 | A Requester requesting a Ticket, Attachment or Internal Note that is not theirs receives the same 404 as a Ticket that does not exist, so existence is never disclosed. This continues Lab 2 decision D-02. |
| BR-23 | A user has exactly one role. Role values are Requester, IT Staff and Administrator. |
| BR-24 | Administrator and IT Staff responsibilities stay separate: an Administrator may read the queue and a Ticket Detail and may write Internal Notes, but Lab 3 does not grant an Administrator the IT Staff write operations of claiming ownership, setting IT Priority or changing status. The authorization matrix in `api-spec.md` §2 is the single source of truth. |

### Ticket ownership

| ID | Rule |
|---|---|
| BR-25 | A Ticket has zero or one Ticket Owner. A newly created Ticket is unassigned. |
| BR-26 | A Ticket Owner must be an active IT Staff user. |
| BR-27 | Any IT Staff user may claim an unassigned Ticket. |
| BR-28 | Any IT Staff user may reassign a Ticket to another active IT Staff user, or release it back to unassigned. Lab 3 does not restrict reassignment to the current owner. |
| BR-29 | Assigning a Ticket to a user who is inactive, who does not exist, or whose role is not IT Staff is rejected as a validation failure. |

### Priority

| ID | Rule |
|---|---|
| BR-30 | Requested Priority is submitted by the Requester and is never changed afterwards. |
| BR-31 | IT Priority is initialised from the Requested Priority when the Ticket is created and may afterwards be changed only by IT Staff. |
| BR-32 | Both priorities use the same four values: Low, Medium, High, Urgent. |

### Status workflow

| ID | Rule |
|---|---|
| BR-33 | The Ticket statuses are New, Open, In Progress, Waiting for Requester, Resolved, Closed, Reopened and Cancelled. |
| BR-34 | A Ticket is created with status New. |
| BR-35 | Only IT Staff may change a Ticket status. A Requester never sets a status through any endpoint. |
| BR-36 | The permitted transitions are exactly those in §5.1. Any other transition is rejected as a validation failure and the Ticket is left unchanged. |
| BR-37 | Moving a Ticket to Resolved requires a non-empty resolution summary of at most 2000 characters. |
| BR-38 | Closed and Cancelled are terminal. No transition leaves them. |
| BR-39 | Moving to Cancelled or Closed requires an explicit confirmation from the user interface, because both are irreversible. |
| BR-40 | A Requester may indicate that the problem appears resolved. This records the indication and the time, and it does not change the status; only IT Staff set Resolved or Closed. |

### Public Comments and Internal Notes

| ID | Rule |
|---|---|
| BR-41 | Public Comments are visible to the Ticket's Requester, to IT Staff and to Administrators. |
| BR-42 | Internal Notes are visible only to IT Staff and Administrators. |
| BR-43 | Both are append-only in Lab 3. There is no edit and no delete endpoint. |
| BR-44 | Every entry records its author and its creation time from the backend clock, never from the client. |
| BR-45 | Empty or whitespace-only content is rejected. The permitted length is 1 to 2000 characters after trimming, which is enough for an operational message and small enough to keep a row readable and the payload bounded. |
| BR-46 | Content is stored as plain text and rendered as text, never as HTML, so a comment cannot inject markup. |
| BR-47 | A Requester may comment only on a Ticket they own; any other Ticket answers 404 under BR-22. |

### Administrator user management

| ID | Rule |
|---|---|
| BR-48 | Only an Administrator may call any user-management endpoint or open the User Management screen. |
| BR-49 | An email address is unique across all users, compared case-insensitively. A duplicate is rejected as a conflict. |
| BR-50 | A user is created with exactly one role from the three permitted values. An unknown role is a validation failure. |
| BR-51 | A created user always receives an initial password and is flagged as requiring a password change. |
| BR-52 | An Administrator cannot deactivate their own account. |
| BR-53 | The system must always retain at least one active Administrator. Deactivating the last active Administrator, or changing its role away from Administrator, is rejected. |
| BR-54 | Users are deactivated, never deleted. No delete endpoint exists. |
| BR-55 | Editing a user never changes their password, and setting a new initial password never changes their other fields. |
| BR-56 | A user's name is 2 to 120 characters after trimming; an email address is at most 200 characters and must be syntactically valid. |
| BR-57 | The user list is returned sorted by name ascending, with an optional search over name and email and an optional single role filter. |

### Migration and regression

| ID | Rule |
|---|---|
| BR-58 | The Lab 2 `RequesterUser` rows become `User` rows in place. Ticket and Attachment foreign keys continue to point at the same people. |
| BR-59 | Every migrated Requester receives the documented local development initial password and the must-change flag, so no account exists without credentials. |
| BR-60 | Existing Tickets keep their status New, receive an IT Priority copied from the Requested Priority and remain unassigned after migration. |
| BR-61 | The Development Requester selector, the Change Requester action, the `GET /api/requesters` endpoint and the stored `toktickit.requesterId` value are removed. |
| BR-62 | Every Lab 2 acceptance criterion that is still in scope keeps passing. The Lab 2 test suites remain in the repository and are re-run as regression evidence. |

### 5.1 Status transition matrix

| From \ To | New | Open | In Progress | Waiting for Requester | Resolved | Closed | Reopened | Cancelled |
|---|---|---|---|---|---|---|---|---|
| **New** | — | ✔ | ✔ | — | — | — | — | ✔ |
| **Open** | — | — | ✔ | ✔ | ✔ | — | — | ✔ |
| **In Progress** | — | — | — | ✔ | ✔ | — | — | ✔ |
| **Waiting for Requester** | — | — | ✔ | — | ✔ | — | — | ✔ |
| **Resolved** | — | — | — | — | — | ✔ | ✔ | — |
| **Closed** | — | — | — | — | — | — | — | — |
| **Reopened** | — | — | ✔ | ✔ | ✔ | — | — | ✔ |
| **Cancelled** | — | — | — | — | — | — | — | — |

Every permitted transition is performed by IT Staff (BR-35). Resolved requires a resolution summary
(BR-37); Closed and Cancelled require a confirmation in the UI (BR-39).

## 6. UI Specification Summary

Full detail, tokens and checklists: [ui-spec.md](ui-spec.md).

- **Login** — email, password, inline validation, busy state, one safe failure message, and a
  distinct message for a deactivated account.
- **Change Password (mandatory)** — shown instead of the application when the must-change flag is
  set; current password, new password, confirmation, and a live rules checklist.
- **Application shell** — brand, role-specific navigation, the authenticated user's name with a role
  badge, and Logout. The Development Requester name and the Change Requester button are gone.
- **Requester screens** — My Tickets, Create Ticket and Ticket Detail as in Lab 2, plus a Public
  Comments section and the "The problem appears resolved" action on Ticket Detail.
- **IT Staff Ticket Queue** — search field, filter row, sortable table of Ticket No., Created,
  Summary, Category, Requested Priority, IT Priority, Status, Owner and Last Updated, with
  pagination. Cards replace the table below 768 px.
- **IT Staff Ticket Detail** — read-only ticket information, an operations panel for Owner, IT
  Priority and Status, and tabs for Public Comments, Internal Notes and Attachments. Internal Notes
  carry a distinct amber surface and an explicit "not visible to the Requester" label so private
  information is never posted publicly by mistake.
- **Administrator User Management** — user list with Name, Email, Role, Status and Edit, a search
  field, a role filter, and a side panel for create and edit including Set new initial password.
- Roles are shown with the same badge component everywhere; Ticket status, Requested Priority and IT
  Priority reuse the Lab 2 badge palette.

## 7. Data Changes

### 7.1 Models

| Model | Change | Fields |
|---|---|---|
| `User` | **renamed from `RequesterUser`** | `id`, `name`, `email` (unique, lower-cased), `passwordHash`, `role` (`RoleName`), `department?`, `isActive`, `mustChangePassword`, `lastLoginAt?`, `createdAt`, `updatedAt` |
| `Session` | new | `id` (opaque 32-byte token), `userId`, `createdAt`, `expiresAt` |
| `Ticket` | extended | adds `ownerId?`, `itPriority`, `resolutionSummary?`, `requesterResolvedAt?`, `resolvedAt?`, `closedAt?`; `status` enum extended to eight values |
| `PublicComment` | new | `id`, `ticketId`, `authorId`, `body`, `createdAt` |
| `InternalNote` | new | `id`, `ticketId`, `authorId`, `body`, `createdAt` |
| `Attachment` | renamed columns | `uploadedByRequesterId` → `uploadedByUserId`, `removedByRequesterId` → `removedByUserId`; both now reference `User` |
| `Category`, `RelatedSystem` | unchanged | — |

Enums: `Priority` unchanged (`LOW`, `MEDIUM`, `HIGH`, `URGENT`); `TicketStatus` extended from one
value to `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CLOSED`, `REOPENED`,
`CANCELLED`; new enum `RoleName` with `REQUESTER`, `IT_STAFF`, `ADMINISTRATOR`.

### 7.2 Relationships

- One `User` has one `RoleName`.
- One `User` (Requester) owns many submitted `Ticket` rows through `Ticket.requesterId`.
- One `Ticket` has zero or one owning `User` through `Ticket.ownerId`.
- One `Ticket` has many `PublicComment` rows and many `InternalNote` rows.
- One `PublicComment` and one `InternalNote` each have exactly one author `User`.
- One `User` has many `Session` rows; deleting a user is not possible, but sessions cascade on the
  user relation so a future hard delete cannot orphan them.
- Existing `Category`, `RelatedSystem`, `Ticket` and `Attachment` data stays valid after migration.

### 7.3 Indexes and constraints

| Index | Query it serves |
|---|---|
| `User.email` unique | Login looks the account up by email on every sign-in attempt; the unique constraint also enforces BR-49. |
| `User(role, name)` | The Administrator user list filters by one role and returns rows sorted by name (BR-57), so one composite index serves both the filter and the ordering. |
| `Session.expiresAt` | Every authenticated request loads a session and must reject an expired one; expired-row cleanup scans the same column. |
| `Ticket(requesterId, createdAt)` (Lab 2) | My Tickets, unchanged. |
| `Ticket(status, createdAt)` | The default IT Staff queue view filters by one or more statuses and sorts by creation time. |
| `Ticket(ownerId, status)` | "My assigned work" — the queue filtered by owner, then by status, which is the most frequent staff filter pair. |
| `Ticket(itPriority, createdAt)` | Sorting the queue by IT Priority with creation time as the tie-breaker. |
| `PublicComment(ticketId, createdAt)` and `InternalNote(ticketId, createdAt)` | Both threads are always read for one Ticket in chronological order. |
| `Attachment(ticketId, removedAt)` (Lab 2) | Active-attachment count, unchanged. |

Constraints: `User.email` unique; `Ticket.ownerId` restricted to existing users and validated in the
application against role and activation (BR-26, BR-29); `PublicComment.body` and `InternalNote.body`
non-empty after trimming, enforced in the application (BR-45); every foreign key uses `Restrict`
except `Session.userId` and the comment and note relations, which cascade with their parent.

### 7.4 Migration decisions

1. The migration **renames** `RequesterUser` to `User` rather than creating a new table and copying
   rows. The primary keys stay identical, so `Ticket.requesterId` and both `Attachment` columns keep
   pointing at the same people with no data movement and no risk of a partial copy (BR-58).
2. `passwordHash`, `role` and `mustChangePassword` are added with defaults: role `REQUESTER`,
   `mustChangePassword` true, and a bcrypt hash of the documented local development password, so no
   migrated row is ever left without credentials (BR-59).
3. `Ticket.itPriority` is added and back-filled from `requestedPriority` in the same migration
   (BR-60); `ownerId` is added as nullable, leaving every migrated ticket unassigned (BR-25).
4. The `TicketStatus` enum is extended by adding values. Existing rows keep `NEW`, so no row needs
   rewriting.
5. The Attachment columns are renamed rather than dropped and re-added, so no attachment loses its
   uploader.
6. The seed is idempotent: every insert is an upsert on a natural unique key, so running it twice
   changes nothing (verified as part of the Definition of Done).

### 7.5 Seed data

| Kind | Count |
|---|---|
| Requesters | 4 active, 1 inactive (the five migrated Lab 2 records) |
| IT Staff | 3 active, 1 inactive |
| Administrators | 1 active |
| Categories / Related Systems | 4 / 7 (Lab 2, unchanged) |
| Tickets | at least 12, spread across all statuses, all four priorities, and both assigned and unassigned ownership |
| Public Comments / Internal Notes | at least 6 / at least 4, containing no sensitive information |

All seeded accounts share one documented local development password and are flagged as requiring a
password change, except the demonstration accounts named in the README, which are pre-changed so a
demonstration does not begin with four password-change screens.

## 8. API Contract

Full detail, including every request and response body: [api-spec.md](api-spec.md).

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | public | Authenticate and create a session |
| POST | `/api/auth/logout` | any authenticated | Destroy the current session |
| GET | `/api/auth/me` | any authenticated | The current user, role and must-change flag |
| POST | `/api/auth/password` | any authenticated | Change one's own password |
| GET | `/api/health` | public | Service health check (Lab 1) |
| GET | `/api/categories`, `/api/related-systems` | any authenticated | Reference data |
| POST/GET | `/api/tickets` | Requester | Create and list one's own Tickets |
| GET | `/api/tickets/:id` | Requester (owner) | One owned Ticket |
| POST/GET | `/api/tickets/:id/attachments` | Requester (owner) | Attachment upload and metadata |
| GET | `/api/attachments/:id/download` | Requester (owner), IT Staff, Administrator | Download an active attachment |
| PATCH | `/api/attachments/:id/remove` | Requester (owner) | Soft removal |
| GET/POST | `/api/tickets/:id/comments` | Requester (owner), IT Staff, Administrator | Public Comments |
| POST | `/api/tickets/:id/problem-resolved` | Requester (owner) | Indicate the problem appears resolved |
| GET/POST | `/api/tickets/:id/notes` | IT Staff, Administrator | Internal Notes |
| GET | `/api/staff/tickets` | IT Staff, Administrator | The shared queue |
| GET | `/api/staff/tickets/:id` | IT Staff, Administrator | One Ticket for staff operations |
| PATCH | `/api/staff/tickets/:id/owner` | IT Staff | Claim, assign, reassign or release |
| PATCH | `/api/staff/tickets/:id` | IT Staff | IT Priority, status and resolution summary |
| GET/POST | `/api/admin/users` | Administrator | List and create users |
| PATCH | `/api/admin/users/:id` | Administrator | Edit name, email, role, activation |
| POST | `/api/admin/users/:id/password` | Administrator | Set a new initial password |

`GET /api/requesters` is **removed** (BR-61).

## 9. Acceptance Criteria

### Authentication

| ID | Criterion |
|---|---|
| AC-01 | Given an active user with valid credentials, when the user logs in, then the backend establishes authenticated access and returns the permitted user identity and role. |
| AC-02 | Given a user who must change the initial password, when login succeeds, then normal application screens remain unavailable until a valid new password is saved. |
| AC-03 | Given a wrong password, when the user logs in, then the response is 401 with one safe message and no indication of whether the email address exists. |
| AC-04 | Given an unknown email address, when the user logs in, then the response is identical to AC-03. |
| AC-05 | Given an inactive account with the correct password, when the user logs in, then the response is 403 stating that the account is not active, and no session is created. |
| AC-06 | Given an authenticated session, when `GET /api/auth/me` is called, then the user's name, email and role are returned and no password material is present in the body. |
| AC-07 | Given an authenticated session, when the user logs out and then calls a protected endpoint with the same cookie, then the response is 401. |
| AC-08 | Given a session older than its expiry, when a protected endpoint is called, then the response is 401. |
| AC-09 | Given a new password that fails the password rules, when the change is submitted, then it is rejected with a field-level message and the old password still works. |
| AC-10 | Given a correct current password and a valid new password, when the change is submitted, then the must-change flag is cleared and the user continues into the application on the same session. |
| AC-11 | Given a user is deactivated by an Administrator while signed in, when that user calls a protected endpoint, then the response is 401. |

### Authorization

| ID | Criterion |
|---|---|
| AC-12 | Given no session, when any protected endpoint is called, then the response is 401 and the body reveals nothing about the resource. |
| AC-13 | Given an authenticated Requester, when the client supplies another requesterId, then the backend still applies the authenticated identity and does not return another Requester's data. |
| AC-14 | Given a Requester account, when an Internal Note endpoint is requested, then the operation is rejected without exposing note content. |
| AC-15 | Given a Requester account, when a staff or administration endpoint is called directly, then the response is 403. |
| AC-16 | Given an IT Staff account, when a user-management endpoint is called directly, then the response is 403. |
| AC-17 | Given a Requester, when a Ticket belonging to another Requester is requested, then the response is 404 and is identical to the response for a Ticket that does not exist. |
| AC-18 | Given any role, when the application shell renders, then only the destinations permitted to that role are present in the navigation. |

### Requester regression and participation

| ID | Criterion |
|---|---|
| AC-19 | Given an authenticated Requester, when a Ticket is created, then it is stored against the authenticated user, receives a backend-generated ticket number, status New and an IT Priority equal to the Requested Priority. |
| AC-20 | Given an authenticated Requester, when My Tickets is opened, then only that user's Tickets are listed and Lab 2 search, filter, sort and pagination still behave as specified. |
| AC-21 | Given a Ticket owned by the authenticated Requester, when a Public Comment is posted, then it appears in the thread with the author's name and a backend timestamp. |
| AC-22 | Given a whitespace-only comment, when it is posted, then it is rejected with a validation message and nothing is stored. |
| AC-23 | Given a Ticket owned by the authenticated Requester, when the problem-appears-resolved action is used, then the indication is recorded, it is visible to IT Staff, and the Ticket status is unchanged. |
| AC-24 | Given the application is opened after Lab 3, then no Development Requester selector, Change Requester action or stored requester identifier exists anywhere in the client. |

### IT Staff queue

| ID | Criterion |
|---|---|
| AC-25 | Given an IT Staff user, when the queue is opened, then Tickets from all Requesters are listed with ticket number, created date, summary, category, both priorities, status, owner and last updated. |
| AC-26 | Given a search term, when the queue is searched, then only Tickets whose ticket number or summary contains the term are returned, case-insensitively. |
| AC-27 | Given a status filter, an IT Priority filter or an owner filter including "unassigned", when it is applied, then only the matching Tickets are returned. |
| AC-28 | Given a sortable column, when a sort field and direction are supplied, then the rows are ordered accordingly and an invalid value falls back to the documented default instead of failing. |
| AC-29 | Given more Tickets than one page, when a page is requested, then the response contains that page and pagination metadata of page, page size, total items and total pages. |
| AC-30 | Given a filter that matches nothing, when the queue is loaded, then a no-results message is shown and no empty table body is rendered. |
| AC-31 | Given an unassigned Ticket, when it is listed, then the owner column shows an explicit Unassigned badge rather than an empty cell. |

### IT Staff ticket operations

| ID | Criterion |
|---|---|
| AC-32 | Given an unassigned Ticket, when an IT Staff user claims it, then that user becomes the Ticket Owner and the change is visible in the queue. |
| AC-33 | Given an assigned Ticket, when it is reassigned to another active IT Staff user, then the new owner is stored; assigning it to an inactive user, a non IT Staff user or an unknown user is rejected with a validation message. |
| AC-34 | Given a Ticket, when IT Priority is changed, then the new value is stored and the Requested Priority is unchanged. |
| AC-35 | Given a Ticket in a given status, when a transition permitted by the matrix is requested, then the status changes; when a transition outside the matrix is requested, then it is rejected and the Ticket is unchanged. |
| AC-36 | Given a Ticket being moved to Resolved, when the resolution summary is empty, then the transition is rejected with a field-level message. |
| AC-37 | Given a Ticket, when IT Staff post a Public Comment and an Internal Note, then both are stored with their author and time, and a subsequent Requester request returns the comment but never the note. |
| AC-38 | Given the IT Staff Ticket Detail screen, when it renders, then Public Comments and Internal Notes are visually distinct and the Internal Notes area states that it is not visible to the Requester. |
| AC-39 | Given a Ticket with attachments created in Lab 2, when IT Staff open it, then the attachment list and the download behaviour still work, and a removed attachment still answers 410 on download. |

### Administrator user management

| ID | Criterion |
|---|---|
| AC-40 | Given an Administrator, when User Management is opened, then every user is listed with name, email, role, status and an Edit action, sorted by name. |
| AC-41 | Given a search term or a role filter, when it is applied, then only matching users are listed, and a combination that matches nothing shows a no-results message. |
| AC-42 | Given valid input, when a user is created with one role and an initial password, then the account exists, is flagged as requiring a password change, and can sign in and be forced through the change. |
| AC-43 | Given an email address that already exists, when a user is created or edited to use it, then the request is rejected as a conflict and no data changes. |
| AC-44 | Given an existing user, when name, email, role or activation state is edited, then the change is stored and the user's password is untouched. |
| AC-45 | Given an Administrator, when they attempt to deactivate their own account, then the request is rejected with an explanatory message. |
| AC-46 | Given exactly one active Administrator, when an attempt is made to deactivate that account or change its role, then the request is rejected. |
| AC-47 | Given an existing user, when an Administrator sets a new initial password, then the user's next login forces a password change and the previous password no longer works. |

### Presentation, responsiveness and accessibility

| ID | Criterion |
|---|---|
| AC-48 | Given any Lab 3 screen at 1280, 820 and 390 px, when it is rendered, then no element overflows its container and the page never scrolls horizontally. |
| AC-49 | Given any Lab 3 screen, when it is rendered, then it uses the Lab 2 Zen Green tokens, spacing and button hierarchy and looks like the same application. |
| AC-50 | Given a form field with an error, when validation fails, then the message is associated with its field and is announced to assistive technology. |
| AC-51 | Given a long-running action, when it is in progress, then a busy state is shown and the submit control is disabled so the action cannot be repeated. |

## 10. Definition of Done — Product Completion

1. Every FR in §4 is implemented and every BR in §5 is enforced by the backend.
2. Every AC in §9 maps to at least one automated test in [tests.md](tests.md), and every one of those
   tests passes on `main`.
3. `npx prisma migrate deploy` applies to a database holding Lab 2 data with no data loss, and the
   seed is idempotent across two consecutive runs.
4. The server, client and Playwright suites all pass from a clean checkout, and `tsc` reports no
   errors in either workspace.
5. Every protected endpoint has been exercised directly, without the UI, for the unauthenticated,
   forbidden and not-found cases.
6. Login, mandatory password change, logout, the Requester regression, the IT Staff queue, the IT
   Staff Ticket Detail and Administrator User Management have all been demonstrated in a browser,
   with screenshots in `artifacts/lab-03/`.
7. Desktop, tablet and mobile screenshots exist for every Lab 3 screen and the visual checklist in
   `ui-spec.md` is complete.
8. No secret, real password or `.env` file is committed; seeded development credentials are
   documented in the README.
9. Every Issue is Done, every Pull Request is peer reviewed and approved, and `lab3-staging` is
   merged into `main`.
10. `docs/lab-03/` contains specification, api-spec, ui-spec, tests, reviewer and ai-use, all
    consistent with the code that shipped.

## 11. Assumptions and Decisions

| ID | Decision | Reason |
|---|---|---|
| D-01 | Server-side sessions in a `Session` table, delivered as an HTTP-only, SameSite=Lax cookie, rather than a stateless JWT. | Logout and deactivation must take effect immediately (BR-08, BR-10). A stateless token cannot be revoked without adding the very table it was meant to avoid. |
| D-02 | bcrypt with cost factor 10. | Available for the course stack, deliberately slow, and salted per password. Cost 10 keeps the test suite usable while staying far above an unsalted digest. |
| D-03 | CSRF is handled by SameSite=Lax plus a JSON-only API that accepts no cross-site form posts, not by a token. | Lab 3 has no cross-site form submission and no third-party embedding, so a token would add ceremony without changing the threat. This is recorded so Lab 4 can revisit it if cross-origin hosting arrives. |
| D-04 | An invalid password and an unknown email produce one identical 401; an inactive account produces 403 only after the password verifies. | Prevents account enumeration (BR-04) while still giving a deactivated person a message they can act on (BR-05). |
| D-05 | Ownership violations answer 404, not 403, for Tickets, Attachments and Notes. | Continues Lab 2 D-02: a 403 confirms the resource exists. |
| D-06 | The `RequesterUser` table is renamed to `User` instead of a create-and-copy migration. | Keeps every foreign key valid with no data movement; the alternative risks a partial copy and orphaned tickets. |
| D-07 | One role per user, stored as an enum column, with no join table. | The handout limits Lab 3 to one role, and an enum makes an invalid role impossible at the database level. A join table would model a requirement that was explicitly excluded. |
| D-08 | IT Priority is initialised from Requested Priority at creation rather than left null. | The queue can then sort by one comparable column for every Ticket, and staff see a sensible starting value instead of a blank. |
| D-09 | Any IT Staff user may reassign any Ticket, not only its current owner. | A service desk must be able to hand work over when someone is away; restricting it would need a delegation rule that Lab 3 excludes. |
| D-10 | Administrators may read the queue and Ticket Detail and write Internal Notes, but not claim, prioritise or change status. | The handout asks that the two responsibilities stay conceptually separate; read access is needed for support, write access to the workflow is not. |
| D-11 | Comment and note bodies are limited to 2000 characters. | Long enough for a real operational message, short enough to keep a thread readable and the response payload bounded. |
| D-12 | All seeded accounts share one documented development password, and two demonstration accounts are pre-changed. | Keeps the seed reproducible and the credentials obvious to a grader, while letting a demonstration start on the application rather than on four password-change screens. |
