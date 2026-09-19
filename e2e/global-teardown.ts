import { execFileSync } from "node:child_process";

// Playwright global teardown: the suites create throwaway accounts through the
// Administrator API, and the product deactivates rather than deletes users
// (BR-54). This removes them from the database so a demonstration of the user
// list is not full of test rows.
export default function globalTeardown(): void {
  try {
    const output = execFileSync("npx", ["tsx", "scripts/e2e-cleanup.ts"], {
      cwd: "server",
      encoding: "utf8",
    });
    process.stdout.write(output);
  } catch (error) {
    // A failed cleanup must not fail a green test run; it only leaves rows behind.
    process.stdout.write(`End-to-end cleanup did not run: ${(error as Error).message}\n`);
  }
}
