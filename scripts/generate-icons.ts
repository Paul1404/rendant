// Generates the full favicon/icon set from the production SVG sources.
// Run with: bun run icons
//
// PNG and ICO files are derived assets. Keep registermark geometry and colors
// in the SVGs so browser, app, and maskable variants stay reproducible.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const favicon = join(publicDir, "favicon.svg");
const appIcon = join(publicDir, "logo.svg");
const squareIcon = join(publicDir, "logo-square.svg");
const maskableIcon = join(publicDir, "logo-maskable.svg");

const pngTargets = [
  { name: "favicon-16.png", size: 16, source: favicon },
  { name: "favicon-32.png", size: 32, source: favicon },
  { name: "apple-touch-icon.png", size: 180, source: appIcon },
  { name: "icon-192.png", size: 192, source: squareIcon },
  { name: "icon-512.png", size: 512, source: squareIcon },
  { name: "icon-maskable-192.png", size: 192, source: maskableIcon },
  { name: "icon-maskable-512.png", size: 512, source: maskableIcon },
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
  const faviconSvg = await readFile(favicon);
  const icoSizes = [16, 32, 48];
  const icoBuffers = await Promise.all(
    icoSizes.map((size) =>
      sharp(faviconSvg, { density: 384 }).resize(size, size).png().toBuffer(),
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
