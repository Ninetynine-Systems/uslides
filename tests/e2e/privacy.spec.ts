import { expect, test, type Page } from '@playwright/test';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const IMAGE = 'https://img.example/chart.png';
const IMAGE_DECK = `# Private deck\n\n![Sales chart](${IMAGE})\n`;
const BANNER_TEXT =
  'This deck wants to load images and fonts from 1 other website. They are blocked until you allow them.';

async function routeImage(page: Page) {
  let requests = 0;
  await page.route('https://img.example/**', (route) => {
    requests += 1;
    return route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG });
  });
  return {
    count: () => requests,
    reset: () => { requests = 0; },
  };
}

async function openShared(page: Page, source = IMAGE_DECK) {
  await page.goto(`/?test#md=${encodeURIComponent(source)}`);
  await expect(page.locator('.us-stage').first()).toContainText('Private deck');
}

async function replaceSource(page: Page, source: string) {
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(source);
}

test('a deck from a share link makes no request to the image host and shows the banner', async ({ page }) => {
  const requests = await routeImage(page);
  await openShared(page);

  await expect(page.getByText(BANNER_TEXT)).toBeVisible();
  await expect(page.locator('.us-stage .us-blocked')).toHaveText('Sales chart');
  await expect(page.locator(`img[src="${IMAGE}"]`)).toHaveCount(0);
  expect(requests.count()).toBe(0);

  await page.getByRole('button', { name: 'Show websites' }).click();
  await expect(page.getByText('img.example', { exact: true })).toBeVisible();
});

test('Allow once loads the image until reload', async ({ page }) => {
  const requests = await routeImage(page);
  await openShared(page);

  await page.getByRole('button', { name: 'Allow once' }).click();
  await expect(page.locator(`img[src="${IMAGE}"]`)).toHaveCount(1);
  await expect.poll(requests.count).toBe(1);
  await expect(page.getByText(BANNER_TEXT)).toHaveCount(0);

  requests.reset();
  await page.reload();
  await expect(page.getByText(BANNER_TEXT)).toBeVisible();
  await expect(page.locator('.us-stage .us-blocked')).toHaveCount(1);
  expect(requests.count()).toBe(0);
});

test('Always allow for this deck survives a reload', async ({ page }) => {
  const requests = await routeImage(page);
  await openShared(page);

  await page.getByRole('button', { name: 'Always allow for this deck' }).click();
  await expect(page.locator(`img[src="${IMAGE}"]`)).toHaveCount(1);
  await expect.poll(requests.count).toBe(1);

  requests.reset();
  await page.reload();
  await expect(page.locator(`img[src="${IMAGE}"]`)).toHaveCount(1);
  await expect.poll(requests.count).toBe(1);
  await expect(page.getByText(BANNER_TEXT)).toHaveCount(0);
});

test('Always allow does not replace typing made while the privacy choice is saved', async ({ page }) => {
  await routeImage(page);
  await openShared(page);
  await page.evaluate(() => {
    const state = window as typeof window & {
      __privacyHoldReady?: boolean;
      __privacyHoldRelease?: boolean;
    };
    state.__privacyHoldReady = false;
    state.__privacyHoldRelease = false;
    const opening = indexedDB.open('uslides');
    opening.onsuccess = () => {
      const database = opening.result;
      const transaction = database.transaction('decks', 'readwrite');
      const store = transaction.objectStore('decks');
      const keepAlive = () => {
        const request = store.get('__privacy-hold__');
        request.onsuccess = () => {
          if (!state.__privacyHoldRelease) keepAlive();
        };
      };
      transaction.oncomplete = () => database.close();
      keepAlive();
      state.__privacyHoldReady = true;
    };
  });
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __privacyHoldReady?: boolean }
  ).__privacyHoldReady)).toBe(true);

  await page.getByRole('button', { name: 'Always allow for this deck' }).click();
  const sourceEditor = page.getByRole('textbox', { name: 'Deck source' });
  await sourceEditor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('\nkept while allowing');
  expect(await page.evaluate(() => window.__uslides!.getSource())).toContain('kept while allowing');
  await page.evaluate(() => {
    (window as typeof window & { __privacyHoldRelease?: boolean }).__privacyHoldRelease = true;
  });

  await expect(page.getByText(BANNER_TEXT)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__uslides!.getSource())).toContain('kept while allowing');
});

test('a deck with no web images never shows the banner', async ({ page }) => {
  await openShared(page, '# Private deck\n\nNo outside images.\n');
  await expect(page.getByText(/This deck wants to load images and fonts/)).toHaveCount(0);
});

test('present mode of a blocked deck shows the placeholder', async ({ page }) => {
  const requests = await routeImage(page);
  await openShared(page);

  await page.getByRole('button', { name: 'Present' }).click();
  await expect(page.locator('.present .us-blocked')).toHaveText('Sales chart');
  await expect(page.locator('.present img')).toHaveCount(0);
  expect(requests.count()).toBe(0);
});

test('print of a blocked deck shows the placeholder', async ({ page }) => {
  const requests = await routeImage(page);
  await openShared(page);
  await page.evaluate(() => {
    window.print = () => {};
  });

  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await page.getByRole('button', { name: 'Print / PDF' }).click();
  await expect(page.locator('.us-print .us-blocked')).toHaveText('Sales chart');
  await expect(page.locator('.us-print img')).toHaveCount(0);
  expect(requests.count()).toBe(0);
});

test('the ask-first setting blocks a deck made in the app', async ({ page }) => {
  const requests = await routeImage(page);
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);

  await page.getByRole('button', { name: 'Menu' }).click();
  const setting = page.getByRole('menuitemcheckbox', {
    name: 'Ask before loading anything from other websites',
  });
  await expect(setting).toHaveAttribute('aria-checked', 'false');
  await setting.click();

  await replaceSource(page, IMAGE_DECK);
  await expect(page.getByText(BANNER_TEXT)).toBeVisible();
  await expect(page.locator('.us-stage .us-blocked')).toHaveCount(1);
  expect(requests.count()).toBe(0);
});

test('an imported deck starts blocked; a duplicate of it is still blocked', async ({ page }) => {
  const requests = await routeImage(page);
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);

  await page.locator('input[aria-label="Open files"]').setInputFiles({
    name: 'outside.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(IMAGE_DECK),
  });
  await expect(page.getByText(BANNER_TEXT)).toBeVisible();
  await expect(page.locator('.us-stage .us-blocked')).toHaveCount(1);
  expect(requests.count()).toBe(0);

  await page.getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.getByText(BANNER_TEXT)).toBeVisible();
  await expect(page.locator('.us-stage .us-blocked')).toHaveCount(1);
  expect(requests.count()).toBe(0);
});
