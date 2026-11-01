# Mehrere Vereine in Rendant

Rendant verwendet eine gemeinsame PostgreSQL-Datenbank. Konten und Anmeldungen
sind global, Rechte und Benachrichtigungen gehören zur Vereinsmitgliedschaft.
Ein Konto kann in einem Verein Admin und in einem anderen normales Mitglied
sein. Die bisherigen Konten und Daten gehören zum ersten Verein `svu` mit UUID
`00000000-0000-4000-8000-000000000001`.

Die Architektur unterscheidet sich bewusst von Kontor2, das getrennte
Datenbanken und Anmeldungen pro Subdomain verwendet. Rendant bietet eine
gemeinsame Anmeldung und eine Vereinsauswahl auf der bisherigen Domain.
Zusätzlich können registrierte Vereine eine eigene Subdomain erhalten.
Abrechnung, öffentliche Registrierung, Löschung ganzer Vereine und ein eigener
Betreiberbereich sind nicht Teil dieses Ausbaus.

## Mitgliedschaften und neue Vereine

Aktive SVU-Admins können einen Verein über die Vereinsauswahl anlegen. Dabei
werden der Verein, ihre Admin-Mitgliedschaft, leere Einstellungen und die
allgemeine Kategorie Vereinsbeitrag gemeinsam angelegt. Weitere Abteilungen
werden im jeweiligen Verein gepflegt. Bestehende SVU-Kategorien bleiben erhalten.

Admins laden Personen in ihren eigenen Verein ein. Bestehende Konten müssen
sich mit ihrer bisherigen Anmeldung identifizieren und können dann die
Einladung annehmen. Dabei werden weder Passwort noch Name oder Rechte in
anderen Vereinen verändert. Neue Konten, Zugangsdaten, Mitgliedschaft,
Einladungsannahme und Audit-Ereignis werden gemeinsam gespeichert.

Sperren und Rollenänderungen betreffen nur die Mitgliedschaft. Bereits vor der
Umstellung global gesperrte Konten bleiben gesperrt. Nur ein SVU-Admin darf eine
solche Altsperre ausdrücklich aufheben; die Änderung wird protokolliert.

## Technische Grenzen

- Geschäftstabellen tragen einen erforderlichen `tenant_id`. PostgreSQL erzwingt
  Row Level Security auch für den Tabellenbesitzer. Der Geschäftszugriff schaltet
  innerhalb jeder Transaktion auf die Rolle `rendant_tenant` und setzt den
  Vereinskontext mit `SET LOCAL`. Fehlender Kontext liefert keine fremden Zeilen
  und erlaubt keine Buchung. Fehlerhafte Transaktionen werden vor Pool-Wiederverwendung
  beendet oder die Verbindung verworfen.
- Globale Identitäten, Mitgliedschaften, Anmeldeversuche und neue
  Anmelde-Sicherheitsereignisse gehören nicht zur Geschäftsdatenrolle.
  `globalDb` ist nur für diese Kontrollfunktionen, Migration und Readiness
  vorgesehen. Die Verbindung benötigt Superuser oder `BYPASSRLS`; die erste
  Migration benötigt zusätzlich das Recht, die eingeschränkte Rolle anzulegen.
- Belegnummern, Sequenzen, Einstellungen, Kataloge und Import-Deduplizierung
  gelten pro Verein. Zusammengesetzte Fremdschlüssel verhindern Beziehungen
  zwischen Geschäftsdaten verschiedener Vereine.
- Anfragen wählen den Verein ausdrücklich mit `x-rendant-tenant` oder bei
  Downloads mit `?tenant=<uuid>`. Die Auswahl muss einer aktiven Mitgliedschaft
  entsprechen. Die Cookie-Auswahl dient als Startwert. Ein anderer offener Tab
  behält seinen ausdrücklich gebundenen Kontext, auch nach einem Vereinswechsel.
- Beim Wechsel wird die Seite vollständig geladen. Neue lokale Entwürfe und
  Formularvorgaben enthalten Vereins- und Konto-ID im Schlüssel. Alte Entwürfe
  werden nicht gelöscht, aber wegen fehlender Kontozuordnung nicht automatisch
  übernommen.
- Neue Dokumente verwenden `tenants/<uuid>/...`. Bestehende SVU-Dateien unter
  `protokolle/` und `historical-sources/` bleiben unverändert erreichbar. Ein
  anderer Verein darf diese Altpfade nicht lesen oder löschen.
- SMTP, DATEV, SumUp und Empfängerlisten sind vereinsbezogen. Der vorhandene
  Deployment-MCP-Token bleibt ausschließlich an SVU gebunden. Andere Vereine
  erhalten durch seine Einrichtung keinen MCP-Zugang. Mitgliedschaftsänderungen
  benötigen eine echte berechtigte Identität; der synthetische MCP-Akteur erhält
  dadurch keine zusätzlichen Betreiberrechte.

## Erste Bestandsmigration

1. Einen überprüften Wiederherstellungspunkt der Produktionsdatenbank sichern.
   Ein Railway-Volume-Backup hält die Daten beim bisherigen Anbieter. Für einen
   lokalen vollständigen Export ist die Freigabe des Eigentümers einzuholen;
   sensible Dumps gehören niemals ins Repository oder in Cloud-Sync-Ordner.
2. Die unveränderte Ausgangsversion und den Wiederherstellungspunkt festhalten.
   Vorhandene Dokumente müssen nicht kopiert, neu erzeugt oder verschoben werden.
3. Migration `0038_shared_tenants.sql` mit dem Produktionsmigrator ausführen.
   Sie sperrt alle bisherigen Tabellen, speichert intern Zeilenzahlen und
   Fingerabdrücke, ergänzt den SVU-Besitz und kopiert Mitgliedschaften. Kein
   bisheriger Wert wird überschrieben. Vor Commit werden sämtliche Werte,
   Zeilenzahlen und Zuordnungen erneut geprüft. Bei einer Abweichung scheitert
   die gesamte Transaktion. Die Sperre wird nach zehn Sekunden ohne Erfolg
   abgebrochen, statt unbeschränkt auf laufende Vorgänge zu warten.
4. Die neue Anwendung direkt anschließend starten. Während des Übergangs kann
   die alte Anwendung nach dem Schemawechsel keine neuen kontextlosen Datensätze
   mehr anlegen. Den Wechsel deshalb in einem ruhigen Zeitfenster durchführen.
5. `/api/health` muss `ok`, `db`, `pdf`, `auth` und `tenants` bestätigen.
   `tenants` prüft Kontrolltabellen, alle 26 Geschäftstabellen mit erzwungenen
   Policies, Rollenattribute und einen tatsächlichen eingeschränkten Zugriff.
6. Die SVU-Zuordnung und Bestandszahlen unabhängig prüfen, eine vorhandene
   Anmeldung und ein unverändertes PDF aufrufen. Externe SMTP-/DATEV-Sendungen
   sind dafür nicht erforderlich.

Ein Rücksprung auf eine Anwendung vor der Mandantenmigration ist nach dem
Schemawechsel kein gültiger Rollback. Nach neuen Buchungen oder zusätzlichen
Vereinen würde das Zurückspielen eines alten Datenbankstands deren Daten
verlieren. Dann eine korrigierte Anwendung ausliefern oder vor einer
Wiederherstellung sämtliche neueren Änderungen sichern und abgleichen.

## Prüfung

`bun run check`, `bunx tsc --noEmit`, `bun run test`, `bun run build` und
`bun run test:integration` bleiben die Freigabeprüfungen. Integrationstests
benötigen eine isolierte Datenbank mit `_test` am Namensende und
`RENDANT_INTEGRATION_TEST=1`. Für den bestehenden Timeout-Test gilt wie in CI
`DATABASE_QUERY_TIMEOUT_MS=1000`.

Die Migrationstestreihe erzeugt eine eigene Wegwerfdatenbank, spielt die alten
Migrationen ein, befüllt sie mit synthetischen Bestandsdaten und vergleicht nach
0038 jede bisherige Tabellenzeile und jeden Wert, ausgenommen den neuen
Besitzvermerk. Weitere Tests prüfen zwei Vereine, gleiche lokale Schlüssel,
fremde IDs, Fremdschlüssel, Pool-Wiederverwendung, Rollen, Einladungen und
unveränderte Zugangsdaten. CI prüft zusätzlich das tatsächliche Produktionsimage.

## Vereinsadressen

`TENANT_BASE_DOMAIN` erlaubt die feste Zuordnung von
`<vereinskennung>.<basisdomain>` zu einem registrierten Verein. Nur eine einzelne
Kennung ist erlaubt; unbekannte oder verschachtelte Kennungen erhalten keinen
SVU-Arbeitsbereich. Ausschlaggebend ist der tatsächliche HTTP-Host. Weiterleitungs-
oder frei benannte Zusatzheader dürfen den Verein nicht bestimmen.

Auf einer Vereinsadresse kann auch ein Mitglied mehrerer Vereine keine fremde
Vereinsauswahl erzwingen. Ein veraltetes Auswahlcookie wird ignoriert,
widersprüchliche ausdrückliche Angaben und fremde Einladungstoken werden
abgewiesen. Die Kopfzeile zeigt dort den Verein ohne Wechsel- oder Anlegefunktion.
Die bisherige gemeinsame Adresse behält die vollständige Vereinsauswahl.

Jede öffentlich eingerichtete Vereinsadresse muss als genaue HTTPS-Origin in
`AUTH_TRUSTED_ORIGINS` stehen. Platzhalter sind nicht erlaubt. Die Konten bleiben
gemeinsam, Anmeldungscookies gehören aber ausschließlich zum jeweiligen Host.
Eine Anmeldung auf der bisherigen SVU-Domain meldet nicht automatisch auf einer
anderen Domain an. Für serverseitige Datenabfragen wird der tatsächliche Host
zusammen mit Anmeldung und Vereinsauswahl an den internen Aufruf weitergegeben.

Die bisherige vorläufige Adresse für SSV Gädheim ist
`https://ssv-gaedheim.rendant.pdcd.net`. Die DNS-Vorlage
`infra/ssv-gaedheim-dns.yaml` legt ausschließlich den CNAME und Railways
Verifikations-TXT in der bestehenden Route53-Zone an. Die Anwendung muss die
Hostbindung bereits unterstützen, bevor die DNS-Einträge veröffentlicht werden.

## Wechsel auf die Produktdomain

Die bevorzugten Vereinsadressen sind `sv-untereuerheim.rendant.app` und
`ssv-gaedheim.rendant.app`. Die bestehende SVU-Kennung bleibt `svu`; die UUID
und alle Buchungen bleiben unverändert. `TENANT_CANONICAL_HOSTS_JSON` ordnet
Vereinskennungen den bevorzugten Hostnamen zu. Die bekannten alten Adressen
bleiben auch bei einem Basisdomainwechsel fest an ihren bisherigen Verein
gebunden. Weitere einzelne Aliase können über `TENANT_HOST_ALIASES_JSON`
hinzugefügt werden. Widersprüchliche und doppelt belegte Zuordnungen scheitern.

Die Umstellung erfolgt in zwei Schritten: zuerst neue Anwendung und neue
Hostzuordnung mit leerem `TENANT_CANONICAL_BASE_DOMAIN` ausliefern. In dieser
Phase bleiben alte Seiten und Mail-Links nutzbar. Anschließend DNS und TLS für
jede neue Adresse unabhängig prüfen und erst dann
`TENANT_CANONICAL_BASE_DOMAIN=rendant.app` setzen. Dieser Wert muss der
`TENANT_BASE_DOMAIN` entsprechen. Damit werden normale Seitenaufrufe auf die
bevorzugte Vereinsadresse weitergeleitet; Pfad und Query bleiben erhalten.
API, Assets, Serverfunktionen und schreibende Anfragen bleiben am bisherigen
Host funktionsfähig und behalten dessen Vereinsgrenze.

`MCP_ALLOWED_ORIGINS` ist eine eigene genaue Adressliste für den bestehenden
SVU-Token. Ein Wechsel von `BETTER_AUTH_URL` darf bestehende MCP-Verbindungen
nicht unterbrechen und darf den Token nicht für SSV freigeben.

`infra/rendant-app-dns.yaml` besitzt ausschließlich die CNAME- und
Verifikations-TXT-Einträge der beiden neuen Vereinsadressen. Die beim Registrar
angelegte Zone sowie andere Domains werden nicht durch diese Vorlage ersetzt.
