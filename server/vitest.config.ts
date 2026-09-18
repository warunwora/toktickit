import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Every API suite shares one PostgreSQL database, and the Administrator
    // suite has to change global state to test "at least one active
    // Administrator must remain". Run the files one at a time so a suite never
    // observes another suite's half-applied fixture.
    fileParallelism: false,
    // bcrypt is deliberately slow, and a password hash that takes a moment is
    // not a test failure.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
