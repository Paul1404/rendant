// Rendant — Design Tokens (TypeScript)
export const rendantTokens = {
  "$schema": "https://design-tokens.org/draft",
  "name": "Rendant",
  "version": "1.0.0",
  "color": {
    "brand": {
      "forest-deep": "#0A1D17",
      "forest": "#0F2A22",
      "forest-soft": "#1B3A30",
      "forest-line": "#254A3D",
      "brass": "#B08A3E",
      "brass-light": "#C9A960",
      "brass-dark": "#8A6A28",
      "brass-pale": "#E4D9BF",
      "parchment": "#F7F3EA",
      "parchment-2": "#EFE9DC",
      "parchment-3": "#E6DECD"
    },
    "neutral": {
      "ink": "#12261F",
      "ink-muted": "#3C4B44",
      "ink-faint": "#6B7A73",
      "line": "rgba(15,42,34,0.12)",
      "line-strong": "rgba(15,42,34,0.22)"
    },
    "semantic": {
      "success": "#2F6B4F",
      "warning": "#A9791C",
      "danger": "#8C2F24",
      "info": "#2C5A6B"
    },
    "chart": {
      "chart-1": "#0F2A22",
      "chart-2": "#B08A3E",
      "chart-3": "#2F6B4F",
      "chart-4": "#6B7A73",
      "chart-5": "#8C5A24",
      "chart-6": "#2C5A6B"
    },
    "dark": {
      "bg": "#0A1D17",
      "surface": "#12332A",
      "surface-raised": "#174034",
      "text": "#F2EDE2",
      "muted": "#A6B9B0",
      "accent": "#C9A960",
      "line": "rgba(201,169,96,0.18)"
    }
  },
  "typography": {
    "family": {
      "display": "Spectral, 'Iowan Old Style', Georgia, serif",
      "ui": "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif",
      "mono": "'IBM Plex Mono', ui-monospace, monospace"
    },
    "scale": {
      "display-1": {
        "size": "60px",
        "lh": "1.0",
        "ls": "0.14em",
        "weight": 500
      },
      "display-2": {
        "size": "46px",
        "lh": "1.12",
        "ls": "0",
        "weight": 400
      },
      "h1": {
        "size": "32px",
        "lh": "1.2",
        "ls": "0",
        "weight": 400
      },
      "h2": {
        "size": "24px",
        "lh": "1.25",
        "ls": "0",
        "weight": 500
      },
      "h3": {
        "size": "18px",
        "lh": "1.35",
        "ls": "0",
        "weight": 600
      },
      "body": {
        "size": "15px",
        "lh": "1.6",
        "ls": "0",
        "weight": 400
      },
      "body-sm": {
        "size": "13px",
        "lh": "1.55",
        "ls": "0",
        "weight": 400
      },
      "label": {
        "size": "11px",
        "lh": "1",
        "ls": "0.18em",
        "weight": 600
      },
      "num-lg": {
        "size": "28px",
        "lh": "1.1",
        "ls": "-0.01em",
        "weight": 500
      },
      "num": {
        "size": "14px",
        "lh": "1.4",
        "ls": "0",
        "weight": 450
      }
    }
  },
  "space": {
    "1": "4px",
    "2": "8px",
    "3": "12px",
    "4": "16px",
    "5": "20px",
    "6": "24px",
    "8": "32px",
    "10": "40px",
    "12": "48px",
    "16": "64px",
    "20": "80px"
  },
  "radius": {
    "none": "0",
    "sm": "2px",
    "md": "4px",
    "lg": "6px",
    "pill": "999px"
  },
  "shadow": {
    "level-1": "0 1px 2px rgba(10,29,23,0.06)",
    "level-2": "0 2px 8px rgba(10,29,23,0.08)",
    "level-3": "0 8px 28px rgba(10,29,23,0.12)",
    "dark-1": "0 1px 2px rgba(0,0,0,0.4)",
    "dark-2": "0 4px 18px rgba(0,0,0,0.45)"
  },
  "border": {
    "hairline": "1px",
    "focus": "2px"
  },
  "guilloche": {
    "opacity-light": 0.075,
    "opacity-dark": 0.11,
    "opacity-document": 0.06,
    "stroke-screen": "0.7px",
    "stroke-print": "0.35pt",
    "safe-area": "96px"
  },
  "motion": {
    "fast": "120ms",
    "base": "180ms",
    "slow": "320ms",
    "easing": "cubic-bezier(0.2,0,0,1)"
  },
  "contrast": [
    {
      "pair": "Text auf Parchment",
      "foreground": "#12261F",
      "background": "#F7F3EA",
      "ratio": 14.34,
      "wcag": "AAA"
    },
    {
      "pair": "Muted auf Parchment",
      "foreground": "#3C4B44",
      "background": "#F7F3EA",
      "ratio": 8.31,
      "wcag": "AAA"
    },
    {
      "pair": "Faint auf Parchment",
      "foreground": "#6B7A73",
      "background": "#F7F3EA",
      "ratio": 4.07,
      "wcag": "AA Large"
    },
    {
      "pair": "Parchment auf Forest",
      "foreground": "#F7F3EA",
      "background": "#0F2A22",
      "ratio": 13.8,
      "wcag": "AAA"
    },
    {
      "pair": "Brass-light auf Forest",
      "foreground": "#C9A960",
      "background": "#0F2A22",
      "ratio": 6.79,
      "wcag": "AA"
    },
    {
      "pair": "Brass-dark auf Parchment",
      "foreground": "#8A6A28",
      "background": "#F7F3EA",
      "ratio": 4.54,
      "wcag": "AA"
    },
    {
      "pair": "Brass auf Parchment",
      "foreground": "#B08A3E",
      "background": "#F7F3EA",
      "ratio": 2.89,
      "wcag": "Fail"
    },
    {
      "pair": "Dark text auf Dark bg",
      "foreground": "#F2EDE2",
      "background": "#0A1D17",
      "ratio": 14.98,
      "wcag": "AAA"
    },
    {
      "pair": "Dark muted auf Dark surface",
      "foreground": "#A6B9B0",
      "background": "#12332A",
      "ratio": 6.65,
      "wcag": "AA"
    },
    {
      "pair": "Accent auf Dark surface",
      "foreground": "#C9A960",
      "background": "#12332A",
      "ratio": 6.09,
      "wcag": "AA"
    },
    {
      "pair": "Danger auf Parchment",
      "foreground": "#8C2F24",
      "background": "#F7F3EA",
      "ratio": 7.44,
      "wcag": "AAA"
    },
    {
      "pair": "Success auf Parchment",
      "foreground": "#2F6B4F",
      "background": "#F7F3EA",
      "ratio": 5.68,
      "wcag": "AA"
    }
  ]
} as const;

export type RendantTokens = typeof rendantTokens;
export type BrandColor = keyof typeof rendantTokens.color.brand;
export type SemanticColor = keyof typeof rendantTokens.color.semantic;
export type ChartColor = keyof typeof rendantTokens.color.chart;
export type SpaceToken = keyof typeof rendantTokens.space;

export const cssVar = (path: string): string => `var(--rd-${path.replace(/\./g, '-')})`;
export default rendantTokens;
