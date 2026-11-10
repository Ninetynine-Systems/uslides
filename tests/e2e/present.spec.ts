import { expect, test, type Page } from '@playwright/test';

const present = (page: Page) => page.locator('.present');
const shown = (page: Page) => present(page).locator('.us-stage');

async function start(page: Page) {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await page.getByRole('button', { name: 'Present' }).click();
  await expect(present(page)).toBeVisible();
}

const slideNumber = (page: Page) => page.evaluate(() => Number(/\/present\/(\d+)/.exec(location.hash)?.[1]));

test('Present button enters fullscreen and shows slide 1', async ({ page }) => {
  await start(page);
  await expect(shown(page)).toContainText('Welcome to uslides');
  await expect(shown(page)).toHaveCount(1);
  expect(await slideNumber(page)).toBe(1);
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
});

test('forward and back keys, clicks, and the ends', async ({ page }) => {
  await start(page);
  const title = async (n: number) => {
    await expect.poll(() => slideNumber(page)).toBe(n);
  };
  for (const key of ['ArrowRight', 'ArrowDown', 'Space', 'PageDown']) {
    const before = await slideNumber(page);
    await page.keyboard.press(key);
    await title(Math.min(before + 1, 4));
    if (before === 3) await page.keyboard.press('Home');
  }
  await page.keyboard.press('Home');
  await title(1);
  await page.keyboard.press('ArrowLeft');
  await title(1); // stays at the start
  await present(page).click();
  await title(2);
  await page.keyboard.press('ArrowRight');
  await title(3);
  await page.keyboard.press('ArrowLeft');
  await title(2);
  await page.keyboard.press('ArrowUp');
  await title(1);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('PageUp');
  await title(1);
  await page.keyboard.press('End');
  await title(4);
  await page.keyboard.press('ArrowRight');
  await title(4); // stays at the end
  await expect(shown(page)).toContainText('Notes, sharing and presenting');
});

test('right-click does not advance', async ({ page }) => {
  await start(page);
  await present(page).click({ button: 'right' });
  await page.waitForTimeout(100);
  expect(await slideNumber(page)).toBe(1);
});

test('Esc leaves present mode and returns to the editor', async ({ page }) => {
  await start(page);
  await page.keyboard.press('Escape');
  await expect(present(page)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/deck\/[^/]+$/);
  await expect(page.getByRole('textbox', { name: 'Deck source' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
});

test('leaving fullscreen from the browser also leaves present mode', async ({ page }) => {
  await start(page);
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  await expect(present(page)).toHaveCount(0);
});

test('Back leaves present mode, and slide changes do not add history entries', async ({ page }) => {
  await start(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => slideNumber(page)).toBe(3);
  await page.goBack();
  await expect(present(page)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/deck\/[^/]+$/);
});

test('reloading on /present/3 shows slide 3', async ({ page }) => {
  await start(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => slideNumber(page)).toBe(3);
  await page.reload();
  await expect(present(page)).toBeVisible();
  await expect(shown(page)).toContainText('Left box');
  expect(await slideNumber(page)).toBe(3);
});

test('a slide number out of range is clamped in the URL', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    location.hash = location.hash.replace(/present\/\d+/, 'present/99');
  });
  await page.reload();
  await expect(present(page)).toBeVisible();
  await expect.poll(() => slideNumber(page)).toBe(4);
  await expect(shown(page)).toContainText('Notes, sharing and presenting');
});

test('speaker notes are not shown', async ({ page }) => {
  await start(page);
  await page.keyboard.press('End');
  await expect(shown(page)).toContainText('Notes, sharing and presenting');
  await expect(present(page)).not.toContainText('speaker note.');
  await expect(present(page)).not.toContainText('This text is a speaker note');
});

test('a link in a slide is followed instead of advancing', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  const editor = page.getByRole('textbox', { name: 'Deck source' });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\n---\n# Links\n\n[go](https://example.com/)');
  await expect(page.locator('.us-stage', { hasText: 'Links' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Present' }).click();
  await page.keyboard.press('End');
  await expect.poll(() => slideNumber(page)).toBe(5);
  const popup = page.waitForEvent('popup'); // slide links open in a new tab
  await present(page).locator('a', { hasText: 'go' }).click();
  await popup;
  expect(await slideNumber(page)).toBe(5);
});

test('Ctrl/Cmd+Enter in the editor presents the slide with the cursor', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await expect(page.getByRole('textbox', { name: 'Deck source' })).toBeVisible();
  await page.getByRole('group', { name: 'Slide 3' }).click(); // moves the cursor into slide 3
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(present(page)).toBeVisible();
  await expect(shown(page)).toContainText('Left box');
  expect(await slideNumber(page)).toBe(3);
  await page.keyboard.press('Escape');
  await expect(present(page)).toHaveCount(0);
  // The shortcut must not have inserted a blank line into the deck.
  const src = await page.evaluate(() => window.__uslides!.getSource());
  expect(src).not.toContain('# The basics\n\n\n');
});

test('Present works on a phone-sized screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await page.getByRole('button', { name: 'Present' }).click();
  await expect(shown(page)).toContainText('Welcome to uslides');
  await page.keyboard.press('Escape');
  await expect(present(page)).toHaveCount(0);
});
