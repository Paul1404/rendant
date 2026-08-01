# Rendant

Rendant ist die interne Finanzverwaltung für Vereine. Die Webanwendung erfasst
Kassenbewegungen, wertet Umsätze und Steuern aus und hält jeden Vorgang
nachvollziehbar für Buchhaltung, Prüfung und Übergabe fest.

Die Anwendung bildet den Ablauf von der Kassenaufnahme bis zum PDF-Beleg ab.
Sie verwaltet Kassen und Umsatzbereiche, berechnet Einnahmen und Umsatzsteuer,
vergleicht Veranstaltungen über mehrere Jahre und übernimmt historische
Umsätze aus Excel. Eine direkte DATEV-Anbindung gibt es nicht. PDF- und
CSV-Dateien werden für die weitere Übergabe an Buchhaltung oder Steuerberatung
heruntergeladen.

## Arbeitsbereiche

| Bereich | Inhalt | Zugriff |
| --- | --- | --- |
| Protokolle | Dashboard, Suche, Zeitfilter und Belegliste | Alle angemeldeten Benutzer |
| Neu | Vollständige Erfassung eines Kassenzählprotokolls | Alle angemeldeten Benutzer |
| Umsätze | Vorjahresvergleich und Altunterlagen | Vergleich für alle, Erfassung nur für Admins |
| Import & Export | Excel-Import, XLSX, CSV, USt-Auswertung und JSON-Geschäftsarchiv | Fachliche Exporte für alle, Import und Geschäftsarchiv nur für Admins |
| Audit-Log | Filterbare Ereignisspur aller relevanten Vorgänge | Nur Admins |
| Einstellungen | Eigene Benachrichtigungen sowie zentrale Verwaltung | Persönliche Einstellung für alle, Verwaltung nur für Admins |

## Funktionsumfang

### Kassenzählprotokolle

- Erfassung von Kasse, Umsatzbereich, Details, Datum sowie
  zählender und optional prüfender Person
- Bargeldzählung über 15 Münz- und Scheinstückelungen
- Kassenabhängiger Anfangsbestand, Kartenzahlungen und betriebliche Ausgaben
- Umsatzsteuer je Ausgabe mit 0 %, 7 %, 19 % oder einem eigenen Satz
- Optionale Aufteilung des Umsatzes nach Umsatzsteuersätzen
- Automatische Berechnung von Endbestand, Ausgaben, Barumsatz und Gesamtumsatz
- Konfigurierbare, transaktional vergebene Belegnummern pro Kalenderjahr
- Lokaler Formularentwurf zum Schutz vor versehentlich verlorenen Eingaben
- Plausibilitätshinweise bei fehlender Stückelung, ungewöhnlichem Wechselgeld,
  alten oder zukünftigen Datumsangaben und identischen Namen im
  Vier-Augen-Prinzip
- Detailansicht mit Ersteller, Originaldaten, Ausgaben, USt-Aufteilung,
  PDF-Status und Prüfsummen

### Belege und Korrekturen

- PDF-Erzeugung nach dem Speichern und Ablage in einem S3-kompatiblen Bucket
- SHA-256-Prüfsumme für jeden erzeugten PDF-Beleg
- Nachträgliche Regeneration eines fehlgeschlagenen oder fehlenden PDFs
- Atomarer Storno-Ablauf mit Begründung und zusätzlichem Storno-PDF
- Unverändertes Originalprotokoll und erhaltene Belegnummer bei einer
  Stornierung

### Dashboard

- Kennzahlen für Umsatz, Ausgaben, Kartenzahlungen und erfasste Einträge
- Vergleich mit dem vorherigen Zeitraum und kontextbezogene Entwicklung
- Umsatzverlauf nach Tag, Woche oder Monat mit auswählbaren Punkten und einer
  gemeinsamen Detailansicht für Kassenzählprotokolle und historische Umsätze
- Aufteilung von Bar- und Kartenzahlungen sowie Umsatz nach Umsatzbereichen
- Ergebnis aus Umsatz und erfassten Ausgaben in der Detailauswertung
- Umsatzsteuer, Vorsteuer aus Ausgaben und daraus berechnete Zahllast
- Suche sowie Filter nach Zeitraum, Kalenderjahr und Storno-Status
- Jahresauswahl für abgeschlossene Geschäftsjahre und Auswertungen der
  Jahreshauptversammlung
- Automatische Aktualisierung beim erneuten Fokussieren des Fensters und
  spätestens alle 15 Sekunden

### Umsätze und Vorjahresvergleich

Die Auswertung verbindet aktuelle Kassenzählprotokolle mit Zahlen aus
Altunterlagen. Neue Einträge verwenden zwei Angaben:

- Der feste `Umsatzbereich` ordnet den Vorgang fachlich ein, zum Beispiel
  `Wirtschaftsbetrieb` oder `Veranstaltungen`.
- `Details` beschreiben den konkreten Termin oder die Kasse, zum Beispiel
  `Biergarten Donnerstag` oder `Sommerfest · Essenkasse`.

Die Vergleichskarten zeigen für jeden Umsatzbereich:

- Umsatz und Ergebnis je Kalenderjahr
- absolute und prozentuale Veränderung zum Vorjahr
- Anzahl und Herkunft der enthaltenen Protokolle und Altunterlagen
- die Anzahl unterschiedlicher Termine und den durchschnittlichen Umsatz pro
  Termin
- einen auf alle Jahre gleich angewendeten Monatszeitraum

Mehrere Kassenprotokolle desselben Umsatzbereichs am selben Tag zählen dabei als
ein realer Termin. Ältere Datensätze behalten ihre bisherige Gruppierung, damit
keine historische Zuordnung stillschweigend umgedeutet wird.

Admins können historische Umsätze einzeln mit Datum, Umsatzbereich, Details,
Umsatz, Ausgaben, Quellreferenz und Bemerkung
erfassen. Ein Hinweis meldet bereits vorhandene Protokolle oder Altunterlagen
für denselben Tag und denselben Bereich, ohne eine bewusst gewünschte Erfassung
zu blockieren. Historische Werte fließen in Dashboard und Umsatzvergleich ein,
aber bewusst nicht in die Umsatzsteuer-Auswertung.

Admins können historische Umsätze mit einer Begründung stornieren. Stornierte
Altunterlagen bleiben sichtbar, werden aber aus Dashboard und Vergleich
entfernt.

### Import und Export

- Excel-Vorlage für historische Umsätze mit der bisherigen Katalogzuordnung.
  Neue Einzelerfassungen verwenden die sechs festen Umsatzbereiche
- Zweistufiger Excel-Import mit Prüfung, Vorschau, Zeilenfehlern,
  Summen, Dublettenhinweisen und ausdrücklicher Bestätigung
- Atomare und idempotente Übernahme von höchstens 500 Zeilen und 5 MB pro Datei
- Keine Teilimporte. Eine fehlerhafte Zeile verhindert die gesamte Übernahme
- Ein erneuter Upload derselben Vorlagendatei erzeugt keine doppelten Einträge
- Bereits importierte Zeilen können nicht durch eine nachträglich veränderte
  Datei überschrieben werden
- Gemeinsamer Umsatzexport aus Protokollen und historischen Werten als XLSX
  oder CSV
- XLSX mit Autofilter, fixierter Kopfzeile und formatierten Datums- und
  Währungszellen
- Protokoll-CSV und Umsatzsteuer-CSV für einen gewählten Zeitraum
- Versioniertes JSON-Geschäftsarchiv für Admins mit Protokollen, historischen
  Umsätzen, Kassen, den historischen Katalogdaten, Belegnummernsequenzen und sicheren
  Einstellungen. Es ersetzt kein Datenbank- oder Objektspeicher-Backup
- Geschützte Downloads ohne Browser-Cache und mit abgesicherten CSV-Inhalten

Der Ablauf für vollständige PostgreSQL-Sicherungen, sichere Wiederherstellungen
in eine leere Datenbank und die weiterhin nötige externe Railway-Konfiguration
steht in [`docs/backup-restore.md`](docs/backup-restore.md).

### Benutzer, Einstellungen und Nachvollziehbarkeit

- Anmeldung per E-Mail und Passwort, ohne öffentliche Registrierung
- Rollen `admin` und `user`
- Einladungslinks für neue Konten sowie Sperren, Entsperren und Rollenwechsel
  durch Admins
- Einladungen sind sieben Tage gültig und können vor Annahme widerrufen werden
- Schutz vor dem Sperren des eigenen Kontos und vor dem Entfernen des letzten
  aktiven Admins
- Append-only Audit-Log für Anmeldungen, Einladungen, Buchungsvorgänge,
  Downloads, Importe und administrative Änderungen
- Suche, Kategoriefilter, Seitenwechsel und aufklappbare Metadaten im Audit-Log
- Verwaltung von Vereinsstammdaten, Kassen, Belegnummern und
  Umsatzsteuer-Standardwerten in der Anwendung
- Optionale E-Mail-Benachrichtigung bei neuen Protokollen. SMTP-Zugangsdaten
  werden in der Anwendung gepflegt und verschlüsselt gespeichert
- Individuelle Benachrichtigungswahl je Konto sowie zusätzliche externe
  Empfänger. Die Benachrichtigung enthält bewusst keine Geldbeträge
- Versand einer Test-E-Mail aus den Einstellungen
- Responsive Oberfläche, Tastaturbedienung, Dark Mode und Befehlspalette
- Anklickbare Versionsmarke mit den aus `CHANGELOG.md` erzeugten
  Versionshinweisen

## Technischer Aufbau

- TanStack Start und TanStack Router mit React 19
- TanStack Query und TanStack Form
- oRPC mit Valibot für die typisierte Server-Schnittstelle
- better-auth mit Passwortanmeldung und Admin-Funktionen
- Drizzle ORM und PostgreSQL
- `@react-pdf/renderer` für Belege
- AWS SDK für S3-kompatiblen Objektspeicher
- ExcelJS für XLSX-Import und -Export
- Tailwind CSS 4, Radix UI und lucide-react
- Bun für Laufzeit und Paketverwaltung
- Biome, TypeScript und Vitest für die Qualitätssicherung

Servercode liegt ausschließlich unter `src/server/` und wird über geschützte
oRPC-Prozeduren oder Server-Routen aufgerufen. Finanzielle Schreibvorgänge
verwenden Transaktionen, Datenbankbedingungen und eindeutige Constraints, damit
auch parallele Zugriffe mehrerer Benutzer oder App-Instanzen konsistent bleiben.

## Lokale Entwicklung

Voraussetzungen:

- Bun
- PostgreSQL
- Für den vollständigen PDF-Ablauf ein S3-kompatibler Bucket

Einrichtung:

```bash
bun install --frozen-lockfile
cp .env.example .env
```

Mindestens `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`ADMIN_EMAIL` und `ADMIN_PASSWORD` in `.env` setzen. Für PDF-Speicherung und
das Herunterladen zusätzlich die S3-Variablen konfigurieren. Danach:

```bash
bun run db:migrate:prod
bun run dev
```

Die Anwendung läuft unter <http://localhost:3000>. Der Migrator wendet alle
offenen Drizzle-Migrationen an, legt die globalen Einstellungen an und erzeugt
den initialen Admin idempotent aus den `ADMIN_*`-Variablen.

### Wegwerf-Sandbox für Browser-Tests

Für eine vollständig isolierte lokale Instanz genügt:

```bash
bun run sandbox
```

Der Befehl startet PostgreSQL mit einem `tmpfs` in Docker, einen ausschließlich
im Arbeitsspeicher gehaltenen S3-kompatiblen Objektspeicher und Vite auf Port
3100. Migrationen und Admin-Seed laufen automatisch. URL, zufällig erzeugte
Anmeldedaten und Passwort erscheinen im Terminal. `Ctrl-C` beendet die App und
löscht Datenbank, PDFs, Zugangsdaten und Container. Eine andere App-Portnummer
kann mit `SANDBOX_PORT=4310 bun run sandbox` gewählt werden.

Nach einem abgebrochenen Prozess entfernt `bun run sandbox:down` eventuell
verbliebene, eindeutig als Rendant-Sandbox markierte Container. Docker oder Colima
muss verfügbar sein. Die Sandbox verwendet keine `.env`-Datei und greift weder
auf Railway noch auf lokale oder produktive Datenbanken und Buckets zu.

## Konfiguration

Die vollständige Vorlage mit Kommentaren steht in [`.env.example`](.env.example).

| Variable | Zweck | Erforderlich |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL-Verbindung | Ja |
| `DATABASE_CONNECTION_TIMEOUT_MS` | Zeitlimit für neue Datenbankverbindungen | Nein, Standard 5000 ms |
| `DATABASE_QUERY_TIMEOUT_MS` | Zeitlimit für Datenbankabfragen | Nein, Standard 10000 ms |
| `BETTER_AUTH_SECRET` | Schlüssel für Sitzungen und verschlüsselte SMTP-Zugangsdaten | Ja |
| `BETTER_AUTH_URL` | Öffentliche Basis-URL für Cookies, Weiterleitungen, Einladungen und E-Mail-Links | Ja |
| `ADMIN_EMAIL` | E-Mail des initialen Admins | Für die Ersteinrichtung |
| `ADMIN_PASSWORD` | Passwort des initialen Admins | Für die Ersteinrichtung |
| `ADMIN_NAME` | Anzeigename des initialen Admins | Nein, Standard ist `Admin` |
| `AWS_ACCESS_KEY_ID` | Zugriff auf den S3-kompatiblen Bucket | Für PDFs |
| `AWS_SECRET_ACCESS_KEY` | Geheimnis für den Bucket-Zugriff | Für PDFs |
| `AWS_DEFAULT_REGION` | Bucket-Region | Nein, Standard ist `auto` |
| `AWS_ENDPOINT_URL_S3` | Endpunkt des S3-kompatiblen Speichers | Abhängig vom Anbieter |
| `S3_BUCKET_NAME` | Name des PDF-Buckets | Für PDFs |
| `VEREINSNAME` | Fallback bis Vereinsstammdaten in der App gespeichert wurden | Nein |
| `LFIO_INGEST_TOKEN` | Aktiviert die optionale LFIO-Telemetrie | Nein |

Die weiteren `LFIO_*`-Variablen steuern Intervall, Zeitlimits, die höchstens
tägliche und seitenbegrenzte Bucket-Inventur sowie Schwellenwerte der optionalen
Telemetrie. SMTP-Server, Absender und Empfänger
werden nicht als Umgebungsvariablen gesetzt, sondern durch einen Admin unter
`Einstellungen > E-Mail-Benachrichtigungen` verwaltet.

## Nützliche Befehle

```bash
bun run check          # Biome prüfen
bunx tsc --noEmit      # TypeScript prüfen
bun run test           # Vitest ausführen
bun run sandbox        # vollständig isolierte Browser-Testinstanz
bun run sandbox:down   # verwaiste Sandbox-Container entfernen
bun run test:integration # isolierte PostgreSQL-Tests, siehe CI-Konfiguration
bun run build          # Produktions-Build nach .output/ erzeugen
bun .output/server/index.mjs

bun run db:generate    # Drizzle-Migration aus Schemaänderungen erzeugen
bun run db:migrate     # offene Migrationen für die Entwicklung anwenden
bun run db:migrate:prod # Migrationen, Einstellungen und Admin-Seed anwenden
bun run auth:generate  # better-auth Schema neu erzeugen
```

`bun run db:push` ist ausschließlich für kurzlebige lokale Entwicklung
vorgesehen. Produktionsdatenbanken werden immer über committete Migrationen
aktualisiert.

## Deployment auf Railway

Das Repository enthält einen mehrstufigen [`Dockerfile`](Dockerfile) und die
Railway-Konfiguration in [`railway.toml`](railway.toml). Railway führt vor jedem
Start `bun src/server/db/migrate.ts` aus, startet anschließend den Nitro-Server
mit `bun .output/server/index.mjs` und prüft `/api/health`.

Für eine neue Umgebung:

1. Einen PostgreSQL-Dienst und einen S3-kompatiblen Bucket im Railway-Projekt
   bereitstellen.
2. `DATABASE_URL` als Referenz auf den PostgreSQL-Dienst setzen.
3. Die Bucket-Zugangsdaten und `S3_BUCKET_NAME` setzen.
4. `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` und die initialen `ADMIN_*`-Werte
   konfigurieren.
5. Eine Domain zuweisen. `BETTER_AUTH_URL` muss exakt auf deren öffentliche
   Origin zeigen.
6. Deployment starten und den Healthcheck unter `/api/health` prüfen.

Der Healthcheck testet die Datenbank und antwortet bei einem Ausfall mit HTTP
503. Mit `LFIO_INGEST_TOKEN` sendet die Anwendung zusätzlich Betriebsmetriken
für API, PostgreSQL, Laufzeit und Bucket an LFIO.

## Datenmodell und Betriebsgrenzen

- Geldbeträge werden als ganzzahlige Cent-Werte gespeichert.
- Datumsbezogene Auswertungen verwenden den Berliner Kalendertag.
- Belegnummern werden erst innerhalb der Schreibtransaktion verbindlich
  vergeben. Eine vorher angezeigte Nummer ist nur eine Vorschau.
- Audit-Einträge können durch die Anwendung weder verändert noch gelöscht
  werden.
- PDF- und E-Mail-Erzeugung sind externe Folgeaktionen. Ein Fehler dabei legt
  kein zweites Protokoll an und ein fehlendes PDF kann erneut erzeugt werden.
- Rendant ersetzt keine steuerliche oder rechtliche Prüfung und besitzt keine
  direkte Schnittstelle zu DATEV Unternehmen Online.

## Lizenz

Proprietäre Software. Alle Rechte vorbehalten. Nutzung, Vervielfältigung,
Veröffentlichung und Weitergabe sind nur mit vorheriger schriftlicher Erlaubnis
des Rechteinhabers zulässig. Einzelheiten und Kontakt stehen in der
[Lizenzdatei](LICENSE).
