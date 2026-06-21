# Plan 005: Add server-path integration tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat af00a7f..HEAD -- src/server/services src/server/orpc src/routes/api tests package.json vite.config.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/001-restore-biome-check-gate.md`,
  `plans/004-make-invite-acceptance-recoverable.md`
- **Category**: tests
- **Planned at**: commit `af00a7f`, 2026-06-21

## Why this matters

The app's core value is accounting records, PDFs, exports, and invited users.
Current tests cover useful pure helpers, but not the server paths that create
protokolle, storno them, export data, or accept invites. Before deeper storage
changes, the repo needs characterization tests around these behaviors.

## Current state

- Existing tests are pure helper tests:

```ts
tests/belegnummer.test.ts:1
import { describe, expect, it } from "vitest";
```

```ts
tests/sanity-checks.test.ts:1
import { describe, expect, it } from "vitest";
```

- The main create path calculates derived money fields and inserts parent/child
  rows:

```ts
src/server/services/protokoll.ts:133
export async function createProtokoll(
  input: CreateProtokollInput,
): Promise<CreateResult> {
```

- Storno and PDF regeneration are server service paths:

```ts
src/server/services/protokoll.ts:299
export async function stornoProtokoll(
```

```ts
src/server/services/protokoll.ts:352
export async function regenerateProtokollPdf(id: string): Promise<void> {
```

- Export code is service-level and currently untested:

```ts
src/server/services/csv-export.ts:36
export async function exportCsv(von: string, bis: string): Promise<string> {
```

```ts
src/server/services/export.ts:79
export async function exportJson(
```

```ts
src/server/services/reports.ts:14
export async function vatSummary(
```

Repo conventions: Vitest is the test runner; database access belongs under
`src/server/db` and service modules, not components. Use Bun commands.

## Commands You Will Need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Check | `bun run check` | exit 0 |
| Typecheck | `bunx tsc --noEmit` | exit 0 |
| Tests | `bun run test` | all tests pass |
| Build | `bun run build` | exit 0 |

## Scope

**In scope**:

- Test files under `tests/`
- Minimal test helpers under `tests/` or `src/server/services/*` only if needed
  to make existing behavior testable
- `vitest` configuration only if required and kept minimal
- `plans/README.md`

**Out of scope**:

- Production behavior changes not required for testability
- Adding a browser E2E framework
- Adding a live Postgres dependency to normal `bun run test` unless the repo
  already has one configured by execution time
- Snapshot-heavy tests for PDFs

## Git Workflow

- Branch: `advisor/005-add-server-path-integration-tests`
- Commit style: `test(server): cover accounting service paths`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Decide the test layer without adding infrastructure debt

Prefer service-level tests with mocked DB/S3/PDF boundaries if normal Vitest has
no Postgres test database. The goal is to lock down business behavior, not to
stand up a full environment.

Good candidates for extraction into pure helpers:

- create-protokoll money derivation from denominations, expenses, card payments
- USt split sum validation
- CSV cell escaping/document formatting
- export grouping/order logic over plain rows

If a helper is extracted, keep it in the same service module unless it is
clearly reusable from `src/lib`.

**Verify**: `bunx tsc --noEmit` -> exit 0 after any helper extraction.

### Step 2: Cover create-protokoll derivation and validation

Add tests that assert:

- counted cash plus expenses produces `bestand_cent`
- `tageseinnahmen_cent` subtracts `wechselgeld_cent`
- card payments are included only in the configured USt basis when
  `umsatz_ust_basis` is `post_card`
- mismatched `umsatz_ust` split throws the existing "Summe der USt" validation
  error

Do not require real PDF rendering or S3 upload for these tests.

**Verify**: `bun run test -- tests/<create-protokoll-test>.test.ts` -> tests pass.

### Step 3: Cover export/report formatting

Add tests for:

- CSV values containing semicolon, quote, and newline are escaped
- canceled/storniert protokolle are included in the full CSV/JSON backup where
  intended
- USt summary ignores storniert protokolle as current code specifies

If direct DB service tests are too heavy, extract pure row-to-output helpers and
test those helpers.

**Verify**: `bun run test -- tests/<export-test>.test.ts` -> tests pass.

### Step 4: Cover invite recovery behavior from plan 004

Add a focused test for the retry/idempotency behavior introduced in plan 004.
This can be a mocked adapter/service test if there is no test database.

**Verify**: `bun run test -- tests/<invite-test>.test.ts` -> tests pass.

### Step 5: Run full verification

**Verify**:

- `bun run check` -> exit 0
- `bunx tsc --noEmit` -> exit 0
- `bun run test` -> all tests pass, with the new files included
- `bun run build` -> exit 0

## Test Plan

This plan is the test plan. Add small, explicit Vitest files instead of a broad
suite that is hard to maintain. Each new test should assert observable money,
status, or output behavior.

## Done Criteria

- [ ] At least one test covers create-protokoll derived accounting behavior.
- [ ] At least one test covers USt split validation.
- [ ] At least one test covers export/report formatting or grouping behavior.
- [ ] At least one test covers invite recovery behavior from plan 004.
- [ ] `bun run test` includes all new tests and exits 0.
- [ ] Full local baseline passes.
- [ ] `plans/README.md` row for plan 005 is updated.

## STOP Conditions

- Meaningful service tests require introducing Docker, a live Postgres service,
  or a new large test framework.
- Extracting pure helpers would significantly rewrite production service code.
- PDF rendering tests require brittle binary snapshots.

## Maintenance Notes

These tests should make plan 006 safer. Reviewers should reject tests that only
assert mocks were called and do not check accounting/export outcomes.

