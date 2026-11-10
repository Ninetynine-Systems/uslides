import { expect, test, type Page } from '@playwright/test';
import { openBoxDeck, selectBox } from './helpers/app';

const toolbar = (page: Page) => page.locator('header.toolbar');
const popupButton = (page: Page, name: string) => toolbar(page).getByRole('button', { name, exact: true });
const fontPicker = (page: Page) => page.getByRole('dialog', { name: 'Font picker' });

async function routeFonts(page: Page) {
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/css',
    headers: { 'access-control-allow-origin': '*' },
    body: '',
  }));
}

async function openApp(page: Page) {
  await routeFonts(page);
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
}

test('opening Share then More leaves only More open', async ({ page }) => {
  await openApp(page);

  await popupButton(page, 'Share').click();
  await expect(page.getByRole('button', { name: 'Copy link', exact: true })).toBeVisible();
  await popupButton(page, 'More').click();

  await expect(page.getByRole('button', { name: 'Copy link', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open file', exact: true })).toBeVisible();
});

test('opening Download then Deck font leaves only the font picker open', async ({ page }) => {
  await openApp(page);

  await popupButton(page, 'Download').click();
  await expect(page.getByRole('button', { name: 'Download .md', exact: true })).toBeVisible();
  await popupButton(page, 'Deck font').click();

  await expect(page.getByRole('button', { name: 'Download .md', exact: true })).toHaveCount(0);
  await expect(fontPicker(page)).toBeVisible();
});

test('opening Text colour closes Fill colour', async ({ page }) => {
  await routeFonts(page);
  await openBoxDeck(page);
  await selectBox(page);

  await page.getByRole('button', { name: 'Fill colour' }).click();
  await expect(page.getByRole('menu', { name: 'Fill colour' })).toBeVisible();
  await page.getByRole('button', { name: 'Text colour' }).click();

  await expect(page.getByRole('menu', { name: 'Fill colour' })).toHaveCount(0);
  await expect(page.getByRole('menu', { name: 'Text colour' })).toBeVisible();
});

test('opening box Font closes Fill colour', async ({ page }) => {
  await routeFonts(page);
  await openBoxDeck(page);
  await selectBox(page);

  await page.getByRole('button', { name: 'Fill colour' }).click();
  await page.locator('.us-floating-bar').getByRole('button', { name: 'Font', exact: true }).click();

  await expect(page.getByRole('menu', { name: 'Fill colour' })).toHaveCount(0);
  await expect(fontPicker(page)).toBeVisible();
});

test('opening More closes box Font and its items still work', async ({ page }) => {
  await routeFonts(page);
  await openBoxDeck(page);
  await selectBox(page);
  await page.locator('.us-floating-bar').getByRole('button', { name: 'Font', exact: true }).click();
  await expect(fontPicker(page)).toBeVisible();

  await popupButton(page, 'More').click();
  await expect(fontPicker(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Duplicate deck', exact: true }).click();

  await expect(page.getByRole('navigation', { name: 'Decks' }).getByRole('listitem')).toHaveCount(2);
});

test('an outside press closes a colour menu without changing the selected box', async ({ page }) => {
  await routeFonts(page);
  await openBoxDeck(page);
  await selectBox(page);
  await page.getByRole('button', { name: 'Fill colour' }).click();

  await page.getByRole('textbox', { name: 'Deck source' }).click();

  await expect(page.getByRole('menu', { name: 'Fill colour' })).toHaveCount(0);
  await expect(page.locator('.us-selection[data-box="0"]')).toBeVisible();
});

test('typing inside box Font keeps it open and an outside press closes it', async ({ page }) => {
  await routeFonts(page);
  await openBoxDeck(page);
  await selectBox(page);
  await page.locator('.us-floating-bar').getByRole('button', { name: 'Font', exact: true }).click();
  const picker = fontPicker(page);

  await picker.getByRole('combobox', { name: 'Search fonts' }).fill('Lora');
  await expect(picker).toBeVisible();
  await page.getByRole('textbox', { name: 'Deck source' }).click();

  await expect(picker).toHaveCount(0);
  await expect(page.locator('.us-selection[data-box="0"]')).toBeVisible();
});

test('opening More closes the deck list Menu', async ({ page }) => {
  await openApp(page);
  await page.getByRole('navigation', { name: 'Decks' }).getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back up all decks' })).toBeVisible();

  await popupButton(page, 'More').click();

  await expect(page.getByRole('button', { name: 'Back up all decks' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open file', exact: true })).toBeVisible();
});

test('Escape closes toolbar, deck, colour, and font popups', async ({ page }) => {
  await openApp(page);
  for (const [trigger, item] of [
    ['Share', 'Copy link'],
    ['Download', 'Download .md'],
    ['More', 'Open file'],
  ] as const) {
    await popupButton(page, trigger).click();
    await expect(page.getByRole('button', { name: item, exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: item, exact: true })).toHaveCount(0);
  }

  await popupButton(page, 'Deck font').click();
  await page.keyboard.press('Escape');
  await expect(fontPicker(page)).toHaveCount(0);

  const deckMenu = page.getByRole('navigation', { name: 'Decks' }).getByRole('button', { name: 'Menu', exact: true });
  await deckMenu.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Back up all decks' })).toHaveCount(0);

  await openBoxDeck(page);
  await selectBox(page);
  await page.getByRole('button', { name: 'Fill colour' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Fill colour' })).toHaveCount(0);
  await page.locator('.us-floating-bar').getByRole('button', { name: 'Font', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(fontPicker(page)).toHaveCount(0);
});
