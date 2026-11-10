import { expect, test } from '@playwright/test';
import { renameDeck } from './helpers/app';

const originalName = 'Welcome to uslides';
const toolbarName = (page: Parameters<typeof renameDeck>[0]) => page.locator('h1.toolbar-name');
const deckList = (page: Parameters<typeof renameDeck>[0]) => page.getByRole('navigation', { name: 'Decks' });

test.beforeEach(async ({ page }) => {
  page.on('dialog', (dialog) => {
    void dialog.dismiss();
    throw new Error(`Unexpected browser dialog: ${dialog.message()}`);
  });
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
});

test('renames a deck and keeps the name after reload', async ({ page }) => {
  await renameDeck(page, 'Quarterly plan');

  await expect(toolbarName(page)).toHaveText('Quarterly plan');
  await expect(deckList(page)).toContainText('Quarterly plan');

  await page.reload();
  await expect(toolbarName(page)).toHaveText('Quarterly plan');
  await expect(deckList(page)).toContainText('Quarterly plan');
});

test('Escape cancels a rename', async ({ page }) => {
  await page.getByRole('button', { name: `Rename deck: ${originalName}` }).click();
  await page.keyboard.type('X');
  await page.keyboard.press('Escape');

  await expect(toolbarName(page)).toHaveText(originalName);
  await expect(deckList(page)).toContainText(originalName);
});

test('a name containing only spaces changes nothing', async ({ page }) => {
  await page.getByRole('button', { name: `Rename deck: ${originalName}` }).click();
  const input = page.getByRole('textbox', { name: 'Deck name' });
  await input.fill('   ');
  await input.press('Enter');

  await expect(toolbarName(page)).toHaveText(originalName);
  await expect(deckList(page)).toContainText(originalName);
});

test('leaving the field for Present saves before presenting', async ({ page }) => {
  await page.getByRole('button', { name: `Rename deck: ${originalName}` }).click();
  await page.keyboard.type('Saved by blur');
  await page.getByRole('button', { name: 'Present' }).click();

  await expect(toolbarName(page)).toHaveText('Saved by blur');
  await expect(page.locator('.present')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.present')).toHaveCount(0);
});

test('F2 opens the field with the whole name selected', async ({ page }) => {
  const nameButton = page.getByRole('button', { name: `Rename deck: ${originalName}` });
  await nameButton.focus();
  await expect(nameButton).toBeFocused();
  await page.keyboard.press('F2');

  const input = page.getByRole('textbox', { name: 'Deck name' });
  await expect(input).toBeFocused();
  await page.keyboard.type('X');
  await expect(input).toHaveValue('X');
});
