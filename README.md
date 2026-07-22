# SVUFO

Webapp zur digitalen Erfassung von Kassenzählprotokollen für einen Verein.
Ersetzt die bisherige Excel-Liste. Output ist ein PDF-Beleg, der manuell in
DATEV Unternehmen Online hochgeladen wird. Vereinsname und Logo sind über
Umgebungsvariablen konfigurierbar.

## Features

- Login per E-Mail und Passwort (better-auth). Offene Registrierung ist
  deaktiviert: ein Admin lädt weitere Personen per Einmal-Link ein.
- Erfassung Kopfdaten, Stückelung (15 Denominationen), betriebliche Ausgaben
- USt.-Satz pro Ausgabe (0 %, 7 %, 19 %, frei wählbar)
- Anfangsbestand (Wechselgeld) mit Default 160,00 EUR änderbar
- Konfigurierbare Belegnummer-Vergabe pro Jahr (z.B. `2026-0001`)
- Automatische Berechnung von Gezählt, Bestand, Tageseinnahmen netto
- PDF-Generierung nach jedem Speichern, Upload nach S3 (Tigris)
- SHA256-Prüfsumme der Daten in DB und auf der Detailseite
- Storno-Workflow (GoBD-konform): Originalbeleg bleibt unveränderlich,
  zusätzliches Storno-PDF mit Wasserzeichen
- CSV-Export aller Protokolle eines Zeitraums für den Steuerberater
- Healthcheck `/api/health` mit DB-Ping

## Stack

- TanStack Start (Vite) + TanStack Router, Query und Form
- oRPC v1 als type-safe API-Layer, Valibot für Validierung
- better-auth (mit `tanstackStartCookies` und admin-Plugin)
- Drizzle ORM auf PostgreSQL
- `@react-pdf/renderer` für PDFs, `@aws-sdk/client-s3` für Tigris
- Tailwind v4, shadcn/ui (radix-ui), lucide-react, sonner
- Bun als Runtime und Paketmanager, Biome für Lint/Format, Vitest für Tests

## Lokale Entwicklung

```bash
bun install
cp .env.example .env       # DATABASE_URL, BETTER_AUTH_SECRET, ADMIN_*, S3-Variablen eintragen
bun run db:migrate         # Schema anlegen
bun run db:migrate:prod    # Admin aus ADMIN_EMAIL/ADMIN_PASSWORD anlegen (idempotent)
bun run dev                # http://localhost:3000
```

Weitere Skripte:

- `bun run test` – Vitest
- `bun run check` – Biome Lint + Format
- `bun run build` – Produktions-Build nach `.output/`
- `bun run db:generate` – neue Drizzle-Migration aus Schema-Änderungen
- `bun run auth:generate` – better-auth Schema neu erzeugen

## Benutzer einladen

Als Admin unter **Einstellungen → Benutzer & Einladungen** eine E-Mail
eintragen und Rolle wählen. Der erzeugte Link ist 7 Tage gültig; die
eingeladene Person setzt darüber Name und Passwort. Admins können Rollen
bestehender Konten später ändern sowie Konten sperren und wieder entsperren.

## Historische Umsätze importieren

Admins können unter **Import & Export** eine leere Excel-Vorlage mit den
aktuellen Umsatzgruppen herunterladen. Die ausgefüllte XLSX-Datei wird vor dem
Import vollständig geprüft und anschließend atomar übernommen.

## Deploy auf Railway

Railway baut über den committeten `Dockerfile` (Bun, Multi-Stage, Output nach
`.output/`). Konfiguration in `railway.toml`:

- `preDeployCommand` führt `bun run db:migrate:prod` aus (Migrationen + Admin-Seed)
- `startCommand` startet `bun .output/server/index.mjs`
- Healthcheck auf `/api/health`

### Einrichtung

1. Postgres- und Bucket-Plugin im Railway-Projekt hinzufügen (liefern
   `DATABASE_URL` bzw. `AWS_*` automatisch).
2. Service-Variablen setzen: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
   `APP_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `S3_BUCKET_NAME`,
   `VEREINSNAME`, `LOGO_URL`. Siehe `.env.example`.
3. Domain zuweisen, HTTPS ist automatisch.

## Hinweise

- Geldbeträge werden grundsätzlich als `integer` Cent gespeichert. Konvertierung
  passiert nur am Form-Input und bei der Anzeige.
- Stornierte Belege werden NICHT gelöscht (Aufbewahrungspflicht). Die
  Belegnummern-Sequenz bleibt lückenlos.
