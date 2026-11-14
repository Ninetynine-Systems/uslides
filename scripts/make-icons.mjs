// Draws the PNG app icons from the logo. Run: node scripts/make-icons.mjs
// The logo is a white slide with the Greek letter mu (micro) on a purple tile.
import { chromium } from 'playwright';

const ART = '<rect x="14" y="26" width="72" height="48" rx="6" fill="#ffffff"/><path d="M30 88 V24 M30 54 a20 20 0 0 0 40 0 V24 M70 54 v8 q0 10 9 10" transform="translate(25 23) scale(0.5)" fill="none" stroke="#5753d6" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>';
/** The logo as SVG. A square tile fills the whole image; `scale` shrinks the slide inside it. */
const svg = (rx, scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="${rx}" fill="#5753d6"/><g transform="translate(50 50) scale(${scale}) translate(-50 -50)">${ART}</g></svg>`;

// Maskable and Apple icons are cropped by the device, so they have square corners.
// The maskable one keeps the slide inside the middle 80%, which devices never crop.
const icons = [
  ['icon-192.png', 192, 22, 1],
  ['icon-512.png', 512, 22, 1],
  ['icon-maskable-512.png', 512, 0, 0.72],
  ['apple-touch-icon.png', 180, 0, 0.86],
];

const browser = await chromium.launch();
for (const [name, size, rx, scale] of icons) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg(rx, scale)}`);
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: true });
  await page.close();
}
await browser.close();
