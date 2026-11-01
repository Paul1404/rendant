# Railway-Konfiguration

`railway.ts` verwaltet ausschließlich `rendant-app` als benannten Teil
`rendant-app`. Datenbank, Volume, Bucket und Variablen werden nicht übernommen.
Die Domain-Ports, der GitHub-Quellzweig mit Pflichtprüfungen und die bestehenden
Laufzeitvorgaben bleiben erhalten. `railway` ist als Entwicklungsabhängigkeit
exakt gebunden; Installation erfolgt mit `bun install --frozen-lockfile`.

Railway liest `railway.toml` ab dem 1. Dezember 2026 nicht mehr. Die neue Datei
wird vom CLI ausgewertet, nicht automatisch beim GitHub-Code-Deployment.
Konfigurationsänderungen brauchen deshalb zusätzlich einen geprüften Plan und
eine ausdrückliche Anwendung. CLI 5.71.0 wurde für diese Umstellung geprüft.

## Ziel und Vorschau

Der lokale CLI-Kontext muss auf Projekt `rendant`, Umgebung `production` und
Dienst `rendant-app` zeigen. Bei Bedarf ausschließlich den lokalen Kontext
verknüpfen:

```bash
railway link \
  --project 86494e05-0e95-4584-bc8d-d590623c9db8 \
  --environment 40872242-b86f-4648-9b4e-d09edbbbd07e \
  --service 779599f2-77fa-4169-a916-11114df73109
railway config migrate status
railway config partials list --json
railway config plan --file .railway/railway.ts \
  --environment 40872242-b86f-4648-9b4e-d09edbbbd07e --verbose
```

Die Vorschau muss Projekt, Umgebung und `variables: unmanaged` bestätigen.
Nie `--include-variables`, `--decrypt-variables` oder `--show-values` verwenden.

## Reihenfolge beim ersten Wechsel

1. PR einschließlich Typprüfung und aller bisherigen Pflichtprüfungen bestehen
   lassen. Die Löschung von `railway.toml` bleibt bis Schritt 4 im PR.
2. Einen frischen Plan prüfen. Der erste geprüfte Plan ergänzt ausschließlich
   den Dockerfile-Builder sowie Startbefehl, Pre-deploy-Migration, Healthcheck
   und Neustartvorgaben des App-Dienstes. Er enthält keine neuen oder gelöschten
   Ressourcen. Variablen und andere Dienste müssen unangetastet bleiben.
3. Diesen Plan vor dem Merge anwenden. So sind die bisherigen Dateivorgaben
   bereits dauerhaft im App-Dienst hinterlegt, wenn die alte Datei aus `main`
   verschwindet. Die erste Anwendung weist dem benannten Teil ausschließlich
   den App-Dienst zu. Zeigt `migrate status` unerwartet eine explizite alte
   Dateibindung, zuerst nur diesen Dienst mit
   `railway config migrate cutover --service rendant-app` umstellen und erneut
   planen. Die dabei gesicherte Bindung kann mit `railway config migrate undo`
   zurückgesetzt werden. Für den geprüften Bestand war kein Cutover nötig.
4. PR mergen, Deployment bis `SUCCESS` verfolgen und die tatsächlich ausgelieferte
   Version unabhängig prüfen. `/api/health` muss `ok`, `db`, `pdf`, `auth` und
   `tenants` bestätigen. Alte und neue Adressen bleiben erreichbar.
5. Erneut planen. Erwartet werden keine Änderungen; die Eigentümerliste muss
   nur `service.rendant-app` für diesen benannten Teil enthalten.

Für eine überprüfbare Anwendung kann der Plan nach dem PR-Commit lokal in
einer geschützten temporären Datei festgehalten werden:

```bash
umask 077
railway config plan --file .railway/railway.ts \
  --environment 40872242-b86f-4648-9b4e-d09edbbbd07e \
  --out /tmp/rendant-reviewed-plan.json
# Erst nach Prüfung des konkreten Plans:
railway config apply --plan /tmp/rendant-reviewed-plan.json \
  --environment 40872242-b86f-4648-9b4e-d09edbbbd07e
```

Der Plan bindet den Zustand der Umgebung und den eingecheckten `.railway`-Baum.
Bei zwischenzeitlichen Änderungen neu planen. Keine destruktive Freigabe
hinzufügen, um einen unerwarteten Plan zu erzwingen. Die temporäre Plandatei
nach der Prüfung entfernen und niemals ins Repository übernehmen.

## Weitere Änderungen

Nur die beabsichtigten App-Einstellungen ändern und vor jeder Anwendung erneut
planen. Der benannte Teil darf keine Datenbank, Buckets, Volumes oder
Geschäftsdaten verwalten. Variablen bleiben ausdrücklich außerhalb seiner
Zuständigkeit. Quellzugangsdaten gehören ausschließlich in Railway.

Die Typprüfung umfasst `.railway/**/*.ts`. Ein lokaler Vertragstest prüft die
Begrenzung auf den App-Dienst, unveränderte Pflichtprüfungen und die Abfolge
Migration, Start und Readiness.

Referenzen: [Railway IaC](https://docs.railway.com/infrastructure-as-code),
[Umstellung](https://docs.railway.com/infrastructure-as-code#migrating-from-config-as-code).
