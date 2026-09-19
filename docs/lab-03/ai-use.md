# Lab 3 — AI Use and Reflection

**LLM / agent used:** Claude Opus 5, in the same two roles as Lab 2.

- **Specification agent (chat):** turned the Lab 3 handout into the Sprint 3 engineering contract —
  `specification.md`, `api-spec.md`, `ui-spec.md` and `tests.md` — and decomposed the sprint into
  eight GitHub Issues with their branch names and dependencies, before any code existed.
- **Coding agent (Claude Code in the terminal):** implemented one Issue per feature branch against
  that contract, wrote and ran the migrations and the unit, API, component and Playwright suites,
  and drove a real browser to verify the states a unit test cannot prove.

I reviewed every generated file, command and migration, and stopped the agent after each Pull Request
until my peer reviewer had approved and merged it.

## Selected key prompts

Prompts are given in English. Several were written in Thai during the sprint and are translated here
without changing their meaning.

| # | Prompt name | Actual prompt text | What it produced |
|---|---|---|---|
| 1 | Fix the shape of the sprint before starting | "Plan Lab 3 properly. Do not let it turn into an endless stream of Pull Requests like last time. Finish each Issue, get my peer's approval before moving to the next, and do not add Pull Requests as you go — plan it well and finish on the plan." | A locked plan of 8 Issues → 8 feature Pull Requests → 1 release, published before Issue 1 was written. Lab 2 had ended with a tenth Pull Request cleaning up after the ninth; Lab 3 shipped exactly the nine that were planned. |
| 2 | Migrate the identity, do not recreate it | "The Lab 2 Development Requester has to become a real authenticated User without losing a single existing Ticket or Attachment. Show me the migration SQL before it runs, and explain what the auto-generated one would have done instead." | The generated migration would have dropped `RequesterUser` and created `User`, destroying every Lab 2 foreign key. The committed migration renames the table in place (BR-58, decision D-06), which is what made "no data lost" checkable rather than hoped for. |
| 3 | Make the failure modes indistinguishable | "Decide and justify what a request for something that is not the caller's returns, per resource type. I want a rule I can defend, not a case-by-case answer." | Decisions D-05 and C-03: a Ticket or Attachment that is not yours answers 404, and an Internal Note endpoint answers 404 to a Requester while the staff queue answers 403. A 403 on a note endpoint would confirm that notes exist on that ticket. |
| 4 | Authorization lives in the backend | "Hiding a button is not authorization. For every protected operation, write a test that calls the endpoint directly as each role that must be refused — not only as the role that is allowed." | `authorization.api.test.ts`, plus a role check on every route rather than a check remembered per screen. The end-to-end suite repeats it from the browser: a signed-in Requester calling `/api/staff/tickets` and `/api/admin/users` gets 403 both times. |
| 5 | One table for the workflow | "The status transition matrix must exist in exactly one place. The API must validate against it and the Status select must be built from it, so they cannot drift apart." | `server/src/lib/transitions.ts` holds the §5.1 matrix; the screen offers only what it permits and the API re-checks every transition. The unit test transcribes the matrix from the specification by hand, so editing the implementation table fails the test instead of redefining the rule. |
| 6 | Say which safety rule wins | "The sole Administrator deactivating their own account breaks two rules at once. Decide which one answers, and justify it." | `LAST_ADMINISTRATOR` is checked before `SELF_DEACTIVATION`. "You cannot deactivate your own account" would imply another account could do it, which is false; "at least one active Administrator must remain" is the reason that actually holds. |
| 7 | Measure the layout, do not look at it | "For Issue 8, assert responsiveness instead of eyeballing it: no horizontal page scroll and no element wider than the viewport, at 1280, 820 and 390 px, on every Lab 3 screen. Capture the screenshots as a side effect." | `responsive.spec.ts`, 15 checks and 33 screenshots. Its first run failed correctly: the nine-column queue table does extend past the viewport, inside the `.zg-table-wrap` scroller it was designed for, so the assertion had to learn the difference between a deliberate scroller and a layout defect. |
| 8 | A test may not damage the demonstration data | "The Administrator suite has to change global state to test the last-Administrator rule. Make sure it cannot leave the seeded accounts changed, and check what it actually left behind." | It had already demoted the seeded Administrator to IT Staff on an earlier run. The fixture now restores what it suspends in `finally` and again in `afterAll`, and the server test files run one at a time because they share a database. The same concern produced the Playwright teardown that deletes the accounts the end-to-end suites create. |
| 9 | Do not report done without the evidence | "Before you tell me an Issue is finished: run both suites, type check both workspaces, drive the browser through the success and the failure case, and tell me exactly what you ran and what you skipped." | Every Pull Request body carries a table of what was actually executed. It is also how two flaky tests were caught rather than shipped: a full-suite run that failed once in four, traced to a test that depended on a previous test having run. |
| 10 | Check the plan against the source | "Here is the handout PDF I forgot to give you. Is Issue 6 actually right? Do not change anything unless it is wrong." | A verification pass rather than a change: the Issue mapped to §8.4 and the required test file names matched. It also surfaced one deliberate divergence worth stating — §4.5 allows an Administrator to own and prioritise tickets, while §4.3 leaves that to the authorization matrix, and ours keeps the two roles separate (decision D-10). |

## My Reflection

The prompt that shaped this sprint was the first one, and it was about process rather than code. Lab 2
produced ten Pull Requests for eight Issues because "finished" kept meaning "written"; fixing that
needed a rule the agent could be held to — a branch becomes a Pull Request only when its tests run,
its types check and its evidence is captured — not a better feature prompt. Nine planned, nine
shipped.

The second thing I learned is that an agent will protect the code and not the environment around it.
Twice the tests were green while something else was quietly wrong: the Administrator suite demoted the
seeded Administrator and left it that way, and the end-to-end suites filled the user list with test
accounts because the product deactivates rather than deletes. Neither failed a single assertion. Both
were found by asking what the run had left behind, which is a question the agent does not ask itself.

Where it was genuinely strong was in holding one rule in one place. The transition matrix, the
404-not-403 decision and the ordering of the two Administrator safety rules are all cases where I
stated the constraint and the reason, and the implementation, the tests and the screen stayed
consistent with it without being reminded. Deciding what the constraint should be, and what counts as
proof that it holds, stayed mine.
