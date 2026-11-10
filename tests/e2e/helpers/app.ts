import { expect, type Page } from '@playwright/test';

export const BOX_DECK = '# Boxes\n\n::: box col=1-6 row=1-3\nChoose a font\n:::\n';

export async function openBoxDeck(page: Page, source = BOX_DECK): Promise<void> {
  await page.goto(`/?test#md=${encodeURIComponent(source)}`);
  await expect(page.locator('.slide-frame .us-stage')).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Deck source' })).toBeVisible();
}

export async function selectBox(page: Page, index = 0): Promise<void> {
  const box = page.locator(`.us-box[data-box="${index}"]`);
  const rect = await box.boundingBox();
  if (!rect) throw new Error(`Box ${index} is not visible`);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await expect(page.locator(`.us-selection[data-box="${index}"]`)).toBeVisible();
}

export async function renameDeck(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: /^Rename deck:/ }).click();
  const input = page.getByRole('textbox', { name: 'Deck name' });
  await input.fill(title);
  await input.press('Enter');
}

export async function moreMenu(page: Page, item: string): Promise<void> {
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('button', { name: item, exact: true }).click();
}
