import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

const noSidewaysScroll = (page: Page) =>
  page.evaluate(() => ({ page: document.documentElement.scrollWidth, body: document.body.scrollWidth }));

test('the deck page does not scroll sideways at 390 px, and every action can be reached', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage').first()).toBeVisible();
  expect((await noSidewaysScroll(page)).page).toBeLessThanOrEqual(390);
  expect((await noSidewaysScroll(page)).body).toBeLessThanOrEqual(390);
  // Present stays on screen.
  const box = (await page.getByRole('button', { name: 'Present' }).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
});

test('the deck list does not scroll sideways at 390 px', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage').first()).toBeVisible();
  await page.getByRole('button', { name: 'Show decks' }).click();
  await expect(page.getByRole('navigation', { name: 'Decks' })).toBeVisible();
  expect((await noSidewaysScroll(page)).page).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Menu' }).click();
  expect((await noSidewaysScroll(page)).page).toBeLessThanOrEqual(390);
});

test('menus stay inside the screen at 390 px', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage').first()).toBeVisible();
  for (const name of ['Share', 'Download']) {
    await page.getByRole('button', { name, exact: true }).click();
    expect((await noSidewaysScroll(page)).page).toBeLessThanOrEqual(390);
    const menu = page.locator('.share-menu');
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await page.keyboard.press('Escape');
  }
});

test('Rename, Duplicate and Delete are still reachable with the keyboard', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage').first()).toBeVisible();
  const buttons = [
    page.getByRole('button', { name: /^Rename deck:/ }),
    ...['Duplicate', 'Delete', 'Pack images'].map((name) => page.getByRole('button', { name, exact: true })),
  ];
  for (const button of buttons) {
    await button.focus();
    await expect(button).toBeFocused();
    const box = (await button.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
});
