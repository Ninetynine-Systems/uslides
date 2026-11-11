import { describe, expect, it } from 'vitest';
import type { Edit, EditResult } from '../../src/core/edit';
import { parseDeck } from '../../src/core/parse';
import { deleteSlide, duplicateSlide, moveSlide, setSlideAttrs, setSlideGrid } from '../../src/core/slideEdit';

function apply(source: string, result: EditResult): string {
  return [...result.changes]
    .sort((a: Edit, b: Edit) => b.from - a.from)
    .reduce((text, change) => text.slice(0, change.from) + change.insert + text.slice(change.to), source);
}

const slide = (source: string, index: number) => parseDeck(source).slides[index]!;

describe('setSlideAttrs', () => {
  it('adds a settings line above the first line of a slide', () => {
    const source = '# A\n\n---\n\n# B\n';
    const next = apply(source, setSlideAttrs(source, slide(source, 1), { bg: '#fff4e6' }));
    expect(next).toBe('# A\n\n---\n\n<!-- slide bg=#fff4e6 -->\n\n# B\n');
    const deck = parseDeck(next);
    expect(deck.warnings).toEqual([]);
    expect(deck.slides[1]!.bg).toBe('#fff4e6');
  });

  it('changes a key, keeps the others, and removes the line when no keys are left', () => {
    const source = '<!-- slide bg=#000 color=white -->\n\n# A\n';
    const changed = apply(source, setSlideAttrs(source, slide(source, 0), { bg: '#123456' }));
    expect(changed).toBe('<!-- slide bg=#123456 color=white -->\n\n# A\n');
    const cleared = apply(changed, setSlideAttrs(changed, slide(changed, 0), { bg: null, color: null }));
    expect(cleared).toBe('# A\n');
  });

  it('refuses values that would break the comment', () => {
    const source = '# A\n';
    expect(setSlideAttrs(source, slide(source, 0), { bg: 'red -->' }).changes).toEqual([]);
  });

  it('gives an empty slide a settings line', () => {
    const source = '# A\n---\n\n---\n# C\n';
    const next = apply(source, setSlideAttrs(source, slide(source, 1), { color: 'white' }));
    expect(parseDeck(next).slides[1]!.color).toBe('white');
    expect(parseDeck(next).slides).toHaveLength(3);
  });
});

describe('setSlideGrid', () => {
  it('sets a finer grid and moves the boxes onto it, in one change set', () => {
    const source = '# A\n\n::: box col=1-6 row=2-6\nText\n:::\n';
    const next = apply(source, setSlideGrid(source, slide(source, 0), { cols: 12, rows: 6 }, { cols: 24, rows: 12 }));
    expect(next).toContain('<!-- slide grid=24x12 -->');
    expect(next).toContain('::: box col=1-12 row=3-12');
    expect(parseDeck(next).warnings).toEqual([]);
  });

  it('goes back to the deck grid by removing the key', () => {
    const source = '<!-- slide grid=24x12 -->\n\n::: box col=1-12 row=3-12\nText\n:::\n';
    const next = apply(source, setSlideGrid(source, slide(source, 0), { cols: 12, rows: 6 }, null));
    expect(next).toBe('::: box col=1-6 row=2-6\nText\n:::\n');
  });
});

describe('moveSlide', () => {
  const source = '---\ntitle: T\n---\n\n# A\n\n---\n\n<!-- slide bg=red -->\n\n# B\n\n---\n\n# C\n';

  it('swaps a slide with the one before it, moving its settings line too', () => {
    const result = moveSlide(source, parseDeck(source).slides, 1, -1);
    const next = apply(source, result);
    const titles = parseDeck(next).slides.map((s) => s.loose.trim());
    expect(titles).toEqual(['# B', '# A', '# C']);
    expect(parseDeck(next).slides[0]!.bg).toBe('red');
    expect(next.slice(result.select!)).toMatch(/^<!-- slide bg=red -->/);
  });

  it('swaps the last slide with the one before it without adding blank lines', () => {
    const result = moveSlide(source, parseDeck(source).slides, 1, 1);
    const next = apply(source, result);
    expect(parseDeck(next).slides.map((s) => s.loose.trim())).toEqual(['# A', '# C', '# B']);
    expect(next.endsWith('# B\n')).toBe(true);
    expect(next.slice(result.select!)).toMatch(/^<!-- slide bg=red -->/);
  });

  it('does nothing past either end', () => {
    const slides = parseDeck(source).slides;
    expect(moveSlide(source, slides, 0, -1).changes).toEqual([]);
    expect(moveSlide(source, slides, 2, 1).changes).toEqual([]);
  });
});

describe('duplicateSlide', () => {
  it('copies a middle slide right after it', () => {
    const source = '# A\n\n---\n\n# B\n';
    const result = duplicateSlide(source, slide(source, 0));
    const next = apply(source, result);
    expect(parseDeck(next).slides.map((s) => s.loose.trim())).toEqual(['# A', '# A', '# B']);
    expect(next.slice(result.select!)).toMatch(/^# A/);
  });

  it('copies the last slide at the end', () => {
    const source = '# A\n\n---\n\n# B\n';
    const result = duplicateSlide(source, slide(source, 1));
    const next = apply(source, result);
    expect(parseDeck(next).slides.map((s) => s.loose.trim())).toEqual(['# A', '# B', '# B']);
    expect(next.slice(result.select!)).toMatch(/^# B/);
  });
});

describe('deleteSlide', () => {
  const source = '# A\n\n---\n\n# B\n\n---\n\n# C\n';

  it('removes a slide and one separator', () => {
    const slides = parseDeck(source).slides;
    expect(apply(source, deleteSlide(source, slides, 0))).toBe('\n# B\n\n---\n\n# C\n');
    expect(parseDeck(apply(source, deleteSlide(source, slides, 1))).slides.map((s) => s.loose.trim())).toEqual(['# A', '# C']);
    expect(apply(source, deleteSlide(source, slides, 2))).toBe('# A\n\n---\n\n# B\n');
  });

  it('keeps the only slide', () => {
    expect(deleteSlide('# A\n', parseDeck('# A\n').slides, 0).changes).toEqual([]);
  });
});
