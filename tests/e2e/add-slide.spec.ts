import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const SAMPLE = readFileSync('src/app/sample.md', 'utf8');
const editor = (page: Page) => page.getByRole('textbox', { name: 'Deck source' });
const getSource = (page: Page) => page.evaluate(() => window.__uslides!.getSource());

async function openSample(page: Page) {
  await page.goto(`/?test#md=${encodeURIComponent(SAMPLE)}`);
  await expect(page.locator('.slide-card')).toHaveCount(4);
  await expect(editor(page)).toBeVisible();
}

test('adding a slide at the end shows it and typing replaces its title', async ({ page }) => {
  await openSample(page);

  await page.getByRole('button', { name: 'Add slide at the end', exact: true }).click();

  await expect(page.getByText('5 slides', { exact: true })).toBeVisible();
  const lastSlide = page.locator('.slide-card').nth(4);
  await expect(lastSlide.getByRole('heading', { name: 'New slide', exact: true })).toBeVisible();
  await expect(lastSlide).toBeInViewport();

  await page.keyboard.insertText('Roadmap');
  await expect(lastSlide.getByRole('heading', { name: 'Roadmap', exact: true })).toBeVisible();
});

test('adding from the preview bar inserts after the shown slide', async ({ page }) => {
  await openSample(page);
  await page.locator('.slide-frame').nth(1).click();

  await page.getByRole('button', { name: 'Add slide', exact: true }).click();

  await expect(page.getByText('5 slides', { exact: true })).toBeVisible();
  await expect(page.locator('.slide-card').nth(2)
    .getByRole('heading', { name: 'New slide', exact: true })).toBeVisible();
  await expect(page.locator('.slide-card').nth(3)).toContainText('Drag me');
});

test('adding a slide while renaming keeps both changes after reload', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: /^Rename deck:/ }).click();
  await page.getByRole('textbox', { name: 'Deck name' }).fill('Planning deck');
  const addSlide = page.getByRole('button', { name: 'Add slide', exact: true });

  await addSlide.evaluate((button) => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (!(button instanceof HTMLButtonElement)) throw new Error('Add slide is not a button');
    button.click();
  });

  await expect(page.locator('h1.toolbar-name')).toHaveText('Planning deck');
  await expect(page.getByText('5 slides', { exact: true })).toBeVisible();
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.locator('h1.toolbar-name')).toHaveText('Planning deck');
  await expect(page.getByText('5 slides', { exact: true })).toBeVisible();
});

test('one undo removes the inserted slide', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Add slide at the end', exact: true }).click();
  await expect(page.getByText('5 slides', { exact: true })).toBeVisible();

  await page.keyboard.press('ControlOrMeta+z');

  await expect(page.getByText('4 slides', { exact: true })).toBeVisible();
  await expect.poll(() => getSource(page)).toBe(SAMPLE);
});

test('adding in one-slide view shows the new slide', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'One slide', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Add slide at the end', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add slide', exact: true }).click();

  await expect(page.getByText('5 slides', { exact: true })).toBeVisible();
  await expect(page.locator('.one-slide')
    .getByRole('heading', { name: 'New slide', exact: true })).toBeVisible();
});

test('adding a slide commits text from an open box editor first', async ({ page }) => {
  await openSample(page);
  const leftBox = page.locator('.slide-card').nth(2).locator('.us-box').filter({ hasText: 'Drag me' });
  await leftBox.dblclick();
  const typingArea = page.getByRole('textbox', { name: 'Markdown on slide' });
  await expect(typingArea).toBeFocused();

  await page.keyboard.insertText('draft');
  await page.getByRole('button', { name: 'Add slide', exact: true }).click();

  await expect(page.getByText('5 slides', { exact: true })).toBeVisible();
  await expect(page.locator('.slide-card').nth(2)).toContainText('draft');
  await expect.poll(() => getSource(page)).toContain('draft');
});

test('add-slide buttons are there at 600 pixels wide', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto(`/?test#md=${encodeURIComponent(SAMPLE)}`);
  await expect(page.locator('.slide-card')).toHaveCount(4);

  await expect(page.getByRole('button', { name: 'Add slide', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add slide at the end', exact: true }).click();
  await expect(page.locator('.slide-card')).toHaveCount(5);
});
