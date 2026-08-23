# Lab 2 — AI Use and Reflection

**LLM / agent used:** Claude Opus 5, in two distinct roles.

- **Specification agent (chat):** turned the Lab 2 handout into the engineering contract —
  `specification.md`, `api-spec.md`, `ui-spec.md` and `tests.md` — and decomposed the sprint into
  eight GitHub Issues with their dependencies and branch names.
- **Coding agent (Claude Code in the terminal):** implemented one Issue per feature branch against
  that contract, ran the migrations, unit, API and Playwright suites, and drove a real browser to
  verify the states a unit test cannot prove.

I reviewed every generated file, command and migration, and paused the agent between Issues so my
peer reviewer could review and merge each Pull Request before the next branch was created.

## Selected key prompts

Prompts are given in English. Several were originally written in Thai during the sprint and are
translated here without changing their meaning.

| # | Prompt name | Actual prompt text | What it produced |
|---|---|---|---|
| 1 | Establish the working rhythm | "Read the Lab 2 handout in full before doing anything. Then work through it one step at a time: after each Issue is finished, stop and wait for my peer reviewer to comment, approve and merge it. Do not batch several Issues into one Pull Request." | Eight small, individually reviewable Pull Requests instead of one nobody could review, and every Issue passed through Specified → Started → PR Review → Done for real rather than retrospectively. |
| 2 | Write the contract before any code | "For Issue 1, produce the Sprint 2 engineering contract only — no implementation code. Write `specification.md` with numbered functional requirements, business rules, acceptance criteria in Given/When/Then form, the data model with justified indexes and a product Definition of Done; `api-spec.md` with every endpoint's request and response shape, validation, status codes and error bodies; `ui-spec.md` with the Zen Green tokens, component states and responsive rules; and `tests.md` with a planned-test table where every acceptance criterion maps to at least one test and every test names the file it will live in." | FR-01…FR-20, BR-01…BR-44, AC-01…AC-40, 11 endpoints and 67 planned tests, all merged before the first line of implementation existed. The traceability matrix made "are we done?" a lookup instead of an opinion. |
| 3 | Force the ambiguous decisions into the open | "The handout leaves several decisions to me. For each one, state the choice and the reason I would have to defend if asked: how the Development Requester identity travels between client and server, what status code a request for another Requester's ticket returns, how the official ticket number is generated, and where uploaded files are stored." | Decisions D-01…D-09 in `specification.md`. The one I am asked about most is answering **404 rather than 403** for another Requester's ticket: a 403 would confirm the ticket exists, so 404 keeps its existence private — the behaviour we want to keep once real authentication arrives. |
| 4 | Justify the data model, not just draw it | "Implement the Prisma models for the Lab 2 increment with foreign keys, soft-removal fields and an idempotent seed. At least one index must be justified in writing: name the query it serves and why that query needs it." | `Ticket(requesterId, createdAt)` — every My Tickets query filters by requester and sorts by `createdAt` descending, so one composite index serves both instead of a full scan plus an in-memory sort. Running the seed twice became the proof of idempotency. |
| 5 | Keep the temporary identity swappable | "The Development Requester selector is a Lab 2 testing mechanism, not authentication. Resolve the current Requester in exactly one backend helper so Lab 3 can replace its body with a session or token lookup without touching a single route, and label the selector clearly in the UI so it can never be mistaken for a login screen." | `resolveRequester()` reads the `X-Requester-Id` header in one file (BR-43), and the selection screen carries the explicit "this is not a login screen" text (BR-44). |
| 6 | Never ship a control that cannot work yet | "Do not add the attachment picker to the Create Ticket screen until the upload endpoint exists. A screen must never show a control that silently does nothing during a demonstration." | The picker shipped in Issue 6 together with `POST /api/tickets/:id/attachments`; until then the form stated that attachments are added after the ticket is created. |
| 7 | Test the failure paths, not the happy path | "Write tests that prove the rules that are easy to get wrong: that a ticket belonging to another Requester and a ticket that does not exist return identical responses, that a soft-removed attachment answers 410 on download while its metadata stays visible, that a repeated identical submission is rejected as a duplicate, and that a sixth attachment upload is refused." | A test that compares the two 404 responses field by field, a 410 assertion on the removed attachment, and a 409 that returns the original ticket number so the user can find the ticket they already created. |
| 8 | Measure the layout instead of trusting it | "For Issue 7, add Playwright end-to-end and responsive suites. Assert at desktop, tablet and mobile viewports that no page scrolls horizontally and that nothing overflows its own container, and capture the screenshot evidence into `artifacts/lab-02/screenshots/`." | The responsive suite failed on its first run and exposed two real defects: the ticket table was wider than its card at 1280 px and pushed the page into horizontal scrolling at 820 px, and the mobile menu button stayed visible on desktop because a base button rule beat the media query on specificity. Both fixes are recorded in `ui-spec.md` §11. |
| 9 | Refuse "done" without evidence | "Before reporting that this is finished, verify it: merge the branches, run both test suites, type check, call the endpoints, and drive the browser through the success and failure cases. Then tell me what you actually ran and what is still missing." | The most valuable prompt of the sprint. An earlier completion report had listed work as done that was written but never executed; afterwards the routine became merge into a throwaway branch, run every suite, curl the endpoints, and report the gaps explicitly. |
| 10 | Say what evidence to capture, and when | "Whenever a step produces something that has to appear in the submission, tell me exactly what to capture, on which screen or with which command, and at which moment." | Every Issue report ended with a capture list, so evidence was collected while the state still existed — a validation failure, an offline backend, a card in PR Review — instead of being reconstructed at submission time. |

## My Reflection

The prompts that worked named a constraint and the proof it demanded — "the PR base must be
`lab2-staging`", "prove the seed is idempotent by running it twice" — rather than asking for an
outcome such as "make attachments work". Asking *"did you actually verify this?"* was worth more than
any feature prompt: it repeatedly converted a confident "done" into a list of things that had been
written but never run, and it is the reason the agent now merges into a throwaway branch and executes
every suite before claiming completion. I also had to overrule the agent twice on judgement rather
than correctness: once when it planned to capture the demo and test evidence from
`feature/lab2-4-create-ticket`, where `/api/health` was still the old stub so the application would
have demonstrated as Offline; and once when a test suite deleted the first seeded Requester's tickets
to make its counts exact — the tests were green, but every run silently destroyed the demonstration
data. The agent is fast and precise inside a well-stated contract. Deciding what that contract should
say, and what counts as evidence, remained mine.
