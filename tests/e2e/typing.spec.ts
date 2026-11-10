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
  await expect(page.locator('.us-selection')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.us-selection')).toHaveCount(0);

  await page.locator('.us-box[data-box="0"]').dblclick();
  await expect(typingArea(page)).toBeFocused();
  await editor(page).click();
  await expect(typingArea(page)).toHaveCount(0);
});

test('rapid typing in an empty box never drops a key while the parsed deck catches up', async ({ page }) => {
  await openDeck(page, '::: box col=1-6\n:::\n');
  await page.locator('.us-box[data-box="0"]').dblclick();

  await page.keyboard.type('abc');

  await expect.poll(() => getSource(page)).toBe('::: box col=1-6\nabc\n:::\n');
  await expect(typingArea(page)).toHaveText('abc');
});

test('five immediate keys including Enter reach a box that already has text', async ({ page }) => {
  await openDeck(page, '::: box col=1-6\nStart\n:::\n');
  await page.locator('.us-box[data-box="0"]').dblclick();

  await page.keyboard.type('ab');
  await page.keyboard.press('Enter');
  await page.keyboard.type('cd');

  await expect.poll(() => getSource(page)).toBe('::: box col=1-6\nab\ncdStart\n:::\n');
  await expect(typingArea(page).locator('.cm-line')).toHaveText(['ab', 'cdStart']);
});

test('a key reaches the right box after the cached parse becomes stale', async ({ page }) => {
  const source = 'Before\n\n::: box col=1-6\nStart\n:::\n';
  await openDeck(page, source);
  await page.locator('.us-box[data-box="0"]').dblclick();
  await expect(typingArea(page)).toHaveText('Start');

  await editor(page).focus();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.insertText('Shifted\n');
  await typingArea(page).focus();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('!');

  await expect.poll(() => getSource(page)).toBe(`Shifted\n${source.replace('Start', 'Start!')}`);
  await expect(typingArea(page)).toHaveText('Start!');
});

test('keys wait for a slow typing-area chunk and replay in order', async ({ page }) => {
  let releaseChunk = () => {};
  const chunkBlocked = new Promise<void>((resolve) => {
    releaseChunk = resolve;
  });
  await page.route('**/assets/TypingArea-*.js', async (route) => {
    await chunkBlocked;
    await route.continue();
  });
  await openDeck(page, '::: box col=1-6\nStart\n:::\n');
  await page.locator('.us-box[data-box="0"]').dblclick();

  await page.keyboard.type('ab');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter');
  await page.keyboard.type('c');
  releaseChunk();

  await expect.poll(() => getSource(page)).toBe('::: box col=1-6\na\ncStart\n:::\n');
  await expect(typingArea(page).locator('.cm-line')).toHaveText(['a', 'cStart']);
});

test('editing keys wait for the typing area and never edit the selected box', async ({ page }) => {
  let releaseChunk = () => {};
  const chunkBlocked = new Promise<void>((resolve) => {
    releaseChunk = resolve;
  });
  await page.route('**/assets/TypingArea-*.js', async (route) => {
    await chunkBlocked;
    await route.continue();
  });
  const source = '::: box col=1-6 row=1-3\n  item\n:::\n';
  await openDeck(page, source);
  await page.locator('.us-box[data-box="0"]').dblclick();

  await page.locator('.slide-frame').dispatchEvent('keydown', { key: 'd', ctrlKey: true });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Delete');
  await page.locator('.slide-frame').dispatchEvent('keydown', { key: '@', altKey: true });
  await page.locator('.slide-frame').dispatchEvent('keydown', { key: 'Dead' });
  await page.locator('.slide-frame').dispatchEvent('keydown', { key: 'Process' });
  await page.locator('.slide-frame').dispatchEvent('keydown', { key: 'x', isComposing: true });
  await page.keyboard.press('Enter');
  await page.keyboard.type('z');
  const beforeReady = await getSource(page);
  releaseChunk();

  expect(beforeReady).toBe(source);
  await expect.poll(() => getSource(page)).toBe('::: box col=1-6 row=1-3\n  @\n  ztem\n:::\n');
  await expect(page.locator('.us-box')).toHaveCount(1);
  await expect(typingArea(page).locator('.cm-line')).toHaveText(['  @', '  ztem']);
});

test('Escape before the typing area is ready stops typing but keeps the selection', async ({ page }) => {
  let releaseChunk = () => {};
  const chunkBlocked = new Promise<void>((resolve) => {
    releaseChunk = resolve;
  });
  await page.route('**/assets/TypingArea-*.js', async (route) => {
    await chunkBlocked;
    await route.continue();
  });
  const source = '::: box col=1-6 row=1-3\nStart\n:::\n';
  await openDeck(page, source);
  await page.locator('.us-box[data-box="0"]').dblclick();

  await page.keyboard.press('Escape');
  releaseChunk();

  await expect(typingArea(page)).toHaveCount(0);
  await expect(page.locator('.us-selection[data-box="0"]')).toBeVisible();
  expect(await getSource(page)).toBe(source);
});

test('typing stops when its loose source piece no longer renders an element', async ({ page }) => {
  const source = '[ref]: https://example.com';
  await openDeck(page, 'Visible text');
  await page.locator('.us-loose').getByText('Visible text', { exact: true }).dblclick();
  await expect(typingArea(page)).toBeFocused();

  await editor(page).focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(source);
  await expect.poll(() => getSource(page)).toBe(source);
  await expect(page.locator('.us-loose [data-line]')).toHaveCount(0);
  await expect(typingArea(page)).toHaveCount(0);

  const frame = page.locator('.slide-frame');
  await frame.focus();
  await page.keyboard.press('Space');

  await expect(editor(page)).toBeFocused();
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

test('Windows and Linux undo and redo keys work in every editing surface', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { value: 'Linux x86_64' });
  });
  await openDeck(page, '::: box col=1-6\nx\n:::\n');
  expect(await page.evaluate(() => navigator.platform)).toBe('Linux x86_64');
  await page.locator('.us-box[data-box="0"]').dblclick();
  await expect(typingArea(page)).toBeFocused();
  await page.keyboard.press('Control+End');

  await page.keyboard.type('abc');
  await expect.poll(() => getSource(page)).toContain('\nxabc\n:::');
  await page.keyboard.press('Control+z');
  await expect(typingArea(page)).toHaveText('x');

  await page.keyboard.press('Control+y');
  await expect(typingArea(page)).toHaveText('xabc');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  await expect(typingArea(page)).toHaveText('xabc');
  await expect.poll(() => getSource(page)).toContain('\nxabc\n:::');

  await openDeck(page, '::: box col=1-6\nx\n:::\n');
  await editor(page).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('abc');
  await expect.poll(() => getSource(page)).toContain('\nx\n:::\nabc');
  await page.keyboard.press('Control+z');
  await expect.poll(() => getSource(page)).toBe('::: box col=1-6\nx\n:::\n');
  await page.keyboard.press('Control+y');
  await expect.poll(() => getSource(page)).toContain('\nx\n:::\nabc');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => getSource(page)).toContain('\nx\n:::\nabc');

  await openDeck(page, '::: box col=1-6 row=1-3\nx\n:::\n');
  await page.locator('.us-box[data-box="0"]').click();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => getSource(page)).toContain('col=2-7');
  await page.keyboard.press('Control+z');
  await expect.poll(() => getSource(page)).toContain('col=1-6');
  await page.keyboard.press('Control+y');
  await expect.poll(() => getSource(page)).toContain('col=2-7');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => getSource(page)).toContain('col=2-7');
});

test('double-clicking free-flowing text edits only that piece', async ({ page }) => {
  const source = '# Top\n\n::: box\nx\n:::\n\nBottom\n';
  await openDeck(page, source);

  const bottom = await page.locator('.us-loose').getByText('Bottom', { exact: true }).boundingBox();
  expect(bottom).not.toBeNull();
  await page.mouse.dblclick(bottom!.x + bottom!.width / 2, bottom!.y + bottom!.height / 2);

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

test('free-flowing text next to a box maps to the piece under the pointer', async ({ page }) => {
  const source = 'Intro\n::: box col=10-12 row=5-6\nx\n:::\nTail';
  await openDeck(page, source);

  await page.locator('.us-loose').getByText('Tail', { exact: true }).dblclick();
  await expect(typingArea(page)).toHaveText('Tail');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('!');

  await expect.poll(() => getSource(page)).toBe(source.replace('Tail', 'Tail!'));
});

test('a list split by a box maps each rendered list to its source piece', async ({ page }) => {
  const source = '- First\n::: box col=10-12 row=5-6\nx\n:::\n- Tail';
  await openDeck(page, source);

  await page.locator('.us-loose').getByText('Tail', { exact: true }).dblclick();
  await expect(typingArea(page)).toHaveText('- Tail');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('!');

  await expect.poll(() => getSource(page)).toBe(source.replace('- Tail', '- Tail!'));
});

test('typing a nested list covers the parent and child lines', async ({ page }) => {
  await openDeck(page, '- Parent\n  - Child');
  const parent = page.locator('.us-loose li[data-line="0"]');
  const child = page.locator('.us-loose').getByText('Child', { exact: true });
  const parentRect = await parent.evaluate((item) => {
    const text = [...item.childNodes].find((node) => node.textContent?.includes('Parent'));
    if (!text) throw new Error('Parent text is not rendered');
    const range = document.createRange();
    range.selectNodeContents(text);
    return range.getBoundingClientRect().toJSON();
  });

  await page.mouse.dblclick(parentRect.x + parentRect.width / 2, parentRect.y + parentRect.height / 2);

  const childRect = await child.boundingBox();
  const areaRect = await page.locator('.us-typing-area').boundingBox();
  expect(childRect).not.toBeNull();
  expect(areaRect).not.toBeNull();
  expect(areaRect!.y).toBeLessThanOrEqual(parentRect.y + 1);
  expect(areaRect!.y + areaRect!.height).toBeGreaterThanOrEqual(childRect!.y + childRect!.height - 1);
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

test('typing a new line in a box keeps the typing area open', async ({ page }) => {
  await openDeck(page, '::: box col=1-6\n\n:::\n');
  await page.locator('.us-box[data-box="0"]').dblclick();
  await expect(typingArea(page)).toBeFocused();

  await page.keyboard.insertText('a');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('b');

  await expect(typingArea(page).locator('.cm-line')).toHaveText(['a', 'b']);
  await expect.poll(() => getSource(page)).toBe('::: box col=1-6\na\nb\n:::\n');
});

test('typing a new line in free-flowing text keeps the typing area open', async ({ page }) => {
  await openDeck(page, 'Replace me');
  await page.locator('.us-loose').getByText('Replace me', { exact: true }).dblclick();
  await expect(typingArea(page)).toBeFocused();

  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('a');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('b');

  await expect(typingArea(page).locator('.cm-line')).toHaveText(['a', 'b']);
  await expect.poll(() => getSource(page)).toBe('a\nb');
});

test('typing after a leading new line in a box keeps the blank first line', async ({ page }) => {
  await openDeck(page, '::: box col=1-6\na\n:::\n');
  await page.locator('.us-box[data-box="0"]').dblclick();
  await expect(typingArea(page)).toBeFocused();

  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('z');

  await expect(typingArea(page).locator('.cm-line')).toHaveText(['', 'za']);
  await expect.poll(() => getSource(page)).toBe('::: box col=1-6\n\nza\n:::\n');
});

test('double-clicking inside the typing area keeps the same typing target', async ({ page }) => {
  await openDeck(page, 'Loose\n\n::: box col=1-12 row=1-6 valign=bottom\nBox\n:::');
  const loose = page.locator('.us-loose').getByText('Loose', { exact: true });
  const rect = await loose.boundingBox();
  expect(rect).not.toBeNull();
  await page.mouse.dblclick(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  await expect(typingArea(page)).toHaveText('Loose');

  await page.locator('.us-typing-area').dblclick({ position: { x: 5, y: 5 } });

  await expect(typingArea(page)).toHaveText('Loose');
});

test('editing keys in the typing area leave the box in place', async ({ page }) => {
  await openDeck(page, '::: box col=1-6 row=1-3\nabc\n:::\n');
  await page.locator('.us-box[data-box="0"]').dblclick();
  await expect(typingArea(page)).toBeFocused();
  await page.keyboard.press('ControlOrMeta+End');

  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('ArrowRight');

  await expect(page.locator('.us-box[data-box="0"]')).toHaveCount(1);
  await expect.poll(() => getSource(page)).toBe('::: box col=1-6 row=1-3\nab\n:::\n');
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
