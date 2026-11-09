import { expect, test, type Page } from '@playwright/test';

// Present, Print and Ctrl+Enter must use the text as it is now. The preview parses 150 ms after typing,
// so these tests type and act within a few milliseconds, inside that delay.


async function open(page: Page) {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await page.getByRole('textbox', { name: 'Deck source' }).click();
  await page.keyboard.press('ControlOrMeta+End');
}

test('Ctrl+Enter right after adding a slide presents the new slide', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const settle = () => new Promise<void>((r) => setTimeout(r, 0)); // one turn of the event loop, far under 150 ms
    document.execCommand('insertText', false, '\n\n---\n\n# Brand new slide');
    await settle();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('.present .us-stage')).toContainText('Brand new slide');
  expect(await page.evaluate(() => location.hash)).toMatch(/\/present\/5$/);
});

test('Present right after typing shows the new text at once', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const settle = () => new Promise<void>((r) => setTimeout(r, 0)); // one turn of the event loop, far under 150 ms
    document.execCommand('insertText', false, '\n\n---\n\n# Typed a moment ago');
    await settle();
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Present')!.click();
  });
  await expect(page.locator('.present')).toBeVisible();
  // End goes to the last slide, which only exists in the latest text.
  await page.keyboard.press('End');
  await expect(page.locator('.present .us-stage')).toContainText('Typed a moment ago');
});

test('Print right after typing lays out the new text', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const settle = () => new Promise<void>((r) => setTimeout(r, 0));
    (window as unknown as { printed: string }).printed = '';
    window.print = () => {
      (window as unknown as { printed: string }).printed = document.querySelector('.us-print')?.textContent ?? '';
    };
    document.execCommand('insertText', false, '\n\n---\n\n# Printed a moment ago');
    await settle();
    const byText = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === t)!;
    byText('Download').click();
    await settle(); // React draws the menu
    byText('Print / PDF').click();
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: string }).printed)).toContain('Printed a moment ago');
});
