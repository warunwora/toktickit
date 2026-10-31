# Lab 4 UI Specification — Dashboards, Actions Taken and Final Polish

Extends [docs/lab-02/ui-spec.md](../lab-02/ui-spec.md) and [docs/lab-03/ui-spec.md](../lab-03/ui-spec.md).
Every earlier token, control state, validation placement, button hierarchy, badge, responsive rule and
accessibility rule stays in force. **No new colour token is introduced.**

---

## 1. Navigation and landing

| Role | Navigation (in order) | Landing after sign-in |
|---|---|---|
| Requester | Dashboard · My Tickets · Create Ticket · Account | `/dashboard` |
| IT Staff | Dashboard · Ticket Queue · Account | `/staff/dashboard` |
| Administrator | Dashboard · Ticket Queue · Users · Account | `/staff/dashboard` |

The active destination keeps the Lab 2 underline indicator and `aria-current="page"`. A role opening
another role's dashboard is redirected to its own landing screen; the API refuses as well.

## 2. Dashboard pattern (shared)

```
Welcome back, <first name>                                   [ Refresh ]
┌ Metric ┐ ┌ Metric ┐ ┌ Metric ┐ ┌ Metric ┐ ┌ Metric ┐
│ label  │ │ label  │ │ label  │ │ label  │ │ label  │
│  14    │ │  23    │ │   7    │ │   0    │ │  16    │
│ View → │ │ View → │ │ View → │ │ View → │ │ View → │
└────────┘ └────────┘ └────────┘ └────────┘ └────────┘
┌ Recent list ──────────────────────┐ ┌ Second list / breakdown ─────┐
│ TKT-… summary        [badge] date │ │ …                             │
│ …                       View all →│ │                               │
└───────────────────────────────────┘ └───────────────────────────────┘
```

| Element | Rule |
|---|---|
| Metric card | `.zg-card` with a label (0.875 rem / 600), a value (2 rem / 700), and a "View" link whose accessible name includes the label, e.g. "View unassigned tickets". The whole card is not a link, so text stays selectable. |
| Zero value | Shows `0` and the muted helper "Nothing here right now"; the View link stays, so the empty list is reachable. |
| Recent list | At most 5 rows: ticket number link, summary (one line, ellipsis), status badge, Bangkok date and time. Empty list shows "No recent tickets." |
| Loading | Card values show a skeleton bar with `aria-busy="true"`; the page announces "Loading dashboard…" once. |
| Failure | One error callout "The dashboard could not be loaded." with Retry; no raw error text. |
| Forbidden | "You do not have access to this dashboard." (normally unreachable because of the redirect). |
| Refresh | Tertiary button; disabled while loading. |
| Time zone | Every date shows Asia/Bangkok time, e.g. `30 Oct 2026, 10:45`. |

### 2.1 Requester dashboard (`/dashboard`)

Cards: **Open tickets**, **Waiting for me**, **Resolved**, **Closed**. Lists: **Recently updated**
(7 days) and **Recently resolved** (30 days). Quick actions: Create Ticket (primary) and View My
Tickets (secondary). Drill-down targets are in api-spec.md §5.1.

### 2.2 IT Staff dashboard (`/staff/dashboard`)

Cards: **Unassigned**, **Owned by me**, **My open actions**, **Urgent (active)**. Below them:

- **By status**: eight compact rows, each label + count + link to the filtered queue.
- **By IT Priority** (active Tickets): four rows with the Lab 2 priority badges.
- **My open actions**: up to 5 actions assigned to me, each with ticket number, description, action
  status badge and Action Date/Time, linking to the Ticket's Actions Taken tab.
- **Recently updated**: up to 5 Tickets.

### 2.3 Administrator dashboard

The IT Staff dashboard plus a **Users** card group: active and inactive counts per role, linking to
User Management filtered by role.

## 3. Actions Taken on the IT Staff Ticket Detail

A fourth tab, **Actions Taken (n)**, after Public Comments, Internal Notes and Attachments. The page
can open on it with `?tab=actions`.

### 3.1 List (view mode)

| Column / element | Rule |
|---|---|
| Order | Oldest first by Action Date/Time, then id (BR-15). |
| Row | Action Date/Time · Description · Performed by · Assigned to (with role badge) · Action status badge · Follow-up indicator · Edit / Start / Complete / Cancel buttons as permitted. |
| Expanded detail | Result, Follow-up Note, Attachment Notes, completed/cancelled time, cancel reason. |
| Final actions | Completed and Cancelled rows show no edit controls; a Completed row with an open follow-up shows **Mark follow-up done**. |
| Different performers | Each row names its own performer and assignee; when the assignee is not the Ticket Owner the row shows a muted "Not the ticket owner" hint, so BR-02 is visible. |
| Empty | "No actions recorded yet." with the **Add action** button. |
| Below 768 px | Each action becomes a card; buttons wrap to a second line and stay at least 44 px tall. |

### 3.2 Create and edit mode

A form panel that opens below the list (not a modal, so it never traps a long form on mobile):

| Field | Control | Notes |
|---|---|---|
| Action Date/Time * | `datetime-local`, default now (Bangkok) | inline error for future or before the Ticket |
| Action Description * | textarea, 2000 counter | |
| Result | textarea, 2000 counter | becomes required (marker appears) when status is Completed |
| Status * | select: Planned, In Progress, Completed (create); permitted transitions only (edit) | |
| Assigned to * | select of active IT Staff and Administrators, default me | |
| Follow-Up Required | checkbox | reveals Follow-up Note * when ticked |
| Follow-up Note | textarea, 1000 counter | required when shown |
| Attachment Notes | text input, 500 counter, helper "Name the Ticket attachment to look at, e.g. evidence.png" | |
| Performed by | read-only field showing the signed-in user | read-only surface (`--zg-readonly-bg`) |

Buttons: **Save action** (primary, busy label "Saving…"), **Cancel** (tertiary, keeps the list).
Cancelling an action opens a confirmation dialog asking for the reason (3–500).

### 3.3 Feedback

| Situation | Feedback |
|---|---|
| Validation | Field-level messages under each field, `aria-describedby`, summary callout on server rejection |
| Saved | Success callout "Action saved." and the list re-renders in order |
| 409 `STALE_UPDATE` | Warning callout "This action was changed by someone else." with **Reload latest**; the form keeps the user's values until they reload |
| 400 `TICKET_LOCKED` | "This ticket is closed, so its actions can no longer change." |
| Network or 500 | "The action could not be saved. Please try again." and all values kept |

## 4. Requester Ticket Detail

A read-only **Actions Taken** section after Attachments: the same list without any control, showing
Action Date/Time, Description, Result, Performed by, Assigned to, status and follow-up note. Internal
Notes remain absent. Empty state: "No actions have been recorded yet."

## 5. Ticket workflow feedback

| Situation | Feedback |
|---|---|
| Status select | Offers only the transitions in specification.md §5.1 (unchanged behaviour) |
| Resolution blocked | Error callout "This ticket cannot be resolved yet." listing each blocking action as a link to it in the Actions Taken tab, with its reason (incomplete / follow-up open) |
| Stale ticket | Warning callout "This ticket was changed by someone else." with **Reload latest**; the selected values stay until reload |
| Success | Status, IT Priority and owner badges and the Ticket summary update in place; version updates silently |
| Requester indication | The Lab 3 "Requester says resolved" marker stays next to the status |

## 6. Hardening rules

1. Every submit button is disabled while its request is in flight and shows a busy label.
2. After any recoverable failure a form keeps every entered value.
3. No placeholder copy ("TODO", "Lorem", "Coming soon"), no dead links and no unfinished controls on
   any screen; the Lab 1 `/system-check` page is either linked from nowhere and documented as a
   diagnostic page or removed.
4. No console errors or React warnings on any screen.

## 7. Responsive rules

Unchanged from Labs 2 and 3 (1280 / 820 / 390 px, no horizontal page scroll). Added:

- Dashboard cards: 4–5 per row on desktop, 2 per row at 820 px, 1 per row below 600 px.
- Dashboard lists stack below the cards on tablet and mobile.
- The Actions Taken table becomes cards below 768 px; the form fields stack in one column.

## 8. Accessibility rules

Unchanged from Labs 2 and 3, plus: every metric value has a text label in the same card; the View
link's accessible name includes the metric; action status badges carry text; the follow-up checkbox
controls the note with `aria-controls` and `aria-expanded`; the cancel dialog traps focus, closes on
Escape and returns focus to the button that opened it.

## 9. Action status badges

| Status | Label | Surface |
|---|---|---|
| `PLANNED` | Planned | read-only grey |
| `IN_PROGRESS` | In Progress | secondary green |
| `COMPLETED` | Completed | success |
| `CANCELLED` | Cancelled | muted grey |
| follow-up open | Follow-up | warning |

## 10. Visual and accessibility checklist

Performed at 1280, 820 and 390 px on: Requester Dashboard, IT Staff Dashboard, Administrator
Dashboard, IT Staff Ticket Detail (Actions Taken tab, list and form), Requester Ticket Detail with
Actions Taken, plus the Lab 2 and Lab 3 screens for regression. Results recorded in tests.md §4.

| # | Check |
|---|---|
| 1 | Design consistency: only Lab 2/3 tokens, spacing and button hierarchy |
| 2 | Dashboards: every card labelled, values readable, every View link correct |
| 3 | Actions Taken: list order stable, statuses distinguishable without colour |
| 4 | Editable versus read-only fields distinct (Performed by is read-only) |
| 5 | Validation messages under their field and announced |
| 6 | Keyboard focus visible on every control, dialogs trap and return focus |
| 7 | No clipping of text, badges or buttons |
| 8 | No overlap of cards, lists, tabs or forms |
| 9 | No horizontal page scroll |
| 10 | Busy, success, empty, no-results, forbidden, conflict and failure states render |
| 11 | No obsolete, duplicate or placeholder UI left from earlier labs |

## 11. Screenshot paths

| Screen | Path |
|---|---|
| Requester dashboard (+ empty and failure states) | `artifacts/lab-04/screenshots/requester-dashboard/` |
| IT Staff and Administrator dashboards | `artifacts/lab-04/screenshots/staff-dashboard/` |
| Actions Taken list, form, conflict and blocked resolution | `artifacts/lab-04/screenshots/actions-taken/` |

Each folder holds desktop, tablet and mobile variants captured by the Playwright responsive suite.
