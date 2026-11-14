import { expect, test, type Page } from '@playwright/test';
import { moreMenu, renameDeck } from './helpers/app';

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

test('the gutter shows the first and later line numbers', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await setSource(page, '# First\nSecond\nThird\n');
  const gutter = page.locator('.cm-lineNumbers');

  await expect(gutter).toBeVisible();
  await expect(gutter.locator('.cm-gutterElement').filter({ hasText: /^1$/ })).toBeVisible();
  await expect(gutter.locator('.cm-gutterElement').filter({ hasText: /^3$/ })).toBeVisible();
});

test('Tab indents selected lines by two spaces and Shift+Tab removes them', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await setSource(page, '# First\nSecond\n');
  await editor(page).press('ControlOrMeta+Home');
  await editor(page).press('Shift+End');

  await editor(page).press('Tab');
  await expect.poll(() => getSource(page)).toBe('  # First\nSecond\n');
  await editor(page).press('Shift+Tab');

  await expect.poll(() => getSource(page)).toBe('# First\nSecond\n');
});

test('Escape then Tab moves focus from the editor to the next control', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await editor(page).focus();

  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');

  await expect(page.getByRole('separator', { name: 'Resize editor' })).toBeFocused();
});

test('Cmd or Ctrl+F opens search and finds every copy', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await setSource(page, '# Find needle\nAnother needle\n');
  await editor(page).press('ControlOrMeta+f');
  const find = page.getByRole('textbox', { name: 'Find' });

  await expect(find).toBeVisible();
  await find.pressSequentially('needle');
  await find.press('Enter');
  const result = page.locator('[aria-live="polite"]').filter({ hasText: /current match/ });
  await expect(result).toContainText('on line 1');
  await find.press('Enter');

  await expect(result).toContainText('on line 2');
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

  await renameDeck(page, 'Quarterly plan');
  await expect(items.first()).toContainText('Quarterly plan');
  await expect.poll(() => getSource(page)).toContain('title: Quarterly plan');

  await moreMenu(page, 'Duplicate deck');
  await expect(items).toHaveCount(3);
  await expect(items.filter({ hasText: 'Quarterly plan' })).toHaveCount(2);

  await moreMenu(page, 'Delete deck');
  await expect(items).toHaveCount(2);
  await expect(page.getByText('Deleted "Quarterly plan".', { exact: true })).toBeVisible();
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

async function setSource(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
}

const bullets = (n: number) => Array.from({ length: n }, (_, i) => `- point number ${i + 1}`).join('\n');
const BOX_CUT = 'Text in this box is cut off. Shorten it or make the box bigger.';
const SLIDE_CUT = 'Text on this slide is cut off. Shorten it or split the slide.';

test('text cut off in a box is a warning on the box line, and shortening it clears it', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await setSource(page, `# Title\n---\n::: box col=1-3 row=1\n${bullets(30)}\n:::\n`);
  const marker = page.locator('.cm-lintRange-warning');
  await expect(marker).toHaveCount(1);
  await expect(marker).toHaveText('::: box col=1-3 row=1');
  await marker.hover();
  await expect(page.locator('.cm-tooltip-lint')).toContainText(BOX_CUT);
  await expect(page.locator('.slide-warning')).toHaveText([BOX_CUT]);

  await setSource(page, '# Title\n---\n::: box col=1-3 row=1\nShort\n:::\n');
  await expect(page.locator('.us-stage', { hasText: 'Short' })).toHaveCount(1);
  await expect(marker).toHaveCount(0);
  await expect(page.locator('.slide-warning')).toHaveCount(0);
});

test('text cut off on a slide without boxes is a warning on its first line', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await setSource(page, `# Title\n---\n\n## Too much\n${bullets(60)}\n`);
  const marker = page.locator('.cm-lintRange-warning');
  await expect(marker).toHaveCount(1);
  await expect(marker).toHaveText('## Too much');
  await marker.hover();
  await expect(page.locator('.cm-tooltip-lint')).toContainText(SLIDE_CUT);
});

test('on a narrow screen, cut-off text shows a warning under the slide', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  const md = `# Crowded\n\n${bullets(60)}\n`;
  await page.goto(`/?test#md=${encodeURIComponent(md)}`);
  await expect(page.locator('.us-stage').first()).toContainText('Crowded');
  await expect(editor(page)).toHaveCount(0);
  await expect(page.locator('.slide-warning')).toHaveText([SLIDE_CUT]);
});

test('clicking a slide moves the cursor to it', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await expect(editor(page)).toBeVisible(); // the editor loads lazily
  // Slide 3's centre is a box, so use its top row, which only has the title, to select the slide itself.
  await page.getByRole('group', { name: 'Slide 3' }).click({ position: { x: 10, y: 10 } });
  await page.keyboard.type('@@');
  const src = await getSource(page);
  expect(src.indexOf('@@')).toBeGreaterThan(src.indexOf('# The basics'));
  expect(src.indexOf('@@')).toBeGreaterThan(src.indexOf('What you type'));
  expect(src.indexOf('@@')).toBeLessThan(src.indexOf('# Boxes go anywhere'));
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

test('rename right after typing keeps the typed text, with no conflict notice', async ({ page }) => {
  // Make every write report "done" 300 ms late, so a save is still in flight when the user acts again.
  await page.addInitScript(() => {
    const add = IDBTransaction.prototype.addEventListener;
    IDBTransaction.prototype.addEventListener = function (this: IDBTransaction, type: string, fn: EventListenerOrEventListenerObject, ...rest: unknown[]) {
      if (type === 'complete' && (window as unknown as { slowWrites?: boolean }).slowWrites) {
        const slow: EventListener = (e) => setTimeout(() => (typeof fn === 'function' ? fn(e) : fn.handleEvent(e)), 300);
        return add.call(this, type, slow, ...(rest as [boolean]));
      }
      return add.call(this, type, fn, ...(rest as [boolean]));
    } as typeof add;
  });
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await page.evaluate(() => ((window as unknown as { slowWrites: boolean }).slowWrites = true));

  await typeAtEnd(page, '\nfirst');
  await page.waitForTimeout(450); // the save has started and is waiting
  await page.keyboard.type(' second');
  await renameDeck(page, 'Renamed');

  await expect.poll(() => getSource(page)).toContain('title: Renamed');
  expect(await getSource(page)).toContain('first second');
  await page.waitForTimeout(1200);
  await expect(page.getByText('This deck changed in another tab')).toHaveCount(0);
  await expect(page.getByText(/Could not save/)).toHaveCount(0);
  expect(await getSource(page)).toContain('first second');

  await page.reload();
  await expect.poll(() => getSource(page)).toContain('first second');
  expect(await getSource(page)).toContain('title: Renamed');
});

test('a link to a deck that does not exist shows another deck', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  const items = page.getByRole('navigation', { name: 'Decks' }).getByRole('listitem');
  const idA = new URL(page.url()).hash.replace('#/deck/', '');

  await page.getByRole('button', { name: 'New deck' }).click();
  await expect(items).toHaveCount(2);
  await items.filter({ hasText: 'Welcome to uslides' }).getByRole('button').click();
  await expect.poll(() => page.url()).toContain(idA);
  await moreMenu(page, 'Delete deck');
  await expect(items).toHaveCount(1);

  await page.evaluate((id) => {
    location.hash = `#/deck/${id}`;
  }, idA);
  await expect(page.getByRole('textbox', { name: 'Deck source' })).toBeVisible();
  await expect.poll(() => getSource(page)).toBe('# Untitled\n');
  expect(page.url()).not.toContain(idA);
  // Toolbar actions still work.
  await moreMenu(page, 'Duplicate deck');
  await expect(items).toHaveCount(2);
});

test('a --- line that starts a slide shows the slide number and title', async ({ page }) => {
  const source = '# One\n\n---\n\n# Second slide\n\n```\n---\n```\n\n---\n\nNo heading\n';
  await page.goto(`/?test#md=${encodeURIComponent(source)}`);
  const editor = page.getByRole('textbox', { name: 'Deck source' });
  await expect(editor).toBeVisible();

  const labels = page.locator('.editor .cm-slide-label');
  await expect(labels).toHaveText(['Slide 2 · Second slide', 'Slide 3']);
  // The dashes inside the code block are not a divider.
  await expect(page.locator('.editor .cm-slide-divider')).toHaveCount(2);

  // The label follows the text as it is typed, and the text itself is untouched.
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\n---\n\n# Fresh');
  await expect(labels).toHaveText(['Slide 2 · Second slide', 'Slide 3', 'Slide 4 · Fresh']);
  expect(await page.evaluate(() => window.__uslides!.getSource!())).toContain('\n---\n\n# Fresh');
});
