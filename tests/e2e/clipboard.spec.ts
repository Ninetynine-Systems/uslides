import { expect, test, type Page } from '@playwright/test';

const DECK = '# One\n\n::: box col=1-4 row=2-3 bg=#ffd43b\nCopy me\n:::\n\n---\n\n# Two\n';
const getSource = (page: Page) => page.evaluate(() => window.__uslides!.getSource());

async function openDeck(page: Page) {
  await page.goto(`/?test#md=${encodeURIComponent(DECK)}`);
  await expect(page.locator('.slide-frame .us-stage')).toHaveCount(2);
  await expect(page.getByRole('textbox', { name: 'Deck source' })).toBeVisible();
}

async function clickBox(page: Page, slide: number, index: number) {
  const rect = await page.locator('.slide-frame').nth(slide).locator(`.us-box[data-box="${index}"]`).boundingBox();
  if (!rect) throw new Error('The box is not visible');
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
}

/** Clicks blank space low on a slide, away from its title and boxes. */
async function clickSlide(page: Page, index: number) {
  await page.locator('.slide-frame').nth(index).scrollIntoViewIfNeeded();
  const frame = await page.locator('.slide-frame').nth(index).boundingBox();
  if (!frame) throw new Error('The slide is not visible');
  await page.mouse.click(frame.x + frame.width * 0.75, frame.y + frame.height * 0.8);
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test('a copied box pastes on the same slide next to the original, and on another slide in its place', async ({ page }) => {
  await openDeck(page);
  await clickBox(page, 0, 0);
  await page.keyboard.press('ControlOrMeta+c');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('::: box col=1-4 row=2-3 bg=#ffd43b\nCopy me\n:::\n');

  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => getSource(page)).toContain(':::\n\n::: box col=2-5 row=3-4 bg=#ffd43b\nCopy me\n:::\n\n---');
  await expect(page.locator('.us-selection[data-box="1"]')).toBeVisible();

  await clickSlide(page, 1);
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => getSource(page)).toMatch(/# Two\n\n::: box col=1-4 row=2-3 bg=#ffd43b\nCopy me\n:::\n$/);
  await expect(page.locator('.slide-frame').nth(1).locator('.us-box')).toHaveCount(1);
});

test('cut removes the box, and plain text pastes into the text as before, not as a box', async ({ page }) => {
  await openDeck(page);
  await clickBox(page, 0, 0);
  await page.keyboard.press('ControlOrMeta+x');
  await expect.poll(() => getSource(page)).not.toContain('Copy me');

  await page.evaluate(() => navigator.clipboard.writeText('just words'));
  await clickSlide(page, 0);
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => getSource(page)).toContain('just words');
  expect(await getSource(page)).not.toContain('::: box');
});

test('clicking into the text editor ends the slide selection, so a box pastes there as text', async ({ page }) => {
  await openDeck(page);
  await clickBox(page, 0, 0);
  await page.keyboard.press('ControlOrMeta+c');
  await clickSlide(page, 1);
  await expect(page.getByRole('toolbar', { name: 'Slide 2' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Deck source' }).click();
  await expect(page.getByRole('toolbar', { name: 'Slide 2' })).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => getSource(page)).toMatch(/# Two\n::: box col=1-4 row=2-3 bg=#ffd43b\nCopy me\n:::\n$/);
});

test('the undo and redo buttons undo a change made on a slide', async ({ page }) => {
  await openDeck(page);
  const undo = page.getByRole('button', { name: /^Undo/ });
  const redo = page.getByRole('button', { name: /^Redo/ });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  await clickBox(page, 0, 0);
  await page.keyboard.press('Delete');
  await expect.poll(() => getSource(page)).not.toContain('Copy me');

  await undo.click();
  await expect.poll(() => getSource(page)).toBe(DECK);
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect.poll(() => getSource(page)).not.toContain('Copy me');
});
