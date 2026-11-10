import type { Page } from '@playwright/test';

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
