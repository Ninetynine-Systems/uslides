import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// Touch controls in Present mode and in the exported player.

test.use({ hasTouch: true, viewport: { width: 800, height: 600 } });

const DECK = '# One\n\n---\n\n# Two\n\n---\n\n# Three\n\n---\n\n# Four\n';
const exitButton = (page: Page) => page.getByRole('button', { name: 'Exit presentation' });

/** A one-finger drag from (x0, y0) to (x1, y1), sent as real touch events. */
async function swipe(page: Page, x0: number, y0: number, x1: number, y1: number) {
  const cdp = await page.context().newCDPSession(page);
  const at = (x: number, y: number) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(x0, y0) });
  for (let i = 1; i <= 5; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: at(x0 + ((x1 - x0) * i) / 5, y0 + ((y1 - y0) * i) / 5),
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function presentApp(page: Page, touch = true) {
  await page.goto(`/?test#md=${encodeURIComponent(DECK)}`);
  await expect(page.locator('.us-stage').first()).toContainText('One');
  const present = page.getByRole('button', { name: 'Present' });
  await (touch ? present.tap() : present.click());
  await expect(page.locator('.present')).toBeVisible();
}

const title = (page: Page, scope: string) => page.locator(`${scope} .us-stage h1`);

test.describe('Present', () => {
  test('a tap on the left third goes back, any other tap goes forward', async ({ page }) => {
    await presentApp(page);
    const shown = title(page, '.present');
    await expect(shown).toHaveText('One');
    await page.touchscreen.tap(400, 300); // middle: forward
    await expect(shown).toHaveText('Two');
    await page.touchscreen.tap(700, 300); // right: forward
    await expect(shown).toHaveText('Three');
    await page.touchscreen.tap(100, 300); // left third: back
    await expect(shown).toHaveText('Two');
    await page.touchscreen.tap(100, 300);
    await page.touchscreen.tap(100, 300); // stays on the first slide
    await expect(shown).toHaveText('One');
  });

  test('a horizontal swipe goes next or previous, a vertical one does nothing', async ({ page }) => {
    await presentApp(page);
    const shown = title(page, '.present');
    await swipe(page, 600, 300, 200, 310); // to the left: next
    await expect(shown).toHaveText('Two');
    await swipe(page, 200, 300, 600, 290); // to the right: previous
    await expect(shown).toHaveText('One');
    await swipe(page, 400, 100, 400, 500); // down
    await page.waitForTimeout(200);
    await expect(shown).toHaveText('One');
  });

  test('the exit button shows on touch, fades after 2 s, and leaves present mode', async ({ page }) => {
    await presentApp(page);
    await expect(exitButton(page)).toBeVisible();
    await expect(exitButton(page)).toHaveCSS('opacity', '1');
    await expect(exitButton(page)).toHaveText('✕');
    await expect(exitButton(page)).toHaveCSS('opacity', '0', { timeout: 5000 });
    // A touch brings it back.
    await page.touchscreen.tap(400, 300);
    await expect(exitButton(page)).toHaveCSS('opacity', '1');
    await exitButton(page).tap();
    await expect(page.locator('.present')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Deck source' })).toBeVisible();
  });

  test('tapping the exit button does not also change the slide', async ({ page }) => {
    await presentApp(page);
    await page.touchscreen.tap(400, 300);
    await expect(title(page, '.present')).toHaveText('Two');
    await exitButton(page).tap();
    await expect(page.locator('.present')).toHaveCount(0);
    expect(await page.evaluate(() => location.hash)).not.toMatch(/present/);
  });
});

test.describe('Present with a mouse', () => {
  test.use({ hasTouch: false });

  test('the exit button appears when the pointer moves and fades after 2 s', async ({ page }) => {
    await presentApp(page, false);
    await expect(exitButton(page)).toHaveCSS('opacity', '0');
    await page.mouse.move(300, 200);
    await page.mouse.move(320, 220);
    await expect(exitButton(page)).toHaveCSS('opacity', '1');
    await expect(exitButton(page)).toHaveCSS('opacity', '0', { timeout: 5000 });
    await page.mouse.move(340, 240);
    await exitButton(page).click();
    await expect(page.locator('.present')).toHaveCount(0);
  });

  test('a click on the left third still only goes forward with a mouse', async ({ page }) => {
    await presentApp(page, false);
    await page.mouse.click(100, 300);
    await expect(title(page, '.present')).toHaveText('Two');
  });
});

async function openPlayer(page: Page, context: BrowserContext): Promise<Page> {
  await page.goto(`/?test#md=${encodeURIComponent(DECK)}`);
  await expect(page.locator('.us-stage').first()).toContainText('One');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await page.getByRole('button', { name: 'Download .html' }).click();
  const path = test.info().outputPath('deck.html');
  await (await pending).saveAs(path);
  expect(readFileSync(path, 'utf8')).toContain('Exit presentation');
  const player = await context.newPage();
  await player.goto(`file://${path}`);
  await expect(player.locator('.us-stage')).toHaveCount(1);
  return player;
}

test.describe('exported player', () => {
  test('taps and swipes change slide', async ({ page, context }) => {
    const player = await openPlayer(page, context);
    const shown = title(player, '#player');
    await expect(shown).toHaveText('One');
    await player.touchscreen.tap(400, 300);
    await expect(shown).toHaveText('Two');
    await player.touchscreen.tap(700, 300);
    await expect(shown).toHaveText('Three');
    await player.touchscreen.tap(100, 300);
    await expect(shown).toHaveText('Two');
    await swipe(player, 600, 300, 200, 300);
    await expect(shown).toHaveText('Three');
    await swipe(player, 200, 300, 600, 300);
    await expect(shown).toHaveText('Two');
  });

  test('the exit button is there, fades after 2 s, and goes back in history', async ({ page, context }) => {
    const player = await openPlayer(page, context);
    await player.goto('about:blank');
    await player.goBack(); // so the player has a page to go back to
    const here = player.url();
    await player.goto('about:blank#elsewhere');
    await player.goto(here);
    const exit = exitButton(player);
    await expect(exit).toHaveCSS('opacity', '1');
    await expect(exit).toHaveCSS('opacity', '0', { timeout: 5000 });
    await player.touchscreen.tap(400, 300);
    await expect(exit).toHaveCSS('opacity', '1');
    await exit.tap();
    await expect(player).toHaveURL(/elsewhere/);
  });
});
