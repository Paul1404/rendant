# Agent notes

`AGENTS.md` is the Codex/ChatGPT entry point for this repository. `CLAUDE.md` is
the detailed, shared source of truth for the stack, architecture, known gotchas,
release process, UI rules, and verification requirements. Read all of
`CLAUDE.md` before changing code. If implementation and documentation disagree,
verify the current behavior and update both files in the same change.

## Stack and boundaries

- Use Bun for the runtime and package manager. Never use npm, yarn, or pnpm.
- Keep the existing TanStack Start, oRPC, better-auth, Drizzle, Valibot, Biome,
  Vitest, Dockerfile, and Railway stack.
- Server-only code belongs under `src/server/` and is exposed through oRPC
  procedures in `src/server/orpc/` or server routes in `src/routes/api/`.
- Database access goes through Drizzle in `src/server/db/`. Never import the DB
  client, server auth, or server services into a component.
- Keep shared validation schemas in `src/lib/schemas.ts` using Valibot.
- `src/routeTree.gen.ts` is generated. Never edit it by hand.
- Build output is `.output/` (Nitro). Run it with
  `bun .output/server/index.mjs`.

## Multi-user correctness

- Assume multiple people and multiple app instances can mutate the same data at
  the same time. Correctness must be enforced in PostgreSQL, not only in React
  state or a read-before-write check.
- Use transactions, unique/check constraints, atomic conditional updates, and
  idempotent operations for numbering, invitations, cancellation, and settings.
- A preview value is advisory. Allocate authoritative identifiers, especially
  `belegnummer`, inside the write transaction.
- After a successful mutation, invalidate every affected TanStack Query before
  navigating or showing data as current. Handle conflicts with a clear German
  message and a safe retry path.
- External side effects such as S3 uploads and email must not allow a retry to
  create duplicate accounting records. Prefer recoverable partial states and
  explicit regeneration.

## Versions and release notes

- `package.json` is the only source of truth for the app version. Vite injects
  it as `__APP_VERSION__`; do not hardcode versions elsewhere.
- Every user-visible or behavioral change must bump the version in the same
  change: patch for fixes or small polish, minor for features/schema additions,
  and major for breaking changes.
- Add the matching dated, newest-first German entry to `CHANGELOG.md`. The
  in-app release-notes dialog reads that file at build time.
- Before choosing a version during concurrent work, refresh and inspect the
  latest `package.json` and top of `CHANGELOG.md` to avoid duplicate or
  out-of-order releases.

## Quality bar

- Use Conventional Commits and explain why the change is needed.
- UI copy is short, direct German. Do not use em dashes, en dashes, or emojis.
- Before calling a change complete, run `bun run check`, `bunx tsc --noEmit`,
  `bun run test`, and `bun run build`, then exercise the affected runtime flow
  where feasible.
- Keep `CLAUDE.md`, `.env.example`, migrations, and operational documentation in
  sync with behavior changes.
