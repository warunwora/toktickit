# Lab 2 — AI Use and Reflection

**LLM / agent used:** Claude Opus 5, in two roles.

- **Specification agent (chat):** turned the Lab 2 handout into the engineering contract —
  `specification.md`, `api-spec.md`, `ui-spec.md`, `tests.md` — and decomposed the sprint into eight
  GitHub Issues with their dependencies and branch names.
- **Coding agent (Claude Code, terminal):** implemented one Issue per feature branch against that
  contract, ran the migrations, tests and Playwright suites, and drove the browser to check states it
  could not assert from a unit test.

I reviewed every generated file, command and migration, and stopped the agent between Issues so my
peer reviewer could review and merge before the next branch started.

## Selected key prompts

| # | Prompt name | Actual prompt text (abridged where marked) | What I did with the result |
|---|---|---|---|
| 1 | Read the handout first | "อ่านไฟล์ให้เข้าใจ จากนั้นค่อย ๆ ทำทีละขั้นตอน โดยเมื่อเสร็จแต่ละอันต้องรอเพื่อนมา comment, approve และ merge ให้ ไม่ใช่ทำทีเดียว make no mistake" | Set the whole working rhythm: one Issue → one branch → one PR → stop. It is why the sprint has eight reviewable PRs instead of one unreviewable one. |
| 2 | Write the contract before any code | "Issue 1: เขียน engineering contract 4 ไฟล์ ไม่มีโค้ดเลย" (paraphrased from the plan) | Produced FR-01…FR-20, BR-01…BR-44, AC-01…AC-40, the API contract and the UI spec, plus 67 planned tests mapped to acceptance criteria — all merged before the first line of implementation. |
| 3 | Force the ambiguous decisions | "Decision สำคัญที่ต้องอธิบายได้ตอนส่ง" — asked the agent to state and justify identity handling, the ownership status code, and the ticket-number strategy | Gave me D-01…D-09 in `specification.md`. The one I defend most often is answering **404 instead of 403** for another Requester's ticket: 403 would confirm the ticket exists. |
| 4 | Data model with justified indexes | "Issue 2: data model + seed … at least one database-design decision must be justified" | `Ticket(requesterId, createdAt)` — every My Tickets query filters by requester and sorts by createdAt desc, so one composite index serves both the filter and the sort. |
| 5 | Keep the testing identity swappable | Asked for the Development Requester to be resolved in exactly one backend helper | `resolveRequester()` reads `X-Requester-Id` in one file, so Lab 3 replaces its body with a session lookup without touching a single route (BR-43). |
| 6 | Do not build a control that cannot work | Told the agent not to put an attachment picker on Create Ticket until the upload endpoint existed | The picker shipped in Issue 6 together with `POST /api/tickets/:id/attachments`, so no screen ever had a dead control during a demo. |
| 7 | Prove the failure cases, not the happy path | "ต้องพิสูจน์ ownership, soft removal, duplicate submission" | Tests that assert a foreign ticket and a missing ticket return byte-identical responses, that a removed attachment answers 410 rather than 404, and that a repeated submission returns 409 with the original ticket number. |
| 8 | Measure the layout, do not trust it | "Issue 7: Playwright E2E + screenshot 3 ขนาดจอ" | The responsive run failed first: the ticket table overflowed its card at 1280 px and pushed the page into horizontal scrolling at 820 px, and the mobile menu button stayed visible on desktop. Both are recorded in `ui-spec.md` §11 with their fixes. |
| 9 | Did you actually verify this? | "อันนี้เช็กแล้วใช่ไหมว่าทุกอย่างครบและถูกต้อง" (asked during Lab 1, reused throughout Lab 2) | The most valuable prompt of the two labs. The first completion report listed work as done that had been written but never run; after this the agent started merging branches into a throwaway branch, running both suites, and curling the endpoints before claiming anything. |
| 10 | Tell me what to capture | "ถ้ามีส่วนไหนที่ต้องแคป เช่นพวกคำสั่ง หรือแคปในโปรแกรมไหน ให้บอกด้วยเสมอ" | Every Issue report ended with the exact screens, commands and states to capture, so the evidence was collected while the state existed instead of being reconstructed at submission time. |

## My Reflection

The prompts that worked were the ones that named a constraint and the proof it demanded — "PR base
must be `lab2-staging`", "prove the seed is idempotent by running it twice" — rather than asking for
an outcome like "make attachments work". Asking "did you actually verify this?" was worth more than
any feature prompt: it repeatedly turned a confident "done" into a list of things that had been
written but never executed, and it is the reason the agent now merges branches into a throwaway
branch and runs the suites before reporting. I also had to reject the agent's work twice on
judgement rather than correctness: once when it planned to capture demo and test screenshots from
`feature/lab2-4-create-ticket`, where `/api/health` was still the old stub so the app would have
demoed as Offline, and once when a test suite deleted the first seeded requester's tickets to make
its counts exact — green tests, but it wiped the demo data every run. The agent is fast and precise
inside a well-stated contract; deciding what the contract should say, and what counts as evidence, is
still mine.
