# Lab 4 — Peer Review Record

**Author:** Warun Woraphoo — 67070563438 — GitHub [@warunwora](https://github.com/warunwora) — Section 31
**Peer reviewer:** Asamaporn Chayanuntasakul — 67070503448 — GitHub [@asamapornch](https://github.com/asamapornch)

Repository: https://github.com/warunwora/toktickit
Project board: https://github.com/users/warunwora/projects/1
Branch flow: `feature/*` → `lab4-staging` → `main`. No commit was made directly on `main` or
`lab4-staging`; every change reached them through a reviewed Pull Request.

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
| this PR | [#55](https://github.com/warunwora/toktickit/issues/55) End-to-end tests, evidence and final documentation | `feature/lab4-7-e2e-docs` | `lab4-staging` | Under review |
| release | — Lab 4 release | `lab4-staging` | `main` | Not yet opened |

Eight Pull Requests, the number the sprint was planned with. The last two rows are completed once
their reviews exist; nothing is recorded here before it has happened.

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

---

## 2. Pull Requests I reviewed for my partner

Partner repository: https://github.com/asamapornch/toktickit

At the time of writing my partner had not yet opened a Lab 4 Pull Request (their most recent is
[#57](https://github.com/asamapornch/toktickit/pull/57), from Sprint 3). Their Lab 4 reviews are
recorded here when they happen.

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
