# Plan 007: Anlass catalog — make year-over-year comparison actually link

## Status

Not started. Design plan. No code written yet. Live-data migration involved, so
this MUST be reviewed before any implementation and executed phase by phase.

## Why this matters

The "Vorjahresvergleich" groups events by the free-text `anlass` string (via a
`lowercase + collapse whitespace` key). A free-typed field cannot be a reliable
join key: different volunteers spell the same event differently, so the grouping
fragments and cross-year linkage silently fails.

This is not hypothetical. Production data (39 active protokolle, all from 2026)
already shows the exact failure, one real event under many labels:

- **Thursday bar duty** — 4 labels, one with a typo:
  `Wirtschatsdienst Donnerstag Abend` (3, missing "f"),
  `Wirtschaftsbetrieb: Donnerstag` (1), `Donnerstagabend` (1),
  `Biergarten Donnerstag abend` (1)
- **Biergarten** — 3 labels: `Biergarten` (9), `Sonntag Biergarten` (3),
  `Biergarten Sonntag` (2)
- **Home game** — `Sonntag Heimspiel Steinsfeld/Grettstadt` (4),
  `Korbball Heimspiel` (1), `Korbball` (1)

Because everything is 2026, nothing is compared yet — and next season **nothing
will link**, since the key is a typed string. The feature looks like it works
but is a time bomb.

Also: one real-world event is several till-protocols (Sommerfest = 3 tills same
day, Heimspiel = 4). So "9 Biergarten protokolle" is not "9 Biergarten
evenings". Protocol count overstates event frequency.

The valuable work is the taxonomy **underneath** the comparison, not more charts.

## Current state

- `protokolle.anlass text NOT NULL` (`schema.ts:32`, check length 1..200) is both
  the human description and the implicit grouping key.
- `historical_revenues` (Altunterlagen) has a **separate** `vergleichsgruppe text`
  plus its own `anlass` — a second, inconsistent grouping mechanism.
- Grouping lives in `historical-revenue-overview.tsx` (`occasionKey()`,
  `buildComparisons()`): normalizes and sums per (occasionKey, year). No concept
  of "event" vs "till", no recurring/one-off distinction.
- Entry form `protokoll-form.tsx` captures `anlass` as a free `<Input>`. The
  historical form has a `vergleichsgruppe` `<datalist>` autocomplete; the
  protokoll form has no such guardrail.
- Proven pattern to mirror: **cash_registers** — a managed catalog (`schema.ts`),
  `services/cash-registers.ts` (list/create/update/delete), admin CRUD in
  `cash-registers-form.tsx` under Einstellungen, and a "pick a template" step in
  the entry form. This is exactly the shape we want for Anlass.

## The model

Separate the two jobs the `anlass` string currently does:

1. **Anlass catalog** — a small, admin-managed list of the club's real events
   (~8 entries), each with a stable id and a `typ` (recurring | one-off). This is
   the join key. Mirrors cash_registers.
2. **Free label / note** — stays on the protocol (`anlass`), untouched, for the
   PDF and the audit record. Never used for grouping.
3. **Aliases** — normalized old spellings mapped to a catalog entry. Used to
   (a) backfill existing rows, (b) suggest a match when someone free-types.
4. **Event = (catalog entry, date)** — bundles the several till-protocols of one
   evening, so counts are honest ("8 Termine / 14 Protokolle").
5. **Aggregation by typ** — recurring rolls up per season (Summe, Anzahl Termine,
   Ø/Termin); one-off compares year-to-year directly.

Grouping precedence: `anlass_katalog_id` when set, else the normalized `anlass`
text (legacy rows show as "nicht zugeordnet"). So the app degrades gracefully and
an empty catalog changes nothing — safe to ship and roll back.

## Commands you will need

- `bun run db:generate` — generate a migration after editing `schema.ts`
- `bun run db:migrate` (dev) / preDeploy `db:migrate:prod` (prod, automatic)
- `bunx tsc --noEmit`, `bunx biome check --write <files>`, `bun test`, `bun run build`
- Live-data inspection (read-only, credential kept out of the transcript):
  `DBURL=$(cat .db-backup/.dburl); psql "$DBURL" -c "..."`

## Scope

In scope: catalog table + alias table + nullable FKs on `protokolle` and
`historical_revenues`; catalog CRUD (admin); backfill/seed of live data; entry
form Anlass picker + fuzzy suggest; comparison rework (event/recurring); audit
events for catalog mutations.

Out of scope: changing PDF layout, changing amounts/finance math, touching USt
logic, renaming existing `anlass` text on stored rows (never rewrite history).

## Git workflow

One branch per phase, small PRs, merge to `main` (auto-deploys). Bump
`package.json` minor per phase and add a German CHANGELOG entry. Live-data
backfill runs as a reviewed, idempotent, dry-run-first step — never bundled
silently into a schema migration.

## Steps

### Phase 1 — Foundation + backfill (grouping improves with zero entry-form change)

#### Step 1.1: Schema
Add to `src/server/db/schema.ts`, mirroring `cash_registers`:

```ts
export const anlassKatalog = pgTable("anlass_katalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  typ: text("typ").notNull().default("wiederkehrend"), // 'wiederkehrend' | 'einmalig'
  aktiv: boolean("aktiv").notNull().default(true),
  reihenfolge: integer("reihenfolge").notNull().default(0),
  created_at: timestamp(...).notNull().defaultNow(),
  updated_at: timestamp(...).notNull().defaultNow(),
}, (t) => [
  index("idx_anlass_katalog_order").on(t.reihenfolge, t.name),
  check("anlass_katalog_typ_check", sql`${t.typ} IN ('wiederkehrend','einmalig')`),
  check("anlass_katalog_name_check", sql`length(trim(${t.name})) BETWEEN 1 AND 120`),
]);

export const anlassAliase = pgTable("anlass_aliase", {
  id: uuid("id").primaryKey().defaultRandom(),
  alias_norm: text("alias_norm").notNull().unique(), // occasionKey() of the old text
  anlass_katalog_id: uuid("anlass_katalog_id").notNull()
    .references(() => anlassKatalog.id, { onDelete: "cascade" }),
  created_at: timestamp(...).notNull().defaultNow(),
});
```

Add nullable FKs (additive, safe): on `protokolle` and `historical_revenues`
`anlass_katalog_id uuid references anlass_katalog(id) on delete set null`, plus an
index. Do NOT touch the existing `anlass` / `vergleichsgruppe` columns.

#### Step 1.2: Migration
`bun run db:generate`, inspect the SQL (must be pure `ADD COLUMN` / `CREATE TABLE`,
no destructive change), commit it. Prod applies it via preDeploy before the new
code runs.

#### Step 1.3: Catalog service + oRPC (mirror cash-registers)
`src/server/services/anlass-catalog.ts`: `listKatalog`, `createKatalog`,
`updateKatalog` (with `updated_at` predicate for multi-admin safety),
`deleteKatalog` (only if unreferenced, else block or set-null). oRPC procedures
`anlassKatalog.*` (list = authed, mutations = adminOnly), valibot schema in
`schemas.ts`, audit event per mutation via the central audit service.

#### Step 1.4: Admin CRUD UI
`src/components/anlass-catalog-form.tsx` cloned from `cash-registers-form.tsx`
(name, typ toggle, order, aktiv), wired into `einstellungen.tsx` as a new
"Anlässe" section next to "Kassen".

#### Step 1.5: Seed + backfill (the careful, live-data part)
A reviewed one-off admin action / script `src/server/services/anlass-backfill.ts`:
1. Seed catalog + aliases from the observed data (initial mapping below).
2. For every `protokolle` and `historical_revenues` row with `anlass_katalog_id
   IS NULL`, look up `occasionKey(anlass)` in `anlass_aliase`; if matched, set the
   FK. Never modify `anlass`/`vergleichsgruppe`.
3. **Dry-run first**: print a report (each row → matched catalog / unmatched)
   without writing. Only on explicit confirmation, write inside one transaction.
4. Idempotent (only fills NULLs) and reversible (`UPDATE ... SET anlass_katalog_id
   = NULL` restores; catalog/alias tables are additive).

Initial mapping derived from live data (admin can adjust before running):

| Catalog (typ) | aliases (normalized) |
|---|---|
| Biergarten (wiederkehrend) | biergarten · sonntag biergarten · biergarten sonntag |
| Donnerstag Wirtschaftsdienst (wiederkehrend) | wirtschatsdienst donnerstag abend · wirtschaftsbetrieb: donnerstag · donnerstagabend · biergarten donnerstag abend |
| Heimspiel (Fußball) (wiederkehrend) | sonntag heimspiel steinsfeld/grettstadt · heimspiel |
| Korbball (wiederkehrend) | korbball · korbball heimspiel |
| Seniorennachmittag (wiederkehrend) | seniorennachmittag |
| Sommerfest (einmalig) | svu sommerfest |
| Haxenabend (einmalig) | haxenabend |
| Bürgerversammlung (einmalig) | bürgerversammlung |
| Frauenbund (einmalig) | frauenbund |
| Public Viewing (wiederkehrend, nur EM/WM-Jahre) | public viewing |
| Tischtennisabteilung (einmalig) | tischtennisabteilung |

Note: "Heimspiel" without a qualifier means Fußball; Korbball is a separate
sport and stays its own catalog entry. Public Viewing recurs (several matches)
but only in tournament years — the comparison simply shows the years it happened.

After Phase 1 the comparison already collapses correctly for existing rows via
the FK — before any entry-form change.

### Phase 2 — Capture at the source (the payoff: next year links automatically)

#### Step 2.1: Entry form Anlass picker
In `protokoll-form.tsx`, replace the free `anlass` `<Input>` with:
- a Combobox/Select of active catalog entries (sorted by `reihenfolge`),
- an optional free "Zusatz / Notiz" for the specific instance,
- admin-only inline "＋ Neuer Anlass" (creates a catalog entry within the create
  path, referenced — not free text),
- **fuzzy suggest**: if a non-catalog string is entered (import/edge), match
  against catalog names + aliases and prompt "Meinst du *Biergarten*? (8×)".

Persist `anlass_katalog_id` + compose the human `anlass` label
(`"<Katalogname>"` or `"<Katalogname> — <Notiz>"`) so the PDF stays readable.
Non-admins can only pick existing entries.

#### Step 2.2: Wire through
`CreateProtokollSchema` gains `anlass_katalog_id` (valibot); `services/protokoll.ts`
persists it; the create audit event records it. Reference a catalog entry created
on the fly inside the same write path.

### Phase 3 — Honest comparison

#### Step 3.1: Group by catalog, event = (catalog, date)
Rework `historical-revenue-overview.tsx` grouping: key on `anlass_katalog_id`
(fallback to normalized text as "nicht zugeordnet"). Fold till-protocols of the
same (catalog, date) into one "Veranstaltung".

#### Step 3.2: typ-aware aggregation
Recurring: per year show Summe, Anzahl Termine (distinct dates), Ø/Termin.
One-off: direct year-to-year. Show Ø/Termin as the primary cross-year metric for
recurring events.

#### Step 3.3: Unify historical under the catalog
Historical entries reference `anlass_katalog_id`; deprecate the free
`vergleichsgruppe` input (keep the column, stop writing to it). Historical
comparison-group UI becomes the same catalog picker.

## Test plan

- Unit: `occasionKey`/alias normalization; alias match; grouping folds tills into
  events; recurring aggregation (Summe/Anzahl/Ø); one-off passthrough; fallback
  for unmapped rows.
- PG integration (per CLAUDE.md rule): concurrent catalog edits use `updated_at`
  predicate (no lost update); backfill is idempotent (second run is a no-op) and
  never mutates `anlass`.
- Manual: create a protokoll via the picker → appears under the right catalog;
  add a second till same date → one Veranstaltung, two protocols; verify PDF label.

## Done criteria

- Existing 2026 rows collapse to the ~8 real events in the comparison.
- A new protokoll carries a catalog id; a second season would link automatically.
- Recurring events show Anzahl Termine + Ø/Termin; multi-till events count once.
- `anlass` text on stored rows is byte-for-byte unchanged; backfill reversible.
- tsc 0, biome clean, tests green, build ok; version bumped + CHANGELOG per phase.

## STOP conditions

- Backfill dry-run shows an unexpected mapping (a row matching the wrong catalog)
  → stop, adjust aliases, re-run dry-run.
- Any migration SQL that is not purely additive → stop and review.
- More than a handful of rows land "nicht zugeordnet" → stop; the seed mapping is
  incomplete, extend it rather than guessing at write time.
- Entry-form change would let a non-admin create catalog entries freely → stop
  (that reopens the drift the plan closes).

## Maintenance notes

- New recurring club events are added once in Einstellungen > Anlässe; volunteers
  never type a grouping key again.
- Aliases exist for legacy/import reconciliation, not as a normal input path.
- Keep the text-fallback grouping forever so the app never hard-depends on the
  catalog being populated.
