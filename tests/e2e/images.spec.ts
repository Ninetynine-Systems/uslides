import { expect, test, type Page } from '@playwright/test';

// A real 1x1 PNG.
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const editor = (page: Page) => page.getByRole('textbox', { name: 'Deck source' });
const getSource = (page: Page) => page.evaluate(() => window.__uslides!.getSource());

async function toEnd(page: Page) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
}

/** Sends a paste event holding one image file into the editor. */
async function pasteImage(page: Page, base64: string, type = 'image/png', pad = 600) {
  await page.evaluate(
    ({ base64, type, pad }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const data = new Uint8Array(bytes.length + pad);
      data.set(bytes);
      const dt = new DataTransfer();
      dt.items.add(new File([data], 'pasted.png', { type }));
      document
        .querySelector('.cm-content')!
        .dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    { base64, type, pad },
  );
}

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

test('typing stays fast with a 3 MB image in the deck, and the chip stays folded', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await toEnd(page);
  await pasteImage(page, TINY_PNG, 'image/png', 3 * 1024 * 1024);
  await expect(page.locator('.cm-image-chip')).toHaveText(/3\d{3} KB/);
  await expect(page.locator('.us-stage img[src^="data:image/png"]')).toHaveCount(1);
  await toEnd(page);
  await page.keyboard.press('Enter');
  const started = Date.now();
  await page.keyboard.type('x'.repeat(50));
  await expect.poll(() => getSource(page).then((s) => s.endsWith('x'.repeat(50)))).toBe(true);
  const ms = Date.now() - started;
  console.log(`typing 50 chars with a 3 MB image took ${ms} ms`);
  // Measured about 840 ms on the dev machine, where 42 ms is the cost of the same typing without the image.
  // The target is under 1 s; the limit here has headroom so a slow CI machine does not fail it by chance.
  expect(ms).toBeLessThan(1500);
  await expect(page.locator('.cm-image-chip')).toHaveCount(1);
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
  await page.getByRole('button', { name: 'Pack images' }).click();
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
  await page.getByRole('button', { name: 'Pack images' }).click(); // right after typing
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
