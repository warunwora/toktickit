# Lab 4 — AI Use and Reflection

**LLM / agent used:** Claude Opus 5.5, as a coding agent (Claude Code in the desktop app).

- **Specification:** turned the Lab 4 handout into the Sprint 4 engineering contract —
  `specification.md`, `api-spec.md`, `ui-spec.md` and `tests.md` — and split the sprint into seven
  Issues and one release before any code existed.
- **Implementation:** one Issue per feature branch against that contract; wrote the migration, the
  recovery script and drill, and the unit, API, component, performance-smoke, responsive and
  end-to-end suites; drove a real browser to check the screens a unit test cannot prove.

I reviewed every generated file, migration and command, and the agent stopped after each Pull Request
until my peer reviewer had approved and merged it.

## Selected key prompts

Several prompts were written in Thai; they are translated here without changing their meaning.

| # | Prompt name | Actual prompt text | What it produced |
|---|---|---|---|
| 1 | Plan without mistakes | "Plan this one carefully, no mistakes, check thoroughly. No Pull Requests piling up — I don't want that." | A fixed plan of 7 Issues → 7 feature Pull Requests → 1 release, written into the contract before Issue 1. The first draft of the plan was wrong — it had no action assignee or status, kept Administrators read-only against handout §4.3, and had no recovery or performance tests — and was corrected before the contract was committed. |
| 2 | A hard approval gate | "Tell me in detail what to do, check and warn me — if my friend hasn't approved, we don't move on." | Every Issue began with `gh pr view <previous> --json state,reviewDecision`; work only started on APPROVED and MERGED. |
| 3 | One Issue at a time, with instructions | "I mean per Issue — tell me each time." | After every Pull Request: what changed, the reviewer's comment and my reply in short plain English, and exactly which screenshots to take and where they go. |
| 4 | Keep the naming consistent | "Why isn't the name the same pattern as 'Lab 4 Issue …'?" | PR #57 had been titled like a commit message. It was renamed to its Issue title, and every later Pull Request used the Issue title exactly. |
| 5 | Keep the review record readable | "Keep the comments short on both sides." | One-line review comments and replies on every Pull Request, so the record in [reviewer.md](reviewer.md) stays easy to read. |
| 6 | Check before release | "Check again, make sure it is right." | A re-check before the release found that the PERF failures came from machine load, not the code. The final run was repeated after the load was stopped. |
| 7 | Continue | "My friend approved, continue with Issue N." | The gate check, a fresh branch from the merged `lab4-staging`, and the next Issue — never more than one Pull Request open. |
| 8 | Complete report | "Make the report complete, tell me if you need anything." | The Lab 4 report, checked part by part against §14 of the handout. |

## What the agent got wrong, and how it was caught

- Issue 2 omitted `role` from the assignable-users response that api-spec.md §4.2 requires. Caught
  while building the assignee select in Issue 3.
- `npm run build` in the client wrote a `.js` copy beside every source file, because the client
  `tsconfig.json` had no `noEmit`. Noticed as 49 untracked files, deleted, and fixed in Issue 6.
- Running the end-to-end suites rewrote the committed Lab 3 screenshot evidence. Every run since
  restores `artifacts/lab-03` before committing.
- A ticket Save pressed straight after an action Save raced the version re-read and showed "This
  ticket was changed by someone else" for the screen's own change. Found by the Issue 7 end-to-end
  suite, not by the component tests that had passed for two Issues.
- The Actions Taken table scrolled the page sideways by 59 px at 820 px. Found by the responsive
  assertion, not by looking; the first fix removed the scroll but broke words letter by letter, which
  only a screenshot showed.

## My Reflection

**As a specification agent** it was most useful before any code existed. It turned the handout into
numbered rules, acceptance criteria and a test plan, and when I asked it to check the plan again it
found its own first draft was wrong: no action assignee or status, Administrators still read-only
against handout §4.3, and no recovery or performance tests. Fixing that on paper took minutes; finding
it after Issue 2 would have cost a Pull Request.

**As a coding agent**, Lab 4 was mostly about changing rules that earlier labs had fixed: Administrators became operators,
every write gained a version, and the landing screen moved. The useful habit was treating each of
those as a named change to old tests, listed in the Pull Request, instead of editing tests until they
were green. That is what kept "every Lab 1–3 test still passes" a meaningful claim.

The other lesson was where defects hide. Component tests with mocked APIs passed for the version race
and for the tablet layout; only a real browser with a real server found them. A responsive assertion
then needed a human look as well, because "no horizontal scroll" was satisfied by a layout nobody
could read. Deciding what counts as proof stayed my job; the agent was fast at producing the proof
once that was decided.
