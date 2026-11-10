import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { buildApp, close, imageServer, listen, staticServer } from './helpers/servers';

test.use({ serviceWorkers: 'allow' });

// A 2x2 red PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8Dwn4GBgYGJAQoAHhgCAh6X4CYAAAAASUVORK5CYII=',
  'base64',
);

async function serviceWorkerActive(page: Page) {
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (reg.active?.state !== 'activated') {
      await new Promise<void>((resolve) => {
        reg.active!.addEventListener('statechange', () => reg.active!.state === 'activated' && resolve());
      });
    }
  });
}

async function savedSource(page: Page): Promise<string | undefined> {
  return page.evaluate(() => new Promise<string | undefined>((resolve, reject) => {
    const match = /^#\/deck\/([^/]+)/.exec(location.hash);
    if (!match) return resolve(undefined);
    const opening = indexedDB.open('uslides');
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const database = opening.result;
      const transaction = database.transaction('decks', 'readonly');
      const request = transaction.objectStore('decks').get(decodeURIComponent(match[1]!));
      request.onsuccess = () => resolve((request.result as { source?: string } | undefined)?.source);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => database.close();
    };
  }));
}

const editor = (page: Page) => page.getByRole('textbox', { name: 'Deck source' });

async function openMenu(page: Page) {
  await page.getByRole('button', { name: 'Menu' }).click();
}

test('works with no network: new deck, type, present, export .html', async ({ page, context }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage').first()).toBeVisible();
  await serviceWorkerActive(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.us-stage').first()).toBeVisible();

  await page.getByRole('button', { name: 'New deck' }).click();
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\nWorks offline');
  await expect(page.locator('.us-stage', { hasText: 'Works offline' })).toHaveCount(1);

  await page.getByRole('button', { name: 'Present' }).click();
  await expect(page.locator('.present-frame .us-stage').first()).toContainText('Works offline');
  await page.keyboard.press('Escape');

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await page.getByRole('button', { name: 'Download .html' }).click();
  const dl = await pending;
  const html = readFileSync((await dl.path())!, 'utf8');
  expect(html).toContain('Works offline');
  expect(html).toContain('<script>');
});

test('a web image seen once online still shows offline', async ({ page, context }) => {
  const images = imageServer(PNG);
  await listen(images, 4175);
  try {
    await page.goto('/?test');
    await serviceWorkerActive(page);
    await page.reload(); // now the page is controlled by the service worker
    const url = 'http://127.0.0.1:4175/pic.png';
    const md = `# Pic\n\n![red](${url})\n`;
    // Keep this as an in-app deck. Share-link decks now block web images until the user allows them.
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.insertText(md);
    const img = page.locator('.slide-frame img').first();
    await expect(img).toHaveAttribute('src', url);
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(2);
    await expect
      .poll(() => page.evaluate(async () => (await (await caches.open('uslides-images')).keys()).length))
      .toBeGreaterThan(0);
    await expect.poll(() => savedSource(page)).toBe(md);
  } finally {
    await close(images);
  }
  await context.setOffline(true);
  await page.reload();
  const again = page.locator('.slide-frame img').first();
  await expect(again).toHaveAttribute('src', 'http://127.0.0.1:4175/pic.png');
  await expect.poll(() => again.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(2);
});

test('update flow: the notice appears, nothing reloads by itself, clicking reloads onto the new build', async ({ page }) => {
  test.slow();
  const a = buildApp('build-a');
  const b = buildApp('build-b');
  const { server, setRoot } = staticServer(a);
  await listen(server, 4176);
  try {
    await page.goto('http://127.0.0.1:4176/?test');
    await serviceWorkerActive(page);
    await page.reload();
    await openMenu(page);
    await expect(page.getByText('build-a')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.evaluate(() => ((window as unknown as { marker: string }).marker = 'same page'));

    setRoot(b);
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      await reg.update();
    });
    const update = page.getByRole('button', { name: 'Update available — reload' });
    await expect(update).toBeVisible();
    // It waits for the user: no reload, still the old build.
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => (window as unknown as { marker?: string }).marker)).toBe('same page');

    // Typing right before the click must survive the reload.
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('\nlast words');
    await Promise.all([page.waitForEvent('load'), update.click()]);
    expect(await page.evaluate(() => (window as unknown as { marker?: string }).marker)).toBeUndefined();
    await expect(page.locator('.us-stage').first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__uslides!.getSource())).toContain('last words');
    await openMenu(page);
    await expect(page.getByText('build-b')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update available — reload' })).toHaveCount(0);
  } finally {
    await close(server);
  }
});

/** Two tabs of the same app (one service worker for both), both controlled, on build A. Then build B is published. */
async function twoTabs(context: BrowserContext, root: string) {
  const a = await context.newPage();
  await a.goto(`${root}/?test`);
  await serviceWorkerActive(a);
  await a.reload();
  const b = await context.newPage();
  await b.goto(`${root}/?test`);
  await expect(b.locator('.us-stage').first()).toBeVisible();
  for (const page of [a, b]) {
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await page.evaluate(() => ((window as unknown as { marker: string }).marker = 'old page'));
  }
  return { a, b };
}

const marker = (page: Page) => page.evaluate(() => (window as unknown as { marker?: string }).marker);

test('an update in one tab saves the typing in another tab before it reloads', async ({ context }) => {
  test.slow();
  const { server, setRoot } = staticServer(buildApp('build-a'));
  const next = buildApp('build-b');
  await listen(server, 4176);
  try {
    const { a, b } = await twoTabs(context, 'http://127.0.0.1:4176');
    setRoot(next);
    await a.evaluate(async () => (await navigator.serviceWorker.ready).update());
    const update = a.getByRole('button', { name: 'Update available — reload' });
    await expect(update).toBeVisible();
    await expect(b.getByRole('button', { name: 'Update available — reload' })).toBeVisible();

    // Type in tab B, and stop its 400 ms save timer from ever firing, so only a flush can save the text.
    await b.bringToFront();
    await b.evaluate(() => {
      const real = window.setTimeout.bind(window);
      window.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) =>
        ms === 400 ? 0 : real(fn, ms, ...args)) as typeof window.setTimeout;
    });
    await editor(b).click();
    await b.keyboard.press('ControlOrMeta+End');
    await b.keyboard.type('\ntyped in the other tab');
    await expect.poll(() => b.evaluate(() => window.__uslides!.getSource())).toContain('typed in the other tab');

    await Promise.all([b.waitForEvent('load'), a.bringToFront().then(() => update.click())]);
    expect(await marker(b)).toBeUndefined();
    await expect(b.locator('.us-stage').first()).toBeVisible();
    await expect.poll(() => b.evaluate(() => window.__uslides!.getSource())).toContain('typed in the other tab');
    await openMenu(b);
    await expect(b.getByText('build-b')).toBeVisible();
  } finally {
    await close(server);
  }
});

test('a tab that is presenting reloads only after present mode ends', async ({ context }) => {
  test.slow();
  const { server, setRoot } = staticServer(buildApp('build-a'));
  const next = buildApp('build-b');
  await listen(server, 4176);
  try {
    const { a, b } = await twoTabs(context, 'http://127.0.0.1:4176');
    setRoot(next);
    await a.evaluate(async () => (await navigator.serviceWorker.ready).update());
    const update = a.getByRole('button', { name: 'Update available — reload' });
    await expect(update).toBeVisible();
    await expect(b.getByRole('button', { name: 'Update available — reload' })).toBeVisible();

    await b.bringToFront();
    await b.getByRole('button', { name: 'Present' }).click();
    await expect(b.locator('.present')).toBeVisible();

    await Promise.all([a.waitForEvent('load'), update.click()]);
    await expect(a.locator('.us-stage').first()).toBeVisible();
    await b.waitForTimeout(2000);
    expect(await marker(b)).toBe('old page'); // still the old page, still presenting
    await expect(b.locator('.present')).toBeVisible();

    await Promise.all([b.waitForEvent('load'), b.keyboard.press('Escape')]);
    await expect(b.locator('.us-stage').first()).toBeVisible();
    expect(await marker(b)).toBeUndefined();
    await openMenu(b);
    await expect(b.getByText('build-b')).toBeVisible();
  } finally {
    await close(server);
  }
});

const NOTE = 'Safari may delete saved decks after 7 days unless you install the app or download them';
const SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

test.describe('Safari note', () => {
  test.use({ userAgent: SAFARI_UA });

  test('shows once, and not again after it is dismissed', async ({ page }) => {
    await page.goto('/');
    const note = page.getByText(NOTE);
    await expect(note).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(note).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.us-stage').first()).toBeVisible();
    await expect(note).toHaveCount(0);
  });
});

test('other browsers do not see the Safari note', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.us-stage').first()).toBeVisible();
  await expect(page.getByText(NOTE)).toHaveCount(0);
});

test('Back up all decks downloads a file, Restore adds the decks back', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.us-stage').first()).toBeVisible();
  await openMenu(page);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back up all decks' }).click();
  const dl = await pending;
  expect(dl.suggestedFilename()).toMatch(/^uslides-backup-.*\.json$/);
  const path = (await dl.path())!;

  await openMenu(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore from backup' }).click();
  await (await chooser).setFiles(path);
  await expect(page.getByText('Restored 1 deck')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Decks' }).getByRole('listitem')).toHaveCount(2);

  await openMenu(page);
  const bad = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore from backup' }).click();
  await (await bad).setFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.getByText('This is not a uslides backup')).toBeVisible();
});
