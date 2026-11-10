import { expect, test, type Page } from '@playwright/test';

const editor = (page: Page) => page.getByRole('textbox', { name: 'Deck source' });
const typingArea = (page: Page) => page.getByRole('textbox', { name: 'Markdown on slide' });
const getSource = (page: Page) => page.evaluate(() => window.__uslides!.getSource());

async function openDeck(page: Page, source: string) {
  await page.goto(`/?test#md=${encodeURIComponent(source)}`);
  await expect(page.locator('.slide-frame .us-stage')).toHaveCount(1);
  await expect(editor(page)).toBeVisible();
}

async function clickBox(page: Page, index = 0) {
  const rect = await page.locator(`.us-box[data-box="${index}"]`).boundingBox();
  if (!rect) throw new Error(`Box ${index} is not visible`);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
}

test('clicking a box selects it and moves the cursor to its opening line', async ({ page }) => {
  const source = '# A\n\n::: box col=1-6 row=1-3\nLeft\n:::\n';
  await openDeck(page, source);

  await clickBox(page);

  const selection = page.locator('.us-selection[data-box="0"]');
  await expect(selection).toBeVisible();
  await expect(selection.locator('.us-handle')).toHaveCount(8);
  await editor(page).focus();
  await page.keyboard.insertText('@');
  await expect.poll(() => getSource(page)).toBe(source.replace('::: box', '@::: box'));
});

test('clicking the same spot again selects the box underneath', async ({ page }) => {
  await openDeck(page, '# A\n\n::: box col=1-6 row=1-3\nUnder\n:::\n\n::: box col=1-6 row=1-3\nTop\n:::\n');

  await clickBox(page, 1);
  await expect(page.locator('.us-selection[data-box="1"]')).toBeVisible();
  await clickBox(page, 1);

  await expect(page.locator('.us-selection[data-box="0"]')).toBeVisible();
});

test('Fill colour writes bg on the opening line only', async ({ page }) => {
  await openDeck(page, '# A\n\n::: box col=1-6 row=1-3\nText with bg=untouched\n:::\n');
  await clickBox(page);

  await page.getByRole('button', { name: 'Fill colour' }).click();
  await page.locator('.us-colour-swatch').first().click();

  await expect.poll(() => getSource(page)).toBe(
    '# A\n\n::: box col=1-6 row=1-3 bg=#dbeafe\nText with bg=untouched\n:::\n',
  );
});

test('None removes the attribute', async ({ page }) => {
  await openDeck(page, '# A\n\n::: box col=1-6 row=1-3 bg=#dbeafe\nLeft\n:::\n');
  await clickBox(page);

  await page.getByRole('button', { name: 'Fill colour' }).click();
  await page.getByRole('button', { name: 'None' }).click();

  await expect.poll(() => getSource(page)).toBe('# A\n\n::: box col=1-6 row=1-3\nLeft\n:::\n');
});

test('a custom colour is applied on change and is one undo step', async ({ page }) => {
  const source = '# A\n\n::: box col=1-6 row=1-3\nLeft\n:::\n';
  await openDeck(page, source);
  await clickBox(page);
  await page.getByRole('button', { name: 'Fill colour' }).click();
  const custom = page.getByLabel('Custom fill colour');

  await custom.evaluate((input) => {
    const colour = input as HTMLInputElement;
    colour.value = '#112233';
    colour.dispatchEvent(new Event('input', { bubbles: true }));
    colour.value = '#445566';
    colour.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(await getSource(page)).toBe(source);
  await custom.dispatchEvent('change');
  await expect.poll(() => getSource(page)).toContain('bg=#445566');

  await page.locator('.slide-frame').focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => getSource(page)).toBe(source);
});

test('align and valign buttons write align= and valign=', async ({ page }) => {
  await openDeck(page, '# A\n\n::: box col=1-6 row=1-3\nLeft\n:::\n');
  await clickBox(page);

  await page.getByRole('button', { name: 'Centre' }).click();
  await expect.poll(() => getSource(page)).toContain('align=center');
  await page.getByRole('button', { name: 'Bottom' }).click();

  await expect.poll(() => getSource(page)).toContain('align=center valign=bottom');
});

test('Left and Top remove the default alignment attributes', async ({ page }) => {
  await openDeck(page, '# A\n\n::: box col=1-6 row=1-3 align=center valign=bottom\nLeft\n:::\n');
  await clickBox(page);

  await page.getByRole('button', { name: 'Left' }).click();
  await page.getByRole('button', { name: 'Top' }).click();

  await expect.poll(() => getSource(page)).toBe('# A\n\n::: box col=1-6 row=1-3\nLeft\n:::\n');
});

test('Bring to front, Send to back, Duplicate and Delete change the blocks', async ({ page }) => {
  await openDeck(page, '# A\n\n::: box col=1-6 row=1-3\nA box\n:::\n\n::: box col=7-12 row=4-6\nB box\n:::\n');
  await clickBox(page, 0);
  const bar = page.locator('.us-floating-bar');

  await bar.getByRole('button', { name: 'Bring to front' }).click();
  await expect.poll(() => getSource(page).then((source) => source.indexOf('A box') > source.indexOf('B box'))).toBe(true);
  await expect(page.locator('.us-selection[data-box="1"]')).toBeVisible();

  await bar.getByRole('button', { name: 'Send to back' }).click();
  await expect.poll(() => getSource(page).then((source) => source.indexOf('A box') < source.indexOf('B box'))).toBe(true);
  await expect(page.locator('.us-selection[data-box="0"]')).toBeVisible();

  await bar.getByRole('button', { name: 'Duplicate' }).click();
  await expect.poll(() => getSource(page).then((source) => source.match(/A box/g)?.length)).toBe(2);
  await expect.poll(() => getSource(page)).toContain('::: box col=2-7 row=2-4\nA box');
  await expect(page.locator('.us-selection[data-box="2"]')).toBeVisible();

  await bar.getByRole('button', { name: 'Delete' }).click();
  await expect.poll(() => getSource(page).then((source) => source.match(/A box/g)?.length)).toBe(1);
  await expect(page.locator('.us-selection')).toHaveCount(0);
});

test('arrow keys move one cell, Shift+arrow grows from the right or bottom', async ({ page }) => {
  await openDeck(page, '# A\n\n::: box col=1-6 row=1-3\nLeft\n:::\n');
  await clickBox(page);

  await page.keyboard.press('ArrowRight');
  await expect.poll(() => getSource(page)).toContain('col=2-7 row=1-3');
  await page.keyboard.press('Shift+ArrowDown');

  await expect.poll(() => getSource(page)).toContain('col=2-7 row=1-4');
});

test('Delete removes the box, Ctrl/Cmd+D duplicates, Esc deselects', async ({ page }) => {
  const source = '# A\n\n::: box col=1-6 row=1-3\nLeft\n:::\n';
  await openDeck(page, source);
  await clickBox(page);

  await page.keyboard.press('ControlOrMeta+d');
  await expect.poll(() => getSource(page).then((text) => text.match(/Left/g)?.length)).toBe(2);
  await expect(page.locator('.us-selection[data-box="1"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.us-selection')).toHaveCount(0);

  await clickBox(page, 0);
  await page.keyboard.press('Delete');
  await expect.poll(() => getSource(page).then((text) => text.match(/Left/g)?.length)).toBe(1);
  await expect(page.locator('.us-selection')).toHaveCount(0);
});

test('the bar sits below the box when there is no room above', async ({ page }) => {
  await openDeck(page, '# A\n\n::: box col=1-6 row=1\nTop\n:::\n');
  await clickBox(page);

  const box = await page.locator('.us-selection').boundingBox();
  const bar = await page.locator('.us-floating-bar').boundingBox();
  expect(box).not.toBeNull();
  expect(bar).not.toBeNull();
  expect(bar!.y).toBeGreaterThan(box!.y + box!.height);
});

test('no selection on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto(`/?test#md=${encodeURIComponent('# A\n\n::: box col=1-6 row=1-3\nLeft\n:::\n')}`);
  await expect(page.locator('.us-box')).toBeVisible();

  await clickBox(page);

  await expect(page.locator('.us-selection')).toHaveCount(0);
  await expect(page.locator('.slide-frame')).toHaveAttribute('role', 'button');
});

test('the editable slide is a named group and announces box selection', async ({ page }) => {
  await openDeck(page, '# A\n\n::: box col=1-6 row=1-3\nLeft\n:::\n');
  const frame = page.locator('.slide-frame');
  await expect(frame).toHaveAttribute('role', 'group');
  await expect(frame).toHaveAccessibleName('Slide 1');

  await clickBox(page);
  await expect(page.locator('.us-selection-status')).toHaveText('Box 1 selected');
  await page.keyboard.press('Escape');
  await expect(page.locator('.us-selection-status')).toHaveText('');
});

test('Enter and Space on an editable frame select its slide without Space scrolling', async ({ page }) => {
  const source = '# One\n---\n# Two\n';
  for (const [key, marker] of [['Enter', '@'], ['Space', '%']] as const) {
    await page.goto(`/?test#md=${encodeURIComponent(source)}`);
    await expect(page.locator('.slide-frame .us-stage')).toHaveCount(2);
    await expect(editor(page)).toBeVisible();
    await editor(page).focus();
    await page.keyboard.press('ControlOrMeta+Home');
    const frame = page.locator('.slide-frame').nth(1);
    await frame.focus();
    const scrollBefore = await page.evaluate(() => ({
      page: window.scrollY,
      preview: document.querySelector('.preview-scroll')?.scrollTop ?? 0,
    }));

    await page.keyboard.press(key);

    expect(await page.evaluate(() => ({
      page: window.scrollY,
      preview: document.querySelector('.preview-scroll')?.scrollTop ?? 0,
    }))).toEqual(scrollBefore);
    await editor(page).focus();
    await page.keyboard.insertText(marker);
    const updated = await getSource(page);
    expect(updated.indexOf(marker)).toBeGreaterThan(updated.indexOf('---'));
  }
});

test('Space keeps a selected box focused and Enter starts typing', async ({ page }) => {
  await openDeck(page, '::: box col=1-6 row=1-3\nWrite here\n:::\n');
  const frame = page.locator('.slide-frame');
  await clickBox(page);

  await page.keyboard.press('Space');

  await expect(frame).toBeFocused();
  await expect(page.locator('.us-selection[data-box="0"]')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(typingArea(page)).toBeFocused();
});

test('floating bar controls can be used with the keyboard', async ({ page }) => {
  await openDeck(page, '# A\n\n::: box col=1-6 row=1-3\nLeft\n:::\n');
  await clickBox(page);

  await page.locator('.us-floating-bar').getByRole('button', { name: 'Centre' }).focus();
  await page.keyboard.press('Enter');

  await expect.poll(() => getSource(page)).toContain('align=center');
});

test('the floating bar stays usable at the minimum editing width', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await openDeck(page, '# A\n\n::: box col=1-6 row=1-3\nLeft\n:::\n');
  await clickBox(page);

  const frame = await page.locator('.slide-frame').boundingBox();
  const first = await page.locator('.us-floating-bar').getByRole('button', { name: 'Fill colour' }).boundingBox();
  const last = await page.locator('.us-floating-bar').getByRole('button', { name: 'Delete' }).boundingBox();
  expect(frame).not.toBeNull();
  expect(first).not.toBeNull();
  expect(last).not.toBeNull();
  expect(first!.x).toBeGreaterThanOrEqual(frame!.x);
  expect(last!.x + last!.width).toBeLessThanOrEqual(frame!.x + frame!.width);
});

test('editor and custom colour input keys do not edit the selected box', async ({ page }) => {
  const source = '# A\n\n::: box col=1-6 row=1-3\nLeft\n:::\n';
  await openDeck(page, source);
  await clickBox(page);

  await editor(page).focus();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Delete');
  await page.keyboard.press('ArrowRight');
  expect(await getSource(page)).toBe(source);

  await page.getByRole('button', { name: 'Fill colour' }).click();
  await page.getByLabel('Custom fill colour').focus();
  await page.keyboard.press('Delete');
  await page.keyboard.press('ArrowRight');
  expect(await getSource(page)).toBe(source);
});

test('a detached stage keeps the last selection geometry', async ({ page }) => {
  await openDeck(page, '# A\n\n::: box col=1-6 row=1-3\nLeft\n:::\n');
  await clickBox(page);
  const before = await page.locator('.us-selection').boundingBox();
  expect(before).not.toBeNull();

  await page.locator('.us-stage').evaluate((stage) => stage.remove());
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));

  await expect.poll(async () => page.locator('.us-selection').boundingBox()).toEqual(before);
});

test('an edit clears a selection whose fresh box no longer exists', async ({ page }) => {
  const first = '::: box col=1-3 row=1-2\nFirst\n:::\n';
  const second = '\n::: box col=4-6 row=1-2\nSecond\n:::\n';
  await openDeck(page, first + second);
  await clickBox(page, 1);

  await editor(page).focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(first);
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('.us-floating-bar button[aria-label="Centre"]');
    button?.click();
  });
  await expect.poll(() => getSource(page)).toBe(first);

  await editor(page).focus();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(second);
  await expect(page.locator('.us-box')).toHaveCount(2);
  await expect(page.locator('.us-selection')).toHaveCount(0);
});

test('a non-primary pointer button does not select a box', async ({ page }) => {
  await openDeck(page, '# A\n\n::: box col=1-6 row=1-3\nLeft\n:::\n');
  const rect = await page.locator('.us-box[data-box="0"]').boundingBox();
  if (!rect) throw new Error('Box 0 is not visible');

  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2, { button: 'right' });

  await expect(page.locator('.us-selection')).toHaveCount(0);
});
