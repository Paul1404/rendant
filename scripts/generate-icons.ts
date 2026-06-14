// Generates the full favicon/icon set from public/logo.svg.
// Run with: npm run icons
//
// The SVG is the single source of truth. Everything else (PNGs, ICO) is
// derived from it so the brand stays consistent across browsers and devices.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
// Rounded tile shows in browser tabs; full-bleed square is for app/home-screen
// icons where the OS applies its own rounded mask.
const rounded = join(publicDir, "logo.svg");
const square = join(publicDir, "logo-square.svg");

const pngTargets = [
  { name: "favicon-16.png", size: 16, source: rounded },
  { name: "favicon-32.png", size: 32, source: rounded },
  { name: "apple-touch-icon.png", size: 180, source: square },
  { name: "icon-192.png", size: 192, source: square },
  { name: "icon-512.png", size: 512, source: square },
];

async function main() {
  for (const { name, size, source } of pngTargets) {
    const svg = await readFile(source);
    await sharp(svg, { density: 384 })
      .resize(size, size)
      .png()
      .toFile(join(publicDir, name));
    console.log(`wrote ${name} (${size}x${size})`);
  }

  // Legacy .ico bundles 16/32/48 for older browsers.
  const roundedSvg = await readFile(rounded);
  const icoSizes = [16, 32, 48];
  const icoBuffers = await Promise.all(
    icoSizes.map((size) =>
      sharp(roundedSvg, { density: 384 }).resize(size, size).png().toBuffer(),
    ),
  );
  const ico = await pngToIco(icoBuffers);
  await writeFile(join(publicDir, "favicon.ico"), ico);
  console.log(`wrote favicon.ico (${icoSizes.join("/")})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
