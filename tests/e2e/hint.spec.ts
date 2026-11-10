import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const SAMPLE = readFileSync('src/app/sample.md', 'utf8');
const HINT_KEY = 'uslides.hint.drawBox.done';
const HINT_TEXT = 'Drag on the slide to draw a box. Double-click text to edit it.';
const editor = (page: Page) => page.getByRole('textbox', { name: 'Deck source' });
const getSource = (page: Page) => page.evaluate(() => window.__uslides!.getSource());

async function openSample(page: Page): Promise<void> {
  await page.goto(`/?test#md=${encodeURIComponent(SAMPLE)}`);
  await expect(page.locator('.slide-card')).toHaveCount(4);
  await expect(editor(page)).toBeVisible();
}

async function dragAcrossHint(page: Page): Promise<void> {
  const bounds = await page.locator('.us-hint').boundingBox();
  if (!bounds) throw new Error('The hint is not visible');
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(bounds.x + bounds.width * 0.2, y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.8, y, { steps: 8 });
  await page.mouse.up();
}

test('the hint shows only on the shown slide when it has no boxes', async ({ page }) => {
  await openSample(page);

  const hint = page.locator('.us-hint');
  await expect(hint).toHaveCount(1);
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText(HINT_TEXT);

  const thirdSlide = page.locator('.slide-card').nth(2);
  await expect(thirdSlide.locator('.us-box')).toHaveCount(2);
  await thirdSlide.locator('.us-box').first().click();
  await expect(hint).toHaveCount(0);
});

test('dragging through the hint draws a box and hides it for good', async ({ page }) => {
  await openSample(page);
  await expect(page.locator('.us-hint')).toBeVisible();

  await dragAcrossHint(page);

  await expect.poll(async () => (await getSource(page)).match(/^::: box\b/gm)?.length ?? 0).toBe(3);
  await expect(page.locator('.us-hint')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.slide-card')).toHaveCount(4);
  await expect(page.locator('.us-hint')).toHaveCount(0);
});

test('Add box hides the hint for good', async ({ page }) => {
  await openSample(page);
  await expect(page.locator('.us-hint')).toBeVisible();

  await page.getByRole('button', { name: 'Add box', exact: true }).click();

  await expect(page.locator('.us-hint')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.slide-card')).toHaveCount(4);
  await expect(page.locator('.us-hint')).toHaveCount(0);
});

test('the hint is absent from present mode and downloads', async ({ page }) => {
  await openSample(page);
  await expect(page.locator('.us-hint')).toBeVisible();

  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await expect(page.locator('.present')).toBeVisible();
  await expect(page.locator('.present .us-hint')).toHaveCount(0);
  await expect(page.locator('.us-hint')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.present')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await page.getByRole('button', { name: 'Download .html', exact: true }).click();
  const download = await pending;
  const html = readFileSync((await download.path())!, 'utf8');
  expect(html).not.toContain(HINT_TEXT);
  expect(html).not.toContain('us-hint');
});

test('the hint is absent from narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto(`/?test#md=${encodeURIComponent(SAMPLE)}`);
  await expect(page.locator('.slide-card')).toHaveCount(4);
  await expect(page.locator('.us-hint')).toHaveCount(0);
});

test('storage errors do not stop the hint or drawing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((key) => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (name: string): string | null {
      if (name === key) throw new Error('denied');
      return getItem.call(this, name);
    };
    Storage.prototype.setItem = function (name: string, value: string): void {
      if (name === key) throw new Error('denied');
      setItem.call(this, name, value);
    };
  }, HINT_KEY);
  await openSample(page);
  await expect(page.locator('.us-hint')).toBeVisible();

  await dragAcrossHint(page);

  await expect.poll(async () => (await getSource(page)).match(/^::: box\b/gm)?.length ?? 0).toBe(3);
  await expect(page.locator('.us-hint')).toHaveCount(0);
  expect(errors).toEqual([]);
});
