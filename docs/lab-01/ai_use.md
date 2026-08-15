# Lab 1 — AI Use and Reflection

**LLM/agent used:** Claude Opus 5 — used in two modes: Claude (chat) to turn the labsheet into a
step-by-step plan (`Lab1_Plan_Beginner.md`), and Claude Code (terminal coding agent) to execute that
plan: git/GitHub operations, code, migrations, tests, and verification.

## Selected key prompts

| # | Prompt name | Actual prompt text (abridged where marked) | What I did with the result |
|---|---|---|---|
| 1 | Plan Lab 1 implementation | "อ่าน Lab1_Labsheet.pdf แล้ววางแผนงานฉบับมือใหม่ ทำเป็น phase/step ให้ครบ บอกด้วยว่าตรงไหนต้องถ่าย screenshot" | Produced the 6-phase / 24-step plan I followed for the whole lab. |
| 2 | Cross-check the documents | "Cheat Sheet บอกให้แตก branch จาก main แต่ labsheet ใช้ lab1-staging อันไหนถูก" | Agent flagged the conflict and chose `lab1-staging`, because Issue 4 needs the `Category` model merged from Issue 3. |
| 3 | Kick off the coding agent | "…ทำตาม Lab1_Plan_Beginner.md ข้อบังคับ: ห้าม commit ตรงเข้า main/lab1-staging, PR ทุกใบ base = lab1-staging, สร้าง Issue ครบ 4 ใบก่อนเขียนโค้ด, ห้าม commit .env/node_modules, tech stack ล็อกไว้แล้ว" (abridged) | Set the guardrails for every later step; the agent created the repo scaffold, `lab1-staging`, and the four Issues before any code. |
| 4 | Create the four Issues | "สร้าง Issue ครบ 4 ใบ ก๊อป acceptance criteria จาก labsheet §7 ใส่ให้ครบ" | Four Issues with the exact acceptance criteria as checklists, auto-added to the board in Backlog. |
| 5 | Health check endpoint | "แก้ server/src/app.ts แทนที่ TODO(Issue 2) ให้ GET /api/health คืน 200 { status: ok, service: TokTickIT API } แล้วรัน npm test" | `feature/2-health-check`; the provided Supertest test turned green. |
| 6 | Idempotent seed | "เพิ่ม model Category, migrate, แล้วเขียน seed ด้วย upsert ให้รันซ้ำได้โดยไม่มีข้อมูลซ้ำ แล้วพิสูจน์ด้วยการรัน seed 2 รอบ" | `feature/3-category-seed`; seed run twice → still exactly 4 rows. |
| 7 | Category list end to end | "เขียน GET /api/categories (select id,name / orderBy id / catch เป็น 500 ข้อความกลางๆ), checkSystem() ฝั่ง client, และ UI loading/success/error พร้อมเทสต์" | `feature/4-category-list`; one Supertest test and three Vitest tests. |
| 8 | Verify, don't assume | "อันนี้เช็กแล้วใช่ไหมว่าทุกอย่างครบและถูกต้อง" | Agent merged all branches into a throwaway branch, ran both test suites, typechecked, curled both endpoints, and drove the browser for the Online and Offline cases — and reported the gaps it had not done. |
| 9 | Review the agent's work | "3 จุดต้องแก้: docs ยังว่าง, feature/4 ยังไม่ push, และ /api/health ยังเป็น 501 บน feature/4 — อย่าถ่าย demo จาก feature/4" | I caught that evidence must be captured on `main` after all PRs merge, not on a feature branch. |
| 10 | Tighten a test to the rubric | "tests.md เขียน UI-02 ว่า loading state changes to category list แต่เทสต์ข้าม assertion loading ไป — เพิ่ม assertion ให้ตรง" | Rewrote UI-02 to hold the mocked promise open, assert `⏳ loading…` and the disabled button, then resolve and assert the list. |

## Reflection

Prompts got better when I stopped asking for outcomes ("make the app work") and started stating the
constraint and the proof ("PR base must be `lab1-staging`", "prove the seed is idempotent by running
it twice"), because the agent then produced evidence instead of claims. The most useful habit was
asking "did you actually verify this?" — the first completion report listed work as done that was
only written, not run. I also had to reject the agent's plan to capture demo and test screenshots
from `feature/4-category-list`: `/api/health` is still the 501 stub on that branch, so the app would
have shown Offline; the evidence has to come from `main` after every PR is merged.
