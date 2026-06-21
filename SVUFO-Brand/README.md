# SVUFO — Brand Mark

**The concept: "The Tally."**

The first thing anyone does with a till is *count it* — and the oldest way to count
by hand is the tally: four strokes, then a fifth struck across to close the group of
five. It's tactile, human, and instantly legible. That gesture *is* the product.

So the mark is a tally of five, recut with the discipline of a typeface and dropped
inside a coin:

- **Four uprights** — even and exact. Cash counted one note at a time; the precision
  auditors trust.
- **The fifth, in brass** — the closing slash, struck in coin-gold. The satisfying
  moment a count reconciles and the books balance.
- **The coin** — the circle does double duty: a coin, and the closed, complete ledger.

Held together, cash and order read in a single glance — exactly the promise: messy
till in, audit-ready protocol out. The silhouette is just five honest strokes in a
circle, so it survives all the way down to 16 pixels.

---

## Colour

| Role        | Name         | HEX       |
|-------------|--------------|-----------|
| Primary     | Ledger Green | `#0F4435` |
| Accent      | Coin Brass   | `#C49A4E` |
| Dark / text | Ink          | `#13201B` |
| Background  | Paper        | `#F6F3EC` |

Use one accent only. Brass is reserved for the closing fifth stroke and small
moments — never large fills.

## Typography

**Space Grotesk** (Google Fonts, free) — wordmark in SemiBold (600), all caps,
+0.04em tracking. Quiet, technical confidence. Hanken Grotesk is the supporting
text face.

## Clear space & minimum size

- Keep clear space around the mark equal to one upright stroke on all sides.
- Minimum size: 16px (icon). Below ~24px prefer the solid disc versions over the
  outline.

---

## What's in this pack

```
SVUFO-Brand/
├─ README.md                      ← this file
├─ concept/
│  └─ SVUFO-Brand-Concept.html    ← full identity presentation, opens offline
└─ logo/
   ├─ svg/                        ← vector (scale infinitely)
   │  ├─ svufo-mark.svg               primary, full colour
   │  ├─ svufo-mark-ink.svg           single-ink disc
   │  ├─ svufo-mark-outline.svg       outline / line version
   │  ├─ svufo-mark-reversed.svg      for dark backgrounds
   │  ├─ svufo-app-icon.svg           rounded-square home-screen tile
   │  ├─ svufo-favicon.svg            full-bleed disc favicon
   │  ├─ svufo-wordmark.svg           "SVUFO" wordmark
   │  └─ svufo-lockup-horizontal.svg  mark + wordmark
   └─ png/                        ← raster (transparent background)
      ├─ svufo-mark-1024.png
      ├─ svufo-mark-512.png
      ├─ svufo-mark-ink-1024.png
      ├─ svufo-mark-reversed-1024.png
      ├─ svufo-app-icon-1024.png
      └─ svufo-favicon-256.png
```

**Note on the wordmark/lockup SVGs:** they call Space Grotesk from Google Fonts, so
they render correctly in any browser. For print or Office files, install Space
Grotesk first (or convert the text to outlines in your vector editor) so the wordmark
matches.
