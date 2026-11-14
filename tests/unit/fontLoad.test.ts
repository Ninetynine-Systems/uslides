// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCatalog, type Family } from '../../src/fonts/catalog';
import { parseDeck } from '../../src/core/parse';
import { fontCssUrl, useDeckFonts, waitForFonts } from '../../src/fonts/load';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');

describe('font loading', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('link[data-uslides-font]').forEach((link) => link.remove());
    if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
    else Reflect.deleteProperty(document, 'fonts');
  });

  it('loads a deck font when the catalog finishes loading after the deck renders', async () => {
    const deck = parseDeck('::: box font=Lora\nHello\n:::\n');
    const container = document.createElement('div');
    const root = createRoot(container);
    const FontLoader = () => {
      useDeckFonts(deck, false);
      return null;
    };

    await act(async () => root.render(createElement(FontLoader)));
    expect(document.querySelector('link[data-uslides-font="Lora"]')).toBeNull();

    await act(async () => loadCatalog());

    const link = document.querySelector<HTMLLinkElement>('link[data-uslides-font="Lora"]');
    expect(link).not.toBeNull();
    expect(link?.crossOrigin).toBe('anonymous');
    await act(async () => root.unmount());
  });

  it('reports loading only when a deck family finished', async () => {
    await loadCatalog();
    const listeners = new Set<EventListenerOrEventListenerObject>();
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => listeners.add(listener),
        removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => listeners.delete(listener),
      },
    });
    const versions: number[] = [];
    const root = createRoot(document.createElement('div'));
    const deck = parseDeck('::: box font=Lora\nHello\n:::\n');
    const FontLoader = () => {
      versions.push(useDeckFonts(deck, false));
      return null;
    };
    const dispatch = (family: string) => {
      const event = { fontfaces: [{ family }] } as unknown as Event;
      for (const listener of listeners) {
        if (typeof listener === 'function') listener(event);
        else listener.handleEvent(event);
      }
    };

    await act(async () => root.render(createElement(FontLoader)));
    // The number also counts the font list arriving, so compare against where it starts.
    const start = versions.at(-1)!;
    await act(async () => dispatch('Other Font'));
    expect(versions.at(-1)).toBe(start);
    await act(async () => dispatch('"lOrA"'));
    expect(versions.at(-1)).toBe(start + 1);
    await act(async () => root.unmount());
  });

  it('fontCssUrl requests a family with one upright weight', () => {
    const family: Family = {
      name: 'Example Sans',
      group: 'sans-serif',
      weights: [400],
      italicWeights: [],
    };

    expect(fontCssUrl(family)).toBe(
      'https://fonts.googleapis.com/css2?family=Example+Sans:wght@400&display=swap',
    );
  });

  it('fontCssUrl requests a family with one italic-only weight', () => {
    const family: Family = {
      name: 'Example Script',
      group: 'handwriting',
      weights: [],
      italicWeights: [400],
    };

    expect(fontCssUrl(family)).toBe(
      'https://fonts.googleapis.com/css2?family=Example+Script:ital,wght@1,400&display=swap',
    );
  });

  it('fontCssUrl uses an italic weight that has no 400 style', () => {
    const family: Family = {
      name: 'Example Serif',
      group: 'serif',
      weights: [400],
      italicWeights: [300],
    };

    expect(fontCssUrl(family)).toBe(
      'https://fonts.googleapis.com/css2?family=Example+Serif:ital,wght@0,400;1,300&display=swap',
    );
  });

  it('fontCssUrl uses 700 when it is the only weight', () => {
    const family: Family = {
      name: 'Example Display',
      group: 'display',
      weights: [700],
      italicWeights: [700],
    };

    expect(fontCssUrl(family)).toBe(
      'https://fonts.googleapis.com/css2?family=Example+Display:ital,wght@0,700;1,700&display=swap',
    );
  });

  it('fontCssUrl keeps different upright and italic weights separate', () => {
    const family: Family = {
      name: 'Example Hand',
      group: 'handwriting',
      weights: [300, 700],
      italicWeights: [500, 600, 700],
    };

    expect(fontCssUrl(family)).toBe(
      'https://fonts.googleapis.com/css2?family=Example+Hand:ital,wght@0,300;0,700;1,500;1,700&display=swap',
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
