# Rendant Brand Identity

This folder contains the design reference and production assets for the Rendant
brand. Start with
[`Rendant-Brand-Kit/01-guidelines/brand-guidelines.html`](Rendant-Brand-Kit/01-guidelines/brand-guidelines.html).

## Inventory

- `00-preview/`: brand boards and light and dark previews
- `01-guidelines/`: the 22-section HTML guideline
- `02-logo/`: source SVGs, outlined SVGs, and transparent PNG exports
- `03-icons/`: app, favicon, Apple touch, and PWA assets
- `04-guilloche/`: reusable SVG motifs and CSS
- `05-design-tokens/`: CSS, JSON, and TypeScript tokens plus typography styles
- `06-ui-examples/`: responsive light and dark interface references
- `07-document-examples/`: five print-oriented HTML document references
- `08-fonts/`: font sources and licensing notes
- `09-implementation/`: logo and guilloche demos

The guideline mentions an asset manifest, a PDF guideline, and an
`INTEGRATION.md`. Those files are not included in this export.

## Production integration

Treat this folder as reference material, not as a package to copy into the app
unchanged. Map the tokens to the application's existing theme contract, copy
only the required public assets, and verify light mode, dark mode, responsive
layouts, printed documents, favicons, and PWA metadata in the target runtime.

Do not use `#B08A3E` as text on `#F7F3EA`. Its 2.89:1 contrast ratio fails WCAG
AA even for large text. Use `#8A6A28` for accessible light-theme accent text.

All wordmark-bearing exports were regenerated from the build dependency
`@fontsource/spectral` using Spectral 500. Editable SVGs retain a Spectral font
reference. The `svg-outlined/` and PNG exports use matching, font-independent
Spectral glyph paths. Run
`Rendant-Brand-Kit/02-logo/generate-logo-assets.mjs` from the repository root to
reproduce and validate the asset set.

## Fonts

The kit does not include font files. Spectral, IBM Plex Sans, and IBM Plex Mono
are available under the SIL Open Font License 1.1. See
[`Rendant-Brand-Kit/08-fonts/FONT-SOURCES-AND-LICENSES.md`](Rendant-Brand-Kit/08-fonts/FONT-SOURCES-AND-LICENSES.md).

Self-host the required WOFF2 subsets in production. The Google Fonts import in
`05-design-tokens/typography.css` is convenient for previewing the kit, but it
must not be shipped as the application's production font delivery path.

## Rights

The font licenses apply only to the font software. The Rendant name, logos,
artwork, screenshots, and document examples are proprietary under the
repository's root license. No separate permission to use or redistribute them
is included in this folder. Do not assume that the SIL Open Font License covers
the brand assets.
