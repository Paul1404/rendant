# Changelog

Alle nennenswerten Änderungen an diesem Projekt. Neueste zuerst. Die Version
hier entspricht `package.json` und der Versionsmarke in der App.

## 1.32.0 - 2026-08-11

- Im Vorjahresvergleich lassen sich jetzt einzelne Jahre aufklappen. Die
  zugehörigen Termine erscheinen direkt unter dem gewählten Jahr, ohne alle
  Einträge einer Umsatzgruppe gleichzeitig auszuklappen.
- Altunterlagen stehen in einer durchsuchbaren, filterbaren Liste mit 25, 50
  oder 100 Einträgen pro Seite. Details, Herkunft und Status bleiben auch bei
  großen historischen Beständen übersichtlich.
- Erkannte Originaldateien werden unverändert archiviert und können am
  historischen Umsatz wieder heruntergeladen werden. Bereits importierte
  Dateien lassen sich nachträglich anhand ihrer Prüfsumme zuordnen.
- Korrekturen ersetzen keinen bestehenden Datensatz. Rendant storniert den
  bisherigen Wert, legt einen verknüpften Nachfolger an und hält den gesamten
  Vorgang im Audit-Log fest.
- Historisch erkannte Bar- und Kartenzahlungen fließen jetzt getrennt und ohne
  Doppelzählung in die Zahlungsübersicht ein.

## 1.31.3 - 2026-08-09

- Das Hauptdashboard zeigt beim Öffnen jetzt das laufende Kalenderjahr. Auch
  Kennzahlen, Diagramme, Umsatzsteuer und Protokollliste bleiben damit auf den
  aktuellen Zeitraum begrenzt.
- Frühere Jahre lassen sich weiterhin ausdrücklich gemeinsam anzeigen oder
  einzeln für die Jahresauswertung auswählen.

## 1.31.2 - 2026-08-09

- Eine Prüfphase zeigt erst dann 100 Prozent Fortschritt, wenn wirklich alle
  Zeilen erledigt sind. Verbleibende Beanstandungen werden nicht mehr durch
  Aufrundung verdeckt.

## 1.31.1 - 2026-08-09

- Gespeicherte Import-Arbeitsstände zeigen jetzt Erstellungsdatum, Uhrzeit,
  Kurz-ID und Revision. Mehrere Analysen desselben Ordners lassen sich dadurch
  eindeutig unterscheiden.
- Nicht mehr benötigte Arbeitsstände können archiviert werden. Sie verschwinden
  aus der offenen Liste, bleiben aber vollständig erhalten, nachvollziehbar und
  wiederherstellbar.

## 1.31.0 - 2026-08-09

- Historische Zählprotokolle lassen sich jetzt in gespeicherten Prüfphasen
  bearbeiten. Der Fortschritt bleibt sichtbar und kann später fortgesetzt
  werden, ohne bereits Altumsätze anzulegen.
- Der Prüfplan trennt Quellen, Zeitangaben, Beträge, Zuordnungen und die
  Abschlusskontrolle. Offene und beanstandete Zeilen sind je Phase erkennbar.
- Wird ein bereits geprüfter Arbeitswert geändert, öffnet Rendant nur die
  betroffenen Prüfungen erneut. Der verbindliche Import bleibt ein eigener,
  ausdrücklich ausgelöster letzter Schritt.

## 1.30.2 - 2026-08-09

- Die Protokollliste zeigt auf Computer und Smartphone wieder Monatsabschnitte
  mit Anzahl und Gesamtsumme des jeweiligen Monats.
- Pro Seite lassen sich jetzt 10, 25, 50 oder 100 Einträge anzeigen.

## 1.30.1 - 2026-08-09

- Release-Hinweise beschreiben Neuerungen jetzt verständlich aus Sicht der
  Anwender. Technische Einzelheiten stehen nicht mehr im Vordergrund.

## 1.30.0 - 2026-08-09

- Rendant kann bei großen historischen Importen gezielt nur die gerade
  benötigten Prüffälle bereitstellen. Dadurch werden Korrekturläufe schneller
  und übersichtlicher, während die Originaldaten unverändert bleiben.
- Die Protokollliste auf der Startseite ist jetzt in übersichtliche Seiten mit
  jeweils 25 Einträgen aufgeteilt. Das funktioniert am Computer und auf dem
  Smartphone.

## 1.29.4 - 2026-08-04

- Liegen Original und nummerierte Korrektur am selben Änderungsdatum, gewinnt
  zuverlässig die Dateirevision mit dem höheren Suffix wie `-1`.

## 1.29.3 - 2026-08-04

- Korrigierte Dateirevisionen desselben Zählprotokolls werden anhand von
  Protokollnummer, Datum, Kasse und Gesamtumsatz erkannt. Nur die neueste
  Fassung bleibt für den Import auswählbar.

## 1.29.2 - 2026-08-04

- XLSX-Zählprotokolle übernehmen jetzt die Stückelung aus der tatsächlichen
  Mengenspalte. Leere Mengen werden als null Stück gelesen und widersprüchliche
  Kassenbestände bleiben Prüffälle.
- Inhaltlich gleiche Protokolle werden auch dann als Dublette erkannt, wenn
  sich nur Dateimetadaten unterscheiden. Dreistellige Jahresangaben wie
  `18.05.025` werden anhand des Jahresordners sicher aufgelöst.
- Nur eindeutig benannte Umsatzbereiche werden automatisch vorgeschlagen.
  Unsichere Kassen bleiben ohne feste Zuordnung in Prüfung. Weitere Kassen am
  selben eindeutigen Veranstaltungstag liefern einen gekennzeichneten
  Kontextvorschlag.
- Eine erneute Analyse desselben Ordners erzeugt mit den verbesserten
  Parserregeln einen neuen Entwurf, statt einen veralteten Entwurf zu öffnen.

## 1.29.1 - 2026-08-03

- Die Einstellungen führen MCP und Automatisierungen jetzt als eigenen Bereich
  mit Betriebsstatus, Zugriffsmodus, Audit-Identität und Endpunkt auf.
- MCP-Änderungen bleiben im gemeinsamen Auditlog eindeutig als Codex-Zugriff
  erkennbar. Geheimnisse wie der Bearer-Token werden in der Oberfläche nie
  ausgegeben.

## 1.29.0 - 2026-08-03

- Der Zählprotokoll-Ordner wird jetzt als gespeicherter, strukturierter
  Arbeitsstand angelegt. Analyse, zeilenweise Korrektur, Prüfung und
  verbindlicher Import sind klar getrennte Schritte und können später
  fortgesetzt werden.
- Oberfläche und MCP bearbeiten denselben revisionsgeschützten Entwurf.
  Erkannte Quelldaten bleiben unverändert, Korrekturen brauchen einen Hinweis,
  und konkurrierende Änderungen werden nicht still überschrieben.
- Erst ein vollständig geprüfter und gesperrter Entwurf kann historische
  Umsätze anlegen. Alle Bearbeitungen, Freigaben und der finale Import werden
  im Auditprotokoll festgehalten.

## 1.28.0 - 2026-08-03

- Rendant stellt jetzt einen token-geschützten Streamable-HTTP-MCP-Endpunkt
  bereit. Vertrauenswürdige Assistenten können Protokolle, historische Umsätze,
  Kennzahlen, USt, Kassen, Umsatzkatalog, Einstellungen und Audit auswerten.
- Ein optionaler Admin-Modus bindet Änderungen an dieselben Rollenprüfungen,
  Transaktionen, Idempotenzregeln und Audit-Einträge wie die Oberfläche.
  Rohes SQL und Geheimnisse werden nicht über MCP angeboten.

## 1.27.2 - 2026-08-03

- Die Ordnerauswahl für Zählprotokolle lässt sich jetzt auch in Safari als
  Ordner bestätigen. Der Browser erhält den Ordnermodus bereits beim Rendern,
  und ein Dateitypfilter blockiert die Ordnerauswahl nicht mehr.

## 1.27.1 - 2026-08-03

- Die Auswahl des Zählprotokoll-Archivs öffnet jetzt zuverlässig einen
  Ordnerdialog statt einer gewöhnlichen Dateiauswahl.

## 1.27.0 - 2026-08-03

- Der vollständige Zählprotokoll-Ordner kann als Vorschau ausgewertet und
  anschließend als historische Umsätze übernommen werden. Rendant liest ODS
  und XLSX, trennt Dubletten und nicht relevante Hauptkassenbelege und zeigt
  vorab Beträge, Zeitraum und Datenabdeckung.
- Erkannte Kassenbezeichnungen werden passenden Umsatzbereichen zugeordnet und
  können vor dem Import gruppenweise korrigiert werden. Prüffälle lassen sich
  getrennt nach Ursache freigeben.
- Quellenpfad, Datei-Prüfsumme, Bargeld, Kartenzahlungen, Ausgaben,
  Stückelungen und USt-Aufteilungen bleiben am historischen Umsatz erhalten.
  Ein fehlendes Belegdatum wird nur als gekennzeichneter Prüffall aus dem
  passenden Dateiänderungsdatum abgeleitet.

## 1.26.4 - 2026-08-01

- Das Guilloché-Muster ist in heller und dunkler Darstellung klarer sichtbar.
  Messingfarbene Konturen geben der Rosette mehr Tiefe, ohne Inhalte oder
  Bedienelemente zu überlagern.

## 1.26.3 - 2026-08-01

- Die Hauptnavigation bleibt bei schmalen und mittleren Bildschirmbreiten in
  einer eigenen Zeile. Auf breiten Bildschirmen nutzt die Kopfleiste mehr
  Platz, damit alle Bereiche vollständig sichtbar und erreichbar bleiben.
- Die Befehlspalette enthält wieder dieselben Bereiche wie die sichtbare
  Hauptnavigation.

## 1.26.2 - 2026-08-01

- Aufrufe der bisherigen Adresse `svufo.sv-untereuerheim.de` werden unter
  Beibehaltung von Pfad und Suchparametern dauerhaft an
  `rendant.sv-untereuerheim.de` weitergeleitet.
- API-, Download- und Hintergrundanfragen bleiben auf der bisherigen Adresse
  erreichbar. Bereits geöffnete Sitzungen und bestehende Verknüpfungen
  funktionieren dadurch während des Übergangs weiter.

## 1.26.1 - 2026-08-01

- Bestehende Kassenzählprotokolle werden den neuen Umsatzbereichen
  zugeordnet. Wirtschaftsdienst, Veranstaltungen, Seniorennachmittag,
  Eintrittsgelder und Verkäufe am Spielfeld erscheinen dadurch in den neuen
  Auswertungen gemeinsam mit künftigen Einträgen.
- Die Zuordnung wird mit den Anzahlen je Umsatzbereich im Auditprotokoll
  festgehalten. Anlass, Kasse, Betrag und Beleg bleiben unverändert.

## 1.26.0 - 2026-08-01

- Neue Kassenzählprotokolle und Altumsätze verwenden sechs feste
  Umsatzbereiche und ein freies Feld für Details. Die frühere Umsatzgruppe ist
  bei neuen Erfassungen nicht mehr sichtbar.
- Der Vorjahresvergleich bündelt neue Datensätze nach Umsatzbereich und kann
  denselben Monatszeitraum auf alle Jahre anwenden. Bestehende Zuordnungen und
  Belegtexte bleiben unverändert erhalten.
- Formulare haben deutlich erkennbare Begrenzungen, Sprunglinks führen zum
  tatsächlichen Hauptinhalt und Überschriften sind semantisch klarer.
- Die mobile Protokollerfassung zeigt Summe und Speichern dauerhaft am unteren
  Bildschirmrand. Kleine Bedienelemente haben größere Trefferflächen und
  reduzierte Bewegung wird systemweit berücksichtigt.

## 1.25.1 - 2026-07-31

- Rendant verzichtet auf den werblichen Claim im Login, bei Einladungen und
  in App-Metadaten. Die Oberfläche bleibt bewusst sachlich und erklärt die
  Software durch ihre Funktionen statt durch Slogans.

## 1.25.0 - 2026-07-31

- Rendant verwendet jetzt die neue Registermarke mit der dokumentarischen
  Wortmarke und einer einheitlichen Farbwelt aus Waldgrün, Messing und
  warmem Papier in Oberfläche, App-Symbolen, E-Mails und PDF-Dokumenten.
- Spectral und IBM Plex werden datenschutzfreundlich direkt aus der Anwendung
  geladen. Die helle und dunkle Darstellung, Zahlen, Statusfarben und
  Guilloché-Muster folgen dem neuen barrierearmen Designsystem.
- Das Brand Kit enthält korrigierte Logoformate, Design-Tokens,
  Verwendungsregeln sowie Vorlagen für Oberfläche und Dokumente.

## 1.24.1 - 2026-07-28

- Die neue Hauptadresse `rendant.sv-untereuerheim.de` und die bisherige Adresse
  können während des Übergangs gleichzeitig sicher für die Anmeldung genutzt
  werden.

## 1.24.0 - 2026-07-28

- Die Anwendung heißt jetzt Rendant. Der neue Name steht für die umfassende
  Finanzverwaltung im Verein und ersetzt die bisherige Produktbezeichnung in
  Oberfläche, E-Mails, Exporten, Dokumentation und technischen Werkzeugen.
- Bestehende Sitzungen, Entwürfe, verschlüsselte Zugangsdaten, Importvorlagen
  und Geschäftsarchive bleiben durch gezielte Kompatibilitätsregeln nutzbar.
- Das bewährte Guilloché-Muster und die bisherige Bildmarke bleiben bis zur
  Einführung des neuen Brand Kits erhalten.

## 1.23.5 - 2026-07-28

- Das obere Guilloché-Linienband läuft auf 4K-Bildschirmen jetzt ohne harte
  Schnittkante bis über den rechten Bildschirmrand.

## 1.23.4 - 2026-07-28

- Auf sehr breiten Bildschirmen reicht das Guilloché-Muster jetzt sichtbar bis
  über den rechten Bildschirmrand. Der zuvor verbleibende helle Spalt entfällt.

## 1.23.3 - 2026-07-28

- SVUFO ist nicht mehr unter der MIT-Lizenz veröffentlicht. Der Quellcode und
  die zugehörigen Materialien sind proprietär und alle Rechte Paul Dresch
  vorbehalten.

## 1.23.2 - 2026-07-28

- Das Guilloché-Muster bleibt beim Scrollen im sichtbaren Bereich und nutzt auf
  breiten Bildschirmen gezielt den freien Raum rechts neben dem Inhalt. Beim
  Verschieben oder Verkleinern des Fensters passt sich seine Position fließend an.
- Laufzeit- und Entwicklungsabhängigkeiten wurden geschlossen auf ihre aktuellen,
  untereinander kompatiblen Versionen aktualisiert.

## 1.23.1 - 2026-07-28

- Ein feines Guilloché-Muster aus Rosette und Linienband gibt dem Hauptbereich
  die Anmutung klassischer Finanzdrucke. Dezente Grün- und Messingtöne passen
  sich an die helle und dunkle Darstellung sowie breite Bildschirme an, ohne
  Inhalte zu überlagern oder am Inhaltsrand abzubrechen.
- Eine vollständig isolierte lokale Sandbox startet mit einem Befehl eine
  temporäre Datenbank, einen flüchtigen PDF-Speicher, Migrationen, zufällige
  Admin-Zugangsdaten und die App. Beim Beenden werden alle Daten entfernt.

## 1.23.0 - 2026-07-28

- Punkte im Umsatzverlauf lassen sich per Maus, Tastatur oder Berührung
  auswählen. Unter der Grafik erscheinen die zugehörigen Kassenzählprotokolle
  und historischen Umsätze mit Summe und Belegverweisen. Die Auswahl bleibt in
  der URL erhalten und lässt sich gezielt aufheben.
- Das Dashboard ersetzt den wenig aussagekräftigen Durchschnitt je Eintrag und
  den hervorgehobenen Überschuss durch Kartenzahlungen und die Anzahl erfasster
  Einträge. Das Ergebnis bleibt in der Detailauswertung sichtbar. Der
  Kartenanteil bezieht sich nur auf Umsätze mit bekannter Zahlungsart.

## 1.22.0 - 2026-07-26

- Neue Kassenzählprotokolle verwenden einen gespeicherten Idempotenzschlüssel.
  Wiederholte Anfragen erzeugen dadurch weder einen zweiten Beleg noch erneut
  PDF- und E-Mail-Nebenwirkungen.
- Kritische Buchungs-, Storno-, Benutzer- und Einstellungsänderungen speichern
  ihren Audit-Eintrag in derselben Datenbanktransaktion. Die Datenbank verhindert
  nachträgliche Änderungen oder Löschungen von Audit-Ereignissen.
- Das bisherige JSON-Backup heißt jetzt Geschäftsarchiv. Es enthält zusätzlich
  historische Umsätze, Umsatzgruppen, Kassen, Sequenzen und sichere Einstellungen
  und weist ausdrücklich auf ausgeschlossene Daten hin. Eine Anleitung mit
  abgesicherten PostgreSQL-Sicherungs- und Wiederherstellungsskripten ergänzt den
  vollständigen Notfallablauf.
- PostgreSQL- und Produktionsimage-Tests prüfen in CI Migrationen, parallele
  Schreibvorgänge, Datenbank-Zeitlimits, Containerstart und den Healthcheck.
- LFIO prüft die Bucket-Erreichbarkeit weiterhin regelmäßig, führt die
  seitenbegrenzte Objektinventur aber höchstens täglich aus. Datenbankverbindungen
  und Abfragen haben konfigurierbare echte Zeitlimits.
- Ungespeicherte Protokollentwürfe werden vor interner Navigation sofort
  geschrieben. Beim Verlassen erscheint eine Warnung, ohne die Navigation nach
  einem erfolgreichen Speichern zu blockieren.

## 1.21.1 - 2026-07-22

- Das Produktionsimage verwendet eine gepinnte Bun-Alpine-Basis und läuft als
  unprivilegierter Benutzer. Abhängigkeiten und Migrationen bleiben vollständig
  im Image enthalten.
- Deployment-Logs fassen Migration und optionalen Admin-Seed in einem
  strukturierten Ergebnis zusammen. Alle Server-Logs enthalten jetzt Dienst,
  Version und Umgebung, ohne Zugangsdaten auszugeben.
- Unerwartete API-Fehler lassen sich über eine Request-ID bis zur Antwort und
  zum Audit-Eintrag verfolgen. Fehlgeschlagene Hintergrundbereinigungen für
  Login-Versuche und alte PDFs werden begrenzt und strukturiert protokolliert.

## 1.21.0 - 2026-07-22

- Die Seite heißt jetzt „Import & Export“. Admins können eine leere
  Excel-Vorlage mit den aktuellen Umsatzgruppen herunterladen, historische
  Umsätze darin ergänzen und die ausgefüllte Datei wieder hochladen.
- Vor dem Import zeigt SVUFO alle Fehler mit Excel-Zeilennummern sowie Anzahl
  und Summen der erkannten Einträge. Mögliche Dubletten werden hervorgehoben.
  Erst nach einer ausdrücklichen Bestätigung werden alle Zeilen gemeinsam
  gespeichert oder vollständig verworfen.
- Ein erneuter Upload derselben Vorlage erzeugt keine doppelten Buchungen.
  Vorlagen-Downloads, Prüfungen und ausgeführte Importe werden protokolliert.

## 1.20.0 - 2026-07-22

- Umsatzgruppen lassen sich direkt in der Vergleichsansicht umbenennen, als
  wiederkehrend oder einmalig einstufen und für neue Erfassungen aktivieren
  oder deaktivieren.
- Admins können die Rolle bestehender Konten ändern sowie Konten sperren und
  wieder entsperren. Selbstsperren und das Entfernen des letzten aktiven Admins
  werden verhindert, gesperrte Konten verlieren sofort den Zugriff.
- Dublettenhinweise und Umsatzexporte verwenden zuverlässig die stabile
  Umsatzgruppe. Umbenennungen und Neuzuordnungen erscheinen dadurch sofort
  korrekt in Listen, CSV- und Excel-Dateien.
- Nicht-Admins sehen keine Admin-Formulare mehr, deren Speichern serverseitig
  ohnehin abgelehnt würde.
- Gleichzeitige Änderungen derselben Umsatzgruppe überschreiben sich nicht
  mehr unbemerkt. Die zweite Person erhält einen Konflikthinweis und kann die
  aktuellen Daten neu laden.

## 1.19.0 - 2026-07-22

- Neue Protokolle zeigen standardmäßig nur „Gezählt von“. Eine separate
  prüfende Person lässt sich bei Bedarf hinzufügen und wieder entfernen.
- Der bisherige Anlass-Katalog heißt in der Oberfläche jetzt Umsatzgruppen.
  Neue Einträge kombinieren eine feste Umsatzgruppe mit einer verpflichtenden
  Veranstaltungsbezeichnung für den konkreten Termin.
- Auch vergangene Umsätze verwenden das neue Konzept. Die Umsatzgruppe wird aus
  dem Katalog gewählt, die Veranstaltungsbezeichnung beschreibt den einzelnen
  Termin und die technische Vergleichsgruppe wird automatisch abgeleitet.
- Platzhalter für Kassennummern verwenden reine Nummern ohne vorangestelltes K.

## 1.18.1 - 2026-07-22

- Einladungen und Anlass-Löschungen sind jetzt auch bei gleichzeitigen
  Zugriffen mehrerer App-Instanzen sicher. Unzulässig große Zählwerte werden
  vor dem Speichern abgewiesen und Protokollaktionen benötigen immer eine
  nachvollziehbare Benutzerzuordnung.
- Datumsfilter, Kennzahlen, Diagramme und Exporte verwenden einheitlich den
  Berliner Kalendertag. Ungültige Zeiträume und zukünftige Buchungen verfälschen
  aktuelle Auswertungen nicht mehr.
- Navigation, Dialoge, Einladungsmaske, Audit-Log und Protokolldetails sind auf
  kleinen Bildschirmen, per Tastatur und mit Hilfstechnologien verlässlicher
  bedienbar. Beträge und fehlende Angaben werden eindeutiger dargestellt.
- Die kompakte Betragsanzeige bleibt bei sechsstelligen Eurobeträgen im besser
  lesbaren Tausenderbereich. Audit-Zeitstempel werden ausdrücklich in Berliner
  Zeit angezeigt.

## 1.18.0 - 2026-07-22

- Neue Kassen und Anlässe lassen sich von Admins direkt beim Erfassen eines
  Kassenzählprotokolls anlegen und werden sofort ausgewählt. Ein kurzer Hinweis
  erklärt, warum Anlässe für verlässliche Jahresvergleiche aus dem festen
  Katalog statt aus einem Freitextfeld kommen.
- Anlass-Karten im Umsatzvergleich lassen sich aufklappen. Admins können mehrere
  Protokolle und Altunterlagen auswählen, gemeinsam einem Katalog-Anlass
  zuordnen und dessen Namen ändern. Die ursprünglichen Belegtexte bleiben für
  die Nachvollziehbarkeit unverändert.
- Der Umsatzexport steht zusätzlich als echte Excel-Arbeitsmappe mit Filtern,
  formatierten Beträgen und fixierter Kopfzeile bereit. Die CSV-Variante bleibt
  separat erhalten.
- Suchsymbol und Suchtext im Audit-Log überlappen nicht mehr. Das Symbol wird
  bei einer Eingabe ausgeblendet. In der historischen Umsatzmaske haben Betrag
  und Währungsangabe jetzt auf allen Bildschirmgrößen ausreichend Abstand.

## 1.17.0 - 2026-07-21

- Vorjahresvergleich rechnet jetzt über den Anlass-Katalog statt über den
  Freitext (plans/007 Phase 3). Verschiedene Schreibweisen desselben Anlasses
  fallen zu einer Karte zusammen, mehrere Kassen eines Tages zählen als ein
  Termin, und wiederkehrende Anlässe zeigen pro Jahr die Anzahl Termine plus
  den Durchschnitt je Termin. Einmalige Anlässe werden direkt Jahr für Jahr
  verglichen. Noch nicht zugeordnete Altbelege bleiben als eigene Karte sichtbar.

## 1.16.0 - 2026-07-21

- Anlass wird beim Erfassen jetzt aus dem Katalog gewählt statt frei getippt
  (plans/007 Phase 2). Dazu ein optionales Zusatzfeld für den konkreten Abend
  (z. B. "gegen Grettstadt"), das die Beschriftung ergänzt, aber die Zuordnung
  nicht beeinflusst. Dadurch passt der Jahresvergleich künftig automatisch
  zusammen, egal wer zählt. Ist noch kein Katalog angelegt, bleibt das freie
  Textfeld als Rückfall.

## 1.15.0 - 2026-07-21

- Anlass-Katalog eingeführt (Einstellungen > Anlässe, nur Admins). Der Verein
  legt seine wiederkehrenden (z. B. Biergarten) und einmaligen (z. B. Sommerfest)
  Anlässe einmal fest. Das ist die Grundlage, damit der Jahresvergleich über die
  Jahre verlässlich zusammenpasst, statt von frei getippten Schreibweisen
  abzuhängen. Auswahl beim Erfassen und die Umstellung des Vergleichs folgen in
  den nächsten Schritten (siehe plans/007).

## 1.14.2 - 2026-07-21

- UI-Feinschliff quer durch die App. Im Vorjahresvergleich stehen "Umsatz" und
  "Ergebnis" wieder sauber über ihren Beträgen statt direkt daran zu kleben.
  Die Export-Karten nutzen jetzt zwei breitere Spalten, sodass kein Button-Text
  mehr abgeschnitten wird. Im Umsatzdiagramm bleibt der Tooltip auch am linken
  und rechten Rand vollständig sichtbar. Dazu kleinere Ausrichtungs- und
  Abstandskorrekturen im Erfassungsformular (Ausgaben- und USt-Bereich), in den
  Vereins- und Belegnummer-Einstellungen und in der Statusanzeige der Belegliste.

## 1.14.1 - 2026-07-21

- Die Protokollsuche kommt ohne das überflüssige Lupensymbol aus. Der Suchtext
  beginnt dadurch wieder mit sauberem Abstand am linken Rand.

## 1.14.0 - 2026-07-21

- Historische Bruttoumsätze aus Altunterlagen lassen sich getrennt von
  Kassenzählprotokollen erfassen. Vergleichsgruppen verbinden denselben Anlass
  über mehrere Jahre, ohne fehlende Kassenbestände oder Steuerwerte zu erfinden.
- Die neue Umsatzansicht zeigt Vorjahresvergleiche, Herkunft und Status. Eine
  sichtbare Warnung schützt vor versehentlicher Doppelerfassung. Korrekturen
  erfolgen nachvollziehbar über eine atomare Stornierung mit Begründung.
- Das Dashboard bezieht aktive Altwerte in Umsatz, Ausgaben, Überschuss und
  Verlauf ein. Für die Jahreshauptversammlung steht eine direkte Auswahl der
  vorhandenen Kalenderjahre bereit. Historische Werte bleiben ausdrücklich aus
  der USt-Auswertung ausgeschlossen.
- Ein neuer Excel-kompatibler Umsatzexport führt Kassenzählprotokolle und
  Altunterlagen mit Vergleichsgruppe, Quelle, Status und Quellreferenz in einer
  CSV-Datei zusammen.

## 1.13.0 - 2026-07-20

- Admins erhalten ein eigenes Audit-Log zwischen Export und Einstellungen. Es
  zeigt Anmeldungen, fehlgeschlagene und blockierte Anmeldeversuche,
  Abmeldungen, Einladungen, Registrierungen, Protokollaktionen, PDF-Zugriffe,
  Exporte sowie Änderungen an Benutzern, Kassen und Einstellungen.
- Die Ereignisspur ist serverseitig geschützt, filter- und durchsuchbar und wird
  automatisch aktualisiert. Herkunft, handelnde Person und betroffenes Objekt
  bleiben nachvollziehbar, ohne Passwörter, Tokens, Cookies oder
  SMTP-Zugangsdaten zu speichern.
- Audit-Ereignisse liegen in einer eigenen append-only Tabelle. Die Anwendung
  bietet dafür bewusst keine Änderungs- oder Löschoperation an.

## 1.12.0 - 2026-07-20

- Sicherer Mehrbenutzerbetrieb: Eine Stornierung wird jetzt atomar reserviert.
  Gleichzeitige Versuche können Begründung, Zeitpunkt und Storno-PDF nicht mehr
  gegenseitig überschreiben. PDF-Dateien erhalten kollisionsfreie Namen und
  fehlgeschlagene PDF-Erzeugung bleibt über die vorhandene Regeneration
  reparierbar.
- Einladungen werden beim Annehmen jetzt durch eine Datenbanksperre genau einem
  Vorgang zugeordnet. Zusätzliche Eindeutigkeitsregeln verhindern doppelte
  Zugangskonten bei parallelen Anfragen.
- Protokollübersicht, Detailansicht und Umsatzsteuerdaten aktualisieren sich bei
  Fokus sowie spätestens nach 15 Sekunden. Eigene Änderungen leeren betroffene
  Caches sofort.
- Protokolle speichern jetzt das angemeldete Konto, das sie angelegt oder
  storniert hat. Neue Belege zeigen diese Zuordnung in der Detailansicht.
  Bestehende Belege bleiben unverändert lesbar.
- Finanzielle Downloads werden nicht mehr zwischengespeichert und erhalten
  sichere Browser-Header. Textwerte in CSV-Dateien können beim Öffnen in einer
  Tabellenkalkulation keine Formeln mehr ausführen.
- Links mit Schaltflächen wurden semantisch korrigiert. Fehler beim Laden der
  Umsatzsteuerdaten erscheinen jetzt als Fehler mit Wiederholen-Aktion statt
  wie ein leerer Zeitraum.
- Die Arbeitsregeln für Codex und ChatGPT übernehmen nun ausdrücklich die
  Projektregeln aus `CLAUDE.md`, einschließlich Versionspflege,
  Mehrbenutzer-Architektur und vollständiger Verifikation.

## 1.11.0 — 2026-07-04

- E-Mails im neuen SVUFO-Design: Benachrichtigungen, Einladungen und Test-Mail
  haben jetzt ein sauberes, markengerechtes HTML-Layout (grüner Kopf, Messing-
  Linie, klare Struktur). Tabellenbasiert und mit Inline-Styles aufgebaut, damit
  es in Gmail, Outlook und Co. nicht zerfällt; ein Text-Teil bleibt als Fallback.
- Die Benachrichtigung erklärt jetzt, warum sie nur die Eckdaten und keine
  Beträge enthält (Datenschutz) und dass das vollständige Protokoll erst nach
  Anmeldung über den Link sichtbar ist.

## 1.10.0 — 2026-06-28

- E-Mail-Empfänger an Benutzerkonten gekoppelt: Angemeldete Benutzer erhalten die
  Info-E-Mail zu neuen Kassenzählprotokollen direkt an ihre Konto-Adresse. Jeder
  kann das unter Einstellungen > Meine Benachrichtigungen für sich selbst an- oder
  abschalten. Neue Konten sind standardmäßig aktiv.
- Admins können die Benachrichtigung pro Benutzer in der Kontenliste umschalten.
- Die frühere Empfängerliste bleibt als zusätzliche externe Empfänger erhalten,
  etwa für Adressen ohne eigenes Konto. Empfänger der Mail sind die aktivierten
  Konten plus diese Liste; doppelte Adressen werden zusammengeführt.

## 1.9.0 — 2026-06-28

- E-Mail-Benachrichtigungen ergänzt: Sobald ein neues Kassenzählprotokoll erfasst
  wurde, geht eine kurze Info-E-Mail an die konfigurierten Empfänger. Die Mail
  enthält nur das Nötigste (Belegnummer, Kasse, Anlass, Datum, gezählt von) und
  einen Link zum Protokoll. Bewusst ohne Geldbeträge.
- SMTP-Einstellungen unter Einstellungen > E-Mail-Benachrichtigungen (nur Admin):
  Server, Port, Verschlüsselung (STARTTLS 587 oder SSL/TLS 465), Zugangsdaten,
  Absender und Empfängerliste. Das Passwort wird verschlüsselt gespeichert und
  nie wieder angezeigt. Ein Knopf verschickt eine Test-E-Mail zum Prüfen der
  Konfiguration.

## 1.8.1 — 2026-06-21

- Fußzeile der PDF-Protokolle korrigiert: Anschrift und Vorstand fehlten und nur
  die SHA256-Zeile war sichtbar. Ursache war eine Zeilenhöhe auf Seitenebene, die
  in die fest positionierte Fußzeile durchschlug und deren Zeilen verschluckte.
  Die Stammdaten stehen jetzt wieder vollständig in der Fußzeile.
- Doppelte Angaben im PDF entfernt: Vereinsname, Belegnummer und Erfassungsdatum
  standen sowohl im Kopf als auch in der Fußzeile. Sie stehen jetzt nur noch im
  Kopf. Die Fußzeile zeigt Anschrift, Vorstand, Registereintrag sowie SHA256 und
  Seitenzahl.

## 1.8.0 — 2026-06-21

- PDF-Protokolle lassen sich jetzt direkt ansehen, nicht nur herunterladen. In
  der Detailansicht öffnet "Ansehen" das PDF in einem neuen Tab, "PDF" lädt es
  wie bisher herunter. Gilt auch für Storno-PDFs.
- Layout der PDF-Protokolle auf DIN-Seitenränder umgestellt (A4, ohne Briefkopf):
  links 25 mm, rechts 20 mm, oben 20 mm. Die Ränder bleiben unabhängig von der
  Inhaltsdichte normgerecht; sehr volle Protokolle werden weiterhin auf eine
  Seite skaliert.
- Vereinsstammdaten ergänzt: Anschrift, Vorstand und Registereintrag stehen jetzt
  in der Fußzeile jedes PDF-Protokolls. Alle Felder sind unter Einstellungen >
  Verein pflegbar; leere Felder werden im PDF ausgelassen.

## 1.7.2 — 2026-06-21

- Kennzahlen-Kacheln auf dem Handy korrigiert: Der Gesamtumsatz (und die übrigen
  Beträge) wurden am rechten Kartenrand abgeschnitten, weil der Wert breiter war
  als die halbe Bildschirmbreite. Die Beträge skalieren jetzt mit der Kartenbreite
  und bleiben ab Tablet-Größe unverändert.

## 1.7.1 — 2026-06-20

- Logo im Kopfbereich korrigiert: Die Marke wird jetzt versioniert geladen, damit
  die neue grüne Münze auch dort sofort erscheint. Zuvor blieb stellenweise das
  alte rote Logo aus dem Cache stehen.
- Umsatzdiagramm geglättet: weiche, abgerundete Kurve (monotoner Spline) statt
  spitzer Zacken, ohne dabei unter die Nulllinie auszuschlagen.

## 1.7.0 — 2026-06-20

- SVUFO ist jetzt die alleinige Marke der App. Das Vereinswappen wurde aus
  Kopfzeile, Anmeldung und Einladung entfernt; der Verein erscheint nur noch
  dezent als "läuft für ..."-Hinweis in Fußzeile und auf der Anmeldeseite.
- Der Verein ist jetzt in den Einstellungen konfigurierbar (Abschnitt "Verein",
  nur Admins) und wird in der Datenbank gespeichert. Die Umgebungsvariable
  VEREINSNAME dient nur noch als Anfangswert; LOGO_URL wird nicht mehr benötigt.

## 1.6.1 — 2026-06-20

- Favicon- und App-Icon-URLs tragen jetzt die Versionsmarke, damit ein
  Logowechsel den langen Browser- und Edge-Cache sofort umgeht.

## 1.6.0 — 2026-06-20

- Neue Markenidentität für SVUFO. Das Logo ist jetzt eine Zählstrich-Münze:
  vier Striche, der fünfte in Messing als abschließender Schrägstrich, in einer
  tiefgrünen Münze, die zugleich für das geschlossene, geprüfte Kassenbuch steht.
- Neue Farbwelt aus Ledger-Grün, Messing und Papier, durchgängig auf allen
  Oberflächen, hell und dunkel.
- Neue Schriften: Space Grotesk für Wortmarke und Überschriften, Hanken Grotesk
  für den Fließtext.
- Vollständiger neuer Favicon- und App-Icon-Satz aus der neuen Marke.

## 1.5.2 — 2026-06-20

- Durchgängiges Co-Branding "SVUFO × Verein": Die App-Marke und das
  Vereinswappen erscheinen jetzt gemeinsam als Lockup im Kopfbereich und auf
  der Anmeldeseite.

## 1.5.1 — 2026-06-20

- Neues, professionelles App-Logo für SVUFO (Zählstrich-Motiv passend zum
  Kassenzählprotokoll) samt vollständigem Favicon- und App-Icon-Satz.

## 1.5.0 — 2026-06-20

- Gestalterische Generalüberholung mit einem durchgängigen Design-System:
  einheitliche Karten, klare visuelle Hierarchie und konsistente Abstände,
  Typografie und Betonung auf allen Seiten.
- Dashboard mit hervorgehobener Leitkennzahl; Detailseite, Listen und
  Einstellungen in einheitlicher Optik.
- Neues Protokoll: zweispaltiges Layout mit mitlaufender Zusammenfassung
  (Endbestand, Ausgaben, Tageseinnahmen) und klar gegliederten Abschnitten.
- Einheitliche Geldbeträge, Beschriftungen und Abschnittsüberschriften in der
  ganzen App.

## 1.4.1 — 2026-06-20

- Klarere visuelle Hierarchie: Der Seitentitel ist jetzt eine ruhige Kopfzeile
  statt einer Karte, die Leitkennzahl (Umsatz) ist auf dem Dashboard
  hervorgehoben, und das Kartenlayout tritt ruhiger in den Hintergrund.

## 1.4.0 — 2026-06-20

- Umschalter für das Erscheinungsbild (System, Hell, Dunkel) im Kopfbereich.
- Befehlspalette mit Strg+K bzw. Cmd+K: schnell zu Seiten springen und
  Protokolle nach Belegnummer oder Anlass suchen.
- Feinschliff in der Bedienung: dezente Einblend-Animationen (mit Rücksicht auf
  reduzierte Bewegung), Tooltips, eine "Zum Inhalt springen"-Verknüpfung und
  Lade-Platzhalter beim Seitenwechsel.

## 1.3.0 — 2026-06-20

- Umsatzdiagramm umschaltbar zwischen Tag, Woche und Monat (Standard: Tag), für
  einen lebendigeren Verlauf mit den Spitzen einzelner Veranstaltungstage.

## 1.2.1 — 2026-06-20

- Release-Notes ("Was ist neu") jetzt auf Deutsch.

## 1.2.0 — 2026-06-20

- Export auf eine eigene Seite "Export & Auswertungen" verschoben, mit drei
  Downloads über einen gemeinsamen Zeitraum: Protokolle (CSV), USt-Auswertung
  (CSV) und Backup (JSON).
- Alle Datumsangaben und Zeitstempel laufen jetzt fest in der Zeitzone
  Europe/Berlin (der Server läuft in UTC), damit Erfasst- und Storniert-Zeiten
  sowie das Belegnummern-Jahr immer stimmen.
- Strukturiertes Server-Logging mit Stufen und Schwärzung sensibler Werte;
  Fehler werden zentral über eine oRPC-Middleware geloggt.
- Umsatzdiagramm füllt jetzt die volle Breite der Kachel.
- Nicht mehr benötigte Umgebungsvariablen entfernt (JWT_SECRET, APP_URL).

## 1.1.1 — 2026-06-20

- Absturz beim Kopieren des Einladungslinks über HTTP behoben (Zwischenablage
  nicht verfügbar); der Link lässt sich jetzt immer markieren.
- Neues-Protokoll-Formular: stabile Zeilen-IDs für Ausgaben und USt-Zeilen,
  damit das Löschen einer mittleren Zeile keine Eingaben mehr vertauscht.
- Dashboard: Kennzahlen brechen auf kleinen Bildschirmen nicht mehr mitten in
  der Zahl um; die Veränderung zum Vormonat erscheint nur in der Monatsansicht.
- Detail- und Listentabellen scrollen auf dem Smartphone seitlich, statt
  abgeschnitten zu werden.
- Barrierefreiheit: per Tastatur erreichbarer Passwort-Umschalter, aktive
  Navigation mit aria-current, stabile Formularfeld-IDs; Fehlerdetails außerhalb
  der Entwicklung ausgeblendet. Toten Code entfernt.

## 1.1.0 — 2026-06-20

- Finanz-Dashboard: Kennzahlen je Zeitraum (Umsatz, Ausgaben, Netto-Ergebnis,
  Ø je Beleg), ein Umsatzverlauf über 12 Monate, eine Umsatzsteuer-Aufstellung
  (USt. auf Umsatz, Vorsteuer, Zahllast), die Aufteilung Bar gegen Karte und ein
  Ranking der häufigsten Anlässe. Der Zeitraumfilter steuert die ganze Übersicht.
- Die Versionsmarke öffnet ein Fenster "Was ist neu" mit den internen
  Release-Notes.
- Eigene Seitentitel im Browser, eine 404-Seite und eine globale Fehlerseite.

## 1.0.1 — 2026-06-20

- Fehler "/api/rpc kann nicht als URL verarbeitet werden" bei der
  clientseitigen Navigation behoben (Einstellungen, neues Protokoll und weitere
  Aufrufe): Der Browser-Client nutzt jetzt eine absolute URL, da RPCLink diese
  voraussetzt.

## 1.0.0 — 2026-06-20

- App von Next.js auf TanStack Start + oRPC + better-auth + Drizzle + Valibot
  umgestellt, auf der Bun-Laufzeit mit Biome.
- Anmeldung jetzt mit E-Mail und Passwort (better-auth) samt
  Einladungsfunktion durch Admins; die offene Registrierung ist deaktiviert.
- Datenbank auf Drizzle migriert und die bestehenden Protokolle übernommen.
- Designauffrischung: überarbeiteter Login, verfeinerte Karten und Feinschliff.
- Fülltexte und überflüssige Gedankenstriche aus der Oberfläche entfernt.
- Versionsmarke in Fußzeile und Login auf Basis von `package.json` ergänzt.
