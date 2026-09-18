import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The API suites run against a real PostgreSQL database and log in with
    // bcrypt, which is deliberately slow. Vitest's 5 s default is enough for
    // one suite but not for all of them at once on a busy machine, and a
    // password hash that takes a moment is not a test failure.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
