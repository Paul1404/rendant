# Plan 003: Reject external login redirects

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat af00a7f..HEAD -- src/routes/login.tsx src/components/login-form.tsx tests`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/001-restore-biome-check-gate.md`
- **Category**: security
- **Planned at**: commit `af00a7f`, 2026-06-21

## Why this matters

The login page accepts a `from` search parameter and passes it to
`window.location.assign` after successful authentication. The current guard only
checks `startsWith("/")`, which allows protocol-relative URLs like
`//example.com`. A login page should only redirect to same-origin application
paths.

## Current state

- The search parameter is accepted as any string:

```ts
src/routes/login.tsx:9
validateSearch: (search: Record<string, unknown>): { from?: string } => ({
  from: typeof search.from === "string" ? search.from : undefined,
}),
```

- The redirect guard allows any string that starts with a slash:

```ts
src/routes/login.tsx:23
const redirectTo = from?.startsWith("/") ? from : "/protokolle";
```

- The form performs a full-document navigation after login:

```ts
src/components/login-form.tsx:30
window.location.assign(redirectTo);
```

Repo conventions: keep route logic in route files, pure helpers in `src/lib`,
and use Vitest for low-level tests.

## Commands You Will Need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Check | `bun run check` | exit 0 |
| Typecheck | `bunx tsc --noEmit` | exit 0 |
| Tests | `bun run test` | all tests pass |
| Build | `bun run build` | exit 0 |

## Scope

**In scope**:

- `src/routes/login.tsx`
- Optional pure helper in `src/lib/redirect.ts`
- Optional test file `tests/redirect.test.ts`
- `plans/README.md`

**Out of scope**:

- Login form styling
- Auth/session behavior
- Redirect behavior on other routes

## Git Workflow

- Branch: `advisor/003-reject-external-login-redirects`
- Commit style: `fix(auth): restrict post-login redirects`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add a same-origin path sanitizer

Either inline a tiny helper in `src/routes/login.tsx` or create
`src/lib/redirect.ts` if you want test coverage. The helper must return
`"/protokolle"` unless the candidate is a same-origin relative application path.

Required behavior:

- `"/protokolle"` -> `"/protokolle"`
- `"/protokolle/abc?x=1"` -> same value
- `"//example.com"` -> `"/protokolle"`
- `"https://example.com"` -> `"/protokolle"`
- `"javascript:alert(1)"` -> `"/protokolle"`
- `""` or `undefined` -> `"/protokolle"`

Avoid allowing backslash-prefixed variants.

**Verify**: `bunx tsc --noEmit` -> exit 0.

### Step 2: Use the sanitizer for `redirectTo`

Replace the current `startsWith("/")` guard in `src/routes/login.tsx` with the
sanitizer.

**Verify**: `bunx tsc --noEmit` -> exit 0.

### Step 3: Add focused tests if the helper is in `src/lib`

If you created `src/lib/redirect.ts`, add `tests/redirect.test.ts` with the
cases listed above. Match the style of existing Vitest files under `tests/`.

**Verify**: `bun run test -- tests/redirect.test.ts` -> new tests pass.

### Step 4: Run full verification

**Verify**:

- `bun run check` -> exit 0
- `bunx tsc --noEmit` -> exit 0
- `bun run test` -> all tests pass
- `bun run build` -> exit 0

## Test Plan

Preferred: add a pure unit test for the sanitizer. If you keep the helper
inline in the route, rely on typecheck/build and manually inspect the cases
above in review.

## Done Criteria

- [ ] Post-login redirects only target same-origin relative paths.
- [ ] Protocol-relative, absolute, and non-HTTP-like strings fall back to
      `/protokolle`.
- [ ] Full local baseline passes.
- [ ] `plans/README.md` row for plan 003 is updated.

## STOP Conditions

- TanStack Router search parsing changed and the route no longer exposes `from`
  as shown in the excerpt.
- The fix requires changing `LoginForm` from a full-document navigation to
  client-side router navigation.

## Maintenance Notes

Keep this sanitizer small and conservative. Do not add a configurable allowlist
unless there is a product requirement for cross-origin redirects.

