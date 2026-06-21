# Plan 001: Restore the Biome check gate

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat af00a7f..HEAD -- biome.json vite.config.ts package.json .github/workflows/ci.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `af00a7f`, 2026-06-21

## Why this matters

CI currently runs `bun run check` before typecheck, tests, and build. That check
fails locally, so a future PR cannot get a clean baseline even though
`bunx tsc --noEmit`, `bun run test`, and `bun run build` pass. Fixing the gate
first makes later plans easier to verify and review.

## Current state

- `package.json` defines the check script:

```json
package.json:17
"test": "vitest run",
"format": "biome format --write",
"lint": "biome lint",
"check": "biome check",
```

- CI runs that script before typecheck/tests/build:

```yaml
.github/workflows/ci.yml:28
- name: Lint & format check
  run: bun run check
```

- The Biome config schema lags the installed CLI:

```json
biome.json:2
"$schema": "https://biomejs.dev/schemas/2.2.4/schema.json",
```

- `vite.config.ts` is currently not in the formatting/import order Biome expects:

```ts
vite.config.ts:3
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
```

Local audit result on 2026-06-21:

```text
bun run check
Biome expected schema 2.5.0, found 2.2.4.
vite.config.ts import organization and formatting would change.
```

Repo conventions: package manager and runtime are Bun. Do not use npm, yarn, or
pnpm. `src/routeTree.gen.ts` is generated and out of scope.

## Commands You Will Need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Check | `bun run check` | exit 0, no Biome errors |
| Typecheck | `bunx tsc --noEmit` | exit 0 |
| Tests | `bun run test` | 5 test files pass |
| Build | `bun run build` | exit 0, `.output/` generated |

## Scope

**In scope**:

- `biome.json`
- `vite.config.ts`
- `plans/README.md`

**Out of scope**:

- Source application behavior under `src/`
- Generated `src/routeTree.gen.ts`
- Dependency upgrades beyond what is needed to make current Biome 2.5.0 config valid

## Git Workflow

- Branch: `advisor/001-restore-biome-check-gate`
- Commit style observed in history: conventional-ish messages such as
  `fix(ui): version-stamp in-app logo + smooth revenue chart (1.7.1)`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Migrate the Biome config shape

Update `biome.json` for the installed `@biomejs/biome` version in
`package.json`. Prefer the smallest manual change over running a mutating
migration command if the config is simple: update `$schema` to the 2.5.0 schema
URL and replace the deprecated `rules.recommended` field with the current
Biome 2.5 `preset` spelling.

Keep existing project choices intact:

- tab indentation
- double quotes
- `useExhaustiveDependencies` disabled
- `noArrayIndexKey` disabled
- `src/routeTree.gen.ts` and `src/styles.css` excluded from Biome checks

**Verify**: `bun run check` -> it may still fail on `vite.config.ts`, but it
must no longer report the schema version mismatch or deprecated recommended
field.

### Step 2: Apply Biome's formatting/import expectations to vite.config.ts

Reorder imports and wrap the `readFileSync` call exactly as Biome reports. Do
not change plugin order unless Biome requires formatting only; TanStack Start,
Nitro, Tailwind, and React plugin behavior is outside this plan.

**Verify**: `bun run check` -> exit 0.

### Step 3: Run the full local baseline

Run the same gates CI uses.

**Verify**:

- `bunx tsc --noEmit` -> exit 0
- `bun run test` -> all existing tests pass
- `bun run build` -> exit 0

## Test Plan

No new tests are needed. This plan restores tooling configuration, and the
machine-checkable test is the Biome/CI gate itself.

## Done Criteria

- [ ] `bun run check` exits 0.
- [ ] `bunx tsc --noEmit` exits 0.
- [ ] `bun run test` exits 0.
- [ ] `bun run build` exits 0.
- [ ] Only files in scope are modified.
- [ ] `plans/README.md` row for plan 001 is updated.

## STOP Conditions

- Biome reports additional source-code errors outside `biome.json` and
  `vite.config.ts`.
- Fixing the check appears to require changing package versions or the lockfile.
- `vite.config.ts` plugin order would need to change.

## Maintenance Notes

Reviewers should check that this plan only restores the existing check gate. It
should not weaken Biome coverage, remove source directories from checks, or
hide future lint/format failures.

