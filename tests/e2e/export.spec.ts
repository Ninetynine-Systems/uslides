import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const LORA_CSS = readFileSync('tests/e2e/fakes/lora.css', 'utf8');
const LORA_WOFF2 = 'tests/e2e/fakes/lora-latin-400-normal.woff2';
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const DECK = [
  '# Export Me',
  '',
  `![dot](data:image/png;base64,${TINY_PNG})`,
  '',
  '---',
  '',
  '## Second slide',
  '',
  '```html',
  '<script>alert(1)</script>',
  '```',
  '',
  '<!-- note: keep <script> here -->',
  '',
].join('\n');

const FONT_DECK = '::: box col=1-6 row=1-2 font=Lora\n# Lora offline\n:::\n';

async function openDeck(page: Page, md: string, expected = 'Export Me') {
  await page.goto(`/?test#md=${encodeURIComponent(md)}`);
  await expect(page.locator('.us-stage').first()).toContainText(expected);
}

async function download(page: Page, item: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await page.getByRole('button', { name: item }).click();
  return pending;
}

test('Download .md saves exactly the editor text', async ({ page }) => {
  await openDeck(page, DECK);
  const dl = await download(page, 'Download .md');
  expect(dl.suggestedFilename()).toBe('export-me.md');
  const text = readFileSync((await dl.path())!, 'utf8');
  expect(text).toBe(await page.evaluate(() => window.__uslides!.getSource()));
  expect(text).toBe(DECK);
});

test('the Download menu opens with the keyboard and closes with Escape', async ({ page }) => {
  await openDeck(page, DECK);
  const menu = page.getByRole('button', { name: 'Download', exact: true });
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Print / PDF' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Print / PDF' })).toHaveCount(0);
});

test('Download .html is one file that plays offline', async ({ page, browser }) => {
  await openDeck(page, DECK);
  const dl = await download(page, 'Download .html');
  expect(dl.suggestedFilename()).toBe('export-me.html');
  const path = test.info().outputPath('export-me.html');
  await dl.saveAs(path);
  const html = readFileSync(path, 'utf8');
  expect(html).not.toMatch(/<script[^>]*\ssrc=/i);
  expect(html).not.toMatch(/<link[^>]*href=/i);
  expect(html).toContain('<title>Export Me</title>');
  // The editor text did not change.
  expect(await page.evaluate(() => window.__uslides!.getSource())).toBe(DECK);

  const context = await browser.newContext();
  await context.route(/^https?:/, (r) => r.abort());
  const player = await context.newPage();
  const errors: string[] = [];
  player.on('pageerror', (e) => errors.push(e.message));
  await player.goto(`file://${path}`);
  const stage = player.locator('.us-stage');
  await expect(stage).toHaveCount(1);
  await expect(stage).toContainText('Export Me');
  await expect(stage.locator('img')).toHaveCount(1);
  expect(await stage.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1);

  await player.keyboard.press('ArrowRight');
  await expect(stage).toContainText('Second slide');
  // The source went in and came out exactly, including the closing script tag in the code block.
  await expect(stage.locator('pre code')).toHaveText('<script>alert(1)</script>\n');
  await player.keyboard.press('Home');
  await expect(stage).toContainText('Export Me');
  await player.keyboard.press('End');
  await expect(stage).toContainText('Second slide');
  await player.keyboard.press('ArrowLeft');
  await expect(stage).toContainText('Export Me');
  await player.mouse.click(300, 300);
  await expect(stage).toContainText('Second slide');
  expect(errors).toEqual([]);
  await context.close();
});

test('Download .html embeds Lora for offline use', async ({ page, browser }) => {
  const requests = { css: 0, font: 0 };
  await page.route('https://fonts.googleapis.com/**', (route) => {
    requests.css += 1;
    return route.fulfill({
      status: 200,
      contentType: 'text/css',
      headers: { 'access-control-allow-origin': '*' },
      body: LORA_CSS,
    });
  });
  await page.route('https://fonts.gstatic.com/**', (route) => {
    requests.font += 1;
    return route.fulfill({
      status: 200,
      contentType: 'font/woff2',
      headers: { 'access-control-allow-origin': '*' },
      path: LORA_WOFF2,
    });
  });
  await openDeck(page, FONT_DECK, 'Lora offline');
  const blocked = page.getByRole('complementary', { name: 'Other websites blocked' });
  await expect(blocked).toBeVisible();
  expect(requests).toEqual({ css: 0, font: 0 });

  const dl = await download(page, 'Download .html');
  const path = test.info().outputPath('font-export.html');
  await dl.saveAs(path);
  expect(requests).toEqual({ css: 1, font: 1 });
  await expect(blocked).toBeVisible();

  const context = await browser.newContext();
  await context.route(/^https?:/, (route) => route.abort());
  const player = await context.newPage();
  await player.goto(`file://${path}`);
  await expect(player.locator('.us-box')).toContainText('Lora offline');
  await expect.poll(() => player.evaluate(() => document.fonts.check('16px Lora'))).toBe(true);
  await context.close();
});

test('Download .html names a font that could not be embedded', async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 503, body: '' }));
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
  await openDeck(page, FONT_DECK, 'Lora offline');

  await download(page, 'Download .html');

  await expect(page.getByText(
    'Could not embed this font: Lora. The file uses the theme font instead.',
  )).toBeVisible();
});

test('Print / PDF lays out one page per slide', async ({ page }) => {
  await openDeck(page, DECK);
  // Stand in for the print dialog; the laid-out pages stay in the document until "afterprint".
  await page.evaluate(() => {
    (window as unknown as { __printCalls: number }).__printCalls = 0;
    window.print = () => {
      (window as unknown as { __printCalls: number }).__printCalls++;
    };
  });
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await page.getByRole('button', { name: 'Print / PDF' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls)).toBe(1);

  await page.emulateMedia({ media: 'print' });
  const stages = page.locator('.us-print .us-stage');
  await expect(stages).toHaveCount(2);
  for (const stage of await stages.all()) {
    await expect(stage).toHaveCSS('break-after', 'page');
  }
  await expect(page.locator('#root')).toBeHidden();
  const pageRule = await page.evaluate(() =>
    [...document.querySelectorAll('style')].map((s) => s.textContent).find((t) => t?.includes('@page')),
  );
  expect(pageRule).toBe('@page { size: 1920px 1080px; margin: 0 }');

  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('.us-print')).toHaveCount(0);
});
