import { expect, test, type Page } from '@playwright/test';

// A phone: a narrow screen that is used with a finger.
test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

type Point = { x: number; y: number };

const ONE_BOX = '# Boxes\n\n::: box col=1-6 row=1-3\nHello\n:::\n';
const LONG_DECK = Array.from({ length: 6 }, (_, i) => `# Slide ${i + 1}\n\n::: box col=1-12 row=2-6\nBox ${i + 1}\n:::\n`).join('\n---\n\n');

async function open(page: Page, source: string, slides = 1): Promise<void> {
  await page.goto(`/?test#md=${encodeURIComponent(source)}`);
  await expect(page.locator('.slide-frame .us-stage')).toHaveCount(slides);
  // The slides can be edited once the text editor behind them has loaded.
  await expect(page.locator('.us-edit-overlay')).toHaveCount(slides);
}

const source = (page: Page) => page.evaluate(() => window.__uslides!.getSource!());

async function centre(page: Page, selector: string): Promise<Point> {
  const rect = await page.locator(selector).first().boundingBox();
  if (!rect) throw new Error(`${selector} is not visible`);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Drags one finger across the screen, the way the browser itself reports a real finger. */
async function fingerDrag(page: Page, from: Point, to: Point): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const at = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('the slide tools are there on a phone', async ({ page }) => {
  await open(page, ONE_BOX);
  for (const name of ['Add slide', 'Add box', 'Show text editor']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('group', { name: 'History' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('Add box adds a box to type in, and Undo takes it away', async ({ page }) => {
  await open(page, '# Empty\n');
  await page.getByRole('button', { name: 'Add box', exact: true }).tap();
  await expect(page.locator('.us-typing-area')).toBeVisible();
  await page.keyboard.type('From a phone');
  await expect.poll(() => source(page)).toContain('From a phone');
  await page.keyboard.press('Escape');

  const undo = page.getByRole('button', { name: /^Undo/ });
  for (let i = 0; i < 20 && (await source(page)).includes(':::'); i++) await undo.tap();
  expect(await source(page)).not.toContain(':::');
});

test('a tap selects a box, and a second tap starts typing in it', async ({ page }) => {
  await open(page, ONE_BOX);
  const at = await centre(page, '.us-box[data-box="0"]');
  await page.touchscreen.tap(at.x, at.y);
  await expect(page.locator('.us-selection[data-box="0"]')).toBeVisible();
  await expect(page.locator('.us-typing-area')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit text', exact: true })).toBeVisible();

  await page.touchscreen.tap(at.x, at.y);
  await expect(page.locator('.us-typing-area')).toBeVisible();
  await page.keyboard.press('End');
  await page.keyboard.type(' there');
  await expect.poll(() => source(page)).toContain('Hello there');
});

test('the Edit text button starts typing in the selected box', async ({ page }) => {
  await open(page, ONE_BOX);
  const at = await centre(page, '.us-box[data-box="0"]');
  await page.touchscreen.tap(at.x, at.y);
  await page.getByRole('button', { name: 'Edit text', exact: true }).tap();
  await expect(page.locator('.us-typing-area')).toBeVisible();
});

test('a finger drags the selected box to new cells', async ({ page }) => {
  await open(page, ONE_BOX);
  const at = await centre(page, '.us-box[data-box="0"]');
  await page.touchscreen.tap(at.x, at.y);
  await expect(page.locator('.us-selection[data-box="0"]')).toBeVisible();
  const stage = (await page.locator('.slide-frame').first().boundingBox())!;
  // Three columns to the right and one row down.
  await fingerDrag(page, at, { x: at.x + (stage.width / 12) * 3, y: at.y + stage.height / 6 });
  await expect.poll(() => source(page)).toContain('col=4-9 row=2-4');
});

test('a finger on a handle resizes the selected box', async ({ page }) => {
  await open(page, ONE_BOX);
  const at = await centre(page, '.us-box[data-box="0"]');
  await page.touchscreen.tap(at.x, at.y);
  const handle = await centre(page, '.us-handle-e');
  const stage = (await page.locator('.slide-frame').first().boundingBox())!;
  await fingerDrag(page, handle, { x: handle.x + (stage.width / 12) * 2, y: handle.y });
  await expect.poll(() => source(page)).toContain('col=1-8 row=1-3');
});

test('a swipe over a box scrolls the slides and changes nothing', async ({ page }) => {
  await open(page, LONG_DECK, 6);
  const before = await source(page);
  const at = await centre(page, '.slide-card:nth-child(2) .us-box[data-box="0"]');
  await fingerDrag(page, at, { x: at.x, y: at.y - 220 });
  await expect.poll(() => page.locator('.preview-scroll').evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  await expect(page.locator('.us-selection')).toHaveCount(0);
  expect(await source(page)).toBe(before);
});

test('a sideways swipe on empty space does not draw a box', async ({ page }) => {
  await open(page, '# Empty\n');
  const frame = (await page.locator('.slide-frame').first().boundingBox())!;
  const from = { x: frame.x + 40, y: frame.y + frame.height - 40 };
  await fingerDrag(page, from, { x: from.x + 200, y: from.y - 60 });
  expect(await source(page)).not.toContain(':::');
});

test('text outside a box can be edited with two taps', async ({ page }) => {
  await open(page, '# Title here\n');
  const at = await centre(page, '.us-stage h1');
  await page.touchscreen.tap(at.x, at.y);
  await expect(page.locator('.slide-card.slide-selected')).toHaveCount(1);
  await page.touchscreen.tap(at.x, at.y);
  await expect(page.locator('.us-typing-area')).toBeVisible();
});

test('the Markdown text opens in place of the slides, and back again', async ({ page }) => {
  await open(page, ONE_BOX);
  await page.getByRole('button', { name: 'Show text editor', exact: true }).tap();
  const editor = page.getByRole('textbox', { name: 'Deck source' });
  await expect(editor).toBeVisible();
  await expect(page.locator('.preview')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await editor.tap();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\n\nTyped as text');
  await expect.poll(() => source(page)).toContain('Typed as text');

  await page.getByRole('button', { name: 'Back to slides', exact: true }).tap();
  await expect(page.locator('.preview')).toBeVisible();
  await expect(editor).toBeHidden();
  await expect(page.locator('.us-stage')).toContainText('Typed as text');
});
