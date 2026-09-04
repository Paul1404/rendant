# Agent notes

`AGENTS.md` is the canonical instruction file for this repository. Claude Code
loads it through `CLAUDE.md`. Detailed previous guidance is preserved in
`docs/agent-reference.md`; consult its project-specific sections when relevant.
If implementation and documentation disagree, verify current behavior and
update the appropriate canonical documentation in the same change.

## Stack and boundaries

- Use Bun for the runtime and package manager. Never use npm, yarn, or pnpm.
- Keep the existing TanStack Start, oRPC, better-auth, Drizzle, Valibot, Biome,
  Vitest, Dockerfile, and Railway stack.
- Server-only code belongs under `src/server/` and is exposed through oRPC
  procedures in `src/server/orpc/` or server routes in `src/routes/api/`.
- Database access goes through Drizzle in `src/server/db/`. Never import the DB
  client, server auth, or server services into a component.
- Keep shared validation schemas in `src/lib/schemas.ts` using Valibot.
- Do not commit `bun run auth:generate` output unreviewed. It rewrites
  `auth-schema.ts` wholesale and has been observed dropping the `account`
  unique indexes and relaxing `notNull`. Diff it and hand-apply only the
  intended field change.
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
- Historical protocol review phases store exact row memberships and progress.
  Changing a working value reopens affected checks, and only the explicit final
  import may create historical revenue records.
- Helper-hour categories are rows in `helper_hour_categories`, not code. The
  eight seeded ones are flagged `system` and may be renamed or deactivated but
  never deleted. Minutes live in `helper_hour_allocations`, one row per category
  an entry contributes to. Never reintroduce fixed per-category columns.
- The Helferstunden view is currency free. A department's balance is earned
  minutes minus the minutes its purchases consume at the current hourly value.
  A purchase is still booked in euro; only the hourly value setting and the
  purchase amount field may name a currency, and both live outside that view.
- Department purchases are separate audited records and must be cancelled with
  a reason, never deleted or hidden. The settlement-list import therefore only
  adds rows it does not already hold and reports rows that vanished from the
  list instead of removing them.
- Helferstunden imports preview first. The monthly sheets are the register of
  record, so applying an import replaces everything previously imported for the
  sheets the file contains and leaves manually entered hours untouched.
- The importer repairs only what the file itself makes unambiguous: a swapped
  name pair the list writes the other way round elsewhere, a year that
  contradicts the monthly sheet, casing, a missing sum, and unassigned hours.
  Roughly half of a club's surnames occur exactly once, so absence of a token
  elsewhere is never evidence; a name orientation is decided once per person and
  applied to all their rows, never row by row.
- Preserve reported totals and category allocations separately so legacy
  discrepancies stay visible instead of being silently rewritten. Repairs and
  in-app corrections must retain the original parsed values, and every remaining
  issue has to be corrected or explicitly accepted before the final import.
- A column carrying hours that matches no category is reported, never ignored.

## Versions and release notes

- `package.json` is the only source of truth for the app version. Vite injects
  it as `__APP_VERSION__`; do not hardcode versions elsewhere.
- Every user-visible or behavioral change must bump the version in the same
  change: patch for fixes or small polish, minor for features/schema additions,
  and major for breaking changes.
- Add the matching dated, newest-first German entry to `CHANGELOG.md`. The
  in-app release-notes dialog reads that file at build time.
- Release notes explain the visible workflow benefit in plain German. Keep
  framework, database, MCP, and other implementation details out unless users
  need them to act.
- Before choosing a version during concurrent work, refresh and inspect the
  latest `package.json` and top of `CHANGELOG.md` to avoid duplicate or
  out-of-order releases.

## Deployment

- Railway builds `rendant-app` from `main` with check suites disabled, so every
  push to `main` deploys to production immediately without waiting for CI. Prove
  a change on a PR before merging, and land related work as one commit rather
  than several, since each merge is its own production deploy.
- `preDeployCommand` applies Drizzle migrations against the production database
  in a separate container before the new app starts. A non-zero exit aborts the
  deployment and the previous release keeps serving, so a migration that must
  not half-apply should end in a constraint that fails loudly.
- Schema changes that add a required column to a populated table need add
  nullable, backfill, then `SET NOT NULL`. A bare `ADD COLUMN ... NOT NULL`, as
  drizzle-kit generates it, aborts on any non-empty table.

## Quality bar

- Use Conventional Commits and explain why the change is needed.
- UI copy is short, direct German. Do not use em dashes, en dashes, or emojis.
- Before calling a change complete, run `bun run check`, `bunx tsc --noEmit`,
  `bun run test`, and `bun run build`, then exercise the affected runtime flow
  where feasible.
- `/api/health` includes a cached production PDF render. Preserve the
  production-image readiness assertion when changing React PDF, PDFKit, fonts,
  Nitro bundling, or the Docker runtime.
- Keep `AGENTS.md`, `.env.example`, migrations, and operational documentation in
  sync with behavior changes.

## Maintaining this file

Keep this file concise and update it when verified repository behavior changes.
Move detailed explanations to `docs/` and keep `CLAUDE.md` as the compatibility
import unless Claude-specific guidance is genuinely required.
