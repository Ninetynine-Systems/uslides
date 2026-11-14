import type { Page } from '@playwright/test';

// A real 1x1 PNG.
export const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export const editor = (page: Page) => page.getByRole('textbox', { name: 'Deck source' });
export const getSource = (page: Page) => page.evaluate(() => window.__uslides!.getSource());
export async function toEnd(page: Page) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
}

/** Sends a paste event holding one image file into the editor. */
export async function pasteImage(page: Page, base64: string, type = 'image/png', pad = 600) {
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
