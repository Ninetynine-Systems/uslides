import { test, expect } from '@playwright/test';

test('app loads', async ({ page }) => {
  await page.goto('/');
  expect(await page.title()).toBe('uslides');
});
