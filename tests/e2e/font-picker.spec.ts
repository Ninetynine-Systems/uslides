import { expect, test, type Page } from '@playwright/test';

const BOX_DECK = '# Fonts\n\n::: box col=1-6 row=1-3\nChoose a font\n:::\n';
const editor = (page: Page) => page.getByRole('textbox', { name: 'Deck source' });
const getSource = (page: Page) => page.evaluate(() => window.__uslides!.getSource());

async function routeFonts(page: Page, cssRequests: string[] = []) {
  await page.route('https://fonts.googleapis.com/**', (route) => {
    cssRequests.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: 'text/css',
      headers: { 'access-control-allow-origin': '*' },
      body: '',
    });
  });
  await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'font/woff2',
    headers: { 'access-control-allow-origin': '*' },
    body: '',
  }));
}

async function replaceSource(page: Page, source = BOX_DECK) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(source);
  await expect(page.locator('.us-box')).toHaveCount(1);
}

async function openAllowedDeck(page: Page, source = BOX_DECK) {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await replaceSource(page, source);
}

async function clickBox(page: Page) {
  const rect = await page.locator('.us-box[data-box="0"]').boundingBox();
  if (!rect) throw new Error('Box 0 is not visible');
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await expect(page.locator('.us-selection[data-box="0"]')).toBeVisible();
}

async function openDeckPicker(page: Page) {
  await page.getByRole('button', { name: 'Deck font' }).click();
  const dialog = page.getByRole('dialog', { name: 'Font picker' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('searching narrows the list as you type', async ({ page }) => {
  await routeFonts(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/?test');
  await expect(page.locator('.us-stage').first()).toBeVisible();

  const dialog = await openDeckPicker(page);
  const search = dialog.getByRole('searchbox', { name: 'Search fonts' });
  const list = dialog.getByRole('listbox', { name: 'Fonts' });
  await expect(search).toBeFocused();
  const countBefore = await list.getByRole('option').count();
  await search.fill('Playfair Display');

  await expect(list.getByRole('option', { name: 'Theme font', exact: true })).toBeVisible();
  await expect(list.getByRole('option', { name: 'Playfair Display', exact: true })).toBeVisible();
  const names = await list.getByRole('option').allTextContents();
  expect(names.length).toBeLessThan(countBefore);
  expect(names.slice(1).every((name) => name.toLowerCase().includes('playfair display'))).toBe(true);
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('the style group filter shows only that group', async ({ page }) => {
  await routeFonts(page);
  await openAllowedDeck(page);
  const dialog = await openDeckPicker(page);
  const list = dialog.getByRole('listbox', { name: 'Fonts' });

  await dialog.getByRole('combobox', { name: 'Style group' }).selectOption('monospace');

  await expect(list.getByRole('option', { name: 'Roboto Mono', exact: true })).toBeVisible();
  await expect(list.getByRole('option', { name: 'Playfair Display', exact: true })).toHaveCount(0);
  const names = await list.getByRole('option').allTextContents();
  expect(names[0]).toBe('Theme font');
  expect(names.slice(1)).toEqual(expect.arrayContaining(['Roboto Mono']));
});

test('picking a font writes font="Name" and one undo removes it', async ({ page }) => {
  await routeFonts(page);
  await openAllowedDeck(page);
  await clickBox(page);
  await page.locator('.us-floating-bar').getByRole('button', { name: 'Font', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Font picker' });
  const search = dialog.getByRole('searchbox', { name: 'Search fonts' });

  await search.fill('Playfair Display');
  await search.press('ArrowDown');
  await search.press('Enter');

  await expect.poll(() => getSource(page)).toContain('font="Playfair Display"');
  await editor(page).focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => getSource(page)).toBe(BOX_DECK);
});

test('Deck font writes font: Name into the settings block', async ({ page }) => {
  await routeFonts(page);
  await openAllowedDeck(page);
  const dialog = await openDeckPicker(page);

  await dialog.getByRole('searchbox', { name: 'Search fonts' }).fill('Lora');
  await dialog.getByRole('option', { name: 'Lora', exact: true }).click();

  await expect.poll(() => getSource(page)).toBe(`---\nfont: Lora\n---\n\n${BOX_DECK}`);
});

test('each visible name loads only its own letters', async ({ page }) => {
  const cssRequests: string[] = [];
  await routeFonts(page, cssRequests);
  await openAllowedDeck(page);
  const dialog = await openDeckPicker(page);

  await expect.poll(() => cssRequests.length).toBeGreaterThan(0);
  const visibleNames = await dialog.locator('[role="option"]:visible').allTextContents();
  const previewNames = visibleNames.filter((name) => name !== 'Theme font');
  expect(cssRequests.length).toBeLessThanOrEqual(previewNames.length);
  for (const request of cssRequests) {
    const url = new URL(request);
    const name = url.searchParams.get('text');
    expect(name).not.toBeNull();
    expect(previewNames).toContain(name);
    expect(request).toContain('&text=');
  }
});

test('while blocked, names show plain with a Show previews button', async ({ page }) => {
  const cssRequests: string[] = [];
  await routeFonts(page, cssRequests);
  await page.goto(`/?test#md=${encodeURIComponent(BOX_DECK)}`);
  await expect(page.locator('.us-box')).toHaveCount(1);
  await clickBox(page);
  await page.locator('.us-floating-bar').getByRole('button', { name: 'Font', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Font picker' });
  const previews = dialog.getByRole('button', { name: 'Show previews' });

  await expect(previews).toBeVisible();
  expect(await dialog.getByRole('option', { name: 'Google Sans', exact: true })
    .evaluate((option: HTMLElement) => option.style.fontFamily)).toBe('');
  await page.waitForTimeout(100);
  expect(cssRequests).toEqual([]);

  await previews.click();
  await expect(previews).toHaveCount(0);
  await expect.poll(() => cssRequests.length).toBeGreaterThan(0);

  await page.keyboard.press('Escape');
  await page.locator('.us-floating-bar').getByRole('button', { name: 'Font', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Font picker' }).getByRole('button', { name: 'Show previews' }))
    .toBeVisible();
});
