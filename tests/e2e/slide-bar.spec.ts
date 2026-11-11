import { expect, test, type Page } from '@playwright/test';

const DECK = '# One\n\nPlain slide\n\n---\n\n# Two\n\n::: box col=1-6 row=2-6 bg=#dbeafe\nBox\n:::\n\n---\n\n# Three\n';
const getSource = (page: Page) => page.evaluate(() => window.__uslides!.getSource());
const titles = async (page: Page) => (await getSource(page)).match(/^# \w+/gm)?.join(' ');

async function openDeck(page: Page) {
  await page.goto(`/?test#md=${encodeURIComponent(DECK)}`);
  await expect(page.locator('.slide-frame .us-stage')).toHaveCount(3);
  await expect(page.getByRole('textbox', { name: 'Deck source' })).toBeVisible();
}

/** Clicks blank space low on a slide, away from its title and boxes. */
async function clickSlide(page: Page, index: number) {
  await page.locator('.slide-frame').nth(index).scrollIntoViewIfNeeded();
  const frame = await page.locator('.slide-frame').nth(index).boundingBox();
  if (!frame) throw new Error('The slide is not visible');
  await page.mouse.click(frame.x + frame.width * 0.75, frame.y + frame.height * 0.8);
}

test('a click on blank space selects the slide and shows its bar; a box click shows the box bar instead', async ({ page }) => {
  await openDeck(page);
  await clickSlide(page, 0);
  const bar = page.getByRole('toolbar', { name: 'Slide 1' });
  await expect(bar).toBeVisible();
  await expect(page.locator('.slide-card').first()).toHaveClass(/slide-selected/);

  await page.keyboard.press('Escape');
  await expect(bar).toHaveCount(0);

  await clickSlide(page, 0);
  await expect(bar).toBeVisible();
  await page.locator('.us-box[data-box="0"]').click();
  await expect(bar).toHaveCount(0);
  await expect(page.locator('.us-floating-bar').getByRole('button', { name: 'Fill colour' })).toBeVisible();
});

test('the slide bar sets the background, and changing it back removes the settings line', async ({ page }) => {
  await openDeck(page);
  await clickSlide(page, 0);
  await page.getByRole('button', { name: 'Background colour' }).click();
  await page.getByRole('button', { name: 'Indigo' }).click();
  await expect.poll(() => getSource(page)).toMatch(/^<!-- slide bg=#5b5bd6 -->\n\n# One/);

  await page.getByRole('button', { name: 'Background colour' }).click();
  await page.getByRole('button', { name: 'None' }).click();
  await expect.poll(() => getSource(page)).toBe(DECK);
});

test('a finer grid keeps the boxes in place', async ({ page }) => {
  await openDeck(page);
  await clickSlide(page, 1);
  await page.getByRole('button', { name: 'Grid' }).click();
  await page.getByRole('menuitemradio', { name: 'Finer grid (24 × 12)' }).click();
  await expect.poll(() => getSource(page)).toContain('<!-- slide grid=24x12 -->\n\n# Two\n\n::: box col=1-12 row=3-12');
});

test('slides move, copy and delete from the bar, the selection follows, and each is one undo step', async ({ page }) => {
  await openDeck(page);
  await clickSlide(page, 0);
  await expect(page.getByRole('button', { name: 'Move slide up' })).toBeDisabled();

  await page.getByRole('button', { name: 'Move slide down' }).click();
  await expect.poll(() => titles(page)).toBe('# Two # One # Three');
  await expect(page.getByRole('toolbar', { name: 'Slide 2' })).toBeVisible();

  await page.getByRole('button', { name: 'Duplicate slide' }).click();
  await expect.poll(() => titles(page)).toBe('# Two # One # One # Three');
  await expect(page.getByRole('toolbar', { name: 'Slide 3' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete slide' }).click();
  await expect.poll(() => titles(page)).toBe('# Two # One # Three');
  await expect(page.locator('.slide-card')).toHaveCount(3);

  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => titles(page)).toBe('# Two # One # One # Three');
});

test('the slide bar works with the text editor hidden', async ({ page }) => {
  await openDeck(page);
  await page.getByRole('button', { name: 'Hide text editor' }).click();
  await clickSlide(page, 2);
  await page.getByRole('button', { name: 'Move slide up' }).click();
  await expect.poll(() => titles(page)).toBe('# One # Three # Two');
});
