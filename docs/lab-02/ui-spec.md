# Lab 2 UI Specification — Zen Green Theme

Companion to [specification.md](specification.md). This document is the visual contract: later labs
reuse these tokens and component rules instead of inventing a new visual system per screen.

---

## 1. Color tokens and intended use

| Token | Value | Used for |
|---|---|---|
| `--zg-primary` | `#006B3C` | App header, primary buttons, strong emphasis |
| `--zg-secondary` | `#0B7A46` | Active tab/nav indicator, focus accent, links, primary hover |
| `--zg-pale` | `#EAF6EF` | Selected rows, success surfaces, subtle section emphasis |
| `--zg-bg` | `#F5F7F6` | Page background |
| `--zg-surface` | `#FFFFFF` | Cards, tables, form surfaces |
| `--zg-border` | `#D8E1DC` | Card and input borders, table rules |
| `--zg-text` | `#1B2B22` | Body text — dark charcoal-green, never pure black |
| `--zg-text-muted` | `#5A6B62` | Helper text, metadata, placeholders |
| `--zg-readonly-bg` | `#EDF1EE` | Read-only field background (soft gray-green) |
| `--zg-error` | `#A4161A` | Error text and border |
| `--zg-error-bg` | `#FDECEC` | Error callout background |
| `--zg-warning` | `#B26B00` | Warning text |
| `--zg-warning-bg` | `#FFF4E0` | Warning callout background — never used as ordinary decoration |
| `--zg-success` | `#0B7A46` | Success confirmation text |
| `--zg-success-bg` | `#EAF6EF` | Success callout background |
| `--zg-focus` | `#0B7A46` | 2 px focus ring, offset 2 px |

Tokens are declared once as CSS custom properties on `:root` in `client/src/styles/zen-green.css` and
consumed by component classes. No component hard-codes a hex value.

**Contrast:** body text on surface ≥ 7:1; white on `--zg-primary` ≥ 4.5:1; error text on
`--zg-error-bg` ≥ 4.5:1. Status is never conveyed by colour alone (AC-38).

## 2. Typography and spacing

| Item | Rule |
|---|---|
| Font stack | `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif` |
| Page title | 1.5 rem / 600 |
| Section heading | 1.125 rem / 600 |
| Body and inputs | 1 rem / 400, line-height 1.5 |
| Label | 0.875 rem / 600, `--zg-text` |
| Helper and validation text | 0.8125 rem / 400 |
| Spacing scale | 4, 8, 12, 16, 24, 32, 48 px — no ad-hoc values |
| Field vertical rhythm | 8 px label→control, 4 px control→message, 16 px between fields |
| Card padding | 24 px desktop, 16 px mobile |
| Max content width | 1120 px, centred |

## 3. Control states

| State | Presentation |
|---|---|
| Editable | White background, 1 px `--zg-border`, 8 px radius, 40 px height |
| Read-only | `--zg-readonly-bg`, same border and height, `aria-readonly="true"`, no caret, text still fully legible |
| Focused | 2 px `--zg-focus` ring with 2 px offset; never removed for mouse users only |
| Invalid | 1 px `--zg-error` border, message below the field, `aria-invalid="true"`, `aria-describedby` pointing at the message |
| Disabled | `--zg-readonly-bg`, `--zg-text-muted` text, `cursor: not-allowed`, not activatable by mouse or keyboard |
| Busy | Control disabled, inline spinner plus a text change (e.g. "Submitting…") — never a spinner alone |

**Multiline Description:** 5 rows minimum, vertically resizable only; horizontal resize is disabled so
it cannot break the layout.

## 4. Required-field marker and validation placement

- Every required field's label ends with a red asterisk `*` carrying `aria-hidden="true"`, and the
  control itself is marked `required` / `aria-required="true"`.
- The asterisk never replaces the message: a failed required field also renders its own message
  immediately below the control (AC-37).
- One message per field. A form-level callout may summarise, but never instead of field messages.
- Message text names the rule, not the failure: "Summary must be at least 10 characters", not
  "Invalid".

## 5. Button hierarchy

| Level | Style | Use |
|---|---|---|
| Primary | Solid `--zg-primary`, white text | Submit Ticket, Continue, Upload |
| Secondary | White surface, `--zg-primary` border and text | Cancel, Back to My Tickets, Clear filters |
| Tertiary | Text-only in `--zg-secondary`, underline on hover | Change Requester, inline Retry |
| Destructive | White surface, `--zg-error` border and text; confirmation always required | Remove attachment |
| Disabled | Per §3 | Any action not currently permitted |
| Busy | Per §3 | Submit while a request is in flight (AC-11) |

Every button shows visible text. Icons may support text but never replace it, and every icon-only
control (e.g. download) carries an `aria-label` and a tooltip (AC-40).

## 6. Application shell

- Header bar in `--zg-primary`: TokTickIT wordmark on the left; **My Tickets** and **Create Ticket**
  links in the centre; the selected Requester's name plus **Change Requester** on the right.
- Active page indicator: 3 px `--zg-pale` underline plus `aria-current="page"` — not colour alone.
- Below 768 px the links collapse into a toggle menu; the Requester name stays visible in the bar.
- The shell renders only after a Requester is selected; otherwise the app routes to the selection
  screen (BR-09).

## 7. Screens

### 7.1 Development Requester Selection

Centred card on `--zg-bg`, max width 480 px, containing:

1. TokTickIT title.
2. Explanatory paragraph, verbatim: *"Select a Development Requester to test requester-specific ticket
   behavior. This is not a login screen. Authentication and role-based access will be introduced in
   Lab 3."*
3. Label **Development Requester \*** above a native `<select>` of active requesters
   (`Name — Department`).
4. Primary **Continue**, disabled until a requester is chosen.

States: **loading** (skeleton + "Loading requesters…", select disabled), **empty** (callout "No active
Development Requesters found. Run the seed and reload." with a Retry button, no select),
**failure** (error callout "Unable to load Development Requesters" + Retry, no select).

### 7.2 Create Ticket

Single card, two-column grid at ≥ 992 px, in this order:

| Group | Fields |
|---|---|
| Identity (read-only) | Ticket Number (`Will be generated on submit`), Ticket Date (today), Requester (selected name) |
| Classification | Category \*, Related System \*, Requested Priority \* |
| Content | Summary \* (full width), Description \* (full width, 5 rows) |
| Attachments | File picker, selected-file list with size and a remove-from-selection control, rules line: "JPG, PNG, WEBP or PDF · max 5 MB each · up to 5 files" |
| Actions | Primary **Submit Ticket**, secondary **Cancel** |

States: **initial**, **loading reference data** (selects disabled with a loading option),
**validation failure** (per-field messages, values preserved), **submitting** (Submit busy and
disabled), **success** (`--zg-success-bg` callout showing the official Ticket Number with **View
Ticket** and **Create Another** actions), **API failure** (`--zg-error-bg` callout with a safe message,
Retry, and every entered value preserved — AC-12), **invalid attachment** (per-file error line naming
the rule; valid selections stay).

### 7.3 My Tickets

Toolbar above the list: search input (with a clear control), Category / Related System / Priority /
Status selects, Sort select, Page size select, **Clear filters** secondary button, and a primary
**Create Ticket** action.

Desktop (≥ 992 px): table with columns **Ticket Number · Summary · Category · Related System ·
Priority · Status · Last Updated**, row hover in `--zg-pale`, the whole row a link to Ticket Detail.
Summary truncates with an ellipsis at one line and exposes the full text as a `title`.

Tablet (768–991 px): the same table with Related System hidden.
Mobile (< 768 px): one card per ticket — Ticket Number and Status badge on the first line, Summary on
the second, Category · Priority · Last Updated as metadata on the third. No horizontal scrolling.

Pagination below the list: Previous / page numbers / Next, plus "Showing X–Y of Z". Controls are
disabled, not hidden, at the first and last page.

States: **loading** (row/card skeletons, controls remain usable), **empty** ("You have not created any
tickets yet." + Create Ticket), **no results** ("No tickets match these filters." + Clear filters),
**failure** (error callout + Retry). Empty and no-results are visually and textually distinct (BR-30).

### 7.4 Requester Ticket Detail (view mode)

Header row: Ticket Number as the page title, Status badge, and a secondary **Back to My Tickets**.

Read-only information card, grouped: Identity (Ticket Number, Ticket Date, Requester, Status),
Classification (Category, Related System, Requested Priority), Content (Summary, Description).
Every value uses the read-only field style — no editable control appears anywhere in the header
(AC-25).

Attachments section, clearly separated by a heading and a rule:

- Count line: "3 of 5 active attachments".
- Per attachment: filename, type icon with an accessible label, human-readable size, upload date, a
  state badge, a **Download** icon-button, and a **Remove** destructive button.
- **Add attachment** control, disabled with an explanatory line when five active attachments exist.

Attachment states: **Active** (green badge, download and remove enabled), **Uploading** (progress text
and disabled actions), **Invalid** (red inline message on the rejected file, not added to the list),
**Removed** (gray badge, greyed filename, reason and removal date shown, download and remove both
disabled), **Unavailable** (amber badge when the stored file cannot be read, download disabled).

Removal dialog: modal titled "Remove attachment", the filename, a required **Reason \*** textarea
(3–200 chars), destructive **Remove** and secondary **Cancel**, focus trapped and returned to the
trigger on close.

## 8. Badges

| Badge | Values and presentation |
|---|---|
| Requested Priority | `LOW` gray · `MEDIUM` blue-gray · `HIGH` amber · `URGENT` red — always with the text label |
| Current Status | `NEW` `--zg-pale` background with `--zg-primary` text |
| Attachment state | `Active` green · `Removed` gray · `Unavailable` amber |

Every badge is a pill with 1 px border, 12 px horizontal padding, and readable text at 0.8125 rem.
Colour is redundant with the text in all cases (AC-38).

## 9. Responsive rules

| Viewport | Rules |
|---|---|
| Desktop ≥ 992 px | Two-column form grid; full ticket table; content centred at max 1120 px |
| Tablet 768–991 px | Two-column where practical; Summary and Description keep full width; Related System column hidden |
| Mobile < 768 px | Everything stacks; controls ≥ 44 px touch target; ticket cards replace the table; toolbar wraps to two rows |
| All sizes | No clipped labels, no overlapping messages, no hidden buttons, no unreadable attachment names, and never horizontal page scrolling |

## 10. Accessibility rules

- Every control has a programmatically associated `<label>`; placeholders never act as labels.
- Validation messages are linked with `aria-describedby` and the field carries `aria-invalid`.
- Live regions: submission results and list-loading announcements use `aria-live="polite"`.
- Keyboard: every interactive element is reachable in a logical tab order with a visible focus ring;
  the removal modal traps focus and closes on `Esc` (AC-39).
- Icon-only controls expose an `aria-label` and a tooltip (AC-40).
- Colour is never the sole carrier of meaning (AC-38).

## 11. Visual inspection checklist

Completed against real screenshots at three viewports, not from memory (AC-35).

| # | Check | Desktop | Tablet | Mobile |
|---|---|---|---|---|
| V-01 | Zen Green tokens used; no stray hex colours | ✅ | ✅ | ✅ |
| V-02 | Read-only fields visibly distinct from editable fields | ✅ | ✅ | ✅ |
| V-03 | Required asterisks present and validation messages sit under their own field | ✅ | ✅ | ✅ |
| V-04 | Button hierarchy correct; busy and disabled states visible | ✅ | ✅ | ✅ |
| V-05 | No clipped labels or truncated attachment names | ✅ | ✅ | ✅ |
| V-06 | No overlapping messages or controls | ✅ | ✅ | ✅ |
| V-07 | No unintended horizontal page scrolling | ✅ | ✅ | ✅ |
| V-08 | Badges consistent and readable without colour | ✅ | ✅ | ✅ |
| V-09 | Filters, pagination, and attachment controls usable at this size | ✅ | ✅ | ✅ |
| V-10 | Loading, empty, no-results, and failure states all reachable and clear | ✅ | ✅ | ✅ |
| V-11 | Focus ring visible on every interactive control | ✅ | ✅ | ✅ |
| V-12 | Active navigation item unmistakable | ✅ | ✅ | ✅ |

Completed in Issue 7 against the screenshots listed in §12, captured at 1280×800, 820×1180, and
390×844. V-07 is additionally asserted automatically in `e2e/lab-02/responsive.spec.ts`, which also
fails if any element inside `main` overflows its own container.

**Defects this inspection found and fixed**

| Finding | Fix |
|---|---|
| The My Tickets table was wider than its card at 1280 px and pushed the whole page into horizontal scrolling at 820 px. | The card now clips and an inner `.zg-table-wrap` scrolls, so a wide table never makes the page scroll sideways; the summary column also truncates earlier on tablet. |
| The mobile menu toggle stayed visible at desktop width, because `.zg-btn`'s `display` won on specificity. | The rule became `.zg-header .zg-menu-toggle`, so the toggle is hidden from 992 px up. |

## 12. Screenshot paths

Captured by Playwright at 1280×800 (desktop), 820×1180 (tablet), and 390×844 (mobile):

```
artifacts/lab-02/screenshots/
├── create-ticket/{desktop,tablet,mobile}-{initial,validation,submitting,success,api-failure,invalid-attachment}.png
├── my-tickets/{desktop,tablet,mobile}-{list,search,filtered,empty,no-results,failure}.png
├── ticket-detail/{desktop,tablet,mobile}-{view,attachment-added,removal-dialog,removed}.png
└── requester-selection/{desktop,tablet,mobile}-{initial,loading,empty,failure}.png
```
