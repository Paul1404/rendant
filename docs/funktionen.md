# Funktionen

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

- Zählprotokoll-Ordner mit ODS- und XLSX-Dateien werden als persistente
  Arbeitsstände analysiert. Admins und der Rendant-MCP können erkannte Zeilen
  prüfen, korrigieren oder auslassen. Erst eine vollständige Prüfung sperrt
  eine konkrete Revision für den verbindlichen, auditierten Import
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
in eine leere Datenbank steht in [`docs/backup-restore.md`](backup-restore.md).

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
- Direkter Versand gespeicherter Original- und Stornobelege an DATEV Upload
  Mail, Belegtyp „Kasse“, mit Versandstatus und Schutz vor Doppelübertragungen

- Optionale SumUp-Anbindung: Kartenumsätze eines Veranstaltungstags lassen sich
  beim Erfassen eines Protokolls per Knopf aus SumUp übernehmen. Der API-Key
  wird in der Anwendung hinterlegt, beim Speichern geprüft und verschlüsselt
  gespeichert. Rendant liest nur die Transaktionshistorie
- Responsive Oberfläche, Tastaturbedienung, Dark Mode und Befehlspalette
- Anklickbare Versionsmarke mit den aus `CHANGELOG.md` erzeugten
  Versionshinweisen

### DATEV-Kassenbelege senden

Unter `Einstellungen > DATEV` hinterlegt ein Admin die Zieladresse für „Kasse“
aus DATEV Belege online und einen dort bestätigten Absender. Dieser Absender
muss auch über den eingerichteten SMTP-Zugang senden dürfen. E-Mail-Versand und
TLS müssen aktiviert sein. Die Zieladresse wird in der Datenbank konfiguriert,
nicht im Quellcode oder in Umgebungsvariablen.

Auf der Protokollseite zeigt der Bereich „DATEV · Kasse“ Original und gegebenenfalls
Storno getrennt an. „An DATEV senden“ öffnet die Prüfung von Beleg, Absender und
Ziel. Erst die Bestätigung sendet genau das gespeicherte PDF als einzelnen
Anhang. Es entsteht weder ein neues Protokoll noch eine Buchung in DATEV.

„Per E-Mail gesendet“ bestätigt nur die Annahme durch den SMTP-Server. DATEV
meldet die Verarbeitung per E-Mail; den tatsächlichen Eingang in Belege online
prüft die zuständige Person. Siehe [DATEV Upload Mail](https://apps.datev.de/help-center/documents/1007550).

Der Versand wird pro Protokoll und Dokumentart in `datev_deliveries` reserviert.
Gleichzeitige Klicks und Wiederholungen lösen keinen zweiten Versand aus.
Fehlt das PDF oder scheitert die Vorbereitung, kann ohne Versandreservierung
erneut versucht werden. Sobald die SMTP-Übertragung begonnen hat, ist ein
Fehler dagegen unklar und wird niemals automatisch wiederholt. Nach einem
Prozessabbruch bleibt ein laufender Vorgang gesperrt; nach fünf Minuten lässt
er sich manuell klären. Unter „Versand prüfen“ bestätigt ein Admin nach Prüfung
von DATEV und der Rückmeldung mit Begründung den Eingang oder gibt einen neuen
Versuch frei. Das gilt auch bei einer späteren Ablehnung durch DATEV. Eine
Freigabe selbst sendet noch nichts. Versandversuche und Klärungen stehen im
Audit-Log; es werden Ziel, Absender, PDF-Schlüssel und SHA-256 der gesendeten
Datei festgehalten. Der bestehende `pdf_sha256` bleibt der Buchungsdaten-Hash.
