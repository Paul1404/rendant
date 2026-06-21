# Plan 002: Enforce login rate limiting

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat af00a7f..HEAD -- src/routes/api/auth/$.ts src/server/services/login-attempts.ts src/server/orpc/context.ts src/lib/constants.ts src/server/db/schema.ts tests`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/001-restore-biome-check-gate.md`
- **Category**: security
- **Planned at**: commit `af00a7f`, 2026-06-21

## Why this matters

The app has a `login_attempts` table and a limiter service, but the better-auth
login endpoint currently bypasses it. The README describes email/password login
for an internal tool, and admin accounts are seeded/invited rather than openly
registered, so brute-force resistance belongs on the server-side auth boundary.

## Current state

- Limit constants already exist:

```ts
src/lib/constants.ts:5
export const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RATE_MAX = 5;
export const LOGIN_RATE_GLOBAL_MAX = 30;
```

- The limiter service can record attempts and answer whether an IP/global
  window is limited:

```ts
src/server/services/login-attempts.ts:10
export async function recordLoginAttempt(
  ip: string,
  erfolgreich: boolean,
): Promise<void> {
  await db.insert(loginAttempts).values({ ip, erfolgreich });
```

```ts
src/server/services/login-attempts.ts:21
export async function isLoginRateLimited(ip: string): Promise<boolean> {
  const minutes = Math.ceil(LOGIN_RATE_WINDOW_MS / 60000);
```

- The table and index are already in the schema:

```ts
src/server/db/schema.ts:198
export const loginAttempts = pgTable(
  "login_attempts",
```

- The auth route forwards all better-auth requests directly:

```ts
src/routes/api/auth/$.ts:4
function handle({ request }: { request: Request }) {
  return auth.handler(request);
}
```

- `clientIpFromHeaders` already centralizes the Railway proxy behavior:

```ts
src/server/orpc/context.ts:3
export function clientIpFromHeaders(headers: Headers): string {
```

Repo search on 2026-06-21 found no production caller for
`recordLoginAttempt` or `isLoginRateLimited` outside the service itself.

## Commands You Will Need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Check | `bun run check` | exit 0 |
| Typecheck | `bunx tsc --noEmit` | exit 0 |
| Tests | `bun run test` | all tests pass |
| Build | `bun run build` | exit 0 |

## Scope

**In scope**:

- `src/routes/api/auth/$.ts`
- `src/server/services/login-attempts.ts` if small testability helpers are needed
- `tests/login-attempts.test.ts` or `tests/auth-rate-limit.test.ts`
- `plans/README.md`

**Out of scope**:

- Replacing better-auth
- Changing password policy
- Changing session/cookie configuration
- Adding CAPTCHA, email delivery, or account lockout
- Changing oRPC procedure authorization

## Git Workflow

- Branch: `advisor/002-enforce-login-rate-limiting`
- Commit style: `fix(auth): enforce login rate limiting`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Identify the exact better-auth sign-in route

Inspect the current better-auth client/network path before editing. The client
is configured with `basePath: "/api/auth"` in `src/lib/auth-client.ts`; for
email login the expected route is a POST under `/api/auth/sign-in/email`.

If the installed better-auth version uses a different route name, use that
actual route in the next steps and record it in a code comment or test name.

**Verify**: `rg -n "basePath|signIn.email" src/lib src/components src/routes`
shows the login client path and caller.

### Step 2: Wrap only the email sign-in request in the auth route

In `src/routes/api/auth/$.ts`, keep `auth.handler(request)` as the single
implementation for better-auth. Add a small guard around the email sign-in POST:

- derive the client IP with `clientIpFromHeaders(request.headers)`
- before calling `auth.handler`, call `isLoginRateLimited(ip)`
- if limited, return HTTP 429 JSON with a generic German error message
- otherwise call `auth.handler(request)`
- after the response, record the attempt with `recordLoginAttempt(ip, response.ok)`
- return the original better-auth response unchanged

Do not read or clone the login request body unless absolutely required; let
better-auth remain responsible for credential parsing.

**Verify**: `bunx tsc --noEmit` -> exit 0.

### Step 3: Add focused tests for the limiter service behavior

Add a test file under `tests/` for pure/testable limiter logic if the DB-backed
functions are hard to exercise without Postgres. Acceptable approaches:

- extract a pure helper from `login-attempts.ts` that decides limited/not
  limited from `{ ipCount, globalCount }`
- test that helper for below-limit, per-IP limit, and global limit

Keep DB access through `src/server/services/login-attempts.ts`; do not import
the DB client into components.

**Verify**: `bun run test -- tests/login-attempts.test.ts` -> new tests pass.

### Step 4: Run full verification

**Verify**:

- `bun run check` -> exit 0
- `bunx tsc --noEmit` -> exit 0
- `bun run test` -> all tests pass
- `bun run build` -> exit 0

## Test Plan

Add tests covering:

- per-IP count below `LOGIN_RATE_MAX` is allowed
- per-IP count equal to `LOGIN_RATE_MAX` is limited
- global count equal to `LOGIN_RATE_GLOBAL_MAX` is limited even when IP count is low

If a route-level test harness already exists by execution time, also test that
the auth route returns 429 before calling better-auth when the limiter says
limited. If no such harness exists, do not invent a large framework in this
plan.

## Done Criteria

- [ ] Email/password sign-in requests are checked by the existing limiter before
      better-auth processes credentials.
- [ ] Successful and failed sign-in responses record an attempt.
- [ ] Non-login better-auth routes still pass through to `auth.handler`.
- [ ] New limiter tests pass.
- [ ] Full local baseline passes.
- [ ] `plans/README.md` row for plan 002 is updated.

## STOP Conditions

- better-auth consumes or mutates the request in a way that prevents returning
  the original response after recording.
- The login endpoint cannot be reliably identified from installed better-auth.
- Implementing route-level tests would require a new test framework or a real
  database.
- Any change would expose whether an email exists.

## Maintenance Notes

The app has both per-IP and global counters because `X-Forwarded-For` can be
spoofed before Railway appends its trusted hop. Reviewers should make sure the
global backstop remains in place and that error messages stay generic.

