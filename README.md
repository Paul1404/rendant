# SVUFO

Webapp zur digitalen Erfassung von Kassenzählprotokollen für einen Verein.
Ersetzt die bisherige Excel-Liste. Output ist ein PDF-Beleg, der manuell in
DATEV Unternehmen Online hochgeladen wird. Vereinsname und Logo sind über
Umgebungsvariablen konfigurierbar, siehe Abschnitt Branding.

## Features

- Login mit Admin-Passwort, JWT in httpOnly Cookie (8 Stunden Gültigkeit)
- Rate-Limiting auf Login (5 Fehlversuche pro IP / 15 Minuten, plus globaler
  Backstop gegen gefaelschte IPs)
- Erfassung Kopfdaten, Stückelung (15 Denominationen), betriebliche Ausgaben
- USt.-Satz pro Ausgabe (0 %, 7 %, 19 %, frei wählbar)
- Anfangsbestand (Wechselgeld) mit Default 160,00 EUR änderbar
- Automatische Belegnummer-Vergabe pro Jahr (`SVUFO-2026-0001`)
- Automatische Berechnung von Gezählt, Bestand, Tageseinnahmen netto
- PDF-Generierung nach jedem Speichern, Upload nach Tigris S3
- SHA256-Prüfsumme der Daten in DB und auf der Detailseite
- Storno-Workflow (GoBD-konform): Originalbeleg bleibt unveränderlich,
  zusätzliches Storno-PDF mit Wasserzeichen wird hochgeladen
- CSV-Export aller Protokolle eines Zeitraums für Steuerberater
- Healthcheck `/api/health` mit DB-Ping

## Stack

- Next.js 16 App Router, TypeScript
- Hono als API-Layer (mounted unter `/api/[[...route]]`)
- Postgres (`postgres` Paket, kein ORM), Migrationen via `node-pg-migrate`
- JWT mit `jose`, Passwort-Hashing mit `bcryptjs`
- `@react-pdf/renderer` fuer PDFs, `@aws-sdk/client-s3` fuer Tigris
- Tailwind v4, shadcn/ui, lucide-react, sonner

## Sicherheitsmodell

Die App ist als internes Werkzeug fuer eine einzelne Vertrauensperson gebaut.
Wer das hier forkt, sollte das wissen:

- Es gibt genau ein gemeinsames Admin-Passwort (`ADMIN_PASSWORD`). Keine
  Einzelkonten, keine Rollen, kein Audit-Trail pro Benutzer.
- Die Sitzung laeuft ueber ein JWT in einem httpOnly-Cookie mit 8 Stunden
  Gueltigkeit. Ein Logout loescht das Cookie, invalidiert das Token aber nicht
  serverseitig (kein Token-Blacklisting).
- Brute-Force-Schutz: maximal 5 Fehlversuche pro IP in 15 Minuten plus ein
  globaler Backstop ueber alle IPs. Der Backstop greift auch dann, wenn ein
  Angreifer den `X-Forwarded-For`-Header faelscht.
- Die Client-IP wird aus dem letzten Eintrag von `X-Forwarded-For` gelesen.
  Das ist korrekt hinter genau einem vertrauenswuerdigen Proxy (Railway). Bei
  einem anderen Deployment-Aufbau muss diese Logik angepasst werden.
- `/api/health` ist ohne Login erreichbar und meldet die DB-Erreichbarkeit.

Fuer den Einsatz als Vereinswerkzeug hinter HTTPS ist das ausreichend. Fuer
einen breiteren oder oeffentlicheren Einsatz braucht es echte Benutzerkonten.

## Lokale Entwicklung

```bash
# Postgres anlegen (nur lokal, Wegwerf-Zugangsdaten)
sudo -u postgres psql -c "CREATE USER svufo WITH PASSWORD 'svufo';"
sudo -u postgres psql -c "CREATE DATABASE svufo OWNER svufo;"

# Env anlegen
cp .env.example .env.local
# DATABASE_URL, JWT_SECRET, ADMIN_PASSWORD, S3-Variablen eintragen

# Migrationen ausführen
npm install
npm run migrate

# Dev-Server starten
npm run dev
# http://localhost:3000
```

Für einen lokalen S3-kompatiblen Server kann MinIO verwendet werden
(`minio server /tmp/minio-data`), Bucket per `mc mb local/svufo-test`.

## Branding

Vereinsname und Logo sind nicht im Code verdrahtet, sondern werden zur
Laufzeit aus Umgebungsvariablen gelesen. Ohne sie läuft die App mit einem
neutralen Namen und Logo.

- `VEREINSNAME` setzt den angezeigten Namen in Kopf, Login, Footer und PDF.
  Default ist `Verein`.
- `LOGO_URL` setzt das Logo. Default ist `/logo.svg`, ein neutrales Logo aus
  `public/`. Für ein eigenes Logo eine öffentlich erreichbare Bild-URL
  hinterlegen (z.B. ein Objekt im eigenen Tigris-Bucket oder auf der
  Vereinswebsite). Ein lokaler Pfad funktioniert ebenfalls, muss dann aber in
  `PUBLIC_PATHS` in `proxy.ts` ergänzt werden, damit er vor dem Login lädt.

Beide Werte wirken sofort nach einem Neustart, ein Rebuild ist nicht nötig.

## Production Build

```bash
npm run build
npm start
```

## Docker

```bash
docker build -t svufo .
docker run --env-file .env -p 3000:3000 svufo
```

## Deploy auf Railway

Der Repo wird as-is auf Railway gepusht. Build läuft über den committeten
`Dockerfile` (`railway.json` setzt `builder: DOCKERFILE`).

### Einmalige Einrichtung

1. **Project anlegen** und das Repo verbinden, Branch wählen.
2. **Postgres-Plugin** hinzufügen. Railway injiziert `DATABASE_URL` automatisch.
3. **Tigris-Plugin** (S3) hinzufügen. Railway injiziert
   `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`,
   `AWS_ENDPOINT_URL_S3` automatisch. Bucket im Tigris-Dashboard manuell
   anlegen, Name in der Variable `S3_BUCKET_NAME` hinterlegen.
4. **Variablen** im Service-Dashboard setzen:
   - `ADMIN_PASSWORD` (Klartext, wird beim Start gehasht)
   - `JWT_SECRET` (mind. 32 zufällige Bytes hex, z.B. `openssl rand -hex 32`)
   - `S3_BUCKET_NAME`
   - `VEREINSNAME` (Anzeigename des Vereins, siehe Branding)
   - `LOGO_URL` (optional, eigenes Logo, siehe Branding)
5. **Domain** zuweisen (Railway-Subdomain reicht), HTTPS ist automatisch.

### Deploy-Ablauf

`railway.json` definiert:

- `builder: DOCKERFILE` mit dem committeten `Dockerfile`
- `preDeployCommand: ["npm run migrate"]` läuft VOR dem Container-Start in
  einem separaten Container-Klon mit denselben Env-Variablen
- `startCommand: node_modules/.bin/next start -p ${PORT:-3000}`
- `healthcheckPath: /api/health` mit 60 Sekunden Timeout
- `restartPolicyType: ON_FAILURE`, max 3 Restarts

Healthcheck antwortet 200 mit `{ ok: true, db: true }` sobald die App und die
Datenbank erreichbar sind.

## Wichtig

- `node-pg-migrate`, `pg` und `next` müssen unter `dependencies` (nicht
  `devDependencies`) stehen, damit `npm prune --omit=dev` sie nicht entfernt
  und der Pre-Deploy-Befehl `npm run migrate` im Image funktioniert.
- Geldbeträge werden grundsätzlich als `integer` Cent gespeichert. Konvertierung
  passiert nur am Form-Input und bei der Anzeige.
- Stornierte Belege werden NICHT gelöscht (Aufbewahrungspflicht). Die
  Belegnummern-Sequenz bleibt lückenlos.
