import { expect, test, type Page } from '@playwright/test';

const DECK = '# Slide 1\n---\n# Slide 2\n---\n# Slide 3\n';
const editor = (page: Page) => page.getByRole('textbox', { name: 'Deck source' });

async function openDeck(page: Page) {
  await page.goto(`/?test#md=${encodeURIComponent(DECK)}`);
  await expect(page.locator('.slide-frame')).toHaveCount(3);
  await expect(editor(page)).toBeVisible();
}

test('the view switch shows one large slide and remembers it', async ({ page }) => {
  await openDeck(page);

  await page.getByRole('button', { name: 'One slide' }).click();
  await expect(page.locator('.one-slide .slide-frame')).toHaveCount(1);

  await page.reload();
  await expect(page.locator('.one-slide .slide-frame')).toHaveCount(1);
});

test('moving the cursor to slide 3 shows slide 3', async ({ page }) => {
  await openDeck(page);
  await page.getByRole('button', { name: 'One slide' }).click();

  await editor(page).locator('.cm-line').filter({ hasText: '# Slide 3' }).click();

  await expect(page.getByText('3 / 3', { exact: true })).toBeVisible();
});

test('Next moves the editor cursor to the start of the next slide', async ({ page }) => {
  await openDeck(page);
  await page.getByRole('button', { name: 'One slide' }).click();

  await page.getByRole('button', { name: 'Next slide' }).click();
  await page.keyboard.insertText('@');

  await expect.poll(() => page.evaluate(() => window.__uslides!.getSource()))
    .toBe('# Slide 1\n---\n@# Slide 2\n---\n# Slide 3\n');
});
