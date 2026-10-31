# Lab 4 Test Plan and Results

Written with [specification.md](specification.md) in Issue 1, **before** any Lab 4 implementation
existed. The `Final` column is `Pending` until Issue 7 replaces it with the outcome of a real run.
The Lab 1, 2 and 3 suites (420 tests at the end of Lab 3) stay in the repository and run in every
build as regression evidence (BR-42).

Types: **U** unit · **API** API/integration · **AUTHZ** authorization · **WF** workflow ·
**UI** component · **STYLE** UI style · **RESP** responsive · **REG** migration/regression ·
**PERF** performance-smoke · **E2E** end-to-end.

---

## 1. Test Strategy

| Layer | Tool | What it proves |
|---|---|---|
| Unit | Vitest | Pure rules: action validation, action status matrix, resolution gate, dashboard window boundaries. |
| API / AUTHZ / WF | Vitest + Supertest on the real app and PostgreSQL | Every write enforced by the backend for every role; the resolution gate and stale-update handling even when the UI is bypassed. |
| Dashboard accuracy | Vitest + Supertest + raw SQL | Each metric equals its documented SQL query (api-spec.md §5) on controlled data. |
| PERF | Vitest + Supertest | Dashboard and Actions Taken endpoints stay inside a time budget on the seeded database. |
| REG | Vitest | The migration keeps Lab 3 data, the recovery script restores it, the seed is idempotent, and the Lab 1–3 suites pass. |
| UI / STYLE | Vitest + Testing Library | Screens, feedback states, keyboard and Zen Green contract with the network mocked. |
| RESP / E2E | Playwright at 1280, 820, 390 px | No overflow; the journeys a grader will repeat. |

## 2. Planned Tests

### 2.1 Unit — `server/tests/lab-04/`

| Test ID | Type | AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| U-01 | U | AC-06 | Description empty, whitespace, 2000 and 2001 characters | rejected, rejected, accepted, rejected | `action-rules.unit.test.ts` | Pending |
| U-02 | U | AC-06 | Action Date/Time: in 6 minutes, in 4 minutes, before the Ticket, missing | rejected, accepted, rejected, rejected | `action-rules.unit.test.ts` | Pending |
| U-03 | U | AC-06 | Follow-Up Required true without note; false with note | rejected; accepted with note cleared | `action-rules.unit.test.ts` | Pending |
| U-04 | U | AC-08 | Completed without Result; Cancelled without reason or with 2 characters | all rejected | `action-rules.unit.test.ts` | Pending |
| U-05 | U | AC-07 | Every permitted action transition (§5.2) | allowed | `action-rules.unit.test.ts` | Pending |
| U-06 | U | AC-09 | Every forbidden action transition, including out of Completed and Cancelled | rejected | `action-rules.unit.test.ts` | Pending |
| U-07 | U | AC-14 | Resolution gate with a Planned, an In Progress, a Completed+open follow-up, a Completed+cleared follow-up, a Cancelled action, and none | blocked, blocked, blocked, allowed, allowed, allowed | `resolution-gate.unit.test.ts` | Pending |
| U-08 | U | AC-14 | Gate result lists each blocking action with its reason | `INCOMPLETE` / `FOLLOW_UP_OPEN` | `resolution-gate.unit.test.ts` | Pending |
| U-09 | U | AC-24 | Window boundaries: updated exactly 7 days ago, 7 days minus 1 second, resolved 30 days ago | out, in, out | `dashboard-windows.unit.test.ts` | Pending |
| U-10 | U | AC-28 | Drill-down URL builder for every card | matches api-spec.md §5 | `dashboard-windows.unit.test.ts` | Pending |

### 2.2 API — Actions Taken, `server/tests/lab-04/actions-taken.api.test.ts`

| Test ID | Type | AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| API-01 | API | AC-01 | IT Staff creates a valid action assigned to another IT Staff member | 201, correct ticketId, performer = session user, assignee = chosen user, version 1 | `actions-taken.api.test.ts` | Pending |
| API-02 | API | AC-01 | Create without assigneeId | assignee defaults to the performer | `actions-taken.api.test.ts` | Pending |
| API-03 | API | AC-05 | Body includes `performedById` of someone else | ignored; session user stored | `actions-taken.api.test.ts` | Pending |
| API-04 | AUTHZ | AC-02 | Administrator creates and updates an action | 201 and 200 | `actions-taken.api.test.ts` | Pending |
| API-05 | AUTHZ | AC-03 | Requester creates or updates an action on their own Ticket | 403, nothing stored | `actions-taken.api.test.ts` | Pending |
| API-06 | AUTHZ | AC-03 | No session on list, create and update | 401 | `actions-taken.api.test.ts` | Pending |
| API-07 | API | AC-04 | Assignee inactive, a Requester, unknown id | 400 on `assigneeId` in each case | `actions-taken.api.test.ts` | Pending |
| API-08 | API | AC-04 | Reassign an open action to an inactive user | 400, assignee unchanged | `actions-taken.api.test.ts` | Pending |
| API-09 | API | AC-06 | Each invalid field from U-01 to U-03 through the API | 400 with the field named, nothing stored | `actions-taken.api.test.ts` | Pending |
| API-10 | API | AC-07 | Planned → In Progress → Completed with Result | 200 each, `completedAt` set, version +1 each | `actions-taken.api.test.ts` | Pending |
| API-11 | API | AC-08 | Complete without Result; cancel without reason | 400 | `actions-taken.api.test.ts` | Pending |
| API-12 | API | AC-09 | Edit description of a Completed action; reopen a Cancelled one | 400 `ACTION_FINAL` | `actions-taken.api.test.ts` | Pending |
| API-13 | API | AC-09 | Clear the follow-up of a Completed action; clear it twice | 200 with clearer recorded; second is 400 | `actions-taken.api.test.ts` | Pending |
| API-14 | API | AC-10 | Three actions, two with the same Action Date/Time | listed by actionAt then id, identical on repeated calls | `actions-taken.api.test.ts` | Pending |
| API-15 | API | AC-11 | Two different IT Staff record actions on one Ticket owned by a third | each action keeps its own performer and assignee | `actions-taken.api.test.ts` | Pending |
| API-16 | API | AC-12 | Create or update on a Closed and on a Cancelled Ticket | 400 `TICKET_LOCKED` | `actions-taken.api.test.ts` | Pending |
| API-17 | AUTHZ | AC-13 | Requester lists actions of own Ticket; of another Requester's Ticket; of a missing Ticket | 200; 404; 404 with identical bodies | `actions-taken.api.test.ts` | Pending |
| API-18 | API | AC-18 | Two updates from the same version | first 200, second 409 `STALE_UPDATE` with current action | `actions-taken.api.test.ts` | Pending |
| API-19 | API | AC-36 | The same create request sent twice within 60 seconds | 201 then 409 `DUPLICATE_SUBMISSION` with the original id; one row | `actions-taken.api.test.ts` | Pending |
| API-20 | API | AC-19 | Creating and completing an action | parent Ticket version and updatedAt increase | `actions-taken.api.test.ts` | Pending |

### 2.3 API — Ticket workflow, `server/tests/lab-04/ticket-workflow.api.test.ts`

| Test ID | Type | AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| WF-01 | WF | AC-14 | Resolve with a Planned action, bypassing the UI | 409 `RESOLUTION_BLOCKED` listing it; status unchanged | `ticket-workflow.api.test.ts` | Pending |
| WF-02 | WF | AC-14 | Resolve with an In Progress action | 409, status unchanged | `ticket-workflow.api.test.ts` | Pending |
| WF-03 | WF | AC-15 | Resolve with an open follow-up, then after clearing it | 409, then 200 | `ticket-workflow.api.test.ts` | Pending |
| WF-04 | WF | AC-16 | Resolve a legacy Ticket with no actions | 200 | `ticket-workflow.api.test.ts` | Pending |
| WF-05 | WF | AC-14 | Resolve from Reopened with an incomplete action | 409 | `ticket-workflow.api.test.ts` | Pending |
| WF-06 | WF | AC-17 | Two staff updates from the same Ticket version | first 200, second 409 `STALE_UPDATE` with current Ticket, nothing written | `ticket-workflow.api.test.ts` | Pending |
| WF-07 | WF | AC-17 | Owner change from a stale version | 409 | `ticket-workflow.api.test.ts` | Pending |
| WF-08 | WF | AC-17 | Ticket update without `version` | 400 on `version` | `ticket-workflow.api.test.ts` | Pending |
| WF-09 | WF | AC-19 | Status change from a version taken before an action was completed | 409 | `ticket-workflow.api.test.ts` | Pending |
| WF-10 | WF | AC-20 | Every permitted Ticket transition from §5.1 (gate satisfied) | 200 | `ticket-workflow.api.test.ts` | Pending |
| WF-11 | WF | AC-20 | A forbidden transition from every status, including Closed and Cancelled | 400 `INVALID_TRANSITION`, unchanged | `ticket-workflow.api.test.ts` | Pending |
| WF-12 | WF | AC-22 | Requester indication on a Ticket with an incomplete action | recorded, status unchanged, gate still applies | `ticket-workflow.api.test.ts` | Pending |
| WF-13 | AUTHZ | AC-33 | Administrator claims a Ticket, sets IT Priority, changes status | 200 each | `ticket-workflow.api.test.ts` | Pending |
| WF-14 | AUTHZ | AC-33 | Assign a Ticket to an Administrator; assignable-users includes Administrators | 200; list includes them | `ticket-workflow.api.test.ts` | Pending |
| WF-15 | AUTHZ | AC-03 | Requester calls each staff write endpoint | 403 | `ticket-workflow.api.test.ts` | Pending |
| WF-16 | WF | AC-21 | Successful update response | includes the new status, badges data and incremented version | `ticket-workflow.api.test.ts` | Pending |

### 2.4 API — Requester dashboard, `server/tests/lab-04/requester-dashboard.api.test.ts`

| Test ID | Type | AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| DR-01 | API | AC-24 | Each metric on a dedicated test Requester with known Tickets | equals the documented SQL run in the test | `requester-dashboard.api.test.ts` | Pending |
| DR-02 | AUTHZ | AC-23 | Another Requester's Tickets exist | never counted or listed | `requester-dashboard.api.test.ts` | Pending |
| DR-03 | API | AC-24 | Recently updated and recently resolved windows and order | 7 / 30 days, newest first, max 5 | `requester-dashboard.api.test.ts` | Pending |
| DR-04 | API | AC-27 | Requester with no Tickets | all 0, lists empty, 200 | `requester-dashboard.api.test.ts` | Pending |
| DR-05 | API | AC-28 | `GET /api/tickets?statusGroup=active` | returns exactly the Tickets counted as Open | `requester-dashboard.api.test.ts` | Pending |
| DR-06 | AUTHZ | AC-29 | IT Staff and Administrator call it; no session | 403, 403, 401 | `requester-dashboard.api.test.ts` | Pending |
| DR-07 | API | AC-30 | Response shape | only the documented summary fields | `requester-dashboard.api.test.ts` | Pending |
| PERF-01 | PERF | AC-31 | Requester dashboard on the seeded database, 20 sequential calls | p95 under 300 ms | `requester-dashboard.api.test.ts` | Pending |

### 2.5 API — IT Staff dashboard, `server/tests/lab-04/staff-dashboard.api.test.ts`

| Test ID | Type | AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| DS-01 | API | AC-25 | Unassigned, Owned by me, Urgent (active) | each equals its documented SQL | `staff-dashboard.api.test.ts` | Pending |
| DS-02 | API | AC-25 | My open actions count and list | equals SQL; only Planned/In Progress assigned to me; max 5 | `staff-dashboard.api.test.ts` | Pending |
| DS-03 | API | AC-25 | By status and by IT Priority | all eight / four keys present, values equal SQL | `staff-dashboard.api.test.ts` | Pending |
| DS-04 | API | AC-26 | Administrator | includes `users` counts equal to SQL; IT Staff response has no `users` key | `staff-dashboard.api.test.ts` | Pending |
| DS-05 | API | AC-27 | IT Staff user with no owned Tickets and no actions | zeros and empty lists | `staff-dashboard.api.test.ts` | Pending |
| DS-06 | API | AC-28 | Queue with `ownerId=unassigned&statusGroup=active` and with `ownerId=me&statusGroup=active` | totals equal the cards | `staff-dashboard.api.test.ts` | Pending |
| DS-07 | API | AC-28 | `statusGroup` with `status`, and an unknown `statusGroup` | 400 | `staff-dashboard.api.test.ts` | Pending |
| DS-08 | AUTHZ | AC-29 | Requester calls it; no session | 403, 401 | `staff-dashboard.api.test.ts` | Pending |
| PERF-02 | PERF | AC-31 | Staff dashboard on the seeded database, 20 sequential calls | p95 under 300 ms | `staff-dashboard.api.test.ts` | Pending |
| PERF-03 | PERF | AC-31 | Actions Taken list of the Ticket with the most actions | p95 under 200 ms | `staff-dashboard.api.test.ts` | Pending |

### 2.6 Migration and regression, `server/tests/lab-04/`

| Test ID | Type | AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| REG-01 | REG | AC-39 | After migration every Lab 3 Ticket, Attachment, Comment and Note still resolves; every Ticket has version 1 or more | intact | `migration-recovery.test.ts` | Pending |
| REG-02 | REG | AC-39 | Recovery script on a throwaway schema holding Lab 3 data | ActionTaken table and Ticket.version gone, Lab 3 rows unchanged | `migration-recovery.test.ts` | Pending |
| REG-03 | REG | AC-39 | Re-apply the migration after recovery | succeeds, data intact | `migration-recovery.test.ts` | Pending |
| REG-04 | REG | AC-40 | Seed run twice | second run creates nothing; Tickets with 0, 1 and several actions exist | `migration-recovery.test.ts` | Pending |
| REG-05 | REG | AC-35 | Lab 1, 2 and 3 server suites | all pass (the Administrator 403 cases updated per BR-26 and the version field per BR-24, named in their PRs) | `server/tests/lab-01..03` | Pending |
| REG-06 | REG | AC-16 | Legacy Tickets with no actions | count in dashboards and resolve normally | `migration-recovery.test.ts` | Pending |

### 2.7 UI component — `client/tests/lab-04/`

| Test ID | Type | AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| UI-01 | UI | AC-10 | Actions Taken tab lists actions in the given order with all columns | rendered | `ActionsTaken.test.tsx` | Pending |
| UI-02 | UI | AC-01 | Create form submits the documented payload; Performed by read-only | correct body; field not editable | `ActionsTaken.test.tsx` | Pending |
| UI-03 | UI | AC-06 | Client validation: description, future date, follow-up note, result when Completed | field messages, no request | `ActionsTaken.test.tsx` | Pending |
| UI-04 | UI | AC-07 | Start and Complete buttons only on permitted states | shown/hidden correctly | `ActionsTaken.test.tsx` | Pending |
| UI-05 | UI | AC-08 | Cancel opens a dialog requiring a reason; Escape closes and returns focus | behaves | `ActionsTaken.test.tsx` | Pending |
| UI-06 | UI | AC-09 | Final actions show no edit controls; open follow-up shows Mark follow-up done | rendered | `ActionsTaken.test.tsx` | Pending |
| UI-07 | UI | AC-11 | Action assigned to someone other than the owner | shows "Not the ticket owner" hint | `ActionsTaken.test.tsx` | Pending |
| UI-08 | UI | AC-18 | 409 `STALE_UPDATE` on save | warning with Reload latest; values kept | `ActionsTaken.test.tsx` | Pending |
| UI-09 | UI | AC-37 | Network failure and 500 on save | safe message; every value kept | `ActionsTaken.test.tsx` | Pending |
| UI-10 | UI | AC-36 | Double click on Save action | one request; button disabled with busy label | `ActionsTaken.test.tsx` | Pending |
| UI-11 | UI | AC-13 | Requester Ticket Detail | read-only list, no controls, empty state | `ActionsTaken.test.tsx` | Pending |
| UI-12 | UI | AC-04 | Assignee select lists only the assignable users from the API | options match | `ActionsTaken.test.tsx` | Pending |
| UI-13 | UI | AC-14 | `RESOLUTION_BLOCKED` response | callout listing blocking actions as links | `TicketWorkflow.test.tsx` | Pending |
| UI-14 | UI | AC-17 | `STALE_UPDATE` on status save | warning with Reload latest, selections kept | `TicketWorkflow.test.tsx` | Pending |
| UI-15 | UI | AC-20 | Status select from each status | only permitted options | `TicketWorkflow.test.tsx` | Pending |
| UI-16 | UI | AC-21 | Successful status change | summary and badges update without reload; new version used next | `TicketWorkflow.test.tsx` | Pending |
| UI-17 | UI | AC-33 | Administrator on Staff Ticket Detail | claim, IT Priority, status and Add action controls present | `TicketWorkflow.test.tsx` | Pending |
| UI-18 | UI | AC-22 | Requester indication marker | shown next to status, status unchanged | `TicketWorkflow.test.tsx` | Pending |
| UI-19 | UI | AC-24 | Requester dashboard renders four cards and two lists from API data | rendered with Bangkok times | `RequesterDashboard.test.tsx` | Pending |
| UI-20 | UI | AC-27 | Zero metrics and empty lists | "Nothing here right now" and empty messages | `RequesterDashboard.test.tsx` | Pending |
| UI-21 | UI | AC-28 | View links | exact drill-down URLs | `RequesterDashboard.test.tsx` | Pending |
| UI-22 | UI | AC-32 | Loading then failure | skeleton with aria-busy, then error with Retry; Retry reloads | `RequesterDashboard.test.tsx` | Pending |
| UI-23 | UI | AC-25 | IT Staff dashboard renders cards, by-status, by-priority, my actions, recent | rendered | `StaffDashboard.test.tsx` | Pending |
| UI-24 | UI | AC-26 | Administrator sees the Users group; IT Staff does not | correct | `StaffDashboard.test.tsx` | Pending |
| UI-25 | UI | AC-28 | Every View link on the staff dashboard | exact drill-down URLs | `StaffDashboard.test.tsx` | Pending |
| UI-26 | UI | AC-34 | Navigation and landing for each role, active page indicated | correct order, `aria-current` | `StaffDashboard.test.tsx` | Pending |
| UI-27 | UI | AC-32 | Staff dashboard failure and forbidden | safe messages | `StaffDashboard.test.tsx` | Pending |

### 2.8 UI style — `client/tests/lab-04/zen-green.lab4.style.test.tsx`

| Test ID | Type | AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| STYLE-01 | STYLE | AC-44 | Dashboard and Actions Taken use only declared tokens | no hard-coded colour | `zen-green.lab4.style.test.tsx` | Pending |
| STYLE-02 | STYLE | AC-43 | Action status and follow-up badges | text present for every value | `zen-green.lab4.style.test.tsx` | Pending |
| STYLE-03 | STYLE | AC-42 | Metric View links | accessible names include the metric | `zen-green.lab4.style.test.tsx` | Pending |
| STYLE-04 | STYLE | AC-44 | Performed by field | read-only surface class | `zen-green.lab4.style.test.tsx` | Pending |

### 2.9 Responsive and end-to-end — `e2e/lab-04/`

| Test ID | Type | AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| RESP-01 | RESP | AC-41 | Requester, IT Staff and Administrator dashboards at 1280, 820, 390 | no horizontal scroll, nothing wider than the viewport | `responsive.spec.ts` | Pending |
| RESP-02 | RESP | AC-41 | Actions Taken list and form at the three widths | same; table becomes cards below 768 px | `responsive.spec.ts` | Pending |
| RESP-03 | RESP | AC-38 | Every Lab 2–4 screen | no console errors, no placeholder text | `responsive.spec.ts` | Pending |
| RESP-04 | RESP | AC-44 | Screenshot capture of the three folders at three widths | files written | `responsive.spec.ts` | Pending |
| E2E-01 | E2E | AC-01 | IT Staff adds an action assigned to a colleague, starts and completes it | list shows performer, assignee and Completed | `actions-taken-flow.spec.ts` | Pending |
| E2E-02 | E2E | AC-11 | A second IT Staff member adds a different action on the same Ticket | both visible with their own people | `actions-taken-flow.spec.ts` | Pending |
| E2E-03 | E2E | AC-08 | Cancel an action with a reason through the dialog | Cancelled with reason, no edit controls | `actions-taken-flow.spec.ts` | Pending |
| E2E-04 | E2E | AC-04 | Assignee list excludes inactive users; API rejects an inactive id | rejected | `actions-taken-flow.spec.ts` | Pending |
| E2E-05 | E2E | AC-13 | Requester opens the Ticket | sees the actions read-only, no Internal Notes | `actions-taken-flow.spec.ts` | Pending |
| E2E-06 | E2E | AC-14 | Try to resolve with an incomplete action | blocked callout lists it; status unchanged | `ticket-resolution.spec.ts` | Pending |
| E2E-07 | E2E | AC-15 | Complete it, clear the follow-up, resolve, then close | each step succeeds | `ticket-resolution.spec.ts` | Pending |
| E2E-08 | E2E | AC-17 | Two browser contexts edit the same Ticket | second save shows the stale warning and keeps input | `ticket-resolution.spec.ts` | Pending |
| E2E-09 | E2E | AC-22 | Requester says resolved; staff sees marker; status unchanged | as stated | `ticket-resolution.spec.ts` | Pending |
| E2E-10 | E2E | AC-34 | Each role signs in and lands on its dashboard | correct dashboard and navigation | `dashboards.spec.ts` | Pending |
| E2E-11 | E2E | AC-28 | Click Unassigned and Owned by me on the staff dashboard | queue shows the same totals | `dashboards.spec.ts` | Pending |
| E2E-12 | E2E | AC-28 | Click Waiting for me on the Requester dashboard | My Tickets shows the same total | `dashboards.spec.ts` | Pending |
| E2E-13 | E2E | AC-26 | Administrator dashboard Users counts | match User Management filters | `dashboards.spec.ts` | Pending |
| E2E-14 | E2E | AC-35 | Lab 2 and Lab 3 end-to-end suites | still pass | `e2e/lab-02`, `e2e/lab-03` | Pending |

## 3. Acceptance-Criterion Traceability

| AC | Tests |
|---|---|
| AC-01 | API-01, API-02, UI-02, E2E-01 |
| AC-02 | API-04 |
| AC-03 | API-05, API-06, WF-15 |
| AC-04 | API-07, API-08, UI-12, E2E-04 |
| AC-05 | API-03 |
| AC-06 | U-01, U-02, U-03, API-09, UI-03 |
| AC-07 | U-05, API-10, UI-04 |
| AC-08 | U-04, API-11, UI-05, E2E-03 |
| AC-09 | U-06, API-12, API-13, UI-06 |
| AC-10 | API-14, UI-01 |
| AC-11 | API-15, UI-07, E2E-02 |
| AC-12 | API-16 |
| AC-13 | API-17, UI-11, E2E-05 |
| AC-14 | U-07, U-08, WF-01, WF-02, WF-05, UI-13, E2E-06 |
| AC-15 | WF-03, E2E-07 |
| AC-16 | WF-04, REG-06 |
| AC-17 | WF-06, WF-07, WF-08, UI-14, E2E-08 |
| AC-18 | API-18, UI-08 |
| AC-19 | API-20, WF-09 |
| AC-20 | WF-10, WF-11, UI-15 |
| AC-21 | WF-16, UI-16 |
| AC-22 | WF-12, UI-18, E2E-09 |
| AC-23 | DR-02 |
| AC-24 | U-09, DR-01, DR-03, UI-19 |
| AC-25 | DS-01, DS-02, DS-03, UI-23 |
| AC-26 | DS-04, UI-24, E2E-13 |
| AC-27 | DR-04, DS-05, UI-20 |
| AC-28 | U-10, DR-05, DS-06, DS-07, UI-21, UI-25, E2E-11, E2E-12 |
| AC-29 | DR-06, DS-08 |
| AC-30 | DR-07 |
| AC-31 | PERF-01, PERF-02, PERF-03 |
| AC-32 | UI-22, UI-27 |
| AC-33 | WF-13, WF-14, UI-17 |
| AC-34 | UI-26, E2E-10 |
| AC-35 | REG-05, E2E-14 |
| AC-36 | API-19, UI-10 |
| AC-37 | UI-09 |
| AC-38 | RESP-03 |
| AC-39 | REG-01, REG-02, REG-03 |
| AC-40 | REG-04 |
| AC-41 | RESP-01, RESP-02 |
| AC-42 | STYLE-03, UI-05 |
| AC-43 | STYLE-02 |
| AC-44 | STYLE-01, STYLE-04, RESP-04 |

Planned Lab 4 tests: 10 unit, 20 Actions Taken API, 16 workflow, 8 Requester dashboard (incl. 1
PERF), 10 staff dashboard (incl. 2 PERF), 6 migration/regression, 27 UI component, 4 UI style,
4 responsive and 14 end-to-end — **119 planned**, on top of the 420 Lab 1–3 tests.

## 4. Responsive, Visual and Accessibility Checklist

The eleven checks in [ui-spec.md](ui-spec.md) §10, at 1280, 820 and 390 px. Results recorded here in
Issue 7.

## 5. Test Commands

```bash
cd server && npm test        # unit, API, workflow, dashboard, PERF, migration/regression
cd client && npm test        # UI component and style
npx playwright test          # responsive and end-to-end
```

## 6. Final Results

Filled in from a real run on `main` in Issue 7.

## 7. Known Limitations

- PERF tests are smoke checks on the seeded local database, not load tests.
- The full `pg_dump` / restore drill is run once and recorded in Issue 6; the automated recovery test
  uses a throwaway schema.
- Real-time push of another user's change is out of scope; stale updates are detected at save time.
