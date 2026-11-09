import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { MIN_FONT_PX } from "../../src/config";

const fixture = (name: string) =>
  readFileSync(`tests/fixtures/${name}`, "utf8");
const fontSize = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector(".us-box")!).fontSize),
  );

test("the test hook is absent without ?test", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("main");
  expect(await page.evaluate(() => "__uslides" in window)).toBe(false);
});

test.describe("with the test hook", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?test");
    await page.waitForFunction(() => "__uslides" in window);
  });

  test("a crowded box shrinks to the minimum size and reports overflow", async ({
    page,
  }) => {
    const bullets = Array.from(
      { length: 40 },
      (_, i) => `- point number ${i + 1}`,
    ).join("\n");
    const md = `::: box col=1 row=1\n${bullets}\n:::`;
    const base = await page.evaluate(() => {
      window.__uslides!.render("::: box col=1 row=1\nshort\n:::");
      return parseFloat(
        getComputedStyle(document.querySelector(".us-box")!).fontSize,
      );
    });
    const results = await page.evaluate((m) => window.__uslides!.render(m), md);
    expect(results[0]).toEqual([{ boxIndex: 0, overflow: true }]);
    const size = await fontSize(page);
    expect(size).toBeGreaterThanOrEqual(MIN_FONT_PX);
    expect(size).toBeLessThan(base);
  });

  test("a short line is left alone", async ({ page }) => {
    const md = "::: box col=1-6 row=1-3\nOne short line\n:::";
    const results = await page.evaluate((m) => window.__uslides!.render(m), md);
    expect(results[0]).toEqual([{ boxIndex: 0, overflow: false }]);
    const scale = await page.evaluate(() =>
      (document.querySelector(".us-box") as HTMLElement).style.getPropertyValue(
        "--us-scale",
      ),
    );
    expect(scale === "" || scale === "1").toBe(true);
  });

  test("boxes.md matches the stored screenshot", async ({ page }) => {
    await page.route("**/images.unsplash.com/**", (route) =>
      route.fulfill({
        path: "tests/fixtures/chart.png",
        contentType: "image/png",
      }),
    );
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.evaluate(
      (m) => window.__uslides!.render(m),
      fixture("boxes.md"),
    );
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".us-stage img")].every(
        (i) => (i as HTMLImageElement).complete,
      ),
    );
    const stage = page.locator(".us-stage").nth(1);
    await expect(stage).toHaveScreenshot("boxes-slide2.png", {
      maxDiffPixelRatio: 0.02,
    });
  });
});
