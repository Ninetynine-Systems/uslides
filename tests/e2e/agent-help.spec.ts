import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { moreMenu } from './helpers/app';

const SKILL = readFileSync('skill/uslides/SKILL.md', 'utf8');
const PROMPT = [
  'Make me a slide deck for uslides (https://uslides.ninetynine.systems).',
  'First read the instructions at https://uslides.ninetynine.systems/SKILL.md and follow them exactly.',
  'Then write the deck as one Markdown file, or give me a share link.',
  '',
  'The deck is about: [your topic]',
].join('\n');
const LOAD_FAILED = "Couldn't load the instructions. Check your connection and try again.";

const panel = (page: Page) => page.getByRole('dialog', { name: 'Use with an AI agent' });
const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect(page.locator('.us-stage').first()).toBeVisible();
  await page.evaluate(() => navigator.clipboard.writeText('untouched'));
});

test('the More menu opens the panel, and the menu closes', async ({ page }) => {
  await moreMenu(page, 'Use with an AI agent');
  await expect(panel(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'About uslides', exact: true })).toHaveCount(0);
  await expect(panel(page).getByRole('group', { name: 'Prompt for your assistant' })).toHaveText(PROMPT);
});

test('Copy prompt puts the prompt on the clipboard and says so', async ({ page }) => {
  await moreMenu(page, 'Use with an AI agent');
  await panel(page).getByRole('button', { name: 'Copy prompt' }).click();
  await expect(page.getByText('Prompt copied')).toBeVisible();
  expect(await clipboard(page)).toBe(PROMPT);
});

test('Copy full instructions puts the whole SKILL file on the clipboard', async ({ page }) => {
  await moreMenu(page, 'Use with an AI agent');
  await panel(page).getByRole('button', { name: 'Copy full instructions' }).click();
  await expect(page.getByText('Instructions copied')).toBeVisible();
  const copied = await clipboard(page);
  expect(copied).toBe(SKILL);
  expect(copied).toContain('# Writing decks for uslides');
  expect(copied).toContain('::: box');
});

test('a failed download is reported, and the next click tries again', async ({ page }) => {
  await page.route('**/SKILL.md', (route) => route.fulfill({ status: 500, body: 'no' }));
  await moreMenu(page, 'Use with an AI agent');
  const copy = panel(page).getByRole('button', { name: 'Copy full instructions' });
  await copy.click();
  await expect(panel(page).getByRole('alert')).toHaveText(LOAD_FAILED);
  expect(await clipboard(page)).toBe('untouched');

  // The prompt still copies while the instructions cannot be loaded.
  await panel(page).getByRole('button', { name: 'Copy prompt' }).click();
  await expect.poll(() => clipboard(page)).toBe(PROMPT);

  await page.unroute('**/SKILL.md');
  await copy.click();
  await expect.poll(() => clipboard(page)).toBe(SKILL);
  await expect(panel(page).getByRole('alert')).toHaveCount(0);
});

test('the app page served in place of the file counts as a failure', async ({ page }) => {
  await page.route('**/SKILL.md', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html></html>' }));
  await moreMenu(page, 'Use with an AI agent');
  await panel(page).getByRole('button', { name: 'Copy full instructions' }).click();
  await expect(panel(page).getByRole('alert')).toHaveText(LOAD_FAILED);
  expect(await clipboard(page)).toBe('untouched');
});

test('a click before the instructions have loaded still copies them', async ({ page }) => {
  await page.route('**/SKILL.md', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  await moreMenu(page, 'Use with an AI agent');
  await panel(page).getByRole('button', { name: 'Copy full instructions' }).click();
  await expect.poll(() => clipboard(page), { timeout: 5000 }).toBe(SKILL);
});

test('the download link saves the file as SKILL.md', async ({ page }) => {
  await moreMenu(page, 'Use with an AI agent');
  const link = panel(page).getByRole('link', { name: 'Download SKILL.md' });
  await expect(link).toHaveAttribute('href', '/SKILL.md');
  await expect(link).toHaveAttribute('download', 'SKILL.md');
});

test('Escape closes the panel and focus goes back to the More button', async ({ page }) => {
  await moreMenu(page, 'Use with an AI agent');
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'More', exact: true })).toBeFocused();
});

test('the About page leads to the panel and closes itself', async ({ page }) => {
  await moreMenu(page, 'About uslides');
  await page.getByRole('dialog', { name: 'About uslides' }).getByRole('button', { name: 'Use uslides with an AI agent' }).click();
  await expect(panel(page)).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'About uslides' })).toHaveCount(0);
});

test('on a phone the panel fits the screen and keeps its button labels', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await moreMenu(page, 'Use with an AI agent');
  await expect(panel(page).getByText('Copy full instructions')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await panel(page).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
});

test('the deck list menu opens the same panel', async ({ page }) => {
  const decks = page.getByRole('navigation', { name: 'Decks' });
  if (!(await decks.isVisible())) await page.getByRole('button', { name: 'Show decks', exact: true }).click();
  await decks.getByRole('button', { name: 'Menu', exact: true }).click();
  await decks.getByRole('button', { name: 'Use with an AI agent', exact: true }).click();
  await expect(panel(page)).toBeVisible();
});

test('on a phone the About page button keeps its full width and its words', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await moreMenu(page, 'About uslides');
  const about = page.getByRole('dialog', { name: 'About uslides' });
  const button = about.getByRole('button', { name: 'Use uslides with an AI agent' });
  const [dialogBox, buttonBox] = [await about.boundingBox(), await button.boundingBox()];
  expect(buttonBox!.width).toBeGreaterThan(dialogBox!.width * 0.7);
  // The words fit inside the button instead of spilling out of it.
  expect(await button.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});
