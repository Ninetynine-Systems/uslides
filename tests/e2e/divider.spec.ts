import { expect, test, type Locator, type Page } from '@playwright/test';

const divider = (page: Page) => page.getByRole('separator', { name: 'Resize editor' });
const editorPane = (page: Page) => page.locator('.editor-pane');
const previewPane = (page: Page) => page.locator('.preview-pane');

async function openApp(page: Page) {
  await page.goto('/?test');
  await expect(page.locator('.us-stage')).toHaveCount(4);
  await expect(divider(page)).toBeVisible();
}

async function widthOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Pane is not visible');
  return box.width;
}

async function dragDivider(page: Page, clientX: number) {
  const box = await divider(page).boundingBox();
  if (!box) throw new Error('Divider is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(clientX, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
}

test.use({ viewport: { width: 1280, height: 720 } });

test('dragging the divider changes the editor width', async ({ page }) => {
  await openApp(page);
  const before = await widthOf(editorPane(page));
  const slideBefore = await widthOf(page.locator('.us-stage').first());
  const workspace = await page.locator('.workspace').boundingBox();
  if (!workspace) throw new Error('Workspace is not visible');

  await dragDivider(page, workspace.x + workspace.width * 0.65);

  expect(await widthOf(editorPane(page))).toBeGreaterThan(before + 100);
  await expect.poll(() => widthOf(page.locator('.us-stage').first())).toBeLessThan(slideBefore - 100);
});

test('the dragged width survives a reload', async ({ page }) => {
  await openApp(page);
  const workspace = await page.locator('.workspace').boundingBox();
  if (!workspace) throw new Error('Workspace is not visible');
  await dragDivider(page, workspace.x + workspace.width * 0.62);
  const savedWidth = await widthOf(editorPane(page));

  expect(await page.evaluate(() => localStorage.getItem('uslides.layout.editorFraction'))).not.toBeNull();
  await page.reload();
  await expect(divider(page)).toBeVisible();

  expect(Math.abs((await widthOf(editorPane(page))) - savedWidth)).toBeLessThanOrEqual(2);
});

test('double-clicking the divider resets the panes to half', async ({ page }) => {
  await openApp(page);
  await divider(page).focus();
  await page.keyboard.press('End');
  expect(Math.abs((await widthOf(editorPane(page))) - (await widthOf(previewPane(page))))).toBeGreaterThan(100);

  await divider(page).dblclick();

  expect(Math.abs((await widthOf(editorPane(page))) - (await widthOf(previewPane(page))))).toBeLessThanOrEqual(2);
  await expect(divider(page)).toHaveAttribute('aria-valuenow', '50');
});

test('arrow, Shift+arrow, Home, End, and Enter update the separator value', async ({ page }) => {
  await openApp(page);
  const handle = divider(page);
  await handle.focus();

  await page.keyboard.press('ArrowRight');
  await expect(handle).toHaveAttribute('aria-valuenow', '52');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(handle).toHaveAttribute('aria-valuenow', '42');
  await page.keyboard.press('Home');
  await expect(handle).toHaveAttribute('aria-valuenow', await handle.getAttribute('aria-valuemin') ?? 'missing');
  await page.keyboard.press('End');
  await expect(handle).toHaveAttribute('aria-valuenow', await handle.getAttribute('aria-valuemax') ?? 'missing');
  await page.keyboard.press('Enter');
  await expect(handle).toHaveAttribute('aria-valuenow', '50');
});

test('both panes keep their minimum width at the drag limits', async ({ page }) => {
  await openApp(page);
  const workspace = await page.locator('.workspace').boundingBox();
  if (!workspace) throw new Error('Workspace is not visible');

  await dragDivider(page, workspace.x - 1000);
  expect(await widthOf(editorPane(page))).toBeGreaterThanOrEqual(280);
  expect(await widthOf(previewPane(page))).toBeGreaterThanOrEqual(280);

  await dragDivider(page, workspace.x + workspace.width + 1000);
  expect(await widthOf(editorPane(page))).toBeGreaterThanOrEqual(280);
  expect(await widthOf(previewPane(page))).toBeGreaterThanOrEqual(280);
});

test('the divider is absent below 768px', async ({ page }) => {
  await page.setViewportSize({ width: 767, height: 720 });
  await page.goto('/?test');
  await expect(page.locator('.us-stage').first()).toBeVisible();

  await expect(divider(page)).toHaveCount(0);
  await expect(editorPane(page)).toBeHidden();
});
