import { mkdir, writeFile } from 'node:fs/promises';

const METADATA_URL = 'https://fonts.google.com/metadata/fonts';
const OUTPUT = new URL('../src/fonts/catalog.json', import.meta.url);
const GROUPS = {
  Serif: 'serif',
  'Sans Serif': 'sans-serif',
  Display: 'display',
  Handwriting: 'handwriting',
  Monospace: 'monospace',
};

const response = await fetch(METADATA_URL);
if (!response.ok) throw new Error(`Google Fonts returned ${response.status} ${response.statusText}`);

let text = await response.text();
if (text.startsWith(")]}'")) {
  const newline = text.indexOf('\n');
  text = newline === -1 ? '' : text.slice(newline + 1);
}
const metadata = JSON.parse(text);
const source = metadata.familyMetadataList;
if (!Array.isArray(source)) throw new Error('Google Fonts metadata has no familyMetadataList');

const missingPopularity = source.filter((family) => !Number.isFinite(family.popularity)).length;
const ordered = missingPopularity === 0
  ? [...source].sort((a, b) => a.popularity - b.popularity)
  : source;
if (missingPopularity > 0) {
  console.warn(`${missingPopularity} families have no popularity; keeping Google's file order.`);
}

const families = ordered.map((family) => {
  const group = GROUPS[family.category];
  if (!group) throw new Error(`Unknown Google Fonts category "${family.category}" for "${family.family}"`);
  const keys = Object.keys(family.fonts ?? {});
  const weights = [...new Set(keys.flatMap((key) => {
    const match = /^(\d+)(?:i)?$/.exec(key);
    return match ? [Number(match[1])] : [];
  }))].sort((a, b) => a - b);
  if (weights.length === 0) throw new Error(`No weights for "${family.family}"`);
  return {
    n: family.family,
    c: group,
    w: weights,
    i: keys.some((key) => /^\d+i$/.test(key)),
  };
});

const now = new Date();
const updated = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
].join('-');
await mkdir(new URL('../src/fonts/', import.meta.url), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify({ updated, families })}\n`);
console.log(`Wrote ${families.length} families to ${OUTPUT.pathname}`);
