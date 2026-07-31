# Schriften — Bezug und Lizenz

Es liegen **keine Schriftdateien** in diesem Kit. Beide Familien sind frei lizenziert und
müssen selbst bezogen werden (Self-Hosting empfohlen, DSGVO-konform, ohne Google-Fonts-CDN).

## Spectral — Display
- Foundry: Production Type für Google Fonts
- Lizenz: SIL Open Font License 1.1
- Bezug: https://fonts.google.com/specimen/Spectral · https://github.com/productiontype/Spectral
- Verwendete Schnitte: 300 Light, 400 Regular, 500 Medium, 600 SemiBold
- Grund: Transitional-Serif mit ruhigem, dokumentarischem Duktus; vollständige deutsche Diakritika.

## IBM Plex Sans — Interface
- Foundry: IBM / Bold Monday
- Lizenz: SIL Open Font License 1.1
- Bezug: https://fonts.google.com/specimen/IBM+Plex+Sans · https://github.com/IBM/plex
- Verwendete Schnitte: 400, 500, 600
- Grund: Neutral-technische Grotesk ohne Startup-Anmutung, exzellente Lesbarkeit bei 13–15 px.

## IBM Plex Mono — Zahlen, Belegnummern, Codes
- Lizenz: SIL Open Font License 1.1
- Bezug: https://fonts.google.com/specimen/IBM+Plex+Mono
- Verwendete Schnitte: 400, 500
- Grund: Echte Tabellenziffern, eindeutige 0/O- und 1/l-Unterscheidung in Belegnummern.

## Fallback-Stack
```css
--font-display: Spectral, "Iowan Old Style", Georgia, serif;
--font-ui: "IBM Plex Sans", "Segoe UI", system-ui, -apple-system, sans-serif;
--font-mono: "IBM Plex Mono", ui-monospace, "SF Mono", Consolas, monospace;
```

## Hinweis
Die SVG-Logodateien in `02-logo/svg/` referenzieren Spectral per Namen.
Für Umgebungen ohne installierte Schrift die Dateien aus `02-logo/svg-outlined/` verwenden —
dort ist die Wortmarke als Pfadgeometrie ausgelegt und schriftunabhängig.
