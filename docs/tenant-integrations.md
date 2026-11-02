# Technische Einrichtung je Verein

Unter `admin.rendant.app` den Verein auswählen und **Verwalten** öffnen. Im
Bereich **Technische Einrichtung** stehen E-Mail, MCP, SumUp und DATEV getrennt
bereit. Der Betreiber benötigt dafür keine Mitgliedschaft im Zielverein.
Finanzielle Datensätze werden in dieser Oberfläche nicht angezeigt.

Zugangsdaten sind ausschließlich schreibbar. Die Anzeige sagt nur, ob bereits
ein Geheimnis gespeichert ist. Leere Geheimnisfelder behalten den vorhandenen
Wert. Zum Entfernen die ausdrücklich beschriftete Option verwenden. Ein
Vereinswechsel übernimmt keine Entwürfe oder Zugangsdaten in einen anderen
Verein. **Entwürfe verwerfen und neu laden** verwirft ungespeicherte Eingaben
ausdrücklich und lädt den ausgewählten Verein erneut.

## E-Mail

Host, Port, Verschlüsselung, Benutzer und Absender gehören zum ausgewählten
Verein. Einladungen und Benachrichtigungen verwenden ausschließlich dessen
Konfiguration. Das Passwort bleibt verschlüsselt gespeichert. Auch die
Benachrichtigungseinstellungen und zusätzlichen Empfänger sind vereinsbezogen.

Speichern löst keine Nachricht aus. Eine Testnachricht wird nur nach Eingabe
eines Empfängers und ausdrücklichem Klick versendet. Ein unbestätigtes Ergebnis
kann bedeuten, dass der Mailserver bereits angenommen hat. Vor erneutem Senden
das Zielpostfach prüfen. Es gibt keinen automatischen Wiederholungsversand.

## MCP

Jeder Verein benötigt einen eigenen Schlüssel mit mindestens 32 Zeichen. Ein
Schlüssel darf nicht gleichzeitig mehreren Vereinen zugeordnet werden. Die
Oberfläche zeigt die vollständige MCP-Adresse unter der Vereinsadresse an;
`admin.rendant.app` ist selbst kein fachlicher MCP-Endpunkt. Ohne freigeschaltete
Vereinsadresse ist die Verbindung noch nicht nutzbar.

Neue Vereinszugänge sind ausgeschaltet und beginnen im Modus **Nur Lesen**.
**Verwaltungsrechte** erlaubt die angebotenen geprüften Fachmutationen innerhalb
der aktuellen Vereinsberechtigungen. **Benutzerrechte** bezeichnet einen
eingeschränkten fachlichen Schlüssel und keine Anmeldung einer Person. Name und
E-Mail dienen nur dem Audit. Rollenverwaltung bleibt über MCP gesperrt.

Leeres Schlüsselfeld behält den effektiven Schlüssel. Entfernen und Deaktivieren
sind ausdrücklich zu bestätigen; ein aktivierter Zugang ohne Schlüssel wird
abgewiesen. Änderungen und Schlüsselwechsel greifen bei neuen Anfragen. Die
Verbindung akzeptiert nur den tatsächlichen freigeschalteten Vereinshost und
dazu passende Auswahlwerte. Der Schlüssel eines anderen Vereins ist dort ungültig.

Der alte `MCP_*`-Zugang bleibt ausschließlich der SVU-Fallback. Beim ersten
ausdrücklichen Speichern von SVU wird dessen bisheriger Schlüssel bei leerem
Schlüsselfeld intern verschlüsselt übernommen. Andere Vereine übernehmen ihn
niemals. Nach ausdrücklichem Entfernen, Deaktivieren oder Wechsel fällt die
Konfiguration nicht wieder auf den alten Umgebungsschlüssel zurück. Die alten
explizit freigegebenen SVU-Adressen bleiben kompatibel.

## SumUp

Ein neuer API-Key wird beim Speichern gegen die Händlerzuordnung geprüft.
Händlercode und Händlername stammen aus dieser Prüfung. Kontrollieren, dass das
richtige Vereinskonto verbunden ist. Der Key bleibt verschlüsselt und erscheint
nicht in Antworten oder Geschäftsarchiven.

Der zentrale Verbindungstest fragt nur die Händlerzuordnung ab. Er lädt keine
Transaktionen und zeigt weder Umsätze noch Anzahlen von Kartenzahlungen. Das
Entfernen des Keys entfernt die Händlerbindung und deaktiviert die Anbindung.
Das fachliche Abrufen von Karteneinnahmen bleibt in der jeweiligen Vereinsansicht
an deren Berechtigungen gebunden.

## DATEV

Aktivierung, Upload-Mail-Zieladresse und freigeschalteter Absender werden pro
Verein gespeichert. Die Zieladresse bleibt auf den Belegtyp Kasse unter
`uploadmail.datev.de` begrenzt. Der Absender muss in DATEV und beim eingerichteten
verschlüsselten Mailversand zugelassen sein.

Speichern versendet keinen Beleg und erzeugt keine Versandbestätigung. Der
fachliche Versand und die Klärung unbestätigter Übermittlungen bleiben explizite
Aktionen im Verein mit eigenem Recht. SMTP-Annahme beweist keinen DATEV-Import.

## Betrieb und Schutzgrenzen

Jede Einstellungsgruppe hat einen eigenen Änderungsstand. Veraltete Änderungen
werden abgewiesen. Betreiberberechtigung, technische Änderung und Audit werden
in derselben Transaktion abgesichert; danach greift die eingeschränkte
PostgreSQL-Rolle mit dem lokalen Zielverein. Netzwerkprüfungen von SumUp erfolgen
vor der Schreibtransaktion, deren Berechtigungsprüfung anschließend erneut greift.

Migration 0040 ergänzt ausschließlich deaktivierte MCP-Voreinstellungen. Sie
übernimmt keine Schlüssel in SQL und prüft den unveränderten Altbestand der
Einstellungen innerhalb der Transaktion. Bestehende Mail-, SumUp-, DATEV- und
SVU-Zugänge bleiben vor einer ausdrücklichen Bedienaktion erhalten.

Nach Speicherung einer MCP-Vereinskonfiguration keine ältere Anwendung ohne
deren Prüfung einsetzen: Sie könnte einen deaktivierten oder ersetzten alten
SVU-Umgebungsschlüssel wieder akzeptieren. Fehler mit einer passenden korrigierten
Version beheben. Bei Wiederherstellung gehören verschlüsselte Schlüssel,
Schlüsselzuordnung und Änderungsstände zusammen. Geschäftsarchive enthalten
keine verschlüsselten Geheimnisse oder Schlüsselprüfwerte und ersetzen kein
vollständiges Datenbank-Backup.
