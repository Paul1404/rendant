# Unabhängige Sicherung der gespeicherten Dateien

Die Vorlage `infra/rendant-object-backup.yaml` legt einen privaten AWS-S3-Bucket
in derselben Region wie die Sicherungsfunktion an. Für Rendant wird
`eu-central-1` verwendet. Versionierung und SSE-S3 sind aktiv. Der Bucket bleibt
bei einem Stack-Löschen oder Austausch erhalten. Es gibt keine automatische
Ablauffrist und keine Löschberechtigung für die Sicherungsfunktion.

Der Python-Quelltext liegt in `scripts/object-backup/index.py`. Nach einer
Änderung hält `python3 scripts/object-backup/sync-template.py` den eingebetteten
Code der CloudFormation-Vorlage aktuell. CI prüft diesen Gleichstand und führt
synthetische Tests ohne AWS-Zugang und ohne zusätzliche Python-Pakete aus.
Die Lambda-Laufzeit enthält Boto3 und Botocore bereits.

## Einrichtung

Den Stack zunächst mit `ScheduleEnabled=DISABLED` bereitstellen. Die Vorlage
benötigt `CAPABILITY_IAM`, erstellt aber keine Zugangsschlüssel, KMS-Schlüssel,
SNS-Empfänger oder öffentlichen Endpunkte. CloudFormation vor der Ausführung
validieren und den Änderungssatz prüfen. Das Bereitstellen allein bestätigt
noch keine funktionierende Sicherung.

Die Quellkonfiguration wird separat und ausschließlich über den freigegebenen,
geheimnissicheren Bereitstellungsweg als SSM `SecureString` unter
`/rendant/backup/source` gespeichert. Das JSON muss genau diese Felder enthalten:
`endpoint`, `region`, `bucket`, `access_key_id`, `secret_access_key`.
Den Wert weder in Shell-Argumente, Protokolle, CloudFormation noch in Git
übernehmen. Die Funktion liest nur diesen Parameter und akzeptiert ausschließlich
HTTPS-Endpunkte. Der S3-kompatible Quellzugriff verwendet Path-Style-Adressen.

`scripts/provision-object-backup-source.py` übernimmt diese Einrichtung nach
ausdrücklicher Freigabe aus der Laufzeitumgebung des App-Dienstes. Benötigt werden
Python mit Boto3 und ein lokal angemeldetes AWS-Profil für das Zielkonto. Über
`railway run --no-local` mit ausdrücklicher Projekt-, Umgebungs- und Dienstkennung
aufrufen und dem Skript nur `--profile <Profil>` und `--account <Kontonummer>`
übergeben. Das Skript ignoriert den von Railway gesetzten S3-Endpunkt für seine
AWS-Verwaltungszugriffe, prüft das Zielkonto und schreibt ausschließlich den
SecureString-Parameter. Es gibt nur dessen Namen und Version aus. Diesen Schritt
bei einer genehmigten Rotation der Quellzugangsdaten wiederholen; den Zeitplan
erst nach erfolgreicher Sicherung und Wiederherstellungsprüfung weiterverwenden.

Die Parameterberechtigung umfasst `ssm:GetParameter` für genau diesen Namen.
Eine gegebenenfalls benötigte KMS-Entschlüsselung ist auf SSM und den
Verschlüsselungskontext genau dieses Parameters begrenzt. Es werden weder
Quellobjekte geschrieben noch gelöscht.

## Erste Prüfung und Zeitplan

Den tatsächlichen Funktionsnamen aus dem Stack-Output `RecoveryFunctionName`
verwenden. Alle Aufrufe erfolgen synchron. Die Lambda-Antwort enthält nur
Zähler und Statuswerte. Auch bei einem Fehler dürfen keine Zugangsdaten,
Dateinamen oder Beleginformationen in der Antwort oder im Protokoll stehen.

Zuerst `{"action":"self_test"}` aufrufen. Diese Prüfung schreibt ausschließlich
synthetische Bytes in den Sicherungsbucket und liest sie zur Hashprüfung
zurück. Sie benötigt noch keine Quellkonfiguration.

Nach der freigegebenen Einrichtung des SecureString-Parameters nacheinander
`{"action":"backup"}` und `{"action":"verify"}` aufrufen. Bei beiden müssen
`complete: true` und die erwarteten Datei- und Bytezahlen zurückkommen; die
Wiederherstellungsprüfung muss zusätzlich `restored: true` melden. Ein
Lambda-Aufruf mit `FunctionError` ist fehlgeschlagen, auch wenn der HTTP-Aufruf
an AWS erfolgreich war.

Erst nach diesen Prüfungen den geprüften Stack auf `ScheduleEnabled=ENABLED`
aktualisieren. Die Sicherung läuft täglich um 02:20 UTC. Eine weitere Regel
prüft stündlich das Alter der letzten vollständigen Sicherung. Beide Regeln
sind anfangs ausgeschaltet.

Beispiel für einen manuellen Aufruf mit bereits eingerichteter AWS-Anmeldung:

```sh
aws lambda invoke --region eu-central-1 \
  --function-name <RecoveryFunctionName> \
  --cli-binary-format raw-in-base64-out \
  --payload '{"action":"verify"}' \
  /tmp/rendant-object-verify-result.json
```

Die Ergebnisdatei enthält ausschließlich Zähler. Produktionsdateien oder
Manifeste werden durch diesen Aufruf nicht auf den lokalen Rechner kopiert.

## Sicherungsformat und Integrität

Dateiinhalte liegen unter ihrem SHA-256-Digest in `blobs/sha256/`. Nach jedem
Schreiben wird genau die zurückgemeldete AWS-Objektversion erneut gelesen und
gehasht. Auch unveränderte Dateien werden im Sicherungsziel erneut geprüft.
Der ETag des Quellanbieters wird nur zusammen mit Größe und Änderungszeit als
Versionshinweis verwendet. Er wird niemals als MD5- oder SHA-256-Prüfsumme
interpretiert, auch nicht bei mehrteiligen Uploads.

Jeder Lauf schreibt ein unveränderliches Manifest unter `runs/<uuid>.json`.
Es enthält die Zuordnung der ursprünglichen Dateinamen zu Digest, Größe und
AWS-Version-ID. Diese Zuordnung gehört zu den geschützten Sicherungsdaten,
nicht in öffentliche Ausgaben oder Support-Protokolle. `catalog/latest.json`
verweist mit einer konkreten Version-ID auf den letzten vollständigen Lauf.
Auch frühere Versionen dieses Verweises bleiben erhalten.

Vor der Veröffentlichung dieses Verweises wird die Quelle erneut aufgelistet.
Hat sie sich während des Laufs verändert oder schlägt eine Übertragung oder
Prüfung fehl, bleibt die vorherige vollständige Sicherung maßgeblich. Bereits
kopierte Inhalte werden nicht entfernt. Ein erneuter Lauf verwendet sie nach
erneuter Hashprüfung weiter.

Die Sicherung enthält den aktuellen Dateibestand jedes erfolgreichen Laufs.
Frühere gesicherte Inhalte und Manifeste bleiben erhalten, auch wenn eine Datei
später in der Quelle fehlt. Dateien, die zwischen zwei Läufen entstehen und
wieder verschwinden, sind damit nicht erfasst. Datenbanksicherungen werden
separat behandelt.

## Wiederherstellung prüfen

`{"action":"verify"}` benötigt weder Zugriff auf die Quelle noch deren
Zugangsdaten. Der Aufruf liest das letzte vollständige Manifest und die dort
festgehaltenen Objektversionen aus AWS, prüft jeden SHA-256-Wert, schreibt die
Bytes in einen neuen Bereich `restore/<uuid>/objects/` und prüft diese Kopien
durch erneutes Lesen. Die Quelldateien bleiben unverändert.

Nach einer vollständigen Prüfung liegt unter `restore/<uuid>/manifest.json`
die geschützte Zuordnung der ursprünglichen Dateinamen zu den wiederhergestellten
Objekten und deren Versionen. Ein unvollständiger Prüfbereich besitzt kein
erfolgreiches Wiederherstellungsmanifest und darf nicht als vollständig gelten.
Prüfbereiche werden nicht automatisch gelöscht.

Ein älterer Lauf kann gezielt geprüft werden:

```json
{
  "action": "verify",
  "manifest_key": "runs/<uuid>.json",
  "manifest_version_id": "<AWS-VersionId>"
}
```

Die Referenz über die geschützte S3-Konsole oder autorisierte AWS-Werkzeuge
bestimmen. Der Aufruf kopiert auch diesen Lauf nur in einen neuen Prüfbereich.
Die Produktivquelle wird niemals automatisch überschrieben. Eine tatsächliche
Rückübertragung erfordert eine separat geprüfte Zuordnung und Freigabe.

## Grenzen und Fehlererkennung

Die Funktion hat 512 MB Arbeitsspeicher, 512 MB temporären Speicher und maximal
15 Minuten Laufzeit. Sie verarbeitet eine Datei nach der anderen mit
1-MB-Leseblöcken und einer temporären Datei. Maximal unterstützt sind 256 MiB
je Datei, 10.000 aktuelle Dateien und 32 MiB je Manifest. Vor einer weiteren
Datei müssen mindestens drei Minuten Restlaufzeit verfügbar sein. Diese Grenzen
führen zu einem sichtbaren Fehler und keiner Veröffentlichung einer halben
Sicherung. Bei deutlich größerem Bestand muss das Verfahren aufgeteilt werden.

EventBridge und Lambda wiederholen fehlgeschlagene Aufrufe begrenzt. Endgültige
Fehler landen in einer verschlüsselten SQS-Warteschlange. CloudWatch-Alarme
zeigen Lambda-Fehler, eine gefüllte Fehlerwarteschlange sowie eine über 30
Stunden alte Sicherung oder fehlende stündliche Frischeprüfungen an. Es sind
keine automatischen Nachrichtenempfänger eingetragen. Vor der ersten Sicherung
und bei deaktiviertem Zeitplan darf der Frischealarm auf fehlende Daten reagieren.

Bei einem Laufzeitabbruch bleibt der bisherige vollständige Verweis erhalten;
der Lambda-Fehleralarm bleibt deshalb unabhängig vom Manifest wichtig.
`{"action":"status"}` prüft den letzten vollständigen Verweis und meldet das
Alter in Stunden. Dieser Aufruf kann auch vor dem Aktivieren des Zeitplans
manuell geprüft werden.
