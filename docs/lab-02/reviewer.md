# Lab 2 — Peer Review Record

**Author:** Warun Woraphoo — 67070563438 — GitHub [@warunwora](https://github.com/warunwora) — Section 31
**Peer reviewer:** Asamaporn Chayanuntasakul — 67070503448 — GitHub [@asamapornch](https://github.com/asamapornch)

Repository: https://github.com/warunwora/toktickit
Project board: https://github.com/users/warunwora/projects/1
Branch flow: `feature/*` → `lab2-staging` → `main`. No commit was made directly on `main` or
`lab2-staging`.

---

## 1. Pull Requests I authored, reviewed by my partner

| PR | Issue | Branch | Base | Verdict |
|----|-------|--------|------|---------|
| [#21](https://github.com/warunwora/toktickit/pull/21) | [#13](https://github.com/warunwora/toktickit/issues/13) Sprint specification and test plan | `feature/lab2-1-spec` | `lab2-staging` | Approved |
| [#22](https://github.com/warunwora/toktickit/pull/22) | [#14](https://github.com/warunwora/toktickit/issues/14) Data model and seed | `feature/lab2-2-data-model` | `lab2-staging` | Approved |
| [#23](https://github.com/warunwora/toktickit/pull/23) | [#15](https://github.com/warunwora/toktickit/issues/15) Reference APIs, requester context, Zen Green shell | `feature/lab2-3-requester-context` | `lab2-staging` | Approved |
| [#24](https://github.com/warunwora/toktickit/pull/24) | [#16](https://github.com/warunwora/toktickit/issues/16) Create Ticket API and screen | `feature/lab2-4-create-ticket` | `lab2-staging` | Approved |
| [#25](https://github.com/warunwora/toktickit/pull/25) | [#17](https://github.com/warunwora/toktickit/issues/17) My Tickets API and screen | `feature/lab2-5-my-tickets` | `lab2-staging` | Approved |
| [#26](https://github.com/warunwora/toktickit/pull/26) | [#18](https://github.com/warunwora/toktickit/issues/18) Ticket Detail and attachment lifecycle | `feature/lab2-6-ticket-detail` | `lab2-staging` | Approved |
| [#27](https://github.com/warunwora/toktickit/pull/27) | [#19](https://github.com/warunwora/toktickit/issues/19) E2E, responsive checks, screenshots | `feature/lab2-7-e2e-visual` | `lab2-staging` | Reviewed and merged |
| [#28](https://github.com/warunwora/toktickit/pull/28) | [#20](https://github.com/warunwora/toktickit/issues/20) Final documentation | `feature/lab2-8-docs-release` | `lab2-staging` | Approved |
| [#29](https://github.com/warunwora/toktickit/pull/29) | [#20](https://github.com/warunwora/toktickit/issues/20) Documentation set completed | `feature/lab2-9-ai-use-polish` | `lab2-staging` | Approved |
| [#30](https://github.com/warunwora/toktickit/pull/30) | — Lab 2 release | `lab2-staging` | `main` | Approved |

### Comments I received, and how I responded

**PR #21 — Sprint specification and test plan**
> **@asamapornch:** looks good. docs/lab-02 got everything. approve

My response: "okk thanks" — no change was needed; the contract was reviewed before any code existed,
which is the point of Spec DD.

**PR #22 — Data model and seed**
> **@asamapornch:** checked schema and seed. run seed 2 times no duplicate. approve

My response: "thanks for checking" — the idempotency re-run was exactly the check I wanted a second
pair of eyes on, because a non-idempotent seed only shows up on the second run.

**PR #23 — Reference APIs, Development Requester context, Zen Green shell**
> **@asamapornch:** tried the selector. inactive user not showing. api ok. approve

My response: "yea that one was tricky lol thanks" — the inactive requester has to be filtered in the
API and re-checked on start-up (BR-06, BR-10), so being tested from the UI side mattered.

**PR #24 — Create Ticket API and screen**
> **@asamapornch:** made a ticket, number come from backend. validation msg ok. approve

My response: "got it thank u" — the reviewer confirmed the ticket number came from the backend rather
than the browser, which is BR-01.

**PR #25 — My Tickets API and screen**
> **@asamapornch:** List, search, filters, and pagination DTO tested. Responsive UI looks good on both
> desktop and mobile. LGTM!

My response: "Alright thanks gus" — the responsive part of this comment turned out to be optimistic:
the Playwright run in Issue 7 found the ticket table overflowing its card, and I fixed it in PR #27.

**PR #26 — Ticket Detail and attachment lifecycle**
> **@asamapornch:** upload download remove all ok. removed one still show but cant download. approve

My response: "yesss thank u" — that sentence is exactly the soft-removal rule (BR-36, BR-39): the
metadata survives, the content does not.

**PR #27 — E2E, responsive checks, screenshots**
> **@asamapornch:** e2e pass. mobile screenshot look fine. approve

My response: "Pass omg thanks" — reviewed and merged after the two layout defects found by the
responsive run were fixed in the same PR.

---

## 2. Pull Requests I reviewed for my partner

Partner repository: https://github.com/asamapornch/toktickit

| PR | Scope | My verdict |
|----|-------|------------|
| [#19](https://github.com/asamapornch/toktickit/pull/19) | Spec DD engineering contract and test plan | Approved |
| [#20](https://github.com/asamapornch/toktickit/pull/20) | Prisma domain models, seed data, reference APIs | Approved |
| [#21](https://github.com/asamapornch/toktickit/pull/21) | Dev Requester selector, middleware, Zen Green shell | Approved |
| [#22](https://github.com/asamapornch/toktickit/pull/22) | Ticket creation, `TKT-YYYY-NNNNN` sequence, create form | Approved |
| [#23](https://github.com/asamapornch/toktickit/pull/23) | My Tickets list with isolation, search, filters, pagination | Approved |
| [#24](https://github.com/asamapornch/toktickit/pull/24) | Ticket detail, attachment upload, download, soft removal | Approved |
| [#25](https://github.com/asamapornch/toktickit/pull/25) | Playwright E2E suites and UI screenshot deliverables | Approved |
| [#26](https://github.com/asamapornch/toktickit/pull/26) | Lab 2 release into `main` | Approved |

### Comments I gave, and how my partner responded

**Partner PR #19 — engineering contract**
> **Me:** LGTM! Contract files and baseline requirements in docs/lab-02/ look solid. Ready to merge.

Partner's response: "thanks."

**Partner PR #20 — data model and reference APIs**
> **Me:** Checked schema, seeds, and reference APIs (/categories, /related-systems). All tests passed
> successfully. Approved! 👍

Partner's response: "nice, thanks"

**Partner PR #21 — requester context**
> **Me:** Middleware and requester selector UI look great. Zen Green theme is aligned with specs.
> Merging this!

Partner's response: "done"

**Partner PR #22 — ticket creation**
> **Me:** Ticket creation and annual sequence generator work as expected. All unit, API, and E2E tests
> are green. ✅

Partner's response: "done"

**Partner PR #23 — My Tickets**
> **Me:** List, search, filters, and pagination DTO tested. Responsive UI looks good on both desktop
> and mobile. LGTM!

Partner's response: "ok, thanks."

**Partner PR #24 — ticket detail and attachments**
> **Me:** Detail view and attachment lifecycle (including soft-removal with HTTP 410) verified. Great
> job, approved!

Partner's response: "thanks for checking"

**Partner PR #25 — E2E and screenshots**
> **Me:** E2E test suites and UI screenshots in artifacts/ are fully populated. Documentation
> (reviewer.md, ai-use.md) looks complete. Ready!

Partner's response: "nice"

**Partner PR #26 — release**
> **Me:** Final integration verified on clean main. All tests passed. Ready for submission!

Partner's response: "thanks for reviewed and approved."
