import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const SKILL_DIR = 'skill/uslides';
const skill = readFileSync(`${SKILL_DIR}/SKILL.md`, 'utf8');
const exampleFiles = readdirSync(`${SKILL_DIR}/examples`).filter((f) => f.endsWith('.md'));
const example = (file: string) => readFileSync(`${SKILL_DIR}/examples/${file}`, 'utf8');

type RuntimePattern = (input: {
  request?: { destination: string };
  sameOrigin?: boolean;
  url?: URL;
}) => boolean;

/** Reads one generated Workbox predicate without giving it access to Vite's module scope. */
function runtimePattern(sw: string, cacheName: string): RuntimePattern {
  const cacheAt = sw.indexOf(`cacheName:"${cacheName}"`);
  if (cacheAt === -1) throw new Error(`Missing ${cacheName} runtime cache`);
  const marker = '.registerRoute(';
  const routeAt = sw.lastIndexOf(marker, cacheAt);
  if (routeAt === -1) throw new Error(`Missing ${cacheName} route`);
  const start = routeAt + marker.length;
  const depths = { round: 0, square: 0, curly: 0 };
  let quote = '';
  for (let i = start; i < cacheAt; i++) {
    const char = sw[i]!;
    if (quote !== '') {
      if (char === quote && sw[i - 1] !== '\\') quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') quote = char;
    else if (char === '(') depths.round++;
    else if (char === ')') depths.round--;
    else if (char === '[') depths.square++;
    else if (char === ']') depths.square--;
    else if (char === '{') depths.curly++;
    else if (char === '}') depths.curly--;
    else if (char === ',' && depths.round === 0 && depths.square === 0 && depths.curly === 0) {
      const source = sw.slice(start, i);
      return new Function(`return (${source})`)() as RuntimePattern;
    }
  }
  throw new Error(`Could not read ${cacheName} route predicate`);
}

for (const file of exampleFiles) {
  test(`examples/${file} renders with no box overflowing`, async ({ page }) => {
    // boxes.md uses ./chart.png, which sits next to it in the examples folder.
    await page.route('**/chart.png', (route) =>
      route.fulfill({ path: `${SKILL_DIR}/examples/chart.png`, contentType: 'image/png' }),
    );
    await page.goto('/?test');
    await page.waitForFunction(() => '__uslides' in window);
    const results = await page.evaluate((md) => window.__uslides!.render(md), example(file));
    expect(results.length).toBeGreaterThan(0);
    for (const slide of results) {
      for (const area of slide) expect(area.overflow).toBe(false);
    }
  });
}

for (const [path, start] of [
  ['/SKILL.md', '---\nname: uslides\n'],
  ['/llms.txt', '# uslides'],
] as const) {
  test(`${path} is served as text from the built site`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).not.toContain('html');
    expect((await res.text()).startsWith(start)).toBe(true);
  });
}

test('the built SKILL.md is the file from skill/uslides', async ({ request }) => {
  expect(await (await request.get('/SKILL.md')).text()).toBe(skill);
});

test('the service worker precaches SKILL.md and llms.txt', () => {
  const sw = readFileSync('dist/sw.js', 'utf8');
  expect(sw).toContain('url:"SKILL.md"');
  expect(sw).toContain('url:"llms.txt"');
});

test('the built service worker has self-contained runtime cache predicates', () => {
  const sw = readFileSync('dist/sw.js', 'utf8');
  const fontCss = runtimePattern(sw, 'uslides-font-css');
  const fontFile = runtimePattern(sw, 'uslides-fonts');
  const image = runtimePattern(sw, 'uslides-images');

  expect(fontCss({ url: new URL('https://fonts.googleapis.com/css2?family=Lora') })).toBe(true);
  expect(fontCss({ url: new URL('https://fonts.googleapis.com/css2?family=Lora&text=Lora') })).toBe(false);
  expect(fontFile({ url: new URL('https://fonts.gstatic.com/s/lora/v37/lora.woff2') })).toBe(true);
  expect(fontFile({ url: new URL('https://fonts.gstatic.com/l/font?kit=preview') })).toBe(false);
  expect(image({ request: { destination: 'image' }, sameOrigin: false })).toBe(true);
  expect(image({ request: { destination: 'image' }, sameOrigin: true })).toBe(false);
});

test('the #z= snippet in SKILL.md makes a link that opens the deck', async ({ page }) => {
  const code = /^```js\n([\s\S]*?)^```$/m.exec(skill)?.[1];
  expect(code).toBeDefined();
  await page.goto('/');
  const link = await page.evaluate(
    ([snippet, md]) => new Function(`${snippet}\nreturn uslidesLink;`)()(md) as Promise<string>,
    [code!, example('plain.md')] as const,
  );
  expect(link.startsWith('https://uslides.ninetynine.systems/#z=')).toBe(true);
  // Links point at the production address, so open the same hash on the test server.
  await page.goto(`/?test${link.slice(link.indexOf('#'))}`);
  await expect(page.locator('.us-stage').first()).toContainText('Why we should adopt weekly demos');
  await expect(page.locator('.us-stage')).toHaveCount(3);
});

test('a #md= link made with encodeURIComponent opens the deck', async ({ page }) => {
  await page.goto(`/?test#md=${encodeURIComponent(example('boxes.md'))}`);
  await expect(page.locator('.us-stage').first()).toContainText('Quarterly review');
  await expect(page.locator('.us-stage')).toHaveCount(2);
});
