// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Family } from '../../src/fonts/catalog';
import { fontCssUrl, waitForFonts } from '../../src/fonts/load';

describe('font loading', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fontCssUrl asks only for the styles a family has', () => {
    const upright: Family = {
      name: 'Example Sans',
      group: 'sans-serif',
      weights: [300, 600, 700],
      italic: false,
    };
    const italic: Family = {
      name: 'Example Serif',
      group: 'serif',
      weights: [400, 500],
      italic: true,
    };

    expect(fontCssUrl(upright)).toBe(
      'https://fonts.googleapis.com/css2?family=Example+Sans:wght@300;700&display=swap',
    );
    expect(fontCssUrl(italic)).toBe(
      'https://fonts.googleapis.com/css2?family=Example+Serif:ital,wght@0,400;1,400&display=swap',
    );
  });

  it('waitForFonts gives up after the limit', async () => {
    vi.useFakeTimers();
    const load = vi.fn(() => new Promise<FontFace[]>(() => undefined));
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load },
    });

    let finished = false;
    const waiting = waitForFonts(['Lora']).then(() => {
      finished = true;
    });
    await vi.advanceTimersByTimeAsync(2999);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await waiting;

    expect(finished).toBe(true);
    expect(load).toHaveBeenCalledWith('1em "Lora"');
  });
});
