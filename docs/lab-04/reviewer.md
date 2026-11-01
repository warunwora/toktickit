# Lab 4 — Peer Review Record

**Author:** Warun Woraphoo — 67070563438 — GitHub [@warunwora](https://github.com/warunwora) — Section 31
**Peer reviewer:** Asamaporn Chayanuntasakul — 67070503448 — GitHub [@asamapornch](https://github.com/asamapornch)

Repository: https://github.com/warunwora/toktickit
Project board: https://github.com/users/warunwora/projects/1
Branch flow: `feature/*` → `lab4-staging` → `main`. No commit was made directly on `main` or
`lab4-staging`; every change reached them through a reviewed Pull Request. The release Pull Request
is opened from `release/lab4`, which is `lab4-staging` plus the one documentation commit that records
the PR #62 review — a review that could not exist until #62 had been merged.

Sprint 4 was planned as seven Issues and one release before any code was written, and it shipped as
exactly that. Each Pull Request title is its Issue's title. The next Issue was only started after the
previous Pull Request had been approved and merged, checked with
`gh pr view <n> --json state,reviewDecision` at the start of every Issue.

---

## 1. Pull Requests I authored, reviewed by my partner

| PR | Issue | Branch | Base | Verdict |
|----|-------|--------|------|---------|
| [#56](https://github.com/warunwora/toktickit/pull/56) | [#49](https://github.com/warunwora/toktickit/issues/49) Sprint 4 engineering contract | `feature/lab4-1-spec` | `lab4-staging` | Approved |
| [#57](https://github.com/warunwora/toktickit/pull/57) | [#50](https://github.com/warunwora/toktickit/issues/50) Actions Taken data model and API | `feature/lab4-2-actions-api` | `lab4-staging` | Approved |
| [#58](https://github.com/warunwora/toktickit/pull/58) | [#51](https://github.com/warunwora/toktickit/issues/51) Actions Taken on Ticket Detail | `feature/lab4-3-actions-ui` | `lab4-staging` | Approved |
| [#59](https://github.com/warunwora/toktickit/pull/59) | [#52](https://github.com/warunwora/toktickit/issues/52) Ticket workflow, resolution gate and stale updates | `feature/lab4-4-workflow` | `lab4-staging` | Approved |
| [#60](https://github.com/warunwora/toktickit/pull/60) | [#53](https://github.com/warunwora/toktickit/issues/53) Role dashboards | `feature/lab4-5-dashboards` | `lab4-staging` | Approved |
| [#61](https://github.com/warunwora/toktickit/pull/61) | [#54](https://github.com/warunwora/toktickit/issues/54) Final regression and hardening | `feature/lab4-6-hardening` | `lab4-staging` | Approved |
| [#62](https://github.com/warunwora/toktickit/pull/62) | [#55](https://github.com/warunwora/toktickit/issues/55) End-to-end tests, evidence and final documentation | `feature/lab4-7-e2e-docs` | `lab4-staging` | Approved |
| [#63](https://github.com/warunwora/toktickit/pull/63) | Lab 4 release | `release/lab4` | `main` | Approved |

Eight Pull Requests, the number the sprint was planned with. The release was approved and merged into
`main` on 31 Oct. This record is updated by one documentation Pull Request after the release, because
the release review and my partner's Lab 4 Pull Requests did not exist when the release was opened.

### Comments I received, and how I responded

**PR #56 — Sprint 4 engineering contract**
> **@asamapornch:** spec looks good, approve

My response: "thanks!" — the contract the reviewer approved is what every later Pull Request was
measured against: 44 acceptance criteria, each mapped to at least one planned test in `tests.md` §3.

**PR #57 — Actions Taken data model and API**
> **@asamapornch:** actions api looks good, admin can work now. approve

My response: "okie thanks" — "admin can work now" is BR-26: the handout makes Administrators perform
IT Staff behaviour, which reversed Lab 3 decision D-10. The Lab 3 tests that asserted the opposite
were changed in this Pull Request and named in its description, rather than quietly edited.

**PR #58 — Actions Taken on Ticket Detail**
> **@asamapornch:** actions tab looks good, cancel asks reason. approve

My response: "Great, thanks" — Cancel opens a dialog that requires a 3–500 character reason (BR-13),
traps focus and returns it to the button that opened it (ui-spec.md §8).

**PR #59 — Ticket workflow, resolution gate and stale updates**
> **@asamapornch:** can't resolve with open actions now, good. approve

My response: "thank u" — the gate is enforced by the API on every request (BR-19), so it holds for a
client that skips the screen; a ticket with no actions at all is not blocked, so legacy tickets still
resolve (D-02).

**PR #60 — Role dashboards**
> **@asamapornch:** dashboards look good, view links go to right list. approve

My response: "ok thanks" — the drill-down links are built by the server and the end-to-end suite
follows each one and compares the list's total with the card (AC-28, E2E-11 … E2E-13).

**PR #61 — Final regression and hardening**
> **@asamapornch:** recovery drill works, data same after restore. approve

My response: "yes thank u" — the drill in [recovery-drill.md](recovery-drill.md) compares a fingerprint
of every Lab 3 ticket after each step, so "same" is measured, not eyeballed.

**PR #62 — End-to-end tests, evidence and final documentation**
> **@asamapornch:** e2e all pass, screenshots and docs look good. approve

My response: "thanks bro" — the run behind "all pass" is recorded in `tests.md` §6 with its log:
582 tests, 0 failed, including the 21 new Lab 4 end-to-end and responsive tests that found the
version race and the tablet overflow fixed in that Pull Request.

**PR #63 — Lab 4 release**
> **@asamapornch:** lab 4 release looks good, all tests pass. approve

My response: "yay thanks" — the release is `lab4-staging` plus this record; the full run on `main`
after the merge is the one recorded in `tests.md` §6.

---

## 2. Pull Requests I reviewed for my partner

Partner repository: https://github.com/asamapornch/toktickit

I reviewed all six of my partner's Lab 4 Pull Requests into their `lab4-staging`.

| PR | Title | My verdict |
|----|-------|------------|
| [#65](https://github.com/asamapornch/toktickit/pull/65) | Sprint 4 Spec-DD contract suite | Approved |
| [#66](https://github.com/asamapornch/toktickit/pull/66) | Actions Taken foundation (DB + API) | Approved |
| [#67](https://github.com/asamapornch/toktickit/pull/67) | Actions Taken UI | Approved |
| [#68](https://github.com/asamapornch/toktickit/pull/68) | Ticket workflow and resolution gate | Approved |
| [#69](https://github.com/asamapornch/toktickit/pull/69) | Role dashboards | Approved |
| [#70](https://github.com/asamapornch/toktickit/pull/70) | Final hardening, accessibility, and Zen Green polish | Changes requested, then approved |

### Comments I gave, and how my partner responded

**PR #65** — "Great job on the Spec-DD contract! Clear, well-structured, and covers all Lab 4
requirements. Spec looks solid, approved to merge into lab4-staging." Reply: "Thanks for review".

**PR #66** — "DB migration, APIs, and tests look solid. Nice catch cherry-picking the Lab 3 hotfix,
client tests are all green now (28/28)." Reply: "Thanks ka".

**PR #67** — "Client tests passing (34/34). Smart call on JS validation over HTML5 constraints. Clean
role separation, Requester view is strictly read-only in the DOM." Reply: "done for issue3, thanks."

**PR #68** — "All tests passing (Server 114/114, Client 37/37). Clean error order logic (checking
valid transitions before the gate). Good coverage of edge cases, especially handling `CANCELLED`
actions." Reply: "Thanks for approved to merge into lab4-staging".

**PR #69** — "All server (127/127) and client tests (48/48) passing, including new SD-07 and UI-14
tests. Proper E2E triage." Reply: "Thanks".

**PR #70** — changes requested on two points:
1. The requester ticket detail endpoint returned `actionsTaken` with IT's internal description,
   result, follow-up note and attachment notes.
2. The resolution gate counted planned actions and updated the status in separate steps, so a
   concurrent action write could leave a ticket Resolved with an open planned action.

My partner moved the gate check and the status update into one `SELECT … FOR UPDATE` transaction on
the ticket row. They kept Actions Taken visible to Requesters, citing handout §8.3 ("Requesters will
see all Actions Taken items"), but removed internal ids and roles from that response. Their results
were server 137/137, client 55/55 and E2E 15/15, and I approved: "All done".

---

## 3. What peer review changed in this sprint

Every Pull Request was approved on its first review. As in Lab 3 that reflects the rule at the top of
this record rather than light reviews: a branch became a Pull Request only after its suites, the type
check and a browser check had run, so the defects were caught before review — and some were caught
late enough that they are worth recording:

- **Issue 3** found that Issue 2 had left `role` out of `GET /api/staff/assignable-users`, which
  api-spec.md §4.2 requires. It was fixed and named in PR #58 rather than left for a later Issue.
- **Issue 4** found a Lab 3 responsive test that read the queue before it had loaded. It was reported
  in PR #59 as flaky and unrelated, then fixed in PR #60.
- **Issue 7** found two real defects with its new end-to-end and responsive suites: a ticket Save
  pressed straight after an action Save could report the screen's own change as someone else's, and
  the Actions Taken table scrolled the page at tablet width. Both are fixed in this Pull Request.
