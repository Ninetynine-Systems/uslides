import { expect, test, type Page } from '@playwright/test';

const editor = (page: Page) => page.getByRole('textbox', { name: 'Deck source' });

async function typeAtEnd(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(text);
}

const getSource = (page: Page) => page.evaluate(() => window.__uslides!.getSource());

test('first run shows the sample deck', async ({ page }) => {
  await page.goto('/?test');
  const items = page.getByRole('navigation', { name: 'Decks' }).getByRole('listitem');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('Welcome to uslides');
  await expect(page.locator('.slide-frame .us-stage')).toHaveCount(4);
  await expect(page).toHaveURL(/#\/deck\/.+/);
});

test('typing updates the preview', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await typeAtEnd(page, '\n---\n# Hello');
  await expect(page.locator('.us-stage', { hasText: 'Hello' })).toHaveCount(1, { timeout: 1000 });
  await expect(page.locator('.us-stage')).toHaveCount(5);
});

test('autosave survives reload', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await typeAtEnd(page, '\nremember me');
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await expect.poll(() => getSource(page)).toContain('remember me');
});

test('closing the tab right after typing keeps the text', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await typeAtEnd(page, '\nquick exit');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(100);
  await page.reload();
  await expect.poll(() => getSource(page)).toContain('quick exit');
});

test('new, rename, duplicate, delete', async ({ page }) => {
  await page.goto('/?test');
  const items = page.getByRole('navigation', { name: 'Decks' }).getByRole('listitem');
  await expect(items).toHaveCount(1);

  await page.getByRole('button', { name: 'New deck' }).click();
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText('Untitled');
  await expect.poll(() => getSource(page)).toBe('# Untitled\n');

  page.once('dialog', (d) => void d.accept('Quarterly plan'));
  await page.getByRole('button', { name: 'Rename' }).click();
  await expect(items.first()).toContainText('Quarterly plan');
  await expect.poll(() => getSource(page)).toContain('title: Quarterly plan');

  await page.getByRole('button', { name: 'Duplicate' }).click();
  await expect(items).toHaveCount(3);
  await expect(items.filter({ hasText: 'Quarterly plan' })).toHaveCount(2);

  let message = '';
  page.once('dialog', (d) => {
    message = d.message();
    void d.dismiss();
  });
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect.poll(() => message).toContain('Delete');
  await expect(items).toHaveCount(3);

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(items).toHaveCount(2);
});

test('warnings show in editor', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await typeAtEnd(page, '\n---\n::: box col=40\nhi\n:::\n');
  const marker = page.locator('.cm-lintRange-warning').first();
  await expect(marker).toBeVisible();
  await marker.hover();
  await expect(page.locator('.cm-tooltip-lint')).toContainText('outside the grid');
});

test('clicking a slide moves the cursor to it', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await page.getByRole('button', { name: 'Slide 3' }).click();
  await page.keyboard.type('@@');
  const src = await getSource(page);
  expect(src.indexOf('@@')).toBeGreaterThan(src.indexOf('# The basics'));
  expect(src.indexOf('@@')).toBeLessThan(src.indexOf('::: box'));
});

test('a second tab picks up a saved change silently', async ({ page, context }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  const b = await context.newPage();
  await b.goto(page.url());
  await expect(b.locator('.us-stage')).toHaveCount(4);

  await typeAtEnd(page, '\nfrom A');
  await page.waitForTimeout(700);
  await expect.poll(() => getSource(b)).toContain('from A');
  await expect(b.getByText('This deck changed in another tab')).toHaveCount(0);
});

test('two tabs: a stale tab shows the conflict notice and keeps the other tab\'s text', async ({ page, context }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  // Page B never hears about A's save, like a tab that was asleep.
  const b = await context.newPage();
  await b.addInitScript(() => {
    // @ts-expect-error simulate a tab that gets no messages
    delete window.BroadcastChannel;
  });
  await b.goto(page.url());
  await expect(b.locator('.us-stage')).toHaveCount(4);

  await typeAtEnd(page, '\nfrom A');
  await page.waitForTimeout(700);

  await typeAtEnd(b, '\nfrom B');
  await expect(b.getByText('This deck changed in another tab')).toBeVisible();
  await expect.poll(() => getSource(b)).toContain('from A');
  expect(await getSource(b)).not.toContain('from B');
});
