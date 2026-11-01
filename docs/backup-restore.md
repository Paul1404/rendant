# Backup und Wiederherstellung

Das JSON-Geschäftsarchiv in der Anwendung ist ein lesbares Facharchiv. Es ist
kein vollständiges Datenbank-Backup. Es enthält die Protokolle und historischen
Umsätze des gewählten Zeitraums sowie Kassen, Umsatzgruppen,
Belegnummernsequenzen und sichere Einstellungen. Anmeldedaten, Sitzungen,
Einladungs-Tokens, Audit-Ereignisse, das verschlüsselte SMTP-Passwort und die
PDF-Dateien selbst sind ausgeschlossen.

## PostgreSQL sichern

Für eine vollständige, lokale PostgreSQL-Sicherung werden `pg_dump` und
Python 3 benötigt. Der Restore benötigt außerdem `pg_restore` und `psql`. Das
Skript überschreibt keine Datei, legt das Zielverzeichnis nicht selbst an und
erstellt die Sicherung mit Dateimodus 0600:

```bash
mkdir -p .db-backup
DATABASE_URL='postgres://...' \
  scripts/backup-postgres.sh ".db-backup/rendant-$(date +%Y%m%d-%H%M%S).dump"
```

Die Datei enthält personenbezogene Daten, Audit-Daten und verschlüsselte
Zugangsdaten. Sie gehört in einen verschlüsselten, zugriffsbeschränkten
Speicher. Niemals in Git einchecken. `.db-backup/` ist bereits ignoriert.

## Wiederherstellung testen

Die Wiederherstellung ist absichtlich nur in eine leere Datenbank möglich. Das
Skript löscht nichts und verweigert vorhandene Benutzertabellen, Sichten und
Sequenzen auch außerhalb des Schemas `public`. Für einen Test eine
neue Datenbank anlegen und deren Namen zweimal ausdrücklich bestätigen:

```bash
RESTORE_DATABASE_URL='postgres://.../rendant_restore_test' \
CONFIRM_RESTORE_DATABASE='rendant_restore_test' \
CONFIRM_EMPTY_DATABASE_RESTORE=YES \
  scripts/restore-postgres.sh .db-backup/rendant-20260726-120000.dump
```

Die Zielverbindung muss dem privilegierten Anwendungs- und Migrationskonto
gehören. Die Anwendung benötigt `SUPERUSER` oder `BYPASSRLS`; für eine neue
Zielinstallation muss das Konto außerdem die eingeschränkte Rolle
`rendant_tenant` anlegen und sich zuweisen dürfen. Bei einem Anbieterwechsel
keine fremden Quellrollen oder deren Eigentümer übernehmen.

Das Datenbankarchiv enthält keine Clusterrollen und absichtlich keine
Quellberechtigungen. Der Restore legt `rendant_tenant` vor den Tabellen-Policies
an und stellt die benötigten Schema-, Geschäfts- und Audit-Sequenzrechte
ausdrücklich wieder her. Die Rolle bleibt ohne Anmeldung, Superuserrechte,
RLS-Umgehung, Rollenvererbung und Rechte zur Anlage von Datenbanken oder Rollen.
Eine vorhandene Rolle mit solchen Rechten oder weiteren Rollenmitgliedschaften
führt zum Abbruch. Authentifizierungs- und Vereinstabellen werden dieser Rolle
nicht freigegeben. Das funktioniert auch, wenn Migration 0038 im Archiv bereits
als angewendet vermerkt ist; sie muss nicht erneut laufen. Archive vor dieser
Migration erhalten ihre Geschäftsrechte mit dem regulären Migrationslauf.

Rolle, Daten und wiederhergestellte Rechte werden in einer Transaktion
geschrieben. Ein Fehler rollt diesen Wiederherstellungsversuch zurück. Ein
privates temporäres Verzeichnis enthält währenddessen die aus dem Archiv
erzeugte SQL-Datei und wird beim Ende des Skripts entfernt. Dafür genügend
lokalen, geschützten Speicher bereitstellen; bei einem gewaltsamen Prozessabbruch
das temporäre Verzeichnis manuell entfernen. Nur selbst geprüfte, vertrauenswürdige
Archive wiederherstellen. Verbindungsadressen werden über die Prozessumgebung
übergeben und erscheinen nicht als Kommandoargumente. PostgreSQL-URIs mit
Host und Datenbank werden unterstützt. Verbindungsparameter wie `sslmode`
und `sslrootcert` bleiben erhalten; unbekannte Parameter werden abgewiesen,
statt möglicherweise Schutzvorgaben zu verlieren.

Ein synthetischer Test prüft den vollständigen Weg in zwei frischen lokalen
PostgreSQL-Clustern, einschließlich leerem Rollenbestand, Mandantentrennung,
Belegnummern, Anmeldebereitschaft und Rücknahme bei Fehlern:

```bash
# PostgreSQL-Werkzeuge einschließlich initdb und pg_ctl müssen im PATH stehen.
scripts/test-postgres-restore.sh
```

Der Test verwendet ausschließlich eigene Wegwerfdatenbanken auf den Ports 55492
und 55493. Er verweigert bereits belegte Ports und beendet seine Instanzen
anschließend. Andere freie Ports können mit `TEST_PG_SOURCE_PORT` und
`TEST_PG_TARGET_PORT` gewählt werden.

Danach mindestens prüfen:

1. Anmeldung mit einem Testkonto
2. Anzahl und Summen der Protokolle und historischen Umsätze
3. Audit-Log, Einstellungen und Belegnummernsequenzen
4. Download mehrerer vorhandener PDF-Objekte
5. `bun run db:migrate:prod` gegen die wiederhergestellte Testdatenbank

## Externe Railway-Konfiguration

Dieses Repository kann keine sichere externe Sicherung einschalten, weil Ziel,
Aufbewahrung und Zugangsdaten Betreiberentscheidungen sind. In Railway müssen
weiterhin Datenbank-Backups oder ein externer Zeitplan eingerichtet, deren
Aufbewahrung festgelegt und Restore-Berechtigungen begrenzt werden. Der
S3-kompatible Bucket braucht separat Versionierung oder Replikation, weil ein
PostgreSQL-Dump keine PDF-Dateien enthält.

Mindestens vierteljährlich eine Wiederherstellung in eine isolierte Datenbank
testen. Ein erfolgreicher `pg_dump` allein beweist keine Wiederherstellbarkeit.
