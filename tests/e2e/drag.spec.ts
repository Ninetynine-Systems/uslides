import { expect, test, type Page } from '@playwright/test';

const editor = (page: Page) => page.getByRole('textbox', { name: 'Deck source' });
const typingArea = (page: Page) => page.getByRole('textbox', { name: 'Markdown on slide' });
const getSource = (page: Page) => page.evaluate(() => window.__uslides!.getSource());

async function openDeck(page: Page, source: string) {
  await page.goto(`/?test#md=${encodeURIComponent(source)}`);
  await expect(page.locator('.slide-frame .us-stage')).toHaveCount(1);
  await expect(editor(page)).toBeVisible();
}

async function gridPoint(page: Page, col: number, row: number) {
  const stage = await page.locator('.slide-frame .us-stage').boundingBox();
  if (!stage) throw new Error('The slide is not visible');
  return {
    x: stage.x + (col - 0.5) * (stage.width / 12),
    y: stage.y + (row - 0.5) * (stage.height / 6),
    cellWidth: stage.width / 12,
    cellHeight: stage.height / 6,
  };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

test('dragging a box moves it by whole cells and is one undo step', async ({ page }) => {
  const source = '# A\n\n::: box col=1-6 row=1-2\nMove me\n:::\n';
  await openDeck(page, source);
  const box = await page.locator('.us-box[data-box="0"]').boundingBox();
  const stage = await page.locator('.us-stage').boundingBox();
  if (!box || !stage) throw new Error('The box is not visible');

  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await drag(page, from, { x: from.x + 2 * (stage.width / 12), y: from.y });

  await expect.poll(() => getSource(page)).toContain('col=3-8 row=1-2');
  await editor(page).focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => getSource(page)).toBe(source);
});

test('the preview frame handles undo and both redo shortcuts without a selection', async ({ page }) => {
  const source = '# A\n\n::: box col=1-6 row=1-2\nMove me\n:::\n';
  await openDeck(page, source);
  const box = await page.locator('.us-box[data-box="0"]').boundingBox();
  const stage = await page.locator('.us-stage').boundingBox();
  if (!box || !stage) throw new Error('The box is not visible');
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await drag(page, from, { x: from.x + stage.width / 12, y: from.y });
  const moved = await getSource(page);
  expect(moved).toContain('col=2-7 row=1-2');
  await page.keyboard.press('Escape');

  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => getSource(page)).toBe(source);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => getSource(page)).toBe(moved);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => getSource(page)).toBe(source);
  await page.keyboard.press('ControlOrMeta+y');
  await expect.poll(() => getSource(page)).toBe(moved);
});

test('a keyboard move stopped by the grid adds no undo step', async ({ page }) => {
  const source = '# A\n\n::: box col=9-12 row=4-6\nAt the edge\n:::\n';
  const edited = `${source}Unrelated edit\n`;
  await openDeck(page, source);
  await editor(page).focus();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('Unrelated edit\n');
  await expect.poll(() => getSource(page)).toBe(edited);
  const box = await page.locator('.us-box[data-box="0"]').boundingBox();
  if (!box) throw new Error('The box is not visible');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await page.keyboard.press('ArrowRight');
  await expect.poll(() => getSource(page)).toBe(edited);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => getSource(page)).toBe(source);
});

test('dragging the bottom-right handle resizes it', async ({ page }) => {
  await openDeck(page, '# A\n\n::: box col=1-3 row=1-2\nResize me\n:::\n');
  const box = await page.locator('.us-box[data-box="0"]').boundingBox();
  if (!box) throw new Error('The box is not visible');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  const handle = await page.locator('.us-handle-se').boundingBox();
  const stage = await page.locator('.us-stage').boundingBox();
  if (!handle || !stage) throw new Error('The resize handle is not visible');
  const from = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  await drag(page, from, {
    x: from.x + 2 * (stage.width / 12),
    y: from.y + stage.height / 6,
  });

  await expect.poll(() => getSource(page)).toContain('col=1-5 row=1-3');
});

test('a box cannot be dragged off the grid', async ({ page }) => {
  const source = '# A\n\n::: box col=9-12 row=4-6\nAt the edge\n:::\n';
  await openDeck(page, source);
  const box = await page.locator('.us-box[data-box="0"]').boundingBox();
  const stage = await page.locator('.us-stage').boundingBox();
  if (!box || !stage) throw new Error('The box is not visible');
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  await drag(page, from, { x: from.x + stage.width, y: from.y + stage.height });

  await expect.poll(() => getSource(page)).toBe(source);
});

test('a clamped drag adds no undo step', async ({ page }) => {
  const source = '# A\n\n::: box col=9-12 row=4-6\nAt the edge\n:::\n';
  const edited = `${source}Unrelated edit\n`;
  await openDeck(page, source);
  await editor(page).focus();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('Unrelated edit\n');
  await expect.poll(() => getSource(page)).toBe(edited);

  const box = await page.locator('.us-box[data-box="0"]').boundingBox();
  const stage = await page.locator('.us-stage').boundingBox();
  if (!box || !stage) throw new Error('The box is not visible');
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await drag(page, from, { x: from.x + stage.width, y: from.y + stage.height });
  await expect.poll(() => getSource(page)).toBe(edited);

  await editor(page).focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => getSource(page)).toBe(source);
});

test('pointer cancellation clears a drag without writing an edit', async ({ page }) => {
  const source = '# A\n\n::: box col=1-3 row=1-2\nMove me\n:::\n';
  await openDeck(page, source);
  const box = await page.locator('.us-box[data-box="0"]').boundingBox();
  const stage = await page.locator('.us-stage').boundingBox();
  if (!box || !stage) throw new Error('The box is not visible');
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + stage.width / 12, from.y, { steps: 4 });
  await expect(page.locator('.us-ghost')).toBeVisible();
  await page.locator('.slide-frame').dispatchEvent('pointercancel', {
    pointerId: 1,
    pointerType: 'mouse',
    bubbles: true,
  });

  await expect(page.locator('.us-ghost')).toHaveCount(0);
  await expect(page.locator('.slide-frame')).not.toHaveClass(/us-dragging/);
  await page.mouse.up();
  await expect.poll(() => getSource(page)).toBe(source);
});

test('the landing outline and grid lines show while dragging, even with the grid off', async ({ page }) => {
  await openDeck(page, '# A\n\n::: box col=1-3 row=1-2\nMove me\n:::\n');
  await page.getByLabel('Grid lines').uncheck();
  await expect(page.locator('.us-grid')).toHaveCount(0);
  const box = await page.locator('.us-box[data-box="0"]').boundingBox();
  const stage = await page.locator('.us-stage').boundingBox();
  if (!box || !stage) throw new Error('The box is not visible');
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + stage.width / 12, from.y, { steps: 4 });
  await expect(page.locator('.us-ghost')).toBeVisible();
  await expect(page.locator('.us-grid')).toBeVisible();
  await page.mouse.up();

  await expect(page.locator('.us-ghost')).toHaveCount(0);
  await expect(page.locator('.us-grid')).toHaveCount(0);
});

test('dragging on empty space draws a new box', async ({ page }) => {
  await openDeck(page, '# A\n');
  const from = await gridPoint(page, 7, 4);
  const to = await gridPoint(page, 9, 5);

  await drag(page, from, to);

  await expect.poll(() => getSource(page)).toBe('# A\n\n::: box col=7-9 row=4-5\n\n:::\n');
  await expect(typingArea(page)).toBeFocused();
});

test('double-clicking empty space makes a 3x2 box, smaller at the edge', async ({ page }) => {
  const source = '# A\n';
  await openDeck(page, source);
  await page.locator('.us-loose h1').dblclick();
  expect(await getSource(page)).toBe(source);

  const middle = await gridPoint(page, 5, 3);
  await page.mouse.dblclick(middle.x, middle.y);
  await expect.poll(() => getSource(page)).toContain('::: box col=5-7 row=3-4\n\n:::');
  await expect(typingArea(page)).toBeFocused();

  const edge = await gridPoint(page, 12, 6);
  await page.mouse.dblclick(edge.x, edge.y);
  await expect.poll(() => getSource(page)).toContain('::: box col=12 row=6\n\n:::');
  await expect(typingArea(page)).toBeFocused();
});

test('a single click on empty space never makes a box', async ({ page }) => {
  const source = '# A\n';
  await openDeck(page, source);
  const point = await gridPoint(page, 8, 5);

  await page.mouse.click(point.x, point.y);

  await page.waitForTimeout(200);
  expect(await getSource(page)).toBe(source);
});

test('Add box puts a 4x2 box in the first free area, or the middle when full', async ({ page }) => {
  await openDeck(page, '::: box col=1-12 row=1\nTop\n:::\n');
  await page.getByRole('button', { name: 'Add box' }).click();
  await expect.poll(() => getSource(page)).toContain('::: box col=1-4 row=2-3\n\n:::');
  await expect(typingArea(page)).toBeFocused();

  await openDeck(page, '::: box col=1-12 row=1-6\nFull\n:::\n');
  await page.getByRole('button', { name: 'Add box' }).click();
  await expect.poll(() => getSource(page)).toContain('::: box col=5-8 row=3-4\n\n:::');
  await expect(typingArea(page)).toBeFocused();
});
