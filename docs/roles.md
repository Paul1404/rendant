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
  von Benutzern innerhalb der vergebenen Rechte. Die Rollenverwaltung bleibt
  ausschließlich in der Betreiberoberfläche.
- **Admin** ist der geschützte technische Verwaltungszugang. Seine
  Benutzerverwaltung lässt sich nicht abschalten. Rollen und ihre Rechte
  verwaltet ausschließlich der Betreiber in der zentralen Verwaltung.

Bestehende Mitgliedschaften bleiben unverändert. Die neue Rolle wird niemandem
automatisch zugewiesen. Rollen werden ausschließlich in der Betreiberverwaltung
auf `admin.rendant.app`
gewählt und geändert: Verein auswählen, **Verwalten**, dann die Person oder
Einladung bearbeiten. In der Vereinsansicht ist die Rolle nur lesbar. Eine dort
erstellte Einladung legt immer einen Benutzer an. Selbständerungen der
eigenen Rolle und das Sperren des eigenen Kontos sind gesperrt.

## Rechte anpassen

Unter `admin.rendant.app`, **Verwalten**, **Rollen und Berechtigungen** zeigt die
Matrix die drei Rollen für den ausgewählten Verein nebeneinander. Nur ein
freigeschalteter Betreiber kann sie lesen oder ändern. Auch eine Vereinsrolle
mit allen fachlichen Rechten erhält dadurch keinen Zugriff auf die zentrale
Rollenverwaltung. Die einzelnen Rechte sind nach Buchhaltung, Helferstunden,
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

Der letzte aktive Admin darf nicht herabgestuft oder gesperrt werden.
Vereinsrollen dürfen weder sich selbst noch andere Konten in eine höhere Rolle
versetzen. Auch eine Einladung aus der Vereinsansicht kann keine Verwaltungsrolle
vergeben. Alte direkte Rollen-Endpunkte und entsprechende MCP-Aktionen bleiben
gesperrt. Die zentrale Verwaltung prüft den Betreiberzugang unabhängig von den
fachlichen Rechten des ausgewählten Vereins und prüft ihn bei Änderungen erneut
in der Transaktion.

Auch die Vereinsrolle Admin kann zentrale fachliche Einschränkungen nicht
umgehen. Gewöhnliche Einladungen und Entsperrungen dürfen keinen weitergehenden
Zugang vergeben, als die handelnde Person selbst besitzt. Darüber hinausgehende
Freigaben erfolgen ausschließlich durch den Betreiber.

Bisher gespeicherte Berechtigungen bleiben erhalten. Der frühere Schlüssel
`roles.manage` wird nur noch als Altdatum erhalten und verleiht keine Befugnis.
Er ist kein vergebbares Vereinsrecht mehr. Gespeicherte Rollen und ihre Versionen
werden bei dieser Korrektur nicht umgeschrieben.

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
