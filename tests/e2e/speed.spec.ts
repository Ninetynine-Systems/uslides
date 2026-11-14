import { expect, test } from '@playwright/test';
import { TINY_PNG, getSource, pasteImage, toEnd } from './helpers/images';

// These tests time the app with a stopwatch, so other tests running at the same moment make them
// fail by chance. playwright.config.ts runs this file on its own, after every other test is done.

// The measured cost is about 0.85 s on a quiet machine, and up to 2.5 s on a busy one. The limit
// leaves room for that. It still fails if the 3 MB image cost becomes several times slower.
const TYPING_LIMIT_MS = 5000;

test('typing stays fast with a 3 MB image in the deck, and the chip stays folded', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await toEnd(page);
  await pasteImage(page, TINY_PNG, 'image/png', 3 * 1024 * 1024);
  await expect(page.locator('.cm-image-chip')).toHaveText(/3\d{3} KB/);
  await expect(page.locator('.us-stage img[src^="data:image/png"]')).toHaveCount(1);
  await toEnd(page);
  await page.keyboard.press('Enter');
  const started = Date.now();
  await page.keyboard.type('x'.repeat(50));
  await expect.poll(() => getSource(page).then((s) => s.endsWith('x'.repeat(50)))).toBe(true);
  const ms = Date.now() - started;
  console.log(`typing 50 chars with a 3 MB image took ${ms} ms`);
  // Measured about 840 ms on the dev machine, where 42 ms is the cost of the same typing without the image.
  // The target is under 1 s; the limit here has headroom so a slow machine does not fail it by chance.
  // On a busy dev machine this took 1.6 to 1.7 s, also without the changes of the final fix pass.
  expect(ms).toBeLessThan(TYPING_LIMIT_MS);
  await expect(page.locator('.cm-image-chip')).toHaveCount(1);
});

test('typing 50 characters in a box stays fast with a 3 MB image in the deck', async ({ page }) => {
  const source = '::: box col=1-6 row=1-3\nx\n:::\n';
  await page.goto(`/?test#md=${encodeURIComponent(source)}`);
  await expect(page.locator('.slide-frame .us-stage')).toHaveCount(1);
  await toEnd(page);
  await pasteImage(page, TINY_PNG, 'image/png', 3 * 1024 * 1024);
  await expect(page.locator('.cm-image-chip')).toHaveText(/3\d{3} KB/);
  await expect(page.locator('.us-stage img[src^="data:image/png"]')).toHaveCount(1);

  await page.locator('.us-box[data-box="0"]').getByText('x', { exact: true }).dblclick();
  const area = page.getByRole('textbox', { name: 'Markdown on slide' });
  await expect(area).toBeFocused();
  await page.keyboard.press('ControlOrMeta+End');
  await expect(area).toBeFocused();
  const inserted = 'x'.repeat(50);
  const started = Date.now();
  await page.keyboard.type(inserted);
  await expect.poll(() => getSource(page).then((text) => text.includes(`\nx${inserted}\n:::`))).toBe(true);
  const ms = Date.now() - started;

  console.log(`typing 50 chars in a box with a 3 MB image took ${ms} ms`);
  expect(ms).toBeLessThan(TYPING_LIMIT_MS);
});

test('typing after a leading blank line stays fast with a 3 MB image in the deck', async ({ page }) => {
  const source = '::: box col=1-6 row=1-3\nx\n:::\n';
  await page.goto(`/?test#md=${encodeURIComponent(source)}`);
  await expect(page.locator('.slide-frame .us-stage')).toHaveCount(1);
  await toEnd(page);
  await pasteImage(page, TINY_PNG, 'image/png', 3 * 1024 * 1024);
  await expect(page.locator('.cm-image-chip')).toHaveText(/3\d{3} KB/);
  await expect(page.locator('.us-stage img[src^="data:image/png"]')).toHaveCount(1);

  await page.locator('.us-box[data-box="0"]').getByText('x', { exact: true }).dblclick();
  const area = page.getByRole('textbox', { name: 'Markdown on slide' });
  await expect(area).toBeFocused();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('Enter');
  const inserted = 'z'.repeat(50);
  const started = Date.now();
  await page.keyboard.type(inserted);
  await expect.poll(() => getSource(page).then((text) => text.includes(`\n\n${inserted}x\n:::`))).toBe(true);
  const ms = Date.now() - started;

  console.log(`typing 50 chars after a leading blank line with a 3 MB image took ${ms} ms`);
  expect(ms).toBeLessThan(TYPING_LIMIT_MS);
});
