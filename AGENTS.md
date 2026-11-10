# Agent notes

> Production runs on Vertex RKE2 via Fleet, with PostgreSQL on Longhorn and private objects in Garage. Preserve the tenant isolation role and permissions during restore. The source image is published to GHCR after main CI and security scanning. Railway-specific material is historical.

`AGENTS.md` is the canonical instruction file for this repository. Claude Code
loads it through `CLAUDE.md`. Detailed previous guidance is preserved in
`docs/agent-reference.md`; consult its project-specific sections when relevant.
If implementation and documentation disagree, verify current behavior and
update the appropriate canonical documentation in the same change.

## Stack and boundaries

- Use Bun for the runtime and package manager. Never use npm, yarn, or pnpm.
- Keep the existing TanStack Start, oRPC, better-auth, Drizzle, Valibot, Biome,
  Vitest, Dockerfile, and Vertex deployment stack.
- Server-only code belongs under `src/server/` and is exposed through oRPC
  procedures in `src/server/orpc/` or server routes in `src/routes/api/`.
- Database access goes through Drizzle in `src/server/db/`. Never import the DB
  client, server auth, or server services into a component.
- Keep shared validation schemas in `src/lib/schemas.ts` using Valibot.
- Do not commit `bun run auth:generate` output unreviewed. It rewrites
  `auth-schema.ts` wholesale and has been observed dropping the `account`
  unique indexes and relaxing `notNull`. Diff it and hand-apply only the
  intended field change.
- Better Auth >= 1.7.3 no longer writes account `issuer`. Migration 0037 makes
  the legacy field nullable without losing its values. Keep the provider/account
  unique indexes and test both new and historical account sign-in on PostgreSQL.
- `src/routeTree.gen.ts` is generated. Never edit it by hand.
- Build output is `.output/` (Nitro). Run it with
  `bun .output/server/index.mjs`.
- Security overrides for `exceljs>uuid` and `@esbuild-kit/core-utils>esbuild`
  are parent-scoped. Preserve CommonJS UUID v4 and loader transform compatibility;
  exercise extended Excel formatting, Drizzle CLI schema loading, and migrations
  when changing or removing them. Recheck whether upstream ranges include fixes.
- ExcelJS security overrides use `archiver-utils>glob` 14.x,
  `exceljs>unzipper` 0.12.x and `readdir-glob>minimatch` 11.x. Never force
  minimatch 11 into glob 7: glob 7 reads private RegExp fields it no longer has.
  Preserve recursive matching, exclusions, archive and streaming XLSX read/write
  coverage when updating these overrides; upstream still requests older versions.

## Tenant isolation

- Rendant uses a shared database with global identities and per-club memberships.
  SVU owns the legacy data under UUID `00000000-0000-4000-8000-000000000001`.
- Business services must use `db` inside a verified `withTenant` scope. The pool
  sets the restricted `rendant_tenant` role and transaction-local tenant ID;
  forced PostgreSQL RLS and composite foreign keys enforce ownership. Missing
  context fails closed. `withTenant` also assimilates lazy Drizzle thenables.
- `globalDb` is reserved for auth, membership control, migration, security events
  and readiness. Membership helpers must use explicit tenant predicates and
  recheck administrative rights. Never use it to bypass business isolation.
- Roles, bans and notification preferences belong to memberships. Historical
  global bans remain effective; only an SVU admin may explicitly clear one.
  Only allowlisted operators with active SVU admin membership may provision
  clubs; tenant admin rights never grant operator access.
- Club RBAC has `user`, `admin` and `board`. Per-club policy/version live on
  `tenants`; defaults preserve User grants and give Board business management,
  excluding integration setup and DATEV submission. Explicit saved role overrides
  remain authoritative; never rewrite them merely to change a default.
  Resolve capabilities from the current membership and policy on each request,
  never global identity roles or client claims. Enforce them on RPC, API imports,
  downloads and MCP; UI visibility alone is insufficient. See `docs/roles.md`.
  Role policy and role assignment are operator-only on `admin.rendant.app`.
  Club roles never authorize them, even an Admin or Board with all capabilities.
  Legacy `roles.manage` JSON is ignored without rewriting stored policies.
  Ordinary club invitations always use User; elevated invitations and all role
  changes require the operator realm and transaction-level platform checks.
  Centrally restricted club Admins have no delegation bypass: ordinary User
  invitations and unbans remain bounded by their current business grants.
  Actual Admin retains protected user management; preserve last-Admin guards
  and serialize versioned operator policy edits with membership administration.
  Pre-RBAC application rollback can bypass saved restrictions. After Board
  assignment or policy customization, recover with an RBAC-aware application;
  preserve policy/version during backup and isolated restore rehearsals.
- Password recovery uses Better Auth's native one-use, one-hour tokens and
  revokes all sessions of the global identity. Delivery requires a server-only
  verified scope for an active membership or valid pending invitation on the
  actual bound club host, plus that club's encrypted SMTP. Native unscoped auth
  requests never send mail. Keep uniform public responses and the durable
  per-identity cooldown; recovery must not grant memberships or clear bans.
  Login, invitation and auth API responses stay private/no-store, no-referrer
  and excluded from indexing. Capability URLs never belong in transport logs.
  Native auth rate limits use `X-Real-IP` only; the prior proxy assumption was
  Railway-specific and must be checked against the active Vertex ingress.
  Keep host/protocol proxy trust disabled and preserve the restrictive fallback
  when a client address is missing. Forwarded host or address chains must not
  choose a different rate-limit bucket.
  The operator's onboarding handoff is documented in `docs/admin-onboarding.md`.
- All API imports, exports and downloads use `withRequestTenant`. Browser tabs
  pin their tenant in RPC/upload headers and download URLs. Switching clubs
  reloads the document; SSR forwards the verified request selection. Do not
  let a cookie change redirect an older tab's work into another club.
- `TENANT_BASE_DOMAIN` binds registered one-level tenant slugs to actual HTTP
  hosts. Never use forwarded/custom host headers for this authority. Bound hosts
  reject other tenant selectors/invitations and do not offer club switching.
  SSR must forward the actual Host to internal RPC. Auth origins are exact
  allowlisted URLs and cookies stay host-only. Publish DNS only after host
  binding is deployed. See `infra/ssv-gaedheim-dns.yaml` for the scoped records.
- Product-domain cutovers retain immutable legacy host bindings. Configure
  preferred vanity hosts with `TENANT_CANONICAL_HOSTS_JSON`; never rename a
  tenant or rewrite records merely to change its address. Additional exact
  aliases use `TENANT_HOST_ALIASES_JSON`. Enable `TENANT_CANONICAL_BASE_DOMAIN`
  only after DNS/TLS validation; it activates browser redirects and canonical
  mail links together. Compatibility API/assets/server functions and writes
  never redirect. Keep independent `MCP_ALLOWED_ORIGINS` for old SVU clients;
  general auth-origin changes must never expose that token to another club.
- `TENANT_ADMIN_HOST` is a separate operator realm with no default financial
  tenant context, even for valid users or a pinned selector. Its operator APIs
  require an uncached session plus `PLATFORM_ADMIN_EMAILS` and current SVU admin
  membership, rechecked in each mutation transaction. Never expose financial
  RPC/MCP through this host. Operator actions manage tenant metadata,
  memberships and invitations, retain last-admin guards, and are audited.
  Explicit invitation delivery and technical configuration may enter the verified
  destination scope internally. Technical writes verify the operator and update
  settings/audit in one TX, then use the restricted role and local tenant ID.
  Connection tests are explicit; SumUp technical checks never fetch transactions
  or amounts, DATEV configuration never sends documents. Never expose secrets,
  financial data or automatic memberships; preserve the copy link on failure
  and never automatically resend an ambiguous delivery. New tenants
  created here do not automatically grant the operator a club membership.
- New object keys begin with `tenants/<uuid>/`. Only SVU may read the existing
  `protokolle/` and `historical-sources/` paths. Never relocate signed legacy
  documents just to adopt the namespace. The legacy deployment MCP token is SVU-only. Other clubs use their own stored
  encrypted MCP token, unique internal digest and approved bound host. Missing
  override means legacy fallback only for SVU; explicit disable/clear/rotation
  must never fall back again. Keep MCP mode ceilings intersected with the current
  tenant policy; account/role changes remain closed in every MCP mode.
  See `docs/tenant-integrations.md`.
- Tenant migrations and cutover recovery are documented in
  `docs/multi-tenancy.md`. A rollback to a pre-tenant application after migration
  is unsafe. Preserve a recovery point before the first production cutover.

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
- When TanStack Form uses a stable default-values reference, update that baseline
  before explicit save/reload/discard resets. Otherwise the next options update
  can visually restore old defaults after a successful save. Background reads
  must not replace an unsaved role-policy draft.
- External side effects such as S3 uploads and email must not allow a retry to
  create duplicate accounting records. Prefer recoverable partial states and
  explicit regeneration.
- Never delete a previously published original or cancellation PDF during
  regeneration: older database recovery points still reference those objects.
  Publish a regenerated pair atomically against both prior keys and cancellation
  state. Only clean fresh, provably unpublished uploads; an ambiguous database
  failure must retain them. Protocol hashes describe accounting data, while
  DATEV delivery and source archive hashes describe stored file bytes.
- DATEV Upload Mail sends stored PDFs only, through admin-only UI actions. The
  configurable recipient is restricted to `uploadmail.datev.de`; use the
  explicitly approved sender and existing encrypted SMTP transport. A durable
  `datev_deliveries` claim separates original and cancellation documents. Never
  auto-retry after SMTP submission starts: ambiguous or stale sends require an
  audited manual reconciliation. SMTP acceptance does not prove DATEV import.
- The SumUp card revenue fetch (`src/server/services/sumup.ts`) is read-only
  and works on Berlin calendar days (refunds netted, cash rows skipped). The
  person picks days in a dialog; the chosen days are stored in
  `protokoll_sumup_tage` with a transaction snapshot, and a partial unique
  index allows each day in only one active protocol. A storno sets
  `freigegeben_am` instead of deleting the rows. On save the server re-fetches
  the chosen days and rejects the write if the total no longer matches, so a
  refund between fetch and save cannot book a stale amount. The API key is
  stored encrypted via `secret-box` and never returned to the browser; the
  merchant code is resolved from the key on save, never typed.
- SumUp membership discovery allows `limit` up to 25, not the transaction
  history's page size of 100. Use the documented `kind=merchant` and
  `status=accepted` filters when validating a new API key.
- The SumUp picker automatically loads seven calendar days ending at the event
  date (capped at today). Days require explicit selection, never preselect every
  unassigned day in the range. Changing the range clears the selection.
- The protocol list groups receipts by date, catalogue occasion (or matching
  legacy label) and Umsatzbereich. Event subtotals include active cash and card
  revenue in the current filter selection. Pagination keeps each group intact.
- Revenue CSV and Excel exports separate cash, card and total revenue.
  Historical revenue has no payment split: export blank cash/card cells and
  explicitly mark the split as unknown, never infer cash revenue from the total.
- The Umsatzbereich is a reporting classification, not part of the signed
  document. An admin may move a booked protocol into another one with a reason;
  amounts, Belegnummer and Belegtext stay untouched so the stored PDF keeps
  matching its record, and a cancelled protocol is never reclassified. A
  historical entry moves only through the correction path, which cancels the row
  and writes a replacement.
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
- A helper-hour entry may be deleted, but only with a reason and only by an
  admin. The row goes for good, the allocations go with it, and the audit event
  keeps the complete booking. An entry from the list returns with the next
  import of its sheet, so the list has to be corrected too.
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
- A column carrying hours that matches no category is reported, never ignored,
  and so is a recurring value in the "Sonstiges" column that names something no
  category covers.
- The monthly sheets are Excel tables whose definitions ExcelJS misparses
  (`ref` undefined, partial column list) and only preserves verbatim on write.
  Cell edits are safe; never let a script insert or delete rows or columns in
  them, and clear a row instead of deleting it. Structural spreadsheet changes
  belong in Excel.
- A note the list carries in its "Sonstiges" column can be booked onto a point
  of its own through `helper_hour_note_rules`, which moves the whole row and is
  reapplied on every import. That is how a sub-group becomes a point without
  restructuring the sheets. It shifts hours between departments, so it is
  recorded as a repair and never inferred.
- Helpers and occasions are catalogues (`helper_hour_persons`,
  `helper_hour_events`), never typed. Free text was the single largest source of
  bad data: 186 spellings for about 170 people and 41 for some 15 occasions.
  Entry offers search, selection and an explicit "create"; typing only filters.
  Do not reintroduce a free-text name or event field anywhere.
- `helper_hours.nachname`, `vorname` and `veranstaltung` are a mirror of the
  catalogue entry, kept so search, sorting and export need no join. They are
  written only from the catalogue, never from user input.
- `helper_hour_aliases` remembers which spreadsheet spelling means which
  catalogue entry. The list stays free text while it is maintained outside
  Rendant, so the import resolves against catalogue then alias, and asks once
  per unknown spelling rather than once per row. An unresolved spelling blocks
  the import instead of silently creating a second person.
- Merging two catalogue entries moves the hours and keeps the losing spelling as
  an alias, so a future import resolves to the survivor.
- Similar names are reported, never merged automatically. The same similarity
  finds real siblings and married couples, so every merge needs a person. Where
  a list is aggregated per spelling before the comparison, the entry count has
  to be carried through: the merge direction is chosen from it.

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
- Load the release-notes dialog with the version chip, not on click. Tabs may
  stay open across deployments that remove the previous build's asset chunks.
- Before choosing a version during concurrent work, refresh and inspect the
  latest `package.json` and top of `CHANGELOG.md` to avoid duplicate or
  out-of-order releases.

## Deployment

- Production runs on Vertex RKE2 through Fleet. Main CI and security scanning
  gate publication of the GHCR image; the verified digest is promoted to Fleet.
- A Kubernetes init container runs Drizzle migrations before the app starts.
  PostgreSQL uses Longhorn and private documents use Garage. Keep the tenant
  isolation role and permissions intact. Runtime values are provisioned outside Git.
- Railway configuration is historical. Do not operate it as production.
- Schema changes that add a required column to a populated table need add
  nullable, backfill, then `SET NOT NULL`. A bare `ADD COLUMN ... NOT NULL`, as
  drizzle-kit generates it, aborts on any non-empty table.

## Quality bar

- Use Conventional Commits and explain why the change is needed.
- UI copy is short, direct German. Do not use em dashes, en dashes, or emojis.
- A rejected input never reaches a person as a framework message. The oRPC
  logging middleware in `src/server/orpc/base.ts` turns "Input validation
  failed" into the German sentence built by `src/lib/validation-message.ts`,
  logs the field and the rule at warn level, and drops oRPC's issue list so the
  submitted value, which may be an API key or a password, never travels back to
  the browser. A message a schema states itself is already German and is used
  verbatim; Valibot's own wording is translated by issue type. Give a new rule a
  German message in the schema when the generic translation would be unclear.
- A repeating external failure is logged once per cycle and retried with a
  growing delay, never once per attempt per target. Four warnings a minute for
  a permanent 404 cost nothing to produce and made the deploy log unusable.
- Before calling a change complete, run `bun run check`, `bunx tsc --noEmit`,
  `bun run test`, and `bun run build`, then exercise the affected runtime flow
  where feasible.
- Portable database restores must bootstrap the restricted cluster role and
  reapply the explicit tenant ACL allowlist atomically with the restored data.
  Keep `scripts/restore-tenant-permissions.sql` aligned with business tables and
  sequence grants; never use blanket grants over auth/control tables. Rehearse
  with `scripts/test-postgres-restore.sh` against disposable clusters.
- The independent object recovery worker is defined in
  `infra/rendant-object-backup.yaml`. Keep its inline function synchronized with
  the tested source through `scripts/object-backup/sync-template.py --check`.
  Source credentials belong only in the encrypted runtime reference; never in
  templates, commands, logs or invocation responses. Verification restores into
  its isolated recovery prefix and never writes to production storage.
- `/api/health` includes a cached production PDF render. Preserve the
  production-image readiness assertion when changing React PDF, PDFKit, fonts,
  Nitro bundling, or the Docker runtime.
- Readiness also awaits Better Auth's schema verdict (`auth: true`) and reads
  the physical auth tables and legacy issuer constraint; the adapter only checks
  the declared Drizzle model, and context creation does not await its verdict. Database/schema probes time out
  after ten seconds, PDF rendering after fifteen. CI must assert all readiness
  flags in the actual production image, alongside authenticated integration tests.
- LFIO is retired. Health checks run on request without an external telemetry
  reporter; keep database and PDF readiness independent of external monitoring.
- Keep `AGENTS.md`, `.env.example`, migrations, and operational documentation in
  sync with behavior changes.

## Maintaining this file

Public screenshots belong in `docs/screenshots/` and must come from an isolated
demo instance with synthetic accounting records. Label the demo data in the
README. Never publish actual financial records or uploaded source documents.

Keep this file concise and update it when verified repository behavior changes.
Move detailed explanations to `docs/` and keep `CLAUDE.md` as the compatibility
import unless Claude-specific guidance is genuinely required.

## Runtime memory mode

Production server commands pass `bun --smol` explicitly. Keep this scoped to
the long-lived server process; do not set global `BUN_OPTIONS` for builds,
installs or migrations. Preserve readiness and background work when measuring
memory savings. Removing the runtime flag is the rollback.

## Local sandbox credentials

Set `SANDBOX_ADMIN_PASSWORD` to a locally chosen password of at least 12 characters
before starting the disposable sandbox. The launcher never prints passwords or
command arguments that may contain credentials. No production credential is needed.

## Main-only branch lifecycle and security reporting

`main` is the only retained local and remote branch for this active
repository. Temporary PR branches are allowed only while work is in progress.
Keep required checks and branch protections; never bypass them to avoid a branch.
Before finishing, merge validated work, delete the remote and local task branches,
remove clean worktrees created for the task, and verify that only `main` remains
with `git ls-remote --heads origin` and `git for-each-ref refs/heads`.

If a task cannot safely merge, preserve commits in a verified Git bundle outside
the checkout and save staged, unstaged and untracked changes. Detach any retained
worktree before deleting its task branch, and report the unfinished work and
recovery location. Never discard unrelated changes, retain an `archive/` branch,
or modify an archived repository to satisfy cleanup. A later explicit owner
instruction can retain a branch.

Follow `SECURITY.md` for vulnerability reports. Keep reports private and omit
credentials, production records and personal data from public issues and commits.

## Production security gates

Verified images are published only after successful GitHub workflows on `main`. Keep an always-running
push workflow and do not cancel its main-branch runs. PR branch cleanup never
justifies bypassing CI. Public repositories also enforce CodeQL results on main.
Container security builds the production image and scans OS and library packages.
Retain the complete report. Fixable HIGH/CRITICAL findings block delivery;
upstream-unfixed findings remain visible and require explicit review. Do not add
blanket scanner ignores or weaken these gates to make a release pass.
