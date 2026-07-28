# Backup und Wiederherstellung

Das JSON-Geschäftsarchiv in der Anwendung ist ein lesbares Facharchiv. Es ist
kein vollständiges Datenbank-Backup. Es enthält die Protokolle und historischen
Umsätze des gewählten Zeitraums sowie Kassen, Umsatzgruppen,
Belegnummernsequenzen und sichere Einstellungen. Anmeldedaten, Sitzungen,
Einladungs-Tokens, Audit-Ereignisse, das verschlüsselte SMTP-Passwort und die
PDF-Dateien selbst sind ausgeschlossen.

## PostgreSQL sichern

Für eine vollständige, lokale PostgreSQL-Sicherung wird `pg_dump` benötigt. Das
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
Skript löscht nichts und verweigert vorhandene Tabellen. Für einen Test eine
neue Datenbank anlegen und deren Namen zweimal ausdrücklich bestätigen:

```bash
RESTORE_DATABASE_URL='postgres://.../rendant_restore_test' \
CONFIRM_RESTORE_DATABASE='rendant_restore_test' \
CONFIRM_EMPTY_DATABASE_RESTORE=YES \
  scripts/restore-postgres.sh .db-backup/rendant-20260726-120000.dump
```

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
