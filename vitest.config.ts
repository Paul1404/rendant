import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The DB client constructs a pg Pool at import time but only connects on
    // first query. The pure-logic tests never query, so a placeholder URL is
    // enough to satisfy module init.
    env: {
      DATABASE_URL: "postgres://placeholder:placeholder@localhost:5432/test",
    },
  },
});
