import { expect, test, type Page } from '@playwright/test';

const DECK = '# One\n\n<!-- note: Say **hello** first. -->\n\n---\n\n# Two\n\n---\n\n# Three\n';
const slideIn = (page: Page) => page.evaluate(() => Number(/\/present(?:er)?\/(\d+)/.exec(location.hash)?.[1]));

async function openDeck(page: Page) {
  await page.goto(`/?test#md=${encodeURIComponent(DECK)}`);
  await expect(page.locator('.slide-frame .us-stage')).toHaveCount(3);
}

async function startPresenter(page: Page) {
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Notes and second screen' }).click();
  await page.getByRole('button', { name: 'Presenter view, with notes' }).click();
  const audience = await popup;
  await expect(page.getByRole('region', { name: /Presenter view/ })).toBeVisible();
  await expect(audience.locator('.present .us-stage')).toContainText('One');
  return audience;
}

test('the presenter view shows notes and the next slide, and the audience window follows it', async ({ page }) => {
  await openDeck(page);
  const audience = await startPresenter(page);
  const presenter = page.getByRole('region', { name: /Presenter view/ });

  await expect(presenter.getByRole('region', { name: 'Speaker notes' })).toContainText('Say hello first.');
  await expect(presenter.getByRole('region', { name: 'Next slide' }).locator('.us-stage')).toContainText('Two');
  await expect(presenter.getByText('Audience window is open')).toBeVisible();

  await page.keyboard.press('ArrowRight');
  await expect(presenter).toHaveAccessibleName('Presenter view, slide 2 of 3');
  await expect.poll(() => slideIn(audience)).toBe(2);
  await expect(presenter.getByText('No notes on this slide.')).toBeVisible();

  // Moving on in the audience window moves the presenter too.
  await audience.keyboard.press('ArrowRight');
  await expect(presenter).toHaveAccessibleName('Presenter view, slide 3 of 3');
  await expect(presenter.getByText('End of the deck')).toBeVisible();

  await presenter.getByRole('button', { name: 'Previous' }).click();
  await expect.poll(() => slideIn(audience)).toBe(2);

  // Ending the presenter view closes the audience window and returns to editing.
  const closed = audience.waitForEvent('close');
  await page.keyboard.press('Escape');
  await closed;
  await expect(presenter).toHaveCount(0);
  await expect(page.locator('.slide-frame .us-stage')).toHaveCount(3);
});

test('quick presses in the presenter view leave both windows on the same slide', async ({ page }) => {
  await openDeck(page);
  const audience = await startPresenter(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('region', { name: /Presenter view/ })).toHaveAccessibleName('Presenter view, slide 3 of 3');
  await expect.poll(() => slideIn(audience)).toBe(3);
  await page.waitForTimeout(300);
  expect(await slideIn(page)).toBe(3);
  expect(await slideIn(audience)).toBe(3);
});

test('the timer can be paused, and a closed audience window can be opened again', async ({ page }) => {
  await openDeck(page);
  const audience = await startPresenter(page);
  await page.getByRole('button', { name: 'Pause timer' }).click();
  await expect(page.getByRole('button', { name: 'Resume timer' })).toBeVisible();

  await audience.close();
  const again = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open audience window' }).click();
  const reopened = await again;
  await expect(reopened.locator('.present .us-stage')).toContainText('One');
});
