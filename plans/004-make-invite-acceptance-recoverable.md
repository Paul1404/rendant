# Plan 004: Make invite acceptance recoverable

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat af00a7f..HEAD -- src/server/services/invitations.ts src/server/db/migrate.ts tests`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/001-restore-biome-check-gate.md`
- **Category**: correctness
- **Planned at**: commit `af00a7f`, 2026-06-21

## Why this matters

Accepting an invite creates a better-auth user, links a credential account, and
then marks the invite accepted. Those writes are not atomic. If the process
fails after user creation but before `accepted_at`, retry behavior becomes
confusing and may leave a partial account. This is account lifecycle code and
should be recoverable.

## Current state

- Invite lookup validates token, unused status, and expiry:

```ts
src/server/services/invitations.ts:81
export async function getValidInvite(token: string): Promise<Invite | null> {
```

- `acceptInvite` checks for an existing user, then performs three separate
  writes:

```ts
src/server/services/invitations.ts:106
const existingUser = await db
  .select({ id: userTable.id })
```

```ts
src/server/services/invitations.ts:117
const created = await ctx.internalAdapter.createUser({
  email: invite.email,
```

```ts
src/server/services/invitations.ts:123
await ctx.internalAdapter.linkAccount({
  userId: created.id,
```

```ts
src/server/services/invitations.ts:130
await db
  .update(invitations)
  .set({ accepted_at: new Date() })
```

- Admin seeding has a similar create/link sequence:

```ts
src/server/db/migrate.ts:41
const ctx = await auth.$context;
const hash = await ctx.password.hash(password);
const created = await ctx.internalAdapter.createUser({
```

Repo conventions: server-only account code stays under `src/server/`; public
invite procedures live in `src/server/orpc/router.ts` and call service
functions.

## Commands You Will Need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Check | `bun run check` | exit 0 |
| Typecheck | `bunx tsc --noEmit` | exit 0 |
| Tests | `bun run test` | all tests pass |
| Build | `bun run build` | exit 0 |

## Scope

**In scope**:

- `src/server/services/invitations.ts`
- Optional shared helper under `src/server/services/` if it removes duplication
  with admin seed
- `src/server/db/migrate.ts` only if using the shared helper is clearly safer
- Tests under `tests/`
- `plans/README.md`

**Out of scope**:

- Open registration
- Email delivery for invites
- User management UI changes
- Role-management features
- Schema changes unless a test proves they are necessary

## Git Workflow

- Branch: `advisor/004-make-invite-acceptance-recoverable`
- Commit style: `fix(auth): make invite acceptance recoverable`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Inspect better-auth adapter transaction support

Before changing code, inspect the installed better-auth internal adapter types
and docs in `node_modules/better-auth` for whether `internalAdapter.createUser`
and `internalAdapter.linkAccount` can participate in a caller-provided
transaction. Do not guess.

**Verify**: record in your working notes which API shape exists. No source file
needs to change in this step.

### Step 2: Choose the smallest recoverable design

Preferred if supported: run invite row lock/update, user creation, account
linking, and invite acceptance in one database transaction.

Fallback if better-auth cannot join a transaction: make the flow idempotent and
recoverable:

- after loading the valid invite, create or find the user by email
- ensure the credential account is linked for that user
- mark the invite accepted only after the credential link is present
- on retry, if the user exists because of a previous partial attempt, complete
  the missing link/accepted marker instead of failing with "existing account"

Do not weaken the rule that accepted/expired invites are invalid.

**Verify**: `bunx tsc --noEmit` -> exit 0 after the chosen code shape compiles.

### Step 3: Add regression coverage

Add tests around the pure decision/recovery logic if direct better-auth DB tests
are too heavy. If you can test against service functions with mocked adapter
methods, cover:

- normal accept marks invite accepted after account link
- retry after user exists but invite is still unaccepted completes or reports a
  clear recoverable state
- expired or already accepted invite still fails

Keep the test style consistent with existing Vitest files in `tests/`.

**Verify**: `bun run test -- tests/<new-file>.test.ts` -> new tests pass.

### Step 4: Run full verification

**Verify**:

- `bun run check` -> exit 0
- `bunx tsc --noEmit` -> exit 0
- `bun run test` -> all tests pass
- `bun run build` -> exit 0

## Test Plan

At minimum, add unit-level coverage for the retry/recovery branch. If the
executor can cheaply mock `auth.$context.internalAdapter`, prefer service tests
that assert call order and final DB-intent decisions.

## Done Criteria

- [ ] `acceptInvite` no longer leaves a retry-hostile partial state when one of
      the account writes succeeds and a later write fails.
- [ ] Invalid, expired, and accepted invites remain rejected.
- [ ] Tests cover the normal path and one partial/retry path.
- [ ] Full local baseline passes.
- [ ] `plans/README.md` row for plan 004 is updated.

## STOP Conditions

- better-auth internals do not expose enough API to safely detect or complete a
  partial credential account.
- Fixing this correctly requires schema changes to better-auth generated tables.
- Tests would need a live Postgres instance that is not already part of the repo
  test setup.

## Maintenance Notes

Reviewers should focus on idempotency and user-visible errors. The flow should
not disclose more than it does today to public invite-token callers.

