import { expect, test, type Page } from '@playwright/test';

const toolbar = (page: Page) => page.locator('header.toolbar');
const preview = (page: Page) => page.locator('.slide-frame').first();

test.beforeEach(async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
});

test('the toolbar keeps common actions visible and moves deck actions into More', async ({ page }) => {
  for (const name of ['Deck font', 'Download', 'Share', 'Present', 'More']) {
    await expect(toolbar(page).getByRole('button', { name, exact: true })).toBeVisible();
  }

  for (const name of ['Open', 'Open folder', 'Pack images', 'Duplicate', 'Delete']) {
    await expect(toolbar(page).getByRole('button', { name, exact: true })).toHaveCount(0);
  }
});

test('Share and Present show text on wide screens and keep accessible names on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  for (const name of ['Share', 'Present']) {
    const button = toolbar(page).getByRole('button', { name, exact: true });
    await expect(button.getByText(name, { exact: true })).toBeVisible();
  }

  await page.setViewportSize({ width: 600, height: 720 });
  for (const name of ['Share', 'Present']) {
    const button = toolbar(page).getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    await expect(button.getByText(name, { exact: true })).toBeHidden();
  }
});

test('More shows its actions in order with Delete separated', async ({ page }) => {
  await toolbar(page).getByRole('button', { name: 'More', exact: true }).click();
  const menu = page.locator('.share-menu');

  await expect(menu.getByRole('button')).toHaveText([
    'Open file',
    'Open folder',
    'Pack images',
    'Duplicate deck',
    'Delete deck',
  ]);
  await expect(menu.locator('hr')).toHaveCount(1);
});

test('More closes on Escape, an outside click, and after duplicating a deck', async ({ page }) => {
  const more = toolbar(page).getByRole('button', { name: 'More', exact: true });
  const openFile = page.getByRole('button', { name: 'Open file', exact: true });

  await more.click();
  await expect(openFile).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(openFile).toHaveCount(0);
  await expect(more).toBeFocused();

  await more.click();
  await preview(page).click();
  await expect(openFile).toHaveCount(0);

  const decks = page.getByRole('navigation', { name: 'Decks' }).getByRole('listitem');
  await more.click();
  await page.getByRole('button', { name: 'Duplicate deck', exact: true }).click();
  await expect(openFile).toHaveCount(0);
  await expect(decks).toHaveCount(2);
});

test('Share and Download close on a click in the preview', async ({ page }) => {
  await toolbar(page).getByRole('button', { name: 'Share', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copy link', exact: true })).toBeVisible();
  await preview(page).click();
  await expect(page.getByRole('button', { name: 'Copy link', exact: true })).toHaveCount(0);

  await toolbar(page).getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download .md', exact: true })).toBeVisible();
  await preview(page).click();
  await expect(page.getByRole('button', { name: 'Download .md', exact: true })).toHaveCount(0);
});
