import { expect, test, type Page } from '@playwright/test';

const editor = (page: Page) => page.getByRole('textbox', { name: 'Deck source' });
const typingArea = (page: Page) => page.getByRole('textbox', { name: 'Markdown on slide' });
const getSource = (page: Page) => page.evaluate(() => window.__uslides!.getSource());

async function openDeck(page: Page, source: string) {
  await page.goto(`/?test#md=${encodeURIComponent(source)}`);
  await expect(page.locator('.slide-frame .us-stage')).toHaveCount(1);
  await expect(editor(page)).toBeVisible();
}

test('double-clicking a box shows its Markdown and typing updates the editor', async ({ page }) => {
  await openDeck(page, '::: box col=1-6\n**Hi**\n:::');

  await page.locator('.us-box[data-box="0"]').dblclick();

  await expect(typingArea(page)).toHaveText('**Hi**');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(' there');
  await expect.poll(() => getSource(page)).toBe('::: box col=1-6\n**Hi** there\n:::');
});

test('Enter on a selected box starts typing; Esc or a click outside stops', async ({ page }) => {
  await openDeck(page, '::: box col=1-6 row=1-3\nWrite here\n:::\n');
  await page.locator('.us-box[data-box="0"]').click();

  await page.keyboard.press('Enter');
  await expect(typingArea(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(typingArea(page)).toHaveCount(0);

  await page.locator('.us-box[data-box="0"]').dblclick();
  await expect(typingArea(page)).toBeFocused();
  await editor(page).click();
  await expect(typingArea(page)).toHaveCount(0);
});

test('Ctrl/Cmd+Z in the typing area undoes a burst of typing, not one letter', async ({ page }) => {
  await openDeck(page, '::: box col=1-6\nx\n:::\n');
  await page.locator('.us-box[data-box="0"]').dblclick();
  await expect(typingArea(page)).toBeFocused();
  await page.keyboard.press('ControlOrMeta+End');

  await page.keyboard.type('abc');
  await expect.poll(() => getSource(page)).toContain('\nxabc\n:::');
  await page.keyboard.press('ControlOrMeta+z');

  await expect(typingArea(page)).toHaveText('x');
  await expect.poll(() => getSource(page)).toBe('::: box col=1-6\nx\n:::\n');

  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(typingArea(page)).toHaveText('xabc');
  await expect.poll(() => getSource(page)).toContain('\nxabc\n:::');
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+y');
  await expect(typingArea(page)).toHaveText('xabc');
  await expect.poll(() => getSource(page)).toContain('\nxabc\n:::');
});

test('double-clicking free-flowing text edits only that piece', async ({ page }) => {
  const source = '# Top\n\n::: box\nx\n:::\n\nBottom\n';
  await openDeck(page, source);

  await page.locator('.us-loose').getByText('Bottom', { exact: true }).dblclick();

  await expect(typingArea(page)).toHaveText('Bottom');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('!');
  await expect.poll(() => getSource(page)).toBe('# Top\n\n::: box\nx\n:::\n\nBottom!\n');
});

test('a rendered block maps to the middle of three free-flowing pieces', async ({ page }) => {
  const source = [
    '# Top',
    '',
    '::: box col=10-12 row=5-6',
    'x',
    ':::',
    '',
    'Middle',
    '',
    '::: box col=10-12 row=5-6',
    'y',
    ':::',
    '',
    'Bottom',
    '',
  ].join('\n');
  await openDeck(page, source);

  await page.locator('.us-loose').getByText('Middle', { exact: true }).dblclick();
  await expect(typingArea(page)).toHaveText('Middle');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('!');

  await expect.poll(() => getSource(page)).toBe(source.replace('\nMiddle\n', '\nMiddle!\n'));
});

test('a new box from Add box goes straight into typing', async ({ page }) => {
  await openDeck(page, '# A\n');

  await page.getByRole('button', { name: 'Add box' }).click();

  await expect(typingArea(page)).toBeFocused();
  await page.keyboard.insertText('New box');
  await expect.poll(() => getSource(page)).toContain('::: box col=1-4 row=1-2\nNew box\n:::');
});

test('typing in an existing empty box keeps its closing marker on a separate line', async ({ page }) => {
  await openDeck(page, '::: box col=1-6\n:::\n');
  await page.locator('.us-box[data-box="0"]').dblclick();
  await expect(typingArea(page)).toBeFocused();

  await page.keyboard.insertText('Ready');

  await expect.poll(() => getSource(page)).toBe('::: box col=1-6\nReady\n:::\n');
});

test('long text scrolls inside the box instead of growing it', async ({ page }) => {
  const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n');
  await openDeck(page, `::: box col=1-4 row=1\n${lines}\n:::\n`);
  await page.locator('.us-box[data-box="0"]').dblclick();

  const box = await page.locator('.us-box[data-box="0"]').boundingBox();
  const area = await page.locator('.us-typing-area').boundingBox();
  expect(box).not.toBeNull();
  expect(area).not.toBeNull();
  expect(Math.abs(area!.height - box!.height)).toBeLessThanOrEqual(1);
  const scrolls = await page.locator('.us-typing-area .cm-scroller').evaluate(
    (el) => el.scrollHeight > el.clientHeight,
  );
  expect(scrolls).toBe(true);
});
