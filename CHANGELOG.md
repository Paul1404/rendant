# Changelog

All notable changes to this project. Newest first. The version here matches
`package.json` and the version chip in the app.

## 1.1.1 — 2026-06-20

- Fixed a crash when copying an invite link over HTTP (clipboard unavailable);
  the link is now always selectable as a fallback.
- New-protokoll form: stable row identity for Ausgaben and USt rows so deleting
  a middle row no longer mis-associates inputs.
- Dashboard: KPI amounts no longer wrap mid-number on small screens; the
  month-over-month delta only shows for the current-month view.
- Detail and list tables scroll horizontally on mobile instead of clipping.
- Accessibility: keyboard-reachable password toggle, aria-current nav,
  aria-pressed toggles, stable form field ids; error details hidden in
  production. Removed dead code.

## 1.1.0 — 2026-06-20

- Finance dashboard: period KPIs (Umsatz, Ausgaben, Netto-Ergebnis, Ø je Beleg),
  a 12-month revenue trend chart, an Umsatzsteuer breakdown (USt. auf Umsatz,
  Vorsteuer, Zahllast), a Bar-gegen-Karte split and Top-Anlässe ranking. The
  period selector now drives the whole overview.
- Version chip opens a "Was ist neu" window with the in-app release notes.
- Per-page browser titles, a 404 page and a global error boundary.

## 1.0.1 — 2026-06-20

- Fixed `"/api/rpc" cannot be parsed as a URL` on client-side navigation
  (Einstellungen, new protokoll, and other oRPC calls): the browser oRPC client
  now uses an absolute URL, since RPCLink requires one.

## 1.0.0 — 2026-06-20

First release on the TanStack Start stack.

- Rebuilt the app from Next.js to TanStack Start + oRPC + better-auth +
  Drizzle + Valibot, on the Bun runtime with Biome.
- Auth is now email and password (better-auth) with an admin-driven invite
  flow; open registration is disabled.
- Migrated the database to Drizzle and re-imported the existing protokolle.
- Design refresh: reworked login screen, refined cards and global polish.
- Removed filler copy and stray dashes from the UI.
- Added a version chip (footer and login) backed by `package.json`.
