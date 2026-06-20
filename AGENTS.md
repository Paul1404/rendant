# Agent notes

This project is built on the stack documented in `CLAUDE.md` (TanStack Start +
oRPC + better-auth + Drizzle + Valibot, Bun runtime, Biome, deployed to Railway
via Dockerfile). Read `CLAUDE.md` before making changes and keep it up to date.

Quick reference:

- Package manager and runtime is **Bun**. Never use npm/yarn/pnpm.
- Server-only code lives under `src/server/` and is reached through oRPC
  procedures (`src/server/orpc/`) and server routes (`src/routes/api/`).
- Database access goes through Drizzle (`src/server/db/`). Never import the DB
  client from a component.
- Validation schemas are Valibot, shared in `src/lib/schemas.ts`.
- `src/routeTree.gen.ts` is generated; never edit it by hand.
- Build output is `.output/` (Nitro). Run the server with
  `bun .output/server/index.mjs`.
