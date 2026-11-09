import { expect, test, type BrowserContext, type Page } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

const deckCount = (page: Page) => page.locator('.decklist li').count();

/** Opens the share menu and copies the link. Returns just the `#…` part, since links point at the production address. */
async function copyHash(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Share' }).click();
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByText('Link copied')).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link.startsWith('https://uslides.ninetynine.systems/#z=')).toBe(true);
  return link.slice(link.indexOf('#'));
}

async function setText(page: Page, text: string) {
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(page.locator('.us-stage').first()).toContainText(text.split('\n').find((l) => l.startsWith('# '))!.slice(2));
}

async function freshPage(context: BrowserContext): Promise<Page> {
  return context.browser()!.newContext().then((c) => c.newPage());
}

test('Copy link makes a #z= link that opens as a new deck', async ({ page, context }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await setText(page, '# Shared hello 👋\n\nআমার সোনার বাংলা\n');
  const hash = await copyHash(page);
  // The copy saved the deck first.
  const other = await freshPage(context);
  await other.goto(`/${hash}`);
  await expect(other.locator('.us-stage').first()).toContainText('Shared hello');
  await expect(other.locator('.us-stage').first()).toContainText('আমার সোনার বাংলা');
  await expect.poll(() => other.evaluate(() => location.hash)).toMatch(/^#\/deck\/[^/]+$/);
  const url = await other.evaluate(() => location.href);
  await other.reload();
  await expect(other.locator('.us-stage').first()).toContainText('Shared hello');
  expect(await other.evaluate(() => location.href)).toBe(url);
  expect(await deckCount(other)).toBe(1);
  await other.context().close();
});

test('opening a link adds a deck and never overwrites an existing one', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  expect(await deckCount(page)).toBe(1);
  const md = encodeURIComponent('# Agent made\n');
  await page.goto(`/?test#md=${md}`);
  await expect(page.locator('.us-stage').first()).toContainText('Agent made');
  await expect.poll(() => deckCount(page)).toBe(2);
  await page.reload();
  await expect(page.locator('.us-stage').first()).toContainText('Agent made');
  expect(await deckCount(page)).toBe(2);
});

test('a link pasted into an open tab opens as a new deck', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await page.evaluate((h) => { location.hash = h; }, `#md=${encodeURIComponent('# Pasted\n')}`);
  await expect(page.locator('.us-stage').first()).toContainText('Pasted');
  expect(await deckCount(page)).toBe(2);
});

test('a damaged link shows a notice and creates nothing', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  expect(await deckCount(page)).toBe(1);
  await page.evaluate(() => { location.hash = '#z=!!!'; });
  await expect(page.getByText('This link is damaged or incomplete')).toBeVisible();
  expect(await deckCount(page)).toBe(1);
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#\/deck\//);
});

test('a damaged link on first run shows the notice and the sample deck, once', async ({ page }) => {
  await page.goto('/?test#z=!!!');
  await expect(page.getByText('This link is damaged or incomplete')).toBeVisible();
  await expect(page.locator('.us-stage')).toHaveCount(4);
  expect(await deckCount(page)).toBe(1);
});

test('a link on first run opens the shared deck without also making the sample', async ({ page }) => {
  await page.goto(`/?test#md=${encodeURIComponent('# Only me\n')}`);
  await expect(page.locator('.us-stage').first()).toContainText('Only me');
  expect(await deckCount(page)).toBe(1);
});

test('a very long link still copies but suggests downloading', async ({ page }) => {
  let text = '# Long\n\n';
  let x = 12345;
  while (text.length < 12000) {
    x = (x * 1103515245 + 12345) % 2147483648;
    text += x.toString(36);
  }
  await page.goto(`/?test#md=${encodeURIComponent(text)}`);
  await expect(page.locator('.us-stage').first()).toContainText('Long');
  const hash = await copyHash(page);
  expect(hash.length).toBeGreaterThan(8000);
  await expect(page.locator('.notice').getByText(/download/i)).toBeVisible();
});

test('a deck with stored images warns they are not in the link', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  const id = await page.evaluate(() => /#\/deck\/([^/]+)/.exec(location.hash)![1]);
  await page.evaluate(
    (deckId) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('uslides');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('images', 'readwrite');
          tx.objectStore('images').put({ deckId, path: 'a.png', type: 'image/png', bytes: new ArrayBuffer(4) });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    id,
  );
  await page.getByRole('button', { name: 'Share' }).click();
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByText('Images stored in this browser are not included in links')).toBeVisible();
});

test('when the clipboard refuses, the link is shown in a read-only field', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));
  });
  await page.getByRole('button', { name: 'Share' }).click();
  await page.getByRole('button', { name: 'Copy link' }).click();
  const field = page.locator('.share-manual input');
  await expect(field).toHaveAttribute('readonly', '');
  await expect(field).toHaveValue(/#z=/);
});
