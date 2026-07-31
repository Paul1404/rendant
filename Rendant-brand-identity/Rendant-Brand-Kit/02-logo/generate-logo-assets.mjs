import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as fontkit from "fontkit";
import sharp from "sharp";

const logoDir = path.dirname(fileURLToPath(import.meta.url));
const svgDir = path.join(logoDir, "svg");
const outlinedDir = path.join(logoDir, "svg-outlined");
const pngDir = path.join(logoDir, "png");
const spectralPath = path.join(
  logoDir,
  "../../../node_modules/@fontsource/spectral/files/spectral-latin-500-normal.woff",
);

const font = fontkit.openSync(spectralPath);
const wordmark = "RENDANT";
const fontSize = 34;
const letterSpacing = 4.8;
const baseline = 27;
const fontScale = fontSize / font.unitsPerEm;

const colors = {
  brass: "#B08A3E",
  brassLight: "#C9A960",
  forest: "#0F2A22",
  parchment: "#F7F3EA",
};

const symbolStroked = (color) =>
  `<g fill="none" stroke="${color}" stroke-width="8" stroke-linecap="butt" stroke-linejoin="miter"><path d="M32 22 V70"></path><path d="M32 22 H53 C65 22 65 44 53 44 H32"></path><path d="M50 44 L67 70"></path></g><path d="M22 80 H74" fill="none" stroke="${color}" stroke-width="4"></path>`;

// This is the existing font-independent outline of the approved registermark.
// Keep it unchanged while replacing only the incorrect sans-serif wordmark.
const symbolOutlined = (color) =>
  `<g fill="${color}" fill-rule="evenodd"><path d="M28 18 h25 c9.6 0 16.4 6.6 16.4 15 0 6.6-4.2 11.9-10.6 14.1L72.2 74 h-9.4L47.8 49.2 H36 V74 h-8 Z M36 26 v15.2 h16.6 c5.1 0 8.4-3 8.4-7.6 0-4.6-3.3-7.6-8.4-7.6 Z"></path><rect x="22" y="78" width="52" height="4"></rect></g>`;

const textWordmark = (color) =>
  `<text x="0" y="${baseline}" font-family="Spectral, Georgia, serif" font-weight="500" font-size="${fontSize}" letter-spacing="${letterSpacing}" fill="${color}">${wordmark}</text>`;

function outlinedWordmark(color) {
  const run = font.layout(wordmark);
  let x = 0;
  const paths = run.glyphs.map((glyph, index) => {
    const position = run.positions[index];
    const glyphX = x + position.xOffset * fontScale;
    const glyphY = baseline - position.yOffset * fontScale;
    x += position.xAdvance * fontScale;
    if (index < run.glyphs.length - 1) x += letterSpacing;
    return `<path transform="translate(${format(glyphX)} ${format(glyphY)}) scale(${format(fontScale)} -${format(fontScale)})" d="${glyph.path.toSVG()}"></path>`;
  });

  return `<g fill="${color}" fill-rule="nonzero">${paths.join("")}</g>`;
}

function format(value) {
  return Number(value.toFixed(6)).toString();
}

function svg(viewBox, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>\n`;
}

function write(filePath, contents) {
  fs.writeFileSync(filePath, contents);
}

const horizontalVariants = [
  ["rendant-logo-primary-horizontal", colors.brass, colors.forest],
  ["rendant-logo-horizontal-on-dark", colors.brassLight, colors.parchment],
  ["rendant-logo-horizontal-reversed", colors.parchment, colors.parchment],
  ["rendant-logo-horizontal-mono-dark", colors.forest, colors.forest],
  ["rendant-logo-horizontal-mono-light", colors.parchment, colors.parchment],
];

for (const [name, symbolColor, wordmarkColor] of horizontalVariants) {
  write(
    path.join(svgDir, `${name}.svg`),
    svg(
      "0 0 392.6 96",
      `<g>${symbolStroked(symbolColor)}</g><g transform="translate(124 31)">${textWordmark(wordmarkColor)}</g>`,
    ),
  );
  write(
    path.join(outlinedDir, `${name}-outlined.svg`),
    svg(
      "0 0 392.6 96",
      `<g>${symbolOutlined(symbolColor)}</g><g transform="translate(124 31)">${outlinedWordmark(wordmarkColor)}</g>`,
    ),
  );
}

const stackedVariants = [
  ["rendant-logo-stacked", colors.brass, colors.forest],
  ["rendant-logo-stacked-on-dark", colors.brassLight, colors.parchment],
];

for (const [name, symbolColor, wordmarkColor] of stackedVariants) {
  write(
    path.join(svgDir, `${name}.svg`),
    svg(
      "0 0 268.6 168",
      `<g transform="translate(86.3 0)">${symbolStroked(symbolColor)}</g><g transform="translate(8 118)">${textWordmark(wordmarkColor)}</g>`,
    ),
  );
  write(
    path.join(outlinedDir, `${name}-outlined.svg`),
    svg(
      "0 0 268.6 168",
      `<g transform="translate(86.3 0)">${symbolOutlined(symbolColor)}</g><g transform="translate(8 118)">${outlinedWordmark(wordmarkColor)}</g>`,
    ),
  );
}

write(
  path.join(svgDir, "rendant-wordmark.svg"),
  svg("0 0 268.6 34", textWordmark(colors.forest)),
);
write(
  path.join(outlinedDir, "rendant-wordmark-outlined.svg"),
  svg("0 0 268.6 34", outlinedWordmark(colors.forest)),
);
write(
  path.join(outlinedDir, "rendant-wordmark-on-dark-outlined.svg"),
  svg("0 0 268.6 34", outlinedWordmark(colors.parchment)),
);

const pngExports = [
  ["rendant-logo-primary-horizontal-outlined.svg", "rendant-logo-primary-horizontal-1600w.png", 1600, 389],
  ["rendant-logo-primary-horizontal-outlined.svg", "rendant-logo-primary-horizontal-800w.png", 800, 195],
  ["rendant-logo-horizontal-on-dark-outlined.svg", "rendant-logo-horizontal-on-dark-1600w.png", 1600, 389],
  ["rendant-logo-horizontal-on-dark-outlined.svg", "rendant-logo-horizontal-on-dark-800w.png", 800, 195],
  ["rendant-logo-stacked-outlined.svg", "rendant-logo-stacked-1200w.png", 1200, 753],
  ["rendant-logo-stacked-outlined.svg", "rendant-logo-stacked-600w.png", 600, 377],
  ["rendant-logo-stacked-on-dark-outlined.svg", "rendant-logo-stacked-on-dark-1200w.png", 1200, 753],
  ["rendant-logo-stacked-on-dark-outlined.svg", "rendant-logo-stacked-on-dark-600w.png", 600, 377],
  ["rendant-wordmark-outlined.svg", "rendant-wordmark-1600w.png", 1600, 197],
  ["rendant-wordmark-outlined.svg", "rendant-wordmark-800w.png", 800, 99],
];

for (const [source, target, width, height] of pngExports) {
  await sharp(path.join(outlinedDir, source))
    .resize(width, height, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(path.join(pngDir, target));
}

console.log(
  `Generated ${horizontalVariants.length + stackedVariants.length + 1} text SVGs, ${horizontalVariants.length + stackedVariants.length + 2} outlined SVGs, and ${pngExports.length} PNGs with ${font.fullName}.`,
);
