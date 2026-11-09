import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

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

async function openDeck(page: Page, md: string) {
  await page.goto(`/?test#md=${encodeURIComponent(md)}`);
  await expect(page.locator('.us-stage').first()).toContainText('Export Me');
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
