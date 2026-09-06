# Lab 2 Test Plan and Results

Companion to [specification.md](specification.md), [api-spec.md](api-spec.md), and
[ui-spec.md](ui-spec.md). This plan was written **before** implementation, from the acceptance
criteria, and is the evidence contract for the sprint: an Issue is not done until its planned tests
exist, run, and pass.

**Status legend:** `Planned` → written before code · `Failing` → red for the expected reason (TDD) ·
`Pass` → green in the final `main` branch.

---

## 1. Test Strategy

| Level | Tool | What it proves | Where |
|---|---|---|---|
| Unit | Vitest | Pure logic: ticket-number format, validation rules, query-parameter parsing, file-type and size guards | `server/tests/lab-02/*.unit.test.ts` |
| API / integration | Vitest + Supertest against real PostgreSQL | Contract in `api-spec.md`: status codes, shapes, validation, ownership, pagination, attachment lifecycle | `server/tests/lab-02/*.api.test.ts` |
| UI component | Vitest + Testing Library | Screen behaviour and states with the API layer mocked | `client/tests/lab-02/*.test.tsx` |
| UI style | Vitest + Testing Library | Required classes, read-only vs editable styling, asterisks, message placement, busy/disabled buttons | `client/tests/lab-02/zen-green.style.test.tsx` |
| Responsive | Playwright | Layout at desktop / tablet / mobile, no horizontal overflow, screenshot capture | `e2e/lab-02/responsive.spec.ts` |
| E2E | Playwright against the running stack | The whole requester journey through a real database | `e2e/lab-02/requester-ticket-flow.spec.ts` |

TDD order per Issue: write the planned API tests first and confirm they fail for the expected reason,
implement the smallest correct behaviour, then add the UI tests, then refactor while green.

Test data: API tests run against the seeded database and create their own tickets inside each test
file, cleaning up what they create. Requester identity is supplied with the `X-Requester-Id` header,
exactly as the client does.

## 2. Planned Tests

### 2.1 Unit

| Test ID | Requirement / AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|
| UNIT-01 | BR-01 | Ticket-number generator format | Returns `TKT-<YYYY>-<6 digits>` for a given year and id | `server/tests/lab-02/ticket-number.unit.test.ts` | Pass |
| UNIT-02 | BR-01 | Ticket-number padding boundary | id 1 → `...-000001`; id 123456 → `...-123456` | `server/tests/lab-02/ticket-number.unit.test.ts` | Pass |
| UNIT-03 | BR-15, AC-10 | Summary/description length and trimming | Whitespace-only fails; 9 chars fails; 10 chars passes; 121 chars fails | `server/tests/lab-02/validation.unit.test.ts` | Pass |
| UNIT-04 | BR-16 | Priority enum guard | Unknown priority rejected; the four valid values accepted | `server/tests/lab-02/validation.unit.test.ts` | Pass |
| UNIT-05 | BR-24, BR-25 | Query-parameter parsing | `pageSize=7` rejected; `pageSize=20` accepted; defaults applied when absent | `server/tests/lab-02/query.unit.test.ts` | Pass |
| UNIT-06 | BR-31, BR-32 | Attachment guard | `.exe` rejected, mismatched MIME rejected, 5 MB + 1 byte rejected, exactly 5 MB accepted | `server/tests/lab-02/attachment-rules.unit.test.ts` | Pass |
| UNIT-07 | BR-35 | Safe stored filename | Generated name is a UUID + validated extension and contains no path separators from the original name | `server/tests/lab-02/attachment-rules.unit.test.ts` | Pass |

### 2.2 API

| Test ID | Requirement / AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|
| API-01 | AC-07, AC-08 | Create valid ticket | `201`; one ticket saved; `ticketNumber` returned; `status` `NEW`; `requesterId` matches the header | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-02 | AC-10, BR-17 | Create with invalid fields | `400` with one `fields` entry per offending field; nothing saved | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-03 | BR-16 | Create with inactive/unknown category | `400` naming `categoryId` | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-04 | AC-13, BR-19 | Duplicate submission | Second identical create within 60 s → `409`; exactly one ticket exists | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-05 | BR-01 | Ticket numbers unique across creates | 3 sequential creates produce 3 distinct numbers | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-06 | §1.1 of api-spec | Missing `X-Requester-Id` | `400` naming the header; no ticket created | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-07 | AC-16, BR-14 | Owned list only | Requester A's list excludes Requester B's tickets and carries `page`, `pageSize`, `totalItems`, `totalPages` | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-08 | AC-17, BR-21 | Search | Case-insensitive substring of summary and of ticket number both match | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-09 | AC-18, BR-22 | Filters | Category, related system, priority, and status filters each narrow the list; combined filters AND together | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-10 | AC-19, BR-23 | Sorting | `sort=createdAt&order=asc` reverses the default order; secondary `id desc` keeps ties deterministic | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-11 | AC-20, BR-24 | Pagination | `page=2&pageSize=5` returns the next 5 items and correct metadata | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-12 | AC-21, BR-25 | Invalid query parameter | `pageSize=7` and an unknown parameter each return `400` naming the parameter | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-13 | BR-27 | Page past the end | `200` with `items: []` and correct metadata | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-14 | AC-22 | Empty list | A requester with no tickets gets `200`, `items: []`, `totalItems: 0` | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-15 | AC-25 | Owned detail | `200` with full ticket information and its attachments | `server/tests/lab-02/ticket-detail.api.test.ts` | Pass |
| API-16 | AC-26, BR-13 | Cross-requester detail | Requester B requesting Requester A's ticket gets `404` and no ticket data | `server/tests/lab-02/ticket-detail.api.test.ts` | Pass |
| API-17 | §3.3 of api-spec | Non-integer id | `400` "Invalid ticket id" | `server/tests/lab-02/ticket-detail.api.test.ts` | Pass |
| API-18 | AC-27, BR-34 | Upload permitted file | `201`; metadata stored (original name, MIME, size, uploader, timestamp); state `ACTIVE` | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-19 | AC-14, BR-31 | Unsupported type | `.exe` upload → `415`; nothing stored | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-20 | AC-14, BR-32 | Oversized file | 5 MB + 1 byte → `413`; nothing stored | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-21 | AC-28, BR-33 | Active limit | Sixth active upload → `409`; the five existing stay untouched | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-22 | AC-29 | Download active | `200`, correct content type and original filename in `Content-Disposition` | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-23 | AC-30, BR-36 | Soft removal | `200`; row retained with `removedAt`, `removalReason`, `removedBy`; still listed as `REMOVED` | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-24 | AC-31, BR-39 | Download removed | `410`; no file content | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-25 | AC-32, BR-40 | Remove twice | Second removal → `409` | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-26 | AC-34, BR-37 | Reason validation | Reason shorter than 3 chars → `400`; attachment stays active | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-27 | AC-33, BR-38 | Cross-requester attachment | Download and removal of another requester's attachment → `404` | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-28 | BR-33 | Removed files free a slot | After removing one of five, a new upload succeeds | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-29 | AC-02, BR-06 | Active requesters only | `GET /api/requesters` excludes the inactive requester | `server/tests/lab-02/reference.api.test.ts` | Pass |
| API-30 | AC-15, FR-03 | Reference data | Categories and related systems come from the database; ≥ 4 categories and ≥ 6 related systems, active only | `server/tests/lab-02/reference.api.test.ts` | Pass |
| API-31 | BR-28 | Safe errors | A forced failure returns a generic message with no stack trace, SQL, or path | `server/tests/lab-02/reference.api.test.ts` | Pass |

### 2.3 UI component

| Test ID | Requirement / AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|
| UI-01 | AC-02, AC-06, AC-05 | Requester selection states | Active requesters listed, inactive absent; empty and failure states render with Retry | `client/tests/lab-02/RequesterSelection.test.tsx` | Pass |
| UI-02 | AC-01, BR-09 | Guard | Rendering a ticket screen with no selection shows the selection screen | `client/tests/lab-02/RequesterSelection.test.tsx` | Pass |
| UI-03 | AC-03, AC-04 | Shell identity and switching | Selected name shown; Change Requester clears state and triggers a reload | `client/tests/lab-02/AppShell.test.tsx` | Pass |
| UI-04 | AC-09, AC-37 | Submit without Summary | Field-level message below Summary; create API not called | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-05 | AC-11 | Busy submit | Submit is disabled and shows a busy label while the request is in flight | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-06 | AC-07 | Success state | Official ticket number from the API is displayed with the next action | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-07 | AC-12, BR-20 | Failure preserves input | After a failed create, every entered value and the selected file are still present | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-08 | AC-15 | Reference data rendered | Category and related system options come from the mocked API, none hard-coded | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-09 | AC-14 | Invalid attachment | Oversized and wrong-type selections show per-file messages; valid selections remain | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-10 | AC-16 | List renders | Tickets and pagination metadata render from the API response | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-11 | AC-17, AC-18 | Search and filter | Typing a search term and choosing a filter issue the documented query parameters | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-12 | AC-19, AC-20 | Sort and page | Changing sort and page re-requests with the right parameters and reflects the current page | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-13 | AC-22, AC-23, BR-30 | Empty vs no-results | Distinct copy; no-results offers Clear filters | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-14 | AC-24 | List failure | Safe failure state with Retry | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-15 | AC-25 | Read-only detail | All ticket header values render read-only; no editable header control exists | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Pass |
| UI-16 | AC-26 | Detail failure | A `404` from the detail endpoint shows a not-found state, not ticket data | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Pass |
| UI-17 | AC-27 | Add attachment | A successful upload appears in the list as Active with its metadata | `client/tests/lab-02/AttachmentSection.test.tsx` | Pass |
| UI-18 | AC-28 | Limit reached | With five active attachments, Add is disabled and explains why | `client/tests/lab-02/AttachmentSection.test.tsx` | Pass |
| UI-19 | AC-30, AC-34 | Removal dialog | Remove requires confirmation and a reason; a too-short reason is blocked | `client/tests/lab-02/AttachmentSection.test.tsx` | Pass |
| UI-20 | AC-31, BR-39 | Removed presentation | Removed attachment shows reason and date, and its download control is disabled | `client/tests/lab-02/AttachmentSection.test.tsx` | Pass |

### 2.4 UI style

| Test ID | Requirement / AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|
| STYLE-01 | AC-36 | Read-only vs editable | Read-only fields carry the read-only class/attribute; editable ones do not | `client/tests/lab-02/zen-green.style.test.tsx` | Pass |
| STYLE-02 | AC-37, §4 | Required marker and message placement | Every required label has an asterisk and the message renders in the field's own message slot | `client/tests/lab-02/zen-green.style.test.tsx` | Pass |
| STYLE-03 | §5 | Button hierarchy | Primary, secondary, tertiary and destructive buttons use their documented classes; disabled buttons are not activatable | `client/tests/lab-02/zen-green.style.test.tsx` | Pass |
| STYLE-04 | AC-38 | Badges | Priority and status badges expose their value as text, not colour alone | `client/tests/lab-02/zen-green.style.test.tsx` | Pass |
| STYLE-05 | AC-39, AC-40 | Accessibility hooks | Icon-only controls have accessible names; invalid fields set `aria-invalid` and `aria-describedby` | `client/tests/lab-02/zen-green.style.test.tsx` | Pass |

### 2.5 Responsive and E2E

| Test ID | Requirement / AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|
| RESP-01 | AC-35, §9 | Desktop 1280×800 | Create Ticket, My Tickets and Ticket Detail render with no horizontal page scroll; screenshots captured | `e2e/lab-02/responsive.spec.ts` | Pass |
| RESP-02 | AC-35, §9 | Tablet 820×1180 | Two-column where specified; no clipping or overlap; screenshots captured | `e2e/lab-02/responsive.spec.ts` | Pass |
| RESP-03 | AC-35, §9 | Mobile 390×844 | Fields stack, table becomes cards, touch targets ≥ 44 px, no horizontal scroll; screenshots captured | `e2e/lab-02/responsive.spec.ts` | Pass |
| E2E-01 | AC-01, AC-03, AC-07 | Select requester → create ticket | Confirmation shows the official ticket number generated by the backend | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pass |
| E2E-02 | AC-16, AC-25 | Find and open the new ticket | The created ticket appears in My Tickets and its detail screen opens | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pass |
| E2E-03 | AC-27, AC-29, AC-30, AC-31 | Attachment lifecycle | Upload, download, soft-remove with a reason; removed metadata stays, download blocked | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pass |
| E2E-04 | AC-04, AC-26 | Requester switching and isolation | After switching to Requester B, Requester A's tickets are gone and direct access to A's ticket is rejected | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pass |

## 3. Acceptance-Criterion Traceability

| AC | Covered by |
|---|---|
| AC-01 | UI-02, E2E-01 |
| AC-02 | API-29, UI-01 |
| AC-03 | UI-03, E2E-01 |
| AC-04 | UI-03, E2E-04 |
| AC-05 | UI-01 |
| AC-06 | UI-01 |
| AC-07 | API-01, UI-06, E2E-01 |
| AC-08 | API-01 |
| AC-09 | UI-04 |
| AC-10 | UNIT-03, API-02 |
| AC-11 | UI-05 |
| AC-12 | UI-07 |
| AC-13 | API-04 |
| AC-14 | UNIT-06, API-19, API-20, UI-09 |
| AC-15 | API-30, UI-08 |
| AC-16 | API-07, UI-10, E2E-02 |
| AC-17 | API-08, UI-11 |
| AC-18 | API-09, UI-11 |
| AC-19 | API-10, UI-12 |
| AC-20 | API-11, UI-12 |
| AC-21 | UNIT-05, API-12 |
| AC-22 | API-14, UI-13 |
| AC-23 | UI-13 |
| AC-24 | UI-14 |
| AC-25 | API-15, UI-15, E2E-02 |
| AC-26 | API-16, UI-16, E2E-04 |
| AC-27 | API-18, UI-17, E2E-03 |
| AC-28 | API-21, UI-18 |
| AC-29 | API-22, E2E-03 |
| AC-30 | API-23, UI-19, E2E-03 |
| AC-31 | API-24, UI-20, E2E-03 |
| AC-32 | API-25 |
| AC-33 | API-27 |
| AC-34 | API-26, UI-19 |
| AC-35 | RESP-01, RESP-02, RESP-03 |
| AC-36 | STYLE-01 |
| AC-37 | STYLE-02, UI-04 |
| AC-38 | STYLE-04 |
| AC-39 | STYLE-05, RESP-01 |
| AC-40 | STYLE-05 |

Every AC has at least one planned test, and every planned test names a real intended file path.

## 4. Responsive and Visual Checklist

The V-01…V-12 checklist in [ui-spec.md](ui-spec.md) §11 is filled in from the Playwright screenshots
listed in ui-spec.md §12, at desktop, tablet, and mobile. It is completed in Issue 7 and reproduced in
§6 of this document with the final marks.

## 5. Test Commands

```bash
# unit + API (requires PostgreSQL running, migrated and seeded)
cd server && npm test

# UI component + style
cd client && npm test

# responsive + E2E (requires the API and the client dev server running)
npx playwright test
```

## 6. Final Results

All three suites pass on the final `main` branch. Totals: **140 automated tests** — 73 server
(unit + API), 57 client (UI + UI style), 10 Playwright (responsive + E2E). No test is skipped,
disabled, `.only`-focused, or commented out.

| Suite | Command | Result |
|---|---|---|
| Unit + API | `cd server && npm test` | 11 files, 73 tests passed |
| UI component + style | `cd client && npm test` | 8 files, 57 tests passed |
| Responsive + E2E | `npx playwright test` | 10 tests passed |

### Server — unit and API

```
> toktickit-server@1.0.0 test
> vitest run
 RUN  v2.1.9 /Users/tnnntst/Developer/GitHub/toktickit/server
 ✓ tests/lab-02/create-ticket.api.test.ts (11 tests) 232ms
 ✓ tests/lab-02/attachment-rules.unit.test.ts (8 tests) 3ms
 ✓ tests/lab-02/reference.api.test.ts (5 tests) 95ms
 ✓ tests/lab-02/attachments.api.test.ts (16 tests) 408ms
 ✓ tests/lab-02/ticket-number.unit.test.ts (3 tests) 1ms
 ✓ tests/lab-02/query.unit.test.ts (6 tests) 2ms
 ✓ tests/lab-01/health.test.ts (1 test) 11ms
 ✓ tests/lab-02/ticket-detail.api.test.ts (5 tests) 85ms
 ✓ tests/lab-01/categories.test.ts (1 test) 33ms
 ✓ tests/lab-02/validation.unit.test.ts (7 tests) 2ms
 ✓ tests/lab-02/my-tickets.api.test.ts (10 tests) 144ms
 Test Files  11 passed (11)
      Tests  73 passed (73)
   Start at  00:21:12
   Duration  3.64s (transform 131ms, setup 0ms, collect 830ms, tests 1.02s, environment 2ms, prepare 390ms)
```

### Client — UI component and UI style

```
✓ tests/lab-01/App.test.tsx (3 tests) 140ms
 ✓ tests/lab-02/zen-green.style.test.tsx (5 tests) 775ms
   ✓ Zen Green form styling > uses the documented button hierarchy and disables the busy submit 541ms
 ✓ tests/lab-02/RequesterTicketDetail.test.tsx (5 tests) 227ms
 ✓ tests/lab-02/AttachmentSection.test.tsx (10 tests) 497ms
 ✓ tests/lab-02/RequesterSelection.test.tsx (7 tests) 168ms
 ✓ tests/lab-02/AppShell.test.tsx (4 tests) 219ms
 ✓ tests/lab-02/MyTickets.test.tsx (9 tests) 698ms
   ✓ My Tickets > sends a search parameter after typing, without a request per keystroke 394ms
 ✓ tests/lab-02/CreateTicket.test.tsx (14 tests) 3406ms
   ✓ Create Ticket > shows a field-level message and sends no request when Summary is empty 494ms
   ✓ Create Ticket > disables Submit and shows a busy label while the request is in flight 559ms
   ✓ Create Ticket > shows the ticket number returned by the backend and a next action 340ms
   ✓ Create Ticket > sends the trimmed values the API contract expects 301ms
 Test Files  8 passed (8)
      Tests  57 passed (57)
   Start at  00:21:17
   Duration  4.55s (transform 227ms, setup 389ms, collect 1.16s, tests 6.13s, environment 2.47s, prepare 393ms)
```

### Playwright — responsive and end-to-end

```
Running 10 tests using 1 worker

  ✓   1 e2e/lab-02/requester-ticket-flow.spec.ts:43:7 › Requester ticket flow › selects a Development Requester and creates a ticket with a backend ticket number (432ms)
  ✓   2 e2e/lab-02/requester-ticket-flow.spec.ts:68:7 › Requester ticket flow › finds the new ticket in My Tickets and opens its detail screen (260ms)
  ✓   3 e2e/lab-02/requester-ticket-flow.spec.ts:83:7 › Requester ticket flow › uploads, downloads, and soft-removes an attachment (526ms)
  ✓   4 e2e/lab-02/requester-ticket-flow.spec.ts:115:7 › Requester ticket flow › hides the ticket from another Requester, including by direct URL (1.2s)
  ✓   5 e2e/lab-02/responsive.spec.ts:39:9 › desktop (1280x800) › renders every Lab 2 screen without clipping or horizontal scrolling (1.5s)
  ✓   6 e2e/lab-02/responsive.spec.ts:88:9 › desktop (1280x800) › keeps controls readable and touch-friendly (203ms)
  ✓   7 e2e/lab-02/responsive.spec.ts:39:9 › tablet (820x1180) › renders every Lab 2 screen without clipping or horizontal scrolling (1.4s)
  ✓   8 e2e/lab-02/responsive.spec.ts:88:9 › tablet (820x1180) › keeps controls readable and touch-friendly (227ms)
  ✓   9 e2e/lab-02/responsive.spec.ts:39:9 › mobile (390x844) › renders every Lab 2 screen without clipping or horizontal scrolling (1.4s)
  ✓  10 e2e/lab-02/responsive.spec.ts:88:9 › mobile (390x844) › keeps controls readable and touch-friendly (196ms)

  10 passed (7.9s)
```

### Visual checklist

V-01 … V-12 in [ui-spec.md](ui-spec.md) §11 are complete at all three viewports, against the 18
screenshots in `artifacts/lab-02/screenshots/`. The inspection found and fixed two real layout
defects, recorded in the same section.

## 7. Known Limitations and Deferred Tests

- Identity is a header, so no authentication or authorization tests exist; ownership tests prove only
  that the backend honours the selected identity (BR-05, deferred to Lab 3).
- Concurrency is not tested: two simultaneous creates racing for the same ticket number are prevented
  by the unique constraint, but no parallel-request test is planned in Lab 2.
- Object storage, virus scanning, and image thumbnailing are out of scope; attachment tests cover the
  local filesystem strategy only (D-04).
- Visual regression is checklist-based, not pixel-diff based: screenshots are captured and reviewed
  against `ui-spec.md`, with no baseline comparison tooling in Lab 2.
