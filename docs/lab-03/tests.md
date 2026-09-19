# Lab 3 Test Plan and Results

Written with [specification.md](specification.md) in Issue 1, **before** any Lab 3 implementation
existed, and updated with the final column after the suites were executed in Issue 8. It is not a
description of whatever tests happened to be written.

Types: **U** unit · **API** API/integration · **UI** component · **STYLE** UI style · **RESP**
responsive · **E2E** end-to-end · **REG** migration and regression.

The `Final` column is `Pending` while the sprint is in progress and is replaced by the real outcome
in Issue 8. Lab 2's 140 tests stay in the repository and are re-run as regression evidence (BR-62).

---

## 1. Test Strategy

| Layer | Tool | What it proves |
|---|---|---|
| Unit | Vitest | Pure rules: password policy, status transition matrix, queue query parsing, role guards. Fast, no database. |
| API | Vitest + Supertest against the real Express app and a real PostgreSQL | Authentication, authorization, ownership, validation, status codes and safe error bodies. This is where "hiding a button is not authorization" is actually proven, because the UI is not involved. |
| UI component | Vitest + Testing Library | Screen behaviour with the network mocked: validation, role-specific controls, feedback states. |
| UI style | Vitest + Testing Library | The Zen Green contract: tokens present, read-only versus editable, note surface distinct from comment surface. |
| Responsive | Playwright at 1280, 820 and 390 px | No horizontal scroll and no element wider than its container, measured rather than eyeballed. |
| E2E | Playwright against both servers | The journeys a grader will repeat by hand: sign in, forced change, staff workflow, administration. |
| Regression | Vitest + Supertest | That Lab 2 behaviour survived the migration to authenticated identity. |

Authorization is tested at the API layer for every protected endpoint and for every role that must be
refused, not only for the role that is permitted.

## 2. Planned Tests

### 2.1 Unit — `server/tests/lab-03/`

| Test ID | Type | AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| U-01 | U | AC-09 | Password shorter than 8 characters | Rejected, message names the length rule | `password.unit.test.ts` | Pass |
| U-02 | U | AC-09 | Password longer than 128 characters | Rejected | `password.unit.test.ts` | Pass |
| U-03 | U | AC-09 | Password missing an upper-case letter, a lower-case letter, a digit or a special character | Rejected in each of the four cases | `password.unit.test.ts` | Pass |
| U-04 | U | AC-09 | Password satisfying every rule | Accepted | `password.unit.test.ts` | Pass |
| U-05 | U | AC-09 | Confirmation does not match | Rejected on `confirmPassword` | `password.unit.test.ts` | Pass |
| U-06 | U | AC-09 | New password equals the current password | Rejected (BR-14) | `password.unit.test.ts` | Pass |
| U-07 | U | AC-01 | Hash and verify round trip; the hash never equals the plaintext | Verification succeeds, hash differs, two hashes of one password differ | `password.unit.test.ts` | Pass |
| U-08 | U | AC-35 | Every permitted transition in the §5.1 matrix | Allowed | `transitions.unit.test.ts` | Pass |
| U-09 | U | AC-35 | Every transition outside the matrix | Rejected | `transitions.unit.test.ts` | Pass |
| U-10 | U | AC-35 | Closed and Cancelled are terminal | No transition is offered from either | `transitions.unit.test.ts` | Pass |
| U-11 | U | AC-36 | Resolved requires a resolution summary | Rejected when blank or whitespace | `transitions.unit.test.ts` | Pass |
| U-12 | U | AC-28 | Queue sort and order defaults and fallbacks | Unknown values fall back to `createdAt` / `desc` | `staff-query.unit.test.ts` | Pass |
| U-13 | U | AC-29 | Queue paging defaults and clamping | Defaults to page 1, size 10; unknown size falls back to 10 | `staff-query.unit.test.ts` | Pass |
| U-14 | U | AC-27 | Queue filter parsing, including `ownerId=unassigned` | Produces the documented Prisma filter | `staff-query.unit.test.ts` | Pass |
| U-15 | U | AC-27 | Invalid `status`, `itPriority`, `categoryId` or `ownerId` | Reported as a validation error, not silently ignored | `staff-query.unit.test.ts` | Pass |
| U-16 | U | AC-22 | Comment and note body validation: empty, whitespace-only, 1 char, 2000 chars, 2001 chars | Rejected, rejected, accepted, accepted, rejected | `content.unit.test.ts` | Pass |
| U-17 | U | AC-40 | User validation: name bounds, email syntax and length, role enum | Accepted and rejected per BR-50, BR-56 | `user-validation.unit.test.ts` | Pass |

### 2.2 API — authentication, `server/tests/lab-03/auth.api.test.ts`

| Test ID | Type | AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| API-01 | API | AC-01 | Valid login | 200, authenticated response with safe user data, session cookie set | `auth.api.test.ts` | Pass |
| API-02 | API | AC-03 | Wrong password | 401, one generic message | `auth.api.test.ts` | Pass |
| API-03 | API | AC-04 | Unknown email | 401, body byte-identical to API-02 | `auth.api.test.ts` | Pass |
| API-04 | API | AC-05 | Correct password, inactive account | 403, "not active" message, no session created | `auth.api.test.ts` | Pass |
| API-05 | API | AC-01 | Login response and `me` response contain no hash or password field | Neither body has `passwordHash` | `auth.api.test.ts` | Pass |
| API-06 | API | AC-06 | `GET /api/auth/me` with a valid session | 200 with name, email, role | `auth.api.test.ts` | Pass |
| API-07 | API | AC-12 | `GET /api/auth/me` with no cookie | 401 | `auth.api.test.ts` | Pass |
| API-08 | API | AC-07 | Logout, then reuse the same cookie | 204, then 401 | `auth.api.test.ts` | Pass |
| API-09 | API | AC-08 | A session whose `expiresAt` is in the past | 401 | `auth.api.test.ts` | Pass |
| API-10 | API | AC-11 | User deactivated while signed in | The next protected call returns 401 | `auth.api.test.ts` | Pass |
| API-11 | API | AC-02 | `mustChangePassword` user calls a normal endpoint | 403 with `code: PASSWORD_CHANGE_REQUIRED` | `auth.api.test.ts` | Pass |
| API-12 | API | AC-02 | The same user calls `me`, `password` and `logout` | All three are permitted | `auth.api.test.ts` | Pass |
| API-13 | API | AC-10 | Valid password change | 200, flag cleared, same session still valid | `auth.api.test.ts` | Pass |
| API-14 | API | AC-09 | Password change with a wrong current password | 400 on `currentPassword`; the old password still logs in | `auth.api.test.ts` | Pass |
| API-15 | API | AC-09 | Password change violating the rules | 400 with a field message | `auth.api.test.ts` | Pass |
| API-16 | API | AC-10 | Login with the new password after a change | 200; the previous password now returns 401 | `auth.api.test.ts` | Pass |
| API-17 | API | AC-03 | Login validation: missing email, missing password, malformed email | 400 with `fields` | `auth.api.test.ts` | Pass |

### 2.3 API — authorization, `server/tests/lab-03/authorization.api.test.ts`

| Test ID | Type | AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| API-18 | API | AC-12 | Every protected endpoint without a session | 401 for each | `authorization.api.test.ts` | Pass |
| API-19 | API | AC-15 | Requester calls each staff endpoint | 403 | `authorization.api.test.ts` | Pass |
| API-20 | API | AC-14 | Requester calls `GET` and `POST /api/tickets/:id/notes` on their own ticket | 404, no note content in the body | `authorization.api.test.ts` | Pass |
| API-21 | API | AC-16 | IT Staff calls each administration endpoint | 403 | `authorization.api.test.ts` | Pass |
| API-22 | API | AC-16 | Requester calls each administration endpoint | 403 | `authorization.api.test.ts` | Pass |
| API-23 | API | AC-13 | Requester sends `X-Requester-Id` and `requesterId` for another user | The authenticated identity is used; the other user's data is never returned | `authorization.api.test.ts` | Pass |
| API-24 | API | AC-17 | Requester requests another Requester's ticket, and a ticket that does not exist | Both 404, bodies identical field by field | `authorization.api.test.ts` | Pass |
| API-25 | API | AC-17 | Requester requests another Requester's attachment metadata and download | 404 in both cases | `authorization.api.test.ts` | Pass |
| API-26 | API | AC-19 | Administrator calls the IT Staff write endpoints (owner, status, priority) | 403 (D-10) | `authorization.api.test.ts` | Pass |
| API-27 | API | AC-25 | Administrator calls the read-only staff endpoints | 200 | `authorization.api.test.ts` | Pass |

### 2.4 API — Requester regression and participation, `server/tests/lab-03/requester-regression.api.test.ts`

| Test ID | Type | AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| REG-01 | REG | AC-19 | Create a ticket as an authenticated Requester | 201, stored against the session user, backend ticket number, status New, IT Priority equal to Requested Priority | `requester-regression.api.test.ts` | Pass |
| REG-02 | REG | AC-20 | My Tickets returns only the authenticated user's tickets | No other requester's row appears | `requester-regression.api.test.ts` | Pass |
| REG-03 | REG | AC-20 | Lab 2 search, status filter, sort and pagination still behave as specified | Same results as the Lab 2 contract | `requester-regression.api.test.ts` | Pass |
| REG-04 | REG | AC-19 | Lab 2 validation failures and the duplicate-submission 409 | Unchanged behaviour and unchanged bodies | `requester-regression.api.test.ts` | Pass |
| REG-05 | REG | AC-39 | Attachment upload, metadata, download, soft removal and the 410 on a removed download | Unchanged from Lab 2 under authentication | `requester-regression.api.test.ts` | Pass |
| REG-06 | REG | AC-24 | `GET /api/requesters` | 404, the endpoint is gone | `requester-regression.api.test.ts` | Pass |
| REG-07 | REG | AC-19 | Migrated Lab 2 tickets still resolve to their original requester | The requester id on an existing ticket is unchanged after migration | `requester-regression.api.test.ts` | Pass |

### 2.5 API — comments, notes and the resolution indication, `server/tests/lab-03/comments-notes.api.test.ts`

| Test ID | Type | AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| API-28 | API | AC-21 | Requester posts a comment on their own ticket | 201 with author name, role and a backend timestamp | `comments-notes.api.test.ts` | Pass |
| API-29 | API | AC-22 | Empty, whitespace-only and over-length comment bodies | 400 in each case, nothing stored | `comments-notes.api.test.ts` | Pass |
| API-30 | API | AC-17 | Requester posts a comment on another Requester's ticket | 404 | `comments-notes.api.test.ts` | Pass |
| API-31 | API | AC-37 | IT Staff posts a comment and a note on the same ticket | Both 201 | `comments-notes.api.test.ts` | Pass |
| API-32 | API | AC-37 | The Requester then reads the ticket, its comments and its notes | Comment visible, note endpoint 404, no note text anywhere in any response | `comments-notes.api.test.ts` | Pass |
| API-33 | API | AC-37 | Comment and note ordering | Both returned oldest first | `comments-notes.api.test.ts` | Pass |
| API-34 | API | AC-21 | A client-supplied author or timestamp in the body | Ignored; the backend values are stored | `comments-notes.api.test.ts` | Pass |
| API-35 | API | AC-23 | Requester marks the problem as appearing resolved | 200, `requesterResolvedAt` set, status unchanged | `comments-notes.api.test.ts` | Pass |
| API-36 | API | AC-23 | The same action called twice | Idempotent; the first timestamp is kept | `comments-notes.api.test.ts` | Pass |
| API-37 | API | AC-23 | IT Staff or Administrator calls the resolution indication | 403 | `comments-notes.api.test.ts` | Pass |
| API-38 | API | AC-23 | The indication is visible to IT Staff on the queue and on the detail response | `requesterResolvedAt` present in both | `comments-notes.api.test.ts` | Pass |

### 2.6 API — IT Staff queue, `server/tests/lab-03/staff-queue.api.test.ts`

| Test ID | Type | AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| API-39 | API | AC-25 | Queue returns tickets from every requester with the nine documented fields | 200, fields present, `owner` null when unassigned | `staff-queue.api.test.ts` | Pass |
| API-40 | API | AC-26 | Search by ticket number and by summary fragment, case-insensitively | Only matching tickets | `staff-queue.api.test.ts` | Pass |
| API-41 | API | AC-26 | Search term that matches nothing | Empty list with correct pagination metadata | `staff-queue.api.test.ts` | Pass |
| API-42 | API | AC-27 | Status filter | Only that status | `staff-queue.api.test.ts` | Pass |
| API-43 | API | AC-27 | Category filter and IT Priority filter | Only matching tickets | `staff-queue.api.test.ts` | Pass |
| API-44 | API | AC-27 | Owner filter by id and `ownerId=unassigned` | Assigned subset and unassigned subset respectively | `staff-queue.api.test.ts` | Pass |
| API-45 | API | AC-28 | Sorting by `createdAt`, `updatedAt`, `ticketNumber` and `itPriority`, both directions | Documented ordering; IT Priority sorts by severity, not alphabetically | `staff-queue.api.test.ts` | Pass |
| API-46 | API | AC-28 | Unknown `sort`, `order`, `page`, `pageSize` | Falls back to the defaults, still 200 | `staff-queue.api.test.ts` | Pass |
| API-47 | API | AC-27 | Unknown `status`, `itPriority`, `categoryId`, `ownerId` | 400 with `fields` | `staff-queue.api.test.ts` | Pass |
| API-48 | API | AC-29 | Pagination metadata across two pages | `page`, `pageSize`, `totalItems`, `totalPages` correct and no row repeats | `staff-queue.api.test.ts` | Pass |
| API-49 | API | AC-29 | A page beyond the last | Empty list, metadata still correct | `staff-queue.api.test.ts` | Pass |
| API-50 | API | AC-25 | `GET /api/staff/tickets/:id` returns the ticket with attachments, comments and notes | 200 with all four sections | `staff-queue.api.test.ts` | Pass |
| API-51 | API | AC-25 | `GET /api/staff/tickets/:id` for an unknown id | 404 | `staff-queue.api.test.ts` | Pass |

### 2.7 API — IT Staff ticket operations, `server/tests/lab-03/staff-ticket-detail.api.test.ts`

| Test ID | Type | AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| API-52 | API | AC-32 | IT Staff claims an unassigned ticket | 200, owner set to the caller | `staff-ticket-detail.api.test.ts` | Pass |
| API-53 | API | AC-33 | Reassign to another active IT Staff user | 200, new owner stored | `staff-ticket-detail.api.test.ts` | Pass |
| API-54 | API | AC-33 | Release ownership with `ownerId: null` | 200, owner null | `staff-ticket-detail.api.test.ts` | Pass |
| API-55 | API | AC-33 | Assign to an inactive user, a Requester, and an unknown id | 400 in all three cases with a field message | `staff-ticket-detail.api.test.ts` | Pass |
| API-56 | API | AC-34 | Change IT Priority | 200, IT Priority changed, Requested Priority unchanged | `staff-ticket-detail.api.test.ts` | Pass |
| API-57 | API | AC-35 | One permitted transition from each non-terminal status | 200 in each case | `staff-ticket-detail.api.test.ts` | Pass |
| API-58 | API | AC-35 | One forbidden transition from each status, including out of Closed and Cancelled | 400 with `code: INVALID_TRANSITION`, the ticket unchanged when re-read | `staff-ticket-detail.api.test.ts` | Pass |
| API-59 | API | AC-36 | Move to Resolved without a resolution summary | 400 on `resolutionSummary` | `staff-ticket-detail.api.test.ts` | Pass |
| API-60 | API | AC-36 | Move to Resolved with a summary | 200, `resolvedAt` set | `staff-ticket-detail.api.test.ts` | Pass |
| API-61 | API | AC-35 | Resolved → Closed sets `closedAt`; Resolved → Reopened clears `resolvedAt` | Both 200 with the documented side effect | `staff-ticket-detail.api.test.ts` | Pass |
| API-62 | API | AC-35 | Empty PATCH body | 400 | `staff-ticket-detail.api.test.ts` | Pass |
| API-63 | API | AC-39 | Staff download of a Requester attachment, and of a removed one | 200 then 410 | `staff-ticket-detail.api.test.ts` | Pass |

### 2.8 API — Administrator user management, `server/tests/lab-03/users-admin.api.test.ts`

| Test ID | Type | AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| API-64 | API | AC-40 | List users | 200, sorted by name, no password material in any row | `users-admin.api.test.ts` | Pass |
| API-65 | API | AC-41 | Search by name fragment and by email fragment | Only matching users | `users-admin.api.test.ts` | Pass |
| API-66 | API | AC-41 | Role filter for each of the three roles | Only that role | `users-admin.api.test.ts` | Pass |
| API-67 | API | AC-41 | Unknown role value | 400 | `users-admin.api.test.ts` | Pass |
| API-68 | API | AC-42 | Create a user with one role and an initial password | 201, `mustChangePassword` true | `users-admin.api.test.ts` | Pass |
| API-69 | API | AC-42 | The created user logs in | 200 followed by the forced password change | `users-admin.api.test.ts` | Pass |
| API-70 | API | AC-43 | Create with an existing email, in a different letter case | 409 with `code: EMAIL_IN_USE` | `users-admin.api.test.ts` | Pass |
| API-71 | API | AC-42 | Create with an invalid role, a short name or a weak initial password | 400 with `fields` | `users-admin.api.test.ts` | Pass |
| API-72 | API | AC-44 | Edit name, email, role and activation state | 200, values stored | `users-admin.api.test.ts` | Pass |
| API-73 | API | AC-44 | Edit leaves the password untouched | The user can still log in with the old password | `users-admin.api.test.ts` | Pass |
| API-74 | API | AC-43 | Edit to an email already used by another user | 409 | `users-admin.api.test.ts` | Pass |
| API-75 | API | AC-45 | Administrator deactivates their own account | 400 with `code: SELF_DEACTIVATION` | `users-admin.api.test.ts` | Pass |
| API-76 | API | AC-46 | Deactivate the last active Administrator | 400 with `code: LAST_ADMINISTRATOR` | `users-admin.api.test.ts` | Pass |
| API-77 | API | AC-46 | Change the role of the last active Administrator | 400 with `code: LAST_ADMINISTRATOR` | `users-admin.api.test.ts` | Pass |
| API-78 | API | AC-46 | The same two operations while a second active Administrator exists | Both 200 | `users-admin.api.test.ts` | Pass |
| API-79 | API | AC-47 | Set a new initial password | 200, `mustChangePassword` true, old password now rejected, new one forces a change | `users-admin.api.test.ts` | Pass |
| API-80 | API | AC-47 | Setting a new initial password ends that user's existing sessions | Their previous cookie returns 401 | `users-admin.api.test.ts` | Pass |
| API-81 | API | AC-42 | Deactivated user attempts to log in | 403, "not active" | `users-admin.api.test.ts` | Pass |
| API-82 | API | AC-40 | Unknown user id on edit and on password set | 404 in both cases | `users-admin.api.test.ts` | Pass |

### 2.9 UI component — `client/tests/lab-03/`

| Test ID | Type | AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| UI-01 | UI | AC-03 | Login validation for an empty email and an empty password | Field messages, no request sent | `Login.test.tsx` | Pass |
| UI-02 | UI | AC-03 | Login failure from the API | One alert with the safe message, password field cleared | `Login.test.tsx` | Pass |
| UI-03 | UI | AC-05 | Login failure for an inactive account | The distinct "not active" message | `Login.test.tsx` | Pass |
| UI-04 | UI | AC-51 | Login busy state | Button disabled and labelled while in flight, so it cannot be submitted twice | `Login.test.tsx` | Pass |
| UI-05 | UI | AC-01 | Successful login for each role | Navigates to that role's landing screen | `Login.test.tsx` | Pass |
| UI-06 | UI | AC-50 | Password show/hide toggle | Input type flips, `aria-pressed` and the accessible name change | `Login.test.tsx` | Pass |
| UI-07 | UI | AC-09 | Change-password rules checklist | Each rule marks itself satisfied as the value is typed | `ChangePassword.test.tsx` | Pass |
| UI-08 | UI | AC-09 | Mismatched confirmation | Field message, no request sent | `ChangePassword.test.tsx` | Pass |
| UI-09 | UI | AC-09 | Server rejection of the current password | The message appears on the current-password field | `ChangePassword.test.tsx` | Pass |
| UI-10 | UI | AC-02 | A must-change user opening any other route | Redirected to the change-password screen | `ChangePassword.test.tsx` | Pass |
| UI-11 | UI | AC-10 | Successful change | Navigates into the application | `ChangePassword.test.tsx` | Pass |
| UI-12 | UI | AC-18 | Shell navigation for a Requester, IT Staff and an Administrator | Only the permitted destinations are rendered, in each case | `AppShell.role.test.tsx` | Pass |
| UI-13 | UI | AC-18 | Shell identity area | Name and role badge shown; no Development Requester text and no Change Requester button | `AppShell.role.test.tsx` | Pass |
| UI-14 | UI | AC-07 | Logout | Calls the logout endpoint and returns to the login screen | `AppShell.role.test.tsx` | Pass |
| UI-15 | UI | AC-18 | A role opening a route it may not use | Redirected to its own landing screen | `AppShell.role.test.tsx` | Pass |
| UI-16 | UI | AC-25 | Queue renders the documented columns and rows | All nine columns present | `StaffTicketQueue.test.tsx` | Pass |
| UI-17 | UI | AC-31 | Unassigned ticket row | Shows the Unassigned badge, not an empty cell | `StaffTicketQueue.test.tsx` | Pass |
| UI-18 | UI | AC-26 | Typing a search term | Requests the queue with the term and renders the filtered result | `StaffTicketQueue.test.tsx` | Pass |
| UI-19 | UI | AC-27 | Applying a status filter and an owner filter | Request carries the filter; paging resets to 1 | `StaffTicketQueue.test.tsx` | Pass |
| UI-20 | UI | AC-30 | Filter that matches nothing | No-results message with a Clear filters action, no empty table body | `StaffTicketQueue.test.tsx` | Pass |
| UI-21 | UI | AC-29 | Pagination controls | Next and Previous request the right page and are disabled at the ends | `StaffTicketQueue.test.tsx` | Pass |
| UI-22 | UI | AC-28 | Clicking a sortable header | Toggles direction and sets `aria-sort` | `StaffTicketQueue.test.tsx` | Pass |
| UI-23 | UI | AC-30 | Queue API failure | Safe failure callout with Retry; no raw error text | `StaffTicketQueue.test.tsx` | Pass |
| UI-24 | UI | AC-32 | Claim button on an unassigned ticket | Visible only while unassigned; sends the owner update | `StaffTicketDetail.test.tsx` | Pass |
| UI-25 | UI | AC-35 | Status select | Offers only the transitions permitted from the current status | `StaffTicketDetail.test.tsx` | Pass |
| UI-26 | UI | AC-36 | Choosing Resolved | Resolution summary becomes required; saving it empty shows a field message | `StaffTicketDetail.test.tsx` | Pass |
| UI-27 | UI | AC-35 | Choosing Closed or Cancelled | A confirmation dialog appears and cancelling it leaves the value unchanged | `StaffTicketDetail.test.tsx` | Pass |
| UI-28 | UI | AC-38 | Public Comments and Internal Notes areas | Distinct surfaces, and the notes area carries the "Not visible to the Requester" caption | `StaffTicketDetail.test.tsx` | Pass |
| UI-29 | UI | AC-37 | Posting a comment and a note | Each goes to its own endpoint and appears in its own thread | `StaffTicketDetail.test.tsx` | Pass |
| UI-30 | UI | AC-34 | IT Priority select | Sends the new value; the Requested Priority control is read-only | `StaffTicketDetail.test.tsx` | Pass |
| UI-31 | UI | AC-35 | Server rejection of a transition | Field message naming the current status; controls revert | `StaffTicketDetail.test.tsx` | Pass |
| UI-32 | UI | AC-21 | Requester ticket detail comment thread | Renders author, role badge, time and body; empty state when there are none | `RequesterComments.test.tsx` | Pass |
| UI-33 | UI | AC-22 | Posting a whitespace-only comment | Blocked with a field message, no request sent | `RequesterComments.test.tsx` | Pass |
| UI-34 | UI | AC-23 | The problem-appears-resolved action | Confirms, sends, then shows the success callout and no status change | `RequesterComments.test.tsx` | Pass |
| UI-35 | UI | AC-14 | Requester ticket detail | Contains no Internal Notes tab, section or text | `RequesterComments.test.tsx` | Pass |
| UI-36 | UI | AC-40 | User list | Name, Email, Role badge, Status badge and an Edit action per row | `UserManagement.test.tsx` | Pass |
| UI-37 | UI | AC-41 | Search and role filter | Request carries both; a no-results state renders | `UserManagement.test.tsx` | Pass |
| UI-38 | UI | AC-42 | Create User panel | Validates name, email, role and initial password before sending | `UserManagement.test.tsx` | Pass |
| UI-39 | UI | AC-43 | Duplicate email rejected by the API | The message appears on the email field | `UserManagement.test.tsx` | Pass |
| UI-40 | UI | AC-44 | Edit panel | Pre-filled, saves only the changed fields, shows the success callout | `UserManagement.test.tsx` | Pass |
| UI-41 | UI | AC-45 | Self-deactivation rejected by the API | Error callout above the panel actions | `UserManagement.test.tsx` | Pass |
| UI-42 | UI | AC-46 | Last-Administrator rejection | Error callout with the explanatory message | `UserManagement.test.tsx` | Pass |
| UI-43 | UI | AC-47 | Set new initial password | Confirms first, then shows the "must change at next login" reminder | `UserManagement.test.tsx` | Pass |
| UI-44 | UI | AC-51 | Save busy state on the panel | Button disabled and labelled while saving | `UserManagement.test.tsx` | Pass |

### 2.10 UI style — `client/tests/lab-03/zen-green.lab3.style.test.tsx`

| Test ID | Type | AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| STYLE-01 | STYLE | AC-49 | Lab 3 screens use only declared Zen Green tokens | No hard-coded hex value in the Lab 3 components | `zen-green.lab3.style.test.tsx` | Pass |
| STYLE-02 | STYLE | AC-38 | Internal Notes surface differs from the Public Comments surface | Different class and different declared background token | `zen-green.lab3.style.test.tsx` | Pass |
| STYLE-03 | STYLE | AC-49 | Read-only versus editable fields on IT Staff Ticket Detail | Read-only fields carry the read-only surface class | `zen-green.lab3.style.test.tsx` | Pass |
| STYLE-04 | STYLE | AC-49 | Role, status and priority badges | Every value renders a badge whose text is not colour-dependent | `zen-green.lab3.style.test.tsx` | Pass |
| STYLE-05 | STYLE | AC-50 | Validation message association | Every message is referenced by its field's `aria-describedby` | `zen-green.lab3.style.test.tsx` | Pass |

### 2.11 Responsive and end-to-end — `e2e/lab-03/`

| Test ID | Type | AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| RESP-01 | RESP | AC-48 | Login and change-password at 1280, 820 and 390 px | No horizontal page scroll, no element wider than its container | `responsive.spec.ts` | Pass |
| RESP-02 | RESP | AC-48 | Staff queue at the three widths | No overflow; the table becomes cards below 768 px | `responsive.spec.ts` | Pass |
| RESP-03 | RESP | AC-48 | Staff ticket detail at the three widths | No overflow; the tabs remain reachable | `responsive.spec.ts` | Pass |
| RESP-04 | RESP | AC-48 | User management at the three widths | No overflow; the side panel stacks below the list below 900 px | `responsive.spec.ts` | Pass |
| RESP-05 | RESP | AC-49 | Screenshot capture for all four screen groups at all three widths | Files written under `artifacts/lab-03/screenshots/` | `responsive.spec.ts` | Pass |
| E2E-01 | E2E | AC-01 | Sign in as an already-changed Requester and reach My Tickets | The ticket list renders for that identity | `authentication.spec.ts` | Pass |
| E2E-02 | E2E | AC-02 | Initial-password login and change | Normal application screens open only after a valid new password is saved | `authentication.spec.ts` | Pass |
| E2E-03 | E2E | AC-03 | Invalid login | The safe message is shown and the application is not reachable | `authentication.spec.ts` | Pass |
| E2E-04 | E2E | AC-05 | Inactive account login | The "not active" message is shown | `authentication.spec.ts` | Pass |
| E2E-05 | E2E | AC-07 | Logout, then navigating directly to an application URL | Returns to the login screen | `authentication.spec.ts` | Pass |
| E2E-06 | E2E | AC-18 | Signing in as each of the three roles | Each sees only its own navigation | `authentication.spec.ts` | Pass |
| E2E-07 | E2E | AC-25 | IT Staff opens the queue, searches, filters and pages | The expected tickets are listed at each step | `staff-ticket-flow.spec.ts` | Pass |
| E2E-08 | E2E | AC-32 | IT Staff claims a ticket from the detail screen | The queue then shows that staff member as the owner | `staff-ticket-flow.spec.ts` | Pass |
| E2E-09 | E2E | AC-35 | IT Staff sets IT Priority and moves the ticket New → In Progress → Resolved with a summary | Each change is persisted and visible after a reload | `staff-ticket-flow.spec.ts` | Pass |
| E2E-10 | E2E | AC-37 | IT Staff posts a Public Comment and an Internal Note; the Requester then opens the ticket | The Requester sees the comment and no note anywhere on the page | `staff-ticket-flow.spec.ts` | Pass |
| E2E-11 | E2E | AC-23 | Requester uses the problem-appears-resolved action | IT Staff sees the indication on the queue and the status is unchanged | `staff-ticket-flow.spec.ts` | Pass |
| E2E-12 | E2E | AC-40 | Administrator opens User Management, searches and filters by role | The expected users are listed | `user-administration.spec.ts` | Pass |
| E2E-13 | E2E | AC-42 | Administrator creates a user, who then signs in | The new user is forced through the password change and lands on their role's screen | `user-administration.spec.ts` | Pass |
| E2E-14 | E2E | AC-43 | Administrator creates a user with a duplicate email | The conflict message is shown on the email field | `user-administration.spec.ts` | Pass |
| E2E-15 | E2E | AC-44 | Administrator edits a user and deactivates another account | The list reflects both changes | `user-administration.spec.ts` | Pass |
| E2E-16 | E2E | AC-45 | Administrator attempts to deactivate their own account | The rejection message is shown and the account stays active | `user-administration.spec.ts` | Pass |
| E2E-17 | E2E | AC-47 | Administrator sets a new initial password and that user signs in | The password change is demanded before anything else | `user-administration.spec.ts` | Pass |
| E2E-18 | E2E | AC-15 | A Requester navigates directly to a staff URL and an administration URL | Neither screen opens | `user-administration.spec.ts` | Pass |

## 3. Acceptance-Criterion Traceability

Every acceptance criterion in specification.md §9 maps to at least one planned test.

| AC | Tests |
|---|---|
| AC-01 | API-01, API-05, U-07, UI-05, E2E-01 |
| AC-02 | API-11, API-12, UI-10, E2E-02 |
| AC-03 | API-02, API-17, UI-01, UI-02, E2E-03 |
| AC-04 | API-03 |
| AC-05 | API-04, UI-03, E2E-04 |
| AC-06 | API-06 |
| AC-07 | API-08, UI-14, E2E-05 |
| AC-08 | API-09 |
| AC-09 | U-01, U-02, U-03, U-04, U-05, U-06, API-14, API-15, UI-07, UI-08, UI-09 |
| AC-10 | API-13, API-16, UI-11 |
| AC-11 | API-10 |
| AC-12 | API-07, API-18 |
| AC-13 | API-23 |
| AC-14 | API-20, UI-35 |
| AC-15 | API-19, E2E-18 |
| AC-16 | API-21, API-22 |
| AC-17 | API-24, API-25, API-30 |
| AC-18 | UI-12, UI-13, UI-15, E2E-06 |
| AC-19 | REG-01, REG-04, REG-07, API-26 |
| AC-20 | REG-02, REG-03 |
| AC-21 | API-28, API-34, UI-32 |
| AC-22 | U-16, API-29, UI-33 |
| AC-23 | API-35, API-36, API-37, API-38, UI-34, E2E-11 |
| AC-24 | REG-06 |
| AC-25 | API-27, API-39, API-50, API-51, UI-16, E2E-07 |
| AC-26 | API-40, API-41, UI-18 |
| AC-27 | U-14, U-15, API-42, API-43, API-44, API-47, UI-19 |
| AC-28 | U-12, API-45, API-46, UI-22 |
| AC-29 | U-13, API-48, API-49, UI-21 |
| AC-30 | UI-20, UI-23 |
| AC-31 | UI-17 |
| AC-32 | API-52, UI-24, E2E-08 |
| AC-33 | API-53, API-54, API-55 |
| AC-34 | API-56, UI-30 |
| AC-35 | U-08, U-09, U-10, API-57, API-58, API-61, API-62, UI-25, UI-27, UI-31, E2E-09 |
| AC-36 | U-11, API-59, API-60, UI-26 |
| AC-37 | API-31, API-32, API-33, UI-29, E2E-10 |
| AC-38 | UI-28, STYLE-02 |
| AC-39 | REG-05, API-63 |
| AC-40 | U-17, API-64, API-82, UI-36, E2E-12 |
| AC-41 | API-65, API-66, API-67, UI-37 |
| AC-42 | API-68, API-69, API-71, API-81, UI-38, E2E-13 |
| AC-43 | API-70, API-74, UI-39, E2E-14 |
| AC-44 | API-72, API-73, UI-40, E2E-15 |
| AC-45 | API-75, UI-41, E2E-16 |
| AC-46 | API-76, API-77, API-78, UI-42 |
| AC-47 | API-79, API-80, UI-43, E2E-17 |
| AC-48 | RESP-01, RESP-02, RESP-03, RESP-04 |
| AC-49 | STYLE-01, STYLE-03, STYLE-04, RESP-05 |
| AC-50 | STYLE-05, UI-06 |
| AC-51 | UI-04, UI-44 |

Planned totals: 17 unit, 82 API, 7 migration and regression, 44 UI component, 5 UI style, 5
responsive and 18 end-to-end — **178 planned Lab 3 tests**, on top of the 140 Lab 2 tests that continue to run.

## 4. Responsive and Visual Checklist

Performed at 1280, 820 and 390 px on Login, Change Password, My Tickets, Requester Ticket Detail,
Ticket Queue, IT Staff Ticket Detail and User Management. The width checks are executed by
`e2e/lab-03/responsive.spec.ts`, which fails the run rather than relying on someone looking; the
screenshots it writes are in `artifacts/lab-03/screenshots/`.

| # | Check | Result | How it was checked |
|---|---|---|---|
| 1 | No horizontal page scroll at any width | Pass | `expectNoHorizontalScroll` on every screen, at all three widths |
| 2 | No element wider than the viewport | Pass | `expectNothingWiderThanTheViewport`; elements inside a deliberate `.zg-table-wrap` scroller are exempt, which is the Lab 2 rule |
| 3 | Tables clip inside their card and scroll inside their wrapper | Pass | Queue and user tables at 820 px |
| 4 | Queue and user tables become cards below 768 px | Pass | Asserted both ways: table visible ⇔ width ≥ 768 |
| 5 | Internal Notes are unmistakably distinct from Public Comments | Pass | STYLE-02 plus the `staff-ticket-detail/*-internal-notes.png` captures |
| 6 | User Management panel stacks below the list under 900 px | Pass | `gridTemplateColumns` asserted to be one column at 820 and 390 px |
| 7 | Read-only and editable fields stay distinguishable | Pass | STYLE-03 |
| 8 | Role, status and priority badges readable without colour | Pass | STYLE-04 |
| 9 | Validation messages sit with their field | Pass | STYLE-05 |
| 10 | Login and change-password cards fit a 390 px screen | Pass | RESP-01, including the failure state with its alert |
| 11 | The three conversation tabs stay reachable at every width | Pass | RESP-03 clicks all three at 1280, 820 and 390 px |

## 5. Test Commands

```bash
# unit + API + regression (requires PostgreSQL running, migrated and seeded)
cd server && npm test

# UI component + style
cd client && npm test

# responsive + end-to-end (starts both servers itself)
npx playwright test
```

## 6. Final Results

Every suite was run from a clean checkout of `feature/lab3-8-e2e-docs` against a migrated and seeded
PostgreSQL database, in the order below.

| Suite | Command | Result |
|---|---|---|
| Unit, API, migration and regression | `cd server && npm test` | **244 passed**, 0 failed |
| UI component and UI style | `cd client && npm test` | **133 passed**, 0 failed |
| Responsive and end-to-end | `npx playwright test` | **43 passed**, 0 failed |

**420 automated tests pass**, of which 286 are Lab 3's own:

| Layer | Lab 3 tests | Files |
|---|---|---|
| Unit | 53 | `password`, `transitions`, `content`, `staff-query`, `user-validation` |
| API, authorization and regression | 121 | `auth`, `authorization`, `requester-regression`, `comments-notes`, `staff-queue`, `staff-ticket-detail`, `users-admin` |
| UI component | 71 | `Login`, `ChangePassword`, `AppShell.role`, `StaffTicketQueue`, `StaffTicketDetail`, `RequesterComments`, `UserManagement` |
| UI style | 8 | `zen-green.lab3.style` |
| Responsive | 15 | `responsive.spec.ts` (5 checks × 3 widths) |
| End-to-end | 18 | `authentication`, `staff-ticket-flow`, `user-administration` |

The remaining 134 are the Lab 1 and Lab 2 suites, which still run as regression evidence (BR-62). The
two Lab 2 end-to-end specs were updated in Issue 8 for one reason only: the Development Requester
selector they opened with no longer exists (BR-61), so they sign in instead. Every assertion they
make about Lab 2 behaviour is unchanged.

### Notes from the run

- **Server test files run one at a time** (`fileParallelism: false`). They share one database, and
  the Administrator suite must change global state to test "at least one active Administrator must
  remain"; in parallel that state was visible to other suites and broke them.
- **Playwright cleans up after itself.** The suites create throwaway accounts through the
  Administrator API. The product deactivates rather than deletes users (BR-54), which is right for a
  real account but would fill the demonstration list with test rows, so a global teardown removes
  them from the database. Accounts that ended up owning ticket history are left deactivated instead.
- The end-to-end tickets each run creates are kept. They are the evidence that the workflow ran.
- Lab 2's own screenshots under `artifacts/lab-02/` are its submitted evidence and are unchanged. The
  Lab 2 responsive spec now runs against the Lab 3 application, so its captures are written to
  `artifacts/lab-03/screenshots/lab-02-regression/` instead.

### Screenshot evidence

51 full-page captures under `artifacts/lab-03/screenshots/`, every screen at 1280, 820 and 390 px:

| Folder | Captures |
|---|---|
| `authentication/` | login, login failure, mandatory change password |
| `staff-queue/` | the list, and the no-results state |
| `staff-ticket-detail/` | the detail screen, and the Internal Notes tab |
| `user-management/` | the list, and the create panel |
| `requester/` | My Tickets, and Ticket Detail with its comment thread |
| `lab-02-regression/` | the Lab 2 screens under Lab 3 authentication |

## 7. Known Limitations and Deferred Tests

- Actions Taken by IT Staff are excluded from Lab 3, so no test covers a resolution blocked by
  incomplete Actions Taken; that rule arrives in Lab 4.
- Password-reset email, multi-factor authentication and single sign-on are excluded, so no test
  covers them.
- Session expiry is tested by writing an expired `expiresAt` directly, rather than by waiting eight
  hours.
- Concurrency (two staff members editing one ticket at the same moment) is not covered; Lab 3 has no
  optimistic-locking requirement.
