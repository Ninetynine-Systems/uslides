import { expect, test } from '@playwright/test';
import { moreMenu } from './helpers/app';
import { TINY_PNG, editor, getSource, pasteImage, toEnd } from './helpers/images';

test('pasting a PNG folds into a chip, shows in the preview and is saved as a data uri', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await toEnd(page);
  await pasteImage(page, TINY_PNG);
  await expect(page.locator('.cm-image-chip')).toHaveText(/🖼 image · \d+ KB/);
  await expect.poll(() => getSource(page)).toContain('data:image/png;base64');
  expect(await getSource(page)).toContain('![image](data:image/png;base64,');
  await expect(page.locator('.us-stage img[src^="data:image/png"]')).toHaveCount(1);
  // The editor text still holds the whole data uri.
  const text = await editor(page).evaluate((el) => (el as HTMLElement).innerText);
  expect(text).not.toContain('iVBORw0KGgo');
});

test('copying across a chip copies the full data uri', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await toEnd(page);
  await pasteImage(page, TINY_PNG);
  await expect(page.locator('.cm-image-chip')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ControlOrMeta+c');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(await getSource(page));
  expect(copied).toContain('data:image/png;base64,iVBORw0KGgo');
  expect(copied.length).toBeGreaterThan(600);
});

test('an image over 5 MB is refused with a notice', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await toEnd(page);
  const before = await getSource(page);
  await pasteImage(page, TINY_PNG, 'image/png', 5 * 1024 * 1024);
  await expect(page.getByRole('status')).toContainText('This image is too large to embed (over 5 MB)');
  expect(await getSource(page)).toBe(before);
});

test('dropping an image on the editor inserts it and does not open a new deck', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  const items = page.getByRole('navigation', { name: 'Decks' }).getByRole('listitem');
  await expect(items).toHaveCount(1);
  await expect(editor(page)).toBeVisible();
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }));
    const target = document.querySelector('.cm-content')!;
    const r = target.getBoundingClientRect();
    const init = { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 };
    target.dispatchEvent(new DragEvent('dragenter', init));
    target.dispatchEvent(new DragEvent('drop', init));
  }, TINY_PNG);
  await expect.poll(() => getSource(page)).toContain('data:image/png;base64');
  await expect(items).toHaveCount(1);
  await expect(page.locator('.drop-overlay')).toHaveCount(0);
});

test('Pack images embeds a reachable web image and names the unreachable one', async ({ page }) => {
  await page.route('https://images.test/ok.png', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.concat([Buffer.from(TINY_PNG, 'base64'), Buffer.alloc(600)]) }),
  );
  await page.route('https://broken.test/**', (route) => route.abort());
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await toEnd(page);
  await page.keyboard.type('\n\n![good](https://images.test/ok.png)\n\n![bad](https://broken.test/nope.png)\n');
  await moreMenu(page, 'Pack images');
  await expect(page.getByRole('status')).toContainText('https://broken.test/nope.png');
  const source = await getSource(page);
  expect(source).toContain('![good](data:image/png;base64,');
  expect(source).toContain('![bad](https://broken.test/nope.png)');
  await expect(page.locator('.cm-image-chip')).toHaveCount(1);
});

test('Pack images is one undo step, separate from the typing before it', async ({ page }) => {
  await page.route('https://images.test/ok.png', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.concat([Buffer.from(TINY_PNG, 'base64'), Buffer.alloc(600)]),
    }),
  );
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await toEnd(page);
  await page.keyboard.type('\n\n![good](https://images.test/ok.png)\n');
  await moreMenu(page, 'Pack images'); // right after typing
  await expect(page.locator('.cm-image-chip')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.cm-image-chip')).toHaveCount(0);
  expect(await getSource(page)).toContain('![good](https://images.test/ok.png)');
});

test('pasting an image replaces the selected text', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await toEnd(page);
  await page.keyboard.type('\nreplace-me');
  await page.keyboard.press('Shift+Home');
  await pasteImage(page, TINY_PNG);
  await expect.poll(() => getSource(page)).toContain('![image](data:image/png;base64,');
  expect(await getSource(page)).not.toContain('replace-me');
});

test('text on the clipboard wins over an image that sits next to it (Word, Excel, Numbers)', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await toEnd(page);
  await page.keyboard.type('\n');
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.setData('text/plain', '- first point\n- second point');
    dt.items.add(new File([bytes], 'selection.png', { type: 'image/png' }));
    document
      .querySelector('.cm-content')!
      .dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, TINY_PNG);
  await expect.poll(() => getSource(page)).toContain('- first point\n- second point');
  expect(await getSource(page)).not.toContain('data:image');
  await expect(page.locator('.cm-image-chip')).toHaveCount(0);
});

test('an image with only empty text on the clipboard is still embedded', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await toEnd(page);
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const data = new Uint8Array(bytes.length + 600);
    data.set(bytes);
    const dt = new DataTransfer();
    dt.setData('text/plain', '  \n');
    dt.items.add(new File([data], 'shot.png', { type: 'image/png' }));
    document
      .querySelector('.cm-content')!
      .dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, TINY_PNG);
  await expect(page.locator('.cm-image-chip')).toHaveCount(1);
});

test('an image copied in Finder is embedded, even though its file name is on the clipboard as text', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await toEnd(page);
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const data = new Uint8Array(bytes.length + 600);
    data.set(bytes);
    const dt = new DataTransfer();
    dt.setData('text/plain', 'photo.png');
    dt.items.add(new File([data], 'photo.png', { type: 'image/png' }));
    document
      .querySelector('.cm-content')!
      .dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, TINY_PNG);
  await expect(page.locator('.cm-image-chip')).toHaveCount(1);
  expect(await getSource(page)).not.toContain('photo.png');
});
