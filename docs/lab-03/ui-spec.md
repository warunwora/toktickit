# Lab 3 UI Specification — Zen Green, Roles and Operational Screens

Extends [docs/lab-02/ui-spec.md](../lab-02/ui-spec.md). Every Lab 2 token, control state, validation
placement, button hierarchy, badge rule, responsive breakpoint and accessibility rule stays in force.
This document adds only what Lab 3 introduces, so the new screens read as the same application rather
than a second visual system.

---

## 1. Tokens

No new colour token is introduced. Lab 3 reuses the Lab 2 palette declared on `:root` in
`client/src/styles/zen-green.css`, with two new semantic uses of existing tokens:

| Use | Token | Why this token |
|---|---|---|
| Internal Notes surface | `--zg-warning-bg` with `--zg-warning` text and a 3 px left border in `--zg-warning` | The Lab 2 rule reserves the warning surface for "do not treat this like ordinary content". A private note is exactly that, and the difference is visible before anything is typed (AC-38). |
| Unassigned owner | `--zg-text-muted` on `--zg-readonly-bg` | An unassigned Ticket is an absence of data, which the read-only surface already communicates elsewhere. |

New spacing, radius or font values are not permitted. Anything not listed here uses the Lab 2 scale.

## 2. Role badge

One component, used in the header, the user list and every comment and note author line.

| Role | Label | Classes |
|---|---|---|
| `REQUESTER` | Requester | `zg-badge zg-badge-role-requester` — pale green surface |
| `IT_STAFF` | IT Staff | `zg-badge zg-badge-role-staff` — secondary green surface |
| `ADMINISTRATOR` | Administrator | `zg-badge zg-badge-role-admin` — primary green surface, white text |

Colour is always redundant with the text, as in Lab 2 §8.

## 3. Status and priority badges

The Lab 2 priority badge is unchanged. The status badge is extended from one value to eight; each
label is written in sentence case, never in enum case.

| Status | Label | Surface |
|---|---|---|
| `NEW` | New | pale green |
| `OPEN` | Open | pale green |
| `IN_PROGRESS` | In Progress | secondary green |
| `WAITING_FOR_REQUESTER` | Waiting for Requester | warning |
| `RESOLVED` | Resolved | success |
| `CLOSED` | Closed | read-only grey |
| `REOPENED` | Reopened | warning |
| `CANCELLED` | Cancelled | read-only grey with strike-through-free muted text |

A Ticket whose Requester has indicated that the problem appears resolved also shows a small
`Requester says resolved` marker next to the status badge in the queue and on Ticket Detail.

## 4. Application shell

```
┌────────────────────────────────────────────────────────────────────────┐
│ TokTickIT   [role navigation]                     Name  [Role]  Logout │
└────────────────────────────────────────────────────────────────────────┘
```

- The Development Requester name and the **Change Requester** button are removed (BR-61).
- The identity area shows the authenticated user's name followed by the role badge, and a Logout
  button using the tertiary button style.
- Navigation by role (AC-18):

| Role | Destinations |
|---|---|
| Requester | My Tickets · Create Ticket |
| IT Staff | Ticket Queue |
| Administrator | User Management |

- A destination that a role may not use is not rendered at all, and its route redirects to that
  role's landing screen. The backend enforces the same rule; the navigation is convenience only.
- The mobile menu toggle, the header bar layout and the `.zg-header` rules are unchanged from Lab 2,
  including the Lab 2 fix that keeps the toggle hidden above 768 px.

## 5. Screens

### 5.1 Login

Single centred card, maximum width 420 px, on the page background.

| Element | Rule |
|---|---|
| Heading | "Sign in to your account" |
| Email | `type="email"`, `autocomplete="username"`, required marker, inline validation on blur and on submit |
| Password | `type="password"`, `autocomplete="current-password"`, a show/hide toggle that is a real button with `aria-pressed` |
| Submit | Primary button, full width, label "Sign In"; disabled with a "Signing in…" busy label while the request is in flight (AC-51) |
| Failure | One error callout above the form using `--zg-error-bg`, `role="alert"`: "Invalid email or password. Please try again." |
| Inactive account | The same callout position with the distinct message "This account is not active. Please contact an administrator." |
| Footer | A muted line naming the local development credentials is **not** shown; the README documents them instead |

The screen has no navigation shell, no link to registration and no "forgot password" action, because
both are excluded from Lab 3.

### 5.2 Mandatory Change Password

Shown instead of the application whenever `mustChangePassword` is true, at the route
`/change-password`. Every other route redirects to it (AC-02).

| Element | Rule |
|---|---|
| Heading | "Change Your Password" with the helper line "You must change your password to continue." |
| Fields | Current (temporary) password, New password, Confirm new password — each with a show/hide toggle |
| Rules panel | A pale-green panel listing the four rules, each item switching from a muted dot to a green check as the typed value satisfies it |
| Submit | Primary, full width, "Continue", with a busy state |
| Validation | Field-level messages under the offending field, `aria-describedby` wired, plus one summary callout on a server rejection |
| Success | Immediate navigation to the role's landing screen; no interstitial |

The shell above this screen shows the user's name and Logout only — no navigation, so the person
cannot route around the change.

### 5.3 Requester screens (regression plus additions)

My Tickets and Create Ticket keep their Lab 2 layout exactly. Requester Ticket Detail keeps its
grouped read-only layout and its attachment section, and gains:

- a **Public Comments** section below the attachments: a thread of author, role badge, timestamp and
  body, oldest first, with a textarea and a "Post Comment" primary button;
- a **The problem appears resolved** secondary button in the ticket header area, with a confirmation
  dialog, which after success is replaced by a success callout reading "You told IT Staff that this
  problem appears resolved." and does not change the status badge (AC-23);
- an empty state for the thread: "No comments yet."

### 5.4 IT Staff Ticket Queue

```
Ticket Queue                                       [ Search by number or summary ]
[ Status ▾ ] [ Category ▾ ] [ IT Priority ▾ ] [ Owner ▾ ]            Showing 1–10 of 37
┌──────────┬──────────┬───────────────┬──────────┬───────┬──────┬────────┬────────┬──────────┐
│ Ticket No│ Created  │ Summary       │ Category │ Req.  │ IT   │ Status │ Owner  │ Updated  │
└──────────┴──────────┴───────────────┴──────────┴───────┴──────┴────────┴────────┴──────────┘
                                                        [ ‹ Prev ] 1 2 3 … [ Next › ]
```

- Nine columns are justified as the minimum that answers "what should I work on next": identity
  (Ticket No.), age (Created), subject (Summary, Category), the two priorities that differ from each
  other, the workflow position (Status), who has it (Owner) and freshness (Last Updated). Requester
  name is deliberately left out of the table and shown on Ticket Detail, because it is not a
  prioritisation signal and its width is what turns this table into an unreadable mega-grid.
- Ticket No. is a link to the IT Staff Ticket Detail; the whole row is also clickable.
- Sortable columns carry a sort button in the header cell with `aria-sort`; the active column shows
  the direction arrow.
- Owner shows the name, or an `Unassigned` badge (AC-31).
- Filters are single-select dropdowns; changing one resets to page 1.
- Feedback states: loading skeleton row, empty ("No tickets in the queue yet."), no results ("No
  tickets match these filters." with a Clear filters action), forbidden ("You do not have access to
  this screen.") and a safe failure callout with a Retry button.
- Below 768 px the table is replaced by one card per Ticket: number and status on the first line,
  summary on the second, and a two-column grid of category, priorities, owner and dates. The Lab 2
  `.zg-table-card` clipping plus `.zg-table-wrap` scrolling rule still applies at tablet width so the
  page never scrolls horizontally (AC-48).

### 5.5 IT Staff Ticket Detail

Three regions, top to bottom.

1. **Ticket information** — read-only fields in the Lab 2 three-column grid: Ticket No., Category,
   Related System, Requester, Requested Priority, Created. Read-only fields keep the
   `--zg-readonly-bg` surface so editable and non-editable are distinguishable at a glance.
2. **Operations panel** — a bordered card with exactly three editable controls and one action row:
   - **Ticket Owner** — a select of active IT Staff plus "Unassigned", with a **Claim this ticket**
     shortcut button shown only while the Ticket is unassigned;
   - **IT Priority** — a select of the four values;
   - **Status** — a select offering *only* the transitions permitted from the current status
     (specification.md §5.1); an unreachable status is not rendered;
   - **Resolution Summary** — a textarea that becomes required and focused when Resolved is chosen,
     and is otherwise shown read-only;
   - a **Save changes** primary button with a busy state, and a confirmation dialog before Closed or
     Cancelled (BR-39).
3. **Tabs** — Public Comments · Internal Notes · Attachments, each with a count.
   - Public Comments reuse the Requester thread component.
   - Internal Notes use the warning surface described in §1, carry the heading "Internal Notes" and
     the permanent caption "Not visible to the Requester", and their composer button reads "Add
     Internal Note" so the two composers can never be confused (AC-38).
   - Attachments reuse the Lab 2 component in read-only mode: staff download but do not remove.

A failed save shows a field-level message for a rejected transition ("This ticket is New; it can move
to Open, In Progress or Cancelled.") and leaves every control at its previous value.

### 5.6 Administrator User Management

Two columns on desktop: the user list on the left, a side panel on the right that is empty until
Create User or Edit is pressed. Below 900 px the panel moves below the list; below 768 px the table
becomes cards.

| Element | Rule |
|---|---|
| List columns | Name, Email, Role badge, Status badge (Active / Inactive), Edit |
| Search | One field, "Search users by name or email", debounced 300 ms |
| Role filter | A single select: All roles, Requester, IT Staff, Administrator |
| Create | Primary "＋ Create User" above the list, which opens the panel in create mode |
| Panel fields | Full Name, Email Address, Role, Active toggle, Initial Password |
| Panel actions | "Save User" primary; "Cancel" tertiary; in edit mode also "Set new initial password" secondary and "Deactivate user" destructive-outline |
| Confirmations | Deactivation and setting a new initial password both confirm first |
| Feedback | Field validation inline; duplicate email shows on the email field; the two safety rules (self-deactivation, last Administrator) show as an error callout above the panel actions; success shows a green callout and the list refreshes |
| Empty / no results | "No users match this search." with a Clear action |

The panel never shows a password value, only a field for setting a new one, and after a successful
create or reset it shows the reminder "The user must change this password at their next login."

## 6. Responsive rules

Unchanged from Lab 2 §9: 1280 px desktop, 820 px tablet, 390 px mobile; no horizontal page scroll at
any width; tables clip inside their card and scroll inside their wrapper; the mobile menu toggle
appears only below 768 px. Lab 3 adds:

- the queue and user tables become cards below 768 px;
- the User Management side panel stacks below the list below 900 px;
- the login and change-password cards are full width minus a 16 px gutter below 480 px.

## 7. Accessibility rules

Unchanged from Lab 2 §10, with these additions:

- the login and change-password forms are real `<form>` elements submitted by Enter;
- every show/hide password control is a `<button type="button">` with `aria-pressed` and an
  accessible name that changes between "Show password" and "Hide password";
- the password rules panel is `aria-live="polite"` so a screen-reader user hears a rule become
  satisfied;
- sortable queue headers expose `aria-sort`, and the sort control is a button, not a clickable `th`;
- the side panel in User Management is labelled by its heading and moves focus to its first field
  when opened, returning focus to the triggering control when closed;
- every confirmation dialog traps focus, is dismissible with Escape and is labelled by its heading.

## 8. Visual inspection checklist

Performed at 1280, 820 and 390 px on every Lab 3 screen; results recorded in
[tests.md](tests.md) §4.

| # | Check |
|---|---|
| 1 | Design consistency: the new screens use only Lab 2 tokens, spacing and button hierarchy |
| 2 | Role navigation shows only permitted destinations, for all three roles |
| 3 | Status, priority and role badges are legible and their colour is redundant with their text |
| 4 | Editable versus read-only fields are visually distinct on both Ticket Detail screens |
| 5 | Internal Notes are unmistakably distinct from Public Comments |
| 6 | Validation messages sit under their field and are announced |
| 7 | No clipping of text, badges or buttons at any breakpoint |
| 8 | No overlap of the side panel, the table or the header at any breakpoint |
| 9 | No horizontal page scroll at any breakpoint |
| 10 | Focus ring visible on every interactive control, including dialogs |
| 11 | Busy, success, empty, no-results, forbidden and failure states all render |

## 9. Screenshot paths

| Screen | Path |
|---|---|
| Login, inactive account, change password | `artifacts/lab-03/screenshots/authentication/` |
| IT Staff queue, filters, no results, mobile cards | `artifacts/lab-03/screenshots/staff-queue/` |
| IT Staff ticket detail, notes, transitions | `artifacts/lab-03/screenshots/staff-ticket-detail/` |
| User management, create, edit, validation | `artifacts/lab-03/screenshots/user-management/` |

Each folder holds a `-desktop`, `-tablet` and `-mobile` variant of its main screen, captured by the
Playwright responsive suite so the evidence is reproducible rather than hand-cropped.
