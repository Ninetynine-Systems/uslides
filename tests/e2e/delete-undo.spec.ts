import { expect, test, type Page } from '@playwright/test';
import { moreMenu } from './helpers/app';

const editor = (page: Page) => page.getByRole('textbox', { name: 'Deck source' });
const getSource = (page: Page) => page.evaluate(() => window.__uslides!.getSource());
const deckItems = (page: Page) => page.getByRole('navigation', { name: 'Decks' }).getByRole('listitem');
const deleteNotice = (page: Page, name: string) =>
  page.locator('.notice').filter({ hasText: `Deleted "${name}".` });

function currentDeckId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const id = /#\/deck\/([^/]+)/.exec(location.hash)?.[1];
    if (!id) throw new Error(`No deck id in ${location.hash}`);
    return id;
  });
}

async function typeAtEnd(page: Page, text: string): Promise<void> {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(text);
}

async function storeSvg(page: Page, deckId: string): Promise<void> {
  await page.evaluate(
    ({ id }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('uslides');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const bytes = new TextEncoder().encode(
            '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8" fill="red"/></svg>',
          ).buffer;
          const tx = open.result.transaction('images', 'readwrite');
          tx.objectStore('images').put({ deckId: id, path: 'dot.svg', type: 'image/svg+xml', bytes });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    { id: deckId },
  );
}

async function rawDeckExists(page: Page, deckId: string): Promise<boolean> {
  return page.evaluate(
    (id) =>
      new Promise<boolean>((resolve, reject) => {
        const open = indexedDB.open('uslides');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('decks');
          const get = tx.objectStore('decks').get(id);
          get.onsuccess = () => resolve(get.result !== undefined);
          get.onerror = () => reject(get.error);
        };
      }),
    deckId,
  );
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', (dialog) => {
    void dialog.dismiss();
    throw new Error(`Unexpected browser dialog: ${dialog.message()}`);
  });
});

test('delete is instant and offers Undo', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);

  await moreMenu(page, 'Delete deck');

  const notice = deleteNotice(page, 'Welcome to uslides');
  await expect(notice.getByText('Deleted "Welcome to uslides".', { exact: true })).toBeVisible();
  await expect(notice.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  await expect(deckItems(page).filter({ hasText: 'Welcome to uslides' })).toHaveCount(0);
});

test('Undo restores and opens the deck with its original text', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  const original = await getSource(page);
  const deletedId = await currentDeckId(page);

  await moreMenu(page, 'Delete deck');
  await deleteNotice(page, 'Welcome to uslides').getByRole('button', { name: 'Undo', exact: true }).click();

  await expect(deckItems(page).filter({ hasText: 'Welcome to uslides' })).toHaveCount(1);
  await expect.poll(() => currentDeckId(page)).toBe(deletedId);
  await expect.poll(() => getSource(page)).toBe(original);
  await page.reload();
  await expect.poll(() => getSource(page)).toBe(original);
});

test('Undo saves work in the next deck and restores the deleted deck with its image', async ({ page }) => {
  const keptSource = '# Keep me\n\n![dot](dot.svg)\n';
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);

  await page.getByRole('button', { name: 'New deck', exact: true }).click();
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(keptSource);
  await expect.poll(() => getSource(page)).toBe(keptSource);
  await page.waitForTimeout(600);
  const keptId = await currentDeckId(page);
  await storeSvg(page, keptId);
  await page.reload();
  await expect(page.locator('.us-stage img')).toHaveCount(1);

  await moreMenu(page, 'Delete deck');
  await expect.poll(() => getSource(page)).toContain('# Welcome');
  await typeAtEnd(page, ' typed after delete');
  await deleteNotice(page, 'Keep me').getByRole('button', { name: 'Undo', exact: true }).click();

  await expect.poll(() => currentDeckId(page)).toBe(keptId);
  await expect.poll(() => getSource(page)).toBe(keptSource);
  await expect(page.locator('.us-stage img')).toHaveCount(1);
  await deckItems(page).filter({ hasText: 'Welcome to uslides' }).getByRole('button').click();
  await expect.poll(() => getSource(page).then((source) => source.endsWith(' typed after delete'))).toBe(true);
});

test('dismissing the notice removes the deck for good', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  const deletedId = await currentDeckId(page);

  await moreMenu(page, 'Delete deck');
  await deleteNotice(page, 'Welcome to uslides').getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect.poll(() => rawDeckExists(page, deletedId)).toBe(false);
  await page.reload();

  await expect(deckItems(page).filter({ hasText: 'Welcome to uslides' })).toHaveCount(0);
  expect(await rawDeckExists(page, deletedId)).toBe(false);
});

test('the notice ending removes the deck for good', async ({ page }) => {
  await page.clock.install();
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  const deletedId = await currentDeckId(page);

  await moreMenu(page, 'Delete deck');
  const notice = deleteNotice(page, 'Welcome to uslides');
  await expect(notice).toBeVisible();
  await page.clock.fastForward(8_000);
  await expect(notice).toHaveCount(0);
  await expect.poll(() => rawDeckExists(page, deletedId)).toBe(false);
  await page.reload();

  await expect(deckItems(page).filter({ hasText: 'Welcome to uslides' })).toHaveCount(0);
});

test('deleting in one tab updates the deck list in another tab', async ({ page, context }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(deckItems(other).filter({ hasText: 'Welcome to uslides' })).toHaveCount(1);

  await moreMenu(page, 'Delete deck');

  await expect(deckItems(other).filter({ hasText: 'Welcome to uslides' })).toHaveCount(0);
});

test('a tab opened during the Undo window does not stop restoration', async ({ page, context }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  const deletedId = await currentDeckId(page);

  await moreMenu(page, 'Delete deck');
  const newTab = await context.newPage();
  await newTab.goto('/?test');
  await expect(newTab.getByRole('textbox', { name: 'Deck source' })).toBeVisible();
  await deleteNotice(page, 'Welcome to uslides').getByRole('button', { name: 'Undo', exact: true }).click();

  await expect.poll(() => currentDeckId(page)).toBe(deletedId);
  await expect(deckItems(page).filter({ hasText: 'Welcome to uslides' })).toHaveCount(1);
  await expect(deckItems(newTab).filter({ hasText: 'Welcome to uslides' })).toHaveCount(1);
});
