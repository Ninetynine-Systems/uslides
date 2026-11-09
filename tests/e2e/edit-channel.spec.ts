import { expect, test, type Page } from '@playwright/test';

const editor = (page: Page) => page.getByRole('textbox', { name: 'Deck source' });
const getSource = (page: Page) => page.evaluate(() => window.__uslides!.getSource());

async function openWithEditHook(page: Page) {
  await page.addInitScript(() => localStorage.setItem('uslides.e2e', '1'));
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await page.getByRole('button', { name: 'New deck' }).click();
  await expect.poll(() => getSource(page)).toBe('# Untitled\n');
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
}

test('an edit right after typing uses the fresh parse', async ({ page }) => {
  await openWithEditHook(page);

  await page.keyboard.insertText('::: box col=1\nA\n:::\n');
  await page.evaluate(() => window.__uslidesEdit!('bg', 'red'));

  await expect.poll(() => getSource(page)).toContain('::: box col=1 bg=red');
});

test('one mouse edit is one undo step', async ({ page }) => {
  await openWithEditHook(page);
  await page.keyboard.insertText('::: box col=1\nA\n:::\n');
  await expect.poll(() => getSource(page)).toContain('::: box col=1');

  await page.evaluate(() => window.__uslidesEdit!('bg', 'red'));
  await expect.poll(() => getSource(page)).toContain('bg=red');
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+z');

  await expect.poll(() => getSource(page)).not.toContain('bg=red');
  expect(await getSource(page)).toContain('::: box col=1');
});
