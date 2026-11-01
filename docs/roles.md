# Rollen und Berechtigungen

Jede Vereinsmitgliedschaft hat eine der Rollen **Benutzer**, **Admin** oder
**Vorstand**. Die Rolle gilt nur für diesen Verein. Anmeldedaten und Passwort
gehören weiterhin zum gemeinsamen Rendant-Konto. Die Betreiberverwaltung ist
separat abgesichert und wird durch Vereinsrechte nicht freigeschaltet.

## Voreinstellungen

- **Benutzer** behält die bisherigen Rechte: Buchhaltung und Helferstunden
  ansehen, Kassenzählprotokolle buchen, Helferstunden erfassen und Listen
  exportieren. Verwaltungsaktionen sind zunächst ausgeschaltet.
- **Vorstand** kann den eigenen Verein vollständig verwalten. Dazu gehören
  Buchhaltung, Helferstunden, Einstellungen, Integrationen und die Verwaltung
  der Rollen Benutzer und Vorstand.
- **Admin** ist der geschützte technische Verwaltungszugang. Seine Benutzer-
  und Rollenverwaltung lässt sich nicht abschalten. Nur ein Admin oder der
  Betreiber darf die Admin-Rolle zuweisen, Admin-Mitgliedschaften ändern oder
  die Berechtigungen dieser technischen Rolle bearbeiten.

Bestehende Mitgliedschaften bleiben unverändert. Die neue Rolle wird niemandem
automatisch zugewiesen. Rollen lassen sich bei Einladungen wählen oder später
unter **Einstellungen**, **Benutzer & Einladungen** ändern. Selbständerungen der
eigenen Rolle und das Sperren des eigenen Kontos sind gesperrt.

## Rechte anpassen

Unter **Einstellungen**, **Rollen und Berechtigungen** zeigt die Matrix die drei
Rollen nebeneinander. Die einzelnen Rechte sind nach Buchhaltung, Helferstunden,
Daten, Vereinsverwaltung und Zugriffen gegliedert. Änderungen gelten für alle
Personen mit der gewählten Rolle im aktuell geöffneten Verein.

Ein Schreibrecht benötigt die zugehörigen Leserechte. Beim Aktivieren werden
diese mit ausgewählt; beim Entfernen eines Leserechts werden die davon
abhängigen Rechte ebenfalls entfernt. Die Oberfläche zeigt diese Anpassungen
an. Speichern ist eine ausdrückliche Aktion. Eine im Hintergrund neu geladene
Konfiguration überschreibt keinen noch nicht gespeicherten Entwurf.

Bei gleichzeitigem Bearbeiten wird eine veraltete Änderung abgelehnt. Den
aktuellen Stand laden und die beabsichtigten Änderungen erneut prüfen. Bereits
gespeicherte Belege und Buchungsdaten ändern sich dadurch nicht.

## Schutz vor Aussperrung und Selbsterhöhung

Der letzte aktive Admin darf nicht herabgestuft oder gesperrt werden. Außerdem
muss mindestens eine aktive Person Benutzer und Rollen verwalten können.
Ein Vorstand mit eingeschränkten Rechten darf nur solche Rechte weitergeben,
die er selbst aktuell besitzt. Das gilt auch beim Zuweisen einer Rolle oder
beim Einladen anderer Personen. Der geschützte technische Admin-Zugang kann
nicht als Umweg zum Wiederherstellen entzogener Rechte genutzt werden.

Admins können ihre fachlichen Rechte verändern und über den geschützten
Verwaltungszugang wiederherstellen. Vorstand und Benutzer können sich keine
zusätzlichen Rechte verschaffen, indem sie eine andere Person oder ein zweites
Konto einladen. Änderungen der Rollen und ihrer Berechtigungen werden protokolliert.

## Wirkung

Die Prüfung erfolgt auf dem Server bei jedem neuen Aufruf, auch bei Downloads,
Importen und Schnittstellenzugriffen. Eine offene Seite kann bis zur nächsten
Aktualisierung noch ihre alte Darstellung zeigen; eine nicht mehr erlaubte
Aktion wird trotzdem abgelehnt. Bereits zuvor berechtigt gelesene Daten können
nicht nachträglich aus einem Browser zurückgenommen werden.

Ohne Buchhaltungsrechte bleibt gegebenenfalls die Helferstundenansicht oder
die persönliche Einstellung der Benachrichtigungen erreichbar. Finanzdaten
anderer Vereine sind unabhängig von der gewählten Rolle ausgeschlossen.

## Betrieb und Wiederherstellung

Migration 0039 ergänzt die Berechtigungen und ihre Änderungsnummer im
Vereinsregister. Bestehende Rollen und Buchungsdaten werden nicht umgeschrieben.
Vor der Umstellung einen Sicherungspunkt erhalten. Eine Wiederherstellung muss
auch Rollen, Berechtigungen und Änderungsnummern unverändert übernehmen.

Eine ältere Anwendung ohne diese Rechteprüfung kann gespeicherte Einschränkungen
ignorieren. Nach Vergabe der neuen Rolle oder Anpassung der Rechte deshalb
keine Version vor 1.62 einsetzen. Einen Fehler mit einer passenden korrigierten
Version beheben; eine Sicherung zunächst getrennt wiederherstellen und prüfen.
