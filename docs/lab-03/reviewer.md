# Lab 3 — Peer Review Record

**Author:** Warun Woraphoo — 67070563438 — GitHub [@warunwora](https://github.com/warunwora) — Section 31
**Peer reviewer:** Asamaporn Chayanuntasakul — 67070503448 — GitHub [@asamapornch](https://github.com/asamapornch)

Repository: https://github.com/warunwora/toktickit
Project board: https://github.com/users/warunwora/projects/1
Branch flow: `feature/*` → `lab3-staging` → `main`. No commit was made directly on `main` or
`lab3-staging`; every change reached them through a reviewed Pull Request.

Sprint 3 was planned as eight Issues and one release before any code was written, and it shipped as
exactly that. Lab 2 had ended with a tenth Pull Request opened to fix what the ninth had missed, so
the rule for this sprint was: a branch is only pushed when its tests run, `tsc` is clean and the
evidence is captured, and the next Issue does not start until the current Pull Request is approved.

---

## 1. Pull Requests I authored, reviewed by my partner

| PR | Issue | Branch | Base | Verdict |
|----|-------|--------|------|---------|
| [#40](https://github.com/warunwora/toktickit/pull/40) | [#32](https://github.com/warunwora/toktickit/issues/32) Sprint 3 engineering contract | `feature/lab3-1-spec` | `lab3-staging` | Approved |
| [#41](https://github.com/warunwora/toktickit/pull/41) | [#33](https://github.com/warunwora/toktickit/issues/33) Data model migration and seed | `feature/lab3-2-data-model` | `lab3-staging` | Approved |
| [#42](https://github.com/warunwora/toktickit/pull/42) | [#34](https://github.com/warunwora/toktickit/issues/34) Authentication and authorization foundation | `feature/lab3-3-auth-api` | `lab3-staging` | Approved |
| [#43](https://github.com/warunwora/toktickit/pull/43) | [#35](https://github.com/warunwora/toktickit/issues/35) Login, mandatory password change, role-aware shell | `feature/lab3-4-auth-ui` | `lab3-staging` | Approved |
| [#44](https://github.com/warunwora/toktickit/pull/44) | [#36](https://github.com/warunwora/toktickit/issues/36) IT Staff Ticket Queue | `feature/lab3-5-staff-queue` | `lab3-staging` | Approved |
| [#45](https://github.com/warunwora/toktickit/pull/45) | [#37](https://github.com/warunwora/toktickit/issues/37) Ticket Detail, ownership, priority, status, comments and notes | `feature/lab3-6-staff-ticket-ops` | `lab3-staging` | Approved |
| [#46](https://github.com/warunwora/toktickit/pull/46) | [#38](https://github.com/warunwora/toktickit/issues/38) Administrator user management | `feature/lab3-7-user-admin` | `lab3-staging` | Approved |
| [#47](https://github.com/warunwora/toktickit/pull/47) | [#39](https://github.com/warunwora/toktickit/issues/39) End-to-end tests, responsive evidence, final documentation | `feature/lab3-8-e2e-docs` | `lab3-staging` | Awaiting review |
| #48 | — Lab 3 release | `lab3-staging` | `main` | Not yet opened |

The last two rows are completed and recorded here when their reviews arrive; this file is the
sprint's review record, so nothing is written into it before it has happened.

### Comments I received, and how I responded

**PR #40 — Sprint 3 engineering contract**
> **@asamapornch:** spec looks fine. docs/lab-03 got all 4 files. like that 404 not 403 thing. approve

My response: "thanks! yea 403 would tell them the ticket exist so 404 is safer" — the detail the
reviewer picked out is decision D-05: an ownership violation on a Ticket, an Attachment or an
Internal Note answers 404, because a 403 confirms the resource exists.

**PR #41 — Data model migration and seed**
> **@asamapornch:** checked the migration sql. rename table is smart, no data lost. ran seed 2 times,
> nothing duplicate. approve

My response: "yea the auto generate one wanted to drop the table lol. good catch on the seed" — the
generated migration would have dropped `RequesterUser` and created `User`, taking every Lab 2 Ticket
foreign key with it. The hand-edited migration renames the table in place (BR-58, decision D-06).

**PR #42 — Authentication and authorization foundation**
> **@asamapornch:** tested login with curl. wrong pass and wrong email same message. approve

My response: "thanks, same message so nobody can guess the email" — the two failures return a
byte-identical body, which is what stops the login form being used to enumerate accounts (BR-05).

**PR #43 — Login, mandatory password change and the role-aware shell**
> **@asamapornch:** login and change password work. logout kick me back. approve

My response: "thanks, any 401 drop the session on the client too" — the API client calls one
unauthorized handler on every 401, so a session the server has already destroyed cannot keep the
application rendered.

**PR #44 — IT Staff Ticket Queue**
> **@asamapornch:** queue look good. filter and sort work. unassigned badge clear. approve

My response: "thanks" — the Unassigned badge the reviewer mentions is AC-31: an unowned ticket shows
a badge, never an empty cell, so "nobody has this" is visible rather than inferred.

**PR #45 — IT Staff Ticket Detail, ownership, priority, status, comments and notes**
> **@asamapornch:** claim work, status list correct, note hidden from requester. approve

My response: "thanks, close and cancel ask confirm first" — both are terminal, so the UI confirms
before sending either (BR-39). The reviewer checking the note from the Requester's side is AC-14,
the rule the whole Internal Notes design exists to protect.

**PR #46 — Administrator user management**
> **@asamapornch:** user list ok, search and role filter work. cannot kill last admin. approve

My response: "thanks, last admin rule check before self rule so message correct" — when the sole
Administrator tries to deactivate themselves both safety rules apply, and the answer is
`LAST_ADMINISTRATOR` rather than `SELF_DEACTIVATION`, because the second would suggest another
account could do it.

**PR #47 — End-to-end tests, responsive evidence and final documentation**

Awaiting review at the time of writing. The reviewer's comment and my response are added here before
the release Pull Request is opened.

**PR #48 — Lab 3 release into `main`**

Not yet opened; it follows the approval of PR #47.

---

## 2. Pull Requests I reviewed for my partner

Partner repository: https://github.com/asamapornch/toktickit

| PR | Scope | My verdict |
|----|-------|------------|
| [#42](https://github.com/asamapornch/toktickit/pull/42) | Spec-DD engineering contract suite for Sprint 3 | Approved |
| [#44](https://github.com/asamapornch/toktickit/pull/44) | Data model migration, idempotent seed, auth backend | Approved |
| [#46](https://github.com/asamapornch/toktickit/pull/46) | Login screen and role-based shell | Approved |
| [#48](https://github.com/asamapornch/toktickit/pull/48) | IT Staff ticket queue | Approved |
| [#50](https://github.com/asamapornch/toktickit/pull/50) | IT ticket detail view and workflow | Approved |
| [#52](https://github.com/asamapornch/toktickit/pull/52) | Administrator user management and safety enforcement | Approved |
| [#54](https://github.com/asamapornch/toktickit/pull/54) | Regression integration suite and end-to-end acceptance specs | Approved |
| [#55](https://github.com/asamapornch/toktickit/pull/55) | Sprint 3 production release | Approved |

### Comments I gave

**Partner PR #42 — engineering contract**
> **Me:** The documents look good. Please make sure the IDs are consistent.

Numbered rules are only useful if every reference resolves, so the BR, AC and test IDs have to line
up across the four documents before any code is written against them.

**Partner PR #44 — data model migration and seed**
> **Me:** Please verify the migration keeps the existing Lab 2 data.

The whole risk in Sprint 3 is the identity migration: a wrong migration silently discards Lab 2
tickets, and the seed will happily repopulate around the hole.

**Partner PR #46 — login screen and role-based shell**
> **Me:** Please check the required login and password-change screens.

The mandatory first-login change is the one screen that must be unavoidable; anything that routes
around it defeats the initial-password design.

**Partner PR #48 — IT staff ticket queue**
> **Me:** Please verify queue permissions and responsive layouts.

A nine-column table is where horizontal overflow appears first, and a queue endpoint is where a
Requester should be refused by the backend rather than by a hidden link.

**Partner PR #50 — IT ticket detail view and workflow**
> **Me:** Please check Internal Notes permissions and status transitions.

These are the two rules with real consequences on this screen: a note reaching a Requester is a
privacy failure, and an unchecked transition puts a ticket in a state the workflow never permits.

**Partner PR #52 — administrator user management and safety enforcements**
> **Me:** Please make sure Admin safety rules are enforced by the backend.

A disabled button is feedback. Self-deactivation and the last-Administrator rule have to hold for a
request sent straight to the API.

**Partner PR #54 — regression suite and end-to-end specs**
> **Me:** Please verify the old requester selector is removed and run the regression tests.

BR-61 removes the selector and its stored state; BR-62 requires the Lab 2 behaviour it used to drive
to keep working under the new identity.

**Partner PR #55 — Sprint 3 release**
> **Me:** great work, approve

---

## 3. What peer review changed in this sprint

Every Pull Request was approved on its first review, which is the result of the rule at the top of
this document rather than of the reviews being light: a branch only became a Pull Request once its
tests ran and its evidence was captured, so there was nothing left for review to catch that a test
had not already caught.

The reviews that mattered most were the two that checked a rule from the outside: running the seed
twice on PR #41, and opening the Requester's view of a commented ticket on PR #45. Both are checks
the author is least likely to make, because the author already knows what the code intends.
