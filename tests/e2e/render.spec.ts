import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { MIN_FONT_PX } from "../../src/config";

const fixture = (name: string) =>
  readFileSync(`tests/fixtures/${name}`, "utf8");
const fontSize = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector("#us-test .us-box")!).fontSize),
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
        getComputedStyle(document.querySelector("#us-test .us-box")!).fontSize,
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
      (document.querySelector("#us-test .us-box") as HTMLElement).style.getPropertyValue(
        "--us-scale",
      ),
    );
    expect(scale === "" || scale === "1").toBe(true);
  });

  test("a long code block shrinks the text and reports overflow", async ({
    page,
  }) => {
    const code = Array.from({ length: 30 }, (_, i) => `line_${i + 1}();`).join(
      "\n",
    );
    const md = `::: box col=1 row=1\n\`\`\`js\n${code}\n\`\`\`\n:::`;
    const results = await page.evaluate((m) => window.__uslides!.render(m), md);
    expect(results[0]).toEqual([{ boxIndex: 0, overflow: true }]);
    const size = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector("#us-test .us-box")!).fontSize),
    );
    expect(size).toBeGreaterThanOrEqual(MIN_FONT_PX);
    expect(size).toBeLessThan(32);
  });

  test("loose text gets a result with a null box index", async ({ page }) => {
    const results = await page.evaluate(
      (m) => window.__uslides!.render(m),
      "# Title\n\nSome text",
    );
    expect(results[0]).toEqual([{ boxIndex: null, overflow: false }]);
  });

  test("boxes.md boxes sit where the grid puts them", async ({ page }) => {
    await page.route("**/images.unsplash.com/**", (route) =>
      route.fulfill({
        path: "tests/fixtures/chart.png",
        contentType: "image/png",
      }),
    );
    await page.evaluate(
      (m) => window.__uslides!.render(m),
      fixture("boxes.md"),
    );
    const g = await page.evaluate(() => {
      const stage = document.querySelectorAll("#us-test .us-stage")[1] as HTMLElement;
      const s = stage.getBoundingClientRect();
      return [...stage.querySelectorAll<HTMLElement>(".us-box")].map((b) => {
        const r = b.getBoundingClientRect();
        return {
          x: r.left - s.left,
          y: r.top - s.top,
          w: r.width,
          h: r.height,
          z: Number(b.style.zIndex),
        };
      });
    });
    const cw = 1920 / 12;
    const rh = 1080 / 6;
    const near = (a: number, b: number) =>
      expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
    // box 0: col 1-12, row 1
    near(g[0]!.x, 0);
    near(g[0]!.w, 1920);
    near(g[0]!.y, 0);
    near(g[0]!.h, rh);
    // box 1: col 1-7, row 2-6
    near(g[1]!.x, 0);
    near(g[1]!.w, 7 * cw);
    near(g[1]!.y, rh);
    near(g[1]!.h, 5 * rh);
    // box 2: col 8-12, row 2-6 (the image)
    near(g[2]!.x, 7 * cw);
    near(g[2]!.w, 5 * cw);
    // box 3: col 9-12, row 6, drawn on top of the image box
    near(g[3]!.x, 8 * cw);
    near(g[3]!.y, 5 * rh);
    near(g[3]!.h, rh);
    expect(g[3]!.z).toBeGreaterThan(Math.max(g[0]!.z, g[1]!.z, g[2]!.z));
    expect(g[3]!.y).toBeLessThan(g[2]!.y + g[2]!.h);
    expect(g[3]!.x).toBeLessThan(g[2]!.x + g[2]!.w);
  });

  test("boxes.md matches the stored screenshot", async ({ page }) => {
    test.skip(
      !!process.env.CI,
      "pixel baseline is macOS-only; fonts differ on CI",
    );
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
      [...document.querySelectorAll("#us-test .us-stage img")].every(
        (i) => (i as HTMLImageElement).complete,
      ),
    );
    const stage = page.locator("#us-test .us-stage").nth(1);
    await expect(stage).toHaveScreenshot("boxes-slide2.png", {
      maxDiffPixelRatio: 0.02,
    });
  });
});
