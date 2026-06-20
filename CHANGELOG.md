# Changelog

All notable changes to this project. Newest first. The version here matches
`package.json` and the version chip in the app.

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
