# Changelog

Alle nennenswerten Änderungen an diesem Projekt. Neueste zuerst. Die Version
hier entspricht `package.json` und der Versionsmarke in der App.

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
