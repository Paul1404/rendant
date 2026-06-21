# Plan 006: Move Belegnummer allocation to explicit sequences

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat af00a7f..HEAD -- src/server/services/belegnummer.ts src/server/services/protokoll.ts src/server/db/schema.ts drizzle tests`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/001-restore-biome-check-gate.md`,
  `plans/005-add-server-path-integration-tests.md`
- **Category**: correctness
- **Planned at**: commit `af00a7f`, 2026-06-21

## Why this matters

Automatic Belegnummer allocation currently scans every protokoll in the current
year and parses trailing digits from arbitrary `belegnummer` strings. That works
for small history, but it couples automatic sequencing to custom/manual numbers
and grows linearly with retained records. A proper sequence table makes
allocation explicit, transactional, and independent of unrelated custom labels.

## Current state

- The current sequence function scans all current-year rows:

```ts
src/server/services/belegnummer.ts:18
async function maxSequenceForYear(
  client: DbOrTx,
  year: number,
): Promise<number> {
```

```ts
src/server/services/belegnummer.ts:22
const rows = await client
  .select({ belegnummer: protokolle.belegnummer })
  .from(protokolle)
  .where(sql`EXTRACT(YEAR FROM ${protokolle.erstellt_am}) = ${year}`);
```

- It parses the trailing number from every result:

```ts
src/server/services/belegnummer.ts:27
for (const row of rows) {
  const n = extractTrailingNumber(row.belegnummer);
```

- Creation calls allocation inside the insert transaction, but still relies on
  the scan:

```ts
src/server/services/protokoll.ts:176
created = await db.transaction(async (tx) => {
  const belegnummer =
    customBelegnummer ?? (await nextBelegnummerInTx(tx, year));
```

- Existing tests cover formatting and trailing-number parsing only:

```ts
tests/belegnummer.test.ts:11
describe("extractTrailingNumber", () => {
```

Repo conventions: use Drizzle Kit for migrations, keep migrations committed
under `drizzle/`, and do not edit generated `src/routeTree.gen.ts`.

## Commands You Will Need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Generate migration | `bun run db:generate` | creates one new migration under `drizzle/` |
| Check | `bun run check` | exit 0 |
| Typecheck | `bunx tsc --noEmit` | exit 0 |
| Tests | `bun run test` | all tests pass |
| Build | `bun run build` | exit 0 |

## Scope

**In scope**:

- `src/server/db/schema.ts`
- `src/server/services/belegnummer.ts`
- `src/server/services/protokoll.ts` only for call-site adjustments
- New Drizzle migration files under `drizzle/`
- Tests under `tests/`
- `plans/README.md`

**Out of scope**:

- Changing the public Belegnummer format settings UI
- Rewriting historical `protokolle.belegnummer` values
- Removing support for custom Belegnummer overrides
- Reworking PDF filenames or S3 keys

## Git Workflow

- Branch: `advisor/006-explicit-belegnummer-sequences`
- Commit style: `refactor(db): allocate belegnummer from sequence table`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add a sequence table to the schema

Add a Drizzle table, for example `belegnummerSequences`, with enough columns to
track the next automatic sequence per year and settings shape. Minimum viable
shape:

- `year` integer primary key or part of a composite key
- `next_sequence` integer not null, default 1
- `updated_at` timestamp with timezone

If the current settings allow prefixes/year/separators to change, decide
whether the sequence should be keyed only by year or by year plus normalized
format settings. Keep the first implementation conservative: a single sequence
per year matches the README promise "pro Jahr" and avoids duplicate automatic
numbers after cosmetic setting changes.

**Verify**: `bunx tsc --noEmit` -> schema compiles before migration generation.

### Step 2: Generate and inspect the migration

Run `bun run db:generate`. Inspect the generated SQL. It should create only the
new sequence table/indexes and should not rewrite existing protokolle data.

**Verify**:

- `find drizzle -maxdepth 1 -type f | sort` shows exactly one new SQL migration.
- The migration does not drop or alter `protokolle.belegnummer`.

### Step 3: Implement transactional allocation

Replace scan-based `nextBelegnummerInTx` with an atomic sequence-table update.
The allocation should:

- run inside the caller's transaction
- initialize the row for the target year if it does not exist
- atomically reserve one sequence value
- format that sequence using current Belegnummer settings
- preserve custom Belegnummer behavior: custom values still rely on the unique
  `protokolle.belegnummer` constraint and must not advance the automatic
  sequence

Keep `previewNextBelegnummer` cheap and consistent with the sequence table. It
may read `next_sequence` without reserving it.

**Verify**: `bunx tsc --noEmit` -> exit 0.

### Step 4: Backfill sequence rows safely on first use

For deployments with existing data, first use of a year must not restart at 1.
When no sequence row exists for a year, initialize `next_sequence` to
`max(existing automatic-compatible trailing number for that year) + 1`.

Use the current scan helper only for initialization/backfill, not for every
allocation. Rename it to make that limited purpose clear.

**Verify**: add or update tests showing an empty sequence table with existing
rows initializes to max+1.

### Step 5: Expand Belegnummer tests

Build on `tests/belegnummer.test.ts`. Add coverage for the pure pieces you
extract:

- formatting still works for default/full/short-year settings
- sequence initialization chooses max trailing number plus one
- custom Belegnummer values do not advance automatic sequence
- preview returns the current `next_sequence` formatted value without reserving

If DB-backed concurrency tests require real Postgres and the repo still has no
test DB, stop at pure/service-helper tests and document that a real DB race test
is deferred.

**Verify**: `bun run test -- tests/belegnummer.test.ts` -> tests pass.

### Step 6: Run full verification

**Verify**:

- `bun run check` -> exit 0
- `bunx tsc --noEmit` -> exit 0
- `bun run test` -> all tests pass
- `bun run build` -> exit 0

## Test Plan

Add focused Belegnummer tests. If plan 005 added service-level DB mocks, reuse
those patterns. Avoid relying on wall-clock current year except where a test
explicitly passes a fixed year.

## Done Criteria

- [ ] Automatic allocation no longer scans all current-year protokolle on every
      create.
- [ ] A new Drizzle migration creates the sequence storage.
- [ ] Existing deployments initialize sequence rows from existing protokolle.
- [ ] Custom Belegnummer overrides do not advance the automatic sequence.
- [ ] Tests cover formatting plus sequence initialization/reservation behavior.
- [ ] Full local baseline passes.
- [ ] `plans/README.md` row for plan 006 is updated.

## STOP Conditions

- Drizzle cannot express the needed atomic upsert/update safely for PostgreSQL.
- Existing Belegnummer settings imply multiple independent sequences that
  cannot be represented without a product decision.
- The migration generator wants to alter or drop unrelated tables.
- A correct implementation requires changing existing PDF/S3 key semantics.

## Maintenance Notes

Reviewers should inspect the transaction behavior carefully. The unique
constraint on `protokolle.belegnummer` remains the last line of defense, but the
sequence table should make normal concurrent automatic allocation deterministic.

