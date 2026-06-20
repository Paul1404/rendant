# Changelog

Alle nennenswerten Änderungen an diesem Projekt. Neueste zuerst. Die Version
hier entspricht `package.json` und der Versionsmarke in der App.

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
