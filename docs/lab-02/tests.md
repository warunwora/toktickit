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
| UNIT-01 | BR-01 | Ticket-number generator format | Returns `TKT-<YYYY>-<6 digits>` for a given year and id | `server/tests/lab-02/ticket-number.unit.test.ts` | Planned |
| UNIT-02 | BR-01 | Ticket-number padding boundary | id 1 → `...-000001`; id 123456 → `...-123456` | `server/tests/lab-02/ticket-number.unit.test.ts` | Planned |
| UNIT-03 | BR-15, AC-10 | Summary/description length and trimming | Whitespace-only fails; 9 chars fails; 10 chars passes; 121 chars fails | `server/tests/lab-02/validation.unit.test.ts` | Planned |
| UNIT-04 | BR-16 | Priority enum guard | Unknown priority rejected; the four valid values accepted | `server/tests/lab-02/validation.unit.test.ts` | Planned |
| UNIT-05 | BR-24, BR-25 | Query-parameter parsing | `pageSize=7` rejected; `pageSize=20` accepted; defaults applied when absent | `server/tests/lab-02/query.unit.test.ts` | Planned |
| UNIT-06 | BR-31, BR-32 | Attachment guard | `.exe` rejected, mismatched MIME rejected, 5 MB + 1 byte rejected, exactly 5 MB accepted | `server/tests/lab-02/attachment-rules.unit.test.ts` | Planned |
| UNIT-07 | BR-35 | Safe stored filename | Generated name is a UUID + validated extension and contains no path separators from the original name | `server/tests/lab-02/attachment-rules.unit.test.ts` | Planned |

### 2.2 API

| Test ID | Requirement / AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|
| API-01 | AC-07, AC-08 | Create valid ticket | `201`; one ticket saved; `ticketNumber` returned; `status` `NEW`; `requesterId` matches the header | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-02 | AC-10, BR-17 | Create with invalid fields | `400` with one `fields` entry per offending field; nothing saved | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-03 | BR-16 | Create with inactive/unknown category | `400` naming `categoryId` | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-04 | AC-13, BR-19 | Duplicate submission | Second identical create within 60 s → `409`; exactly one ticket exists | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-05 | BR-01 | Ticket numbers unique across creates | 3 sequential creates produce 3 distinct numbers | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-06 | §1.1 of api-spec | Missing `X-Requester-Id` | `400` naming the header; no ticket created | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-07 | AC-16, BR-14 | Owned list only | Requester A's list excludes Requester B's tickets and carries `page`, `pageSize`, `totalItems`, `totalPages` | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-08 | AC-17, BR-21 | Search | Case-insensitive substring of summary and of ticket number both match | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-09 | AC-18, BR-22 | Filters | Category, related system, priority, and status filters each narrow the list; combined filters AND together | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-10 | AC-19, BR-23 | Sorting | `sort=createdAt&order=asc` reverses the default order; secondary `id desc` keeps ties deterministic | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-11 | AC-20, BR-24 | Pagination | `page=2&pageSize=5` returns the next 5 items and correct metadata | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-12 | AC-21, BR-25 | Invalid query parameter | `pageSize=7` and an unknown parameter each return `400` naming the parameter | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-13 | BR-27 | Page past the end | `200` with `items: []` and correct metadata | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-14 | AC-22 | Empty list | A requester with no tickets gets `200`, `items: []`, `totalItems: 0` | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-15 | AC-25 | Owned detail | `200` with full ticket information and its attachments | `server/tests/lab-02/ticket-detail.api.test.ts` | Planned |
| API-16 | AC-26, BR-13 | Cross-requester detail | Requester B requesting Requester A's ticket gets `404` and no ticket data | `server/tests/lab-02/ticket-detail.api.test.ts` | Planned |
| API-17 | §3.3 of api-spec | Non-integer id | `400` "Invalid ticket id" | `server/tests/lab-02/ticket-detail.api.test.ts` | Planned |
| API-18 | AC-27, BR-34 | Upload permitted file | `201`; metadata stored (original name, MIME, size, uploader, timestamp); state `ACTIVE` | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-19 | AC-14, BR-31 | Unsupported type | `.exe` upload → `415`; nothing stored | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-20 | AC-14, BR-32 | Oversized file | 5 MB + 1 byte → `413`; nothing stored | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-21 | AC-28, BR-33 | Active limit | Sixth active upload → `409`; the five existing stay untouched | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-22 | AC-29 | Download active | `200`, correct content type and original filename in `Content-Disposition` | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-23 | AC-30, BR-36 | Soft removal | `200`; row retained with `removedAt`, `removalReason`, `removedBy`; still listed as `REMOVED` | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-24 | AC-31, BR-39 | Download removed | `410`; no file content | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-25 | AC-32, BR-40 | Remove twice | Second removal → `409` | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-26 | AC-34, BR-37 | Reason validation | Reason shorter than 3 chars → `400`; attachment stays active | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-27 | AC-33, BR-38 | Cross-requester attachment | Download and removal of another requester's attachment → `404` | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-28 | BR-33 | Removed files free a slot | After removing one of five, a new upload succeeds | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-29 | AC-02, BR-06 | Active requesters only | `GET /api/requesters` excludes the inactive requester | `server/tests/lab-02/reference.api.test.ts` | Planned |
| API-30 | AC-15, FR-03 | Reference data | Categories and related systems come from the database; ≥ 4 categories and ≥ 6 related systems, active only | `server/tests/lab-02/reference.api.test.ts` | Planned |
| API-31 | BR-28 | Safe errors | A forced failure returns a generic message with no stack trace, SQL, or path | `server/tests/lab-02/reference.api.test.ts` | Planned |

### 2.3 UI component

| Test ID | Requirement / AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|
| UI-01 | AC-02, AC-06, AC-05 | Requester selection states | Active requesters listed, inactive absent; empty and failure states render with Retry | `client/tests/lab-02/RequesterSelection.test.tsx` | Planned |
| UI-02 | AC-01, BR-09 | Guard | Rendering a ticket screen with no selection shows the selection screen | `client/tests/lab-02/RequesterSelection.test.tsx` | Planned |
| UI-03 | AC-03, AC-04 | Shell identity and switching | Selected name shown; Change Requester clears state and triggers a reload | `client/tests/lab-02/AppShell.test.tsx` | Planned |
| UI-04 | AC-09, AC-37 | Submit without Summary | Field-level message below Summary; create API not called | `client/tests/lab-02/CreateTicket.test.tsx` | Planned |
| UI-05 | AC-11 | Busy submit | Submit is disabled and shows a busy label while the request is in flight | `client/tests/lab-02/CreateTicket.test.tsx` | Planned |
| UI-06 | AC-07 | Success state | Official ticket number from the API is displayed with the next action | `client/tests/lab-02/CreateTicket.test.tsx` | Planned |
| UI-07 | AC-12, BR-20 | Failure preserves input | After a failed create, every entered value and the selected file are still present | `client/tests/lab-02/CreateTicket.test.tsx` | Planned |
| UI-08 | AC-15 | Reference data rendered | Category and related system options come from the mocked API, none hard-coded | `client/tests/lab-02/CreateTicket.test.tsx` | Planned |
| UI-09 | AC-14 | Invalid attachment | Oversized and wrong-type selections show per-file messages; valid selections remain | `client/tests/lab-02/CreateTicket.test.tsx` | Planned |
| UI-10 | AC-16 | List renders | Tickets and pagination metadata render from the API response | `client/tests/lab-02/MyTickets.test.tsx` | Planned |
| UI-11 | AC-17, AC-18 | Search and filter | Typing a search term and choosing a filter issue the documented query parameters | `client/tests/lab-02/MyTickets.test.tsx` | Planned |
| UI-12 | AC-19, AC-20 | Sort and page | Changing sort and page re-requests with the right parameters and reflects the current page | `client/tests/lab-02/MyTickets.test.tsx` | Planned |
| UI-13 | AC-22, AC-23, BR-30 | Empty vs no-results | Distinct copy; no-results offers Clear filters | `client/tests/lab-02/MyTickets.test.tsx` | Planned |
| UI-14 | AC-24 | List failure | Safe failure state with Retry | `client/tests/lab-02/MyTickets.test.tsx` | Planned |
| UI-15 | AC-25 | Read-only detail | All ticket header values render read-only; no editable header control exists | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Planned |
| UI-16 | AC-26 | Detail failure | A `404` from the detail endpoint shows a not-found state, not ticket data | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Planned |
| UI-17 | AC-27 | Add attachment | A successful upload appears in the list as Active with its metadata | `client/tests/lab-02/AttachmentSection.test.tsx` | Planned |
| UI-18 | AC-28 | Limit reached | With five active attachments, Add is disabled and explains why | `client/tests/lab-02/AttachmentSection.test.tsx` | Planned |
| UI-19 | AC-30, AC-34 | Removal dialog | Remove requires confirmation and a reason; a too-short reason is blocked | `client/tests/lab-02/AttachmentSection.test.tsx` | Planned |
| UI-20 | AC-31, BR-39 | Removed presentation | Removed attachment shows reason and date, and its download control is disabled | `client/tests/lab-02/AttachmentSection.test.tsx` | Planned |

### 2.4 UI style

| Test ID | Requirement / AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|
| STYLE-01 | AC-36 | Read-only vs editable | Read-only fields carry the read-only class/attribute; editable ones do not | `client/tests/lab-02/zen-green.style.test.tsx` | Planned |
| STYLE-02 | AC-37, §4 | Required marker and message placement | Every required label has an asterisk and the message renders in the field's own message slot | `client/tests/lab-02/zen-green.style.test.tsx` | Planned |
| STYLE-03 | §5 | Button hierarchy | Primary, secondary, tertiary and destructive buttons use their documented classes; disabled buttons are not activatable | `client/tests/lab-02/zen-green.style.test.tsx` | Planned |
| STYLE-04 | AC-38 | Badges | Priority and status badges expose their value as text, not colour alone | `client/tests/lab-02/zen-green.style.test.tsx` | Planned |
| STYLE-05 | AC-39, AC-40 | Accessibility hooks | Icon-only controls have accessible names; invalid fields set `aria-invalid` and `aria-describedby` | `client/tests/lab-02/zen-green.style.test.tsx` | Planned |

### 2.5 Responsive and E2E

| Test ID | Requirement / AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|
| RESP-01 | AC-35, §9 | Desktop 1280×800 | Create Ticket, My Tickets and Ticket Detail render with no horizontal page scroll; screenshots captured | `e2e/lab-02/responsive.spec.ts` | Planned |
| RESP-02 | AC-35, §9 | Tablet 820×1180 | Two-column where specified; no clipping or overlap; screenshots captured | `e2e/lab-02/responsive.spec.ts` | Planned |
| RESP-03 | AC-35, §9 | Mobile 390×844 | Fields stack, table becomes cards, touch targets ≥ 44 px, no horizontal scroll; screenshots captured | `e2e/lab-02/responsive.spec.ts` | Planned |
| E2E-01 | AC-01, AC-03, AC-07 | Select requester → create ticket | Confirmation shows the official ticket number generated by the backend | `e2e/lab-02/requester-ticket-flow.spec.ts` | Planned |
| E2E-02 | AC-16, AC-25 | Find and open the new ticket | The created ticket appears in My Tickets and its detail screen opens | `e2e/lab-02/requester-ticket-flow.spec.ts` | Planned |
| E2E-03 | AC-27, AC-29, AC-30, AC-31 | Attachment lifecycle | Upload, download, soft-remove with a reason; removed metadata stays, download blocked | `e2e/lab-02/requester-ticket-flow.spec.ts` | Planned |
| E2E-04 | AC-04, AC-26 | Requester switching and isolation | After switching to Requester B, Requester A's tickets are gone and direct access to A's ticket is rejected | `e2e/lab-02/requester-ticket-flow.spec.ts` | Planned |

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

_To be completed in Issue 8 from a run on the final `main` branch: paste the three commands' passing
output here and set every row in §2 to `Pass`._

## 7. Known Limitations and Deferred Tests

- Identity is a header, so no authentication or authorization tests exist; ownership tests prove only
  that the backend honours the selected identity (BR-05, deferred to Lab 3).
- Concurrency is not tested: two simultaneous creates racing for the same ticket number are prevented
  by the unique constraint, but no parallel-request test is planned in Lab 2.
- Object storage, virus scanning, and image thumbnailing are out of scope; attachment tests cover the
  local filesystem strategy only (D-04).
- Visual regression is checklist-based, not pixel-diff based: screenshots are captured and reviewed
  against `ui-spec.md`, with no baseline comparison tooling in Lab 2.
