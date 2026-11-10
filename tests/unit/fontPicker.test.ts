// @vitest-environment jsdom
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MockFamily = {
  name: string;
  group: 'serif' | 'sans-serif' | 'display' | 'handwriting' | 'monospace';
  weights: number[];
  italicWeights: number[];
};

const catalog = vi.hoisted(() => ({
  families: [] as MockFamily[],
  version: 0,
  rejects: false,
  listeners: new Set<() => void>(),
}));

vi.mock('../../src/fonts/catalog', () => ({
  allFamilies: () => [...catalog.families],
  getCatalogVersion: () => catalog.version,
  loadCatalog: () => catalog.rejects
    ? Promise.reject(new Error('catalog unavailable'))
    : Promise.resolve(),
  searchFamilies: (query: string, group?: MockFamily['group']) => catalog.families.filter((family) =>
    (!group || family.group === group) && family.name.toLowerCase().includes(query.toLowerCase())),
  subscribeCatalog: (listener: () => void) => {
    catalog.listeners.add(listener);
    return () => catalog.listeners.delete(listener);
  },
}));

import { FontPicker } from '../../src/app/FontPicker';

const family = (name: string): MockFamily => ({
  name,
  group: 'serif',
  weights: [400],
  italicWeights: [],
});

describe('FontPicker', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    catalog.families = [family('Alpha'), family('Beta'), family('Gamma')];
    catalog.version = 1;
    catalog.rejects = false;
    catalog.listeners.clear();
    document.head.querySelectorAll('[data-uslides-font-preview]').forEach((element) => element.remove());
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('keeps the active option valid when the catalog rows shrink', async () => {
    const onPick = vi.fn();
    await act(async () => root.render(createElement(FontPicker, {
      blocked: true,
      onPick,
      onClose: vi.fn(),
    })));
    const gamma = [...container.querySelectorAll<HTMLButtonElement>('[role="option"]')]
      .find((option) => option.textContent === 'Gamma')!;
    await act(async () => gamma.dispatchEvent(new MouseEvent('mousemove', { bubbles: true })));

    await act(async () => {
      catalog.families = [family('Alpha')];
      catalog.version += 1;
      for (const listener of catalog.listeners) listener();
    });

    const search = container.querySelector<HTMLInputElement>('input[aria-label="Search fonts"]')!;
    const activeId = search.getAttribute('aria-activedescendant');
    expect(activeId).not.toBeNull();
    expect(document.getElementById(activeId!)?.textContent).toBe('Alpha');

    await act(async () => search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(onPick).toHaveBeenCalledWith('Alpha');
  });

  it('reports a catalog failure and keeps Theme font usable', async () => {
    catalog.families = [];
    catalog.rejects = true;
    const onPick = vi.fn();
    await act(async () => root.render(createElement(FontPicker, {
      value: 'Lora',
      blocked: true,
      onPick,
      onClose: vi.fn(),
    })));

    expect(container.textContent).toContain('Could not load the font list.');
    const theme = [...container.querySelectorAll<HTMLButtonElement>('[role="option"]')]
      .find((option) => option.textContent === 'Theme font')!;
    await act(async () => theme.click());
    expect(onPick).toHaveBeenCalledWith(null);
  });

  it('uses an isolated family for each preview and requests it once', async () => {
    catalog.families = [family('Alpha')];
    const fetchPreview = vi.fn(async () => new Response(
      "@font-face { font-family: 'Alpha'; src: url(https://fonts.gstatic.com/l/font?kit=preview); }",
    ));
    vi.stubGlobal('fetch', fetchPreview);

    await act(async () => root.render(createElement(FontPicker, {
      value: 'Alpha',
      blocked: false,
      onPick: vi.fn(),
      onClose: vi.fn(),
    })));
    await vi.waitFor(() => expect(document.head.querySelector('style[data-uslides-font-preview="Alpha"]')).not.toBeNull());
    await act(async () => root.render(createElement(FontPicker, {
      value: 'Alpha',
      blocked: false,
      onPick: vi.fn(),
      onClose: vi.fn(),
    })));

    expect(fetchPreview).toHaveBeenCalledTimes(1);
    expect(fetchPreview).toHaveBeenCalledWith(expect.stringContaining('&text=Alpha'), { mode: 'cors' });
    expect(document.head.querySelector('style[data-uslides-font-preview="Alpha"]')!.textContent)
      .toContain("font-family: 'uslides-preview-Alpha'");
    const alpha = [...container.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((option) => option.textContent === 'Alpha')!;
    expect(alpha.style.fontFamily).toContain('uslides-preview-Alpha');
  });

  it('does not request blocked previews until Show previews is used', async () => {
    catalog.families = [family('Alpha')];
    const fetchPreview = vi.fn(async () => new Response("@font-face { font-family: 'Alpha'; }"));
    vi.stubGlobal('fetch', fetchPreview);
    await act(async () => root.render(createElement(FontPicker, {
      blocked: true,
      onPick: vi.fn(),
      onClose: vi.fn(),
    })));
    expect(fetchPreview).not.toHaveBeenCalled();

    await act(async () => container.querySelector<HTMLButtonElement>('.us-font-preview-choice button')!.click());
    await vi.waitFor(() => expect(fetchPreview).toHaveBeenCalledTimes(1));
  });
});
