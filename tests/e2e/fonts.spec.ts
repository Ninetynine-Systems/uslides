import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const CSS = readFileSync('tests/e2e/fakes/lora.css', 'utf8');
const WOFF2 = 'tests/e2e/fakes/lora-latin-400-normal.woff2';
const FONT_DECK = '::: box col=1-3 row=1 font=Lora\nMMMMMMMMMMMMMMMMMMMM\n:::\n';

async function replaceSource(page: Page, source: string) {
  const editor = page.getByRole('textbox', { name: 'Deck source' });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(source);
  await expect(page.locator('.us-box')).toHaveCount(1);
}

async function openAllowedDeck(page: Page) {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await replaceSource(page, FONT_DECK);
}

async function routeFontCss(page: Page, counts: { css: number; font: number }) {
  await page.route('https://fonts.googleapis.com/**', (route) => {
    counts.css += 1;
    return route.fulfill({
      status: 200,
      contentType: 'text/css',
      headers: { 'access-control-allow-origin': '*' },
      body: CSS,
    });
  });
}

test('a box font loads and the box is refitted', async ({ page }) => {
  const counts = { css: 0, font: 0 };
  let releaseFont: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    releaseFont = resolve;
  });
  let sawFontRequest: () => void = () => undefined;
  const requested = new Promise<void>((resolve) => {
    sawFontRequest = resolve;
  });
  await routeFontCss(page, counts);
  await page.route('https://fonts.gstatic.com/**', async (route) => {
    counts.font += 1;
    sawFontRequest();
    await held;
    await route.fulfill({
      status: 200,
      contentType: 'font/woff2',
      headers: { 'access-control-allow-origin': '*' },
      path: WOFF2,
    });
  });

  await openAllowedDeck(page);
  await expect(page.locator('link[data-uslides-font="Lora"]')).toHaveCount(1);
  await requested;
  const box = page.locator('.slide-card .us-box').first();
  await box.evaluate((element: HTMLElement) => element.style.setProperty('--us-scale', '0.13'));

  releaseFont();
  await expect.poll(() => page.evaluate(() => document.fonts.check('16px "Lora"'))).toBe(true);
  await expect.poll(() => box.evaluate((element: HTMLElement) => element.style.getPropertyValue('--us-scale')))
    .not.toBe('0.13');
  expect(counts).toEqual({ css: 1, font: 1 });
});

test('a blocked deck asks for no font and shows the theme font', async ({ page }) => {
  const counts = { css: 0, font: 0 };
  await routeFontCss(page, counts);
  await page.route('https://fonts.gstatic.com/**', (route) => {
    counts.font += 1;
    return route.fulfill({ status: 200, contentType: 'font/woff2', path: WOFF2 });
  });

  await page.goto(`/?test#md=${encodeURIComponent(FONT_DECK)}`);
  const box = page.locator('.slide-card .us-box').first();
  await expect(box).toBeVisible();
  await expect(page.getByText(
    'This deck wants to load images and fonts from 2 other websites. They are blocked until you allow them.',
  )).toBeVisible();
  await expect(page.locator('link[data-uslides-font]')).toHaveCount(0);
  // The slide is drawn again once the deck is known to be blocked, so wait for that drawing.
  await expect.poll(() => page.locator('.slide-card .us-box').first().evaluate((element: HTMLElement) => element.style.fontFamily))
    .toBe('');
  const families = await box.evaluate((element: HTMLElement) => ({
    box: getComputedStyle(element).fontFamily,
    stage: getComputedStyle(element.closest('.us-stage')!).fontFamily,
  }));
  expect(families.box).toBe(families.stage);
  expect(counts).toEqual({ css: 0, font: 0 });
});

test('a shared deck loads its font when the catalog arrives after the deck', async ({ page }) => {
  const counts = { css: 0, font: 0 };
  let releaseCatalog: () => void = () => undefined;
  const heldCatalog = new Promise<void>((resolve) => {
    releaseCatalog = resolve;
  });
  let sawCatalogRequest: () => void = () => undefined;
  const catalogRequested = new Promise<void>((resolve) => {
    sawCatalogRequest = resolve;
  });
  await page.route(/\/assets\/catalog-[^/]+\.js(?:\?.*)?$/, async (route) => {
    sawCatalogRequest();
    await heldCatalog;
    await route.continue();
  });
  await routeFontCss(page, counts);
  await page.route('https://fonts.gstatic.com/**', (route) => {
    counts.font += 1;
    return route.fulfill({ status: 200, contentType: 'font/woff2', path: WOFF2 });
  });

  await page.goto(`/?test#md=${encodeURIComponent(FONT_DECK)}`);
  await catalogRequested;
  const box = page.locator('.slide-card .us-box').first();
  await expect(box).toBeVisible();
  await expect(page.locator('link[data-uslides-font]')).toHaveCount(0);

  releaseCatalog();
  await expect(page.getByRole('complementary', { name: 'Other websites blocked' })).toBeVisible();
  await expect(box).toHaveCSS('font-family', /system-ui/);
  await page.getByRole('button', { name: 'Allow once' }).click();

  await expect(page.locator('link[data-uslides-font="Lora"]')).toHaveCount(1);
  await expect.poll(() => counts.css).toBe(1);
});

test('present waits for fonts up to 3 seconds', async ({ page }) => {
  const counts = { css: 0, font: 0 };
  let sawFontRequest: () => void = () => undefined;
  const requested = new Promise<void>((resolve) => {
    sawFontRequest = resolve;
  });
  await routeFontCss(page, counts);
  await page.route('https://fonts.gstatic.com/**', async (route) => {
    counts.font += 1;
    sawFontRequest();
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await route.fulfill({
      status: 200,
      contentType: 'font/woff2',
      headers: { 'access-control-allow-origin': '*' },
      path: WOFF2,
    });
  });

  await openAllowedDeck(page);
  await requested;
  const started = Date.now();
  await page.getByRole('button', { name: 'Present' }).click();
  await expect(page.locator('.present')).toBeVisible();
  await expect(page.locator('.present .us-stage')).toHaveCount(0);
  await page.waitForTimeout(500);
  await expect(page.locator('.present .us-stage')).toHaveCount(0);
  await expect(page.locator('.present .us-stage')).toBeVisible({ timeout: 3500 });
  const elapsed = Date.now() - started;

  expect(elapsed).toBeGreaterThanOrEqual(2500);
  expect(elapsed).toBeLessThan(4000);
  expect(counts.css).toBe(1);
  expect(counts.font).toBe(1);
});
