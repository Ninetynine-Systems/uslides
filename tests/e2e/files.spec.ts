import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { installFakeFs, type FakeFs } from './fakes/fsAccess';

declare global {
  interface Window {
    __fakeFs: FakeFs;
  }
}

// A real 1x1 PNG, small enough to keep inside the fake folder.
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const editor = (page: Page) => page.getByRole('textbox', { name: 'Deck source' });
const getSource = (page: Page) => page.evaluate(() => window.__uslides!.getSource());
const badge = (page: Page) => page.getByRole('button', { name: /Linked/ });

async function openLinkedFile(page: Page, text = '# Hello from disk\n') {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await page.evaluate((t) => {
    window.__fakeFs.createFile('f1', 'talk.md', t);
    window.__fakeFs.pickFile('f1');
  }, text);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(badge(page)).toContainText('talk.md');
}

test.describe('with the File System Access API', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(installFakeFs);
  });

  test('opening a file makes a linked deck, and edits on disk show up', async ({ page }) => {
    await openLinkedFile(page);
    await expect(page.locator('.us-stage', { hasText: 'Hello from disk' })).toHaveCount(1);
    await page.evaluate(() => window.__fakeFs.setText('f1', '# Edited by an agent\n'));
    await expect(page.locator('.us-stage', { hasText: 'Edited by an agent' })).toHaveCount(1, { timeout: 2000 });
    await expect.poll(() => getSource(page)).toBe('# Edited by an agent\n');
  });

  test('typing in the app writes the file after the autosave delay', async ({ page }) => {
    await openLinkedFile(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('typed in the app');
    await expect
      .poll(() => page.evaluate(() => window.__fakeFs.getText('f1')), { timeout: 4000 })
      .toContain('typed in the app');
    // The write must not come back as a change from disk: the text stays as typed.
    const writesBefore = await page.evaluate(() => window.__fakeFs.writes('f1').length);
    await page.waitForTimeout(2500);
    expect(await getSource(page)).toContain('typed in the app');
    expect(await page.evaluate(() => window.__fakeFs.writes('f1').length)).toBe(writesBefore);
  });

  test('when both changed, the dialog lets you use the file', async ({ page }) => {
    await bothChanged(page);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('This file changed on disk and in the app. Keep which?');
    await dialog.getByRole('button', { name: 'Use file' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => getSource(page)).toBe('# From the file\n');
  });

  test('when both changed, the dialog lets you keep yours', async ({ page }) => {
    await bothChanged(page);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Keep mine' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__fakeFs.getText('f1'))).toContain('mine');
    expect(await getSource(page)).toContain('mine');
  });

  test('a picked file is read-only until the user allows writing, and syncing works either way', async ({ page }) => {
    // (a) the user allows writing when asked: live sync and write-back both work
    await openLinkedFile(page);
    await expect(page.getByRole('button', { name: /Allow/ })).toHaveCount(0);
    await page.evaluate(() => window.__fakeFs.setText('f1', '# Agent v2\n'));
    await expect.poll(() => getSource(page), { timeout: 3000 }).toBe('# Agent v2\n');
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('more');
    await expect.poll(() => page.evaluate(() => window.__fakeFs.getText('f1')), { timeout: 4000 }).toContain('more');
  });

  test('when writing is declined the file is still followed, edits stay in the app, and Allow appears', async ({ page }) => {
    await page.goto('/?test');
    await expect(page.locator('.us-stage')).toHaveCount(4);
    await page.evaluate(() => {
      window.__fakeFs.grantWriteOnRequest(false);
      window.__fakeFs.createFile('f1', 'talk.md', '# Hello from disk\n');
      window.__fakeFs.pickFile('f1');
    });
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(badge(page)).toContainText('talk.md');
    await expect(page.getByText('Edits stay in the app; allow writing to save them to the file')).toBeVisible();
    const allow = page.getByRole('button', { name: 'Allow writing to the file' });
    await expect(allow).toBeVisible();
    // Reading still follows the file.
    await page.evaluate(() => window.__fakeFs.setText('f1', '# Agent v2\n'));
    await expect.poll(() => getSource(page), { timeout: 3000 }).toBe('# Agent v2\n');
    // Typing does not write to the file.
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('local only');
    await page.waitForTimeout(2500);
    expect(await getSource(page)).toContain('local only');
    expect(await page.evaluate(() => window.__fakeFs.writes('f1').length)).toBe(0);
    // Allowing writing saves the edit to the file.
    await page.evaluate(() => window.__fakeFs.grantWriteOnRequest(true));
    await allow.click();
    await expect.poll(() => page.evaluate(() => window.__fakeFs.getText('f1')), { timeout: 4000 }).toContain('local only');
    await expect(allow).toBeHidden();
  });

  test('a file changed between the poll and the write-back is not overwritten', async ({ page }) => {
    await openLinkedFile(page);
    await page.evaluate(() => window.__fakeFs.setPermission('f1', 'prompt'));
    const allow = page.getByRole('button', { name: 'Allow access to the file again' });
    await expect(allow).toBeVisible({ timeout: 3000 });
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('mine');
    await page.waitForTimeout(700); // saved to the browser, sync is paused
    // The poll will read the old text; the agent writes right after that read.
    await page.evaluate(() => window.__fakeFs.changeAfterNextRead('f1', '# Agent edit\n'));
    await allow.click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 4000 });
    expect(await page.evaluate(() => window.__fakeFs.writes('f1').length)).toBe(0);
    expect(await page.evaluate(() => window.__fakeFs.getText('f1'))).toBe('# Agent edit\n');
  });

  test('a file that disappears is unlinked with a notice, and the deck stays', async ({ page }) => {
    await openLinkedFile(page);
    await page.evaluate(() => window.__fakeFs.remove('f1'));
    await expect(page.getByText("Can't read the linked file. It may have been moved or deleted.")).toBeVisible({
      timeout: 3000,
    });
    await expect(badge(page)).toHaveCount(0);
    await expect(page.locator('.us-stage', { hasText: 'Hello from disk' })).toHaveCount(1);
  });

  test('the Linked badge offers Unlink file', async ({ page }) => {
    await openLinkedFile(page);
    await badge(page).click();
    await page.getByRole('button', { name: 'Unlink file' }).click();
    await expect(badge(page)).toHaveCount(0);
    await page.evaluate(() => window.__fakeFs.setText('f1', '# Not followed\n'));
    await page.waitForTimeout(1500);
    expect(await getSource(page)).toBe('# Hello from disk\n');
  });

  test('after a reload the file asks for access again, then keeps syncing', async ({ page }) => {
    await openLinkedFile(page);
    await page.evaluate(() => window.__fakeFs.setPermission('f1', 'prompt'));
    await page.reload();
    const allow = page.getByRole('button', { name: 'Allow access to the file again' });
    await expect(allow).toBeVisible();
    await page.evaluate(() => window.__fakeFs.setText('f1', '# Changed while locked\n'));
    await page.waitForTimeout(1500);
    expect(await getSource(page)).toBe('# Hello from disk\n');
    await allow.click();
    await expect(allow).toBeHidden();
    await expect.poll(() => getSource(page), { timeout: 3000 }).toBe('# Changed while locked\n');
  });

  test('opening a folder links talk.md and resolves relative images', async ({ page }) => {
    await page.goto('/?test');
    await page.evaluate((png) => {
      window.__fakeFs.createDir('d1', 'talk', {
        'talk.md': '# Folder deck\n\n![chart](./img/chart.png)\n',
        'img/chart.png': { base64: png },
      });
      window.__fakeFs.pickDir('d1');
    }, TINY_PNG);
    await page.getByRole('button', { name: 'Open folder' }).click();
    await expect(badge(page)).toContainText('talk.md');
    await expect(page.locator('.us-stage', { hasText: 'Folder deck' })).toHaveCount(1);
    await expect(page.locator('.us-stage img')).toHaveCount(1);
    await expect(page.locator('.us-missing')).toHaveCount(0);
  });

  test('a folder with several .md files asks which one', async ({ page }) => {
    await page.goto('/?test');
    await page.evaluate(() => {
      window.__fakeFs.createDir('d2', 'many', { 'a.md': '# Alpha deck\n', 'b.md': '# Beta deck\n' });
      window.__fakeFs.pickDir('d2');
    });
    await page.getByRole('button', { name: 'Open folder' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'a.md' })).toBeVisible();
    await dialog.getByRole('button', { name: 'b.md' }).click();
    await expect(page.locator('.us-stage', { hasText: 'Beta deck' })).toHaveCount(1);
    await expect(badge(page)).toContainText('b.md');
  });

  test('a folder with no .md file says so', async ({ page }) => {
    await page.goto('/?test');
    await page.evaluate(() => {
      window.__fakeFs.createDir('d3', 'empty', { 'notes.txt': 'hi' });
      window.__fakeFs.pickDir('d3');
    });
    await page.getByRole('button', { name: 'Open folder' }).click();
    await expect(page.getByText('No .md file in this folder')).toBeVisible();
  });

  test('a folder deck asks for folder access again after a reload', async ({ page }) => {
    await page.goto('/?test');
    await page.evaluate((png) => {
      window.__fakeFs.createDir('d1', 'talk', {
        'talk.md': '# Folder deck\n\n![chart](./img/chart.png)\n',
        'img/chart.png': { base64: png },
      });
      window.__fakeFs.pickDir('d1');
    }, TINY_PNG);
    await page.getByRole('button', { name: 'Open folder' }).click();
    await expect(page.locator('.us-stage img')).toHaveCount(1);
    await page.evaluate(() => window.__fakeFs.setPermission('d1', 'prompt'));
    await page.reload();
    const allow = page.getByRole('button', { name: 'Allow access to the folder again' });
    await expect(allow).toBeVisible();
    await expect(page.locator('.us-missing')).toHaveCount(1);
    await allow.click();
    await expect(page.locator('.us-stage img')).toHaveCount(1);
    await expect(page.locator('.us-missing')).toHaveCount(0);
  });
});

/** Gets the deck into the state "changed in the app and on disk" without a race, by pausing sync first. */
async function bothChanged(page: Page) {
  await openLinkedFile(page);
  await page.evaluate(() => window.__fakeFs.setPermission('f1', 'prompt'));
  const allow = page.getByRole('button', { name: 'Allow access to the file again' });
  await expect(allow).toBeVisible({ timeout: 3000 });
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('mine');
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__fakeFs.setText('f1', '# From the file\n'));
  await allow.click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 3000 });
}

test('dropping a .md and an image together makes a deck that keeps its image', async ({ page }) => {
  const png = readFileSync('tests/fixtures/chart.png').toString('base64');
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await page.evaluate(async (b64) => {
    const dt = new DataTransfer();
    dt.items.add(new File(['# Dropped\n\n![chart](./chart.png)\n'], 'dropped.md', { type: 'text/markdown' }));
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    dt.items.add(new File([bytes], 'chart.png', { type: 'image/png' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, png);
  await expect(page.locator('.us-stage', { hasText: 'Dropped' })).toHaveCount(1);
  await expect(page.locator('.us-stage img')).toHaveCount(1);
  await expect(page.locator('.us-missing')).toHaveCount(0);
  await expect(badge(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.us-stage img')).toHaveCount(1);
  await expect(page.locator('.us-missing')).toHaveCount(0);
});

test('without showOpenFilePicker, Open uses a file input and the deck is not linked', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).showOpenFilePicker;
  });
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await (await chooser).setFiles({
    name: 'plain.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# From an input\n'),
  });
  await expect(page.locator('.us-stage', { hasText: 'From an input' })).toHaveCount(1);
  await expect(badge(page)).toHaveCount(0);
});
